# Petros Phase 1 deferred verification plan

Status: **planned; do not execute until Phase 1 implementation is declared build-complete**  
Authority: `docs/PETROS-LEARNING-HARNESS-PLAN.md` remains authoritative for semantics, boundaries and acceptance gates.  
Purpose: one verification pass over P1-S1 through P1-S11 after all Phase 1 implementation work stops.

## 1. Boundary

This plan verifies completed Phase 1 engineering. It does not authorize more product scope, migrations against shared databases, external-provider calls, real learner data, deployment or pilot enablement.

Earlier increment ledgers are inputs, not proof for this final pass. Re-run required checks against one frozen checkout. Do not promote an increment because an older run passed on an earlier tree.

Keep these decisions separate:

- **Engineering verification:** contracts, permissions, tenancy, persistence, recovery, compatibility, UI and regression behavior work on frozen build.
- **Human review:** qualified reviewers accept usability, accessibility, instructional wording and operational workflow.
- **Pedagogical correctness:** educator-reviewed sources, explanations, assessments and interventions satisfy declared learning objectives.
- **Production readiness:** deployment, observability, capacity, incident recovery, retention and provider behavior pass in target environment.
- **Learner-pilot approval:** approved institution, cohort, ages, consent, policy, budget, success measures and stop rules exist.

Only first decision belongs to this plan. Others remain open unless separately evidenced and approved.

## 2. Start condition

Do not start verification until build owner records all items below:

- P1-S1 through P1-S11 implementation stopped; no parallel feature edits. S11 records a build candidate, not runtime acceptance.
- Exact commit or immutable working-tree snapshot recorded.
- Full dirty-tree manifest and hashes captured, including untracked files.
- Final migration is 0215 or later; journal order recorded.
- Feature flags and expected defaults recorded.
- No unresolved implementation task remains disguised as a verification task.
- Disposable PostgreSQL, Redis, sandbox and browser prerequisites available.
- Synthetic fixtures contain no real learner/provider data.

If implementation changes after verification starts, invalidate affected stage plus every dependent later stage. Record new build identity. Re-run dependency closure; do not patch evidence ledger by assertion.

## 3. Verification roles and model handoff

Use independent verification model with no claim inherited from implementation model. Give verifier:

1. Authoritative learning-harness plan.
2. This plan.
3. Frozen build identity and dirty-tree manifest.
4. P1-S1 through P1-S11 implementation ledger.
5. Repository instructions and test infrastructure.

Verifier may author missing tests and repair defects inside Phase 1 scope. Every repair must record affected increments and trigger reruns. Verifier must not broaden into Phase 2, provider implementations, federation enablement, concept packs, simulations or pilot decisions.

Handoff prompt after build freeze:

> Verify completed Petros Phase 1 against `docs/PETROS-PHASE-1-VERIFICATION-PLAN.md` and authoritative `docs/PETROS-LEARNING-HARNESS-PLAN.md`. Freeze checkout identity first. Author missing tests, then execute V1–V11 and integrated journey in order using disposable local dependencies only. Record per-scenario evidence and every skipped/blocked result. Repair Phase 1 defects and rerun dependency closure. Do not infer human, pedagogical, production or pilot approval. Preserve unrelated working-tree changes; do not deploy, use shared databases or make live provider calls.

## 4. Result vocabulary

Use one result per scenario:

| Result | Meaning |
|---|---|
| `PASS` | Expected contract, state, isolation, UI and audit behavior observed on frozen build. |
| `FAIL` | Implemented path behaves incorrectly. File issue; repair and rerun dependency closure. |
| `BLOCKED` | Required local dependency or fixture unavailable. Not a pass. |
| `NOT RUN` | Scenario not executed. Not a pass. |
| `OUT OF SCOPE` | Scenario belongs to later phase or separate human/production gate, with reason. |

Never use screenshot presence, test count, schema existence, route existence or successful compilation alone as acceptance.

## 5. Evidence ledger

Create one ledger row per scenario. Record:

