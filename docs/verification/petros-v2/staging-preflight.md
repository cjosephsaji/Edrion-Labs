# Petros V2 — M0-R full application rehearsal and staging preflight

**9 October 2026, Asia/Kolkata. Isolated engineering verification: PASS. Ready to request review/conditional approval of the contained staging package: YES. Actual staging readiness: BLOCKED pending explicit approval and the target-specific gates below. Production and real academic pilots: BLOCKED.**

The complete Nest application, real HTTP controllers, URL-created restricted PostgreSQL pools, Redis/BullMQ and controlled HTTP AI adapter were exercised. Final verification passed **393 tests, zero failures/skips, plus 14 full-application scenarios**. Four application files were extended to resolve defects found by the rehearsal. The frozen source build and two independent deterministic package builds passed.

No configured staging/production database was contacted, including read-only access. No deployment, live credential/role/configuration change, paid AI call, real academic record change, Git staging/commit/reset/stash, or M1–M8 implementation occurred. Work stops at this report/package. Actual staging deployment requires explicit approval.

## 1. Inputs, preservation and implementation freeze

Read the implementation plan's M0/M0-R requirements, readiness report, Phase A remediation and results, Phase B remediation and results, and the complete production proposal. Historical configured-target findings remain historical; they were not refreshed by connecting to that target.

Starting and final HEAD: `444ed328e714ad8c1a37985cb082d49536d6e6f0`. A private snapshot preserved 240 starting file records, including hash-only records for sensitive/operational files. **237 remain byte-identical, three intentionally extended starting files remain present, and no starting file is missing.** The fourth application edit was previously clean and is compared with HEAD. Existing unrelated user work was retained. See [preservation audit](staging-preservation-audit.json) for the snapshot location, paths and hashes.

All **28 Phase B application/config/client files** at rehearsal start matched the private source reconstruction previously checked by Phase B. The original **32-file proposal** remains unchanged, SHA-256:

`e33c2bae7d710f33428d1d3690054e91f765e4192660b793394ef3f8ff126e1a`

The application hunks were already integrated and were **not reapplied**. Only the four database hunks were applied inside private package copies. The working database migration tree, existing grants/RLS files, migration runner and root `.env` remain unchanged. `0234` is still absent from the checkout. The journal still has 156 entries ending at `0233_petros_teacher_guidance`, idx 155, timestamp 1791417600000. Proposed reservation **0234 / idx 156 / timestamp 1791417600001** has no checkout conflict at this freeze; its availability on an actual target remains UNVERIFIED and must be checked again before deployment.

V1 preservation evidence includes original row/history/official-mark receipts, original and derived asset restoration, legacy private-plan preservation behind public projections, active/paused/resumed sessions, planned → rendered → completed execution and teach-it-back binding. The selected V1 suites passed. This is bounded regression evidence, not a claim that every UI/product workflow was exhaustively tested.

## 2. Executed full application rehearsal

Executable: [rehearse-petros-staging.ts](../../../apps/api/scripts/rehearse-petros-staging.ts). Raw receipt: [staging-application-results.json](staging-application-results.json). Final run: **13:01:54–13:03:04 UTC**. Its source manifest SHA-256 matches the final deployment package manifest exactly.

The harness accepts no target arguments and refuses inherited application/migration URLs or PG target variables before allocation. It creates a fresh PostgreSQL cluster with TCP disabled, private Unix socket, synthetic historical installation and fresh restricted LOGIN roles. A generated loopback proxy permits the application's actual URL-based pools to reach only that cluster. It allocates its own Redis and local HTTP mock provider, blocks non-loopback outbound connections in application/migration children, and loads a synthetic private `.env`. The real checkout `.env` is never copied into the executable environment. Processes/clusters are stopped and removed afterward.

