import "server-only";
import { headers } from "next/headers";

export type RequestMeta = { ip: string | null; userAgent: string | null; path: string | null };

/** Best-effort request metadata for audit logging; safe to call from actions and route handlers. */
export async function getRequestMeta(): Promise<RequestMeta> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0]!.trim() : h.get("x-real-ip");
    return { ip: ip ?? null, userAgent: h.get("user-agent"), path: h.get("x-invoke-path") ?? h.get("referer") };
  } catch {
    return { ip: null, userAgent: null, path: null };
  }
}
