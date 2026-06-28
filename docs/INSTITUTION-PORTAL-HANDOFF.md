# Edrion Institution Portal — Build Handoff

> Tenant-facing portal for an institution's own users (Owner → Student). Lives in the **same
> monorepo** as the Super Admin control plane and **shares the same Postgres/Supabase + audit +
> infra**. This doc lets a fresh session continue the build without re-deriving context.

Last updated after: **Phase 11 (Administration — Settings, User Management, Roles editor, Audit viewer) — DONE & live-verified** on 2026-06-28.
(Previously: Foundation slice P0+P1+P3, Phase 2 Academics core, Phase 4 People, Phase 5 Admissions/Attendance/Timetable, Phase 6 Exams/Gradebook/Assignments, Phase 7 Fees/Payroll, Phase 8 Library/Transport/Inventory/Hostel, Phase 9 Announcements/Notifications/Messages/Reports, Phase 10 Copilot.)

---

## 1. What this is

ONE permission-driven portal (not separate School/Campus apps). The same components serve every
role; the UI adapts on **role + granular permissions + institution scope + campus scope + allowed
campuses**. Core tenancy rule: a user belongs to exactly ONE institution but may manage MANY
campuses inside it. Institution Admin/Owner manage the whole institution + all campuses; Campus
Admin is confined to assigned campuses.

Two independent authorization dimensions:
- **Permissions** = WHAT actions (`students.view`, `fees.manage`, …) — evaluated from roles + overrides.
- **Scope** = WHICH campuses — `{mode:'institution'}` or `{mode:'campus', campusId}` from the global scope switcher, validated against the user's `campus_user_access`.

---

## 2. Foundation slice — DONE (live-verified)

Live smoke against the running API + seeded "Riverside Public School" (3 campuses, 9 portal users):
- `GET /v1/portal/me` (owner) → wildcard expands to all 56 institution permission keys, `isInstitutionWide:true`, 3 campuses.
- `GET /v1/portal/dashboard` (owner, institution scope) → `kind:institution`, real `campuses:3`, real `users:9`, pending stats clearly flagged, `campusComparison` populated.
- Campus-admin (`campus.north@greenwood.edu`) → `isInstitutionWide:false`, 1 campus ("Main Campus"), 42 perms (no `payroll.manage`), dashboard `kind:campus`.
- **Scope isolation**: campus-admin requesting a non-granted campus → `403 SCOPE_FORBIDDEN`.
- Variants: teacher→`teacher`, parent→`parent`, student→`student`, finance→`generic`.

Typecheck clean across `@edrion/permissions`, `@edrion/auth`, `@edrion/database`, `@edrion/api`, `@edrion/institution-web`.

### Files added/changed
**Permissions (`packages/permissions`)** — engine reused; new institution domain:
- `src/institution/catalogue.ts` — `INSTITUTION_PERMISSIONS` (56 keys, `sensitive` flags), helpers.
- `src/institution/roles.ts` — `INSTITUTION_DEFAULT_ROLES` (12 roles as permission bags).
- `src/institution/index.ts`; `package.json` adds export `./institution`.

**Auth (`packages/auth`)**:
- `src/institution-principal.ts` — `InstitutionPrincipal`, `InstitutionScope`, `ScopeFilter`, `InstitutionContext`, `resolveScopeFilter()`, `ScopeForbiddenError`, `selectableCampusScope()`. Exported from `src/index.ts`.

**API (`apps/api`)** — new `src/modules/portal/`:
- `portal.types.ts` — augments Express `Request.institutionContext`.
- `portal.decorators.ts` — `RequireInstitutionPermissions`, `CurrentInstitutionPrincipal`, `CurrentScope`.
- `portal-auth.service.ts` — resolves `InstitutionPrincipal` from `institution_users`/`institution_user_roles`/`campus_user_access`, evaluates permissions.
- `portal-auth.guard.ts` — `InstitutionAuthGuard` (dev-header identity + scope parse + scope assertion).
- `portal-permissions.guard.ts` — `InstitutionPermissionsGuard` (`canAll`).
- `portal.repository.ts`, `portal-dashboard.service.ts` (adaptive, scope-aware, single request), `portal.controller.ts` (`/v1/portal/me`, `/v1/portal/dashboard`), `portal.module.ts`.
- `app.module.ts` registers `PortalModule`; `tsconfig.json` adds `@edrion/permissions/institution` path.

**Web (`apps/institution-web`)** — new Next.js app (port **3002**), mirrors super-admin-web setup:
- Config: `package.json`, `next.config.mjs`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `next-env.d.ts`, `scripts/gen-tokens.ts`.
- `src/app/`: `globals.css`, `layout.tsx`, `providers.tsx` (QueryClient → PortalClient → Scope), `page.tsx` (→/dashboard), `(app)/layout.tsx` (shell), `(app)/dashboard/page.tsx` (adaptive), `(app)/[...module]/page.tsx` (honest "coming soon" for unbuilt routes).
- `src/lib/`: `env.ts`, `types.ts`, `portal-client.tsx`, `hooks.ts`, `scope.tsx`, `permissions.tsx`, `nav.ts`.
- `src/components/app-shell/`: `sidebar.tsx`, `topbar.tsx`, `scope-switcher.tsx`, `error-boundary.tsx`.

**DB seed (`packages/database`)**:
- `src/seed-portal.ts` (+ `seed:portal` script) — idempotent demo portal users on the first institution.

**Env**: `.env` + `.env.example` add `PORTAL_AUTH_DEV_HEADER`, `:3002` CORS origin, `NEXT_PUBLIC_DEV_INSTITUTION_USER`.

---

## 2b. Phase 2 — Academics core — DONE (live-verified)

First real CRUD vertical. Establishes the table → drawer-form → confirm-delete pattern + the
server-paginated `DataTable` UI primitive, all scope-aware and audited. Six tables: academic
years, departments, grade levels, subjects, classes/sections, and the class↔subject↔teacher join.

Live smoke (`scripts/portal-academics-smoke.sh`, **28/28 pass**) against the running API + seeded
portal users proves, end-to-end:
- **Permission gating** — `academics.view` to read, `academics.manage` to mutate: teacher (view
  only) `GET`→200 but `POST`→403; parent (neither) `GET`→403.
- **Full CRUD** for all five resources + class↔subject assign/remove, all returning real rows.
- **Validation/tenancy** — `endDate<startDate`→400; an unknown FK (`gradeLevelId`)→400 `INVALID_REFERENCE`
  (a friendly 400, never a 500).
- **Optimistic concurrency** — update with the current `version`→200, a stale `version`→409.
- **Scope isolation** — confined campus-admin can read/create in its own campus (new rows are
  stamped to that `campus_id`); a foreign campus → `403 SCOPE_FORBIDDEN`. Institution-owned rows
  (`campus_id IS NULL`) are visible in every scope.
- **Audit** — every mutation writes an `audit_events` row (`module=portal-academics`, actor
  `institution_user`). The smoke is self-cleaning (re-reads versions, deletes) + idempotent.

Typecheck clean across `@edrion/permissions`, `@edrion/schemas`, `@edrion/database`, `@edrion/ui`,
`@edrion/api`, `@edrion/institution-web`. Migration **0013** (clean-from-empty) + RLS policies added
for the six academic tables.

### Files added/changed (Phase 2)
**Permissions** — `institution/catalogue.ts` adds `academics.view` + `academics.manage` (manage is
`sensitive`); `institution/roles.ts` grants them (manage → campus_admin/principal/academic_coordinator,
view → teacher; admin/owner via all/wildcard).

**DB (`packages/database`)** — `src/schema/academics.ts` (6 tables, tenant convention
`id, institution_id, campus_id (nullable), …, actorColumns, timestamps, version`, indexed on
`(institution_id)` + `(institution_id, campus_id)`); wired into `schema/index.ts` + top-level type
re-exports; `migrations/0013_*.sql`; `migrations/sql/zzz_rls.sql` extends the tenant-isolation list.

**Schemas (`packages/schemas`)** — `src/academics.ts` (create/update/list zod for each entity,
`assignClassSubjectSchema`, `versionedDeleteSchema`); exported from `index.ts`.

**API (`apps/api/src/modules/portal`)** — `portal-action-context.ts` (`PortalActionContext` +
`basePortalAudit`, actor = institution user), `academics.repository.ts` (scope-aware typed SQL),
`academics.service.ts` (scope assertions, create-campus stamping, version guards, FK pre-checks,
audit), `academics.controller.ts` (`/v1/portal/academics/*`, same guards as the rest of the portal);
registered in `portal.module.ts`.

**UI (`packages/ui`)** — new primitives: `table.tsx` (`DataTable` — controlled server
pagination/sort), `drawer.tsx` (`Drawer`), `dialog.tsx` (`Dialog`/`ConfirmDialog`), `select.tsx`
(`Select`); exported from `index.ts`.

**Web (`apps/institution-web`)** — `lib/academics-types.ts`, `lib/academics.ts` (scope-aware list +
mutation + option + class-subject hooks), `portal-client.tsx` gains `post/patch/del`;
`components/academics/resource-manager.tsx` + `resource-form.tsx` (the reusable, field-driven
table+drawer+delete) + `class-subjects-drawer.tsx`; pages under `app/(app)/academics/{years,
departments,grades,subjects,classes}/page.tsx`; `lib/nav.ts` adds the "Academic Setup" group
(gated by `academics.view`). Teacher/head pickers are intentionally deferred to P4 People (the
schema + API already carry the columns).

---

## 2c. Phase 4 — People — DONE (live-verified)

The people directory: **students, teachers, staff (non-teaching), parents** + the **student↔guardian**
join. Reuses the P2 pattern end to end (scope-aware repo → version-guarded service with FK pre-checks
+ audit → controller with the portal guards → `ResourceManager` web pages). It also **lights up the
teacher/head pickers P2 deferred**: `classes.class_teacher_id`, `departments.head_user_id` and
`class_subject_teachers.teacher_id` were **repointed from `institution_users` → `teachers`** (the new
FK target), so a class teacher / department head / subject teacher is now a real `teachers` row picked
from the directory.

Live smoke (`scripts/portal-people-smoke.sh`, **41/41 pass**) against the running API + seeded portal
users proves, end-to-end:
- **Per-resource permission gating** — `students.{view,create,update,delete}` (granular);
  `teachers`/`staff`/`parents` use `{view, manage}`. Teacher (has `students.view`, not `students.create`):
  `GET students`→200 but `POST students`→403 and `POST teachers`→403; parent (no people keys) `GET`→403.
