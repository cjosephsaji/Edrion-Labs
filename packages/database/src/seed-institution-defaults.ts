import type { Database } from './client';
import * as schema from './schema/index';

const SYSTEM_CALENDAR_TYPES = [
  { key: 'holiday', label: 'Holiday', color: 'red', sortOrder: 0 },
  { key: 'event', label: 'Event', color: 'green', sortOrder: 1 },
  { key: 'exam_period', label: 'Exam period', color: 'amber', sortOrder: 2 },
  { key: 'activity', label: 'Activity', color: 'blue', sortOrder: 3 },
  { key: 'ptm', label: 'Parent-teacher meeting', color: 'purple', sortOrder: 4 },
  { key: 'deadline', label: 'Deadline', color: 'orange', sortOrder: 5 },
] as const;

/** Seed system calendar types for a brand-new institution. */
export async function seedInstitutionScheduleDefaults(
  db: Pick<Database, 'insert'>,
  institutionId: string,
): Promise<void> {
  await db
    .insert(schema.calendarEventTypes)
    .values(
      SYSTEM_CALENDAR_TYPES.map((t) => ({
        institutionId,
        key: t.key,
        label: t.label,
        color: t.color,
        isSystem: true,
        sortOrder: t.sortOrder,
      })),
    )
    .onConflictDoNothing();
}
