# Tier 1 — Build Order, Shared Contracts, and Open Decisions

Companion to `PLAN-TIMETABLE.md`, `PLAN-ATTENDANCE.md`, `PLAN-MARKS.md`, `PLAN-LIBRARY.md`.
Each plan is handed to its own execution session **together with its hyperspec**. This file is the
coordination layer: read it before starting any of the four.

---

## 1. Build order

```
Timetable ──▶ Attendance ──▶ Marks
Library ─────────────────────────▶   (parallel, any time)
```

**Timetable first.** It owns two artifacts everything downstream reads: the pure recurrence expander
(`packages/schemas/src/timetable/resolver.ts`) and the `period_exceptions` table. The Attendance
hyperspec explicitly offers to create an exception table if timetable hasn't run (§12 item 4) — that
authorization is **revoked** in `PLAN-ATTENDANCE.md` A4 precisely so this ordering is enforced rather
than raced.

**Attendance second.** Its forecaster imports the timetable expander (one expander, three call sites)
and its recompute subscribes to the exception publish job. It also lands the shared
`RequestTypeConfig.entrySurface` widening that Marks needs.

**Marks third.** Heaviest, and last because it inherits the `entrySurface` change. It has **no
runtime dependency** on Timetable or Attendance — if scheduling pressure demands, it can move ahead
of Attendance, provided that session makes the `entrySurface` change itself and tells the Attendance
session.

**Library any time.** It shares no domain tables with the other three. Its **only** cross-cutting
coupling is Today's `reviewDueCount()` (`PLAN-LIBRARY.md` A6), which it must repoint in the same PR
as the FSRS backfill.

**Migration numbering.** The last applied migration is `0088_today_feed`. The plans assume
`0089`/`0090`/`0091`/`0092` in the order above. **Whoever merges first takes the next free number** —
renumber rather than colliding, and say so in your IMPLEMENTED file.

---

## 2. Shared contracts all four plans agreed on

These were derived from the repo, not from the hyperspecs. Every plan is written against them.

### 2.1 Feature-flag namespace — `student.surface.*`
The hyperspecs' `student.module.*` does not exist. `packages/feature-flags/src/student-modules.ts`
already registers **`timetable`, `attendance`, `results`, `library`** with
`requiresInstitutionModule` values `timetable | attendance | grading | null`. No new surface
definitions are needed for the four features themselves; sub-flags
(`student.results.whatif`, `library.exam_aware_scheduling`, …) are new and migration-seeded, following
Module Visibility's precedent.

### 2.2 Queues — closed set, job names only
`apps/api/src/common/queue/queue.constants.ts` fixes `QUEUE_NAMES` to
`imports | exports | reports | notifications | billing-sync | ai | maintenance`.
**No plan creates a queue.** Agreed job names:

| feature | job | queue |
|---|---|---|
| Timetable | `timetable.exception.fanout` | `notifications` |
| Attendance | `attendance.recompute` | `notifications` |
| Attendance | `attendance.marks_sweep` | `maintenance` |
| Marks | `results.release_fanout`, `results.recompute_term` | `reports` |
| Library | `library.fsrs_backfill`, `library.generate`, `library.index_chunks` | `ai` |
| Library | `library.daily_reminder`, `library.streak_finalize` | `maintenance` |

### 2.3 Notification dedupe — a database unique index, not a parameter
`feed_events` has unique `(student_id, event_key)` and `(independent_user_id, event_key)`
(`packages/database/src/schema/today.ts:53-54`). Quiet hours are
`today_preferences.held_notification_events` + `quiet_release_at`, drained by the existing
`today.quiet_hours.release` job. **No plan builds a `sent_notifications` table.** All dispatch goes
through `apps/api/src/modules/student/today/today-notify.service.ts`.

Agreed `event_key` prefixes (namespaced so no two features can collide):

| feature | key format |
|---|---|
| Timetable | `tt:{exception_id}:{student_id}` · `tt:revoke:{exception_id}:{student_id}` · `tt:edit:{batch_id}:{student_id}` |
| Attendance | `attn:{student}:{subject}:{term}:{zone}:{date}` |
| Marks | `{batch_id}:{student_id}` · `rev:{revision_id}:{student_id}` · `complete:{term_id}:{student_id}` |
| Library | `lib:reminder:{owner_id}:{local_date}` |

