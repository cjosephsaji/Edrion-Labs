# Petros Phase 5 verification results

3 October 2026. **Authorized independent engineering work implemented and verified; full engineering exit blocked by R1 Firefox runtime. Real pilot acceptance pending.** P5-E1–E8 pass. Chromium and WebKit pass the final styled journeys; Firefox cannot launch before page creation on this host, so P5-E9/E10 full browser completeness does not pass. Stop at this specific unavailable dependency after completing independent work. Do not claim the complete Phase 5 pilot exit or unqualified engineering readiness.

All new admissions remain default-off. No learners were enrolled, educators contacted, live data collected, real messages delivered or paid provider calls made. No commit, push, PR, publication, deployment or Phase 6 occurred. Generated executable extensions, new guardian sharing, unrequired partner delivery, independent accounts and full offline remain gated. Existing dirty work, protected dumps and historical evidence were preserved.

## Identity and evidence authority

The fresh [entry identity](verification/petros-phase5-20261003/entry/identity.json) matches Phase 4's supplied source manifest `2ae29edfafa19c3e4712aa2eb2419c883ff9afdd99a92b07d1e8dbcbcd205e40` (2,612 files). This authorizes the comparison only; Phase 4 results are not inherited across the Phase 5 edits. The affected Phase 1–4/security checks below were rerun on the final identity.

| Identity | Recorded value |
|---|---|
| HEAD / branch | `89c1ca29c117b2f9926e97e12a2738fa110cd2ca` / `new-student-UI` |
| Final freeze UTC | `2026-10-03T08:34:55.230568+00:00` |
| Final implementation manifest | `55f11e10edaca878b246fa62061029822cb74728569ca5581c96148d1f4dc8de` |
| Selected files | 2,640, including 259 nonignored untracked source files |
| Post-verification UTC | `2026-10-03T08:56:13.861985+00:00` |
| Identity records | [frozen-final-r5](verification/petros-phase5-20261003/frozen-final-r5/identity.json), [verified-final-r5](verification/petros-phase5-20261003/verified-final-r5/identity.json), [closing-final-r5](verification/petros-phase5-20261003/closing-final-r5/identity.json) |

Frozen, verified and closing source/protected hashes are reconfirmed by the closing verification record. The changing results, harness execution ledger and dated evidence are excluded under the documented manifest scope and separately hashed in the [artifact index](verification/petros-phase5-20261003/artifact-index.json). A tracked diff hash is diagnostic and is not the application manifest. The [entry-to-final change manifest](verification/petros-phase5-20261003/implementation-change-manifest.json) identifies 51 changed/added selected files against the already dirty entry, preserving unchanged user work.

| Protected file | Unchanged SHA-256 |
|---|---|
| `pnpm-lock.yaml` | `803ebf8798958d62a0a7e5ef905a97240c98e97b0d7dadcbff45027123378808` |
| `edrion_database_dump.sql` | `6a3d616e8f215a071a25c7ed717f6b03a2aee514ecce87ef2b7dbb5a512f4b4d` |
| `edrion_database_dump.sql.gz` | `a281acd5986dac80e4b0326b7f2c9a09249f73411ffd4951c59c01ddc5eb918b` |
| `docs/PETROS-PHASE-1-VERIFICATION-RESULTS.md` | `4ded55f3a32a0df70da581551596e27c045658c606989da6ddaed780df0b47d8` |

## Engineering gate decisions

The [verification plan](PETROS-PHASE-5-VERIFICATION-PLAN.md) defined engineering and external gates before implementation. Current production owners are traced in the [owner matrix](PETROS-PHASE-5-OWNER-MATRIX.md); implementation choices and limits are in the [decisions](PETROS-PHASE-5-DECISIONS.md).

