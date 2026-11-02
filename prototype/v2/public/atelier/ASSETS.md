# Learning Atelier asset provenance

Acquired/reused 2 November 2026. All runtime assets are self-hosted; the page does not contact asset vendors. Original Petros PNGs remain unchanged in `/petros`.

| Files | Author / primary source | Permission |
|---|---|---|
| `rocket.glb` | NASA, [Explorer Jupiter-C Rocket](https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Explorer%20Jupiter-C%20Rocket) | NASA's repository describes its assets as free and without copyright; [usage rules](https://www.nasa.gov/nasa-brand-center/images-and-media/). Used as a historical display model for a hypothetical 1D landing experiment, not an authentic Jupiter-C landing system or NASA endorsement. |
| `shuttle.glb` | NASA, [Space Shuttle (A)](https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Space%20Shuttle%20(A)) | Same NASA usage rules. Illustrative spacecraft, not a claim that a shuttle can reach relativistic speeds. |
| `earth.jpg` | NASA Earth Observatory, [Blue Marble](https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_2048.jpg) | NASA imagery usage rules. |
| `car.glb`, `Textures/colormap.png` | Kenney, [Starter Kit Racing](https://github.com/KenneyNL/Starter-Kit-Racing) | The upstream README explicitly licenses included 3D assets CC0. No upstream gameplay code is included. |
| `WoodenTable_01.glb` | Ethan Place / [Poly Haven](https://polyhaven.com/a/WoodenTable_01) | CC0; reused from the existing licensed prototype asset set. |
| `wooden_display_shelves_01.glb` | James Ray Cock / [Poly Haven](https://polyhaven.com/a/wooden_display_shelves_01) | CC0; reused. |
| `book_encyclopedia_set_01.glb` | John Malcolm / [Poly Haven](https://polyhaven.com/a/book_encyclopedia_set_01) | CC0; reused. |
| `potted_plant_02.glb` | Rico Cilliers / [Poly Haven](https://polyhaven.com/a/potted_plant_02) | CC0; reused. |
| `mid_century_lounge_chair.glb` | Kuutti Siitonen / [Poly Haven](https://polyhaven.com/a/mid_century_lounge_chair) | CC0; reused. |
| `desk_lamp_arm_01.glb` | Yann Kervran, Kuutti Siitonen / [Poly Haven](https://polyhaven.com/a/desk_lamp_arm_01) | CC0; reused. |
| `studio_small_03.hdr` | Greg Zaal / [Poly Haven](https://polyhaven.com/a/studio_small_03) | CC0; reused. |
| `floor-color.jpg`, `floor-normal.jpg`, `floor-roughness.jpg` | [Poly Haven Wood Floor Deck](https://polyhaven.com/a/wood_floor_deck), 1k JPEG maps | [CC0](https://polyhaven.com/license). Full PBR material; no table texture atlas is used as flooring. |
| `draco/*` | Google Draco decoders, distributed with the installed Three.js 0.170.0 | Apache 2.0; included `draco/LICENSE`, upstream decoder README. |

The architecture, route choreography, semantic science installations, platform, force vectors and sign textures are authored for this prototype. Furniture, vehicles and spacecraft use imported modeled assets rather than primitive stand-ins. Materials/geometry are shared across independent transformed instances. Imported models are normalized using actual decoded bounds; large model scales are illustrative. The rocket rendering compresses vertical altitude; the relativity display compresses spatial distance.

The original detailed asset register for the reused Poly Haven assets is `prototype/assets/realism/asset-register.json`. `evidence/corrective/asset-validation.json` records current file hashes, glTF versions, meshes, material counts, UV attributes and triangle counts. Draco geometry is also verified through successful browser decoding/rendering.
