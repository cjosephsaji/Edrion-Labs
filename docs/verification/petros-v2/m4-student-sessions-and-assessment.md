# Petros V2 M4 — durable student sessions and private assessment

Engineering verification, 15 October 2026. **No student release, deployment, paid inference, official grades, or actual academic qualifications were authorized or performed.** M5 has not begun.

**M4 introduces significant student-facing UI changes. Manual visual review is required before M5.**

## A. Executive summary

Implemented a working, persistent M4 slice in the existing NestJS API, PostgreSQL, BullMQ/Redis, learner-evidence owner, workspace owner, and Next.js student portal. This includes owned admission intents, exact source/release/review pins, server-selected engines, durable commands, issued tasks, immutable answers, separate private evaluation, criterion evidence admission, semantic canvas checkpoints, pause/resume, and recovery. The running demonstration uses the actual controllers, signed institutional student sessions, restricted database roles, real document parsing, reviewed synthetic institutional records, and real local queues.

The release path is deliberately separate from M3's `isolated_teaching_scope_only` release manifest. M3 alone still does not authorize students. A versioned student-session publication requires additional exact instrument reviews and current recipients. There is no test-flag authorization shortcut and no public publication controller enabled by M4.

**Implemented** means code exists. **Tested** means the linked execution ran. **Demonstrated** means running application behavior was captured. **Qualified** would require independent educational/provider/security validation; this report does not grant it. **Authorized** here means isolated engineering only. **Blocked** gates remain blocked. Adaptive teaching, expressive avatar work, production voice, production release controls, and genuine qualitative assessment are **not implemented by M4**.

## B. Current architecture

- `PetrosV2SessionService` owns admission, state transitions, typed commands, task issue, commitment, authorization rechecks, and public snapshots. Its repository extends the existing learning-session, command, event, intent, and workspace owners.
- `PetrosV2CommandWorker` registers with the existing queue workers and `ai` BullMQ queue. PostgreSQL command receipts are the durable dispatch source. Redis is transport, not the sole record of committed work.
- `PetrosV2AssessmentService` uses a separate restricted evaluator connection and one bounded private-instrument function. The normal application role cannot call it. Private reads complete before evaluation; no provider work runs inside a transaction.
- `PetrosEvidenceAdmissionService` appends V2 criterion observations into the existing objective-evidence command/event/outbox tables. V1 numeric readers filter their V1 branch. There is no new belief ledger or mastery store.
- The teaching-pack/curriculum owner registers and reviews immutable instruments and creates separately authorized student publications. The existing content-unit repository remains authoritative for source entitlement.
- Existing workspace session, checkpoint, and operation tables persist semantic canvas states. M0-P's reducer and strict action contracts are reused.

## C. Admission

The authenticated student is resolved again on each owned transaction. The service checks current account/role/permission, portal capability, student membership, institution, class/campus, subject/course mapping, enrollment, frozen release recipients, latest curriculum revision, exact proposal/source/activity/instrument versions, current independent reviews and qualifications, immutable source hash, source entitlement, revocation, and the default-off admission capability.

Entry creates expiring, owned V2 intents through the existing session-intent repository. Creation accepts an intent ID and command ID; client owner, approval, grade, task body, and state-patch fields are rejected. Expired, foreign, arbitrary, and unentitled intents are concealed as unavailable. Guidance attachments retain the original assignment and recipient visibility checks.

An existing owned resumable session can be returned. An already-started intent retains its session lineage, including a closed session. Closed sessions do not become active again. V1 intent readers reject V2 intents instead of interpreting their JSON as V1.

M4 does not need generative preparation to admit its bounded reviewed content. Unavailable material remains unavailable rather than receiving an invented preparation success.

## D. Session state machine

The durable execution stage is `admitting`, `planning`, `delivering`, `awaiting_response`, or `evaluating`. Existing `active`/`paused`/`closed` lifecycle status and a bounded authority-block reason represent orthogonal pause/block behavior. Public projection returns the approved M4 states without losing the underlying stage.

