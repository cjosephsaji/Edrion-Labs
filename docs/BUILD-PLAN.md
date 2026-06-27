# Build plan — next phases

Execution plan for continuing the Edrion Super Admin platform. Written so a fresh agent can
pick it up without re-deriving context. **Read [ARCHITECTURE.md](ARCHITECTURE.md),
[PERMISSIONS.md](PERMISSIONS.md), [AUDIT.md](AUDIT.md) and [DEVELOPMENT.md](DEVELOPMENT.md)
first.**

## Ground rules (apply to every task)

- Follow the **Institutions module** as the reference for both layers:
  - API: `apps/api/src/modules/institutions/` — controller (HTTP only) → service (logic +
    audit) → repository (typed SQL). Module wired in `app.module.ts`.
  - Web: `apps/super-admin-web/src/app/(app)/institutions/` + `src/components/`, data via
    `@edrion/api-client` hooks (TanStack Query).
- **Every** API handler: `@RequirePermissions(...)`. **Every** mutation: write an audit event
  via injected `AuditWriter` using `baseAudit(ctx)`. Sensitive keys auto-require recent auth.
- **Every** new domain: define Zod schemas in `packages/schemas`, enums in
  `packages/shared-types`, Drizzle tables in `packages/database/src/schema`, then
  `pnpm db:generate`.
- **Never** write to `audit_events`/`security_events`/`activity_events` directly — only via
  `@edrion/audit`.
- Money = integer minor units. UUID PKs, `version` column + optimistic concurrency on
  sensitive updates. Reason required on sensitive actions.
- Add a hook to `packages/api-client/src/hooks.ts` + DTO to `types.ts` for each new resource.
- After each module: `pnpm --filter <pkg> typecheck`, add/extend vitest specs, run
  `pnpm -r test`, and for the web app `pnpm --filter @edrion/super-admin-web build`.
- Remember the exFAT `._*` caveat: run `pnpm clean:apple` before generate/build if scans choke.

## Verification gate per phase

`pnpm -r typecheck` clean · `pnpm -r test` green · web `build` succeeds · new endpoints
smoke-tested with curl (`x-employee-email: owner@edrion.dev`) · audit row written for each
mutation (check `audit_events`).

---

## Phase 4 — Users (institution users, campus access, independent users)

### 4a. Campuses frontend (backend already exists)
- Pages: `(app)/campuses/page.tsx` (global directory: summary cards — total/included/paid/
  inactive/add-on revenue; filters institution+billingStatus+active; table), and a
  campuses tab inside institution detail.
- Wire `GET /v1/campuses`, `POST /v1/campuses/charge-preview`, `POST /v1/campuses`,
  `POST /v1/campuses/:id/suspend` (hooks already partly in api-client).
- **Add-campus flow**: form → call charge-preview → show ConfirmDialog with the
  `CampusChargeBreakdown` (included-in-base / proration / discount / tax / next-invoice
  impact) → confirm → create. Reuse `ConfirmDialog`.

### 4b. Institution Users
- API module `institution-users/` (controller/service/repo). Endpoints: list (filters:
  institution, campus, role, status, invitation, lastActivity, security), get (identity +
  campus access + roles + effective permissions + invitation/login history), invite,
  resend-invite, update, change-role, change-campus-access, add/remove permission override,
  disable/enable, force-password-reset, revoke-sessions, require-mfa, unlock.
- **Invariant**: an institution user belongs to ONE institution; campus grants
  (`campus_user_access`) only within that institution. Enforce in service.
- **Effective-access preview**: before confirming a permission/campus change, return the
  resulting effective access; show it in the UI before commit.
- Schemas in `packages/schemas/src/institution-users.ts`. Tables already exist
  (`institution_users`, `institution_user_roles`, `campus_user_access`).
- Pages: `(app)/institution-users/page.tsx` (directory), `[id]/page.tsx` (detail with the
  preview-before-confirm flow). Tab inside institution detail too.

### 4c. Independent Users (SEPARATE domain — no institution/campus/role controls)
- API module `independent-users/`. Endpoints: list (status, subscription, entitlements,
  country, source, AI usage, risk), get, update-status, manage-subscription,
  grant/revoke-entitlement, apply-credit, reset-security, revoke-sessions, restrict-ai,
  export-data, account-deletion workflow.
- Tables exist (`independent_users`); add `independent_user_subscriptions`,
  `independent_user_entitlements`.
- Pages: `(app)/independent-users/page.tsx` + `[id]/page.tsx`. Distinct terminology; do NOT
  show role/campus UI.

---

## Phase 5 — Commercial (plans, subscriptions, billing)

- API modules `plans/`, `subscriptions/`, `billing/`, `entitlements/`.
- **Plans**: draft/published/archived + **immutable versioning** (edit = new
  `plan_versions` row; never mutate an active version). Currency-specific pricing, base
  campus allowance, per-campus price, usage limits, feature entitlements, trial, support
  level. Pages: `(app)/plans/page.tsx`, `[id]/page.tsx` (version history).
