import type { SubjectFamily, TopicShapeV1 } from '@edrion/schemas';

export type LearnSurfaceId =
  | 'explanation'
  | 'worked_example'
  | 'question_set'
  | 'probe'
  | 'diagram'
  | 'timeline'
  | 'comparison_table'
  | 'graph_plot'
  | 'derivation'
  | 'code_trace'
  | 'annotated_source'
  | 'map_view'
  | 'ledger_entry'
  | 'system_notice'
  | 'checkpoint';

export type CapabilityId =
  | 'core.exposition'
  | 'quantitative.symbolic'
  | 'quantitative.graphical'
  | 'science.structure'
  | 'science.process'
  | 'historical.temporal'
  | 'historical.source'
  | 'language.lexical'
  | 'computing.trace'
  | 'literature.close_reading'
  | 'geo.spatial'
  | 'business.ledger'
  | 'general.compare';

type CapabilityDef = {
  id: CapabilityId;
  surfaces: LearnSurfaceId[];
  usageNotes: string;
};

export const CAPABILITIES: Record<CapabilityId, CapabilityDef> = {
  'core.exposition': {
    id: 'core.exposition',
    surfaces: ['explanation', 'worked_example', 'question_set', 'probe', 'system_notice', 'checkpoint'],
    usageNotes: 'Default teaching surfaces.',
  },
  'quantitative.symbolic': {
    id: 'quantitative.symbolic',
    surfaces: ['derivation', 'worked_example'],
    usageNotes: 'Use proper notation and step derivations.',
  },
  'quantitative.graphical': {
    id: 'quantitative.graphical',
    surfaces: ['graph_plot'],
    usageNotes: 'Interactive graphs when parameters matter.',
  },
  'science.structure': {
    id: 'science.structure',
    surfaces: ['diagram', 'comparison_table'],
    usageNotes: 'Labeled structures and comparison tables.',
  },
  'science.process': {
    id: 'science.process',
    surfaces: ['diagram'],
    usageNotes: 'Process flows and cycles.',
  },
  'historical.temporal': {
    id: 'historical.temporal',
    surfaces: ['timeline'],
    usageNotes: 'Timelines for temporal structure.',
  },
  'historical.source': {
    id: 'historical.source',
    surfaces: ['annotated_source', 'comparison_table'],
    usageNotes: 'Primary sources and contested readings.',
  },
  'language.lexical': {
    id: 'language.lexical',
    surfaces: ['explanation', 'question_set'],
    usageNotes: 'Audio-first language practice.',
  },
  'computing.trace': {
    id: 'computing.trace',
    surfaces: ['code_trace'],
    usageNotes: 'Execution traces and predict-the-output.',
  },
  'literature.close_reading': {
    id: 'literature.close_reading',
    surfaces: ['annotated_source'],
    usageNotes: 'Passage stays visible beside discussion.',
  },
  'geo.spatial': {
    id: 'geo.spatial',
    surfaces: ['map_view'],
    usageNotes: 'Maps as primary surface.',
  },
  'business.ledger': {
    id: 'business.ledger',
    surfaces: ['ledger_entry', 'worked_example'],
    usageNotes: 'Statement layouts and scenarios.',
  },
  'general.compare': {
    id: 'general.compare',
    surfaces: ['comparison_table'],
    usageNotes: 'Side-by-side contrasts.',
  },
};

type FamilyProfile = {
  always: CapabilityId[];
  unlockedBy?: Partial<Record<TopicShapeV1['wants_to_be'][number], CapabilityId[]>>;
  unlockedByLoad?: { math_load?: Partial<Record<TopicShapeV1['math_load'], CapabilityId[]>> };
  forbidden: LearnSurfaceId[];
};

export const SUBJECT_FAMILIES: Record<SubjectFamily, FamilyProfile> = {
  mathematics: {
    always: ['core.exposition', 'quantitative.symbolic', 'quantitative.graphical'],
    forbidden: ['timeline', 'annotated_source', 'map_view', 'code_trace'],
  },
  sciences: {
    always: ['core.exposition', 'science.structure', 'science.process', 'general.compare'],
    unlockedByLoad: { math_load: { heavy: ['quantitative.symbolic'] } },
    forbidden: ['code_trace', 'ledger_entry'],
  },
  history: {
    always: ['core.exposition', 'historical.temporal', 'historical.source', 'general.compare'],
    forbidden: ['derivation', 'graph_plot', 'code_trace'],
  },
  languages: {
    always: ['core.exposition', 'language.lexical'],
    forbidden: ['derivation', 'graph_plot', 'timeline'],
  },
  social_sciences: {
    always: ['core.exposition', 'general.compare', 'historical.source'],
    forbidden: ['code_trace', 'graph_plot'],
  },
  computing: {
    always: ['core.exposition', 'computing.trace'],
    forbidden: ['timeline', 'map_view'],
  },
  literature: {
    always: ['core.exposition', 'literature.close_reading'],
    forbidden: ['graph_plot', 'derivation', 'code_trace'],
  },
  geography: {
    always: ['core.exposition', 'geo.spatial', 'general.compare'],
    forbidden: ['code_trace', 'derivation'],
  },
  business: {
    always: ['core.exposition', 'business.ledger', 'general.compare'],
    forbidden: ['code_trace', 'map_view'],
  },
  general: {
    always: ['core.exposition', 'general.compare', 'science.structure'],
    forbidden: [],
  },
};

export type CapabilitySet = {
  family: SubjectFamily;
  capabilities: CapabilityId[];
  surfaces: Set<LearnSurfaceId>;
  forbidden: Set<LearnSurfaceId>;
};

export function resolveCapabilities(shape: TopicShapeV1): CapabilitySet {
  const profile = SUBJECT_FAMILIES[shape.subject_family] ?? SUBJECT_FAMILIES.general;
  const caps = new Set<CapabilityId>(profile.always);

  for (const rep of shape.wants_to_be) {
    for (const id of profile.unlockedBy?.[rep] ?? []) caps.add(id);
  }
  for (const id of profile.unlockedByLoad?.math_load?.[shape.math_load] ?? []) caps.add(id);

  const surfaces = new Set<LearnSurfaceId>();
  for (const id of caps) {
    for (const s of CAPABILITIES[id].surfaces) surfaces.add(s);
  }
  for (const f of profile.forbidden) surfaces.delete(f);

  return {
    family: shape.subject_family,
    capabilities: [...caps],
    surfaces,
    forbidden: new Set(profile.forbidden),
  };
}

export function assertSurfaceAllowed(set: CapabilitySet, surface: LearnSurfaceId): boolean {
  if (set.forbidden.has(surface)) return false;
  return set.surfaces.has(surface);
}
