import { z } from 'zod';

export const v2Uuid = z.string().uuid();
export const v2Hash = z.string().regex(/^[a-f0-9]{64}$/);
export const v2Version = z.number().int().positive().max(1_000_000);
export const v2Key = z.string().regex(/^[a-zA-Z][a-zA-Z0-9._:@-]{0,119}$/);
const text = z.string().min(1).max(16_000);
const originalShapeId = z.string().regex(/^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,119}$/);
export const conceptPinSchema = z.object({ id: v2Uuid, version: v2Version }).strict();
export const reviewPinSchema = z.object({ reviewId: v2Uuid, payloadHash: v2Hash }).strict();

/** Binding is identity data. Current entitlement is always resolved separately. */
export const sourceBindingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('material'), materialId: v2Uuid, materialVersion: v2Version,
    objectId: v2Uuid, contextKind: z.enum(['class', 'course']), contextId: v2Uuid, subjectId: v2Uuid }).strict(),
  z.object({ kind: z.literal('guidance_attachment'), objectId: v2Uuid, assignmentId: v2Uuid,
    publicationVersion: z.number().int().nonnegative(), classId: v2Uuid, subjectId: v2Uuid }).strict(),
]);
export type SourceBinding = z.infer<typeof sourceBindingSchema>;
export function sourceBindingKey(b: SourceBinding): string {
  return b.kind === 'material' ? `material:${b.materialId}` : `guidance_attachment:${b.objectId}:${b.publicationVersion}`;
}
export function sourcePublicationVersion(b: SourceBinding): number {
  return b.kind === 'material' ? b.materialVersion : b.publicationVersion;
}
export const sourceIdentitySchema = z.object({ schemaVersion: z.literal('petros.v2.source.v1'),
  id: v2Uuid, institutionId: v2Uuid, binding: sourceBindingSchema,
  kind: z.enum(['pdf', 'pptx', 'legacy_ppt', 'synthetic', 'docx', 'txt', 'markdown']), title: z.string().min(1).max(500),
  owner: z.object({ kind: z.literal('institution_staff'), userId: v2Uuid }).strict(), originalHash: v2Hash,
}).strict();
export const extractionIdentitySchema = z.object({ extractor: v2Key, interpretationVersion: v2Key,
  schemaVersion: z.literal('petros.v2.content.v1'), model: v2Key.nullable(), promptHash: v2Hash.nullable(),
  correctionOf: v2Uuid.nullable(), createdBy: v2Uuid,
}).strict();
export const interpretationReceiptSchema = z.object({verification:z.enum(['controlled_provider_response','authorized_live_response']),
  providerRequestId:z.string().min(1).max(500).optional(),inputHash:v2Hash.optional(),
  costSource:z.enum(['provider_reported','model_price_estimate']).optional(),
  requestId:v2Uuid,routeId:v2Uuid,provider:v2Key,model:z.string().min(1).max(240),promptVersion:v2Key,promptHash:v2Hash,
  schemaVersion:v2Key,inputTokens:z.number().int().nonnegative(),outputTokens:z.number().int().nonnegative(),
  costMicros:z.number().finite().nonnegative(),durationMs:z.number().finite().nonnegative()}).strict();
