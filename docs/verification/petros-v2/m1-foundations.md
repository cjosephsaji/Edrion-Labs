# PETROS V2 — M1 foundations verification

Verified locally on 2026-10-12. **M1: ready for review in isolation. Staging/production: BLOCKED pending separate authority and authorization.** Work stops at M1.

## A. Executive summary

M1 now has implemented contracts, additive database declarations, a real restricted-role content repository, authorization checks, immutable source/concept/unit storage, and automated disposable PostgreSQL rehearsals. A teacher-owned source can be represented, persisted, looked up by an entitled student, and traced back to its exact original hash and locator. Changed interpretation produces another immutable revision; a filename or matching concept label never merges identities.

This foundation does not ingest new real documents, publish reviewed V2 lessons, run V2 student sessions, evaluate students, or invoke providers. The repository is registered with the existing knowledge module, with no new route, startup query, background job, or production admission flag. Session/actions/assessment contracts prepare later owners without implementing their workflows.

The existing Playground remains operational. Its production frontend, reducer, presentation controller, rig, and narration assets were preserved. Final database, schema, frontend, API regression, browser, build, and type checks passed within their stated scopes. Skips and earlier failed diagnostics are disclosed below.

Current-source reconciliation is recorded in [materials-reconciliation.json](m1-evidence/materials-reconciliation.json). The approved implementation plan and blueprint, M0/M0-R readiness/remediation/preflight/build reports, and current M0-P reports were inspected. Historical M0-R reports described a proposal-only repair; the current checkout already contains `0234_petros_readiness_repair` in its journal and final M0-R security overlays. Those current bytes were used in disposable tests. This is not evidence of live deployment approval. The frozen M0-R archive stayed unchanged, SHA-256 `1c4c585c5bd4efcc680356a16ada49d234f19d98dbffeb2f15b8e44938e7fbe7`.

## B. Source identity design

`SourceBinding` distinguishes a material publication from a guidance attachment. Materials pin institution, material ID/version, object ID, class/course context, and subject. Guidance pins the actual assignment/publication version, attachment object, class and subject; it never invents a class-material ID. Institution/student/staff authority is derived from the ambient server transaction and current database records.

Material source identity uses its authoritative material UUID; guidance identity uses its attachment object UUID. A server-assigned revision UUID pins original file SHA-256, representation hash, exact binding/version, extractor, interpretation version, optional model/prompt identity, correction lineage, coverage, shape registry and conversion metadata. Corrections append revisions. Existing records are never silently repinned.

Content units have immutable UUIDs and source revision pins, canonical SHA-256, ordinal/parent identity, strict structured payload, quality, capabilities, provenance, public asset references and explicit concept-version references. JSON property order is canonicalized for hashing. PDF locators preserve page/region/span; native PPTX locators preserve slide/shape/region; converted legacy PPT locators include the original and converted hashes plus converter version. Synthetic locators are explicitly labelled section/UTF-16 spans in original synthetic source sections. A slide image does not acquire editable shape identities.

Eleven kinds are implemented: heading, paragraph, list, table, figure, diagram, equation, code, caption, chart and unresolved. Tables preserve header/row/column/cell identity and nonoverlapping spans; diagrams preserve named nodes and visible relations; equations retain original notation, symbols, assumptions and steps; code retains original text and line identities. A visible arrow cannot become a reviewed causal claim. Unsupported or uncertain material remains explicitly unsupported.

Concept identity is a server-created UUID, independent of label. Wording/version changes append immutable versions. Graphs pin exact versions, explicit reviewed edges, at most 24 nodes/48 edges/depth 2, and reject hard prerequisite cycles. Model proposals cannot supply teacher origin or approved graph receipts. No embedding merge or inferred equivalence was introduced.

## C. Contract implementation

All ten primary contracts live in `packages/schemas/src/petros-v2/` and are exported through its existing public entry point.

