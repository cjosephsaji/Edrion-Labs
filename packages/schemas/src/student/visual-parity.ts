/**
 * Parse quoted literals from a PostgreSQL CHECK `IN (...)` or `= ANY (ARRAY[...])` clause.
 */
export function parsePostgresCheckInList(constraintDefinition: string): string[] {
  const matches = constraintDefinition.matchAll(/'([^']+)'/g);
  return [...matches].map((match) => match[1]!);
}

export function sortedStringSet(values: readonly string[]): string[] {
  return [...values].sort();
}

export function assertEqualSortedSets(
  label: string,
  left: readonly string[],
  right: readonly string[],
): void {
  const a = sortedStringSet(left);
  const b = sortedStringSet(right);
  if (a.length !== b.length || a.some((value, index) => value !== b[index])) {
    throw new Error(
      `${label} mismatch: expected [${b.join(', ')}], got [${a.join(', ')}]`,
    );
  }
}

export function assertArchetypeParity(
  zodArchetypes: readonly string[],
  constraintDefinition: string,
): void {
  assertEqualSortedSets(
    'visual_canvases.archetype CHECK',
    zodArchetypes,
    parsePostgresCheckInList(constraintDefinition),
  );
}

export function assertOriginParity(
  zodOrigins: readonly string[],
  constraintDefinition: string,
): void {
  assertEqualSortedSets(
    'visual_canvases.origin CHECK',
    zodOrigins,
    parsePostgresCheckInList(constraintDefinition),
  );
}

export const EXPECTED_VISUAL_CANVASES_ARCHETYPE_CHECK =
  "CHECK ((archetype = ANY (ARRAY['mind_map'::text, 'flowchart'::text, 'cycle'::text, 'timeline'::text, 'hierarchy'::text, 'comparison'::text])))";

export const EXPECTED_VISUAL_CANVASES_ORIGIN_CHECK =
  "CHECK ((origin = ANY (ARRAY['prompt'::text, 'library_source'::text, 'learn_topic'::text, 'learn_session'::text, 'memory'::text, 'legacy'::text, 'debate_clash'::text])))";

export const EXPECTED_VISUAL_CANVASES_STATUS_CHECK =
  "CHECK ((status = ANY (ARRAY['generating'::text, 'ready'::text, 'failed'::text])))";
