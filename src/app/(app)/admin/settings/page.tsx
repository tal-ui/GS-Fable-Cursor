import { requireAdminPage } from "@/lib/auth/viewer";
import { env } from "@/lib/env";
import { getSettingsRows } from "@/server/settings";
import { Page, PageHeader } from "@/components/app/page-header";
import { SettingsView } from "./settings-view";

export const metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  await requireAdminPage();
  const rows = await getSettingsRows();
  return (
    <Page>
      <PageHeader title="Settings" description="Operating parameters that change how matching, stall detection and outreach behave. Edits apply within seconds and are audited." />
      <SettingsView
        rows={rows.map((r) => ({ key: r.key, value: r.value, description: r.description, updatedAt: r.updatedAt, isDefault: r.isDefault }))}
        runtime={{
          appUrl: env.APP_URL,
          sessionIdleHours: env.SESSION_IDLE_HOURS,
          rateLimitUser: env.RATE_LIMIT_PER_USER_PER_MINUTE,
          rateLimitIp: env.RATE_LIMIT_PER_IP_PER_MINUTE,
          aiThreshold: env.AI_CONFIDENCE_THRESHOLD,
          integrationTimeoutMs: env.INTEGRATION_TIMEOUT_MS,
          database: env.DATABASE_URL ? "PostgreSQL" : "PGlite (embedded, local)",
          uploadsDir: env.blobStorageEnabled ? "Vercel Blob (private)" : env.UPLOADS_DIR,
          devLogin: env.devLoginEnabled,
          isProd: env.isProd,
        }}
      />
    </Page>
  );
}
