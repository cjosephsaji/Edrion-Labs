export const VISUAL_SCHEMA_BACKFILL_JOB = 'visual.schema_backfill';
export const VISUAL_SCHEMA_BACKFILL_BATCH_SIZE = 25;

export const MAX_CANVAS_REVISIONS = 200;

/** Revision reasons preserved when pruning overflow. */
export const ANCHOR_REVISION_REASONS = new Set([
  'created',
  'generation',
  'migration',
  'spawn',
  'clash_build',
] as const);
