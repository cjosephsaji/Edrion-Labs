# Plan 03 — The Institutional Bridge

> Consumer: Cursor Composer 2.5. Contracts/names from `plans/00-overview.md`; consumes Plans 01–02 exposed contracts only. Design source: `Edrion Learn Portal Design/Edrion Learn.dc.html`. Every student feature in this plan ships its teacher/admin counterpart in `apps/institution-web` **in the same milestone**.

## 1. Objective & scope

Connect the student portal to the institution: Homework end-to-end (teacher composer with typed+image questions, class/student assignment, per-item AI-policy hint toggle; student list/detail with three answer modes, statuses, LaTeX, autosave, submit/return), Classes (school: Stream/Materials/Homework/About + teacher composers), Courses (college, from scratch, incl. syllabus builder), college Assignments (PDF-first, late policy, versions), Report cards & grades (both variants + publishing workflow), the institution Exams section (flag-gated; independent Expert Mode), Calendar (both variants, institution events + personal tasks, semester bar), Analytics (both variants over the ledger + institutional data, transparency panel), and exposure surfaces v1 going live (Fees, Transport, Hostel, Documents, generic Content pages).

**Out of scope**: Library, Lab, Achievements (04). The Materials tab's "Save to Library" button ships in Plan 04 (which activates it against `knowledge_items`); in this plan the Materials tab offers only "Summarize with Petros" (a drawer ask). Voice/Stripe/etc. per Overview §9.

## 2. Preconditions & contracts consumed

Plan 01: guards/principal, storage (`storage_objects` kinds `homework_answer`, `assignment_file`, `class_material`, `report_card_pdf`, `content_page_attachment`), ledger writer, surface registry + toggles UI, `student_content_pages`, fees summary service, shell/nav (surface items), `PlaceholderScreen`.
Plan 02: `HomeworkPolicyPort` (bind it here), `AskPetrosDrawer` with governance note slot, `MathText`, `useStreaks`/ledger aggregation helpers, `learn_topics`/`revision_states` (analytics revision health, stream topic deep-links), History feed (adds nothing here).
Existing tables: `assignments`, `assignment_submissions`, `classes`, `class_subject_teachers`, `subjects`, `timetable_slots`, `attendance_sessions/records`, `exams`, `exam_schedules`, `grade_entries`, `announcements`, `fee_*`, `transport_*`, `hostel_*`, `institution_documents`, `academic_terms/years`.

## 3. Database changes

### Migration 0051 — homework + college assignment extensions

```sql
CREATE TABLE homework (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  campus_id uuid REFERENCES campuses(id),
  class_id uuid NOT NULL REFERENCES classes(id),
  subject_id uuid REFERENCES subjects(id),
  teacher_id uuid REFERENCES teachers(id),
  title text NOT NULL,
  instructions text,
  due_at timestamptz NOT NULL,
  ai_policy text NOT NULL DEFAULT 'off',          -- off|hints_only|full   (Hard Rule 8)
  status text NOT NULL DEFAULT 'draft',           -- draft|assigned|closed
  assigned_at timestamptz,
  created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);
CREATE INDEX homework_class_idx ON homework(class_id, due_at);

CREATE TABLE homework_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id uuid NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  prompt_text text,                                -- LaTeX allowed, rendered by MathText
  prompt_image_object_id uuid REFERENCES storage_objects(id),
  max_marks integer,                               -- teacher-given real marks allowed
  CONSTRAINT hq_prompt_ck CHECK (prompt_text IS NOT NULL OR prompt_image_object_id IS NOT NULL),
  UNIQUE (homework_id, sequence)
);

CREATE TABLE homework_assignees (                  -- class-wide row omitted; explicit per-student rows
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id uuid NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id),
  UNIQUE (homework_id, student_id)
);

CREATE TABLE homework_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id uuid NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id),
  status text NOT NULL DEFAULT 'assigned',         -- assigned|in_progress|submitted|graded|returned
  submitted_at timestamptz, returned_at timestamptz,
  total_marks integer, total_max integer,          -- teacher-entered on return
  teacher_note text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (homework_id, student_id)
);

CREATE TABLE homework_answers (                    -- draft-autosaved, per question
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES homework_submissions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES homework_questions(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'type',               -- type|photo|file
  answer_text text,
  answer_object_id uuid REFERENCES storage_objects(id),
  teacher_marks integer, teacher_feedback text,    -- per-question, on return
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, question_id)
);

-- College assignments: additive columns + versions (Overview §5.8)
ALTER TABLE assignments
  ADD COLUMN attachment_object_ids jsonb NOT NULL DEFAULT '[]'::jsonb, -- professor's PDFs
  ADD COLUMN late_policy jsonb,                    -- {penaltyPercentPerDay, maxLateDays} | null
  ADD COLUMN allow_resubmission boolean NOT NULL DEFAULT false,
  ADD COLUMN ai_policy text NOT NULL DEFAULT 'off';

CREATE TABLE assignment_submission_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
  version_no integer NOT NULL,                     -- v1, v2…
  file_object_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  late boolean NOT NULL DEFAULT false,
  UNIQUE (submission_id, version_no)
);
```

