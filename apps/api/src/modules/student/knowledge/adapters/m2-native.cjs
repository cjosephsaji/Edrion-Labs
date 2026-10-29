'use strict';
/* Standalone trusted sandbox code. Document bytes arrive on stdin; no network, paths or credentials. */
const { createHash } = require('node:crypto');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const emit = (value) => process.stdout.write(JSON.stringify(value) + '\n');
const clean = (s) => s.replaceAll('\0', '');
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c],
  );
const visual = () => ({
  caption: null,
  nodes: [],
  relationships: [],
  transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
  unsupportedRegions: [],
});
const boundedRegion = (x, y, w, h, W, H) => {
  x = Math.max(0, Math.min(1, x / W));
  y = Math.max(0, Math.min(1, y / H));
  w = Math.max(0, Math.min(1 - x, w / W));
  h = Math.max(0, Math.min(1 - y, h / H));
  if (!w || !h) return null;
  // Tiny inward rounding prevents floating-point sums exceeding the M1 region contract.
  return { x, y, width: Math.floor(w * 1e9) / 1e9, height: Math.floor(h * 1e9) / 1e9 };
};
function evidence(format, buffer) {
  return {
    schemaVersion: 'petros.m2.evidence.v1',
    format,
    originalHash: hash(buffer),
    parserVersion: format === 'pdf' ? 'pdfjs.4.10.38.m2.v1' : 'ooxml.jszip.3.10.1.sax.1.6.0.v1',
    rendererVersion: format === 'pdf' ? 'pdfjs.canvas.0.1.100.v1' : 'ooxml.native.svg.v1',
    pageCount: 0,
    slideCount: 0,
    surfaces: [],
    elements: [],
    shapeRegistry: [],
    warnings: [],
  };
}
function canvasFactory(canvas) {
  return class {
    create(w, h) {
      if (w * h > 16000000) throw new Error('PETROS_DOCUMENT_LIMIT');
      const c = canvas.createCanvas(w, h);
      return { canvas: c, context: c.getContext('2d') };
    }
    reset(c, w, h) {
      if (w * h > 16000000) throw new Error('PETROS_DOCUMENT_LIMIT');
      c.canvas.width = w;
      c.canvas.height = h;
    }
    destroy(c) {
      c.canvas.width = 0;
      c.canvas.height = 0;
      c.canvas = null;
      c.context = null;
    }
  };
}
function classify(text, spans, normal) {
  if (/^\s*(?:[-•]|\d+[.)])\s/.test(text))
    return { kind: 'list', ordered: /^\s*\d/.test(text), items: [{ id: 'item.1', text }] };
  if (
    spans.some((s) => /mono|courier|consolas/i.test(s.font)) &&
    /[{};]|\b(?:def|return|const|function)\b/.test(text)
  )
    return {
      kind: 'code',
      language: null,
      original: text,
      lines: text
        .split('\n')
        .map((t, i) => ({ id: `line.${i + 1}`, number: i + 1, text: t, syntax: [] })),
      validity: 'unvalidated',
    };
  if (/[=∑∫√]/.test(text) && !/[.!?].{2,}/.test(text))
    return {
      kind: 'equation',
      original: text.slice(0, 2000),
      tex: null,
      symbols: [...new Set(text.match(/[A-Za-z][A-Za-z0-9_]*|[∑∫√]/g) || [])]
        .slice(0, 32)
        .map((original, i) => ({ id: `symbol.${i}`, original, meaning: null })),
      assumptions: [],
      steps: [],
      interpretation: null,
      notation: 'display_only',
    };
  if (spans.some((s) => s.size >= normal * 1.3) && text.length < 300)
    return { kind: 'heading', text, level: 1 };
  return { kind: 'paragraph', text };
}
async function extractPdf(doc, buffer, pdfjs, canvas, progress) {
  const result = evidence('pdf', buffer);
  result.pageCount = doc.numPages;
  let count = 0;
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number),
      vp = page.getViewport({ scale: 1 });
    if (vp.width > 14400 || vp.height > 14400 || vp.width < 1 || vp.height < 1)
      throw new Error('PETROS_M2_PAGE_DIMENSIONS');
    const content = await page.getTextContent(),
      ops = await page.getOperatorList();
    if (ops.fnArray.length > 100000) throw new Error('PETROS_DOCUMENT_LIMIT');
    const warnings = [],
      raw = [];
    for (const item of content.items)
      if ('str' in item && item.str.trim()) {
        const t = pdfjs.Util.transform(vp.transform, item.transform),
          style = content.styles[item.fontName] || {};
        const size = Math.hypot(t[2], t[3]),
          height = Math.max(size, item.height || 0);
        const text = clean(item.str);
        if (!text) continue;
        if (/\uFFFD/.test(text)) warnings.push('Invalid text encoding requires review.');
        if (Math.abs(t[1]) > 0.01 || Math.abs(t[2]) > 0.01)
          warnings.push('Rotated text reading order requires review.');
        raw.push({
          text,
          font: style.fontFamily || item.fontName,
          size,
          bold: /bold/i.test(style.fontFamily || ''),
          x: t[4],
          y: t[5] - height * (style.ascent || 0.85),
          w: Math.abs(item.width),
          h: height,
        });
      }
    if (raw.length > 20000) throw new Error('PETROS_DOCUMENT_LIMIT');
    const sizes = raw.map((x) => x.size).sort((a, b) => a - b),
      normal = sizes[Math.floor(sizes.length / 2)] || 12;
    // Detect a persistent empty vertical gutter from short spans on both sides. Never join columns.
    const left = raw.filter(
      (x) => x.x < vp.width * 0.48 && x.x + x.w < vp.width * 0.53 && x.w < vp.width * 0.48,
    );
    const right = raw.filter((x) => x.x > vp.width * 0.52 && x.w < vp.width * 0.48);
    const middleCells = raw.filter((x) => x.x > vp.width * 0.18 && x.x < vp.width * 0.48);
    const alignedTable = middleCells.some(
      (a) => middleCells.filter((b) => Math.abs(a.x - b.x) < 3).length >= 3,
    );
    const multi =
      !alignedTable &&
      left.length >= 4 &&
      right.length >= 4 &&
      left.some((a) => right.some((b) => Math.abs(a.y - b.y) < normal * 2));
    const bands = multi
      ? [raw.filter((x) => x.x < vp.width * 0.52), raw.filter((x) => x.x >= vp.width * 0.52)]
      : [raw];
    if (multi)
      warnings.push(
        'Multiple columns detected; column-major reading order is heuristic and requires review.',
      );
    const lines = [];
    for (const band of bands) {
      band.sort((a, b) => a.y - b.y || a.x - b.x);
      for (const s of band) {
        const last = lines[lines.length - 1];
        if (last && last.band === band && Math.abs(last.y - s.y) < Math.max(2, normal * 0.35))
          last.items.push(s);
        else lines.push({ y: s.y, band, items: [s] });
      }
    }
    let sourceText = '';
    const spans = [];
    for (const l of lines) {
      l.items.sort((a, b) => a.x - b.x);
      l.start = sourceText.length;
      for (const s of l.items) {
        if (sourceText.length > l.start) sourceText += ' ';
        const start = sourceText.length;
        sourceText += s.text;
        spans.push({
          text: s.text,
          start,
          end: sourceText.length,
          font: s.font,
          size: s.size,
          bold: s.bold,
          region: { x: s.x, y: s.y, width: s.w, height: s.h },
        });
      }
      l.end = sourceText.length;
      l.text = sourceText.slice(l.start, l.end);
      sourceText += '\n';
    }
    count += sourceText.length;
    if (count > 2000000) throw new Error('PETROS_DOCUMENT_LIMIT');
    const regionOf = (items) =>
      boundedRegion(
        Math.min(...items.map((s) => s.x)),
        Math.min(...items.map((s) => s.y)),
        Math.max(...items.map((s) => s.x + s.w)) - Math.min(...items.map((s) => s.x)),
        Math.max(...items.map((s) => s.y + s.h)) - Math.min(...items.map((s) => s.y)),
        vp.width,
        vp.height,
      );
    const locator = (items, start, end) => ({
      kind: 'pdf',
      page: number,
      region: regionOf(items),
      span: start === null ? null : { start, end },
    });
    // Admit only repeatably aligned, separated native cell runs, three or more rows.
    const cellLines = lines.map((l) => {
      const cells = [];
      for (const s of l.items) {
        const c = cells[cells.length - 1];
        if (c && s.x - (c[c.length - 1].x + c[c.length - 1].w) < 18) c.push(s);
        else cells.push([s]);
      }
      return { ...l, cells };
    });
    const used = new Set();
    let element = 0;
    if (!multi)
      for (let i = 0; i < cellLines.length; i++) {
        const a = cellLines[i];
        if (a.cells.length < 2 || a.cells.length > 32) continue;
        const rows = [a];
        let j = i + 1;
        while (j < cellLines.length) {
          const b = cellLines[j];
          if (
            b.cells.length !== a.cells.length ||
            b.y - rows[rows.length - 1].y > normal * 3 ||
            b.cells.some((c, k) => Math.abs(c[0].x - a.cells[k][0].x) > 3)
          )
            break;
          rows.push(b);
          j++;
        }
        if (rows.length < 3) continue;
        const cells = [];
        rows.forEach((r, ri) =>
          r.cells.forEach((c, ci) =>
            cells.push({
              id: `cell.${ri}.${ci}`,
              row: `row.${ri}`,
              column: `col.${ci}`,
              rowSpan: 1,
              columnSpan: 1,
              header: ri === 0 && c.some((s) => s.bold),
              value: c.map((s) => s.text).join(' '),
              unit: null,
              unresolved: false,
              region: regionOf(c),
            }),
          ),
        );
        const items = rows.flatMap((r) => r.items),
          text = sourceText.slice(rows[0].start, rows[rows.length - 1].end);
        result.elements.push({
          key: `p${number}.table.${element++}`,
          channel: 'visible',
          locator: locator(items, rows[0].start, rows[rows.length - 1].end),
          payload: {
            kind: 'table',
            caption: null,
            rows: rows.map((_, r) => `row.${r}`),
            columns: a.cells.map((_, c) => `col.${c}`),
            cells,
          },
          text,
          warnings: [
            'Table cells reconstructed from repeated native alignment; header semantics and spans require review.',
          ],
        });
        rows.forEach((r) => used.add(r.start));
        i = j - 1;
      }
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (used.has(l.start)) continue;
      const items = [...l.items];
      let end = l.end,
        j = i + 1,
        last = l;
      const type = classify(l.text, l.items, normal).kind;
      if (type === 'paragraph' && !/^Figure\s+\d/i.test(l.text))
        while (j < lines.length) {
          const b = lines[j];
          if (
            used.has(b.start) ||
            b.band !== l.band ||
            b.y - last.y > normal * 1.85 ||
            Math.abs(b.items[0].x - l.items[0].x) > 8 ||
            classify(b.text, b.items, normal).kind !== 'paragraph' ||
            /^Figure\s+\d/i.test(b.text)
          )
            break;
          items.push(...b.items);
          end = b.end;
          last = b;
          j++;
        }
      const t = sourceText.slice(l.start, end);
      if (t.length > 16000) throw new Error('PETROS_DOCUMENT_LIMIT');
      result.elements.push({
        key: `p${number}.text.${element++}`,
        channel: 'visible',
        locator: locator(items, l.start, end),
        payload: classify(t, items, normal),
        text: t,
        warnings: multi ? ['Column reading order requires review.'] : [],
      });
      i = j - 1;
    }
    // Retain actual image placement from the PDF graphics stack. Paths remain unstructured evidence.
    let matrix = [1, 0, 0, 1, 0, 0];
    const stack = [];
    let pathOps = 0;
    for (let i = 0; i < ops.fnArray.length; i++) {
      const op = ops.fnArray[i],
        args = ops.argsArray[i];
      if (op === pdfjs.OPS.save) stack.push([...matrix]);
      else if (op === pdfjs.OPS.restore) matrix = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (op === pdfjs.OPS.transform) matrix = pdfjs.Util.transform(matrix, args);
      else if (
        [
          pdfjs.OPS.paintImageXObject,
          pdfjs.OPS.paintInlineImageXObject,
          pdfjs.OPS.paintImageMaskXObject,
        ].includes(op)
      ) {
        const points = [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ].map((p) => pdfjs.Util.applyTransform(pdfjs.Util.applyTransform(p, matrix), vp.transform));
        const x = Math.min(...points.map((p) => p[0])),
          y = Math.min(...points.map((p) => p[1])),
          w = Math.max(...points.map((p) => p[0])) - x,
          h = Math.max(...points.map((p) => p[1])) - y;
        const region = boundedRegion(x, y, w, h, vp.width, vp.height);
        result.elements.push({
          key: `p${number}.image.${element++}`,
          channel: 'visible',
          locator: { kind: 'pdf', page: number, region, span: null },
          payload: { kind: 'figure', ...visual(), unsupportedRegions: region ? [region] : [] },
          text: '',
          warnings: [
            'Embedded image retained in page render; labels and relationships need OCR/vision review.',
          ],
        });
      } else if (op === pdfjs.OPS.constructPath) pathOps++;
    }
    if (pathOps)
      result.elements.push({
        key: `p${number}.paths.${element++}`,
        channel: 'visible',
        locator: { kind: 'pdf', page: number, region: null, span: null },
        payload: {
          kind: 'unresolved',
          original: null,
          reason:
            'Vector paths are rendered; table borders, diagram edges and chart axes are not semantically reconstructed.',
        },
        text: '',
        warnings: ['Vector structure requires visual review.'],
      });
    if (!raw.length) {
      warnings.push('Image-only or empty page: native text unavailable; OCR/vision required.');
      result.elements.push({
        key: `p${number}.unreadable`,
        channel: 'visible',
        locator: { kind: 'pdf', page: number, region: null, span: null },
        payload: {
          kind: 'unresolved',
          original: null,
          reason: 'No native text recovered; page is not ready for teaching.',
        },
        text: '',
        warnings: [warnings[warnings.length - 1]],
      });
    }
    const scale = Math.min(1.5, 1280 / vp.width, 1280 / vp.height),
      renderVp = page.getViewport({ scale });
    const c = canvas.createCanvas(Math.ceil(renderVp.width), Math.ceil(renderVp.height));
    await page.render({ canvasContext: c.getContext('2d'), viewport: renderVp }).promise;
    const image = c.toBuffer('image/png').toString('base64');
    if (image.length > 2000000) throw new Error('PETROS_DOCUMENT_LIMIT');
    const annotations = await page.getAnnotations();
    const links = annotations
      .filter((a) => a.url || a.unsafeUrl)
      .slice(0, 100)
      .map((a) => ({ url: String(a.url || a.unsafeUrl).slice(0, 2048), inert: true }));
    if (annotations.some((a) => a.url || a.unsafeUrl))
      warnings.push('Links retained only as inert PDF source metadata; never fetched.');
    result.surfaces.push({
      number,
      sourceWidth: vp.width,
      sourceHeight: vp.height,
      coordinateSystem: 'pdf_viewport_top_left_points',
      links,
      text: sourceText,
      offsetEncoding: 'UTF-16',
      spans,
      transform: {
        scaleX: c.width / vp.width,
        scaleY: c.height / vp.height,
        offsetX: 0,
        offsetY: 0,
      },
      preview: {
        kind: 'png',
        data: image,
        width: c.width,
        height: c.height,
        fidelity: 'source_render',
      },
      warnings: [...new Set(warnings)].slice(0, 32),
    });
    const current = result.elements.filter(
      (e) => e.locator.kind === 'pdf' && e.locator.page === number,
    );
    const other = result.elements.filter(
      (e) => !(e.locator.kind === 'pdf' && e.locator.page === number),
    );
    current.sort((a, b) =>
      multi
        ? (a.locator.span?.start ?? 2000001) - (b.locator.span?.start ?? 2000001)
        : (a.locator.region?.y ?? 1) - (b.locator.region?.y ?? 1),
    );
    result.elements = [...other, ...current];
    page.cleanup();
    progress({ progress: number });
  }
  return result;
}
function xmlTree(text, sax) {
  if (Buffer.byteLength(text) > 8 * 1024 * 1024 || /<!\s*(?:DOCTYPE|ENTITY)/i.test(text))
    throw new Error('PETROS_M2_XML_UNSAFE');
  const parser = sax.parser(true, { xmlns: true, strictEntities: true });
  const stack = [];
  let root = null,
    nodes = 0,
    chars = 0;
  parser.onopentag = (n) => {
    if (++nodes > 200000 || stack.length > 64) throw new Error('PETROS_M2_XML_LIMIT');
    const v = {
      name: n.local,
      uri: n.uri,
      attrs: Object.fromEntries(Object.entries(n.attributes).map(([k, a]) => [k, a.value])),
      children: [],
      text: '',
    };
    if (stack.length) stack[stack.length - 1].children.push(v);
    else {
      if (root) throw new Error('PETROS_M2_XML_INVALID');
      root = v;
    }
    stack.push(v);
  };
  parser.ontext = parser.oncdata = (t) => {
    chars += t.length;
    if (chars > 2000000) throw new Error('PETROS_M2_XML_LIMIT');
    if (stack.length) stack[stack.length - 1].text += t;
  };
  parser.onclosetag = () => stack.pop();
  parser.onerror = () => {
    throw new Error('PETROS_M2_XML_INVALID');
  };
  parser.write(text).close();
  if (!root || stack.length) throw new Error('PETROS_M2_XML_INVALID');
  return root;
}
const descendants = (n, name) =>
  !n ? [] : [...(n.name === name ? [n] : []), ...n.children.flatMap((c) => descendants(c, name))];
