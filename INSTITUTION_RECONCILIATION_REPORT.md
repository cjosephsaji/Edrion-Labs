# Institution-Side Reconciliation Report

_Audit date: 2026-07-19. Every verdict below was read from the actual code (Drizzle schema in `packages/database/src/schema/**`, packages, and `apps/api/src/modules/**`). File paths are cited inline. "Absent" verdicts state the directories/terms searched._

---

## Top-priority findings

### TENANCY (section B) — read this first

**The portable, user-owned learning-artifact model you want ALREADY EXISTS and is the established convention. No migration is required before you create more such tables — you must follow the existing pattern.**

Every personal learning-artifact table is keyed by a **split owner**: a nullable `student_id` **and** a nullable `independent_user_id` (institution-bound learner vs. independent consumer), plus a nullable `institution_id` tenancy tag. Ownership is `student_id` **XOR** `independent_user_id`. Verified across:

| Table | `institution_id` | `student_id` | `independent_user_id` | File |
|---|---|---|---|---|
| `knowledge_collections`, `knowledge_items`, `knowledge_artifacts` | nullable | nullable | nullable | `student-knowledge.ts` |
| `flashcard_decks`, `flashcards`(via deck), `flashcard_reviews` | nullable | nullable | nullable | `student-knowledge.ts` |
| `library_quiz_attempts`, `exam_blueprints`, `question_exposure` | nullable | nullable | nullable | `student-knowledge.ts` |
| `mock_exams`, `mock_exam_attempts/answers`(via exam) | nullable | nullable | nullable | `student-knowledge.ts` |
| `debates`, `debate_participants`, `debate_turns` | nullable | nullable | nullable | `student-knowledge.ts` |
| `achievement_awards` | **(none)** | nullable | nullable | `student-knowledge.ts` |
| `learning_paths`, `learn_sessions`, `learn_attempts`, `quick_answers`, `revision_states`, `evidence_tags`, `learn_ai_calls` | nullable | nullable | nullable | `learn.ts` |
| `visual_canvases`, `visual_canvas_revisions` | nullable* | nullable | nullable | `visual-studio.ts` |
| `storage_objects` | nullable | `owner_student_id` | `owner_independent_user_id` (+`owner_staff_user_id`) | `student.ts` |
| `student_preferences`, `learning_events` | nullable | nullable | nullable | `student.ts` |

\* `visual_canvases` is stricter: a **CHECK constraint** (`visual_canvases_subject_ck`) enforces the XOR AND requires `institution_id` non-null when `student_id` is set, null when `independent_user_id` is set. The other tables leave `institution_id` independently nullable (no enforced XOR). **This inconsistency is worth standardizing** — adopt the `visual_canvases` CHECK shape for new tables so tenancy can't drift.

Shared/non-owned content is correctly global: `learn_topics` (institution nullable), `concept_atoms`, `question_bank`, `exam_paper_patterns` (no owner columns — shared caches).

**Portability caveat (the one real nuance):** because ownership is two columns, a row belongs to *either* a `student_id` *or* an `independent_user_id` — it is **not** a single `user_id`. An independent learner who later joins an institution keeps rows only if you re-key `independent_user_id → student_id` (and vice-versa). There is **no** existing "port my learning history across the boundary" service. If cross-boundary portability at the row level is a product requirement, that migration/merge service is net-new — but the *schema* already supports both homes, so **no schema migration is needed before adding tables**; only the (optional) merge service is.

### ASSUMED-EXISTS verdicts (section C)

| ID | Capability | Belief | Actual |
|---|---|---|---|
| C1 | Attempt records w/ correctness/evidence tagging | EXISTS | **BUILT** (`learn_attempts.evaluation`, `evidence_tags.polarity`, `learn_sessions.evidence`) |
| C2 | Concept-atom micro-content w/ multimedia | ? | **BUILT** (`concept_atoms`, `learn_topics`) |
| C3 | Learning paths (ordered topic sequences) | ? | **BUILT** (`learning_paths` + `learning_path_items.sequence`) |
| C4 | React Flow + elkjs canvas w/ versioned revisions | canvas EXISTS, migration ABSENT | **PARTIAL** — canvas + revisions BUILT (`visual_canvases`, `visual_canvas_revisions`, `schema_version`); schema-migration tooling **ABSENT** (belief correct) |
| C5 | Student memory / personalization diff service | ? | **PARTIAL** — `visual-memory-diff.service` exists (visual-studio); `revision_states`, `evidence_tags`, `learning_events` are the substrate. No single global "student memory" table |
| C6 | AI Control Center / policy engine + kill switch | EXISTS | **BUILT** (`@edrion/copilot` `resolve-policy.ts`, `portal_ai_runs/tool_calls/confirmations`, per-scope kill switch) — extensible with a student scope |
| C7 | Teacher gradebook / mark entry | EXISTS | **BUILT** (`grade_entries`, incl. `published` gate) |
| C8 | School-wide attendance check-in/out | EXISTS | **PARTIAL/differently-shaped** — attendance is class-register based (`attendance_sessions`/`attendance_records`); a separate gate in/out feed is `campus_access_logs` / `gate_exit_events` |
| C9 | Exam authoring/conduct | EXISTS | **BUILT** (`exams`, `exam_schedules`, `exam_paper_questions`, `exam_attempts`, `exam_answers` w/ auto+teacher marking) |
| C10 | Class/section/subject/teacher/scheduling | EXISTS (some form) | **BUILT, deep** (`academics.ts`: classes, subjects, terms, `class_subject_teachers`, `timetable_slots`) |
| C11 | Vehicle/route mapping | EXISTS | **BUILT** (`transport_routes`, `transport_vehicles`) |
| C12 | Hostel allocations | EXISTS | **BUILT** (`hostel_blocks/rooms/allocations`) |
| C13 | Maintenance work-order module | EXISTS | **BUILT** (`work_orders`, `maintenance_tasks`, `facilities`) |
| C14 | Security gate-pass w/ scan logging | EXISTS | **BUILT** (`gate_passes` + `campus_access_logs`) |
| C15 | Campus book-loan tracking | EXISTS | **BUILT** (`library_books`, `library_loans` w/ fines) |
| C16 | Nurse/health + counselor notes (restricted) | EXISTS | **BUILT** (`health_records`, `medical_incidents`, `medication_logs`; `counseling_records/cases` w/ audited reads) |
| C17 | HMAC signing / short-code token components | components EXIST | **PARTIAL** — HMAC used for webhooks (`integrations`) & parent payment webhooks; JWT signing (`common/jwt.ts`). No document short-code/QR verification signer |
| C18 | integrations/webhooks tables + infra | tables EXIST, tenant mgr ABSENT | **BUILT (more than believed)** — `webhook_endpoints`+`webhook_deliveries` AND a tenant-facing `integrations` module (controller/service/repository) |
| C19 | Homework/assignment structures | ? | **BUILT, deep** (`assignments` + submissions + quiz-mode `assignment_questions/attempts/answers`) |
| C20 | recharts / charting lib | EXISTS | **BUILT** (present in web deps; dashboards ship) |