The child executes **unchanged `src/main.ts` and the complete `AppModule`**, through the existing TypeScript startup mechanism, rather than a testing module or stubbed database provider. Frozen workspace sources are resolved inside the private copy; installed dependency binaries are reused. The initial boot uses `NODE_ENV=production`, document teaching off, AI demo, development-header auth off and no migration credential available to the API. Enabled document/evaluator journeys use a separate `NODE_ENV=test` profile, synthetic academic authority and the generated loopback mock only. The actual HTTP AI adapter made **two local mock calls; zero paid calls**.

Rehearsal-only configuration includes a private tsconfig wildcard alias so reused dependency links resolve the frozen workspace source, synthetic `.env`, dependency symlinks and the loopback listener/network guard. Application/deployment source bytes are unchanged by these harness adaptations. They are not added to the deployment archive; clean production installation/link behavior remains a separate unverified gate.

| Full application scenario | Observed result |
| --- | --- |
| Existing migration runner against historical installation, twice | PASS: 153 original receipts preserved; first run adds real fixture receipts for pending 0233 and new 0234; second adds none. Backfill migrates three fixture artifacts, then scans zero on repeat. |
| Production-mode containment bootstrap | PASS: complete application health/database initialization succeeds with restricted app login and teaching disabled. |
| Student password login/session access | PASS: valid login/history 200; wrong password, missing cookie and development-header attempt 401; foreign session 404. |
| Disabled document preparation | PASS: 503 before any preparation write or provider dispatch. |
| Enabled URL-created app/worker/evaluator pools | PASS: actual connections use `edrion_app`, `edrion_petros_document_worker`, `edrion_petros_document_evaluator`. The separately observed `petros_test` connection belongs to fixture administration, not an application fallback. |
| Teacher upload/publication | PASS: authorized synthetic text upload/publication 201; foreign institution's course context 404. |
| Pack compilation and qualification | PASS: compile 201; unqualified review 403; currently qualified fixture review 201; foreign review 404. |
| Prepare → BullMQ → worker → local HTTP provider → lesson | PASS: ready on first attempt; public read 200 with `private, no-store`; private plan/answer keys absent; foreign read 404. |
| Document intent/session/private assessment | PASS: real intent/start and diagnostic evaluation 201; evaluator supplies only the selected instrument; public responses exclude private generation/answer keys; foreign session 404. |
| Session creation/pause/resume/history | PASS: each mutation 201; history retains session; separate institutions receive correctly scoped topic-profile audit rows. |
| Actual application queue retry and Redis interruption | PASS: missing-handler job fails after two attempts; app health survives own Redis loss; reconnected worker completes a new marker job after restart. |
| Current authority withdrawal/logout | PASS: enrollment withdrawal denies cached document read 404; logout succeeds and revoked cookie then receives 401. |
| Missing dedicated worker URL | PASS: complete bootstrap exits 1 with `PETROS_DOCUMENT_RESTRICTED_DATABASE_REQUIRED`; no listener and no fallback. |
| Superuser ordinary URL | PASS: complete bootstrap exits 1 with `PETROS_APPLICATION_DATABASE_ROLE_UNSAFE`; no listener. |

The restricted runtime suite separately verifies same-institution foreign-owner and independent-user isolation, private column denial, evaluator write denial, current source/account/role/password/qualification revocation, cancellation/expired/stolen worker fences, bounded retries, immutable publication reuse, worker source-mutation denial and restoration of all eleven nested scope keys. Cancellation is exercised through the actual service/DB lease path with a controlled gateway; it is not claimed as an additional full-bootstrap HTTP cancellation test.

Redis restart deliberately uses disposable nonpersistent Redis. It proves reconnect/handler recovery, not retention of pending Redis jobs, staging HA/failover or storage durability. Durable preparation lease recovery is covered separately by the integration suites.

## 3. Failures found and exact application changes

