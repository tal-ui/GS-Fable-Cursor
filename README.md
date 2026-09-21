# Staffing CRM

A two-sided staffing operations platform: one shared record for candidate supply and employer demand. Recruiters receive a staffing request, search the whole candidate pool, review the evidence behind every match, contact suitable candidates through logged channels, and track the result through placement — with privacy and role controls enforced on the server.

Built from the *Staffing CRM Build and Execution Plan* (v1.0). Everything runs locally with zero external services; Postgres, Google OAuth, WhatsApp, SMTP and an AI provider are switched on by environment variables.

## What is inside

| Area | What it does |
| --- | --- |
| **Candidates** | Guided intake with duplicate detection (email, phone in any national format, name), CV upload with rules-based or AI-assisted extraction routed through human review, skill claims with declared vs. verified status and evidence expiry, work authorisation per country (separate from passport/citizenship), dated availability with freshness, compensation, consents, documents, merge. |
| **Employer CRM** | Accounts, contacts (who receives shortlists), commercial terms, activity history shared with requisitions and placements. |
| **Requisitions** | Versioned, explainable requirements: mandatory eligibility rules with a written business justification, preferred rules with weights, evidence requirement per rule (declared or verified). Draft → open → on hold / filled / closed / cancelled with seat tracking. |
| **Matching workspace** | Pure TypeScript rules engine. Every candidate is *eligible*, *needs review* or *ineligible* with the rule, the fact used, its verification status and date. Ranking is versioned per role family; recruiters record feedback. Bulk submit. |
| **Pipeline** | Submissions through a gated stage machine (interest confirmation, interviews, controlled disclosure, customer review, offer, acceptance). Presenting or offering re-checks eligibility and customer-specific sharing permission; withdrawal blocks disclosure. Acceptance reserves a seat atomically and checks for overlapping assignments. |
| **Placements** | Reserved → started → active → extended / completed / cancelled with checklist, replacement and seat release. |
| **Outreach** | WhatsApp templates and email through one messaging service with retries, delivery webhooks, a 24-hour service window and a manual fallback task when a channel is not configured or a send fails. |
| **Work queue** | Owned tasks, eligibility reviews, stalled submissions and requisitions, upcoming starts; bulk actions; CSV export. |
| **Imports** | Three-step CSV wizard: file + source, column mapping with auto-detect, duplicate decisions (merge / create / skip), batch processing in the background, error report, rollback. |
| **Reports** | Pilot metrics, funnel, outreach outcomes, stage durations, placements by month, source conversion, matching quality and evidence readiness. |
| **Setup (Super Admin)** | Users & roles, skills taxonomy with synonyms and role-family weights, automation rules with a condition builder and run history, message templates with variable preview, jobs & integrations (retry, error log, webhooks), audit logs (changes, 403s, AI decisions), retention & erasure, settings. |
| **Secure upload links** | A recruiter mints an expiring, capped link pinned to one candidate and the document kinds needed (passport, ID, certificates…). The candidate opens `/upload/<token>` without an account and uploads; the file lands privately on their record, the access log records it as a candidate upload, and a verification task is raised for the recruiter. Only a hash of the token is stored; links can be revoked, die with erasure, and are purged by maintenance. |
| **Retention & erasure** | Profiles fall due for review after a configurable period without activity, or immediately when the candidate withdraws permission to process their profile. Daily maintenance raises an owned review task; a Super Admin records a documented hold or, after the grace period, erases personal data, files and AI records while submissions, placements and headcount history stay intact. Counts only in the audit log — never the erased content. |
| **Archived records** | Every trash icon is a soft delete: the record leaves lists, search and matching but keeps its submissions, placements, documents and activity. A candidate with an open submission or active placement, or an account with an open requisition, cannot be archived. Super Admins restore from Setup → Archived records; both steps are in the change log. |

## Architecture

