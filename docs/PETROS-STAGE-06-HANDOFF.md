# Petros Stage 6 handoff

Date: 2026-08-10  
Branch: `new-student-UI`  
Status: **Stage 6 complete**

The structured learner model and its hard-blocker acceptance path are complete. Two seeded learners
with different histories receive different, evidence-linked PLAN decisions on the same topic; the
model is versioned, replayable, uncertainty-aware, tenant-scoped, and bounded before PLAN; and a
current-session override beats the inferred preference without changing the durable model. Durable
assessment sources now publish after their source commit, a restricted support role is denied,
arithmetic and concept errors produce different remedies, and stale/degraded learner-facing paths
remain explicit and safe.

## Delivered scope

- A canonical, versioned evidence envelope normalizes library quizzes, mock exams, exams,
  assignments, homework, and Petros session observations. Active exam, assignment, and homework
  completion/grade paths publish automatically after their durable source write. An audited,
  idempotent source-sync endpoint reconciles all five durable stores, including legacy quiz/mock
  rows whose former UI modules are not present in this worktree.
- Immutable learner evidence is separated from derived summaries. Rebuild jobs replay evidence in a
  transaction and record input/output hashes, progress, retry, cancellation, rollback target, and
  audit metadata.
- Derived state covers concept mastery, contextual move outcomes, inferred pace/depth, error
  fingerprints and remedies, and the full confidence × correctness calibration matrix.
- PLAN receives a size-bounded learner snapshot on every decision. The exact snapshot and causal
  factors used for each PLAN call are persisted for later reconciliation.
- The policy uses only sufficiently supported, non-stale facts. It adjusts move weights, remedies,
  prerequisite handling, depth, and pace; neutral or stale models fall back to topic-profile
  behavior.
- Student session controls remain authoritative. A “simpler”/“deeper” choice changes the active
  session immediately but does not become a durable preference after one click.
- The Super Admin learner-model dashboard exposes redacted learner references, model versions,
  evidence counts and recency, uncertainty, decisions, causal factors, jobs, quarantine, recompute,
  export, deletion, source reconciliation, exact source event/record linkage, and
  retention/transfer guidance.
- Service-layer scope validation rejects an institution/student pair that does not exist before any
  learner-model read or mutation, in addition to controller permissions and database RLS.
- Synthetic/evaluation evidence is rejected before persistence. Failed normalization is quarantined
  without updating summaries.
- The Stage 5 harness includes a deliberate `personalization_ignored` mutation.

## Data and algorithm design

The canonical contracts are versioned as:

- `petros.learner-evidence.v1`
- `petros.learner-model.stage6.v1`
- `petros.learner-snapshot.v1`

Mastery is stored as integer basis points (`0..10000`) with evidence count, effective weight,
uncertainty, last-observed time, and contributing evidence IDs. Evidence weight decays with a
90-day half-life. Sparse evidence remains uncertain and is excluded from personalization until the
minimum-evidence threshold is met.

Move outcomes are contextual by topic/profile and track success, failure, partial, skip, expansion,
and read observations. Error fingerprints remain bounded categories with counts, recency, remedies,
and source IDs. Calibration stores all nine confidence/correctness combinations. Pace/depth are
inferred from repeated behavior while the session override is kept separately and wins during PLAN.

The learner snapshot contains only planning facts: no free-form hidden profile, sensitive traits,
raw answers, provider details, or cross-tenant identifiers. Causal factors name the bounded fact,
support, uncertainty, and evidence IDs used by the decision.

## Migrations and jobs

Migration `0192_petros_learner_model.sql` adds:

- immutable evidence and quarantine tables;
- mastery, move-outcome, preference, error-fingerprint, and calibration summaries;
- exact PLAN snapshot records;
- learner-model rebuild/import job records;
- uniqueness constraints for source-event idempotency, indexes, grants, and tenant RLS.

The migration applied successfully to the local database. The development seed created Aarav A,
Bella B, their evidence histories, and two rebuild jobs. A separate recompute for Aarav replayed 12
events and reproduced the exact model hash:

`6595216a62d53500bddaa060d1f5ae6101bcec5da641ecd542589b298f8e32ba`

## Acceptance fixtures and evidence

Institution: Greenwood High, `27284a40-1166-4b73-aafc-f9906f468f73`.

