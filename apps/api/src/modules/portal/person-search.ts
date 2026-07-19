import { ilike, or, sql, type PgColumn, type SQL } from '@edrion/database';
import { personSqlName } from '@edrion/database';

export interface PersonNameColumns {
  firstName: PgColumn;
  middleName?: PgColumn;
  lastName: PgColumn;
}

/**
 * Shared people-search predicate: matches individual name parts, the concatenated display name
 * ("Arjun K Sharma", "Jane Doe"), and any extra identifier columns (email, employee no., etc.).
 */
export function personSearchCondition(
  name: PersonNameColumns,
  term: string,
  extraColumns: PgColumn[] = [],
): SQL {
  const like = `%${term}%`;
  const fullName = name.middleName
    ? personSqlName(name.firstName, name.middleName, name.lastName)
    : sql<string>`trim(concat_ws(' ', ${name.firstName}, ${name.lastName}))`;

  const parts: SQL[] = [ilike(name.firstName, like), ilike(name.lastName, like), ilike(fullName, like)];
  if (name.middleName) parts.push(ilike(name.middleName, like));
  for (const col of extraColumns) parts.push(ilike(col, like));

  return or(...parts) ?? sql`false`;
}
