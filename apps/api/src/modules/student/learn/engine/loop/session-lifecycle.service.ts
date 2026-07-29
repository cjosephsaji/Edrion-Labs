import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { eq, schema, type Database } from '@edrion/database';
import type { LessonGoal } from '@edrion/schemas';
import { lessonGoalSchema } from '@edrion/schemas';
import { DATABASE } from '../../../../../common/tokens';
import type { StudentPrincipal } from '../../../student.types';
import { LearnSessionsRepository } from '../learn-sessions.repository';
import { provisionalTopicShape } from '../topic/topic-shape.provisional';
import { buildLessonShape } from '../shape/lesson-shape.service';
import { type FixtureBlock } from '../generate/fixture-lesson';
import { TutorGenerationService } from '../generate/tutor-generation.service';
import { resolveCapabilities } from '../capabilities/capability-resolver';
import { gradeInstant, type InstantGradeInput } from '../grade/instant-grader';
import { CHARTER_VERSION } from '../tutor/tutor-charter';

export type LearnSessionView = {
  id: string;
  topicTitle: string;
  goal: LessonGoal;
  timeBudgetMinutes: number;
  lessonShape: ReturnType<typeof buildLessonShape>;
  capabilities: string[];
  blocks: FixtureBlock[];
  checkpointIndex: number;
  charterVersion: string;
  pathContext?: { label: string; index: number; total: number } | null;
  summaryMd?: string;
  generationSource?: 'ai' | 'fixture';
  generationDegraded?: boolean;
};

@Injectable()
export class SessionLifecycleService {
  constructor(
    private readonly repo: LearnSessionsRepository,
    private readonly tutorGen: TutorGenerationService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  async create(
    principal: StudentPrincipal,
    input: {
      topicTitle: string;
      goal?: string;
      timeBudgetMinutes?: number;
      useAi?: boolean;
    },
  ): Promise<LearnSessionView> {
    const goal = lessonGoalSchema.catch('learn').parse(input.goal ?? 'learn');
    const topicTitle = input.topicTitle.trim() || 'Untitled topic';
    const timeBudgetMinutes = input.timeBudgetMinutes ?? 15;

    const shape = provisionalTopicShape(topicTitle);
    const lessonShape = buildLessonShape(shape, goal, topicTitle);
    const caps = resolveCapabilities(shape);
    const built = await this.tutorGen.buildLesson(principal, {
      topicTitle,
      goal,
      shape,
      lesson: lessonShape,
      capabilities: caps,
      timeBudgetMinutes,
      useAi: input.useAi,
    });
    const blocks = built.blocks;

    // Only one active orchestrator session per learner (partial unique index).
    const prior = await this.repo.findActiveOrchestratorSession(principal);
    if (prior) {
      await this.repo.updateSession(prior.id, {
        status: 'paused',
        orchestratorStatus: 'closed',
        endedAt: new Date(),
        endReason: 'superseded',
      });
    }

    const shapeRow = await this.repo.insertTopicShape({
      topicKey: `adhoc:${slugify(topicTitle)}`,
      institutionId: principal.kind === 'institutional' ? principal.institutionId : null,
      independentUserId:
        principal.kind === 'independent' ? principal.independentUserId : null,
      shape,
      shapeSchemaVersion: 1,
      source: 'provisional',
      computedAt: new Date(),
    });

    const session = await this.repo.createSession({
      institutionId: principal.kind === 'institutional' ? principal.institutionId : null,
      studentId: principal.kind === 'institutional' ? principal.studentId : null,
      independentUserId:
        principal.kind === 'independent' ? principal.independentUserId : null,
      topicShapeId: shapeRow.id,
      entryPoint: 'goal',
      status: 'active',
      orchestratorStatus: 'active',
      lessonShape,
      state: {
        blocks,
        checkpointIndex: 0,
        topicTitle,
        goal,
        capabilities: caps.capabilities,
        generationSource: built.source,
        generationDegraded: built.degraded,
      },
      sessionContext: {
        topicTitle,
        goal,
        charterVersion: CHARTER_VERSION,
        generationSource: built.source,
      },
      policySnapshot: {},
      timeBudgetMinutes,
      checkpointsTotal: lessonShape.checkpoints.length,
      checkpointsDone: 0,
    });

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]!;
      await this.repo.insertBlock({
        sessionId: session.id,
        sequence: i + 1,
        blockType: b.surface,
        content: b as unknown as Record<string, unknown>,
        surface: b.surface,
        blockSchemaVersion: 2,
        reasoning: 'whyHere' in b ? b.whyHere : null,
        degraded: built.degraded && built.source === 'fixture',
      });
    }

