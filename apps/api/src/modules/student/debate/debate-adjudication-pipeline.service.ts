import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import {
  debateFeedbackReportSchema,
  debateStageAOutputSchema,
  debateStageBOutputSchema,
  debateStageCOutputSchema,
  debateStageDOutputSchema,
  type DebateQuoteRef,
} from '@edrion/schemas';
import { DATABASE, LEARN_AI_PROVIDER } from '../../../common/tokens';
import type { LearnAiProvider } from '../learn-ai/provider';
import { BudgetsService } from '../learn-ai/budgets.service';
import type { StudentPrincipal } from '../student.types';
import { quoteMatchesTranscript, stripInvalidQuotes } from './debate-quote-validator';
import type { SttWord } from './stt/stt-provider';
import { DEBATE_PIPELINE_VERSION } from './debate.constants';

const PROMPT_VERSION = 1;

export type AdjudicationPipelineResult = {
  stageA: ReturnType<typeof debateStageAOutputSchema.parse>;
  stageB: ReturnType<typeof debateStageBOutputSchema.parse>;
  stageC: ReturnType<typeof debateStageCOutputSchema.parse>;
  stageD: ReturnType<typeof debateStageDOutputSchema.parse>;
  usedLlm: boolean;
  callRows: Array<{
    stage: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    costMicros: number;
    output: unknown;
  }>;
};

@Injectable()
export class DebateAdjudicationPipelineService {
  private readonly logger = new Logger(DebateAdjudicationPipelineService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly budgets: BudgetsService,
  ) {}

  async run(
    principal: StudentPrincipal,
    debate: typeof schema.debates.$inferSelect,
    runId: string,
  ): Promise<AdjudicationPipelineResult> {
    const turns = await this.db
      .select()
      .from(schema.debateTurns)
      .where(eq(schema.debateTurns.debateId, debate.id))
      .orderBy(asc(schema.debateTurns.turnIndex));

    const transcriptByTurn = new Map<string, { text: string; words: SttWord[] }>();
    for (const turn of turns) {
      const [row] = await this.db
        .select()
        .from(schema.debateTranscripts)
        .where(eq(schema.debateTranscripts.turnId, turn.id))
        .limit(1);
      if (row) {
        transcriptByTurn.set(turn.id, {
          text: row.text,
          words: (row.words as SttWord[]) ?? [],
        });
      }
    }

    const motion = debate.motionText ?? debate.motion;
    const digest = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32);
    const callRows: AdjudicationPipelineResult['callRows'] = [];

    const speechBundle = turns
      .map((t) => {
        const tr = transcriptByTurn.get(t.id);
        return `Turn ${t.turnIndex} (${t.seatKey}, ${t.speechKind}):\n${tr?.text ?? '(no transcript)'}`;
      })
      .join('\n\n');

    if (!this.ai.available) {
      return this.heuristicFallback(turns, motion, false);
    }

    await this.budgets.spend(principal, 'debate', 12_000);

    const stageAUser = `Motion: ${motion}\n\nSpeeches:\n${speechBundle}`;
    const stageA = await this.completeStage(
      principal,
      runId,
      'A',
      'debate_judge_stage_a',
      `Extract structured arguments per speech. Use argument ids like T{turn_index}-A{n}. Quote only verbatim spans that appear in the speech text.`,
      stageAUser,
      debateStageAOutputSchema,
      'debate_stage_a',
      4000,
      callRows,
    );

    const stageBUser = JSON.stringify({ motion, speeches: stageA.speeches });
    const stageB = await this.completeStage(
      principal,
      runId,
      'B',
      'debate_judge_stage_b',
      'Identify clashes between proposition and opposition arguments. Reference argument ids only.',
      stageBUser,
      debateStageBOutputSchema,
      'debate_stage_b',
      3000,
      callRows,
    );

    const stageCUser = JSON.stringify({ motion, clashes: stageB.clashes });
    const stageC = await this.completeStage(
      principal,
      runId,
      'C',
      'debate_judge_stage_c',
      'Deliver a WUDC-style winner verdict with decisive clash index.',
      stageCUser,
      debateStageCOutputSchema,
      'debate_stage_c',
      2000,
      callRows,
    );

    let stageD = await this.completeStage(
      principal,
      runId,
      'D',
      'debate_judge_stage_d',
      'Speaker feedback with strengths and fixes. Each fix/strength may include a quote_ref with verbatim text and timestamps in ms from the speech.',
      JSON.stringify({ motion, speeches: stageA.speeches, verdict: stageC }),
      debateStageDOutputSchema,
      'debate_stage_d',
      4000,
      callRows,
    );

