import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, schema, sql, type Database } from '@edrion/database';
import type {
  NewPetrosArtifact,
  NewPetrosAttachment,
  NewPetrosConversation,
  NewPetrosMessage,
  NewPetrosPendingTurn,
  PetrosArtifact,
  PetrosAttachment,
  PetrosConversation,
  PetrosMessage,
  PetrosPendingTurn,
} from '@edrion/database';
import { DATABASE } from '../../../common/tokens';

/** Typed SQL for Petros persistence. Ownership rules live in the services. */
@Injectable()
export class PetrosRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Institution identity for the prompt's role/institution layer. */
  async institutionBasics(id: string): Promise<{ name: string; type: string } | undefined> {
    const [row] = await this.db
      .select({ name: schema.institutions.displayName, type: schema.institutions.type })
      .from(schema.institutions)
      .where(eq(schema.institutions.id, id))
      .limit(1);
    return row;
  }

  // ── Conversations ──────────────────────────────────────────────────────────

  async insertConversation(values: NewPetrosConversation): Promise<PetrosConversation> {
    const [row] = await this.db.insert(schema.petrosConversations).values(values).returning();
    return row!;
  }

  async findConversation(id: string, institutionId: string): Promise<PetrosConversation | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.petrosConversations)
      .where(and(eq(schema.petrosConversations.id, id), eq(schema.petrosConversations.institutionId, institutionId)))
      .limit(1);
    return row;
  }

  async listConversations(
    institutionId: string,
    institutionUserId: string,
    q: { page: number; pageSize: number; status: string; search?: string },
  ): Promise<{ items: PetrosConversation[]; total: number }> {
    const c = schema.petrosConversations;
    const where = and(
      eq(c.institutionId, institutionId),
      eq(c.institutionUserId, institutionUserId),
      eq(c.status, q.status),
      q.search ? ilike(c.title, `%${q.search}%`) : undefined,
    );
    const items = await this.db
      .select()
      .from(c)
      .where(where)
      .orderBy(desc(c.pinned), desc(sql`coalesce(${c.lastMessageAt}, ${c.createdAt})`))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [t] = await this.db.select({ value: sql<number>`count(*)` }).from(c).where(where);
    return { items, total: Number(t?.value ?? 0) };
  }

  async updateConversation(id: string, patch: Partial<NewPetrosConversation>): Promise<PetrosConversation | undefined> {
    const [row] = await this.db
      .update(schema.petrosConversations)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.petrosConversations.id, id))
      .returning();
    return row;
  }

  async updateConversationWithVersion(
    id: string,
    expectedVersion: number,
    patch: Partial<NewPetrosConversation>,
  ): Promise<PetrosConversation | undefined> {
    const [row] = await this.db
      .update(schema.petrosConversations)
      .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() })
      .where(and(eq(schema.petrosConversations.id, id), eq(schema.petrosConversations.version, expectedVersion)))
      .returning();
    return row;
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  async insertMessage(values: NewPetrosMessage): Promise<PetrosMessage> {
    const [row] = await this.db.insert(schema.petrosMessages).values(values).returning();
    return row!;
  }

  async updateMessage(id: string, patch: Partial<NewPetrosMessage>): Promise<PetrosMessage | undefined> {
    const [row] = await this.db
      .update(schema.petrosMessages)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.petrosMessages.id, id))
      .returning();
    return row;
  }

  async messagesForConversation(conversationId: string, limit = 200): Promise<PetrosMessage[]> {
    return this.db
      .select()
      .from(schema.petrosMessages)
      .where(eq(schema.petrosMessages.conversationId, conversationId))
      .orderBy(schema.petrosMessages.createdAt)
      .limit(limit);
  }

  // ── Artifacts / attachments ────────────────────────────────────────────────

  async insertArtifact(values: NewPetrosArtifact): Promise<PetrosArtifact> {
    const [row] = await this.db.insert(schema.petrosArtifacts).values(values).returning();
    return row!;
  }

  async findArtifact(id: string, institutionId: string): Promise<PetrosArtifact | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.petrosArtifacts)
      .where(and(eq(schema.petrosArtifacts.id, id), eq(schema.petrosArtifacts.institutionId, institutionId)))
      .limit(1);
    return row;
  }

  async insertAttachment(values: NewPetrosAttachment): Promise<PetrosAttachment> {
    const [row] = await this.db.insert(schema.petrosAttachments).values(values).returning();
    return row!;
  }

  async findAttachment(id: string, institutionId: string): Promise<PetrosAttachment | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.petrosAttachments)
      .where(and(eq(schema.petrosAttachments.id, id), eq(schema.petrosAttachments.institutionId, institutionId)))
      .limit(1);
    return row;
  }

  async updateAttachment(id: string, patch: Partial<NewPetrosAttachment>): Promise<void> {
    await this.db
      .update(schema.petrosAttachments)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.petrosAttachments.id, id));
  }

  // ── Pending turns ──────────────────────────────────────────────────────────

  async insertPendingTurn(values: NewPetrosPendingTurn): Promise<PetrosPendingTurn> {
    const [row] = await this.db.insert(schema.petrosPendingTurns).values(values).returning();
    return row!;
  }

  async findPendingTurn(id: string, institutionId: string): Promise<PetrosPendingTurn | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.petrosPendingTurns)
      .where(and(eq(schema.petrosPendingTurns.id, id), eq(schema.petrosPendingTurns.institutionId, institutionId)))
      .limit(1);
    return row;
  }

  async activePendingTurnForConversation(conversationId: string): Promise<PetrosPendingTurn | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.petrosPendingTurns)
      .where(
        and(eq(schema.petrosPendingTurns.conversationId, conversationId), eq(schema.petrosPendingTurns.status, 'pending')),
      )
      .limit(1);
    return row;
  }

  async findPendingTurnByRun(runId: string, institutionId: string): Promise<PetrosPendingTurn | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.petrosPendingTurns)
      .where(
        and(
          eq(schema.petrosPendingTurns.runId, runId),
          eq(schema.petrosPendingTurns.institutionId, institutionId),
          eq(schema.petrosPendingTurns.status, 'pending'),
        ),
      )
      .limit(1);
    return row;
  }

  async resolvePendingTurn(id: string, status: 'resolved' | 'expired' = 'resolved'): Promise<void> {
    await this.db
      .update(schema.petrosPendingTurns)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.petrosPendingTurns.id, id));
  }
}