| Changed application file | Reproduced failure and final fix |
| --- | --- |
| `apps/api/src/modules/student/petros-session-intent/petros-document-preparation.service.ts` | Disabled preparation could reach dispatch. Add a gate before writes, prevent disabled reader recovery from enqueueing, and replace colon-delimited job ID with a BullMQ-valid hyphen form. Actual BullMQ had rejected the old ID. |
| `apps/api/src/modules/student/petros-session-intent/petros-session-intent.service.ts` | Add the disabled preparation gate before outline/preparation work. |
| `apps/api/src/modules/portal/course-content/portal-course-content.service.ts` | Foreign teacher publication incorrectly returned 201 because the material's own institution RLS did not validate polymorphic context_id. Validate IDs and current same-institution class/course, active course, campus and subject context; lock authority before storing bytes, creation and republishing. Authorized publication still returns 201. |
| `apps/api/src/modules/petros-topic-profiles/petros-topic-profiles.service.ts` | Session startup omitted institution_id from generation/cache audits and hit RLS. Carry institution through both audits and include institution in concurrent profile-load identity. Two-institution full application startup passes. |

[staging-runtime-fixes.diff](staging-runtime-fixes.diff) records only these additions relative to the preserved Phase B implementation (HEAD for the previously clean topic-profile file). It was applied to an independent reconstruction and all four resulting files matched final bytes. SHA-256: `7852c6539251fd3fcf17da0d1aa7f88f8be4b37d96725c36c2f06619707a90a6`. No RLS/authority guard was weakened.

Intermediate harness failures were also retained rather than counted as passing verification: private-path/dependency resolution, an incorrect login field, incomplete physics visual mock contract, and incorrect mock evaluation route/capabilities/input fields were corrected in the harness. The real validators were retained. The initial private-copy `pnpm build` wrapper attempted automatic dependency reconciliation and refused a non-TTY purge; no install occurred. The exact two build-script steps were then executed directly with existing binaries and both passed. The [build receipt](staging-build-results.json) and evidence logs record that limitation.

New verification/package artifacts from this task are exactly:

- `apps/api/scripts/rehearse-petros-staging.ts`
- `apps/api/scripts/prepare-petros-staging-package.py`
- `docs/verification/petros-v2/staging-preflight.md`
- `docs/verification/petros-v2/staging-operations.md`
- `docs/verification/petros-v2/staging.env.example`
- `docs/verification/petros-v2/staging-migration.env.example`
- `docs/verification/petros-v2/staging-runtime-fixes.diff`
- `docs/verification/petros-v2/staging-application-results.json`
- `docs/verification/petros-v2/staging-build-results.json`
- `docs/verification/petros-v2/staging-configuration-audit.json`
- `docs/verification/petros-v2/staging-preservation-audit.json`
- `docs/verification/petros-v2/staging-package-results.json`
- `docs/verification/petros-v2/staging-rehearsed-source-manifest.json`
- `docs/verification/petros-v2/staging-verification-results.json`

The generated `output/petros-staging-20261009/` contains the archive, manifest and raw evidence copies; it is not Git-staged. Existing tests were run without changing their production authority checks.

## 4. Final package and reproducibility

Archive: [petros-m0r-staging-source.tar.gz](../../../output/petros-staging-20261009/petros-m0r-staging-source.tar.gz)

**Archive SHA-256:** `e57dd73826fef35ad550a99e1add28490f76b628deffde7148091ecb4c449739`

**Manifest SHA-256:** `e3f187e00b703da8e00d00fe6032ce339905c52175aa6932871ba2a0720bcc75`

[manifest.json](../../../output/petros-staging-20261009/manifest.json) identifies **33 proposed deployment files: 29 application/config/client files and four proposal-only database files**. This extends the original 32-file package by the topic-profile service, with three already-included application files additionally fixed. Every deployment file and all **1,816 frozen API/workspace source files** have individual SHA-256 hashes. Root packet files have `bundleFiles` hashes. The packet includes the original proposal, incremental fixes, ordered database files, runtime/migration environment templates and operations runbook.

The archive is a complete API/workspace source freeze, including required baseline and existing user work, rather than a patch against clean HEAD. It contains no node_modules, build output, root `.env`, actual database URL, provider credential or runtime secret. Placeholder names remain deliberately unprovisioned. Frontend application deployment is outside this API remediation package.

