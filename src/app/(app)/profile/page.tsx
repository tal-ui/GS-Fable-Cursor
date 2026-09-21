import { requirePageUser } from "@/lib/auth/viewer";
import { getSessionContext } from "@/lib/auth/session";
import { listNotifications } from "@/server/notifications";
import { listSessions } from "@/server/profile";
import { listAllSavedFilters } from "@/server/saved-filters";
import { Page, PageHeader } from "@/components/app/page-header";
import { ProfileView } from "./profile-view";

export const metadata = { title: "My profile" };

export default async function ProfilePage() {
  const user = await requirePageUser();
  const ctx = await getSessionContext();
  const [sessions, filters, notifications] = await Promise.all([listSessions(user.id, ctx?.sessionId ?? null), listAllSavedFilters(user.id), listNotifications(user.id, 30)]);

  return (
    <Page>
      <PageHeader title="My profile" description="Your contact details, notification preferences, saved views and active sessions. Role and access are managed by a Super Admin." />
      <ProfileView
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          role: user.role,
          canVerify: user.canVerify,
          jobTitle: user.jobTitle,
          phone: user.phone,
          notificationPrefs: user.notificationPrefs,
          lastLoginAt: user.lastLoginAt,
          activatedAt: user.activatedAt,
          createdAt: user.createdAt,
        }}
        sessions={sessions}
        filters={filters.map((f) => ({ id: f.id, entity: f.entity, name: f.name, isDefault: f.isDefault, filters: f.filters }))}
        notifications={notifications.rows}
        unread={notifications.unread}
      />
    </Page>
  );
}
