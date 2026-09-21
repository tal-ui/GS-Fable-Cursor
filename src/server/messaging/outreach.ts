import "server-only";
import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { candidates, messageTemplates, messages, requisitions, submissions, users, webhookEvents } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { cleanText } from "@/lib/sanitize";
import { activeConsent } from "../consents";
import { enqueueJob } from "../jobs/queue";
import { createTask } from "../tasks";
import { notifyUser } from "../notifications";
import { logActivity } from "../activities";
import { adapterFor } from "./adapters";
import { getSettings } from "../settings";

export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}

type QueueInput = {
  candidateId: string;
  submissionId?: string | null;
  templateName?: string;
  templateId?: string;
  variables?: Record<string, string>;
  actorId: string | null;
  sendKey: string;
  preferredChannel?: "whatsapp" | "email";
  depth?: number;
};

export type QueueResult = { messageId: string | null; status: string; channel: string; note: string };

/**
 * Queues an approved outreach message to a candidate. WhatsApp first, email fallback, otherwise a
 * logged manual task. Permission to communicate is checked here and rechecked at send time.
 */
export async function queueTemplateMessage(input: QueueInput): Promise<QueueResult> {
  const db = await getDb();
  const candidate = await db.query.candidates.findFirst({ where: and(eq(candidates.id, input.candidateId), eq(candidates.isDeleted, false)) });
  if (!candidate) throw notFound("Candidate");

  const existing = await db.query.messages.findFirst({ where: eq(messages.sendKey, input.sendKey) });
  if (existing) return { messageId: existing.id, status: existing.status, channel: existing.channel, note: "Already queued" };

  const consent = await activeConsent(db, candidate.id, "communicate");
  const templateRows = input.templateId
    ? await db.select().from(messageTemplates).where(and(eq(messageTemplates.id, input.templateId), eq(messageTemplates.isDeleted, false)))
    : await db.select().from(messageTemplates).where(and(eq(messageTemplates.name, input.templateName ?? ""), eq(messageTemplates.status, "approved"), eq(messageTemplates.isDeleted, false)));
  if (templateRows.length === 0) throw new AppError("validation", "No approved template with that name.");

  const submission = input.submissionId ? await db.query.submissions.findFirst({ where: eq(submissions.id, input.submissionId) }) : null;
  const requisition = submission ? await db.query.requisitions.findFirst({ where: eq(requisitions.id, submission.requisitionId) }) : null;
  const owner = candidate.ownerId ? await db.query.users.findFirst({ where: eq(users.id, candidate.ownerId) }) : null;
  const vars: Record<string, string> = {
    first_name: candidate.firstName,
    last_name: candidate.lastName,
    role_title: requisition?.title ?? "",
    location: requisition ? [requisition.locationCity, requisition.locationCountry].filter(Boolean).join(", ") : "",
    start_date: requisition?.startDate ?? "",
    recruiter_name: owner?.name ?? "your recruiter",
    ...(input.variables ?? {}),
  };

  const whatsappTemplate = templateRows.find((t) => t.channel === "whatsapp");
  const emailTemplate = templateRows.find((t) => t.channel === "email");
  const preferWhatsApp = input.preferredChannel !== "email";
  const { whatsappAdapter, emailAdapter } = { whatsappAdapter: adapterFor("whatsapp"), emailAdapter: adapterFor("email") };

  let channel: "whatsapp" | "email" | "manual" = "manual";
  let template = whatsappTemplate ?? emailTemplate ?? templateRows[0]!;
  let toAddress = candidate.phone ?? candidate.email ?? "";
  if (preferWhatsApp && whatsappTemplate && candidate.phone && whatsappAdapter.isConfigured() && whatsappTemplate.status === "approved") {
    channel = "whatsapp";
    template = whatsappTemplate;
    toAddress = candidate.phone;
  } else if (emailTemplate && candidate.email && emailAdapter.isConfigured()) {
    channel = "email";
    template = emailTemplate;
    toAddress = candidate.email;
  }

  const body = renderTemplate(template.body, vars);
  const subject = template.subject ? renderTemplate(template.subject, vars) : null;

  if (!consent) {
    const [suppressed] = await db
      .insert(messages)
      .values({
        channel: channel === "manual" ? "manual" : channel,
        status: "suppressed",
        candidateId: candidate.id,
        submissionId: input.submissionId ?? null,
        templateId: template.id,
        toAddress: toAddress || "unknown",
        subject,
        body,
        variables: vars,
        sendKey: input.sendKey,
        errorMessage: "No active permission to communicate",
        createdBy: input.actorId,
      })
      .onConflictDoNothing({ target: messages.sendKey })
      .returning();
    return { messageId: suppressed?.id ?? null, status: "suppressed", channel, note: "Suppressed: candidate has not granted permission to be contacted." };
  }

  if (channel === "manual") {
    const [manual] = await db
      .insert(messages)
      .values({
        channel: "manual",
        status: "manual_pending",
        candidateId: candidate.id,
        submissionId: input.submissionId ?? null,
        templateId: template.id,
        toAddress: toAddress || "unknown",
        subject,
        body,
        variables: vars,
        sendKey: input.sendKey,
        consentId: consent.id,
        createdBy: input.actorId,
      })
      .onConflictDoNothing({ target: messages.sendKey })
      .returning();
    if (!manual) return { messageId: null, status: "manual_pending", channel, note: "Already queued" };
    const task = await createTask(db, {
      title: `Contact ${candidate.firstName} ${candidate.lastName} manually (${template.name})`,
      description: `Messaging provider not available. Send this message by phone or permitted channel:\n\n${body}`,
      type: "manual_contact",
      priority: "medium",
      dueAt: new Date(Date.now() + 24 * 3_600_000),
      ownerId: candidate.ownerId ?? input.actorId,
      candidateId: candidate.id,
      submissionId: input.submissionId ?? null,
      messageId: manual.id,
      dedupeKey: `manual:${input.sendKey}`,
      createdBy: input.actorId,
    });
    await db.update(messages).set({ fallbackTaskId: task?.id ?? null }).where(eq(messages.id, manual.id));
    return { messageId: manual.id, status: "manual_pending", channel, note: "No messaging provider configured — a manual contact task was created." };
  }

  const [queued] = await db
    .insert(messages)
    .values({
      channel,
      status: "queued",
      candidateId: candidate.id,
      submissionId: input.submissionId ?? null,
      templateId: template.id,
      toAddress,
      subject,
      body,
      variables: vars,
      sendKey: input.sendKey,
      consentId: consent.id,
      createdBy: input.actorId,
    })
    .onConflictDoNothing({ target: messages.sendKey })
    .returning();
  if (!queued) return { messageId: null, status: "queued", channel, note: "Already queued" };
  await enqueueJob(db, { type: `${channel}:send`, payload: { messageId: queued.id }, idempotencyKey: `send:${input.sendKey}`, ownerId: input.actorId });
  return { messageId: queued.id, status: "queued", channel, note: `Queued via ${channel}.` };
}

