import { describe, expect, it } from 'vitest';
import { buildDocumentLessonOutline, isDocumentLessonOutline } from './petros-document-outline';

describe('Petros document lesson outline', () => {
  it('structures pages once into bounded teaching topics with source ranges', () => {
    const outline = buildDocumentLessonOutline({
      documentId: 'doc-1',
      documentVersion: 3,
      sourceFingerprint: 'a'.repeat(64),
      title: 'Cloud systems',
      generatedAt: new Date('2026-09-01T00:00:00.000Z'),
      pages: [
        { id: 'p1', pageIndex: 0, updatedAt: new Date(), text: 'MODULE I CLOUD BASICS\nCloud computing pools shared compute resources. Why is elasticity useful?' },
        { id: 'p2', pageIndex: 1, updatedAt: new Date(), text: 'MODULE II SERVICE MODELS\nInfrastructure as a Service separates provider and customer responsibilities.' },
      ],
    });

    expect(outline.topics).toHaveLength(2);
    expect(outline.topics[0]).toMatchObject({ pageStart: 1, pageEnd: 1, title: 'MODULE I CLOUD BASICS' });
    expect(outline.topics[0]?.likelyDoubts[0]).toContain('Why is elasticity useful?');
    expect(outline.totalEstimatedMinutes).toBeGreaterThanOrEqual(10);
    expect(isDocumentLessonOutline(outline)).toBe(true);
  });

  it('caps large documents at twelve outline topics', () => {
    const outline = buildDocumentLessonOutline({
      documentId: 'doc-2', documentVersion: 1, sourceFingerprint: 'b'.repeat(64), title: 'Large notes',
      pages: Array.from({ length: 40 }, (_, pageIndex) => ({
        id: `p${pageIndex}`, pageIndex, updatedAt: new Date(),
        text: `SECTION ${pageIndex + 1}\nThis section explains a bounded concept with enough source detail for a lesson summary.`,
      })),
    });
    expect(outline.topics.length).toBeLessThanOrEqual(12);
    expect(outline.topics.at(-1)?.pageEnd).toBe(40);
  });
});
