# Edrion All-Portals End-to-End Testing Handbook

**Scope:** Super Admin, Institution Admin, Student Portal, Parent Portal, public institution registration, and public admission application  
**Verified against the workspace:** 15 August 2026  
**Purpose:** A complete, ordered manual test run that starts with a new institution application, continues through a parent/student admission application, and finishes with academic, financial, operational, AI, reporting, security, and year-end workflows.

This is a QA handbook, not a production operating manual. Use a disposable local or staging database. Never run seed/reset commands against production.

---

## 1. What this handbook covers

The test journey is intentionally chronological:

1. Prepare a clean QA environment.
2. A new institution applies publicly.
3. Super Admin reviews and approves it.
4. Super Admin configures the institution's plan, features, and status.
5. The institution owner completes onboarding and academic setup.
6. A parent/student submits a public admission application.
7. Institution staff request information, decide, and enrol the applicant.
8. Student and parent accounts are activated and linked.
9. Staff run academics, finance, communication, health, campus operations, and IT.
10. Student and parent users verify everything published to them.
11. Petros AI, speech transcription, privacy, reporting, and audit are tested.
12. The academic cycle is closed and evidence is signed off.

It also contains a screen-by-screen checklist for every current navigation option in all four portals.

---

## 2. Test result rules

Use these result values throughout the run:

| Result      | Meaning                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| `PASS`      | The action completed and the expected UI, data, downstream visibility, and audit result all matched.    |
| `FAIL`      | The feature is implemented but did not behave as expected. Record the exact message and correlation ID. |
| `BLOCKED`   | A dependency such as an API, provider, permission, email, or seed is unavailable.                       |
| `KNOWN GAP` | The route is visibly present in navigation but is currently a placeholder or has no page.               |
| `N/A`       | The item does not apply to the chosen institution type, plan, campus, or role.                          |

For every test, capture:

- Test ID and date/time.
- Tester, browser, viewport, and portal role.
- Institution, campus, academic year, term, class, student, and parent used.
- Input data or record ID.
- Expected result and actual result.
- Screenshot or short screen recording for failures.
- Network status, API error body, and `x-correlation-id` for failures.
- Matching Audit Logs entry for mutations and sensitive reads.

Use a unique run suffix such as `QA-20260815-A` in every disposable name. This makes cleanup and audit searches easy.

---

## 3. Current local URLs

| Surface                         | URL                                                           |
| ------------------------------- | ------------------------------------------------------------- |
| API                             | `http://localhost:3007/v1`                                    |
| API health                      | `http://localhost:3007/v1/health`                             |
| API documentation               | `http://localhost:3007/docs`                                  |
| Super Admin                     | `http://localhost:3006/login`                                 |
| Institution Admin               | `http://localhost:3008/login`                                 |
| Parent Portal                   | `http://localhost:3008/family` after parent login at `/login` |
| Public institution registration | `http://localhost:3009/register`                              |
| Public admission application    | `http://localhost:3009/apply`                                 |
| Public admission status         | `http://localhost:3009/apply/status`                          |
| Student Portal                  | `http://localhost:3011/login`                                 |

Important: the current Parent Portal is consolidated into `institution-web`. Older documentation that mentions a separate `parent-web` app or port `3004` is stale.

---

## 4. Prepare the QA environment

### 4.1 Safety check

Before running any database command:

1. Open `.env` and verify `DATABASE_URL` points to the disposable QA database.
2. Confirm it is not a production hostname or database.
3. Back up any QA data you need to retain.
4. Do not put API keys, OTPs, passwords, cookies, or tokens in screenshots or issue reports.

`pnpm db:reset` and cleanup utilities are destructive. They are deliberately not part of the normal test run.

### 4.2 Install, migrate, and seed

From the repository root:

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm --filter @edrion/database seed:portal
pnpm --filter @edrion/database seed:parent
```

The first seed establishes the platform, sample institution, core academic data, and basic portal users. `seed:portal` adds representative institution roles. `seed:parent` adds three comprehensive guardian scenarios and representative rows across the parent domains.

### 4.3 Authentication flags for a real role test

Dev headers can silently impersonate the default owner and make a restricted-role test invalid. For the primary manual run, set these in `.env`, then restart the API and web apps:

```dotenv
AUTH_DEV_HEADER=false
PORTAL_AUTH_DEV_HEADER=false
STUDENT_AUTH_DEV_HEADER=false
```

Use the normal **Password** tab and the seeded passwords. Keep `REGISTRATION_OTP_DEV_RETURN=true` only on disposable local development if you want registration and admission OTPs returned for testing. It must be `false` in production.

Run a second, explicitly labelled dev-auth smoke later if the header escape hatches themselves need coverage.

### 4.4 Start the apps

The shortest option is:

```bash
pnpm dev
```

If you prefer separate terminals:

```bash
pnpm --filter @edrion/api dev
pnpm --filter @edrion/super-admin-web dev
pnpm --filter @edrion/institution-web dev
pnpm --filter @edrion/public-web dev
pnpm --filter @edrion/student-web dev
```

Verify the API before testing UI:

```bash
curl -fsS http://localhost:3007/v1/health
```

Expected: HTTP 200 and a healthy response. Also confirm each web URL opens without a CORS error.

### 4.5 Seeded QA credentials

All passwords below are `password` and are for local seeded QA only.

| Portal      | Login                        | Purpose                                                     |
| ----------- | ---------------------------- | ----------------------------------------------------------- |
| Super Admin | `owner@edrion.dev`           | Full platform owner coverage.                               |
| Super Admin | `support@edrion.dev`         | Restricted support user; deliberately lacks AI permissions. |
| Institution | `owner@greenwood.edu`        | Institution owner with broad access.                        |
| Institution | `admin@greenwood.edu`        | Institution administrator.                                  |
| Institution | `campus.north@greenwood.edu` | Campus-scoped administrator.                                |
| Institution | `principal@greenwood.edu`    | Principal role.                                             |
| Institution | `finance@greenwood.edu`      | Finance-only coverage.                                      |
| Institution | `hr@greenwood.edu`           | HR-only coverage.                                           |
| Institution | `teacher@greenwood.edu`      | Teacher workflows.                                          |
| Institution | `nurse@greenwood.edu`        | Health workflows.                                           |
| Institution | `counselor@greenwood.edu`    | Counseling confidentiality.                                 |
| Institution | `lab@greenwood.edu`          | Lab workflows.                                              |
| Institution | `reception@greenwood.edu`    | Front desk workflows.                                       |
| Institution | `it@greenwood.edu`           | Device, access, and webhook workflows.                      |
| Institution | `maintenance@greenwood.edu`  | Facilities and work orders.                                 |
| Institution | `security@greenwood.edu`     | Gate, visitor, incident, and alert workflows.               |
| Student     | `student1@greenwood.edu`     | Aarav Sharma; preferred linked student test account.        |
| Student     | `student2@greenwood.edu`     | Second-student isolation coverage.                          |
| Student     | `student3@greenwood.edu`     | Third-student isolation coverage.                           |
| Parent      | `parent@greenwood.edu`       | Basic linked parent.                                        |
| Parent      | `guardian.a@greenwood.edu`   | Two children; child switcher coverage.                      |
| Parent      | `guardian.b@greenwood.edu`   | Second guardian of guardian A's first child.                |
| Parent      | `guardian.c@greenwood.edu`   | Fees hidden by guardian visibility override.                |

Student login accepts either the email address or the student's configured student/admission ID.

---

## 5. Master lifecycle: institution creation to end of cycle

Run this section in order. Do not substitute the Greenwood seed for the new-institution steps; a new institution proves that provisioning works. Greenwood can then be used for the large, populated module sweep.

### Phase A — Public institution registration

#### `L-001` Start a new application

1. Open `http://localhost:3009/register` in a private window.
2. Choose **Start new**.
3. Enter a unique contact email that you can access, for example `owner+QA-20260815-A@example.test` on a local email sink.
4. Request the OTP.
5. Enter the six-digit code. On local development, use the returned development code or the API/email log; on staging, use the delivered email.
6. Confirm the email changes to verified.

Expected:

- A draft is created and a resume token is stored only for the applicant.
- The OTP expires after ten minutes, is single-use, and cannot be brute-forced indefinitely.
- Resend is rate-limited; a changed email requires fresh verification.
- Reloading resumes the same draft.

#### `L-002` Complete all registration sections

Fill every section, not only the required fields:

1. **Institution:** legal name, display name, school/college/university/training-center type, established year, website, registration number, and logo URL.
2. **Location:** country, state/province, city, postal code, full address, and timezone.
3. **Campuses:** current campus count, expected count next year, first campus name, expected students, and expected staff.
4. **Contact:** full name, job title, phone, and preferred email/phone/WhatsApp method.
5. **Choose your plan:** plan, expected launch, current ERP, acquisition source, and requirements.
6. **Consent:** open the referenced terms, tick required agreements, and test that submission is blocked if a required agreement is unticked.
7. On **Review**, use **Edit** on one section, change a value, return, and confirm the review reflects it.
8. Submit.

Expected:

- Autosave shows success and survives a reload.
- Invalid URLs, phones, years, and missing required fields are rejected inline.
- Submission produces a reference like `EDR-REG-YYYY-NNNNNN` and the success page.
- A second active submission for the same email is blocked or resumes the existing request.

#### `L-003` Resume and isolation checks

1. Start another draft, close the browser, reopen it, and use the local resume choice.
2. Use the email/code cross-device resume flow in a different private window.
3. Try the draft ID without its resume token.
4. Try an expired/incorrect OTP five times.

Expected: valid resume restores the draft; a missing/wrong token cannot read it; OTP lockout and rate limits activate without revealing another applicant's data.

### Phase B — Super Admin review and provisioning

#### `L-010` Find and start review

