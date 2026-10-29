'use strict';
const path = require('node:path').posix;
const NS = { 'http://schemas.openxmlformats.org/wordprocessingml/2006/main':'w',
  'http://schemas.openxmlformats.org/officeDocument/2006/math':'m',
  'http://schemas.openxmlformats.org/drawingml/2006/main':'a',
  'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing':'wp',
  'http://schemas.openxmlformats.org/drawingml/2006/picture':'pic',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships':'r',
  'http://schemas.microsoft.com/office/word/2010/wordml':'w14',
  'http://schemas.openxmlformats.org/package/2006/relationships':'rel',
  'http://schemas.openxmlformats.org/package/2006/content-types':'ct' };
const officeRel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const child = (n,t) => n?.children.find(c=>c.tag===t);
const children = (n,t) => n?.children.filter(c=>c.tag===t) ?? [];
const attr = (n,k) => n?.attrs[k];
const descendants = (n,t) => { const found=[]; function walk(c) { if(c.tag===t) found.push(c); c.children.forEach(walk); } if(n) walk(n); return found; };
const allText = n => n.text + n.children.map(allText).join('');
const bool = n => !!n && !['0','false','off'].includes(attr(n,'w:val'));
const int = (v, fallback=0) => /^\d+$/.test(v??'') ? Number(v) : fallback;

function archiveInventory(buffer, limits) {
  if (buffer.length<22 || buffer.readUInt32LE(0)!==0x04034b50) throw new Error('PETROS_M2_DOCX_INVALID');
  let end=-1;
  for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--) if(buffer.readUInt32LE(i)===0x06054b50 && i+22+buffer.readUInt16LE(i+20)===buffer.length) {end=i;break;}
  if(end<0 || buffer.readUInt16LE(end+4)!==0 || buffer.readUInt16LE(end+6)!==0) throw new Error('PETROS_M2_ARCHIVE_INVALID');
  const count=buffer.readUInt16LE(end+10), centralSize=buffer.readUInt32LE(end+12), start=buffer.readUInt32LE(end+16);
  if(count>limits.zipEntries || count!==buffer.readUInt16LE(end+8) || start+centralSize!==end) throw new Error('PETROS_DOCUMENT_LIMIT');
  const entries=new Map(); let offset=start,total=0;
  for(let i=0;i<count;i++) {
    if(offset+46>end || buffer.readUInt32LE(offset)!==0x02014b50) throw new Error('PETROS_M2_ARCHIVE_INVALID');
    const flags=buffer.readUInt16LE(offset+8),method=buffer.readUInt16LE(offset+10),compressed=buffer.readUInt32LE(offset+20),expanded=buffer.readUInt32LE(offset+24),
      nameLength=buffer.readUInt16LE(offset+28),extra=buffer.readUInt16LE(offset+30),comment=buffer.readUInt16LE(offset+32),local=buffer.readUInt32LE(offset+42);
    const raw=buffer.subarray(offset+46,offset+46+nameLength);
    if(offset+46+nameLength+extra+comment>end || /[^\x20-\x7e]/.test(raw.toString('latin1'))) throw new Error('PETROS_M2_ARCHIVE_INVALID');
    const name=raw.toString('ascii');
    if(!name || name.includes('\\') || name.includes('%') || name.startsWith('/') || name.split('/').some(s=>s==='..'||s==='.') || entries.has(name)) throw new Error('PETROS_M2_ARCHIVE_PATH');
    if(flags&1 || ![0,8].includes(method) || expanded>limits.entryBytes || expanded>Math.max(1,compressed)*limits.compressionRatio) throw new Error('PETROS_DOCUMENT_LIMIT');
    if(local+30>start || buffer.readUInt32LE(local)!==0x04034b50 || buffer.readUInt16LE(local+6)!==flags || buffer.readUInt16LE(local+8)!==method) throw new Error('PETROS_M2_ARCHIVE_INVALID');
    const localName=buffer.readUInt16LE(local+26),localExtra=buffer.readUInt16LE(local+28),dataStart=local+30+localName+localExtra;
    if(!buffer.subarray(local+30,local+30+localName).equals(raw) || dataStart+compressed>start) throw new Error('PETROS_M2_ARCHIVE_INVALID');
    total+=expanded; if(total>limits.expandedBytes) throw new Error('PETROS_DOCUMENT_LIMIT');
    if(/(?:vbaproject|\.exe$|\.dll$|\.bin$|embeddings\/|activex\/|\.docm$)/i.test(name)) throw new Error('PETROS_M2_ACTIVE_CONTENT');
    entries.set(name,{expanded,dataStart,end:dataStart+compressed}); offset+=46+nameLength+extra+comment;
  }
  if(offset!==end) throw new Error('PETROS_M2_ARCHIVE_INVALID');
  const ranges=[...entries.values()].sort((a,b)=>a.dataStart-b.dataStart);
  if(ranges.some((v,i)=>i && v.dataStart<ranges[i-1].end)) throw new Error('PETROS_M2_ARCHIVE_INVALID');
  return entries;
}

