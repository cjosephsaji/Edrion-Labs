import { getTableColumns } from 'drizzle-orm';
import { schema, sql } from '@edrion/database';

/** SQL projection: historical document answer keys never enter ordinary repositories. */
export const publicPetrosSessionColumns = {
  ...getTableColumns(schema.petrosLearningSessions),
  learnerContext: sql<Record<string, unknown>>`${schema.petrosLearningSessions.learnerContext} - 'documentTeachingInternalPlan'`,
};
