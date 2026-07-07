# Plan 02 — Mount the 9 built-but-unregistered student controllers

> Consumer: Cursor Composer 2.5. Read `plans/fix/00-README.md` first, every session.
> Prerequisites: none (independent of Plan 01; both must pass before Plans 03+).
> GATE-IN: API boots clean. If not, stop and report.

## 1. Objective

Nine student API controllers are fully built (controller + service + repository) but were never
added to `student.module.ts`, so their routes return 404 while the student-web frontend calls them.
This is why the analytics/progress, assignments, homework, calendar, classes, courses, exams,
report-cards, and surface pages "don't work". Done = every route mounted, DI resolved, API boots,
and each corresponding frontend page renders real data.

## 2. Current state (verified 2026-07-07; re-confirm before editing)

`apps/api/src/modules/student/student.module.ts` (~105 lines, **already modified in the working
tree — edit in place, do not revert**) registers 17 controllers. These exist on disk but are
absent from the `controllers` array (and their extra providers from `providers`):

| # | Controller file (under `apps/api/src/modules/student/`) | Known extra providers in same folder |
|---|---|---|
| 1 | `analytics/student-analytics.controller.ts` | check folder for service files |
| 2 | `assignments/student-assignments.controller.ts` | check folder |
| 3 | `calendar/student-calendar.controller.ts` | check folder |
| 4 | `classes/student-classes.controller.ts` | check folder |
| 5 | `courses/student-courses.controller.ts` | check folder |
| 6 | `exams/student-exams.controller.ts` | check folder |
| 7 | `report-cards/student-report-cards.controller.ts` | check folder |
| 8 | `homework/homework.controller.ts` | `homework.service.ts`, `homework.repository.ts`, `homework-policy.service.ts` |
| 9 | `surfaces/student-surfaces.controller.ts` | `student-surfaces-read.service.ts`, `surface-gate.service.ts` (note: `surfaces.service.ts` + `fees-summary.service.ts` are ALREADY registered) |

The frontend hooks that call these dead routes live in
`apps/student-web/src/lib/hooks/institutional.ts` (useAnalytics, useHomeworkList, useAssignmentsList,
useClasses, useCourses, useExams, useReportCards, useCalendar, …).

Re-confirm (expect 404 before the fix):

```
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3001/v1/student/analytics     → 404
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3001/v1/student/homework      → 404
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3001/v1/student/me            → 401/403 (mounted, for contrast)
```

## 3. Product-spec excerpts (what these surfaces are)

> **Institutional nav group** … Opens the institutional screen. Terminology matches the stage: a
> school student sees "Homework / Classes / Marks," a college student sees "Assignments / Courses
> / Grades." For an independent learner this entire group is not rendered.

> **Analytics & Progress** … Every stat slot carries a mandatory "FROM —" source line; there is no
> mastery percentage anywhere. … the college table shows attendance vs. the 75% line and
> teacher-entered internal marks (the only scores shown).

> **Assignments** … Filter (All/In progress/Submitted/Returned) … Late is a calm amber, never an
> alarming red. The governance pill states how Petros may help here (Full / Concept-only / Off).

## 4. Tasks (in order — one controller at a time, boot between each)

### Task 1 — Enumerate DI dependencies

For EACH of the 9 controllers: read the controller's constructor and its service's/repository's
constructors, and list every injected class/token. Cross-check each against what
`student.module.ts` already provides or what its imported modules (`FeatureControlsModule`,
`PortalModule`, `LearnAiModule`, `LearningEventsModule`) export. Produce the full add-list BEFORE
editing.

### Task 2 — Register incrementally

- File: `apps/api/src/modules/student/student.module.ts` only.
- Change: add controllers to `controllers: []` and their providers to `providers: []`,
  **one controller (+ its providers) at a time**, letting ts-node-dev respawn between additions and
  watching the log for `Nest can't resolve dependencies of the X`. Fix each DI error by adding the
  missing provider or module import — never by stubbing or commenting out functionality.
- If a dependency lives in another module, import that module rather than re-providing the class.
- Acceptance per controller: API boots clean, and the controller's base route returns 401/403
  (not 404) unauthenticated.

### Task 3 — Route smoke table

With the API running, produce this table (unauthenticated status codes; all must be non-404):

```
/v1/student/analytics          → 401/403
/v1/student/assignments        → 401/403
/v1/student/calendar           → 401/403
/v1/student/classes            → 401/403
/v1/student/courses            → 401/403
/v1/student/exams              → 401/403
/v1/student/report-cards       → 401/403
/v1/student/homework           → 401/403
/v1/student/surfaces/fees      → 401/403   (check the controller for its actual paths)
```

Check each controller file for its real route paths (`@Controller(...)` + method decorators) and
extend the table to cover every route the 9 controllers declare.

### Task 4 — Authenticated data check

Using the authed-curl recipe from `00-README.md` §4, call each route with a seeded institutional
student session and confirm HTTP 200 with plausible JSON (not `{}`/500). If a route 500s because
seed data is missing (e.g. no report cards seeded), record it as `200-EMPTY acceptable` only when
the response is a well-formed empty collection; a stack trace is a FAIL to fix.

### Task 5 — Frontend page check

Start student-web and load each page as the dev student; confirm data or a designed empty state
renders (no error boundary, no infinite spinner): `/progress`, `/assignments`, `/homework`,
`/calendar`, `/classes`, `/courses`, `/exams`, `/report-cards`, `/fees`, `/documents`,
`/transport`, `/hostel`.

## 5. Verification gate (GATE-OUT — Plans 05/06 repeat as GATE-IN)

1. `corepack pnpm@9.15.9 --filter @edrion/api typecheck` → exit 0; API boots with zero DI errors.
2. Full route table from Task 3: all non-404.
3. Authed 200s from Task 4.
4. All 12 pages from Task 5 render.

## 6. Out of scope / guardrails

- Do NOT modify any controller/service/repository logic — this plan is wiring only. If a
  controller has an actual bug, note it in the report for the user; only fix it if it blocks boot.
- Do NOT touch `portal/`, `feature-controls/`, or DB migrations.
- Do NOT remove anything already registered in `student.module.ts`.

## 7. Escalation — stop and report if

- Any of the 9 controller files does not exist (working tree differs from this plan).
- A DI chain pulls in something requiring a new database table or migration.
- More than ~3 DI hops deep on a single controller without resolution — report the chain instead
  of guessing.
