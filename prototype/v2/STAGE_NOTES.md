# Stage discovery and implementation notes

## Discovery (before implementation, 2026-11-06)

Read the complete approved `reference/petros-stage.html` and the requested World renderer, camera, Heroes/assets, previews, guide, WorldExperience, LiveTeachingSurface, smoke test, feature register, asset authoring script, asset register, presentation audit, and recording playbook. Read the local Next lazy-loading guide as required by AGENTS.md. Existing uncommitted `core/prototype-features.ts`, root audit and screenshots belong to the owner and will be preserved.

- React 19 / Next 16 / R3F 9 / drei 10 / Three .170; postprocessing, GSAP and Playwright are already installed. No installation needed.
- `LiveTeachingSurface` owns session recovery, worker dispatch, revision/epoch cancellation, prepared captions, guided quizzes and Narrator. Keep it authoritative; the Stage is another presentation of that session.
- Actual beginner model: `core/teaching.ts:lessonModel('neural')` initializes `model: linear, x1: 2, weight: .5, target: 4, learningRate: .1`. `runtime.step(sim, 1/60)` does exactly ONE update, .5 → 1.1. `linearObservation` computes prediction, gradient and half squared loss. A separate tanh model exists and remains in World.
- State to bind: `Simulation.params.{model,x1,weight,target,learningRate}`, `observe(sim).{prediction,error,loss,steps}`, `Simulation.history[].a` (loss). Never duplicate the update rule in the view.
- Prepared copy has no concrete story. It teaches input × weight, half squared error, direction depending on input sign, and no generalization guarantee. Fresh example comes from `transfers.neural.patch`: input −2, weight .5, target 4. Story skin uses exam scores for nonnegative inputs; signed cases are explicitly abstract (negative study hours would mislead).
- Reuse IDs `input-0`, `weight`, `prediction`, `target`, `loss`. Stage adds `number-line`, `error-beam`, `train-step`, `whole`; they map to existing tutor IDs at the adapter boundary.
- Existing World uses the same postprocessing library but its ACES effect plus renderer ACES risks stacking. Stage uses renderer NoToneMapping with exactly one ACES composer effect, exposure 1.08; Low uses renderer ACES without a composer.
- World quality store is reusable. Existing studio HDR is local but reference specifically uses RoomEnvironment; Stage will generate PMREM locally from Three's bundled RoomEnvironment (no fetch).
- Existing self-hosted display/UI fonts are DM Serif Display / Outfit. Prefer approved Fraunces/Geist if available locally; otherwise follow existing local loading and document substitution. Mono can reuse the local JetBrains Mono asset.

## Integration plan

1. `?view=stage` and server env `PETROS_V2_STAGE_DEFAULT=1`; explicit `?view=world` preserves archipelago access. Other lessons and tanh retain World. Do not change feature pause flags.
2. Typed lesson definition (story, parts, chips, per-part shots, glossary), state adapter/pure range/color helpers, one procedural Neural specimen. Shell receives lesson data plus specimen; no numerical engine in shell.
3. Shared cancelable spline path utility extracted from World camera, Stage camera with viewport bounds framing, clamped idle-return orbit and reduced motion.
4. Studio plinth/metals/glass, local environment, radial pools/dust, mirror clone, MSAA/HalfFloat composer. Instance repeated ticks/ridges/pulses. Measure complete render passes, including shadow/transmission/reflection/post.
5. Edge HUD, projected HTML labels/leader lines, loss/sparkline, dial/slider/train/auto/reset; typed static chips, dynamic factual substitutions, cancelable try-it sequences, glossary captions, optional existing narration and guided lesson controls.
6. Pure unit tests, Stage browser smoke and current-source DPR2 screenshots/motion frames, plus existing tests/World verification. Record limitations and acceptance honestly.

## Final implementation decisions

