# Request Engine — implemented

Status: all Request Engine phases are implemented. Migration: `0085_request_engine`.

## What was built

1. Database and tenancy: request, immutable event, institution override, and student document-vault schemas; RLS registration; append-only grants/trigger; indexes; feature definition; and `document_templates.requires_sign_off`.
2. Shared contracts: versioned Zod payloads and mutation DTOs, code-defined request registry, state/event types, student and institution permissions, the `faculty_advisor` role marker, and the `student_portal` settings category.
3. Generic API engine: idempotent submit, student list/detail/cancel/reply, staff inbox/detail/claim/decision/reassign/note/bulk actions, optimistic concurrency, role/campus scoping, keyset pagination, audit mirroring, SLA calculation, expiry, and overlap/range validation.
4. Worked type `leave_request`: class-teacher/role routing, live preview, stored session snapshot, overlap prevention, atomic `excused` attendance writes, and attendance payoff state.
5. Worked type `document_request`: template catalog, existing render-pipeline enqueue, QR/verification code merge fields, retry-safe vault delivery, sign-off desk, send-back, issued-document list, revocation, and public verification UI.
6. Notifications/jobs: durable BullMQ fan-out with idempotent dedupe, request transition notifications, hourly SLA sweep, nightly information-request expiry, and document-render completion.
7. Institution UI: live-only Approvals inbox, filters, SLA priority, two-pane review, attachment viewing, context/history/internal notes, guarded actions and shortcuts, issuance/retry/sign/deliver/send-back/revoke, sidebar badge, and request-type settings.
8. Student UI: feature-gated My Requests, dynamic type/catalog loading, forms with blur validation and attachment limits, stable retry idempotency, confirmation/median expectation, tracker, cancel/reply/resubmit, offline IndexedDB fallback, stale banners, document vault, leave entry points, and verification page.

## Reconciliation checklist verdicts

1. PASS — `document_templates` existed at `packages/database/src/schema/doc-gen.ts`; only `requires_sign_off` was added.
2. PASS — `document_renders`, `documents.render`, the `reports` queue, and `apps/api/src/modules/documents/document-render.processor.ts` are reused.
3. PASS — central `idempotency_keys` and `IdempotencyService` are reused with `student_request_submit`; no request-row idempotency column was added.
4. PASS — request uploads use `StudentStorageService` and existing `storage_objects`; rendered PDFs use the existing attachment-storage service.
5. PASS — transitions mirror through `AuditWriter` into `audit_events`; no audit table/path was created.
6. PASS — `registrar` is reused, `faculty_advisor` is registered, and class-teacher routing follows the actual three-hop FK path.
7. PASS — the existing attendance service writes existing `attendance_records`; missing policy/OD/pending-marker substrates use the approved `excused` fallback.
8. PASS — existing `JobsService`, `QueueWorkers`, email, push, and notification storage are reused; only request job names and the request-notify adapter were added.

## Database contracts

### `student_requests`

`id uuid PK`; `institution_id uuid NOT NULL`; `campus_id uuid NOT NULL`; `student_id uuid NOT NULL`; `type text`; `payload jsonb`; `payload_schema_version int`; `status text CHECK`; `human_code text` unique per institution; `assigned_role text`; `assigned_user_id uuid nullable`; `decision_note text nullable`; `attachments jsonb`; `needs_info_question text nullable`; `sla_due_at timestamptz nullable`; `payment_request_id uuid nullable` (reserved, no target FK yet); `fulfilment_document_id uuid nullable`; `submitted_at/resolved_at timestamptz nullable`; `version int`; `created_at/updated_at timestamptz`.

### `student_request_events`

`id uuid PK`; `request_id uuid`; `institution_id uuid`; `seq int` unique per request; `event_type text CHECK`; `actor_kind text CHECK`; `actor_user_id uuid nullable`; `actor_role text nullable`; `note text nullable`; `data jsonb`; `created_at timestamptz`. The application role has INSERT/SELECT only, and a trigger rejects UPDATE/DELETE.