/** Job handler: sends one queued message. Re-checks suppression at send time. */
export async function sendQueuedMessage(messageId: string): Promise<Record<string, unknown>> {
  const db = await getDb();
  const message = await db.query.messages.findFirst({ where: eq(messages.id, messageId) });
  if (!message) return { skipped: "message missing" };
  if (message.status === "sent" || message.status === "delivered" || message.status === "read") return { skipped: "already sent" };
  if (message.channel === "manual") return { skipped: "manual channel" };

  if (message.candidateId) {
    const consent = await activeConsent(db, message.candidateId, "communicate");
    if (!consent) {
      await db.update(messages).set({ status: "suppressed", errorMessage: "Permission withdrawn before send" }).where(eq(messages.id, message.id));
      return { suppressed: true };
    }
  }
  const template = message.templateId ? await db.query.messageTemplates.findFirst({ where: eq(messageTemplates.id, message.templateId) }) : null;
  if (message.channel === "whatsapp" && template && !template.providerTemplateId) {
    const settings = await getSettings();
    const windowStart = new Date(Date.now() - settings.whatsapp_service_window_hours * 3_600_000);
    const inbound = message.candidateId
      ? await db.query.messages.findFirst({
          where: and(eq(messages.candidateId, message.candidateId), eq(messages.direction, "inbound"), eq(messages.channel, "whatsapp"), gt(messages.createdAt, windowStart)),
        })
      : null;
    if (!inbound) throw new AppError("validation", "Free-form WhatsApp messages are only allowed inside the 24h service window; use an approved template.");
  }

  const adapter = adapterFor(message.channel as "whatsapp" | "email");
  await db.update(messages).set({ attempts: message.attempts + 1 }).where(eq(messages.id, message.id));
  const result = await adapter.send({
    id: message.id,
    toAddress: message.toAddress,
    subject: message.subject,
    body: message.body,
    providerTemplateId: template?.providerTemplateId ?? null,
    language: template?.language ?? "en",
    variables: message.variables,
    sendKey: message.sendKey,
  });
  await db.update(messages).set({ status: "sent", sentAt: new Date(), providerMessageId: result.providerMessageId, errorMessage: null }).where(eq(messages.id, message.id));
  if (message.candidateId) {
    await logActivity(db, {
      type: message.channel === "whatsapp" ? "whatsapp" : "email",
      subject: `Sent ${message.channel} message`,
      body: message.body,
      candidateId: message.candidateId,
      submissionId: message.submissionId,
      actorId: message.createdBy,
    });
  }
  return { providerMessageId: result.providerMessageId };
}

