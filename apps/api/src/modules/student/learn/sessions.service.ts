import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  checkpointBlockSchema,
  practiceItemBlockSchema,
  type BlockType,
  type CreateSessionInput,
  type LearnSessionDto,
  type SpineStep,
} from '@edrion/schemas';
import { LEARNING_EVENTS_WRITER } from '../../../common/tokens';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import type { StudentPrincipal } from '../student.types';
import { BlockGeneratorService } from '../learn-ai/block-generator.service';
import { EvaluatorService } from '../learn-ai/evaluator.service';
import { PlannerService } from '../learn-ai/planner.service';
import { getPedagogyDirectives, resolveLearnerStage, type DomainArchetype } from '../learn-ai/pedagogy-matrix';
import { LibraryService } from '../library/library.service';
import { LearnRepository } from './learn.repository';

const SPINE_LABELS: Record<SpineStep, string> = {
  understand: 'Understand',
  see_it_visually: 'See it visually',
  worked_example: 'Worked example',
  check_understanding: 'Check understanding',
  solve_yourself: 'Solve yourself',
  wrap_up: 'Wrap up',
};

const SPINE_ORDER: SpineStep[] = [
  'understand',
  'see_it_visually',
  'worked_example',
  'check_understanding',
  'solve_yourself',
  'wrap_up',
];

type SpineEntry = { step: SpineStep; label: string; status: 'done' | 'current' | 'up'; meta?: string };

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function buildSpine(currentStep: SpineStep = 'understand', steps: SpineStep[] = SPINE_ORDER): SpineEntry[] {
  let passed = true;
  return steps.map((step) => {
    if (step === currentStep) {
      passed = false;
      return { step, label: SPINE_LABELS[step], status: 'current' as const };
    }
    return { step, label: SPINE_LABELS[step], status: passed ? ('done' as const) : ('up' as const) };
  });
}

