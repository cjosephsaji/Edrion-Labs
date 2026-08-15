import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  isNull,
  or,
  schema,
  type Database,
} from '@edrion/database';
import { computeStanding, computeSchemeTermAggregate, presetSnapshot, SCHEME_PRESETS, type SchemeSnapshot } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';

@Injectable()
export class ResultsRecomputeService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async recomputeStudent(institutionId: string, studentId: string, termId: string) {
    const [term] = await this.db
      .select()
      .from(schema.academicTerms)
      .where(and(eq(schema.academicTerms.id, termId), eq(schema.academicTerms.institutionId, institutionId)))
      .limit(1);
    if (!term) return null;

    const scheme = await this.resolveScheme(institutionId, term);
    const [enrollment] = await this.db
      .select()
      .from(schema.studentEnrollments)
      .where(
        and(
          eq(schema.studentEnrollments.studentId, studentId),
          eq(schema.studentEnrollments.institutionId, institutionId),
          eq(schema.studentEnrollments.status, 'active'),
        ),
      )
      .orderBy(desc(schema.studentEnrollments.createdAt))
      .limit(1);
    if (!enrollment?.classId) return null;

    const classSubjects = await this.db
      .select({
        subjectId: schema.classSubjectTeachers.subjectId,
        subjectName: schema.subjects.name,
      })
      .from(schema.classSubjectTeachers)
      .innerJoin(schema.subjects, eq(schema.subjects.id, schema.classSubjectTeachers.subjectId))
      .where(
        and(
          eq(schema.classSubjectTeachers.institutionId, institutionId),
          eq(schema.classSubjectTeachers.classId, enrollment.classId),
        ),
      );

    const weightMaps = await this.db
      .select()
      .from(schema.subjectWeightMaps)
      .where(
        and(
          eq(schema.subjectWeightMaps.institutionId, institutionId),
          eq(schema.subjectWeightMaps.termId, termId),
          or(
            eq(schema.subjectWeightMaps.classId, enrollment.classId),
            isNull(schema.subjectWeightMaps.classId),
          ),
        ),
      );

    const entries = await this.db
      .select()
      .from(schema.gradeEntries)
      .where(
        and(
          eq(schema.gradeEntries.institutionId, institutionId),
          eq(schema.gradeEntries.studentId, studentId),
          eq(schema.gradeEntries.termId, termId),
        ),
      );

    const subjectsPayload: Array<Record<string, unknown>> = [];
    const aggregateInputs: Array<{
      weighted_pct: number;
      grade_points: number | null;
      is_pass: boolean;
      credits: number | null;
      open_weight_pct: number;
    }> = [];

    for (const row of classSubjects) {
      const map =
        weightMaps.find((m) => m.subjectId === row.subjectId && m.classId === enrollment.classId) ??
        weightMaps.find((m) => m.subjectId === row.subjectId && m.classId === null);
      if (!map) {
        aggregateInputs.push({
          weighted_pct: 0,
          grade_points: null,
          is_pass: false,
          credits: null,
          open_weight_pct: 100,
        });
        continue;
      }

      const [programmeSubject] = await this.db
        .select({ credits: schema.programmeSubjects.credits })
        .from(schema.programmeSubjects)
        .innerJoin(schema.classes, eq(schema.classes.programmeLevelId, schema.programmeSubjects.programmeLevelId))
        .where(
          and(
            eq(schema.classes.id, enrollment.classId),
            eq(schema.programmeSubjects.subjectId, row.subjectId),
            eq(schema.programmeSubjects.semesterSequence, term.sequence),
          ),
        )
        .limit(1);

      const credits =
        map.creditsOverride !== null && map.creditsOverride !== undefined
          ? Number(map.creditsOverride)
          : programmeSubject?.credits ?? null;

      const subjectEntries = entries
        .filter((e) => e.subjectId === row.subjectId)
        .map((e) => ({
          exam_id: e.examId,
          assessment_name: e.assessmentName,
          marks_obtained: e.marksObtained,
          max_marks: e.maxMarks,
          published: e.published,
        }));

      const standing = computeStanding(
        scheme,
        { components: map.components as never, credits },
        subjectEntries,
      );

      if (standing.open_weight_pct > 0) {
        /* rolled into aggregate */
      }

      aggregateInputs.push({
        weighted_pct: standing.weighted_pct,
        grade_points: standing.grade_points,
        is_pass: standing.is_pass ?? false,
        credits,
        open_weight_pct: standing.open_weight_pct,
      });

      const components = (map.components as Array<{ key: string; label: string; weight_pct: number }>).map(
        (component) => {
          const rowStanding = standing.per_component.find((p) => p.key === component.key);
          return {
            key: component.key,
            label: component.label,
            weight_pct: component.weight_pct,
            released: rowStanding?.released ?? false,
            score: rowStanding?.score,
            max: rowStanding?.max,
            pct: rowStanding?.pct,
          };
        },
      );

      subjectsPayload.push({
        subject_id: row.subjectId,
        subject_name_snapshot: row.subjectName,
        credits,
        credits_not_set: standing.credits_not_set ?? false,
        components,
        weighted_pct: standing.weighted_pct,
        open_weight_pct: standing.open_weight_pct,
        grade: standing.grade,
        grade_points: standing.grade_points,
        class_avg_pct: null,
      });
    }

