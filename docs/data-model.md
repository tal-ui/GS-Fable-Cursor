# Data model

Generated from `src/db/schema` by `pnpm docs:schema`. The executable DDL lives in `drizzle/0000_init.sql`.

Every business object carries the system columns `id` (uuid), `created_at`, `updated_at`, `created_by` and `is_deleted` (soft delete). Append-only logs carry `id` and `created_at` only.

## Entity relationship diagram

```mermaid
erDiagram
  app_settings {
    text key
    jsonb value
    text description
    uuid updated_by FK
  }
  audit_log {
    uuid id PK
    text entity_type
    uuid entity_id
    enum action
    uuid actor_id FK
    jsonb before
    jsonb after
    text ip
    text note
  }
  notifications {
    uuid id PK
    uuid user_id FK
    enum type
    text title
    text body
    text link
    timestamp read_at
  }
  saved_filters {
    uuid id PK
    uuid user_id FK
    text entity
    text name
    jsonb filters
    boolean is_default
  }
  security_audit_log {
    uuid id PK
    uuid user_id FK
    text action
    text resource
    text method
    text path
    integer status_code
    text ip
    text user_agent
    jsonb details
  }
  sessions {
    uuid id PK
    uuid user_id FK
    text token_hash UK
    timestamp expires_at
    timestamp last_active_at
    text ip
    text user_agent
  }
  users {
    uuid id PK
    text email UK
    text name
    text avatar_url
    text google_sub UK
    enum role
    enum status
    boolean can_verify
    text job_title
    text phone
    jsonb notification_prefs
    timestamp last_login_at
    timestamp activated_at
  }
  role_families {
    uuid id PK
    text code UK
    text name
    text description
    jsonb ranking_weights
    text ranking_version
    boolean is_active
  }
  skill_categories {
    uuid id PK
    text name UK
    text description
    integer sort_order
  }
  skill_synonyms {
    uuid id PK
    uuid skill_id FK
    text term
  }
  skills {
    uuid id PK
    text code UK
    text name
    uuid category_id FK
    text description
    uuid owner_id FK
    boolean is_active
    integer default_validity_months
  }
  accounts {
    uuid id PK
    text name
    enum type
    enum status
    text industry
    text website
    text country
    text city
    text address_line
    uuid owner_id FK
    text currency
    integer payment_terms_days
    text commercial_terms
    text notes
    text external_ref
  }
  contacts {
    uuid id PK
    uuid account_id FK
    text first_name
    text last_name
    text email
    text phone
    text title
    boolean is_primary
    boolean receives_shortlists
    text notes
  }
  candidate_availability {
    uuid id PK
    uuid candidate_id FK
    date available_from
    date available_until
    integer min_duration_weeks
    integer max_duration_weeks
    enum rotation_preference
    boolean willing_to_relocate
    text relocation_constraints
    timestamp last_confirmed_at
    uuid confirmed_by_id FK
    text confirmation_channel
    boolean is_current
    text notes
  }
  candidate_compensation {
    uuid id PK
    uuid candidate_id FK
    enum type
    numeric_12_ amount
    text currency
    enum period
    enum gross_net
    date effective_date
    text notes
  }
  candidate_languages {
    uuid id PK
    uuid candidate_id FK
    text language
    enum proficiency
    enum verification_status
    uuid reviewer_id FK
    timestamp reviewed_at
  }
  candidate_merges {
    uuid id PK
    uuid primary_candidate_id FK
    uuid merged_candidate_id FK
    uuid merged_by_id FK
    text reason
    jsonb snapshot
    timestamp undone_at
    uuid undone_by_id FK
  }
  candidate_skill_claims {
    uuid id PK
    uuid candidate_id FK
    uuid skill_id FK
    text original_wording
    enum declared_proficiency
    numeric_4_ years_experience
    integer last_used_year
    enum origin
    numeric_4_ ai_confidence
    enum verification_status
    uuid evidence_document_id FK
    text evidence_notes
    uuid reviewer_id FK
    timestamp reviewed_at
    date expires_at
  }
  candidate_work_authorizations {
    uuid id PK
    uuid candidate_id FK
    text country
    enum type
    date valid_from
    date valid_until
    enum verification_status
    uuid evidence_document_id FK
    uuid reviewer_id FK
    timestamp reviewed_at
    text notes
  }
  candidates {
    uuid id PK
    text first_name
    text last_name
    text email
    text phone
    text phone_normalized
    text city
    text country
    date date_of_birth
    text headline
    text summary
    enum status
    uuid owner_id FK
    uuid primary_source_id FK
    text__ citizenships
    text passport_country
    date passport_expiry
    enum passport_verification_status
    text military_role
    text military_unit
    text military_rank
    date military_service_start
    date military_service_end
    numeric_4_ years_experience
    boolean willing_to_relocate
    text relocation_constraints
    text__ preferred_countries
    text external_ref
    uuid merged_into_id FK
    timestamp merged_at
    jsonb extraction_suggestions
    timestamp extraction_reviewed_at
    text retention_hold_reason
    date retention_hold_until
    timestamp anonymized_at
  }
  consents {
    uuid id PK
    uuid candidate_id FK
    enum scope
    uuid account_id FK
    text notice_version
    timestamp granted_at
    timestamp withdrawn_at
    enum channel
    text evidence
    uuid evidence_document_id FK
    uuid recorded_by_id FK
    uuid withdrawn_by_id FK
  }
  document_access_log {
    uuid id PK
    uuid document_id FK
    uuid user_id FK
    enum action
    text ip
    text user_agent
    jsonb details
  }
  documents {
    uuid id PK
    uuid candidate_id FK
    uuid account_id FK
    uuid submission_id FK
    uuid placement_id FK
    enum kind
    text filename
    text mime_type
    integer size_bytes
    text storage_key UK
    text sha256
    integer version
    uuid previous_version_id FK
    enum scan_status
    boolean is_sensitive
    text extracted_text
    uuid uploaded_by_id FK
  }
  source_events {
    uuid id PK
    uuid candidate_id FK
    uuid source_id FK
    enum event_type
    timestamp occurred_at
    uuid import_batch_id FK
    text referrer_name
    uuid original_candidate_id
    jsonb details
  }
  sources {
    uuid id PK
    text name
    enum type
    text contact_name
    text contact_email
    text contact_phone
    text commission_terms
    boolean is_active
  }
  upload_links {
    uuid id PK
    uuid candidate_id FK
    text token_hash UK
    document_kind__ kinds
    text purpose
    integer max_files
    integer used_count
    timestamp expires_at
    timestamp revoked_at
    timestamp last_used_at
    text last_used_ip
  }
  requisition_requirements {
    uuid id PK
    uuid requisition_id FK
    integer version
    enum kind
    enum field
    enum operator
    jsonb value
    uuid skill_id FK
    enum evidence_requirement
    text justification
    numeric_4_ weight
    integer sort_order
  }
  requisition_versions {
    uuid id PK
    uuid requisition_id FK
    integer version
    text change_summary
    jsonb requirements_snapshot
    uuid created_by_id FK
  }
  requisitions {
    uuid id PK
    uuid account_id FK
    uuid contact_id FK
    uuid role_family_id FK
    text title
    text description
    text location_country
    text location_city
    text site_name
    date start_date
    date end_date
    integer duration_weeks
    integer headcount_approved
    enum status
    enum priority
    uuid owner_id FK
    numeric_12_ bill_rate_amount
    text bill_rate_currency
    enum bill_rate_period
    numeric_12_ pay_rate_amount
    text pay_rate_currency
    enum pay_rate_period
    integer current_version
    text external_ref
    timestamp opened_at
    timestamp closed_at
    text close_reason
  }
  disclosures {
    uuid id PK
    uuid submission_id FK
    uuid candidate_id FK
    uuid account_id FK
    uuid contact_id FK
    uuid consent_id FK
    enum channel
    jsonb fields_shared
    jsonb document_ids
    text summary_text
    uuid shared_by_id FK
    timestamp shared_at
    boolean is_revoked
    timestamp revoked_at
    text notes
  }
  interviews {
    uuid id PK
    uuid submission_id FK
    enum type
    enum status
    enum outcome
    timestamp scheduled_at
    integer duration_minutes
    uuid interviewer_id FK
    uuid customer_contact_id FK
    text location
    text meeting_link
    text notes
    text summary
    uuid transcript_document_id FK
    timestamp ai_disclosure_shown_at
    timestamp completed_at
  }
  match_feedback {
    uuid id PK
    uuid requisition_id FK
    uuid candidate_id FK
    uuid submission_id FK
    enum action
    text reason
    text ranking_version
    integer requirement_version
    numeric_6_ score
    enum eligibility
    uuid user_id FK
    text notes
  }
  placements {
    uuid id PK
    uuid submission_id FK
    uuid candidate_id FK
    uuid requisition_id FK
    uuid account_id FK
    enum status
    date planned_start
    date planned_end
    date actual_start
    date actual_end
    numeric_12_ bill_rate_amount
    text bill_rate_currency
    enum bill_rate_period
    numeric_12_ pay_rate_amount
    text pay_rate_currency
    enum pay_rate_period
    enum gross_net
    uuid replacement_of_id FK
    uuid extension_of_id FK
    enum cancellation_reason
    text cancellation_notes
    uuid owner_id FK
    jsonb checklist
    text notes
  }
  submission_stage_history {
    uuid id PK
    uuid submission_id FK
    enum from_stage
    enum to_stage
    enum reason
    text notes
    uuid changed_by_id FK
  }
  submissions {
    uuid id PK
    uuid requisition_id FK
    uuid candidate_id FK
    enum stage
    enum eligibility
    numeric_6_ match_score
    jsonb match_snapshot
    integer requirement_version
    text ranking_version
    uuid owner_id FK
    uuid source_id FK
    timestamp interest_confirmed_at
    timestamp availability_confirmed_at
    uuid sharing_consent_id FK
    timestamp presented_at
    timestamp offered_at
    timestamp accepted_at
    enum decision_reason
    text decision_notes
    timestamp closed_at
    timestamp stage_changed_at
  }
  activities {
    uuid id PK
    enum type
    text subject
    text body
    uuid candidate_id FK
    uuid account_id FK
    uuid contact_id FK
    uuid requisition_id FK
    uuid submission_id FK
    uuid placement_id FK
    timestamp occurred_at
    uuid actor_id FK
  }
  ai_audit_log {
    uuid id PK
    enum purpose
    text provider
    text model
    text entity_type
    uuid entity_id
    jsonb input
    jsonb output
    numeric_4_ confidence
    integer latency_ms
    text status
    text error
    uuid user_id FK
  }
  automation_rules {
    uuid id PK
    text name
    text description
    enum trigger
    jsonb conditions
    enum action
    jsonb action_config
    boolean is_active
    boolean is_system
  }
  automation_runs {
    uuid id PK
    uuid rule_id FK
    text trigger_event
    text entity_type
    uuid entity_id
    text dedupe_key UK
    enum status
    text error
    jsonb details
  }
  import_batches {
    uuid id PK
    enum entity
    uuid source_id FK
    text filename
    enum status
    jsonb mapping
    jsonb rows
    integer total_rows
    integer imported_rows
    integer error_rows
    integer duplicate_rows
    jsonb errors
    jsonb duplicates
    jsonb created_record_ids
    timestamp completed_at
    timestamp rolled_back_at
  }
  integration_error_log {
    uuid id PK
    text integration
    text operation
    text error_message
    text error_code
    jsonb payload
    uuid job_id FK
    integer attempts
    timestamp resolved_at
  }
  jobs {
    uuid id PK
    text type
    jsonb payload
    enum status
    integer attempts
    integer max_attempts
    timestamp run_at
    timestamp locked_at
    text locked_by
    timestamp started_at
    timestamp finished_at
    text last_error
    jsonb result
    text idempotency_key UK
    uuid owner_id FK
  }
  message_templates {
    uuid id PK
    text name
    enum channel
    text language
    text provider_template_id
    text subject
    text body
    jsonb variables
    enum status
    text category
  }
  messages {
    uuid id PK
    enum channel
    enum direction
    enum status
    uuid candidate_id FK
    uuid contact_id FK
    uuid submission_id FK
    uuid template_id FK
    text to_address
    text subject
    text body
    jsonb variables
    text provider_message_id
    text send_key UK
    text error_message
    integer attempts
    uuid consent_id
    uuid fallback_task_id FK
    timestamp sent_at
    timestamp delivered_at
    timestamp read_at
    timestamp failed_at
  }
  tasks {
    uuid id PK
    text title
    text description
    enum type
    enum status
    enum priority
    timestamp due_at
    uuid owner_id FK
    uuid candidate_id FK
    uuid account_id FK
    uuid requisition_id FK
    uuid submission_id FK
    uuid placement_id FK
    uuid message_id FK
    timestamp completed_at
    uuid completed_by_id FK
    text dedupe_key UK
  }
  webhook_events {
    uuid id PK
    text provider
    text external_event_id UK
    boolean signature_valid
    jsonb payload
    timestamp processed_at
    text error
  }
  users ||--o{ app_settings : "updated_by"
  users ||--o{ audit_log : "actor_id"
  users ||--o{ notifications : "user_id"
  users ||--o{ saved_filters : "user_id"
  users ||--o{ saved_filters : "created_by"
  users ||--o{ security_audit_log : "user_id"
  users ||--o{ sessions : "user_id"
  users ||--o{ users : "created_by"
  users ||--o{ role_families : "created_by"
  users ||--o{ skill_categories : "created_by"
  users ||--o{ skill_synonyms : "created_by"
  skills ||--o{ skill_synonyms : "skill_id"
  users ||--o{ skills : "created_by"
  skill_categories ||--o{ skills : "category_id"
  users ||--o{ skills : "owner_id"
  users ||--o{ accounts : "created_by"
  users ||--o{ accounts : "owner_id"
  users ||--o{ contacts : "created_by"
  accounts ||--o{ contacts : "account_id"
  users ||--o{ candidate_availability : "created_by"
  candidates ||--o{ candidate_availability : "candidate_id"
  users ||--o{ candidate_availability : "confirmed_by_id"
  users ||--o{ candidate_compensation : "created_by"
  candidates ||--o{ candidate_compensation : "candidate_id"
  users ||--o{ candidate_languages : "created_by"
  candidates ||--o{ candidate_languages : "candidate_id"
  users ||--o{ candidate_languages : "reviewer_id"
  candidates ||--o{ candidate_merges : "primary_candidate_id"
  candidates ||--o{ candidate_merges : "merged_candidate_id"
  users ||--o{ candidate_merges : "merged_by_id"
  users ||--o{ candidate_merges : "undone_by_id"
  users ||--o{ candidate_skill_claims : "created_by"
  candidates ||--o{ candidate_skill_claims : "candidate_id"
  skills ||--o{ candidate_skill_claims : "skill_id"
  documents ||--o{ candidate_skill_claims : "evidence_document_id"
  users ||--o{ candidate_skill_claims : "reviewer_id"
  users ||--o{ candidate_work_authorizations : "created_by"
  candidates ||--o{ candidate_work_authorizations : "candidate_id"
  documents ||--o{ candidate_work_authorizations : "evidence_document_id"
  users ||--o{ candidate_work_authorizations : "reviewer_id"
  users ||--o{ candidates : "created_by"
  users ||--o{ candidates : "owner_id"
  sources ||--o{ candidates : "primary_source_id"
  candidates ||--o{ candidates : "merged_into_id"
  users ||--o{ consents : "created_by"
  candidates ||--o{ consents : "candidate_id"
  accounts ||--o{ consents : "account_id"
  documents ||--o{ consents : "evidence_document_id"
  users ||--o{ consents : "recorded_by_id"
  users ||--o{ consents : "withdrawn_by_id"
  documents ||--o{ document_access_log : "document_id"
  users ||--o{ document_access_log : "user_id"
  users ||--o{ documents : "created_by"
  candidates ||--o{ documents : "candidate_id"
  accounts ||--o{ documents : "account_id"
  submissions ||--o{ documents : "submission_id"
  placements ||--o{ documents : "placement_id"
  documents ||--o{ documents : "previous_version_id"
  users ||--o{ documents : "uploaded_by_id"
  users ||--o{ source_events : "created_by"
  candidates ||--o{ source_events : "candidate_id"
  sources ||--o{ source_events : "source_id"
  import_batches ||--o{ source_events : "import_batch_id"
  users ||--o{ sources : "created_by"
  users ||--o{ upload_links : "created_by"
  candidates ||--o{ upload_links : "candidate_id"
  users ||--o{ requisition_requirements : "created_by"
  requisitions ||--o{ requisition_requirements : "requisition_id"
  skills ||--o{ requisition_requirements : "skill_id"
  requisitions ||--o{ requisition_versions : "requisition_id"
  users ||--o{ requisition_versions : "created_by_id"
  users ||--o{ requisitions : "created_by"
  accounts ||--o{ requisitions : "account_id"
  contacts ||--o{ requisitions : "contact_id"
  role_families ||--o{ requisitions : "role_family_id"
  users ||--o{ requisitions : "owner_id"
  users ||--o{ disclosures : "created_by"
  submissions ||--o{ disclosures : "submission_id"
  candidates ||--o{ disclosures : "candidate_id"
  accounts ||--o{ disclosures : "account_id"
  contacts ||--o{ disclosures : "contact_id"
  consents ||--o{ disclosures : "consent_id"
  users ||--o{ disclosures : "shared_by_id"
  users ||--o{ interviews : "created_by"
  submissions ||--o{ interviews : "submission_id"
  users ||--o{ interviews : "interviewer_id"
  contacts ||--o{ interviews : "customer_contact_id"
  documents ||--o{ interviews : "transcript_document_id"
  requisitions ||--o{ match_feedback : "requisition_id"
  candidates ||--o{ match_feedback : "candidate_id"
  submissions ||--o{ match_feedback : "submission_id"
  users ||--o{ match_feedback : "user_id"
  users ||--o{ placements : "created_by"
  submissions ||--o{ placements : "submission_id"
  candidates ||--o{ placements : "candidate_id"
  requisitions ||--o{ placements : "requisition_id"
  accounts ||--o{ placements : "account_id"
  placements ||--o{ placements : "replacement_of_id"
  placements ||--o{ placements : "extension_of_id"
  users ||--o{ placements : "owner_id"
  submissions ||--o{ submission_stage_history : "submission_id"
  users ||--o{ submission_stage_history : "changed_by_id"
  users ||--o{ submissions : "created_by"
  requisitions ||--o{ submissions : "requisition_id"
  candidates ||--o{ submissions : "candidate_id"
  users ||--o{ submissions : "owner_id"
  sources ||--o{ submissions : "source_id"
  consents ||--o{ submissions : "sharing_consent_id"
  users ||--o{ activities : "created_by"
  candidates ||--o{ activities : "candidate_id"
  accounts ||--o{ activities : "account_id"
  contacts ||--o{ activities : "contact_id"
  requisitions ||--o{ activities : "requisition_id"
  submissions ||--o{ activities : "submission_id"
  placements ||--o{ activities : "placement_id"
  users ||--o{ activities : "actor_id"
  users ||--o{ ai_audit_log : "user_id"
  users ||--o{ automation_rules : "created_by"
  automation_rules ||--o{ automation_runs : "rule_id"
  users ||--o{ import_batches : "created_by"
  sources ||--o{ import_batches : "source_id"
  jobs ||--o{ integration_error_log : "job_id"
  users ||--o{ jobs : "owner_id"
  users ||--o{ message_templates : "created_by"
  users ||--o{ messages : "created_by"
  candidates ||--o{ messages : "candidate_id"
  contacts ||--o{ messages : "contact_id"
  submissions ||--o{ messages : "submission_id"
  message_templates ||--o{ messages : "template_id"
  tasks ||--o{ messages : "fallback_task_id"
  users ||--o{ tasks : "created_by"
  users ||--o{ tasks : "owner_id"
  candidates ||--o{ tasks : "candidate_id"
  accounts ||--o{ tasks : "account_id"
  requisitions ||--o{ tasks : "requisition_id"
  submissions ||--o{ tasks : "submission_id"
  placements ||--o{ tasks : "placement_id"
  messages ||--o{ tasks : "message_id"
  users ||--o{ tasks : "completed_by_id"
```