### 2.4 Obligation contract — closed enum, ribbon via `urgency_override`
`packages/schemas/src/obligations.ts`. `kind` is closed:
`assignment | homework | review_queue | mock | fee_installment | exam | study_block | custom`, and
`normalizeObligationKind` **silently coerces anything else to `'custom'`**. There is no
`dismiss_policy`; ribbons are `urgency_override: 'ribbon'` and dismissal is
`today_preferences.ribbon_dismissed_ids`.
Consequences: Attendance's `kind:'attendance_threshold'` becomes `kind:'custom'` with a stable id
(`PLAN-ATTENDANCE.md` A11); Timetable's personal reminder is `kind:'study_block'` on the existing
`user_obligations` table (there is no `student_calendar_items` — `PLAN-TIMETABLE.md` A12).
`home_stat_chips` is likewise closed and **already contains** `attendance_pct`, `gpa_term`, `streak`,
`review_due_count` — no plan adds a chip key.

### 2.5 `period_exceptions` — owned by Timetable, read-only for everyone else
Shape frozen in `PLAN-TIMETABLE.md` Phase 1. Repo-bound corrections vs the hyperspec: `new_room` is
**`text`** (no rooms table exists), times are **`text "HH:MM"`**, `slot_id` is `ON DELETE RESTRICT`,
and idempotency uses the central `idempotency_keys` table (scope `timetable_exception_create`) rather
than a row column. No DELETE grant; UPDATE restricted to revocation fields by trigger.

### 2.6 One recurrence expander
`packages/schemas/src/timetable/resolver.ts` — pure, no I/O. Timetable's resolver service, the Today
Now/Next hero, the ICS generator, **and** Attendance's `computeRemainingSessions` all call it.
Attendance filters and counts; it does not re-expand. Guarded by a shared-fixture equality test.

### 2.7 Single-class enrollment — **the most consequential shared finding**
`student_enrollments` (`packages/database/src/schema/enrollments.ts:27`) carries **one nullable
`class_id`**, with unique indexes enforcing one row per `(student, academic_year, term)`. **No
elective or multi-section membership table exists anywhere in the repo.** `subjects.kind='elective'`
and `programme_subjects.is_elective` are curriculum flags, not per-student memberships.

Both the Timetable and Attendance hyperspecs assume multi-section students as a headline feature
(Timetable AC 1 requires a 3-class student). Both plans keep the array-shaped signatures
(`sectionIds: uuid[]`) so a future membership table is an internal change, and both amend the
affected acceptance criteria. **Neither plan builds the table** — see §4.1.

### 2.8 Times are `text "HH:MM"`; marks are `integer`
`timetable_slots.start_time/end_time`, `exam_schedules.start_time/end_time`, and
`calendar_events.start_time/end_time` are all **`text`** in zero-padded 24-hour form (lexicographic
comparison is correct). `grade_entries.marks_obtained` and `max_marks` are **`integer`** — the
gradebook schema comment states "no decimals anywhere". Every derived percentage/GPA lives in
`numeric` columns on new tables; every value written back to `grade_entries` is an integer.

### 2.9 Holidays — `calendar_events` + `calendar_event_types.key = 'holiday'`
Migration `0081_calendar_types_backfill` seeds a system `'holiday'` type per institution.
`calendar_events` has `starts_on date NOT NULL`, `ends_on date NULL`, `status`, `campus_id`.
**No plan creates `academic_holidays`** — both hyperspecs' fallbacks to invent one are void.

### 2.10 Fee-linked requests already exist — `draft` status, not `awaiting_payment`
The Request Engine creates `requiresPayment` types in status **`draft`** with a dedicated
`fee_invoices` row (`origin:'request'`, `linkedRequestId`), stores the **invoice** id in
`student_requests.payment_request_id`, transitions `draft → submitted` on payment
(`fee-ledger.service.ts:637`), and **cancels** unpaid requests at **72h**
(`fee-jobs.service.ts:101`). The Marks hyperspec's entire §8.2 engine extension is superseded
(`PLAN-MARKS.md` A1). `REQUEST_STATUSES` and the event-type CHECK need **no** extension.

### 2.11 Side effects dispatch on `approvalSideEffectKey`
`request-engine.service.ts:486` (`leave_attendance`) and `:509` (`fee_waiver`) are the pattern. New
types (`od_request`, `attendance_correction`, `revaluation`) add branches **there**, not new
`input.type === '...'` branches. Note the engine *does* already contain type branches at `:98` and
`:1103` — the hyperspecs' "zero engine branches" acceptance criteria are amended in both plans to the
achievable and actually-meaningful form.

### 2.12 Tier 0 surfaces that Tier 1 must **replace, not duplicate**
Three live Today providers compute Tier 1 numbers with placeholder math. Each owning plan repoints
them, and each plan's DoD requires the existing Today test suite not to regress.

| `today.service.ts` | today | owner |
|---|---|---|
| `attendanceWarning()` `:186` | all-time, institution-wide %, threshold from `institution_settings('student_portal','attendance_threshold')`, deep link `/analytics` | Attendance (A10) |
| `attendance_pct` / `gpa_term` chips `:181` | all-time attendance %, raw published mark average, deep link `/report-cards` | Attendance / Marks (A10) |
| `reviewDueCount()` `:185` | `flashcards.next_due_at` | **Library (A6) — silently breaks on FSRS migration** |
| Now/Next hero | derived without a resolver | Timetable (A9) |

