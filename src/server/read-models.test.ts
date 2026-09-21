/**
 * Read-model smoke suite: every list, detail, report and admin query the pages render, executed for each
 * role against the seeded database — including the owner-scoped sharing model, whose predicates are spliced
 * into correlated subqueries. The type checker cannot see SQL that only fails at runtime (ambiguous columns,
 * scope predicates naming a table the subquery aliased away), so every page's data path is exercised here.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { getDb, type Database } from "@/db/client";
import { seedDatabase } from "@/db/seed";
import { users } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { listParamsSchema, type ListParams } from "@/server/list";
import { getAccountDetail, listAccounts } from "@/server/accounts";
import { recentActivities } from "@/server/activities";
import { adminOverview, aiLog, changeLog, integrationErrors, jobCounts, listAutomationRules, listJobs, listTaxonomy, listTemplates, listUsers, recentAutomationRuns, securityLog, webhookLog } from "@/server/admin";
import { getCandidateDetail, listCandidates } from "@/server/candidates/queries";
import { getImportBatch, listImportBatches } from "@/server/imports";
import { runMatching } from "@/server/matching";
import { upcomingInterviews } from "@/server/pipeline/interviews";
import { getPlacementDetail, listPlacements } from "@/server/pipeline/placements";
import { getSubmissionDetail, listSubmissions, stageCounts } from "@/server/pipeline/submissions";
import { candidatesByStatus, dashboardKpis, matchingQuality, pilotMetrics, pipelineByStage, placementsByMonth, sourceConversion, stageDurations, topAccounts } from "@/server/reports";
import { getRequisitionDetail, listRequisitions } from "@/server/requisitions";
import { globalSearch } from "@/server/search";
import { getSettings, getSettingsRows, invalidateSettingsCache, setSetting } from "@/server/settings";
import { listSources } from "@/server/sources";
import { listTasks, workQueueItems, workQueueSummary } from "@/server/tasks";

let db: Database;
const byEmail = new Map<string, CurrentUser>();
const user = (key: "noa" | "maya" | "lior") => {
  const email = { noa: "noa.adler", maya: "maya.cohen", lior: "lior.katz" }[key] + "@relaystaffing.example";
  const u = byEmail.get(email);
  if (!u) throw new Error(`missing seeded user ${key}`);
  return u;
};
const params = (overrides: Partial<ListParams> = {}) => listParamsSchema.parse({ pageSize: 50, ...overrides });

beforeAll(async () => {
  db = await getDb();
  await seedDatabase();
  for (const row of await db.select().from(users)) byEmail.set(row.email, row);
});

/** Runs every page's read path for one caller; the seeded pilot data must surface through each of them. */
async function exerciseWorkspace(actor: CurrentUser, opts: { ownerModel?: boolean } = {}) {
  const settings = await getSettings();
  const stall = { submissionDays: settings.submission_stall_days, requisitionDays: settings.requisition_stall_days };

  const cands = await listCandidates(actor, params({ sort: "country", dir: "asc" }));
  expect(cands.total).toBeGreaterThan(0);
  for (const sort of ["name", "status", "createdAt", "yearsExperience"]) await listCandidates(actor, params({ sort }));
  await listCandidates(actor, params({ q: "weld", filters: { status: "new,active", verified: "true", relocate: "true" } }));
  const candidate = await getCandidateDetail(actor, cands.rows[0]!.id);
  expect(candidate.candidate.id).toBe(cands.rows[0]!.id);

  const accounts = await listAccounts(actor, params({ sort: "name", dir: "asc" }));
  expect(accounts.total).toBeGreaterThan(0);
  const account = await getAccountDetail(actor, accounts.rows[0]!.id);
  expect(account.requisitions.length).toBeGreaterThanOrEqual(0);

  const reqs = await listRequisitions(actor, params({ sort: "account", dir: "asc" }));
  expect(reqs.total).toBeGreaterThan(0);
  await listRequisitions(actor, params({ filters: { status: "open", stalled: "true" } }));
  const open = reqs.rows.find((r) => r.status === "open") ?? reqs.rows[0]!;
  const requisition = await getRequisitionDetail(actor, open.id);
  expect(requisition.requisition.id).toBe(open.id);
  const workspace = await runMatching(actor, open.id);
  expect(workspace.eligible.length + workspace.review.length + workspace.ineligible.length).toBeGreaterThan(0);

  const subs = await listSubmissions(actor, params({ sort: "matchScore" }));
  expect(subs.total).toBeGreaterThan(0);
  await listSubmissions(actor, params({ filters: { includeClosed: "true", stalled: "true", eligibility: "review" } }));
  await getSubmissionDetail(actor, subs.rows[0]!.id);
  await stageCounts(actor);

  const placements = await listPlacements(actor, params({ sort: "plannedStart" }));
  expect(placements.total).toBeGreaterThan(0);
  await listPlacements(actor, params({ filters: { status: "active,started", startingSoon: "true" } }));
  await getPlacementDetail(actor, placements.rows[0]!.id);

  const tasks = await listTasks(actor, params({ sort: "dueAt", dir: "asc" }));
  expect(tasks.total).toBeGreaterThan(0);
  await listTasks(actor, params({ filters: { mine: "true", overdue: "true", status: "open,in_progress" } }));
  await workQueueSummary(actor, stall);
  await workQueueItems(actor, stall);

  const batches = await listImportBatches(actor);
  if (opts.ownerModel && actor.role !== "super_admin") {
    // The seeded batch was imported by the Super Admin; under the owner model it is private to her.
    expect(batches.length).toBe(0);
  } else {
    expect(batches.length).toBeGreaterThan(0);
    const batch = await getImportBatch(actor, batches[0]!.batch.id);
    expect(batch.id).toBe(batches[0]!.batch.id);
  }

  await Promise.all([dashboardKpis(actor), pipelineByStage(actor), placementsByMonth(actor), candidatesByStatus(actor), pilotMetrics(actor), stageDurations(actor), matchingQuality(actor), recentActivities(actor), upcomingInterviews(actor)]);

  const funnel = await sourceConversion(actor);
  expect(funnel.length).toBeGreaterThan(0);
  for (const row of funnel) {
    expect(typeof row.candidates).toBe("number");
    expect(row.events).toBeGreaterThanOrEqual(row.candidates);
  }
  const accountsTop = await topAccounts(actor);
  expect(accountsTop.length).toBeGreaterThan(0);
  expect(accountsTop.length).toBeLessThanOrEqual(5);

  expect((await listSources()).length).toBeGreaterThan(0);
  const hits = await globalSearch(actor, "weld");
  expect(hits.length).toBeGreaterThan(0);
  return { funnel, cands };
}

