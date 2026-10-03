# Development

## Prerequisites

- Node ≥ 20 (repo pins 20 via `.nvmrc`; tested on 25)
- pnpm 11
- PostgreSQL 15+ (local container or Supabase project)
- Redis (optional for the current slice; needed for queues/rate-limit later)

## First run

```bash
pnpm install
cp .env.example .env          # fill DATABASE_URL, SESSION_COOKIE_SECRET at minimum
pnpm db:generate              # (only if you changed schema) regenerate SQL migrations
pnpm db:migrate               # apply migrations + append-only grants
pnpm db:seed                  # roles, permissions, owner employee, sample institutions
pnpm dev                      # api on :3007, web on :3000
```

- API docs (Swagger/OpenAPI): http://localhost:3007/docs
- Web app: http://localhost:3000 (redirects to `/dashboard`)
- Health: http://localhost:3007/v1/health

A quick local Postgres:

```bash
docker run --name edrion-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=edrion -p 5432:5432 -d postgres:16
# then set DATABASE_URL=postgres://postgres:postgres@localhost:5432/edrion
```

## Auth (Phase 10a)

The production path is real: the browser authenticates with Supabase Auth (password + MFA),
obtains an access token, and `POST /v1/auth/login` verifies it (HS256 against
`SUPABASE_JWT_SECRET`), maps `sub` → `platform_employees.auth_user_id`, enforces MFA (`aal2`
for enrolled employees), and issues an **API-owned session**: a row in `auth_sessions` plus an
HTTP-only cookie (`SESSION_COOKIE_NAME`) carrying an API-signed JWT (`SESSION_COOKIE_SECRET`).
Every later request validates that cookie against the live session row — revocation and the
recent-auth window (`auth_sessions.last_auth_at`) are server-authoritative.

- **MFA**: an `mfaEnrolled` employee presenting an `aal1` token is rejected (`MFA_REQUIRED`).
- **Recent auth**: sensitive actions still require a re-auth within `RECENT_AUTH_WINDOW_SECONDS`.
  `POST /v1/auth/reauth` (a fresh `aal2` token) stamps the session's `last_auth_at` — this is
  what `PermissionsGuard` reads, so the 9e `RECENT_AUTH_REQUIRED` affordance is a real re-auth.
- **Revocation + lockout**: `POST /v1/auth/logout` revokes the session;
  `AUTH_MAX_FAILED_LOGINS` failed MFA logins within `AUTH_LOCKOUT_SECONDS` lock the account.

The permission set is always loaded authoritatively from the DB — never from the client.

### Dev escape hatches (off by default, never in production)

Both are env-gated so local tooling and the existing curl smoke keep working without a hosted
Supabase instance. Set them in your local `.env`:

- `AUTH_DEV_HEADER=true` — honour the legacy `x-employee-email` header as identity (no cookie).
  The web app sends `NEXT_PUBLIC_DEV_EMPLOYEE` (default `owner@edrion.dev`). When no header is
  sent the guard still falls through to the cookie path, so unauthenticated requests are 401.
- `AUTH_DEV_LOGIN=true` — allow `POST /v1/auth/login` with `{ email }` (no Supabase token),
  minting a real server session so the login + recent-auth flow is exercisable locally.

To exercise the real cookie flow locally without Supabase, mint a Supabase-shaped HS256 token
with `SUPABASE_JWT_SECRET` and post it to `/v1/auth/login` (see the seeded owner's
`auth_user_id`). Reproducible full-coverage smoke (401 / MFA / identical perms / recent-auth /
reauth / revoke / lockout): `bash scripts/auth-smoke.sh` (API on :3007, DB seeded).

## Useful commands

```bash
pnpm typecheck                # tsc --noEmit across all projects
pnpm test                     # vitest across all packages
pnpm lint
pnpm build                    # turbo build (web + api)
pnpm --filter @edrion/database studio   # Drizzle Studio
pnpm clean:apple              # remove macOS AppleDouble ._* files (see note below)
```

## Working on an exFAT / network volume (macOS)

This repo was developed on an exFAT volume, which has no native extended-attribute support,
so macOS writes an AppleDouble `._*` sibling next to **every** file. These are harmless but
trip esbuild/drizzle-kit directory scans. Mitigations are built in:

- tsconfig, ESLint and Vitest all exclude `**/._*`.
- `db:generate` pre-cleans `migrations/` before running.
- `pnpm clean:apple` removes them on demand.

On a normal APFS volume none of this is needed.

## Module conventions

When adding an API domain, follow `apps/api/src/modules/institutions/` exactly:
controller (HTTP only) → service (logic + audit) → repository (typed SQL). Gate every
handler with `@RequirePermissions(...)`; write an audit event for every mutation through the
injected `AuditWriter`; never write to `audit_events`/`security_events` directly. Share
validation by importing the Zod schema from `@edrion/schemas` (the same schema the frontend
form uses).

## Petros visual workspace verification

`PETROS_WORKSPACE_ENABLED` defaults to false. The v2 declarative engine uses registered
trusted models; generated executable extensions remain disabled. Workspace forecasts are
exploratory receipts, while independently reviewed assessments retain the existing evidence
owner. See `docs/PETROS-PHASE-3-VERIFICATION-RESULTS.md` for the exact acceptance boundary.

The synthetic browser server starts private PostgreSQL and Redis, applies the migration
journal and app-role grants, and boots the real AppModule with controlled providers. It
clears inherited application credentials and does not load the root `.env`. Its fixtures
are engineering authority only. Requires local PostgreSQL binaries, Redis and Chrome:

```bash
pnpm --filter @edrion/api exec ts-node src/modules/integrations/petros-phase3-browser-server.ts
env PETROS_ISOLATED_VERIFICATION=1 NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3407 NEXT_PUBLIC_DEV_STUDENT_EMAIL= NEXT_PUBLIC_DEV_STUDENT_USER= pnpm --filter @edrion/student-web exec next dev -p 3411 -H 127.0.0.1
pnpm --filter @edrion/api exec node src/modules/integrations/petros-phase3-browser-journey.mjs
```

Run the journey against a fresh server fixture. The temporary cookie metadata is private
and must not be copied into reports. SIGTERM closes that server and removes its disposable
services. Verification Next output has separate ignored build/dev directories, so it does
not overwrite an existing portal's development manifests. Database tests use
`PETROS_LOCAL_DB_TESTS=1`; never point these fixtures at a shared database or protected dump.