### 2.13 UI, API, and misc conventions
- **No `sheet.tsx` in `packages/ui`** — there is `drawer.tsx`, `dialog.tsx`, `detail-panel.tsx`. All
  four plans use `drawer.tsx`. Existing in-app patterns: `components/learn/AskPetrosDrawer.tsx`,
  `components/visual-studio/NodeActionSheet.tsx`.
- All API routes carry the global **`/v1`** prefix.
- There is **no** `apps/api/src/modules/timetable` or `/attendance` — staff-side lives in
  `apps/api/src/modules/portal/*`, student-side in `apps/api/src/modules/student/*` (follow the
  `student/today/` layout).
- `apps/student-web/src/app/(app)/` has no `timetable`, `attendance`, or `results` segment yet; it
  **does** have `report-cards`, `analytics`, `library`, `exams`, `progress`.
- Permissions and roles are **code-defined** in `packages/permissions`, not seeded rows.
- Institution config is `institution_settings` — flat `(institution_id, campus_id, category, key,
  label, value_type, value text)` via `PortalCrudEngine`. No feature adds a config table except
  `attendance_policies`, which is justified by knob count.
- Idempotency uses the central `idempotency_keys` table + `IdempotencyService` with a named scope —
  never a per-row column (Request Engine reconciliation 3).
- Append-only tables copy the trigger + revoked grants from `0085_request_engine.sql`.
- Owner-XOR on dual-owner tables copies **`0088_today_feed.sql`**'s `num_nonnulls(...) = 1` form —
  **not** `visual_canvases`, which has no owner XOR check despite the Library hyperspec's claim.

---

## 3. Cross-spec conflicts found and how they were resolved

| # | Conflict | Resolution |
|---|---|---|
| 1 | Timetable §12.4 vs Attendance §12.4 — both may create the exception table | Timetable owns it; Attendance's authorization revoked (ordering enforced) |
| 2 | Timetable §4.1 expander vs Attendance §2.1 `computeRemainingSessions` — two expanders | One pure expander in `packages/schemas/src/timetable/`; Attendance imports it |
| 3 | Both invent `academic_holidays` | Neither does; `calendar_events` + seeded `'holiday'` type |
| 4 | Attendance §9.6 + Marks §7 both emit Today items with invented shapes | Both conform to the closed `Obligation`/`feed_events` contract (§2.3, §2.4) |
| 5 | Marks §8.2 rebuilds payment; Fees Tier 0 already shipped it | Repo wins; §8.2 superseded (§2.10) |
| 6 | Attendance §8.2/Marks §8.1 both need `RequestTypeConfig.entry`; the field is `entrySurface?: 'documents'` | Widen once to `'documents' \| 'attendance' \| 'results'`; Attendance lands it, Marks imports it |
| 7 | All four specs assume a `packages/ui` sheet | `drawer.tsx` (§2.13) |
| 8 | All four assume `student.module.*` flags | `student.surface.*` (§2.1) |
| 9 | All four assume a dedicated queue | Job names on existing queues (§2.2) |
| 10 | Timetable + Attendance assume multi-section students | Not expressible; ACs amended; table not built (§2.7, §4.1) |
| 11 | Library claims `visual_canvases` has an owner XOR check | It does not; use the Today form (§2.13) |
| 12 | Library forbids `institution_id` on learning artifacts; repo has it (nullable) everywhere | Repo wins — nullable context tag, never owner identity |
| 13 | Marks §1.3 makes a mark release publish the exam datesheet | Removed — `exam_schedules.published` gates the **datesheet** for parents, a separate concern |
| 14 | Attendance status enum omits `left_early`, which Today counts as present | Added to the vocabulary with a `left_early_counts_as` knob defaulting to `present` |
| 15 | Library day boundary 04:00 vs Today's boundary | Library-local helper only; Today unchanged; flagged for a human (§4.4) |

---

## 4. Decisions a human must make before (or during) execution

These are genuine product/infrastructure choices that reconnaissance cannot settle. Each names the
default the plans currently encode, so execution is not blocked if no answer arrives.

### 4.1 Multi-section / elective enrollment — **the big one**
The repo cannot express a student belonging to more than one class. Both the Timetable and Attendance
hyperspecs treat elective students as a headline capability ("electives make clashes real"). Building
the membership table is an **academic-core** change touching enrollment, attendance session scoping,
gradebook, and fees — far beyond any one Tier 1 plan.
**Encoded default:** single-class resolution, array-shaped signatures preserved, affected acceptance
criteria amended.
**Decide:** ship Tier 1 single-class and schedule an academic-core change, or insert an
enrollment-model PR ahead of Timetable. *If college electives are a launch requirement, this is
blocking and should be answered first.*

