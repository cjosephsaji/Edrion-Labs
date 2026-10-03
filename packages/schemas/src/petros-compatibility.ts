import { z } from 'zod';

/** Preflight before recursive Zod parsing; no provider payload or executable fields. */
export function boundedCompatibility<T extends z.ZodTypeAny>(schema: T, maxBytes = 64_000) {
  return z.unknown().superRefine((value, ctx) => {
    const pending = [{ value, depth: 0 }];
    let nodes = 0;
    let bytes = 0;
    while (pending.length) {
      const entry = pending.pop()!;
      if (++nodes > 8_000 || entry.depth > 12 || bytes > maxBytes) {
        ctx.addIssue({ code: 'custom', message: 'Compatibility payload exceeds its bounds.' });
        return;
      }
      if (typeof entry.value === 'string') bytes += entry.value.length * 6 + 2;
      else if (entry.value && typeof entry.value === 'object') {
        for (const [key, child] of Object.entries(entry.value)) {
          bytes += key.length * 6 + 4;
          pending.push({ value: child, depth: entry.depth + 1 });
        }
      } else bytes += 16;
    }
    if (bytes > maxBytes) ctx.addIssue({ code: 'custom', message: 'Compatibility payload exceeds its bounds.' });
  }).pipe(schema);
}

export const compatibilityText = (max: number) => z.string().trim().min(1).max(max);
export const compatibilityIdentifier = (max: number) => z.string().min(1).max(max)
  .refine((value) => value === value.trim() && ![...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  }), 'Identifiers must be exact, without surrounding whitespace or control characters.');
export const compatibilityHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const compatibilityProvenanceSchema = z.object({
  method: z.enum(['manual', 'provider_record', 'ai_suggestion']),
  sourceRef: compatibilityText(500),
  sourceHash: compatibilityHashSchema,
  observedAt: z.string().datetime({ offset: true }),
  licence: compatibilityText(500),
}).strict();
export const compatibilityIntervalSchema = z.object({
  from: z.string().datetime({ offset: true }),
  until: z.string().datetime({ offset: true }).nullable(),
}).strict().refine((v) => !v.until || Date.parse(v.until) > Date.parse(v.from), 'Invalid effective interval.');

/** Stable across JSONB key ordering. Used for receipts, not identity inference. */
export function compatibilityCanonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(compatibilityCanonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${compatibilityCanonicalJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function compatibilityIsEffective(interval: z.infer<typeof compatibilityIntervalSchema>, now: number) {
  return Date.parse(interval.from) <= now && (!interval.until || now < Date.parse(interval.until));
}
