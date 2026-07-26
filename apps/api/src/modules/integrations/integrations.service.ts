import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { Job } from 'bullmq';
import { DeliveryStatus } from '@edrion/shared-types';
import type {
  CreateEndpointInput,
  ListEndpointsQuery,
  RotateSecretInput,
  TestDeliveryInput,
  UpdateEndpointInput,
} from '@edrion/schemas';
import type { ApiEnv } from '@edrion/config';
import type { AuditWriter } from '@edrion/audit';
import type { Logger } from '@edrion/observability';
import type { WebhookDelivery, WebhookEndpoint } from '@edrion/database';
import { API_ENV, AUDIT_WRITER, LOGGER } from '../../common/tokens';
import { baseAudit, type ActionContext } from '../../common/action-context';
import { JobsService } from '../../common/queue/jobs.service';
import { QueueWorkers } from '../../common/queue/queue.worker';
import { JobTracker } from '../../common/queue/job-tracker.service';
import { IntegrationsRepository } from './integrations.repository';

const MODULE = 'integrations';
const ENTITY = 'webhook_endpoint';
const QUEUE = 'notifications';
const DELIVER_JOB = 'webhook.deliver';
const DELIVERY_TIMEOUT_MS = 10_000;

interface DeliverJobData {
  endpointId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class IntegrationsService implements OnApplicationBootstrap {
  constructor(
    private readonly repo: IntegrationsRepository,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    private readonly tracker: JobTracker,
  ) {}

  /** True when deliveries run as tracked queue jobs (vs. inline in the request). */
  get queueOwned(): boolean {
    return this.env.REDIS_ENABLED && this.env.QUEUE_WORKERS_ENABLED && process.env.NODE_ENV !== 'test';
  }

  onApplicationBootstrap(): void {
    if (!this.queueOwned) return;
    this.workers.register(DELIVER_JOB, (job: Job) =>
      this.tracker.run(DELIVER_JOB, QUEUE, async () => {
        const { endpointId, eventType, payload } = job.data as DeliverJobData;
        const attempt = (job.attemptsMade ?? 0) + 1;
        const delivery = await this.deliver(endpointId, eventType, payload, attempt);
        return { itemsProcessed: 1, detail: { endpointId, status: delivery?.status ?? 'skipped' } };
      }),
    );
  }

  // --- reads -----------------------------------------------------------------

  async list(q: ListEndpointsQuery) {
    const { items, total } = await this.repo.list(q);
    return { items: items.map((e) => this.toDto(e, e.deliveryCount)), total };
  }

  async get(id: string) {
    const endpoint = await this.requireEndpoint(id);
    const deliveries = await this.repo.recentDeliveries(id);
    return { endpoint: this.toDto(endpoint), deliveries: deliveries.map((d) => this.deliveryDto(d)) };
  }

  async listDeliveries(id: string, limit = 50) {
    await this.requireEndpoint(id);
    const deliveries = await this.repo.recentDeliveries(id, limit);
    return { items: deliveries.map((d) => this.deliveryDto(d)) };
  }

  // --- mutations -------------------------------------------------------------

  async create(input: CreateEndpointInput, ctx: ActionContext) {
    const actorId = ctx.principalContext.principal.employeeId;
    const created = await this.repo.insert({
      url: input.url,
      secret: this.newSecret(),
      events: input.events,
      institutionId: input.institutionId ?? null,
      description: input.description ?? null,
      createdBy: actorId,
    });
    await this.writeAudit(ctx, created.id, 'webhook.create', created.institutionId, {
      newState: { url: created.url, events: created.events },
    });
    // Secret is returned exactly once, on creation.
    return this.toDto(created, 0, true);
  }

  async update(id: string, input: UpdateEndpointInput, ctx: ActionContext) {
    const before = await this.requireEndpoint(id);
    const updated = await this.repo.updateWithVersion(
      id,
      input.version,
      {
        url: input.url ?? before.url,
        events: input.events ?? before.events,
        active: input.active === undefined ? before.active : input.active,
        description: input.description === undefined ? before.description : input.description,
      },
      ctx.principalContext.principal.employeeId,
    );
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, id, 'webhook.update', before.institutionId, {
      previousState: { url: before.url, events: before.events, active: before.active },
      newState: { url: updated.url, events: updated.events, active: updated.active },
    });
    return this.toDto(updated);
  }