    return this.toView(
      session.id,
      topicTitle,
      goal,
      timeBudgetMinutes,
      lessonShape,
      caps.capabilities,
      blocks,
      0,
      built.summaryMd,
      built.source,
      built.degraded,
    );
  }

  async get(principal: StudentPrincipal, sessionId: string): Promise<LearnSessionView> {
    const session = await this.repo.getSession(principal, sessionId);
    if (!session) throw new NotFoundException('Session not found');
    const state = (session.state ?? {}) as {
      blocks?: FixtureBlock[];
      topicTitle?: string;
      goal?: LessonGoal;
      capabilities?: string[];
      checkpointIndex?: number;
      generationSource?: 'ai' | 'fixture';
      generationDegraded?: boolean;
      summaryMd?: string;
    };
    const lessonShape = (session.lessonShape ?? {
      v: 1,
      arc_id: 'general.fallback',
      checkpoints: [],
      opening: { surface: 'explanation' },
      adaptations_announced: [],
    }) as ReturnType<typeof buildLessonShape>;

    return this.toView(
      session.id,
      state.topicTitle ?? 'Lesson',
      state.goal ?? 'learn',
      session.timeBudgetMinutes ?? 15,
      lessonShape,
      state.capabilities ?? [],
      state.blocks ?? [],
      state.checkpointIndex ?? 0,
      state.summaryMd,
      state.generationSource ?? 'fixture',
      state.generationDegraded ?? false,
    );
  }

  async answer(
    principal: StudentPrincipal,
    sessionId: string,
    body: { blockId: string; selectedOptionId?: string; kind?: string; payload?: InstantGradeInput },
  ) {
    const session = await this.repo.getSession(principal, sessionId);
    if (!session) throw new NotFoundException('Session not found');

    const state = (session.state ?? {}) as { blocks?: FixtureBlock[] };
    const block = state.blocks?.find((b) => b.id === body.blockId);

    let result = gradeInstant(
      body.payload ?? {
        kind: 'mcq',
        correctOptionId:
          block && block.surface === 'question_set'
            ? block.answerKey.correctOptionId
            : '',
        selectedOptionId: body.selectedOptionId ?? '',
      },
    );

    // Server always recomputes from stored key for MCQ.
    if (block?.surface === 'question_set' && body.selectedOptionId) {
      result = gradeInstant({
        kind: 'mcq',
        correctOptionId: block.answerKey.correctOptionId,
        selectedOptionId: body.selectedOptionId,
      });
    }

    await this.repo.insertAttempt({
      sessionId,
      studentId: principal.kind === 'institutional' ? principal.studentId : null,
      independentUserId:
        principal.kind === 'independent' ? principal.independentUserId : null,
      kind: body.kind ?? 'mcq',
      input: body as unknown as Record<string, unknown>,
      evaluation: { ...result, trust: 'self_reported' },
      hintsUsed: 0,
    });

    return result;
  }

  async complete(principal: StudentPrincipal, sessionId: string) {
    const view = await this.get(principal, sessionId);
    const summaryMd = buildCompletionSummary(view.topicTitle, view.lessonShape, view.blocks);
    await this.db
      .update(schema.learnSessions)
      .set({
        status: 'completed',
        orchestratorStatus: 'closed',
        completedAt: new Date(),
        endedAt: new Date(),
        checkpointsDone: view.lessonShape.checkpoints.length,
        summary: { summaryMd, charterVersion: CHARTER_VERSION },
      })
      .where(eq(schema.learnSessions.id, sessionId));

    const cards = proposeFlashcards(view);
    return { ...view, summaryMd, cards };
  }

  private toView(
    id: string,
    topicTitle: string,
    goal: LessonGoal,
    timeBudgetMinutes: number,
    lessonShape: ReturnType<typeof buildLessonShape>,
    capabilities: string[],
    blocks: FixtureBlock[],
    checkpointIndex = 0,
    summaryMd?: string,
    generationSource: 'ai' | 'fixture' = 'fixture',
    generationDegraded = false,
  ): LearnSessionView {
    return {
      id,
      topicTitle,
      goal,
      timeBudgetMinutes,
      lessonShape,
      capabilities,
      blocks,
      checkpointIndex,
      charterVersion: CHARTER_VERSION,
      pathContext: null,
      summaryMd: summaryMd ?? buildCompletionSummary(topicTitle, lessonShape, blocks),
      generationSource,
      generationDegraded,
    };
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function buildCompletionSummary(
  topicTitle: string,
  lesson: ReturnType<typeof buildLessonShape>,
  blocks: FixtureBlock[],
): string {
  const labels = lesson.checkpoints.map((c) => c.label).join(', ');
  const taught = blocks.filter((b) => b.surface === 'explanation' || b.surface === 'worked_example')
    .length;
  return `You now have a working grip on **${topicTitle}** across ${lesson.checkpoints.length} checkpoints (${labels}). ${taught} teaching beats landed in this pass.`;
}

function proposeFlashcards(view: LearnSessionView) {
  const cards: Array<{ id: string; front: string; back: string; fromWrong: boolean }> = [];
  for (const b of view.blocks) {
    if (b.surface !== 'question_set') continue;
    for (const opt of b.options) {
      if (opt.correct || !opt.mistake) continue;
      cards.push({
        id: randomUUID(),
        front: b.promptMd,
        back: `${opt.mistake.name}: ${opt.mistake.explainsMd}`,
        fromWrong: true,
      });
    }
    const correct = b.options.find((o) => o.correct);
    if (correct) {
      cards.push({
        id: randomUUID(),
        front: b.promptMd,
        back: correct.label,
        fromWrong: false,
      });
    }
  }
  return cards.slice(0, 4);
}