/** Called when the send job is exhausted: mark failed, make it visible to an owner. */
export async function markMessageFailed(messageId: string, error: string): Promise<void> {
  const db = await getDb();
  const message = await db.query.messages.findFirst({ where: eq(messages.id, messageId) });
  if (!message) return;
  await db.update(messages).set({ status: "failed", failedAt: new Date(), errorMessage: error.slice(0, 500) }).where(eq(messages.id, message.id));
  const candidate = message.candidateId ? await db.query.candidates.findFirst({ where: eq(candidates.id, message.candidateId) }) : null;
  const ownerId = candidate?.ownerId ?? message.createdBy ?? null;
  const task = await createTask(db, {
    title: `Message to ${candidate ? `${candidate.firstName} ${candidate.lastName}` : message.toAddress} failed — contact manually`,
    description: `Channel ${message.channel} failed after ${message.attempts} attempts: ${error}\n\nMessage:\n${message.body}`,
    type: "message_failed",
    priority: "high",
    dueAt: new Date(Date.now() + 8 * 3_600_000),
    ownerId,
    candidateId: message.candidateId,
    submissionId: message.submissionId,
    messageId: message.id,
    dedupeKey: `failed:${message.sendKey}`,
    createdBy: null,
  });
  await db.update(messages).set({ fallbackTaskId: task?.id ?? message.fallbackTaskId }).where(eq(messages.id, message.id));
  await notifyUser(db, { userId: ownerId, type: "message", title: "Outreach message failed", body: error.slice(0, 140), link: `/work-queue` });
  const { emitEvent } = await import("../automations");
  await emitEvent({
    trigger: "message_failed",
    entityType: "message",
    entityId: message.id,
    eventKey: "failed",
    payload: { channel: message.channel, attempts: message.attempts },
    actorId: null,
    context: { ownerId, candidateId: message.candidateId, submissionId: message.submissionId, messageId: message.id },
  });
}

type WhatsAppWebhook = {
  entry?: {
    changes?: {
      value?: {
        statuses?: { id: string; status: string; timestamp: string; errors?: { title?: string; message?: string }[] }[];
        messages?: { id: string; from: string; timestamp: string; type: string; text?: { body: string } }[];
      };
    }[];
  }[];
};

