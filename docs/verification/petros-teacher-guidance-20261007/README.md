# Petros Learn teacher guidance

The institutional Teaching workspace's **Petros Learn** tab now starts with a teacher's learning goal. Teachers choose named students or the current enrolled class, describe the learning focus and teaching instructions, choose understanding/practice/review, set a completion date and suggested session length, preview, then assign. Progress and closing a goal are available in the same tab. Reusable lesson pack authoring remains in a collapsed advanced section.

The API resolves teaching authority, campus access and enrolled recipients. A typed `petros_guidance` value and the recipient snapshot are saved atomically through the existing assignment tables. Repeated commands return the original assignment; mismatched commands are rejected. A dedicated migration adds the column; it was applied to the local development database only. Existing unrelated working changes were preserved.

Students find teacher goals in Learn, including school students without college assignment permissions. The goal detail opens the normal Petros session planning flow, preserving the teacher's learning goal, complete teaching instructions, suggested approach and institution-local deadline. Goal previews invalidate when those instructions change. Overdue goals remain available for learning. A student can resume an existing session or report completion with a reflection after completing a learning step. Reports record participation rather than asserting mastery.

Individual goals require an explicit assignee throughout assignment lists/details, Petros context and workload, session intent resolution, course projects, document scheduling and reflection labels. Teacher progress returns only participation metadata for authorized recipients; it does not return session answers or transcripts.

## Supporting files and design alignment

Teacher goals now accept up to five supporting PDFs, documents, presentations, spreadsheets, text files, or images, each up to 20 MiB. Files can be removed before assignment and appear in the preview, teacher history, and student goal. Uploading stages a private file; assigning the goal shares it with the selected recipients. Downloads require current teaching authority or visibility of the assigned student goal. File IDs are validated against the uploader, institution, class, subject, kind, and preparation status before assignment.

Readable document text uses the existing document preview extractors; PDFs use the restricted PDF worker. Petros receives bounded excerpts relevant to the goal. Extraction stores at most 40,000 characters, marks truncation, and never claims unreadable files or images were read. Images and unreadable files remain downloadable student references. Source fingerprints include the attachment ID, file version, and original checksum, so replacing a file invalidates a pending session preview. Supporting files are separate from the student's reflection report.

Institution fields use the existing shared Input, Label, searchable Select, Checkbox, FieldError, and loading Button. Textareas follow the existing Teaching workspace treatment; headers and spacing use the site's institutional typography and tokens. Dates use the institution's configured display format. Student goal cards and actions use the existing student design system. The institutional Tailwind surface colour now points to its existing theme variable; this retains the light palette and corrects pale surfaces with dark-theme text.

## Verification

- API, institution, and student typechecks passed.
- Current targeted API tests: teacher guidance, attachment storage/extraction, completion authority, and session intents — 36 passed.
- Student tests: assigned goal, private file links, and existing contextual entry — 10 passed.
- PostgreSQL integration — 2 passed. Individual goals are hidden from classmates and other institutions; files are restricted by institution/class/subject and selected attachment IDs. Temporary tables only; no learner or assignment fixtures persisted.
- Targeted ESLint: zero errors. Existing Nest decorator import and older test `any` warnings remain.
- Working diff whitespace check passed.
- Running API health returned 200.
- Browser: synthetic teacher and school learner responses. Named selection, shared searchable controls, upload/remove/reattach, preview, exact recipient and attachment payload, progress, close, Learn discovery, supporting-file links, and reflection completion passed. Desktop 1440px and mobile 390px have no horizontal overflow. Light and dark institutional screenshots verify the theme token behaviour. See `browser-results.json` and the PNGs.

Browser checks use synthetic API responses; they do not create real institutional assignments or evaluate a live provider's teaching quality. Storage tests write and read real temporary file bytes; session tests verify that readable file excerpts reach the actual session creation call. The PostgreSQL tests exercise visibility and file scoping against actual SQL.

The browser verification script is `apps/api/scripts/verify-petros-teacher-guidance.ts`; run it with the database package's `tsx` runtime. `PETROS_GUIDANCE_BROWSER` selects the installed Playwright headless browser. The PostgreSQL test requires an explicit local `PETROS_GUIDANCE_TEST_DB_URL`.
