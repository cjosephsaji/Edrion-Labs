import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { revConflict } from './visual.errors';

describe('VisualRevisionService', () => {
  it('revConflict carries latest revision and graph for clients', () => {
    const graph = {
      graph_schema_version: 1 as const,
      title: 'T',
      archetype: 'mind_map' as const,
      root_node_id: null,
      nodes: [],
      edges: [],
      layout_cache: {},
    };
    const err = revConflict(3, graph);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({
      code: 'REV_CONFLICT',
      latest_revision: 3,
      latest_graph: graph,
    });
  });

  it('commit rejects stale base revision before writing', async () => {
    const { VisualRevisionService } = await import('./visual-revision.service');
    const currentRow = {
      id: 'canvas-1',
      version: 2,
      graph: {
        graph_schema_version: 1,
        archetype: 'mind_map',
        title: 'T',
        root_node_id: null,
        nodes: [],
        edges: [],
        layout_cache: {},
      },
      schemaVersion: 1,
      title: 'T',
      archetype: 'mind_map',
      status: 'ready',
      deletedAt: null,
      origin: 'prompt',
      topicId: null,
    };

    const limit = vi.fn().mockResolvedValue([currentRow]);
    const forUpdate = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ for: forUpdate });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });

    const db = {
      transaction: async (fn: (tx: { select: typeof select }) => Promise<unknown>) => fn({ select }),
    };

    const service = new VisualRevisionService(
      db as never,
      { observeCommittedGraph: vi.fn() } as never,
      { logStrictInTransaction: vi.fn() } as never,
    );

    await expect(
      service.commit(
        { kind: 'independent', independentUserId: 'u1' } as never,
        {
          canvasId: 'canvas-1',
          baseRevision: 1,
          graph: currentRow.graph as never,
          title: 'T',
          archetype: 'mind_map',
          reason: 'autosave',
        },
      ),
    ).rejects.toMatchObject({ response: { code: 'REV_CONFLICT' } });
  });
});
