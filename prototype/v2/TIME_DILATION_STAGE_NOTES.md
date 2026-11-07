# Time dilation Stage — discovery and design

## Discovery before implementation

Read `simulations/foundations/relativity.ts`, runtime parameters/observations/tools, all prepared time-dilation questions and the original guided opening/prediction/correction/transfer. Read the current Stage adapters, typed lesson contract, shell, controls, labels, camera, studio, plinth, printing and Traffic renderer optimizations. Read `AGENTS.md` and its installed Next lazy-loading guide. Preserve earlier uncommitted work.

- Engine: beta 0–0.999 (step .001), selected Earth duration 1–120 s, coordinate-frame parameter `earth` / `ship`. `observe` already supplies gamma, selected Earth/ship interval totals and elapsed Earth/ship clock readings. It computes elapsed ship time as model time / gamma. No integrated acceleration or turnaround is modeled. Changing beta re-evaluates this constant-speed example; it is not an accumulated changing-speed journey.
- Prepared lesson: two identical clocks, one Earth-defined constant-velocity interval; 0.8c gives 6 ship seconds for 10 Earth seconds. The 0.99c transfer gives less than 6. Switching coordinates does not change the ship's proper interval for the same events. Neither clock is faulty; there is no absolute slower clock or modeled reunion.
- Existing semantic IDs: `earth-clock`, `ship-clock`, `worldline`, `light-cone`, `gamma`. Additional visual IDs must alias to these at the tutor boundary.
- `sim_step` accepts at most 60 seconds per call. Stage playback must use bounded steps and prepared samples must call the existing engine. The original Start learning resets its lesson before the guided opening.

## Implementation plan

1. Enable the fifth pill and `?view=stage&lesson=relativity`, preserving World and the other four Stages.
2. Two upright glass/copper chronometers on the shared plinth, driven by actual elapsed values. A common zero-referenced seconds scale shows both readings; faint selected-interval markers are explicitly distinguished from elapsed time. A small etched spacetime instrument uses existing Lorentz-transform code for coordinate changes.
3. Speed dial/slider, real-time Earth-clock playback, bounded single steps, duration and coordinate controls, reset and prepared comparisons. Never present a beta edit as an accelerated journey or exchange clock readings when selecting coordinates.
4. Nine typed static explainers, authored shots, glossary and engine-backed Try it demonstrations. Reuse captions/narration, cancellation, storage/recovery and the existing quality presets. Use the desktop hero-canvas/bounded-bloom policy, clear inexpensive glass in Balanced/Low and transmission in High.
5. Pure logic tests, offline browser smoke/teaching/recovery checks, fresh DPR2 screenshots and intro/focus/run frame sequences, then an isolated production performance measurement. No installs or provider calls.

## Implemented decisions

- `RelativityStage.tsx`, `RelativitySpecimen.tsx`, `relativity-logic.ts` and `lessons/relativity.ts` supply the fifth data + specimen adapter. The Stage navigation and `LiveTeachingSurface` enable it; all original semantic IDs remain valid. An optional typed `selectControls` contract exposes coordinate choices without lesson-specific shell code.
- The real engine supplies gamma, selected interval totals and elapsed readings. Clock hands and bright common-scale markers ease toward committed values; they do not accumulate their own time. Earth has a round light tip and ship a diamond, with names and numerical seconds. Faint open rings mark selected totals, not elapsed time. The shared HTML ruler includes a visible zero.
- Speed edits retain the engine's constant-speed reinterpretation: changing beta recalculates this example, rather than integrating acceleration. That distinction is persistent story copy and an explainer. Coordinate changes use the existing `lorentzTransform`, in SI internally and light-seconds for drawing. The same endpoint events are retained; their coordinates may have different time components. The two numerical clock readings are never exchanged.
- Direct Run clocks uses bounded 0.1 s worker steps every 100 ms, labelled 1× Earth time, and stops at the selected duration. Step 1 s shortens its last step to land on that duration. Reset and manual parameter/coordinate changes pause playback. Prepared playback uses 61 immutable real-engine snapshots over at most eight wall-clock seconds, with its actual playback factor labelled. Three-speed comparisons are explicitly separate coasting examples, not an acceleration history.
- Nine prepared cards cover the two clocks, proper time, c, gamma, light paths, elapsed versus selected totals, coordinate frames, the light-speed limit and missing return leg. Their answers remain at most 50 words. The light-path bead is labelled as an illustration, separate from elapsed journey time. Existing captions, glossary and optional device narration are reused.
- All instrument print textures are local. The shared print utility now optionally accepts a rectangular texture size; its default 512×512 output is unchanged. This keeps wide gamma/coordinate plaques readable without stretching letters. The primary timeline numbers are HTML.
- Balanced/Low use clear alpha physical glass on the wide clock faces; High uses transmission plus half-resolution AO. Balanced retains MSAA, bloom, SMAA/vignette, shadows and a faint reflected pair. Low removes reflection/bloom. Time dilation opts into the same bounded five-level bloom, unused-depth optimization and desktop hero canvas already measured for Traffic; earlier lessons' preset choices are unchanged.
- Actual clock, timeline and chart extents drive camera fitting and overlap checks. Phone focus hides auxiliary readouts and leaves the selected instrument above the sheet. The first-use hint sits at the edge. Focused clock labels move outward (Earth left, ship right), using the actual projected bounds rather than a radius estimate; a dedicated test checks them against the actual focused clock bounds, not just the card and HUD. Reduced motion removes intro/camera interpolation and timed demonstrations collapse to their final state.
- The existing Rocket navigation assertion now expects Time dilation to be enabled. It still checks that unknown topics are rejected and semantic aliases remain valid; no test was deleted.