### `institution_request_type_config`

`id uuid PK`; `institution_id uuid`; `type_key text` unique per institution; `enabled boolean`; `routing_role_override text nullable`; `sla_days_override int nullable`; `label_override text nullable`; `version int`; actor/timestamp columns.

### `student_document_vault`

`id uuid PK`; `institution_id uuid`; `student_id uuid`; `request_id uuid nullable`; `document_render_id uuid` unique; `title text`; `doc_type text`; `verify_code text` globally unique, 12 characters; `issued_by uuid`; `issued_at timestamptz`; `revoked_at timestamptz nullable`; `revoked_reason text nullable`.

All four tables are institution-RLS registered through `app.institution_id`. Request/vault ownership is intentionally institution-bound `student_id`, not the dual-owner learning-artifact shape.

## HTTP contracts

All paths include the API global `/v1` prefix.

Student (`student.surface.requests.view` + `student.surface.requests`):

- `GET /v1/student/requests/types`
- `POST /v1/student/requests` — mandatory UUID `Idempotency-Key`
- `GET /v1/student/requests`
- `GET /v1/student/requests/:id`
- `POST /v1/student/requests/:id/cancel`
- `POST /v1/student/requests/:id/reply`
- `GET /v1/student/requests/leave-preview`
- `GET /v1/student/requests/documents`
- `GET /v1/student/requests/documents/:vaultId/file`

Institution staff (`requests.review` unless noted):

- `GET /v1/portal/requests`
- `GET /v1/portal/requests/:id`
- `GET /v1/portal/requests/:id/attachments/:storageObjectId/file`
- `POST /v1/portal/requests/:id/claim`
- `POST /v1/portal/requests/:id/unclaim`
- `POST /v1/portal/requests/:id/approve`
- `POST /v1/portal/requests/:id/reject`
- `POST /v1/portal/requests/:id/request-info`
- `POST /v1/portal/requests/:id/reassign`
- `POST /v1/portal/requests/:id/notes`
- `POST /v1/portal/requests/bulk-approve`
- `GET /v1/portal/requests/issuance` (`documents.issue`)
- `GET /v1/portal/requests/issuance/:vaultId/file` (`documents.issue`)
- `POST /v1/portal/requests/issuance/:vaultId/deliver` (`documents.issue`)
- `POST /v1/portal/requests/issuance/:vaultId/send-back` (`documents.issue`)
- `POST /v1/portal/requests/issuance/:vaultId/revoke` (`documents.issue`)
- `POST /v1/portal/requests/issuance/render/:renderId/retry` (`documents.issue`)

Configuration (`student_portal.manage`):

- `GET/POST /v1/portal/request-type-config`
- `PATCH/DELETE /v1/portal/request-type-config/:id`

Public:

- `GET /v1/documents/verify/:code`
- Student web verification routes `/verify/:code` and `/:code` (for `verify.edrion.com` host routing)

## Event, job, and configuration contracts

Request event types: `created`, `submitted`, `claimed`, `unclaimed`, `reassigned`, `info_requested`, `info_provided`, `approved`, `rejected`, `fulfilled`, `cancelled`, `expired`, `note_added`.

Jobs:

- `documents.render` on existing `reports` queue
- `requests.document_render_completed` on `notifications`
- `requests.notification.fanout` on `notifications`
- `requests.expire_needs_info` scheduled on `maintenance` every 24 hours
- `requests.sla_breach_sweep` scheduled on `maintenance` every hour

Idempotency scopes: `student_request_submit`, `student_request_notification`, `student_request_sla_breach`.

Feature/permission keys: `student.surface.requests`, `student.surface.requests.view`, `requests.review`, `requests.reassign`, `documents.issue`, `faculty_advisor`.

