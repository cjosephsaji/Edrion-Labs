import { describe, expect, it } from 'vitest';
import { aiGeneratedGraphSchema, canvasGraphSchema } from './visuals';

const graph = {
  graph_schema_version: 1 as const,
  title: 'World War II Timeline',
  archetype: 'flowchart' as const,
  root_node_id: 'n0',
  nodes: [
    { id: 'n0', type: 'process_step' as const, title: 'WWII begins', body: 'A short description of this idea.', depth: 0, collapsed: false, status: 'normal' as const, origin: 'ai' as const },
    { id: 'n1', type: 'process_step' as const, title: 'Invasion of Poland', body: 'A short description of this idea.', depth: 1, collapsed: false, status: 'normal' as const, origin: 'ai' as const },
    { id: 'n2', type: 'process_step' as const, title: 'D-Day', body: 'A short description of this idea.', depth: 2, collapsed: false, status: 'normal' as const, origin: 'ai' as const },
  ],
  edges: [
    { id: 'e0', source: 'n0', target: 'n1', type: 'leads_to' as const, label: '' },
    { id: 'e1', source: 'n1', target: 'n2', type: 'leads_to' as const, label: '' },
  ],
  layout_cache: {},
};

describe('empty edge labels from structured output', () => {
  it('AI boundary accepts label:"" and normalizes it to absent', () => {
    const parsed = aiGeneratedGraphSchema.safeParse(graph);
    if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues.slice(0, 3), null, 2));
    expect(parsed.data.edges.map((e) => e.label)).toEqual([undefined, undefined]);
  });

  it('storage schema still rejects a literal empty label', () => {
    expect(canvasGraphSchema.safeParse(graph).success).toBe(false);
  });
});

describe('depth derived at the AI boundary', () => {
  // The model numbers timeline steps 2,3,4... down the chain; the rule puts every
  // backbone step at depth 1. Derive depth from structure instead of rejecting.
  const timeline = {
    graph_schema_version: 1 as const,
    title: 'World War II Timeline',
    archetype: 'timeline' as const,
    root_node_id: 'n0',
    nodes: [
      { id: 'n0', type: 'process_step' as const, title: 'WWII begins', body: 'The war.', depth: 0, collapsed: false, status: 'normal' as const, origin: 'ai' as const },
      { id: 'n1', type: 'process_step' as const, title: 'Invasion of Poland', body: '1939.', depth: 1, collapsed: false, status: 'normal' as const, origin: 'ai' as const },
      { id: 'n2', type: 'process_step' as const, title: 'Pearl Harbor', body: '1941.', depth: 2, collapsed: false, status: 'normal' as const, origin: 'ai' as const },
      { id: 'n3', type: 'process_step' as const, title: 'D-Day', body: '1944.', depth: 3, collapsed: false, status: 'normal' as const, origin: 'ai' as const },
    ],
    edges: [
      { id: 'e0', source: 'n0', target: 'n1', type: 'leads_to' as const, label: '' },
      { id: 'e1', source: 'n1', target: 'n2', type: 'leads_to' as const, label: '' },
      { id: 'e2', source: 'n2', target: 'n3', type: 'leads_to' as const, label: '' },
    ],
    layout_cache: {},
  };

  it('rewrites model-numbered depths to the structurally correct value', () => {
    const parsed = aiGeneratedGraphSchema.safeParse(timeline);
    if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues.slice(0, 3), null, 2));
    expect(parsed.data.nodes.map((n) => n.depth)).toEqual([0, 1, 1, 1]);
  });
});
