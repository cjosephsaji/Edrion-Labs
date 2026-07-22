import { describe, expect, it } from 'vitest';
import {
  compareTime,
  resolveTimetable,
  type ResolverException,
  type ResolverSlot,
} from './resolver';

const baseSlot = (overrides: Partial<ResolverSlot> = {}): ResolverSlot => ({
  id: 'slot-1',
  classId: 'class-1',
  subjectId: 'sub-physics',
  subjectName: 'Physics',
  teacherId: 'teacher-1',
  teacherName: 'A. Sharma',
  label: null,
  dayOfWeek: 1,
  startTime: '09:00',
  endTime: '09:45',
  kind: 'teaching',
  room: '214',
  effectiveFrom: null,
  effectiveTo: null,
  termStart: '2026-07-01',
  termEnd: '2026-07-31',
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...overrides,
});

const baseInput = (overrides: Partial<Parameters<typeof resolveTimetable>[0]> = {}) => ({
  sectionIds: ['class-1'],
  from: '2026-07-06',
  to: '2026-07-12',
  timezone: 'Asia/Kolkata',
  slots: [baseSlot()],
  exceptions: [] as ResolverException[],
  holidays: [],
  classSubjectTeachers: [],
  term: { id: 'term-1', startDate: '2026-07-01', endDate: '2026-07-31' },
  ...overrides,
});

describe('compareTime', () => {
  it('orders zero-padded HH:MM lexicographically', () => {
    expect(compareTime('09:00', '11:20')).toBeLessThan(0);
    expect(compareTime('11:20', '09:00')).toBeGreaterThan(0);
  });
});