export const sourceRevisionSchema = z.object({ schemaVersion: z.literal('petros.v2.source-revision.v1'),
  nativeLocators: z.array(z.lazy(() => sourceLocatorSchema)).max(512).optional(),
  interpretationReceipt: interpretationReceiptSchema.optional(),
  visualReceipts: z.array(z.object({key:v2Key,sourceHash:v2Hash,locator:z.lazy(()=>sourceLocatorSchema),
    region:z.lazy(()=>regionSchema),cropHash:v2Hash,width:z.number().int().min(1).max(1280),height:z.number().int().min(1).max(1280),
    pixels:z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative(),width:z.number().int().positive(),height:z.number().int().positive()}).strict(),
    method:z.literal('local_tesseract'),version:v2Key,text:z.string().max(8000),
    labels:z.array(z.object({text:z.string().max(120),region:z.lazy(()=>regionSchema),
      pixels:z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative(),width:z.number().int().positive(),height:z.number().int().positive()}).strict().optional()}).strict()).max(100),
    runtime:z.object({executableSha256:v2Hash,modelDataSha256:v2Hash,packageVersion:z.string().min(1).max(100),
      modelData:z.literal('eng.traineddata'),segmentationMode:z.literal(11)}).strict().optional(),
    confidence:z.null(),reviewRequired:z.literal(true)}).strict()).max(6).optional(),
  id: v2Uuid, source: sourceIdentitySchema, processing: extractionIdentitySchema,
  representationHash: v2Hash, pageCount: z.number().int().min(0).max(10_000),
  slideCount: z.number().int().min(0).max(10_000),
  shapeRegistry: z.array(z.object({ slide: v2Version, shapeId: originalShapeId }).strict()).max(10000).default([]),
  coverage: z.object({ status: z.enum(['not_extracted', 'partial', 'complete']), totalUnits: z.number().int().min(0).max(10000).nullable(),
    processedUnits: z.number().int().min(0).max(10000), unresolvedUnits: z.number().int().min(0).max(10000),
    omittedUnits: z.number().int().min(0).max(10000).nullable(), reasons: z.array(z.string().min(1).max(500)).max(32),
  }).strict().default({ status: 'not_extracted', totalUnits: null, processedUnits: 0, unresolvedUnits: 0, omittedUnits: null, reasons: ['Representation foundation; source extraction has not been performed.'] }),
  conversion: z.object({ originalHash: v2Hash, convertedHash: v2Hash, converterVersion: v2Key,
    slideMap: z.array(z.object({ originalSlide: v2Version, convertedPage: v2Version }).strict()).min(1).max(10_000),
  }).strict().nullable(),
}).strict().superRefine((v, ctx) => {
  if (v.nativeLocators && (v.nativeLocators.some(l => !('sourceHash' in l) || l.sourceHash !== v.source.originalHash || l.kind !== v.source.kind) ||
    new Set(v.nativeLocators.map(canonicalContent)).size !== v.nativeLocators.length))
    ctx.addIssue({code:'custom',message:'Invalid native inventory'});
  if (['docx','txt','markdown'].includes(v.source.kind) && (!v.nativeLocators || v.pageCount !== 0 || v.slideCount !== 0 || v.conversion))
    ctx.addIssue({code:'custom',message:'Native sources require original locator inventory without guessed pagination'});
  if (v.source.kind === 'legacy_ppt' && (!v.conversion || v.conversion.originalHash !== v.source.originalHash))
    ctx.addIssue({ code: 'custom', message: 'Legacy PPT requires exact conversion lineage' });
  if (v.processing.model && !v.processing.promptHash)
    ctx.addIssue({ code: 'custom', message: 'Model interpretation requires a prompt pin' });
  if(v.visualReceipts?.some(r=>{const l=r.locator;return r.sourceHash!==v.source.originalHash ||
    (l.kind==='pdf' ? v.source.kind!=='pdf'||l.page>v.pageCount :
      l.kind==='slide' ? v.source.kind!=='pptx'||!v.shapeRegistry.some(s=>s.slide===l.slide&&s.shapeId===l.shapeId) : true);}))
    ctx.addIssue({code:'custom',message:'OCR receipt must reference this exact original source'});
  if (new Set(v.shapeRegistry.map(s => `${s.slide}:${s.shapeId}`)).size !== v.shapeRegistry.length ||
    v.shapeRegistry.some(s => s.slide > v.slideCount) || v.conversion?.slideMap.some(s => s.originalSlide > v.slideCount || s.convertedPage > v.pageCount))
    ctx.addIssue({ code: 'custom', message: 'Invalid shape or conversion inventory' });
  if (v.coverage.status === 'complete' && (v.coverage.totalUnits === null || v.coverage.omittedUnits !== 0 ||
    v.coverage.unresolvedUnits > 0 || v.coverage.processedUnits !== v.coverage.totalUnits))
    ctx.addIssue({ code: 'custom', message: 'Partial or unresolved coverage cannot claim completion' });
});
export type SourceRevision = z.infer<typeof sourceRevisionSchema>;
export const regionSchema = z.object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1),
  width: z.number().finite().positive().max(1), height: z.number().finite().positive().max(1),
}).strict().refine(v => v.x + v.width <= 1 && v.y + v.height <= 1, 'Region exceeds source bounds');
const span = z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive().max(1_000_000) })
  .strict().refine(v => v.end > v.start, 'Invalid source span');
