export type TermSubject = {
  subject_id: string;
  subject_name_snapshot: string;
  weighted_pct: number;
  open_weight_pct: number;
  grade: string | null;
  grade_points: number | null;
  credits?: number | null;
  credits_not_set?: boolean;
  components: Array<{
    key: string;
    label: string;
    weight_pct: number;
    released: boolean;
    score: number | null;
    max: number | null;
    pct: number | null;
  }>;
};

export type SchemePayload = {
  kind: string;
  bands: Array<{ grade: string; min_pct: number; grade_points: number | null; is_pass: boolean }>;
  gpa_formula: string;
};

export type TermResultsPayload = {
  term_id: string;
  scheme_id?: string;
  scheme_version?: number;
  scheme?: SchemePayload | null;
  term_gpa: string | null;
  term_pct: string | null;
  credits_earned: number;
  credits_total: number;
  is_complete: boolean;
  computed_at?: string;
  features?: { whatif: boolean };
  subjects: TermSubject[];
};

export async function fetchTermResults(termId?: string): Promise<TermResultsPayload> {
  const query = termId ? `?term_id=${termId}` : '';
  const res = await fetch(`/api/student/results/term${query}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load results');
  return res.json();
}

export function isResultsStale(computedAt?: string, cachedAt?: string) {
  if (!computedAt || !cachedAt) return false;
  return Date.parse(computedAt) > Date.parse(cachedAt);
}

export function schemeSnapshotFromPayload(payload: TermResultsPayload | undefined) {
  if (!payload?.scheme) return null;
  return {
    kind: payload.scheme.kind as 'points_10' | 'cbse' | 'us_4' | 'percentage',
    bands: payload.scheme.bands,
    gpa_formula: payload.scheme.gpa_formula as 'credit_weighted' | 'simple_average' | 'none',
  };
}
