import { Inject, Injectable } from '@nestjs/common';
import { and, eq, schema, type Database } from '@edrion/database';
import type { TimetableSlot } from '@edrion/database';
import { DATABASE } from '../../common/tokens';
import type { PortalActionContext } from './portal-action-context';

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function durationMinutes(startTime: string, endTime: string): number {
  const [sh = 0, sm = 0] = startTime.split(':').map(Number);
  const [eh = 0, em = 0] = endTime.split(':').map(Number);
  return Math.max(0, eh * 60 + em - (sh * 60 + sm));
}

/** Next calendar occurrence of a weekly slot (day 1=Mon … 7=Sun) at HH:MM. */
function scheduledAtFromSlot(dayOfWeek: number, startTime: string): Date {
  const now = new Date();
  const current = now.getDay() === 0 ? 7 : now.getDay();
  let daysAhead = dayOfWeek - current;
  if (daysAhead < 0) daysAhead += 7;
  const d = new Date(now);
  d.setDate(d.getDate() + daysAhead);
  const [h = 0, m = 0] = startTime.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Keeps `lab_schedules` in sync with timetable slots whose subject is flagged `is_lab_subject`.
 * One lab-schedule row per timetable slot (linked via `timetable_slot_id`).
 */
@Injectable()
export class LabScheduleSyncService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async syncForSlot(ctx: PortalActionContext, slot: TimetableSlot): Promise<void> {
    await this.removeForSlotId(slot.id);
    if (slot.kind !== 'teaching' || !slot.subjectId) return;

    const [subject] = await this.db
      .select({ name: schema.subjects.name, isLabSubject: schema.subjects.isLabSubject })
      .from(schema.subjects)
      .where(and(eq(schema.subjects.id, slot.subjectId), eq(schema.subjects.institutionId, slot.institutionId)))
      .limit(1);
    if (!subject?.isLabSubject) return;

    const [cls] = await this.db
      .select({ name: schema.classes.name })
      .from(schema.classes)
      .where(eq(schema.classes.id, slot.classId))
      .limit(1);

    const className = cls?.name ?? 'Class';
    const dayLabel = DAY_NAMES[slot.dayOfWeek] ?? `Day ${slot.dayOfWeek}`;
    const labName = slot.room?.trim() || 'Lab (TBD)';
    const title = `${className} — ${subject.name} (${dayLabel} ${slot.startTime}–${slot.endTime})`;

    await this.db.insert(schema.labSchedules).values({
      institutionId: slot.institutionId,
      campusId: slot.campusId,
      labName,
      title,
      scheduledAt: scheduledAtFromSlot(slot.dayOfWeek, slot.startTime),
      durationMinutes: durationMinutes(slot.startTime, slot.endTime),
      status: 'scheduled',
      timetableSlotId: slot.id,
      createdBy: ctx.principal.institutionUserId,
    });
  }

  async removeForSlotId(slotId: string): Promise<void> {
    await this.db.delete(schema.labSchedules).where(eq(schema.labSchedules.timetableSlotId, slotId));
  }

  async syncAllForSubject(ctx: PortalActionContext, institutionId: string, subjectId: string): Promise<void> {
    const slots = await this.db
      .select()
      .from(schema.timetableSlots)
      .where(and(eq(schema.timetableSlots.subjectId, subjectId), eq(schema.timetableSlots.institutionId, institutionId)));
    for (const slot of slots) {
      await this.syncForSlot(ctx, slot);
    }
  }

  async removeAllForSubject(subjectId: string): Promise<void> {
    const slots = await this.db
      .select({ id: schema.timetableSlots.id })
      .from(schema.timetableSlots)
      .where(eq(schema.timetableSlots.subjectId, subjectId));
    for (const { id } of slots) {
      await this.removeForSlotId(id);
    }
  }
}
