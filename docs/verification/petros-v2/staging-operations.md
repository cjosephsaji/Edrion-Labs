# Proposed staging operations — approval required before execution

This runbook is a deployment proposal, not an authorization or deployment receipt. Use the frozen source archive and its `manifest.json`, original Phase B patch, incremental runtime fixes, and separate runtime/migration environment templates. Never apply the original full patch to an already modified Phase B checkout. The archive already contains the final application bytes and the four proposed database files.

## Target and package gate

1. Obtain explicit approval for the named **isolated staging target**, exact archive SHA-256, runtime configuration and write window. Production needs separate later approval. Reject production host/database/Redis/storage identifiers; do not reuse production credentials, student rows, provider registry secrets or academic authority. No target is selected by this runbook.
2. Extract to a new release directory. Verify archive SHA-256 and every `sourceFiles` and `deploymentFiles` SHA-256 from `manifest.json` before installing or executing anything. Install the frozen lockfile with the repository's pinned pnpm version and `pnpm install --frozen-lockfile` in the selected build environment. Record Node/PostgreSQL/Redis versions. Build/typecheck there. Rehearsal used existing dependencies, not a newly downloaded Linux image.
3. Independently inventory staging identity, `current_user`, `session_user`, role memberships/attributes/ownership, executable SECURITY DEFINER functions, installed DDL/index/FK/policy/ACL definitions, migration receipts and asset topology. Read the target ledger in a bounded read-only transaction. Export receipts in order with real hashes/timestamps; compare with trustworthy existing deployment history. No receipts may be rewritten or inserted by hand.
4. Require unused `0234_petros_readiness_repair`, journal `idx=156`, `when=1791417600001`, with the journal still ending in `0233` before the proposed append. Recheck both repository and target immediately before execution. Any newer migration, unknown high-water mark, incompatible constraint/index, or history shape differing from the reconciled dossier aborts this procedure and requires a new review.
5. The rehearsed historical target has 153 receipts, separately installed guidance DDL, original integer-seed `0190` hash, and merge-parent extraction timestamps. The normal runner legitimately adds pending idempotent `0233` and additive `0234` receipts. It does **not** fill the old `0208/0209` journal gaps. A fresh journal installation instead has 157 real receipts. Do not force either count onto a different real target.

## Credentials and configuration

Use separate secret-manager records mapped to these exact environment names:

| Process | Secret/environment names | Effective login |
| --- | --- | --- |
| Ordinary API | `DATABASE_URL` | `edrion_app` |
| Document worker pool | `PETROS_DOCUMENT_WORKER_DATABASE_URL` | `edrion_petros_document_worker` |
| Private evaluator pool | `PETROS_DOCUMENT_EVALUATOR_DATABASE_URL` | `edrion_petros_document_evaluator` |
| One-shot migration job only | `DATABASE_MIGRATION_URL` | approved migration administrator/DDL owner |
| Cookie/document/media signing | `SESSION_COOKIE_SECRET`, `DOCUMENT_VERIFY_SECRET`, `PETROS_MEDIA_SIGNING_SECRET` | distinct staging-only secrets |
| Queue | `REDIS_URL` | isolated staging Redis, authenticated/TLS as supported by the selected topology |

Runtime roles must be LOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOREPLICATION, with no memberships, owner/admin inheritance, public object ownership or public schema CREATE. The migration overlay can create missing dedicated roles as **NOLOGIN**; it does not provision password secrets. Provision/rotate credentials only through the approved administrative process. For an existing unsafe role, stop and review its actual dependencies before changing it; this is not permission to revoke unrelated live grants blindly.

Do not mount `DATABASE_MIGRATION_URL` in the ordinary API or worker environment. Do not point an ordinary URL at the owner as a workaround. TLS certificate/server authentication and real secret delivery must be validated on the approved target; disposable Unix-socket identity tests do not certify those services.

