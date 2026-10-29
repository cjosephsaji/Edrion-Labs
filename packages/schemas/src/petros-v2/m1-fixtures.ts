import { canonicalContent, contentUnitHashInput, parseBoundedContentUnit, type ContentUnit, type SourceRevision } from './content';
import type { z } from 'zod';
import type { contentPayloadSchema } from './content';
export const syntheticFixtureLicence = 'Original synthetic contract data; CC0; no actual PDF/PPT extraction or academic review claimed.';
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const region = { x: 0.1, y: 0.1, width: 0.3, height: 0.2 };
const transform = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
function fixturePayloads(start = 0): z.infer<typeof contentPayloadSchema>[] {
  const locator = { kind: 'synthetic' as const, section: 'fixture', span: { start: 0, end: 120 } };
  const visuals = { caption: 'Synthetic cloud architecture', nodes: [
    { id: 'client', label: 'Client', shape: 'box' as const, region },
    { id: 'service', label: 'Service', shape: 'ellipse' as const, region: { ...region, x: 0.6 } },
  ], relationships: [{ id: 'request', from: 'client', to: 'service', kind: 'arrow' as const,
    assertion: 'visual_only' as const, locator }], transform, unsupportedRegions: [] };
  const payloads: z.infer<typeof contentPayloadSchema>[] = [
    { kind: 'heading', text: 'Cloud computing — synthetic representation', level: 1 },
    { kind: 'paragraph', text: 'Virtualization separates a logical computing environment from physical hardware.' },
    { kind: 'list', ordered: false, items: [{ id: 'iaas', text: 'Infrastructure as a service' }, { id: 'paas', text: 'Platform as a service' }] },
    { kind: 'table', caption: 'Synthetic service comparison', rows: ['head', 'data'], columns: ['model', 'control'], cells: [
      { id: 'head-model', row: 'head', column: 'model', rowSpan: 1, columnSpan: 1, header: true, value: 'Model', unit: null, unresolved: false, region },
      { id: 'head-control', row: 'head', column: 'control', rowSpan: 1, columnSpan: 1, header: true, value: 'Control', unit: null, unresolved: false, region },
      { id: 'data-model', row: 'data', column: 'model', rowSpan: 1, columnSpan: 1, header: false, value: 'IaaS', unit: null, unresolved: false, region },
      { id: 'data-control', row: 'data', column: 'control', rowSpan: 1, columnSpan: 1, header: false, value: 'Guest OS', unit: null, unresolved: false, region },
    ] },
    { kind: 'figure', ...visuals }, { kind: 'diagram', ...visuals },
    { kind: 'equation', original: 'u = d / c', tex: 'u=\\frac{d}{c}', symbols: [
      { id: 'u', original: 'u', meaning: 'Dimensionless utilization' }, { id: 'd', original: 'd', meaning: 'Demand' }, { id: 'c', original: 'c', meaning: 'Capacity' },
    ], assumptions: ['Positive capacity; same demand and capacity units; simplified synthetic model'],
    steps: [{ id: 'ratio', original: 'u = d / c', locator }], interpretation: null, notation: 'display_only' },
    { kind: 'code', language: 'python', original: 'capacity = 10\nprint(capacity)', lines: [
      { id: 'line-1', number: 1, text: 'capacity = 10', syntax: [] }, { id: 'line-2', number: 2, text: 'print(capacity)', syntax: [] },
    ], validity: 'unvalidated' },
    { kind: 'caption', text: 'The request arrow shows a visible relationship, not proven causality.', describes: id(start + 5) },
    { kind: 'chart', ...visuals, axes: [{ id: 'demand', label: 'Demand', unit: 'requests/s', region }] },
    { kind: 'unresolved', reason: 'Synthetic ambiguous visual region; no computational interpretation.', original: null },
    { kind: 'paragraph', text: 'English argument analysis: claim — libraries should extend evening opening hours.' },
    { kind: 'paragraph', text: 'Evidence — a synthetic survey reports students lack quiet evening study space.' },
    { kind: 'paragraph', text: 'Warrant — access to quiet study space supports the proposed opening-hour policy.' },
    { kind: 'paragraph', text: 'Counterargument — staffing costs may outweigh benefits; alternative readings remain possible.' },
  ];
  return payloads;
}
function originalPayload(payload: z.infer<typeof contentPayloadSchema>): unknown {
  const copy = JSON.parse(JSON.stringify(payload));
  if (copy.kind === 'caption') copy.describes = 'cloud.figure.4';
  if (copy.steps) for (const step of copy.steps) delete step.locator;
  if (copy.relationships) for (const relation of copy.relationships) delete relation.locator;
  return copy;
}
export function syntheticFixtureSourceDocument(): string {
  const p = fixturePayloads();
  return canonicalContent({ schemaVersion: 'petros.v2.synthetic-source.v1', licence: syntheticFixtureLicence,
    sections: { cloud_computing: p.slice(0, 11).map(v => canonicalContent(originalPayload(v))).join('\n'),
      english_argument: p.slice(11).map(v => canonicalContent(originalPayload(v))).join('\n') } });
}
export function representationFixtures(revision: SourceRevision, hash: (input: string) => string, start = 0): ContentUnit[] {
  const payloads = fixturePayloads(start);
  const offsets = { cloud_computing: 0, english_argument: 0 };
  const unsupported = { status: 'unsupported' as const, reason: 'Not released or computationally reviewed; representation only.' };
  const supported = { status: 'supported' as const, authority: 'source' as const, review: null, kernel: null };
  return payloads.map((payload, index) => {
    const section = index >= 11 ? 'english_argument' : 'cloud_computing';
    const original = canonicalContent(originalPayload(payload));
    const locator = { kind: 'synthetic' as const, section, span: { start: offsets[section], end: offsets[section] + original.length } };
    offsets[section] += original.length + 1;
    if (payload.kind === 'equation') payload.steps = payload.steps.map(s => ({ ...s, locator }));
    if (payload.kind === 'figure' || payload.kind === 'diagram' || payload.kind === 'chart') payload.relationships = payload.relationships.map(r => ({ ...r, locator }));
    const u = parseBoundedContentUnit({ schemaVersion: 'petros.v2.content-unit.v1', id: id(start + index + 1),
      institutionId: revision.source.institutionId, sourceId: revision.source.id, sourceRevisionId: revision.id,
      sourceHash: revision.source.originalHash, representationHash: revision.representationHash, parentId: null, ordinal: index,
      locator, payload, contentHash: '0'.repeat(64),
      quality: { state: payload.kind === 'unresolved' ? 'unsupported' : 'synthetic', confidence: null, uncertainties: [], review: null },
      capabilities: { display: supported, cite: supported, highlight: supported, edit: unsupported, explain: unsupported, compute: unsupported, assess: unsupported },
      processing: revision.processing, searchableText: 'text' in payload ? payload.text : 'original' in payload ? payload.original ?? '' : 'caption' in payload ? payload.caption ?? payload.kind : payload.kind,
      assets: [], concepts: [], relationships: [], claims: [] });
    return { ...u, contentHash: hash(contentUnitHashInput(u)) };
  });
}