1. Sign in to Super Admin as `owner@edrion.dev` using **Password**.
2. Open **Customers → Registration Requests**.
3. Search by the submitted reference/email; filter by `submitted`.
4. Open the request and compare every section with the public submission.
5. Confirm verification state, forensic metadata, history, and no exposure of secrets/OTP.
6. Click **Start review**.
7. Click **Assign**, choose a reviewer, and save.
8. Add an internal note.

Expected: status becomes `under_review`; reviewer and note persist; the applicant-facing data never contains internal notes; each action appears in the immutable audit trail.

#### `L-011` Negative decision path

Use a second disposable request:

1. Open it and click **Reject**.
2. Verify a reason is required.
3. Confirm the sensitive action.
4. Verify status `rejected`, decision history, notification attempt, and audit event.
5. Confirm no institution was created from the rejected request.

#### `L-012` Approve and provision

Return to the primary request:

1. Click **Approve**.
2. Review the confirmation wizard and selected plan.
3. Provide the required reason/confirmation and complete approval.
4. Open the linked institution.

Expected, atomically:

- Registration request becomes `approved`.
- A new institution is created in `onboarding` status, not automatically active.
- The first campus is created.
- The primary institution administrator is created in `invited` status.
- Six onboarding checklist items are created.
- The request links to the institution.
- Provisioning and sensitive approval are audited.

If any item is missing, treat the entire approval as failed; do not manually patch over it during this test.

### Phase C — Super Admin commercial and product setup

#### `L-020` Validate institution record

1. Open **Customers → Institutions** and find the new public ID.
2. Check **Overview**, **Campuses**, **Users**, **Subscription**, **Billing**, and **Access sessions**.
3. Confirm the institution type, country, support tier, first campus, invited user, chosen plan, and trial dates.
4. Open the invited user from **Institution Users** and confirm role and institution boundaries.

#### `L-021` Configure plan, subscription, and features

1. If necessary, open **Plans & Pricing** and confirm the selected published plan/version.
2. In the institution's **Subscription** tab, attach or verify the plan, billing cycle, trial, and limits.
3. In **Feature Controls**, verify all modules required for this run are active and entitled for the institution.
4. Check that a disabled feature is absent/blocked in the institution portal, then restore it.
5. Check Billing reflects the subscription without exposing provider secrets.

#### `L-022` Activate only after onboarding readiness

1. Complete the minimum institution setup described in Phase D.
2. Return to the institution detail and click **Activate** with a reason.
3. Confirm status `active` and activation timestamp.
4. Confirm the institution now appears in the public `/apply` institution picker.

Also test valid status transitions on a disposable institution: restrict, reactivate, suspend, reactivate, and archive. Verify invalid transitions are not offered and every transition is audited.

### Phase D — Institution invitation, onboarding, and setup

#### `L-030` Accept invitation or activate the owner

1. Open the invitation URL from the local email log/mailbox.
2. Confirm an invalid or already-used token fails safely.
3. Set the password and complete activation.
4. Sign in at `http://localhost:3008/login`.
5. Confirm a staff role lands at `/dashboard` and a parent role lands at `/family`.

If email delivery is outside this test environment, document it as `BLOCKED`, then use `owner@greenwood.edu` for the remaining populated module tests. Do not mark invitation delivery as passed.

#### `L-031` Complete onboarding

Open `/onboarding` and complete the visible setup checklist:

1. Institution profile and nomenclature.
2. Primary campus.
3. Academic year and term structure.
4. Grade/programme structure appropriate to the institution type.
5. Subjects/curriculum and classes/sections.
6. Invite staff and configure permissions.

Expected: completion state persists, progress increases, completed items link to the correct records, and **Go to dashboard** becomes available when ready.

#### `L-032` Configure core academic dependencies

In this dependency order:

1. **Academic Years:** create the run year, set start/end dates, and make it current.
2. **Departments:** create at least one department and assign a head if available.
3. **School:** create Grades. **College/university/training:** create Programme Structure levels instead.
4. **Subjects:** create one theory and one lab subject.
5. **Terms:** create dates inside the academic year and mark the current term.
6. **Classes:** create a class/section with room and capacity; apply curriculum/subjects.
7. **Campuses:** confirm the class and users are correctly campus-scoped.

Expected: invalid date ranges, duplicates, capacity violations, and cross-campus references are blocked.

#### `L-033` Configure people, access, and publication policies

1. Create/invite one teacher, finance user, nurse, counselor, receptionist, IT user, maintenance user, and security user.
2. Assign their roles and only the required campus access.
3. Use **Roles & Permissions** to inspect role permissions.
4. Add one direct grant to a disposable user, confirm it works, then remove it.
5. Add one direct deny, confirm deny wins over role access, then remove it.
6. Configure **Settings → Student portal**, request types, calendar types, attendance policy, results, grading schemes, and document templates.
7. Configure and publish a **Petros policy** version.

Expected: navigation changes with permissions/features; restricted users receive a proper permission-denied state and cannot bypass it by typing the URL.

### Phase E — Parent/student public admission application

The institution must be `active` or trial-eligible and have public academic options before this phase.

#### `L-040` Start the admission application

1. Open `http://localhost:3009/apply` in a private window.
2. Choose the newly activated institution.
3. Enter the contact email that will receive status messages.
4. Confirm a draft is created and autosave begins.

#### `L-041` Complete all eight admission steps

1. **Institution:** select the target institution and contact email.
2. **Admission/programme:** select campus, academic year, grade/programme, and any offered programme value.
3. **Student:** first, middle, last name, gender, date of birth, and previous school.
4. **Guardian:** full name, relationship, phone, and email.
5. **Contact:** phone and complete address.
6. **Health:** blood group, emergency contact, medical conditions, allergies, medications, accommodations, and notes.
7. **Review:** edit one earlier answer and confirm the corrected value.
8. **Verify:** request and enter the email OTP, then submit.

Expected:

- Required names and contact email are enforced.
- Country-aware phone/address validation works.
- Autosave survives reload and same-device resume.
- Cross-device resume requires email verification.
- Submission creates an `ADM-...` reference and success page.
- `/apply/status` shows only the caller's authorised application status.

#### `L-042` Information-request round trip

1. Sign in as institution owner/admin and open **Admissions**.
2. Filter **Source = Portal**, find the `ADM-...` reference, and open it.
3. Confirm all applicant, guardian, target, address, health, and additional information arrived intact.
4. In **Request more information**, add:
   - required short-text field;
   - dropdown/MCQ with choices;
   - required birth-certificate file field;
   - optional multi-file field.
5. Add a message and send.
6. Open the secure link as the applicant, complete the fields, upload allowed files, and submit.
7. Return to the institution application and inspect the response/downloads.

Expected: application becomes `info_requested`; the secure link is scoped and expiring; file type/size validation works; staff can see submitted answers; other applicants cannot access the link/files.

#### `L-043` Decide and enrol

1. Test **Waitlist** on a disposable application and confirm notification/status.
2. Test **Reject** on a disposable application and confirm reason, notification, and no student record.
3. On the primary application choose **Accept**, add a decision note, keep email notification enabled, and save.
4. In **Enrol applicant**, set a unique admission number and optionally select department, programme/grade, term, and class.
5. Click **Enrol student**.

Expected:

- Decision transitions persist and are audited.
- Enrolment is offered only for an accepted, not-yet-enrolled applicant.
- A student record is created once; repeat enrolment cannot duplicate it.
- The application becomes enrolled and links to the student.
- Guardian/contact information is retained for later parent linking.

### Phase F — Activate and link Student and Parent access

#### `L-050` Student access

1. Open **People → Students** and locate the enrolled applicant.
2. Assign campus, class, roll/admission number, and any missing demographic data.
3. Issue the student portal activation/invitation.
4. Open `http://localhost:3011/activate`, use the activation code/link, and set a password.
5. Sign in by email, sign out, then sign in by student ID.

Expected: one active student identity maps only to its student record and institution; expired/reused activation codes fail.

#### `L-051` Parent access and guardianship

1. Open **People → Parents** and create or locate the guardian.
2. Link the parent to the enrolled student with relationship, primary/emergency-contact flags, and allowed visibility.
3. Invite/activate the parent account.
4. Sign in at `http://localhost:3008/login` with the parent credentials.

Expected: the role automatically lands at `/family`; only linked wards are shown; another student's ID cannot be forced into the URL.

### Phase G — Daily cross-portal operating scenarios

Use the same class/student/parent throughout so every downstream result is traceable.

#### `L-060` Timetable, calendar, and attendance

1. Institution: publish timetable slots for the class and create/publish a calendar event.
2. Institution: open Attendance, create a register, bulk mark most students present, mark the test student absent/late, and save.
3. Student: confirm the slot at `/timetable`, event at `/calendar`, and attendance summary at `/attendance`.
4. Parent: confirm the child's timetable/event context and absence at `/family/child/{studentId}/attendance`.
5. Parent: submit an absence note.
6. Institution: review the absence note in Approvals/attendance workflow.

Expected: only published/in-scope records appear; totals recalculate; parent note status updates after staff review.

#### `L-061` Class content, homework, assignment, and materials

1. Institution: post one class-stream update and upload one material.
2. Institution: create homework as draft, add instructions/questions and optional Petros-help mode, then assign it.
3. Institution: create an assignment as draft, test file and online-quiz authoring, then publish it.
4. Student: view the stream/material, open homework, submit text/photo/file, and confirm submission history.
5. Student: open the assignment, request allowed help, submit, and confirm timestamp/status.
6. Institution: inspect submissions, grade them, add feedback, close the work, and confirm late/duplicate rules.

Expected: drafts are invisible to students; published/assigned items are visible only to the target class; submissions belong only to the logged-in student; staff grade is reflected in progress/results where designed.

#### `L-062` Exams, gradebook, results, and report cards

