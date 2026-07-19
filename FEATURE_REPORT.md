# Edrion feature inventory

## 1. Executive summary

Edrion is an education-operations platform for institutions, paired with a separate learning app for students. The institution side manages academic setup, people, teaching, finance, campus operations, communications and governance; the student side combines school-provided work with an AI-assisted personal learning workspace.

The codebase contains **160 route-level screens**: **105** in the institutional web app (including 24 guardian/family screens embedded in that app) and **55** in the student web app. This inventory identifies roughly **123 product feature areas**. The rough implementation split is **~94 ✅ fully wired, ~17 🟡 partial, ~4 🔴 placeholders, and ~8 ❓ requiring live/manual verification**. Counts treat a related set of tightly coupled actions as one feature area, rather than counting every button.

### How the portals are arranged

- **Institutional Portal** — `apps/institution-web`; a separate web application. It has a role- and permission-filtered navigation system and an API under `/v1/portal`. It also contains a distinct `/family` guardian experience, despite the original two-portal framing.
- **Student Portal** — `apps/student-web`; a separate web application with a dedicated `/v1/student` API, its own login/session model, and institution-controlled optional surfaces.
- **Outside this report's two-portal scope** — `apps/public-web` implements institution registration and public admissions; `apps/super-admin-web` is Edrion's internal control plane for institutions, plans, subscriptions, integrations and support.

### Roles and access model

Institutional access is permission-based, with custom roles supported. Supplied roles include institution owner/admin, campus admin, principal, academic coordinator, finance and HR managers, teachers/faculty, librarian, transport manager, school nurse, counselor, lab/reception/IT/maintenance/security staff, hostel warden, registrar, department head, clerk and viewer. A role may carry several responsibilities; the UI hides navigation a user does not have permission to use, and the API checks the permission again.

Students use the Student Portal. Parents/guardians use the embedded Family Portal. Institution type also changes terminology and visibility (for example, grades/homework for schools versus programme structure/courses for colleges, universities and training centres).

Status key: **✅** fully implemented and connected to an API/storage path in code; **🟡** a meaningful limitation, configured dependency, or incomplete side of the workflow is evident; **🔴** a clearly labelled placeholder/no working feature; **❓** code is present but live provider or end-to-end behaviour cannot be established from the repository alone.

---

## 2. Institutional Portal

### Sign-in and rollout

- **Sign in, password recovery and reset** — Staff can sign in, request a reset link and set a new password. Routes: `/login`, `/forgot-password`, `/reset-password`. Who: institutional users. **✅**
- **Account activation and invitations** — First-time owners activate an account; invited staff/parents can accept a single-use invitation and are routed to the appropriate portal. Routes: `/activate`, `/accept-invite`. Who: new institutional and guardian users. **✅**
- **Guided institution onboarding** — A setup wizard gathers institution details, campuses, academic structure, roles/users and initial configuration before taking the owner to the dashboard. Route: `/onboarding`. Who: owner/admin. **✅**

### Dashboard, work priorities and AI

- **Role-aware dashboard** — Shows configurable widgets appropriate to a user's permissions/personas, campus scope and academic context; widget visibility/pinning and persona preference are persisted. Route: `/dashboard`. Who: any authorized staff role. **✅**
- **Attention Centre** — Brings together operational signals such as attendance and due work. Route: `/attention`. Who: dashboard-authorized roles. **🟡** Two analytics categories are deliberately returned as “not yet available”; visible signals are real.
- **Petros institutional copilot** — Provides AI conversations, streamed answers, attachments, tool actions and an audit trail. Routes: `/petros`, `/petros/[conversationId]` (the `/copilot` route redirects here). Who: users with `ai.use`. **❓** The workflow is wired, but it depends on an OpenAI key/model being configured in the deployment.

### Academic setup

