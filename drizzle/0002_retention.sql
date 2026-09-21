ALTER TYPE "public"."audit_action" ADD VALUE 'retention_hold';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'anonymize';--> statement-breakpoint
ALTER TYPE "public"."task_type" ADD VALUE 'retention_review' BEFORE 'other';--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "retention_hold_reason" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "retention_hold_until" date;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "anonymized_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "candidates_anonymized_idx" ON "candidates" USING btree ("anonymized_at");