1. Institution: create an exam, author questions, schedule it, and publish the schedule.
2. Student: confirm the exam appears; if online, start an attempt, save answers, submit, and verify no second attempt unless configured.
3. Institution: enter marks in Gradebook, add grade/remarks, and keep them unpublished.
4. Student and Parent: confirm unpublished results are not visible.
5. Institution: publish/release marks.
6. Student: confirm `/results` now shows only the student's marks.
7. Parent: confirm `/family/child/{studentId}/results` shows the ward's published results.
8. Institution: generate report cards, validate releases, review, publish, and test structured and uploaded-PDF paths.
9. Student and Parent: open/download the published report card.

Expected: every publication gate holds; invalid marks/max marks are rejected; a learner/guardian cannot change IDs to access another report.

#### `L-063` Fees and payments

1. Institution: create a fee structure with line items, tax, installments totaling exactly 100%, late-fee mode, and grace days.
2. Save a new version and activate it.
3. Generate an invoice for the test student and download the generation report.
4. Student: view dues at `/fees`, open `/fees/pay`, and complete the configured test payment.
5. Parent: view `/family/fees`, pay the same appropriate invoice or inspect its settled state, and download the receipt.
6. Institution: confirm invoice/payment/receipt reconciliation.
7. Guardian C: sign in and confirm fees are hidden by visibility override.

Expected: billed invoices do not change when a fee-structure version changes; settlement is idempotent; cancelled/other-student invoices cannot be paid; no provider secret is exposed.

#### `L-064` Communication, notices, consent, messages, and PTM

1. Institution: create an announcement as draft, target the test class/role, publish it, then later archive it.
2. Student: verify the published announcement and notification; mark notification read if supported.
3. Parent: verify the notice in Inbox and acknowledge it.
4. Parent: answer a published consent form.
5. Institution: start a message thread, attach a file, send a voice message, reply, add/remove a participant, and archive the thread.
6. Parent: use **More → Message school**; staff replies; confirm both sides see the thread.
7. Institution: create a PTM event and slots.
8. Parent: book a slot, verify double-booking prevention, cancel, and rebook.

Expected: drafts and wrong audiences stay hidden; acknowledgements/consents are one guardian's own; attachment/voice rules work; unread counts update; PTM capacity is enforced.

#### `L-065` Health, counseling, conduct, and wellbeing

1. Nurse: create/update the student's health record.
2. Nurse: log a medication administration and a medical incident that notifies guardians.
3. Parent: verify permitted health profile, visit/incident, medication information, and critical notification.
4. Institution: create a conduct incident and recognition; publish the allowed parent-facing record and require acknowledgement.
5. Parent: view and acknowledge the published behavior item.
6. Counselor: create confidential counseling notes/case.
7. Parent, teacher, and unrelated staff: confirm confidential data is not visible.
8. Counselor: create an explicit allowed disclosure, then confirm only that disclosure becomes visible to the guardian.

Expected: medical/emergency notifications bypass quiet hours where designed; counseling existence/content is not leaked; sensitive actions require permissions/recent auth and are audited.

#### `L-066` Library, transport, hostel, and documents

1. Institution: add a library item, issue it to the student, return it, and verify loan state/fine behavior.
2. Institution: create transport route/vehicle and assign the student.
3. Institution: create hostel block/room and allocation if enabled.
4. Student: confirm own library/material context, transport, hostel, and document vault surfaces.
5. Parent: confirm the same ward's library, transport, and hostel information.
6. Parent: submit a document/certificate request.
7. Institution: generate, inspect, sign/deliver the document; test **Send back** on a second request and **Revoke** on a disposable delivered document.
8. Student/Parent: download the delivered document and confirm a revoked document is blocked/labelled.

#### `L-067` Front desk, pickup, gate, facilities, and security

1. Reception: create a visitor/appointment and check the visitor in/out.
2. Parent: add pickup authorisation and submit an early-leave/gate request.
3. Reception/Security: verify the pickup person, approve the request, record the gate exit, and confirm duplicate exit is blocked.
4. Security: create a security incident, review access logs, and send a test emergency alert to a tightly scoped QA audience.
5. Parent: verify gate/exit/emergency notifications.
6. Maintenance: create facility, asset, work order, and maintenance task; assign, progress, and complete it.

Expected: append-only gate/emergency records cannot be edited away; permissions and campus scope hold; emergency fan-out is audited.

#### `L-068` Inventory, expenses, payroll, careers, labs, and IT

1. Inventory: create an item and stock-in/stock-out movements; confirm no negative stock.
2. Expenses: create categories/expense, move through review/payment statuses, and verify finance-only visibility.
3. Payroll: create a run/items, process allowed transitions, and verify non-HR/finance denial.
4. Careers: create placement season/company/opportunity/application and advance the candidate status.
5. Labs: create lab/inventory, schedule a session, record an incident, and inspect debate calibration with the authorised role.
6. IT: register a device, submit/approve/deny an access request, create a webhook, test delivery, rotate its secret, and inspect delivery history.

### Phase H — Petros AI and speech-transcription testing

#### `L-070` Provider and routing readiness

1. Super Admin: open **AI Administration → Petros AI Routing**.
2. In **Providers & models**, confirm each provider credential is stored server-side, resume the intended provider, and use **Test connection**.
3. Confirm configured models advertise the required capabilities: text, structured output, vision/image where used, and speech/transcription where used.
4. In **AI functions**, verify each function is enabled and has a route.
5. In **Topic profiles**, verify topic-specific choices/fallbacks.
6. In **Routing rules**, verify priority, health/fallback, latency/cost constraints, and no loop.
7. In **Usage & budgets**, set a small QA warning threshold and verify accounting.
8. In **Decision diagnostics**, run a dry decision and record why the provider/model was chosen.

Never paste an API key into screenshots or this handbook. Test only the masked credential state and connection result.

#### `L-071` Student Petros text loop

1. Sign in as `student1@greenwood.edu` and open `/petros`.
2. Start a session through every available door/input purpose.
3. Ask a concept question in text.
4. Confirm Petros asks/uses the learning goal, adapts one move at a time, and does not simply replace the student's assessed work.
5. Complete a teach-it-back/reflection step and inspect `/learning-path`, `/progress`, and `/petros/artifacts`.
6. Confirm another student cannot see the session, artifacts, or learner model.

#### `L-072` Speech transcription and replay

Use a quiet room and a 5–15 second recording containing a unique phrase and one subject-specific term.

1. Start a Petros voice interaction and grant microphone permission.
2. Record, stop, and submit once. Do not double-click submit.
3. Confirm upload/progress state is visible and the controls are disabled appropriately during processing.
4. Confirm a transcript is returned and shown before/with the AI response.
5. Compare names, numbers, punctuation, and the subject-specific term with the audio.
6. Use transcript correction if available and confirm the corrected text—not the wrong original—is used downstream.
7. Replay the audio and confirm it is the same recording.
8. Test silence, a very short clip, background noise, denied microphone permission, lost network during upload, unsupported format, and a clip above the limit.
9. Retry after a transient provider failure and confirm only one learner turn/artifact is created.
10. Confirm audio/transcript retention and deletion follow the published privacy policy.

Expected success: the UI never shows **“did not return a transcript”** for a valid supported clip, the turn continues once, and routing/usage/audit identify the chosen speech provider/model without exposing credentials.

If the transcript is missing:

1. Mark `FAIL`, not `PASS with text fallback`.
2. Save timestamp, student/session/turn IDs, audio duration/format/size, provider/model, route decision, HTTP status, API error body, and correlation ID.
3. Confirm whether failure occurred at permission, capture, upload, provider response, transcript mapping, or UI rendering.
4. Replay once to rule out empty/corrupt capture; then switch to text only to continue other tests.
5. Verify failed attempts do not charge twice or create duplicate AI turns.

#### `L-073` Photo/handwriting and teacher support

1. Submit a clear and a deliberately poor-quality photo/handwriting sample.
2. Confirm extraction/OCR asks for clarification when uncertain and does not invent unreadable content.
3. Request a teacher handoff with student consent.
4. Teacher: open **Petros support**, inspect the privacy-safe summary, mark it read, and verify no raw answers, hidden reasoning, provider details, or under-threshold student identities.
5. Verify class struggle signals suppress small cohorts and stay fresh/audited.

#### `L-074` Super Admin AI governance

1. Inspect **Petros Quality** synthetic runs, exports, failure reruns, and baseline promotion guard.
2. Inspect **Learner Models** with authorised owner and denial with restricted support.
3. Inspect aggregate **Artifacts**, **Doors**, **Modalities**, **Teach-it-back**, **Reflection**, and **Institutional Loop** dashboards.
4. Inspect **AI Audit** for every tested run, route, cost/usage, result, and safe metadata.
5. Confirm restricted `support@edrion.dev` cannot access AI pages or data by direct URL/API.

### Phase I — Reports, audit, security, and cycle closure

#### `L-080` Reports and exports

1. Institution: run each available report definition with a narrow QA date/campus/year filter.
2. Download each supported export and verify headers, row counts, timezone/date/currency formatting, and tenant scope.
3. Super Admin: export filtered platform audit logs.
4. Confirm exports do not include hidden guardian sections, confidential counseling notes, secrets, or another tenant's data.

#### `L-081` Permission and tenant matrix

Repeat a permitted and forbidden action with owner, campus admin, teacher, finance, HR, nurse, counselor, lab, reception, IT, maintenance, security, student, guardian A, and guardian C.

For every denied case, verify all three:

1. The navigation item is hidden or clearly disabled.
2. Direct URL/API access is denied.
3. No mutation/audit side effect occurred except the appropriate security record.

Also alter visible record IDs in URLs/requests to prove institution, campus, student, and guardian isolation.

#### `L-082` End-of-term/year workflow

