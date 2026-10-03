import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  HttpException,
} from '@nestjs/common';
import { and, eq, sql, schema, type Database } from '@edrion/database';
import { PETROS_PDF_EXTRACTOR_VERSION, petrosPreparationStatusSchema } from '@edrion/schemas';
import type { PortalActionContext } from '../../portal/portal-action-context';
import { DATABASE } from '../../../common/tokens';

export type Preparation = typeof schema.knowledgePreparations.$inferSelect;
const table = schema.knowledgePreparations;

/** All methods except due() require a short, explicit institution tenant transaction. */
@Injectable()
export class KnowledgePreparationRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Retain the admission lock through the enclosing publication transaction, before disk writes. */
  async admitNewPublication(ctx: PortalActionContext) {
    await this.lockInstitution(ctx.principal.institutionId);
    await this.admit(ctx.principal.institutionId, ctx.principal.institutionUserId);
  }

  async enqueue(ctx: PortalActionContext, material: typeof schema.classMaterials.$inferSelect) {
    await this.lockInstitution(material.institutionId);
    const [deleted] = await this.db
      .select()
      .from(schema.knowledgeItemTombstones)
      .where(eq(schema.knowledgeItemTombstones.materialId, material.id))
      .limit(1);
    const [revoked] = await this.db
      .select({ id: schema.knowledgeItems.id })
      .from(schema.knowledgeItems)
      .where(
        and(
          sql`${schema.knowledgeItems.origin}->>'classMaterialId' = ${material.id}`,
          sql`${schema.knowledgeItems.sourceRevokedAt} is not null`,
        ),
      )
      .limit(1);
    if (deleted || revoked)
      throw new NotFoundException({
        code: 'PETROS_SOURCE_DELETED',
        message: 'Removed knowledge sources cannot be restored by publication retries.',
      });
    const [invalidated] = await this.db
      .select({ id: schema.knowledgeItemVersions.id })
      .from(schema.knowledgeItemVersions)
      .innerJoin(
        schema.knowledgeItems,
        eq(schema.knowledgeItems.id, schema.knowledgeItemVersions.itemId),
      )
      .where(
        and(
          eq(schema.knowledgeItemVersions.objectId, material.objectId),
          sql`${schema.knowledgeItems.origin}->>'classMaterialId' = ${material.id}`,
          sql`${schema.knowledgeItemVersions.snapshot}->'origin'->>'materialVersion' = ${String(material.version)}`,
          sql`${schema.knowledgeItemVersions.invalidatedAt} is not null`,
        ),
      )
      .limit(1);
    if (invalidated)
      throw new ConflictException({
        code: 'PETROS_SOURCE_INVALIDATED',
        message: 'Publish a corrected source; an invalidated extraction cannot be replayed.',
      });
    const [existing] = await this.db
      .select()
      .from(table)
      .where(
        and(
          eq(table.materialId, material.id),
          eq(table.materialVersion, material.version),
          eq(table.objectId, material.objectId),
          eq(table.extractorVersion, PETROS_PDF_EXTRACTOR_VERSION),
        ),
      )
      .limit(1);
    if (existing) return existing;
    await this.admit(material.institutionId, ctx.principal.institutionUserId);
    const [row] = await this.db
      .insert(table)
      .values({
        institutionId: material.institutionId,
        materialId: material.id,
        materialVersion: material.version,
        objectId: material.objectId,
        requestedBy: ctx.principal.institutionUserId,
        scope: ctx.scope ?? { mode: 'institution' },
        extractorVersion: PETROS_PDF_EXTRACTOR_VERSION,
      })
      .returning();
    return row!;
  }

  private lockInstitution(id: string) {
    return this.db.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`knowledge-preparation:${id}`}, 0))`,
    );
  }

  private async admit(institutionId: string, actor: string) {
    const [counts] = await this.db
      .select({
        active: sql<number>`count(*) filter (where state in ('queued','running'))::int`,
        actor: sql<number>`count(*) filter (where state in ('queued','running') and requested_by = ${actor})::int`,
        daily: sql<number>`count(*) filter (where created_at > now() - interval '24 hours')::int`,
      })
      .from(table)
      .where(eq(table.institutionId, institutionId));
    // Safety admission, not purchased allowance; serialised even when Redis is unavailable.
    if (counts!.active >= 20 || counts!.actor >= 5 || counts!.daily >= 100) {
      throw new HttpException(
        {
          code: 'PETROS_PREPARATION_LIMIT',
          message: 'Preparation capacity reached. Existing documents remain available.',
          meta: { category: 'safety_resource_limit', retryAfterSeconds: 60 },
        },
        429,
      );
    }
  }

  async get(institutionId: string, id: string, lock = false): Promise<Preparation> {
    const query = this.db
      .select()
      .from(table)
      .where(and(eq(table.id, id), eq(table.institutionId, institutionId)))
      .limit(1);
    const [row] = await (lock ? query.for('update') : query);
    if (!row) throw new NotFoundException('Preparation unavailable');
    return row;
  }

  async latest(materialId: string) {
    const [row] = await this.db
      .select()
      .from(table)
      .where(eq(table.materialId, materialId))
      .orderBy(sql`${table.materialVersion} desc`, sql`${table.createdAt} desc`)
      .limit(1);
    return row ?? null;
  }

  status(row: Preparation, workerEnabled: boolean) {
    return petrosPreparationStatusSchema.parse({
      id: row.id,
      materialId: row.materialId,
      materialVersion: row.materialVersion,
      state: row.state,
      version: row.version,
      attempts: row.totalAttempts,
      pagesDone: row.pagesDone,
      errorCode: row.errorCode,
      retryable: row.retryable && row.totalAttempts < 6,
      workerEnabled,
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  async command(institutionId: string, id: string, version: number, action: 'cancel' | 'retry') {
    await this.lockInstitution(institutionId);
    const row = await this.get(institutionId, id, true);
    // Lost-response replay of the same transition is safe. A later transition must not be overwritten.
    if (
      row.version === version + 1 &&
      ((action === 'cancel' && row.state === 'cancelled') ||
        (action === 'retry' && row.state === 'queued'))
    )
      return row;
    if (row.version !== version)
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'Preparation changed. Refresh its status.',
      });
    if (action === 'cancel') {
      if (!['queued', 'running'].includes(row.state)) return row; // already committed result wins
      return this.update(row, {
        state: 'cancelled',
        leaseUntil: null,
        fence: row.fence + 1,
        retryable: true,
        errorCode: 'PETROS_PREPARATION_CANCELLED',
      });
    }
    if (!['failed', 'cancelled'].includes(row.state) || !row.retryable || row.totalAttempts >= 6) {
      throw new ConflictException({
        code: 'PETROS_PREPARATION_NOT_RETRYABLE',
        message: 'Upload a corrected document or request preparation support.',
      });
    }
    await this.admit(institutionId, row.requestedBy);
    return this.update(row, {
      state: 'queued',
      attempts: 0,
      leaseUntil: null,
      pagesDone: 0,
      errorCode: null,
      retryable: false,
      nextAttemptAt: new Date(),
      nextDispatchAt: new Date(),
    });
  }

  async claim(institutionId: string, id: string) {
    await this.lockInstitution(institutionId);
    const row = await this.get(institutionId, id, true);
    const now = new Date();
    if (
      !['queued', 'running'].includes(row.state) ||
      row.nextAttemptAt > now ||
      (row.leaseUntil && row.leaseUntil > now)
    )
      return null;
    if (row.attempts >= 3 || row.totalAttempts >= 6) {
      await this.update(row, {
        state: 'failed',
        leaseUntil: null,
        errorCode: 'PETROS_PREPARATION_RETRIES_EXHAUSTED',
        retryable: row.totalAttempts < 6,
      });
      return null;
    }
    const [count] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(table)
      .where(
        and(
          eq(table.institutionId, institutionId),
          eq(table.state, 'running'),
          sql`${table.leaseUntil} > now()`,
        ),
      );
    if (count!.n >= 2) return null;
    return this.update(row, {
      state: 'running',
      fence: row.fence + 1,
      attempts: row.attempts + 1,
      totalAttempts: row.totalAttempts + 1,
      leaseUntil: new Date(now.getTime() + 30_000),
      pagesDone: 0,
      errorCode: null,
      retryable: false,
    });
  }

  async assertLease(claim: Preparation) {
    const row = await this.get(claim.institutionId, claim.id, true);
    if (
      row.state !== 'running' ||
      row.fence !== claim.fence ||
      !row.leaseUntil ||
      row.leaseUntil <= new Date()
    ) {
      throw new ConflictException({
        code: 'PETROS_PREPARATION_FENCED',
        message: 'Preparation ownership changed.',
      });
    }
    return row;
  }

  async heartbeat(claim: Preparation, pagesDone: number) {
    const row = await this.assertLease(claim);
    // Wall deadline is shorter than this lease; heartbeat is progress/cancellation observation,
    // never a way for a stuck parser to extend its deadline indefinitely.
    await this.db
      .update(table)
      .set({ pagesDone, updatedAt: new Date() })
      .where(eq(table.id, row.id));
  }

  async complete(claim: Preparation) {
    const row = await this.assertLease(claim);
    return this.update(row, {
      state: 'succeeded',
      leaseUntil: null,
      retryable: false,
      errorCode: null,
    });
  }

  async fail(claim: Preparation, code: string, retryable: boolean) {
    const row = await this.get(claim.institutionId, claim.id, true);
    if (row.state !== 'running' || row.fence !== claim.fence) return row;
    const retry = retryable && row.attempts < 3 && row.totalAttempts < 6;
    return this.update(row, {
      state: retry ? 'queued' : 'failed',
      leaseUntil: null,
      errorCode: code,
      retryable,
      nextAttemptAt: new Date(Date.now() + row.attempts * 5000),
      nextDispatchAt: new Date(),
    });
  }

  /** Dispatch and redelivery are derived from durable rows, never an in-memory after-commit hook. */
  async due() {
    return this.db.execute<{ id: string; institution_id: string; dispatch_sequence: number }>(
      sql`select * from edrion_due_knowledge_preparations()`,
    );
  }

  private async update(row: Preparation, patch: Partial<typeof table.$inferInsert>) {
    const [updated] = await this.db
      .update(table)
      .set({ ...patch, version: row.version + 1, updatedAt: new Date() })
      .where(and(eq(table.id, row.id), eq(table.version, row.version)))
      .returning();
    if (!updated) throw new ConflictException('Preparation changed');
    return updated;
  }
}
