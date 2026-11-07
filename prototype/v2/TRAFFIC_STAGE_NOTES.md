# Traffic waves Stage — discovery and design

## Discovery before implementation

Read the original traffic IDM engine, runtime parameters/observations/tools, traffic-front detection, all prepared traffic answers and guided correction/transfer. Read the current Stage contract, shell, HUD, camera, labels, plinth, navigation/integration, existing teaching loop and installed Next lazy-loading guide required by AGENTS.md. Preserve all earlier uncommitted work.

- Physics: `simulations/foundations/traffic.ts`; 350 m closed one-lane ring, 4.5 m cars, IDM acceleration, numerical acceleration/safety clamps, no lane changes or obstacles. Runtime uses the existing 1/60 s integrator. Default 20 cars, desired speed 22 m/s, headway 1.2 s, initial uniform 13 m/s. Count supports 5–45; headway .5–3 s; desired speed 5–35 m/s.
- `sim_brake` taps car_0 to at most 1 m/s. `sim_set_params` headway/desiredSpeed preserve current cars; count changes reset the model. No numerical model may be reimplemented in the view.
- `trafficFront` finds the largest slow-to-fast speed gradient; marks it only while min speed <40% desired speed and gradient >1 m/s. It is not necessarily the slowest car. Its identity and position can jump; do not invent a constant backward speed or display a front when the engine says none.
- Prepared answers distinguish cars moving forward from the slow patch, describe density/headway dependence, and compare the same eight seconds after a brake at current headway versus 2.4 s. Preserve these claims and exact engine outcomes.
- Existing semantic IDs: `ring`, `jam-front`, `car_N`. Additional gauge/gap/ribbon/control IDs must alias to those at the tutor boundary.
- Original prepared traffic opening uses `sim.running` and the shared worker loop. Stage must show/pause that running state without starting a second clock. Direct playback uses existing worker steps only.

## Design and integration plan

1. Enable Traffic's Stage pill and `?view=stage&lesson=traffic`; retain three earlier Stage lessons, World and Time dilation.
2. One premium instrument: machined ring road, glass/copper edge details, instanced luminous cars, a sampled speed ribbon, a distinctive car_0, measured wave-front marker, actual-position traces, a real gap bracket and central zero-referenced speed gauge. Retain website tokens, fonts and studio lighting.
3. Engine-bound headway slider, Brake & watch, Run/Pause road and Reset. The primary brake starts cancellable local playback; no extrapolated vehicle physics. Respect prepared running/tutor, reduced motion, visibility and recovery.
4. Nine short typed explainers and engine-backed Try it demonstrations, including measured headway comparison. Clearly state model limits and when there is no marked front.
5. Unit/browser/regression checks, fresh DPR2 stills and intro/wave/focus frames, isolated production measurements. No installs, provider calls, telemetry or engine changes.

## Implemented decisions

