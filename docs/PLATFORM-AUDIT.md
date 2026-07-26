# Edrion Platform — Frontend/UX & ERP-Completeness Audit

_Date: 2026-07-02 · Scope: `apps/institution-web` (tenant ERP), with references to `apps/api`, `apps/public-web`, `apps/super-admin-web` and shared `packages/*`._

## Method & honesty note

This is an **architecture-level audit with representative page sampling**, not a click-through of all ~60 routes. Findings marked **[verified]** are backed by code (path cited); findings marked **[sampled]** were checked on 2–4 representative pages and should be confirmed per-page during implementation; **[gap]** means a module/route/workflow is absent. Severity: **P0** (broken/critical) → **P3** (polish).

The platform is, overall, **well-architected and largely real** — not a mock. Nav is permission-gated (98 permission keys), ~40 API modules map cleanly to routes, list pages share a `ResourceManager` scaffold (search + sort + view-details + versioned CRUD + per-action permissions), and a grep for `Math.random`/`mock`/`lorem`/`dummy` rendered in the tenant app found **none** — data is fetched, not faked. The gaps below are mostly **missing modules and thin workflows**, not fake UI.

### Already shipped in this session (context for the plan)
- **Country → currency** derived from the maintained `world-countries` dataset in `@edrion/schemas/geo` (`currencyForCountry`, `CURRENCY_OPTIONS`, `currencyLabel`), re-exported from `@edrion/ui`. Verified: vitest 4/4.
- **Settings rebuilt** into Profile / Preferences / Administration. New tenant-facing `GET|PUT /v1/portal/settings/profile` edits the `institutions` row (identity, location, primary contact); currency is auto-derived from country and shown **read-only**; currency + timezone are mirrored into the settings registry so the whole app resolves one source of truth. Verified: schemas/api/ui/institution-web typecheck clean; route registered live.

---

## 1. Critical issues (P0)

| # | Finding | Evidence | Impact |
|---|---------|----------|--------|
| C1 | **No parent/guardian-facing application.** Parents exist only as records under People (`parents.view`); there is no app, login, or workflow for a parent to apply for admission. The four apps are `api`, `institution-web`, `public-web`, `super-admin-web` — none is parent-facing. | `apps/` listing; `nav.ts` People group | The headline request (parent admission) has **no foundation** today. |
| C2 | **Admissions is a thin staff-only CRUD.** `admission_application` stores name/dob/contact/`gradeLevelId`/guardian/status only. No documents, fee, interview/exam scheduling, info-request, notifications, offer-accept, or academic-year/programme selection. Status set is `applied → accepted/rejected/waitlisted/withdrawn → enrolled`. | `apps/api/src/modules/portal/admissions.service.ts` | The "complete admission workflow" is ~15% present. |
| C3 | **`/campuses` is nav-listed but has no page** → renders the "coming soon" catch-all, despite a `campuses` API + `campuses.view` permission existing. Multi-campus is core ERP. | `nav.ts:176`; missing `app/(app)/campuses/page.tsx`; catch-all `app/(app)/[...module]/page.tsx` | Admins can switch campus scope but cannot **manage** campuses. |
| C4 | **Live auth is off in dev (`PORTAL_AUTH_DEV_HEADER=false`) and seed state is uncertain** (greenwood may be wiped). No authenticated end-to-end smoke is currently runnable without flipping env + reseeding. | `.env` | Blocks live verification of any new tenant feature. |

## 2. Missing features (ERP-completeness gaps) (P1)

- **[gap] Parent portal / guardian self-service** — apply, track status, upload docs, pay fees, accept offer, view child's attendance/fees/report cards. (C1)
- **[gap] Documents & policies module** — no route/module for institutional documents, handbooks, consent forms, or policy acknowledgement. User asked for it explicitly.
- **[gap] Campus management UI** — API exists, page does not. (C3)
- **[gap] Tenant-visible billing & subscription** — `billing`/`commercial` schema + plans exist platform-side (`super-admin-web`, `GET /v1/registration/plans`), but the institution admin has **no** page to view their plan, invoices from Edrion, or payment method.
- **[gap] Integrations module (tenant-facing)** — `integrations` schema exists; no tenant page to connect SMS/email/payment/SSO providers.
- **[gap] Real notifications delivery** — `emailNotifications`/`smsNotifications` settings toggles exist, and there is a `notifications` module, but there is no evidence of a real SMS provider or delivery-status surface for parents.
- **[gap] Real payment gateway** — fees/invoices/payments are internal ledger records (migration 0017); no Stripe/Razorpay checkout. Needed for application fees and fee collection.
- **[gap] File/document upload** — no S3/multer/storage mechanism found; admissions/docs will need one.
- **[partial] Report cards / transcripts** — gradebook + exams exist; a formal report-card/transcript generator was not found.

## 3. Incomplete / disconnected workflows (P1)

- **Admissions → Enrolment** exists (`enrol` bridge creates a student) but the **front half is missing**: no application intake by parents, no document checklist, no fee gate, no decision notifications, no offer acceptance step before `enrol`. (C2)
- **Notifications bridges** exist (announcements → notify), but **admissions events do not emit notifications** (no "application received / info requested / interview scheduled / decision" messages).
- **Settings ↔ modules** — before this session, currency/timezone were free-text settings disconnected from the `institutions` row. Now connected via the profile mirror; **verify all consumers read the settings, not the enum column.**
- **Campus scope** is enforced in APIs, but with no campus-management page, creating/retiring a campus has no tenant UI path.

## 4. UI & UX problems (P2)