| Contract | Change | Implemented foundation |
|---|---|---|
| `content.ts` | New | Source bindings/identity/revisions; all eleven representations; exact provenance; quality/capability separation; public assets, claims and semantic references |
| `proposal.ts` | New | Concept versions/graphs; proposed objectives, prerequisites, activities and review needs; public immutable scope pins; separate model-output validator |
| `session.ts` | New | Explicit V2 discriminator, durable session/revision/epoch identity, command preconditions, acknowledgments, checkpoint/submission/recovery references |
| `decision.ts` | New | Objective/scope/action pins, evidence/hypotheses, source support, alternate branches, expected observation, student-safe reason, abstention/termination; model-origin restrictions |
| `experience.ts` | New | Registered renderer/kernel/family, finite bounded parameters, public state, permitted operations, accessibility and opaque task references; exact server registry admission |
| `teaching-actions.ts` | Extended | Separate production envelope and fifteen bounded operation families; exact source/semantic target, objective, sequence, epoch/session/canvas/draft fences and committed submission requirements |
| `canvas.ts` | Extended | Existing validated operations reused; future source anchors, editable regions, immutable submission snapshot, undo boundary and operation batch metadata |
| `assessment.ts` | New public contract | Public issued task, committed response, criterion and exposure/evidence classification; no private answer/rubric or grade output |
| `companion.ts` | Extended | Persona/rig versions, public cues/voice/expression/acknowledgment; neutral assessment cues cannot target a correct answer |
| `timeline.ts` | Extended | Existing timeline reused; durable checkpoint/operation/audio pins, ordered acknowledged prefix, cancellation and resume |

The private assessment schema is only in `apps/api/src/modules/student/knowledge/petros-assessment-contract.server.ts`. Its strict projection returns the issued public task. Private answers, reference answers, rubric rules, discriminators and evaluation prompt are not exported from the public schema package. Three privacy tests validate projection, package exports, and import boundaries. A production browser bundle scan found zero new private-contract/sentinel strings across 228 JavaScript files.

The fifteen action families cover reading, writing, equation steps, diagram operations, graphing, highlighting, annotation, editing, code tracing, simulation, student-work requests, speech, gestures, waiting and evaluation requests. Validation grants no execution authority. Evaluation requests require committed work and appropriate server capability; model proposals cannot directly assess or grade. Registered kernels impose tighter step and parameter limits than generic schema ceilings.

## D. Database work

New declarations: `petros-concepts.ts` (stable concepts and immutable versions) and `petros-content-units.ts` (immutable units). These are the three M1 tables, with tenant/composite source/parent/version integrity, canonical body/hash checks, append-only triggers and bounded lookup indexes. No session, evidence, vector or per-frame table was added.

Additive modifications:

- `petros_document_source_revisions`: explicit default V1 format, nullable authoritative original-source ID and typed V2 immutable revision payload; V1 key semantics remain enforced.
- `knowledge_preparations`: explicit default V1 operation and checked material/guidance binding union. Existing V1 material fields remain required for V1; nullable fields apply only to checked V2 guidance.
- `course_curriculum_revisions`: nullable typed concept manifest. Existing immutable curriculum owner remains authoritative. SQL validates bounds/version existence/cycles and exact current approval receipts/qualification identity, subject, validity, revocations and active reviewer records. V2 review publication remains closed until M3.
- Existing teaching-pack candidate/review owners: checked default V1 versus V2 source union and exact composite candidate/review revision pin. Existing V1 paths explicitly retain their format.
- `class_materials`: nullable withdrawal timestamp. Withdrawal retains immutable source references, increments the existing material version and fences/cancels queued/running preparation receipts. Staff portal lists/get hide withdrawn rows; student and worker source use is denied. The existing permission/scope/version/audit machinery is reused.

Proposal: `packages/database/migrations/0235_petros_v2_content_identity.sql`, journal index 157/version 7. The original 157 entries reconstruct the starting journal byte-for-byte. No migration was renamed or old receipt fabricated. `packages/database/migrations/sql/zzzz_petros_m1.sql` is the idempotent final security overlay, ordered after current M0-R grants/RLS because a clean numbered migration runs before those helper/role definitions exist. The existing migration runner already replays standalone SQL in filename order.

