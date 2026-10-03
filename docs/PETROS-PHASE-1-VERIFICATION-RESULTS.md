# Petros Phase 1 frozen-build verification results

Run: `petros-phase1-20260922-final`  
Final source freeze: `2026-09-22T16:35:49Z`

**Phase 1 verified.**

This is an engineering verification result only. It does not claim production deployment, live-provider operation, real-student validation, educator/human review, pedagogical correctness, pilot approval, Phase 2 readiness, or Phase 3 readiness. Those gates remain open.

## 1. Final frozen identity

- Commit: `89c1ca29c117b2f9926e97e12a2738fa110cd2ca`
- Branch: `new-student-UI`
- Tracked diff SHA-256: `6b30db8656e751ce39caa2d526656f0d3ce8e1d3b229163acef0c05928ebc355`
- Relevant untracked-source digest: `d63d5338bfafeb6581fdfb7ac33337eaf4b1a3fca407eb1b2f3dfd68e7c0abdf`
- Lockfile SHA-256: `803ebf8798958d62a0a7e5ef905a97240c98e97b0d7dadcbff45027123378808`
- Journal head: `0217_petros_runtime_closure`
- Source-digest exclusions: `docs/verification/**`, AppleDouble `._*`, and this report only.

Identity artifacts: [freeze](verification/petros-phase1-20260922-final/freeze-utc.txt), [commit](verification/petros-phase1-20260922-final/commit.txt), [branch](verification/petros-phase1-20260922-final/branch.txt), [status](verification/petros-phase1-20260922-final/git-status.txt), [tracked hash](verification/petros-phase1-20260922-final/tracked-diff-sha256.txt), [untracked inventory](verification/petros-phase1-20260922-final/relevant-untracked-files.txt), [untracked hashes](verification/petros-phase1-20260922-final/relevant-untracked-sha256.txt), [journal](verification/petros-phase1-20260922-final/journal-tail.txt).

The post-build identity exactly matched the freeze. `git diff --check`, tracked diff, untracked inventory/hashes, lockfile, and both dumps passed byte comparison. Evidence: [integrity log](verification/petros-phase1-20260922-final/06-integrity.log).

## 2. Protected dump integrity

Baseline, freeze, and final values are identical:

| File | Required/final SHA-256 | Result |
|---|---|---|
| `edrion_database_dump.sql` | `6a3d616e8f215a071a25c7ed717f6b03a2aee514ecce87ef2b7dbb5a512f4b4d` | PASS |
| `edrion_database_dump.sql.gz` | `a281acd5986dac80e4b0326b7f2c9a09249f73411ffd4951c59c01ddc5eb918b` | PASS |

Evidence: [baseline](verification/petros-phase1-20260922/baseline-dump-sha256.txt), [final freeze](verification/petros-phase1-20260922-final/dump-sha256.txt), [post-run](verification/petros-phase1-20260922-final/post-dump-sha256.txt).

## 3. Environment, prerequisites, and isolation

- macOS 27.0 arm64; Node 25.6.0; pnpm 11.1.2; PostgreSQL 15.15; Redis 8.4.0; Chrome 153.0.8010.52; Vitest 2.1.9.
- API DB suites used fresh private PostgreSQL clusters on private Unix sockets, real migrations through `0217`, real policies/grants, and restricted `edrion_app` transactions.
- Redis recovery used disposable Unix sockets. The logged `ENOENT` diagnostics are deliberate loss/recovery injections; their assertions and suites passed.
- Browser checks used production components bundled into controlled localhost servers, Chromium, keyboard input/focus-visible checks, reload/network recovery, reduced motion, and 960×900 plus 390×844 viewports.
- Provider adapters were controlled synthetic fakes. No shared database, real learner data, live/paid provider, external service, commit, push, deploy, publish, or PR was used.

Evidence: [environment](verification/petros-phase1-20260922-final/environment.txt), [API log](verification/petros-phase1-20260922-final/02-api-disposable-suite.log), [browser log](verification/petros-phase1-20260922-final/05-browser-all.log).

## 4. Final exact command closure

The complete reproducible invocations are preserved in the [command manifest](verification/petros-phase1-20260922-final/COMMANDS.md). Each log records UTC start/end, exit code, native file/test counts where applicable, and diagnostics; individual static/build logs also record their exact command.

