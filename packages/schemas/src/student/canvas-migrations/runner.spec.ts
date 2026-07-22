import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { legacyMindMapFixture } from '../visual-fixtures';
import { type CanvasGraph } from '../visuals';
import {
  syntheticV1ToV2Step,
  syntheticV2ToV1Step,
} from './fixtures/synthetic-v1-v2';
import {
  CANVAS_GRAPH_MIGRATION_STEPS,
  CURRENT_CANVAS_GRAPH_VERSION,
  validateCanvasMigrationRegistry,
} from './registry';
import {
  CANVAS_MIGRATION_BUDGET_MS,
  migrateCanvasGraphToCurrent,
} from './runner';
import { CanvasMigrationError } from './types';
import { canvasGraphSchema } from '../visuals';

function buildLargeMindMap(nodeCount: number) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: index === 0 ? 'root' : `n${index}`,
    type: 'concept' as const,
    title: `Node ${index}`,
    body: `Body ${index}`,
    depth: index === 0 ? 0 : 1,
    collapsed: false,
    status: 'normal' as const,
    origin: 'ai' as const,
  }));
  const edges = nodes.slice(1).map((node, index) => ({
    id: `e${index}`,
    source: node.id,
    target: 'root',
    type: 'part_of' as const,
  }));
  return {
    ...legacyMindMapFixture,
    nodes,
    edges,
  };
}

describe('validateCanvasMigrationRegistry', () => {
  it('accepts an empty production registry at v1', () => {
    expect(() =>
      validateCanvasMigrationRegistry(CANVAS_GRAPH_MIGRATION_STEPS, CURRENT_CANVAS_GRAPH_VERSION),
    ).not.toThrow();
  });

  it('rejects duplicate migration steps', () => {
    expect(() =>
      validateCanvasMigrationRegistry(
        [syntheticV1ToV2Step, syntheticV1ToV2Step],
        2,
      ),
    ).toThrow(CanvasMigrationError);
  });

  it('rejects a gap in the migration chain', () => {
    expect(() =>
      validateCanvasMigrationRegistry([syntheticV1ToV2Step], 3),
    ).toThrow(CanvasMigrationError);
  });
});

describe('migrateCanvasGraphToCurrent', () => {
  it('parses current v1 graphs without executing steps', () => {
    const result = migrateCanvasGraphToCurrent(legacyMindMapFixture);
    expect(result.migrated).toBe(false);
    expect(result.graph).toMatchObject(legacyMindMapFixture);
    expect(result.graph.groups).toEqual([]);
    expect(result.targetSchemaVersion).toBe(1);
  });

  it('rejects unknown future versions', () => {
    const future = { ...legacyMindMapFixture, graph_schema_version: 99 as const };
    expect(() => migrateCanvasGraphToCurrent(future)).toThrow(CanvasMigrationError);
    try {
      migrateCanvasGraphToCurrent(future);
    } catch (error) {
      expect((error as CanvasMigrationError).code).toBe('UNSUPPORTED_GRAPH_VERSION');
    }
  });

  it('runs a synthetic v1 to v2 step in tests without shipping schema v2', () => {
    const v2PreviewSchema = z
      .object({
        graph_schema_version: z.literal(2),
        groups: z.array(z.object({ id: z.string(), label: z.string() })),
        title: z.string(),
        archetype: z.string(),
        root_node_id: z.string().nullable(),
        nodes: z.array(z.unknown()),
        edges: z.array(z.unknown()),
        layout_cache: z.record(z.unknown()),
      })
      .passthrough();
    const toV2 = migrateCanvasGraphToCurrent(legacyMindMapFixture, {
      steps: [syntheticV1ToV2Step],
      currentVersion: 2,
      parse: (graph) => v2PreviewSchema.parse(graph) as unknown as CanvasGraph,
    });
    expect(toV2.migrated).toBe(true);
    expect(toV2.graph.graph_schema_version).toBe(2);
    expect(toV2.graph.groups).toEqual([]);

    const roundTrip = canvasGraphSchema.parse(syntheticV2ToV1Step.migrate(toV2.graph));
    expect(roundTrip.graph_schema_version).toBe(1);
  });

  it('is idempotent once the graph is already at the target version', () => {
    const first = migrateCanvasGraphToCurrent(legacyMindMapFixture);
    const second = migrateCanvasGraphToCurrent(first.graph);
    expect(second.migrated).toBe(false);
    expect(second.graph).toEqual(first.graph);
  });

  it('migrates a 60-node fixture within the performance budget', () => {
    const graph = buildLargeMindMap(60);
    const started = performance.now();
    const result = migrateCanvasGraphToCurrent(graph);
    const elapsed = performance.now() - started;
    expect(result.graph.nodes).toHaveLength(60);
    expect(elapsed).toBeLessThan(CANVAS_MIGRATION_BUDGET_MS);
  });
});
