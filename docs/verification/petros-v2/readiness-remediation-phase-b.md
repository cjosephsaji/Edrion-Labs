# Petros V2 M0-R — Phase B runtime integration

**9 October 2026, Asia/Kolkata. Phase B engineering: PASS. Staging readiness: BLOCKED. Production readiness: BLOCKED.** Application integration and disposable verification are complete for review. Target, credential, package, restore and operational prerequisites still require a separately approved isolated staging rehearsal; real pilot execution also requires the academic records below. No staging run or deployment is authorized or performed here.

The implementation plan, complete M0 report, Phase A dossier, original ten-file production proposal, Phase A results and security harness were read. This report supplements `readiness.md` and `readiness-remediation.md`; it does not replace their historical findings or imply their live gate has passed.

## 1. Authorization boundary and preservation

Phase B connected only to freshly created disposable PostgreSQL clusters through private Unix sockets with TCP disabled. It did not connect to the configured application or migration database, including through a read-only session. No live migrations, role/credential/grant/RLS changes, feature configuration, academic grants, deployment or paid AI request occurred. M0-P and M1–M8 were not started.

Application code and tests were edited in the working tree. Database deployment files remain **proposal-only**: `0234`, the existing SQL replay files and the working migration journal were not edited. There was no Git staging, commit, reset, stash or clean. The earlier implementation snapshot retained 209 pre-existing dirty/untracked files: 193 were byte-identical and 16 intentionally extended. This completion audit began with that implementation, report and tests already present, preserved a separate 235-file snapshot, then extended only the eight paths enumerated in `phase-b-preservation-audit.json`. No starting file is missing. Existing student authentication, portal, onboarding, UI, guidance, migration and other user work remains present. Both baselines and the applied-proposal verification copy are recorded in that audit.

The updated deployment patch is relative to the **preserved Phase B starting working tree**, including existing user work. It is not a claim that this patch applies to a clean upstream HEAD. Review and freeze that baseline before staging packaging.

## 2. Runtime gaps and implemented fixes

The completion audit found two additional reproducible runtime defects in the existing Phase B implementation. First, releasing a PostgreSQL savepoint retains its `SET LOCAL` values: an explicit worker/evaluator transaction had no ambient request parent from which to restore all eleven authorization settings. `runInReadinessScope` now snapshots the connection's actual settings before each scope and restores them after success; savepoint rollback restores them after failure. `withInstitutionScope` uses the same mechanism. Second, teacher guidance ran assignment-scoped savepoints concurrently on one request connection, allowing one goal's settings to overwrite another's and return a false `not_started` result. Those authorized participation reads now run sequentially.

Both defects failed targeted integration assertions before the fixes and passed afterward. The added worker test verifies all eleven settings after nested success, rollback and institution-only work, plus an empty unscoped read after transaction completion. The strengthened teacher test verifies distinct started/completed results for two legitimate goals without exposing private assessment markers. The expanded V1 run also found two stale fixture calls that omitted the authenticated staff actor for text publication and replacement rollback. Those fixtures now supply the actor used by the real portal interceptor; the production authentication check was retained.

