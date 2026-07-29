import type { CheckpointRole, LessonGoal, TopicShapeV1 } from '@edrion/schemas';

export type ArcTemplate = {
  id: string;
  match: (shape: TopicShapeV1, goal: LessonGoal) => boolean;
  roles: CheckpointRole[];
};

const TEACHING_OPENING_SURFACES = new Set([
  'explanation',
  'worked_example',
  'diagram',
  'timeline',
  'comparison_table',
]);

export const TEACHING_SURFACES = TEACHING_OPENING_SURFACES;

/** First match wins. Goal overrides come first. */
export const ARC_TEMPLATES: ArcTemplate[] = [
  {
    id: 'goal.practice',
    match: (_s, goal) => goal === 'practice',
    roles: ['ground', 'apply', 'apply', 'edge', 'consolidate'],
  },
  {
    id: 'goal.revise',
    match: (_s, goal) => goal === 'revise',
    roles: ['apply', 'mechanism', 'apply', 'consolidate'],
  },
  {
    id: 'procedure.branching',
    match: (s) => s.kind === 'procedure' && s.has_decision_point,
    roles: ['ground', 'demonstrate', 'decision_point', 'apply', 'edge', 'consolidate'],
  },
  {
    id: 'procedure.linear',
    match: (s) => s.kind === 'procedure',
    roles: ['ground', 'demonstrate', 'apply', 'edge', 'consolidate'],
  },
  {
    id: 'concept.misconception',
    match: (s) => s.kind === 'concept' && s.misconceptions.length > 0,
    roles: ['ground', 'mechanism', 'contrast', 'apply', 'consolidate'],
  },
  {
    id: 'concept.plain',
    match: (s) => s.kind === 'concept',
    roles: ['ground', 'mechanism', 'apply', 'consolidate'],
  },
  {
    id: 'body.causal_contested',
    match: (s) => s.kind === 'body_of_material' && s.contested,
    roles: ['ground', 'chain', 'chain', 'interpretation', 'consolidate'],
  },
  {
    id: 'body.memory',
    match: (s) => s.kind === 'body_of_material',
    roles: ['ground', 'chain', 'apply', 'apply', 'consolidate'],
  },
  {
    id: 'skill.do',
    match: (s) => s.kind === 'skill',
    roles: ['ground', 'demonstrate', 'apply', 'apply', 'consolidate'],
  },
  {
    id: 'general.fallback',
    match: () => true,
    roles: ['ground', 'mechanism', 'apply', 'consolidate'],
  },
];

export function selectArc(shape: TopicShapeV1, goal: LessonGoal): ArcTemplate {
  const hit = ARC_TEMPLATES.find((a) => a.match(shape, goal));
  return hit ?? ARC_TEMPLATES[ARC_TEMPLATES.length - 1]!;
}

export function openingSurfaceFor(shape: TopicShapeV1, arc: ArcTemplate): string {
  if (shape.wants_to_be.includes('timeline_causal')) return 'timeline';
  if (shape.wants_to_be.includes('diagram_spatial')) return 'diagram';
  if (shape.kind === 'procedure' || shape.wants_to_be.includes('worked_procedure')) {
    return 'worked_example';
  }
  if (shape.wants_to_be.includes('comparison_contrast')) return 'comparison_table';
  void arc;
  return 'explanation';
}

export function roleSequencesDiffer(a: CheckpointRole[], b: CheckpointRole[]): boolean {
  if (a.length !== b.length) return true;
  return a.some((role, i) => role !== b[i]);
}
