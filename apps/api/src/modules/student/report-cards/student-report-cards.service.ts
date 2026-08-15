import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import type { InstitutionalStudentPrincipal } from '../student.types';

@Injectable()
export class StudentReportCardsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(principal: InstitutionalStudentPrincipal) {
    const rows = await this.db
      .select()
      .from(schema.reportCards)
      .where(
        and(eq(schema.reportCards.studentId, principal.studentId), eq(schema.reportCards.status, 'published')),
      )
      .orderBy(desc(schema.reportCards.publishedAt));

    return {
      items: rows.map((r) => ({
        id: r.id,
        termLabel: r.termLabel,
        kind: r.kind,
        publishedAt: r.publishedAt?.toISOString() ?? null,
        gpa: r.gpa != null ? Number(r.gpa) : null,
      })),
    };
  }

  async detail(principal: InstitutionalStudentPrincipal, id: string) {
    const [card] = await this.db
      .select()
      .from(schema.reportCards)
      .where(
        and(
          eq(schema.reportCards.id, id),
          eq(schema.reportCards.studentId, principal.studentId),
          eq(schema.reportCards.status, 'published'),
        ),
      )
      .limit(1);
    if (!card) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Report card not found' });

    const entries =
      card.kind === 'structured'
        ? await this.db
            .select()
            .from(schema.reportCardEntries)
            .where(eq(schema.reportCardEntries.reportCardId, id))
        : [];

    return {
      id: card.id,
      termLabel: card.termLabel,
      kind: card.kind,
      publishedAt: card.publishedAt?.toISOString() ?? null,
      pdfObjectId: card.pdfObjectId,
      gpa: card.gpa != null ? Number(card.gpa) : null,
      entries: entries.map((e) => ({
        id: e.id,
        subjectLabel: e.subjectLabel,
        component: e.component,
        marks: e.marks,
        maxMarks: e.maxMarks,
        gradeLetter: e.gradeLetter,
        remarks: e.remarks,
        credits: e.credits,
      })),
    };
  }
}