Admission records admitting → planning → delivering events in one transaction. `next` issues one task. A committed response advances to evaluating. Evaluation completion publishes feedback without manufacturing a subsequent adaptive task. Pause/resume/interrupt/close advance the epoch. Resume revalidates authority and restores the existing task/checkpoint. Closing preserves answers and evaluations. Re-admission is required after an authority block; stale callbacks cannot reactivate a closed or blocked session.

## E. Commands

Strict discriminated operations cover next, ask, hint, interrupt, defer, pause, resume, close, canvas edit/checkpoint, undo/redo, replay, and explicit activity submission. `ask` can reread reviewed public content outside an assessment; it is not an AI tutor. Hints follow the issued help policy and record assistance. Replay does not erase exposure.

Commands bind server owner/actor, UUID, canonical payload hash, expected revision, epoch, timestamps, and durable receipt. Identical retries return the same logical result; changed payload reuse conflicts. Session locks and optimistic revisions prevent last-write-wins updates. Submission serialization also respects the existing one-pending-command constraint. Stale client work remains local until reconciled.

## F. Database

The current journal already occupied 0235 and 0236. Added **0237_petros_v2_session_assessment.sql**, journal index 159, alongside replay-safe `sql/zzzzz_petros_m4.sql`. No historical migration SQL was rewritten. No configured database received a migration.

Additions include an immutable engine discriminator and bounded V2 state on existing sessions; three assessment tables for issued tasks, immutable committed responses, and append-only evaluations; composite ownership references; uniqueness for logical submission/evaluation; and a V2 reference branch in the existing evidence ledger. Workspace JSON checks retain their V1 branches. V1 credit-basis-point constraints remain intact.

Disposable tests rehearse transaction rollback, registered migration replay, repeated standalone ACL replay, old-row preservation hashes, and application/evaluator separation. The M3 SQL remains an unregistered proposal and is applied only inside disposable fixture databases. It is still a real-environment installation prerequisite.

There is no destructive down migration or production backfill. “Rollback tested” means an injected failure rolled back the complete additive transaction in a disposable database, not that production data was downgraded.

## G. Task issuance and exposure

Only a current reviewed instrument can issue a server-owned task. The task binds family/version/equivalence, public projection, private contract hash, objective and explicit criteria, source/publication/activity pins, help policy, issue time, and immutable instance hash.

Instruction issue, task issue, hints, replay, and solution-bearing source access append exposure records. The real material and guidance file owners record relevant source access after authorization. Equivalent repeat tasks remain observations and cannot inflate independent criterion counts. Exposure history is bounded conservatively; saturation cannot restore independence.

## H. Private assessment

Private instrument schemas remain server-only. Students receive explicitly constructed, strict public task and evaluation schemas. Rubrics, accepted alternatives, keys, discriminators, contract bodies, and evaluator authority receipts never pass through the student hook, canvas, tutor prompts, audio, or public event projection.

The normal `edrion_app` role cannot read private instrument candidates or execute `m4_private_instrument`. `edrion_petros_v2_evaluator` can execute that function for a currently authorized owned task, but receives no general application/academic write privilege. No unrestricted TTS endpoint was added.

## I. Response commitment

Typed text, choice, numeric, structured, and acknowledged canvas submissions bind the exact task, task instance, current revision/epoch, current canvas revision/checkpoint, immutable response/hash, exposure, owner, and command ID. The response and queued evaluation receipt commit atomically before queue dispatch.

Double-clicks and network retries cannot create another answer/evaluation. Committed work cannot be edited silently. Canvas submission freezes the invitation and stores the resulting accepted canvas revision. Client-proposed correctness and grades are rejected. Voice and models do not auto-submit.

## J. Evaluation and calibration

