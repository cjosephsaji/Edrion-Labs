import { describe, expect, it } from 'vitest';
import {
  aiGeneratedGraphSchema,
  canvasGraphSchema,
  completeCanvasGraphSchema,
  graphLocalIdSchema,
  visualSseEventSchema,
} from './visuals';

const mindMapGraph = {
  graph_schema_version: 1 as const,
  title: 'Photosynthesis',
  archetype: 'mind_map' as const,
  root_node_id: 'root',
  nodes: [
    {
      id: 'root',
      type: 'concept' as const,
      title: 'Photosynthesis',
      body: 'Plants convert light to chemical energy.',
      depth: 0,
      collapsed: false,
      status: 'normal' as const,
      origin: 'ai' as const,
    },
    {
      id: 'leaf',
      type: 'concept' as const,
      title: 'Chloroplast',
      body: 'Site of photosynthesis in plant cells.',
      depth: 1,
      collapsed: false,
      status: 'normal' as const,
      origin: 'ai' as const,
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'leaf',
      target: 'root',
      type: 'part_of' as const,
    },
  ],
  layout_cache: {},
};

describe('canvasGraphSchema', () => {
  it('accepts a valid mind map draft', () => {
    expect(canvasGraphSchema.safeParse(mindMapGraph).success).toBe(true);
  });

  it('rejects duplicate node ids', () => {
    const dup = {
      ...mindMapGraph,
      nodes: [
        ...mindMapGraph.nodes,
        { ...mindMapGraph.nodes[1]!, id: 'root', title: 'Other' },
      ],
    };
    const result = canvasGraphSchema.safeParse(dup);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'nodes.2.id')).toBe(true);
    }
  });

  it('rejects self edges', () => {
    const selfEdge = {
      ...mindMapGraph,
      edges: [{ id: 'bad', source: 'root', target: 'root', type: 'leads_to' as const }],
    };
    const result = canvasGraphSchema.safeParse(selfEdge);
    expect(result.success).toBe(false);
  });

  it('accepts empty memory draft', () => {
    const empty = {
      graph_schema_version: 1 as const,
      title: 'My memory map',
      archetype: 'mind_map' as const,
      root_node_id: null,
      nodes: [],
      edges: [],
      layout_cache: {},
    };
    expect(canvasGraphSchema.safeParse(empty).success).toBe(true);
    expect(completeCanvasGraphSchema.safeParse(empty).success).toBe(false);
  });
});

describe('completeCanvasGraphSchema', () => {
  it('accepts a valid complete mind map', () => {
    expect(completeCanvasGraphSchema.safeParse(mindMapGraph).success).toBe(true);
  });

  it('rejects hierarchy with cycle', () => {
    const hierarchyCycle = {
      graph_schema_version: 1 as const,
      title: 'Broken hierarchy',
      archetype: 'hierarchy' as const,
      root_node_id: 'a',
      nodes: [
        {
          id: 'a',
          type: 'concept' as const,
          title: 'A',
          body: 'A body',
          depth: 0,
          collapsed: false,
          status: 'normal' as const,
          origin: 'ai' as const,
        },
        {
          id: 'b',
          type: 'concept' as const,
          title: 'B',
          body: 'B body',
          depth: 1,
          collapsed: false,
          status: 'normal' as const,
          origin: 'ai' as const,
        },
        {
          id: 'c',
          type: 'concept' as const,
          title: 'C',
          body: 'C body',
          depth: 2,
          collapsed: false,
          status: 'normal' as const,
          origin: 'ai' as const,
        },
      ],
      edges: [
        { id: 'e1', source: 'b', target: 'a', type: 'part_of' as const },
        { id: 'e2', source: 'c', target: 'b', type: 'part_of' as const },
        { id: 'e3', source: 'a', target: 'c', type: 'part_of' as const },
      ],
      layout_cache: {},
    };
    const result = completeCanvasGraphSchema.safeParse(hierarchyCycle);
    expect(result.success).toBe(false);
  });
});

describe('aiGeneratedGraphSchema', () => {
  it('rejects layout_cache from AI output', () => {
    const withLayout = {
      ...mindMapGraph,
      layout_cache: {
        mind_map: {
          algorithm: 'elk_radial' as const,
          positions: { root: { x: 0, y: 0 } },
        },
      },
    };
    expect(aiGeneratedGraphSchema.safeParse(withLayout).success).toBe(false);
  });
});

describe('graphLocalIdSchema', () => {
  it('rejects invalid characters', () => {
    expect(graphLocalIdSchema.safeParse('node 1').success).toBe(false);
    expect(graphLocalIdSchema.safeParse('node-1').success).toBe(true);
  });
});

describe('visualSseEventSchema', () => {
  it('parses graph_ready event', () => {
    const event = {
      type: 'graph_ready' as const,
      sequence: 3,
      canvas_id: '550e8400-e29b-41d4-a716-446655440000',
      graph: mindMapGraph,
      version: 1,
    };
    expect(visualSseEventSchema.safeParse(event).success).toBe(true);
  });
});
