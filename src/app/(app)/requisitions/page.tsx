import { requirePageUser } from "@/lib/auth/viewer";
import { listRequisitions } from "@/server/requisitions";
import { getAccount } from "@/server/accounts";
import { loadListPage, type SearchParams } from "@/server/list-page";
import { activeUsers, listTaxonomy } from "@/server/admin";
import { Page, PageHeader } from "@/components/app/page-header";
import { RequisitionsTable } from "./requisitions-table";

export const metadata = { title: "Requisitions" };

export default async function RequisitionsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser();
  const { params, savedFilters, openNew, raw } = await loadListPage(user, "requisitions", searchParams);
  const presetAccountId = typeof raw.account === "string" && raw.account ? raw.account : undefined;
  const [result, users, taxonomy, presetAccount] = await Promise.all([
    listRequisitions(user, params),
    activeUsers(),
    listTaxonomy(),
    presetAccountId ? getAccount(user, presetAccountId).then((a) => ({ id: a.id, label: a.name })).catch(() => null) : null,
  ]);
  return (
    <Page wide>
      <PageHeader title="Requisitions" description="Customer demand: seats, dates, rates and the versioned requirements the matching engine runs against." />
      <RequisitionsTable
        result={result}
        params={params}
        savedFilters={savedFilters}
        users={users.map((u) => ({ value: u.id, label: u.name }))}
        roleFamilies={taxonomy.roleFamilies.map((f) => ({ value: f.id, label: f.name }))}
        openNew={openNew}
        presetAccount={presetAccount}
      />
    </Page>
  );
}
