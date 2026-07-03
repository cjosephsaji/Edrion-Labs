# Parent Portal

The Parent Portal is the guardian-facing surface of Edrion: a mobile-first, installable PWA
(`apps/parent-web`) backed by the `parent-portal` API module (`/v1/parent/*`) and its staff-side
counterparts (`/v1/parent-staff/*`). It is **digest-first + alert-driven**: a weekly email digest for
the routine, immediate notifications for what cannot wait, and a web app a guardian lands on when they
tap through.

It answers, completely and honestly, "what is happening with my child at school" — attendance &
safety, academics, money, wellbeing, logistics, paperwork and communication — with every access
guardian-scoped and every mutation audited.

---

## 1. Architecture

```
Request → correlation-id → InstitutionAuthGuard (auth_sessions cookie OR dev header)
        → PortalTenantInterceptor (sets app.institution_id GUC for RLS)
        → GuardianScopeGuard (loads wards from parents → student_guardians)
        → controller → service (assertWard on every :studentId) → AuditWriter
        → AllExceptionsFilter (standard error envelope + correlation id)
```

- **Identity.** A guardian is an `institution_users` row (role `parent`) linked to a `parents` row via
  `parents.institution_user_id`. Parents never merge with independent users; they authenticate through
  the same portal session cookie as staff (or the `x-institution-user-email` dev header when
  `PORTAL_AUTH_DEV_HEADER=true`).
- **`GuardianScopeGuard`** (`apps/api/src/modules/parent-portal/guardian-scope.guard.ts`) runs after
  `InstitutionAuthGuard`. It loads the caller's active `student_guardians` links, merges per-link
  `visibility_overrides`, and attaches `guardianContext = { guardianUserId, institutionId, studentIds,
  students[] }`. Services take that context — **never a client-supplied student id**. `assertWard(guardian,
  studentId, section?)` validates each `:studentId` param (403 `STUDENT_OUT_OF_SCOPE`) and enforces
  per-guardian section hiding (403 `SECTION_RESTRICTED`).
- **Module reuse.** `ParentPortalModule` imports `PortalModule` and reuses `InstitutionAuthGuard`,
  `InstitutionPermissionsGuard`, the session + rate-limit services and `EmailService` (all exported from
  `PortalModule`). Staff counterpart routes use `InstitutionPermissionsGuard` with the keys below.
- **Publish gates in SQL.** Parents only ever see `published` records — enforced in query predicates
  (`grade_entries.published`, `exam_schedules.published`, `student_incidents.published_at +
  notify_guardians`), never in mappers.
- **Confidentiality by construction.** No parent code path queries `counseling_cases` /
  `counseling_records`. The only counseling surface is `counseling_disclosures`, created explicitly by a
  counselor. `GET /students/:id/counseling-disclosure` returns that record or 404 — no existence hint.

---

## 2. Database

Migrations **`0037_parent_portal`** (28 tables + column extensions) and **`0038_grade_published`**.
All tables carry `institution_id`, `created_at`, `updated_at`, most a `version`, and RLS
tenant-isolation (`migrations/sql/zzz_rls.sql`). New parent-owned tables are `parent_`-prefixed to
avoid colliding with the staff-side `messages` / `message_threads` / `notifications` tables.

| Domain | Tables |
| --- | --- |
| Communication | `parent_notices`, `parent_notice_receipts`, `parent_message_threads`, `parent_messages`, `parent_emergency_broadcasts`, `calendar_events` |
| Engagement | `parent_consent_forms`, `parent_consent_responses`, `parent_ptm_events`, `parent_ptm_slots`, `parent_ptm_bookings`, `parent_absence_notes` |
| Notifications | `parent_notifications`, `parent_notification_preferences`, `parent_digest_runs`, `parent_digest_deliveries` |
| Wellbeing | `parent_health_profiles`, `student_recognitions`, `counseling_disclosures` |
| Safety / gate | `pickup_authorizations`, `early_leave_requests`, `gate_exit_events`, `transport_incidents`, `hostel_outing_requests` |
| Money | `parent_payment_intents` |
| Documents | `student_documents`, `document_requests`, `profile_change_requests` |

**Reused, not recreated:** attendance, exams, `grade_entries`, assignments, fees, library, transport,
hostel, `health_records`, `medical_incidents`, `medication_logs`. Behaviour incidents reuse
`student_incidents` (conduct), extended with `published_at` / `parent_ack_required` /
`parent_acknowledged_at`.

