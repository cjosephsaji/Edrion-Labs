# Platform Readiness — Implementation Record

**Status:** WS1–WS8 + full US federation (OIDC, SAML, OneRoster CSV/REST, Clever, ClassLink).

## US federation (WS-SSO / WS-ROSTER) — complete

- Migration `0184` + `0185` (ClassLink provider enum)
- **OIDC:** `POST /portal/auth/oidc/start`, `GET …/callback`
- **SAML:** `POST /portal/auth/saml/start`, `POST …/acs`, `GET …/metadata/:providerId`
- IdP CRUD with `kind: oidc | saml`
- **Roster:** OneRoster CSV + REST, Clever, ClassLink sync + job history
- UI `/settings/federation`

## Debate TTS

- `OpenAiTtsProvider` + `TTS_PROVIDER=openai|mock` (see `.env.example`).

## Webhooks (WS1–WS3)

- Platform: `IntegrationsService` v2 envelope, rotation overlap, deliveries API.
- **Institution portal:** `GET/POST /portal/integrations/webhooks`, `…/:id/deliveries`, `…/retry` — UI `/it/webhooks`.

## MFA (WS4)

- TOTP enroll/challenge, recovery codes generate/consume, factor revoke (`/portal/mfa/*`).
- Session `aal` on `portal_sessions` exposed as `InstitutionPrincipal.sessionAal`.
- Step-up catalogue: `packages/schemas/src/security/step-up-actions.ts` → `403 STEP_UP_REQUIRED` in `InstitutionPermissionsGuard`.
- Password-only login issues `aal1` (MFA-enrolled users must complete MFA via IdP token path).

## Support sweep (WS5)

- `support-session.expiry` on maintenance queue when Redis workers enabled.

## Principal metrics (WS6–WS7)

- Job `principal.metrics.daily`, `GET /portal/principal-metrics`, dashboard widgets via `usePrincipalMetrics`.
- Migrations `0172`–`0176` (rollup table + read indexes; dashboard prefs index).

## Compliance (WS8)

- Job `compliance.evidence.snapshot` → `compliance_evidence_artifacts` rows.
- Engineering evidence doc: `docs/compliance/evidence-pack.md`.

## Sensitive / debate (cross-cutting)

- Portal sensitive unseal console `/security/sensitive-reports`.
- Debate calibration `/labs/debate-calibration`.

## Tests

- Integrations + step-up schema tests; API tests include federation (`oneroster-csv`, `saml-sp`).
