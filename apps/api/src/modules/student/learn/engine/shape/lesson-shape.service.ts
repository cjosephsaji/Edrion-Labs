import { randomUUID } from 'node:crypto';
import type { LessonGoal, LessonShapeV1, TopicShapeV1 } from '@edrion/schemas';
import { lessonShapeV1Schema } from '@edrion/schemas';
import { openingSurfaceFor, selectArc } from '../shape/shape-grammar';

const GENERIC_LABELS = new Set([
  'introduction',
  'overview',
  'basics',
  'practice',
  'summary',
  'conclusion',
  'review',
]);

export function isGenericLabel(label: string, topicTitle: string): boolean {
  const lower = label.trim().toLowerCase();
  if (GENERIC_LABELS.has(lower)) return true;
  if (/^understanding\b/i.test(lower)) return true;
  if (/^what is\b/i.test(lower)) return true;
  const titleToken = topicTitle.trim().toLowerCase();
  if (titleToken && lower === `understanding ${titleToken}`) return true;
  return false;
}

/** Labels checkpoints from spine when present; never reuses a spine label across roles. */
export function buildLessonShape(
  shape: TopicShapeV1,
  goal: LessonGoal,
  topicTitle: string,
): LessonShapeV1 {
  const arc = selectArc(shape, goal);
  const usedLabels = new Set<string>();
  const checkpoints = arc.roles.map((role, i) => {
    const spineNode = shape.spine[i];
    let label = spineNode?.label;
    const normalized = label?.trim().toLowerCase() ?? '';
    if (
      !label ||
      isGenericLabel(label, topicTitle) ||
      (normalized && usedLabels.has(normalized))
    ) {
      label = roleLabelFallback(role, topicTitle, i);
    }
    usedLabels.add(label.trim().toLowerCase());
    return {
      id: randomUUID(),
      role,
      label,
      spine_refs: spineNode ? [i] : shape.spine.length ? [Math.min(i, shape.spine.length - 1)] : [],
      target_surfaces: [],
    };
  });

  const openingSurface = openingSurfaceFor(shape, arc);
  const framing =
    shape.spine[0]?.gist != null
      ? shape.spine[0].gist
      : `Let's build a clear picture of ${topicTitle} — one idea at a time.`;

  return lessonShapeV1Schema.parse({
    v: 1,
    arc_id: arc.id,
    checkpoints,
    opening: { surface: openingSurface, framing_md: framing },
    adaptations_announced: [],
  });
}

function roleLabelFallback(
  role: LessonShapeV1['checkpoints'][number]['role'],
  topicTitle: string,
  index: number,
): string {
  const short = topicTitle.length > 40 ? `${topicTitle.slice(0, 37)}…` : topicTitle;
  switch (role) {
    case 'ground':
      return `What ${short} rests on`;
    case 'demonstrate':
      return 'A worked case';
    case 'decision_point':
      return 'The choice that matters';
    case 'mechanism':
      return 'How it actually works';
    case 'chain':
      return index === 0 ? 'What led here' : 'What followed';
    case 'contrast':
      return 'Two readings side by side';
    case 'interpretation':
      return 'Why historians disagree';
    case 'apply':
      return 'Try it';
    case 'edge':
      return 'The harder case';
    case 'consolidate':
      return 'In your own words';
    default:
      return `Step ${index + 1}`;
  }
}
