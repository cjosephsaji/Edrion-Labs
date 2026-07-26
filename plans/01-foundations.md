# Plan 01 — Foundations & Identity

> Consumer: Cursor Composer 2.5. Execute top-to-bottom by the Build order (§8). All names, tables, and contracts come from `plans/00-overview.md` (“the Overview”). Design source: `Edrion Learn Portal Design/Edrion Learn.dc.html` (“the design file”) — find screens by `<sc-if value="{{ s<Flag> }}">` guard.

## 1. Objective & scope

Build everything the student portal stands on: the `apps/student-web` app shell with the full design-system port (tokens, fonts, three themes, persona tokens, motion), the student identity domain (institutional invitations + independent signup, sessions, guards, permission catalogue, tenancy), the generalized storage pipeline, the `learning_events` ledger, the exposure/surface registry foundation with the institution toggle UI, Settings in full, and the Home (`/home`) shell with the widgets servable at this stage.

**Out of scope** (later plans): all AI features and Learn screens (02); Library, Lab (04); Homework/Classes/Courses/Analytics/Calendar/Report cards/Exams and surface detail pages (03). Placeholder routes for those render the `sPh` placeholder screen.

## 2. Preconditions & contracts consumed

- Existing code only (no earlier student plans). Reuses, per Overview §3: `InstitutionAuthGuard`/`portal-session` mechanics, `PortalTenantInterceptor` pattern, `portal_invitations`, `OtpService`, `AttachmentStorageService` logic, `AUDIT_WRITER`, BullMQ `JobsService`, `InstitutionRateLimiter`, feature-flags engine + features API, permissions evaluate engine, design-tokens pipeline, parent-web PWA shell pattern, institution-web `ResourceManager`.
- Migrations begin at **0045** (repo currently at 0044 — verify with `ls packages/database/migrations | sort | tail -1` before starting; if the head moved, shift all numbers in this plan and later plans by the same offset and note it in the PR description).

## 3. Database changes

### Migration 0045 — student identity

```sql
-- 1. Link directory record to login account (mirrors teachers.institution_user_id)
ALTER TABLE students ADD COLUMN institution_user_id uuid REFERENCES institution_users(id);
CREATE UNIQUE INDEX students_institution_user_id_uq ON students(institution_user_id) WHERE institution_user_id IS NOT NULL;

-- 2. Independent auth columns (same names/semantics as institution_users)
ALTER TABLE independent_users
  ADD COLUMN password_hash text,
  ADD COLUMN activation_token_hash text,
  ADD COLUMN activation_token_expires_at timestamptz,
  ADD COLUMN password_reset_token_hash text,
  ADD COLUMN password_reset_expires_at timestamptz,
  ADD COLUMN activated_at timestamptz,
  ADD COLUMN last_login_at timestamptz,
  ADD COLUMN last_auth_at timestamptz,
  ADD COLUMN failed_login_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN locked_until timestamptz;

-- 3. Sessions for independent learners (portal_sessions minus institution columns)
CREATE TABLE independent_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  independent_user_id uuid NOT NULL REFERENCES independent_users(id),
  aal text NOT NULL DEFAULT 'aal1',
  last_auth_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_reason text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX independent_sessions_user_idx ON independent_sessions(independent_user_id);
CREATE INDEX independent_sessions_live_idx ON independent_sessions(revoked_at, expires_at);
```

Drizzle schema additions in `packages/database/src/schema/` follow the file-local conventions (new file `student-identity.ts` for `independent_sessions`; column additions in the existing `people.ts` / independent-users schema files).

### Migration 0046 — `learning_events` (append-only ledger)