    const { termPct, termGpa, creditsEarned, creditsTotal, isComplete } = computeSchemeTermAggregate(
      scheme,
      aggregateInputs,
    );

    const payload = {
      institutionId,
      studentId,
      termId,
      schemeId: scheme.id!,
      schemeVersion: scheme.version!,
      subjects: subjectsPayload,
      termGpa: termGpa !== null ? String(termGpa) : null,
      termPct: String(termPct),
      creditsEarned,
      creditsTotal,
      isComplete,
      computedAt: new Date(),
    };

    const [existing] = await this.db
      .select()
      .from(schema.studentTermResults)
      .where(
        and(
          eq(schema.studentTermResults.studentId, studentId),
          eq(schema.studentTermResults.termId, termId),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await this.db
        .update(schema.studentTermResults)
        .set({ ...payload, version: existing.version + 1 })
        .where(eq(schema.studentTermResults.id, existing.id))
        .returning();
      return updated;
    }

    const [inserted] = await this.db
      .insert(schema.studentTermResults)
      .values(payload)
      .returning();
    return inserted;
  }

  private async resolveScheme(
    institutionId: string,
    term: typeof schema.academicTerms.$inferSelect,
  ): Promise<SchemeSnapshot & { id?: string; version?: number }> {
    if (term.gradingSchemeId && term.gradingSchemeVersion) {
      const [version] = await this.db
        .select()
        .from(schema.gradingSchemeVersions)
        .where(
          and(
            eq(schema.gradingSchemeVersions.schemeId, term.gradingSchemeId),
            eq(schema.gradingSchemeVersions.version, term.gradingSchemeVersion),
          ),
        )
        .limit(1);
      if (version?.snapshot) {
        const snap = version.snapshot as unknown as SchemeSnapshot;
        return { ...snap, id: term.gradingSchemeId, version: term.gradingSchemeVersion };
      }
    }

    const [defaultScheme] = await this.db
      .select()
      .from(schema.gradingSchemes)
      .where(and(eq(schema.gradingSchemes.institutionId, institutionId), eq(schema.gradingSchemes.isDefault, true)))
      .limit(1);

    if (defaultScheme) {
      return {
        kind: defaultScheme.kind as SchemeSnapshot['kind'],
        bands: defaultScheme.bands as SchemeSnapshot['bands'],
        gpa_formula: defaultScheme.gpaFormula as SchemeSnapshot['gpa_formula'],
        id: defaultScheme.id,
        version: defaultScheme.version,
      };
    }

    const ensured = await this.ensureDefaultScheme(institutionId);
    return {
      kind: ensured.kind as SchemeSnapshot['kind'],
      bands: ensured.bands as SchemeSnapshot['bands'],
      gpa_formula: ensured.gpaFormula as SchemeSnapshot['gpa_formula'],
      id: ensured.id,
      version: ensured.version,
    };
  }

  private async ensureDefaultScheme(institutionId: string) {
    const preset = presetSnapshot('points_10');
    const [created] = await this.db
      .insert(schema.gradingSchemes)
      .values({
        institutionId,
        name: SCHEME_PRESETS.points_10?.name ?? '10-Point GPA',
        kind: 'points_10',
        bands: preset.bands,
        gpaFormula: preset.gpa_formula,
        isDefault: true,
        isActive: true,
        version: 1,
      })
      .returning();
    return created!;
  }
}
