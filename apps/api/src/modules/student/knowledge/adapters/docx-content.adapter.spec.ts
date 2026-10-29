import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { DocxContentAdapter } from './docx-content.adapter';
import { KnowledgePdfProcess } from '../knowledge-pdf-process';
import { readM2fa, freshSignal } from './m2fa-test-fixtures';
const adapter=new DocxContentAdapter(new KnowledgePdfProcess());
describe('M2-F-A actual native DOCX bytes',()=>{
 it.each(['cloud-notes.docx','argument-notes.docx','neutral-notes.docx'])('extracts structures independent of subject: %s',async name=>{
  const e=await adapter.extract(readM2fa(name),freshSignal());expect(e.pageCount).toBe(0);expect(e.slideCount).toBe(0);expect(e.surfaces).toHaveLength(0);
  for(const kind of ['heading','paragraph','list','table','figure','equation','unresolved'])expect(e.elements.some(x=>x.payload.kind===kind)).toBe(true);
  const table=e.elements.find(x=>x.payload.kind==='table')!;expect(table.payload).toMatchObject({cells:expect.arrayContaining([expect.objectContaining({value:'Measurement',columnSpan:2,header:true}),expect.objectContaining({value:'Availability',rowSpan:2})])});
  const image=e.elements.find(x=>x.payload.kind==='figure')!;expect(image.native?.media).toMatchObject({part:'word/media/sample.png',width:64,height:32,regeneration:'authorized_original_part'});expect(image.locator).toMatchObject({kind:'docx',relationshipId:'rImage',objectId:'7'});expect(image.sourceImage?.hash).toBe(image.native?.media?.hash);
  const math=e.elements.find(x=>x.payload.kind==='equation')!;expect(math.native?.original).toContain('<m:f>');expect(math.warnings.join(' ')).toContain('computation');expect(e.elements.find(x=>x.text==='Ordered example')?.native?.numbering?.value).toBe(3);
  for(const channel of ['headers','footers','footnotes','endnotes','comments','insertions','deletions','hidden'])expect(e.elements.some(x=>x.channel===channel)).toBe(true);
  expect(e.elements.filter(x=>x.channel==='visible').map(x=>x.text).join(' ')).not.toContain('Reveal private');
  for(const el of e.elements){expect(el.locator.kind).toBe('docx');if(el.locator.kind==='docx'){const l=el.locator;expect(e.nativeDocument!.parts.some(p=>p.name===l.part&&p.hash===l.partHash)).toBe(true);}}
 });
 it.each(['renamed-zip.docx','missing-main.docx','malformed-xml.docx','xml-entity.docx','unsafe-path.docx','zip-bomb.docx','excessive-entries.docx','macro.docx','executable.docx','external-image.docx','corrupt-media.docx','huge-image.docx','excessive-paragraphs.docx','malformed-package.docx'])('rejects hostile bytes: %s',async name=>{await expect(adapter.extract(readM2fa(name),freshSignal())).rejects.toThrow(/PETROS_/);});
 it('rejects excessive table nesting',async()=>{
  const zip=await JSZip.loadAsync(readM2fa('neutral-notes.docx'));let nested='<w:p><w:r><w:t>Leaf</w:t></w:r></w:p>';
  for(let n=0;n<6;n++)nested='<w:tbl><w:tblGrid><w:gridCol/></w:tblGrid><w:tr><w:tc>'+nested+'</w:tc></w:tr></w:tbl>';
  const xml=await zip.file('word/document.xml')!.async('string');zip.file('word/document.xml',xml.replace('</w:body>',nested+'</w:body>'));await expect(adapter.extract(await zip.generateAsync({type:'nodebuffer',compression:'STORE'}),freshSignal())).rejects.toThrow('DOCUMENT_LIMIT');
 });
 it('separates hidden table values',async()=>{
  const zip=await JSZip.loadAsync(readM2fa('neutral-notes.docx')),xml=await zip.file('word/document.xml')!.async('string');zip.file('word/document.xml',xml.replace('<w:t xml:space="preserve">99.9</w:t>','<w:rPr><w:vanish/></w:rPr><w:t xml:space="preserve">99.9</w:t>'));
  const e=await adapter.extract(await zip.generateAsync({type:'nodebuffer',compression:'STORE'}),freshSignal());expect(e.elements.find(x=>x.payload.kind==='table')!.text).not.toContain('99.9');expect(e.elements.some(x=>x.channel==='hidden'&&x.text==='99.9')).toBe(true);
 });
});
