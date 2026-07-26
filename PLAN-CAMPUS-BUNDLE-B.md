# Tier 3 Plan — Campus Bundle B

## Execution header

| Field | Value |
|---|---|
| **Target feature** | Placements, Clubs/Events/PTM, Diary, Health mirror, Grievance lanes, Sensitive-report sealing |
| **Attach at execution** | `/Users/macbook/Downloads/03S6-S8-S9-S10-S11-08S6-CAMPUS-LIFE-BUNDLE-B-HYPERSPEC.md` |
| **Prerequisites** | **`IMPLEMENTED-CAMPUS-BUNDLE-A.md`**, `IMPLEMENTED.md`, `IMPLEMENTED-TIMETABLE.md`, `IMPLEMENTED-ATTENDANCE.md`, `IMPLEMENTED-MARKS.md` |
| **Migration numbers reserved** | `0140`–`0159` |
| **Track and position** | Track B, position 2 of 2 |
| **Feature surface and capability flags** | `student.surface.placements`, `clubs`, `events`, `grievance`, `health`, `diary`; `grievance.lane.formal`, `grievance.lane.sensitive`; institution `portal.module.placement_cell` |
| **Open blockers** | Bundle A token contract; sensitive-report security review scheduled |
| **Human decisions** | Nullable `student_id` only for `sensitive_report`; no `support_cases` extension |
| **Conditions before Phase 1** | Bundle A IMPLEMENTED; placement cell permissions seeded |

---

## 1. Summary

Bundle B anchors on **greenfield Placements** (seasons, drives, eligibility DSL, applications, interviews integrated with Timetable, offers, reporting with denominator honesty). Then **Clubs/Events/PTM** with capacity-safe registration, paid events → `fee_invoice_items`, check-in via Bundle A identity token → `campus_access_logs`. **Diary** composes on `assignments`/`submissions` without duplicating homework; contributes ≤3 obligations to Today. **Health** is wire-only with `health_profile_update` Request Engine proposal — never writes health/counseling tables directly; counselor notes never mirrored. **Grievance** uses new Request types — **not** `support_cases`. **Sensitive reports** are a separate security-reviewed phase with sealed reporter identity.

Build order: **Placements → Clubs/Events/PTM → Diary → Health → Grievance → Sensitive sealing**.

---

## 2. Current repository state

- **Placements:** no `placement_*` tables (confirmed absent).
- **Clubs/events:** no `clubs`, `campus_events` tables.
- **Assignments/submissions:** deep schema exists — diary must reference, not copy.
- **Health:** `health_records`, `medical_incidents`, `medication_logs`, `counseling_records` exist with sensitive permissions.
- **Support cases:** platform module — must not receive student grievances.
- **Registration machinery:** idempotency + seat patterns from registration module (reuse for events).
- **Timetable:** `student_calendar_items` / timetable integration per `IMPLEMENTED-TIMETABLE.md`.
- **Marks/attendance:** eligibility inputs for placements.

---

## 3. Spec Amendments

| # | Hyperspec | Repo amendment |
|---|---|---|
| A1 | `student.module.placements` etc. | `student.surface.*` + capabilities |
| A2 | Engine change for `sensitive_report` | Additive `RequestTypeConfig` fields: `identityModel`, `staffProjection`, `excludeFromGeneralInbox` — **no state machine fork** |
| A3 | `event_checkins` table | **No table** — check-in → `campus_access_logs` + registration status |
| A4 | Placement applications as requests | **Not** generic requests — dedicated tables |
| A5 | Event seat registration as requests | **Not** generic requests — `event_registrations` |

---

## 4. Dependencies and shared contracts

**Consumes:** Bundle A `POST /security/identity/verify`, Request Engine (+ gates from A), Fees, Today obligations, Timetable personal items, Marks (`grade_entries`, `grading_schemes`, `computeTermAggregate`), Attendance aggregates, Documents vault for offer letters.

**Request types:** `club_join`, `helpdesk_ticket`, `grievance`, `sensitive_report`, `health_profile_update`.

**Does not use:** `support_cases` for campus grievance.

---

## 5. Migration-first PR (`0140`–`0144`)

Land all Bundle B tables in one or split migrations:

**Placements:** `placement_seasons`, `placement_season_registrations`, `placement_companies`, `placement_drives`, `placement_drive_eligibility_rules`, `placement_drive_stages`, `placement_applications`, `placement_application_events`, `placement_interview_schedules`, `placement_offers`, `student_placement_profiles`, `student_resumes` — columns per hyperspec §3.2.

**Clubs/events:** `clubs`, `club_memberships`, `campus_events`, `event_slots`, `event_registrations`, `event_registration_events`.

**Diary:** `student_diary_pages`, `student_diary_entries`, `student_diary_acks` (guardian + student).

**Grievance:** payload-only unless `sensitive_report_sealed_identities` table required (see Phase 6).

**Health:** config/consent tables only per spec §8 — no mirror writes to clinical tables.

**Sensitive (Phase 6 migration `0155+`):** `sensitive_report_seals`, narrow grants; nullable `student_requests.student_id` CHECK exception **only** for type `sensitive_report`.

**RLS:** institution GUC on all operational tables; seal table **no SELECT** for `edrion_app` role — security definer functions only.

---

## 6. Implementation phases

