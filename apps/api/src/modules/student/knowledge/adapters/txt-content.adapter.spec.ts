import { describe, expect, it } from 'vitest';
import { TxtContentAdapter } from './txt-content.adapter';
import { KnowledgePdfProcess } from '../knowledge-pdf-process';
import { readM2fa, freshSignal } from './m2fa-test-fixtures';
const adapter = new TxtContentAdapter(new KnowledgePdfProcess());
describe('M2-F-A actual TXT bytes under OS isolation', () => {
 it.each(['cloud-notes.txt','text-crlf.txt','text-cr.txt','text-mixed.txt','text-utf8-bom.txt','text-utf16le.txt','text-utf16be.txt'])('preserves original bytes and spans: %s', async name => {
  const bytes=readM2fa(name),e=await adapter.extract(bytes,freshSignal());
  expect(e.elements.some(x=>x.payload.kind==='heading')).toBe(true);
  expect(e.elements.some(x=>x.text.includes('99.9'))).toBe(true);
  expect(e.elements.some(x=>x.text.includes('café, π, 水'))).toBe(true);
  for(const el of e.elements){const l=el.locator;if(l.kind!=='txt')throw new Error('wrong locator');
   const text=new TextDecoder(l.encoding,{fatal:true,ignoreBOM:true}).decode(bytes.subarray(l.byteSpan.start,l.byteSpan.end));
   expect(text).toBe(el.native?.original);expect(e.nativeDocument!.text!.slice(l.textSpan.start,l.textSpan.end)).toBe(text);expect(l.sourceHash).toBe(e.originalHash);
  }
 });
 it.each(['text-long-line.txt','text-malformed.txt','text-truncated-utf16.txt','text-surrogate.txt','text-malformed-unicode.txt'])('rejects invalid text: %s',async name=>{await expect(adapter.extract(readM2fa(name),freshSignal())).rejects.toThrow(/PETROS_/);});
 it('rejects binary and undeclared UTF-16',async()=>{await expect(adapter.extract(Buffer.from([0,65,0,66]),freshSignal())).rejects.toThrow('TEXT_INVALID');});
 it('preserves astral Unicode boundaries and source columns',async()=>{
  const bytes=Buffer.from('# Unicode\r\n\r\nA 😀 observation.'),e=await adapter.extract(bytes,freshSignal());
  expect(e.elements.at(-1)!.text).toBe('A 😀 observation.');expect(e.elements.at(-1)!.locator).toMatchObject({start:{line:3,column:1},byteSpan:{end:bytes.length},newline:'CRLF'});
 });
});
