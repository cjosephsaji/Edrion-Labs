# Petros Phase 2 verification results

Status at 2026-09-26T15:06:36Z: **generic Phase 2 implementation and final primary synthetic verification PASS within the boundaries below; real educational/institutional acceptance remains BLOCKED.** Independent integrated, transaction/security and report-accuracy reviews are complete within their stated scopes. This is not a blanket declaration that every P2-V scenario, full-app UI path or rollout gate is complete. The controlling request is the supplied Phase 2 mission. Phase 1 authority remains its final report dated 2026-09-22T16:35:49Z; historical pending text is superseded.

The user delegated product choices. [Product decisions](PETROS-PHASE-2-PRODUCT-DECISIONS.md) now select introductory projectile motion, an original source/objective candidate, adults 18+/English, conservative assistance/sharing and the existing review scheduler. The original [educator review packet](petros-phase2-source/educator-review-packet-v1.md) prepares those choices for review. No real educator approval, canonical curriculum record or real-person enrollment is fabricated.

## Final identity and evidence discipline

Workspace: `/Volumes/Chris/Edrion Labs`. Branch: `new-student-UI`. HEAD: `89c1ca29c117b2f9926e97e12a2738fa110cd2ca`. This is the existing dirty worktree, including Phase 1 and unrelated user changes; no reset, discard, commit or branch switch occurred.

Source frozen at **2026-09-26T15:02:13.217806Z** in [r5-before-retry/identity.json](verification/petros-phase2-20260922/r5-before-retry/identity.json):

| Identity | SHA-256 |
|---|---|
| Tracked diff against HEAD | `8595ba4cb0611c19913153a64cf85f476cd8fc73bf75a8d171c0d9daa7be3e7a` |
| Complete source manifest, 2,549 files | `415b7eb28f5d962eb96058ec969db81a0f167a1c1ca52484a2264fb04c92ec4b` |
| Relevant untracked manifest, 168 files | `8af3168c28ddab26664550bc7666e77d17212534b7af4632687004ee4d83174e` |
| Lockfile, unchanged | `803ebf8798958d62a0a7e5ef905a97240c98e97b0d7dadcbff45027123378808` |
| Protected SQL dump, unchanged | `6a3d616e8f215a071a25c7ed717f6b03a2aee514ecce87ef2b7dbb5a512f4b4d` |
| Protected compressed dump, unchanged | `a281acd5986dac80e4b0326b7f2c9a09249f73411ffd4951c59c01ddc5eb918b` |
| Phase 1 final report, unchanged | `4ded55f3a32a0df70da581551596e27c045658c606989da6ddaed780df0b47d8` |

The manifest includes tracked and nonignored untracked file bytes, sorted by path. It excludes `docs/verification/` and four evolving reports: this report, the harness plan, deferred verification plan and owner matrix. Build output, dependencies and temporary runtime data are Git-ignored. Exact selection and reproduction code are in [capture-identity.py](verification/petros-phase2-20260922/capture-identity.py). Report/evidence hashes are captured separately after verification to avoid circular hashes. Earlier `final-freeze`, r2–r5 identities and their logs are historical attempts, not final acceptance evidence. The final identity was captured immediately before the API retry and independently reproduced in `final-freeze-r6/identity.json`. One renderer test was added after the first r5 freeze; the final manifest includes it.

The Phase 2 baseline matched the authoritative Phase 1 tracked diff and the same 92 untracked source hashes. Its different manifest digest reflects path ordering rather than Phase 1 hash ordering. See [baseline](verification/petros-phase2-20260922/baseline/identity.json).

Only synthetic identities/documents, controlled provider adapters and private disposable PostgreSQL/Redis were used. The Phase 2 helper applies the full migration journal and post-migration grants, connects through a private Unix socket, uses `edrion_app` with NOBYPASSRLS, and removes its cluster. It does not read `.env`, restore dumps or run the production migration entrypoint. The reusable Phase 2 fixture supplies controlled extracted source bytes; it does not establish PDF extraction or an upload UI. Real PDF parsing, sandbox and queue recovery are covered separately by the affected Phase 1 tests. No paid provider, real-person data or shared database was used.

## Implemented workstreams

