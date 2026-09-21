import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { createSession } from "@/lib/auth/session";
import { logSecurityEvent } from "@/lib/auth/authorize";
import { env } from "@/lib/env";
import { getRequestMeta } from "@/lib/request-context";
import { ensureBootstrapped } from "@/server/bootstrap";

/**
 * Local development sign-in: pick a seeded user. Disabled unless DEV_LOGIN_ENABLED
 * (default true only outside production). Google OAuth is the only production login.
 */
export async function POST(request: NextRequest) {
  if (!env.devLoginEnabled) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  const form = await request.formData();
  const userId = String(form.get("userId") ?? "");
  const db = await ensureBootstrapped();
  const user = userId ? await db.query.users.findFirst({ where: eq(users.id, userId) }) : undefined;
  if (!user || user.isDeleted) {
    return NextResponse.redirect(new URL("/login?error=Unknown%20user", env.APP_URL), { status: 303 });
  }
  const meta = await getRequestMeta();
  await createSession(user.id, meta);
  await logSecurityEvent({ userId: user.id, action: "login", statusCode: 200, details: { via: "dev_login" } });
  return NextResponse.redirect(new URL(user.status === "active" ? "/dashboard" : "/pending", env.APP_URL), { status: 303 });
}
