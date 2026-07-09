'use strict';

/**
 * Plain CommonJS pdf.js helper for Nest/ts-node.
 * Bare ESM imports of pdfjs-dist hang under ts-node-dev; this file loads via require().
 */

const { createRequire } = require('module');
const { pathToFileURL } = require('url');

const requireFromHere = createRequire(__filename);

let pdfJsApi = null;

async function loadPdfJs() {
  if (pdfJsApi) return pdfJsApi;
  const pdfPath = requireFromHere.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  const workerPath = requireFromHere.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  const mod = await import(pathToFileURL(pdfPath).href);
  const api = mod.default ?? mod;
  if (api.GlobalWorkerOptions) {
    api.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  }
  pdfJsApi = api;
  return api;
}

/**
 * @param {Buffer|Uint8Array} buffer
 * @returns {Promise<{ numPages: number, pages: Array<{ pageNumber: number, text: string }> }>}
 */
async function extractPdfText(buffer) {
  const pdfjs = await loadPdfJs();
  // pdf.js rejects Node Buffer (even though it is a Uint8Array subclass).
  const data = Uint8Array.from(buffer);
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;

  try {
    const numPages = doc.numPages;
    if (!numPages || numPages < 1) {
      throw new Error('This PDF has no pages.');
    }
    const pages = [];
    for (let n = 1; n <= numPages; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => (item && typeof item.str === 'string' ? item.str : ''))
        .join(' ')
        .replace(/\u0000/g, '')
        .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      pages.push({ pageNumber: n, text });
    }
    return { numPages, pages };
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}

module.exports = { extractPdfText };
