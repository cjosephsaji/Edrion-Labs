export type GradeResult = {
  correct: boolean | null;
  confidence: 'high' | 'low';
  feedback?: string;
};

export type InstantGradeInput =
  | { kind: 'mcq'; correctOptionId: string; selectedOptionId: string }
  | { kind: 'numeric'; expected: number; tolerance: number; given: number }
  | {
      kind: 'short_text';
      mustContain: string[];
      synonyms?: Record<string, string[]>;
      given: string;
    };

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Client copy of server instant-grader — keep in sync. */
export function gradeInstant(input: InstantGradeInput): GradeResult {
  if (input.kind === 'mcq') {
    return {
      correct: input.selectedOptionId === input.correctOptionId,
      confidence: 'high',
    };
  }
  if (input.kind === 'numeric') {
    return {
      correct: Math.abs(input.given - input.expected) <= input.tolerance,
      confidence: 'high',
    };
  }
  const given = normalize(input.given);
  if (!given) return { correct: false, confidence: 'high', feedback: 'Say a bit more.' };
  const hits = input.mustContain.every((token) => {
    const variants = [token, ...(input.synonyms?.[token] ?? [])].map(normalize);
    return variants.some((v) => given.includes(v));
  });
  if (hits) return { correct: true, confidence: 'high' };
  return {
    correct: null,
    confidence: 'low',
    feedback: "Recorded — I couldn't check this one automatically.",
  };
}
