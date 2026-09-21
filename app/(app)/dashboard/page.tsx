import Link from "next/link";
import { ActivityIcon, AlertTriangleIcon, BriefcaseIcon, CalendarClockIcon, ClipboardListIcon, FileSpreadsheetIcon, GitBranchIcon, HandshakeIcon, LayoutDashboardIcon, PlusIcon, UsersIcon, UserPlusIcon } from "lucide-react";
import { requirePageUser } from "@/lib/auth/viewer";
import { dashboardKpis, pipelineByStage, candidatesByStatus, placementsByMonth, pilotMetrics } from "@/server/reports";
import { recentActivities } from "@/server/activities";
import { workQueueSummary } from "@/server/tasks";
import { getSettings } from "@/server/settings";
import { upcomingInterviews } from "@/server/pipeline/interviews";
import { Page, PageHeader } from "@/components/app/page-header";
import { KpiCard } from "@/components/app/kpi-card";
import { BarSeries, DonutChart } from "@/components/app/charts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtDateTime, fmtRelative, humanize } from "@/lib/format";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { can } from "@/lib/auth/authorize";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser();
  const params = await searchParams;
  const settings = await getSettings();
  const [kpis, stages, byStatus, byMonth, pilot, activity, queue, interviews] = await Promise.all([
    dashboardKpis(user),
    pipelineByStage(user),
    candidatesByStatus(user),
    placementsByMonth(user, 6),
    pilotMetrics(user),
    recentActivities(user, 12),
    workQueueSummary(user, { submissionDays: settings.submission_stall_days, requisitionDays: settings.requisition_stall_days }),
    upcomingInterviews(user, 6),
  ]);
  const icons = { candidates: UsersIcon, requisitions: BriefcaseIcon, seats: ClipboardListIcon, presented: GitBranchIcon, starts: HandshakeIcon, active: ActivityIcon } as const;
  const canWrite = can(user, "write");
  const firstName = user.name.split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const attention = queue.overdueTasks + queue.failedMessages + queue.reviewSubmissions + queue.stalledRequisitions + queue.stalledSubmissions;

  return (
    <Page>
      {params.denied === "admin" ? (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
          <AlertTriangleIcon className="size-4" />
          The Setup area is restricted to Super Admins. This attempt has been logged.
        </div>
      ) : null}
      <PageHeader
        eyebrow={fmtDate(new Date(), "EEEE, d MMMM")}
        title={`${greeting}, ${firstName}`}
        description={attention ? `${attention} item${attention === 1 ? "" : "s"} need your attention in the work queue.` : "Your pipeline is clear — nothing overdue, stalled or failed."}
        actions={
          canWrite ? (
            <>
              <Button variant="outline" asChild>
                <Link href="/requisitions?new=1">
                  <BriefcaseIcon data-icon="inline-start" />
                  New requisition
                </Link>
              </Button>
              <Button asChild>
                <Link href="/candidates?new=1">
                  <UserPlusIcon data-icon="inline-start" />
                  Add candidate
                </Link>
              </Button>
            </>
          ) : null
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {kpis.map((k) => (
          <KpiCard key={k.key} label={k.label} value={k.value.toLocaleString()} delta={k.key === "seats" ? null : k.trend} hint={k.key === "seats" ? "across open requisitions" : undefined} icon={icons[k.key as keyof typeof icons]} />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pipeline by stage</CardTitle>
            <CardDescription>Open and closed submissions you can see, grouped by their current stage.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarSeries data={stages.map((s) => ({ stage: humanize(s.stage), count: s.count }))} xKey="stage" series={[{ key: "count", label: "Submissions" }]} height={240} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Candidate pool</CardTitle>
            <CardDescription>By status</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart data={byStatus.map((s) => ({ name: humanize(s.status), value: s.count }))} centerLabel="candidates" />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Placements by planned start</CardTitle>
            <CardDescription>Last six months: started, reserved, completed and cancelled seats.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarSeries data={byMonth} xKey="month" stacked series={[{ key: "started", label: "Working" }, { key: "reserved", label: "Reserved" }, { key: "completed", label: "Completed" }, { key: "cancelled", label: "Cancelled" }]} height={240} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pilot metrics (30 days)</CardTitle>
            <CardDescription>The numbers the first month is measured on.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <Metric label="Request → shortlist" value={pilot.requestToShortlistHours === null ? "—" : `${pilot.requestToShortlistHours} h`} />
            <Metric label="Shortlist → presented" value={pilot.shortlistToPresentationHours === null ? "—" : `${pilot.shortlistToPresentationHours} h`} />
            <Metric label="Presented → started" value={pilot.presentationToStartRate === null ? "—" : `${pilot.presentationToStartRate}%`} />
            <Metric label="Availability fresh" value={pilot.availabilityFreshness === null ? "—" : `${pilot.availabilityFreshness}%`} />
            <Metric label="Messages failed" value={String(pilot.messaging.failed)} tone={pilot.messaging.failed ? "danger" : undefined} />
            <Metric label="Active recruiters (7d)" value={String(pilot.weeklyActiveRecruiters)} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest notes, calls and system events across the workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <EmptyState compact icon={ActivityIcon} title="No activity yet" description="As candidates are added and submissions move, the feed fills up here." className="border-dashed" />
            ) : (
              <ul className="divide-y">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 py-2.5 text-sm">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {a.link ? (
                          <Link href={a.link} className="hover:underline">
                            {a.subject}
                          </Link>
                        ) : (
                          a.subject
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.actorName ?? "System"} · {a.entityLabel ? `${a.entityLabel} · ` : ""}
                        <span title={fmtDateTime(a.occurredAt)}>{fmtRelative(a.occurredAt)}</span>
                      </p>
                    </div>
                    <StatusBadge value={a.type} className="shrink-0" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
              <CardDescription>{canWrite ? "The things you do most." : "Read-only access: browse and export are available."}</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {canWrite ? (
                <>
                  <QuickAction href="/candidates?new=1" icon={UserPlusIcon} label="Add candidate" />
                  <QuickAction href="/requisitions?new=1" icon={PlusIcon} label="New requisition" />
                  <QuickAction href="/imports" icon={FileSpreadsheetIcon} label="Import CSV" />
                  <QuickAction href="/work-queue" icon={ClipboardListIcon} label="Work queue" badge={attention} />
                </>
              ) : (
                <>
                  <QuickAction href="/candidates" icon={UsersIcon} label="Browse candidates" />
                  <QuickAction href="/requisitions" icon={BriefcaseIcon} label="Requisitions" />
                  <QuickAction href="/placements" icon={HandshakeIcon} label="Placements" />
                  <QuickAction href="/reports" icon={LayoutDashboardIcon} label="Reports" />
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Upcoming interviews</CardTitle>
              <CardDescription>Next scheduled interviews and screening calls.</CardDescription>
            </CardHeader>
            <CardContent>
              {interviews.length === 0 ? (
                <EmptyState compact icon={CalendarClockIcon} title="Nothing scheduled" className="border-dashed" />
              ) : (
                <ul className="space-y-2 text-sm">
                  {interviews.map((i) => (
                    <li key={i.interview.id} className="flex items-center justify-between gap-2">
                      <Link href={`/submissions/${i.interview.submissionId}`} className="min-w-0 truncate hover:underline">
                        <span className="font-medium">{i.candidateName}</span>
                        <span className="text-muted-foreground"> · {i.requisitionTitle}</span>
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">{fmtDateTime(i.interview.scheduledAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </Page>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={tone === "danger" ? "text-lg font-semibold text-danger-foreground" : "text-lg font-semibold"}>{value}</p>
    </div>
  );
}

function QuickAction({ href, icon: Icon, label, badge }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string; badge?: number }) {
  return (
    <Link href={href} className="relative flex flex-col items-start gap-2 rounded-lg border bg-card p-3 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary-soft/40">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Icon className="size-4" />
      </span>
      {label}
      {badge ? <span className="absolute right-2 top-2 rounded-full bg-warning-soft px-1.5 text-[11px] font-semibold text-warning-foreground">{badge}</span> : null}
    </Link>
  );
}
