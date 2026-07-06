import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, inArray, lte, type SQL } from 'drizzle-orm';
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

  async dueCount(deckId: string) {
    const now = new Date();
    const [row] = await this.db
      .select({ n: count() })
      .from(schema.flashcards)
      .where(and(eq(schema.flashcards.deckId, deckId), lte(schema.flashcards.nextDueAt, now)));
    return Number(row?.n ?? 0);
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
    const owner: SQL = ownerWhere(principal, schema.knowledgeItems.studentId, schema.knowledgeItems.independentUserId);
    const items = await this.db
      .select({ id: schema.knowledgeItems.id, title: schema.knowledgeItems.title, kind: schema.knowledgeItems.kind })
      .from(schema.knowledgeItems)
      .where(and(owner, ilike(schema.knowledgeItems.title, pattern)))
      .limit(30);
    const artifacts = await this.db
      .select({
        id: schema.knowledgeArtifacts.id,
        title: schema.knowledgeArtifacts.title,
        kind: schema.knowledgeArtifacts.kind,
      })
      .from(schema.knowledgeArtifacts)
      .where(
        and(
          ownerWhere(principal, schema.knowledgeArtifacts.studentId, schema.knowledgeArtifacts.independentUserId),
          ilike(schema.knowledgeArtifacts.title, pattern),
        ),
      )
      .limit(30);
    return { items, artifacts };
  }

  async getStorageObjects(ids: string[]) {
    if (!ids.length) return [];
    return this.db.select().from(schema.storageObjects).where(inArray(schema.storageObjects.id, ids));
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
