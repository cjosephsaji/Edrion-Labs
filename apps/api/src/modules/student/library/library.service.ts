import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  conceptMapContentSchema,
  createCollectionSchema,
  createFlashcardSchema,
  createKnowledgeItemSchema,
  deckFromSessionSchema,
  deckGenerationSchema,
  flashcardReviewSchema,
  glossaryContentSchema,
  libraryTutorInputSchema,
  patchCollectionSchema,
  patchDeckSchema,
  patchFlashcardSchema,
  patchItemPageTextSchema,
  patchKnowledgeItemPagesSchema,
  quizAttemptSchema,
  quizContentSchema,
  quizItemSchema,
  summaryContentSchema,
  summarySectionSchema,
  type CreateKnowledgeItemInput,
} from '@edrion/schemas';
import {
  FLASHCARD_AGAIN_DELAY_MINUTES,
  FRESHNESS_FRESH_DAYS,
} from '@edrion/shared-types';
import { LEARNING_EVENTS_WRITER, LEARN_AI_PROVIDER } from '../../../common/tokens';
import type { LearnAiProvider } from '../learn-ai/provider';
import { BudgetsService } from '../learn-ai/budgets.service';
import { EvaluatorService } from '../learn-ai/evaluator.service';
import { LearnAiCallLogger } from '../learn-ai/learn-ai-call.logger';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import { LearnRepository } from '../learn/learn.repository';
import { StudentStorageService } from '../storage/student-storage.service';
import type { StudentPrincipal } from '../student.types';
import { LibraryRepository } from './library.repository';

const PDF_MIMES = new Set(['application/pdf']);
const DOC_MIMES = new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

type Emit = (event: Record<string, unknown>) => void;

@Injectable()
export class LibraryService {
  constructor(
    private readonly repo: LibraryRepository,
    private readonly learn: LearnRepository,
    private readonly storage: StudentStorageService,
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly budgets: BudgetsService,
    private readonly callLog: LearnAiCallLogger,
    private readonly evaluator: EvaluatorService,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
  ) {}

  async getOverview(principal: StudentPrincipal, q?: string) {
    if (q?.trim()) {
      const hits = await this.repo.search(principal, q.trim());
      const deckIds = hits.decks.map((d) => d.id);
      const [dueMap, countMap, earliestMap] = await Promise.all([
        this.repo.dueCountsForDecks(deckIds),
        this.repo.cardCountsForDecks(deckIds),
        this.repo.earliestDueForDecks(deckIds),
      ]);
      const collectionCounts = await Promise.all(
        hits.collections.map(async (c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          count: await this.repo.countItemsInCollection(c.id),
        })),
      );
      return {
        collections: collectionCounts,
        uploads: hits.items.map((i) => ({
          id: i.id,
          kind: i.kind,
          title: i.title,
          meta: i.pageCount ? `${i.pageCount} pages` : '',
          aiRead: i.aiRead,
          status: i.status,
          pagesDone: i.pagesDone,
          pageCount: i.pageCount,
          createdAt: i.createdAt.toISOString(),
          updatedAt: i.updatedAt.toISOString(),
        })),
        generated: [
          ...hits.artifacts.map((a) => ({
            id: a.id,
            kind: a.kind as 'summary' | 'quiz' | 'topic_pack' | 'visual' | 'concept_map' | 'glossary',
            title: a.title,
            fromLabel: a.fromLabel,
            freshness: this.artifactFreshness(a.createdAt, a.lastInteractedAt),
            meta: a.kind,
            createdAt: a.createdAt.toISOString(),
            itemId: a.itemId,
          })),
          ...hits.decks.map((d) => ({
            id: d.id,
            kind: 'deck' as const,
            title: d.title,
            fromLabel: d.fromLabel,
            freshness: this.deckFreshnessFromMaps(d.id, dueMap, earliestMap),
            meta: `${countMap.get(d.id) ?? 0} cards`,
            createdAt: d.createdAt.toISOString(),
            itemId: d.itemId,
          })),
        ],
        recentAdded: hits.items.slice(0, 8).map((u) => ({ id: u.id, title: u.title, kind: u.kind })),
      };
    }

    const [collections, uploads, artifacts, decks] = await Promise.all([
      this.repo.listCollections(principal),
      this.repo.listUploads(principal),
      this.repo.listArtifacts(principal),
      this.repo.listDecks(principal),
    ]);

