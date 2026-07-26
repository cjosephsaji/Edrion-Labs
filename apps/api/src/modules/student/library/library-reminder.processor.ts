import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { and, eq, isNull, lte, schema, sql, type Database } from '@edrion/database';
import { localStudyDate } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import { JobsService } from '../../../common/queue/jobs.service';
import { QueueWorkers } from '../../../common/queue/queue.worker';
import { JobTracker } from '../../../common/queue/job-tracker.service';
import { TodayNotifyService } from '../today/today-notify.service';
import { FeatureControlsService } from '../../feature-controls/feature-controls.service';
import { LIBRARY_DAILY_REMINDER_JOB } from './library.constants';

@Injectable()
export class LibraryReminderProcessor implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    private readonly tracker: JobTracker,
    private readonly todayNotify: TodayNotifyService,
    private readonly features: FeatureControlsService,
  ) {}

  onModuleInit() {
    this.workers.register(LIBRARY_DAILY_REMINDER_JOB, () =>
      this.tracker.run(LIBRARY_DAILY_REMINDER_JOB, 'maintenance', async () => {
        const sent = await this.scanReminders();
        return { itemsProcessed: sent };
      }),
    );
    void this.jobs.schedule('maintenance', LIBRARY_DAILY_REMINDER_JOB, 60_000);
  }

  private async scanReminders(): Promise<number> {
    const prefs = await this.db.select().from(schema.userReviewPrefs);
    let sent = 0;
    const now = new Date();
    for (const pref of prefs) {
      if (!pref.dailyReminderTime) continue;
      const ownerId = pref.studentId ?? pref.independentUserId;
      if (!ownerId) continue;

      const enabled = await this.features
        .resolveByKey(
          'library.daily_reminder',
          pref.studentId
            ? { institutionId: pref.institutionId ?? undefined }
            : { independentUserId: pref.independentUserId! },
        )
        .then((r) => r.value)
        .catch(() => true);
      if (!enabled) continue;

      const minute = this.localMinute(now, pref.timezone);
      const target = this.hhmm(pref.dailyReminderTime);
      if (Math.abs(minute - target) > 1) continue;

      const due = await this.dueCount(pref);
      if (due <= 0) continue;

      const studyDate = localStudyDate(now, pref.timezone);
      const eventKey = `lib:reminder:${ownerId}:${studyDate}`;

      if (pref.studentId) {
        const [student] = await this.db
          .select({
            institutionId: schema.students.institutionId,
            campusId: schema.students.campusId,
            institutionUserId: schema.students.institutionUserId,
            email: schema.institutionUsers.email,
            fullName: schema.institutionUsers.fullName,
          })
          .from(schema.students)
          .leftJoin(schema.institutionUsers, eq(schema.institutionUsers.id, schema.students.institutionUserId))
          .where(eq(schema.students.id, pref.studentId))
          .limit(1);
        if (!student?.institutionUserId) continue;
        await this.todayNotify.dispatch(
          {
            kind: 'institutional',
            institutionId: student.institutionId,
            campusId: student.campusId,
            institutionUserId: student.institutionUserId,
            studentId: pref.studentId,
            email: student.email ?? '',
            fullName: student.fullName ?? '',
            lastAuthAt: null,
            permissions: [],
          },
          {
            eventKey,
            type: 'nudge',
            sourceModule: 'library',
            title: `${due} cards ready to review`,
            body: `~${Math.ceil((due * 18) / 60)} min to clear your queue.`,
            deepLink: '/library/review?source=today',
          },
        );
      } else if (pref.independentUserId) {
        const [user] = await this.db
          .select({ email: schema.independentUsers.email, fullName: schema.independentUsers.fullName })
          .from(schema.independentUsers)
          .where(eq(schema.independentUsers.id, pref.independentUserId))
          .limit(1);
        await this.todayNotify.dispatch(
          {
            kind: 'independent',
            independentUserId: pref.independentUserId,
            email: user?.email ?? '',
            fullName: user?.fullName ?? '',
            lastAuthAt: null,
            permissions: [],
          },
          {
            eventKey,
            type: 'nudge',
            sourceModule: 'library',
            title: `${due} cards ready to review`,
            body: `~${Math.ceil((due * 18) / 60)} min to clear your queue.`,
            deepLink: '/library/review?source=today',
          },
        );
      }
      sent += 1;
    }
    return sent;
  }

  private async dueCount(pref: typeof schema.userReviewPrefs.$inferSelect) {
    const owner = pref.studentId
      ? eq(schema.flashcardDecks.studentId, pref.studentId)
      : eq(schema.flashcardDecks.independentUserId, pref.independentUserId!);
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.flashcards)
      .innerJoin(schema.flashcardDecks, eq(schema.flashcards.deckId, schema.flashcardDecks.id))
      .where(
        and(
          owner,
          lte(schema.flashcards.fsrsDueAt, new Date()),
          isNull(schema.flashcards.suspendedAt),
          isNull(schema.flashcardDecks.archivedAt),
        ),
      );
    return Number(row?.count ?? 0);
  }

  private hhmm(value: string) {
    const [h, m] = value.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  }

  private localMinute(date: Date, timezone: string) {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(date);
      return (
        Number(parts.find((p) => p.type === 'hour')?.value ?? 0) * 60 +
        Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
      );
    } catch {
      return date.getUTCHours() * 60 + date.getUTCMinutes();
    }
  }
}