| Workstream | Connected production implementation | Boundary |
|---|---|---|
| A — source/objective identity | Knowledge document entitlement and exact immutable locators; canonical approved curriculum references; source-local concepts | Labels alone never merge concepts; stale versions do not rebind |
| B — compiler/review | `PetrosTeachingPackService`, authenticated compile/review routes, candidate hash, immutable versioned content, qualified approval/revocation | Runtime test packs remain synthetic; introductory projectile motion and an original review source are selected, but a qualified person and canonical curriculum approval are pending |
| C — adaptive teaching | `PetrosAdaptiveService`, loop observations and separate deterministic renderer; explicit student objective picker | Only reviewed content; policy owns the move; legacy mastery path is bypassed for bound observations |
| D — diagrams | Exact source/concept/objective/pack binding beside the existing renderer | Stale binding recovers to the original source; interaction alone is not evidence |
| E/F — analytic simulation/recovery | Trusted SI uniform-gravity/no-drag/level-ground model; linked shared primitives; authenticated owner commands/checkpoints/receipts | Fixed trusted solver only; computation outside commit transactions; zero providers |
| G — objective evidence | Canonical answer binding, append-only events/corrections, atomic receipt/outbox/projection/audit; bounded recovery consumer called by authorized evidence reads | Unknown external help stays unknown; correction only declares external assistance on the same response; no arbitrary score correction |
| H — qualitative revision | Existing saved artifact/revision owner plus draft request, qualified feedback, revised submission, explicit decision/revocation and current-status API | Full textual rubric/lineage retained; even approval does not grant numerical/mastery admission |
| I — save/review/resume | Existing selected-save and delayed-review scheduler, immutable learning receipts, exact retry payload, current objective/evidence UI | Review is self-reported recall; stale context clears; coverage, assistance and demonstrations stay distinct |
| J — assignment release | Default-off preview/commit APIs for existing published assignments, exact document/objective targets, immutable policy/audience snapshot and atomic publication | Only an existing singleton student audience; journey and unowned cohort targets fail closed |

The owner/dependency map is maintained in [PETROS-PHASE-2-OWNER-MATRIX.md](PETROS-PHASE-2-OWNER-MATRIX.md). All nine original candidate contracts are exported and connected to the appropriate runtime owners. Schema presence alone is not credited as a pass.

## P2-V1–P2-V12 results

`PASS` below means the named synthetic boundary was implemented, exercised and passed under primary verification. It does not mean every deployment/UI path or educational acceptance passed. The independent integrated review applies to these bounded paths; completed report reconciliation is recorded separately below.

Evidence aliases: **API** = final-r5-api-closure-retry-20260926 log; **Schemas** = final-r6 schemas test log; **UI** = final-r6 student-web test log; **Browser** = five final-r6 controlled Chromium logs. Exact commands/times/exits are indexed in [COMMANDS.md](verification/petros-phase2-20260922/COMMANDS.md).

