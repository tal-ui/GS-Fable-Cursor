import { NextResponse, type NextRequest } from "next/server";
import { AppError, userFacingMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { acceptLinkUpload, resolveUploadLink } from "@/server/documents/upload-links";

/**
 * Public endpoint behind a secure upload link. No session: the token is the credential. The link
 * service enforces expiry, revocation, the file cap and the allowed kinds; the document service
 * enforces type, size, magic bytes and malware scanning. Per-IP rate limiting applies in the proxy;
 * a small per-token burst limit here stops a leaked link from being hammered.
 */

const TOKEN_BURST = 20;
const WINDOW_MS = 10 * 60_000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function throttled(token: string): boolean {
  const now = Date.now();
  const key = token.slice(0, 16);
  const bucket = attempts.get(key);
  if (!bucket || bucket.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (attempts.size > 10_000) for (const [k, b] of attempts) if (b.resetAt <= now) attempts.delete(k);
    return false;
  }
  bucket.count += 1;
  return bucket.count > TOKEN_BURST;
}

const noStore = { "cache-control": "private, no-store", "x-robots-tag": "noindex" };

export async function GET(_request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (throttled(token)) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: noStore });
  const link = await resolveUploadLink(token);
  if (!link) return NextResponse.json({ error: "This upload link is no longer valid." }, { status: 404, headers: noStore });
  return NextResponse.json({ candidateFirstName: link.candidateFirstName, kinds: link.kinds, purpose: link.purpose, remaining: link.remaining, expiresAt: link.expiresAt }, { headers: noStore });
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (throttled(token)) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: noStore });
  try {
    const form = await request.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") ?? "");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400, headers: noStore });
    const result = await acceptLinkUpload(token, file, kind);
    return NextResponse.json(result, { headers: noStore });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore });
    logger.error("upload_link.accept_failed", { error: String(error) });
    return NextResponse.json({ error: userFacingMessage(error) }, { status: 500, headers: noStore });
  }
}
