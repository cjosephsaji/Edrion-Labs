# M5 VM laboratory final refinement

Scope: the existing M5 Learning Studio and registered resource-capacity lab. Engineering verification uses disposable local PostgreSQL/Redis, extracted CC0 source documents and synthetic qualification records. No configured database, deployment, migration reconciliation, paid provider inference or M6 work is authorized by this report.

Evidence: [new timestamped directory](m5-vm-lab-final-20261020T153359Z/). Earlier reports and recordings remain separate.

## Problems confirmed

The supplied 35.75-second recording was read with native AVFoundation. [Frame 1](m5-vm-lab-final-20261020T153359Z/reference/user-recording-1.png) shows a current VM5 question alongside a saved VM4 prediction/result. [Frame 3](m5-vm-lab-final-20261020T153359Z/reference/user-recording-3.png) shows the VM3 question paired with a VM4 prediction and the expanded available-memory card pushing the lab below a large completed-work area. These are actual frames from the user's file, with [file identity](m5-vm-lab-final-20261020T153359Z/reference/reviewed-recording.json), not reconstructed before images.

The old UI selected the latest allocation and most recent prediction independently. The model had bounded observations, but no exact durable attempt identity connecting the pending question to its eventual outcome. Existing undo could also restore an older active prediction. Completed calculations rendered a full editable card inline, and Petros only had a special capacity-limit cue.

## Implementation

The shared registered kernel remains the sole arithmetic and allocation authority. Additive attempt metadata lives inside existing bounded canvas/checkpoint JSON; no schema migration or separate session/experiment store was added. `resource-experiment.ts` coordinates the existing kernel/reducer operations rather than implementing another simulation.

Every new attempt records its command-derived ID, session/activity/branch/element IDs, source identity/revision/hash, canonical model revision and input, kernel, exact initial quantities, requested operation/count, prediction and time, executed count, observation time, canvas revisions, status and optional attempt-specific explanation. Allocation observations join by exact attempt ID. Server command owners supply provenance and timestamps; students cannot submit a fabricated attempt/result payload.

The new `close_allocation_attempt` operation uses existing invitation, element-version, canvas-revision, draft-revision, command-idempotency and epoch fences. Source/publication validation still runs before mutations. Existing observation fields remain readable for old checkpoints, but an unlinked historical record never becomes the current result.

## State and persistence

| Event | Authoritative behavior |
| --- | --- |
| Ready | No active attempt; old outcomes appear only in history. |
| Predict | Creates a fresh pending attempt from the acknowledged model state; supersedes the old active identity. |
| Test | Requires the current prediction, same model/source/session and requested count; the registered kernel writes that attempt's outcome. The client shows a busy state only while the command is in flight. |
| Observe / compare | Only the current attempt's observation and exact initial state supply the prominent result and comparison table. |
| Explain | Saves text/time/revision on the observed attempt; the copy explicitly says it has not been checked. |
| Try another VM | Completes the observed attempt and returns to a new question without inheriting its result. |
| Cancel | Records cancellation and clears the active question without inventing an observation. |
| Remove / reset | Records an actual non-prediction operation and clears the active test. |
| Undo / redo | Restores acknowledged quantities, adds a restore receipt and preserves bounded history; never resurrects a pending question or old outcome as active. |
| Pause / reload / resume | Existing session and checkpoint persistence retains the exact active ID and accepted timeline prefix; no demonstration or allocation replay. |
| Delayed / duplicate / conflicting command | Existing session fences reject stale work; exact duplicates return the original receipt. A supplied old attempt ID is rejected even with a current element version. |

The latest experiment explanation must belong to its exact observed attempt before advancing to correction. A previously saved annotation cannot satisfy a newer result. Draft keys include activity/branch/element and attempt identity. Dirty explanation text stays mounted, and allocation changes/undo/advancement are disabled until it is saved. Prior full checkpoints retain history beyond the bounded 32 current records.

## Learning focus and reference navigation