| Requirement | Exercised evidence | Result and material limit |
|---|---|---|
| P2-V1 | API source suite (99 cases), pack-authority suite, curriculum and compatibility suites, both journeys | **PASS — generic source/identity boundary.** Exact locators, unreadable/omitted/deleted/replaced/foreign/revoked denial and safe old readers. Controlled Phase 2 extraction is backed by separate Phase 1 real PDF checks |
| P2-V2 | Schemas pack suite (8 cases); API pack-authority (6), HTTP journey (1), full journey (1) | **PASS — synthetic compiler/review. BLOCKED — canonical import/objective registration and qualified real review. Product subject/source/objective are selected in the decision record.** Cycles, changed payload, unsupported compiler, qualified explicit review, revoked/stale authority and complete deterministic renderer preflight covered |
| P2-V3 | Schemas adaptive policy (5 parameterized cases covering all seven required signals); API adaptive/full journeys; UI picker (7) | **PASS — deterministic policy/render split.** Supported misconception uses a reviewed discriminator; general wrong/confident response remains tentative. Explanation precedes probing; uncertainty, hints, repetition and time alter decisions |
| P2-V4 | Schemas binding (2) and visual program (21); UI legacy/explorer/repair-session; Browser visual and phase2 | **PASS — trusted binding and legacy behavior.** Stale/unknown versions deny with recovery. No diagram click/parameter event becomes objective evidence |
| P2-V5 | Schemas analytic model (5, including reference/boundary loops); API projectile (6), full journey; Browser phase2 | **PASS — declared analytic domain.** Launch/apex/landing, horizontal invariance, speed/angle/gravity/units/bounds/invalid inputs, replay, linked views and zero provider calls. Not generated physics or broader scientific validity |
| P2-V6 | API projectile (6): concurrent identical commands, hash/revision conflicts, atomic audit rollback, cancellation, authority changes, foreign owner, invalid solver/units and lock-order regression; full real-authority journey | **PASS — storage/recovery boundary.** Focused projectile suite uses controlled authority adapters; real authority owners are exercised in the full journey and pack/policy suites. No production crash/deployment exercise |
| P2-V7 | Schemas evidence (4); API objective-evidence (4), adaptive/full journeys | **PASS — bounded objective evidence.** Canonical evaluation, one unseen eligible transfer, hints/repetition/uncertainty, external-help disclosure correction, rebuild and duplicate consumption. Task exposure survives pack versions, including displayed but unanswered tasks. Read path drains at most 25 pending owner records; projection is already atomic at append. No background cohort scanner or external delivery claim |
| P2-V8 | API artifact/qualitative (8), authenticated HTTP journey, full journey; Schemas qualitative (3) | **PASS — authenticated API draft-feedback-revision-review lifecycle. BLOCKED — real reviewer/rubric/revision approval.** Missing/pending/rejected/revoked/changed work or authority denied; same-ID changed rubric is a controlled upstream inconsistency test. No complete educator portal browser workflow or numeric admission |
| P2-V9 | API artifact/qualitative (8), full journey with advanced Date clock; UI resume (4) and lost-review-response (1); Browser phase2 | **PASS — save/review/resume boundary. The existing scheduler is the selected product default; real educational interval validation remains open.** Exact receipts, selected-save semantics, lost-reply deduplication, current authority and stale UI clearing. In-memory retry is tested; browser restart persistence of a pending review is not claimed |
| P2-V10 | API assignment authority (7) plus storage/atomicity (4); legacy assignment/policy closure | **PASS — bounded document/objective release. PARTIAL/BLOCKED — journey/cohort publication.** Complete pack-locator scope at publication and runtime, target/session match, current preview authority, policy/membership/reviewer revocation, rollback, duplicate publication and immutable audience tested. No canonical journey owner or approved cohort exists; unsupported targets are denied |
| P2-V11 | API complete affected Phase 1 closure, including PostgreSQL/Redis/durable queue/budget/recovery, literal Phase 1 journey and Phase 2 owner suites; all five Browser scripts | **PASS — exercised compatibility/recovery closure.** S7/S8/S9, roster/SSO/federation gates and CSV preview remain. Phase 2 negatives are distributed owner tests, not one browser-to-live-stack run containing every permutation |
| P2-V12 | Authenticated HTTP inspection; API optional-provenance full journey and submission-time cutoff regression through API and raw teacher RLS | **PASS — scoped inspection API. BLOCKED — final privacy/product approval.** Pending remains pending; bounded public interventions, assistance and uncertainty only; no answer keys/private reasoning/cohort claims. Teacher endpoint rechecks current course/reviewer permission; database tenant/student RLS is additional defense, not a replacement for that endpoint authority |

## Integrated journey and negative cases

`petros-phase2-full-journey.integration.spec.ts` uses real production services/repositories with current synthetic source, curriculum, pack-review, student and educator authority in disposable PostgreSQL. It passes explanation → reviewed discriminator → contrast → repeated-confusion diagram → deterministic projectile initialize/apex/replay/cancel → unseen transfer → saved artifact/schedule → delayed review/resume → draft feedback/revision/qualified approval/inspection. The Date clock alone advances to the persisted due time plus one second; the real due queue and review owner run, and the stored review time is asserted. This proves scheduling mechanics, not retention or learning after a human delay.

