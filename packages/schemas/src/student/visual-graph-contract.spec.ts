import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  AI_GRAPH_EDGE_LIMIT,
  AI_GRAPH_NODE_LIMIT,
  CANVAS_GRAPH_MAX_BYTES,
  VISUAL_CANVAS_STATUSES,
  VISUAL_ORIGINS,
  aiGeneratedGraphSchema,
  canvasGraphSchema,
  completeCanvasGraphSchema,
  stripGenerationGraphPayload,
  type CanvasGraph,
  canvasGraphSchema as canvasGraphSchemaValue,
  visualArchetypeSchema,
} from './visuals';
import {
  EXPECTED_VISUAL_CANVASES_ARCHETYPE_CHECK,
  EXPECTED_VISUAL_CANVASES_ORIGIN_CHECK,
  EXPECTED_VISUAL_CANVASES_STATUS_CHECK,
  assertArchetypeParity,
  assertOriginParity,
  parsePostgresCheckInList,
} from './visual-parity';
import {
  debateClashFixture,
  learnSpawnFixture,
  legacyMindMapFixture,
} from './visual-fixtures';

type AssertEqual<T, U> = T extends U ? (U extends T ? true : false) : false;
const canvasGraphTypeCheck: AssertEqual<CanvasGraph, z.infer<typeof canvasGraphSchemaValue>> = true;
void canvasGraphTypeCheck;

describe('CanvasGraph v1 contract fixtures', () => {
  it('parses legacy mind-map fixture without optional v1 fields', () => {
    expect(canvasGraphSchema.safeParse(legacyMindMapFixture).success).toBe(true);
    expect(completeCanvasGraphSchema.safeParse(legacyMindMapFixture).success).toBe(true);
  });

  it('parses Edrion Learn spawn fixture', () => {
    expect(completeCanvasGraphSchema.safeParse(learnSpawnFixture).success).toBe(true);
  });

  it('parses Debate clash comparison fixture with clash edge and groups', () => {
    expect(completeCanvasGraphSchema.safeParse(debateClashFixture).success).toBe(true);
  });
});

