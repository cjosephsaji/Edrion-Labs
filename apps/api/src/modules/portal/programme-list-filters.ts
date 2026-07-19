import { and, eq, inArray, isNull, or, schema, type Database, type PgColumn, type SQL } from '@edrion/database';

export interface ProgrammeListFilterQuery {
  departmentId?: string;
  programmeLevelId?: string;
  academicYearId?: string;
  termId?: string;
  /**
   * Department-agnostic facets. `programmeLevelId` and `departmentId` both narrow to ONE department,
   * so they cannot answer "semester 1 across every programme". A university's "Year 1"/"Semester 1"
   * is a separate row per department, but they share these numbers (grade_levels.level and
   * academic_terms.sequence) — so the numbers are the only handle that crosses departments.
   *
   * Note `sequence` counts *within* a year: an 8-semester programme's "Semester 5" is
   * gradeLevelNumber 3 + semesterSequence 1, not semesterSequence 5.
   */
  gradeLevelNumber?: number;
  semesterSequence?: number;
}

export interface ProgrammeFilterColumns {
  academicYearId?: PgColumn;
  termId?: PgColumn;
  gradeLevelId?: PgColumn;
  classId?: PgColumn;
  /**
   * Slot columns on the table itself (currently only fee_structures). A college-wide row stores the
   * numbers directly and leaves term_id / grade_level_id NULL, so without these it would be filtered
   * *out* by the very facet meant to surface it.
   */
  gradeLevelNumber?: PgColumn;
  termSequence?: PgColumn;
  /**
   * When true and filtering by termId with a year pinned: NULL term_id rows (whole-year) also match.
   * Mirrors classes.term_id — never use a bare eq(termCol, termId) for such tables.
   */
  termIdNullMeansWholeYear?: boolean;
}

function pushOrParts(conds: SQL[], parts: SQL[]) {
  if (parts.length === 1) conds.push(parts[0]!);
  else if (parts.length > 1) {
    const combined = or(...parts);
    if (combined) conds.push(combined);
  }
}