- run ID, UTC start/end, build identity and worktree hash;
- increment/scenario ID, command, environment and dependency versions;
- synthetic institution, campus, staff, course, student, source, session, job and command IDs where relevant;
- expected result, actual result and result vocabulary value;
- test file/case name, assertion count and skipped-test count;
- database migration/RLS/audit IDs for persistence scenarios;
- browser, viewport, keyboard/accessibility mode and screenshot path for UI scenarios;
- issue/fix reference, affected-increment closure and rerun evidence;
- reviewer identity/pseudonym for later human gates, kept separate from engineering result.

Redact secrets, cookies, tokens, private source text and learner content. Hash artifacts. Store raw evidence only in approved restricted QA location.

Suggested row shape:

| Run/build | Scenario | Preconditions/flags | Command or manual steps | Expected | Observed/artifacts | Result | Issue/repair/rerun |
|---|---|---|---|---|---|---|---|
| `NOT RUN` | `V1-01` | record at execution | record at execution | readiness denial for unreadable PDF | pending | `NOT RUN` | pending |

## 6. Environment and safety

### 6.1 Disposable database

Reuse local harness in `apps/api/src/modules/student/petros-session-intent/petros-document-source.integration.spec.ts`:

- `initdb` and `pg_ctl` on PATH;
- temporary PostgreSQL cluster;
- private Unix socket, TCP disabled;
- non-superuser `edrion_app` with `NOBYPASSRLS`;
- real migration journal through 0215;
- real RLS helper SQL and post-migration grant reapplication;
- automatic teardown;
- no `.env`, `DATABASE_URL`, database dump or shared database.

Use `redis-server` and `redis-cli` only for disposable existing recovery cases. Use existing restricted PDF sandbox prerequisites. Never call paid/live providers.

### 6.2 Personas and isolation fixtures

Minimum synthetic matrix:

- Institution A institution-wide admin.
- Institution A campus-scoped admin.
- Institution A assigned instructor and unrelated staff member.
- Institution A student A1 enrolled in course C1.
- Institution A student A2 enrolled elsewhere.
- Institution A withdrawn/suspended student.
- Institution B admin, staff, course and student with same-looking names/IDs where possible.
- Independent learner principal.
- Legacy records created before each applicable migration/contract version.

### 6.3 Feature-gate matrix

Test every Phase 1 flag default-off first. Then enable only prerequisites for selected path. Include at least:

- PDF preparation;
- document retrieval;
- durable question execution;
- knowledge policy;
- visual program contract;
- assessment contract;
- provider mappings;
- curriculum alignment.

Qualitative assessment execution and generated visual behavior must remain gated throughout Phase 1 verification.

## 7. Ordered verification stages

Run stages in order. Earlier source, permission and transaction guarantees support later runtime claims.

### V1 — P1-S1 source readiness, admission and locators

Verify actual portal publication → student material → session intent/start → loop source path.

Must cover:

- readable PDF, blank/scanned page, missing page text, corrupt replacement characters and truncated preview;
- physical 1-based page locators and UTF-16 offsets;
- selected-page coverage vs omitted pages;
- current entitlement before cached read/start;
- changed/deleted/revoked/foreign source denial;
- exact retry, lost response, remount and concurrent start;
- strict previous-reader response and negotiated extension;
- failed new/existing publication rollback;
- no non-PDF or ambiguous source promoted as verified PDF text.

Exit: unready source cannot enter teaching path; exact source locator survives authorized read; no duplicate logical start.

### V2 — P1-S2 immutable extraction snapshots

Verify canonical version/page/deletion owners and every S1 downstream reader.

Must cover:

- republish creates immutable version; prior locators remain resolvable while authorized;
- current pointer never rewrites old page set;
- page-set completeness and ordinal/admissibility rules;
- deletion receipt prevents retry resurrection;
- source list, intent, loop, history, artifact and companion consume pinned version;
- changed ownership/current access revokes reads without deleting history;
- tenant/student isolation under direct `edrion_app` RLS;
- partial write rollback and concurrent publication ordering.

Exit: historical teaching reference never silently resolves to mutable current text.

### V3 — P1-S3 restricted extraction execution