### Biggest surprises

- **The whole student-learning stack you believed largely absent is BUILT.** Spaced repetition (`flashcards` w/ `ease`/`interval_days`/`reps`/`lapses` — SM-2), mock exams + shared `question_bank` + `exam_blueprints` + `exam_paper_patterns`, an **upload→OCR→extract pipeline** (`knowledge_items.ingest_stage` incl. `'ocr'`, `knowledge_item_pages.ocr_confidence`/`needs_confirm`), and debates with audio all exist. Your D14/D15 "absent" beliefs are **wrong** — see below.
- **Independent (institution-less) users are NOT a new concept.** `independent_users` table + `independent_sessions` + a full `independent-users` API module already exist and are wired through every learning-artifact table. Belief B2 is wrong.
- **A student↔fee layer partially exists** (`fee_structures`/`fee_invoices`/`fee_payments`) — belief D1 "absent" is wrong; it's PARTIAL (single-amount, no line-items/installments).
- **A payment-gateway integration already exists** — `parent_payment_intents` with Razorpay/Stripe/mock adapters, HMAC-signed settlement webhook, idempotency key (`parent-money.ts`, `parent-portal/*payment*`). D2 is PARTIAL, not absent — but it's parent-facing.
- **Per-subject/per-session attendance already exists** (`attendance_sessions.subject_id`/`period`/`slot_id`) — D4's core marking is BUILT; only the *policy config* (threshold/OD/condonation) is absent.
- **A mark-release gate already exists** (`grade_entries.published`, `exam_schedules.published`) — D5's publication concept is partially there; grading-scheme/GPA/CGPA/weights are what's actually missing.
- **A generic request/approval state machine is genuinely ABSENT** (belief A2 correct), but the *pattern* is implemented ~4× bespoke (`early_leave_requests`, `hostel_outing_requests`, registration reviews, copilot transitions) — copyable, not reusable.

---

## Full capability table

