import { TOPIC_FIXTURES, type EvalTopicFixture } from './topics';
import { PETROS_QUALITY_CORPUS_VERSION, type SessionGoal } from '../contracts';

export type QualityCase = {
  id: string;
  topic: EvalTopicFixture;
  subject: string;
  gradeBand: 'middle' | 'secondary' | 'senior_secondary' | 'undergraduate';
  goal: SessionGoal;
  language: 'en' | 'hinglish';
  timeBudgetMinutes: number;
  expectedMoves: string[];
  forbiddenMoves: string[];
  criticalFacts: string[];
  rubricAnchors: string[];
  seed: number;
  entryMode?: 'snap_question' | 'handwriting' | 'voice' | 'five_minute';
  provenance: { licence: 'CC0-1.0'; source: 'Edrion-authored synthetic fixture'; copyrightedText: false };
};

const SUBJECT_BY_KEY: Array<[RegExp, string]> = [
  [/integration|quadratic|probability|matrix|vector|boolean/, 'Mathematics'],
  [/photosynthesis|cell|heart|genetic|enzyme|ecosystem/, 'Biology'],
  [/ohm|thermo|newton/, 'Physics'],
  [/acid|periodic/, 'Chemistry'],
  [/revolution|empire|war|renaissance/, 'History'],
  [/python|loop|array|sql|recursion|flexbox|git|api-rest/, 'Computer Science'],
  [/constitution|democracy/, 'Civics'],
  [/citation/, 'Academic Writing'],
  [/map-projection/, 'Geography'],
];

function subjectFor(key: string): string {
  return SUBJECT_BY_KEY.find(([pattern]) => pattern.test(key))?.[1] ?? 'General Studies';
}

function goalFor(index: number): SessionGoal {
  return (['learn', 'revise', 'repair', 'doubt'] as const)[index % 4]!;
}

function expectedMoves(topic: EvalTopicFixture): string[] {
  const profile = topic.profile;
  const moves = ['predict_then_reveal'];
  if (profile.prerequisite_density === 'high') moves.push('prerequisite_check');
  if (profile.misconception_richness === 'high') moves.push('misconception_demolition');
  if (profile.native_representation === 'visual_spatial') moves.push('diagram');
  if (profile.native_representation === 'temporal_sequence') moves.push('story');
  if (profile.knowledge_type.includes('procedural') || profile.knowledge_type.includes('skill')) moves.push('worked_example');
  moves.push('recall_check', 'synthesis');
  return [...new Set(moves)];
}

function forbiddenMoves(topic: EvalTopicFixture): string[] {
  const forbidden: string[] = [];
  if (topic.profile.math_load === 'none') forbidden.push('derivation');
  if (topic.profile.misconception_richness === 'low') forbidden.push('misconception_demolition');
  return forbidden;
}

/**
 * Frozen Stage 5 manifest. Existing Stage 4 profile fixtures supply the coverage dimensions; this
 * layer adds evaluation-only goal, provenance, syllabus anchors and deterministic controls.
 */
export const QUALITY_CASES: QualityCase[] = TOPIC_FIXTURES.map((topic, index) => ({
  id: `pq-${String(index + 1).padStart(2, '0')}-${topic.key.replace(/^topic:/, '')}`,
  topic,
  subject: subjectFor(topic.key),
  gradeBand: index < 6 ? 'middle' : index < 22 ? 'secondary' : index < 28 ? 'senior_secondary' : 'undergraduate',
  goal: goalFor(index),
  language: index === 17 ? 'hinglish' : 'en',
  timeBudgetMinutes: goalFor(index) === 'doubt' ? 5 : goalFor(index) === 'repair' ? 12 : 15,
  expectedMoves: expectedMoves(topic),
  forbiddenMoves: forbiddenMoves(topic),
  criticalFacts: topic.answers.correct.slice(0, 3),
  rubricAnchors: [
    `At least one move must directly support: ${topic.answers.correct[0] ?? topic.title}.`,
    ...topic.answers.incorrect.slice(0, 2).map((value) => `Must not teach as true: ${value}.`),
  ],
  seed: 10_000 + index * 997,
  provenance: { licence: 'CC0-1.0', source: 'Edrion-authored synthetic fixture', copyrightedText: false },
}));

export const QUALITY_CORPUS_MANIFEST = {
  version: PETROS_QUALITY_CORPUS_VERSION,
  immutable: true,
  cases: QUALITY_CASES,
};

export function assertQualityCorpusCoverage(cases: QualityCase[] = QUALITY_CASES): void {
  if (cases.length !== 30) throw new Error(`quality corpus must contain 30 cases; received ${cases.length}`);
  const ids = new Set(cases.map((item) => item.id));
  if (ids.size !== cases.length) throw new Error('quality corpus case IDs must be unique');
  for (const goal of ['learn', 'revise', 'repair', 'doubt'] as const) {
    if (!cases.some((item) => item.goal === goal)) throw new Error(`quality corpus missing ${goal} goal`);
  }
  if (!cases.some((item) => item.language === 'hinglish')) throw new Error('quality corpus requires a mixed-language case');
  for (const knowledge of ['conceptual', 'procedural', 'factual', 'skill']) {
    if (cases.filter((item) => item.topic.profile.knowledge_type.includes(knowledge as never)).length < 6) {
      throw new Error(`quality corpus under-covers ${knowledge}`);
    }
  }
  for (const representation of ['visual_spatial', 'symbolic', 'verbal', 'temporal_sequence', 'comparative_table']) {
    if (cases.filter((item) => item.topic.profile.native_representation === representation).length < 4) {
      throw new Error(`quality corpus under-covers ${representation}`);
    }
  }
  if (cases.some((item) => !item.criticalFacts.length || !item.rubricAnchors.length)) {
    throw new Error('every quality case needs critical facts and rubric anchors');
  }
  if (cases.some((item) => item.provenance.copyrightedText)) {
    throw new Error('copyrighted fixture material is forbidden');
  }
}