Initial runtime configuration is the supplied `staging.env.example`: `PETROS_DOCUMENT_TEACHING_ENABLED=false`, `PETROS_AI_MODE=demo`, all current Petros feature `*_ENABLED` settings false, `LEARN_SESSION_GENERATE=false`, all development authentication switches false, synthetic pilot instrumentation false, and queue workers off during cutover. Keep provider API keys/encryption credentials and live routes unavailable, with outbound provider access denied. The controlled local mock test's `live` mode and enabled features are **test-only**, not the proposed staging settings. There is currently no implemented V2 engine flag to enable; do not invent one as an authorization shortcut. Validate any database-backed flags/routes against the approved initial state as well.

Both `apps/api/src/main.ts` and `packages/database/src/migrate.ts` load the release-root `.env` with `override:true`. An inherited shell URL does not override that file. Use a new release directory with exactly the approved one-shot migration `.env` for the migration job, then mount the separate runtime `.env` for the API. Do not copy the developer checkout's `.env`. Explicitly validate the resolved environment before each process starts without printing secret values. Preserve the config revision and redacted effective-value receipt.

## Backup and worker drain

1. Close admissions and pause affected BullMQ queues before stopping workers. Drain active work and external provider requests to zero; inspect queued/delayed jobs, persisted preparation/command/outbox leases, usage reservations and dispatch sequences. Capture their state with the database checkpoint. Unfinished work must remain recoverable; do not flush Redis or delete durable commands. No queue-drain command is executed by this packet.
2. Stop/drain affected API writes and workers, then terminate their old connection pools. Keep them stopped through the migration, old broad grants replay, final overlay, credential cutover and validation. The intermediate broad-grants state is unsuitable for serving traffic.
3. Capture a consistent database custom-format dump (`pg_dump -Fc`), the original ordered migration ledger export, and the exact global role/security state (`pg_dumpall --globals-only` plus catalog ACL/policy/function inventory). Global dumps may contain password hashes: encrypt/restrict them as secrets. Record database identity, snapshot time and SHA-256. A database dump alone does not restore role credentials.
4. Capture **all** original and derived objects: student-storage, attachment/guidance storage, rendered previews/cache objects required for replay, storage metadata and driver keys, manifests, file SHA-256, permissions/ownership and volume/object-store configuration. Use a consistent stopped-write checkpoint or approved storage snapshot. Do not assume one API-relative directory covers all assets; current guidance uses local disk directly.
5. Restore the captured database, global/security state and asset snapshot into a separately approved restore target. Verify every manifest hash, representative original/derived read, current permissions and V1 histories before allowing the staging change. Record measured RPO/RTO. Disposable six-file restoration does not establish staging coverage or the proposed 15-minute/4-hour objectives.

## Exact migration and credential cutover order

1. With traffic/jobs drained, provision the approved restricted login secrets on staging. Keep the migration identity separate. Record role attributes and memberships. Leave runtime traffic stopped.
2. Confirm the frozen release contains exactly the appended repair entry and proposed SQL. Validate its `.env` contains a nonempty, approved `DATABASE_MIGRATION_URL`; abort if it would fall back to `DATABASE_URL`. Set connection-level `PGOPTIONS` to reviewed bounds (the local rehearsal uses a 2-second lock bound/15-second fixture query bounds; choose real DDL statement duration from staging size measurements).
3. Run the **unchanged existing runner once** from `source/`:

   ```sh
   pnpm --filter @edrion/database migrate
   ```

   Its exact sequence is: Drizzle's timestamp-gated journal transaction (pending idempotent `0233`, then additive `0234` on the rehearsed historical shape) → `migrations/sql/zzz_grants.sql` → `migrations/sql/zzz_rls.sql` (including the **final Phase B** restricted-role/public-private/lifecycle overlay) → `runVisualCanvasesV1Backfill` → connection close. Each sorted standalone SQL file is submitted separately; the whole runner/backfill is **not one atomic transaction**. There are only these two standalone SQL files in this frozen release. Do not run broad grants after the final RLS overlay. Do not additionally execute the guarded rehearsal SQL or a second independent repair/backfill script.
