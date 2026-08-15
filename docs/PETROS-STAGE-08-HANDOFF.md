# Petros Stage 8 handoff — contextual doors

Date: 2026-08-12  
Stage prompt: `docs/petros-stage-prompts/08-stage-08-contextual-doors.md`  
Status: **Stage 8 not complete** only because the prompt makes human browser, screenshot, responsive,
keyboard, screen-reader, zoom, reduced-motion, slow-network, and offline acceptance part of Definition of
Done. Implementation, migrations, fixtures, focused automation, builds, quality evaluation, five-door live
API journeys, same-subject first-three-block captures, registered PLAN/RENDER traces, failure drills, and
dashboard/database reconciliation are complete. The Browser skill was selected, but its required
`mcp__node_repl__js` page-control bridge was not exposed in this task; the skill forbids substituting a
standalone browser driver. A browser tab could be queued in Codex, but it could not be inspected or captured.

## Entry gate and scope

The build spec, AI routing guide, Stage 7 handoff, and Stage 8 prompt were read in full. The Stage 7 focused
schema/service/component gate passed (7 schema and 13 focused API/student checks represented by the Stage 7
handoff suites). A fresh browser walkthrough of propose/edit/select/save and spaced review could not be
performed for the same browser-runtime limitation above; it remains a human acceptance prerequisite.

Stage 8 adds five native entry points into the existing Petros teaching engine:

1. `result_repair` from an eligible published low result → Repair, `flat_practical`.
2. `upcoming_exam` from Exams and Calendar → Revise, `calm_focused`.
3. `uploaded_document` from Materials → Learn, `curious_grounded`.
4. `learning_path` from the current evidence-gated path item → Learn, `progressive_supportive`.
5. `assistant_handoff` from the contextual assistant → Doubt, `responsive_neutral`, only after explicit acceptance.

No photo/voice mode or generic student chat destination was added. All five paths create the existing
`petros_learning_sessions` session through the shared loop service. The session page consumes a verified
session ID, not client-authored marks, syllabus, citations, path state, or permissions.

## Intent architecture

`petros.session-intent.v1` is a versioned Zod contract with bounded door, session-type, emotional
register, and accessibility values. It carries server-derived owner/permission context, goal, topics,
scope limits, curriculum/source grounding, time budget/deadline, known evidence gaps, exact citations,
language/accessibility preferences, return route, disclosures, schema version, correlation ID, source
fingerprint, expiry, and idempotency key.

The central resolver has one adapter per door. Student identity is derived from the authenticated
institutional principal. Result, exam/class, document/page, and path lookups include owner/institution
constraints; a missing and an unauthorized object return the same `PETROS_INTENT_SOURCE_NOT_FOUND` 404.
Only published results and scheduled/published/current exam schedules qualify. Document teaching requires
ready extraction and indexing. Path resolution accepts only the next current item with completed
prerequisites. Assistant screen context is route-bounded and deliberately small.

Preview creates an expiring intent and emits one idempotent `impression`. Start reloads the source,
compares the fingerprint, invalidates stale previews, and creates at most one shared-engine session. The
loop records door/register factors in the first PLAN input and tags every registered gateway call with
`door` and `sessionType`. Result Repair suppresses the cheerful hook; exam Revise adjusts move weighting;
documents retain page/section grounding. Opening a path session never completes a path item; only qualifying
learner evidence (the existing evaluation-credit threshold) can do so.

The result UI only shows “See what to fix” below 70%. Exam doors appear only for genuinely upcoming items.
Materials displays extraction/error state and never substitutes unextracted content. Every door first shows
a preview with source/scope, time, policy, citations, and explicit Start. The contextual assistant answers
small questions inline and presents a described offer for deep work; it does not create a session until
acceptance. The return route is persisted and the session emits `returned` when used.

## Persistence and APIs

Migration `0195_petros_session_intents.sql` adds:

- `petros_session_intents`: owner-scoped verified intent, fingerprint, source IDs, resolved contract,
  lifecycle, session link, expiry, correlation, and unique owner/idempotency receipt.
- `petros_door_events`: content-free, owner-scoped lifecycle metrics with unique owner/idempotency receipt.

Both tables have forced RLS and owner-private institution/student policies. The migrated development
database was inspected: RLS and force-RLS are enabled on both tables and the policies exist. Resolver
failures are written through the maintenance database connection so their content-free failure telemetry
survives the student request transaction rollback.