Two new private build directories produced byte-identical archives/manifests. The final manifest is byte-identical to the manifest captured before full application execution. Extraction/per-file verification passed. Source compiler and PDF child-asset copy passed from a private frozen copy. A clean dependency install/container image build is **UNVERIFIED**; dependencies were reused without installing.

Reproduce the packet from this frozen working tree with a **new outside-checkout destination**:

```sh
python3 apps/api/scripts/prepare-petros-staging-package.py \
  --destination /ABSOLUTE/NEW/PRIVATE/DIRECTORY --archive
```

The builder does no environment loading, database connection, dependency install or deployment. Source changes after this freeze require a new manifest/hash and appropriate verification. Do not apply the original full patch over the already integrated Phase B sources.

## 5. Final executed tests and evidence

[staging-verification-results.json](staging-verification-results.json) includes exact file inventories, commands, individual assertion outcomes, and raw-report SHA-256s. Raw JSON reports and retained red receipts are under `output/petros-staging-20261009/evidence/`.

| Final check | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Database preservation/security + restricted runtime integration | 65 | 0 | 0 |
| Full proposed migration compatibility/academic authority/HTTP | 9 | 0 | 0 |
| Focused application regression, 14 files | 195 | 0 | 0 |
| V1 journeys, document-source integration, PDF sandbox and BullMQ recovery | 117 | 0 | 0 |
| Topic-profile repository/service regression | 7 | 0 | 0 |
| **Final Vitest total** | **393** | **0** | **0** |
| Separate full-main application scenarios | 14 | 0 | 0 |

The original 386-test set was first reproduced without changes and then rerun after the fixes; seven existing topic-profile tests extend the final set. Intermediate repeated test runs are not added to the final total. API, database, config and the new TypeScript harness typechecks all passed. Staging environment-template schema validation passed, including all **20 current Petros `*_ENABLED` flags explicitly false**.

Database security tests actually injected SQL failure and verified transaction rollback, repeated grants/RLS repair without rewriting original receipts, rejected index/partial composite-FK drift, ran the actual V1 backfill twice, and restored a separate database plus six original/derived fixture assets after deliberate deletion/corruption. Original table counts/content hashes and asset hashes matched. This verifies the disposable mechanism; actual staging backup coverage, global credential restoration and measured RPO/RTO remain UNVERIFIED.

Local commands (clear any additional PG target variables first; harnesses refuse them):

```sh
env -u DATABASE_URL -u DATABASE_MIGRATION_URL \
  pnpm --filter @edrion/database exec tsx --tsconfig ../../apps/api/tsconfig.json \
  ../../apps/api/scripts/rehearse-petros-staging.ts

env -u DATABASE_URL -u DATABASE_MIGRATION_URL PETROS_LOCAL_DB_TESTS=1 \
  pnpm --filter @edrion/api exec vitest run \
  src/modules/integrations/petros-v2-readiness-security.integration.spec.ts \
  src/modules/integrations/petros-v2-runtime-security.integration.spec.ts \
  --maxWorkers=1 --minWorkers=1

pnpm --filter @edrion/api typecheck
pnpm --filter @edrion/database typecheck
pnpm --filter @edrion/config typecheck
```

Other exact suite commands are recorded in the verification JSON. Proposal-compatibility suites require both `PETROS_LOCAL_DB_TESTS=1` and `PETROS_READINESS_PROPOSAL_TESTS=1`. These harnesses must never be retargeted at staging/production.

## 6. Actual configuration audit and required staging settings

Read-only file/schema audit: [staging-configuration-audit.json](staging-configuration-audit.json). The developer checkout currently resolves **document teaching=true** through its schema default, **AI mode=live**, **STUDENT_AUTH_DEV_HEADER=true**, and has no dedicated worker/evaluator URL. This differs from assuming the historical report is the current explicit file configuration. No values were changed. The current configured deployment process, provider registry, role state and target effective configuration are **UNVERIFIED** because no target was contacted.

The separate [initial staging template](staging.env.example) explicitly requires:

