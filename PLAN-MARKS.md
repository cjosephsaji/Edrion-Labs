# PLAN — Marks, Results, What-If & Revaluation (Tier 1)

**Companion hyperspec:** `02S7-08S3-MARKS-RESULTS-HYPERSPEC.md`. Read both. This plan sequences and
corrects the hyperspec; the hyperspec carries the behavioral detail. Where they conflict, **this plan
wins**, because it is reconciled against the live repo.

**Build order:** ships **after** Attendance (it is the heaviest, and it depends on the shared
`RequestTypeConfig.entrySurface` widening that Attendance lands first).

---

## 1. Feature summary & why it exists

Marks exist in the database (`grade_entries`) but there is no deliberate act of *releasing* them, no
weighting model, no GPA, and no student surface beyond a raw published-average number. This feature
adds: a **release state machine** (draft → released → retracted) layered on the existing `published`
boolean; **grading schemes** and **subject weight maps**; a denormalized `student_term_results` row
so results day is one indexed read per student; the student Marks/Results surface with a client-side
**what-if calculator**; and **revaluation** as the first fee-linked, mark-mutating request type.

---

## 2. Spec Amendments

### A1 — Fee-linked requests are already built, differently (replaces §8.2 entirely) — **binding**
This is the largest correction in the plan. Hyperspec §8.2 specifies a new `awaiting_payment` status,
a rename of `payment_request_id` → `fee_invoice_item_id`, a link to `fee_invoice_items`, and three new
event types. **The repo already ships fee-linked requests, via a different and working mechanism.**

Evidence:
- `packages/schemas/src/request-types/types.ts:49-51` — `RequestTypeConfig` already has
  `requiresPayment: boolean` and `feeLine?: { label, amountMinor, category }`.
- `apps/api/src/modules/requests/request-engine.service.ts:120,125,136,137` — on submit, a
  `requiresPayment` type is created with **`status: 'draft'`** (not `awaiting_payment`) and
  `submittedAt: null`, with **no `submitted` event**. The engine then inserts a dedicated
  **`fee_invoices`** row (`invoiceNo: 'REQ-' + humanCode`, `origin: 'request'`, `linkedRequestId`)
  **plus** one `fee_invoice_items` row, and stores the **invoice** id in
  `student_requests.payment_request_id`.
- `apps/api/src/modules/portal/fee-ledger.service.ts:637` `releasePaidRequests()` — when the invoice
  is fully paid, it transitions `draft → submitted` under a per-request advisory lock with a
  `submitted` event (`actorKind: 'system'`, note `'Payment confirmed'`) and enqueues the request
  notification. **There is no `payment_confirmed` event type.**
- `apps/api/src/modules/portal/fee-jobs.service.ts:101,105` — abandonment sweep cancels stale payable
  requests at **72 hours** (not 48), setting `status: 'cancelled'` (not `expired`) with note
  `'Payment not completed'`, and cancelling the invoice only when `amountPaid = 0`.
- `packages/schemas/src/request-types/types.ts:3-13` — `REQUEST_STATUSES` has no `awaiting_payment`.

**Do this:**
- **Do not add `awaiting_payment`.** Do not rename `payment_request_id`. Do not add
  `payment_pending`/`payment_confirmed`/`payment_refunded` event types. Do not attach to
  `fee_invoice_items` directly.
- Configure `revaluation` with `requiresPayment: true` + `feeLine: { label, amountMinor,
  category: 'exam' }` and **inherit the existing flow unchanged**.
- The §8.3.4 tracker stepper renders `Payment → Submitted → In review → Done` by mapping the
  **`draft`** status to the "Payment" step for `requiresPayment` types. This is a **presentation**
  mapping in the tracker component, not a new status.
- The abandonment window is **72h**, and the terminal state is **`cancelled`**. Amend §8.2.1 and
  **AC 13** accordingly: "an unpaid request is cancelled at 72h exactly once, cancelling the
  zero-paid invoice". Tracker copy: "Closed — payment not completed · Start again" is still correct.
- **`fee_amount_minor` is code-defined in `feeLine`, not an institution knob.** Making it
  per-institution requires an engine change (the fee line is read from the static config at
  `request-engine.service.ts:137`). Ship v1 with a code default and record this as a deviation;
  see the overview's human-decision list.