| Previously identified gap | Final implementation and evidence |
| --- | --- |
| Ordinary pool could use the configured superuser/BYPASSRLS login | CoreModule awaits the actual restricted-role assertion before publishing the tenant proxy. It requires both current_user and session_user to equal edrion_app, with no superuser/BYPASSRLS, administrative/replication rights, memberships, public object ownership or schema CREATE. Effective login tests reject unsafe, member and wrong identities. |
| Transaction metadata missed class-decorated controllers; institution-user/job scope could be absent or inherited | Method/class metadata is resolved correctly. Every transaction entry replaces all eleven GUCs, including blanks: institution, student, independent user, institution user, preparation, lesson, session, course, source item, assignment and shared review request. Nested application scopes restore the parent; worker/evaluator transactions use explicit handles rather than ambient request scope. |
| Document worker used ambient/unscoped application access and claimed before current authorization | A separate restricted worker pool requires its own explicit URL and exact login. Queue messages carry identifiers; private path/source access and current student/account/role, storage, source revision, material/course/enrollment authority are re-resolved before claim. Missing or foreign scope fails before provider execution. |
| Revocation during provider work or retry could publish results | Short claim/progress/commit transactions lock current authority rows. Every gateway attempt has authorizeAttempt; routing/metering receives a separate owned restricted application scope. The same lease owner, attempt count, preparing status and unexpired lease are required before writes. Current source/account/student-role/password-setup authority is rechecked before publication. Valid controlled provider results after revocation publish no artifact. No provider/parser work runs while these short document authority locks are held. |
| Retry/upsert behavior conflicted with immutable document history | Revisions and published lessons use insert-on-conflict-do-nothing and authorized reread, without rewriting published content or rebinding shared canonical ownership. Existing BullMQ identifiers/retry settings, durable leases/fences and recovery architecture remain. Expired-reader recovery checks the observed fence, attempts cap at three, cancellation/stolen leases cannot commit or overwrite a newer claim, and one-concept-ahead work is bounded to the current revision. |
| Ordinary lesson readers retrieved private assessment plans | Public lesson queries select only id/conceptId/publicPlan and validate the public teaching schema. New document sessions store a released lesson reference and public plan. Ordinary session repository SQL removes the historical private-plan key before results reach services, DTOs, normal model context, avatar or speech presentation. Public context updates retain old private history inside SQL instead of rewriting or returning it. |
| Evaluators needed legitimate private access without exposing every instrument to the teaching service | A separate read-only evaluator login reads only the exact active owned session/version and its released lesson under current source/account/role authority. Its adapter validates the private generation and returns only the requested diagnostic or scene instrument. Normal teaching/help uses public scenes; evaluator access is reserved for diagnostic/answer handling. Historical V1 plans retain their original storage shape and are read only through this adapter, subject to current source checks. Ordinary direct private_plan SELECT is denied. |
| Institution-only pack compilation/review and staff academic flows depended on formerly broad private-row access | Existing current permissions, institution/course/campus authority, source pins and qualification checks run before exact course/source scope is bound. Staff compilation keeps staff scope. Recipient review requires current course authority and a locked current enrollment before bounded student delegation while retaining the staff actor. Nested syllabus writes retain that actor. |
| Teacher goals, files, releases and explicitly shared review work were incompatible with owner-only policies | Participation reads bind one currently authorized assignment and return only metadata. Shared review lookup binds one requested sharing record and retrieves only student/course identifiers; current teacher permission, course/enrollment, reviewer qualification, consent, policy, revision and source checks still govern subsequent actions. Assignment publication validates each current recipient under its owner scope within the existing atomic transaction. Administrative policy events with no student owner bind the current initiating institution user and remain append-only. |
| Teacher PDF preparation/fanout and failure receipts relied on implicit scope | PDF preparation reconstructs current initiating staff authority before claim/parser and final publication. Publication locks current material/student/enrollment authority, limits fanout to 100 server-derived recipients, and persists each recipient's extraction under its own scope. Failure telemetry uses detached restricted owner transactions, survives parent rollback, and has no maintenance-owner fallback. |

Custom GUCs remain **trusted server scope**, not authentication against arbitrary SQL submitted by a holder of the application secret. Existing cookie verification, current principals, permission checks and source/academic authority remain necessary. Staff scopes are entered only after those service checks; no owner credential or SECURITY DEFINER bypass was added to impersonate a recipient.

## 3. Review of the complete Phase A proposal

The original ten-file proposal was reviewed in full. Its additive historical repair and owner/source protections are retained. Disposable runtime journeys exposed the following issues, each corrected with a corresponding positive journey and/or denial test:

- Broad dedicated-role authority grants did not match runtime needs. The final overlay revokes pre-existing table/sequence/function grants from both dedicated roles and grants only required tables/columns/actions. The worker cannot update published artifacts, academic qualifications or source authority. The evaluator cannot write and cannot read unrelated source columns or storage paths. Dedicated metadata reads now require current institution/student scope; role lookup is limited to that student. Existing ordinary authentication role lookup is preserved.
- PostgreSQL requires UPDATE privilege for SELECT FOR SHARE. The worker receives identity-column lock privileges, with false mutation checks where applicable and an invoker trigger rejecting every actual worker authority UPDATE. This avoids a privileged lock function. The source and role rows are locked during bounded claims/commits.
- The Phase A composite-FK group used a sentinel. A partial prior install could retain the sentinel while missing another constraint. The overlay checks all eight exact child/parent key sequences, validation, actions and deferral settings and aborts drift; a deliberate partial install is rejected and rolled back.
- Generic session-parent policies wrongly rejected legitimate pre-session intents/failure receipts with NULL session_id. Current owner authorization is still required; non-NULL links must match the owned parent.
- Shared staff extraction could precede enrollment and lack a student canonical source. The exact authorized course/material scope permits that immutable revision only for the initiating active staff user's current uploaded object; subsequent student paths require current entitlement. No broad staff source grant or canonical-history UPDATE was added.
- Current immutable extraction pages and fingerprint are authoritative. The live-document checksum uses complete admissible immutable pages, falling back to mutable legacy pages only where no published version exists. Invalidation, changed file/material pins and revoked enrollment deny access. A legacy page alteration does not override already published immutable extraction.
- Evaluator access now matches an exact active session and released lesson, with current fingerprint/entitlement and account/student-role checks, without introducing an artifact/session policy recursion.
- Blanket append-only planning-row enforcement broke V1 planned → rendered → completed execution. The final grant permits only status and existing execution-receipt fields. The V1 teach-it-back repository may bind its initially rendered recap plan to its newly created block once. A trigger freezes plan content and identity, verifies the resulting block belongs to the same decision/session/student/institution, rejects backward lifecycle transitions and later receipt/route rebinding, and retains delete/truncate denial. Existing observations, events and other immutable histories remain protected.
- Owner-only RLS also rejected legitimate policy events, explicit recipient releases and shared qualitative teacher review. The narrowly bound service/policy changes above restore these workflows. Policy events cannot be updated, deleted or truncated, including through an administrative mutation attempt.

No new SECURITY DEFINER function was introduced. The seven existing functions inventoried in Phase A remain limited to their existing approved application use; tests confirm **zero executable SECURITY DEFINER functions for either dedicated document identity** after repair. They are not a document-worker owner fallback.

## 4. Exact files and proposed deployment package

`proposed-production.diff` and `proposed-production-files.json` now contain **32 files: four proposal-only database files and 28 application/config/database-client files**. Application portions are already present in the working tree. Full patch application was checked in a private reconstruction of the starting tree; all 28 resulting source files matched current working bytes. Migration-only application checks also pass against the unchanged checkout migration tree. Do not reapply the full patch over already-edited application files.

Final patch SHA-256: `e33c2bae7d710f33428d1d3690054e91f765e4192660b793394ef3f8ff126e1a`. This completion audit updated only its database-client and teacher-guidance source sections; the four database sections and other 26 application sections are byte-identical to the preserved proposal at audit start. The entire proposal was inspected, including migration ordering, ACL reset, FORCE/restrictive RLS, dedicated role authority, immutable histories and bounded V1 lifecycle behavior.