Verify publication → preparation receipt/outbox → BullMQ → restricted process → atomic S2 publisher → portal status/retry/cancel.

Must cover:

- default-off gate and no in-request parser fallback;
- admission bounds for bytes/pages/text/archive/process time and sampled memory;
- platform sandbox selection and fail-closed unsupported platform;
- job deduplication, lease/fence, retries and terminal failure;
- cancellation before dispatch, during work and before commit;
- worker crash/restart, stale claim and duplicate delivery;
- failed republish preserves prior valid snapshot;
- deletion cancels pending work and prevents resurrection;
- no extracted text or sensitive source in routine queue/audit telemetry.

Exit: preparation interruption recovers without duplicate or partial source publication.

### V4 — P1-S4 owner-scoped retrieval

Verify immutable snapshot reader → bounded lexical selection → lesson-question command → AI context/observation.

Must cover:

- exact pinned snapshot and current entitlement;
- selected spans, locators, coverage/omission trace and deterministic cache identity;
- query bounds, no-match, weak-match, unavailable source and changed source;
- two students same institution, two institutions and independent learner denial/gate;
- cache cannot bypass owner/source/version/policy checks;
- prior-reader compatibility and flag-off projection;
- retrieval never claims semantic entailment, full document coverage or external knowledge authority.

Exit: only bounded, owner-authorized, pinned source spans reach first question path.

### V5 — P1-S5 durable document-question execution

Verify command owner → short transaction/outbox → worker → fenced result commit → status/cancel UI.

Must cover:

- idempotent command receipt and lost HTTP response;
- queue dispatch after transaction commit;
- worker crash before/after provider call and before commit;
- attempt fence prevents stale/duplicate answer commit;
- cancel queued/running/completing command;
- timeout, retryable vs terminal error and refresh recovery;
- source/membership/policy revalidation before dispatch and commit;
- answer/trace/audit atomicity;
- legacy synchronous behavior when disabled, without reading new command as complete;
- keyboard, reload, focus and status polling in actual UI adapter.

Exit: interrupted execution reaches one authoritative terminal result without duplicate committed answer.

### V6 — P1-S6 atomic attempt budget reservation

Verify existing routing/budget/usage owners around each provider attempt.

Must cover:

- default-off/prerequisite admission;
- positive priced route and configured budget required;
- concurrent requests cannot overspend same available budget;
- hold before provider attempt, measured settlement and append-only usage;
- failure before call releases/settles correctly;
- ambiguous timeout conservatively settles without later stale overwrite;
- cache hit/no-provider path does not fabricate provider spend;
- retry creates correct new attempt identity while command remains fenced;
- institution/provider/model isolation and no cross-tenant usage leak;
- UI presents budget denial/recovery without false retry promise.

Exit: every admitted provider attempt has one durable reservation and one valid terminal accounting outcome.

### V7 — P1-S7 composable visual contracts

Verify existing diagram producer → bounded primitive adapter → canonical teaching-block snapshot → authenticated controls → renderer.

Must cover:

- strict program version, typed parameters/units/state/view bindings and capability manifest;
- size/depth/node/operation bounds and unknown primitive/version rejection;
- original diagram bundle preserved for legacy fallback;
- owner/course/session isolation and immutable snapshot identity;
- control receipts, version conflicts, reload and stale operation recovery;
- keyboard, non-color cue, reduced motion and structured text path;
- contract flags off by default;
- generated behavior, solver execution, quantitative simulation and browser-authored success remain disabled/untrusted;
- S1–S6 source/execution/accounting regressions.

Exit: declarative visual data renders safely; no claim of general simulation engine or generated behavior.

### V8 — P1-S8 assessment compatibility

Verify objective evaluator → typed assessment result → existing learner evidence admission/projection → protected diagnostics/export.

Must cover:

- legacy numeric result adapter and new result union;
- condition fields remain independent: supervision, time, resource policy, modality, environment, assistance, answer exposure, verification and policy version;
- rubric/profile/result versions and product/process provenance;
- unknown states remain unknown;
- duplicate/replay and projection rebuild determinism;
- current membership/access vs historical membership-at-occurrence;
- qualitative/criterion/mixed payload validation but execution/admission remains gated;
- informal interaction/visual clicks do not become mastery;
- generated answer, synthetic/evaluation event and foreign learner denial;
- diagnostics/export permission and tenant isolation.

Exit: typed assessment metadata adds no invented criterion, independence or learner evidence.

### V9 — P1-S9 knowledge-mode enforcement

Verify institutional authority → immutable question policy → per-attempt gateway checks → atomic result/provenance → compatible status/history.

Must cover:

- `source_bound`, `source_primary`, `general_learning` resolution and student narrowing only;
- assignment restriction precedence; unrelated permitted curiosity cannot launder restricted work;
- category admission and reason/correlation on every denial;
- source-bound exact quotation/provenance and no invented locator;
- supplemental/general/analogy/inference/uncertain labels;
- mode/authority pin in command, attempt, cache and result;
- policy/membership/source changes before dispatch/commit/replay;
- old unpinned command denied when enabled; legacy shape when unnegotiated;
- rate/quota/concurrency, provider reservation and cancellation still apply;
- S8 qualitative and S7 generated behavior gates remain closed.

Exit: first durable question path cannot bypass current mode/category policy or mislabel source authority.

### V10 — P1-S10 provider mapping and standards alignment

Verify existing identity/integration/curriculum owners and actual CSV/syllabus producer-consumer paths.

Provider mapping must cover:

- institution-wide integration plus matching canonical-owner permission;
- campus, unrelated role, student, independent and foreign tenant denial;
- exact case-sensitive namespace/external ID; no email/name auto-merge;
- proposal before identical approval; reject/tombstone/effective interval;
- changed/disabled connection and changed/missing canonical reference;
- every whitelisted canonical owner, including campus and class field differences;
- unsupported stored/input version; no fallback to older approval;
- exact command replay, changed replay, concurrent version conflict and audit failure rollback;
- strict/bounded CSV, duplicate/padded/quoted/unknown roles and upstream row hash/revision;
- preview always `applied: 0`; historical preview marked not revalidated;
- OIDC/SAML start/callback remains hard-gated with zero external auth/session effect.

Curriculum alignment must cover:

- course-scoped objective/framework/release/item/relationship/alignment identity;
- version references, publisher IDs, provenance/license, effective intervals and bounds;
- many-to-many alignment without equivalence/mastery inference;
- missing references, duplicates and hierarchy/supersession cycles;
- exact proposal-before-approval; sensitive review route; ordinary syllabus route rejects decisions;
- educator override/rejection reason and immutable history after removal;
- subject/syllabus change → stale; coverage-only change does not alter curriculum identity;
- superseding effective release → stale alignment and explicit realignment;
- assigned instructor/course manager authority, unrelated staff denial;
- enrolled current student sees current approved plan only; second student/tenant/withdrawn student denied;
- legacy portal array/student `{modules}` and negotiated clients;
- unsupported/missing records never become approved alignment;
- record/manifest/syllabus/audit failure rollback, exact retry and concurrent revision conflict.

Exit: compatibility contracts work on real existing paths without enabling provider sync/federation, rewriting canonical identities or manufacturing evidence.

### V11 — P1-S11 build-closure boundaries

**Planned only — NOT RUN.** These scenarios supplement V1–V10; they do not replace earlier acceptance gates. Author focused tests in the existing production-path suites during the separate verification pass. Freeze the combined S1–S11 checkout first. No S11 test was authored or executed in the development pass.

