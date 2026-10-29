import { createHash } from 'node:crypto';
import { createRequire, isBuiltin } from 'node:module';
import { dirname, join } from 'node:path';
import { realpathSync, existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { contentPayloadSchema, sourceLocatorSchema, v2Hash, v2Key, nativeMetadataSchema } from '@edrion/schemas';

export const M2_EXTRACTOR = 'petros.m2.native.v1';
export const M2_LIMITS = {
  bytes: 20 * 1024 * 1024,
  pages: 20,
  slides: 30,
  characters: 2_000_000,
  regions: 6,
} as const;
const span = z
  .object({
    text: z.string().max(16000),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    font: z.string().max(200),
    size: z.number().finite().nonnegative(),
    bold: z.boolean(),
    region: z
      .object({
        x: z.number().finite(),
        y: z.number().finite(),
        width: z.number().finite().nonnegative(),
        height: z.number().finite().nonnegative(),
      })
      .strict(),
  })
  .strict();
export const extractionEvidenceSchema = z
  .object({
    schemaVersion: z.literal('petros.m2.evidence.v1'),
    format: z.enum(['pdf', 'pptx', 'docx', 'txt', 'markdown']),
    nativeLocators: z.array(sourceLocatorSchema).max(512).optional(),
    nativeDocument: z.object({ encoding: z.enum(['UTF-8','UTF-16LE','UTF-16BE']).nullable(),
      newline: z.enum(['LF','CRLF','CR','mixed','none']), bomBytes: z.number().int().nonnegative().max(3),
      byteLength: z.number().int().positive().max(20 * 1024 * 1024), text: z.string().max(2_000_000).nullable(),
      policy: z.string().max(500), parts: z.array(z.object({ name: z.string().max(240), hash: v2Hash,
        xml: z.string().max(2_000_000) }).strict()).max(32) }).strict().optional(),
    originalHash: v2Hash,
    parserVersion: v2Key,
    rendererVersion: v2Key,
    pageCount: z.number().int().min(0).max(20),
    slideCount: z.number().int().min(0).max(30),
    surfaces: z
      .array(
        z
          .object({
            number: z.number().int().positive(),
            nativeId: z.string().max(120).optional(),
            links: z
              .array(z.object({ url: z.string().max(2048), inert: z.literal(true) }).strict())
              .max(100)
              .optional(),
            sourceWidth: z.number().finite().positive().max(100_000_000),
            sourceHeight: z.number().finite().positive().max(100_000_000),
            coordinateSystem: z.enum(['pdf_viewport_top_left_points', 'ooxml_top_left_emu']),
            text: z.string().max(2_000_000),
            offsetEncoding: z.literal('UTF-16'),
            spans: z.array(span).max(20000),
            transform: z
              .object({
                scaleX: z.number().finite().positive(),
                scaleY: z.number().finite().positive(),
                offsetX: z.number().finite(),
                offsetY: z.number().finite(),
              })
              .strict(),
            preview: z
              .object({
                kind: z.enum(['png', 'native_svg']),
                data: z.string().max(2_000_000),
                width: z.number().positive().max(1600),
                height: z.number().positive().max(1600),
                fidelity: z.enum(['source_render', 'reconstruction']),
              })
              .strict()
              .nullable(),
            warnings: z.array(z.string().max(500)).max(32),
          })
          .strict(),
      )
      .max(30),
    elements: z
      .array(
        z
          .object({
            key: v2Key,
            channel: z.enum(['visible', 'notes', 'hidden', 'headers', 'footers', 'footnotes', 'endnotes', 'comments', 'insertions', 'deletions']),
            native: nativeMetadataSchema.optional(),
            parentKey: v2Key.nullable().optional(),
            locator: sourceLocatorSchema,
            payload: contentPayloadSchema,
            text: z.string().max(16000),
            warnings: z.array(z.string().min(1).max(500)).max(32),
            sourceImage: z
              .object({
                data: z.string().max(1_500_000),
                format: z.enum(['png', 'jpeg']),
                hash: v2Hash,
              })
              .strict()
              .optional(),
            runs: z
              .array(
                z
                  .object({
                    id: v2Key,
                    paragraph: z.number().int().nonnegative(),
                    text: z.string().max(16000),
                    font: z.string().max(200).nullable(),
                    size: z.number().finite().nonnegative().nullable(),
                    bold: z.boolean().nullable(),
                    italic: z.boolean().nullable(),
                  })
                  .strict(),
              )
              .max(1000)
              .optional(),
          })
          .strict(),
      )
      .max(9999),
    shapeRegistry: z
      .array(
        z
          .object({ slide: z.number().int().positive().max(30), shapeId: z.string().max(120) })
          .strict(),
      )
      .max(10000),
    warnings: z.array(z.string().min(1).max(500)).max(32),
  })
  .strict()
  .superRefine((e, ctx) => {
    const error = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (
      e.surfaces.length !== (e.format === 'pdf' ? e.pageCount : e.format === 'pptx' ? e.slideCount : 0) ||
      new Set(e.elements.map((x) => x.key)).size !== e.elements.length
    )
      error('Invalid surface/element inventory');
    if (e.surfaces.reduce((n, p) => n + p.text.length, 0) > M2_LIMITS.characters)
      error('Character limit');
    for (const [index, s] of e.surfaces.entries()) {
      if (s.number !== index + 1) error('Surface convention is one based');
      for (const p of s.spans)
        if (p.end < p.start || s.text.slice(p.start, p.end) !== p.text)
          error('Invalid UTF-16 source span');
    }
    if (e.elements.reduce((n,x) => n + x.text.length,0) > M2_LIMITS.characters) error('Character limit');
    if (e.nativeLocators && Buffer.byteLength(JSON.stringify(e.nativeLocators)) > 64 * 1024) error('Native inventory budget');
    if (e.nativeDocument && e.nativeLocators) {
      const d=e.nativeDocument, offsets=new Int32Array((d.text?.length ?? 0)+1).fill(-1), starts=[0];
      let chars=0,bytes=d.bomBytes;
      offsets[0]=bytes;
      for (const c of d.text ?? '') {chars+=c.length;bytes+=d.encoding==='UTF-8'?Buffer.byteLength(c):c.length*2;offsets[chars]=bytes;}
      const raw=d.text??'';
      for(let i=0;i<raw.length;i++) {if(raw[i]==='\r'&&raw[i+1]==='\n'){starts.push(i+2);i++;}else if(raw[i]==='\r'||raw[i]==='\n')starts.push(i+1);}
      const position=(at:number)=>{let lo=0,hi=starts.length;while(lo+1<hi){const mid=(lo+hi)>>1;if(starts[mid]!<=at)lo=mid;else hi=mid;}return {line:lo+1,column:at-starts[lo]!+1};};
      const partHashes=new Map(d.parts.map(p=>[p.name,sha256(p.xml)]));
      for(const l of e.nativeLocators) {
        if(l.kind==='docx') {
          const p=d.parts.find(p=>p.name===l.part);
          if(!p || p.hash!==l.partHash || partHashes.get(p.name)!==p.hash || l.xmlSpan.end>p.xml.length || p.xml[l.xmlSpan.start]!=='<')error('Invalid native XML source span');
        } else if(l.kind==='txt'||l.kind==='markdown') {
          if(l.sourceHash!==e.originalHash || l.kind!==e.format || l.encoding!==d.encoding || l.newline!==d.newline ||
            offsets[l.textSpan.start]!==l.byteSpan.start || offsets[l.textSpan.end]!==l.byteSpan.end || l.byteSpan.end>d.byteLength ||
            JSON.stringify(position(l.textSpan.start))!==JSON.stringify(l.start) || JSON.stringify(position(l.textSpan.end))!==JSON.stringify(l.end))error('Invalid native text/byte/line mapping');
        } else error('Native source cannot carry another format locator');
      }
      for(const el of e.elements)if((el.locator.kind==='txt'||el.locator.kind==='markdown') && el.native?.original!==raw.slice(el.locator.textSpan.start,el.locator.textSpan.end))error('Original native source range changed');
    }
    for (const el of e.elements) {
      const l = el.locator;
      if (l.kind === 'pdf') {
        if (
          e.format !== 'pdf' ||
          l.page > e.pageCount ||
          (l.span && e.surfaces[l.page - 1]?.text.slice(l.span.start, l.span.end) !== el.text)
        )
          error('Invalid PDF locator');
      } else if (l.kind === 'slide') {
        if (
          e.format !== 'pptx' ||
          !e.shapeRegistry.some((s) => s.slide === l.slide && s.shapeId === l.shapeId)
        )
          error('Invalid slide locator');
      } else if (['docx','txt','markdown'].includes(l.kind)) {
        if (l.kind !== e.format || !('sourceHash' in l) || l.sourceHash !== e.originalHash ||
          !e.nativeLocators?.some(n => JSON.stringify(n) === JSON.stringify(l))) error('Invalid native locator inventory');
      } else error('Adapter cannot fabricate source representation');
    }
  });
export type ExtractionEvidence = z.infer<typeof extractionEvidenceSchema>;
export type ExtractionMetrics = { wallMs: number; peakRssKiB: number; outputBytes: number; validationMs?:number;parseMs?:number;structuralMs?:number;selfPeakRssKiB?:number };
export interface ContentAdapter {
  readonly format: 'pdf' | 'pptx' | 'docx' | 'txt' | 'markdown';
  readonly capabilities: readonly string[];
  extract(
    buffer: Buffer,
    signal: AbortSignal,
    progress?: (surface: number) => void,
  ): Promise<ExtractionEvidence>;
}
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

/** Installed package-only allowlist; no broad repository or credential-directory mount. */
export function parserRuntime() {
  const req = createRequire(__filename);
  const zip = req.resolve('jszip');
  const xml = createRequire(req.resolve('mammoth')).resolve('xml2js');
  const sax = createRequire(xml).resolve('sax');
  const canvas = req.resolve('@napi-rs/canvas');
  const roots = new Set<string>();
  const visit = (entry: string) => {
    let dir = dirname(realpathSync(entry));
    while (!existsSync(join(dir, 'package.json'))) {
      const parent = dirname(dir);
      if (parent === dir) throw new Error('PETROS_M2_RUNTIME_INVALID');
      dir = parent;
    }
    if (roots.has(dir)) return;
    roots.add(dir);
    // Node checks the dependency symlink's package.json before its realpath target.
    const install = dir.lastIndexOf('/node_modules/');
    if (install >= 0) roots.add(dir.slice(0, install + '/node_modules'.length));
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const local = createRequire(join(dir, 'package.json'));
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
      if (isBuiltin(name)) continue;
      try {
        visit(local.resolve(name));
      } catch {
        if (pkg.dependencies?.[name]) throw new Error('PETROS_M2_RUNTIME_INVALID');
      }
    }
  };
  [zip, sax, canvas].forEach(visit);
  return { readRoots: [...roots], args: [JSON.stringify({ zip, sax, canvas })], addons: true };
}
