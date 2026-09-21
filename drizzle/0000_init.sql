CREATE TYPE "public"."account_status" AS ENUM('prospect', 'active', 'inactive', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('employer', 'agency_partner', 'government', 'subcontractor', 'vendor', 'other');--> statement-breakpoint
CREATE TYPE "public"."activity_type" AS ENUM('note', 'call', 'email', 'whatsapp', 'meeting', 'status_change', 'system');--> statement-breakpoint
CREATE TYPE "public"."ai_purpose" AS ENUM('cv_extraction', 'semantic_ranking', 'screening_summary');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'restore', 'merge', 'verify', 'disclose', 'export', 'login', 'logout', 'role_change', 'override', 'reserve_seat', 'release_seat');--> statement-breakpoint
CREATE TYPE "public"."automation_action" AS ENUM('create_task', 'notify_owner', 'queue_message', 'update_candidate_status');--> statement-breakpoint
CREATE TYPE "public"."automation_run_status" AS ENUM('succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."automation_trigger" AS ENUM('submission_stage_changed', 'placement_status_changed', 'message_failed', 'task_overdue', 'candidate_created', 'requisition_created', 'verification_changed', 'schedule_daily');--> statement-breakpoint
CREATE TYPE "public"."cancellation_reason" AS ENUM('candidate_withdrew', 'customer_cancelled', 'failed_start', 'performance', 'compliance', 'other');--> statement-breakpoint
CREATE TYPE "public"."candidate_status" AS ENUM('new', 'screening', 'active', 'placed', 'unavailable', 'withdrawn', 'archived');--> statement-breakpoint
CREATE TYPE "public"."claim_origin" AS ENUM('candidate_declared', 'ai_extracted', 'recruiter_entered', 'imported');--> statement-breakpoint
CREATE TYPE "public"."compensation_type" AS ENUM('expected', 'minimum', 'current', 'offered');--> statement-breakpoint
CREATE TYPE "public"."consent_channel" AS ENUM('web_form', 'whatsapp', 'email', 'phone', 'paper', 'import');--> statement-breakpoint
CREATE TYPE "public"."consent_scope" AS ENUM('process_profile', 'communicate', 'share_with_customer');--> statement-breakpoint
CREATE TYPE "public"."decision_reason" AS ENUM('compensation_mismatch', 'availability_conflict', 'location_mismatch', 'missing_evidence', 'failed_interview', 'customer_preference', 'candidate_withdrew', 'duplicate', 'seat_unavailable', 'other');--> statement-breakpoint
CREATE TYPE "public"."disclosure_channel" AS ENUM('email', 'whatsapp', 'phone', 'in_person', 'portal');--> statement-breakpoint
CREATE TYPE "public"."document_access_action" AS ENUM('view', 'download', 'share', 'upload', 'delete');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('cv', 'passport', 'id_document', 'certificate', 'license', 'contract', 'photo', 'transcript', 'other');--> statement-breakpoint
CREATE TYPE "public"."eligibility_outcome" AS ENUM('eligible', 'review', 'ineligible');--> statement-breakpoint
CREATE TYPE "public"."evidence_requirement" AS ENUM('none', 'declared', 'verified');--> statement-breakpoint
CREATE TYPE "public"."gross_net" AS ENUM('gross', 'net');--> statement-breakpoint
CREATE TYPE "public"."import_entity" AS ENUM('candidates', 'accounts', 'requisitions');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('previewed', 'importing', 'completed', 'failed', 'rolled_back');--> statement-breakpoint
CREATE TYPE "public"."interview_outcome" AS ENUM('pending', 'pass', 'fail', 'hold');--> statement-breakpoint
CREATE TYPE "public"."interview_status" AS ENUM('scheduled', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."interview_type" AS ENUM('screening_call', 'technical', 'customer_interview', 'ai_chat_screening', 'reference_check');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'dead');--> statement-breakpoint
CREATE TYPE "public"."language_proficiency" AS ENUM('basic', 'conversational', 'professional', 'fluent', 'native');--> statement-breakpoint
CREATE TYPE "public"."match_feedback_action" AS ENUM('accepted', 'overridden_include', 'overridden_exclude', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('whatsapp', 'email', 'sms', 'manual');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'sent', 'delivered', 'read', 'failed', 'manual_pending', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('info', 'task', 'message', 'system', 'security');--> statement-breakpoint
CREATE TYPE "public"."pay_period" AS ENUM('hourly', 'daily', 'weekly', 'monthly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."placement_status" AS ENUM('reserved', 'started', 'active', 'extended', 'completed', 'cancelled', 'replaced');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."proficiency_level" AS ENUM('basic', 'intermediate', 'advanced', 'expert');--> statement-breakpoint
CREATE TYPE "public"."requirement_field" AS ENUM('skill', 'language', 'work_authorization', 'citizenship', 'availability_from', 'availability_duration_weeks', 'relocation', 'compensation_max', 'experience_years', 'military_role', 'certification', 'location_country');--> statement-breakpoint
CREATE TYPE "public"."requirement_kind" AS ENUM('mandatory', 'preferred');--> statement-breakpoint
CREATE TYPE "public"."requirement_operator" AS ENUM('equals', 'not_equals', 'gte', 'lte', 'in', 'not_in', 'contains', 'before', 'after', 'exists');--> statement-breakpoint
CREATE TYPE "public"."requisition_status" AS ENUM('draft', 'open', 'on_hold', 'filled', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."rotation_preference" AS ENUM('no_preference', 'short_rotation', 'long_rotation', 'fixed_term', 'permanent');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('pending', 'clean', 'infected', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."source_event_type" AS ENUM('applied', 'imported', 'referred', 're_referred', 'merged');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('agency', 'referral', 'job_board', 'website', 'social', 'import', 'walk_in', 'partner', 'other');--> statement-breakpoint
CREATE TYPE "public"."submission_stage" AS ENUM('sourced', 'contacted', 'interested', 'screening', 'interviewing', 'presented', 'customer_review', 'offered', 'accepted', 'placed', 'declined_by_candidate', 'rejected_by_customer', 'withdrawn', 'not_eligible');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'in_progress', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('follow_up', 'verification', 'availability_check', 'eligibility_review', 'message_failed', 'stalled_request', 'manual_contact', 'placement_checklist', 'import_review', 'other');--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('draft', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'standard', 'read_only');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('pending', 'active', 'deactivated');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('unverified', 'pending_review', 'verified', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."work_auth_type" AS ENUM('citizen', 'permanent_resident', 'work_permit', 'visa_sponsorship_required', 'none');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" "audit_action" NOT NULL,
	"actor_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "saved_filters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"resource" text,
	"method" text,
	"path" text,
	"status_code" integer NOT NULL,
	"ip" text,
	"user_agent" text,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"google_sub" text,
	"role" "user_role" DEFAULT 'standard' NOT NULL,
	"status" "user_status" DEFAULT 'pending' NOT NULL,
	"can_verify" boolean DEFAULT false NOT NULL,
	"job_title" text,
	"phone" text,
	"notification_prefs" jsonb DEFAULT '{"inApp":true,"email":false,"taskReminders":true,"messageFailures":true}'::jsonb NOT NULL,
	"last_login_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
CREATE TABLE "role_families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"ranking_weights" jsonb DEFAULT '{"skills":0.4,"proficiency":0.15,"experience":0.15,"preferences":0.2,"freshness":0.1}'::jsonb NOT NULL,
	"ranking_version" text DEFAULT 'baseline-v1' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "role_families_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "skill_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "skill_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "skill_synonyms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"skill_id" uuid NOT NULL,
	"term" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid NOT NULL,
	"description" text,
	"owner_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"default_validity_months" integer,
	CONSTRAINT "skills_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" DEFAULT 'employer' NOT NULL,
	"status" "account_status" DEFAULT 'prospect' NOT NULL,
	"industry" text,
	"website" text,
	"country" text,
	"city" text,
	"address_line" text,
	"owner_id" uuid,
	"currency" text DEFAULT 'USD' NOT NULL,
	"payment_terms_days" integer,
	"commercial_terms" text,
	"notes" text,
	"external_ref" text
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"account_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"title" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"receives_shortlists" boolean DEFAULT false NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "candidate_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"candidate_id" uuid NOT NULL,
	"available_from" date NOT NULL,
	"available_until" date,
	"min_duration_weeks" integer,
	"max_duration_weeks" integer,
	"rotation_preference" "rotation_preference" DEFAULT 'no_preference' NOT NULL,
	"willing_to_relocate" boolean DEFAULT true NOT NULL,
	"relocation_constraints" text,
	"last_confirmed_at" timestamp with time zone,
	"confirmed_by_id" uuid,
	"confirmation_channel" text,
	"is_current" boolean DEFAULT true NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "candidate_compensation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"candidate_id" uuid NOT NULL,
	"type" "compensation_type" DEFAULT 'expected' NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"period" "pay_period" NOT NULL,
	"gross_net" "gross_net" DEFAULT 'gross' NOT NULL,
	"effective_date" date,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "candidate_languages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"candidate_id" uuid NOT NULL,
	"language" text NOT NULL,
	"proficiency" "language_proficiency" NOT NULL,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"reviewer_id" uuid,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "candidate_merges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"primary_candidate_id" uuid NOT NULL,
	"merged_candidate_id" uuid NOT NULL,
	"merged_by_id" uuid,
	"reason" text,
	"snapshot" jsonb NOT NULL,
	"undone_at" timestamp with time zone,
	"undone_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "candidate_skill_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"candidate_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"original_wording" text,
	"declared_proficiency" "proficiency_level" DEFAULT 'intermediate' NOT NULL,
	"years_experience" numeric(4, 1),
	"last_used_year" integer,
	"origin" "claim_origin" DEFAULT 'recruiter_entered' NOT NULL,
	"ai_confidence" numeric(4, 3),
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"evidence_document_id" uuid,
	"evidence_notes" text,
	"reviewer_id" uuid,
	"reviewed_at" timestamp with time zone,
	"expires_at" date
);
--> statement-breakpoint
CREATE TABLE "candidate_work_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"candidate_id" uuid NOT NULL,
	"country" text NOT NULL,
	"type" "work_auth_type" NOT NULL,
	"valid_from" date,
	"valid_until" date,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"evidence_document_id" uuid,
	"reviewer_id" uuid,
	"reviewed_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"phone_normalized" text,
	"city" text,
	"country" text,
	"date_of_birth" date,
	"headline" text,
	"summary" text,
	"status" "candidate_status" DEFAULT 'new' NOT NULL,
	"owner_id" uuid,
	"primary_source_id" uuid,
	"citizenships" text[] DEFAULT '{}'::text[] NOT NULL,
	"passport_country" text,
	"passport_expiry" date,
	"passport_verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"military_role" text,
	"military_unit" text,
	"military_rank" text,
	"military_service_start" date,
	"military_service_end" date,
	"years_experience" numeric(4, 1),
	"willing_to_relocate" boolean,
	"relocation_constraints" text,
	"preferred_countries" text[] DEFAULT '{}'::text[] NOT NULL,
	"external_ref" text,
	"merged_into_id" uuid,
	"merged_at" timestamp with time zone,
	"extraction_suggestions" jsonb,
	"extraction_reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"candidate_id" uuid NOT NULL,
	"scope" "consent_scope" NOT NULL,
	"account_id" uuid,
	"notice_version" text NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"channel" "consent_channel" NOT NULL,
	"evidence" text,
	"evidence_document_id" uuid,
	"recorded_by_id" uuid,
	"withdrawn_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "document_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" uuid,
	"action" "document_access_action" NOT NULL,
	"ip" text,
	"user_agent" text,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"candidate_id" uuid,
	"account_id" uuid,
	"submission_id" uuid,
	"placement_id" uuid,
	"kind" "document_kind" DEFAULT 'other' NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"previous_version_id" uuid,
	"scan_status" "scan_status" DEFAULT 'pending' NOT NULL,
	"is_sensitive" boolean DEFAULT false NOT NULL,
	"extracted_text" text,
	"uploaded_by_id" uuid,
	CONSTRAINT "documents_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "source_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"candidate_id" uuid NOT NULL,
	"source_id" uuid,
	"event_type" "source_event_type" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"import_batch_id" uuid,
	"referrer_name" text,
	"original_candidate_id" uuid,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"type" "source_type" DEFAULT 'other' NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"commission_terms" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requisition_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"requisition_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"kind" "requirement_kind" NOT NULL,
	"field" "requirement_field" NOT NULL,
	"operator" "requirement_operator" NOT NULL,
	"value" jsonb NOT NULL,
	"skill_id" uuid,
	"evidence_requirement" "evidence_requirement" DEFAULT 'declared' NOT NULL,
	"justification" text,
	"weight" numeric(4, 2) DEFAULT '1.00' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requisition_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requisition_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"change_summary" text,
	"requirements_snapshot" jsonb NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"account_id" uuid NOT NULL,
	"contact_id" uuid,
	"role_family_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"location_country" text NOT NULL,
	"location_city" text,
	"site_name" text,
	"start_date" date,
	"end_date" date,
	"duration_weeks" integer,
	"headcount_approved" integer DEFAULT 1 NOT NULL,
	"status" "requisition_status" DEFAULT 'draft' NOT NULL,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"owner_id" uuid,
	"bill_rate_amount" numeric(12, 2),
	"bill_rate_currency" text,
	"bill_rate_period" "pay_period",
	"pay_rate_amount" numeric(12, 2),
	"pay_rate_currency" text,
	"pay_rate_period" "pay_period",
	"current_version" integer DEFAULT 1 NOT NULL,
	"external_ref" text,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"close_reason" text
);
--> statement-breakpoint
CREATE TABLE "disclosures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"submission_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"contact_id" uuid,
	"consent_id" uuid NOT NULL,
	"channel" "disclosure_channel" NOT NULL,
	"fields_shared" jsonb NOT NULL,
	"document_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary_text" text,
	"shared_by_id" uuid,
	"shared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"submission_id" uuid NOT NULL,
	"type" "interview_type" NOT NULL,
	"status" "interview_status" DEFAULT 'scheduled' NOT NULL,
	"outcome" "interview_outcome" DEFAULT 'pending' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"interviewer_id" uuid,
	"customer_contact_id" uuid,
	"location" text,
	"meeting_link" text,
	"notes" text,
	"summary" text,
	"transcript_document_id" uuid,
	"ai_disclosure_shown_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "match_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requisition_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"submission_id" uuid,
	"action" "match_feedback_action" NOT NULL,
	"reason" text,
	"ranking_version" text,
	"requirement_version" integer,
	"score" numeric(6, 3),
	"eligibility" "eligibility_outcome",
	"user_id" uuid,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"submission_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"requisition_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"status" "placement_status" DEFAULT 'reserved' NOT NULL,
	"planned_start" date NOT NULL,
	"planned_end" date,
	"actual_start" date,
	"actual_end" date,
	"bill_rate_amount" numeric(12, 2),
	"bill_rate_currency" text,
	"bill_rate_period" "pay_period",
	"pay_rate_amount" numeric(12, 2),
	"pay_rate_currency" text,
	"pay_rate_period" "pay_period",
	"gross_net" "gross_net" DEFAULT 'gross' NOT NULL,
	"replacement_of_id" uuid,
	"extension_of_id" uuid,
	"cancellation_reason" "cancellation_reason",
	"cancellation_notes" text,
	"owner_id" uuid,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "submission_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submission_id" uuid NOT NULL,
	"from_stage" "submission_stage",
	"to_stage" "submission_stage" NOT NULL,
	"reason" "decision_reason",
	"notes" text,
	"changed_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"requisition_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"stage" "submission_stage" DEFAULT 'sourced' NOT NULL,
	"eligibility" "eligibility_outcome" DEFAULT 'review' NOT NULL,
	"match_score" numeric(6, 3),
	"match_snapshot" jsonb,
	"requirement_version" integer DEFAULT 1 NOT NULL,
	"ranking_version" text,
	"owner_id" uuid,
	"source_id" uuid,
	"interest_confirmed_at" timestamp with time zone,
	"availability_confirmed_at" timestamp with time zone,
	"sharing_consent_id" uuid,
	"presented_at" timestamp with time zone,
	"offered_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"decision_reason" "decision_reason",
	"decision_notes" text,
	"closed_at" timestamp with time zone,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"type" "activity_type" DEFAULT 'note' NOT NULL,
	"subject" text NOT NULL,
	"body" text,
	"candidate_id" uuid,
	"account_id" uuid,
	"contact_id" uuid,
	"requisition_id" uuid,
	"submission_id" uuid,
	"placement_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid
);
--> statement-breakpoint
CREATE TABLE "ai_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purpose" "ai_purpose" NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"entity_type" text,
	"entity_id" uuid,
	"input" jsonb,
	"output" jsonb,
	"confidence" numeric(4, 3),
	"latency_ms" integer,
	"status" text NOT NULL,
	"error" text,
	"user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger" "automation_trigger" NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"action" "automation_action" NOT NULL,
	"action_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rule_id" uuid NOT NULL,
	"trigger_event" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" "automation_run_status" NOT NULL,
	"error" text,
	"details" jsonb,
	CONSTRAINT "automation_runs_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"entity" "import_entity" NOT NULL,
	"source_id" uuid,
	"filename" text NOT NULL,
	"status" "import_status" DEFAULT 'previewed' NOT NULL,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"imported_rows" integer DEFAULT 0 NOT NULL,
	"error_rows" integer DEFAULT 0 NOT NULL,
	"duplicate_rows" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duplicates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_record_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"rolled_back_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "integration_error_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"integration" text NOT NULL,
	"operation" text NOT NULL,
	"error_message" text NOT NULL,
	"error_code" text,
	"payload" jsonb,
	"job_id" uuid,
	"attempts" integer DEFAULT 1 NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"last_error" text,
	"result" jsonb,
	"idempotency_key" text,
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"channel" "message_channel" NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"provider_template_id" text,
	"subject" text,
	"body" text NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "template_status" DEFAULT 'draft' NOT NULL,
	"category" text
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"channel" "message_channel" NOT NULL,
	"direction" "message_direction" DEFAULT 'outbound' NOT NULL,
	"status" "message_status" DEFAULT 'queued' NOT NULL,
	"candidate_id" uuid,
	"contact_id" uuid,
	"submission_id" uuid,
	"template_id" uuid,
	"to_address" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"variables" jsonb,
	"provider_message_id" text,
	"send_key" text NOT NULL,
	"error_message" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consent_id" uuid,
	"fallback_task_id" uuid,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	CONSTRAINT "messages_send_key_unique" UNIQUE("send_key")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" "task_type" DEFAULT 'other' NOT NULL,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"due_at" timestamp with time zone,
	"owner_id" uuid,
	"candidate_id" uuid,
	"account_id" uuid,
	"requisition_id" uuid,
	"submission_id" uuid,
	"placement_id" uuid,
	"message_id" uuid,
	"completed_at" timestamp with time zone,
	"completed_by_id" uuid,
	"dedupe_key" text,
	CONSTRAINT "tasks_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider" text NOT NULL,
	"external_event_id" text NOT NULL,
	"signature_valid" boolean NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "webhook_events_external_event_id_unique" UNIQUE("external_event_id")
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_audit_log" ADD CONSTRAINT "security_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_families" ADD CONSTRAINT "role_families_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_categories" ADD CONSTRAINT "skill_categories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_synonyms" ADD CONSTRAINT "skill_synonyms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_synonyms" ADD CONSTRAINT "skill_synonyms_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_category_id_skill_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."skill_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_availability" ADD CONSTRAINT "candidate_availability_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_availability" ADD CONSTRAINT "candidate_availability_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_availability" ADD CONSTRAINT "candidate_availability_confirmed_by_id_users_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_compensation" ADD CONSTRAINT "candidate_compensation_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_compensation" ADD CONSTRAINT "candidate_compensation_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_languages" ADD CONSTRAINT "candidate_languages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_languages" ADD CONSTRAINT "candidate_languages_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_languages" ADD CONSTRAINT "candidate_languages_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_merges" ADD CONSTRAINT "candidate_merges_primary_candidate_id_candidates_id_fk" FOREIGN KEY ("primary_candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_merges" ADD CONSTRAINT "candidate_merges_merged_candidate_id_candidates_id_fk" FOREIGN KEY ("merged_candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_merges" ADD CONSTRAINT "candidate_merges_merged_by_id_users_id_fk" FOREIGN KEY ("merged_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_merges" ADD CONSTRAINT "candidate_merges_undone_by_id_users_id_fk" FOREIGN KEY ("undone_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_skill_claims" ADD CONSTRAINT "candidate_skill_claims_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_skill_claims" ADD CONSTRAINT "candidate_skill_claims_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_skill_claims" ADD CONSTRAINT "candidate_skill_claims_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_skill_claims" ADD CONSTRAINT "candidate_skill_claims_evidence_document_id_documents_id_fk" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_skill_claims" ADD CONSTRAINT "candidate_skill_claims_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_work_authorizations" ADD CONSTRAINT "candidate_work_authorizations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_work_authorizations" ADD CONSTRAINT "candidate_work_authorizations_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_work_authorizations" ADD CONSTRAINT "candidate_work_authorizations_evidence_document_id_documents_id_fk" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_work_authorizations" ADD CONSTRAINT "candidate_work_authorizations_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_primary_source_id_sources_id_fk" FOREIGN KEY ("primary_source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_merged_into_id_candidates_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_evidence_document_id_documents_id_fk" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_withdrawn_by_id_users_id_fk" FOREIGN KEY ("withdrawn_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access_log" ADD CONSTRAINT "document_access_log_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access_log" ADD CONSTRAINT "document_access_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_previous_version_id_documents_id_fk" FOREIGN KEY ("previous_version_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_events" ADD CONSTRAINT "source_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_events" ADD CONSTRAINT "source_events_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_events" ADD CONSTRAINT "source_events_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_events" ADD CONSTRAINT "source_events_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_requirements" ADD CONSTRAINT "requisition_requirements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_requirements" ADD CONSTRAINT "requisition_requirements_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_requirements" ADD CONSTRAINT "requisition_requirements_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_versions" ADD CONSTRAINT "requisition_versions_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_versions" ADD CONSTRAINT "requisition_versions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_role_family_id_role_families_id_fk" FOREIGN KEY ("role_family_id") REFERENCES "public"."role_families"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disclosures" ADD CONSTRAINT "disclosures_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disclosures" ADD CONSTRAINT "disclosures_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disclosures" ADD CONSTRAINT "disclosures_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disclosures" ADD CONSTRAINT "disclosures_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disclosures" ADD CONSTRAINT "disclosures_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disclosures" ADD CONSTRAINT "disclosures_consent_id_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."consents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disclosures" ADD CONSTRAINT "disclosures_shared_by_id_users_id_fk" FOREIGN KEY ("shared_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_interviewer_id_users_id_fk" FOREIGN KEY ("interviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_customer_contact_id_contacts_id_fk" FOREIGN KEY ("customer_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_transcript_document_id_documents_id_fk" FOREIGN KEY ("transcript_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_feedback" ADD CONSTRAINT "match_feedback_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_feedback" ADD CONSTRAINT "match_feedback_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_feedback" ADD CONSTRAINT "match_feedback_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_feedback" ADD CONSTRAINT "match_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_replacement_of_id_placements_id_fk" FOREIGN KEY ("replacement_of_id") REFERENCES "public"."placements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_extension_of_id_placements_id_fk" FOREIGN KEY ("extension_of_id") REFERENCES "public"."placements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_stage_history" ADD CONSTRAINT "submission_stage_history_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_stage_history" ADD CONSTRAINT "submission_stage_history_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_sharing_consent_id_consents_id_fk" FOREIGN KEY ("sharing_consent_id") REFERENCES "public"."consents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_audit_log" ADD CONSTRAINT "ai_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_rule_id_automation_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_error_log" ADD CONSTRAINT "integration_error_log_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_fallback_task_id_tasks_id_fk" FOREIGN KEY ("fallback_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_id_users_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "saved_filters_user_entity_idx" ON "saved_filters" USING btree ("user_id","entity");--> statement-breakpoint
CREATE INDEX "security_audit_user_idx" ON "security_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "security_audit_created_idx" ON "security_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "security_audit_status_idx" ON "security_audit_log" USING btree ("status_code");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "role_families_active_idx" ON "role_families" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "skill_categories_sort_idx" ON "skill_categories" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_synonyms_skill_term_uq" ON "skill_synonyms" USING btree ("skill_id","term");--> statement-breakpoint
CREATE INDEX "skill_synonyms_term_idx" ON "skill_synonyms" USING btree ("term");--> statement-breakpoint
CREATE INDEX "skills_name_idx" ON "skills" USING btree ("name");--> statement-breakpoint
CREATE INDEX "skills_category_idx" ON "skills" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "skills_owner_idx" ON "skills" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "skills_active_idx" ON "skills" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "accounts_name_idx" ON "accounts" USING btree ("name");--> statement-breakpoint
CREATE INDEX "accounts_type_idx" ON "accounts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "accounts_status_idx" ON "accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "accounts_owner_idx" ON "accounts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "accounts_country_idx" ON "accounts" USING btree ("country");--> statement-breakpoint
CREATE INDEX "contacts_account_idx" ON "contacts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "contacts_email_idx" ON "contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "contacts_last_name_idx" ON "contacts" USING btree ("last_name");--> statement-breakpoint
CREATE INDEX "candidate_availability_candidate_current_idx" ON "candidate_availability" USING btree ("candidate_id","is_current");--> statement-breakpoint
CREATE INDEX "candidate_availability_from_idx" ON "candidate_availability" USING btree ("available_from");--> statement-breakpoint
CREATE INDEX "candidate_availability_confirmed_idx" ON "candidate_availability" USING btree ("last_confirmed_at");--> statement-breakpoint
CREATE INDEX "candidate_compensation_candidate_idx" ON "candidate_compensation" USING btree ("candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_languages_uq" ON "candidate_languages" USING btree ("candidate_id","language") WHERE "candidate_languages"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "candidate_languages_language_idx" ON "candidate_languages" USING btree ("language");--> statement-breakpoint
CREATE INDEX "candidate_merges_primary_idx" ON "candidate_merges" USING btree ("primary_candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_merges_merged_idx" ON "candidate_merges" USING btree ("merged_candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_skill_claims_uq" ON "candidate_skill_claims" USING btree ("candidate_id","skill_id") WHERE "candidate_skill_claims"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "candidate_skill_claims_skill_idx" ON "candidate_skill_claims" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "candidate_skill_claims_verification_idx" ON "candidate_skill_claims" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "candidate_skill_claims_expires_idx" ON "candidate_skill_claims" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "candidate_work_auth_candidate_country_idx" ON "candidate_work_authorizations" USING btree ("candidate_id","country");--> statement-breakpoint
CREATE INDEX "candidate_work_auth_valid_until_idx" ON "candidate_work_authorizations" USING btree ("valid_until");--> statement-breakpoint
CREATE INDEX "candidates_email_idx" ON "candidates" USING btree ("email");--> statement-breakpoint
CREATE INDEX "candidates_phone_idx" ON "candidates" USING btree ("phone_normalized");--> statement-breakpoint
CREATE INDEX "candidates_last_name_idx" ON "candidates" USING btree ("last_name");--> statement-breakpoint
CREATE INDEX "candidates_status_idx" ON "candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "candidates_owner_idx" ON "candidates" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "candidates_source_idx" ON "candidates" USING btree ("primary_source_id");--> statement-breakpoint
CREATE INDEX "candidates_merged_idx" ON "candidates" USING btree ("merged_into_id");--> statement-breakpoint
CREATE INDEX "candidates_created_idx" ON "candidates" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "candidates_external_ref_idx" ON "candidates" USING btree ("external_ref");--> statement-breakpoint
CREATE INDEX "consents_candidate_scope_idx" ON "consents" USING btree ("candidate_id","scope");--> statement-breakpoint
CREATE INDEX "consents_account_idx" ON "consents" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "consents_withdrawn_idx" ON "consents" USING btree ("withdrawn_at");--> statement-breakpoint
CREATE INDEX "document_access_document_idx" ON "document_access_log" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_access_user_idx" ON "document_access_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "documents_candidate_idx" ON "documents" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "documents_account_idx" ON "documents" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "documents_submission_idx" ON "documents" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "documents_placement_idx" ON "documents" USING btree ("placement_id");--> statement-breakpoint
CREATE INDEX "documents_kind_idx" ON "documents" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "documents_sha_idx" ON "documents" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "source_events_candidate_idx" ON "source_events" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "source_events_source_idx" ON "source_events" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "source_events_batch_idx" ON "source_events" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "source_events_occurred_idx" ON "source_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "sources_name_idx" ON "sources" USING btree ("name");--> statement-breakpoint
CREATE INDEX "sources_type_idx" ON "sources" USING btree ("type");--> statement-breakpoint
CREATE INDEX "requisition_requirements_req_version_idx" ON "requisition_requirements" USING btree ("requisition_id","version");--> statement-breakpoint
CREATE INDEX "requisition_requirements_skill_idx" ON "requisition_requirements" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "requisition_requirements_kind_idx" ON "requisition_requirements" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "requisition_versions_uq" ON "requisition_versions" USING btree ("requisition_id","version");--> statement-breakpoint
CREATE INDEX "requisitions_account_idx" ON "requisitions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "requisitions_status_idx" ON "requisitions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "requisitions_owner_idx" ON "requisitions" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "requisitions_start_idx" ON "requisitions" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "requisitions_role_family_idx" ON "requisitions" USING btree ("role_family_id");--> statement-breakpoint
CREATE INDEX "requisitions_priority_idx" ON "requisitions" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "requisitions_title_idx" ON "requisitions" USING btree ("title");--> statement-breakpoint
CREATE INDEX "disclosures_submission_idx" ON "disclosures" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "disclosures_candidate_idx" ON "disclosures" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "disclosures_account_idx" ON "disclosures" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "disclosures_consent_idx" ON "disclosures" USING btree ("consent_id");--> statement-breakpoint
CREATE INDEX "interviews_submission_idx" ON "interviews" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "interviews_scheduled_idx" ON "interviews" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "interviews_interviewer_idx" ON "interviews" USING btree ("interviewer_id");--> statement-breakpoint
CREATE INDEX "interviews_status_idx" ON "interviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "match_feedback_requisition_idx" ON "match_feedback" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "match_feedback_candidate_idx" ON "match_feedback" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "placements_submission_idx" ON "placements" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "placements_candidate_idx" ON "placements" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "placements_requisition_idx" ON "placements" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "placements_account_idx" ON "placements" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "placements_status_idx" ON "placements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "placements_owner_idx" ON "placements" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "placements_candidate_dates_idx" ON "placements" USING btree ("candidate_id","planned_start","planned_end");--> statement-breakpoint
CREATE INDEX "submission_stage_history_submission_idx" ON "submission_stage_history" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_requisition_candidate_uq" ON "submissions" USING btree ("requisition_id","candidate_id") WHERE "submissions"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "submissions_candidate_idx" ON "submissions" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "submissions_stage_idx" ON "submissions" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "submissions_owner_idx" ON "submissions" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "submissions_eligibility_idx" ON "submissions" USING btree ("eligibility");--> statement-breakpoint
CREATE INDEX "submissions_stage_changed_idx" ON "submissions" USING btree ("stage_changed_at");--> statement-breakpoint
CREATE INDEX "activities_candidate_idx" ON "activities" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "activities_account_idx" ON "activities" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "activities_requisition_idx" ON "activities" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "activities_submission_idx" ON "activities" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "activities_placement_idx" ON "activities" USING btree ("placement_id");--> statement-breakpoint
CREATE INDEX "activities_occurred_idx" ON "activities" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "activities_actor_idx" ON "activities" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "ai_audit_entity_idx" ON "ai_audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "ai_audit_created_idx" ON "ai_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "automation_rules_trigger_active_idx" ON "automation_rules" USING btree ("trigger","is_active");--> statement-breakpoint
CREATE INDEX "automation_runs_rule_idx" ON "automation_runs" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "automation_runs_entity_idx" ON "automation_runs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "import_batches_status_idx" ON "import_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "import_batches_source_idx" ON "import_batches" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "integration_error_integration_idx" ON "integration_error_log" USING btree ("integration");--> statement-breakpoint
CREATE INDEX "integration_error_created_idx" ON "integration_error_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "jobs_status_run_at_idx" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "jobs_type_idx" ON "jobs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "message_templates_channel_status_idx" ON "message_templates" USING btree ("channel","status");--> statement-breakpoint
CREATE INDEX "messages_candidate_idx" ON "messages" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "messages_status_idx" ON "messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "messages_submission_idx" ON "messages" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "messages_provider_id_idx" ON "messages" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "messages_created_idx" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tasks_owner_status_idx" ON "tasks" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "tasks_due_idx" ON "tasks" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "tasks_type_idx" ON "tasks" USING btree ("type");--> statement-breakpoint
CREATE INDEX "tasks_candidate_idx" ON "tasks" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "tasks_account_idx" ON "tasks" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "tasks_requisition_idx" ON "tasks" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "tasks_submission_idx" ON "tasks" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "tasks_placement_idx" ON "tasks" USING btree ("placement_id");--> statement-breakpoint
CREATE INDEX "webhook_events_provider_idx" ON "webhook_events" USING btree ("provider");