function xmlTree(xml,sax,limits) {
  if(/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('PETROS_M2_XML_ENTITY');
  const parser=sax.parser(true,{xmlns:true,trim:false,normalize:false}), stack=[]; let root,nodes=0;
  parser.onopentag=n=>{
    if(++nodes>limits.xmlNodes || stack.length>=limits.xmlDepth) throw new Error('PETROS_DOCUMENT_LIMIT');
    const tag=NS[n.uri]?`${NS[n.uri]}:${n.local}`:n.local, parent=stack.at(-1);
    const index=parent ? parent.children.filter(c=>c.tag===tag).length+1 : 1;
    const node={tag,attrs:{},children:[],text:'',start:parser.startTagPosition-1,end:0,
      path:`${parent?.path??''}/${n.local}[${index}]`};
    for(const a of Object.values(n.attributes)) node.attrs[NS[a.uri]?`${NS[a.uri]}:${a.local}`:a.local]=a.value;
    if(parent) parent.children.push(node); else {if(root) throw new Error('PETROS_M2_XML_INVALID');root=node;}
    stack.push(node);
  };
  parser.ontext=parser.oncdata=value=>{if(stack.length) stack.at(-1).text+=value;else if(value.trim()) throw new Error('PETROS_M2_XML_INVALID');};
  parser.onclosetag=()=>{stack.pop().end=parser.position;};
  parser.onerror=()=>{throw new Error('PETROS_M2_XML_INVALID');};
  try {parser.write(xml).close();} catch(error) {if(/^PETROS_/.test(error.message))throw error;throw new Error('PETROS_M2_XML_INVALID');}
  if(!root || stack.length) throw new Error('PETROS_M2_XML_INVALID'); return root;
}
function dimensions(bytes,mime) {
  if(mime==='image/png') {
    if(bytes.length<33 || !bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) || bytes.toString('ascii',12,16)!=='IHDR') throw new Error('PETROS_M2_MEDIA_INVALID');
    return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  }
  if(bytes.length<4 || bytes.readUInt16BE(0)!==0xffd8) throw new Error('PETROS_M2_MEDIA_INVALID');
  let at=2;
  while(at+4<=bytes.length) {
    if(bytes[at++]!==255) throw new Error('PETROS_M2_MEDIA_INVALID'); while(bytes[at]===255)at++;
    const marker=bytes[at++]; if(marker===0xda||marker===0xd9)break;
    const len=bytes.readUInt16BE(at); if(len<2||at+len>bytes.length)break;
    if([0xc0,0xc1,0xc2].includes(marker) && len>=8) return {height:bytes.readUInt16BE(at+3),width:bytes.readUInt16BE(at+5)};
    at+=len;
  }
  throw new Error('PETROS_M2_MEDIA_INVALID');
}

