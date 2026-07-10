import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HttpException } from '@nestjs/common';
import { CANVAS_GRAPH_MAX_BYTES } from '@edrion/schemas';
import { VisualStudioService } from './visual-studio.service';
import type { VisualStudioRepository } from './visual-studio.repository';
import type { StudentPrincipal } from '../student.types';

const principal: StudentPrincipal = {
  kind: 'independent',
  independentUserId: '00000000-0000-4000-8000-000000000001',
  email: 'learner@example.com',
  fullName: 'Learner',
  lastAuthAt: null,
  permissions: ['student.lab.use'],
};

function emptyGraph() {
  return {
    graph_schema_version: 1 as const,
    title: 'Draft',
    archetype: 'mind_map' as const,
    root_node_id: null,
    nodes: [],
    edges: [],
    layout_cache: {},
  };
}

describe('VisualStudioService', () => {
  let repo: VisualStudioRepository;
  let limiter: { peekStudent: ReturnType<typeof vi.fn> };
  let service: VisualStudioService;

  beforeEach(() => {
    repo = {
      owner: vi.fn().mockReturnValue({
        institutionId: null,
        studentId: null,
        independentUserId: principal.independentUserId,
      }),
      getTopic: vi.fn(),
      createMemoryCanvas: vi.fn(),
      getCanvas: vi.fn(),
      listCanvases: vi.fn(),
      patchCanvas: vi.fn(),
      listMemoryTopics: vi.fn(),
      getRevisionState: vi.fn(),
      updateManualReasons: vi.fn(),
      attachTopicId: vi.fn(),
      getTopicByKey: vi.fn(),
      upsertTopic: vi.fn(),
    } as unknown as VisualStudioRepository;
    limiter = {
      peekStudent: vi.fn().mockResolvedValue({
        'visual.propose': {
          limit: 12,
          used: 0,
          remaining: 12,
          resets_at: '2026-07-11T01:00:00.000Z',
        },
      }),
    };
    service = new VisualStudioService(
      repo,
      limiter as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { enabled: true, enqueue: vi.fn() } as never,
      { log: vi.fn() } as never,
    );
  });

  it('peekQuota returns read-only scope limits from limiter', async () => {
    const quota = await service.peekQuota(principal);
    expect(quota.scopes['visual.propose']).toEqual({
      limit: 12,
      used: 0,
      remaining: 12,
      resets_at: '2026-07-11T01:00:00.000Z',
    });
    expect(limiter.peekStudent).toHaveBeenCalledWith(principal);
  });

  it('createCanvas rejects oversized graphs', async () => {
    const hugeBody = 'x'.repeat(CANVAS_GRAPH_MAX_BYTES);
    const graph = {
      ...emptyGraph(),
      nodes: [
        {
          id: 'n1',
          type: 'note' as const,
          title: 'Big',
          body: hugeBody,
          depth: 0,
          collapsed: false,
          status: 'normal' as const,
          origin: 'student' as const,
        },
      ],
    };

    vi.mocked(repo.getTopic).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000010',
      topicKey: 'photosynthesis',
      title: 'Photosynthesis',
      subjectLabel: 'Biology',
      curriculumKey: 'generic',
      domainArchetype: 'procedural_quantitative',
      institutionId: null,
      source: 'ai',
      meta: {},
      createdAt: new Date(),
    });

    await expect(
      service.createCanvas(principal, {
        id: '00000000-0000-4000-8000-000000000020',
        title: 'Draft',
        archetype: 'mind_map',
        origin: 'memory',
        topic_id: '00000000-0000-4000-8000-000000000010',
        graph,
        client_mutation_id: '00000000-0000-4000-8000-000000000030',
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getResponse()).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
      return true;
    });
  });

  it('patchCanvas returns last_write_wins conflict flag from repository', async () => {
    const graph = emptyGraph();
    vi.mocked(repo.getCanvas).mockResolvedValue({
      id: 'canvas-1',
      institutionId: null,
      studentId: null,
      independentUserId: principal.independentUserId,
      title: 'Draft',
      archetype: 'mind_map',
      graph,
      schemaVersion: 1,
      origin: 'memory',
      sourceId: null,
      topicId: 'topic-1',
      sourceSessionId: null,
      legacyArtifactId: null,
      version: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(repo.patchCanvas).mockResolvedValue({
      conflictResolved: 'last_write_wins',
      canvas: {
        id: 'canvas-1',
        institutionId: null,
        studentId: null,
        independentUserId: principal.independentUserId,
        title: 'Draft',
        archetype: 'mind_map',
        graph,
        schemaVersion: 1,
        origin: 'memory',
        sourceId: null,
        topicId: 'topic-1',
        sourceSessionId: null,
        legacyArtifactId: null,
        version: 3,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    });

    const result = await service.patchCanvas(principal, 'canvas-1', {
      base_version: 1,
      title: 'Draft',
      archetype: 'mind_map',
      graph,
      client_mutation_id: '00000000-0000-4000-8000-000000000040',
    });

    expect(result.conflict_resolved).toBe('last_write_wins');
    expect(result.canvas.version).toBe(3);
  });
});
