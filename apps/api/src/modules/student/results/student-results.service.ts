import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { SurfaceGateService } from '../surfaces/surface-gate.service';

@Injectable()
export class StudentResultsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly gate: SurfaceGateService,
  ) {}

  async list(principal: InstitutionalStudentPrincipal) {
    await this.gate.assertSurface(principal, 'results');

    const [termResult] = await this.db
      .select()
      .from(schema.studentTermResults)
      .where(eq(schema.studentTermResults.studentId, principal.studentId))
      .orderBy(desc(schema.studentTermResults.computedAt))
      .limit(1);

    if (termResult) {
      const subjects = (termResult.subjects as Array<Record<string, unknown>>) ?? [];
      return {
        items: subjects.map((s, idx) => ({
          id: String(s.subject_id ?? idx),
          subjectName: s.subject_name ?? s.subjectName ?? 'Subject',
          marksObtained: s.marks_obtained ?? s.marksObtained ?? null,
          maxMarks: s.max_marks ?? s.maxMarks ?? null,
          letterGrade: s.letter_grade ?? s.letterGrade ?? null,
          termGpa: termResult.termGpa,
          termPct: termResult.termPct,
        })),
        termId: termResult.termId,
        computedAt: termResult.computedAt.toISOString(),
      };
    }

    const rows = await this.db
      .select({
        id: schema.gradeEntries.id,
        assessmentName: schema.gradeEntries.assessmentName,
        marksObtained: schema.gradeEntries.marksObtained,
        maxMarks: schema.gradeEntries.maxMarks,
        letterGrade: schema.gradeEntries.letterGrade,
        subject: schema.subjects.name,
        examName: schema.exams.name,
      })
      .from(schema.gradeEntries)
      .leftJoin(schema.subjects, eq(schema.subjects.id, schema.gradeEntries.subjectId))
      .leftJoin(schema.exams, eq(schema.exams.id, schema.gradeEntries.examId))
      .where(and(eq(schema.gradeEntries.studentId, principal.studentId), eq(schema.gradeEntries.published, true)))
      .orderBy(desc(schema.gradeEntries.createdAt));

    return {
      items: rows.map((r) => ({
        id: r.id,
        subjectName: r.subject ?? r.assessmentName,
        title: r.examName ?? r.assessmentName,
        marksObtained: r.marksObtained,
        maxMarks: r.maxMarks,
        letterGrade: r.letterGrade,
      })),
      termId: null,
      computedAt: null,
    };
  }

  async detail(principal: InstitutionalStudentPrincipal, entryId: string) {
    await this.gate.assertSurface(principal, 'results');
    const [row] = await this.db
      .select()
      .from(schema.gradeEntries)
      .where(
        and(
          eq(schema.gradeEntries.id, entryId),
          eq(schema.gradeEntries.studentId, principal.studentId),
          eq(schema.gradeEntries.published, true),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Result not found' });
    return row;
  }
}