- **Academic years** — Create, edit, filter and manage academic-year records. Route: `/academics/years`. Who: academic setup roles. **✅**
- **Departments** — Maintain departments, codes and descriptions. Route: `/academics/departments`. Who: academic setup roles. **✅**
- **Grade levels** — Maintain school grade levels. Route: `/academics/grades`. Who: academic setup roles at schools. **✅**
- **Programme structure** — Build multi-level programmes, durations, terms, subject placements, classes/sections and courses in a visual structure editor. Route: `/academics/programme-structure`. Who: academic setup roles at colleges, universities and training centres. **✅**
- **Subjects and curriculum placement** — Create subjects, place them in programmes/classes, define credits and teaching allocations. Route: `/academics/subjects`. Who: academic setup roles. **✅**
- **Classes, rosters and class subjects** — Create classes, set capacity/rooms, view and manage the student roster, connect subjects and assign teaching staff. Route: `/academics/classes`. Who: academic setup roles. **✅**
- **Terms** — Create dated academic terms and ordering. Route: `/academics/terms`. Who: academic setup roles. **✅**
- **Academic-context and campus switchers** — Lets authorized staff work in a selected campus/year/term where relevant. App shell across institutional routes. Who: scoped staff. **✅**

### People and admissions

- **Student directory and profiles** — Create, edit, search and filter students; store admission, contact, class and programme details. Route: `/students`. Who: users with student-management permissions. **✅**
- **Student–guardian relationships** — Link/remove guardians for a student and set relationship/contact settings through the student detail panel. Route: `/students`. Who: student/parent management roles. **✅**
- **Student Portal invite** — Create or resend a student's portal login from their institutional record. Route: `/students`. Who: student-management roles. **✅**
- **Student conduct records** — Record, search and manage student conduct/behaviour items. Route: `/conduct`. Who: conduct-authorized staff. **✅**
- **Staff directory** — Create and manage staff records, employment details, teaching flag and role assignments. Route: `/staff`. Who: staff/HR administration roles. **✅**
- **Parent directory and parent login setup** — Create/manage parents and create/resend their Family Portal login. Route: `/parents`. Who: parent-management roles. **✅**
- **Admissions pipeline** — Capture applicants, manage their review state and decision notes, send a decision notification and enrol accepted applicants into the student directory. Route: `/admissions`. Who: admissions roles. **✅**
- **Public admissions hand-off** — The institutional admissions workflow can receive applications from the separate public application funnel. Route: `/admissions`; public routes are outside this portal. Who: admissions roles. **✅**

### Teaching, assessment and academic delivery

- **Attendance sessions and register** — Create attendance sessions, record a bulk register, inspect records and use an agenda view. Route: `/attendance`. Who: attendance-authorized staff, commonly teachers. **✅**
- **Timetable editor** — View and edit timetable grids using classes, subjects, rooms, teachers and bell schedules. Route: `/timetable`. Who: timetable roles. **✅**
- **Bell schedules** — Maintain named bell schedules and time slots. Route: `/timetable/schedules`. Who: timetable roles. **✅**
- **Homework authoring and monitoring** — Create question-based homework, assign/open/close it and inspect submissions. Route: `/homework`. Who: homework managers; school institutions. **✅**
- **Class content** — Navigation exposes a Class Content module. Route: `/class-content` is served by the generic “coming soon” page. Who: users with `class_content.manage`. **🔴**
- **Courses and syllabus** — Maintain post-secondary courses and their syllabi, including course-level details. Route: `/courses`. Who: course-management roles at colleges, universities and training centres. **✅**
- **Exam authoring** — Create/edit exams, questions and question types, then manage schedules and attempts. Routes: `/exams`, `/exams/new`, `/exams/[id]`. Who: exam roles. **✅**
- **Gradebook** — Enter and manage assessment scores, grades and remarks. Route: `/gradebook`. Who: gradebook roles. **✅**
- **Report cards** — Create/manage report cards and their student entries. Route: `/report-cards`. Who: report-card roles. **✅**
- **Assignments** — Build assignments with questions, choose recipients, publish/manage them, and view submissions. Routes: `/assignments`, `/assignments/new`, `/assignments/[id]`. Who: assignment-authorized staff. **✅**
- **Institution calendar** — View calendar events by date/type and create, edit or remove events from calendar management. Routes: `/calendar`, `/calendar-events`. Who: calendar viewers/managers. **✅**
- **Calendar event types** — Configure the categories/colours/behaviour used by the institutional calendar. Route: `/settings/calendar-types`. Who: institution settings roles. **✅**

### Finance, payroll and institutional subscription