- **Subscriptions**: change/schedule plan change, extend trial, add/remove campus add-on,
  change cycle, override pricing, discount, credit, pause/cancel/resume, usage limits,
  overage, grace. Reuse the campus pricing engine in `packages/schemas/src/pricing.ts`;
  extend with subscription proration. Pages: `(app)/subscriptions/page.tsx`, `[id]`.
- **Billing**: invoices, payments, failed-payment queue, credits, refunds, discounts, tax,
  dunning, billing audit. New tables: `invoices`, `invoice_items`, `payments`, `refunds`,
  `credits`, `discounts`, `usage_metrics`, `campus_billing_items`. Money in minor units.
  **Idempotency + replay protection** on financial mutations (idempotency key table + Redis).
- Wire the institution detail Subscription + Billing tabs.

---

## Phase 6 — Support access (highest-value differentiator)

Data model + auth/audit plumbing already exist (`support_access_sessions`, AuthGuard
`resolveSupportSession`, `baseAudit` stamps session id). Remaining:
- API module `support-access/`: request-session, approve, start, extend, end; enforce
  recent-auth/MFA on start (`institutions.access_portal` is sensitive). Write the lifecycle
  audit events (requested/approved/started/portal-entered/extended/ended/expired).
- **Enter Institution Portal** flow from institution detail: ConfirmDialog (institution,
  employee identity, access level, required reason, optional case ref, duration, logging
  warning) → create session → store session id client-side.
- **Persistent support banner**: render above the app shell when a session is active
  (employee identity + institution + countdown to `expiresAt` + "all actions recorded").
  Send `x-support-session-id` on every request (already supported by `ApiClientProvider`).
- Background expiry sweep (mark `expired`, write event).
- Also `support/` module: support cases (list/detail/messages/internal notes/SLA/resolution),
  pages `(app)/support/`, `(app)/access-sessions/`.

---

## Phase 7 — Platform controls

- `packages/feature-flags`: deterministic resolution engine (global→plan→institution→campus
  →user, + rollouts + kill switch) returning **winning layer + reason**. Unit-test the
  hierarchy. See [FEATURE-RESOLUTION.md](FEATURE-RESOLUTION.md).
- API `feature-controls/` + tables `feature_definitions`, `feature_assignments`,
  `feature_rollouts`. Pages: `(app)/features/page.tsx`, `[key]` with **Effective Value**
  preview, scheduled activation/expiry, percentage rollout, allow/block lists, kill switch.
- `analytics/` aggregated dashboard endpoint `GET /v1/analytics/dashboard` (single grouped
  query per the perf rules) — replace the dashboard placeholders.
- `(app)/pending-actions/page.tsx` grouped Critical/Today/Upcoming/Informational.
- `(app)/activity/page.tsx` cursor-paginated live feed (use `cursorQuerySchema`).
- `(app)/audit/page.tsx` advanced filters + event detail drawer + before/after diff.
- System health, integrations, webhooks, background jobs pages + modules.

---

## Phase 8 — Copilot + AI governance

Implement strictly per [AI-GUARDRAILS.md](AI-GUARDRAILS.md).
- `packages/copilot`: tool contracts + guardrail evaluation (read-only/draft-only, financial
  cap, affected-user cap, two-person, kill switch). Anthropic via `ANTHROPIC_API_KEY`,
  model `claude-opus-4-8` (fallback `claude-sonnet-4-6`).
- API `copilot/` + `ai-governance/`. Tables `ai_policies`, `ai_action_rules`, `ai_runs`,
  `ai_tool_calls`, `ai_confirmations`, `ai_approvals`.
- **Hard rule**: AI prepares actions; execution goes through the SAME audited service a human
  uses, only after explicit confirmation. Confirmation screen shows exact impact + the audit
  record that will be written. Audit events carry `aiInvolved:true` + `aiRunId`.
- Pages: `(app)/copilot`, `(app)/ai` (Control Centre), `(app)/ai/policies`,
  `(app)/ai/guardrails`, `(app)/ai/usage`, `(app)/ai/audit`, `(app)/ai/prompts`.

---

## Phase 9 — Hardening

- Wire real **Supabase Auth** (replace dev `x-employee-email` header in `auth.guard.ts`):
  validate session cookie → JWT → map `sub` to employee. MFA enforcement for employees.
- Redis: rate limiting, queues (BullMQ) for imports/exports/reports/notifications/billing
  sync/AI, idempotency store.
- RLS policies for tenant isolation where appropriate.
- Sentry + structured logging transport (`observability` package).
- Background jobs framework + `background_jobs` table surfacing in System Health.
- Tests: integration (institution create, campus add, invite, plan change, feature override,
  support access, AI confirmation) + e2e (login→create→add paid campus→assign campus→start
  support session→action→verify audit→change plan→configure feature→AI confirm→suspend).