## Enumerations

- `account_status`: `prospect`, `active`, `inactive`, `blocked`
- `account_type`: `employer`, `agency_partner`, `government`, `subcontractor`, `vendor`, `other`
- `activity_type`: `note`, `call`, `email`, `whatsapp`, `meeting`, `status_change`, `system`
- `ai_purpose`: `cv_extraction`, `semantic_ranking`, `screening_summary`
- `audit_action`: `create`, `update`, `delete`, `restore`, `merge`, `verify`, `disclose`, `export`, `login`, `logout`, `role_change`, `override`, `reserve_seat`, `release_seat`, `retention_hold`, `anonymize`
- `automation_action`: `create_task`, `notify_owner`, `queue_message`, `update_candidate_status`
- `automation_run_status`: `succeeded`, `failed`, `skipped`
- `automation_trigger`: `submission_stage_changed`, `placement_status_changed`, `message_failed`, `task_overdue`, `candidate_created`, `requisition_created`, `verification_changed`, `schedule_daily`
- `cancellation_reason`: `candidate_withdrew`, `customer_cancelled`, `failed_start`, `performance`, `compliance`, `other`
- `candidate_status`: `new`, `screening`, `active`, `placed`, `unavailable`, `withdrawn`, `archived`
- `claim_origin`: `candidate_declared`, `ai_extracted`, `recruiter_entered`, `imported`
- `compensation_type`: `expected`, `minimum`, `current`, `offered`
- `consent_channel`: `web_form`, `whatsapp`, `email`, `phone`, `paper`, `import`
- `consent_scope`: `process_profile`, `communicate`, `share_with_customer`
- `decision_reason`: `compensation_mismatch`, `availability_conflict`, `location_mismatch`, `missing_evidence`, `failed_interview`, `customer_preference`, `candidate_withdrew`, `duplicate`, `seat_unavailable`, `other`
- `disclosure_channel`: `email`, `whatsapp`, `phone`, `in_person`, `portal`
- `document_access_action`: `view`, `download`, `share`, `upload`, `delete`
- `document_kind`: `cv`, `passport`, `id_document`, `certificate`, `license`, `contract`, `photo`, `transcript`, `other`
- `eligibility_outcome`: `eligible`, `review`, `ineligible`
- `evidence_requirement`: `none`, `declared`, `verified`
- `gross_net`: `gross`, `net`
- `import_entity`: `candidates`, `accounts`, `requisitions`
- `import_status`: `previewed`, `importing`, `completed`, `failed`, `rolled_back`
- `interview_outcome`: `pending`, `pass`, `fail`, `hold`
- `interview_status`: `scheduled`, `completed`, `cancelled`, `no_show`
- `interview_type`: `screening_call`, `technical`, `customer_interview`, `ai_chat_screening`, `reference_check`
- `job_status`: `queued`, `running`, `succeeded`, `failed`, `dead`
- `language_proficiency`: `basic`, `conversational`, `professional`, `fluent`, `native`
- `match_feedback_action`: `accepted`, `overridden_include`, `overridden_exclude`, `rejected`
- `message_channel`: `whatsapp`, `email`, `sms`, `manual`
- `message_direction`: `outbound`, `inbound`
- `message_status`: `queued`, `sent`, `delivered`, `read`, `failed`, `manual_pending`, `suppressed`
- `notification_type`: `info`, `task`, `message`, `system`, `security`
- `pay_period`: `hourly`, `daily`, `weekly`, `monthly`, `annual`
- `placement_status`: `reserved`, `started`, `active`, `extended`, `completed`, `cancelled`, `replaced`
- `priority`: `low`, `medium`, `high`, `urgent`
- `proficiency_level`: `basic`, `intermediate`, `advanced`, `expert`
- `requirement_field`: `skill`, `language`, `work_authorization`, `citizenship`, `availability_from`, `availability_duration_weeks`, `relocation`, `compensation_max`, `experience_years`, `military_role`, `certification`, `location_country`
- `requirement_kind`: `mandatory`, `preferred`
- `requirement_operator`: `equals`, `not_equals`, `gte`, `lte`, `in`, `not_in`, `contains`, `before`, `after`, `exists`
- `requisition_status`: `draft`, `open`, `on_hold`, `filled`, `closed`, `cancelled`
- `rotation_preference`: `no_preference`, `short_rotation`, `long_rotation`, `fixed_term`, `permanent`
- `scan_status`: `pending`, `clean`, `infected`, `skipped`
- `source_event_type`: `applied`, `imported`, `referred`, `re_referred`, `merged`
- `source_type`: `agency`, `referral`, `job_board`, `website`, `social`, `import`, `walk_in`, `partner`, `other`
- `submission_stage`: `sourced`, `contacted`, `interested`, `screening`, `interviewing`, `presented`, `customer_review`, `offered`, `accepted`, `placed`, `declined_by_candidate`, `rejected_by_customer`, `withdrawn`, `not_eligible`
- `task_status`: `open`, `in_progress`, `done`, `cancelled`
- `task_type`: `follow_up`, `verification`, `availability_check`, `eligibility_review`, `message_failed`, `stalled_request`, `manual_contact`, `placement_checklist`, `import_review`, `retention_review`, `other`
- `template_status`: `draft`, `approved`, `rejected`
- `user_role`: `super_admin`, `standard`, `read_only`
- `user_status`: `pending`, `active`, `deactivated`
- `verification_status`: `unverified`, `pending_review`, `verified`, `rejected`, `expired`
- `work_auth_type`: `citizen`, `permanent_resident`, `work_permit`, `visa_sponsorship_required`, `none`

