import { requireAdminPage } from "@/lib/auth/viewer";
import { aiLog, changeLog, securityLog } from "@/server/admin";
import { Page, PageHeader } from "@/components/app/page-header";
import { LogsView } from "./logs-view";

export const metadata = { title: "Audit logs" };

export default async function AdminLogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage();
  const params = await searchParams;
  const tab = typeof params.tab === "string" ? params.tab : "changes";
  const entityType = typeof params.entity === "string" && params.entity ? params.entity : undefined;
  const entityId = typeof params.id === "string" && params.id ? params.id : undefined;

  const [changes, security, ai] = await Promise.all([changeLog(200, entityType, entityId), securityLog(200), aiLog(100)]);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  return (
    <Page wide>
      <PageHeader
        title="Audit logs"
        description="Three append-only logs: who changed what (change log), every forbidden or suspicious request (security log), and each AI decision with its input, output and confidence (AI log)."
      />
      <LogsView
        initialTab={tab}
        entityFilter={{ entityType: entityType ?? null, entityId: entityId ?? null }}
        changes={changes.map((c) => ({ id: c.log.id, entityType: c.log.entityType, entityId: c.log.entityId, action: c.log.action, actorName: c.actorName, before: c.log.before, after: c.log.after, note: c.log.note, ip: c.log.ip, createdAt: c.log.createdAt }))}
        security={security.map((s) => ({ id: s.log.id, userName: s.userName, userEmail: s.userEmail, action: s.log.action, resource: s.log.resource, method: s.log.method, path: s.log.path, statusCode: s.log.statusCode, ip: s.log.ip, userAgent: s.log.userAgent, details: s.log.details, createdAt: s.log.createdAt }))}
        denied7d={security.filter((s) => s.log.statusCode === 403 && new Date(s.log.createdAt) > weekAgo).length}
        ai={ai.map((a) => ({ id: a.id, purpose: a.purpose, provider: a.provider, model: a.model, entityType: a.entityType, entityId: a.entityId, confidence: a.confidence === null ? null : Number(a.confidence), latencyMs: a.latencyMs, status: a.status, error: a.error, input: a.input, output: a.output, createdAt: a.createdAt }))}
      />
    </Page>
  );
}