**Applied only in exclusively allocated disposable systems:** the actual historical journal/current M0-R baseline, the proposed numbered M1 migration and final M1 overlay, repeated ordered security replay, and synthetic data. Genuine Drizzle receipt count changed 157 → 158. An injected migration transaction failure rolled back new DDL and left the ledger unchanged. Rerunning Drizzle produced no extra receipt. `pg_dump`/`pg_restore` restored into a new empty database in the same private cluster, with positive and negative App-role queries afterward.

Three representative V1 session states (active, paused, closed) and a V1 source row were compared before/after M1; their existing data was unchanged. This rehearsal is not a configured-target migration, production backup certification, or permission to run `db:migrate`.

## E. Repository implementation

`PetrosContentUnitRepository` is actual database integration, registered in `KnowledgeDocumentModule`. It supports source revision preparation/idempotent retries/correction lineage, transactional unit batches, stable concept creation/version append with a stale-version fence, and authorized source-scoped unit retrieval.

Persistence validates the actual binding and current object/hash, all unit hashes/provenance/locators/processing, semantic support, referenced units/parents/captions, concept versions and opaque public assets. One bounded dependency fetch and batch insert replace per-unit source reconstruction. Changed data under the same identity conflicts; failed batches roll back. Reviewed/explain/compute/assess admission and reviewed concept mappings fail closed pending the M3 owner.

Lookup supports exact unit ID, indexed lexical search, ordinal pagination, and a maximum two neighboring ordinals on each side. A revision ID is required; no tenant-wide document scan is exposed. It verifies persisted pins/hashes and current entitlement again before returning. Legacy V1 revisions explicitly return unsupported to this V2 repository rather than fabricated V2 structure. Unavailable results reveal no source content. Older V2 material publication revisions conservatively become unavailable when their exact binding is no longer live; correction revisions of the same live binding remain separately readable. Existing V1 historical-version behavior remains preserved.

| Resource | Bound |
|---|---|
| Individual content unit | 96 KiB through bounded parser |
| Persist batch | 1–100 units, 512 KiB total, one revision |
| Dependency IDs / concepts per batch | 500 / 24 |
| Lookup | ≤50 units, ≤512 KiB serialized result, explicit truncation/next ordinal |
| Adjacent lookup | ±2 ordinals |
| Concept graph | ≤24 nodes, ≤48 edges, depth ≤2, 96 KiB DB manifest ceiling |
| Other action/canvas/experience payloads | Finite parameters and existing tighter renderer/kernel/operation bounds; strict unknown-field rejection |

[repository-query-behavior.json](m1-evidence/repository-query-behavior.json) records five returned units, 31 statements including scope binding/restoration/savepoints, and the installed source/ordinal/lexical indexes. The final small synthetic measurement was about 105 ms; this is not a production latency or load claim. No provider calls or new vector infrastructure were needed.

## F. Authorization/security

All repository entry points require an ambient institutional server scope and verify the actual login is restricted `edrion_app`, with no superuser/owner/BYPASSRLS path. Current active account/student role, enrollment/class membership, exact material or guidance recipient/publication, current course/subject, object/hash/status and server-derived staff permissions are rechecked. A payload institution ID or model-created source pin cannot grant scope.

The new tables use forced RLS and scoped restrictive policies. App receives SELECT/INSERT only for immutable concepts/versions/units; UPDATE/DELETE are not granted. Student concept visibility remains closed pending the released teaching scope in M3. Worker/evaluator roles receive no new V2 table access and cannot read V2 revisions through the old V1 path. Existing private lesson-artifact columns remain inaccessible to App after both repeated security replay and restoration.

Negative tests cover no scope, cross tenant, nonrecipient/nonenrolled student, forged binding/hash/asset, disabled account, removed student role, staff direct deny, stale publication/correction/version, unknown concept, invalid/cyclic/unapproved graph, mutation and transactional rollback. Tests use the actual nonowner App connection and a separately connected worker login. Bootstrap authority is confined to synthetic seeding, migration, deliberate corruption tests and restoration.