- Aarav A: `88ab5c8e-c136-4b2d-9a08-46f7d5f74668`
  - eight stronger diagram outcomes, fragile confidence, concept/prerequisite errors, deep preference;
  - session `8da9a337-47ad-4dea-b714-5c2e9d8a8e1f`;
  - first personalized post-prerequisite decision `22e91a36-0821-4b53-abf9-0fa5bb363c26` selected
    `goal_frame`;
  - session-only “simpler” changed active depth to `concise` while durable depth remained `deep`.
- Bella B: `a1d38e7d-dca3-442d-ba59-0e3dce7ebbb6`
  - eight stronger worked-example outcomes, reliable confidence, procedural errors, concise
    preference;
  - session `872b20fc-e581-451b-947c-acd61db39e9b`;
  - first personalized post-prerequisite decision `a963009e-b09f-46be-bed4-aeed734947cd` selected
    `worked_example`;
  - “Why this?” stated that the move addressed prior procedural-method errors.
- Chen, disposable neutral fixture: `ebce3099-84a9-444d-80b8-cbc465787d24`
  - initial session `a9e784be-2769-4da6-8e8c-8a7d82791e93` showed a neutral model;
  - export returned three records, deletion removed all three, and the model returned to neutral;
  - one library-quiz import was accepted as evidence
    `dada7348-998f-4c9b-9800-42d8e815df4c`, replaying it returned the same ID with
    `duplicate=true`; the disposable record was then deleted.
  - three controlled arithmetic-slip events were accepted as
    `f1a11cd7-3421-472c-98a7-9c8087f43a39`,
    `4472759f-16d1-4466-b4d5-ce3e6bcd2546`, and
    `34b4d481-6c7b-4fd5-b9c9-ca50010d8320`;
  - same-topic session `98ce07e5-0286-4052-b2a1-6b60910e3fa7` selected a compact
    `worked_example` with arithmetic checks, while Aarav session
    `75d2bf45-e424-421e-9c05-6ed039157a51` selected `goal_frame` for concept/prerequisite repair;
  - controlled stale session `2a53fd1b-9de7-49f9-bf61-2b680c88f4d6` used
    `stale_fallback`; rebuild job `c42b9154-da52-4259-9674-3960070ed79f` replayed 6/6 events, and
    follow-up session `9d36f431-8181-4bc4-81ad-ae684cf5783f` returned to `history_informed`.

Real assignment-grade source evidence for Aarav:

- source submission/event `c2eca64c-65e4-4bd8-a6f1-f37b138e3e79` produced immutable evidence
  `39be98cc-0db4-4d7d-94c2-55e94d49a8cb` at 8000 basis points (`partial`);
- grading the same source row again left the assignment-evidence count unchanged;
- earlier source submission `76b00383-6fa2-43f5-8ff7-3491def4844b` produced evidence
  `974da837-7f48-4eb6-ae8b-b37b8884504a` at 8667 basis points.

Seed rebuild jobs:

- Aarav: `b3e1856c-fe4b-4189-ae7b-5eef7e933c56`, completed 12/12.
- Bella: `3c365e27-7ffa-4bc9-9cd7-0555dc94f814`, completed 14/14.
- Aarav reproducibility run: `79956c13-d914-4a96-9f21-58e27d141758`, completed 12/12 with identical
  before/after hashes.

Representative bounded evidence IDs used by Aarav decisions include
`9b87b56c-3b72-4724-86ca-e191b14dc2d0`, `e8012301-732f-4a0a-a934-708b1f6b0b61`,
`c0952b27-0909-4b96-b2d7-796b9a0df605`, `dc32e12a-263b-46a0-a2d2-b90cf5f0dbd8`, and
`b4664dcd-cad1-4d62-90e8-6bb893afa1a2`.

## Automated verification

- Six-package typecheck chain — API, database, schemas, API client, Super Admin, and student web all
  passed after the hard-blocker changes.
- Targeted API learner-model/source-ingestion/authorization/policy/loop suite — 7 files, 53 tests
  passed.
- Student Petros UI suite — 1 file, 10 tests passed, including stale, offline, slow-request, and
  landmark behavior.
- Learn-evals quality harness — 1 file, 18 tests passed.
- Targeted Petros schemas — 16 tests passed.
- API production build — passed.
- Super Admin production build with `NEXT_PUBLIC_API_BASE_URL=http://localhost:3007` — passed.
- Student web production build with the same API base — passed.
- Database migration and development seed — passed.

Coverage includes five source normalizers, live durable-source delivery, duplicate idempotency,
delivery-failure isolation, authorization metadata, support-role denial, institution/student scope
validation, mastery/decay/replay, minimum-evidence protection, contextual move statistics, remedy
differences, all nine calibration cells, evaluation isolation, quarantine, neutral learners,
same-topic divergence, evidence-backed reasons, session overrides, reproducible rebuild,
transaction rollback, cancellation/retry, export, deletion, and safe learner-facing degraded paths.

