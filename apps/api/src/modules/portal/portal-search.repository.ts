import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  personSqlName,
  schema,
  sql,
  type Database,
  type PgColumn,
  type PgTable,
  type SQL,
} from '@edrion/database';
import { DATABASE } from '../../common/tokens';
import { studentSearchCondition } from './student-search';

/** One matched row, pre-shaped for the global-search UI (href is added by the service). */
export interface SearchHit {
  id: string;
  label: string;
  sublabel: string | null;
}

const s = schema;

const twoPartName = (first: PgColumn, last: PgColumn): SQL<string> =>
  sql<string>`concat_ws(' ', ${first}, ${last})`;

/** First non-null of a set of columns — used to build a compact "sublabel" line. */
const firstOf = (...cols: PgColumn[]): SQL<string | null> => sql<string | null>`coalesce(${sql.join(cols, sql`, `)})`;

/**
 * Read-only, scope-aware SQL for the institution-portal GLOBAL SEARCH. Every query is confined to
 * one institution and (when the scope is a campus) to that campus plus institution-owned rows —
 * the same semantics every other portal repository uses. The service decides which of these run,
 * based on the caller's per-module view permissions.
 */
@Injectable()
export class PortalSearchRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // --- people -----------------------------------------------------------------

  searchStudents(institutionId: string, campusIds: string[] | null, term: string, limit: number) {
    const t = s.students;
    return this.run({
      table: t,
      instCol: t.institutionId,
      campusCol: t.campusId,
      idCol: t.id,
      label: personSqlName(t.firstName, t.middleName, t.lastName),
      sublabel: firstOf(t.admissionNo, t.rollNo, t.email, t.phone),
      searchCond: studentSearchCondition(t, term),
      order: t.lastName,
      institutionId,
      campusIds,
      term,
      limit,
    });
  }

  searchTeachers(institutionId: string, campusIds: string[] | null, term: string, limit: number) {
    const t = s.staff;
    return this.run({
      table: t,
      instCol: t.institutionId,
      campusCol: t.campusId,
      idCol: t.id,
      label: personSqlName(t.firstName, t.middleName, t.lastName),
      sublabel: firstOf(t.employeeNo, t.email, t.phone),
      match: [t.firstName, t.middleName, t.lastName, t.employeeNo, t.email, t.phone],
      order: t.lastName,
      institutionId,
      campusIds,
      term,
      limit,
    });
  }

  searchStaff(institutionId: string, campusIds: string[] | null, term: string, limit: number) {
    const t = s.staff;
    return this.run({
      table: t,
      instCol: t.institutionId,
      campusCol: t.campusId,
      idCol: t.id,
      label: personSqlName(t.firstName, t.middleName, t.lastName),
      sublabel: firstOf(t.employeeNo, t.email, t.phone),
      match: [t.firstName, t.middleName, t.lastName, t.employeeNo, t.email, t.phone],
      order: t.lastName,
      institutionId,
      campusIds,
      term,
      limit,
    });
  }

  searchParents(institutionId: string, campusIds: string[] | null, term: string, limit: number) {
    const t = s.parents;
    return this.run({
      table: t,
      instCol: t.institutionId,
      campusCol: t.campusId,
      idCol: t.id,
      label: twoPartName(t.firstName, t.lastName),
      sublabel: firstOf(t.email, t.phone),
      match: [t.firstName, t.lastName, t.email, t.phone],
      order: t.lastName,
      institutionId,
      campusIds,
      term,
      limit,
    });
  }

  // --- academic structure -----------------------------------------------------

  searchClasses(institutionId: string, campusIds: string[] | null, term: string, limit: number) {
    const t = s.classes;
    return this.run({
      table: t,
      instCol: t.institutionId,
      campusCol: t.campusId,
      idCol: t.id,
      label: sql<string>`${t.name}`,
      sublabel: firstOf(t.section, t.room),
      match: [t.name, t.section, t.room],
      order: t.name,
      institutionId,
      campusIds,
      term,
      limit,
    });
  }

  searchSubjects(institutionId: string, campusIds: string[] | null, term: string, limit: number) {
    const t = s.subjects;
    return this.run({
      table: t,
      instCol: t.institutionId,
      campusCol: t.campusId,
      idCol: t.id,
      label: sql<string>`${t.name}`,
      sublabel: firstOf(t.code),
      match: [t.name, t.code],
      order: t.name,
      institutionId,
      campusIds,
      term,
      limit,
    });
  }

  searchDepartments(institutionId: string, campusIds: string[] | null, term: string, limit: number) {
    const t = s.departments;
    return this.run({
      table: t,
      instCol: t.institutionId,
      campusCol: t.campusId,
      idCol: t.id,
      label: sql<string>`${t.name}`,
      sublabel: firstOf(t.code),
      match: [t.name, t.code],
      order: t.name,
      institutionId,
      campusIds,
      term,
      limit,
    });
  }

  searchGradeLevels(institutionId: string, campusIds: string[] | null, term: string, limit: number) {
    const t = s.gradeLevels;
    return this.run({
      table: t,
      instCol: t.institutionId,
      campusCol: t.campusId,
      idCol: t.id,
      label: sql<string>`${t.name}`,
      sublabel: null,
      match: [t.name],
      order: t.name,
      institutionId,
      campusIds,
      term,
      limit,
    });
  }

  // --- shared -----------------------------------------------------------------

  private async run(opts: {
    table: PgTable;
    instCol: PgColumn;
    campusCol: PgColumn;
    idCol: PgColumn;
    label: SQL<string>;
    sublabel: SQL<string | null> | null;
    match?: PgColumn[];
    searchCond?: SQL;
    order: PgColumn;
    institutionId: string;
    campusIds: string[] | null;
    term: string;
    limit: number;
  }): Promise<SearchHit[]> {
    const like = `%${opts.term}%`;
    const match =
      opts.searchCond ?? or(...(opts.match ?? []).map((c) => ilike(c, like)));
    const where = and(
      eq(opts.instCol, opts.institutionId),
      this.campusNarrow(opts.campusCol, opts.campusIds),
      match,
    );
    const rows = await this.db
      .select({
        id: opts.idCol,
        label: opts.label,
        sublabel: opts.sublabel ?? sql<string | null>`null`,
      })
      .from(opts.table)
      .where(where)
      .orderBy(asc(opts.order))
      .limit(opts.limit);
    return rows.map((r) => ({ id: r.id as string, label: r.label, sublabel: r.sublabel ?? null }));
  }

  /** (campus_id ∈ ids OR campus_id IS NULL) when confined; always-true when institution-wide. */
  private campusNarrow(campusCol: PgColumn, campusIds: string[] | null): SQL {
    if (campusIds === null) return sql`true`;
    if (campusIds.length === 0) return sql`false`;
    return or(inArray(campusCol, campusIds), isNull(campusCol)) as SQL;
  }
}
