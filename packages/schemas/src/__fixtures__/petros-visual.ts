import type { PetrosVisualProgram } from '../petros-visual-program';
import type { PetrosTeachingBlockContent } from '../petros-learning';
// Synthetic quantities only, shared across validator and rendered production-boundary tests.
export const visualFixtureId = '55555555-5555-4555-8555-555555555555';
export function visualCompositionFixture(): PetrosVisualProgram {
  return {
    schemaVersion: 'petros.visual-program.v1',
    programId: visualFixtureId,
    revision: 1,
    title: 'Synthetic linked quantities',
    description:
      'One quantity observed through two unit systems and a separate presentation control.',
    representation: 'data_visualisation',
    assumptions: ['Synthetic direct bindings; no scientific solver.'],
    capabilities: [
      { id: 'primitives.svg', version: 1 },
      { id: 'bindings.scalar', version: 1 },
      { id: 'controls.parameter', version: 1 },
      { id: 'presentation.beats', version: 1 },
    ],
    parameters: [
      {
        id: 'length',
        label: 'Length',
        change: 'initialise_model',
        quantity: { type: 'number', unit: 'm', initial: 2, min: 0, max: 10 },
      },
      {
        id: 'show',
        label: 'Show values',
        change: 'display_only',
        quantity: { type: 'boolean', initial: true },
      },
    ],
    simulation: {
      variables: [
        {
          id: 'distance',
          sourceParameter: 'length',
          quantity: { type: 'number', unit: 'cm', initial: 200, min: 0, max: 1000 },
        },
      ],
    },
    presentation: {
      variables: [
        { id: 'visible', sourceParameter: 'show', quantity: { type: 'boolean', initial: true } },
      ],
    },
    views: [
      {
        id: 'metres',
        title: 'Metres',
        width: 300,
        height: 150,
        primitives: [
          {
            id: 'value',
            kind: 'readout',
            label: 'Distance',
            description: 'Distance in metres',
            x: 150,
            y: 75,
            value: 0,
            unit: 'm',
            visible: true,
          },
          {
            id: 'line',
            kind: 'line',
            description: 'Synthetic line',
            x: 10,
            y: 10,
            x2: 290,
            y2: 10,
            visible: true,
          },
        ],
      },
      {
        id: 'centimetres',
        title: 'Centimetres',
        width: 300,
        height: 150,
        primitives: [
          {
            id: 'value',
            kind: 'readout',
            label: 'Distance',
            description: 'Distance in centimetres',
            x: 150,
            y: 75,
            value: 0,
            unit: 'cm',
            visible: true,
          },
          {
            id: 'card',
            kind: 'rect',
            description: 'Synthetic card',
            x: 10,
            y: 100,
            width: 100,
            height: 30,
            visible: true,
          },
        ],
      },
    ],
    bindings: ['metres', 'centimetres'].flatMap((viewId) => [
      {
        source: 'simulation' as const,
        variableId: 'distance',
        viewId,
        primitiveId: 'value',
        property: 'value' as const,
      },
      {
        source: 'presentation' as const,
        variableId: 'visible',
        viewId,
        primitiveId: 'value',
        property: 'visible' as const,
      },
    ]),
    teachingTrack: [
      {
        id: 'first',
        text: 'Inspect the same quantity in metres.',
        targets: [{ viewId: 'metres', primitiveId: 'value' }],
      },
      {
        id: 'second',
        text: 'Inspect it in centimetres.',
        targets: [{ viewId: 'centimetres', primitiveId: 'value' }],
      },
    ],
    computations: [],
    executionLimits: {
      maxPrimitives: 100,
      maxBindings: 200,
      maxVariables: 32,
      maxGeneratedOperations: 0,
      maxSolverSteps: 0,
    },
  };
}
export function visualDiagramFixture(): Extract<PetrosTeachingBlockContent, { type: 'diagram' }> {
  return {
    schemaVersion: 'petros.render.v2',
    type: 'diagram',
    title: 'Synthetic original diagram',
    diagramType: 'flowchart',
    nodes: [
      { id: 'a', label: 'Input', description: 'The starting point' },
      { id: 'b', label: 'Output', description: 'The resulting point' },
    ],
    edges: [{ from: 'a', to: 'b', label: 'connects' }],
    altText: 'Input connects to output in this synthetic schematic.',
    editable: true,
    fallbackText: 'Input connects to output in this synthetic schematic.',
  };
}