Global audit actions include `student_request.submit`, `student_request.claim`, `student_request.unclaim`, `student_request.info_requested`, `student_request.info_provided`, `student_request.approve`, `student_request.reject`, `student_request.fulfil`, `student_request.cancel`, `student_request.expire`, `student_request.reassign`, `student_request.note`, `student_request.document_render_retry`, `student_request.sign_deliver`, `student_request.issuance_send_back`, and `student_document.revoke`.

## Deviations and reconciled corrections

- The original hyperspec namespace `student.module.*` was replaced by the repository-authoritative `student.surface.*` namespace, per the completed shared-surface audit.
- Submit idempotency uses central `idempotency_keys`; the contradictory local `student_requests.idempotency_key` requirement was dropped per the binding reconciliation.
- Request attachments use `StudentStorageService`, not the bytes-only attachment service, per the actual ownership/metadata contract.
- Leave approval writes `excused` only. `od`, attendance-policy mapping, and future-session pending markers do not exist in the repository and were explicitly removed from v1 by the binding correction.
- Attendance percentages are derived at read time in this repository; `excused` rows were excluded from the denominator instead of writing a nonexistent aggregate percentage.
- Permission and role catalogues are code-defined, so `faculty_advisor` is registered there rather than seeded as a database permission row.
- Fee-dues context is `null` by design because no fee API is connected yet. No placeholder provider or parallel fee API was created.
- Default `bonafide` and `transcript` templates are added through the existing idempotent default-template seed path, not through a parallel template table.
- The public verification API is served under the monorepo API prefix and the public web route is host-routable to `verify.edrion.com`; no separate application was introduced.

No other deviations are known.

## Acceptance criteria self-check

1. PASS — central idempotency atomically claims the UUID key and replays the stored response/human code; client double-taps/retries reuse one key.
2. PASS — status mutation, one corresponding transition event, and AuditWriter call share the tenant transaction; direct decisions record their implied claim plus decision events as specified.
3. PASS — `edrion_app` has UPDATE/DELETE/TRUNCATE revoked on `student_request_events`, plus a blocking trigger.
4. PASS — the closed state machine returns `409 ILLEGAL_TRANSITION`; terminal-transition tests pass.
5. PASS — unclaimed `submitted`/`needs_info` cancellation succeeds; claimed/reviewing and claim races return `CANCEL_TOO_LATE`.
6. PASS — shared Zod rejects notes shorter than 10 characters; the stored note is returned verbatim to the tracker.
7. PASS — the nightly sweep checks the latest `info_requested`, uses the exact 14-day note, version-guards the update, and runs once.
8. PASS — leave approval writes each captured existing session as `excused` through the attendance service inside the approval transaction; failures roll back request and attendance writes. The approved repo correction forbids OD/future markers.
9. PASS — claim uses version + `assigned_user_id IS NULL`; the loser receives `ALREADY_CLAIMED` with the current claimer name. Decision races use the same claimer response.
10. PASS — document approval reuses one request-keyed render, unique vault-by-render, stored PDF, fulfilled transition, and one deduped fulfilment notification; retries reuse the render/vault.
11. PASS — sign-off documents are hidden unless request status is fulfilled; send-back deletes vault/PDF, writes an internal event, returns to `in_review`, and preserves the student-facing step.
12. PASS — verification returns issuer, initials, type, date, and live valid/revoked status; unknown codes return a generic 404.
13. PASS — inbox queries and detail authorization enforce assigned role/user, special class-teacher ownership, campus scope, and institution RLS.
14. PASS — SLA breach is derived, sorted first, red-bordered in UI, and deduped per request by `student_request_sla_breach`.
15. PASS — role reassignment clears user; user reassignment sets user; event data carries from/to; fan-out targets the new assignee.
16. PASS — enabled state is checked only on submission; existing requests resolve config without requiring enabled and continue normally.
17. PASS — changed student request surfaces contain no hard-coded `semester`, `section`, or `class teacher` copy.
18. PASS — student list/detail use IndexedDB cache fallback and stale banners; staff queries use `staleTime: 0`, `gcTime: 0`, and live refetch.
19. PASS — server overlap query blocks intersecting non-rejected/non-cancelled leave ranges independently of client preview.
20. PASS — registry lookup, schema parsing, routing, labels, SLA, notifications, and generic fallback are config-driven; a normal new type needs no migration or engine branch.
21. PASS — generation enqueues existing `documents.render`/`document_renders`; no render/template parallel was created.
22. PASS — `early_leave_requests` and `hostel_outing_requests` schemas/services/migrations were not changed.
23. PASS — verification codes call the exported HMAC primitive in `common/jwt.ts`; no new `createHmac` implementation was added.

