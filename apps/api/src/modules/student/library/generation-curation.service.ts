import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { ownerColumns, ownerWhere } from '../core/owner-scope';
import type { StudentPrincipal } from '../student.types';
import { LibraryRepository } from './library.repository';

@Injectable()
export class GenerationCurationService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repo: LibraryRepository,
  ) {}

  async createDraft(
    principal: StudentPrincipal,
    itemId: string,
    kind: string,
    proposals: unknown[],
    options: Record<string, unknown> = {},
  ) {
    const owner = ownerColumns(principal);
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const [job] = await this.db
      .insert(schema.generationJobs)
      .values({
        ...owner,
        knowledgeItemId: itemId,
        kind,
        options,
        status: 'draft',
        proposals,
        expiresAt,
      })
      .returning();
    return job!;
  }

  async getDraft(principal: StudentPrincipal, jobId: string) {
    const [job] = await this.db
      .select()
      .from(schema.generationJobs)
      .where(
        and(
          eq(schema.generationJobs.id, jobId),
          ownerWhere(principal, schema.generationJobs.studentId, schema.generationJobs.independentUserId),
        ),
      )
      .limit(1);
    if (!job) throw new NotFoundException({ code: 'NOT_FOUND' });
    if (job.expiresAt < new Date()) throw new BadRequestException({ code: 'EXPIRED' });
    return job;
  }

  async listDrafts(principal: StudentPrincipal, itemId: string) {
    return this.db
      .select()
      .from(schema.generationJobs)
      .where(
        and(
          eq(schema.generationJobs.knowledgeItemId, itemId),
          eq(schema.generationJobs.status, 'draft'),
          ownerWhere(principal, schema.generationJobs.studentId, schema.generationJobs.independentUserId),
        ),
      )
      .orderBy(schema.generationJobs.createdAt);
  }

  async saveDraft(
    principal: StudentPrincipal,
    jobId: string,
    body: { kept: unknown[]; deck_id?: string },
  ) {
    const job = await this.getDraft(principal, jobId);
    const owner = ownerColumns(principal);
    let deckId: string | undefined;
    let artifactId: string | undefined;

    if (job.kind === 'flashcards') {
      deckId = body.deck_id;
      if (!deckId) {
        const [item] = await this.db
          .select()
          .from(schema.knowledgeItems)
          .where(eq(schema.knowledgeItems.id, job.knowledgeItemId))
          .limit(1);
        const deck = await this.repo.insertDeck({
          ...owner,
          itemId: job.knowledgeItemId,
          title: `Flashcards — ${item?.title ?? 'Document'}`,
          fromLabel: `From: ${item?.title ?? 'Document'}`,
        });
        deckId = deck.id;
      }
      if (!deckId) throw new BadRequestException({ code: 'DECK_REQUIRED' });
      const resolvedDeckId = deckId;
      const cards = body.kept as Array<{ prompt: string; answer: string; sourcePage?: number }>;
      const maxSeq = await this.repo.maxCardSequence(resolvedDeckId);
      await this.repo.insertCards(
        cards.map((c, i) => ({
          deckId: resolvedDeckId,
          sequence: maxSeq + i + 1,
          prompt: c.prompt,
          answer: c.answer,
          sourcePage: c.sourcePage ?? null,
          nextDueAt: new Date(),
          fsrsDueAt: new Date(),
          srsState: 'new',
          scheduler: 'fsrs',
          sourceRef: { knowledge_item_id: job.knowledgeItemId, page: c.sourcePage ?? 1 },
        })),
      );
    } else if (job.kind === 'quiz') {
      const items = body.kept as Array<Record<string, unknown>>;
      const [item] = await this.db
        .select()
        .from(schema.knowledgeItems)
        .where(eq(schema.knowledgeItems.id, job.knowledgeItemId))
        .limit(1);
      const artifact = await this.repo.insertArtifact({
        ...owner,
        itemId: job.knowledgeItemId,
        kind: 'quiz',
        title: `Quiz — ${item?.title ?? 'Document'}`,
        content: { items },
        fromLabel: `From: ${item?.title ?? 'Document'}`,
      });
      artifactId = artifact.id;
    } else if (job.kind === 'summary') {
      const sections = body.kept as Array<Record<string, unknown>>;
      const [item] = await this.db
        .select()
        .from(schema.knowledgeItems)
        .where(eq(schema.knowledgeItems.id, job.knowledgeItemId))
        .limit(1);
      await this.db.insert(schema.libraryNotes).values({
        ...owner,
        title: `Summary — ${item?.title ?? 'Document'}`,
        doc: { type: 'doc', content: sections },
        sourceRefs: sections
          .map((s) => {
            const page = Number((s as { sourcePage?: number }).sourcePage ?? 0);
            return page > 0 ? { knowledge_item_id: job.knowledgeItemId, page } : null;
          })
          .filter(Boolean) as Array<{ knowledge_item_id: string; page: number }>,
      });
    }

    await this.db
      .update(schema.generationJobs)
      .set({ status: 'saved', updatedAt: new Date() })
      .where(eq(schema.generationJobs.id, jobId));

    return {
      saved: body.kept.length,
      deckId,
      artifactId,
      noteId: job.kind === 'summary' ? job.id : undefined,
    };
  }
}