1. Close homework and assignments; verify no late changes unless permitted.
2. Finalise attendance registers and compare rollups.
3. Finalise exams/gradebook; validate and publish report cards.
4. Settle/refund/cancel only the allowed fee invoices and reconcile receipts.
5. Return library loans and close transport/hostel allocations where appropriate.
6. Complete open work orders, access requests, incidents, PTM events, approvals, and support cases.
7. Run final reports and preserve approved evidence.
8. Change the academic year/term status according to policy and create the next period.
9. Verify historical student/parent views remain read-only and correctly scoped.
10. Review institution and platform audit trails for the complete run.

---

## 6. Super Admin — every navigation option

Use `owner@edrion.dev` for positive tests and `support@edrion.dev` for restricted tests. Every mutation must be reasoned where required, reflected in the target record, and present in Audit Logs.

| ID       | Navigation / route                                   | What to test                                                                                                                                                        | Expected result                                                                                                              |
| -------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `SA-001` | Dashboard `/dashboard`                               | Load metrics/cards, compare counts with list pages, follow card links, refresh.                                                                                     | Accurate totals, no cross-environment data, links preserve intended filters.                                                 |
| `SA-002` | Copilot `/copilot`                                   | Ask read-only question; request a mutation; preview, cancel, then separately confirm an allowed disposable mutation.                                                | Read answers cite current platform data; mutation never runs before confirmation; cancel has no side effect; run is audited. |
| `SA-003` | Pending Actions `/pending-actions`                   | Open each pending category/item and resolve one disposable action.                                                                                                  | Badge/count and list update after resolution; deep link opens the correct record.                                            |
| `SA-004` | Activity Centre `/activity`                          | Filter/search/paginate activity and inspect risk/severity metadata.                                                                                                 | Chronological, stable pagination; sensitive values redacted; entity links work.                                              |
| `SA-010` | Institutions `/institutions`                         | Search/filter/sort/page; create a disposable institution; open detail; test valid status transitions.                                                               | Unique public ID; persisted profile; invalid transitions absent; mutations audited.                                          |
| `SA-011` | Institution detail                                   | Test Overview, Campuses, Users, Subscription, Billing, and Access Sessions; use **Enter portal** only with an approved support-access reason/session.               | Live tabs show tenant data; support entry is time-bound, bannered, scoped, revocable, and audited.                           |
| `SA-012` | Institution detail placeholders                      | Open Features, Usage, Support, Activity, Audit, Security, Notes, and Settings tabs.                                                                                 | **Current known gap:** these tabs display “delivered in a later phase.” Record `KNOWN GAP`, not `PASS`.                      |
| `SA-013` | Registration Requests `/registration-requests`       | Search/filter; inspect request; start review, assign, add note, reject one, approve one.                                                                            | Correct status machine, notifications, provisioning, recent-auth protection, audit.                                          |
| `SA-014` | Campuses `/campuses`                                 | Filter by institution/status; open institution from a campus; validate campus totals/scope.                                                                         | Campus belongs to exactly one institution; no unrelated data.                                                                |
| `SA-015` | Institution Users `/institution-users`               | Search/filter; open detail; change roles/campus access; add/remove grant and deny; enable/disable/unlock; require MFA; force reset; revoke sessions; resend invite. | Preview/reason/version controls work; deny wins; session revocation is immediate; history/audit complete.                    |
| `SA-020` | Independent Users `/independent-users`               | Search/filter/page and enable/disable a disposable user.                                                                                                            | State and eligibility update; institution users are not mixed into the directory.                                            |
| `SA-021` | Individual Subscriptions `/individual-subscriptions` | Open from navigation and directly.                                                                                                                                  | **Current known gap:** no page exists; expect 404. File as a readiness gap.                                                  |
| `SA-030` | Employees `/employees`                               | Create disposable employee, filter, assign/manage roles, disable/re-enable.                                                                                         | Platform identity only; effective permissions change immediately; action audited.                                            |
| `SA-031` | Platform Roles `/platform-roles`                     | Inspect system roles and expand permission lists.                                                                                                                   | Catalogue matches effective permissions; read-only/system safeguards hold.                                                   |
| `SA-040` | Plans & Pricing `/plans`                             | Search/filter; create/edit plan/version; verify prices, currency, campus allowance, trial days, publish rules.                                                      | Published versions are immutable as designed; subscriptions retain their referenced version.                                 |
| `SA-041` | Subscriptions `/subscriptions`                       | Filter by status/cycle; open detail; validate plan, institution, dates, limits, and lifecycle actions.                                                              | Tenant/plan links correct; invalid transitions or destructive changes blocked.                                               |
| `SA-050` | Feature Controls `/features`                         | Search/filter/open; activate, deactivate, and archive a disposable feature; test entitlement downstream.                                                            | Feature state changes availability consistently; archived feature is not newly assignable; audit exists.                     |
| `SA-060` | Support Cases `/support`                             | Create case, assign/advance through statuses, add context, close.                                                                                                   | Required fields/status progression hold; links to institution/user work; audit/history preserved.                            |
| `SA-061` | Access Sessions `/access-sessions`                   | Request/approve/use/revoke/expire a support session; attempt outside its scope.                                                                                     | Least privilege, visible banner, expiry/revocation, and complete access audit.                                               |
| `SA-062` | Integrations `/integrations`                         | Create endpoint, test, inspect deliveries, rotate secret, enable/disable.                                                                                           | Secret shown only at allowed creation/rotation moment; signatures/retries/history work.                                      |
| `SA-070` | Announcements `/announcements`                       | Open from navigation and directly.                                                                                                                                  | **Current known gap:** no Super Admin page exists; expect 404.                                                               |
| `SA-080` | AI Control Centre `/ai`                              | Review AI health, usage, function/provider warnings, and deep links.                                                                                                | Totals agree with routing/usage/audit; warnings lead to the correct configuration.                                           |
| `SA-081` | Petros AI Routing `/ai/petros-routing`               | Test AI Functions, Topic Profiles, Providers & Models, Routing Rules, Usage & Budgets, Decision Diagnostics.                                                        | Healthy connection, deterministic route explanation, fallback, budget accounting, no credential exposure.                    |
| `SA-082` | Petros Quality `/ai/petros-quality`                  | Inspect isolated synthetic runs; export JSON/CSV; rerun failures; promote only passing baseline.                                                                    | Production student data/writes rejected; failed gate cannot be baseline; immutable imported evidence.                        |
| `SA-083` | Learner Models `/ai/petros-learner-model`            | Search authorised learner; inspect mastery, moves, pace, errors, calibration, plan, reconciliation/jobs; test cross-tenant denial.                                  | Bounded/redacted model, no hidden reasoning/raw content, audited access.                                                     |
| `SA-084` | Petros Artifacts `/ai/petros-artifacts`              | Filter/refresh aggregate artifact statistics and status.                                                                                                            | Aggregate-only authorised data; no learner content/PII leakage.                                                              |
| `SA-085` | Petros Doors `/ai/petros-doors`                      | Review session origins/door mix and filters.                                                                                                                        | Counts match tested sessions; privacy-safe aggregation.                                                                      |
| `SA-086` | Petros Modalities `/ai/petros-modalities`            | Review text/voice/photo/handwriting outcomes and transcript/extraction failures.                                                                                    | Counts reconcile with test turns; failure categories and latency are useful without raw content.                             |
| `SA-087` | Teach-it-back `/ai/petros-teach-back`                | Filter outcomes/quality and inspect permitted aggregate evidence.                                                                                                   | Accurate aggregate completion/quality; no student answer leakage.                                                            |
| `SA-088` | Petros Reflection `/ai/petros-reflection`            | Refresh global/institution aggregates; test privileged individual-evidence denial without recent auth.                                                              | Aggregate reads audited; individual evidence separately protected.                                                           |
| `SA-089` | Institutional Loop `/ai/petros-institutional`        | Filter by institution; inspect teacher handoffs and parent-digest aggregates.                                                                                       | Aggregate-only, correct tenant filter, audited without inspecting content.                                                   |
| `SA-090` | AI Audit `/ai/audit`                                 | Filter/page through runs; inspect model/provider/function/status/usage/error metadata.                                                                              | Every AI call has traceable safe metadata; prompts/secrets/hidden reasoning are not exposed.                                 |
| `SA-100` | Platform Settings `/settings`                        | Open from navigation and directly.                                                                                                                                  | **Current known gap:** no page exists; expect 404.                                                                           |
| `SA-101` | System Health `/system-health`                       | Inspect API/database/Redis/queue/provider status and degraded states.                                                                                               | Status matches real dependencies; no secret/connection-string disclosure.                                                    |
| `SA-102` | Security Centre `/security`                          | Open from navigation and directly.                                                                                                                                  | **Current known gap:** no page exists; expect 404.                                                                           |
| `SA-103` | Audit Logs `/audit`                                  | Filter by actor/action/entity/date; inspect diffs/correlation; export; attempt modification.                                                                        | Complete tenant-safe, append-only results; export matches filter; modification impossible.                                   |

Super Admin authentication extras:

- Test password login, invalid password lockout, forgot/reset, logout, revoked session, and browser back after logout.
- Treat **Dev login** and **Access token** as explicitly non-production test modes; prove the API rejects them when their flags are off.
- Sensitive actions must enforce recent authentication/MFA when those controls are enabled.

---

## 7. Institution Admin — every navigation option

Navigation is permission-, feature-, campus-, and institution-type-aware. A missing item can be correct for a restricted role. Test the owner first, then the role matrix.

