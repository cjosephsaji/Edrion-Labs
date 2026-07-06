import { eq, inArray, or, schema, type Database, type PgColumn, type SQL } from '@edrion/database';

export interface ProgrammeListFilterQuery {
  departmentId?: string;
  programmeLevelId?: string;
  termId?: string;
}

export interface ProgrammeFilterColumns {
  termId?: PgColumn;
  gradeLevelId?: PgColumn;
  classId?: PgColumn;
}

/** Shared Programme → Year → Term list facets for portal resources that carry term/grade/class FKs. */
export function programmeListFilterConds(
  db: Database,
  q: ProgrammeListFilterQuery,
  cols: ProgrammeFilterColumns,
): SQL[] {
  const conds: SQL[] = [];
  const { termId: termCol, gradeLevelId: gradeCol, classId: classCol } = cols;

  if (q.termId && termCol) {
    conds.push(eq(termCol, q.termId));
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
    if (parts.length === 1) conds.push(parts[0]!);
    else if (parts.length > 1) {
      const combined = or(...parts);
      if (combined) conds.push(combined);
    }
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
    if (parts.length === 1) conds.push(parts[0]!);
    else if (parts.length > 1) {
      const combined = or(...parts);
      if (combined) conds.push(combined);
    }
  }

  return conds;
}
