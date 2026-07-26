# Campus Bundle B — Implementation Record

**Status:** Pilot-ready — APIs, two-person sensitive unseal, portal console, student `/events`, RLS.

## Migrations

`0140`–`0159` substantive SQL; `0181` ownership/unseal; indexes/grants in `0150`–`0159`.

## Portal

| Surface | Route |
|---------|--------|
| Sensitive reports inbox + unseal | `GET /portal/sensitive-reports`, `POST …/:id/unseal` — UI `/security/sensitive-reports` |
| Identity scanner | `POST /portal/security/identity/verify` |
| PTM | Parent: `/v1/parent/ptm/*`. Staff: `GET/POST /portal/ptm/events`, `…/publish`, `…/slots`, `…/bookings` — UI `/parent-comm/ptm` |
| Placement cell | `GET/POST /portal/placements/*` (seasons, drives, companies, applications funnel) — UI `/careers/placements` |
| Grievances | Request type `grievance` — UI `/workflow/grievances` → Approvals inbox filtered by type |

## Student

- `/events` — register for campus events
- Clubs, diary, health, placements, grievance via existing APIs + `/requests`

## Security

- Two-person unseal + `sensitive_report_audit_log`
- `REVOKE SELECT` on `sensitive_report_seals` for app role

## Manual smoke

Submit `sensitive_report` → two staff unseal → audit row; scan token at security verify.