/** Shared Programme → Year → Term list facets for portal resources that carry term/grade/class FKs. */
export function programmeListFilterConds(
  db: Database,
  q: ProgrammeListFilterQuery,
  cols: ProgrammeFilterColumns,
): SQL[] {
  const conds: SQL[] = [];
  const {
    academicYearId: yearCol,
    termId: termCol,
    gradeLevelId: gradeCol,
    classId: classCol,
    gradeLevelNumber: gradeNumCol,
    termSequence: termSeqCol,
    termIdNullMeansWholeYear = false,
  } = cols;

  if (q.academicYearId) {
    const parts: SQL[] = [];
    if (yearCol) parts.push(eq(yearCol, q.academicYearId));
    if (termCol) {
      parts.push(
        inArray(
          termCol,
          db
            .select({ id: schema.academicTerms.id })
            .from(schema.academicTerms)
            .where(eq(schema.academicTerms.academicYearId, q.academicYearId)),
        ),
      );
    }
    if (classCol) {
      parts.push(
        inArray(
          classCol,
          db
            .select({ id: schema.classes.id })
            .from(schema.classes)
            .where(eq(schema.classes.academicYearId, q.academicYearId)),
        ),
      );
    }
    pushOrParts(conds, parts);
  }

  if (q.termId && termCol) {
    if (termIdNullMeansWholeYear && q.academicYearId) {
      // Year already pinned: whole-year rows (term_id NULL) qualify alongside the selected term.
      const wholeYearOrTerm = or(eq(termCol, q.termId), isNull(termCol));
      if (wholeYearOrTerm) conds.push(wholeYearOrTerm);
    } else if (termIdNullMeansWholeYear && !q.academicYearId) {
      // Defensive: NULL-term rows only when their own year matches the term's year.
      const yearOfTerm = db
        .select({ academicYearId: schema.academicTerms.academicYearId })
        .from(schema.academicTerms)
        .where(eq(schema.academicTerms.id, q.termId));
      if (yearCol) {
        const nullInYear = and(isNull(termCol), inArray(yearCol, yearOfTerm));
        const combined = or(eq(termCol, q.termId), nullInYear);
        if (combined) conds.push(combined);
      } else if (classCol) {
        const combined = or(
          eq(termCol, q.termId),
          inArray(
            classCol,
            db
              .select({ id: schema.classes.id })
              .from(schema.classes)
              .where(and(isNull(schema.classes.termId), inArray(schema.classes.academicYearId, yearOfTerm))),
          ),
        );
        if (combined) conds.push(combined);
      } else {
        conds.push(eq(termCol, q.termId));
      }
    } else {
      conds.push(eq(termCol, q.termId));
    }
  }

  if (q.programmeLevelId) {
    const parts: SQL[] = [];
    if (termCol) {
      parts.push(
        inArray(
          termCol,
          db
            .select({ id: schema.academicTerms.id })
            .from(schema.academicTerms)
            .where(eq(schema.academicTerms.programmeLevelId, q.programmeLevelId)),
        ),
      );
    }
    if (gradeCol) {
      parts.push(
        inArray(
          gradeCol,
          db
            .select({ gradeLevelId: schema.departmentGradeLevels.gradeLevelId })
            .from(schema.departmentGradeLevels)
            .where(eq(schema.departmentGradeLevels.id, q.programmeLevelId)),
        ),
      );
    }
    if (classCol) {
      parts.push(
        inArray(
          classCol,
          db
            .select({ id: schema.classes.id })
            .from(schema.classes)
            .where(eq(schema.classes.programmeLevelId, q.programmeLevelId)),
        ),
      );
    }
    pushOrParts(conds, parts);
  }

  if (q.departmentId) {
    const parts: SQL[] = [];
    if (termCol) {
      parts.push(
        inArray(
          termCol,
          db
            .select({ id: schema.academicTerms.id })
            .from(schema.academicTerms)
            .where(eq(schema.academicTerms.departmentId, q.departmentId)),
        ),
      );
    }
    if (gradeCol) {
      parts.push(
        inArray(
          gradeCol,
          db
            .select({ gradeLevelId: schema.departmentGradeLevels.gradeLevelId })
            .from(schema.departmentGradeLevels)
            .where(eq(schema.departmentGradeLevels.departmentId, q.departmentId)),
        ),
      );
    }
    if (classCol) {
      parts.push(
        inArray(
          classCol,
          db
            .select({ id: schema.classes.id })
            .from(schema.classes)
            .innerJoin(
              schema.departmentGradeLevels,
              eq(schema.classes.programmeLevelId, schema.departmentGradeLevels.id),
            )
            .where(eq(schema.departmentGradeLevels.departmentId, q.departmentId)),
        ),
      );
    }
    pushOrParts(conds, parts);
  }

  if (q.semesterSequence !== undefined) {
    const parts: SQL[] = [];
    if (termSeqCol) parts.push(eq(termSeqCol, q.semesterSequence));
    if (termCol) {
      parts.push(
        inArray(
          termCol,
          db
            .select({ id: schema.academicTerms.id })
            .from(schema.academicTerms)
            .where(eq(schema.academicTerms.sequence, q.semesterSequence)),
        ),
      );
    }
    if (classCol) {
      parts.push(
        inArray(
          classCol,
          db
            .select({ id: schema.classes.id })
            .from(schema.classes)
            .innerJoin(schema.academicTerms, eq(schema.classes.termId, schema.academicTerms.id))
            .where(eq(schema.academicTerms.sequence, q.semesterSequence)),
        ),
      );
    }
    pushOrParts(conds, parts);
  }

  if (q.gradeLevelNumber !== undefined) {
    const levelIds = db
      .select({ id: schema.gradeLevels.id })
      .from(schema.gradeLevels)
      .where(eq(schema.gradeLevels.level, q.gradeLevelNumber));
    const parts: SQL[] = [];
    if (gradeNumCol) parts.push(eq(gradeNumCol, q.gradeLevelNumber));
    if (gradeCol) parts.push(inArray(gradeCol, levelIds));
    if (termCol) {
      parts.push(
        inArray(
          termCol,
          db
            .select({ id: schema.academicTerms.id })
            .from(schema.academicTerms)
            .innerJoin(
              schema.gradeLevels,
              eq(schema.academicTerms.gradeLevelId, schema.gradeLevels.id),
            )
            .where(eq(schema.gradeLevels.level, q.gradeLevelNumber)),
        ),
      );
    }
    if (classCol) {
      parts.push(
        inArray(
          classCol,
          db
            .select({ id: schema.classes.id })
            .from(schema.classes)
            .innerJoin(schema.gradeLevels, eq(schema.classes.gradeLevelId, schema.gradeLevels.id))
            .where(eq(schema.gradeLevels.level, q.gradeLevelNumber)),
        ),
      );
    }
    pushOrParts(conds, parts);
  }

  return conds;
}