- **Full CRUD** for all four resources + guardian link/list/remove (upsert on `(student, parent)`).
- **Teacher pickers** — department head / class teacher / class-subject teacher each accept a
  `teachers.id` and the joined name resolves; an unknown teacher id → 400 `INVALID_REFERENCE`.
- **Validation/tenancy** — unknown `classId`/`departmentId`/`parentId` → friendly 400 (never a 500).
- **Optimistic concurrency** — stale `version` on update → 409.
- **Scope isolation** — confined campus-admin can read/create in its campus (rows stamped to that
  `campus_id`); a foreign campus → `403 SCOPE_FORBIDDEN`.
- **Audit** — every mutation writes an `audit_events` row (`module=portal-people`). Self-cleaning + idempotent.

Typecheck clean across the whole workspace. Migration **0014** (clean-from-empty verified 0000→0014):
creates the five people tables, repoints the three academics FKs to `teachers`, and adds the
people→academics FKs by hand (see below). RLS extended to the five people tables.

### Files added/changed (Phase 4)
**Permissions** — no change; P4 uses existing `students.*`/`teachers.*`/`staff.*`/`parents.*` keys
already in the catalogue (campus_admin/principal/hr_manager already grant them).

**DB (`packages/database`)** — `src/schema/people.ts` (students/teachers/staff/parents/student_guardians,
same tenant convention). Teachers/staff/parents carry an optional `institution_user_id` link (most
people never sign in). NOTE: the **people→academics FKs** (`grade_level_id`, `class_id`, `department_id`)
are plain `uuid` columns in the schema — not Drizzle `.references()` — to break the academics↔people
**type cycle** (academics already `.references()` `teachers`); the matching DB constraints are added by
hand in `0014`, and the service pre-checks each ref. `schema/academics.ts` repoints
`headUserId`/`classTeacherId`/`teacherId` → `teachers`. Wired into `schema/index.ts` + top-level type
re-exports; `migrations/0014_*.sql`; `migrations/sql/zzz_rls.sql` extends the isolation list.

**Schemas (`packages/schemas`)** — `src/people.ts` (create/update/list zod for each entity,
`assignGuardianSchema`; reuses `versionedDeleteSchema`); exported from `index.ts`. (`employeeStatusSchema`
was already taken by `employees.ts`, so the people staff-status enum is `staffStatusSchema`.)

**API (`apps/api/src/modules/portal`)** — `people.repository.ts` (scope-aware typed SQL + display joins +
`existsInInstitution` FK pre-check), `people.service.ts` (scope assertions, campus stamping, version
guards, FK pre-checks, audit, guardian upsert), `people.controller.ts` (`/v1/portal/people/*`);
registered in `portal.module.ts`. `academics.repository.ts`/`academics.service.ts` updated to
validate + display the teacher FKs against `teachers`.

**Web (`apps/institution-web`)** — `lib/people-types.ts`, `lib/people.ts` (list/mutation/option +
guardian hooks); `components/academics/resource-manager.tsx` **generalized** to inject
`permissions`/`useList`/`useMutations` (defaults to academics, so P2 pages are untouched);
`components/people/student-guardians-drawer.tsx`; pages `app/(app)/{students,teachers,staff,parents}/page.tsx`.
The academics **departments + classes** pages and the **class-subjects drawer** now render teacher
pickers (`useTeacherOptions`); `lib/academics.ts` adds `useClassOptions`. `lib/nav.ts` already had the
"People" group (gated by `students.view`/etc.).

---

## 2d. Phase 5 — Admissions, Attendance, Timetable — DONE (live-verified)

Three more verticals on the exact P2/P4 pattern (scope-aware repo → version-guarded service with FK
pre-checks + audit → controller with the portal guards → web pages on the generalized
`ResourceManager`). Four new tables (migration **0015**): `admission_applications`,
`attendance_sessions`, `attendance_records`, `timetable_slots`. Students/classes/teachers/subjects
are the FK targets. **No permission/role/nav change** — the `admissions.*`/`attendance.*`/`timetable.*`
keys were already in the catalogue, the default roles already grant them, and `nav.ts` already
pointed at `/admissions`, `/attendance`, `/timetable` (the real pages now take over from the
"coming soon" catch-all).

Notable features beyond plain CRUD:
- **Admissions → enrol bridge** (`POST /v1/portal/admissions/:id/enrol`): an *accepted* application is
  converted into a real `students` row (admission no. defaults to the application no., optional class),
  and `admission_applications.enrolled_student_id` is stamped back. Guards: only `accepted` may enrol
  (`NOT_ACCEPTED`), never twice (`ALREADY_ENROLLED`), admission-no collision → friendly 400.
- **Attendance is two-level**: a `attendance_sessions` register (campus-scoped, version-guarded) +
  per-student `attendance_records` reachable only through a session the caller can see. Bulk marking
  (`POST …/sessions/:id/records`) upserts on `(session, student)`. A duplicate register for the same
  `(class, date, period)` is a friendly **409 `SESSION_EXISTS`** (pre-checked, never a unique-index 500).
- **Timetable** is a single recurring-slot table (`day_of_week` 1–7, `HH:MM` times) with an
  `endTime > startTime` zod refine and a unique `(class, day, start_time)`.

Live smoke (`scripts/portal-p5-smoke.sh`, **48/48 pass**) proves, end-to-end:
- **Permission gating** — owner full; teacher (no admissions) `GET admissions`→403, `POST`→403; parent
  (has `attendance.view`, no admissions/timetable) attendance→200 but admissions/timetable→403; student
  (`timetable.view` only) `GET timetable`→200 but `POST`→403.
- **Admissions** — create → unknown FK 400 → enrol-before-accepted 400 → accept → enrol (creates a
  student, application becomes `enrolled`) → enrol-again 400.
- **Attendance** — create register → duplicate 409 → unknown class 400 → bulk mark → records list → mark
  unknown student 400 → stale-version update 409.
- **Timetable** — create → teacher name resolves → end≤start 400 → unknown teacher 400 → stale-version 409.
- **Scope isolation** — confined campus-admin creates in its campus (row stamped to `campus_id`); a
  foreign campus → `403 SCOPE_FORBIDDEN`.
- Every mutation is audited (`module=portal-admissions|portal-attendance|portal-timetable`). The smoke is
  self-cleaning + idempotent.

Typecheck clean across the whole workspace. Migration **0015** is purely additive (drizzle-generated;
`CREATE TABLE IF NOT EXISTS` + FKs/indexes), applied live; RLS extended to the four new tables.

### Files added/changed (Phase 5)
**DB (`packages/database`)** — `src/schema/admissions.ts`, `src/schema/attendance.ts`,
`src/schema/timetable.ts` (same tenant convention; these reference academics/people *forward-only*, so
plain `.references()` is safe — no Drizzle type cycle). Wired into `schema/index.ts` + top-level type
re-exports (`src/index.ts`); `migrations/0015_perpetual_frog_thor.sql`; `migrations/sql/zzz_rls.sql`
extends the isolation list.

**Schemas (`packages/schemas`)** — `src/admissions.ts`, `src/attendance.ts`, `src/timetable.ts`
(create/update/list zod + `enrolAdmissionSchema` + `markAttendanceSchema`); exported from `index.ts`.

**API (`apps/api/src/modules/portal`)** — `admissions.{repository,service,controller}.ts`,
`attendance.{repository,service,controller}.ts`, `timetable.{repository,service,controller}.ts`;
all three registered in `portal.module.ts`.

**Web (`apps/institution-web`)** — `lib/{admissions,attendance,timetable}-types.ts` + `lib/{admissions,
attendance,timetable}.ts` (list/mutation hooks; admissions adds `useEnrolAdmission`, attendance adds
record list/mark hooks); `components/admissions/admission-enrol-drawer.tsx`,
`components/attendance/attendance-records-drawer.tsx`; pages
`app/(app)/{admissions,attendance,timetable}/page.tsx` (all on the injectable `ResourceManager`).

**Smoke** — `scripts/portal-p5-smoke.sh` (48 checks).

---

## 2e. Phase 6 — Exams, Gradebook, Assignments — DONE (live-verified)

Three more verticals on the exact P2/P4/P5 pattern (scope-aware repo → version-guarded service with
FK pre-checks + audit → controller with the portal guards → web pages on the generalized
`ResourceManager`). Five new tables (migration **0016**): `exams`, `exam_schedules`, `grade_entries`,
`assignments`, `assignment_submissions`. Classes/subjects/students/teachers/academic-years are the FK
targets. **No permission/role/nav change** — `exams.*`/`gradebook.*`/`assignments.*` were already in
the catalogue, the default roles already grant them, and `nav.ts` already pointed at `/exams`,
`/gradebook`, `/assignments` (the real pages now take over from the "coming soon" catch-all).

Two of the three reuse the **attendance two-level pattern** (a campus-scoped parent + child rows
reachable only through a parent the caller can see); the third is a **flat table** like timetable:
- **Exams** is two-level: `exams` (the event — type/term/dates/status, campus-scoped, version-guarded)
  + `exam_schedules`, the per-(class, subject) papers nested under an exam (`GET/POST /v1/portal/exams/:id/schedules`,
  individually version-guarded). One paper per (exam, class, subject) — a duplicate is a friendly
  **409 `SCHEDULE_EXISTS`** (pre-checked, never a unique-index 500); `endTime > startTime` is a zod refine.
- **Gradebook** is a single flat `grade_entries` table (one student's marks on one assessment of one
  subject, optionally tied to an exam). Unique on (student, subject, exam) **when an exam is set** —
  a duplicate is a friendly **409 `GRADE_EXISTS`** (NULL `exam_id` is treated as distinct, so ad-hoc
  assessments are never blocked). `marksObtained > maxMarks` → friendly **400 `INVALID_MARKS`**.
  Gated by `gradebook.{view,manage}` (manage is `sensitive`). Marks are whole numbers (`integer`),
  consistent with the rest of the portal (no decimals anywhere).
- **Assignments** is two-level: `assignments` (title/class/subject/teacher/due/max-points/status,
  campus-scoped, version-guarded) + `assignment_submissions`, the per-student rows. Bulk grading
  (`POST …/assignments/:id/submissions`) upserts on (assignment, student) — `pointsAwarded > maxPoints`
  → friendly **400 `INVALID_POINTS`**.