| Scenario | Actual path / setup | Required evidence |
|---|---|---|
| V11-01 — service and voice durable boundary (G1) | `PetrosLoopService.composerQuestion`, `PetrosLoopRepository.beginCommand`, actual `PetrosInputModesService.voiceTurn`/HTTP and original questions route. Use an uploaded-document session with a current explanation block and confirmed synthetic transcript. | S5 on/S9 off rejects synchronous direct/voice calls with `PETROS_QUESTION_EXECUTION_REQUIRED`; S9 on rejects through existing policy boundary even if S5 off. No question provider, legacy command, detour, block completion or speech effect. Typed category survives voice adapter; transcript/media remains recoverable. Missing legacy profile cannot trigger generation before the service gate. Non-document voice and both-flags-off/no-pending legacy behavior stay compatible. |
| V11-02 — pending work and rollback coexistence (G1) | With uniform flags off, pre-existing queued/running commands in same session, including an unsupported execution version; controller and direct service callers; later terminal status and same-key replay. | Pending work blocks legacy calls before command mutation regardless of key/contract version. Terminal work permits legitimate legacy behavior while same-key durable identity remains protected. Race completion/cancellation against reads; no duplicate answer, stale mutation or new deadlock. Race legacy call with policy-pinned historical command reads. Enabling/disabling fleet requires drain/uniform flags; do not count mixed unsafe rollout as supported. |
| V11-03 — authority on every retry/fallback (G2) | Actual loop generator → gateway → controlled provider adapters, both S5 non-policy and S9 permitted-general paths. Inject authority loss before first attempt, between retries, before fallback and after reservation; include source/lease/session/policy codes, bare 401/403 and uncoded authority failure. | Callback is invoked before each attempt and after each reservation. No provider dispatch after denial; original failure/category propagates, never successful excerpt fallback even if authority later recovers. A known-undispatched hold is released at zero before worker failure reconciliation. Failed hold release/reconciliation stays recoverable and cannot yield an answer. No tenant transaction is active at provider transport. Genuine provider/content failure with intact authority retains disclosed fallback. |
| V11-04 — older-fence accounting without new provider (G3) | Reserve fence 1, simulate crash, claim fence 2 and return no-provider result (demo mode, no eligible route, source-bound/no-match as applicable). Use real routing/usage repositories and restricted application role. | Older hold settles once as ambiguous/full reserved amount before preparation; current/newer-fence holds remain unchanged. Command can finish without leaking reserved spend. Late old-provider result cannot overwrite or double-post usage. Lost response, duplicate recovery, cancellation and exhausted command remain idempotent. Inject reconciliation/usage write failure: no generation/answer commit, atomic rollback and recoverable lease/retry. Confirm separate claim/reconciliation transactions and ordinary measured settlement unchanged. |
| V11-05 — external roster execution stays disabled (G4) | Authenticated Clever/ClassLink/OneRoster REST sync HTTP routes and direct service methods, with absent/present synthetic credentials, arbitrary supplied REST URL/token, repeated request. Actual federation settings component/client. | Each permitted call returns 409 `EXTERNAL_ROSTER_SYNC_DISABLED` before credential use, fetch/token exchange, job insert/update, audit mutation or canonical apply. Existing route permission/body behavior retained. UI exposes no external sync action or REST credential field, shows unavailable state; no network request can be initiated there. IdP configuration/history remain readable; OIDC/SAML still hard-gated. CSV counts/mapping preview still works with `applied: 0`, current permissions and no external fetch or identity/role/enrollment mutation. |
| V11-06 — server-side student curriculum projection (G5) | Actual negotiated enrolled-student syllabus HTTP with approved/proposed/rejected/not-effective/superseded mappings and unrelated standard records; inspect raw response, not just UI. Exercise shared projection helper and portal reader. | Student receives effective objectives, explicit active unmapped objectives, currently approved alignments, directly referenced items, relationships only between retained items, matching module refs, complete release/framework and transitive supersedes references. No unrelated or unapproved alignment/review record leaks. Required historical release ancestry does not become approved coverage. Full authorized portal manifest remains available. Stale/unsupported/unmapped states are content-free; unknown/latest version never falls back. Legacy `{modules}` and existing negotiated schema remain readable. No curriculum/learner mutation. |
| V11-07 — instructor syllabus read authority (G6) | Actual guarded GET `/portal/courses/:id/syllabus`, legacy/negotiated responses, institution-wide/campus scope, current assigned active instructor with `syllabus.manage` but no `courses.manage`, course manager, unrelated/inactive staff, reassigned course. | Assigned instructor can inspect its syllabus; course manager still needs syllabus permission. Unrelated/inactive/foreign/campus-excluded staff denied by existing service scope. Sensitive review route still requires `academics.alignments.approve` and applicable recent-auth/MFA checks; GET grants no approval/write authority. Current student/enrollment denial and RLS unchanged. |
| V11-08 — combined compatibility, atomicity and rollback (all) | Full final journey and old clients; fixed database journal through 0215; source/session/policy/enrollment revocation; failed answer/audit/usage/curriculum writes; lost responses; feature flags off/on with prerequisites. | Reuse canonical source/command/budget/policy/curriculum/audit owners; one committed effect per logical command, rollback preserves previous state, no source/curriculum/teaching/learner conflation. Cache reads/writes remain bypassed for application contracts. S7 generated behavior/S8 qualitative execution/federation/external sync remain gated; S9 categories and pinned-history enforcement remain. Retain authority/projection/gates on rollback or block affected routes before old binaries. Preserve both dump hashes and unrelated work. |

