import { eq, inArray, isNull, or, type PgColumn, type SQL } from '@edrion/database';

/** A campus filter resolved from the request scope (null = every campus in the institution). */
export type CampusFilter = string[] | null;

/**
 * institution_id match + (when campus-scoped) campus_id IN scope OR institution-owned.
 * Shared by portal repositories so campus scoping stays identical everywhere.
 */
export function scopeConds(
  instCol: PgColumn,
  campusCol: PgColumn,
  institutionId: string,
  campusIds: CampusFilter,
): SQL[] {
  const conds: SQL[] = [eq(instCol, institutionId)];
  if (campusIds) {
    const inScope = or(isNull(campusCol), inArray(campusCol, campusIds));
    if (inScope) conds.push(inScope);
  }
  return conds;
}