Live smoke (`scripts/portal-p6-smoke.sh`, **52/52 pass**) proves, end-to-end:
- **Permission gating** — owner full; teacher (has `exams.view`, not `exams.manage`) `GET exams`→200,
  `POST exams`→403; parent (only `gradebook.view`) `GET exams`→403, `GET gradebook`→200, `POST grade`→403;
  student (view-only everywhere) `GET assignments`→200, `POST assignment`→403.
- **Exams** — create (default `draft`) → unknown academic-year FK 400 → status update → create paper →
  duplicate paper 409 `SCHEDULE_EXISTS` → unknown class 400 → end≤start 400 → papers list len 1 → stale-version 409.
- **Gradebook** — create (student name resolves) → duplicate (student,subject,exam) 409 `GRADE_EXISTS`
  → unknown student 400 → marks>max 400 `INVALID_MARKS` → update current version 200 → stale-version 409.
- **Assignments** — create (default `draft`) → unknown class 400 → bulk grade submission → submissions
  list len 1 → unknown student 400 → points>max 400 `INVALID_POINTS` → update 200 → stale-version 409.
- **Scope isolation** — confined campus-admin creates an exam in its campus (row stamped to `campus_id`);
  a foreign campus → `403 SCOPE_FORBIDDEN`.
- Every mutation is audited (`module=portal-exams|portal-gradebook|portal-assignments` — verified
  6/3/4 rows after the run). The smoke is self-cleaning (residue verified 0 across all five tables) + idempotent.

Typecheck clean across the whole workspace. Migration **0016** is purely additive (drizzle-generated;
`CREATE TABLE IF NOT EXISTS` + FKs/indexes — no drops/alters of existing columns), applied live; RLS
extended to the five new tables.

### Files added/changed (Phase 6)
**DB (`packages/database`)** — `src/schema/exams.ts` (exams + exam_schedules), `src/schema/gradebook.ts`
(grade_entries), `src/schema/assignments.ts` (assignments + assignment_submissions). Same tenant
convention; these reference academics/people *forward-only*, so plain `.references()` is safe (no
Drizzle type cycle). The two child tables (`exam_schedules`, `assignment_submissions`) have **no
`campus_id`** — they inherit the parent's campus, mirroring `attendance_records`. Wired into
`schema/index.ts` + top-level type re-exports (`src/index.ts`); `migrations/0016_far_speed_demon.sql`;
`migrations/sql/zzz_rls.sql` extends the isolation list.

**Schemas (`packages/schemas`)** — `src/exams.ts`, `src/gradebook.ts`, `src/assignments.ts`
(create/update/list zod + `createExamScheduleSchema`/`updateExamScheduleSchema` + `gradeSubmissionsSchema`);
exported from `index.ts`.

**API (`apps/api/src/modules/portal`)** — `exams.{repository,service,controller}.ts`,
`gradebook.{repository,service,controller}.ts`, `assignments.{repository,service,controller}.ts`;
all three registered in `portal.module.ts`.

**Web (`apps/institution-web`)** — `lib/{exams,gradebook,assignments}-types.ts` + `lib/{exams,gradebook,
assignments}.ts` (list/mutation hooks; exams adds schedule list/mutation + `useExamOptions`, assignments
adds submission list/grade hooks); `lib/people.ts` adds `useStudentOptions`;
`components/exams/exam-schedules-drawer.tsx` (nested paper CRUD, clones `class-subjects-drawer`),
`components/assignments/assignment-submissions-drawer.tsx` (bulk grade roster, clones
`attendance-records-drawer`); pages `app/(app)/{exams,gradebook,assignments}/page.tsx` (all on the
injectable `ResourceManager`).

**Smoke** — `scripts/portal-p6-smoke.sh` (52 checks).

---

## 2f. Phase 7 — Fees, Payroll — DONE (live-verified)

Two finance verticals on the exact P2/P4/P5/P6 pattern (scope-aware repo → version-guarded service
with FK pre-checks + audit → controller with the portal guards → web pages on the generalized
`ResourceManager`). Five new tables (migration **0017**): `fee_structures`, `fee_invoices`,
`fee_payments`, `payroll_runs`, `payroll_items`. Students/classes/grade-levels/academic-years are the
fees FK targets; teachers/staff are the payroll FK targets. **No permission/role/nav change** —
`fees.*`/`payroll.*` were already in the catalogue (both `*.manage` are `sensitive`), the default
roles already grant them, and `nav.ts` already pointed at `/fees`, `/payroll`. (The seed gained an
`hr@greenwood.edu` hr_manager demo user so payroll has a non-owner manager to test with.)

Three shapes in play — a flat table, a two-level model with a write-back bridge, and a plain
two-level model:
- **Fee structures** is a flat table (campus-scoped, version-guarded) of reusable fee templates
  (type/grade/class/year/amount/frequency). Money everywhere is a whole-number `integer` in MINOR
  units (no decimals anywhere in the codebase).
- **Fee invoices + payments** is two-level with a **payment→invoice bridge** (like admissions→enrol):
  `fee_invoices` (one charge raised against a student, campus-scoped, version-guarded) +
  `fee_payments` (the per-invoice payment lines, **no campus_id** — they inherit the invoice's campus,
  reachable only through `…/invoices/:id/payments`). Recording a payment inserts a line, then re-sums
  the payments and updates the invoice's `amount_paid` + `status` (pending → partial → paid); `balance`
  = amount − amount_paid is derived. A payment exceeding the balance → friendly **400
  `PAYMENT_EXCEEDS_BALANCE`**; a duplicate `invoice_no` → friendly **409 `INVOICE_EXISTS`**.
- **Payroll runs + items** is two-level (like exams): `payroll_runs` (period/pay-date/status,
  campus-scoped, version-guarded) + `payroll_items` (the per-employee lines, **no campus_id**,
  individually version-guarded). An item references a teacher OR a staff member
  (`employee_type` discriminates; the service enforces exactly one + pre-checks it). `net` is always
  computed = gross − deductions and never trusted from the body; deductions > gross → friendly **400
  `INVALID_DEDUCTIONS`**; a duplicate `(run, employee)` → friendly **409 `ITEM_EXISTS`**.

Live smoke (`scripts/portal-p7-smoke.sh`, **60/60 pass**) proves, end-to-end:
- **Permission gating** — owner/finance full fees; parent (fees.view only) `GET invoices`→200 but
  `POST`→403; teacher/hr (no fees) `GET invoices`→403; hr full payroll; finance (no payroll)
  `GET runs`→403, `POST run`→403.
- **Fee structures** — create (default `active`) → unknown gradeLevel 400 → status update → stale-version 409.
- **Fee invoices** — create (student name resolves, default `pending`, balance == amount) → duplicate
  invoiceNo 409 `INVOICE_EXISTS` → unknown student 400 → stale-version 409.
- **Payment bridge** — pay 400 → invoice `partial`, paid 400, balance 600 → overpay 700>600 → 400
  `PAYMENT_EXCEEDS_BALANCE` → pay 600 → invoice `paid`, balance 0 → payments list len 2.
- **Payroll** — create run (default `draft`) → add teacher item (net computed 75000, name resolves) →
  add staff item → duplicate (run,teacher) 409 `ITEM_EXISTS` → unknown teacher 400 → deductions>gross
  400 `INVALID_DEDUCTIONS` → items list len 2 → run status update → stale-version 409.
- **Scope isolation** — confined campus-admin creates a fee structure in its campus (row stamped to
  `campus_id`); a foreign campus → `403 SCOPE_FORBIDDEN`.
- **Audit** — every mutation writes an `audit_events` row (`module=portal-fees|portal-payroll`,
  verified > 0 rows of each). The smoke is self-cleaning (all deletes pass) + idempotent.

Typecheck clean across the whole workspace. Migration **0017** is purely additive (drizzle-generated;
`CREATE TABLE IF NOT EXISTS` + FKs/indexes), applied live; RLS extended to the five new tables.

### Files added/changed (Phase 7)
**DB (`packages/database`)** — `src/schema/fees.ts` (fee_structures + fee_invoices + fee_payments),
`src/schema/payroll.ts` (payroll_runs + payroll_items). Same tenant convention; these reference
academics/people *forward-only*, so plain `.references()` is safe (no Drizzle type cycle). The child
tables (`fee_payments`, `payroll_items`) have **no `campus_id`** — they inherit the parent's campus,
mirroring `attendance_records`. Money is `integer` minor units. Wired into `schema/index.ts` +
top-level type re-exports (`src/index.ts`); `migrations/0017_demonic_jack_power.sql`;
`migrations/sql/zzz_rls.sql` extends the isolation list. `src/seed-portal.ts` adds `hr@greenwood.edu`
(hr_manager). NOTE: the platform billing schema already owns the `invoices`/`payments` table+type
names, so the portal fee tables are deliberately prefixed (`fee_*`, types `FeeInvoice`/`FeePayment`).

**Schemas (`packages/schemas`)** — `src/fees.ts`, `src/payroll.ts` (create/update/list zod +
`recordFeePaymentSchema`; payroll item zod refines exactly-one-of teacher/staff); exported from
`index.ts`. All names are `fee*`/`payroll*`-prefixed to avoid colliding with the platform `billing.ts`.

**API (`apps/api/src/modules/portal`)** — `fees.{repository,service,controller}.ts` (structures +
invoices + the payment bridge at `/v1/portal/fees/invoices/:id/payments`),
`payroll.{repository,service,controller}.ts` (runs + items at `/v1/portal/payroll/runs/:id/items`);
both registered in `portal.module.ts`.

**Web (`apps/institution-web`)** — `lib/{fees,payroll}-types.ts` + `lib/{fees,payroll}.ts` (list/mutation
hooks; fees adds invoice-payment list/record hooks + `useFeeStructureOptions`, payroll adds item
list/mutation hooks); `lib/people.ts` adds `useStaffOptions`;
`components/fees/invoice-payments-drawer.tsx` (record-payment roster, clones `exam-schedules-drawer`),
`components/payroll/payroll-items-drawer.tsx` (per-employee roster with teacher/staff picker);
`app/(app)/fees/page.tsx` (a lightweight in-page tab toggle: Invoices | Structures, both on the
injectable `ResourceManager`; the catch-all "coming soon" no longer serves /fees) and
`app/(app)/payroll/page.tsx` (runs on `ResourceManager` + items drawer).