| Check | UTC window | Observed | Skipped | Result | Evidence |
|---|---|---:|---:|---|---|
| Exact 11 shared contract paths | 16:36:30–16:36:33 | 11 files, 71/71 | 0 | PASS | [log](verification/petros-phase1-20260922-final/01-shared-contracts.log) |
| Exact 15-directory API/disposable command | 16:36:30–16:37:19 | 47 files, 492/492 | 0 | PASS | [log](verification/petros-phase1-20260922-final/02-api-disposable-suite.log) |
| Main production-boundary PostgreSQL/Redis suite | same | 99/99 | 0 | PASS | same API log |
| Provider-mapping closure | same | 10/10 | 0 | PASS | same API log |
| Curriculum closure | same | 12/12 | 0 | PASS | same API log |
| Literal combined S1–S11 journey | same | 1/1 | 0 | PASS | same API log |
| Exact 10 student-web paths | 16:36:30–16:36:37 | 10 files, 73/73 | 0 | PASS | [log](verification/petros-phase1-20260922-final/03-student-web.log) |
| Seven package typechecks | 16:37:32–16:37:54 | 7/7 exit 0 | 0 | PASS | [directory](verification/petros-phase1-20260922-final/) |
| Seven package lint commands | 16:37:32–16:37:43 | 7/7 exit 0; zero errors | 0 | PASS | [directory](verification/petros-phase1-20260922-final/) |
| API/institution/student builds | 16:38:04–16:38:33 | 3/3; web 111 and 38 pages | 0 | PASS | [directory](verification/petros-phase1-20260922-final/) |
| Preparation/visual/question/compatibility Chromium scripts | 16:36:30–16:36:40 | 4/4 | 0 | PASS | [log](verification/petros-phase1-20260922-final/05-browser-all.log) |
| Source/lock/dump integrity | 16:38:57–16:38:59 | exact byte/hash match | 0 | PASS | [log](verification/petros-phase1-20260922-final/06-integrity.log) |

Lint warnings are existing warning-level debt, not hidden failures: schemas 10, database 127, config 0, permissions 0, API 675, institution-web 0, student-web 4. Every exact lint command exited 0 with zero errors.

## 5. V1–V11 matrix

| Scenario | Result | Direct production-path evidence | Owner/downstream |
|---|---|---|---|
| V1 source contract | PASS | Versioned PDF source, readiness, exact locators, owner/RLS denial, additive migration preservation. | source/session intent → V2–V6 |
| V2 immutable extraction snapshots | PASS | Immutable version/page sets, exact historical locators, republish preservation, invalidation/deletion separation, and legacy-row migration compatibility. | knowledge snapshots → V3/V4 |
| V3 preparation interruption/recovery | PASS | Restricted real PDF process, durable queue/outbox, Redis loss/redelivery, cancellation/fences, missing-handler visibility, shutdown/restart, duplicate publication, and retry recovery. | knowledge preparation/worker → V4/V5 |
| V4 intent/retrieval | PASS | Negotiated exact pin, bounded evidence, omitted/unavailable pages, stale locator, another A2 student, same-looking B-tenant student, revocation. | intent/retrieval → V5/V6 |
| V5 durable question | PASS | Receipt, idempotent replay, changed replay conflict, lease/fence/cancel, unsupported pending version, terminal recovery, answer/trace/audit atomicity. | question command → V6/V9 |
| V6 atomic attempt budget reservation | PASS | Per-attempt reserve/dispatch/settlement, exact usage identity, S5 on/off retry/cancel/lost response, no duplicate charge or authoritative answer. | routing/budget/loop → V7–V9 |
| V7 visual | PASS | Safe declarative snapshot/control path, version conflicts, invalid execute action denial, legacy reader; generated behavior stays gated. | visual owner/UI |
| V8 assessment | PASS | Deterministic typed objective evidence and one learner event; audit failure rollback; qualitative execution remains denied. | assessment/learner owner |
| V9 policy | PASS | Immutable source-primary policy, provenance units, injection-as-data, categorized retry/commit denial, historical enforcement after rollback. | institutional policy/gateway |
| V10 provider/curriculum compatibility | PASS | Authenticated HTTP, restricted-role RLS, full permission matrices, lifecycle/effective intervals, exact namespace/ID/no auto-merge, unsupported versions, races, audit rollback, immutable history, stale/superseding release/realignment, raw student closure, browser compatibility. | federation/integrations/courses |
| V11 build closure | PASS | V11-01–08 direct positive/negative/recovery evidence plus literal combined journey and actual settings UI browser path. | all Phase 1 owners |

No mandatory V1–V11 scenario is `FAIL`, `BLOCKED`, or `NOT RUN`.

## 6. V10 detail

### Provider mapping

