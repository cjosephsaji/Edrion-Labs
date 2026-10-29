# Original Petros: technical-art feasibility

25 October 2026. Source audit and future production requirements. **No 3D model or
new artwork was produced.** The rejected replacement remains inactive.

## Verified inventory

[Machine-readable inventory](original-art-inventory.json) was generated from the
actual PNG files with Pillow. All eight selected pose hashes match the active
manifest. Each is PNG, 384 × 512 pixels, RGBA, with alpha ranging from 0 to 255.
Transparency isolates a complete pose; it does not separate the face or limbs.
The original neutral file was also visually inspected.

| Current selected pose | Exact public source |
| --- | --- |
| Neutral | `/petros/states/petros-idle.png` |
| Listening | `/petros/states/petros-listening.png` |
| Thinking | `/petros/states/petros-thinking.png` |
| Static talking | `/petros/states/petros-talking.png` |
| Point right | `/petros/states/petros-point-right.png` |
| Point left | `/petros/states/petros-point-left.png` |
| Point up | `/petros/states/petros-point-up.png` |
| Point down | `/petros/states/petros-point-down.png` |

These paths map to `apps/student-web/public/` in the repository. A ninth historical
reference, `apps/student-web/public/petros/petros-pointing.png`, is a 724 × 760 RGBA
PNG. The neutral source hash is
`26fa3a0d8f831d19388a40aa6bb3a22d42e11535e18e5fff1d30236ce0584ec6`.

The active manifest is `apps/student-web/public/petros/v2/rig/manifest.json`, version
`petros.original-png.v6`, renderer `original-authored-poses`. Its approved animation
clip list, layer list, pivots and contact anchors are empty. The artwork gate is
`blocked-missing-faithful-layers`; accepted layer hashes are empty.

Repository asset search found no PSD/PSB/AI, Blender, FBX, GLB/GLTF, OBJ, KRA or ORA
master in the searched source/art tree, excluding generated output, dependency
trees and archived before-copies. This is a repository inventory, not proof that an
artist's external master does not exist. No external master was supplied here.

Editable SVGs do exist under `docs/verification/petros-v2/avatar-art/m6/`, including
`petros-master.svg`, front expression studies and `three-quarter-study.svg`.
Runtime candidate exports and `layers.svg` exist in `public/petros/v2/rig/`.
They are the **user-rejected redesign**, not recovered original character layers.
`candidate-rejected.json` and the existing art handoff retain that audit history.
Their editability does not authorize using them as original art or a 3D base.

## Current usable capabilities

Classic can show the complete neutral original at its preserved aspect ratio.
Four whole-pose pointing images are available only when admitted by the existing
current-target/geometry controller. Listening and thinking are whole authored
images. Actual existing audio can select a static talking image; it is not lip sync.
For this cycle, neutral original artwork is the safe default with contextual clouds.

The current assets cannot perform independent blinking, eye gaze, mouth shapes,
head turns/nods, articulated arms, precise hand contact, writing, sitting/standing
transitions, walking or a faithful continuous 3D turn. Do not create these effects
by sliding, stretching or rotating the flattened image or adding facial overlays.
Historical documentation notes detached raster fragments at some image boundaries;
retain original bytes and have an artist review any future cleaned export.

## Art required for faithful reconstruction

1. Obtain the genuine editable original master if available, source provenance and
   intended materials/colors. Confirm the face, leaf crest, green silhouette,
   cream features, eyes, footwear and accessories against the original references.
2. Commission identity-approved front, side, rear and three-quarter turnarounds,
   proportion and scale sheets, expression limits, and seated/rest poses. Existing
   front PNGs do not define hidden side/back surfaces or reliable body volume.
3. Reconstruct full head/body/limb surfaces, hands and all occluded geometry, using
   the original character as reference. Approve untextured shape and then shaded
   materials at actual desktop/mobile display sizes before animation work.
4. Supply editable 3D source and a browser-suitable export, plus texture/material
   maps, UVs, units, orientation, bounds, origin, attachment points and provenance.
   The export format/renderer must be selected against real production constraints.
5. Rig hips/spine/head, shoulders/elbows/wrists, hands, legs/feet and required facial
   controls. An artist must supply rest pose, joint hierarchy, deformation limits,
   reach/contact anchors and approved facial blend/morph controls where supported.
6. Author and approve rest, sit/stand, turn, walk/start/stop, station-facing,
   pointing and return-to-rest clips. Include safe transitions/interruption poses,
   ground/foot contact and reduced-motion alternatives. Writing and lip sync need
   separate appropriate artwork, timing/contact data and acceptance.

These are missing deliverables, not capabilities inferred from controller enums.

## Browser and performance requirements

Require GPU/browser compatibility checks, bounded loading, context-loss recovery,
deterministic disposal and fallback to Classic. Commission texture/geometry/LOD
variants suited to measured target-device GPU memory and frame-time budgets. Test
transparency/material fidelity, mobile readability, low-power devices and large
text. Keep the accessible React workspace independent of the scene.

No fixed transfer/memory/FPS budget is claimed without representative-device
measurements. World assets must be excluded from Classic's critical path and
downloaded only after explicit opt-in. The current 2D source sizes are not a 3D
performance estimate.

## Approval gate

Record product-owner approval of identity, silhouette, proportions, face, materials,
all required views and every activated pose/clip. Store exact accepted hashes and
rig capabilities in a versioned manifest. Test station reach, contact correctness,
interruption, missing clips, reduced motion and mobile/desktop readability before
enabling a capability. The prior rejected candidate has no accepted layer hashes.

**World remains blocked on faithful approved original-character art.** A room with
a different model or a moving PNG would not satisfy that dependency.