### Migration 0052 — class/course content

```sql
CREATE TABLE class_stream_posts (                  -- polymorphic: school classes & college courses
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  campus_id uuid REFERENCES campuses(id),
  context_type text NOT NULL,                      -- 'class' | 'course'
  context_id uuid NOT NULL,                        -- classes.id | courses.id
  kind text NOT NULL,                              -- 'covered' | 'announcement' | 'pinned_next'
  title text, body text,
  topic_key text,                                  -- deep-link into Learn when kind='covered'
  posted_by uuid REFERENCES teachers(id),
  requires_ack boolean NOT NULL DEFAULT false,
  posted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);
CREATE INDEX stream_ctx_idx ON class_stream_posts(context_type, context_id, posted_at DESC);

CREATE TABLE class_stream_acks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES class_stream_posts(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id),
  acked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, student_id)
);

CREATE TABLE class_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  context_type text NOT NULL, context_id uuid NOT NULL,
  title text NOT NULL, description text,
  kind_label text NOT NULL DEFAULT 'PDF',           -- display chip: PDF|SLIDES|SHEET|IMAGE
  object_id uuid NOT NULL REFERENCES storage_objects(id),
  week_no integer,                                  -- college: by-week grouping
  posted_by uuid REFERENCES teachers(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  campus_id uuid REFERENCES campuses(id),
  code text NOT NULL,                               -- 'MA201'
  name text NOT NULL,
  credits integer,
  professor_teacher_id uuid REFERENCES teachers(id),
  term_id uuid REFERENCES academic_terms(id),
  office_hours text,
  grading_scheme jsonb,                             -- [{component:'internal'|'midsem'|'endsem', weightPct}]
  attendance_required_pct integer NOT NULL DEFAULT 75,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (institution_id, code, term_id)
);

CREATE TABLE course_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id),
  UNIQUE (course_id, student_id)
);

CREATE TABLE course_syllabus_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  week_no integer NOT NULL,
  title text NOT NULL,
  topics jsonb NOT NULL DEFAULT '[]'::jsonb,        -- string[]
  covered boolean NOT NULL DEFAULT false,
  covered_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  UNIQUE (course_id, week_no)
);

-- Link college assignments to their course (must live in this migration, after courses exists)
ALTER TABLE assignments ADD COLUMN course_id uuid REFERENCES courses(id);
CREATE INDEX assignments_course_idx ON assignments(course_id) WHERE course_id IS NOT NULL;
```

### Migration 0053 — calendar, planner, exam goals

```sql
CREATE TABLE calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  campus_id uuid REFERENCES campuses(id),
  kind text NOT NULL,                               -- 'exam'|'holiday'|'event'
  title text NOT NULL, detail text,
  starts_on date NOT NULL, ends_on date,
  time_label text,                                  -- 'Slot A · Hall 2'
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,      -- {all?:true, gradeLevelIds?:[], classIds?:[], courseIds?:[]}
  source_ref jsonb,                                 -- {examId?} when auto-created from exams
  status text NOT NULL DEFAULT 'published',         -- draft|published
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1
);
CREATE INDEX calendar_events_inst_date_idx ON calendar_events(institution_id, starts_on);

CREATE TABLE student_planner_items (               -- student's own tasks/planned sessions
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id),
  independent_user_id uuid REFERENCES independent_users(id),
  title text NOT NULL,
  on_date date NOT NULL,
  time_label text,
  kind text NOT NULL DEFAULT 'task',                -- 'task' | 'learn_plan'
  topic_key text,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT spi_subject_ck CHECK ((student_id IS NOT NULL) <> (independent_user_id IS NOT NULL))
);

CREATE TABLE student_exam_goals (                  -- Expert Mode (Overview §5.11)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  independent_user_id uuid NOT NULL REFERENCES independent_users(id),
  name text NOT NULL, exam_date date NOT NULL,
  syllabus_topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',            -- active|done|archived
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);
```

