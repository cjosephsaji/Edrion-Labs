# Deployment runbook

Operational guide for deploying the Edrion Super Admin platform (API + web) to a real
environment. Source of truth for environment variables, migration order, the least-privilege
database role, and rollback. Read alongside [ARCHITECTURE.md](ARCHITECTURE.md) and
[DATABASE.md](DATABASE.md).

> **Hard rule for production:** `AUTH_DEV_HEADER` and `AUTH_DEV_LOGIN` MUST be `false` (their
> defaults). They are local-only escape hatches that bypass real session auth. A production boot
> with either `true` is a critical misconfiguration — treat it as a release blocker.

---

## 1. Topology

```
              ┌──────────────────────────┐
  browser ──► │ super-admin-web (Next.js) │ ──► API only (cookie forwarded server-side)
              └──────────────────────────┘
                          │
              ┌───────────▼──────────────┐     ┌────────────┐   ┌────────────┐
              │ api (NestJS)             │ ──► │ PostgreSQL │   │   Redis    │
              │  + in-process BullMQ     │     │ (edrion_app│   │ (rate/idem │
              │    workers (optional)    │     │  role)     │   │  /queues)  │
              └──────────────────────────┘     └────────────┘   └────────────┘
```

Run the API in **two roles** if you want isolation:
- **web/API process** — serves HTTP. Set `QUEUE_WORKERS_ENABLED=false`.
- **worker process** — same image, `QUEUE_WORKERS_ENABLED=true`, no public ingress. Runs the
  BullMQ workers (webhook delivery, maintenance sweeps). A single combined process is also fine
  for smaller deployments (`QUEUE_WORKERS_ENABLED=true` on the API).

The **migration job** is a third, short-lived process that connects as a superuser/owner
(`DATABASE_MIGRATION_URL`) and exits.

---

## 2. Environment variables

`packages/config/src/index.ts` is authoritative — the API fails fast at boot on anything
invalid. Defaults shown; **bold = must set explicitly in production**.

### Core

| Var | Default | Prod guidance |
|-----|---------|---------------|
| `NODE_ENV` | `development` | **`production`** |
| **`DATABASE_URL`** | — | App connection string. Use the least-priv `edrion_app` role (§4). |
| `DATABASE_MIGRATION_URL` | — | Owner/superuser URL for the migration job only. |
| **`SESSION_COOKIE_SECRET`** | — | ≥16 chars, high-entropy, secret. Signs session JWTs. |
| `SESSION_COOKIE_NAME` | `edrion_session` | Keep stable; changing it logs everyone out. |
| `SESSION_TTL_SECONDS` | `28800` (8h) | Session lifetime. |
| `RECENT_AUTH_WINDOW_SECONDS` | `900` | Recent-auth window for sensitive actions. |
| `API_PORT` | `3001` | |
| `API_BASE_URL` | `http://localhost:3001` | **Public API origin.** |
| `API_CORS_ORIGINS` | `http://localhost:3000` | **Comma-separated web origins.** |
| `LOG_LEVEL` | `info` | `info` or `warn` in prod. |

### Authentication (Phase 10a)

| Var | Default | Prod guidance |
|-----|---------|---------------|
| `AUTH_DEV_HEADER` | `false` | **MUST be `false`.** Honours `x-employee-email` as identity. |
| `AUTH_DEV_LOGIN` | `false` | **MUST be `false`.** Allows passwordless `{email}` login. |
| `SUPABASE_JWT_SECRET` | — | **Required for real login** — verifies Supabase access tokens (HS256). |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | — | Service-role key is **API-only**, never shipped to the browser. |
| `AUTH_MAX_FAILED_LOGINS` | `5` | Lockout threshold. |
| `AUTH_LOCKOUT_SECONDS` | `900` | Lockout duration. |

### Redis, rate limits, AI usage (Phase 10b)