Student APIs (all require `student.learn.use` and derive the student from authentication):

- `POST /student/petros/intents/resolve`
- `GET /student/petros/intents/:intentId`
- `POST /student/petros/intents/:intentId/start`
- `POST /student/petros/intents/:intentId/events`
- `POST /student/petros/assistant`
- `GET /student/petros/sources`
- `GET /student/petros/path`

Direct `POST /student/petros/sessions` is retained for non-contextual starts but rejects contextual doors
unless they originate from a verified intent. Authorized operational APIs are
`GET /petros-doors/dashboard` and `GET /petros-ai-routing/usage?door=...&sessionType=...`.

## Primary implementation files

- Contract/tests: `packages/schemas/src/petros-session-intent.ts`,
  `packages/schemas/src/petros-session-intent.spec.ts`
- Schema/migration: `packages/database/src/schema/petros-session-intent.ts`,
  `packages/database/migrations/0195_petros_session_intents.sql`
- Resolver/API: `apps/api/src/modules/student/petros-session-intent/`
- Shared-engine policy and metrics: `apps/api/src/modules/student/petros-loop/`
- Student preview/start component: `apps/student-web/src/components/petros/petros-door-button.tsx`
- Context assistant: `apps/student-web/src/components/petros/petros-context-assistant.tsx`
- Student surfaces: `apps/student-web/src/app/(app)/results/page.tsx`,
  `exams/page.tsx`, `calendar/page.tsx`, `materials/page.tsx`, and `learning-path/page.tsx`
- Doors dashboard: `apps/super-admin-web/src/app/(app)/ai/petros-doors/page.tsx`
- Development fixtures: `scripts/dev/seed/student-portal-demo.ts`, `scripts/dev/seed/operations.ts`
- Zero-cost, local-only registered gateway acceptance adapter:
  `apps/api/scripts/petros-stage8-mock-provider.ts`

## Executed verification

### Migrations, fixtures, and quality

- `pnpm db:seed` — passed; seeded result, exam, ready/pending documents, and learning path.
- `pnpm --filter @edrion/database migrate` — passed; migration 0195 applied.
- `pnpm --dir packages/learn-evals exec tsx src/cli.ts run --suite smoke --mode fixture --baseline baseline/petros-stage5-smoke.json --run-id petros-stage8-contextual-doors-v2 --label "Stage 8 contextual doors final" --out-dir eval-runs/petros-quality --seed 42`
  — 16/16 cases passed, quality gate passed, no warnings/blockers, zero provider cost.
- Reports: `packages/learn-evals/eval-runs/petros-quality/petros-stage8-contextual-doors-v2.json`,
  `.md`, and `.csv`.

### Typechecks, focused tests, and builds

- `pnpm --filter @edrion/schemas typecheck && pnpm --filter @edrion/database typecheck && pnpm --filter @edrion/api-client typecheck && pnpm --filter @edrion/api typecheck && pnpm --filter @edrion/student-web typecheck && pnpm --filter @edrion/super-admin-web typecheck`
  — all six passed.
- `pnpm --dir packages/schemas exec vitest run src/petros-session-intent.spec.ts src/petros-artifacts.spec.ts`
  — 2 files, 14/14 passed.
- `pnpm --dir apps/api exec vitest run src/modules/student/petros-session-intent/petros-session-intent.service.spec.ts src/modules/student/petros-loop/petros-observation.policy.spec.ts src/modules/student/petros-loop/petros-loop.service.spec.ts src/modules/student/petros-loop/petros-loop.policy.spec.ts src/modules/student/petros-artifacts/petros-artifacts.service.spec.ts`
  — 5 files, 55/55 passed.
- `pnpm --dir apps/student-web exec vitest run src/components/petros/petros-context-entry.spec.tsx`
  — 1 file, 3/3 passed.
- `pnpm --filter @edrion/api build` — passed.
- `pnpm --filter @edrion/student-web build` — passed, 33 routes including `/learning-path` and
  `/petros/session`; one pre-existing ambiguous Tailwind arbitrary-value warning.
- `pnpm --filter @edrion/super-admin-web build` — passed, 34 routes including `/ai/petros-doors`.

The package-wide schema run also completed 321 tests but reported two unrelated pre-existing failures in
`src/student/exam-questions.spec.ts` (quick-check pause and a duration expectation). They are outside the
Stage 8 diff and were already documented in the earlier baseline. Standalone API lint could not start
because that workspace has no `eslint` binary. The Next workspaces have no committed lint configuration,
so `next lint` opens an interactive setup prompt; no config was generated. Both Next production builds
did perform their integrated type-validity checks successfully.

