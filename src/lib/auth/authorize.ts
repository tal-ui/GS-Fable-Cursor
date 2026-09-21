import "server-only";
import { getDb } from "@/db/client";
import { securityAuditLog } from "@/db/schema";
import { forbiddenError, unauthorizedError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getRequestMeta } from "@/lib/request-context";
import { getCurrentUser, type CurrentUser } from "./session";

export type Permission = "read" | "write" | "export" | "verify" | "admin" | "bulk";

/**
 * Role capability matrix. UI and API both derive from this single definition.
 * - super_admin: everything
 * - standard: operate on records, export, bulk actions; verify only if designated reviewer
 * - read_only: read dashboards and records only
 */
export function can(user: Pick<CurrentUser, "role" | "canVerify" | "status">, permission: Permission): boolean {
  if (user.status !== "active") return false;
  switch (user.role) {
    case "super_admin":
      return true;
    case "standard":
      if (permission === "admin") return false;
      if (permission === "verify") return user.canVerify;
      return true;
    case "read_only":
      return permission === "read";
    default:
      return false;
  }
}

export async function logSecurityEvent(input: {
  userId: string | null;
  action: string;
  resource?: string;
  statusCode: number;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = await getDb();
    const meta = await getRequestMeta();
    await db.insert(securityAuditLog).values({
      userId: input.userId,
      action: input.action,
      resource: input.resource ?? null,
      path: meta.path,
      statusCode: input.statusCode,
      ip: meta.ip,
      userAgent: meta.userAgent,
      details: input.details ?? null,
    });
  } catch (error) {
    logger.error("security_audit.write_failed", { error: String(error) });
  }
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorizedError();
  if (user.status !== "active") {
    await logSecurityEvent({ userId: user.id, action: "access_inactive_account", statusCode: 403 });
    throw forbiddenError();
  }
  return user;
}

/** Verifies the caller holds `permission`; logs and throws 403 otherwise. */
export async function requirePermission(permission: Permission, resource?: string): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, permission)) {
    await logSecurityEvent({ userId: user.id, action: `denied:${permission}`, resource, statusCode: 403 });
    throw forbiddenError();
  }
  return user;
}

export const requireWrite = (resource?: string) => requirePermission("write", resource);
export const requireAdmin = (resource?: string) => requirePermission("admin", resource);
