import type {
  AssessmentRef,
  ComponentStanding,
  GradeEntryInput,
  GradingBand,
  NeededComponent,
  NeededResult,
  SchemeSnapshot,
  StandingResult,
  WeightMap,
  WeightMapComponent,
} from './types';

function matchesAssessment(entry: GradeEntryInput, ref: AssessmentRef): boolean {
  if ('exam_id' in ref && ref.exam_id) return entry.exam_id === ref.exam_id;
  if ('assessment_name' in ref && ref.assessment_name) {
    return entry.assessment_name === ref.assessment_name;
  }
  return false;
}

function matchingEntries(component: WeightMapComponent, entries: GradeEntryInput[]): GradeEntryInput[] {
  return entries.filter((entry) =>
    component.assessments.some((ref) => matchesAssessment(entry, ref)),
  );
}

function aggregateComponent(
  component: WeightMapComponent,
  entries: GradeEntryInput[],
): { released: boolean; score: number | null; max: number | null; pct: number | null } {
  const matched = matchingEntries(component, entries);
  const published = matched.filter((e) => e.published);
  if (published.length === 0) {
    return { released: false, score: null, max: null, pct: null };
  }
  const ratios = published.map((e) => ({
    score: e.marks_obtained,
    max: e.max_marks,
    pct: e.max_marks > 0 ? (e.marks_obtained / e.max_marks) * 100 : 0,
  }));

  let score: number;
  let max: number;

  if (component.aggregation === 'sum') {
    score = ratios.reduce((s, r) => s + r.score, 0);
    max = ratios.reduce((s, r) => s + r.max, 0);
  } else if (component.aggregation === 'average') {
    const avgPct = ratios.reduce((s, r) => s + r.pct, 0) / ratios.length;
    max = 100;
    score = (avgPct / 100) * max;
  } else {
    const n = Math.max(1, component.n ?? 1);
    const sorted = [...ratios].sort((a, b) => b.pct - a.pct).slice(0, n);
    if (component.assessments.length === 1 || n === 1) {
      score = sorted[0]!.score;
      max = sorted[0]!.max;
    } else {
      score = sorted.reduce((s, r) => s + r.score, 0);
      max = sorted.reduce((s, r) => s + r.max, 0);
    }
  }

  const pct = max > 0 ? (score / max) * 100 : 0;
  return { released: true, score, max, pct };
}

export function lookupBand(pct: number, bands: GradingBand[]): GradingBand {
  const sorted = [...bands].sort((a, b) => b.min_pct - a.min_pct);
  for (const band of sorted) {
    if (pct >= band.min_pct) return band;
  }
  return sorted[sorted.length - 1]!;
}

export function computeStanding(
  scheme: SchemeSnapshot,
  weightMap: WeightMap,
  entries: GradeEntryInput[],
): StandingResult {
  let weightedPct = 0;
  let openWeight = 0;
  const perComponent: ComponentStanding[] = [];

  for (const component of weightMap.components) {
    const agg = aggregateComponent(component, entries);
    if (agg.released && agg.pct !== null) {
      weightedPct += (agg.pct / 100) * component.weight_pct;
    } else {
      openWeight += component.weight_pct;
    }
    perComponent.push({
      key: component.key,
      label: component.label,
      weight_pct: component.weight_pct,
      released: agg.released,
      score: agg.score,
      max: agg.max,
      pct: agg.pct,
    });
  }

  const normalizedPct =
    openWeight >= 100 ? weightedPct : (weightedPct / (100 - openWeight)) * 100;
  const displayPct = openWeight > 0 ? normalizedPct : weightedPct;
  const band = lookupBand(displayPct, scheme.bands);

  const creditsNotSet =
    scheme.gpa_formula === 'credit_weighted' && weightMap.credits === null;

  return {
    weighted_pct: Math.round(weightedPct * 100) / 100,
    open_weight_pct: openWeight,
    grade: band.grade,
    grade_points: band.grade_points,
    is_pass: band.is_pass,
    per_component: perComponent,
    ...(creditsNotSet ? { credits_not_set: true } : {}),
  };
}

