# Edrion Super Admin Platform — Architecture

The internal control plane Edrion employees use to operate the platform: institutions,
campuses, institutional users, independent users, subscriptions, billing, features,
support access, audit, security and AI governance.

This document is the source of truth for structure, boundaries and conventions. Read it
before adding a module.

---

## 1. High-level shape

```
Browser (Next.js App Router, super-admin-web)
        │  HTTPS, HTTP-only session cookie
        ▼
NestJS API (apps/api)  ── modular monolith
        │  Guards: Auth → Permission → RecentAuth (sensitive)
        ▼
Application service (business logic)
        │
        ▼
Repository (typed SQL via Drizzle)
        │
        ▼
Supabase PostgreSQL  (+ Redis for cache/queues/rate-limit, + Storage)
```

Rules that this flow enforces:

- The browser never talks to the database directly for reads/writes. The only direct
  Supabase use from the browser is (a) authenticated Realtime subscriptions on
  permission-scoped channels and (b) signed Storage uploads. Both are gated by tokens
  minted server-side.
- The **service-role key never reaches the frontend**. It lives only in the API
  environment.
- Every protected action is authenticated, authorised and audited in the API, regardless
  of what the UI shows. Hiding a button is a UX nicety, not a control.

## 2. Monorepo layout

```
edrion/
├── apps/
│   ├── super-admin-web/      Next.js App Router frontend
│   └── api/                  NestJS modular-monolith backend
├── packages/
│   ├── design-tokens/        Single source of colour/space/type tokens → CSS vars + Tailwind preset
│   ├── ui/                   shadcn/Radix component library, consumes design-tokens
│   ├── schemas/             Zod schemas shared by API DTOs and frontend forms
│   ├── shared-types/         Pure TS types/enums shared everywhere (no runtime deps)
│   ├── permissions/          Permission catalogue + deterministic evaluation engine
│   ├── database/             Drizzle schema, migrations, seed, repository helpers
│   ├── auth/                 Session, MFA, recent-auth, password-reset primitives
│   ├── audit/                Append-only audit + security event contracts and writer
│   ├── feature-flags/        Feature registry + deterministic resolution engine
│   ├── api-client/           Typed client (fetch + TanStack Query hooks) generated from schemas
│   ├── copilot/              Copilot tool contracts + AI guardrail evaluation (shared)
│   ├── observability/        Logger, request-id/correlation-id, Sentry wiring
│   └── config/               Runtime env parsing (zod) + shared constants
├── tooling/
│   ├── eslint/               Shared flat ESLint config
│   ├── typescript/           Base tsconfigs (base, nextjs, nestjs, react-library)
│   └── tailwind/             Shared Tailwind preset built on design-tokens
└── docs/
```

Dependency direction (never circular):

```
shared-types  ← schemas ← permissions, feature-flags, audit, auth, copilot
design-tokens ← ui ← super-admin-web
schemas + shared-types ← api-client ← super-admin-web
database depends on shared-types only
api depends on: database, schemas, permissions, feature-flags, auth, audit, copilot, observability, config
super-admin-web depends on: ui, api-client, schemas, shared-types, design-tokens, permissions(types only)
```

## 3. API module boundaries

Each `src/modules/<domain>/` is self-contained and exposes:

```
<domain>/
├── <domain>.controller.ts     HTTP surface only — parse, delegate, serialise. No logic.
├── <domain>.service.ts        Business logic, transactions, event emission.
├── <domain>.repository.ts     Typed SQL only. No business rules.
├── dto/                        Zod schemas (from packages/schemas) + Nest DTO wrappers.
├── <domain>.permissions.ts    The permission keys this module owns.
├── <domain>.events.ts         Domain events emitted onto the internal bus.
├── <domain>.module.ts         Nest wiring.
└── <domain>.spec.ts / *.e2e   Tests.
```

Modules (Phase order in §32 of the brief):

```
authentication  platform-employees  platform-roles
institutions    campuses             institution-users   independent-users
plans           subscriptions        billing             entitlements
feature-controls support             support-access      activity
audit           security             analytics           notifications
announcements   copilot              ai-governance       integrations
webhooks        platform-settings
```

Cross-module calls go **service → service** through Nest DI, never controller → controller
and never reaching into another module's repository. Shared write concerns (audit,
events) flow through the `audit` and event-bus providers, not direct table writes.

## 4. Account & tenancy model (the load-bearing invariants)

Three **separate** principal domains. They may share an identity layer internally but never
merge in screens, permissions or APIs:

1. **Platform employees** — Edrion staff. Have platform roles + granular permissions.
2. **Institution users** — belong to exactly **one** institution; may be granted access to
   **many campuses within that institution**. A campus grant must never widen access to a
   second institution.
3. **Independent users** — direct consumers of the learning product, no institution.

Institution → many campuses. An institution is one customer; campuses are subdivisions,
not separate schools. Additional campuses are **chargeable** per the subscription engine
(base allowance + add-ons + per-campus pricing + proration). Campuses are never assumed
free.

Linking an institution user and an independent user is an explicit, audited admin action —
never automatic.

## 5. Permission strategy

- Permissions are granular string keys (`institutions.suspend`, `campuses.configure_billing`,
  …) defined once in `packages/permissions`. Roles are **bags of permissions**, not
  hardcoded behaviour. Renaming/adding a role changes no code.
- Effective permission = union of role permissions (via `employee_role_assignments`)
  minus explicit denies, evaluated by a pure function in `packages/permissions`
  (`evaluate(employee, context) → Set<PermissionKey>`). Same function runs on the API
  (authoritative) and is mirrored to the client (UI gating only).
- Enforcement layers, all required: sidebar/route → page → action/button → API guard →
  service assertion → DB RLS where appropriate. The API guard + service assertion are the
  real boundary; UI gating is cosmetic.
- Support-access sessions grant **scoped, time-boxed, audited** entry into one institution.
  The employee acts as themselves; identity is never masked.

## 6. Database groups

UUID PKs, UTC `timestamptz`, explicit FKs, integer **minor units** for money, append-only
audit/security tables, versioned plans/policies, `created_by`/`updated_by` and a `version`
column (optimistic concurrency) on sensitive tables. Full table list in
`docs/DATABASE.md`. Groups:

- **Platform identity**: platform_employees, platform_roles, platform_permissions,
  platform_role_permissions, employee_role_assignments
- **Tenancy**: institutions, campuses, institution_users, institution_memberships,
  institution_user_roles, campus_user_access, institution_permission_overrides
- **Independent**: independent_users, independent_user_subscriptions,
  independent_user_entitlements
- **Commercial**: plans, plan_versions, plan_entitlements, subscriptions,
  subscription_addons, campus_billing_items, invoices, invoice_items, payments, refunds,
  credits, discounts, usage_metrics
- **Feature control**: feature_definitions, feature_assignments, feature_rollouts
- **Support**: support_cases, support_messages, support_access_sessions
- **Records (append-only)**: activity_events, audit_events, security_events
- **AI**: ai_policies, ai_action_rules, ai_runs, ai_tool_calls, ai_confirmations,
  ai_approvals
- **Comms**: notifications, announcements, announcement_audiences, delivery_events
- **Ops**: integrations, webhook_endpoints, webhook_deliveries, background_jobs,
  platform_incidents

## 7. Audit & immutability

Audit + security events are **append-only**. No UPDATE/DELETE through application APIs;
enforced by DB grants (the app role has INSERT/SELECT only on these tables) and by routing
all writes through `packages/audit`. Every audited action records actor, actor type,
institution/campus, support session, action, entity, before/after, timestamp, IP, UA,
correlation/request id, result, risk level and AI involvement. See `docs/AUDIT.md`.

## 8. Feature resolution (deterministic)

```
global default → plan → institution → campus → user (most specific wins)
```

plus rollouts (percentage/allow-list/block-list/environment/schedule) and an emergency
kill switch that short-circuits to OFF. The engine returns not just the boolean but the
**winning layer + reason**, surfaced in the UI's "Effective Value" preview. See
`docs/FEATURE-RESOLUTION.md`.

## 9. AI safety (non-negotiable)

The Copilot may search, analyse, draft and **prepare** actions, but performs **no
state-changing action without explicit human confirmation**, even when the employee has
permission. Every mutation flows: understand → gather → explain → prepare → show exact
impact → confirm → execute → show result → write audit. Guardrails (read-only/draft-only,
financial caps, affected-user caps, two-person approval, kill switch) are evaluated in
`packages/copilot` and enforced in the `ai-governance` module. Internal chain-of-thought is
never surfaced. See `docs/AI-GUARDRAILS.md`.

## 10. Frontend conventions

- App Router. Server Components fetch initial data through the API (server-side, cookie
  forwarded); Client Components use TanStack Query hooks from `api-client` for cache,
  prefetch and optimistic updates.
