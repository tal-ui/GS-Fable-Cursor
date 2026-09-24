import { z } from "zod";

const boolFromString = z
  .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0"), z.literal("")])
  .optional()
  .transform((v) => v === "true" || v === "1");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://127.0.0.1:4820"),
  PORT: z.coerce.number().int().positive().default(4820),

  DATABASE_URL: z.string().min(1).optional(),
  PGLITE_DATA_DIR: z.string().default(".data/pglite"),
  UPLOADS_DIR: z.string().default(".data/uploads"),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  SEED_ON_EMPTY: z.string().optional(),

  SESSION_SECRET: z.string().min(16).default("dev-only-session-secret-change-me-please"),
  SESSION_IDLE_HOURS: z.coerce.number().positive().default(8),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  DEV_LOGIN_ENABLED: z.string().optional(),
  INITIAL_SUPER_ADMIN_EMAIL: z.string().email().optional(),

  RATE_LIMIT_PER_USER_PER_MINUTE: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_PER_IP_PER_MINUTE: z.coerce.number().int().positive().default(1000),

  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),

  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().default("Staffing CRM <no-reply@example.com>"),

  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  AI_MODEL: z.string().default("gpt-4o-mini"),
  AI_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),

  JOBS_SECRET: z.string().optional(),
  JOBS_INLINE_RUNNER: z.string().optional(),
  JOBS_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  INTEGRATION_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),

  SLACK_ALERT_WEBHOOK_URL: z.string().url().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${issues}`);
}

const raw = parsed.data;
const isProd = raw.NODE_ENV === "production";

export const env = {
  ...raw,
  isProd,
  isDev: !isProd,
  seedOnEmpty: boolFromString.parse(raw.SEED_ON_EMPTY ?? (isProd ? "false" : "true")),
  googleOAuthEnabled: Boolean(raw.GOOGLE_CLIENT_ID && raw.GOOGLE_CLIENT_SECRET),
  /** Local sign-in as a seeded user. Never enabled in production unless explicitly forced. */
  devLoginEnabled: boolFromString.parse(raw.DEV_LOGIN_ENABLED ?? (isProd ? "false" : "true")),
  whatsappEnabled: Boolean(raw.WHATSAPP_ACCESS_TOKEN && raw.WHATSAPP_PHONE_NUMBER_ID),
  emailEnabled: Boolean(raw.SMTP_URL),
  aiEnabled: Boolean(raw.AI_API_KEY),
  /** Private Vercel Blob replaces the local UPLOADS_DIR when a store is connected (serverless disks are read-only). */
  blobStorageEnabled: Boolean(raw.BLOB_READ_WRITE_TOKEN),
  jobsInlineRunner: boolFromString.parse(raw.JOBS_INLINE_RUNNER ?? "true"),
};

// `next build` evaluates modules with NODE_ENV=production on machines that hold no secrets, so the
// hard failure is deferred to the running server, which loads this module once at boot.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
if (isProd && !isBuildPhase && raw.SESSION_SECRET === "dev-only-session-secret-change-me-please") {
  throw new Error("SESSION_SECRET must be set in production");
}