- **[sampled] List filtering is search-only.** `ResourceManager` provides free-text search + sort + view-details, but **no column filters and no bulk-select/bulk-actions**. Admissions especially needs status/grade/date filters and bulk decisions. `components/academics/resource-manager.tsx`
- **[sampled] Pagination present in params but confirm UI controls** render on long lists (`ListParams` carries `page`).
- **[verified] Settings was 3 cards** of a much larger registry; now expanded to 8 categories + Profile + Administration links. Confirm no consumer relied on the old 3-only meta.
- **[sampled] Consistency** is generally strong (shared `Card`/`DataTable`/`DetailPanel`/`states`), but per-module forms vary; validation-error display should be audited page-by-page.
- **Empty/loading/error states** — shared `EmptyState`/`ErrorState`/`Skeleton` exist and are used on sampled pages; confirm every list uses all three (not just loading).

## 5. Role-specific issues (P2)

- **[verified] 98 permission keys**, roles are permission-gated at nav render and re-checked server-side — solid RBAC foundation. `packages/permissions/src/institution/catalogue.ts`
- **[gap] No parent role** in the tenant RBAC (parents are subjects, not principals). A parent-application system needs either a distinct lightweight parent principal or a public token flow. (Decision below.)
- **[sampled] Read-vs-manage split** exists (`.view` vs `.manage`); confirm view-only users see disabled controls (Settings now does this via `canManage`), not hidden data.

## 6. Mobile responsiveness (P2/P3)

- **[sampled] Responsive grids** are used (`md:`/`xl:` breakpoints on dashboard, settings). 
- **[verify] Sidebar** — confirm it collapses to a drawer on mobile (`components/app-shell/sidebar.tsx`).
- **[verify] DataTable** — wide tables need horizontal scroll / priority columns on small screens.

## 7. Accessibility (P2/P3)

- **[sampled] Good baseline** — labels via `Label`, `aria-current` on active nav, keyboard-focusable controls, `PermissionDenied` states.
- **[verify] Focus-visible** rings on custom controls (pill tabs, link cards), dialog focus-trap in `ConfirmDialog`/`DetailPanel`, and `prefers-reduced-motion` on the `page-enter` animation.
- **[verify] Form errors** announced (`aria-describedby`/`role="alert"`) — the new Settings save-error uses text; wire it to `aria-live`.

## 8. Recommended improvements

1. Add **bulk-select + column filters** to `ResourceManager` once — every list benefits (admissions, students, fees…).
2. Introduce a **file-upload service** (signed URLs) as shared infra — admissions docs, logos, documents module all need it.
3. Introduce a **payment-gateway seam** (`PaymentProvider` interface, stub now) — application fees + fee collection drop in later with keys.
4. Add a **notifications emitter** on admissions state changes, reusing the existing notify bridge.
5. Build the **tenant billing** and **documents/policies** pages to close ERP gaps.
6. Turn on `PORTAL_AUTH_DEV_HEADER` + a reliable seed for a repeatable authenticated smoke.

## 9. Priority summary

| Priority | Items |
|---|---|
| **P0** | C1 parent app foundation, C2 admissions workflow, C3 campuses page, C4 dev-auth/seed |
| **P1** | Documents module, tenant billing, integrations, payment seam, upload service, notifications-on-admissions |
| **P2** | Bulk/filters in ResourceManager, per-page validation/empty-state sweep, parent-role RBAC, mobile sidebar/table verify |
| **P3** | Focus-visible/reduced-motion polish, aria-live errors, consistency nits |

## 10. Phased implementation plan

**Phase A — Foundations (unblocks everything) [DONE / in progress]**
- ✅ Country→currency in geo; Settings rebuild (Profile/Preferences/Administration) with derived read-only currency.
- Turn on dev-header auth + seed a known institution admin for smokes (C4).

**Phase B — Shared infra for admissions**
- File-upload service (signed URLs) in `@edrion/*` + API.
- `PaymentProvider` seam (stub "mark paid" now; gateway later).
- Notifications emitter helper reused across modules.

**Phase C — Admissions workflow (the big one)** — see design + decision below.
- Data model migration: applications gain academic-year/campus/programme, documents, fee, decision events, interview/exam slots, offer, info-requests.
- Parent intake funnel + parent principal/token.
- Admin review: filter/search/assign/decision/waitlist/info-request/schedule/notes/offer, then existing `enrol` bridge.

**Phase D — Close ERP gaps**
- Campuses management page (C3).
- Documents & policies module.
- Tenant billing/subscription page; integrations page.

**Phase E — Cross-cutting UX**
- Bulk-select + column filters in `ResourceManager`.
- Accessibility + mobile verification sweep.

---

## Admissions design (Phase C detail) & the one decision needed

**Target model additions** (new migration, following the portal table+RLS convention): `admission_applications` gains `academic_year_id`, `campus_id` (already), `programme_id`/`course_id`, `applied_grade_id`; new child tables `admission_documents` (needs upload service), `admission_events` (status history + interview/exam/info-request), `admission_offers`, and an `application_fee` link to the fees ledger. Reuse the existing `enrol` bridge for offer-accept → student.

**Parent authentication — the fork I need your call on.** Options:

- **(Recommended) Public funnel in `apps/public-web` + lightweight parent account**, mirroring the existing OTP-verified, server-draft + resume-token registration funnel already there (migration 0024 pattern). Lowest new surface, reuses proven infra, keeps the tenant app staff-only.
- **New `apps/parent-web`** — a full parent portal (apply + ongoing: attendance, fees, report cards). Biggest build; best long-term parent experience.
- **Parent route-group inside `institution-web`** — fastest to wire, but mixes public/parent traffic into the staff app (auth + scope complications). Not recommended.

I defaulted to the first for planning. Confirm or redirect before Phase C begins.
