import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { representationFixtures, syntheticFixtureSourceDocument } from './m1-fixtures';
import { contentPayloadSchema, contentUnitHashInput, parseBoundedContentUnit, sourceClaimSchema, sourceRevisionSchema,
  validateUnitProvenance, contentCapabilitiesSchema } from './content';
import { conceptGraphSchema, learningProposalSchema, validateConceptGraph } from './proposal';
import { publicStudentTaskSchema, evidenceClassificationSchema } from './assessment';
import { educationalExperienceSchema } from './experience';
const uuid = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
export const contractRevision = sourceRevisionSchema.parse({ schemaVersion: 'petros.v2.source-revision.v1', id: uuid(1),
  source: { schemaVersion: 'petros.v2.source.v1', id: uuid(2), institutionId: uuid(3), binding: { kind: 'material', materialId: uuid(4),
    materialVersion: 1, objectId: uuid(5), contextKind: 'course', contextId: uuid(6), subjectId: uuid(7) }, kind: 'synthetic',
    title: 'Synthetic fixtures', owner: { kind: 'institution_staff', userId: uuid(8) }, originalHash: hash(syntheticFixtureSourceDocument()) },
  processing: { extractor: 'synthetic.v1', interpretationVersion: 'synthetic.v1', schemaVersion: 'petros.v2.content.v1', model: null,
    promptHash: null, correctionOf: null, createdBy: uuid(8) }, representationHash: hash('representation'), pageCount: 0, slideCount: 0, conversion: null });