## Run and regenerate

```sh
cd prototype/v2
npm run dev
# http://127.0.0.1:3022/prototype?view=stage&lesson=relativity
npm run typecheck
npm test
npm run test:stage:relativity
npm run capture:stage:relativity
npm run build
npm run test:stage:relativity:performance
```

Captures use the running server on 3022 (`PETROS_BASE_URL` override) and an installed Chromium (`PETROS_BROWSER` override). The performance script runs an isolated production server on 3024 with ephemeral authentication and an empty provider key. Evidence lives in root `audit-screenshots/stage-relativity/`. Final measured figures and verification limitations are recorded there.

Visual limit observed in the High capture: native refraction obscures the small face lettering. The large HTML clock readings and common seconds ruler remain readable; Balanced is preferred for legible instrument markings.

## Final verification and measured performance

Strict typecheck, all 196 unit tests (17 files), scoped ESLint with zero warnings/errors, optimized build, both Time dilation browser suites, all four earlier Stage suites and World smoke pass. No page errors or paid provider calls were recorded. All 75 Time dilation PNGs are freshly captured from the final runtime source; hashes, build ID and capture times are in `source-manifest.json`.

Measured on the actual local Apple M4, Chromium 157.0.8103.39, ANGLE Metal, optimized Next build, DPR2. Desktop page 1440×900 uses a 1140×620 CSS hero canvas / 2280×1240 buffer while retaining the full-film camera projection and subject pixel scale. Phone viewport/canvas 390×844 / 780×1688 buffer uses Low on this Mac. Ordinary desktop apps stayed open; other automated browsers were closed before measurement. The figures below are complete test-side RAF windows, not GPU time or medians presented as average fps.

| View / preset | Average fps | Mean interval | Probe p95 | Peak calls | Peak triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1440×900 Balanced · overview | 60.0 | 16.67 ms | 16.80 ms | 84 | 41,193 |
| 1440×900 Balanced · ship focus | 60.0 | 16.67 ms | 16.80 ms | 58 | 29,073 |
| 1440×900 Balanced · gamma focus | 60.0 | 16.67 ms | 16.80 ms | 36 | 14,901 |
| 1440×900 Balanced · coordinate focus | 60.0 | 16.67 ms | 16.80 ms | 70 | 39,269 |
| 1440×900 Balanced · running clocks | 60.0 | 16.67 ms | 16.70 ms | 84 | 41,193 |
| 1440×900 Balanced · 0.999c / 120 s / ship coordinates running | 60.0 | 16.67 ms | 16.70 ms | 84 | 41,193 |
| 1440×900 High · overview | 34.1 | 29.36 ms | 33.40 ms | 126 | 60,577 |
| 1440×900 Low · overview | 60.0 | 16.67 ms | 16.80 ms | 55 | 24,772 |
| 390×844 Low · overview | 60.0 | 16.67 ms | 16.70 ms | 55 | 24,772 |
| 1440×900 Balanced · td-ship transition | 60.0 | 16.67 ms | 16.70 ms | — | — |
| 1440×900 Balanced · td-gamma transition | 60.0 | 16.67 ms | 16.80 ms | — | — |
| 1440×900 Balanced · td-frame transition | 60.0 | 16.67 ms | 16.70 ms | — | — |
| 1440×900 Balanced · assembly | 60.0 | 16.67 ms | 16.70 ms | — | — |

Balanced meets the measured 55 fps target in all tested steady views, playback, assembly and three focus transitions.

Geometry/draw-call budget passes. Motion-only probes did not separately sample calls/triangles. High overview is measured; High focus/transitions are not benchmarked. No physical phone, Safari, human narration or novice study was tested.

Known rough edges, ranked:

1. High overview averages about 34 fps here, and refraction obscures small face lettering. Use Balanced for clear markings and smooth playback; High focus/transitions were not benchmarked.
2. Whole-object phone focus is small with the sheet open; small engraved text needs its focus shot, while the HTML values/ruler remain readable.
3. Arbitrary orbits, intermediate viewport sizes and all parameter combinations were not exhaustively captured.
