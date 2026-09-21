import { requirePageUser } from "@/lib/auth/viewer";
import { listPlacements } from "@/server/pipeline/placements";
import { loadListPage, type SearchParams } from "@/server/list-page";
import { activeUsers } from "@/server/admin";
import { Page, PageHeader } from "@/components/app/page-header";
import { PlacementsTable } from "./placements-table";

export const metadata = { title: "Placements" };

export default async function PlacementsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser();
  const { params, savedFilters } = await loadListPage(user, "placements", searchParams, { sort: "plannedStart", dir: "desc" });
  const [result, users] = await Promise.all([listPlacements(user, params), activeUsers()]);
  return (
    <Page wide>
      <PageHeader title="Placements" description="Accepted assignments. A reserved seat becomes filled on the actual start; completion and cancellation release it and trigger an availability re-check." />
      <PlacementsTable result={result} params={params} savedFilters={savedFilters} users={users.map((u) => ({ value: u.id, label: u.name }))} />
    </Page>
  );
}
