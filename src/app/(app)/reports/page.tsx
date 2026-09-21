import { requirePageUser } from "@/lib/auth/viewer";
import { candidatesByStatus, matchingQuality, pilotMetrics, pipelineByStage, placementsByMonth, sourceConversion, stageDurations, topAccounts, verificationReadiness } from "@/server/reports";
import { Page, PageHeader } from "@/components/app/page-header";
import { ReportsView } from "./reports-view";

export const metadata = { title: "Reports" };

const PERIODS = [30, 60, 90] as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser();
  const raw = await searchParams;
  const requested = Number(typeof raw.period === "string" ? raw.period : 30);
  const period = (PERIODS as readonly number[]).includes(requested) ? requested : 30;

  const [pilot, stages, durations, byMonth, byStatus, sources, accounts, quality, verification] = await Promise.all([
    pilotMetrics(user, period),
    pipelineByStage(user),
    stageDurations(user),
    placementsByMonth(user, 12),
    candidatesByStatus(user),
    sourceConversion(user),
    topAccounts(user, 8),
    matchingQuality(user, 90),
    verificationReadiness(user),
  ]);

  return (
    <Page wide>
      <PageHeader
        title="Reports"
        description="The numbers the pilot is measured on, with the agreed definitions: submitted = a submission created; presented = shared with the customer; accepted = offer accepted (seat reserved); started = actual start recorded; completed = placement closed as completed."
      />
      <ReportsView
        period={period}
        pilot={pilot}
        stages={stages}
        durations={durations}
        byMonth={byMonth}
        byStatus={byStatus}
        sources={sources}
        accounts={accounts}
        quality={quality}
        verification={verification}
        generatedAt={new Date().toISOString()}
      />
    </Page>
  );
}