- **Student fee structures and invoices** — Manage fee-related records, issue invoices and inspect the payments attached to an invoice. Route: `/fees`. Who: finance roles. **✅**
- **Expense tracking** — Create, edit, filter and manage expense records. Route: `/expenses`. Who: finance roles. **✅**
- **Payroll runs and line items** — Manage payroll runs and drill into the individual items in each run. Route: `/payroll`. Who: payroll/finance roles. **✅**
- **Institution subscription and billing view** — Shows current plan, subscription/billing state and invoices. Route: `/billing`. Who: billing-authorized institution administrators. **🟡** The read/manage view is wired, but plan changes are explicitly support-assisted rather than self-service.

### Operations

- **Library catalogue and lending** — Manage book records and availability, then issue/return and inspect book loans. Route: `/library`. Who: library roles. **✅**
- **Transport routes and rider assignments** — Maintain transport-route records and assign students. Route: `/transport`. Who: transport roles. **✅**
- **Inventory and stock movements** — Maintain inventory items and log/inspect stock movements. Route: `/inventory`. Who: inventory roles. **✅**
- **Hostel blocks, rooms and allocations** — Maintain accommodation, rooms and per-student room allocations. Route: `/hostel`. Who: hostel roles. **✅**
- **Laboratory assets, scheduling and incidents** — Manage lab equipment, practical schedules and incident records. Routes: `/labs`, `/labs/schedule`, `/labs/incidents`. Who: lab roles. **✅**
- **Front-desk visitor records** — Register/manage visitors and their status. Route: `/front-desk`. Who: visitor/reception roles. **✅**
- **Appointments** — Create and manage front-desk appointments. Route: `/front-desk/appointments`. Who: appointment-management roles. **✅**
- **Facilities, work orders, maintenance and assets** — Maintain facilities, create work orders, schedule maintenance tasks and track facility assets. Routes: `/facilities`, `/facilities/work-orders`, `/facilities/maintenance`, `/facilities/assets`. Who: facilities/maintenance roles. **✅**
- **IT devices and access requests** — Track devices and manage IT access-request records. Routes: `/it`, `/it/access-requests`. Who: IT roles. **✅**
- **Visitor/access logs, gate passes and security incidents** — Record security visits/access, issue/manage passes, and manage security incidents. Routes: `/security`, `/security/access-logs`, `/security/gate-passes`, `/security/incidents`. Who: security roles. **✅**
- **Emergency alerts** — Manage emergency alert records. Route: `/security/alerts`. Who: security/emergency roles. **✅**

### Health and wellbeing

- **Health records** — Store and manage student health records. Route: `/health`. Who: health-authorized staff such as school nurses. **✅**
- **Medical incidents and medication logs** — Record/manage incidents and medication administration. Routes: `/health/incidents`, `/health/medications`. Who: medical incident/medication roles. **✅**
- **Counseling sessions and cases** — Maintain confidential counseling notes/sessions and separately manage longer-running cases. Routes: `/counseling`, `/counseling/cases`. Who: counseling-authorized staff. **✅**

### Communication, reporting and governance

- **Announcements** — Compose, target and manage institutional announcements with live recipient previews. Route: `/announcements`. Who: announcement-authorized staff. **✅**
- **Notifications** — Create/manage notification records such as reminders. Route: `/notifications`. Who: announcement-authorized staff. **✅**
- **Direct/group messages** — Create conversations using recipient targeting and exchange messages. Route: `/messages`. Who: users with `messages.use`. **✅**
- **Reports and report runs** — Define/manage report records and run/inspect report generation runs. Route: `/reports`. Who: reports roles. **✅**
- **Audit logs** — Search/filter audit activity by action, actor, module, result and risk. Route: `/audit`. Who: audit-authorized administrators. **✅**

### Administration and configuration

