import { requireAdminPage } from "@/lib/auth/viewer";
import { listArchived } from "@/server/archive";
import { Page, PageHeader } from "@/components/app/page-header";
import { ArchivedView } from "./archived-view";

export const metadata = { title: "Archived records" };

export default async function AdminArchivedPage() {
  const user = await requireAdminPage();
  const records = await listArchived(user);

  return (
    <Page wide>
      <PageHeader
        title="Archived records"
        description="Candidates and accounts that were archived by staff. Archiving hides a record from lists, search and matching but keeps every related submission, placement, activity and document; restoring puts it straight back. Erased profiles are handled separately under Retention & erasure."
      />
      <ArchivedView records={records} />
    </Page>
  );
}
