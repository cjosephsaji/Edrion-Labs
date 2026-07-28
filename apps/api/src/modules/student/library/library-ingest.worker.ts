import { exec } from 'node:child_process';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { z } from 'zod';
import mammoth from 'mammoth';
import { schema, type Database } from '@edrion/database';
import { LEARNING_EVENTS_WRITER, LEARN_AI_PROVIDER } from '../../../common/tokens';
import type { LearnAiProvider } from '../learn-ai/provider';
import { BudgetsService } from '../learn-ai/budgets.service';
import { LearnAiCallLogger } from '../learn-ai/learn-ai-call.logger';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import { StudentStorageService } from '../storage/student-storage.service';
import type { StudentPrincipal } from '../student.types';
import { LearnProfileJobsService } from '../edrion-learn/learn-profile.jobs';
import { topicKeyForMaterial } from '../edrion-learn/topic-keys';

const execAsync = promisify(exec);

const MAX_PAGES = 80;
const OCR_CONFIRM_THRESHOLD = 0.75;
const RICH_TEXT_MIN_CHARS = 40;
const PDF_WORKER_TIMEOUT_MS = 90_000;
const HEARTBEAT_MS = 10_000;
const CLAIM_INTERVAL_MS = 2_000;
const MAX_ATTEMPTS = 3;

const STRIP_CHILD_ENV = new Set([
  'NODE_OPTIONS',
  'VSCODE_INSPECTOR_OPTIONS',
  'NODE_INSPECT_RESUME_ON_START',
  'ELECTRON_RUN_AS_NODE',
]);

type IngestStage =
  | 'claimed'
  | 'loading_files'
  | 'extracting'
  | 'ocr'
  | 'writing_pages'
  | 'finalizing';

type KnowledgeItemRow = typeof schema.knowledgeItems.$inferSelect;

type PdfExtractResult = {
  numPages: number;
  pages: Array<{ pageNumber: number; text: string }>;
};

const ocrPageSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
});

/** Postgres text columns reject NUL bytes and some control chars from PDF extract. */
function sanitizePageText(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanChildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !STRIP_CHILD_ENV.has(key)) env[key] = value;
  }
  return env;
}

function principalFromItem(item: KnowledgeItemRow): StudentPrincipal {
  if (item.independentUserId) {
    return {
      kind: 'independent',
      independentUserId: item.independentUserId,
      email: '',
      fullName: '',
      lastAuthAt: null,
      permissions: [],
    };
  }
  return {
    kind: 'institutional',
    institutionId: item.institutionId!,
    campusId: null,
    institutionUserId: '',
    studentId: item.studentId!,
    email: '',
    fullName: '',
    lastAuthAt: null,
    permissions: [],
  };
}

/**
 * DB-claimed library ingestion worker.
 * Uses a dedicated postgres pool — isolated from the API request pool.
 */