- **Campuses** — Maintain campuses and their identifying/location details. Route: `/campuses`. Who: campus administrators. **✅**
- **Documents and policies** — Publish/manage documents or policy links. Route: `/documents`. Who: document-management roles. **🟡** It accepts external HTTPS links; the screen explicitly says direct file uploads are a later release.
- **User management** — Invite users, assign roles, change status, suspend/reactivate users and inspect user access information. Route: `/users`. Who: user administrators. **✅**
- **Custom roles and permissions** — Create custom roles and edit their permission bags. Route: `/roles`. Who: role administrators. **✅**
- **Institution settings** — Central settings hub for terminology, institution configuration, navigation labels/order, access and related administration links. Route: `/settings`. Who: institution settings roles. **✅**
- **Student Portal settings** — Controls the institution-facing configuration for the Student Portal. Route: `/settings/student-portal`. Who: institution settings roles. **✅**
- **Document templates and capture** — Configure document templates; upload a sample PDF/image to propose a document-header layout and store the template. Route: `/settings/documents`. Who: document-template administrators. **✅**

### Guardian/Family Portal (embedded in the Institutional web app)

This is a third audience, not a staff screen. It has its own gate and family navigation under `/family`; all features below are for **parents/guardians**, not institutional staff.

- **Family home and child switching** — Show linked children and open each child’s hub. Routes: `/family`, `/family/ward`, `/family/child/[studentId]`. **✅**
- **Child attendance and absence notes** — View attendance and submit absence notes. Route: `/family/child/[studentId]/attendance`. **✅**
- **Behaviour acknowledgement** — View behaviour items and acknowledge them. Route: `/family/child/[studentId]/behavior`. **✅**
- **Child documents and requests** — View published child documents and request a bonafide/other document. Route: `/family/child/[studentId]/documents`. **✅**
- **Health visibility and consents** — View health information, incidents/medications and act on available consents. Route: `/family/child/[studentId]/health`. **✅**
- **Hostel, library and transport views** — View the child’s allocation, loan status and transport assignment. Routes: `/family/child/[studentId]/hostel`, `/family/child/[studentId]/library`, `/family/child/[studentId]/transport`. **✅**
- **Results** — View the child's results/report-card information. Route: `/family/child/[studentId]/results`. **✅**
- **Authorized pickup** — Add/remove approved pickup people. Route: `/family/child/[studentId]/pickup`. **✅**
- **Fees and payment initiation** — View invoices and begin payment of an outstanding balance. Route: `/family/fees`. **🟡** It deliberately creates a `mock` payment intent; no live payment-provider handoff is implemented.
- **Inbox and acknowledgement** — Read notifications/notices, acknowledge notices, act on consents and open message threads. Route: `/family/inbox`. **✅**
- **Family calendar and PTM booking** — View events and book parent–teacher-meeting slots. Routes: `/family/more/calendar`, `/family/more/ptm`. **✅**
- **Parent messages** — Start a new message thread to the institution. Route: `/family/more/messages/new`. **✅**
- **Document and profile-change requests** — Submit a document request or a proposed address/profile change. Routes: `/family/more/document-requests`, `/family/more/profile-changes`. **✅**
- **Preferences, privacy and digest preview** — Manage guardian preferences, see who can view information and send a preview of the digest. Routes: `/family/more/settings`, `/family/more/who-can-see`, `/family/more`. **✅**

### Route catalogue (all 105 Institutional web routes)

The routes above are grouped by product module. This compact catalogue makes the complete screen coverage explicit, including aliases, redirects and implementation placeholders.

