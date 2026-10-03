# Petros Phase 5 operator runbook

Status: engineering preparation only. Phase 5 has no deployment or live-pilot authorization. Keep learner admissions, real-pilot collection, partner delivery, guardian sharing, independent accounts, full offline and generated executable extensions disabled. A synthetic report or a passing software gate cannot satisfy an external acceptance packet.

This runbook describes the current release-control API and safe operator sequence. It does not authorize executing a release, applying migrations to a shared/production database, enabling paid providers, enrolling learners, or contacting reviewers. Use an approved change window and the existing `ai.view` / `ai.configure` permission boundary when an authorized release process exists.

## Read-only checks

The API global prefix is `/v1`. With a local/disposable server or an approved environment URL, inspect status using authenticated, read-only GET requests:

```sh
curl --fail-with-body --silent --show-error "$API/v1/petros-quality/releases"
curl --fail-with-body --silent --show-error "$API/v1/petros-quality/operations"
curl --fail-with-body --silent --show-error "$API/v1/student/petros/continuity/pilot-admission"
```

`GET /v1/petros-quality/releases` requires `ai.view`; its `configured`, current identities, release gates, `admissions`, and `pilotAcceptance` are content-free status references. `GET /v1/petros-quality/operations` also requires `ai.view` and reports aggregate queues, durable work, reservations, cost, latency samples, denials and failures. `GET /v1/student/petros/continuity/pilot-admission` reports the admission contract; it never enrolls anyone. Supply normal session authentication through the approved client, never place cookie values or bearer tokens in command history, logs or evidence.

The current controller does not provide a release “enable” endpoint. The actual controls are `POST /v1/petros-quality/release-evaluations` (import immutable engineering evaluation, `ai.configure`), `POST /v1/petros-quality/releases` (register immutable bundle, `ai.configure`), `POST /v1/petros-ai-routing/functions/:functionId/versions/:versionId/activate` (activate a candidate or qualifying rollback target, `ai.configure`), and `POST /v1/petros-quality/releases/:id/disable` (disable one release, `ai.configure`). Each mutation requires a meaningful reason; disable also requires a stable UUID `commandId` for replay. Do not copy a request from these routes into a live environment without separate authorization and a reviewed bundle.

## Release readiness and controlled activation

Before any future release window, verify all of the following against one frozen implementation/configuration identity:

1. The applicable Phase 5 engineering gates have executed on the final identity and are recorded in `docs/PETROS-PHASE-5-VERIFICATION-RESULTS.md`. A pending, skipped, stale or failed gate blocks activation.
2. An immutable production-owner evaluation report exists and all required deterministic gates pass; controlled-model evidence and accounting are recorded separately. Cost is within the report's bound and `openReservations` is zero. This is engineering evidence, not human acceptance or efficacy evidence.
3. The proposed bundle binds the current application, migration, source pack, prompt/schema, policy, routing, fixtures and evaluator identities. Every candidate and rollback version hash matches. Current function/routing/provider/model/policy configuration must still match at import, registration and dispatch.
4. The report and bundle are within their expiry windows. The current `PETROS_RELEASE_IDENTITIES_JSON` is configured and matches. `GET /v1/petros-quality/releases` reports the intended row with `gate: "pass"` immediately before activation.
5. No open incident, unexplained outstanding reservation, unresolved failed/ambiguous provider attempt, or operator recovery action remains. Record the exact bundle ID/digest, evaluation ID/digest, candidate ID, rollback ID, expiry and change record in the approved change ticket.
6. External educator, curriculum, privacy/consent, accessibility and pilot authorities have separately completed the acceptance packets in `docs/PETROS-PHASE-5-ACCEPTANCE-PACKETS.md`. Current software status alone does not satisfy them.

Registering a bundle leaves `admissions: "disabled"`; it does not enroll learners or turn on the pilot. Activation is a separate audited prompt/schema operation guarded by the current report, identity, config and release checks. Follow the institution's independently authorized feature/admission process; this code has no command to admit a real pilot.

## Incident response, disable and drain

When release quality, source/policy authority, cost, privacy, accessibility or safety is uncertain:

1. Stop new pilot admissions and event collection at their existing operational control. Current pilot admission is hard-coded `admitted: false`, and real instrumentation is not available: the collector requires both `NODE_ENV=test` and `PETROS_PILOT_SYNTHETIC_INSTRUMENTATION_ENABLED`, plus a disposable fixture authority. Never change these to enable real collection.
2. Capture UTC time, incident/ticket ID, release ID/digest, evaluation ID, relevant application/configuration identities, status response and aggregate operations snapshot. Preserve immutable evidence; do not copy learner content into the ticket.
3. If the implicated release exists, an authorized `ai.configure` operator may issue `POST /v1/petros-quality/releases/{releaseId}/disable` with a unique UUID `commandId` and a reason of at least eight characters. Keep the response and audit reference. Repeating the same command ID and exact reason replays the result; a different command/reason conflicts. Disablement is an immutable receipt and cannot be undone or deleted; it preserves the report, bundle and historical citations.
4. Verify `GET /v1/petros-quality/releases` shows the release disabled and review `GET /v1/petros-quality/operations` for queued/running question work, preparation work, expired leases, due dispatch, outstanding/ambiguous reservations and queue state. Continue to keep admission off. Do not infer “drained” from an unavailable queue; use durable database counts and resolve discrepancies.
5. Allow safe in-flight work to finish where appropriate. For an identified learner-owned durable document-question command, the existing owner-scoped command route is `POST /v1/student/petros/sessions/{sessionId}/document-questions/{commandKey}/commands` with `{ "version": <current execution revision>, "action": "cancel" }`. It requires the authenticated owning student and current authority. Do not cancel by editing rows or issuing broad SQL. For other work, use its owning service's supported cancel/recovery operation. Recheck reservations and worker leases after cancellation; unknown provider outcomes remain ambiguous and must be reconciled conservatively.
6. Keep the release disabled while investigating. Do not delete release or audit rows, rewrite manifests, reuse a disable ID, or roll back the schema to undo an incident.

A migration downgrade is a separate destructive database operation, not a supported release rollback. The Phase 5 release tables are append-only, FORCE-RLS protected, and designed to retain evidence. Do not run `db:reset`, truncate, drop Phase 5 tables or manually change grants as incident response.

## Recovery and rollback

First contain the issue, preserve evidence, restore required source/policy/configuration authority, and confirm durable work and reservations are reconciled. A rollback means activating the exact pre-evaluated rollback prompt/schema version recorded in the bundle. The rollback is allowed only while the bundle identity, configuration, evaluation report, candidate/rollback hashes and both expiry windows remain valid. Recheck the release status immediately before using the normal activation route for that recorded `rollbackVersionId`; the runtime rechecks before provider dispatch. If the release has been disabled, the rollback path may use its recorded rollback target while still validating the live identities/configuration/expiry/report. Do not interpret this as re-enabling admissions or the failed candidate.

If any identity, configuration, source/policy, report, hash or expiry no longer matches, or if the exact rollback target is unavailable, do not force activation. Keep admissions disabled, prepare and execute a fresh evaluation against the current production owners/configuration, register a new immutable bundle with a compatible rollback target and use its new review record. If that cannot be completed safely, remain disabled and escalate through the ordinary incident process.

After recovery, verify the active version, release gate, source and routing identities, aggregate operations state, audit events and replay behavior. Preserve the failed release and incident evidence. Record follow-up gates and owners without claiming learner benefit or pilot success.

## Local engineering verification boundary

The isolated browser journey is a synthetic engineering fixture. It is not a production deployment procedure and must not load the workspace `.env`, use shared/protected databases, real student accounts, app credentials or paid APIs. Consult `docs/PETROS-PHASE-5-VERIFICATION-PLAN.md` and the dated verification directory before any local run. The project’s focused disposable database tests use `PETROS_LOCAL_DB_TESTS=1`; never point them at a shared database or protected dump. Migration verification belongs on a fresh disposable database through the repository migration runner, including `zzz_grants.sql` and `zzz_rls.sql`; record command, UTC interval, exit code and output hashes in the Phase 5 verification directory. Do not run a migration or browser server as part of this runbook without the separately authorized engineering verification task.

The Phase5 migration owner must have PostgreSQL BYPASSRLS or superuser authority for the narrow runtime-release and operational aggregate projections. Both functions explicitly reject an insufficient owner rather than showing false zero counts or allowing legacy dispatch. The application role remains NOBYPASSRLS; do not grant it global raw-table access. Grant replay revokes PUBLIC execution. Verify ownership and execute privileges during an authorized migration window before interpreting dashboard data.

Retrieval/source/teaching latency values are bounded process-local distributions of real owner calls, with up to 512 recent numeric samples per operation and lifetime call/failure counts. They reset on API restart; unavailable samples show unavailable. Aggregate replicas through the existing operational telemetry sink if authorized. These values and the local workload report are observations, not accepted production SLOs.