### Migration 0054 — report cards

```sql
CREATE TABLE report_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  campus_id uuid REFERENCES campuses(id),
  student_id uuid NOT NULL REFERENCES students(id),
  academic_year_id uuid REFERENCES academic_years(id),
  term_id uuid REFERENCES academic_terms(id),
  term_label text NOT NULL,                         -- 'Term 1' | 'Semester 4'
  kind text NOT NULL,                               -- 'uploaded_pdf' | 'structured'
  pdf_object_id uuid REFERENCES storage_objects(id),
  gpa numeric(4,2),                                 -- college structured: SGPA at publish
  status text NOT NULL DEFAULT 'draft',             -- draft|in_review|published
  supersedes_report_card_id uuid REFERENCES report_cards(id),
  submitted_for_review_by uuid, reviewed_by uuid,
  published_by uuid, published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);
CREATE INDEX report_cards_student_idx ON report_cards(student_id, published_at DESC);

CREATE TABLE report_card_entries (                  -- snapshot rows (immutable once published)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_card_id uuid NOT NULL REFERENCES report_cards(id) ON DELETE CASCADE,
  subject_label text NOT NULL,                      -- or course code+name
  component text,                                   -- college: internal|midsem|endsem; school: null
  marks integer NOT NULL, max_marks integer NOT NULL,
  grade_letter text, remarks text,
  credits integer,                                  -- college
  sequence integer NOT NULL DEFAULT 0
);
```

### Migration 0055 — seeds

Idempotent: staff permission keys (Overview §6.4: `homework.manage, homework.grade, class_content.manage, courses.manage, syllabus.manage, report_cards.manage, report_cards.publish, report_cards.view, calendar_events.manage` — add to institution catalogue groups + grant to `institution_admin`, `principal`, `teacher` per sensible defaults: teacher gets homework/class_content/syllabus manage+grade, report_cards.manage; principal + admin get publish) — permission catalogues are code, so this migration only seeds institution setting defaults: `student_ai.homework_default_policy = 'off'`. RLS policies for all 0051–0054 tables (tenant GUC; student self-read policies for submission/answer rows).

## 4. Backend

New API modules: `apps/api/src/modules/student/{homework,assignments,classes,courses,calendar,analytics,report-cards,exams,surfaces-pages}` (student-facing) and portal-side `apps/api/src/modules/portal/{homework,course-content,report-cards,calendar-events}` following `PortalCrudEngine`/`PortalResourceService` where the shape is flat CRUD (stream posts, materials, courses, syllabus modules, calendar events, content pages already from 01), bespoke services where workflow-shaped (homework grading, report-card publishing).

### 4.1 Homework (school)

Teacher (portal, `@RequireInstitutionPermissions`):
- `POST /v1/portal/homework` (`homework.manage`) — create draft `{classId, subjectId, title, instructions, dueAt, aiPolicy, questions: [{promptText?, promptImageObjectId?, maxMarks?}], assignees?: studentId[] }`. No assignees ⇒ whole class (expand to `homework_assignees` rows at assign time).
- `PATCH /v1/portal/homework/:id`, `POST /v1/portal/homework/:id/assign` (status→assigned, creates `homework_submissions` rows status `assigned` for each assignee, notification fan-out via announcements/notifications pattern, ledger *none* — teacher action audits only), `POST /v1/portal/homework/:id/close`.
- `GET /v1/portal/homework?classId=` list + `GET /v1/portal/homework/:id/submissions` grid.
- `POST /v1/portal/homework/:id/submissions/:sid/return` (`homework.grade`) — body `{answers: [{questionId, teacherMarks?, teacherFeedback?}], totalMarks?, totalMax?, teacherNote?}` → writes per-question feedback, status `returned`, ledger `homework.returned` (staff actor), notification to student.