| Gate | Result and executed boundary |
|---|---|
| P5-E1 identity/isolation | PASS: fresh comparison, disposable app-role PostgreSQL/Redis, controlled transports, final source/protected hash reconfirmation and scoped cleanup |
| P5-E2 production quality | PASS: actual extraction/readiness/retrieval/citation/source/pack/objective/loop owners; objective versus qualitative evidence, correction/forgetting, delayed review, teacher corrections/cohorts/interventions and applicable native institutional closure. Deterministic assertions and malformed controlled-model rejection are separate from human judgment |
| P5-E3 chaos/authority | PASS: provider failures/timeouts/cancellation; real BullMQ/Redis dispatch loss; persisted lease expiry/reclaim; transaction/audit/receipt/storage failures; duplicate/lost replies; concurrent owners/devices; source, approval, permission, membership and policy changes; context correction/deletion. New critical durable paths repeat across two owners/two tenants |
| P5-E4 release gates | PASS: strict versioned contracts; immutable evaluations/bundles/disables; current source/prompt/schema/policy/model/routing/config/report/expiry checks; atomic audit/replay; exact evaluated rollback; per-attempt gateway rechecks and settled-but-denied reply accounting |
| P5-E5 pilot preparation/privacy | PASS for engineering preparation: stable synthetic cohort, explicit eligibility, authenticated admission always false; collector default-off and restricted to a disposable test bootstrap; minimal allowlisted immutable events, replay/audit/current authority; no objective mastery created |
| P5-E6 operations | PASS: actual aggregate queue/recovery, owner latency, attempts/failed/cancelled/retried costs, all-age open reservations, failures/denials/release status. Restricted aggregate SQL projections, scoped-context denial and insufficient-owner fail-closed checks; styled ai.view operator dashboard contains no private conversations/memories/drafts |
| P5-E7 release/recovery | PASS: checked-in journal, migrations and grant replay on disposable PostgreSQL; 0230 FORCE RLS/immutable SELECT+INSERT-only app grants/no PUBLIC helper execution; disabled candidate denied and exact current evaluated rollback executed; evidence/citations preserved |
| P5-E8 performance/cost | PASS: declared actual-owner workload and local environment, cold/warm distributions below; controlled attempts, retries/failures/cancellations and concurrent reservations/settlement. No production SLO or cost-budget approval inferred |
| P5-E9 visual/accessibility | Chromium/WebKit software checks PASS; full gate BLOCKED R1 Firefox. Held-out numeric/composition/unit/replay/resource-limit/forbidden-capability suites pass; desktop/mobile, keyboard/focus/nonvisual/reduced-motion/interruption/recovery checked; screenshots inspected. Physical devices, AT and qualified human acceptance remain external |
| P5-E10 closure | Executed tests/typechecks/lint/builds/Chromium/WebKit journeys PASS on frozen-r5; full browser matrix BLOCKED R1. A launch failure is not a passed or skipped journey |

## Executed final closure

Every linked command record contains exact argv, UTC interval, exit code and environment overrides; raw logs retain failures intentionally injected by passing tests. [Environment record](verification/petros-phase5-20261003/final-r5-environment.json): macOS27.0.1/Darwin27 arm64, Node25.6.0, pnpm11.1.2, PostgreSQL15.15, Redis8.4.0, 10 CPUs and 16GiB memory. Disposable PostgreSQL uses APFS with application role `edrion_app/NOBYPASSRLS`; no root application credentials or shared databases were used. Disk was checked before fixtures/builds. Web builds used isolated copies without workspace .env files or shared build outputs.

