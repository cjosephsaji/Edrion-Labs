# Tier 3 Plan — Campus Bundle A

## Execution header

| Field | Value |
|---|---|
| **Target feature** | Campus Life Mirrors A — Campus Library, Transport, Digital ID, Hostel/outpass |
| **Attach at execution** | `/Users/macbook/Downloads/15-CAMPUS-MIRRORS-A-HYPERSPEC.md` |
| **Prerequisites (IMPLEMENTED)** | `IMPLEMENTED.md`, `IMPLEMENTED-LIBRARY.md`, **`IMPLEMENTED-DOCUMENTS.md`** (ID card templates + issuance — **missing today**; hard gate) |
| **Migration numbers reserved** | `0120`–`0129` |
| **Track and position** | Track B, position 1 of 2 |
| **Feature surface and capability flags** | `student.surface.campus_library`, `student.surface.transport`, `student.surface.id_card`, `student.surface.hostel`; capabilities: `hostel.outpass`, `hostel.complaints`, `transport.broadcasts`, `campus_library.holds`. **No `student.module.*`.** |
| **Open blockers** | Tier 2 Documents closeout; identity token crypto review |
| **Human decisions** | Guardian gate non-waivable (spec); fare bands use existing route fare data |
| **Conditions before Phase 1** | Bundle A migration PR **`0120`** merged first (single migration train PR before feature phases) |

---

## 1. Summary

Bundle A wires four student campus mirrors atop existing institution data: **Campus Library** (holds, renewals, fine bridge to `fee_invoice_items`), **Transport** (read assignments, change/renewal requests, driver broadcast notifications — **no GPS**), **Digital ID** (Documents-backed card + **rotating identity token** shared with gate/library/events later), and **Hostel/outpass** (safety-critical `gate_passes` + scanner contract). Five Request Engine types register without engine status changes; prerequisites use generic **`student_request_gates`**.

Required build order after migration: **Campus Library → Transport → Digital ID → Hostel/outpass**.

---

## 2. Current repository state

### 2.1 Request Engine

- Live per `IMPLEMENTED.md`; types in `packages/schemas/src/request-types/`.
- No `student_request_gates` table.
- `student_requests.student_id` NOT NULL today.

### 2.2 Facilities / complaints

- `work_orders` (`packages/database/src/schema/facilities.ts`): `title`, `description`, `priority`, `assigned_to`, `status` ∈ `open|in_progress|done|cancelled` — **no** `reported_by_student_id`, `student_confirmation_status`.
- `FacilitiesService` / portal CRUD exist; **no** student dispute reopen path yet.

### 2.3 Security / outpass substrate

- `gate_passes`: `holder_name`, `kind`, `reason`, `issued_at`, `expires_at`, `status` ∈ `active|used|expired|revoked` — **not** student-holder keyed; missing `expected_return_at`, `request_id`, revocation columns, pass state machine for outpass.
- `campus_access_logs`: `subject_name`, `direction`, `gate`, `method`, `occurred_at` — missing `pass_id`, `device_id`, `result`, `deny_reason`, `context_kind`.

### 2.4 Transport

- `transport_routes`, `transport_vehicles`, `transport_assignments` exist (per migrations snapshot); reconcile columns at migration time for route fare, stop, shift, validity — **use existing fare fields**, do not invent fare bands table.

### 2.5 Library

- `library_books`, `library_loans` exist; personal Library FSRS in `IMPLEMENTED-LIBRARY.md`.
- Campus holds/renewals **not** built.

### 2.6 Documents

- `document_templates` via doc-gen; Tier 2 plan extends `render_kind` for ID cards — **must be IMPLEMENTED before Digital ID phase**.

### 2.7 Hostel

- `hostel_blocks`, `hostel_rooms`, `hostel_allocations` exist; `hostel_outing_requests` bespoke table exists — coexistence boundary per hyperspec §3.6.

---

## 3. Spec Amendments

| # | Issue | Resolution |
|---|---|---|
| A1 | Hyperspec `student.module.hostel` | Use `student.surface.hostel` + capability keys |
| A2 | `work_orders` status enum differs from 4-step student map | Exhaustive `WORK_ORDER_STUDENT_STAGE` map from **actual** `open|in_progress|done|cancelled` |
| A3 | `gate_passes.holder_name` vs student id | Add `holder_student_id` or map `kind='student'` + `holder_id` uuid — additive columns per §3.5.2 |
| A4 | Identity token "§6.2" in Bundle A spec | Implement in Digital ID phase but **before** outpass scanner dependency |
| A5 | Request Engine SLA pause for gates | Document divergence; implement SLA extension at gate clear |

---

## 4. Dependencies and shared contracts

**Reads:** Request Engine, Fees (`fee_invoice_items`), Today (optional banners), Documents templates/issuance, notifications + BullMQ, `StudentStorageService` for complaint photos, Redis pub/sub for revocation (existing gateway patterns).

**Exposes:** Identity token verify API `POST /security/identity/verify`, rotating token on student ID card, `campus_access_logs` append contract for Bundle B events.

**Request types (config only):** `hostel_outpass`, `transport_change`, `transport_renewal`, `loan_renewal`, `id_card_reissue`.

---

## 5. Migration-first PR (`0120`–`0122`)

### Goal

Single deployable migration train: gates table, library/transport/id/hostel additive schema, feature definitions.

### Schema highlights

**`student_request_gates`** — per hyperspec §1.1.2; FK `request_id` → `student_requests`; kinds `guardian_approval|payment`; statuses `pending|cleared|rejected|waived`; indexes on pending gates.

