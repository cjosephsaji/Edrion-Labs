import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { eq, schema, type Database } from '@edrion/database';
import { DATABASE } from '../../common/tokens';
import { JobsService } from '../../common/queue/jobs.service';
import { QueueWorkers } from '../../common/queue/queue.worker';
import {
  EmailChannel,
  SmsChannel,
  WebPushChannel,
  WhatsAppChannel,
  type ChannelResult,
  type NotificationChannel,
} from './notification-channels';
import { CRITICAL_TYPES, resolveChannels } from './channel-resolution';

export const FANOUT_JOB = 'parent.notification.fanout';

export interface FanoutJobData {
  institutionId: string;
  guardianUserId: string;
  category: string;
  title: string;
  body?: string | null;
  deepLink?: string | null;
  critical: boolean;
}

/**
 * Dispatches immediate notification channels for a guardian, honoring per-category preferences and
 * quiet hours — EXCEPT medical incidents + emergency broadcasts, which always send on all enabled
 * channels regardless of quiet hours. Runs as a BullMQ `notifications` worker (registered in
 * onModuleInit); falls back to synchronous dispatch when queues are disabled. Every attempt is logged.
 */
@Injectable()
export class ParentFanoutService implements OnModuleInit {
  private readonly logger = new Logger(ParentFanoutService.name);
  private readonly channels: Record<string, NotificationChannel>;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    email: EmailChannel,
    push: WebPushChannel,
    sms: SmsChannel,
    whatsapp: WhatsAppChannel,
  ) {
    this.channels = { [email.key]: email, [push.key]: push, [sms.key]: sms, [whatsapp.key]: whatsapp };
  }

  onModuleInit(): void {
    this.workers.register(FANOUT_JOB, (job: Job) => this.handle(job.data as FanoutJobData));
  }

  static isCritical(type: string): boolean {
    return CRITICAL_TYPES.has(type);
  }

  /** Enqueue a fanout job (or run inline when queues are disabled). */
  async dispatch(data: FanoutJobData): Promise<void> {
    if (this.jobs.enabled) {
      await this.jobs.enqueue('notifications', FANOUT_JOB, data as unknown as Record<string, unknown>);
    } else {
      await this.handle(data);
    }
  }

  private async handle(data: FanoutJobData): Promise<{ results: ChannelResult[] }> {
    const [guardian] = await this.db
      .select({ email: schema.institutionUsers.email })
      .from(schema.institutionUsers)
      .where(eq(schema.institutionUsers.id, data.guardianUserId))
      .limit(1);
    const [prefs] = await this.db
      .select()
      .from(schema.parentNotificationPreferences)
      .where(eq(schema.parentNotificationPreferences.guardianUserId, data.guardianUserId))
      .limit(1);

    const keys = resolveChannels(prefs?.channels ?? null, (prefs?.categoryOverrides ?? {}) as Record<string, Record<string, boolean>>, (prefs?.quietHours ?? {}) as Record<string, string>, data.category, data.critical);
    const payload = { to: { email: guardian?.email ?? null }, title: data.title, body: data.body, deepLink: data.deepLink };

    const results: ChannelResult[] = [];
    for (const key of keys) {
      const channel = this.channels[key];
      if (!channel) continue;
      try {
        const r = await channel.send(payload);
        results.push(r);
      } catch (err) {
        results.push({ channel: key, status: 'failed', error: (err as Error).message });
      }
    }
    this.logger.debug(`fanout ${data.category} → ${data.guardianUserId}: ${results.map((r) => `${r.channel}:${r.status}`).join(', ') || 'no-channels'}`);
    return { results };
  }
}
