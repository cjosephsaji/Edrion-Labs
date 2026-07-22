# PLAN — Attendance + the Forecaster (Tier 1)

**Companion hyperspec:** `02S6-ATTENDANCE-FORECASTER-HYPERSPEC.md`. Read both. This plan sequences
and corrects the hyperspec; the hyperspec carries the behavioral detail. Where they conflict, **this
plan wins**, because it is reconciled against the live repo.

**Build order:** ships **after** Timetable. It consumes `TimetableResolver` and `period_exceptions`,
both of which Timetable owns and freezes.

---

## 1. Feature summary & why it exists

Attendance marking already exists on the staff side, but a student cannot see their own percentage,
and nobody can answer the only question students actually ask: *"how many more classes can I miss?"*
This feature adds the **Forecaster** — a per-subject projection over remaining timetabled sessions —
plus the full student attendance surface, an institution attendance-policy config, and three
Request Engine types (`od_request`, `attendance_correction`, and amendments to the existing
`leave_request`) that write corrections back through the existing attendance service.

---

## 2. Spec Amendments

### A1 — `attendance_records.status` values (resolves §12 item 1) — **binding**
`packages/database/src/schema/attendance.ts:76` documents and defaults
`status text NOT NULL DEFAULT 'present'` with the value set:

> `present | absent | late | excused | left_early`

**There is no `od` value, and there is no DB CHECK constraint on the column** (it is bare `text`).
The extra value `left_early` is real and in active use: Today's chip and ribbon queries at
`apps/api/src/modules/student/today/today.service.ts:181,186` count
`status in ('present','late','left_early')` as attended and exclude `'excused'` from the denominator.

**Do this:**
- The mark vocabulary is **`present | absent | late | excused | left_early | od`**. Add **`od`** only.
- **Add a CHECK constraint** over that six-value set in Phase 1 (the hyperspec permits exactly this
  ALTER). Adding the constraint where none existed is a hardening, not a fork — but verify no
  existing row violates it first, in the same migration.
- **`left_early` must be handled everywhere**, and the hyperspec never mentions it. Bind it to a new
  policy knob `left_early_counts_as` (`present | absent`, **default `present`**) so the existing
  Today behavior is preserved bit-for-bit. Do not silently drop it into "absent".

### A2 — Attendance write path (resolves §12 item 2)
The service is `apps/api/src/modules/portal/attendance.service.ts`, and its marking method is
**`attendance.mark(ctx, sessionId, { marks: [{ studentId, status, remarks }] })`** — confirmed by
the Request Engine's existing consumer at
`apps/api/src/modules/requests/request-engine.service.ts:831` (`applyLeaveAttendance`).

**Do this:** every fulfilment-hook write goes through that method. **Read it before coding** to
confirm whether it emits any event/outbox row. If it emits nothing (likely), add the emission
**inside `attendance.service.ts` once**, never in the callers — this is the hyperspec's own
instruction and it is the difference between one trigger and five.

### A3 — `attendance_sessions` columns (resolves §12 item 6)
Real shape (`packages/database/src/schema/attendance.ts:20`):
- `class_id NOT NULL`, `subject_id NULL` (**null = homeroom/whole-day register**),
  `date date NOT NULL`, **`period text NOT NULL DEFAULT 'full_day'`**, `slot_id NULL → timetable_slots`,
  `academic_year_id NULL`, `term_id NULL`, `notes`, `version`
- The marker column is **`taken_by_id → staff.id`**, **not `marked_by`**. Bind §8.3 correction routing
  to `taken_by_id`.
- Uniques: `(class_id, date, period)` and a partial `(class_id, date, slot_id)` where slot_id is not null.
- **There is no cancellation/status column on `attendance_sessions`** (resolves §12 item 4's second
  half). Session cancellation is expressed **only** via Timetable's `period_exceptions` of
  `type='cancelled'`. §1.4 "cancelled sessions excluded from every denominator" therefore means:
  exclude sessions whose `(class_id, date, slot_id)` matches a live cancelling exception. There is
  nothing to read on the session row itself.

