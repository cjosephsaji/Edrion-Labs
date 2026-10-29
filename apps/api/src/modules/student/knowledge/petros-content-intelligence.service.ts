/* eslint-disable @typescript-eslint/consistent-type-imports -- Nest needs runtime constructor metadata. */
import { Inject, Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { runInScopedTenant, type Database, type ReadinessScope } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import {
  canonicalContent,
  contentUnitHashInput,
  parseBoundedContentUnit,
  validateUnitProvenance,
  type ContentUnit,
  type SourceRevision,
  type SourceBinding,
} from '@edrion/schemas';
import { DATABASE, API_ENV } from '../../../common/tokens';
import { LocalDiskDriver } from '../storage/drivers/local-disk.driver';
import { PetrosAiGatewayService } from '../../petros-ai-routing/petros-ai-gateway.service';
import { PdfContentAdapter } from './adapters/pdf-content.adapter';
import { DocxContentAdapter } from './adapters/docx-content.adapter';
import { TxtContentAdapter } from './adapters/txt-content.adapter';
import { MarkdownContentAdapter } from './adapters/markdown-content.adapter';
import { PptxContentAdapter } from './adapters/pptx-content.adapter';
import {
  extractionEvidenceSchema,
  M2_EXTRACTOR,
  M2_LIMITS,
  sha256,
  type ExtractionEvidence,
} from './adapters/content-adapter';
import {
  PetrosContentUnitRepository,
  type RevisionPreparation,
} from './petros-content-unit.repository';
import {
  KnowledgePreparationRepository,
  type Preparation,
} from './knowledge-preparation.repository';
import { PdfPreparationError } from './knowledge-pdf-process';
import {
  interpretWithGateway,
  referenceFor,
  validateInterpretation,
  M2_PROMPT,
  M2_SYSTEM,
  type InterpretationAuthorization,
} from './petros-content-interpretation';
import { convertPresentationForM2 } from '../materials/presentation-converter';
import { extractSelectedOcr, extractSourceCrop } from './petros-content-ocr';

export type M2Stage =
  | 'queued'
  | 'validating_source'
  | 'scanning'
  | 'format_detection'
  | 'structural_validation'
  | 'content_unit_construction'
  | 'extracting'
  | 'rendering'
  | 'selecting_visual_regions'
  | 'interpreting_visual_regions'
  | 'semantic_eligibility'
  | 'interpreting_semantics'
  | 'validating_provenance'
  | 'persisting'
  | 'completed'
  | 'partially_supported'
  | 'cancelled'
  | 'blocked';
export const stableUnitId = (revisionId: string, key: string) => {
  const h = sha256(`${revisionId}:${key}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const denied = (reason: string) => ({ status: 'unsupported' as const, reason });
const supported = {
  status: 'supported' as const,
  authority: 'source' as const,
  review: null,
  kernel: null,
};
export function representationHash(e: ExtractionEvidence) {
  return sha256(canonicalContent(e));
}
export function revisionPreparation(
  e: ExtractionEvidence,
  binding: SourceBinding,
  title: string,
): RevisionPreparation {
  const unresolved = e.elements.filter(
    (x) => x.payload.kind === 'unresolved' || x.warnings.length || x.channel !== 'visible',
  ).length;
  const reasons = [
    ...new Set([
      ...e.warnings,
      ...e.surfaces.flatMap((p) => p.warnings),
      ...e.elements.flatMap((u) => u.warnings),
    ]),
  ].slice(0, 32);
  return {
    binding,
    kind: e.format,
    title,
    originalHash: e.originalHash,
    representationHash: representationHash(e),
    extractor: M2_EXTRACTOR,
    interpretationVersion: `native.${sha256(`${e.parserVersion}:${e.rendererVersion}`).slice(0, 16)}`,
    correctionOf: null,
    model: null,
    promptHash: null,
    pageCount: e.pageCount,
    slideCount: e.slideCount,
    shapeRegistry: e.shapeRegistry,
    ...(e.nativeLocators ? {nativeLocators:e.nativeLocators} : {}),
    coverage: {
      status: unresolved || reasons.length ? 'partial' : 'complete',
      totalUnits: e.elements.length,
      processedUnits: e.elements.length,
      unresolvedUnits: unresolved,
      omittedUnits: unresolved ? null : 0,
      reasons,
    },
    conversion: null,
  };
}
export function produceContentUnits(
  raw: ExtractionEvidence,
  revision: SourceRevision,
): ContentUnit[] {
  const e = extractionEvidenceSchema.parse(raw);
  if (
    e.originalHash !== revision.source.originalHash ||
    representationHash(e) !== revision.representationHash
  )
    throw new Error('M2_REPRESENTATION_PIN_MISMATCH');
  const units: ContentUnit[] = [];
  for (const [ordinal, element] of e.elements.entries()) {
    const loc = element.locator,
      captionRegion = 'region' in loc ? loc.region : null,
      geometry = 'region' in loc && !!loc.region;
    let payload = element.payload;
    const surface = (l: ContentUnit['locator']) =>
      l.kind === 'pdf' ? l.page : l.kind === 'slide' ? l.slide : 0;
    const earlierHeading = [...units]
      .reverse()
      .find(
        (u) =>
          u.payload.kind === 'heading' &&
          surface(u.locator) === surface(loc) &&
          u.sourceChannel === element.channel,
      );
    if (
      payload.kind === 'paragraph' &&
      /^(?:Figure|Fig\.|Table|Chart)\s+\d+[.:]/i.test(payload.text) &&
      captionRegion
    ) {
      const target = [...units]
        .reverse()
        .find(
          (u) =>
            ['figure', 'table', 'chart', 'diagram'].includes(u.payload.kind) &&
            surface(u.locator) === surface(loc) &&
            'region' in u.locator &&
            u.locator.region &&
            Math.abs(captionRegion.y - (u.locator.region.y + u.locator.region.height)) < 0.12,
        );
      if (target) payload = { kind: 'caption', text: payload.text, describes: target.id };
    }
    const nativeHighlight = ['docx','txt','markdown'].includes(loc.kind);
    const u: ContentUnit = {
      schemaVersion: 'petros.v2.content-unit.v1',
      sourceChannel: element.channel,
      ...(element.native ? {native:element.native} : {}),
      id: stableUnitId(revision.id, element.key),
      institutionId: revision.source.institutionId,
      sourceId: revision.source.id,
      sourceRevisionId: revision.id,
      sourceHash: e.originalHash,
      representationHash: revision.representationHash,
      parentId: element.parentKey ? units.find(u => u.id === stableUnitId(revision.id,element.parentKey!))?.id ?? null :
        (nativeHighlight ? null : earlierHeading?.id ?? null),
      ordinal,
      locator: element.locator,
      payload,
      contentHash: '0'.repeat(64),
      quality: {
        state:
          element.payload.kind === 'unresolved'
            ? 'unsupported'
            : element.warnings.length
              ? 'ambiguous'
              : 'extracted',
        confidence: null,
        uncertainties: element.warnings,
        review: null,
      },
      capabilities: {
        display: supported,
        cite: supported,
        highlight: geometry || nativeHighlight ? supported : denied('Exact source geometry unavailable.'),
        edit: denied('M2 preserves source; editing requires qualified review.'),
        explain: denied('M3 academic approval required.'),
        compute: denied('No reviewed computation interpretation.'),
        assess: denied('M2 never admits assessment.'),
      },
      processing: revision.processing,
      searchableText: element.text,
      assets: [],
      concepts: [],
      relationships: [],
      claims: [],
    };
    u.contentHash = sha256(contentUnitHashInput(u));
    validateUnitProvenance(u, revision);
    units.push(parseBoundedContentUnit(u));
  }
  for (const receipt of revision.visualReceipts ?? []) {
    const source = units.find(
      (u) => canonicalContent(u.locator) === canonicalContent(receipt.locator),
    );
    if (!source || !receipt.text) continue;
    const unit: ContentUnit = {
      ...source,
      id: stableUnitId(revision.id, `${receipt.key}.ocr`),
      ordinal: units.length,
      parentId: source.id,
      payload: {
        kind: 'unresolved',
        original: receipt.text,
        reason: 'Uncalibrated OCR transcription; visual relationships require review.',
      },
      searchableText: receipt.text,
      quality: {
        state: 'ambiguous',
        confidence: null,
        review: null,
        uncertainties: [
          'Local OCR is separate from native extraction; text, labels and equations need visual review.',
        ],
      },
    };
    unit.contentHash = sha256(contentUnitHashInput(unit));
    validateUnitProvenance(unit, revision);
    units.push(parseBoundedContentUnit(unit));
  }
  return units;
}
/** Reproducible prioritization; no model scores, no whole-library dispatch. */
export function selectVisualRegions(e: ExtractionEvidence, objective = '') {
  const terms = objective.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  return e.elements
    .filter(
      (x) =>
        x.channel === 'visible' &&
        ['figure', 'diagram', 'chart', 'unresolved'].includes(x.payload.kind),
    )
    .map((x) => {
      const number =
        x.locator.kind === 'pdf'
          ? x.locator.page
          : x.locator.kind === 'slide'
            ? x.locator.slide
            : 0;
      const surface = e.surfaces[number - 1],
        near = e.elements
          .filter(
            (y) =>
              y.locator.kind === x.locator.kind &&
              (y.locator.kind === 'pdf'
                ? y.locator.page
                : y.locator.kind === 'slide'
                  ? y.locator.slide
                  : 0) === number,
          )
          .map((y) => y.text)
          .join(' ');
      return {
        key: x.key,
        locator: x.locator,
        sourceHash: e.originalHash,
        method: 'not_run' as const,
        score:
          (x.payload.kind === 'figure' ? 6 : 3) +
          (surface && surface.text.length < 200 ? 4 : 0) +
          (/figure|caption/i.test(near) ? 2 : 0) +
          terms.filter((t) => near.toLowerCase().includes(t)).length,
        reason: 'Visual content or unresolved structure; bounded native heuristic.',
        status: 'review_required' as const,
      };
    })
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .slice(0, M2_LIMITS.regions);
}

/** Existing knowledge ownership, original storage and M1 repository; disabled outside isolated tests. */
@Injectable()
export class PetrosContentIntelligenceService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly pdf: PdfContentAdapter,
    private readonly pptx: PptxContentAdapter,
    private readonly units: PetrosContentUnitRepository,
    private readonly preparations: KnowledgePreparationRepository,
    private readonly gateway: PetrosAiGatewayService,
    private readonly docx?: DocxContentAdapter,
    private readonly txt?: TxtContentAdapter,
    private readonly markdown?: MarkdownContentAdapter,
  ) {}
  get enabled() {
    return this.env.NODE_ENV === 'test' && this.env.PETROS_M2_ISOLATED_ENABLED === true;
  }
  private admit() {
    if (!this.enabled) throw new ConflictException('PETROS_M2_ISOLATED_GATE_CLOSED');
  }
  async extractBytes(
    buffer: Buffer,
    format: 'pdf' | 'pptx' | 'legacy_ppt' | 'docx' | 'txt' | 'markdown',
    signal: AbortSignal,
    progress?: (page: number) => void,
  ) {
    signal.throwIfAborted();
    if (buffer.length > M2_LIMITS.bytes || !buffer.length)
      throw new PdfPreparationError('PETROS_DOCUMENT_LIMIT');
    if (format === 'legacy_ppt') {
      if (!buffer.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex')))
        throw new PdfPreparationError('PETROS_M2_LEGACY_INVALID');
      try {
        await convertPresentationForM2(buffer, 'ppt', signal);
      } catch {
        throw new PdfPreparationError('PETROS_M2_LEGACY_ISOLATION_REQUIRED');
      }
      throw new PdfPreparationError('PETROS_M2_LEGACY_ISOLATION_REQUIRED');
    }
    const adapter = {pdf:this.pdf,pptx:this.pptx,docx:this.docx,txt:this.txt,markdown:this.markdown}[format];
    if (!adapter) throw new PdfPreparationError('PETROS_M2_UNSUPPORTED_FORMAT');
    return adapter.extract(buffer,signal,progress);
  }
  private scoped<T>(scope: ReadinessScope, work: () => Promise<T>) {
    return runInScopedTenant(this.db, scope, work);
  }
  async enqueue(scope: ReadinessScope, binding: SourceBinding) {
    this.admit();
    return this.scoped(scope, async () => {
      const original = await this.units.resolveOriginal(binding, undefined, true);
      this.format(original.file.mimeType, original.file.filename);
      if (original.file.sizeBytes > M2_LIMITS.bytes)
        throw new PdfPreparationError('PETROS_DOCUMENT_LIMIT');
      return this.preparations.enqueueV2(
        original.actor.institutionId,
        original.actor.userId!,
        binding,
        M2_EXTRACTOR,
      );
    });
  }
  private format(mime: string | null, filename?: string | null) {
    const extension = filename?.split('.').at(-1)?.toLowerCase();
    const native = mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? 'docx' :
      mime === 'text/markdown' ? 'markdown' : mime === 'text/plain' ? 'txt' : null;
    if (native) {
      if (!extension || (native === 'markdown' ? extension !== 'md' : extension !== native))
        throw new PdfPreparationError('PETROS_M2_TYPE_MISMATCH');
      return native;
    }
    if (mime === 'application/pdf') return 'pdf' as const;
    if (mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
      return 'pptx' as const;
    if (mime === 'application/vnd.ms-powerpoint') return 'legacy_ppt' as const;
    throw new PdfPreparationError('PETROS_M2_UNSUPPORTED_FORMAT');
  }
  private async source(scope: ReadinessScope, claim: Preparation, lock = false) {
    return this.scoped(scope, async () => {
      const row = await this.preparations.assertLease(claim);
      if (row.requestedBy !== scope.institutionUserId || row.extractorVersion !== M2_EXTRACTOR)
        throw new NotFoundException('M2_SOURCE_UNAVAILABLE');
      return this.units.resolveOriginal(row.sourceBinding, undefined, true, lock);
    });
  }
  /** Parser/model stages never run inside a database transaction. Final revision+units+receipt are atomic. */
  async run(
    scope: ReadinessScope,
    id: string,
    signal: AbortSignal,
    onStage: (stage: M2Stage) => void = () => {},
  ) {
    this.admit();
    signal.throwIfAborted();
    if (!scope.institutionId || !scope.institutionUserId || scope.studentId)
      throw new NotFoundException('M2_AUTHENTICATED_SCOPE_REQUIRED');
    const institutionId = scope.institutionId;
    const claim = await this.scoped(scope, async () => {
      const row = await this.preparations.get(institutionId, id, true, 'v2');
      if (row.requestedBy !== scope.institutionUserId)
        throw new NotFoundException('M2_SOURCE_UNAVAILABLE');
      return this.preparations.claim(institutionId, id, 'v2');
    });
    if (!claim) return { status: 'not_claimed' as const };
    const cancel = new AbortController(),
      abort = () => cancel.abort();
    signal.addEventListener('abort', abort, { once: true });
    const deadline = setTimeout(abort, 55_000);
    const stage = async (value: M2Stage) => {
      cancel.signal.throwIfAborted();
      await this.scoped(scope, () => this.preparations.markM2Stage(claim, value));
      onStage(value);
    };
    let pulse: Promise<void> | undefined;
    let pages = 0;
    const timer = setInterval(() => {
      if (pulse) return;
      pulse = this.source(scope, claim)
        .then(() => this.scoped(scope, () => this.preparations.heartbeat(claim, pages)))
        .catch(() => cancel.abort())
        .finally(() => {
          pulse = undefined;
        });
    }, 1000);
    try {
      await stage('validating_source');
      const source = await this.source(scope, claim);
      const driver = new LocalDiskDriver(this.env);
      await stage('scanning');
      if (source.file.processingStatus !== 'ready')
        throw new PdfPreparationError('PETROS_M2_SCAN_NOT_READY');
      if (
        source.file.sizeBytes > M2_LIMITS.bytes ||
        (await driver.size(source.file.storageKey)) !== source.file.sizeBytes
      )
        throw new PdfPreparationError('PETROS_M2_SOURCE_SIZE');
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const raw of driver.stream(source.file.storageKey)) {
        cancel.signal.throwIfAborted();
        const b = Buffer.from(raw);
        bytes += b.length;
        if (bytes > M2_LIMITS.bytes) throw new PdfPreparationError('PETROS_DOCUMENT_LIMIT');
        chunks.push(b);
      }
      const buffer = Buffer.concat(chunks);
      if (buffer.length !== source.file.sizeBytes || sha256(buffer) !== source.file.checksumSha256)
        throw new PdfPreparationError('PETROS_M2_HASH_MISMATCH');
      const format = this.format(source.file.mimeType,source.file.filename);
      const nativeFormat = ['docx','txt','markdown'].includes(format);
      if (nativeFormat) await stage('format_detection');
      await stage('extracting');
      const start = performance.now();
      const e = await this.extractBytes(
        buffer,
        format,
        cancel.signal,
        (n) => {
          pages = n;
        },
      );
      const elapsed = performance.now() - start;
      if (nativeFormat) {
        await stage('structural_validation');
        await stage('content_unit_construction');
      }
      if (format === 'pdf' || format === 'pptx') await stage('rendering');
      if (format === 'pdf' || format === 'pptx') await stage('selecting_visual_regions');
      const visual = format === 'pdf' || format === 'pptx' ? selectVisualRegions(e) : [];
      if (visual.length) await stage('interpreting_visual_regions');
      const ocrStart = performance.now(),
        ocr = visual.length ? await extractSelectedOcr(
          e,
          visual.map((v) => v.key),
          cancel.signal,
        ) : [],
        ocrMs = performance.now() - ocrStart;
      const receipts: NonNullable<SourceRevision['visualReceipts']> = ocr.flatMap((o) =>
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
                reviewRequired: true as const,
              },
            ]
          : [],
      );
      await stage(format === 'pdf' || format === 'pptx' ? 'interpreting_semantics' : 'semantic_eligibility');
      const semantic = {
        status: 'unavailable' as const,
        reason: 'provider_authorization_absent',
        liveVerified: false,
      };
      await stage('validating_provenance');
      clearInterval(timer);
      await pulse;
      cancel.signal.throwIfAborted();
      const result = await this.scoped(scope, async () => {
        await this.source(scope, claim, true);
        await this.units.resolveOriginal(claim.sourceBinding, e.originalHash, true, true);
        await this.preparations.assertLease(claim);
        await this.preparations.markM2Stage(claim, 'persisting');
        onStage('persisting');
        const binding = claim.sourceBinding as SourceBinding;
        const preparation = revisionPreparation(
          e,
          binding,
          source.file.filename || 'Authorized source',
        );
        const extra = receipts.filter((r) => r.text).length;
        const revision = await this.units.prepareRevision({
          ...preparation,
          visualReceipts: receipts,
          interpretationVersion: `${preparation.interpretationVersion}.ocr.${sha256(canonicalContent(receipts)).slice(0, 16)}`,
          coverage: {
            ...preparation.coverage,
            status: extra ? 'partial' : preparation.coverage.status,
            totalUnits: e.elements.length + extra,
            processedUnits: e.elements.length + extra,
            unresolvedUnits: preparation.coverage.unresolvedUnits + extra,
            reasons: [
              ...preparation.coverage.reasons,
              ...(extra ? ['Uncalibrated OCR transcription requires visual review.'] : []),
            ].slice(0, 32),
          },
        });
        const units = produceContentUnits(e, revision);
        let batch: ContentUnit[] = [],
          size = 0;
        for (const unit of units) {
          const n = Buffer.byteLength(JSON.stringify(unit));
          if (batch.length === 100 || size + n > 500 * 1024) {
            await this.units.persist(batch);
            batch = [];
            size = 0;
          }
          batch.push(unit);
          size += n;
        }
        if (batch.length) await this.units.persist(batch);
        cancel.signal.throwIfAborted();
        await this.units.resolveOriginal(binding, e.originalHash, true, true);
        await this.preparations.heartbeat(claim, pages);
        await this.preparations.complete(claim, {
          stage: revision.coverage.status === 'complete' ? 'completed' : 'partially_supported',
          revisionId: revision.id,
        });
        return { revision, unitCount: units.length };
      });
      const status =
        result.revision.coverage.status === 'complete'
          ? ('completed' as const)
          : ('partially_supported' as const);
      onStage(status);
      return {
        status,
        ...result,
        visual,
        ocr,
        semantic,
        timing: {
          extractionAndRenderingMs: elapsed,
          semanticMs: 0,
          visionMs: ocrMs,
          queueMs: null,
        },
        teachingReady: false,
      };
    } catch (error) {
      const code = cancel.signal.aborted
        ? 'PETROS_PREPARATION_CANCELLED'
        : error instanceof PdfPreparationError
          ? error.code
          : error instanceof NotFoundException
            ? 'PETROS_M2_SOURCE_REVOKED'
            : 'PETROS_M2_VALIDATION_OR_INFRASTRUCTURE';
      try {
        await this.scoped(scope, () =>
          this.preparations.fail(
            claim,
            code,
            error instanceof PdfPreparationError && error.retryable,
          ),
        );
      } catch {
        /* RLS withdrawal deliberately hides cancelled/revoked receipts. */
      }
      onStage(cancel.signal.aborted ? 'cancelled' : 'blocked');
      throw new PdfPreparationError(code, error instanceof PdfPreparationError && error.retryable, {
        cause: error,
      });
    } finally {
      clearTimeout(deadline);
      clearInterval(timer);
      await pulse;
      signal.removeEventListener('abort', abort);
    }
  }
  async interpret(
    scope: ReadinessScope,
    revisionId: string,
    authorization: InterpretationAuthorization | undefined,
    signal: AbortSignal,
    objective?: string,
    unitId?: string,
  ) {
    this.admit();
    if (authorization?.sourceReservation && (
      scope.studentId || scope.institutionId !== authorization.sourceReservation.institutionId ||
      scope.institutionUserId !== authorization.sourceReservation.staffActorId
    )) throw new Error('M2_SOURCE_ACTOR_MISMATCH');
    const lookup = await this.scoped(scope, () => this.units.lookup(revisionId, { limit: 8, ...(unitId ? {unitId} : {}) }));
    if (lookup.status !== 'available') throw new NotFoundException('M2_SOURCE_UNAVAILABLE');
    const auth = authorization
      ? {
          ...authorization,
          databaseScope: <T>(work: () => Promise<T>) => this.scoped(scope, work),
          authorizeAttempt: async () => {
            await this.scoped(scope, () =>
              this.units.resolveOriginal(
                lookup.revision.source.binding,
                lookup.revision.source.originalHash,
                true,
              ),
            );
            if (authorization.sourceReservation) {
              const reservation = authorization.sourceReservation;
              const preparation = await this.scoped(scope, () =>
                this.preparations.get(reservation.institutionId, reservation.preparationId, false, 'v2'));
              if (preparation.state !== 'succeeded' || preparation.fence !== reservation.fence ||
                preparation.requestedBy !== scope.institutionUserId || preparation.m2Progress?.revisionId !== revisionId)
                throw new Error('M2_SOURCE_PREPARATION_STALE');
            }
            await authorization.authorizeAttempt();
          },
        }
      : undefined;
    return interpretWithGateway(
      this.gateway,
      lookup.revision,
      lookup.units,
      auth,
      signal,
      objective,
    );
  }
  /** Append bounded candidate interpretation and copied extraction under another immutable M1 revision. */
  async appendInterpretation(
    scope: ReadinessScope,
    revisionId: string,
    result: Awaited<ReturnType<typeof interpretWithGateway>>,
  ) {
    this.admit();
    if (result.status !== 'proposed' || result.receipt.promptHash !== sha256(M2_SYSTEM))
      throw new Error('M2_INTERPRETATION_RECEIPT_REQUIRED');
    return this.scoped(scope, async () => {
      const lookup = await this.units.lookup(revisionId, { limit: 50 });
      if (lookup.status !== 'available' || lookup.nextAfterOrdinal !== null || lookup.truncated)
        throw new Error('M2_INTERPRETATION_SOURCE_BUDGET');
      const base = lookup.revision;
      if (result.sourceReservation) {
        const reservation = result.sourceReservation;
        const preparation = await this.preparations.get(reservation.institutionId, reservation.preparationId, false, 'v2');
        if (reservation.staffActorId !== scope.institutionUserId || reservation.institutionId !== scope.institutionId ||
          reservation.sourceRevisionId !== revisionId || reservation.sourceHash !== base.source.originalHash ||
          Date.parse(reservation.expiresAt) <= Date.now() || preparation.state !== 'succeeded' ||
          preparation.fence !== reservation.fence || preparation.m2Progress?.revisionId !== revisionId)
          throw new Error('M2_SOURCE_PREPARATION_STALE');
      }
      await this.units.resolveOriginal(base.source.binding, base.source.originalHash, true, true);
      const raw = {
        schemaVersion: M2_PROMPT,
        uncertainties: result.interpretation.uncertainties,
        proposals: result.interpretation.proposals.map((p) => ({
          kind: p.kind,
          statement: p.statement,
          support: p.support,
          relatedUnitId: p.relatedUnitId,
          diagramEdge: p.diagramEdge,
        })),
      };
      const checked = validateInterpretation(raw, base, lookup.units);
      const receipt = {
        verification: result.verification as
          | 'controlled_provider_response'
          | 'authorized_live_response',
        ...result.receipt,
      };
      const revision = await this.units.prepareRevision({
        binding: base.source.binding,
        kind: base.source.kind,
        title: base.source.title,
        originalHash: base.source.originalHash,
        representationHash: base.representationHash,
        extractor: base.processing.extractor,
        interpretationVersion: `semantic.${sha256(canonicalContent({ raw, receipt })).slice(0, 32)}`,
        correctionOf: base.id,
        model: `model.${sha256(receipt.model).slice(0, 24)}`,
        promptHash: receipt.promptHash,
        pageCount: base.pageCount,
        slideCount: base.slideCount,
        shapeRegistry: base.shapeRegistry,
        conversion: base.conversion,
        interpretationReceipt: receipt,
        ...(base.nativeLocators ? {nativeLocators:base.nativeLocators} : {}),
        ...(base.visualReceipts ? { visualReceipts: base.visualReceipts } : {}),
        coverage: {
          ...base.coverage,
          status: 'partial',
          totalUnits: lookup.units.length + checked.proposals.length,
          processedUnits: lookup.units.length + checked.proposals.length,
          unresolvedUnits: base.coverage.unresolvedUnits + checked.proposals.length,
          reasons: [
            ...base.coverage.reasons,
            'Semantic proposals require qualified human review.',
          ].slice(0, 32),
        },
      });
      const ids = new Map(
        lookup.units.map((u) => [u.id, stableUnitId(revision.id, `native.${u.ordinal}`)]),
      );
      const copied = lookup.units.map((original) => {
        const u: ContentUnit = {
          ...original,
          id: ids.get(original.id)!,
          sourceRevisionId: revision.id,
          processing: revision.processing,
          parentId: original.parentId ? ids.get(original.parentId)! : null,
          claims: [],
          relationships: [],
          assets: [],
        };
        if (u.payload.kind === 'caption')
          u.payload = { ...u.payload, describes: ids.get(u.payload.describes)! };
        u.contentHash = sha256(contentUnitHashInput(u));
        return parseBoundedContentUnit(u);
      });
      const proposed = checked.proposals.map((p, index) => {
        const support = p.support.map((s) =>
          referenceFor(
            copied.find((u) => u.id === ids.get(s.reference.unitId))!,
            s.reference.semanticId,
          ),
        );
        const evidence = copied.find((u) => u.id === support[0]!.unitId)!;
        const u: ContentUnit = {
          ...evidence,
          id: stableUnitId(revision.id, `proposal.${index}`),
          ordinal: copied.length + index,
          parentId: null,
          sourceChannel: 'visible',
          payload: {
            kind: 'unresolved',
            original: null,
            reason: `Candidate ${p.kind}; entailment requires qualified review.`,
          },
          searchableText: p.statement,
          quality: {
            state: 'ambiguous',
            confidence: null,
            review: null,
            uncertainties: [`Support check: ${p.supportStatus}.`, ...checked.uncertainties].slice(
              0,
              32,
            ),
          },
          claims: [
            {
              id: stableUnitId(revision.id, `claim.${index}`),
              statement: p.statement,
              origin: 'model',
              status: 'proposed',
              support,
              review: null,
            },
          ],
          relationships: [],
        };
        if (p.relatedUnitId && ['evidence', 'warrant', 'counterargument'].includes(p.kind))
          u.relationships = [
            {
              id: stableUnitId(revision.id, `relationship.${index}`),
              fromUnitId: u.id,
              toUnitId: ids.get(p.relatedUnitId)!,
              kind: p.kind as 'evidence' | 'warrant' | 'counterargument',
              origin: 'proposed_interpretation',
              support,
              review: null,
            },
          ];
        u.contentHash = sha256(contentUnitHashInput(u));
        return parseBoundedContentUnit(u);
      });
      await this.units.persist(copied);
      if (proposed.length) await this.units.persist(proposed);
      await this.units.resolveOriginal(base.source.binding, base.source.originalHash, true, true);
      return {
        revision,
        unitCount: copied.length + proposed.length,
        liveVerified: result.liveVerified,
        teachingReady: false,
      };
    });
  }
  async retrieve(scope: ReadinessScope, sourceRevisionId: string, query?: string, unitId?: string) {
    this.admit();
    const primary = await this.scoped(scope, () =>
      this.units.lookup(sourceRevisionId, {
        limit: 4,
        visibleOnly:true,
        ...(query ? { query } : {}),
        ...(unitId ? { unitId } : {}),
      }),
    );
    if (primary.status !== 'available') return primary;
    if (!primary.units.length)
      return {
        status: 'content_gap' as const,
        reason: 'No matching authorized source evidence.',
        units: [],
      };
    const adjacent = await this.scoped(scope, () =>
      this.units.lookup(sourceRevisionId, {
        limit: 4,
        visibleOnly:true,
        adjacentOrdinal: primary.units[0]!.ordinal,
        contextOf: primary.units.map((u) => u.id),
      }),
    );
    if (adjacent.status !== 'available') return adjacent;
    const units = [
      ...new Map([...primary.units, ...adjacent.units].map((u) => [u.id, u])).values(),
    ].slice(0, 8);
    await this.scoped(scope, () =>
      this.units.resolveOriginal(
        primary.revision.source.binding,
        primary.revision.source.originalHash,
      ),
    );
    return { status: 'available' as const, revision: primary.revision, units, passes: 2 };
  }
  async recover(scope: ReadinessScope) {
    this.admit();
    return this.scoped(scope, () => this.preparations.dueV2());
  }
  async status(scope: ReadinessScope, id: string) {
    this.admit();
    return this.scoped(scope, async () => {
      if (!scope.institutionId) throw new NotFoundException('M2_SOURCE_UNAVAILABLE');
      const row = await this.preparations.get(scope.institutionId, id, false, 'v2');
      return {
        id: row.id,
        state: row.state,
        version: row.version,
        fence: row.fence,
        stage: row.m2Progress?.stage ?? row.state,
        revisionId: row.m2Progress?.revisionId ?? null,
        pagesDone: row.pagesDone,
        errorCode: row.errorCode,
        retryable: row.retryable,
      };
    });
  }
  async command(scope: ReadinessScope, id: string, version: number, action: 'cancel' | 'retry') {
    this.admit();
    if (!scope.institutionId || !scope.institutionUserId || scope.studentId)
      throw new NotFoundException('M2_AUTHENTICATED_SCOPE_REQUIRED');
    const institutionId = scope.institutionId;
    return this.scoped(scope, async () => {
      const row = await this.preparations.get(institutionId, id, true, 'v2');
      if (row.requestedBy !== scope.institutionUserId)
        throw new NotFoundException('M2_SOURCE_UNAVAILABLE');
      if (action === 'retry') await this.units.resolveOriginal(row.sourceBinding, undefined, true);
      return this.preparations.command(institutionId, id, version, action, 'v2');
    });
  }
  /** Original bytes are reauthorized and rehashed; no public URL, unbounded image or cache grant. */
  async inspectSurface(
    scope: ReadinessScope,
    revisionId: string,
    surface: number,
    signal: AbortSignal,
  ) {
    this.admit();
    if (!Number.isInteger(surface) || surface < 1 || surface > 30)
      throw new Error('M2_SURFACE_LIMIT');
    const { revision, evidence: e } = await this.inspectionEvidence(scope, revisionId, signal);
    const page = e.surfaces[surface - 1];
    if (!page) throw new NotFoundException('M2_SURFACE_UNAVAILABLE');
    return {
      revisionId,
      originalHash: revision.source.originalHash,
      number: surface,
      preview: page.preview,
      transform: page.transform,
      warnings: page.warnings,
    };
  }
  async inspectCrop(scope: ReadinessScope, revisionId: string, key: string, signal: AbortSignal) {
    this.admit();
    const { revision, evidence } = await this.inspectionEvidence(scope, revisionId, signal);
    const receipt = revision.visualReceipts?.find((r) => r.key === key);
    if (!receipt) throw new NotFoundException('M2_CROP_UNAVAILABLE');
    const result = await extractSourceCrop(evidence, key, signal);
    if (
      !result ||
      result.crop.hash !== receipt.cropHash ||
      canonicalContent(result.crop.pixels) !== canonicalContent(receipt.pixels) ||
      canonicalContent(result.locator) !== canonicalContent(receipt.locator)
    )
      throw new Error('M2_CROP_REVISION_CHANGED');
    await this.scoped(scope, () =>
      this.units.resolveOriginal(revision.source.binding, revision.source.originalHash),
    );
    signal.throwIfAborted();
    return {
      revisionId,
      originalHash: revision.source.originalHash,
      key,
      crop: result.crop,
      locator: result.locator,
    };
  }
  /** Native source/asset regeneration always reuses current original entitlement and exact pins. */
  async inspectNativeUnit(scope: ReadinessScope, revisionId: string, unitId: string, signal: AbortSignal, anchorId?: string) {
    this.admit();
    const lookup = await this.scoped(scope, () => this.units.lookup(revisionId,{unitId,limit:1}));
    if (lookup.status !== 'available' || !lookup.units[0]) throw new NotFoundException('M2_SOURCE_UNAVAILABLE');
    const unit = lookup.units[0];
    if (!['docx','txt','markdown'].includes(unit.locator.kind)) throw new Error('M2_NATIVE_SOURCE_REQUIRED');
    const {revision,evidence} = await this.inspectionEvidence(scope,revisionId,signal);
    const element = evidence.elements.find(e => stableUnitId(revision.id,e.key) === unitId);
    if (!element || canonicalContent(element.locator) !== canonicalContent(unit.locator)) throw new Error('M2_NATIVE_UNIT_CHANGED');
    const anchor = anchorId ? element.native?.cells?.find(c=>c.id===anchorId)?.locator ??
      element.native?.runs?.find(r=>r.id===anchorId)?.locator : element.locator;
    if (!anchor) throw new NotFoundException('M2_NATIVE_ANCHOR_UNAVAILABLE');
    await this.scoped(scope, () => this.units.resolveOriginal(revision.source.binding,revision.source.originalHash));
    signal.throwIfAborted();
    return {revisionId,unitId,sourceHash:revision.source.originalHash,locator:anchor,native:element.native,
      source: evidence.nativeDocument, image:element.sourceImage ?? null, fidelity:'native_structure' as const};
  }
  private async inspectionEvidence(scope: ReadinessScope, revisionId: string, signal: AbortSignal) {
    const lookup = await this.scoped(scope, () => this.units.lookup(revisionId, { limit: 1 }));
    if (lookup.status !== 'available') throw new NotFoundException('M2_SOURCE_UNAVAILABLE');
    const revision = lookup.revision,
      original = await this.scoped(scope, () =>
        this.units.resolveOriginal(revision.source.binding, revision.source.originalHash),
      );
    const driver = new LocalDiskDriver(this.env);
    if (
      original.file.sizeBytes > M2_LIMITS.bytes ||
      (await driver.size(original.file.storageKey)) !== original.file.sizeBytes
    )
      throw new Error('M2_SOURCE_SIZE');
    const buffer = await driver.read(original.file.storageKey);
    if (sha256(buffer) !== revision.source.originalHash) throw new Error('M2_SOURCE_HASH');
    const e = await this.extractBytes(buffer, this.format(original.file.mimeType, original.file.filename), signal);
    if (representationHash(e) !== revision.representationHash)
      throw new Error('M2_RENDERER_REVISION_CHANGED');
    await this.scoped(scope, () =>
      this.units.resolveOriginal(revision.source.binding, revision.source.originalHash),
    );
    signal.throwIfAborted();
    return { revision, evidence: e };
  }
}