### A2 — `grade_entries` shape (resolves §14 items 1–2)
`packages/database/src/schema/gradebook.ts:19`. Confirmed present: `student_id`, `subject_id`,
`exam_id NULL`, `class_id NULL`, `assessment_name text NOT NULL`, `letter_grade text NULL`,
**`published boolean NOT NULL DEFAULT false`**, `version`, and unique
`grade_entry_uniq (student_id, subject_id, exam_id)`.

**Critical corrections:**
- **`marks_obtained` and `max_marks` are `integer`, not numeric.** The schema comment is explicit:
  "Marks are whole numbers (integer), consistent with the rest of the portal (no decimals anywhere)."
  All §2 weighting math must therefore compute in a wider numeric type **in the application/derived
  tables** (`student_term_results.weighted_pct`, `term_gpa` are `numeric`), while every value written
  back to `grade_entries.marks_obtained` — including `computeNeeded`'s ceiled thresholds and
  revaluation `new_score` — is an **integer**. §2's "ceiled to the assessment's mark granularity
  (integer default)" is not a default; it is **the only option**.
- Also present and unmentioned by the hyperspec: `academic_year_id`, `term_id`, `campus_id`,
  `remarks`, `actorColumns`. Use the existing **`term_id`** for term scoping — do not derive the term
  from the exam.
- `exam_schedules.published` exists (`packages/database/src/schema/exams.ts:89`) but its comment is
  "Datesheet visible to parents only when published" — it gates the **datesheet**, not marks.
  `grade_entries.published`'s comment is "Parent-portal publish gate". **They are independent gates.**
  §1.3's rule ("releasing an exam-scoped batch also publishes the schedule") is therefore **removed**:
  publishing marks must not retroactively expose a datesheet. Record as a deviation; this also
  resolves §13.5 — the strategic call is decided *against* by the repo's semantics.

### A3 — `programme_subjects.credits` is `integer NULL` (resolves §14 item 3)
`packages/database/src/schema/academics.ts:233` — `credits: integer('credits')`, **nullable**, not
`numeric(4,1)`.
**Do this:** `subject_weight_maps.credits_override` stays `numeric(4,1)` (overrides may legitimately
be 1.5), but the base read is an integer that **may be null**. Null credits → treat as
`gpa_formula`-dependent: under `credit_weighted`, a null-credit subject is **excluded from the GPA**
and the term card shows "credits not set" rather than silently weighting it as 0 or 1. Add this to the
§1.4 recompute job and test it.

### A4 — Term resolution and the enrolled-subject join (resolves §14 item 3, second half)
The term table is **`academic_terms`** (`schema/academics.ts:326`) — this is §14 item 17's answer, and
column additions there are permitted. A student's enrolled subjects for a term resolve as:
`student_enrollments (student, year, term) → class_id` → `classes.programme_level_id` +
`academic_terms.sequence` → `programme_subjects (programme_level_id, semester_sequence)` for
curriculum and credits; **and** `class_subject_teachers (class_id)` for what is actually taught.
Use `class_subject_teachers` as the authoritative "enrolled subjects" set (it reflects reality) and
join `programme_subjects` for credits. Note **single-class enrollment** (see the Timetable plan A2 /
Attendance A7) — no electives outside the class.

### A5 — Exam marking path (resolves §14 item 4)
`exam_attempts` / `exam_answers` exist (`schema/exams.ts:153,180`). **Trace the actual write path
into `grade_entries` before coding release preconditions** — start at
`apps/api/src/modules/portal/gradebook.service.ts` and the exam-engine module. If auto-marked scores
do not land in `grade_entries`, the release precondition "missing entries" will fire on every online
exam. Record the finding in IMPLEMENTED.md either way. Do **not** build a second marking path.

### A6 — Request Engine contract (resolves §14 items 5–8)
- `student_requests.payment_request_id` exists as `uuid NULL`, "reserved, no target FK yet" (root
  `IMPLEMENTED.md`) — but it is **now in active use pointing at `fee_invoices.id`** (A1). **No rename.**
- `student_request_events.event_type` is a CHECK over the 13 values listed in
  `request-types/types.ts:17` — **no extension needed** (A1 removes the three payment events).
- `REQUEST_STATUSES` needs **no extension** (A1).
- `RequestTypeConfig.entrySurface` is `?: 'documents'` — widen to
  `'documents' | 'attendance' | 'results'`. **The Attendance plan makes this change first; import it,
  do not re-edit.** If Attendance has not merged, make the change here and tell that session.
