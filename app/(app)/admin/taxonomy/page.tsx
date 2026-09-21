import { requireAdminPage } from "@/lib/auth/viewer";
import { activeUsers, listTaxonomy } from "@/server/admin";
import { Page, PageHeader } from "@/components/app/page-header";
import { TaxonomyView } from "./taxonomy-view";

export const metadata = { title: "Skills taxonomy" };

export default async function AdminTaxonomyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage();
  const params = await searchParams;
  const [taxonomy, owners] = await Promise.all([listTaxonomy(), activeUsers()]);
  const tab = typeof params.tab === "string" ? params.tab : "skills";

  return (
    <Page wide>
      <PageHeader
        title="Skills taxonomy"
        description="One canonical list drives intake, CV extraction, requisition requirements and matching. Codes are stable identifiers; synonyms map free text and imports onto the canonical skill."
      />
      <TaxonomyView
        categories={taxonomy.categories.map((c) => ({ id: c.id, name: c.name, description: c.description, sortOrder: c.sortOrder }))}
        skills={taxonomy.skills.map((s) => ({
          id: s.skill.id,
          code: s.skill.code,
          name: s.skill.name,
          categoryId: s.skill.categoryId,
          categoryName: s.categoryName,
          description: s.skill.description,
          ownerId: s.skill.ownerId,
          ownerName: s.ownerName,
          isActive: s.skill.isActive,
          defaultValidityMonths: s.skill.defaultValidityMonths,
          synonyms: s.synonyms,
          claimCount: s.claimCount,
        }))}
        roleFamilies={taxonomy.roleFamilies.map((f) => ({ id: f.id, code: f.code, name: f.name, description: f.description, rankingWeights: f.rankingWeights, rankingVersion: f.rankingVersion, isActive: f.isActive }))}
        owners={owners.map((o) => ({ value: o.id, label: o.name }))}
        initialTab={tab}
      />
    </Page>
  );
}
