# Visual teaching engine

The old topic pipeline explicitly asked the model for **text diagrams**. Its schema allowed only three `diagramLabels` and a caption. `makeTopicLesson` copied those fields into `TopicDiagram`, Classic rendered three buttons, and World independently drew three rounded cards. There was no visual geometry or model state to preserve, and the controller reset that label-only diagram at every teaching checkpoint. This was a contract and rendering limitation, not a tectonics CSS defect.

## Shared architecture

`teaching/visual-spec.ts` defines a versioned data-only union, its provider JSON schema, runtime validation, bounded parameters, feature identifiers and state transitions. The schema accepts no React, JavaScript, expressions, raw SVG, external URLs or executable operations. Unknown fields, unsupported type identifiers, invalid references, duplicate identifiers, nonfinite numbers, out-of-range parameters and invalid recovered states are rejected. An explicitly planned `unsupported` capability or `none` visual has a reason and keeps its worked example and response task.

`topic-provider.ts` now requires a visual plan alongside every generated concept: objective, rationale, type-specific elements, initial/demonstration/application/transfer states, feedback targets and separate practice/follow-up/independent/final questions. Each task carries a model snapshot. Normalization retains that plan rather than reducing it to labels. Two diagnostic tasks and concept/final assessments use the existing assessment controller. Old saved lessons without a visual specification display an explicit regeneration/worked-example message.

`teaching/visual-scene.ts` compiles validated specifications into a trusted display list of paths, polygons, ellipses, arrows and anchored text. `components/visual-engine.tsx` renders it as React SVG; `world/visual-painter.ts` draws the same primitives into the existing whiteboard texture. Focus Board uses the same SVG component and shared teaching/response controls. Room assets, cameras and Petros are preserved.

`checkpoint.ts` loads the appropriate snapshot when teaching, practising or opening an independent application. `controller.ts` applies feedback highlights to the submitted diagram. A mistake can highlight the actual motion arrows or other relevant features, then open the different follow-up snapshot. Independent applications suppress answer-bearing annotations and lock answer-changing parameters. Progress scrubbing and play/pause remain observation controls. The shared session state preserves the model, selected features, draft, assistance and assessment through refresh and mode changes; a single timer owns plate animation.

Visual exploration never creates performance evidence. Authored tectonics checks can verify a fresh unassisted response; arbitrary model-declared keys continue to be compared and recorded as **unverified**, including in Test. A model key mismatch now offers remediation instead of marking the student ready automatically. Assistance remains separately recorded.

The workspace has a compact concept header, objective and progress marker, a primary diagram with its controls, visible Learn/Apply/Test actions and adjacent response controls on desktop. The full path, prerequisites, objectives, references and lesson details are collapsed below. Narrow screens retain a legible, separately scrollable SVG with an explicit scroll hint.

## Supported capabilities

| Adapter | Actual scope and interactions |
| --- | --- |
| `plate-tectonics` | Labeled lithosphere/asthenosphere section; moving neighboring plates; distinct divergent, oceanic–continental subduction and transform geometry. Boundary selection, movement scrubber, play/pause, bounded rate label and feature selection. Motion is accelerated and schematic. |
| `function-graph` | Sampled quadratic `y = ax² + bx + c`, axes, grid and optional vertex. Bounded a/b/c sliders; a=0 produces a line. Fixed plotting window. |
| `force-vectors` | Two perpendicular applied force components with a common visual scale and computed resultant. Signed Fx/Fy sliders. Other forces are explicitly omitted. |
| `supply-demand` | Linear illustrative supply and demand curves, a computed intersection and equilibrium guides. Demand/supply intercept sliders. Arbitrary units; not a forecast. |
| `cross-section` | Two to five material regions with relative thicknesses and anchored, wrapped labels. Feature selection/highlighting. |
| `structure` | Up to six bounded polygons/ellipses with separate anchored annotations. Feature selection/highlighting. This is a labeled structure, not an automatic physical simulation. |
| `relationships` | Explicit directed nodes/edges in process, cycle, causal, comparison, concept-map or logic arrangements. Select features, highlight support, reveal a supplied conclusion. Logic is a supplied support graph, not an arbitrary theorem prover. |
| `none` / `unsupported` | An explicit reason and useful worked-example/assessment fallback, with no pretend diagram. |

