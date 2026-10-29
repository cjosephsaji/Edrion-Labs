# M3 Petros Learn teacher experience redesign

14 October 2026. **Implemented and available for manual visual approval. M4 has not started.**

Petros Learn now separates **Lessons**, **Learning goals** and **Student progress**. Lessons follow **Choose material → Review lesson → Preview activities → Save or request approval**. Objective cards have one Edit action and a contextual menu. Large read-only previews show the actual source content; narrow-screen tables become labelled rows; source passages, concepts, claims and review requirements open in focused drawers. Qualified reviews and curriculum authoring have their own authorized workspaces.

This is the actual institution teaching page, running against isolated M3 services and disposable PostgreSQL with the restricted App role. The surrounding institution identity and lists are synthetic. No genuine AI request, production deployment, student lesson release, assessment execution or new learning evidence was authorized or performed.

## Usability problems addressed

| Previously | Now |
| --- | --- |
| Proposals, assignments, progress and curriculum authoring mounted in one long page | Separate task navigation; only the current task is visible |
| Seven prominent controls repeated for each objective | Edit plus a small contextual menu for acceptance, removal, movement, source and details |
| Evidence and structural descriptions competed with lesson content | Lesson content occupies the main area; evidence opens in a drawer |
| Small text-only activity representations | One objective at a time; readable concept connections, extracted tables and source passages |
| Dense technical approval and release lists | Saved / waiting / changes requested / teaching approval, with separate review details |
| Raw revision conflicts and generic refresh | Preserved local wording, latest-version comparison, explicit recovery and a separate save |
| Unqualified teachers saw private reviewer controls | Reviewer navigation and private requests require server-returned current eligibility |
| Mobile controls and outer teaching tabs could clip | Wrapping navigation, single-column content, responsive drawers and accessible action alternatives |

## Navigation and workflows

**Lessons.** Choose a document already authorized for this teaching context. Continue its saved lesson, or prepare an honest document outline when no draft exists. Focus and duration are optional for a new outline. Review actual objectives and their selected activities. Edit wording with Save changes / Cancel; acceptance explicitly records a draft decision and still requires academic approval. Move controls use stable objective IDs. Preview one objective at a time and choose only activities returned by the proposal. Save or submit the exact revision through the existing service.

**Learning goals.** Select permitted recipients, enter the learning focus, add optional instructions and permitted attachments, then review and assign through the existing operation. This demo deliberately exposes no available recipients, so it shows “No students are available in this demo” and does not display an assignment form that cannot succeed.

**Student progress.** Uses the existing guidance records and recipient statuses. Participation and reported completion are distinct from mastery. Empty demo records produce a clear empty state. No progress chart or learning evidence was invented.

**Lesson reviews.** Appears when the proposal service returns current reviewer eligibility. Teaching material, concepts, activities and private assessment families retain separate decisions. Reason, exact qualification version, private family version and explicit non-equivalence acknowledgement are preserved. Missing qualification does not grant an inspection request. A prepared private family is selected initially; an unprepared family must be prepared before it can be inspected.

**Curriculum authoring.** Retains the existing author/reviewer component under its existing content/syllabus permissions. It is a separate workspace instead of an accordion below lesson preparation.

Visited teaching tabs remain mounted so unsaved wording survives Notes / Files / Class updates navigation. Petros task changes also preserve the lesson editor. Leaving the document with unsaved wording invokes the browser’s native warning. Historical revisions open read-only and do not replace the current editable proposal.

## Features retained

