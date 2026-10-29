'use strict';
const { pathToFileURL } = require('node:url');

function decode(buffer, limits) {
  let encoding = 'UTF-8', bomBytes = 0;
  if (buffer.subarray(0,3).equals(Buffer.from([0xef,0xbb,0xbf]))) bomBytes = 3;
  else if (buffer.subarray(0,2).equals(Buffer.from([0xff,0xfe]))) { encoding = 'UTF-16LE'; bomBytes = 2; }
  else if (buffer.subarray(0,2).equals(Buffer.from([0xfe,0xff]))) { encoding = 'UTF-16BE'; bomBytes = 2; }
  if (encoding !== 'UTF-8' && (buffer.length - bomBytes) % 2) throw new Error('PETROS_M2_ENCODING_INVALID');
  let text;
  try { text = new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(buffer.subarray(bomBytes)); }
  catch { throw new Error('PETROS_M2_ENCODING_INVALID'); }
  if (text.length > limits.characters || /[\x00-\x08\x0b\x0e-\x1f\x7f]/.test(text)) throw new Error('PETROS_M2_TEXT_INVALID');
  const bytes = new Int32Array(text.length + 1).fill(-1), lines = [];
  let offset = bomBytes, i = 0;
  bytes[0] = offset;
  for (const c of text) { offset += encoding === 'UTF-8' ? Buffer.byteLength(c) : c.length * 2; i += c.length; bytes[i] = offset; }
  let begin = 0; const endings = new Set();
  for (let at = 0; at < text.length; at++) {
    if (text[at] !== '\r' && text[at] !== '\n') continue;
    let ending = text[at];
    if (ending === '\r' && text[at+1] === '\n') ending += text[++at];
    const end = at + 1 - ending.length;
    lines.push({ start: begin, end, ending }); endings.add(ending); begin = at + 1;
  }
  lines.push({ start: begin, end: text.length, ending: '' });
  if (lines.length > limits.lines || lines.some(l => l.end - l.start > limits.lineLength)) throw new Error('PETROS_DOCUMENT_LIMIT');
  const newline = endings.size > 1 ? 'mixed' : endings.has('\r\n') ? 'CRLF' : endings.has('\n') ? 'LF' : endings.has('\r') ? 'CR' : 'none';
  const position = at => {
    let low = 0, high = lines.length;
    while (low + 1 < high) { const mid = (low + high) >> 1; if (lines[mid].start <= at) low = mid; else high = mid; }
    return { line: low + 1, column: at - lines[low].start + 1 };
  };
  return { text, bytes, lines, newline, encoding, bomBytes, position };
}

