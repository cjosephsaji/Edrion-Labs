# Petros V2 M0-R — clean build and staging authorization gate

**9 October 2026, Asia/Kolkata. Clean macOS build: PASS. Actual staging: BLOCKED pending target identification and explicit approval. Production: BLOCKED.**

The Phase A, Phase B and staging-preflight reports, implementation plan's M0/M0-R requirements, frozen package and staging operations runbook were reviewed. This work closes local installation, supported-runtime and compiled-startup uncertainties. It does not repeat architecture planning, authorize deployment or start M1–M8.

No staging/production database, API, Redis or asset service was contacted, including read-only access. No live credentials, roles, grants, RLS, feature settings or academic records changed. Paid and mock provider calls in this contained build validation were both zero.

## Verification results

| Finding | Classification | Evidence and limit |
| --- | --- | --- |
| Original frozen package | **PASS** | Archive `e57dd73826fef35ad550a99e1add28490f76b628deffde7148091ecb4c449739`, manifest `e3f187e00b703da8e00d00fe6032ce339905c52175aa6932871ba2a0720bcc75`; all 1,816 source, 33 deployment and six packet hashes verified. Both rehearsal-manifest copies match. Current source had no unexpected drift; four proposal-only database files were correctly excluded from direct checkout equality. |
| Runtime compatibility | **PASS after correction** | Node 24.21.0 LTS and pinned pnpm 11.1.2; downloaded archives verified against official Node SHA-256 and npm pnpm integrity metadata. pnpm's package requires Node >=22.13. `.nvmrc` and root engines now agree with the tested Node line. |
| Clean dependency installation | **PASS** | Empty store: 610 downloaded, zero reused; `pnpm install --frozen-lockfile` succeeded with an environment allowlist and empty npm user/global configs. No developer node_modules was used. The original lockfile is byte-identical; frozen installation was revalidated after the build changes. |
| Complete API compilation | **PASS** | The actual `pnpm --filter @edrion/api build` completed on Node 24; compiler emitted the API and imported workspace sources; the asset copier completed. |
| Compiled application startup | **PASS** | Full `AppModule` and emitted `main.js` ran through `start-built.cjs`, with API and workspace TypeScript source directories renamed unavailable. Fresh restricted URL-created application pool; production containment profile; a deliberately invalid inherited database URL was overridden by the generated release-root `.env`. No ts-node was loaded in the application child. |
| Contained application scenarios | **PASS** | Five checks: existing historical migration runner twice; full compiled application startup; authenticated login/history with missing/dev-header/foreign denials; disabled document preparation with no writes/dispatch; unsafe superuser ordinary URL rejected before listening. Synthetic isolated PostgreSQL/Redis only. |
| PDF/converter assets | **PASS locally** | Eight checks: copied PDF child equality; compiled sandboxed digital-PDF extraction; installed PDF.js fonts/CMaps; native canvas PNG; ODP→PPTX; PPTX→PDF; generated legacy PPT→PDF; Poppler PDF rendering. Provisioned host tools: LibreOffice 26.8.0.3 and Poppler (exact version in evidence). |
| Parser security on Node 24 | **PASS** | Six existing real-OS-sandbox tests, zero failures/skips: credential/file/write/subprocess/network denials, wall/output/RSS/CPU bounds, cancellation and malformed input. Security controls were retained. |
| Replacement package | **PASS** | Two independent deterministic archives/manifests match; every archive hash verified. 1,817 source files, 40 deployment files, eight packet files. All build-copy source input hashes match the final manifest. |
| Work preservation | **PASS** | 278 starting file records: 272 unchanged, six intentionally extended, none missing. `main.ts` was previously clean; one new launcher was added. HEAD, original archive, original proposal, lockfile, working migration journal, SQL replay files and migration runner preserved. No `0234` was added to the checkout. |
| Exact isolated staging target/write window | **BLOCKED** | No target identifiers, owner, secret-manager references, restore target or window supplied. The old configured database and placeholder template hosts are not staging candidates. |
| Target schema/history/reservation/roles/grants/RLS | **UNVERIFIED** | No authorized connection. Historical findings are not refreshed or assumed true for an unknown target. |
| Target image, TLS, secret delivery and effective flags/routes | **UNVERIFIED** | No container engine installed here; no Linux image, deployment architecture, remote services or secret delivery tested. A pruned production-only dependency installation was not tested; the documented compiled launch retains the installed workspace dependency tree. |
| Target backups/restoration, queue durability and operations | **UNVERIFIED** | Real database/globals/security/assets/Redis coverage, RPO/RTO, migration locks, query latency and connection behavior require the separately approved target. |
| Enabled document teaching and real pilots | **BLOCKED** | Teaching remains disabled. Optional worker/evaluator pools are not exercised by the contained compiled startup. Existing academic prerequisites and separate feature approvals remain. |
| Production readiness/deployment | **BLOCKED** | Local or staging tests alone cannot establish production readiness. Separate review and production-specific authorization are required. |

The previous **393 passing tests and 14 full-application scenarios remain historical rehearsal evidence**. This turn reran six parser-security tests and performed five contained compiled-application checks plus eight asset checks. It does not claim to have rerun all 393 tests or all 14 enabled rehearsal scenarios.

