/** Pedagogy matrix: domain archetype × learner stage → generation directives. */

export type DomainArchetype =
  | 'procedural_quantitative'
  | 'conceptual_mechanistic'
  | 'narrative_interpretive'
  | 'language_expression'
  | 'memorization_taxonomy'
  | 'applied_creative';

export type LearnerStage = 'school_junior' | 'school_senior' | 'college' | 'adult_independent';

export interface PedagogyDirectives {
  visualBlocks: boolean;
  workedExampleStyle: 'stepwise_numeric' | 'narrative' | 'diagram_first' | 'minimal';
  checkpointStyle: 'mcq' | 'explain_back_first' | 'mixed';
  practiceStyle: 'numeric' | 'short_answer' | 'creative' | 'recall';
}

const ARCHETYPES: DomainArchetype[] = [
  'procedural_quantitative',
  'conceptual_mechanistic',
  'narrative_interpretive',
  'language_expression',
  'memorization_taxonomy',
  'applied_creative',
];

const STAGES: LearnerStage[] = ['school_junior', 'school_senior', 'college', 'adult_independent'];

function cell(
  visualBlocks: boolean,
  workedExampleStyle: PedagogyDirectives['workedExampleStyle'],
  checkpointStyle: PedagogyDirectives['checkpointStyle'],
  practiceStyle: PedagogyDirectives['practiceStyle'],
): PedagogyDirectives {
  return { visualBlocks, workedExampleStyle, checkpointStyle, practiceStyle };
}

/** 6 archetypes × 4 stages = 24 cells. */
const MATRIX: Record<DomainArchetype, Record<LearnerStage, PedagogyDirectives>> = {
  procedural_quantitative: {
    school_junior: cell(true, 'stepwise_numeric', 'mcq', 'numeric'),
    school_senior: cell(true, 'stepwise_numeric', 'mcq', 'numeric'),
    college: cell(true, 'stepwise_numeric', 'mixed', 'numeric'),
    adult_independent: cell(true, 'stepwise_numeric', 'mixed', 'numeric'),
  },
  conceptual_mechanistic: {
    school_junior: cell(true, 'diagram_first', 'mcq', 'short_answer'),
    school_senior: cell(true, 'diagram_first', 'mixed', 'short_answer'),
    college: cell(true, 'narrative', 'explain_back_first', 'short_answer'),
    adult_independent: cell(false, 'narrative', 'explain_back_first', 'short_answer'),
  },
  narrative_interpretive: {
    school_junior: cell(false, 'narrative', 'mcq', 'short_answer'),
    school_senior: cell(false, 'narrative', 'explain_back_first', 'short_answer'),
    college: cell(false, 'narrative', 'explain_back_first', 'creative'),
    adult_independent: cell(false, 'minimal', 'explain_back_first', 'creative'),
  },
  language_expression: {
    school_junior: cell(false, 'narrative', 'mcq', 'short_answer'),
    school_senior: cell(false, 'narrative', 'explain_back_first', 'creative'),
    college: cell(false, 'minimal', 'explain_back_first', 'creative'),
    adult_independent: cell(false, 'minimal', 'explain_back_first', 'creative'),
  },
  memorization_taxonomy: {
    school_junior: cell(true, 'stepwise_numeric', 'mcq', 'recall'),
    school_senior: cell(false, 'stepwise_numeric', 'mcq', 'recall'),
    college: cell(false, 'minimal', 'mixed', 'recall'),
    adult_independent: cell(false, 'minimal', 'mixed', 'recall'),
  },
  applied_creative: {
    school_junior: cell(true, 'diagram_first', 'mcq', 'creative'),
    school_senior: cell(true, 'narrative', 'mixed', 'creative'),
    college: cell(false, 'narrative', 'explain_back_first', 'creative'),
    adult_independent: cell(false, 'minimal', 'explain_back_first', 'creative'),
  },
};

export function resolveLearnerStage(persona: 'school' | 'college' | 'independent', gradeLevel?: string | null): LearnerStage {
  if (persona === 'independent') return 'adult_independent';
  if (persona === 'college') return 'college';
  const grade = parseInt(gradeLevel ?? '8', 10);
  return grade <= 8 ? 'school_junior' : 'school_senior';
}

export function getPedagogyDirectives(archetype: DomainArchetype, stage: LearnerStage): PedagogyDirectives {
  return MATRIX[archetype]?.[stage] ?? MATRIX.procedural_quantitative.school_junior;
}

export function listMatrixCells(): Array<{ archetype: DomainArchetype; stage: LearnerStage; directives: PedagogyDirectives }> {
  const out: Array<{ archetype: DomainArchetype; stage: LearnerStage; directives: PedagogyDirectives }> = [];
  for (const archetype of ARCHETYPES) {
    for (const stage of STAGES) {
      out.push({ archetype, stage, directives: MATRIX[archetype][stage] });
    }
  }
  return out;
}
