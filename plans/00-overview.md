# Edrion Student Portal — Master Overview (Plan 00)

> **Audience**: Cursor Composer 2.5 and human reviewers. This document is the single source of truth for cross-plan contracts, architecture decisions, and design traceability. Plans 01–04 reference this file; nothing in a plan may contradict it. Where a plan needs an interface, table name, event type, or component name, it is defined **here** — plans never invent names.

---

## 1. What is being built

A production student portal for the Edrion monorepo, in three variants sharing one codebase and one design system:

| Variant | Who | Auth origin | Sees institutional sections? |
|---|---|---|---|
| **School** | Institutional student (e.g. Ananya, Class 8 CBSE) | Provisioned/invited by institution | Yes: Homework, Classes, Analytics, Calendar, Exams (flag-gated), exposure surfaces |
| **College** | Institutional student (e.g. Priya, 2nd-year CE) | Provisioned/invited by institution | Yes: Assignments, Courses, Analytics, Calendar, Exams (flag-gated), exposure surfaces |
| **Independent** | Self-signed-up learner (e.g. Dev) | Direct signup | **No** — institutional items are absent from navigation, never disabled |

Deliverables across four plans:

- **Plan 01 — Foundations & Identity**: `apps/student-web` scaffold + design-system port, student identity domain (institutional + independent), storage pipeline, `learning_events` ledger, exposure/surface registry foundation, Settings, Home shell.
- **Plan 02 — The Learn Engine (Petros)**: Learn schema, AI orchestration module, Learn home + intent router, guided session canvas, Concept/Practice workspaces, Quick Answer, learning paths, revision, Ask Petros drawer, streaks/goals, Petros Notes, History (partial).
- **Plan 03 — The Institutional Bridge**: Homework end-to-end, Classes (school), Courses (college), college Assignments, Report cards & grades, institution Exams section, Calendar, Analytics, exposure surfaces v1 — each with its teacher/admin counterpart in `institution-web`.
- **Plan 04 — Library, Lab & the You Layer**: Library (`knowledge_items`), Visual Studio, Mock Exams, Debate, Achievements, History completion, final integration pass.

Strict sequencing: each plan depends only on earlier plans' **Contracts exposed**.

---

## 2. The design source of truth

**Folder**: `Edrion Learn Portal Design/` at the monorepo root.
**Note**: the original brief referenced `Edrion-Learn-ui/`; the folder that actually ships is `Edrion Learn Portal Design/`. Same artifact, different name. All plans reference the real folder.

**Format**: a Claude Design export — one interactive prototype, not per-screen files:

- `Edrion Learn.dc.html` — **the design source**. Contains (a) a `<helmet>` block with fonts + global CSS (keyframes, theme overrides), (b) the full markup for every screen inside `<sc-if value="{{ s<ScreenFlag> }}">` guards with inline styles, (c) a `<script type="text/x-dc">` Component class holding all state, derived values, sample data, and microcopy.
- `Edrion Learn - standalone.html` — self-contained bundle (fonts embedded). Same app.
- `screens/*.png` — two dark-theme reference screenshots.

**How Cursor consumes it**: every frontend section in Plans 01–04 maps a route to a **screen key** (the `s<Name>` guard) and its `data-screen-label`. Open `Edrion Learn.dc.html`, find `<sc-if value="{{ sSession }}">` (etc.), and replicate the markup/styling one-to-one, converting inline hex colors to the token variables defined in Plan 01. The `text/x-dc` script is the behavioral spec: derived flags, interaction handlers, and microcopy live there.

### 2.1 Screen inventory (28 screens + shell)

