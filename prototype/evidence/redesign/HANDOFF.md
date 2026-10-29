# Immersive Petros World — implementation handoff

Verified October 27, 2026. Working local URL: **http://127.0.0.1:3021/prototype**. The existing server is bound to loopback; this is not a public deployment. This handoff supersedes the earlier card-based World presentation documented in `../HANDOFF.md`.

## 1. Exact files and scope

[files-changed.txt](files-changed.txt) lists every implementation path and evidence artifact. All redesign edits are inside root `prototype/`. The existing `/prototype` route/API adapters and workspace dependency integration from the initial implementation are reused without further changes. The redesign baseline Git status and pre-redesign World files are retained in this folder.

Classic's JSX/layout remains its existing Outfit learning interface. Its commands were extracted into one shared `useLessonController`; both renderers call the same evaluator and algorithms. There are no changes to production auth, M4/M5/M6 teaching engines, assessment schemas, original character artwork or provider routing. The build regenerated the existing token file with no content diff.

## 2. Teleportation

`components/showcase.tsx` owns guarded loading → entering → active → leaving phases. It retains the Classic presentation during loading, mounts World invisibly, and waits for actual room geometry, texture and font readiness. It then runs a 2.2-second CSS portal: Classic darkens; a sage glow, expanding ring and sixteen restrained particle/streak groups form; the destination reveals through a circular mask after about 950ms; glow settles. Exit takes 1.8 seconds. Both transitions can be skipped. OS or in-room reduced motion replaces travel with a 180ms crossfade and omits particles.

The entry control is disabled during travel; a synchronous phase guard prevents duplicate requests. A loading progress indicator and messaging remain until ready. A 30-second load timeout retains the lesson in Classic. Graphics initialization failure also returns to Classic with an explicit message. Changing lessons inside World does not replay teleportation.

## 3. Room layout

The viewport is the room, with a minimal fixed HUD. A procedural warm cream/sage study has a left library divided into AI and EHS sections, four source books, two curiosity notebooks, central wall whiteboard, right experiment table, desk/chair, lamp, mug, notebook, reading stand, rug, window and plants. Furniture has bevelled forms, material variation and soft shadows. No Classic teaching board or Classic companion component is imported into World.

## 4. Camera

There are three controlled presets: stable three-quarter overview, teaching focus and interaction focus. The library uses an overview target toward the correct shelf; the experiment lessons use interaction focus at the table. Camera interpolation uses smooth easing over 900ms. Skip makes an immediate cut. Reduced motion makes direct changes. Camera movement stops when an input is focused and does not resume unexpectedly on blur. It does not depend on an AI call.

The room uses demand-based rendering, bounded DPR (1–1.5), reused geometry/textures, 1024px shadow maps and no unrestricted navigation. Desktop and phone-sized layouts have different HUD arrangements. Metrics are available in `window.__PETROS_WORLD_METRICS__`; actual camera transforms, world-space book positions, projected pick coordinates, traversal counts and transition timings support browser assertions.

## 5. Book selection

Arrival names the actual selected topic. “Find my module” directs attention to the corresponding subject section and source book. The selected book is an independent 3D mesh; it follows a curved 900ms path from shelf to reading stand, rotates flat and remains there during the lesson. Petros does not pretend to grab it. A compact card presents subject, module, title, source filename and relevant pages. “Let me show you” then moves teaching to the relevant station. Library changes reuse the same source-selection command; reselecting the active source preserves its progress.

The edge test samples the actual moving mesh before, during and after retrieval. The recorded tested trip took about 881ms, arriving at world coordinates (-1.2, 1.51, 0.35); see `edge-results.json`.

## 6. Character capabilities

The unchanged original neutral, listening, thinking and pointing PNG poses appear as a camera-facing sprite. Petros is initially visible at the desk; desk/library/board/experiment have fixed grounded anchors. Anchor changes fade the sprite out, reposition it while hidden, then fade in. The camera and book animate independently.

There is **no walking, sitting, grabbing, blinking, lip sync or articulated gesture animation**. Those require approved rigged or authored animation assets. No character redesign or flattened-image body-part simulation was made. Eleven existing original-artwork assertions passed as part of the production regression run.

