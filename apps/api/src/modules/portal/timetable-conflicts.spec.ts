import { describe, expect, it } from 'vitest';
import { detectTimetableConflicts } from './timetable-conflicts';

describe('detectTimetableConflicts', () => {
  it('blocks teacher double-booking', () => {
    const candidate = {
      classId: 'c1',
      subjectId: 's1',
      teacherId: 't1',
      room: '214',
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '09:45',
      effectiveFrom: null,
      effectiveTo: null,
      teacherName: 'A. Sharma',
    };
    const peers = [
      {
        id: 'p1',
        classId: 'c2',
        subjectId: 's2',
        teacherId: 't1',
        room: '215',
        dayOfWeek: 1,
        startTime: '09:10',
        endTime: '10:00',
        effectiveFrom: null,
        effectiveTo: null,
        className: '9B Maths',
      },
    ];
    const conflicts = detectTimetableConflicts(candidate, peers);
    expect(conflicts.some((c) => c.code === 'TEACHER_CLASH' && c.severity === 'blocking')).toBe(true);
  });

  it('warns on room clash without blocking', () => {
    const conflicts = detectTimetableConflicts(
      {
        classId: 'c1',
        subjectId: 's1',
        teacherId: 't1',
        room: '214',
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '09:45',
        effectiveFrom: null,
        effectiveTo: null,
      },
      [
        {
          id: 'p1',
          classId: 'c2',
          subjectId: 's2',
          teacherId: 't2',
          room: '214',
          dayOfWeek: 1,
          startTime: '09:10',
          endTime: '10:00',
          effectiveFrom: null,
          effectiveTo: null,
          className: '10A',
        },
      ],
    );
    expect(conflicts.some((c) => c.code === 'ROOM_CLASH' && c.severity === 'warning')).toBe(true);
  });
});