- One shared design system in `packages/ui`. No bespoke card/button/modal/table per page.
- Tables: server-side filter/sort/paginate, URL-persisted state, cursor pagination for
  audit/activity, virtualisation for very long lists.
- Forms: React Hook Form + Zod (same schema as the API), unsaved-change guards, accessible
  errors, confirmation flows for sensitive actions (typed confirmation / recent-auth / MFA
  / second approver per risk).
- Motion for React, durations per brief §24, `prefers-reduced-motion` respected.

## 11. Security baseline

Supabase Auth, HTTP-only cookies, MFA for employees, per-action permission checks,
institution/campus isolation + RLS, server-side validation, parameterised SQL, rate
limiting (Redis), session revocation, account lockout, CSP/XSS/CSRF protections, signed
file access, webhook signature verification, idempotency + replay protection on financial
actions, sensitive-field redaction, least-privilege DB credentials. Employees are not
implicitly trusted; sensitive actions require recent auth.

### Observability (Phase 10d — implemented)

`@edrion/observability` is the provider-agnostic seam: `createLogger` (structured JSON, level
filtering, `child(bindings)` for correlation) + `createErrorReporter` (Sentry when `SENTRY_DSN`
is set — lazy-loaded `@sentry/node` — else a no-op sink that still logs the capture). CoreModule
provides both (`LOGGER`, `ERROR_REPORTER`). The request middleware assigns a request id +
honours an inbound `x-correlation-id`, echoes both as response headers, and every error envelope
carries `correlationId`. `AllExceptionsFilter` logs each failure correlated and forwards 5xx to
the error reporter. The web `AppErrorBoundary` POSTs render crashes to
`/v1/observability/client-error`, so client crashes land in the same correlated stream as server
errors. Proof: `scripts/observability-smoke.sh`.

### Redis substrate (Phase 10b — implemented)

`RedisService` (`apps/api/src/common/redis`) fronts three concerns, all env-gated and fail-open:

- **Rate limiting** — `RateLimitGuard` (global, after AuthGuard) fixed-window INCR keyed by
  employee id (authenticated) or client IP (unauthenticated, tighter cap). Breach → `429` +
  `Retry-After`. `@RateLimit(max, window)` / `@SkipRateLimit()` override per handler.
- **Idempotency fast-path** — `IdempotencyService` caches completed financial-mutation results
  in Redis (`idem:res:*`); the `idempotency_keys` table stays the durable source of truth, so a
  Redis outage degrades to table-only.
- **AI usage limits** — see docs/AI-GUARDRAILS.md.

**Background queues + jobs** — BullMQ over Redis (`apps/api/src/common/queue`): `imports`,
`exports`, `reports`, `notifications`, `billing-sync`, `ai`, `maintenance`. `JobsService`
enqueues / schedules repeatable jobs + reports counts; `QueueWorkers` runs in-process workers
(`QUEUE_WORKERS_ENABLED`) that route jobs to registered handlers. Phase 10e (implemented): the
former in-process sweeps — `support-session.expiry`, `ai-run.expiry`, `billing.dunning-overdue`
— run as tracked, scheduled jobs; `JobTracker` records each run to `background_jobs`
(status/duration/items), and System Health (`GET /system/health`) surfaces the latest run per
job, recent runs, queue depth, and Redis liveness. SupportAccessService keeps an in-process
timer only when queues are disabled. Proof: `scripts/jobs-smoke.sh`.

### Authentication (Phase 10a — implemented)

`POST /auth/login` verifies a Supabase access token (HS256 / `SUPABASE_JWT_SECRET`), maps
`sub` → `platform_employees.auth_user_id`, enforces MFA (`aal2` for enrolled employees), then
issues an **API-owned session**: an `auth_sessions` row + an HTTP-only cookie carrying an
API-signed JWT. The `AuthGuard` validates the cookie against the live session row on every
request; the session's `last_auth_at` (stamped at login and by `POST /auth/reauth`) drives the
recent-auth gate that `PermissionsGuard` enforces for sensitive permissions. `logout` revokes
the session; repeated failed logins lock the account (`AUTH_MAX_FAILED_LOGINS` /
`AUTH_LOCKOUT_SECONDS`). The DB-evaluated permission set is authoritative — the cookie carries
identity, never authorisation. Two env-gated dev escape hatches (`AUTH_DEV_HEADER`,
`AUTH_DEV_LOGIN`) exist for local/offline work and are off by default.

