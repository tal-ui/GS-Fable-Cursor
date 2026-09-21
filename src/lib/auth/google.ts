import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLog, users } from "@/db/schema";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

const STATE_COOKIE = "scrm_oauth";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

function sign(value: string): string {
  return createHmac("sha256", env.SESSION_SECRET).update(value).digest("base64url");
}

function redirectUri(): string {
  return `${env.APP_URL}/api/auth/google/callback`;
}

/** Builds the Google authorization URL and stores a signed state + PKCE verifier in an HTTP-only cookie. */
export async function beginGoogleLogin(): Promise<string> {
  if (!env.googleOAuthEnabled) throw new AppError("validation", "Google sign-in is not configured.");
  const state = randomBytes(16).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const payload = `${state}.${verifier}`;
  const store = await cookies();
  store.set(STATE_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    path: "/",
    maxAge: 600,
  });
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "online",
    prompt: "select_account",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

type GoogleProfile = { sub: string; email: string; email_verified?: boolean; name?: string; picture?: string };

export async function completeGoogleLogin(code: string, state: string): Promise<typeof users.$inferSelect> {
  const store = await cookies();
  const raw = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);
  if (!raw) throw new AppError("validation", "Your sign-in session expired. Please try again.");
  const [savedState, verifier, signature] = raw.split(".");
  if (!savedState || !verifier || !signature) throw new AppError("validation", "Invalid sign-in state.");
  const expected = sign(`${savedState}.${verifier}`);
  const sigOk = signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!sigOk || savedState !== state) throw new AppError("validation", "Sign-in state did not match. Please try again.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.INTEGRATION_TIMEOUT_MS);
  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
      signal: controller.signal,
    });
    if (!tokenRes.ok) {
      logger.error("google.token_exchange_failed", { status: tokenRes.status });
      throw new AppError("integration", "Google did not accept the sign-in. Please try again.");
    }
    const tokens = (await tokenRes.json()) as { access_token: string };
    const profileRes = await fetch(USERINFO_URL, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
      signal: controller.signal,
    });
    if (!profileRes.ok) throw new AppError("integration", "Could not read your Google profile.");
    const profile = (await profileRes.json()) as GoogleProfile;
    if (!profile.email || profile.email_verified === false) {
      throw new AppError("validation", "Your Google account email is not verified.");
    }
    return upsertGoogleUser(profile);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * First login creates the user in `pending` status. A Super Admin must activate and assign a role.
 * Bootstrap exceptions: the very first user, or INITIAL_SUPER_ADMIN_EMAIL, become an active Super Admin.
 */
async function upsertGoogleUser(profile: GoogleProfile): Promise<typeof users.$inferSelect> {
  const db = await getDb();
  const email = profile.email.toLowerCase();
  const existing =
    (await db.query.users.findFirst({ where: eq(users.googleSub, profile.sub) })) ??
    (await db.query.users.findFirst({ where: eq(users.email, email) }));

  if (existing) {
    const [updated] = await db
      .update(users)
      .set({
        googleSub: existing.googleSub ?? profile.sub,
        name: existing.name || profile.name || email,
        avatarUrl: profile.picture ?? existing.avatarUrl,
      })
      .where(eq(users.id, existing.id))
      .returning();
    return updated!;
  }

  const anyUser = await db.select({ id: users.id }).from(users).limit(1);
  const isFirstUser = anyUser.length === 0;
  const bootstrapAdmin = isFirstUser || (env.INITIAL_SUPER_ADMIN_EMAIL?.toLowerCase() === email);
  const [created] = await db
    .insert(users)
    .values({
      email,
      name: profile.name || email,
      avatarUrl: profile.picture ?? null,
      googleSub: profile.sub,
      role: bootstrapAdmin ? "super_admin" : "standard",
      status: bootstrapAdmin ? "active" : "pending",
      activatedAt: bootstrapAdmin ? new Date() : null,
    })
    .returning();
  await db.insert(auditLog).values({
    entityType: "user",
    entityId: created!.id,
    action: "create",
    actorId: null,
    after: { email, status: created!.status, role: created!.role, via: "google_oauth" },
  });
  return created!;
}
