import { NextResponse } from "next/server";
import { beginGoogleLogin } from "@/lib/auth/google";
import { env } from "@/lib/env";
import { userFacingMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const url = await beginGoogleLogin();
    return NextResponse.redirect(url);
  } catch (error) {
    logger.error("auth.google.begin_failed", { error: String(error) });
    const target = new URL("/login", env.APP_URL);
    target.searchParams.set("error", userFacingMessage(error));
    return NextResponse.redirect(target);
  }
}
