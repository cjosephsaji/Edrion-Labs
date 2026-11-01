# Petros World motion polish - 31 October 2026

Implemented in `prototype/` on top of the existing interactive learning redesign. The room assets, camera destinations and original Petros artwork are retained. The local preview is [Petros World](http://127.0.0.1:3022/prototype).

## Review the actual browser evidence

- [Before: continuous arrival, library, board and experiment recording](before/recordings/continuous-world.webm)
- [After: the same continuous route](after/recordings/continuous-world.webm)
- [After: pause/resume, contextual help, numeric demonstration, station changes, scaffold changes and reduced motion](interaction/recordings/continuous-interactions.webm)
- [Full HD board](after/board-1920.png), [paused board operation](interaction/interrupted-board.png), [computed weight/output](interaction/validated-weight.png), [actual safer scaffold](interaction/safer-model.png)
- Raw measurements: [before](before/results.json), [after detailed](after/results.json), [after lighter at Full HD](after-lighter/results.json), [interaction assertions](interaction/results.json).

The before recording and source snapshots were captured before the motion edits. Failed scratch recordings were removed. Early development measurements with a failing board shader were discarded; the final browser scripts fail on shader compilation errors as well as page errors.

## Diagnosis and resulting changes

| Inspected behavior              | Finding before edits                                                                                            | Implemented correction                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Camera ownership                | A `useFrame` controller clamped delta time; a pause discarded its task. Canvas size changes restarted movement. | One finite timestamp-based task owns position, quaternion and FOV. A pause retains progress, resume resets its timestamp, and a new station cancels the old task from its current pose. Canvas layout changes no longer restart travel.                                                                                                                                                             |
| Camera path and completion      | Uniform short travel and post-transition full scene traversal.                                                  | Monotonic quintic easing, a shallow room-side curve and exact approved endpoints; explicit completion/cancellation. Library 1.25 s, board 1.15 s, experiment 1.05 s. Expensive budget inspection runs once after scene/model loading.                                                                                                                                                               |
| Board drawing                   | New full canvas textures on updates; diagrams switched state abruptly.                                          | A reusable 1600 x 900 board texture, GPU element masks and a small reusable numeric atlas. Each committed state is painted once, then its layout is reused for picking/masks. Reveal frames change uniforms rather than uploading the full canvas. Both textures are disposed at unmount. The first board and restored checkpoint are prepared behind the portal, preventing a black initial frame. |
| Shadows and room reconciliation | Static shadow passes repeated during camera travel; caption/draft changes reached the scene.                    | Cache the detailed shadow map and invalidate it for actual geometry movement. Memoized room/books, stable callbacks and a scene state subset keep draft typing out of scene reconciliation.                                                                                                                                                                                                         |
| Petros                          | Per-frame React anchor changes and disconnected station transitions.                                            | Original static poses fade out during travel, change anchor while hidden, then reveal. Feet and contact shadow use the same approved anchor. Completion settles the reveal once, without a second fade.                                                                                                                                                                                             |
| Speech/captions                 | Abrupt replacement and stale message timing risks.                                                              | One message slot with generation-guarded cancellation, 210 ms entry/6 px rise, 160-170 ms exit, reduced-motion alternatives and projected cloud anchoring. Teaching captions settle when paused.                                                                                                                                                                                                    |
| Books and models                | Returning books snapped; safer scaffold parts switched state.                                                   | Finite 3D book retrieval/return from the live transform; guardrail installation, ladder repositioning, stored tools, wheel locks and power clearance animate the actual components and reverse precisely.                                                                                                                                                                                           |
| Interruption/state              | A stale library drawer could hide later controls; retrieval could be overwritten by teaching presentation.      | Latest station closes stale drawers; retrieval has its own guarded callback. Help, mode changes, focus/Escape, refresh and pause preserve committed academic state. Precision controls wait until the camera stops. During the portal, inactive layers are inert and hidden from assistive technology.                                                                                              |

No animation framework or replacement artwork was added. Static detailed room geometry/maps are retained. The small shared preparation correction makes the sixth AI demonstration actually change weight from 0.5 to 1.5; its student check restores 0.5. Production evaluation is unchanged.

## Teaching operations and student gates

`board-motion.ts` defines each visual operation's concept/question, validated before/after state, source pages, duration, student-controlled gate and freeze/resume policy. The current teaching plan supplies the explanation. Presentation callbacks never dispatch an answer or advance a concept.

| Authorized operation          | Timing and visible result                                                                                                                                                        | Gate and interruption behavior                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| AI demonstration              | Input fades over 0-250 ms; connection draws over 250-750 ms; actual weight reveals over 750-950 ms; output reveals over 1000-1250 ms; computed equation/error over 1150-1450 ms. | Final result remains until the student requests their turn. Help freezes the current reveal.                                           |
| Validated numeric change      | 420 ms interpolation toward the actual weight, with output/error computed from the displayed intermediate weight and connection thickness following it.                          | No arbitrary changing values. The response gate settles immediately; prediction answers remain concealed where required.               |
| Knowledge-base operation      | 650 ms reveal of newly introduced facts/conclusions and the relevant link.                                                                                                       | Facts, queries and inferences remain the prepared evaluator's actual state.                                                            |
| MAX/MIN value transfer        | 650 ms transfer of the selected computed value along its branch.                                                                                                                 | Uses the actual tree/example values. No elapsed-time concept progression.                                                              |
| Selection emphasis            | 180 ms board emphasis, 180 ms object buttons/outlines.                                                                                                                           | Object position stays fixed; selection changes do not move the camera.                                                                 |
| Safer construction comparison | Components change over about 300-500 ms; guardrails settle in 480 ms.                                                                                                            | Reverses from the live pose; pause freezes parts; reset reaches the defined initial model. Captions describe the displayed comparison. |
| River prevention controls     | Short fades on the actual treatment/source components.                                                                                                                           | Qualitative pathway illustration; no invented pollution measurements or drinking-safety claim.                                         |

Reload/mode return shows the committed state already settled instead of replaying an old demonstration. Reduced motion directly settles camera/model/board presentation while retaining all teaching content. The explicit preference is tab-persistent and otherwise follows the system setting. A visible camera-skip button remains available during travel.

## Measured performance

Windows, Edge 156.0.4314.56, headless native ANGLE / Intel UHD Graphics / D3D11, DPR 1. No forced software-rendering benchmark. Fresh browser contexts per viewport; a continuous 1440 x 900 WebM is recorded in both runs. No parallel browser/build load or source edit was run during the final samples.

The FPS table samples browser `requestAnimationFrame` cadence over each operation (about 1.9 s, or 2.3 s for rapid requests). It is a browser presentation-cadence proxy, not GPU-driver frame telemetry; the demand renderer's own camera-frame counts/timing are also in the JSON and reported below. P99 frame time is the equivalent tail statistic, and max records isolated stalls. There is no claim of a uniform improvement or sustained 60 FPS.

| Viewport    | Operation              | Before avg FPS | After avg FPS | Before p99 ms | After p99 ms | Before max ms | After max ms |
| ----------- | ---------------------- | -------------: | ------------: | ------------: | -----------: | ------------: | -----------: |
| 1920 x 1080 | Overview to library    |           52.7 |          43.2 |          33.5 |        133.6 |          66.6 |        133.6 |
| 1920 x 1080 | Library to board       |           47.9 |          45.3 |          64.9 |         50.2 |          64.9 |         50.2 |
| 1920 x 1080 | AI diagram build       |           38.6 |          39.2 |          83.3 |         67.7 |          83.3 |         67.7 |
| 1920 x 1080 | Board to experiment    |           49.0 |          46.9 |          34.0 |         50.6 |          34.0 |         50.6 |
| 1920 x 1080 | Rapid station requests |           33.7 |          40.9 |         132.3 |        133.0 |         132.3 |        133.0 |
| 1440 x 900  | Overview to library    |           52.7 |          52.7 |          50.1 |         33.8 |          99.9 |         99.7 |
| 1440 x 900  | Library to board       |           52.2 |          50.0 |          50.0 |         50.0 |          50.0 |         50.0 |
| 1440 x 900  | AI diagram build       |           47.5 |          42.3 |          66.1 |         82.9 |          66.1 |         82.9 |
| 1440 x 900  | Board to experiment    |           52.7 |          47.0 |          33.7 |         66.8 |          33.8 |         66.8 |
| 1440 x 900  | Rapid station requests |           44.5 |          38.9 |          66.6 |        165.8 |         216.6 |        165.8 |
| 1366 x 768  | Overview to library    |           58.0 |          59.5 |          33.2 |         17.4 |          33.3 |         33.4 |
| 1366 x 768  | Library to board       |           59.0 |          58.5 |          17.0 |         33.2 |          49.9 |         33.4 |
| 1366 x 768  | AI diagram build       |           51.7 |          57.4 |          65.2 |         33.9 |          65.2 |         50.1 |
| 1366 x 768  | Board to experiment    |           56.9 |          56.9 |          33.4 |         33.4 |          33.5 |         49.8 |
| 1366 x 768  | Rapid station requests |           50.5 |          54.4 |          50.0 |         50.0 |          83.3 |         50.1 |

Full HD detailed mode retains frame-time spikes. Optional lighter graphics uses the same assets and disables shadows. On this DPR-1 machine the buffer pixel ratio is unchanged; the existing lower DPR cap also applies on higher-density displays:

| Full HD operation      | Detailed avg FPS / p99 ms | Lighter avg FPS / p99 ms |
| ---------------------- | ------------------------: | -----------------------: |
| Overview to library    |              43.2 / 133.6 |              60.3 / 16.8 |
| Library to board       |               45.3 / 50.2 |              53.3 / 33.9 |
| AI diagram build       |               39.2 / 67.7 |             42.7 / 133.2 |
| Board to experiment    |               46.9 / 50.6 |              52.2 / 33.6 |
| Rapid station requests |              40.9 / 133.0 |             39.3 / 199.8 |

Camera wall-clock completion from the renderer's counters (unpaused final route). Rapid requests produce deliberate cancelled entries; only completed steady trips are listed. Target timings remain consistent across the three rendering rates.

| Viewport    | Library (target 1250 ms) | Board (target 1150 ms) | Experiment (target 1050 ms) | Actual camera frames/sec for these trips |
| ----------- | -----------------------: | ---------------------: | --------------------------: | ---------------------------------------- |
| 1920 x 1080 |                     1251 |                   1184 |                        1055 | 35.2 / 40.0 / 38.1                       |
| 1440 x 900  |                     1253 |                   1169 |                        1063 | 49.6 / 46.1 / 38.1                       |
| 1366 x 768  |                     1258 |                   1158 |                        1062 | 60.0 / 58.3 / 55.2                       |

The original camera usually completed in about 0.86-0.97 s at these native-renderer rates, with no distinct station timings and size/caption-driven repeats. Its capped delta also prolonged travel at sufficiently low frame rates. The finite track is unit-tested at 15/30/60/120 FPS, including a dropped frame and pause.

Separate [loading probe](after/loading.json), timed from the Enter World action, before any overview trip. It also reads the actual framebuffer behind the portal: all three boards returned the expected pale paper pixel (248, 249, 242, 255), preventing a black initial board frame.

| Viewport    | First rendered 3D frame | Portal dismissed / room usable |
| ----------- | ----------------------: | -----------------------------: |
| 1920 x 1080 |                 13.56 s |                        15.95 s |
| 1440 x 900  |                  5.96 s |                         8.27 s |
| 1366 x 768  |                  4.00 s |                         6.29 s |

The older route benchmark's `sceneLoadMs` includes the portal and overview setup, so it must not be presented as pure asset loading. Those before -> after route-ready readings were 1920 px: 7.80 -> 9.38 s, 1440 px: 15.83 -> 13.51 s, 1366 px: 7.96 -> 7.85 s. Caches/startup compilation were not controlled; this does not establish a loading-speed gain. The after route resumes the selected lesson station first, then the operator selects overview.

Input remained usable in real typing/selection/interruption checks. Typing a contextual question created no additional board texture or room mount and did not change the paused diagram. The route's focus-to-next-frame proxy was 1920 px: 4.6 ms, 1440 px: 17.4 ms, 1366 px: 5.5 ms; this is not a physical keyboard-to-pixel latency measurement.

Detailed-mode resident material-map estimate was about 363 MiB (RGBA8/mipmap estimate), with about 5.3 MiB of shared geometry buffers. Shader-uniform textures are now included in accounting. PMREM, shadow maps, MSAA/framebuffers and driver allocation are excluded. The lazy numeric atlas adds at most 2 MiB. Repeated safer/before toggles retained identical renderer geometry/texture counts; draft typing retained one room mount and one board resource. Initial library samples observed 329 render calls / roughly 650k triangles; counts vary with the camera and visible room contents. No original asset was removed to meet the target.

## Validation

- Unit suite: **81/81** passed, including ten new motion tests. TypeScript (`tsc --noEmit`) passed after the final source changes. The isolated production build completed successfully.

- [Motion interactions](interaction/results.json): **9 scenarios passed** - camera pause/resume and grounded character completion; frozen help/typing; unanswered gate; validated numeric change; focus/Escape; mode cancellation; latest station; reversible scaffold without duplicate geometry/textures; persistent reduced motion/reload.

- [Shared learning regression](../learning-redesign/browser-results.json): all **64 Classic tasks across six lessons**, correct/remediation/fresh examples, 31 seconds unanswered, refresh recovery and Classic/World continuity passed. The portal exposes only its own controls while background layers are inactive.

- [World regression](../learning-redesign/world-results.json): **30 tasks** (five per lesson), incorrect-answer recovery and help, mode preservation, and task layout at 1366 x 768, 1440 x 900, 390 x 844 and 360 x 800 passed.

- [Keyboard/layout checks](../learning-redesign/accessibility-results.json): 4 viewports passed keyboard selection, help/Escape focus, reduced motion, visible primary action and no horizontal overflow.

- Final browser runs reported **zero page/shader errors and zero production mutation requests**. The 3D loading probe checked the real board pixel under the portal at all three required desktop sizes. The after recording was decoded into [twelve actual review frames](after/camera-review.png) for visual inspection.

## Files changed in this motion pass

All paths below are relative to `prototype/`. Existing uncommitted learning-redesign work was preserved.

| Purpose                                       | Files                                                                                                                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finite motion and shared pause policy (new)   | `world/motion.ts`, `world/motion-context.tsx`, `world/model-motion.tsx`                                                                                                                             |
| Authored board operations and GPU masks (new) | `world/board-motion.ts`, `world/board-material.ts`                                                                                                                                                  |
| Cancellable message transitions (new)         | `world/cloud.tsx`, `world/cloud.module.css`                                                                                                                                                         |
| World runtime                                 | `world/scene.tsx`, `world/room.tsx`, `world/board-surface.tsx`, `world/board-content.ts`, `world/spatial-teaching.tsx`, `world/primitives.tsx`, `world/asset-budget.ts`, `world/world.module.css`   |
| Shared integration                            | `components/teaching-cycle.tsx` (World caption/interaction hooks), `components/showcase.tsx` (motion preference and inactive-layer accessibility), `teaching/checkpoint.ts` (actual AI demo weight) |
| Verification (new)                            | `tests/world-motion.spec.ts`, `tests/world-motion-browser.mts`, `tests/world-motion-interactions.mts`, `tests/world-motion-loading.mts`                                                             |
| Entry points/documentation                    | `package.json`, `README.md`, this report, the evidence-only `.gitignore`, before source snapshots and linked JSON/PNG/WebM artifacts                                                                |

No original PNG, GLB, HDR, PDF, production academic evaluator or production API implementation was modified by this pass. The already-dirty student app TypeScript configuration is generated verification context, not a motion implementation change.

## Reproduce

Use the already-running local server or the setup in [DEVICE_SETUP.md](../../DEVICE_SETUP.md). With Node 24 / pnpm 11, from the repository root:

```sh
pnpm --filter @edrion/petros-showcase test
pnpm --filter @edrion/student-web exec tsc --noEmit
pnpm --filter @edrion/petros-showcase run verify:motion
pnpm --filter @edrion/petros-showcase run verify:motion-loading
pnpm --filter @edrion/petros-showcase run verify:motion-interactions
pnpm --filter @edrion/petros-showcase run verify:learning
pnpm --filter @edrion/petros-showcase run verify:learning-world
```

The browser scripts default to `http://127.0.0.1:3022`; set `SHOWCASE_TEST_URL` for another origin and `PETROS_BROWSER` for an explicit Chromium executable. Motion captures default to `after`, protecting the historical baseline. For the optional Full HD comparison, set `MOTION_PHASE=after-lighter` and `MOTION_LIGHTER=1`. Browser recordings are silent.

## Remaining limits

- Sustained 60 FPS is not established on this Intel integrated-GPU machine. The final 1366 x 768 operations averaged about 54-60 FPS. At 1440 x 900 and 1920 x 1080, several operations remain below the preferred 45-60 FPS range with measurable stalls. Lighter graphics helps ordinary camera trips but does not eliminate the teaching/rapid-switch stalls. It remains opt-in; consistent frame pacing at the larger sizes needs further profiling.
- These are local development-browser measurements, not controlled cross-device performance certification. Initial loading includes the portal/route preparation and varies with caches; it is not an isolated network-download benchmark. An actual window resize may reframe an idle camera; caption layout changes do not restart travel.
- Petros remains the approved static artwork. Authentic walking, articulation and lip sync need an approved rig/assets. Prepared contextual help and text-led instruction retain their disclosed limits; this task does not add live AI or voice.
- The construction/river teaching models retain their existing procedural appearance and qualitative scope. No new realistic model asset or replacement room was introduced.