- **Entry/auth:** `/`, `/login`, `/activate`, `/accept-invite`, `/forgot-password`, `/reset-password`.
- **Overview:** `/dashboard`, `/attention`, `/petros`, `/petros/[conversationId]`, `/copilot`.
- **Academic setup:** `/academics/years`, `/academics/departments`, `/academics/grades`, `/academics/programme-structure`, `/academics/subjects`, `/academics/classes`, `/academics/terms`.
- **People:** `/students`, `/conduct`, `/staff`, `/parents`.
- **Teaching and assessment:** `/admissions`, `/attendance`, `/timetable`, `/timetable/schedules`, `/homework`, `/class-content`, `/courses`, `/exams`, `/exams/new`, `/exams/[id]`, `/gradebook`, `/report-cards`, `/assignments`, `/assignments/new`, `/assignments/[id]`, `/calendar`, `/calendar-events`.
- **Finance:** `/fees`, `/expenses`, `/payroll`, `/billing`.
- **Operations:** `/library`, `/transport`, `/inventory`, `/hostel`, `/labs`, `/labs/schedule`, `/labs/incidents`, `/front-desk`, `/front-desk/appointments`, `/facilities`, `/facilities/work-orders`, `/facilities/maintenance`, `/facilities/assets`, `/it`, `/it/access-requests`, `/security`, `/security/access-logs`, `/security/gate-passes`, `/security/incidents`, `/security/alerts`.
- **Wellbeing and communication:** `/health`, `/health/incidents`, `/health/medications`, `/counseling`, `/counseling/cases`, `/announcements`, `/notifications`, `/messages`.
- **Insights and administration:** `/reports`, `/campuses`, `/documents`, `/users`, `/roles`, `/settings`, `/settings/calendar-types`, `/settings/documents`, `/settings/student-portal`, `/audit`, `/onboarding`.
- **Intentional placeholder:** `/[...module]` catches otherwise unbuilt, permissioned module paths and displays “coming soon.”
- **Guardian/family:** `/family`, `/family/ward`, `/family/child/[studentId]`, `/family/child/[studentId]/attendance`, `/family/child/[studentId]/behavior`, `/family/child/[studentId]/documents`, `/family/child/[studentId]/health`, `/family/child/[studentId]/hostel`, `/family/child/[studentId]/library`, `/family/child/[studentId]/pickup`, `/family/child/[studentId]/results`, `/family/child/[studentId]/transport`, `/family/fees`, `/family/inbox`, `/family/more`, `/family/more/calendar`, `/family/more/document-requests`, `/family/more/messages/new`, `/family/more/profile-changes`, `/family/more/ptm`, `/family/more/settings`, `/family/more/who-can-see`.

---

## 3. Student Portal

### Sign-in, setup and shell

- **Student login, activation and welcome** — Students can authenticate, activate an invited account and see an introductory welcome screen. Routes: `/login`, `/activate`, `/welcome`. Who: students. **✅**
- **Student access guard** — The authenticated shell checks portal access and gives a clear suspended-access state. Route group: all app screens. Who: students. **✅**
- **Institution-controlled optional surfaces** — Fees, transport, hostel and documents navigation only appears when the institution has enabled that surface. App shell and `/surfaces/*` API. Who: students. **✅**

### Home, institutional learning and progress

- **Student home** — Personal dashboard with school work, schedule and institutional summary. Route: `/home`. Who: students. **✅**
- **Homework list and detail** — View school-assigned homework, answer questions and submit work according to the institution's AI policy. Routes: `/homework`, `/homework/[id]`. Who: students. **✅**
- **Assignments and quiz attempts** — View assignments, submit work, and start/save/finish assignment quiz attempts. Routes: `/assignments`, `/assignments/[id]`, `/assignments/[id]/quiz`. Who: students. **✅**
- **Classes and class stream** — View enrolled classes, announcements/stream, materials, homework and class information; acknowledge posts. Routes: `/classes`, `/classes/[id]`. Who: students. **✅**
- **Courses** — View post-secondary course information, announcements, syllabus, materials, projects and course details. Routes: `/courses`, `/courses/[id]`. Who: students at relevant institution types. **✅**
- **Institutional exams** — View school-posted exam dates/papers, set exam goals, and take/save/finish online exam papers. Routes: `/exams`, `/exams/[scheduleId]/attempt`. Who: students. **✅**
- **Calendar and personal planner** — See school events and manage personal planner items. Route: `/calendar`. Who: students. **✅**
- **Progress and analytics** — View progress using trend bars, heat maps, grade/mark plots and an institutional-transparency panel. Routes: `/progress`, `/analytics` (an alias of progress). Who: students. **✅**
- **Report cards** — View available report cards and individual report-card detail. Route: `/report-cards`. Who: students. **✅**
- **Fees, transport, hostel and documents** — View institution-provided summaries/documents for enabled surfaces. Routes: `/fees`, `/transport`, `/hostel`, `/documents`. Who: students when enabled by their institution. **✅**

### Learn: AI-assisted personal study

