export type GradeResult = {
  correct: boolean | null;
  confidence: 'high' | 'low';
  feedback?: string;
};

export type McqQuestion = {
  kind: 'mcq';
  correctOptionId: string;
  selectedOptionId: string;
};

export type NumericQuestion = {
  kind: 'numeric';
  expected: number;
  tolerance: number;
  given: number;
  unitOptional?: boolean;
};

export type ShortTextQuestion = {
  kind: 'short_text';
  mustContain: string[];
  synonyms?: Record<string, string[]>;
  given: string;
};

export type InstantGradeInput = McqQuestion | NumericQuestion | ShortTextQuestion;

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Pure grader — identical behaviour on server and client. No Nest imports. */
export function gradeInstant(input: InstantGradeInput): GradeResult {
  if (input.kind === 'mcq') {
    return {
      correct: input.selectedOptionId === input.correctOptionId,
      confidence: 'high',
    };
  }

  if (input.kind === 'numeric') {
    const ok = Math.abs(input.given - input.expected) <= input.tolerance;
    return { correct: ok, confidence: 'high' };
  }

  const given = normalize(input.given);
  if (!given) {
    return { correct: false, confidence: 'high', feedback: 'Say a bit more.' };
  }

  const hits = input.mustContain.every((token) => {
    const variants = [token, ...(input.synonyms?.[token] ?? [])].map(normalize);
    return variants.some((v) => given.includes(v));
  });

  if (hits) {
    return { correct: true, confidence: 'high' };
  }

  // Ambiguous — do not pretend.
  return {
    correct: null,
    confidence: 'low',
    feedback: "Recorded — I couldn't check this one automatically.",
  };
}