| Command record / raw log | UTC interval | Exit | Outcome |
|---|---|---:|---|
| [api](verification/petros-phase5-20261003/final-r5-api.json) / [raw log](verification/petros-phase5-20261003/final-r5-api.log) | 2026-10-03T08:47:33.843227+00:00 → 2026-10-03T08:50:22.552394+00:00 | 0 | 81 files / 628 tests, including app-role PostgreSQL, Redis and migration/security closure |
| [schema-student-tests](verification/petros-phase5-20261003/final-r5-schema-student-tests.json) / [raw log](verification/petros-phase5-20261003/final-r5-schema-student-tests.log) | 2026-10-03T08:50:22.599387+00:00 → 2026-10-03T08:50:41.132892+00:00 | 0 | 62 schema files / 485 tests; 37 student files / 197 tests |
| [typechecks](verification/petros-phase5-20261003/final-r5-typechecks.json) / [raw log](verification/petros-phase5-20261003/final-r5-typechecks.log) | 2026-10-03T08:50:41.195957+00:00 → 2026-10-03T08:51:24.376210+00:00 | 0 | Eight packages passed |
| [lint](verification/petros-phase5-20261003/final-r5-lint.json) / [raw log](verification/petros-phase5-20261003/final-r5-lint.log) | 2026-10-03T08:51:24.425053+00:00 → 2026-10-03T08:51:37.457562+00:00 | 0 | Seven packages; zero errors; API has 771 warnings |
| [eval-fixtures](verification/petros-phase5-20261003/final-r5-eval-fixtures.json) / [raw log](verification/petros-phase5-20261003/final-r5-eval-fixtures.log) | 2026-10-03T08:51:37.500517+00:00 → 2026-10-03T08:51:38.236092+00:00 | 0 | Versioned fixture validation passed |
| [eval-tests](verification/petros-phase5-20261003/final-r5-eval-tests.json) / [raw log](verification/petros-phase5-20261003/final-r5-eval-tests.log) | 2026-10-03T08:51:38.270727+00:00 → 2026-10-03T08:51:40.722310+00:00 | 0 | 5 files / 46 tests |
| [eval-corpus](verification/petros-phase5-20261003/final-r5-eval-corpus.json) / [raw log](verification/petros-phase5-20261003/final-r5-eval-corpus.log) | 2026-10-03T08:51:40.765861+00:00 → 2026-10-03T08:51:43.294351+00:00 | 0 | 240 fixture sessions, 30 topics × 8 personas; zero blocking failures/warnings/cost |
| [api-build](verification/petros-phase5-20261003/final-r5-api-build.json) / [raw log](verification/petros-phase5-20261003/final-r5-api-build.log) | 2026-10-03T08:51:43.448867+00:00 → 2026-10-03T08:52:14.474789+00:00 | 0 | API production build passed |
| [student-web-build](verification/petros-phase5-20261003/final-r5-student-web-build.json) / [raw log](verification/petros-phase5-20261003/final-r5-student-web-build.log) | 2026-10-03T08:52:14.515019+00:00 → 2026-10-03T08:52:46.725635+00:00 | 0 | Isolated student production build passed |
| [institution-web-build](verification/petros-phase5-20261003/final-r5-institution-web-build.json) / [raw log](verification/petros-phase5-20261003/final-r5-institution-web-build.log) | 2026-10-03T08:52:46.766655+00:00 → 2026-10-03T08:53:25.571484+00:00 | 0 | Isolated institution production build passed |
| [super-admin-web-build](verification/petros-phase5-20261003/final-r5-super-admin-web-build.json) / [raw log](verification/petros-phase5-20261003/final-r5-super-admin-web-build.log) | 2026-10-03T08:53:25.603227+00:00 → 2026-10-03T08:53:51.296490+00:00 | 0 | Isolated super-admin production build passed |
| [diff-check](verification/petros-phase5-20261003/final-r5-diff-check.json) / [raw log](verification/petros-phase5-20261003/final-r5-diff-check.log) | 2026-10-03T08:53:51.341181+00:00 → 2026-10-03T08:53:51.434403+00:00 | 0 | Diff hygiene passed |
| [browser-chromium-production](verification/petros-phase5-20261003/final-r5-browser-chromium-production.json) / [raw log](verification/petros-phase5-20261003/final-r5-browser-chromium-production.log) | 2026-10-03T08:44:59.602126+00:00 → 2026-10-03T08:46:03.490245+00:00 | 0 | Chrome154: 61 checkpoints, zero page errors |
| [browser-webkit-production](verification/petros-phase5-20261003/final-r5-browser-webkit-production.json) / [raw log](verification/petros-phase5-20261003/final-r5-browser-webkit-production.log) | 2026-10-03T08:41:20.952902+00:00 → 2026-10-03T08:42:27.661126+00:00 | 0 | WebKit26.5: 61 checkpoints, zero page errors |

The legacy 240-session fixture corpus is a deterministic simulator check, distinct from production-owner evaluation and qualified educator review. Its 4.99 synthetic score and zero reported fixture latency do not measure learning efficacy, model quality or production latency. The new CI production-owner job is implemented and exercised locally through the commands above; no remote workflow was dispatched.

## Chaos, rollback and operational evidence

The [chaos/recovery/rehearsal index](verification/petros-phase5-20261003/chaos-recovery-rehearsal-index.json) binds all 81 executed API test sources/case names to their hashes and final raw log. The release owner rehearses immutable import/register/activation/disable/exact rollback and audited failure retry. The gateway verifies stale configuration causes zero adapter calls, a release disabled during a response settles one seven-micro controlled attempt then denies delivery without fallback/double settlement, and exact rollback plus two concurrent tenant calls settle once each (four controlled dispatches, 28 synthetic cost micros total).