| Setting/secret | Initial proposed requirement |
| --- | --- |
| `DATABASE_URL` | Staging-only `edrion_app` LOGIN, no superuser/BYPASSRLS/admin/replication rights, memberships, public ownership or schema CREATE. |
| `PETROS_DOCUMENT_WORKER_DATABASE_URL` | Separate staging secret for exact `edrion_petros_document_worker`; never fall back. Pool remains unopened while teaching is disabled. |
| `PETROS_DOCUMENT_EVALUATOR_DATABASE_URL` | Separate staging secret for exact `edrion_petros_document_evaluator`; never fall back. Pool remains unopened while teaching is disabled. |
| `DATABASE_MIGRATION_URL` | Absent from ordinary runtime; supplied only to approved one-shot migrator via [separate template](staging-migration.env.example). |
| `PETROS_DOCUMENT_TEACHING_ENABLED` | Explicit `false`. |
| `PETROS_AI_MODE`, `LEARN_SESSION_GENERATE` | `demo`, `false`; no paid-provider secrets or enabled routes; contain provider egress. |
| Development authentication | `STUDENT_AUTH_DEV_HEADER`, portal/platform dev header/login switches and OTP return explicitly false. |
| Petros features | All 20 current Petros enabled flags false, including synthetic pilot instrumentation. No implemented V2-engine switch exists to activate. Review database-backed flags too. |
| Redis/workers | Isolated authenticated/TLS Redis as approved; workers false during cutover, durable work retained. |
| Signing/storage | Distinct staging cookie, document and media secrets; approved persistent original/derived storage and attachment topology. |

Both real main and migrator load release-root `.env` with `override:true`; inherited shell credentials do not supersede that file. Deploying this checkout's `.env` would be unsafe. The templates contain placeholders, not usable or approved secrets. Secret delivery, TLS/server authentication and resolved target configuration must be validated after specific approval.

## 7. Exact migration, credential cutover and restoration procedure

The executable operational specification is [staging-operations.md](staging-operations.md), included in the frozen archive. It contains target/identity/ledger checks, backup scope, role/secret names, drain order, post-deployment SQL/HTTP commands and failure handling. Its sequence is:

1. Obtain explicit approval for the named isolated staging target, this archive hash, configuration and write window. Recheck target migration/DDL/ACL/function/role inventory and reservation; abort divergence. No manually inserted/rewritten historical receipts.
2. Pause admissions/affected queues, drain active workers/provider requests, retain queued/delayed work and durable command/lease state, and stop old pools. Capture consistent database dump, ordered real ledger, global role/ACL/policy/function state and every original/derived asset manifest. Verify restore into a separately approved restore target before cutover.
3. Provision approved restricted LOGIN secrets through the administrative process. The SQL can create missing dedicated roles as NOLOGIN; it does not provision passwords. Runtime roles must remain nonowner/nonadmin and have no privileged inheritance.
4. Mount only the one-shot migration configuration in a new release directory. Require a nonempty approved migration URL instead of permitting the existing runner's optional ordinary-URL fallback. Run the **unchanged** `pnpm --filter @edrion/database migrate` from frozen `source/` with reviewed lock/statement bounds.
5. The runner executes **Drizzle pending journal transaction → sorted `zzz_grants.sql` → `zzz_rls.sql` with final Phase B overlay → existing `runVisualCanvasesV1Backfill` → close**. Historical fixture pending entries are idempotent 0233 then additive 0234; a fresh full journal legitimately has 157 receipts. Standalone files/backfill are separate commits, so the whole runner is not atomic. Keep traffic stopped through the temporary broad-grants state. Never replay old broad grants after the final overlay or additionally run rehearsal SQL/backfill.
6. Verify exact DDL/composite constraints/indexes, FORCE RLS, ACL/lifecycle triggers, dedicated-role restrictions and byte-identical original receipts. Replace migration `.env` with the contained runtime configuration; start fresh restricted pools; perform the runbook's authenticated positive/negative smoke tests before separately approved worker/admission changes.

