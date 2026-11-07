# Attention Stage — evidence

These stills and PNG frame sequences are fresh from the Attention implementation on 6 November 2026. The scene and HUD use the website's forest-green/ivory tokens and existing Petros fonts. This is the existing deterministic four-dimensional attention engine, with Q = K = V.

## Captures

At CSS viewports 1440×900 and 390×844, DPR2:

- Overview; after three query changes; all nine question/focus cards.
- First word with causal masking on (exactly 100% to itself, zero future shares), then masking off.
- Prepared cat→dog comparison; signed unknown-word context; twelve-token and single-token layouts.
- `intro/`: 12 assembly frames; `focus/`: 10 focus-transition frames. Actual capture timing and selected query are stored in each `timing.json`. These are irregularly timed frame sequences, not a fixed-frame-rate video.

`smoke-results.json` records observations, projected pill/card/part bounds, viewport metadata, errors and provider-route checks. `teaching-results.json` records the original guided correction, second-query transfer, full-caption glossary, cancellation, reload and restoration in the original World. Phone width exercises the Low path on the Mac; it is not physical-phone performance evidence.

## Visual acceptance

| Check | Result | Scope |
| --- | --- | --- |
| Projected pills do not collide | PASS | Both sizes, all nine focus shots and saved query/mask/custom-sentence states. |
| Explainer avoids selected part and projected labels | PASS | Browser checks projected bounds for every question at both sizes. |
| Word names and shares remain readable | PASS for the five-word demo | Larger fog-free print faces; full words also in the keyboard selector and part heading. Twelve-word layouts are denser. |
| Masking is understandable without color | PASS | LOCKED, MASKED 0.0%, explicit crossbar, absent future beams, and on/off control. |
| Signed context has a zero reference | PASS | Copper zero line, printed 0, signed number pill, amber bars below zero. |
| Glass/core visible on desktop and phone | PASS | Context uses transmission on desktop and cheap physical glass on narrow/Low; tablets use alpha physical glass for clear text and render cost. |
| No hard horizon/floor edge | PASS in reviewed captures | Shared studio, radial veil and faint mirror; Low omits mirror. |
| Website theme retained | PASS | Actual shared design tokens, fonts, green buttons, ivory ink and copper. |
| Focused part is clear | PASS in reviewed captures | Authored shot and emphasis; surrounding parts dim; phone framing accounts for card height. |

The default five-word lesson is the recording view. Twelve-token stress captures show more beam crossings and smaller tablet text; long words are shortened on the tablet face and remain complete in the selector and heading. Arbitrary orbits and every possible sentence were not exhaustively screenshot-tested.

## Regenerate

With the dev server running, from `prototype/v2`:

```sh
npm run capture:stage:attention
npm run test:stage:attention
npm run build
npm run test:stage:attention:performance
```

`PETROS_BASE_URL` can select a running server for smoke/capture; `PETROS_BROWSER` selects an installed Chromium executable. Production measurements use isolated port 3024, temporary local authentication and no provider key. Final measurements and verification are in [ATTENTION_STAGE_NOTES.md](../../prototype/v2/ATTENTION_STAGE_NOTES.md).


## Final verification

All 167 unit tests, strict TypeScript, scoped ESLint (zero warnings/errors), the optimized build, Attention smoke/prepared teaching, existing Neural smoke/prepared teaching and existing Rocket smoke/prepared teaching pass. Original World session restoration passes. No page/console errors or paid routes were recorded.


Measured on the actual local Apple M4, headless Chromium 156.0.8078.80, ANGLE Metal, optimized Next build, DPR2, with no other browser tests running. Values are medians of reported per-window medians; p95 is the worst sampled window. Draw calls and triangles include all render passes, including shadow refresh.

| View / preset | Median frame | Approx. fps | Worst window p95 | Peak calls | Peak triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1440×900 Balanced overview | 16.7 ms | 59.9 | 18.3 ms | 80 | 39,255 |
| Balanced sentence scan | 16.7 ms | 59.9 | 17.4 ms | 84 | 39,255 |
| Balanced twelve-token stress view | 16.7 ms | 59.9 | 17.8 ms | 122 | 62,101 |
| Balanced query / beams / context focus | 16.7 ms | 59.9 | ≤17.8 ms | ≤80 | ≤39,255 |
| 1440×900 High | 30.55 ms | 32.7 | 31.9 ms | 88 | 39,263 |
| 1440×900 Low | 16.7 ms | 59.9 | 18.6 ms | 35 | 19,984 |
| 390×844 Low (Mac viewport) | 16.7 ms | 59.9 | 18.5 ms | 35 | 19,984 |

Balanced meets the target on this hardware, including the twelve-token case. High is an optional visual preset at about 33 fps here; use Balanced for recording. The phone viewport is not physical-phone hardware evidence. Full samples are in `performance-production.json`; the aggregation is in `performance-summary.json`.

`regression-results.json`, `verification.json` and `source-manifest.json` identify the checks and current source. The dev capture runs exercised independent browser contexts; performance was measured separately with other test browsers closed.

## Time dilation integration regression refresh

The smoke/teaching suites and their PNG outputs were refreshed on 7 November 2026 while validating the fifth Stage. All five pills are now enabled. The earlier performance reports and original source manifest above describe their earlier lesson pass; current regression source/image hashes are recorded in `../stage-relativity/source-manifest.json` and `../stage-relativity/regression-captures.json`. Unrefreshed reference/comparison PNGs remain historical. The original World evidence was restored separately, byte-for-byte.
