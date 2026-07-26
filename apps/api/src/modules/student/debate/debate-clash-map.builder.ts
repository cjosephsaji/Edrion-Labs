import type { CanvasGraph } from '@edrion/schemas';

const NODE_BUDGET = 40;

export interface ClashMapInput {
  debateRoundId: string;
  clashes: Array<{
    id: string;
    title: string;
    summary: string;
    winner: 'proposition' | 'opposition' | 'tied';
    weight: number;
    propArgumentRefs: string[];
    oppArgumentRefs: string[];
  }>;
  motionTitle: string;
}

export function buildClashMapGraph(input: ClashMapInput): CanvasGraph {
  const nodes: CanvasGraph['nodes'] = [
    {
      id: 'topic',
      type: 'concept',
      title: input.motionTitle.slice(0, 80),
      body: 'Round motion.',
      depth: 0,
      collapsed: false,
      status: 'normal',
      origin: 'ai',
    },
  ];
  const edges: CanvasGraph['edges'] = [];
  const groups: NonNullable<CanvasGraph['groups']> = [
    { id: 'pro', label: 'Proposition', color_token: 'emerald' },
    { id: 'con', label: 'Opposition', color_token: 'amber' },
  ];

  let nodeCount = 1;
  for (const clash of input.clashes) {
    if (nodeCount >= NODE_BUDGET) break;
    const groupId = `clash-${clash.id}`;
    groups.push({
      id: groupId,
      label: clash.title,
      color_token: 'slate',
    });
    for (const ref of clash.propArgumentRefs) {
      if (nodeCount >= NODE_BUDGET) break;
      const nodeId = `pro-${ref}`;
      nodes.push({
        id: nodeId,
        type: 'concept',
        title: ref,
        body: clash.summary,
        depth: 1,
        collapsed: false,
        status: 'normal',
        origin: 'ai',
        group_id: 'pro',
      });
      edges.push({ id: `e-${nodeId}-topic`, source: nodeId, target: 'topic', type: 'part_of' });
      nodeCount++;
    }
    for (const ref of clash.oppArgumentRefs) {
      if (nodeCount >= NODE_BUDGET) break;
      const nodeId = `opp-${ref}`;
      nodes.push({
        id: nodeId,
        type: 'concept',
        title: ref,
        body: clash.summary,
        depth: 1,
        collapsed: false,
        status: 'normal',
        origin: 'ai',
        group_id: 'con',
      });
      edges.push({ id: `e-${nodeId}-topic`, source: nodeId, target: 'topic', type: 'part_of' });
      if (clash.propArgumentRefs[0]) {
        edges.push({
          id: `clash-${nodeId}-${clash.propArgumentRefs[0]}`,
          source: nodeId,
          target: `pro-${clash.propArgumentRefs[0]}`,
          type: 'clash',
          label: clash.title,
        });
      }
      nodeCount++;
    }
  }

  return {
    graph_schema_version: 1,
    title: `Clash map — ${input.motionTitle.slice(0, 48)}`,
    archetype: 'comparison',
    root_node_id: 'topic',
    groups,
    nodes,
    edges,
    layout_cache: {},
  };
}
