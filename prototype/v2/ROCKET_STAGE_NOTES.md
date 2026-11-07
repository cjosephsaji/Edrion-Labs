# Rocket landing Stage — discovery and decisions

## Discovery before implementation

The approved Neural Stage and its website theme remain in the uncommitted working tree; preserve them. Read the Stage shell, generic lesson contract, HUD, labels, camera, studio/presets, LiveTeachingSurface integration, route, existing Rocket engine/runtime observations, prepared Rocket answers and teaching comparison. Local Next guidance from the previous Stage work still applies.

- Engine: `simulations/foundations/rocket.ts`, driven through `simulations/runtime.ts`. Upward-positive vertical flight, no drag/attitude; fuel changes mass; midpoint-mass integration at 1/120 s; ground contact interpolated within the last step; safe contact speed ≤2 m/s.
- Default state: height 120 m, velocity −12 m/s, fuel 450 kg, dry mass 1,000 kg, throttle .6, gravity 9.81 m/s², maximum thrust 24 kN. Values and outcomes must come from the engine/observe, including exhausted fuel, heavier craft, rising motion, soft landing and crash.
- Existing prepared copy distinguishes velocity from acceleration, total mass from dry mass, and maximum power from safe timing. `core/teaching.ts:rocketComparison` already computes a successful timed burn. Reuse its exact controller/integrator for a prepared animated demonstration by adding an optional sampled-state callback; no new guidance or parallel flight math in the view.
- Shared target IDs: `rocket`, `ground`, `altitude`, `velocity`, `fuel`. Stage adds aliases for thrust, gravity, mass, throttle and flight step, mapped to the existing tutor IDs at the adapter boundary.

## Plan

1. Add `?view=stage&lesson=rocket`, active Neural/Rocket lesson pills with session-preserving switches/reload; keep `?view=world` and the other three World lessons. Default Stage remains Neural.
2. Typed Rocket state adapter and lesson content: lander/pad, altitude line in metres, thrust/gravity arrows in kN, signed velocity, fuel and total mass. Eight short prepared question cards and engine-backed Try it demonstrations.
3. Extend the generic shell with physical units/precision, signed metric histories, optional readouts, continuous-run cadence, and adjustable controls while running. Neural defaults and behavior remain unchanged.
4. One procedural Rocket specimen in the same green/ivory/copper studio: detailed lander, fuel window, throttle lever, engine plume, lit landing pad, mirror on desktop and Low phone path. Height is a linear mapping from engine altitude to the feet; the ruler includes zero. Force arrows compare actual current forces; the velocity arrow carries the sign.
5. Prepared landing replay consists of immutable sampled engine states from the existing comparison, cancellable by controls, inspection, Escape, visibility change or navigation. Label it as a prepared burn, not a general-purpose autopilot.
6. Unit and browser tests for physics binding, landing/failure/fuel states, chips, focus/cancellation, navigation/recovery and guided teaching. Fresh DPR2 stills, intro/landing frames, and local GPU measurements. No installs or paid calls.

## Implementation decisions