Repository-wide schema tests reported 307 passing and two unrelated existing failures in
`src/student/exam-questions.spec.ts` around `quick_check` behavior. Package lint could not run because
the workspace cannot resolve an `eslint` executable. The normal repository Prettier invocation is
also blocked by a missing `prettier-plugin-tailwindcss`; a no-config check is not equivalent because
it reports the repository's existing style as divergent, so it is not counted as a passing gate.

## Quality-harness results

- Post-change fixture smoke:
  `packages/learn-evals/eval-runs/petros-quality/petros-quality-smoke-fixture-42-1786337835376.json`
  — 16/16 passed, `gate=pass`, zero blocking failures, zero warnings, zero provider cost.
- Deliberate `personalization_ignored` mutation:
  `packages/learn-evals/eval-runs/petros-quality/petros-quality-smoke-fixture-42-1786337840321.json`
  — all 16 sessions completed with `gate=warn` and seven aggregated explainability warnings. The harness caught the
  removed personalization reasons/factors, but this dimension is intentionally non-blocking.
- A pre-change fixture baseline also passed 16/16. A deliberate repetitive-moves candidate failed
  with four blocking repeated-struggle regressions, confirming the existing Stage 5 blocker still
  operates.

## Browser checks performed

- Opened `/ai/petros-learner-model` as the platform owner at desktop and 390×844 mobile dimensions.
  Verified redacted learner references, version/evidence/uncertainty summaries, move outcomes,
  preferences, errors, calibration, exact snapshots, causal factors, job state, quarantine,
  recompute confirmation, export, and retention/transfer copy.
- Opened Aarav and Bella student sessions at desktop; expanded “Why this?” and reconciled the reasons
  with their diagnostic evidence. Aarav was also inspected at mobile dimensions.
- Opened Chen's session and confirmed the neutral-model fallback banner.
- Re-ran the live learner session accessibility tree after replacing a nested component `<main>`
  with a neutral container: one `main`, one `h1`, ordered `h2` block headings, named buttons,
  textboxes/radio groups, a labelled progressbar, and no positive tab indexes. Representative
  “Why this?” and question controls showed a 3px visible focus outline.
- Ran macOS VoiceOver against the live session in Safari. VoiceOver's web overview announced eight
  links, three headings, 24 form controls, and five landmarks. Heading navigation reached the page
  title followed by “Check the foundation first” and “A finite target for this session”; control
  navigation announced the disclosure, action buttons, textarea, disabled submit button, and all
  three radio labels with selected/dimmed state and position. Activating “Why this?” changed it from
  collapsed to expanded and exposed the explanation and target content in reading order.
- Forced Chen's summaries beyond the stale-use threshold. The fresh live session displayed “Using a
  safe topic-first route” and explained that the model was being refreshed; after a six-event
  rebuild, the next fresh session returned to history-informed status.
- Verified the desktop and prior 390×844 responsive passes; the layout collapses to one column at
  840px and one-column controls at 620px with no fixed-width content column. Reduced-motion media
  rules disable block animations, progress transitions, layer transitions, and skeleton animation.
- Exercised degraded behavior in the UI suite: the saved document stays readable offline, a request
  exceeding four seconds announces that the current document is safe, and stale state remains
  neutral/explainable. The live provider-failure path also completed through a built-in teaching
  block without exposing provider details.
- Repeated the slow-path check with macOS PF/dummynet on `lo0`, scoped only to API port 3007 for
  IPv4 and IPv6. A 2,000 ms delay in each direction at 512 Kbit/s raised both API health routes to
  about 8.0 seconds. The session moved from saved-document loading to “Choosing the next teaching
  move,” announced the safe-document notice four seconds later, and recovered through built-in
  teaching blocks without provider details. The rules, pipes, and marker files were then removed;
  API health returned to about 0.002 seconds.

The semantic accessibility tree and Safari VoiceOver path both pass. OS-native network degradation
also passes with deterministic cleanup. The reduced-motion stylesheet was inspected and remains
covered by component/browser checks; an OS-level Reduce Motion toggle is still a prudent release
spot check, but it is not a Stage 7 blocker.

## Human QA and dashboard runbook

