import type { TimetableOccurrence } from './dto';

/** Lexicographic compare for zero-padded HH:MM strings. */
export function compareTime(a: string, b: string): number {
  return a.localeCompare(b);
}

export function timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return compareTime(startA, endB) < 0 && compareTime(startB, endA) < 0;
}

export function hashColorIndex(subjectId: string | null): number {
  if (!subjectId) return 0;
  let hash = 0;
  for (let i = 0; i < subjectId.length; i += 1) {
    hash = (hash * 31 + subjectId.charCodeAt(i)) >>> 0;
  }
  return hash % 12;
}

export interface ResolverSlot {
  id: string;
  classId: string;
  subjectId: string | null;
  subjectName: string | null;
  teacherId: string | null;
  teacherName: string | null;
  label: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  kind: 'teaching' | 'break' | 'lunch';
  room: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  termStart: string | null;
  termEnd: string | null;
  updatedAt: string;
}

export interface ResolverException {
  id: string;
  slotId: string | null;
  classId: string;
  date: string;
  recurring: boolean;
  recurringUntil: string | null;
  type: 'cancelled' | 'room_change' | 'substitution' | 'extra_class';
  newRoom: string | null;
  newTeacherId: string | null;
  newTeacherName: string | null;
  subjectId: string | null;
  subjectName: string | null;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
  createdAt: string;
}

export interface ResolverExam {
  id: string;
  classId: string;
  subjectId: string | null;
  subjectName: string;
  examDate: string;
  startTime: string;
  endTime: string;
  room: string | null;
  updatedAt: string;
}

export interface ResolverClassSubjectTeacher {
  classId: string;
  subjectId: string;
  teacherId: string;
  teacherName: string;
}

export interface ResolverHolidayRange {
  startsOn: string;
  endsOn: string | null;
}

export interface ResolverTerm {
  id: string;
  name?: string;
  startDate: string;
  endDate: string;
}

export interface TimetableResolveInput {
  sectionIds: string[];
  from: string;
  to: string;
  timezone: string;
  slots: ResolverSlot[];
  exceptions: ResolverException[];
  holidays: ResolverHolidayRange[];
  exams?: ResolverExam[];
  classSubjectTeachers: ResolverClassSubjectTeacher[];
  term: ResolverTerm | null;
  includeExams?: boolean;
  teacherIdFilter?: string;
}

export interface TimetableResolveResult {
  occurrences: TimetableOccurrence[];
  dayBounds: { earliestStart: string; latestEnd: string };
  published: boolean;
  term: ResolverTerm | null;
  maxUpdatedAt: string | null;
}