| Var | Default | Prod guidance |
|-----|---------|---------------|
| `REDIS_ENABLED` | `true` | Master switch for rate-limit + idempotency fast-path + queues. |
| `REDIS_URL` | `redis://localhost:6379` | **Managed Redis URL.** |
| `RATE_LIMIT_ENABLED` | `true` | Keep on. |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | |
| `RATE_LIMIT_MAX` | `300` | Per authenticated principal / window. Tune to traffic. |
| `RATE_LIMIT_MAX_UNAUTH` | `30` | Tighter cap per IP for unauthenticated routes. |
| `AI_RATE_LIMIT_ENABLED` | `true` | |
| `AI_MAX_RUNS_PER_EMPLOYEE_PER_DAY` | `200` | Fallback when a policy sets none. |
| `AI_MAX_RUNS_PER_SCOPE_PER_DAY` | `1000` | Fallback when a policy sets none. |
| `QUEUE_WORKERS_ENABLED` | `true` | `true` on the worker process; `false` on web-only/migration. |

### Observability (Phase 10d)

| Var | Default | Prod guidance |
|-----|---------|---------------|
| `SENTRY_DSN` | — | Set to enable error reporting (lazy-loads `@sentry/node`). Unset ⇒ no-op sink. |

### Copilot / billing

| Var | Default | Prod guidance |
|-----|---------|---------------|
| `ANTHROPIC_API_KEY` | — | Required for Copilot. Server-only. |
| `COPILOT_PRIMARY_MODEL` | `claude-opus-4-8` | |
| `COPILOT_FALLBACK_MODEL` | `claude-sonnet-4-6` | |
| `BILLING_PROVIDER_SECRET` / `BILLING_WEBHOOK_SIGNING_SECRET` | — | Set when the billing provider is wired. |

### Web (`NEXT_PUBLIC_*` only — the web app must read nothing else)

| Var | Default |
|-----|---------|
| **`NEXT_PUBLIC_API_BASE_URL`** | `http://localhost:3001` |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — |

---

## 3. Migration order

Migrations are applied by `packages/database/src/migrate.ts`, which runs the Drizzle SQL
migrations **then** the post-migration SQL in a fixed order. Run the migration job (connected as
`DATABASE_MIGRATION_URL`, an owner/superuser) **before** rolling the app:

```bash
# from packages/database, with DATABASE_URL (or DATABASE_MIGRATION_URL) set
pnpm clean:apple                      # strip macOS ._* siblings if on exFAT (no-op elsewhere)
node --import tsx src/migrate.ts
```

`migrate.ts` applies, in order:

1. **Drizzle migrations** `migrations/0000_*.sql … 0012_*.sql` (idempotent; `IF NOT EXISTS`).
   - `0009` — auth sessions (Phase 10a). `0010` — AI policy run caps (10b). `0011` — Phase 10f-1/2.
   - `0012` — `webhook_endpoints` + `webhook_deliveries` (Phase 10f-4).
2. **`migrations/sql/zzz_grants.sql`** — creates the `edrion_app` role if missing, grants
   baseline DML, then **revokes UPDATE/DELETE/TRUNCATE** on the append-only tables
   (`audit_events`, `security_events`, `activity_events`, `webhook_deliveries`) and installs a
   `BEFORE UPDATE OR DELETE` trigger that hard-blocks mutation regardless of role.
3. **`migrations/sql/zzz_rls.sql`** — sets `edrion_app` `NOBYPASSRLS` and enables tenant-isolation
   RLS on `institutions`, `campuses`, `institution_users`, `subscriptions`, `invoices`,
   `webhook_endpoints`, keyed by the per-transaction `app.institution_id` GUC.

Both post-migration files are idempotent and safe to re-run.

**Fresh-DB bootstrap (0000→0012 + grants + RLS) is verified clean** by the migration job and by
`scripts/p10-smoke.sh` against a freshly seeded database.

---

## 4. The least-privilege application role (`edrion_app`)

The app must connect as a **non-superuser, `NOBYPASSRLS`** role so the append-only grants and RLS
policies actually bind. `zzz_grants.sql` creates a `NOLOGIN` placeholder for single-superuser dev;
in production, create a real login role and point `DATABASE_URL` at it:

```sql
-- run once as the database owner, then re-run the migration job so grants/RLS bind to it
CREATE ROLE edrion_app LOGIN PASSWORD '<strong-secret>' NOBYPASSRLS;
-- migrate.ts (zzz_grants.sql / zzz_rls.sql) then applies the grants, revokes and policies.
```

Verify after deploy:

```bash
psql "$DATABASE_URL" -f scripts/rls-proof.sql   # shows a scoped query returns only one institution
# append-only: an UPDATE on webhook_deliveries / audit_events must raise "is append-only"
```

The **service-role Supabase key never reaches the browser** — it lives only in the API env.

---

## 5. Redis & Sentry

- **Redis** backs rate limiting, the idempotency fast-path, and BullMQ queues. All three are
  fail-open: a Redis outage degrades gracefully (idempotency falls back to the durable
  `idempotency_keys` table; rate limiting is skipped). Set `REDIS_ENABLED=false` only to run
  fully without Redis (no queues — webhook delivery + maintenance then run inline/in-process).
- **Sentry** is enabled purely by setting `SENTRY_DSN`. With it unset, `createErrorReporter`
  returns a no-op sink that still logs captures. 5xx responses and client render crashes (via
  `/v1/observability/client-error`) are forwarded when the DSN is set.

---

## 6. Deploy sequence

1. Provision Postgres + Redis. Create the `edrion_app` login role (§4).
2. Run the **migration job** (`DATABASE_MIGRATION_URL`, owner) → applies 0000–0012 + grants + RLS.
3. (First deploy) run `pnpm db:seed` to load the permission catalogue, default roles, and the
   bootstrap owner. **Re-seed whenever the permission catalogue changes** — role membership is
   stored expanded in `platform_role_permissions`, so new keys (e.g. `integrations.*`) only reach
   existing roles after a re-seed.
4. Deploy the **worker process** (`QUEUE_WORKERS_ENABLED=true`).
5. Deploy the **API** (`QUEUE_WORKERS_ENABLED=false` if workers are separate) — `edrion_app` URL,
   `AUTH_DEV_*=false`, `SUPABASE_JWT_SECRET` set.
6. Deploy the **web** app with `NEXT_PUBLIC_API_BASE_URL` → public API origin.
7. Smoke: `API=https://… DATABASE_URL=… bash scripts/p10-smoke.sh` (point at the deployed API;
   the dev-header suites require `AUTH_DEV_HEADER`, so run those only against a staging instance —
   in production rely on `scripts/auth-smoke.sh` against the real Supabase login flow).

---

## 7. Rollback

- **App**: redeploy the previous image. The API is a stateless modular monolith; rolling back the
  process is sufficient. Session cookies remain valid (same `SESSION_COOKIE_SECRET`).
- **Database**: migrations are **forward-only and additive** (new tables/columns/indexes, `IF NOT
  EXISTS`), so a code rollback does not require a schema rollback — an older app simply ignores
  `0012`'s tables. Only roll the schema back if a migration is itself faulty; restore from the
  pre-migration snapshot taken by the migration job step.
- **Append-only safety**: `audit_events` / `security_events` / `activity_events` /
  `webhook_deliveries` cannot be UPDATE/DELETE-d by the app even during an incident — recovery is
  by restore, never by mutation.
- **Kill switches**: AI can be globally disabled (`ai.disable` → AI Control Centre kill switch)
  and individual webhook endpoints deactivated (`PATCH /v1/integrations/:id {active:false}`)
  without a deploy.

---

## 8. Post-deploy verification checklist

- [ ] `GET /v1/health` 200; `GET /v1/system/health` shows DB + Redis `ok` and queue depth.
- [ ] Real Supabase login issues a session cookie; `AUTH_DEV_*` are `false` (no `x-employee-email`
      bypass — confirm an unauthenticated request is `401`, not honoured).
- [ ] A sensitive action returns `RECENT_AUTH_REQUIRED` until re-auth.
- [ ] `scripts/rls-proof.sql` shows tenant isolation; an `UPDATE` on an append-only table raises.
- [ ] A test webhook delivery records a `webhook_deliveries` row with an `X-Edrion-Signature`.
- [ ] Sentry receiving events (if `SENTRY_DSN` set).
```
