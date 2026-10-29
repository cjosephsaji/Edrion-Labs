import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll,describe,expect,it } from 'vitest';
import { KnowledgePdfProcess } from './knowledge-pdf-process';
import { PdfContentAdapter } from './adapters/pdf-content.adapter';
import { PptxContentAdapter } from './adapters/pptx-content.adapter';
import { sha256,type ExtractionEvidence } from './adapters/content-adapter';
import { produceContentUnits,selectVisualRegions } from './petros-content-intelligence.service';
import { fixtureRevision } from './petros-m2-test-helpers';
const dir=resolve(__dirname,'../../../../../../packages/learn-evals/src/petros-v2/fixtures/sources'),read=(n:string)=>readFileSync(resolve(dir,n));
const pdf=new PdfContentAdapter(new KnowledgePdfProcess()),pptx=new PptxContentAdapter(new KnowledgePdfProcess()),signal=()=>new AbortController().signal;
const cases=new Map<string,ExtractionEvidence>();
beforeAll(async()=>{for(const name of ['cloud-reference.pdf','argument.pdf','cloud-models.pptx','structures.pdf','ambiguous-arrow.pptx','cloud-models-revised.pptx'])cases.set(name,await(name.endsWith('.pdf')?pdf:pptx).extract(read(name),signal()));},25000);
describe('M2 mandatory genuine-byte edge cases',()=>{
  it.each([
    ['Clean text PDF','argument.pdf','paragraph'],['Multi-column PDF','cloud-reference.pdf','paragraph'],['PDF table','cloud-reference.pdf','table'],
    ['PDF equation','cloud-reference.pdf','equation'],['Embedded diagram image','cloud-reference.pdf','figure'],['PDF chart paths','structures.pdf','unresolved'],
    ['Clean text PPTX','cloud-models.pptx','heading'],['Native diagram','cloud-models.pptx','diagram'],['Native PPTX table','cloud-models.pptx','table'],
    ['PPTX flattened figure','cloud-models.pptx','figure'],['Contradictory numbers','argument.pdf','paragraph'],['Native chart caches','cloud-models.pptx','chart'],
    ['Authentic numbered list','structures.pdf','list']
  ])('%s preserves original hash and genuine %s structure',(_,name,kind)=>{
    const e=cases.get(name)!;expect(e.originalHash).toBe(sha256(read(name)));expect(e.elements.some(el=>el.payload.kind===kind)).toBe(true);
    for(const s of e.surfaces)for(const span of s.spans)expect(s.text.slice(span.start,span.end)).toBe(span.text);
  });
  it('does not combine unrelated PDF columns into a single paragraph',()=>{const e=cases.get('cloud-reference.pdf')!;expect(e.surfaces[1]!.warnings.join(' ')).toContain('columns');
    expect(e.elements.filter(el=>el.locator.kind==='pdf'&&el.locator.page===2).every(el=>!(el.text.includes('CPU')&&el.text.includes('Latency')))).toBe(true);});
  it('retains notes separately and emits all eleven authentic content families across parsed bytes',()=>{
    expect(cases.get('cloud-models.pptx')!.elements.some(el=>el.channel==='notes')).toBe(true);
    const kinds=new Set([...cases.values()].flatMap(e=>produceContentUnits(e,fixtureRevision(e)).map(u=>u.payload.kind)));
    expect([...kinds].sort()).toEqual(['heading','paragraph','list','table','figure','diagram','equation','code','caption','chart','unresolved'].sort());
  });
  it('preserves changed native cell values and changed arrow direction',()=>{
    const a=cases.get('cloud-models.pptx')!,b=cases.get('cloud-models-revised.pptx')!;expect(a.originalHash).not.toBe(b.originalHash);
    expect(JSON.stringify(b.elements.find(el=>el.payload.kind==='table')!.payload)).toContain('Application code and runtime');
    const old=a.elements.find(el=>el.payload.kind==='diagram')!.payload,next=b.elements.find(el=>el.payload.kind==='diagram')!.payload;
    if(old.kind!=='diagram'||next.kind!=='diagram')throw new Error();expect(next.relationships[0]!.from).toBe(old.relationships[0]!.to);
  });
  it('does not invent direction for a native connector without arrowheads',()=>{const p=cases.get('ambiguous-arrow.pptx')!.elements.find(el=>el.payload.kind==='diagram')!.payload;
    if(p.kind!=='diagram')throw new Error();expect(p.relationships[0]!.kind).toBe('connects');expect(p.relationships[0]!.assertion).toBe('visual_only');});
  it.each(['image-only.pdf','rotated.pdf','smartart.pptx','hidden-slide.pptx','grouped-shapes.pptx','external-link.pptx'])('marks limitations in %s instead of silently succeeding',async name=>{
    const e=await(name.endsWith('.pdf')?pdf:pptx).extract(read(name),signal());expect([...e.warnings,...e.surfaces.flatMap(s=>s.warnings),...e.elements.flatMap(el=>el.warnings)].length).toBeGreaterThan(0);
    expect(selectVisualRegions(e)).toHaveLength(Math.min(selectVisualRegions(e).length,6));
    if(name==='hidden-slide.pptx')expect(e.elements.filter(el=>el.locator.kind==='slide'&&el.locator.slide===1).every(el=>el.channel==='hidden')).toBe(true);
  },15000);
  it.each([
    ['corrupt.pdf','PDF_INVALID'],['encrypted.pdf','PDF_ENCRYPTED'],['oversized-pages.pdf','DOCUMENT_LIMIT'],['huge-dimensions.pdf','PAGE_DIMENSIONS'],
    ['malformed.pptx','ARCHIVE_INVALID'],['unsafe-path.pptx','ARCHIVE_PATH'],['zip-bomb.pptx','ARCHIVE_LIMIT'],['xml-entity.pptx','XML_UNSAFE'],
    ['macro.pptx','ARCHIVE_EXECUTABLE'],['embedded-executable.pptx','ARCHIVE_EXECUTABLE']
  ])('rejects %s safely with %s',async(name,code)=>{await expect((name.endsWith('.pdf')?pdf:pptx).extract(read(name),signal())).rejects.toThrow(code);},15000);
  it('enforces 20 MiB input before process dispatch and honors a pre-cancelled parse',async()=>{
    await expect(pdf.extract(Buffer.alloc(20*1024*1024+1),signal())).rejects.toThrow('DOCUMENT_LIMIT');const c=new AbortController();c.abort();await expect(pptx.extract(read('cloud-models.pptx'),c.signal)).rejects.toThrow('CANCELLED');
  });
});
