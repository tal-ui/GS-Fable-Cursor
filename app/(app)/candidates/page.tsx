import { requirePageUser } from "@/lib/auth/viewer";
import { listCandidates } from "@/server/candidates/queries";
import { loadListPage, type SearchParams } from "@/server/list-page";
import { activeUsers } from "@/server/admin";
import { listSources } from "@/server/sources";
import { Page, PageHeader } from "@/components/app/page-header";
import { CandidatesTable } from "./candidates-table";

export const metadata = { title: "Candidates" };

export default async function CandidatesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser();
  const { params, savedFilters, openNew } = await loadListPage(user, "candidates", searchParams);
  const [result, users, sources] = await Promise.all([listCandidates(user, params), activeUsers(), listSources(true)]);

  return (
    <Page wide>
      <PageHeader title="Candidates" description="The searchable pool: skills, verification, work authorization, availability and consent in one place." />
      <CandidatesTable
        result={result}
        params={params}
        savedFilters={savedFilters}
        users={users.map((u) => ({ value: u.id, label: u.name }))}
        sources={sources.map((s) => ({ value: s.id, label: s.name }))}
        openNew={openNew}
      />
    </Page>
  );
}