### Phase 1 — Placements (`0145`–`0148`)

**Goal:** Student opportunities, apply, tracker, season registration; institution placement cell funnel, interviews → timetable, offers, reports.

**Services:** `PlacementEligibilityService` (closed DSL in `packages/schemas/placements/eligibility-fields.ts`), `PlacementApplicationService`, `PlacementInterviewScheduleService` (writes `student_calendar_items` `source='placement'`).

**API (student):** `/student/placements/opportunities`, `/applications`, `/profile`, `/season/register`.

**API (institution):** `/portal/placements/*` dashboard, drives, funnel board, CSV import, reports (BullMQ export jobs).

**Eligibility:** Live browse cache ≤60s; snapshot at apply; `unavailable` vs `ineligible` semantics; never free-form SQL.

**UI:** Offer state animation with `prefers-reduced-motion` fallback.

**Tests:** DSL fixtures; offer policy `single_offer`; denominator-forced report copy.

**DoD:** CSV shortlist import; interview on timetable; dean report exports.

---

### Phase 2 — Clubs, Events, PTM (`0149`–`0151`)

**Goal:** Club directory/page (no feed); events list/register/waitlist/paid checkout; slotted PTM; check-in scans token.

**Registration:** Redis pre-check + serializable Postgres — same pattern as registration hyperspec C7.

**Paid events:** `fee_invoice_items` + hold TTL; events module never touches gateway directly.

**Check-in:** Scanner `context_kind='event'`; append `campus_access_logs`; set `attended`.

**Explicit non-goals:** club feed, likes, comments (permanent tarpit).

**Tests:** 2000-student load fixture; no oversell.

**DoD:** Paid event + check-in path on staging scanner.

---

### Phase 3 — Diary (`0152`)

**Goal:** Daily page composing assignment due items + notes; seen-acks; surface unchecked homework on Today (≤3 obligations).

**Storage:** Entries reference `assignment_id` OR lightweight note — never duplicate due dates.

**API:** `/student/diary/:date`, ack endpoints.

**Today:** Use existing `homework` / `assignment` obligation kinds — **no `prep` or `diary` obligation kind**.

**DoD:** Publish diary notifies; Today shows capped items.

---

### Phase 4 — Health mirror (`0153`)

**Goal:** Read-only projections honoring sensitive permission keys; `health_profile_update` submits proposal.

**Wire-only:** Student/guardian UI calls audited read APIs; **no INSERT** to `health_records` / `counseling_*` from student module.

**Fulfilment:** Approved request invokes owning health service internal API.

**Tests:** Contract test counselor notes never in API response; audit read failure = deny.

**DoD:** Request → staff fulfilment → health service write path only.

---

### Phase 5 — Ordinary grievance (`0154`)

**Goal:** `helpdesk_ticket`, `grievance` request configs, category routing, desks separate from platform support.

**Explicit:** Do not import routes into `support-cases` module.

**DoD:** Student submission + staff inbox distinct from Edrion support.

---

### Phase 6 — Sensitive-report sealing (`0155`–`0159`) — security gate

**Goal:** `sensitive_report` with sealed reporter identity; two-person purpose-bound unseal; time-limited access; full audit.

**Schema:**

- `student_requests.student_id` **nullable only when** `type='sensitive_report'` (CHECK constraint).
- `sensitive_report_seals`: `request_id`, `reporter_student_id`, `encrypted_identity_blob`, `created_at` — **no application SELECT**; access via `SECURITY DEFINER` functions `seal_sensitive_report`, `unseal_sensitive_report` with approval rows `sensitive_report_unseal_approvals`.

**Threat model:** DB roles, logs, analytics, exports, notifications, backups documented in runbook.

**Retention/deletion/export:** Policy tables + jobs.

**Notify reporter** per policy without leaking identity to staff inbox (anonymous projection).

**Tests:** RLS penetration attempts; ORM cannot load seal; unseal requires two distinct principals.

**DoD:** Independent security review sign-off recorded in `DECISIONS.md`.

---

## 7. Security, privacy, and safety

- Sensitive lane default-off K-12 presets.
- Health mirror cannot weaken counseling model.
- Placement exports audited.
- Event registration idempotency prevents double booking.

---

## 8. Risks and failure modes

| Risk | Guard |
|---|---|
| Eligibility defamation | `unavailable` copy |
| Ghost SSO students | N/A here; roster separate |
| Seal leakage via join | ORM excludes table; integration tests |
| Timetable clash | Scheduler warning only |

---

## 9. Test plan

- Placement DSL golden files.
- Event seat property test.
- Diary assignment reference integrity.
- Health API negative tests for notes fields.
- Sensitive seal red-team suite.

---

## 10. Acceptance criteria

- Placements end-to-end with timetable interview row.
- Event check-in uses shared identity token.
- Diary does not duplicate homework rows.
- Health student write attempts rejected at API.
- Grievance tickets ≠ support cases.
- Sensitive reporter identity unreachable from normal staff queries.

---

## 11. Operational readiness

- Placement cell training for CSV import.
- Event refund policy institution settings.
- Sensitive unseal playbook for designated committee.

---

## 12. Closeout

**`IMPLEMENTED-CAMPUS-BUNDLE-B.md`** — table list, request types, seal architecture summary, deviations.