export function resolveTimetable(input: TimetableResolveInput): TimetableResolveResult {
  const sectionSet = new Set(input.sectionIds);
  const holidayDates = expandHolidayDates(input.holidays, input.from, input.to);
  const cstMap = new Map(
    input.classSubjectTeachers.map((row) => [`${row.classId}:${row.subjectId}`, row]),
  );

  const relevantSlots = input.slots.filter((slot) => {
    if (!sectionSet.has(slot.classId)) return false;
    if (input.teacherIdFilter) {
      const teacher = resolveTeacher(slot, cstMap);
      if (teacher.id !== input.teacherIdFilter) return false;
    }
    return true;
  });

  const teachingSlots = relevantSlots.filter((s) => s.kind === 'teaching');
  const boundsSlots = relevantSlots;

  const occurrences: TimetableOccurrence[] = [];
  let maxUpdatedAt: string | null = null;

  for (const date of dateRange(input.from, input.to)) {
    if (holidayDates.has(date)) continue;

    for (const slot of teachingSlots) {
      if (!matchesWeekday(date, slot.dayOfWeek, input.timezone)) continue;
      if (!withinEffectiveRange(date, slot)) continue;

      const teacher = resolveTeacher(slot, cstMap);
      const subjectName = slot.subjectName ?? slot.label ?? 'Period';
      const base: TimetableOccurrence = {
        id: `${slot.id}:${date}`,
        date,
        start: slot.startTime,
        end: slot.endTime,
        kind: 'class',
        subject: {
          id: slot.subjectId,
          name: subjectName,
          colorIndex: hashColorIndex(slot.subjectId),
        },
        teacher: { id: teacher.id, name: teacher.name },
        room: { name: slot.room },
        state: 'normal',
        original: { room: slot.room, teacher: { id: teacher.id, name: teacher.name } },
        note: null,
        clash: false,
        clash_with: null,
        class_id: slot.classId,
      };

      const applied = applyExceptions(base, slot.id, date, input.exceptions);
      if (applied) {
        occurrences.push(applied);
        maxUpdatedAt = maxIso(maxUpdatedAt, slot.updatedAt);
      }
    }

    for (const exc of input.exceptions) {
      if (exc.type !== 'extra_class') continue;
      if (!sectionSet.has(exc.classId)) continue;
      if (!exceptionAppliesOnDate(exc, date)) continue;
      if (holidayDates.has(date)) continue;
      if (!exc.startTime || !exc.endTime) continue;

      const teacherName = exc.newTeacherName ?? 'Unassigned';
      occurrences.push({
        id: `${exc.id}:${date}`,
        date,
        start: exc.startTime,
        end: exc.endTime,
        kind: 'extra',
        subject: {
          id: exc.subjectId,
          name: exc.subjectName ?? 'Extra class',
          colorIndex: hashColorIndex(exc.subjectId),
        },
        teacher: { id: exc.newTeacherId, name: teacherName },
        room: { name: exc.newRoom },
        state: 'normal',
        original: { room: null, teacher: null },
        note: exc.note,
        clash: false,
        clash_with: null,
        class_id: exc.classId,
      });
      maxUpdatedAt = maxIso(maxUpdatedAt, exc.createdAt);
    }
  }

  if (input.includeExams && input.exams) {
    for (const exam of input.exams) {
      if (!sectionSet.has(exam.classId)) continue;
      if (exam.examDate < input.from || exam.examDate > input.to) continue;
      occurrences.push({
        id: `${exam.id}:${exam.examDate}`,
        date: exam.examDate,
        start: exam.startTime,
        end: exam.endTime,
        kind: 'exam',
        subject: {
          id: exam.subjectId,
          name: exam.subjectName,
          colorIndex: hashColorIndex(exam.subjectId),
        },
        teacher: { id: null, name: '—' },
        room: { name: exam.room },
        state: 'normal',
        original: { room: exam.room, teacher: null },
        note: null,
        clash: false,
        clash_with: null,
        class_id: exam.classId,
      });
      maxUpdatedAt = maxIso(maxUpdatedAt, exam.updatedAt);
    }
  }

  flagClashes(occurrences);

  for (const exc of input.exceptions) {
    maxUpdatedAt = maxIso(maxUpdatedAt, exc.createdAt);
  }

  const dayBounds = computeDayBounds(boundsSlots, input.from, input.to, input.timezone, holidayDates);
  const published = teachingSlots.length > 0;

  return {
    occurrences: occurrences.sort((a, b) =>
      a.date === b.date ? compareTime(a.start, b.start) : a.date.localeCompare(b.date),
    ),
    dayBounds,
    published,
    term: input.term,
    maxUpdatedAt,
  };
}

function resolveTeacher(
  slot: ResolverSlot,
  cstMap: Map<string, ResolverClassSubjectTeacher>,
): { id: string | null; name: string } {
  if (slot.teacherId) {
    return { id: slot.teacherId, name: slot.teacherName ?? 'Unassigned' };
  }
  if (slot.subjectId) {
    const cst = cstMap.get(`${slot.classId}:${slot.subjectId}`);
    if (cst) return { id: cst.teacherId, name: cst.teacherName };
  }
  return { id: null, name: 'Unassigned' };
}

