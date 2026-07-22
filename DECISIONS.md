# Mock Exams decisions

- Migration number is `0100_mock_exam_extensions.sql` because `0098`/`0099` are Documents / mark_release_batches.
- No `exam_profiles` table yet (Tier 3): use validated nullable `exam_profile_key` text on `exam_blueprints`, not an FK. Wire FK when Tier 3 lands.
- Past-mistakes is a read projection over `mock_exam_answers.evaluation` + immutable question/attempt snapshots (+ compatible `learn_attempts`/`evidence_tags`). No mutable notebook / shadow mistakes table in v1.
- Origin is derived from dual-owner columns; no redundant `origin` column.
- Timer never pauses (including Quick). Answer grace is `ends_at+120s`. Generation shortfall ready only at ≥60%; no placeholders. Subjective self-grade is authoritative; AI is post-self comparator only.
- Voluntary mock `individual_scores_visible` is hard-coded false.

## D-T2-017 — NTA skin (AMENDED)

**Status: AMENDED — NTA skin deferred pending approved reference assets.**

- D6 ships the default digital-exam skin (standard) in place of a bespoke `nta` layout.
- The `nta` skin value remains **RESERVED** in the blueprint `skin` enum (`standard|nta|paper`). No schema/CHECK change.
- At render time a skin-resolver maps `nta → standard`. Selecting `nta` never fails; the player shows a calm, dismissible one-line note: “NTA-exact interface coming soon — practicing in standard mode.”
- **Reversal trigger:** approved NTA reference screenshots + hex checked into `apps/student-web/src/components/mock-exams/nta-reference/`, at which point the frozen-NTA D6 work resumes and the pixel-regression gate is added.
- **Tier 3 Entrance Prep** must NOT assume a live `nta`-skinned component exists yet. It consumes the paper pattern/blueprint SHAPE (D2) and the standard player, and inherits the NTA skin later when built.

# Documents / Issuance / Report Cards decisions

- `verify_show_full_name`: default-off institution setting (`category=documents`, `key=verify_show_full_name`). Verification returns initials unless explicitly enabled; changing it is audited and permissioned. (PLAN-DOCUMENTS §2.3)
- Send-back uses transactional `abandoned_at` tombstone on `student_document_vault` (not hard delete). Student projection hides abandoned rows and emits no notification; request returns to `in_review`. (PLAN-DOCUMENTS §2.4)
- Evolve existing `student_document_vault` / `document_templates` / `document_renders`; do not create `vault_documents` or a second request type. Migration number is `0098` because `0097` is already used by student tutor policy.
- Preserve draft+invoice fee-linked request flow; SLA starts on payment confirmation.
- Report cards bind released marks via `mark_release_batches.entry_ids` ∩ `grade_entries.published=true` only.
- One shared pure `computeTermAggregate` for all GPA/standing; no second GPA implementation.

# Request Engine decisions

- Request submissions use the existing central `idempotency_keys` service with scope `student_request_submit`; `student_requests` deliberately has no local idempotency column.
- Student request attachments use `StudentStorageService`, which owns metadata and writes `storage_objects`. `AttachmentStorageService` remains the byte store used by the existing document renderer.
- Leave approval writes only `excused` records for the `attendance_sessions` captured at submit time. The repository has no `od` status, `attendance_policies`, or future-session pending marker, so those paths are intentionally absent. Attendance percentages exclude `excused` records at read time.
- Class-teacher routing resolves `students.class_id -> classes.class_teacher_id -> staff.institution_user_id`; it does not introduce a `class_teacher` role.
- `faculty_advisor` is registered in the code-defined institution permission/role catalogues because those catalogues are not database-seeded in this repository.
- Document requests reuse `document_templates`, `document_renders`, the `reports` queue, and attachment storage. The only document table added is `student_document_vault`.
- Request notifications use a small feature service over the existing notification, email, push, BullMQ, and idempotency substrates. Dedupe keys are `request_id:event_seq` and `request_id:sla_breach`.
- Fee dues in document-request context are exposed as `null`. No fee API/provider integration was added; the field is ready for the later Fees feature.
- The feature flag is the repository-authoritative `student.surface.requests`, migration-seeded disabled by default.

# Module Visibility decisions

- The repository-authoritative namespace is `student.surface.<key>` and definitions are migration-seeded.
- An Edrion super administrator may override a plan-level exclusion using the existing feature-control assignment hierarchy. Institution administrators do not gain super-admin feature-control access.
- Institution-module dependency switches are added as `institution.module.<key>` feature definitions so student surfaces can be hidden when their backing institution module is inactive.
- Existing student-surface defaults are preserved; adding Module Visibility does not silently enable surfaces that the repository previously shipped disabled.
- Portal configuration uses `institution_settings` with its native `(category, key)` convention: categories `terminology` and `student_portal`, with bare keys inside each category.
- Recent authentication retains the repository contract: HTTP 403 with `RECENT_AUTH_REQUIRED`.
- The live student Home page remains untouched; admin preview uses a new presentational `StudentHomePreview`.
- No custom terminology ESLint rule is added in v1.

# Fees decisions

- Money remains PostgreSQL `integer` minor units. Each stored value therefore has the documented approximately ₹2.1 crore ceiling; currency is always read from `institutions.currency`.
- `fee_invoices.source` keeps the repository meanings (`tuition|fine|transport|hostel|other`). New demand provenance uses `origin`; charge typing uses `fee_invoice_items`.
- `parent_payment_intents` is generalized in place with an XOR owner (`guardian` or `student`). No sibling payment-intent table is created.
- Payment-intent idempotency remains local to the intent row. Demand generation, desk payments, refunds, and reminders use the central idempotency service.
- Razorpay is the only real provider adapter added. Mock remains the development/test default; Stripe remains deferred.
- Cheque and DD allocate at recording time and issue a receipt immediately. Bounce appends reversal rows and keeps the cancelled receipt number.
- Refund and waiver thresholds use “strictly greater than”; exactly the configured threshold needs one approver, one minor unit more needs two distinct approvers.
- A partial refund cancels the original receipt and issues a new gapless replacement receipt for the retained amount.

# Today Feed decisions

- The binding ownership correction wins over the older hyperspec wording: `user_obligations`, `feed_events`, and `today_preferences` all use student/independent dual-owner XOR plus a nullable institutional-context tag.
- The fixed-column `student_preferences` table cannot hold Today arrays/maps safely, so the approved `today_preferences` fallback table is used.
- Module visibility comes only from normal `student.surface.*` resolution and `institution_settings`; no Today-specific portal configuration table exists.
- Review count and the synthetic review obligation share one `flashcards.next_due_at` query and the migration adds its index.
- Today notification fan-out, quiet-hour holding, and coalescing register job types on the existing queues/workers and use the existing push channel. No parallel notification stack is introduced.
- Where the repository has no writer (notably clubs) or no independent plan-engine block table, Today does not invent one; those states remain unavailable until their source feature exists.