@Injectable()
export class LibraryIngestWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LibraryIngestWorker.name);
  private readonly workerScript = join(__dirname, 'pdf-ingest-worker.cjs');
  private sql: ReturnType<typeof postgres> | undefined;
  private db: Database | undefined;
  private claimTimer: NodeJS.Timeout | undefined;
  private activeRun: Promise<void> | null = null;

  constructor(
    private readonly storage: StudentStorageService,
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly budgets: BudgetsService,
    private readonly callLog: LearnAiCallLogger,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
    private readonly profileJobs: LearnProfileJobsService,
  ) {}

  onModuleInit() {
    const url = process.env.DATABASE_URL;
    if (!url) {
      this.logger.error('DATABASE_URL not set — library ingest worker disabled');
      return;
    }
    this.sql = postgres(url, {
      max: 2,
      prepare: false,
      connect_timeout: 10,
      connection: { statement_timeout: 30_000 },
    });
    this.db = drizzle(this.sql, { schema, casing: 'snake_case' });
    this.claimTimer = setInterval(() => void this.tick(), CLAIM_INTERVAL_MS);
    this.logger.log('Library ingest worker started');
  }

  async onModuleDestroy() {
    if (this.claimTimer) clearInterval(this.claimTimer);
    if (this.activeRun) {
      try {
        await this.activeRun;
      } catch {
        /* shutting down */
      }
    }
    await this.sql?.end({ timeout: 5 });
    this.sql = undefined;
    this.db = undefined;
  }

  private requireDb(): Database {
    if (!this.db) throw new Error('Library ingest worker DB not initialized');
    return this.db;
  }

  private async tick() {
    if (this.activeRun || !this.db) return;
    try {
      const item = await this.claimNext();
      if (!item) return;
      if (item.ingestAttempts > MAX_ATTEMPTS) {
        await this.markFailed(
          item.id,
          item.ingestStage ?? 'claimed',
          "We couldn't read this document — tap Retry.",
        );
        return;
      }
      this.activeRun = this.processItem(item).finally(() => {
        this.activeRun = null;
      });
      await this.activeRun;
    } catch (err) {
      this.logger.error(
        `Claim tick failed: ${err instanceof Error ? err.message : err}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  private async claimNext(): Promise<KnowledgeItemRow | null> {
    const db = this.requireDb();
    const rows = await db.execute<{ id: string }>(sql`
      UPDATE knowledge_items SET
        status = 'reading',
        ingest_stage = 'claimed',
        ingest_heartbeat_at = now(),
        ingest_attempts = ingest_attempts + 1,
        updated_at = now()
      WHERE id = (
        SELECT id FROM knowledge_items
        WHERE status = 'queued'
           OR (
             status = 'reading'
             AND (
               ingest_heartbeat_at IS NULL
               OR ingest_heartbeat_at < now() - interval '45 seconds'
             )
           )
        ORDER BY updated_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id
    `);
    const id = rows[0]?.id;
    if (!id) return null;
    const [item] = await db
      .select()
      .from(schema.knowledgeItems)
      .where(eq(schema.knowledgeItems.id, id))
      .limit(1);
    return item ?? null;
  }

  private async setStage(
    itemId: string,
    stage: IngestStage,
    patch: Partial<typeof schema.knowledgeItems.$inferInsert> = {},
  ) {
    const db = this.requireDb();
    await db
      .update(schema.knowledgeItems)
      .set({
        ingestStage: stage,
        ingestHeartbeatAt: new Date(),
        updatedAt: new Date(),
        ...patch,
      })
      .where(eq(schema.knowledgeItems.id, itemId));
  }

  private async heartbeat(itemId: string) {
    const db = this.requireDb();
    await db
      .update(schema.knowledgeItems)
      .set({ ingestHeartbeatAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.knowledgeItems.id, itemId));
  }

  private async markFailed(itemId: string, stage: string, message: string, detail?: string) {
    const db = this.requireDb();
    await db
      .update(schema.knowledgeItems)
      .set({
        status: 'error',
        errorMessage: message,
        ingestStage: stage,
        ingestErrorDetail: detail ?? stage,
        extractedTextReady: false,
        updatedAt: new Date(),
      })
      .where(eq(schema.knowledgeItems.id, itemId));
  }

  private async getStorageObjects(ids: string[] | null | undefined) {
    if (!ids?.length) return [];
    const db = this.requireDb();
    const rows = await db
      .select()
      .from(schema.storageObjects)
      .where(inArray(schema.storageObjects.id, ids));
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => r != null);
  }

  private async bulkUpsertPages(rows: Array<typeof schema.knowledgeItemPages.$inferInsert>) {
    if (!rows.length) return;
    const db = this.requireDb();
    await db
      .insert(schema.knowledgeItemPages)
      .values(rows)
      .onConflictDoUpdate({
        target: [schema.knowledgeItemPages.itemId, schema.knowledgeItemPages.pageIndex],
        set: {
          objectId: sql`excluded.object_id`,
          text: sql`excluded.text`,
          ocrConfidence: sql`excluded.ocr_confidence`,
          needsConfirm: sql`excluded.needs_confirm`,
          confirmedAt: sql`excluded.confirmed_at`,
          updatedAt: new Date(),
        },
      });
  }

  private async upsertPage(row: typeof schema.knowledgeItemPages.$inferInsert) {
    const db = this.requireDb();
    await db
      .insert(schema.knowledgeItemPages)
      .values(row)
      .onConflictDoUpdate({
        target: [schema.knowledgeItemPages.itemId, schema.knowledgeItemPages.pageIndex],
        set: {
          objectId: row.objectId,
          text: row.text,
          ocrConfidence: row.ocrConfidence,
          needsConfirm: row.needsConfirm,
          confirmedAt: row.confirmedAt ?? null,
          updatedAt: new Date(),
        },
      });
  }

  private async deletePagesFromIndex(itemId: string, fromIndex: number) {
    const db = this.requireDb();
    await db
      .delete(schema.knowledgeItemPages)
      .where(
        and(
          eq(schema.knowledgeItemPages.itemId, itemId),
          gte(schema.knowledgeItemPages.pageIndex, fromIndex),
        ),
      );
  }

  private async processItem(item: KnowledgeItemRow) {
    const itemId = item.id;
    const principal = principalFromItem(item);
    let currentStage: string = 'claimed';
    this.logger.log(`Ingest claimed ${itemId} attempt=${item.ingestAttempts}`);

    try {
      currentStage = 'loading_files';
      await this.setStage(itemId, 'loading_files', {
        pagesDone: 0,
        pageCount: null,
        errorMessage: null,
        extractedTextReady: false,
        aiRead: false,
      });

      const objects = await this.getStorageObjects(item.objectIds);
      if (!objects.length) {
        throw new Error('No files attached to this upload.');
      }

      let pageIndex = 0;
      let anyNeedsConfirm = false;
      let totalKnown: number | null = null;

      for (const obj of objects) {
        const mime = (obj.mimeType || '').toLowerCase();
        const filename = obj.filename ?? 'document';

        if (mime === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
          const absPath = this.storage.resolvePath(obj.storageKey);
          this.logger.log(`Ingest PDF ${itemId}: ${absPath}`);
          currentStage = 'extracting';
          await this.setStage(itemId, 'extracting');
          const pdf = await this.extractPdfInChild(absPath, itemId);

          totalKnown = (totalKnown ?? 0) + pdf.numPages;
          if (pdf.numPages > MAX_PAGES) {
            throw new Error(
              `This PDF has ${pdf.numPages} pages — Library supports up to ${MAX_PAGES}. Try a shorter excerpt.`,
            );
          }

          currentStage = 'writing_pages';
          await this.setStage(itemId, 'writing_pages', {
            pageCount: totalKnown,
            pagesDone: 0,
            status: 'reading',
          });
          this.logger.log(`Ingest PDF opened ${itemId}: ${pdf.numPages} pages`);

          const batch: Array<typeof schema.knowledgeItemPages.$inferInsert> = [];
          const PROGRESS_BATCH = 5;

          for (const page of pdf.pages) {
            const text = sanitizePageText(page.text);
            const ocrConfidence =
              text.length >= RICH_TEXT_MIN_CHARS ? null : text ? 0.55 : 0.35;
            const needsConfirm =
              ocrConfidence !== null && ocrConfidence < OCR_CONFIRM_THRESHOLD;
            if (needsConfirm) anyNeedsConfirm = true;

            batch.push({
              itemId,
              pageIndex,
              objectId: obj.id,
              text: text || '(No selectable text on this page)',
              ocrConfidence: ocrConfidence === null ? null : String(ocrConfidence),
              needsConfirm,
            });
            pageIndex += 1;

            if (batch.length >= PROGRESS_BATCH || pageIndex === pdf.numPages) {
              await this.bulkUpsertPages(batch);
              batch.length = 0;
              await this.setStage(itemId, 'writing_pages', {
                pagesDone: pageIndex,
                pageCount: totalKnown,
                status: 'reading',
              });
            }
          }
        } else if (
          mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          filename.toLowerCase().endsWith('.docx')
        ) {
          currentStage = 'extracting';
          await this.setStage(itemId, 'extracting');
          const buffer = await this.storage.readBuffer(obj.storageKey);
          totalKnown = (totalKnown ?? 0) + 1;
          currentStage = 'writing_pages';
          await this.setStage(itemId, 'writing_pages', { pageCount: totalKnown, pagesDone: pageIndex });
          const { value } = await mammoth.extractRawText({ buffer });
          const text = value.trim().slice(0, 100_000);
          await this.upsertPage({
            itemId,
            pageIndex,
            objectId: obj.id,
            text,
            ocrConfidence: null,
            needsConfirm: false,
          });
          pageIndex += 1;
          await this.setStage(itemId, 'writing_pages', { pagesDone: pageIndex, pageCount: totalKnown });
        } else if (mime.startsWith('image/')) {
          if (mime === 'image/heic' || mime === 'image/heif') {
            throw new Error('HEIC/HEIF photos aren’t supported yet — please upload a JPEG or PNG.');
          }
          const buffer = await this.storage.readBuffer(obj.storageKey);
          totalKnown = (totalKnown ?? 0) + 1;
          currentStage = 'ocr';
          await this.setStage(itemId, 'ocr', { pageCount: totalKnown, pagesDone: pageIndex });
          const ocr = await this.ocrImage(principal, buffer, mime, obj.id);
          const needsConfirm = ocr.confidence < OCR_CONFIRM_THRESHOLD;
          if (needsConfirm) anyNeedsConfirm = true;
          await this.upsertPage({
            itemId,
            pageIndex,
            objectId: obj.id,
            text: ocr.text,
            ocrConfidence: String(ocr.confidence),
            needsConfirm,
          });
          pageIndex += 1;
          await this.setStage(itemId, 'writing_pages', { pagesDone: pageIndex, pageCount: totalKnown });
        } else {
          throw new Error(`Unsupported file type: ${mime || filename}`);
        }
      }

      if (pageIndex === 0) {
        throw new Error('No pages could be read from this upload.');
      }

      currentStage = 'finalizing';
      await this.setStage(itemId, 'finalizing');
      await this.deletePagesFromIndex(itemId, pageIndex);

      const status = anyNeedsConfirm ? 'needs_ocr_confirm' : 'ready';
      const db = this.requireDb();
      await db
        .update(schema.knowledgeItems)
        .set({
          status,
          pageCount: pageIndex,
          pagesDone: pageIndex,
          extractedTextReady: true,
          aiRead: true,
          errorMessage: null,
          ingestStage: null,
          ingestErrorDetail: null,
          ingestHeartbeatAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.knowledgeItems.id, itemId));

      this.logger.log(`Ingest complete ${itemId}: ${pageIndex} pages → ${status}`);

      await this.ledger.log({
        eventType: 'library.item_processed',
        payload: {
          itemId,
          mime: objects[0]?.mimeType ?? 'unknown',
          pages: pageIndex,
        },
        principal,
      });

      // PM-004: pre-warm profile on Library-document indexing completion.
      if (status === 'ready') {
        const firstPages = await db
          .select({ text: schema.knowledgeItemPages.text })
          .from(schema.knowledgeItemPages)
          .where(eq(schema.knowledgeItemPages.itemId, itemId))
          .orderBy(schema.knowledgeItemPages.pageIndex)
          .limit(2);
        void this.profileJobs.enqueueProfileTopic({
          principal,
          learnTopicId: null,
          topicKey: topicKeyForMaterial(itemId),
          title: item.title || 'Library document',
          materialOutline: firstPages.map((p) => (p.text ?? '').slice(0, 200)).join('\n').slice(0, 1500) || null,
          materialFirstChunk: firstPages[0]?.text?.slice(0, 2000) ?? null,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read this document.';
      const detail = err instanceof Error ? `${currentStage}: ${err.message}` : `${currentStage}: ${message}`;
      this.logger.warn(`Ingest failed ${itemId} at ${currentStage}: ${message}`);
      await this.markFailed(itemId, currentStage, message, detail);
    }
  }

  private extractPdfInChild(absPath: string, itemId: string): Promise<PdfExtractResult> {
    return new Promise((resolve, reject) => {
      if (!existsSync(this.workerScript)) {
        // tsc only emits .js — the build must copy the .cjs child scripts (scripts/copy-build-assets.mjs).
        reject(
          new Error(
            `PDF worker script missing at ${this.workerScript} — the build did not copy .cjs assets into dist.`,
          ),
        );
        return;
      }
      const child = spawn(process.execPath, [this.workerScript, absPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: cleanChildEnv(),
      });

      this.logger.log(`PDF child spawned pid=${child.pid ?? '?'} for ${itemId}`);

      const chunks: Buffer[] = [];
      let stderr = '';
      let settled = false;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearInterval(heartbeatTimer);
        fn();
      };

      const timer = setTimeout(() => {
        void this.forceKillChild(child).then(() => {
          finish(() =>
            reject(new Error('PDF reading timed out — try Retry or upload a shorter excerpt.')),
          );
        });
      }, PDF_WORKER_TIMEOUT_MS);

      const heartbeatTimer = setInterval(() => {
        void this.heartbeat(itemId).catch((e) =>
          this.logger.warn(`Heartbeat failed ${itemId}: ${e instanceof Error ? e.message : e}`),
        );
      }, HEARTBEAT_MS);

      child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('spawn', () => {
        this.logger.log(`PDF child spawn event pid=${child.pid ?? '?'}`);
      });
      child.on('error', (err) => {
        finish(() => reject(err));
      });
      child.on('close', (code) => {
        finish(() => {
          if (code !== 0) {
            const detail = stderr.trim() || `PDF worker exited with code ${code}`;
            reject(new Error(detail));
            return;
          }
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as PdfExtractResult;
            if (!parsed?.numPages || !Array.isArray(parsed.pages)) {
              throw new Error('Invalid PDF worker output');
            }
            resolve(parsed);
          } catch (err) {
            reject(err instanceof Error ? err : new Error('Could not parse PDF worker output'));
          }
        });
      });
    });
  }

  private async forceKillChild(child: ChildProcess) {
    child.kill();
    if (process.platform === 'win32' && child.pid) {
      try {
        await execAsync(`taskkill /pid ${child.pid} /t /f`);
      } catch {
        /* child may already be gone */
      }
    }
  }

  private async ocrImage(
    principal: StudentPrincipal,
    buffer: Buffer,
    mimeType: string,
    objectId: string,
  ): Promise<{ text: string; confidence: number }> {
    if (!this.ai.available) {
      return { text: '(OCR unavailable — confirm or edit this page manually)', confidence: 0.2 };
    }
    await this.budgets.spend(principal, 'ocr', 800);
    const { result, usage } = await this.ai.completeJson({
      purpose: 'ocr',
      tier: 'vision',
      system:
        'Extract plain text from this document image or handwritten notes. Preserve student notation. Return confidence 0–1.',
      user: 'Extract all readable text from this image.',
      images: [{ objectId, base64: buffer.toString('base64'), mimeType }],
      schema: ocrPageSchema,
      schemaName: 'ocr_page',
      maxOutputTokens: 4000,
    });
    await this.callLog.log(principal, 'ocr', usage);
    return result;
  }
}