  /** Rotate the signing secret. Sensitive — recent auth enforced by the guard. */
  async rotateSecret(id: string, input: RotateSecretInput, ctx: ActionContext) {
    const before = await this.requireEndpoint(id);
    const updated = await this.repo.updateWithVersion(
      id,
      input.version,
      {
        previousSecret: before.secret,
        previousSecretExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        secret: this.newSecret(),
      },
      ctx.principalContext.principal.employeeId,
    );
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, id, 'webhook.rotate_secret', before.institutionId, {
      reason: input.reason,
      // Never log secret values — only that a rotation happened.
      newState: { rotated: true },
    });
    // New secret returned exactly once.
    return this.toDto(updated, undefined, true);
  }

  /** Fire a test delivery. Enqueued when queues run; otherwise delivered inline. */
  async testDelivery(id: string, input: TestDeliveryInput, ctx: ActionContext) {
    const endpoint = await this.requireEndpoint(id);
    const payload: Record<string, unknown> = {
      test: true,
      endpointId: id,
      message: 'Edrion webhook test',
      firedBy: ctx.principalContext.principal.employeeId,
    };
    await this.writeAudit(ctx, id, 'webhook.test', endpoint.institutionId, {
      newState: { eventType: input.eventType },
    });
    if (this.queueOwned) {
      const jobId = await this.jobs.enqueue(QUEUE, DELIVER_JOB, {
        endpointId: id,
        eventType: input.eventType,
        payload,
      });
      return { enqueued: true, jobId };
    }
    const delivery = await this.deliver(id, input.eventType, payload, 1);
    return { enqueued: false, delivery: delivery ? this.deliveryDto(delivery) : null };
  }

  // --- delivery (shared by worker + inline fallback) -------------------------

  /**
   * Sign + POST one delivery, then record an immutable `webhook_deliveries` row. Never throws on
   * an HTTP failure — a failed attempt is a recorded row, not a crash. Returns the delivery, or
   * null if the endpoint vanished before delivery.
   */
  async deliver(
    endpointId: string,
    eventType: string,
    payload: Record<string, unknown>,
    attempt: number,
  ): Promise<WebhookDelivery | null> {
    const endpoint = await this.repo.findById(endpointId);
    if (!endpoint) return null;

    const body = JSON.stringify({ event: eventType, sentAt: new Date().toISOString(), data: payload });
    const eventId = randomUUID();
    const occurredAt = new Date().toISOString();
    const envelope = {
      id: eventId,
      type: eventType,
      version: '2',
      institution_id: endpoint.institutionId,
      occurred_at: occurredAt,
      data: payload,
    };
    const envelopeBody = JSON.stringify(envelope);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', endpoint.secret).update(body).digest('hex');
    const v1sig = createHmac('sha256', endpoint.secret)
      .update(`${timestamp}.${envelopeBody}`)
      .digest('hex');

    let status: DeliveryStatus = DeliveryStatus.Delivered;
    let responseStatus: number | null = null;
    let lastError: string | null = null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-edrion-event': eventType,
          'x-edrion-signature': `sha256=${signature}`,
          'Edrion-Signature': `t=${timestamp},v1=${v1sig}`,
          'x-edrion-delivery-attempt': String(attempt),
        },
        body: envelopeBody,
        signal: controller.signal,
      });
      responseStatus = res.status;
      if (!res.ok) {
        status = DeliveryStatus.Failed;
        lastError = `Endpoint responded ${res.status}`;
      }
    } catch (err) {
      status = DeliveryStatus.Failed;
      lastError = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    } finally {
      clearTimeout(timer);
    }

    const delivery = await this.repo.insertDelivery({
      endpointId,
      eventType,
      payload: envelope as unknown as Record<string, unknown>,
      status,
      attempts: attempt,
      responseStatus,
      lastError,
      eventId,
      eventVersion: '2',
      envelope: envelope as unknown as Record<string, unknown>,
    });
    this.logger.info('webhook.delivered', { endpointId, status, responseStatus });
    return delivery;
  }

  // --- helpers ---------------------------------------------------------------

  private newSecret(): string {
    return `whsec_${randomBytes(32).toString('hex')}`;
  }

  private async requireEndpoint(id: string): Promise<WebhookEndpoint> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Webhook endpoint not found' });
    return row;
  }

  private versionConflict(): ConflictException {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'This record changed since you loaded it. Reload and try again.',
    });
  }

  /** Endpoint → API shape. The signing secret is redacted unless `includeSecret` (create/rotate). */
  private toDto(e: WebhookEndpoint, deliveryCount?: number, includeSecret = false) {
    return {
      id: e.id,
      institutionId: e.institutionId,
      url: e.url,
      description: e.description,
      events: e.events,
      active: e.active,
      version: e.version,
      secretHint: `whsec_…${e.secret.slice(-4)}`,
      ...(includeSecret ? { secret: e.secret } : {}),
      ...(deliveryCount === undefined ? {} : { deliveryCount }),
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }

  private deliveryDto(d: WebhookDelivery) {
    return {
      id: d.id,
      endpointId: d.endpointId,
      eventType: d.eventType,
      status: d.status,
      attempts: d.attempts,
      responseStatus: d.responseStatus,
      lastError: d.lastError,
      createdAt: d.createdAt,
    };
  }

  private async writeAudit(
    ctx: ActionContext,
    id: string,
    action: string,
    institutionId: string | null,
    extra: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.logAudit({
      ...baseAudit(ctx),
      action,
      module: MODULE,
      entityType: ENTITY,
      entityId: id,
      institutionId: institutionId ?? undefined,
      ...extra,
    } as Parameters<AuditWriter['logAudit']>[0]);
  }
}
