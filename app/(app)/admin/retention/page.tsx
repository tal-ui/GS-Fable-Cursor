import { requireAdminPage } from "@/lib/auth/viewer";
import { recentErasures, retentionQueue, retentionStats } from "@/server/retention";
import { getSettings } from "@/server/settings";
import { Page, PageHeader } from "@/components/app/page-header";
import { RetentionView } from "./retention-view";

export const metadata = { title: "Retention & erasure" };

export default async function AdminRetentionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage();
  const params = await searchParams;
  const queue = await retentionQueue();
  const [stats, erasures, settings] = await Promise.all([retentionStats(queue), recentErasures(), getSettings()]);

  return (
    <Page wide>
      <PageHeader
        title="Retention & erasure"
        description={`Profiles fall due for review after ${settings.candidate_retention_months} months without activity, or as soon as a candidate withdraws permission to process their profile. Erasure removes personal data, files and AI records while submissions, placements and headcount history stay intact.`}
      />
      <RetentionView
        queue={queue}
        stats={stats}
        erasures={erasures}
        policy={{ retentionMonths: settings.candidate_retention_months, graceDays: settings.retention_grace_days }}
        initialTab={typeof params.tab === "string" ? params.tab : "due"}
        focusCandidateId={typeof params.candidate === "string" ? params.candidate : null}
      />
    </Page>
  );
}