## 7. World teaching versus Classic

World contains native Three.js meshes, rods, shapes, textures and clickable nodes on the wall board/table. Its short authored narration and progressive scene state coordinate with the shared lesson. A compact checkpoint dock appears for the current question; long explanations/source reading use a focused readable overlay and return to the room. Classic remains the fast conventional presentation. Their educational content and progress are shared; their layouts and renderers differ.

## 8. Subject demonstrations

| Lesson       | Observable spatial teaching                                                                                                                                                                                                                                                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI Module 3  | Root, branches and leaves construct progressively; MIN/MAX colors and selected-node emphasis; actual minimax values animate upward after relevant checks; spatial leaf/branch selection; actual alpha-beta traversal with visited and skipped paths. Default tree gives root 3, four leaves evaluated and two skipped. Additional computed transfer tree preserves the main checkpoint. |
| AI Module 4  | Facts, Rules and Conclusions on the board. Permitted TELL facts appear, the permitted Bird → HasWings rule derives conclusions from actual facts, and ASK reports logical support. Missing flight support is not equated with falsehood.                                                                                                                                                |
| EHS Module 3 | Miniature scaffold on the table with five inspectable hazards. Safer setup visibly adds guardrails/bracing, moves tools and ladder, locks wheels and separates the wire. Rotation is constrained. The excavation transfer question uses a separate cross-section with an unsupported sidewall target.                                                                                   |
| EHS Module 5 | Miniature river, town, factory/chimney, farm, waste and drain sources. Four independent qualitative controls visibly change their corresponding pathway. No invented water-quality percentages or drinking-safety claims.                                                                                                                                                               |
| How AI works | Input, weight, computed output and bias in a small spatial model; meaningful prediction and limitation questions.                                                                                                                                                                                                                                                                       |
| Time travel  | Two clocks and a computed special-relativity comparison, with assumptions and speculative past travel distinguished.                                                                                                                                                                                                                                                                    |

The four source lessons have twelve questions each; each prepared open topic has eight. These are interleaved predictions, selections, comparisons, applications, corrections and recorded explanations. Free prose is recorded, not automatically certified correct.

## 9. Interruption and continuation

“Ask Petros anything” pauses progression, saves question/step/visual/source/highlight, and opens a focused conversation. World retrieves prepared explanations for supported current contexts. A MIN-node reply uses its actual leaf values and pages; mismatched values ask for clarification. KB replies evaluate actual support, safety replies use the selected source-linked hazard/control, and model/clock replies use current computed values. Simpler prompts have authored analogies and supported alternate examples.

Replies are labelled **Prepared source-linked explanation** or **Prepared general-knowledge explanation**, never live model output. Relevant targets remain highlighted. “Continue lesson · same checkpoint” resumes without restarting. A broader unsupported request uses the existing isolated API boundary and truthfully reports HTTP503/model unavailability; browser verification exercises this path.

## 10. Shared state

The root Showcase owns one `ShowcaseState`: source receipt, lesson, step, question, response, completion, visual values, source pages, conversation, interruption checkpoint and drafts. Classic and World call the shared command hook and deterministic controller. World adds only presentation state (camera, reveal stage, retrieval and scene phase). Switching away unmounts the immersive presentation but retains academic state. Reentry reconstructs its scene from the active question/completed interactions. Retrying a lost canvas preserves the selected answer.

This is memory-only demo state. Browser reload clears it. “Session recovery” verified here means graphics retry and mode transitions, not durable login/reload recovery.

## 11. Actual verification

