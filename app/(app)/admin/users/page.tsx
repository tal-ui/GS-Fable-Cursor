import { requireAdminPage } from "@/lib/auth/viewer";
import { listUsers } from "@/server/admin";
import { Page, PageHeader } from "@/components/app/page-header";
import { UsersView } from "./users-view";

export const metadata = { title: "Users & roles" };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdminPage();
  const params = await searchParams;
  const rows = await listUsers();
  const initialStatus = typeof params.status === "string" ? params.status : "all";

  return (
    <Page>
      <PageHeader
        title="Users & roles"
        description="Sign-in is Google only. New sign-ins land as Pending until you activate them and assign a role. Three roles, enforced at the API and in the UI: Super Admin, Standard, Read Only."
      />
      <UsersView
        rows={rows.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          avatarUrl: u.avatarUrl,
          role: u.role,
          status: u.status,
          canVerify: u.canVerify,
          jobTitle: u.jobTitle,
          lastLoginAt: u.lastLoginAt,
          activatedAt: u.activatedAt,
          createdAt: u.createdAt,
          hasGoogle: Boolean(u.googleSub),
        }))}
        currentUserId={admin.id}
        initialStatus={initialStatus}
        openInvite={params.new === "1"}
      />
    </Page>
  );
}