describe('resolveTimetable', () => {
  it('skips holidays on slot days', () => {
    const result = resolveTimetable(
      baseInput({
        holidays: [{ startsOn: '2026-07-06', endsOn: '2026-07-06' }],
      }),
    );
    expect(result.occurrences.some((o) => o.date === '2026-07-06')).toBe(false);
  });

  it('narrows by effective_from/to', () => {
    const result = resolveTimetable(
      baseInput({
        slots: [
          baseSlot({
            dayOfWeek: 3,
            effectiveFrom: '2026-07-08',
            effectiveTo: '2026-07-10',
          }),
        ],
      }),
    );
    expect(result.occurrences.map((o) => o.date)).toEqual(['2026-07-08']);
  });

  it('applies cancellation over substitution and room change', () => {
    const result = resolveTimetable(
      baseInput({
        exceptions: [
          {
            id: 'e1',
            slotId: 'slot-1',
            classId: 'class-1',
            date: '2026-07-06',
            recurring: false,
            recurringUntil: null,
            type: 'room_change',
            newRoom: 'Lab 3',
            newTeacherId: null,
            newTeacherName: null,
            subjectId: null,
            subjectName: null,
            startTime: null,
            endTime: null,
            note: null,
            createdAt: '2026-07-05T10:00:00.000Z',
          },
          {
            id: 'e2',
            slotId: 'slot-1',
            classId: 'class-1',
            date: '2026-07-06',
            recurring: false,
            recurringUntil: null,
            type: 'substitution',
            newRoom: null,
            newTeacherId: 'teacher-2',
            newTeacherName: 'B. Patel',
            subjectId: null,
            subjectName: null,
            startTime: null,
            endTime: null,
            note: null,
            createdAt: '2026-07-05T11:00:00.000Z',
          },
          {
            id: 'e3',
            slotId: 'slot-1',
            classId: 'class-1',
            date: '2026-07-06',
            recurring: false,
            recurringUntil: null,
            type: 'cancelled',
            newRoom: null,
            newTeacherId: null,
            newTeacherName: null,
            subjectId: null,
            subjectName: null,
            startTime: null,
            endTime: null,
            note: 'Storm',
            createdAt: '2026-07-05T12:00:00.000Z',
          },
        ],
      }),
    );
    const occ = result.occurrences.find((o) => o.date === '2026-07-06');
    expect(occ?.state).toBe('cancelled');
    expect(occ?.note).toBe('Storm');
  });

  it('composes substitution and room change', () => {
    const result = resolveTimetable(
      baseInput({
        exceptions: [
          {
            id: 'e1',
            slotId: 'slot-1',
            classId: 'class-1',
            date: '2026-07-06',
            recurring: false,
            recurringUntil: null,
            type: 'room_change',
            newRoom: 'Lab 3',
            newTeacherId: null,
            newTeacherName: null,
            subjectId: null,
            subjectName: null,
            startTime: null,
            endTime: null,
            note: null,
            createdAt: '2026-07-05T10:00:00.000Z',
          },
          {
            id: 'e2',
            slotId: 'slot-1',
            classId: 'class-1',
            date: '2026-07-06',
            recurring: false,
            recurringUntil: null,
            type: 'substitution',
            newRoom: null,
            newTeacherId: 'teacher-2',
            newTeacherName: 'B. Patel',
            subjectId: null,
            subjectName: null,
            startTime: null,
            endTime: null,
            note: null,
            createdAt: '2026-07-05T11:00:00.000Z',
          },
        ],
      }),
    );
    const occ = result.occurrences.find((o) => o.date === '2026-07-06');
    expect(occ?.state).toBe('substituted');
    expect(occ?.room.name).toBe('Lab 3');
    expect(occ?.teacher.name).toBe('B. Patel');
  });

  it('prefers specific over recurring within a type', () => {
    const result = resolveTimetable(
      baseInput({
        exceptions: [
          {
            id: 'rec',
            slotId: 'slot-1',
            classId: 'class-1',
            date: '2026-07-06',
            recurring: true,
            recurringUntil: '2026-07-20',
            type: 'room_change',
            newRoom: 'Hall',
            newTeacherId: null,
            newTeacherName: null,
            subjectId: null,
            subjectName: null,
            startTime: null,
            endTime: null,
            note: null,
            createdAt: '2026-07-01T00:00:00.000Z',
          },
          {
            id: 'spec',
            slotId: 'slot-1',
            classId: 'class-1',
            date: '2026-07-13',
            recurring: false,
            recurringUntil: null,
            type: 'room_change',
            newRoom: 'Lab 1',
            newTeacherId: null,
            newTeacherName: null,
            subjectId: null,
            subjectName: null,
            startTime: null,
            endTime: null,
            note: null,
            createdAt: '2026-07-10T00:00:00.000Z',
          },
        ],
        from: '2026-07-13',
        to: '2026-07-13',
      }),
    );
    expect(result.occurrences[0]?.room.name).toBe('Lab 1');
  });

  it('flags extra_class overlap as clash', () => {
    const result = resolveTimetable(
      baseInput({
        exceptions: [
          {
            id: 'extra-1',
            slotId: null,
            classId: 'class-1',
            date: '2026-07-06',
            recurring: false,
            recurringUntil: null,
            type: 'extra_class',
            newRoom: '214',
            newTeacherId: 'teacher-2',
            newTeacherName: 'B. Patel',
            subjectId: 'sub-chem',
            subjectName: 'Chemistry',
            startTime: '09:10',
            endTime: '10:00',
            note: null,
            createdAt: '2026-07-05T00:00:00.000Z',
          },
        ],
      }),
    );
    const clashes = result.occurrences.filter((o) => o.clash);
    expect(clashes).toHaveLength(2);
    expect(clashes.every((o) => o.clash_with)).toBe(true);
  });

  it('includes break slots in dayBounds but not occurrences', () => {
    const result = resolveTimetable(
      baseInput({
        slots: [
          baseSlot({ startTime: '09:00', endTime: '09:45' }),
          baseSlot({
            id: 'break-1',
            kind: 'break',
            startTime: '08:30',
            endTime: '08:45',
            subjectId: null,
            subjectName: null,
          }),
        ],
      }),
    );
    expect(result.occurrences).toHaveLength(1);
    expect(result.dayBounds.earliestStart).toBe('08:30');
  });

  it('resolves at most one section per student enrollment shape', () => {
    const result = resolveTimetable(
      baseInput({
        sectionIds: ['class-1'],
        slots: [
          baseSlot({ classId: 'class-1' }),
          baseSlot({ id: 'slot-2', classId: 'class-2' }),
        ],
      }),
    );
    expect(result.occurrences.every((o) => o.class_id === 'class-1')).toBe(true);
  });

  it('renders institution wall-clock under Asia/Kolkata regardless of process TZ', () => {
    const previous = process.env.TZ;
    process.env.TZ = 'Etc/GMT+5';
    try {
      const result = resolveTimetable(
        baseInput({
          timezone: 'Asia/Kolkata',
          slots: [baseSlot({ dayOfWeek: 1, startTime: '11:20', endTime: '12:10' })],
          from: '2026-07-20',
          to: '2026-07-20',
        }),
      );
      expect(result.occurrences[0]?.start).toBe('11:20');
      expect(result.occurrences[0]?.end).toBe('12:10');
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});
