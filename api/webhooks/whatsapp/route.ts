import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { handleWhatsAppWebhook } from "@/server/messaging/outreach";

/** Meta verification handshake for the WhatsApp Cloud API. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (params.get("hub.mode") === "subscribe" && env.WHATSAPP_VERIFY_TOKEN && params.get("hub.verify_token") === env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

function verifySignature(rawBody: string, header: string | null): boolean {
  if (!env.WHATSAPP_APP_SECRET) return false;
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", env.WHATSAPP_APP_SECRET).update(rawBody).digest("hex");
  const provided = header.slice("sha256=".length);
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

/** Delivery statuses and inbound replies. Every event is stored once (by provider id) before processing. */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const signatureValid = verifySignature(raw, request.headers.get("x-hub-signature-256"));
  if (!signatureValid && env.isProd) {
    logger.warn("webhook.whatsapp.invalid_signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  try {
    const payload = JSON.parse(raw);
    const result = await handleWhatsAppWebhook(payload, signatureValid);
    return NextResponse.json(result);
  } catch (error) {
    logger.error("webhook.whatsapp.failed", { error: String(error) });
    return NextResponse.json({ error: "Unable to process webhook" }, { status: 400 });
  }
}