- Implemented Rocket as typed content (`stage/lessons/rocket.ts`) + one specimen (`stage/RocketSpecimen.tsx`) + a thin engine adapter (`stage/RocketStage.tsx`, `stage/rocket-logic.ts`). The shell supports quantities with physical units and precision, signed history, optional readouts, and an adjustable parameter during continuous playback. Neural retains its training defaults.
- Preserve the website's shared forest-green/ivory tokens, DM Serif display, Outfit UI and self-hosted JetBrains Mono. Copper, glass, restrained bloom, an ivory pressure vessel, articulated landing legs, a glass fuel window and a lit pad extend the approved studio. No new fonts, textures, models, packages or runtime services.
- The lander's feet follow the same linear metre ruler used by the DOM tick labels, including pad zero; both view coordinates use `altitudeY`. The model is an enlarged teaching specimen, not a scale model of the rocket's dimensions versus the distance travelled. The ruler expands to accommodate an upward flight or a different configured starting altitude.
- Thrust and gravity arrows share one force scale, normalized together if total weight exceeds the engine's maximum force. The blue velocity arrow shows direction, separately from the force arrows. Units and arrow direction accompany color. Changing throttle changes force immediately, while the craft's motion follows actual integration.
- `Step ½ s` advances the existing worker; `Run flight` requests 0.1 engine seconds every 100 ms, permits throttle edits, pauses on inspection/settings/background/navigation, and stops at contact. This is local playback, not a replacement integrator. Direct throttle drag uses 180 px per full throttle fraction; the accessible slider uses percent.
- Eight static question cards cover thrust, gravity, height, signed velocity, braking during descent, fuel, total mass and landing timing. Each has an engine-backed Try it. Clicking a part focuses that exact part, including secondary parts sharing one question; the glossary/chip uses the primary shot.
- The optional callback added to `rocketComparison` samples its original, unchanged controller at 0.2 engine-second intervals and at contact. The safe-landing demo replays those immutable snapshots over eight wall-clock seconds and is explicitly labelled accelerated prepared playback. It is cancelled by manual changes, inspection, Escape, hidden tab or lesson navigation.
- Continuous Rocket actions interrupt narration and suppress automatic speech for the repeated observations; Read aloud and the guided prepared lesson still use the existing voice/caption pipeline. No provider calls are needed with `liveAI=false`.
- At contact, the engine intentionally retains impact velocity for assessment. The HUD switches to “Contact velocity,” and Rocket's prepared observation caption now explicitly says that the craft is at rest and the value was recorded at contact. Flight equations, outcomes and the other four lessons' copy are unchanged.
- Added a full-caption transcript with glossary links inside the existing lesson/settings panel, reachable through “More” next to a truncated strip. This keeps the entire prepared comparison readable without expanding the edge caption over the specimen. The unchanged full caption still reaches aria-live.
- Phone widths automatically use Low. Focus framing leaves the selected part above the bottom sheet; ruler text is right-aligned and clipped away from the header/controls. Labels sit above the force arrows and the height pill moves outside the plinth footprint near contact.
- Neural and Rocket lesson pills preserve independent topic state. `?view=stage&lesson=rocket` selects Rocket on initial load/reload without clearing saved Neural or World sessions. Default Stage remains Neural; `?view=world` remains the original World. Attention, Traffic and Time dilation remain visibly “next” on Stage.

## Verification and evidence

Completed against the current source on 6 November 2026:

- `npm run typecheck` — pass.
- Scoped repository ESLint on Stage, route, integration, Rocket teaching change and new tests — pass, zero warnings/errors. `git diff --check` — pass.
- `npm test -- --reporter=dot` — all 158 tests across 12 files pass, including nine new Rocket tests. These cover engine binding, throttle edits without advancing time, empty fuel, mass scaling, ruler range/zero, immutable prepared replay and exact terminal state, short typed content/semantic IDs, and contact wording.
- `npm run build` — optimized Next build and its TypeScript check pass.
- `npm run test:stage:rocket` — pass at 1440×900 and 390×844, DPR2. All eight cards/focus shots complete; Escape restores overview; labels/cards do not collide with each other or the selected part's projected bounds. Direct lever drag and slider agree; Run flight accepts throttle edits; actual crashes stop it; the prepared replay lands at −1.238784506 m/s, exactly matching `rocketComparison().timed`. Reset/Escape cancel pending demo states, topic/reload state is retained, reduced motion/storage rejection remain usable. No page/console errors or paid routes.
- Rocket prepared guided teaching and doubled-mass transfer — pass. The original correction produces a landed engine state; transfer total mass is 2,900 kg; the full-caption glossary opens the same card; cancellation/reload preserve the committed state. Original World loads with that same Rocket state.
- Existing `npm run test:stage` and `npm run test:stage:teaching` — pass after the shared changes, including Neural training, negative inputs and session restoration.
- Existing `npm run test:world` — all five lessons pass at both DPR2 viewport sizes. Fresh result JSON is saved in the Rocket evidence directory. Its tracked screenshot/result outputs were restored to the clean pre-run baseline; no legacy assets or tests were deleted.

