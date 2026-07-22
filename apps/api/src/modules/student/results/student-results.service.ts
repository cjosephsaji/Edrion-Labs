import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gt, inArray, isNull, or, schema, sql, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { FeatureControlsService } from '../../feature-controls/feature-controls.service';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';

@Injectable()
export class StudentResultsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly features: FeatureControlsService,
  ) {}

  async termResults(principal: StudentPrincipal, termId?: string) {
    requireInstitutional(principal);
    await this.assertResultsSurface(principal);

    const resolvedTermId = termId ?? (await this.currentTermId(principal.institutionId));
    if (!resolvedTermId) throw new NotFoundException({ code: 'TERM_NOT_FOUND', message: 'No term found.' });

    const [row] = await this.db
      .select()
      .from(schema.studentTermResults)
      .where(
        and(
          eq(schema.studentTermResults.studentId, principal.studentId),
          eq(schema.studentTermResults.termId, resolvedTermId),
        ),
      )
      .limit(1);

    if (!row) {
      return { term_id: resolvedTermId, subjects: [], term_gpa: null, term_pct: null, is_complete: false, features: await this.featuresPayload(principal) };
    }

    const showAverage = await this.showClassAverage(principal.institutionId);
    const scheme = await this.schemePayload(principal.institutionId, row.schemeId, row.schemeVersion);
    const subjects = (row.subjects as Array<Record<string, unknown>>).map((subject) => {
      if (!showAverage) {
        const { class_avg_pct: _removed, ...rest } = subject;
        return rest;
      }
      return subject;
    });

    return {
      term_id: row.termId,
      scheme_id: row.schemeId,
      scheme_version: row.schemeVersion,
      scheme,
      subjects,
      term_gpa: row.termGpa,
      term_pct: row.termPct,
      credits_earned: row.creditsEarned,
      credits_total: row.creditsTotal,
      is_complete: row.isComplete,
      computed_at: row.computedAt.toISOString(),
      features: await this.featuresPayload(principal),
    };
  }

  async componentDetail(
    principal: StudentPrincipal,
    subjectId: string,
    termId: string,
    cursor?: string,
    limit = 20,
  ) {
    requireInstitutional(principal);
    await this.assertResultsSurface(principal);

    const conditions = [
      eq(schema.gradeEntries.studentId, principal.studentId),
      eq(schema.gradeEntries.subjectId, subjectId),
      eq(schema.gradeEntries.termId, termId),
      eq(schema.gradeEntries.published, true),
    ];
    if (cursor) {
      const [at, id] = cursor.split('|');
      conditions.push(
        or(
          gt(schema.gradeEntries.updatedAt, new Date(at!)),
          and(eq(schema.gradeEntries.updatedAt, new Date(at!)), gt(schema.gradeEntries.id, id!)),
        )!,
      );
    }

    const rows = await this.db
      .select({
        id: schema.gradeEntries.id,
        assessment_name: schema.gradeEntries.assessmentName,
        marks_obtained: schema.gradeEntries.marksObtained,
        max_marks: schema.gradeEntries.maxMarks,
        letter_grade: schema.gradeEntries.letterGrade,
        updated_at: schema.gradeEntries.updatedAt,
      })
      .from(schema.gradeEntries)
      .where(and(...conditions))
      .orderBy(schema.gradeEntries.updatedAt, schema.gradeEntries.id)
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    const next = rows.length > limit ? rows[limit] : null;
    const revisions = page.length
      ? await this.db
          .select()
          .from(schema.markRevisions)
          .where(
            and(
              eq(schema.markRevisions.studentId, principal.studentId),
              inArray(
                schema.markRevisions.gradeEntryId,
                page.map((entry) => entry.id),
              ),
            ),
          )
      : [];

    return {
      items: page.map((entry) => ({
        ...entry,
        revisions: revisions.filter((rev) => rev.gradeEntryId === entry.id),
      })),
      next_cursor: next ? `${next.updated_at.toISOString()}|${next.id}` : null,
    };
  }

  async cgpa(principal: StudentPrincipal) {
    requireInstitutional(principal);
    await this.assertResultsSurface(principal);

    const rows = await this.db
      .select()
      .from(schema.studentCgpaSnapshots)
      .where(eq(schema.studentCgpaSnapshots.studentId, principal.studentId))
      .orderBy(desc(schema.studentCgpaSnapshots.computedAt))
      .limit(1);
    return rows[0] ?? null;
  }

  private async assertResultsSurface(principal: Extract<StudentPrincipal, { kind: 'institutional' }>) {
    const resolved = await this.features.resolveByKey('student.surface.results', {
      institutionId: principal.institutionId,
      campusId: principal.campusId ?? undefined,
      institutionUserId: principal.institutionUserId,
    });
    if (!resolved.value) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found.' });
    }
  }

  private async currentTermId(institutionId: string) {
    const [term] = await this.db
      .select({ id: schema.academicTerms.id })
      .from(schema.academicTerms)
      .where(and(eq(schema.academicTerms.institutionId, institutionId), eq(schema.academicTerms.isCurrent, true)))
      .limit(1);
    if (term) return term.id;
    const [fallback] = await this.db
      .select({ id: schema.academicTerms.id })
      .from(schema.academicTerms)
      .where(eq(schema.academicTerms.institutionId, institutionId))
      .orderBy(desc(schema.academicTerms.startDate))
      .limit(1);
    return fallback?.id ?? null;
  }

  private async showClassAverage(institutionId: string) {
    const [row] = await this.db
      .select()
      .from(schema.institutionSettings)
      .where(
        and(
          eq(schema.institutionSettings.institutionId, institutionId),
          eq(schema.institutionSettings.key, 'results.show_class_average'),
        ),
      )
      .limit(1);
    return row?.value !== 'false';
  }

  private async featuresPayload(principal: Extract<StudentPrincipal, { kind: 'institutional' }>) {
    const whatif = await this.features.resolveByKey('student.results.whatif', {
      institutionId: principal.institutionId,
      campusId: principal.campusId ?? undefined,
      institutionUserId: principal.institutionUserId,
    });
    return { whatif: whatif.value };
  }

  private async schemePayload(institutionId: string, schemeId: string, schemeVersion: number) {
    const [version] = await this.db
      .select()
      .from(schema.gradingSchemeVersions)
      .where(
        and(
          eq(schema.gradingSchemeVersions.schemeId, schemeId),
          eq(schema.gradingSchemeVersions.version, schemeVersion),
          eq(schema.gradingSchemeVersions.institutionId, institutionId),
        ),
      )
      .limit(1);
    const snap = version?.snapshot as { kind?: string; bands?: unknown; gpa_formula?: string } | undefined;
    if (!snap) return null;
    return { kind: snap.kind, bands: snap.bands, gpa_formula: snap.gpa_formula };
  }
}
