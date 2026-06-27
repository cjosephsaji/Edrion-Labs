# Edrion Super Admin Platform

Internal control plane for Edrion — the AI learning platform + school/college ERP. Edrion
employees use this to manage institutions, campuses, institutional & independent users,
subscriptions, billing, platform features, support access, audit, security and AI
governance.

> Not a mockup. Real frontend + backend, security and audit as a foundation, designed to
> grow. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Stack

- **Monorepo**: pnpm workspaces + Turborepo, strict TypeScript, shared lint/format.
- **Frontend** (`apps/super-admin-web`): Next.js App Router, Tailwind, shadcn/Radix, Motion,
  TanStack Query + Table, React Hook Form + Zod, Recharts, Lucide.
- **Backend** (`apps/api`): NestJS modular monolith, REST + OpenAPI, Drizzle ORM, Zod
  validation.
- **Infra**: Supabase (Postgres/Auth/Storage/Realtime), Redis, background jobs, Sentry.

## Quick start

```bash
pnpm install
cp .env.example .env        # fill DATABASE_URL + SESSION_COOKIE_SECRET at minimum
pnpm db:migrate             # apply migrations (through 0008) + append-only grants
pnpm db:seed                # roles, permissions, owner employee, sample data
pnpm dev                    # api on :3001, web on :3000
```

Verify a change:

```bash
pnpm -r typecheck           # tsc --noEmit across all projects
pnpm -r test                # vitest across all packages
pnpm build                  # turbo build (web + api)
```

- API docs (OpenAPI/Swagger): http://localhost:3001/docs
- Dev auth: until Supabase sessions are wired, the API resolves the employee from an
  `x-employee-email` header (the web app sends `owner@edrion.dev`). Permissions are still
  loaded authoritatively from the DB — only the identity shortcut is dev-only.
- Local smoke: `DISABLE_SUPPORT_SWEEP=1 pnpm --filter @edrion/api dev`, then
  `curl -H 'x-employee-email: owner@edrion.dev' http://localhost:3001/v1/institutions`.

## Layout

```
apps/        super-admin-web (Next.js), api (NestJS)
packages/    design-tokens, ui, schemas, shared-types, permissions, database,
             auth, audit, feature-flags, api-client, copilot, observability, config
tooling/     eslint, typescript, tailwind
docs/        architecture, permissions, audit, feature-resolution, support-access, AI
```

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Permissions](docs/PERMISSIONS.md)
- [Database + performance notes](docs/DATABASE.md)
- [Audit events](docs/AUDIT.md)
- [Feature resolution](docs/FEATURE-RESOLUTION.md)
- [Support access](docs/SUPPORT-ACCESS.md)
- [AI guardrails](docs/AI-GUARDRAILS.md)
- [Route map](docs/ROUTE-MAP.md)
- [Development](docs/DEVELOPMENT.md)

## Non-negotiables

Independent and institutional users never merge. An institutional user belongs to one
institution but may manage many of its campuses. Additional campuses are chargeable. The
AI performs no state change without explicit human confirmation. Employee access to
institution portals is always identified, time-boxed and audited. Audit records are
append-only. Backend checks never relax because the UI hid a button.
