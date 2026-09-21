import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/viewer";
import { isAppError } from "@/lib/errors";
import { getRequisitionDetail } from "@/server/requisitions";
import { contactsForAccount } from "@/server/accounts";
import { activeUsers, listTaxonomy } from "@/server/admin";
import { canEditRecord } from "@/server/scope";
import { can } from "@/lib/auth/authorize";
import { Page } from "@/components/app/page-header";
import { RequisitionDetailView } from "./requisition-detail";

export default async function RequisitionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  let detail;
  try {
    detail = await getRequisitionDetail(user, id);
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  }
  const [users, taxonomy, contacts, editable] = await Promise.all([activeUsers(), listTaxonomy(), contactsForAccount(detail.account.id), canEditRecord(user, detail.requisition.ownerId)]);

  return (
    <Page wide>
      <RequisitionDetailView
        detail={detail}
        users={users.map((u) => ({ value: u.id, label: u.name }))}
        roleFamilies={taxonomy.roleFamilies.map((f) => ({ value: f.id, label: f.name }))}
        contacts={contacts.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}${c.title ? ` · ${c.title}` : ""}` }))}
        canEdit={can(user, "write") && editable}
      />
    </Page>
  );
}
