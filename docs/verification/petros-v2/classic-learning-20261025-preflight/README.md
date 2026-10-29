# Classic Learning Studio — engineering report

25 October 2026 · Edrion / Petros V2 · local implementation and verification.

**Implemented for the actual source-bound VM teaching workspace.** The approved
`docs/petros_vm_thought_cloud_prototype.html` was inspected as source and rendered
in a browser. It supplied visual direction; its standalone application, simulated
state, scripted academic results and embedded base64 image were not copied into
production. The original M4/M5/M6 services remain authoritative.

**Acceptance limits:** human novice/device/assistive-technology testing remains
pending. Existing production source, reviewer, provider and release qualification
gates are not cleared by synthetic engineering fixtures. Petros World is designed,
not implemented, and remains blocked on faithful approved 3D character art.

## A. Implementation summary

Repository: `/Volumes/Chris/Edrion Labs`, existing `main` checkout at
`444ed328e714ad8c1a37985cb082d49536d6e6f0`. Initial inventory recorded **206 tracked
changes and 6,375 untracked files**. No reset, checkout replacement, commit or broad
cleanup was performed. [Initial inventory and hashes](baseline.json) and
[source/asset preservation record](preservation.json) distinguish this work.

All application paths below are relative to
`apps/student-web/src/features/petros-v2/`:

| File | Change |
| --- | --- |
| `petros-session-shell.tsx` | Select Classic presentation for a real allocation canvas; preserve navigation, preferences, dialogs and other lessons. |
| `canvas/session-teaching-canvas.tsx` | Render the focused VM activity, retain exact editing/checkpoint commands, place source/undo/redo controls in More options, and retain the separate correction workflow. |
| `canvas/resource-allocation-lab.tsx` | Reuse attempt, operation, draft, dirty-state and target-registration logic for both views; share explanation and optional drag/keyboard handlers. |
| `use-petros-session.ts` | Expose the current acknowledged projection through `getSnapshot()` so requested-help presentation can reuse the mandatory post-commit read. |
| `assessment-panel.tsx` | Label the actual assisted VM response submission “Submit my correction”; retain other response formats and other lesson labels. |
| `canvas/classic-vm-activity.tsx` **new** | Predict/Try it/Explain presentation with confirmed quantities, selection/commit separation, refusal, explanation and history. |
| `canvas/classic-vm-activity.module.css` **new** | Large proportional memory bar, tan reservation, green accepted units, amber refusal, responsive controls and reduced motion. |
| `canvas/classic-vm-activity.spec.tsx` **new** | Selection, pending/failure, persistence boundaries, refused units, varied models and restored multi-VM requests. |
| `companion/classic-cloud-controller.ts` **new** | Supplemental cloud lifecycle delegated to existing M6 admission; one current cue, scoped deduplication, priorities, expiry and interruption. |
| `companion/classic-cloud-controller.spec.ts` **new** | Timing, dismissal, replacement, reload identity, stale scope, no-hints policy, requested help and quiet accepted operations. |
| `companion/classic-companion.tsx` **new** | Static original avatar, accessible speech/thought/notice clouds, confirmed source help and focus restoration. |
| `companion/classic-companion.module.css` **new** | Bounded 270px desktop companion area and compact normal-flow mobile placement. |
| `classic-studio.module.css` **new** | Centered Classic layout, cream workspace, 24px column gap, mobile layout and footer overflow fix. |

These are **five modified existing application files and eight new application
files**. Supporting scripts, logs, screenshots, recordings and documents are in
this new evidence directory. Next added verification-only TypeScript include paths;
only this run's generated includes were removed afterward, preserving existing
user configuration. See [generated include cleanup](generated-include-cleanup.json).

Reused: `usePetrosSession`, `ResourceAllocationLab` state/operations,
`currentAllocationAttempt`, `allocationAttemptObservation`, existing M6
`CompanionController`, target registry, equation editor, assessment panel, source
dialog and reduced-motion/preferences owner. The large permanent companion band
is superseded only in Classic VM presentation. Its shared services, renderer and
non-VM consumers remain available.

Implemented states include unselected/selected prediction, save pending/failure,
confirmed prediction, allocation pending/accepted/refused/communication failure,
explanation editing/unsaved/saving/saved/failure, original answer review, separate
correction submission/evaluation pending, actual evaluated result, qualitative
review-required result, pause/resume, reload, restricted help and source reread.