PASS evidence covers institution-wide integration plus canonical-owner permission; campus, unrelated-role, student, independent, and foreign-tenant denial; all canonical entity kinds; campus/class differences; exact case-sensitive namespace and external ID; no email/name auto-merge; proposal before approval; reject/tombstone/effective intervals; disabled/reconfigured connection; changed/missing canonical references; unsupported stored/input version without fallback; exact and changed retry; real concurrent 200/409 conflict; real audit-trigger rollback; strict CSV quoting/padding/duplicate/role limits; upstream hash/revision; historical `not_revalidated`; preview `applied: 0`; zero identity/role/student/enrollment mutation; disabled OIDC/SAML and external sync with zero network/session/job/audit/canonical effect.

Primary evidence: `petros-compatibility.integration.spec.ts`, `petros-provider-mapping-closure.integration.spec.ts`, `provider-mappings.service.spec.ts`, migration specs, federation service specs, and the API/browser logs above. Migration/RLS owners: `0215_petros_compatibility_contracts`, `0216_v10_rls_immutability`, `zzz_rls.sql`, `zzz_grants.sql`; audit action `roster.mapping_changed`.

### Curriculum alignment

PASS evidence covers complete course-owned identity/version/provenance/effective intervals; many-to-many mapping without mastery inference; missing/duplicate references; hierarchy/supersession cycles; proposal before exact approval and approval-without-proposal rejection; protected recent-auth/MFA review; ordinary syllabus route cannot review; override/rejection reason; history after removal; syllabus/subject staleness; coverage-only identity preservation; effective superseding release → stale → explicit realignment; assigned instructor with `syllabus.manage` and no `courses.manage`; course manager without syllabus permission denied; unrelated/inactive/reassigned/foreign/campus-excluded denial; enrolled approved-only raw response; withdrawn/other/foreign denial; reference/relationship/module/release/framework/transitive closure; no unrelated/review-only leak; content-free stale/unsupported/unmapped states; legacy array and `{modules}` readers; record/manifest/syllabus/audit rollback; exact retry and true concurrent conflict.

Primary evidence: `petros-curriculum-closure.integration.spec.ts`, `petros-compatibility.integration.spec.ts`, shared curriculum contract tests, API/browser logs. Persistence/audit owners: `course_curriculum_records`, `course_curriculum_revisions`, `course_syllabus_modules`, `audit_events`, `0215`–`0217`.

## 7. V11-01 through V11-08

| Scenario | Result | Observed evidence |
|---|---|---|
| V11-01 service/voice durable boundary | PASS | Direct, controller, and real confirmed-voice document calls deny before profile, command, block, speech, media, or provider effect; typed category survives. Non-document voice and compatible non-document session remain permitted. |
| V11-02 pending work/rollback | PASS | Queued/running and future-version durable work blocks direct/HTTP/voice legacy calls with flags off; terminal status permits new-key legacy work; same-key durable identity remains protected; admission/cancel/read races terminate without duplicate or deadlock. |
| V11-03 authority each attempt/fallback | PASS | Four stages × typed source/lease/session/policy, bare 401/403, and uncoded denial; callback before attempt and after reservation; no later dispatch/fallback success; undispatched zero release; failed release preserves original denial/recoverability; provider/content failure keeps disclosed fallback. |
| V11-04 older fence/no provider | PASS | Old dispatched hold becomes one ambiguous full-reserve usage before preparation; newer hold unaffected; no-provider completion has no leak; duplicate recovery/cancel/lost response idempotent; late settlement conflicts; failed usage write rolls back and next lease recovers; provider transport has no tenant transaction. |
| V11-05 external execution disabled | PASS | Clever/ClassLink/OneRoster REST direct services and authenticated routes deny with/without credentials before dependency/network/job/audit/canonical effects; settings UI has no sync action or REST credential controls; CSV preview remains available and read-only; OIDC/SAML hard-gated. |
| V11-06 student curriculum projection | PASS | Actual raw HTTP retains effective approved closure and module refs only; not-effective/proposed/rejected/unrelated records absent; stale/unsupported/unmapped content-free; legacy readers compatible; no learner mutation. |
| V11-07 instructor authority | PASS | Assigned active instructor with syllabus permission/no course-management reads; course manager still needs syllabus permission; unrelated/inactive/reassigned/foreign/campus-excluded denied; review remains recent-auth/MFA and approval-permission guarded. |
| V11-08 combined closure | PASS | One private DB/server journey combines source, preparation, intent, retrieval, durable gateway/budget, S5/S9, retry denial, old fence, visual, assessment, syllabus, student projection, roster, external gates, unsupported versions, rollback, revocations and confirmed voice. Actual settings UI path passes on the same frozen identity. |

## 8. Integrated positive and negative journey