### 4.2 pgvector availability
Library's "Ask this document" needs `CREATE EXTENSION vector` on the Supabase instance. Nothing in the
repo uses pgvector today; the embedding **provider** exists (`LearnAiProvider.embedTexts`,
`OPENAI_EMBEDDING_MODEL`), but no vector storage does.
**Encoded default:** the migration attempts the extension and fails loudly; if unavailable, Library
ships everything except Ask-this-document, which stays behind a never-flipping `index_ready`.
**Decide:** confirm the extension can be enabled, and confirm `OPENAI_EMBEDDING_MODEL` is set in the
target environments (embedding dimension is read from it, not hard-coded).

### 4.3 Revaluation fee amount is code-defined, not per-institution
The engine reads `feeLine.amountMinor` from the static `RequestTypeConfig`
(`request-engine.service.ts:137`). Making it a per-institution knob is an engine change.
**Encoded default:** one code-level default amount; institutions cannot vary it in v1.
**Decide:** acceptable for launch, or fund the engine change?

### 4.4 Library's 04:00 day boundary vs Today's
Streaks, new-card budgets, and reminder dedupe use 04:00 local (hyperspec F1); Today's surfaces use
their own boundary. They disagree between 00:00 and 04:00.
**Encoded default:** library-local helper, Today unchanged, divergence documented.
**Decide:** confirm 04:00, or unify on Today's boundary.

### 4.5 Terminology pack is closed at 14 keys
Module Visibility ratified a **closed** 14-key pack (root `IMPLEMENTED.md` AC 16). Tier 1 introduces
many new configurable nouns ("Period", "Extra class", "CGPA", "SGPA", "revaluation", "OD", "advisor").
Widening the pack is a Module Visibility change.
**Encoded default:** English defaults for new nouns; the gap recorded in each IMPLEMENTED file; the
affected "no hard-coded nouns" acceptance criteria amended to cover only keys the pack actually has.
**Decide:** widen the pack now (one focused PR, before Tier 1 UI phases) or accept the gap.

### 4.6 Room clash detection is string-matching or nothing
No rooms table exists; `timetable_slots.room`, `classes.room`, `exam_schedules.room` are free text.
**Encoded default:** `TEACHER_CLASH` blocks saves (real FK, reliable); `ROOM_CLASH` is a **warning**
computed by trimmed case-insensitive string match, not a blocking 422 as the hyperspec specifies.
**Decide:** accept, or fund a rooms registry (which would also improve exam-hall and lab scheduling).

### 4.7 Two student results surfaces
`apps/student-web/src/app/(app)/report-cards/` exists and is live; Marks adds `results/`.
**Encoded default:** add `results/`, audit `report-cards/`, and document the outcome.
**Decide:** fold, redirect, or keep both.

### 4.8 Marks: does exam marking actually reach `grade_entries`?
`exam_attempts`/`exam_answers` exist, but the path by which auto/teacher-marked online-exam scores
land in `grade_entries` was not traced (`PLAN-MARKS.md` A5 instructs the executor to trace it before
coding release preconditions). If it does not, every online exam's release will report missing entries.
**Encoded default:** trace it in Phase 1 and record the finding either way; build no second marking path.
**Decide:** nothing yet — but if the trace comes back negative, that is a real gap needing a call.

---

## 5. What every execution session must produce

Each session writes **`IMPLEMENTED-<FEATURE>.md`** at the repo root (not into the shared
`IMPLEMENTED.md`, which is Tier 0's). It must contain, at minimum:

1. What was built, per phase.
2. **Every deviation** from its plan and its hyperspec, with justification. The plans each pre-list
   the deviations that are expected — if one of those is missing from your file, you either didn't hit
   it or didn't notice it, and both are worth saying.
3. **Exposed contracts**, verbatim and precise: table columns, function signatures with import paths,
   endpoint list with the `/v1` prefix, job names, `event_key` formats, new flag and permission keys.
   *This section is what the next Tier 1 and Tier 2 sessions read.*
4. The acceptance self-check table, with PASS / PASS-with-deviation / N/A **and reasons** — never a
   bare PASS on something not actually exercised. Load tests and benchmarks that could not run
   locally are `NOT BENCHMARKED`, not `PASS` (Tier 0 set this precedent; keep it).
5. Verification commands run and their real results, including failures.

**Known baseline:** full-repo type checks currently fail on pre-existing, unrelated errors in
programme structure, lab-mock/visual-studio, portal repositories, people/admin, and one mock-exam
import (root `IMPLEMENTED.md`). Do not try to fix those; do confirm your feature adds none.