**Column extensions:** `exam_schedules` (+`syllabus_note`, `hall`, `seat_info`, `published`),
`student_guardians` (+`visibility_overrides` jsonb), `fee_invoices` (+`source`: tuition|fine|transport|
hostel|other), `grade_entries` (+`published`).

**Append-only** (INSERT+SELECT only, `edrion_block_mutation` trigger in `zzz_grants.sql`):
`parent_emergency_broadcasts`, `gate_exit_events`, `parent_digest_deliveries`.

**Seed:** `pnpm --filter @edrion/database seed:parent` (idempotent) wires guardians
`guardian.a/b/c@greenwood.edu` (password `password`) — guardian A has two children, ward 1 has two
guardians, guardian C is blocked from fees via `visibility_overrides` — plus a demo row in every new
table.

---

## 3. Visibility policy

Two layers control what a guardian sees:

1. **Per-guardian `visibility_overrides`** (jsonb on `student_guardians`, e.g. `{ "fees": true }` to
   hide fees for one guardian by court order). Honored by `GuardianScopeGuard` + `assertWard(…, section)`
   and surfaced in `GET /me` as `children[].hiddenSections`. A student reachable via multiple guardian
   links is hidden a section only if **every** link hides it (a permissive link wins).
2. **Per-school flags** (feature-flags engine — keys reserved; guardian-level overrides are live now):
   `parent.visibility.behavior` (published_only|off), `parent.visibility.health_visits`
   (all|incidents_only), `parent.visibility.gate_exit_alerts` (on|off),
   `parent.visibility.counseling_disclosure` (counselor_optin|off), `parent.visibility.live_transport`
   (off, reserved), `parent.messaging.enabled` (on|off).

---

## 4. Permission keys (staff side)

Added to `packages/permissions/src/institution/catalogue.ts` (institution_owner/admin carry them via
wildcard):

`parent_comm.notices.manage`, `parent_comm.consents.manage`, `parent_comm.ptm.manage`,
`parent_comm.messages.respond`, `parent_comm.emergency.send` (sensitive → recent-auth),
`attendance.absence_notes.review`, `students.behavior.manage` (sensitive),
`students.recognitions.manage`, `students.documents.manage`, `students.profile_changes.review`,
`counseling.disclosure.manage` (sensitive), `frontdesk.pickup.verify`, `frontdesk.gate.manage`.

Parent-facing routes are **not** gated by permission keys — access is by guardianship (the
`GuardianScopeGuard`), scoped to the caller's own wards.

---

## 5. Notification matrix

`ParentNotifyService.emit` always writes the in-app `parent_notifications` feed row, then — for
`immediate`-priority events — fans out channels via `ParentFanoutService` (a BullMQ `notifications`
worker; inline fallback when queues are disabled). Channel dispatch is **fire-and-forget**: a queue or
channel failure never fails the originating domain action. `digest`-priority events wait for the
weekly digest.

Channels (`notification-channels.ts`): **Email** (real, token-styled responsive HTML + text via the
shared seam), **WebPush** (structured; needs a subscription store + VAPID to go live), **SMS** /
**WhatsApp** (typed stubs). Resolution (`channel-resolution.ts`, unit-tested) honors per-category
overrides and quiet hours — **except** `medical_incident` and `emergency_broadcast`, which always send
on every enabled channel regardless of quiet hours.

| Event `type` | Producer | Priority |
| --- | --- | --- |
| `medical_incident` | staff records incident | immediate (critical) |
| `emergency_broadcast` | staff broadcast | immediate (critical) |
| `message.reply` | staff replies to a thread | immediate |
| `document.ready` | staff fulfils a request | immediate |
| `absence_note.reviewed` | staff reviews a note | immediate |
| `pickup.verified` | staff verifies pickup | immediate |
| `early_leave.decided` | staff decides early-leave | immediate |
| `profile_change.decided` | staff decides a change | immediate |
| `recognition` | staff awards recognition | digest |

Emergency broadcasts require the sensitive `parent_comm.emergency.send` key (recent-auth) **and** a
typed `SEND EMERGENCY` confirmation phrase; the row is append-only and fanned out institution-wide.

---

