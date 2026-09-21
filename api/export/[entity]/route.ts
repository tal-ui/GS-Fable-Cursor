import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { AppError, userFacingMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { getDb } from "@/db/client";
import { parseListParams } from "@/server/list";
import { listAccounts } from "@/server/accounts";
import { listCandidates } from "@/server/candidates/queries";
import { listRequisitions } from "@/server/requisitions";
import { listPlacements } from "@/server/pipeline/placements";
import { listSubmissions } from "@/server/pipeline/submissions";
import { listTasks } from "@/server/tasks";
import type { CurrentUser } from "@/lib/auth/session";
import type { ListParams } from "@/server/list";

const MAX_ROWS = 5000;

type Exporter = (user: CurrentUser, params: ListParams) => Promise<{ rows: Record<string, unknown>[] }>;

const EXPORTERS: Record<string, Exporter> = {
  candidates: async (u, p) => listCandidates(u, p) as Promise<{ rows: Record<string, unknown>[] }>,
  accounts: async (u, p) => listAccounts(u, p) as Promise<{ rows: Record<string, unknown>[] }>,
  requisitions: async (u, p) => listRequisitions(u, p) as Promise<{ rows: Record<string, unknown>[] }>,
  submissions: async (u, p) => listSubmissions(u, p) as Promise<{ rows: Record<string, unknown>[] }>,
  placements: async (u, p) => listPlacements(u, p) as Promise<{ rows: Record<string, unknown>[] }>,
  tasks: async (u, p) => listTasks(u, p) as Promise<{ rows: Record<string, unknown>[] }>,
};

/** Never export raw identity documents, extraction text or nested JSON snapshots. */
const EXCLUDED_KEYS = new Set(["matchSnapshot", "extractionSuggestions", "extractedText", "checklist", "rows", "errors", "duplicates"]);

function flatten(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (EXCLUDED_KEYS.has(key)) continue;
    if (value === null || value === undefined) out[key] = "";
    else if (value instanceof Date) out[key] = value.toISOString();
    else if (Array.isArray(value)) out[key] = value.map(String).join("; ");
    else if (typeof value === "object") {
      for (const [k2, v2] of Object.entries(value as Record<string, unknown>)) {
        if (EXCLUDED_KEYS.has(k2)) continue;
        out[`${key}.${k2}`] = v2 === null || v2 === undefined ? "" : v2 instanceof Date ? v2.toISOString() : String(v2);
      }
    } else out[key] = String(value);
  }
  return out;
}

function csvEscape(value: string): string {
  // Neutralise spreadsheet formula injection and quote as needed.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ entity: string }> }) {
  try {
    const { entity } = await ctx.params;
    const exporter = EXPORTERS[entity];
    if (!exporter) return NextResponse.json({ error: "Unknown export" }, { status: 404 });
    const user = await requirePermission("export", entity);
    const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
    const params = parseListParams(raw, { pageSize: 200 });
    const collected: Record<string, string>[] = [];
    for (let page = 1; collected.length < MAX_ROWS; page++) {
      const result = await exporter(user, { ...params, page, pageSize: 200 });
      collected.push(...result.rows.map(flatten));
      if (result.rows.length < 200) break;
    }
    const rows = collected.slice(0, MAX_ROWS);
    const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    const lines = [headers.map(csvEscape).join(","), ...rows.map((r) => headers.map((h) => csvEscape(r[h] ?? "")).join(","))];
    const db = await getDb();
    await recordAudit(db, { entityType: entity, entityId: user.id, action: "export", actorId: user.id, after: { rows: rows.length, filters: params.filters, q: params.q ?? null } });
    return new NextResponse(`\uFEFF${lines.join("\r\n")}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${entity}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    logger.error("export.failed", { error: String(error) });
    return NextResponse.json({ error: userFacingMessage(error) }, { status: 500 });
  }
}
