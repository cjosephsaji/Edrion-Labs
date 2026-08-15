# Petros Stage 11 handoff — reflection surfaces

Date: 2026-08-13
Status: **Stage 11 not complete**

The complete Stage 11 implementation scope is present: deterministic evidence-derived knowledge map and
next actions, calibration mirror, session-process recaps, prerequisite gap alarms, owner lifecycle controls,
shared Stage 8 intent handoff, aggregate operations, independent optional AI refinements, migration, and
automated coverage. Manual browser, physical-device, screen-reader, dashboard, and human usefulness acceptance
is intentionally deferred to the combined Stage 9–12 pass.

This is not a Stage 9, Stage 10, or Stage 11 completion claim and not a production-readiness claim. Stage 9's
physical microphone/device gate and Stage 10's positive human repeat-use gate remain open. Voice is optional;
Stage 11 itself never requires it. Stage 12 implementation has not begun.

## Implemented product scope

- `/progress` is the student Learning progress surface, not a chat page. It shows at most four finite actions,
  a syllabus map/list, calibration, session history recaps and gap alarms.
- Knowledge states are `solid`, `shaky`, `untouched`, and `insufficient_evidence`, with explicit evidence,
  mastery, uncertainty, and freshness thresholds. “Untouched” is zero evidence, not a weakness claim.
- Published topic/prerequisite edges, path/goal/exam relevance when known, prerequisite/dependent detail,
  evidence age, named point reasons and missing-link/stale indicators drive transparent ranking.
- Every active recommendation exposes “Why this?”, evidence age, a Stage 8 `reflection_action` preview/start,
  and an owner-controlled dismissal. Starting only creates an intent/session; new checked evidence is required
  before recommendation completion or a map rebuild changes the derived view.
- The learning-path page includes one contextual evidence-ranked card and links to `/progress`; there is no
  feed, follower, leaderboard, streak repair, conversion pressure, or public comparison.
- Calibration needs 8 paired confidence/outcome events and 4 per trend window. It shows direction, trend and
  uncertainty in gentle language, links a fragile-topic preview where available, and supports quiet/dismiss
  without affecting the map or learning actions.
- Recaps derive from closed-session moves/observations, structurally separate observed facts from labelled
  tentative inference, cite evidence, prevent durable preference/ability claims, and support correction/dismiss.
- Gap alarms first require a deterministic published-prerequisite cluster: 3 independent recent source events,
  2 affected topics, and 65% minimum confidence. They are deduplicated, explicitly hypotheses, show evidence
  and repair minutes, link a Stage 8 Repair preview, and support snooze/resolve/dismiss/false-positive.
- Visual map controls have accessible names, arrow navigation, normal Tab escape, zoom bounds, and a table
  equivalent. Mobile, reduced-motion, loading/empty/stale/error and print styles are included.

## Derivation, data, and lifecycle design

`petros.reflection.stage11.v1` rebuilds from owner-scoped production learner evidence, mastery, published topic
profiles/prerequisites, active learning path, and closed-session decisions/observations. Synthetic evidence is
excluded. A stable source hash makes same-version rebuilds idempotent; evidence/graph timestamps make stale
snapshots explicit. Snapshot-specific recommendation/calibration/evidence-link IDs avoid cross-version primary
key collisions, while dismissal/quiet/correction/alarm lifecycle state is carried by stable semantic keys.

Recommendation points are named and summed (prerequisite gap, fragile knowledge, exam proximity, review due,
learner goal, first attempt). New post-start evidence on the recommended concept closes a started recommendation
and records a content-free outcome event. No engagement optimization is recorded.

Optional wording refinement uses two independently registered gateway functions:

- `reflection.session_recap.generate`
- `reflection.gap_explanation.generate`

Both receive bounded structured evidence, versioned JSON schemas, no raw student answer flag, and validation.
Candidates/facts are deterministic first; unavailable or invalid routes fall back to useful deterministic copy.
Validation failure, retry/fallback, latency and cost are metered without provider details in student UI. No raw
chain-of-thought is requested or stored.