const fixtures = representationFixtures(contractRevision, hash);
describe('M1 source/content contracts', () => {
  it.each(fixtures.map(u => [u.payload.kind, u] as const))('preserves %s with exact provenance', (_, u) => {
    const parsed = parseBoundedContentUnit(u); validateUnitProvenance(parsed, contractRevision);
    expect(hash(contentUnitHashInput(parsed))).toBe(u.contentHash); expect(parsed.payload).toEqual(u.payload);
    if (u.locator.kind === 'synthetic') {
      const source = JSON.parse(syntheticFixtureSourceDocument());
      const original = JSON.parse(source.sections[u.locator.section].slice(u.locator.span.start, u.locator.span.end));
      expect(original.kind).toBe(u.payload.kind);
      if ('text' in u.payload) expect(original.text).toBe(u.payload.text);
      if ('original' in u.payload) expect(original.original).toBe(u.payload.original);
    }
  });
  it.each(['id', 'institutionId', 'sourceId', 'sourceRevisionId', 'sourceHash', 'representationHash'] as const)('rejects malformed %s', key => {
    expect(() => parseBoundedContentUnit({ ...fixtures[0], [key]: 'invalid' })).toThrow();
  });
  it.each(['institutionId', 'sourceId', 'sourceRevisionId', 'sourceHash', 'representationHash'] as const)('rejects foreign %s provenance', key => {
    const u = { ...fixtures[0]!, [key]: key.endsWith('Hash') ? hash('foreign') : uuid(50) };
    expect(() => validateUnitProvenance(u, contractRevision)).toThrow('CONTENT_SOURCE_PIN_MISMATCH');
  });
  it('rejects wrong processing pin, unknown fields and oversized data', () => {
    expect(() => validateUnitProvenance({ ...fixtures[0]!, processing: { ...fixtures[0]!.processing, extractor: 'different.v1' } }, contractRevision)).toThrow();
    expect(() => parseBoundedContentUnit({ ...fixtures[0], owner: uuid(20) })).toThrow();
    expect(() => parseBoundedContentUnit({ ...fixtures[0], data: 'x'.repeat(100000) })).toThrow('BUDGET');
  });
  it.each(['pdf', 'pptx'] as const)('validates %s page/slide bounds', kind => {
    const revision = sourceRevisionSchema.parse({ ...contractRevision, source: { ...contractRevision.source, kind }, pageCount: 1, slideCount: 1, shapeRegistry: [{ slide: 1, shapeId: 'shape' }] });
    const valid = kind === 'pdf' ? { kind: 'pdf' as const, page: 1, region: null, span: null } : { kind: 'slide' as const, slide: 1, shapeId: 'shape', region: null };
    validateUnitProvenance({ ...fixtures[0]!, locator: valid }, revision);
    expect(() => validateUnitProvenance({ ...fixtures[0]!, locator: { ...valid, ...(kind === 'pdf' ? { page: 2 } : { slide: 2 }) } }, revision)).toThrow();
  });
  it('requires legacy PPT conversion lineage and exact slide mapping', () => {
    const source = { ...contractRevision.source, kind: 'legacy_ppt' };
    expect(() => sourceRevisionSchema.parse({ ...contractRevision, source })).toThrow();
    const revision = sourceRevisionSchema.parse({ ...contractRevision, source, pageCount: 2, slideCount: 1, shapeRegistry: [{ slide: 1, shapeId: 'shape' }], conversion: { originalHash: source.originalHash,
      convertedHash: hash('converted'), converterVersion: 'converter.v1', slideMap: [{ originalSlide: 1, convertedPage: 2 }] } });
    const locator = { kind: 'converted_slide' as const, originalSlide: 1, convertedPage: 2, shapeId: 'shape', region: null, convertedHash: hash('converted') };
    validateUnitProvenance({ ...fixtures[0]!, locator }, revision);
    expect(() => validateUnitProvenance({ ...fixtures[0]!, locator: { ...locator, convertedPage: 3 } }, revision)).toThrow();
  });
  it('rejects malformed regions, table/figure/code/equation anchors', () => {
    const table = fixtures.find(u => u.payload.kind === 'table')!.payload;
    if (table.kind === 'table') expect(() => contentPayloadSchema.parse({ ...table, cells: [{ ...table.cells[0], row: 'foreign' }] })).toThrow();
    const diagram = fixtures.find(u => u.payload.kind === 'diagram')!.payload;
    if (diagram.kind === 'diagram') {
      expect(() => contentPayloadSchema.parse({ ...diagram, relationships: [{ ...diagram.relationships[0], to: 'foreign' }] })).toThrow();
      expect(() => contentPayloadSchema.parse({ ...diagram, relationships: [{ ...diagram.relationships[0], kind: 'causes' }] })).toThrow();
      expect(() => contentPayloadSchema.parse({ ...diagram, nodes: [{ ...diagram.nodes[0], region: { x: 0.9, y: 0, width: 0.5, height: 0.5 } }] })).toThrow();
    }
    const code = fixtures.find(u => u.payload.kind === 'code')!.payload;
    expect(() => contentPayloadSchema.parse({ ...code, original: 'modified' })).toThrow();
    const equation = fixtures.find(u => u.payload.kind === 'equation')!.payload;
    if (equation.kind === 'equation') expect(() => contentPayloadSchema.parse({ ...equation, steps: [...equation.steps, ...equation.steps] })).toThrow();
  });
  it('blocks computational authority escalation and model self-verification', () => {
    expect(() => contentCapabilitiesSchema.parse({ ...fixtures[0]!.capabilities, compute: { status: 'supported', authority: 'source', review: null, kernel: 'javascript' } })).toThrow();
    expect(sourceClaimSchema.safeParse({ id: uuid(20), statement: 'Claim', origin: 'model', status: 'reviewed', support: [], review: null }).success).toBe(false);
    expect(publicStudentTaskSchema.safeParse({ answer: 'PRIVATE_SENTINEL' }).success).toBe(false);
    expect(educationalExperienceSchema.safeParse({ javascript: 'eval(input)' }).success).toBe(false);
    expect(evidenceClassificationSchema.safeParse({ exposure: 'assisted', eligibility: 'eligible', criteria: [], outsideHelp: 'unknown' }).success).toBe(false);
    expect(learningProposalSchema.safeParse({ status: 'approved', reviewerId: uuid(1) }).success).toBe(false);
  });
});
describe('M1 bounded concept graphs', () => {
  const a = { id: uuid(11), version: 1 }, b = { id: uuid(12), version: 1 };
  const review = { reviewId: uuid(13), payloadHash: hash('review') };
  const graph = { schemaVersion: 'petros.v2.concept-graph.v1', institutionId: uuid(3), courseId: uuid(6), concepts: [a, b],
    edges: [{ from: a, to: b, kind: 'hard_prerequisite', review }], traversalDepth: 2 };
  const registry = [a, b].map(p => ({ ...p, institutionId: uuid(3) })), reviews = new Set([`${review.reviewId}:${review.payloadHash}`]);
  it('accepts explicit reviewed graph and distinct same-label concept IDs', () => { expect(validateConceptGraph(graph, registry, reviews).concepts).toEqual([a, b]); });
  it('rejects cycles, oversized graphs and traversal depth', () => {
    expect(() => conceptGraphSchema.parse({ ...graph, edges: [...graph.edges, { ...graph.edges[0], from: b, to: a }] })).toThrow();
    expect(() => conceptGraphSchema.parse({ ...graph, concepts: Array(25).fill(a) })).toThrow();
    expect(() => conceptGraphSchema.parse({ ...graph, edges: Array(49).fill(graph.edges[0]) })).toThrow();
    expect(() => conceptGraphSchema.parse({ ...graph, traversalDepth: 3 })).toThrow();
  });
  it('rejects missing, cross-tenant and invalid version references and unauthorized mapping', () => {
    expect(() => validateConceptGraph(graph, [], reviews)).toThrow();
    expect(() => validateConceptGraph(graph, registry.map(r => ({ ...r, institutionId: uuid(90) })), reviews)).toThrow();
    expect(() => validateConceptGraph(graph, registry.map(r => ({ ...r, version: 2 })), reviews)).toThrow();
    expect(() => validateConceptGraph(graph, registry, new Set())).toThrow();
    expect(() => conceptGraphSchema.parse({ ...graph, edges: [{ ...graph.edges[0], kind: 'embedding_equivalent' }] })).toThrow();
  });
});
