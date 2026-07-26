import { sql, type SQL } from 'drizzle-orm';
import type { AnyColumn } from 'drizzle-orm';

/** SQL expression for a person's display name (middle name omitted when null/blank). */
export function personSqlName(first: AnyColumn, middle: AnyColumn, last: AnyColumn): SQL<string> {
  return sql<string>`trim(concat_ws(' ', ${first}, nullif(trim(${middle}), ''), ${last}))`;
}