Student:
- `GET /v1/student/homework?filter=all|progress|submitted|returned` (`student.homework.view`) — list DTO `{id, title, subjectLabel, teacherName, dueLabel, badge: {label, tone}, questionCount, answeredCount, status, late}` (dueLabel/late computed server-side; badge mapping per design: Assigned/In progress/Submitted/Returned · marks).
- `GET /v1/student/homework/:id` — questions (LaTeX text and/or image URL), my answers with modes, autosave timestamps, status, `aiPolicy` resolved, per-question teacher feedback when returned.
- `PUT /v1/student/homework/:id/answers/:questionId` (`student.homework.submit`) — upsert draft `{mode, answerText?, answerObjectId?}`; sets submission `in_progress`; debounce-friendly (idempotent upsert). Autosave contract: client sends at most 1/sec per question.
- `POST /v1/student/homework/:id/submit` — validates ≥1 answered (warn-not-block below), review payload confirmed client-side; sets `submitted`, `submitted_at`, ledger `homework.submitted`.
- `GET /v1/student/homework/:id/ai-policy` — `{policy, note}` (note strings per design: full/concept/off variants). **Bind Plan 02's `HomeworkPolicyPort`** to read `homework.ai_policy` (and `assignments.ai_policy` for college contexts); the drawer restriction now enforces server-side (Hard Rule 8): `off` ⇒ ask endpoint refuses with the governance note; `hints_only` ⇒ restricted prompt.

### 4.2 College assignments

Professor (portal): extend existing assignments module — add fields to create/update DTOs (attachments upload kind `assignment_file`, latePolicy, allowResubmission, aiPolicy); `POST /v1/portal/assignments/:id/submissions/:sid/return` with marks/feedback (uses existing `points_awarded/feedback` + ledger `assignment.returned`).
Student:
- `GET /v1/student/assignments?filter=` — list per design (badge incl. `Late · −20%` computed from late_policy: penalty = min(daysLate,maxLateDays) × penaltyPercentPerDay; after maxLateDays window → `missed` display).
- `GET /v1/student/assignments/:id` — **PDF-first**: professor attachments streamed/embedded as-is (no reformatting, no token spend); due/late window, versions list.
- `POST /v1/student/assignments/:id/submissions` (`student.assignments.submit`) — `{fileObjectIds, note?}` → creates `assignment_submissions` row if absent + `assignment_submission_versions` v(n+1) (v2+ only when `allow_resubmission` and status not graded); marks `late` from due date; ledger `assignment.submitted`.

### 4.3 Classes & Courses (student read + teacher composers)

Student:
- `GET /v1/student/classes` (`student.classes.view`) — from the student's `class_id`: the class's subject list via `class_subject_teachers` → one card per subject `{name, initial, teacherName, nextMeta (from timetable), liveToday}` (design classList).
- `GET /v1/student/classes/:subjectClassId/stream|materials|homework|about` — Stream: `class_stream_posts` (kinds interleaved; `covered` posts carry `topicKey` → UI deep-link "Continue in Learn →" creating/resuming a session via Plan 02; announcements with ack button when `requires_ack`; `pinned_next` card on top); Materials: `class_materials` (+ "Summarize with Petros" = drawer ask with material context; Save-to-Library button arrives in 04); Homework: filtered `GET /homework?classSubject=`; About: teacher, timetable slots, attendance plain count (`{present, total}` from attendance_records — a count, never a bar).
- `POST /v1/student/classes/stream/:postId/ack` — ack row, design copy "✓ Seen — Ms. Rao knows".
- Courses (college, `student.courses.view`): `GET /v1/student/courses` (enrollment join → code/name/professor/credits card list); `GET /v1/student/courses/:id/(announcements|syllabus|materials|projects|about)` — Syllabus: modules with covered checkmarks + current-week highlight; Materials grouped by week; Projects = assignments filtered to the course via `assignments.course_id` (nullable column added in migration 0052, after `courses` exists); About: office hours, grading scheme table, attendance count vs required pct with quiet early warning (`belowThreshold: boolean` → amber line "Attendance needs attention — {n} more lectures to stay above 75%"; computed, not judgmental).

Teacher composers (portal): stream post CRUD (`class_content.manage`; compose kinds covered/announcement/pinned_next; covered form has topic autocomplete against `learn_topics` + free text), materials upload (`class_material` kind + week_no for courses), course CRUD (`courses.manage`), syllabus builder (`syllabus.manage`: week rows, topics chips, covered toggles), enrollment management (CSV-less v1: class-based bulk add by grade/section picker + individual add/remove).

### 4.4 Report cards

