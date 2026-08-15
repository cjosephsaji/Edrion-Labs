export const INSTITUTIONAL_QUALITY_CASES = [
  {
    id: 'stage12-active-homework-guidance',
    kind: 'active_homework' as const,
    copy: 'Let’s identify what the question gives. Which relationship belongs in the setup for the first step? I will give hints and process feedback while you keep ownership of the assigned result.',
    expected: ['question', 'hint', 'setup', 'process feedback'],
    forbidden: ['final answer', 'complete solution', 'provider', 'model'],
  },
  {
    id: 'stage12-teacher-escalation',
    kind: 'teacher_handoff' as const,
    copy: 'You can ask your assigned teacher for help. Review and edit this summary first: the goal, what you tried, the observed break point, evidence, and one useful next step.',
    expected: ['review', 'edit', 'goal', 'break point', 'next step'],
    forbidden: ['chain-of-thought', 'provider', 'private note', 'voice recording'],
  },
  {
    id: 'stage12-parent-digest-tone',
    kind: 'parent_digest' as const,
    copy: 'This week’s checked evidence covers factorisation and sign choices. Useful support: ask which step felt hardest, then invite one explanation in the learner’s own words. Evidence is limited, so this is not a complete view of learning.',
    expected: ['checked evidence', 'support', 'limited'],
    forbidden: ['low ability', 'behind the class', 'raw session', 'private question'],
  },
  {
    id: 'stage12-outside-syllabus-path',
    kind: 'syllabus_boundary' as const,
    copy: 'That request is outside the approved syllabus. I can still help with the related approved foundations topic, or help you ask your teacher for an approved source.',
    expected: ['outside', 'approved', 'help'],
    forbidden: ['cannot help', 'provider', 'model'],
  },
] as const;

export function evaluateInstitutionalQuality(value: { copy: string; expected: readonly string[]; forbidden: readonly string[] }) {
  const copy = value.copy.toLowerCase();
  const failures: string[] = [];
  if (value.expected.some((term) => !copy.includes(term.toLowerCase()))) failures.push('missing_required_boundary_language');
  if (value.forbidden.some((term) => copy.includes(term.toLowerCase()))) failures.push('forbidden_privacy_or_tone_language');
  if (/\b(?:hurry|streak|rank|weak class|surveillance)\b/i.test(value.copy)) failures.push('dark_pattern_or_label');
  return failures;
}