## Data dictionary

### app_settings

Admin-editable key/value configuration (freshness thresholds, stall days, defaults).

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `key` | text | no |  |  |
| `value` | jsonb | no |  |  |
| `description` | text | yes |  |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `updated_by` | uuid | yes |  | users.id (SET NULL) |

### audit_log

Before/after history for sensitive changes (verification, disclosure, merges, role changes, exports).

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `entity_type` | text | no |  |  |
| `entity_id` | uuid | no |  |  |
| `action` | enum audit_action | no |  |  |
| `actor_id` | uuid | yes |  | users.id (SET NULL) |
| `before` | jsonb | yes |  |  |
| `after` | jsonb | yes |  |  |
| `ip` | text | yes |  |  |
| `note` | text | yes |  |  |

### notifications

In-app notification bell items per user.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `user_id` | uuid | no |  | users.id (CASCADE) |
| `type` | enum notification_type | no | "info" |  |
| `title` | text | no |  |  |
| `body` | text | yes |  |  |
| `link` | text | yes |  |  |
| `read_at` | timestamp with time zone | yes |  |  |

### saved_filters

Per-user saved list filter presets.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `user_id` | uuid | no |  | users.id (CASCADE) |
| `entity` | text | no |  |  |
| `name` | text | no |  |  |
| `filters` | jsonb | no |  |  |
| `is_default` | boolean | no | false |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |

### security_audit_log

Every 401/403 and privileged action with user, path, IP and outcome.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `user_id` | uuid | yes |  | users.id (SET NULL) |
| `action` | text | no |  |  |
| `resource` | text | yes |  |  |
| `method` | text | yes |  |  |
| `path` | text | yes |  |  |
| `status_code` | integer | no |  |  |
| `ip` | text | yes |  |  |
| `user_agent` | text | yes |  |  |
| `details` | jsonb | yes |  |  |

### sessions

Server-side sessions referenced by an HTTP-only cookie (hashed token, 8h idle timeout).

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `user_id` | uuid | no |  | users.id (CASCADE) |
| `token_hash` (unique) | text | no |  |  |
| `expires_at` | timestamp with time zone | no |  |  |
| `last_active_at` | timestamp with time zone | no | now() |  |
| `ip` | text | yes |  |  |
| `user_agent` | text | yes |  |  |
| `created_at` | timestamp with time zone | no | now() |  |

### users

Staff accounts. Google-authenticated; pending until a Super Admin activates and assigns a role.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `email` (unique) | text | no |  |  |
| `name` | text | no |  |  |
| `avatar_url` | text | yes |  |  |
| `google_sub` (unique) | text | yes |  |  |
| `role` | enum user_role | no | "standard" |  |
| `status` | enum user_status | no | "pending" |  |
| `can_verify` | boolean | no | false |  |
| `job_title` | text | yes |  |  |
| `phone` | text | yes |  |  |
| `notification_prefs` | jsonb | no | {"inApp":true,"email":false,"taskReminders":true,"messageFailures":true} |  |
| `last_login_at` | timestamp with time zone | yes |  |  |
| `activated_at` | timestamp with time zone | yes |  |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |

### role_families

Groups of roles sharing agreed ranking weights and a ranking version.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `code` (unique) | text | no |  |  |
| `name` | text | no |  |  |
| `description` | text | yes |  |  |
| `ranking_weights` | jsonb | no | {"skills":0.4,"proficiency":0.15,"experience":0.15,"preferences":0.2,"freshness":0.1} |  |
| `ranking_version` | text | no | "baseline-v1" |  |
| `is_active` | boolean | no | true |  |

### skill_categories

Taxonomy groupings (e.g. Security operations, Medical, Languages).

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `name` (unique) | text | no |  |  |
| `description` | text | yes |  |  |
| `sort_order` | integer | no | 0 |  |

### skill_synonyms

Alternative wordings mapped to a skill for extraction and import normalisation.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `skill_id` | uuid | no |  | skills.id (CASCADE) |
| `term` | text | no |  |  |

### skills

Taxonomy entries with a stable code, owner and optional validity period.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `code` (unique) | text | no |  |  |
| `name` | text | no |  |  |
| `category_id` | uuid | no |  | skill_categories.id (RESTRICT) |
| `description` | text | yes |  |  |
| `owner_id` | uuid | yes |  | users.id (SET NULL) |
| `is_active` | boolean | no | true |  |
| `default_validity_months` | integer | yes |  |  |

### accounts

Employer or partner organisations with type, owner, status and commercial terms.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `name` | text | no |  |  |
| `type` | enum account_type | no | "employer" |  |
| `status` | enum account_status | no | "prospect" |  |
| `industry` | text | yes |  |  |
| `website` | text | yes |  |  |
| `country` | text | yes |  |  |
| `city` | text | yes |  |  |
| `address_line` | text | yes |  |  |
| `owner_id` | uuid | yes |  | users.id (SET NULL) |
| `currency` | text | no | "USD" |  |
| `payment_terms_days` | integer | yes |  |  |
| `commercial_terms` | text | yes |  |  |
| `notes` | text | yes |  |  |
| `external_ref` | text | yes |  |  |

### contacts

People at an account; flags for primary and shortlist recipients.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `account_id` | uuid | no |  | accounts.id (CASCADE) |
| `first_name` | text | no |  |  |
| `last_name` | text | no |  |  |
| `email` | text | yes |  |  |
| `phone` | text | yes |  |  |
| `title` | text | yes |  |  |
| `is_primary` | boolean | no | false |  |
| `receives_shortlists` | boolean | no | false |  |
| `notes` | text | yes |  |  |

### candidate_availability

Dated availability periods with rotation preference and last confirmation.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `candidate_id` | uuid | no |  | candidates.id (CASCADE) |
| `available_from` | date | no |  |  |
| `available_until` | date | yes |  |  |
| `min_duration_weeks` | integer | yes |  |  |
| `max_duration_weeks` | integer | yes |  |  |
| `rotation_preference` | enum rotation_preference | no | "no_preference" |  |
| `willing_to_relocate` | boolean | no | true |  |
| `relocation_constraints` | text | yes |  |  |
| `last_confirmed_at` | timestamp with time zone | yes |  |  |
| `confirmed_by_id` | uuid | yes |  | users.id (SET NULL) |
| `confirmation_channel` | text | yes |  |  |
| `is_current` | boolean | no | true |  |
| `notes` | text | yes |  |  |

### candidate_compensation

Expected/minimum/current compensation with amount, currency, period and gross/net.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `candidate_id` | uuid | no |  | candidates.id (CASCADE) |
| `type` | enum compensation_type | no | "expected" |  |
| `amount` | numeric(12, 2) | no |  |  |
| `currency` | text | no |  |  |
| `period` | enum pay_period | no |  |  |
| `gross_net` | enum gross_net | no | "gross" |  |
| `effective_date` | date | yes |  |  |
| `notes` | text | yes |  |  |

### candidate_languages

Language proficiency claims with verification.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `candidate_id` | uuid | no |  | candidates.id (CASCADE) |
| `language` | text | no |  |  |
| `proficiency` | enum language_proficiency | no |  |  |
| `verification_status` | enum verification_status | no | "unverified" |  |
| `reviewer_id` | uuid | yes |  | users.id (SET NULL) |
| `reviewed_at` | timestamp with time zone | yes |  |  |

### candidate_merges

Merge audit trail with a full pre-merge snapshot for recovery.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `primary_candidate_id` | uuid | no |  | candidates.id (CASCADE) |
| `merged_candidate_id` | uuid | no |  | candidates.id (CASCADE) |
| `merged_by_id` | uuid | yes |  | users.id (SET NULL) |
| `reason` | text | yes |  |  |
| `snapshot` | jsonb | no |  |  |
| `undone_at` | timestamp with time zone | yes |  |  |
| `undone_by_id` | uuid | yes |  | users.id (SET NULL) |

### candidate_skill_claims

A candidate's claim to a skill: declared proficiency vs verified status, evidence, reviewer, expiry, AI confidence.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `candidate_id` | uuid | no |  | candidates.id (CASCADE) |
| `skill_id` | uuid | no |  | skills.id (RESTRICT) |
| `original_wording` | text | yes |  |  |
| `declared_proficiency` | enum proficiency_level | no | "intermediate" |  |
| `years_experience` | numeric(4, 1) | yes |  |  |
| `last_used_year` | integer | yes |  |  |
| `origin` | enum claim_origin | no | "recruiter_entered" |  |
| `ai_confidence` | numeric(4, 3) | yes |  |  |
| `verification_status` | enum verification_status | no | "unverified" |  |
| `evidence_document_id` | uuid | yes |  | documents.id (SET NULL) |
| `evidence_notes` | text | yes |  |  |
| `reviewer_id` | uuid | yes |  | users.id (SET NULL) |
| `reviewed_at` | timestamp with time zone | yes |  |  |
| `expires_at` | date | yes |  |  |

### candidate_work_authorizations

Permission to work per destination country — distinct from passport/citizenship.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `candidate_id` | uuid | no |  | candidates.id (CASCADE) |
| `country` | text | no |  |  |
| `type` | enum work_auth_type | no |  |  |
| `valid_from` | date | yes |  |  |
| `valid_until` | date | yes |  |  |
| `verification_status` | enum verification_status | no | "unverified" |  |
| `evidence_document_id` | uuid | yes |  | documents.id (SET NULL) |
| `reviewer_id` | uuid | yes |  | users.id (SET NULL) |
| `reviewed_at` | timestamp with time zone | yes |  |  |
| `notes` | text | yes |  |  |

### candidates