const nativeSpan = z.object({ start: z.number().int().nonnegative().max(20 * 1024 * 1024),
  end: z.number().int().nonnegative().max(20 * 1024 * 1024) }).strict().refine(v => v.end >= v.start, 'Invalid native span');
const position = z.object({ line: z.number().int().min(1).max(100000), column: z.number().int().min(1).max(16001) }).strict();
const textLocation = { version: z.literal('petros.native-locator.v1'), sourceHash: v2Hash,
  encoding: z.enum(['UTF-8', 'UTF-16LE', 'UTF-16BE']), offsetEncoding: z.literal('UTF-16'),
  byteSpan: nativeSpan, textSpan: nativeSpan, start: position, end: position,
  newline: z.enum(['LF', 'CRLF', 'CR', 'mixed', 'none']) };
export const sourceLocatorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('txt'), ...textLocation, nodeId: v2Key }).strict(),
  z.object({ kind: z.literal('markdown'), ...textLocation, nodeId: v2Key, nodeType: v2Key,
    blockOrdinal: z.number().int().nonnegative().max(9999), parentNodeId: v2Key.nullable(), parserVersion: v2Key }).strict(),
  z.object({ kind: z.literal('docx'), version: z.literal('petros.native-locator.v1'), sourceHash: v2Hash,
    part: z.string().regex(/^word\/[A-Za-z0-9_./-]+\.xml$/).max(240), partHash: v2Hash,
    elementId: v2Key, xmlSpan: nativeSpan, path: z.string().regex(/^\/(?:[A-Za-z0-9]+\[\d+\]\/)*[A-Za-z0-9]+\[\d+\]$/).max(1000),
    section: z.number().int().nonnegative().max(128), paragraphOrdinal: z.number().int().nonnegative().max(10000).optional(),
    paragraphId: z.string().max(120).optional(), runIds: z.array(v2Key).max(1000).optional(),
    textSpan: nativeSpan.optional(), offsetEncoding: z.literal('UTF-16'),
    tableId: v2Key.optional(), row: z.number().int().nonnegative().max(99).optional(),
    column: z.number().int().nonnegative().max(31).optional(), cellId: v2Key.optional(),
    tableAncestry: z.array(v2Key).max(4).optional(), relationshipId: z.string().max(120).optional(),
    objectId: z.string().max(120).optional() }).strict(),
  z.object({ kind: z.literal('pdf'), page: v2Version, region: regionSchema.nullable(), span: span.nullable() }).strict(),
  z.object({ kind: z.literal('slide'), slide: v2Version, shapeId: originalShapeId, region: regionSchema.nullable() }).strict(),
  z.object({ kind: z.literal('converted_slide'), originalSlide: v2Version, convertedPage: v2Version,
    shapeId: originalShapeId, region: regionSchema.nullable(), convertedHash: v2Hash }).strict(),
  z.object({ kind: z.literal('synthetic'), section: v2Key, span }).strict(),
]);
export const teachingReferenceSchema = z.object({ sourceId: v2Uuid, sourceRevisionId: v2Uuid,
  sourceHash: v2Hash, representationHash: v2Hash, unitId: v2Uuid, unitHash: v2Hash,
  locator: sourceLocatorSchema, semanticId: v2Key.nullable(),
}).strict();
export const capabilityStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('supported'), authority: z.enum(['source', 'qualified_review']),
    review: reviewPinSchema.nullable(), kernel: v2Key.nullable() }).strict(),
  z.object({ status: z.literal('unsupported'), reason: z.string().min(1).max(500) }).strict(),
]);
export const contentCapabilitiesSchema = z.object({ display: capabilityStateSchema, cite: capabilityStateSchema,
  highlight: capabilityStateSchema, edit: capabilityStateSchema, explain: capabilityStateSchema,
  compute: capabilityStateSchema, assess: capabilityStateSchema,
}).strict().superRefine((v, ctx) => {
  for (const key of ['explain', 'compute', 'assess'] as const) {
    const c = v[key];
    if (c.status === 'supported' && (c.authority !== 'qualified_review' || !c.review || (key === 'compute' && !c.kernel)))
      ctx.addIssue({ code: 'custom', path: [key], message: 'Capability requires qualified review and trusted computation kernel' });
  }
});
export const contentQualitySchema = z.object({ state: z.enum(['synthetic', 'extracted', 'ambiguous', 'unsupported', 'reviewed']),
  confidence: z.number().finite().min(0).max(1).nullable(), uncertainties: z.array(z.string().min(1).max(500)).max(32),
  review: reviewPinSchema.nullable(),
}).strict().refine(v => v.state !== 'reviewed' || v.review !== null, 'Reviewed state requires review pin');
export const nativeMetadataSchema = z.object({ version: z.literal('petros.native-metadata.v1'),
  nodeType: z.string().max(120), original: z.string().max(16000).optional(),
  style: z.string().max(120).optional(), headingLevel: z.number().int().min(1).max(6).optional(),
  quote: z.boolean().optional(), section: z.number().int().nonnegative().optional(),
  numbering: z.object({ id: z.string().max(120), level: z.number().int().min(0).max(8),
    format: z.string().max(120), template: z.string().max(120), value: z.number().int().nonnegative(), restart: z.boolean() }).strict().optional(),
  links: z.array(z.object({ target: z.string().max(2048), title: z.string().max(500).nullable(),
    alt: z.string().max(500).nullable(), kind: z.enum(['link','image','bookmark','reference']),
    status: z.enum(['inert','unsafe','unavailable']), locator: sourceLocatorSchema }).strict()).max(100).optional(),
  inline: z.array(z.object({ type: z.string().max(120), original: z.string().max(16000),
    locator: sourceLocatorSchema }).strict()).max(200).optional(),
  runs: z.array(z.object({ id: v2Key, text: z.string().max(16000), start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(), bold: z.boolean(), italic: z.boolean(),
    script: z.enum(['baseline','superscript','subscript']), language: z.string().max(120).nullable(), locator: sourceLocatorSchema.optional() }).strict()).max(1000).optional(),
  tableAlignment: z.array(z.enum(['left','right','center']).nullable()).max(32).optional(),
  cells: z.array(z.object({ id: v2Key, locator: sourceLocatorSchema }).strict()).max(1000).optional(),
  media: z.object({ part: z.string().max(240), hash: v2Hash, mime: z.enum(['image/png','image/jpeg']),
    width: z.number().int().positive().max(4096), height: z.number().int().positive().max(4096),
    alt: z.string().max(500), placement: z.enum(['inline','floating']), widthEmu: z.number().nonnegative().nullable(),
    heightEmu: z.number().nonnegative().nullable(), regeneration: z.literal('authorized_original_part') }).strict().optional(),
  fence: z.object({ language: z.string().max(500).nullable(), meta: z.string().max(500).nullable(),
    source: z.string().max(16000), lines: z.array(sourceLocatorSchema).max(500) }).strict().optional(),
}).strict();
const caption = z.string().max(2000).nullable();
const node = z.object({ id: v2Key, label: z.string().max(500), shape: z.enum(['box', 'ellipse', 'unknown']), region: regionSchema }).strict();
const relation = z.object({ id: v2Key, from: v2Key, to: v2Key,
  kind: z.enum(['arrow', 'connects', 'contains', 'supports', 'causes', 'unknown']),
  assertion: z.enum(['visual_only', 'source_explicit', 'proposed_interpretation']), locator: sourceLocatorSchema,
}).strict();
const visual = { caption, nodes: z.array(node).max(100), relationships: z.array(relation).max(100),
  transform: z.object({ scaleX: z.number().finite().positive().max(1000), scaleY: z.number().finite().positive().max(1000),
    offsetX: z.number().finite().min(-10000).max(10000), offsetY: z.number().finite().min(-10000).max(10000) }).strict(),
  unsupportedRegions: z.array(regionSchema).max(32) };
