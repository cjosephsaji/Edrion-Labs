import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, schema, type Database } from '@edrion/database';
import type { SubjectWeightMapUpsertInput } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { PortalActionContext } from './portal-action-context';
import { ResultsJobsService } from './results-jobs.service';

@Injectable()
export class SubjectWeightMapsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly resultsJobs: ResultsJobsService,
  ) {}

  async get(ctx: PortalActionContext, subjectId: string, termId: string, classId?: string | null) {
    const [row] = await this.db
      .select()
      .from(schema.subjectWeightMaps)
      .where(
        and(
          eq(schema.subjectWeightMaps.institutionId, ctx.principal.institutionId),
          eq(schema.subjectWeightMaps.subjectId, subjectId),
          eq(schema.subjectWeightMaps.termId, termId),
          classId ? eq(schema.subjectWeightMaps.classId, classId) : isNull(schema.subjectWeightMaps.classId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async upsert(ctx: PortalActionContext, input: SubjectWeightMapUpsertInput) {
    const total = input.components.reduce((sum, c) => sum + c.weight_pct, 0);
    if (total !== 100) {
      throw new BadRequestException({
        code: 'WEIGHTS_NOT_100',
        message: `Component weights must sum to 100 (currently ${total}).`,
        total,
      });
    }

    const existing = await this.get(ctx, input.subject_id, input.term_id, input.class_id ?? null);
    if (!existing) {
      const [created] = await this.db
        .insert(schema.subjectWeightMaps)
        .values({
          institutionId: ctx.principal.institutionId,
          subjectId: input.subject_id,
          termId: input.term_id,
          classId: input.class_id ?? null,
          creditsOverride: input.credits_override != null ? String(input.credits_override) : null,
          components: input.components,
          createdBy: ctx.principal.institutionUserId,
        })
        .returning();
      return created;
    }

    const [updated] = await this.db
      .update(schema.subjectWeightMaps)
      .set({
        creditsOverride: input.credits_override != null ? String(input.credits_override) : null,
        components: input.components,
        version: existing.version + 1,
        updatedAt: new Date(),
        updatedBy: ctx.principal.institutionUserId,
      })
      .where(
        and(
          eq(schema.subjectWeightMaps.id, existing.id),
          eq(schema.subjectWeightMaps.version, input.version ?? existing.version),
        ),
      )
      .returning();
    if (!updated) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Weight map was updated elsewhere.' });

    await this.enqueueTermRecompute(ctx.principal.institutionId, input.term_id);
    return updated;
  }

  private async enqueueTermRecompute(institutionId: string, termId: string) {
    const rows = await this.db
      .selectDistinct({ studentId: schema.gradeEntries.studentId })
      .from(schema.gradeEntries)
      .where(
        and(
          eq(schema.gradeEntries.institutionId, institutionId),
          eq(schema.gradeEntries.termId, termId),
        ),
      );
    for (const row of rows) {
      await this.resultsJobs.enqueueRecompute({ institutionId, studentId: row.studentId, termId });
    }
  }
}
