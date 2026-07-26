# Edrion Support Access

Authorised employees can enter an institution's portal for support/onboarding/troubleshooting
— never as invisible impersonation. Access is a controlled, time-boxed, audited
**Support Access Session** in which the employee acts **as themselves**.

## Flow

1. Employee opens an institution → **Enter Institution Portal**.
2. Confirmation modal: institution, employee identity, access level, **required reason**,
   optional support-case/ticket ref, requested duration, and a warning that all actions are
   logged.
3. Sensitive access requires recent auth / MFA (`institutions.access_portal` is `sensitive`).
4. A `support_access_sessions` row is created (status `requested` → `approved` → `active`)
   with a hard `expiresAt`.
5. The portal opens with a persistent banner:

   ```
   Edrion Support Mode
   You are accessing Riverside Public School as Priya Menon.
   All actions are recorded. Session expires in 42 minutes.
   ```

## Identity & attribution

The employee never appears as the institution principal. The web app sends
`x-support-session-id` on every request; `AuthGuard` validates the session
(`resolveSupportSession`) and attaches `support` to the principal context. `baseAudit()` then
stamps every audit event with the session id, institution id, case ref and correlation id —
so platform-side and portal-side actions are linked.

## Data model

`support_access_sessions`: institution, employee (+ name/role snapshot), access level, reason,
case ref, optional campus, status (`requested|approved|active|ended|expired`), risk level,
`requestedAt/approvedAt/startedAt/expiresAt/endedAt`, duration, ip, user agent.

## Lifecycle events (all audited)

requested → approved → started → portal entered → (sensitive action confirmed)* → extended? →
ended | expired. Expiry is enforced by checking `expiresAt` on every request and by a
background sweep (Phase 6/7).