One reusable person record. Citizenship, passport and work authorisation are stored separately.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `first_name` | text | no |  |  |
| `last_name` | text | no |  |  |
| `email` | text | yes |  |  |
| `phone` | text | yes |  |  |
| `phone_normalized` | text | yes |  |  |
| `city` | text | yes |  |  |
| `country` | text | yes |  |  |
| `date_of_birth` | date | yes |  |  |
| `headline` | text | yes |  |  |
| `summary` | text | yes |  |  |
| `status` | enum candidate_status | no | "new" |  |
| `owner_id` | uuid | yes |  | users.id (SET NULL) |
| `primary_source_id` | uuid | yes |  | sources.id (SET NULL) |
| `citizenships` | text[] | no | '{}'::text[] |  |
| `passport_country` | text | yes |  |  |
| `passport_expiry` | date | yes |  |  |
| `passport_verification_status` | enum verification_status | no | "unverified" |  |
| `military_role` | text | yes |  |  |
| `military_unit` | text | yes |  |  |
| `military_rank` | text | yes |  |  |
| `military_service_start` | date | yes |  |  |
| `military_service_end` | date | yes |  |  |
| `years_experience` | numeric(4, 1) | yes |  |  |
| `willing_to_relocate` | boolean | yes |  |  |
| `relocation_constraints` | text | yes |  |  |
| `preferred_countries` | text[] | no | '{}'::text[] |  |
| `external_ref` | text | yes |  |  |
| `merged_into_id` | uuid | yes |  | candidates.id (SET NULL) |
| `merged_at` | timestamp with time zone | yes |  |  |
| `extraction_suggestions` | jsonb | yes |  |  |
| `extraction_reviewed_at` | timestamp with time zone | yes |  |  |
| `retention_hold_reason` | text | yes |  |  |
| `retention_hold_until` | date | yes |  |  |
| `anonymized_at` | timestamp with time zone | yes |  |  |

### consents

Permission records per scope (process, communicate, share with a named customer) with notice version and withdrawal.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `candidate_id` | uuid | no |  | candidates.id (CASCADE) |
| `scope` | enum consent_scope | no |  |  |
| `account_id` | uuid | yes |  | accounts.id (SET NULL) |
| `notice_version` | text | no |  |  |
| `granted_at` | timestamp with time zone | no |  |  |
| `withdrawn_at` | timestamp with time zone | yes |  |  |
| `channel` | enum consent_channel | no |  |  |
| `evidence` | text | yes |  |  |
| `evidence_document_id` | uuid | yes |  | documents.id (SET NULL) |
| `recorded_by_id` | uuid | yes |  | users.id (SET NULL) |
| `withdrawn_by_id` | uuid | yes |  | users.id (SET NULL) |

### document_access_log

Every view/download/share of a document.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `document_id` | uuid | no |  | documents.id (CASCADE) |
| `user_id` | uuid | yes |  | users.id (SET NULL) |
| `action` | enum document_access_action | no |  |  |
| `ip` | text | yes |  |  |
| `user_agent` | text | yes |  |  |
| `details` | jsonb | yes |  |  |

### documents

Private files (CV, passport, certificates, contracts) with versioning, hash and scan status.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `candidate_id` | uuid | yes |  | candidates.id (SET NULL) |
| `account_id` | uuid | yes |  | accounts.id (SET NULL) |
| `submission_id` | uuid | yes |  | submissions.id (SET NULL) |
| `placement_id` | uuid | yes |  | placements.id (SET NULL) |
| `kind` | enum document_kind | no | "other" |  |
| `filename` | text | no |  |  |
| `mime_type` | text | no |  |  |
| `size_bytes` | integer | no |  |  |
| `storage_key` (unique) | text | no |  |  |
| `sha256` | text | no |  |  |
| `version` | integer | no | 1 |  |
| `previous_version_id` | uuid | yes |  | documents.id (SET NULL) |
| `scan_status` | enum scan_status | no | "pending" |  |
| `is_sensitive` | boolean | no | false |  |
| `extracted_text` | text | yes |  |  |
| `uploaded_by_id` | uuid | yes |  | users.id (SET NULL) |

### source_events

Attribution events (applied, imported, referred) preserved through merges.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `candidate_id` | uuid | no |  | candidates.id (CASCADE) |
| `source_id` | uuid | yes |  | sources.id (SET NULL) |
| `event_type` | enum source_event_type | no |  |  |
| `occurred_at` | timestamp with time zone | no | now() |  |
| `import_batch_id` | uuid | yes |  | import_batches.id (SET NULL) |
| `referrer_name` | text | yes |  |  |
| `original_candidate_id` | uuid | yes |  |  |
| `details` | jsonb | yes |  |  |

### sources

Where candidates come from: agencies, referrals, job boards, imports.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `name` | text | no |  |  |
| `type` | enum source_type | no | "other" |  |
| `contact_name` | text | yes |  |  |
| `contact_email` | text | yes |  |  |
| `contact_phone` | text | yes |  |  |
| `commission_terms` | text | yes |  |  |
| `is_active` | boolean | no | true |  |

### upload_links



| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `candidate_id` | uuid | no |  | candidates.id (CASCADE) |
| `token_hash` (unique) | text | no |  |  |
| `kinds` | document_kind[] | no |  |  |
| `purpose` | text | yes |  |  |
| `max_files` | integer | no | 3 |  |
| `used_count` | integer | no | 0 |  |
| `expires_at` | timestamp with time zone | no |  |  |
| `revoked_at` | timestamp with time zone | yes |  |  |
| `last_used_at` | timestamp with time zone | yes |  |  |
| `last_used_ip` | text | yes |  |  |

### requisition_requirements

Mandatory vs preferred rules (field, operator, value, evidence requirement, justification, weight) per version.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `requisition_id` | uuid | no |  | requisitions.id (CASCADE) |
| `version` | integer | no | 1 |  |
| `kind` | enum requirement_kind | no |  |  |
| `field` | enum requirement_field | no |  |  |
| `operator` | enum requirement_operator | no |  |  |
| `value` | jsonb | yes |  |  |
| `skill_id` | uuid | yes |  | skills.id (SET NULL) |
| `evidence_requirement` | enum evidence_requirement | no | "declared" |  |
| `justification` | text | yes |  |  |
| `weight` | numeric(4, 2) | no | "1.00" |  |
| `sort_order` | integer | no | 0 |  |

### requisition_versions

Immutable snapshot of the requirement set each time it changes.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `requisition_id` | uuid | no |  | requisitions.id (CASCADE) |
| `version` | integer | no |  |  |
| `change_summary` | text | yes |  |  |
| `requirements_snapshot` | jsonb | no |  |  |
| `created_by_id` | uuid | yes |  | users.id (SET NULL) |
| `created_at` | timestamp with time zone | no | now() |  |

### requisitions

A customer request: role, location, dates, headcount, owner, status and rates.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `account_id` | uuid | no |  | accounts.id (RESTRICT) |
| `contact_id` | uuid | yes |  | contacts.id (SET NULL) |
| `role_family_id` | uuid | yes |  | role_families.id (SET NULL) |
| `title` | text | no |  |  |
| `description` | text | yes |  |  |
| `location_country` | text | no |  |  |
| `location_city` | text | yes |  |  |
| `site_name` | text | yes |  |  |
| `start_date` | date | yes |  |  |
| `end_date` | date | yes |  |  |
| `duration_weeks` | integer | yes |  |  |
| `headcount_approved` | integer | no | 1 |  |
| `status` | enum requisition_status | no | "draft" |  |
| `priority` | enum priority | no | "medium" |  |
| `owner_id` | uuid | yes |  | users.id (SET NULL) |
| `bill_rate_amount` | numeric(12, 2) | yes |  |  |
| `bill_rate_currency` | text | yes |  |  |
| `bill_rate_period` | enum pay_period | yes |  |  |
| `pay_rate_amount` | numeric(12, 2) | yes |  |  |
| `pay_rate_currency` | text | yes |  |  |
| `pay_rate_period` | enum pay_period | yes |  |  |
| `current_version` | integer | no | 1 |  |
| `external_ref` | text | yes |  |  |
| `opened_at` | timestamp with time zone | yes |  |  |
| `closed_at` | timestamp with time zone | yes |  |  |
| `close_reason` | text | yes |  |  |

