import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { and, eq, schema, type Database, runInInstitutionTenant } from '@edrion/database';
import { DATABASE } from '../../common/tokens';
import { IdempotencyService } from '../../common/idempotency.service';
import { JobsService } from '../../common/queue/jobs.service';
import { QueueWorkers } from '../../common/queue/queue.worker';
import { EmailService } from '../portal/email.service';
import { WebPushChannel } from '../parent-portal/notification-channels';
import { RequestRegistryService } from './request-registry.service';
import { TodayNotifyService } from '../student/today/today-notify.service';

export const REQUEST_NOTIFY_JOB = 'requests.notification.fanout';

type RequestNotifyJob = { institutionId: string; requestId: string; eventSeq: number };

@Injectable()
export class RequestNotifyService implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    private readonly idempotency: IdempotencyService,
    private readonly email: EmailService,
    private readonly push: WebPushChannel,
    private readonly registry: RequestRegistryService,
    private readonly todayNotify: TodayNotifyService,
  ) {}

  onModuleInit(): void {
    this.workers.register(REQUEST_NOTIFY_JOB, (job: Job) => this.handle(job.data as RequestNotifyJob));
  }

  async dispatch(data: RequestNotifyJob): Promise<void> {
    if (this.jobs.enabled) {
      await this.jobs.enqueue('notifications', REQUEST_NOTIFY_JOB, data, {
        jobId: `request-notify-${data.requestId}-${data.eventSeq}`,
      });
      return;
    }
    await this.handle(data);
  }

  async handle(data: RequestNotifyJob): Promise<{ delivered: number }> {
    const key = `request:notify:${data.requestId}:${data.eventSeq}`;
    const result = await this.idempotency.run(key, 'student_request_notification', async () =>
      runInInstitutionTenant(this.db, data.institutionId, async () => {
        const [request] = await this.db
          .select()
          .from(schema.studentRequests)
          .where(
            and(
              eq(schema.studentRequests.id, data.requestId),
              eq(schema.studentRequests.institutionId, data.institutionId),
            ),
          )
          .limit(1);
        const [event] = await this.db
          .select()
          .from(schema.studentRequestEvents)
          .where(
            and(
              eq(schema.studentRequestEvents.requestId, data.requestId),
              eq(schema.studentRequestEvents.seq, data.eventSeq),
            ),
          )
          .limit(1);
        if (!request || !event) throw new Error('Request notification source is not committed yet');

        const recipients = await this.recipientsFor(request, event.eventType);
        if (recipients.length === 0) return { delivered: 0 };
        const type = await this.registry.resolve(request.institutionId, request.type);
        const copy = notificationCopy(
          type.label,
          request.humanCode,
          event.eventType,
          type.config.producesDocument,
          type.config.notifications[event.eventType as keyof typeof type.config.notifications],
        );

        await this.db.insert(schema.notifications).values(
          recipients.map((recipient) => ({
            institutionId: data.institutionId,
            campusId: request.campusId,
            title: copy.title,
            body: copy.body,
            kind: 'request',
            audience: recipient.kind,
            status: 'unread',
            recipientCount: 1,
            targetSummary: `user:${recipient.id}`,
          })),
        );

        await Promise.all(
          recipients.map(async (recipient) => {
            const payload = {
              to: { email: recipient.email },
              title: copy.title,
              body: copy.body,
              deepLink:
                recipient.kind === 'student'
                  ? `/requests?request=${request.id}`
                  : `/approvals?request=${request.id}`,
            };
            await Promise.all([
              recipient.email ? this.email
                .send({
                  to: recipient.email,
                  subject: payload.title,
                  text: `${payload.body}\n\nOpen: ${payload.deepLink}`,
                  html: `<p>${escapeHtml(payload.body)}</p><p><a href="${escapeHtml(payload.deepLink)}">Open request</a></p>`,
                })
                .catch(() => undefined) : Promise.resolve(),
              recipient.kind === 'student' && request.studentId
                ? this.todayNotify.dispatch({
                    kind: 'institutional',
                    institutionId: request.institutionId,
                    campusId: request.campusId,
                    institutionUserId: recipient.id,
                    studentId: request.studentId as string,
                    email: recipient.email ?? '',
                    fullName: '',
                    lastAuthAt: null,
                    permissions: [],
                  }, {
                    eventKey: `request:${request.id}:${event.seq}`,
                    type: 'request_update',
                    sourceModule: 'requests',
                    title: copy.title,
                    body: copy.body,
                    deepLink: payload.deepLink,
                  }).catch(() => undefined)
                : this.push.send(payload).catch(() => undefined),
            ]);
          }),
        );
        return { delivered: recipients.length };
      }),
    );
    return result.result;
  }

  async notifySla(institutionId: string, requestId: string): Promise<{ delivered: number }> {
    const result = await this.idempotency.run(
      `request:sla_breach:${requestId}`,
      'student_request_sla_breach',
      async () =>
        runInInstitutionTenant(this.db, institutionId, async () => {
          const [request] = await this.db
            .select()
            .from(schema.studentRequests)
            .where(
              and(
                eq(schema.studentRequests.id, requestId),
                eq(schema.studentRequests.institutionId, institutionId),
              ),
            )
            .limit(1);
          if (!request) return { delivered: 0 };
          const recipients = await this.recipientsFor(request, 'submitted');
          if (!recipients.length) return { delivered: 0 };
          const title = '1 request in your inbox is past its expected time';
          const body = 'Please review this request in the Approvals inbox.';
          await this.db.insert(schema.notifications).values(
            recipients.map((recipient) => ({
              institutionId,
              campusId: request.campusId,
              title,
              body,
              kind: 'request_sla',
              audience: 'staff',
              status: 'unread',
              recipientCount: 1,
              targetSummary: `user:${recipient.id}`,
            })),
          );
          await Promise.all(
            recipients.map((recipient) =>
              this.push
                .send({
                  to: { email: recipient.email },
                  title,
                  body,
                  deepLink: `/approvals?request=${request.id}`,
                })
                .catch(() => undefined),
            ),
          );
          return { delivered: recipients.length };
        }),
    );
    return result.result;
  }

  private async recipientsFor(
    request: typeof schema.studentRequests.$inferSelect,
    eventType: string,
  ): Promise<Array<{ id: string; email: string | null; kind: 'student' | 'staff' }>> {
    if (['info_requested', 'approved', 'fulfilled', 'rejected', 'expired'].includes(eventType)) {
      if (!request.studentId) return [];
      const [student] = await this.db
        .select({ id: schema.students.institutionUserId, email: schema.institutionUsers.email })
        .from(schema.students)
        .leftJoin(schema.institutionUsers, eq(schema.institutionUsers.id, schema.students.institutionUserId))
        .where(eq(schema.students.id, request.studentId))
        .limit(1);
      return student?.id
        ? [{ id: student.id, email: student.email ?? null, kind: 'student' }]
        : [];
    }

    if (!['submitted', 'info_provided', 'reassigned'].includes(eventType)) return [];
    if (request.assignedUserId) {
      const [user] = await this.db
        .select({ id: schema.institutionUsers.id, email: schema.institutionUsers.email })
        .from(schema.institutionUsers)
        .where(eq(schema.institutionUsers.id, request.assignedUserId))
        .limit(1);
      return user?.id ? [{ id: user.id, email: user.email ?? null, kind: 'staff' }] : [];
    }
    if (request.type === 'leave_request' && request.assignedRole === 'teacher' && request.studentId) {
      const [teacher] = await this.db
        .select({ id: schema.institutionUsers.id, email: schema.institutionUsers.email })
        .from(schema.students)
        .leftJoin(schema.classes, eq(schema.classes.id, schema.students.classId))
        .leftJoin(schema.staff, eq(schema.staff.id, schema.classes.classTeacherId))
        .leftJoin(schema.institutionUsers, eq(schema.institutionUsers.id, schema.staff.institutionUserId))
        .where(eq(schema.students.id, request.studentId))
        .limit(1);
      return teacher?.id
        ? [{ id: teacher.id, email: teacher.email ?? null, kind: 'staff' }]
        : [];
    }
    const users = await this.db
      .select({ id: schema.institutionUsers.id, email: schema.institutionUsers.email })
      .from(schema.institutionUserRoles)
      .innerJoin(
        schema.institutionUsers,
        eq(schema.institutionUsers.id, schema.institutionUserRoles.institutionUserId),
      )
      .where(eq(schema.institutionUserRoles.roleKey, request.assignedRole));
    return users.map((user) => ({ id: user.id, email: user.email ?? null, kind: 'staff' as const }));
  }
}