- Added `TrafficStage.tsx`, `TrafficSpecimen.tsx`, `traffic-logic.ts` and the typed `lessons/traffic.ts`. The generic Stage accepts the same data + specimen contract as Neural, Rocket and Attention. Navigation enables Traffic while Time dilation remains in World. Existing lesson engines and prepared traffic copy are unchanged.
- The model is a 350 m circular road. Car length remains proportional to the model's 4.5 m vehicles. Gold car 01 is a stable identity; its ring makes it distinguishable without color alone. Blue marks exactly `trafficFront` and says which car is currently nearby. There is no marked front in uniform flow.
- The speed ribbon interpolates current car speeds around the road. With speed spread ≥2 m/s, amber/mint uses the snapshot's minimum/maximum so the slow patch is visible; otherwise the scale is zero to current maximum. The explainer states this relative scale. Numeric mean, minimum, maximum, witness speed, gap, model time and desired speed remain absolute engine values.
- Direct Brake & watch runs existing 0.2 s worker steps every 100 ms (2×); original guided teaching retains its existing shared clock. The auto-start is generation-guarded so an immediate Escape cannot restart a paused model. The shared Stage action dispatcher also holds automatic ticks while manual worker edits/reset are pending: a loaded-device smoke run exposed an auto step cancelling a slider change. A deterministic regression delays real edit responses by 180 ms (longer than the 100 ms tick), exercises rapid slider changes and proves the last edit persists and Reset stays paused. No engine or worker arithmetic was changed. Prepared playback uses 61 immutable real-engine snapshots (15–45 s) over twelve seconds, labelled 2.5×. Traces contain committed positions only; no fake backward wave or extrapolated physics.
- “Does more room help?” reuses the exact original prepared comparison recipe: settle 40 s, brake once, compare eight seconds at current headway with eight seconds at 2.4 s. It reports both speed spreads and explains density/mean-speed limits. There is no promised universal jam or optimal setting.
- Nine static questions cover cars, braking, wave motion, ribbon, m/s, physical gap, headway, density and changing boundary identity. Each has a camera shot and Try it. Existing caption glossary and optional Read aloud are reused; no new voice service. Hover/tap, keyboard controls, reduced motion, storage failure and interrupted demonstrations are covered by browser checks.
- Balanced uses alpha physical glass for the large gauge, keeping its core and scale visible while avoiding another full-scene transmission pass. High retains transmission plus half-resolution AO; phones force Low. Car shadows fall on the road. Plinth/mirror shadow reception is omitted because it duplicates work beneath the road. The mirror contains only the plinth/road, not a second set of cars.
- Radial HTML labels sit outside projected road edges, with extra desktop clearance above the question rail. If car and boundary share an anchor, they stack into the free strip above the actual footer. The initial-brake state and evolving playback frames have collision checks; Train/Run dismiss the first-use hint. The selected instrument stays bright while the plinth, other instrument lights and road materials dim; this makes a dial shot read as a dial shot. The phone gauge shot is wider than its desktop shot to clear the bottom sheet. Ring/density shots fit the complete specimen bounds; the gap shot fits its actual bumper-to-bumper curve. Those geometry points also drive the projected overlap bounds, so a small center proxy cannot hide a clipped road or endpoint. Gap geometry, camera and bounds reuse the same engine-derived arc helper. Traffic expands its camera far plane and keeps fog depth relative to the specimen when fitting very distant phone shots; otherwise the studio’s fixed fog would hide the entire road. Other lessons keep their fog settings. Traffic's active pill scrolls into view in the narrow header.

## Files and commands

Source: `stage/TrafficStage.tsx`, `stage/TrafficSpecimen.tsx`, `stage/traffic-logic.ts`, `stage/lessons/traffic.ts`, `stage/print-texture.ts`. Shared integration: `LiveTeachingSurface`, Stage navigation/contract/HUD/labels/camera framing and optional plinth shadow reception. The Stage route and original World stay available.

```sh
cd prototype/v2
npm run dev
# http://127.0.0.1:3022/prototype?view=stage&lesson=traffic
npm run typecheck
npm test
npm run test:stage:traffic
npm run capture:stage:traffic
npm run build
npm run test:stage:traffic:performance
```

Fresh evidence and final measurements are recorded in root `audit-screenshots/stage-traffic/README.md` and its JSON reports. Browser captures require an installed Chromium executable (`PETROS_BROWSER` override); `PETROS_BASE_URL` changes the capture/test server. Performance runs an isolated optimized server on 3024, with temporary authentication and no provider key.

## Performance continuation — 7 November 2026

The initial final run missed the Balanced frame target, despite staying within geometry/draw-call limits. Repeated measurement on 7 November confirmed it. Reading the installed postprocessing 6.39.6 source found two avoidable costs:

- `BloomEffect.setSize` ignores the deprecated height option for mipmap blur: its luminance pass and pyramid still receive full drawing-buffer dimensions. `CappedBloomEffect` bounds those buffers to the equivalent of 512 px across the full film height, preserving aspect ratio, with five blur levels (matching the reference’s five-mip bloom). The hero scene remains DPR2, HalfFloat, 4× MSAA; bloom threshold .95, additive blend, strength .42 and radius .7 are unchanged. It uses the existing composer and integration's resource lifecycle.
- The default color-edge SMAA with predication disabled declares a depth dependency it never samples. `ColorSMAAEffect` omits that dependency, and the Balanced composer skips the corresponding MSAA depth resolve/store. Scene depth testing and 4× MSAA remain enabled. High restores the resolved depth needed by AO. Earlier lessons retain their original preset.

The policy is opt-in typed lesson data (`bloomHeight` and `canvasRegion`) and currently enabled only for Traffic. No dependencies, engine/state/voice changes, DPR reduction, second composer or extra tone-mapping pass were added. Tests cover actual buffer dimensions, resize/aspect behavior, retained HDR settings, true depth consumers, scene depth testing, MSAA and restoring AO depth. Projection tests prove that a cropped desktop film preserves world-point screen positions and pixel scale, and that phone framing remains unchanged.

Median frame intervals initially concealed missed refreshes. Independent test-side RAF probes now include every interval and stall; target acceptance uses their actual average fps. A diagnostic removing HUD backdrop filters did not solve the bottleneck and was not adopted.