### disclosures

Log of candidate summaries shared with a customer, tied to the authorising consent.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `submission_id` | uuid | no |  | submissions.id (CASCADE) |
| `candidate_id` | uuid | no |  | candidates.id (RESTRICT) |
| `account_id` | uuid | no |  | accounts.id (RESTRICT) |
| `contact_id` | uuid | yes |  | contacts.id (SET NULL) |
| `consent_id` | uuid | no |  | consents.id (RESTRICT) |
| `channel` | enum disclosure_channel | no |  |  |
| `fields_shared` | jsonb | no |  |  |
| `document_ids` | jsonb | no | [] |  |
| `summary_text` | text | yes |  |  |
| `shared_by_id` | uuid | yes |  | users.id (SET NULL) |
| `shared_at` | timestamp with time zone | no | now() |  |
| `is_revoked` | boolean | no | false |  |
| `revoked_at` | timestamp with time zone | yes |  |  |
| `notes` | text | yes |  |  |

### interviews

Screening and customer interviews with schedule, interviewer and outcome.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `submission_id` | uuid | no |  | submissions.id (CASCADE) |
| `type` | enum interview_type | no |  |  |
| `status` | enum interview_status | no | "scheduled" |  |
| `outcome` | enum interview_outcome | no | "pending" |  |
| `scheduled_at` | timestamp with time zone | no |  |  |
| `duration_minutes` | integer | no | 30 |  |
| `interviewer_id` | uuid | yes |  | users.id (SET NULL) |
| `customer_contact_id` | uuid | yes |  | contacts.id (SET NULL) |
| `location` | text | yes |  |  |
| `meeting_link` | text | yes |  |  |
| `notes` | text | yes |  |  |
| `summary` | text | yes |  |  |
| `transcript_document_id` | uuid | yes |  | documents.id (SET NULL) |
| `ai_disclosure_shown_at` | timestamp with time zone | yes |  |  |
| `completed_at` | timestamp with time zone | yes |  |  |

### match_feedback

Recruiter decisions on suggestions (accept/override/reject) for matching quality analysis.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `requisition_id` | uuid | no |  | requisitions.id (CASCADE) |
| `candidate_id` | uuid | no |  | candidates.id (CASCADE) |
| `submission_id` | uuid | yes |  | submissions.id (SET NULL) |
| `action` | enum match_feedback_action | no |  |  |
| `reason` | text | yes |  |  |
| `ranking_version` | text | yes |  |  |
| `requirement_version` | integer | yes |  |  |
| `score` | numeric(6, 3) | yes |  |  |
| `eligibility` | enum eligibility_outcome | yes |  |  |
| `user_id` | uuid | yes |  | users.id (SET NULL) |
| `notes` | text | yes |  |  |

### placements

Accepted assignment: reserved seat, planned/actual dates, terms, extension/replacement links.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `submission_id` | uuid | no |  | submissions.id (RESTRICT) |
| `candidate_id` | uuid | no |  | candidates.id (RESTRICT) |
| `requisition_id` | uuid | no |  | requisitions.id (RESTRICT) |
| `account_id` | uuid | no |  | accounts.id (RESTRICT) |
| `status` | enum placement_status | no | "reserved" |  |
| `planned_start` | date | no |  |  |
| `planned_end` | date | yes |  |  |
| `actual_start` | date | yes |  |  |
| `actual_end` | date | yes |  |  |
| `bill_rate_amount` | numeric(12, 2) | yes |  |  |
| `bill_rate_currency` | text | yes |  |  |
| `bill_rate_period` | enum pay_period | yes |  |  |
| `pay_rate_amount` | numeric(12, 2) | yes |  |  |
| `pay_rate_currency` | text | yes |  |  |
| `pay_rate_period` | enum pay_period | yes |  |  |
| `gross_net` | enum gross_net | no | "gross" |  |
| `replacement_of_id` | uuid | yes |  | placements.id (SET NULL) |
| `extension_of_id` | uuid | yes |  | placements.id (SET NULL) |
| `cancellation_reason` | enum cancellation_reason | yes |  |  |
| `cancellation_notes` | text | yes |  |  |
| `owner_id` | uuid | yes |  | users.id (SET NULL) |
| `checklist` | jsonb | no | [] |  |
| `notes` | text | yes |  |  |

### submission_stage_history

Structured stage transitions with reason codes.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `submission_id` | uuid | no |  | submissions.id (CASCADE) |
| `from_stage` | enum submission_stage | yes |  |  |
| `to_stage` | enum submission_stage | no |  |  |
| `reason` | enum decision_reason | yes |  |  |
| `notes` | text | yes |  |  |
| `changed_by_id` | uuid | yes |  | users.id (SET NULL) |

### submissions

One candidate considered for one requisition: stage, eligibility, match snapshot, permissions, decisions.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `requisition_id` | uuid | no |  | requisitions.id (RESTRICT) |
| `candidate_id` | uuid | no |  | candidates.id (RESTRICT) |
| `stage` | enum submission_stage | no | "sourced" |  |
| `eligibility` | enum eligibility_outcome | no | "review" |  |
| `match_score` | numeric(6, 3) | yes |  |  |
| `match_snapshot` | jsonb | yes |  |  |
| `requirement_version` | integer | no | 1 |  |
| `ranking_version` | text | yes |  |  |
| `owner_id` | uuid | yes |  | users.id (SET NULL) |
| `source_id` | uuid | yes |  | sources.id (SET NULL) |
| `interest_confirmed_at` | timestamp with time zone | yes |  |  |
| `availability_confirmed_at` | timestamp with time zone | yes |  |  |
| `sharing_consent_id` | uuid | yes |  | consents.id (SET NULL) |
| `presented_at` | timestamp with time zone | yes |  |  |
| `offered_at` | timestamp with time zone | yes |  |  |
| `accepted_at` | timestamp with time zone | yes |  |  |
| `decision_reason` | enum decision_reason | yes |  |  |
| `decision_notes` | text | yes |  |  |
| `closed_at` | timestamp with time zone | yes |  |  |
| `stage_changed_at` | timestamp with time zone | no | now() |  |

### activities

Notes, calls, emails, meetings and system events linked to any core record.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `type` | enum activity_type | no | "note" |  |
| `subject` | text | no |  |  |
| `body` | text | yes |  |  |
| `candidate_id` | uuid | yes |  | candidates.id (SET NULL) |
| `account_id` | uuid | yes |  | accounts.id (SET NULL) |
| `contact_id` | uuid | yes |  | contacts.id (SET NULL) |
| `requisition_id` | uuid | yes |  | requisitions.id (SET NULL) |
| `submission_id` | uuid | yes |  | submissions.id (SET NULL) |
| `placement_id` | uuid | yes |  | placements.id (SET NULL) |
| `occurred_at` | timestamp with time zone | no | now() |  |
| `actor_id` | uuid | yes |  | users.id (SET NULL) |

