# Tier 3 Plan — Platform Readiness

## Execution header

| Field | Value |
|---|---|
| **Target feature** | Platform readiness — webhooks, MFA, support-session sweep, principal metrics/dashboard, compliance, audit debt |
| **Attach at execution** | `/Users/macbook/Downloads/08S7-PLATFORM-READINESS-HYPERSPEC.md` |
| **Prerequisites** | `IMPLEMENTED.md` (core platform); no student Tier 3 feature required |
| **Migration numbers reserved** | `0160`–`0179` |
| **Track and position** | Threaded — independent workstreams, not sequenced with Tracks A/B |
| **Feature surface and capability flags** | Institution portal settings/security; observability module extensions — no new `student.surface.*` module for this plan |
| **Open blockers** | G1–G4 verification recorded; US partner gate for SSO/roster WS |
| **Human decisions** | HD-T3-007 US integrations gated; HD-T3-009 webhook envelope alignment |
| **Conditions before WS start** | Document gate answers at top of each workstream ticket |

---

## 1. Summary

Platform Readiness closes enterprise checklist items in **small, independently deployable workstreams** (one short session each where possible). Verified against the repo on 2026-07-24:

| Gate | Question | Finding | Workstream |
|---|---|---|---|
| **G1** | Webhook secret overlap / zero-downtime rotation | `rotateSecret` exists but **replaces** secret immediately — **no** `previous_secret` / overlap window | **WS2** |
| **G2** | Delivery operations UI | `webhook_deliveries` persisted; **no** institution-web delivery log routes found | **WS3** |
| **G3** | MFA factor management | `mfa_enrolled` on users; **no** app TOTP enroll/challenge/verify surface located in quick audit | **WS4** |
| **G4** | Support-session expiry | `support-access.service.ts` uses **`setInterval` in-process timer fallback** when queue not owning | **WS5** |

Additional scope: principal metric definitions + rollups (**WS6–7**), compliance evidence (**WS8**), audit-flagged debt (**WS9**).

**Gated future (do not implement now):** OIDC/SAML SSO, OneRoster, ClassLink, Clever — until real US customer/partner conversation.

---

## 2. Current repository state

### 2.1 Webhooks (`apps/api/src/modules/integrations`)

- Tables: `webhook_endpoints` (`secret` single column), `webhook_deliveries` append-only (`packages/database/src/schema/integrations.ts`).
- Signing: HMAC-SHA256 over JSON body `{ event, sentAt, data }` with header `x-edrion-signature: sha256=...` — **not** full hyperspec envelope `id, type, version, institution_id, occurred_at`.
- `POST :id/rotate-secret` — new secret, no previous overlap.
- Delivery: single attempt per `deliver()` call in service snippet; retry/dead-letter policy needs rubric audit (**WS1**).

### 2.2 MFA

- Columns: `mfa_enrolled`, `require_mfa` on institution users (snapshots).
- `auth_sessions.aal` referenced in hyperspec — verify in auth module during WS4.
- **Binding:** `mfa_enrolled` boolean alone must **never** establish AAL2; step-up catalogue enforced on sensitive operations.

### 2.3 Dashboards

- `recharts` present; dashboards/observability modules exist — extend for principal home (**WS7**).

### 2.4 Support access

- `apps/api/src/modules/support-access/support-access.service.ts`: `setInterval` sweep fallback lines 35–51 — **G4 confirmed**.

---

## 3. Spec Amendments

| # | Platform hyperspec | Repo amendment |
|---|---|---|
| A1 | §1 "webhook manager removed" | Manager **exists** — work is envelope, overlap rotation, retries UI, rubric compliance |
| A2 | §3 SSO BUILD | **Gated** — document only until US partner |
| A3 | §4 Roster BUILD | **Gated** — document only |
| A4 | WebAuthn in MFA | **Deferred** v1 — TOTP + recovery codes only |
| A5 | Hyperspec assumes absent webhooks | Integrations module present — extend in place |

---

## 4. Dependencies and shared contracts

- Audit writer append-only events.
- `runInInstitutionTenant` for institution tables.
- Recent-auth / step-up guard existing catalogue — extend `packages/schemas/security/step-up-actions.ts`.
- Request Engine for data-subject requests where appropriate (compliance).

---

## 5. Workstreams (each independently deployable)

### WS1 — Webhook envelope and signing (`0160`)

**Goal:** Stable event `id`, `type`, `version`, `institution_id`, `occurred_at`; timestamped HMAC `Edrion-Signature: t=...,v1=...`; idempotent consumer contract.

**Migration:** Add columns to `webhook_deliveries` for `event_id`, `event_version`; payload shape version bump.

**Files:** `integrations.service.ts`, `packages/schemas/webhook-events/*`, worker `webhook.deliver`.

**Non-goals:** Rotation overlap (WS2).

**Tests:** Signature verification vectors; clock skew tolerance ≤5m.

**DoD:** Rubric R1, R5, R9 documented; dual-write old envelope deprecated behind institution flag.

---

### WS2 — Webhook secret rotation with overlap (`0161`)

**Goal:** `previous_secret_ref` / `previous_secret_expires_at`; sign with both during overlap; `ROTATION_IN_PROGRESS` guard.

**API:** Extend `rotate-secret` per hyperspec §1.2; step-up required.

**DoD:** Zero-downtime rotation integration test.

---

### WS3 — Delivery attempts, retries, dead letters, replay, UI (`0162`–`0165`)

**Goal:** Per-attempt rows or normalized attempt history; exponential backoff ~8 attempts / 24h; dead-letter query; replay creates **new** delivery linked to original; auto-disable thresholds.

**UI:** Institution-web endpoint delivery list + detail drawer + replay + copy cURL (hyperspec §1.3).