The registered kernel supports exact structured selections and approved numeric tolerance/unit checks. It evaluates each criterion separately. Correct numeric work cannot make an unsupported method selection pass; a calculation error does not erase a separately supported structural selection. These tests concern explicit supported contracts, not a semantic interpretation of prose reasoning.

Cloud demonstrates two deterministic responsibility-classification criteria, including correct and incorrect responses. English claim/evidence/explanation responses use the same issue/commit/worker infrastructure, but all qualitative criteria abstain into teacher review. Fluent, irrelevant, keyword-stuffed, ambiguous, and alternative prose cannot pass the deterministic kernel. Length and confidence do not establish understanding.

Unavailable evaluators preserve submitted work and return honest unavailable feedback. No genuine provider, controlled model score, or synthetic reviewer record is represented as academic correctness.

The calibration harness counts critical false acceptance once per response, so correlated criteria cannot inflate its binomial denominator. Fully correct and incorrect response counts are disjoint. It accepts bounded response/criterion labels with reviewer receipt references, rejects duplicates, computes criterion agreement and an exact one-sided 95% critical-false-acceptance upper bound, and checks the planned 500-response/two-subject/200-correct/200-incorrect/95%-agreement/2%-bound metrics. It always retains an independent dataset/reviewer-authority qualification requirement. **No such human-labelled dataset was fabricated or qualified.**

The prepared review workflow is a durable `review_required` receipt, preserved response and source/contract lineage, and reviewer-labelled calibration intake. A staffed qualitative adjudication interface and qualified evaluator route remain unavailable; M4 does not invent a teacher decision.

## K. Evidence admission and corrections

The admission service reloads canonical evaluation and response hashes and independently rechecks current publication/source authority. Both evaluation publication and evidence admission validate the exact reviewed criterion IDs, labels, checker types, and evaluator version through a server-only manifest containing no answers or rubric. Forged, omitted, or relabelled criteria cannot publish. Eligible deterministic, unassisted, non-equivalent criteria append observations to the existing learner-evidence owner exactly once. Assisted practice, equivalent repeats, abstentions, unavailable feedback, revocation, unsupported reasoning, and self-confidence do not become independent demonstrated learning.

No response awards mastery, transfer, retention, official marks, or a demonstrated-in-session claim. The later two-non-equivalent-task/explanation/unseen-application rule and actual delayed-retention rule remain future acceptance requirements.

Source/reviewer/proposal/instrument invalidation makes old pins unavailable. Reads and worker publication append invalidation/evidence-correction lineage rather than erasing the response or original evaluation. The current projection excludes superseded observations. V1 official marks are untouched. General human qualitative reassessment remains blocked on its qualification/review workflow; this slice supports safe invalidation, not an unapproved score-edit route.

## L. Canvas persistence

Reviewed session-mode canvases reuse the existing semantic reducer. Activity/branch/revision, semantic elements/relationships, editable invitation, accepted operation/checkpoint history, bounded draft, undo/redo lineage, source/activity pins, and immutable submission snapshot persist in the workspace owner.

Tests cover stale revisions/branches, protected/deleted targets, invalid relation endpoints, acknowledged reload, pause-save, incompatible redo, competing save/submit, and undo after commitment. A browser can edit a small text alternative and save meaningful work. Full M5 teaching-action selection and advanced interactive subject renderers are not enabled.

Existing stricter semantic action limits remain in force. M4 additionally bounds command JSON to 96 KiB, committed response JSON to 64 KiB, structured answers to 32 fields, string sizes, checkpoints to 500, undo history to 50, and exposure processing. No arbitrary scripts, HTML, JSX, SVG, or model-authored executable code runs.

## M. Recovery and reliability

Committed responses survive reload, pause, queue loss, duplicate delivery, and worker restart. Pausing does not discard an evaluation. Epoch changes fence obsolete presentation work; committed evaluation has its own lease/fence and may finish while paused or closed, with renewed authority checks before publication.

