# Publishing content to students

How a teacher or administrator puts real content in front of a student, which permission each
action needs, and where it surfaces in the student portal.

Two apps are involved:

| App | Port | Who uses it |
| --- | --- | --- |
| `apps/institution-web` | 3002 | Teachers, heads, coordinators, administrators |
| `apps/student-web` | — | Students |

Everything below is authored in the institution portal and read in the student portal. Nothing
should ever be written straight into the database — the direct-injection seed that used to do
that has been removed (see [What changed](#what-changed)).

---

## Notes

A note is writing, not a file. The body is the artifact; attachments are optional. This is the
right surface for lesson notes, worked examples, revision summaries, and corrections.

**Where:** Teaching → pick the subject you teach → **Notes**
**Permission:** `class_content.manage`
**Held by:** Teacher, Professor, Assistant Professor, Department Head, Academic Coordinator
**Student sees it at:** Notes (`/notes`), and the full text opens at `/notes/{id}`

1. Open **Teaching**. You land on the subjects you teach — one card per subject and class.
2. In the **Notes** panel, write a title and the note body. Summary and week are optional — the
   summary is the single line a student sees in their list, so it is worth filling in.
3. **Save draft.** The note is stored but no student can see it. Drafts are private: the student
   API filters on `status = 'published'`, and opening a draft's URL returns 404.
4. When it is ready, press **Publish.** The note appears in the student's list immediately.
5. **Unpublish** withdraws it again without deleting it. **Edit** on a published note updates it
   in place and students see the new text.

Every save is kept in `class_note_revisions`, so a published note can be traced back to what it
said at each version. Opening a note records a read in `class_note_reads` — the reader list is
available per note at `GET /v1/portal/course-content/notes/{id}/readers`.

## Study materials

A material is a file with a label. Use it for handouts, question banks, slide decks, and scans.

**Where:** Teaching → pick the subject you teach → **Files**
**Permission:** `class_content.manage`
**Student sees it at:** Study materials (`/materials`), downloadable via `/materials/{id}/file`

1. Optionally set a title — it defaults to the file name.
2. **Choose file and publish.** Upload and publish are one action, so a file cannot sit
   uploaded-but-unpublished. The type label (PDF, Slides, Image…) is read from the file.

Accepts PDF, Word, slides, spreadsheets and images, up to 50 MB. Everything is filed under
the subject you opened, so students see it grouped by subject rather than in one class-wide pile.

## Class stream

Short, dated posts against a class: what was covered, what is pinned next, a one-off notice to
that class only.

**Where:** Teaching → pick the subject you teach → **Class updates**
**Permission:** `class_content.manage`
**Kinds:** `covered`, `announcement`, `pinned_next`

Use the stream for "we covered quorum today"; use a note when the content is what matters.

## Homework

**Where:** Homework
**Permission:** `homework.manage` to set it, `homework.grade` to mark it
**Held by:** Teacher, Professor, Assistant Professor, Department Head, Academic Coordinator
**Student sees it at:** Homework (`/homework`)

Homework needs a class, a due date, and at least one question. Flow is create → assign → close.
`aiPolicy` on each piece controls what Petros will do with it: `off`, `allowed_with_citation`,
or the other values in `aiPolicySchema`.

## Assignments

**Where:** Assignments
**Permission:** `assignments.manage`
**Held by:** Teacher, Professor, Assistant Professor, Department Head, Academic Coordinator,
Campus Admin, PhD Scholar
**Student sees it at:** Assignments (`/assignments`)

Assignments carry marks, a due date, a late policy, and a resubmission flag; homework is the
lighter, question-based form. Assignments can be targeted at a class or a course.

## Announcements

Institution-wide notices, not class content.

**Where:** Announcements
**Permission:** `announcements.send`
**Held by:** Principal, Campus Admin, Department Head — **not** classroom teachers
**Student sees it at:** Announcements (`/announcements`)

1. Write a title, body, and a reference code (the human-readable handle, e.g. `ANN-EXAM-WEEK`).
2. Set **audience**: `all`, `students`, `teachers`, `parents`, or `staff`. A student only ever
   sees `all` and `students`.
3. Optionally **pin** it — pinned notices lead the student's noticeboard.
4. Set status to **published**. A student sees nothing until both `status = 'published'` and
   `publishedAt` is set.

Teachers who need to reach only their own class should use the class stream instead; that is
deliberate, and it is why `announcements.send` stops at Department Head. If a school wants
teachers broadcasting institution-wide, add `announcements.send` to the `teacher` role in
`packages/permissions/src/institution/roles.ts`.

## Everything else

| Content | Portal page | Permission to publish | Roles holding it | Student surface |
| --- | --- | --- | --- | --- |
| Timetable | Timetable | `timetable.manage` | Campus Admin, Principal, Academic Coordinator, Department Head | `/timetable` |
| Attendance | Attendance | `attendance.manage` | Campus Admin, Principal, Teacher, Professor, Assistant Professor | `/attendance` |
| Exams & schedules | Exams | `exams.manage` | Campus Admin, Principal, Academic Coordinator, Department Head, Professor | `/exams` |
| Marks | Gradebook | `gradebook.manage` | Principal, Academic Coordinator, Teacher, Department Head, Professor, Assistant Professor | `/results` |
| Calendar events | Calendar events | `calendar_events.manage` | Campus Admin, Principal, Academic Coordinator | `/calendar` |
| Courses & syllabus | Courses | `courses.manage`, `syllabus.manage` | Academic Coordinator, Department Head, Professor | `/courses` |
| Fee invoices | Fees | `fees.manage` | Campus Admin, Finance Manager | `/fees` |
| Documents | Documents | `documents.manage` | Campus Admin | `/documents` |
| Messages | Messages | `messages.use` | Most staff roles | `/notifications`, chat |

Institution Owner holds a wildcard and Institution Admin holds every catalogue key, so both can
do all of the above regardless of the table.

---

## What changed

### The demo data is gone

Student and teacher portals were populated by `scripts/dev/seed/student-portal-demo.ts`, which
wrote 1,655 lines of content directly into the database — bypassing every authoring screen. It
has been deleted, along with `scripts/dev/enrich-test-student-learning.ts` (its only other
caller) and the `db:seed:test-student` script. `runDevSeed` no longer calls it.

Purged from the database:

- The **Greenwood Academy** fixture tenant and everything under it (3,944 rows).
- The seeded content burst in the TocH tenant (67 rows: announcements, assignments, exams,
  timetable, transport, report cards, requests, and a fabricated subject).
- Fabricated attendance rollups — percentages with no marked session behind them
  (`attendance_records` and `attendance_sessions` were both empty).
- Two placeholder storage objects (`demo/materials/grade-9-learning-pack.pdf`,
  `demo/documents/term-1-progress-report.pdf`). **Neither file existed on disk**, and eight of
  nine `class_materials` rows pointed at them, so every one of those downloads was a 404.

What survived is genuinely authored: the CST 423 Module 1 revision material and its real `.docx`,
the homework it was attached to, and the class stream post announcing it.

Orphaned upload files were archived and removed, so `storage_objects` and the files on disk now
match exactly — one row, one file.

> Taken before the purge, and not covered by each other:
> - database: `~/edrion-backups/edrion-predelete-20260823-124804.dump`
> - upload files: `~/edrion-backups/orphaned-storage-20260823-133458.tar.gz`

### A cross-tenant reference, found on the way

Deleting Greenwood kept cascading into TocH rows, which turned out not to be a cascade problem:
**16 TocH rows pointed at Greenwood's campus.** Four `grade_levels`, four `department_grade_levels`
and eight `programme_term_slots` carried `campus_id = <Greenwood Main Campus>` while their
`institution_id` said TocH, so one tenant's data hung off another tenant's campus. They were
repointed to TocH's own campus before the purge ran.

Nothing enforces this today: `campus_id` is a plain FK to `campuses`, with no constraint that the
campus belong to the same institution as the row. A composite FK on `(institution_id, campus_id)`
would make it impossible; worth considering.

The smoke suite logs in as `*@greenwood.edu`. Those scripts will fail until they are repointed at
a tenant that exists, or Greenwood is recreated deliberately — `pnpm db:seed` still rebuilds the
fixture tenant, it just no longer injects demo content into it.

### The teaching workspace replaced /class-content

`/class-content` was named after the `class_materials` / `class_stream_posts` tables, not after
anything a teacher does. It listed **every class in the institution** in a dropdown, ignoring
`class_subject_teachers`, which already records exactly who teaches which subject to which class.
It has been deleted and replaced by **Teaching**: you land on the subjects you teach, open one,
and get Notes, Files and Class updates for that subject alone.

Four defects were fixed with it:

1. **Content had no subject.** `class_materials` and `class_stream_posts` had no `subject_id`
   (migration 0203 adds it). A class studies many subjects with different teachers, so every
   subject's handouts landed in one undifferentiated pile and a student could not tell which
   subject a file belonged to.
2. **The list filters were accepted and ignored.** The page sent `contextType` and `contextId`;
   the CRUD engine filtered on `status` and `kind` only and dropped the rest silently, so
   choosing a class changed nothing and unrelated content appeared in the list. The engine now
   applies context, subject, resource-declared equality filters and a `from`/`to` date range —
   and an audit confirmed **0 of 24** engine-backed list schemas still declare a filter the
   engine would drop (`calendarEventListQuerySchema` was the other offender: `eventTypeId`,
   `from`, `to`).
3. **Upload and publish were two steps.** A teacher could upload a file, see the filename appear,
   press the nearest button — which belonged to a different form on the same page — and leave
   believing it was published when no material row existed. `POST /materials/publish` now does
   both in one call, defaulting the title to the file name and the type label to the file type.
4. **A second nav entry named after a table.** "Calendar events" was a CRUD table beside the real
   "Calendar", which already links to it. Removed.

Content created before subjects existed has no subject. Rather than hide it, the workspace asks
for it (`includeUnfiled=true`) and labels it **Not filed under a subject**, so nothing stays
published to students while being invisible to staff.

### Two bugs that made authoring impossible

Both explain why the portal only ever contained seeded rows.

**1. Class content wrote the wrong id into a foreign key.**
`class_stream_posts.posted_by` and `class_materials.posted_by` are enforced FKs to `staff(id)`,
but the service passed `institutionUserId` — a different table's primary key. Every stream post
and material a teacher tried to create violated the constraint. Now resolved through
`resolveCurrentStaffId()`, the helper that already existed for exactly this.

**2. `class_content.manage` was granted to nobody.**
The key was defined in the permission catalogue but appeared in no role, so the Class content
page was invisible and its endpoints returned 403 for every teacher. Same for `homework.manage`
and `homework.grade` — **no named role could assign homework at all.** All three are now granted
to the roles that teach.

**3. A tenant with no attendance policy could never create one.**
`GET /portal/settings/attendance-policy` returned 404 when no policy row existed, so the settings
form rendered empty and there was nothing to save — and the student attendance screen 404'd too.
The demo seed had been inserting a policy row, which hid this completely. The service now falls
back to the column defaults (75% threshold, 5% safe margin, unsaved at version 0); the form
renders, and the first save writes a real row.

### Still unheld by any named role

An audit found 35 catalogue keys granted to no named role. Owner and Admin reach them through
their wildcards, so they are not unreachable — but no functional role holds them. These are worth
a decision, and were **left unchanged** because they alter who can release grades and manage
accounts:

`report_cards.view`, `report_cards.manage`, `report_cards.publish` — the Report cards page is
invisible to every named role, including Principal and Registrar. `students.documents.manage`,
`attendance.absence_notes.review`, `institution_settings.view/manage`, `users.manage`,
`roles.manage`, `audit.export`, `campuses.manage`, and others.

---

## Verifying it works

```bash
bash scripts/class-notes-smoke.sh
```

Runs against the API on `:3007` and proves the round trip end to end: a teacher writes a note,
the draft stays invisible to the student, publishing delivers it, opening it records a read the
teacher can see, edits are versioned, unpublishing withdraws it, and stream posts and materials
stamp a real staff id. It also uploads a real file and downloads it back as the student. 26
assertions.

It cleans up after itself except for one thing: deleting a material does not delete the file it
pointed at. `storage_objects` has no delete path, so every deleted material leaves its upload
behind in the database and on disk. That is a real leak in the product, not just the test —
worth a garbage collector or a cascade before this ships.

Requires `PORTAL_AUTH_DEV_HEADER=true` and `STUDENT_AUTH_DEV_HEADER=true`.

## Reference

| Thing | Where |
| --- | --- |
| Notes schema | `packages/database/src/schema/institutional-bridge.ts` (`classNotes`) |
| Migration | `packages/database/migrations/0202_class_notes.sql` |
| Teacher API | `apps/api/src/modules/portal/course-content/` |
| Student API | `apps/api/src/modules/student/notes/` |
| Teacher UI | `apps/institution-web/src/components/class-content/notes-panel.tsx` |
| Student UI | `apps/student-web/src/app/(app)/notes/` |
| Role grants | `packages/permissions/src/institution/roles.ts` |