| Exact repository path | Change |
| --- | --- |
| `packages/database/migrations/0234_petros_readiness_repair.sql` | PROPOSAL ONLY: retain additive Phase A document DDL, composite ownership constraints and immutability. |
| `packages/database/migrations/sql/zzz_grants.sql` | PROPOSAL ONLY: retain final Phase A application grants and safety overlay; subsequent final RLS overlay narrows dedicated identities and restores bounded V1 lifecycle grants. |
| `packages/database/migrations/sql/zzz_rls.sql` | PROPOSAL ONLY: retain Phase A fail-closed RLS, then append reviewed Phase B constraint preflight, dedicated ACL reset, authority metadata guards, evaluator/source checks and bounded compatibility policies. |
| `packages/database/migrations/meta/_journal.json` | PROPOSAL ONLY: retain append-only reservation idx 156, timestamp 1791417600001. Existing working journal untouched. |
| `packages/database/src/client.ts` | Reject unsafe effective logins; replace all eleven transaction-local scope keys; snapshot/restore actual connection scope for explicit nested worker/evaluator and institution-only transactions; retain authenticated actor and bounded delegation. |
| `apps/api/src/common/core.module.ts` | Await ordinary-role assertion before exposing DATABASE; register/export the isolated document database adapter. |
| `apps/api/src/modules/student/core/student-owned-transactions.ts` | Resolve transaction metadata on methods and controller classes. |
| `apps/api/src/modules/student/core/student-tenant.interceptor.ts` | Bind the server-resolved institution user and honor server-owned transactions. |
| `apps/api/src/modules/portal/portal-tenant.interceptor.ts` | Preserve authenticated staff actor in institution scope. |
| `apps/api/src/modules/student/petros-session-intent/petros-document-preparation.service.ts` | Public-only lesson reads; immutable revision/publication inserts; dedicated worker claims, authority locks, per-attempt authorization, fenced commits and bounded recovery. |
| `packages/config/src/index.ts` | Optional explicit worker/evaluator URLs. No credential value or existing flag/default changed. |
| `apps/api/src/modules/petros-institutional/petros-institutional.repository.ts` | Public session projection. |
| `apps/api/src/modules/student/petros-session-intent/petros-session-intent.repository.ts` | Public session projection; owner-scoped failure telemetry survives request rollback without an owner pool. |
| `apps/api/src/modules/student/petros-artifacts/petros-artifacts.repository.ts` | Public session projection and detached restricted owner-scoped failure receipts. |
| `apps/api/src/modules/portal/course-content/portal-course-content.service.ts` | Persist immutable shared revisions under exact authorized course/material; bounded current recipient extraction publication under each student scope with authority locks. |
| `apps/api/src/modules/portal/course-content/portal-material-preparation.jobs.ts` | Reconstruct initiating staff authority before claim/parser and final publication; preserve outbox, lease/fence, heartbeat and recovery. |
| `apps/api/src/modules/portal/teaching/petros-teacher-guidance.service.ts` | Bound participation reads to each currently authorized assignment; serialize scoped reads on the shared request connection; select participation metadata without learner context. |
| `apps/api/src/common/petros-session-projection.ts` | New SQL projection removes historical documentTeachingInternalPlan before ordinary repository results. |
| `apps/api/src/modules/student/petros-reflection/petros-reflection.repository.ts` | Public session projection. |
| `apps/api/src/modules/petros-learner-model/petros-objective-evidence.repository.ts` | Public joined-session projection. |
| `apps/api/src/common/petros-document-database.ts` | New dedicated pools, role assertions and cleanup; scoped worker transactions; exact active owned session/lesson/version assessment selection. |
| `apps/api/src/modules/student/petros-session-intent/petros-session-intent.service.ts` | Create document sessions with public plan and lesson reference, without embedding private generation. |
| `apps/api/src/modules/student/petros-loop/petros-loop.service.ts` | Assessment adapter only for selected diagnostic/answer instrument; public teaching/help/model context and current authorization before committing a provider result. |
| `apps/api/src/modules/student/petros-loop/petros-loop.repository.ts` | Public session reads/returning; current source checks on resume; preserve historical private key in SQL when updating public learner context. |
| `apps/api/src/modules/student/knowledge/petros-teaching-pack.service.ts` | Bound current staff course/source authority; verify current enrollment before bounded recipient delegation; retain qualification, source and curriculum checks. |
| `apps/api/src/modules/student/petros-session-intent/petros-session-intent.controller.ts` | Private/no-store preparation and path responses. |
| `apps/api/src/modules/student/knowledge/petros-teaching-pack.repository.ts` | Public session projection. |
| `apps/api/src/modules/portal/petros-assignment-learning.service.ts` | Preserve staff actor; after current publication/recipient checks, validate and insert each release in its verified student scope within the atomic parent transaction. |
| `apps/api/src/modules/portal/courses/portal-courses.service.ts` | Preserve initiating institution-user scope in nested syllabus transaction. |
| `apps/api/src/modules/student/petros-loop/petros-adaptive.service.ts` | Read only required availability/status fields rather than whole session context. |
| `apps/api/src/modules/student/petros-artifacts/petros-qualitative-review.service.ts` | Authenticated sharing lookup followed by current course/enrollment delegation for teacher inspect, feedback, review and revoke; existing authority/consent checks retained. |
| `apps/api/src/modules/student/petros-artifacts/petros-qualitative-review.repository.ts` | Read only student/course metadata from the specifically selected shared event/submission/review. |

