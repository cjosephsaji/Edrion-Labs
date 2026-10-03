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
  const pdfjs = await import(pathToFileURL(process.argv[2]).href);
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  const document = await task.promise;
  try {
    if (document.numPages < 1 || document.numPages > 500) throw new Error('PETROS_DOCUMENT_LIMIT');
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
  const code = ['PETROS_DOCUMENT_LIMIT', 'PETROS_PDF_INVALID'].includes(error.message)
    ? error.message
    : 'PETROS_PDF_INVALID';
  emit({ error: code });
  process.exitCode = 1;
});
