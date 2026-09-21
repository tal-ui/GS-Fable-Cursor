import { requirePageUser } from "@/lib/auth/viewer";
import { listSources } from "@/server/sources";
import { sourceConversion } from "@/server/reports";
import { Page, PageHeader } from "@/components/app/page-header";
import { SourcesView } from "./sources-view";

export const metadata = { title: "Sources" };

export default async function SourcesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser();
  const raw = await searchParams;
  const [sources, conversion] = await Promise.all([listSources(), sourceConversion(user)]);
  const stats = new Map(conversion.map((c) => [c.id, c]));
  const rows = sources.map((s) => {
    const c = stats.get(s.id);
    return { source: s, candidates: c?.candidates ?? 0, events: c?.events ?? 0, presented: c?.presented ?? 0, accepted: c?.accepted ?? 0, started: c?.started ?? 0 };
  });
  return (
    <Page wide>
      <PageHeader title="Sources" description="Where candidates come from: agencies, referrals, job boards, imports. Every candidate carries a source event so conversion can be attributed." />
      <SourcesView rows={rows} openNew={raw.new === "1"} />
    </Page>
  );
}