## Live API/database evidence

Development principal: institution `27284a40-1166-4b73-aafc-f9906f468f73`, student
`88ab5c8e-c136-4b2d-9a08-46f7d5f74668` (Aarav). The live health endpoint returned 200.

### Five registered first-PLAN journeys

A local, OpenAI-compatible QA adapter used the real deterministic PLAN/RENDER policy through the registered
gateway. It made no external calls and had zero pricing. It existed to validate routing, schemas, retries,
usage, latency, and trace linkage without raising or bypassing the nearly exhausted external-provider budget.
The QA provider and all 19 routes were paused/disabled after the run; its usage evidence remains.

| Door | Intent / intent correlation | Session | First block / block correlation | Registered result |
| --- | --- | --- | --- | --- |
| Result Repair | `7160c967-2b3f-434a-ad5b-05a5ae083cd8` / `e3ad89c2-d488-47f0-81b3-60bedba009e3` | `0b6bc1de-7048-4b1a-a079-0860887453a6` | `96189a4a-5241-4823-a1c6-aa4732743c40` / `d539216b-ccc2-4994-8922-e9bef73840fd` | `recall_check`, delivery `ai`, `teaching.next_action.select` + `teaching.move.recall_check.render`, practical/no-hook rationale |
| Upcoming exam | `cd2b9d2b-cec5-4116-9205-045b29661b8f` / `61dcd9c4-7fbe-4490-87cc-f106c11eeaa3` | `e09fc0e3-b96f-46af-9968-7fad4df40e86` | `c8b67b41-d8b4-4a0b-98e0-c3df3c747e5c` / `4875fb8c-3c17-41c8-8dc1-4d52adceb1f4` | `recall_check`, delivery `ai`, calm exam-shaped retrieval rationale |
| Uploaded document | `659e73cc-1146-4f59-97ea-6e7f699cebd1` / `66309814-6a93-4ab6-8c94-8a125dc1c70c` | `68268661-c2c5-49b3-9727-4145a72e0a27` | `43f29bf8-8ff0-4229-98de-6b8973c233dd` / `97323fc1-c563-4644-94bc-53c17f23d94f` | `layered_explanation`, delivery `ai`, selected-page grounding rationale |
| Learning path | `9492e719-708c-44d0-9763-9793d74611b3` / `ec0ea762-073f-4488-90e5-ce5b135509a6` | `d2ec010a-d927-4abe-a3e3-2a036824819d` | `92e31f66-2091-4435-9146-30fec17d0682` / `83aab89b-6f07-44bd-9e9c-2b8ce49bf18c` | `recall_check`, delivery `ai`, evidence-gated/no-open-completion rationale |
| Assistant handoff | `35fe4528-2b7c-4e2d-9718-1ed4099410c0` / `4d42d1cb-5757-42e8-b66b-8567c9e7e79e` | `605d03b7-e2e7-4768-84f0-6cf961bc8900` | `aa9cc35c-2e6d-4905-82ec-0b798b089953` / `7f1f0d54-9613-41ad-940d-999aa592849a` | `layered_explanation`, delivery `ai`, accepted-question/direct-explanation rationale |

The registered run recorded 10 successful requests (PLAN + RENDER for every door), all with
`door`/`sessionType`, cache `miss`, fallback tier 0, and total cost 0 micros. An initial malformed QA-adapter
envelope was intentionally retained as real safety evidence: authoritative response validation rejected 25
attempts across the five journeys, PLAN retried once, RENDER retried twice, and every student session received
a typed `deterministic_fallback` block. After the envelope fix, all ten calls validated and delivered as `ai`.
No production credentials or provider budget were used.

### Same-subject first-three-block capture

All sources were aligned to Mathematics and a 15-minute budget. The retained runs are closed and have 15
blocks plus decision reasons in the database:

| Door | Intent / session | Moves 1–3 | Observed distinction |
| --- | --- | --- | --- |
| Result Repair | `ea5a660f-8498-4859-8147-2e28f3d6c7e8` / `5d867afa-fbfe-4975-869a-e94804db9b4f` | recall, predict/reveal, recall | every reason cites published loss, specificity, practicality, and no cheerful hook |
| Upcoming exam | `13fa8aef-2105-4f17-af47-0d3ff63ee6d3` / `66a779e8-08bc-4cbf-bc14-60b426cdb4b6` | recall, contrast, recall | every reason cites calm exam-shaped retrieval |
| Uploaded document | `07840978-9034-4c25-9629-acbdb9f0440a` / `17ef3f2b-8202-4beb-aaf5-b084059893d1` | layered explanation, predict/reveal, recall | page 2 is the exact source; later reasons remain citation-grounded |
| Learning path | `6215e9b8-8791-46cc-8a4c-5a742961a2f5` / `8f37319c-0845-48ae-b8ee-8f5aa8ef2612` | recall, predict/reveal, recall | reasons cite current evidence-gated node and never infer completion from open |
| Assistant handoff | `48045017-d521-478d-84ed-b6ac9f45fb4f` / `891c6e7f-bff8-4430-85e6-8eb5e715a51a` | layered explanation, recall, layered explanation | reasons cite the accepted visible-screen question as a direct continuation |

This is complete machine evidence, not the prompt-required blinded human review or screenshots.

### Source, privacy, lifecycle, and dashboard drills

- Result `4b5138b6-54cc-4c8d-9bdf-faf118304968` resolved exact 41/100 and the preserved teacher remark.
  The row was not mutated.
- Exam schedule `199bd54b-46c8-4474-8b1d-02cac130b341` was previewed, changed, rejected on start with
  409 `PETROS_INTENT_STALE`, and restored.
- Ready Mathematics document `5659b909-4133-4ec2-a116-0e3f6f1939f4`, page 2, grounded the exact text about
  isolating the unknown and checking by substitution. Pending document
  `7616f102-0049-454c-834d-0306e17542c1` returned 409. Deleted, ownership-changed, out-of-range page 99,
  nonexistent, and cross-student reads all returned uniform 404 `PETROS_INTENT_SOURCE_NOT_FOUND`.
- A temporary second institution/user/student was used for foreign result, document, and path resolution;
  all returned the same uniform 404 without titles, marks, page counts, owner, or tenant details. The fixture
  institution was then removed by its test cleanup.
- Path `a542254b-3e83-4439-8b26-2f248acd72db` was opened/abandoned without completion, then separately
  advanced only after qualifying evaluation evidence. The repeatable fixture was reset afterward and ends
  with Mathematics current, no `completedAt`, version 3; later nodes remain upcoming.
- One real artifact commit is linked to contextual document session
  `f11fd8c0-bedd-4662-9a7d-7facd6839b18`: bundle
  `492762e0-a988-4953-8321-79b79c5cb469`, proposal
  `7eb421f7-3271-444d-9880-b08140702679`, saved artifact
  `23dfb761-1ef9-479f-93da-839931f41612`.
- The assistant answered the small visible-result question inline, offered the deep session explicitly, and
  did not create a session until acceptance. Authorized topic/curriculum/citation label and a hashed source
  version transfer to the handoff; no generic chat history becomes learner memory.
- Repeated starts reused the same session. Returned, paused, abandoned, completed, and artifact-saved events
  are content-free and idempotent.
- Forced RLS is enabled on `petros_session_intents` and `petros_door_events`; their owner-private policies
  constrain institution and student together.

The final authorized dashboard response was `privacy=aggregate_only`, `contentExposed=false`, with
first-content latency average 346 ms/max 6796.312 ms, 35 local-QA attempts, and 0 micros. It included
completion, pause, abandon, artifact, return, assistant offered/accepted, all five register buckets, and
initial-move distributions. Its failure list is now restricted to actual `failure` events; after the final
page-99 drill the content-free database totals are one extraction-pending, one stale, and seven uniform
missing/unauthorized failures. `grounding.documentFailures=1` tracks extraction failure separately and
`policy` explicitly disables conversion rankings and manipulative re-engagement.

Dashboard read audit `b028221b-b9cb-4c72-9f08-85c5014f8dd9` records success, aggregate entity scope, the
institution filter, correlation/request IDs, and 32 aggregate buckets—no learner content. The routing usage
API filtered `result_repair` + `repair` successfully and reconciled two successful requests, five rejected
attempts from the earlier envelope defect, zero cache hits/fallback tiers, zero cost, and function-level
breakdown.

## Mandatory manual QA and dashboard acceptance runbook

