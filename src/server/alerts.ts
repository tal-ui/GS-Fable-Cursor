import "server-only";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Sends an operational alert to the designated Slack channel when configured.
 * Failures here are logged and never propagate to recruiter-facing flows.
 */
export async function alertOps(text: string): Promise<void> {
  logger.error("ops.alert", { text });
  if (!env.SLACK_ALERT_WEBHOOK_URL) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.INTEGRATION_TIMEOUT_MS);
  try {
    await fetch(env.SLACK_ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `:rotating_light: Staffing CRM — ${text}\n${env.APP_URL}/admin/logs` }),
      signal: controller.signal,
    });
  } catch (error) {
    logger.error("ops.alert_failed", { error: String(error) });
  } finally {
    clearTimeout(timeout);
  }
}