At desktop widths ≥1100 px, Traffic renders only the hero region, leaving the edge HUD in the DOM. At 1440×900 this is a 1140×620 CSS canvas (2280×1240 drawing buffer, DPR2), offset 300×70 px. The virtual full-window film, camera distance/FOV, subject scale and label positions are preserved with an off-axis crop, rather than changing scene resolution. Soft 40 px masks blend the empty studio edges into the page. Phone and earlier lessons keep their full canvas. Bloom resolution scales proportionally to retain its apparent radius. This removes pixels beneath the HUD and is the change that brought measured full-window average fps above the target.

Stabilized before/after renders at 1440×900 DPR2 are in `performance-tuning/`. The final crop changes empty studio and vignette coverage, while the virtual camera preserves subject perspective and pixel scale. Final whole-page pixel differences and actual average frame rates are recorded with the refreshed evidence. The original slow runs remain under `performance-history/`.

## Final verification and measured performance

Strict typecheck, all 187 unit tests (16 files), scoped ESLint with zero warnings/errors, optimized build, Traffic smoke/prepared teaching and the delayed-worker regression pass. Earlier Neural/Rocket/Attention suites and original World smoke pass. No page/console errors or paid routes were recorded. All 77 Traffic PNGs are fresh from the final source; source and image hashes are in `source-manifest.json`.

Measured on the actual local Apple M4, headless Chromium 157.0.8103.39, ANGLE Metal, optimized Next build, DPR2. Desktop page: 1440×900; hero canvas: 1140×620 CSS pixels / 2280×1240 buffer, with unchanged virtual full-film camera and subject pixel scale. Phone viewport/canvas: 390×844 / 780×1688 buffer. Measurements ran after other automated browsers closed; ordinary desktop apps stayed open. Average fps, mean and p95 below come from test-side RAF windows counting every interval and stall, not median-derived fps or GPU timer queries. Peak calls/triangles include shadow and postprocessing passes.

| View / preset | Average fps | Mean interval | Probe p95 | Peak calls | Peak triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1440×900 Balanced · overview | 60.0 | 16.67 ms | 16.70 ms | 51 | 52,773 |
| 1440×900 Balanced · wave focus | 60.0 | 16.67 ms | 16.80 ms | 48 | 50,109 |
| 1440×900 Balanced · speed focus | 60.0 | 16.67 ms | 16.70 ms | 47 | 52,269 |
| 1440×900 Balanced · headway focus | 60.0 | 16.67 ms | 16.80 ms | 47 | 51,245 |
| 1440×900 Balanced · running road | 60.0 | 16.67 ms | 16.70 ms | 53 | 53,261 |
| 1440×900 Balanced · 45 cars running | 60.0 | 16.67 ms | 16.70 ms | 53 | 76,361 |
| 1440×900 High · overview | 60.0 | 16.67 ms | 16.70 ms | 74 | 77,817 |
| 1440×900 Low · overview | 60.0 | 16.67 ms | 16.80 ms | 33 | 33,040 |
| 390×844 Low · overview | 60.0 | 16.67 ms | 16.80 ms | 33 | 33,040 |
| 1440×900 Balanced · intro | 60.0 | 16.67 ms | 16.70 ms | — | — |
| 1440×900 Balanced · t-wave transition | 60.0 | 16.67 ms | 16.70 ms | — | — |
| 1440×900 Balanced · t-speed transition | 60.0 | 16.67 ms | 16.70 ms | — | — |
| 1440×900 Balanced · t-headway transition | 60.0 | 16.67 ms | 16.70 ms | — | — |

Balanced meets the measured 55 fps target in all six tested views, assembly and three focus transitions, using independent RAF window averages that count stalls. Counts for motion-only probes were not separately sampled.

High overview is measured; its focused/transitional performance is not benchmarked. Low omits bloom/mirror and uses inexpensive glass. The phone measurements use a Mac browser viewport, not physical-phone hardware. No Safari, human speech playback or novice acceptance study was performed. `performance-initial.json` is an earlier investigation run; the final measurements above come from `performance-production.json`.

Known rough edges, ranked:

1. Complete-ring density focus is small on a phone with its sheet open; instrument scale lettering is fine print. HTML readouts and explanations retain readable numbers and units.
2. High focus and transition frame rates were not benchmarked; Balanced is the verified recording preset.
3. Arbitrary orbits, intermediate viewport sizes and every parameter combination were not exhaustively captured.
