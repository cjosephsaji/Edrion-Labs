# Petros World asset register

All new runtime assets are self-hosted in `public/world-v3`. No paid asset, generative 3D service or third-party game character was used. Source files and repeatable Blender authoring scripts live in `art/`. These models were constructed through Blender scripting, reviewed through Blender renders and browser screenshots, and revised for framing; they are not claimed to have received a professional character artist's manual sculpt/retopology pass.

| Runtime asset | Authorship and source | License / rights |
|---|---|---|
| `petros.glb`, `petros-low.glb` | New modeled seed/leaf guide, based on the user's existing Petros identity; `art/petros-guide.blend`, `art/build_world.py`. Seven-bone rig, eight clips, Blink/MouthOpen morph targets. | Project-authored work. Existing Petros identity, mascot and brand rights remain with their owner. No new CC0 dedication or third-party license is asserted. |
| `archipelago.glb` | New floating islands, bridges, pavilion, planters, workbench, launch deck, toy city, instrument arches. `art/archipelago.blend`, `art/rebuild_environment.py`. | Project-authored work, retained under this repository's applicable terms. |
| `rocket*.glb` | Original rounded rocket, porthole, fins, hinged legs and nozzle. `art/rocket.blend`. No NASA mesh is loaded by the new world. | Project-authored work. |
| `car*.glb` | Original toy car with separate modeled cabin, glazing, axles, tires and lamps, flattened to one vertex-color material for instancing. `art/car.blend`. | Project-authored work. |
| `ship*.glb`, `light-clock.glb` | Original spacecraft and matched two-mirror clock instrument. `art/ship.blend`, `art/light-clock.blend`. | Project-authored work. |
| `planet.glb` | Original stylized planet with modeled continents and polar caps. `art/build_planet.py`. | Project-authored work; illustrative geography. |
| `cloud.glb`, `word.glb`, `node.glb` | Original remeshed cloud, beveled word capsule and scientific node. `art/build_cloud.py`, `art/build_world.py`. | Project-authored work. |
| Embedded hero/environment AO maps | 2048×2048 Cycles-baked linear occlusion, UASTC/KTX2 with mip chains. Low hero variants use 1024×1024. Sources: `art/*-ao-2k.png`, `art/bake_hero.py`, `art/bake_environment.py`. Color is supplied by a shared vertex palette, not low-resolution image text. | Project-authored work. |
| `environment.hdr` | Greg Zaal, [Studio Small 03, Poly Haven](https://polyhaven.com/a/studio_small_03), 1K HDR reused from the existing licensed prototype assets. Image-based fill lighting; the visible sky is a new shader. | [CC0](https://polyhaven.com/license). |
| `fonts/display.ttf` | DM Serif Display, Google/Adobe authors, [upstream](https://github.com/google/fonts/tree/main/ofl/dmserifdisplay). | SIL OFL 1.1; complete notice in `fonts/DMSerifDisplay-OFL.txt`. |
| `fonts/ui.ttf`, `fonts/ui-sdf.ttf` | Outfit Project Authors, [upstream](https://github.com/Outfitio/Outfit-Fonts). `ui-sdf.ttf` is a static weight-450 instance of the variable font, generated with FontTools for Troika compatibility. | SIL OFL 1.1; complete notice in `fonts/Outfit-OFL.txt`. |
| `basis/basis_transcoder.js`, `.wasm` | Basis Universal, Binomial LLC and contributors; copies distributed with Three.js 0.170.0. | Apache 2.0, notice in `licenses/basis-Apache-2.txt`. Three.js is MIT; notice in `licenses/three-MIT.txt`. |
| Ambient sound, UI chime, plume, sky, energy and photon effects | Original WebAudio synthesis and shader code. No music recording or sampled sound asset. | Project-authored work. |

R3F/drei, Troika, Zustand, postprocessing, N8AO and glTF Transform use their included open-source licenses. GSAP 3.15 uses its [standard no-charge license](https://gsap.com/standard-license/); no paid plugin or competing visual animation authoring product is included. Blender 4.5.3 LTS (GPL software) and KTX-Software 4.4.2 (Apache-2.0 tools) were local authoring tools, not runtime downloads. Rapier was unnecessary: lesson motion remains driven by the preserved numerical engines.

`evidence/world-rebuild/assets.json` records actual runtime sizes, geometry counts, compression extensions, texture dimensions/mip levels, bones and animation clips. `*-proxy.glb` are geometry-only overview LODs, with detailed 2K/1K heroes loaded only on arrival. The older `public/atelier/ASSETS.md` remains the provenance for the previous presentation, whose models are preserved but no longer loaded here.

The speech verification uses macOS `say` audio generated only in `/tmp/petros-world-speech` and intercepted by Playwright. No Apple voice recording is shipped. This is a local QA fixture, not provider acceptance evidence.

## Neural Stage (Phase 1)

`stage/NeuralSpecimen.tsx` builds its copper/glass/steel meshes procedurally; no new GLB, image service, sampled sound or paid asset is needed. `stage/Studio.tsx` generates neutral PMREM lighting from Three's bundled RoomEnvironment. The Stage reuses the existing Petros display/Outfit fonts above; `public/stage/fonts/website-mono.woff2` copies the website's JetBrains Mono Latin font (SIL OFL; notice alongside it).

The approved source is archived unchanged at `reference/petros-stage.html`. `public/stage/fonts/{display,ui,mono}.ttf` are self-hosted Fraunces/Geist/Geist Mono used by the reference capture only, with their OFL notices and source in that folder. The Stage's actual website-aligned palette imports `packages/design-tokens/src/tokens.ts`. Fresh captures and measured quality results live at root `audit-screenshots/stage/`; see `STAGE_NOTES.md`.

## Rocket landing Stage

`stage/RocketSpecimen.tsx` creates the lander's rounded pressure vessel, porthole, tanks, nozzle, articulated legs, throttle lever, pad and height/force instruments procedurally. Static lander meshes are merged by four materials. The plume is a local additive shader; its UV is clamped before fractional powers to keep the HDR bloom pass finite. It uses the same fonts, shared website palette, PMREM studio and quality presets as Neural. No installed dependencies or external runtime assets were added. Evidence is at root `audit-screenshots/stage-rocket/`; decisions and measurement limits are in `ROCKET_STAGE_NOTES.md`.


## Attention Stage

`stage/AttentionSpecimen.tsx` renders procedural rounded glass word tablets, merged weighted tubes, instanced value-flow dots, a causal-mask marker and a signed four-value context mixer. Words, percentages and vector panels are local canvas print textures using the existing UI font. `stage/StagePlinth.tsx` supplies a reusable procedural pedestal. No new fonts, GLBs, dependencies, network assets or paid services were added. Captures are at root `audit-screenshots/stage-attention/`; see `ATTENTION_STAGE_NOTES.md`.

## Traffic waves Stage

`stage/TrafficSpecimen.tsx` builds a beveled copper-edged ring road, instanced rounded cars and lights, a vertex-colored speed ribbon, glass mean-speed gauge, following-time dial, measured gap bracket and actual-position traces. The road maps the existing 350 m simulation around a 2.48-unit radius. Colors interpolate committed car speeds; they do not simulate motion. `stage/print-texture.ts` creates instrument lettering from the existing local fonts. Balanced uses clear alpha physical glass and a restrained mirror; High uses native transmission. Key shadows fall on the road, with redundant shadow reception disabled on the plinth and mirror. No new packages, runtime downloads or external assets were added. Evidence: root `audit-screenshots/stage-traffic/`; decisions: `TRAFFIC_STAGE_NOTES.md`.

Traffic’s `CappedBloomEffect` uses five blur levels and caps the luminance/blur buffers at the equivalent of 512 px across the full film height. At wide desktop sizes the canvas renders only the hero region, preserving the full-window camera projection and subject pixel scale at DPR2/HalfFloat/4× MSAA. At 1440×900 the canvas is 1140×620 CSS pixels; soft edge masks blend it into the studio. Phones and earlier lessons keep their full canvas. Balanced color SMAA omits an unused depth dependency and skips its MSAA depth resolve; depth testing remains on, with resolved depth restored for High AO. Both use the existing postprocessing integration and require no new assets or packages.

## Time dilation Stage

`stage/RelativitySpecimen.tsx` builds two procedural glass/copper chronometers, merged clock cases and dial ticks, common-scale time markers, a knurled speed dial and an etched light-cone/worldline instrument. Local print textures reuse the existing fonts, with optional rectangular canvas dimensions for wide plaques. No new package, asset download, paid service or external texture was added. Numerical readings and prepared frames use the existing relativity engine; the coordinate instrument calls its existing Lorentz transform. Balanced uses clear inexpensive glass and a faint flipped reflection; High uses transmission. The desktop hero-canvas/bounded-bloom policy is reused from Traffic. Evidence: root `audit-screenshots/stage-relativity/`; decisions: `TIME_DILATION_STAGE_NOTES.md`.