exports.extract=async ({e,buffer,modules,limits,hash,metrics})=>{
  const began=performance.now();let xmlParseMs=0;
  const inventory=archiveInventory(buffer,limits), JSZip=require(modules.zip), sax=require(modules.sax);
  const zip=await JSZip.loadAsync(buffer,{checkCRC32:true});
  if(Object.keys(zip.files).length!==inventory.size)throw new Error('PETROS_M2_ARCHIVE_INVALID');
  const parts=new Map(), trees=new Map(), types=new Map(), defaults=new Map(), relationships=new Map(), media=new Map();
  for(const [name,info] of inventory) {
    const file=zip.file(name); if(name.endsWith('/'))continue;
    if(!file)throw new Error('PETROS_M2_ARCHIVE_INVALID');
    const bytes=await file.async('nodebuffer'); if(bytes.length!==info.expanded)throw new Error('PETROS_M2_ARCHIVE_INVALID');
    if(bytes.subarray(0,2).toString('ascii')==='MZ'||bytes.subarray(0,4).equals(Buffer.from('7f454c46','hex'))||['cffaedfe','feedfacf','cafebabe'].includes(bytes.subarray(0,4).toString('hex')))throw new Error('PETROS_M2_ACTIVE_CONTENT');
    parts.set(name,bytes);
    if(name.endsWith('.xml')||name.endsWith('.rels')) {
      let xml; try{xml=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw new Error('PETROS_M2_XML_INVALID');}
      if(!/^\s*(?:<\?xml[^?]*\?>\s*)?</.test(xml))throw new Error('PETROS_M2_XML_INVALID');
      const parseStart=performance.now();trees.set(name,xmlTree(xml,sax,limits));xmlParseMs+=performance.now()-parseStart;
    }
  }
  const ct=trees.get('[Content_Types].xml'); if(ct?.tag!=='ct:Types')throw new Error('PETROS_M2_DOCX_INVALID');
  for(const n of ct.children) {
    const mime=attr(n,'ContentType'); if(!mime || /macroEnabled|vba|oleObject|activeX|executable/i.test(mime))throw new Error('PETROS_M2_ACTIVE_CONTENT');
    if(n.tag==='ct:Override') {const name=attr(n,'PartName')?.slice(1);if(types.has(name))throw new Error('PETROS_M2_DOCX_INVALID');types.set(name,mime);}
    else if(n.tag==='ct:Default') {const ext=attr(n,'Extension');if(defaults.has(ext))throw new Error('PETROS_M2_DOCX_INVALID');defaults.set(ext,mime);}
    else throw new Error('PETROS_M2_DOCX_INVALID');
  }
  for(const name of parts.keys()) {
    if(name==='[Content_Types].xml')continue;
    const mime=types.get(name)??defaults.get(name.split('.').at(-1));
    if(!mime || !/^(?:application\/(?:vnd\.openxmlformats-(?:officedocument|package)\.[a-zA-Z0-9.+-]+|xml)|image\/(?:png|jpeg))$/.test(mime)) throw new Error('PETROS_M2_CONTENT_TYPE');
    if((mime==='application/xml'||mime.endsWith('+xml'))&&!trees.has(name)){
      let xml;try{xml=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(parts.get(name));}catch{throw new Error('PETROS_M2_XML_INVALID');}
      const parseStart=performance.now();trees.set(name,xmlTree(xml,sax,limits));xmlParseMs+=performance.now()-parseStart;
    }
  }
  let relCount=0;
  for(const [name,tree] of trees) if(name.endsWith('.rels')) {
    if(tree.tag!=='rel:Relationships')throw new Error('PETROS_M2_DOCX_INVALID');
    const owner=name==='_rels/.rels'?'':name.replace(/(?:^|\/)\_rels\//,'/').replace(/\.rels$/,'').replace(/^\//,'');
    const list=new Map();
    for(const r of tree.children) {
      const id=attr(r,'Id'),target=attr(r,'Target'),type=attr(r,'Type'),external=attr(r,'TargetMode')==='External';
      if(r.tag!=='rel:Relationship'||!id||!target||!type||list.has(id)||++relCount>1000)throw new Error('PETROS_M2_RELATIONSHIP_INVALID');
      if(/oleObject|package$|vbaProject|activeX/.test(type))throw new Error('PETROS_M2_ACTIVE_CONTENT');
      if(external && type!==officeRel+'hyperlink')throw new Error('PETROS_M2_EXTERNAL_RELATIONSHIP');
      let resolved=target;
      if(!external) {
        if(target.includes('\\')||target.includes('%')||target.includes(':')||target.startsWith('/'))throw new Error('PETROS_M2_ARCHIVE_PATH');
        resolved=path.normalize(path.join(path.dirname(owner),target));
        if(resolved.startsWith('../')||!parts.has(resolved))throw new Error('PETROS_M2_RELATIONSHIP_INVALID');
      }
      list.set(id,{id,target,resolved,type,external});
    }
    relationships.set(owner,list);
  }
  const rootRelationships=relationships.get(''), main=[...(rootRelationships?.values()??[])].filter(r=>r.type===officeRel+'officeDocument');
  if(main.length!==1||main[0].external)throw new Error('PETROS_M2_DOCX_INVALID');
  const mainPart=main[0].resolved;
  if(!/^word\/[A-Za-z0-9_.-]+\.xml$/.test(mainPart)||types.get(mainPart)!=='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')throw new Error('PETROS_M2_DOCX_INVALID');
  const doc=trees.get(mainPart),body=child(doc,'w:body'); if(doc?.tag!=='w:document'||!body)throw new Error('PETROS_M2_DOCX_INVALID');
  for(const [name,bytes]of parts)if(name.startsWith('word/media/')) {
    if(media.size>=limits.media)throw new Error('PETROS_DOCUMENT_LIMIT');
    const mime=types.get(name)??defaults.get(name.split('.').at(-1)), dims=dimensions(bytes,mime);
    if(!dims.width||!dims.height||dims.width>limits.imageDimension||dims.height>limits.imageDimension||dims.width*dims.height>limits.imagePixels)throw new Error('PETROS_DOCUMENT_LIMIT');
    const image=await require(modules.canvas).loadImage(bytes);if(image.width!==dims.width||image.height!==dims.height)throw new Error('PETROS_M2_MEDIA_INVALID');
    media.set(name,{bytes,mime,...dims,hash:hash(bytes)});
  }
  metrics.parseMs=xmlParseMs;metrics.validationMs=performance.now()-began-xmlParseMs;const structuralStart=performance.now();
  const related=(type)=>[...(relationships.get(mainPart)?.values()??[])].find(r=>r.type===officeRel+type);
  const styles=new Map(), numbering=new Map(),abstract=new Map(), counters=new Map();
  const stylePart=related('styles')?.resolved;
  for(const n of children(trees.get(stylePart),'w:style'))styles.set(attr(n,'w:styleId'),n);
  const numberingPart=related('numbering')?.resolved;
  for(const n of children(trees.get(numberingPart),'w:abstractNum'))abstract.set(attr(n,'w:abstractNumId'),n);
  for(const n of children(trees.get(numberingPart),'w:num'))numbering.set(attr(n,'w:numId'),n);
  let ordinal=0,paragraphCount=0,runCount=0,section=0,chars=0;
  const sourceParts=new Set([mainPart]);
  function loc(part,n,key,extra={}) {
    const l={kind:'docx',version:'petros.native-locator.v1',sourceHash:e.originalHash,part,partHash:hash(parts.get(part)),elementId:key,xmlSpan:{start:n.start,end:n.end},path:n.path,section:part===mainPart?section:0,offsetEncoding:'UTF-16',...extra};
    e.nativeLocators.push(l); return l;
  }
  function add(key,locator,payload,text,native,channel='visible',warnings=[],parentKey=null) {
    if(text.length>16000||e.elements.length>=limits.elements||(chars+=text.length)>limits.characters)throw new Error('PETROS_DOCUMENT_LIMIT');
    e.elements.push({key,locator,payload,text,native,channel,warnings:[...new Set(warnings)].slice(0,32),parentKey});
  }
  function styleLevel(id,seen=new Set()) {
    if(!id||seen.has(id)||seen.size>16)return null;seen.add(id);
    const s=styles.get(id), outline=attr(child(child(s,'w:pPr'),'w:outlineLvl'),'w:val'),name=attr(child(s,'w:name'),'w:val');
    if(outline!==undefined&&int(outline,9)<6)return int(outline)+1;
    if(/^(?:Heading|heading)\s*[1-6]$/.test(name??''))return Number(name.match(/[1-6]/)[0]);
    return styleLevel(attr(child(s,'w:basedOn'),'w:val'),seen);
  }
  function numberInfo(pPr,style) {
    const numPr=child(pPr,'w:numPr')??child(child(styles.get(style),'w:pPr'),'w:numPr');if(!numPr)return null;
    const id=attr(child(numPr,'w:numId'),'w:val'),level=int(attr(child(numPr,'w:ilvl'),'w:val'));
    if(id==='0')return null;
    const num=numbering.get(id),a=abstract.get(attr(child(num,'w:abstractNumId'),'w:val')),
      override=children(num,'w:lvlOverride').find(n=>int(attr(n,'w:ilvl'))===level),
      lvl=child(override,'w:lvl')??children(a,'w:lvl').find(n=>int(attr(n,'w:ilvl'))===level);
    if(!lvl||level>8)return {unresolved:true};
    if(child(lvl,'w:lvlRestart'))return {unresolved:true,reason:'Explicit numbering restart rules require structural review.'};
    const format=attr(child(lvl,'w:numFmt'),'w:val')??'unknown',template=attr(child(lvl,'w:lvlText'),'w:val')??'',
      start=int(attr(child(override,'w:startOverride'),'w:val')??attr(child(lvl,'w:start'),'w:val'),1),k=`${id}:${level}`;
    const restart=attr(child(lvl,'w:lvlRestart'),'w:val');
    const first=!counters.has(k),value=first?start:counters.get(k)+1;counters.set(k,value);
    for(const key of counters.keys())if(key.startsWith(id+':')&&Number(key.split(':')[1])>level&&restart!=='0')counters.delete(key);
    return {id,level,format,template,value,restart:first,unresolved:false};
  }
  const headingStack=[],listParents=new Map();
  function paragraph(part,p,channel='visible',parentKey=null,ancestry=[]) {
    if(++paragraphCount>limits.paragraphs)throw new Error('PETROS_DOCUMENT_LIMIT');
    const key=`docx.p.${ordinal++}`,pOrdinal=paragraphCount-1,pPr=child(p,'w:pPr'),style=attr(child(pPr,'w:pStyle'),'w:val'),
      outline=attr(child(pPr,'w:outlineLvl'),'w:val'),level=outline!==undefined&&int(outline,9)<6?int(outline)+1:styleLevel(style),
      chunks=new Map(),maths=[],drawings=[],links=[],features=[],bookmarks=[], warnings=[];
    const base={paragraphOrdinal:pOrdinal,...(attr(p,'w14:paraId')?{paragraphId:attr(p,'w14:paraId')}:{}),...(ancestry.length?{tableAncestry:ancestry}:{})};
    const addRun=(node,ch,raw,props)=>{
      if(!raw)return; if(++runCount>limits.runs)throw new Error('PETROS_DOCUMENT_LIMIT');
      const data=chunks.get(ch)??{text:'',runs:[]},start=data.text.length;data.text+=raw;
      data.runs.push({id:`${key}.run.${runCount}`,text:raw,start,end:data.text.length,bold:bool(child(props,'w:b')),italic:bool(child(props,'w:i')),
        script:['superscript','subscript'].includes(attr(child(props,'w:vertAlign'),'w:val'))?attr(child(props,'w:vertAlign'),'w:val'):'baseline',language:attr(child(props,'w:lang'),'w:val')??null,locator:loc(part,node,`${key}.run.${runCount}`,{...base,textSpan:{start,end:data.text.length}})});chunks.set(ch,data);
    };
    function inheritedProperties(styleId,seen=new Set()) {
      if(!styleId||seen.has(styleId)||seen.size>16)return [];
      seen.add(styleId);const styleNode=styles.get(styleId);
      return [...inheritedProperties(attr(child(styleNode,'w:basedOn'),'w:val'),seen),...(child(styleNode,'w:rPr')?.children??[])];
    }
    const defaultProps=child(child(child(trees.get(stylePart),'w:docDefaults'),'w:rPrDefault'),'w:rPr')?.children??[];
    function effectiveProperties(run) {
      const own=child(run,'w:rPr'),nodes=[...defaultProps,...inheritedProperties(style),...inheritedProperties(attr(child(own,'w:rStyle'),'w:val')),...(own?.children??[])];
      const map=new Map(nodes.map(n=>[n.tag,n]));return {children:[...map.values()]};
    }
    function walk(n,ch,props) {
      if(n.tag==='w:pPr'||n.tag==='w:rPr')return;
      if(n.tag==='w:del'||n.tag==='w:moveFrom')ch='deletions';
      if(n.tag==='w:ins'||n.tag==='w:moveTo')ch='insertions';
      if(n.tag==='w:r') {props=effectiveProperties(n);if(bool(child(props,'w:vanish'))||bool(child(props,'w:webHidden')))ch='hidden';}
      if(['w:t','w:delText'].includes(n.tag))addRun(n,ch,allText(n),props);
      else if(n.tag==='w:tab')addRun(n,ch,'\t',props);
      else if(n.tag==='w:br'||n.tag==='w:cr') {addRun(n,ch,'\n',props);if(attr(n,'w:type')==='page')features.push('Explicit page break retained; pagination not inferred.');}
      else if(n.tag==='m:oMath'){if(descendants(n,'w:vanish').some(bool)||bool(child(effectiveProperties(p),'w:vanish')))ch='hidden';maths.push({n,ch});return;}
      else if(n.tag==='w:drawing'){drawings.push({n,ch});return;}
      else if(n.tag==='w:hyperlink')links.push(n);
      else if(n.tag==='w:bookmarkStart')bookmarks.push(n);
      else if(['w:footnoteReference','w:endnoteReference','w:commentReference'].includes(n.tag))features.push(`${n.tag} id ${attr(n,'w:id')??'unknown'} retained as a source reference.`);
      else if(['w:instrText','w:fldChar','w:fldSimple','w:txbxContent','w:pict','w:object','w:sym'].includes(n.tag)) {features.push(`${n.tag} requires review; field/object/textbox interpretation unsupported.`);if(['w:instrText','w:txbxContent','w:pict','w:object'].includes(n.tag))return;}
      for(const c of n.children)walk(c,ch,props);
    }
    walk(p,channel,null);
    const num=numberInfo(pPr,style);
    if(num?.unresolved)warnings.push(num.reason??'Numbering definition unresolved; paragraph retained.');
    if(style==='Caption')warnings.push('Caption style retained; target association is not established.');
    if(style&&!styles.has(style))warnings.push('Custom or missing style has no established heading hierarchy.');
    if(chunks.has('insertions')||chunks.has('deletions'))warnings.push('Tracked revisions unresolved: only unchanged main text is visible; insertion/deletion channels excluded from semantic input.');
    if(child(pPr,'w:pPrChange'))warnings.push('Tracked paragraph properties require review.');
    if(!chunks.size&&!maths.length&&!drawings.length&&!features.length&&!bookmarks.length){if(child(pPr,'w:sectPr'))section++;return;}
    for(const [ch,data] of chunks) {
      const chKey=ch===channel?key:`${key}.${ch}`, l=loc(part,p,chKey,{...base,runIds:data.runs.map(r=>r.id),textSpan:{start:0,end:data.text.length}}),
        native={version:'petros.native-metadata.v1',nodeType:'paragraph',...(style?{style}:{}),runs:data.runs,section};
      const w=[...warnings,...features];
      if(ch!=='visible')w.push(`${ch} is a separate source channel; not visible teaching evidence.`);
      let parent=parentKey;
      if(level&&ch==='visible'&&!parent){while(headingStack.length&&headingStack.at(-1).level>=level)headingStack.pop();parent=headingStack.at(-1)?.key??null;headingStack.push({level,key:chKey});}
      else if(!parent&&ch==='visible')parent=headingStack.at(-1)?.key??null;
      let payload=level?{kind:'heading',text:data.text,level}:{kind:'paragraph',text:data.text};
      if(num&&!num.unresolved&&ch===channel){const {unresolved,...numbering}=num;native.numbering=numbering;
        if(!['bullet','decimal','lowerLetter','upperLetter','lowerRoman','upperRoman'].includes(num.format))w.push('Numbering format retained; displayed numbering requires review.');
        payload={kind:'list',ordered:num.format!=='bullet',items:[{id:`${chKey}.item`,text:data.text,level:num.level}]};
        if(num.level>0)parent=listParents.get(`${num.id}:${num.level-1}`)??parent;listParents.set(`${num.id}:${num.level}`,chKey);
      }
      if(links.length)native.links=links.map((n,j)=>{
        const id=attr(n,'r:id'),rel=relationships.get(part)?.get(id),target=rel?.target??('#'+(attr(n,'w:anchor')??''));
        if(id&&!rel)throw new Error('PETROS_M2_RELATIONSHIP_INVALID');
        const unsafe=/^(?:javascript|data|file|vbscript):/i.test(target.replace(/[\x00-\x20]/g,''));
        if(unsafe)w.push('Unsafe hyperlink is inert; access denied.');
        return {target,title:null,alt:null,kind:'link',status:unsafe?'unsafe':'inert',locator:loc(part,n,`${chKey}.link.${j}`,base)};
      });
      if(bookmarks.length)native.inline=bookmarks.map((n,j)=>({type:'bookmark',original:attr(n,'w:name')??'',locator:loc(part,n,`${chKey}.bookmark.${j}`,base)}));
      add(chKey,l,payload,data.text,native,ch,w,parent);
    }
    if(!chunks.size&&features.length) {const l=loc(part,p,key,base);add(key,l,{kind:'unresolved',reason:features.join(' ').slice(0,500),original:null},'',{version:'petros.native-metadata.v1',nodeType:'unsupported_paragraph'},channel,features,parentKey);}
    for(const [j,{n,ch}]of maths.entries()) {
      const mk=`${key}.math.${j}`,xml=parts.get(part).toString('utf8').slice(n.start,n.end);
      const l=loc(part,n,mk,{...base,objectId:mk});
      if(xml.length>16000)throw new Error('PETROS_DOCUMENT_LIMIT');
      const payload=xml.length<=2000?{kind:'equation',original:xml,tex:null,symbols:[],assumptions:[],steps:[],interpretation:null,notation:'display_only'}:{kind:'unresolved',reason:'OMML exceeds the equation display contract; inert native representation retained.',original:xml};
      add(mk,l,payload,xml,
        {version:'petros.native-metadata.v1',nodeType:'OMML',original:xml},ch,['Native OMML is inert source; structured math, assumptions and computation require review.'],chunks.has(ch)?(ch===channel?key:`${key}.${ch}`):parentKey);
    }
    for(const [j,{n,ch}]of drawings.entries()) {
      const dk=`${key}.drawing.${j}`,blip=descendants(n,'a:blip')[0],id=attr(blip,'r:embed'),external=attr(blip,'r:link'),rel=relationships.get(part)?.get(id),image=rel?media.get(rel.resolved):undefined;
      if(id&&!rel)throw new Error('PETROS_M2_RELATIONSHIP_INVALID');
      const l=loc(part,n,dk,{...base,objectId:attr(descendants(n,'wp:docPr')[0],'id')??dk,...(id?{relationshipId:id}:{})});
      if(!image||external){add(dk,l,{kind:'unresolved',reason:'Unsupported drawing/chart/linked image; no external resources fetched.',original:null},'',{version:'petros.native-metadata.v1',nodeType:'unsupported_drawing'},ch,['Drawing interpretation unavailable.'],parentKey);continue;}
      const pr=descendants(n,'wp:docPr')[0],extent=descendants(n,'wp:extent')[0],alt=attr(pr,'descr')??attr(pr,'title')??'',
        native={version:'petros.native-metadata.v1',nodeType:'drawing',media:{part:rel.resolved,hash:image.hash,mime:image.mime,width:image.width,height:image.height,
          alt,placement:descendants(n,'wp:anchor').length?'floating':'inline',widthEmu:attr(extent,'cx')?int(attr(extent,'cx')):null,heightEmu:attr(extent,'cy')?int(attr(extent,'cy')):null,regeneration:'authorized_original_part'}};
      add(dk,l,{kind:'figure',caption:null,nodes:[],relationships:[],transform:{scaleX:1,scaleY:1,offsetX:0,offsetY:0},unsupportedRegions:[]},alt,native,ch,
        ['Embedded image relationship retained; pixel geometry, diagram meaning and captions require review.'],chunks.has(ch)?(ch===channel?key:`${key}.${ch}`):parentKey);
      if(image.bytes.length>1100000)throw new Error('PETROS_DOCUMENT_LIMIT');
      e.elements.at(-1).sourceImage={data:image.bytes.toString('base64'),format:image.mime==='image/png'?'png':'jpeg',hash:image.hash};
    }
    if(child(pPr,'w:sectPr'))section++;
  }
  function table(part,t,channel,parentKey,ancestry=[]) {
    if(ancestry.length>=limits.tableDepth)throw new Error('PETROS_DOCUMENT_LIMIT');
    const key=`docx.table.${ordinal++}`,grid=children(child(t,'w:tblGrid'),'w:gridCol'),trs=children(t,'w:tr');
    if(!grid.length||grid.length>limits.columns||!trs.length||trs.length>limits.rows)throw new Error('PETROS_M2_TABLE_INVALID');
    const rows=trs.map((_,i)=>`row.${i}`),columns=grid.map((_,i)=>`col.${i}`),cells=[],cellLocators=[],nested=[],active=new Map(),warnings=[];
    const visibility=(tr,tc)=>child(child(tr,'w:trPr'),'w:del')||child(child(tc,'w:tcPr'),'w:cellDel')?'deletions':child(child(tr,'w:trPr'),'w:ins')||child(child(tc,'w:tcPr'),'w:cellIns')?'insertions':channel;
    trs.forEach((tr,ri)=>{
      let col=int(attr(child(child(tr,'w:trPr'),'w:gridBefore'),'w:val')),current=new Map();
      for(const [ci,tc]of children(tr,'w:tc').entries()) {
        const pr=child(tc,'w:tcPr'),colSpan=int(attr(child(pr,'w:gridSpan'),'w:val'),1),merge=child(pr,'w:vMerge'),value=attr(merge,'w:val'),id=`cell.${ri}.${ci}`;
        if(colSpan<1||col+colSpan>columns.length||cells.length>=limits.cells)throw new Error('PETROS_M2_TABLE_INVALID');
        const visibleText=n=> {
          if(['w:del','w:ins','w:moveFrom','w:moveTo','w:txbxContent','w:instrText'].includes(n.tag))return '';
          if(n.tag==='w:r'&&(bool(child(child(n,'w:rPr'),'w:vanish'))||bool(child(child(n,'w:rPr'),'w:webHidden'))))return '';
          if(n.tag==='w:t')return allText(n);
          if(n.tag==='w:tab')return '\t';if(n.tag==='w:br')return '\n';
          return n.children.filter(c=>c.tag!=='w:pPr'&&c.tag!=='w:rPr').map(visibleText).join('');
        };
        const paragraphs=children(tc,'w:p'),cellChannel=visibility(tr,tc),text=cellChannel===channel?paragraphs.map(visibleText).join('\n'):'';
        if(cellChannel!==channel)warnings.push('Table contains revision/hidden channels; cell semantic use blocked pending separate paragraph inspection.');
        const base={tableId:key,row:ri,column:col,cellId:id,tableAncestry:ancestry};
        const cl=loc(part,tc,`${key}.${id}`,base);cellLocators.push({id,locator:cl});
        if(merge&&value!=='restart') {
          const prior=active.get(col);
          if(prior&&prior.columnSpan===colSpan){prior.rowSpan++;current.set(col,prior);if(text.trim()){prior.unresolved=true;warnings.push('Vertical merge continuation contains text; relationship requires review.');}}
          else {warnings.push('Unmatched vertical merge retained as unresolved cell.');cells.push({id,row:rows[ri],column:columns[col],rowSpan:1,columnSpan:colSpan,header:bool(child(child(tr,'w:trPr'),'w:tblHeader')),value:text,unit:null,unresolved:true,region:null});}
        } else {
          cells.push({id,row:rows[ri],column:columns[col],rowSpan:1,columnSpan:colSpan,header:bool(child(child(tr,'w:trPr'),'w:tblHeader')),value:text,unit:null,unresolved:false,region:null});
          if(merge)current.set(col,cells.at(-1));
        }
        if(child(pr,'w:hMerge')){cells.forEach(c=>c.unresolved=true);warnings.push('Legacy horizontal merge requires review; grid spans are authoritative.');}
        for(const nt of children(tc,'w:tbl'))nested.push(nt);
        if(descendants(tc,'w:ins').length||descendants(tc,'w:del').length||descendants(tc,'w:vanish').length)warnings.push('Table contains revision/hidden channels; cell semantic use blocked pending separate paragraph inspection.');
        col+=colSpan;
      }
      active.clear();for(const [c,v]of current)active.set(c,v);
    });
    const tl=loc(part,t,key,{tableId:key,tableAncestry:ancestry}),caption=attr(child(child(t,'w:tblPr'),'w:tblCaption'),'w:val')??null;
    // Table cell values exclude uncertain revision/hidden material; paragraph extraction preserves every channel separately.
    if(warnings.some(w=>w.includes('revision/hidden')))for(const c of cells)c.unresolved=true;
    add(key,tl,{kind:'table',caption,rows,columns,cells},cells.map(c=>c.value).join('\n'),{version:'petros.native-metadata.v1',nodeType:'table',cells:cellLocators},channel,warnings,parentKey??headingStack.at(-1)?.key??null);
    for(const tr of trs)for(const tc of children(tr,'w:tc'))for(const p of children(tc,'w:p'))paragraph(part,p,visibility(tr,tc),key,[...ancestry,key]);
    for(const nt of nested)table(part,nt,channel,key,[...ancestry,key]);
  }
  function container(part,n,channel='visible',parentKey=null) {
    for(const c of n.children) {
      if(c.tag==='w:p')paragraph(part,c,channel,parentKey);
      else if(c.tag==='w:tbl')table(part,c,channel,parentKey);
      else if(c.tag==='w:sectPr'){section++;}
      else if(['w:footnote','w:endnote','w:comment'].includes(c.tag))container(part,c,channel,parentKey);
      else {
        const key=`docx.unresolved.${ordinal++}`,l=loc(part,c,key);
        add(key,l,{kind:'unresolved',reason:`Unsupported native container ${c.tag}; content not promoted to visible facts.`,original:null},'',{version:'petros.native-metadata.v1',nodeType:c.tag},channel,['Native container requires structural review.'],parentKey);
      }
    }
  }
  container(mainPart,body);
  for(const r of relationships.get(mainPart)?.values()??[]) {
    const feature=r.type.slice(officeRel.length),channel={header:'headers',footer:'footers',footnotes:'footnotes',endnotes:'endnotes',comments:'comments'}[feature];
    if(channel){sourceParts.add(r.resolved);container(r.resolved,trees.get(r.resolved),channel);}
    else if(['chart','diagramData','aFChunk','customXml'].includes(feature))e.warnings.push(`Unsupported relationship ${feature}; semantic interpretation unavailable.`);
  }
  // Preserve original XML parts for native structural inspection, never rendered as markup.
  e.nativeDocument={encoding:null,newline:'none',bomBytes:0,byteLength:buffer.length,text:null,
    policy:'Unchanged visible main text only. Unresolved insertions/deletions, hidden content, notes and comments are separate and excluded from semantic input. No guessed Word pagination.',
    parts:[...sourceParts].map(name=>({name,hash:hash(parts.get(name)),xml:parts.get(name).toString('utf8')}))};
  metrics.structuralMs=performance.now()-structuralStart;
  if(e.nativeDocument.parts.some(p=>p.xml.length>limits.characters))throw new Error('PETROS_DOCUMENT_LIMIT');
};