**API:** `GET /portal/integrations/webhooks/:id/deliveries`, `POST .../deliveries/:id/replay`.

**Tests:** Replay idempotency; 4xx terminal vs 5xx retry.

**DoD:** G2 checklist pass.

---

### WS4 — MFA factor enrollment, challenge, verification, recovery (`0166`–`0170`)

**Goal:** App-managed TOTP v1; recovery codes table `user_mfa_recovery_codes`; enroll/challenge/verify/disable/reset flows; works for local and federated sessions.

**G3 branch:** If Supabase MFA factors present, extend policy only; else `user_mfa_factors` table per hyperspec §2.3 conditional.

**Policy:** `institution_mfa_policies` table; resolution algorithm §2.2; grace windows.

**Enforcement:** Sensitive-operation catalogue §2.5; `403 STEP_UP_REQUIRED`; **never** trust `mfa_enrolled` alone for AAL2.

**UI:** Institution Settings → Security → Authentication (five cards §2.6).

**Tests:** 12 acceptance criteria from hyperspec §2.8.

**DoD:** Pilot tenant `required_for_roles` with grace.

---

### WS5 — Support-session expiry sweep (`0171`)

**Goal:** Remove production `setInterval` fallback; BullMQ repeat job `support-session.expiry` with Redis distributed lock; preserve read-path expiry assertions.

**Files:** `support-access.service.ts`, queue worker registration.

**Tests:** Multi-worker; crash mid-sweep; delayed job; no double-revoke.

**DoD:** G4 resolved; feature flag to disable timer path in prod.

---

### WS6 — Principal metric definitions and rollups (`0172`–`0174`)

**Goal:** Versioned metric definitions; institution-local day boundaries; rollup tables — **no** request-time transactional scans.

**Tables:** `institution_metric_definitions`, `institution_metric_daily_rollups` (institution RLS).

**Metrics:** attendance %, fee collection, request SLA, active users — exact set from observability gap audit during WS6 kickoff.

**DoD:** Backfill job + forward nightly rollup.

---

### WS7 — Principal dashboard UI (`0175`–`0176`)

**Goal:** Extend institution portal dashboard module with principal home composition consuming WS6 rollups.

**UI:** Sparklines, filters, empty states; permission `dashboard.principal.view`.

**DoD:** p95 load <2s on rollups.

---

### WS8 — Compliance posture and evidence (`0177`–`0178`)

**Goal:** DPDP, FERPA, COPPA documentation; retention enforcement hooks; tenant export; data-subject requests via Request Engine where appropriate; trust page content; evidence pack generation; auditable controls list.

**Non-goals:** Legal certification claims — engineering evidence only.

**DoD:** `docs/compliance/evidence-pack.md` generated artifact + control mapping table.

---

### WS9 — Remaining audit-flagged technical debt (`0179`)

**Goal:** Triage `CODEBASE_AUDIT.md` / open items not covered above; one migration max if needed.

**Examples:** webhook auto-disable email; metric definition version stamp enforcement.

**DoD:** Ticket list drained or explicitly deferred with owner.

---

## 6. Gated workstreams (documentation only)

Record in `DECISIONS.md` as **D-T3-US-GATE**:

- **WS-SSO:** SAML/OIDC (`08S7` §3) — institution_identity_providers, JIT rules, break-glass.
- **WS-ROSTER:** OneRoster REST/CSV, Clever adapter, blast guard — **OneRoster before Clever** when unlocked.

No migrations or routes until partner gate clears.

---

## 7. Security, privacy, and safety

- Platform-readiness invariant: no credential echo; tenant isolation; append-only security audit.
- Webhook payloads minimize PII (R10).
- MFA exemptions max 30d; two-person reset.
- Support sessions refuse step-up catalogue actions.

---

## 8. Risks and failure modes

| Risk | Mitigation |
|---|---|
| Envelope breaking integrators | Version bump + dual emit window |
| MFA lockout | Recovery codes + break-glass |
| Sweep duplicate | Redis lock + idempotent expiry |
| Metric wrong timezone | Institution-local boundaries tested |

---

## 9. Test plan

- WS1–3: webhook contract tests + replay integration.
- WS4: MFA acceptance list §2.8.
- WS5: chaos multi-worker.
- WS6–7: rollup correctness fixtures.
- WS8: export dry-run on staging tenant.

---

## 10. Acceptance criteria

1. G1–G4 answers recorded in `IMPLEMENTED-PLATFORM-READINESS.md`.
2. Rotation overlap verified without delivery loss.
3. Delivery UI usable for 11pm integrator debugging scenario.
4. MFA AAL2 enforced on catalogue actions; `mfa_enrolled` not sufficient alone.
5. No `setInterval` support sweep in prod config.
6. Principal dashboard reads rollups only.
7. US SSO/roster code absent from repo until gate lifted.

---

## 11. Operational readiness

- Runbooks per WS; security contact notifications for webhook disable and MFA lockouts.
- Feature flags per workstream where partial rollout needed.

---

## 12. Closeout

**`IMPLEMENTED-PLATFORM-READINESS.md`** (or per-WS addenda) with gate results, migration list, rubric R1–R10 scores, explicit deferred US integrations.

---

## 13. Review rubric capture template (WS1 audit)

| # | Item | Status (fill at execution) |
|---|---|---|
| R1 | Envelope shape | |
| R2 | Event naming | |
| R3 | Versioning | |
| R4 | Code catalog | |
| R5 | Signature scheme | |
| R6 | Retry policy | |
| R7 | Dead-letter | |
| R8 | Auto-disable | |
| R9 | Ordering guarantee | |
| R10 | PII minimization | |

Current repo partial score: R5 partial (HMAC without timestamp); R1/R6/R7/R8 need WS1–WS3.