A narrowly scoped read-only historical-asset predicate preserves V1 original files after republication. It requires the current owner/tenant, nonrevoked parent, an admissible complete immutable extraction with that exact original hash/object, unchanged material origin and current recipient entitlement. It does not permit writing or reading unrelated objects. Material withdrawal makes those source/session/artifact reads unavailable. Staff retention visibility exists for withdrawal update receipts; it does not reopen source use or portal display.

The graph validator accepts a server-resolved authorized-review registry. Actual V2 review/release writes remain closed; M3 must resolve effective current reviewer permissions, academic authority and exact released scope through the existing qualified-review owners. No fixture approval was promoted to academic authority.

## G. Backward compatibility

The full existing V1 source integration suite passed **100/100**, including actual authenticated HTTP, tenant transactions, PDF preparation, durable queues, exact citations, old strict readers, source history after republication, permission revocation, current policy, rollback and source/session/artifact denial. The existing assignment-authority suite passed **7/7** under the full current migration/security baseline.

V1 readers explicitly select V1 preparations/revisions and retain existing fallback semantics. Inadmissible replacement extraction is recorded without destroying an already usable V1 snapshot. Existing private recipient checks now run through the actual recipient tenant scope, because institution-only reads cannot see private knowledge under current M0-R policies. A waiting concurrent session start re-reads under a fresh READ COMMITTED statement snapshot when the unchanged parent-RLS predicate could not see the just-committed session; the existing row lock and authorization remain intact.

M0-P contracts were extended alongside their original fixture contracts. No new reducer, playback engine, avatar, orchestrator or speech service was created. Full frontend **376/376** and schema **578/578** tests pass. The mounted browser check passed **11 checks**, zero errors/provider calls: actual offline audio playback, equations/diagram semantic beats, questions/interrupt/resume, typed fallback, mocked route failures, fake-device browser recording, reduced motion and 320px containment. This demonstrates preserved local UX; it does not verify physical microphones, live STT or qualified provider voices.

Compatibility/dependency appendix:

| Capability | Actual state / milestone and prerequisite |
|---|---|
| Whiteboard/student editing, diagrams, equations, contextual Ask Petros, undo/redo, checkpoints, Play/Pause/Continue | Existing M0-P foundation preserved; reused contracts and existing tests |
| Offline narration, shared avatar, dynamic speech/thought clouds, text mode, accessibility | Existing M0-P foundation preserved; browser/audio checks passed; Samantha remains demonstration narration |
| Real PDF/PPTX/PPT source teaching and coverage | M2 extraction/converter/OCR authorization and measured two-subject source fidelity, followed by M3 release and M5 teaching |
| Teacher qualification, actual proposal preview and release | M3; exact institution/course/subject, current qualified reviewer identity/permissions, approved content and assessment scope |
| Validated assessment, durable exposure/submission/evidence/resume | M4 persistence and command owners; M5 evaluator/orchestrator integration; M1 supplies contracts only |
| Adaptive teaching, misconceptions, contextual shared-canvas decisions | M5; released objectives/source capabilities, registered kernels, committed learner work and reliable evidence |
| Layered facial/body artwork, genuine blinking/eye movement, contextual action gestures | M6; approved layers/pivots/contact anchors and teaching intelligence; existing whole PNG poses remain honest |
| Natural production voice and qualified routing | M7 integration/hardening; approved provider credentials/routes/voice audition and bounded authorization/cost; internal preview does not qualify a route |
| Real microphone/provider Playground tests | Outstanding M0-P voice prerequisite, completed with M7 approval; browser fake-device/synthetic transcript does not satisfy it |
| Proper lip/face synchronization, interruption latency and measured voice cost | M7; supported artwork/timing, genuine media/provider receipts and separately authorized bounded spending |
| Multi-subject learning outcomes, reliability and safe rollout | M8; approved real cloud/English cohorts, end-to-end release, load/recovery/security evidence and operational authorization |

## H. Two-subject fixtures

Original CC0 synthetic fixtures are in `m1-fixtures.ts`. They deliberately claim no actual PDF/PPT parsing or academic approval. The disposable database stores two different original synthetic documents/objects/materials with the same title, different original hashes and different source IDs. Source section slices are checked against the original file content. Both concept-bearing units are persisted and retrieved under App RLS.