**`student_request_events`:** extend `event_type` CHECK for gate events (migration alters CHECK or uses new enum table pattern consistent with repo).

**Campus Library:** `library_holds`, `library_renewal_policies` (if not inlined), fine posting bridge table `library_fine_invoice_links` (idempotent `fee_invoice_item_id`).

**Transport:** `transport_trip_broadcasts` only new table; optional `transport_seat_watches` **cut v1**.

**Digital ID:** `student_id_cards`, `student_id_card_devices`, `identity_token_keys` (rotation), `identity_scan_replay_cache` (Redis + optional audit table).

**Hostel:** `hostel_mess_menus`; ALTER `gate_passes`, `campus_access_logs` as §3.5; ALTER `work_orders` three student columns.

**Grants/RLS:** institution-scoped; scan logs append-only.

### API stubs

Register request types in `packages/schemas/src/request-types/` with payload schemas §2.1–2.5.

### DoD

Migrations apply; types registered; flags off; no student UI required.

---

## 6. Implementation phases (post-migration)

### Phase 1 — Campus Library (`0123`)

**Goal:** Holds, renewal resolver (auto vs `loan_renewal` request), fine recompute → `fee_invoice_items`.

**Files:** `apps/api/src/modules/student/campus-library/*`, student-web `campus-library` routes, terminology `campusLibrary.*`.

**API:** Catalog search, loans list, hold place/cancel, renewal endpoint (resolver), fines view with pay deep link.

**Services:** `CampusLibraryService`, `LibraryFineBridgeService` (idempotent posting).

**UI states:** no allocation hidden by visibility; empty catalog; offline cache; error retry.

**Tests:** hold queue ordering; fine idempotency; RLS.

**DoD:** `loan_renewal` request type end-to-end with librarian approval.

---

### Phase 2 — Transport (`0124`)

**Goal:** Read assignments/routes; `transport_change`, `transport_renewal` with payment gate; driver **broadcast** job → notifications; **GPS provider interface** stub only.

**Files:** `transport-mirror.service.ts`, `transport-broadcast.processor.ts`, request configs §2.2–2.3.

**API:** Student transport home, route detail, submit requests; institution driver broadcast endpoint (permission `transport.manage`).

**Rules:** Capacity `FOR UPDATE` on approve; `422 FARE_BAND_CHANGE_UNSUPPORTED` for cross-fare changes; use **route existing fare** columns.

**Tests:** capacity race; payment gate clearing.

**DoD:** Renewal bulk approve path; broadcast received on student device.

---

### Phase 3 — Digital ID (`0125`–`0126`)

**Goal:** Documents template `render_kind=id_card`; issue `student_id_cards`; **rotating identity token** (replay protection, device lifecycle, key rotation).

**Files:** extend `documents-gen` for card render; `identity-token.service.ts`; student ID UI.

**API:**

| Method | Path |
|---|---|
| GET | `/student/id-card` |
| POST | `/student/id-card/devices/register` |
| POST | `/security/identity/verify` |

**Token contract:** One token for gate, library desk, future events — **no separate event QR**.

**Tests:** rotation; replay deny; clock skew tolerance.

**DoD:** Digital card live; verify endpoint used in library desk mode.

---

### Phase 4 — Hostel + outpass (`0127`–`0129`)

**Goal:** Hostel home, mess menu, complaints → `work_orders`, outpass request → `gate_passes`, scanner flow, revocation SLO.

**Complaints:** Create `work_orders` with `source='student_portal'`, `reported_by_student_id`; student tracker map; **disputed reopen** via `FacilitiesService` transition (new owning method — not direct status SQL).

**Outpass:** `hostel_outpass` gates for minors; approval writes `gate_passes`; Redis `pass_revoked` + 15s heartbeat; offline asymmetric scan rules §3.5.6.

**SLO tests:** Revocation P95 ≤2s online; heartbeat ≤15s convergence; outgoing offline fail-closed; incoming fail-open.

**Tests:** stale scanner, revoked pass, duplicate scan, overdue return job.

**DoD:** End-to-end outpass with guardian gate and scanner deny/allow matrix.

---

## 7. Security, privacy, and safety

- Server-authoritative gate decisions; phone QR not credential.
- Guardian approval gates never waivable.
- Emergency override audited.
- Append-only `campus_access_logs`.

---

## 8. Risks and failure modes

| Risk | Mitigation |
|---|---|
| Documents not ready | Hard gate Digital ID |
| `work_orders` status drift | Compile-time exhaustive map |
| Token replay | Redis replay cache + epoch |
| Coexistence with `hostel_outing_requests` | Union read model for pass card only |

---

## 9. Test plan

- Integration: each request type submit → gate → approve → side effect.
- RLS: student sees only own loans/passes.
- Contract: identity verify contexts `gate|library_desk`.
- Load: scanner heartbeat fanout.

---

## 10. Acceptance criteria

- Five request types with zero Request Engine core changes (only gates amendment).
- Fines post to `fee_invoice_items` idempotently.
- One identity token verifies in library + gate contexts.
- Outpass revocation meets stated SLO in staging.
- Complaint dispute reopens via Facilities service.

---

## 11. Operational readiness

- Scanner client deployment guide; Redis channel monitoring.
- Institution config: curfew, `outpass_grace_minutes`, guardian channel.

---

## 12. Closeout

**`IMPLEMENTED-CAMPUS-BUNDLE-A.md`** — migrations, APIs, token contract for Bundle B, known deviations.
