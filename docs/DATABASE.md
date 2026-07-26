# Database

PostgreSQL via Drizzle ORM. Schema in [`packages/database/src/schema`](../packages/database/src/schema),
generated SQL in `packages/database/migrations`. Conventions: UUID PKs (`defaultRandom`),
UTC `timestamptz`, explicit FKs + indexes, integer **minor units** for money, `version`
column for optimistic concurrency on sensitive tables, `created_by`/`updated_by`, JSONB only
for genuinely flexible metadata, append-only audit/security/activity.

## Implemented tables (22 — `pnpm db:generate` output)

**Platform identity**: platform_employees, platform_roles, platform_permissions,
platform_role_permissions, employee_role_assignments, employee_permission_overrides

**Tenancy**: institutions, campuses, institution_users, institution_user_roles,
campus_user_access, independent_users

**Commercial**: plans, plan_versions, subscriptions, subscription_addons

**Append-only records**: audit_events, security_events, activity_events

**Support**: support_cases, support_messages, support_access_sessions

## Designed for later phases (in ARCHITECTURE §6, added as built)

institution_memberships, institution_permission_overrides, plan_entitlements,
campus_billing_items, invoices, invoice_items, payments, refunds, credits, discounts,
usage_metrics, feature_definitions, feature_assignments, feature_rollouts, ai_policies,
ai_action_rules, ai_runs, ai_tool_calls, ai_confirmations, ai_approvals, notifications,
announcements, announcement_audiences, delivery_events, integrations, webhook_endpoints,
webhook_deliveries, background_jobs, platform_incidents.

## Append-only enforcement

`migrations/sql/zzz_grants.sql` (applied after Drizzle migrations) revokes UPDATE/DELETE on
audit/security/activity from the app role and installs a blocking trigger. See
[AUDIT.md](AUDIT.md).

## Row-Level Security — tenant isolation (Phase 10c)

`migrations/sql/zzz_rls.sql` enables RLS on the institution-scoped tables (`institutions`,
`campuses`, `institution_users`, `subscriptions`, `invoices`). Each has a policy that filters by
a per-transaction GUC `app.institution_id`: unset/empty ⇒ all rows (the normal platform-wide
employee view, already authorised by the API guard); set ⇒ only that institution's rows, for
both reads and writes. The app connects as the non-superuser, `NOBYPASSRLS` role `edrion_app`,
so the policies bind to it; a migration/superuser connection (dev) bypasses RLS, so local
behaviour is unchanged.

This is **defence-in-depth, layered under the API permission guard — never instead of it**. The
app sets the scope via `withInstitutionScope(db, institutionId, fn)` (`src/client.ts`), which
runs `fn` in a transaction with a transaction-local `set_config`, so the scope never leaks back
to the pooled connection. Proof: `psql "$DATABASE_URL" -f scripts/rls-proof.sql` shows a query
as `edrion_app` returns only the scoped institution and blocks the others.

## Migrations

```bash
pnpm db:generate   # schema → SQL (offline). Pre-cleans macOS ._* files first.
pnpm db:migrate    # apply migrations + post-migration SQL (grants/triggers)
pnpm db:seed       # idempotent dev dataset
```

## Performance notes (Phase 9a)

- **Pagination.** The high-volume streams (`audit_events`, `activity_events`, `ai_runs`) use
  **keyset/cursor** pagination, never `OFFSET`: audit/activity on `(occurred_at, id)` (composite
  `<` predicate, `occurred_at` indexed), AI runs on `started_at`. Bounded directories
  (institutions, campuses, plans, subscriptions, users, billing, features, AI policies) use
  page/size offset — acceptable because the result set is small and the page count is low.
- **Indexes.** Filter/sort columns on the hot paths are indexed: `audit_events(occurred_at,
  module, institution_id, actor, support_session_id, correlation_id)`, `ai_runs(employee_id,
  status, started_at)`, `ai_tool_calls/ai_confirmations/ai_approvals(run_id)`. Migration **0008**
  adds a **partial** index `audit_ai_run_idx` on `audit_events(ai_run_id) WHERE ai_run_id IS NOT
  NULL` — copilot run-detail loads a run's audit events by `ai_run_id` on every view; EXPLAIN
  showed a seq scan before, an index scan after. Partial keeps it small (most audit rows are not
  AI-involved).
- **Guardrail evaluation (N+1 fix).** A Copilot run evaluates every prepared tool call against
  the same policy/rule set. `AiGovernanceService.loadEvaluationContext()` loads policies + rules
  **once** per run; `evaluateWith()` is a pure in-loop evaluation. An N-tool run went from `2·N`
  policy/rule queries to `2` (create) + `2` (confirm). Results are identical — the per-call
  `evaluate()` still exists for the one-shot explainer endpoint.
- **Frontend cache.** One `QueryClient` (staleTime 30s, no refetch-on-focus, retry 1). Offset
  list hooks set `placeholderData: (prev) => prev` so a page/filter change doesn't flash empty;
  cursor streams use `useInfiniteQuery`.
