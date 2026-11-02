# Petros World presentation rebuild

Local preview: [http://127.0.0.1:3022/prototype](http://127.0.0.1:3022/prototype). Default quality is **Balanced**. No deployment or push was performed. The prototype API key remains blank as requested.

Regular tutor (2D): [http://127.0.0.1:3022/prototype?view=2d](http://127.0.0.1:3022/prototype?view=2d). Both views share the saved lessons. The world settings include a link back to the regular tutor.

## What changed

The browser is now one continuous R3F world: six floating islands joined by modeled bridges, with the five lessons in the requested order. There is one full-viewport canvas, a rigged 3D Petros, spline camera flights, free orbit/zoom, a 120-second guided tour, loading progress and a small floating HUD. Experiment controls, precise SVG plots and model assumptions open only when requested.

The palette uses cream, deep green, warm wood and topic accents. New Blender-authored GLBs replace the mixed historical/photoreal asset set. They include beveled props, a modeled rocket, toy cars, word capsules, planet, spacecraft, matched mirror clocks and remeshed clouds. The guide has seven bones, eight animation clips, blink and audio-driven mouth morphs. Imported hero/environment AO is baked at 2K, compressed as KTX2 with mipmaps. Geometry/animation uses Meshopt. Text uses local-font Troika SDF or CSS/SVG.

The heroes read the existing engines directly: weighted neural links and signal pulses with a loss meter; force arrows, actual altitude/velocity and a GPU rocket plume; computed attention shares and query beams; instanced cars and a speed ribbon showing the backward wave; matching light clocks with photons, diagonal path and proper-time counters. The preserved one-weight lesson is still the opening neural explanation; the full 2→3→1 network is available in Experiment controls → Adjust the experiment → Model.

## Audit and preservation

Read [PRESENTATION_AUDIT.md](PRESENTATION_AUDIT.md) for the audit completed before implementation. The confirmed causes were the page-constrained canvas, Balanced's DPR 1.5 cap, raster canvas sign text, inconsistent assets, sparse composition, waypoint camera motion, flat PNG guide, and eager loading of every station.

[Preservation evidence](evidence/world-rebuild/preservation.json) compares 57 existing simulation, teaching, server/model and test files against the presentation-task baseline. Only two client audio files differ: `core/narration.ts` and `core/voice-provider.ts` each tap existing playback for mouth amplitude. The numerical engines, lesson controller, model/AI server and pre-existing tests remain unchanged during this rebuild. The local launcher now respects an explicitly blank prototype credential without altering the platform credential. Existing dirty platform/legacy-prototype work was left in place; the main `/prototype` page received only the entry forwarding described below.

## Browser verification

- All **85 existing unit tests** pass; TypeScript and the production build pass.
- The existing production access/origin/quota and client-secret checks pass: unsigned API 401, cross-origin 403, missing shared usage accounting 429, zero client secrets found.
- [World smoke results](evidence/world-rebuild/smoke-results.json): full canvas, true DPR 2 at 1440×900 and 390×844, all five places, rig presence, quality switching, reset and render budgets. No browser runtime/asset errors.
- [Teaching results](evidence/world-rebuild/learning-results.json): every topic passed wrong-answer correction, correct-answer extension, transfer, preserved model state when opening controls, and reload persistence.
- [Dynamic results](evidence/world-rebuild/dynamic-results.json): the real full-network loss decreased from 5.59905 to 0.00000372; rocket burn changed altitude; attention shares recomputed to a normalized row; the 45-car braking front moved from car 0 to car 43; clocks advanced to 2.4 s Earth / 1.44 s ship at gamma 1.66667.
- [Tour results](evidence/world-rebuild/tour-results.json): all five stops reached prediction, automatic finish at 120 s, stop cancels pending stops and the current camera flight, manual navigation cancels the tour, keyboard orbit works. [Reduced motion](evidence/world-rebuild/reduced-motion.json) navigated without a long flight.
- [Speech/rig results](evidence/world-rebuild/voice-results.json): all five topics at both screen sizes used an **exact-caption local macOS speech fixture**, decoded and played through the existing narrator; actual audio RMS drove MouthOpen. Pause silenced the mouth. This is not live provider or human microphone acceptance.
- The old page/Atelier browser scripts are preserved. Their obsolete page-layout selectors and live-provider prerequisites are not claimed to pass the replacement interface; the new world suites exercise the replacement flows without deleting those tests.

Useful commands: `npm test`, `npm run build`, `npm run test:production`, `npm run test:world`, `npm run test:world:learning`, `npm run test:world:voice-fixture`, `npm run test:world:tour`, `npm run test:world:performance`. Tour video capture needs Playwright's ffmpeg available. The local speech fixture needs macOS `say`/`afconvert` and never contacts a paid provider.

## Performance

Measurements are local **production-build, headless Brave on Apple M4**, 1440×900 CSS pixels, 3-second steady-state samples per place/tier. These are browser frame intervals, not a physical-phone or deployed benchmark. See [all measurements and resource requests](evidence/world-rebuild/performance.json).

| Tier | Retina DPR | Median frame | Observed rate across five places | Real cost changes |
|---|---:|---:|---:|---|
| High | 2 | about 33.3 ms | 27–31 fps | Half-resolution N8AO, emissive bloom, moving-shot DOF, 2K soft key shadows, 2K maps, 420 plume particles / 18 clouds |
| Balanced | 2 | about 16.7 ms | 56–60 fps | Baked AO and soft guide contact shadow, full-resolution MSAA 4 + SMAA, 2K maps, 220 plume particles / 12 clouds |
| Low | 1.5 | about 16.7 ms | about 60 fps | 1K hero maps, fewer particles/clouds, no screen AO/bloom or dynamic shadow maps; resolution change is explained in settings |

The initial resource body total was approximately **6.34 MB encoded / 8.97 MB decoded**, including JavaScript, fonts, world geometry, 2K guide/environment AO, HDR fill and transcoder. No external runtime asset hosts or PNG mascot poses were requested. The Edrion entry forwarding was also verified in the browser; the measured resource budget refers to the isolated world itself. Render-pass-inclusive counts stayed under 200 calls / 1M triangles. The separate running 45-car test measured 60 fps at DPR 2, 24 calls and about 342k triangles in development. The first unoptimized production pass was about 28 fps in Balanced; baking AO and reducing effects/shadow cost restored roughly 60 without dropping its resolution. Historical comparison: [before optimization](evidence/world-rebuild/performance-before-optimization.json).

**High does not meet the 60 fps target on this Mac.** Balanced is the smooth retina demo preset. Physical mid-phone 30 fps has not been established.

## Images and recording

Before: [desktop DPR 2](evidence/world-rebuild/before/world-1440-dpr2.png), [phone DPR 2](evidence/world-rebuild/before/world-390-dpr2.png).

After: [desktop contact sheet](evidence/world-rebuild/contact-1440.png), [phone contact sheet](evidence/world-rebuild/contact-390.png). Contact sheets are thumbnails; original screenshots below retain DPR 2.

| View | 1440×900, DPR 2 | 390×844, DPR 2 |
|---|---|---|
| Opening | [Desktop](evidence/world-rebuild/after/opening-1440-dpr2.png) | [Phone](evidence/world-rebuild/after/opening-390-dpr2.png) |
| Neural | [Desktop](evidence/world-rebuild/after/neural-1440-dpr2.png) | [Phone](evidence/world-rebuild/after/neural-390-dpr2.png) |
| Rocket | [Desktop](evidence/world-rebuild/after/rocket-1440-dpr2.png) | [Phone](evidence/world-rebuild/after/rocket-390-dpr2.png) |
| Attention | [Desktop](evidence/world-rebuild/after/attention-1440-dpr2.png) | [Phone](evidence/world-rebuild/after/attention-390-dpr2.png) |
| Traffic | [Desktop](evidence/world-rebuild/after/traffic-1440-dpr2.png) | [Phone](evidence/world-rebuild/after/traffic-390-dpr2.png) |
| Time dilation | [Desktop](evidence/world-rebuild/after/relativity-1440-dpr2.png) | [Phone](evidence/world-rebuild/after/relativity-390-dpr2.png) |
| Speaking (local fixture) | [Desktop](evidence/world-rebuild/after/speaking-neural-1440-dpr2.png) | [Phone](evidence/world-rebuild/after/speaking-neural-390-dpr2.png) |

Each other topic also has a `speaking-{topic}-{width}-dpr2.png` in the same folder. Additional captures show the [full neural lattice](evidence/world-rebuild/after/neural-lattice-1440-dpr2.png), [45-car wave](evidence/world-rebuild/after/traffic-wave-1440-dpr2.png) and [ticking clocks](evidence/world-rebuild/after/relativity-ticking-1440-dpr2.png).

Native pixel crops were reviewed without enlargement: [SDF numerals](evidence/world-rebuild/crops/sdf-numerals-native.png), [word type](evidence/world-rebuild/crops/word-type-native.png), [rocket edges](evidence/world-rebuild/crops/rocket-edge-native.png), [speaking guide](evidence/world-rebuild/crops/petros-speaking-native.png), [cars/ribbon](evidence/world-rebuild/crops/cars-ribbon-native.png). The canvas, text and silhouette edges are sharp. The result is a coherent stylized diorama; professional Pixar-level character/art direction is not asserted as a measured achievement.

[Full tour and controls recording](evidence/world-rebuild/video/tour-and-controls.webm) — a real browser recording, including stop/free-explore checks after the two-minute sequence; no provider voice is claimed in this recording.

## Assets and changed files

[ASSETS.md](ASSETS.md) lists every new asset family, provenance, font/software notices and rights. [Asset inventory](evidence/world-rebuild/assets.json) records bytes, actual compression extensions, 2K/1K texture dimensions and mip chains, geometry, bones and clips. [Authoring instructions](art/README.md) accompany editable Blender sources.

The presentation implementation is in `world-v3/`: `WorldExperience`, `CameraRig`, `PetrosGuide`, `Heroes`, `PlacePreviews`, `Particles`, asset/SDF loading, rendering/quality, world state, spatial anchors, audio and HUD styles. Integration touches `components/LiveTeachingSurface.tsx`, `app/layout.tsx`, the two audio taps, the prototype launcher and scoped package files. New tests, evidence, authored assets and documentation are contained in `prototype/v2`. [Exact presentation file manifest](evidence/world-rebuild/files-changed.json). The only new main-platform edit is the permitted minimal `apps/student-web/src/app/prototype/page.tsx` entry forwarding: local development opens the isolated world, while production can opt in with `PETROS_V2_ORIGIN`. Existing platform React 18 dependencies and legacy access implementation are preserved. [Browser route verification](evidence/world-rebuild/route-results.json).

## Remaining acceptance / next steps

1. Reduce High's screen-effect/HDR rendering cost further before claiming 60 fps in High. Keep Balanced for the laptop demo.
2. Run on a physical mid-range phone and Safari/iOS, including hardware speakers, microphone conditions and touch exploration. Headless phone-sized screenshots are not that test.
3. When the user chooses to restore provider credit/configuration, rerun live AI, speech and microphone acceptance. The key is intentionally blank now; no provider behavior was fabricated or replaced with fixture content in production.
4. Obtain the unfamiliar learner feedback already offered, and a human visual review on the actual YC laptop. The authored models are coherent and rigged but have not received a professional character artist's manual cleanup/animation pass. The old page-specific browser scripts also need selector migration before they can be counted as passing against this new interface.