The existing prepared integral area model is preserved. General-purpose differential-equation solvers, arbitrary function expressions, fluid simulations, circuit solving, executable generated components, and arbitrary 3D simulations are not supported. Adding a model means extending the discriminated contract, semantic validation, parameter reducer and shared scene compiler; it does not require another teaching page or a second World controller.

## Tectonics

Enter **tectonic plates** or **plate tectonics** on the learning shelf. These exact aliases open a prepared five-concept lesson for reliable offline use, with two diagnostics, a fresh independent application per concept and five mixed final tasks. This uses the same specification and renderers as generated content. It does not replace the new generated pipeline.

The first section distinguishes crust, lithospheric mantle, rigid plates and the ductile, mostly solid asthenosphere. The movement view states cm/year and accelerated screen motion. Boundaries show spreading/upwelling, one oceanic–continental subduction example with earthquakes/volcanic arc, and a plan view of transform sliding. The investigation allows selection and manipulation before a fixed prediction. A fresh independent case hides the boundary name and descriptive answer annotations. The lesson explicitly distinguishes other convergence configurations.

Authored content references [USGS plate composition](https://pubs.usgs.gov/gip/dynamic/tectonic.html), [USGS plate motion and boundary overview](https://volcanoes.usgs.gov/about/edu/dynamicplanet/nutshell.php), and [NPS boundary types](https://www.nps.gov/subjects/geology/plate-tectonics-types-of-plate-boundaries.htm). These links appear in the collapsed lesson details.

## Verification

Run from the repository root with the existing Node/pnpm setup:

```powershell
pnpm --filter @edrion/petros-showcase test
pnpm --filter @edrion/student-web exec tsc --noEmit
$env:PETROS_ISOLATED_VERIFICATION='1'
$env:PETROS_SHOWCASE_ENABLED='1'
pnpm --filter @edrion/student-web exec next build
$env:SHOWCASE_TEST_URL='http://127.0.0.1:3023'
pnpm --filter @edrion/petros-showcase run verify:visuals
pnpm --filter @edrion/petros-showcase run verify:topics
```

Use a running local prototype origin for the browser checks. Run `tsc` after a build, or before starting one: Next regenerates its included type files while building. Do not point two development processes at the same Next output directory.

Verified in this workspace on 1 November 2026:

- **157 unit tests across 12 files passed**, including 27 visual-specific cases covering schema security, renderer selection, parameter/animation transitions, computed graph/force/market features, feedback, independent/assisted evidence, diagnostics, final assessment, generated normalization and recovery.
- Student-web TypeScript check and optimized Next production build passed.
- `visual-learning-browser.mts` passed with zero page errors and zero production mutations. It exercised actual tectonics SVGs, all boundaries, play/pause, scrubber, remediation, independent submission, refresh, World whiteboard, Focus Board controls, mode preservation, explicit unsupported fallback, and 1440/1024/768/390px layouts. Quadratic, force, market and logic cases passed through generated-contract fixtures and changed actual geometry or relationships through controls.
- The existing `topic-workflow-browser.mts` passed: all six integral concepts, prepared and generated topic routing, World, contextual help, recovery, cancellation and late-response protection remain working.
- One live public-topic generation request passed the expanded provider and client validation in **51.4 seconds**. Its four concepts requested layers, movement, boundaries and investigation. Each real generated concept was subsequently rendered and inspected in the browser, and a key mismatch exercised visual remediation. This is one live tectonics sample; the other four subjects used controlled provider fixtures.

Reviewed screenshots and machine-readable results are versioned in `prototype/evidence/visual-learning/`. `live-generated-tectonics.json` contains that public-topic lesson, not credentials or uploaded documents. Other scratch captures remain ignored. The live generator check is opt-in:

```powershell
$env:PETROS_LIVE_TOPIC_TEST='1'
pnpm --filter @edrion/petros-showcase exec tsx tests/visual-live.mts
```

Manual review: open tectonics, skip or complete the diagnostic, inspect the section, compare each boundary, play and pause, submit a deliberately wrong transform prediction, inspect motion highlighting, retry the fresh case, then use **Test this concept**. Use help on a separate test to confirm it records assistance. Enter World, open Focus Board, change the boundary/slider and return to Classic. Refresh and confirm the same model and draft. Continue to the mixed knowledge check. Legacy saved label-only lessons should show the explicit fallback and can be reopened from the shelf.