## B. Visual implementation and necessary academic differences

The application follows the reference's cream/sage palette, large memory bar,
hatched tan reservation, slim three-stage progress, dark green primary controls,
compact original Petros, and three distinct floating-cloud treatments. Desktop
uses a 270px companion column; at 1000px and below it becomes a compact horizontal
area near the heading. Clouds and character are in bounded document flow, with
long text scrolling inside an accessible cloud rather than covering fields.

The reference's entire HTML, duplicate historical CSS layers, standalone header,
restart behavior, simulated evaluator and local demo state were not imported.
Existing institutional/navigation controls and Edrion fonts remain. This is a
visual implementation of the approved direction, **not a pixel-equivalence claim**.

Necessary differences preserve existing trusted behavior:

1. The reviewed allocation activity requires a **will-this-request-fit prediction
   for each increase**, not a single guessed maximum. Selection is local, “Try my
   prediction” commits it, and Add VM becomes available only after acknowledgment.
   A subsequent test revisits that small prediction step. No numeric guess is
   silently converted into several invented predictions.
2. The original independent task retains its actual structured response and private
   evaluation before assisted teaching. Its difficulty is not replaced by the
   prototype's easier multiple-choice example or an answer-revealing model.
3. A reviewed teaching fragment may begin with a real demonstration allocation.
   The UI renders it. The zero-VM browser state was obtained through an explicit
   audited reset, never by resetting on mount.
4. Saving an explanation is separate from opening the reviewed correction task and
   formally submitting its immutable response. The UI retains “Review your
   correction” followed by “Submit my correction”. Earlier work remains saved.
5. Requested help currently retrieves the **authorized reviewed explanation**;
   no generated hint service is fabricated. Independent no-hints tasks remain
   restricted. The full approved reread can contain the worked answer after the
   existing policy allows that exposure, and that access is actually recorded.
6. The registered kernel is uniform, memory-only, without overcommit. Other model
   values and historical multi-VM requests render their actual quantities, but
   heterogeneous allocations and overcommit are not invented capabilities.

Prediction-stage capacity tiles are withheld until the prediction is committed.
Refused requests never become accepted tiles. The 580ms ghost/pulse is triggered
only by a newly received refusal; mounting a saved refusal does not replay it.
Reduced motion skips both effects. Neutral artwork stays static.

### Actual screenshots and recordings

[Visual review gallery](review.html) includes the final unedited application
screenshots and browser recordings. [Rendered prototype reference](prototype-desktop.png)
is kept separate from application evidence.

| Required state | Evidence |
| --- | --- |
| Predict initial / zero VMs | [Desktop](browser-accepted/predict-initial-1366.png), [360px](browser-accepted/predict-initial-360.png) |
| Prediction selected | [Selected answer](browser-accepted/prediction-selected.png) |
| Prediction pending | [Real request with added network latency](browser-accepted/prediction-pending-real-delayed-network.png) |
| Three accepted VMs | [Three VMs](browser-accepted/three-vms.png) |
| Six accepted VMs | [Six VMs](browser-accepted/six-vms.png) |
| Seventh refused / amber notice | [Confirmed refusal and cloud](browser-accepted/refusal-notice.png) |
| Speech cloud | [Prediction acknowledgment](browser-accepted/prediction-speech.png) |
| Thought cloud | [Requested authorized explanation](browser-accepted/long-requested-thought-1366.png) |
| Explanation focused | [Automatic cloud suppressed](browser-accepted/explanation-focused.png) |
| Explanation saved | [Saved, not checked](browser-accepted/explanation-saved-1366.png) |
| Correction pending | [Actual committed response awaiting evaluation](browser-accepted/correction-committed.png) |
| Actual evaluated result | [Private evaluator result](browser-accepted/actual-evaluated-correction.png) |
| Review-required result | [Actual English qualitative review](browser-extra-accepted/english-real-review-required.png) |
| Reduced motion | [Actual touch refusal with reduced motion](browser-extra-accepted/mobile-touch-refusal-reduced.png) |
| Reload/resume | [Restored saved explanation](browser-accepted/reload-resume.png) |
| Narrow long cloud | [360px source help](browser-extra-accepted/long-thought-reduced-360.png) |
| Consolidated secondary tools | [Desktop](final-more-options-desktop.png), [360px](final-more-options-mobile.png) |