| Check                                 | Result / evidence                                                                                                                                                                                                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Showcase unit tests                   | **39 passed**, four files (`unit-tests.txt`). Includes thirteen immersive/context tests and existing algorithm/bank/access tests.                                                                                                                                                         |
| Existing Petros regression tests      | **33 passed**, five focused production test files (`production-regression.txt`).                                                                                                                                                                                                          |
| Complete real-browser lessons         | **128 checkpoints passed**: all 64 in Classic and all 64 in World; six World recaps (`browser-results.json`).                                                                                                                                                                             |
| Browser state and activity assertions | Draft/completion preserved across modes, contextual interruption/resume, actual pruning count, in-room source changes without portal replay; no page errors or observed production mutations.                                                                                             |
| Viewports / reduced motion            | 1440×900, 1366×768, 390×844 and 360×800; no document overflow, actual interaction/conversation screenshots, reduced motion and graphics-loss fallback. These are emulated viewports, not physical device tests.                                                                           |
| Edge browser scenarios                | **12 assertions passed** in `edge-results.json`: real delayed artwork/loading barrier, duplicate-entry guard, skip, book midpoint/destination, fixed camera transform during typing, genuine503, graphics retry with answer preserved, exit skip, unsupported WebGL and zero page errors. |
| Upload/source protection              | **8 passed** (`source-security.txt`); production auth adapter unchanged.                                                                                                                                                                                                                  |
| Source integrity                      | All **four PDF SHA-256 values match** original extraction receipts (`source-integrity.json`).                                                                                                                                                                                             |
| TypeScript                            | `tsc --noEmit` exit0; empty `typecheck.txt`.                                                                                                                                                                                                                                              |
| Production build                      | `@edrion/student-web build` exit0, compiled and routes generated (`build.txt`).                                                                                                                                                                                                           |
| Browser trace                         | `complete-browser-trace.zip` includes actual snapshots, screenshots and source references.                                                                                                                                                                                                |

The final full-browser run sampled nine animated camera transitions at 54.3–60.5 FPS (median 60.4); the last scene contained 21,252 triangles and 130 draw calls. See `performance.json`. These are development measurements from this Mac, not target-device guarantees. The headless Chromium/Brave run uses this Mac's Metal graphics backend. This is not a cross-browser or low-end-device performance certification. No Safari, Firefox, physical mobile device, enrolled-student production login, voice, unrestricted live-model or persistent-session test is claimed.

## 12. Screenshots and recordings

Actual screenshots (no mockups):

- [Room arrival](final-arrival-1440.png), [source-book presentation](recorded-book.png).
- [Minimax and pruning](final-pruning.png), [contextual conversation](final-context.png).
- [Construction](final-construction.png), [river](final-river.png).
- [Tiny AI model](final-network.png), [clock comparison](final-clocks.png).
- [390px construction interaction](world-390.png), [360px conversation](ask-360.png).
- [Delayed-loading screen](slow-loading.png), [unsupported-device recovery](unsupported-device.png).

Two actual, unedited native 1440×900 browser recordings are in `recordings/`: [arrival](recordings/01-arrival.webm) and [complete interactive minimax](recordings/02-interactive-minimax.webm). Arrival is 24.52 seconds; the complete interactive take is 104.44 seconds. They are silent, with captions. The second includes a wrong answer/correction, real canvas-node pick, source-linked interruption/resume, all twelve checkpoints, pruning, recap, room overview and exit to Classic with completion intact. Timed beats, errors and metrics are in `recordings/recordings.json`. Media duration/frame review is documented in `recordings/validation.json`.

## 13. Incomplete or unavailable features

Prepared lessons, deterministic activities, spatial demonstrations and source-context retrieval work. Unrestricted live contextual reasoning, arbitrary generated topic lessons, generated custom simulations for unknown PDFs, voice, durable progress, articulated character animation and public hosting remain unavailable/unqualified. The existing environment has live AI configured, but its inspected tutor integrations write production academic/conversation state; this showcase's isolation boundary deliberately refuses those calls. A qualified isolated provider adapter is needed for real general model answers.

No source-linked scaffold example is professional certification. The river is conceptual, not a validated physical model. No fabricated mastery, animation capability or live AI output is shown.

## 14. Deviations and practical limits

Character relocation uses the explicitly permitted fades/static poses; no locomotion rig exists. Precise answers, source reading and conversations use readable HTML overlays over the 3D room as permitted; those controls are not mesh text fields. Some desktop overview labels become small at phone scale, so accessible station/source controls carry their full labels. Mobile tools scroll horizontally inside their own strip rather than overflowing the document. General conversation is constrained to prepared contextual retrieval with honest failure beyond that scope. Progress survives renderer changes but not reload.

These limits are visible in-product and in the recordings. No production deployment, database migration, enrollment, PR or commit was performed. The unrelated pre-existing working-tree changes were preserved.