| Screen key | data-screen-label | Route in student-web | Built in |
|---|---|---|---|
| shell (pre-guard markup) | — | app shell: sidebar, mobile nav, persona/theme plumbing | **01** |
| `sPortal` | Portal home | `/home` | **01** (shell + tiles), enriched in 03/04 |
| `sSettings` | Settings | `/settings` | **01** |
| `sPh` | Placeholder | generic placeholder + Ask-Petros tab + completion overlay + toast (global chrome in same chunk) | **01** (placeholder/toast), 02 (drawer/overlay) |
| `sHome` | Learn home | `/learn` | **02** |
| `sSession` | Guided session canvas | `/learn/session/[id]` | **02** |
| `sConcept` | Concept workspace | `/learn/session/[id]/concept/[blockId]` | **02** |
| `sPractice` | Practice workspace | `/learn/session/[id]/practice/[blockId]` and `/learn/practice/[setId]` | **02** |
| `sPath` | Learning path | `/learn/path` | **02** |
| `sQuick` | Quick answer | `/learn/quick/[id]` | **02** |
| `sProgress` | Analytics | `/progress` | **03** (the whole screen ships in 03; its ledger-only widgets consume Plan 02's events) |
| `sCalendar` | Calendar | `/calendar` | **03** |
| `sAssignments` | Assignments | `/homework` (school) · `/assignments` (college) | **03** |
| `sAwork` | Assignment work | `/homework/[id]` · `/assignments/[id]` | **03** |
| `sClasses` | Classes | `/classes` (school) · `/courses` (college list reuses anatomy) | **03** |
| `sClassDetail` | Class detail | `/classes/[id]` · `/courses/[id]` (college adds tabs — see §5.9) | **03** |
| `sLibrary` | Library | `/library` | **04** |
| `sLibItem` | Library item | `/library/[id]` | **04** |
| `sCards` | Flashcards | `/library/decks/[id]` | **04** |
| `sLab` | The Lab | `/lab` | **04** |
| `sVisual` | Visual Studio | `/lab/visual` | **04** |
| `sExSetup` | Exam prep setup | `/lab/mock-exams/new` | **04** |
| `sMockExam` | Mock exam | `/lab/mock-exams/[id]` | **04** |
| `sMockResults` | Mock exam results | `/lab/mock-exams/[id]/results` | **04** |
| `sDebate` | Debate setup | `/lab/debate` | **04** |
| `sDebateLobby` | Debate lobby | `/lab/debate/[id]/lobby` | **04** |
| `sDebateRoom` | Debate room | `/lab/debate/[id]` | **04** |
| `sHistory` | History | `/history` | **02** (structure + sessions/quick/practice), **04** (mock/debate entries, final) |
| `sAchieve` | Achievements | `/achievements` | **04** |

Screens that exist in the product spec but **not** in the prototype (designed from the established language, specified in the owning plan): Report cards (`/report-cards`, Plan 03), institution Exams section (`/exams`, Plan 03), Courses tabs beyond Announcements/Materials (Plan 03), exposure surfaces (`/fees`, `/transport`, `/hostel`, `/documents`, `/pages/[key]`, Plans 01+03), Revision queue page (`/learn/revision`, Plan 02 — anatomy from `sHome` rusty strip + `sProgress` revision health), independent signup/login/onboarding (`/welcome`, `/login`, Plan 01 — anatomy from public-web funnel + student tokens).

**Nothing in the prototype is dropped.** The persona switcher and "DEMO" footer in the shell are prototype-only affordances and are replaced by the real account section; everything else ships.

### 2.2 Token set (extracted from source — Plan 01 ports these into `packages/design-tokens`)

**Fonts** (Google Fonts, helmet): `Source Serif 4` (display/serif headings), `Instrument Sans` (body/UI), `IBM Plex Mono` (eyebrows, mono labels, timers).

**Three themes** (exact palettes from `themeCards` in the x-dc script):

| Token | Ivory (`standard`) | Dim (`dim`) | Ink (`dark`) |
|---|---|---|---|
| `page` | `#F3F0E7` | `#221E18` | `#14110D` |
| `card` | `#FFFFFF` | `#302A23` | `#221D17` |
| `cardAlt` (`#FBFAF4` in light) | `#FBFAF4` | `#2A251E` | `#1B1710` |
| `surface2` (F8F5EC/F5F2E8/EFEBDD family) | `#F5F2E8` | `#2C271F` | `#251F18` |
| `bd1` (borders E6E2D4/EEEADD/E0DBC9 family) | `#E6E2D4` | `#443D33` | `#332C22` |
| `ink` (primary text) | `#17251F` | `#ECE7DC` | `#EDE7DB` |
| `inkSoft` (#43514A/#3A463F) | `#43514A` | `#CEC7BB` | `#CBC4B7` |
| `muted` (#55645C) | `#55645C` | `#A9A296` | `#A49D91` |
| `faint` (#8A968F) | `#8A968F` | `#938C80` | `#8B8478` |
| `accent` (emerald) | `#1E7A5E` | `#48B78C` | `#5FCB9E` |
| `accentDeep` | `#0C3F31` | `#48B78C` | `#5FCB9E` |
| `accentSoft` (bg #E3EFE8/#EAF2ED) | `#E3EFE8` | `#22392F` | `#183328` |
| `amber` (AI accent #B9741F/#8F5716) | `#B9741F` | `#D79E54` | `#E3A758` |
| `amberSoft` (#FCF6EB/#F7F1DE) | `#FCF6EB` | `#3A3120` | `#2E2413` |
| `danger` (#A8472B/#8A3B22) | `#A8472B` | (keep, raise luminance +1 step) | (same) |
| `dangerSoft` (#F6E6DF/#FBEFEA) | `#F6E6DF` | `#3C2822` | `#331E17` |
| `violet` (#5B4A78) / `violetSoft` (#EFEAF5) | `#5B4A78` / `#EFEAF5` | `#2E2838` | `#251E30` |
| `blue` (#3A5A78) / `blueSoft` (#E3EAF1) | `#3A5A78` / `#E3EAF1` | `#243038` | `#1A2632` |
| `gold` (#8A7440/#6E5B2E) | `#8A7440` | `#C6A76A` | `#CBAC6D` |
| selection | `#CFE4D6` | derive | derive |

Semantic domain colors (light): success `#14614B`; freshness Fresh `#14614B`/`#E3EFE8`, Fading `#8A7440`/`#F7F1DE`, Due `#A8472B`/`#F6E6DF`; heatmap scale `['#EFEBDD','#CDE3D5','#93C4AB','#4E9E7C','#1E7A5E']`; history kind colors (Sessions `#14614B`, Quick `#B9741F`, Practice `#5B4A78`, Mock `#A8472B`, Debate `#2E6B7A`).

**Keyframes** (exact, from helmet — port verbatim): `blockIn` (16px rise + 0.988 scale, overshoot at 70%), `fadeUp`, `popIn`, `softPulse` (emerald ring pulse), `shimmer`, `blink`, `burst` (celebration particles via `--tx/--ty`), `slideIn` (drawer, 26px), `sheetIn` (bottom sheet, 36px), `dotBounce` (typing dots). `prefers-reduced-motion` collapses all to 0.01ms (already in helmet; keep, and also honor the in-app "Reduce motion" setting by setting `data-reduced-motion` on `<html>`).

**Radii observed**: 8/10/12/14/16/18px card family; pills `999px`. **Sidebar**: 238px wide, `#F8F5EC` bg (light). **Drawer**: fixed right 372px (desktop) / bottom sheet 72vh with `18px 18px 0 0` radius (narrow). **Narrow breakpoint**: `max-width: 920px`.

**Theme mechanism decision**: the prototype themes via `[data-theme] [style*="background: rgb(...)"]` attribute-selector overrides (works only for inline styles). **Production uses CSS custom properties**: Plan 01 defines the three theme maps above as CSS vars under `[data-student-theme='standard'|'dim'|'dark']`, extending the existing `packages/design-tokens → gen:tokens → CSS vars → tailwind preset` pipeline. No attribute-selector hacks.

**Persona-adaptive tokens**: `data-persona="school|college|independent"` on `<html>`; drives celebration intensity (school gets `burst` particles + 🎉 copy, college/independent get quiet check), microcopy register (see §2.3), density (college analytics adds per-course tables; layout identical). Personas are tokens/labels — **never layout forks** (Hard Rule 6).

### 2.3 Behavioral/microcopy invariants captured from the prototype

These are load-bearing copy and behavior; keep them (adapted per persona via the `T` nomenclature map in the x-dc script — `Classes/Courses`, `Teacher/Professor`, `Homework/Assignments`, `Marks/Grades`):

- Weekly goal: "**counts, not scores**"; streak card "streak · no pressure"; goal slider 4–14 topics, "A target, not a treadmill — missing it changes nothing."
- Session spine: "Each step completes on **evidence** — an answer, a solve, or an explain-back. Never on scrolling." Skip-ahead: "I know this — test me instead ↓". Footer: "Petros shapes what comes next from how this goes — the rest of the session isn't written yet."
- Checkpoint: MCQ wrong-answer messages are diagnostic per-option; explain-back alternative ("Prefer to explain it back in your own words instead?") counts as evidence.
- Hint ladder: three rungs "each a little more help. **Never the answer**"; "Using hints isn't cheating…"
- Quick answer: "QUICK ANSWER — NOT A LESSON" / "You asked a question; you got an answer. No lesson attached — that's a promise."
- Drawer: "A side conversation — your lesson stays put"; "Ephemeral by default — pin anything worth keeping"; context chip "Asking about: {block}".
- Governance pill: `Petros: full help` / `Petros: concept help only` / `Petros: off during assignments` with drawer note "…set by your school/department."
- Analytics: "Every number here traces back to something you actually did. No mastery scores…" Every stat card has a `FROM <source>` line. Transparency panel "THEY SEE / THEY NEVER SEE" (never-see list includes "Any AI mastery scores — there are none").
- Mock results: "Counts, not scores. What matters is the pattern underneath." Real counts (`14 of 20`), qualitative notes.
- Debate feedback: "No score, no winner banner…"; friend mode "coaches both debaters evenly."
- Achievements: "Every badge names what you actually did — tap one to see why. Never for spending money or logging in." Comeback badge exists ("Back for more").
- History: "Completed sessions reopen read-only — your original answers stay exactly as they were."
- Notifications: "No guilt notifications, ever."
- Account: export ("Everything you've made is yours") + delete with **14-day grace period**.
- Empty calendar days: "Quiet days aren't empty — they're good days to get ahead or revisit something."

---

## 3. Verified codebase facts (exploration results — plans rely on these)

Monorepo: pnpm + Turborepo. Apps: `api` (NestJS modular monolith, :3001), `super-admin-web` (:3000), `institution-web` (:3002), `public-web` (:3003), `parent-web` (:3004, mobile-first PWA). **student-web takes :3005.** Next.js 14.2 App Router everywhere; workspace packages ship TS source via `transpilePackages`.

**Brief's "known facts", verified**:
1. ✅ Students are directory records only (`students` table; no auth linkage, no student sessions/app). `teachers.institution_user_id` is the existing precedent for directory-record→login-account linkage.
2. ❌ **Correction**: file upload is *not* stubbed. `apps/api/src/modules/portal/attachment-storage.service.ts` is a real local-disk store (institution-scoped opaque keys, path-traversal guard, raw-binary upload endpoints reading `req` into a Buffer — no multer) with an interface designed for S3/Supabase swap (`save/stream/size/remove`). Plan 01 **generalizes this seam** (adds a driver interface, Supabase Storage driver, processing-state records); it does not build storage from zero.
3. ✅ Petros tables are chat-shaped (`petros_conversations/messages/pending_turns/artifacts`, manual tool loop on OpenAI Responses API with confirmation lifecycle). The session/block canvas needs **new tables** (Plan 02) — Petros tables are not reused for Learn.
4. ✅ Stripe unwired; fees are manual ledger records (`fee_invoices`/`fee_payments`).
5. ✅ Custom roles (`institution_roles.permissions jsonb`, deny-wins evaluation in `packages/permissions/src/evaluate.ts`) and the feature-flag engine (`packages/feature-flags/src/resolve.ts`, pure resolution: kill-switch → block/allow list → percentage → scope hierarchy `institutionUser/independentUser → employeeRole → campus → institution → plan → global`) both exist and work. The exposure system composes them (§5.6) — **no parallel system**.

**Reuse targets** (exact paths):
- Tenancy: `apps/api/src/modules/portal/portal-tenant.interceptor.ts` wraps handlers in a DB transaction setting GUC `app.institution_id`; RLS policies in `packages/database/migrations/sql/zzz_rls.sql`; grants + append-only revokes in `zzz_grants.sql`. Migrations are hand-authored SQL, **currently at 0044; student-portal work starts at 0045** (ledger in §7).
- Guards: `InstitutionAuthGuard` (portal session cookie → `portal_sessions` row + HS256 JWT; bcrypt login, lockout, activation/reset tokens, recent-auth via `lastAuthAt`) → `InstitutionPermissionsGuard` reading `@RequireInstitutionPermissions(...)`. `portal_invitations` exists. Parent portal shows the scoped-principal pattern: guardians are `institution_users` + `GuardianScopeGuard`.
- CRUD engine: `apps/api/src/modules/portal/portal-crud.engine.ts` + `PortalResourceService` (scope confinement, optimistic version checks, FK→EntityDisplay enrichment, audit per mutation via `AUDIT_WRITER`).
- Public/unauthenticated: `apps/api/src/modules/admissions-public/` (`@Public()` module, reusable `OtpService` with configurable target table, hashed resume tokens) — precedent for independent signup.
- Jobs: BullMQ `JobsService` (`apps/api/src/common/queue/jobs.service.ts`; queues include `ai`, `notifications`, `maintenance`; no-op when `REDIS_ENABLED=false`). Rate limiting: `InstitutionRateLimiter` (per-principal, Redis).
- Audit: `AUDIT_WRITER` token wrapping `@edrion/audit` `createAuditWriter(db)`; keyset pagination pattern in `apps/api/src/modules/audit/audit.repository.ts`. `learning_events` mirrors this (§5.2).
- Frontend conventions: institution-web `ResourceManager`/`FieldDef`/`DataTable`/`DetailPanel`/`EntityRef`/`useFocusTrap`/nav-with-permission-keys/`useTerm` (nomenclature)/`useFormat` (currency/dates); `PortalClient` (typed fetch + scope header + `upload`/`fileUrl`); parent-web `AppShell` (bottom tab bar, sticky header, SW registration, PWA manifest, `viewport-fit=cover`). Tokens flow `packages/design-tokens` → per-app `gen:tokens` predev script → `styles/tokens.css` CSS vars → `tooling/tailwind/preset.ts`.
- **No i18n exists anywhere** in the monorepo. Plan 01 introduces the scaffolding (student-web only).
- Relevant existing tables (schema files in `packages/database/src/schema/`): `students, teachers, parents, student_guardians, institution_users, institution_user_roles, campus_user_access, independent_users, portal_sessions, portal_invitations, institution_roles, classes, class_subject_teachers, subjects, academic_years, academic_terms, grade_levels, timetable_slots, assignments, assignment_submissions, attendance_sessions, attendance_records, exams, exam_schedules, grade_entries, announcements, announcement_targets, notifications, fee_structures, fee_invoices, fee_payments, hostel_*, transport_*, library_books, library_loans (the physical library — the student knowledge base is named `knowledge_items`, §5.7), institution_documents, petros_*, feature_definitions, feature_assignments, feature_rollouts, ai_policies, ai_action_rules, ai_runs/ai_tool_calls/ai_confirmations, audit_events, idempotency_keys`.
- **Gaps confirmed (all new builds)**: no `calendar_events`, no homework tables distinct from `assignments`, no learning ledger, no knowledge-base tables, no student permission catalogue, no report-card tables, no independent-user sessions/passwords.

---

## 4. Hard rules (verbatim invariants — every plan's Anti-goals section enforces these)

1. **No AI-inferred mastery percentages, skill bars, or retention scores anywhere.** Counts and evidence tags only. Teacher/professor-given marks are real data and allowed.
2. **Every analytics number traces to a logged event.** AI contributes only labeled qualitative observations with visible source lines and tap-through to underlying events. Structurally enforced: analytics endpoints aggregate `learning_events` (+ institutional tables for teacher-given data); there is no other numeric source.
3. **Chat is a layer, never the stage.** Session canvas is primary; Ask Petros is a drawer/bottom sheet.
4. **Independent students never see institutional features** — absent from navigation, not rendered-and-disabled.
5. **Quick answers stay quick** — never force a lesson.
6. **One design system for all markets and personas** — persona/curriculum differences are tokens and labels, never layout forks.
7. **No dark patterns** — no guilt streaks, manufactured urgency, or manipulative popups.
8. **Homework is AI-free by default**; the teacher's per-item policy is the only gate, enforced **server-side** (§5.8).
9. **AI never performs state-changing operations without explicit human confirmation** (existing platform invariant, extended to the student domain — see §5.5 "AI writes").
10. **Identity domains never merge**: platform employees, institution staff, parents, institutional students, independent users stay separate.
11. **Design fidelity**: the design folder is the source of truth for all UI. Visual conflicts → design wins; logic/behavior conflicts → the product spec wins.

---

## 5. Architectural decisions (with rationale)

### 5.1 Student identity domain

**Institutional students** become `institution_users` rows with the reserved role key `student`, linked 1:1 to their directory record via a new nullable+unique column `students.institution_user_id` (mirrors `teachers.institution_user_id`).

- **Why not a new identity table**: `institution_users` already carries bcrypt auth, activation/reset tokens, lockout, MFA seams, sessions (`portal_sessions`), invitations (`portal_invitations`), and RLS tenancy. The parent portal already proved the "scoped sub-principal on institution_users" pattern (guardians + `GuardianScopeGuard`). A parallel table would duplicate the entire auth stack for zero isolation gain — separation is enforced by role + guard, exactly as parents are separated from staff.
- **Domain separation (Hard Rule 10)**: a `student`-role `institution_user` is rejected by the staff portal guard chain (staff endpoints require staff permissions the student role never has), and the student API (`/v1/student/*`) rejects non-student principals. UI apps are separate. The domains share infrastructure, not access.
- **Provisioning**: institution-web adds "Invite to portal" on student records (single + bulk-by-class). Creates the `institution_users` row (status `invited`, role `student`), links `students.institution_user_id`, and writes a `portal_invitations` row. **School students (age-appropriate v1)**: the invitation email may target a **guardian's email** (chosen from `student_guardians`); the guardian activates and sets the password with/for the child; the student account itself needs no unique student email (the `institution_users.email` for school students may be a synthesized unique local alias `stu-<admission_no>@<institution-slug>.edrion.local` when no real email exists — login then works by admission number + institution code, see Plan 01). College students: direct email invitation. Rationale: no self-serve email requirement for minors; guardian consent is implicit in guardian-mediated activation.
- **Sessions**: reuse `portal_sessions` + the existing session-service mechanics (JWT cookie). Student-web uses cookie name `edrion_student_session` (issued by student auth endpoints) so staff/parent/student sessions never collide in a browser.

**Independent learners** live on `independent_users` (existing table) with new auth columns (password_hash, activation/reset tokens, lockout, last_auth_at — migration 0045) and a new `independent_sessions` table (same shape as `portal_sessions` minus institution columns; `portal_sessions.institution_id` is NOT NULL, so reuse is impossible without weakening tenancy). Signup is a public funnel reusing `OtpService` (email OTP verification) per the admissions-public precedent. Same JWT-cookie mechanics via a shared `StudentSessionService` that fronts both stores.

**The student principal** (attached to requests by `StudentAuthGuard`) is a discriminated union:
```ts
type StudentPrincipal =
  | { kind: 'institutional'; institutionId: string; campusId: string | null;
      institutionUserId: string; studentId: string; permissions: string[] }
  | { kind: 'independent'; independentUserId: string; permissions: string[] };
```

**Permissions**: new catalogue `packages/permissions/src/student/catalogue.ts` (keys in §6.4) + `STUDENT_BASE_ROLE` granting the universal set. Institutional extras (homework, classes, exams, surfaces) are granted by the base role but **visibility is additionally gated by feature flags** (surfaces, exams) — deny wins, flags decide exposure, permissions decide capability.

**Tenancy/RLS**: a `StudentTenantInterceptor` (clone of `PortalTenantInterceptor`) sets `app.institution_id` (institutional) plus a new GUC `app.student_id`; independent requests set `app.independent_user_id` and no institution GUC. New student-owned tables get RLS policies on those GUCs. Existing institutional tables (attendance, grades, submissions…) keep institution-level RLS; **row-level student confinement is enforced in the service layer** (every query filters by `principal.studentId`), following the parent-portal precedent. Defense-in-depth: institution GUC still applies underneath.

### 5.2 The `learning_events` ledger

One append-only table (migration 0046, Plan 01) mirroring the `audit_events` pattern: immutability trigger + revoked UPDATE/DELETE grants (add to `zzz_grants.sql` list), keyset pagination on `(occurred_at, id)`, typed rows. **Everything derived — streaks, weekly goals, Analytics, History, Achievements, revision freshness, Petros Notes evidence — is an aggregation over this ledger.** No feature stores its own counters. This is what makes Hard Rule 2 structural: a number that isn't computable from events cannot exist.

Full column definition in Plan 01 §DB. Event catalogue v1 in §6.3 below (payload Zod schemas ship in `packages/schemas/src/student/learning-events.ts`).

Writer: `LearningEventsWriter` (API-side service, injected token `LEARNING_EVENTS_WRITER`), exposed to all student modules; teacher-side actions that affect the student record (homework returned, report published) also write events with `actor: 'staff'`.

### 5.3 Storage pipeline ("storage first")

Plan 01 generalizes the existing seam into `StudentStorageService` in a new `apps/api/src/modules/student/storage/`:
- **Driver interface** `ObjectStorageDriver { put, getStream, delete, size, signedUrl? }` with two drivers: `LocalDiskDriver` (extracted from `AttachmentStorageService` logic, default in dev) and `SupabaseStorageDriver` (bucket per kind, signed-URL up/download). Selected by env `STUDENT_STORAGE_DRIVER=local|supabase`.
- **`storage_objects` table** (migration 0047): every stored object is a row (owner principal, kind, mime, bytes, checksum, `processing_status: uploaded|processing|ready|failed`, `derived jsonb` for extracted text/page count/thumbnails). All later features (homework submissions, Library uploads, mock-exam photo answers, teacher materials, report-card PDFs, debate exhibits) reference `storage_objects.id` — **no feature invents its own file columns**.
- Upload endpoints follow the existing raw-binary pattern (no multer), size/type validation per kind (images: jpeg/png/webp/heic ≤ 15 MB; documents: pdf/docx ≤ 40 MB), image EXIF strip + orientation fix, PDF page-count extraction; processing jobs run on the BullMQ `imports` queue.

### 5.4 AI orchestration service (Plan 02)

New API module `apps/api/src/modules/student/learn-ai/` — provider-agnostic (`LearnAiProvider` interface; `OpenAiLearnProvider` first, Anthropic pluggable, mirroring the copilot abstraction). Components (full specs in Plan 02): intent router/classifier (small model), pedagogy matrix (six domain archetypes × stage overlays — decides visual-block warrant), session planner, block generator (structured JSON conforming to shared Zod block schemas in `packages/schemas/src/student/blocks.ts`; SVG visuals as **declarative structured output rendered client-side** — no image generation in v1), evaluator (checkpoints/practice/mock answers, **vision evaluation of photographed handwritten work**), revision selector + evidence tagger (BullMQ batch jobs over the ledger).

**Model tiering** (env-configurable, defaults):

| Tier | Env var | Default | Used for |
|---|---|---|---|
| Nano | `LEARN_MODEL_ROUTER` | `gpt-5-nano` | intent routing, topicality, subject/depth classification |
| Small | `LEARN_MODEL_QUICK` | `gpt-5-mini` | quick answers, drawer follow-ups, hint generation, flashcard/summary generation |
| Large | `LEARN_MODEL_TEACH` | `gpt-5` | session planning, block generation, debate turns, mock-exam generation |
| Vision | `LEARN_MODEL_VISION` | `gpt-5` | handwritten-work evaluation, reference-paper analysis |

**Cost controls**: per-student daily token budget + per-minute rate limit in Redis (reuse `InstitutionRateLimiter` mechanics; envs `LEARN_DAILY_TOKEN_BUDGET`, default 400k, and `LEARN_RPM`, default 10); concept-atom + path caching per `(topic_key, curriculum_key, grade_key)` — generated once, reused across students where curriculum-identical; streaming everywhere (SSE, as Petros does).

### 5.5 AI writes & governance

- AI never mutates without explicit confirmation (Hard Rule 9). In the student domain the moments are explicit UI actions ("Turn takeaways into flashcards", "Save to Library", "Add to my learning list", "Pin to canvas") — each is a plain authenticated endpoint invoked by the student's click, so the human confirmation *is* the click. There is no autonomous tool-runner in the student domain; the Learn engine only ever writes the artifacts the student explicitly requested plus its own session/ledger records.
- **Homework/assignment governance** (Hard Rule 8): per-item `ai_policy: 'off' | 'hints_only' | 'full'` stored on the homework/assignment row, teacher-set, default `off`. Institution defaults via institution settings key `student_ai.homework_default_policy`. The drawer backend resolves policy **server-side on every call** in that context (`context.kind === 'homework'` → load row → policy gate). UI governance pill displays the server-resolved policy (`GET .../ai-policy`). `hints_only` maps to the design's "concept help only" pill.

### 5.6 Institution → student exposure system (the surface registry)

A **surface** = `{ key, permissionKey, featureFlagKey, studentRenderer, institutionToggle }`. Registry is code-defined in `packages/shared-types/src/student-surfaces.ts` (single array; adding a surface = one entry + one renderer). Composition, not invention:

- **Feature flag** per surface: `student.surface.<key>` registered in `feature_definitions` (scopes: institution, campus, institutionUser). The **institution toggle UI** (institution-web → Settings → Student portal) writes `feature_assignments` at institution scope through the existing features API; per-student exceptions use institutionUser scope. Default OFF.
- **Permission key** per surface: `student.surface.<key>.view` in the student catalogue, granted by `STUDENT_BASE_ROLE` (capability exists; the flag decides exposure).
- **Student-side renderer**: nav computes visible surfaces from `GET /v1/student/me` (which returns resolved flags); hidden = absent (Hard Rule 4; independent principals resolve all institution-scoped surfaces to OFF by construction).
- **v1 surfaces** (Plan 01 registry + fees summary; full pages Plan 03): `fees` (reads `fee_invoices`/`fee_payments`), `transport` (`transport_assignments` + routes), `hostel` (`hostel_allocations`), `documents` (`institution_documents`, student-audience), `content` (generic content/details surface — new table `student_content_pages`: institution-authored title + rich content + attachments, covering hall tickets, scholarships, notices; managed in institution-web via `ResourceManager`).
- Extensible: future surfaces need one registry entry, a renderer, and (usually) zero backend work if the backing table exists — institutions then expose them without code changes via the toggle.

### 5.7 Library naming (binding)

`library_books`/`library_loans` remain the **physical** school library. The student knowledge base tables are **`knowledge_items`**, `knowledge_collections`, `knowledge_artifacts`, `flashcard_decks`, `flashcards`, `flashcard_reviews` (Plan 04). User-facing label stays **"Library."**

### 5.8 Homework vs. assignments (table decision)

**School Homework = new dedicated tables** (`homework`, `homework_questions`, `homework_assignees`, `homework_submissions`, `homework_answers` — Plan 03). **College Assignments = extend existing `assignments`/`assignment_submissions`** (add attachment refs, `late_policy jsonb`, `ai_policy`, resubmission/versioning via a new `assignment_submission_versions` table).

Rationale: the two workflows differ structurally, not just in label. Homework is question-granular (typed and/or image questions, per-question answers in three modes, per-question teacher feedback, draft autosave, per-item AI-policy) — forcing that into `assignments` (a flat title+instructions+points row already live in institution gradebook flows and smoke tests) would mean nullable-question-table contortions and risky migrations of a working module. College assignments are genuinely the flat shape `assignments` already has (PDF in → PDF back → marks), needing only additive columns. The design shows both under one student screen (`sAssignments`/`sAwork`) — the UI unifies them via a common list DTO; storage does not have to.

### 5.9 Classes & Courses

- **Classes (school)**: backed by existing `classes` + new content tables `class_stream_posts` (kind: `covered|announcement|pinned_next`), materials as `storage_objects` + `class_materials` join, homework tab reads the homework module, About reads `class_subject_teachers`/`timetable_slots`/attendance counts. Design's `sClassDetail` shows Announcements/Materials tabs; production adds **Stream** and **About** tabs using the same tab anatomy (spec'd fully in Plan 03; product-spec-over-design on structure, design language for visuals).
- **Courses (college)**: **new tables** `courses`, `course_enrollments`, `course_syllabus_modules`, plus reuse of `class_stream_posts`-style content tables keyed polymorphically (`context_type: 'class' | 'course'`). A college's `classes` rows model sections/timetables, not credit-bearing courses (code/credits/professor/grading scheme don't fit); mapping courses onto `classes` would pollute school semantics. Course About holds office hours, grading weightage (internals/mid/end), attendance count vs. the 75% requirement.

### 5.10 Report cards & grades (new module — designed here)

- Tables (Plan 03): `report_cards` (institution, campus, student, academic_year, term, `kind: 'uploaded_pdf' | 'structured'`, `storage_object_id` for PDFs, `status: 'draft' | 'in_review' | 'published'`, publish audit fields) + `report_card_entries` (subject/course, marks, max_marks, grade letter, remarks; for college: `component: 'internal' | 'midsem' | 'endsem'`, credits, and a stored `gpa`/`sgpa` per card computed at publish).
- **Workflow**: teacher/exam-officer drafts (structured cards can **import from `grade_entries`** for a chosen exam/term — snapshot copy, so later gradebook edits don't silently change published cards) → `in_review` (principal/admin) → `published` (visible to student; parent portal exposure listed as an open question §9). Corrections: publish a superseding card (`supersedes_report_card_id`); published cards are immutable.
- **Permissions**: reuses institution keys `gradebook.*` + new `report_cards.manage` / `report_cards.publish` / `report_cards.view`.
- **Student UI**: School — term cards list → PDF viewer or structured marks table. College — semester-wise: credits, component breakdown, SGPA/CGPA (computed from teacher-entered marks — real numbers, allowed). Independent: section absent.

### 5.11 Exams section & Expert Mode

Institution-run exams surface (`/exams`, Plan 03) reads `exams` + `exam_schedules` (schedule, syllabus scope via `syllabus_note`, venue `hall`/`seat_info` where `published`), gated by flag `student.surface.exams`. **Expert Mode (v1 definition, binding)**: an independent-learner Settings toggle (default off) that activates the Exams section for them as a **self-declared exam goal**: name + date + syllabus topic list → persistent countdown card (Home + Calendar), "Build a prep plan" seeding a learning path, and mock-exam presets bound to the goal. Stored in `student_preferences` + a `student_exam_goals` table. No institutional data involved.

### 5.12 Design tokens & app scaffold

Extend `packages/design-tokens` with a **student namespace** (`src/student.ts`: theme maps from §2.2, fonts, radii, keyframes) rather than app-local tokens — keeps the one-source-of-truth pipeline, lets `packages/ui` components used inside student-web pick up student vars, and leaves existing apps untouched (student vars are additive under `[data-student-theme]`). student-web gets `gen:tokens` predev like institution-web. Mobile-primary: parent-web's bottom-tab AppShell pattern + the design's narrow behaviors (spine → top progress bar, drawer → bottom sheet). PWA (manifest + SW) same as parent-web.

### 5.13 i18n scaffolding

Plan 01 ships a minimal message-catalog layer in student-web only: `src/i18n/` with `en.ts` as the canonical catalog, a `useT()` hook, `Intl`-based date/number formatting, and the Settings language selector persisting `student_preferences.language` (options from design: English, हिन्दी, Español, বাংলা — non-English selectable but falls back to `en` with a "translations coming soon" note). **Full translations deferred.** No library dependency (plain typed catalog) to avoid framework lock-in before a real l10n pass.

---

## 6. Cross-plan contracts

### 6.1 Database tables by owning plan

| Plan | New tables (all follow tenant convention: `id`, `institution_id` where applicable, `campus_id` nullable, actor columns, timestamps, `version`) | Migrations |
|---|---|---|
| 01 | `independent_sessions`; auth columns on `independent_users`; `students.institution_user_id`; `learning_events` (append-only); `storage_objects`; `student_preferences`; `student_content_pages` | 0045–0048 |
| 02 | `learn_topics`, `concept_atoms`, `learning_paths`, `learning_path_items`, `learn_sessions`, `learn_session_blocks`, `learn_attempts`, `revision_states`, `evidence_tags`, `quick_answers`, `learn_ai_calls` (cost log) | 0049–0050 |
| 03 | `homework`, `homework_questions`, `homework_assignees`, `homework_submissions`, `homework_answers`; `assignment_submission_versions` + columns on `assignments`; `class_stream_posts`, `class_materials`; `courses`, `course_enrollments`, `course_syllabus_modules`; `calendar_events`, `student_planner_items`; `report_cards`, `report_card_entries`; `student_exam_goals` | 0051–0055 |
| 04 | `knowledge_collections`, `knowledge_items`, `knowledge_artifacts`, `flashcard_decks`, `flashcards`, `flashcard_reviews`; `mock_exams`, `mock_exam_questions`, `mock_exam_attempts`, `mock_exam_answers`; `debates`, `debate_turns`, `debate_participants`; `achievement_awards` | 0056–0058 |

Append-only (immutability trigger + grant revoke): `learning_events`, `flashcard_reviews`, `learn_ai_calls`, `achievement_awards`.

### 6.2 API surface by owning plan (namespace `/v1/student/*`, guard chain `StudentAuthGuard → StudentTenantInterceptor → StudentPermissionsGuard`; auth endpoints `@Public`)

- **01**: `POST /auth/login|logout|activate|request-reset|reset`, `POST /auth/independent/signup|verify`, `GET /me` (profile, persona, permissions, resolved surface flags, theme/prefs), `GET|PATCH /preferences`, `GET /home` (tiles), `GET /schedule/today`, `GET /surfaces/fees/summary`, storage: `POST /uploads` (raw binary) / `GET /files/:id`. Institution-web: `POST /v1/portal/students/:id/portal-invite`, `POST /v1/portal/students/portal-invite/bulk`, surface-toggle endpoints via existing features API.
- **02**: `POST /learn/intent`, `POST /learn/sessions` + `GET /learn/sessions/:id` + `POST .../pause|resume|finish`, SSE `GET /learn/sessions/:id/stream`, `POST /learn/sessions/:id/blocks/:blockId/answer` (checkpoint/practice/reflection), `POST /learn/quick`, `GET /learn/quick/:id`, `GET|POST|PATCH /learn/path`, `GET /learn/revision` + `POST /learn/revision/:topicId/refresh`, drawer: `POST /learn/ask` + `POST /learn/ask/pin`, `GET /learn/streaks`, `GET /learn/notes` (Petros Notes), `GET /history`.
- **03**: `GET /homework` + `GET /homework/:id` + `PUT /homework/:id/answers/:qid` (autosave) + `POST /homework/:id/submit`, `GET /assignments` + `GET /assignments/:id` + `POST /assignments/:id/submissions`, `GET /homework/:id/ai-policy`, `GET /classes` + `GET /classes/:id/(stream|materials|about)` + `POST /classes/:id/materials/:mid/save-to-library` (04 activates), `GET /courses...` (same shape + `syllabus`), `GET /report-cards`, `GET /exams`, `GET /calendar` + `GET|POST|PATCH|DELETE /planner`, `GET /analytics?range=`, surfaces: `GET /surfaces/fees|transport|hostel|documents|pages/:key`. Institution-web counterparts under `/v1/portal/*` (homework CRUD, stream posts, materials, syllabus builder, report-card workflow, exam publish, content pages).
- **04**: `GET|POST /library/items` (+detail, collections), `POST /library/items/:id/(summarize|flashcards|quiz|tutor)`, `GET /library/decks/:id` + `POST /library/decks/:id/review`, `POST /lab/mock-exams` (wizard) + `GET /lab/mock-exams/:id` + `POST .../answers|finish` + `GET .../results` + `POST .../retake-weak`, `POST /lab/visuals` + `POST /lab/visuals/:id/(regenerate|save)`, `POST /lab/debates` + lobby/turn endpoints + `GET .../feedback`, `GET /achievements`.

### 6.3 `learning_events` catalogue v1 (event_type → required payload keys; Zod schemas in `packages/schemas/src/student/learning-events.ts`)

| event_type | payload (all include `subject?` `topicKey?` where sensible) |
|---|---|
| `session.started` | `sessionId, topicKey, source ('path'\|'resume'\|'tutor_grounded'\|'prep_plan')` |
| `session.block_completed` | `sessionId, blockId, blockType` |
| `session.checkpoint_answered` | `sessionId, blockId, correct, tries, method ('mcq'\|'explained')` |
| `session.practice_attempted` | `sessionId?, setId?, itemId, correct, hintsUsed` |
| `session.paused` / `session.resumed` | `sessionId, stepIndex` |
| `session.completed` | `sessionId, topicKey, evidence: string[]` |
| `quick.asked` | `quickId, question, routedFrom ('home'\|'drawer'\|'explore')` |
| `path.created` / `path.item_completed` / `path.edited` | `pathId, itemId?` |
| `revision.completed` | `topicKey, mode ('refresh10'\|'session'\|'flashcards')` |
| `drawer.asked` | `contextKind, contextId, pinned:boolean` (set on pin) |
| `library.item_uploaded` / `library.item_processed` | `itemId, mime, pages?` |
| `library.artifact_generated` | `itemId?, artifactId, artifactKind` |
| `flashcards.reviewed` | `deckId, cards, gotIt, again` |
| `quiz.completed` | `artifactId, total, correct` |
| `mock.completed` | `mockId, total, correct, byTopic: {topicKey,total,correct}[]` |
| `debate.completed` | `debateId, format, mode ('solo'\|'friend'), turns` |
| `homework.submitted` / `assignment.submitted` | `homeworkId\|assignmentId, questionsAnswered?, version?` |
| `homework.returned` / `assignment.returned` | (staff actor) `id, marks?, max?` |
| `report_card.published` | (staff actor) `reportCardId, term` |
| `achievement.unlocked` | `badgeKey, tier` |
| `goal.weekly_met` | `weekStart, target, done` |

Rules: events are written by services (never by the client directly); `occurred_at` server-set; append-only. Derivations: **streak** = consecutive days with ≥1 event of an "activity" type; **weekly goal** = count of `session.completed` + `revision.completed` in the ISO week; **freshness** = per `topicKey`, days since last of (`session.completed|revision.completed|flashcards.reviewed` touching the topic) bucketed Fresh <7d, Fading 7–21d, Due >21d (constants in `packages/shared-types/src/student.ts`, tunable).

### 6.4 Student permission catalogue (defined in Plan 01, `packages/permissions/src/student/catalogue.ts`)

`student.learn.use`, `student.library.use`, `student.lab.use`, `student.history.view`, `student.achievements.view`, `student.analytics.view`, `student.calendar.view`, `student.planner.manage`, `student.homework.view`, `student.homework.submit`, `student.assignments.view`, `student.assignments.submit`, `student.classes.view`, `student.courses.view`, `student.report_cards.view`, `student.exams.view`, `student.surface.fees.view`, `student.surface.transport.view`, `student.surface.hostel.view`, `student.surface.documents.view`, `student.surface.content.view`, `student.settings.manage`, `student.data.export`, `student.account.delete`.
`STUDENT_BASE_ROLE` grants all of the above; institutional-only keys are inert for independent principals (no data), and surface/exams visibility additionally requires the feature flag (§5.6). New institution-staff keys (Plan 03): `homework.manage`, `homework.grade`, `class_content.manage`, `courses.manage`, `syllabus.manage`, `report_cards.manage`, `report_cards.publish`, `report_cards.view`, `student_portal.manage` (surface toggles + invitations), `calendar_events.manage`.

### 6.5 Feature flags registered (Plan 01 seeds `feature_definitions`)

`student.portal` (master kill-switch, default ON), `student.surface.fees|transport|hostel|documents|content|exams` (default OFF), `student.expert_mode` (independent, default ON = toggle *available*), `student.learn.engine` (Plan 02, default ON), `student.lab.debate_friend` (Plan 04, default ON).

### 6.6 Shared frontend contracts (student-web `src/components/`, established in the plan noted)

`AppShell`, `SideNav`, `BottomNav`, `TopBar`, `ThemeProvider` + `useStudentTheme`, `PersonaProvider` (01) · `EyebrowLabel`, `Card`, `PillButton`, `ChipRow`, `Toggle`, `Toast` (`useToast`), `StatCard` (with mandatory `from` source-line prop), `FreshnessChip`, `EmptyState` (01) · `SpineRail`, `BlockRenderer` (+ per-type block components), `AskPetrosDrawer`, `CompletionOverlay`, `HintLadder`, `StreamingIndicator`, `MathText` (KaTeX) (02) · `GovernancePill`, `HeatMap`, `TrendBars`, `MarkDotPlot`, `TransparencyPanel`, `MonthGrid`, `AgendaList`, `CountdownCard` (03) · `GraphCanvas` (Visual Studio), `DeckCard`, `ExamPalette`, `PodiumHeader` (04).
Data layer mirrors institution-web: `StudentClient` (typed fetch, credentials, upload, SSE helper) + TanStack Query hooks (`useStudentMe`, `useLearnSession`, etc.), defined per plan.

### 6.7 Zod schema modules (`packages/schemas/src/student/`)

`auth.ts`, `me.ts`, `preferences.ts`, `learning-events.ts`, `storage.ts` (01) · `blocks.ts` (the seven block types below), `session.ts`, `intent.ts`, `path.ts`, `quick.ts`, `ask.ts` (02) · `homework.ts`, `courses.ts`, `calendar.ts`, `report-cards.ts`, `analytics.ts`, `surfaces.ts` (03) · `library.ts`, `mock-exams.ts`, `debate.ts`, `visuals.ts`, `achievements.ts` (04).

**Block types (binding, Plan 02 defines full schemas)**: `concept_card`, `visual_explainer` (declarative SVG spec), `worked_example` (steps with optional `why` expansions), `checkpoint` (MCQ options + per-option diagnostic feedback + explain-back), `practice_item` (statement, expected form, hint ladder ×3), `reflection_summary` (numbered takeaways), `note_card` (pinned from drawer). Spine steps: `understand → see_it_visually → worked_example → check_understanding → solve_yourself → wrap_up`.

---

## 7. Migration ledger (strict order; hand-authored SQL per house convention + `zzz_rls.sql`/`zzz_grants.sql` updates in the same numbered file set)

| # | Plan | Contents |
|---|---|---|
| 0045 | 01 | student identity: `students.institution_user_id` (unique, nullable, FK); `independent_users` auth columns; `independent_sessions` |
| 0046 | 01 | `learning_events` + immutability trigger + indexes |
| 0047 | 01 | `storage_objects` |
| 0048 | 01 | `student_preferences`, `student_content_pages`; seed student feature definitions + `STUDENT_BASE_ROLE` registration |
| 0049 | 02 | learn core: `learn_topics`, `concept_atoms`, `learning_paths`, `learning_path_items`, `learn_sessions`, `learn_session_blocks`, `learn_attempts`, `quick_answers` |
| 0050 | 02 | `revision_states`, `evidence_tags`, `learn_ai_calls` |
| 0051 | 03 | homework tables + `assignments` additive columns + `assignment_submission_versions` |
| 0052 | 03 | `class_stream_posts`, `class_materials`; `courses`, `course_enrollments`, `course_syllabus_modules` |
| 0053 | 03 | `calendar_events`, `student_planner_items`, `student_exam_goals` |
| 0054 | 03 | `report_cards`, `report_card_entries` |
| 0055 | 03 | staff permission keys seed + surface flag assignments backfill (no-op data migration allowed) |
| 0056 | 04 | knowledge base: `knowledge_collections`, `knowledge_items`, `knowledge_artifacts`, `flashcard_decks`, `flashcards`, `flashcard_reviews` |
| 0057 | 04 | `mock_exams`, `mock_exam_questions`, `mock_exam_attempts`, `mock_exam_answers` |
| 0058 | 04 | `debates`, `debate_participants`, `debate_turns`, `achievement_awards` |

---

## 8. Dependency graph

```
Plan 01 ──────────────┐
  identity/sessions   │→ Plan 02 (ledger writer, storage for photo-eval, prefs for hint generosity,
  storage_objects     │           drawer chrome, /me + shell + tokens)
  learning_events     │
  surface registry ───┼→ Plan 03 (homework storage & AI policy resolution need 01 storage + 02 drawer;
  settings/home shell │           analytics aggregates 02's events; exposure surfaces go live)
                      └→ Plan 04 (library uses storage + 02 session grounding; achievements/history
                                  aggregate events from 02+03; lab uses 02's evaluator + budgets)
```

No forward references: e.g., Plan 02's Home widgets that need homework deadlines ship in Plan 03's integration section; Plan 04's "Tutor me on this" consumes Plan 02's exposed `POST /learn/sessions` with `grounding: { knowledgeItemId }` — the field is defined in Plan 02's contract as optional and inert until 04.

---

## 9. Deferred features (design the seam, do not build) & open questions

**Deferred with seams**:
1. **Debate voice mode** — provider-agnostic `SpeechProvider { stt(stream), tts(text) }` interface + `debate_turns.audio_object_id` column (nullable, unused) + UI slot (mic button hidden behind flag `student.lab.debate_voice`, default OFF). Plan 04 specs the interface only.
2. **Image-generation diagrams (Visual Studio "Diagram" chip)** — `VisualProvider` interface with `structured` (v1) and `rendered` (deferred) capabilities; the Diagram chip renders a "coming soon" card in v1.
3. **Stylus/drawing input** — practice workspace reserves an input-mode enum value `draw`; no canvas shipped.
4. **Draw-on-screen ask mode** — teaser card on Lab home only (exists in design).
5. **Full translations** — i18n scaffolding ships (§5.13); catalogs beyond `en` deferred.
6. **Stripe** — untouched; fees surface is read-only ledger display.

**Open questions for the human** (plans proceed with the stated defaults; flag before launch):
1. **Parent-portal visibility of learning data**: what, if anything, of Learn (streaks, topics completed, analytics) appears in parent-web? Default in plans: **nothing new** — parents keep existing academic records only (homework/report cards they already conceptually see via grades). The transparency panel's THEY-SEE list would need updating if this changes.
2. **Intent chip "Study from my notes"**: the brief marks it `[college]`; the prototype shows it for **independent** and gives college "Prepare for exam". Plans follow the **prototype** (design wins on UI). Confirm intended.
3. **School-student login identifier**: plans default to guardian-mediated activation + admission-number login where the student has no email (§5.1). Confirm acceptable for target markets.
4. **Data residency of AI calls**: OpenAI via existing key/config assumed (as Petros). Confirm no additional constraint for minors' content (uploads are already institution-scoped and never used for training per Settings copy).
5. **`student.surface.exams` default OFF** means colleges must flip a toggle before hall-ticket/venue data shows. Confirm default.
6. **Design-folder name**: prompt said `Edrion-Learn-ui/`; repo has `Edrion Learn Portal Design/`. Plans use the latter. If a differently-named export lands later, update §2 only.

---

## 10. Quality bar (applies to every plan)

- Every design screen appears in exactly one plan (traceability table §2.1); nothing dropped, nothing duplicated.
- Every student feature needing institutional data ships its teacher/admin counterpart **in the same plan**.
- No plan references a table/endpoint/component that isn't in §6/§7 or an earlier plan's Contracts exposed.
- The evidence rule is structural (ledger-derived views only).
- Existing platform patterns (guards, tenancy, CRUD engine, audit, flags, permissions, storage seam, OTP, BullMQ) reused everywhere applicable.
- Ambiguities escalate to §9 — never silently guessed.