    stageD = this.validateFeedbackQuotes(stageD, turns, transcriptByTurn);

    return {
      stageA,
      stageB,
      stageC,
      stageD,
      usedLlm: true,
      callRows,
    };
  }

  private async completeStage<T>(
    principal: StudentPrincipal,
    runId: string,
    stage: string,
    templateKey: string,
    system: string,
    user: string,
    schemaZod: import('zod').ZodType<T>,
    schemaName: string,
    maxTokens: number,
    callRows: AdjudicationPipelineResult['callRows'],
  ): Promise<T> {
    const started = Date.now();
    const { result, usage } = await this.ai.completeJson({
      purpose: 'debate',
      tier: stage === 'A' || stage === 'D' ? 'large' : 'small',
      system,
      user,
      schema: schemaZod,
      schemaName,
      maxOutputTokens: maxTokens,
      privacySensitive: true,
    });
    const latencyMs = Date.now() - started;
    const costMicros = Math.round((usage.inputTokens * 0.25 + usage.outputTokens * 1.0) * 10);
    callRows.push({
      stage,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      latencyMs,
      costMicros,
      output: result,
    });
    await this.db.insert(schema.debateAdjudicationCalls).values({
      runId,
      stage,
      promptTemplateKey: templateKey,
      promptTemplateVersion: PROMPT_VERSION,
      model: usage.model,
      inputDigest: createHash('sha256').update(user).digest('hex'),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      latencyMs,
      costMicros,
      output: result as Record<string, unknown>,
    });
    void principal;
    void DEBATE_PIPELINE_VERSION;
    return result;
  }

  private validateFeedbackQuotes(
    report: ReturnType<typeof debateFeedbackReportSchema.parse>,
    turns: (typeof schema.debateTurns.$inferSelect)[],
    transcriptByTurn: Map<string, { text: string; words: SttWord[] }>,
  ): ReturnType<typeof debateFeedbackReportSchema.parse> {
    const humanTurn = turns.find((t) => t.seatKey?.includes('prop') || t.seatKey?.includes('opp'));
    const tr = humanTurn ? transcriptByTurn.get(humanTurn.id) : undefined;
    if (!tr) return report;

    return {
      ...report,
      per_speaker: report.per_speaker.map((sp) => ({
        ...sp,
        strengths: stripInvalidQuotes(sp.strengths, tr.text, tr.words),
        fixes: stripInvalidQuotes(sp.fixes, tr.text, tr.words),
      })),
    };
  }

  heuristicFallback(
    turns: (typeof schema.debateTurns.$inferSelect)[],
    motion: string,
    usedLlm: boolean,
  ): AdjudicationPipelineResult {
    const speeches = turns.map((t) => ({
      turn_index: t.turnIndex,
      arguments: [
        {
          id: `T${t.turnIndex}-A1`,
          label: 'Main claim',
          side: (t.seatKey?.startsWith('prop') ? 'proposition' : 'opposition') as
            | 'proposition'
            | 'opposition',
          summary: 'Practice extraction pending calibration.',
          strength: 70,
        },
      ],
      anatomy_axis_scores: {
        claim: 70,
        mechanism: 65,
        example: 60,
        impact: 68,
        comparative: 62,
      },
      manner: {},
      quotes: [] as DebateQuoteRef[],
      undefended_assumptions: [] as string[],
    }));

    return {
      stageA: { speeches },
      stageB: {
        clashes: [
          {
            title: 'Core clash',
            summary: `Whether the case on "${motion.slice(0, 80)}" holds.`,
            prop_argument_refs: ['T0-A1'],
            opp_argument_refs: ['T1-A1'],
            winner: 'proposition',
            margin: 'narrow',
            reasoning: 'Beta heuristic — run with AI for full judge.',
            weight: 1,
          },
        ],
      },
      stageC: {
        winner: 'proposition',
        reasoning: 'Beta practice verdict.',
        decisive_clash_index: 0,
        ranking: [{ side: 'proposition', rank: 1, margin: 'narrow' }],
      },
      stageD: {
        round_summary: 'Beta practice round summary.',
        per_speaker: [
          {
            participant_label: 'You',
            score: 76,
            band_label: 'Good — 76',
            strengths: [{ text: 'Clear claim framing', quote_ref: null }],
            fixes: [{ text: 'Add explicit comparative weighing', quote_ref: null, drill_hint: null }],
            focus_directive: 'Weigh your impact against the strongest opposition mechanism.',
          },
        ],
      },
      usedLlm,
      callRows: [],
    };
  }
}
