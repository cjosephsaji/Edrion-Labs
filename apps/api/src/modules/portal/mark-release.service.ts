import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, schema, sql, type Database } from '@edrion/database';
import type { MarkReleaseUpsertInput } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { PortalActionContext } from './portal-action-context';
import { ResultsJobsService } from './results-jobs.service';
import { ResultsSettingsService } from './results-settings.service';

type MarkReleaseScope = {
  exam_id?: string;
  assessment_name?: string;
  class_ids?: string[];
};

const RETRACT_WINDOW_MS = 60 * 60 * 1000;

@Injectable()
export class MarkReleaseService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly resultsJobs: ResultsJobsService,
    private readonly settings: ResultsSettingsService,
  ) {}

  async list(ctx: PortalActionContext, query: { termId?: string; subjectId?: string }) {
    const conditions = [eq(schema.markReleaseBatches.institutionId, ctx.principal.institutionId)];
    if (query.termId) conditions.push(eq(schema.markReleaseBatches.termId, query.termId));
    if (query.subjectId) conditions.push(eq(schema.markReleaseBatches.subjectId, query.subjectId));
    const rows = await this.db
      .select()
      .from(schema.markReleaseBatches)
      .where(and(...conditions))
      .orderBy(desc(schema.markReleaseBatches.updatedAt));
    return Promise.all(rows.map((row) => this.withPreview(ctx, row)));
  }

  async upsert(ctx: PortalActionContext, input: MarkReleaseUpsertInput) {
    const scope = input.scope as MarkReleaseScope;
    const [existing] = await this.db
      .select()
      .from(schema.markReleaseBatches)
      .where(
        and(
          eq(schema.markReleaseBatches.institutionId, ctx.principal.institutionId),
          eq(schema.markReleaseBatches.termId, input.term_id),
          eq(schema.markReleaseBatches.subjectId, input.subject_id),
          sql`${schema.markReleaseBatches.scope} @> ${JSON.stringify(scope)}::jsonb`,
        ),
      )
      .limit(1);

    if (existing && !['draft', 'retracted', 'pending_approval'].includes(existing.status)) {
      return this.withPreview(ctx, existing);
    }

    const row =
      existing ??
      (
        await this.db
          .insert(schema.markReleaseBatches)
          .values({
            institutionId: ctx.principal.institutionId,
            campusId: input.campus_id,
            termId: input.term_id,
            subjectId: input.subject_id,
            scope,
            status: 'draft',
          })
          .returning()
      )[0]!;

    return this.withPreview(ctx, row);
  }

  async release(ctx: PortalActionContext, batchId: string, input: { version: number; confirmMissing?: boolean }) {
    const batch = await this.requireBatch(ctx, batchId);
    if (batch.status !== 'draft' && batch.status !== 'retracted') {
      throw new ConflictException({ code: 'INVALID_STATUS', message: 'Batch is not releasable.' });
    }
    const hodGate = await this.settings.boolSetting(ctx.principal.institutionId, 'results.hod_release_gate', false);
    if (hodGate) {
      return this.submitForApproval(ctx, batchId, input.version);
    }
    return this.commitRelease(ctx, batch, input);
  }

  async submitForApproval(ctx: PortalActionContext, batchId: string, version: number) {
    const batch = await this.requireBatch(ctx, batchId);
    if (!['draft', 'retracted'].includes(batch.status)) {
      throw new ConflictException({ code: 'INVALID_STATUS', message: 'Batch cannot be sent for approval.' });
    }
    await this.assertMapped(batch);
    const [updated] = await this.db
      .update(schema.markReleaseBatches)
      .set({ status: 'pending_approval', version: version + 1, updatedAt: new Date() })
      .where(and(eq(schema.markReleaseBatches.id, batchId), eq(schema.markReleaseBatches.version, version)))
      .returning();
    if (!updated) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Batch was updated elsewhere.' });
    return this.withPreview(ctx, updated);
  }

  async approveRelease(ctx: PortalActionContext, batchId: string, input: { version: number; confirmMissing?: boolean }) {
    const batch = await this.requireBatch(ctx, batchId);
    if (batch.status !== 'pending_approval') {
      throw new ConflictException({ code: 'INVALID_STATUS', message: 'Batch is not pending approval.' });
    }
    const updated = await this.commitRelease(ctx, batch, input, {
      approvedBy: ctx.principal.institutionUserId,
      approvedAt: new Date(),
    });
    return updated;
  }

  async sendBack(ctx: PortalActionContext, batchId: string, input: { version: number; note: string }) {
    const batch = await this.requireBatch(ctx, batchId);
    if (batch.status !== 'pending_approval') {
      throw new ConflictException({ code: 'INVALID_STATUS', message: 'Batch is not pending approval.' });
    }
    const [updated] = await this.db
      .update(schema.markReleaseBatches)
      .set({
        status: 'draft',
        version: input.version + 1,
        updatedAt: new Date(),
        retractNote: input.note,
      })
      .where(and(eq(schema.markReleaseBatches.id, batchId), eq(schema.markReleaseBatches.version, input.version)))
      .returning();
    if (!updated) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Batch was updated elsewhere.' });
    return this.withPreview(ctx, updated);
  }

  async retract(ctx: PortalActionContext, batchId: string, input: { version: number; note: string }) {
    if (input.note.trim().length < 1) {
      throw new BadRequestException({ code: 'NOTE_REQUIRED', message: 'A retract note is required.' });
    }
    const batch = await this.requireBatch(ctx, batchId);
    if (batch.status !== 'released' || !batch.releasedAt) {
      throw new ConflictException({ code: 'INVALID_STATUS', message: 'Only released batches can be retracted.' });
    }
    if (Date.now() - batch.releasedAt.getTime() > RETRACT_WINDOW_MS) {
      throw new ConflictException({ code: 'RETRACT_WINDOW_CLOSED', message: 'Retract window has closed.' });
    }

    const now = new Date();
    const updated = await this.db.transaction(async (tx) => {
      if (batch.entryIds.length) {
        await tx
          .update(schema.gradeEntries)
          .set({ published: false, updatedAt: now })
          .where(inArray(schema.gradeEntries.id, batch.entryIds));
      }
      const [row] = await tx
        .update(schema.markReleaseBatches)
        .set({
          status: 'retracted',
          retractedBy: ctx.principal.institutionUserId,
          retractedAt: now,
          retractNote: input.note,
          version: input.version + 1,
          updatedAt: now,
        })
        .where(and(eq(schema.markReleaseBatches.id, batchId), eq(schema.markReleaseBatches.version, input.version)))
        .returning();
      if (!row) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Batch was updated elsewhere.' });
      return row;
    });

    const studentIds = await this.studentsInScope(ctx.principal.institutionId, batch);
    for (const studentId of studentIds) {
      await this.resultsJobs.enqueueRecompute({
        institutionId: ctx.principal.institutionId,
        studentId,
        termId: batch.termId,
      });
    }
    return this.withPreview(ctx, updated);
  }

  private async commitRelease(
    ctx: PortalActionContext,
    batch: typeof schema.markReleaseBatches.$inferSelect,
    input: { version: number; confirmMissing?: boolean },
    approval?: { approvedBy: string; approvedAt: Date },
  ) {
    await this.assertMapped(batch);
    const missing = await this.countMissingEntries(ctx, batch);
    const policy = await this.settings.stringSetting(
      ctx.principal.institutionId,
      'results.missing_entry_policy',
      'block',
    );
    if (missing > 0 && policy === 'block') {
      throw new BadRequestException({
        code: 'MISSING_ENTRIES',
        message: `${missing} students have no mark for this assessment.`,
        missingCount: missing,
      });
    }
    if (missing > 0 && policy === 'confirm' && !input.confirmMissing) {
      throw new BadRequestException({
        code: 'CONFIRM_MISSING',
        message: `Release anyway — ${missing} students have no mark and will see '—'.`,
        missingCount: missing,
      });
    }

    const entryIds = await this.snapshotEntryIds(ctx, batch);
    const now = new Date();

    const updated = await this.db.transaction(async (tx) => {
      await this.stampTermScheme(tx, ctx.principal.institutionId, batch.termId);
      if (entryIds.length) {
        await tx
          .update(schema.gradeEntries)
          .set({ published: true, updatedAt: now })
          .where(inArray(schema.gradeEntries.id, entryIds));
      }
      const [row] = await tx
        .update(schema.markReleaseBatches)
        .set({
          status: 'released',
          entryIds,
          missingEntryCount: missing,
          releasedBy: ctx.principal.institutionUserId,
          releasedAt: now,
          approvedBy: approval?.approvedBy ?? batch.approvedBy,
          approvedAt: approval?.approvedAt ?? batch.approvedAt,
          version: input.version + 1,
          updatedAt: now,
        })
        .where(and(eq(schema.markReleaseBatches.id, batch.id), eq(schema.markReleaseBatches.version, input.version)))
        .returning();
      if (!row) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Batch was updated elsewhere.' });
      return row;
    });

    await this.enqueueFanout(ctx, updated);
    return this.withPreview(ctx, updated);
  }

  private async withPreview(ctx: PortalActionContext, batch: typeof schema.markReleaseBatches.$inferSelect) {
    const scope = batch.scope as MarkReleaseScope;
    const entryIds = await this.snapshotEntryIds(ctx, batch);
    const stats =
      entryIds.length > 0
        ? await this.db
            .select({
              count: sql<number>`count(*)::int`,
              mean: sql<number>`round(avg(${schema.gradeEntries.marksObtained})::numeric, 1)`,
              high: sql<number>`max(${schema.gradeEntries.marksObtained})`,
              low: sql<number>`min(${schema.gradeEntries.marksObtained})`,
            })
            .from(schema.gradeEntries)
            .where(inArray(schema.gradeEntries.id, entryIds))
            .then((r) => r[0])
        : { count: 0, mean: 0, high: 0, low: 0 };

    const safeStats = stats ?? { count: 0, mean: 0, high: 0, low: 0 };

    let mapped = true;
    try {
      await this.assertMapped(batch);
    } catch {
      mapped = false;
    }

    const missing = await this.countMissingEntries(ctx, batch);
    const retractable =
      batch.status === 'released' &&
      batch.releasedAt &&
      Date.now() - batch.releasedAt.getTime() <= RETRACT_WINDOW_MS;

    return {
      ...batch,
      preview: {
        entered: safeStats.count,
        mean: Number(safeStats.mean ?? 0),
        high: Number(safeStats.high ?? 0),
        low: Number(safeStats.low ?? 0),
        missing,
        mapped,
        retractable,
      },
      scope,
    };
  }

  private async requireBatch(ctx: PortalActionContext, batchId: string) {
    const [batch] = await this.db
      .select()
      .from(schema.markReleaseBatches)
      .where(
        and(
          eq(schema.markReleaseBatches.id, batchId),
          eq(schema.markReleaseBatches.institutionId, ctx.principal.institutionId),
        ),
      )
      .limit(1);
    if (!batch) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Release batch not found.' });
    return batch;
  }

  private async assertMapped(batch: typeof schema.markReleaseBatches.$inferSelect) {
    const scope = batch.scope as MarkReleaseScope;
    const maps = await this.db
      .select()
      .from(schema.subjectWeightMaps)
      .where(
        and(
          eq(schema.subjectWeightMaps.institutionId, batch.institutionId),
          eq(schema.subjectWeightMaps.subjectId, batch.subjectId),
          eq(schema.subjectWeightMaps.termId, batch.termId),
        ),
      );
    const found = maps.some((map) =>
      (map.components as Array<{ assessments: Array<Record<string, string>> }>).some((component) =>
        component.assessments.some((ref) =>
          scope.exam_id ? ref.exam_id === scope.exam_id : ref.assessment_name === scope.assessment_name,
        ),
      ),
    );
    if (!found) {
      throw new BadRequestException({
        code: 'UNMAPPED_ASSESSMENT',
        message: 'Add this assessment to the weight map first.',
      });
    }
  }

  private async snapshotEntryIds(ctx: PortalActionContext, batch: typeof schema.markReleaseBatches.$inferSelect) {
    const scope = batch.scope as MarkReleaseScope;
    const classIds = scope.class_ids ?? [];
    const conditions = [
      eq(schema.gradeEntries.institutionId, ctx.principal.institutionId),
      eq(schema.gradeEntries.subjectId, batch.subjectId),
      eq(schema.gradeEntries.termId, batch.termId),
    ];
    if (scope.exam_id) conditions.push(eq(schema.gradeEntries.examId, scope.exam_id));
    if (scope.assessment_name) conditions.push(eq(schema.gradeEntries.assessmentName, scope.assessment_name));
    if (classIds.length) conditions.push(inArray(schema.gradeEntries.classId, classIds));

    const rows = await this.db
      .select({ id: schema.gradeEntries.id })
      .from(schema.gradeEntries)
      .where(and(...conditions));
    return rows.map((r) => r.id);
  }

  private async countMissingEntries(ctx: PortalActionContext, batch: typeof schema.markReleaseBatches.$inferSelect) {
    const scope = batch.scope as MarkReleaseScope;
    const classIds = scope.class_ids ?? [];
    if (!classIds.length) return 0;
    const enrollments = await this.db
      .select({ studentId: schema.studentEnrollments.studentId })
      .from(schema.studentEnrollments)
      .where(
        and(
          eq(schema.studentEnrollments.institutionId, ctx.principal.institutionId),
          inArray(schema.studentEnrollments.classId, classIds),
          eq(schema.studentEnrollments.status, 'active'),
        ),
      );
    const entryIds = await this.snapshotEntryIds(ctx, batch);
    const studentsWithEntries = await this.db
      .select({ studentId: schema.gradeEntries.studentId })
      .from(schema.gradeEntries)
      .where(inArray(schema.gradeEntries.id, entryIds));
    const covered = new Set(studentsWithEntries.map((r) => r.studentId));
    return enrollments.filter((e) => !covered.has(e.studentId)).length;
  }

  private async stampTermScheme(tx: Database, institutionId: string, termId: string) {
    const [term] = await tx.select().from(schema.academicTerms).where(eq(schema.academicTerms.id, termId)).limit(1);
    if (!term || term.gradingSchemeId) return;
    const [scheme] = await tx
      .select()
      .from(schema.gradingSchemes)
      .where(and(eq(schema.gradingSchemes.institutionId, institutionId), eq(schema.gradingSchemes.isDefault, true)))
      .limit(1);
    if (!scheme) return;
    await tx
      .update(schema.academicTerms)
      .set({ gradingSchemeId: scheme.id, gradingSchemeVersion: scheme.version })
      .where(eq(schema.academicTerms.id, termId));
  }

  private async enqueueFanout(ctx: PortalActionContext, batch: typeof schema.markReleaseBatches.$inferSelect) {
    const [subject] = await this.db
      .select({ name: schema.subjects.name })
      .from(schema.subjects)
      .where(eq(schema.subjects.id, batch.subjectId))
      .limit(1);
    const scope = batch.scope as MarkReleaseScope;
    const studentIds = await this.studentsInScope(ctx.principal.institutionId, batch);
    await this.resultsJobs.enqueueReleaseFanout({
      institutionId: ctx.principal.institutionId,
      batchId: batch.id,
      batchVersion: batch.version,
      studentIds,
      subjectName: subject?.name ?? 'Subject',
      assessmentLabel: scope.assessment_name ?? 'Assessment',
      termId: batch.termId,
      subjectId: batch.subjectId,
      highlightRef: scope.exam_id ?? scope.assessment_name ?? batch.id,
    });
  }

  private async studentsInScope(institutionId: string, batch: typeof schema.markReleaseBatches.$inferSelect) {
    const scope = batch.scope as MarkReleaseScope;
    const classIds = scope.class_ids ?? [];
    if (!classIds.length) return [];
    const rows = await this.db
      .select({ studentId: schema.studentEnrollments.studentId })
      .from(schema.studentEnrollments)
      .where(
        and(
          eq(schema.studentEnrollments.institutionId, institutionId),
          inArray(schema.studentEnrollments.classId, classIds),
          eq(schema.studentEnrollments.status, 'active'),
        ),
      );
    return [...new Set(rows.map((r) => r.studentId))];
  }
}
