# Petros World presentation audit — 2 November 2026

Scope: presentation only in `prototype/v2`. Preserve current simulation/teaching/state/voice/AI behavior. No deploys, pushes or paid dependencies. This audit precedes implementation of the full-world rebuild.

## Confirmed causes

1. **The canvas is a page widget.** `components/LiveTeachingSurface.tsx`, `components/surface.module.css` and `world/atelier.module.css` put it inside a notebook plus sidebar. At 1440×900 / device DPR 2, the browser measured a **964.77×432 CSS-pixel canvas**, with a 1447×648 drawing buffer. On 390×844 it measured 342×280 with a 513×420 buffer. The desktop world uses roughly a third of the available viewport area.
2. **Retina resolution is deliberately discarded.** `world/Atelier.tsx` caps Balanced at DPR 1.5 and sets Light to 1. Device DPR 2 therefore loses about 44% of its potential rendered pixels. CSS is not currently stretching a smaller backing buffer beyond that cap; the confirmed fault is the cap and constrained canvas size.
3. **Text is raster artwork.** The `Sign` component draws labels into a 1024-wide `CanvasTexture`, frequently with short texture heights and small type. Perspective and zoom enlarge those fixed texels. There is no SDF text pipeline.
4. **Asset styles and texel densities conflict.** Photoreal worn wood/plants, a historical NASA rocket, a shuttle and a Kenney vehicle use different visual languages. Flooring is 1k JPEG, furniture uses WebP maps, and no KTX2/Basis hero pipeline is configured. Several platforms and fixtures are unrefined boxes/cylinders.
5. **Lighting/composition do not establish a diorama.** A bright rectangular studio, pale back wall, sparse foreground, flat signage and repeated furniture compete with the lesson hero. Shadows use one 2048 map, but there is no contact-occlusion pass or coherent matte palette.
6. **The camera is a position transition.** It lerps to a central waypoint and a fixed station pose, with limited yaw/zoom. There is no spline flight, authored opening reveal, guided two-minute tour or deliberate character/hero framing.
7. **Petros has no 3D presence.** The supplied identity is an original PNG with pose crossfades. No rigged Petros GLB, bones, character animation clips, eye look-at or audio-driven mouth exists in this presentation.
8. **Loading/quality are not a production pipeline.** One Suspense boundary loads every station and the whole furniture set. Browser resources total **12,033,452 decoded asset bytes** before per-place lazy loading. Quality only changes DPR; there is no progress scene, geometry/draw-call budget telemetry, or real effects/particle/shadow tiers. The render loop runs continuously and individual cars are separate imported scenes.

`antialias:true` and ACES tone mapping already exist and are worth retaining; the audit does not claim antialiasing is absent. Existing numerical engines and teaching contracts are not implicated in these presentation faults.

## Evidence

- [Desktop before, DPR 2](evidence/world-rebuild/before/world-1440-dpr2.png)
- [Mobile before, DPR 2](evidence/world-rebuild/before/world-390-dpr2.png)
- [Measured buffers and asset requests](evidence/world-rebuild/audit-measurements.json)

## Committed direction

One warm stylized floating archipelago: cream stone, deep green, soft wood, one accent per lesson. The browser is the world. A 3D Petros shares the frame with each hero. Use an authored Blender character/props, R3F + drei SDF text, a GSAP spline dolly, restrained postprocessing, GPU/instanced teaching effects, a small cream/glass HUD, and useful quality tiers. Keep the existing engines authoritative. Browser screenshots, edge crops, frame times, model budgets and asset licenses will be recorded against this baseline; no visual or performance target is claimed before measurement.
