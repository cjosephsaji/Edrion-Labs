import { describe, expect, it } from 'vitest';
import { assertCanvasMigrationRegistryAtStartup } from '@edrion/schemas';
import { VisualSchemaMigrationService } from './visual-schema-migration.service';

const sampleGraph = {
  graph_schema_version: 1 as const,
  title: 'Sample',
  archetype: 'mind_map' as const,
  root_node_id: 'root',
  nodes: [
    {
      id: 'root',
      type: 'concept' as const,
      title: 'Root',
      body: 'Body',
      depth: 0,
      collapsed: false,
      status: 'normal' as const,
      origin: 'ai' as const,
    },
    {
      id: 'child',
      type: 'concept' as const,
      title: 'Child',
      body: 'Body',
      depth: 1,
      collapsed: false,
      status: 'normal' as const,
      origin: 'ai' as const,
    },
  ],
  edges: [{ id: 'e1', source: 'child', target: 'root', type: 'part_of' as const }],
  layout_cache: {},
};

describe('VisualSchemaMigrationService', () => {
  it('boots with a contiguous production registry', () => {
    expect(() => assertCanvasMigrationRegistryAtStartup()).not.toThrow();
  });

  it('migrates graphs for read without persisting', () => {
    const service = new VisualSchemaMigrationService();
    const view = service.migrateGraphForRead(sampleGraph);
    expect(view.migrated).toBe(false);
    expect(view.formatLabel).toBeNull();
    expect(view.graph.title).toBe(sampleGraph.title);
  });
});
