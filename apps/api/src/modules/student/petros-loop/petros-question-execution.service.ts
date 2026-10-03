import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { runInStudentTenant, sql, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import {
  PETROS_QUESTION_EXECUTION_VERSION,
  petrosComposerQuestionSchema,
  petrosQuestionExecutionSchema,
  petrosQuestionJobSchema,
  type PetrosComposerQuestionInput,
} from '@edrion/schemas';
import { API_ENV, DATABASE } from '../../../common/tokens';
import { JobsService } from '../../../common/queue/jobs.service';
import { QueueWorkers } from '../../../common/queue/queue.worker';
import { StudentAuthService } from '../auth/student-auth.service';
import { PetrosAiRoutingRepository } from '../../petros-ai-routing/petros-ai-routing.repository';
import { SurfacesService } from '../surfaces/surfaces.service';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { PetrosLoopRepository, type PetrosOwnerScope } from './petros-loop.repository';
import { PetrosLoopService } from './petros-loop.service';
import { knowledgeDenied, questionDenial } from '../../petros-institutional/petros-admission';
import {
  PetrosQuestionExecutionRepository,
  executionConflict,
  type QuestionExecution,
} from './petros-question-execution.repository';

export const PETROS_QUESTION_JOB = 'petros.document.question';

@Injectable()
export class PetrosQuestionExecutionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PetrosQuestionExecutionService.name);
  private timer?: NodeJS.Timeout;
  private dispatching = false;
  private readonly active = new Set<AbortController>();
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly repository: PetrosQuestionExecutionRepository,
    private readonly loopRepo: PetrosLoopRepository,
    private readonly loop: PetrosLoopService,
    private readonly auth: StudentAuthService,
    private readonly surfaces: SurfacesService,
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    private readonly aiUsage: PetrosAiRoutingRepository,
  ) {}

  get enabled() {
    return Boolean(
      this.env.PETROS_DOCUMENT_QUESTION_EXECUTION_ENABLED &&
      this.env.PETROS_DOCUMENT_RETRIEVAL_ENABLED &&
      this.env.REDIS_ENABLED &&
      this.env.QUEUE_WORKERS_ENABLED,
    );
  }
  onModuleInit() {
    this.workers.register(PETROS_QUESTION_JOB, (job) => {
      const data = petrosQuestionJobSchema.parse(job.data);
      return this.execute(data, data.id);
    });
    if (this.enabled) {
      this.timer = setInterval(
        () =>
          void this.dispatch().catch(() =>
            this.logger.warn('Question dispatch unavailable; durable commands remain queued.'),
          ),
        5000,
      );
      this.timer.unref();
      void this.dispatch().catch(() =>
        this.logger.warn('Question dispatch unavailable; durable commands remain queued.'),
      );
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    for (const abort of this.active) abort.abort('PETROS_QUESTION_SHUTDOWN');
  }

  async dispatch() {
    if (!this.enabled || !this.jobs.enabled || this.dispatching) return;
    this.dispatching = true;
    try {
      for (const row of await this.repository.due())
        await this.jobs.enqueue(
          'ai',
          PETROS_QUESTION_JOB,
          { id: row.id, institutionId: row.institution_id, studentId: row.student_id },
          {
            jobId: `petros-question-${row.id}-${row.dispatch_sequence}`,
            attempts: 1,
            removeOnComplete: true,
          },
        );
    } finally {
      this.dispatching = false;
    }
  }

  /** Called under the ordinary authenticated, short request transaction; never calls a model. */
  async admit(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    raw: PetrosComposerQuestionInput,
  ) {
    const input = petrosComposerQuestionSchema.parse(raw);
    const session = await this.authorizedSession(principal, sessionId);
    const existing = await this.repository.byKey(principal, sessionId, input.idempotencyKey);
    if (!existing) {
      if (!this.env.PETROS_DOCUMENT_QUESTION_EXECUTION_ENABLED)
        throw executionConflict('PETROS_QUESTION_EXECUTION_DISABLED');
      if (
        session.status !== 'active' ||
        session.version !== input.expectedSessionVersion ||
        session.planningStartedAt
      )
        throw executionConflict('PETROS_SESSION_STALE');
    }
    const pin = session.sourceContext?.sourceFingerprint;
    if (typeof pin !== 'string') throw executionConflict('PETROS_SOURCE_STALE');
    if (!existing && input.knowledgeMode && !this.env.PETROS_DOCUMENT_KNOWLEDGE_POLICY_ENABLED)
      throw knowledgeDenied('PETROS_KNOWLEDGE_MODE_UNSUPPORTED');
    if (existing) await this.checkPolicy(existing);
    const policy = !existing && this.env.PETROS_DOCUMENT_KNOWLEDGE_POLICY_ENABLED
      ? await this.loop.resolveQuestionPolicy(principal, sessionId, input.knowledgeMode) : null;
    const row = await this.repository.admit(principal, sessionId, input, pin, policy);
    return this.status(row);
  }

  async read(principal: InstitutionalStudentPrincipal, sessionId: string, key?: string) {
    await this.authorizedSession(principal, sessionId);
    const row = key
      ? await this.repository.byKey(principal, sessionId, key)
      : await this.repository.latest(principal, sessionId);
    if (!row || row.executionVersion !== PETROS_QUESTION_EXECUTION_VERSION) {
      if (!key) return null;
      throw new NotFoundException({
        code: 'PETROS_QUESTION_UNAVAILABLE',
        message: 'Document question unavailable.',
      });
    }
    return this.status(row);
  }

  async command(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    key: string,
    version: number,
    action: 'cancel' | 'retry',
  ) {
    const session = await this.authorizedSession(principal, sessionId);
    const row = await this.repository.byKey(principal, sessionId, key);
    if (!row || row.executionVersion !== PETROS_QUESTION_EXECUTION_VERSION)
      throw new NotFoundException();
    if (action === 'retry') {
      await this.checkPolicy(row);
      if (!this.enabled) throw executionConflict('PETROS_QUESTION_EXECUTION_DISABLED');
      const input = petrosComposerQuestionSchema.parse(row.executionInput);
      if (session.status !== 'active' || session.version !== input.expectedSessionVersion)
        throw executionConflict('PETROS_SESSION_STALE');
    }
    const updated = await this.repository.command(principal, row.id, version, action);
    if (updated.executionState === 'cancelled') await this.aiUsage.reconcileDocumentCommand(row.id);
    return this.status(updated);
  }

  async assertLegacyAllowed(principal: InstitutionalStudentPrincipal, sessionId: string) {
    const pending = await this.repository.latest(principal, sessionId);
    if (pending && ['queued', 'running'].includes(pending.executionState!))
      throw executionConflict('PETROS_QUESTION_EXECUTION_REQUIRED');
    if (!this.env.PETROS_DOCUMENT_QUESTION_EXECUTION_ENABLED && !this.env.PETROS_DOCUMENT_KNOWLEDGE_POLICY_ENABLED) return;
    const session = await this.loopRepo.findSession(principal, sessionId);
    if (session?.sourceContext?.door === 'uploaded_document')
      throw executionConflict('PETROS_QUESTION_EXECUTION_REQUIRED');
  }

  async execute(scope: PetrosOwnerScope, id: string) {
    if (!this.enabled) throw executionConflict('PETROS_QUESTION_EXECUTION_DISABLED');
    if (this.active.size >= 2) return; // Unclaimed rows remain in the dispatch outbox.
    const abort = new AbortController();
    this.active.add(abort);
    let claim: QuestionExecution | null = null;
    let timer: NodeJS.Timeout | undefined;
    let pulse: Promise<void> | undefined;
    let timedOut = false;
    const deadline = setTimeout(
      () => {
        timedOut = true;
        abort.abort();
      },
      Math.min(45_000, Math.max(1000, this.env.PETROS_DOCUMENT_QUESTION_TIMEOUT_MS ?? 45_000)),
    );
    try {
      claim = await this.scoped(scope, () => this.repository.claim(scope, id));
      if (!claim) {
        await this.scoped(scope, async () => {
          const row = await this.repository.get(scope, id);
          if (['failed', 'cancelled'].includes(row.executionState!))
            await this.aiUsage.reconcileDocumentCommand(id);
        });
        return;
      }
      const claimed = claim;
      // Recovery must settle abandoned attempts even when this claim never calls a provider.
      await this.scoped(scope, () =>
        this.aiUsage.reconcileDocumentCommand(claimed.id, claimed.executionFence),
      );
      const input = petrosComposerQuestionSchema.parse(claimed.executionInput);
      const prepared = await this.scoped(scope, async () => {
        const principal = await this.authorize(claimed);
        await this.repository.assertLease(claimed);
        return this.loop.prepareDocumentQuestion(principal, claimed.sessionId, input);
      });
      timer = setInterval(() => {
        if (pulse) return;
        pulse = this.scoped(scope, async () => {
          await this.repository.assertLease(claimed);
          await this.authorize(claimed);
        })
          .catch((error) => abort.abort(error))
          .finally(() => {
            pulse = undefined;
          });
      }, 1000);
      // No request/tenant transaction is alive here. Gateway scopes its own DB operations.
      const answer = await abortable(abort.signal, () =>
        this.loop.generateDocumentComposerAnswer(
          prepared.session,
          input.question,
          prepared.retrieval,
          claimed.id,
          abort.signal,
          (work) => this.scoped(scope, work),
          claimed.executionFence,
          claimed.knowledgePolicy ?? undefined,
          () => this.scoped(scope, async () => { await this.repository.assertLease(claimed); await this.authorize(claimed); }),
        ),
      );
      clearInterval(timer);
      timer = undefined;
      await pulse;
      abort.signal.throwIfAborted();
      await this.scoped(scope, async () => {
        // Fence lock serializes cancellation and all commits; failure rolls back detour + trace + receipt.
        await this.repository.assertLease(claimed, true);
        const principal = await this.authorize(claimed);
        const result = await this.loop.commitComposerAnswer(
          principal,
          prepared.session,
          input,
          prepared.currentTitle,
          prepared.pausePoint,
          answer,
          claimed.id,
        );
        abort.signal.throwIfAborted();
        await this.repository.complete(claimed, result as unknown as Record<string, unknown>);
      });
    } catch (error) {
      if (!claim) throw error;
      if (abort.signal.reason === 'PETROS_QUESTION_SHUTDOWN') return; // The lease expires into durable redispatch.
      const status =
        typeof error === 'object' && error && 'getStatus' in error
          ? (error as { getStatus(): number }).getStatus()
          : null;
      const reason = error && typeof error === 'object' && 'getResponse' in error
        ? (error as { getResponse(): { code?: string } }).getResponse().code : undefined;
      const code = /KNOWLEDGE|ASSIGNMENT/.test(reason ?? '') ? reason!
        : timedOut
        ? 'PETROS_QUESTION_TIMEOUT'
        : isBudgetFailure(error)
          ? 'PETROS_QUESTION_BUDGET_LIMIT'
        : status && status >= 400 && status < 500
          ? 'PETROS_QUESTION_ACCESS_OR_STATE_CHANGED'
          : abort.signal.aborted
            ? 'PETROS_QUESTION_INTERRUPTED'
            : 'PETROS_QUESTION_INFRASTRUCTURE';
      await this.scoped(scope, async () => {
        const failed = await this.repository.fail(claim!, code, questionDenial(reason ?? code, claim!.id));
        if (failed) await this.aiUsage.reconcileDocumentCommand(claim!.id);
      }).catch((failure) => {
        if (!(failure instanceof NotFoundException)) throw failure;
      });
    } finally {
      clearTimeout(deadline);
      if (timer) clearInterval(timer);
      await pulse;
      this.active.delete(abort);
    }
  }

  private scoped<T>(scope: PetrosOwnerScope, work: () => Promise<T>) {
    return runInStudentTenant(this.db, scope, async () => {
      await this.db.execute(sql`set local statement_timeout = '10s'`);
      await this.db.execute(sql`set local lock_timeout = '2s'`);
      return work();
    });
  }
  private async authorizedSession(principal: InstitutionalStudentPrincipal, sessionId: string) {
    await this.loop.assertAdaptiveComposerAllowed(principal,sessionId);
    const current = await this.auth.resolveInstitutionalWorker(principal.institutionUserId);
    if (
      current.institutionId !== principal.institutionId ||
      current.studentId !== principal.studentId ||
      !current.permissions.includes('student.learn.use') ||
      !(await this.surfaces.isPortalEnabled(current))
    )
      throw new ForbiddenException();
    const session = await this.loopRepo.findSession(principal, sessionId);
    if (!session || session.sourceContext?.door !== 'uploaded_document')
      throw new NotFoundException();
    return session;
  }
  private async authorize(row: QuestionExecution) {
    const principal = await this.auth.resolveInstitutionalWorker(row.requestedBy!);
    if (
      principal.institutionId !== row.institutionId ||
      principal.studentId !== row.studentId ||
      !principal.permissions.includes('student.learn.use') ||
      !(await this.surfaces.isPortalEnabled(principal))
    )
      throw new ForbiddenException();
    const session = await this.authorizedSession(principal, row.sessionId);
    await this.checkPolicy(row);
    const input = petrosComposerQuestionSchema.parse(row.executionInput);
    if (
      session.status !== 'active' ||
      session.version !== input.expectedSessionVersion ||
      session.planningStartedAt ||
      session.sourceContext?.sourceFingerprint !== row.sourceFingerprint
    )
      throw executionConflict('PETROS_SESSION_STALE');
    return principal;
  }
  private async checkPolicy(row: QuestionExecution) {
    if (row.knowledgePolicy) await this.loop.assertQuestionPolicy(row, row.sessionId, row.knowledgePolicy);
    else if (this.env.PETROS_DOCUMENT_KNOWLEDGE_POLICY_ENABLED) throw knowledgeDenied('PETROS_KNOWLEDGE_LEGACY_COMMAND');
  }
  private async status(row: QuestionExecution) {
    let denied = row.admissionDenial;
    let result = null;
    if (row.executionState === 'succeeded') {
      try {
        await this.checkPolicy(row);
        result = await this.loop.projectQuestionDocument(row, row.response);
      } catch (error) {
        const code = error && typeof error === 'object' && 'getResponse' in error
          ? (error as { getResponse(): { code?: string } }).getResponse().code : undefined;
        if (!/KNOWLEDGE|ASSIGNMENT/.test(code ?? '')) throw error;
        denied = questionDenial('PETROS_KNOWLEDGE_POLICY_CHANGED', row.id);
      }
    }
    return petrosQuestionExecutionSchema.parse({
      schemaVersion: PETROS_QUESTION_EXECUTION_VERSION,
      id: row.id,
      sessionId: row.sessionId,
      idempotencyKey: row.idempotencyKey,
      state: row.executionState === 'succeeded' && !result ? 'failed' : row.executionState,
      version: row.executionRevision,
      attempts: row.executionAttempts,
      errorCode: denied && row.executionState === 'succeeded' ? denied.code : row.errorCode,
      retryable: this.repository.retryable(row),
      processingEnabled: this.enabled,
      result,
      knowledgePolicy: row.knowledgePolicy,
      admission: denied,
    });
  }
}

function isBudgetFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('getResponse' in error)) return false;
  const response = (error as { getResponse(): unknown }).getResponse();
  return typeof response === 'object' && response !== null && 'code' in response &&
    typeof response.code === 'string' &&
    response.code !== 'PETROS_BUDGET_ACCOUNTING_UNAVAILABLE' &&
    (response.code.includes('BUDGET') || response.code.includes('QUOTA'));
}

/** A non-cooperating adapter cannot occupy the worker forever or bypass its commit fence. */
async function abortable<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  let cancel!: () => void;
  const stopped = new Promise<never>((_resolve, reject) => {
    cancel = () => reject(signal.reason ?? new Error('Question cancelled'));
    signal.addEventListener('abort', cancel, { once: true });
  });
  try {
    return await Promise.race([work(), stopped]);
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}
