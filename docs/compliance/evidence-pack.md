# Edrion platform — engineering evidence pack (Tier 3)

This document maps **implemented engineering controls** to common compliance themes (DPDP, FERPA-style education records, COPPA-adjacent minors data). It is **not** legal certification; it is an auditable checklist for pilots and security reviews.

## Control matrix

| Control | Implementation | Evidence |
|--------|----------------|----------|
| Tenant isolation (institution RLS) | PostgreSQL RLS policies in `packages/database/migrations/sql/zzz_rls.sql` | Migration + integration tests on scoped queries |
| Institution portal auth | HTTP-only `portal_sessions`, JWT `sid` binding | `PortalSessionService`, `InstitutionAuthGuard` |
| Permission boundary | DB-evaluated permission set per request | `InstitutionPermissionsGuard`, `@RequireInstitutionPermissions` |
| Recent auth for destructive/sensitive ops | `RECENT_AUTH_ENABLED` + `isInstitutionSensitive` | `portal-permissions.guard.ts` → `RECENT_AUTH_REQUIRED` |
| MFA step-up (AAL2) | Session `aal` on `portal_sessions`; catalogue in `@edrion/schemas` | `institutionPermissionRequiresMfaStepUp` → `STEP_UP_REQUIRED` |
| MFA enrollment | TOTP + recovery codes | `mfa.service.ts`, migrations `0166`–`0170` |
| Audit trail | Structured audit + security events | `@edrion/audit`, `portal-audit` module |
| Sensitive report sealing | Two-person unseal + audit log | `portal-sensitive-reports.controller.ts`, `sensitive_report_audit_log` |
| Webhook delivery observability | Deliveries list + replay | `portal-integrations.controller.ts`, migration `0179` idempotency index |
| Principal metrics (no hot-path scans) | Nightly rollup job + read API | `PrincipalMetricsService`, `principal_metric_rollups` |
| Document issuance integrity | Generation key idempotency | `document_renders.generation_key` index (`0179`) |
| Data subject / requests | Request Engine types incl. grievance | `packages/schemas/src/request-types/grievance.ts` |
| Parent consent append-only | Supersede pattern on responses | `parent_consent_responses` schema comments |
| Support session expiry | BullMQ `support-session.expiry` | `maintenance.service.ts` |

## Retention and export (hooks)

- **Tenant export:** institution data export flows are gated by `institution_settings.manage` and audit-logged (see platform settings / integrations modules).
- **Retention:** operational retention windows are configured per environment (`ApiEnv`); destructive purge jobs are registered in `maintenance.service.ts` where applicable.

## Pilot verification steps

1. Run full migration chain on a clean database (`packages/database`).
2. Enroll MFA for a pilot institution user; confirm password-only login returns `MFA_REQUIRED` and sensitive portal actions return `STEP_UP_REQUIRED` until MFA completes.
3. Publish a PTM event via `POST /v1/portal/ptm/events` + `/publish`; confirm parent `GET /v1/parent/ptm/events` lists it.
4. Create placement season/drive; student `GET /student/placements/opportunities` and staff funnel via `GET /portal/placements/applications`.
5. Trigger principal rollup job or wait for nightly maintenance; confirm `GET /portal/principal-metrics` returns rows.

## Explicit non-goals

- Legal opinions or regulatory attestation statements.

_Last updated: Tier 3 completion pass._
