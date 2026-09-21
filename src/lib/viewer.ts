import type { Permission } from "@/lib/auth/authorize";

/** Serialisable view of the signed-in user for client components. Derived from the server-side role matrix. */
export type Viewer = {
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "standard" | "read_only";
  canVerify: boolean;
  avatarUrl: string | null;
  jobTitle: string | null;
  permissions: Record<Permission, boolean>;
};

export const ROLE_LABEL: Record<Viewer["role"], string> = {
  super_admin: "Super Admin",
  standard: "Standard",
  read_only: "Read Only",
};