Portal:
- `POST /v1/portal/report-cards` (`report_cards.manage`) `{studentId|classId, termId?, termLabel, kind}`; classId ⇒ batch-create drafts per student.
- Structured import: `POST /v1/portal/report-cards/:id/import-grades` `{examId?|termId}` → snapshot matching `grade_entries` rows into `report_card_entries` (copy, not reference). Manual entry: `PUT /v1/portal/report-cards/:id/entries` (bulk upsert; college rows carry component/credits).
- Upload kind: `pdf_object_id` (storage kind `report_card_pdf`).
- Workflow: `POST .../submit-review` → `in_review`; `POST .../publish` (`report_cards.publish`) → validates (structured: ≥1 entry; college: computes+stores SGPA = Σ(gradePoint×credits)/Σcredits using a fixed 10-point band table in `packages/shared-types/src/student.ts`) → `published`, immutable (service rejects entry edits on published), ledger `report_card.published`, student notification. Corrections: `POST .../supersede` clones to a new draft with `supersedes_report_card_id`.
Student: `GET /v1/student/report-cards` (`student.report_cards.view`) — published only, grouped by year/term; detail returns entries or PDF file id. College adds `{sgpaByTerm, cgpa}` (computed from published cards only — teacher-given marks, allowed).

### 4.5 Exams section & Expert Mode

- `GET /v1/student/exams` (`student.exams.view`, flag `student.surface.exams`): upcoming `exams` joined `exam_schedules` for the student's class where `published` → `{examName, subject, date, time, hall?, seatInfo?, syllabusNote?}` + countdown per exam; "Build a prep plan" CTA → creates a learning path/session with `source:'prep_plan'` on the syllabus topics.
- Portal: exam publishing already exists (`exam_schedules.published`); add a "Visible to students" hint chip in the existing exams UI (copy change only) + the surface toggle governs the section.
- Expert Mode (independent): `GET|POST|PATCH /v1/student/exam-goals` CRUD on `student_exam_goals` (permission `student.exams.view`; preference `expert_mode` must be true — Settings toggle from Plan 01 activates the nav item). Exams screen for independents renders goals: countdown card, syllabus topic chips with freshness, "Build a prep plan" (same path seeding), mock-exam preset link (starts Plan 04 wizard prefilled; until 04 the CTA hides).

### 4.6 Calendar

- `GET /v1/student/calendar?month=YYYY-MM` (`student.calendar.view`) — **fetch-time fusion**, no duplication: institution `calendar_events` (audience-filtered) + auto-fed exam schedules (kind exam, from `exam_schedules` where published — skip ones already mirrored via `source_ref.examId`) + homework/assignment due dates (kind due) + class/lecture slots (kind cls, from `timetable_slots`, expanded per weekday) + student's Learn plan items (kind learn: `student_planner_items` + revision-due markers from `revision_states`). Response: `{days: {date, events: {kind, label, sourceLine}[]}[], nextExam: {…days,dateLabel,title,sub} | null, semesterBar?: [{label,weightPct,tone}]}` — semesterBar for college from `academic_terms` (teaching/midsem/teaching/study/endsem segments derived from term meta; when term dates absent return null and hide the bar).
- `POST|PATCH|DELETE /v1/student/planner` (`student.planner.manage`) — personal items.
- Portal: `calendar-events` module (`calendar_events.manage`, ResourceManager CRUD + publish; kinds exam/holiday/event; audience picker).
- Source lines per design: institution events "Published by {institution} · {dept}"; due "From Assignments · {teacher}"; learn "Your Learn plan".

### 4.7 Analytics

`GET /v1/student/analytics?range=week|month|term` (`student.analytics.view`) — single endpoint returning the full widget payload; **every number computed from `learning_events` or institutional tables, each stat carries `from` text** (schema enforces `{value, unit, from}` triples — a stat without `from` fails validation):
- statSlots: topics completed (count `session.completed`), practice items (count `session.practice_attempted`), time-on-learning (sum of session durations from started/completed pairs + practice timestamps — floor to minutes), current streak.
- heatmap: per-day activity counts (5 ISO weeks), scale per design colors.
- trendBars: topics per week (6 buckets) + subject chips (group by `subject_label`).
- assignments record: on-time/late/missed counts (homework_submissions + assignment_submissions vs due).
- markDots: returned teacher marks (label, `m/max`, pct position — pct here is **teacher-given** display math, allowed).
- revision health: counts from `revision_states` + refreshed count in range.
- insights: active `evidence_tags` formatted as tappable insights with `events[]` (resolve `evidence_event_ids` → label/meta lines).
- college extra: courseRows (per course: topics count via topic→course subject mapping, attendance pct vs 75 line, internal marks latest).
- transparency panel content: static from `packages/shared-types` (`STUDENT_SHARED_WITH_INSTITUTION`, `STUDENT_NEVER_SHARED` lists — same source the portal `learning-summary` DTO enforces).
Independent variant: same payload minus institutional widgets (assignments/courses/attendance/transparency → nav label stays "Progress"; route serves `sProgress` minus those cards; transparency panel replaced by the "share nothing" line from Settings copy).