The worker scans durable due commands on startup and periodically, claims a bounded lease/fence, caps retries, and publishes one logical result. Crash-after-commit-before-ack and actual private Redis stop/restart tests passed. Expected injected crash and ECONNREFUSED logs are retained. They are not production queue/restart certification.

The 1,000-case workload comprises 400 identical retries, 200 payload conflicts, 200 stale revision/epoch attempts, and 200 foreign reads. Separate command/queue tests exercise crashes, lease expiry, cancellation by epoch, concurrent submission, and revocation. **This does not establish 1,000 distinct crash/cancel/revocation scenarios or the full wider release gate.**

## N. Two-subject source evidence

Both subjects use the same services; runtime has no Cloud/English subject dispatcher. Subject-specific content is confined to disposable reviewed fixtures.

| Fixture | Original source SHA-256 | Observed assessment |
| --- | --- | --- |
| Cloud service-model PPTX | `5ce5e6b855309556f0990ece00a6d7a2ecf7f7cb9a35f1b0a50b255c061e2c3b` | Exact responsibility/boundary classifications; correct, incorrect, assisted, and repeated cases |
| English argument PDF | `d63c78926db53b0f0da0c766bfb0c5a3c377f42d000273cae5a83e8ca567c007` | Source-backed claim/evidence passage; qualitative review required, including potentially defensible alternative |

The original files are parsed through M2. Controlled source proposals and synthetic independent review records test engineering contracts only. They do not resolve M2-G's genuine semantic inference or Cloud native/flattened-image limitations.

## O. Security

Current M4 restricted-role tests cover principal/intent ownership, concealed foreign resources, current membership, reviewed releases, private storage, immutable responses, exactly-once evidence, revocation, and role ACL replay. The 200 adversarial HTTP attempts exercise 20 boundary categories ten times each, plus three additional authentication/SQL/DTO checks. Zero observed private sentinel/key leaks occurred in that suite.

Legacy assistant, companion, V1 re-explanation/hint, and composer paths reject unrecorded help while an owned V2 question is outstanding, including while paused. Authorized external source retrieval records relevant exposure. HTTP routes use existing authentication/permission/portal/rate conventions, explicit origin protection, and no-store private responses.

This is boundary evidence, not proof that every possible privacy attack is impossible. The old M0-R/Phase-2 historical harness has unresolved compatibility failures documented below; current M4 tests do not certify live RLS.

## P. Student UI and accessibility

Added a restrained lesson entry, objective/progress rail, source-backed explanation, public assessment panel, acknowledged draft save, explicit submission, pending/review/feedback states, workspace disclosure, source context, pause/resume, and blocked-source screen. Technical epochs, hashes, qualification records, and evidence identifiers are absent from product flows. No avatar obstructs inputs.

The hook keeps public snapshots, revision/epoch, frozen idempotent submission retries, bounded polling, account-change resets, reconnect refresh, unsaved-work warnings, and draft reconciliation. Uncertain submission freezes editing until the original request is reconciled. Leaving/ending saves draft work first. An aborted development-mode load no longer leaves a false error after success.

Browser verification checked 1440, 1280, 768, 390, and 360px, no horizontal overflow, keyboard movement through answer inputs, draft pause/reload/resume, reload during evaluation, actual deterministic feedback, English review, source withdrawal, and V1 route dispatch. [An additional actual V1 browser check](m4-20261015T124002Z/final-20261015T170614Z/v1-browser-resume-pause.json) resumed and saved/paused the original session through successful HTTP lifecycle requests, returning it to paused. An earlier diagnostic used the wrong button name; no V1 product change was needed. Optional companion/voice/adaptive routes are intentionally not mounted in this bounded demo and may return unavailable; they are not enabled provider paths. Semantic labels, status announcements, visible focus, non-color-only feedback, and reduced-motion styling are provided. Physical devices, a human screen-reader study, and independent contrast/accessibility certification were not performed.