Migration 0230 replay drops only explicit fixture tables/functions without CASCADE on disposable infrastructure, replays SQL/grants and compares FORCE RLS, policies, immutability and helper privileges. This is a disposable DDL rehearsal, not a destructive production downgrade or backup restoration. Operational rollback activates the exact recorded evaluated prompt/schema version while retaining release/audit/evidence/citation history and all current authority/expiry checks. The [operator runbook](PETROS-PHASE-5-OPERATOR-RUNBOOK.md) gives actual routes, permissions, incident containment, drain/cancel, recovery and rollback procedures. No deployment is authorized.

Production release identities remain unconfigured and real pilot admission is unavailable. Existing Phase 4 built-in prompt compatibility remains where no release record exists; all new administrative activation requires current release evidence. The [engineering evidence bundle](verification/petros-phase5-20261003/engineering-release-bundle.json) binds application/migration/prompt-schema/policy/routing/fixture/evaluator/source-pack identities and final commands. It is a review artifact, not an activatable production release manifest, and fixture identities must not be installed in a live environment.

Operational thresholds are proposed investigation triggers only: unavailable queues, expired/ambiguous leases or reservations, failing/stale release evidence, unexpected denials, and current authority changes require investigation with admissions off. Numeric latency samples retain at most 512 recent values per operation and reset on API restart. No production SLO, budget or institutional acceptance authority exists. No speculative performance optimization was made from local fixture samples.

## Declared performance workload

The [production-owner quality/performance report](verification/petros-phase5-20261003/production-quality-performance-final.json) records fixture `phase2-authority-fixture.v1`, exact source SHA-256 versions, teaching-pack version1, current knowledge-policy versions/hashes, prompt `stage4-plan-v1`, output schema `petros.plan.v3`, controlled model `malformed-output-fixture.v1` and evaluator `deterministic-owner-assertions.v1`. Two owners/two tenants run sequentially; each operation has one first-service sample per fixture and repeated warm reads. Cold means first service read/continuation for that fixture; OS/server caches were not flushed. Two malformed controlled-model outputs are rejected and deterministic approved-pack fallback is verified; paid calls are zero. This is not model-quality acceptance.

| Actual operation | Samples | Min ms | p50 ms | p95 ms | Max ms |
|---|---:|---:|---:|---:|---:|
| sourceResolveCold | 2 | 1.35 | 1.35 | 2.76 | 2.76 |
| sourceResolveWarm | 40 | 1.34 | 1.41 | 1.83 | 5.44 |
| retrievalCold | 2 | 1.53 | 1.53 | 3.76 | 3.76 |
| retrievalWarm | 40 | 1.37 | 1.44 | 2.43 | 2.84 |
| teachingStartCold | 2 | 642.39 | 642.39 | 659.97 | 659.97 |
| teachingDocumentWarm | 40 | 92.69 | 93.85 | 99.20 | 102.26 |

These are local descriptive measurements with no accepted thresholds. Two first-read samples are insufficient to estimate production tail latency; the raw values and environment are preserved for a future authorized workload/SLO review.

## Browser and unavailable dependency R1

Final [Chromium report](verification/petros-phase5-20261003/browser/chromium/browser-journey.json) (GoogleChrome154.0.8037.95) and [WebKit report](verification/petros-phase5-20261003/browser/webkit/browser-journey.json) (26.5, Playwright1.61.1) each pass 61 checkpoints and zero page errors through styled authenticated student, teacher A/B and ai.view operator applications with full AppModule, disposable app-role PostgreSQL/Redis and controlled providers. Student pages were served from an isolated production build. Teacher/operator styles used isolated fixture app copies. Closed server summaries confirm two controlled companion calls per journey.

Coverage includes actual IndexedDB offline note storage/page close/reopen/once-only reconciliation, durable pause/resume/scene refresh, lost reply/exact retry, current source denial after teacher correction, separate independent teacher review, memory correction/forgetting, controlled next-day JavaScript clock, held-out pendulum/DC/RC/spatial/mixed composition, fresh desktop/mobile numeric replay (1e-8 tolerance), units, keyboard expansion/restored focus, reduced motion, nonvisual alternatives, 390px mobile overflow checks and controlled root-font 16→32px enlargement. Browser root-font enlargement is not native browser-chrome zoom. A controlled narration boundary is not actual microphone/speech/voice equipment acceptance. Generated executable extensions remain disabled; forbidden capabilities and bounded declarative resource rejection do not prove executable isolation.

