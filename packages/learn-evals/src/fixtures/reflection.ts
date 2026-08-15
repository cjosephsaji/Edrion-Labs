export const REFLECTION_QUALITY_CASES = [
  {
    id: 'reflection-untouched-honesty',
    surface: 'knowledge_map',
    copy: 'Not attempted: there is no learner evidence for this topic yet.',
    explanation: 'Zero learner evidence is shown separately from not mastered.',
    requiresUncertainty: false,
    requiresTentativeLabel: false,
  },
  {
    id: 'reflection-ranking-specificity',
    surface: 'recommendation',
    copy: 'Vectors is a published prerequisite for two affected topics, and current evidence is fragile.',
    explanation: 'Why this: prerequisite gap 5000 points; fragile knowledge 3500 points; evidence age 2 days.',
    requiresUncertainty: false,
    requiresTentativeLabel: false,
  },
  {
    id: 'reflection-low-sample-calibration',
    surface: 'calibration',
    copy: 'The calibration mirror stays hidden until at least 8 confidence-and-outcome pairs exist.',
    explanation: 'Only 3 paired predictions are available, so no calibration trait or score is shown.',
    requiresUncertainty: true,
    requiresTentativeLabel: false,
  },
  {
    id: 'reflection-session-recap-boundary',
    surface: 'recap',
    copy: 'Observed: you recovered after revising an earlier attempt. Tentative: in this session, the diagram may have helped.',
    explanation: 'The recap cites the recovery observation and does not turn one session into a durable preference.',
    requiresUncertainty: true,
    requiresTentativeLabel: true,
  },
  {
    id: 'reflection-gap-hypothesis',
    surface: 'gap_alarm',
    copy: 'Prerequisite hypothesis: vectors may be the shared blocker behind Forces and Momentum.',
    explanation: 'Three independent recent evidence items across two affected topics support one deduplicated 16-minute repair hypothesis.',
    requiresUncertainty: true,
    requiresTentativeLabel: false,
  },
] as const;

const DARK_PATTERN = /\b(urgent|hurry|falling behind|everyone else|leaderboard|streak repair|disappoint|lazy|gifted|genius|low ability|high ability|you always|you never)\b/i;
const EVIDENCE_SPECIFIC = /\b(evidence|observation|predictions?|paired|pairs?|prerequisite|topic|points|days|session|attempt)\b/i;
const UNCERTAINTY = /\b(hidden|tentative|may|hypothesis|no .* score|too little|insufficient)\b/i;

export function evaluateReflectionQuality(item: (typeof REFLECTION_QUALITY_CASES)[number]) {
  const combined = `${item.copy} ${item.explanation}`;
  const failures: string[] = [];
  if (DARK_PATTERN.test(combined)) failures.push('dark_pattern_copy');
  if (!EVIDENCE_SPECIFIC.test(item.explanation)) failures.push('explanation_specificity');
  if (item.requiresUncertainty && !UNCERTAINTY.test(combined)) failures.push('uncertainty_boundary');
  if (item.requiresTentativeLabel && !/Tentative:/i.test(item.copy)) failures.push('tentative_label');
  if (item.surface === 'knowledge_map' && !/no learner evidence/i.test(item.copy)) failures.push('untouched_honesty');
  if (/personality|learning style|innate|talent/i.test(combined)) failures.push('unsupported_durable_claim');
  return failures;
}
