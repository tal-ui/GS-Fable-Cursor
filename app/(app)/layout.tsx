import { cookies, headers } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { BreadcrumbProvider } from "@/components/shell/breadcrumbs";
import { Topbar } from "@/components/shell/topbar";
import { ViewerProvider } from "@/components/shell/viewer-context";
import { requireAdminPage, requirePageUser, toViewer } from "@/lib/auth/viewer";
import { listNotifications } from "@/server/notifications";
import { getSettings } from "@/server/settings";
import { workQueueSummary } from "@/server/tasks";
import { jobCounts } from "@/server/admin";
import { users } from "@/db/schema";
import { and, count, eq } from "drizzle-orm";
import { ensureBootstrapped } from "@/server/bootstrap";

// Every page in the app is rendered for one signed-in user, so nothing here can be prerendered.
// Declaring it keeps `next build` from ever opening the database or seeding it on a build machine.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Request APIs come first so a render outside a request (build, static analysis) bails out
  // before the database is touched.
  const invokePath = (await headers()).get("x-invoke-path") ?? "";
  const db = await ensureBootstrapped();
  // The Setup area is gated here, above the streaming boundary, so non-admins get a real 307 rather
  // than a client-side redirect. The /admin layout re-checks the role as defence in depth.
  const user = /^\/admin(\/|$)/.test(invokePath) ? await requireAdminPage() : await requirePageUser();
  const settings = await getSettings();
  const cookieStore = await cookies();
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  const [notifications, queue, jobs, pendingUsers] = await Promise.all([
    listNotifications(user.id, 15),
    workQueueSummary(user, { submissionDays: settings.submission_stall_days, requisitionDays: settings.requisition_stall_days }),
    user.role === "super_admin" ? jobCounts() : null,
    user.role === "super_admin" ? db.select({ n: count() }).from(users).where(and(eq(users.status, "pending"), eq(users.isDeleted, false))) : null,
  ]);

  const failedJobs = jobs ? (jobs.failed ?? 0) + (jobs.dead ?? 0) : 0;

  return (
    <ViewerProvider viewer={toViewer(user)}>
      <BreadcrumbProvider>
        <SidebarProvider defaultOpen={sidebarOpen}>
          <AppSidebar
            counts={{
              workQueue: queue.overdueTasks + queue.failedMessages + queue.reviewSubmissions + queue.stalledRequisitions,
              reviewSubmissions: queue.reviewSubmissions,
              pendingUsers: pendingUsers?.[0]?.n ?? 0,
              failedJobs,
            }}
          />
          <SidebarInset className="min-w-0">
            <Topbar notifications={notifications.rows} unread={notifications.unread} />
            <div className="flex-1">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </BreadcrumbProvider>
    </ViewerProvider>
  );
}
