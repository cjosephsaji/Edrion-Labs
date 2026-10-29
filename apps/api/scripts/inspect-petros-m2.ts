/** Local CC0 fixture inspector. No application bootstrap, dotenv, configured database or provider. */
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { PdfContentAdapter } from '../src/modules/student/knowledge/adapters/pdf-content.adapter';
import { DocxContentAdapter } from '../src/modules/student/knowledge/adapters/docx-content.adapter';
import { TxtContentAdapter } from '../src/modules/student/knowledge/adapters/txt-content.adapter';
import { MarkdownContentAdapter } from '../src/modules/student/knowledge/adapters/markdown-content.adapter';
import { evaluateM2fa, m2faChanges } from '../../../packages/learn-evals/src/petros-v2/format-expansion-a';
import { PptxContentAdapter } from '../src/modules/student/knowledge/adapters/pptx-content.adapter';
import { KnowledgePdfProcess } from '../src/modules/student/knowledge/knowledge-pdf-process';
import {
  sha256,
  type ExtractionEvidence,
} from '../src/modules/student/knowledge/adapters/content-adapter';
import { fixtureRevision } from '../src/modules/student/knowledge/petros-m2-test-helpers';
import {
  produceContentUnits,
  selectVisualRegions,
} from '../src/modules/student/knowledge/petros-content-intelligence.service';
import { extractSelectedOcr } from '../src/modules/student/knowledge/petros-content-ocr';
import { m2Fixtures } from '../../../packages/learn-evals/src/petros-v2/fixtures/manifest';
import type { ContentUnit } from '@edrion/schemas';
import { exportSemanticCases } from '../../../packages/learn-evals/src/petros-v2/semantic-cases';
import { semanticMetrics } from '../../../packages/learn-evals/src/petros-v2/semantic-review';
if (
  process.env.DATABASE_URL ||
  process.env.DATABASE_MIGRATION_URL ||
  Object.keys(process.env).some((k) => k.startsWith('PG') && process.env[k])
)
  throw new Error('M2_CONFIGURED_TARGET_REFUSED');
const root = resolve(__dirname, '../../..'),
  sourceRoot = resolve(root, 'packages/learn-evals/src/petros-v2/fixtures/sources'),
  output = resolve(
    root,
    process.argv.includes('--m2fa') ? 'docs/verification/petros-v2/m2fa-evidence' : process.argv.includes('--m2g')
      ? 'docs/verification/petros-v2/m2g-2026-10-13'
      : 'docs/verification/petros-v2/m2',
  );
const manifest = JSON.parse(readFileSync(resolve(sourceRoot, '../source-manifest.json'), 'utf8'));
const formatExpansion = argsContain('--m2fa');
function argsContain(value: string) { return process.argv.includes(value); }
const nativeManifest = JSON.parse(readFileSync(resolve(sourceRoot,'m2fa/manifest.json'),'utf8'));
if(formatExpansion) for(const [name,entry] of Object.entries(nativeManifest)) manifest['m2fa/'+name]=entry;
const args = process.argv.slice(2),
  serve = args.includes('--serve'),
  reuse = args.includes('--reuse');
const officeIndex = args.indexOf('--office-binary'),
  office = officeIndex >= 0 ? args[officeIndex + 1] : undefined;
const worker = new KnowledgePdfProcess(),
  pdf = new PdfContentAdapter(worker),
  pptx = new PptxContentAdapter(worker),docx=new DocxContentAdapter(worker),txt=new TxtContentAdapter(worker),markdown=new MarkdownContentAdapter(worker);