- **Next.js 16 (App Router) + TypeScript**, Server Components for reads and Server Actions for writes. Every action is wrapped by `defineAction`, which authenticates, checks the role permission, validates input with Zod and returns a user-safe result.
- **Drizzle ORM on PostgreSQL.** Locally the same schema runs on an embedded [PGlite](https://pglite.dev) database, so a clone runs with no setup. Set `DATABASE_URL` to use a real Postgres.
- **Layered build order:** schema (`src/db/schema`, migrations in `drizzle/`, documented in [`docs/data-model.md`](docs/data-model.md)) → services (`src/server/**`, the only place with business rules) → actions and routes (`src/actions`, `src/app/api`) → UI (`src/app/(app)`, `src/components`).
- **Security model:** Google OAuth only; first login creates a `pending` user until a Super Admin activates it. HTTP-only session cookie with an 8-hour idle timeout. Roles: `super_admin`, `standard`, `read_only` — enforced in every action and route *and* reflected in the UI. Row visibility is part of every query (`visibilityScope`), never filtered in the UI. All 401/403s land in `security_audit_log`; sensitive changes in `audit_log`; AI decisions in `ai_audit_log`.
- **Background work:** a persistent `jobs` table with retries and dead-lettering. An in-process poller runs in development; production can call `POST /api/jobs/run` from a scheduler or run `pnpm jobs:run`.
- **Design tokens** live in `src/app/globals.css`; components use shadcn/ui primitives and never hard-code colours.
- **One business time zone.** Every date and time is displayed and entered in `NEXT_PUBLIC_APP_TIMEZONE` (default `Asia/Jerusalem`) through `src/lib/format.ts`, whichever zone the server or browser runs in, so server-rendered and hydrated markup always agree and colleagues never read different times for the same interview. Relative times never show seconds for the same reason.

## Run it locally

Requirements: Node 20.18+ and pnpm 10.

```bash
pnpm install
cp .env.example .env      # optional: defaults work out of the box
pnpm dev                  # http://127.0.0.1:4820
```

The first request creates the embedded database under `.data/`, runs migrations and seeds a realistic pilot dataset (seven staff, eight employer accounts, 31 candidates, ten requisitions with versioned requirements, 31 submissions across every stage, placements, outreach, an import batch, failed jobs, retention cases and audit history). Sign in as any seeded user from the login page — the local sign-in list is disabled automatically in production.

| Seeded user | Role | Use it to see |
| --- | --- | --- |
| Noa Adler | Super Admin, verifier | Everything, including Setup |
| Daniel Peretz | Standard, verifier | Evidence review flows |
| Maya Cohen / Yossi Ben-David | Standard | Day-to-day recruiting and account management |
| Lior Katz | Read Only | Dashboards and records with no write or export controls |
| Tamar Levi | Pending | The activation wall |

Useful scripts:

```bash
pnpm db:seed             # seed an empty database from the CLI (stop the dev server first when using PGlite)
pnpm db:reset            # wipe local data and reseed
pnpm jobs:run            # process due background jobs once and exit
pnpm typecheck && pnpm lint && pnpm test
pnpm db:generate         # generate a migration after editing src/db/schema (a running dev server applies it on the next request)
pnpm docs:schema         # regenerate docs/data-model.md from the schema
```

The embedded PGlite database has no background checkpointer, so killing the dev server mid-write can leave a directory Postgres cannot recover. The server closes the database on `SIGINT`/`SIGTERM`; if the directory is still unrecoverable on the next start it is moved to `.data/pglite.corrupt-<timestamp>` (nothing is deleted), a fresh database is created and the pilot dataset is seeded again. PGlite is for local development and tests only — deploy against PostgreSQL.

## Testing

`pnpm test` runs the matching engine unit tests, schema and formatting helper tests and six integration suites that each seed a throwaway PGlite database:

- `src/server/platform.test.ts` — role enforcement with 403 auditing, owner-model data isolation, atomic last-seat reservation, overlap conflicts, withdrawal blocking disclosure, the eligibility-review override, duplicate detection and dead-job visibility.
- `src/server/workflow.test.ts` — cancellation and replacement reconcile headcount, completion prompts an availability recheck, declining one request never rejects a candidate globally, identity documents are restricted by role and every download is logged, mislabelled and infected uploads are refused, outreach is idempotent and re-checks permission at send time, provider webhooks are processed exactly once with opt-outs honoured.
- `src/server/read-models.test.ts` — every list, detail, report and admin query per role and under the owner sharing model.
- `src/server/documents/upload-links.test.ts` — token hashing, kind/expiry/cap enforcement, candidate uploads logged without a staff user, review tasks, quarantine of infected files, revocation and expiry, Read Only and owner-model denials, and erasure revoking open links.
- `src/server/retention.test.ts` — withdrawn permission and inactivity make a profile due, live engagement keeps it out, holds suppress tasks and block erasure, the grace period is enforced, erasure scrubs personal data, files and AI records while commercial history survives, and only Super Admins may erase.
- `src/server/archive.test.ts` — archiving is refused while a candidate has an open submission or an account an open requisition, archived rows leave lists and detail but keep their history, restore is a Super Admin action that is audited, and Standard callers get a logged 403.

## Deploying

1. Provision PostgreSQL and set `DATABASE_URL`; migrations run on boot.
2. Set `SESSION_SECRET`, `APP_URL`, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (redirect URI `{APP_URL}/api/auth/google/callback`) and `INITIAL_SUPER_ADMIN_EMAIL`.
3. Optionally configure WhatsApp, SMTP, the AI provider and the Slack alert webhook — see `.env.example`. Without them the platform degrades to manual outreach and rules-based extraction.
4. Point a scheduler at `POST /api/jobs/run` with `Authorization: Bearer $JOBS_SECRET`, or keep `JOBS_INLINE_RUNNER=true` for a single instance.
5. Store uploads on a persistent volume (`UPLOADS_DIR`) or mount object storage there.

## Repository map

```
src/app/(app)/         application pages (candidates, accounts, requisitions, submissions, placements, sources, work-queue, imports, reports, profile, admin/*)
src/app/(public)/      login and pending-activation pages
src/app/api/           auth, documents, CSV export, health, jobs runner, WhatsApp webhook
src/actions/           server actions per module (all through defineAction)
src/server/            services: candidates, accounts, requisitions, matching, pipeline, messaging, imports, reports, admin, jobs
src/lib/matching/      rules engine and ranking (pure, unit-tested)
src/db/schema/         Drizzle schema; drizzle/ holds the SQL migrations; src/db/seed the pilot dataset
src/components/        design-system components and app shell
docs/data-model.md     ERD and data dictionary generated from the schema
```
