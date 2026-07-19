import { createHash } from 'node:crypto';
import { HttpException, Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { and, count, eq, gte, inArray, isNotNull, lte, schema, sql, type Database } from '@edrion/database';
import { DATABASE } from '../../common/tokens';
import { JobsService } from '../../common/queue/jobs.service';
import { QueueWorkers } from '../../common/queue/queue.worker';
import { EmailChannel } from './notification-channels';

const DIGEST_TICK_JOB = 'parent.digest.tick';
const DAY = 86_400_000;

export interface DigestWindow {
  start: Date;
  end: Date;
}

export interface DigestChildSection {
  studentName: string;
  attendancePct: number | null;
  unexplainedAbsences: number;
  assignments: { upcoming: number; missed: number };
  newResults: number;
  recognitions: string[];
  healthVisits: number;
  behaviorItems: number;
  feesDueMinor: number;
  libraryOverdue: number;
  documentsPublished: number;
  prompt: string | null;
}

export interface DigestModel {
  guardianName: string;
  window: { from: string; to: string };
  children: DigestChildSection[];
  upcoming: { calendar: number; ptm: boolean; pendingConsents: number };
  allGood: boolean;
}

/**
 * Weekly digest pipeline. A daily repeatable tick runs digests for guardians whose chosen weekday is
 * today. `buildModel` gathers per-child data; `render` is a pure (model → subject/text/html)
 * function. Empty sections are omitted; an all-empty digest becomes a short "all good this week".
 * A rate-limited preview endpoint renders + emails on demand. Deliveries are appended immutably.
 */
@Injectable()
export class ParentDigestService implements OnModuleInit {
  private readonly logger = new Logger(ParentDigestService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    private readonly email: EmailChannel,
  ) {}

  async onModuleInit(): Promise<void> {
    this.workers.register(DIGEST_TICK_JOB, (_job: Job) => this.runDueDigests());
    // Daily tick; the handler runs only the guardians whose digest_day matches today.
    await this.jobs.schedule('notifications', DIGEST_TICK_JOB, DAY);
  }

  /** Run digests for every guardian whose preferred weekday is today (institution tz simplified). */
  async runDueDigests(): Promise<{ delivered: number }> {
    const weekday = new Date().getDay();
    const due = await this.db
      .select({ guardianUserId: schema.parentNotificationPreferences.guardianUserId, institutionId: schema.parentNotificationPreferences.institutionId })
      .from(schema.parentNotificationPreferences)
      .where(and(eq(schema.parentNotificationPreferences.digestDay, weekday), eq(schema.parentNotificationPreferences.digestEnabled, true)));
    if (!due.length) return { delivered: 0 };

    const window: DigestWindow = { start: new Date(Date.now() - 7 * DAY), end: new Date() };
    const byInstitution = new Map<string, string[]>();
    for (const d of due) byInstitution.set(d.institutionId, [...(byInstitution.get(d.institutionId) ?? []), d.guardianUserId]);

    let delivered = 0;
    for (const [institutionId, guardianIds] of byInstitution) {
      const [run] = await this.db
        .insert(schema.parentDigestRuns)
        .values({ institutionId, windowStart: window.start, windowEnd: window.end, status: 'running', guardianCount: guardianIds.length, startedAt: new Date() })
        .returning();
      let ok = 0;
      let failed = 0;
      for (const guardianUserId of guardianIds) {
        try {
          await this.sendDigest(institutionId, guardianUserId, window, run!.id);
          ok += 1;
        } catch (err) {
          failed += 1;
          this.logger.error(`digest failed for ${guardianUserId}: ${(err as Error).message}`);
        }
      }
      await this.db.update(schema.parentDigestRuns).set({ status: 'completed', deliveredCount: ok, failedCount: failed, finishedAt: new Date() }).where(eq(schema.parentDigestRuns.id, run!.id));
      delivered += ok;
    }
    return { delivered };
  }

  /** Rate-limited (1/hour) on-demand preview: builds, emails and records a delivery. */
  async preview(institutionId: string, guardianUserId: string): Promise<{ model: DigestModel; sent: boolean }> {
    const hourAgo = new Date(Date.now() - 3_600_000);
    const recent = await this.db
      .select({ c: count() })
      .from(schema.parentDigestDeliveries)
      .where(and(eq(schema.parentDigestDeliveries.guardianUserId, guardianUserId), eq(schema.parentDigestDeliveries.channel, 'preview'), gte(schema.parentDigestDeliveries.createdAt, hourAgo)));
    if ((recent[0]?.c ?? 0) > 0) {
      throw new HttpException({ code: 'DIGEST_RATE_LIMITED', message: 'Preview digest already sent in the last hour.' }, 429);
    }
    const window: DigestWindow = { start: new Date(Date.now() - 7 * DAY), end: new Date() };
    const model = await this.buildModel(institutionId, guardianUserId, window);
    const sent = await this.sendDigest(institutionId, guardianUserId, window, null, 'preview', model);
    return { model, sent };
  }

  private async sendDigest(institutionId: string, guardianUserId: string, window: DigestWindow, runId: string | null, channel = 'email', prebuilt?: DigestModel): Promise<boolean> {
    const model = prebuilt ?? (await this.buildModel(institutionId, guardianUserId, window));
    const rendered = ParentDigestService.render(model);
    const [guardian] = await this.db.select({ email: schema.institutionUsers.email }).from(schema.institutionUsers).where(eq(schema.institutionUsers.id, guardianUserId)).limit(1);
    let status = 'skipped';
    let error: string | null = null;
    if (guardian?.email) {
      const res = await this.email.send({ to: { email: guardian.email }, title: rendered.subject, body: rendered.text });
      status = res.status;
      error = res.error ?? null;
    }
    await this.db.insert(schema.parentDigestDeliveries).values({
      institutionId,
      runId,
      guardianUserId,
      channel,
      payloadHash: createHash('sha256').update(rendered.text).digest('hex'),
      status,
      error,
    });
    return status === 'sent';
  }

  /** Gather per-child data for the window. Impure (reads); the shape it returns is rendered purely. */
  async buildModel(institutionId: string, guardianUserId: string, window: DigestWindow): Promise<DigestModel> {
    const [guardian] = await this.db.select({ fullName: schema.institutionUsers.fullName }).from(schema.institutionUsers).where(eq(schema.institutionUsers.id, guardianUserId)).limit(1);
    // The guardian's wards (via parents → student_guardians).
    const parentRows = await this.db.select({ id: schema.parents.id }).from(schema.parents).where(and(eq(schema.parents.institutionId, institutionId), eq(schema.parents.institutionUserId, guardianUserId)));
    const parentIds = parentRows.map((p) => p.id);
    const wardRows = parentIds.length
      ? await this.db.select({ studentId: schema.studentGuardians.studentId }).from(schema.studentGuardians).where(inArray(schema.studentGuardians.parentId, parentIds))
      : [];
    const studentIds = [...new Set(wardRows.map((w) => w.studentId))];

    const children: DigestChildSection[] = [];
    for (const studentId of studentIds) {
      children.push(await this.childSection(studentId, window));
    }

    const upcoming = await this.upcoming(institutionId, guardianUserId);
    const allGood = children.every((c) =>
      c.unexplainedAbsences === 0 && c.assignments.missed === 0 && c.newResults === 0 && c.recognitions.length === 0 &&
      c.behaviorItems === 0 && c.feesDueMinor === 0 && c.libraryOverdue === 0 && c.documentsPublished === 0,
    ) && upcoming.calendar === 0 && !upcoming.ptm && upcoming.pendingConsents === 0;

    return {
      guardianName: guardian?.fullName ?? 'there',
      window: { from: window.start.toISOString().slice(0, 10), to: window.end.toISOString().slice(0, 10) },
      children,
      upcoming,
      allGood,
    };
  }

  private async childSection(studentId: string, window: DigestWindow): Promise<DigestChildSection> {
    const fromDate = window.start.toISOString().slice(0, 10);
    const [student] = await this.db.select({ firstName: schema.students.firstName }).from(schema.students).where(eq(schema.students.id, studentId)).limit(1);

    // Attendance % + unexplained absences.
    const attRows = await this.db
      .select({ date: schema.attendanceSessions.date, status: schema.attendanceRecords.status })
      .from(schema.attendanceRecords)
      .innerJoin(schema.attendanceSessions, eq(schema.attendanceSessions.id, schema.attendanceRecords.sessionId))
      .where(and(eq(schema.attendanceRecords.studentId, studentId), gte(schema.attendanceSessions.date, fromDate)));
    const present = attRows.filter((r) => r.status === 'present' || r.status === 'late').length;
    const pct = attRows.length ? Math.round((present / attRows.length) * 100) : null;
    const ackNotes = await this.db.select({ from: schema.parentAbsenceNotes.dateFrom, to: schema.parentAbsenceNotes.dateTo }).from(schema.parentAbsenceNotes).where(and(eq(schema.parentAbsenceNotes.studentId, studentId), eq(schema.parentAbsenceNotes.status, 'acknowledged')));
    const unexplained = attRows.filter((r) => r.status === 'absent' && r.date && !ackNotes.some((n) => n.from <= r.date! && n.to >= r.date!)).length;

    const [assignUpcoming, assignMissed, newResults, recognitions, healthVisits, behavior, fees, libraryOverdue, docs] = await Promise.all([
      this.scalar(this.db.select({ c: count() }).from(schema.assignmentSubmissions).where(and(eq(schema.assignmentSubmissions.studentId, studentId), eq(schema.assignmentSubmissions.status, 'assigned')))),
      this.db.select({ due: schema.assignments.dueDate }).from(schema.assignmentSubmissions).innerJoin(schema.assignments, eq(schema.assignments.id, schema.assignmentSubmissions.assignmentId)).where(and(eq(schema.assignmentSubmissions.studentId, studentId), eq(schema.assignmentSubmissions.status, 'assigned'))),
      this.scalar(this.db.select({ c: count() }).from(schema.gradeEntries).where(and(eq(schema.gradeEntries.studentId, studentId), eq(schema.gradeEntries.published, true), gte(schema.gradeEntries.updatedAt, window.start)))),
      this.db.select({ title: schema.studentRecognitions.title }).from(schema.studentRecognitions).where(and(eq(schema.studentRecognitions.studentId, studentId), gte(schema.studentRecognitions.awardedAt, window.start))),
      this.scalar(this.db.select({ c: count() }).from(schema.healthRecords).where(and(eq(schema.healthRecords.studentId, studentId), gte(schema.healthRecords.recordedAt, fromDate)))),
      this.scalar(this.db.select({ c: count() }).from(schema.studentIncidents).where(and(eq(schema.studentIncidents.studentId, studentId), eq(schema.studentIncidents.notifyGuardians, true), isNotNull(schema.studentIncidents.publishedAt), gte(schema.studentIncidents.publishedAt, window.start)))),
      this.db.select({ amount: schema.feeInvoices.amount, paid: schema.feeInvoices.amountPaid, status: schema.feeInvoices.status }).from(schema.feeInvoices).where(eq(schema.feeInvoices.studentId, studentId)),
      this.scalar(this.db.select({ c: count() }).from(schema.libraryLoans).where(and(eq(schema.libraryLoans.studentId, studentId), eq(schema.libraryLoans.status, 'issued'), lte(schema.libraryLoans.dueDate, new Date().toISOString().slice(0, 10))))),
      this.scalar(this.db.select({ c: count() }).from(schema.studentDocuments).where(and(eq(schema.studentDocuments.studentId, studentId), eq(schema.studentDocuments.published, true), gte(schema.studentDocuments.issuedAt, window.start)))),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const missed = assignMissed.filter((a) => a.due && a.due < today).length;
    const feesDue = fees.filter((f) => f.status !== 'paid' && f.status !== 'cancelled').reduce((s, f) => s + Math.max(0, f.amount - f.paid), 0);
    const name = student?.firstName ?? 'your child';
    const recTitles = recognitions.map((r) => r.title);
    const prompt = recTitles[0]
      ? `Celebrate ${name}’s ${recTitles[0]}! 🎉`
      : missed > 0
        ? `Ask ${name} about ${missed} missed assignment${missed > 1 ? 's' : ''}.`
        : null;

    return {
      studentName: name,
      attendancePct: pct,
      unexplainedAbsences: unexplained,
      assignments: { upcoming: assignUpcoming, missed },
      newResults,
      recognitions: recTitles,
      healthVisits,
      behaviorItems: behavior,
      feesDueMinor: feesDue,
      libraryOverdue,
      documentsPublished: docs,
      prompt,
    };
  }

  private async upcoming(institutionId: string, guardianUserId: string) {
    const now = new Date();
    const from = now.toISOString().slice(0, 10);
    const in7 = new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10);
    const [cal, ptm, consents, responded] = await Promise.all([
      this.scalar(this.db.select({ c: count() }).from(schema.calendarEvents).where(and(eq(schema.calendarEvents.institutionId, institutionId), gte(schema.calendarEvents.startsOn, from), lte(schema.calendarEvents.startsOn, in7)))),
      this.scalar(this.db.select({ c: count() }).from(schema.parentPtmEvents).where(and(eq(schema.parentPtmEvents.institutionId, institutionId), eq(schema.parentPtmEvents.status, 'published')))),
      this.scalar(this.db.select({ c: count() }).from(schema.parentConsentForms).where(and(eq(schema.parentConsentForms.institutionId, institutionId), eq(schema.parentConsentForms.status, 'published')))),
      this.scalar(this.db.select({ c: count() }).from(schema.parentConsentResponses).where(and(eq(schema.parentConsentResponses.guardianUserId, guardianUserId), sql`${schema.parentConsentResponses.supersededAt} is null`))),
    ]);
    return { calendar: cal, ptm: ptm > 0, pendingConsents: Math.max(0, consents - responded) };
  }

  private async scalar(q: Promise<Array<{ c: number }>>): Promise<number> {
    const [row] = await q;
    return Number(row?.c ?? 0);
  }

  /** Pure renderer: DigestModel → { subject, text }. Omits empty sections. */
  static render(model: DigestModel): { subject: string; text: string } {
    if (model.allGood) {
      return { subject: 'Your weekly school update — all good this week ✅', text: `Hi ${model.guardianName},\n\nNothing needs your attention at school this week. Have a great week!` };
    }
    const lines: string[] = [`Hi ${model.guardianName}, here’s your week (${model.window.from} → ${model.window.to}):`, ''];
    for (const c of model.children) {
      lines.push(`● ${c.studentName}`);
      if (c.attendancePct !== null) lines.push(`  · Attendance: ${c.attendancePct}%${c.unexplainedAbsences ? ` (${c.unexplainedAbsences} unexplained)` : ''}`);
      if (c.assignments.missed || c.assignments.upcoming) lines.push(`  · Homework: ${c.assignments.missed} missed, ${c.assignments.upcoming} upcoming`);
      if (c.newResults) lines.push(`  · ${c.newResults} new result(s) published`);
      if (c.recognitions.length) lines.push(`  · 🎉 ${c.recognitions.join(', ')}`);
      if (c.healthVisits) lines.push(`  · ${c.healthVisits} health-room visit(s)`);
      if (c.behaviorItems) lines.push(`  · ${c.behaviorItems} behaviour note(s)`);
      if (c.feesDueMinor) lines.push(`  · Fees due: ₹${(c.feesDueMinor / 100).toFixed(2)}`);
      if (c.libraryOverdue) lines.push(`  · ${c.libraryOverdue} library book(s) overdue`);
      if (c.documentsPublished) lines.push(`  · ${c.documentsPublished} new document(s)`);
      if (c.prompt) lines.push(`  💬 ${c.prompt}`);
      lines.push('');
    }
    const u = model.upcoming;
    if (u.calendar || u.ptm || u.pendingConsents) {
      lines.push('Coming up:');
      if (u.pendingConsents) lines.push(`  · ${u.pendingConsents} consent(s) awaiting your response`);
      if (u.ptm) lines.push('  · A parent-teacher meeting is open for booking');
      if (u.calendar) lines.push(`  · ${u.calendar} calendar event(s) in the next 7 days`);
    }
    return { subject: `Your weekly school update — ${model.children.map((c) => c.studentName).join(', ')}`, text: lines.join('\n') };
  }
}
