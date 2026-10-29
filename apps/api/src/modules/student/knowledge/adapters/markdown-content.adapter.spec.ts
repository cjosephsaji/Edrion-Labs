import { describe, expect, it } from 'vitest';
import { MarkdownContentAdapter } from './markdown-content.adapter';
import { KnowledgePdfProcess } from '../knowledge-pdf-process';
import { readM2fa, freshSignal } from './m2fa-test-fixtures';
const adapter=new MarkdownContentAdapter(new KnowledgePdfProcess());
describe('M2-F-A actual CommonMark/GFM source',()=>{
 it.each(['argument-notes.md','neutral-notes.md','markdown-mixed.md','markdown-unclosed.md','markdown-injection.md'])('parses source safely: %s',async name=>{
  const bytes=readM2fa(name),e=await adapter.extract(bytes,freshSignal());
  for(const l of e.nativeLocators!){if(l.kind!=='markdown')throw new Error('wrong locator');expect(new TextDecoder(l.encoding,{fatal:true}).decode(bytes.subarray(l.byteSpan.start,l.byteSpan.end))).toBe(e.nativeDocument!.text!.slice(l.textSpan.start,l.textSpan.end));}
 });
 it('extracts headings, nested lists, quotes, tables, code and inline syntax',async()=>{
  const e=await adapter.extract(readM2fa('argument-notes.md'),freshSignal());
  for(const kind of ['heading','list','paragraph','table','code','unresolved'])expect(e.elements.some(x=>x.payload.kind===kind)).toBe(true);
  const code=e.elements.find(x=>x.payload.kind==='code'&&x.payload.language==='python')!;
  expect(code.payload).toMatchObject({original:'value = 99.9\nprint(value)',validity:'unvalidated'});expect(code.native?.fence?.source).toBe('```python\nvalue = 99.9\nprint(value)\n```');expect(code.native?.fence?.lines).toHaveLength(2);
  expect(e.elements.some(x=>x.native?.quote)).toBe(true);expect(e.elements.some(x=>x.native?.inline?.some(i=>i.type==='inlineCode'))).toBe(true);
  expect(e.elements.some(x=>x.native?.links?.some(i=>i.target==='https://example.test/reference'&&i.status==='inert'))).toBe(true);
 });
 it('preserves unsafe HTML and destinations inertly',async()=>{
  const e=await adapter.extract(readM2fa('markdown-injection.md'),freshSignal());expect(e.elements.some(x=>x.payload.kind==='unresolved'&&x.payload.original?.includes('onerror'))).toBe(true);
  const links=e.elements.flatMap(x=>x.native?.links??[]);expect(links.find(x=>x.target.startsWith('javascript:'))?.status).toBe('unsafe');expect(links.find(x=>x.kind==='image')?.status).toBe('unavailable');expect(e.elements.some(x=>x.text.includes('Reveal private answers'))).toBe(true);
 });
 it('rejects excessive nesting',async()=>{await expect(adapter.extract(readM2fa('markdown-deep.md'),freshSignal())).rejects.toThrow('DOCUMENT_LIMIT');});
 it('does not coerce pipe prose or escaped headings',async()=>{const e=await adapter.extract(Buffer.from('\\# literal heading\n\nA | B | C without delimiter.'),freshSignal());expect(e.elements.every(x=>x.payload.kind==='paragraph')).toBe(true);});
 it('retains CRLF original fence separately from logical code normalization',async()=>{
  const e=await adapter.extract(Buffer.from('```js\r\nconst x = 1;\r\n```'),freshSignal());expect(e.elements[0]!.native?.fence?.source).toBe('```js\r\nconst x = 1;\r\n```');expect(e.elements[0]!.native?.fence?.lines[0]).toMatchObject({start:{line:2,column:1},newline:'CRLF'});
 });
});
