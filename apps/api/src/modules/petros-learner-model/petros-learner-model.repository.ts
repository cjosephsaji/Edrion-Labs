import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { assessmentAdmission, petrosAssessmentSchema } from '@edrion/schemas';
import { and, desc, eq, schema, type Database } from '@edrion/database';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { DATABASE } from '../../common/tokens';
import type { DerivedLearnerModel } from './petros-learner-model.engine';

export interface LearnerOwnerScope {
  institutionId: string;
  studentId: string;
}

@Injectable()
export class PetrosLearnerModelRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async learnerExists(scope: LearnerOwnerScope) {
    const [student] = await this.db
      .select({ id: schema.students.id })
      .from(schema.students)
      .where(
        and(
          eq(schema.students.id, scope.studentId),
          eq(schema.students.institutionId, scope.institutionId),
        ),
      )
      .limit(1);
    return Boolean(student);
  }

  async insertEvidence(values: typeof schema.petrosLearnerEvidenceEvents.$inferInsert) {
    if (values.assessment) {
      const assessment = petrosAssessmentSchema.parse(values.assessment);
      if (assessment.result.kind !== 'objective') throw new ConflictException({ code: 'PETROS_QUALITATIVE_ASSESSMENT_DISABLED' });
      if (assessment.origin !== 'legacy_adapter' && assessmentAdmission(assessment)) throw new ConflictException({ code: 'PETROS_ASSESSMENT_NOT_ADMITTED' });
      const result = assessment.result.judgment;
      if (result.status === 'evaluated' && (result.outcome !== values.outcome || result.creditBasisPoints !== values.creditBasisPoints))
        throw new ConflictException({ code: 'PETROS_ASSESSMENT_PROJECTION_MISMATCH' });
      values.assessment = assessment;
    }
    const [inserted] = await this.db
      .insert(schema.petrosLearnerEvidenceEvents)
      .values(values)
      .onConflictDoNothing()
      .returning();
    if (inserted) return { inserted: true as const, row: inserted };
    const [existing] = await this.db
      .select()
      .from(schema.petrosLearnerEvidenceEvents)
      .where(
        and(
          eq(schema.petrosLearnerEvidenceEvents.institutionId, values.institutionId),
          eq(schema.petrosLearnerEvidenceEvents.studentId, values.studentId),
          eq(schema.petrosLearnerEvidenceEvents.source, values.source),
          eq(schema.petrosLearnerEvidenceEvents.sourceEventId, values.sourceEventId),
        ),
      )
      .limit(1);
    // Legacy sources retain their historical first-write-wins replay semantics.
    if (values.assessment && values.assessment.origin !== 'legacy_adapter' && existing?.assessment && canonical(values.assessment) !== canonical(existing.assessment))
      throw new ConflictException({ code: 'PETROS_ASSESSMENT_EVENT_CONFLICT' });
    return { inserted: false as const, row: existing! };
  }

  listEvidence(scope: LearnerOwnerScope) {
    return this.db
      .select()
      .from(schema.petrosLearnerEvidenceEvents)
      .where(owner(schema.petrosLearnerEvidenceEvents, scope))
      .orderBy(
        schema.petrosLearnerEvidenceEvents.occurredAt,
        schema.petrosLearnerEvidenceEvents.id,
      );
  }

  async replaceDerived(
    scope: LearnerOwnerScope,
    algorithmVersion: string,
    model: DerivedLearnerModel,
  ) {
    await this.db.transaction(async (tx) => {
      const versioned = <
        T extends { institutionId: unknown; studentId: unknown; algorithmVersion: unknown },
      >(
        table: T,
      ) =>
        and(
          eq(table.institutionId as never, scope.institutionId),
          eq(table.studentId as never, scope.studentId),
          eq(table.algorithmVersion as never, algorithmVersion),
        );
      await tx
        .delete(schema.petrosLearnerConceptMastery)
        .where(versioned(schema.petrosLearnerConceptMastery));
      await tx
        .delete(schema.petrosLearnerMoveOutcomes)
        .where(versioned(schema.petrosLearnerMoveOutcomes));
      await tx
        .delete(schema.petrosLearnerPreferences)
        .where(versioned(schema.petrosLearnerPreferences));
      await tx
        .delete(schema.petrosLearnerErrorFingerprints)
        .where(versioned(schema.petrosLearnerErrorFingerprints));
      await tx
        .delete(schema.petrosLearnerCalibration)
        .where(versioned(schema.petrosLearnerCalibration));

      if (model.mastery.length)
        await tx
          .insert(schema.petrosLearnerConceptMastery)
          .values(model.mastery.map((item) => ({ ...scope, ...item, algorithmVersion })));
      if (model.moveOutcomes.length)
        await tx
          .insert(schema.petrosLearnerMoveOutcomes)
          .values(model.moveOutcomes.map((item) => ({ ...scope, ...item, algorithmVersion })));
      await tx.insert(schema.petrosLearnerPreferences).values({
        ...scope,
        ...model.preference,
        algorithmVersion,
      });
      if (model.errors.length)
        await tx
          .insert(schema.petrosLearnerErrorFingerprints)
          .values(model.errors.map((item) => ({ ...scope, ...item, algorithmVersion })));
      await tx.insert(schema.petrosLearnerCalibration).values({
        ...scope,
        ...model.calibration,
        algorithmVersion,
      });
    });
  }

  async summaries(scope: LearnerOwnerScope, algorithmVersion: string) {
    const clauses = <
      T extends { institutionId: unknown; studentId: unknown; algorithmVersion: unknown },
    >(
      table: T,
    ) =>
      and(
        eq(table.institutionId as never, scope.institutionId),
        eq(table.studentId as never, scope.studentId),
        eq(table.algorithmVersion as never, algorithmVersion),
      );
    const [
      mastery,
      moveOutcomes,
      preferences,
      errors,
      calibration,
      quarantine,
      jobs,
      planSnapshots,
    ] = await Promise.all([
      this.db
        .select()
        .from(schema.petrosLearnerConceptMastery)
        .where(clauses(schema.petrosLearnerConceptMastery)),
      this.db
        .select()
        .from(schema.petrosLearnerMoveOutcomes)
        .where(clauses(schema.petrosLearnerMoveOutcomes)),
      this.db
        .select()
        .from(schema.petrosLearnerPreferences)
        .where(clauses(schema.petrosLearnerPreferences)),
      this.db
        .select()
        .from(schema.petrosLearnerErrorFingerprints)
        .where(clauses(schema.petrosLearnerErrorFingerprints)),
      this.db
        .select()
        .from(schema.petrosLearnerCalibration)
        .where(clauses(schema.petrosLearnerCalibration)),
      this.db
        .select()
        .from(schema.petrosLearnerEvidenceQuarantine)
        .where(owner(schema.petrosLearnerEvidenceQuarantine, scope))
        .orderBy(desc(schema.petrosLearnerEvidenceQuarantine.createdAt))
        .limit(50),
      this.db
        .select()
        .from(schema.petrosLearnerModelJobs)
        .where(owner(schema.petrosLearnerModelJobs, scope))
        .orderBy(desc(schema.petrosLearnerModelJobs.createdAt))
        .limit(20),
      this.db
        .select()
        .from(schema.petrosLearnerPlanSnapshots)
        .where(owner(schema.petrosLearnerPlanSnapshots, scope))
        .orderBy(desc(schema.petrosLearnerPlanSnapshots.createdAt))
        .limit(20),
    ]);
    return {
      mastery,
      moveOutcomes,
      preference: preferences[0],
      errors,
      calibration: calibration[0],
      quarantine,
      jobs,
      planSnapshots,
    };
  }

  recordPlanSnapshot(values: typeof schema.petrosLearnerPlanSnapshots.$inferInsert) {
    return this.db
      .insert(schema.petrosLearnerPlanSnapshots)
      .values(values)
      .onConflictDoNothing()
      .returning()
      .then((rows) => rows[0]);
  }

  createJob(values: typeof schema.petrosLearnerModelJobs.$inferInsert) {
    return this.db
      .insert(schema.petrosLearnerModelJobs)
      .values(values)
      .returning()
      .then((rows) => rows[0]!);
  }

  findJob(id: string) {
    return this.db
      .select()
      .from(schema.petrosLearnerModelJobs)
      .where(eq(schema.petrosLearnerModelJobs.id, id))
      .limit(1)
      .then((rows) => rows[0]);
  }

  updateJob(id: string, patch: Partial<typeof schema.petrosLearnerModelJobs.$inferInsert>) {
    return this.db
      .update(schema.petrosLearnerModelJobs)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.petrosLearnerModelJobs.id, id))
      .returning()
      .then((rows) => rows[0]);
  }

  quarantine(values: typeof schema.petrosLearnerEvidenceQuarantine.$inferInsert) {
    return this.db
      .insert(schema.petrosLearnerEvidenceQuarantine)
      .values(values)
      .returning()
      .then((rows) => rows[0]!);
  }

  async export(scope: LearnerOwnerScope) {
    const [evidence, summaries] = await Promise.all([
      this.listEvidence(scope),
      this.summaries(scope, 'petros.learner-model.stage6.v1'),
    ]);
    return { scope, evidence, summaries, exportedAt: new Date().toISOString() };
  }

  async deleteLearnerModel(scope: LearnerOwnerScope) {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(schema.petrosLearnerPlanSnapshots)
        .where(owner(schema.petrosLearnerPlanSnapshots, scope));
      await tx
        .delete(schema.petrosLearnerModelJobs)
        .where(owner(schema.petrosLearnerModelJobs, scope));
      await tx
        .delete(schema.petrosLearnerEvidenceQuarantine)
        .where(owner(schema.petrosLearnerEvidenceQuarantine, scope));
      await tx
        .delete(schema.petrosLearnerConceptMastery)
        .where(owner(schema.petrosLearnerConceptMastery, scope));
      await tx
        .delete(schema.petrosLearnerMoveOutcomes)
        .where(owner(schema.petrosLearnerMoveOutcomes, scope));
      await tx
        .delete(schema.petrosLearnerPreferences)
        .where(owner(schema.petrosLearnerPreferences, scope));
      await tx
        .delete(schema.petrosLearnerErrorFingerprints)
        .where(owner(schema.petrosLearnerErrorFingerprints, scope));
      await tx
        .delete(schema.petrosLearnerCalibration)
        .where(owner(schema.petrosLearnerCalibration, scope));
      const removed = await tx
        .delete(schema.petrosLearnerEvidenceEvents)
        .where(owner(schema.petrosLearnerEvidenceEvents, scope))
        .returning({ id: schema.petrosLearnerEvidenceEvents.id });
      return { removedEvidenceEvents: removed.length };
    });
  }
}

function owner(
  table: { institutionId: AnyPgColumn; studentId: AnyPgColumn },
  scope: LearnerOwnerScope,
) {
  return and(eq(table.institutionId, scope.institutionId), eq(table.studentId, scope.studentId));
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
