# Permissions

Granular permission keys are the only authorisation primitive. Roles are bags of keys; no
code branches on a role name. The catalogue lives in
[`packages/permissions/src/catalogue.ts`](../packages/permissions/src/catalogue.ts) and is
the source of truth (mirrored into `platform_permissions`). Default roles are in
[`roles.ts`](../packages/permissions/src/roles.ts).

For role-by-role notes across both the platform control plane and institution portal, see
[`ROLE-PERMISSION-DEEP-DIVE.md`](./ROLE-PERMISSION-DEEP-DIVE.md).

## Evaluation (deterministic, pure)

`evaluatePermissions({ roleKeys, directGrants, directDenies }, roleDefs)`:

1. Union the permissions of all assigned roles.
2. Add `directGrants`.
3. Remove `directDenies` (**deny always wins**).
4. The Platform Owner wildcard `*` grants everything (a deny cannot remove it).

`can(set, key)`, `canAll`, `canAny`, `expandEffectiveKeys` are the checks. The same function
is authoritative in the API guard and mirrored to the client for UI gating only.

## Enforcement layers (all required)

| Layer | Mechanism |
|-------|-----------|
| Sidebar / route | nav item filtered by `permission`; pages render a permission-denied state |
| Action / button | rendered conditionally on the effective set |
| **API endpoint** | `@RequirePermissions(...)` → `PermissionsGuard` (authoritative) |
| **Service** | services assume the guard ran; sensitive paths re-derive context |
| Database | append-only grants + RLS tenant isolation (Phase 10c, `zzz_rls.sql`) under a least-privilege role |

Hiding a button is never sufficient — the API guard is the boundary.

## Sensitive permissions + recent auth

Permissions marked `sensitive` (suspend, archive, override pricing, manage permissions,
support access, kill switches, …) additionally require **recent authentication**
(`RECENT_AUTH_WINDOW_SECONDS`, default 900s) enforced by `PermissionsGuard`. A handler can
also force this with `@RequireRecentAuth()`.

Since Phase 10a this is a **real re-auth flow**: `PermissionsGuard` reads the active session's
`last_auth_at` (from `auth_sessions`), stamped at login and refreshed by `POST /auth/reauth`
(a fresh `aal2` token). A blocked action returns `RECENT_AUTH_REQUIRED`; the client re-auths
and retries. The guard itself is unchanged — only the source of `lastAuthAt` is now the
server session rather than a placeholder.

## Catalogue (groups)

`platform.dashboard.*` · `institutions.*` (view/create/update/activate/restrict/suspend/
archive/access_portal) · `campuses.*` (view/create/update/activate/suspend/configure_billing)
· `institution_users.*` · `independent_users.*` · `employees.*` · `plans.*` ·
`subscriptions.*` · `features.*` (manage_global/plan/institution/campus/user) · `support.*` ·
`audit.*` · `security.*` · `ai.*` (view/configure/approve_sensitive_action/disable) ·
`platform_settings.*`. The full list with descriptions and the `sensitive` flag is the
exported `PERMISSIONS` array.

## Default roles

Platform Owner (`*`), Super Administrator, Institution Onboarding Specialist, Customer
Support Administrator, Customer Success Manager, Finance and Billing Administrator, Technical
Operations Administrator, Security and Compliance Administrator, Product and Feature
Administrator, AI Safety Administrator, Read-only Auditor. A compile-time assertion
(`AssertRolePermissionKeys`) fails the build if a role references an unknown key.
