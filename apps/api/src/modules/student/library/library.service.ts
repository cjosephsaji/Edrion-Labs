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
  patchKnowledgeItemPagesSchema,
  quizAttemptSchema,
  quizContentSchema,
  summaryContentSchema,
  type CreateKnowledgeItemInput,
} from '@edrion/schemas';
import {
  FLASHCARD_AGAIN_DELAY_MINUTES,
  FLASHCARD_INTERVAL_MULTIPLIER,
  FLASHCARD_MIN_INTERVAL_DAYS,
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
      return {
        collections: [],
        uploads: hits.items.map((i) => ({
          id: i.id,
          kind: i.kind,
          title: i.title,
          meta: '',
          aiRead: false,
          createdAt: new Date().toISOString(),
        })),
        generated: hits.artifacts.map((a) => ({
          id: a.id,
          kind: a.kind as 'summary',
          title: a.title,
          fromLabel: '',
          createdAt: new Date().toISOString(),
        })),
        recentAdded: [],
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

    const generated = [
      ...artifacts.map((a) => ({
        id: a.id,
        kind: a.kind as 'summary' | 'quiz' | 'topic_pack' | 'visual' | 'concept_map' | 'glossary',
        title: a.title,
        fromLabel: a.fromLabel,
        freshness: undefined as 'fresh' | 'fading' | 'due' | undefined,
        meta: a.kind,
        createdAt: a.createdAt.toISOString(),
      })),
      ...(await Promise.all(
        decks.map(async (d) => ({
          id: d.id,
          kind: 'deck' as const,
          title: d.title,
          fromLabel: d.fromLabel,
          freshness: await this.deckFreshness(d.id),
          meta: `${await this.repo.listCards(d.id).then((c) => c.length)} cards`,
          createdAt: d.createdAt.toISOString(),
        })),
      )),
    ];

    return {
      collections: collectionCounts,
      uploads: uploads.map((u) => ({
        id: u.id,
        kind: u.kind,
        title: u.title,
        meta: u.pageCount ? `${u.pageCount} pages` : '',
        aiRead: u.aiRead,
        createdAt: u.createdAt.toISOString(),
      })),
      generated,
      recentAdded: uploads.slice(0, 8).map((u) => ({ id: u.id, title: u.title, kind: u.kind })),
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
    const item = await this.repo.insertItem({
      ...owner,
      collectionId: parsed.collectionId ?? null,
      kind,
      title,
      objectIds: parsed.objectIds,
      origin: { source: 'upload' },
      pageCount: objects.length,
      extractedTextReady: false,
      aiRead: false,
    });

    await this.ledger.log({
      eventType: 'library.item_uploaded',
      payload: { itemId: item.id },
      principal,
    });

    void this.processItemText(principal, item.id);
    return this.getItem(principal, item.id);
  }

  async patchItemPages(principal: StudentPrincipal, id: string, objectIds: string[]) {
    patchKnowledgeItemPagesSchema.parse({ objectIds });
    const item = await this.requireItem(principal, id);
    const objects = await this.repo.getStorageObjects(objectIds);
    for (const obj of objects) await this.storage.getOwned(principal, obj.id);
    await this.repo.updateItem(item.id, { objectIds, pageCount: objectIds.length, extractedTextReady: false, aiRead: false });
    void this.processItemText(principal, item.id);
    return this.getItem(principal, id);
  }

  async getItem(principal: StudentPrincipal, id: string) {
    const item = await this.requireItem(principal, id);
    const [artifacts, objects] = await Promise.all([
      this.repo.artifactsForItem(item.id),
      this.repo.getStorageObjects(item.objectIds),
    ]);
    return {
      item: {
        id: item.id,
        kind: item.kind,
        title: item.title,
        collectionId: item.collectionId,
        pageCount: item.pageCount,
        extractedTextReady: item.extractedTextReady,
        aiRead: item.aiRead,
        origin: item.origin,
        createdAt: item.createdAt.toISOString(),
      },
      pages: objects.map((o) => ({
        id: o.id,
        mimeType: o.mimeType,
        filename: o.filename,
      })),
      artifacts: artifacts.map((a) => ({
        id: a.id,
        kind: a.kind,
        title: a.title,
        fromLabel: a.fromLabel,
        createdAt: a.createdAt.toISOString(),
      })),
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
    const item = await this.requireItem(principal, itemId);
    const text = await this.extractedText(item);
    const content = await this.generateSummary(principal, text, item.title);
    return this.repo.insertArtifact({
      ...this.repo.owner(principal),
      itemId: item.id,
      kind: 'summary',
      title: content.title,
      content,
      fromLabel: `From: ${item.title}`,
    });
  }

  async flashcards(principal: StudentPrincipal, itemId: string) {
    const item = await this.requireItem(principal, itemId);
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
        nextDueAt: new Date(),
        intervalDays: '0',
      })),
    );
    return { deckId: row.id, title: row.title };
  }

  async quiz(principal: StudentPrincipal, itemId: string) {
    const item = await this.requireItem(principal, itemId);
    const text = await this.extractedText(item);
    const content = await this.generateQuiz(principal, text);
    return this.repo.insertArtifact({
      ...this.repo.owner(principal),
      itemId: item.id,
      kind: 'quiz',
      title: `Quiz — ${item.title}`,
      content,
      fromLabel: `From: ${item.title}`,
    });
  }

  async conceptMap(principal: StudentPrincipal, itemId: string) {
    const item = await this.requireItem(principal, itemId);
    const text = await this.extractedText(item);
    const content = await this.generateConceptMap(principal, text, item.title);
    return this.repo.insertArtifact({
      ...this.repo.owner(principal),
      itemId: item.id,
      kind: 'concept_map',
      title: content.title,
      content,
      fromLabel: `From: ${item.title}`,
    });
  }

  async glossary(principal: StudentPrincipal, itemId: string) {
    const item = await this.requireItem(principal, itemId);
    const text = await this.extractedText(item);
    const content = await this.generateGlossary(principal, text, item.title);
    return this.repo.insertArtifact({
      ...this.repo.owner(principal),
      itemId: item.id,
      kind: 'glossary',
      title: content.title,
      content,
      fromLabel: `From: ${item.title}`,
    });
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
    const item = await this.requireItem(principal, itemId);
    if (!item.extractedTextReady) {
      throw new BadRequestException({
        code: 'NOT_READY',
        message: 'Petros is still reading this document — try again shortly.',
      });
    }
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
      extractedTextReady: true,
      aiRead: true,
    });
    await this.ledger.log({ eventType: 'library.item_uploaded', payload: { itemId: item.id }, principal });
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
        nextDueAt: new Date(),
        intervalDays: '0',
      })),
    );
    return { deckId: row.id };
  }

  async getDeck(principal: StudentPrincipal, deckId: string) {
    const deck = await this.requireDeck(principal, deckId);
    const [cards, dueToday] = await Promise.all([this.repo.listCards(deck.id), this.repo.dueCount(deck.id)]);
    return {
      id: deck.id,
      title: deck.title,
      fromLabel: deck.fromLabel,
      cardCount: cards.length,
      dueToday,
      freshness: await this.deckFreshness(deck.id),
      cards: cards.map((c) => ({
        id: c.id,
        sequence: c.sequence,
        prompt: c.prompt,
        answer: c.answer,
        nextDueAt: c.nextDueAt.toISOString(),
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

    const interval = Number(card.intervalDays);
    let nextDue = new Date();
    let nextInterval = interval;
    if (parsed.result === 'again') {
      nextDue = new Date(Date.now() + FLASHCARD_AGAIN_DELAY_MINUTES * 60_000);
      nextInterval = 0;
    } else {
      nextInterval = Math.max(FLASHCARD_MIN_INTERVAL_DAYS, interval <= 0 ? 1 : interval * FLASHCARD_INTERVAL_MULTIPLIER);
      nextDue = new Date(Date.now() + nextInterval * 86_400_000);
    }
    await this.repo.updateCard(card.id, { nextDueAt: nextDue, intervalDays: String(nextInterval) });

    await this.ledger.log({
      eventType: 'flashcards.reviewed',
      payload: { deckId: deck.id, cardId: card.id },
      principal,
    });
    return { ok: true, nextDueAt: nextDue.toISOString() };
  }

  async patchDeck(principal: StudentPrincipal, deckId: string, body: unknown) {
    const parsed = patchDeckSchema.parse(body);
    await this.requireDeck(principal, deckId);
    return this.repo.updateDeck(deckId, parsed);
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
        nextDueAt: new Date(),
        intervalDays: '0',
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
        correctKey: item.correctKey,
        markingNote: item.markingNote,
        choiceKey: ans?.choiceKey,
        answerText: ans?.answerText,
      };
    });
    const result = await this.evaluator.evaluateQuizItems(principal, items);
    await this.ledger.log({
      eventType: 'quiz.completed',
      payload: { artifactId, total: result.total, correct: result.correct },
      principal,
    });
    return result;
  }

  private async requireItem(principal: StudentPrincipal, id: string) {
    const item = await this.repo.getItem(principal, id);
    if (!item) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Item not found' });
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

  private async processItemText(principal: StudentPrincipal, itemId: string) {
    const item = await this.repo.getItem(principal, itemId);
    if (!item) return;
    const objects = await this.repo.getStorageObjects(item.objectIds);
    let text = '';
    for (const obj of objects) {
      const derived = obj.derived as { extractedText?: string };
      if (derived.extractedText) text += derived.extractedText + '\n';
    }
    if (!text.trim() && this.ai.available) {
      try {
        await this.budgets.spend(principal, 'ocr', 800);
        const { result, usage } = await this.ai.completeJson({
          purpose: 'ocr',
          tier: 'vision',
          system: 'Extract plain text from document images. Preserve student notation.',
          user: 'Extract all readable text.',
          schema: z.object({ text: z.string() }),
          schemaName: 'ocr',
          maxOutputTokens: 4000,
        });
        await this.callLog.log(principal, 'ocr', usage);
        text = result.text;
      } catch {
        text = '';
      }
    }
    await this.repo.updateItem(item.id, {
      extractedTextReady: true,
      aiRead: text.trim().length > 0,
    });
    await this.ledger.log({
      eventType: 'library.item_processed',
      payload: { itemId: item.id },
      principal,
    });
  }

  private async extractedText(item: { objectIds: string[]; title: string }) {
    const objects = await this.repo.getStorageObjects(item.objectIds);
    const chunks = objects.map((o) => (o.derived as { extractedText?: string }).extractedText ?? '').filter(Boolean);
    if (chunks.length) return chunks.join('\n\n');
    return `Document: ${item.title}`;
  }

  private async generateSummary(principal: StudentPrincipal, text: string, fallbackTitle: string) {
    if (!this.ai.available) {
      return { title: fallbackTitle, sections: [{ heading: 'Summary', body: text.slice(0, 1200) }] };
    }
    await this.budgets.spend(principal, 'library_gen', 1200);
    const { result, usage } = await this.ai.completeJson({
      purpose: 'library_gen',
      tier: 'small',
      system: 'Summarize preserving the student own symbols and wording.',
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
        cards: [{ prompt: 'Key idea?', answer: text.slice(0, 200) }],
      };
    }
    await this.budgets.spend(principal, 'library_gen', 1500);
    const { result, usage } = await this.ai.completeJson({
      purpose: 'library_gen',
      tier: 'small',
      system: 'Create 8-24 flashcards preserving student wording.',
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
        items: [{ qtype: 'short' as const, prompt: 'What is the main idea?', markingNote: 'Any reasonable summary.' }],
      };
    }
    await this.budgets.spend(principal, 'library_gen', 1500);
    const { result, usage } = await this.ai.completeJson({
      purpose: 'library_gen',
      tier: 'small',
      system: 'Create 10-15 quiz items (mcq+short mix).',
      user: text.slice(0, 12_000),
      schema: quizContentSchema,
      schemaName: 'quiz',
      maxOutputTokens: 3000,
    });
    await this.callLog.log(principal, 'library_gen', usage);
    return result;
  }

  private async generateConceptMap(principal: StudentPrincipal, text: string, sourceTitle: string) {
    if (!this.ai.available) {
      return this.stubConceptMap(sourceTitle);
    }
    await this.budgets.spend(principal, 'library_gen', 2000);
    try {
      const { result, usage } = await this.ai.completeJson({
        purpose: 'library_gen',
        tier: 'large',
        system:
          'Extract how ideas in the source connect into a concept map. Choose layout web for interconnected ideas or flowchart for process-heavy sources. Include 8–20 nodes. Each node needs id, label, miniDefinition grounded in the source (never the final answer), sourceLocation (page/passage reference like "p. 3" or "Section 2"), and optional x/y (0–100). Edges need from, to, relation (depends_on|part_of|step).',
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
    if (!this.ai.available) {
      return this.stubGlossary(sourceTitle);
    }
    await this.budgets.spend(principal, 'library_gen', 1500);
    try {
      const { result, usage } = await this.ai.completeJson({
        purpose: 'library_gen',
        tier: 'large',
        system:
          'Extract only terms the source actually defines — no invented vocabulary. Each entry: term, definition (from source wording), sourceLocation (page/passage reference).',
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
        {
          term: sourceTitle,
          definition: 'The main subject of this document.',
          sourceLocation: 'p. 1',
        },
        {
          term: 'Key term',
          definition: 'An important defined term from the source.',
          sourceLocation: 'p. 2',
        },
      ],
    };
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