The runbook below distinguishes retained live API IDs from browser evidence still required. Use the Aarav
fixture above unless a row says otherwise. Retain screenshots with visible source/scope but no tokens,
cookies, provider details, or another learner's content.

### 1. Bad result

- Navigation/setup: sign in as Aarav → `/results`; open grade entry
  `4b5138b6-54cc-4c8d-9bdf-faf118304968` (“Petros Repair Check — Mathematics”, 41/100).
- Actions: record the published mark/remark; select “See what to fix”; inspect preview; Start; capture the
  first three blocks; Return; re-read the result.
- Expected frontend: exact 41/100, flat practical copy, estimated time and first step, honest statement
  that question-level evidence is unavailable, no hook/shame/ability label, teacher feedback preserved.
- Expected API/DB/dashboard: one owner intent and one shared session; fingerprint includes the published
  result version; impression/start/return exactly once; first PLAN factors identify
  `result_repair`/Repair/`flat_practical`; result row is byte-for-byte unchanged.
- Fail if: ineligible/high/unpublished result shows the door, marks/feedback mutate, source is invented,
  cheerful hook appears, or double tap creates a second session.
- Retain: result-before/preview/first-three-blocks/result-after screenshots, intent/session/correlation IDs,
  dashboard row, and a DB diff or timestamp proving no result mutation. Live IDs are in the evidence table;
  all API/DB/block evidence is retained; browser screenshots remain pending.

### 2. Upcoming exam

- Navigation/setup: `/exams` and `/calendar`; schedule
  `199bd54b-46c8-4474-8b1d-02cac130b341` must be scheduled, published, upcoming, and in Aarav's class.
- Actions: start once from Exams and once inspect Calendar context; verify preview date/syllabus/time; Start;
  perform an exam-shaped check; Return. Then change/cancel the schedule in an admin fixture and try the old
  preview.
- Expected frontend: calm Revise language, exact published date/syllabus, recall/contrast/synthesis and
  exam-shaped emphasis, no fake urgency, safe `/exams` or `/calendar` return.
- Expected API/DB/dashboard: one session for repeated start; source fingerprint invalidates after schedule
  mutation; old/cancelled schedule cannot start; PLAN dimensions show `upcoming_exam`/Revise and mixed-topic
  rationale; return recorded once.
- Fail if: stale/cancelled/past/wrong-class exam starts, client date overrides server date, or urgency pressure
  appears.
- Retain: both surface previews, first three blocks, stale error, return screenshot, source version,
  intent/session/correlation, dashboard and routing-filter evidence. Live start/return, three blocks, and the
  schedule-mutation stale drill are retained; browser screenshots remain pending.

### 3. Uploaded document

- Navigation/setup: `/materials`; ready item `c5b07c47-e699-419d-b7f7-fae6b166d985`; select page 2 and
  “Light-dependent reactions”. Pending item `7616f102-0049-454c-834d-0306e17542c1` is 4/12 pages.
- Actions: “Teach me this” → choose page/section → Start → compare every source reference to the seeded
  page. Repeat with pending item, a deleted copy, and the same item as student
  `a1d38e7d-dca3-442d-ba59-0e3dce7ebbb6`; try a nonexistent/out-of-range page.
- Expected frontend: exact title/page/section/excerpt, extraction wait/retry state, and indistinguishable
  missing/unauthorized fallback without leaked metadata.
- Expected API/DB/dashboard: authorized page IDs only; pending returns 409; missing/deleted/restricted returns
  uniform 404; document failure counts rise without storing page text; routing has document door dimensions.
- Fail if: unextracted content is taught, citation page differs, restricted title/page count leaks, or raw file
  content enters operational events.
- Retain: ready preview/citation/block screenshots, pending and uniform-404 screens, item/page versions,
  intent/session/correlation and aggregate failure deltas. Ready/pending/deleted/restricted/out-of-range,
  cross-student, and cross-institution API results are retained; browser screenshots remain pending.

### 4. Learning path

- Navigation/setup: `/learning-path`; path `a542254b-3e83-4439-8b26-2f248acd72db`, current item
  `ef47dc2b-fa64-4e9e-b944-b2dd25f9648b`.
- Actions: capture path state; open/abandon once and confirm no completion; resume/complete another copied
  fixture with sufficient demonstrated evaluation evidence; Return.
- Expected frontend: adaptive preview for next current node with prerequisites/why-here; abandonment remains
  current; demonstrated completion updates status and exposes the next useful action.
