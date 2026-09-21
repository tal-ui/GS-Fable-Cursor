import { requireAdminPage } from "@/lib/auth/viewer";

/**
 * Every route under /admin/* is Super Admin only. Pages call requireAdminPage() again so a soft
 * navigation that reuses this layout still re-verifies the caller's role on the server.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