| Capability | Location / authority |
| --- | --- |
| Objective wording, acceptance, removal and ordering | Review lesson; strict existing edit commands |
| Activity alternatives and rejection | Preview activities → Change activity |
| Activity expectations, assumptions and accessible alternatives | Activity & objective details drawer |
| PDF, PPTX, converted-slide, DOCX, TXT and Markdown source references | Supporting source drawer; exact locator available on request |
| Concept definitions and relationships | Concepts & connections drawer |
| Claim inspection, correction and rejection | Check lesson claims drawer |
| Revision lineage and withdrawal | Version history drawer; historical content read-only |
| Submission and exact-revision academic status | Save & submit and review details |
| Qualified teaching/concept/activity decisions | Lesson reviews |
| Private family preparation, inspection, correction and separate review | Assessment reviews within the qualified workspace |
| Release eligibility and isolated authorization operation | Qualified workspace; disabled when ineligible; backend rechecks |
| Authorized recipient assignment and attachment bindings | Learning goals; existing contracts unchanged |
| Actual available participation and reported completion | Student progress |
| Existing reusable curriculum authoring and publication owner | Curriculum authoring; existing component and permissions |
| Notes, Files, Class updates, V1 and Companion Playground | Existing routes/owners retained |

All source, tenant, qualification, confidentiality, provider/budget and publication checks remain in their existing backend owners. The M3 proposal service, M1 storage, M2 adapters, M2-G validation, curriculum authority and student guidance services were not rewritten. The UI does not treat an edit, draft acceptance or teaching approval as assessment or student-publication approval.

## Actual files changed

Presentation and integration:

- `apps/institution-web/src/app/(app)/teaching/[classId]/[subjectId]/page.tsx`
- `apps/institution-web/src/components/teaching/petros-learn-workspace.tsx` — task navigation and authorized workspace entry
- `apps/institution-web/src/components/teaching/petros-learning-proposal.tsx` — guided lesson flow, drawers, qualified mode and conflict recovery
- `apps/institution-web/src/components/teaching/petros-lesson-presentation.tsx` — trusted public previews, native tables and plain-language status/location labels
- `apps/institution-web/src/components/teaching/petros-learn.module.css` — existing Edrion tokens and responsive layouts
- `apps/institution-web/src/components/teaching/petros-teacher-guidance.tsx` — separate goals/progress presentation and unavailable-recipient state
- `apps/institution-web/next.config.mjs` — optional separate output directory for isolated builds
- `packages/ui/src/tabs.tsx` — optional retention of visited panels and standard keyboard navigation
- `packages/ui/src/use-focus-trap.ts` — keyboard access to disclosures and exclusion of hidden controls

Verification and demonstration:

- `apps/institution-web/src/components/teaching/petros-learning-proposal.spec.tsx`
- `apps/institution-web/src/components/teaching/petros-teacher-guidance.spec.tsx`
- `apps/api/scripts/serve-petros-m3-teacher-ux.ts`
- `apps/api/scripts/verify-petros-m3-teacher-ux.mjs`
- `apps/api/scripts/petros-teacher-ux-evidence-guard.cjs`
- `apps/api/scripts/verify-petros-m3-teacher-ux-browser.mjs`
- `apps/api/scripts/verify-petros-m3-teacher-ux-playground.mjs`
- `apps/api/scripts/capture-petros-m3-teacher-ux-visuals.mjs`
- This report and `m3-teacher-ux-evidence/`

The checkout was already extensively modified. [Starting Git status](m3-teacher-ux-evidence/starting-git-status.txt) and task baseline copies are retained. No reset, clean, stash, staging or commit was performed. Next’s generated institution TypeScript configuration changes were restored to the exact starting bytes after the builds.

## Actual screenshots

These are browser captures of the implemented institution portal. They are not design mockups. The portal scrolls inside its main panel; both overall context and scrolled lesson content are supplied.

