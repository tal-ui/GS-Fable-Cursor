import { pgEnum } from "drizzle-orm/pg-core";

// Access & security
export const userRoleEnum = pgEnum("user_role", ["super_admin", "standard", "read_only"]);
export const userStatusEnum = pgEnum("user_status", ["pending", "active", "deactivated"]);
export const auditActionEnum = pgEnum("audit_action", [
  "create",
  "update",
  "delete",
  "restore",
  "merge",
  "verify",
  "disclose",
  "export",
  "login",
  "logout",
  "role_change",
  "override",
  "reserve_seat",
  "release_seat",
  "retention_hold",
  "anonymize",
]);
export const notificationTypeEnum = pgEnum("notification_type", ["info", "task", "message", "system", "security"]);

// Candidate domain
export const candidateStatusEnum = pgEnum("candidate_status", [
  "new",
  "screening",
  "active",
  "placed",
  "unavailable",
  "withdrawn",
  "archived",
]);
export const proficiencyLevelEnum = pgEnum("proficiency_level", ["basic", "intermediate", "advanced", "expert"]);
export const languageProficiencyEnum = pgEnum("language_proficiency", [
  "basic",
  "conversational",
  "professional",
  "fluent",
  "native",
]);
export const verificationStatusEnum = pgEnum("verification_status", [
  "unverified",
  "pending_review",
  "verified",
  "rejected",
  "expired",
]);
export const claimOriginEnum = pgEnum("claim_origin", ["candidate_declared", "ai_extracted", "recruiter_entered", "imported"]);
export const workAuthTypeEnum = pgEnum("work_auth_type", [
  "citizen",
  "permanent_resident",
  "work_permit",
  "visa_sponsorship_required",
  "none",
]);
export const rotationPreferenceEnum = pgEnum("rotation_preference", [
  "no_preference",
  "short_rotation",
  "long_rotation",
  "fixed_term",
  "permanent",
]);
export const payPeriodEnum = pgEnum("pay_period", ["hourly", "daily", "weekly", "monthly", "annual"]);
export const grossNetEnum = pgEnum("gross_net", ["gross", "net"]);
export const compensationTypeEnum = pgEnum("compensation_type", ["expected", "minimum", "current", "offered"]);
export const consentScopeEnum = pgEnum("consent_scope", ["process_profile", "communicate", "share_with_customer"]);
export const consentChannelEnum = pgEnum("consent_channel", ["web_form", "whatsapp", "email", "phone", "paper", "import"]);
export const documentKindEnum = pgEnum("document_kind", [
  "cv",
  "passport",
  "id_document",
  "certificate",
  "license",
  "contract",
  "photo",
  "transcript",
  "other",
]);
export const scanStatusEnum = pgEnum("scan_status", ["pending", "clean", "infected", "skipped"]);
export const documentAccessActionEnum = pgEnum("document_access_action", ["view", "download", "share", "upload", "delete"]);
export const sourceTypeEnum = pgEnum("source_type", [
  "agency",
  "referral",
  "job_board",
  "website",
  "social",
  "import",
  "walk_in",
  "partner",
  "other",
]);
export const sourceEventTypeEnum = pgEnum("source_event_type", ["applied", "imported", "referred", "re_referred", "merged"]);

// Employer CRM
export const accountTypeEnum = pgEnum("account_type", [
  "employer",
  "agency_partner",
  "government",
  "subcontractor",
  "vendor",
  "other",
]);
export const accountStatusEnum = pgEnum("account_status", ["prospect", "active", "inactive", "blocked"]);

// Requisitions & matching
export const requisitionStatusEnum = pgEnum("requisition_status", ["draft", "open", "on_hold", "filled", "closed", "cancelled"]);
export const priorityEnum = pgEnum("priority", ["low", "medium", "high", "urgent"]);
export const requirementKindEnum = pgEnum("requirement_kind", ["mandatory", "preferred"]);
export const requirementFieldEnum = pgEnum("requirement_field", [
  "skill",
  "language",
  "work_authorization",
  "citizenship",
  "availability_from",
  "availability_duration_weeks",
  "relocation",
  "compensation_max",
  "experience_years",
  "military_role",
  "certification",
  "location_country",
]);
export const requirementOperatorEnum = pgEnum("requirement_operator", [
  "equals",
  "not_equals",
  "gte",
  "lte",
  "in",
  "not_in",
  "contains",
  "before",
  "after",
  "exists",
]);
export const evidenceRequirementEnum = pgEnum("evidence_requirement", ["none", "declared", "verified"]);
export const eligibilityOutcomeEnum = pgEnum("eligibility_outcome", ["eligible", "review", "ineligible"]);

