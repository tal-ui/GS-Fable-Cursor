import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createTransport, type Transporter } from "nodemailer";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

export type OutboundMessage = {
  id: string;
  toAddress: string;
  subject: string | null;
  body: string;
  providerTemplateId: string | null;
  language: string;
  variables: Record<string, string> | null;
  sendKey: string;
};

export type SendResult = { providerMessageId: string | null };

export interface MessageAdapter {
  readonly channel: "whatsapp" | "email";
  isConfigured(): boolean;
  send(message: OutboundMessage): Promise<SendResult>;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.INTEGRATION_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** WhatsApp Business Cloud API. Business-initiated messages must use an approved template. */
export const whatsappAdapter: MessageAdapter = {
  channel: "whatsapp",
  isConfigured: () => env.whatsappEnabled,
  async send(message) {
    const to = message.toAddress.replace(/[^\d]/g, "");
    const payload = message.providerTemplateId
      ? {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: message.providerTemplateId,
            language: { code: message.language },
            components: message.variables
              ? [{ type: "body", parameters: Object.values(message.variables).map((text) => ({ type: "text", text })) }]
              : [],
          },
        }
      : { messaging_product: "whatsapp", to, type: "text", text: { body: message.body } };
    const res = await fetchWithTimeout(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new AppError("integration", `WhatsApp API ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { messages?: { id: string }[] };
    return { providerMessageId: data.messages?.[0]?.id ?? null };
  },
};

export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!env.WHATSAPP_APP_SECRET) return false;
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", env.WHATSAPP_APP_SECRET).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  return provided.length === expected.length && timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

let transporter: Transporter | null = null;

export const emailAdapter: MessageAdapter = {
  channel: "email",
  isConfigured: () => env.emailEnabled,
  async send(message) {
    if (!transporter) {
      transporter = createTransport({ url: env.SMTP_URL!, connectionTimeout: env.INTEGRATION_TIMEOUT_MS, socketTimeout: env.INTEGRATION_TIMEOUT_MS * 3 });
    }
    const info = await transporter.sendMail({
      from: env.EMAIL_FROM,
      to: message.toAddress,
      subject: message.subject ?? "Message from your recruiter",
      text: message.body,
      headers: { "X-Idempotency-Key": message.sendKey },
    });
    return { providerMessageId: info.messageId ?? null };
  },
};

export function adapterFor(channel: "whatsapp" | "email"): MessageAdapter {
  return channel === "whatsapp" ? whatsappAdapter : emailAdapter;
}