exports.extract = async ({e, buffer, modules, limits, metrics}) => {
  const began=performance.now();
  const d = decode(buffer, limits), {text,lines} = d;
  metrics.validationMs=performance.now()-began;metrics.parseMs=0;const structuralStart=performance.now();
  e.nativeDocument = { encoding: d.encoding, newline: d.newline, bomBytes: d.bomBytes, byteLength: buffer.length,
    text, parts: [], policy: 'Strict BOM-declared UTF-16 or UTF-8; no lossy decoding. Original newlines and UTF-16 offsets retained. Code and links are inert.' };
  function locator(start, end, id, nodeType, ordinal = 0, parent = null) {
    if (start < 0 || end < start || end > text.length || d.bytes[start] < 0 || d.bytes[end] < 0) throw new Error('PETROS_M2_SPAN_INVALID');
    const loc = { kind: e.format, version: 'petros.native-locator.v1', sourceHash: e.originalHash,
      encoding: d.encoding, offsetEncoding: 'UTF-16', byteSpan: {start:d.bytes[start],end:d.bytes[end]},
      textSpan:{start,end}, start:d.position(start), end:d.position(end), newline:d.newline, nodeId:id,
      ...(e.format === 'markdown' ? {nodeType, blockOrdinal:ordinal,parentNodeId:parent,parserVersion:e.parserVersion} : {}) };
    e.nativeLocators.push(loc); return loc;
  }
  const add = (key, loc, payload, native, warnings = [], parentKey = null) => {
    const value = payload.text ?? payload.original ?? (payload.kind === 'list' ? payload.items.map(x=>x.text).join('\n') : payload.kind === 'table' ? payload.cells.map(x=>x.value).join('\n') : '');
    if (value.length > 16000) throw new Error('PETROS_DOCUMENT_LIMIT');
    e.elements.push({ key, channel:'visible', locator:loc, payload, text:value, native, warnings, parentKey });
    if (e.elements.length > limits.elements) throw new Error('PETROS_DOCUMENT_LIMIT');
  };
  if (e.format === 'txt') {
    let at = 0, ordinal = 0;
    while (at < lines.length) {
      const first = lines[at];
      if (!text.slice(first.start, first.end).trim()) { at++; continue; }
      let last = at;
      const heading = /^#{1,6} /.test(text.slice(first.start,first.end));
      if (!heading) while (last + 1 < lines.length && text.slice(lines[last+1].start,lines[last+1].end).trim() &&
        !/^#{1,6} /.test(text.slice(lines[last+1].start,lines[last+1].end))) last++;
      const original = text.slice(first.start,lines[last].end), key = `txt.block.${ordinal++}`;
      if (original.length > 16000) throw new Error('PETROS_DOCUMENT_LIMIT');
      const list = original.split(/\r\n|\r|\n/);
      const itemPattern = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/;
      const listLike = list.length <= 100 && list.every(l=>itemPattern.test(l));
      const payload = heading ? {kind:'heading',text:original,level:Math.min(6,original.indexOf(' '))} : listLike ?
        {kind:'list',ordered:list.every(l=>/^\s*\d+[.)]/.test(l)),items:list.map((l,j)=>({id:`item.${j}`,text:l,level:0}))} : {kind:'paragraph',text:original};
      add(key,locator(first.start,lines[last].end,key,'paragraph'),payload,
        {version:'petros.native-metadata.v1',nodeType:heading?'explicit_heading_marker':listLike?'text_list_marker':'paragraph',original},
        listLike ? ['Text list markers preserved; no native numbering definition exists.'] : []);
      at = last + 1;
    }
    metrics.structuralMs=performance.now()-structuralStart;return;
  }
  const {fromMarkdown} = await import(pathToFileURL(modules.markdown).href);
  const {gfm} = await import(pathToFileURL(modules.gfm).href);
  const {gfmFromMarkdown} = await import(pathToFileURL(modules.mdastGfm).href);
  // Cheap preflight bounds hostile container prefixes before parser allocation. Parsing itself is CommonMark/GFM.
  for (const l of lines) {
    const raw = text.slice(l.start,l.end);
    if (/^(?:\s*>){33}/.test(raw) || /^(?: {4}){33}\S/.test(raw)) throw new Error('PETROS_DOCUMENT_LIMIT');
  }
  const parseStart=performance.now();
  const tree = fromMarkdown(text,{extensions:[gfm()],mdastExtensions:[gfmFromMarkdown()]});
  metrics.parseMs=performance.now()-parseStart;const reconstructionStart=performance.now();
  let count = 0, blockOrdinal = 0, linksCount = 0;
  const definitions = new Map();
  function check(n, depth) {
    if (++count > limits.astNodes || depth > limits.astDepth) throw new Error('PETROS_DOCUMENT_LIMIT');
    if (n.type === 'definition' && !definitions.has(n.identifier)) definitions.set(n.identifier,n);
    if (['link','image','linkReference','imageReference'].includes(n.type) && ++linksCount > 100) throw new Error('PETROS_DOCUMENT_LIMIT');
    for (const child of n.children ?? []) check(child,depth+1);
  }
  check(tree,0);
  const literal = n => ['html','definition'].includes(n.type) ? '' : n.value ?? n.alt ?? (n.children ?? []).map(literal).join('');
  const safeURL = target => {
    let value; try { value = decodeURIComponent(target).replace(/[\x00-\x20]/g,''); } catch { return false; }
    return !/^(?:javascript|data|vbscript|file):/i.test(value) && !/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(value) && !/^\\|^\//.test(value) &&
      (!/^[a-z][a-z0-9+.-]*:/i.test(value) || /^(?:https?|mailto):/i.test(value));
  };
  const headingStack = [];
  function walk(n, parent = null, listLevel = 0) {
    if (!n.position) return;
    const {start,end} = n.position, original = text.slice(start.offset,end.offset);
    if (original.length > 16000 && n.type !== 'root') throw new Error('PETROS_DOCUMENT_LIMIT');
    parent = parent ?? headingStack.at(-1)?.key ?? null;
    const ordinal = blockOrdinal++, key = `md.${ordinal}.${n.type}`;
    const native = {version:'petros.native-metadata.v1',nodeType:n.type,original};
    const warnings = [], loc = locator(start.offset,end.offset,key,n.type,ordinal,parent);
    let payload;
    const inline = [], linkRecords = [];
    function inlines(node) {
      for (const child of node.children ?? []) {
        if (['emphasis','strong','inlineCode','delete','html','link','image','linkReference','imageReference','break'].includes(child.type)) {
          const a = child.position.start.offset, b = child.position.end.offset, id = `${key}.inline.${inline.length}`;
          const iloc = locator(a,b,id,child.type,ordinal,key);
          inline.push({type:child.type,original:text.slice(a,b),locator:iloc});
          if (child.type === 'html') warnings.push('Raw HTML preserved as inert source; HTML interpretation unsupported.');
          if (/^(?:link|image)/.test(child.type)) {
            const definition = definitions.get(child.identifier), target = child.url ?? definition?.url;
            if (target === undefined) warnings.push('Unresolved reference retained in original source.');
            else {
              const image = child.type.startsWith('image'), safe = safeURL(target);
              linkRecords.push({target,title:child.title ?? definition?.title ?? null,alt:child.alt ?? null,kind:image?'image':'link',status:safe?(image?'unavailable':'inert'):'unsafe',locator:iloc});
              if (!safe) warnings.push('Unsafe destination retained as inert text; access denied.');
              if (image) warnings.push('Image destination is not an authorized attachment; content unavailable and never fetched.');
            }
          }
        }
        inlines(child);
      }
    }
    if (['heading','paragraph','table'].includes(n.type)) inlines(n);
    if (inline.length > 200) throw new Error('PETROS_DOCUMENT_LIMIT');
    if (inline.length) native.inline = inline;
    if (linkRecords.length) native.links = linkRecords;
    if (n.type === 'heading') {
      while (headingStack.length && headingStack.at(-1).level >= n.depth) headingStack.pop();
      parent = headingStack.at(-1)?.key ?? null; loc.parentNodeId = parent;
      payload = {kind:'heading',text:literal(n) || original,level:n.depth}; headingStack.push({key,level:n.depth});
    } else if (n.type === 'paragraph') payload = {kind:'paragraph',text:literal(n) || original};
    else if (n.type === 'list') {
      if (listLevel > 8 || n.children.length > 100) throw new Error('PETROS_DOCUMENT_LIMIT');
      payload = {kind:'list',ordered:n.ordered,items:n.children.map((child,j)=>({id:`item.${j}`,text:child.children.filter(c=>c.type!=='list').map(literal).join('\n') || text.slice(child.position.start.offset,child.position.end.offset),level:listLevel}))};
    } else if (n.type === 'blockquote') { payload = {kind:'paragraph',text:literal(n) || original}; native.quote = true; }
    else if (n.type === 'code') {
      const codeLines = n.value.split('\n');
      if (codeLines.length > 500 || codeLines.some(l=>l.length>2000)) throw new Error('PETROS_DOCUMENT_LIMIT');
      const fenced = /^[ \t]*(?:`{3,}|~{3,})/.test(original), firstLine = start.line + (fenced?1:0);
      const language = /^[A-Za-z][A-Za-z0-9+#._-]{0,39}$/.test(n.lang??'') ? n.lang : null;
      const codeLocators = codeLines.map((_,j)=>{
        const l = lines[firstLine+j-1]; return locator(l.start,l.end,`${key}.line.${j}`,'code_line',ordinal,key);
      });
      native.fence = {language:n.lang??null,meta:n.meta??null,source:original,lines:codeLocators};
      if (n.lang && !language) warnings.push('Untrusted language tag unsupported; code remains inert.');
      if (fenced && !/(?:\r\n|\r|\n)[ \t]*(?:`{3,}|~{3,})[ \t]*$/.test(original)) warnings.push('Unclosed fence extends to end of source under CommonMark.');
      if(!n.value){warnings.push('Empty code block retained as inert syntax; no code text exists.');payload={kind:'unresolved',reason:'Empty code block; original fence/source retained.',original};}
      else payload = {kind:'code',language,original:n.value,lines:codeLines.map((value,j)=>({id:`line.${firstLine+j}`,number:firstLine+j,text:value,syntax:[]})),validity:'unvalidated'};
    } else if (n.type === 'table') {
      if (n.children.length > limits.rows || n.align.length > limits.columns) throw new Error('PETROS_DOCUMENT_LIMIT');
      const rows = n.children.map((_,j)=>`row.${j}`), columns = n.align.map((_,j)=>`col.${j}`), cells = [];
      native.cells = [];
      n.children.forEach((r,ri)=>r.children.forEach((c,ci)=>{
        const id=`cell.${ri}.${ci}`; cells.push({id,row:rows[ri],column:columns[ci],rowSpan:1,columnSpan:1,header:ri===0,value:literal(c),unit:null,unresolved:false,region:null});
        native.cells.push({id,locator:locator(c.position.start.offset,c.position.end.offset,`${key}.${id}`,'table_cell',ordinal,key)});
      }));
      if (cells.length > limits.cells) throw new Error('PETROS_DOCUMENT_LIMIT');
      native.tableAlignment = n.align;
      payload = {kind:'table',caption:null,rows,columns,cells};
    } else if (['html','thematicBreak','definition','footnoteDefinition'].includes(n.type)) {
      payload = {kind:'unresolved',reason:n.type==='html'?'Raw HTML is inert source; full HTML adapter deferred.':`Source syntax ${n.type} retained; no teaching interpretation.`,original};
      warnings.push(payload.reason);
    }
    if (payload) add(key,loc,payload,native,[...new Set(warnings)],parent ?? headingStack.at(-1)?.key ?? null);
    else { e.nativeLocators.pop(); }
    if (['root','list','listItem','blockquote','footnoteDefinition'].includes(n.type)) for (const c of n.children??[]) {
      if (n.type==='list' || n.type==='blockquote') walk(c,key,listLevel+(n.type==='list'?1:0));
      else walk(c,parent,listLevel);
    }
  }
  // Root isn't an admitted locator or unit.
  for (const n of tree.children) walk(n);
  metrics.structuralMs=performance.now()-reconstructionStart;
};
exports.decode = decode;