The main loop uses 1366 × 768. Initial prediction, refusal, saved explanation and
long requested help were additionally checked at **1440 × 900, 768 × 1024,
390 × 844 and 360 × 800**. The supplementary full touch flow uses 390 × 844 and
checks 360px long-cloud placement. This is Chromium touch/viewport emulation,
not a physical-device or screen-reader qualification.

Earlier `browser-1`/`browser-2` takes exposed mobile footer overflow;
`browser-3` reached saved/reloaded explanations but exposed the existing omission
of `ask` from the participating projection. These failed takes and recordings are
retained. They are not counted as passing verification. Final successful evidence
is in `browser-accepted`, `browser-extra-accepted` and the focused check JSON files. The complete final browser checks total 63 passes (38 + 13 + 2 + 10).

## C. Petros integration

Exact Classic asset: `apps/student-web/public/petros/states/petros-idle.png`, SHA-256
`26fa3a0d8f831d19388a40aa6bb3a22d42e11535e18e5fff1d30236ce0584ec6`.
It retains aspect ratio and original pixels. A small CSS boundary clip hides a
detached bottom-edge raster fragment below the character; no body part, pose,
face or image file was regenerated or changed. The genuine original asset was
visually inspected. All **45 baseline Petros asset/manifest/audio files** remain
byte-identical, including rejected candidate history.

Eight genuine complete PNG poses exist: neutral, listening, thinking, static
talking and four cardinal points. Classic uses neutral, as explicitly permitted by
the brief. There is no new blink, mouth, arm, nod, walk or floating character effect.
The existing selected manifest and rejected-candidate inactive state are unchanged.

| Real trigger | Classic behavior |
| --- | --- |
| Authorized participating activity ready | One delayed speech question; 700ms delay, about 4s visible. |
| Option selected | No message or correctness estimate. |
| Matching prediction acknowledged | Speech, about 2.7s. |
| Routine accepted allocation, including filling memory | No automatic cloud. |
| Matching refused observation | Amber notice using actual requested/remaining values, about 6s; persistent amber consequence in the activity. |
| Explanation stage entered after observation | Speech question about the actual observed request, about 3.8s. |
| Input focused / manipulation / hidden page / pause | Suppress inappropriate automatic presentation immediately. |
| Explanation acknowledged | “Saved. This hasn’t been checked yet.”, about 4s. |
| Explicit allowed request | Existing checkpoint/interrupt and `hint`/`ask` workflow; exact current approved explanation in a thought cloud. |
| Actual pending/evaluated response | Existing sanitized public M6 caption and actual result; no inferred grade or mastery. |
| New task/action/source/session or revoked authority | Cancel old presentation and reject obsolete help. |

`ClassicCloudController` delegates event validation and authority to the existing
M6 `CompanionController`; only cloud lifetime/deduplication is supplemental. The
old rig is not mounted simultaneously on the Classic VM surface. The renderer
uses one next-deadline timer, no queue, identity-checked replacement, bounded seen
IDs and presentation-only reload identity. No caption or answer is stored in
browser presentation history. Requested content cannot outlive current authority
(the existing public cue lifetime is at most 120 seconds).

The server already authorizes post-commit reviewed-source `ask` requests, but the
participating public action list omits `ask`. The new button uses that existing
handler only during reviewed post-commit teaching, records actual source exposure,
and waits for the acknowledged fresh projection. **No authentication,
authorization, source rule or backend service was changed.**

Dismiss is a 44px keyboard/touch control. Manual dismissal returns focus to Ask
Petros. Automatic expiry restores focus only if the disappearing dismiss control
had focus; it never steals focus from student inputs. Clouds use polite status
announcements and remain supplementary to the main outcome.

## D. Academic integrity and recovery

Prediction/observation comparison uses the current attempt's exact ID and matching
observation, session/activity/branch, source revision/hash and model revision.
The renderer does not select independently from the newest prediction and newest
result. Quantities come from acknowledged kernel observations. No frontend solver
grades work and no refused VM is optimistically accepted.

