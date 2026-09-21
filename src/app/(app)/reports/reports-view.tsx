"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ActivityIcon, BadgeCheckIcon, ClockIcon, DownloadIcon, GaugeIcon, ListChecksIcon, MessageSquareWarningIcon, TrendingUpIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "@/components/app/kpi-card";
import { BarSeries, DonutChart } from "@/components/app/charts";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { useViewer } from "@/components/shell/viewer-context";
import type { matchingQuality, pilotMetrics, sourceConversion, topAccounts, verificationReadiness } from "@/server/reports";
import { fmtDate, fmtPercent, humanize } from "@/lib/format";

type Pilot = Awaited<ReturnType<typeof pilotMetrics>>;
type Stage = { stage: string; label: string; count: number };
type Duration = { stage: string; avgHours: number; n: number };
type Month = { month: string; started: number; reserved: number; cancelled: number; completed: number };
type Status = { status: string; label: string; count: number };
type SourceRow = Awaited<ReturnType<typeof sourceConversion>>[number];
type AccountRow = Awaited<ReturnType<typeof topAccounts>>[number];
type Quality = Awaited<ReturnType<typeof matchingQuality>>;
type Verification = Awaited<ReturnType<typeof verificationReadiness>>;

export function ReportsView({ period, pilot, stages, durations, byMonth, byStatus, sources, accounts, quality, verification, generatedAt }: { period: number; pilot: Pilot; stages: Stage[]; durations: Duration[]; byMonth: Month[]; byStatus: Status[]; sources: SourceRow[]; accounts: AccountRow[]; quality: Quality; verification: Verification; generatedAt: string }) {
  const viewer = useViewer();
  const router = useRouter();
  const pathname = usePathname();

  const funnel = [
    { step: "Submitted", value: pilot.funnel.submitted },
    { step: "Presented", value: pilot.funnel.presented },
    { step: "Accepted", value: pilot.funnel.accepted },
    { step: "Started", value: pilot.funnel.started },
    { step: "Completed", value: pilot.funnel.completed },
  ];
  const rate = (a: number, b: number) => (b ? fmtPercent(a / b) : "—");
  const messagingTotal = pilot.messaging.sent + pilot.messaging.failed + pilot.messaging.manual + pilot.messaging.suppressed;

  const exportHref = React.useMemo(() => {
    const lines: string[][] = [
      ["metric", "value", "period_days"],
      ["request_to_shortlist_hours_median", String(pilot.requestToShortlistHours ?? ""), String(period)],
      ["shortlist_to_presentation_hours_median", String(pilot.shortlistToPresentationHours ?? ""), String(period)],
      ["presentation_to_start_rate", pilot.presentationToStartRate === null ? "" : String(pilot.presentationToStartRate / 100), String(period)],
      ["submitted", String(pilot.funnel.submitted), String(period)],
      ["presented", String(pilot.funnel.presented), String(period)],
      ["accepted", String(pilot.funnel.accepted), String(period)],
      ["started", String(pilot.funnel.started), String(period)],
      ["completed", String(pilot.funnel.completed), String(period)],
      ["overdue_tasks", String(pilot.overdueTasks), "now"],
      ["availability_fresh_rate", pilot.availabilityFreshness === null ? "" : String(pilot.availabilityFreshness / 100), "now"],
      ["weekly_active_recruiters", String(pilot.weeklyActiveRecruiters), "7"],
      ["messages_sent", String(pilot.messaging.sent), String(period)],
      ["messages_failed", String(pilot.messaging.failed), String(period)],
      ["messages_manual", String(pilot.messaging.manual), String(period)],
      ["messages_suppressed", String(pilot.messaging.suppressed), String(period)],
      ...stages.map((s) => [`pipeline_${s.stage}`, String(s.count), "now"]),
      ...sources.map((s) => [`source_${s.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_candidates`, String(s.candidates), "all"]),
      ...sources.map((s) => [`source_${s.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_started`, String(s.started), "all"]),
    ];
    const csv = lines.map((l) => l.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\r\n");
    return `data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${csv}`)}`;
  }, [pilot, stages, sources, period]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={String(period)} onValueChange={(v) => router.replace(`${pathname}?period=${v}`, { scroll: false })}>
          <TabsList>
            <TabsTrigger value="30">Last 30 days</TabsTrigger>
            <TabsTrigger value="60">Last 60 days</TabsTrigger>
            <TabsTrigger value="90">Last 90 days</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="text-xs text-muted-foreground">Scoped to the records you can see · generated {fmtDate(generatedAt, "HH:mm")}</span>
        {viewer.permissions.export ? (
          <Button variant="outline" size="sm" className="ml-auto" asChild>
            <a href={exportHref} download={`pilot-metrics-${period}d-${generatedAt.slice(0, 10)}.csv`}>
              <DownloadIcon data-icon="inline-start" />
              Export metrics CSV
            </a>
          </Button>
        ) : null}
      </div>

      <section className="space-y-3">
        <SectionTitle title={`Pilot metrics (${period} days)`} description="Time from a completed request to a recruiter-reviewed shortlist, shortlist-to-presentation, presentation-to-start conversion, overdue tasks, availability freshness and weekly active recruiters." />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <KpiCard label="Request → shortlist" value={pilot.requestToShortlistHours === null ? "—" : `${pilot.requestToShortlistHours} h`} hint="Median, requisition opened → first submission" icon={ClockIcon} />
          <KpiCard label="Shortlist → presented" value={pilot.shortlistToPresentationHours === null ? "—" : `${pilot.shortlistToPresentationHours} h`} hint="Median, submission created → presented" icon={TrendingUpIcon} />
          <KpiCard label="Presented → started" value={pilot.presentationToStartRate === null ? "—" : `${pilot.presentationToStartRate}%`} hint={`${pilot.funnel.started} started of ${pilot.funnel.presented} presented`} icon={GaugeIcon} />
          <KpiCard label="Overdue tasks" value={pilot.overdueTasks} hint="Open tasks past their due date" icon={ListChecksIcon} href="/work-queue?f_overdue=true" />
          <KpiCard label="Availability fresh" value={pilot.availabilityFreshness === null ? "—" : `${pilot.availabilityFreshness}%`} hint={`${pilot.freshnessCounts.fresh} of ${pilot.freshnessCounts.total} active candidates confirmed recently`} icon={BadgeCheckIcon} />
          <KpiCard label="Active recruiters (7d)" value={pilot.weeklyActiveRecruiters} hint="Staff who signed in this week" icon={UsersIcon} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Conversion funnel</CardTitle>
            <CardDescription>Submissions created in the period and how far they got. Each step counts once per submission.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[1fr_220px]">
            <BarSeries data={funnel} xKey="step" series={[{ key: "value", label: "Submissions" }]} height={220} />
            <dl className="grid content-start gap-2 text-sm">
              <Rate label="Submitted → presented" value={rate(pilot.funnel.presented, pilot.funnel.submitted)} />
              <Rate label="Presented → accepted" value={rate(pilot.funnel.accepted, pilot.funnel.presented)} />
              <Rate label="Accepted → started" value={rate(pilot.funnel.started, pilot.funnel.accepted)} />
              <Rate label="Started → completed" value={rate(pilot.funnel.completed, pilot.funnel.started)} />
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Outreach ({period} days)</CardTitle>
            <CardDescription>Outbound messages by outcome. Suppressed = no permission to contact.</CardDescription>
          </CardHeader>
          <CardContent>
            {messagingTotal === 0 ? (
              <EmptyState compact icon={MessageSquareWarningIcon} title="No outreach yet" className="border-dashed" />
            ) : (
              <DonutChart
                data={[
                  { name: "Sent / delivered", value: pilot.messaging.sent },
                  { name: "Failed", value: pilot.messaging.failed },
                  { name: "Manual task", value: pilot.messaging.manual },
                  { name: "Suppressed", value: pilot.messaging.suppressed },
                ].filter((d) => d.value > 0)}
                centerLabel="messages"
                height={220}
              />
            )}
            {pilot.messaging.failed ? (
              <p className="mt-2 text-xs text-danger-foreground">
                {pilot.messaging.failed} failed message{pilot.messaging.failed === 1 ? "" : "s"} —{" "}
                <Link href="/work-queue?f_type=message_failed" className="underline">
                  see the work queue
                </Link>
                .
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Open pipeline by stage</CardTitle>
            <CardDescription>Where every submission you can see sits right now.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarSeries data={stages.map((s) => ({ stage: humanize(s.stage), count: s.count }))} xKey="stage" series={[{ key: "count", label: "Submissions" }]} height={240} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Average time in stage</CardTitle>
            <CardDescription>Hours a submission spends in each stage before moving on (all history).</CardDescription>
          </CardHeader>
          <CardContent>
            <BarSeries data={durations.map((d) => ({ stage: humanize(d.stage), hours: d.avgHours, n: d.n }))} xKey="stage" series={[{ key: "hours", label: "Avg hours" }]} height={240} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Placements by planned start (12 months)</CardTitle>
            <CardDescription>Working, reserved, completed and cancelled/replaced seats per month.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarSeries data={byMonth} xKey="month" stacked series={[{ key: "started", label: "Working" }, { key: "reserved", label: "Reserved" }, { key: "completed", label: "Completed" }, { key: "cancelled", label: "Cancelled / replaced" }]} height={260} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Candidate pool</CardTitle>
            <CardDescription>By status, excluding merged duplicates.</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart data={byStatus.map((s) => ({ name: humanize(s.status), value: s.count }))} centerLabel="candidates" />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Source conversion</CardTitle>
            <CardDescription>Candidates attributed to each source and how many were presented, accepted and started. Review cost per placement only once commercial records are reliable.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {sources.length === 0 ? (
              <EmptyState compact icon={TrendingUpIcon} title="No sources yet" className="m-4 border-dashed" />
            ) : (
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Candidates</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Presented</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accepted</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Started</TableHead>
                    <TableHead className="pr-6 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cand. → started</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="pl-6">
                        <Link href="/sources" className="font-medium hover:underline">
                          {s.name}
                        </Link>
                        <span className="ml-2 text-xs text-muted-foreground">{humanize(s.type)}</span>
                        {!s.isActive ? <StatusBadge value="archived" className="ml-2" /> : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.candidates}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.presented}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.accepted}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.started}</TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">{s.candidates ? fmtPercent(s.started / s.candidates) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top accounts</CardTitle>
            <CardDescription>By total placements, with what is open now.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {accounts.length === 0 ? (
              <EmptyState compact icon={ActivityIcon} title="No accounts yet" className="m-4 border-dashed" />
            ) : (
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open reqs</TableHead>
                    <TableHead className="pr-6 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Working</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="pl-6">
                        <Link href={`/accounts/${a.id}`} className="font-medium hover:underline">
                          {a.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{a.openRequisitions}</TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">{a.activePlacements}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Matching quality (90 days)</CardTitle>
            <CardDescription>Recruiter decisions on suggestions, per ranking version. Compare versions on the same cases before changing weights.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {quality.length === 0 ? (
              <EmptyState compact icon={GaugeIcon} title="No matching feedback yet" description="Accepting, overriding or rejecting suggestions in the matching workspace records feedback here." className="m-4 border-dashed" />
            ) : (
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ranking version</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Decisions</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accepted</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Overridden</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rejected</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acceptance</TableHead>
                    <TableHead className="pr-6 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avg score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quality.map((q) => (
                    <TableRow key={q.rankingVersion}>
                      <TableCell className="pl-6 font-medium">{q.rankingVersion}</TableCell>
                      <TableCell className="text-right tabular-nums">{q.total}</TableCell>
                      <TableCell className="text-right tabular-nums">{q.accepted}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {q.overriddenInclude + q.overriddenExclude}
                        <span className="ml-1 text-xs text-muted-foreground">
                          (+{q.overriddenInclude} / −{q.overriddenExclude})
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{q.rejected}</TableCell>
                      <TableCell className="text-right tabular-nums">{q.acceptanceRate === null ? "—" : fmtPercent(q.acceptanceRate)}</TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">{q.avgScore === null ? "—" : q.avgScore.toFixed(1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Evidence readiness</CardTitle>
            <CardDescription>Skill claims across the active pool by verification status.</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart data={verification.byStatus.map((s) => ({ name: humanize(s.status), value: s.count }))} centerLabel="claims" height={200} />
            <p className="mt-2 text-xs text-muted-foreground">
              <span className={verification.expiringWithin60Days ? "font-medium text-warning-foreground" : ""}>{verification.expiringWithin60Days}</span> verified claim{verification.expiringWithin60Days === 1 ? "" : "s"} expire within 60 days.
            </p>
          </CardContent>
        </Card>
      </section>
    </>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function Rate({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
