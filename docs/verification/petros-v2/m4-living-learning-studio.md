# Compact studio revision — 19 October 2026

The user rejected the earlier spacious/static UI. This new frontend pass tightens the masthead, title, objective, companion prompt, source/activity spacing, welcome screen and response controls. The current source occupies one focused stage with a revealed-source trail. Real controller progress drives source highlighting and supported Petros teaching poses; explicit questions admit the authored listening pose. Source table rows expose their exact current values in a contextual focus panel. Pause/reload/resume preserves the selected source panel and committed work.

- [Open the revised Cloud lesson](http://127.0.0.1:4953/demo/delivery), [Welcome](http://127.0.0.1:4953/demo/entry), [English](http://127.0.0.1:4953/demo/english-delivery).
- [Fresh screenshots and four actual browser recordings](http://127.0.0.1:4957/review.html).
- Current pass: **428 student tests passed / 0 failed / 0 skipped; 26 browser checks passed / 0 failed / 0 skipped.** Student build, sequential typecheck and focused lint pass. At 1440×900, the focused comparison and full controls end at 736.27px. Mobile checks cover 360/390/768px, with 1280/1440px desktop checks.
- [Current revision report](m4-compact-studio-20261019T074948Z/implementation-report.md), [exact receipts and earlier failed attempts](m4-compact-studio-20261019T074948Z/verification-summary.json).

Human visual acceptance remains pending. The older historical preservation exception is still unresolved. This pass makes no M5/backend/assessment/schema/evaluator/provider changes; prior suites below are historical evidence, not fresh runs. The complete earlier report is retained verbatim below and backed up in this new timestamped directory. Browser control became disabled after captures; no workaround was used to alter that setting.

---

# Current review handoff — 19 October 2026

The existing M4 Learning Studio has been refined and freshly verified in the actual application. This pass fixes exact excerpt/reference identity, full structured-source presentation, safe renderer-budget fallback, persistent display preferences, system reduced motion, durable masthead navigation and feedback/companion qualification. It reuses the earlier studio design and existing avatar/controller; it does not claim that earlier work as new.

- [Open the current review gallery, screenshots and four uncut recordings](http://127.0.0.1:4955/review.html).
- [Enter Cloud](http://127.0.0.1:4953/demo/delivery), [enter English](http://127.0.0.1:4953/demo/english-delivery), or [open Welcome](http://127.0.0.1:4953/demo/entry). API: 4953; student app: 4954; gallery: 4955. Use `127.0.0.1` consistently.
- Final verification: **423 student + 583 schema/canvas/timeline + 1,564 API/M4/M3/V1 = 2,570 automated tests passed; 0 failed; 0 skipped. Browser: 55 passed; 0 failed; 0 skipped.** Both builds, four typechecks and final focused lint passed. Local interaction p95: **17.10 ms**, 20 Chromium/Brave samples; physical-device qualification remains open.
- [Current complete A–Q implementation report](m4-studio-review-20261019T072029Z/implementation-report.md), [exact commands/counts and earlier failures](m4-studio-review-20261019T072029Z/verification-summary.json), [preservation audit](m4-studio-review-20261019T072029Z/historical-audit-current.json), [new design/state map](m4-studio-review-20261019T072029Z/design-spec.md).

**Human acceptance remains pending.** The earlier five-receipt M3 preservation failure described below remains unresolved; passing checks do not clear it. This run redirects legacy evidence writers and preserves the earlier report in full below and in its hashed backup. The preexisting later experiment's running dev log appended during shared-source hot reload; its original 5,900-byte prefix was verified against the starting hash and retained. No M5 source implementation, migration, planner, provider call or deployment was performed in this pass; preexisting later experiments were preserved. Stop at this student-experience handoff.

---

The remainder is the preserved 16 October report. Its old URLs and milestone status statements are historical; use the dated current handoff above.

# Petros V2 M4 — Living Learning Studio

16 October 2026 (Asia/Kolkata). Isolated engineering and manual UI review only. **M5 has not started. No deployment, real academic approval, paid inference, grades or production release occurred.**

**Acceptance remains open.** The UI and its functional verification are ready for human review, but this run failed the historical-preservation requirement: five existing M3 JSON receipts were overwritten by an integration run I launched without the legacy writer's separate output override. Their exact original bytes have not been recovered. Starting hashes, new receipts, recovery attempts and the guard added to prevent recurrence are disclosed below. This is additional to the previously documented M3/M4 preservation exceptions. Passing tests do not erase that failure.

## A. Executive summary

Implemented the redesign in the actual Next.js student application. The V2 entry now welcomes the learner into a studio, features one authorized/resumable opportunity, and lists other available directions without fabricated progress. The active screen has a broad learning stage, a horizontal flow indicator, one objective, integrated Petros guidance, source exploration, explicit student participation, committed-work feedback and focused navigation.

Cloud demonstrates an actual source table, row focus, a logical/physical-resource excerpt, exact selection IDs, a durable response and deterministic criterion feedback. English uses the same shell with an issued passage, selectable paragraph focus, a comfortable writing area, durable prose and honest teacher-review status. Four uncut recordings come from the running browser. [Open the review gallery](http://127.0.0.1:4945/review.html).

The existing session hook, M4 command/commit/evaluator ownership, shared canvas reducer, target registry, presentation controller, companion pose governor and authored PNG assets are reused. This is a bounded read-only presentation integration, not the M5 Teaching Action Engine.

## B. Comparison with old M4 UI

The supplied current recording showed a narrow lesson card, detached three-step rail, static prose, dropdowns and a textual feedback list. The earlier Playground supplied evidence of capabilities, not a layout template. I inspected the current recording and the available `2026-10-11 14-08-59.mp4`; the latter has the same timestamp as the requested Playground recording but lacks `(1)` in its filename. Extracted reference frames and metadata are in [m4-studio-20261015T192054Z/reference](m4-studio-20261015T192054Z/reference).

The new screen removes the portal dashboard inside V2. A mint guidance band belongs to the learning surface, with Petros at its leading edge. Large source wording establishes focus; later excerpts and a native table join it. Participation changes the same stage into selection boards or passage-and-writing work. Feedback preserves the committed response rather than replacing it with a success banner. The old right-hand avatar/chat/sidebar arrangement was not copied.

## C. Design direction and state map

Warm paper, forest ink, restrained mint, editorial typography and fine rules connect the Edrion theme to a focused learning desk. The welcome screen has one featured action, not a course marketplace. Active navigation is limited to lessons, pause, preferences, sources, Ask and ending the session.

`M4 public snapshot → studio experience hook → existing PresentationController → stage and CompanionPoseController`. Server status and epoch changes interrupt the presentation. The hook coordinates view preferences and the current public cue; it performs no planning or evaluation. The controller owns text progression and its timers. The companion has no autonomous teaching clock.

`delivering` displays source exploration; `awaiting_response` yields to the student; a committed response enters pending reflection; only an evaluation bound to that response supplies criterion markers. `paused`, `closed` and `blocked` have distinct recovery surfaces. Progress checks describe this flow, not academic mastery.

The concise pre-build specification is [design-spec.md](m4-studio-20261015T192054Z/design-spec.md). Main implementation: `petros-session-shell.tsx`, `learning-stage.tsx`, `use-studio-experience.ts`, `studio-presentation.ts`, `studio-dialog.tsx`, the existing assessment panel, and their CSS module. The V2 focus-route branch prevents the legacy portal mentor from competing with the studio.

## D. Actual Petros integration

The manifest is `apps/student-web/public/petros/v2/rig/manifest.json`, version `petros.current-png.v4`. All **8/8** asset SHA-256 values match it: neutral, listening, thinking, speaking, and four cardinal pointing images. The studio mounts the existing `CompanionRig`, `PetrosAvatar`, target registry and pose governor; it adds a horizontal studio layout and accounts for the reserved sticky guidance band when validating visibility. [Asset inventory](m4-studio-20261015T192054Z/avatar-assets.json).

Teaching cues refer only to the currently admitted, highlighted source element. Missing, clipped, stale or unsupported targets settle safely. The existing bounded gesture hold/cooldown is retained. Asking admits the supported listening pose; student work stays neutral and quiet. Positive acknowledgment is available only after a matching complete server evaluation. Incorrect work produces neutral constructive guidance, not disappointment.

Idle is a quiet authored neutral pose. The existing periodic whole-image idle approximation and approximate mouth overlay are explicitly disabled in this studio. Natural blinking, independent gaze, facial controls, breathing, articulated arms, wrist/pen anchors, handwriting and phoneme sync are unavailable. No layers or expressions were invented. Compact, hide and text-only controls preserve captions and learning actions. Preference toggles currently apply to the mounted studio; reduced motion also follows the operating system.

## E. Learning-stage modes

| Mode | Implemented behavior |
| --- | --- |
| Explain | Prominent exact public lesson wording; one complete initial excerpt and clear next-excerpt controls |
| Demonstrate | Existing presentation timeline progressively introduces reviewed excerpts and a native source table, with coordinated emphasis and captions |
| Explore | Select an admitted excerpt, focus a table row, or focus a supplied passage paragraph; these interactions do not create assessments |
| Try | Explicit issued-task controls: native radio boards preserve choice IDs; numeric/text/canvas response branches remain supported by the existing contract |
| Reflect | Exact committed response plus server criterion status, pending feedback or teacher review; no mastery inference |

All modes share one shell and navigation. This slice does not invent equations, diagram edges, simulations or new answer modalities. The source-reading adapter uses the existing bounded fixture-subset presentation machinery strictly as a view of authorized public text. Its local representation canvas is never submitted as M4 student work, persisted as the server canvas, or admitted as evidence.

## F. Source grounding

The existing publication owner adds optional exact excerpts from non-rejected, reviewed proposal support. Each reference must belong to the publication's exact reference set. The optional field preserves absence when parsing historical publications, so adding the feature does not change their canonical hashes.

For a table, the publication owner reuses `PetrosContentUnitRepository.lookup` under the existing actor/source authority. The unit ID/hash must match; display and citation capabilities must be supported. Only resolved native table cells are included, with a 64-cell/12,000-character bound. The UI preserves row, column, span, header and cell values. It does not reconstruct relationships from a flattened text list. Oversized/unresolved/unsupported representations fall back to the approved quotation. A plain-text alternative accompanies the table.

Cloud source SHA-256 is `5ce5e6b855309556f0990ece00a6d7a2ecf7f7cb9a35f1b0a50b255c061e2c3b`; English is `d63c78926db53b0f0da0c766bfb0c5a3c377f42d000273cae5a83e8ca567c007`. These are the existing educational fixtures, parsed and admitted through the isolated M3/M4 path. Synthetic reviewer records demonstrate authorization plumbing; they are not actual academic qualification.

## G. Interaction and commitments

Cloud's two choice fields are visually richer native radio groups. Field IDs, choice IDs, response kind, task identity, instance hash, revision, epoch, canvas revision and explicit submit are unchanged. There is no drag/drop reinterpretation or client answer key. Keyboard arrow navigation works in every required viewport.

English paragraph focus marks only student-selected wording; it does not identify the claim or evidence for them and does not modify the response. The qualitative response remains a text commitment. A dedicated accessible label prevents restored answer text from contaminating the input's accessible name, a bug found and fixed during browser verification.

Optional working notes still use the existing session-mode canvas invitation, semantic edit commands, accepted revisions and undo/redo. The local teaching representation cannot write into that workspace. Explicit submission and server receipts remain the sole response-commit path. Completing an animation never submits anything.

## H. Feedback

The submitted selections/prose stay visible and frozen. A feedback result must reference the actual committed response. Only `evaluated` trusted-kernel criteria can show satisfied markers or an acknowledgment. `review_required`, `unavailable`, `invalidated`, mismatched responses and pending commitments cannot do so. English remains teacher-review-required. Pending and unavailable feedback preserve saved work and do not invite resubmission.

Criterion highlights appear beside the response. The public contract does not contain an explicit criterion-to-field mapping, so the UI does not invent one or color an arbitrary response field as academically correct. No verified badge, confetti, XP, streak, time-spent reward or mastery claim was added.

## I. Ask Petros

Ask opens a compact native dialog and interrupts the existing presentation. Before task issuance, it sends the existing authorized `ask` command and returns reviewed wording, clearly labelled **source reread, not a generated answer**. When a selected quotation has a source reference, the command carries its actual unit ID, source revision and hashes. The server rejects references outside the current publication and records the admitted target in the exposure event. No arbitrary DOM text is sent as authority.

Independent tasks block answer-revealing dialogue and source replay. For an issued task that explicitly permits `assisted_practice`, the existing hint command must commit an exposure before the snapshot exposes its reviewed explanation; the UI explains the independent-evidence consequence. A new public assistance status reflects that recorded event. No unrestricted tutor, controlled-model conversation presented as inference, new TTS route or generic chat was added.

## J. Session reliability

`usePetrosSession` retains ownership of generation/abort fencing, optimistic revisions, pending command identity, durable drafts, submission retry, recovery and polling. Pause saves a dirty response before advancing the epoch. Browser checks cover actual pause, reload, resume, connection failure and reconnection, exact committed-response restoration, double submit and delayed evaluation. M4 integration tests cover worker crashes, Redis loss, lease expiry, stale epochs and concurrency.

Reading reveal position is an optional **same-tab** session-storage checkpoint containing a content fingerprint and excerpt count, restored only after a current authorized snapshot. It carries no saved source text or academic evidence. The server checkpoint preserves the task, response draft and acknowledged canvas; cross-device synchronization of the cosmetic excerpt-reveal position is not implemented. Uncommitted response changes receive the existing unload warning. Local UI storage is not treated as a server receipt.

## K. Security and negative cases

M4 student principal/institution/class/source/publication checks, frozen release recipients, private instruments, deterministic evaluator, evidence admission and source-exposure rules remain server-owned. No SQL migration or configured database change was introduced. Source withdrawal removes lesson/task/canvas presentation, and issued independent tasks receive a redacted lesson explanation/excerpt projection rather than a client-only hidden source panel. Existing legacy help/source routes retain their M4 boundary/exposure checks.

| Requested negative case | Executed coverage |
| --- | --- |
| 1 nonexistent target; 15 wrong activity target | Studio target tests, existing canvas/companion tests, M4 task/branch checks |
| 2 animation after interruption; 4 withdrawn-source cues | Studio interruption/blocked-state tests and browser withdrawal check |
| 3 old-epoch speech; 27 voice cancellation | Existing shared narration/controller stale-event and controlled-media-event cancellation regressions; studio voice remains off |
| 5 private answer captions; 6 rubric dialogue | 203-case M4 privacy suite, public-only cue inputs and browser sentinel scan |
| 7 solution hints; 20 source inspector bypass | M4 assistance boundaries, redacted snapshots, actual Ask/source-drawer checks |
| 8 replay/exposure | M4 commands/assessment/source-exposure tests; replay is absent during independent tasks |
| 9 animation changing mastery; 10 client correctness | Schema/kernel/evidence tests; studio presentation has no evidence write path |
| 11 fake feedback; 21 simulated inference | Bound-response cue tests and explicit source-reread labelling |
| 12 duplicate submit | M4 database concurrency/idempotence tests and real rapid browser double click |
| 13 draft loss | Cloud/prose/mobile pause/reload and offline recovery; M4 canvas checkpoint tests |
| 14 wrong canvas revision | M4 canvas/revision/undo/commit races |
| 16 unsupported gesture | Manifest policy and companion-controller regressions |
| 17 missing assets | Existing fallback test and browser-aborted PNG requests; controls remain usable |
| 18 reduced motion; 19 hidden character | Required-width keyboard checks, OS reduced-motion and text-only/hidden-character browser checks |
| 22 cross-student; 23 cross-tenant | M4 ownership/privacy and source/release integration suites |
| 24 unauthorized release | M3/M4 scoped release, enrollment and withdrawal tests; genuine no-lesson actor in another class |
| 25 V1 regression | Original V1 route browser check plus full-journey and assignment-authority integrations |
| 26 keyboard/mobile obstruction | Five viewport checks, native radios, dialog focus and restored textarea accessible-name regression |
| 28 unavailable evaluation success | Actual isolated evaluator-failure actor and cue tests; no success reaction |

These are engineering checks, not a human screen-reader or educational fairness certification.

## L. Responsive and accessibility results

Desktop/tablet/mobile screenshots and keyboard operations passed at **360, 390, 768, 1280 and 1440px**. Mobile uses a compact in-flow companion, stacked stage and full-width primary submission. Desktop guidance can remain sticky during explicit guided reading; target visibility excludes that reserved area. Source tables have a keyboard-reachable scroll region and plain text alternative. Sources, preferences and Ask use native modal focus containment, Escape and return focus.

Text-only, hidden-character, system reduced-motion and 200% CSS-zoom reflow checks passed. CSS zoom is a layout test, not certification of OS/browser zoom. No physical phone, real on-screen keyboard, low-end hardware or human assistive-technology session was available; those remain manual review work. Text inputs are at least 16px and stay in document flow. Only committed statuses are live-announced, not animation frames.

## M. Performance

Actual local radio interaction-to-next-animation-frame measurement: **20 samples, median 15.4ms, p95 16.1ms**. This is a small Chrome desktop measurement, not a production performance qualification.

The final disposable M4 harness measured 51 admissions, 400 identical retries, 50 reads and 50 restricted deterministic evaluations: admission p95 **197.0ms**, read p95 **107.9ms**, evaluation p95 **49.9ms**. These local warm samples meet the corresponding 500ms admission and 300ms deterministic-evaluation targets; provider/production latency is unqualified. Development page timings include Next compilation and asset loading and are not used as production targets.

No idle JavaScript animation loop, speech generation or model request is added. CSS transitions and the existing bounded text-presentation timer provide motion. Page visibility interrupts presentation work. All eight authored poses reuse the existing renderer; no new runtime animation dependency was introduced.

## N. Verification and preservation

Final disjoint test suites, Node **24.21.0**, actual local PostgreSQL/Redis, no configured database target:

| Suite | Passed | Failed | Skipped | Files |
| --- | ---: | ---: | ---: | ---: |
| Student frontend, companion, presentation and accessibility | 400 | 0 | 0 | 67 |
| Schemas, shared canvas reducer and timelines | 578 | 0 | 0 | 70 |
| M4 persistence, privacy, assessment, ownership, queue and recovery | 1256 | 0 | 0 | 10 |
| M3 release/private review/gateway plus V1 full journey/assignment | 55 | 0 | 0 | 5 |
| Legacy-output guard | 2 | 0 | 0 | 1 |
| **Disjoint automated tests** | **2291** | **0** | **0** | **153** |
| Main browser assertions | 52 | 0 | 0 | — |
| Supplementary pointing/mobile/recovery assertions | 7 | 0 | 0 | — |
| Source-stage viewport and table alternative assertions | 10 | 0 | 0 | — |

Evidence: [student](m4-studio-20261015T192054Z/student-tests-final-accepted.json), [schema](m4-studio-20261015T192054Z/schema-tests-complete.json), [M4](m4-studio-20261015T192054Z/m4-tests-final-complete.json), [guarded M3/V1](m4-studio-20261015T192054Z/m3-v1-output-guarded.json), [guard](m4-studio-20261015T192054Z/evidence-output-tests-final.json), [browser](m4-studio-20261015T192054Z/browser-handoff/browser-results.json). Supplementary [pointing/mobile/recovery](m4-studio-20261015T192054Z/browser-supplement-final/results.json) and [source-stage width](m4-studio-20261015T192054Z/browser-source-widths/results.json) checks passed, for **69 browser assertions** across these disjoint groups. A dedicated four-check stale-revision rerun also passed but overlaps the supplementary cases and is not added to that total. The focused 7-case source/assistance boundary run also passed; it overlaps the M4 total and is not counted twice.

Student production build, API TypeScript build plus asset copy, API/schema/client/student typechecks and focused lint were run. Exact commands, exit codes and every repeated attempt are in [executed-commands.json](m4-studio-20261015T192054Z/executed-commands.json) and [test-attempts.json](m4-studio-20261015T192054Z/test-attempts.json). [Final environment](m4-studio-20261015T192054Z/verification-environment.json) records the required flags, and [browser-attempts.json](m4-studio-20261015T192054Z/browser-attempts.json) records every browser attempt. Final lint has **0 errors and 7 existing type-only-import warnings** in the NestJS publication/session files; converting constructor imports solely to silence lint would affect emitted dependency-injection metadata. The repository also emits a Next pages-directory notice and Vite CommonJS deprecation notice.

Failures retained, not omitted:

- Initial sandbox launch failures: local listening-port/shared-memory permissions. Restarted after explicit user permission.
- An early combined API run was interrupted after I misread connection errors from the intentional Redis-outage test. It has no trustworthy final case count; its log and command exit remain.
- Wrong historical repair-patch flag: one M4 attempt had **9 failed files, 20 passed / 0 failed / 1235 skipped cases**; the combined attempt had **14 failed files, 273 passed / 0 failed / 1290 skipped cases**. Before-all failures prevented those skipped cases from running. Corrected runs passed all current required suites. No repair patch was applied to a live target.
- A focused frontend attempt had **130 passed / 1 failed / 0 skipped** after the target guard was tightened; the stale test cue was corrected. The final full suite includes the replacement checks.
- Early typechecks caught a Next generated-route-type race, a fixture literal type, an unused test binding and a Testing Library option type. Final typechecks/builds supersede them. Initial expanded script lint caught missing Node/browser globals; it was corrected.
- Browser attempts: **0/1** (API fixture startup refused invalid roster), **16/1** (restored textarea label, fixed), and **50/1** (V1's continuous requests prevented `networkidle`; changed to DOM-loaded plus a real ready control). Final main browser run **52/0**. Supplemental attempts retained **5/2** (one failed notice assertion was also recorded by the catch block), **4/1** (paused-page readiness), and **1/1** (Next route-announcer matched an unscoped alert locator); scoped ready/alert locators fixed the harness. Final supplement **7/0**, dedicated stale rerun **4/0**, and source-width supplement **10/0**. No new product defect was hidden by these locator changes. The failed recordings/results are retained separately.
- Repository Prettier configuration referenced a missing optional Tailwind plugin; formatting used the same local options without that plugin. No dependency was installed or configuration weakened.

**Historical preservation failure.** Starting audit covered **5,341 existing verification files**. Five M3 receipts were overwritten because `PETROS_M4_EVIDENCE_DIR` alone did not redirect `petrosVerificationOutput`; that helper required `PETROS_VERIFICATION_EVIDENCE_DIR`. New receipts were copied to [m4-studio-20261015T192054Z/legacy-m3-test-output](m4-studio-20261015T192054Z/legacy-m3-test-output). Exact recovery searched existing receipts, archives and prior local output records and found no byte-for-byte originals matching the captured hashes. No receipt was fabricated or relabelled as original. The helper now also honors M4's output directory, with two explicit regression tests. The guarded M3 rerun writes below this new timestamped directory.

The affected original paths are `docs/verification/petros-v2/m3-evidence/` plus `two-subject-proposals.json`, `synthetic-release.json`, `gateway-ledger.json`, `changed-source.json`, and `private-authorization-path.json`. Starting/replacement hashes and exact exceptions are in [preservation-after.json](m4-studio-20261015T192054Z/preservation-after.json) and [historical-receipt-recovery.json](m4-studio-20261015T192054Z/historical-receipt-recovery.json). Their current content must not be treated as their original historical evidence. The final preservation audit has 5,335 byte-identical files, five overwritten receipts and one active-log exception, with no missing baseline files. The active M3 development log retains the exact original byte prefix (4,963 bytes); 266 appended bytes were observed at the audit. It is disclosed rather than truncated. The earlier report's two already-irrecoverable M3 receipts and append-only active-log exception remain disclosed in [the historical M4 report](m4-student-sessions-and-assessment.md). This run does not repair or re-certify those historical gaps.

**Consequently the complete request cannot be marked fully satisfied on preservation, despite the passing functional checks. Human acceptance and M5 remain blocked/pending.**

## O. Visual evidence and exact local URLs

The running API is **127.0.0.1:4943**, student application **127.0.0.1:4944**, review gallery **127.0.0.1:4945**. Use `127.0.0.1` consistently for cookies. Each handoff signs in its disposable synthetic actor; no real credentials are needed. Do not mix multiple roles in one browser session unless intentionally switching actors.

| View | Exact URL |
| --- | --- |
| Welcome / authorized opportunities | http://127.0.0.1:4943/demo/entry |
| Cloud introduction and source exploration | http://127.0.0.1:4943/demo/delivery |
| Cloud issued question | http://127.0.0.1:4943/demo/question |
| English introduction | http://127.0.0.1:4943/demo/english-delivery |
| English issued passage / response | http://127.0.0.1:4943/demo/english |
| Saved paused draft | http://127.0.0.1:4943/demo/paused |
| Actual delayed evaluation | http://127.0.0.1:4943/demo/pending |
| Deterministic feedback | http://127.0.0.1:4943/demo/feedback |
| Evaluator unavailable | http://127.0.0.1:4943/demo/unavailable |
| Withdrawn source | http://127.0.0.1:4943/demo/blocked |
| No released lesson for this actor | http://127.0.0.1:4943/demo/empty |
| Mobile actor | http://127.0.0.1:4943/demo/mobile |
| Existing V1 | http://127.0.0.1:4943/demo/v1 |
| Gallery / four videos | http://127.0.0.1:4945/review.html |
| Current session URLs | http://127.0.0.1:4943/demo-info |

All screenshots are in [m4-studio-20261015T192054Z/browser-handoff](m4-studio-20261015T192054Z/browser-handoff), including welcome, introduction, source comparison, Ask, activity, pause, feedback, English, mobile, five widths, text-only, offline, pending, unavailable evaluator, withdrawn source, no lesson, missing artwork, zoom and V1.

| Recording | Actual uncut browser capture |
| --- | --- |
| A — Desktop Cloud | [MP4](m4-studio-20261015T192054Z/browser-handoff/recordings/A-desktop-cloud.mp4) |
| B — Desktop English | [MP4](m4-studio-20261015T192054Z/browser-handoff/recordings/B-desktop-english.mp4) |
| C — Mobile 360px | [MP4](m4-studio-20261015T192054Z/browser-handoff/recordings/C-mobile-360.mp4) |
| D — Companion states | [MP4](m4-studio-20261015T192054Z/browser-handoff/recordings/D-companion-behavior.mp4) |

Original WebM files are retained. MP4 encoding changes the container/codec only: no cuts, generated footage, compositing, dubbing or hand edits. [Recording metadata](m4-studio-20261015T192054Z/recordings.json). Browser automation operates real UI controls; grading and persistence use the actual isolated services. The pending actor's eight-second delay and unavailable actor's thrown evaluator error are explicitly controlled engineering failure fixtures, not provider behavior.

## P. Limitations and milestone boundaries

M4 now has the studio UI integration. M5 adaptive action selection, real tutoring/inference, belief updates from interaction, arbitrary rich assessment modalities and new source reasoning remain outside this work. M6 needs legitimate layered art for natural facial/body control. M7 must qualify voice and synchronization; the studio is text-first and currently has no audio playback. No unknown character capability or missing qualitative evaluator is simulated as real.

Additional limits: same-tab cosmetic reading-position restore; mounted-session preference controls; no staffed qualitative review UI; no invented criterion-to-answer mapping; no physical-device, actual mobile keyboard, screen-reader-user, low-end-device or independent educational validation. Source excerpts with no qualified structural representation remain text. The preservation failure above remains unresolved and prevents a clean completion claim.

## Q. Manual review guide

1. Open the gallery, then the welcome handoff. Check the featured action is actually available and that resume language appears only for a real saved session.
2. Open Cloud introduction. Use **Explore with Petros** or **Show next excerpt**. Watch source emphasis and the supported brief pose. Scroll; Petros must not point through clipped content or cover controls.
3. Focus a table row, open **Ask about this excerpt**, ask a question and choose **Bring back the source**. Confirm the reread label. Close; the source and place remain.
4. Choose **Try a question**. Petros yields. Use keyboard arrows to select the consumer and the retained access-policy boundary. Check Ask and Sources cannot reveal the explanation.
5. Save draft, pause, reload, resume. Verify both selections. Submit explicitly once. Inspect the real saved response and criterion feedback. Reload and confirm there is no second-submit invitation.
6. Open English introduction, then its task. Focus the survey paragraph, write an explanation, save/pause/reload, and submit. Expect **Teacher review needed**, no correctness claim and no success reaction.
7. Open the pending and unavailable links. The answer remains saved; no success is invented. Open withdrawn-source and no-lesson links and inspect the safe empty/recovery states.
8. Inspect 360, 390, 768, 1280 and 1440px. Check keyboard focus, long text, dialog Escape/return focus, source table alternative, actual device keyboard and browser zoom. Toggle compact, hide, reduced motion and text-only. Learning must remain usable without artwork or voice.
9. Open V1 and compare with its original route/interface. Review the preservation exceptions and failed-attempt receipts before any acceptance decision.
10. Record human acceptance/rejections. **Stop here. M5 requires separate human approval and disposition of the preservation failure and other open limitations.**

Restart commands, if the retained local processes stop: from `apps/api`, set `PETROS_M4_EVIDENCE_DIR` to a **new** directory and run `node -r ts-node/register/transpile-only -r tsconfig-paths/register scripts/serve-petros-studio.ts` with Node 24.21.0 and local PostgreSQL/Redis on PATH. Do not supply database/PG target variables or load the workspace environment. From `apps/student-web`, use `PETROS_ISOLATED_VERIFICATION=1 PETROS_M4_VERIFICATION=1 NEXT_PUBLIC_PETROS_M4_DEMO=1 NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4943 node node_modules/next/dist/bin/next dev -p 4944 -H 127.0.0.1`. Serve only this evidence directory on 4945 for the gallery. No hosted deployment is required.
