# Time dilation Stage evidence — 7 November 2026

Open `http://127.0.0.1:3022/prototype?view=stage&lesson=relativity`. All five Stage pills are now enabled; the original World remains at `?view=world`.

## Captures

`npm run capture:stage:relativity` writes 75 PNGs: 37 stills and 38 sequence frames. Viewports are 1440×900 DPR2 and 390×844 DPR2, giving actual PNG sizes 2880×1800 and 780×1688. These are actual R3F browser renders, not mockups. Freshness and source/image hashes are recorded in the final `source-manifest.json`.

- `overview-*`: elapsed clocks at zero, selected 10 Earth / 6 ship seconds at 0.8c.
- `after-three-steps-*`: three actual one-second worker steps; Earth 3 s and ship 1.8 s.
- `complete-*`: real-time playback stops at 10 Earth / 6 ship seconds.
- `td-{clocks,ship,speed,gamma,light,interval,frame,limit,return}-*`: all nine focused explainers at both sizes.
- `zero-speed-*`, `near-light-*`, `limit-speed-*`: separate constant-speed examples at 0c, 0.99c and 0.999c. Speed edits reinterpret this constant-speed example; no integrated acceleration is fabricated.
- `long-interval-*`: existing engine sampled through the full selected 120 s, with both actual elapsed and selected values.
- `ship-coordinates-*`: existing Lorentz transform of the same events, with the two clock readings preserved.
- `quality-high-1440-dpr2.png`, `quality-low-1440-dpr2.png`: preset renders; switching back to Balanced preserves the model.
- `run-final-1440-dpr2.png`: final actual real-time clock run.
- `intro/`: twelve PNGs; `focus/`: ten ship-clock transition PNGs; `clocks/`: sixteen actual clock-run PNGs.

Each sequence has `timing.json` recording actual capture cadence, committed Earth/ship readings, beta, selected span and coordinate frame. These are frame sequences with variable capture cadence, not a claimed fixed-frame-rate video.

## Model and content

The original engine provides gamma, selected interval totals and elapsed readings. The Stage does not integrate a second clock or rewrite relativity. Both hands and bright time markers ease toward committed engine values; faint rings preview selected interval totals. Both rows share a zero-referenced seconds scale. A tiny integration round-off at ten seconds must not enlarge the drawing scale to fifteen; only the drawing extent is rounded, never an engine reading.

Round Earth tips and diamond ship tips, labels and numeric seconds distinguish state without color alone. A speed edit selects a separate constant-speed example; it is not a record of acceleration. The shared worker drives real-time Run clocks with 0.1 s steps every 100 ms and the last step is bounded to the selected duration. Prepared demonstrations use immutable samples from the same engine and state their playback factor.

The etched worldline/light-cone instrument calls the existing SI Lorentz transform, expressing position in light-seconds for drawing. Changing coordinates keeps the same endpoint events. Events selected as simultaneous in Earth coordinates can have different time coordinates in the ship frame. Selecting the ship frame does not exchange clock readings. The light-path bead is explicitly labelled as an illustration rather than elapsed journey time.

The original prepared opening, wrong-prediction correction, 0.99c transfer, questions, caption glossary, interruption and recovery remain. There is no modeled gravity, acceleration, turnaround or reunion. Optional Read aloud reuses the existing local narration; no new speech service exists.

## Visual acceptance

| Check | Result and scope |
| --- | --- |
| Clock labels do not collide | Both sizes/all nine cards; focused clock labels also checked against their own projected geometry. Outer-side placement keeps the face clear. |
| Focused geometry avoids card | Projected actual clock, dial, plaque, chart and timeline bounds are checked; no center-only proxy hides a clipped object. |
| No header/footer or card label collisions | Automated visible-label checks; viewport overflow check. |
| Number line includes a readable zero | HTML ruler; browser visibility assertion and render review. |
| Glass tips and faces visible | Clear inexpensive physical glass in Balanced/Low; native transmission in High. Review actual preset renders. |
| No hard floor edge or horizon | Shared radial studio veil and faint flipped clock/plinth reflection; Low omits reflection. |
| Website theme | Shared forest green/ivory/copper tokens and existing self-hosted display/UI/mono fonts. |
| Focus emphasis | Authored camera shots and dimmed surrounding instruments; inspect focused stills. |
| Edge HUD | Overview keeps the twin clocks and teaching instruments clear; phone auxiliary readouts hide during focus. |

Arbitrary orbits, every intermediate viewport size and all parameter combinations were not exhaustively captured. Whole-object phone focus is small while its sheet is open; etched instrument text is fine print. The HTML labels, ruler, values and cards carry the readable units and explanations. High refraction obscures small face lettering; the large HTML readings and common ruler remain readable. Balanced is preferred for legible markings. Physical phones, Safari, human narration and an unfamiliar learner study were not tested.

## Regenerate

From `prototype/v2`, with an installed Chromium browser:

```sh
npm run dev
# In another terminal, same directory:
npm run capture:stage:relativity
npm run test:stage:relativity
npm run typecheck
npm test
npm run build
npm run test:stage:relativity:performance
```

`PETROS_BASE_URL` chooses the running capture/test server; `PETROS_BROWSER` selects an installed browser. Performance starts an isolated optimized server on 3024 with ephemeral authentication and an empty provider key. Measure separately after other automated browsers close.

Time dilation reuses Traffic's desktop hero canvas: at a 1440×900 page size, the canvas is 1140×620 CSS pixels / 2280×1240 drawing buffer. DPR2, 4× MSAA and HalfFloat are retained, as are full-window virtual camera perspective and subject pixel scale. The five-level bloom pyramid is bounded proportionally to the crop; Balanced omits unused resolved depth, and High restores depth for AO. The full phone canvas is 390×844 CSS pixels / 780×1688 buffer, using Low.

See `TIME_DILATION_STAGE_NOTES.md` in `prototype/v2` for discovery and decisions, plus `smoke-results.json`, `teaching-results.json`, `performance-production.json`, `regression-results.json`, `world-regression-results.json`, `verification.json` and `source-manifest.json` here for final evidence. Historical evidence for earlier lessons remains in its own folders.

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