## Verification performed

- API Vitest: 38 files, 258 tests passed.
- Shared schemas Vitest: 18 files, 143 tests passed.
- `@edrion/schemas` type check: passed.
- `@edrion/permissions` type check: passed.
- Focused type-check output for every changed Request Engine/API/student/institution file: no feature-local errors.
- Drizzle migration/schema check: passed.
- `git diff --check`: passed.
- ESLint could not run because the workspace has no installed `eslint` executable, despite package scripts referencing it.
- Full application type checks remain blocked by unrelated pre-existing errors in programme structure, lab-mock, visual-studio, people/admin, and one unused mock-exam import; none are in Request Engine files.
- No AI/API-usage smoke tests were run.

# Module Visibility — implemented

Status: all Module Visibility phases are implemented. Migration: `0086_module_visibility`.

## Completed phases

1. Schema/migration: `student_modules`, 23 migration-seeded `student.surface.*` definitions, institution-module dependency switches, assignment tuple uniqueness, duplicate preflight, independent-user backfill, and settings category support.
2. Contracts/API: typed catalogue and presets, strict terminology/config Zod schemas, atomic revision-guarded portal configuration, campus overrides, dependency/tier/domain gates, audit events, cache busting, and student ETag endpoint.
3. Institution UI: two-column configuration screen, suggested/applyable presets, plan/dependency locks, campus inheritance/clearing, label overrides, terminology fields, confirmation, and the prop-only `StudentHomePreview`.
4. Student consumption: persisted last-good config, foreground revalidation, effective server-ordered navigation, terminology accessor, offline/fallback navigation, and quiet `MODULE_DISABLED` handling.
5. Independent tier: idempotent signup seeding plus migration backfill for `learn`, `library`, `lab`, `planner`, `progress`, and `exam_prep`.

## Reconciliation verdicts

1. PASS — definitions follow migration seeding and use boolean `default_value`.
2. PASS — real assignment shape/scopes are used; live duplicate preflight returned `NO_DUPLICATES`; migration adds tuple uniqueness.
3. PASS — all resolution delegates to the existing pure `resolveFeature` entry point.
4. PASS — rollouts remain separate and untouched.
5. PASS — settings use native category + bare-key text serialization with actor/version columns; `terminology` was added.
6. PASS — actual institution types map to suggested presets; document type-array targeting was mirrored.
7. PASS — saves use `AuditWriter`; append-only grants remain authoritative.
8. PASS — sensitive `student_portal.manage` reuses HTTP 403 `RECENT_AUTH_REQUIRED`.
9. PASS — independent signup UUID is the `independent_user` assignment scope id.
10. PASS — new `StudentHomePreview`; live Home page unchanged.
11. PASS — existing `student_portal.manage` is reused.
12. N/A — the binding correction removed the custom terminology lint rule.

## Acceptance criteria self-check