| View | Evidence |
| --- | --- |
| Before: desktop / mobile | [Desktop](m3-teacher-ux-evidence/before-desktop.png), [mobile](m3-teacher-ux-evidence/before-mobile.png) |
| Landing and selected material | [Landing](m3-teacher-ux-evidence/browser/2026-10-14T15-58-05.274Z/landing-desktop.png), [material](m3-teacher-ux-evidence/browser/2026-10-14T15-58-05.274Z/choose-material-desktop.png) |
| Objective review | [Desktop](m3-teacher-ux-evidence/browser/2026-10-14T15-58-05.274Z/objectives-desktop.png), [360px content](m3-teacher-ux-evidence/visual/cloud-objective-content-360px.png) |
| Activity preview | [1440px](m3-teacher-ux-evidence/visual/cloud-activity-content-1440px.png), [1280px](m3-teacher-ux-evidence/visual/cloud-activity-content-1280px.png), [768px](m3-teacher-ux-evidence/visual/cloud-activity-content-768px.png), [390px](m3-teacher-ux-evidence/visual/cloud-activity-content-390px.png), [360px](m3-teacher-ux-evidence/visual/cloud-activity-content-360px.png) |
| Source inspection | [Desktop drawer](m3-teacher-ux-evidence/browser/2026-10-14T15-58-05.274Z/source-desktop.png), [360px drawer](m3-teacher-ux-evidence/browser/2026-10-14T15-58-05.274Z/source-360px.png) |
| Save and review | [Save/submit](m3-teacher-ux-evidence/browser/2026-10-14T15-58-05.274Z/save-submit-desktop.png), [waiting](m3-teacher-ux-evidence/browser/2026-10-14T15-58-05.274Z/waiting-review-desktop.png), [review details](m3-teacher-ux-evidence/browser/2026-10-14T15-58-05.274Z/review-details-desktop.png) |
| Conflict recovery | [Preserved wording](m3-teacher-ux-evidence/browser/2026-10-14T15-58-05.274Z/conflict-preserved.png), [comparison](m3-teacher-ux-evidence/browser/2026-10-14T15-58-05.274Z/conflict-comparison.png) |
| English fixture | [Objectives](m3-teacher-ux-evidence/browser/2026-10-14T15-58-05.274Z/english-objectives-desktop.png), [activity](m3-teacher-ux-evidence/browser/2026-10-14T15-58-05.274Z/english-activity-desktop.png) |
| Learning goals / progress | [Goals](m3-teacher-ux-evidence/browser/2026-10-14T15-58-05.274Z/learning-goals-desktop.png), [progress](m3-teacher-ux-evidence/browser/2026-10-14T15-58-05.274Z/progress-desktop.png), [mobile goals](m3-teacher-ux-evidence/browser/2026-10-14T15-58-05.274Z/learning-goals-390px.png) |
| Qualified workspace | [Desktop](m3-teacher-ux-evidence/browser/2026-10-14T15-58-05.274Z/reviewer-decision-desktop.png), [360px](m3-teacher-ux-evidence/browser/2026-10-14T15-58-05.274Z/reviewer-360px.png) |

Before:

![Original teacher interface](m3-teacher-ux-evidence/before-desktop.png)

After — activity content:

![Implemented lesson preview](m3-teacher-ux-evidence/visual/cloud-activity-content-1440px.png)

After — mobile:

![Implemented mobile activity preview](m3-teacher-ux-evidence/visual/cloud-activity-content-390px.png)

## Functional and security verification

[Final real-browser results](m3-teacher-ux-evidence/browser/2026-10-14T15-58-05.274Z/results.json): **89 checks passed, zero failures, zero runtime errors, zero external browser calls.** Checks exercised the actual institution route and M3 services, rather than a mocked lesson page.

- First visit: material choice and separate task navigation; no ordinary reviewer entry.
- Cloud: source-validated objective correction, activity alternatives, previous/next preview, extracted table and slide locator, save and actual review submission.
- English: actual argument-analysis fixture, claim/evidence objectives and relevant previews; no cloud-specific content in its lesson projection.
- Details: public concepts/connections, claims, previous revisions and separate approval dimensions remain available.
- Conflict: a second actual server edit advanced the revision. The stale save was rejected; local wording survived, comparison displayed both versions, continuing did not save, and an explicit retry saved against the newer version. A unit case also checks an objective removed by another editor cannot be restored silently.
- Permissions: direct unqualified review, private inspection and blocked release requests were rejected. Qualified decisions used an independently seeded reviewer in a separate disposable institution. The ordinary teacher received no qualification. Separate teaching approval was recorded; assessment approval remained gated.
- Responsive: all four lesson steps plus source drawers at 1440, 1280, 768, 390 and 360px. Document/proposal containment and visible action widths passed. Actual desktop, laptop, tablet and mobile screenshots were inspected.
- Institutional screens: Notes, Files and Class updates still open; unsaved lesson wording survives tab changes. Their surrounding demo lists are empty. Publication writes in those unrelated screens were not simulated by the demo harness; unchanged backend behavior is covered by the broader regressions below.

