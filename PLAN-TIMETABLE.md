# PLAN — Timetable + Live Exceptions (Tier 1)

**Companion hyperspec:** `02S5-08S2-TIMETABLE-HYPERSPEC.md`. Read both. This plan sequences and
corrects the hyperspec; the hyperspec carries the behavioral detail. Where they conflict, **this
plan wins**, because it is reconciled against the live repo.

---

## 1. Feature summary & why it exists

Students currently have no way to see their own class schedule, and staff have no way to tell them
"today's Physics is cancelled" without a phone tree. This feature adds (a) a student-facing day/week
timetable rendered from the existing `timetable_slots` recurrence, (b) a **live exceptions** layer
(cancel / room change / substitution / extra class) that staff publish and that fans out to exactly
the affected students within 60 seconds, and (c) a subscribable ICS calendar feed. It is the first
Tier 1 feature because Attendance's session forecaster and the Today "Now/Next" hero both read the
resolver this feature introduces.

---

## 2. Spec Amendments

Every item below is a reconciliation against the live repo. **Follow the amendment, not the
hyperspec, where they differ.**

### A1 — `timetable_slots` columns (resolves §12 item 1)
`packages/database/src/schema/timetable.ts` is the authority. Real shape:

| hyperspec assumption | repo reality |
|---|---|
| class ref | `class_id uuid NOT NULL` → `classes.id` ✔ |
| subject | `subject_id uuid NULL` → `subjects.id` (nullable!) |
| teacher | `teacher_id uuid NULL` → `staff.id` — **direct column exists**; `class_subject_teachers` is the fallback only when null |
| room | `room text NULL` — **free text, no rooms table** (see A3) |
| `day_of_week` | `integer`, **ISO 1 = Monday … 7 = Sunday** ✔ |
| `start_time`/`end_time` | **`text` in `"HH:MM"` 24-hour form, NOT a `time` type** |
| term linkage | both `academic_year_id` and `term_id` (nullable) exist directly on the slot |
| — | extra columns the spec did not know about: `label text` (period name), **`kind text NOT NULL DEFAULT 'teaching'` with values `teaching \| break \| lunch`** |
| uniqueness | `timetable_slot_uniq` on `(class_id, day_of_week, start_time)` |

**Do this:**
- All time arithmetic uses `"HH:MM"` **string** comparison (lexicographic ordering is correct for
  zero-padded 24-hour times). Do **not** migrate the columns to `time`. New exception time columns
  (`start_time`/`end_time` on `period_exceptions`) must also be `text` `"HH:MM"` for symmetry.
- The resolver emits only `kind = 'teaching'` slots as class occurrences. `break`/`lunch` slots are
  **not** rendered as blocks (hyperspec §5.1.3 already wants gaps, not break blocks) but they **do**
  bound `dayBounds`. Do not delete or repurpose them.
- Teacher resolution order: `timetable_slots.teacher_id` → else `class_subject_teachers` on
  `(class_id, subject_id)` → else null (render "Unassigned").
- `subject_id` is nullable: render `label` as the block title when subject is null.

### A2 — Multi-section merge is not expressible in this repo (resolves §12 item 5) — **binding, cross-cutting**
Hyperspec §4.1 step 1 requires "all active enrollments (home class + elective classes)" and §10 AC 1
requires a 3-class student. **The repo has no multi-class membership.**
`packages/database/src/schema/enrollments.ts` defines `student_enrollments` with a **single nullable
`class_id`**, and unique indexes `student_enrollments_year_whole_uniq` / `_year_term_uniq` that
enforce **one row per (student, year, term)**. A repo-wide search for an elective/section-membership
table (`student_subjects`, elective enrolment, etc.) returns nothing; `subjects.kind='elective'` and
`programme_subjects.is_elective` are *curriculum* flags, not per-student memberships.

