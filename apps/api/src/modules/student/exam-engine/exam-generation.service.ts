import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, schema, type Database } from '@edrion/database';
import {
  examBlueprintSchema,
  examBlueprintTotalMarks,
  examBlueprintTotalQuestions,
  examGenerationBatchOutputSchema,
  labExamQuestionSchema,
  MOCK_GENERATION_SHORTFALL_THRESHOLD,
  type ExamBlueprint,
  type ExamGenerationSseEvent,
  type ExamQuestion,
  type ExamQuestionType,
} from '@edrion/schemas';
import { DATABASE, LEARN_AI_PROVIDER } from '../../../common/tokens';
import type { LearnAiProvider } from '../learn-ai/provider';
import { BudgetsService } from '../learn-ai/budgets.service';
import { LearnAiCallLogger } from '../learn-ai/learn-ai-call.logger';
import type { StudentPrincipal } from '../student.types';
import { BANK_MIX_RATIO, QuestionBankService } from './question-bank.service';
import { EXAM_TYPE_SYSTEM_PROMPTS, buildSectionUserPrompt } from './exam-prompts';

const MAX_REPAIR = 1;
const MAX_FRESH = 1;
const HARD_CAP_PER_QUESTION = 3;

export type ExamPrincipalRef =
  | { kind: 'institutional'; institutionId: string; studentId: string; campusId: string | null }
  | { kind: 'independent'; independentUserId: string };

