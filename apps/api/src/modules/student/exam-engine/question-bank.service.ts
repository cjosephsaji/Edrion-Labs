import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, notInArray, or, schema, sql, type Database } from '@edrion/database';
import type { ExamQuestion } from '@edrion/schemas';
import { isDuplicatePrompt, labExamQuestionSchema } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import type { StudentPrincipal } from '../student.types';
import { ownerColumns } from '../core/owner-scope';

export const EXAM_PROMPT_VERSION = 'exam-v1';
/** Prefer bank for most of the paper; AI tops up remainder. */
export const BANK_MIX_RATIO = 0.6;

export type BankSelectArgs = {
  institutionId?: string | null;
  subjectId?: string | null;
  topicTags?: string[];
  topicLabels?: string[];
  perType: Record<string, number>;
  difficultyMix?: { easy?: number; medium?: number; hard?: number };
  recentItemIds?: string[];
  qtypes?: string[];
  difficulty?: string;
  curriculumKey?: string;
  limit: number;
};

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

  /**
   * Insert validated item. AI/import → pending (not selectable). Manual/system may be approved.
   */
  async put(
    question: ExamQuestion,
    opts: {
      curriculumKey?: string;
      model?: string | null;
      institutionId?: string | null;
      subjectId?: string | null;
      source?: 'manual' | 'import' | 'ai' | 'system';
      reviewStatus?: 'pending' | 'approved' | 'rejected';
      topicTags?: string[];
      createdByStaffId?: string | null;
    } = {},
  ): Promise<string | null> {
    const topicKey = this.topicKey(question.topicLabel);
    const promptHash = this.promptHash(question.prompt);
    const curriculumKey = opts.curriculumKey ?? 'general';
    const source = opts.source ?? 'ai';
    const reviewStatus =
      opts.reviewStatus ?? (source === 'ai' || source === 'import' ? 'pending' : 'approved');
    try {
      const [row] = await this.db
        .insert(schema.questionBank)
        .values({
          institutionId: opts.institutionId ?? null,
          subjectId: opts.subjectId ?? null,
          topicKey,
          topicLabel: question.topicLabel,
          qtype: question.type,
          difficulty: question.difficulty,
          difficultyDeclared: question.difficulty,
          curriculumKey,
          promptHash,
          promptVersion: EXAM_PROMPT_VERSION,
          payload: question as unknown as Record<string, unknown>,
          model: opts.model ?? null,
          source,
          reviewStatus,
          topicTags: opts.topicTags ?? [question.topicLabel],
          createdByStaffId: opts.createdByStaffId ?? null,
          reviewedAt: reviewStatus === 'approved' ? new Date() : null,
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

  /** Approved-only selector (Part A §4.3). Never returns pending. */
  async bankSelect(args: BankSelectArgs): Promise<Array<{ bankId: string; question: ExamQuestion }>> {
    if (args.limit <= 0) return [];
    const topicKeys = (args.topicLabels ?? []).map((t) => this.topicKey(t));
    const qtypes =
      args.qtypes ??
      Object.entries(args.perType)
        .filter(([, n]) => n > 0)
        .map(([t]) => t);
    if (!qtypes.length) return [];

    const conditions = [
      eq(schema.questionBank.reviewStatus, 'approved'),
      inArray(schema.questionBank.qtype, qtypes),
      eq(schema.questionBank.promptVersion, EXAM_PROMPT_VERSION),
    ];

    if (args.institutionId) {
      conditions.push(
        or(
          isNull(schema.questionBank.institutionId),
          eq(schema.questionBank.institutionId, args.institutionId),
        )!,
      );
    } else {
      conditions.push(isNull(schema.questionBank.institutionId));
    }

    if (args.difficulty) {
      conditions.push(eq(schema.questionBank.difficulty, args.difficulty));
    }
    if (args.curriculumKey) {
      conditions.push(eq(schema.questionBank.curriculumKey, args.curriculumKey));
    }
    if (args.subjectId) {
      conditions.push(
        or(isNull(schema.questionBank.subjectId), eq(schema.questionBank.subjectId, args.subjectId))!,
      );
    }
    if (args.recentItemIds?.length) {
      conditions.push(notInArray(schema.questionBank.id, args.recentItemIds));
    }
    if (args.topicTags?.length) {
      conditions.push(sql`${schema.questionBank.topicTags} && ${args.topicTags}::text[]`);
    } else if (topicKeys.length) {
      conditions.push(inArray(schema.questionBank.topicKey, topicKeys));
    }

    const rows = await this.db
      .select()
      .from(schema.questionBank)
      .where(and(...conditions))
      .orderBy(sql`random()`)
      .limit(args.limit);

    const out: Array<{ bankId: string; question: ExamQuestion }> = [];
    for (const r of rows) {
      const parsed = labExamQuestionSchema.safeParse({ ...(r.payload as object), id: randomUUID() });
      if (!parsed.success) continue;
      out.push({ bankId: r.id, question: parsed.data });
    }
    return out;
  }

  async draw(
    principal: StudentPrincipal,
    opts: {
      topicLabels: string[];
      qtypes: string[];
      difficulty: string;
      curriculumKey?: string;
      limit: number;
      recentItemIds?: string[];
    },
  ): Promise<Array<{ bankId: string; question: ExamQuestion }>> {
    if (opts.limit <= 0) return [];
    const exposed = await this.exposedIds(principal);
    const recent = [...new Set([...(opts.recentItemIds ?? []), ...exposed])];
    const institutionId = principal.kind === 'institutional' ? principal.institutionId : null;
    return this.bankSelect({
      institutionId,
      topicLabels: opts.topicLabels,
      perType: Object.fromEntries(opts.qtypes.map((t) => [t, opts.limit])),
      qtypes: opts.qtypes,
      difficulty: opts.difficulty,
      curriculumKey: opts.curriculumKey,
      recentItemIds: recent,
      limit: opts.limit,
    });
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

  async setReviewStatus(
    institutionId: string,
    ids: string[],
    status: 'approved' | 'rejected',
    staffId: string,
  ): Promise<number> {
    if (!ids.length) return 0;
    const capped = ids.slice(0, 25);
    const updated = await this.db
      .update(schema.questionBank)
      .set({
        reviewStatus: status,
        reviewedByStaffId: staffId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.questionBank.institutionId, institutionId),
          inArray(schema.questionBank.id, capped),
        ),
      )
      .returning({ id: schema.questionBank.id });
    return updated.length;
  }

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
