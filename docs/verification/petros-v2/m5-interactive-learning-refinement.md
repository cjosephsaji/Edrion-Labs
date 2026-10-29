# M5 interactive learning refinement

**20 October 2026 · isolated engineering only · M6 has not begun.**

The existing Learning Studio now contains a manipulable, source-pinned resource allocation lab. Students predict, allocate/release whole VMs, compare acknowledged observations, explain the result, and explicitly commit a correction for assisted practice. A refused allocation stays refused. An observation or matching prediction never becomes an academic grade.

The approved theme, type, Petros placement, mathematical renderer, feedback distinctions, source inspection, and Explore → Your turn → Reflect structure remain. Desktop gives the lab most of the workspace beside the current calculation. Completed work collapses into a reopenable summary. Narrow layouts switch between the model and calculation while keeping both mounted, preserving unsaved explanation text.

Evidence: [new timestamped directory](m5-interactive-learning-20261020T081622Z/), [source inventory](m5-interactive-learning-20261020T081622Z/changed-files.json), [baseline patch](m5-interactive-learning-20261020T081622Z/changes-from-baseline.patch), [test union](m5-interactive-learning-20261020T081622Z/test-union.json). This is a dirty-workspace refinement, not a clean Git branch or a release.

## Inspection and reuse

Inspected the implementation plan and strengthened M5 requirements, [M5 teaching-engine report](m5-teaching-engine.md), [final UI report](m5-final-ui-refinement.md), [question-clarity report](m5-question-clarity-20261020.md), current canvas contracts/reducer, equation/diagram renderers, registered kernels, work checkpoints/commit logic, private assessment, source/reviewer policies, companion governor, and accepted presentation timeline before implementation. Baseline copies and Git status/head are in the evidence directory.

Reused `PetrosV2SessionService`, existing commands/events, current workspace/operation receipts/checkpoints, `SharedCanvasState`, scoped invitations, source/task/review pins, the deterministic teaching policy/compiler, `LearningCard`, existing equation/relationship editing, safe math, source dialogs, session drafts, immutable submissions, private assessment/evidence ledger, and the current Petros rig/pose/presentation controller. No dependency, new canvas database, provider tool, migration, or independent verification family was added.

New reusable capabilities are a typed `allocation` element, `predict_allocation` and `change_allocation` operations, acknowledged before/after observations, the allocation renderer and server-projected completion summaries. They implement allocate/release, predict/observe, compare, explain and revise through the existing registered architecture. The resource model has a closed kernel contract; it is not an arbitrary cross-subject execution system. English continues using the existing relationship and annotation operations.

## Trusted model, mathematics and source support

`resource-capacity.v1` now has one shared validated implementation used by the registered server solver and the shared canvas reducer. The browser renders acknowledged results; it does not invent capacity, remaining memory or success.

For qualified inputs:

```
availableGB = totalGB − reservedGB
capacity = floor(availableGB / perVMGB)
allocatedGB = admittedWholeVMCount × perVMGB
remainingGB = availableGB − allocatedGB
```

The closed input is GB, with nonnegative finite total/reservation, positive per-VM memory, reservation no greater than total, bounded inputs/counts and whole VM allocation. Whole-division handles floating point representation noise narrowly; `0.3 / 0.1` admits three, without a general rounding-up rule. Nondivisible remainder is retained. Invalid units/extra properties, negative/fractional/oversized counts and forged model receipts are rejected. Every accepted canvas receipt is rechecked against the pinned model.

The Cloud engineering fixture uses **64 GB total, 16 GB fixed reservation, 8 GB per VM**, giving 48 GB available and six whole VMs. These are source-backed fixture values, not universal renderer constants. Other parameter combinations, zero capacity, exact boundary, nondivisible remainder and decimal inputs are tested in `resource-capacity.spec.ts`.