```sql
CREATE TABLE learning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  -- subject (exactly one of the two identities is set)
  institution_id uuid REFERENCES institutions(id),
  campus_id uuid REFERENCES campuses(id),
  student_id uuid REFERENCES students(id),
  independent_user_id uuid REFERENCES independent_users(id),
  actor_kind text NOT NULL DEFAULT 'student',   -- 'student' | 'staff' | 'system'
  actor_id uuid,                                 -- institution_user/staff id when actor_kind='staff'
  event_type text NOT NULL,                      -- catalogue: Overview §6.3
  topic_key text,                                -- normalized topic slug when applicable
  subject_label text,                            -- display subject e.g. 'Mathematics'
  context_type text,                             -- 'session'|'homework'|'mock'|'debate'|'library'|...
  context_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,    -- validated by packages/schemas student/learning-events.ts
  request_id text,
  CONSTRAINT learning_events_subject_ck CHECK (
    (student_id IS NOT NULL AND independent_user_id IS NULL AND institution_id IS NOT NULL)
    OR (student_id IS NULL AND independent_user_id IS NOT NULL AND institution_id IS NULL)
  )
);
CREATE INDEX learning_events_student_time_idx ON learning_events(student_id, occurred_at DESC) WHERE student_id IS NOT NULL;
CREATE INDEX learning_events_indep_time_idx ON learning_events(independent_user_id, occurred_at DESC) WHERE independent_user_id IS NOT NULL;
CREATE INDEX learning_events_type_time_idx ON learning_events(event_type, occurred_at DESC);
CREATE INDEX learning_events_topic_idx ON learning_events(topic_key) WHERE topic_key IS NOT NULL;

-- Immutability: copy the existing audit_events trigger pattern verbatim
CREATE OR REPLACE FUNCTION learning_events_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'learning_events is append-only'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER learning_events_no_update BEFORE UPDATE OR DELETE ON learning_events
  FOR EACH ROW EXECUTE FUNCTION learning_events_immutable();
```

Also add `learning_events` to the revoke list in `packages/database/migrations/sql/zzz_grants.sql` (UPDATE/DELETE revoked) and add RLS policies in `zzz_rls.sql`:

```sql
-- tenant isolation (same GUC as portal) + student self-read
CREATE POLICY learning_events_tenant ON learning_events USING (
  (institution_id IS NOT NULL AND institution_id = current_setting('app.institution_id', true)::uuid)
  OR (independent_user_id IS NOT NULL AND independent_user_id = current_setting('app.independent_user_id', true)::uuid)
);
```

(Keep the file idempotent as the existing policies are; `app.independent_user_id` and `app.student_id` are new GUCs set by the student tenant interceptor, §4.2.)

### Migration 0047 — `storage_objects`

```sql
CREATE TABLE storage_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id),          -- null for independent-owned
  owner_student_id uuid REFERENCES students(id),
  owner_independent_user_id uuid REFERENCES independent_users(id),
  owner_staff_user_id uuid REFERENCES institution_users(id),-- teacher materials, report PDFs
  kind text NOT NULL,        -- 'library_upload'|'homework_answer'|'assignment_file'|'practice_photo'|'mock_answer'|'class_material'|'report_card_pdf'|'content_page_attachment'|'debate_exhibit'|'avatar'
  driver text NOT NULL,      -- 'local' | 'supabase'
  storage_key text NOT NULL, -- opaque, driver-scoped
  filename text,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  checksum_sha256 text,
  processing_status text NOT NULL DEFAULT 'uploaded',  -- uploaded|processing|ready|failed
  processing_error text,
  derived jsonb NOT NULL DEFAULT '{}'::jsonb,          -- {pages, extractedTextKey, thumbKey, width, height}
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);
CREATE INDEX storage_objects_inst_idx ON storage_objects(institution_id);
CREATE INDEX storage_objects_owner_student_idx ON storage_objects(owner_student_id);
CREATE INDEX storage_objects_owner_indep_idx ON storage_objects(owner_independent_user_id);
CREATE INDEX storage_objects_kind_idx ON storage_objects(kind);
```

RLS: tenant policy on `institution_id` OR independent owner GUC (same shape as `learning_events`).

### Migration 0048 — preferences, content pages, seeds

