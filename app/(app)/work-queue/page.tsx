import { requirePageUser } from "@/lib/auth/viewer";
import { getTaskDetail, listTasks, workQueueItems, workQueueSummary, type TaskDetail } from "@/server/tasks";
import { loadListPage, type SearchParams } from "@/server/list-page";
import { activeUsers } from "@/server/admin";
import { getSettings } from "@/server/settings";
import { isAppError } from "@/lib/errors";
import { Page, PageHeader } from "@/components/app/page-header";
import { WorkQueueView } from "./work-queue-view";

export const metadata = { title: "Work queue" };

export default async function WorkQueuePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser();
  const settings = await getSettings();
  const stall = { submissionDays: settings.submission_stall_days, requisitionDays: settings.requisition_stall_days };
  const { raw, params, savedFilters, openNew } = await loadListPage(user, "work-queue", searchParams, { sort: "dueAt", dir: "asc" });
  const focusId = typeof raw.task === "string" ? raw.task : null;

  const [result, summary, items, users, focusTask] = await Promise.all([
    listTasks(user, params),
    workQueueSummary(user, stall),
    workQueueItems(user, stall),
    activeUsers(),
    focusId ? loadFocusTask(user, focusId) : Promise.resolve(null),
  ]);

  const view = typeof raw.view === "string" ? raw.view : "tasks";

  return (
    <Page wide>
      <PageHeader
        title="Work queue"
        description={`Everything that needs a person: tasks with owners and due dates, submissions with unknown eligibility, submissions stalled for ${stall.submissionDays}+ days, open requisitions with no movement for ${stall.requisitionDays}+ days, failed messages and placements about to start.`}
      />
      <WorkQueueView
        result={result}
        params={params}
        savedFilters={savedFilters}
        summary={summary}
        items={items}
        users={users.map((u) => ({ value: u.id, label: u.name }))}
        openNew={openNew}
        focusTask={focusTask}
        focusMissing={Boolean(focusId) && !focusTask}
        initialView={view}
      />
    </Page>
  );
}

async function loadFocusTask(user: Awaited<ReturnType<typeof requirePageUser>>, id: string): Promise<TaskDetail | null> {
  try {
    return await getTaskDetail(user, id);
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") return null;
    throw error;
  }
}
