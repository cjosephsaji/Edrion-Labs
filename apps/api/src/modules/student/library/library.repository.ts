import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import type { StudentPrincipal } from '../student.types';
import { ownerColumns, ownerWhere } from '../core/owner-scope';

@Injectable()
export class LibraryRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  owner(principal: StudentPrincipal) {
    return ownerColumns(principal);
  }

  async listCollections(principal: StudentPrincipal) {
    return this.db
      .select()
      .from(schema.knowledgeCollections)
      .where(ownerWhere(principal, schema.knowledgeCollections.studentId, schema.knowledgeCollections.independentUserId))
      .orderBy(asc(schema.knowledgeCollections.sequence), asc(schema.knowledgeCollections.name));
  }

  async countItemsInCollection(collectionId: string) {
    const [row] = await this.db
      .select({ n: count() })
      .from(schema.knowledgeItems)
      .where(eq(schema.knowledgeItems.collectionId, collectionId));
    return Number(row?.n ?? 0);
  }

  async listItemsInCollection(principal: StudentPrincipal, collectionId: string) {
    return this.db
      .select()
      .from(schema.knowledgeItems)
      .where(
        and(
          eq(schema.knowledgeItems.collectionId, collectionId),
          ownerWhere(principal, schema.knowledgeItems.studentId, schema.knowledgeItems.independentUserId),
        ),
      )
      .orderBy(desc(schema.knowledgeItems.createdAt));
  }

  async listUploads(principal: StudentPrincipal, limit = 50) {
    return this.db
      .select()
      .from(schema.knowledgeItems)
      .where(ownerWhere(principal, schema.knowledgeItems.studentId, schema.knowledgeItems.independentUserId))
      .orderBy(desc(schema.knowledgeItems.createdAt))
      .limit(limit);
  }

  async listArtifacts(principal: StudentPrincipal) {
    return this.db
      .select()
      .from(schema.knowledgeArtifacts)
      .where(ownerWhere(principal, schema.knowledgeArtifacts.studentId, schema.knowledgeArtifacts.independentUserId))
      .orderBy(desc(schema.knowledgeArtifacts.createdAt));
  }

  async listDecks(principal: StudentPrincipal) {
    return this.db
      .select()
      .from(schema.flashcardDecks)
      .where(ownerWhere(principal, schema.flashcardDecks.studentId, schema.flashcardDecks.independentUserId))
      .orderBy(desc(schema.flashcardDecks.createdAt));
  }

  async listCanvases(principal: StudentPrincipal) {
    return this.db
      .select()
      .from(schema.visualCanvases)
      .where(
        ownerWhere(principal, schema.visualCanvases.studentId, schema.visualCanvases.independentUserId),
      )
      .orderBy(desc(schema.visualCanvases.updatedAt));
  }

  async listCanvasesForItem(itemId: string) {
    return this.db
      .select()
      .from(schema.visualCanvases)
      .where(eq(schema.visualCanvases.sourceId, itemId))
      .orderBy(desc(schema.visualCanvases.updatedAt));
  }

  async mappedLegacyArtifactIds(principal: StudentPrincipal) {
    const rows = await this.db
      .select({ legacyArtifactId: schema.visualCanvases.legacyArtifactId })
      .from(schema.visualCanvases)
      .where(
        and(
          ownerWhere(principal, schema.visualCanvases.studentId, schema.visualCanvases.independentUserId),
          sql`${schema.visualCanvases.legacyArtifactId} IS NOT NULL`,
        ),
      );
    return new Set(
      rows.map((r) => r.legacyArtifactId).filter((id): id is string => id != null),
    );
  }

  async getItem(principal: StudentPrincipal, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.knowledgeItems)
      .where(
        and(
          eq(schema.knowledgeItems.id, id),
          ownerWhere(principal, schema.knowledgeItems.studentId, schema.knowledgeItems.independentUserId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async artifactsForItem(itemId: string) {
    return this.db
      .select()
      .from(schema.knowledgeArtifacts)
      .where(eq(schema.knowledgeArtifacts.itemId, itemId))
      .orderBy(desc(schema.knowledgeArtifacts.createdAt));
  }

  async decksForItem(itemId: string) {
    return this.db
      .select()
      .from(schema.flashcardDecks)
      .where(eq(schema.flashcardDecks.itemId, itemId))
      .orderBy(desc(schema.flashcardDecks.createdAt));
  }

  async listPages(itemId: string) {
    return this.db
      .select()
      .from(schema.knowledgeItemPages)
      .where(eq(schema.knowledgeItemPages.itemId, itemId))
      .orderBy(asc(schema.knowledgeItemPages.pageIndex));
  }

  async upsertPage(row: typeof schema.knowledgeItemPages.$inferInsert) {
    const [created] = await this.db
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
      })
      .returning();
    return created!;
  }

  async bulkUpsertPages(rows: Array<typeof schema.knowledgeItemPages.$inferInsert>) {
    if (!rows.length) return;
    await this.db
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

  async updatePageText(itemId: string, pageIndex: number, text: string) {
    const [updated] = await this.db
      .update(schema.knowledgeItemPages)
      .set({
        text,
        needsConfirm: false,
        confirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(schema.knowledgeItemPages.itemId, itemId), eq(schema.knowledgeItemPages.pageIndex, pageIndex)),
      )
      .returning();
    return updated ?? null;
  }

  async confirmAllPages(itemId: string) {
    await this.db
      .update(schema.knowledgeItemPages)
      .set({
        needsConfirm: false,
        confirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.knowledgeItemPages.itemId, itemId));
  }

  async deletePagesForItem(itemId: string) {
    await this.db.delete(schema.knowledgeItemPages).where(eq(schema.knowledgeItemPages.itemId, itemId));
  }

  async insertItem(row: typeof schema.knowledgeItems.$inferInsert) {
    const [created] = await this.db.insert(schema.knowledgeItems).values(row).returning();
    return created!;
  }

  async updateItem(id: string, patch: Partial<typeof schema.knowledgeItems.$inferInsert>) {
    const [updated] = await this.db
      .update(schema.knowledgeItems)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.knowledgeItems.id, id))
      .returning();
    return updated ?? null;
  }

  async insertCollection(row: typeof schema.knowledgeCollections.$inferInsert) {
    const [created] = await this.db.insert(schema.knowledgeCollections).values(row).returning();
    return created!;
  }

  async updateCollection(id: string, patch: Partial<typeof schema.knowledgeCollections.$inferInsert>) {
    const [updated] = await this.db
      .update(schema.knowledgeCollections)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.knowledgeCollections.id, id))
      .returning();
    return updated ?? null;
  }

  async deleteCollection(id: string) {
    await this.db.delete(schema.knowledgeCollections).where(eq(schema.knowledgeCollections.id, id));
  }

  async getCollection(principal: StudentPrincipal, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.knowledgeCollections)
      .where(
        and(
          eq(schema.knowledgeCollections.id, id),
          ownerWhere(principal, schema.knowledgeCollections.studentId, schema.knowledgeCollections.independentUserId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async insertArtifact(row: typeof schema.knowledgeArtifacts.$inferInsert) {
    const [created] = await this.db.insert(schema.knowledgeArtifacts).values(row).returning();
    return created!;
  }

  async getArtifact(principal: StudentPrincipal, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.knowledgeArtifacts)
      .where(
        and(
          eq(schema.knowledgeArtifacts.id, id),
          ownerWhere(principal, schema.knowledgeArtifacts.studentId, schema.knowledgeArtifacts.independentUserId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async updateArtifact(id: string, patch: Partial<typeof schema.knowledgeArtifacts.$inferInsert>) {
    const [updated] = await this.db
      .update(schema.knowledgeArtifacts)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.knowledgeArtifacts.id, id))
      .returning();
    return updated ?? null;
  }

  async insertQuizAttempt(row: typeof schema.libraryQuizAttempts.$inferInsert) {
    const [created] = await this.db.insert(schema.libraryQuizAttempts).values(row).returning();
    return created!;
  }

  async getQuizAttempt(principal: StudentPrincipal, artifactId: string, attemptId: string) {
    const [row] = await this.db
      .select()
      .from(schema.libraryQuizAttempts)
      .where(
        and(
          eq(schema.libraryQuizAttempts.id, attemptId),
          eq(schema.libraryQuizAttempts.artifactId, artifactId),
          ownerWhere(
            principal,
            schema.libraryQuizAttempts.studentId,
            schema.libraryQuizAttempts.independentUserId,
          ),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async insertDeck(row: typeof schema.flashcardDecks.$inferInsert) {
    const [created] = await this.db.insert(schema.flashcardDecks).values(row).returning();
    return created!;
  }

  async getDeck(principal: StudentPrincipal, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.flashcardDecks)
      .where(
        and(
          eq(schema.flashcardDecks.id, id),
          ownerWhere(principal, schema.flashcardDecks.studentId, schema.flashcardDecks.independentUserId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async updateDeck(id: string, patch: Partial<typeof schema.flashcardDecks.$inferInsert>) {
    const [updated] = await this.db
      .update(schema.flashcardDecks)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.flashcardDecks.id, id))
      .returning();
    return updated ?? null;
  }

  async listCards(deckId: string) {
    return this.db
      .select()
      .from(schema.flashcards)
      .where(eq(schema.flashcards.deckId, deckId))
      .orderBy(asc(schema.flashcards.sequence));
  }

  async insertCards(rows: (typeof schema.flashcards.$inferInsert)[]) {
    if (!rows.length) return [];
    return this.db.insert(schema.flashcards).values(rows).returning();
  }

  async getCard(deckId: string, cardId: string) {
    const [row] = await this.db
      .select()
      .from(schema.flashcards)
      .where(and(eq(schema.flashcards.id, cardId), eq(schema.flashcards.deckId, deckId)))
      .limit(1);
    return row ?? null;
  }

  async updateCard(cardId: string, patch: Partial<typeof schema.flashcards.$inferInsert>) {
    const [updated] = await this.db
      .update(schema.flashcards)
      .set(patch)
      .where(eq(schema.flashcards.id, cardId))
      .returning();
    return updated ?? null;
  }

  async deleteCard(cardId: string) {
    await this.db.delete(schema.flashcards).where(eq(schema.flashcards.id, cardId));
  }

  async reorderCards(deckId: string, cardOrder: string[]) {
    // Two-phase update avoids unique (deck_id, sequence) collisions mid-reorder.
    for (let i = 0; i < cardOrder.length; i++) {
      await this.db
        .update(schema.flashcards)
        .set({ sequence: 10000 + i })
        .where(and(eq(schema.flashcards.id, cardOrder[i]!), eq(schema.flashcards.deckId, deckId)));
    }
    for (let i = 0; i < cardOrder.length; i++) {
      await this.db
        .update(schema.flashcards)
        .set({ sequence: i + 1 })
        .where(and(eq(schema.flashcards.id, cardOrder[i]!), eq(schema.flashcards.deckId, deckId)));
    }
  }

  async dueCount(deckId: string) {
    const now = new Date();
    const [row] = await this.db
      .select({ n: count() })
      .from(schema.flashcards)
      .where(and(eq(schema.flashcards.deckId, deckId), lte(schema.flashcards.nextDueAt, now)));
    return Number(row?.n ?? 0);
  }

  async dueCountsForDecks(deckIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!deckIds.length) return map;
    const now = new Date();
    const rows = await this.db
      .select({ deckId: schema.flashcards.deckId, n: count() })
      .from(schema.flashcards)
      .where(and(inArray(schema.flashcards.deckId, deckIds), lte(schema.flashcards.nextDueAt, now)))
      .groupBy(schema.flashcards.deckId);
    for (const id of deckIds) map.set(id, 0);
    for (const row of rows) map.set(row.deckId, Number(row.n));
    return map;
  }

  async cardCountsForDecks(deckIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!deckIds.length) return map;
    const rows = await this.db
      .select({ deckId: schema.flashcards.deckId, n: count() })
      .from(schema.flashcards)
      .where(inArray(schema.flashcards.deckId, deckIds))
      .groupBy(schema.flashcards.deckId);
    for (const id of deckIds) map.set(id, 0);
    for (const row of rows) map.set(row.deckId, Number(row.n));
    return map;
  }

  async earliestDueForDecks(deckIds: string[]): Promise<Map<string, Date>> {
    const map = new Map<string, Date>();
    if (!deckIds.length) return map;
    const rows = await this.db
      .select({
        deckId: schema.flashcards.deckId,
        earliest: sql<Date>`min(${schema.flashcards.nextDueAt})`,
      })
      .from(schema.flashcards)
      .where(inArray(schema.flashcards.deckId, deckIds))
      .groupBy(schema.flashcards.deckId);
    for (const row of rows) {
      if (row.earliest) map.set(row.deckId, new Date(row.earliest));
    }
    return map;
  }

  async insertReview(row: typeof schema.flashcardReviews.$inferInsert) {
    await this.db.insert(schema.flashcardReviews).values(row);
  }

  async findCollectionByName(principal: StudentPrincipal, name: string) {
    const [row] = await this.db
      .select()
      .from(schema.knowledgeCollections)
      .where(
        and(
          eq(schema.knowledgeCollections.name, name),
          ownerWhere(principal, schema.knowledgeCollections.studentId, schema.knowledgeCollections.independentUserId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async search(principal: StudentPrincipal, q: string) {
    const pattern = `%${q}%`;
    const [items, artifacts, decks, collections, canvases] = await Promise.all([
      this.db
        .select()
        .from(schema.knowledgeItems)
        .where(
          and(
            ownerWhere(principal, schema.knowledgeItems.studentId, schema.knowledgeItems.independentUserId),
            or(ilike(schema.knowledgeItems.title, pattern), ilike(schema.knowledgeItems.kind, pattern)),
          ),
        )
        .limit(30),
      this.db
        .select()
        .from(schema.knowledgeArtifacts)
        .where(
          and(
            ownerWhere(principal, schema.knowledgeArtifacts.studentId, schema.knowledgeArtifacts.independentUserId),
            or(
              ilike(schema.knowledgeArtifacts.title, pattern),
              ilike(schema.knowledgeArtifacts.fromLabel, pattern),
              ilike(schema.knowledgeArtifacts.kind, pattern),
            ),
          ),
        )
        .limit(30),
      this.db
        .select()
        .from(schema.flashcardDecks)
        .where(
          and(
            ownerWhere(principal, schema.flashcardDecks.studentId, schema.flashcardDecks.independentUserId),
            or(ilike(schema.flashcardDecks.title, pattern), ilike(schema.flashcardDecks.fromLabel, pattern)),
          ),
        )
        .limit(30),
      this.db
        .select()
        .from(schema.knowledgeCollections)
        .where(
          and(
            ownerWhere(
              principal,
              schema.knowledgeCollections.studentId,
              schema.knowledgeCollections.independentUserId,
            ),
            ilike(schema.knowledgeCollections.name, pattern),
          ),
        )
        .limit(30),
      this.db
        .select()
        .from(schema.visualCanvases)
        .where(
          and(
            ownerWhere(principal, schema.visualCanvases.studentId, schema.visualCanvases.independentUserId),
            or(
              ilike(schema.visualCanvases.title, pattern),
              ilike(schema.visualCanvases.archetype, pattern),
            ),
          ),
        )
        .limit(30),
    ]);
    return { items, artifacts, decks, collections, canvases };
  }

  async getStorageObjects(ids: string[] | null | undefined) {
    if (!ids?.length) return [];
    const rows = await this.db.select().from(schema.storageObjects).where(inArray(schema.storageObjects.id, ids));
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => r != null);
  }

  async deleteItem(id: string) {
    await this.db.delete(schema.knowledgeItems).where(eq(schema.knowledgeItems.id, id));
  }

  async deleteStorageObjects(ids: string[]) {
    if (!ids.length) return;
    await this.db.delete(schema.storageObjects).where(inArray(schema.storageObjects.id, ids));
  }

  async getClassMaterial(id: string) {
    const [row] = await this.db
      .select()
      .from(schema.classMaterials)
      .where(eq(schema.classMaterials.id, id))
      .limit(1);
    return row ?? null;
  }
}