- a11y pass (focus, labels, contrast, reduced-motion), responsive pass (tablet/narrow),
  error/empty/permission-denied states on every screen, perf (prefetch, optimistic updates,
  aggregated endpoints, cursor pagination, virtualization for big lists).

---

## Suggested order for the next chat

1. **Phase 6 support-access portal + banner** (model exists; high differentiator, exercises
   the audit/correlation story end-to-end).
2. **Phase 4b institution users** (effective-access preview).
3. **Phase 4a campuses frontend** (backend done — quick win, demonstrates charge preview).
4. Then Phase 5 commercial, Phase 7 controls, Phase 8 AI, Phase 9 hardening.

Each chat: pick ONE sub-phase, build API module + schemas + tables (+ generate) + frontend
pages + hooks, then run the verification gate before moving on. Do not scaffold many empty
pages at once.

---

## Phase 10 — Ship sign-off ✅

Phases 1–10 are complete. Every sub-phase keeps `pnpm -r typecheck` clean, `pnpm -r test` green,
the web build passing, and ships with a committed live proof. Consolidated runner:
`scripts/p10-smoke.sh` (auth · redis · jobs · observability · RLS · 10f modules · full-lifecycle
e2e).

### Sub-phase status

| Sub-phase | Scope | Proof |
|-----------|-------|-------|
| 10a real auth | Supabase-token → API session cookie, MFA, recent-auth/reauth, revoke, lockout | `scripts/auth-smoke.sh` (13 checks) |
| 10b Redis | rate limit + idempotency fast-path + AI usage caps + BullMQ queues | `scripts/redis-smoke.sh`¹ |
| 10c RLS | tenant isolation under `edrion_app` `NOBYPASSRLS`, `withInstitutionScope` | `scripts/rls-proof.sql` |
| 10d observability | structured logs, request/correlation id, Sentry seam, client-error capture | `scripts/observability-smoke.sh` |
| 10e background jobs | tracked sweeps → `background_jobs`, System Health surfacing | `scripts/jobs-smoke.sh` |
| 10f-1 independent-users | directory + status lifecycle (audited) | `scripts/modules-smoke.sh` |
| 10f-2 support-cases | cases + messages + status/assign (audited) | `scripts/modules-smoke.sh` |
| 10f-3 employees + platform-roles | CRUD + role assignment, read-only role catalogue | `scripts/modules-smoke.sh` |
| 10f-4 integrations/webhooks | HMAC-signed delivery via BullMQ worker, append-only deliveries | `scripts/modules-smoke.sh` |
| 10g e2e + ship-readiness | full-lifecycle e2e, consolidated runner, runbook, this sign-off | `scripts/e2e-lifecycle.sh`, `scripts/p10-smoke.sh` |

¹ Two redis-smoke checks (request-rate 429, AI-run daily cap) only trip when the API is booted
with low caps; the guards are covered by `rate-limit.guard.spec.ts` + `ai-usage-limiter.service.spec.ts`.
`p10-smoke.sh` flags them as env-gated rather than failing.

### Ship-readiness review

- **Security.** Every HTTP handler is `@RequirePermissions(...)`-gated (audited sweep: only
  `auth` identity routes, the public health check, and the public client-error endpoint are
  intentionally ungated). Sensitive permissions require recent auth — proven live (403
  `RECENT_AUTH_REQUIRED` on `employees.create`, `integrations.manage`, support-session start).
  RLS isolates the tenant tables under a least-privilege `NOBYPASSRLS` role. Webhook signing
  secrets are returned once and otherwise redacted to a hint; AI-run fields pass through
  `redactSecrets`. `audit_events` / `security_events` / `activity_events` / `webhook_deliveries`
  are append-only (grants + trigger; UPDATE raises). Rate limiting + idempotency on financial
  paths. `AUTH_DEV_*` default off and are documented as production blockers.
- **Performance.** Cursor pagination on the high-volume streams; offset only on bounded
  directories; hot filter/sort columns indexed (incl. partial `audit_ai_run_idx`); guardrail
  N+1 collapsed to load-once; webhook delivery + maintenance run off the request path on BullMQ.
- **Accessibility.** Focus-trap + focus-return + `aria-labelledby` on dialogs/drawers, global
  `prefers-reduced-motion`, WCAG-AA muted text, labelled inputs, keyboard-activatable rows.
- **Docs.** ARCHITECTURE, PERMISSIONS, AUDIT, DATABASE, DEVELOPMENT, AI-GUARDRAILS, ROUTE-MAP
  current; **[DEPLOY-RUNBOOK.md](DEPLOY-RUNBOOK.md)** added (env vars, migration order incl.
  `zzz_grants`/`zzz_rls`, `edrion_app` least-priv role, Redis/Sentry, rollback, post-deploy
  checklist).

### Migrations

`0000 → 0012` + `zzz_grants.sql` + `zzz_rls.sql` apply **cleanly from an empty database** (44
tables, RLS on the 6 tenant tables, append-only triggers installed) — verified by a fresh-DB
migration job run.

**Phase 10 is ship-ready.**
