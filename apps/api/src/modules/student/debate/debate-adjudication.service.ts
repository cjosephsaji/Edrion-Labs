import {
  BadRequestException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import type { StudentPrincipal } from '../student.types';
import { DebateRoundService } from './debate-round.service';
import { buildClashMapGraph } from './debate-clash-map.builder';
import { DEBATE_PIPELINE_VERSION } from './debate.constants';
import { VisualRevisionService } from '../visual-studio/visual-revision.service';
import { CanvasGraphService } from '../visual-studio/canvas-graph.service';
import { DebateAdjudicationPipelineService } from './debate-adjudication-pipeline.service';
import { DebateRetentionService } from './debate-retention.service';
import { DebateSkillsService } from './debate-skills.service';
import { ownerColumns } from '../core/owner-scope';

@Injectable()
export class DebateAdjudicationService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly rounds: DebateRoundService,
    private readonly revisions: VisualRevisionService,
    private readonly canvasGraph: CanvasGraphService,
    private readonly pipeline: DebateAdjudicationPipelineService,
    private readonly retention: DebateRetentionService,
    private readonly skills: DebateSkillsService,
  ) {}

  async adjudicate(principal: StudentPrincipal, debateId: string) {
    const debate = await this.rounds.requireDebate(principal, debateId);
    return this.runAdjudication(principal, debate);
  }

  async adjudicateByJob(debateId: string) {
    const [debate] = await this.db
      .select()
      .from(schema.debates)
      .where(eq(schema.debates.id, debateId))
      .limit(1);
    if (!debate) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Debate missing' });
    const principal = this.principalFromDebate(debate);
    return this.runAdjudication(principal, debate);
  }

  private principalFromDebate(debate: typeof schema.debates.$inferSelect): StudentPrincipal {
    if (debate.studentId) {
      return {
        kind: 'institutional',
        institutionId: debate.institutionId!,
        campusId: null,
        studentId: debate.studentId,
        institutionUserId: debate.studentId,
        email: 'debate-job@internal',
        fullName: 'Student',
        lastAuthAt: null,
        permissions: ['student.lab.use'],
      };
    }
    return {
      kind: 'independent',
      independentUserId: debate.independentUserId!,
      email: 'debate-job@internal',
      fullName: 'Learner',
      lastAuthAt: null,
      permissions: ['student.lab.use'],
    };
  }

  private async runAdjudication(
    principal: StudentPrincipal,
    debate: typeof schema.debates.$inferSelect,
  ) {
    const debateId = debate.id;
    if (debate.status !== 'capture_complete' && debate.status !== 'adjudication_failed') {
      throw new BadRequestException({ code: 'INVALID_STATE', message: 'Round not ready for adjudication' });
    }
    await this.db
      .update(schema.debates)
      .set({ status: 'adjudicating', updatedAt: new Date() })
      .where(eq(schema.debates.id, debateId));

    const owner = ownerColumns(principal);

    const [run] = await this.db
      .insert(schema.debateAdjudicationRuns)
      .values({
        debateId,
        ...owner,
        runTrigger: 'auto',
        pipelineVersion: DEBATE_PIPELINE_VERSION,
        status: 'running',
        isPrimary: true,
        startedAt: new Date(),
      })
      .returning();

    try {
      const result = await this.pipeline.run(principal, debate, run!.id);
      const { stageA, stageB, stageC, stageD } = result;

      for (const speech of stageA.speeches) {
        const turn = await this.db
          .select()
          .from(schema.debateTurns)
          .where(
            and(eq(schema.debateTurns.debateId, debateId), eq(schema.debateTurns.turnIndex, speech.turn_index)),
          )
          .limit(1);
        if (!turn[0]) continue;
        await this.db.insert(schema.debateSpeechAnalyses).values({
          runId: run!.id,
          turnId: turn[0].id,
          debateId,
          arguments: speech.arguments,
          anatomyAxisScores: speech.anatomy_axis_scores,
          manner: speech.manner,
          quotes: speech.quotes,
        });
      }

      const clashRows = [];
      for (let i = 0; i < stageB.clashes.length; i++) {
        const c = stageB.clashes[i]!;
        const [clash] = await this.db
          .insert(schema.debateClashes)
          .values({
            runId: run!.id,
            debateId,
            orderIndex: i,
            title: c.title,
            summary: c.summary,
            propArgumentRefs: c.prop_argument_refs,
            oppArgumentRefs: c.opp_argument_refs,
            winner: c.winner,
            margin: c.margin,
            reasoning: c.reasoning,
            weight: String(c.weight),
          })
          .returning();
        clashRows.push(clash!);
      }

      const decisive = clashRows[stageC.decisive_clash_index] ?? clashRows[0];

      await this.db.insert(schema.debateVerdicts).values({
        runId: run!.id,
        debateId,
        winner: stageC.winner,
        reasoning: stageC.reasoning,
        decisiveClashId: decisive?.id ?? null,
        scoreConfidence: 'beta',
        templateKey: 'two_side_winner',
        ranking: stageC.ranking,
      });

      const humanScore = stageD.per_speaker[0];
      await this.db.insert(schema.debateSpeakerScores).values({
        runId: run!.id,
        debateId,
        score: String(humanScore?.score ?? 76),
        bandLabel: humanScore?.band_label ?? 'Good — 76',
        confidence: 'beta',
        axisScores: stageA.speeches[0]?.anatomy_axis_scores ?? {},
        rationale: humanScore?.focus_directive ?? '',
      });

      await this.db.insert(schema.debateFeedbackReports).values({
        runId: run!.id,
        debateId,
        institutionId: debate.institutionId,
        studentId: debate.studentId,
        independentUserId: debate.independentUserId,
        roundSummary: stageD.round_summary,
        perSpeaker: stageD.per_speaker,
      });

      const graph = buildClashMapGraph({
        debateRoundId: debateId,
        motionTitle: debate.motionText ?? debate.motion,
        clashes: clashRows.map((clash, i) => ({
          id: clash.id,
          title: clash.title,
          summary: clash.summary,
          winner: (stageB.clashes[i]?.winner ?? 'tied') as 'proposition' | 'opposition' | 'tied',
          weight: Number(stageB.clashes[i]?.weight ?? 1),
          propArgumentRefs: (stageB.clashes[i]?.prop_argument_refs ?? []) as string[],
          oppArgumentRefs: (stageB.clashes[i]?.opp_argument_refs ?? []) as string[],
        })),
      });

      const canvasId = randomUUID();
      await this.revisions.commitInitial(principal, {
        id: canvasId,
        title: graph.title,
        archetype: 'comparison',
        graph,
        origin: 'debate_clash',
        sourceId: null,
        topicId: null,
        sourceSessionId: null,
        sourceMeta: { run_id: run!.id, debate_round_id: debateId },
        debateId,
        reason: 'generation',
        status: 'ready',
      });

      const totalCost = result.callRows.reduce((s, r) => s + r.costMicros, 0);
      const totalLatency = result.callRows.reduce((s, r) => s + r.latencyMs, 0);

      await this.db
        .update(schema.debateAdjudicationRuns)
        .set({
          status: 'succeeded',
          finishedAt: new Date(),
          totalCostMicros: totalCost,
          totalLatencyMs: totalLatency,
        })
        .where(eq(schema.debateAdjudicationRuns.id, run!.id));

      await this.db
        .update(schema.debates)
        .set({
          status: 'report_ready',
          scoreConfidence: 'beta',
          endedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.debates.id, debateId));

      const policy = (debate.retentionPolicy as { audio_days?: number } | null) ?? { audio_days: 90 };
      await this.retention.scheduleAudioExpiry(debateId, policy.audio_days ?? 90);
      await this.skills.upsertSnapshotFromRun(debateId);

      return { runId: run!.id, canvasId, graph: this.canvasGraph.validateClashFixture(), usedLlm: result.usedLlm };
    } catch (err) {
      await this.db
        .update(schema.debateAdjudicationRuns)
        .set({
          status: 'failed',
          finishedAt: new Date(),
          error: { message: err instanceof Error ? err.message : String(err) },
        })
        .where(eq(schema.debateAdjudicationRuns.id, run!.id));
      await this.db
        .update(schema.debates)
        .set({ status: 'adjudication_failed', updatedAt: new Date() })
        .where(eq(schema.debates.id, debateId));
      throw err;
    }
  }

  async rejudge(principal: StudentPrincipal, debateId: string) {
    const debate = await this.rounds.requireDebate(principal, debateId);
    if (debate.status !== 'report_ready' && debate.status !== 'adjudication_failed') {
      throw new BadRequestException({ code: 'INVALID_STATE', message: 'Nothing to rejudge.' });
    }
    await this.db
      .update(schema.debateAdjudicationRuns)
      .set({ isPrimary: false })
      .where(and(eq(schema.debateAdjudicationRuns.debateId, debateId), eq(schema.debateAdjudicationRuns.isPrimary, true)));
    await this.db
      .update(schema.debates)
      .set({ status: 'capture_complete', updatedAt: new Date() })
      .where(eq(schema.debates.id, debateId));
    return this.runAdjudication(principal, { ...debate, status: 'capture_complete' });
  }

  async getReport(principal: StudentPrincipal, debateId: string) {
    const debate = await this.rounds.requireDebate(principal, debateId);
    const [run] = await this.db
      .select()
      .from(schema.debateAdjudicationRuns)
      .where(
        and(eq(schema.debateAdjudicationRuns.debateId, debateId), eq(schema.debateAdjudicationRuns.isPrimary, true)),
      )
      .limit(1);
    if (!run) return { debate, report: null };
    const [report] = await this.db
      .select()
      .from(schema.debateFeedbackReports)
      .where(eq(schema.debateFeedbackReports.runId, run.id))
      .limit(1);
    const [verdict] = await this.db
      .select()
      .from(schema.debateVerdicts)
      .where(eq(schema.debateVerdicts.runId, run.id))
      .limit(1);
    const [score] = await this.db
      .select()
      .from(schema.debateSpeakerScores)
      .where(eq(schema.debateSpeakerScores.runId, run.id))
      .limit(1);
    return { debate, report, verdict, score, scoreConfidence: 'beta' as const };
  }
}
