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
      .where(and(eq(schema.reportCards.studentId, principal.studentId), eq(schema.reportCards.status, 'published')))
      .orderBy(desc(schema.reportCards.publishedAt));

    const groups = new Map<string, { yearLabel: string; terms: typeof rows }>();
    for (const r of rows) {
      const yearLabel = r.academicYearId ?? 'Academic record';
      const g = groups.get(yearLabel) ?? { yearLabel, terms: [] as typeof rows };
      g.terms.push(r);
      groups.set(yearLabel, g);
    }

    const published = rows.filter((r) => r.gpa != null);
    let cgpa: number | null = null;
    if (published.length) {
      const sum = published.reduce((a, r) => a + Number(r.gpa), 0);
      cgpa = Math.round((sum / published.length) * 100) / 100;
    }

    return {
      groups: [...groups.values()].map((g) => ({
        yearLabel: g.yearLabel,
        terms: g.terms.map((t) => ({
          id: t.id,
          termLabel: t.termLabel,
          publishedAt: t.publishedAt?.toISOString() ?? null,
          kind: t.kind as 'uploaded_pdf' | 'structured',
          superseded: !!t.supersedesReportCardId,
        })),
      })),
      cgpa,
    };
  }

  async detail(principal: InstitutionalStudentPrincipal, id: string) {
    const [card] = await this.db
      .select()
      .from(schema.reportCards)
      .where(
        and(eq(schema.reportCards.id, id), eq(schema.reportCards.studentId, principal.studentId), eq(schema.reportCards.status, 'published')),
      )
      .limit(1);
    if (!card) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Report card not found' });

    const entries =
      card.kind === 'structured'
        ? await this.db.select().from(schema.reportCardEntries).where(eq(schema.reportCardEntries.reportCardId, id))
        : [];

    return {
      id: card.id,
      termLabel: card.termLabel,
      kind: card.kind as 'uploaded_pdf' | 'structured',
      publishedAt: card.publishedAt?.toISOString() ?? null,
      pdfObjectId: card.pdfObjectId,
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
      gpa: card.gpa != null ? Number(card.gpa) : null,
      supersededNote: card.supersedesReportCardId ? 'This version replaces an earlier report card.' : null,
    };
  }
}
