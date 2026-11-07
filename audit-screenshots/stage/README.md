# Stage evidence — current source, 6 November 2026

All Stage stills and motion frames in this directory were regenerated from the final working source with `npm run capture:stage`. The approved reference is a separate fresh render of the archived original HTML; it is not a Stage screenshot. `motion/frames.json` records actual elapsed capture times for the intro/focus PNG sequences; no fixed video frame rate is claimed.

Website-theme steering intentionally replaces the reference's navy UI and Fraunces/Geist pairing with shared site forest-green/ivory tokens and the existing Petros DM Serif/Outfit/website JetBrains Mono fonts. Glass, plinth, copper, dial, light structure and amber→mint teaching signals follow the reference.

## Verification

- Typecheck, lint of changed source/tests and optimized Next build: PASS.
- All 149 prototype/v2 unit tests: PASS (six new Stage cases, including signed engine updates, range, color and content validity).
- Stage desktop/phone smoke: PASS; direct mesh clicks, 180px/unit dial dragging, actual camera movement, three focus cards, Escape, training, self-stopping auto, all nine chips/demos, recovery, reduced motion and blocked storage; no page/console errors or paid voice/model requests. See `results.json`.
- Prepared teaching flow: PASS; guided focus, .5→1.1, wrong-answer correction, negative transfer, matching-weight demo, cancellation, token counting, loss control focus, glossary, World continuity and Stage selection after Rocket. See `teaching-results.json`.
- Existing World smoke: PASS for all five topics at both viewport sizes, all quality presets and reset. Fresh result copied to `world-smoke-results.json`; its old authored reference screenshots were restored unchanged after running the existing script.

## Performance

Optimized local Next build, headless Chromium 156.0.8078.80, Apple M4, ANGLE Metal (actual GPU, no CPU throttling). DPR 2. Ten 800ms sampling windows per overview. Draw calls/triangles are peak complete-frame totals including transmission, mirror, shadows and postprocessing. Phone viewport emulation on this Mac is **not physical-phone performance evidence**.

| Preset | CSS viewport | Median frame ms | Approx fps | Median window p95 ms | Peak calls | Peak triangles |
|---|---|---:|---:|---:|---:|---:|
| balanced | 1440×900 | 16.70 | 59.9 | 16.80 | 140 | 76,845 |
| high | 1440×900 | 31.00 | 32.3 | 32.25 | 148 | 76,853 |
| low | 1440×900 | 16.70 | 59.9 | 17.15 | 49 | 26,534 |
| low | 390×844 | 16.70 | 59.9 | 17.40 | 49 | 26,534 |

Balanced weight, input and loss focus shots also measured a median 16.7ms (~60fps), with four windows each. Raw samples are in `performance-production.json`. High is expensive on this M4; Balanced is the intended recording preset. Human laptop thermals, Safari and physical phones were not tested.

Balanced keeps the main framebuffer at full DPR2, HalfFloat and 4× MSAA. Only its native refraction buffer is half-size in each dimension; High keeps full-size refraction. This uses the pinned Three r170 `camera.viewport` transmission-sizing behavior, checked against its local renderer implementation; revalidate when upgrading Three. Cores remain visible in fresh desktop and phone captures. No renderer library was modified.

## Visual acceptance

| Check | Result and scope |
|---|---|
| Text avoids other text / specimen labels avoid geometry | PASS in captured states at both sizes; phone loss chip grows for signed-case values; low prediction labels move below the plinth. |
| Prediction / Target labels never collide | PASS in captured overview, after-three, solved, signed and focus cases, with browser rectangle assertions. Opposite-side placement is data-driven. |
| No hard horizon / floor edge | PASS, visual review of the radial veil/pool and simplified mirror. |
| Glass cores visible on desktop and phone | PASS, physical desktop refraction / cheaper phone alpha glass. |
| Literal original palette and typography | FAIL by intentional owner override: website theme replaces navy chrome/Geist. Reference copper, amber/mint and glass/light direction retained. |
| Only edge HUD covers the hero | PASS for main specimen/focused part; distant dimmed plinth/background can extend beneath the edge HUD during close-ups. |
| Focused part clearly brightest | PASS within the 3D scene in reviewed weight/input/loss shots. |
| Explainer never covers focused part | PASS for required shots at both sizes, checked using projected part bounds as well as images. |

## Known limits, ranked

1. High is ~32fps here; use Balanced (~60fps) for recording.
2. The half-size native transmission optimization is tied to pinned Three r170 semantics and needs upgrade review.
3. Actual phone GPUs, Safari/WebKit, assistive-technology reading order, human speech/voice quality and novice comprehension have not received human acceptance testing. Existing optional narration is reused; tests make no paid calls.

## Regeneration

From `prototype/v2`, run `npm run dev` and open `/prototype?view=stage`. Run `npm run capture:stage` for images/sequences, `npm run test:stage:teaching` for the guided/recovery proof, and `npm run build && npm run test:stage:performance` for the isolated optimized benchmark. `PETROS_V2_STAGE_DEFAULT=1 npm run dev` enables the default; `?view=world` opens the original World. The explicit Stage route selects Neural while preserving all topic sessions; a saved tanh Neural model uses World.

## Time dilation integration regression refresh

The smoke/teaching suites and their PNG outputs were refreshed on 7 November 2026 while validating the fifth Stage. All five pills are now enabled. The earlier performance reports and original source manifest above describe their earlier lesson pass; current regression source/image hashes are recorded in `../stage-relativity/source-manifest.json` and `../stage-relativity/regression-captures.json`. Unrefreshed reference/comparison PNGs remain historical. The original World evidence was restored separately, byte-for-byte.