// Pipeline
export const submissionStageEnum = pgEnum("submission_stage", [
  "sourced",
  "contacted",
  "interested",
  "screening",
  "interviewing",
  "presented",
  "customer_review",
  "offered",
  "accepted",
  "placed",
  "declined_by_candidate",
  "rejected_by_customer",
  "withdrawn",
  "not_eligible",
]);
export const decisionReasonEnum = pgEnum("decision_reason", [
  "compensation_mismatch",
  "availability_conflict",
  "location_mismatch",
  "missing_evidence",
  "failed_interview",
  "customer_preference",
  "candidate_withdrew",
  "duplicate",
  "seat_unavailable",
  "other",
]);
export const interviewTypeEnum = pgEnum("interview_type", [
  "screening_call",
  "technical",
  "customer_interview",
  "ai_chat_screening",
  "reference_check",
]);
export const interviewStatusEnum = pgEnum("interview_status", ["scheduled", "completed", "cancelled", "no_show"]);
export const interviewOutcomeEnum = pgEnum("interview_outcome", ["pending", "pass", "fail", "hold"]);
export const disclosureChannelEnum = pgEnum("disclosure_channel", ["email", "whatsapp", "phone", "in_person", "portal"]);
export const placementStatusEnum = pgEnum("placement_status", [
  "reserved",
  "started",
  "active",
  "extended",
  "completed",
  "cancelled",
  "replaced",
]);
export const cancellationReasonEnum = pgEnum("cancellation_reason", [
  "candidate_withdrew",
  "customer_cancelled",
  "failed_start",
  "performance",
  "compliance",
  "other",
]);
export const matchFeedbackActionEnum = pgEnum("match_feedback_action", [
  "accepted",
  "overridden_include",
  "overridden_exclude",
  "rejected",
]);

// Operations
export const activityTypeEnum = pgEnum("activity_type", ["note", "call", "email", "whatsapp", "meeting", "status_change", "system"]);
export const taskTypeEnum = pgEnum("task_type", [
  "follow_up",
  "verification",
  "availability_check",
  "eligibility_review",
  "message_failed",
  "stalled_request",
  "manual_contact",
  "placement_checklist",
  "import_review",
  "retention_review",
  "other",
]);
export const taskStatusEnum = pgEnum("task_status", ["open", "in_progress", "done", "cancelled"]);
export const messageChannelEnum = pgEnum("message_channel", ["whatsapp", "email", "sms", "manual"]);
export const messageDirectionEnum = pgEnum("message_direction", ["outbound", "inbound"]);
export const messageStatusEnum = pgEnum("message_status", [
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
  "manual_pending",
  "suppressed",
]);
export const templateStatusEnum = pgEnum("template_status", ["draft", "approved", "rejected"]);
export const jobStatusEnum = pgEnum("job_status", ["queued", "running", "succeeded", "failed", "dead"]);
export const importEntityEnum = pgEnum("import_entity", ["candidates", "accounts", "requisitions"]);
export const importStatusEnum = pgEnum("import_status", ["previewed", "importing", "completed", "failed", "rolled_back"]);
export const automationTriggerEnum = pgEnum("automation_trigger", [
  "submission_stage_changed",
  "placement_status_changed",
  "message_failed",
  "task_overdue",
  "candidate_created",
  "requisition_created",
  "verification_changed",
  "schedule_daily",
]);
export const automationActionEnum = pgEnum("automation_action", [
  "create_task",
  "notify_owner",
  "queue_message",
  "update_candidate_status",
]);
export const automationRunStatusEnum = pgEnum("automation_run_status", ["succeeded", "failed", "skipped"]);
export const aiPurposeEnum = pgEnum("ai_purpose", ["cv_extraction", "semantic_ranking", "screening_summary"]);
