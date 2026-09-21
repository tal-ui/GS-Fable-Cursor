import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { automationRules, automationRuns, candidates, type AutomationCondition, type automationTriggerEnum } from "@/db/schema";
import { logger } from "@/lib/logger";
import { createTask } from "./tasks";
import { notifyUser } from "./notifications";
import { getSettings } from "./settings";

export type AutomationTrigger = (typeof automationTriggerEnum.enumValues)[number];

export type DomainEvent = {
  trigger: AutomationTrigger;
  entityType: "submission" | "placement" | "message" | "task" | "candidate" | "requisition" | "skill_claim" | "system";
  entityId: string;
  /** Distinguishes repeated events on the same entity (e.g. "interested->presented", or a date). */
  eventKey: string;
  payload: Record<string, unknown>;
  actorId: string | null;
  context: {
    ownerId?: string | null;
    candidateId?: string | null;
    accountId?: string | null;
    requisitionId?: string | null;
    submissionId?: string | null;
    placementId?: string | null;
    messageId?: string | null;
    label?: string;
  };
  depth?: number;
};

const MAX_DEPTH = 2;

function matchesCondition(payload: Record<string, unknown>, c: AutomationCondition): boolean {
  const actual = payload[c.field];
  switch (c.operator) {
    case "equals":
      return String(actual) === String(c.value);
    case "not_equals":
      return String(actual) !== String(c.value);
    case "gte":
      return Number(actual) >= Number(c.value);
    case "lte":
      return Number(actual) <= Number(c.value);
    case "in":
      return Array.isArray(c.value) ? c.value.map(String).includes(String(actual)) : false;
    default:
      return false;
  }
}

function fill(template: string | undefined, fallback: string, event: DomainEvent): string {
  const source = { ...event.payload, label: event.context.label ?? "" } as Record<string, unknown>;
  return (template ?? fallback).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => String(source[key] ?? "")).trim() || fallback;
}

function linkFor(event: DomainEvent): string | undefined {
  const c = event.context;
  if (c.submissionId) return `/submissions/${c.submissionId}`;
  if (c.placementId) return `/placements/${c.placementId}`;
  if (c.requisitionId) return `/requisitions/${c.requisitionId}`;
  if (c.candidateId) return `/candidates/${c.candidateId}`;
  return undefined;
}

/**
 * Evaluates active automation rules for a domain event and executes their actions.
 * Idempotent: a (rule, trigger, entity, eventKey) tuple runs at most once. Depth-limited so
 * actions that themselves emit events can never loop.
 */
export async function emitEvent(event: DomainEvent): Promise<void> {
  const depth = event.depth ?? 0;
  if (depth > MAX_DEPTH) {
    logger.warn("automation.depth_exceeded", { trigger: event.trigger, entityId: event.entityId });
    return;
  }
  const db = await getDb();
  let rules: (typeof automationRules.$inferSelect)[] = [];
  try {
    rules = await db.select().from(automationRules).where(and(eq(automationRules.trigger, event.trigger), eq(automationRules.isActive, true), eq(automationRules.isDeleted, false)));
  } catch (error) {
    logger.error("automation.load_failed", { error: String(error) });
    return;
  }
  const settings = await getSettings();

  for (const rule of rules) {
    const dedupeKey = `${rule.id}:${event.trigger}:${event.entityId}:${event.eventKey}`;
    if (!rule.conditions.every((c) => matchesCondition(event.payload, c))) continue;
    const inserted = await db
      .insert(automationRuns)
      .values({ ruleId: rule.id, triggerEvent: event.trigger, entityType: event.entityType, entityId: event.entityId, dedupeKey, status: "skipped" })
      .onConflictDoNothing({ target: automationRuns.dedupeKey })
      .returning({ id: automationRuns.id });
    if (inserted.length === 0) continue;
    const runId = inserted[0]!.id;
    try {
      const details = await executeAction(rule, event, dedupeKey, settings.task_default_due_hours, depth);
      await db.update(automationRuns).set({ status: "succeeded", details }).where(eq(automationRuns.id, runId));
    } catch (error) {
      logger.error("automation.action_failed", { rule: rule.name, error: String(error) });
      await db.update(automationRuns).set({ status: "failed", error: String(error).slice(0, 500) }).where(eq(automationRuns.id, runId));
    }
  }
}

async function executeAction(
  rule: typeof automationRules.$inferSelect,
  event: DomainEvent,
  dedupeKey: string,
  defaultDueHours: number,
  depth: number,
): Promise<Record<string, unknown>> {
  const db = await getDb();
  const cfg = rule.actionConfig;
  const ctx = event.context;
  switch (rule.action) {
    case "create_task": {
      const task = await createTask(db, {
        title: fill(cfg.title, rule.name, event),
        description: rule.description ?? null,
        type: (cfg.taskType as typeof import("@/db/schema").tasks.$inferInsert.type) ?? "follow_up",
        priority: cfg.priority ?? "medium",
        dueAt: new Date(Date.now() + (cfg.dueInHours ?? defaultDueHours) * 3_600_000),
        ownerId: ctx.ownerId ?? null,
        candidateId: ctx.candidateId ?? null,
        accountId: ctx.accountId ?? null,
        requisitionId: ctx.requisitionId ?? null,
        submissionId: ctx.submissionId ?? null,
        placementId: ctx.placementId ?? null,
        messageId: ctx.messageId ?? null,
        dedupeKey,
        createdBy: event.actorId,
      });
      return { taskId: task?.id ?? null };
    }
    case "notify_owner": {
      await notifyUser(db, {
        userId: ctx.ownerId,
        type: "info",
        title: fill(cfg.notificationTitle ?? cfg.title, rule.name, event),
        link: linkFor(event),
      });
      return { notified: ctx.ownerId ?? null };
    }
    case "queue_message": {
      if (!ctx.candidateId || !cfg.templateName) return { skipped: "no candidate or template" };
      const { queueTemplateMessage } = await import("./messaging/outreach");
      const result = await queueTemplateMessage({
        candidateId: ctx.candidateId,
        submissionId: ctx.submissionId ?? null,
        templateName: cfg.templateName,
        actorId: event.actorId,
        sendKey: `auto:${dedupeKey}`,
        depth: depth + 1,
      });
      return { messageId: result.messageId, status: result.status };
    }
    case "update_candidate_status": {
      if (!ctx.candidateId || !cfg.candidateStatus) return { skipped: "no candidate or status" };
      await db
        .update(candidates)
        .set({ status: cfg.candidateStatus as typeof candidates.$inferSelect.status })
        .where(eq(candidates.id, ctx.candidateId));
      return { candidateId: ctx.candidateId, status: cfg.candidateStatus };
    }
    default:
      return { skipped: "unknown action" };
  }
}
