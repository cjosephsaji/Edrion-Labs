# Original Petros — faithful layer production handoff

21 October 2026. **Artwork gate BLOCKED. Original PNGs remain the default. No reconstructed layer or clip has been accepted.**

The [immutable reference sheet](original-reference.html) shows all eight approved poses at 96, 160, 256 and 512px image height. [Inventory](original-inventory.json) includes their exact hashes, dimensions, decoded alpha counts, pose use and unavailable anchors. The green shell, cream face, leaf crest, gold trim, gloves, boots, soft painted shading, proportions and silhouette are the source of truth. The rejected vector candidate is not a reference for this handoff.

No new artwork was generated. The PNGs contain complete painted faces and bodies, with binary transparency. Cropping an eye, mouth or arm would leave painted remnants or holes; moving it would expose missing shaded surfaces. Complete underlying surfaces and meaningful joint pivots cannot be recovered from these flattened files by a faithful cutout operation. This is an artwork/input limitation, not a claim that independent controls were implemented. No synthetic eyes/mouth, whole-image nod, PNG walking or rejected vector part is admitted.

## Editable source and export contract

Deliver an artist-authored layered source (PSD, Krita or equivalent) using the original 384×512 coordinate system, plus matching runtime PNG layers or trusted SVG with raster imagery. Preserve the original images alongside derivatives, never in place. Every export needs a hash, layer ID, exact bounds, stacking order, attachment/occlusion mask and artist-reviewed pivot/range. The image origin is (0,0); the face center, foot baseline and joint coordinates must be measured from the approved reconstruction, not borrowed from the rejected candidate. The active manifest intentionally leaves those unavailable values null.

| Missing control | Required faithful material | Acceptance evidence |
| --- | --- | --- |
| Independent head | Complete head/crest and complete body/neck behind it; neck overlap mask | Same neutral silhouette; bounded pivot sweep with no exposed gap |
| Gaze | Separate original eye whites, pupils/irises; clean underlying face; aperture masks | Both eye centers, clipping and ±bounded gaze, no duplicate painted eyes |
| Blink | Faithful open, half and closed lid shapes for each eye; clean eye underlay | 120–220ms close/open at 96/160/256/512px; no identity or contour jump |
| Brows | Complete original brows plus clean shading beneath | Neutral, attentive, thoughtful, pleased, uncertain combinations aligned to the same face |
| Mouth | Clean face; closed/small/medium/rounded shapes with original lighting | Exact mouth origin and masks; no painted smile beneath a second mouth; silent state closed |
| Arms/hands | Complete torso/shoulder underlays; left/right upper arm, forearm and glove layers; elbow/wrist overlap masks | Stable shoulder/elbow/wrist coordinates; rest and cardinal point sweeps; no disconnection |
| Open hand/nod/settle | Reviewed clips using those genuine layers | One short motion, rest recovery, before/after identity comparison |
| Short dock transition | Reviewed compatible settled transition and footprint | 250–450ms local reposition with the entire caption footprint in the safe harbor |
| Walking | Actual directional walk cycle, grounded feet and facing clips | Safe route, foot contact and settle; until accepted, stay HOME |
| Writing | Pen/grip/contact/lift layers, contact anchor, stroke data and reach bounds | Hand follows actual accepted stroke progress; otherwise retain font reveal/highlight |

## Review sequence

1. Match the neutral assembly to each original reference at full resolution and small sizes. Inspect face geometry, eye placement, crest, shading, trim, gloves, boots, silhouette and baseline.
2. Review five aligned expressions and every separate layer on light/dark backgrounds. Verify complete underlays, seams and occlusion.
3. Inspect blink/gaze/head/mouth separately, then combined. Review every gesture return to rest, and the mobile preview.
4. Publish a genuine uninterrupted comparison/sampler recording from the existing shared renderer with the candidate **opt-in only**. No candidate may become the default as part of a screenshot test.
5. The product owner must approve specific source/export/clip hashes before activation. If identity or quality is worse, keep originals active. Automated fallback tests never supply that approval.

Accepted new layer/clip hashes: **none**. Required reconstructed expressions and physical motion: **unavailable**. M7: **not started and not authorized by this handoff**.
