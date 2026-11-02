# Atelier design direction and motion evidence

Direction: a warm modern science library, with pale plaster, weathered timber, muted sage structure, brass scientific annotations and a continuous central gallery. Furniture, books, plants, vehicles, the rocket and spacecraft are imported licensed models. Abstract neural and attention installations are teaching instruments, rather than substitutes for finished furniture. The original Petros stays at a deliberate 2D teaching anchor beside the scene; no PNG walking or false lip synchronization is used.

The connected floor plan has the library on the west wall, four discoverable laboratories across the north gallery, and an observatory at the east window. A central rug, brass inlay and skylight beams connect the stations. All five have direct quick travel; each also has a model action at the workbench and the same full controls available in Focus.

Material treatment: 1k Poly Haven wood floor color/normal/roughness maps; original imported PBR furniture maps; HDR image lighting; a warm key light and cool fill; tone mapping; contact/cast shadows. Device-pixel ratio is capped at 1.5, with a lighter 1× option. Shared imported geometry/textures are cloned only for transforms. Model bounds are measured after decoding and orientation normalization. Asset provenance and license details are in `public/atelier/ASSETS.md`.

## Architectural shots

The arrival view, close neural workbench, launch bay and other station captures are recorded in `motion/`. These are actual rendered browser images, not concept renders or an assertion of independent design approval.

## 16-second motion storyboard for each location

The six `.webm` files in `motion/` show the actual application. Their actual duration and names are recorded in `motion/storyboard.json`.

| Time | Arrival gallery | Each laboratory |
|---|---|---|
| 0–3 s | Load Focus and enter the connected atelier | Enter the same connected atelier and select the station |
| 3–7 s | Establish the rug, library, skylight and visible lab landmarks | Travel through the central clear waypoint, then ease into a dedicated station view |
| 7–11 s | Hold the architecture and discovery map | Petros orients the learner and highlights the real semantic object |
| 11–16 s | Keep all five destinations discoverable | Explain, demonstrate with computed state, and wait for a learner prediction |

Camera rotation/zoom controls and keyboard arrows remain available. Reduced-motion preference removes travel easing. Camera projection recalculates pointer bounds every frame; it never uses guessed screenshot coordinates. `interactions.json` records the actual alignment checks after camera motion and zoom.

Human comprehension feedback is recorded separately, only when an actual unfamiliar learner supplies it. No learner feedback or hardware voice result is inferred from these recordings.