describe("workspace read models", () => {
  it("render for a Super Admin with team-wide visibility", async () => {
    const { funnel } = await exerciseWorkspace(user("noa"));
    expect(funnel.some((row) => row.candidates > 0)).toBe(true);
  });

  it("render for a Standard user and a Read Only user", async () => {
    await exerciseWorkspace(user("maya"));
    await exerciseWorkspace(user("lior"));
  });

  it("render under the owner sharing model, where scope predicates are spliced into correlated subqueries", async () => {
    const noa = user("noa");
    await setSetting("sharing_model", "owner", noa.id);
    invalidateSettingsCache();
    try {
      const team = await sourceConversion(noa);
      const { funnel, cands } = await exerciseWorkspace(user("maya"), { ownerModel: true });
      // Maya only sees records she owns or that are unassigned, so her attributed counts can never exceed the team's.
      expect(cands.rows.every((c) => c.ownerId === null || c.ownerId === user("maya").id)).toBe(true);
      for (const row of funnel) {
        const teamRow = team.find((t) => t.id === row.id);
        expect(row.candidates).toBeLessThanOrEqual(teamRow?.candidates ?? 0);
      }
    } finally {
      await setSetting("sharing_model", "team", noa.id);
      invalidateSettingsCache();
    }
  });
});

describe("setup area read models", () => {
  it("render every admin page's data", async () => {
    const [usersList, taxonomy, rules, runs, templates, jobs, counts, security, changes, ai, errors, hooks, overview, settings] = await Promise.all([
      listUsers(),
      listTaxonomy(),
      listAutomationRules(),
      recentAutomationRuns(),
      listTemplates(),
      listJobs(),
      jobCounts(),
      securityLog(),
      changeLog(),
      aiLog(),
      integrationErrors(),
      webhookLog(),
      adminOverview(),
      getSettingsRows(),
    ]);
    expect(usersList.length).toBeGreaterThan(0);
    expect(taxonomy.skills.length).toBeGreaterThan(0);
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(typeof r.runs).toBe("number");
      expect(r.failures).toBeLessThanOrEqual(r.runs);
    }
    expect(runs.length).toBeGreaterThanOrEqual(0);
    expect(templates.length).toBeGreaterThan(0);
    expect(jobs.length).toBeGreaterThan(0);
    expect(Object.keys(counts).length).toBeGreaterThan(0);
    expect(changes.length).toBeGreaterThan(0);
    expect(security.length).toBeGreaterThanOrEqual(0);
    expect(ai.length).toBeGreaterThanOrEqual(0);
    expect(errors.length + hooks.length).toBeGreaterThanOrEqual(0);
    expect(overview).toBeTruthy();
    expect(settings.length).toBeGreaterThan(0);
    await listJobs("dead");
    await changeLog(50, "candidate");
  });
});