| Family | Persisted example | Exact original hash and locator |
|---|---|---|
| Cloud computing | Virtualization paragraph; independent UUID concept with wording version 2; also service comparison table, architecture figure/diagram, `u = d / c` with assumptions/steps, Python lines, caption, chart and unresolved region | `288cbb1c6f18357ee54deed9c2a46ece68cf6d70e818113ff6b2d5bcefc65595`; synthetic `cloud_computing` section `[81,191)` for the concept-bearing paragraph |
| English argument analysis | Library-hours claim, synthetic survey evidence, warrant and counterargument; a proposed warrant relationship supported by the evidence unit; independent concept UUID/version 1 | `a3fff04bb067b0c8eb0e96953a3bc747f50153ad7242f5eb0eec1115a5ca0313`; synthetic `english_argument` section `[221,331)` for the concept-bearing warrant |

[source-identity-demo.json](m1-evidence/source-identity-demo.json) contains exact source/revision/unit/concept UUIDs, original/representation/unit hashes, locator, quality/capabilities, correction chain, unavailable result and migration evidence. Display/cite/highlight are represented; editing, explanation, computation and assessment are explicitly unsupported. Visual arrows and English warrants are not asserted as proven causes or reviewed academic conclusions.

These fixtures prove representation and ownership mechanics across two subject families. They do not establish a real pilot, suitable syllabus, reviewer qualification, document extraction quality, computational admission or learning outcomes.

## I. Test results

Runtime: Node **24.21.0**, pnpm **11.1.2**, actual Homebrew PostgreSQL/Redis binaries. Database clusters listen only on private temporary Unix sockets; TCP is disabled. Configured database URLs were not loaded/contacted. API providers were controlled adapters or forbidden dispatch; all paid provider call counts are zero.

| Final run | Passed | Failed | Skipped | Evidence |
|---|---:|---:|---:|---|
| Full public schemas | 578 | 0 | 0 | `contract-tests.json` |
| Full student frontend | 376 | 0 | 0 | `frontend-tests.json` |
| Relevant API/companion/voice/knowledge/preparation/teaching regression | 395 | 0 | 100 | `api-regression-tests.json`; the 100 opt-in V1 DB tests were executed separately below |
| M1 actual disposable DB + private assessment boundary | 22 | 0 | 0 | `database-tests.json`, `identity-command.log` |
| Full V1 actual disposable DB source suite | 100 | 0 | 0 | `v1-database-tests.json` |
| Existing assignment release authority DB suite | 7 | 0 | 0 | `assignment-database-tests.json` |
| Existing goal-completion authority unit suite | 3 | 0 | 0 | `goal-completion-tests.json`; controlled database adapter, no real DB claim |
| Legacy URL-configured guidance predicate tests | 0 | 0 | 2 | `guidance-database-tests.json`; no separately supplied URL was used; these are not counted as passes |
| Mounted Playground browser | 11 checks | 0 errors | — | `browser/browser-results.json`; synthetic provider responses and fake microphone explicitly recorded |

API/database/schema/student typechecks passed. API and isolated student production builds passed. Lint on the 40 changed/new TypeScript/TSX/MJS files passed with **0 errors, 19 warnings** about existing Nest dependency type imports; no broad automatic import rewrite was performed. `git diff --check` passed. The built browser assessment boundary scan passed (228 files, zero matches).

Commands below were run from the repository root. The verification command strips target configuration itself. For other database test invocations, target URLs are explicitly removed. JSON evidence is under `docs/verification/petros-v2/m1-evidence/`.

