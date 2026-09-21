import { requirePageUser } from "@/lib/auth/viewer";
import { listSubmissions, stageCounts } from "@/server/pipeline/submissions";
import { loadListPage, type SearchParams } from "@/server/list-page";
import { activeUsers } from "@/server/admin";
import { Page, PageHeader } from "@/components/app/page-header";
import { SubmissionsTable } from "./submissions-table";

export const metadata = { title: "Submissions" };

export default async function SubmissionsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser();
  const { params, savedFilters } = await loadListPage(user, "submissions", searchParams);
  const requisitionId = params.filters.requisition;
  const [result, users, counts] = await Promise.all([listSubmissions(user, params), activeUsers(), stageCounts(user, requisitionId || undefined)]);
  return (
    <Page wide>
      <PageHeader title="Submissions" description="One candidate on one requisition. Stage moves are gated: eligibility and sharing permission are re-checked at presentation and offer; accepting an offer reserves a seat." />
      <SubmissionsTable result={result} params={params} savedFilters={savedFilters} users={users.map((u) => ({ value: u.id, label: u.name }))} counts={counts} />
    </Page>
  );
}
