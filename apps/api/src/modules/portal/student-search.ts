import type { PgColumn, SQL } from '@edrion/database';
import { personSearchCondition } from './person-search';

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
  return personSearchCondition(
    { firstName: c.firstName, middleName: c.middleName, lastName: c.lastName },
    term,
    [c.admissionNo, c.rollNo, c.email, c.phone],
  );
}