1. PASS — no resolver precedence/rollout implementation was added.
2. PASS — 23 definitions and the reference table are migration-seeded from the deployment catalogue.
3. PASS — unassigned surfaces use definition defaults.
4. PASS — existing resolver tests verify campus-over-institution behavior; runtime endpoint uses the same resolver.
5. PASS (corrected) — Edrion super-admin institution assignments may override plan assignments; institution-portal saves cannot bypass a current plan lock.
6. PASS — new `institution.module.*` switches drive dependency locks and runtime hiding.
7. PASS — tier gates exclude college-only and institution-ineligible individual surfaces.
8. PASS — terminology comes from `institution_settings`, or the static independent pack.
9. PASS — preset saves write assignments/settings/audit only.
10. PASS — type-derived suggestion is read-only until save.
11. PASS — preset identity is recomputed server-side.
12. PASS — dirty guard and confirmation dialog are implemented.
13. PASS — advisory lock + revision comparison returns `CONFIG_STALE` before writes.
14. PASS (corrected) — existing 403 `RECENT_AUTH_REQUIRED` guard is reused.
15. PASS — campus divergence writes rows; clear deletes rows and restores inheritance.
16. PASS — strict schema validates the closed 14-key terminology pack and bounds.
17. N/A — custom terminology lint was explicitly dropped.
18. PASS — preview consumes in-memory props and performs no request.
19. PASS — ETag/304 and synchronous cache bust on save are implemented.
20. PASS — existing surface endpoints return `MODULE_DISABLED`; shell renders the quiet panel.
21. PASS — last-good config is persisted; no-cache fallback keeps Today/Profile and retry.
22. PASS — saves enqueue no notifications or Today events.
23. PASS — advisory serialization plus shared revision permits one successful double-submit.
24. PASS — granular and summary events write only through `AuditWriter`.
25. PASS — independent scope seeding is idempotent and uses the static `Plan` terminology.

## Module Visibility verification

- `@edrion/feature-flags`: 2 files, 27 tests passed.
- `@edrion/schemas`: 20 files, 152 tests passed in the final combined verification run.
- `@edrion/feature-flags` and `@edrion/schemas` type checks passed.
- Changed institution-web Module Visibility files: no focused type errors.
- Changed student-web Module Visibility files: no focused type errors.

# Fees — implemented

Status: core Fees phases are implemented. Migration: `0087_fees_engine`.

## Completed phases

1. Schema/security: version snapshots, immutable invoice items, generalized dual-owner intents, receipts and gapless campus/FY sequences, waivers, inbound gateway events, institution policy, RLS, grants, immutable triggers, backfills, and indexes.
2. Ledger/API: cached demand/payment totals, oldest-due allocation under a student advisory lock, desk/guardian/student settlement, cheque/DD clearance and bounce, waivers, two-person refunds, replacement receipts, dues blocking, reconciliation, exports, reminders, statements, and request-payment hooks.
3. Providers: full mock path plus credential-gated Razorpay Orders, browser confirmation HMAC, and webhook HMAC; signed gateway work is acknowledged then processed through the existing `billing-sync` queue.
4. Jobs/documents: receipt and statement renders, document-vault filing, 100-student resumable demand-generation chunks with progress/CSV, intent expiry, institution-local configured-hour overdue/late-fee deltas, reminders, payable-request timeout, and gateway processing, all tracked on existing queues/background jobs.
5. Institution UI: structures CRUD plus line-item/installment/version composer, regeneration, activation, cohort generation/progress/reporting, collections search/recording/printing, waiver/refund actions, reconciliation register, exports, defaulters, aging, reminders, clearance, second approvals, failed-receipt retry, unmatched matching, and disputes.
6. Student/parent UI and contracts: cached/offline balance, breakdown, late-fee projection, dues holds, enforced oldest-invoice partial selection, real Razorpay checkout/UPI handoff, intent polling, honest debit-unknown copy, history/receipt downloads, statements, and unchanged guardian mirror over the shared ledger.

## Fee table shapes (new/extended)

- `fee_structure_versions`: institution/structure/version, immutable `line_items`, `installment_schedule`, late policy, creator/time; unique structure+version.
- `fee_invoice_items`: institution/invoice/student, kind/category/label, integer base and tax minor values, source snapshot/time; append-only financial rows.
- `fee_receipt_sequences`: institution+campus+FY primary key and next number.
- `fee_receipts`: institution/campus/student/payment-group, number/FY/amount/method/snapshot/PDF/vault, issue/cancel state, refund proposal/approval fields, OCC version and actors.
- `fee_waivers`: student/invoice/amount/reason/status, threshold snapshot, proposer/approvers, optional request link, OCC version.
- `fee_gateway_events`: gateway+provider event uniqueness, payload, signature result, outcome and processing timestamps.
- `institution_fee_config`: partial policy, waiver/refund thresholds, dues consequences, reminder offsets, receipt template, late-run hour, bounce fee, Tally map and OCC version.