## Build defects resolved

The original package installed and compiled successfully on Node 24, but direct emitted-JavaScript startup failed because workspace exports selected TypeScript source. A first compiled alias pass exposed that some imported workspace modules had not been emitted: the previous tsconfig listed only selected package aliases. The final build includes the wildcard workspace alias, resolves emitted exports, preserves each package's dependency lookup through relative links, and writes a CommonJS boundary. The new launcher sets the correct release-root `.env` path before loading compiled main; dotenv override behavior remains explicit.

The runtime declaration also required correction. The earlier `.nvmrc` requested Node 20 while pnpm 11 requires >=22.13; Node 20 is now end-of-life. The replacement pins Node 24.21.0 and engines `>=24.21.0 <25`, retaining pnpm 11.1.2 and every lockfile dependency. Sources: [pnpm installation/compatibility](https://pnpm.io/installation), [official Node release status](https://nodejs.org/en/about/previous-releases), [official Node distribution index](https://nodejs.org/dist/index.json).

The exact incremental changes are in [clean-build-fixes.diff](clean-build-fixes.diff). Seven new deployment paths extend the prior 33-file inventory: `.nvmrc`, root `package.json`, API `package.json`, API `tsconfig.json`, `main.ts`, `copy-build-assets.mjs`, and new `start-built.cjs`. The package builder is additionally updated as verification tooling. No migration, RLS, authority guard or application feature logic was relaxed.

Intermediate failures are retained in the evidence directory. Private test-harness setup needed canonical `/private/var` paths for TypeScript configuration, a short Unix-socket directory, and explicit `LC_ALL=C` for Homebrew PostgreSQL startup in the scrubbed environment. An asset assertion initially used a font filename absent from this PDF.js version; it was corrected to the installed Liberation Sans file. These were harness/configuration corrections, not reasons to weaken runtime protections. Synthetic legacy conversion emitted non-fatal Fontconfig cache warnings; layout/font fidelity on a real image remains unverified.

## Final package

[Replacement archive](../../../output/petros-clean-build-20261009/petros-m0r-clean-source.tar.gz)

**Archive SHA-256:**

`1c4c585c5bd4efcc680356a16ada49d234f19d98dbffeb2f15b8e44938e7fbe7`

**Manifest SHA-256:**

`316257df5c43dab43651485e3261c59323661a4521db410cd579d4eec804a5c7`

[Manifest](../../../output/petros-clean-build-20261009/manifest.json) · [machine-readable results](clean-build-results.json) · [raw evidence/index](../../../output/petros-clean-build-20261009/evidence/index.json)

The original archive is retained unchanged. The new archive contains frozen sources, both original/incremental proposals, environment templates, the original runbook and the [clean-build operations supplement](clean-build-operations.md). It excludes installed dependencies, build output and actual environment/secret files. It is a source deployment packet, not a Linux image or a frontend release. Never apply its original application patch over already-integrated files.

## Required approval before staging connection

The concrete proposed file changes and package hashes are reviewable. A **target-specific** change cannot be finalized without actual resource identifiers. [staging-approval-required.json](../../../output/petros-clean-build-20261009/staging-approval-required.json) explicitly records both connection and write approval as false and every missing target field as null.

Supply the staging owner/account/project/region; compute/API and image OS/architecture/digest; PostgreSQL host/port/database/cluster identity; isolated Redis; every original/derived asset location; a separate database/assets restore target; restricted-role, migrator/auditor, Redis and signing-secret references; synthetic test identities; and an Asia/Kolkata write window with rollback operator, lock/statement limits, connection budget, latency bounds and recovery objectives. No secret values should be pasted into chat.

Then explicitly approve the **named resources, final archive and manifest hashes, configuration revision, backup/restore scope and write window before any connection**. Read-only inventory is included in this stop boundary. Unexpected history/schema/role state requires a new review before writes.

Once separately authorized, the proposed order remains: bounded target inventory → drain writes/queues/workers and stop pools → consistent database/ordered ledger/encrypted global-security/all-assets/queue backup and verified restore → approved restricted LOGIN credentials → unchanged migration runner's pending Drizzle transaction, grants, final RLS overlay, V1 backfill → receipt/security verification → separate contained runtime `.env` and compiled startup → authorized authenticated journeys and operational measurements. The historical shape legitimately adds 0233 and 0234 receipts; other target histories must be reconciled rather than forced to that count. The migration runner is not one atomic transaction.

Keep document teaching, all current Petros feature flags and paid AI disabled; disable every development authentication bypass. General worker tests need an approved scope; enabling document teaching for mock tests requires additional explicit configuration approval. Omitted journeys remain UNVERIFIED.

Rollback after a committed standalone SQL/backfill/credential change requires preserving partial-state evidence and restoring database **plus global/security state and all original/derived assets** into the approved isolated restore target. Verify histories/hashes/role denials and reconcile acknowledged writes/durable commands before an approved switch and fresh pools. An application-only downgrade, fabricated receipts, disabled RLS or restored superuser application access is unacceptable. Full requirements are in the unchanged runbook and supplement.

**Stopped before staging and production. Please identify the staging/restore targets and write window, then provide explicit approval of the completed target-bound plan. No deployment is scheduled.**