The existing hook still owns busy/duplicate protection, command IDs, revision/epoch
checks, post-commit refresh, unconfirmed response retry and owner-generation fencing.
The new view also locks immediate repeated clicks during its own pending action.
Save errors preserve selection/text. A failed network request is not a simulator
refusal. The browser tests deliberately aborted requests before server receipt and
verified recovery without inventing academic results.

The shared explanation draft scope remains attempt-specific. Annotation saves use
the existing checkpoint path, and “Saved · Not checked yet” follows acknowledgment.
Saved drafts/explanations survive actual reload. Unsaved in-memory text is protected
by existing unload/pause safeguards; it is not falsely described as durable after
an arbitrary hard reload.

The reviewed `practice` transition still requires a saved explanation and eligible
task. Original independent responses remain immutable. Correction is a separate
assisted response evaluated through the existing private evaluator and exposure
ledger. The actual browser flow confirms a different response ID, assisted status
and returned satisfied criteria; the existing persistence tests check original
response preservation and lineage. Qualitative uncertainty remains teacher review.

All baseline API and shared schema sources remain byte-identical. No migration,
RLS, evaluator, source qualification, teacher review, authentication or M7 voice
implementation was removed or rewritten. Disposable fixture databases and synthetic
qualification records were used; no configured/production database was touched.

## E. Controlled cleanup

| Change | Why safe / references / preserved behavior |
| --- | --- |
| Share explanation edit/save handlers in `resource-allocation-lab.tsx` | Both Classic and the existing view need identical draft/checkpoint behavior. Existing inline handlers were replaced by common functions, not a second persistence owner. Existing lab tests plus Classic failure/reload/browser flows pass. |
| Share optional drag handle and overlay | Repository references and keyboard/touch handlers were inspected. The same actual allocation operation remains available under More options, with button-only operation still primary. Existing drag tests and the real mobile keyboard allocation pass. |
| Consolidate secondary source/undo/redo controls | The extra Classic-only disclosure was superseded by More options. Its controls were moved, and its now-unused local `.supporting` CSS removed after checking references. Actual source dialog, focus return, undo and redo were exercised. |
| Reuse acknowledged projection for help | The new presentation reads the mandatory refreshed snapshot through `getSnapshot()` instead of adding a redundant follow-up GET. Freshness and owner fencing remain in the existing hook. No private response cache was added. |
| Remove this run's generated TypeScript includes | Only named verification-instance includes were removed. Existing user configuration and other verification instances were retained. |

Classification:

- **Safe to remove / completed:** the superseded Classic secondary wrapper/local
  selector and duplicated inline explanation handlers described above.
- **Safe to refactor / completed:** shared presentation-only edit/save/optional
  drag rendering, with the same operation payloads and persistence semantics.
- **Keep pending investigation or required compatibility:** old default VM
  presentation (still used before a participating Classic workspace and by its
  compatibility tests), shared `CompanionCloud`/rig and sampler, rejected layered
  candidate code/art history, amplitude/voice groundwork, existing source/admission
  services, migrations and future capability interfaces. Being inactive in Classic
  does not prove these are unnecessary. No dependency was removed.

Relevant existing gates remain `PETROS_V2_SESSIONS_ENABLED`, adaptive-teaching and
institution/source permissions. Companion Playground and voice-preview gates are
unchanged. The original-art manifest still selects originals and marks the candidate
inactive. No performance improvement is claimed from deletion or speculative profiling.

## F. Performance measurements and limits

[Measured environment and raw summary](performance.json), [baseline build](student-build-result.json),
[final build](release-build-result.json), [raw User Timing](browser-accepted/user-timing.json)
and [actual action timings/network requests](browser-accepted/results.json).

Environment: Apple M4, 16 GiB, Node 24.21.0, pnpm 11.1.2, installed Brave/Chromium
through Playwright-core 1.61.1, workspace on `/Volumes/Chris`, isolated PostgreSQL
and Redis. Builds use separate instance output directories so they do not replace
the active development server's manifests. Jobs share local machine load.

| Comparable build output | Before | After |
| --- | ---: | ---: |
| Next reported `/petros/v2/session` first-load JS | 741 kB | 748 kB |
| Added reported first-load JS | — | 7 kB |

The interface adds presentation code; **it is not a demonstrated bundle-size or
runtime speed improvement**. Baseline build elapsed time was 53.581s; the final
measured elapsed time was 48.123s. Different concurrent load
prevents interpreting build-time variation as a speedup.

