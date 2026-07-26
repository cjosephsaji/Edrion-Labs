import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { createOrchestratorSessionInputSchema, type PlanV1 } from '@edrion/schemas';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { FeatureControlsService } from '../../feature-controls/feature-controls.service';
import { LearnRepository } from '../learn/learn.repository';
import type { StudentPrincipal } from '../student.types';
import { StudentTutorPolicyService } from './student-tutor-policy.service';
import { EdrionLearnRepository } from './edrion-learn.repository';
import { MovePlannerService } from './move-planner.service';
import { BlockRendererService } from './block-renderer.service';

const TERMINAL = new Set(['closed', 'closing']);

@Injectable()
export class OrchestratorSessionService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly features: FeatureControlsService,
    private readonly learnRepo: LearnRepository,
    private readonly repo: EdrionLearnRepository,
    private readonly policy: StudentTutorPolicyService,
    private readonly planner: MovePlannerService,
    private readonly renderer: BlockRendererService,
  ) {}

  async assertOrchestratorEnabled(principal: StudentPrincipal): Promise<void> {
    try {
      const ctx =
        principal.kind === 'institutional'
          ? {
              institutionId: principal.institutionId,
              campusId: principal.campusId ?? undefined,
              institutionUserId: principal.institutionUserId,
            }
          : { independentUserId: principal.independentUserId };
      const r = await this.features.resolveByKey('learn.orchestrator', ctx);
      if (!r.value) {
        throw new ForbiddenException({ code: 'FEATURE_DISABLED', feature: 'learn.orchestrator' });
      }
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      throw new ForbiddenException({ code: 'FEATURE_DISABLED', feature: 'learn.orchestrator' });
    }
  }

  async createSession(principal: StudentPrincipal, body: unknown, idempotencyKey: string) {
    await this.assertOrchestratorEnabled(principal);
    const input = createOrchestratorSessionInputSchema.parse(body);
    const policySnapshot = await this.policy.resolveForPrincipal(principal);
    if (policySnapshot.effective_kill) {
      throw new ForbiddenException({ code: 'POLICY_KILL', message: 'Teaching is temporarily unavailable.' });
    }

    const active = await this.repo.findActiveOrchestratorSession(principal);
    if (active) {
      throw new ConflictException({ code: 'ACTIVE_SESSION', sessionId: active.id });
    }

    const topicKey = 'topicKey' in input && input.topicKey ? input.topicKey : 'general-topic';
    const topic = await this.learnRepo.upsertTopicByKey(
      topicKey,
      topicKey,
      'General',
      'generic',
      principal.kind === 'institutional' ? principal.institutionId : null,
    );

    const owner =
      principal.kind === 'institutional'
        ? {
            institutionId: principal.institutionId,
            studentId: principal.studentId,
            independentUserId: null,
          }
        : { institutionId: null, studentId: null, independentUserId: principal.independentUserId };

    const [session] = await this.db
      .insert(schema.learnSessions)
      .values({
        ...owner,
        topicId: topic.id,
        status: 'active',
        spine: [],
        sessionPlan: {},
        entryPoint: input.entryPoint,
        orchestratorStatus: 'active',
        sessionContext: input.sessionContext ?? {},
        policySnapshot,
        timeBudgetMinutes: input.timeBudgetMinutes ?? 15,
        state: { v: 1, free_questions_used: 0, probe_turns: 0, wrong_streak: 0 },
      })
      .returning();

    await this.repo.appendSessionEvent(session!.id, 1, 'session_created', { idempotencyKey });

    const plan = this.planner.planFirstMove(input.entryPoint);
    await this.commitPlanBlock(session!.id, 1, plan);

    return {
      session: this.toSessionDto(session!, topic.topicKey),
      streamUrl: `/student/edrion-learn/sessions/${session!.id}/stream`,
    };
  }

  async getSession(principal: StudentPrincipal, sessionId: string) {
    await this.assertOrchestratorEnabled(principal);
    const session = await this.repo.getOrchestratorSession(principal, sessionId);
    if (!session) throw new NotFoundException();
    const topicRow = await this.db
      .select()
      .from(schema.learnTopics)
      .where(eq(schema.learnTopics.id, session.topicId))
      .limit(1)
      .then((r) => r[0]);
    const blocks = await this.repo.listSessionBlocks(sessionId);
    return {
      ...this.toSessionDto(session, topicRow?.topicKey ?? 'topic'),
      blocks: blocks.map((b) => ({
        id: b.id,
        sequence: b.sequence,
        blockType: b.blockType,
        content: b.content,
        moveType: b.moveType,
      })),
    };
  }

  async endSession(principal: StudentPrincipal, sessionId: string) {
    await this.assertOrchestratorEnabled(principal);
    const session = await this.repo.getOrchestratorSession(principal, sessionId);
    if (!session) throw new NotFoundException();
    if (TERMINAL.has(session.orchestratorStatus ?? '')) {
      return this.toSessionDto(session, 'topic');
    }
    const [updated] = await this.db
      .update(schema.learnSessions)
      .set({
        orchestratorStatus: 'closed',
        status: 'completed',
        orchestratorUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.learnSessions.id, sessionId))
      .returning();
    await this.repo.appendSessionEvent(sessionId, (session.lastEventSeq ?? 0) + 1, 'session_closed', {});
    const topicRow = await this.db
      .select()
      .from(schema.learnTopics)
      .where(eq(schema.learnTopics.id, updated!.topicId))
      .limit(1)
      .then((r) => r[0]);
    return this.toSessionDto(updated!, topicRow?.topicKey ?? 'topic');
  }

  private async commitPlanBlock(sessionId: string, sequence: number, plan: PlanV1) {
    const block = this.renderer.render(plan);
    await this.db.transaction(async (tx) => {
      await this.repo.insertSessionBlock(
        {
          sessionId,
          sequence,
          blockType: block.kind,
          spineStep: plan.move,
          content: block,
          moveType: plan.move,
          reasoning: plan.reasoning ? { text: plan.reasoning } : null,
          streamSeq: sequence,
          renderStatus: 'done',
        },
        tx,
      );
      await this.repo.appendSessionEvent(
        sessionId,
        sequence + 1,
        'block_committed',
        { blockSeq: sequence, move: plan.move },
        tx,
      );
      await tx
        .update(schema.learnSessions)
        .set({
          planMoveCount: sequence,
          lastEventSeq: sequence + 1,
          orchestratorUpdatedAt: new Date(),
        })
        .where(eq(schema.learnSessions.id, sessionId));
    });
  }

  private toSessionDto(session: typeof schema.learnSessions.$inferSelect, topicKey: string) {
    return {
      id: session.id,
      topicKey,
      entryPoint: session.entryPoint,
      orchestratorStatus: session.orchestratorStatus,
      timeBudgetMinutes: session.timeBudgetMinutes,
      planMoveCount: session.planMoveCount,
      policySnapshot: session.policySnapshot,
      streamUrl: `/student/edrion-learn/sessions/${session.id}/stream`,
    };
  }
}
