# Petros M0-P character artwork handoff

11 October 2026. **Dependency handoff, not a completed articulated rig.** Preserve the cream face, dark green body/hood, leaf crest, brown book, eyes, smile, short limbs, shoes, proportions and friendly study-partner identity. The existing PNG files are the visual references; inspect the [contact sheet](../m0p-expressive/existing-art-inventory.png) at full size.

## Source audit and extraction decision

Nine PNG references exist: the original pointing image plus idle, listening, thinking, talking, and four pointing states. The eight state files use a 384 × 512 RGBA canvas. The original pointing image uses a different canvas. Their hands, face positions, silhouette and shading change between poses. No editable PSD, AI, layered SVG, facial alternatives, rig pivots, contact anchors or approved narration files were found in the repository asset inventory. The asset hashes are in the shipped rig manifest and the preservation audit confirms that every PNG is unchanged.

Alpha isolates each complete character from its background. It does not isolate eyes, eyelids, eyebrows, mouth, head, arms or hands from each other. Cutting an eye or moving an arm would leave painted holes and missing occluded surfaces; reconstructing those would require new character artwork. The existing V1 SVG mouth overlay paints over a raster smile using an approximate skin fill and a 135 ms toggle. It is an approximation, not legitimate source layers, and is not reused in M0-P. Reliable independent layers cannot be recovered from the available source without repainting. No anatomical pivots, blinking masks or joints have been invented.

Some rasters contain small detached fragments near the image boundary (including idle below the feet and talking at the sides). Clean these in the reviewed export master; keep the shipped files intact until replacement artwork is approved. Cross-pose silhouette differences also prevent truthful skeletal interpolation.

## Requested artist deliverables

| Capability | Real artwork needed | Required metadata and acceptance |
| --- | --- | --- |
| Rest and expressions | Reviewed neutral, attentive, thoughtful, curious/mild surprise and soft smile faces; no disappointed/shaming face | Same face scale, colors and landmarks; expression meaning reviewed; neutral usable in pending assessments |
| Blink | Separate left/right open, half and closed eyelids, with clean face underneath | Authored eye/eyelid anchors, z-order, allowed blink duration and aperture; no face-scale transform as a blink |
| Gaze | Independent pupil/iris artwork with eye whites and eyelid occlusion | Artist-defined eye centers, gaze limits and mask/clipping boundaries; left/right/up/down/rest checks |
| Eyebrows | Independent left/right brows plus face repair underneath | Rest transforms, pivots and safe rotation/translation limits; avoid changing character identity |
| Mouth | Closed/rest, small opening, medium opening and optional rounded shapes; clean underlying face | Mouth anchor and z-order; audio-level shapes only after playback data is real; phoneme mapping optional and separately validated |
| Head/posture/breath | Separate head/body with complete surfaces behind overlaps; reviewed resting variants | Neck/body pivots supplied by artist, rest transforms, modest reach/rotation/scale limits; no promise that whole-PNG sway is body articulation |
| Arms and hands | Left/right upper arms, forearms, wrists and hands with real overlap coverage; palm/finger variants | Shoulder/elbow/wrist pivots; front/back z-order; reach limits; rest, nod-associated, open-hand and cardinal pointing pose references |
| Teaching pointing | Reviewed left/right/up/down point-to-rest sequences; pointing finger clearly readable | Finger-tip anchor and feasible reach; no continuous precise contact until live coordinate mapping is verified |
| Writing/drawing (conditional) | Actual pen/grip plus start/contact/travel/lift/settle sequences | Pen-tip and hand contact anchors, reach limits and binding to the same canvas operation; handwriting additionally needs reviewed stroke/path data |

Deliver the editable source master and transparent exports on **one 384 × 512 viewBox**, one body baseline, consistent scale and naming. Every layer needs its full unclipped paint and clean occluded surface. Pivots and anchors use authored viewBox coordinates; do not supply guessed values. Export the identity-approved rest assembly for pixel comparison against the master.

Planned runtime files after art acceptance: `apps/student-web/public/petros/v2/rig/layers.svg`, optionally `teaching-poses.svg`, and an updated `manifest.json`. The current manifest deliberately has empty `layers`, `pivots` and `contactAnchors`. Supply layer IDs, parent/order, transforms, expression combinations, pivots/anchors, reach limits, reduced-motion resting equivalents, source/license/provenance and SHA-256 hashes. Assets must pass neutral assembly, eye/mouth alignment, limb occlusion, pose-to-rest, mobile readability, cancellation and missing-layer checks before the corresponding capability is enabled.

## Current implementation boundary

Implemented: complete authored pose selection, four cardinal directional cues, restrained opacity transition, a 700/820/940 ms gesture envelope, one gesture per action, a six-second cooldown, quiet rest/input states, playback-driven speech pose admission, missing-image recovery and neutral/highlight capability fallbacks. Whole-character PNG pose switches are the only body/expression controls currently available.

Artwork-dependent: natural blinking, independent gaze, eyebrows, mouth shapes/mouth opening, smiling transitions, head nods, independent breathing/posture/limbs, precise pointing/contact and writing. No layered file was generated and no rig-completion claim is made. Once source art is supplied, extend the existing manifest, policy and companion controller; keep the existing presentation timeline as the sole playback authority.
