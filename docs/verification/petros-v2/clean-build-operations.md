# M0-R clean-build supplement — 9 October 2026

This supplements the frozen staging operations runbook. It authorizes no target connection or deployment. The earlier 33-file archive is retained as historical evidence; use only the newly verified archive/hash named in `clean-build.md` for a later approval request.

## Build and startup

- Runtime: Node **24.21.0**, pinned by `.nvmrc`, with package engines `>=24.21.0 <25`; pnpm **11.1.2**, with the existing package-manager integrity pin. Node 20 is end-of-life and incompatible with pinned pnpm 11. The lockfile and dependency versions remain unchanged.
- Install from the new archive's `source/` with `pnpm install --frozen-lockfile`. The source freeze intentionally includes API/workspace dependencies, not the four Next.js apps. Retain the installed workspace dependency tree, including `tsconfig-paths` required by the compiled launcher; a pruned production-only install has not been validated.
- Run `pnpm --filter @edrion/api build`. This compiles the complete API and imported workspace sources, copies `pdf-extract.cjs`, writes the CommonJS boundary and exact emitted workspace aliases, and creates relative dependency links for emitted workspace packages. Preserve these links when packaging the built installation. Build in the final release directory or preserve its relative layout.
- Start with `pnpm --filter @edrion/api start:built`. The launcher reads emitted JavaScript, sets the release-root `.env` path, and does not load ts-node or development TypeScript. `main.ts` still applies dotenv with `override:true`. The source-based `start` command remains available for existing development workflows; the staging proposal uses `start:built`.
- Mount an approved **new** release-root runtime `.env`; never copy the checkout `.env`. API/worker runtime must not receive a migration secret. Keep the separate one-shot migrator and its unchanged source runner, using `DATABASE_MIGRATION_URL` without falling back to `DATABASE_URL`.
- Provision external parser/converter tools explicitly. macOS uses `/usr/bin/sandbox-exec`; Linux requires `/usr/bin/bwrap`, `/usr/bin/prlimit`, compatible namespace permissions and Node permission support. Require LibreOffice `soffice`, Poppler `pdftoppm`, and necessary fonts for conversion/rendering. `pdfjs-dist` and its packaged fonts/CMaps come from the lockfile. Set reviewed `MATERIAL_PREVIEW_CONVERTER_BIN` and `MATERIAL_PDF_RENDERER_BIN` paths if needed. Missing sandbox support must fail closed; do not remove isolation, enable addons or widen access to obtain a pass.

The clean environment here is macOS arm64 with separately downloaded, checksum-verified Node/pnpm, an empty dependency store, empty npm user/global configuration and an environment allowlist. It proves that install/build/start do not need the developer's installed node_modules, shell configuration, application `.env` or credentials. It is not a Linux container/image certification. Converter/renderer and PostgreSQL/Redis are explicitly identified host executables, not tools shipped in the source archive.

## Target-specific approval gate

No isolated staging target or write window was supplied or discovered in the deployment packet. No placeholder is an existing or approved resource. The checkout's configured database must not be substituted. Before any target connection, supply and approve:

| Required identity | Required evidence/value |
| --- | --- |
| Staging owner, cloud/account/project and region | Explicitly separate from production |
| Compute service/host, release directory and API origin | OS/architecture, image digest, service name, ingress containment |
| PostgreSQL host/port/database/cluster identity | Staging-only database; TLS CA/server identity and current version |
| Redis instance/namespace and credential reference | Separate staging queue; persistence/restore and TLS configuration |
| Original/derived asset volumes/buckets/prefixes | Student storage, attachments/guidance, previews, ownership and access controls |
| Separate restore PostgreSQL and asset target | Approved capacity, identity, restore isolation and retention |
| Secret-manager record references | App, worker, evaluator, migrator/auditor, Redis and three distinct signing secrets; no secret values in this report |
| Synthetic test users/authority and allowed routes | Student/teacher accounts; legitimate staging permissions; no real academic records or paid routes |
| Write window | Start/end in Asia/Kolkata, drain owner, abort deadline, maintenance and rollback operators |
| Operational bounds | Lock/statement timeout, connection budget, acceptable query latency and measured recovery objectives |