```sql
CREATE TABLE student_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid UNIQUE REFERENCES students(id),
  independent_user_id uuid UNIQUE REFERENCES independent_users(id),
  theme text NOT NULL DEFAULT 'standard',        -- standard|dim|dark
  match_system boolean NOT NULL DEFAULT false,
  text_size text NOT NULL DEFAULT 'M',           -- S|M|L
  reduced_motion boolean NOT NULL DEFAULT false,
  hint_generosity text NOT NULL DEFAULT 'balanced',  -- gentle|balanced|direct
  celebration text NOT NULL DEFAULT 'warm',      -- warm|calm
  weekly_goal integer NOT NULL DEFAULT 8,        -- 4..14
  quiet_hours jsonb,                             -- {start:'21:00', end:'07:00'} | null
  notif_session_reminders boolean NOT NULL DEFAULT true,
  notif_revision_due boolean NOT NULL DEFAULT true,
  notif_announcements boolean NOT NULL DEFAULT true,
  language text NOT NULL DEFAULT 'en',           -- en|hi|es|bn
  expert_mode boolean NOT NULL DEFAULT false,    -- independent only (Overview §5.11)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT student_preferences_subject_ck CHECK (
    (student_id IS NOT NULL) <> (independent_user_id IS NOT NULL)
  )
);

CREATE TABLE student_content_pages (        -- the generic exposure surface (Overview §5.6)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  campus_id uuid REFERENCES campuses(id),
  page_key text NOT NULL,                    -- slug, unique per institution
  title text NOT NULL,
  body_richtext jsonb NOT NULL DEFAULT '[]'::jsonb,   -- same rich-content shape announcements use
  attachment_ids jsonb NOT NULL DEFAULT '[]'::jsonb,  -- storage_objects.id[]
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,        -- {gradeLevelIds?:[], classIds?:[], all?:true}
  status text NOT NULL DEFAULT 'draft',                -- draft|published|archived
  published_at timestamptz,
  created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (institution_id, page_key)
);
```

Seed (same migration, idempotent inserts): feature definitions from Overview §6.5 into `feature_definitions` (module `student-portal`, `available_scopes: ['institution','campus','institutionUser']`, `default_value` per Overview); no role rows needed in DB — `STUDENT_BASE_ROLE` is a code-level role in the permissions package like other institution defaults, registered in `packages/permissions/src/institution/roles.ts` as key `student` with the student catalogue keys (Overview §6.4).

## 4. Backend

New module tree `apps/api/src/modules/student/` (registered in `app.module.ts`):

```
student/
  auth/        student-auth.controller.ts, student-auth.service.ts, student-session.service.ts,
               independent-signup.service.ts
  core/        student-auth.guard.ts, student-tenant.interceptor.ts, student-permissions.guard.ts,
               student.decorators.ts (@RequireStudentPermissions, @CurrentStudent), student-rate-limiter.ts
  me/          student-me.controller.ts, student-me.service.ts (also /preferences)
  home/        student-home.controller.ts, student-home.service.ts
  storage/     student-storage.controller.ts, student-storage.service.ts,
               drivers/local-disk.driver.ts, drivers/supabase.driver.ts, processing.processor.ts
  ledger/      learning-events.writer.ts (LEARNING_EVENTS_WRITER token), learning-events.repository.ts
  surfaces/    surfaces.service.ts (resolves flags), fees-summary.service.ts
```

### 4.1 Auth endpoints (`@Public()`, `@SkipRateLimit()` + per-IP OTP/lockout gates as in admissions-public)

| Method & path | Behavior |
|---|---|
| `POST /v1/student/auth/login` | body `{ identifier, password, institutionCode? }`. Identifier resolution: email match on `institution_users` (role `student`) → institutional; else email on `independent_users` → independent; else if `institutionCode` present, admission-number lookup (`students.admission_no` within the institution) → linked institution_user. Bcrypt verify, lockout counters (same thresholds/envs as portal: `AUTH_MAX_LOGINS`, `AUTH_LOCKOUT_SECONDS`), create session row, set `edrion_student_session` http-only cookie (HS256 JWT `{sid, uid, kind}`), audit `student.auth.login`. |
| `POST /v1/student/auth/logout` | revoke session row, clear cookie. |
| `POST /v1/student/auth/activate` | `{ token, password }` — token hash match on `institution_users` (invited student) **or** `independent_users`; sets password, stamps `activated_at`, auto-login. |
| `POST /v1/student/auth/request-reset` / `POST /v1/student/auth/reset` | mirror portal reset flow for both identity stores. |
| `POST /v1/student/auth/independent/signup` | `{ email, fullName, country }` → create/refresh `independent_users` row (status pending), send OTP via `OtpService` (new OtpTarget on independent_users; audit prefix `student.signup`). |
| `POST /v1/student/auth/independent/verify` | `{ email, code, password }` → verify OTP, set password + `activated_at`, create session, cookie. |