[View all eight required screenshots](m4-20261015T124002Z/demo-final-review-20261015T174107Z/screenshots.html) and [18 passing browser checks](m4-20261015T124002Z/demo-final-review-20261015T174107Z/browser/browser-results.json).

## Q. Performance

Measured on Apple M4, 16 GiB RAM, macOS 27.0.1, Node 24.21.0, disposable PostgreSQL 15 over a private Unix socket; other user development processes were running. No provider was called. Raw samples and browser navigation timings are linked in the evidence directory.

The reliability run measured 50 warm resumable admissions plus one initial admission, 50 snapshot reads, 400 duplicate-command requests, and 50 restricted evaluator reads/kernel checks. Warm resumable admission p95 was 344.94ms (50 samples); the mixed 51-admission sample p95 was 349.65ms, snapshot p95 208.86ms, duplicate request p95 367.37ms, evaluator p95 89.02ms. The initial admission was 792.10ms. These are fixture observations, not guarantees for new real lessons, cold starts, or providers.

Browser load timings include Next development compilation where cold. The pending demo deliberately delays the synthetic evaluator by eight seconds to make the saved pending state visible; this is not provider latency. Queue time, database-only round-trip latency, response-commit time, worker time, and recovery time were not separately instrumented into statistically qualified distributions. No p95 is inferred from the two queue scenarios. Qualitative provider performance is unmeasured. The wider performance qualification remains open.

## R. Tests, exact commands, and limitations

All commands used the repository with explicit Node 24 and no dotenv/configured target migration. Tests which allocate PostgreSQL/Redis create and remove only their private resources. Historical evidence writers now accept `PETROS_VERIFICATION_EVIDENCE_DIR` and write into timestamped M4 output.

Execution results and [exact recorded verification commands](m4-20261015T124002Z/final-20261015T170614Z/executed-commands.json) are recorded in the adjacent evidence files and the generated result index. Repeated runs are not added together as unique tests. The final M4 count uses successful per-file reruns where an earlier timeout or fixture preparation failed.

The initial comprehensive M4 run had 1,244 passes and three failures: a five-second command-test timeout, a sixty-second performance-test timeout under concurrent build/test load, and a dependent assertion after that timeout. A later serial command run passed all eight tests; the reliability rerun completed its 1,002 tests with a longer explicit measurement timeout. Another retry encountered M2 preparation infrastructure failure before its command assertions; that failed receipt is retained, followed by the passing standalone run. New admission/assistance/unavailable boundaries passed six tests.

The full student suite initially passed 376 before the new panel tests. The later 381-test collection had 379 passes and two timing-sensitive failures in existing V1 workspace/session tests. Those two files plus the new panel passed all 42 checks serially. The result index identifies each file and avoids claiming an uninterrupted whole-repository pass. The final numeric-unit panel check passed too: six M4 panel tests; 382 distinct successful student checks when the per-file reruns are reconciled, not one uninterrupted final collection.

The original M0-R/Phase-2 run failed on duplicate historical worker-role creation and an earlier RLS rejection than the legacy FK assertion expected. A diagnostic fixture adaptation then exposed later-policy/historical-journal incompatibilities and 32 assertion failures. A strictly historical diagnostic replay also failed during setup because current standalone SQL expects later tables. **The historical fixture and owner-link test were restored to their exact original code; these diagnostic attempts do not qualify that gate.** Reconciliation of that independent historical rehearsal remains required before wider release. Current M4 ownership/migration tests passed, but do not replace the historical gate.

A final criterion-boundary run hit system-disk exhaustion in the disposable database and API build. Its failure logs remain preserved. Only M4-generated temporary build directories were moved to the external volume. The affected assessment/command files then passed all 28 checks, including the added forged-criterion test. The other five files in that run passed 216 checks. No unrelated old database cluster or process was removed.

No full monorepo lint/build/test claim is made. Configured-target, genuine provider, human academic calibration, physical-device, and production restart tests were not run.

Reproduce M4 on a clean environment with Node 24 and PostgreSQL/Redis executables:

```sh
cd '/Volumes/Chris/Edrion Labs/apps/api'
node scripts/verify-petros-m4.mjs
```

The runner refuses configured database/PG targets and command-line target arguments and creates a new timestamped evidence directory. Browser verification requires the disposable demo and uses `scripts/verify-petros-m4-browser.mjs` with a new `PETROS_M4_EVIDENCE_DIR`.


### Recorded result index

| Execution | Passed | Failed assertions | Skipped assertions |
| --- | ---: | ---: | ---: |
| [api-default](m4-20261015T124002Z/verification-20261015T132803Z/api-default.json) | 1181 | 0 | 1608 |
| [m1-reconciled](m4-20261015T124002Z/verification-20261015T132803Z/m1-reconciled.json) | 19 | 0 | 0 |
| [m2-m3](m4-20261015T124002Z/verification-20261015T132803Z/m2-m3.json) | 73 | 0 | 0 |
| [authority-v1](m4-20261015T124002Z/verification-20261015T132803Z/authority-v1.json) | 108 | 0 | 19 |
| [affected-v1](m4-20261015T124002Z/final-20261015T170614Z/affected-v1.json) | 282 | 0 | 102 |
| [schemas-final](m4-20261015T124002Z/final-20261015T170614Z/schemas-final.json) | 578 | 0 | 0 |
| [student-final](m4-20261015T124002Z/final-20261015T170614Z/student-final.json) | 379 | 2 | 0 |
| [student-reconciled](m4-20261015T124002Z/final-20261015T170614Z/student-reconciled.json) | 42 | 0 | 0 |
| [learn-evals](m4-20261015T124002Z/final-20261015T170614Z/learn-evals.json) | 46 | 0 | 0 |
| [m4](m4-20261015T124002Z/final-20261015T170614Z/m4.json) | 1244 | 3 | 0 |
| [m4-reconciled](m4-20261015T124002Z/final-20261015T170614Z/m4-reconciled.json) | 1010 | 0 | 8 |
| [commands-final](m4-20261015T124002Z/final-20261015T170614Z/commands-final.json) | 8 | 0 | 0 |
| [rls-reconciled](m4-20261015T124002Z/final-20261015T170614Z/rls-reconciled.json) | 34 | 32 | 0 |
| [m0r-historical](m4-20261015T124002Z/final-20261015T170614Z/m0r-historical.json) | 3 | 0 | 62 |
| [criteria-boundary-final](m4-20261015T124002Z/final-20261015T170614Z/criteria-boundary-final.json) | 235 | 1 | 8 |
| [assessment-commands-final](m4-20261015T124002Z/final-20261015T170614Z/assessment-commands-final.json) | 28 | 0 | 0 |
| [student-panel-final](m4-20261015T124002Z/final-20261015T170614Z/student-panel-final.json) | 6 | 0 | 0 |

| [calibration-final](m4-20261015T124002Z/final-20261015T170614Z/calibration-final.json) | 4 | 0 | 0 |


Final successful M4 per-file union: **1255 checks across 10 files**, including 203 privacy boundary cases, 1,002 reliability/compatibility cases, and six additional admission/assistance/unavailable-evaluator cases. The failed attempts above remain retained. Setup failures can report zero failed assertions while still failing the suite; consult `failedFiles` in [results-index.json](m4-20261015T124002Z/final-20261015T170614Z/results-index.json).

API and student typechecks passed. Database and schemas typechecks passed. API production TypeScript emission to `/tmp/petros-m4-api-final` passed ([build log](m4-20261015T124002Z/final-20261015T170614Z/api-build-handoff.log)); the ordinary in-place dist/asset-packaging step was not run over an existing build. The isolated student production build passed ([build log](m4-20261015T124002Z/final-20261015T170614Z/student-build-final.log)). [Targeted lint](m4-20261015T124002Z/final-20261015T170614Z/lint-verified.log) passed with zero errors and 15 warnings (14 constructor/runtime-type-import suggestions and one fixture type-import style warning); no whole-monorepo lint claim is made.