## 12. Local dev

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev          # turbo runs api (:3007) + super-admin-web (:3000)
```

Env in `.env.example`. Live Supabase optional for dev: the database package targets any
Postgres 15+; Redis via local container. See `docs/DEVELOPMENT.md`.

## 13. Implementation checklist (tracking)

- [x] P1 Foundation: monorepo, tokens, ui, app shell, auth pkg, db, api shell, logging, errors
- [~] P2 Security/access: employees+roles+permissions evaluated end-to-end; guards + recent-auth
      live; audit + security frameworks live. (MFA enforcement + employees CRUD UI: pending.)
- [~] P3 Institutions + campuses: directory, detail, create, audited status workflows, campus
      pricing engine + preview — backend complete + frontend vertical wired. (Remaining tabs:
      pending.)
- [ ] P4 Users: institution users, campus access, independent users, invitations, security
- [x] P5 Commercial: plans + immutable versioning; subscriptions (plan/cycle change with
      day-based proration, add-ons, override pricing, discount, credit, usage limits, overage,
      grace, pause/cancel/resume) with preview-before-confirm; billing (invoices, payments,
      failed-payment queue + dunning, refunds, credits, discounts, tax) with idempotency +
      replay protection on every financial mutation; entitlements resolution. All audited.
- [~] P6 Support access: sessions module (start/extend/end/portal-entered + expiry sweep),
      portal entry flow, persistent banner, access-sessions directory + institution tab,
      cross-portal lifecycle audit — done. (Support cases module + curl smoke vs live DB: pending.)
- [~] P7 Platform controls: feature resolution engine (`packages/feature-flags`, deterministic
      global→plan→institution→campus→user + rollouts + kill switch, returns winning layer+reason,
      24 unit tests) + `feature-controls` module (definitions/assignments/rollouts, Effective-Value
      preview) + `analytics` aggregated dashboard + pending actions + `audit` read module
      (cursor-paginated list/activity, event drawer with before/after diff, CSV export) + System
      Health endpoint/page — all done + curl-smoked. (Integrations, webhooks, background-jobs
      modules: deferred.)
- [ ] P8 Copilot + AI governance: guardrails, confirmation, AI audit, kill switches
- [x] P10 Ship-readiness: 10a real auth · 10b Redis (rate-limit/idempotency/AI-caps/queues) · 10c
      RLS · 10d observability · 10e tracked background jobs · 10f domain modules (independent-users,
      support-cases, employees + platform-roles, integrations/webhooks with HMAC-signed delivery) ·
      10g full-lifecycle e2e + consolidated `scripts/p10-smoke.sh` + `docs/DEPLOY-RUNBOOK.md` + ship
      sign-off. Migrations 0009–0012; append-only now covers `webhook_deliveries`; RLS covers
      `webhook_endpoints`. See `docs/BUILD-PLAN.md` § "Phase 10 — Ship sign-off".
- [x] P9 Hardening: perf, security, a11y, tests, error states, responsive, docs — all sub-phases done.
      9a Perf: copilot guardrail N+1 fixed (load policies/rules once per run → `evaluateWith`), partial
      index `audit_ai_run_idx` (migration 0008, EXPLAIN-verified), cursor pagination + index audit, FE
      React-Query review, DATABASE.md perf note. 9b Security: per-tool `can()` on every Copilot path
      (closed AI read-path bypass), secret redaction on persisted AI fields, 512kb body limit +
      body-parser→413/400, idempotency sweep (no gap), authz guard tests. 9c A11y: focus-trap +
      focus-return + aria-labelledby on ConfirmDialog/audit+ai-run drawers (`useFocusTrap`), global
      `prefers-reduced-motion`, text-muted contrast → WCAG AA (#776f60), search-input label,
      keyboard-activatable drawer rows (`rowActivation`). 9d Tests: Zod specs for copilot + ai-governance,
      ai-governance service specs (perm asserts + version conflict), copilot lifecycle edges (reject/
      expiry/failed-exec/self-approval/load-once) — 248 tests total. 9e Resilience: app-shell error
      boundary, shared `errors.ts` (actionable RECENT_AUTH + VERSION_CONFLICT messages), consolidated
      mutation feedback. 9f Responsive+docs: sidebar auto-collapse under md, AI-GUARDRAILS lifecycle +
      tool registry, Swagger @ApiTags verified, README run steps. Gate: typecheck clean · 248 tests ·
      web build OK · live curl re-smoke green.

Legend: [x] done · [~] substantially done, gaps noted · [ ] designed, not yet built.