function notificationCopy(
  label: string,
  code: string,
  eventType: string,
  producesDocument: boolean,
  configured?: { title: string; body: string },
): { title: string; body: string } {
  if (configured) {
    const fill = (value: string) => value.replaceAll('{label}', label).replaceAll('{code}', code);
    return { title: fill(configured.title), body: fill(configured.body) };
  }
  if (eventType === 'submitted') return { title: `New ${label.toLowerCase()} · ${code}`, body: 'A new request is waiting for review.' };
  if (eventType === 'info_requested') return { title: `${label} ${code}`, body: 'Your reviewer asked a question.' };
  if (eventType === 'info_provided') return { title: `${label} ${code}`, body: 'The student sent the requested information.' };
  if (eventType === 'rejected') return { title: `${label} ${code} was declined`, body: 'Open the request to see the reason.' };
  if (eventType === 'fulfilled') return { title: `${label} ${code} approved`, body: producesDocument ? 'Your document is ready.' : 'Your request is complete.' };
  if (eventType === 'expired') return { title: `${label} ${code} closed`, body: 'No reply was received within 14 days.' };
  if (eventType === 'reassigned') return { title: `${label} ${code} reassigned`, body: 'This request is now in your inbox.' };
  return { title: `${label} ${code}`, body: 'The request was updated.' };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