- **Learning intent and session generation** — Start a personalized learning session from an intent, then receive a streamed sequence of concepts, examples, checkpoints, practice and wrap-up blocks. Routes: `/learn`, `/learn/session/[id]`. Who: students. **❓** Full UI/API path exists, but generated content needs the deployment's OpenAI configuration.
- **Concept and practice focus screens** — Open a specific concept or practice block in a focused learning view, answer it, request hints, continue, pause/resume and finish. Routes: `/learn/session/[id]/concept/[blockId]`, `/learn/session/[id]/practice/[blockId]`. Who: students. **❓** Same AI-provider dependency as Learning sessions.
- **Learning path** — Generate, view and adjust a longer personal learning path. Route: `/learn/path`. Who: students. **❓** Generated-path operation depends on the configured AI provider.
- **Quick explainer** — Ask for a compact explainer/graph and save selected content to the learning list. Route: `/learn/quick/[id]`. Who: students. **❓** Generation is provider-dependent.
- **Revision queue** — See topics due for revision and refresh a topic. Route: `/learn/revision`. Who: students. **✅**
- **Ask Petros while learning** — Ask questions in a learning context, use streaming answers and pin useful answers. Learn session/Ask drawer. Who: students. **❓** Wired but provider-dependent; language translation is explicitly “coming soon.”
- **Learning history** — Review completed sessions, quick learning, practice, mock exams and debate history. Route: `/history`. Who: students. **✅**
- **Achievements and streaks** — See progress badges/tiers and learning streak data. Route: `/achievements`. Who: students. **✅**

### Personal Library

- **Library home, search and collections** — Browse personal sources/artifacts, search them, see recently added items and create/manage collections. Routes: `/library`, `/library/collections/[id]`. Who: students. **✅**
- **Upload and ingestion** — Upload a file, track ingestion/OCR status, view a source and retry/remove it if needed. Routes: `/library/[id]`, `/library/[id]/confirm`. Who: students. **✅**
- **OCR correction/confirmation** — Correct per-page text and confirm it before content is used. Route: `/library/[id]/confirm`. Who: students. **✅**
- **Source viewer and generated study artifacts** — Read source documents/PDFs and generate/access summaries, flashcards, quizzes, glossary entries and tutor material. Routes: `/library/[id]`, `/library/artifacts/[id]`, `/library/quiz/[id]`. Who: students. **❓** Storage, APIs and screens are wired; AI-generated outputs need the AI provider.
- **Flashcard decks** — Create decks from library/session content; review, edit cards and record review progress. Route: `/library/decks/[id]`. Who: students. **✅**
- **Concept-map bridge** — Open a library concept map in the visual canvas. Route: `/library/maps/[id]`. Who: students. **✅**
- **Save class materials to library** — Copy an institution-provided class material into the student's personal library. Class/library flow. Who: students. **✅**

### The Lab

- **Lab landing** — Entry point for Visual Studio, mock exams and debate; one additional landing card is labelled coming soon. Route: `/lab`. Who: students. **🟡** Core tools work; the extra Lab surface is intentionally not built.
- **Visual Studio / thinking canvas** — Create personal visual canvases, generate a proposal, edit nodes/edges, use keyboard/mobile controls, autosave/offline queue, export, inspect changes and restore revisions. Routes: `/lab/visual`, `/lab/visual/[id]`. Who: students. **✅**
- **Visual Studio AI actions** — Generate/expand/offer alternatives for canvas content, ask node quizzes and check retained-memory topics. Visual Studio. Who: students. **❓** Fully wired around quotas/jobs/SSE, but requires the configured AI provider.
- **Mock-exam design** — Create a mock exam, choose defaults/patterns, edit a blueprint, validate topics, generate questions and push weak topics into revision. Routes: `/lab/mock-exams`, `/lab/mock-exams/new`, `/lab/mock-exams/blueprints/[id]`. Who: students. **❓** The engine and UI are wired; generated questions depend on AI configuration.
- **Mock-exam sitting and results** — Start/pause an exam, autosave answers (including offline queue), finish, inspect results and retake weak topics. Routes: `/lab/mock-exams/[id]`, `/attempt`, `/results`. Who: students. **✅**
- **Structured debate** — Choose/create a debate, join by token, wait in a lobby, submit turns and finish the debate. Routes: `/lab/debate`, `/lab/debate/join/[token]`, `/lab/debate/[id]/lobby`, `/lab/debate/[id]`. Who: students. **✅**
- **Debate voice** — Data model reserves audio for debate turns, but the speech provider is explicitly deferred. Debate flow. Who: students. **🔴**

