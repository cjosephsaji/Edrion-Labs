import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray, schema, type Database } from '@edrion/database';
import { DATABASE } from '../../common/tokens';

export interface NotifyEvent {
  type: string;
  title: string;
  body?: string | null;
  studentId?: string | null;
  deepLink?: string | null;
  priority?: 'immediate' | 'digest';
  sourceEntity?: string | null;
}

/**
 * Writes parent_notifications rows (the in-app feed + fanout ledger). This M5 version is synchronous;
 * M6 upgrades it to enqueue a BullMQ `notifications.fanout` job that also dispatches immediate
 * channels (email / web-push) honoring per-category preferences + quiet hours. Producers call
 * `emitToStudentGuardians` / `emit` at the service layer.
 */
@Injectable()
export class ParentNotifyService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** The institution_user ids of every guardian linked to a student. */
  async guardiansOfStudent(studentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ uid: schema.parents.institutionUserId })
      .from(schema.studentGuardians)
      .innerJoin(schema.parents, eq(schema.parents.id, schema.studentGuardians.parentId))
      .where(eq(schema.studentGuardians.studentId, studentId));
    return rows.map((r) => r.uid).filter((x): x is string => !!x);
  }

  /** The guardian ids for every student assigned to a transport route (for route-wide fanout). */
  async guardiansOnRoute(routeId: string): Promise<{ guardianUserId: string; studentId: string }[]> {
    const students = await this.db
      .select({ studentId: schema.transportAssignments.studentId })
      .from(schema.transportAssignments)
      .where(eq(schema.transportAssignments.routeId, routeId));
    const ids = students.map((s) => s.studentId);
    if (!ids.length) return [];
    const rows = await this.db
      .select({ uid: schema.parents.institutionUserId, studentId: schema.studentGuardians.studentId })
      .from(schema.studentGuardians)
      .innerJoin(schema.parents, eq(schema.parents.id, schema.studentGuardians.parentId))
      .where(inArray(schema.studentGuardians.studentId, ids));
    return rows.filter((r): r is { uid: string; studentId: string } => !!r.uid).map((r) => ({ guardianUserId: r.uid, studentId: r.studentId }));
  }

  async emitToStudentGuardians(institutionId: string, studentId: string, evt: Omit<NotifyEvent, 'studentId'>): Promise<number> {
    const guardians = await this.guardiansOfStudent(studentId);
    return this.emit(institutionId, guardians, { ...evt, studentId });
  }

  /** Insert one notification per guardian. Returns the count written. */
  async emit(institutionId: string, guardianUserIds: string[], evt: NotifyEvent): Promise<number> {
    const unique = [...new Set(guardianUserIds)];
    if (!unique.length) return 0;
    await this.db.insert(schema.parentNotifications).values(
      unique.map((guardianUserId) => ({
        institutionId,
        guardianUserId,
        studentId: evt.studentId ?? null,
        type: evt.type,
        title: evt.title,
        body: evt.body ?? null,
        deepLink: evt.deepLink ?? null,
        priority: evt.priority ?? 'immediate',
        sourceEntity: evt.sourceEntity ?? null,
      })),
    );
    return unique.length;
  }
}