### ai_audit_log

Every AI call with purpose, input/output, confidence, latency and status.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `purpose` | enum ai_purpose | no |  |  |
| `provider` | text | no |  |  |
| `model` | text | yes |  |  |
| `entity_type` | text | yes |  |  |
| `entity_id` | uuid | yes |  |  |
| `input` | jsonb | yes |  |  |
| `output` | jsonb | yes |  |  |
| `confidence` | numeric(4, 3) | yes |  |  |
| `latency_ms` | integer | yes |  |  |
| `status` | text | no |  |  |
| `error` | text | yes |  |  |
| `user_id` | uuid | yes |  | users.id (SET NULL) |

### automation_rules

Event-driven rules: trigger → conditions → action.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `name` | text | no |  |  |
| `description` | text | yes |  |  |
| `trigger` | enum automation_trigger | no |  |  |
| `conditions` | jsonb | no | [] |  |
| `action` | enum automation_action | no |  |  |
| `action_config` | jsonb | no | {} |  |
| `is_active` | boolean | no | true |  |
| `is_system` | boolean | no | false |  |

### automation_runs

One row per (rule, event, entity); unique dedupe key prevents re-firing.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `rule_id` | uuid | no |  | automation_rules.id (CASCADE) |
| `trigger_event` | text | no |  |  |
| `entity_type` | text | no |  |  |
| `entity_id` | uuid | no |  |  |
| `dedupe_key` (unique) | text | no |  |  |
| `status` | enum automation_run_status | no |  |  |
| `error` | text | yes |  |  |
| `details` | jsonb | yes |  |  |

### import_batches

CSV import batches: mapping, parsed rows, preview errors, duplicate proposals, created records.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `entity` | enum import_entity | no |  |  |
| `source_id` | uuid | yes |  | sources.id (SET NULL) |
| `filename` | text | no |  |  |
| `status` | enum import_status | no | "previewed" |  |
| `mapping` | jsonb | no | {} |  |
| `rows` | jsonb | no | [] |  |
| `total_rows` | integer | no | 0 |  |
| `imported_rows` | integer | no | 0 |  |
| `error_rows` | integer | no | 0 |  |
| `duplicate_rows` | integer | no | 0 |  |
| `errors` | jsonb | no | [] |  |
| `duplicates` | jsonb | no | [] |  |
| `created_record_ids` | jsonb | no | [] |  |
| `completed_at` | timestamp with time zone | yes |  |  |
| `rolled_back_at` | timestamp with time zone | yes |  |  |

### integration_error_log

Provider failures (WhatsApp, email, AI, storage) with retry counts.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `integration` | text | no |  |  |
| `operation` | text | no |  |  |
| `error_message` | text | no |  |  |
| `error_code` | text | yes |  |  |
| `payload` | jsonb | yes |  |  |
| `job_id` | uuid | yes |  | jobs.id (SET NULL) |
| `attempts` | integer | no | 1 |  |
| `resolved_at` | timestamp with time zone | yes |  |  |

### jobs

Persistent background job queue with attempts, locking, results and idempotency.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `type` | text | no |  |  |
| `payload` | jsonb | no |  |  |
| `status` | enum job_status | no | "queued" |  |
| `attempts` | integer | no | 0 |  |
| `max_attempts` | integer | no | 3 |  |
| `run_at` | timestamp with time zone | no | now() |  |
| `locked_at` | timestamp with time zone | yes |  |  |
| `locked_by` | text | yes |  |  |
| `started_at` | timestamp with time zone | yes |  |  |
| `finished_at` | timestamp with time zone | yes |  |  |
| `last_error` | text | yes |  |  |
| `result` | jsonb | yes |  |  |
| `idempotency_key` (unique) | text | yes |  |  |
| `owner_id` | uuid | yes |  | users.id (SET NULL) |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |

### message_templates

Approved outreach templates per channel (WhatsApp templates carry provider IDs).

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `name` | text | no |  |  |
| `channel` | enum message_channel | no |  |  |
| `language` | text | no | "en" |  |
| `provider_template_id` | text | yes |  |  |
| `subject` | text | yes |  |  |
| `body` | text | no |  |  |
| `variables` | jsonb | no | [] |  |
| `status` | enum template_status | no | "draft" |  |
| `category` | text | yes |  |  |

### messages

Outbound/inbound messages with idempotent send key, provider id, delivery status and fallback task.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `channel` | enum message_channel | no |  |  |
| `direction` | enum message_direction | no | "outbound" |  |
| `status` | enum message_status | no | "queued" |  |
| `candidate_id` | uuid | yes |  | candidates.id (SET NULL) |
| `contact_id` | uuid | yes |  | contacts.id (SET NULL) |
| `submission_id` | uuid | yes |  | submissions.id (SET NULL) |
| `template_id` | uuid | yes |  | message_templates.id (SET NULL) |
| `to_address` | text | no |  |  |
| `subject` | text | yes |  |  |
| `body` | text | no |  |  |
| `variables` | jsonb | yes |  |  |
| `provider_message_id` | text | yes |  |  |
| `send_key` (unique) | text | no |  |  |
| `error_message` | text | yes |  |  |
| `attempts` | integer | no | 0 |  |
| `consent_id` | uuid | yes |  |  |
| `fallback_task_id` | uuid | yes |  | tasks.id (SET NULL) |
| `sent_at` | timestamp with time zone | yes |  |  |
| `delivered_at` | timestamp with time zone | yes |  |  |
| `read_at` | timestamp with time zone | yes |  |  |
| `failed_at` | timestamp with time zone | yes |  |  |

### tasks

Owned work items with due dates; automations use dedupe keys as loop guards.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `updated_at` | timestamp with time zone | no | now() |  |
| `created_by` | uuid | yes |  | users.id (SET NULL) |
| `is_deleted` | boolean | no | false |  |
| `title` | text | no |  |  |
| `description` | text | yes |  |  |
| `type` | enum task_type | no | "other" |  |
| `status` | enum task_status | no | "open" |  |
| `priority` | enum priority | no | "medium" |  |
| `due_at` | timestamp with time zone | yes |  |  |
| `owner_id` | uuid | yes |  | users.id (SET NULL) |
| `candidate_id` | uuid | yes |  | candidates.id (SET NULL) |
| `account_id` | uuid | yes |  | accounts.id (SET NULL) |
| `requisition_id` | uuid | yes |  | requisitions.id (SET NULL) |
| `submission_id` | uuid | yes |  | submissions.id (SET NULL) |
| `placement_id` | uuid | yes |  | placements.id (SET NULL) |
| `message_id` | uuid | yes |  | messages.id (SET NULL) |
| `completed_at` | timestamp with time zone | yes |  |  |
| `completed_by_id` | uuid | yes |  | users.id (SET NULL) |
| `dedupe_key` (unique) | text | yes |  |  |

### webhook_events

Inbound webhook receipts keyed by provider event id to prevent duplicate processing.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() |  |
| `created_at` | timestamp with time zone | no | now() |  |
| `provider` | text | no |  |  |
| `external_event_id` (unique) | text | no |  |  |
| `signature_valid` | boolean | no |  |  |
| `payload` | jsonb | no |  |  |
| `processed_at` | timestamp with time zone | yes |  |  |
| `error` | text | yes |  |  |
