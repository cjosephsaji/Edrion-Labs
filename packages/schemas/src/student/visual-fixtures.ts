import type { CanvasGraph } from './visuals';

/** Minimal two-group Debate clash-map fixture — validates against frozen CanvasGraph v1. */
export const debateClashFixture: CanvasGraph = {
  graph_schema_version: 1,
  title: 'Renewable vs fossil debate',
  archetype: 'comparison',
  root_node_id: 'topic',
  groups: [
    { id: 'pro', label: 'Renewables', color_token: 'emerald' },
    { id: 'con', label: 'Fossil fuels', color_token: 'amber' },
  ],
  nodes: [
    {
      id: 'topic',
      type: 'concept',
      title: 'Energy policy',
      body: 'Central debate topic.',
      depth: 0,
      collapsed: false,
      status: 'normal',
      origin: 'ai',
    },
    {
      id: 'pro-claim',
      type: 'concept',
      title: 'Lower long-run emissions',
      body: 'Wind and solar reduce carbon intensity over decades.',
      depth: 1,
      collapsed: false,
      status: 'normal',
      origin: 'ai',
      group_id: 'pro',
    },
    {
      id: 'con-claim',
      type: 'concept',
      title: 'Grid reliability concerns',
      body: 'Intermittency requires backup capacity.',
      depth: 1,
      collapsed: false,
      status: 'normal',
      origin: 'ai',
      group_id: 'con',
    },
  ],
  edges: [
    { id: 'e1', source: 'pro-claim', target: 'topic', type: 'part_of' },
    { id: 'e2', source: 'con-claim', target: 'topic', type: 'part_of' },
    {
      id: 'e3',
      source: 'pro-claim',
      target: 'con-claim',
      type: 'clash',
      label: 'Intermittency vs emissions',
    },
  ],
  layout_cache: {},
};

/** Edrion Learn visual-spawn fixture with session block provenance. */
export const learnSpawnFixture: CanvasGraph = {
  graph_schema_version: 1,
  title: 'Krebs cycle overview',
  archetype: 'mind_map',
  root_node_id: 'root',
  nodes: [
    {
      id: 'root',
      type: 'concept',
      title: 'Krebs cycle',
      body: 'Central metabolic pathway.',
      depth: 0,
      collapsed: false,
      status: 'normal',
      origin: 'ai',
      source_ref: {
        kind: 'learn_session_block',
        session_id: '550e8400-e29b-41d4-a716-446655440001',
        block_id: '550e8400-e29b-41d4-a716-446655440002',
      },
    },
    {
      id: 'citrate',
      type: 'process_step',
      title: 'Citrate formation',
      body: 'Acetyl-CoA joins oxaloacetate.',
      depth: 1,
      collapsed: false,
      status: 'normal',
      origin: 'ai',
      source_ref: {
        kind: 'learn_session_block',
        session_id: '550e8400-e29b-41d4-a716-446655440001',
        block_id: '550e8400-e29b-41d4-a716-446655440002',
      },
    },
  ],
  edges: [{ id: 'e1', source: 'citrate', target: 'root', type: 'part_of' }],
  groups: [],
  layout_cache: {},
};

/** Legacy mind-map fixture without optional v1 fields — must still parse. */
export const legacyMindMapFixture: CanvasGraph = {
  graph_schema_version: 1,
  title: 'Photosynthesis',
  archetype: 'mind_map',
  root_node_id: 'root',
  nodes: [
    {
      id: 'root',
      type: 'concept',
      title: 'Photosynthesis',
      body: 'Plants convert light to chemical energy.',
      depth: 0,
      collapsed: false,
      status: 'normal',
      origin: 'ai',
    },
    {
      id: 'leaf',
      type: 'concept',
      title: 'Chloroplast',
      body: 'Site of photosynthesis in plant cells.',
      depth: 1,
      collapsed: false,
      status: 'normal',
      origin: 'ai',
    },
  ],
  edges: [{ id: 'e1', source: 'leaf', target: 'root', type: 'part_of' }],
  groups: [],
  layout_cache: {},
};
