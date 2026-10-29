# PETROS WORLD — MANDATORY 3D ASSET QUALITY REPLACEMENT

**Repository:** `/Volumes/Chris/Edrion Labs`  
**Scope:** `prototype/`  
**Priority:** Critical — YC Showcase

## 1. Stop improving the existing primitive models

The current Petros World environment is visually unacceptable.

The uploaded screenshots show that the study room, shelves, furniture and construction scaffold still resemble early-stage 3D modeling blockouts.

Adding more cubes, cylinders, flat colors, lighting adjustments or decorative rectangles will not resolve this problem.

**Replace the existing placeholder geometry with professionally modeled, realistic 3D assets.**

Do not interpret this request as permission to simply increase the polygon count of the existing primitives.

The target is a polished, architecturally believable, near-photorealistic learning environment that runs smoothly in the browser.

The existing Edrion colors may remain as tasteful accents, but realism must take priority over making every object sage green.

## 2. Asset acquisition is the first milestone

Before implementing another room redesign, identify actual usable asset files.

Search reputable libraries such as:

- Poly Haven — https://polyhaven.com/
- Sketchfab — https://sketchfab.com/
- Fab — https://www.fab.com/
- ambientCG — https://ambientcg.com/

Prioritize CC0 or appropriately licensed assets.

Do not download assets that prohibit the intended use.

Maintain an asset register containing:

- Asset name and source URL.
- Creator.
- License and any required attribution.
- Original format.
- Converted format.
- Polygon/triangle count.
- Texture resolutions.
- Compressed size.
- Intended scene location.

Use GLB/glTF as the preferred runtime format.

If an asset requires conversion, perform it through a documented reproducible process.

**Do not claim a realistic asset has been integrated unless an actual professionally modeled asset is present and renders correctly in the browser.**

If suitable assets cannot be obtained, report that limitation rather than silently recreating them from primitive geometry.

## 3. Build a professionally furnished study room

The environment must contain an architectural interior and recognizable, detailed objects.

### Architecture

Use appropriately detailed models and materials for:

- Interior walls and ceiling.
- Architectural trim.
- Window frames and glass.
- Realistic flooring.
- Doors and frames where visible.
- Room corners and structural transitions.

Avoid empty, oversized walls with flat-colored surfaces.

Use believable human-scale proportions.

### Library

The main library must contain:

- Detailed wooden bookcases.
- Multiple shelves with varied book arrangements.
- Realistic book thicknesses, covers and bindings.
- Horizontally stacked books.
- Selected course books with readable titles.
- Appropriate small decorative objects.
- Subtle shelf lighting.

Decorative book models may be instanced to reduce rendering cost.

Uploaded course books must remain individually selectable and associated with their actual module identifiers.

Do not use uniform extruded rectangular prisms as the finished book collection.

### Furniture

Replace the primitive desks, chairs and tables with finished models.

The models should include realistic structural details:

- Tabletop edges.
- Legs and support joints.
- Chair back and seat construction.
- Material variation.
- Appropriate proportions.
- Visible contact with the floor.

Use physically based materials appropriate to wood, metal, fabric and glass.

### Whiteboard

Create a realistically mounted teaching board featuring:

- Proper frame geometry.
- Matte writing surface.
- Marker tray.
- Suitable proportions.
- Correct positioning and lighting.

The board's educational content remains programmatically generated, but its physical surrounding object must look like a finished classroom fixture.

### Lighting

Create a believable interior lighting setup with:

- Natural window illumination.
- Suitable environment lighting.
- Warm artificial lights where appropriate.
- Contact shadows.
- Physically plausible material responses.
- Correct exposure and tone mapping.

Use accurate color-space handling.

Avoid washed-out, uniformly lit surfaces.

Do not fake realism simply by increasing saturation or adding excessive bloom.

## 4. Replace the construction scaffold model

The current scaffold is not an acceptable realistic educational model.

It consists of basic poles, a ladder and numbered cubes.

Replace it with a detailed scaffold model containing recognizable construction components:

- Uprights and horizontal members.
- Braces.
- Work platform and planking.
- Guardrails where installed.
- Base supports or castors as applicable.
- Appropriate ladder or access arrangement.
- Connectors and fittings.
- Realistic material finishes.

The unsafe and safer configurations must be visibly different.

For the selected construction-safety lesson, retain the five existing hazard categories:

1. Missing top guardrail.
2. Loose tools at the edge.
3. Ladder on a mobile tower.
4. Unsecured castor or unstable base.
5. Nearby overhead power line.

Each must correspond to actual visible geometry.

### Hazard interactions

When the student selects a hazard:

- Identify the actual selected component.
- Highlight only the relevant geometry.
- Show the corresponding short educational explanation.
- Preserve the selected hazard ID.
- Keep the explanation synchronized with the model.