### Student preferences

- **Student preferences** — Update personal portal preferences. Route: `/settings`. Who: students. **✅**

### Route catalogue (all 55 Student Portal routes)

- **Entry/auth:** `/`, `/login`, `/activate`, `/welcome`.
- **Institutional learning:** `/home`, `/homework`, `/homework/[id]`, `/assignments`, `/assignments/[id]`, `/assignments/[id]/quiz`, `/classes`, `/classes/[id]`, `/courses`, `/courses/[id]`, `/exams`, `/exams/[scheduleId]/attempt`, `/calendar`, `/progress`, `/analytics`, `/report-cards`, `/fees`, `/transport`, `/hostel`, `/documents`.
- **Learn:** `/learn`, `/learn/path`, `/learn/quick/[id]`, `/learn/revision`, `/learn/session/[id]`, `/learn/session/[id]/concept/[blockId]`, `/learn/session/[id]/practice/[blockId]`, `/history`, `/achievements`.
- **Library:** `/library`, `/library/[id]`, `/library/[id]/confirm`, `/library/artifacts/[id]`, `/library/collections/[id]`, `/library/decks/[id]`, `/library/maps/[id]`, `/library/quiz/[id]`.
- **Lab:** `/lab`, `/lab/visual`, `/lab/visual/[id]`, `/lab/mock-exams`, `/lab/mock-exams/new`, `/lab/mock-exams/blueprints/[id]`, `/lab/mock-exams/[id]`, `/lab/mock-exams/[id]/attempt`, `/lab/mock-exams/[id]/results`, `/lab/debate`, `/lab/debate/join/[token]`, `/lab/debate/[id]/lobby`, `/lab/debate/[id]`.
- **Preferences:** `/settings`.

---

## 4. Integrations and admin/config

| Area | What the code shows | Status |
|---|---|---|
| OpenAI | Institutional Petros, student Learn, Library generation, Visual Studio and mock-exam generation use OpenAI-configured providers, streaming and usage controls. | **❓** Works only when `OPENAI_API_KEY` and model settings are deployed; a null Learn provider is used without it. |
| Email | SMTP/nodemailer service and email templates support activation, invitations and notifications. | **❓** Code path is complete, but delivery depends on SMTP configuration. |
| Authentication | Cookie-based portal sessions; Supabase token verification is supported for production authentication. | **❓** Local/dev impersonation paths and provider configuration mean live SSO/auth setup needs verification. |
| Payments | Guardian payment initiation calls a payment-intent endpoint, but both UI and service explicitly use provider `mock`. | **🟡** No live card/bank processor is present. |
| File storage | Student uploads and institutional exam/assignment attachments use a storage abstraction with a local-disk driver in the codebase. | **🟡** Functional local storage exists; production object-storage integration is not evident. |
| Background jobs | Redis-backed queue/job tracking supports rendering and AI work; when queues are unavailable, several workflows fall back to inline/SSE processing. | **✅** Graceful fallback is coded. |
| Public admission funnel | Separate public web app supports institution registration/plan selection and applicant apply/status/info flows. | **✅** Not a portal screen, but it feeds admissions. |
| Subscription/plan administration | Separate Super Admin app manages plans, entitlements, subscriptions, invoices, integrations and support access. Institution portal only exposes its own billing view. | **✅** Platform administration is outside the two portals. |

### Paywall / plan-tier findings

There is real plan, subscription, entitlement and usage-limit infrastructure in the platform control plane. The student UI also enforces AI quotas (notably Visual Studio actions), and AI services enforce usage limits. However, I did **not** find a simple screen-by-screen “this module requires Plan X” gate in either portal. Plan features/limits appear designed to be resolved centrally, so exact customer-facing plan restrictions need a live plan/entitlement configuration review.

---

## 5. Cross-portal comparison