| ID       | Navigation / route                                   | What to test                                                                                                             | Expected result                                                                             |
| -------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `IA-001` | Dashboard `/dashboard`                               | Cards, counts, campus/year/term context, links, refresh.                                                                 | Counts agree with modules and respect scope.                                                |
| `IA-002` | Attention Centre `/attention`                        | Filter/open/resolve urgent items and deep links.                                                                         | Priority and badge update after the source issue changes.                                   |
| `IA-003` | Petros `/petros`                                     | New/conversation list, text request, safe response, confirmation before mutations if offered.                            | Institution-scoped, permission-gated, audited; no secret/hidden reasoning.                  |
| `IA-004` | Petros support `/petros-support`                     | Delivered student-consented handoffs, mark read, class struggle signals.                                                 | Privacy-safe summaries; small cohorts suppressed; assignment scope enforced.                |
| `IA-010` | Approvals `/approvals`                               | Open queue; approve/reject a request with note; test batch draft/preview/generate/review.                                | State/history update; conflicting/stale versions blocked.                                   |
| `IA-011` | Grievances `/workflow/grievances`                    | Create/assign/progress/resolve a disposable grievance; test restricted visibility.                                       | Sensitive case data limited to authorised reviewers; audit/history preserved.               |
| `IA-020` | Academic Years `/academics/years`                    | Create/edit/status/current year and invalid overlapping/date cases.                                                      | Exactly intended current year; date/status validations hold.                                |
| `IA-021` | Departments `/academics/departments`                 | Create/edit/search; assign head; test duplicate/cross-campus references.                                                 | Unique, scoped department with valid head.                                                  |
| `IA-022` | Programme Structure `/academics/programme-structure` | On college/university/training only: create levels/years, terms, curriculum subjects, sections, course links.            | Tree persists and feeds admission/enrolment/course options; hidden for school.              |
| `IA-023` | Grades `/academics/grades`                           | On school only: create/edit/order grade levels and duplicate case.                                                       | Grade feeds classes/admissions; hidden for non-school types.                                |
| `IA-024` | Subjects `/academics/subjects`                       | Create theory/lab subjects, codes, department/class links.                                                               | Unique valid subject and correct downstream choices.                                        |
| `IA-025` | Classes `/academics/classes`                         | Create room/capacity/class teacher, roster, subjects/apply curriculum; test over-capacity.                               | Roster and curriculum feed attendance/timetable/work; invalid capacity blocked.             |
| `IA-026` | Terms `/academics/terms`                             | Create type/status/dates/current term; test outside-year overlap.                                                        | Valid term context appears in academic switcher.                                            |
| `IA-030` | Students `/students`                                 | Search/filter/create/edit; link class/guardian/account; open student detail/learning-session transcript where available. | Tenant-scoped unique admission number; correct links and history.                           |
| `IA-031` | Student Conduct `/conduct`                           | Create incident/recognition, publish/acknowledgement settings, update allowed status.                                    | Only publishable parent-safe information crosses portal; sensitive action protected.        |
| `IA-032` | Staff `/staff`                                       | Create/edit/search; link portal user, department/designation/campus.                                                     | No duplicate identity; role and staff record stay correctly linked.                         |
| `IA-033` | Parents `/parents`                                   | Create/edit/search; link wards/relationships/visibility and portal user.                                                 | Only linked wards available; overrides enforced.                                            |
| `IA-040` | Placement cell `/careers/placements`                 | Seasons, employers/opportunities, applications, stage transitions and filters.                                           | Valid pipeline, student scope, status history.                                              |
| `IA-050` | Admissions `/admissions`                             | Staff-created and Portal applications; filters; info request; accept/waitlist/reject; notify; enrol.                     | Complete workflow described in Phase E; no duplicate enrolment.                             |
| `IA-051` | Attendance `/attendance`                             | Create register, bulk/individual mark, save/finalise, past registers and rollups.                                        | One valid mark/student/date/context; downstream summary correct.                            |
| `IA-052` | Timetable `/timetable`                               | Builder and Live changes; create/edit/publish slots; clash checks.                                                       | Teacher/room/class clashes blocked; published timetable reaches students.                   |
| `IA-053` | Homework `/homework`                                 | School only: draft, questions/help policy, assign, submissions, close.                                                   | Draft hidden; target/late/status rules enforced.                                            |
| `IA-054` | Class content `/class-content`                       | Post stream item, upload material, target class, delete/archive disposable item.                                         | Only enrolled class members receive allowed content.                                        |
| `IA-055` | Courses `/courses`                                   | College/university/training only: code, credits, professor, hours, attendance flag.                                      | Course appears for enrolled learners; hidden for school.                                    |
| `IA-056` | Exams `/exams`                                       | Create, author questions, schedule, publish, start/finish lifecycle.                                                     | Valid schedule/questions; drafts invisible; attempts controlled.                            |
| `IA-057` | Gradebook `/gradebook`                               | Enter/edit marks, max score, grade/remarks, publish gate and validation.                                                 | Valid marks only; publication downstream is explicit.                                       |
| `IA-058` | Report cards `/report-cards`                         | Generate, validate, review, publish; structured/PDF; review queue.                                                       | Only validated/released cards reach correct learner/guardian.                               |
| `IA-059` | Assignments `/assignments`                           | Create file/online quiz, questions, publish, inspect/grade submissions, close.                                           | Targeted and publication-gated; student ownership holds.                                    |
| `IA-060` | Calendar `/calendar`                                 | Month/list navigation, create/edit/delete/publish event, filters.                                                        | Date/type/audience correct and published event crosses portals.                             |
| `IA-061` | Calendar events `/calendar-events`                   | Search/filter/create/edit/publish/archive event records.                                                                 | Same authoritative event data as calendar view.                                             |
| `IA-070` | Fees `/fees`                                         | Structure versions, line items/tax, 100% installments, late policy, invoice batch/report, payments.                      | Immutable billed version, accurate balances/receipts, finance permissions.                  |
| `IA-071` | Expenses `/expenses`                                 | Categories, expense create/edit, review/approve/pay/reject, filters/attachments if offered.                              | Amount/status validation and finance-only access.                                           |
| `IA-072` | Payroll `/payroll`                                   | Create run/items, calculate/process/finalise allowed states, inspect totals.                                             | Staff scope/totals valid; sensitive payroll hidden from unauthorised users.                 |
| `IA-080` | Library `/library`                                   | Catalogue, copies, issue/renew/return, overdue/fine/search.                                                              | Availability and borrower history update atomically.                                        |
| `IA-081` | Transport `/transport`                               | Routes, stops/vehicle, student assignment, status.                                                                       | Student/parent see only own assignment; invalid capacity/reference blocked.                 |
| `IA-082` | Inventory `/inventory`                               | Item, location/quantity, stock-in/out/adjustment and movement history.                                                   | No invalid negative stock; history/audit matches balance.                                   |
| `IA-083` | Hostel `/hostel`                                     | Blocks/rooms/beds, allocation/move/checkout and capacity.                                                                | One valid active allocation; student/parent view updates.                                   |
| `IA-090` | Announcements `/announcements`                       | Draft, audience, publish, archive, filters.                                                                              | Publication/audience gates and downstream inboxes correct.                                  |
| `IA-091` | Notifications `/notifications`                       | Inspect targeted/system notifications, read state, type/audience.                                                        | Correct recipient and unread counters; no unrelated notices.                                |
| `IA-092` | Messages `/messages`                                 | New thread, recipients, text/reply, files, voice, participants, archive.                                                 | Delivery/order/unread/permissions and upload limits hold.                                   |
| `IA-093` | PTM scheduling `/parent-comm/ptm`                    | Event/slots, publish, bookings, cancellations/capacity.                                                                  | Parent can book only valid open slot; double booking blocked.                               |
| `IA-100` | Health Records `/health`                             | Create/update profile and authorised read.                                                                               | Nurse/authorised staff only; parent sees permitted subset.                                  |
| `IA-101` | Medical Incidents `/health/incidents`                | Record severity/details/guardian notification and follow-up.                                                             | Immediate notification where required; sensitive audit.                                     |
| `IA-102` | Medication Logs `/health/medications`                | Schedule/administer/skip record, dosage/time/staff.                                                                      | Append-like accurate administration history; role limited.                                  |
| `IA-103` | Counseling `/counseling`                             | Confidential notes and access denial matrix.                                                                             | No existence/content leak outside authorised counselor path.                                |
| `IA-104` | Counseling Cases `/counseling/cases`                 | Case lifecycle and explicit guardian disclosure.                                                                         | Only approved disclosure crosses to parent; sensitive access audited.                       |
| `IA-110` | Labs `/labs`                                         | Lab profile, capacity/resources/status.                                                                                  | Scoped record feeds schedule and incidents.                                                 |
| `IA-111` | Lab Schedule `/labs/schedule`                        | Schedule class/staff/lab and conflict cases.                                                                             | No conflicting/invalid booking.                                                             |
| `IA-112` | Lab Incidents `/labs/incidents`                      | Record/severity/follow-up/close and permissions.                                                                         | Complete immutable history and appropriate notification.                                    |
| `IA-113` | Debate calibration `/labs/debate-calibration`        | Load authorised calibration records/signals and denial.                                                                  | Audit-only access; no unsafe learner content.                                               |
| `IA-114` | Front Desk `/front-desk`                             | Visitor entry, check-in/out, host/student link and search.                                                               | Accurate visit state and campus scope.                                                      |
| `IA-115` | Appointments `/front-desk/appointments`              | Create/reschedule/cancel/check-in appointment.                                                                           | Valid times/status; linked visitor/host correct.                                            |
| `IA-116` | Facilities `/facilities`                             | Create/edit facility/location/status.                                                                                    | Feeds work orders/assets; scoped correctly.                                                 |
| `IA-117` | Work Orders `/facilities/work-orders`                | Create/assign/prioritise/progress/complete.                                                                              | Status, assignee, timestamps and history correct.                                           |
| `IA-118` | Maintenance `/facilities/maintenance`                | Preventive/reactive task, schedule, completion.                                                                          | Due/overdue state accurate; asset/facility linked.                                          |
| `IA-119` | Assets `/facilities/assets`                          | Asset tag/category/location/custodian/status and duplicate tag.                                                          | Unique asset with valid movement/status history.                                            |
| `IA-120` | Visitor Logs `/security`                             | Search/filter visitor events and check in/out.                                                                           | Campus-scoped chronological record; unauthorised denial.                                    |
| `IA-121` | Gate Passes `/security/gate-passes`                  | Create/review/approve/deny/use/expire pass.                                                                              | One authorised use; state/identity verification/audit correct.                              |
| `IA-122` | Security Incidents `/security/incidents`             | Record/assign/escalate/resolve incident.                                                                                 | Severity/status/history and sensitive access correct.                                       |
| `IA-123` | Emergency Alerts `/security/alerts`                  | Send narrowly scoped QA alert, confirm fan-out and immutable record.                                                     | Immediate allowed recipients; no duplicate sends; audit complete.                           |
| `IA-124` | Access Logs `/security/access-logs`                  | Filter events by person/date/location and inspect detail.                                                                | Append-only, chronological, scoped access trail.                                            |
| `IA-125` | Sensitive Reports `/security/sensitive-reports`      | Submit/review/resolve and test denial.                                                                                   | Restricted queue; no disclosure to unapproved roles.                                        |
| `IA-130` | Devices `/it`                                        | Register/assign/update/retire device and search.                                                                         | Unique identifier, valid assignee/status/history.                                           |
| `IA-131` | Access Requests `/it/access-requests`                | Submit/review/approve/deny/revoke system access.                                                                         | Approval scope/time/status correct and audited.                                             |
| `IA-132` | Webhooks `/it/webhooks`                              | Create/test/rotate/disable; inspect delivery/retry.                                                                      | Signed delivery; secret handling safe; retry history accurate.                              |
| `IA-140` | Reports `/reports`                                   | Run each definition, filters, export, no-data/error cases.                                                               | Correct scoped rows/format and repeatable output.                                           |
| `IA-150` | Campuses `/campuses`                                 | Create/edit/status/codes/address and campus filter/access.                                                               | Unique scoped campus; user/data visibility follows grants.                                  |
| `IA-151` | Documents & Policies `/documents`                    | Upload/create/version/publish/archive policy/document and access.                                                        | Correct version/audience; downloads authorised.                                             |
| `IA-152` | User Management `/users`                             | Invite, roles, campus access, direct permissions, MFA/security lifecycle.                                                | Least privilege and immediate effective-access/session behavior.                            |
| `IA-153` | Roles & Permissions `/roles`                         | Inspect/create/edit custom role where enabled; assign and test.                                                          | Permission catalogue/effective role correct; protected system roles safe.                   |
| `IA-154` | Settings `/settings`                                 | Institution Profile, Preferences, Navigation, Nomenclature, Administration; save/reload.                                 | Branding/labels/layout/preferences persist without breaking routes.                         |
| `IA-155` | Student portal settings                              | `/settings/student-portal`, request types/priorities/surfaces/presets/campus overrides.                                  | Save confirmation; student navigation/home/request SLAs update at correct scope.            |
| `IA-156` | Policy settings                                      | Calendar types, attendance policy, results, grading schemes, document templates.                                         | Valid policy/version reaches dependent modules; invalid thresholds blocked.                 |
| `IA-157` | Petros policy `/settings/petros-policy`              | Create preview/version, publish, test effect, rollback.                                                                  | Only published policy applies; version/history/audit intact.                                |
| `IA-158` | SSO & roster `/settings/federation`                  | OIDC/SAML config, CSV import, OneRoster, Clever/ClassLink sync and failure cases.                                        | Secrets protected; dry/test/sync status and reconciliation accurate; duplicates controlled. |
| `IA-159` | Billing `/billing`                                   | Subscription/invoices/limits/payment state and retry error.                                                              | Matches Super Admin commercial record; no provider secret or cross-tenant data.             |
| `IA-160` | Audit Logs `/audit`                                  | Filter/search/entity diff/correlation/export and mutation attempt.                                                       | Complete append-only tenant audit, permissions enforced.                                    |

