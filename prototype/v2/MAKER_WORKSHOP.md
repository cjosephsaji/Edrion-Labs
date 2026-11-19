# The editable 3D workshop

Open `/prototype?view=3d`. This replaces the previous three fixed spatial labs with one editable project. The home and 2D navigation call it **3D workshop**; legacy `view=world` and `view=stage` links enter the same editor. The previous lab components, numerical modules and browser test have been removed. Their screenshots are historical evidence only.

## What a learner can actually do

- Start from an empty project or an editable fan/arm assembly. Create up to 64 boxes, ellipsoids, cylinders, cones, hollow tubes and gears. Every part has dimensions, position, rotation, colour and a nominal material density.
- Select geometry in the canvas or parts list. Drag move, rotate or resize handles; use optional snapping or precise keyboard-accessible numeric fields. Inspect wireframe, isolate a part or cut the display with a section plane.
- Attach parts to other parts. Inspector attachment preserves world position; script attachment explicitly uses parent-relative coordinates. Continuous rotation and oscillating hinges move their descendants. Scrub or replay ten seconds of driven motion.
- Write parametric build scripts with variables, radial arrays, geometry and attachments. Invalid scripts do not modify the project. The language is a bounded interpreter, not arbitrary JavaScript.
- Describe edits such as `make base wider by 20 mm`, `add a cylinder named axle 12 x 80 x 12 mm`, `double the height of selected`, `move rotor by 10 0 0 mm`, `spin rotor around z at 45 rpm`, or `attach axle to rotor`. Supported precise commands execute locally and are labeled as local commands.
- When configured, request new assemblies and more open-ended edits through the AI planner. The model returns a proposed build script, which is compiled and validated before the preview is shown. The learner inspects the candidate and applies or discards it. The existing project is preserved on provider, parse, validation, cancellation or stale-response failure.
- Undo/redo 40 project edits. Save and import project JSON; export geometry as OBJ in millimetres, at rest pose, with separate named parts. The renderer, measurements and export share geometry and transforms.
- Pin a reference, compare mass/bounds/centre, record a prediction and explanation, and save up to 12 experiments with their full editable project. Project and records autosave locally. Experiment records export separately.

This is an authoring system, not a library selector disguised as prompting. The two initial assemblies are ordinary scripts that can be replaced, dismantled or extended. No subject selector constrains what the learner assembles.

## Model boundaries

The motion preview computes hierarchical kinematics, not rigid-body dynamics. It does not solve collisions, torque, motor power, airflow, circuits, gear contact, stress or manufacturing tolerances. Gear teeth are editable geometry, not a mechanical transmission solver. Cylinder/cone/tube/gear axes are local Y. Tube inner diameter is 70% of outer diameter; gear bores are 28%. Full boolean CAD and imported mesh editing are not implemented.

Mass is triangulated volume times a nominal uniform density. Parts are summed separately, including overlapping volumes. Shape-dependent centroids are used in the rest-pose mass centre. Bounding boxes come from transformed vertices. Section mode clips the display only; it does not change measured or exported solids. OBJ export does not preserve colours, joints or behaviour; project JSON does.

Written explanations are not automatically graded. UI interaction or time spent does not establish mastery. Learning effectiveness, screen-reader acceptance, physical mobile devices and long-term engagement remain unverified.

## Generative prompts and configuration

Live generation is implemented but **not verified against a live provider in this checkout**: no server API key was configured during the local checks. The interface reports this and never substitutes a canned answer for an unknown request. Precise local commands, direct editing and build scripts are independently functional.

The owner chose local commands for now. Generative prompts are disabled by default, even if an API key is present. To activate them later, explicitly set `PETROS_V2_MAKER_AI=1` and configure `OPENAI_API_KEY` in the Git-ignored `prototype/v2/.env.local` or the deployment's server environment, then restart and reload. Do not place the key in client code or a `NEXT_PUBLIC_` variable. The existing `PETROS_V2_TEACHER_MODEL` selects the provider model. Tutor and voice pause flags remain unchanged.

`POST /prototype/api/maker` uses existing authentication, same-origin checks, bounded request bodies, the teacher request budget (40/hour), and production shared-budget enforcement. The model receives the submitted prompt, selection, canonical project script and computed initial measurements. It cannot execute code, fetch assets or mutate the saved scene directly. See [OpenAI's structured-output documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) for the underlying response mechanism; application validation remains authoritative.

## Files and verification

- `core/maker-project.ts`: project contract, hierarchy, bounded language, command serialization and immutable operations.
- `core/maker-geometry.ts`: geometry, transforms, measurement and OBJ export.
- `core/maker-prompt.ts`: explicit local command grammar.
- `server/maker-planner.ts`: structured prompt-to-project proposals.
- `components/MakerStudio.tsx`, `MakerScene.tsx`: editor, rendering, controls, learning record and recovery.
- `tests/maker-project.test.ts`: hierarchy and gizmo transforms, attachment/deletion, source round trip, bounded parsing, analytic volume checks, material scaling, export and prompt edits.
- `tests/maker-planner.test.ts`: generated-response fixtures, invalid-output rejection and endpoint access/configuration checks. These are mocked provider tests, not live AI evidence.
- `tests/maker-browser.mts`: actual handle dragging, numeric editing, local create/edit prompts, preview/apply/discard, attachment, duplication/deletion, visible motion, code authoring, failed-code atomicity, OBJ/JSON, import, reload, experiments, mobile layout and WebGL recovery.
- `tests/learning-journey-browser.mts`: all 15 existing 2D cases, including saved progress across workshop visits.

Run `npm test`, `npm run build`, then `npm run test:maker` and `npm run test:journey` with the local server running. Current browser evidence is in `evidence/maker-workshop/`. Historical lab screenshots are not acceptance evidence for this editor.

Verified locally on 18 November 2026: 240 tests across 23 files, production build including TypeScript, the full workshop browser flow with actual handle dragging and a 390 px viewport, and all 15 2D learning cases. Browser results contain no page errors. The installed Next.js version reports a pre-existing security advisory; the build completed on retry, and no dependency upgrade or deployment is included. Live AI remains untested pending a server key.