| Workflow or capability | Institutional Portal | Student Portal | Product gap / asymmetry |
|---|---|---|---|
| Homework | Staff author, assign, open/close and review submissions. | Students answer and submit. | Strong two-sided workflow. |
| Assignments and quizzes | Staff author, target, publish and view submissions. | Students take assignment quizzes and submit work. | Strong two-sided workflow. |
| Exams | Staff build exams, schedules and inspect attempts. | Students see scheduled exams and take online papers. | Strong two-sided workflow. |
| Grades/report cards | Staff enter gradebook data and assemble report cards. | Students view report cards. | Students have no route to query/comment on results. |
| Calendar | Staff create event types/events and manage calendar. | Students view calendar and maintain a personal planner. | Planner is student-only; staff cannot see/review it in this portal. |
| Messages | Staff can target recipients and operate conversations. | No student message inbox or compose screen. | Student communication is absent, while guardians can message staff. |
| Announcements/notifications | Staff create/send announcements and notifications. | Student home/classes surface institutional work/stream; no dedicated acknowledgement inbox. | No clear student announcement acknowledgement/reply loop. |
| Fees | Staff manage fee records, invoices and payments. | Students only view fee summary (when enabled). | Payment is guardian-only and currently mock; students cannot pay. |
| Transport/hostel | Staff administer routes, allocations and rooms. | Students view only their own status (if enabled). | Correctly one-way, but students cannot request changes. |
| Library | Staff manage physical catalogue and loans. | Students manage an AI-powered personal digital library, uploads and flashcards. | Two distinct products; no direct visible connection from institutional library loans to student Library. |
| Learning analytics | Staff dashboard/Attention has operations analytics; some student-learning signals are pending. | Student sees rich personal progress/analytics. | Institutional visibility into student Learn activity is explicitly incomplete. |
| Personal learning tools | No staff route to assign/manage Learn paths, visual canvases or student mock exams. | Student-only Learn, Visual Studio, mock-exam and debate tools. | Student self-directed learning is not yet controllable or reviewable by staff. |
| Access administration | Staff manage users, roles and portal invitations. | Students manage only preferences. | Expected administrative asymmetry. |

---

## 6. Notable gaps / half-built features

- **Class Content is a navigation item without a real screen** — it resolves to the generic “coming soon” catch-all. **🔴**
- **Attention Centre is only partially realised** — two categories are intentionally returned as not-yet-available, including student-side analytics. **🟡**
- **Guardian payments are mock only** — the payment provider value is literally `mock`; no real checkout/confirmation loop is visible. **🟡**
- **Institution document uploads are not available** — documents are external links only; the screen says uploads will arrive later. **🟡**
- **Institution plan changes require support** — billing shows the plan but explicitly says self-service plan changes are coming soon. **🟡**
- **Student AI features have a deployment dependency** — Learn generation, Ask, generated Library artifacts, Visual Studio generation and mock-exam generation degrade or fail without OpenAI configuration. **❓**
- **Debate audio is reserved but not built.** **🔴**
- **Student-facing messaging is missing** — staff can message and guardians can start threads, but students have no inbox/compose routes. **🔴**
- **No visible staff review loop for self-directed Student Learn/Lab work** — there is no institutional screen to see or assign this activity. **🟡**
- **Production storage, SMTP, Supabase and payment-provider setup need manual verification** — their interfaces are present, but credentials/provider wiring cannot be proven from source alone. **❓**

---

## 7. Anything that surprised me

- The repository contains a **fully separate guardian/family product** inside the institutional app, with 24 route-level screens. This means Edrion is already effectively serving three audiences: staff, students and guardians.
- The Student Portal is much more than a school-work viewer: it includes a personal AI study system, document ingestion/OCR, flashcard generation, visual knowledge canvases, mock exams and structured debates.
- The institutional application has unusually broad operational coverage — health, counselling, security, facilities, IT, hostel, library, payroll and front desk — not just core SIS functions.
- There are two layers of monetisation/control: customer-facing plan selection during public registration and a separate internal Super Admin application for plans, entitlements, subscriptions and billing. The portal UI itself does not expose a clear feature-tier matrix.
- The catch-all institutional route is intentionally used to keep permissioned navigation links from becoming 404s while modules are still being built. It is a useful rollout mechanism, but it can make an apparently available module look further along than it is.
