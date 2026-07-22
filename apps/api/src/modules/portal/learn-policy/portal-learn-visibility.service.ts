import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ActorType, AuditResult, RiskLevel } from '@edrion/shared-types';
import type { AuditWriter } from '@edrion/audit';
import { and, eq, inArray, schema, sql, type Database } from '@edrion/database';
import {
  learnSessionAggregateSchema,
  learnSessionTranscriptSchema,
  type LearnSessionAggregateDto,
  type LearnSessionTranscriptDto,
} from '@edrion/schemas';
import { AUDIT_WRITER, DATABASE } from '../../../common/tokens';
import { basePortalAudit, type PortalActionContext } from '../portal-action-context';
import { PortalLearnPolicyService } from './portal-learn-policy.service';

const MIN_AGGREGATE_SESSIONS = 3;
const MODULE = 'learn_policy';

@Injectable()
export class PortalLearnVisibilityService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly learnPolicy: PortalLearnPolicyService,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async getAggregate(studentId: string, institutionId: string): Promise<LearnSessionAggregateDto> {
    const policy = await this.learnPolicy.get(institutionId);
    if (policy.session_visibility === 'none' || !policy.enabled || policy.killSwitch) {
      throw new ForbiddenException({
        code: 'LEARN_VISIBILITY_DISABLED',
        message: 'Institution learning visibility is not enabled.',
      });
    }

    const [student] = await this.db
      .select({ id: schema.students.id })
      .from(schema.students)
      .where(and(eq(schema.students.id, studentId), eq(schema.students.institutionId, institutionId)))
      .limit(1);
    if (!student) throw new NotFoundException('Student not found');

    const [stats] = await this.db
      .select({
        completed: sql<number>`count(*) filter (where ${schema.learnSessions.orchestratorStatus} = 'closed')::int`,
        active: sql<number>`count(*) filter (where ${schema.learnSessions.orchestratorStatus} in ('created','active','awaiting_response','paused','closing'))::int`,
        topics: sql<number>`count(distinct ${schema.learnSessions.topicId})::int`,
        avgMinutes: sql<number>`avg(${schema.learnSessions.elapsedMinutes})`,
      })
      .from(schema.learnSessions)
      .where(
        and(
          eq(schema.learnSessions.studentId, studentId),
          eq(schema.learnSessions.institutionId, institutionId),
          sql`${schema.learnSessions.entryPoint} IS NOT NULL`,
        ),
      );

    const completed = Number(stats?.completed ?? 0);
    if (policy.session_visibility === 'aggregate' && completed < MIN_AGGREGATE_SESSIONS) {
      throw new ForbiddenException({
        code: 'AGGREGATE_PRIVACY_THRESHOLD',
        message: 'Not enough completed sessions to show aggregate data.',
      });
    }

    return learnSessionAggregateSchema.parse({
      studentId,
      sessionsCompleted: completed,
      sessionsActive: Number(stats?.active ?? 0),
      topicsStudied: Number(stats?.topics ?? 0),
      avgSessionMinutes: stats?.avgMinutes != null ? Math.round(Number(stats.avgMinutes)) : null,
      visibility: policy.session_visibility,
    });
  }

  async getTranscript(
    ctx: PortalActionContext,
    studentId: string,
    sessionId: string,
  ): Promise<LearnSessionTranscriptDto> {
    const institutionId = ctx.principal.institutionId;
    const policy = await this.learnPolicy.get(institutionId);
    if (policy.session_visibility !== 'transcript' || !policy.enabled || policy.killSwitch) {
      throw new ForbiddenException({
        code: 'TRANSCRIPT_NOT_PERMITTED',
        message: 'Transcript visibility is not enabled for this institution.',
      });
    }

    const [session] = await this.db
      .select()
      .from(schema.learnSessions)
      .where(
        and(
          eq(schema.learnSessions.id, sessionId),
          eq(schema.learnSessions.studentId, studentId),
          eq(schema.learnSessions.institutionId, institutionId),
        ),
      )
      .limit(1);
    if (!session) throw new NotFoundException('Session not found');

    const [topic] = await this.db
      .select()
      .from(schema.learnTopics)
      .where(eq(schema.learnTopics.id, session.topicId))
      .limit(1);

    const blocks = await this.db
      .select()
      .from(schema.learnSessionBlocks)
      .where(eq(schema.learnSessionBlocks.sessionId, sessionId))
      .orderBy(schema.learnSessionBlocks.sequence);

    const transcript = learnSessionTranscriptSchema.parse({
      sessionId: session.id,
      topicTitle: topic?.title ?? 'Lesson',
      entryPoint: session.entryPoint,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      goal: (session.sessionPlan as { goal?: string })?.goal ?? 'acquisition',
      blocks: blocks.map((b) => ({
        id: b.id,
        moveType: b.moveType,
        blockType: b.blockType,
        reasoning: b.reasoning,
        createdAt: b.createdAt.toISOString(),
      })),
    });

    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      actorType: ActorType.InstitutionUser,
      action: 'learn_session.transcript_view',
      module: MODULE,
      entityType: 'learn_session',
      entityId: sessionId,
      result: AuditResult.Success,
      riskLevel: RiskLevel.Medium,
      newState: { studentId, sessionId, blockCount: blocks.length },
    });

    return transcript;
  }

  async listSessionIds(studentId: string, institutionId: string): Promise<string[]> {
    const policy = await this.learnPolicy.get(institutionId);
    if (policy.session_visibility !== 'transcript') {
      throw new ForbiddenException({ code: 'TRANSCRIPT_NOT_PERMITTED', message: 'Transcript access denied.' });
    }

    const rows = await this.db
      .select({ id: schema.learnSessions.id })
      .from(schema.learnSessions)
      .where(
        and(
          eq(schema.learnSessions.studentId, studentId),
          eq(schema.learnSessions.institutionId, institutionId),
          inArray(schema.learnSessions.orchestratorStatus, ['closed']),
        ),
      )
      .orderBy(sql`${schema.learnSessions.startedAt} DESC`)
      .limit(50);

    return rows.map((r) => r.id);
  }
}