const names = [
  'cloud-models.pptx',
  'cloud-reference.pdf',
  'argument.pdf',
  'argument-commentary.pptx',
  'cloud-models-revised.pptx',
  'argument-revised.pdf',
  'image-only.pdf',
  'smartart.pptx',
  'injection.pdf',
  'corrupt.pdf',
  'encrypted.pdf',
  'oversized-pages.pdf',
  'malformed.pptx',
  'unsafe-path.pptx',
  'zip-bomb.pptx',
  'xml-entity.pptx',
  'legacy-blocked.ppt',
  'structures.pdf',
  'rotated.pdf',
  'huge-dimensions.pdf',
  'ambiguous-arrow.pptx',
  'hidden-slide.pptx',
  'grouped-shapes.pptx',
  'external-link.pptx',
  'macro.pptx',
  'embedded-executable.pptx',
  ...(formatExpansion ? Object.keys(nativeManifest).map(name=>'m2fa/'+name) : []),
];
type Run = {
  name: string;
  originalHash: string;
  status: string;
  evidence?: ExtractionEvidence;
  units?: ContentUnit[];
  [key: string]: unknown;
};
function page(u: ContentUnit) {
  return u.locator.kind === 'pdf'
    ? u.locator.page
    : u.locator.kind === 'slide'
      ? u.locator.slide
      : 0;
}
function evaluate(runs: Run[]) {
  const results: Record<string, unknown> = {};
  for (const [subject, labels] of Object.entries(m2Fixtures.subjects)) {
    const rows = labels.map((label) => {
      const run = runs.find((r) => r.name === label.file)!,
        units = run.units?.filter((u) => page(u) === label.surface) ?? [];
      let recovered = false;
      if (label.kind === 'diagram_node')
        recovered = units.some(
          (u) =>
            u.payload.kind === 'diagram' && u.payload.nodes.some((n) => n.label === label.text),
        );
      else if (label.kind === 'diagram_edge')
        recovered = units.some((u) => {
          const p = u.payload;
          return (
            p.kind === 'diagram' &&
            p.relationships.some(
              (r) =>
                `${p.nodes.find((n) => n.id === r.from)?.label}->${p.nodes.find((n) => n.id === r.to)?.label}` ===
                label.text,
            )
          );
        });
      else if (label.kind === 'table_cell')
        recovered = units.some(
          (u) => u.payload.kind === 'table' && u.payload.cells.some((c) => c.value === label.text),
        );
      else if (label.kind === 'equation' || label.kind === 'code')
        recovered = units.some(
          (u) => u.payload.kind === label.kind && u.searchableText.includes(label.text),
        );
      else if (label.kind === 'text')
        recovered = units.some((u) => u.searchableText.includes(label.text));
      else if (label.kind === 'chart_label')
        recovered = units.some(
          (u) =>
            u.payload.kind === 'chart' &&
            u.payload.series?.some((s) => s.points.some((p) => p.category === label.text)),
        );
      else if (label.kind === 'chart_value')
        recovered = units.some(
          (u) =>
            u.payload.kind === 'chart' &&
            u.payload.series?.some((s) => s.points.some((p) => p.value === label.text)),
        );
      // Pixels and chart cache text do not count as verified structured visual understanding.
      const flagged =
        !recovered &&
        units.some(
          (u) =>
            u.payload.kind === 'unresolved' ||
            u.quality.uncertainties.some((t) => /review|unsupported|OCR|vision/i.test(t)),
        );
      const ocrRecovered =
        label.kind === 'visual_label' &&
        (run.ocr as Awaited<ReturnType<typeof extractSelectedOcr>> | undefined)?.some(
          (r) => r.status === 'review_required' && r.text.includes(label.text),
        );
      return {
        ...label,
        hash: run.originalHash,
        labelOrigin: m2Fixtures.labelOrigin,
        extractionStatus: recovered ? 'recovered' : flagged ? 'unsupported' : 'omitted',
        ocrStatus: ocrRecovered ? 'recovered_uncalibrated' : 'not_recovered',
        severity: !recovered && label.important ? 'high' : 'none',
        interpretationStatus: 'provider_unverified',
        locatorCorrect: recovered ? true : null,
        reviewNeeded: true,
        omissionFlagged: flagged,
      };
    });
    const recovered = rows.filter((r) => r.extractionStatus === 'recovered').length,
      missing = rows.filter((r) => r.extractionStatus !== 'recovered');
    const group = (kinds: string[]) => {
      const group = rows.filter((r) => kinds.includes(r.kind));
      return {
        recovered: group.filter((r) => r.extractionStatus === 'recovered').length,
        total: group.length,
      };
    };
    results[subject] = {
      recovered,
      total: rows.length,
      percent: (recovered / rows.length) * 100,
      importantOmissions: {
        flagged: missing.filter((r) => r.omissionFlagged).length,
        total: missing.length,
      },
      textRecovery: group(['text', 'code']),
      tableFidelity: group(['table_cell']),
      diagramRecovery: group(['diagram_node', 'diagram_edge', 'visual_label', 'visual_edge']),
      equationFidelity: group(['equation']),
      chartMetadataRecovery: group(['chart_label', 'chart_value']),
      ocrLabelRecovery: {
        recovered: rows.filter((r) => r.ocrStatus === 'recovered_uncalibrated').length,
        total: rows.filter((r) => r.kind === 'visual_label').length,
        calibrated: false,
      },
      semanticFactRecovery: null,
      unsupportedModelClaimRate: null,
      reviewerApproved: false,
      rows,
    };
  }
  return results;
}
(async () => {
  mkdirSync(output, { recursive: true });
  let runs: Run[];
  if (reuse) runs = JSON.parse(readFileSync(resolve(output, 'runs.json'), 'utf8')).runs;
  else {
    runs = [];
    for (const name of names) {
      const bytes = readFileSync(resolve(sourceRoot, name));
      if (sha256(bytes) !== manifest[name]?.sha256) throw new Error('M2_FIXTURE_MANIFEST_HASH');
      const start = performance.now();
      try {
        if (name.endsWith('.ppt')) throw new Error('PETROS_M2_LEGACY_ISOLATION_REQUIRED');
        const e = await (name.endsWith('.docx')?docx:name.endsWith('.txt')?txt:name.endsWith('.md')?markdown:name.endsWith('.pdf') ? pdf : pptx).extract(
            bytes,
            new AbortController().signal,
          ),
          revision = fixtureRevision(e),
          visual = ['pdf','pptx'].includes(e.format) ? selectVisualRegions(e) : [];
        const ocrStart = performance.now(),
          ocr = visual.length ? await extractSelectedOcr(
            e,
            visual.map((v) => v.key),
            new AbortController().signal,
          ) : [],
          ocrMs = performance.now() - ocrStart;
        revision.visualReceipts = ocr.flatMap((o) =>
          o.status === 'review_required'
            ? [
                {
                  key: o.key,
                  sourceHash: o.sourceHash,
                  locator: o.locator,
                  region: o.region,
                  cropHash: o.crop.hash,
                  width: o.crop.width,
                  height: o.crop.height,
                  pixels: o.crop.pixels,
                  method: o.method,
                  version: o.version,
                  runtime: o.runtime,
                  text: o.text,
                  labels: o.labels,
                  confidence: null,
                  reviewRequired: true,
                },
              ]
            : [],
        );
        const extra = revision.visualReceipts.filter((r) => r.text).length;
        revision.coverage = {
          ...revision.coverage,
          status: extra ? 'partial' : revision.coverage.status,
          totalUnits: e.elements.length + extra,
          processedUnits: e.elements.length + extra,
          unresolvedUnits: revision.coverage.unresolvedUnits + extra,
        };
        const units = produceContentUnits(e, revision);
        const run: Run = {
          name,
          originalHash: e.originalHash,
          status:
            revision.coverage.status === 'complete' ? 'complete_extraction' : 'partial_extraction',
          evidence: e,
          revision,
          units,
          visual,
          ocr,
          semantic: {
            status: 'unavailable',
            reason: 'No authorized provider inference was performed.',
            liveVerified: false,
          },
          timing: {
            extractionAndRenderingMs: performance.now() - start - ocrMs,
            conversionMs: null,
            ocrMs,
            visionMs: null,
            semanticMs: 0,
            queueMs: null,
          },
        };
        if (office && name.endsWith('.pptx') && !name.startsWith('smartart')) {
          const began = performance.now();
          try {
            const render = await pptx.renderOriginal(bytes, new AbortController().signal, office);
            const titles = units.filter((u) => u.payload.kind === 'heading');
            if (
              render.pageCount !== e.slideCount ||
              titles.some(
                (t) =>
                  t.payload.kind === 'heading' &&
                  !render.surfaces[page(t) - 1]?.text.includes(t.payload.text),
              )
            )
              throw new Error('M2_OFFICE_SLIDE_MAPPING_UNCERTAIN');
            run.originalRendering = render;
            (run.timing as { conversionMs: number | null }).conversionMs =
              performance.now() - began;
          } catch (error) {
            run.renderingBlocked = error instanceof Error ? error.message : 'M2_RENDER_FAILURE';
          }
        }
        runs.push(run);
        process.stdout.write(`${name}: ${run.status}; ${units.length} units\n`);
      } catch (error) {
        const code =
          error instanceof Error
            ? 'code' in error
              ? String(error.code)
              : error.message
            : 'M2_PARSE_FAILURE';
        runs.push({
          name,
          originalHash: sha256(bytes),
          status: 'blocked',
          error: code,
          elapsedMs: performance.now() - start,
        });
        process.stdout.write(`${name}: blocked (${code})\n`);
      }
    }
  }
  const evaluation = evaluate(runs),
    changes = [];
  for (const [oldName, newName] of [
    ['cloud-models.pptx', 'cloud-models-revised.pptx'],
    ['argument.pdf', 'argument-revised.pdf'],
  ]) {
    const a = runs.find((r) => r.name === oldName)!,
      b = runs.find((r) => r.name === newName)!;
    const structure = (r: Run) =>
      r.units?.map((u) => ({
        surface: page(u),
        locator: u.locator,
        payload: u.payload,
        channel: u.sourceChannel,
      }));
    changes.push({
      original: oldName,
      revised: newName,
      originalHash: a.originalHash,
      revisedHash: b.originalHash,
      contentChanged: JSON.stringify(structure(a)) !== JSON.stringify(structure(b)),
      originalUnits: structure(a),
      revisedUnits: structure(b),
      semantic: 'Changed-source semantic re-evaluation is provider-unverified.',
    });
  }
  let security: unknown = null;
  try {
    security = JSON.parse(readFileSync(resolve(output, 'database-evidence.json'), 'utf8'));
  } catch {
    /* Security evidence is absent before the disposable verification run. */
  }
  const document = {
    schemaVersion: 'petros.m2.inspector.v1',
    license: m2Fixtures.license,
    labelOrigin: m2Fixtures.labelOrigin,
    providerCalls: 0,
    teachingReady: false,
    runs,
    evaluation,
    changes,
    security,
  };
  if (args.includes('--m2g')) {
    for (const run of runs) {
      const timing = run.timing as { visionMs?: number | null; ocrMs?: number } | undefined;
      if (timing && timing.ocrMs === undefined) {
        timing.ocrMs = timing.visionMs ?? 0;
        timing.visionMs = null;
      }
    }
    const exported = [
      ['cloud', 'cloud-models.pptx', false],
      ['english', 'argument.pdf', false],
      ['cloud', 'cloud-models-revised.pptx', true],
      ['english', 'argument-revised.pdf', true],
    ].map(([subject, name, changed]) =>
      exportSemanticCases(
        subject as 'cloud' | 'english',
        runs.find((run) => run.name === name)?.units ?? [],
        Boolean(changed),
      ),
    );
    const gold = exported.flatMap((value) => value.cases);
    const coverage = Object.fromEntries(
      Object.entries(evaluation).map(([subject, raw]) => {
        const measured = raw as {
          rows: Array<{ extractionStatus: string; ocrStatus: string }>;
          recovered: number;
          total: number;
        };
        const assisted = measured.rows.filter(
          (row) => row.ocrStatus === 'recovered_uncalibrated',
        ).length;
        return [
          subject,
          {
            native: { recovered: measured.recovered, total: measured.total },
            ocrObserved: assisted,
            visionObserved: 0,
            combinedObserved: measured.rows.filter(
              (row) =>
                row.extractionStatus === 'recovered' || row.ocrStatus === 'recovered_uncalibrated',
            ).length,
            total: measured.total,
            ocrAdmission: 'review_required_uncalibrated',
            mechanicallyValidatedCitations: 'see_contract_tests_not_semantic_accuracy',
            independentlySupportedSemanticClaims: null,
            unsupportedOrReviewRequired: measured.total - measured.recovered,
            independentReviewerStatus: 'pending',
          },
        ];
      }),
    );
    Object.assign(document, {
      qualityCategories: coverage,
      semanticReview: {
        cases: gold,
        metrics: semanticMetrics(gold),
        status: 'pending_independent_review',
      },
      providerExecution: {
        genuineRequests: 0,
        controlledResponses: 'contract_tests_only_not_this_extraction',
        vision: 'not_run',
        genuineSemanticInference: 'BLOCKED_PENDING_AUTHORIZATION',
      },
    });
    writeFileSync(
      resolve(output, 'semantic-gold-pending.json'),
      JSON.stringify(
        {
          status: 'pending_independent_review',
          cases: gold,
          unresolved: exported.flatMap((value) => value.unresolved),
          metrics: semanticMetrics(gold),
          providerCalls: 0,
          academicApproval: false,
        },
        null,
        2,
      ),
    );
    const pilot = ['cloud-models.pptx', 'argument.pdf'].map((name) => {
      const run = runs.find((value) => value.name === name)!;
      return {
        name,
        sourceHash: run.originalHash,
        revision: run.revision,
        units: run.units
          ?.filter((unit) => unit.sourceChannel !== 'notes' && unit.sourceChannel !== 'hidden')
          .slice(0, 8),
      };
    });
    writeFileSync(
      resolve(output, 'live-pilot-pending.json'),
      JSON.stringify(
        {
          status: 'BLOCKED_PENDING_AUTHORIZATION',
          providerCalls: 0,
          pilot,
          identityStatus:
            'Fixture-only IDs. Reprepare exact bytes through an authorized durable staff source before dispatch.',
          route: null,
          provider: null,
          modelVersion: null,
          perRequestSpendCapMicros: null,
          totalSpendCapMicros: null,
          sourceSharingApproved: false,
          limits: {
            requests: 2,
            visibleUnits: 8,
            inputBytes: 49152,
            outputTokens: 3000,
            deadlineMs: 15000,
            routes: 1,
            retries: 0,
            cache: false,
          },
          approvalsRequired: [
            'actual_staff_scope_and_durable_preparation_receipt',
            'exact_source_sharing_eligibility',
            'qualified_provider_model_route',
            'explicit_per_request_and_total_spend_caps',
            'current_server_owned_approval_receipt',
            'independent_subject_review',
            'separate_database_proposal_security_review',
          ],
        },
        null,
        2,
      ),
    );
  }
  if(formatExpansion) {
    Object.assign(document,{formatExpansion:evaluateM2fa(runs),formatChanges:m2faChanges(runs)});
    writeFileSync(resolve(output,'format-evaluation.json'),JSON.stringify({evaluation:evaluateM2fa(runs),changes:m2faChanges(runs)},null,2));
  }
  writeFileSync(resolve(output, 'runs.json'), JSON.stringify(document));
  writeFileSync(
    resolve(output, 'evaluation.json'),
    JSON.stringify({ evaluation, changes }, null, 2),
  );
  if (!serve) return;
  const portIndex = args.indexOf('--port');
  const port = portIndex < 0 ? 4872 : Number(args[portIndex + 1]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('M2_INSPECTOR_PORT_INVALID');
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (request.method !== 'GET') {
      response.writeHead(405);
      response.end();
      return;
    }
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
    );
    if (url.pathname === '/') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(readFileSync(resolve(__dirname, 'petros-m2-inspector.html')));
      return;
    }
    if (url.pathname === '/runs.json') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(document));
      return;
    }
    if (url.pathname.startsWith('/sources/')) {
      let name: string;
      try {
        name = decodeURIComponent(url.pathname.slice(9));
      } catch {
        response.writeHead(400);
        response.end();
        return;
      }
      if (!names.includes(name)) {
        response.writeHead(404);
        response.end();
        return;
      }
      const source = resolve(sourceRoot, name);
      if (statSync(source).size !== manifest[name]?.bytes) {
        response.writeHead(409);
        response.end('M2_FIXTURE_MANIFEST_SIZE');
        return;
      }
      const bytes = readFileSync(source);
      if (
        sha256(bytes) !== manifest[name]?.sha256 ||
        sha256(bytes) !== runs.find((r) => r.name === name)?.originalHash
      ) {
        response.writeHead(409);
        response.end('M2_FIXTURE_MANIFEST_HASH');
        return;
      }
      response.setHeader('Content-Type', 'application/octet-stream');
      response.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      response.end(bytes);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  server.listen(port, '127.0.0.1', () =>
    process.stdout.write(`Fixture inspector: http://127.0.0.1:${port}\n`),
  );
})().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'M2_INSPECTOR_FAILURE'}\n`);
  process.exitCode = 1;
});
