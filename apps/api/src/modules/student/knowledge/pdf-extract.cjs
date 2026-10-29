'use strict';
/* global require, process, Buffer, console, setTimeout */
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS sandbox executable; it cannot import application code. */
// Trusted executable only: the document arrives on stdin, never as code or a path.
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
// eslint-disable-next-line no-console -- Keep pdfjs diagnostics out of the bounded JSON stdout protocol.
console.log = console.warn = console.error = () => {};
const MAX_BYTES = 20 * 1024 * 1024;
// A lost parent cannot leave an idle parser process alive indefinitely. CPU-bound work is
// independently bounded by the launcher's OS CPU limit.
setTimeout(() => process.exit(124), 20_000).unref();
const emit = (value) => process.stdout.write(JSON.stringify(value) + '\n');

(async () => {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error('PETROS_DOCUMENT_LIMIT');
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-')))
    throw new Error('PETROS_PDF_INVALID');
  const m2 = process.argv[3] === 'm2';
  const native = m2 ? require('./adapters/m2-native.cjs') : null;
  const canvas = m2 ? require(JSON.parse(process.argv[4]).canvas) : null;
  if (canvas) { global.DOMMatrix = canvas.DOMMatrix; global.Path2D = canvas.Path2D; global.ImageData = canvas.ImageData; }
  const pdfjs = await import(pathToFileURL(process.argv[2]).href);
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
    ...(m2 ? { maxImageSize: 16_000_000, stopAtErrors: true, CanvasFactory: native.canvasFactory(canvas) } : {}),
  });
  const document = await task.promise;
  try {
    if (document.numPages < 1 || document.numPages > (m2 ? 20 : 500)) throw new Error('PETROS_DOCUMENT_LIMIT');
    if (m2) { emit({ result: await native.extractPdf(document, buffer, pdfjs, canvas, emit) }); return; }
    const pages = [];
    let chars = 0;
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replaceAll('\0', '');
      chars += text.length;
      if (chars > 2_000_000) throw new Error('PETROS_DOCUMENT_LIMIT');
      pages.push(text);
      page.cleanup();
      emit({ progress: number });
    }
    emit({ result: { pages, fileSha256: createHash('sha256').update(buffer).digest('hex') } });
  } finally {
    await document.destroy();
  }
})().catch((error) => {
  // Never copy parser messages/document text into ordinary logs or durable error fields.
  const code = error.name === 'PasswordException' ? 'PETROS_PDF_ENCRYPTED' : ['PETROS_DOCUMENT_LIMIT', 'PETROS_PDF_INVALID', 'PETROS_M2_PAGE_DIMENSIONS'].includes(error.message)
    ? error.message
    : 'PETROS_PDF_INVALID';
  emit({ error: code });
  process.exitCode = 1;
});
