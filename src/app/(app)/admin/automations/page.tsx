import { requireAdminPage } from "@/lib/auth/viewer";
import { listAutomationRules, listTemplates, recentAutomationRuns } from "@/server/admin";
import { Page, PageHeader } from "@/components/app/page-header";
import { AutomationsView } from "./automations-view";

export const metadata = { title: "Automations" };

export default async function AdminAutomationsPage() {
  await requireAdminPage();
  const [rules, runs, templates] = await Promise.all([listAutomationRules(), recentAutomationRuns(60), listTemplates()]);
  const since = new Date();
  since.setDate(since.getDate() - 1);

  return (
    <Page wide>
      <PageHeader
        title="Automations"
        description="Event-driven rules: trigger → conditions → action. Every rule runs at most once per (event, record) and actions that emit new events are depth-limited, so loops are impossible."
      />
      <AutomationsView
        rules={rules.map((r) => ({
          id: r.rule.id,
          name: r.rule.name,
          description: r.rule.description,
          trigger: r.rule.trigger,
          conditions: r.rule.conditions,
          action: r.rule.action,
          actionConfig: r.rule.actionConfig,
          isActive: r.rule.isActive,
          isSystem: r.rule.isSystem,
          runs: r.runs,
          failures: r.failures,
          lastRunAt: r.lastRunAt ? new Date(r.lastRunAt) : null,
        }))}
        runs={runs.map((r) => ({ id: r.run.id, ruleId: r.run.ruleId, ruleName: r.ruleName, triggerEvent: r.run.triggerEvent, entityType: r.run.entityType, entityId: r.run.entityId, status: r.run.status, error: r.run.error, details: r.run.details, createdAt: r.run.createdAt }))}
        templateNames={templates.filter((t) => t.status === "approved").map((t) => t.name).filter((v, i, a) => a.indexOf(v) === i)}
        runs24h={runs.filter((r) => new Date(r.run.createdAt) > since).length}
      />
    </Page>
  );
}