```sh
export PATH=/tmp/node-v24.21.0-darwin-arm64/bin:$PATH
node apps/api/scripts/verify-petros-m1.mjs
pnpm --filter @edrion/schemas exec vitest run --minWorkers=1 --maxWorkers=2 --reporter=json --outputFile=../../docs/verification/petros-v2/m1-evidence/contract-tests.json
pnpm --filter @edrion/student-web exec vitest run --minWorkers=1 --maxWorkers=2 --reporter=json --outputFile=../../docs/verification/petros-v2/m1-evidence/frontend-tests.json
env -u DATABASE_URL -u DATABASE_MIGRATION_URL -u PETROS_GUIDANCE_TEST_DB_URL PETROS_LOCAL_DB_TESTS=1 pnpm --filter @edrion/api exec vitest run src/modules/student/petros-session-intent/petros-document-source.integration.spec.ts --minWorkers=1 --maxWorkers=1 --reporter=verbose --reporter=json --outputFile=../../docs/verification/petros-v2/m1-evidence/v1-database-tests.json
env -u DATABASE_URL -u DATABASE_MIGRATION_URL -u PETROS_GUIDANCE_TEST_DB_URL PETROS_LOCAL_DB_TESTS=1 pnpm --filter @edrion/api exec vitest run src/modules/integrations/petros-assignment-authority.integration.spec.ts --minWorkers=1 --maxWorkers=1 --reporter=json --outputFile=../../docs/verification/petros-v2/m1-evidence/assignment-database-tests.json
env -u DATABASE_URL -u DATABASE_MIGRATION_URL -u PETROS_GUIDANCE_TEST_DB_URL pnpm --filter @edrion/api exec vitest run src/modules/student/assignments/petros-learning-goal-completion.spec.ts --minWorkers=1 --maxWorkers=1 --reporter=json --outputFile=../../docs/verification/petros-v2/m1-evidence/goal-completion-tests.json
env -u DATABASE_URL -u DATABASE_MIGRATION_URL -u PETROS_GUIDANCE_TEST_DB_URL -u PETROS_LOCAL_DB_TESTS -u PETROS_M1_DB_TESTS pnpm --filter @edrion/api exec vitest run src/modules/student/knowledge src/modules/student/petros-companion src/modules/student/petros-loop src/modules/student/petros-session-intent src/modules/petros-ai-routing src/modules/portal/teaching/petros-teacher-guidance.service.spec.ts src/modules/portal/teaching/petros-teacher-guidance-files.service.spec.ts src/modules/portal/course-content --minWorkers=1 --maxWorkers=2 --reporter=json --outputFile=../../docs/verification/petros-v2/m1-evidence/api-regression-tests.json
env -i HOME="$HOME" PATH="$PATH" node docs/verification/petros-v2/m1-browser-check.mjs
pnpm --filter @edrion/schemas typecheck
pnpm --filter @edrion/database typecheck
pnpm --filter @edrion/api typecheck
pnpm --filter @edrion/student-web typecheck
pnpm --filter @edrion/api build
env -i HOME="$HOME" PATH="$PATH" NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PETROS_ISOLATED_VERIFICATION=1 PETROS_M0P_VERIFICATION=1 PETROS_V2_COMPANION_PLAYGROUND_ENABLED=false NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_DEV_STUDENT_EMAIL= NEXT_PUBLIC_DEV_STUDENT_USER= pnpm --filter @edrion/student-web exec next build
git diff --check
```

Lint used `pnpm exec eslint` with the exact argument list in `lint-files.json`. The browser harness uses the already available local Playwright installation/Chromium and offline speech tools; reproducing it requires those local dependencies. The production build uses a separate output directory and intentionally unreachable API address, with Playground admission disabled.

Earlier diagnostics were failures, not passing gates: the initial final-baseline V1 harness exposed missing active staff/source scope and outdated historical-only security replay; these fixture boundaries were corrected before testing the complete final overlays. V1 history exposed inadmissible replacement and historical asset compatibility fixes. A subsequent 107-test DB run had 104 passes/3 failures (withdrawal, concurrent start, unscoped test read); these were repaired and independently rechecked, then the full 100-source and 7-assignment suites passed. An added withdrawal-list assertion initially omitted the endpoint's required context query and returned 400; the actual endpoint contract was supplied, with direct service-get denial also asserted. A new M1 withdrawal test initially selected both synthetic materials; its statement was narrowed to the requested material and all 22 tests passed. Frontend diagnostics had six failures from a stale login mock/resource-sensitive timer checks; the mock retained real exports/reset and bounded worker runs passed all 376. An API build exposed AppleDouble entries in asset copying; directory/metadata filtering fixed it. Lint initially had six missing `process` global errors in the new verification script; an explicit Node import fixed them. One misconfigured min/max worker invocation ran no tests and is not counted. No required assertion, tenant policy or admission check was relaxed to get a pass.