    const collectionCounts = await Promise.all(
      collections.map(async (c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        count: await this.repo.countItemsInCollection(c.id),
      })),
    );

    const deckIds = decks.map((d) => d.id);
    const [dueMap, countMap, earliestMap] = await Promise.all([
      this.repo.dueCountsForDecks(deckIds),
      this.repo.cardCountsForDecks(deckIds),
      this.repo.earliestDueForDecks(deckIds),
    ]);

    const generated = [
      ...artifacts.map((a) => ({
        id: a.id,
        kind: a.kind as 'summary' | 'quiz' | 'topic_pack' | 'visual' | 'concept_map' | 'glossary',
        title: a.title,
        fromLabel: a.fromLabel,
        freshness: this.artifactFreshness(a.createdAt, a.lastInteractedAt),
        meta: a.kind,
        createdAt: a.createdAt.toISOString(),
        itemId: a.itemId,
      })),
      ...decks.map((d) => ({
        id: d.id,
        kind: 'deck' as const,
        title: d.title,
        fromLabel: d.fromLabel,
        freshness: this.deckFreshnessFromMaps(d.id, dueMap, earliestMap),
        meta: `${countMap.get(d.id) ?? 0} cards`,
        createdAt: d.createdAt.toISOString(),
        itemId: d.itemId,
      })),
    ];

    return {
      collections: collectionCounts,
      uploads: uploads.map((u) => ({
        id: u.id,
        kind: u.kind,
        title: u.title,
        meta: u.pageCount
          ? `${u.pageCount} page${u.pageCount === 1 ? '' : 's'}`
          : u.status === 'reading' || u.status === 'queued'
            ? 'Reading…'
            : '',
        aiRead: u.aiRead,
        status: u.status,
        pagesDone: u.pagesDone,
        pageCount: u.pageCount,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      })),
      generated,
      recentAdded: uploads.slice(0, 8).map((u) => ({ id: u.id, title: u.title, kind: u.kind })),
    };
  }

  async getCollection(principal: StudentPrincipal, id: string) {
    const collection = await this.requireCollection(principal, id);
    const items = await this.repo.listItemsInCollection(principal, id);
    const derived = await Promise.all(
      items.map(async (item) => {
        const [artifacts, decks] = await Promise.all([
          this.repo.artifactsForItem(item.id),
          this.repo.decksForItem(item.id),
        ]);
        return {
          item: {
            id: item.id,
            kind: item.kind,
            title: item.title,
            status: item.status,
            pageCount: item.pageCount,
            aiRead: item.aiRead,
            createdAt: item.createdAt.toISOString(),
          },
          artifacts: artifacts.map((a) => ({
            id: a.id,
            kind: a.kind,
            title: a.title,
            fromLabel: a.fromLabel,
            freshness: this.artifactFreshness(a.createdAt, a.lastInteractedAt),
            createdAt: a.createdAt.toISOString(),
          })),
          decks: decks.map((d) => ({
            id: d.id,
            title: d.title,
            fromLabel: d.fromLabel,
            createdAt: d.createdAt.toISOString(),
          })),
        };
      }),
    );
    return {
      id: collection.id,
      name: collection.name,
      color: collection.color,
      count: items.length,
      items: derived,
    };
  }

  async createItem(principal: StudentPrincipal, input: CreateKnowledgeItemInput) {
    const parsed = createKnowledgeItemSchema.parse(input);
    const owner = this.repo.owner(principal);
    const objects = await this.repo.getStorageObjects(parsed.objectIds);
    if (objects.length !== parsed.objectIds.length) {
      throw new BadRequestException({ code: 'INVALID_OBJECTS', message: 'One or more files were not found.' });
    }
    for (const obj of objects) {
      await this.storage.getOwned(principal, obj.id);
      if (obj.kind !== 'library_upload') {
        throw new BadRequestException({ code: 'INVALID_KIND', message: 'Files must be library uploads.' });
      }
    }

    const kind = this.inferKind(objects);
    const title = parsed.title ?? objects[0]?.filename ?? 'Untitled upload';
    // pageCount stays null until ingestion opens the PDF and learns numPages.
    // Never use objectIds.length — one PDF file is N pages, not 1.
    const item = await this.repo.insertItem({
      ...owner,
      collectionId: parsed.collectionId ?? null,
      kind,
      title,
      objectIds: parsed.objectIds,
      origin: { source: 'upload' },
      pageCount: null,
      pagesDone: 0,
      status: 'queued',
      extractedTextReady: false,
      aiRead: false,
      ingestAttempts: 0,
      ingestStage: null,
      ingestErrorDetail: null,
    });

    await this.ledger.log({
      eventType: 'library.item_uploaded',
      payload: {
        itemId: item.id,
        mime: objects[0]?.mimeType ?? 'unknown',
        pages: undefined,
      },
      principal,
    });

    return this.getItem(principal, item.id);
  }

  private async queueIngest(itemId: string) {
    await this.repo.updateItem(itemId, {
      status: 'queued',
      pagesDone: 0,
      pageCount: null,
      errorMessage: null,
      extractedTextReady: false,
      aiRead: false,
      ingestAttempts: 0,
      ingestStage: null,
      ingestErrorDetail: null,
    });
  }

  async patchItemPages(principal: StudentPrincipal, id: string, objectIds: string[]) {
    patchKnowledgeItemPagesSchema.parse({ objectIds });
    const item = await this.requireItem(principal, id);
    const objects = await this.repo.getStorageObjects(objectIds);
    for (const obj of objects) await this.storage.getOwned(principal, obj.id);
    await this.repo.updateItem(item.id, { objectIds });
    await this.queueIngest(item.id);
    return this.getItem(principal, id);
  }

  async patchPageText(principal: StudentPrincipal, id: string, pageIndex: number, body: unknown) {
    const { text } = patchItemPageTextSchema.parse(body);
    await this.requireItem(principal, id);
    const updated = await this.repo.updatePageText(id, pageIndex, text);
    if (!updated) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Page not found' });
    return {
      pageIndex: updated.pageIndex,
      text: updated.text,
      needsConfirm: updated.needsConfirm,
      ocrConfidence: updated.ocrConfidence === null ? null : Number(updated.ocrConfidence),
    };
  }

  async confirmOcr(principal: StudentPrincipal, id: string) {
    const item = await this.requireItem(principal, id);
    if (item.status !== 'needs_ocr_confirm' && item.status !== 'ready') {
      throw new BadRequestException({
        code: 'NOT_READY',
        message: 'This document is still being read.',
      });
    }
    await this.repo.confirmAllPages(item.id);
    await this.repo.updateItem(item.id, {
      status: 'ready',
      extractedTextReady: true,
      aiRead: true,
      errorMessage: null,
    });
    return this.getItem(principal, id);
  }

  async retryIngest(principal: StudentPrincipal, id: string) {
    await this.requireItem(principal, id);
    await this.queueIngest(id);
    return this.getItem(principal, id);
  }

  async deleteItem(principal: StudentPrincipal, id: string) {
    const item = await this.requireItem(principal, id);
    const objects = await this.repo.getStorageObjects(item.objectIds);
    await this.repo.deleteItem(item.id);
    for (const obj of objects) {
      await this.storage.removeFile(obj.storageKey);
    }
    await this.repo.deleteStorageObjects(objects.map((o) => o.id));
    return { ok: true as const };
  }

  async getItem(principal: StudentPrincipal, id: string) {
    const item = await this.requireItem(principal, id);
    const [artifacts, decks, pages, objects] = await Promise.all([
      this.repo.artifactsForItem(item.id),
      this.repo.decksForItem(item.id),
      this.repo.listPages(item.id),
      this.repo.getStorageObjects(item.objectIds ?? []),
    ]);
    const objById = new Map(objects.map((o) => [o.id, o]));
    return {
      item: {
        id: item.id,
        kind: item.kind,
        title: item.title,
        collectionId: item.collectionId,
        pageCount: item.pageCount,
        pagesDone: item.pagesDone,
        status: item.status,
        ingestStage: item.ingestStage,
        errorMessage: item.errorMessage,
        extractedTextReady: item.extractedTextReady,
        aiRead: item.aiRead,
        origin: item.origin,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      },
      pages: pages.length
        ? pages.map((p) => {
            const obj = objById.get(p.objectId);
            return {
              pageIndex: p.pageIndex,
              objectId: p.objectId,
              text: p.text,
              ocrConfidence: p.ocrConfidence === null ? null : Number(p.ocrConfidence),
              needsConfirm: p.needsConfirm,
              mimeType: obj?.mimeType,
              filename: obj?.filename ?? undefined,
            };
          })
        : objects.map((o, i) => ({
            pageIndex: i,
            objectId: o.id,
            text: '',
            ocrConfidence: null,
            needsConfirm: false,
            mimeType: o.mimeType,
            filename: o.filename ?? undefined,
          })),
      artifacts: [
        ...artifacts.map((a) => ({
          id: a.id,
          kind: a.kind,
          title: a.title,
          fromLabel: a.fromLabel,
          createdAt: a.createdAt.toISOString(),
        })),
        ...decks.map((d) => ({
          id: d.id,
          kind: 'deck' as const,
          title: d.title,
          fromLabel: d.fromLabel,
          createdAt: d.createdAt.toISOString(),
        })),
      ],
    };
  }

  async createCollection(principal: StudentPrincipal, body: unknown) {
    const parsed = createCollectionSchema.parse(body);
    return this.repo.insertCollection({ ...this.repo.owner(principal), ...parsed });
  }

  async patchCollection(principal: StudentPrincipal, id: string, body: unknown) {
    const parsed = patchCollectionSchema.parse(body);
    await this.requireCollection(principal, id);
    return this.repo.updateCollection(id, parsed);
  }

  async deleteCollection(principal: StudentPrincipal, id: string) {
    await this.requireCollection(principal, id);
    await this.repo.deleteCollection(id);
    return { ok: true };
  }

  async summarize(principal: StudentPrincipal, itemId: string) {
    const item = await this.requireReadyItem(principal, itemId);
    const text = await this.extractedText(item);
    const content = await this.generateSummary(principal, text, item.title);
    const artifact = await this.repo.insertArtifact({
      ...this.repo.owner(principal),
      itemId: item.id,
      kind: 'summary',
      title: content.title,
      content,
      fromLabel: `From: ${item.title}`,
    });
    await this.logArtifact(principal, item.id, artifact.id, 'summary');
    return artifact;
  }

  async flashcards(principal: StudentPrincipal, itemId: string) {
    const item = await this.requireReadyItem(principal, itemId);
    const text = await this.extractedText(item);
    const deck = await this.generateDeck(principal, text, item.title);
    const row = await this.repo.insertDeck({
      ...this.repo.owner(principal),
      itemId: item.id,
      title: deck.title,
      fromLabel: `From: ${item.title}`,
    });
    await this.repo.insertCards(
      deck.cards.map((c, i) => ({
        deckId: row.id,
        sequence: i + 1,
        prompt: c.prompt,
        answer: c.answer,
        sourcePage: c.sourcePage ?? null,
        nextDueAt: new Date(),
        intervalDays: '0',
        ease: '2.50',
        reps: 0,
        lapses: 0,
      })),
    );
    await this.logArtifact(principal, item.id, row.id, 'deck');
    return { deckId: row.id, title: row.title };
  }

  async quiz(principal: StudentPrincipal, itemId: string) {
    const item = await this.requireReadyItem(principal, itemId);
    const text = await this.extractedText(item);
    const content = await this.generateQuiz(principal, text);
    const artifact = await this.repo.insertArtifact({
      ...this.repo.owner(principal),
      itemId: item.id,
      kind: 'quiz',
      title: `Quiz — ${item.title}`,
      content,
      fromLabel: `From: ${item.title}`,
    });
    await this.logArtifact(principal, item.id, artifact.id, 'quiz');
    return artifact;
  }

  async conceptMap(principal: StudentPrincipal, itemId: string) {
    const item = await this.requireReadyItem(principal, itemId);
    const text = await this.extractedText(item);
    const content = await this.generateConceptMap(principal, text, item.title);
    const artifact = await this.repo.insertArtifact({
      ...this.repo.owner(principal),
      itemId: item.id,
      kind: 'concept_map',
      title: content.title,
      content,
      fromLabel: `From: ${item.title}`,
    });
    await this.logArtifact(principal, item.id, artifact.id, 'concept_map');
    return artifact;
  }

  async glossary(principal: StudentPrincipal, itemId: string) {
    const item = await this.requireReadyItem(principal, itemId);
    const text = await this.extractedText(item);
    const content = await this.generateGlossary(principal, text, item.title);
    const artifact = await this.repo.insertArtifact({
      ...this.repo.owner(principal),
      itemId: item.id,
      kind: 'glossary',
      title: content.title,
      content,
      fromLabel: `From: ${item.title}`,
    });
    await this.logArtifact(principal, item.id, artifact.id, 'glossary');
    return artifact;
  }

  async streamSummarize(principal: StudentPrincipal, itemId: string, emit: Emit) {
    const item = await this.requireReadyItem(principal, itemId);
    const text = await this.extractedText(item);
    const fromLabel = `From: ${item.title}`;
    emit({ type: 'start', title: item.title, fromLabel, kind: 'summary' });

    const sections: z.infer<typeof summarySectionSchema>[] = [];
    if (!this.ai.available) {
      const stub = { heading: 'Summary', body: text.slice(0, 1200), sourcePage: 1 };
      sections.push(stub);
      emit({ type: 'section', section: stub, index: 0 });
    } else {
      await this.budgets.spend(principal, 'library_gen', 1200);
      let index = 0;
      for await (const section of this.ai.streamJsonArray({
        purpose: 'library_gen',
        tier: 'small',
        system: GROUNDING_SYSTEM + ' Summarize into sections. Cite sourcePage from [p.N] markers. Preserve student wording. Never invent beyond the source.',
        user: text.slice(0, 14_000),
        schema: summarySectionSchema,
        schemaName: 'summary_stream',
        arrayKey: 'sections',
        maxOutputTokens: 3000,
      })) {
        sections.push(section);
        emit({ type: 'section', section, index });
        index += 1;
      }
    }

    const content = { title: item.title, sections };
    const artifact = await this.repo.insertArtifact({
      ...this.repo.owner(principal),
      itemId: item.id,
      kind: 'summary',
      title: content.title,
      content,
      fromLabel,
    });
    await this.logArtifact(principal, item.id, artifact.id, 'summary');
    emit({ type: 'saved', artifactId: artifact.id, kind: 'summary' });
  }

  async streamFlashcards(principal: StudentPrincipal, itemId: string, emit: Emit) {
    const item = await this.requireReadyItem(principal, itemId);
    const text = await this.extractedText(item);
    const fromLabel = `From: ${item.title}`;
    emit({ type: 'start', title: `Flashcards — ${item.title}`, fromLabel, kind: 'flashcards' });

    const cardSchema = z.object({
      prompt: z.string(),
      answer: z.string(),
      sourcePage: z.number().int().positive().optional(),
    });
    const cards: z.infer<typeof cardSchema>[] = [];

    if (!this.ai.available) {
      const stub = { prompt: 'Key idea?', answer: text.slice(0, 200), sourcePage: 1 };
      cards.push(stub);
      emit({ type: 'card', card: stub, index: 0 });
    } else {
      await this.budgets.spend(principal, 'library_gen', 1500);
      let index = 0;
      for await (const card of this.ai.streamJsonArray({
        purpose: 'library_gen',
        tier: 'small',
        system: GROUNDING_SYSTEM + ' Create 8–24 flashcards. Cite sourcePage from [p.N]. Preserve student wording.',
        user: text.slice(0, 14_000),
        schema: cardSchema,
        schemaName: 'deck_stream',
        arrayKey: 'cards',
        maxOutputTokens: 4000,
      })) {
        cards.push(card);
        emit({ type: 'card', card, index });
        index += 1;
      }
    }

    const row = await this.repo.insertDeck({
      ...this.repo.owner(principal),
      itemId: item.id,
      title: `Flashcards — ${item.title}`,
      fromLabel,
    });
    await this.repo.insertCards(
      cards.map((c, i) => ({
        deckId: row.id,
        sequence: i + 1,
        prompt: c.prompt,
        answer: c.answer,
        sourcePage: c.sourcePage ?? null,
        nextDueAt: new Date(),
        intervalDays: '0',
        ease: '2.50',
        reps: 0,
        lapses: 0,
      })),
    );
    await this.logArtifact(principal, item.id, row.id, 'deck');
    emit({ type: 'saved', deckId: row.id, kind: 'flashcards' });
  }

  async streamQuiz(principal: StudentPrincipal, itemId: string, emit: Emit) {
    const item = await this.requireReadyItem(principal, itemId);
    const text = await this.extractedText(item);
    const fromLabel = `From: ${item.title}`;
    emit({ type: 'start', title: `Quiz — ${item.title}`, fromLabel, kind: 'quiz' });

    const items: z.infer<typeof quizItemSchema>[] = [];
    if (!this.ai.available) {
      const stub = {
        qtype: 'short' as const,
        prompt: 'What is the main idea?',
        markingNote: 'Any reasonable summary grounded in the source.',
        sourcePage: 1,
      };
      items.push(stub);
      emit({ type: 'item', item: stub, index: 0 });
    } else {
      await this.budgets.spend(principal, 'library_gen', 1500);
      let index = 0;
      for await (const quizItem of this.ai.streamJsonArray({
        purpose: 'library_gen',
        tier: 'small',
        system: GROUNDING_SYSTEM + ' Create 10–15 quiz items (mcq+short). Cite sourcePage from [p.N]. Never invent beyond the source.',
        user: text.slice(0, 14_000),
        schema: quizItemSchema,
        schemaName: 'quiz_stream',
        arrayKey: 'items',
        maxOutputTokens: 4000,
      })) {
        items.push(quizItem);
        emit({ type: 'item', item: quizItem, index });
        index += 1;
      }
    }

    const artifact = await this.repo.insertArtifact({
      ...this.repo.owner(principal),
      itemId: item.id,
      kind: 'quiz',
      title: `Quiz — ${item.title}`,
      content: { items },
      fromLabel,
    });
    await this.logArtifact(principal, item.id, artifact.id, 'quiz');
    emit({ type: 'saved', artifactId: artifact.id, kind: 'quiz' });
  }

  async getArtifact(principal: StudentPrincipal, artifactId: string) {
    const artifact = await this.repo.getArtifact(principal, artifactId);
    if (!artifact) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Artifact not found' });
    }
    return {
      id: artifact.id,
      itemId: artifact.itemId,
      kind: artifact.kind,
      title: artifact.title,
      fromLabel: artifact.fromLabel,
      content: artifact.content,
      createdAt: artifact.createdAt.toISOString(),
    };
  }

  async tutor(principal: StudentPrincipal, itemId: string, body?: unknown) {
    const focus = libraryTutorInputSchema.parse(body ?? {});
    const item = await this.requireReadyItem(principal, itemId);
    const topic = await this.learn.upsertTopicByKey(
      `doc:${item.id.slice(0, 8)}`,
      item.title,
      'Library',
      principal.kind === 'institutional' ? 'institution' : 'independent',
      principal.kind === 'institutional' ? principal.institutionId : null,
    );
    if (!topic) throw new Error('Failed to resolve topic');
    const session = await this.learn.createSession({
      institutionId: principal.kind === 'institutional' ? principal.institutionId : null,
      studentId: principal.kind === 'institutional' ? principal.studentId : null,
      independentUserId: principal.kind === 'independent' ? principal.independentUserId : null,
      topicId: topic.id,
      groundingKnowledgeItemId: item.id,
      status: 'active',
      spine: [],
      sessionPlan: {
        source: 'tutor_grounded',
        knowledgeItemId: item.id,
        focusConcept: focus.focusConcept,
      },
    });
    if (!session) throw new Error('Failed to create session');
    await this.ledger.log({
      eventType: 'session.started',
      payload: { sessionId: session.id, topicKey: topic.topicKey, source: 'tutor_grounded' },
      principal,
    });
    return { sessionId: session.id };
  }

  async saveFromClassMaterial(principal: StudentPrincipal, materialId: string) {
    if (principal.kind !== 'institutional') {
      throw new BadRequestException({ code: 'INSTITUTIONAL_ONLY', message: 'Class materials require a school account.' });
    }
    const material = await this.repo.getClassMaterial(materialId);
    if (!material) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Material not found' });
    const label = material.description
      ? `From: ${material.contextType} · ${material.description}`
      : `From: ${material.contextType} · ${material.title}`;
    const item = await this.repo.insertItem({
      institutionId: principal.institutionId,
      studentId: principal.studentId,
      independentUserId: null,
      kind: 'saved_material',
      title: material.title,
      objectIds: [material.objectId],
      origin: {
        source: 'class_material',
        classMaterialId: material.id,
        label,
      },
      pageCount: 1,
      pagesDone: 1,
      status: 'ready',
      extractedTextReady: true,
      aiRead: true,
    });
    await this.ledger.log({
      eventType: 'library.item_uploaded',
      payload: { itemId: item.id, mime: 'class_material', pages: 1 },
      principal,
    });
    return { itemId: item.id };
  }

  async deckFromSession(principal: StudentPrincipal, body: unknown) {
    const { sessionId } = deckFromSessionSchema.parse(body);
    const session = await this.learn.getSession(principal, sessionId);
    if (!session) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Session not found' });
    const evidence = (session.evidence as string[]) ?? [];
    const text = evidence.join('\n') || 'Session takeaways';
    const deck = await this.generateDeck(principal, text, 'Session takeaways');
    const row = await this.repo.insertDeck({
      ...this.repo.owner(principal),
      sourceSessionId: sessionId,
      title: deck.title,
      fromLabel: 'From your Learn session',
    });
    await this.repo.insertCards(
      deck.cards.map((c, i) => ({
        deckId: row.id,
        sequence: i + 1,
        prompt: c.prompt,
        answer: c.answer,
        sourcePage: c.sourcePage ?? null,
        nextDueAt: new Date(),
        intervalDays: '0',
        ease: '2.50',
        reps: 0,
        lapses: 0,
      })),
    );
    return { deckId: row.id };
  }

  /** Deposit summary + deck + quiz from a completed Learn session (auto-artifacts). */
  async depositFromSession(principal: StudentPrincipal, sessionId: string) {
    const session = await this.learn.getSession(principal, sessionId);
    if (!session) return null;
    const evidence = (session.evidence as string[]) ?? [];
    if (!evidence.length) return null;
    const text = evidence.join('\n');
    const fromLabel = 'From your Learn session';
    const owner = this.repo.owner(principal);

    const summary = await this.generateSummary(principal, text, 'Session summary');
    const summaryArt = await this.repo.insertArtifact({
      ...owner,
      sourceSessionId: sessionId,
      kind: 'summary',
      title: summary.title,
      content: summary,
      fromLabel,
    });

    const deck = await this.generateDeck(principal, text, 'Session flashcards');
    const deckRow = await this.repo.insertDeck({
      ...owner,
      sourceSessionId: sessionId,
      title: deck.title,
      fromLabel,
    });
    await this.repo.insertCards(
      deck.cards.map((c, i) => ({
        deckId: deckRow.id,
        sequence: i + 1,
        prompt: c.prompt,
        answer: c.answer,
        sourcePage: c.sourcePage ?? null,
        nextDueAt: new Date(),
        intervalDays: '0',
        ease: '2.50',
        reps: 0,
        lapses: 0,
      })),
    );

    const quiz = await this.generateQuiz(principal, text);
    const quizArt = await this.repo.insertArtifact({
      ...owner,
      sourceSessionId: sessionId,
      kind: 'quiz',
      title: 'Session quiz',
      content: quiz,
      fromLabel,
    });

    return { summaryId: summaryArt.id, deckId: deckRow.id, quizId: quizArt.id };
  }

  async getDeck(principal: StudentPrincipal, deckId: string) {
    const deck = await this.requireDeck(principal, deckId);
    const [cards, dueToday] = await Promise.all([this.repo.listCards(deck.id), this.repo.dueCount(deck.id)]);
    const now = Date.now();
    return {
      id: deck.id,
      title: deck.title,
      fromLabel: deck.fromLabel,
      itemId: deck.itemId,
      cardCount: cards.length,
      dueToday,
      freshness: await this.deckFreshness(deck.id),
      cards: cards.map((c) => ({
        id: c.id,
        sequence: c.sequence,
        prompt: c.prompt,
        answer: c.answer,
        sourcePage: c.sourcePage,
        nextDueAt: c.nextDueAt.toISOString(),
        dueNow: c.nextDueAt.getTime() <= now,
        ease: Number(c.ease),
        reps: c.reps,
        lapses: c.lapses,
      })),
    };
  }

  async reviewCard(principal: StudentPrincipal, deckId: string, body: unknown) {
    const parsed = flashcardReviewSchema.parse(body);
    const deck = await this.requireDeck(principal, deckId);
    const card = await this.repo.getCard(deck.id, parsed.cardId);
    if (!card) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Card not found' });

    const owner = this.repo.owner(principal);
    await this.repo.insertReview({
      cardId: card.id,
      studentId: owner.studentId,
      independentUserId: owner.independentUserId,
      result: parsed.result,
    });

    const q = parsed.result === 'got_it' ? 4 : 2;
    const easePrev = Number(card.ease) || 2.5;
    const intervalPrev = Number(card.intervalDays) || 0;
    let reps = card.reps ?? 0;
    let lapses = card.lapses ?? 0;
    let nextDue = new Date();
    let nextInterval = intervalPrev;
    let ease = easePrev;

    if (parsed.result === 'again') {
      reps = 0;
      lapses += 1;
      nextInterval = 0;
      nextDue = new Date(Date.now() + FLASHCARD_AGAIN_DELAY_MINUTES * 60_000);
      ease = Math.max(1.3, easePrev + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    } else {
      reps += 1;
      if (reps === 1) nextInterval = 1;
      else if (reps === 2) nextInterval = 6;
      else nextInterval = Math.max(1, Math.round(intervalPrev * easePrev));
      nextDue = new Date(Date.now() + nextInterval * 86_400_000);
      ease = Math.max(1.3, easePrev + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    }

    await this.repo.updateCard(card.id, {
      nextDueAt: nextDue,
      intervalDays: String(nextInterval),
      ease: ease.toFixed(2),
      reps,
      lapses,
    });

    const dueToday = await this.repo.dueCount(deck.id);
    await this.ledger.log({
      eventType: 'flashcards.reviewed',
      payload: {
        deckId: deck.id,
        cards: 1,
        gotIt: parsed.result === 'got_it' ? 1 : 0,
        again: parsed.result === 'again' ? 1 : 0,
      },
      principal,
    });
    return { ok: true, nextDueAt: nextDue.toISOString(), dueToday };
  }

  async patchDeck(principal: StudentPrincipal, deckId: string, body: unknown) {
    const parsed = patchDeckSchema.parse(body);
    await this.requireDeck(principal, deckId);
    if (parsed.cardOrder?.length) {
      await this.repo.reorderCards(deckId, parsed.cardOrder);
    }
    if (parsed.title) {
      await this.repo.updateDeck(deckId, { title: parsed.title });
    }
    return this.getDeck(principal, deckId);
  }

  async addCard(principal: StudentPrincipal, deckId: string, body: unknown) {
    const parsed = createFlashcardSchema.parse(body);
    const deck = await this.requireDeck(principal, deckId);
    const cards = await this.repo.listCards(deck.id);
    const seq = parsed.sequence ?? cards.length + 1;
    const [created] = await this.repo.insertCards([
      {
        deckId: deck.id,
        sequence: seq,
        prompt: parsed.prompt,
        answer: parsed.answer,
        sourcePage: parsed.sourcePage ?? null,
        nextDueAt: new Date(),
        intervalDays: '0',
        ease: '2.50',
        reps: 0,
        lapses: 0,
      },
    ]);
    return created;
  }

  async patchCard(principal: StudentPrincipal, deckId: string, cardId: string, body: unknown) {
    const parsed = patchFlashcardSchema.parse(body);
    await this.requireDeck(principal, deckId);
    const card = await this.repo.getCard(deckId, cardId);
    if (!card) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Card not found' });
    return this.repo.updateCard(cardId, parsed);
  }

  async deleteCard(principal: StudentPrincipal, deckId: string, cardId: string) {
    await this.requireDeck(principal, deckId);
    await this.repo.deleteCard(cardId);
    return { ok: true };
  }

  async quizAttempt(principal: StudentPrincipal, artifactId: string, body: unknown) {
    const parsed = quizAttemptSchema.parse(body);
    const artifact = await this.repo.getArtifact(principal, artifactId);
    if (!artifact || artifact.kind !== 'quiz') {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Quiz not found' });
    }
    const content = quizContentSchema.parse(artifact.content);
    const items = content.items.map((item, idx) => {
      const ans = parsed.answers.find((a) => a.itemIndex === idx);
      return {
        qtype: item.qtype,
        prompt: item.prompt,
        correctKey: item.correctKey,
        markingNote: item.markingNote,
        choiceKey: ans?.choiceKey,
        answerText: ans?.answerText,
        sourcePage: item.sourcePage,
      };
    });
    const diagnostic = await this.evaluator.evaluateQuizDiagnostic(principal, items);
    const owner = this.repo.owner(principal);
    const attempt = await this.repo.insertQuizAttempt({
      artifactId,
      institutionId: owner.institutionId,
      studentId: owner.studentId,
      independentUserId: owner.independentUserId,
      answers: parsed.answers,
      results: diagnostic.results,
      patterns: diagnostic.patterns,
    });
    await this.repo.updateArtifact(artifactId, { lastInteractedAt: new Date() });
    await this.ledger.log({
      eventType: 'quiz.completed',
      payload: { artifactId, attemptId: attempt.id },
      principal,
    });
    return {
      attemptId: attempt.id,
      results: diagnostic.results,
      patterns: diagnostic.patterns,
    };
  }

  async getQuizAttempt(principal: StudentPrincipal, artifactId: string, attemptId: string) {
    const attempt = await this.repo.getQuizAttempt(principal, artifactId, attemptId);
    if (!attempt) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Attempt not found' });
    return {
      attemptId: attempt.id,
      artifactId: attempt.artifactId,
      results: attempt.results,
      patterns: attempt.patterns,
      finishedAt: attempt.finishedAt.toISOString(),
    };
  }

  private async requireItem(principal: StudentPrincipal, id: string) {
    const item = await this.repo.getItem(principal, id);
    if (!item) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Item not found' });
    return item;
  }

  private async requireReadyItem(principal: StudentPrincipal, id: string) {
    const item = await this.requireItem(principal, id);
    if (item.status === 'needs_ocr_confirm') {
      throw new BadRequestException({
        code: 'NEEDS_CONFIRM',
        message: 'Confirm the extracted text before generating artifacts.',
      });
    }
    if (item.status !== 'ready') {
      throw new BadRequestException({
        code: 'NOT_READY',
        message: 'Petros is still reading this document — try again shortly.',
      });
    }
    return item;
  }

  private async requireCollection(principal: StudentPrincipal, id: string) {
    const row = await this.repo.getCollection(principal, id);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Collection not found' });
    return row;
  }

  private async requireDeck(principal: StudentPrincipal, id: string) {
    const row = await this.repo.getDeck(principal, id);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Deck not found' });
    return row;
  }

  private inferKind(objects: { mimeType: string }[]) {
    if (objects.every((o) => PDF_MIMES.has(o.mimeType))) return 'upload_pdf';
    if (objects.every((o) => IMAGE_MIMES.has(o.mimeType))) return 'upload_scan';
    if (objects.some((o) => DOC_MIMES.has(o.mimeType))) return 'upload_doc';
    return 'upload_scan';
  }

  private async extractedText(item: { id: string; title: string }) {
    const pages = await this.repo.listPages(item.id);
    if (pages.length) {
      return pages.map((p) => `[p.${p.pageIndex + 1}]\n${p.text}`).join('\n\n');
    }
    return `Document: ${item.title}`;
  }

  private async logArtifact(
    principal: StudentPrincipal,
    itemId: string | undefined,
    artifactId: string,
    artifactKind: string,
  ) {
    await this.ledger.log({
      eventType: 'library.artifact_generated',
      payload: { itemId, artifactId, artifactKind },
      principal,
    });
  }

  private async generateSummary(principal: StudentPrincipal, text: string, fallbackTitle: string) {
    if (!this.ai.available) {
      return {
        title: fallbackTitle,
        sections: [{ heading: 'Summary', body: text.slice(0, 1200), sourcePage: 1 }],
      };
    }
    await this.budgets.spend(principal, 'library_gen', 1200);
    const { result, usage } = await this.ai.completeJson({
      purpose: 'library_gen',
      tier: 'small',
      system: GROUNDING_SYSTEM + ' Summarize preserving student wording. Cite sourcePage from [p.N].',
      user: text.slice(0, 12_000),
      schema: summaryContentSchema,
      schemaName: 'summary',
      maxOutputTokens: 2000,
    });
    await this.callLog.log(principal, 'library_gen', usage);
    return result;
  }

  private async generateDeck(principal: StudentPrincipal, text: string, fallbackTitle: string) {
    if (!this.ai.available) {
      return {
        title: fallbackTitle,
        cards: [{ prompt: 'Key idea?', answer: text.slice(0, 200), sourcePage: 1 }],
      };
    }
    await this.budgets.spend(principal, 'library_gen', 1500);
    const { result, usage } = await this.ai.completeJson({
      purpose: 'library_gen',
      tier: 'small',
      system: GROUNDING_SYSTEM + ' Create 8-24 flashcards preserving student wording. Cite sourcePage from [p.N].',
      user: text.slice(0, 12_000),
      schema: deckGenerationSchema,
      schemaName: 'deck',
      maxOutputTokens: 3000,
    });
    await this.callLog.log(principal, 'library_gen', usage);
    return result;
  }

  private async generateQuiz(principal: StudentPrincipal, text: string) {
    if (!this.ai.available) {
      return {
        items: [
          {
            qtype: 'short' as const,
            prompt: 'What is the main idea?',
            markingNote: 'Any reasonable summary.',
            sourcePage: 1,
          },
        ],
      };
    }
    await this.budgets.spend(principal, 'library_gen', 1500);
    const { result, usage } = await this.ai.completeJson({
      purpose: 'library_gen',
      tier: 'small',
      system: GROUNDING_SYSTEM + ' Create 10-15 quiz items (mcq+short mix). Cite sourcePage from [p.N].',
      user: text.slice(0, 12_000),
      schema: quizContentSchema,
      schemaName: 'quiz',
      maxOutputTokens: 3000,
    });
    await this.callLog.log(principal, 'library_gen', usage);
    return result;
  }

  private async generateConceptMap(principal: StudentPrincipal, text: string, sourceTitle: string) {
    if (!this.ai.available) return this.stubConceptMap(sourceTitle);
    await this.budgets.spend(principal, 'library_gen', 2000);
    try {
      const { result, usage } = await this.ai.completeJson({
        purpose: 'library_gen',
        tier: 'large',
        system:
          GROUNDING_SYSTEM +
          ' Extract how ideas connect into a concept map. Layout web or flowchart. 8–20 nodes with sourceLocation like "p. 3".',
        user: text.slice(0, 12_000),
        schema: conceptMapContentSchema,
        schemaName: 'concept_map',
        maxOutputTokens: 4000,
      });
      await this.callLog.log(principal, 'library_gen', usage);
      return result;
    } catch {
      return this.stubConceptMap(sourceTitle);
    }
  }

  private async generateGlossary(principal: StudentPrincipal, text: string, sourceTitle: string) {
    if (!this.ai.available) return this.stubGlossary(sourceTitle);
    await this.budgets.spend(principal, 'library_gen', 1500);
    try {
      const { result, usage } = await this.ai.completeJson({
        purpose: 'library_gen',
        tier: 'large',
        system:
          GROUNDING_SYSTEM +
          ' Extract only terms the source defines. Each entry: term, definition, sourceLocation.',
        user: text.slice(0, 12_000),
        schema: glossaryContentSchema,
        schemaName: 'glossary',
        maxOutputTokens: 3000,
      });
      await this.callLog.log(principal, 'library_gen', usage);
      return result;
    } catch {
      return this.stubGlossary(sourceTitle);
    }
  }

  private stubConceptMap(sourceTitle: string) {
    return {
      title: `Concept map — ${sourceTitle}`,
      layout: 'web' as const,
      nodes: [
        {
          id: '1',
          label: sourceTitle,
          miniDefinition: 'The central topic from your source.',
          sourceLocation: 'p. 1',
          x: 50,
          y: 18,
        },
        {
          id: '2',
          label: 'Key idea A',
          miniDefinition: 'A supporting concept linked to the topic.',
          sourceLocation: 'p. 2',
          x: 22,
          y: 55,
        },
        {
          id: '3',
          label: 'Key idea B',
          miniDefinition: 'Another connected idea from the source.',
          sourceLocation: 'p. 3',
          x: 78,
          y: 55,
        },
        {
          id: '4',
          label: 'Application',
          miniDefinition: 'How the ideas come together in practice.',
          sourceLocation: 'p. 4',
          x: 50,
          y: 85,
        },
      ],
      edges: [
        { from: '1', to: '2', relation: 'depends_on' as const },
        { from: '1', to: '3', relation: 'depends_on' as const },
        { from: '2', to: '4', relation: 'step' as const },
        { from: '3', to: '4', relation: 'step' as const },
      ],
    };
  }

  private stubGlossary(sourceTitle: string) {
    return {
      title: `Glossary — ${sourceTitle}`,
      entries: [
        { term: sourceTitle, definition: 'The main subject of this document.', sourceLocation: 'p. 1' },
        { term: 'Key term', definition: 'An important defined term from the source.', sourceLocation: 'p. 2' },
      ],
    };
  }

  private artifactFreshness(
    createdAt: Date,
    lastInteractedAt: Date | null,
  ): 'fresh' | 'fading' | 'due' {
    const anchor = lastInteractedAt ?? createdAt;
    const days = (Date.now() - anchor.getTime()) / 86_400_000;
    if (days > FRESHNESS_FRESH_DAYS * 3) return 'due';
    if (days > FRESHNESS_FRESH_DAYS) return 'fading';
    return 'fresh';
  }

  private deckFreshnessFromMaps(
    deckId: string,
    dueMap: Map<string, number>,
    earliestMap: Map<string, Date>,
  ): 'fresh' | 'fading' | 'due' {
    if ((dueMap.get(deckId) ?? 0) > 0) return 'due';
    const earliest = earliestMap.get(deckId);
    if (!earliest) return 'fresh';
    const days = (Date.now() - earliest.getTime()) / 86_400_000;
    return days > FRESHNESS_FRESH_DAYS ? 'fading' : 'fresh';
  }

  private async deckFreshness(deckId: string): Promise<'fresh' | 'fading' | 'due'> {
    const due = await this.repo.dueCount(deckId);
    if (due > 0) return 'due';
    const cards = await this.repo.listCards(deckId);
    if (!cards.length) return 'fresh';
    const oldest = cards.reduce((min, c) => (c.nextDueAt < min ? c.nextDueAt : min), cards[0]!.nextDueAt);
    const days = (Date.now() - oldest.getTime()) / 86_400_000;
    return days > FRESHNESS_FRESH_DAYS ? 'fading' : 'fresh';
  }
}

const GROUNDING_SYSTEM =
  'You are Petros helping a student study their own material. Ground every claim in the provided source text marked with [p.N] page markers. If the source does not cover something, say so. Never invent facts beyond the source.';
