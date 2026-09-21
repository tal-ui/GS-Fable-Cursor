import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/viewer";
import { getImportBatch } from "@/server/imports";
import { isAppError } from "@/lib/errors";
import { getDb } from "@/db/client";
import { sources, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Page } from "@/components/app/page-header";
import { ImportBatchView } from "./import-batch-view";

export const metadata = { title: "Import batch" };

export default async function ImportBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  let batch;
  try {
    batch = await getImportBatch(user, id);
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  }
  const db = await getDb();
  const [source, creator] = await Promise.all([
    batch.sourceId ? db.query.sources.findFirst({ where: eq(sources.id, batch.sourceId), columns: { id: true, name: true } }) : null,
    batch.createdBy ? db.query.users.findFirst({ where: eq(users.id, batch.createdBy), columns: { name: true } }) : null,
  ]);

  return (
    <Page wide>
      <ImportBatchView
        batch={{
          id: batch.id,
          filename: batch.filename,
          status: batch.status,
          mapping: batch.mapping,
          rows: batch.rows.slice(0, 200),
          totalRows: batch.totalRows,
          importedRows: batch.importedRows,
          errorRows: batch.errorRows,
          duplicateRows: batch.duplicateRows,
          errors: batch.errors,
          duplicates: batch.duplicates,
          createdRecordCount: batch.createdRecordIds.length,
          createdAt: batch.createdAt,
          completedAt: batch.completedAt,
          rolledBackAt: batch.rolledBackAt,
          sourceId: source?.id ?? null,
          sourceName: source?.name ?? null,
          createdByName: creator?.name ?? null,
        }}
      />
    </Page>
  );
}