4. If any step fails, keep traffic stopped. Determine whether Drizzle, either standalone file or backfill committed. A successfully committed migration has a real runner receipt; preserve it. Roll back any still-open transaction. Repeated full runner execution is idempotent in the fixtures but requires verifying real partial state first. Never repair history manually to make a retry look clean.
5. Verify additive columns/tables, all eight composite relationships, exact intended indexes, FORCE/ENABLE RLS policies, grants, append-only/lifecycle triggers, and no dedicated-role executable SECURITY DEFINER bypass. Compare all original ledger receipts byte-for-byte; confirm only the legitimate expected additions. Verify original row/history/official-mark receipts; allow only documented additive/backfill changes.
6. Replace the migration `.env` mount with the approved runtime environment, with no migration secret, and start the frozen API on the three restricted URL identities as applicable. Initially keep document teaching and newer Petros flags disabled. The optional worker/evaluator pools are deliberately unopened while teaching is disabled; do not count this as evidence of enabled target-pool operation.
7. Perform the validation below with queues/admissions still contained. Enable general workers only if included in the specific staging approval and after scoped handler/recovery checks. Enabling document teaching, paid providers, V2 or real pilots requires its own explicit authorized configuration; this packet does not approve it.

## Post-deployment validation commands and journeys

Run these only on the explicitly approved staging target, using separate role secrets through the secret system (not command-line literals):

```sh
curl --fail "$APPROVED_STAGING_API/v1/health"
pnpm --filter @edrion/api typecheck
pnpm --filter @edrion/database typecheck
pnpm --filter @edrion/config typecheck
```

For each actual runtime connection, issue a bounded read-only catalog check via `psql` or the normal PostgreSQL client:

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT current_database(),current_user,session_user;
SELECT rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication
FROM pg_roles WHERE rolname=current_user;
SELECT count(*) AS memberships FROM pg_auth_members
WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user);
SELECT has_schema_privilege(current_user,'public','CREATE') AS can_create;
SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id;
ROLLBACK;
```

Ledger reads use the migration auditor identity if a runtime role correctly lacks access. Verify expected role names, false unsafe attributes, zero memberships/ownership/schema-create. Under the ordinary app role, an unscoped private knowledge/session query must return no rows and `SELECT private_plan FROM petros_document_lesson_artifacts` must fail permission checks. Dedicated worker/evaluator logins must be read/restriction checked independently when authorized; they must never substitute the ordinary or migration secret.

Use authorized **staging-only synthetic** users/cookies to repeat password login/logout, absent/development-header/foreign-user/foreign-institution denials, V1 active/paused/history, teacher upload/publication and wrong-context denials, source revocation and (only in an explicitly enabled mock configuration) pack qualification/review, prepare → BullMQ → worker → public lesson, evaluator assessment, pause/resume, current authority withdrawal, retries/cancellation/Redis recovery. Check `Cache-Control: private, no-store` and absence of private plans in HTTP/model context. Confirm paid usage/provider dispatch remains zero in the initial contained configuration. A health response alone does not clear the gate.

The repeatable **local-only** commands are in `staging-preflight.md`; they allocate their own targets and must never be retargeted to staging URLs. Staging-specific smoke/load, lock duration, TLS/secret delivery, actual storage restore and RPO/RTO results remain separate receipts.

## Failure containment and restoration

- Before a journal transaction commits: roll it back, verify original ledger/catalog/data/asset receipts, and keep affected traffic off until the cause is understood.
- After any standalone SQL, backfill or credential cutover: stop admissions/jobs and preserve current queues, leases, receipts and assets for reconciliation. An application-only downgrade is unsafe across the grants and projection changes.
- Restore the consistent pre-change database into a new isolated target. Restore its captured role/ACL/policy/function state through the approved privileged process and its original/derived assets with manifest verification. If the pre-change runtime credential was unsafe, keep it contained and apply an approved restricted-role repair before serving any traffic; never reintroduce superuser application access.
- Validate row/history/ledger/official-mark receipts, asset hashes, role denials and authenticated V1 journeys on the restored target. Reconcile every post-checkpoint acknowledged write and durable command before an approved switch; do not replay stale provider results or duplicate charges. Repoint secrets and storage only after this verification and approval, then create fresh pools.
- Leave unused additive tables contained if forward recovery is chosen. Do not drop populated repair tables, erase receipts, disable RLS/immutability, fabricate historical receipts, or widen privileges to make old code run. Physical retention/deletion and recovery of post-cutover real records need a separately reviewed procedure.

No step in this runbook has been run on staging or production.