The following additional verification files were created or extended; they are outside the deployment patch:

| Path | Purpose |
| --- | --- |
| `apps/api/scripts/petros-v2-readiness-phase-b.sql` | Guarded disposable overlay; refuses targets lacking the per-transaction marker, matching private data directory/database name and Unix-socket identity. Only the unguarded deployment-overlay body is included in the proposal. |
| `apps/api/scripts/rehearse-petros-v2-readiness-repair.ts` | Existing Phase A harness extended for effective evaluator login, actual restricted application pool concurrency, Phase B repair and exact final proposal replay. |
| `apps/api/src/modules/integrations/petros-v2-readiness-security.integration.spec.ts` | Retain 30 historical/SQL/restore checks with compatible immutable-page and NULL-session expectations. |
| `apps/api/src/modules/integrations/petros-v2-runtime-security.integration.spec.ts` | 35 actual-service/HTTP/restricted-role checks, including nested explicit scope restoration and multiple legitimate teacher goals. |
| `apps/api/src/modules/integrations/petros-phase2-test-database.ts` | Explicit opt-in applies proposal migrations/ordered SQL only to a fresh private copy/database and asserts the ordinary role. |
| `apps/api/src/modules/integrations/petros-phase2-authority-fixture.ts` | Preserve authenticated institution-user identity in real-role fixture transactions. |
| `apps/api/src/modules/integrations/petros-phase2-full-journey.integration.spec.ts` | Existing full journey plus proposal-mode plan content and backward-transition denials. |
| `apps/api/src/modules/integrations/petros-assignment-authority.integration.spec.ts` | Existing authority journeys plus proposal-mode append-only policy-event denials. |
| `apps/api/src/modules/student/petros-loop/petros-loop.service.spec.ts` | Public normal-teaching request and selected assessment-boundary regression. |
| `apps/api/src/modules/student/petros-session-intent/petros-session-intent.service.spec.ts` | Public lesson/reference fixture and no-private-session-context assertion. |
| `apps/api/src/modules/portal/teaching/petros-teacher-guidance.service.spec.ts` | Bounded assignment-scope fixture; real authorization verified in integration tests. |
| `apps/api/src/modules/student/petros-session-intent/petros-document-source.integration.spec.ts` | Preserve authenticated staff identity in two existing V1 publication/rollback fixtures; retain real RLS and rollback assertions. |
| `docs/verification/petros-v2/readiness-remediation-phase-b.md` | This dossier. |
| `docs/verification/petros-v2/phase-b-verification-results.json` | Final suite counts and every assertion outcome, typecheck outcomes and proposal hash. |
| `docs/verification/petros-v2/phase-b-preservation-audit.json` | Baseline file audit and private full-proposal/source-byte verification. |

## 5. Final verification and practical limits

**386 tests passed, zero failed, zero skipped in the final runs.** Evidence is recorded in `phase-b-verification-results.json`, including the two red-to-green runtime regressions and the initial V1 fixture failures; this is fixture verification, not live readiness evidence. The earlier 211-test result is retained as historical metadata in that file.