### A4 — Timetable exceptions are owned by the Timetable plan (resolves §12 item 4) — **binding**
§12 item 4 authorizes this chat to "create the minimal exception table if Chat 7 is unrun". **That
authorization is void.** Timetable ships first in Tier 1 and owns `period_exceptions` and
`TimetableResolver`. **Create no exception table. Write no exception row.** Read only.

### A5 — Holidays exist; do not create `academic_holidays` (resolves §12 item 5)
Same finding as the Timetable plan: `calendar_events` + `calendar_event_types` with a system-seeded
`key='holiday'` row per institution (migrations `0080_calendar_unify` / `0081_calendar_types_backfill`;
schema at `packages/database/src/schema/parent-comm.ts:195`). **§12 item 5's fallback is void.**

### A6 — `computeRemainingSessions` must not be a second expander — **binding**
The Timetable plan exposes a **pure** recurrence expander at
`packages/schemas/src/timetable/resolver.ts`. The hyperspec's §2.1 signature would duplicate it.

**Do this:** `computeRemainingSessions` lives in `packages/schemas/src/attendance/forecaster.ts` and
**imports the timetable expander** to enumerate occurrences, then applies subject/section filtering
and counting. It must not re-expand weekdays, re-subtract holidays, or re-apply exceptions itself.
AC 5's "no new recurrence table" is necessary but not sufficient — the real guard is **one expander**,
asserted by a test that feeds both call sites the same fixture and compares occurrence lists.

### A7 — Enrollment is single-class; `sectionIds` is at most one (resolves §12 item 7) — **binding**
Identical finding to the Timetable plan's A2: `student_enrollments`
(`packages/database/src/schema/enrollments.ts:27`) carries a **single nullable `class_id`** with
unique indexes enforcing one row per (student, year, term). **No elective/multi-section membership
table exists anywhere in the repo.**

**Do this:** keep `sectionIds: uuid[]` in the signature; populate with ≤1 id. **Amend AC 11's
"multi-section dedupe" fixture** to assert the dedupe logic is correct *given* duplicate ids in the
array (unit-testable without the table), rather than asserting a real multi-section student exists.
The subject→sections resolution walks `class_subject_teachers` for the enrolled class.

### A8 — `provenance` column: add it (resolves §1.2's conditional)
`attendance_records` has `id, institution_id, session_id, student_id, status, remarks, version,
actorColumns, timestamps` — **no provenance field**. The existing leave hook writes provenance as
free text into `remarks` (`Leave ${humanCode}` at `request-engine.service.ts:835`), which is not
machine-readable.

**Do this:** add `provenance jsonb NULL` per §1.2. Backfilling old rows is **not** required. Keep
writing the human `remarks` string as well — the staff marking UI displays it.

### A9 — Feature flags are `student.surface.*` (not `student.module.*`)
`packages/feature-flags/src/student-modules.ts:23` already registers
`{ key: 'attendance', requiresInstitutionModule: 'attendance', defaultVisible: true }`.
**Do this:** the student gate is **`student.surface.attendance`** (exists — no new definition).
There is **no `parent.module.attendance` flag**; parent gating uses the parent-portal's existing
mechanism — inspect `apps/api/src/modules/parent-portal/` and reuse it. The school heat-strip flag
`attendance.day_view` (§12 item 10) has **no plan-scoped definition today**; ship it as an
institution-level flag defaulting on for school-tier institution types and record the deviation.

### A10 — Today already ships an attendance ribbon and chip; **replace, do not duplicate**
`today.service.ts:186` `attendanceWarning()` computes an institution-wide (not per-subject) ribbon:
it counts **all** `attendance_records` ever (no term filter), reads the threshold from
`institution_settings` category **`student_portal`**, key **`attendance_threshold`** (default 75),
and emits an Obligation with `kind:'custom'`, `urgency_override:'ribbon'`, deep link **`/analytics`**.
`today.service.ts:181` emits the `attendance_pct` chip on the same math.

