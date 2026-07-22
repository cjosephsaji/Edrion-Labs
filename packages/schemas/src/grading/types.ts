export type GradingSchemeKind = 'points_10' | 'cbse' | 'us_4' | 'percentage';

export type GpaFormula = 'credit_weighted' | 'simple_average' | 'none';

export interface GradingBand {
  grade: string;
  min_pct: number;
  grade_points: number | null;
  is_pass: boolean;
}

export interface SchemeSnapshot {
  kind: GradingSchemeKind;
  bands: GradingBand[];
  gpa_formula: GpaFormula;
}

export type AssessmentRef = { exam_id: string } | { assessment_name: string };

export interface WeightMapComponent {
  key: string;
  label: string;
  weight_pct: number;
  assessments: AssessmentRef[];
  aggregation: 'sum' | 'average' | 'best_n';
  n?: number;
}

export interface WeightMap {
  components: WeightMapComponent[];
  /** Resolved credits for GPA (null = credits not set). */
  credits?: number | null;
}

export interface GradeEntryInput {
  exam_id?: string | null;
  assessment_name: string;
  marks_obtained: number;
  max_marks: number;
  published: boolean;
}

export interface ComponentStanding {
  key: string;
  label: string;
  weight_pct: number;
  released: boolean;
  score: number | null;
  max: number | null;
  pct: number | null;
}

export interface StandingResult {
  weighted_pct: number;
  open_weight_pct: number;
  grade: string | null;
  grade_points: number | null;
  is_pass: boolean | null;
  per_component: ComponentStanding[];
  credits_not_set?: boolean;
}

export interface NeededComponent {
  component_key: string;
  needed_score: number;
  max: number;
}

export interface NeededResult {
  achievable: boolean;
  needed: NeededComponent[];
  minimal_total_pct: number | null;
  best_possible_grade: string | null;
}