export const contentPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('heading'), text, level: z.number().int().min(1).max(6) }).strict(),
  z.object({ kind: z.literal('paragraph'), text }).strict(),
  z.object({ kind: z.literal('list'), ordered: z.boolean(), items: z.array(z.object({ id: v2Key, text, level: z.number().int().min(0).max(8).optional() }).strict()).min(1).max(100) }).strict(),
  z.object({ kind: z.literal('caption'), text, describes: v2Uuid }).strict(),
  z.object({ kind: z.literal('table'), caption, rows: z.array(v2Key).min(1).max(100), columns: z.array(v2Key).min(1).max(32),
    cells: z.array(z.object({ id: v2Key, row: v2Key, column: v2Key, rowSpan: z.number().int().min(1).max(100),
      columnSpan: z.number().int().min(1).max(32), header: z.boolean(), value: z.string().max(2000),
      unit: z.string().max(80).nullable(), unresolved: z.boolean(), region: regionSchema.nullable(),
    }).strict()).min(1).max(1000) }).strict(),
  z.object({ kind: z.literal('equation'), original: z.string().min(1).max(2000), tex: z.string().max(2000).nullable(),
    symbols: z.array(z.object({ id: v2Key, original: z.string().min(1).max(80), meaning: z.string().max(500).nullable() }).strict()).max(32),
    assumptions: z.array(z.string().max(500)).max(32), steps: z.array(z.object({ id: v2Key, original: z.string().min(1).max(2000), locator: sourceLocatorSchema }).strict()).max(64),
    interpretation: z.object({ text, review: reviewPinSchema }).strict().nullable(), notation: z.enum(['display_only', 'ambiguous', 'validated']) }).strict(),
  z.object({ kind: z.literal('figure'), ...visual }).strict(),
  z.object({ kind: z.literal('diagram'), ...visual }).strict(),
  z.object({ kind: z.literal('chart'), ...visual, axes: z.array(z.object({ id: v2Key, label: z.string().max(500),
    unit: z.string().max(80).nullable(), region: regionSchema.nullable() }).strict()).min(1).max(4),
    series:z.array(z.object({id:v2Key,name:z.string().max(500),points:z.array(z.object({id:v2Key,category:z.string().max(500),
      value:z.string().max(100)}).strict()).max(200)}).strict()).max(8).optional() }).strict(),
  z.object({ kind: z.literal('code'), language: z.string().regex(/^[A-Za-z][A-Za-z0-9+#._-]{0,39}$/).nullable(), original: text,
    lines: z.array(z.object({ id: v2Key, number: v2Version, text: z.string().max(2000),
      syntax: z.array(z.object({ start: z.number().int().nonnegative(), end: v2Version, token: v2Key }).strict()).max(100),
    }).strict()).min(1).max(500), validity: z.enum(['unvalidated', 'ambiguous', 'reviewed']) }).strict(),
  z.object({ kind: z.literal('unresolved'), reason: z.string().min(1).max(500), original: z.string().max(16000).nullable() }).strict(),
]).superRefine((p, ctx) => {
  const error = (message: string) => ctx.addIssue({ code: 'custom', message });
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  if (p.kind === 'table') {
    if (!unique(p.rows) || !unique(p.columns) || !unique(p.cells.map(c => c.id))) error('Duplicate table identity');
    const occupied = new Set<string>();
    for (const c of p.cells) {
      const r = p.rows.indexOf(c.row), col = p.columns.indexOf(c.column);
      if (r < 0 || col < 0 || r + c.rowSpan > p.rows.length || col + c.columnSpan > p.columns.length) error('Invalid table cell/span');
      for (let i = r; i < r + c.rowSpan; i++) for (let j = col; j < col + c.columnSpan; j++) {
        const k = `${i}:${j}`; if (occupied.has(k)) error('Overlapping table cells'); occupied.add(k);
      }
    }
  }
  if (p.kind === 'code') {
    if (!unique(p.lines.map(l => l.id)) || !unique(p.lines.map(l => String(l.number)))) error('Duplicate code line');
    if (p.lines.map(l => l.text).join('\n') !== p.original) error('Code lines must preserve original');
    p.lines.forEach((l, i) => {
      if (i && l.number !== p.lines[i - 1]!.number + 1) error('Non-contiguous code line numbers');
      if (l.syntax.some(s => s.end <= s.start || s.end > l.text.length)) error('Invalid syntax span');
    });
  }
  if (p.kind === 'equation' && (!unique(p.steps.map(s => s.id)) || !unique(p.symbols.map(s => s.id)))) error('Duplicate equation anchor');
  if (p.kind === 'diagram' || p.kind === 'figure' || p.kind === 'chart') {
    if (!unique(p.nodes.map(n => n.id)) || !unique(p.relationships.map(r => r.id))) error('Duplicate visual identity');
    for (const r of p.relationships) {
      if (!p.nodes.some(n => n.id === r.from) || !p.nodes.some(n => n.id === r.to)) error('Unknown figure node');
      if (r.kind === 'causes' && r.assertion === 'visual_only') error('An arrow is not evidence of causation');
    }
  }
});
export const contentRelationshipSchema = z.object({ id: v2Uuid, fromUnitId: v2Uuid, toUnitId: v2Uuid,
  kind: z.enum(['caption_of', 'contains', 'claim', 'evidence', 'reasoning', 'warrant', 'counterargument', 'supports']),
  origin: z.enum(['source_explicit', 'proposed_interpretation', 'reviewed']), support: z.array(teachingReferenceSchema).min(1).max(16),
  review: reviewPinSchema.nullable(),
}).strict().refine(v => v.origin !== 'reviewed' || !!v.review, 'Reviewed relationship requires receipt');
export const sourceClaimSchema = z.object({ id: v2Uuid, statement: text, origin: z.enum(['source', 'model', 'teacher']),
  status: z.enum(['proposed', 'source_supported', 'reviewed']), support: z.array(teachingReferenceSchema).min(1).max(16),
  review: reviewPinSchema.nullable(),
}).strict().refine(v => (v.status !== 'reviewed' || !!v.review) && (v.origin !== 'model' || v.status === 'proposed'), 'Model claims cannot self-verify');
export const safeAssetReferenceSchema = z.object({ objectId: v2Uuid, sourceRevisionId: v2Uuid,
  contentHash: v2Hash, purpose: z.literal('public_teaching'),
}).strict(); // Opaque IDs, never paths, URLs, private keys or arbitrary fetch instructions.
export const contentUnitSchema = z.object({ schemaVersion: z.literal('petros.v2.content-unit.v1'),
  // Optional to preserve pre-M2 canonical hashes; producers explicitly pin the source channel.
  sourceChannel: z.enum(['visible', 'notes', 'hidden', 'headers', 'footers', 'footnotes', 'endnotes', 'comments', 'insertions', 'deletions']).optional(),
  native: nativeMetadataSchema.optional(),
  id: v2Uuid, institutionId: v2Uuid, sourceId: v2Uuid, sourceRevisionId: v2Uuid,
  sourceHash: v2Hash, representationHash: v2Hash, parentId: v2Uuid.nullable(), ordinal: z.number().int().min(0).max(9999),
  locator: sourceLocatorSchema, payload: contentPayloadSchema, contentHash: v2Hash,
  quality: contentQualitySchema, capabilities: contentCapabilitiesSchema, processing: extractionIdentitySchema,
  searchableText: z.string().max(16000), assets: z.array(safeAssetReferenceSchema).max(16),
  concepts: z.array(conceptPinSchema).max(24), relationships: z.array(contentRelationshipSchema).max(48),
  claims: z.array(sourceClaimSchema).max(24),
}).strict().superRefine((u, ctx) => {
  if (u.parentId === u.id) ctx.addIssue({ code: 'custom', message: 'Unit cannot parent itself' });
  if (u.payload.kind === 'unresolved' && (u.capabilities.compute.status === 'supported' || u.capabilities.assess.status === 'supported'))
    ctx.addIssue({ code: 'custom', message: 'Unresolved content cannot compute or assess' });
});
export type ContentUnit = z.infer<typeof contentUnitSchema>;
/** Canonical JSON is cross-runtime and includes every provenance/authority-bearing field. */
export function canonicalContent(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalContent).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${canonicalContent(obj[k])}`).join(',')}}`;
}
export function contentUnitHashInput(u: ContentUnit): string {
  const { id: _id, contentHash: _hash, ...value } = u;
  return canonicalContent(value);
}
export function parseBoundedContentUnit(input: unknown): ContentUnit {
  if (new TextEncoder().encode(JSON.stringify(input)).length > 96 * 1024) throw new Error('CONTENT_UNIT_BUDGET_EXCEEDED');
  return contentUnitSchema.parse(input);
}
export function validateUnitProvenance(u: ContentUnit, revision: SourceRevision): void {
  if (u.institutionId !== revision.source.institutionId || u.sourceId !== revision.source.id || u.sourceRevisionId !== revision.id ||
    u.sourceHash !== revision.source.originalHash || u.representationHash !== revision.representationHash ||
    canonicalContent(u.processing) !== canonicalContent(revision.processing)) throw new Error('CONTENT_SOURCE_PIN_MISMATCH');
  const validateLocator = (l: z.infer<typeof sourceLocatorSchema>) => {
    const kind = revision.source.kind;
    if (['docx','txt','markdown'].includes(l.kind)) {
      if (kind !== l.kind || !('sourceHash' in l) || l.sourceHash !== revision.source.originalHash ||
        !revision.nativeLocators?.some(n => canonicalContent(n) === canonicalContent(l)))
        throw new Error('INVALID_NATIVE_SOURCE_REFERENCE');
    }
    if (l.kind === 'pdf' && (kind !== 'pdf' || l.page > revision.pageCount)) throw new Error('INVALID_PAGE_REFERENCE');
    if (l.kind === 'slide' && (kind !== 'pptx' || l.slide > revision.slideCount || !revision.shapeRegistry.some(s => s.slide === l.slide && s.shapeId === l.shapeId))) throw new Error('INVALID_SLIDE_REFERENCE');
    if (l.kind === 'synthetic' && kind !== 'synthetic') throw new Error('INVALID_SOURCE_REPRESENTATION');
    if (l.kind === 'converted_slide' && (kind !== 'legacy_ppt' || l.convertedHash !== revision.conversion?.convertedHash ||
      !revision.shapeRegistry.some(s => s.slide === l.originalSlide && s.shapeId === l.shapeId) ||
      !revision.conversion?.slideMap.some(m => m.originalSlide === l.originalSlide && m.convertedPage === l.convertedPage)))
      throw new Error('INVALID_CONVERSION_LINEAGE');
  };
  validateLocator(u.locator);
  u.native?.runs?.forEach(r => {if(r.locator) validateLocator(r.locator);});
  u.native?.cells?.forEach(c => validateLocator(c.locator));
  u.native?.inline?.forEach(c => validateLocator(c.locator));
  u.native?.links?.forEach(c => validateLocator(c.locator));
  u.native?.fence?.lines.forEach(validateLocator);
  if (u.payload.kind === 'equation') u.payload.steps.forEach(s => validateLocator(s.locator));
  if (u.payload.kind === 'diagram' || u.payload.kind === 'chart' || u.payload.kind === 'figure')
    u.payload.relationships.forEach(r => validateLocator(r.locator));
  if (u.assets.some(a => a.sourceRevisionId !== revision.id)) throw new Error('ASSET_REVISION_MISMATCH');
}
export function unitSemanticIds(u: ContentUnit): ReadonlySet<string> {
  const p = u.payload;
  if (p.kind === 'equation') return new Set([...p.steps.map(s => s.id), ...p.symbols.map(s => s.id)]);
  if (p.kind === 'code') return new Set(p.lines.map(l => l.id));
  if (p.kind === 'table') return new Set(p.cells.map(c => c.id));
  if (p.kind === 'list') return new Set([...p.items.map(i => i.id),...(u.native?.runs ?? []).map(r=>r.id)]);
  if (p.kind === 'figure' || p.kind === 'diagram' || p.kind === 'chart') return new Set([...p.nodes.map(n => n.id),
    ...p.relationships.map(r => r.id), ...(p.kind === 'chart' ? [...p.axes.map(a => a.id),...(p.series??[]).flatMap(s=>[s.id,...s.points.map(p=>p.id)])] : [])]);
  return new Set((u.native?.runs ?? []).map(r=>r.id));
}
/** Native semantic anchors keep their exact original locations; legacy references retain their existing locator. */
export function referenceLocatorFor(u: ContentUnit, semanticId: string | null) {
  if(semanticId) {
    const run=u.native?.runs?.find(r=>r.id===semanticId);
    if(run?.locator)return run.locator;
    const cell=u.native?.cells?.find(c=>c.id===semanticId);
    if(cell)return cell.locator;
    if(u.payload.kind==='code') {
      const index=u.payload.lines.findIndex(l=>l.id===semanticId);
      if(index>=0&&u.native?.fence?.lines[index])return u.native.fence.lines[index]!;
    }
  }
  return u.locator;
}