function targetMinPct(targetGrade: string, bands: GradingBand[]): number | null {
  const band = bands.find((b) => b.grade === targetGrade);
  return band?.min_pct ?? null;
}

function scoreForTargetPct(
  targetPct: number,
  currentWeighted: number,
  openWeight: number,
  componentWeight: number,
  componentMax: number,
): number {
  const neededWeighted = targetPct * (1 - openWeight / 100);
  const shortfall = neededWeighted - currentWeighted;
  if (shortfall <= 0) return 0;
  const neededComponentPct = (shortfall / componentWeight) * 100;
  return Math.min(componentMax, Math.ceil((neededComponentPct / 100) * componentMax));
}

export function assertIntegerMark(value: number): number {
  if (!Number.isInteger(value)) {
    throw new Error(`Mark must be an integer; got ${value}`);
  }
  return value;
}

export function computeNeeded(
  scheme: SchemeSnapshot,
  weightMap: WeightMap,
  entries: GradeEntryInput[],
  targetGrade: string,
): NeededResult {
  const standing = computeStanding(scheme, weightMap, entries);
  const targetPct = targetMinPct(targetGrade, scheme.bands);
  if (targetPct === null) {
    return { achievable: false, needed: [], minimal_total_pct: null, best_possible_grade: standing.grade };
  }

  const openComponents = weightMap.components.filter((c) => {
    const row = standing.per_component.find((p) => p.key === c.key);
    return !row?.released;
  });

  if (openComponents.length === 0) {
    const currentBand = lookupBand(standing.weighted_pct, scheme.bands);
    return {
      achievable: (currentBand.min_pct ?? 0) >= targetPct,
      needed: [],
      minimal_total_pct: standing.weighted_pct,
      best_possible_grade: currentBand.grade,
    };
  }

  const bestStanding = computeStanding(
    scheme,
    {
      ...weightMap,
      components: weightMap.components.map((c) => ({
        ...c,
        assessments: c.assessments,
      })),
    },
    entries.map((e) => ({ ...e, published: true, marks_obtained: e.max_marks })),
  );
  const bestBand = lookupBand(
    bestStanding.open_weight_pct > 0
      ? (bestStanding.weighted_pct / (100 - bestStanding.open_weight_pct)) * 100
      : bestStanding.weighted_pct,
    scheme.bands,
  );
  if ((bestBand.min_pct ?? 0) < targetPct) {
    return {
      achievable: false,
      needed: [],
      minimal_total_pct: null,
      best_possible_grade: bestBand.grade,
    };
  }

  const openWeight = openComponents.reduce((s, c) => s + c.weight_pct, 0);
  const needed: NeededComponent[] = [];

  if (openComponents.length === 1) {
    const component = openComponents[0]!;
    const max = matchingEntries(component, entries)[0]?.max_marks ?? 100;
    const score = assertIntegerMark(
      scoreForTargetPct(
        targetPct,
        standing.weighted_pct,
        standing.open_weight_pct,
        component.weight_pct,
        max,
      ),
    );
    needed.push({ component_key: component.key, needed_score: score, max });
    const minimalTotal =
      standing.weighted_pct +
      (score / max) * component.weight_pct;
    return {
      achievable: true,
      needed,
      minimal_total_pct: Math.round(minimalTotal * 100) / 100,
      best_possible_grade: bestBand.grade,
    };
  }

  const minimalTotalPct =
    targetPct * (1 - standing.open_weight_pct / 100);
  const shortfall = minimalTotalPct - standing.weighted_pct;
  const perWeight = openWeight > 0 ? shortfall / openWeight : 0;

  for (const component of openComponents) {
    const max = matchingEntries(component, entries)[0]?.max_marks ?? 100;
    const componentPct = perWeight * (component.weight_pct / openWeight) * 100;
    const score = assertIntegerMark(Math.min(max, Math.ceil((componentPct / 100) * max)));
    needed.push({ component_key: component.key, needed_score: score, max });
  }

  return {
    achievable: true,
    needed,
    minimal_total_pct: Math.round(minimalTotalPct * 100) / 100,
    best_possible_grade: bestBand.grade,
  };
}