**Do this:**
- Rewrite both to read `attendance_rollups`, scoped to the current term, per-subject for the ribbon.
- **Seed `attendance_policies.threshold_pct` from the existing
  `institution_settings('student_portal','attendance_threshold')` value per institution in the
  migration**, so no institution's threshold silently changes on deploy. Leave the old setting row in
  place (other surfaces may read it); the policy table becomes authoritative for this feature.
- Repoint both deep links from `/analytics` to the new `/attendance` route.

### A11 — Obligation `kind` is a closed enum; `attendance_threshold` is not a member
`packages/schemas/src/obligations.ts:3` fixes `obligationKindSchema` to
`assignment | homework | review_queue | mock | fee_installment | exam | study_block | custom`, and
`normalizeObligationKind` silently coerces anything else to `'custom'`. There is **no
`dismiss_policy`** field; ribbon dismissal is `today_preferences.ribbon_dismissed_ids` (a string
array), and `urgency_override: 'ribbon'` is the ribbon marker.

**Do this — this replaces §9.6's frozen shape:**
```
kind: 'custom'
source_module: 'attendance'
urgency_override: 'ribbon'
id: `institution:attendance:${subjectId}:${zone}`   // stable → dismissal sticks
action: { label: 'View attendance', deep_link: `/attendance/${subjectId}` }
```
"Not dismissible" for the `unrecoverable` zone (§9.3) is enforced **server-side**: the Today service
must ignore a `ribbon_dismissed_ids` entry matching an `unrecoverable` attendance ribbon id. Do not
add a field to the Obligation contract.

### A12 — Notification dedupe is a DB unique index, not a parameter (resolves §12 item 8)
`feed_events` has unique `(student_id, event_key)` (`packages/database/src/schema/today.ts:53`).
Quiet hours are `today_preferences.held_notification_events` + `quiet_release_at`, drained by the
existing `today.quiet_hours.release` job.
**Do this:** dedupe keys from §9 become `event_key` values, written through
`apps/api/src/modules/student/today/today-notify.service.ts`. No `sent_notifications` table.

### A13 — Queues: job names only (see also Timetable A7)
`QUEUE_NAMES` is closed. **Do this:** `attendance.recompute` on **`notifications`**;
`attendance.marks_sweep` (the §8.1 morning sweep) scheduled on **`maintenance`**, following the
existing `requests.expire_needs_info` / `fees.maintenance` registration pattern.

### A14 — Request Engine reality (resolves §12 item 9)
- Registry: `packages/schemas/src/request-types/index.ts` — add both new types to
  `REQUEST_TYPE_REGISTRY`.
- `RequestTypeConfig` (`request-types/types.ts:37`) has **no `entry` field**; it has
  `entrySurface?: 'documents'` — a **single-literal union**. §8.2/§8.3's `entry: 'attendance'` /
  `entry: 'results'` do not fit. **Do this:** widen the union to
  `'documents' | 'attendance' | 'results'` in `types.ts` (one shared change; coordinate with the
  Marks plan, which needs `'results'`).
- The engine **does** contain type-specific branches (`if (input.type === 'leave_request')` at
  `request-engine.service.ts:98`, `:1103`). **Amend AC 6:** "zero engine branches" is not achievable
  and is not the real goal. The requirement is: **new side effects dispatch on
  `approvalSideEffectKey`** (the pattern at `:486` and `:509`), and no new `input.type === '...'`
  branch is added.
- `leave_request` payload uses **`notify_sessions`**, not `sessions_snapshot`
  (`packages/schemas/src/request-types/leave-request.ts:27`), captures **only already-existing
  sessions**, and its `scope` is a `z.literal('full_day')`. §8.1 amendment 1 replaces the derivation
  behind `notify_sessions` — **keep the field name** (renaming breaks in-flight requests whose
  payloads are already persisted).
- The existing side effect writes `excused` with no provenance, for existing sessions only
  (`:831`). §8.1 amendment 2 extends it; the deferred-future-mark mechanism is genuinely new.

### A15 — Future-session pre-fill does not exist (resolves §12 item 3)
There is no pending/pre-filled mark concept in `attendance.service.ts` or the marking UI. **Do this:**
the **morning sweep ships as the mechanism**, not as a fallback. Build `request_marks_pending` and
the `attendance.marks_sweep` job. Do not attempt pre-fill integration.

