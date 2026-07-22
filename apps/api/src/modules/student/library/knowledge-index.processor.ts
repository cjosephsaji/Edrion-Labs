import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { eq, schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { JobsService } from '../../../common/queue/jobs.service';
import { QueueWorkers } from '../../../common/queue/queue.worker';
import { JobTracker } from '../../../common/queue/job-tracker.service';
import { LearnAiProvider } from '../learn-ai/provider';
import { LIBRARY_INDEX_CHUNKS_JOB } from './library.constants';

const CHUNK_CHARS = 1600;
const OVERLAP_CHARS = 320;
const EMBEDDING_DIM = 1536;

@Injectable()
export class KnowledgeIndexProcessor implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeIndexProcessor.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    private readonly tracker: JobTracker,
    private readonly ai: LearnAiProvider,
  ) {}

  onModuleInit() {
    this.workers.register(LIBRARY_INDEX_CHUNKS_JOB, () =>
      this.tracker.run(LIBRARY_INDEX_CHUNKS_JOB, 'ai', async () => {
        const items = await this.db
          .select({ id: schema.knowledgeItems.id })
          .from(schema.knowledgeItems)
          .where(eq(schema.knowledgeItems.indexReady, false))
          .limit(5);
        for (const item of items) await this.indexItem(item.id);
        return { itemsProcessed: items.length };
      }),
    );
  }

  async enqueueIndex(itemId: string) {
    await this.jobs.enqueue('ai', LIBRARY_INDEX_CHUNKS_JOB, { itemId }, { jobId: `library-index:${itemId}` });
  }

  async indexItem(itemId: string) {
    const [item] = await this.db.select().from(schema.knowledgeItems).where(eq(schema.knowledgeItems.id, itemId)).limit(1);
    if (!item) return;
    const pages = await this.db
      .select()
      .from(schema.knowledgeItemPages)
      .where(eq(schema.knowledgeItemPages.itemId, itemId))
      .orderBy(schema.knowledgeItemPages.pageIndex);

    await this.db.delete(schema.knowledgeChunks).where(eq(schema.knowledgeChunks.knowledgeItemId, itemId));

    const texts: string[] = [];
    const meta: Array<{ page: number; chunkIndex: number; content: string }> = [];
    for (const page of pages) {
      const chunks = chunkPageText(page.text, page.pageIndex);
      for (const chunk of chunks) {
        meta.push(chunk);
        texts.push(chunk.content);
      }
    }

    if (!texts.length) {
      await this.db.update(schema.knowledgeItems).set({ indexReady: false, ingestStage: 'index' }).where(eq(schema.knowledgeItems.id, itemId));
      return;
    }

    const { vectors, usage } = await this.ai.embedTexts(texts);
    for (let i = 0; i < meta.length; i += 1) {
      const m = meta[i]!;
      await this.db.insert(schema.knowledgeChunks).values({
        knowledgeItemId: itemId,
        institutionId: item.institutionId,
        studentId: item.studentId,
        independentUserId: item.independentUserId,
        page: m.page,
        chunkIndex: m.chunkIndex,
        content: m.content,
        embedding: vectors[i] ?? [],
      });
    }

    await this.db
      .update(schema.knowledgeItems)
      .set({
        indexReady: true,
        embeddingModel: usage.model,
        embeddingDimension: EMBEDDING_DIM,
        ingestStage: 'index',
      })
      .where(eq(schema.knowledgeItems.id, itemId));
    this.logger.log(`Indexed ${meta.length} chunks for item ${itemId}`);
  }
}

function chunkPageText(text: string, pageIndex: number) {
  const chunks: Array<{ page: number; chunkIndex: number; content: string }> = [];
  if (!text.trim()) return chunks;
  let start = 0;
  let chunkIndex = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + CHUNK_CHARS);
    chunks.push({ page: pageIndex, chunkIndex, content: text.slice(start, end) });
    if (end >= text.length) break;
    start = Math.max(start + 1, end - OVERLAP_CHARS);
    chunkIndex += 1;
  }
  return chunks;
}
