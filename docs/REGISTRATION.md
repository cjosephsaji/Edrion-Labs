# Institution Registration & Approval

Public, premium onboarding funnel where schools/colleges **apply** to become Edrion customers. No
application ever auto-creates an institution: every applicant fills a sectioned form, verifies their
contact email by OTP, submits, and then waits for a Platform Owner / Super Admin to **approve** or
**reject**. Approval provisions the institution; rejection stores a reason. Everything is
permission-gated, rate-limited, spam-resistant and fully audited.

## Flow

```
Applicant (public, no auth)                         Reviewer (authed employee)
  /register  ──POST /v1/registration────────▶ draft (+ signed resume token)
            ──PATCH /v1/registration/:id────▶ autosave sections
            ──POST  /:id/otp───────────────▶ hashed OTP emailed (10-min, single-use)
            ──POST  /:id/otp/verify────────▶ email verified
            ──POST  /:id/submit────────────▶ status=submitted, ref EDR-REG-YYYY-NNNNNN
                                              │
  /registration-requests  ◀──GET /v1/registration-requests (registration.view)
                          ──POST /:id/start-review (registration.review) → under_review
                          ──POST /:id/approve (registration.approve, sensitive)
                              └─ tx: institution(Onboarding) + campus + primary admin(invited)
                                     + onboarding checklist + link request(approved)
                          ──POST /:id/reject (registration.reject, sensitive) → rejected + email
```

Institution status on approval is **Onboarding** (never Active). The future onboarding module drives
Onboarding → Configuration → Training → Go Live → Active.

## Data model (migration 0024, `packages/database/src/schema/registration.ts`)

- `institution_registration_requests` — the application. Separate from `institutions`. Promoted
  columns (legalName, type, country, contactEmail, expectedStudents …) for the reviewer directory +
  typed JSONB section bags (`institution_info`, `location`, `campus_info`, `primary_contact`,
  `subscription`, `consent`) so future fields need no migration. Email verification, review/decision,
  forensic (ip/ua/correlation) and optimistic `version` columns.
- `institution_registration_otps` — only the **SHA-256(code + pepper)** is stored. Single-use
  (`consumed_at`), 10-min `expires_at`, `attempts`/`max_attempts`, `send_count`.
- `institution_registration_reviews` — review history + internal notes (employee-only; never on a
  public payload).
- `institution_registration_attachments` — table + RLS only; future document uploads (no endpoint yet).
- `institution_onboarding_tasks` — the onboarding checklist seeded on approval (tenant-isolated RLS).

Audit reuses the unified append-only `audit_events` (`entityType='registration_request'`,
`entityId=requestId`), via the standard `AuditWriter`. Public-funnel events are recorded under a new
`ActorType.applicant`.

## API (`apps/api/src/modules/registration/`)

- `PublicRegistrationController` (`/v1/registration`, `@Public` + per-handler `@RateLimit`):
  `POST /`, `GET/PATCH /:id`, `POST /:id/otp`, `POST /:id/otp/verify`, `POST /:id/submit`. Drafts are
  authorised by a signed resume token (HS256 over `SESSION_COOKIE_SECRET`) sent as
  `x-registration-token`.
- `RegistrationRequestsController` (`/v1/registration-requests`, cookie-authed): `GET /`,
  `GET /summary`, `GET /:id`, `POST /:id/{start-review,assign,notes,approve,reject}`.
- Services: `RegistrationService` (funnel + reviewer reads/notes/assign/start-review/reject),
  `RegistrationApprovalService` (single-transaction provisioning), `OtpService` (hashed OTP
  lifecycle), `RegistrationEmailService` (branded templates over the shared `EmailService` seam).

## OTP lifecycle

6-digit, SHA-256(code + `REGISTRATION_OTP_PEPPER` ?? `SESSION_COOKIE_SECRET`). 10-min expiry, single
live code per draft, 60-s resend cooldown, ≤5 sends, ≤5 attempts then lock. Every
generate/verify/failure/expiry is audited. Changing the contact email after verification clears the
verified flag; submit requires `verifiedEmail === contactEmail`.

## Permissions (`@edrion/permissions`)

Group **Registration**: `registration.view`, `registration.review`, `registration.approve`
(sensitive), `registration.reject` (sensitive). Sensitive → recent-auth/MFA enforced by the
`PermissionsGuard`. Wired to `platform_owner`, `super_administrator`, `onboarding_specialist`
(full) and view for `customer_success` / `support_administrator` / `read_only_auditor`.

## Frontend

The public funnel and the reviewer workflow live in **separate apps** — the unauthenticated funnel
must not share a surface with the auth-gated staff tool.

- Public (`apps/public-web`, port **3003**): `app/register` (multi-step funnel: hero, stepper, OTP
  verify, autosave to localStorage + server draft, a11y + reduced-motion) and `app/register/success`.
  Uses raw `fetch` (`components/register/registration-api.ts`) against `NEXT_PUBLIC_API_BASE_URL`;
  no auth/api-client. The status emails link here via `REGISTRATION_WEB_URL` (default
  `http://localhost:3003`).
- Reviewer (`apps/super-admin-web`): `app/(app)/registration-requests` (list) and `[id]` (read-only
  sections, verification, timeline, review history, communication + audit events) with the **Approve
  wizard**, **Reject** and **Assign** dialogs. Nav item under *Customers*.

## Security

`@Public` + tight `@RateLimit`; honeypot field + (pluggable) bot-check seam; hashed single-use OTP
with expiry/attempt/resend caps; duplicate-submission block (active request per contact email);
signed resume token; full server-side re-validation on submit. Reviewer actions are permission-gated;
approve/reject are sensitive (recent-auth); internal notes are employee-only; every action is audited
with actor / ip / ua / correlation / prev→new state.

## Future-proofing (designed in, not built)

`info_requested` status + `RegistrationReviewAction.info_requested` (Request More Information); the
attachments table (document uploads / government & business verification); JSONB section bags for new
fields without migrations; the `RegistrationEmailService` template seam; onboarding tasks table for
the future onboarding module.

## Verify

- Unit: `pnpm --filter @edrion/api test` (OTP hashing/expiry/lockout/cooldown, submit gating,
  resume-token guard, reject path).
- Live: boot the API with `AUTH_DEV_HEADER=true REGISTRATION_OTP_DEV_RETURN=true` (and, to avoid the
  shared IP rate-bucket, `RATE_LIMIT_ENABLED=false`) on :3001, then `bash scripts/registration-smoke.sh`
  — drives draft→OTP→verify→submit→review→approve and asserts the institution + campus + admin +
  6-item checklist + audit rows. Expect `PASS=29 FAIL=0`.
- UI: run `pnpm --filter @edrion/public-web dev` and load `http://localhost:3003/register` (premium
  funnel, autosave survives reload, OTP gates submit, success ref); then, as an employee in
  `apps/super-admin-web`, review a request and run the approve wizard.

> Note: adding the `registration.*` permission keys requires the platform roles to carry them. The
> dev seed (`pnpm --filter @edrion/database seed`) reproduces this; on an already-seeded DB, insert
> the new `platform_permissions` + `platform_role_permissions` rows (the smoke's grant step shows the
> exact SQL).