Scope limits: this is not the entire monorepo test suite, live provider evaluation, physical microphone testing, real two-subject extraction, staging inspection, production load/recovery, or academic validation. The two skipped legacy URL-based tests are disclosed; guidance recipient/file/publication checks are positively and negatively exercised in the actual restricted-role M1 suite and existing assignment-authority suite.

## J. Files changed

The checkout already contained substantial uncommitted M0-R/M0-P work. Changes are measured against this turn's starting file hashes, not a clean Git HEAD. [starting-status.txt](m1-evidence/starting-status.txt), [starting-hashes.json](m1-evidence/starting-hashes.json), [files-manifest.json](m1-evidence/files-manifest.json), and [preservation.json](m1-evidence/preservation.json) provide exact paths/hashes and the retained baseline. Environment files were excluded from hashing and were not edited. No existing file was removed. No commit, staging operation, reset, deployment or provider credential change was performed.

Created implementation/test/demo files:

```text
apps/api/scripts/verify-petros-m1.mjs
apps/api/src/modules/integrations/petros-m1-foundations.integration.spec.ts
apps/api/src/modules/student/knowledge/petros-assessment-boundaries.spec.ts
apps/api/src/modules/student/knowledge/petros-assessment-contract.server.ts
apps/api/src/modules/student/knowledge/petros-content-unit.repository.ts
docs/verification/petros-v2/m1-browser-check.mjs
docs/verification/petros-v2/m1-foundations.md
packages/database/migrations/0235_petros_v2_content_identity.sql
packages/database/migrations/sql/zzzz_petros_m1.sql
packages/database/src/schema/petros-concepts.ts
packages/database/src/schema/petros-content-units.ts
packages/schemas/src/petros-v2/assessment.ts
packages/schemas/src/petros-v2/content.spec.ts
packages/schemas/src/petros-v2/content.ts
packages/schemas/src/petros-v2/decision.ts
packages/schemas/src/petros-v2/experience.ts
packages/schemas/src/petros-v2/foundations.spec.ts
packages/schemas/src/petros-v2/m1-fixtures.ts
packages/schemas/src/petros-v2/proposal.ts
packages/schemas/src/petros-v2/session.ts
```

Modified existing files:

```text
apps/api/scripts/copy-build-assets.mjs
apps/api/src/modules/integrations/petros-phase2-test-database.ts
apps/api/src/modules/portal/course-content/portal-course-content.service.ts
apps/api/src/modules/portal/course-content/portal-material-preparation.jobs.ts
apps/api/src/modules/portal/portal-crud.engine.ts
apps/api/src/modules/student/knowledge/knowledge-document.module.ts
apps/api/src/modules/student/knowledge/knowledge-preparation.repository.ts
apps/api/src/modules/student/knowledge/petros-teaching-pack.service.ts
apps/api/src/modules/student/petros-session-intent/petros-document-preparation.service.ts
apps/api/src/modules/student/petros-session-intent/petros-document-source.integration.spec.ts
apps/api/src/modules/student/petros-session-intent/petros-session-intent.repository.ts
apps/student-web/src/app/(auth)/login/page.spec.tsx
packages/database/migrations/meta/_journal.json
packages/database/src/schema/curriculum-alignment.ts
packages/database/src/schema/index.ts
packages/database/src/schema/institutional-bridge.ts
packages/database/src/schema/petros-document-learning.ts
packages/database/src/schema/petros-teaching-packs.ts
packages/database/src/schema/student-knowledge.ts
packages/schemas/src/petros-v2/canvas.ts
packages/schemas/src/petros-v2/companion.ts
packages/schemas/src/petros-v2/index.ts
packages/schemas/src/petros-v2/teaching-actions.ts
packages/schemas/src/petros-v2/timeline.ts
```