The active question is the lab heading. Memory visualization and the relevant prediction/result controls sit alongside each other where space allows. Ready/pending states expose prediction and testing; observed states expose comparison and explanation. Release/reset, old tests, provenance and model assumptions are contained disclosures. The UI uses neutral “Your prediction”, “What happened”, “Your previous answer”, “You're working on” and “Read this explanation”. A disproved prediction is an observation, not a failed assessment.

“Available memory — 48 GB” is a compact completed-step button. It opens the existing modal with its calculation, checked value and source action. It does not insert a full card, duplicate editable inputs, unmount the active lab or clear the draft. Escape/close returns focus to the opener. Mobile uses the same contained modal and existing current-step navigation.

## Petros coordination

Meaningful acknowledged events feed the existing companion cue/controller/pose governor: prediction recorded, first student allocation/result comparison, first approach to the trusted limit, first refusal/boundary comparison and saved explanation. Introduction and demonstration remain on the existing accepted teaching timeline. Formal waiting and criterion feedback remain tied to actual submission/evaluation state.

Each interaction cue carries attempt/event identity, current canvas revision, element version and session epoch. A target-directed pose additionally requires the real registered element to be visible, current and highlighted. Stale/hidden targets yield a neutral pose. The actual memory region is the target, instead of the whole potentially tall card. Existing cooldown/seen-action/reduced-motion rules remain authoritative. Ordinary allocations after the instructional checkpoints emit no new cue. Pointer manipulation, input focus and reference inspection suppress interruption independently. No new autonomous timer, fake speech, articulated hands or unsupported rig feature was added.

## Complete assisted correction flow

The approved assisted-practice mechanism is reused. The original independent answer of seven remains immutable with its original private criterion failure. After prediction, actual allocation/refusal, explanation and correction to six, saving creates a new canvas/checkpoint revision. “Review your correction” issues the reviewed equivalent practice task. Explicit submission commits a new immutable response, which the real private evaluator processes. Feedback uses actual criterion outcomes. Duplicate commit delivery returns the same committed response.

The corrected response remains assisted and separate from independent verification. The lab's prediction/explanation does not generate mastery credit. An unused, reviewed, non-equivalent family is required for a fresh independent check; unavailable qualification remains unavailable. No new family or private answer is fabricated. Unavailable feedback now says “Feedback unavailable” and keeps criteria neutral rather than implying an evaluation is still pending.

## Verification

The shared schema/kernel suite passed **161/161**. The full Petros V2 and existing Petros component pass passed **429/429** across 58 files. After browser findings, the affected reference/feedback/cue suites passed **45/45**, adding three cases; the resulting unique frontend coverage is **432 cases**, not 474 independent cases. A separate governor/reference pass passed 29/29 while diagnosing the cue fix. [Exact command/exit ledger](m5-vm-lab-final-20261020T153359Z/commands.jsonl), [shared JSON](m5-vm-lab-final-20261020T153359Z/schema-final.json), [full frontend JSON](m5-vm-lab-final-20261020T153359Z/frontend-final.json), [affected final suites](m5-vm-lab-final-20261020T153359Z/final-ui-repair.json).

All five M5 API files passed **80/80**: contracts 50, durable loop 12, interactive persistence/assessment 9, refinement 3, progress 6. The initial runner omitted JSON reporter arguments due to a filename-membership check; its complete console log and successful exit are retained in [M5 API log](m5-vm-lab-final-20261020T153359Z/api-m5-tests.log). The runner was corrected for later checks; no failed output was overwritten.

The broader M4 pass covers assessment 21, boundaries 7, canvas 5, adversarial HTTP privacy 203 and reliability 1,002. Its first run had one assessment failure and a boundary setup failure in M2 source preparation (`PETROS_M2_VALIDATION_OR_INFRASTRUCTURE`), plus a missing evidence-directory error in reliability teardown. The **1,000 repeated duplicate/conflict/stale/foreign checks and actual warm/V1 cases themselves passed** in that run. The assessment and boundary files then passed **28/28** in fresh disposable fixtures with no application change. The underlying source-preparation failure cause was not established; this report does not conceal it as a clean initial run. [Initial broad result](m5-vm-lab-final-20261020T153359Z/api-regression.json), [successful 28-case retry](m5-vm-lab-final-20261020T153359Z/api-repair-regression.json). The artifact directory was created before rechecking the actual performance/V1 cases. That filtered retry passed **2/2 executed cases** with a clean teardown; its other 1,000 cases were deliberately filtered out because they had passed in the initial run. [Artifact/performance/V1 retry](m5-vm-lab-final-20261020T153359Z/api-reliability-artifact-repair.json), [warm measurements](m5-vm-lab-final-20261020T153359Z/api-evidence/reliability-performance.json).

