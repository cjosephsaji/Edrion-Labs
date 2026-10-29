'use strict';
// Trusted executable only. All untrusted bytes arrive over stdin inside KnowledgePdfProcess.
const { createHash } = require('node:crypto');
const hash = b => createHash('sha256').update(b).digest('hex');
const emit = v => process.stdout.write(JSON.stringify(v) + '\n');
(async () => {
  const format = process.argv[3], modules = JSON.parse(process.argv[4]), limits = JSON.parse(process.argv[5]);
  if (!['txt','markdown','docx'].includes(format)) throw new Error('PETROS_M2_UNSUPPORTED_FORMAT');
  const chunks = []; let size = 0;
  for await (const b of process.stdin) {
    size += b.length;
    if (size > limits.bytes) throw new Error('PETROS_DOCUMENT_LIMIT');
    chunks.push(b);
  }
  const buffer = Buffer.concat(chunks);
  const e = { schemaVersion: 'petros.m2.evidence.v1', format, originalHash: hash(buffer),
    parserVersion: format === 'markdown' ? 'mdast.2.0.3.gfm.3.1.0.micromark.3.0.0.v1' : format === 'docx' ? 'ooxml.jszip.3.10.1.sax.1.6.0.docx.v1' : 'petros.strict-text.v1',
    rendererVersion: 'petros.native-structural.v1', pageCount: 0, slideCount: 0, surfaces: [],
    shapeRegistry: [], elements: [], nativeLocators: [], warnings: [] };
  const context = { e, buffer, modules, limits, hash, emit, metrics:{} };
  await (format === 'docx' ? require('./m2fa-docx.cjs').extract(context) : require('./m2fa-text.cjs').extract(context));
  if (e.elements.length > limits.elements || e.elements.reduce((n,x) => n+x.text.length,0) > limits.characters ||
    Buffer.byteLength(JSON.stringify(e.nativeLocators)) > limits.locatorBytes || e.nativeLocators.length > 512)
    throw new Error('PETROS_DOCUMENT_LIMIT');
  if (Buffer.byteLength(JSON.stringify(e)) > limits.outputBytes - 1024) throw new Error('PETROS_M2_OUTPUT_LIMIT');
  context.metrics.selfPeakRssKiB=process.resourceUsage().maxRSS;
  emit({nativeMetrics:context.metrics});
  emit({ result: e });
})().catch(error => { emit({ error: /^PETROS_(?:DOCUMENT_LIMIT|M2_[A-Z_]+)$/.test(error.message) ? error.message : 'PETROS_M2_NATIVE_INVALID' }); process.exitCode = 1; });
