import Link from "next/link";
import { ArchiveIcon, ArchiveRestoreIcon, BotIcon, CheckCircle2Icon, ClipboardListIcon, DatabaseIcon, MessageSquareTextIcon, PlugZapIcon, ScrollTextIcon, ShieldAlertIcon, TagsIcon, UserSquare2Icon, WorkflowIcon, XCircleIcon } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/viewer";
import { env } from "@/lib/env";
import { adminOverview, listAutomationRules, listTemplates, recentAutomationRuns, securityLog } from "@/server/admin";
import { getSettings } from "@/server/settings";
import { archivedCount } from "@/server/archive";
import { retentionStats } from "@/server/retention";
import { Page, PageHeader } from "@/components/app/page-header";
import { KpiCard } from "@/components/app/kpi-card";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtRelative, humanize } from "@/lib/format";

export const metadata = { title: "Setup" };

const SECTIONS = [
  { href: "/admin/users", icon: UserSquare2Icon, title: "Users & roles", body: "Activate pending sign-ins, assign Super Admin / Standard / Read Only, designate verifiers." },
  { href: "/admin/taxonomy", icon: TagsIcon, title: "Skills taxonomy", body: "Skill categories, canonical skills with codes and synonyms, role families and ranking weights." },
  { href: "/admin/automations", icon: WorkflowIcon, title: "Automations", body: "Trigger → condition → action rules with loop guards; see every run and failure." },
  { href: "/admin/templates", icon: MessageSquareTextIcon, title: "Message templates", body: "Approved WhatsApp and email templates with variables. Business-initiated WhatsApp needs approval." },
  { href: "/admin/jobs", icon: DatabaseIcon, title: "Jobs & integrations", body: "Background queue, retries, integration error log and inbound webhooks." },
  { href: "/admin/logs", icon: ScrollTextIcon, title: "Audit logs", body: "Change history, security denials and every AI decision with its confidence." },
  { href: "/admin/retention", icon: ArchiveIcon, title: "Retention & erasure", body: "Profiles past the retention period or with withdrawn permission; documented holds and irreversible erasure." },
  { href: "/admin/archived", icon: ArchiveRestoreIcon, title: "Archived records", body: "Candidates and accounts archived by staff, with who did it and when; restore them without losing any history." },
  { href: "/admin/settings", icon: ClipboardListIcon, title: "Settings", body: "Sharing model, freshness and stall thresholds, default disclosure fields, retention policy." },
];