The lab labels GB, fixed host reservation, whole allocations, no overcommit, and its memory-only scope. It explicitly ignores CPU, storage and hypervisor overhead. Removing/resetting allocations changes available-to-allocate remainder; the physical total and host reservation stay fixed. A seventh-VM attempt records the request and refusal, preserves six allocated VMs and zero remaining GB, and retains the student's prediction separately.

The actual fixture source is `packages/learn-evals/src/petros-v2/fixtures/sources/m5-cloud-capacity.txt`, pinned by source/revision/hash, extracted representation, unit/hash and TXT byte/text/line locator. English uses the existing `argument.pdf` and its actual PDF extraction provenance. Exact reviewed composition and source support are validated; this does not constitute independent semantic or academic qualification. Unregistered, unsupported or stale compositions fail closed. Sources remain inspectable in the actual app.

## Durable operations and assessment boundaries

Every meaningful lab edit uses the existing command ID, session/activity/branch/element IDs, revision, element version, scoped invitation, current source/task pins, operation receipt and checkpoint. Predictions must be saved before upward student allocation. Trusted demonstration operations use the existing teaching authority. Downward release/reset does not require a new prediction. The last 32 observations remain in the current element; prior full snapshots remain in durable checkpoint history.

Drag, add button and Enter use the same typed operation. A drag preview only highlights the drop area. Quantities change after a validated acknowledgment. Pointer cancellation or a drop outside memory does not allocate. Protected source elements and the pinned model cannot be changed through editing or undo. Duplicate commands return the existing receipt; stale/concurrent edits reject. Undo/redo increments revisions and cannot cross submitted-work boundaries. Petros cannot overwrite an active student invitation.

Explanations use the existing session draft, with a bounded typed marker scoped to the current activity/branch/element. Pausing saves that draft; reload/resume restores it. Explicit **Save explanation** annotates the canvas and flushes the draft. Practice owns its separate answer form after transition, preventing a lab explanation from clobbering the assessment response. The session hook tracks draft generations and current acknowledged revisions: a delayed save cannot clear a newer draft, and an older refresh cannot replace a newer acknowledged snapshot.

After a predicted experiment, entering practice requires a saved lab explanation. The explanation is retained **without** claiming qualitative evaluation. `complete_exploration` closes a standalone simulation with its existing checkpoint and an explicit `assessed:false` event; it creates no submission, evaluation or independent evidence. API tests verify this.

The lab is teaching/exploration, available after the permitted teaching action. An initial independent question does not contain the answer-bearing lab. Showing an equivalent solution records answer-relevant exposure. A corrected `6` after seeing the model is **assisted practice**, never fresh independent verification. The private evaluator checks the exact immutable committed canvas state using the existing criterion mapping. Original `48 ÷ 8 = 7` and its response remain in history; editing creates a new committed response.

Correct, incorrect, partial, pending and review-required feedback continue to derive from the existing authoritative projection. Saved inputs/predictions are neutral. A matching prediction is not a grade. Ambiguous English interpretations and prose explanations remain review-required/abstained where no qualified evaluator exists. Fresh verification requires a separately reviewed, eligible, unexposed task family. The ordinary demo has no such additional qualified family and honestly reports unavailability; the existing explicit test-only reviewed transfer fixture remains separately tested.

## Petros coordination and focused progression

The accepted timeline introduces the model, targets the actual lab and demonstrates one allocation through the same reducer. The existing controller governs the presentation; no second character timer or new gesture/facial system was introduced. During participation/input/dragging Petros yields. A real refused observation causes the existing supported teaching cue to target `memory-lab` and explain the actual remaining memory. The caption asks for an explanation before practice. Assessment reactions still follow authorized feedback rather than graphical prediction matches.

Pause/reload/resume retains the accepted presentation prefix, current operation state and explanation. Resuming does not replay a demonstration over student work. Target IDs resolve to current real canvas elements. Existing authored assets and pose governor are reused, including reduced-motion behavior.

