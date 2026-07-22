import type { SchemeSnapshot } from './types';

/** Preset band tables — clone-on-first-visit templates per hyperspec §1.1. */
export const SCHEME_PRESETS: Record<string, Omit<SchemeSnapshot, 'kind'> & { name: string; kind: SchemeSnapshot['kind'] }> = {
  points_10: {
    name: 'Indian 10-point (default)',
    kind: 'points_10',
    gpa_formula: 'credit_weighted',
    bands: [
      { grade: 'O', min_pct: 91, grade_points: 10, is_pass: true },
      { grade: 'A+', min_pct: 81, grade_points: 9, is_pass: true },
      { grade: 'A', min_pct: 71, grade_points: 8, is_pass: true },
      { grade: 'B+', min_pct: 61, grade_points: 7, is_pass: true },
      { grade: 'B', min_pct: 51, grade_points: 6, is_pass: true },
      { grade: 'C', min_pct: 41, grade_points: 5, is_pass: true },
      { grade: 'F', min_pct: 0, grade_points: 0, is_pass: false },
    ],
  },
  cbse: {
    name: 'CBSE',
    kind: 'cbse',
    gpa_formula: 'credit_weighted',
    bands: [
      { grade: 'A1', min_pct: 91, grade_points: 10, is_pass: true },
      { grade: 'A2', min_pct: 81, grade_points: 9, is_pass: true },
      { grade: 'B1', min_pct: 71, grade_points: 8, is_pass: true },
      { grade: 'B2', min_pct: 61, grade_points: 7, is_pass: true },
      { grade: 'C1', min_pct: 51, grade_points: 6, is_pass: true },
      { grade: 'C2', min_pct: 41, grade_points: 5, is_pass: true },
      { grade: 'D', min_pct: 33, grade_points: 4, is_pass: true },
      { grade: 'E', min_pct: 0, grade_points: 0, is_pass: false },
    ],
  },
  us_4: {
    name: 'US 4.0',
    kind: 'us_4',
    gpa_formula: 'credit_weighted',
    bands: [
      { grade: 'A', min_pct: 93, grade_points: 4.0, is_pass: true },
      { grade: 'A−', min_pct: 90, grade_points: 3.7, is_pass: true },
      { grade: 'B+', min_pct: 87, grade_points: 3.3, is_pass: true },
      { grade: 'B', min_pct: 83, grade_points: 3.0, is_pass: true },
      { grade: 'B−', min_pct: 80, grade_points: 2.7, is_pass: true },
      { grade: 'C+', min_pct: 77, grade_points: 2.3, is_pass: true },
      { grade: 'C', min_pct: 73, grade_points: 2.0, is_pass: true },
      { grade: 'C−', min_pct: 70, grade_points: 1.7, is_pass: true },
      { grade: 'D', min_pct: 60, grade_points: 1.0, is_pass: true },
      { grade: 'F', min_pct: 0, grade_points: 0, is_pass: false },
    ],
  },
  percentage: {
    name: 'Percentage-only',
    kind: 'percentage',
    gpa_formula: 'none',
    bands: [
      { grade: 'Pass', min_pct: 40, grade_points: null, is_pass: true },
      { grade: 'Fail', min_pct: 0, grade_points: null, is_pass: false },
    ],
  },
};

export function presetSnapshot(kind: SchemeSnapshot['kind']): SchemeSnapshot {
  const preset = SCHEME_PRESETS[kind];
  return { kind: preset.kind, bands: preset.bands, gpa_formula: preset.gpa_formula };
}
