import {
  VISUAL_ARCHETYPES,
  VISUAL_CANVAS_STATUSES,
  VISUAL_ORIGINS,
  EXPECTED_VISUAL_CANVASES_ARCHETYPE_CHECK,
  EXPECTED_VISUAL_CANVASES_ORIGIN_CHECK,
  EXPECTED_VISUAL_CANVASES_STATUS_CHECK,
  assertArchetypeParity,
  assertOriginParity,
  parsePostgresCheckInList,
} from '@edrion/schemas';

/**
 * Drizzle CHECK literals in visual-studio.ts must stay aligned with Zod exports.
 * Import this at API startup or in migration verification tests.
 */
export function assertVisualStudioSchemaParity(): void {
  assertArchetypeParity(VISUAL_ARCHETYPES, EXPECTED_VISUAL_CANVASES_ARCHETYPE_CHECK);
  assertOriginParity(VISUAL_ORIGINS, EXPECTED_VISUAL_CANVASES_ORIGIN_CHECK);
  const statuses = parsePostgresCheckInList(EXPECTED_VISUAL_CANVASES_STATUS_CHECK).sort();
  const expectedStatuses = [...VISUAL_CANVAS_STATUSES].sort();
  if (statuses.join(',') !== expectedStatuses.join(',')) {
    throw new Error(
      `visual_canvases.status CHECK mismatch: expected [${expectedStatuses.join(', ')}], got [${statuses.join(', ')}]`,
    );
  }
}