- Per-type approve-form fields and context-snapshot hooks are **not** in `RequestTypeConfig` today —
  the interface has only `summaryLine`. §8.4's `new_score` + `note` approve form therefore needs
  either an extension to `RequestTypeConfig` or a typed branch. **Do this:** extend
  `RequestTypeConfig` with an optional `approveFormSchema?: z.ZodType` and dispatch the side effect on
  **`approvalSideEffectKey: 'revaluation'`**, matching the existing `leave_attendance` / `fee_waiver`
  pattern at `request-engine.service.ts:486,509`. Add no `input.type === 'revaluation'` branch.

### A7 — Fees contract (resolves §14 items 9–12)
`fee_invoice_items` exists with `institution_id, invoice_id, student_id, kind, category, label,
amount_minor, source jsonb` — note the fields are **`kind`/`category`/`label`/`source`**, not
`origin`/`request_id`/`description`. The request→fee link is carried by the parent **`fee_invoices`**
row (`origin:'request'`, `linkedRequestId`) plus `source: { request_id, request_type }` on the item.
Void/refund discipline is append-only negative items (see the `fee_waiver` side effect at
`request-engine.service.ts:510`). Receipt-to-Vault delivery exists (`fees.receipt_render` →
`student_document_vault`).
**Do this:** §8.4's `revaluation.refund_on_reject` (default **false**) routes through the existing fee
refund path on `fee_receipts`/negative `fee_invoice_items`. **Do not write fee tables directly** —
call the fee service.

### A8 — Feature flags are `student.surface.*`
`packages/feature-flags/src/student-modules.ts:24` registers
`{ key: 'results', requiresInstitutionModule: 'grading', defaultVisible: true }`.
**Do this:** the surface gate is **`student.surface.results`** (exists). `student.results.whatif` and
`student.results.petros_fix` are **new** flag definitions — add them to the feature-flag catalogue the
same way Module Visibility seeded its definitions (migration-seeded, boolean `default_value`, per root
`IMPLEMENTED.md` Module Visibility verdict 1). School presets set `whatif` off (§9).

### A9 — Institution config lives in `institution_settings` (resolves §14 item 15)
`packages/database/src/schema/settings.ts:17` — flat `(institution_id, campus_id, category, key,
label, value_type, value text)` KV, version-guarded, edited via `PortalCrudEngine`.
**Do this:** `results.show_class_average`, `results.missing_entry_policy`, `results.hod_release_gate`,
`revaluation.refund_on_reject`, and the per-exam-series `revaluation_window` all land as
`institution_settings` rows under category **`academic`** (or `student_portal` for the student-facing
ones — match whichever category the nearest existing key uses; `attendance_threshold` lives under
`student_portal`). **No new config table.**

### A10 — Today already emits a `gpa_term` chip; replace it
`apps/api/src/modules/student/today/today.service.ts:181` computes `gpa_term` as a raw published
average over **all** `grade_entries` with deep link **`/report-cards`**.
**Do this:** repoint it to `student_term_results.term_gpa` (or `term_pct` when
`gpa_formula = 'none'`), scoped to the current term, deep-linking to the new results route. The chip
key `gpa_term` is already in the closed `home_stat_chips` enum
(`packages/schemas/src/obligations.ts:26`) — **do not add a chip key.**

### A11 — Feed item kinds (resolves §14 item 13)
`feed_events` (`schema/today.ts:37`) has free-text `type` + `source_module` and **unique
`(student_id, event_key)`** — the dedupe is the DB index, not a parameter. Root `IMPLEMENTED.md`
already lists "published report-card results" as a Today fan-out producer — **find it and replace it**,
do not add a parallel results producer.
**Do this:** `type` values `marks_released` / `mark_revised` / `results_complete`,
`source_module: 'results'`, `event_key = '{batch_id}:{student_id}'` (and
`'rev:{revision_id}:{student_id}'`, `'complete:{term_id}:{student_id}'`). Deep link
`/results/{term}/{subject}?highlight={ref}` — **register the route** in `apps/student-web`.

### A12 — Queues: job names only
`QUEUE_NAMES` is closed (`apps/api/src/common/queue/queue.constants.ts:7`).
**Do this:** `results.release_fanout` and `results.recompute_term` on the existing **`reports`**
queue (they are heavy, chunked, and the reports worker already handles that shape) — or
`notifications` if fan-out latency matters more; pick one, justify it in IMPLEMENTED.md, and use the
existing `JobsService`/`JobTracker` registration. **No new queue.**