/** Processes WhatsApp status and inbound events exactly once per provider event id. */
export async function handleWhatsAppWebhook(payload: WhatsAppWebhook, signatureValid: boolean): Promise<{ processed: number }> {
  const db = await getDb();
  let processed = 0;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      for (const status of value.statuses ?? []) {
        const eventId = `wa-status:${status.id}:${status.status}`;
        const inserted = await db
          .insert(webhookEvents)
          .values({ provider: "whatsapp", externalEventId: eventId, signatureValid, payload: status as unknown as Record<string, unknown> })
          .onConflictDoNothing({ target: webhookEvents.externalEventId })
          .returning({ id: webhookEvents.id });
        if (inserted.length === 0) continue;
        const patch: Partial<typeof messages.$inferInsert> =
          status.status === "delivered"
            ? { status: "delivered", deliveredAt: new Date() }
            : status.status === "read"
              ? { status: "read", readAt: new Date() }
              : status.status === "failed"
                ? { status: "failed", failedAt: new Date(), errorMessage: status.errors?.[0]?.message ?? status.errors?.[0]?.title ?? "Provider reported failure" }
                : {};
        if (Object.keys(patch).length) {
          const [updated] = await db.update(messages).set(patch).where(eq(messages.providerMessageId, status.id)).returning();
          if (updated && status.status === "failed") await markMessageFailed(updated.id, patch.errorMessage ?? "Provider failure");
        }
        await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, inserted[0]!.id));
        processed += 1;
      }
      for (const inbound of value.messages ?? []) {
        const eventId = `wa-in:${inbound.id}`;
        const inserted = await db
          .insert(webhookEvents)
          .values({ provider: "whatsapp", externalEventId: eventId, signatureValid, payload: inbound as unknown as Record<string, unknown> })
          .onConflictDoNothing({ target: webhookEvents.externalEventId })
          .returning({ id: webhookEvents.id });
        if (inserted.length === 0) continue;
        const digits = inbound.from.replace(/\D/g, "");
        const candidate = await db.query.candidates.findFirst({ where: and(eq(candidates.phoneNormalized, digits), eq(candidates.isDeleted, false)) });
        const text = cleanText(inbound.text?.body) ?? `[${inbound.type}]`;
        const [row] = await db
          .insert(messages)
          .values({
            channel: "whatsapp",
            direction: "inbound",
            status: "delivered",
            candidateId: candidate?.id ?? null,
            toAddress: inbound.from,
            body: text,
            sendKey: eventId,
            providerMessageId: inbound.id,
            deliveredAt: new Date(),
          })
          .onConflictDoNothing({ target: messages.sendKey })
          .returning();
        if (row && candidate) {
          const stop = /^\s*(stop|unsubscribe|הסר|עצור)\s*$/i.test(text);
          if (stop) {
            const { withdrawConsentByCandidate } = await import("../candidates/consents-actions");
            await withdrawConsentByCandidate(candidate.id, "communicate", "WhatsApp opt-out keyword");
          }
          await logActivity(db, { type: "whatsapp", subject: stop ? "Candidate opted out via WhatsApp" : "Inbound WhatsApp reply", body: text, candidateId: candidate.id, actorId: null });
          await createTask(db, {
            title: `Reply to ${candidate.firstName} ${candidate.lastName} (WhatsApp)`,
            description: text,
            type: "follow_up",
            priority: "medium",
            dueAt: new Date(Date.now() + 20 * 3_600_000),
            ownerId: candidate.ownerId,
            candidateId: candidate.id,
            messageId: row.id,
            dedupeKey: `reply:${eventId}`,
            createdBy: null,
          });
        }
        await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, inserted[0]!.id));
        processed += 1;
      }
    }
  }
  logger.info("whatsapp.webhook_processed", { processed, signatureValid });
  return { processed };
}

export async function recentMessagesFor(candidateId: string, limit = 20) {
  const db = await getDb();
  return db.select().from(messages).where(eq(messages.candidateId, candidateId)).orderBy(desc(messages.createdAt)).limit(limit);
}