**Do this:**
- `resolve()` takes `sectionIds: string[]` in its signature from day one, but v1 populates it with
  **at most one** class: the student's `student_enrollments` row for the current term
  (`term_id = currentTerm` else the `term_id IS NULL` whole-year row), `status = 'active'`,
  → `class_id`. Keep the array shape so a future elective table is a resolver-internal change only.
- **Do not build an elective membership table in this chat.** It is a cross-cutting academic-core
  decision (see `PLAN-TIER1-OVERVIEW.md` human-decision list).
- Clash detection (§4.1 step 7, §5.1.6) still ships — a single class can self-clash via an
  `extra_class` exception overlapping a normal slot, which is the §7.1 "allowed, renders as a clash"
  path. Side-by-side rendering is therefore reachable and testable. **Amend AC 1** to: a student in
  one class whose day carries an overlapping `extra_class` renders both blocks at 45% width.

### A3 — No rooms table; room-clash detection is disabled in v1 (resolves §12 item 3)
There is no rooms/facilities booking substrate for classrooms. `packages/database/src/schema/facilities.ts`
holds `facilities`, `work_orders`, `maintenance_tasks`, `facility_assets` — a **maintenance** domain,
not a bookable-room registry. `timetable_slots.room`, `classes.room` and `exam_schedules.room` are all
free `text`.

**Do this:**
- `period_exceptions.new_room` stays **`text`**. Do not add `new_room_id`. Do not create a rooms table.
- §6.3 `ROOM_CLASH` is a **warning**, not a blocking 422, and is computed by exact
  case-insensitive trimmed string match on `room` across slots of the same institution/campus at
  overlapping times. Teacher double-booking (`TEACHER_CLASH`) remains **blocking** — that one is a
  real FK and is reliable.
- §7.1 "Change room" picker: free-text entry with a datalist of distinct existing `room` values for
  the campus. The "free rooms first / occupied below a divider" layout ships as a best-effort hint
  built from that same string match, labelled as such.

### A4 — Holidays exist as calendar events (resolves §12 item 2)
The hyperspec expected possibly nothing. The repo has a real source: migration `0080_calendar_unify`
created `calendar_event_types`, and `0081_calendar_types_backfill` **seeds a system row per
institution with `key = 'holiday'`**. `calendar_events` (`packages/database/src/schema/parent-comm.ts:195`)
carries `starts_on date NOT NULL`, `ends_on date NULL`, `event_type_id`, `campus_id`,
`status text DEFAULT 'published'`, `audience_scope`, `audience_ref_id`.

**Do this:** the resolver's holiday set = `calendar_events` joined to `calendar_event_types` where
`key = 'holiday'`, `status = 'published'`, campus matching (`campus_id IS NULL OR campus_id = :campus`),
expanded over `[starts_on, coalesce(ends_on, starts_on)]`. **Do not create `academic_holidays`.**
Ignore `audience_scope` in v1 (holidays are institution-wide in practice); note it in IMPLEMENTED.md.