The journey records three answer events, with exactly one eligible unseen correct application. It asserts unknown external help, no qualitative numeric admission, no learning evidence from visual events and zero provider calls. A subsequent session avoids previously exposed tasks; a separately seeded repeated-task negative remains ineligible. The separate adaptive journey also proves that a reviewed pack version bump cannot erase an unanswered transfer-task exposure, at both task selection and evidence admission. Synthetic owner/source/version/command/event/artifact/submission/audit IDs are emitted as `PETROS_PHASE2_SYNTHETIC_IDS` and extracted into the final evidence bundle without learner text or private reasoning.

This is a **real-owner service integration journey**, not a single authenticated full-app browser journey. A separate real-cookie HTTP test verifies guards, teacher compile/review, student binding and qualitative inspection/review. Controlled Chromium bundles actual React components against synthetic localhost responses, testing keyboard controls, exact retry, linked SVG/nonvisual content, mobile width, stale recovery and honest resume. The standalone picker/simulation fixtures in that browser harness are component exercises, not a coherent approved curriculum lesson. No physical-device accessibility or human-learning study was performed.

| Critical negative | Executed boundary and observed result |
|---|---|
| Assignment / S9 restriction | Assignment authority/storage and Phase 1 source/policy tests reject restrictions, changed publication policy and session mismatch without release writes |
| Tenant, membership, permission revocation | Raw HTTP foreign/unauthenticated denial; real pack, assignment and source owners reject current membership/authority loss; qualitative grading-permission-only revocation invalidates stored approval |
| Stale source / curriculum / pack | Pack-authority and source suites reject or hide old content; no silent rebinding; source revocation denies evidence replay and resume |
| Stale rubric / changed work | Exact full-rubric comparison exercised with a controlled same-ID upstream inconsistency; real artifact revision invalidates review; pure resolver also rejects changed authority/work |
| Failed write | Audit failure rolls back command/checkpoint/event, answer/evidence/outbox/projection, assignment release/recipients and selected-save/product/binding receipts; exact retry succeeds |
| Cancellation | Projectile tombstones before/after commit and legacy durable queue cancellation are tested; cancelled operation cannot later execute |
| Duplicate / lost response | Concurrent owner retries return one receipt; altered payload conflicts; review UI retries the same clientReviewId/body; browser objective picker and simulation retry controlled lost replies |
| Review missing / pending / denied / revoked | Real lifecycle rejects missing feedback, exposes pending honestly, preserves explicit rejection and revocation, and never creates numeric objective evidence |
| Future/unshared provenance | Submission opt-in and cutoff exclude later adaptive decisions/evidence through both inspection and restricted database reads; changed unshared revision cannot be inspected as reviewed |
| Old client / disabled flags | Negotiated compatibility, legacy diagrams, source/assignment projections and default-off routes/components pass; unsupported new shapes do not silently gain authority |

These owner-level repetitions provide critical negative coverage. They are not evidence that every cross-product of all failures was rerun through every UI surface.

## Final verification commands

The final batch comprises `final-r5-api-closure-retry-20260926` and the 25 `final-r6-` commands, all after the final source capture. See [COMMANDS.md](verification/petros-phase2-20260922/COMMANDS.md) for every exact command, environment override, UTC start/end, exit code and log; [final-command-results.json](verification/petros-phase2-20260922/final-command-results.json) is the machine-readable index. All **26 final commands exited 0**. [Post-run integrity](verification/petros-phase2-20260922/final-integrity.json) confirms the frozen source, tracked diff, relevant untracked manifest, lockfile, protected dumps and Phase 1 report are unchanged.

Final results:

| Check | Observed result |
|---|---|
| API affected-owner closure, 15:02:13–15:04:01 UTC | **63 files / 559 tests PASS**, including both integrated journeys and real disposable PostgreSQL/Redis recovery |
| Entire schemas suite | **58 files / 451 tests PASS** |
| Entire student-web suite | **32 files / 173 tests PASS** |
| Typechecks and lint | **14 commands PASS**, across schemas, database, config, permissions, API and both web apps |
| Builds | **3 PASS**: API, institution-web, student-web |
| Controlled Chromium | **5 scripts PASS**: preparation, question, compatibility, visual, phase2 |
| Diff whitespace and final integrity | **PASS**; identical before/after source and protected hashes |

