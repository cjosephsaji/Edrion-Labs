# Traffic waves Stage evidence — 7 November 2026

Open `http://127.0.0.1:3022/prototype?view=stage&lesson=traffic`. The Stage keeps the website's forest green, ivory, local fonts and copper/glass studio. Original World remains at `?view=world`.

## Current-source captures

The final capture run produces 77 PNGs: 35 stills plus 42 sequence frames. Still viewports are **1440×900 DPR2** and **390×844 DPR2** (actual PNGs 2880×1800 and 780×1688). These are browser renders of the current working tree, not mockups or captures of the vanilla reference. `source-manifest.json` records source hashes, build ID, capture times and image hashes.

- `overview-*`: twenty cars in uniform initial flow, mean 13 m/s, no marked boundary.
- `immediate-brake-*`: paused immediately after the tap, when the car and boundary initially share an anchor; both labels fit.
- `braked-wave-*`: actual engine after Brake & watch, paused after at least six simulated seconds.
- `t-{cars,brake,wave,ribbon,speed,gap,headway,density,identity}-*`: all nine focus shots, with cards and labels at both sizes.
- `forty-five-cars-*`, `dense-wave-*`, `five-cars-no-front-*`: parameter extremes and conditional boundary visibility.
- `more-following-time-*`: the longer-headway branch of the original prepared comparison, not an invented outcome.
- `prepared-wave-final-1440-dpr2.png`: end of the prepared 15–45 s real-engine replay.
- `quality-high-1440-dpr2.png`, `quality-low-1440-dpr2.png`: preset renders; High → Low → Balanced cycling preserves the road state.
- `intro/`: twelve assembly PNGs; `focus/`: ten speed-gauge transition PNGs; `wave/`: twenty real-engine playback PNGs.

Each sequence has `timing.json` with actual capture times, engine time, boundary identity/existence/position and witness-car position sampled immediately after each capture. Capture cadence varies; these are frame sequences, not a claimed fixed-frame-rate video. The prepared wave lasts twelve wall-clock seconds, followed by a static ending in the sequence. It explicitly says 2.5× playback after a 15 s settling period.

## Model and content checks

The scene binds to the existing 350 m IDM ring and worker. Gold car 01 keeps one stable identity. The blue marker follows exactly the engine's largest qualifying slow-to-fast boundary, which can change cars, jump or disappear. It is not necessarily the slowest car and is not driven at a fictional constant backward velocity. Traces use committed engine positions.

Amber/mint on the ribbon is relative to the current minimum/maximum when spread is at least 2 m/s, otherwise zero-to-maximum. Numbers remain absolute m/s. The ribbon is a visual interpolation of measured car speeds. Direct Run/Brake playback is 2×; original guided playback retains its shared 1× clock and the UI shows the actual clock mode.

The headway comparison uses the exact original prepared recipe: settle forty seconds, brake once, advance eight seconds at current following time versus 2.4 seconds. The explanation reports speed spread and acknowledges changes to mean speed, density and observation-time dependence. No universal jam or optimal headway is promised.

## Visual acceptance

| Check | Result | Evidence / boundary |
| --- | --- | --- |
| No label/text collisions | PASS for captured states | Browser checks labels against each other, the footer HUD and the explainer; both sizes, all nine questions, the immediate brake and twenty evolving wave snapshots. |
| Labels stay beside the overview specimen | PASS in reviewed captures | Radial labels offset beyond the projected road/plinth edge; leaders connect to actual car/boundary anchors. |
| No hard horizon or floor edge | PASS in reviewed captures | Shared seamless studio, radial veil and faint mirror; Low omits mirror. |
| Glass core visible on desktop and narrow width | PASS in reviewed captures | Alpha physical glass in Balanced/Low; High uses native transmission. |
| Website theme retained | PASS | Shared website tokens, display/UI/mono fonts, green controls, ivory ink and copper. |
| HUD stays at the edges | PASS in reviewed captures | Overview bounds include the whole plinth and label space; phone summary collapses. |
| Focused part is clearly emphasized | PASS in reviewed captures | Authored shots, dimmed surroundings and stronger attenuation of other lights; dial is distinct from the gauge. |
| Explainer avoids selected part | PASS for captured states | Projected bounds checked for every card at both sizes, including the taller speed gauge. Ring/density use complete specimen bounds; the gap uses its real arc/end-post points, shared with the mesh and camera. |
| State can be understood without color alone | PASS | Stable gold witness ring/car number, blue boundary glyph and car ID, numeric speeds/gap/headway, explicit no-front state. |

Arbitrary orbits, all intermediate dimensions and every parameter combination were not exhaustively screenshot-tested. Phone scale markings are small; the HTML speed readout and explanation carry the readable value and units. A physical phone, Safari, human narration and an unfamiliar learner study were not tested.

## Regenerate

From `prototype/v2`, with the local dev server running:

```sh
npm run dev
npm run capture:stage:traffic
npm run test:stage:traffic
npm run typecheck
npm test
npm run build
npm run test:stage:traffic:performance
```

The capture command regenerates all stills and PNG sequences. `PETROS_BASE_URL` selects a running capture/test server; `PETROS_BROWSER` selects an installed Chromium executable. The performance command starts isolated production port 3024 using temporary authentication and an empty provider key. Performance is measured separately, after all other automated browser tests have closed.

See [TRAFFIC_STAGE_NOTES.md](../../prototype/v2/TRAFFIC_STAGE_NOTES.md), `smoke-results.json`, `teaching-results.json`, `worker-coordination-results.json`, `regression-results.json`, `world-regression-results.json` and `verification.json`. The World smoke exercised all five lessons at both sizes; its earlier evidence files were restored byte-for-byte after saving this run's JSON here.

## Rendering optimization verification

Traffic alone opts into bounded five-level bloom, color-SMAA without unused resolved depth, and a desktop hero canvas. At 1440×900 DPR2, the canvas is 1140×620 CSS pixels (2280×1240 drawing buffer), offset 300×70 pixels; it avoids drawing under the edge HUD. It preserves the virtual full-window film, perspective, FOV, subject pixel scale and label positions. Soft masks hide empty studio edges. The main scene retains HalfFloat, 4× MSAA, lights, geometry, materials and mirror. Blur buffers are capped at the proportional equivalent of 512 px full-film height. Phone and earlier lessons retain their full canvas. High restores depth for AO; browser smoke cycles High → Low → Balanced and checks model preservation and errors.

`performance-tuning/` contains four stabilized before/after PNGs and `visual-comparison.json`. These comparison images are separate from the 77 canonical fresh captures; the before images intentionally show the earlier renderer. The final after images include the cropped canvas; background coverage differs, while subject framing remains unchanged. `performance-history/` retains earlier slow runs and diagnostic measurements. The intrusive GPU-query diagnostic is not normal frame-time evidence.

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

## Time dilation integration regression refresh

The smoke/teaching suites and their PNG outputs were refreshed on 7 November 2026 while validating the fifth Stage. All five pills are now enabled. The earlier performance reports and original source manifest above describe their earlier lesson pass; current regression source/image hashes are recorded in `../stage-relativity/source-manifest.json` and `../stage-relativity/regression-captures.json`. Unrefreshed reference/comparison PNGs remain historical. The original World evidence was restored separately, byte-for-byte.