| #   | Check and exact navigation/command                                                                                                                        | Fixture and expected frontend                                                                                                   | Expected backend/database/dashboard records                                                                         | Failure criteria and evidence to capture                                                                                                                                               | Result                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Start equal topic/goal/time sessions through `/petros`, answer the shared prerequisite correctly, then expand “Why this?”                                 | Aarav and Bella above; Aarav should favor visual/goal framing and deeper treatment, Bella worked examples and concise treatment | Two PLAN rows contain different moves/weights and actual causal factors from each bounded snapshot                  | Same post-prerequisite move without a supported reason, random prose, or missing decision/evidence IDs; save both session and decision IDs                                             | **Passed**: `goal_frame` versus `worked_example`                                                                                                                                                                                    |
| 2   | Open `/ai/petros-learner-model`; select Aarav and Bella                                                                                                   | Counts, recency, uncertainty, errors, calibration, and exact snapshot explain the session differences                           | Snapshot version and evidence IDs reconcile to the PLAN decision rows                                               | UI reason absent from snapshot or unsupported by evidence; save learner panels and decision JSON                                                                                       | **Passed**                                                                                                                                                                                                                          |
| 3   | Start `/petros` as Chen before importing history                                                                                                          | Neutral banner; no invented pace/depth or move preference                                                                       | Empty summaries and a neutral bounded snapshot                                                                      | Personalized claim with zero support; save session and diagnostic snapshot                                                                                                             | **Passed**                                                                                                                                                                                                                          |
| 4   | In Aarav's session choose **Simpler** and refresh diagnostics                                                                                             | Current session becomes concise immediately; durable diagnostic remains deep                                                    | Session override is recorded separately and `durablePreferenceUpdated=false`                                        | Durable preference changes after one use or PLAN ignores the override; save before/after session JSON                                                                                  | **Passed**                                                                                                                                                                                                                          |
| 5   | Grade the seeded assignment through the portal API/UI, repeat the same grade, then run **Sync durable sources** in `/ai/petros-learner-model`             | Model updates once and shows exact source-event and source-record linkage                                                       | One immutable event for submission `c2eca64c-65e4-4bd8-a6f1-f37b138e3e79`; repeat and sync are duplicates           | Manual evidence construction is required, duplicate rows appear, or source linkage/credit is wrong; save source/evidence IDs and count query                                           | **Passed**: live assignment hook produced evidence `39be98cc-0db4-4d7d-94c2-55e94d49a8cb`; replay left the count unchanged; all five stores are covered by audited reconciliation                                                   |
| 6   | Seed three `arithmetic_slip` observations for Chen and compare the same-topic next action with Aarav's `concept_gap`/`prerequisite_gap` history           | Arithmetic receives a compact calculation check; concept gap receives explanation/prerequisite repair                           | Distinct error fingerprints, remedies, bounded snapshots, causal factors, decisions, and block types                | Same generic remedy or invented category; save evidence, snapshot, decision, session, and block IDs                                                                                    | **Passed**: Chen selected `worked_example` with short calculation checks; Aarav selected `goal_frame` for concept/prerequisite repair                                                                                               |
| 7   | Dashboard → learner → **Recompute learner model**, confirm, then compare hashes/jobs                                                                      | Progress completes and before/after summaries remain stable                                                                     | Raw evidence count/IDs unchanged; completed job has identical hashes and audited status                             | Evidence mutates, hash differs, or failure cannot retry/rollback; save job ID and both hashes                                                                                          | **Passed**: job `79956c13-d914-4a96-9f21-58e27d141758`                                                                                                                                                                              |
| 8   | Submit malformed normalized evidence, inspect quarantine/retry, and force teaching-provider unavailability                                                | Generic built-in teaching fallback; authorized dashboard shows quarantine/retry state                                           | Quarantine leaves summaries unchanged; deterministic source normalization creates no classifier-provider usage      | Corrupt summary, provider detail shown to learner, missing quarantine, or an unmetered AI call; save quarantine/job/hash records and learner fallback                                  | **Passed / classifier N/A**: malformed input quarantine, retry, rollback, and safe teaching fallback pass; source classification is intentionally deterministic, so no classifier provider exists to fail                           |
| 9   | Request another learner across student/institution boundaries; request diagnostics/sync as `support@edrion.dev`; export/delete a disposable fixture       | Denied identities see no model; authorized output stays redacted; disposable learner returns neutral after deletion             | Cross-student and mismatched tenant return 404; support read/mutation return 403; privileged operations are audited | Cross-tenant visibility, raw PII/provider details, or residual summaries; save status matrix, audit rows, export, and deletion receipt                                                 | **Passed**: cross-student 404, mismatched institution/student 404, support diagnostic 403 (`ai.view`), support sync 403 (`ai.configure`), owner operations and disposable export/delete pass                                        |
| 10  | Run `pnpm --filter @edrion/learn-evals run:smoke`; run safe `personalization_ignored` mutation; open `/ai/petros-quality`                                 | Normal candidate passes; mutation surfaces explainability degradation without correctness/stuck regression                      | Normal report is 16/16 pass; mutation records personalization warnings and no production writes                     | Critical regression, evaluation evidence enters learner models, or ignored personalization is invisible                                                                                | **Passed**; explainability mutation is warning-only by rubric design                                                                                                                                                                |
| 11  | Inspect session at desktop and 390×844; audit keyboard/screen-reader semantics and focus; inspect reduced-motion rules; exercise slow/offline/stale paths | Content fits, focus/order/labels are usable, motion is reduced, slow/stale paths remain neutral and explainable                 | One main landmark, labelled controls/progress, no provider leakage; stale snapshot is ignored by PLAN               | Trapped/invisible focus, unlabeled control, overflow, unsafe stale personalization, or provider error text; save screenshots, accessibility tree, tests, stale session and rebuild IDs | **Passed**: desktop/mobile layout, Safari VoiceOver headings/controls/states, natural focus order/outline, reduced-motion CSS, OS-native PF/dummynet slow recovery, offline component drills, and live stale/rebuild drill all pass |