`StudentSessionService` fronts both session stores: `create(principalRef)`, `verify(jwt) → StudentPrincipal`, `revoke(sid)`. Session TTL and recent-auth envs identical to portal.

### 4.2 Guard chain

- `StudentAuthGuard`: reads `edrion_student_session` cookie → `StudentSessionService.verify` → loads principal (institutional: institution_user + linked `students` row + campus; independent: independent_user) → attaches `req.studentContext`. Rejects staff/parent principals (role must include `student` for institutional). Dev header escape hatch `x-student-email` gated by `STUDENT_AUTH_DEV_HEADER=true` (mirrors portal dev login; local dev only).
- `StudentTenantInterceptor`: when `studentContext` present, runs handler inside `runInInstitutionTenant(institutionId)` transaction (institutional) and additionally `SET LOCAL app.student_id = ...`; independent: transaction with `SET LOCAL app.independent_user_id = ...` only. Copy `PortalTenantInterceptor` structurally.
- `StudentPermissionsGuard`: metadata from `@RequireStudentPermissions(...keys)`; evaluate with the shared engine (`roleKeys: ['student']` + no direct grants v1); deny → 403 envelope via existing `AllExceptionsFilter`.
- `StudentRateLimiter`: per-principal Redis limiter (clone `InstitutionRateLimiter`, envs `STUDENT_RATE_LIMIT`, `STUDENT_RATE_WINDOW_SECONDS`).

### 4.3 `/me`, preferences, home, schedule, fees summary

- `GET /v1/student/me` → `StudentMeDto` (schema `packages/schemas/src/student/me.ts`):
  `{ kind, id, fullName, initial, institution?: {id, name, type}, campusId?, student?: {id, admissionNo, classId, className, gradeLevel, curriculumLabel}, permissions: string[], surfaces: Record<surfaceKey, boolean>, flags: {expertModeAvailable: boolean}, preferences: StudentPreferencesDto, persona: 'school'|'college'|'independent' }`.
  Persona derivation: independent → `independent`; else `institutions.type === 'college' || 'university'` → `college`; else `school`. Surfaces resolved through the feature-flag engine with context `{institutionId, campusId, institutionUserId}` for each `student.surface.*` definition (independent: all false; `student.portal` kill-switch false → 403 on everything but auth).
- `GET|PATCH /v1/student/preferences` → row from `student_preferences` (create-on-first-read with defaults). PATCH validates via Zod; permission `student.settings.manage`.
- `GET /v1/student/home` → `{ tiles: HomeTileDto[], learnBanner: {title, subtitle} }`. Tiles v1 (design `phTiles`, `sPortal` screen): institutional → `[continue_learning (stub link to /learn until Plan 02 replaces content), homework|assignments count (Plan 03 — omit until then; tile hidden when API returns null), today (from timetable)]`; independent → `[continue_learning stub, weekly goal counts from ledger, library stub]`. The endpoint returns only tiles it can serve truthfully — **no invented numbers**; the frontend renders whatever arrives.
- `GET /v1/student/schedule/today` → institutional only: `timetable_slots` for the student's `class_id` for today's `day_of_week` → `{ time, title (subject + teacher), room }[]`.
- `GET /v1/student/surfaces/fees/summary` (permission `student.surface.fees.view`, flag-gated): `{ outstandingMinor, dueSoon: {invoiceNo, dueDate, amountMinor}[], currency }` from `fee_invoices` where `student_id = principal.studentId` and status in (pending, partial, overdue).

### 4.4 Storage

- `POST /v1/student/uploads?kind=<kind>&filename=<name>` — raw binary body (reuse the `readRawBody` pattern), validates size/type per kind matrix (Overview §5.3), stores via driver, inserts `storage_objects` (status `uploaded`), enqueues `imports` job `student-storage.process` → processor sets `processing/ready/failed`, fills `derived` (images: dimensions + EXIF strip + thumbnail; PDFs: page count; text extraction deferred to Plan 02 usage). Returns `StorageObjectDto`.
- `GET /v1/student/files/:id` — ownership check (owner or same-institution staff via portal guard variant later), streams via driver or 302 to signed URL (supabase driver).
- Envs: `STUDENT_STORAGE_DRIVER` (`local` default), `STUDENT_STORAGE_DIR` (local), `SUPABASE_STORAGE_BUCKET_STUDENT`, `STUDENT_UPLOAD_MAX_BYTES_IMAGE=15728640`, `STUDENT_UPLOAD_MAX_BYTES_DOC=41943040`.

