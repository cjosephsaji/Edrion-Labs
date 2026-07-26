import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { FeatureControlsService } from '../../feature-controls/feature-controls.service';
import { ownerColumns } from '../core/owner-scope';
import type { StudentPrincipal } from '../student.types';
import { ExamPrepTodayService } from './exam-prep-today.service';

const enrollSchema = z.object({ profileKey: z.string() });

@Injectable()
export class ExamPrepService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly features: FeatureControlsService,
    private readonly todaySync: ExamPrepTodayService,
  ) {}

  async listProfiles(principal: StudentPrincipal) {
    const rows = await this.db.select().from(schema.examProfiles).orderBy(schema.examProfiles.key);
    const gated = [];
    for (const row of rows) {
      const flag = await this.features.resolveByKey(`prep.profile.${row.key}`, {
        institutionId: principal.kind === 'institutional' ? principal.institutionId : undefined,
        campusId: principal.kind === 'institutional' ? principal.campusId ?? undefined : undefined,
        institutionUserId: principal.kind === 'institutional' ? principal.institutionUserId : undefined,
      });
      gated.push({ ...row, enabled: flag.value });
    }
    return gated;
  }

  async enroll(principal: StudentPrincipal, body: unknown) {
    const parsed = enrollSchema.parse(body);
    const flag = await this.features.resolveByKey(`prep.profile.${parsed.profileKey}`, {
      institutionId: principal.kind === 'institutional' ? principal.institutionId : undefined,
      campusId: principal.kind === 'institutional' ? principal.campusId ?? undefined : undefined,
      institutionUserId: principal.kind === 'institutional' ? principal.institutionUserId : undefined,
    });
    if (!flag.value) throw new ForbiddenException({ code: 'PROFILE_OFF', message: 'Profile not enabled.' });
    const [profile] = await this.db
      .select()
      .from(schema.examProfiles)
      .where(eq(schema.examProfiles.key, parsed.profileKey))
      .limit(1);
    if (!profile || profile.status === 'draft') {
      throw new BadRequestException({ code: 'NOT_READY', message: 'Profile not content-ready.' });
    }
    const owner = ownerColumns(principal);
    const [row] = await this.db
      .insert(schema.prepEnrollments)
      .values({ examProfileId: profile.id, ...owner })
      .returning();
    return row;
  }

  async currentPlan(principal: StudentPrincipal) {
    const owner = ownerColumns(principal);
    const enrollments = await this.db.select().from(schema.prepEnrollments).where(
      owner.studentId
        ? eq(schema.prepEnrollments.studentId, owner.studentId)
        : eq(schema.prepEnrollments.independentUserId, owner.independentUserId!),
    );
    if (!enrollments[0]) return { plan: null, blocks: [] };
    const [plan] = await this.db
      .select()
      .from(schema.prepPlans)
      .where(eq(schema.prepPlans.enrollmentId, enrollments[0].id))
      .orderBy(desc(schema.prepPlans.weekStart))
      .limit(1);
    if (!plan) return { plan: null, blocks: [] };
    const blocks = await this.db
      .select()
      .from(schema.prepPlanBlocks)
      .where(eq(schema.prepPlanBlocks.planId, plan.id));
    return { plan, blocks };
  }

  async replan(principal: StudentPrincipal) {
    const current = await this.currentPlan(principal);
    if (!current.plan) {
      const owner = ownerColumns(principal);
      const [enrollment] = await this.db
        .select()
        .from(schema.prepEnrollments)
        .where(
          owner.studentId
            ? eq(schema.prepEnrollments.studentId, owner.studentId)
            : eq(schema.prepEnrollments.independentUserId, owner.independentUserId!),
        )
        .limit(1);
      if (!enrollment) throw new BadRequestException({ code: 'NOT_ENROLLED', message: 'Enroll first.' });
      const weekStart = new Date().toISOString().slice(0, 10);
      const [plan] = await this.db
        .insert(schema.prepPlans)
        .values({ enrollmentId: enrollment.id, weekStart, ...owner })
        .returning();
      await this.db.insert(schema.prepPlanBlocks).values({
        planId: plan!.id,
        blockDate: weekStart,
        kind: 'study_block',
        title: 'SAT reading block',
        payload: { entryPoint: 'prep_plan', goal: 'revision' },
      });
      const synced = await this.currentPlan(principal);
      if (synced.blocks.length) {
        await this.todaySync.syncTodayBlocks(
          principal,
          synced.blocks.map((b) => ({ id: b.id, title: b.title, blockDate: b.blockDate })),
        );
      }
      return synced;
    }
    return current;
  }

  async errorNotebook(principal: StudentPrincipal) {
    const owner = ownerColumns(principal);
    return this.db
      .select()
      .from(schema.prepErrorNotebookEntries)
      .where(
        owner.studentId
          ? eq(schema.prepErrorNotebookEntries.studentId, owner.studentId)
          : eq(schema.prepErrorNotebookEntries.independentUserId, owner.independentUserId!),
      )
      .orderBy(desc(schema.prepErrorNotebookEntries.updatedAt));
  }

  async completePlanBlock(principal: StudentPrincipal, blockId: string) {
    const owner = ownerColumns(principal);
    const [block] = await this.db
      .select({ block: schema.prepPlanBlocks, plan: schema.prepPlans })
      .from(schema.prepPlanBlocks)
      .innerJoin(schema.prepPlans, eq(schema.prepPlans.id, schema.prepPlanBlocks.planId))
      .where(eq(schema.prepPlanBlocks.id, blockId))
      .limit(1);
    if (!block) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Block not found.' });
    if (
      (owner.studentId && block.plan.studentId !== owner.studentId) ||
      (owner.independentUserId && block.plan.independentUserId !== owner.independentUserId)
    ) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not your plan block.' });
    }
    const payload = { ...(block.block.payload as Record<string, unknown>), completedAt: new Date().toISOString() };
    const [updated] = await this.db
      .update(schema.prepPlanBlocks)
      .set({ payload })
      .where(eq(schema.prepPlanBlocks.id, blockId))
      .returning();
    return updated;
  }

  async reattemptNotebookEntry(principal: StudentPrincipal, entryId: string) {
    const owner = ownerColumns(principal);
    const [entry] = await this.db
      .select()
      .from(schema.prepErrorNotebookEntries)
      .where(eq(schema.prepErrorNotebookEntries.id, entryId))
      .limit(1);
    if (!entry) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Entry not found.' });
    if (
      (owner.studentId && entry.studentId !== owner.studentId) ||
      (owner.independentUserId && entry.independentUserId !== owner.independentUserId)
    ) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not your entry.' });
    }
    return {
      deepLink: '/lab/mock-exams',
      questionId: entry.questionId,
      attemptId: entry.attemptId,
      replay: true,
    };
  }
}
