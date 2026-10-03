import type { PetrosTeachingBlockContent } from './petros-learning';
import {
  PETROS_VISUAL_CAPABILITIES,
  PETROS_VISUAL_VALIDATOR_VERSION,
  initialPetrosVisualCheckpoint,
  petrosVisualProgramSchema,
  petrosVisualSnapshotSchema,
  type PetrosVisualProgram,
  type PetrosVisualPrimitive,
} from './petros-visual-program';

/** Read-time adapter: never rewrites historical content or implies a scientific model. */
export function adaptPetrosDiagram(
  content: Extract<PetrosTeachingBlockContent, { type: 'diagram' }>,
  blockId: string,
) {
  const nodeIds = new Set(content.nodes.map((n) => n.id));
  if (
    nodeIds.size !== content.nodes.length ||
    content.edges.some((e) => !nodeIds.has(e.from) || !nodeIds.has(e.to))
  ) {
    throw new Error('PETROS_VISUAL_INVALID_REFERENCE');
  }
  const primitives: PetrosVisualPrimitive[] = [];
  const bindings: PetrosVisualProgram['bindings'] = [];
  const teachingTrack: PetrosVisualProgram['teachingTrack'] = [];
  const positions = content.nodes.map((_, i) => ({
    x: 120 + (i % 3) * 250,
    y: 80 + Math.floor(i / 3) * 140,
  }));
  // Original IDs can contain arbitrary text; use internal IDs while retaining original content.
  for (const [i, edge] of content.edges.entries()) {
    const from = positions[content.nodes.findIndex((n) => n.id === edge.from)]!;
    const to = positions[content.nodes.findIndex((n) => n.id === edge.to)]!;
    const description = `${content.nodes.find((n) => n.id === edge.from)!.label} → ${content.nodes.find((n) => n.id === edge.to)!.label}: ${edge.label}`;
    primitives.push({
      id: `edge${i}`,
      kind: 'line',
      description,
      x: from.x,
      y: from.y,
      x2: to.x,
      y2: to.y,
      visible: true,
    });
    primitives.push({
      id: `edgeLabel${i}`,
      kind: 'text',
      description,
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2 - 10,
      text: edge.label || '→',
      visible: true,
    });
    for (const primitiveId of [`edge${i}`, `edgeLabel${i}`])
      bindings.push({
        source: 'presentation',
        variableId: 'relationsVisible',
        viewId: 'structure',
        primitiveId,
        property: 'visible',
      });
  }
  for (const [i, node] of content.nodes.entries()) {
    const point = positions[i]!;
    primitives.push({
      id: `card${i}`,
      kind: 'rect',
      description: node.description || node.label,
      x: point.x - 100,
      y: point.y - 30,
      width: 200,
      height: 60,
      visible: true,
    });
    primitives.push({
      id: `label${i}`,
      kind: 'text',
      description: node.description || node.label,
      x: point.x,
      y: point.y,
      text: node.label,
      visible: true,
    });
    teachingTrack.push({
      id: `nodeBeat${i}`,
      text: `${node.label}. ${node.description}`,
      targets: [
        { viewId: 'structure', primitiveId: `card${i}` },
        { viewId: 'structure', primitiveId: `label${i}` },
      ],
    });
  }
  const program = petrosVisualProgramSchema.parse({
    schemaVersion: 'petros.visual-program.v1',
    programId: blockId,
    revision: 1,
    title: content.title,
    description: content.altText,
    representation: 'schematic',
    assumptions: [
      'Schematic relationships from the original teaching block; no physical simulation or scientific verification.',
    ],
    capabilities: PETROS_VISUAL_CAPABILITIES.map((c) => ({ id: c.id, version: c.version })),
    parameters: [
      {
        id: 'showRelations',
        label: 'Show relationships',
        change: 'display_only',
        quantity: { type: 'boolean', initial: true },
      },
    ],
    simulation: { variables: [] },
    presentation: {
      variables: [
        {
          id: 'relationsVisible',
          quantity: { type: 'boolean', initial: true },
          sourceParameter: 'showRelations',
        },
      ],
    },
    views: [
      {
        id: 'structure',
        title: 'Structure',
        width: 760,
        height: Math.max(280, Math.ceil(content.nodes.length / 3) * 140),
        primitives,
      },
    ],
    bindings,
    teachingTrack,
    computations: [],
    executionLimits: {
      maxPrimitives: 100,
      maxBindings: 200,
      maxVariables: 32,
      maxGeneratedOperations: 0,
      maxSolverSteps: 0,
    },
  });
  return petrosVisualSnapshotSchema.parse({
    program,
    checkpoint: initialPetrosVisualCheckpoint(program),
    validatorVersion: PETROS_VISUAL_VALIDATOR_VERSION,
    lastOperation: null,
  });
}
