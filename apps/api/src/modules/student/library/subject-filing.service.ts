import { Inject, Injectable } from '@nestjs/common';
import { and, eq, schema, sql, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { ownerColumns, ownerWhere } from '../core/owner-scope';
import type { StudentPrincipal } from '../student.types';

type SubjectRef = { kind: 'erp_subject' | 'commitment' | 'self'; id?: string; label?: string };

@Injectable()
export class SubjectFilingService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Idempotent: one deck per enrolled subject (institutional) or a single starter deck (independent). */
  async seedDecksIfNeeded(principal: StudentPrincipal) {
    if (principal.kind === 'institutional') {
      const [student] = await this.db
        .select({ classId: schema.students.classId })
        .from(schema.students)
        .where(eq(schema.students.id, principal.studentId))
        .limit(1);
      if (!student?.classId) return { seeded: 0 };

      const subjects = await this.db
        .select({ id: schema.subjects.id, name: schema.subjects.name })
        .from(schema.classSubjectTeachers)
        .innerJoin(schema.subjects, eq(schema.subjects.id, schema.classSubjectTeachers.subjectId))
        .where(eq(schema.classSubjectTeachers.classId, student.classId));

      let seeded = 0;
      const owner = ownerColumns(principal);
      for (const subject of subjects) {
        const ref: SubjectRef = { kind: 'erp_subject', id: subject.id, label: subject.name };
        const [exists] = await this.db
          .select({ id: schema.flashcardDecks.id })
          .from(schema.flashcardDecks)
          .where(
            and(
              ownerWhere(principal, schema.flashcardDecks.studentId, schema.flashcardDecks.independentUserId),
              sql`${schema.flashcardDecks.subjectRef}->>'id' = ${subject.id}`,
            ),
          )
          .limit(1);
        if (exists) continue;
        await this.db.insert(schema.flashcardDecks).values({
          ...owner,
          title: subject.name,
          fromLabel: subject.name,
          subjectRef: ref,
        });
        seeded += 1;
      }
      return { seeded };
    }

    const owner = ownerColumns(principal);
    const [exists] = await this.db
      .select({ id: schema.flashcardDecks.id })
      .from(schema.flashcardDecks)
      .where(ownerWhere(principal, schema.flashcardDecks.studentId, schema.flashcardDecks.independentUserId))
      .limit(1);
    if (exists) return { seeded: 0 };
    await this.db.insert(schema.flashcardDecks).values({
      ...owner,
      title: 'My decks',
      fromLabel: 'My decks',
      subjectRef: { kind: 'self', label: 'General' },
    });
    return { seeded: 1 };
  }

  async classifyItem(principal: StudentPrincipal, itemId: string) {
    const [item] = await this.db
      .select()
      .from(schema.knowledgeItems)
      .where(
        and(
          eq(schema.knowledgeItems.id, itemId),
          ownerWhere(principal, schema.knowledgeItems.studentId, schema.knowledgeItems.independentUserId),
        ),
      )
      .limit(1);
    if (!item) return null;

    const origin = (item.origin ?? {}) as Record<string, unknown>;
    const existing = origin.subject_classification as Record<string, unknown> | undefined;
    if (existing?.status === 'accepted') return existing;

    let suggested: SubjectRef | null = null;
    if (principal.kind === 'institutional') {
      const [student] = await this.db
        .select({ classId: schema.students.classId })
        .from(schema.students)
        .where(eq(schema.students.id, principal.studentId))
        .limit(1);
      if (student?.classId) {
        const [subject] = await this.db
          .select({ id: schema.subjects.id, name: schema.subjects.name })
          .from(schema.classSubjectTeachers)
          .innerJoin(schema.subjects, eq(schema.subjects.id, schema.classSubjectTeachers.subjectId))
          .where(eq(schema.classSubjectTeachers.classId, student.classId))
          .limit(1);
        if (subject) suggested = { kind: 'erp_subject', id: subject.id, label: subject.name };
      }
    }

    const classification = {
      suggested,
      status: existing?.status ?? 'pending',
      suggested_at: existing?.suggested_at ?? new Date().toISOString(),
    };

    if (!existing) {
      await this.db
        .update(schema.knowledgeItems)
        .set({
          origin: { ...origin, subject_classification: classification },
          updatedAt: new Date(),
        })
        .where(eq(schema.knowledgeItems.id, itemId));
    }

    return classification;
  }

  async acceptClassification(principal: StudentPrincipal, itemId: string, subjectRef?: SubjectRef) {
    const [item] = await this.db
      .select()
      .from(schema.knowledgeItems)
      .where(
        and(
          eq(schema.knowledgeItems.id, itemId),
          ownerWhere(principal, schema.knowledgeItems.studentId, schema.knowledgeItems.independentUserId),
        ),
      )
      .limit(1);
    if (!item) return null;

    const origin = (item.origin ?? {}) as Record<string, unknown>;
    const current = origin.subject_classification as { suggested?: SubjectRef } | undefined;
    const ref = subjectRef ?? current?.suggested ?? null;
    await this.db
      .update(schema.knowledgeItems)
      .set({
        origin: {
          ...origin,
          subject_classification: { suggested: ref, status: 'accepted', accepted_at: new Date().toISOString() },
        },
        updatedAt: new Date(),
      })
      .where(eq(schema.knowledgeItems.id, itemId));
    return ref;
  }

  async autoAcceptStaleClassifications() {
    const rows = await this.db
      .select()
      .from(schema.knowledgeItems)
      .where(sql`${schema.knowledgeItems.origin}->'subject_classification'->>'status' = 'pending'`);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    let accepted = 0;
    for (const row of rows) {
      const origin = row.origin as Record<string, unknown>;
      const c = origin.subject_classification as { suggested_at?: string; suggested?: SubjectRef };
      if (!c?.suggested_at || Date.parse(c.suggested_at) > cutoff) continue;
      await this.db
        .update(schema.knowledgeItems)
        .set({
          origin: {
            ...origin,
            subject_classification: { ...c, status: 'accepted', accepted_at: new Date().toISOString() },
          },
          updatedAt: new Date(),
        })
        .where(eq(schema.knowledgeItems.id, row.id));
      accepted += 1;
    }
    return accepted;
  }
}
