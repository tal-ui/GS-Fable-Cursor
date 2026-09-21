import { requirePageUser } from "@/lib/auth/viewer";
import { listImportBatches } from "@/server/imports";
import { listSources } from "@/server/sources";
import { Page, PageHeader } from "@/components/app/page-header";
import { ImportsView } from "./imports-view";

export const metadata = { title: "Imports" };

export default async function ImportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser();
  const raw = await searchParams;
  const [batches, sources] = await Promise.all([listImportBatches(user), listSources(true)]);
  return (
    <Page wide>
      <PageHeader title="Imports" description="Bring candidates in from spreadsheets. Every file is previewed first: rows are validated, likely duplicates are proposed for a decision, and nothing is written until you commit. Completed batches can be rolled back." />
      <ImportsView
        batches={batches.map((b) => ({
          id: b.batch.id,
          filename: b.batch.filename,
          status: b.batch.status,
          totalRows: b.batch.totalRows,
          importedRows: b.batch.importedRows,
          errorRows: b.batch.errorRows,
          duplicateRows: b.batch.duplicateRows,
          createdAt: b.batch.createdAt,
          completedAt: b.batch.completedAt,
          sourceName: b.sourceName,
          createdByName: b.createdByName,
        }))}
        sources={sources.map((s) => ({ value: s.id, label: `${s.name} (${s.type.replace(/_/g, " ")})` }))}
        openNew={raw.new === "1"}
      />
    </Page>
  );
}
