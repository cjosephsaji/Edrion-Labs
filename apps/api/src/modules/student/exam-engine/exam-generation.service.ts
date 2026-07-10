import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, schema, type Database } from '@edrion/database';
import {
  examBlueprintSchema,
  examGenerationBatchOutputSchema,
  labExamQuestionSchema,
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
    const principal = this.toPrincipal(principalRef);
    const [exam] = await this.db
      .select()
      .from(schema.mockExams)
      .where(eq(schema.mockExams.id, examId))
      .limit(1);
    if (!exam) return;

    let blueprint: ExamBlueprint | null = null;
    if (exam.blueprintId) {
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

    const targetCount = blueprint.sections.reduce((s, sec) => s + sec.questionCount, 0);
    emit?.({
      type: 'start',
      examId,
      sectionCount: blueprint.sections.length,
      targetQuestionCount: targetCount,
    });

    const groundingText = await this.loadGrounding(blueprint);
    const accepted: ExamQuestion[] = [];
    const bankIdsUsed: string[] = [];
    let sequence = 0;

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
        if (this.bank.filterDuplicates([validated.data], accepted).length === 0) continue;
        accepted.push(validated.data);
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
      // Generate per type in small batches
      for (const qtype of section.questionTypes) {
        const stillNeed = section.questionCount - accepted.filter((q) => q.blueprintSectionId === section.id).length;
        if (stillNeed <= 0) break;
        const batchSize = Math.min(stillNeed, Math.ceil(remaining / section.questionTypes.length) || 1);
        const batch = await this.generateBatch(principal, {
          subjectLabel: blueprint.subjectLabel,
          section,
          qtype,
          count: batchSize,
          difficulty: blueprint.difficultyCurve,
          topics: blueprint.topicWeights.map((t) => t.topicLabel),
          groundingText,
        });
        const unique = this.bank.filterDuplicates(batch, accepted);
        for (const q of unique) {
          if (accepted.filter((a) => a.blueprintSectionId === section.id).length >= section.questionCount) break;
          accepted.push(q);
          sequence += 1;
          emit?.({
            type: 'question',
            sectionId: section.id,
            sequence,
            promptPreview: q.prompt.slice(0, 200),
            qtype: q.type,
          });
          const bankId = await this.bank.put(q, {
            curriculumKey: blueprint.paperPatternId ? 'preset' : 'general',
          });
          if (bankId) bankIdsUsed.push(bankId);
        }
      }
    }

    let notice: string | null = null;
    if (accepted.length < targetCount) {
      notice = `Generated ${accepted.length} of ${targetCount} questions — some items could not be validated.`;
      emit?.({
        type: 'degraded',
        message: notice,
        expectedCount: targetCount,
        actualCount: accepted.length,
      });
    }

    if (!accepted.length) {
      // Last-resort stubs so the exam is never empty/broken
      for (const section of blueprint.sections) {
        for (let i = 0; i < Math.min(section.questionCount, 3); i++) {
          const topic = blueprint.topicWeights[i % blueprint.topicWeights.length]!.topicLabel;
          accepted.push(
            labExamQuestionSchema.parse({
              id: randomUUID(),
              type: 'mcq_single',
              topicLabel: topic,
              difficulty: blueprint.difficultyCurve,
              marks: section.marksPerQuestion,
              blueprintSectionId: section.id,
              explanation: 'Review this topic in your notes.',
              schemaVersion: 1,
              prompt: `Practice question ${i + 1} on ${topic}`,
              options: [
                { key: 'a', label: 'Option A' },
                { key: 'b', label: 'Option B' },
                { key: 'c', label: 'Option C' },
                { key: 'd', label: 'Option D' },
              ],
              correctKey: 'a',
            }),
          );
        }
      }
      notice = (notice ? notice + ' ' : '') + 'Fell back to placeholder questions.';
    }

    await this.db.delete(schema.mockExamQuestions).where(eq(schema.mockExamQuestions.mockExamId, examId));
    await this.db.insert(schema.mockExamQuestions).values(
      accepted.map((q, i) => ({
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
        questionBankId: null,
      })),
    );

    await this.bank.recordExposure(principal, [...new Set(bankIdsUsed)]);

    await this.db
      .update(schema.mockExams)
      .set({
        status: 'ready',
        generatedAt: new Date(),
        generationNotice: notice,
        updatedAt: new Date(),
      })
      .where(eq(schema.mockExams.id, examId));

    emit?.({ type: 'saved', examId, questionCount: accepted.length, status: 'ready' });
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
      .set({ status: 'failed', generationNotice: message, updatedAt: new Date() })
      .where(eq(schema.mockExams.id, examId));
  }
}