All Rocket screenshots are fresh from the current source in root `audit-screenshots/stage-rocket/`. The 12-frame intro, 10-frame focus transition and 16-frame prepared burn are PNG sequences with actual timing JSON, not constant-frame-rate videos. Final landed stills accompany the accelerated playback. `smoke-results.json`, `teaching-results.json`, `world-regression-results.json`, `performance-production.json` and `source-manifest.json` identify the evidence.

### Local performance

Optimized Next build, installed headless Chromium 156.0.8078.80, actual Apple M4 / ANGLE Metal, DPR2, no other browser test running. Frame times are the median of reported per-window medians; p95 below is the worst sampled window. Calls/triangles include all passes and shadow refresh, rather than only the main scene.

| View / preset | Median frame | Approx. fps | Worst window p95 | Peak calls | Peak triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1440×900 Balanced overview | 16.7 ms | 59.9 | 17.5 ms | 118 | 124,163 |
| 1440×900 Balanced active flight | 16.7 ms | 59.9 | 17.5 ms | 118 | 124,163 |
| Balanced thrust / fuel / pad focus | 16.7 ms | 59.9 | ≤17.6 ms | ≤89 | ≤91,171 |
| 1440×900 High | 31.1 ms | 32.2 | 32.1 ms | 126 | 124,171 |
| 1440×900 Low | 16.7 ms | 59.9 | 17.1 ms | 49 | 37,232 |
| 390×844 Low (Mac viewport) | 16.7 ms | 59.9 | 17.6 ms | 49 | 37,232 |

Balanced meets the 55 fps / ~150 calls / ~250k triangles target on this machine. High is opt-in because full-resolution transmission plus N8AO is expensive. Phones automatically use Low with no mirror or postprocessing; a phone viewport on the Mac is not physical-phone performance evidence.

### Known rough edges / verification limits, ranked

1. **High cost:** about 32 fps on this M4 at DPR2. Balanced is the default and passes the target; High remains selectable for hardware with more GPU headroom.
2. **Physical-device/browser coverage:** no physical iPhone/Android, Safari/WebKit or human narration test. Existing local voice pipeline is reused; browser tests deliberately use captions and never request provider speech.
3. **Presentation limits:** the specimen is enlarged for legibility rather than physically scaled against 120 metres. This is the existing one-dimensional flight model, without attitude, air resistance or leg/contact deformation. The prepared replay is not a controller for arbitrary starting states.
4. **Visual coverage:** automated label/card bounds cover the saved states and all eight focus shots at the two requested sizes; arbitrary orbit angles and every possible configured height were not exhaustively screenshot-tested. No novice study or external subjective brand approval is claimed.

### Run and regenerate

From `prototype/v2`:

```sh
npm run dev
# Open http://127.0.0.1:3022/prototype?view=stage&lesson=rocket
npm run test:stage:rocket
npm run capture:stage:rocket
npm run build
npm run test:stage:rocket:performance
```

`PETROS_BASE_URL` selects a running server for capture/smoke. `PETROS_BROWSER` can point to an installed Chromium browser. The performance runner starts an isolated server on 3024 with a temporary local authentication secret and no provider key. The existing dev server on 3022 remains running. No new packages, runtime dependencies, telemetry, deploys or paid calls were introduced.


## Third lesson

Attention now shares the Stage and lesson navigation. Rocket's engine and specimen remain unchanged; shared controls still use its existing numeric throttle and flight actions. The new shared phone framing leaves space for actual explainer height. Follow-on regression evidence is recorded in `ATTENTION_STAGE_NOTES.md`.