## 6. Digest pipeline

`ParentDigestService` registers a daily BullMQ tick (`parent.digest.tick`) that runs digests for
guardians whose `digest_day` is today. `buildModel(guardian, window)` gathers per-child data;
`render(model)` is a **pure** `(model) → { subject, text }` (unit-tested) that omits empty sections and
falls back to a short "all good this week" when nothing needs attention. Runs are tracked in
`parent_digest_runs`; deliveries appended immutably to `parent_digest_deliveries` (channel, payload
hash, status). `POST /v1/parent/digest/preview` sends an on-demand preview, rate-limited to 1/hour.

---

## 7. Frontend (`apps/parent-web`)

Next.js 14 App Router on **`:3004`** (the repo's `public-web` owns `:3003`). Mobile-first, installable
PWA (manifest + service worker: shell cache, network-first navigations, Web Push display). Shell: bottom
tabs **Home · Ward · Fees · Inbox · More** with unread badges + a header child switcher (URL
`/child/[studentId]/…` so digest deep-links work). Screens cover the full journey plus a static "Who can
see what" trust explainer. Server state via TanStack Query + a typed fetch client (`Idempotency-Key` on
mutations; dev header in dev, session cookie in prod). Reduced-motion honored; 44px targets;
skeleton/empty/error states throughout.

Dev CORS: add `http://localhost:3004` to `API_CORS_ORIGINS` so the browser can call the API.

---

## 8. Endpoint reference

**Parent (`/v1/parent/*`, guardian-scoped):** `GET /me`, `GET /dashboard?studentId`; academics
`GET /students/:id/{attendance,assignments,results,exams,timetable}`; money `GET /fees`,
`GET /fees/receipts`, `GET /fees/invoices/:id`, `POST /fees/invoices/:id/payment-intents`,
`POST /payments/webhook` (unauth, HMAC); wellbeing `GET|POST /students/:id/health/profile`,
`GET /students/:id/health/{visits,incidents,medications}`, `GET /students/:id/behavior`,
`POST /behavior/:id/acknowledge`, `GET /students/:id/recognitions`,
`GET /students/:id/counseling-disclosure`; safety `GET|POST /students/:id/pickup-authorizations`,
`POST /pickup-authorizations/:id{,/revoke}`, `POST|GET /students/:id/early-leave-requests`,
`GET /students/:id/gate-events`; logistics `GET /students/:id/{transport,library,hostel}`,
`POST|GET /students/:id/hostel/outing-requests`; comms `GET /notices`, `POST /notices/:id/{read,acknowledge}`,
`GET /consents`, `POST /consents/:id/respond`, `GET /ptm/events`, `GET /ptm/events/:id/slots`,
`POST /ptm/slots/:id/book`, `POST /ptm/bookings/:id/cancel`, `POST|GET /absence-notes`,
`POST /messages/threads`, `GET /messages/threads{,/:id}`, `POST /messages/threads/:id/messages`,
`POST /preferences`; inbox `GET /notifications`, `POST /notifications/:id/read`,
`POST /notifications/read-all`, `GET /calendar`, `GET /students/:id/documents`,
`POST|GET /document-requests`, `POST|GET /profile-change-requests`, `POST /digest/preview`.

**Staff (`/v1/parent-staff/*`, permission-gated):** `POST /absence-notes/:id/review`,
`POST /pickup-authorizations/:id/verify`, `POST /early-leave-requests/:id/decide`,
`POST /medical-incidents`, `POST /messages/threads/:id/reply`, `POST /document-requests/:id/fulfil`,
`POST /recognitions`, `POST /notices`, `POST /profile-change-requests/:id/decide`,
`POST /emergency-broadcasts`.

---

## 9. Testing

- **Unit** (`apps/api/src/modules/parent-portal/parent-portal.spec.ts`, Vitest): guardian scope,
  channel resolution (quiet hours + critical bypass + overrides), digest renderer. `pnpm --filter
  @edrion/api test`.
- **E2E smoke** (`scripts/parent-portal-smoke.sh`): 26 live assertions covering the full journey. Run
  the API with `PORTAL_AUTH_DEV_HEADER=true`, seed (`seed`, `seed:portal`, `seed:parent`), then
  `bash scripts/parent-portal-smoke.sh`. Idempotent (resets today's threads + demo invoices).