Institution authentication extras: invitation accept, activation, password login, dev/token mode rejection when disabled, forgot/reset, logout, session revocation, lockout, MFA/recent-auth, concurrent stale-edit conflict, campus/year/term switchers, responsive sidebar, and keyboard navigation.

---

## 8. Student Portal — every navigation option

Use `student1@greenwood.edu`, then repeat isolation checks with student 2. Institution publication actions must be prepared before each student check.

| ID       | Navigation / route                     | What to test                                                                                       | Expected result                                                            |
| -------- | -------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `ST-001` | Dashboard `/home`                      | Greeting, today's timetable, due work, notices, progress, quick links, empty/loading/error states. | Only this student's current scoped data; counts match detail pages.        |
| `ST-010` | Timetable `/timetable`                 | Day/week/current term, published changes, class scope.                                             | Published enrolled-class slots only.                                       |
| `ST-011` | Attendance `/attendance`               | Summary, subject/date breakdown and changed staff mark.                                            | Read-only accurate rollup for logged-in student.                           |
| `ST-012` | Classes `/classes` and `/classes/{id}` | List enrolled classes; open subjects/teacher/materials; alter class ID.                            | Own classes open; unrelated class is denied/not found.                     |
| `ST-013` | Courses `/courses`                     | College-style enrolled courses, professor/credits/hours.                                           | Only enabled/applicable course data; school may show N/A/hidden.           |
| `ST-014` | Calendar `/calendar`                   | Published class/institution events, date navigation/filter.                                        | Correct audience/timezone and no drafts.                                   |
| `ST-020` | Assignments `/assignments`, `/{id}`    | Filter/status/detail, permitted Petros help, file/quiz submission, history, duplicate/late case.   | Own target work and submission only; integrity/publication rules enforced. |
| `ST-021` | Homework `/homework`, `/{id}`          | Detail, text/photo/file response, check/submit, history, closed/late case.                         | Assigned school homework only; one correct persisted submission flow.      |
| `ST-022` | Study materials `/materials`           | Open/download class material; bad/other-class ID/URL.                                              | Authorised download only; file metadata/type safe.                         |
| `ST-023` | Learning path `/learning-path`         | Goals/next steps and change after Petros session.                                                  | Learner-owned, current, explainable path; no other student.                |
| `ST-024` | Learning progress `/progress`          | Mastery/progress/reflection trends and empty state.                                                | Evidence-bound values reconcile with completed work/Petros.                |
| `ST-025` | Petros input modes `/petros`           | All doors and text/voice/photo/handwriting modes.                                                  | Correct routing, safety, permissions, and session creation.                |
| `ST-026` | Petros session `/petros/session`       | Multi-turn loop, retry/idempotency, teach-back, reflection, handoff consent.                       | One ordered session; no duplicate turn; consent and safe adaptation.       |
| `ST-027` | Petros artifacts `/petros/artifacts`   | Open/download/delete/export where available and alter artifact ID.                                 | Own artefacts only; retention/deletion/audit behavior correct.             |
| `ST-030` | Examinations `/exams`, attempt route   | Upcoming/published exam; start/save/submit; timeout/refresh/double attempt.                        | Availability window/attempt rules and autosave are enforced.               |
| `ST-031` | Results `/results`                     | Before/after staff publication; term/subject display.                                              | No unpublished mark; own released result only.                             |
| `ST-032` | Report cards `/report-cards`, `/{id}`  | List/open/download published structured/PDF card; alter ID.                                        | Own published card only; valid file and metadata.                          |
| `ST-040` | Fees `/fees`, `/fees/pay`              | Dues/installments/receipts, test pay, cancelled/paid/duplicate retry.                              | Accurate own balance; idempotent payment; receipt available.               |
| `ST-050` | Announcements `/announcements`         | Published target notice, archive behavior, wrong-audience absence.                                 | Correct audience; no drafts/other campus.                                  |
| `ST-051` | Notifications `/notifications`         | Unread/read state, deep link, counters and wrong-user isolation.                                   | Counter and state sync; safe target link.                                  |
| `ST-060` | Requests `/requests`, `/new`, `/{id}`  | Every enabled request type, validation, submit, status/comment/decision.                           | Own configured types/SLA/status only; staff decision reflected.            |
| `ST-061` | Documents `/documents`                 | List/open/download issued vault item; revoked/other-student case.                                  | Own valid documents only; revocation enforced.                             |
| `ST-062` | Transport `/transport`                 | Route/stop/vehicle/assignment/status.                                                              | Own active assignment only.                                                |
| `ST-063` | Hostel `/hostel`                       | Block/room/bed/allocation and enabled/disabled state.                                              | Own active allocation only.                                                |
| `ST-070` | Profile `/profile`                     | Identity, contact, class/campus data and edit/request rules.                                       | Authoritative identity; protected fields not silently editable.            |
| `ST-071` | Settings `/settings`                   | Appearance, profile, notifications, privacy, account; save/reload.                                 | Preferences persist per student/device as designed; no security weakening. |

Student authentication extras: activation code, reused/expired code, email and student-ID login, bad password/lockout, logout, revoked session, disabled account, portal surface disabled by institution, browser refresh/back, mobile layout, keyboard/screen-reader labels, offline/interrupted submission, and retry without duplication.

---

## 9. Parent Portal — every navigation option

Sign in at the Institution login page; a parent automatically enters `/family`. Use guardian A for two-child switching, B for shared-ward consistency, and C for hidden-fees policy.