The final unique-case ledger reconciles **161 shared + 432 frontend + 80 M5 API + 1,238 M4 regression = 1,911 passing cases**, using the successful affected-file retries without counting repeated executions twice. This is not one clean 1,911-case test command. [Exact final-case reconciliation](m5-vm-lab-final-20261020T153359Z/final-test-summary.json).

Schema, student and API type checks passed. The final student production build and API production TypeScript build/runtime-asset copy passed. Scoped lint passed with zero errors and five retained Nest type-import warnings, plus the repository's root pages-directory notice. Existing Vite CJS, media-query test harness and React act warnings are recorded; passing tests are not presented as a warning-free run.

The browser findings produced two functional fixes beyond the initial tests: an event cue accepts the server-focused lab even when the correction retains the teaching highlight, and an explanation cue survives its draft-only checkpoint with the same event identity. The final feedback review also found that compacting evaluated calculations hid their inline criterion feedback; those actual criteria now stay visible beside the compact calculation. Regression cases cover all three. Diagnostic recordings remain separate from successful continuous takes.

## Actual browser demonstrations

**Six continuous actual-app recordings passed 99/99 assertions, with zero page errors in the selected takes.** [Watch all six](http://127.0.0.1:4975/review.html), [portable local index](m5-vm-lab-final-20261020T153359Z/recordings-final/review.html), [exact assertions, timing and take provenance](m5-vm-lab-final-20261020T153359Z/recordings-final/results.json), [actual public snapshots](m5-vm-lab-final-20261020T153359Z/recordings-final/public-snapshots.json).

The user previously explicitly authorized the repository Playwright recorder. The existing recorder helpers were reused in `verify-petros-m5-vm-final.mjs`, using real loopback authentication and UI commands, no route mocks or frontend state injection. Each video is an uninterrupted browser-context recording copied byte-for-byte, without splicing. Separate successful takes were selected for separate requested demonstrations; [media identity, duration and original take](m5-vm-lab-final-20261020T153359Z/recording-media-audit.json) records their provenance. The gallery and all six video URLs returned HTTP 200 with the correct content type and byte length: [HTTP audit](m5-vm-lab-final-20261020T153359Z/recording-http-audit.json).

| Recording | Duration | Demonstration |
| --- | --- | --- |
| [A — Full correction](m5-vm-lab-final-20261020T153359Z/recordings-final/A-full-correction-cycle.webm) | 1:26.80 | UI submission of original seven, real failed private criterion, accepted Petros introduction/demonstration, keyboard prediction/test, seventh-VM refusal, explanation, correction to six, new immutable assisted commit, actual evaluated criterion feedback and unavailable fresh reviewed check. |
| [B — State consistency](m5-vm-lab-final-20261020T153359Z/recordings-final/B-exact-experiment-history.webm) | 2:10.20 | Current VM3 without VM2's outcome, explicitly historical VM2, pause/reload/resume pending identity, observed identity after reload, cancellation, release, undo/redo without resurrected attempts, reset and a distinct new attempt. |
| [C — Reference and layout](m5-vm-lab-final-20261020T153359Z/recordings-final/C-compact-reference-and-focus.webm) | 0:58.96 | Dirty explanation preserved through compact calculation modal, unchanged lab position/height/scroll, restored opener focus, all five widths and mobile modal focus/draft preservation. |
| [D — Petros coordination](m5-vm-lab-final-20261020T153359Z/recordings-final/D-meaningful-petros-coordination.webm) | 2:50.64 | Accepted timeline prefix preserved through pause/reload/resume, prediction/first result, quiet typing, saved unchecked explanation, boundary observation, actual submission/evaluation and feedback, then evaluated result recovery. |
| [E — 360px full touch cycle](m5-vm-lab-final-20261020T153359Z/recordings-final/E-full-mobile-touch-360.webm) | 1:42.76 | Original wrong response, touch prediction/drag/taps, refusal boundary, explanation, text alternative, mobile correction navigation, explicit new commit and actual criterion feedback. |
| [F — English regression](m5-vm-lab-final-20261020T153359Z/recordings-final/F-english-argument-regression.webm) | 1:08.28 | Actual evidence-to-claim mapping, annotation, assisted prose response, private review-required result, pinned sources/Escape focus return and text-only/reduced-motion preferences. |

Seven saved pending-submission snapshots occur naturally across these runs. Waiting was not manufactured by intercepting or delaying evaluation. Original and corrected response IDs remain distinct in A/D/E. English interpretation remains review required. Graph/process and other automatic formats remain covered by the M5 loop/refinement and frontend suites, rather than being represented as additional human demonstrations.

Early diagnostic takes remain in `browser-attempt-1`, `browser-history-retake`, `browser-mobile-retake` and other retake directories. They are not indexed as successful demonstrations. They caught the real cue mismatch, plus recorder issues: a readiness/chunk-load error during editing, an empty-string boolean-attribute check that closed the allocation disclosure, a fixed-duration explanation assertion that ran before the final checkpoint settled, and a mobile tap during hot-reload/layout movement. These were corrected and the affected complete flows were recorded again. No failed artifact was relabelled as passed.

## Responsive behavior, accessibility and performance

The final browser checks found no horizontal overflow at **1440, 1280, 768, 390 and 360px**. [Desktop](m5-vm-lab-final-20261020T153359Z/recordings-final/width-1440-lab.png), [1280](m5-vm-lab-final-20261020T153359Z/recordings-final/width-1280-lab.png), [768](m5-vm-lab-final-20261020T153359Z/recordings-final/width-768-lab.png), [390](m5-vm-lab-final-20261020T153359Z/recordings-final/width-390-lab.png), [360](m5-vm-lab-final-20261020T153359Z/recordings-final/width-360-lab.png). [Compact reference open](m5-vm-lab-final-20261020T153359Z/recordings-final/C-reference-open.png), [mobile reference](m5-vm-lab-final-20261020T153359Z/recordings-final/C-mobile-reference.png), [actual criterion feedback](m5-vm-lab-final-20261020T153359Z/recordings-final/A-real-assisted-evaluation.png), [mobile feedback](m5-vm-lab-final-20261020T153359Z/recordings-final/E-mobile-authorized-feedback.png).

Keyboard Enter and the add button execute the same typed allocation operation as drag/drop. Prediction buttons expose `aria-pressed`; the current experiment has a polite atomic status announcement. Numeric readouts, units and the exact before/after table provide alternatives to the memory graphic. History uses keyboard-accessible native disclosures. Feedback states include words/symbols rather than color alone. Existing modal focus trapping/Escape behavior, reduced-motion/text-only preferences and visible focus styling remain in use. The correction field requests a decimal keyboard where appropriate. The actual mobile touch test found scroll Y **418 before and during the intended drag**, then **439 after the acknowledged state changed**; it did not pan during manipulation, but this is not a claim of zero post-acknowledgment layout movement.

Only local pointer-preview state updates during drag frames; the authoritative command is sent on drop. Individual pointer frames make no model request. Petros uses the existing event governor and registered target, without an extra animation clock. No production frame-rate or low-end GPU qualification is claimed.

[Measured browser request timing](m5-vm-lab-final-20261020T153359Z/browser-performance.json): **122 POSTs** had p50 **951.3ms**, p95 **2,092.4ms**, maximum **4,279.9ms**; **150 GETs** had p50 **1,010.5ms**, p95 **2,960.0ms**, maximum **4,433.7ms**. These measure request start to response start for real session requests on the loaded local development machine, not a clean production benchmark or full input-to-acknowledgment duration. The initial new Next route compilation took 131.2s with font-request retries; it is excluded from these warm session timings and remains visible in the demo log. Server acknowledgments are materially slower than the local drag preview; latency acceptance remains a human review item.

The actual server-side warm harness separately measured 51 admission calls (p50 **843.9ms**, p95 **1,436.9ms**), 50 saved reads (p50 **459.7ms**, p95 **795.9ms**) and 50 actual restricted-evaluator calls (p50 **180.6ms**, p95 **247.3ms**). The retry intentionally did not repeat the already-passed 1,000 boundary cases, so its workload counters are zero. [Server timing summary](m5-vm-lab-final-20261020T153359Z/server-performance-summary.json).

Touch is Chromium emulation, not physical hardware qualification. Human screen-reader, contrast-tool, enlarged-text, physical mobile and low-end GPU acceptance remain manual gates. DOM/keyboard assertions do not constitute human accessibility certification.

## Direct manual review URLs

The refined demo is a separate disposable instance on **API 4973 / web 4974**, with a distinct cookie name and Next output directory. The user's old 4964 demo was not reset or overwritten.

- [Open a fresh VM repair lab](http://127.0.0.1:4973/demo/method-preview?fresh=1): seeds the actual independent wrong answer and accepted teaching operations through existing server services, then redirects to the authenticated 4974 session. Predict/test a VM, open “Earlier tests”, inspect the compact available-memory reference, save an explanation, revise six and explicitly submit the assisted correction.
- [Begin from the original independent question](http://127.0.0.1:4973/demo/cloud-a?fresh=1): choose Consumer, enter available memory 48 and capacity 7, Submit answer, wait for actual feedback, then “Work on this with Petros”.
- [English argument](http://127.0.0.1:4973/demo/argument-preview?fresh=1).
- [Graph preview](http://127.0.0.1:4973/demo/graph-preview?fresh=1), [process preview](http://127.0.0.1:4973/demo/process-preview?fresh=1), [standalone experiment](http://127.0.0.1:4973/demo/experiment-preview?fresh=1).
- [Six recording review page](http://127.0.0.1:4975/review.html).

Bootstrap links issue the synthetic actor's local cookie before redirecting; a bare session URL in another browser does not establish ownership. `fresh=1` closes only that disposable demo actor's old session and starts its new demonstration. Local URLs require the running processes on this machine. Demo identity and source pins: [demo-info.json](m5-vm-lab-final-20261020T153359Z/demo/demo-info.json).

## Preservation

[Historical audit](m5-vm-lab-final-20261020T153359Z/historical-preservation-audit.json): **3,098/3,098 captured prior evidence files unchanged**, with zero missing or changed files. Runtime logs/videos/PID files and AppleDouble metadata were excluded at baseline; this is an audit of the captured manifest, not a claim that every repository byte stayed fixed. Unrelated dirty work, plan and prior reports remain preserved. [Source baseline diff](m5-vm-lab-final-20261020T153359Z/source-baseline-diff.patch), [final file inventory](m5-vm-lab-final-20261020T153359Z/final-file-inventory.json). Next-generated tsconfig include paths were recorded and retained. No commit, push, deployment, configured-environment migration or provider spend was performed.

## Negative coverage map

The numbers below correspond to the requested thirty categories. Repeated workload cases are not represented as thirty different academic validations.

| # | Required boundary | Actual verification location |
| --- | --- | --- |
| 1 | New prediction after result | Shared `resource-experiment.spec.ts`; browser B. |
| 2 | Historical prediction retained | Shared exact-history case; browser B pending VM3 / historical VM2. |
| 3 | Exact current observation | Shared exact join; interactive DB checkpoint reload; browser A/B. |
| 4 | Delayed old attempt | Shared old-ID/current-version rejection; interactive DB 409 case. |
| 5 | Consecutive attempts | Shared distinct IDs/before states; browser A/B. |
| 6 | Undo after prediction | Shared no-resurrection case. |
| 7 | Undo after observation | Shared undo/redo quantities/history; interactive DB; browser B. |
| 8 | Reset after observation | Shared reset invalidation; browser B. |
| 9 | Pause pending prediction | Interactive DB exact identity; browser B. |
| 10 | Reload pending/result | Shared serialization; interactive DB; browser B. |
| 11 | Stale revision | Shared invitation/version fences; interactive DB stale edit; M4 reliability. |
| 12 | Duplicate allocation | Interactive DB same command/receipt; M4 duplicate workload. |
| 13 | Conflicting student/Petros operation | Existing reducer and session epoch/version/accepted-prefix fences; interactive stale concurrent edit and M5 loop. |
| 14 | Beyond capacity | Registered kernel and shared refused exact attempt; interactive DB; browser A/E. |
| 15 | Invalid allocation/unit | Existing resource suite rejects fractional/negative counts, invalid model and extra `unit: MB`. |
| 16 | Altered parameters | Existing qualified parameter matrix plus unauthorized model replacement and forged attempt-model rejection. |
| 17 | Explanation without evaluation | Shared attempt-specific explanation readiness; UI unchecked wording; interactive DB no evaluation from exploration. |
| 18 | Unavailable evaluation | Feedback state/component and assessment-panel tests; neutral criterion behavior. |
| 19 | Incorrect original | Interactive DB actual seven/failing criterion; browser A/D/E. |
| 20 | Assisted correction | Interactive DB actual six/private evaluator/evidence ledger; browser A/D/E. |
| 21 | Duplicate correction commit | Interactive DB same commit command returns same response ID. |
| 22 | Private-answer leakage | Existing M4 assessment and 203-case adversarial HTTP boundary suite; browser public snapshot sentinel check. |
| 23 | Fresh family unavailable | Interactive standalone/assisted contract; actual unavailable outcome in browser A. |
| 24 | Source withdrawn pending | Interactive DB revocation during prediction blocks further mutation and hides teaching canvas while preserving response. |
| 25 | Stale Petros target | Cue session/source/epoch/revision/target tests; existing governor/rig clipped-target tests. |
| 26 | Input interruption | Existing controller quiet behavior; actual browser D typing and E touch manipulation. |
| 27 | Wrong-result success | Feedback tests for incorrect/partial/pending/review/unavailable; neutral refused-prediction UI; actual wrong-result browser A. |
| 28 | Reference loses work | Component test preserves same lab/input node and dirty text; browser C checks position, dimensions, scroll, text and focus. |
| 29 | Mobile modal focus | Browser C at 360px; source modal focus in F; existing dialog behavior. |
| 30 | V1 regression | M4 actual V1 paused → resume → pause → close lifecycle; existing component regression suite. |

## Limits and approval

The registered educational model covers fixed host reservation, whole memory allocations and no overcommit; CPU/storage/hypervisor overhead are outside this model. Other valid source-qualified memory configurations use the same trusted kernel. Changing parameters through an unauthorized edit remains rejected.

Independent qualified expert judgments added: **0**. The M5 90% expert-suitability gate remains pending. Genuine M2-G semantic inference/source-format qualification gaps, real-provider/source-upload authorization, academic/instrument review, human assistive-device acceptance, educational effectiveness/retention, live migration reconciliation and configured roles/RLS, production security/load/cost and release readiness remain open. Synthetic fixtures do not supply academic authority. Earlier documented M0-R/Phase-2/M4 issues are not cleared by this refinement.

Manual approval checklist:

- [ ] Watch recording A end-to-end; confirm the original wrong work, separate assisted correction and actual criteria are understandable.
- [ ] Try consecutive predictions, cancellation, release/reset and undo/reload; confirm history never answers the current question.
- [ ] Open the completed calculation while writing an explanation; confirm draft, position and focus are preserved.
- [ ] Review Petros's meaningful cues, restraint during input, visible-target behavior and actual waiting/feedback.
- [ ] Review the 360px full interaction and English review-required result.
- [ ] Complete physical-device, screen-reader/assistive-device, contrast and enlarged-text acceptance.
- [ ] Accept or request further work on measured acknowledgment latency and post-acknowledgment movement.
- [ ] Resolve the separate academic/provider/operational qualification gates as applicable; these engineering checks do not supply them.
- [ ] Explicitly approve M5 before any M6 work.

**Stop after this M5 refinement and await explicit manual approval. M6 has not begun.**
