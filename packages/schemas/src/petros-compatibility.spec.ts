import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  boundedCompatibility,
  compatibilityCanonicalJson,
  compatibilityHashSchema,
  compatibilityIdentifier,
  compatibilityIntervalSchema,
  compatibilityIsEffective,
  compatibilityProvenanceSchema,
} from './petros-compatibility';

describe('Petros compatibility shared guards', () => {
  it('keeps external identifiers exact and case-sensitive', () => {
    const id = compatibilityIdentifier(20);
    expect(id.parse('Student-007')).toBe('Student-007');
    expect(id.parse('student-007')).toBe('student-007');
    expect(id.safeParse(' Student-007').success).toBe(false);
    expect(id.safeParse('Student-007 ').success).toBe(false);
    expect(id.safeParse('Student\n007').success).toBe(false);
    expect(id.safeParse('').success).toBe(false);
    expect(id.safeParse('x'.repeat(21)).success).toBe(false);
  });

  it('rejects malformed provenance, hashes, and non-forward effective intervals', () => {
    const provenance = {
      method: 'provider_record',
      sourceRef: 'synthetic-row:1',
      sourceHash: 'a'.repeat(64),
      observedAt: '2026-09-20T00:00:00.000Z',
      licence: 'synthetic-only',
    };
    expect(compatibilityProvenanceSchema.parse(provenance)).toEqual(provenance);
    expect(compatibilityProvenanceSchema.safeParse({ ...provenance, sourceHash: 'A'.repeat(64) }).success).toBe(false);
    expect(compatibilityProvenanceSchema.safeParse({ ...provenance, extra: 'no' }).success).toBe(false);
    expect(compatibilityHashSchema.safeParse('a'.repeat(63)).success).toBe(false);
    const from = '2026-09-20T00:00:00.000Z';
    expect(compatibilityIntervalSchema.safeParse({ from, until: from }).success).toBe(false);
    expect(compatibilityIntervalSchema.safeParse({ from, until: '2026-09-19T00:00:00.000Z' }).success).toBe(false);
    expect(compatibilityIntervalSchema.parse({ from, until: null })).toEqual({ from, until: null });
  });

  it('uses a half-open effective interval', () => {
    const interval = compatibilityIntervalSchema.parse({
      from: '2026-09-20T00:00:00.000Z',
      until: '2026-09-21T00:00:00.000Z',
    });
    expect(compatibilityIsEffective(interval, Date.parse('2026-09-19T23:59:59.999Z'))).toBe(false);
    expect(compatibilityIsEffective(interval, Date.parse(interval.from))).toBe(true);
    expect(compatibilityIsEffective(interval, Date.parse(interval.until!))).toBe(false);
  });

  it('uses canonical key ordering without normalizing array order', () => {
    const left = { z: [{ b: 2, a: 1 }, 'A'], a: null };
    const reordered = { a: null, z: [{ a: 1, b: 2 }, 'A'] };
    expect(compatibilityCanonicalJson(left)).toBe(compatibilityCanonicalJson(reordered));
    expect(compatibilityCanonicalJson({ z: ['A', 'B'] })).not.toBe(compatibilityCanonicalJson({ z: ['B', 'A'] }));
  });

  it('rejects oversized or deeply nested payloads before schema parsing', () => {
    const schema = boundedCompatibility(z.object({ value: z.unknown() }).strict(), 100);
    expect(schema.safeParse({ value: 'small' }).success).toBe(true);
    expect(schema.safeParse({ value: 'x'.repeat(100) }).success).toBe(false);
    let deep: unknown = 'end';
    for (let i = 0; i < 13; i++) deep = [deep];
    expect(schema.safeParse({ value: deep }).success).toBe(false);
    expect(schema.safeParse({ value: Array.from({ length: 8_001 }, () => 1) }).success).toBe(false);
  });
});