On pre-commit failure, roll back the open transaction and verify original receipts/catalog/data. After any separately committed SQL/backfill/credential change, keep traffic/jobs stopped, preserve recovery evidence and inspect the actual partial state before retrying. Restore the consistent database **plus global/security state and original/derived assets** into an isolated target, verify hashes and V1/auth/role denials, reconcile every acknowledged post-checkpoint write/command, and obtain approval before switching. Do not erase receipts, drop populated repair tables, disable RLS/immutability or restore superuser application access. An application-only downgrade is unsafe across these grants/projections.

## 8. Academic pilot prerequisites remain separate

No real qualifications, enrollments, subjects, permissions or reviews were created. Synthetic records exist only in removed disposable environments. The historical evidence found zero courses and zero qualifications; that target state has not been refreshed.

| Pilot | Legitimate prerequisites before admission |
| --- | --- |
| Cloud computing | Academic owner must confirm candidate subject `325841dd-8ede-417a-9efc-22968aa9587c`, institution `1964cdc4-2a3e-4ee5-8eb0-39b51ee82aac`, Cloud Computing/CST423, version 0. It is not an approved binding. Establish the real active exact-subject course, current staff/course/campus authority, authorized enrollment and approved curriculum/objective/source revisions. |
| English argument analysis | No canonical institution/subject/course/reviewer was established. Academic owner must identify genuine records and approve argument-analysis objectives, tasks, rubric, unseen-transfer coverage and admissible sources. Do not infer binding from a different subject title. |
| Both | Current reviewer institution user/staff, exact subject, latest qualification ID/version, active status/date window, recorded-by authority and real evidence kind/hash; current `syllabus.manage` + `academics.alignments.approve` and course authority. Recheck revocation/expiry, source/curriculum pins and enrollment at admission. Authoring self-approval/independent-review requirements still apply. |

Existing legitimate administrative routes cover course management/enrollment, canonical subjects and curriculum/review. Pack compilation additionally requires current `class_content.manage` + `syllabus.manage`. The code has a qualification reader but no production qualification-writing endpoint; a separately reviewed authorized provisioning process and real evidence are required. Passing synthetic qualification/review tests does not supply those records or authorize either pilot.

## 9. Remaining blockers and decision

No unresolved failure remains in the final local checks. The implementation is technically reviewable for a **contained staging approval request** using this exact source packet. This is conditional preparation, not approval or permission to deploy.

| Open gate | Status / required evidence |
| --- | --- |
| Explicit target/deployment authorization | BLOCKED: no named target or write window approved. |
| Actual target schema/ledger/reservation/roles/ACL/functions | UNVERIFIED: fresh bounded inventory required; historical superuser configuration is not accepted as safe. |
| Provisioned secrets, TLS, production topology and effective flags/routes | UNVERIFIED: separate restricted LOGIN secrets, correct `.env` mounts, provider containment and independent role assertions required. |
| Clean locked dependency/image build and approved runtime | UNVERIFIED: local Node 25.6.0/pnpm 11.1.2/macOS, PostgreSQL 15.15, Redis 8.4.0 were used. Repository `.nvmrc` requests Node 20, which was unavailable and not tested; production image/runtime compatibility, including the runtime-asset copier, must be validated. Reused-module pnpm wrapper limitation is recorded above. |
| Target-scale operations | UNVERIFIED: migration locks/durations, authority/checksum query latency, pool concurrency, queue persistence/HA and storage topology/load require target measurements. |
| Actual backup/restore and recovery objectives | UNVERIFIED: target database/global-role/asset restore, post-checkpoint reconciliation and measured RPO/RTO must pass; six fixture assets do not establish real coverage. |
| Real cloud/English admission | BLOCKED by academic prerequisites and later explicit feature/pilot approval. |
| Production rollout | BLOCKED pending separately approved staging evidence and production-specific review/approval. |

**Stop here. No staging/production operation, provider activation, real pilot or follow-up phase is executed or scheduled by this report.**