Required exact runtime identities remain `edrion_app`, `edrion_petros_document_worker` and `edrion_petros_document_evaluator`, all LOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOREPLICATION, zero memberships/public ownership/schema CREATE. Administrative migration and audit identities remain separate. The final SQL overlays may create missing dedicated roles as NOLOGIN; approved credential provisioning must precede application use. A present unsafe role requires dependency review, not blind revocation.

Approval must bind the final archive **and manifest hashes**, these identities, resource identifiers, configuration revision and write window. An authorized read-only preflight still requires explicit approval before connection. Divergent migration history, reservation, schema, roles or grants stops the write plan for a new review; conditional approval cannot authorize unknown additional repairs.

## Proposed changes and contained validation

The exact file inventory/hashes are in the final manifest: the prior 33 files plus seven build/runtime files (`.nvmrc`, root and API `package.json`, API `tsconfig.json`, `main.ts`, `copy-build-assets.mjs`, `start-built.cjs`). The package builder is updated as verification tooling. Database SQL, historical migration files, original proposal, and the migration runner are unchanged by the clean-build fixes. No dependency version, RLS policy or security assertion was loosened.

The target proposal remains additive repair `0234` / idx 156 / timestamp 1791417600001, only after validating reservation/history; pending idempotent `0233` where actually needed; final grants; final RLS/Phase B overlay; existing V1 visual backfill; restricted-role credential cutover; contained runtime configuration and compiled API startup. The runner order and partial-commit hazards in `staging-operations.md` remain authoritative. No legacy journal gap is replayed and no ledger receipt is fabricated.

Before writes, drain admissions/queues/providers and stop old pools; capture consistent `pg_dump -Fc`, ordered ledger, encrypted globals and exact ACL/RLS/function/role state; snapshot **all** original/derived assets, manifests/hashes, storage metadata, permissions and Redis/durable work. Restore to the separately approved target and verify hashes, V1 histories, security denials and measured RPO/RTO. Backup presence alone is insufficient.

Initial runtime uses `staging.env.example`: document teaching false, AI demo, generation false, all 20 current Petros enabled flags false, every development authentication/OTP-return bypass false, no provider credentials or paid routes, provider egress denied. Workers stay stopped during cutover. Optional document pools remain unopened while teaching is disabled; separately bounded role checks do not prove an enabled document pipeline.

After a separate approval, validate authenticated student/teacher login/logout, teacher document upload/publication and wrong-context denials, V1 history/pause/resume, disabled document preparation (no writes/dispatch), tenant/private-answer denials and all three effective role restrictions. General worker/recovery tests require the approved worker scope. Enabled document-teaching/mock journeys require an additional explicit configuration approval; they are not silently enabled to complete a checklist. Record any excluded journey as UNVERIFIED. Measure actual migration lock duration/contention, authority/checksum query latency and connection behavior under the approved limits.

## Rollback and stop conditions

Keep traffic/jobs stopped on failure. Roll back an open journal transaction and compare original receipts. For failure after a standalone SQL/backfill/credential commit, preserve partial-state/queue/asset receipts; restore the consistent database, global/security state and assets to the approved isolated restore target. Verify all hashes/history/role denials and reconcile acknowledged post-checkpoint writes and durable commands before an approved switch and new pools. An application-only downgrade is unsafe. Do not erase migration history, drop populated repair tables, disable RLS/immutability, widen runtime privileges or restore a superuser application login.

No staging result or production-readiness conclusion follows from the local build. Production, M1–M8, V2 activation, unapproved document teaching, paid AI and real academic pilots remain outside this work.
