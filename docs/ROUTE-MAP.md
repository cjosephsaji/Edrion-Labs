# Route map — super-admin-web

App Router structure. Every route group sits behind auth + permission gates. The permission
in brackets is the minimum required to see the nav item and load the page; finer actions
have their own permissions (see [PERMISSIONS.md](PERMISSIONS.md)). Routes the employee lacks
permission for are hidden in the sidebar and return a permission-denied state if reached
directly.

```
/(auth)
  /login
  /mfa
  /forgot-password
  /reset-password

/(app)                                        app shell: sidebar + topnav + copilot dock
  /                          → /dashboard

  ── Overview ────────────────────────────────
  /dashboard                                  [platform.dashboard.view]
  /copilot                                    [platform.dashboard.view]
  /pending-actions                            [platform.dashboard.view]
  /activity                                   [audit.view]
  /analytics                                  [platform.dashboard.view]

  ── Customers ───────────────────────────────
  /institutions                               [institutions.view]
  /institutions/new                           [institutions.create]
  /institutions/[id]                          [institutions.view]
    ?tab=overview|campuses|users|subscription|billing|features|usage|
         support|access-sessions|activity|audit|security|notes|settings
  /campuses                                   [campuses.view]
  /campuses/[id]                              [campuses.view]
  /institution-users                          [institution_users.view]
  /institution-users/[id]                     [institution_users.view]
  /onboarding                                 [institutions.view]

  ── Individual Product ──────────────────────
  /independent-users                          [independent_users.view]
  /independent-users/[id]                     [independent_users.view]
  /individual-subscriptions                   [subscriptions.view]
  /individual-usage                           [independent_users.view]

  ── Edrion Team ─────────────────────────────
  /employees                                  [employees.view]
  /employees/[id]                             [employees.view]
  /platform-roles                             [employees.view]
  /access-reviews                             [security.view]

  ── Commercial ──────────────────────────────
  /plans                                      [plans.view]
  /plans/[id]                                 [plans.view]
  /subscriptions                              [subscriptions.view]
  /subscriptions/[id]                         [subscriptions.view]
  /campus-addons                              [campuses.view]
  /invoices                                   [subscriptions.view]
  /credits-discounts                          [subscriptions.view]
  /usage-limits                               [subscriptions.view]

  ── Product Control ─────────────────────────
  /features                                   [features.view]
  /features/[key]                             [features.view]
  /entitlements                               [features.view]
  /releases                                   [features.view]
  /experiments                                [features.view]

  ── Support & Operations ────────────────────
  /support                                    [support.view]
  /support/[id]                               [support.view]
  /access-sessions                            [support.view]
  /incidents                                  [support.view]
  /jobs                                       [platform_settings.view]
  /system-health                              [platform_settings.view]
  /integrations                               [platform_settings.view]
  /webhooks                                   [platform_settings.view]

  ── Communication ───────────────────────────
  /announcements                              [platform_settings.view]
  /institution-communications                 [platform_settings.view]
  /notification-delivery                      [platform_settings.view]

  ── AI Administration ───────────────────────
  /ai                                         [ai.view]
  /ai/petros-routing                          [ai.view; writes require ai.configure]
  /ai/petros-institutional                    [ai.view; aggregate-only audited view]
  /ai/policies                                [ai.configure]
  /ai/guardrails                              [ai.configure]
  /ai/usage                                   [ai.view]
  /ai/audit                                   [ai.view]
  /ai/prompts                                 [ai.configure]

  ── Administration ──────────────────────────
  /settings                                   [platform_settings.view]
  /security                                   [security.view]
  /audit                                      [audit.view]
  /data-management                            [platform_settings.manage]
```

## Support-mode overlay

When an employee starts an Edrion Support Access Session for an institution, the app renders
a persistent banner (employee identity + institution + countdown + "all actions recorded")
above the shell. The session id + reason ride on every API request via headers and are
written into each audit event. Ending or expiry tears down the banner and the session.

## API base paths (apps/api)

REST, versioned under `/v1`, documented at `/docs` (OpenAPI). One controller prefix per
module, e.g. `/v1/institutions`, `/v1/campuses`, `/v1/institution-users`,
`/v1/independent-users`, `/v1/employees`, `/v1/platform-roles`, `/v1/plans`,
`/v1/subscriptions`, `/v1/billing`, `/v1/features`, `/v1/support`, `/v1/support-access`,
`/v1/activity`, `/v1/audit`, `/v1/security`, `/v1/analytics`, `/v1/copilot`,
`/v1/ai-governance`, `/v1/announcements`, `/v1/integrations`, `/v1/webhooks`,
`/v1/platform-settings`. Aggregated dashboard data: `/v1/analytics/dashboard`.

Institution Portal: `/v1/portal/*`. Parent Portal: `/v1/parent/*` (guardian-scoped) and
`/v1/parent-staff/*` (staff counterparts) — see [PARENT-PORTAL.md](PARENT-PORTAL.md) §8.
```

## Petros Stage 12 cross-app routes

| App | Route | Guard/boundary |
| --- | --- | --- |
| Institution web | `/settings/petros-policy` | `petros.policy.view`; mutations require manage/publish/rollback permissions and explicit confirmation |
| Institution web | `/petros-support` | Assigned teacher/class/subject scope; privacy-safe handoffs and thresholded signals |
| Institution guardian shell | `/family/more/petros-digest` | Linked-guardian scope only |
| Student web | `/petros/session?session=…` | Owner-scoped session; stable institution disclosure and optional handoff |
| Super Admin | `/ai/petros-institutional` | `ai.view`, aggregate-only, audited |
| Super Admin | `/ai/petros-routing` | Stage 12 function contracts under `ai.view`; writes require `ai.configure` |

API prefixes are `/v1/portal/petros/institutional`, `/v1/student/petros/institutional`,
`/v1/parent/petros`, and `/v1/petros-institutional`. Delivery processing is normally owned by the
tracked `petros.institutional.delivery` job; the operations endpoint is permission- and recent-auth-gated.

---

## Parent Portal — apps/parent-web (:3004)

Mobile-first installable PWA. Bottom tabs; guardianship-scoped (no permission nav gating). Full
route + screen detail in [PARENT-PORTAL.md](PARENT-PORTAL.md) §7.

```
/                                     Home — dashboard for the active child
/ward                                 → /child/[first]
/child/[studentId]                    Ward hub
  /attendance  /results  /health  /behavior  /transport  /library  /hostel  /pickup  /documents
/fees                                 Unified fees + pay flow (webhook-confirmed)
/inbox                                Alerts · Notices · Messages · Consents (+ emergency banner)
/more                                 PTM · Calendar · New message · Document/Profile requests
  /settings                           Channels · digest · quiet hours
  /who-can-see                        Static "what we show / never show" explainer
/invite/[token]                       (planned) onboarding
```