| ID       | Navigation / route                                 | What to test                                                                          | Expected result                                                                                    |
| -------- | -------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `PA-001` | Home `/family`                                     | Ward summary, alerts, due items, unread counts, quick links, child switcher.          | Only linked wards; totals/deep links correct.                                                      |
| `PA-002` | Ward `/family/ward`                                | List children and open each child hub.                                                | Guardian A sees two; B one shared ward; no unlinked child.                                         |
| `PA-003` | Child hub `/family/child/{studentId}`              | Summary cards/links and manually replace student ID.                                  | Linked ward opens; out-of-scope ward returns protected denial/not found.                           |
| `PA-010` | Attendance child page                              | Calendar/summary and submit absence note.                                             | Published ward attendance only; note reaches staff and updates status.                             |
| `PA-011` | Behavior child page                                | Published incidents/recognitions and required acknowledgement.                        | No drafts/confidential detail; own acknowledgement recorded once.                                  |
| `PA-012` | Documents child page                               | View/download delivered documents, request item, revoked case.                        | Ward-owned valid document only; revoked item blocked.                                              |
| `PA-013` | Health child page                                  | Profile, permitted visits/incidents/medications/disclosure.                           | Policy-limited health subset; no confidential counseling notes/existence leak.                     |
| `PA-014` | Hostel child page                                  | Allocation and outing requests/status if enabled.                                     | Ward's active allocation/request only; staff decision reflected.                                   |
| `PA-015` | Library child page                                 | Current/returned/overdue loans and fines.                                             | Ward's loans only; values match staff system.                                                      |
| `PA-016` | Pickup child page                                  | Add/revoke pickup authorisation; early-leave/gate request/status.                     | Identity/status/expiry validation; gate action and notification reconcile.                         |
| `PA-017` | Results child page                                 | Exams/schedule/published marks/report-card links.                                     | Publication gate and ward scope hold.                                                              |
| `PA-018` | Transport child page                               | Route/stop/vehicle/incident information.                                              | Ward's allowed assignment only; live tracking shown only if supported/enabled.                     |
| `PA-020` | Fees `/family/fees`                                | Invoices/installments/payment/receipts; switch wards; duplicate/cancelled case.       | Allowed ward invoices only; idempotent settlement; guardian C is denied/hidden.                    |
| `PA-030` | Inbox `/family/inbox`                              | Notifications, notices, acknowledgements, messages, consent responses, unread totals. | Correct ward/guardian audience and state; no other guardian's private thread.                      |
| `PA-040` | More `/family/more`                                | Open every tile and return; permission/feature visibility.                            | All enabled destinations work; unavailable features clearly hidden/disabled.                       |
| `PA-041` | PTM `/family/more/ptm`                             | Book/cancel/rebook, full slot, duplicate and past event.                              | Capacity/time/guardian/ward rules enforced.                                                        |
| `PA-042` | Calendar `/family/more/calendar`                   | Published events, dates/types/audience and timezone.                                  | Correct family/ward events only; no draft.                                                         |
| `PA-043` | Message school `/family/more/messages/new`         | Choose ward/topic, compose/send, validation, then staff reply.                        | Scoped thread created; reply/unread appears in Inbox.                                              |
| `PA-044` | Document requests `/family/more/document-requests` | Submit type/reason, inspect status, send-back, fulfil/download.                       | Own request lifecycle only; delivered vault item valid.                                            |
| `PA-045` | Profile changes `/family/more/profile-changes`     | Request address/contact change, inspect staff review and rejection reason.            | Authoritative profile changes only after approval; history retained.                               |
| `PA-046` | Settings `/family/more/settings`                   | Email/push/SMS/WhatsApp category preferences, digest, quiet hours, save/reload.       | Preferences persist; critical medical/emergency policy still overrides quiet hours where designed. |
| `PA-047` | Who can see what `/family/more/who-can-see`        | Read visibility explanation and compare guardian A/C.                                 | UI accurately explains enforced hidden sections; no bypass.                                        |
| `PA-048` | Petros digest `/family/more/petros-digest`         | Preferences, preview/history and multi-child content.                                 | Privacy-safe, guardian/ward-scoped digest; no raw chat/answers/provider detail.                    |

Parent authentication and privacy extras: password login, forgot/reset, logout/back, disabled/unlinked parent, two guardians on one ward, two wards for one guardian, direct URL/API tampering, hidden-section override, unpublished records, notification quiet hours, mobile/PWA layout, keyboard/screen-reader use, slow/offline retry, and no duplicate mutation after refresh.

---

## 10. Supporting, detail, and non-navigation routes

The main tables cover every current navigation link. The following pages are reached through redirects, emails, buttons, or record details instead of the sidebar. Include them so the route sweep is complete.

| Surface     | Route                                                       | Required check                                                                                                                            |
| ----------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Public      | `/register/success`                                         | Open only after submission; reference/status guidance is correct; refreshing does not resubmit.                                           |
| Public      | `/apply/success`                                            | Shows the admission reference and next steps; refresh/back does not duplicate the application.                                            |
| Public      | `/apply/status`                                             | Same-device and authorised resume/status flow; wrong/missing token reveals no application.                                                |
| Public      | `/apply/info/{requestId}`                                   | Expiring information-request link, all field types, file upload/download, one scoped submission, invalid/expired token denial.            |
| Super Admin | `/`                                                         | Authenticated root redirects to Dashboard; unauthenticated root reaches login rather than leaking content.                                |
| Super Admin | `/login`                                                    | Password flow plus explicitly gated Dev and Token modes.                                                                                  |
| Super Admin | `/forgot-password`, `/reset-password`                       | Non-enumerating request, expiring/single-use token, password policy, session revocation, successful new login.                            |
| Super Admin | `/institutions/new`                                         | Complete create form, validation, duplicate handling, cancel/back, and audit.                                                             |
| Super Admin | `/institutions/{id}`                                        | All live and placeholder tabs plus status/support-access actions described in SA-011 and SA-012.                                          |
| Super Admin | `/registration-requests/{id}`                               | Full review, assignment, notes, rejection, approval, timeline, communication, and audit detail.                                           |
| Super Admin | `/institution-users/{id}`                                   | Roles, campuses, overrides, effective permissions, security lifecycle, and history.                                                       |
| Super Admin | `/features/{id}`                                            | Detail plus activate/deactivate/archive confirmation and downstream entitlement.                                                          |
| Super Admin | `/plans/{id}`                                               | Plan/version detail, publication/immutability, pricing and linked subscription behavior.                                                  |
| Super Admin | `/subscriptions/{id}`                                       | Subscription detail and valid lifecycle/commercial references.                                                                            |
| Institution | `/`                                                         | Role-aware redirect: parent to `/family`, staff to `/dashboard`, unauthenticated to login.                                                |
| Institution | `/login`                                                    | Password and gated Dev/Token modes; parent/staff landing behavior.                                                                        |
| Institution | `/accept-invite`                                            | Valid, invalid, expired, and reused invitation token; password setup and activation.                                                      |
| Institution | `/activate`                                                 | Account activation token/code, password policy, reused/expired code.                                                                      |
| Institution | `/forgot-password`, `/reset-password`                       | Non-enumeration, token expiry/single use, new password login, old-session revocation.                                                     |
| Institution | `/onboarding`                                               | Complete checklist, progress persistence, required dependencies, and dashboard transition.                                                |
| Institution | `/copilot`                                                  | This explicit but non-sidebar route should either provide its intended scoped Copilot experience or be tracked as an orphan/redirect gap. |
| Institution | `/assignments/new`, `/assignments/{id}`                     | Full author/detail, publish, submission, grade, close, invalid ID and permission checks.                                                  |
| Institution | `/exams/new`, `/exams/{id}`                                 | Full author/detail, questions, schedule, publication, invalid ID and permission checks.                                                   |
| Institution | `/petros/{conversationId}`                                  | Scoped conversation history, retry, safe rendering, invalid/cross-tenant ID denial.                                                       |
| Institution | `/students/{studentId}/learn/{sessionId}`                   | Authorised privacy-safe transcript/detail; unrelated role/student/institution denied.                                                     |
| Institution | `/academics/report-cards`, `/academics/report-cards/review` | Generation/release validation and review queue; reconcile with `/report-cards`.                                                           |
| Institution | `/academics/mock-blueprints`                                | Internal/non-sidebar QA route; verify access is intentionally restricted or track exposure as a gap.                                      |
| Institution | `/settings/student-portal`                                  | Modules, labels, terminology, priorities, presets, campus overrides, save confirmation.                                                   |
| Institution | `/settings/student-portal/request-types`                    | Enable/type/role/SLA configuration and downstream Student Requests behavior.                                                              |
| Institution | `/settings/calendar-types`                                  | Create/edit/order/disable type and downstream event validation.                                                                           |
| Institution | `/settings/attendance-policy`                               | Thresholds, statuses, lock/finalisation rules and invalid value handling.                                                                 |
| Institution | `/settings/results`                                         | Results publication/visibility policy and downstream Student/Parent behavior.                                                             |
| Institution | `/settings/grading-schemes`                                 | Bands/ranges/order/overlap validation and gradebook/report-card effect.                                                                   |
| Institution | `/settings/documents`                                       | Template create/edit/preview/version and document-generation effect.                                                                      |
| Student     | `/`                                                         | Authenticated redirect to Home; unauthenticated redirect to Student login.                                                                |
| Student     | `/activate`                                                 | Valid/invalid/expired/reused activation code and first login.                                                                             |
| Student     | `/assignments/{id}`, `/homework/{id}`                       | Target/ownership, submission/history, closed/late and bad-ID behavior.                                                                    |
| Student     | `/classes/{id}`                                             | Enrolment scope and class detail/material links.                                                                                          |
| Student     | `/exams/{scheduleId}/attempt`                               | Availability, autosave, timeout, submit, reload, and repeat-attempt rules.                                                                |
| Student     | `/fees/pay`                                                 | Invoice ownership, amount, cancel/back, provider error, retry/idempotency, success receipt.                                               |
| Student     | `/report-cards/{id}`                                        | Published ownership, rendering/download, revoked/missing/cross-student ID.                                                                |
| Student     | `/requests/new`, `/requests/{id}`                           | Configured type/form/SLA submission and own status/detail only.                                                                           |
| Student     | `/petros/session`, `/petros/artifacts`                      | Full multimodal loop, transcript and learner-owned artefacts.                                                                             |
| Student     | `/design-system`                                            | Internal visual QA route; ensure it is intentionally available only in the intended environment or track exposure.                        |
| Parent      | Every `/family/child/{studentId}/*` route                   | Repeat with a linked ward and an out-of-scope ID; every child subpage must enforce guardian scope independently.                          |
| Parent      | Every `/family/more/*` route                                | Open directly as parent and as non-parent; parent gets the intended feature, non-parent is denied/redirected.                             |