export default async function AdminOverviewPage() {
  await requireAdminPage();
  const [overview, rules, templates, runs, denials, settings, retention, archived] = await Promise.all([adminOverview(), listAutomationRules(), listTemplates(), recentAutomationRuns(8), securityLog(6), getSettings(), retentionStats(), archivedCount()]);

  const activeRules = rules.filter((r) => r.rule.isActive).length;
  const failingRules = rules.filter((r) => r.failures > 0).length;
  const approvedTemplates = templates.filter((t) => t.status === "approved").length;
  const deadJobs = (overview.jobs.dead ?? 0) + (overview.jobs.failed ?? 0);

  const integrations = [
    { name: "Google sign-in", enabled: env.googleOAuthEnabled, detail: env.googleOAuthEnabled ? "OAuth 2.0 configured" : env.devLoginEnabled ? "Not configured — local dev sign-in is active" : "Not configured — nobody can sign in" , keys: "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET" },
    { name: "WhatsApp Business", enabled: env.whatsappEnabled, detail: env.whatsappEnabled ? "Cloud API connected" : "Not configured — WhatsApp outreach falls back to manual contact tasks", keys: "WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN" },
    { name: "Email (SMTP)", enabled: env.emailEnabled, detail: env.emailEnabled ? `Sending as ${env.EMAIL_FROM}` : "Not configured — email outreach falls back to manual contact tasks", keys: "SMTP_URL, EMAIL_FROM" },
    { name: "AI extraction", enabled: env.aiEnabled, detail: env.aiEnabled ? `${env.AI_MODEL} · confidence threshold ${env.AI_CONFIDENCE_THRESHOLD}` : "Not configured — rule-based CV extraction is used; everything is still reviewed by a recruiter", keys: "AI_API_KEY, AI_BASE_URL, AI_MODEL, AI_CONFIDENCE_THRESHOLD" },
    { name: "Slack alerts", enabled: Boolean(env.SLACK_ALERT_WEBHOOK_URL), detail: env.SLACK_ALERT_WEBHOOK_URL ? "Integration failures are posted to Slack" : "Not configured — failures are visible in Jobs & integrations only", keys: "SLACK_ALERT_WEBHOOK_URL" },
    { name: "Background worker", enabled: true, detail: env.jobsInlineRunner ? `Inline runner every ${Math.round(env.JOBS_POLL_INTERVAL_MS / 1000)}s` : "External runner via /api/jobs/run", keys: "JOBS_INLINE_RUNNER, JOBS_SECRET, JOBS_POLL_INTERVAL_MS" },
  ];

  return (
    <Page wide>
      <PageHeader title="Setup" description="System administration. Everything here is restricted to Super Admins and every change is written to the audit log." />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <KpiCard label="Pending users" value={overview.pendingUsers} hint="Signed in, waiting for a role" href="/admin/users?status=pending" icon={UserSquare2Icon} />
        <KpiCard label="Active users" value={overview.activeUsers} hint={`Sharing model: ${settings.sharing_model}`} href="/admin/users" />
        <KpiCard label="Failed / dead jobs" value={deadJobs} hint={`${overview.jobs.queued ?? 0} queued · ${overview.jobs.running ?? 0} running`} href="/admin/jobs?status=failed,dead" icon={DatabaseIcon} />
        <KpiCard label="Access denials (7d)" value={overview.denied7d} hint="403s in security_audit_log" href="/admin/logs?tab=security" icon={ShieldAlertIcon} />
        <KpiCard label="AI calls (7d)" value={overview.aiCalls7d} hint={env.aiEnabled ? "Provider connected" : "Rule-based extractor"} href="/admin/logs?tab=ai" icon={BotIcon} />
        <KpiCard label="Integration errors (7d)" value={overview.integrationErrors7d} hint="Retried with backoff" href="/admin/jobs?tab=errors" icon={PlugZapIcon} />
        <KpiCard label="Retention due" value={retention.due} hint={retention.eligible ? `${retention.eligible} eligible for erasure` : `${retention.onHold} on hold · ${retention.erased} erased`} href="/admin/retention" icon={ArchiveIcon} />
        <KpiCard label="Archived records" value={archived} hint="Restorable by a Super Admin" href="/admin/archived" icon={ArchiveRestoreIcon} />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="surface group flex flex-col gap-2 p-5 transition-shadow hover:shadow-soft">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <s.icon className="size-4" />
            </span>
            <span className="font-semibold group-hover:underline">{s.title}</span>
            <span className="text-sm text-muted-foreground">{s.body}</span>
          </Link>
        ))}
        <div className="surface flex flex-col gap-2 p-5">
          <span className="text-sm font-medium text-muted-foreground">Configuration health</span>
          <ul className="space-y-1 text-sm">
            <li className="flex justify-between"><span>Automation rules</span><span className="tabular-nums">{activeRules} active{failingRules ? ` · ${failingRules} with failures` : ""}</span></li>
            <li className="flex justify-between"><span>Approved templates</span><span className="tabular-nums">{approvedTemplates} of {templates.length}</span></li>
            <li className="flex justify-between"><span>Session idle timeout</span><span className="tabular-nums">{env.SESSION_IDLE_HOURS}h</span></li>
            <li className="flex justify-between"><span>Rate limit</span><span className="tabular-nums">{env.RATE_LIMIT_PER_USER_PER_MINUTE}/min per user</span></li>
          </ul>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="shadow-card lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Integrations</CardTitle>
            <CardDescription>Credentials live in environment variables, never in the database. Names shown for reference.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {integrations.map((i) => (
                <li key={i.name} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  {i.enabled ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" /> : <XCircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{i.name}</p>
                    <p className="text-xs text-muted-foreground">{i.detail}</p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/80">{i.keys}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">Recent automation runs</CardTitle>
              <CardDescription>Each (rule, event, record) runs once.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/automations">All rules</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <EmptyState compact icon={WorkflowIcon} title="No runs yet" description="Runs appear as soon as a trigger fires — a stage change, a failed message, an overdue task." />
            ) : (
              <ul className="divide-y">
                {runs.map((r) => (
                  <li key={r.run.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                    <StatusBadge value={r.run.status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.ruleName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {humanize(r.run.triggerEvent)} · {humanize(r.run.entityType)}
                        {r.run.error ? ` · ${r.run.error}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{fmtRelative(r.run.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">Latest security events</CardTitle>
              <CardDescription>Denied actions, blocked routes, inactive-account access.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/logs?tab=security">Full log</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {denials.length === 0 ? (
              <EmptyState compact icon={ShieldAlertIcon} title="Nothing to report" description="No forbidden attempts have been recorded." />
            ) : (
              <ul className="divide-y">
                {denials.map((d) => (
                  <li key={d.log.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                    <StatusBadge value={d.log.statusCode >= 400 ? "failed" : "succeeded"} label={String(d.log.statusCode)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{humanize(d.log.action.replace(/:/g, " "))}{d.log.resource ? ` · ${humanize(d.log.resource)}` : ""}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {d.userName ?? d.userEmail ?? "Anonymous"} · {d.log.ip ?? "IP unknown"}
                        {d.log.path ? ` · ${d.log.path}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{fmtRelative(d.log.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </Page>
  );
}