The test total is **1,183** for these three final suites, not the entire repository. The API command explicitly includes all Phase 1 affected owners plus reflection and the Phase 2 integration suites. No Phase 1 result was inherited across a changed dependency without a rerun. The final browser [screenshot](verification/petros-phase2-20260922/petros-phase2-browser-20260925.png) was visually inspected; readable labels, equations and nonvisual content remain, with no clipping. The screenshot is a controlled component harness, not the styled complete application.

[Integrated synthetic IDs](verification/petros-phase2-20260922/integrated-journey-identities.json) link the Phase 2 source, commands, evidence and audit records; [Phase 1 journey IDs](verification/petros-phase2-20260922/phase1-journey-identities.json) record the corresponding compatibility run. Expected negative-case error logs, existing lint warnings and framework deprecation warnings are retained; a passing exit code is not a claim of warning-free code.

## Findings repaired and rerun

- Restored canonical `enrolled` student checks and corrected reviewer qualification SQL `row_id`; removed locks that required forbidden mutation privileges on immutable pack records.
- Separated adaptive observation progress from legacy remediation/mastery; prevented new pack binding after teaching begins. Answer retries retain exact payload identity.
- Bound-task general composer/re-explanation could expose answers without recording assistance. These paths now fail closed; registered hints retain observed assistance. Legacy composer paths remain covered by Phase 1 closure.
- Corrected cross-response evidence supersession: the only public correction declares external assistance on the same canonical response, preserving its judgment. Projection rebuilds share one objective lock before reading event sets.
- Added current grading-permission revalidation for qualitative feedback/review reuse, explicit review revocation and rejected status, and exact draft/revision/rubric lineage.
- Fixed privacy cutoff at both API and database layers: adaptive planning records now have RLS; permissive tenant-wide objective-ledger policies no longer override explicit sharing. Optional provenance stops at submission time.
- Fixed resume/review and projectile/planning lock order; real PostgreSQL tests force and observe advisory waits before releasing the competing operation.
- Preserved immutable referenced history on artifact deletion while hiding deleted products and refusing restore; actual retention/erasure policy remains unresolved.
- Fixed Phase 1 fixture post-migration grants and a real post-grant regression that had re-enabled DELETE on immutable knowledge preparations.
- Added current learning context UI and exact review retry state. Fixed analytic SVG text clipping and unwanted trajectory arrows without changing legacy renderer defaults; screenshot was inspected.
- Connected bounded outbox recovery to authorized objective-evidence reads and asserted one processed attempt under repeated reads.
- Rejected partial teaching-pack assignment locator sets at both publication and current runtime consumption. Old stored bindings with changed course/session/objective/curriculum are independently denied.
- Retained seen-but-unanswered task exposure across pack versions using the stable pack ID and task ID/variant. A real-owner regression publishes version 2, excludes the old task from selection, and rejects unseen eligibility even when an older writer presents it.
- Added renderer preflight using the actual deterministic render branches for every supported move, task and misconception before compilation/review/current admission. Unrenderable old candidates fail with `PETROS_PACK_NOT_RENDERABLE`; reviewed text is not silently truncated.
- Added migration 0226 composite parent-owner constraints and student-only qualitative submission INSERT. Non-superuser tests separately reject foreign session/artifact/revision references, wrong revision number, foreign artifact receipt/draft-sharing references and qualitative-review owner mismatch; legitimate explicit sharing still succeeds. Catalog checks for additional FKs are structural evidence, not executed negative proof of every reference.

Earlier failing logs are retained, including fixture/encoder/typecheck errors, the provenance RLS regression and the first r5 API run (551 passed, eight skipped when a disposable-database setup hook exceeded 10 seconds while other builds ran). The identical API command subsequently passed all 559 tests with no competing builds; no test timeout or application code was weakened to obtain that pass. They are not pass evidence. The final batch supersedes those affected intermediate attempts. Primary inspected and repaired unfinished subagent output. Earlier Astra audits identified correction/projection/delete issues; those findings were reconciled. The resumed independent Astra integrated audit identified cross-version task exposure and renderer-bound defects; both were repaired and independently reread. It also reread assignment scope and migration 0226 and independently passed all ten renderer tests. The separate Sol transaction/security audit completed with no additional blocking code defect in its scoped services and migration. It was static/read-only and did not independently execute database tests or re-audit unrelated Phase 1 owners; primary ran the final execution evidence. An independent Luna mechanical report review confirmed command totals, raw test summaries, before/after identity, retained failure history and local links, finding no contradiction in the bounded acceptance wording. Earlier quota-limited attempts are retained in [review-availability-20260925.json](verification/petros-phase2-20260922/review-availability-20260925.json); an errored agent is not credited as a completed audit. [Current review record](verification/petros-phase2-20260922/review-r5-progress.json) distinguishes completed rereads from incomplete attempts.

