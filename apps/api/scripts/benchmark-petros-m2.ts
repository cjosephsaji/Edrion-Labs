/** Approved original fixtures only. Fresh isolated parser process on every sample. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PdfContentAdapter } from '../src/modules/student/knowledge/adapters/pdf-content.adapter';
import { PptxContentAdapter } from '../src/modules/student/knowledge/adapters/pptx-content.adapter';
import { KnowledgePdfProcess } from '../src/modules/student/knowledge/knowledge-pdf-process';
import { extractSelectedOcr } from '../src/modules/student/knowledge/petros-content-ocr';
import { selectVisualRegions } from '../src/modules/student/knowledge/petros-content-intelligence.service';
import type { ExtractionMetrics } from '../src/modules/student/knowledge/adapters/content-adapter';
if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL)
  throw new Error('M2_CONFIGURED_TARGET_REFUSED');
const root = resolve(__dirname, '../../..'),
  names = ['cloud-models.pptx', 'cloud-reference.pdf', 'argument.pdf', 'argument-commentary.pptx'];
const quantile = (values: number[], q: number) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1] ?? null;
(async () => {
  const samples = [];
  const worker = new KnowledgePdfProcess(),
    pdf = new PdfContentAdapter(worker),
    pptx = new PptxContentAdapter(worker);
  for (const name of names)
    for (let run = 0; run < 5; run++) {
      const bytes = readFileSync(
        resolve(root, 'packages/learn-evals/src/petros-v2/fixtures/sources', name),
      );
      let metrics: ExtractionMetrics | undefined;
      const start = performance.now(),
        e = await (name.endsWith('.pdf') ? pdf : pptx).extract(
          bytes,
          new AbortController().signal,
          () => {},
          (m) => {
            metrics = m;
          },
        );
      const extractionMs = performance.now() - start,
        ocrStart = performance.now();
      const ocr = await extractSelectedOcr(
        e,
        selectVisualRegions(e).map((r) => r.key),
        new AbortController().signal,
      );
      samples.push({
        name,
        run,
        originalHash: e.originalHash,
        extractionAndRenderingMs: extractionMs,
        ocrMs: performance.now() - ocrStart,
        ocrStatus: ocr.map((r) => r.status),
        metrics: metrics ?? null,
        semanticMs: null,
        conversionMs: null,
      });
    }
  let queue: unknown = null;
  try {
    queue = JSON.parse(
      readFileSync(resolve(root, 'docs/verification/petros-v2/m2/database-evidence.json'), 'utf8'),
    ).find((r: { queue?: unknown }) => r.queue)?.queue;
  } catch {
    /* Queue measurement requires the disposable verifier. */
  }
  const r = JSON.parse(
    readFileSync(resolve(root, 'docs/verification/petros-v2/m2/runs.json'), 'utf8'),
  );
  const conversion = r.runs
    .filter(
      (r: { timing?: { conversionMs?: number } }) => typeof r.timing?.conversionMs === 'number',
    )
    .map((r: { timing: { conversionMs: number } }) => r.timing.conversionMs);
  const output = {
    node: process.version,
    platform: process.platform,
    sampleCount: samples.length,
    policy:
      '20 sequential clean fixture parses; each uses a fresh sandboxed process. Local measurements are not staging-load qualification.',
    p95ExtractionAndRenderingMs: quantile(
      samples.map((s) => s.extractionAndRenderingMs),
      0.95,
    ),
    p95OcrMs: quantile(
      samples.map((s) => s.ocrMs),
      0.95,
    ),
    peakSampledParserRssKiB: Math.max(...samples.map((s) => s.metrics?.peakRssKiB ?? 0)),
    rssMeasurement:
      '100 ms sampling; does not measure instantaneous peaks. Hard parent/child RSS monitor and OS CPU/wall bounds remain enforced.',
    conversionSamplesMs: conversion,
    p95ConversionMs: conversion.length ? quantile(conversion, 0.95) : null,
    semanticInferenceMs: null,
    paidProviderRequests: 0,
    queue,
    samples,
  };
  writeFileSync(
    resolve(root, 'docs/verification/petros-v2/m2/performance.json'),
    JSON.stringify(output, null, 2),
  );
  process.stdout.write(
    JSON.stringify({
      samples: samples.length,
      p95ExtractionAndRenderingMs: output.p95ExtractionAndRenderingMs,
      p95OcrMs: output.p95OcrMs,
      peakSampledParserRssKiB: output.peakSampledParserRssKiB,
    }) + '\n',
  );
})().catch((e) => {
  process.stderr.write(e.message + '\n');
  process.exitCode = 1;
});