### 4.5 Ledger writer

`LearningEventsWriter.log(input: LearningEventInput)`: validates `event_type` + payload against the schema map, stamps subject columns from the principal (or explicit staff actor), inserts. Never throws into the request path (log-and-report on failure, like audit writer). Exposed via DI token `LEARNING_EVENTS_WRITER`. Plan 01 writes no student-facing events yet except `session.*` none — **but** wire it and cover with a unit test using a synthetic event so Plans 02–04 only call it.

### 4.6 Institution-web-facing endpoints (in existing portal module space)

- `POST /v1/portal/students/:id/portal-invite` (`@RequireInstitutionPermissions('student_portal.manage')`): body `{ targetEmail?: string, guardianParentId?: string }` — exactly one. Creates `institution_users` row (role `student`, status invited, email = target or synthesized alias per Overview §5.1), links `students.institution_user_id`, writes `portal_invitations`, sends activation email (guardian variant wording when guardian-mediated), audit `student_portal.invite`.
- `POST /v1/portal/students/portal-invite/bulk`: `{ classId }` — same per enrolled student without a linked account; response `{ invited, skipped }`.
- `DELETE /v1/portal/students/:id/portal-access`: suspend the linked institution_user (status `suspended`), revoke sessions, audit.
- Surface toggles: no new endpoints — institution-web writes `feature_assignments` through the **existing** features API; add permission `student_portal.manage` checks in the UI layer.
- New staff permission keys registered in `packages/permissions/src/institution/catalogue.ts`: `student_portal.manage` (group "Student portal"). (Other staff keys arrive in Plan 03 per Overview §6.4.)

### 4.7 Audit & events

Every mutating endpoint writes an audit event (module `student-auth`/`student-storage`/`student-portal`), matching existing envelope fields. Rate limits: auth endpoints additionally capped per-IP (reuse OTP service caps for signup; login per-IP limiter `STUDENT_LOGIN_IP_RPM=20`).

## 5. Frontend — `apps/student-web`

### 5.1 Scaffold

- Copy the shape of `apps/parent-web` (package.json scripts with `-p 3005`, `next.config.mjs` with `transpilePackages` for `@edrion/ui,@edrion/schemas,@edrion/shared-types,@edrion/permissions,@edrion/design-tokens`, tsconfig extending `@edrion/tsconfig/nextjs.json`, tailwind config with `presets: [preset]` + student content globs, PWA `manifest.webmanifest` + `sw.js` + `RegisterSW`).
- `gen:tokens` predev/prebuild script like institution-web, emitting `src/styles/tokens.css` **including the student theme blocks** (§5.2).
- Env: `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:3001`), `NEXT_PUBLIC_DEV_STUDENT_USER` (dev header identity, e.g. `ananya@greenfield.edu`).
- `src/lib/student-client.tsx`: `StudentClient` class modeled on `PortalClient` — typed `get/post/patch/del`, `credentials:'include'`, dev header `x-student-email` when configured, `upload(kind, file)` doing the raw-binary POST, `fileUrl(id)`, and `sse(path, handlers)` helper (EventSource wrapper) for Plan 02. Provider + `useStudentClient()`.
- TanStack Query provider identical to institution-web defaults. Hooks this plan: `useStudentMe()`, `usePreferences()` (+mutation), `useHomeTiles()`, `useTodaySchedule()`, `useFeesSummary()`.

### 5.2 Design-system port (tokens & motion)

- `packages/design-tokens/src/student.ts`: export `studentThemes: Record<'standard'|'dim'|'dark', Record<TokenName,string>>` using the token table in Overview §2.2 (complete the two `derive` cells: selection dim `#2E4A3C`, dark `#2F5443`), plus `studentFonts`, `studentRadii`, and `studentKeyframes` (the ten keyframes, exact CSS from the design helmet — copy verbatim).
- `generateTokenCss()` gains an optional student section emitting:
  ```css
  [data-student-theme='standard'] { --st-page:#F3F0E7; --st-card:#FFFFFF; ... }
  [data-student-theme='dim'] { ... } [data-student-theme='dark'] { ... }
  ```
