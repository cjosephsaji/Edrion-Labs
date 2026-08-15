import { and, eq } from 'drizzle-orm';
import { schema as s } from '@edrion/database';
import type { DevSeedContext } from './_context.js';
import type { InstitutionSeedResult } from './institution.js';
import type { PeopleSeedResult } from './users.js';

const ALGORITHM_VERSION = 'petros.learner-model.stage6.v1';
const SCHEMA_VERSION = 'petros.learner-evidence.v1';
const TOPIC_ID = 'integration-by-parts';

/**
 * Contrasting, non-sensitive Stage 6 QA histories for two ordinary demo accounts.
 * `synthetic` remains false because that flag is reserved for isolated eval identities; the fixture
 * provenance is explicit in metadata and these rows exist only in a disposable development tenant.
 */
export async function seedPetrosLearnerModelFixtures(
  ctx: DevSeedContext,
  inst: InstitutionSeedResult,
  people: PeopleSeedResult,
): Promise<void> {
  const now = Date.now();
  const common = {
    institutionId: inst.institutionId,
    source: 'authorized_import',
    topicId: TOPIC_ID,
    prerequisiteConceptIds: ['algebraic-manipulation'],
    algorithmVersion: ALGORITHM_VERSION,
    schemaVersion: SCHEMA_VERSION,
    environment: 'production',
    synthetic: false,
    evaluatorVersion: 'stage6-dev-fixture-v1',
  };
  const at = (daysAgo: number, offset: number) =>
    new Date(now - daysAgo * 86_400_000 + offset * 60_000);
  const rows: Array<typeof s.petrosLearnerEvidenceEvents.$inferInsert> = [];

  for (let index = 0; index < 8; index += 1) {
    const wrong = index >= 6;
    rows.push({
      ...common,
      studentId: people.studentIds[0],
      sourceEventId: `stage6-visual-${index + 1}`,
      sourceRecordId: 'stage6-student-a-visual-series',
      conceptId: TOPIC_ID,
      evidenceKind: 'application',
      outcome: wrong ? 'wrong' : 'correct',
      creditBasisPoints: wrong ? 1_500 : 9_000,
      moveType: 'diagram',
      profileDimension: 'representation:visual',
      preEvidenceBasisPoints: 4_000,
      postEvidenceBasisPoints: wrong ? 2_000 : 8_800,
      responseTimeMs: 9_000 + index * 250,
      hintCount: wrong ? 1 : 0,
      confidenceBefore: index < 6 ? 'guessing' : 'sure',
      confidenceAfter: index < 6 ? 'think_so' : 'sure',
      errorCategory: wrong ? 'concept_gap' : 'none',
      errorConfidenceBasisPoints: 9_000,
      occurredAt: at(8 - index, index),
      metadata: { fixture: 'stage6_student_a', action: 'answer' },
    });
  }
  for (let index = 0; index < 3; index += 1) {
    rows.push({
      ...common,
      studentId: people.studentIds[0],
      sourceEventId: `stage6-visual-expand-${index + 1}`,
      sourceRecordId: 'stage6-student-a-depth-series',
      conceptId: TOPIC_ID,
      evidenceKind: 'engagement',
      outcome: 'correct',
      creditBasisPoints: 10_000,
      moveType: null,
      profileDimension: 'representation:visual',
      responseTimeMs: 13_500,
      confidenceBefore: null,
      confidenceAfter: null,
      errorCategory: 'none',
      errorConfidenceBasisPoints: 10_000,
      occurredAt: at(5 - index, index + 20),
      metadata: { fixture: 'stage6_student_a', action: 'expand' },
    });
  }
  rows.push({
    ...common,
    studentId: people.studentIds[0],
    sourceEventId: 'stage6-prerequisite-gap-a',
    sourceRecordId: 'stage6-student-a-prerequisite-check',
    conceptId: 'algebraic-manipulation',
    evidenceKind: 'prerequisite',
    outcome: 'wrong',
    creditBasisPoints: 1_000,
    moveType: 'prerequisite_check',
    profileDimension: 'representation:symbolic',
    preEvidenceBasisPoints: 4_000,
    postEvidenceBasisPoints: 1_000,
    responseTimeMs: 15_000,
    hintCount: 2,
    confidenceBefore: 'sure',
    confidenceAfter: 'think_so',
    errorCategory: 'prerequisite_gap',
    errorConfidenceBasisPoints: 9_500,
    occurredAt: at(1, 50),
    metadata: { fixture: 'stage6_student_a', action: 'answer' },
  });

  for (let index = 0; index < 8; index += 1) {
    rows.push({
      ...common,
      studentId: people.studentIds[1],
      sourceEventId: `stage6-worked-${index + 1}`,
      sourceRecordId: 'stage6-student-b-worked-series',
      conceptId: TOPIC_ID,
      evidenceKind: 'procedure',
      outcome: index === 7 ? 'partial' : 'correct',
      creditBasisPoints: index === 7 ? 6_000 : 9_500,
      moveType: 'worked_example',
      profileDimension: 'representation:sequential',
      preEvidenceBasisPoints: 4_500,
      postEvidenceBasisPoints: index === 7 ? 6_000 : 9_200,
      responseTimeMs: 5_500 + index * 200,
      hintCount: index === 7 ? 1 : 0,
      confidenceBefore: 'think_so',
      confidenceAfter: 'sure',
      errorCategory: index === 7 ? 'procedural_method' : 'none',
      errorConfidenceBasisPoints: 9_000,
      occurredAt: at(8 - index, index + 60),
      metadata: { fixture: 'stage6_student_b', action: 'answer' },
    });
  }
  for (let index = 0; index < 3; index += 1) {
    rows.push({
      ...common,
      studentId: people.studentIds[1],
      sourceEventId: `stage6-worked-read-${index + 1}`,
      sourceRecordId: 'stage6-student-b-depth-series',
      conceptId: TOPIC_ID,
      evidenceKind: 'engagement',
      outcome: 'skipped',
      creditBasisPoints: 0,
      moveType: null,
      profileDimension: 'representation:sequential',
      responseTimeMs: 3_000,
      confidenceBefore: null,
      confidenceAfter: null,
      errorCategory: 'none',
      errorConfidenceBasisPoints: 10_000,
      occurredAt: at(5 - index, index + 80),
      metadata: { fixture: 'stage6_student_b', action: 'skip' },
    });
  }
  for (let index = 0; index < 3; index += 1) {
    rows.push({
      ...common,
      studentId: people.studentIds[1],
      sourceEventId: `stage6-procedural-error-${index + 1}`,
      sourceRecordId: 'stage6-student-b-procedure-errors',
      conceptId: TOPIC_ID,
      evidenceKind: 'procedure',
      outcome: 'wrong',
      creditBasisPoints: 2_000,
      moveType: null,
      profileDimension: 'method-choice',
      responseTimeMs: 7_000,
      hintCount: 1,
      confidenceBefore: 'think_so',
      confidenceAfter: 'think_so',
      errorCategory: 'procedural_method',
      errorConfidenceBasisPoints: 9_500,
      occurredAt: at(3 - index, index + 100),
      metadata: { fixture: 'stage6_student_b', action: 'answer' },
    });
  }

  await ctx.db.insert(s.petrosLearnerEvidenceEvents).values(rows).onConflictDoNothing();
  for (const [studentId, label] of [
    [people.studentIds[0], 'Student A visual/fragile/prerequisite fixture'],
    [people.studentIds[1], 'Student B worked/reliable/procedural fixture'],
  ] as const) {
    const existing = await ctx.db
      .select({ id: s.petrosLearnerModelJobs.id })
      .from(s.petrosLearnerModelJobs)
      .where(
        and(
          eq(s.petrosLearnerModelJobs.institutionId, inst.institutionId),
          eq(s.petrosLearnerModelJobs.studentId, studentId),
          eq(s.petrosLearnerModelJobs.reason, label),
        ),
      )
      .limit(1);
    if (!existing[0]) {
      await ctx.db.insert(s.petrosLearnerModelJobs).values({
        institutionId: inst.institutionId,
        studentId,
        algorithmVersion: ALGORITHM_VERSION,
        reason: label,
        requestedBy: 'dev-seed',
        totalEvents: rows.filter((row) => row.studentId === studentId).length,
      });
    }
  }
}