Eight final screenshots were visually inspected in the [visual review](verification/petros-phase5-20261003/browser-visual-review.json); final per-engine screenshot directories remain available with the reports. The inspection is engineering software evidence, not qualified human accessibility approval.

**R1:** Firefox151.0, Playwright build1532, on macOS27/Darwin27 cannot complete launch/page creation. Final attempt [command record](verification/petros-phase5-20261003/final-r5-browser-firefox.json) ran 08:35:10.371149–08:35:30.931749 UTC, exit1, with a 20-second launch timeout, `sandbox_extension_issue_file_to_process ... Operation not permitted` and `RenderCompositorSWGL failed mapping default framebuffer` in the [raw log](verification/petros-phase5-20261003/final-r5-browser-firefox.log). APFS relocation, headless, headed and bounded disposable-profile compatibility diagnostics also failed; their raw logs are indexed in the evidence bundle. No host security settings or system clock were changed. Retry the unchanged final-source journey on a working supported Firefox host/runtime; retain its actual versions, commands, assertions, page-error count and screenshots. Until that evidence exists, P5-E9/E10 full browser completeness and the unqualified engineering exit remain blocked.

## External acceptance and limits

The [acceptance packets](PETROS-PHASE-5-ACCEPTANCE-PACKETS.md) provide reviewable reviewer qualifications/responsibilities, curriculum adoption, candidate cohort/age/language/accessibility eligibility, consent/privacy/retention/sharing, outcome hypotheses/measurement/exclusions/stopping rules, human equipment protocols and incident/rollback responsibilities. Named qualified reviewers and institutional/pilot authorities are **UNASSIGNED/PENDING**; the proposed adult English synthetic scope is a candidate only.

| External gate | Unavailable authority/evidence |
|---|---|
| X1 educator/qualitative fairness | No named qualified educator, independently approved answer keys/content, real qualitative/fairness or learning judgments |
| X2 curriculum/source | No canonical curriculum or source adoption by an authorized institution |
| X3 consent/privacy/retention | No consent/age/cohort/language/sharing policy adoption or institutional retention/erasure approval; no legal-compliance claim |
| X4 physical accessibility | No actual physical-device, screen-reader/AT, native zoom or qualified human acceptance evidence; precise protocol prepared |
| X5 real pilot/outcomes | No learner-pilot authorization/enrollment, live instrumentation, preregistered accepted study or real delayed independent outcome evidence |
| X6 optional institutional capabilities | Guardian sharing, unrequired partners, grade reconciliation and full offline remain gated/disabled; no partner certification or reconciliation acceptance. Applicable native curriculum/mapping/classroom/assignment authority checks pass synthetically |
| X7 executable isolation | Generated executable extensions disabled; separate isolation gate unproved |

Synthetic evaluators do not impersonate educators and cannot close these gates. No complete Phase 5 pilot exit, useful learning outcome, legal compliance, certification, executable isolation or rollout is claimed.

## Repairs, preservation and cleanup

Failed candidates remain in the dated directory and are excluded from final PASS attribution. Repairs addressed migration helper replay, a delayed-review clock assumption, actual operator notification permission checks, an empty quality-evaluation state, a single main landmark, favicon errors and WebKit pointer-focus restoration. Read-only navigation retry is bounded to observed interrupted-navigation errors. Development HMR/late requests produced page errors in an earlier WebKit candidate; the final isolated production-served student journeys pass without relaxing the zero-page-error gate. Firefox remains a failed launch dependency.

An earlier post-run source mismatch consisted only of four newly generated task-owned corpus outputs. Those outputs were copied byte-for-byte into dated evidence before removing only their generated originals; no implementation/user source was discarded. Final-r5 corpus relocation records the same ownership/byte checks. Prior freeze candidates and failure logs remain historical evidence, not the final identity.

[Cleanup record](verification/petros-phase5-20261003/cleanup-record.json) confirms task-owned fixture servers closed with exit0, disposable PostgreSQL/Redis workers closed, temporary runtime/build directories and synthetic metadata removed, and shared host PostgreSQL/Redis retained. No active worker remains needed; lightweight agent work is complete. Closing disk availability is 11GiB APFS and 243GiB workspace. No host clock changes, shared database use, protected dump loading, credential fixture loading, destructive user cleanup or unrelated chat alteration occurred.