describe('structural guards', () => {
  it('rejects invalid group references', () => {
    const invalid = {
      ...debateClashFixture,
      nodes: debateClashFixture.nodes.map((node) =>
        node.id === 'pro-claim' ? { ...node, group_id: 'missing' } : node,
      ),
    };
    expect(canvasGraphSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects clash edges within the same group', () => {
    const invalid = {
      ...debateClashFixture,
      edges: [
        ...debateClashFixture.edges.filter((edge) => edge.type !== 'clash'),
        { id: 'bad', source: 'pro-claim', target: 'topic', type: 'clash' as const },
      ],
    };
    expect(completeCanvasGraphSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects groups on non-comparison archetypes', () => {
    const invalid = {
      ...legacyMindMapFixture,
      groups: [{ id: 'g1', label: 'Only comparison' }],
    };
    expect(completeCanvasGraphSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects invalid color tokens', () => {
    const invalid = {
      ...debateClashFixture,
      groups: debateClashFixture.groups?.map((group) => ({
        ...group,
        color_token: '#ff00ff',
      })),
    };
    expect(canvasGraphSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects non-finite pinned coordinates', () => {
    const invalid = {
      ...legacyMindMapFixture,
      nodes: legacyMindMapFixture.nodes.map((node) =>
        node.id === 'root'
          ? { ...node, pinned: { x: Number.NaN, y: 0 } }
          : node,
      ),
    };
    expect(canvasGraphSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('generated output guards', () => {
  it('strips pinned coordinates and layout cache from generation payloads', () => {
    const withCoordinates = {
      ...legacyMindMapFixture,
      layout_cache: {
        mind_map: {
          algorithm: 'elk_radial' as const,
          positions: { root: { x: 1, y: 2 } },
        },
      },
      nodes: legacyMindMapFixture.nodes.map((node) =>
        node.id === 'root' ? { ...node, pinned: { x: 10, y: 20 } } : node,
      ),
    };
    const stripped = stripGenerationGraphPayload(withCoordinates);
    expect(stripped.layout_cache).toEqual({});
    expect(stripped.nodes.every((node) => node.pinned === undefined)).toBe(true);
  });

  it('rejects AI output with layout coordinates', () => {
    const withLayout = {
      ...legacyMindMapFixture,
      layout_cache: {
        mind_map: {
          algorithm: 'elk_radial' as const,
          positions: { root: { x: 0, y: 0 } },
        },
      },
    };
    expect(aiGeneratedGraphSchema.safeParse(withLayout).success).toBe(false);
  });

  it('rejects generated graphs above node budget', () => {
    const nodes = Array.from({ length: AI_GRAPH_NODE_LIMIT + 1 }, (_, index) => ({
      id: `n${index}`,
      type: 'concept' as const,
      title: `Node ${index}`,
      body: 'Body',
      depth: index === 0 ? 0 : 1,
      collapsed: false,
      status: 'normal' as const,
      origin: 'ai' as const,
    }));
    const edges = nodes.slice(1).map((node, index) => ({
      id: `e${index}`,
      source: node.id,
      target: 'n0',
      type: 'part_of' as const,
    }));
    const oversized = {
      ...legacyMindMapFixture,
      root_node_id: 'n0',
      nodes,
      edges,
    };
    expect(aiGeneratedGraphSchema.safeParse(oversized).success).toBe(false);
  });

  it('rejects generated graphs above edge budget', () => {
    const nodes = [
      legacyMindMapFixture.nodes[0]!,
      ...Array.from({ length: AI_GRAPH_EDGE_LIMIT + 1 }, (_, index) => ({
        id: `leaf${index}`,
        type: 'concept' as const,
        title: `Leaf ${index}`,
        body: 'Body',
        depth: 1,
        collapsed: false,
        status: 'normal' as const,
        origin: 'ai' as const,
      })),
    ];
    const edges = nodes.slice(1).map((node, index) => ({
      id: `e${index}`,
      source: node.id,
      target: 'root',
      type: 'part_of' as const,
    }));
    const oversized = {
      ...legacyMindMapFixture,
      nodes,
      edges,
    };
    expect(aiGeneratedGraphSchema.safeParse(oversized).success).toBe(false);
  });
});

describe('byte cap', () => {
  it('rejects serialized graphs above CANVAS_GRAPH_MAX_BYTES', () => {
    const hugeBody = 'x'.repeat(CANVAS_GRAPH_MAX_BYTES);
    const oversized = {
      ...legacyMindMapFixture,
      nodes: [
        legacyMindMapFixture.nodes[0]!,
        { ...legacyMindMapFixture.nodes[1]!, body: hugeBody },
      ],
    };
    expect(canvasGraphSchema.safeParse(oversized).success).toBe(false);
  });
});

describe('database/Zod parity', () => {
  it('matches archetype CHECK literals', () => {
    assertArchetypeParity(visualArchetypeSchema.options, EXPECTED_VISUAL_CANVASES_ARCHETYPE_CHECK);
  });

  it('matches origin CHECK literals', () => {
    assertOriginParity(VISUAL_ORIGINS, EXPECTED_VISUAL_CANVASES_ORIGIN_CHECK);
  });

  it('parses status CHECK literals', () => {
    expect(parsePostgresCheckInList(EXPECTED_VISUAL_CANVASES_STATUS_CHECK).sort()).toEqual(
      [...VISUAL_CANVAS_STATUSES].sort(),
    );
  });

  it('fails parity assertion on intentional archetype drift', () => {
    expect(() =>
      assertArchetypeParity(['mind_map', 'flowchart'], EXPECTED_VISUAL_CANVASES_ARCHETYPE_CHECK),
    ).toThrow(/mismatch/i);
  });
});
