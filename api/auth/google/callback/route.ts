import { NextResponse, type NextRequest } from "next/server";
import { completeGoogleLogin } from "@/lib/auth/google";
import { createSession } from "@/lib/auth/session";
import { logSecurityEvent } from "@/lib/auth/authorize";
import { env } from "@/lib/env";
import { userFacingMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getRequestMeta } from "@/lib/request-context";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const loginUrl = new URL("/login", env.APP_URL);
  if (!code || !state) {
    loginUrl.searchParams.set("error", "Google sign-in was cancelled.");
    return NextResponse.redirect(loginUrl);
  }
  try {
    const user = await completeGoogleLogin(code, state);
    const meta = await getRequestMeta();
    await createSession(user.id, meta);
    await logSecurityEvent({ userId: user.id, action: "login", statusCode: 200, details: { via: "google" } });
    return NextResponse.redirect(new URL(user.status === "active" ? "/dashboard" : "/pending", env.APP_URL));
  } catch (error) {
    logger.error("auth.google.callback_failed", { error: String(error) });
    loginUrl.searchParams.set("error", userFacingMessage(error));
    return NextResponse.redirect(loginUrl);
  }
}