## Fee endpoints and jobs

Student: `GET /student/fees`, `/history`, receipt file and intent reads; `POST /student/fees/intents`, `/:id/confirm`, `/statement`.

Institution additions: student search/detail; structure versions/activate/generate, generation progress and CSV; desk payment, clear/bounce; waiver propose/approve/reject; receipt print/refund/approve/reject and render retry; dispute resolve; reconciliation, CSV/Tally/QuickBooks export, manual reminders and unmatched matching; fee config.

Internal: `GET /internal/fees/dues-block/:studentId`.

Jobs: `fees.receipt_render`, `fees.receipt_render_completed`, `fees.demand_generation.chunk`, `fees.gateway_event.process`, `fees.maintenance`; existing `documents.render`, `requests.notification.fanout`, and Today jobs are reused.

## Fees acceptance self-check

§1: 1 PASS; 2 PASS; 3 PASS; 4 PASS; 5 PASS by per-student advisory serialization (database load test still required in deployment staging).

§2: 1 PASS — hourly maintenance applies late-fee deltas only at each institution's configured local `late_fee_run_hour`, and repeat execution is delta-idempotent; 2 PASS; 3 PASS — balance uses cached invoice totals in one invoice read and does not scan payment rows.

§3: 1 PASS (schema returns `INSTALLMENTS_INVALID`); 2 PASS; 3 PASS; 4 PASS; 5 PASS.

§4: 1 PASS; 2 PASS by unique demand key and resumable 100-student jobs; 3 PASS; 4 PASS; 5 PASS. Progress polling and a dedicated batch CSV report are exposed to the institution UI; queue-disabled local/test mode executes the same chunks synchronously.

§5: 1 PASS; 2 PASS; 3 PASS; 4 PASS; 5 PASS.

§6: 1 PASS; 2 PASS; 3 PASS; 4 PASS.

§7: 1 PASS; 2 PASS; 3 PASS — unmatched-event locking/clearing and desk-equivalent payment/receipt creation share one database transaction.

§8: 1 PASS; 2 PASS; 3 PASS; 4 PASS; 5 PASS; 6 PASS; 7 PASS for configured `requiresPayment` request types; 8 PASS; 9 PASS; 10 PASS. Credential-enabled Razorpay checkout loads only after an intent exists and returns its signed result to the server verifier; mock mode remains external-call-free.

§9: 1 PASS under the binding correction that explicitly required a Razorpay adapter; 2 PASS; 3 PASS; 4 PASS; 5 PASS through immediate verification plus queued application work (production load test outstanding); 6 PASS. Provider-originated partial/full refund events append idempotent negative ledger rows, replace/cancel receipts, and notify the student.

## Fees deviations/external steps

- Apply migration `0087_fees_engine` and the final grants/RLS scripts.
- Set `PAYMENT_PROVIDER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` only in the deployment secret store; configure the webhook URL in Razorpay. Mock remains the safe local/test default.
- Allow the browser to load Razorpay's official checkout script in the production CSP; no fake production checkout was added.
- Production concurrency and 100-event webhook latency still require deployment load tests against the real PostgreSQL/Redis topology.

# Today Feed — implemented

Status: core Today phases are implemented. Migration: `0088_today_feed`.

## Completed phases