| Check | Result and scope |
| --- | --- |
| Phase A security/preservation + Phase B runtime security | **65 passed** in two files: retained 30 plus 35 runtime checks. Actual independently authenticated edrion_app, worker and evaluator logins, rather than admin-only checks or SET ROLE impersonation. |
| Exact proposal compatibility | **9 passed** across assignment authority, full Phase 2 teaching/evidence/artifact/qualitative/revision/resume journey and signed-cookie HTTP journey. Each database installs the exact proposal migration and final ordered SQL from a private copy. |
| Existing V1 baseline | **117 passed** in four files against the unchanged baseline migration installation: literal S1–S11 journey 1, document-source/service/worker integration 100, OS-sandboxed PDF parser 6, compatibility 10. Includes real disposable Unix-socket Redis/BullMQ lost-dispatch/Redis-loss recovery and explicit missing-handler failure. |
| Focused regression | **195 passed** in fourteen files: gateway 38, document teaching policy 7, learning loop 23, pilot 5, document source 12, document generation 19, intent 19, teacher files 6, teacher guidance 8, portal session 2, tenant scope 3, password setup 12, companion 33, input modes/voice 8. |
| Compilation/format | API, database and config package typechecks passed; git diff --check passed. Full private proposal apply/byte verification and migration-only apply check passed. |
| Historical repair/replay | Reconstructed historical installation has 413 original tables and 153 ledger receipts. Original row/hash receipts and ledger survive repair, repeated full proposal replay and populated document-table replay. Conflicting-index and partial-FK drift abort safely. Broad old grants demonstrably reopen private access; final ordered overlays remove it. |
| Backup/restoration | Restore a separate private database after deliberately deleting/corrupting fixture assets: all original table row/hash receipts and six original/derived asset hashes match the saved fixture. Repeated visual backfill is idempotent. |
| HTTP/current authority | Signed student cookies, missing/cross-owner/cross-institution denial, private/no-store public preparation/path responses, real session revocation, current teacher qualifications/permissions, course/enrollment/material withdrawal and file visibility are exercised. |
| Worker/assessment boundary | Registered production document handler; scoped claims, provider-attempt hook and final commit; source/storage/student/account/path/role/setup withdrawal before claim; valid provider result after revocation; cancellation, expired/stolen leases and retry cap; public SQL/DTO/model context; evaluator version/owner/source/key denial; historical private history retained without returning it. |

The Phase B document-teaching handler uses controlled registration/dispatch and provider-response adapters. Separate V1 tests execute real BullMQ transport with disposable Unix-socket Redis, including lost dispatch and Redis loss; neither run certifies the configured live queue or a remote AI/TTS provider. API HTTP tests instantiate relevant Nest controllers/guards/interceptors; they do not boot the entire configured application. Startup role assertions use real restricted/unsafe disposable logins; optional-pool disabled/missing-credential lifecycle is tested, while full URL-created pool bootstrap and real secret-manager cutover require staging. These checks cover the named Petros/document/teacher/academic consumers, not every unrelated background worker or every route in the repository. No complete repository-wide suite or live latency/load test is claimed.

Reproduce security checks from the repository root:

```sh
env -u DATABASE_URL -u DATABASE_MIGRATION_URL -u PGHOST -u PGSERVICE -u PGDATABASE \
  PETROS_LOCAL_DB_TESTS=1 pnpm --filter @edrion/api exec vitest run \
  src/modules/integrations/petros-v2-readiness-security.integration.spec.ts \
  src/modules/integrations/petros-v2-runtime-security.integration.spec.ts

env -u DATABASE_URL -u DATABASE_MIGRATION_URL -u PGHOST -u PGSERVICE -u PGDATABASE \
  PETROS_LOCAL_DB_TESTS=1 PETROS_READINESS_PROPOSAL_TESTS=1 \
  pnpm --filter @edrion/api exec vitest run \
  src/modules/integrations/petros-phase2-full-journey.integration.spec.ts \
  src/modules/integrations/petros-assignment-authority.integration.spec.ts \
  src/modules/integrations/petros-phase2-http.integration.spec.ts

env -u DATABASE_URL -u DATABASE_MIGRATION_URL -u PGHOST -u PGSERVICE -u PGDATABASE \
  PETROS_LOCAL_DB_TESTS=1 pnpm --filter @edrion/api exec vitest run \
  src/modules/integrations/petros-phase1-final-journey.integration.spec.ts \
  src/modules/student/petros-session-intent/petros-document-source.integration.spec.ts \
  src/modules/student/knowledge/knowledge-pdf-process.spec.ts \
  src/modules/integrations/petros-compatibility.integration.spec.ts

pnpm --filter @edrion/api typecheck
pnpm --filter @edrion/database typecheck
pnpm --filter @edrion/config typecheck
```

Clear any additional PG* target variables as well; the historical harness refuses them. The guarded SQL is not a live execution command. The focused regression file inventory and individual final results are in the evidence JSON.

## 6. Migration compatibility, ordering and rollback

