import { requirePageUser } from "@/lib/auth/viewer";
import { listAccounts } from "@/server/accounts";
import { loadListPage, type SearchParams } from "@/server/list-page";
import { activeUsers } from "@/server/admin";
import { Page, PageHeader } from "@/components/app/page-header";
import { AccountsTable } from "./accounts-table";

export const metadata = { title: "Accounts" };

export default async function AccountsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser();
  const { params, savedFilters, openNew } = await loadListPage(user, "accounts", searchParams);
  const [result, users] = await Promise.all([listAccounts(user, params), activeUsers()]);
  return (
    <Page wide>
      <PageHeader title="Accounts" description="Employers, agency partners and other organisations you work with, their contacts and commercial terms." />
      <AccountsTable result={result} params={params} savedFilters={savedFilters} users={users.map((u) => ({ value: u.id, label: u.name }))} openNew={openNew} />
    </Page>
  );
}
