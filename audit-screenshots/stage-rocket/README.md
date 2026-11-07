# Rocket landing Stage — fresh evidence

Source: the current Rocket Stage working tree, captured 6 November 2026. This is the second Stage lesson, following the approved Neural Stage. The UI and studio use the website's actual forest-green/ivory design tokens and existing Petros fonts. No deployments or provider calls were made.

## Captures

All Rocket PNG files in this directory were captured from the current source by `prototype/v2/tests/rocket-stage-smoke.mts`, in installed Chromium 156 on this Apple M4. Dimensions are CSS viewports; the PNGs have DPR2 backing pixels:

- 1440×900 and 390×844: overview, after three real half-second steps, all eight question focus cards, 80% braking while descending, empty tank at full throttle, hard impact, safe landing overview and safe landing focus.
- `intro/`: 12 PNG frames covering the assembly, with actual capture timing in `timing.json`.
- `focus/`: 10 PNG frames of an inspection transition, with actual timing.
- `prepared-landing/`: 16 PNG frames of the accelerated prepared burn, with wall-clock capture times and actual engine flight times. The final still records the completed landing.
- `smoke-results.json`: engine observations, projected label/card/part bounds, viewport and browser metadata, errors and provider-route checks.
- `teaching-results.json`: original prepared prediction/correction, doubled-total-mass transfer, glossary access through the full caption transcript, replay cancellation, reload and restoration in World.

These are irregularly timed frame sequences, not a constant-frame-rate video. The timing JSON preserves the real cadence. The phone captures exercise the Low path at a phone viewport on the Mac; they are not measurements on a physical phone.

## Visual acceptance

| Check | Result | Evidence / limits |
| --- | --- | --- |
| No label-to-label collision | PASS | Visible pills checked at both sizes, overview, all eight focus shots and landing. |
| Text avoids the teaching geometry | PASS in reviewed captures | Force pills moved above their arrows; ruler values right-aligned; the height pill moves below the plinth at contact. HUD is confined to edges. This is not exhaustive testing of every orbit/height combination. |
| No hard horizon/floor edge | PASS | Studio glow, mirrored duplicate and radial alpha veil; reflection omitted on Low. |
| Glass shows its core on desktop/phone | PASS | Porthole core and fuel window remain readable; cheap physical glass on Low/narrow widths. |
| Matches website theme | PASS | Shared website tokens, fonts, green primary buttons and ivory/copper hero; screenshot review. No new navy theme introduced. |
| Focus is visually clear | PASS | Selected part stays bright while other parts dim; authored camera shots; arrows and text supply meaning alongside color. |
| Explainer avoids the focused part | PASS | Projected part/card bounds checked for every question at both viewport sizes; representative captures reviewed. |
| Ruler stays away from header/controls | PASS in captures | Tick text is clipped to the safe scene area; zero remains present in overview and pad-focused shots. |
| Neural / old World remain usable | Recorded in verification notes | Separate regression runs and the stored-session restoration check. |

Prediction/Target pill separation is Neural-specific; the unchanged Neural smoke test also passed after the shared shell changes.

## Regeneration

Run the development server in `prototype/v2`, then:

```sh
npm run capture:stage:rocket
npm run test:stage:rocket
```

For production performance (build first):

```sh
npm run build
npm run test:stage:rocket:performance
```

The performance runner uses isolated port 3024, an ephemeral local authentication token and an empty provider key. It measures the existing composer and all render passes. `PETROS_BROWSER` can select an installed Chromium executable; `PETROS_BASE_URL` selects an already running server for smoke/capture tests.

For the implementation decisions, commands, final verification and known limits, see [ROCKET_STAGE_NOTES.md](../../prototype/v2/ROCKET_STAGE_NOTES.md).

## Final check results and measured performance

All 158 unit tests, TypeScript, scoped ESLint (zero warnings/errors), the production build, Rocket smoke/prepared teaching, existing Neural smoke/prepared teaching, and all five original World lessons' desktop/phone smoke checks pass. Fresh World results are saved as `world-regression-results.json`; the original tracked World evidence was restored after its test run.

Production measurement: local Apple M4, Chromium 156, ANGLE Metal, DPR2, one browser test at a time. Balanced overview and active flight both measured **16.7 ms median (~59.9 fps), 118 peak draw calls and 124,163 peak triangles**. Worst sampled window p95 was 17.5 ms (17.6 ms in pad focus). The three measured focus shots remained at 16.7 ms. High measured **31.1 ms (~32.2 fps)**. Low measured **16.7 ms, 49 calls and 37,232 triangles**, at both tested viewport sizes. `performance-summary.json` contains the aggregation; `performance-production.json` contains every sample.

These are local headless results, not physical-phone, Safari or universal M-series performance claims. No human narration or novice study was run. The safe landing is prepared accelerated playback, and the enlarged model is not a literal size-to-height scale. Full verification limits and ranked rough edges are in the implementation notes. `source-manifest.json` records current source hashes and the capture/build metadata.

## Time dilation integration regression refresh

The smoke/teaching suites and their PNG outputs were refreshed on 7 November 2026 while validating the fifth Stage. All five pills are now enabled. The earlier performance reports and original source manifest above describe their earlier lesson pass; current regression source/image hashes are recorded in `../stage-relativity/source-manifest.json` and `../stage-relativity/regression-captures.json`. Unrefreshed reference/comparison PNGs remain historical. The original World evidence was restored separately, byte-for-byte.