When the student selects **Show safer setup**, visibly change the corresponding physical model configuration.

For example, missing guardrail protection must cause the appropriate guardrail model to appear—not merely change a paragraph.

Use validated educational configurations. Do not invent engineering clearances or claim compliance with a particular safety standard without verification.

Remove large numbered cubes that make the scene look like an unfinished prototype.

Use subtle, scene-anchored interaction indicators instead.

## 5. Quality standard for all models

Before accepting an asset, inspect it from the actual production camera distance.

Reject assets that contain:

- Obvious primitive placeholders.
- Flat single-color materials where realistic materials are expected.
- Broken or missing textures.
- Incorrect scale.
- Visible low-resolution texture artifacts.
- Poorly modeled edges.
- Unnatural object proportions.
- Floating geometry.
- Incompatible art styles.
- Broken normals.
- Excessive polygon counts that compromise performance.

Prefer cohesive assets from matching collections or materials.

Do not combine random models with visibly inconsistent realism or lighting.

Where appropriate, add believable small details through asset placement rather than generating repetitive decorations.

## 6. Make the room look good from the actual camera

The current camera makes parts of the room appear disproportionately large or simplistic.

Define and test these camera positions:

**Arrival:** Believable eye-level interior view.

**Library:** Close enough to inspect real books and selected modules.

**Teaching:** A stable, readable whiteboard view with Petros alongside.

**Experiment:** A close and clear view of the detailed model, with no obstruction from furniture or Petros.

Do not use extreme perspective or camera clipping.

Do not allow the experiment table to hide Petros's face or body.

Do not allow foreground objects to obscure the active demonstration.

## 7. Preserve the original Petros character

Do not redesign Petros.

The approved illustrated character must remain recognizable.

Recognize that his existing artwork is 2D and therefore may look different from a realistic 3D environment.

For this YC prototype, integrate the approved original character deliberately:

- Correct visual scale.
- Stable scene positioning.
- No floating feet.
- No distortion from 3D perspective.
- No fake limb articulation.
- Properly anchored speech clouds.
- Suitable lighting/framing around the character.

Do not create a new realistic humanoid character as a replacement.

A future faithful 3D reconstruction requires separate asset production and visual approval.

## 8. Do not lose the teaching experience

The purpose of the room is to support Petros teaching.

After the environment upgrade:

- Petros must still introduce lessons.
- Books must remain selectable.
- Teaching steps must progress correctly.
- Whiteboard diagrams must remain readable.
- Student interruptions must work.
- Interactive experiments must function.
- Mode switching must preserve progress.

Do not replace functioning demonstrations with static scene assets.

Maintain the previously specified minimal floating UI: during teaching, the primary focus is the room, Petros and the educational demonstration.

## 9. Performance and loading

Use the current rendering framework.

Do not introduce another 3D engine unless the current one demonstrably cannot support the necessary features.

Optimize imported assets through appropriate geometry and texture compression.

Use lazy loading for nonessential assets.

Preload the first camera's required assets before teleportation completes.

Measure:

- Total scene asset size.
- Initial loading behavior.
- Rendering frame rate.
- Memory usage.
- Draw calls.
- Texture and geometry budgets.

Target smooth recording at 1080p on the development machine, with graceful quality reductions on less capable devices.

Do not sacrifice all visual quality merely to make the scene load instantly.

## 10. Mandatory visual approval gate

Before rebuilding every lesson around the environment, deliver **one reference-quality scene**.

It must include:

- Detailed study room.
- Professionally modeled bookshelves.
- Finished furniture.
- Proper flooring and architecture.
- Realistic materials and lighting.
- Original Petros.
- Large readable whiteboard.

Capture these three views:

1. Wide interior arrival.
2. Close library view.
3. Whiteboard teaching view.

The images must come from the actual running browser application.

Do not use offline renders as evidence of browser implementation.

**Do not proceed to polishing the other lessons until this room passes visual review.**

Once the room is approved, integrate the finished construction scaffold and capture a close-up experiment view.

## 11. Completion requirements

The task is not complete simply because:

- More books have been added.
- The lighting is brighter.
- The models have more polygons.
- Additional decorative items appear.
- Existing primitives have been recolored.
- The build and tests pass.

Completion requires actual production-quality 3D assets, convincing materials, believable proportions, correct scene composition and a materially improved browser-rendered environment.

Provide an asset inventory, actual screenshots, measured performance, licensing information and a clear account of anything still using placeholder geometry.

Do not conceal unfinished assets.

**Final instruction: Stop using code-generated primitive shapes as the finished environment. Build Petros World using properly modeled, realistic 3D assets and verify the result visually in the running application.**