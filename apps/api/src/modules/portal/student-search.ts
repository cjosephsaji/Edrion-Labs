import { ilike, or, sql, type PgColumn, type SQL } from '@edrion/database';
import { personSqlName } from '@edrion/database';

/** Columns on `students` that participate in a people search. */
export interface StudentSearchColumns {
  firstName: PgColumn;
  middleName: PgColumn;
  lastName: PgColumn;
  admissionNo: PgColumn;
  rollNo: PgColumn;
  email: PgColumn;
  phone: PgColumn;
}

/**
 * Shared student search predicate for portal list endpoints and Petros lookups.
 * Matches first/middle/last name, full name ("Arjun K Sharma"), admission no., roll no., email, and phone.
 */
export function studentSearchCondition(c: StudentSearchColumns, term: string): SQL {
  const like = `%${term}%`;
  const fullName = personSqlName(c.firstName, c.middleName, c.lastName);
  return (
    or(
      ilike(c.firstName, like),
      ilike(c.middleName, like),
      ilike(c.lastName, like),
      ilike(fullName, like),
      ilike(c.admissionNo, like),
      ilike(c.rollNo, like),
      ilike(c.email, like),
      ilike(c.phone, like),
    ) ?? sql`false`
  );
}