| ID | Capability | My belief | Actual status | Recommended action | Student-side impact? |
|---|---|---|---|---|---|
| A1 | Feature-flag cascade Global→Plan→Inst→Campus→User | EXISTS | **BUILT** | SKIP | No |
| A2 | Generic request/approval state machine + event history | ABSENT | **ABSENT** (pattern exists 4× bespoke) | BUILD (generic) or copy pattern | No |
| A3 | Append-only audit substrate | EXISTS | **BUILT** | SKIP | No |
| A4 | Roles/permissions granularity for role inboxes | EXISTS | **BUILT** (extensible) | EXTEND (add missing role keys) | No |
| A5 | Job queue + notification dispatch | EXISTS | **BUILT** | WIRE-ONLY (new job/event types) | No |
| A6 | Idempotency-key substrate reusable outside billing | EXISTS in billing, unclear | **BUILT & reusable** (`idempotency_keys.scope`) | SKIP/WIRE-ONLY | No |
| A7 | PortalCrudEngine | EXISTS | **BUILT** | SKIP | No |
| A8 | File/attachment storage | EXISTS | **BUILT** (`storage_objects` + drivers) | SKIP/WIRE-ONLY | No |
| B1 | User-owned portable learning-artifact scoping | must verify | **BUILT convention** (no migration needed) | SKIP (follow convention) | **Yes (soft)** — new tables must copy the dual-owner shape |
| B2 | Support for institution-less users | new concept | **BUILT** (`independent_users`) | SKIP | No |
| C1 | Attempt records w/ evidence tagging | EXISTS | **BUILT** | WIRE-ONLY | No |
| C2 | Concept atoms w/ multimedia | ? | **BUILT** | SKIP | No |
| C3 | Learning paths | ? | **BUILT** | SKIP | No |
| C4 | Canvas + versioned revisions / migration tooling | canvas yes, tooling no | **PARTIAL** | EXTEND (add migration tooling) | No |
| C5 | Student memory / personalization diff | ? | **PARTIAL** | EXTEND | No |
| C6 | AI Control Center + kill switch | EXISTS | **BUILT** | EXTEND (add student tutor scope) | No |
| C7 | Teacher gradebook / mark entry | EXISTS | **BUILT** | WIRE-ONLY | No |
| C8 | School-wide attendance check-in/out | EXISTS | **PARTIAL** (register-based + gate feed) | WIRE-ONLY | No |
| C9 | Exam authoring/conduct | EXISTS | **BUILT** | WIRE-ONLY | No |
| C10 | Class/section/subject/scheduling | EXISTS | **BUILT** | WIRE-ONLY | No |
| C11 | Vehicle/route mapping | EXISTS | **BUILT** | WIRE-ONLY | No |
| C12 | Hostel allocations | EXISTS | **BUILT** | WIRE-ONLY | No |
| C13 | Maintenance work-order | EXISTS | **BUILT** | SKIP | No |
| C14 | Gate-pass + scan logging | EXISTS | **BUILT** | WIRE-ONLY | No |
| C15 | Book-loan tracking | EXISTS | **BUILT** | WIRE-ONLY | No |
| C16 | Nurse/health + counselor notes | EXISTS | **BUILT** | WIRE-ONLY | No |
| C17 | HMAC / short-code signing components | components EXIST | **PARTIAL** | EXTEND (doc verification signer) | No |
| C18 | integrations/webhooks + tenant mgr | tables yes, mgr no | **BUILT** | SKIP | No |
| C19 | Homework/assignment structures | ? | **BUILT** | WIRE-ONLY | No |
| C20 | recharts / charting | EXISTS | **BUILT** | SKIP | No |
| D1 | Institution↔student fee system (line items, installments, receipts, exports) | ABSENT | **PARTIAL** (single-amount invoices) | EXTEND | **Yes (flagged)** |
| D2 | Student-facing payment gateway | ABSENT | **PARTIAL** (parent-facing exists) | WIRE-ONLY/EXTEND | No (reuse adapters) |
| D3 | Per-institution module visibility + terminology + presets | ABSENT | **PARTIAL** (feature-flags + settings KV substrate) | EXTEND | No |
| D4 | Per-subject/session attendance + policies + calendar | ABSENT | **PARTIAL** (marking BUILT; policies absent) | EXTEND | No |
| D5 | Mark-release + grading scheme + GPA/CGPA + weights | ABSENT | **PARTIAL** (`published` gate exists; formulas absent) | EXTEND | No |
| D6 | Hall-ticket/admit-card, seating, eligibility-blocks | ABSENT | **ABSENT** (only `hall`/`seat_info` text fields) | BUILD | No |
| D7 | Course registration (windows, offerings, seats, waitlist) | ABSENT | **ABSENT** (`classes.capacity` only) | BUILD | No |
| D8 | Document system (templates, issuance, vault, QR verify) | ABSENT | **PARTIAL** (`doc-gen` render engine exists; vault/QR absent) | EXTEND | No |
| D9 | Timetable exceptions + ICS export | ABSENT | **ABSENT** (`timetable_slots` recurring only) | BUILD | No |
| D10 | Per-student transport allocation / GPS | alloc partial, GPS no | **PARTIAL** (`transport_assignments` BUILT; GPS absent) | WIRE-ONLY (+BUILD GPS) | No |
| D11 | Library catalog search/holds/renewals/fines | ABSENT beyond loans | **PARTIAL** (`library_books`/`loans`+fines; no holds/renewals) | EXTEND | No |
| D12 | Placement (drives, eligibility, funnel, offers) | ABSENT | **ABSENT** | BUILD | No |
| D13 | Grievance/helpdesk routing + anonymous channel | ABSENT | **ABSENT** (see support-cases below) | BUILD | No |
| D14 | Mock/question-bank/blueprint + entrance-prep graphs | ABSENT | **PARTIAL→mostly BUILT** (`question_bank`, `mock_exams`, `exam_blueprints`, `exam_paper_patterns`) | WIRE-ONLY/EXTEND | No |
| D15 | Spaced-repetition/FSRS + upload→OCR→extract | ABSENT | **BUILT (SM-2) + OCR pipeline BUILT** | WIRE-ONLY | No |
| D16 | Video/WebRTC/speech-to-text infra | ABSENT | **ABSENT** (debates store audio object ids only) | BUILD | No |
| D17 | MFA/AAL2 config, roster sync, SAML/OIDC SSO | ABSENT/unfinished | **PARTIAL** (AAL2 primitives exist; SSO/roster ABSENT) | EXTEND/BUILD | No |

---

## Per-capability detail

### A. Shared plumbing

**A1 — Feature-flag cascade.** STATUS: **BUILT.** EVIDENCE: `packages/feature-flags/src/resolve.ts`; schema `features.ts` (`feature_definitions`, `feature_assignments.scope`/`scope_id`, `feature_rollouts` incl. `kill_switch`). SHAPE: deterministic pipeline — kill switch → definition-inactive → rollout block/allow/percentage → **scope specificity `institution_user/independent_user → employee_role → campus → institution → plan → global`** → global default. **A campus override CAN hide an institution-enabled feature** (campus is more specific than institution; most-specific wins). New namespaces = new `feature_definitions` rows (registry-driven), **no new engine**. ACTION: SKIP. STUDENT-SIDE: unaffected.