Suggested test ownership, all **future work**, not existing acceptance evidence:

- Shared `packages/schemas/src/curriculum-alignment.spec.ts`: V11-06 projection, bounded reference closure, previous reader and unsupported states.
- Existing loop/gateway/input-mode specs and `apps/api/src/modules/student/petros-session-intent/petros-document-source.integration.spec.ts`: V11-01–04, using actual guards/tenant proxy, commands, audit and budget owners; controlled transport only.
- Planned `apps/api/src/modules/integrations/petros-compatibility.integration.spec.ts` plus federation/course service specs: V11-05–07 authenticated HTTP, RLS, permissions and reference freshness.
- Planned `apps/student-web/src/components/petros/petros-compatibility-surfaces.spec.tsx`, existing voice/question components and controlled-localhost browser harness: real federation settings, student course plan, instructor reads, typed voice denial and recovery. UI-only filtering is not proof of data isolation.

Exit: every S11 repair has direct positive/negative/recovery evidence, every §15 deliverable remains connected through its existing owner, and no later-phase or feature-gated capability has been enabled accidentally.

## 8. Cross-stage Phase 1 acceptance journey

After V1–V11 pass individually, run one integrated synthetic journey on same frozen build:

1. Publish synthetic three-page `cloud-reference-v1` PDF with one omitted/unreadable variation.
2. Prepare it through restricted worker and confirm immutable snapshot/readiness.
3. Start exact source topic through negotiated intent path.
4. Retrieve bounded evidence and create durable question command.
5. Reserve attempt budget, enforce selected knowledge mode and commit one answer/provenance trace. Exercise S5 with S9 off and S9 enabled; revoke authority between provider retries and prove no fallback can turn denial into success.
6. Render safe declarative visual contract while generated behavior stays gated.
7. Record only permitted typed assessment evidence; keep qualitative execution gated.
8. Read the syllabus as its assigned instructor without course-management permission; display course objective/approved standard mapping as plan metadata. Inspect the student HTTP projection to prove review-only mappings are absent and required immutable references remain; never create learner evidence.
9. Run roster mapping preview for synthetic identity and prove no canonical mutation. Attempt each disabled external sync/SSO route and prove zero network/session/job effects; use the actual settings UI.
10. Interrupt preparation/execution, retry lost responses, revoke source/enrollment/policy and verify recovery/denial. Recover an older reserved attempt into a no-provider result and prove terminal accounting exactly once locally.
11. Submit confirmed voice input to the document question boundary; assert typed denial with no legacy answer/block/speech effect. During controlled uniform flag-off rollback, pending durable work still blocks direct/voice legacy calls; after terminal recovery, permitted legacy behavior and pinned S9 history restrictions remain.

Required negative journey:

- unreadable/truncated source;
- another student same institution;
- same-looking student in another institution;
- stale source snapshot;
- expired budget or disabled route;
- changed policy before commit;
- unsupported mapping/alignment version;
- failed audit/persistence write;
- old client without negotiation headers;
- direct/voice service bypass and pending unsupported-version command;
- transient per-attempt authority denial or failed undispatched-hold release;
- abandoned reservation followed by no-provider success;
- student response containing unapproved review data;
- unrelated instructor or external roster/SSO action.

