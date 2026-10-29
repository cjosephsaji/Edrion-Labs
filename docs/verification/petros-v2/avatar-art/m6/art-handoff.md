# M6 layered Petros candidate — art and motion handoff

Authored 20–21 October 2026. **Rejected by the user on 21 October 2026. The original Petros artwork is selected and restored.** This is a new hand-authored vector candidate based on the existing Petros references. It is not an extraction of hidden raster layers or an assertion that an artist approved the result. Original PNGs and the historical M0-P handoff remain unchanged.

## Deliverables

- `petros-master.svg`: editable front-view master. Geometry, gradients, layer groups and anchors can be edited directly. The head/face under the facial controls is clean; painted eyes, brows and mouth do not remain under replacement features.
- `three-quarter-study.svg` / `.png`: separately authored reference study with a visible shell side plane, asymmetric face, near/far eyes and limb geometry. This is unapproved reference art, not a runtime turning capability.
- Five front-view expression studies (`neutral.svg`, `attentive.svg`, `thoughtful.svg`, `pleased.svg`, `uncertain.svg`) and aligned runtime PNG exports in `apps/student-web/public/petros/v2/rig/`.
- Runtime `layers.svg`, a local trusted group library plus neutral reference assembly, and a versioned capability manifest with SHA-256 pins.
- The live Studio, Companion Playground and sampler now render only the original PNG poses. This candidate has no active route. The former recordings remain archived engineering evidence of the rejected artwork. Its metadata is retained in `apps/student-web/public/petros/v2/rig/candidate-rejected.json`; `manifest.json` describes the selected originals.

## Geometry and supported candidate controls

All runtime art uses `viewBox="0 0 384 512"`, origin `(192,470)` and baseline `470`. Neck/head pivot `(192,326)`; shoulders `(112,251)` and `(272,251)`. Eye centers `(155,208)` and `(231,211)`; mouth `(193,272)`. Anchor metadata is checked against the hashed source before admitting the layered renderer. The manifest is authoritative for limits, ordered groups, expression combinations, mouth shapes, direction vocabulary and cloud attachment metadata.

Head rotation is bounded to four degrees. Gaze is bounded to four horizontal and three vertical SVG units, with eye-aperture clipping. Brows and mouth stay inside the same head group. Blink closes the authored eyes/lids on a twelve-second cycle, approximately 150ms for the closed portion. No screen-reader announcements occur per frame. Arms are overlapping authored rest/open/point clips; directional pointing selects those local clips and a bounded shoulder rotation. It does not promise arbitrary fingertip reach or contact with the canvas. Nod is one 940ms head clip. The static book remains an accessory, not a writing tool.

The mouth has closed/small/medium/wide shapes. Passive RMS sampling of the sole existing player's decoded media selects them with smoothing. Silence, stop, mute, missing analysis and reduced motion close the mouth. This is amplitude animation. No phonemes, word timing, new speech provider, new microphone route or M7 transport was added.

## Still required from visual review / art production

1. **Human identity/quality approval** of this candidate's flatter vector finish, silhouette, proportions, cream/green/gold palette, book, subtle expressions and small-size readability. Reject or request refinements before accepting M6's art gate.
2. **Review the authored three-quarter study.** It uses separately drawn volume, face, eyes, limbs and book geometry, rather than compressing/mirroring the front image. It needs identity/perspective review. Aligned runtime turning layers remain unavailable.
3. Review every directional/open-hand/acknowledgment clip for shoulder overlap, hand readability and gesture meaning at 360/280/180/102/78/48px, including light/dark backgrounds and 200% zoom. Current engineering inspection is not human sign-off.
4. Accurate writing requires new pen/grip/forearm/contact/lift layers, pivots/reach bounds, authored stroke data and timeline qualification. It remains unavailable. Walking, articulated fingers, precise fingertip contact, phoneme sync and breathing deformation remain unavailable.
5. Physical device, assistive technology and learner experience review remain pending. Follow `human-evaluation-protocol.md`; no participants or survey results are invented.

## Acceptance record

Decision: **rejected by the user**. Review date: **21 October 2026**. Accepted candidate asset/clip hashes: **none**. Requested change: **continue using the original avatars**; implemented in the shared Studio and Playground renderer. No further art production is authorized by this record. M7 authorization: **not granted**.