### 4.8 Exposure surfaces (student read endpoints; flags from Plan 01 registry)

- `GET /v1/student/surfaces/fees` — invoice list `{invoiceNo, label, amountMinor, paidMinor, status, dueDate}` + payments per invoice; currency via institution settings.
- `GET /v1/student/surfaces/transport` — student's `transport_assignments` → route/stop/vehicle/driver-contact display fields.
- `GET /v1/student/surfaces/hostel` — active `hostel_allocations` → building/room/warden display.
- `GET /v1/student/surfaces/documents` — `institution_documents` where audience includes students → list + file stream via existing document storage seam.
- `GET /v1/student/pages` + `GET /v1/student/pages/:key` — published `student_content_pages` audience-matched.
All: permission `student.surface.<key>.view` + flag gate re-checked server-side (guard helper `assertSurface(principal, key)` — flag OFF ⇒ 404, not 403, so absence is indistinguishable from nonexistence).

## 5. Frontend — student-web

Route map (design keys): `/homework` + `/homework/[id]` (school) and `/assignments` + `/assignments/[id]` (college) — `sAssignments`/`sAwork`; `/classes` + `/classes/[id]` — `sClasses`/`sClassDetail` (+ new Stream/About tabs per §5.9 Overview); `/courses` + `/courses/[id]` — same anatomy + Syllabus/Projects tabs; `/progress` — `sProgress`; `/calendar` — `sCalendar`; `/report-cards` — new (design language, §5.4 below); `/exams` — new; surfaces `/fees`, `/transport`, `/hostel`, `/documents`, `/pages/[key]` — new simple list/detail pages in the design language; Settings governance card now live (Plan 01 left it defaulted).