Completion summaries are projected by the server from the reviewed element-to-field binding, the matching prior response/evaluation, revealed accepted prefix, current source and checked quantity. Reusing a surviving element ID for a different example cannot mark it complete. The frontend disclosure is navigation only; it cannot complete a task or bypass submission. The active calculation preserves the saved wrong value, with the permitted supported worked example behind a disclosure.

Desktop uses a two-column lab/current-calculation workspace. Question, previous feedback and rationale remain available in one compact disclosure. Already-correct available memory occupies one summary line. On small screens, **Explore model** and **Revise calculation** expose the current representation without stacking both in full. Saved explanations and sources stay accessible.

## Automated verification

The deduplicated, chronological union is **1,879 executed cases with passing evidence**: 139 schema, 422 frontend and 1,318 API cases. This is a union of the broad runs and targeted reruns, **not one wholly green omnibus run**. Repeated test titles are distinguished by their occurrence within the file. [Exact per-case statuses, source files and runs](m5-interactive-learning-20261020T081622Z/test-union.json) retain the original failures.

| Run | Result and scope |
| --- | --- |
| `schema-tests-final.json` | 139/139 passed, including 36 resource-model/reducer cases. |
| `frontend-all-initial.json` | 413 passed, 4 timed out at the existing 5-second limit, 417 total. |
| `frontend-retry.json` | Both affected existing workspace files rerun without file parallelism: 37/37 passed. No unrelated implementation change. |
| `frontend-latest.json` | 35/35 passed: allocation lab 12, delayed-ack session hook 3, feedback 17, teaching canvas 3. Other teaching-support cases also passed in `frontend-draft-verified.json`. |
| `api-tests-final.json` | 69/70 passed. The remaining failure was a new test accidentally nested in another test, subsequently moved to its proper suite level. Earlier two slow M5 timeouts also passed on rerun. |
| `api-interactive-verified.json` | 27/27 passed: interactive integration 6 and complete M4 assessment suite 21. |
| `m4-regressions.json` | 1,235/1,241 passed, including all 1,000 repeated boundary cases. Four assessment timeouts passed in the later 21-case assessment run. Reliability timing failure and its dependent lifecycle case passed in the targeted retry. |
| `reliability-retry.json` | 2/2 selected cases passed; 1,000 cases filtered by test-name selection, already passed in the broad run. Performance timeout raised to 300 seconds; original measurement was approximately 129 seconds under load. |
| `api-progress-unit.json` | 6/6 completion-projection cases passed. |
| `progress-projection-db.json` | The selected accepted-prefix/projection integration case passed; 2 filtered cases had passed in the prior complete refinement run. |

Exact command arrays, working directories, allowlisted isolated environment flags and timestamps are retained in `api-command*.json`, `api-interactive-command.json`, `reliability-retry-command.json`, `check-commands.jsonl`, `final-source-commands.jsonl` and associated logs. DB tests use fresh local PostgreSQL/Redis fixtures, not the configured application database. The obsolete `PETROS_READINESS_PROPOSAL_TESTS` patch flag and database/PG environment variables were removed from those subprocess environments.

New tests cover model initialization, reservation, valid add/remove/reset, boundary/refusal, invalid input/units, retained prediction, numeric rendering, protected edits, forged outputs, current model on undo, stale revisions, concurrent teaching/student authority, serialization, checkpoints, idempotency, immutable assisted commit, explanation gating, standalone exploration with no grade, source-bound completion and delayed-ack draft races. Existing M4/M5 regression suites cover source revocation, evaluator privacy/redaction, equivalent exposure exclusion, incorrect/correct/partial/review projections, English abstention, interrupted presentation and V1 compatibility.

The 35 requested categories map to these evidence groups:

| Brief categories | Evidence |
| --- | --- |
| 1–8 initialization/reservation/add/remove/overflow/boundary/invalid values/units | Shared 36-case resource suite and 6-case interactive DB suite. |
| 9–12 keyboard/touch/prediction/observation | 12 allocation UI cases and authentic browser recordings A/E. |
| 13–20 checkpoint/reload/undo/idempotency/concurrency/stale/revocation/protection | Shared reducer, interactive DB, existing M4 canvas/boundary/assessment suites and 1,000 reliability cases. |
| 21–24 exact commitment/assisted evidence/equivalent exclusion/privacy | Interactive DB, complete M4 assessment and public-response boundary suites. |
| 25–28 incorrect/correct/partial/pending/review | Existing feedback suite/gallery contracts, M4/M5 evaluations, actual math and English browser flows. |
| 29–32 Petros yielding/interruption/mobile/reduced motion | Session/companion suites, allocation UI suite and browser flows C/E/F. |
| 33–35 V1/English/M4-M5 persistence | Reliability lifecycle, complete assessment, M5 loop/contracts/refinement and English browser flow D. |

Final student production build, schema/student/API type checks and scoped lint results are recorded. The final API type/build pass initially identified an optional response passed as `undefined`; it was normalized to `null`. Both repaired API checks passed; the repaired checks and original failure logs are retained in [repair-build-commands.jsonl](m5-interactive-learning-20261020T081622Z/repair-build-commands.jsonl). Browser recorder syntax and scoped lint passed separately, with zero errors and five retained type-import warnings in the existing Nest service imports. Initial recorder lint identified missing Node/browser global declarations; these were fixed. No historical failed result was relabelled as passed.

## Browser demonstrations and accessibility

The user explicitly authorized the repository Playwright recorder after the browser-control API exposed no video capture and native capture timed out. Recordings use the actual loopback application, authenticated synthetic students, normal UI controls and genuine backend receipts. No route mocking, frontend state injection or fabricated success is used. The one-click preview routes explicitly seed synthetic prior work through the server; A/E/F begin by entering and submitting the incorrect answer through the UI.