- Latest owner steering: “make sure these prototype lessons 3D match our website theme.” Read `packages/design-tokens/src/tokens.ts`, public/student site tokens and fonts, and the existing Petros Learning Studio CSS. The Stage now imports the site's dark/forest-green/ivory brand tokens directly. It reuses Petros's existing DM Serif Display/Outfit and the website's self-hosted JetBrains Mono, including the Petros p mark. This intentionally supersedes the reference's blue chrome and Fraunces/Geist pairing; its studio composition, copper/glass geometry, light arrangement and amber→mint teaching signals remain. Other World lessons already use the cream/green identity and were left intact.
- No dependency installations. Existing reference fonts are kept only for the reproducible approved-reference capture. Stage runtime fonts and environment require no external requests.
- Shell contracts are generic over lesson state. Lesson data supplies labels, ruler, metric, editable parameter, train action, story, glossary, demo phases and focus shots. `NeuralStage` is the engine adapter; `NeuralSpecimen` is the one lesson-specific renderer. Future lessons need their own data/adapter/specimen, without changing the shell.
- Reused shared Catmull-Rom camera path from World (same five-point path and cancelable GSAP lifecycle). Stage transitions take 1.2s, assembly 2.4s; phone focus shots account for the bottom sheet. Pointer capture stays on the actual canvas, preserving mesh clicks after orbit/dial drags.
- The one-step action dispatches `sim_step` for 1/60 second, exactly one engine update. Reset restores `lessonModel('neural')` through `sim_restore`, rather than `sim_reset`, which retains the current weight. Auto-train dispatches the same one-step action every 520ms and stops at error < .012. No parallel training math.
- Slider/dial retain the engine's full −10…10 weight range, rather than the reference's positive-only range. Ruler fits prepared examples and current values, keeps visible zero and negative ticks, and expands for extreme restored values. Normal default ruler is −2…6. Negative study hours are explicitly presented as an abstract signed example and lose story units/tokens.
- Static answers substitute current values; decimal wording handles fractional inputs; the training answer uses the actual rate × error × input rule, rather than the incorrect “10% of the way.” Matching weight in Try it is target/input, including signed cases. These are authored deterministic functions, not model-generated answers.
- Reduced tessellation and instanced dial ticks/ridges/pulses keep the procedural hero small. Mirror uses a simpler flipped specimen without repeated ticks/tubes/shadows, covered by the radial floor veil. Key shadows update at 8Hz on Balanced, 24Hz on High. Physical spheres use effective thickness scaled to their actual radii so cores remain visible. Screens <900px and Low use alpha glass; phones automatically use Low with native antialiasing and no composer/mirror/bloom.
- Exactly one ACES operator: renderer NoToneMapping + ACES composer effect for Balanced/High, renderer ACES with no composer for Low; exposure 1.08. Composer target is HalfFloat, 4 samples. High adds half-res N8AO. Diagnostics are local canvas data attributes for the requested measurements, with no network analytics.
- Inspection updates the existing session caption and semantic focus; Read aloud calls the existing Narrator/voice pipeline. Prepared tutor beats still drive camera focus. Guided quizzes, negative transfer, interruption, revision checking and browser recovery remain in `LiveTeachingSurface`.

## Verification commands

From `prototype/v2`:

```sh
npm run dev
# Stage: http://127.0.0.1:3022/prototype?view=stage
# World: http://127.0.0.1:3022/prototype?view=world
# To make Stage the default on a fresh launch:
PETROS_V2_STAGE_DEFAULT=1 npm run dev
npm run typecheck
npm test
npm run test:world
npm run capture:stage
npm run build
npm run test:stage:performance
```

`capture:stage` runs the browser acceptance test and writes current-source 1440×900 and 390×844 DPR2 screenshots to root `audit-screenshots/stage/`, plus intro/focus PNG sequences and actual capture times. It renders the original reference with locally served Three modules/fonts for comparison, without changing the archived HTML. `test:stage:performance` starts an optimized build temporarily on 3024 with ephemeral local test authentication and no provider key; it checks the default env route and all three presets. The existing dev server remains on 3022.


## Final verification and evidence

See root `audit-screenshots/stage/README.md` for the complete visual checklist, raw measurements, limits and regeneration commands. Typecheck, changed-file lint, all 149 unit tests, optimized build, existing all-five-topic World smoke, Stage smoke and prepared teaching/recovery all pass. Stage tests make no paid requests. The explicit Stage route selects Neural after a saved visit to another topic without resetting any topic model/conversation; tanh Neural still uses World.

Final optimized M4 / ANGLE Metal / Chromium 156 results at DPR2: Balanced 16.7ms (~60fps), 140 peak full-pass calls and 76,845 triangles. Weight/input/loss focus shots also measured 16.7ms. High ~31ms (~32fps), 148 calls / 76,853 triangles. Low desktop and emulated phone ~16.7ms, 49 calls / 26,534 triangles. No physical phone, human narration, Safari or novice acceptance is claimed.

The final performance improvement keeps the main render target at full DPR2/HalfFloat/4×MSAA and sizes only Balanced's native transmission buffer to half resolution per axis using the pinned Three r170 viewport hook. The local renderer implementation was inspected to verify it restores the full main viewport after transmission. Revalidate this when upgrading Three. No renderer dependency was patched.

All required current-source stills, plus original-reference comparison, and intro/focus PNG sequences are fresh. The existing World smoke's generated result was saved separately and its old screenshot references restored byte-for-byte. The owner's pre-existing `core/prototype-features.ts` edit and root audit/screenshots were left intact. No dependencies installed, no engine/prepared lesson math/copy changed, no deploy or git history rewrite.


## Follow-on lesson

Rocket landing is now implemented beside Neural, with active lesson navigation and the same website tokens. Phase 1 observations above document the original Neural delivery; current Rocket decisions, engine bindings and evidence are in [ROCKET_STAGE_NOTES.md](ROCKET_STAGE_NOTES.md). The shared panel now exposes the full prepared caption with glossary links, and secondary 3D part clicks keep their own authored camera shot.


## Attention follow-on

Attention is now the third Stage lesson with the same website palette, fonts and studio. It uses the existing toy attention engine and original prepared teaching. Current architecture, controls, evidence and limits are recorded in [ATTENTION_STAGE_NOTES.md](ATTENTION_STAGE_NOTES.md).
