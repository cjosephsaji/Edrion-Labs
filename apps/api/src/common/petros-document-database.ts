import { Inject, Injectable, ServiceUnavailableException, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import type { ApiEnv } from '@edrion/config';
import { and, eq, schema, sql, assertRestrictedDatabaseRole, runInReadinessScope, type Database, type ReadinessScope } from '@edrion/database';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { documentTeachingGenerationSchema } from '../modules/student/petros-session-intent/petros-document-teaching';
import { API_ENV } from './tokens';

/** These pools never use the ordinary tenant proxy, an owner credential or URL fallback. */
@Injectable()
export class PetrosDocumentDatabase implements OnModuleInit, OnModuleDestroy {
  private workerDb?: Database;
  private evaluatorDb?: Database;
  private readonly clients: ReturnType<typeof postgres>[] = [];

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  async onModuleInit() {
    if (this.env.PETROS_DOCUMENT_TEACHING_ENABLED === false) return;
    if (!this.env.PETROS_DOCUMENT_WORKER_DATABASE_URL || !this.env.PETROS_DOCUMENT_EVALUATOR_DATABASE_URL)
      throw new Error('PETROS_DOCUMENT_RESTRICTED_DATABASE_REQUIRED');
    for (const [url, role, destination] of [
      [this.env.PETROS_DOCUMENT_WORKER_DATABASE_URL, 'edrion_petros_document_worker', 'workerDb'],
      [this.env.PETROS_DOCUMENT_EVALUATOR_DATABASE_URL, 'edrion_petros_document_evaluator', 'evaluatorDb'],
    ] as const) {
      if (!url) throw new Error('PETROS_DOCUMENT_RESTRICTED_DATABASE_REQUIRED');
      const client = postgres(url, { max: 3, prepare: false, connect_timeout: 5 });
      this.clients.push(client);
      const db = drizzle(client, { schema, casing: 'snake_case' });
      try { await assertRestrictedDatabaseRole(db, role); }
      catch (error) { await this.onModuleDestroy(); throw error; }
      this[destination] = db;
    }
  }

  async onModuleDestroy() {
    await Promise.all(this.clients.splice(0).map(client => client.end({ timeout: 5 })));
    this.workerDb = this.evaluatorDb = undefined;
  }

  worker<T>(scope: ReadinessScope, fn: (tx: Database) => Promise<T>): Promise<T> {
    if (!this.workerDb) throw new ServiceUnavailableException('PETROS_DOCUMENT_WORKER_UNAVAILABLE');
    return runInReadinessScope(this.workerDb, scope, fn);
  }

  /** Return only the selected instrument, never the lesson's other keys or teaching context. */
  async assessment(scope: { institutionId: string; studentId: string }, sessionId: string,
    expectedVersion: number, questionId: string) {
    if (!this.evaluatorDb) throw new ServiceUnavailableException('PETROS_DOCUMENT_EVALUATOR_UNAVAILABLE');
    return runInReadinessScope(this.evaluatorDb, { ...scope, sessionId }, async tx => {
      const t = schema.petrosLearningSessions;
      const [session] = await tx.select({ context: t.learnerContext, source: t.sourceContext }).from(t).where(and(
        eq(t.id, sessionId), eq(t.institutionId, scope.institutionId), eq(t.studentId, scope.studentId),
        eq(t.version, expectedVersion), eq(t.status, 'active'),
      )).limit(1);
      if (!session) throw new ServiceUnavailableException('PETROS_DOCUMENT_ASSESSMENT_AUTHORITY_LOST');
      let plan: unknown;
      const lessonId = session.context.documentLessonId;
      if (typeof lessonId === 'string') {
        await tx.execute(sql`SELECT set_config('app.lesson_id',${lessonId},true)`);
        const a = schema.petrosDocumentLessonArtifacts;
        const [artifact] = await tx.select({ privatePlan: a.privatePlan }).from(a).where(and(
          eq(a.id, lessonId), eq(a.institutionId, scope.institutionId), eq(a.status, 'published'),
        )).limit(1);
        plan = artifact?.privatePlan;
      } else {
        // Existing V1 sessions retain their historical storage shape. Their current
        // source entitlement is required by the evaluator RLS policy on the session.
        plan = session.context.documentTeachingInternalPlan;
      }
      const parsed = documentTeachingGenerationSchema.safeParse(plan);
      if (!parsed.success) throw new ServiceUnavailableException('PETROS_DOCUMENT_ASSESSMENT_UNAVAILABLE');
      if (typeof lessonId !== 'string' && parsed.data.documentId !== session.source?.referenceId)
        throw new ServiceUnavailableException('PETROS_DOCUMENT_ASSESSMENT_AUTHORITY_LOST');
      if (questionId === 'diagnostic') return { diagnostic: parsed.data.diagnostic, scene: undefined };
      const scene = parsed.data.scenes.find(value => value.id === questionId);
      if (!scene) throw new ServiceUnavailableException('PETROS_DOCUMENT_ASSESSMENT_UNAVAILABLE');
      return { diagnostic: undefined, scene };
    });
  }
}