## Privacy and retention checks

- Institution/student scope is required on repository reads and writes; RLS and controller guards are
  additive to application-level scoping.
- Diagnostic endpoints require `ai.view`; recompute/import/export/delete require `ai.configure` and
  recent authentication where appropriate.
- Reading Aarav's session as Bella returned `404 PETROS_SESSION_NOT_FOUND`.
- The seeded `support_administrator` (`support@edrion.dev`) deliberately lacks `ai.view` and
  `ai.configure`: diagnostic and source-sync calls returned 403. Owner diagnostic returned 200 and
  owner source sync returned 201.
- A real learner ID paired with a fake institution returned `404 PETROS_LEARNER_NOT_FOUND`; service
  tests also reject cross-institution scope before reading or mutating model state.
- Student-facing reasons expose bounded learning facts, not provider configuration, hidden prompts,
  raw answers, sensitive traits, or another learner's identifiers.
- Chen's original disposable data was exported and irreversibly deleted; post-delete diagnostics
  returned a neutral, zero-evidence model. Later controlled hard-blocker evidence remains as the
  documented arithmetic/stale fixture.

## Known limitations

1. The active worktree contains live student-exam and portal assignment/homework flows, all of which
   now publish automatically. The former library-quiz and mock-exam UI modules are absent from this
   worktree; their persisted tables are covered by the audited reconciliation endpoint until those
   product surfaces return.
2. The concurrent first-create path for a new topic profile produced a transient 500 for two of
   three simultaneously created QA sessions; sequential retry succeeded. This appears to be a
   pre-existing Stage 4 topic-profile creation race and should be fixed before concurrency testing.
3. The implementation uses deterministic source normalization and does not call an AI classifier.
   Consequently, a classifier-provider failure cannot occur in the current path; malformed inputs
   are quarantined locally. If an AI classifier is later introduced, the AI Routing failure/usage
   drill becomes mandatory.
4. Safari VoiceOver and OS-native PF/dummynet network degradation pass. The OS-level Reduce Motion
   toggle was not exercised; the reduced-motion media rules and component/browser behavior pass,
   and a physical toggle remains a prudent pre-release spot check.
5. Two unrelated schema tests fail and the workspace lint toolchain remains incomplete as noted
   above. The repository Prettier configuration also cannot load its Tailwind plugin; touched files
   pass `git diff --check`, and the student component was formatted with equivalent core options.

## Stage 7 prerequisites

1. Stage 7 may begin; no Stage 6 learner-model hard blocker remains.
2. Preserve post-commit, failure-isolated, idempotent learner-evidence delivery when Stage 7 adds
   artifact persistence or restores legacy quiz/mock product surfaces.
3. Fix or serialize first-time topic-profile creation before high-concurrency session tests.
4. Keep evaluation data rejected at the learner-model boundary and retain the Stage 5 baseline and
   deliberate personalization mutation in every personalization change.
5. Treat learner snapshots as bounded decision inputs, never as free-form demographic profiles; keep
   session choice sovereign and preserve evidence/rebuild versions across future model upgrades.

**Stage 6 complete.**