function withinEffectiveRange(date: string, slot: ResolverSlot): boolean {
  const from = slot.effectiveFrom ?? slot.termStart;
  const to = slot.effectiveTo ?? slot.termEnd;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function exceptionAppliesOnDate(exc: ResolverException, date: string): boolean {
  if (!exc.recurring) return exc.date === date;
  if (date < exc.date) return false;
  if (exc.recurringUntil && date > exc.recurringUntil) return false;
  const anchorDow = weekdayForDate(exc.date);
  return weekdayForDate(date) === anchorDow;
}

function exceptionsForOccurrence(
  slotId: string,
  date: string,
  exceptions: ResolverException[],
): ResolverException[] {
  const specific: ResolverException[] = [];
  const recurring: ResolverException[] = [];
  for (const exc of exceptions) {
    if (exc.slotId !== slotId) continue;
    if (!exc.recurring && exc.date === date) specific.push(exc);
    else if (exc.recurring && exceptionAppliesOnDate(exc, date) && exc.date !== date) recurring.push(exc);
    else if (exc.recurring && exc.date === date) specific.push(exc);
  }
  return pickBestPerType([...specific, ...recurring.filter((r) => !specific.some((s) => s.type === r.type))]);
}

function pickBestPerType(exceptions: ResolverException[]): ResolverException[] {
  const byType = new Map<string, ResolverException>();
  for (const exc of exceptions) {
    const existing = byType.get(exc.type);
    if (!existing) {
      byType.set(exc.type, exc);
      continue;
    }
    const existingSpecific = !existing.recurring;
    const currentSpecific = !exc.recurring;
    if (currentSpecific && !existingSpecific) {
      byType.set(exc.type, exc);
      continue;
    }
    if (currentSpecific === existingSpecific && exc.createdAt > existing.createdAt) {
      byType.set(exc.type, exc);
    }
  }
  return [...byType.values()];
}

function applyExceptions(
  base: TimetableOccurrence,
  slotId: string,
  date: string,
  exceptions: ResolverException[],
): TimetableOccurrence | null {
  const applicable = exceptionsForOccurrence(slotId, date, exceptions);
  if (!applicable.length) return base;

  const cancelled = applicable.find((e) => e.type === 'cancelled');
  if (cancelled) {
    return {
      ...base,
      state: 'cancelled',
      note: cancelled.note ?? base.note,
    };
  }

  const roomChange = applicable.find((e) => e.type === 'room_change');
  const substitution = applicable.find((e) => e.type === 'substitution');

  let state: TimetableOccurrence['state'] = 'normal';
  let room = base.room.name;
  let teacher = { ...base.teacher };
  let note = base.note;

  if (roomChange?.newRoom) {
    room = roomChange.newRoom;
    state = substitution ? 'substituted' : 'room_changed';
    note = roomChange.note ?? note;
  }
  if (substitution) {
    teacher = {
      id: substitution.newTeacherId,
      name: substitution.newTeacherName ?? 'Unassigned',
    };
    state = 'substituted';
    note = substitution.note ?? note;
  }

  return {
    ...base,
    state,
    teacher,
    room: { name: room },
    note,
  };
}

function flagClashes(occurrences: TimetableOccurrence[]): void {
  const byDate = new Map<string, TimetableOccurrence[]>();
  for (const occ of occurrences) {
    if (occ.state === 'cancelled') continue;
    const list = byDate.get(occ.date) ?? [];
    list.push(occ);
    byDate.set(occ.date, list);
  }

  for (const list of byDate.values()) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i]!;
        const b = list[j]!;
        if (timesOverlap(a.start, a.end, b.start, b.end)) {
          a.clash = true;
          b.clash = true;
          a.clash_with = b.id;
          b.clash_with = a.id;
        }
      }
    }
  }
}

function computeDayBounds(
  slots: ResolverSlot[],
  from: string,
  to: string,
  timezone: string,
  holidays: Set<string>,
): { earliestStart: string; latestEnd: string } {
  let earliest = '23:59';
  let latest = '00:00';
  let found = false;

  for (const date of dateRange(from, to)) {
    if (holidays.has(date)) continue;
    for (const slot of slots) {
      if (!matchesWeekday(date, slot.dayOfWeek, timezone)) continue;
      if (!withinEffectiveRange(date, slot)) continue;
      found = true;
      if (compareTime(slot.startTime, earliest) < 0) earliest = slot.startTime;
      if (compareTime(slot.endTime, latest) > 0) latest = slot.endTime;
    }
  }

  if (!found) return { earliestStart: '08:00', latestEnd: '16:00' };
  return { earliestStart: earliest, latestEnd: latest };
}

function expandHolidayDates(
  holidays: ResolverHolidayRange[],
  from: string,
  to: string,
): Set<string> {
  const out = new Set<string>();
  for (const holiday of holidays) {
    const end = holiday.endsOn ?? holiday.startsOn;
    for (const date of dateRange(
      holiday.startsOn > from ? holiday.startsOn : from,
      end < to ? end : to,
    )) {
      if (date >= holiday.startsOn && date <= end) out.add(date);
    }
  }
  return out;
}

function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  let current = from;
  while (current <= to) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayForDate(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const js = d.getUTCDay();
  return js === 0 ? 7 : js;
}

function matchesWeekday(dateStr: string, dayOfWeek: number, timezone: string): boolean {
  try {
    const d = new Date(`${dateStr}T12:00:00`);
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(d);
    const map: Record<string, number> = {
      Sun: 7,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return map[wd] === dayOfWeek;
  } catch {
    return weekdayForDate(dateStr) === dayOfWeek;
  }
}

function maxIso(a: string | null, b: string): string {
  if (!a) return b;
  return a > b ? a : b;
}