Key screen specs:
1. **Homework/Assignments list (`sAssignments`)**: eyebrow `{HOMEWORK|ASSIGNMENTS} · FROM YOUR {SCHOOL|COLLEGE}`, serif title, filter chips (All/In progress/Submitted/Returned), row cards (title + `Badge` tone-mapped, subject · teacher · question-count/qc line, due label right; late rows amber). Footer governance explainer line (design). Empty state per filter.
2. **Homework detail (`sAwork` school variant)**: back link + autosave chip (`Saved just now`/`Saving…` — port `onA1` debounce), title/meta, per-question cards: answered state (Q1 · ANSWERED ✓ + editable textarea), current (Q2 · UP NEXT + mode segmented control Type/Photo of my notebook/Attach a file → textarea | camera-first upload zone ("📷 Snap your notebook page — Petros reads handwriting") | file dropzone), remaining stacked. `MathText` renders prompts. Submit block: "Submit to {teacher}" + "Nothing sends until you say so."; pre-submit **review sheet** (design `aReview` rows: per-question Answered/Empty status; unanswered → amber warn but submission allowed after confirm); submitted state (timestamp toast + status card); returned state: total marks card + per-question teacher feedback panels (design `aReturned`), resubmit note when closed. `GovernancePill` in header from `/ai-policy` (label + colors per design; drawer shows the policy note; pill never client-toggleable).
3. **College assignment detail (`sAwork` college variant)**: PDF viewer pane (attachments as-is via `fileUrl`; iframe/object embed with download fallback), late-policy line ("Late policy: −10% per day, max 3 days. This is on day 2." — computed server strings), versions list (v1/v2 chips + timestamps), upload zone + note field + submit; declaration row (design reviewRows college: "Whole set · PDF attached · v1 / Declaration · Signed" — declaration is a required checkbox pre-submit).
4. **Classes list/detail**: list per design (initial tile, teacher, next-meta, TODAY live chip). Detail tabs **Stream · Materials · Homework · About** (design tab anatomy; Announcements content type lives inside Stream as `announcement` posts — the design's Announcements tab content becomes the Stream's announcement cards with ack buttons; pinned-next card pinned top). Stream covered-entries: "TODAY WE COVERED" eyebrow + topic title + "Continue in Learn →" chip (deep-link). Materials rows: kind chip + name + sub + "Summarize with Petros ✦" (opens drawer with material context) — Save-to-Library appears in Plan 04. About: teacher card, timetable line, attendance plain count ("Attendance: 39 of 42 days — a count, not a score").
5. **Courses list/detail (college)**: list cards add code+credits; detail tabs **Announcements · Syllabus · Materials · Projects · About**. Syllabus: week rows with covered checks (✓ green when covered, current week highlighted), topics chips. About: office hours card, grading-scheme table (weightage rows), attendance vs 75% with quiet warning line.
6. **Analytics (`sProgress`)**: replicate wholesale — header + range chips; `StatCard` grid (each with FROM line — component makes `from` required); `HeatMap` (+streak chip); `TrendBars` + BY SUBJECT chips + FROM line; college PER COURSE table (attendance bar with 75% tick, INTERNAL marks); ASSIGNMENTS record trio + RETURNED MARKS `MarkDotPlot` (60–100% axis, teacher-given note); WHAT PETROS NOTICES insights (tap to reveal EVENT rows); right rail: ON THE HORIZON exam-proximity card (→ prep plan), REVISION HEALTH chips + queue link, EVIDENCE TAGS strengths/growth (tap → note), `TransparencyPanel` (THEY SEE / THEY NEVER SEE exact lists). Range switch re-queries. Independent: institutional cards absent.
7. **Calendar (`sCalendar`)**: header (eyebrow CALENDAR · {institution}, month serif, Month/Agenda toggle); college semester bar; legend filter chips (per-kind dot + toggle dimming); exam `CountdownCard` ({n} DAYS tile + next-exam info + Build a prep plan →); `MonthGrid` (Mon-start, today ring, event dots+labels, click → popover `calSelEvs`: type chip, label, source line, exam → prep-plan CTA, due → open assignment CTA); `AgendaList` (day rows, event cards with type chip + source); "+ Add" personal item (title/date/time sheet → planner POST; kind learn/task chips). Personal items render kind `learn` amber per design legend "My Learn plan".
8. **Report cards** (new, design language: serif headers, card rows, eyebrow labels): list grouped by year → term cards (term label, published date, view →); detail: structured = marks table (subject, marks/max, grade, remarks; college grouped by component with credits + SGPA footer line "SGPA 8.4 — computed from your published marks"); uploaded = embedded PDF. Superseded cards show "Updated {date} — this version replaces the earlier one."
9. **Exams**: institutional — list of upcoming exam cards (name, subject rows with date/time/hall/seat when present, syllabus note, countdown chip, prep-plan CTA); empty state "No exams published yet." Independent (Expert Mode on) — goals list + create sheet (name, date, topics chips), goal card with countdown + topic freshness chips + prep-plan CTA.
10. **Surfaces**: Fees (summary header + invoice cards with status badges + payments detail, currency via institution format), Transport (route card), Hostel (allocation card), Documents (list + viewer), Content pages (rich body + attachments). All: simple single-column design-language pages; absent entirely when flag off (nav + route 404).

Home enrichment (now data exists): deadlines tile (nearest homework/assignment due), Today's-plan card gains due items; `sHome` today-plan rows for institutional students now fully live.

## 6. AI work

Only two touchpoints, both through Plan 02's provider: (a) drawer asks with homework/assignment/material context — policy-gated per §4.1 (no new schemas; context payload gains `materialExcerpt` for Summarize-with-Petros, small tier); (b) prep-plan seeding = Plan 02 planner invoked with exam syllabus topics (`source:'prep_plan'`). No new models, budgets apply unchanged.

## 7. Institution-web additions (consolidated; all follow ResourceManager/house conventions, permission-gated, audited)

1. **Homework** (`/homework` nav under Academics): list (class/subject/status filters), composer drawer — title, class, subject, due, instructions, **AI-help toggle** (three-state: Off / Hints only / Full — copy: "Petros on this homework. Off is the default."), question repeater (text with LaTeX preview via MathText, or image upload), assignee mode (whole class / pick students); actions assign/close; submissions grid (student × status), return drawer (per-question marks+feedback, total, note).
2. **Assignments (college institutions)**: existing assignments pages gain attachment upload, late-policy fields, resubmission toggle, AI-policy toggle, return-with-feedback drawer.
3. **Class/Course content** (`/classes/:id` detail tabs in portal): Stream composer (kind picker; covered form: topic autocomplete + body; announcement + requires-ack toggle; pinned-next), Materials upload manager, acks/readership count column.
4. **Courses** (`/courses`, college type only): ResourceManager CRUD (code, name, credits, professor picker, term, office hours, grading-scheme rows, attendance threshold), enrollment tab, **Syllabus builder** tab (week rows: title, topics chips, covered toggle).
5. **Report cards** (`/report-cards`): batch create wizard (class+term+kind), draft editor (import-from-gradebook button, entries table editor, PDF upload variant), review queue (in_review list for `report_cards.publish` holders), publish confirm ("Students see this immediately"), supersede action.
6. **Calendar events** (`/calendar-events`): ResourceManager CRUD + publish; audience picker; auto-mirror hint for exams.
7. **Exams**: copy chip "Visible to student portal when published + surface enabled".
8. Settings → Student portal (from Plan 01) gains: homework default AI policy select; governance display feeds student Settings card via `GET /v1/student/surfaces/governance-default` (implement here).