### A13 — `packages/ui` has `drawer.tsx`, no `sheet.tsx`. Use `drawer.tsx` (same as the other plans).

### A14 — Existing student results routes
`apps/student-web/src/app/(app)/` already contains **`report-cards`**, `exams`, and `progress` — but
no `results`. **Do this:** add `results/`; audit `report-cards/` and either fold it in or leave it
untouched and unlinked. Do not build a second marks surface alongside a live one without saying so.

### A15 — Permissions are code-defined (resolves §14 item 16)
Root `IMPLEMENTED.md`: "permission and role catalogues are code-defined, so `faculty_advisor` is
registered there rather than seeded as a database permission row."
**Do this:** add `gradebook.approve_release`, `results.recompute_approval`, and the exams-office role
key to `packages/permissions` in code. First **read the existing gradebook permission key names**
(`gradebook.manage` is referenced in `schema/gradebook.ts`'s comment) and build the release permission
on top of them rather than inventing a parallel key.

### A16 — Doc-gen path exists (resolves §14 item 20)
`packages/database/src/schema/doc-gen.ts` + `document_renders` + the `reports` queue +
`apps/api/src/modules/documents/document-render.processor.ts` are all live (root `IMPLEMENTED.md`
Request Engine verdict 2). §5.3's grade-card slot is genuinely a flag away. Ship the slot rendering
**nothing** in v1, per §5.3.

### A17 — Terminology pack is closed at 14 keys (resolves §14 item 19)
Same finding as Timetable A14. "CGPA"/"SGPA"/"revaluation" are almost certainly not among the 14.
**Do not widen the closed pack** from this chat. Ship English defaults and record the gap. **Amend
AC 18** to: no hard-coded configurable nouns *that the pack actually covers*; the rest are documented
as pending pack extension.

---

## 3. Dependencies & contracts

**Reads / writes (existing):** `grade_entries` (**the only mark store** — read + `published` flips +
`marks_obtained` revisions), `exam_schedules`, `exams`, `exam_attempts`/`exam_answers` (A5),
`programme_subjects.credits` (A3), `academic_terms` (+2 new columns), `classes`,
`class_subject_teachers`, `student_enrollments`, `subjects`.

**Tier 0:** Request Engine (registry, `approvalSideEffectKey` dispatch, Approvals Inbox, tracker,
`IdempotencyService`); Fees (`fee_invoices`, `fee_invoice_items`, payment webhook, refund path,
receipt→Vault — all via the fee service, **A7**); Today (`feed_events`, `today-notify.service.ts`,
`home_stat_chips`); Module Visibility (`student.surface.results`, `institution_settings`, presets);
`JobsService`/`JobTracker`; `AuditWriter`; `PortalCrudEngine`; `document_renders`.

**Tier 1:** none hard. Marks does **not** depend on Timetable or Attendance at runtime; it shares only
the `entrySurface` widening (A6) and the ui/queue/flag conventions. It can be built in parallel with
Library.

**Exposes downstream:** `student_term_results` (Tier 2 mock-exam and Petros surfaces will read it);
`computeStanding`/`computeNeeded` in `packages/schemas/src/grading/`; the release state machine as the
only writer of `grade_entries.published`.

---

## 4. Phases

### Phase 1 — Migration (`0091_marks_results`)
**Files:** `packages/database/migrations/0091_marks_results.sql`; new
`packages/database/src/schema/grading.ts`; `schema/academics.ts` (2 columns on `academic_terms`);
`schema/index.ts`; `sql/zzz_rls.sql`, `zzz_grants.sql`.

**Schema — new tables per hyperspec §1.1–1.5, with these bindings:**
- `grading_schemes` + `grading_scheme_versions` (append-only: **no UPDATE/DELETE grants**, mirror the
  `student_request_events` trigger from `0085_request_engine.sql`)
- `subject_weight_maps` — unique `(subject_id, term_id, class_id)` null-distinct;
  `credits_override numeric(4,1) NULL` (**A3**)
- `mark_release_batches` — `entry_ids uuid[]`, `scope jsonb`, stored generated scope-hash column, the
  partial unique index of §1.3
- `student_term_results` — unique `(student_id, term_id)`, index `(institution_id, term_id)`
- `student_cgpa_snapshots`
- `mark_revisions` — append-only, no UPDATE/DELETE grants
- `academic_terms`: add `grading_scheme_id uuid NULL`, `grading_scheme_version int NULL` (**A4**)
- **No column is added to `grade_entries`** (hyperspec constraint 7).

**DoD:** migration applies; append-only grants proven by a refused UPDATE on
`grading_scheme_versions` and `mark_revisions`; RLS blocks cross-institution reads on all six new
tables; the partial unique index rejects a second non-retracted batch for the same scope.

---

### Phase 2 — Shared grade function (pure)
**Files:** `packages/schemas/src/grading/compute.ts`, `schemes.ts` (the four presets),
`compute.spec.ts`, `packages/schemas/src/grading/index.ts`.

**Behavior:** §2 verbatim, with **A2's integer constraint**: `computeNeeded` returns integer
`needed_score` values, always ceiled.

**DoD:** AC 7 — ≥12 fixtures per scheme kind (`points_10`, `cbse`, `us_4`, `percentage`), executed in
CI by **both** the API and `apps/student-web` test runs so divergence is impossible. Plus a fixture
for **null credits** (A3) and for `open_weight_pct = 0`.

---

### Phase 3 — Release state machine + recompute job
**Files:** `apps/api/src/modules/portal/mark-release.service.ts`,
`apps/api/src/modules/portal/results-recompute.processor.ts`,
`apps/api/src/modules/portal/results-fanout.processor.ts`; extend
`apps/api/src/modules/portal/gradebook.controller.ts`; job registration per **A12**.

**Behavior:** §3's table verbatim, minus the exam-schedule publish rule (**A2**). Release flips
`published` on exactly `entry_ids` **in the same transaction** as the status change. Retract window
60 min server-enforced → 409 `RETRACT_WINDOW_CLOSED`. §1.4 recompute is idempotent on
`{student_id}:{term_id}`.

**DoD:** AC 2 (atomicity under process kill), AC 3 (audit-diff test: no other code path writes
`published` or mutates `marks_obtained` on released entries), AC 4 (unmapped assessment refused;
missing-entry policy both ways), AC 5 (5,000-student fan-out ≤60s, one push + one feed item each,
re-run proves dedupe, duplicate delivery → byte-identical rows), AC 10 (60 min vs 61 min),
AC 11 (scheme edit moves no stamped term; two-person recompute; two-term CGPA stability).

---

### Phase 4 — Student read API + adversarial suite
**Files:** `apps/api/src/modules/student/results/student-results.controller.ts`, `.service.ts`,
`.module.ts`; Zod in `packages/schemas/src/grading/dto.ts`.

**Endpoints** (`/v1`, gated `student.surface.results`): term results (one indexed
`student_term_results` read), component detail (keyset over published `grade_entries`), CGPA.

**DoD:** **AC 1 is the headline** — an adversarial test suite (forged exam/entry/batch ids, direct
aggregate calls, unpublished refs) proving unpublished entries are indistinguishable from
nonexistent ones on **every** read path including feed items and any Petros payload. AC 6 (query plan
shows the single indexed read, no request-time aggregation over `grade_entries`; 5,000 concurrent
reads p95 ≤300ms). AC 9 (`show_class_average=false` strips averages **server-side**). AC 22 (no
student query filters on `mark_release_batches.status`).

---

### Phase 5 — `revaluation` request type
**Files:** `packages/schemas/src/request-types/revaluation.ts`; registry `index.ts`; `types.ts`
(`entrySurface` widening + `approveFormSchema`, **A6**); one new `approvalSideEffectKey: 'revaluation'`
branch in `apps/api/src/modules/requests/request-engine.service.ts`.

**Behavior:** §8.1 config + §8.3/§8.4 flows, **entirely on the existing payment mechanism (A1)**.
Approve side effect writes `mark_revisions` + updates `grade_entries.marks_obtained` (**integer**,
A2) + enqueues recompute, all in the approve transaction.

**DoD:** AC 12 (double-tap → one request and one invoice+item), AC 13 **as amended by A1** (72h
cancellation, zero-paid invoice cancelled, post-cancel webhook does not reopen), AC 14 (atomic
approve; any failure aborts leaving the request unchanged), AC 15 (revision copy, no-change payoff,
duplicate refused citing the code, out-of-window refused server-side), AC 16 (`refund_on_reject` both
ways through the fee service), AC 23 (single `RequestTypeConfig` module; zero new request/fee tables).

---

### Phase 6 — Institution UI
**Files:** `apps/institution-web` gradebook release chips + confirm sheet (§4.1), HOD approval screen
(§4.2), grading-scheme config (§4.3) and weight-map editor (§4.5) via `PortalCrudEngine` where flat;
settings knobs per **A9**.

**DoD:** §4.1–4.5 flows; §4.4's two-person recompute (with the 24h-delay degradation for
single-admin institutions); AC 4's inline refusals preserve popover state.