Phase 1 engineering exit passes only when every claimed requirement has direct evidence and both positive/negative journeys preserve source integrity, tenant isolation, atomicity and compatibility.

## 9. Command plan

Commands below are verification targets. Update exact file list after verifier authors missing S10 and S11 tests. Missing file or skipped suite is `NOT RUN`, never `PASS`.

### 9.1 Shared contracts

```bash
cd '/Volumes/Chris/Edrion Labs'
pnpm --filter @edrion/schemas exec vitest run \
  src/petros-document-source.spec.ts \
  src/petros-document-preparation.spec.ts \
  src/petros-document-retrieval.spec.ts \
  src/petros-session-intent.spec.ts \
  src/petros-question-execution.spec.ts \
  src/petros-visual-program.spec.ts \
  src/petros-assessment.spec.ts \
  src/petros-knowledge-policy.spec.ts \
  src/provider-mapping.spec.ts \
  src/curriculum-alignment.spec.ts \
  src/petros-compatibility.spec.ts
```

### 9.2 API and disposable production boundary

```bash
PETROS_LOCAL_DB_TESTS=1 pnpm --filter @edrion/api exec vitest run \
  src/modules/student/petros-session-intent \
  src/modules/student/materials \
  src/modules/student/knowledge \
  src/modules/student/petros-loop \
  src/modules/student/petros-input-modes \
  src/modules/student/petros-companion \
  src/modules/student/petros-artifacts \
  src/modules/petros-ai-routing \
  src/modules/petros-learner-model \
  src/modules/petros-institutional \
  src/modules/integrations \
  src/modules/federation \
  src/modules/portal/courses \
  src/modules/student/courses \
  src/common
```

Verifier must add real S10 authenticated HTTP/RLS/migration coverage if no existing spec exercises 0215. Preferred new file: `apps/api/src/modules/integrations/petros-compatibility.integration.spec.ts`, using existing disposable harness pattern.

### 9.3 Web components

```bash
pnpm --filter @edrion/student-web exec vitest run \
  'src/app/(app)/materials/page.spec.tsx' \
  'src/app/(app)/courses/[id]/page.spec.tsx' \
  src/components/materials/document-viewer.spec.tsx \
  src/components/petros/material-preparation-status.spec.tsx \
  src/components/petros/petros-document-door.spec.tsx \
  src/components/petros/petros-repair-session.spec.tsx \
  src/components/petros/petros-visual-explorer.spec.tsx \
  src/components/petros/use-document-question.spec.tsx \
  src/components/petros/petros-input-modes.spec.tsx \
  src/components/petros/petros-compatibility-surfaces.spec.tsx
```

Institution-web lacks its own Vitest script/config in current checkout. Reuse established student-web import pattern for real institution components or add properly owned institution-web test infrastructure during verification; record choice.

### 9.4 Type, build and lint

Run after behavioral suites pass:

```bash
pnpm --filter @edrion/schemas exec tsc --noEmit
pnpm --filter @edrion/database exec tsc --noEmit
pnpm --filter @edrion/config exec tsc --noEmit
pnpm --filter @edrion/permissions exec tsc --noEmit
pnpm --filter @edrion/api exec tsc --noEmit
pnpm --filter @edrion/institution-web exec tsc --noEmit
pnpm --filter @edrion/student-web exec tsc --noEmit
pnpm --filter @edrion/api build
pnpm --filter @edrion/institution-web build
pnpm --filter @edrion/student-web build
pnpm --filter @edrion/schemas lint
pnpm --filter @edrion/database lint
pnpm --filter @edrion/config lint
pnpm --filter @edrion/permissions lint
pnpm --filter @edrion/api lint
pnpm --filter @edrion/institution-web lint
pnpm --filter @edrion/student-web lint
```

Do not use broad build/lint pass to hide targeted failures. Record warnings separately.

### 9.5 Browser and recovery

