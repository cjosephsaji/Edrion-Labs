import { describe, expect, it } from 'vitest';
import { computeNeeded, computeStanding, lookupBand } from './compute';
import { presetSnapshot } from './schemes';
import type { GradeEntryInput, WeightMap, WeightMapComponent } from './types';

const baseMap = (components: WeightMapComponent[]): WeightMap => ({
  components,
  credits: 4,
});

const entry = (
  overrides: Partial<GradeEntryInput> & Pick<GradeEntryInput, 'assessment_name'>,
): GradeEntryInput => ({
  exam_id: null,
  marks_obtained: 0,
  max_marks: 100,
  published: false,
  ...overrides,
});

const scenarios: Array<{
  name: string;
  kind: 'points_10' | 'cbse' | 'us_4' | 'percentage';
  weightMap: WeightMap;
  entries: GradeEntryInput[];
  assert: (standing: ReturnType<typeof computeStanding>) => void;
}> = [];

function addKindScenarios(kind: 'points_10' | 'cbse' | 'us_4' | 'percentage') {
  const scheme = presetSnapshot(kind);
  const cat: WeightMapComponent = {
    key: 'cat1',
    label: 'CAT-1',
    weight_pct: 30,
    assessments: [{ assessment_name: 'CAT-1' }],
    aggregation: 'sum',
  };
  const mid: WeightMapComponent = {
    key: 'mid',
    label: 'Midterm',
    weight_pct: 30,
    assessments: [{ assessment_name: 'Midterm' }],
    aggregation: 'sum',
  };
  const end: WeightMapComponent = {
    key: 'end',
    label: 'End-sem',
    weight_pct: 40,
    assessments: [{ assessment_name: 'End-sem' }],
    aggregation: 'sum',
  };
  const map = baseMap([cat, mid, end]);

  for (let i = 0; i < 12; i++) {
    const catScore = 60 + (i % 5) * 5;
    const midScore = 55 + (i % 4) * 6;
    const endReleased = i % 3 !== 0;
    const entries: GradeEntryInput[] = [
      entry({ assessment_name: 'CAT-1', marks_obtained: catScore, max_marks: 100, published: true }),
      entry({ assessment_name: 'Midterm', marks_obtained: midScore, max_marks: 100, published: true }),
    ];
    if (endReleased) {
      entries.push(
        entry({ assessment_name: 'End-sem', marks_obtained: 70 + i, max_marks: 100, published: true }),
      );
    }
    scenarios.push({
      name: `${kind} scenario ${i + 1}`,
      kind,
      weightMap: map,
      entries,
      assert: (standing) => {
        expect(standing.weighted_pct).toBeGreaterThanOrEqual(0);
        expect(standing.open_weight_pct).toBe(endReleased ? 0 : 40);
        if (endReleased) {
          expect(standing.grade).toBeTruthy();
        } else {
          expect(standing.grade).toBeTruthy();
          expect(standing.open_weight_pct).toBeGreaterThan(0);
        }
        const band = lookupBand(
          standing.open_weight_pct > 0
            ? (standing.weighted_pct / (100 - standing.open_weight_pct)) * 100
            : standing.weighted_pct,
          scheme.bands,
        );
        expect(standing.grade).toBe(band.grade);
      },
    });
  }
}

(['points_10', 'cbse', 'us_4', 'percentage'] as const).forEach(addKindScenarios);

describe('computeStanding', () => {
  it.each(scenarios)('$name', ({ kind, weightMap, entries, assert }) => {
    const scheme = presetSnapshot(kind);
    assert(computeStanding(scheme, weightMap, entries));
  });

  it('null credits sets credits_not_set under credit_weighted', () => {
    const scheme = presetSnapshot('points_10');
    const standing = computeStanding(
      scheme,
      { components: [], credits: null },
      [],
    );
    expect(standing.credits_not_set).toBe(true);
  });

  it('open_weight_pct = 0 when all components released', () => {
    const scheme = presetSnapshot('points_10');
    const map = baseMap([
      {
        key: 'final',
        label: 'Final',
        weight_pct: 100,
        assessments: [{ assessment_name: 'Final' }],
        aggregation: 'sum',
      },
    ]);
    const standing = computeStanding(scheme, map, [
      entry({ assessment_name: 'Final', marks_obtained: 82, max_marks: 100, published: true }),
    ]);
    expect(standing.open_weight_pct).toBe(0);
    expect(standing.grade).toBe('A+');
  });
});

describe('computeNeeded', () => {
  it('returns integer needed_score values', () => {
    const scheme = presetSnapshot('points_10');
    const map = baseMap([
      {
        key: 'end',
        label: 'End-sem',
        weight_pct: 100,
        assessments: [{ assessment_name: 'End-sem' }],
        aggregation: 'sum',
      },
    ]);
    const result = computeNeeded(
      scheme,
      map,
      [{ exam_id: null, assessment_name: 'End-sem', marks_obtained: 0, max_marks: 100, published: false }],
      'B+',
    );
    expect(result.achievable).toBe(true);
    expect(result.needed).toHaveLength(1);
    expect(Number.isInteger(result.needed[0]!.needed_score)).toBe(true);
  });

  it('unreachable target returns achievable false', () => {
    const scheme = presetSnapshot('points_10');
    const map = baseMap([
      {
        key: 'end',
        label: 'End-sem',
        weight_pct: 100,
        assessments: [{ assessment_name: 'End-sem' }],
        aggregation: 'sum',
      },
    ]);
    const result = computeNeeded(
      scheme,
      map,
      [entry({ assessment_name: 'End-sem', marks_obtained: 10, max_marks: 100, published: true })],
      'O',
    );
    expect(result.achievable).toBe(false);
    expect(result.best_possible_grade).toBeTruthy();
  });
});
