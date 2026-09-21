import "server-only";
import { redirect } from "next/navigation";
import { can, logSecurityEvent, type Permission } from "@/lib/auth/authorize";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import type { Viewer } from "@/lib/viewer";

const PERMISSIONS: Permission[] = ["read", "write", "export", "verify", "admin", "bulk"];

export function toViewer(user: CurrentUser): Viewer {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    canVerify: user.canVerify,
    avatarUrl: user.avatarUrl,
    jobTitle: user.jobTitle,
    permissions: Object.fromEntries(PERMISSIONS.map((p) => [p, can(user, p)])) as Record<Permission, boolean>,
  };
}

/** For pages: resolves the active user or redirects to the right public page. */
export async function requirePageUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status !== "active") redirect("/pending");
  return user;
}

export async function requireAdminPage(): Promise<CurrentUser> {
  const user = await requirePageUser();
  if (user.role !== "super_admin") {
    await logSecurityEvent({ userId: user.id, action: "denied:admin_route", resource: "admin", statusCode: 403 });
    redirect("/dashboard?denied=admin");
  }
  return user;
}