Migration `0198_petros_reflection.sql` creates eight tables: snapshots, map states, recommendations,
calibration insights, session recaps, gap alarms, evidence links, and content-free events. All eight have RLS
enabled and forced with one owner/tenant policy; catalog readback returned `true|true|1` for each. Readback also
found 8 tables and 27 indexes. Migration 0198 applied successfully on the local QA database.

The student API is bounded by institutional student auth/portal/permission/rate-limit guards. Every repository
read/write includes institution and student scope. Aggregate operations require `ai.view`; the separate
identifiable evidence read additionally requires recent authentication and writes an audit. Export returns the
owner's derived reflection plus transfer semantics. Derived deletion cascades but explicitly does not delete
durable source learner evidence; an authorized transfer rebuilds from portable evidence and excludes restricted
institution syllabus links.

## Operations and privacy

`/ai/petros-reflection` exposes aggregate map coverage, missing links/job lag, recommendation intent/outcome,
calibration eligibility/lifecycle, recap generation/validation/correction/dismissal, alarm confidence/lifecycle/
false positives, algorithm/schema versions, and per-function cost/latency/retry/fallback. It excludes learner
names, answers, recap corrections, false-positive free text and individual comparison. Its release gate is
hard-coded false for Stage 9 device QA, Stage 10 repeat-use, Stage 11 human acceptance, and production readiness.

The schema contract also fixes `voiceRequired=false` and `productionReady=false`; parsing fails if production
readiness is set true in this Stage 11 surface.

## Primary files

- Contracts/function registry: `packages/schemas/src/petros-reflection.ts`,
  `packages/schemas/src/petros-ai-routing.ts`, `packages/schemas/src/petros-session-intent.ts`
- Schema/migration: `packages/database/src/schema/petros-reflection.ts`,
  `packages/database/migrations/0198_petros_reflection.sql`
- Deterministic engine/API/privacy: `apps/api/src/modules/student/petros-reflection/`
- Shared action intent: `apps/api/src/modules/student/petros-session-intent/`
- Student UI: `apps/student-web/src/components/petros/petros-reflection.tsx`,
  `apps/student-web/src/app/(app)/progress/page.tsx`, `apps/student-web/src/app/(app)/learning-path/page.tsx`
- Aggregate operations: `apps/super-admin-web/src/app/(app)/ai/petros-reflection/page.tsx`
- Quality corpus: `packages/learn-evals/src/fixtures/reflection.ts`,
  `packages/learn-evals/src/reflection-quality.spec.ts`
- Architecture boundary: `docs/PETROS-AI-ROUTING.md`
- Deferred combined acceptance: `docs/PETROS-STAGE-09-12-QA-RUNBOOK.md`

## Automated verification

No real AI provider, camera, microphone, STT or TTS was used. External model cost was **0 µUSD**.

- `pnpm --filter @edrion/database migrate` — passed; all pending migrations including 0198 applied.
- PostgreSQL catalog readback — 8/8 Stage 11 tables returned RLS enabled `true`, forced RLS `true`, and one
  policy; 27 indexes were present. A rollback-only transaction under non-superuser `edrion_app` returned
  `owner_visible=1`, `other_student_visible=0`, and `other_institution_visible=0`.
- `pnpm --filter @edrion/api test` — **63 files, 404 tests passed**.
- `pnpm --filter @edrion/student-web test` — **6 files, 27 tests passed**.
- Focused Stage 11 schemas — **6/6 passed**.
- Focused reflection engine, permission metadata, lifecycle/privacy/fallback/idempotency/aggregate service, and
  Stage 8 intent selection — **22/22 passed**.
- Focused reflection component — **6/6 passed**, including visual/list parity, accessible state names,
  low-sample hiding, recap/alarm semantics, scoped preview/start, and recommendation dismissal.
- `pnpm --filter @edrion/learn-evals test` — **4 files, 41 tests passed**, including 6/6 Stage 11 honesty,
  specificity, uncertainty and no-dark-pattern checks.