## 8. Build order

1. Migrations 0051–0055 + schemas + RLS. *Verify*: clean migrate; RLS spot-checks (student A cannot read student B's submission via SQL with GUCs set).
2. **Homework vertical** (portal composer/assign/return + student list/detail/autosave/submit + policy port binding + governance pill). *Verify*: full loop as teacher→student→teacher→student (returned feedback visible); autosave races (two rapid PUTs) keep latest; drawer refuses on `off` policy with note; ledger `homework.submitted/returned` rows exist.
3. **College assignments vertical** (extensions + versions + PDF-first UI). *Verify*: v1 then v2 resubmission; late penalty label math; PDF renders as-is (network tab: no AI calls).
4. **Classes + Courses + content composers**. *Verify*: covered post deep-links into a Learn session; ack round-trip; syllabus covered toggle reflects on student side; attendance counts match seeded registers; 75% warning appears under threshold.
5. **Calendar + planner + events admin**. *Verify*: fused feed contains all five kinds without duplicates (exam mirrored once); filters; popover CTAs route; personal item CRUD; semester bar college-only.
6. **Report cards workflow** (both kinds, both variants). *Verify*: import snapshot unaffected by later grade_entries edit; publish immutability (PATCH entries → 409); SGPA math against fixture; student sees published only; supersede chain renders.
7. **Exams + Expert Mode**. *Verify*: flag off → 404 + no nav; publish schedule → appears with hall/seat; prep-plan CTA creates path; independent goal CRUD behind expert_mode preference.
8. **Analytics**. *Verify*: every displayed number reproduced by hand-run SQL over ledger/tables for a seeded student (write the queries into the smoke script); insights tap-through resolves events; independent variant lacks institutional cards; range switching.
9. **Surfaces v1 live** (fees/transport/hostel/documents/pages). *Verify*: toggle each flag → nav+page appear/vanish (404 when off); data correctness against seeds.
10. **Smoke** `scripts/student-p3-smoke.sh` (target ≥60 assertions).
   *Acceptance*: all verifications green; typecheck/lint; teacher counterparts exist for every student feature in this plan; transparency panel lists match the portal `learning-summary` DTO fields exactly.

## 9. Anti-goals

- No percentage bars in Analytics except teacher-given marks display and attendance-vs-threshold (institutional facts) — never AI-derived.
- Homework AI default is OFF; no client-side-only policy enforcement; no "unlock hints" student control.
- Do not reformat professor PDFs or run them through models.
- Do not duplicate exam/due data into `calendar_events` at write time (fusion is read-time; only explicit mirrors carry `source_ref`).
- Do not build a second announcements system — class stream `announcement` posts are class-scoped content, institution-wide announcements stay in the existing module.
- Do not expose chat logs, scratchpads, hint detail, or uploads to staff — anywhere.
- Do not make published report cards editable.
- No Library/Lab UI, no Save-to-Library buttons yet.

## 10. Escalations

- If `assignments.course_id` conflicts with existing gradebook flows (unexpected coupling), stop and surface before altering existing module behavior.
- Semester-bar segment derivation needs term metadata institutions may not have — shipping null-hides is the default; escalate if product wants a manual editor instead.
- Attendance percentage displays an institutional requirement (75%); if any target market needs configurable display-off, it's a surface-flag candidate — note, don't build.

## Contracts exposed (to Plan 04)

`class_materials` + material detail (Save-to-Library target), homework/assignment ledger events (History complete), `student_exam_goals` + prep-plan seeding (mock-exam presets), calendar fusion accepts kind `learn` items (flashcard-due markers in 04 via planner rows is **not** done — 04 uses revision_states only), analytics aggregation helpers (badge computation reuse), `GovernancePill`, `TransparencyPanel`, `CountdownCard`, `MonthGrid`, `AgendaList`, `HeatMap`, `TrendBars`, `MarkDotPlot` components; surface pattern for any future page.