## S. Preservation

The starting inventory recorded 5,849 SHA-256/size baselines and the dirty Git status in `m4-20261015T124002Z/baseline.json` and `git-status.txt`. The checkout already contained extensive uncommitted M0–M3 and unrelated changes. No reset, stash, clean, staging, or commit was performed.

Verification uses new timestamped directories. Historical migration SQL and reports are compared against the baseline. The new journal entry is additive. The current OS also updated the journal's AppleDouble metadata. A pre-existing M3 development server appended its web log while HMR observed repository changes; the audit distinguishes that active log from overwritten historical reports.

A broad formatting command accidentally touched pre-existing Playground files. Exact original source copies recovered from build source maps and prior local command receipts are accepted only when their SHA-256 matches the starting baseline. **All pre-existing Playground files were restored to their exact starting hashes; no formatting-only exceptions remain.** The final preservation audit records 5,822 unchanged baseline files, no missing files, and all 243 pre-existing migration-tree SQL scripts unchanged (excluding AppleDouble sidecars). One pre-existing M3 server log has an unchanged original byte prefix and 224 appended bytes; it was not overwritten. See [preservation-handoff.json](m4-20261015T124002Z/final-20261015T170614Z/preservation-handoff.json) and the supplementary clean-start tracked-file hashes. No missing historical evidence is reconstructed and represented as original. M3's previously disclosed two irrecoverable database receipts remain irrecoverable and outside this milestone's evidence.

Implementation hashes: [40 M4 source/test/runner files](m4-20261015T124002Z/final-20261015T170614Z/implementation-files.json); [tracked clean-start changes](m4-20261015T124002Z/final-20261015T170614Z/tracked-clean-start-changes.json); [frozen evidence hashes](m4-20261015T124002Z/final-20261015T170614Z/handoff-artifact-hashes.json).

## T. Open blockers

- Genuine independent semantic inference and real-provider qualification remain unavailable; no paid inference authorization was granted.
- Qualitative assessment calibration, human-labelled corpus, independent reviewer/course/source/publication authority for actual materials, and actual student-release authorization remain open.
- M2-G Cloud native recovery, the flattened-image relationship, persistent derived-asset storage/purge, parser/worker restart qualification, legacy PPT qualification, and the uninstalled staff-source reservation SQL proposal remain open.
- M3 proposal SQL, production/staging database prerequisites, live RLS/security certification, and production queue recovery remain uninstalled/unqualified.
- The old M0-R/Phase-2 historical regression harness needs reconciliation with the current migration history and standalone policies; its failed diagnostics are retained.
- Manual student UI approval is mandatory. No real seven-day retention, demonstrated learning improvement, official grading, M5 orchestration, M6 redesign, M7 voice, or M8 release certification is claimed.

## U. M5 readiness

M4 provides the structural persistence, task, commitment, private evaluation, and workspace boundaries an adaptive engine would need. This is an **isolated engineering review candidate**, not a real student release. M5 must wait for manual visual approval and reconciliation of the historical regression harness; the preservation exception is the disclosed append-only active-server log. It has not been started automatically.

## V. Manual testing instructions

The [localhost guide](m4-manual-testing.md) and [screenshot gallery](m4-20261015T124002Z/demo-final-review-20261015T174107Z/screenshots.html) linked with this report contain the exact live URLs and all eight required states. Use the isolated synthetic institutional student handoffs on port 4943; the real Next student app runs on port 4944. No real account or credentials are needed. Use `127.0.0.1` consistently so the signed test cookie remains on the same host.

Review lesson entry, read the explanation, issue a question, choose answers, save a draft, pause, reload, resume, explicitly submit, observe saved/pending and actual feedback, inspect source context, and open the withdrawn-source state. English must say teacher review is needed. At 360px verify controls remain readable and reachable. Open V1 through its separate handoff and verify the original paused session interface.