### A16 — Gate feed confirmed separate
`campus_access_logs` / `gate_exit_events` are not referenced by anything in scope. Constraint 4 holds
trivially; AC 2's grep will pass. No action.

### A17 — `packages/ui` has `drawer.tsx`, no `sheet.tsx`
Same as Timetable A6. Use `drawer.tsx`.

### A18 — Percentages vs integer marks
Attendance math is counting, so no precision hazard — but note `attendance_rollups.pct` must be
`numeric`, and §2.3's display rule (**truncate**, never round) is a formatting function that must be
shared between the API and `apps/student-web` so AC 9's property test can assert both agree.

---

## 3. Dependencies & contracts

**Reads from Timetable (Tier 1, must be merged first):**
- pure expander `packages/schemas/src/timetable/resolver.ts` (A6)
- `period_exceptions` — read-only (A4)
- job `timetable.exception.fanout` — subscribe for recompute trigger 2

**Reads from Tier 0 / existing:**
- `attendance_sessions`, `attendance_records` (write **only** via `attendance.mark`, A2)
- `academic_terms.start_date/end_date`, `student_enrollments`, `class_subject_teachers`, `subjects`
- `calendar_events` + `calendar_event_types` (holidays, A5)
- `institution_settings` (`student_portal.attendance_threshold` seed, A10)
- Request Engine: `student_requests`, `student_request_events`, `REQUEST_TYPE_REGISTRY`,
  `approvalSideEffectKey` dispatch, Approvals Inbox, `IdempotencyService`
- Today: `feed_events`, `today_preferences`, `today-notify.service.ts`, `Obligation` contract
- `JobsService` / `QueueWorkers` / `JobTracker`; `AuditWriter`; `PortalCrudEngine`

**Exposes downstream:**
1. `GET /v1/student/attendance/summary` — the per-subject line the **Timetable period drawer**
   (§5.2) consumes. Freeze its shape early; Timetable degrades gracefully without it.
2. `attendance_rollups` — the cache Today's chip and ribbon read (A10). **Cache, never truth.**
3. `computeRemainingSessions` — consumed by the leave/OD live coverage line and by Marks? No. Only
   within this feature and by the request types.

---

## 4. Phases

### Phase 1 — Migration (`0090_attendance_forecaster`)
**Files:** `packages/database/migrations/0090_attendance_forecaster.sql`;
`packages/database/src/schema/attendance.ts` (extend); new
`packages/database/src/schema/attendance-policy.ts`; `schema/index.ts`; `sql/zzz_rls.sql`, `zzz_grants.sql`.

**Schema:**
- `attendance_records`: add `provenance jsonb NULL` (A8); add CHECK on `status` over
  `('present','absent','late','excused','left_early','od')` **after** a guard query proving no
  violating rows (A1).
- `attendance_policies` — per §3, **plus** `left_early_counts_as text NOT NULL DEFAULT 'present'`
  (A1). One row per institution, `campus_id` nullable override. CHECKs on every enum. `version`.
  **Seed `threshold_pct` per institution from `institution_settings('student_portal',
  'attendance_threshold')`, defaulting to 75 when absent** (A10).
- `attendance_rollups` — per §2.4 verbatim. Unique `(student_id, subject_id, term_id)`;
  `subject_id` nullable (null = overall). Index `(institution_id, term_id)`.
- `request_marks_pending` — `id`, `institution_id`, `request_id → student_requests`, `student_id`,
  `class_id`, `subject_id NULL`, `occurrence_date date`, `slot_id NULL → timetable_slots`,
  `target_mark text` CHECK in the A1 set, `applied_at timestamptz NULL`,
  `created_at`. Unique `(request_id, student_id, occurrence_date, slot_id)` so the sweep is
  idempotent (A15).

**DoD:** migration applies; the status CHECK rejects `'foo'` and accepts all six; RLS blocks
cross-institution reads on all three new tables; the policy seed reproduces every institution's
current effective threshold (assert by comparing against the old setting rows).