function spineStepsFromPlan(blocks: Array<{ spineStep: SpineStep }>): SpineStep[] {
  const seen = new Set<SpineStep>();
  const steps: SpineStep[] = [];
  for (const b of blocks) {
    if (!seen.has(b.spineStep)) {
      seen.add(b.spineStep);
      steps.push(b.spineStep);
    }
  }
  return steps.length ? steps : SPINE_ORDER;
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly repo: LearnRepository,
    private readonly planner: PlannerService,
    private readonly blocks: BlockGeneratorService,
    private readonly evaluator: EvaluatorService,
    private readonly library: LibraryService,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
  ) {}

  async create(principal: StudentPrincipal, input: CreateSessionInput): Promise<LearnSessionDto> {
    const title = input.topicTitle ?? input.topicKey ?? 'New topic';
    const topicKey = input.topicKey ?? slugify(title);
    const curriculumKey =
      principal.kind === 'institutional' ? 'institution' : 'generic';
    const topic = await this.repo.upsertTopicByKey(
      topicKey,
      title,
      'General',
      curriculumKey,
      principal.kind === 'institutional' ? principal.institutionId : null,
    );
    if (!topic) throw new Error('Failed to resolve topic');

    const existing = await this.repo.findActiveSessionForTopic(principal, topic.id);
    if (existing) {
      return this.toDto(existing.id, principal);
    }

    const stage = resolveLearnerStage(
      principal.kind === 'independent' ? 'independent' : 'school',
    );
    const directives = getPedagogyDirectives(
      (topic.domainArchetype as DomainArchetype) ?? 'procedural_quantitative',
      stage,
    );
    const plan = await this.planner.plan(
      principal,
      topic.id,
      topic.title,
      topic.subjectLabel,
      directives,
      input.kind ?? 'standard',
    );

    const spine = buildSpine('understand', spineStepsFromPlan(plan.blocks));
    const owner =
      principal.kind === 'institutional'
        ? {
            institutionId: principal.institutionId,
            studentId: principal.studentId,
            independentUserId: null,
          }
        : {
            institutionId: null,
            studentId: null,
            independentUserId: principal.independentUserId,
          };

    const session = await this.repo.createSession({
      ...owner,
      topicId: topic.id,
      pathItemId: input.pathItemId ?? null,
      status: 'active',
      spine,
      sessionPlan: plan,
      evidence: [],
    });
    if (!session) throw new Error('Failed to create session');

    const initialSpecs = plan.blocks.slice(0, 1);
    let seq = 1;
    for (const spec of initialSpecs) {
      const content = await this.blocks.generate(
        principal,
        topic.id,
        topic.title,
        topic.subjectLabel,
        spec.blockType,
        spec.brief,
        directives,
      );
      await this.repo.insertBlock({
        sessionId: session.id,
        sequence: seq++,
        blockType: spec.blockType,
        spineStep: spec.spineStep,
        content,
        state: {},
      });
    }

    await this.ledger.log({
      principal,
      eventType: 'session.started',
      topicKey: topic.topicKey,
      subjectLabel: topic.subjectLabel,
      payload: {
        sessionId: session.id,
        topicKey: topic.topicKey,
        source: input.source,
      },
    });

    return this.toDto(session.id, principal);
  }

  async get(principal: StudentPrincipal, sessionId: string): Promise<LearnSessionDto> {
    return this.toDto(sessionId, principal);
  }

  async streamPending(
    principal: StudentPrincipal,
    sessionId: string,
    emit: (event: Record<string, unknown>) => void,
  ): Promise<void> {
    const session = await this.requireSession(principal, sessionId);
    if (session.status === 'completed') {
      emit({ type: 'session.done', sessionId });
      return;
    }

    const topic = await this.repo.getTopic(session.topicId);
    if (!topic) throw new NotFoundException('Topic not found');

    const plan = session.sessionPlan as { blocks?: Array<{ blockType: BlockType; spineStep: SpineStep; brief: string }> };
    const existing = await this.repo.listBlocks(sessionId);
    const pending = (plan.blocks ?? []).slice(existing.length);

    const stage = resolveLearnerStage(principal.kind === 'independent' ? 'independent' : 'school');
    const directives = getPedagogyDirectives(
      (topic.domainArchetype as DomainArchetype) ?? 'procedural_quantitative',
      stage,
    );

    let seq = await this.repo.nextBlockSequence(sessionId);
    let pendingIndex = 0;
    for await (const generated of this.blocks.generateStream(
      principal,
      topic.id,
      topic.title,
      topic.subjectLabel,
      pending,
      directives,
    )) {
      const spec = pending[pendingIndex++];
      emit({ type: 'block.delta', blockType: generated.blockType });
      const block = await this.repo.insertBlock({
        sessionId,
        sequence: seq++,
        blockType: generated.blockType,
        spineStep: spec?.spineStep ?? 'understand',
        content: generated.content,
        state: {},
      });
      if (!block) continue;
      emit({
        type: 'block.done',
        block: {
          id: block.id,
          sequence: block.sequence,
          blockType: block.blockType,
          spineStep: block.spineStep,
          content: block.content,
          state: block.state,
          completedAt: null,
        },
      });
    }
    emit({ type: 'session.done', sessionId });
  }

  async answer(
    principal: StudentPrincipal,
    sessionId: string,
    blockId: string,
    body: Record<string, unknown>,
  ) {
    const session = await this.requireMutableSession(principal, sessionId);
    const block = await this.repo.getBlock(sessionId, blockId);
    if (!block) throw new NotFoundException('Block not found');

    const hintsUsed = typeof body.hintsUsed === 'number' ? body.hintsUsed : 0;
    let evaluation: Record<string, unknown>;
    let advanceSpine = false;

    if (block.blockType === 'checkpoint') {
      const content = checkpointBlockSchema.parse(block.content);
      const explanation = typeof body.explanation === 'string' ? body.explanation.trim() : '';
      const choice = typeof body.choice === 'string' ? body.choice : '';

      if (explanation) {
        const mcq = await this.evaluator.evaluateCheckpointMcq(content, choice);
        if (!mcq.correct) {
          evaluation = { ...mcq };
          advanceSpine = false;
        } else {
          evaluation = {
            ...(await this.evaluator.evaluateCheckpointExplain(principal, content, explanation)),
          };
          advanceSpine = Boolean(evaluation.correct || evaluation.accepted);
        }
      } else if (choice) {
        evaluation = {
          ...(await this.evaluator.evaluateCheckpointMcq(content, choice)),
        };
        advanceSpine = false;
      } else {
        throw new BadRequestException('Provide choice or explanation');
      }
      const correct = Boolean(evaluation.correct || evaluation.accepted);
      const tries = (await this.repo.countAttemptsForBlock(blockId)) + 1;
      await this.ledger.log({
        principal,
        eventType: 'session.checkpoint_answered',
        payload: {
          sessionId,
          blockId,
          correct,
          tries,
          method: explanation ? 'explained' : 'mcq',
        },
      });
    } else if (block.blockType === 'practice_item') {
      const content = practiceItemBlockSchema.parse(block.content);
      const images = body.photoObjectId
        ? undefined
        : undefined;
      evaluation = {
        ...(await this.evaluator.evaluatePractice(
          principal,
          content,
          String(body.answer ?? ''),
          images,
        )),
      };
      advanceSpine = Boolean(evaluation.correct);
      await this.ledger.log({
        principal,
        eventType: 'session.practice_attempted',
        payload: {
          sessionId,
          itemId: blockId,
          correct: Boolean(evaluation.correct),
          hintsUsed,
        },
      });
    } else if (block.blockType === 'reflection_summary') {
      evaluation = { ...(await this.evaluator.evaluateReflection()) };
      advanceSpine = true;
    } else {
      throw new BadRequestException('This block does not accept answers');
    }

    await this.repo.insertAttempt({
      sessionId,
      blockId,
      studentId: principal.kind === 'institutional' ? principal.studentId : null,
      independentUserId: principal.kind === 'independent' ? principal.independentUserId : null,
      kind: block.blockType === 'checkpoint' ? 'checkpoint_mcq' : 'practice',
      input: body,
      evaluation,
      hintsUsed,
    });

    if (advanceSpine) {
      await this.repo.updateBlock(blockId, { completedAt: new Date() });
      const spine = this.advanceSpine(session.spine as SpineEntry[], block.spineStep as SpineStep);
      await this.repo.updateSession(sessionId, { spine });
      await this.ledger.log({
        principal,
        eventType: 'session.block_completed',
        payload: { sessionId, blockId, blockType: block.blockType },
      });
    }

    return { evaluation, session: await this.toDto(sessionId, principal) };
  }

  private static readonly READ_THROUGH_BLOCKS: BlockType[] = [
    'concept_card',
    'visual_explainer',
    'worked_example',
    'note_card',
  ];

  async continueBlock(principal: StudentPrincipal, sessionId: string, blockId: string) {
    const session = await this.requireMutableSession(principal, sessionId);
    const block = await this.repo.getBlock(sessionId, blockId);
    if (!block) throw new NotFoundException('Block not found');
    if (!SessionsService.READ_THROUGH_BLOCKS.includes(block.blockType as BlockType)) {
      throw new BadRequestException('This block must be completed via an answer');
    }
    if (block.completedAt) {
      return { session: await this.toDto(sessionId, principal) };
    }

    await this.repo.updateBlock(blockId, { completedAt: new Date() });
    const spine = this.advanceSpine(session.spine as SpineEntry[], block.spineStep as SpineStep);
    await this.repo.updateSession(sessionId, { spine });
    await this.ledger.log({
      principal,
      eventType: 'session.block_completed',
      payload: { sessionId, blockId, blockType: block.blockType },
    });

    return { session: await this.toDto(sessionId, principal) };
  }

  async hint(principal: StudentPrincipal, sessionId: string, blockId: string, rung: 2 | 3) {
    await this.requireMutableSession(principal, sessionId);
    const block = await this.repo.getBlock(sessionId, blockId);
    if (!block || block.blockType !== 'practice_item') {
      throw new BadRequestException('Hints only apply to practice blocks');
    }
    const content = practiceItemBlockSchema.parse(block.content);
    const hintText = rung === 2 ? content.hints[1] : content.hints[2];
    await this.repo.updateBlock(blockId, {
      state: { ...((block.state as Record<string, unknown>) ?? {}), [`hint${rung}Revealed`]: true },
    });
    return { rung, hint: hintText };
  }

  async pause(principal: StudentPrincipal, sessionId: string) {
    const session = await this.requireSession(principal, sessionId);
    if (session.status === 'completed') throw new ForbiddenException('Session is read-only');
    const spine = session.spine as SpineEntry[];
    const stepIndex = spine.findIndex((s) => s.status === 'current');
    await this.repo.updateSession(sessionId, { status: 'paused', pausedAt: new Date() });
    await this.ledger.log({
      principal,
      eventType: 'session.paused',
      payload: { sessionId, stepIndex: Math.max(stepIndex, 0) },
    });
    return this.toDto(sessionId, principal);
  }

  async resume(principal: StudentPrincipal, sessionId: string) {
    const session = await this.requireSession(principal, sessionId);
    if (session.status === 'completed') throw new ForbiddenException('Session is read-only');
    const spine = session.spine as SpineEntry[];
    const stepIndex = spine.findIndex((s) => s.status === 'current');
    await this.repo.updateSession(sessionId, { status: 'active', pausedAt: null });
    await this.ledger.log({
      principal,
      eventType: 'session.resumed',
      payload: { sessionId, stepIndex: Math.max(stepIndex, 0) },
    });
    return this.toDto(sessionId, principal);
  }

  async finish(principal: StudentPrincipal, sessionId: string) {
    const session = await this.requireSession(principal, sessionId);
    if (session.status === 'completed') return this.toDto(sessionId, principal);
    const spine = session.spine as SpineEntry[];
    const onWrapUp =
      spine.find((s) => s.step === 'wrap_up')?.status === 'current' ||
      spine.every((s) => s.status === 'done');
    if (!onWrapUp) {
      throw new BadRequestException('Finish is only available after wrap-up');
    }

    const evidence = await this.buildEvidence(sessionId);
    await this.repo.updateSession(sessionId, {
      status: 'completed',
      completedAt: new Date(),
      evidence,
    });

    const topic = await this.repo.getTopic(session.topicId);
    await this.repo.upsertRevisionFresh(principal, session.topicId);

    if (session.pathItemId) {
      await this.repo.updatePathItem(session.pathItemId, {
        status: 'completed',
        completedAt: new Date(),
      });
    }

    await this.ledger.log({
      principal,
      eventType: 'session.completed',
      topicKey: topic?.topicKey,
      subjectLabel: topic?.subjectLabel,
      payload: {
        sessionId,
        topicKey: topic?.topicKey ?? '',
        evidence,
      },
    });

    // Auto-deposit Library artifacts from session evidence (best-effort).
    void this.library.depositFromSession(principal, sessionId).catch(() => undefined);

    return { ...((await this.toDto(sessionId, principal)) as object), evidence };
  }

  async pinNote(
    principal: StudentPrincipal,
    sessionId: string,
    question: string,
    answer: string,
    blockAfterId?: string,
  ) {
    await this.requireMutableSession(principal, sessionId);
    const seq = await this.repo.nextBlockSequence(sessionId);
    await this.repo.insertBlock({
      sessionId,
      sequence: seq,
      blockType: 'note_card',
      spineStep: 'understand',
      content: { question, answer },
      state: blockAfterId ? { afterBlockId: blockAfterId } : {},
    });
    return this.toDto(sessionId, principal);
  }

  private async buildEvidence(sessionId: string): Promise<string[]> {
    const blocks = await this.repo.listBlocks(sessionId);
    const lines: string[] = [];
    for (const block of blocks) {
      if (block.blockType === 'checkpoint' && block.completedAt) {
        const tries = await this.repo.countAttemptsForBlock(block.id);
        lines.push(
          tries <= 1
            ? 'Checkpoint: answered on the first try'
            : `Checkpoint: answered in ${tries} tries`,
        );
      }
      if (block.blockType === 'practice_item' && block.completedAt) {
        lines.push('Practice: solved');
      }
    }
    return lines.length ? lines : ['Session completed'];
  }

  private advanceSpine(spine: SpineEntry[], completedStep: SpineStep): SpineEntry[] {
    const steps = spine.map((s) => s.step);
    const idx = steps.indexOf(completedStep);
    const nextStep = steps[Math.min(idx + 1, steps.length - 1)] ?? completedStep;
    return buildSpine(nextStep, steps);
  }

  private async requireSession(principal: StudentPrincipal, sessionId: string) {
    const session = await this.repo.getSession(principal, sessionId);
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  private async requireMutableSession(principal: StudentPrincipal, sessionId: string) {
    const session = await this.requireSession(principal, sessionId);
    if (session.status === 'completed') {
      throw new ForbiddenException({ code: 'READ_ONLY', message: 'Completed sessions are read-only' });
    }
    return session;
  }

  private async toDto(sessionId: string, principal: StudentPrincipal): Promise<LearnSessionDto> {
    const session = await this.requireSession(principal, sessionId);
    const topic = await this.repo.getTopic(session.topicId);
    const blockRows = await this.repo.listBlocks(sessionId);
    return {
      id: session.id,
      topicId: session.topicId,
      topicKey: topic?.topicKey ?? '',
      topicTitle: topic?.title ?? '',
      subjectLabel: topic?.subjectLabel ?? '',
      status: session.status as LearnSessionDto['status'],
      spine: session.spine as LearnSessionDto['spine'],
      blocks: blockRows.map((b) => ({
        id: b.id,
        sequence: b.sequence,
        blockType: b.blockType as BlockType,
        spineStep: b.spineStep as SpineStep,
        content: b.content,
        state: b.state as Record<string, unknown>,
        completedAt: b.completedAt?.toISOString() ?? null,
      })),
      readOnly: session.status === 'completed',
      pathItemId: session.pathItemId,
      evidence: session.evidence ?? [],
      startedAt: session.startedAt.toISOString(),
      pausedAt: session.pausedAt?.toISOString() ?? null,
      completedAt: session.completedAt?.toISOString() ?? null,
    };
  }
}