**Stop after M4. Human visual review and approval are required before M5.**

## Acceptance review matrix

| # | Requirement | M4 review status |
| ---: | --- | --- |
| 1 | Principal-derived authorization | Implemented; restricted-role ownership and membership tests |
| 2 | Foreign-session concealment | Tested; ownership and adversarial HTTP suite |
| 3 | Unreleased lesson denial | Implemented; intent/publication/source/review gates |
| 4 | Synthetic authorized release flow | Tested and demonstrated; fixture reviews only |
| 5 | Server-pinned engine | Tested; owned engine discriminator |
| 6 | V1 preservation | Tested lifecycle, route, numeric constraints and regression reruns; historical harness limitation remains |
| 7 | Durable valid state | Tested command/state persistence |
| 8 | Revision/hash/epoch checks | Tested |
| 9 | Duplicate command, one logical result | 400 repeated cases plus command tests |
| 10 | Payload reuse conflict | 200 repeated cases plus command tests |
| 11 | Exact reviewed task/source pins | Implemented and tested |
| 12 | Issue/reveal exposure | Tested task, hint, replay and source-access paths |
| 13 | Public/private separation | 203 boundary checks and browser/bundle scan |
| 14 | Issued-instance commitment | Tested wrong task/hash/epoch rejection |
| 15 | Atomic immutable response | Tested transaction and append-only role ACLs |
| 16 | Duplicate-response prevention | Tested concurrent submission and queue publication |
| 17 | Deterministic goldens | 16 kernel cases; fixture correct/incorrect classifications |
| 18 | Qualitative abstention | Tested and demonstrated for English |
| 19 | Fluent/keyword text cannot pass | Tested unsupported prose and confidence cases |
| 20 | Criterion/completion separation | Tested; exact manifest validation |
| 21 | Assistance exclusion | Tested hint and source-bearing exposure |
| 22 | Equivalent-repeat exclusion | Tested; repeat receipts persist |
| 23 | No single-answer mastery | Always false; tested |
| 24 | Current mapped evidence | Canonical source/publication/criterion checks; tested forged mapping |
| 25 | Revoked evidence exclusion | Tested reviewer/source invalidation |
| 26 | History preservation | Append-only response/evaluation/evidence correction tests |
| 27 | Canvas checkpointing | Five canvas integration cases |
| 28 | Immutable assessed snapshot | Tested save/submit conflict and frozen invitation |
| 29 | Pause/resume work retention | Integration and actual browser checks |
| 30 | Reload during evaluation | Actual browser check; answer retained |
| 31 | Worker duplicate/crash recovery | Real BullMQ/Redis plus fence/lease tests |
| 32 | Source withdrawal | Integration and blocked-source demonstration |
| 33 | Reviewer revocation | Final assessment rerun passed |
| 34 | No observed API/log/bundle answer leak | 200 adversarial attempts, role checks, bundle/log scan; bounded claim |
| 35 | Two generic subject flows | Tested and demonstrated |
| 36 | Readable focused UI | Implemented; human visual approval pending |
| 37 | Mobile/keyboard use | Browser emulation at five widths; human/physical-device gate open |
| 38 | No fabricated genuine inference | No provider calls; qualitative review remains unavailable |
| 39 | No deployment or actual release | No configured-target migration/deployment executed |
| 40 | Historical evidence preservation | 5,849 baselines; append-only active-log exception and historical M3 missing receipts disclosed |
| 41 | Applicable regressions | Current suites and reruns pass; old M0-R/Phase-2 harness unresolved |
| 42 | Reproducibility | Timestamped runner, exact command receipts, fixtures and browser script |
| 43 | Remaining gates explicit | Section T; no release certification |
| 44 | Manual instructions | m4-manual-testing.md; eight screenshots and live handoffs |
| 45 | Stop at M4 | M5 not begun; human approval required |
