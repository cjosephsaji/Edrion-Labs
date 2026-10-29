# Petros expressive artwork audit and handoff

11 October 2026, Asia/Kolkata. **Natural idle animation and independent facial/body articulation: REQUIRES ADDITIONAL ARTWORK.**

The existing Petros identity remains the reference: cream face, dark green hood/body, leaf crest, brown book, short limbs, shoes, rounded proportions and restrained friendly expression. No character replacement or image generation was performed.

## What was inspected

The nine repository Petros PNGs were inspected using the [existing full contact sheet](../m0p-expressive/existing-art-inventory.png), with idle, listening, thinking and talking also inspected individually at their native resolution. [The inventory](artwork-inventory.json) records every file's current hash, dimensions and byte size. The eight state exports use a common 384 × 512 RGBA canvas; the original pointing reference uses 724 × 760. Existing pose landmarks and limb positions differ substantially. Thinking/talking have detached edge fragments and idle has a fragment below its feet; replacement masters should clean these after identity review.

A repository scan for editable SVG, PSD, AI, XCF, KRA, ORA, Aseprite, Blend, Affinity, EPS, Figma and Sketch sources found no editable artwork. Available supplemental asset locations were checked for named Petros sources without locating additional masters. This establishes the available workspace boundary; it does not establish that an artist's original master does not exist elsewhere.

Each alpha channel isolates a complete silhouette. It does not provide independent eyes, eyelids, brows, mouth, head, arms, hands or a clean surface behind them. Moving a cut-out eye or limb would expose holes requiring repainting. Different full-body poses cannot provide compatible anatomical interpolation. The V1 `petros-speaking-avatar.tsx` paints a guessed SVG mouth over the raster and toggles it with a timer; that approximation is preserved in V1 and is not used by this rig.

All nine PNG byte contents are preserved. No guessed pivots, skin patches, artificial eyelids, extracted facial layers or generated artwork were introduced.

## Working behavior and remaining controls

| Feature | Classification | Genuine behavior |
| --- | --- | --- |
| Static authored expressions | IMPLEMENTED AND TESTED | Neutral, listening, source-check/thinking and talking PNG poses. They are complete images. |
| Directional teaching cue | IMPLEMENTED AND TESTED | Four authored cardinal poses admitted only for the latest accepted action and its visible current highlight/focus. One bounded reaction per action; no precise finger contact. |
| Pose transition | IMPLEMENTED AND TESTED | 240 ms browser opacity crossfade between mounted whole images during active teaching. Cancellation, assessment-safe mode and reduced motion remove transitions immediately. This is not skeletal articulation. |
| Real audio state | IMPLEMENTED AND TESTED with local event tests | Actual shared presentation `speaking` selects the static talking image after any admitted point settles. Preview playback uses the same owner. Loading, stall, pause and stop remove the speech image. No mouth movement is claimed. |
| Quiet idle and student work | IMPLEMENTED AND TESTED | Static neutral rest, no repeating gesture, dialogue or additional animation timer. |
| Natural blink/gaze/brows | REQUIRES ADDITIONAL ARTWORK | No real controls are available. A still image moving vertically would not satisfy this requirement. |
| Independent head/posture/breathing | REQUIRES ADDITIONAL ARTWORK | No separable complete head/body surfaces or approved pivots exist. |
| Mouth/audio-reactive articulation or visemes | REQUIRES ADDITIONAL ARTWORK | No mouth-shape exports. The talking pose has one painted mouth. Phoneme-accurate timing also requires provider timing support and validation. |
| Articulated arms/hands, precise pointing, writing | REQUIRES ADDITIONAL ARTWORK | No complete overlap layers, pivots, fingertip or pen contact anchors. |

Unit tests validate admission, cancellation and accessibility. They do not prove visual naturalness. The idle acceptance test must remain artwork-blocked even if a 60-second recording confirms quiet stable rest.

## Required source package

Deliver one editable master and transparent layers on one **384 × 512 viewBox**, consistent baseline, scale, shading and landmark placement. Every moving part needs complete paint behind overlapping parts. Coordinates below must be supplied by the artist; none should be guessed from the raster.

| Export group | Required layers/variants | Required anchors, masks and limits |
| --- | --- | --- |
| Neutral assembly | Identity-approved face/head, hood/body, crest, book, limbs and shoes with clean hidden surfaces | Rest transforms, parent/layer order, body baseline, full assembly reference export |
| Eyes and eyelids | Left/right whites, iris/pupil, upper/lower lids with open, half and closed shapes | Eye centers, aperture masks, eyelid z-order, gaze bounds, reviewed blink close/hold/open durations |
| Brows | Independent left/right brows and clean face beneath | Rest transforms, pivots, translation/rotation limits; neutral assessment-safe combination |
| Mouth | Closed/rest, small, medium and rounded shapes with clean underlying face | Mouth origin, bounding box, z-order and allowed shape combinations; optional viseme mapping only if authored |
| Head and body | Complete separate head/body and neck overlap | Neck/body pivots, local transform hierarchy, modest head range and artist-approved breathing deformation |
| Arms and hands | Left/right shoulder, upper arm, forearm, wrist and hand, with palm/finger variants and complete overlap paint | Shoulder/elbow/wrist pivots, front/back layering, reach limits, rest and cardinal point reference assemblies |
| Context expressions | Neutral, attentive, checking, curiosity, gentle acknowledgment, waiting and uncertainty variants | Reviewed semantic meaning, neutral fallback and reduced-motion equivalent. Avoid exaggerated reactions and constant celebration. |
| Teaching contact | Point-to-rest sequence; optional pen/grip start/contact/travel/lift/settle sequence | Fingertip/pen-tip anchors, reach and clipping limits. Writing also needs reviewed stroke data before admission. |

Include source/license/provenance, stable layer IDs, SHA-256 hashes, authored pivot coordinates, anchor coordinates and timing/range metadata. The expected accepted runtime export is `apps/student-web/public/petros/v2/rig/layers.svg`; conditional teaching sequences may use `teaching-poses.svg`. These files have deliberately not been created as placeholders. The current manifest retains empty `layers`, `pivots` and `contactAnchors` and explicitly enumerates unsupported controls and missing exports.

## Acceptance and integration

Compare the neutral assembly against the approved master at native resolution and at the current desktop/mobile avatar sizes. Verify face landmarks, no exposed holes during blink/gaze/head movement, eye-mask clipping, mouth alignment, limb occlusion and clean transitions back to rest. Test each control independently and missing-layer fallback. Artist/identity review is required before enabling a capability; adding a capability string alone is insufficient.

Extend the existing manifest, pose policy, companion controller and renderer. The existing presentation owner and epoch remain authoritative. Bind future idle sampling to that owner rather than introducing a second playback clock. Revoke gestures and future mouth motion on stop, pause, microphone start, target removal, hidden page and epoch change. Assessment-safe mode stays neutral and reduced motion uses the reviewed static rest assembly.

The highest-value next art delivery is a compatible neutral assembly with real eyelids, pupils, mouth shapes and a head/body split. That package unlocks calm blinking, occasional bounded gaze, audio-reactive mouth approximation and small posture changes without changing Petros's identity or the approved canvas.