1. Schema/security: dual-owner obligations, feed facts and fallback preferences; owner XOR checks/RLS; append-only feed grants; pending and `next_due_at` indexes; Today/ribbon/nudge definitions.
2. Contracts/API: strict Obligation contract, normalization/fallback, deterministic merge/sort/dedupe, 800 ms provider isolation, ETag Today payload, keyset feed, obligation CRUD, preference OCC, ribbon dismissal and expiry.
3. Providers/hero: self declarations, published assignments, fees, published exams, one shared review query, attendance warning, exam/in-class/next-class/idle hero precedence, chips and signal-gated nudge.
4. Fan-out/notifications: announcement chunks, published report-card results, request transitions, fees/receipts/reminders/disputes; immediate event writes, event-key dedupe, module visibility/toggles, timezone-aware quiet holds, delayed coalesced release and emergency bypass on existing infrastructure.
5. Student UI: cache-first Today, ETag refresh, stale/offline states and guarded offline links, due rail plus grouped full-height sheet, pull/manual refresh, offline one-slot checkbox outbox, dismissible ribbon, hero/nudge/chips, keyset auto-pagination, new-item markers, and Today preferences in Settings.

## Today table shapes, endpoints and jobs

- `user_obligations`: nullable institution context, XOR student/independent owner, source/kind/title/due/status/deep-link, idempotency key, OCC and timestamps.
- `feed_events`: nullable institution/campus context, XOR owner, unique owner+event key, type/module/copy/link/occurred time; append-only.
- `today_preferences`: XOR owner, chips, module notification map, dismissed ribbon ids, nudge timestamp, quiet override/held events/release time and OCC.

Endpoints: `GET /student/today`, `GET /student/feed`; `POST/PATCH/DELETE /student/me/obligations`; `GET/PATCH /student/me/today-preferences`.

Jobs: `today.obligations.expire`, `today.feed.fanout`, `today.quiet_hours.release` on the existing maintenance/notification workers with `background_jobs` tracking.

## Today reconciliation verdicts

1. PASS — existing push channel signature is reused; event-key dedupe happens at `feed_events` before push/hold.
2. PASS (fallback) — fixed-column `student_preferences` cannot store arrays/maps/timestamps without widening; `today_preferences` is the approved dual-owner fallback.
3. PASS — existing `JobsService`, `QueueWorkers`, and `JobTracker` registration/tracking are reused.
4. PASS — `flashcards.next_due_at` is authoritative and one request-level query feeds both review card and chip; migration adds the index.

## Today acceptance self-check

1 PASS; 2 PASS; 3 PASS; 4 PASS through owner+idempotency uniqueness/latest row; 5 PASS; 6 PASS; 7 PASS; 8 PASS; 9 NOT BENCHMARKED (cache-first path is implemented); 10 PASS; 11 PASS; 12 PASS; 13 PASS; 14 PASS by atomic claim (database race test outstanding); 15 PASS; 16 PASS; 17 PASS; 18 PASS; 19 PASS; 20 PASS (no configurable academic noun literals on Today); 21 PASS; 22 PASS; 23 PASS under the binding nullable-institution correction; 24 PASS; 25 PASS; 26 PASS under the binding requirement to add TodayNotify on existing infrastructure; 27 PASS via approved fallback; 28 PASS.

## Today known source-bound deviations

- No club event writer is connected because this repository has no club/event publishing backend.
- Independent `first_block` cannot be resolved because the repository has no persisted plan-engine block/target-date source; independent users receive the honest idle state.
- The existing `WebPushChannel` remains the repository's delivery boundary; real browser/device subscription delivery depends on that deployment integration.

# Final verification (Modules + Fees + Today)

- API Vitest: 39 files, 261 tests passed.
- Shared schemas Vitest: 20 files, 152 tests passed.
- Feature flags Vitest: 2 files, 27 tests passed.
- `@edrion/schemas` type check: passed.
- Focused changed-file checks for API Fees/Today/Request integration, institution Fees/Module UI, student Fees/Today/Module UI, and database schemas: no feature-local TypeScript errors.
- `git diff --check`: passed.
- Full application type checks retain only the documented unrelated baseline failures in programme structure, lab mock/visual studio, existing portal repositories, people/admin, and one mock-exam import.
- No AI-consuming smoke tests or live payment-provider calls were run.