Phase A's **8 October** configured-target evidence remains historical and was not refreshed: configured login macbook was superuser/BYPASSRLS; edrion_app was NOLOGIN with no membership; missing document DDL, uninstalled restrictions and absent academic bindings kept the gate blocked. There is no Phase B evidence that any of those live conditions changed.

History reconciliation is unchanged: the exact historical 0190 integer-seed hash followed by 0191 bigint widening, the merge-parent extraction/preparation timestamps and omitted document migrations, and separately installed 0233 guidance DDL are documented rather than rewritten. Existing applied hashes, timestamps and receipts remain intact. The new additive reservation is **0234, idx 156, when 1791417600001**; recheck it against concurrent work and the target high-water mark before any approved rollout. Do not replay old document journal gaps or fabricate receipts. The historical preservation fixture intentionally leaves old receipts unchanged; the fresh proposal-compatibility fixture runs the full journal normally and records the real fixture migrations.

A separately approved rollout must coordinate the known idempotent pending 0233 statement, new 0234 repair, final grants, final RLS including Phase B, existing backfill, restricted credentials and application code. Drain affected traffic/workers before the change: the old grants pass temporarily broadens privileges, and an intermediate SQL or code state is unsuitable for serving requests. The final RLS overlay also installs bounded lifecycle grants; replaying older broad grants afterward would reopen access. Use bounds and abort unexpected schema/history/index/FK shape or lock contention.

Before approval capture the exact role/ACL/policy state, database backup, source/derived assets, manifests and target identity. Exercise restore on the approved isolated target. The disposable restore proves the fixture mechanism, not configured production backup coverage. Measure source checksum/authority query latency, FK/index lock time and pool concurrency on staging. The new role-table RLS preserves ordinary app authentication and limits dedicated identities; review any other non-application readers against the target's actual role inventory.

Transactional failure should roll back and verify original catalog/receipt state. After a standalone SQL or credential cutover failure, stop traffic/jobs and restore the captured database-plus-assets and role/security state on an isolated target before switching. A plain application downgrade is unsafe across the changed grants and owner rules. Do not restore the superuser application credential, disable RLS/immutability, erase receipts or drop populated repair tables as a shortcut. Logical withdrawal retains history; physical retention/deletion, review administration after student withdrawal and post-cutover data reconciliation need their own approved process.

## 7. Academic pilot dependencies — separate from repaired runtime defects

The historical Phase A read-only evidence found **zero courses, zero qualifications, one cloud subject candidate and zero English title candidates**. Phase B invented or wrote no academic record.

| Pilot | Established record | Legitimate next administrative action |
| --- | --- | --- |
| Cloud computing | Candidate subject 325841dd-8ede-417a-9efc-22968aa9587c, institution 1964cdc4-2a3e-4ee5-8eb0-39b51ee82aac, Cloud Computing / CST423, version 0. It is not an approved pilot binding. | The institution's academic owner must confirm that canonical subject, select/create the real active course with that exact subject, assign legitimate staff/course/campus authority, enroll actual authorized students and approve the actual curriculum/objective/source revisions. |
| English argument analysis | No established canonical institution/subject/course or qualified reviewer. A differently named subject cannot be inferred from title search. | The academic owner must identify the canonical subject and actual course and supply approved argument-analysis objectives, task/rubric/unseen-transfer coverage and admissible source material before any binding. |

The paths below are controller paths; the current API serves them with the `/v1` prefix. For each pilot the authorized administrator uses existing course creation/update routes (`POST /portal/courses` and `PATCH /portal/courses/:id`, courses.manage), enrollment (`POST /portal/courses/:id/enrollments`, courses.manage) and syllabus/curriculum routes (`POST /portal/courses/:id/syllabus`, syllabus.manage, with x-petros-curriculum-alignment=petros.curriculum-alignment.v1). A real canonical subject can be selected or legitimately created through POST /portal/academics/subjects with current academics.manage authority; it must not be an invented pilot fixture. Curriculum review uses `POST /portal/courses/:id/syllabus/review` with current syllabus.manage and academics.alignments.approve, supported by actual institutional academic authority.