Generated evidence consists of exact test JSON/logs, source/query/privacy/reconciliation/preservation manifests, and browser screenshots/audio/video under `m1-evidence/`; every generated file is inventoried in `files-manifest.json`. Existing M0-R/M0-P reports and evidence were retained. The only student frontend edit was the test mock; production frontend and public assets stayed byte-identical to the starting baseline. The frozen proposal archive and prior migration files are unchanged.

Of 5,150 starting files, 5,126 are unchanged and 24 have the intentional edits listed above; none was removed. The preservation check includes 308 unchanged student production source/assets and 15 unchanged legacy engine/presentation files. `execution-exit-codes.json` records exit code 0 for each final executed test/build/typecheck/lint/browser command.

## K. Remaining blockers

**Technical M1 checks:** no unresolved failure in the final stated checks. Lint warnings and test scope limitations remain explicitly recorded. Unit/repository foundation and synthetic rehearsal do not establish real extraction quality or released teaching authority.

**Academic authority:** no real cloud or English pilot/reviewer records were created or queried. Historical cloud candidate institution `1964cdc4-2a3e-4ee5-8eb0-39b51ee82aac`, subject `325841dd-8ede-417a-9efc-22968aa9587c` (Cloud Computing/CST423, version 0) remains only a reported candidate. A current actual course, syllabus, recipient enrollment, permitted source and exact qualified reviewer are unestablished. English institution/course/subject/reviewer selections are absent. Each pilot needs active reviewer user/staff identity, subject-specific current qualification ID/version and validity/evidence, effective `syllabus.manage`/`academics.alignments.approve` permissions and course/campus authority, exact source/curriculum pins, and approved teaching/assessment release. Synthetic engineering identities satisfy none of these academic prerequisites.

**Staging/production:** M0-R deployment authorization remains unresolved. Before future contact/application, reconcile target-specific receipts and role credentials, verify restricted effective privileges, establish backup/restore and old-app compatibility, obtain exact M1 migration/security-overlay approval, and authorize activation separately. No read-only target inspection was performed here. The ordinary migration tree now contains proposal bytes; do not automatically apply it to a configured target before approval.

**Deferred:** M2 real bounded extraction/conversion/OCR/coverage and source proposals; M3 qualified review/release/preview; M4 durable V2 sessions/exposure/assessment/evidence/recovery; M5 adaptive action execution; M6 layered art/expression; M7 genuine voice/microphone/provider/latency/cost/synchronization; M8 outcomes/load/operations/rollout. The appendix in G preserves every M0-P dependency.

## L. Human verification

With Node 24.21.0 and local PostgreSQL tools on PATH, run:

```sh
node apps/api/scripts/verify-petros-m1.mjs
```

The developer-only command refuses target arguments, does not load dotenv or start the application, strips configured target/credential variables, creates only a private disposable database, and runs the real repository/security/rollback/restore/privacy checks. It regenerates and prints `source-identity-demo.json`. Successful output contains:

1. Cloud and English chains: source ID → immutable revision → original hash/locator → unit ID/hash → independent concept ID/version.
2. A correction with unchanged original source ID and a distinct revision/representation hash, while the old authorized interpretation is preserved.
3. `compute`/`assess` unsupported capabilities and explicit synthetic quality.
4. An unauthorized student's `unavailable / unauthorized_or_revoked_source` result.
5. Genuine migration receipts 157 → 158, rollback verification and V1 preservation.

Random UUIDs change between disposable runs; fixture source hashes/locators and identity separation remain reproducible. Test clusters are closed and removed afterward. No development UI route or configured database is needed to inspect this demonstration. [The browser evidence](m1-evidence/browser/browser-results.json) and [walkthrough](m1-evidence/browser/spoken-teaching-walkthrough.webm) separately show the preserved Playground with local fixtures.

## M. M2 readiness

**M1 is ready for human review.** The local foundation is technically suitable for beginning bounded M2 extraction work in an isolated environment after explicit user authorization, with strict source/representation/capability limits already available. Real extraction fidelity, academic approval, live security and rollout remain unproven and belong to their stated gates.

No M2–M8 implementation, live schema application, provider spending or production enablement was undertaken. **Stopped after M1; awaiting review and explicit authorization.**