---

### Phase 2 — Forecaster library (pure, no I/O)
**Files:** `packages/schemas/src/attendance/forecaster.ts`,
`packages/schemas/src/attendance/policy.ts` (Zod), `packages/schemas/src/attendance/format.ts`
(the shared truncation formatter, A18), `packages/schemas/src/attendance/forecaster.spec.ts`.

**Behavior:** §2.1 (delegating expansion per **A6**), §2.2 inputs, §2.3 four branches with integer
math, §2.3 display truncation.

**DoD:** AC 7's worked example (T=75, A=40, C=46, R=31 → "Can miss 3 more"); AC 9's property test
across the threshold neighborhood (display and zone never disagree); AC 11's five edge fixtures with
the multi-section case amended per **A7**; AC 14's policy matrix — extended to include
`left_early_counts_as` both ways (A1); and **the one-expander test from A6**.

---

### Phase 3 — Recompute job + zone-crossing detector
**Files:** `apps/api/src/modules/student/attendance/attendance-rollup.service.ts`,
`attendance-recompute.processor.ts`; the outbox/event emission added inside
`apps/api/src/modules/portal/attendance.service.ts` (A2); job registration per **A13**.

**Behavior:** §2.4 triggers 1–3 + policy-change rebuild (rate-limited 1/hour), debounce 30s per
`(student_id, subject_id)`; §9 crossing detector with `event_key` dedupe per **A12** and the
Obligation shape per **A11**. Downward transitions only; recovery via `recovered_toast_pending`.

**DoD:** AC 17 (one push + one feed item on `safe→warning`; identical re-run fires nothing; a later
re-crossing fires again), AC 19 (threshold 75→80 rebuild notifies only zone-changers), AC 22
(delete all rollups, rebuild, byte-identical), AC 18 (ribbon persistence + the non-dismissible
`unrecoverable` case enforced server-side per A11).

---

### Phase 4 — Student read API
**Files:** `apps/api/src/modules/student/attendance/student-attendance.controller.ts`,
`.service.ts`, `.module.ts`.

**Endpoints** (`/v1`, gated `student.surface.attendance` per **A9**):
`GET /v1/student/attendance/summary?term_id=`, `GET /v1/student/attendance/subjects/:subjectId?cursor=`
(keyset on `(date, id)`), `GET /v1/student/attendance/coverage?start=&end=`.
Zod in `packages/schemas/src/attendance/dto.ts`.

**DoD:** summary is one indexed rollup read; the subject-detail transparent-math block recomputes
live from raw rows and reconciles with the rollup (§5.2); AC 25 (forged cross-institution ids return
nothing on every endpoint); AC 10 (`conducted` vs `scheduled` basis flips after rebuild); unmarked
past sessions render grey, never defaulted absent (§1.3).

---

### Phase 5 — Request types
**Files:** `packages/schemas/src/request-types/od-request.ts`,
`packages/schemas/src/request-types/attendance-correction.ts`, `index.ts` (registry),
`types.ts` (widen `entrySurface`, **A14** — coordinate with Marks);
`apps/api/src/modules/requests/request-engine.service.ts` — two new `approvalSideEffectKey` branches
(`od_attendance`, `attendance_correction`) + the amended `leave_attendance` branch;
`apps/api/src/modules/student/attendance/marks-sweep.processor.ts` (**A15**).

**Behavior:** §8.1 amendments (keep the `notify_sessions` field name per **A14**), §8.2 `od_request`,
§8.3 `attendance_correction` with routing bound to **`attendance_sessions.taken_by_id`** (**A3**).

**DoD:** AC 12 (6-occurrence leave: 2 past flip with provenance, 4 deferred rows created, sweep
applies each on/before its date, an attendance-service failure aborts the approval leaving the
request untouched), AC 13 (cross-type overlap rejected server-side naming the existing code),
AC 15 (partial correction: exactly 2 of 3 flip, event carries `{flipped, kept}`, note required),
AC 16 (refuse `present`, refuse duplicate open dispute, lock clears on terminal), AC 3 (no direct
Drizzle writes to `attendance_records` from request modules — grep).

