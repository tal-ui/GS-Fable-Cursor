import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/viewer";
import { isAppError } from "@/lib/errors";
import { getSubmissionDetail } from "@/server/pipeline/submissions";
import { contactsForAccount } from "@/server/accounts";
import { activeUsers } from "@/server/admin";
import { canEditRecord } from "@/server/scope";
import { can } from "@/lib/auth/authorize";
import { Page } from "@/components/app/page-header";
import { SubmissionDetailView } from "./submission-detail";

export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  let detail;
  try {
    detail = await getSubmissionDetail(user, id);
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  }
  const [users, contacts, editable] = await Promise.all([activeUsers(), contactsForAccount(detail.accountId), canEditRecord(user, detail.submission.ownerId)]);
  return (
    <Page wide>
      <SubmissionDetailView
        detail={detail}
        users={users.map((u) => ({ value: u.id, label: u.name }))}
        contacts={contacts.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}${c.title ? ` · ${c.title}` : ""}`, receivesShortlists: c.receivesShortlists }))}
        canEdit={can(user, "write") && editable}
      />
    </Page>
  );
}
