import { describe, expect, it, vi, beforeEach } from 'vitest';
import { VisualMemoryDiffService } from './visual-memory-diff.service';
import { normalizeMemoryText } from './visual-memory-text';
import { cosineSimilarity, hungarianMaximize } from './visual-vector';
import type { StudentPrincipal } from '../student.types';

const principal: StudentPrincipal = {
  kind: 'independent',
  independentUserId: '00000000-0000-4000-8000-000000000001',
  email: 'learner@example.com',
  fullName: 'Learner',
  lastAuthAt: null,
  permissions: ['student.lab.use'],
};

function node(
  id: string,
  title: string,
  overrides: Partial<{
    body: string;
    depth: number;
    type: 'concept' | 'process_step';
  }> = {},
) {
  return {
    id,
    type: overrides.type ?? 'concept',
    title,
    body: overrides.body ?? '',
    depth: overrides.depth ?? 0,
    collapsed: false,
    status: 'normal' as const,
    origin: 'student' as const,
  };
}

function referenceGraph() {
  const aiNode = (id: string, title: string, depth = 0) => ({
    id,
    type: 'concept' as const,
    title,
    body: '',
    depth,
    collapsed: false,
    status: 'normal' as const,
    origin: 'ai' as const,
  });
  return {
    graph_schema_version: 1 as const,
    title: 'Photosynthesis',
    archetype: 'mind_map' as const,
    root_node_id: 'root',
    nodes: [
      aiNode('root', 'Photosynthesis', 0),
      aiNode('light', 'Light energy', 1),
      aiNode('chlorophyll', 'Chlorophyll', 1),
    ],
    edges: [
      { id: 'e1', source: 'light', target: 'root', type: 'part_of' as const },
      { id: 'e2', source: 'chlorophyll', target: 'root', type: 'part_of' as const },
    ],
    layout_cache: {},
  };
}

describe('visual-memory-text', () => {
  it('normalizes markdown and LaTeX', () => {
    expect(normalizeMemoryText('**Photosynthesis** and $E=mc^2$')).toBe('photosynthesis and');
  });
});

describe('visual-vector', () => {
  it('computes cosine similarity', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('assigns Hungarian pairs above threshold', () => {
    const matches = hungarianMaximize(
      [
        [0.9, 0.1],
        [0.2, 0.85],
      ],
      0.82,
    );
    expect(matches).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 1 },
    ]);
  });
});

describe('VisualMemoryDiffService', () => {
  let ai: { available: boolean; embedTexts: ReturnType<typeof vi.fn> };
  let callLog: { log: ReturnType<typeof vi.fn> };
  let service: VisualMemoryDiffService;

  beforeEach(() => {
    ai = {
      available: false,
      embedTexts: vi.fn(),
    };
    callLog = { log: vi.fn().mockResolvedValue(undefined) };
    const limiter = { acquireStudentCall: vi.fn().mockResolvedValue({ enforced: true }) };
    service = new VisualMemoryDiffService(ai as never, callLog as never, limiter as never);
  });

  it('matches exact normalized titles and classifies edges', async () => {
    const reference = referenceGraph();
    const diff = await service.computeDiff({
      canvasId: '00000000-0000-4000-8000-000000000100',
      principal,
      idempotencyKey: 'check-1',
      studentGraph: {
        graph_schema_version: 1,
        title: 'My map',
        archetype: 'mind_map',
        root_node_id: 's-root',
        nodes: [
          node('s-root', 'Photosynthesis'),
          node('s-light', 'Light energy', { depth: 1 }),
        ],
        edges: [{ id: 'se1', source: 's-light', target: 's-root', type: 'part_of' }],
        layout_cache: {},
      },
      referenceGraph: reference,
    });

    expect(diff.matching_mode).toBe('normalized_title_fallback');
    expect(diff.matched_nodes).toHaveLength(2);
    expect(diff.missing_nodes.map((entry) => entry.reference_node.id)).toEqual(['chlorophyll']);
    expect(diff.correct_edges).toHaveLength(1);
    expect(diff.evidence_lines.length).toBeGreaterThan(0);
    expect(diff.matched_nodes.every((match) => !('similarity' in match))).toBe(true);
  });

  it('uses embeddings when available', async () => {
    ai.available = true;
    ai.embedTexts.mockResolvedValue({
      vectors: [
        [1, 0],
        [0.9, 0.1],
        [0, 1],
        [0.1, 0.9],
      ],
      usage: { inputTokens: 4, model: 'text-embedding-3-small', durationMs: 10 },
    });

    const reference = referenceGraph();
    const diff = await service.computeDiff({
      canvasId: '00000000-0000-4000-8000-000000000101',
      principal,
      idempotencyKey: 'check-2',
      studentGraph: {
        graph_schema_version: 1,
        title: 'My map',
        archetype: 'mind_map',
        root_node_id: 's-root',
        nodes: [node('s-root', 'Photosynthesis'), node('s-chloro', 'Green pigment', { depth: 1 })],
        edges: [],
        layout_cache: {},
      },
      referenceGraph: reference,
    });

    expect(diff.matching_mode).toBe('embeddings');
    expect(ai.embedTexts).toHaveBeenCalled();
    expect(diff.matched_nodes.some((match) => match.method === 'embedding')).toBe(true);
  });
});
