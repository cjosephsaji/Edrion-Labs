import { describe, expect, it } from 'vitest';
import { applyDocumentConcepts, buildDocumentLessonOutline, isDocumentLessonOutline } from './petros-document-outline';

describe('Petros document lesson outline', () => {
  const base = { documentId: 'doc', documentVersion: 1, sourceFingerprint: 'a'.repeat(64), title: 'Economics' };
  const page = (pageIndex: number, text: string) => ({ id: `p${pageIndex}`, pageIndex, text, updatedAt: new Date() });

  it('keeps more than twelve substantive headings in the persistent learning path', () => {
    const pages = Array.from({ length: 14 }, (_, index) =>
      page(index, `${index + 1}. Concept ${index + 1}\nA distinct mechanism and application for concept ${index + 1}.`),
    );
    const outline = buildDocumentLessonOutline({ ...base, title: 'Long guide', pages });
    expect(outline.topics).toHaveLength(14);
  });

  it('keeps a concept together across page breaks and splits concepts within one page', () => {
    const outline = buildDocumentLessonOutline({ ...base, pages: [
      page(0, 'Demand-Pull Inflation\nDemand exceeds the available supply.'),
      page(1, 'The relationship continues with household spending.'),
      page(2, 'The same mechanism has limits.\nCost-Push Inflation\nInput costs increase.'),
    ] });
    expect(outline.topics.map(({ title, pageStart, pageEnd }) => ({ title, pageStart, pageEnd }))).toEqual([
      { title: 'Demand-Pull Inflation', pageStart: 1, pageEnd: 3 },
      { title: 'Cost-Push Inflation', pageStart: 3, pageEnd: 3 },
    ]);
  });

  it('never invents page topics when source headings are absent', () => {
    const outline = buildDocumentLessonOutline({ ...base, pages: [page(0, 'Demand rises.'), page(1, 'Supply is limited.')] });
    expect(outline.topics).toHaveLength(1);
    expect(outline.topics[0]).toMatchObject({ title: 'Economics', pageStart: 1, pageEnd: 2 });
  });

  it('uses server text for model concepts and rejects missing or invented source pages', () => {
    const pages = [page(0, 'First source sentence.'), page(1, 'Continuation sentence.')];
    const outline = buildDocumentLessonOutline({ ...base, pages });
    const concept = { title: 'Demand and supply', summary: 'Explain why an increase in demand affects prices.', pageStart: 1, pageEnd: 2, keyTerms: ['demand'], likelyDoubts: [], prerequisites: [], difficulty: 'foundation' };
    const result = applyDocumentConcepts(outline, pages, { topics: [concept] });
    expect(result.organization).toBe('concepts');
    expect(result.topics[0]?.excerpt).toContain('Continuation sentence.');
    expect(() => applyDocumentConcepts(outline, pages, { topics: [{ ...concept, pageEnd: 20 }] })).toThrow();
    expect(() => applyDocumentConcepts(outline, pages, { topics: [{ ...concept, pageEnd: 1 }] })).toThrow();
    expect(() => applyDocumentConcepts(outline, pages, { topics: [{ ...concept, title: 'Pages 1–2' }] })).toThrow();
    expect(() => applyDocumentConcepts(outline, pages, { topics: [{ ...concept, prerequisites: [concept.title] }] })).toThrow();
  });
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

  it('preserves a long document path instead of folding later concepts into topic twelve', () => {
    const outline = buildDocumentLessonOutline({
      documentId: 'doc-2', documentVersion: 1, sourceFingerprint: 'b'.repeat(64), title: 'Large notes',
      pages: Array.from({ length: 40 }, (_, pageIndex) => ({
        id: `p${pageIndex}`, pageIndex, updatedAt: new Date(),
        text: `SECTION ${pageIndex + 1}\nThis section explains a bounded concept with enough source detail for a lesson summary.`,
      })),
    });
    expect(outline.topics).toHaveLength(40);
    expect(outline.topics.at(-1)?.pageEnd).toBe(40);
  });

  it('recovers bounded concept headings from legacy flattened PDF pages', () => {
    const outline = buildDocumentLessonOutline({ ...base, title: 'Integrals guide', pages: [
      page(0, 'Class 12 CBSE - Integrals Learning Guide 1. What is integration? Differentiation asks what rate of change means.'),
      page(1, 'Class 12 CBSE - Integrals Learning Guide 2. Core formulas you must know These are the building blocks for later methods.'),
      page(2, 'Class 12 CBSE - Integrals Learning Guide 3. The method picker Most questions become easier after identifying structure.'),
      page(3, 'Class 12 CBSE - Integrals Learning Guide 4. Substitution Substitution is the integration version of the chain rule.'),
    ] });
    expect(outline.topics.map((topic) => topic.title)).toEqual([
      '1. What is integration?',
      '2. Core formulas you must know',
      '3. The method picker',
      '4. Substitution',
    ]);
    expect(outline.topics.map((topic) => [topic.pageStart, topic.pageEnd])).toEqual([[1, 1], [2, 2], [3, 3], [4, 4]]);
  });
});
