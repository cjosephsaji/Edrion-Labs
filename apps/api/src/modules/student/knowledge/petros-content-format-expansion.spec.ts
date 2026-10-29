import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { contentUnitHashInput, canonicalContent, sourceLocatorSchema, validateUnitProvenance, type ContentUnit, type SourceRevision } from '@edrion/schemas';
import { TxtContentAdapter } from './adapters/txt-content.adapter';
import { DocxContentAdapter } from './adapters/docx-content.adapter';
import { MarkdownContentAdapter } from './adapters/markdown-content.adapter';
import { readM2fa, freshSignal } from './adapters/m2fa-test-fixtures';
import { KnowledgePdfProcess } from './knowledge-pdf-process';
import { sha256, type ExtractionEvidence } from './adapters/content-adapter';
import { produceContentUnits, representationHash } from './petros-content-intelligence.service';
import { fixtureRevision } from './petros-m2-test-helpers';
import { controlledAuthorization, controlledGateway } from './petros-m2-controlled-gateway.fixture';
import { interpretWithGateway, validateInterpretation, referenceFor, M2_PROMPT } from './petros-content-interpretation';
const worker=new KnowledgePdfProcess(),adapters={docx:new DocxContentAdapter(worker),txt:new TxtContentAdapter(worker),markdown:new MarkdownContentAdapter(worker)};
const base:Record<string,{e:ExtractionEvidence;r:SourceRevision;units:ContentUnit[]}>={};
beforeAll(async()=>{
 for(const [format,name]of Object.entries({docx:'cloud-notes.docx',txt:'cloud-notes.txt',markdown:'argument-notes.md'})) {
  const e=await adapters[format as keyof typeof adapters].extract(readM2fa(name),freshSignal()),r=fixtureRevision(e);
  base[format]={e,r,units:produceContentUnits(e,r)};
 }
});
describe('M2-F-A common source and semantic contracts',()=>{
 it.each(['docx','txt','markdown'])('validates every unit and refuses fabricated %s locations',format=>{
  const {r,units}=base[format]!;
  for(const u of units){expect(()=>validateUnitProvenance(u,r)).not.toThrow();expect(u.capabilities.highlight.status).toBe('supported');expect(u.capabilities.assess.status).toBe('unsupported');
   const bad=structuredClone(u);bad.sourceHash='f'.repeat(64);expect(()=>validateUnitProvenance(bad,r)).toThrow();
   bad.sourceHash=u.sourceHash;bad.locator={...bad.locator,kind:'pdf',page:1,region:null,span:null};expect(()=>validateUnitProvenance(bad,r)).toThrow();
  }
  const forged=structuredClone(units[0]!);if('textSpan' in forged.locator)forged.locator.textSpan={start:900000,end:900001};else throw new Error('span required');expect(()=>validateUnitProvenance(forged,r)).toThrow('INVALID_NATIVE');
 });
 it('rejects unknown locator discriminators',()=>{expect(()=>sourceLocatorSchema.parse({kind:'html',path:'/body'})).toThrow();});
 it.each(['docx','txt','markdown'])('uses the real gateway with controlled %s responses and no teaching approval',async format=>{
  const {r,units}=base[format]!,unit=units.find(u=>u.payload.kind==='paragraph'&&u.sourceChannel==='visible'&&!u.quality.uncertainties.length)!;
  const raw={schemaVersion:M2_PROMPT,proposals:[{kind:'claim',statement:unit.searchableText,support:[{reference:referenceFor(unit),quote:unit.searchableText}],relatedUnitId:null,diagramEdge:null}],uncertainties:[]};
  const f=controlledGateway(raw),out=await interpretWithGateway(f.gateway,r,units,controlledAuthorization(r),freshSignal());
  expect(out).toMatchObject({status:'proposed',liveVerified:false});
  expect(()=>validateInterpretation({...raw,academicApproval:true},r,units)).toThrow();
  const bad=structuredClone(raw);bad.proposals[0]!.support[0]!.reference.sourceId=randomUUID();expect(()=>validateInterpretation(bad,r,units)).toThrow();
  const deny=controlledGateway(raw,true);await expect(interpretWithGateway(deny.gateway,r,units,controlledAuthorization(r),freshSignal())).rejects.toThrow();expect(deny.execute).not.toHaveBeenCalled();
  const unauth=controlledGateway(raw);expect(await interpretWithGateway(unauth.gateway,r,units,undefined,freshSignal())).toMatchObject({status:'unavailable'});expect(unauth.execute).not.toHaveBeenCalled();
 });
 it.each(['run','cell','code-line'])('grounds exact native semantic %s anchors and rejects a substituted locator',kind=>{
  const sample=kind==='code-line'?base.markdown!:base.docx!;
  const unit=sample.units.find(u=>kind==='run'?u.native?.runs?.some(r=>r.bold):kind==='cell'?u.payload.kind==='table':u.payload.kind==='code'&&u.payload.language==='python')!;
  const id=kind==='run'?unit.native!.runs!.find(r=>r.bold)!.id:kind==='cell'&&unit.payload.kind==='table'?unit.payload.cells.find(c=>c.value==='99.9')!.id:unit.payload.kind==='code'?unit.payload.lines[0]!.id:'';
  const quote=kind==='run'?'Bold ':kind==='cell'?'99.9':'value = 99.9';
  const ref=referenceFor(unit,id);expect(ref.locator).not.toEqual(unit.locator);
  const raw={schemaVersion:M2_PROMPT,proposals:[{kind:'claim',statement:quote,support:[{reference:ref,quote}],relatedUnitId:null,diagramEdge:null}],uncertainties:[]};
  expect(()=>validateInterpretation(raw,sample.r,sample.units)).not.toThrow();
  raw.proposals[0]!.support[0]!.reference.locator=unit.locator;expect(()=>validateInterpretation(raw,sample.r,sample.units)).toThrow();
 });
 it.each(['headers','footers','footnotes','endnotes','comments','insertions','deletions','hidden'])('excludes DOCX %s from interpretation',async channel=>{
  const {r,units}=base.docx!,u=units.find(x=>x.sourceChannel===channel)!;
  const raw={schemaVersion:M2_PROMPT,proposals:[{kind:'claim',statement:u.searchableText,support:[{reference:referenceFor(u),quote:u.searchableText}],relatedUnitId:null,diagramEdge:null}],uncertainties:[]};
  expect(()=>validateInterpretation(raw,r,units)).toThrow();
  const f=controlledGateway({schemaVersion:M2_PROMPT,proposals:[],uncertainties:[]});await interpretWithGateway(f.gateway,r,units,controlledAuthorization(r),freshSignal());
  const request=JSON.stringify(f.execute.mock.calls);if(channel==='hidden'||channel==='comments')expect(request).not.toContain(u.searchableText);
 });
 it.each(['cloud-table-cell.docx','cloud-heading.docx','cloud-insert-paragraph.docx','cloud-delete-paragraph.docx','cloud-list.docx','cloud-image.docx','cloud-math.docx','cloud-tracked-state.docx','cloud-footnote.docx','text-statistic.txt','text-negation.txt','text-crlf.txt','text-utf16le.txt','argument-heading.md','argument-code.md','argument-table-cell.md','argument-link.md','argument-language.md','argument-quote.md','argument-unsafe-html.md'])('derives content-sensitive immutable revisions from changed bytes: %s',async name=>{
  const format=name.endsWith('.docx')?'docx':name.endsWith('.txt')?'txt':'markdown',prior=base[format]!,snapshot=canonicalContent(prior);
  const e=await adapters[format].extract(readM2fa(name),freshSignal()),r=fixtureRevision(e),units=produceContentUnits(e,r);
  const text=units.map(u=>u.searchableText).join(' '),table=units.find(u=>u.payload.kind==='table')?.payload;
  if(name.includes('table-cell') || name==='text-statistic.txt') expect(text).toContain('97.3');
  if(name==='cloud-heading.docx')expect(text).toContain('Recorded Results');
  if(name==='cloud-insert-paragraph.docx')expect(text).toContain('Inserted observation.');
  if(name==='cloud-delete-paragraph.docx')expect(text).not.toContain('A service boundary assigns responsibility explicitly.');
  if(name==='cloud-list.docx')expect(text).toContain('Modified first item');
  if(name==='cloud-image.docx')expect(units.find(u=>u.native?.media)?.native?.media?.hash).not.toBe(prior.units.find(u=>u.native?.media)?.native?.media?.hash);
  if(name==='cloud-math.docx')expect(units.find(u=>u.payload.kind==='equation')?.native?.original).toContain('<m:t>z</m:t>');
  if(name==='cloud-tracked-state.docx')expect(units.filter(u=>u.sourceChannel==='visible').map(u=>u.searchableText).join(' ')).toContain('accepted revision');
  if(name==='cloud-footnote.docx')expect(units.find(u=>u.sourceChannel==='footnotes')?.searchableText).toContain('revised sample');
  if(name==='text-negation.txt')expect(text).toContain('It is not available');
  if(name==='text-crlf.txt')expect(e.nativeDocument?.newline).toBe('CRLF');
  if(name==='text-utf16le.txt')expect(e.nativeDocument?.encoding).toBe('UTF-16LE');
  if(name==='argument-heading.md')expect(text).toContain('Review evidence');
  if(name==='argument-code.md')expect(text).toContain('print(value + 1)');
  if(name==='argument-link.md')expect(units.flatMap(u=>u.native?.links??[]).some(l=>l.target==='https://example.test/changed')).toBe(true);
  if(name==='argument-language.md')expect(units.some(u=>u.payload.kind==='code'&&u.payload.language==='javascript')).toBe(true);
  if(name==='argument-quote.md')expect(text).toContain('requires independent confirmation');
  if(name==='argument-unsafe-html.md')expect(text).toContain('onerror=');
  if(name.includes('table-cell'))expect(table?.kind==='table'&&table.cells.some(c=>c.value==='97.3')).toBe(true);
  expect(e.originalHash).not.toBe(prior.e.originalHash);expect(representationHash(e)).not.toBe(prior.r.representationHash);expect(r.id).not.toBe(prior.r.id);
  expect(units.map(u=>u.contentHash)).not.toEqual(prior.units.map(u=>u.contentHash));for(const u of units)expect(()=>validateUnitProvenance(u,r)).not.toThrow();
  expect(()=>validateUnitProvenance(prior.units[0]!,r)).toThrow();expect(canonicalContent(prior)).toBe(snapshot);
  expect(units.every(u=>sha256(contentUnitHashInput(u))===u.contentHash)).toBe(true);
 });
});