## Migration and rollback evidence

Migrations **0218–0226** (journal indices 138–146) add reviewed packs/qualifications; objective and qualitative evidence; projectile receipts/checkpoints; adaptive bindings; assignment releases/targets/recipients/outbox; selected-save/review receipts; adaptive answer identity/progress; qualitative feedback/revocation plus disclosure RLS; and composite tenant/student parent references with student-only sharing-submission INSERT. The final journal, post-migration grants, app-role restrictions and immutable triggers are applied by disposable tests, including a migration smoke test. Real owner tests verify atomic rollback on injected audit failure and subsequent exact retry. A private cluster left by the initial timed-out fixture was stopped and removed; the [cleanup record](verification/petros-phase2-20260922/r5-timeout-fixture-cleanup.json) identifies that disposable cluster. No production migration or destructive down migration ran.

Operational rollback is to disable all new admissions, retain compatible versioned readers and immutable records/RLS/audit, and drain or cancel relevant operations. Do not downgrade identity contracts, delete historical records or weaken S7/S8/S9. Assignment release outbox persistence is tested; no external notification delivery or new cohort worker is enabled. A production rollback rehearsal and retention/erasure procedure require an approved environment and policy and are **NOT RUN** here.

## External-decision and unavailable-dependency register

| ID | Decision / dependency | Owner needed | Effect until resolved |
|---|---|---|---|
| E1 | Selected projectile subject, original source and objective; canonical import/registration and content approval remain pending | Curriculum owner + qualified educator | Product choice is recorded; the authored candidate cannot establish approved educational authority |
| E2 | Named qualified pack reviewer and institutional qualification record | Institution/educator authority | No real teaching pack may be admitted; app cannot mint its own qualification |
| E3 | Qualified qualitative reviewer, rubric and revision/feedback approval | Educator + curriculum owner | Synthetic review is not educational approval; numerical admission remains disabled |
| E4 | Adults 18+, English and keyboard/reduced-motion/text support selected | Product/educator/accessibility owner | Product scope is resolved; real cohort enrollment and physical-device acceptance remain unverified |
| E5 | Source-bound registered hints, response before solution, stricter institution/assignment policy wins | Product + classroom policy owner | Conservative product default selected; broader classroom permissions remain disabled |
| E6 | Private by default with exact-revision opt-in; real retention and erasure rules pending | Institution + product/privacy owner | Sharing default selected; synthetic disposable operation only until real policy approval |
| E7 | Existing versioned scheduler and persisted due time selected | Educator + product | No interval implementation decision remains; effectiveness after a human delay is not established |
| E8 | Classroom membership/publication authority and canonical journey target | Assignment/audience + curriculum/product owner | Existing singleton document/objective snapshot only; journey/cohort publication denied |
| E9 | RESOLVED — Astra integrated audit/repair rereads, Sol transaction/security audit and Luna mechanical report reconciliation completed | Independent reviewers | No remaining reviewer-capacity blocker for these scopes; unfinished attempts remain uncredited |

All five new flags remain `false` by default: `PETROS_ADAPTIVE_TEACHING_ENABLED`, `PETROS_PROJECTILE_ENABLED`, `PETROS_OBJECTIVE_EVIDENCE_ENABLED`, `PETROS_QUALITATIVE_REVIEW_ENABLED`, `PETROS_ASSIGNMENT_LEARNING_ENABLED`. Synthetic fixtures enable only the features under test. Generated executable behavior, unsupported qualitative numerical admission, unverified external roster/SSO/federation, real pilot and rollout remain disabled. Phase 3 was not started.

No commit, push, pull request, deployment, publication or production mutation occurred. No message was sent to an educator or other person. The next acceptance step requires the explicit real educator/institutional authorities above; primary synthetic results do not authorize rollout.
