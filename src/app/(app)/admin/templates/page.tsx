import { requireAdminPage } from "@/lib/auth/viewer";
import { listTemplates } from "@/server/admin";
import { env } from "@/lib/env";
import { Page, PageHeader } from "@/components/app/page-header";
import { TemplatesView } from "./templates-view";

export const metadata = { title: "Message templates" };

export default async function AdminTemplatesPage() {
  await requireAdminPage();
  const rows = await listTemplates();
  return (
    <Page wide>
      <PageHeader
        title="Message templates"
        description="Templates power outreach and automations. Business-initiated WhatsApp messages must use a template approved by the provider; email and manual templates are approved here."
      />
      <TemplatesView
        rows={rows.map((t) => ({ id: t.id, name: t.name, channel: t.channel, language: t.language, providerTemplateId: t.providerTemplateId, subject: t.subject, body: t.body, variables: t.variables, status: t.status, category: t.category, updatedAt: t.updatedAt }))}
        channels={{ whatsapp: env.whatsappEnabled, email: env.emailEnabled }}
      />
    </Page>
  );
}
