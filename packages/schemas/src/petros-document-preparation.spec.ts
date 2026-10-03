import { describe, it, expect } from 'vitest';
import {
  petrosPdfWorkerResultSchema,
  petrosPreparationCommandSchema,
  petrosPreparationStatusSchema,
} from './petros-document-preparation';

describe('document preparation boundaries', () => {
  it('bounds physical pages, UTF-16 text and exact process messages', () => {
    const result = { pages: ['Readable source text.'], fileSha256: 'a'.repeat(64) };
    expect(petrosPdfWorkerResultSchema.parse(result)).toEqual(result);
    expect(petrosPdfWorkerResultSchema.safeParse({ ...result, pages: [] }).success).toBe(false);
    expect(
      petrosPdfWorkerResultSchema.safeParse({ ...result, pages: Array(501).fill('a') }).success,
    ).toBe(false);
    expect(
      petrosPdfWorkerResultSchema.safeParse({ ...result, pages: ['😀'.repeat(1_000_001)] }).success,
    ).toBe(false);
    expect(petrosPdfWorkerResultSchema.safeParse({ ...result, owner: 'forged' }).success).toBe(
      false,
    );
  });
  it('accepts lifecycle commands only with an expected version and no client authority fields', () => {
    expect(petrosPreparationCommandSchema.parse({ version: 1 })).toEqual({ version: 1 });
    expect(petrosPreparationCommandSchema.safeParse({ version: 0 }).success).toBe(false);
    expect(
      petrosPreparationCommandSchema.safeParse({ version: 1, institutionId: 'forged' }).success,
    ).toBe(false);
    expect(petrosPreparationStatusSchema.safeParse({ state: 'ready' }).success).toBe(false);
  });
});
