import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, notInArray, schema, sql, type Database } from '@edrion/database';
import type { ExamQuestion } from '@edrion/schemas';
import { isDuplicatePrompt } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import type { StudentPrincipal } from '../student.types';
import { ownerColumns } from '../core/owner-scope';

export const EXAM_PROMPT_VERSION = 'exam-v1';
/** Max share of an exam drawn from the bank (plan lock). */
export const BANK_MIX_RATIO = 0.4;

@Injectable()
export class QuestionBankService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  promptHash(prompt: string): string {
    return createHash('sha256').update(prompt.trim().toLowerCase()).digest('hex').slice(0, 32);
  }

  topicKey(label: string): string {
    return label
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 120);
  }

  async put(
    question: ExamQuestion,
    opts: { curriculumKey?: string; model?: string | null } = {},
  ): Promise<string | null> {
    const topicKey = this.topicKey(question.topicLabel);
    const promptHash = this.promptHash(question.prompt);
    const curriculumKey = opts.curriculumKey ?? 'general';
    try {
      const [row] = await this.db
        .insert(schema.questionBank)
        .values({
          topicKey,
          topicLabel: question.topicLabel,
          qtype: question.type,
          difficulty: question.difficulty,
          curriculumKey,
          promptHash,
          promptVersion: EXAM_PROMPT_VERSION,
          payload: question as unknown as Record<string, unknown>,
          model: opts.model ?? null,
        })
        .onConflictDoUpdate({
          target: [
            schema.questionBank.topicKey,
            schema.questionBank.qtype,
            schema.questionBank.difficulty,
            schema.questionBank.curriculumKey,
            schema.questionBank.promptHash,
            schema.questionBank.promptVersion,
          ],
          set: {
            payload: question as unknown as Record<string, unknown>,
            updatedAt: new Date(),
          },
        })
        .returning({ id: schema.questionBank.id });
      return row?.id ?? null;
    } catch {
      return null;
    }
  }

  async draw(
    principal: StudentPrincipal,
    opts: {
      topicLabels: string[];
      qtypes: string[];
      difficulty: string;
      curriculumKey?: string;
      limit: number;
    },
  ): Promise<Array<{ bankId: string; question: ExamQuestion }>> {
    if (opts.limit <= 0) return [];
    const topicKeys = opts.topicLabels.map((t) => this.topicKey(t));
    const exposed = await this.exposedIds(principal);
    const conditions = [
      inArray(schema.questionBank.topicKey, topicKeys),
      inArray(schema.questionBank.qtype, opts.qtypes),
      eq(schema.questionBank.difficulty, opts.difficulty),
      eq(schema.questionBank.curriculumKey, opts.curriculumKey ?? 'general'),
      eq(schema.questionBank.promptVersion, EXAM_PROMPT_VERSION),
    ];
    if (exposed.length) {
      conditions.push(notInArray(schema.questionBank.id, exposed));
    }
    const rows = await this.db
      .select()
      .from(schema.questionBank)
      .where(and(...conditions))
      .orderBy(sql`random()`)
      .limit(opts.limit);

    return rows.map((r) => ({
      bankId: r.id,
      question: { ...(r.payload as ExamQuestion), id: randomUUID() },
    }));
  }

  async recordExposure(principal: StudentPrincipal, bankIds: string[]): Promise<void> {
    if (!bankIds.length) return;
    const owner = ownerColumns(principal);
    await this.db
      .insert(schema.questionExposure)
      .values(
        bankIds.map((questionBankId) => ({
          studentId: owner.studentId,
          independentUserId: owner.independentUserId,
          questionBankId,
        })),
      )
      .onConflictDoNothing();
  }

  /** Drop near-duplicates against already-accepted prompts (Jaccard ≥ 0.85). */
  filterDuplicates(candidates: ExamQuestion[], existing: ExamQuestion[]): ExamQuestion[] {
    const kept: ExamQuestion[] = [];
    for (const c of candidates) {
      const against = [...existing, ...kept];
      if (against.some((e) => isDuplicatePrompt(c.prompt, e.prompt))) continue;
      kept.push(c);
    }
    return kept;
  }

  private async exposedIds(principal: StudentPrincipal): Promise<string[]> {
    const owner = ownerColumns(principal);
    const rows = await this.db
      .select({ id: schema.questionExposure.questionBankId })
      .from(schema.questionExposure)
      .where(
        owner.studentId
          ? eq(schema.questionExposure.studentId, owner.studentId)
          : eq(schema.questionExposure.independentUserId, owner.independentUserId!),
      );
    return rows.map((r) => r.id);
  }
}