[Final UI tests](m3-teacher-ux-evidence/ui-complete-tests.json): **21/21**. They cover guided edits and exact-version commands, conflict comparison/removal, explicit acceptance, activity selection/rejection, source inspection, qualified private pins, claim correction, no-recipient empty states, progress separation and review-before-assignment using the existing recipient contract. Mocked UI tests are not claimed as database authorization proof.

[Serial regression commands and artifacts](m3-teacher-ux-evidence/verification-runs/2026-10-14T15-06-17.060Z/commands.json):

| Collection | Result |
| --- | --- |
| API default regression | 1,160 passed; 379 opt-in cases skipped |
| Proposal service | 35 passed |
| M3 restricted-role database and gateway | 46 passed |
| Institution UI regression / final source-recovery checks | 20 passed / 21 passed |
| M1 / assignment / document-source authority | 126 passed |
| Enabled M2 / M2-G / M2-F-A database | 26 passed |
| Schemas | 578 passed |
| Student / V1 compatibility | 376 passed |
| Learn evals | 46 passed |
| Selected existing M0-P browser smoke | [13 checks passed](m3-teacher-ux-evidence/playground/browser-results.json) |
| Institution and API TypeScript | Passed; `typecheck-final.log`, `api-typecheck-final.log`; final institution build also typechecked |
| Isolated institution build | Passed; [final build log](m3-teacher-ux-evidence/build-complete.log), 112 routes; no deployment |

Collections overlap and must not be added as unique test counts. No complete all-app monorepo or live-provider regression is claimed.

Initial runs and diagnostic captures remain retained. The first parallel API run passed 1,158 and hit two existing parser/Office process-monitor errors during simultaneous demo compilation; the serial rerun passed all 1,160. Initial UI selectors were corrected after two assertions failed. Manual screenshot review also caught word splitting in narrow tables; the final mobile view uses labelled rows with the same source values. Intermediate browser runs stopped on source loading during refresh, a numbered-step selector, an unauthorized review attempted before submission (correctly rejected with 409), and an unprepared private family. The final picker improvement and browser checks above resolve those stops. Concurrent development-mode source reads also exposed the disposable database’s short lock timeout. The contained harness now queues owner calls per fixture without changing their App-role checks; the UI offers a safe source-read retry and never labels a failed read as missing material. This harness change is not a production database or timeout change. A supplementary screenshot capture was repeated after source loading completed. Redis socket shutdown warnings remain in the logs; final regression processes exited successfully.

## Accessibility

Native labelled inputs, select controls, buttons and disclosures are retained. The step navigation exposes the current step; decorative step numbers do not pollute button names. Objective menus offer Move up / Move down keyboard alternatives. The institution tab list supports Left / Right / Home / End and one active tab stop. Inline editing receives focus. Drawer Tab / Shift+Tab remain inside the dialog, including source-reference disclosures; Escape closes it and restores the trigger. Hidden panels and collapsed disclosure contents are excluded from the trap. Save/error messages use status/alert semantics; local edits receive a native unload warning.

[Measured visible colours](m3-teacher-ux-evidence/visual/accessibility.json): six key text/action contrast checks passed. Responsive action containment passed at all five requested widths. Reduced-motion styles are included. These are engineering accessibility checks, not a claim of certification or completed screen-reader-user testing.

## Preservation