@Injectable()
export class ExamGenerationService {
  private readonly logger = new Logger(ExamGenerationService.name);
  /** Coalesce concurrent generateExam calls (worker + SSE) for the same exam. */
  private readonly inflight = new Map<string, Promise<void>>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly budgets: BudgetsService,
    private readonly callLog: LearnAiCallLogger,
    private readonly bank: QuestionBankService,
  ) {}

  toPrincipal(ref: ExamPrincipalRef): StudentPrincipal {
    if (ref.kind === 'institutional') {
      return {
        kind: 'institutional',
        institutionId: ref.institutionId,
        studentId: ref.studentId,
        campusId: ref.campusId,
        institutionUserId: '',
        email: '',
        fullName: 'Student',
        lastAuthAt: null,
        permissions: [],
      };
    }
    return {
      kind: 'independent',
      independentUserId: ref.independentUserId,
      email: '',
      fullName: 'Student',
      lastAuthAt: null,
      permissions: [],
    };
  }

  async generateExam(
    examId: string,
    principalRef: ExamPrincipalRef,
    emit?: (ev: ExamGenerationSseEvent) => void,
  ): Promise<void> {
    const existing = this.inflight.get(examId);
    if (existing) {
      await existing;
      if (!emit) return;
      const [exam] = await this.db
        .select()
        .from(schema.mockExams)
        .where(eq(schema.mockExams.id, examId))
        .limit(1);
      if (exam?.status === 'ready') {
        const qs = await this.db
          .select()
          .from(schema.mockExamQuestions)
          .where(eq(schema.mockExamQuestions.mockExamId, examId));
        emit({ type: 'saved', examId, questionCount: qs.length, status: 'ready' });
      } else if (exam?.status === 'failed') {
        emit({ type: 'error', message: exam.generationNotice ?? 'Generation failed' });
      }
      return;
    }

    const run = this.doGenerateExam(examId, principalRef, emit).finally(() => {
      this.inflight.delete(examId);
    });
    this.inflight.set(examId, run);
    await run;
  }

  private async doGenerateExam(
    examId: string,
    principalRef: ExamPrincipalRef,
    emit?: (ev: ExamGenerationSseEvent) => void,
  ): Promise<void> {
    const principal = this.toPrincipal(principalRef);
    const [exam] = await this.db
      .select()
      .from(schema.mockExams)
      .where(eq(schema.mockExams.id, examId))
      .limit(1);
    if (!exam) return;
    if (exam.status === 'ready') {
      const qs = await this.db
        .select()
        .from(schema.mockExamQuestions)
        .where(eq(schema.mockExamQuestions.mockExamId, examId));
      emit?.({ type: 'saved', examId, questionCount: qs.length, status: 'ready' });
      return;
    }

    // Player/scorer must use immutable snapshot — never live blueprint after create.
    let blueprint: ExamBlueprint | null = null;
    const snap = exam.blueprintSnapshot
      ? examBlueprintSchema.safeParse(exam.blueprintSnapshot)
      : null;
    if (snap?.success) {
      blueprint = snap.data;
    } else if (exam.blueprintId) {
      const [bpRow] = await this.db
        .select()
        .from(schema.examBlueprints)
        .where(eq(schema.examBlueprints.id, exam.blueprintId))
        .limit(1);
      if (bpRow) {
        const parsed = examBlueprintSchema.safeParse(bpRow.blueprint);
        if (parsed.success) blueprint = parsed.data;
      }
    }
    if (!blueprint) {
      await this.fail(examId, 'Missing blueprint');
      emit?.({ type: 'error', message: 'Missing blueprint', code: 'NO_BLUEPRINT' });
      return;
    }

    const targetCount = examBlueprintTotalQuestions(blueprint);
    emit?.({
      type: 'start',
      examId,
      sectionCount: blueprint.sections.length,
      targetQuestionCount: targetCount,
    });
    emit?.({ type: 'stage', stage: 'Selecting questions…' } as ExamGenerationSseEvent);

    const groundingText = await this.loadGrounding(blueprint);
    type AcceptedRec = { question: ExamQuestion; source: 'bank' | 'ai'; bankId: string | null };
    const accepted: AcceptedRec[] = [];
    const bankIdsUsed: string[] = [];
    let sequence = 0;
    const institutionId = principal.kind === 'institutional' ? principal.institutionId : null;

    for (let si = 0; si < blueprint.sections.length; si++) {
      const section = blueprint.sections[si]!;
      emit?.({
        type: 'section',
        sectionId: section.id,
        sectionName: section.name,
        index: si,
      });

      const bankQuota = Math.floor(section.questionCount * BANK_MIX_RATIO);
      const drawn = await this.bank.draw(principal, {
        topicLabels: blueprint.topicWeights.map((t) => t.topicLabel),
        qtypes: section.questionTypes,
        difficulty: blueprint.difficultyCurve,
        curriculumKey: blueprint.paperPatternId ? 'preset' : 'general',
        limit: bankQuota,
      });
      for (const d of drawn) {
        const q = {
          ...d.question,
          id: randomUUID(),
          blueprintSectionId: section.id,
          marks: section.marksPerQuestion,
        };
        const validated = labExamQuestionSchema.safeParse(q);
        if (!validated.success) continue;
        if (this.bank.filterDuplicates([validated.data], accepted.map((a) => a.question)).length === 0)
          continue;
        accepted.push({ question: validated.data, source: 'bank', bankId: d.bankId });
        bankIdsUsed.push(d.bankId);
        sequence += 1;
        emit?.({
          type: 'question',
          sectionId: section.id,
          sequence,
          promptPreview: validated.data.prompt.slice(0, 200),
          qtype: validated.data.type,
        });
      }

      const remaining = section.questionCount - drawn.length;
      for (const qtype of section.questionTypes) {
        const stillNeed =
          section.questionCount -
          accepted.filter((a) => a.question.blueprintSectionId === section.id).length;
        if (stillNeed <= 0) break;
        const batchSize = Math.min(
          stillNeed,
          Math.ceil(remaining / section.questionTypes.length) || 1,
        );
        const batch = await this.generateBatch(principal, {
          subjectLabel: blueprint.subjectLabel,
          section,
          qtype,
          count: batchSize,
          difficulty: blueprint.difficultyCurve,
          topics: blueprint.topicWeights.map((t) => t.topicLabel),
          groundingText,
        });
        const unique = this.bank.filterDuplicates(
          batch,
          accepted.map((a) => a.question),
        );
        for (const q of unique) {
          if (
            accepted.filter((a) => a.question.blueprintSectionId === section.id).length >=
            section.questionCount
          )
            break;
          // Pending bank insert — selectable only after teacher approval; usable in this mock.
          const bankId = await this.bank.put(q, {
            curriculumKey: blueprint.paperPatternId ? 'preset' : 'general',
            institutionId,
            source: 'ai',
            reviewStatus: 'pending',
          });
          accepted.push({ question: q, source: 'ai', bankId });
          if (bankId) bankIdsUsed.push(bankId);
          sequence += 1;
          emit?.({
            type: 'question',
            sectionId: section.id,
            sequence,
            promptPreview: q.prompt.slice(0, 200),
            qtype: q.type,
          });
        }
      }
    }

    emit?.({ type: 'stage', stage: 'Checking answers…' } as ExamGenerationSseEvent);

    const fillRatio = targetCount === 0 ? 0 : accepted.length / targetCount;
    if (accepted.length === 0 || fillRatio < MOCK_GENERATION_SHORTFALL_THRESHOLD) {
      const reason =
        'Not enough material in this source for this pattern — pick a smaller pattern or broader scope.';
      await this.db
        .update(schema.mockExams)
        .set({
          status: 'generation_failed',
          generationNotice: reason,
          generationMeta: {
            requestedCount: targetCount,
            acceptedCount: accepted.length,
            fillRatio,
            shortfall: true,
            failureReason: reason,
          },
          updatedAt: new Date(),
        })
        .where(eq(schema.mockExams.id, examId));
      emit?.({ type: 'error', message: reason, code: 'GENERATION_FAILED' });
      return;
    }

    let workingBlueprint = blueprint;
    let notice: string | null = null;
    if (accepted.length < targetCount) {
      // Shrink section counts proportionally; recompute totals on snapshot.
      workingBlueprint = this.shrinkBlueprint(blueprint, accepted.map((a) => a.question));
      notice = `Built with ${accepted.length} of ${targetCount} questions — your source didn't cover more`;
      emit?.({
        type: 'degraded',
        message: notice,
        expectedCount: targetCount,
        actualCount: accepted.length,
      });
    }

    await this.db.delete(schema.mockExamQuestions).where(eq(schema.mockExamQuestions.mockExamId, examId));
    await this.db.insert(schema.mockExamQuestions).values(
      accepted.map((rec, i) => {
        const q = rec.question;
        return {
          mockExamId: examId,
          sequence: i + 1,
          topic: q.topicLabel,
          qtype: q.type,
          prompt: q.prompt,
          options:
            'options' in q && Array.isArray(q.options)
              ? q.options.map((o) => ({ key: o.key, label: o.label }))
              : null,
          correctKey: 'correctKey' in q ? (q.correctKey as string) : null,
          markingNote: q.explanation,
          marks: q.marks,
          sectionId: q.blueprintSectionId,
          difficulty: q.difficulty,
          payload: q as unknown as Record<string, unknown>,
          questionBankId: rec.bankId,
          source: rec.source,
          snapshotHash: this.bank.promptHash(q.prompt),
        };
      }),
    );

    await this.bank.recordExposure(principal, [...new Set(bankIdsUsed.filter(Boolean))]);

    const snapshot = {
      ...workingBlueprint,
      resolvedTotalMarks: examBlueprintTotalMarks(workingBlueprint),
      resolvedTotalQuestions: examBlueprintTotalQuestions(workingBlueprint),
      snapshotAt: new Date().toISOString(),
    };

    await this.db
      .update(schema.mockExams)
      .set({
        status: exam.scheduledFor ? 'scheduled' : 'ready',
        generatedAt: new Date(),
        generationNotice: notice,
        blueprintSnapshot: snapshot as unknown as Record<string, unknown>,
        generationMeta: {
          requestedCount: targetCount,
          acceptedCount: accepted.length,
          bankCount: accepted.filter((a) => a.source === 'bank').length,
          aiCount: accepted.filter((a) => a.source === 'ai').length,
          fillRatio,
          shortfall: accepted.length < targetCount,
        },
        updatedAt: new Date(),
      })
      .where(eq(schema.mockExams.id, examId));

    emit?.({ type: 'stage', stage: 'Ready' } as ExamGenerationSseEvent);
    emit?.({ type: 'saved', examId, questionCount: accepted.length, status: 'ready' });
  }

  /** Deterministically shrink section questionCounts to match accepted distribution. */
  private shrinkBlueprint(bp: ExamBlueprint, accepted: ExamQuestion[]): ExamBlueprint {
    const counts = new Map<string, number>();
    for (const q of accepted) {
      counts.set(q.blueprintSectionId, (counts.get(q.blueprintSectionId) ?? 0) + 1);
    }
    const sections = bp.sections
      .map((s) => ({
        ...s,
        questionCount: Math.max(0, counts.get(s.id) ?? 0),
      }))
      .filter((s) => s.questionCount > 0);
    return examBlueprintSchema.parse({ ...bp, sections });
  }

  private async generateBatch(
    principal: StudentPrincipal,
    opts: {
      subjectLabel: string;
      section: ExamBlueprint['sections'][number];
      qtype: ExamQuestionType;
      count: number;
      difficulty: string;
      topics: string[];
      groundingText?: string;
    },
  ): Promise<ExamQuestion[]> {
    if (!this.ai.available || opts.count <= 0) return [];
    const system = EXAM_TYPE_SYSTEM_PROMPTS[opts.qtype];
    let user = buildSectionUserPrompt({
      subjectLabel: opts.subjectLabel,
      sectionName: opts.section.name,
      sectionId: opts.section.id,
      qtype: opts.qtype,
      count: opts.count,
      marks: opts.section.marksPerQuestion,
      difficulty: opts.difficulty,
      topics: opts.topics,
      groundingText: opts.groundingText,
    });

    let attempts = 0;
    while (attempts < HARD_CAP_PER_QUESTION) {
      attempts += 1;
      try {
        await this.budgets.spend(principal, 'mock_gen', 2500);
        const { result, usage } = await this.ai.completeJson({
          purpose: 'mock_gen',
          tier: 'large',
          system,
          user,
          schema: examGenerationBatchOutputSchema,
          schemaName: 'exam_batch',
          maxOutputTokens: 8000,
        });
        await this.callLog.log(principal, 'mock_gen', usage);

        const batch = result as { questions: ExamQuestion[] };
        const valid: ExamQuestion[] = [];
        const errors: string[] = [];
        for (const raw of batch.questions) {
          const withIds = {
            ...raw,
            id: raw.id || randomUUID(),
            blueprintSectionId: opts.section.id,
            marks: opts.section.marksPerQuestion,
            type: opts.qtype,
          };
          const parsed = labExamQuestionSchema.safeParse(withIds);
          if (parsed.success) valid.push(parsed.data);
          else errors.push(parsed.error.message.slice(0, 400));
        }
        if (valid.length >= Math.ceil(opts.count * 0.5) || attempts > MAX_REPAIR + MAX_FRESH) {
          return valid.slice(0, opts.count);
        }
        // Repair retry: feed validation errors
        if (attempts <= MAX_REPAIR && errors.length) {
          user += `\n\nPrevious output failed validation:\n${errors.slice(0, 3).join('\n')}\nFix and regenerate.`;
          continue;
        }
        // Fresh regen
        user = buildSectionUserPrompt({
          subjectLabel: opts.subjectLabel,
          sectionName: opts.section.name,
          sectionId: opts.section.id,
          qtype: opts.qtype,
          count: opts.count,
          marks: opts.section.marksPerQuestion,
          difficulty: opts.difficulty,
          topics: opts.topics,
          groundingText: opts.groundingText,
        }) + '\nGenerate completely fresh questions.';
      } catch (e) {
        this.logger.warn(`batch gen failed: ${e instanceof Error ? e.message : e}`);
        break;
      }
    }
    return [];
  }

  private async loadGrounding(blueprint: ExamBlueprint): Promise<string | undefined> {
    if (blueprint.sourceKind !== 'library' || !blueprint.libraryItemIds?.length) return undefined;
    const chunks: string[] = [];
    for (const itemId of blueprint.libraryItemIds.slice(0, 5)) {
      const [item] = await this.db
        .select({ title: schema.knowledgeItems.title })
        .from(schema.knowledgeItems)
        .where(eq(schema.knowledgeItems.id, itemId))
        .limit(1);
      if (!item) continue;
      const pages = await this.db
        .select({ text: schema.knowledgeItemPages.text, pageIndex: schema.knowledgeItemPages.pageIndex })
        .from(schema.knowledgeItemPages)
        .where(eq(schema.knowledgeItemPages.itemId, itemId))
        .orderBy(schema.knowledgeItemPages.pageIndex)
        .limit(20);
      const text = pages.map((p) => `[p.${p.pageIndex}] ${p.text}`).join('\n');
      if (text.trim()) chunks.push(`# ${item.title}\n${text.slice(0, 4000)}`);
    }
    return chunks.length ? chunks.join('\n\n') : undefined;
  }

  private async fail(examId: string, message: string) {
    await this.db
      .update(schema.mockExams)
      .set({
        status: 'generation_failed',
        generationNotice: message,
        generationMeta: { failureReason: message, acceptedCount: 0, requestedCount: 0 },
        updatedAt: new Date(),
      })
      .where(eq(schema.mockExams.id, examId));
  }
}