- Expected API/DB/dashboard: opening emits impression/start but no path-complete mutation; only qualifying
  evidence advances the node; abandon/complete/return aggregates reconcile by intent and session.
- Fail if: open alone completes the node, a locked/later node starts, incomplete prerequisite is ignored, or
  return loses path position.
- Retain: before/open/abandon/evidence/after/return screenshots, path item version/evidence event,
  intent/session/correlation and dashboard deltas. Open/no-completion, qualifying demonstrated-completion,
  abandon, reset-for-repeatability, and aggregate evidence are retained; browser screenshots remain pending.

### 5. Embedded assistant handoff

- Navigation/setup: any supported surface, preferably `/results` with the low result visible; open the
  summonable assistant.
- Actions: ask “What mark is shown?”; ask a deeper step-by-step repair question; decline the first offer;
  repeat with a fresh idempotency key; accept once; verify the session already knows the question/context.
- Expected frontend: first response stays inline; deep response describes scope/time before offering;
  decline creates no session; accept is explicit and does not request repetition; no standalone chat page or
  provider/model label.
- Expected API/DB/dashboard: quick answer has no intent/session; offer event only for deep question; accepted
  event/start exactly once; structured screen context, not generic chat history, enters the verified intent.
- Fail if: small question silently starts, decline creates anything, repeated accept duplicates, invisible
  context is captured, or question becomes permanent learner memory.
- Retain: inline answer, offer, declined state, accepted preview/session header screenshots,
  intent/session/correlation and offered/accepted dashboard delta. Live quick/offer/accept API behavior is
  retained; decline/browser capture remains pending.

### 6. Same-subject tone comparison

- Navigation/setup: prepare all five sources around one broad subject (the seeded fixtures must be cloned or
  adjusted so result, exam, document, path, and assistant all cover the same subject).
- Actions: start each with an equivalent 15-minute budget; capture blocks 1–3 before answering; conduct a
  blinded human review.
- Expected: Repair is flat/specific and starts from observed loss; Revise is calm/exam-shaped; document Learn
  is curious and page-grounded; path Learn is progressive/prerequisite-aware; Doubt responds directly to the
  transferred question. They must not be a shared template with labels swapped.
- API/dashboard: each first PLAN trace cites its resolved register/scope factors; model/function usage is
  registered to the matching door/session type.
- Fail if: tone, goal, source, or initial move is indistinguishable; any block invents evidence; reviewer
  cannot identify the intended door above chance.
- Retain: 15 numbered block screenshots, five PLAN decision traces, blinded rubric and reviewer sign-off.
  The 15 database blocks and five registered PLAN decision traces are retained. Screenshot capture and an
  independent blinded human reviewer/sign-off remain pending.

### 7. Refresh, double tap, and resume

- Navigation/setup: use each preview and throttle the network.
- Actions: double-click Start, refresh while resolve/start is in flight, close/reopen the route, resume the
  session, and Return twice.
- Expected frontend: disabled/loading affordance, stable preview after refresh, one session, recoverable slow
  or offline message, and preserved safe return.
- API/DB/dashboard: owner/idempotency uniqueness leaves one intent/session/start/return; source fingerprint is
  unchanged or an explicit stale error is shown.
- Fail if: duplicate sessions/events, blank route, unsafe redirect, stale source starts, or offline replay
  changes scope.
- Retain: network timeline, refresh/resume screenshots, duplicate-query result, IDs and aggregate counts.
  Repeated API starts are retained and reused the same five sessions; browser refresh/offline evidence remains
  pending.

### 8. Doors dashboard reconciliation

- Navigation/setup: Super Admin → AI → Petros Doors, with `ai.view`; filter the time range around the five
  journeys.
- Actions: reconcile raw content-free events by intent/correlation against aggregates; then complete one,
  pause/abandon one, save one artifact, return all, and trigger controlled pending/stale failures.
- Expected frontend: impressions, starts, completion, pause/abandon, artifact, return, failure, latency/cost,
  scope/register/initial-move, assistant offered/accepted, and document failures; no conversion ranking.
- API/DB: aggregate only and audited; `privacy=aggregate_only`, `contentExposed=false`; unique events prevent
  double counts.
- Fail if: learner content/excerpts are exposed, totals do not reconcile, failure rollback loses telemetry,
  or dashboard promotes engagement pressure.