---

### Phase 7 — Student UI + Today repoint
**Files:** `apps/student-web/src/app/(app)/results/` (**A14**), components under
`apps/student-web/src/components/institutional/results/`; **repoint the `gpa_term` chip and the
existing published-results feed producer (A10, A11)**.

**Surfaces:** §5.1 marks screen, §5.2 what-if drawer (**A13**), §5.3 Results tab + CGPA hero,
§9 school Progress variant.

**DoD:** AC 7's second half (**zero network requests while sliding** — assert with a request spy),
AC 8 (unreachable target is calm, never an error; the "estimate" caption always present), AC 17
(school presets: no what-if, no CGPA hero, no revaluation entry — preset snapshot tests; flipping to
a college preset restores all three with no redeploy), AC 19 (offline cache + stale banner; red only
for `is_pass:false` bands), AC 20 (`credits_override=null` reads live, incl. the null-credits case
from A3). **The existing Today suite must not regress.**

---

## 5. Risks & landmines

1. **Reimplementing payment (A1).** The single most likely failure. An executor following §8.2
   literally will add `awaiting_payment`, break the closed `REQUEST_STATUSES` union, and fork a
   working flow. *Guard:* A1 is binding; a test asserts a submitted `revaluation` lands in status
   `draft` with a `fee_invoices` row whose `linked_request_id` matches.
