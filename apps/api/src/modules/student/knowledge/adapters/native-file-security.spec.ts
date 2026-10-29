import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { nativeRuntime, M2FA_LIMITS } from './native-file.adapter';
import { DocxContentAdapter } from './docx-content.adapter';
import { MarkdownContentAdapter } from './markdown-content.adapter';
import { TxtContentAdapter } from './txt-content.adapter';
import { extractionEvidenceSchema } from './content-adapter';
import { readM2fa, freshSignal } from './m2fa-test-fixtures';
import { KnowledgePdfProcess } from '../knowledge-pdf-process';
const worker=new KnowledgePdfProcess(),docx=new DocxContentAdapter(worker),txt=new TxtContentAdapter(worker),md=new MarkdownContentAdapter(worker);
async function mutate(change:(zip:JSZip)=>Promise<unknown>) {
 const zip=await JSZip.loadAsync(readM2fa('neutral-notes.docx'));await change(zip);return zip.generateAsync({type:'nodebuffer',compression:'STORE'});
}
describe('M2-F-A additional real-byte admission and worker boundaries',()=>{
 it('rejects macro content types even without a macro filename',async()=>{
  const bytes=await mutate(async z=>z.file('[Content_Types].xml',(await z.file('[Content_Types].xml')!.async('string')).replace('document.main+xml','macroEnabled.main+xml')));
  await expect(docx.extract(bytes,freshSignal())).rejects.toThrow('ACTIVE_CONTENT');
 });
 it('rejects executable bytes disguised under an XML content type',async()=>{
  const bytes=await mutate(async z=>{
   z.file('word/resource.dat',Buffer.from('MZ disguised executable'));
   z.file('[Content_Types].xml',(await z.file('[Content_Types].xml')!.async('string')).replace('</Types>','<Default Extension="dat" ContentType="application/xml"/></Types>'));
  });await expect(docx.extract(bytes,freshSignal())).rejects.toThrow('ACTIVE_CONTENT');
 });
 it('retains an empty Markdown fence without pretending it contains code',async()=>{
  const e=await md.extract(Buffer.from('```js\n```'),freshSignal());expect(e.elements[0]!.payload).toMatchObject({kind:'unresolved',reason:'Empty code block; original fence/source retained.'});expect(e.elements[0]!.native?.fence?.source).toBe('```js\n```');
 });
 it('rejects duplicate conflicting central-directory entries',async()=>{
  const bytes=readM2fa('neutral-notes.docx'),end=bytes.length-22,start=bytes.readUInt32LE(end+16),size=bytes.readUInt32LE(end+12);
  const length=46+bytes.readUInt16LE(start+28)+bytes.readUInt16LE(start+30)+bytes.readUInt16LE(start+32),entry=Buffer.from(bytes.subarray(start,start+length)),footer=Buffer.from(bytes.subarray(end));
  footer.writeUInt16LE(footer.readUInt16LE(8)+1,8);footer.writeUInt16LE(footer.readUInt16LE(10)+1,10);footer.writeUInt32LE(size+length,12);
  const duplicate=Buffer.concat([bytes.subarray(0,end),entry,footer]);await expect(docx.extract(duplicate,freshSignal())).rejects.toThrow('ARCHIVE_PATH');
 });
 it('rejects a non-Word main relationship',async()=>{
  const bytes=await mutate(async z=>z.file('_rels/.rels',(await z.file('_rels/.rels')!.async('string')).replace('officeDocument','notWord')));await expect(docx.extract(bytes,freshSignal())).rejects.toThrow('DOCX_INVALID');
 });
 it('rejects excessive XML nesting before reconstruction',async()=>{
  const bytes=await mutate(async z=>z.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+ '<w:sdt>'.repeat(70)+'</w:sdt>'.repeat(70)+'</w:body></w:document>'));await expect(docx.extract(bytes,freshSignal())).rejects.toThrow('DOCUMENT_LIMIT');
 });
 it('keeps inherited hidden styles outside visible facts',async()=>{
  const bytes=await mutate(async z=>{
   z.file('word/styles.xml',(await z.file('word/styles.xml')!.async('string')).replace('</w:styles>','<w:style w:styleId="Private"><w:rPr><w:vanish/></w:rPr></w:style></w:styles>'));
   z.file('word/document.xml',(await z.file('word/document.xml')!.async('string')).replace('</w:body>','<w:p><w:pPr><w:pStyle w:val="Private"/></w:pPr><w:r><w:t>Private style instruction</w:t></w:r></w:p></w:body>'));
  });
  const e=await docx.extract(bytes,freshSignal());expect(e.elements.find(x=>x.text==='Private style instruction')?.channel).toBe('hidden');
 });
 it('marks an unsupported content control and its unavailable interpretation',async()=>{
  const bytes=await mutate(async z=>z.file('word/document.xml',(await z.file('word/document.xml')!.async('string')).replace('</w:body>','<w:sdt><w:sdtContent><w:p><w:r><w:t>Controlled region</w:t></w:r></w:p></w:sdtContent></w:sdt></w:body>')));
  const e=await docx.extract(bytes,freshSignal());expect(e.elements.some(x=>x.payload.kind==='unresolved'&&x.payload.reason.includes('w:sdt'))).toBe(true);
 });
 it('keeps hidden native math out of visible source channels',async()=>{
  const bytes=await mutate(async z=>z.file('word/document.xml',(await z.file('word/document.xml')!.async('string')).replace('<m:r><m:t>a</m:t>','<m:r><w:rPr><w:vanish/></w:rPr><m:t>a</m:t>')));
  const e=await docx.extract(bytes,freshSignal());expect(e.elements.find(x=>x.native?.nodeType==='OMML')?.channel).toBe('hidden');
 });
 it('flags unqualified numbering restart rules without emitting guessed values',async()=>{
  const bytes=await mutate(async z=>z.file('word/numbering.xml',(await z.file('word/numbering.xml')!.async('string')).replace('<w:start w:val="1"/>','<w:start w:val="1"/><w:lvlRestart w:val="0"/>')));
  const e=await docx.extract(bytes,freshSignal()),item=e.elements.find(x=>x.text==='First item')!;
  expect(item.payload.kind).toBe('paragraph');expect(item.warnings.join(' ')).toContain('restart');expect(item.native?.numbering).toBeUndefined();
 });
 it('enforces text line count and original file size',async()=>{
  await expect(txt.extract(Buffer.from('\n'.repeat(100001)),freshSignal())).rejects.toThrow('DOCUMENT_LIMIT');
  await expect(txt.extract(Buffer.alloc(20*1024*1024+1),freshSignal())).rejects.toThrow('DOCUMENT_LIMIT');
 });
 it('bounds long Markdown tables',async()=>{
  const bytes=Buffer.from('| A | B |\n|---|---|\n'+Array.from({length:101},(_,i)=>`| ${i} | value |`).join('\n'));await expect(md.extract(bytes,freshSignal())).rejects.toThrow('DOCUMENT_LIMIT');
 });
 it.each(['javascript:alert(1)','data:text/html,test','file:///etc/passwd','../private.png','%2e%2e/private.png'])('denies unsafe destination access while preserving literal source: %s',async url=>{
  const e=await md.extract(Buffer.from(`[link](${url})`),freshSignal());expect(e.elements[0]!.native?.links?.[0]?.status).toBe('unsafe');
 });
 it('preserves scripts/event handlers as inert HTML source',async()=>{
  const e=await md.extract(Buffer.from('<script>revealAnswers()</script>\n\n<img src="https://example.test" onerror="revealAnswers()">'),freshSignal());
  expect(e.elements.every(x=>x.payload.kind==='unresolved')).toBe(true);expect(e.elements.every(x=>x.warnings.length>0)).toBe(true);
 });
 it('enforces real native-worker deadline and output bounds',async()=>{
  const runtime=nativeRuntime('docx'),bytes=readM2fa('neutral-notes.docx');
  await expect(worker.run(bytes,freshSignal(),()=>{},runtime.script,{...M2FA_LIMITS,wallMs:1},extractionEvidenceSchema,runtime)).rejects.toThrow('TIMEOUT');
  await expect(worker.run(bytes,freshSignal(),()=>{},runtime.script,{...M2FA_LIMITS,outputBytes:500},extractionEvidenceSchema,runtime)).rejects.toThrow('OUTPUT_LIMIT');
 });
 it.each(['%PDF-1.4\n1 0 obj\n<<>>\nendobj','PK\x03\x04renamed archive'])('rejects known container signatures renamed as text: %s',async header=>{
  await expect(txt.extract(Buffer.from(header),freshSignal())).rejects.toThrow('TYPE_MISMATCH');
  await expect(md.extract(Buffer.from(header),freshSignal())).rejects.toThrow('TYPE_MISMATCH');
 });
 it('cancels a native worker without partial output',async()=>{
  const cancel=new AbortController();const promise=docx.extract(readM2fa('neutral-notes.docx'),cancel.signal);cancel.abort();await expect(promise).rejects.toThrow('CANCELLED');
 });
});