const first = (n, name) => descendants(n, name)[0];
const child = (n, name) => n?.children.find((c) => c.name === name);
const value = (n, name) =>
  descendants(n, name)
    .map((x) => x.text)
    .join('');
const num = (n, k, f = 0) => {
  const v = Number(n?.attrs[k] ?? f);
  if (!Number.isFinite(v)) throw new Error('PETROS_M2_XML_INVALID');
  return v;
};
function zipDirectory(buffer) {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error('PETROS_M2_ARCHIVE_INVALID');
  const entries = buffer.readUInt16LE(end + 10),
    offset = buffer.readUInt32LE(end + 16),
    length = buffer.readUInt32LE(end + 12);
  if (
    buffer.readUInt16LE(end + 4) ||
    buffer.readUInt16LE(end + 6) ||
    entries > 2048 ||
    entries === 65535 ||
    offset + length > end
  )
    throw new Error('PETROS_M2_ARCHIVE_LIMIT');
  let cursor = offset,
    total = 0;
  const paths = new Set();
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50)
      throw new Error('PETROS_M2_ARCHIVE_INVALID');
    const flags = buffer.readUInt16LE(cursor + 8),
      method = buffer.readUInt16LE(cursor + 10),
      compressed = buffer.readUInt32LE(cursor + 20),
      size = buffer.readUInt32LE(cursor + 24);
    const nl = buffer.readUInt16LE(cursor + 28),
      extra = buffer.readUInt16LE(cursor + 30),
      comment = buffer.readUInt16LE(cursor + 32);
    const path = buffer.subarray(cursor + 46, cursor + 46 + nl).toString('utf8');
    if (
      flags & 1 ||
      ![0, 8].includes(method) ||
      size > 16 * 1024 * 1024 ||
      size / Math.max(1, compressed) > 200 ||
      (total += size) > 64 * 1024 * 1024
    )
      throw new Error('PETROS_M2_ARCHIVE_LIMIT');
    if (
      !path ||
      path.includes('\\') ||
      path.startsWith('/') ||
      /(^|\/)\.\.?($|\/)|:|\0/.test(path) ||
      paths.has(path)
    )
      throw new Error('PETROS_M2_ARCHIVE_PATH');
    if (
      /(?:vbaProject|activeX)\//i.test(path) ||
      (/\.(?:exe|dll|bin|com|js|vbs)$/i.test(path) &&
        !/^ppt\/printerSettings\/printerSettings\d+\.bin$/.test(path))
    )
      throw new Error('PETROS_M2_ARCHIVE_EXECUTABLE');
    paths.add(path);
    cursor += 46 + nl + extra + comment;
  }
  if (cursor !== offset + length) throw new Error('PETROS_M2_ARCHIVE_INVALID');
  return paths;
}
async function extractPptx(buffer, dependencies) {
  const paths = zipDirectory(buffer),
    zip = await require(dependencies.zip).loadAsync(buffer),
    sax = require(dependencies.sax);
  const trees = new Map(),
    assets = new Map();
  let expanded = 0;
  for (const path of paths) {
    const entry = zip.file(path);
    if (!entry) continue;
    if (entry.unsafeOriginalName && entry.unsafeOriginalName !== path)
      throw new Error('PETROS_M2_ARCHIVE_PATH');
    const chunks = [];
    let size = 0;
    await new Promise((resolve, reject) => {
      const stream = entry.nodeStream('nodebuffer');
      stream.on('data', (chunk) => {
        size += chunk.length;
        expanded += chunk.length;
        if (size > 16 * 1024 * 1024 || expanded > 64 * 1024 * 1024) {
          stream.destroy();
          reject(new Error('PETROS_M2_ARCHIVE_LIMIT'));
        } else chunks.push(chunk);
      });
      stream.on('error', reject);
      stream.on('end', resolve);
    });
    const data = Buffer.concat(chunks);
    if (/\.(?:xml|rels)$/.test(path)) trees.set(path, xmlTree(data.toString('utf8'), sax));
    else if (path.startsWith('ppt/media/')) assets.set(path, data);
  }
  const pres = trees.get('ppt/presentation.xml'),
    types = trees.get('[Content_Types].xml');
  if (
    !pres ||
    !types ||
    descendants(types, 'Override').some((n) => /macroEnabled|vba/i.test(n.attrs.ContentType))
  )
    throw new Error('PETROS_M2_ARCHIVE_INVALID');
  const size = first(pres, 'sldSz'),
    W = num(size, 'cx'),
    H = num(size, 'cy');
  if (W <= 0 || H <= 0 || W > 100000000 || H > 100000000)
    throw new Error('PETROS_M2_SLIDE_DIMENSIONS');
  const relationships = (part) => {
    const directory = part.slice(0, part.lastIndexOf('/')),
      base = part.slice(part.lastIndexOf('/') + 1);
    return new Map(
      descendants(trees.get(`${directory}/_rels/${base}.rels`), 'Relationship').map((r) => {
        if (r.attrs.TargetMode === 'External')
          return [r.attrs.Id, { external: true, type: r.attrs.Type }];
        const target = require('node:path').posix.normalize(`${directory}/${r.attrs.Target}`);
        if (!target.startsWith('ppt/') || !paths.has(target))
          throw new Error('PETROS_M2_RELATIONSHIP_INVALID');
        return [r.attrs.Id, { target, type: r.attrs.Type }];
      }),
    );
  };
  const rels = relationships('ppt/presentation.xml'),
    slideIds = descendants(pres, 'sldId');
  if (!slideIds.length || slideIds.length > 30) throw new Error('PETROS_DOCUMENT_LIMIT');
  const result = evidence('pptx', buffer);
  result.slideCount = slideIds.length;
  let chars = 0;
  for (let index = 0; index < slideIds.length; index++) {
    const number = index + 1,
      rel = rels.get(slideIds[index].attrs['r:id']);
    if (!rel || rel.external) throw new Error('PETROS_M2_RELATIONSHIP_INVALID');
    const part = rel.target,
      slide = trees.get(part),
      sr = relationships(part),
      warnings = [],
      svg = [];
    let text = '';
    const spans = [];
    if (!slide || slide.name !== 'sld') throw new Error('PETROS_M2_ARCHIVE_INVALID');
    const hidden = slide.attrs.show === '0',
      channel = hidden ? 'hidden' : 'visible';
    if (hidden) warnings.push('Hidden slide content is excluded from teaching context.');
    const loc = (id, region) => ({ kind: 'slide', slide: number, shapeId: id, region });
    const add = (id, payload, region, t = '', ws = [], ch = channel) => {
      if (t.length > 16000) throw new Error('PETROS_DOCUMENT_LIMIT');
      const el = {
        key: `s${number}.${id}`,
        channel: ch,
        locator: loc(id, region),
        payload,
        text: t,
        warnings: ws,
      };
      result.elements.push(el);
      return el;
    };
    const registry = (id) => {
      if (result.shapeRegistry.some((s) => s.slide === number && s.shapeId === id))
        throw new Error('PETROS_M2_SHAPE_ID_INVALID');
      result.shapeRegistry.push({ slide: number, shapeId: id });
    };
    const layoutRel = [...sr.values()].find((r) => r.type?.endsWith('/slideLayout'));
    const layout = layoutRel?.target ? trees.get(layoutRel.target) : null;
    const masterRel = layoutRel?.target
      ? [...relationships(layoutRel.target).values()].find((r) => r.type?.endsWith('/slideMaster'))
      : null;
    const master = masterRel?.target ? trees.get(masterRel.target) : null;
    const inherited = (tree, ph) =>
      descendants(tree, 'sp').find((s) => {
        const p = first(s, 'ph');
        return (
          p &&
          (p.attrs.idx ?? '0') === (ph.attrs.idx ?? '0') &&
          (p.attrs.type ?? 'body') === (ph.attrs.type ?? 'body')
        );
      });
    const geometry = (n) => {
      const ph = first(n, 'ph');
      const tr =
          first(n, 'xfrm') ||
          (ph
            ? first(inherited(layout, ph), 'xfrm') || first(inherited(master, ph), 'xfrm')
            : null),
        o = child(tr, 'off'),
        e = child(tr, 'ext');
      return {
        x: num(o, 'x'),
        y: num(o, 'y'),
        w: num(e, 'cx'),
        h: num(e, 'cy'),
        rot: num(tr, 'rot'),
        region: boundedRegion(num(o, 'x'), num(o, 'y'), num(e, 'cx'), num(e, 'cy'), W, H),
      };
    };
    const shapeNodes = [],
      connectors = [];
    const tree = first(slide, 'spTree');
    for (const shape of tree?.children || []) {
      if (!['sp', 'pic', 'graphicFrame', 'cxnSp', 'grpSp'].includes(shape.name)) continue;
      const identity = first(shape, 'cNvPr'),
        id = `shape.${identity?.attrs.id}`;
      if (!/^shape\.\d+$/.test(id)) throw new Error('PETROS_M2_SHAPE_ID_INVALID');
      registry(id);
      const g = geometry(shape);
      const x = (g.x / W) * 1280,
        y = (g.y / H) * 720,
        w = (g.w / W) * 1280,
        h = (g.h / H) * 720;
      const ph = first(shape, 'ph'),
        paragraphs = descendants(shape, 'p')
          .filter((p) => p.uri?.includes('drawingml'))
          .map((p) => ({
            text: descendants(p, 't')
              .map((t) => t.text)
              .join(''),
            level: num(child(p, 'pPr'), 'lvl'),
            bullet: !!first(p, 'buChar') || !!first(p, 'buAutoNum'),
          }))
          .filter((p) => p.text);
      const t = clean(paragraphs.map((p) => p.text).join('\n'));
      if (t) {
        const start = text.length;
        text += t + '\n';
        spans.push({
          text: t,
          start,
          end: start + t.length,
          font: 'OOXML native runs',
          size: num(first(shape, 'rPr'), 'sz', 1800) / 100,
          bold: first(shape, 'rPr')?.attrs.b === '1',
          region: { x: g.x, y: g.y, width: g.w, height: g.h },
        });
      }
      if (g.rot) warnings.push('Rotated shape preview and geometry require review.');
      if (shape.name === 'grpSp') {
        add(
          id,
          {
            kind: 'unresolved',
            original: t || null,
            reason: 'Grouped transforms are unsupported; source content requires review.',
          },
          null,
          t,
          ['Grouped shape positions were not invented.'],
        );
        continue;
      }
      if (shape.name === 'cxnSp') {
        const from = first(shape, 'stCxn')?.attrs.id,
          to = first(shape, 'endCxn')?.attrs.id;
        const head = first(shape, 'headEnd')?.attrs.type,
          tail = first(shape, 'tailEnd')?.attrs.type;
        connectors.push({
          id,
          from: from ? `shape.${from}` : null,
          to: to ? `shape.${to}` : null,
          head,
          tail,
          locator: loc(id, g.region),
        });
        svg.push(
          `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y + h}" stroke="#47667a" stroke-width="2" ${tail && tail !== 'none' ? 'marker-end="url(#arrow)"' : ''} ${head && head !== 'none' ? 'marker-start="url(#arrow)"' : ''}/>`,
        );
        continue;
      }
      if (shape.name === 'pic') {
        const img = sr.get(first(shape, 'blip')?.attrs['r:embed']);
        let note = 'Embedded image retained; labels and relationships need OCR/vision.',
          sourceImage;
        if (img?.target && assets.has(img.target)) {
          const bytes = assets.get(img.target);
          const ext = img.target.split('.').pop().toLowerCase();
          if (['png', 'jpg', 'jpeg'].includes(ext) && bytes.length < 1024 * 1024) {
            if (
              ext === 'png' &&
              (bytes.length < 24 || bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 16000000)
            )
              throw new Error('PETROS_DOCUMENT_LIMIT');
            svg.push(
              `<image x="${x}" y="${y}" width="${w}" height="${h}" href="data:image/${ext === 'png' ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}"/>`,
            );
            if (!first(shape, 'srcRect') && !g.rot)
              sourceImage = {
                data: bytes.toString('base64'),
                format: ext === 'png' ? 'png' : 'jpeg',
                hash: hash(bytes),
              };
          } else
            note = 'Image format or size unsupported in native preview; visual review required.';
        } else note = 'External or missing image relationship is never fetched.';
        const element = add(
          id,
          { kind: 'figure', ...visual(), unsupportedRegions: g.region ? [g.region] : [] },
          g.region,
          '',
          [note],
        );
        if (sourceImage) element.sourceImage = sourceImage;
        continue;
      }
      const table = first(shape, 'tbl');
      if (table) {
        const rows = table.children.filter((c) => c.name === 'tr'),
          cols = first(table, 'tblGrid')?.children || [],
          cells = [];
        if (rows.length > 100 || cols.length > 32 || !rows.length || !cols.length)
          throw new Error('PETROS_DOCUMENT_LIMIT');
        let yy = g.y;
        rows.forEach((row, ri) => {
          let xx = g.x;
          const rh = num(row, 'h');
          row.children
            .filter((c) => c.name === 'tc')
            .forEach((c, ci) => {
              const cw = num(cols[ci], 'w'),
                v = value(c, 't');
              if (c.attrs.hMerge !== '1' && c.attrs.vMerge !== '1')
                cells.push({
                  id: `cell.${ri}.${ci}`,
                  row: `row.${ri}`,
                  column: `col.${ci}`,
                  rowSpan: num(c, 'rowSpan', 1),
                  columnSpan: num(c, 'gridSpan', 1),
                  header: ri === 0 && first(table, 'tblPr')?.attrs.firstRow === '1',
                  value: v,
                  unit: null,
                  unresolved: false,
                  region: boundedRegion(xx, yy, cw, rh, W, H),
                });
              svg.push(
                `<rect x="${(xx / W) * 1280}" y="${(yy / H) * 720}" width="${(cw / W) * 1280}" height="${(rh / H) * 720}" fill="${ri ? 'white' : '#e9eff4'}" stroke="#b9c5cf"/><text x="${(xx / W) * 1280 + 8}" y="${(yy / H) * 720 + 26}" font-size="17">${esc(v)}</text>`,
              );
              xx += cw;
            });
          yy += rh;
        });
        add(
          id,
          {
            kind: 'table',
            caption: null,
            rows: rows.map((_, i) => `row.${i}`),
            columns: cols.map((_, i) => `col.${i}`),
            cells,
          },
          g.region,
          t,
        );
        continue;
      }
      const chart = first(shape, 'chart');
      if (chart) {
        const cr = sr.get(chart.attrs['r:id']),
          native = cr?.target ? trees.get(cr.target) : null;
        const original = native
          ? descendants(native, 'v')
              .map((v) => v.text)
              .join(' | ')
          : null;
        const plot = first(native, 'plotArea'),
          simple = plot?.children.find((c) => ['barChart', 'lineChart'].includes(c.name));
        const axes =
          plot?.children
            .filter((c) => ['catAx', 'valAx'].includes(c.name))
            .map((a, i) => ({
              id: `axis.${i}`,
              label: value(first(a, 'title'), 't'),
              unit: null,
              region: null,
            })) || [];
        const series = descendants(simple, 'ser').map((s, si) => {
          const categories = new Map(
            descendants(first(s, 'cat'), 'pt').map((p) => [p.attrs.idx, value(p, 'v')]),
          );
          const points = descendants(first(s, 'val'), 'pt').map((p) => ({
            id: `series.${si}.point.${p.attrs.idx}`,
            category: categories.get(p.attrs.idx) || '',
            value: value(p, 'v'),
          }));
          return {
            id: `series.${si}`,
            name: value(first(s, 'tx'), 'v') || value(first(s, 'tx'), 't'),
            points,
          };
        });
        if (
          simple &&
          axes.length &&
          axes.length <= 4 &&
          series.length &&
          series.length <= 8 &&
          series.every(
            (s) =>
              s.points.length <= 200 && s.points.every((p) => p.category && p.value.length <= 100),
          )
        ) {
          add(
            id,
            {
              kind: 'chart',
              ...visual(),
              axes,
              series,
              unsupportedRegions: g.region ? [g.region] : [],
            },
            g.region,
            original?.slice(0, 16000) || '',
            [
              'Native cached series/categories retained. Axis geometry and visual chart reconstruction are unsupported; values are not approved for computation.',
            ],
          );
        } else
          add(
            id,
            {
              kind: 'unresolved',
              original: original?.slice(0, 16000) || null,
              reason: 'Native chart cache retained; this chart structure is unsupported.',
            },
            g.region,
            original?.slice(0, 16000) || '',
            ['Advanced chart structure not admitted.'],
          );
        continue;
      }
      if (
        first(shape, 'graphicData') ||
        first(shape, 'oleObj') ||
        first(shape, 'videoFile') ||
        first(shape, 'audioFile')
      ) {
        add(
          id,
          {
            kind: 'unresolved',
            original: t || null,
            reason: 'Unsupported graphic, SmartArt, embedded object or media.',
          },
          g.region,
          t,
          ['No embedded object or media was executed.'],
        );
        continue;
      }
      const preset = first(shape, 'prstGeom')?.attrs.prst;
      const label = t.slice(0, 500);
      if (g.region && preset && !ph)
        shapeNodes.push({
          id,
          label,
          shape: preset === 'ellipse' ? 'ellipse' : preset === 'rect' ? 'box' : 'unknown',
          region: g.region,
        });
      if (preset && !ph)
        svg.push(
          `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#edf3f7" stroke="#54758b" rx="${preset === 'ellipse' ? 30 : 5}"/>`,
        );
      paragraphs.forEach((p, i) =>
        svg.push(
          `<text x="${x + 8}" y="${y + 26 + i * 27}" font-size="${ph?.attrs.type === 'title' || ph?.attrs.type === 'ctrTitle' ? 30 : 19}">${esc(p.text)}</text>`,
        ),
      );
      if (t) {
        const isTitle = ['title', 'ctrTitle'].includes(ph?.attrs.type);
        const payload = isTitle
          ? { kind: 'heading', text: t, level: 1 }
          : paragraphs.some((p) => p.bullet)
            ? {
                kind: 'list',
                ordered: !!first(shape, 'buAutoNum'),
                items: paragraphs.map((p, i) => ({
                  id: `item.${i + 1}`,
                  text: p.text,
                  level: p.level,
                })),
              }
            : classify(t, [{ font: first(shape, 'latin')?.attrs.typeface || '', size: 18 }], 18);
        const element = add(
          id,
          payload,
          g.region,
          t,
          g.rot ? ['Rotated geometry requires review.'] : [],
        );
        element.runs = descendants(shape, 'p')
          .filter((p) => p.uri?.includes('drawingml'))
          .flatMap((p, paragraph) =>
            p.children
              .filter((r) => ['r', 'fld', 'br'].includes(r.name))
              .map((r, ri) => {
                const style = child(r, 'rPr');
                return {
                  id: `paragraph.${paragraph}.run.${ri}`,
                  paragraph,
                  text: r.name === 'br' ? '\n' : value(r, 't'),
                  font: first(style, 'latin')?.attrs.typeface ?? null,
                  size: style?.attrs.sz ? num(style, 'sz') / 100 : null,
                  bold: style?.attrs.b ? style.attrs.b === '1' : null,
                  italic: style?.attrs.i ? style.attrs.i === '1' : null,
                };
              }),
          );
      } else
        add(
          id,
          {
            kind: 'unresolved',
            original: null,
            reason: 'Native shape has no textual label; decorative or semantic role is unknown.',
          },
          g.region,
        );
    }
    if (connectors.length) {
      const relations = [],
        unsupported = [];
      for (const c of connectors) {
        const source = shapeNodes.find((n) => n.id === c.from),
          target = shapeNodes.find((n) => n.id === c.to);
        if (source && target) {
          const reverse = c.head && c.head !== 'none' && (!c.tail || c.tail === 'none');
          relations.push({
            id: c.id,
            from: reverse ? target.id : source.id,
            to: reverse ? source.id : target.id,
            kind:
              (c.head && c.head !== 'none') || (c.tail && c.tail !== 'none') ? 'arrow' : 'connects',
            assertion: 'visual_only',
            locator: c.locator,
          });
          if (c.head && c.head !== 'none' && c.tail && c.tail !== 'none')
            relations.push({
              id: `${c.id}.reverse`,
              from: target.id,
              to: source.id,
              kind: 'arrow',
              assertion: 'visual_only',
              locator: c.locator,
            });
        } else if (c.locator.region) unsupported.push(c.locator.region);
      }
      const id = 'diagram.native';
      registry(id);
      add(
        id,
        {
          kind: 'diagram',
          ...visual(),
          nodes: shapeNodes,
          relationships: relations,
          unsupportedRegions: unsupported.slice(0, 32),
        },
        null,
        '',
        unsupported.length
          ? ['Unattached connectors have no inferred endpoints.']
          : ['Native arrows express visible direction only; causation is not inferred.'],
      );
    }
    for (const r of sr.values()) {
      if (r.external) warnings.push('External relationship was not fetched.');
      if (r.type?.endsWith('/notesSlide') && r.target) {
        const notes = trees.get(r.target);
        for (const s of descendants(notes, 'sp')) {
          const ph = first(s, 'ph');
          if (ph?.attrs.type !== 'body') continue;
          const t = value(s, 't');
          if (!t) continue;
          const id = `notes.${first(s, 'cNvPr')?.attrs.id}`;
          registry(id);
          add(
            id,
            { kind: 'paragraph', text: t },
            null,
            t,
            ['Speaker notes are not visible slide content.'],
            'notes',
          );
        }
      }
    }
    if (first(slide, 'timing') || first(slide, 'transition'))
      warnings.push(
        'Animations/transitions are unsupported; only static native content is extracted.',
      );
    chars += text.length;
    if (chars > 2000000) throw new Error('PETROS_DOCUMENT_LIMIT');
    const output = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto-start-reverse"><path d="M0 0L6 3L0 6" fill="#47667a"/></marker></defs><rect width="1280" height="720" fill="white"/>${svg.join('')}</svg>`;
    if (output.length > 2000000) throw new Error('PETROS_DOCUMENT_LIMIT');
    result.surfaces.push({
      number,
      sourceWidth: W,
      sourceHeight: H,
      coordinateSystem: 'ooxml_top_left_emu',
      nativeId: slideIds[index].attrs.id,
      text,
      offsetEncoding: 'UTF-16',
      spans,
      transform: { scaleX: 1280 / W, scaleY: 720 / H, offsetX: 0, offsetY: 0 },
      preview: {
        kind: 'native_svg',
        data: output,
        width: 1280,
        height: 720,
        fidelity: 'reconstruction',
      },
      warnings: [
        ...new Set(warnings),
        'Native preview is a reconstruction, not an original Office render.',
      ].slice(0, 32),
    });
    emit({ progress: number });
  }
  return result;
}
module.exports = { extractPdf, canvasFactory };
if (require.main === module) {
  console.log = console.warn = console.error = () => {};
  setTimeout(() => process.exit(124), 20000).unref();
  (async () => {
    const chunks = [];
    let size = 0;
    for await (const c of process.stdin) {
      if ((size += c.length) > 20 * 1024 * 1024) throw new Error('PETROS_DOCUMENT_LIMIT');
      chunks.push(c);
    }
    emit({ result: await extractPptx(Buffer.concat(chunks), JSON.parse(process.argv[4])) });
  })().catch((error) => {
    emit({
      error: /^PETROS_(DOCUMENT_LIMIT|M2_[A-Z_]+)$/.test(error.message)
        ? error.message
        : 'PETROS_M2_ARCHIVE_INVALID',
    });
    process.exitCode = 1;
  });
}
