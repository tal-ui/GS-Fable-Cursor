import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/viewer";
import { isAppError } from "@/lib/errors";
import { can } from "@/lib/auth/authorize";
import { getAccountDetail } from "@/server/accounts";
import { activeUsers } from "@/server/admin";
import { canEditRecord } from "@/server/scope";
import { Page } from "@/components/app/page-header";
import { AccountDetailView } from "./account-detail";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  let detail;
  try {
    detail = await getAccountDetail(user, id);
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  }
  const [users, editable] = await Promise.all([activeUsers(), canEditRecord(user, detail.account.ownerId)]);
  return (
    <Page wide>
      <AccountDetailView detail={detail} users={users.map((u) => ({ value: u.id, label: u.name }))} canEdit={can(user, "write") && editable} />
    </Page>
  );
}