For any internal/non-sidebar route, decide explicitly whether it is intended for production. A route that merely renders is not automatically a passing product feature.

---

## 11. Cross-portal source-of-truth map

| Institution action       | Student result                       | Parent result                               | Required gate                              |
| ------------------------ | ------------------------------------ | ------------------------------------------- | ------------------------------------------ |
| Publish timetable slot   | Timetable                            | Context through ward/calendar surfaces      | Enrolled class and published slot.         |
| Save attendance          | Attendance summary                   | Ward attendance; absence-note flow          | Correct student/date/register scope.       |
| Publish assignment       | View/submit assignment               | Normally indirect, subject to family policy | `status=published`, target class.          |
| Assign homework          | View/submit homework                 | Normally indirect, subject to family policy | Assigned/published and institution type.   |
| Upload class material    | Study materials                      | Not exposed unless explicitly designed      | Enrolled class.                            |
| Publish exam schedule    | Examinations                         | Ward results/exam view                      | Published schedule and target.             |
| Publish marks            | Results                              | Ward results                                | Grade publication flag.                    |
| Publish report card      | Report card/download                 | Ward report card/download                   | Validated and released.                    |
| Generate fee invoice     | Fees/pay/receipt                     | Family fees/pay/receipt unless hidden       | Valid invoice, surface/visibility enabled. |
| Publish announcement     | Announcements/notification           | Inbox notice if audience includes guardian  | Published and audience match.              |
| Approve student request  | Request status                       | Only parent-owned request workflows         | Request ownership and decision.            |
| Deliver certificate      | Documents                            | Child documents/request download            | Vault ownership and not revoked.           |
| Record medical incident  | Limited student behavior if designed | Immediate health notification               | Guardian notification policy.              |
| Approve gate/early leave | Service context if exposed           | Pickup/gate status and alert                | Linked ward, valid authorisation.          |
| Publish Petros policy    | Student Petros behavior              | Privacy-safe digest policy                  | Published policy version and surfaces.     |

When a downstream item is missing, check the gate in the last column before filing a UI bug.

---

## 12. Failure, resilience, accessibility, and browser matrix

Run the following against at least one create, edit, publish, upload, payment, message, AI, and approval flow:

### Failure and recovery

- API stopped before page load: clear error state with retry; no endless skeleton.
- API stopped during mutation: actionable error; form data retained; no phantom success.
- Network lost after submit: retry is idempotent; no duplicate application, payment, message, AI turn, or attendance register.
- 400 validation: field-specific feedback without losing valid fields.
- 401 session expiry: return to login and preserve safe destination; no loop.
- 403 permission: explicit denial and zero mutation.
- 404 wrong/out-of-scope ID: no data existence leak.
- 409 stale version/duplicate: explain conflict and offer refresh; do not overwrite newer data.
- 429 rate limit: clear retry guidance; OTP/login/AI limiter behaves as configured.
- 500/provider failure: correlation ID retained; secrets and stack traces absent.
- Queue/email/notification failure: originating domain result follows documented semantics and failure is observable/retryable.

### Uploads

Test valid file, wrong extension/MIME mismatch, oversized file, empty file, duplicate filename, malicious filename/path characters, interrupted upload, download authorisation, expired URL, and deletion/revocation.

### Browsers and viewports

At minimum:

- Current Chrome desktop.
- Current Safari desktop.
- Current Firefox desktop.
- Mobile Safari-sized viewport around 390 × 844.
- Android/Chrome-sized viewport around 412 × 915.
- Tablet around 768 × 1024.

### Accessibility

- Complete core flows using keyboard only.
- Visible focus does not disappear behind sticky navigation/dialogs.
- Dialog focus is trapped and returns to its trigger.
- Every input has an accessible label; errors use programmatic association/live regions.
- Icon-only actions have names/tooltips.
- Tables/cards remain understandable at 200% zoom.
- Status is not communicated by colour alone.
- Screen reader announces saving, upload, OTP, payment, AI processing, and errors.
- Reduced-motion preference is respected.
- Contrast remains adequate in all supported appearance modes.

---

## 13. Automated smoke suite

The repository contains API-focused smoke scripts that complement—but do not replace—the manual browser run. Most legacy scripts default to API port `3001`; the current `.env` uses `3007`, so pass `API` explicitly:

```bash
API=http://localhost:3007/v1 bash scripts/registration-smoke.sh
API=http://localhost:3007/v1 bash scripts/admissions-public-smoke.sh
API=http://localhost:3007/v1 bash scripts/admissions-admin-smoke.sh
API=http://localhost:3007/v1 bash scripts/portal-academics-smoke.sh
API=http://localhost:3007/v1 bash scripts/portal-curriculum-smoke.sh
API=http://localhost:3007/v1 bash scripts/programme-structure-smoke.sh
API=http://localhost:3007/v1 bash scripts/portal-people-smoke.sh
API=http://localhost:3007/v1 bash scripts/portal-attention-smoke.sh
API=http://localhost:3007/v1 bash scripts/portal-detail-smoke.sh
API=http://localhost:3007/v1 bash scripts/portal-health-smoke.sh
API=http://localhost:3007/v1 bash scripts/portal-expenses-smoke.sh
API=http://localhost:3007/v1 bash scripts/portal-recipients-smoke.sh
API=http://localhost:3007/v1 bash scripts/portal-messaging-smoke.sh
API=http://localhost:3007/v1 bash scripts/portal-settings-smoke.sh
API=http://localhost:3007/v1 bash scripts/portal-exam-assignment-questions-smoke.sh
API=http://localhost:3007/v1 bash scripts/parent-portal-smoke.sh
API=http://localhost:3007/v1 bash scripts/student-p1-smoke.sh
API=http://localhost:3007/v1 bash scripts/student-p3-smoke.sh
API=http://localhost:3007/v1 bash scripts/student-p4-smoke.sh
```

The broad institution phases are also covered by:

```bash
for phase in 5 6 7 8 9 10 11 12 13; do
  API=http://localhost:3007/v1 bash "scripts/portal-p${phase}-smoke.sh" || exit 1
done
```

Platform/infrastructure checks:

```bash
API=http://localhost:3007/v1 bash scripts/auth-smoke.sh
API=http://localhost:3007/v1 bash scripts/modules-smoke.sh
API=http://localhost:3007/v1 bash scripts/jobs-smoke.sh
API=http://localhost:3007/v1 bash scripts/observability-smoke.sh
API=http://localhost:3007/v1 bash scripts/redis-smoke.sh
API=http://localhost:3007/v1 bash scripts/e2e-lifecycle.sh
```

Before running a script, read its header for any additional required variables, seed assumptions, destructive fixture cleanup, expected role/header mode, and exact pass count. Store the command, output, exit code, and environment commit with the test evidence.

Also run the maintained package checks:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Do not claim manual UI, browser, microphone, email delivery, payment-provider, or real AI-provider coverage solely from API smoke scripts.

---

## 14. Known route gaps to keep separate from new failures

As of the verified workspace date:

1. Super Admin navigation links exist but pages do not exist for:
   - `/individual-subscriptions`
   - `/announcements`
   - `/settings`
   - `/security`
2. On Super Admin institution detail, these tabs currently render a later-phase placeholder:
   - Features
   - Usage
   - Support
   - Activity
   - Audit
   - Security
   - Notes
   - Settings
3. The live institution-detail tabs are Overview, Campuses, Users, Subscription, Billing, and Access Sessions.
4. Institution portal navigation is deliberately filtered by permission, feature entitlement, campus, nomenclature, and institution type.
5. School-only options include Grades and Homework. Programme Structure and Courses are for college/university/training-center types.

Record these as `KNOWN GAP` until implemented. Do not let them hide unrelated failures on implemented pages.

---

## 15. Final sign-off checklist

A release is ready for sign-off only when all of the following are true:

- Institution registration, OTP, review, rejection, approval, provisioning, invite, onboarding, and activation pass.
- Public admission draft, OTP, status, information request, all decision paths, and enrolment pass.
- Student and parent identities are linked and tenant/guardian isolation passes.
- Every implemented navigation option in Sections 6–9 has a result.
- Every create/update/publish/approve/pay/AI/security action has appropriate audit evidence.
- Publication gates for announcements, exams, results, report cards, documents, conduct, and health pass.
- Role, campus, institution, student, guardian, and hidden-section boundaries pass by UI, direct URL, and API.
- AI text, photo/handwriting, speech transcript, correction, replay, retry/idempotency, route diagnostics, usage, and audit pass with real configured providers.
- No credential, token, cookie, private prompt, raw counseling note, hidden reasoning, or cross-tenant data appears in UI/log/export evidence.
- Critical resilience, upload, accessibility, responsive, and supported-browser checks pass.
- Automated smoke, typecheck, tests, and build pass—or every exception is documented and approved.
- Known gaps are tracked separately with owners and target releases.
- End-of-cycle reports, historical read-only views, and audit reconciliation pass.

The final report should contain totals for `PASS`, `FAIL`, `BLOCKED`, `KNOWN GAP`, and `N/A`, plus a release decision and links to evidence for every failed or blocked item.