**A2 — Generic request/approval state machine.** STATUS: **ABSENT.** EVIDENCE: searched `apps/api/src/modules` + schema for `approvalWorkflow`/`request_status`/`serviceRequest`/generic state machine — none. What exists is **feature-specific**: `early_leave_requests` and `hostel_outing_requests` (`parent-safety.ts`, status `requested→approved→denied→completed/…` + `decided_by`/`decided_at`/`decision_note`), `institution_registration_reviews` (append-only review history), and copilot `packages/copilot/transitions.ts` (`proposed→awaiting_confirmation→confirmed→executed`). No shared enum, no generic append-only event history for arbitrary request types. ACTION: BUILD a generic engine (the bespoke ones are a good template) OR copy the pattern per feature. STUDENT-SIDE: unaffected — you can build a clean generic request substrate.

**A3 — Append-only audit substrate.** STATUS: **BUILT.** EVIDENCE: `records.ts` `audit_events` (+ `security_events`, `activity_events`); `packages/audit/src/writer.ts` `AuditWriter` is the sole writer; header states the app DB role is granted INSERT/SELECT only (`migrations/sql/zzz_grants.sql`), so it is truly append-only. `action`/`module`/`entity_type` are free `text` — **arbitrary new event types write with no schema change**. Also append-only: `learning_events`, `webhook_deliveries`, `gate_exit_events`. ACTION: SKIP. STUDENT-SIDE: unaffected.