- Retain: filter state, aggregate screenshots, audited read ID, redacted event query and reconciliation sheet.
  Live completion/artifact/pause/abandon/return/failure counts, audited read, and redacted event
  reconciliation are documented above; browser dashboard screenshots remain pending.

### 9. AI Routing dashboard

- Navigation/setup: Super Admin → AI Routing → Usage; select each door and session type; use a budgeted QA
  provider/rule, never production credentials.
- Actions: run one permitted session per door, filter usage, open decision trace by session/correlation, and
  reconcile registered functions, cost, latency, cache, validation, retry, and fallback.
- Expected: filters compose and traces show registered function IDs and door/session dimensions; provider
  details remain absent from student UI.
- API/DB: `/petros-ai-routing/usage` accepts `door` and `sessionType`; gateway metadata carries both on all
  loop calls.
- Fail if: unregistered/direct provider call, missing dimensions, provider detail leaks to students, or cost
  cannot reconcile.
- Retain: routing filter screenshots, function trace, usage row and budget snapshot. Live filter API returned
  200 and nonzero PLAN/RENDER requests, functions, latency, cache misses, schema validation, retries, safe
  fallback, and zero cost reconcile. Browser routing-dashboard screenshots remain pending.

### 10. Privacy and tenant isolation

- Navigation/setup: student `a1d38e7d-dca3-442d-ba59-0e3dce7ebbb6`, plus a principal from another
  institution; use Aarav's result/document/path IDs.
- Actions: resolve, read intent, start, fetch session, and submit metric calls against foreign IDs; inspect
  application audit and content-free failure telemetry.
- Expected frontend/API: uniform 404/403 without confirming type, title, mark, page count, owner, or tenant;
  no foreign intent/session access.
- DB/dashboard: forced RLS blocks direct scoped reads/writes; failure row contains stable code/IDs only and
  survives rollback; authorized dashboard remains aggregate-only.
- Fail if: response shape/timing/message reveals existence, any foreign record is returned/mutated, or event
  payload includes source content.
- Retain: redacted response matrix, RLS/policy query, audit/failure IDs. Live same-institution cross-student
  result/document and temporary cross-institution result/document/path attempts returned uniform 404; forced
  RLS, content-free failure rows, and the aggregate dashboard audit were inspected. Browser response captures
  and an access-denial-specific platform audit remain pending.

### 11. Responsive and accessibility

- Navigation/setup: all five doors and assistant at 360 px mobile and desktop, browser zoom 200% and 400%,
  OS reduced motion, keyboard only, screen reader, slow 3G, offline, and a stale-page resume.
- Actions: traverse preview fields, modal, Start/Cancel, citation links, session header, assistant offer,
  errors, resume, and Return without pointer input.
- Expected: logical focus order/trap/restore, visible focus, labelled controls, announced errors/status,
  readable reflow, no hover-only action, reduced animation, no duplicate submission, honest network recovery.
- API/dashboard: retry preserves idempotency; accessibility preferences pass as bounded intent values without
  becoming a diagnosis or analytics segment.
- Fail if: clipped/overlapped text, inaccessible modal, focus loss, silent error, motion ignores preference,
  offline creates duplicates, or source context changes on resume.
- Retain: mobile/desktop/zoom screenshots, keyboard recording, screen-reader transcript, reduced-motion and
  network traces, Axe/manual checklist. Entire visual/assistive case remains pending.

## Limitations and Stage 9 prerequisites

1. Complete the remaining human/browser items: Stage 7 visual re-acceptance, screenshots for the five
   journeys and both dashboards, blinded tone-review sign-off, browser refresh/double-click/offline behavior,
   and the responsive/keyboard/screen-reader/zoom/reduced-motion/slow-network matrix. The Browser skill's
   required page-control bridge was not exposed, and its instructions prohibit substituting a standalone
   browser driver.
2. Keep the external provider budget unchanged. The local registered QA provider proved nonzero
   PLAN/RENDER routing and is now paused/disabled with zero enabled routes; re-enable it only for deliberate
   local acceptance while its server is running.
3. Keep `petros.session-intent.v1`, server-side source adapters, fingerprint revalidation,
   idempotency, uniform missing/unauthorized responses, and content-free events as the Stage 9 entry boundary.
4. Do not add photo/voice until the Stage 8 manual acceptance is signed. Stage 9 inputs must resolve into the
   same verified intent/session engine and must not weaken document scanning, copyright, privacy, or explicit
   assistant handoff rules.

**Stage 8 not complete.**
