# Audit & immutability

Three append-only record streams, all written **only** through
[`packages/audit`](../packages/audit/src/writer.ts):

- **audit_events** — compliance-grade trail of every state change.
- **security_events** — logins, lockouts, MFA, suspicious access.
- **activity_events** — human-readable feed for the Activity Centre.

## Immutability

Enforced in two layers (see `packages/database/migrations/sql/zzz_grants.sql`):

1. The application DB role (`edrion_app`) is granted **INSERT + SELECT only** on these
   tables — `UPDATE`/`DELETE` are revoked.
2. A `BEFORE UPDATE OR DELETE` trigger raises an exception regardless of role.

No normal API can alter audit records. Viewing is permission-gated (`audit.view`); export is
`audit.export`.

## Every audit event records

actor (type, id, name, role) · institution / campus / support-session / case ref · action ·
module · entity (type, id) · previous & new state (JSONB) · reason · result
(success/failure/denied) · risk level · error detail · ip · user agent · request id ·
correlation id · api endpoint · AI involvement (+ run id) · confirmation payload.

Risk level is auto-classified from the action key (`packages/audit/src/risk.ts`,
`classifyRisk`) unless the service sets it explicitly.

## How a mutation produces an event

Services build the common fields with `baseAudit(ctx)`
(`apps/api/src/common/action-context.ts`) — which pulls actor, support session, ip/ua and
correlation/request ids off the request — then add the action-specific fields. Example: an
institution suspend writes `action: 'institution.suspend'`, the before/after status, the
required `reason`, the optional case ref, and (if inside a support session) the session id +
correlation id, linking platform-side and portal-side activity.

## Support-session lifecycle events

`session.requested`, `session.approved`, `session.started`, `portal.entered`,
`sensitive.confirmed`, `session.extended`, `session.ended`, `session.expired` — each an audit
event carrying the support-session id, so an institution's "Access Sessions" tab and the
global audit log show the full, correlated story.