The final browser run's warm post-reload client timing subset measured:

| Path | Samples | p50 | p95 |
| --- | ---: | ---: | ---: |
| Action to acknowledged projection | 5 | 120.6ms | 229.9ms |
| Projection request | 7 | 58.6ms | 116.1ms |
| Projection validation | 7 | 0.3ms | 0.9ms |
| Request acknowledgment | 5 | 64.1ms | 170.9ms |

p95 uses nearest rank. These successful local samples are not cold-load,
production, school-network or physical-device measurements. They do not cover
every action's complete distribution. The deliberately delayed prediction request
is labeled in its evidence and is not used as a benchmark. No matched before/after
runtime-latency experiment was completed, so no causal latency claim is made.
The 748kB shared entry remains a candidate for measured bundle investigation.
Authorization, source revalidation and fresh post-commit projection are retained.

No new model call, animation framework, 3D framework, per-keystroke evaluator or
per-frame server request was introduced. Petros World assets do not enter Classic.

## G. Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Student Studio UI tests before changes | 308 passed | [Baseline](student-tests.json) |
| Student Studio UI tests after changes | **339 passed, 0 failed** | [Final result](final-student-tests.json) |
| Shared V2 schema/kernel tests | 161 passed, 0 failed | [Result](schema-tests.json) |
| Default API V2 suite | 97 passed, 0 failed; 1,260 opt-in cases skipped | [Result](api-tests.json) |
| Explicit isolated persistence/boundary run | **40 passed, 0 failed, 0 skipped** | [Result](persistence-tests.json), [environment/command](persistence-tests-result.json) |
| Main actual browser flow | **38 passed, 0 failed, no page errors** | [Result](browser-accepted/results.json) |
| Touch/reduced-motion/English flow | **13 passed, no page errors** | [Result](browser-extra-accepted/results.json) |
| Focus expiry/current scope | 2 passed | [Result](final-focus-checks.json) |
| Consolidated options/source/undo/redo | 10 passed | [Result](final-options-checks.json) |
| Student TypeScript | Passed | [Log](final-typecheck.log) |
| Focused lint | Passed, no warnings | [Log](final-lint.log) |
| Isolated student production build | Passed | [Log](release-build.log), [measured result](release-build-result.json) |

The focused 40-case database run overlaps 17 default API assertions; counts are
reported separately, not summed as unique coverage. It explicitly enables
`PETROS_M4_DB_TESTS`/`PETROS_M5_DB_TESTS` against newly created private Unix-socket
PostgreSQL clusters, with configured database environment variables removed.
No skipped case is counted as passing. Broader historical API/source-preparation
or production qualification issues outside this scope are not declared cleared.

Browser evidence uses the actual application, signed-in disposable synthetic
students, real commands/receipts/checkpoints and the real private deterministic
evaluator. It does not substitute responses, inject lesson state or fabricate
correctness. The recordings capture both pending and actual evaluated responses.

Human novice usability, physical mobile keyboards, actual screen readers, enlarged
text/zoom, distraction and product-owner visual acceptance remain pending.
[Novice usability protocol](novice-usability-checklist.md) supplies the requested
ten first-time-student tasks; no participant results are invented.

## H. Petros World preparation

- [Shared presentation contract](presentation-contract.md): meaningful intentions,
  current M6 mappings, cloud lifecycle, event/source/task/attempt ownership,
  interruption, assistance and evaluator boundaries.
- [Future World architecture](petros-world-architecture.md): all six intended
  scenes, lazy opt-in renderer loading, one shared React/session/draft owner,
  station/camera capability separation, safe mode switching, device/institution
  fallback, accessibility and future measured budgets.
- [Original-character technical-art feasibility](petros-world-art-feasibility.md)
  and [actual file inventory](original-art-inventory.json): eight selected 384×512
  transparent complete PNG poses, ninth historical reference, unchanged hashes,
  rejected editable SVG candidate, missing original editable layers/views/3D rig,
  reconstruction and approval prerequisites.

Next-cycle prerequisites are faithful approved turnaround/model/materials, complete
rig and approved clips/anchors, environment/station design, device-measured browser
budgets, mode-switch/reconciliation/fallback tests and human identity/usability
approval. No different 3D model is presented as Petros. No room or artificial PNG
walking was built, and no immersive-completion claim is made.