Reviewer provisioning must bind the actual active institution user/staff to the exact subject, latest qualification ID/version, valid date window, active status, recorded-by authority and real evidence kind/hash. A teacher title/class assignment alone is insufficient. Inspection found a qualification **reader**, not a production qualification-writing endpoint: recording these qualifications needs a separately reviewed legitimate administrative provisioning process and evidence. No credential, qualification, permission or reviewer was generated to bypass this gap.

Once the genuine records exist, current class_content.manage + syllabus.manage authority can compile via `POST /portal/petros/teaching-packs/candidates/compile`. The legitimate qualified reviewer then reviews the exact candidate hash/version/source/curriculum/task coverage via `POST /portal/petros/teaching-packs/candidates/:id/reviews`, with current syllabus.manage + academics.alignments.approve and current course authority. Admission must still recheck qualification expiration/revocation, permissions, curriculum/source pins and current enrollment. Where authoring is enabled, the existing independent-reviewer/self-approval rules also apply. Phase B's synthetic fixtures are verification data only.

## 8. Remaining gate and staging decision

**Phase B engineering: PASS. Staging readiness: BLOCKED pending the changes and evidence below. Production readiness: BLOCKED.** No outstanding failure was observed in the targeted final engineering checks; this does not establish the configured system's gate. The implementation is reviewable, but no approved staging target, credential cutover, target backup/restore or complete application/pool bootstrap has been verified here.

Before that rehearsal: approve/freeze the exact starting baseline and 32-file package; identify an isolated target; re-inventory its migration history, role/function/ACL state and reservation; provision approved restricted ordinary/worker/evaluator logins through the secret system; capture and verify backup/asset restore; coordinate/drain code and ordered SQL cutover; and verify full pool bootstrap, relevant authenticated journeys, denials and operational limits there.

No feature flag was changed. The original configured inventory had PETROS_DOCUMENT_TEACHING_ENABLED=true and PETROS_AI_MODE=live, and the existing config default for document teaching remains true. Consequently a reviewed startup without explicit worker/evaluator credentials fails closed; **do not assume the existing environment has containment disabled flags**. Any separately approved initial staging package must explicitly contain document teaching/provider execution and V2 features according to that approval. This Phase B did not set those live values or enable a feature. Real cloud/English pilot execution remains blocked by the academic dependencies above and requires a later approved phase.

## 9. Exact changes requiring separate approval before staging or production

1. Freeze the starting working-tree baseline and the 32-file package at the hash above. Approve the pending idempotent 0233 statement, additive 0234 reservation (idx 156, when 1791417600001), ordered final grants/RLS overlays and existing backfill. Revalidate the target ledger and reservation without rewriting historical migrations or receipts.
2. Provision restricted LOGIN identities and secret-manager values for `edrion_app`, `edrion_petros_document_worker` and `edrion_petros_document_evaluator`. Wire `DATABASE_URL`, `PETROS_DOCUMENT_WORKER_DATABASE_URL` and `PETROS_DOCUMENT_EVALUATOR_DATABASE_URL` to their exact identities when the relevant runtime is approved. Keep administrative migration access separate; no superuser, BYPASSRLS, privileged memberships or schema CREATE for runtime identities.
3. Approve explicit environment containment: authenticated cookie operation with development-header authentication disabled, provider execution controlled, document teaching explicitly configured and all Petros V2 features kept disabled. Existing true/live defaults are not adequate containment. No credential or flag value was changed by Phase B.
4. Approve a named isolated staging target and drained code/SQL/credential cutover, after capturing its role/ACL/function inventory, database and asset backups and manifests. Verify restore there; then verify full URL-created pool startup/cleanup, real authenticated journeys and denials, queue recovery, migration lock bounds and query/pool performance. Disposable fixtures do not substitute for this target evidence.
5. Before either real pilot, have the rightful academic owners approve and provision the exact canonical subject, active course, actual enrollments, curriculum/source revisions and qualified reviewer ID/version/evidence/date window described in section 7. Qualification provisioning needs a reviewed administrative process; no automatic grant or fabricated record is permitted.
6. Production changes require a later separate approval after staging evidence and a production-specific inventory, backup/restore and rollback review. No deployment, role change, migration execution or follow-up phase is scheduled by this report.

**Stop at Phase B for review. No staging/production remediation, feature activation, paid provider execution or M1–M8 continuation is performed or scheduled.**
