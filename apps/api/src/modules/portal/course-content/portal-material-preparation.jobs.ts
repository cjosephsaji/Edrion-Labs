import {
  Inject,
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { and, eq, sql, schema, runInInstitutionTenant, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import { canAll } from '@edrion/permissions';
import type { AuditWriter } from '@edrion/audit';
import { PETROS_DOCUMENT_MAX_FILE_BYTES, petrosPreparationJobSchema } from '@edrion/schemas';
import { API_ENV, DATABASE, AUDIT_WRITER } from '../../../common/tokens';
import { JobsService } from '../../../common/queue/jobs.service';
import { QueueWorkers } from '../../../common/queue/queue.worker';
import {
  KnowledgePreparationRepository,
  type Preparation,
} from '../../student/knowledge/knowledge-preparation.repository';
import {
  KnowledgePdfProcess,
  PdfPreparationError,
} from '../../student/knowledge/knowledge-pdf-process';
import { LocalDiskDriver } from '../../student/storage/drivers/local-disk.driver';
import { PortalAuthService } from '../portal-auth.service';
import { basePortalAudit, type PortalActionContext } from '../portal-action-context';
import { PortalCourseContentService } from './portal-course-content.service';

export const PETROS_PDF_JOB = 'knowledge.pdf.prepare';

/** BullMQ delivers IDs; the durable knowledge record owns admission, leases and results. */
@Injectable()
export class PortalMaterialPreparationJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PortalMaterialPreparationJobs.name);
  private timer?: NodeJS.Timeout;
  private dispatching = false;
  private readonly active = new Set<AbortController>();
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    private readonly repository: KnowledgePreparationRepository,
    private readonly parser: KnowledgePdfProcess,
    private readonly content: PortalCourseContentService,
    private readonly auth: PortalAuthService,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  get enabled() {
    return Boolean(
      this.env.PETROS_PDF_PREPARATION_ENABLED &&
      this.env.REDIS_ENABLED &&
      this.env.QUEUE_WORKERS_ENABLED,
    );
  }

  onModuleInit() {
    this.workers.register(PETROS_PDF_JOB, async (job) => {
      if (!this.enabled) throw new Error('PETROS_PREPARATION_DISABLED');
      const data = petrosPreparationJobSchema.parse(job.data);
      return this.execute(data.institutionId, data.id);
    });
    if (this.enabled) {
      this.timer = setInterval(
        () =>
          void this.dispatch().catch(() =>
            this.logger.warn('PDF preparation dispatch unavailable; durable work remains queued.'),
          ),
        5000,
      );
      this.timer.unref();
      void this.dispatch().catch(() =>
        this.logger.warn('PDF preparation dispatch unavailable; durable work remains queued.'),
      );
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    for (const signal of this.active) signal.abort();
  }

  async dispatch() {
    if (!this.enabled || !this.jobs.enabled || this.dispatching) return;
    this.dispatching = true;
    try {
      const due = await this.repository.due();
      // No content in Redis. A lost/ambiguous enqueue is safely redelivered after the dispatch interval.
      for (const row of due)
        await this.jobs.enqueue(
          'imports',
          PETROS_PDF_JOB,
          { id: row.id, institutionId: row.institution_id },
          {
            jobId: `petros-pdf-${row.id}-${row.dispatch_sequence}`,
            attempts: 1,
            removeOnComplete: true,
          },
        );
    } finally {
      this.dispatching = false;
    }
  }

  async status(ctx: PortalActionContext, materialId: string) {
    await this.content.get('materials', ctx, materialId);
    const row = await this.repository.latest(materialId);
    return row ? this.repository.status(row, this.enabled) : null;
  }

  async command(
    ctx: PortalActionContext,
    materialId: string,
    id: string,
    version: number,
    action: 'cancel' | 'retry',
  ) {
    await this.content.get('materials', ctx, materialId);
    const row = await this.repository.get(ctx.principal.institutionId, id);
    if (row.materialId !== materialId) throw new NotFoundException('Preparation unavailable');
    if (action === 'retry') await this.authorize(row);
    const updated = await this.repository.command(ctx.principal.institutionId, id, version, action);
    if (updated.version !== row.version)
      await this.audit.logAudit({
        ...basePortalAudit(ctx),
        action: `class_material.preparation.${action}`,
        module: 'portal-course-content',
        entityType: 'knowledge_preparation',
        entityId: id,
        newState: { state: updated.state, version: updated.version },
      } as Parameters<AuditWriter['logAudit']>[0]);
    return this.repository.status(updated, this.enabled);
  }

  async execute(institutionId: string, id: string) {
    // One PDF per API process; institution claims additionally cap concurrency across replicas.
    if (this.active.size) return;
    const abort = new AbortController();
    this.active.add(abort);
    let claim: Preparation | null = null;
    let heartbeat: NodeJS.Timeout | undefined;
    let pages = 0;
    let pulse: Promise<void> | undefined;
    try {
      claim = await this.scoped(institutionId, async () => {
        const pending = await this.repository.get(institutionId, id);
        await this.authorize(pending, true);
        return this.repository.claim(institutionId, id);
      });
      if (!claim) return;
      const claimed = claim;
      const input = await this.scoped(institutionId, () => this.authorize(claimed));
      const driver = new LocalDiskDriver(this.env);
      if (
        input.file.sizeBytes > PETROS_DOCUMENT_MAX_FILE_BYTES ||
        (await driver.size(input.file.storageKey)) !== input.file.sizeBytes
      )
        throw new PdfPreparationError('PETROS_SOURCE_UNAVAILABLE');
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of driver.stream(input.file.storageKey)) {
        const value = Buffer.from(chunk);
        bytes += value.length;
        if (bytes > PETROS_DOCUMENT_MAX_FILE_BYTES)
          throw new PdfPreparationError('PETROS_DOCUMENT_LIMIT');
        chunks.push(value);
      }
      const buffer = Buffer.concat(chunks);
      if (buffer.length !== input.file.sizeBytes)
        throw new PdfPreparationError('PETROS_SOURCE_UNAVAILABLE');
      heartbeat = setInterval(() => {
        if (pulse) return;
        pulse = this.scoped(institutionId, async () => {
          await this.authorize(claimed);
          await this.repository.heartbeat(claimed, pages);
        })
          .catch(() => abort.abort())
          .finally(() => {
            pulse = undefined;
          });
      }, 1000);
      const result = await this.parser.extract(buffer, abort.signal, (page) => {
        pages = page;
      });
      clearInterval(heartbeat);
      heartbeat = undefined;
      await pulse;
      if (abort.signal.aborted) throw new PdfPreparationError('PETROS_PREPARATION_CANCELLED', true);
      await this.scoped(institutionId, async () => {
        // Material deletion locks the material before cancelling its preparation receipt.
        // Use that same order, then validate the fence under the final publication locks.
        const current = await this.authorize(claimed, true);
        await this.repository.assertLease(claimed);
        if ((await driver.size(current.file.storageKey)) !== current.file.sizeBytes)
          throw new PdfPreparationError('PETROS_SOURCE_UNAVAILABLE');
        await runInInstitutionTenant(this.db, institutionId,
          () => this.content.publishPreparedPdf(current.material, current.file, result), current.principal.institutionUserId);
        await this.repository.heartbeat(claimed, result.pages.length);
        await this.repository.complete(claimed);
      });
    } catch (error) {
      if (!claim) throw error;
      const code =
        error instanceof PdfPreparationError
          ? error.code
          : error instanceof ForbiddenException ||
              error instanceof UnauthorizedException ||
              error instanceof NotFoundException
            ? 'PETROS_SOURCE_UNAVAILABLE'
            : error instanceof ConflictException
              ? 'PETROS_PREPARATION_SOURCE_CHANGED'
              : error instanceof BadRequestException
                ? 'PETROS_PREPARATION_FANOUT_LIMIT'
                : 'PETROS_PREPARATION_INFRASTRUCTURE';
      const retryable =
        error instanceof PdfPreparationError
          ? error.retryable
          : code === 'PETROS_PREPARATION_INFRASTRUCTURE';
      try {
        await this.scoped(institutionId, () => this.repository.fail(claim!, code, retryable));
      } catch (failure) {
        if (!(failure instanceof NotFoundException)) throw failure;
      }
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      await pulse;
      this.active.delete(abort);
    }
  }

  private scoped<T>(institutionId: string, fn: () => Promise<T>) {
    return runInInstitutionTenant(this.db, institutionId, async () => {
      await this.db.execute(sql`set local statement_timeout = '10s'`);
      await this.db.execute(sql`set local lock_timeout = '2s'`);
      return fn();
    });
  }

  private async authorize(row: Preparation, lock = false) {
    if ((row.operationVersion ?? 'v1') !== 'v1' || (row.sourceKind ?? 'material') !== 'material' || !row.materialId || !row.materialVersion)
      throw new ConflictException('Unsupported preparation version');
    if (lock) {
      // Serialize final publication with material replacement/deletion and original revocation.
      await this.db
        .select({ id: schema.classMaterials.id })
        .from(schema.classMaterials)
        .where(eq(schema.classMaterials.id, row.materialId))
        .for('share');
      await this.db
        .select({ id: schema.storageObjects.id })
        .from(schema.storageObjects)
        .where(eq(schema.storageObjects.id, row.objectId))
        .for('share');
    }
    const principal = await this.auth.resolveById(row.requestedBy, null);
    if (
      principal.institutionId !== row.institutionId ||
      !canAll(principal.permissions, ['class_content.manage'])
    )
      throw new ForbiddenException('Publication permission removed');
    const ctx: PortalActionContext = {
      principal,
      scope: row.scope,
      request: { requestId: row.id, correlationId: row.id, apiEndpoint: PETROS_PDF_JOB },
    };
    const material = (await this.content.get(
      'materials',
      ctx,
      row.materialId,
    )) as typeof schema.classMaterials.$inferSelect;
    if (material.version !== row.materialVersion || material.objectId !== row.objectId)
      throw new ConflictException('Material was replaced');
    const [file] = await this.db
      .select()
      .from(schema.storageObjects)
      .where(
        and(
          eq(schema.storageObjects.id, row.objectId),
          eq(schema.storageObjects.institutionId, row.institutionId),
          eq(schema.storageObjects.ownerStaffUserId, row.requestedBy),
        ),
      )
      .limit(1);
    if (!file || file.driver !== 'local' || file.processingStatus !== 'ready')
      throw new NotFoundException('Original source unavailable');
    return { material, file, principal };
  }
}