**All six recordings passed: 76/76 browser assertions, zero page errors, recorder exit 0.** [Watch all six recordings](http://127.0.0.1:4965/review.html), [portable local index](m5-interactive-learning-20261020T081622Z/recordings-final/review.html), [exact assertions and request timings](m5-interactive-learning-20261020T081622Z/recordings-final/results.json), [actual public snapshots](m5-interactive-learning-20261020T081622Z/recordings-final/public-snapshots.json). [Media audit](m5-interactive-learning-20261020T081622Z/recording-media-audit.json) records duration, byte size, codec metadata and SHA-256 for each actual video. All six video URLs and the index returned HTTP 200 with the appropriate media types.

| Recording | Demonstration |
| --- | --- |
| [A — Interactive laboratory · 0:49](m5-interactive-learning-20261020T081622Z/recordings-final/A-interactive-laboratory.webm) | Introduction, accepted one-VM demonstration, prediction, keyboard/button allocations, refused seventh VM, actual Petros limit cue, saved explanation, release and observation comparison. |
| [B — Mathematical correction · 1:19](m5-interactive-learning-20261020T081622Z/recordings-final/B-mathematical-correction.webm) | Original wrong seven, resource experimentation, saved explanation, actual correction to six, new immutable submission, server-authorized feedback and assisted classification. |
| [C — Compact progression · 0:37](m5-interactive-learning-20261020T081622Z/recordings-final/C-compact-progression.webm) | Collapsed/reopened completed work, current focus, five viewport widths, mobile calculation navigation. |
| [D — English mapping · 0:45](m5-interactive-learning-20261020T081622Z/recordings-final/D-english-mapping.webm) | Evidence supports claim, saved annotation/prose, pinned source dialog and teacher-review-required result. No VM controls. |
| [E — 360px touch · 0:38](m5-interactive-learning-20261020T081622Z/recordings-final/E-mobile-touch-360.webm) | Actual Chromium touch events, drag/drop and tap equivalents, no scroll during intended drag, numeric correction, text alternative and real feedback. |
| [F — Petros coordination · 1:32](m5-interactive-learning-20261020T081622Z/recordings-final/F-petros-coordination.webm) | Introduction/demonstration, paused presentation prefix, reload/resume, yielding during input, actual boundary cue, saved explanation recovery, text-only/reduced-motion preferences. |

The first diagnostic recorder attempt retained an outdated heading expectation and accepted the engine-only bootstrap envelope as a full session. Those recorder assumptions were corrected before the complete successful pass. Its failure artifacts remain in `recordings-first`; they are not presented as successful demonstrations. The in-app browser's local-control setting was disabled during final handoff, so its earlier temporary viewport override could not be reset through that control API. Headless recording contexts closed normally. The final demo was queued for the Codex browser panel and is also linked directly below; visible in-app navigation is not claimed from a queued result.

Earlier manual actual-app evidence is in [browser](m5-interactive-learning-20261020T081622Z/browser/): acknowledged mouse drag, keyboard allocation, refusal, completed-step reopening, unsaved explanation saved by pause/reload/resume, corrected assisted math, English mapping/review and source focus return. [Width measurements](m5-interactive-learning-20261020T081622Z/browser/width-matrix.json) show no horizontal overflow at 1440/1280/768/390/360; final recording C repeats these against the final layout. Initial narrow screenshots before the mobile tabs were added are retained as intermediate evidence, not presented as the final compact layout.

Controls have keyboard equivalents, explicit labels, minimum 44px targets, `aria-pressed` prediction state, a polite atomic observation announcement, real numeric/unit alternatives and textual feedback distinct from color. Only the drag handle disables touch scrolling; ordinary page content remains scrollable. Pointer cancellation is tested. Reduced-motion and text-only use the existing preference/controller. Sources and teaching text alternatives use existing dialogs and focus restoration.

Touch is browser-emulated at 360px, not a physical-device certification. Human screen-reader, physical touch hardware, contrast-tool qualification, low-end GPU and enlarged-text acceptance remain manual gates. No claim of human accessibility certification is made from DOM checks alone.

## Screenshots and review URLs

Historical before: [prior M5 incorrect step](m5-interactive-learning-20261020T081622Z/reference/before-B-incorrect-step.png). [Provenance and SHA-256](m5-interactive-learning-20261020T081622Z/reference/provenance.json) identify the authentic prior recording screenshot. It predates the later question-clarity refinement and is **not** a screenshot of the exact source baseline at this task's start.

Final-code screenshots: [desktop actual refused allocation](m5-interactive-learning-20261020T081622Z/recordings-final/A-limit.png), [collapsed completed work](m5-interactive-learning-20261020T081622Z/recordings-final/C-collapsed.png), [reopened calculation](m5-interactive-learning-20261020T081622Z/recordings-final/C-reopened.png), [360px model](m5-interactive-learning-20261020T081622Z/recordings-final/width-360-final.png), [360px current calculation](m5-interactive-learning-20261020T081622Z/recordings-final/C-mobile-current-step.png), [actual assisted feedback](m5-interactive-learning-20261020T081622Z/recordings-final/B-authorized-assisted-feedback.png), [touch feedback](m5-interactive-learning-20261020T081622Z/recordings-final/E-touch-authorized-feedback.png), [English mapping](m5-interactive-learning-20261020T081622Z/recordings-final/D-actual-mapping.png) and [source inspection](m5-interactive-learning-20261020T081622Z/recordings-final/D-pinned-source.png).

The disposable API runs at **4963**, student web at **4964**, with a separate cookie name scoped to this API instance. Exact entry URLs:

- [Focused VM lab with saved incorrect seven](http://127.0.0.1:4963/demo/method-preview?fresh=1)
- [Full math question → teaching flow](http://127.0.0.1:4963/demo/cloud-b?fresh=1)
- [English mapping](http://127.0.0.1:4963/demo/argument-preview?fresh=1)
- [Mobile question](http://127.0.0.1:4963/demo/mobile?fresh=1)
- [Petros coordination](http://127.0.0.1:4963/demo/companion?fresh=1)
- [Standalone formative exploration](http://127.0.0.1:4963/demo/experiment-preview?fresh=1)

`fresh=1` closes only that synthetic actor's current session and starts a new synthetic session; use the same URL without the query to revisit acknowledged work. API restarts create a new disposable cluster, so bookmarked prior session IDs expire. Existing 4943/4944 and 4953/4954 processes were not replaced or terminated; this refinement is reviewed on 4963/4964.

## Performance and remaining gates

The registered model has no provider call per frame, edit or allocation. [500 in-process validated kernel samples](m5-interactive-learning-20261020T081622Z/performance-kernel.json): p50 **0.0045 ms**, p95 **0.0239 ms**, maximum **48.84 ms**. This measures the kernel, not end-to-end UI latency.

[30 authenticated local public reads](m5-interactive-learning-20261020T081622Z/performance-public-read.json) under concurrent verification load measured p50 **1,406.9 ms**, p95 **1,874.0 ms**, maximum **2,235.3 ms**, with no read errors. Several pre-existing dev servers/turbo processes and verification jobs were competing for CPU. This is a material responsiveness limitation, not a production performance qualification. Pointer feedback is immediate; authoritative resource quantities wait for acknowledgment. No fabricated optimistic result hides that delay. Browser command timings are retained with the recordings.

Across the final recordings, [request-level timings](m5-interactive-learning-20261020T081622Z/browser-timing-summary.json) measured 85 POSTs at p50 **889.6 ms**, p95 **1,523.7 ms**, maximum **2,266.1 ms**; 107 GETs at p50 **588.8 ms**, p95 **1,832.5 ms**, maximum **2,730.3 ms**. These are `responseStart − requestStart`, not complete click-to-render latency. They do not establish a responsiveness SLA.

Production load, FPS, low-end hardware, provider latency, memory ceilings, actual inference cost and educational effectiveness/retention are unmeasured. Independent academic/expert suitability remains pending; independent expert judgments added by this task: **0**. The M5 90% expert-suitability gate and M2 semantic/source-format qualification gaps remain open. Genuine provider inference/source-upload authorization, institutional content/instrument review, live migration reconciliation, deployed DB roles/RLS, production security/load/cost and release readiness are not cleared. Synthetic reviewed fixtures do not grant real academic authority. Existing M0-R/Phase-2/M4 historical issues remain as documented in the earlier reports.

## Preservation and manual approval

[Historical preservation audit](m5-interactive-learning-20261020T081622Z/historical-preservation-audit.json): **2,825 checked prior files unchanged**, including earlier reports, plans, snapshots and screenshot evidence. The manifest excludes append-only runtime logs/videos and filesystem metadata; this is not a claim that every byte under the repository is unchanged. Unrelated dirty work was preserved. Apple `._` metadata generated by the external volume is excluded from source counts; the original metadata-inclusive discovery is retained for transparency. Student build-generated tsconfig includes are recorded rather than reverting existing includes wholesale. No commit, push, deployment, paid inference or production DB change was performed.

Manual approval checklist:

- [ ] Review desktop lab responsiveness, prediction/refusal/explanation flow and Petros's actual cues.
- [ ] Confirm compact completed-step disclosure and mobile current-step navigation match the approved visual direction.
- [ ] Review original wrong work, saved correction and actual assisted feedback in recording B.
- [ ] Review English mapping, full source content and honest review-required feedback.
- [ ] Try physical-device touch and keyboard-only operation; complete human assistive-device/contrast/enlarged-text checks.
- [ ] Accept or require further work on measured acknowledgment latency and interaction polish.
- [ ] Obtain separate academic/provider/operational approvals as applicable; this engineering evidence does not supply them.
- [ ] Explicitly approve M5 before any M6 work. **Stop here; M6 has not begun.**
