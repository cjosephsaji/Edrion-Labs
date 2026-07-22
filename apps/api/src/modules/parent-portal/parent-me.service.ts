import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, inArray, isNull, isNotNull, schema, type Database } from '@edrion/database';
import type { ParentChildSummary, ParentMeResponse } from '@edrion/schemas';
import { resolveNomenclature, type InstitutionType } from '@edrion/shared-types';
import { DATABASE } from '../../common/tokens';
import { AttendancePolicyService } from '../portal/attendance-policy.service';
import type { GuardianContext } from './guardian-context';

/** Builds `GET /v1/parent/me`: the guardian, their wards, preferences and unread badge counts. */
@Injectable()
export class ParentMeService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly attendancePolicy: AttendancePolicyService,
  ) {}

  async getMe(guardian: GuardianContext): Promise<ParentMeResponse> {
    const [guardianRow, institutionRow, children, preferences, unread] = await Promise.all([
      this.db
        .select({
          id: schema.institutionUsers.id,
          fullName: schema.institutionUsers.fullName,
          email: schema.institutionUsers.email,
        })
        .from(schema.institutionUsers)
        .where(eq(schema.institutionUsers.id, guardian.guardianUserId))
        .limit(1)
        .then((rows) => rows[0]),
      this.db
        .select({ type: schema.institutions.type })
        .from(schema.institutions)
        .where(eq(schema.institutions.id, guardian.institutionId))
        .limit(1)
        .then((rows) => rows[0]),
      this.buildChildren(guardian),
      this.getPreferences(guardian.guardianUserId),
      this.getUnread(guardian),
    ]);

    const institutionType = (institutionRow?.type ?? 'school') as InstitutionType;

    return {
      guardian: {
        id: guardianRow?.id ?? guardian.guardianUserId,
        fullName: guardianRow?.fullName ?? '',
        email: guardianRow?.email ?? '',
      },
      institution: {
        type: institutionType,
        nomenclature: resolveNomenclature(institutionType),
      },
      children,
      preferences,
      unread,
    };
  }

  private async buildChildren(guardian: GuardianContext): Promise<ParentChildSummary[]> {
    const ids = guardian.studentIds;
    if (!ids.length) return [];

    const [studentRows, classRows, boarders, transported] = await Promise.all([
      this.db
        .select({
          id: schema.students.id,
          firstName: schema.students.firstName,
          lastName: schema.students.lastName,
          admissionNo: schema.students.admissionNo,
          classId: schema.students.classId,
          campusId: schema.students.campusId,
        })
        .from(schema.students)
        .where(inArray(schema.students.id, ids)),
      this.db
        .select({ id: schema.classes.id, name: schema.classes.name })
        .from(schema.classes)
        .where(eq(schema.classes.institutionId, guardian.institutionId)),
      this.db
        .select({ studentId: schema.hostelAllocations.studentId })
        .from(schema.hostelAllocations)
        .where(
          and(
            inArray(schema.hostelAllocations.studentId, ids),
            eq(schema.hostelAllocations.status, 'active'),
          ),
        ),
      this.db
        .select({ studentId: schema.transportAssignments.studentId })
        .from(schema.transportAssignments)
        .where(
          and(
            inArray(schema.transportAssignments.studentId, ids),
            eq(schema.transportAssignments.status, 'active'),
          ),
        ),
    ]);

    const classNameById = new Map(classRows.map((c) => [c.id, c.name]));
    const boarderSet = new Set(boarders.map((b) => b.studentId));
    const transportSet = new Set(transported.map((t) => t.studentId));
    const policy = await this.attendancePolicy.resolvePolicyValues(guardian.institutionId, null);

    return studentRows.map((s): ParentChildSummary => {
      const scope = guardian.students.find((x) => x.studentId === s.id);
      const hiddenSections = scope ? Object.keys(scope.hidden).filter((k) => scope.hidden[k]) : [];
      if (policy.parentVisibility === 'off') hiddenSections.push('attendance');
      return {
        studentId: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        admissionNo: s.admissionNo,
        className: s.classId ? classNameById.get(s.classId) ?? null : null,
        campusId: s.campusId,
        photoUrl: null,
        isBoarder: boarderSet.has(s.id),
        onTransport: transportSet.has(s.id),
        hiddenSections,
      };
    });
  }

  private async getPreferences(guardianUserId: string): Promise<ParentMeResponse['preferences']> {
    const [row] = await this.db
      .select()
      .from(schema.parentNotificationPreferences)
      .where(eq(schema.parentNotificationPreferences.guardianUserId, guardianUserId))
      .limit(1);
    return {
      channels: (row?.channels as Record<string, boolean>) ?? { email: true, push: true, sms: false, whatsapp: false },
      digestDay: row?.digestDay ?? 1,
      digestEnabled: row?.digestEnabled ?? true,
      quietHours: (row?.quietHours as Record<string, string>) ?? {},
      language: row?.language ?? 'en',
    };
  }

  private async getUnread(guardian: GuardianContext): Promise<ParentMeResponse['unread']> {
    const gid = guardian.guardianUserId;
    const inst = guardian.institutionId;
    const [notifications, answeredThreads, publishedNotices, readNotices, publishedConsents, respondedConsents] =
      await Promise.all([
        this.count(
          this.db
            .select({ c: count() })
            .from(schema.parentNotifications)
            .where(and(eq(schema.parentNotifications.guardianUserId, gid), isNull(schema.parentNotifications.readAt))),
        ),
        this.count(
          this.db
            .select({ c: count() })
            .from(schema.parentMessageThreads)
            .where(
              and(
                eq(schema.parentMessageThreads.openedByGuardianId, gid),
                eq(schema.parentMessageThreads.status, 'answered'),
              ),
            ),
        ),
        this.count(
          this.db
            .select({ c: count() })
            .from(schema.parentNotices)
            .where(and(eq(schema.parentNotices.institutionId, inst), isNotNull(schema.parentNotices.publishedAt))),
        ),
        this.count(
          this.db
            .select({ c: count() })
            .from(schema.parentNoticeReceipts)
            .where(
              and(
                eq(schema.parentNoticeReceipts.guardianUserId, gid),
                isNotNull(schema.parentNoticeReceipts.readAt),
              ),
            ),
        ),
        this.count(
          this.db
            .select({ c: count() })
            .from(schema.parentConsentForms)
            .where(and(eq(schema.parentConsentForms.institutionId, inst), eq(schema.parentConsentForms.status, 'published'))),
        ),
        this.count(
          this.db
            .select({ c: count() })
            .from(schema.parentConsentResponses)
            .where(and(eq(schema.parentConsentResponses.guardianUserId, gid), isNull(schema.parentConsentResponses.supersededAt))),
        ),
      ]);

    return {
      notifications,
      notices: Math.max(0, publishedNotices - readNotices),
      messages: answeredThreads,
      pendingConsents: Math.max(0, publishedConsents - respondedConsents),
    };
  }

  private async count(q: Promise<Array<{ c: number }>>): Promise<number> {
    const [row] = await q;
    return Number(row?.c ?? 0);
  }
}
