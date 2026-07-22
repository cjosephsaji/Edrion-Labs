/**
 * Shared pure term aggregate — single GPA/standing implementation for Results + report cards.
 */
export type TermAggregateInput = {
  entries: Array<{
    subjectId: string;
    marksObtained: number;
    maxMarks: number;
    credits?: number | null;
    weight?: number | null;
  }>;
  /** When 'gpa', credit-weighted grade points; when 'percentage', weighted %; when 'none', pct only. */
  formula?: 'gpa' | 'percentage' | 'none';
  gradeBoundaries?: Array<{ minPct: number; grade: string; gradePoint?: number }>;
};

export type TermAggregateResult = {
  totalObtained: number;
  totalMax: number;
  percentage: number;
  gpa: number | null;
  grade: string | null;
  standing: string;
};

function gradeFromPct(
  pct: number,
  boundaries: Array<{ minPct: number; grade: string; gradePoint?: number }>,
): { grade: string; gradePoint: number } | null {
  const sorted = [...boundaries].sort((a, b) => b.minPct - a.minPct);
  for (const b of sorted) {
    if (pct >= b.minPct) {
      return { grade: b.grade, gradePoint: b.gradePoint ?? 0 };
    }
  }
  return null;
}

export function computeTermAggregate(input: TermAggregateInput): TermAggregateResult {
  const entries = input.entries.filter((e) => e.maxMarks > 0);
  let totalObtained = 0;
  let totalMax = 0;
  let creditPointSum = 0;
  let creditSum = 0;

  for (const e of entries) {
    const w = e.weight ?? 1;
    totalObtained += e.marksObtained * w;
    totalMax += e.maxMarks * w;
    const credits = e.credits ?? null;
    if (credits != null && credits > 0) {
      const pct = (e.marksObtained / e.maxMarks) * 100;
      const g = gradeFromPct(pct, input.gradeBoundaries ?? defaultBoundaries());
      creditPointSum += (g?.gradePoint ?? 0) * credits;
      creditSum += credits;
    }
  }

  const percentage = totalMax > 0 ? Math.round((totalObtained / totalMax) * 10000) / 100 : 0;
  const letter = gradeFromPct(percentage, input.gradeBoundaries ?? defaultBoundaries());
  const formula = input.formula ?? (creditSum > 0 ? 'gpa' : 'percentage');
  const gpa =
    formula === 'gpa' && creditSum > 0
      ? Math.round((creditPointSum / creditSum) * 100) / 100
      : formula === 'none'
        ? null
        : letter
          ? Math.round((letter.gradePoint ?? 0) * 100) / 100
          : null;

  let standing = 'Pass';
  if (percentage < 33) standing = 'Fail';
  else if (percentage >= 75) standing = 'Distinction';
  else if (percentage >= 60) standing = 'First Class';
  else if (percentage >= 50) standing = 'Second Class';

  return {
    totalObtained: Math.round(totalObtained * 100) / 100,
    totalMax: Math.round(totalMax * 100) / 100,
    percentage,
    gpa,
    grade: letter?.grade ?? null,
    standing,
  };
}

function defaultBoundaries() {
  return [
    { minPct: 90, grade: 'A+', gradePoint: 10 },
    { minPct: 80, grade: 'A', gradePoint: 9 },
    { minPct: 70, grade: 'B+', gradePoint: 8 },
    { minPct: 60, grade: 'B', gradePoint: 7 },
    { minPct: 50, grade: 'C', gradePoint: 6 },
    { minPct: 40, grade: 'D', gradePoint: 5 },
    { minPct: 33, grade: 'E', gradePoint: 4 },
    { minPct: 0, grade: 'F', gradePoint: 0 },
  ];
}
