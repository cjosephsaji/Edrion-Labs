# Spatial laboratory

**Historical record.** This fixed-lab implementation was replaced following product feedback by the [editable 3D workshop](MAKER_WORKSHOP.md). Its components, model module and tests have been removed. The routes below now open the workshop, and these results do not validate the replacement.

Implemented 18 November 2026. Open `/prototype?view=3d`; optionally add `&lab=orbit`, `&lab=flight` or `&lab=form`. Home and the 2D workspace link here. Old `view=stage` and `view=world` links enter this laboratory behind existing authentication.

This replaces the shared 2D/3D comparison renderer. `InvestigationSpace`, its stylesheet, and the `spatial-investigation` helper have been removed. Historical World/Stage implementations remain archival source, not the current route. The five 2D investigations and their saved progress remain independent.

## Working investigations

- **Orbital mechanics:** initial altitude, tangential speed and inclination drive central gravity in physical kilometre/second coordinates. Velocity-Verlet integrates at 5 s steps for at most three hours, with surface intersection detection. Inspect specific energy, maximum sampled altitude, circular speed and vector components. The guided experiment connects orbital plane rotation to unchanged energy and altitude range.
- **Flight and game physics:** speed, elevation, bearing, crosswind and drag drive a three-dimensional RK4 solver. Gravity and quadratic drag use air-relative velocity; landing time is interpolated at ground crossing. Inspect downrange and lateral landing offset, then counteract crosswind by changing bearing. Disabling drag removes wind's influence.
- **Parametric modeling:** height, width, depth, taper and twist define a solid with elliptical horizontal sections. Move a section plane through it and compare section area with analytic volume. Inspect triangulation or export the same closed mesh as OBJ, with metres and Y-up documented. The transfer task relates dimensional scaling to volume preservation.

All three support orbit/pan/zoom, top/front/side views, a reference overlay in shared coordinates, scrubbing, single steps, explicit playback, layer toggles, object inspection, a linked graph, sample tables and full CSV export. Rendering is on demand with capped pixel ratio. Playback starts only on request and suspends advancement in a hidden tab. Model assumptions, units and equations appear beside the workspace. NASA references support gravity and drag models. This is not mission design, engineering certification or a general-purpose CAD package.

## Learning and evidence

The workflow is prediction → controlled change → inspection → explanation → transfer. Pin starting conditions, change one variable and read measured differences. Changing multiple conditions prompts a reminder that this does not isolate a cause. Scientific reasoning is available on request. Written explanations are not automatically graded; clicks and elapsed time never imply mastery.

Saving records parameters, reference parameters, prediction, explanation and computed metrics. The notebook retains up to 30 entries in browser-local storage and exports JSON. Reopening restores conditions; stored metrics are recomputed. Unsaved conditions and writing are not retained after reloading or switching experiments. If storage is unavailable, entries remain in memory and a notice directs the learner to export. No cloud sync or automatic AI evaluation is claimed.

Measurements and CSV export remain usable if WebGL fails. Context loss shows a retry control without discarding notes. Camera presets, object selection, parameter ranges and timelines provide keyboard alternatives to direct 3D interaction. Screen-reader acceptance and physical low-end-device testing remain unverified.

## Implementation and validation

- `core/spatial-lab.ts`: catalogue, bounded parameters, deterministic models, shared mesh/OBJ export, notebook parsing.
- `components/SpatialLab.tsx`: workspace, evidence, prompts and notebook.
- `components/SpatialLabScene.tsx`: lazy-loaded R3F scene; no external textures, fonts or runtime model downloads.
- `tests/spatial-lab.test.ts`: circular-orbit/energy preservation, inclination invariance, collision and escape, analytic vacuum range/time, wind/drag separation, volume invariance, closed mesh topology/volume, finite presets and notebook restoration.
- `tests/spatial-lab-browser.mts`: all three desktop and mobile labs, comparisons, playback, scrubbing, notebook reload, export, context recovery and 2D navigation. Evidence: `evidence/spatial-lab/`.
- `tests/learning-journey-browser.mts`: all 15 existing 2D cases and saved-progress preservation when visiting the laboratory.

Local checks passed: 235 tests across 22 files, production build including TypeScript, all three desktop/mobile browser paths, and all 15 2D cases. Screenshots were visually inspected. These are Chromium desktop/emulated-mobile checks, not physical device acceptance. The build reports an advisory for the repository's existing Next.js version; dependency remediation is outside this 3D change.

Run from this directory with Node 22–24:

```sh
npm test
npm run build
npm run dev
# With the server running:
npm run test:spatial
npm run test:journey
```

Scope is three authored labs. New subjects need domain-specific models and validated learning tasks. Student usability, transfer learning and long-term engagement have not been measured. Visual novelty is not evidence of those outcomes.