2. **Assuming decimal marks (A2).** Writing `62.5` into `marks_obtained` silently truncates in
   Postgres' integer cast or throws. *Guard:* `computeNeeded` returns `number` typed as integer with a
   runtime `Number.isInteger` assertion at the write boundary.
3. **Publishing the datesheet as a side effect (A2).** *Guard:* a test asserts
   `exam_schedules.published` is unchanged by a mark release.
4. **A second visibility flag.** Any `is_released`/`visible` boolean on a new table used in a student
   query. *Guard:* AC 22's grep plus the "no student query filters on batch status" test.
5. **`student_term_results` treated as truth.** It is a cache. *Guard:* AC 5's duplicate-delivery
   byte-identical test plus a full rebuild-from-raw test.
6. **Release fan-out not chunked.** 5,000 students in one transaction will time out. *Guard:* §3's
   200-student chunks, mirroring the fees demand-generation chunking at
   `apps/api/src/modules/portal/fee-jobs.service.ts`.
7. **Scheme edits moving history.** *Guard:* results reference `(scheme_id, scheme_version)`; AC 11's
   two-term fixture under different versions.
8. **Null credits (A3).** Silent 0-weighting corrupts every GPA in a college that hasn't filled
   credits. *Guard:* explicit exclusion + a visible "credits not set" state + a test.
9. **Retract racing recompute.** *Guard:* recompute keyed `{student}:{term}` and idempotent; retract
   re-enqueues rather than mutating results directly.
10. **Duplicating the report-cards surface (A14).** *Guard:* decide and document.

---

## 6. Acceptance & closeout

Self-check against **all 25 numbered criteria in hyperspec §11**, as amended (AC 13 per A1; AC 18 per
A17; drop the exam-schedule half of the §1.3 rule per A2). Record PASS / PASS-with-deviation / N/A
with reasons. Run reuse-verification greps 21–25 verbatim and paste output. **The §6 load test is
part of the definition of done** — if it cannot run locally, say so explicitly rather than marking it
PASS.

Then write **`IMPLEMENTED-MARKS.md`** at the repo root: what was built per phase; every deviation
(expect at minimum: the payment mechanism (A1), integer marks (A2), no datesheet publish (A2),
null-credit handling (A3), code-defined fee amount (A1), terminology pack gap (A17)); exposed
contracts (`student_term_results` columns, `computeStanding`/`computeNeeded` signatures and import
path, release state machine transitions and error codes, endpoints with `/v1`, job names, feed
`event_key` formats, new permission and flag keys); the acceptance table; verification commands and
results.