- `tooling/tailwind/preset.ts`: add `st-*` color mappings (`st-page: var(--st-page)` …), the ten keyframes/animations (`animate-block-in`, `animate-fade-up`, `animate-pop-in`, `animate-soft-pulse`, `animate-burst`, `animate-slide-in-drawer`, `animate-sheet-in`, `animate-dot-bounce`, plus reuse existing shimmer/fade), and font families `font-display` (Source Serif 4), `font-body` (Instrument Sans), `font-mono-ui` (IBM Plex Mono). Fonts loaded via `next/font/google` in the root layout (same three families/weight ranges as the design helmet).
- `ThemeProvider` (`src/lib/theme.tsx`): owns `theme` + `matchSystem`; sets `data-student-theme` on `<html>` (resolving `matchSystem` via `prefers-color-scheme`, live-updating on media-query change — port `effectiveTheme()` logic from the design's x-dc script); persists optimistically to localStorage (`edrion-student-theme`) and to `PATCH /preferences`. Also sets `data-persona` (from `/me`) and `data-reduced-motion` + text-size class (`text-size-s|m|l` scaling the root font 15/16/17px).

### 5.3 App shell (design: pre-guard markup a.k.a. `shell`, plus `sPh` chunk for placeholder/toast)

Component tree:
```
AppShell
├─ SideNav (≥921px)            — 238px, bg st-surface2; logo block "E / Edrion / STUDENT PORTAL";
│   groups: [Home, Learn✦, Library, The Lab] · [<YOUR SCHOOL|YOUR COLLEGE> group label,
│   Homework|Assignments, Classes|Courses, Analytics, Calendar]  (institutional only, Hard Rule 4)
│   · [YOU: History, Achievements, Settings]; active item: color st-accentDeep, bg rgba(12,63,49,.1);
│   account card at bottom: initial-avatar + name + sub (class/curriculum or 'Independent learner')
│   + Log out. (The design's persona-switch button and DEMO footer are prototype-only — omit.)
├─ MobileNav (≤920px)          — bottom tab bar (parent-web AppShell pattern): Home, Learn, Library,
│   Lab, More (More sheet lists remaining items incl. institutional group when applicable).
│   Sticky top bar: logo + screen title + avatar → menu (Settings, Log out).
├─ <main> scroll container (ref for scroll-to-top on nav, port `go()` behavior)
├─ Toast (bottom center, 3.6s auto-dismiss, `useToast()` — port `say()`)
└─ route content
```
Nav labels via a `useStudentTerm()` mini-hook mapping persona → `{hw: 'Homework'|'Assignments', unitP: 'Classes'|'Courses', instLabel: 'YOUR SCHOOL'|'YOUR COLLEGE'}` (port of the `T` map). Nav item visibility: institutional group only when `me.kind==='institutional'`; surface-driven items (Fees etc.) appear under the institutional group when `me.surfaces[key]` is true — this plan renders them as items routing to `sPh`-style placeholders except Fees summary widget on Home; Plan 03 replaces with real pages. Exams item hidden until Plan 03.

States: loading (full-page `Skeleton` shimmer), unauthenticated (redirect `/login`), kill-switch/suspended (403 screen with support copy), error boundary (reuse institution-web pattern).

### 5.4 Auth screens (no prototype screen — build from public-web funnel anatomy + student tokens; keep to the design language: serif display headings, ivory page, emerald primary buttons)

- `/login`: identifier + password; secondary link "Use admission number" reveals institution-code + admission-no fields; errors inline; lockout message verbatim from API.
- `/activate?token=`: set password (+confirm), then auto-enter.
- `/reset`, `/reset/confirm`: standard.
- `/welcome` (independent signup): email + name + country → OTP step (6-digit input, resend cooldown UI driven by API) → password → into app. Reuse `Input`, `Button`, `FieldError` from `@edrion/ui`.

### 5.5 Home — route `/home` (design screen `sPortal`, label "Portal home")

Replicate: eyebrow date line ("TUESDAY 16 JUNE" → real date via `Intl`), serif greeting "Hi {firstName}.", sub-line "Everything lives here — but the learning happens in **Learn**.", 3-tile row (`HomeTileDto[]` — eyebrow k, title t, meta m, click → route), and the wide Learn banner card ("LEARN · POWERED BY PETROS ✦ / What are we doing today? / Open Learn →" → `/learn` placeholder this plan). Tiles render only what the API returns (schedule tile from `/schedule/today` first slot; fees mini-tile when the fees surface is on and summary has data). All other Home enhancements land with their owning plans.

### 5.6 Settings — route `/settings` (design screen `sSettings`) — **complete in this plan**

Left section rail (mobile: horizontal chips): Appearance · Profile · Learning · Notifications · School/Institution (institutional only) · Privacy · Account — exactly the design's `setSecs` including order and conditional.

- **Appearance**: three `ThemeCard`s (mini-preview swatches from theme palette, name/desc/✓ ring per design), Match-system toggle, Reduce-motion toggle, Text size S/M/L segmented control. All wired to `ThemeProvider` + preferences PATCH; theme switch is **live**.
- **Profile**: avatar initial + name + sub; Interface language chips (English, हिन्दी, Español, বাংলা) with helper copy from design; non-`en` selection persists but UI notes "Translations coming soon — Petros will teach in your language" (i18n scaffolding: `useT()` reads `src/i18n/en.ts`; all Settings strings go through it as the seed catalog). Grade/year + curriculum shown read-only for institutional ("Set by your school"); editable for independent.
- **Learning**: hint generosity chips Gentle/Balanced/Direct + helper line; Celebrations Warm/Calm + helper; Weekly goal range slider 4–14 with live "{n} topics" and the "target, not a treadmill" line; Quiet hours (two time selects, optional).
- **Notifications**: the three toggles with design labels/descriptions (third label persona-dependent) + "No guilt notifications, ever." footer.
- **School/Institution** (institutional): LINKED ACCOUNT card (institution name, managed-by line), "Petros on graded work" governance display card — value from institution settings default (read-only, "set by your {Classes|Courses} — you can't loosen it"); Unlink button → info toast (admin-only action). Data here reads `/me` + a small `GET /v1/student/surfaces/governance-default` added in Plan 03 — until then render the card with "Set by your school" and the institution default `off` copy.
- **Privacy**: the THEY-SEE/never-see list exactly as designed (institutional); independent variant: "Independent learners share nothing with anyone…" line.
- **Account**: Export my data (calls `POST /v1/student/account/export` → v1 = enqueue `exports` job that emails a JSON dump of the student's rows; endpoint included in this plan) and Delete account (confirm dialog with typed confirmation; `POST /v1/student/account/delete-request` → marks request, 14-day grace copy; actual deletion job is an ops runbook item, endpoint records the request + audit).

### 5.7 Placeholder + global chrome

`PlaceholderScreen` (design `sPh`): icon, `{title}`, copy "Part of the full student portal…" adjusted: "This section arrives with a later phase." + button "Go to Learn". Used by all not-yet-built routes. `Toast` per design (dark ink pill, bottom). The Ask-Petros floating tab and completion overlay in the `sPh` chunk belong to Plan 02 — do not build here.

## 6. AI work

None in this plan (Hard: no AI features in Plan 01).

## 7. Institution-web additions

1. **Students directory** (`apps/institution-web` students page): row action + detail-panel button "Invite to student portal" (visible with `student_portal.manage`): dialog choosing Student email / Guardian (select from linked guardians) → calls invite endpoint; badge column `Portal: Active|Invited|—`. Bulk: toolbar action "Invite class to portal" (class picker → bulk endpoint → result toast). Revoke access action on linked students (confirm dialog).
2. **Settings → Student portal** (new settings page, gated `student_portal.manage`): master toggle (`student.portal` assignment at institution scope) + one row per surface from the registry (Fees, Transport, Hostel, Documents, Content pages, Exams) each with institution-scope toggle writing `feature_assignments` via the existing features API client; per-campus override select where multi-campus. Copy: "What students can see. Off means absent — students never see a disabled stub."
3. **Content pages** (`/student-pages` route, `ResourceManager` over `student_content_pages` via a `PortalCrudEngine` config): columns pageKey/title/status/updated; drawer form fields title, page_key (slug), rich body (reuse the announcements editor component), attachments (upload via existing portal upload seam → `storage_objects` with kind `content_page_attachment`), audience (all / grade levels / classes pickers), status. Publish action.

## 8. Build order (each milestone ends with verification; do not proceed on red)

1. **Tokens & scaffold** — design-tokens student namespace + preset + `apps/student-web` scaffold with shell rendering static nav and theme switching against localStorage only.
   *Verify*: `pnpm --filter @edrion/student-web dev` on :3005; toggle three themes + match-system; `pnpm typecheck` clean.
2. **Migrations 0045–0048** + Drizzle schemas + RLS/grants updates.
   *Verify*: `pnpm --filter @edrion/database migrate` from empty DB completes; `psql` insert+update on `learning_events` → update rejected by trigger.
3. **Auth vertical** — session service, guards, login/logout/activate/reset, independent signup with OTP, `/me`.
   *Verify*: curl smoke — institutional invite (seed via next milestone or SQL), activate, login, `/me` returns persona+permissions; independent signup end-to-end with mailhog/dev SMTP; wrong-password ×N → lockout; staff account rejected by student login.
4. **Invitations (institution-web + API)** — invite endpoints + UI.
   *Verify*: invite a seeded student from the UI, receive email (dev SMTP), activate, log into student-web.
5. **Storage vertical** — drivers, upload/download endpoints, processing job, `storage_objects`.
   *Verify*: upload jpeg + pdf via curl; rows reach `ready` with derived fields; path-traversal attempt 400; oversize 413.
6. **Ledger** — writer + repository + unit tests (schema validation, subject stamping, append-only).
   *Verify*: `pnpm --filter api test -- learning-events`.
7. **Surface registry + fees summary + Settings + Home + preferences** — everything remaining, both apps.
   *Verify*: flip Fees toggle in institution-web → fees tile/nav appears for a student with invoices (seed one) and disappears when off; independent user sees no institutional nav (inspect DOM, not CSS); Settings round-trips every preference; export request enqueues job.
8. **Smoke script** — `scripts/student-p1-smoke.sh` covering milestones 3–7 (target ≥30 assertions, follow `scripts/portal-*-smoke.sh` style).
   *Acceptance checklist*: all verifications green; `pnpm typecheck && pnpm lint` clean; every mutating endpoint audited; no console errors on the four built routes across three themes at 375px and 1280px widths.

## 9. Anti-goals

- Do **not** build any AI/Learn feature, drawer, or session UI.
- Do not create a second permissions/flags/session system — compose the existing engines.
- Do not put student theme tokens app-local — they live in `packages/design-tokens`.
- Do not render institutional nav items disabled for independent users — absent means absent.
- Do not add mastery bars/percentages anywhere (incl. Home tiles).
- Do not use multer or add new upload libraries — raw-binary pattern only.
- Do not touch parent-web, super-admin-web behavior, or existing portal auth flows.
- Do not invent numbers for Home tiles — omit a tile rather than fake it.

## 10. Escalations

- If `portal_sessions` verify path proves too staff-coupled to front cleanly, escalate before forking a `student_sessions` table (Overview decision §5.1 prefers reuse).
- If synthesized-alias emails conflict with any email-uniqueness constraint on `institution_users`, surface it — do not silently relax the constraint.
- Supabase Storage credentials absent in env → ship local driver only and note it; do not stub a fake supabase driver.

## Contracts exposed (to Plans 02–04)

Everything in Overview §6 rows for Plan 01, concretely: `StudentPrincipal` + guard chain + `@RequireStudentPermissions`; `edrion_student_session` cookie; `LEARNING_EVENTS_WRITER` + event schema map; `StudentStorageService` + `storage_objects` + upload/file endpoints; `student_preferences` (hint generosity, celebration, weekly goal, language, expert_mode); surface resolution in `/me`; `StudentClient` (+`sse` helper) and shell/toast/theme/persona providers; `PlaceholderScreen`; i18n `useT()`; institution-web Student-portal settings page and invite flow.