Run existing scripts first:

```bash
node apps/student-web/scripts/petros-preparation-browser-check.mjs
node apps/student-web/scripts/petros-visual-browser-check.mjs
node apps/student-web/scripts/petros-question-browser-check.mjs
```

Add controlled-localhost S10/S11 browser coverage for actual federation CSV preview, institutional syllabus alignment and student course-plan consumers. Cover keyboard, focus, reload, stale/unsupported/unmapped states, denied permissions, legacy backend responses, disabled external sync controls, instructor read authority, server-projected approved student plan, typed voice denial and failed network recovery. No seeded cosmetic-only page counts as production-path evidence.

## 10. Defect and rerun rules

When scenario fails:

1. Record failure before editing.
2. Identify root owner and affected increment.
3. Repair smallest Phase 1 scope.
4. Add regression test proving failure.
5. Re-run failed scenario.
6. Re-run all later stages depending on changed owner.
7. Re-run integrated acceptance journey.
8. Update evidence ledger; preserve prior failed evidence.

Dependency closure:

- S1/S2 change → rerun S1–S11 plus integrated journey.
- S3 change → rerun S3–S11 plus integrated journey.
- S4 change → rerun S4–S11 plus integrated journey.
- S5/S6 change → rerun S5, S6, S8, S9 and integrated journey; add S7/S10 if shared API/UI/transaction owner changed.
- S7 change → rerun S7, S8, S9 and integrated journey.
- S8 change → rerun S8, S9 and integrated journey.
- S9 change → rerun S9 and integrated journey.
- S10 change → rerun S10 and integrated journey; rerun earlier stage when shared owner changed.
- S11 change → rerun affected S1–S10 owners plus V11 and integrated journey. Runtime changes require V5/V6/V9; compatibility changes require V10; shared schema/UI/auth changes add every affected stage.
- Any repair to an earlier owner covered by V11 also reruns its V11 scenarios.
- Shared auth, permissions, tenant proxy, audit, migration, schemas or client changes → rerun every affected stage, never only latest test.

## 11. Phase 1 engineering sign-off

Engineering sign-off needs all:

- V1–V11 each `PASS` with no `BLOCKED` or `NOT RUN` mandatory scenario.
- Integrated positive and negative journeys pass.
- Full migration/RLS/grant path passes on disposable DB.
- Typechecks, builds and lint complete with reviewed warnings.
- Actual browser paths pass declared desktop/mobile/keyboard/recovery matrix.
- No high/critical unresolved defect; lower defects explicitly scoped with owner and reason they do not violate Phase 1 exit.
- Final diff reviewed against frozen build manifest.
- Feature defaults, rollout, rollback and recovery evidence recorded.
- S7 generated behavior and S8 qualitative execution remain gated.
- S9 mode/category enforcement remains active when enabled.
- S10/S11 federation and external-provider sync remain disabled; CSV mapping stays preview-only.
- V11 raw student response and direct/voice caller boundaries pass; UI filtering alone never counts.
- All planned S11 scenarios carry executed evidence or remain explicitly NOT RUN/BLOCKED, preventing sign-off.

Then update authoritative Execution Ledger to `Phase 1 engineering verified; human/pedagogical/production/pilot gates open`. Do not write `Phase 1 complete` unless every plan-defined Phase 1 exit condition and required engineering evidence passed.

## 12. Explicit non-acceptance

This final engineering pass cannot approve:

- educator correctness or standards equivalence;
- learner age/cohort, consent, retention or institution policy;
- physical-device/assistive-technology claims not directly run;
- production deployment, capacity, live provider reliability or cost;
- LTI/CASE/SSO/roster synchronization or certification;
- qualitative assessment execution;
- generated visual behavior or general simulation engine;
- Phase 2 concept packs/adaptive teaching vertical slice;
- learner outcomes or pilot launch.

Exact next action after Phase 1 implementation finishes: freeze build, create verification run ledger, author missing S10 and S11 tests, execute V1 through V11, execute integrated journey, repair within Phase 1, then record engineering result. Do not begin Phase 2 during this verification pass.