**A4 — Roles/permissions granularity.** STATUS: **BUILT & extensible.** EVIDENCE: `packages/permissions/src/institution/{roles,personas,catalogue}.ts`; DB `institution_user_roles` (many-to-many), `institution_users.direct_grants/direct_denies`. Role keys already include `registrar`, `librarian`, `hostel_warden`, `finance_manager`, `school_nurse`, `counselor`, `security_staff`, `maintenance_staff`, etc. Custom tenant roles fall back to `general` persona; entitlement is always computed from **permission keys** (`can`/`canAny`), never role names. NOT YET present as role keys: `faculty_advisor`, `placement_cell`, `exams_office`, a distinct "accounts" (today `finance_manager`), "class teacher" (that's a `staff` FK on `classes.class_teacher_id`, not a role). ACTION: EXTEND — add the missing role keys + permission keys; the engine needs no change. STUDENT-SIDE: unaffected.

**A5 — Job queue + notification dispatch.** STATUS: **BUILT.** EVIDENCE: BullMQ in `apps/api/src/common/queue/{jobs.service,queue.worker}.ts`; processors: `documents/document-render.processor.ts`, `student/exam-engine/exam-engine.processor.ts`, `student/visual-studio/visual-studio.processor.ts`; fan-out/notify: `parent-portal/parent-fanout.service.ts`, `parent-digest.service.ts`, `notification-channels.ts`, `parent-notify.service.ts`; `background_jobs` tracks runs (`jobs.ts`). ACTION: WIRE-ONLY — register new job/event types (fee demands, mark releases, timetable changes, request transitions). STUDENT-SIDE: unaffected.

**A6 — Idempotency substrate.** STATUS: **BUILT & reusable.** EVIDENCE: `billing.ts` `idempotency_keys` (`key` unique, **`scope` text**, `status`, `response_status`/`response_body`, `entity_id`, `expires_at`) — the `scope` column makes it **not billing-specific**. Already reused by `parent_payment_intents.idempotency_key`. ACTION: SKIP/WIRE-ONLY — reuse for student payments and serialized seat allocation with a new `scope` value. STUDENT-SIDE: unaffected.

**A7 — PortalCrudEngine.** STATUS: **BUILT.** EVIDENCE: `apps/api/src/modules/portal/portal-crud.engine.ts`. SHAPE: generic scope-aware CRUD (`list/get/create/update/remove`) taking a `CrudConfig{table, columns, module, entityType, actionPrefix, search, sortable, refs, enrich, auditReads}`. Enforces institution + campus scope confinement, optimistic concurrency (`version`), campus stamping on create, an audit event per mutation, and batched FK→display enrichment (`refs`). Used by ~15 flat modules (health, facilities, it, labs, front-desk, counseling, courses, …). ACTION: SKIP. New flat-CRUD features describe a `CrudConfig` and delegate. STUDENT-SIDE: unaffected.

**A8 — File/attachment storage.** STATUS: **BUILT.** EVIDENCE: `student.ts` `storage_objects` (owner student/independent/staff, `driver`, `storage_key`, `mime_type`, `checksum_sha256`, `processing_status`, `derived`); `apps/api/src/modules/student/storage/drivers/**`; `portal/attachment-storage.service.ts`. Already backs knowledge items, exam/assignment answers, debate audio. ACTION: SKIP/WIRE-ONLY (reachable for request attachments, doc vault, resume uploads, study material). STUDENT-SIDE: unaffected.

### B. Tenancy

**B1 — see "Top-priority findings".** STATUS: **BUILT convention, no migration needed.** ACTION: SKIP — but every new personal-learning table MUST carry `student_id` + `independent_user_id` (nullable, XOR) and ideally the `visual_canvases`-style CHECK. STUDENT-SIDE: soft yes — the *shape* of every new learning table is constrained by this convention (that's the intended contract, not a blocker).

**B2 — Institution-less users.** STATUS: **BUILT.** EVIDENCE: `users.ts` `independent_users` ("direct learning-product consumers. Entirely separate domain."), `student.ts` `independent_sessions`, and API module `apps/api/src/modules/independent-users/**`. Institution-bound identity is `institution_users`/`students` (both require `institution_id`); independent identity is fully separate. ACTION: SKIP. STUDENT-SIDE: unaffected — independent users are first-class already.

### C. Believed-exists

**C1 — Attempt/evidence records.** BUILT. `learn.ts`: `learn_attempts` (`input`, `evaluation` jsonb, `hints_used`), `learn_sessions.evidence` (string[]), and `evidence_tags` (`tag_key`, `label`, **`polarity`**, `note`, `evidence_event_ids`) — the learner-model source. Also `library_quiz_attempts.patterns`, `mock_exam_answers.evaluation`. ACTION: WIRE-ONLY.

**C2 — Concept atoms.** BUILT. `learn.ts` `concept_atoms` (`atom_kind`, `variant_key`, `content` jsonb, `model`, `prompt_version`) under `learn_topics`. ACTION: SKIP.

**C3 — Learning paths.** BUILT. `learning_paths` + `learning_path_items` (`sequence`, `optional_branch`, `status`, `completed_at`). ACTION: SKIP.

**C4 — Canvas + revisions / migration tooling.** PARTIAL. `visual-studio.ts` `visual_canvases` (`graph` jsonb `CanvasGraph`, `archetype` CHECK, `origin` CHECK, `schema_version`) + `visual_canvas_revisions` (`revision_number` unique per canvas, `reason`, `created_by`). Libraries (`@xyflow/react`, `elkjs`) are in web deps; `CanvasGraph` typed in `@edrion/schemas`. **Schema-migration tooling ABSENT** — a `schema_version` column exists but no migrator was found (searched schemas + portal for canvas migration). ACTION: EXTEND (add migration runner keyed on `schema_version`).

**C5 — Student memory / personalization diff.** PARTIAL. `apps/api/src/modules/student/visual-studio/visual-memory-diff.service.ts` (+ spec) exists; substrate = `revision_states` (`freshness`, `manual_reasons` incl. `memory_missing`), `evidence_tags`, `learning_events`. No single global "student memory" table/service by that name. ACTION: EXTEND if you need a unified memory service.

**C6 — AI Control Center.** BUILT & extensible. `packages/copilot/src/resolve-policy.ts` (`resolveAiPolicy`: per-scope `mode`, caps `maxFinancialImpactMinor`/`maxAffectedUsers`, `twoPersonThreshold`, `secondApproverCapabilities`, per-scope **kill switch OR'd across layers**, capabilities). `copilot.ts` `portal_ai_runs/tool_calls/confirmations` (no execution without a confirmation row). Scope enum already includes `independent_user`. ACTION: EXTEND — add a student-tutor policy scope/capabilities; engine already supports it.

**C7 — Gradebook / mark entry.** BUILT. `gradebook.ts` `grade_entries` (`marks_obtained`/`max_marks`, `letter_grade`, `assessment_name`, optional `exam_id`/`class_id`, **`published`**). Flat table, unique `(student, subject, exam)`. ACTION: WIRE-ONLY for a student read surface.

**C8 — School-wide attendance.** PARTIAL / differently shaped. Attendance is a **class register** model (`attendance.ts` `attendance_sessions` + `attendance_records`), not a turnstile check-in/out. A gate in/out feed exists separately: `security.ts` `campus_access_logs` (direction in/out) and `parent-safety.ts` `gate_exit_events`. ACTION: WIRE-ONLY (pick the right source per student feature).

**C9 — Exam authoring/conduct.** BUILT, deep. `exams.ts` `exams`, `exam_schedules` (per class/subject paper, `published`), `exam_paper_questions`, `exam_assignees`, `exam_attempts`, `exam_answers` (auto + teacher marking, `needs_review`). ACTION: WIRE-ONLY.

**C10 — Academic structure/scheduling.** BUILT, deep. `academics.ts` (`academic_years`, `academic_terms`, `departments`, `grade_levels`, `subjects`, `classes` w/ `class_teacher_id`, `class_subject_teachers`, `programme_subjects`, `programme_term_slots`) + `timetable.ts` `timetable_slots` (recurring weekly). This is your timetable data source. ACTION: WIRE-ONLY.

**C11 — Transport catalogue.** BUILT. `transport.ts` `transport_routes`, `transport_vehicles` (driver name/phone, `route_id`). ACTION: WIRE-ONLY.

**C12 — Hostel allocations.** BUILT. `hostel.ts` blocks/rooms(occupancy)/allocations w/ allocate→occupancy bridge. ACTION: WIRE-ONLY.

**C13 — Maintenance work orders.** BUILT. `facilities.ts` `work_orders`, `maintenance_tasks`, `facilities`, `facility_assets`. Staff-facing. ACTION: SKIP.

**C14 — Gate-pass + scan logging.** BUILT. `security.ts` `gate_passes` (holder/kind/status) + `campus_access_logs` (in/out, gate, method badge/manual). ACTION: WIRE-ONLY.

**C15 — Book-loan tracking.** BUILT. `library.ts` `library_books` (copy counts) + `library_loans` (issue/return bridge, `fine_amount`). ACTION: WIRE-ONLY.

**C16 — Health + counseling.** BUILT w/ restricted access. `health.ts` (`health_records`, `medical_incidents`, `medication_logs` — sensitive perms); `counseling.ts` (`counseling_records`/`cases` — writes gated by sensitive keys, **reads audited** via `auditReads`). ACTION: WIRE-ONLY (respect the sensitivity model).

**C17 — HMAC / short-code signing.** PARTIAL. HMAC-SHA256 for webhooks (`integrations.ts` `webhook_endpoints.secret`; `integrations.service.ts`) and parent payment settlement (`parent-webhook.controller.ts`, `parent-fees.service.ts`); JWT signing `common/jwt.ts`. No document short-code / rotating-ID-token / QR-verification signer. ACTION: EXTEND (reuse the HMAC primitives for a doc-verification signer).

**C18 — integrations/webhooks.** BUILT (more than believed). `integrations.ts` `webhook_endpoints` (institution-scoped, redacted secret, `events[]`) + `webhook_deliveries` (append-only) AND a tenant-facing module `apps/api/src/modules/integrations/{controller,service,repository,module}.ts`. ACTION: SKIP (belief "tenant-facing manager absent" is wrong).

**C19 — Homework/assignments.** BUILT, deep. `assignments.ts` `assignments` (due date, `max_points`, `late_policy`, `allow_resubmission`, `ai_policy`, `delivery_mode` file|quiz, attachments) + `assignment_submissions`, `assignment_questions/attempts/answers`. Solid diary basis. ACTION: WIRE-ONLY.

**C20 — Charting.** BUILT — recharts present in web deps; dashboards ship (`portal/dashboard/**`). ACTION: SKIP.

### D. Believed-absent

**D1 — Institution↔student fees.** STATUS: **PARTIAL (belief "absent" is wrong).** EVIDENCE: `fees.ts` — `fee_structures` (per grade/class/year/term, `fee_type`, `frequency` one_time|monthly|term|annual, `amount` minor units), `fee_invoices` (**per-student**, `invoice_no` unique per institution, `amount`/`amount_paid`/`status` pending|partial|paid|overdue|cancelled, `source`), `fee_payments` (per-invoice lines, `method` incl. `online`). WHAT'S MISSING vs. your plan: **no per-invoice line-items** (invoice carries a single `amount`), **no installment schedule**, **no late-fee rule engine**, **no gapless receipt numbering** (invoice_no is unique but not proven gapless; no separate receipt entity), **no defaulter-list/reconciliation/Tally-CSV export module**. SaaS billing (`billing.ts`) is separate and DOES have line-items (`invoice_items`), proration (`credits.source='proration'`, `campus_billing_items.prorated_minor`) and idempotency — **its proration/idempotency logic is liftable** but its tables are Edrion↔institution, not institution↔student. ACTION: **EXTEND** — add a `fee_invoice_items` table + installment + late-fee-rule + receipt-number tables; lift proration/idempotency helpers from billing. STUDENT-SIDE: **flagged exception** — see Plan Adjustments.

**D2 — Student payment gateway.** STATUS: **PARTIAL.** EVIDENCE: `parent-money.ts` `parent_payment_intents` (provider `razorpay|stripe|manual|mock`, `provider_ref`, status, `idempotency_key`, `settled_payment_id` bridge to `fee_payments`); `apps/api/src/modules/parent-portal/{payment-provider,mock-payment.provider,parent-webhook.controller,parent-fees}.ts` — HMAC-verified signed settlement webhook. It's **parent/guardian-facing** (`guardian_user_id`). ACTION: **WIRE-ONLY/EXTEND** — reuse the provider adapters + webhook verifier for a student-initiated intent (add a student-owned intent path). STUDENT-SIDE: unaffected (reuse adapters).

**D3 — Module visibility + terminology + presets.** STATUS: **PARTIAL.** EVIDENCE: module visibility is expressible via **feature flags** (`features.ts`, per-institution/campus scope); a generic `institution_settings` KV tree exists (`settings.ts`, categories incl. `localization`); `institutions.type` (`institution_type` enum), `currency`, `timezone` per institution; `document_templates.applies_to_types` shows an institution-type-preset pattern. NO dedicated terminology-override schema (semester/term/trimester, section/class/division) and no institution-type "module preset" bundle. ACTION: **EXTEND** — add a terminology/preset config (or standardize on `institution_settings` keys). STUDENT-SIDE: unaffected.

**D4 — Per-subject attendance + policies + calendar.** STATUS: **PARTIAL (marking BUILT).** EVIDENCE: `attendance_sessions` already supports `subject_id`, `period`, `slot_id` (timetable-driven) — **per-subject/per-session marking exists.** Academic calendar exists (`academic_years`, `academic_terms` w/ dates). MISSING: `attendance_policies` (threshold %, OD handling, condonation) and a "remaining sessions in term" calculator. ACTION: **EXTEND** (add policy config + calendar-count logic). STUDENT-SIDE: unaffected.

**D5 — Mark release + grading scheme + GPA/CGPA + weights.** STATUS: **PARTIAL.** EVIDENCE: publication gates exist (`grade_entries.published`, `exam_schedules.published`). MISSING: grading-scheme config (grade boundaries), GPA/CGPA formula config, per-subject assessment-weight maps, credit maps (`programme_subjects.credits` exists but no CGPA computation), and any CGPA calculator. ACTION: **EXTEND**. STUDENT-SIDE: unaffected.

**D6 — Hall-ticket / seating / eligibility-block.** STATUS: **ABSENT.** EVIDENCE: only free-text `exam_schedules.hall`/`seat_info`/`syllabus_note`; searched for `hall_ticket`/`admit_card` — none. No seat allocation, no eligibility-block (attendance/fee hold) concept. ACTION: **BUILD**. STUDENT-SIDE: unaffected.

**D7 — Course registration machinery.** STATUS: **ABSENT.** EVIDENCE: `enrollments.ts` `student_enrollments` is per-year/term **placement history**, not registration; `classes.capacity` exists but no offerings/seat-capacity/waitlist/enrollment-window/serialized-allocation (searched `waitlist`/`seat_capacity`/`courseOffering`/`enrollment_window` — none). ACTION: **BUILD** (use `idempotency_keys` scope for serialized seat allocation). STUDENT-SIDE: unaffected.

**D8 — Document system.** STATUS: **PARTIAL.** EVIDENCE: a real **generation engine exists** — `doc-gen.ts` `document_templates` (Handlebars-in-DB, `fields_schema` merge fields, `header_config`, `applies_to_types`, platform-default vs institution override) + `document_renders` (queue queued→rendering→done→PDF to storage, `documents/document-render.processor.ts` via Playwright). MISSING: signatures/letterhead-as-first-class, an issuance desk/queue UI, a **per-student document vault**, and **QR/short-code public verification** (searched — none). `institution_documents` (`documents.ts`) is only metadata + external URL (`storage_key` is a reserved seam). ACTION: **EXTEND** (vault + verification + issuance queue on top of doc-gen). STUDENT-SIDE: unaffected.

**D9 — Timetable exceptions + ICS.** STATUS: **ABSENT.** EVIDENCE: `timetable_slots` is recurring-only; no cancellation/room-change/substitution/extra-class exception table, no publish→notify for exceptions, no ICS export. ACTION: **BUILD** (fan-out reuses A5). STUDENT-SIDE: unaffected.

**D10 — Transport allocation / GPS.** STATUS: **PARTIAL.** EVIDENCE: `transport_assignments` (per-student route + stop + pickup/drop time) BUILT; `transport_incidents` (`parent-safety.ts`) BUILT. No driver-app/GPS/live-tracking. ACTION: WIRE-ONLY for allocation; **BUILD** GPS. STUDENT-SIDE: unaffected.

**D11 — Library catalog/holds/renewals/fines.** STATUS: **PARTIAL.** EVIDENCE: `library_books` (searchable catalogue fields) + `library_loans` (fines) BUILT; no holds/reservations, no renewals, no fine-rule engine. ACTION: **EXTEND**. STUDENT-SIDE: unaffected.

**D12 — Placement machinery.** STATUS: **ABSENT.** EVIDENCE: no company/drive/eligibility/applicant/offer tables (schema swept). ACTION: **BUILD** (eligibility evaluates against `student_enrollments`/`grade_entries`/CGPA once D5 exists). STUDENT-SIDE: unaffected.

**D13 — Grievance/helpdesk + anonymous channel.** STATUS: **ABSENT (for this purpose).** EVIDENCE: there is a platform `support-cases`/`support-access` module and `support.ts` schema, but that is Edrion↔institution support, not a student grievance lane with sealed-identity. No anonymous/sealed-identity channel. ACTION: **BUILD**. STUDENT-SIDE: unaffected.

**D14 — Mock / question-bank / blueprint / entrance-prep.** STATUS: **PARTIAL → mostly BUILT (belief wrong).** EVIDENCE: `student-knowledge.ts` `question_bank` (shared, validated, `prompt_hash`/`prompt_version`, exposure via `question_exposure`), `mock_exams` + `mock_exam_questions/attempts/answers`, `exam_blueprints` (editable, retakes reuse), `exam_paper_patterns` (CBSE/KTU presets). MISSING: an explicit exam-profile / **syllabus-graph** / previous-year-question corpus for entrance prep. ACTION: WIRE-ONLY for mock/bank; **EXTEND** for syllabus-graph/PYQ. STUDENT-SIDE: unaffected.

**D15 — Spaced repetition + OCR pipeline.** STATUS: **BUILT (belief wrong).** EVIDENCE: SM-2 scheduler on `flashcards` (`ease`, `interval_days`, `reps`, `lapses`, `next_due_at`) + `flashcard_reviews`; `revision_states` (`freshness`, due tracking). Upload→OCR→extract: `knowledge_items` (`ingest_stage` incl. `'ocr'`, `extracted_text_ready`, `pages_done`, heartbeat/attempts) + `knowledge_item_pages` (`ocr_confidence`, `needs_confirm`); `student/learn/revision.*` + processors drive it. NOT FSRS specifically (it's SM-2). ACTION: WIRE-ONLY (or EXTEND SM-2→FSRS if required). STUDENT-SIDE: unaffected.

**D16 — Video/WebRTC/STT.** STATUS: **ABSENT.** EVIDENCE: searched `webrtc`/`speech-to-text`/`whisper`/`deepgram` — none. `debates`/`debate_turns` store `audio_object_id` + `audio_seam` jsonb (storage refs only), no realtime/STT infra. ACTION: **BUILD**. STUDENT-SIDE: unaffected.

**D17 — MFA/AAL2, roster sync, SSO.** STATUS: **PARTIAL.** EVIDENCE: AAL2 primitives exist (`auth_sessions.aal`, `institution_users.mfa_enrolled`/`require_mfa`/`last_auth_at`, recent-auth gate). MISSING: MFA/AAL2 **config screens**, and entirely absent Clever/ClassLink/OneRoster roster sync and SAML/OIDC SSO (searched `saml`/`oidc`/`oneroster`/`clever`/`classlink` — none). ACTION: **EXTEND** (MFA config UI) / **BUILD** (SSO + roster sync). STUDENT-SIDE: unaffected.

---

## WIRE-ONLY list (loud call-out — biggest time savings)

The institution side already exists; you only need a new student-facing read/interact surface + API exposure:

- **C1** learner-model data (`learn_attempts`, `evidence_tags`, `learn_sessions.evidence`)
- **C7** gradebook read (`grade_entries`, gated by `published`)
- **C8** attendance read (`attendance_records`; gate feed `campus_access_logs`/`gate_exit_events`)
- **C9** exam conduct/results (`exam_attempts`/`exam_answers`)
- **C10** timetable read (`timetable_slots` + academics)
- **C11 / D10** transport route + per-student assignment (`transport_routes`, `transport_assignments`)
- **C12** hostel allocation read (`hostel_allocations`)
- **C14** gate-pass status (`gate_passes`)
- **C15** book loans read (`library_loans`)
- **C16** health/counseling read (respect sensitive/audited-read model)
- **C19** homework/diary (`assignments`, `assignment_submissions`)
- **D2** payment intent (reuse `parent-portal` provider adapters + webhook verifier)
- **D14 / D15** mock exams, question bank, flashcards/SR, OCR study-material ingest (already student-scoped — largely surface work)
- **A5/A6/A8** job fan-out, idempotency (`scope`), storage — reuse, don't rebuild

---

## Plan adjustments needed before building

1. **Fees (D1) — plan assumes per-line-item demand rows; the code stores a single total.** `fee_invoices.amount` is one integer (minor units); there is no `fee_invoice_items` table, no installments, no late-fee rules, no separate receipt entity. **Add** `fee_invoice_items` + `fee_installments` + `fee_late_fee_rules` + `fee_receipts` (gapless numbering) tables, OR change the plan to single-total invoices. Lift proration/idempotency helpers from `billing.ts` (`credits.source='proration'`, `idempotency_keys`). **This is the one place an existing institution data model touches the student data contract** — a student "fee demand with line items" view must decide whether line-items come from a new table or are synthesized from `fee_structures`.

2. **Money is integer minor units everywhere; there are no decimals/`numeric` in portal tables.** Any new fee/payment work must use integer minor units (`amount`), matching `fees.ts`/`billing.ts`/`parent-money.ts`. Per-institution `currency` lives on `institutions.currency`.

3. **Learning-artifact tables MUST use the dual-owner shape** (`student_id` + `independent_user_id` nullable XOR, `institution_id` nullable tag). Prefer the `visual_canvases` CHECK constraint form. Do NOT introduce a single `user_id` — it would diverge from every existing table and the `independent_users`/`students` split.

4. **Mark release (D5): the `published` boolean already exists** on `grade_entries` and `exam_schedules` — build the student "results" surface to honor it, and add grading-scheme/GPA config as separate new tables rather than new columns on `grade_entries`.

5. **Attendance (D4): per-subject marking already exists** — don't rebuild sessions; add only `attendance_policies` + a term-session counter that reads `academic_terms` dates + `timetable_slots`.

6. **Documents (D8): build the vault + QR verification on top of the existing `doc-gen` render engine** (`document_templates`/`document_renders`), not from scratch. Add a per-student vault table (dual-owner if independent users can hold docs) + an HMAC short-code verifier reusing the webhook HMAC primitive.

7. **Serialized seat allocation (D7): reuse `idempotency_keys` with a new `scope`** for the allocation critical section instead of inventing a lock.

8. **Generic requests (A2): no reusable engine exists.** If several new student request types are coming (leave, document requests, grievances), build ONE generic request/approval + append-only event substrate first; the bespoke `early_leave_requests`/`hostel_outing_requests` are the reference shape.

---

## Confirmed-clean student side

The following student-facing builds are **UNAFFECTED** by institution-side reality and can be built exactly as planned (the large majority):

- All **personal learning artifacts** — canvases, flashcards/SR, knowledge library + OCR ingest, mock exams, blueprints, debates, achievements, learning paths, sessions, evidence/revision state. The schema already exists and is user-owned/portable; new tables just follow the convention.
- **Independent-user** flows (auth, sessions, storage, preferences) — first-class already.
- **AI tutor governance** — extend the existing policy engine with a student scope; no institution coupling.
- Student **read surfaces** over institution data (timetable, attendance, grades once published, exams, homework, transport, hostel, library loans, gate passes, health) — these consume institution tables through new APIs and impose **no** change on the institution schema.
- New institution-absent features (**D6 hall-ticket, D7 registration, D9 timetable exceptions, D12 placement, D13 grievance, D16 video/STT, D17 SSO/roster**) are greenfield — build them without worrying about conflicting existing models.

**The single flagged exception** where an existing institution data model constrains a student data contract is **fees (D1)**: the student "fee demand / receipt" contract must reconcile with the single-total `fee_invoices` shape (add line-items or synthesize). Everything else is clean.
