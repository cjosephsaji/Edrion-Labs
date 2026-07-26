import { Inject, Injectable } from '@nestjs/common';
import { and, eq, schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { FeatureControlsService } from '../../feature-controls/feature-controls.service';
import type { StudentPrincipal } from '../student.types';

export interface ExamBoostInfo {
  deckId: string;
  deckName: string;
  examLabel: string;
  examDate: Date;
  daysOut: number;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class ExamBoostResolver {
  private readonly cache = new Map<string, { at: number; value: ExamBoostInfo | null }>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly features: FeatureControlsService,
  ) {}

  async resolveForDeck(
    principal: StudentPrincipal,
    deckId: string,
  ): Promise<{ examDate: Date; examLabel: string } | null> {
    const key = `${principal.kind}:${principal.kind === 'institutional' ? principal.studentId : principal.independentUserId}:${deckId}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return hit.value ? { examDate: hit.value.examDate, examLabel: hit.value.examLabel } : null;
    }

    const [deck] = await this.db
      .select()
      .from(schema.flashcardDecks)
      .where(eq(schema.flashcardDecks.id, deckId))
      .limit(1);
    if (!deck || deck.examBoostOptOut || !deck.subjectRef) {
      this.cache.set(key, { at: Date.now(), value: null });
      return null;
    }

    if (principal.kind === 'institutional') {
      const flag = await this.features.resolveByKey('library.exam_aware_scheduling', {
        institutionId: principal.institutionId,
        campusId: principal.campusId ?? undefined,
        institutionUserId: principal.institutionUserId,
      });
      if (!flag.value) {
        this.cache.set(key, { at: Date.now(), value: null });
        return null;
      }
    }

    const subjectRef = deck.subjectRef as { kind: string; id?: string; label?: string };
    let examDate: Date | null = null;
    let examLabel = subjectRef.label ?? 'Exam';

    if (principal.kind === 'institutional' && subjectRef.kind === 'erp_subject' && subjectRef.id) {
      const [student] = await this.db
        .select({ classId: schema.students.classId })
        .from(schema.students)
        .where(eq(schema.students.id, principal.studentId))
        .limit(1);
      if (student?.classId) {
        const [row] = await this.db
          .select({ date: schema.examSchedules.examDate, name: schema.subjects.name })
          .from(schema.examSchedules)
          .leftJoin(schema.subjects, eq(schema.subjects.id, schema.examSchedules.subjectId))
          .where(
            and(
              eq(schema.examSchedules.classId, student.classId),
              eq(schema.examSchedules.subjectId, subjectRef.id),
              eq(schema.examSchedules.published, true),
            ),
          )
          .orderBy(schema.examSchedules.examDate)
          .limit(1);
        if (row?.date) {
          examDate = new Date(`${row.date}T09:00:00Z`);
          examLabel = row.name ?? examLabel;
        }
      }
    } else if (principal.kind === 'independent' && subjectRef.kind === 'commitment' && subjectRef.id) {
      const [goal] = await this.db
        .select({ examDate: schema.studentExamGoals.examDate, name: schema.studentExamGoals.name })
        .from(schema.studentExamGoals)
        .where(
          and(
            eq(schema.studentExamGoals.id, subjectRef.id),
            eq(schema.studentExamGoals.independentUserId, principal.independentUserId),
            eq(schema.studentExamGoals.status, 'active'),
          ),
        )
        .limit(1);
      if (goal?.examDate) {
        examDate = new Date(`${goal.examDate}T09:00:00Z`);
        examLabel = goal.name;
      }
    }

    if (!examDate) {
      this.cache.set(key, { at: Date.now(), value: null });
      return null;
    }

    const daysOut = Math.ceil((examDate.getTime() - Date.now()) / 86_400_000);
    if (daysOut <= 0 || daysOut > 14) {
      this.cache.set(key, { at: Date.now(), value: null });
      return null;
    }

    const info: ExamBoostInfo = {
      deckId,
      deckName: deck.title,
      examLabel,
      examDate,
      daysOut,
    };
    this.cache.set(key, { at: Date.now(), value: info });
    return { examDate, examLabel };
  }

  async listActiveBoosts(principal: StudentPrincipal): Promise<ExamBoostInfo[]> {
    const owner =
      principal.kind === 'institutional'
        ? eq(schema.flashcardDecks.studentId, principal.studentId)
        : eq(schema.flashcardDecks.independentUserId, principal.independentUserId);
    const decks = await this.db
      .select({ id: schema.flashcardDecks.id })
      .from(schema.flashcardDecks)
      .where(and(owner, eq(schema.flashcardDecks.examBoostOptOut, false)));
    const boosts: ExamBoostInfo[] = [];
    for (const deck of decks) {
      const key = `${principal.kind}:${principal.kind === 'institutional' ? principal.studentId : principal.independentUserId}:${deck.id}`;
      await this.resolveForDeck(principal, deck.id);
      const hit = this.cache.get(key)?.value;
      if (hit) boosts.push(hit);
    }
    return boosts;
  }
}
