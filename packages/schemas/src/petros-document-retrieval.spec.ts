import { describe, expect, it } from 'vitest';
import { petrosDocumentSearchSchema } from './petros-document-retrieval';
const request = {
  sourceVersion: 'a'.repeat(64),
  query: 'elasticity',
  purpose: 'source_lookup',
  pages: [1],
};
describe('document retrieval admission contract', () => {
  it('requires a pin, bounded explicit scope and query, and rejects caller-owned authority fields', () => {
    expect(petrosDocumentSearchSchema.parse(request).limit).toBe(3);
    for (const patch of [
      { sourceVersion: '' },
      { pages: [] },
      { pages: [1, 1] },
      { pages: [501] },
      { limit: 5 },
      { query: 'x'.repeat(2001) },
      { studentId: 'supplied-by-model' },
      { sourceVersion: undefined },
    ]) {
      expect(petrosDocumentSearchSchema.safeParse({ ...request, ...patch }).success).toBe(false);
    }
  });
});
