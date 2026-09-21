import { NextResponse } from "next/server";
import { destroySession, getCurrentUser } from "@/lib/auth/session";
import { logSecurityEvent } from "@/lib/auth/authorize";
import { env } from "@/lib/env";

export async function POST() {
  const user = await getCurrentUser();
  await destroySession();
  if (user) await logSecurityEvent({ userId: user.id, action: "logout", statusCode: 200 });
  return NextResponse.redirect(new URL("/login", env.APP_URL), { status: 303 });
}
