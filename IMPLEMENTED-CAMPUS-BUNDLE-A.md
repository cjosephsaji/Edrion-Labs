# Campus Bundle A — Implementation Record

**Status:** Pilot-ready for library, transport, digital ID, outpass, and registered request types with fulfilment side effects.

## Migrations

`0120`–`0129` (holds, transport, ID cards, identity scan audit, hostel mess, gate pass columns, request gates, library fine links).

## Request types (registry)

`hostel_outpass`, `campus_library_renewal`, `loan_renewal`, `transport_change`, `transport_renewal`, `id_card_reissue` — enable per institution via **Settings → Student portal → Request types**.

| Type | Fulfilment |
|------|------------|
| `hostel_outpass` | `gate_passes` row |
| `campus_library_renewal` / `loan_renewal` | Extends `library_loans.due_date` |
| `transport_renewal` | Updates transport assignment notes/term (payment gate via `requiresPayment`) |
| `id_card_reissue` | Revokes active card, pending issue row, **Documents `id_card` render** on approve |

## API (student)

`GET/POST /student/campus/library/holds`, transport assignment/broadcasts, `GET/POST id-card` + token refresh, `GET outpass/status`.

## Operations

- **Library fines:** `LibraryFinesService` + maintenance job `library.overdue-fines` (idempotent `library_fine_invoice_links`).
- **Scanner:** `POST /security/identity/verify`; staff gate passes at institution **Security → Gate passes**.

## Student web

- `/transport`, `/transport/renew`, `/library`, `/requests` (campus types when enabled), `/settings` (ID surface via nav)

## Gaps / notes

- Institution must configure **Documents `id_card` template** for card PDF issuance (Tier 2).
- Payment collection for `transport_renewal` uses standard request payment gates (`student_request_gates`).

## Tests

- `placement-eligibility.spec.ts` (Bundle B overlap); request type registry tests include campus keys.