- `pnpm --filter @edrion/learn-evals run:full` — **240/240 fixture sessions passed**, blocking 0, warnings 0,
  cost 0 µUSD.
- Typechecks passed for `@edrion/schemas`, `@edrion/database`, `@edrion/api`, `@edrion/student-web`,
  `@edrion/super-admin-web`, and `@edrion/learn-evals`.
- Production builds passed for API, student web, and Super Admin web. The two Next builds emitted only the
  existing ambiguous Tailwind `ease-[var(--ease-emphasized)]` warning.
- Static privacy/security inspection found no direct provider SDK, credential, environment or frontend provider
  call in Stage 11 paths; structured AI use is gateway-only. Stage 12 terms/implementation are absent from the
  Stage 11 code paths.

The full schemas package retained the same two unrelated pre-existing failures in
`src/student/exam-questions.spec.ts`: quick-check pause expected true, and a quick-check over 15 minutes was
expected to throw. The Stage 11 schema suite passed independently.

Lint was attempted for schemas, database, API, student web and Super Admin. The first three cannot start because
the workspace resolves no `eslint` binary (`eslint: command not found`). Both Next lint commands enter the
interactive first-time ESLint configuration prompt and exit in this noninteractive run. Learn-evals exposes no
lint script. These are open toolchain checks, not passes.

Automated DOM/component and CSS checks are evidence for semantic state coverage, not substitutes for browser,
screen-reader, mobile, print, or human usefulness acceptance. Per the requested deferral, no manual browser,
physical-device or human acceptance was performed now.

## Deferred acceptance and evidence required

The authoritative combined runbook is [PETROS-STAGE-09-12-QA-RUNBOOK.md](./PETROS-STAGE-09-12-QA-RUNBOOK.md).
Stage 11 has 11 executable human scenarios there with exact accounts/navigation/setup, actions, UI/backend/
dashboard expectations, failure criteria, satisfaction questions, and captures. It covers map usefulness and
action updates, no-data honesty, four calibration fixtures, evidence-faithful recaps, clustered and unrelated
doubts, operations/routing reconciliation, privacy/export/deletion/transfer/no-dark-pattern checks, and full
accessibility/responsiveness/print/stale/recovery behavior.

Required evidence includes fixture manifests/hashes, UTC/device/browser/reviewer metadata, before/action/after
screens, screen-reader/focus/zoom/reduced-motion/print notes, satisfaction answers and redacted quotes, every
snapshot/recommendation/intent/session/evidence/recap/alarm/event/attempt/audit ID, filtered API/dashboard/SQL
reconciliation, tenant-denial and route-restoration proof. Screenshots or automated output without the ledger
and IDs do not close a gate.

## Open gates and limitations

- Stage 9 physical microphone/camera/device, language-review, privacy and dashboard matrix is open. No physical
  microphone/device acceptance was performed in this Stage 11 run.
- Stage 10 needs at least two credible positive human repeat-use reasons plus signed-in visual/mobile/
  screen-reader acceptance. No human usefulness result is claimed here.
- Stage 11 needs human confirmation that the map answers “what next and why?” within seconds; that calibration,
  recaps and alarms are accurate/respectful/useful; and that dashboard, cross-tenant and accessibility behavior
  reconcile in real browsers.
- No real AI provider was required for Stage 11 automation. Live recap/gap route pause, malformed-output,
  cost/latency/fallback and restoration acceptance remains manual QA evidence.
- Lint/toolchain and any unrelated baseline failures from the full verification pass must remain explicit; a
  production build does not waive them.
- Production readiness must remain false until all physical-device, human, browser, privacy, routing and
  dashboard gates are reviewed.

## Stage 12 prerequisite boundary

Stage 12 was not implemented. Before it starts, approve the Stage 11 human/dashboard gate, preserve the
Stage 9/10 open-gate record, and use the Stage 12 section of the combined runbook only as a future evidence
checklist. No policy model, homework behavior, visibility setting, escalation, class signal, parent digest,
route, migration, or UI was added by Stage 11.

**Stage 11 not complete**
