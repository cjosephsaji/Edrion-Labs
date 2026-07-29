/**
 * Postgres schemas that hold application tables (from Drizzle `packages/database/src/schema`).
 * All domain tables live in `public`; independent-learner data is separated by owner columns
 * (`independent_user_id` vs `student_id`), not a separate schema.
 */
export const APP_SCHEMAS = ['public'] as const;

export type AppSchemaName = (typeof APP_SCHEMAS)[number];
