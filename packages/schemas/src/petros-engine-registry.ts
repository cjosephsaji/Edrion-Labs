import { ENGINE_MODELS } from './petros-engine-models';

/** Platform metadata only: program input cannot register a capability or approval. */
const infrastructure = [
  { id:'render.svg',version:1,solver:'none',renderer:'petros.svg.v2',trust:'platform',enabled:true,
    units:['px'],parameterRanges:{},assumptions:['Coordinates are display pixels, not physical units.'],
    fixtures:['primitive-and-text-equivalence'],limitations:['No arbitrary SVG, URLs, HTML, scripts or assets.'],
    executionBudget:{primitives:200},assetLicense:'Original vector primitives; no external assets.' },
  { id:'language.typed',version:1,solver:'bounded.dag.v1',renderer:'none',trust:'bounded_expression',enabled:true,
    units:['declared_dimensions'],parameterRanges:{},assumptions:['Finite acyclic scalar expressions; ordered bounded discrete events.'],
    fixtures:['units-dag-budget-injection'],limitations:['Structural validation does not establish scientific truth. No loops, recursion or coupled constraint solver.'],
    executionBudget:{operations:4096,events:64},assetLicense:'No assets.' },
  { id:'render.spatial',version:1,solver:'parallel.oblique-fixed.v1',renderer:'petros.spatial-projection.v1',trust:'platform',enabled:true,
    units:['px'],parameterRanges:{coordinate:[-4096,4096]},assumptions:['Fixed parallel projection: screen x=x+z/2, screen y=y-z/2. Inputs are display px, not physical coordinates.'],
    fixtures:['spatial-point-coordinate-equivalence'],limitations:['Spatial foundation only; no solid geometry, field simulation or photorealistic fidelity. Coordinate table is the equivalent route.'],
    executionBudget:{primitives:200},assetLicense:'Original point/axes geometry; no downloaded assets; CC0 fixture.' },
  { id:'extension.executable',version:1,solver:'unavailable',renderer:'unavailable',trust:'generated_executable',enabled:false,
    units:[],parameterRanges:{},assumptions:[],fixtures:[],limitations:['Disabled: no validated executable isolation, network/import denial or CPU/memory containment. A Web Worker is not this boundary.'],
    executionBudget:{operations:0},assetLicense:'No executable or asset imports permitted.' },
] as const;
export function describeEngineCapabilities(){
  return {schemaVersion:'petros.engine-capabilities.v1' as const,programVersion:'petros.visual-program.v2' as const,
    capabilities:[...infrastructure.map(c=>({...c})),...ENGINE_MODELS.map(c=>({id:c.id,version:c.version,solver:c.solver,renderer:'petros.svg.v2',trust:c.trust,enabled:true,
      units:[...new Set([...Object.values(c.inputs),...Object.values(c.outputs)].map(q=>q.unit))],parameterRanges:c.inputs,
      assumptions:c.assumptions,fixtures:c.fixtures,limitations:c.limitations,
      executionBudget:{solverSteps:c.maxSteps,duration:c.maxTime},assetLicense:c.license}))].map(c=>JSON.parse(JSON.stringify(c)) as typeof c)};
}
export const ENGINE_BASE_CAPABILITIES=['render.svg','language.typed'] as const;
