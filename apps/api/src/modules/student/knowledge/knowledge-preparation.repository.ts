import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  HttpException,
} from '@nestjs/common';
import { and, eq, sql, schema, runInStudentTenant, type Database } from '@edrion/database';
import { PETROS_PDF_EXTRACTOR_VERSION, petrosPreparationStatusSchema, sourceBindingSchema } from '@edrion/schemas';
import type { PortalActionContext } from '../../portal/portal-action-context';
import { DATABASE } from '../../../common/tokens';

export type Preparation = typeof schema.knowledgePreparations.$inferSelect;
const table = schema.knowledgePreparations;

/** All methods except due() require a short, explicit institution tenant transaction. */
@Injectable()
export class KnowledgePreparationRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Caller has resolved M1 write authority; scope/identity are still checked here. */
  async enqueueV2(institutionId: string, actor: string, input: unknown, extractorVersion: string) {
    const b = sourceBindingSchema.parse(input);
    const [scope] = await this.db.execute<{ ok: boolean }>(sql`SELECT current_user='edrion_app'
      AND current_setting('app.institution_id',true)=${institutionId}
      AND current_setting('app.institution_user_id',true)=${actor}
      AND nullif(current_setting('app.student_id',true),'') IS NULL AS ok`);
    if (!scope?.ok) throw new NotFoundException('M2_AUTHENTICATED_SCOPE_REQUIRED');
    await this.lockInstitution(institutionId);
    const [prior] = await this.db.select().from(table).where(and(eq(table.institutionId,institutionId),eq(table.operationVersion,'v2'),
      eq(table.extractorVersion,extractorVersion),sql`${table.sourceBinding}=${JSON.stringify(b)}::jsonb`)).limit(1);
    if (prior) return prior;
    await this.admit(institutionId,actor);
    const [row] = await this.db.insert(table).values({institutionId,requestedBy:actor,operationVersion:'v2',sourceKind:b.kind,
      sourceBinding:b,materialId:b.kind==='material'?b.materialId:null,materialVersion:b.kind==='material'?b.materialVersion:null,
      guidanceAssignmentId:b.kind==='guidance_attachment'?b.assignmentId:null,
      guidancePublicationVersion:b.kind==='guidance_attachment'?b.publicationVersion:null,objectId:b.objectId,
      scope:{mode:'institution'},extractorVersion}).returning();
    return row!;
  }

  /** Scoped recovery polling uses the same outbox fields and never enumerates another tenant. */
  async dueV2() {
    const rows = await this.db.select().from(table).where(and(eq(table.operationVersion,'v2'),
      sql`${table.state} IN ('queued','running')`,sql`${table.nextDispatchAt}<=now()`,sql`${table.nextAttemptAt}<=now()`,
      sql`(${table.leaseUntil} IS NULL OR ${table.leaseUntil}<=now())`)).limit(20);
    const due: Preparation[] = [];
    for (const row of rows) {
      const [claimed] = await this.db.update(table).set({dispatchSequence:row.dispatchSequence+1,nextDispatchAt:new Date(Date.now()+10_000)})
        .where(and(eq(table.id,row.id),eq(table.dispatchSequence,row.dispatchSequence))).returning();
      if(claimed)due.push(claimed);
    }
    return due;
  }

  /** Retain the admission lock through the enclosing publication transaction, before disk writes. */
  async admitNewPublication(ctx: PortalActionContext) {
    await this.lockInstitution(ctx.principal.institutionId);
    await this.admit(ctx.principal.institutionId, ctx.principal.institutionUserId);
  }

  async enqueue(ctx: PortalActionContext, material: typeof schema.classMaterials.$inferSelect) {
    await this.lockInstitution(material.institutionId);
    // The caller has resolved current material publication authority. Inspect only
    // those actual recipients through their existing owner transactions; institution
    // scope alone cannot see a student's invalidation or deletion receipt under M0-R.
    const recipients = material.contextType === 'course'
      ? await this.db.select({ id: schema.courseEnrollments.studentId }).from(schema.courseEnrollments)
          .where(and(eq(schema.courseEnrollments.institutionId, material.institutionId), eq(schema.courseEnrollments.courseId, material.contextId))).limit(101)
      : await this.db.select({ id: schema.students.id }).from(schema.students)
          .where(and(eq(schema.students.institutionId, material.institutionId), eq(schema.students.classId, material.contextId), eq(schema.students.status, 'enrolled'))).limit(101);
    if (recipients.length > 100) throw new ConflictException('PETROS_PREPARATION_FANOUT_LIMIT');
    for (const recipient of recipients) await runInStudentTenant(this.db, { institutionId: material.institutionId, studentId: recipient.id }, async () => {
      const [removed] = await this.db.select({ id: schema.knowledgeItemTombstones.itemId }).from(schema.knowledgeItemTombstones)
        .where(and(eq(schema.knowledgeItemTombstones.materialId, material.id), eq(schema.knowledgeItemTombstones.studentId, recipient.id))).limit(1);
      const [invalid] = await this.db.select({ id: schema.knowledgeItemVersions.id }).from(schema.knowledgeItemVersions)
        .innerJoin(schema.knowledgeItems, eq(schema.knowledgeItems.id, schema.knowledgeItemVersions.itemId)).where(and(
          eq(schema.knowledgeItems.studentId, recipient.id), eq(schema.knowledgeItemVersions.objectId, material.objectId),
          sql`${schema.knowledgeItems.origin}->>'classMaterialId'=${material.id}`,
          sql`${schema.knowledgeItemVersions.invalidatedAt} IS NOT NULL`,
          sql`${schema.knowledgeItemVersions.snapshot}->'origin'->'petrosExtraction'->>'extractorVersion'=${PETROS_PDF_EXTRACTOR_VERSION}`,
        )).limit(1);
      if (removed) throw new NotFoundException('PETROS_SOURCE_DELETED');
      if (invalid) throw new ConflictException('PETROS_SOURCE_INVALIDATED');
    });
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

  async get(institutionId: string, id: string, lock = false, operationVersion = 'v1'): Promise<Preparation> {
    const query = this.db
      .select()
      .from(table)
      .where(and(eq(table.id, id), eq(table.institutionId, institutionId), eq(table.operationVersion, operationVersion)))
      .limit(1);
    const [row] = await (lock ? query.for('update') : query);
    if (!row) throw new NotFoundException('Preparation unavailable');
    return row;
  }

  async latest(materialId: string) {
    const [row] = await this.db
      .select()
      .from(table)
      .where(and(eq(table.materialId, materialId), eq(table.operationVersion, 'v1')))
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

  async command(institutionId: string, id: string, version: number, action: 'cancel' | 'retry', operationVersion = 'v1') {
    await this.lockInstitution(institutionId);
    const row = await this.get(institutionId, id, true, operationVersion);
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
        ...(row.operationVersion==='v2'?{m2Progress:{stage:'cancelled',updatedAt:new Date().toISOString()}}:{}),
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
      ...(row.operationVersion==='v2'?{m2Progress:null}:{}),
    });
  }

  async claim(institutionId: string, id: string, operationVersion = 'v1') {
    await this.lockInstitution(institutionId);
    const row = await this.get(institutionId, id, true, operationVersion);
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
    const row = await this.get(claim.institutionId, claim.id, true, claim.operationVersion);
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
      .set({ pagesDone, updatedAt: new Date(),...(claim.operationVersion==='v2'?{leaseUntil:new Date(Date.now()+15_000)}:{}) })
      .where(eq(table.id, row.id));
  }

  async markM2Stage(claim:Preparation,stage:string) {
    if(claim.operationVersion!=='v2')throw new Error('M2_PROGRESS_OPERATION');
    const row=await this.assertLease(claim);
    await this.db.update(table).set({m2Progress:{stage,updatedAt:new Date().toISOString()}}).where(eq(table.id,row.id));
  }

  async complete(claim: Preparation, m2Result?:{stage:'completed'|'partially_supported';revisionId:string}) {
    const row = await this.assertLease(claim);
    return this.update(row, {
      state: 'succeeded',
      leaseUntil: null,
      retryable: false,
      errorCode: null,
      ...(claim.operationVersion==='v2'&&m2Result?{m2Progress:{...m2Result,updatedAt:new Date().toISOString()}}:{}),
    });
  }

  async fail(claim: Preparation, code: string, retryable: boolean) {
    const row = await this.get(claim.institutionId, claim.id, true, claim.operationVersion);
    if (row.state !== 'running' || row.fence !== claim.fence) return row;
    const retry = retryable && row.attempts < 3 && row.totalAttempts < 6;
    return this.update(row, {
      state: retry ? 'queued' : 'failed',
      leaseUntil: null,
      errorCode: code,
      retryable,
      ...(claim.operationVersion==='v2'?{m2Progress:{stage:code==='PETROS_PREPARATION_CANCELLED'?'cancelled':'blocked',updatedAt:new Date().toISOString()}}:{}),
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