Test: `Petros Phase 1 literal S1-S11 journey / disposable Postgres > combines the literal S1-S11 source, durable gateway, recovery, visual, assessment, roster, syllabus, SSO, instructor, student and voice paths`.

Observed synthetic IDs are emitted in the final API log:

- institution `220f47d8-aaef-4b8c-9dd0-9a1512026781`
- student `0de4cfe0-a807-4058-a76f-627010696a77`
- course `8fcbea3c-b543-45ef-b5c4-8af87523a1cf`
- provider `fb2b94f8-6769-4b00-a43f-44d1a849a67a`
- source `d6897090-a72d-4738-8141-5468288c48be`
- intent `408f00a2-f458-4feb-831e-33731f47b629`
- session `09dad113-0e76-40b2-a4de-a0486cec5c8b`
- durable key `7a226a51-756c-43a5-b267-9019557ff022`

The one journey passed all 22 requested steps. Negative coverage in that same private cluster includes unreadable/omitted scope, real another-student A2, same-looking foreign B student, stale snapshot, disabled route, changed policy before commit, unsupported provider/curriculum versions, failed audit persistence, old readers, direct/voice bypass, future pending execution version, per-attempt authority loss, older abandoned reservation/no-provider recovery, approved-only raw student projection, and disabled roster/SSO with zero side effects. Focused companion suites on the same identity expand every concurrency/failure permutation. Actual federation settings, instructor/student consumers, keyboard focus, reload, permission denial, typed voice denial, and network recovery pass in the production-component Chromium script.

Expected result: one terminal authoritative answer/trace/audit per logical command, no authority-to-fallback success, no canonical roster mutation, no review-only curriculum leak, no leaked reserved spend, and recovery after injected persistence/network/queue failures. Observed result: PASS, exit 0, 1/1.

## 9. Preserved failures and repairs

Failures were recorded before repair. Preserved evidence includes:

- [original 2026-09-21 run](verification/petros-phase1-20260921/)
- [pre-repair lock inversion](verification/petros-phase1-20260922/pre-repair-v11-lock-order.log) and [post-repair result](verification/petros-phase1-20260922/post-repair-v11-lock-order.log)
- [first API quota failure](verification/petros-phase1-20260922/pre-repair-final-02-api-disposable-suite.log)
- [immutable-cleanup failure](verification/petros-phase1-20260922/pre-repair2-final-02-api-disposable-suite.log)
- Combined-journey staged-migration `42501` failure preserved in earlier focused-run history; fixed by applying real post-migration grants after staged compatibility replay.

Bounded repairs include `0216` identity-provider RLS/roster immutability, `0217` legacy/durable uniqueness and dispatch/recovery accounting, per-attempt authority revalidation, undispatched zero release, lock-order correction, exact replay, server-side curriculum projection, external sync/SSO gates, instructor read authority, and narrow lint/build configuration. No gate was weakened to pass a test.

## 10. Compatibility, recovery, and atomicity findings

- Legacy source/session/detour/diagram/assessment, portal syllabus arrays, student `{modules}`, and unnegotiated readers remain valid.
- Unknown/latest versions never fall back. Unsupported provider/curriculum/execution records fail closed or become content-free as specified.
- Source publication, answer/trace/audit, curriculum records/manifest/syllabus/audit, and usage settlement rollback atomically under injected write failures.
- Known-undispatched holds release at zero; dispatched unknown outcomes settle conservatively once; late results cannot overwrite usage; next-lease recovery succeeds.
- Provider transport occurs outside tenant transactions. RLS/tenant/canonical-owner checks stay on all database boundaries.
- Generated visual behavior, qualitative assessment execution, external roster sync, and federation authentication remain disabled.

## 11. Files and working-tree comparison

The complete final dirty-tree inventory is the frozen [git status](verification/petros-phase1-20260922-final/git-status.txt); exact untracked files and hashes are linked in §1. The final closure added or extended the provider mapping, curriculum closure, and literal combined journey integration specs; document voice/loop compatibility specs; the S10/S11 Chromium script; the authoritative Execution Ledger; and this report. It preserved all pre-existing unrelated changes and created no commit.

Post-run source identity, lockfile, and dumps match the final freeze exactly. No unresolved mandatory failure or blocker remains.

## 12. Conclusion

All mandatory V1–V11 scenarios are `PASS`; none is `FAIL`, `BLOCKED`, or `NOT RUN`. The integrated positive/negative journey passed on the same final frozen identity. Required typecheck, build, lint, browser, migration, RLS, rollback, and dump-integrity checks passed.

**Phase 1 verified.**

Human, pedagogical, production, deployment, and pilot gates remain open. Phase 2 and Phase 3 are not accepted by this result.