### A5 — Feature-flag namespace is `student.surface.*` (not `student.module.*`)
Per root `IMPLEMENTED.md` ("the original hyperspec namespace `student.module.*` was replaced by the
repository-authoritative `student.surface.*` namespace"). `packages/feature-flags/src/student-modules.ts:22`
already registers `{ key: 'timetable', category: 'academics', requiresInstitutionModule: 'timetable',
defaultVisible: true }`.

**Do this:** student surface gate = **`student.surface.timetable`** (already exists — no new flag
definition needed). The builder/composer gate is the institution module switch
**`institution.module.timetable`** (the `requiresInstitutionModule` value already wired), **not**
`institution.module.timetable_builder`. Exam overlay additionally requires `student.surface.exams`.

### A6 — No `sheet` component in `packages/ui`
`packages/ui/src/` has `drawer.tsx`, `dialog.tsx`, `detail-panel.tsx` — **no `sheet.tsx`**.
**Do this:** use `packages/ui` `drawer.tsx` for the 420px desktop drawer / mobile bottom sheet role.
If it lacks a mobile bottom-sheet variant, add that variant **inside `drawer.tsx`** — do not add a
parallel `sheet.tsx`.

### A7 — Queues are a closed set; add job names only
`apps/api/src/common/queue/queue.constants.ts` fixes `QUEUE_NAMES` to
`imports | exports | reports | notifications | billing-sync | ai | maintenance`.
**Do this:** there is **no `timetable-fanout` queue**. Register job name
**`timetable.exception.fanout`** on the existing **`notifications`** queue via the existing
`JobsService.enqueue(queue, jobName, data, { jobId })` pattern (see
`apps/api/src/modules/portal/fee-ledger.service.ts:637` for the canonical call shape) and the
existing `QueueWorkers` + `JobTracker` registration. Scheduled sweeps go on `maintenance`.

### A8 — Notification/feed fan-out contract (resolves §12 item 6)
Tier 0 Today built the dedupe and quiet-hours machinery. `feed_events`
(`packages/database/src/schema/today.ts:37`) has **unique `(student_id, event_key)`** — the event key
*is* the dedupe mechanism, enforced in the database. Quiet hours are held in
`today_preferences.held_notification_events` + `quiet_release_at` and released by the
`today.quiet_hours.release` job.

**Do this:** write feed items through the existing Today notify path
(`apps/api/src/modules/student/today/today-notify.service.ts`) with
`event_key = 'tt:' || exception_id || ':' || student_id` (revocations:
`'tt:revoke:' || exception_id || ':' || student_id`; builder edits:
`'tt:edit:' || edit_batch_id || ':' || student_id`). Do **not** build a dedupe table.

### A9 — Today already renders exam/next-class state; extend, do not duplicate
`apps/api/src/modules/student/today/today.service.ts:173` already queries `exam_schedules` by
`student.classId` + `published = true` for the exam provider, and the hero already has
"exam / in-class / next-class / idle" precedence (root `IMPLEMENTED.md`, Today phase 3).
**Do this:** the Now/Next hero must be **repointed** to consume `TimetableResolver` instead of
whatever it currently derives in-class/next-class from. Locate that hero producer in
`today.service.ts` and replace its schedule source; do not add a second hero path.

### A10 — `§1.3` additive columns: both are genuinely absent
Verified: `timetable_slots` has no `effective_from`/`effective_to` (resolves §12 item 4 — **run the
migration**), and `subjects` has no `weekly_periods` (**run it**).

### A11 — Exams read contract exists (resolves §12 item 8)
`exam_schedules` (`packages/database/src/schema/exams.ts:61`) has `exam_date date`,
`start_time`/`end_time` **`text "HH:MM"`**, `room`, `class_id`, `subject_id`, and
**`published boolean`**. The overlay ships **live**, not behind a dead flag.

### A12 — `student_calendar_items` does not exist (resolves §12 item 9)
Tier 0 Today shipped **`user_obligations`** instead (`packages/database/src/schema/today.ts:12`):
dual-owner XOR, `kind`, `title`, `due_at`, `all_day`, `deep_link`, `idempotency_key`, unique
`(student_id, idempotency_key)`.
**Do this:** §5.2 "Add a personal reminder" writes a `user_obligations` row via the existing
`POST /student/me/obligations` endpoint with `kind: 'study_block'` (the closed enum in
`packages/schemas/src/obligations.ts:18` accepts `study_block | mock | review | custom` on create —
**`class`/`period` are not valid kinds**), `due_at` = period start − 15 min, and
`idempotency_key = 'tt:reminder:' || occurrenceId` so double-taps collapse.

### A13 — Messaging & attendance detail-sheet reads (resolves §12 item 10)
`packages/database/src/schema/messaging.ts` exists but there is **no student↔teacher thread API** on
the student surface. **Do this:** the teacher row in §5.2 is **inert text** in v1. The attendance
line is supplied by the Attendance plan's `GET /v1/student/attendance/summary`; until that ships the
field is omitted (the graceful-omission path in §5.2 is the shipped behavior, not a fallback).

### A14 — Terminology keys are a closed 14-key pack (resolves §12 item 11)
Root `IMPLEMENTED.md` Module Visibility AC 16: "strict schema validates the **closed** 14-key
terminology pack". **Do this:** check `packages/schemas/src/portal-config.ts` for the key list. If
"Period"/"Extra class"/chip labels are not among the 14, **do not widen the pack** — ship those
strings as plain English defaults in the timetable UI and record the gap in IMPLEMENTED.md. Widening
the closed pack is a Module Visibility change, not a timetable change.

### A15 — API prefix and module placement
All routes carry the global **`/v1`** prefix. There is **no** `apps/api/src/modules/timetable`
directory: the existing timetable module is
`apps/api/src/modules/portal/timetable.{controller,service,repository}.ts`. **Do this:** extend that
module for staff-side builder/composer work; put student-side routes under
`apps/api/src/modules/student/timetable/` following the `apps/api/src/modules/student/today/` layout.

---

## 3. Dependencies & contracts

**Reads (Tier 0 / existing, all read-only unless noted):**
- `timetable_slots` (read + **builder writes**), `classes`, `class_subject_teachers`, `subjects`,
  `grade_levels`, `academic_terms`, `academic_years`, `student_enrollments`, `staff`
- `calendar_events` + `calendar_event_types` (holiday source, A4)
- `exam_schedules` (exam overlay, A11)
- `institutions.timezone` (`packages/database/src/schema/institutions.ts:37`, `text NOT NULL DEFAULT 'UTC'`)
- `institution_settings` (`category`/`key`/`value_type`/`value` text KV) for config knobs
- Today: `feed_events`, `user_obligations`, `today_preferences`, `today-notify.service.ts`
- Queue: `JobsService`, `QueueWorkers`, `JobTracker`, `background_jobs`
- Flags: `resolveFeature` via `packages/feature-flags`; audit via `AuditWriter`

**Exposes downstream (freeze these — Attendance and Today depend on them):**
1. **`TimetableResolver.resolve({ studentId | classId | teacherId }, from, to)`** — the single
   expander. Exported from a shared location importable by the API **and** by the Attendance
   forecaster: put the pure expansion function in **`packages/schemas/src/timetable/resolver.ts`**
   (pure, no I/O; takes slots/holidays/exceptions/effective-ranges as arguments) and the I/O-bound
   service wrapper in `apps/api/src/modules/student/timetable/timetable-resolver.service.ts`.
   **Attendance's `computeRemainingSessions` must import the pure function, not reimplement it.**
2. **Occurrence JSON contract** — hyperspec §4.1, unchanged except `room` is a bare string and
   `class_id` is always the single enrolled class (A2).
3. **`period_exceptions` row shape** — frozen here (§1.1 + amendments). The Attendance plan's
   §12-item-4 "create the minimal exception table if Chat 7 hasn't run" is **void**: Timetable ships
   first and owns this table. Attendance reads it, never writes it.
4. **Exception publish signal** — job `timetable.exception.fanout` on `notifications`. Attendance
   subscribes to recompute `R` (its recompute trigger 2).

---

## 4. Phases

### Phase 1 — Migration (`0089_timetable_exceptions`)
**Goal:** all schema in one mergeable migration, ahead of any code.

**Files:**
- `packages/database/migrations/0089_timetable_exceptions.sql` *(renumber to next free if another
  Tier 1 migration lands first)*
- `packages/database/src/schema/timetable.ts` — extend
- `packages/database/src/schema/academics.ts` — one column on `subjects`
- `packages/database/src/schema/index.ts` — export new tables
- `packages/database/migrations/sql/zzz_rls.sql`, `zzz_grants.sql` — register new tables

**Schema (Drizzle-level):**

`period_exceptions` — new, per hyperspec §1.1 with these repo-bound corrections:
- `id` `primaryId()`; `institution_id uuid NOT NULL → institutions.id` cascade;
  `campus_id uuid NOT NULL → campuses.id`
- `slot_id uuid NULL → timetable_slots.id` **`ON DELETE RESTRICT`** (deletion is handled by the
  §6.2 auto-revoke path, so a stray cascade must not silently erase history)
- `class_id uuid NOT NULL → classes.id`
- `date date NOT NULL`; `recurring boolean NOT NULL DEFAULT false`; `recurring_until date NULL`
- `type text NOT NULL` CHECK `in ('cancelled','room_change','substitution','extra_class')`
- `new_room text NULL` (**A3** — not a FK)
- `new_teacher_id uuid NULL → staff.id`; `subject_id uuid NULL → subjects.id`
- `start_time text NULL`, `end_time text NULL` (**A1** — `"HH:MM"` text, not `time`)
- `note text NULL` (≤200 enforced in Zod + a DB CHECK `char_length(note) <= 200`)
- `created_by uuid NULL → users`; `revoked_at timestamptz NULL`; `revoked_by uuid NULL`;
  `revoked_reason text NULL` CHECK `in ('manual','superseded','slot_deleted')`
- `idempotency_key text NULL` — **use the central `idempotency_keys` table + `IdempotencyService`
  with scope `timetable_exception_create` instead** (root `IMPLEMENTED.md` reconciliation 3 forbids
  a per-row idempotency column). Omit this column.
- `version integer NOT NULL DEFAULT 0`, `...actorColumns`, `...timestamps`
- Indexes exactly per §1.1 (three), plus `(institution_id, new_teacher_id)` partial on
  `revoked_at IS NULL` — the substitute-availability query needs it.
- Grants: `REVOKE DELETE`; add a trigger rejecting UPDATE of any column other than
  `revoked_at | revoked_by | revoked_reason | recurring_until | version | updated_at`. Model it on
  the existing append-only trigger in `0085_request_engine.sql` for `student_request_events`.

`ics_tokens` — new, per §1.2 verbatim. `token text` unique, 32-char base62 CSPRNG.

Additive columns:
- `timetable_slots.effective_from date NULL`, `timetable_slots.effective_to date NULL` (A10)
- `subjects.weekly_periods integer NULL` (A10)

**DoD:** migration applies and rolls forward on a seeded DB; `drizzle-kit check` passes; a manual
`DELETE FROM period_exceptions` is refused; an UPDATE touching `type` is refused; an UPDATE touching
`revoked_at` succeeds; RLS blocks cross-institution selects under a foreign `app.institution_id`.

---

### Phase 2 — Resolver + student read API
**Goal:** the single expander plus the read endpoints. No writes, no UI.

**Files:**
- `packages/schemas/src/timetable/resolver.ts` — **pure** expansion function (the downstream contract)
- `packages/schemas/src/timetable/index.ts`, and Zod DTOs in `packages/schemas/src/timetable/dto.ts`
  (re-export from `packages/schemas/src/index.ts`)
- `packages/schemas/src/timetable/resolver.spec.ts`
- `apps/api/src/modules/student/timetable/timetable-resolver.service.ts` (I/O wrapper + Redis cache)
- `apps/api/src/modules/student/timetable/student-timetable.controller.ts`
- `apps/api/src/modules/student/timetable/student-timetable.module.ts`

**Behavior:** hyperspec §4.1 steps 1–7 and §3 precedence, with A1/A2/A3/A4/A11 applied.
`colorIndex = hash(subject_id) mod 12`, server-side.

**Endpoints** (all `/v1`, gated on `student.surface.timetable`):
- `GET /v1/student/timetable?from&to` — range ≤42 days, ETag/304 per §4.2
- `GET /v1/student/timetable/period/:occurrenceId` — §4.2; attendance/assignment fields omitted per A13

**Cache:** Redis `tt:{student_id}:{iso_week}`, TTL 6h. **This is a cache, never a source of truth** —
every read must be correct with the cache flushed.

**DoD:** unit tests on the pure function covering: term-boundary mid-week, holiday landing on a slot
day, `effective_from/to` narrowing, cancelled+substitution stacking (§3.1), same-type supersede
(§3.2), specific-beats-recurring (§3.3), `extra_class` overlap producing mutual `clash:true`,
`kind='break'` slots excluded from occurrences but included in `dayBounds`, and a DST-free
institution-local render with the process TZ forced to `UTC-5` against an `Asia/Kolkata` institution
(AC 10). Endpoint test: cold read and warm read return byte-identical payloads.

---

### Phase 3 — Exception composer API + fan-out
**Goal:** staff can publish and revoke exceptions; affected students get notified.

**Files:**
- `apps/api/src/modules/portal/timetable-exceptions.service.ts` (new, inside the existing portal
  timetable module)
- `apps/api/src/modules/portal/timetable.controller.ts` — extend
- `apps/api/src/modules/portal/timetable-fanout.processor.ts` — job handler
- register the job name in the existing `QueueWorkers` wiring

**Endpoints:** `GET /v1/portal/timetable/day?date&classId`, `POST /v1/portal/timetable/exceptions`
(mandatory `Idempotency-Key`, scope `timetable_exception_create`),
`POST /v1/portal/timetable/exceptions/:id/revoke`.

**Permissions (§2, A5):** `timetable.exception.manage_all` / `.manage_own` / `timetable.view` added
to the **code-defined** permission catalogue in `packages/permissions` (root `IMPLEMENTED.md`
deviation: "permission and role catalogues are code-defined", not seeded rows). "Own" resolves via
`timetable_slots.teacher_id` OR `class_subject_teachers.teacher_id` OR `classes.class_teacher_id` —
**FK joins only, no role-name string comparison** (AC 12 / AC 16c).

**Fan-out (§8, A7, A8):** transaction commits exception + audit event, then enqueues
`timetable.exception.fanout` on `notifications`. Job resolves affected students from
`student_enrollments` (A2), invalidates their Redis keys, writes `feed_events` with the A8 event keys
and pushes through the existing notify path. Recurring publishes emit **one** notification (§5.5).

**DoD:** AC 2 (60s fan-out, zero leakage to other classes), AC 3 (stacking), AC 4 (supersede → one
push), AC 5 (double-tap → one row), AC 7 (slot delete auto-revokes with `slot_deleted`, silent),
AC 11 (holiday dates emit nothing), AC 12 (403 matrix), AC 14 (grants), AC 17 (23:00 → feed
immediate, push at 06:30 via the existing quiet-hours release job).

---

### Phase 4 — Builder API (conflict detection)
**Goal:** direct, validated CRUD on `timetable_slots`.

**Files:** `apps/api/src/modules/portal/timetable.service.ts` — add conflict checks to existing
create/update paths; `apps/api/src/modules/portal/timetable-conflicts.ts` (pure checks + tests).

**Behavior:** §6.1–6.4 with **A3** applied — `TEACHER_CLASH` blocking 422; `ROOM_CLASH` **warning**;
quota (`subjects.weekly_periods`) and duplicate-subject-per-day warnings. Substitutions count as
occupancy (§6.4). Every mutation version-guarded → 409 `VERSION_CONFLICT`.

**DoD:** AC 6 as amended (teacher clash rejected with inline message; room clash saves with a badge;
quota/duplicate warnings persist). Deleting a slot auto-revokes future live exceptions.

---

### Phase 5 — ICS feed
**Files:** `apps/api/src/modules/student/timetable/ics.service.ts`, `ics.controller.ts` (sessionless
route — confirm it is excluded from the global auth guard), token CRUD on the student controller.

**Behavior:** §4.2 ICS bullet + §1.2 verbatim. `DTSTART;TZID={institutions.timezone}`. Rate limit
60/hour/token; response cached 15 min; token masked to 4 chars in logs; revoked → 410.

**DoD:** AC 9 in full. Plus: a revoked token's 410 body matches the §1.2 copy exactly.

---

### Phase 6 — Student UI
**Files:** `apps/student-web/src/app/(app)/timetable/` (new route — note `(app)` currently has no
`timetable` segment), `apps/student-web/src/components/institutional/timetable/*`.

**Surfaces:** §5.1 day view, §5.2 period drawer (A6 — `packages/ui` `drawer.tsx`), §5.3 week view,
§5.4 sync-to-calendar, offline IndexedDB ±1 week via the existing student-web cache layer (the same
one Today/Requests use — reuse it, do not add a second cache).

**DoD:** AC 1 (as amended by A2), AC 15 (offline pill, no error screen; exams/attendance modules off
degrade cleanly), reduced-motion honored on the collapse and "Today" pill animations.

---

### Phase 7 — Institution UI + config + Today hero repoint
**Files:** `apps/institution-web` Academics → Timetable (Builder | Live changes tabs);
config knobs through `PortalCrudEngine` into `institution_settings` category `academics`
(`timetable.teacher_composer_enabled`, parent mirror toggle);
`apps/api/src/modules/student/today/today.service.ts` — **repoint the Now/Next hero to the resolver
(A9)**.

**DoD:** §9 knobs persist and take effect; the Today hero shows the resolved current/next occurrence
including live exception state; §7 composer flows work end-to-end; AC 13 (substitute picker excludes
busy teachers, substitute gets a staff notification), AC 16 reuse greps all clean, AC 18 perf
(<200ms warm p95, <800ms cold).

---

## 5. Risks & landmines

1. **Rebuilding the recurrence substrate.** `class_periods`/`timetable_grids`/`timetable_releases`
   must not appear. *Guard:* AC 16a grep in CI.
2. **Assuming `start_time` is a SQL `time`.** It is `text`. Passing a `Date` or a `time` literal into
   comparisons will silently mis-sort. *Guard:* a resolver unit test with times spanning `09:00` and
   `11:20` asserting lexicographic order; type the column as `string` end-to-end.
3. **Assuming multi-class enrollment (A2).** An executor reading the hyperspec literally will write a
   join that returns duplicate rows or nothing. *Guard:* the resolver's section resolution is one
   function with its own test asserting exactly one class per (student, term).
4. **Cache as truth.** Redis `tt:*` must be reconstructible. *Guard:* a test that flushes the cache
   mid-suite and asserts identical payloads.
5. **`DELETE` on exceptions.** Revocation restores the base occurrence; deletion loses the audit
   trail. *Guard:* the DB grant + trigger from Phase 1.
6. **Fan-out reaching the wrong students.** *Guard:* AC 2's zero-leakage assertion is a required test,
   not a manual check.
7. **Breaking the Today hero.** Repointing it (A9) touches a shipped Tier 0 surface. *Guard:* run the
   existing Today test suite before and after; no Today test may regress.
8. **Timezone drift.** `institutions.timezone` defaults to `'UTC'`; seeded institutions may not have a
   real IANA zone. *Guard:* resolver treats `'UTC'` as valid, and AC 10's test pins an
   `Asia/Kolkata` institution explicitly.
9. **New queue creation.** *Guard:* AC 16d grep + the closed `QUEUE_NAMES` union will fail type-check.

---

## 6. Acceptance & closeout

Before declaring done, self-check against **all 18 numbered acceptance criteria in hyperspec §10**,
as amended here (AC 1 per A2; AC 6 per A3; AC 8 as written). For each, record PASS / PASS-with-
deviation / N/A **with the reason**. Run the §10.16 reuse greps verbatim and paste their output.

Then write **`IMPLEMENTED-TIMETABLE.md`** at the repo root containing: what was built per phase;
every deviation from this plan and the hyperspec with its justification; the exact exposed contracts
(resolver signature and import path, occurrence JSON, `period_exceptions` columns, job name, feed
`event_key` formats, endpoint list with the `/v1` prefix, new permission keys); the acceptance
self-check table; and the verification commands you ran with their results. Downstream Tier 1
sessions read that file — treat the "exposed contracts" section as the deliverable.