**Smoke** — `scripts/portal-p7-smoke.sh` (60 checks). Set `DATABASE_URL` (+ `NODE_PATH` to the
database package's node_modules) when running to also verify the audit-row counts.

---

## 2g. Phase 8 — Library, Transport, Inventory, Hostel — DONE (live-verified)

Four operations verticals on the exact P2/P4/P5/P6/P7 pattern (scope-aware repo → version-guarded
service with scope assertions, create-campus stamping, FK pre-checks for friendly 400
`INVALID_REFERENCE`, friendly 409s instead of unique-index 500s → controller with the portal guards →
web pages on the generalized `ResourceManager` + nested drawers). Ten new tables (migration **0018**):
`library_books`/`library_loans`, `transport_routes`/`transport_vehicles`/`transport_assignments`,
`inventory_items`/`inventory_movements`, `hostel_blocks`/`hostel_rooms`/`hostel_allocations`. Students
are the FK target for loans/assignments/allocations. **No permission/role/nav change** —
`library.*`/`transport.*`/`inventory.*`/`hostel.*` were already in the catalogue (both `*.manage` are
`sensitive`), the default roles already grant them (incl. the `librarian`/`transport_manager` roles),
and `nav.ts` already pointed at `/library`, `/transport`, `/inventory`, `/hostel` under "Operations".

Each domain pairs a campus-scoped, version-guarded catalogue with a child line table that **has no
`campus_id`** (it inherits the parent's campus and is reachable only through a parent the caller can
see — mirrors `fee_payments`/`exam_schedules`). Money (fines, fares, unit values) is whole-number
`integer` MINOR units. Three carry a write-back bridge:
- **Library** — `library_books` (title/copies, `total_copies`/`available_copies`) + `library_loans`
  (per-student). Issuing checks a copy is available (**400 `NO_COPIES_AVAILABLE`**) and rejects a second
  active loan to the same student (**409 `LOAN_EXISTS`**); returning marks the loan returned. After every
  loan change `available_copies` is re-derived from the active-loan count (the bridge).
- **Transport** — `transport_routes` + `transport_vehicles` (optional `route_id` FK) + per-student
  `transport_assignments`. A duplicate `(route, student)` → **409 `ASSIGNMENT_EXISTS`**.
- **Inventory** — `inventory_items` (running `quantity`, SKU unique within the institution → **409
  `ITEM_EXISTS`**) + `inventory_movements`. Recording a movement is the bridge that moves quantity:
  `in` adds, `out` subtracts (below zero → **400 `INSUFFICIENT_STOCK`**), `adjust` sets it.
- **Hostel** — `hostel_blocks` + `hostel_rooms` (`capacity`/`occupied`, optional `block_id` FK) +
  per-student `hostel_allocations`. Allocating checks the room isn't full (**400 `ROOM_FULL`**) and
  rejects a second active allocation to the same student (**409 `ALLOCATION_EXISTS`**); vacating marks
  it vacated. After every allocation change `occupied` + room `status` are re-derived (the bridge).

Live smoke (`scripts/portal-p8-smoke.sh`, **82/82 pass**) proves, end-to-end:
- **Permission gating** — a **view-only user seeded via `direct_grants`** (the four `*.view` keys, no
  `*.manage`) `GET`s all four domains → 200 but every manage `POST` → 403; `teacher` (no ops keys)
  `GET`→403; owner full.
- **Library** — book CRUD + issue (available→0) → unknown student 400 → no-copies 400 → return
  (available→1) → return-again 409 `ALREADY_RETURNED` → duplicate active loan on a 2-copy book 409
  `LOAN_EXISTS`; book stale-version 409.
- **Transport** — route CRUD + vehicle CRUD (route name resolves) → vehicle unknown route 400 →
  assignment (student name resolves) → duplicate 409 `ASSIGNMENT_EXISTS` → unknown student 400;
  route stale-version 409.
- **Inventory** — item CRUD → duplicate SKU 409 `ITEM_EXISTS` → IN 10→15 → OUT →12 → ADJUST →7 →
  over-draw 400 `INSUFFICIENT_STOCK`; item stale-version 409.
- **Hostel** — block + room CRUD (block name resolves) → room unknown block 400 → allocate
  (occupied→1, status `full` at cap 1) → room-full 400 `ROOM_FULL` → unknown student 400 → vacate
  (occupied→0, status `available`) → vacate-again 409 `ALREADY_VACATED`; room stale-version 409.
- **Scope isolation** — confined campus-admin creates a book in its campus (row stamped to `campus_id`);
  a foreign campus → `403 SCOPE_FORBIDDEN`.
- **Audit** — every mutation writes an `audit_events` row (`module=portal-library|transport|inventory|
  hostel`, verified > 0 of each). Self-cleaning (all deletes pass; the seeded view-only user removed) +
  idempotent.

Typecheck clean across the whole workspace. Migration **0018** is purely additive (drizzle-generated;
ten `CREATE TABLE` + FKs/indexes), applied live; RLS extended to the ten new tables.

### Files added/changed (Phase 8)
**DB (`packages/database`)** — `src/schema/{library,transport,inventory,hostel}.ts`; child tables have
**no `campus_id`** (inherit parent campus). Wired into `schema/index.ts` + top-level type re-exports;
`migrations/0018_high_pride.sql`; `migrations/sql/zzz_rls.sql` extends the isolation list with the ten
tables.

**Schemas (`packages/schemas`)** — `src/{library,transport,inventory,hostel}.ts` (create/update/list
zod + issue/return, allocate/vacate, movement schemas; reuse `versionedDeleteSchema`); exported from
`index.ts`. Names are domain-prefixed to avoid collisions.

**API (`apps/api/src/modules/portal`)** — `{library,transport,inventory,hostel}.{repository,service,controller}.ts`;
nested bridges at `…/library/books/:id/loans(/:loanId/return)`, `…/transport/routes/:id/assignments`,
`…/inventory/items/:id/movements`, `…/hostel/rooms/:id/allocations(/:allocationId/vacate)`; all four
registered in `portal.module.ts`.

**Web (`apps/institution-web`)** — `lib/{library,transport,inventory,hostel}-types.ts` +
`lib/{library,transport,inventory,hostel}.ts` (list/mutation hooks + nested-resource hooks +
route/block options); `components/library/book-loans-drawer.tsx`,
`components/transport/route-assignments-drawer.tsx`, `components/inventory/item-movements-drawer.tsx`,
`components/hostel/room-allocations-drawer.tsx`; `app/(app)/{library,transport,inventory,hostel}/page.tsx`
(library/inventory single `ResourceManager` + drawer; transport/hostel in-page tab toggles —
Routes|Vehicles, Rooms|Blocks).

**Smoke** — `scripts/portal-p8-smoke.sh` (82 checks). Uses `DATABASE_URL` (defaults to the local DB) to
seed/remove the view-only test user and verify the audit-row counts.

---

## 2h. Phase 9 — Announcements, Notifications, Messages, Reports — DONE (live-verified)

Four communication/reporting verticals on the exact P2–P8 pattern (scope-aware repo → version-guarded
service with scope assertions, create-campus stamping, FK pre-checks for friendly 400
`INVALID_REFERENCE`, friendly 409s instead of unique-index 500s → controller with the portal guards →
web pages on the generalized `ResourceManager` + nested drawers). Six new tables (migration **0019**):
`announcements`, `notifications`, `message_threads`/`message_posts`, `report_definitions`/`report_runs`.
These tables FK only to institutions/campuses (no academics/people refs), so plain `.references()` is
trivially safe. **No catalogue/role change** — the keys already existed; the routes already existed in
`nav.ts` (a new **Notifications** nav item was added under Communication, gated `announcements.view`,
since there is no dedicated `notifications.*` key — notifications are the read side of announcements).

Permission mapping (no `notifications.*` key exists in the catalogue):
- **Announcements** — `announcements.view` (read) / `announcements.send` (mutate + publish; sensitive).
- **Notifications** — gated by `announcements.view` (read) / `announcements.send` (mutate); the feed is
  the read side of announcements.
- **Messages** — the single `messages.use` key gates both reads and writes.
- **Reports** — `reports.view` (read) / `reports.export` (define + export; sensitive). `reports.export`
  is treated as the "manage" key for the reports vertical (defining/exporting is the privileged action).

Three shapes + two bridges + the flat notifications feed:
- **Announcements** is flat (campus-scoped, version-guarded) with a **publish→notify bridge**:
  `reference_code` is unique within the institution (a friendly **409 `ANNOUNCEMENT_EXISTS`**).
  `POST /announcements/:id/publish` stamps `published_at`/status and **fans out a notification row** (the
  bridge, like admissions→enrol); publishing twice is a friendly **409 `ALREADY_PUBLISHED`**.
- **Notifications** is a flat feed (campus-scoped, version-guarded). An optional `announcement_id` link
  is **pre-checked** (unknown → friendly **400 `INVALID_REFERENCE`**); `POST /notifications/:id/read`
  marks one read, and reading a read one again is a friendly **409 `ALREADY_READ`**.
- **Messages** is two-level (like exams): `message_threads` (subject + unique `reference_code` →
  **409 `THREAD_EXISTS`**) + `message_posts`, the per-thread messages (**no `campus_id`** — they inherit
  the thread's campus, reachable only through `…/threads/:id/posts`).
- **Reports** is two-level with an **export bridge**: `report_definitions` (name/type + unique
  `reference_code` → **409 `REPORT_EXISTS`**) + `report_runs`, the generated exports
  (**no `campus_id`**; `POST /reports/:id/runs` is the export action, gated `reports.export`).

Live smoke (`scripts/portal-p9-smoke.sh`, **53/53 pass**) proves, end-to-end:
- **Permission gating** — a **view-only user seeded via `direct_grants`** (`announcements.view` +
  `messages.use` + `reports.view`, no send/export) `GET`s all four domains → 200 but `POST` announcement
  / notification / report → 403; `teacher` (has `announcements.view`, not `announcements.send`; **no**
  `reports.view`) `GET announcements`→200, `POST announcement`→403, `GET reports`→403; owner full.
- **Announcements** — create (default `draft`) → duplicate code 409 `ANNOUNCEMENT_EXISTS` → stale-version
  409 → publish (status `published`, notification id returned) → publish-again 409 `ALREADY_PUBLISHED`.
- **Notifications** — create (default `unread`) → unknown announcement 400 `INVALID_REFERENCE` → valid
  link 201 → mark read (status `read`) → read-again 409 `ALREADY_READ` → stale-version 409.
- **Messages** — create thread (default `open`) → duplicate code 409 `THREAD_EXISTS` → stale-version 409
  → create post → posts list len 1 → the view-only user can post (messages.use gates both) → 201.
- **Reports** — create definition (default `active`) → duplicate code 409 `REPORT_EXISTS` → stale-version
  409 → generate export (run id, format csv) → runs list len 1.
- **Scope isolation** — confined campus-admin creates an announcement in its campus (row stamped to
  `campus_id`); a foreign campus → `403 SCOPE_FORBIDDEN`.
- **Audit** — every mutation writes an `audit_events` row (`module=portal-announcements|portal-notifications|
  portal-messages|portal-reports`, verified > 0 of each). Self-cleaning (notifications swept by run
  suffix; threads/reports cascade their children; all deletes pass; the seeded user removed) + idempotent.

Typecheck clean across the whole workspace. Migration **0019** is purely additive (drizzle-generated;
six `CREATE TABLE` + FKs/indexes), applied live; RLS extended to the six new tables.

### Files added/changed (Phase 9)
**DB (`packages/database`)** — `src/schema/{announcements,messaging,reports}.ts` (announcements +
notifications; message_threads + message_posts; report_definitions + report_runs). Child tables
(`message_posts`, `report_runs`) have **no `campus_id`** (inherit parent campus). Wired into
`schema/index.ts` + top-level type re-exports (`src/index.ts`); `migrations/0019_reflective_ezekiel_stane.sql`;
`migrations/sql/zzz_rls.sql` extends the isolation list with the six tables.

**Schemas (`packages/schemas`)** — `src/{announcements,messaging,reports}.ts` (create/update/list zod +
`publishAnnouncementSchema`, `createMessagePostSchema`/`updateMessagePostSchema`, `createReportRunSchema`;
reuse `versionedDeleteSchema`); exported from `index.ts`. Names are domain-prefixed.

**API (`apps/api/src/modules/portal`)** — `announcements.{repository,service,controller}.ts` (the repo +
two services `AnnouncementsService`/`NotificationsService` + two controllers `AnnouncementsController`/
`NotificationsController`; publish→notify bridge), `messaging.{repository,service,controller}.ts`
(`MessagesController` at `/v1/portal/messages/threads(/:id/posts)`), `reports.{repository,service,controller}.ts`
(`ReportsController` at `/v1/portal/reports(/:id/runs)`); all registered in `portal.module.ts`.

**Web (`apps/institution-web`)** — `lib/{announcements,messaging,reports}-types.ts` +
`lib/{announcements,messages,reports}.ts` (list/mutation hooks + `usePublishAnnouncement`/
`useMarkNotificationRead` + nested post/run hooks); `components/messages/thread-posts-drawer.tsx`,
`components/reports/report-runs-drawer.tsx` (both clone `exam-schedules-drawer`); pages
`app/(app)/{announcements,notifications,messages,reports}/page.tsx` (all on the injectable
`ResourceManager`; announcements/notifications carry a publish / mark-read row action). `lib/nav.ts`
adds the **Notifications** item under Communication.

**Smoke** — `scripts/portal-p9-smoke.sh` (53 checks). Uses `DATABASE_URL` (defaults to the local DB) to
seed/remove the view-only test user, sweep notifications, and verify the audit-row counts.

---

## 2i. Phase 10 — Copilot (guardrailed AI assistant) — DONE (live-verified)

A **different shape** from the P2–P9 CRUD verticals: an **agent / tool-calling surface**, not a
table+drawer directory. It reuses the platform **`@edrion/copilot`** guardrail engine + run lifecycle
(`evaluateGuardrail`, `initialRunStatus`/`assertTransition`/`isTerminalStatus`, `redactSecrets`,
`StubPlanner`/`CopilotPlanner` seam) and mirrors the platform `CopilotService`/`tool-registry` shape —
but the actor is an **institution user**, runs are **tenant-scoped** (`institution_id` + `campus_id`),
and the same portal boundary discipline holds: institution auth + the single **`ai.use`** permission
gate the controller; per-tool **underlying permissions are re-asserted in the service** (the AI never
gets a wider reach than the user); scope is enforced by the **reused audited portal services**; every
run + tool call is **audited**. THE non-negotiable rule holds: **no state change runs without a human
confirmation row.**

Three new tables (migration **0020**): `portal_ai_runs` (one prompt + its prepared actions + lifecycle,
campus-scoped), `portal_ai_tool_calls` (a prepared tool's guardrail decision + impact preview + result;
child, **no `campus_id`**, inherits the run's campus), `portal_ai_confirmations` (the human sign-off).

How a run flows (`/v1/portal/copilot/runs`):
- **Create** (`POST runs`) — a deterministic **`PortalCopilotPlanner`** maps the prompt + context to
  prepared tool calls (it only PREPARES, never executes, never surfaces chain-of-thought — only a
  concise per-action explanation). Each prepared call is evaluated by `evaluateGuardrail` against a
  default full-mode institution policy: read-only tools resolve **ALLOW and auto-run immediately**;
  state-changing tools resolve **NEEDS_CONFIRMATION** and park the run in `awaiting_confirmation`,
  executing nothing. The underlying permission is checked too — lacking it **BLOCKS** the call
  (`decisionLayer=permission`).
- **Confirm** (`POST runs/:id/confirm`) — re-asserts each tool's permission, re-evaluates guardrails
  server-side (never trusts the prepared decision), records a confirmation row, then dispatches each
  awaiting tool via the **real audited portal service** (so the service's own scope/FK/version/audit
  all apply). `executed` (or `failed`). Critical-risk runs require typed confirmation; expired
  confirmations (15-min TTL) → `RUN_EXPIRED`.
- **Reject** (`POST runs/:id/reject`) — terminal; nothing runs.

The **tool catalogue** (`portal-copilot.tools.ts`) — each maps to an existing audited service, the AI
reuses the human path:
- `students.search` (capability Search, `students.view`) — read-only, ALLOW, auto-runs → `PeopleService.listStudents`.
- `analysis.summarize` (capability Analysis, `portal.dashboard.view`) — read-only, ALLOW.
- `announcements.draft` (capability Communications, `announcements.send`) — mutating, NEEDS_CONFIRMATION → `AnnouncementsService.create` (status `draft`).
- `announcements.publish` (capability Communications, `announcements.send`) — mutating, NEEDS_CONFIRMATION → `AnnouncementsService.publish` (fires the publish→notify bridge).

Live smoke (`scripts/portal-p10-smoke.sh`, **40/40 pass**) proves, end-to-end:
- **Permission gating** — `ai.use` gates every endpoint: a seeded user **without** `ai.use` → 403 on
  `GET/POST runs`; an `ai.use` user → 200.
- **Read-only auto-run** — "find students…" → tool `decision=allow`, run `executed` immediately (no confirmation).
- **Confirmation lifecycle** — "draft an announcement" → `decision=needs_confirmation`, run
  `awaiting_confirmation`, **no announcement row exists pre-confirm**; confirm → run `executed`, the
  announcement row now exists, a confirmation row is recorded; confirming again → 409 `NOT_AWAITING_CONFIRMATION`.
- **Reject** — a prepared draft run → `rejected`, no row created.
- **Publish flow** — copilot publishes a seeded draft (awaiting → confirm → `executed`, announcement `published`).
- **In-AI permission boundary** — a user with `ai.use` but **not** `announcements.send` who asks to draft
  gets `decision=blocked`, `decisionLayer=permission`, no row created; the **same** user CAN run the
  read-only student search (they hold `students.view`).
- **Scope isolation** — a confined campus-admin can start a run in its campus; a foreign campus → `403 SCOPE_FORBIDDEN`.
- **Audit** — runs write `audit_events` rows under `module=portal-copilot`. Self-cleaning (runs cascade
  their tool-calls/confirmations; announcements + the two seeded users removed) + idempotent.

Typecheck clean across the whole workspace (`pnpm -r typecheck`). Migration **0020** is purely additive
(drizzle-generated; three `CREATE TABLE` + FKs/indexes), applied live; RLS extended to the three new tables.

### Files added/changed (Phase 10)
**Reused (no change)** — `@edrion/copilot` (guardrail engine + lifecycle + redact + planner seam),
`@edrion/shared-types` AI enums, the `ai.use` catalogue key (already granted to every operative role).

**DB (`packages/database`)** — `src/schema/copilot.ts` (`portal_ai_runs` + `portal_ai_tool_calls` +
`portal_ai_confirmations`; child tables carry `institution_id` but **no `campus_id``). Wired into
`schema/index.ts` + top-level type re-exports (`src/index.ts`); `migrations/0020_dusty_taskmaster.sql`;
`migrations/sql/zzz_rls.sql` extends the isolation list with the three tables.

**Schemas (`packages/schemas`)** — `src/portal-copilot.ts` (`portalCreateRunSchema`/`portalConfirmRunSchema`/
`portalRejectRunSchema`/`portalRunsListQuerySchema` + `portalCopilotContextSchema`; `portal*`-prefixed to
avoid colliding with the platform `copilot.ts`); exported from `index.ts`.

**API (`apps/api/src/modules/portal`)** — `portal-copilot.repository.ts` (scope-aware typed SQL for the
three tables), `portal-copilot.tools.ts` (the `PortalCopilotToolRegistry` mapping the four tools to
`PeopleService`/`AnnouncementsService`), `portal-copilot.planner.ts` (deterministic `PortalCopilotPlanner`
implementing `CopilotPlanner`), `portal-copilot.service.ts` (create/confirm/reject lifecycle, guardrail
eval + per-tool permission re-assert + audit), `portal-copilot.controller.ts` (`/v1/portal/copilot/runs*`,
all gated `ai.use` with the portal guards); all registered in `portal.module.ts`.

**Web (`apps/institution-web`)** — `lib/copilot-types.ts`, `lib/copilot.ts` (run list/detail +
create/confirm/reject hooks); `app/(app)/copilot/page.tsx` (a chat-style surface: prompt box +
suggestions → prepared tool calls with guardrail-decision badges + impact preview → confirm/reject;
recent-runs list). `lib/nav.ts` already had the **AI Copilot** item (`/copilot`, gated `ai.use`) — the
real page now takes over from the "coming soon" catch-all. A real Claude model (default Opus 4.8,
`claude-opus-4-8`) drops in behind the `CopilotPlanner` seam later without touching the lifecycle.

**Smoke** — `scripts/portal-p10-smoke.sh` (40 checks). Uses `DATABASE_URL` (defaults to the local DB) to
seed/remove the two test users, assert pre/post-confirm row existence, and verify the audit rows.

---

## 2j. Phase 11 — Settings, User Management, Roles editor, Audit viewer — DONE (live-verified)

The **Administration** nav group. Three CRUD verticals on the exact P2–P9 pattern (scope-aware repo →
version-guarded service with FK pre-checks + friendly 409s + audit → controller with the portal guards →
web pages on the generalized `ResourceManager` + nested drawers) plus one **read-only** vertical (the
audit viewer). User-management/roles touch the auth tables, so they layer extra safety on top of the
usual discipline. **No catalogue/role/nav change** — the `users.*`/`roles.*`/`institution_settings.*`/
`audit.*` keys and the Administration nav items already existed (a real page now takes over from the
"coming soon" catch-all for `/settings`, `/users`, `/roles`, `/audit`).

Two new tables (migration **0021**): `institution_settings` (the flat, campus-scoped settings tree) +
`institution_roles` (per-institution custom roles). User management reuses the existing auth tables
(`institution_users` + `institution_user_roles` + `campus_user_access` + the `directGrants`/`directDenies`
overrides on the user row); the audit viewer is read-only over the append-only `audit_events`.

- **Settings** (`/v1/portal/settings`, `institution_settings.view` / `.manage`) — a flat, campus-scoped,
  version-guarded key/value store grouped by `category` (general/academic/branding/localization/
  notifications/security) with a `valueType` (string/number/boolean/json). The logical key
  `(institution, campus, category, key)` is pre-checked for a friendly **409 `SETTING_EXISTS`** (a unique
  index can't express "NULL campus = institution-owned" cleanly). New rows stamp the active campus
  (institution-owned in institution scope); every mutation audited (`module=portal-settings`).
- **Roles** (`/v1/portal/roles`, `roles.view` / `roles.manage`) — the editor over the institution
  permission catalogue. The list **merges the code default roles (read-only, `source:'default'`,
  `isSystem:true`) with the institution's DB custom roles**; create/edit/delete operate on custom roles
  only (a `default:<key>` id or a built-in key → **400 `ROLE_IS_SYSTEM`** / **409 `ROLE_EXISTS`**). Every
  permission key is validated against the catalogue (**400 `INVALID_PERMISSION`**); the wildcard is
  rejected. A role assigned to a user can't be deleted (**409 `ROLE_IN_USE`**). `GET /roles/catalogue`
  feeds the permissions picker; `PUT /roles/:id/permissions` saves just the bag. **The editor is REAL**:
  `PortalAuthService` now loads `institution_roles` and merges them on top of (a same-keyed custom role
  overrides) the code defaults when evaluating a principal — so editing a custom role actually changes
  access (smoke proves a custom role granting `audit.view` flips a user's `GET /portal/audit` 403→200).
  Audited (`module=portal-roles`).
- **Users** (`/v1/portal/users`) — the directory over `institution_users`. Reads `users.view`; inviting
  `users.invite` (POST → status `invited`, **409 `USER_EXISTS`**); editing/disabling the sensitive
  `users.manage` (PATCH); assigning roles/campus access/overrides the sensitive `users.manage_roles`
  (`PUT /users/:id/access` — replaces `institution_user_roles` + `campus_user_access` + the
  grants/denies in ONE version-guarded **transaction**). Role keys validated against default ∪ custom
  (**400 `INVALID_ROLE`**); campus ids must belong to the institution (**400 `INVALID_REFERENCE`**);
  override keys against the catalogue (**400 `INVALID_PERMISSION`**). Lock-out guards: a user can't
  disable (**403 `CANNOT_DISABLE_SELF`**), edit own roles (**403 `CANNOT_EDIT_OWN_ROLES`**) or delete
  (**403 `CANNOT_DELETE_SELF`**) themselves. User management is institution-level (the list is not
  campus-filtered) but still runs under the portal scope guard. Audited (`module=portal-users`).
- **Audit viewer** (`/v1/portal/audit`, `audit.view` / `audit.export`) — read-only, server-paginated
  reads over the append-only `audit_events`, ALWAYS confined to the principal's institution, newest
  first, with module/action/result/risk/date/search filters. `GET /audit/filters` returns the distinct
  modules + summary counts; `GET /audit/export` streams a CSV (gated by the sensitive `audit.export`),
  and **the export is itself audited** (`module=portal-audit`, action `audit.export`) so exporting the
  trail leaves its own trace.

Live smoke (`scripts/portal-p11-smoke.sh`, **61/61 pass**) proves, end-to-end:
- **Permission gating** — a view-only admin seeded via `direct_grants` (the four `*.view` keys, no
  manage/invite/export) reads all four domains → 200 but every write/export → 403; `teacher` (no
  Administration keys) → 403 everywhere.
- **Settings** — create (default `valueType:string`) → duplicate (category,key) 409 `SETTING_EXISTS` →
  stale-version 409 → update 200.
- **Roles** — list ≥12 (built-in + custom) → create custom (`source:custom`) → duplicate key /
  built-in key 409 `ROLE_EXISTS` → unknown permission 400 `INVALID_PERMISSION` → set permissions
  (count 3) → stale-version 409 → edit/delete a built-in 400 `ROLE_IS_SYSTEM` → delete-in-use 409
  `ROLE_IN_USE` → delete-when-free 200.
- **Users** — invite (status `invited`) → duplicate email 409 `USER_EXISTS` → set access unknown role
  400 / unknown campus 400 → valid access (roleKeys + campusCount) → edit 200 → stale-version 409 →
  the three self-guards 403.
- **Roles editor is real** — assigning a custom role granting `audit.view` flips the target's
  `GET /portal/audit` 403→200; removing it reverts to 403.
- **Audit** — read 200 → module filter has rows → CSV export header row (`occurred_at,module`).
- **Scope isolation** — a confined admin creates a campus-stamped setting in its campus scope; a
  foreign campus → `403 SCOPE_FORBIDDEN`.
- **Audit rows** — `portal-settings`/`portal-roles`/`portal-users`/`portal-audit` rows all written
  (the export logs its own row). Self-cleaning (settings/roles/users + the seeded test users removed) +
  idempotent.

Typecheck clean across the whole workspace (`pnpm -r typecheck`). Migration **0021** is purely additive
(drizzle-generated; two `CREATE TABLE` + FKs/indexes), verified clean-from-empty (0000→0021 on a scratch
DB) and applied live; RLS extended to the two new tables.

### Files added/changed (Phase 11)
**DB (`packages/database`)** — `src/schema/settings.ts` (`institution_settings`), `src/schema/roles.ts`
(`institution_roles`); both reference only institutions/campuses (plain `.references()` safe). Wired into
`schema/index.ts` + top-level type re-exports (`src/index.ts`); `migrations/0021_mighty_katie_power.sql`;
`migrations/sql/zzz_rls.sql` extends the isolation list with the two tables.

**Schemas (`packages/schemas`)** — `src/portal-settings.ts`, `src/portal-roles.ts`, `src/portal-users.ts`,
`src/portal-audit.ts` (create/update/list zod + `setPortalRolePermissionsSchema` +
`setPortalUserAccessSchema` + `portalAuditExportQuerySchema`; all **`portal*`-prefixed** to avoid
colliding with the platform-side `institution-users.ts`/`audit.ts` already in this package); exported
from `index.ts`. (Reuses `versionedDeleteSchema`.)

**API (`apps/api/src/modules/portal`)** — `settings.{repository,service,controller}.ts`,
`roles.{repository,service,controller}.ts` (merges code defaults + DB custom; `/roles/catalogue` +
`PUT /roles/:id/permissions`), `users.{repository,service,controller}.ts` (transactional
`replaceAccess`; `PUT /users/:id/access`; self-guards), `portal-audit.{repository,service,controller}.ts`
(read + `/filters` + CSV `/export`); all registered in `portal.module.ts`. `portal-auth.service.ts`
updated to **merge `institution_roles` into `evaluatePermissions`** (the roles editor changes real
access).

**Web (`apps/institution-web`)** — `lib/admin.ts` (a `makeCrudHooks` factory for the standard scope-aware
list/mutation hooks), `lib/admin-types.ts`, `lib/{settings,roles,users,audit}.ts` (per-domain hooks +
`useRoleCatalogue`/`useSetRolePermissions` + `useSetUserAccess` + audit filters/export);
`components/admin/role-permissions-drawer.tsx` (grouped catalogue checklist, read-only for built-ins),
`components/admin/user-access-drawer.tsx` (roles + campus-access checklists); pages
`app/(app)/{settings,roles,users}/page.tsx` (on the generalized `ResourceManager` + a per-row drawer)
and `app/(app)/audit/page.tsx` (a read-only `DataTable` with filters + a CSV export button). `lib/nav.ts`
already had the Administration group.

**Smoke** — `scripts/portal-p11-smoke.sh` (61 checks). Uses `DATABASE_URL` (defaults to the local DB) to
seed/remove the view-only admin + a campus-confined admin + a target user, prove the roles-editor flips
real access, and verify the audit-row counts.

---

## 2k. Phase 12 — Hardening & ship-readiness — DONE (live-verified)

The portal stops relying on the dev header as the only way in and closes the four big §5 gaps —
**real cookie auth, RLS binding, rate limiting, real dashboard counts** — plus a real invitation
email, perf indexes, a11y and responsive passes, and unit tests. Same boundary discipline
(institution auth + permission + scope guards, audited mutations, friendly errors). Migration **0022**
(2 tables + 3 columns + 2 perf indexes), purely additive, verified **clean-from-empty 0000→0022** on a
scratch DB and applied live.

- **Real cookie auth** (mirrors `apps/api/src/modules/authentication`): `POST /v1/portal/auth/login`
  exchanges a verified Supabase access token — or `{ email }` when `PORTAL_AUTH_DEV_LOGIN=true` — for an
  **HTTP-only `edrion_portal_session` cookie** carrying an API-signed JWT (`{sid,uid}`) that references a
  new `portal_sessions` row (the revocation + recent-auth authority, keyed `institution_user_id`,
  carries `institution_id` for RLS). `InstitutionAuthGuard` now resolves identity from the cookie
  (`resolveById` ← session) **or** the dev header (which is treated as always-recent — it has no
  session). MFA is enforced (`isMfaSatisfied`: an MFA-enrolled user must present `aal2`) and **account
  lockout** drives off new `institution_users.failed_login_attempts`/`locked_until` columns
  (`AUTH_MAX_FAILED_LOGINS`/`AUTH_LOCKOUT_SECONDS`). `reauth` (strong re-auth) refreshes the session's
  `last_auth_at`; `logout` revokes it. New `PortalSessionService` + `PortalAuthLoginService` +
  `PortalAuthController`; reuses the platform `SupabaseVerifier` + the hand-rolled `jwt.ts` codec. Every
  step is audited (`module=portal-auth`) and MFA/lockout write `security_events`.
- **Recent-auth on sensitive keys**: `InstitutionPermissionsGuard` now requires recent auth (via the
  session's `last_auth_at`) when **any required key is `isInstitutionSensitive`** — exactly mirroring the
  platform guard. A stale session → **403 `RECENT_AUTH_REQUIRED`** until `POST /portal/auth/reauth`. The
  dev header is always-recent so the existing P2–P11 smokes are unaffected.
- **RLS GUC on the portal request path** (closes §5.3): the global `DATABASE` provider is now a
  **tenant-aware proxy** (`createTenantAwareDatabase`, backed by an `AsyncLocalStorage`). A new global
  `PortalTenantInterceptor` runs every portal request (identified by `req.institutionContext`) inside
  `runInInstitutionTenant(db, institutionId, …)` — a transaction that sets
  `set_config('app.institution_id', …, true)` — so the existing `zzz_rls.sql` tenant policies bind at
  the storage layer (`portal_sessions`/`portal_invitations` added to the RLS list). **Zero repository
  edits** (the proxy routes `this.db` — and the audit writer built on it — to the active tx); the
  platform control-plane path is untouched (no `institutionContext` → straight pass-through). The
  request is now also atomic (throw → rollback), which matches the pre-check-then-write services.
  `GET /portal/auth/session` reports `tenantBound:true` to prove the GUC is set on the path.
- **Per-institution-principal rate limit** (closes §5.2): a new `InstitutionRateLimiter` (Redis
  fixed-window, fail-open, keyed `rl:pinst:<institutionUserId>`) is invoked from `InstitutionAuthGuard`,
  so all 24 portal controllers are covered in one place (they stay `@SkipRateLimit()` for the platform
  limiter). Breach → **429 `RATE_LIMITED`** + `Retry-After`.
- **Real invitation email** (closes the P11 follow-up): `users.invite` now persists a
  `portal_invitations` row + mints a **signed accept link** (HS256, with a `purpose:'portal_invite'`
  discriminator so it can't be replayed as a session) and dispatches via a new pluggable `EmailService`
  seam (SMTP when `SMTP_URL` is set; a dev **log transport** otherwise — the invitation pipeline is
  complete + provable without a mail server). The invite is audited with `invitationEmailSent`.
- **Real dashboard module counts** (closes §5.4): `PortalRepository.moduleCounts()` computes
  scope-aware students/staff/attendance-today/fees-collected/open-admissions/payroll-due in a single
  round; the institution + campus dashboards now show real numbers instead of `pending` placeholders
  (the per-user teacher/parent/student variants still show clearly-marked pending until their own joins
  land).
- **Perf indexes**: `institution_users(email)` (portal login resolves identity by email across
  institutions — the existing composite leads with `institution_id`) and
  `audit_events(institution_id, occurred_at)` (the audit viewer + dashboard recent-activity filter by
  institution and order by occurred_at).
- **a11y**: a shared `useFocusTrap` hook gives `Drawer`/`Dialog` real focus management (initial focus,
  Tab/Shift+Tab trap, Escape, focus restore to the trigger) + `aria-labelledby`/`aria-describedby`;
  `DataTable` gains `scope="col"`, `aria-sort`, an optional `<caption>`, an `aria-live` result count and
  a labelled pagination `<nav>`; the app shell gains a **skip-to-content** link + `aria-current` nav.
- **Responsive**: the sidebar already auto-collapses to icons under `md`; drawers are full-width on
  small screens; tables keep their horizontal-scroll wrapper. A real `/login` route (outside the app
  shell) drives the cookie login (dev-login email or Supabase token) end-to-end.
- **Tests**: `email.service.spec.ts` (log/smtp transport, distinct ids) + `tenant-scope.spec.ts` (proves
  the tenant-aware proxy routes to the active institution transaction, sets the GUC, restores the pool
  after, and keeps concurrent scopes isolated). Whole-workspace `pnpm -r typecheck` clean; **118 API
  unit tests** pass.

Live smoke (`scripts/portal-p12-smoke.sh`, **39/39 pass**) proves, end-to-end: no-auth → 401; cookie
login → `/me` + `/session` (`tenantBound:true`, `recentAuth:true`, `hasServerSession:true`); the real
verified-Supabase-token path logs a non-MFA user in; an MFA user + `aal1` token → `MFA_REQUIRED` and
repeated failures → `ACCOUNT_LOCKED` (even a later valid `aal2` token stays locked); the recent-auth
gate (sensitive create 201 fresh → **403 `RECENT_AUTH_REQUIRED`** once the session is aged → 201 again
after reauth; a non-sensitive read stays allowed while stale); logout revokes the session
(`SESSION_REVOKED`); a burst beyond `RATE_LIMIT_MAX` for one principal → **429** + `Retry-After`;
`users.invite` persists a `portal_invitations` row + audits `invitationEmailSent`; the institution
dashboard returns real numeric counts (not pending); and the `portal-auth` audit rows + MFA/lockout
security events are written. Self-cleaning + idempotent. **NOTE:** because the per-principal limiter is
now real, running every portal smoke back-to-back can exhaust one principal's 60s budget (each smoke
passes individually); space them or run individually.

### Files added/changed (Phase 12)
**DB (`packages/database`)** — `src/client.ts` adds `createTenantAwareDatabase` (ALS proxy),
`runInInstitutionTenant` (GUC tx) + `currentTenantInstitutionId`; `src/schema/portal-sessions.ts`
(`portal_sessions` + `portal_invitations`); `src/schema/users.ts` adds `last_auth_at`/
`failed_login_attempts`/`locked_until` + an `email` index; `src/schema/records.ts` adds the
`(institution_id, occurred_at)` audit index; `migrations/0022_closed_lyja.sql`; `zzz_rls.sql` adds the
two new tables. **Config** — `PORTAL_SESSION_COOKIE_NAME`/`PORTAL_AUTH_DEV_HEADER`/`PORTAL_AUTH_DEV_LOGIN`/
`PORTAL_WEB_URL`/`SMTP_URL`/`EMAIL_FROM`. **Auth** — `claims.ts` adds `PortalSessionTokenPayload` +
`PortalInviteTokenPayload`. **Schemas** — `portal-auth.ts` (`portalLoginSchema`/`portalReauthSchema`).

**API (`apps/api/src/modules/portal`)** — `portal-session.service.ts`, `portal-auth-login.service.ts`,
`portal-auth.controller.ts`, `portal-invite.service.ts`, `email.service.ts`, `portal-rate-limit.ts`
(`InstitutionRateLimiter`), `portal-tenant.interceptor.ts`; `portal-auth.service.ts` (lockout helpers +
`resolveById`/`loadActiveBy*`), `portal-auth.guard.ts` (cookie path + rate limit + dev-header
always-recent), `portal-permissions.guard.ts` (recent-auth on sensitive keys), `portal.repository.ts`
(`moduleCounts`), `portal-dashboard.service.ts` (real counts), `users.service.ts` (send the invite),
`portal.decorators.ts` (`CurrentInstitutionContext`), `portal.module.ts` (new providers + the global
`APP_INTERCEPTOR`); `common/core.module.ts` (DATABASE → tenant-aware proxy). Specs:
`email.service.spec.ts`, `tenant-scope.spec.ts`.

**UI (`packages/ui`)** — `use-focus-trap.ts` (new) wired into `drawer.tsx`/`dialog.tsx`; `table.tsx`
a11y (caption/scope/aria-sort/aria-live/nav). **Web (`apps/institution-web`)** — `app/login/page.tsx`
(new), `app/(app)/layout.tsx` (skip link + main landmark), `components/app-shell/sidebar.tsx`
(`aria-current` + nav label). **Smoke** — `scripts/portal-p12-smoke.sh` (39 checks; uses `DATABASE_URL`
+ `SUPABASE_JWT_SECRET` to mint test access tokens and verify rows/audit).

---

## 3. How to run (dev)

```bash
pnpm install
pnpm db:seed            # platform seed (DESTRUCTIVE truncate) — only if DB empty/needs reset
pnpm --filter @edrion/database seed:portal   # add demo portal users (non-destructive, idempotent)

# API (port 3001). Needs PORTAL_AUTH_DEV_HEADER=true in .env (already set for dev).
pnpm --filter @edrion/api dev

# Portal web (port 3002)
pnpm --filter @edrion/institution-web dev
# → http://localhost:3002  (dev-impersonates NEXT_PUBLIC_DEV_INSTITUTION_USER)

# Live smokes (API must be running on :3001)
bash scripts/portal-academics-smoke.sh    # Phase 2 academics (28 checks)
bash scripts/portal-people-smoke.sh       # Phase 4 people    (41 checks)
bash scripts/portal-p5-smoke.sh           # Phase 5 admissions/attendance/timetable (48 checks)
bash scripts/portal-p6-smoke.sh           # Phase 6 exams/gradebook/assignments (52 checks)
bash scripts/portal-p7-smoke.sh           # Phase 7 fees/payroll (60 checks); export DATABASE_URL for audit checks
bash scripts/portal-p8-smoke.sh           # Phase 8 library/transport/inventory/hostel (82 checks); uses local DATABASE_URL
bash scripts/portal-p9-smoke.sh           # Phase 9 announcements/notifications/messages/reports (53 checks); uses local DATABASE_URL
bash scripts/portal-p10-smoke.sh          # Phase 10 copilot (40 checks); uses local DATABASE_URL
bash scripts/portal-p11-smoke.sh          # Phase 11 settings/users/roles/audit (61 checks); uses local DATABASE_URL
```

Dev login = `x-institution-user-email` header (no cookie yet). Seeded demo users (all `@greenwood.edu`):
`owner` (owner), `admin` (institution_admin), `campus.north` (campus_admin, 1 campus), `principal`,
`finance` (finance_manager — fees), `hr` (hr_manager — payroll), `teacher`, `parent`, `student`.
Change the active user via `NEXT_PUBLIC_DEV_INSTITUTION_USER`.

API namespacing: portal routes are under `/v1/portal/*`; controllers are `@Public()` (skips the
platform AuthGuard) + `@SkipRateLimit()`, guarded by `InstitutionAuthGuard` → `InstitutionPermissionsGuard`.

---

## 4. Permission model (institution domain)

- Catalogue: `packages/permissions/src/institution/catalogue.ts`. Sensitive keys (deletes, fees/payroll/grades, role/settings/announcement/audit-export) flagged `sensitive:true`.
- Roles (bags of keys): `institution_owner` (`*`), `institution_admin` (all), `campus_admin`, `principal`, `academic_coordinator`, `finance_manager`, `hr_manager`, `teacher`, `librarian`, `transport_manager`, `parent`, `student`.
- Evaluation reuses `evaluatePermissions/can/canAll` from `@edrion/permissions` (DB-authoritative; roles seed the tables, runtime reads DB).
- 4-layer enforcement: UI gate (`usePermissions`/`PermissionGate`) → API guard → service (forced `WHERE institution_id` + scope) → DB RLS (later).

---

## 5. Known gaps / TODO (carry into next phases)

1. **Real auth** — only the dev header works. Wire a portal Supabase session → cookie (mirror `apps/api/src/modules/authentication`), MFA, recent-auth for `sensitive` keys, lockout. Until then `InstitutionAuthGuard` throws 401 unless `PORTAL_AUTH_DEV_HEADER=true`.
2. **Rate limiting** — portal controllers are `@SkipRateLimit()`. Add a per-institution-principal limiter.
3. **RLS** — service-layer scope is enforced; Postgres tenant-isolation policies now cover the academic **and** people tables (`zzz_rls.sql`). Still relies on the app setting `app.institution_id`; the portal request path does not yet set that GUC (defence-in-depth only).
4. **Domain tables** — ✅ all built in P2/P4/P5/P6/P7/P8/P9 + the P10 Copilot surface + the P11 Administration verticals (academics → people → admissions/attendance/timetable → exams/gradebook/assignments → fees/payroll → library/transport/inventory/hostel → announcements/notifications/messages/reports → copilot → settings/users/roles/audit). The adaptive dashboard still shows `pending:true` for module counts; wiring real counts for every built module into the dashboard is a small follow-up.
9. **Admin follow-ups (P11)** — the audit viewer has no per-row detail drawer yet (it lists the events; the platform side has a detail view). The roles editor stores custom roles in `institution_roles` and merges them into the principal eval, but there is no "effective access preview" panel on the user-access drawer yet (the platform `institution-users.ts` has a pure `computeEffectiveAccess` that could back one). Settings are a generic key/value tree (no typed per-setting UI / validation beyond `valueType`). User invite does not yet send a real email (status is set to `invited`; wiring the invitation email belongs with P12 real auth).
8. **Copilot follow-ups (P10)** — the planner is a deterministic stub behind the `CopilotPlanner` seam (a real Claude model, default Opus 4.8 `claude-opus-4-8`, drops in without touching the lifecycle). The guardrail engine supports per-institution policy overrides (modes, kill switch, financial/affected-user caps, second-approver) but the portal currently supplies one default full-mode policy — surfacing per-institution AI governance (the `ai.configure` key already exists) is a follow-up. No per-institution AI-usage daily limiter yet (the platform has `AiUsageLimiter`). The tool catalogue is intentionally small (4 tools) — extend it as more sensitive portal actions warrant a guardrailed AI path.
5. **UI primitives** — ✅ `DataTable` (server pagination/sort), `Drawer`, `Dialog`/`ConfirmDialog`, `Select` added in P2 (no TanStack Table dep — the table is presentational + parent-controlled). Still missing: `Dropdown` (menu), `Tabs`, a shared zod+RHF `Form` abstraction (P2 uses a field-driven `ResourceForm` instead), `Chart`.
6. **Audit on portal mutations** — wire `@edrion/audit` writer into portal services once mutations exist.
7. A dev API server may be left running on :3001 from this session.

---

## 6. Roadmap (phase by phase) — each phase: schema → zod → API module+guards+audit → api-client hooks → UI → tests

- ~~**P2 Academics core**~~ — ✅ DONE (see §2b). `academic_years, departments, grade_levels, subjects, classes, class_subject_teachers`; established the table/drawer/form pattern + `DataTable`/`Drawer`/`Dialog`/`Select` primitives + the `ResourceManager`/`ResourceForm` web pattern.
- ~~**P4 People**~~ — ✅ DONE (see §2c). `students, teachers, staff, parents, student_guardians`; repointed the academic teacher/head FKs to `teachers` and wired the pickers; generalized `ResourceManager` (injectable permissions + data hooks).
- ~~**P5** Admissions, Attendance, Timetable~~ — ✅ DONE (see §2d). `admission_applications` (+ accept→enrol→student bridge), `attendance_sessions`/`attendance_records` (register + bulk marking), `timetable_slots`; migration 0015; `scripts/portal-p5-smoke.sh` (48 checks).
- ~~**P6** Exams, Gradebook, Assignments~~ — ✅ DONE (see §2e). `exams`/`exam_schedules` (two-level), `grade_entries` (flat), `assignments`/`assignment_submissions` (two-level + bulk grade); migration 0016; `scripts/portal-p6-smoke.sh` (52 checks).
- ~~**P7** Fees, Payroll~~ — ✅ DONE (see §2f). `fee_structures` (flat), `fee_invoices`/`fee_payments` (two-level + payment→invoice bridge), `payroll_runs`/`payroll_items` (two-level, teacher/staff lines, computed net); migration 0017; `scripts/portal-p7-smoke.sh` (60 checks).
- ~~**P8** Library, Transport, Inventory, Hostel~~ — ✅ DONE (see §2g). `library_books`/`library_loans` (issue→return bridge), `transport_routes`/`transport_vehicles`/`transport_assignments`, `inventory_items`/`inventory_movements` (quantity bridge), `hostel_blocks`/`hostel_rooms`/`hostel_allocations` (allocate→vacate bridge); migration 0018; `scripts/portal-p8-smoke.sh` (82 checks).
- ~~**P9** Announcements, Notifications, Messages, Reports~~ — ✅ DONE (see §2h). `announcements`/`notifications` (flat + publish→notify bridge), `message_threads`/`message_posts` (two-level), `report_definitions`/`report_runs` (two-level + export bridge); migration 0019; `scripts/portal-p9-smoke.sh` (53 checks). No catalogue/role change; added a Notifications nav item.
- ~~**P10** Copilot~~ — ✅ DONE (see §2i). `portal_ai_runs`/`portal_ai_tool_calls`/`portal_ai_confirmations` (migration 0020) + the reused `@edrion/copilot` guardrail engine + lifecycle; a planner + 4-tool registry mapping to existing audited services; `ai.use`-gated controller; confirmation required on every state change; `scripts/portal-p10-smoke.sh` (40 checks). No catalogue/role/nav change (the `ai.use` key + the `/copilot` nav item already existed).
- ~~**P11** Settings tree, User management, Roles editor, Audit viewer~~ — ✅ DONE (see §2j). `institution_settings` (flat settings tree) + `institution_roles` (custom roles merged into the principal eval) (migration 0021); user management over the existing auth tables (`institution_users`/`institution_user_roles`/`campus_user_access` + grants/denies) with a transactional access PUT + self-guards; read-only audit viewer over `audit_events` + CSV export; `scripts/portal-p11-smoke.sh` (61 checks). No catalogue/role/nav change (the `users.*`/`roles.*`/`institution_settings.*`/`audit.*` keys + the Administration nav already existed).
- **P12** (recommended next) Real auth (portal Supabase session → cookie, MFA, recent-auth for sensitive keys, lockout, real invite email), RLS coverage (set `app.institution_id` GUC on the portal request path), rate limiting, perf/indexes, a11y, tests, responsive, real dashboard counts. **Next migration = 0022.**

DB tenancy convention for every academic table: `id, institution_id (always), campus_id (campus-scoped, nullable for institution-owned), …, actorColumns, timestamps, version`; indexes on `(institution_id)` and `(institution_id, campus_id)`.

---

## 7. Prompt to paste into a new chat

> Continue building the **Edrion Institution Portal** in this monorepo. Read
> `docs/INSTITUTION-PORTAL-HANDOFF.md` first — the foundation slice and **Phases 2, 4, 5, 6, 7, 8, 9, 10 AND 11**
> are DONE and live-verified (§2 + §2b–§2j): institution permissions/roles, `@edrion/auth` principal,
> `/v1/portal/*` modules with auth+permission+scope guards + audit, the `DataTable`/`Drawer`/`Dialog`/
> `Select` UI primitives, the generalized `ResourceManager`/`ResourceForm` web pattern, every CRUD
> vertical through academics, people, admissions/attendance/timetable, exams/gradebook/assignments,
> fees/payroll, library/transport/inventory/hostel, and announcements/notifications/messages/reports, the
> **P10 Copilot** (guardrailed AI assistant, `ai.use`-gated, confirmation on every state change), and the
> **P11 Administration** group — settings tree (`institution_settings`), user management over the auth
> tables (transactional access PUT + self-guards), a roles editor (`institution_roles`, merged into the
> principal eval so edits change real access), and a read-only audit viewer + CSV export (migration
> **0021**, `scripts/portal-p11-smoke.sh` 61/61). The last schema migration is **0021**; the next is
> **0022**. Now build **Phase 12 — hardening & ship-readiness**: real portal auth (Supabase session →
> HTTP-only cookie, mirror `apps/api/src/modules/authentication`; MFA, recent-auth for `sensitive` keys,
> lockout; a real invitation email for `users.invite`), RLS coverage (set the `app.institution_id` GUC on
> the portal request path so the existing `zzz_rls.sql` policies bind), a per-institution-principal rate
> limiter (controllers are still `@SkipRateLimit()`), perf/indexes, a11y, tests, responsive, and wiring
> real module counts into the adaptive dashboard. Keep the same boundary discipline (institution auth +
> permission + scope guards, audited mutations, friendly errors), keep everything typecheck-clean
> (`pnpm -r typecheck`), and add/extend a live smoke that runs 100% green (0 fail). When done, update this
> handoff (add §2k, advance the roadmap/§7) and the persistent memory.