---

### Phase 6 — Config UI + institution surfaces
**Files:** `apps/institution-web` Settings → Academics → Attendance Policy via `PortalCrudEngine`;
Approvals Inbox **config-only** renderers for the three types (§6.2 — no inbox code changes).

**DoD:** §3's "recalculates all attendance figures" warning fires the rate-limited rebuild; the three
types appear on the existing Request Types settings screen; inbox consequence lines and the §8.3
per-row "Mark present" toggles render from config.

---

### Phase 7 — Student UI + Today repoint
**Files:** `apps/student-web/src/app/(app)/attendance/` (new route),
`apps/student-web/src/components/institutional/attendance/*`;
**`apps/api/src/modules/student/today/today.service.ts` — rewrite `attendanceWarning()` and the
`attendance_pct` chip per A10.**

**Surfaces:** §4 main screen, §5 subject detail (drawer per **A17**), §7 school heat-strip behind the
A9 flag, parent view.

**DoD:** AC 20 (parent absence alert once per child per day, suppressed by covering leave, quiet-hours
deferred), AC 21 (`parent_visibility='off'` → parent endpoint 403s and no card renders), AC 23
(no hard-coded "semester"/"class teacher"/"advisor" in student surfaces), AC 24 (cached offline render
with stale banner; inbox never serves cached decision data), AC 8 (branch 4 with both actions;
`condonation_enabled=false` hides only the condonation action). **Plus: the existing Today test suite
must not regress.**

---

## 5. Risks & landmines

1. **Forgetting `left_early` (A1).** Today counts it as present today. Dropping it silently lowers
   every student's percentage on deploy. *Guard:* the `left_early_counts_as` knob defaults to
   `present`, and a migration-time assertion compares pre/post effective percentages for a sample.
2. **Building a second recurrence expander (A6).** *Guard:* the shared-fixture equality test.
3. **Creating an exception table (A4).** The hyperspec explicitly invites it. *Guard:* AC 1's
   `CREATE TABLE` grep plus a plan-level rule — this migration creates exactly four tables/columns
   listed in Phase 1.
4. **Rollups treated as truth.** *Guard:* AC 22's delete-and-rebuild test is mandatory.
5. **Direct SQL into `attendance_records`.** *Guard:* AC 3's grep, run in CI.
6. **Approval side effects outside the transaction.** A partial write leaves marks without a request.
   *Guard:* AC 12's abort test; mirror the existing `leave_attendance` branch's transaction structure
   at `request-engine.service.ts:486`.
7. **Renaming `notify_sessions`.** Persisted payloads of in-flight requests would fail to parse.
   *Guard:* A14 — keep the name; add fields, never rename.
8. **Obligation kind coercion (A11).** Emitting `kind:'attendance_threshold'` will silently become
   `'custom'` and the ribbon id will not match dismissals. *Guard:* use `'custom'` explicitly and
   assert the ribbon id format in a test.
9. **Debounce swallowing the last recompute.** A 30s debounce that drops rather than defers loses
   updates. *Guard:* use BullMQ `jobId` + delay so the latest enqueue wins and always runs.
10. **Unmarked sessions defaulting to absent.** *Guard:* §1.3 is a correctness requirement with its
    own test; students must never be punished for staff lag.

---

## 6. Acceptance & closeout

Self-check against **all 25 numbered criteria in hyperspec §11**, as amended (AC 6 per A14; AC 11 per
A7; AC 14 extended per A1). Record PASS / PASS-with-deviation / N/A with reasons. Run the §11
reuse-verification greps 1–6 verbatim and paste output.

Then write **`IMPLEMENTED-ATTENDANCE.md`** at the repo root: what was built per phase; every
deviation with justification (expect at least: the `left_early` knob, single-section enrollment, the
morning-sweep-only future-mark path, the `attendance.day_view` flag scope); exposed contracts (the
three student endpoints with `/v1`, `attendance_rollups` columns, the policy table, the Obligation
ribbon id format, job names, the two new request-type keys and their `approvalSideEffectKey`s);
the acceptance table; and verification commands with results.