[Starting hashes](m3-teacher-ux-evidence/historical-before.json) recorded **4,319 existing verification/output artifacts**, excluding AppleDouble filesystem metadata, before tests. All new logs, screenshots and generated receipts use `m3-teacher-ux-evidence/`. The test preload guard redirects historical receipt writes before they occur and refuses historical deletion/rename. It leaves fixture reads and assertions unchanged. New generated receipts are identified as new evidence.

[Final preservation audit](m3-teacher-ux-evidence/preservation-final.json) compares all recorded hashes; the new run preserved the captured historical bytes. No historical narrative or implementation plan was edited.

**The earlier preservation failure remains unresolved.** Sixteen of the eighteen previously overwritten artifacts had been restored before this task. The originals below remain unrecovered; their current bytes are later receipts and are not described as originals:

- `docs/verification/petros-v2/m2/database-evidence.json` — missing original SHA-256 `e55fe60828053252b19d6be21b42c59edfb668bfaa67673f7b288e62e8cda887`.
- `docs/verification/petros-v2/m2fa-evidence/database-evidence.json` — missing original SHA-256 `a5baaa2c78dec3c15c8b31a4c0f2a332f1dc49779aa8bf21fda367fdd94c9cc7`.

The new preservation result does not close that historical gate. The original [M3 preservation findings](m3-learning-proposals.md#p-preservation-schema-and-inventory) remain authoritative.

## Exact local demo URLs

The demo is left running on loopback **4904** (web) and **4903** (isolated API). Restarting the disposable backend generates new IDs; [demo-info.json](m3-teacher-ux-evidence/demo-info.json) always records them.

| Screen | Direct URL |
| --- | --- |
| Petros Learn landing | http://127.0.0.1:4904/teaching/6446535d-4905-4460-b24e-fe4f4894c469/6c785ed6-cdac-4242-ab87-b70b8d859bdc#petros-lessons |
| Choose material / create or continue | http://127.0.0.1:4904/teaching/6446535d-4905-4460-b24e-fe4f4894c469/6c785ed6-cdac-4242-ab87-b70b8d859bdc#petros-lessons-material |
| Objective review | http://127.0.0.1:4904/teaching/6446535d-4905-4460-b24e-fe4f4894c469/6c785ed6-cdac-4242-ab87-b70b8d859bdc#petros-lessons-review |
| Activity preview | http://127.0.0.1:4904/teaching/6446535d-4905-4460-b24e-fe4f4894c469/6c785ed6-cdac-4242-ab87-b70b8d859bdc#petros-lessons-preview |
| Save / submit | http://127.0.0.1:4904/teaching/6446535d-4905-4460-b24e-fe4f4894c469/6c785ed6-cdac-4242-ab87-b70b8d859bdc#petros-lessons-submit |
| Learning goals | http://127.0.0.1:4904/teaching/6446535d-4905-4460-b24e-fe4f4894c469/6c785ed6-cdac-4242-ab87-b70b8d859bdc#petros-goals |
| Student progress | http://127.0.0.1:4904/teaching/6446535d-4905-4460-b24e-fe4f4894c469/6c785ed6-cdac-4242-ab87-b70b8d859bdc#petros-progress |
| English objective review | http://127.0.0.1:4904/teaching/6446535d-4905-4460-b24e-fe4f4894c469/482f1ad1-c07c-4386-a966-8a156fd09d64#petros-lessons-review |
| Independent synthetic reviewer entry | http://127.0.0.1:4903/demo/reviewer |
| Return to ordinary teacher | http://127.0.0.1:4903/demo/teacher |
| Mobile preview | Use the activity-preview URL above at 390×844 or 360×844 in browser responsive mode. The URL does not change the viewport. |

The reviewer entry changes only this isolated demo’s actor cookie and opens a separate disposable institution with an independently seeded reviewer. It grants no qualification to the ordinary teacher or to a real account. Use a separate browser profile/window context to inspect both modes independently; the teacher return link clears the demo reviewer cookie.

## Manual visual review

1. Open the landing URL. Within a few seconds, identify where to prepare a lesson, assign a goal and view progress.
2. Select `cloud-models.pptx`, then **Continue editing lesson**. Confirm the source, duration, actual objectives and saved state are obvious.
3. Choose **Edit** on an objective. Try “Classify the consumer and provider responsibilities using the cited source boundary.” Save, then confirm the changed objective requires review again. Use the menu for acceptance, ordering or source inspection.
4. Choose **Preview lesson**. Inspect the large read-only table/connections, switch objective with Previous / Next, and use **Change activity** to select a returned alternative. No student answer or score should appear.
5. Open **View source material**. Check the actual passage/table and native document location. Use Tab / Shift+Tab and Escape; focus should return to the trigger.
6. Continue to **Save & submit**. Save a draft or submit it for review. If already submitted by browser verification, make and save a wording edit first. Confirm that waiting for review and unavailable student use are separate statements. Open **See what’s needed** to inspect all dimensions.
7. For a manual conflict, open the same review URL in two tabs. Start wording in tab A. Edit and save the same objective in tab B. Save A: the update message must preserve A’s wording. Review latest changes, choose whether to use the latest version or continue with your wording, then save explicitly. Neither version should be overwritten silently.
8. Open the English URL. Confirm the lesson concerns argument claims, evidence and assumptions, and its preview remains relevant to that source.
9. Open Learning goals and Student progress. Confirm truthful empty states and no assignment action for unavailable recipients.
10. In a separate browser context, open the reviewer entry. Inspect qualified subject decisions and private-family controls. Confirm instrument approval requires a reason, source/exposure review and explicit non-equivalence. Teaching approval alone must not enable student use. Return to the ordinary teacher and confirm privileged tools disappear.
11. Review at 1440, 1280, 768, 390 and 360px. Inspect both the initial context and the lesson content after scrolling. Check objective editing, menus, footer actions, navigation and drawers. Verify Notes, Files and Class updates remain reachable; their publication operations are outside this contained demo.
12. Approve or request changes to the visual experience. **Do not continue to M4 from this report.**

## Reproduction

Use Node **24.21.0**, with no configured database target variables. From `apps/api`, start the isolated service:

```sh
LC_ALL=C LANG=C node -r ts-node/register/transpile-only -r tsconfig-paths/register scripts/serve-petros-m3-teacher-ux.ts
```

From `apps/institution-web`, start the existing portal with separate build output:

```sh
PETROS_ISOLATED_VERIFICATION=1 PETROS_ISOLATED_DIST_DIR=.next-petros-teacher-ux-dev NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4903 NEXT_PUBLIC_DEV_INSTITUTION_USER= node node_modules/next/dist/bin/next dev -H 127.0.0.1 -p 4904
```

From repository root, use the new preservation-aware test runner:

```sh
node apps/api/scripts/verify-petros-m3-teacher-ux.mjs --suite=all
```

From `apps/api`, run `node scripts/verify-petros-m3-teacher-ux-browser.mjs` after the listeners are ready. Each browser run uses a new timestamp directory. The existing installed Chrome-for-Testing path is explicit in the browser scripts; adapt it on another machine. No browser or provider dependency was downloaded.

## Remaining limits and acceptance

Human visual approval is pending. The representative ten-teacher study and assistive-technology-user testing have not been performed; the [existing usability protocol](m3-teacher-usability-protocol.md) remains pending.

Proposals in this demonstration use controlled data or document outlines. Source reconstruction does not qualify precise PDF/Office rendering or subject meaning. M2-G genuine inference and independent academic/source quality gates remain open. Student interaction, assessment execution and V2 publication remain unavailable. Owner-only reviewer source access has not been broadened. The demo’s separate reviewer institution is an explicit synthetic authorization-path fixture, not a real academic qualification workflow.

All existing historical preservation findings remain disclosed. No M4 implementation or production action was started. This deliverable is ready for the requested manual UI/UX review.
