'use strict';

/**
 * Child-process PDF ingest worker.
 * Usage: node pdf-ingest-worker.cjs <absolute-path-to.pdf>
 * Writes JSON { numPages, pages: [{ pageNumber, text }] } to stdout.
 */

const { readFileSync } = require('fs');
const { extractPdfText } = require('./pdf-text-extract.cjs');

const filePath = process.argv[2];
if (!filePath) {
  console.error('usage: pdf-ingest-worker.cjs <file>');
  process.exit(2);
}

extractPdfText(readFileSync(filePath))
  .then((result) => {
    process.stdout.write(JSON.stringify(result));
  })
  .catch((err) => {
    console.error(err?.message || String(err));
    process.exit(1);
  });
