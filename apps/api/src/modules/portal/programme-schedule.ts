const DAY_MS = 86_400_000;

export interface ProgrammeScheduleSlot {
  id: string;
  programmeLevelId: string;
  sequenceInYear: number;
  durationMonths: number | null;
}

/**
 * Date each programme level independently. Year 1 Semester 1 and Year 4 Semester 7 are concurrent
 * cohorts inside the same academic year; laying all eight slots end-to-end is academically wrong.
 */
export function scheduleProgrammeSlots(
  yearStart: string,
  yearEnd: string,
  slots: ProgrammeScheduleSlot[],
): Map<string, { startDate: string; endDate: string }> {
  const startMs = new Date(yearStart).getTime();
  const endMs = new Date(yearEnd).getTime();
  const totalDays = Math.floor((endMs - startMs) / DAY_MS) + 1;
  const result = new Map<string, { startDate: string; endDate: string }>();
  const byLevel = new Map<string, ProgrammeScheduleSlot[]>();

  for (const slot of slots) {
    const group = byLevel.get(slot.programmeLevelId) ?? [];
    group.push(slot);
    byLevel.set(slot.programmeLevelId, group);
  }

  const fmt = (value: number) => new Date(value).toISOString().slice(0, 10);

  for (const group of byLevel.values()) {
    group.sort((a, b) => a.sequenceInYear - b.sequenceInYear);
    const totalWeight = group.reduce((sum, slot) => sum + (slot.durationMonths ?? 12), 0);
    let cursorDay = 0;
    let usedWeight = 0;

    group.forEach((slot, index) => {
      usedWeight += slot.durationMonths ?? 12;
      const last = index === group.length - 1;
      const endDay = last
        ? totalDays - 1
        : Math.max(cursorDay, Math.round((usedWeight / totalWeight) * totalDays) - 1);
      result.set(slot.id, {
        startDate: fmt(startMs + cursorDay * DAY_MS),
        endDate: fmt(startMs + endDay * DAY_MS),
      });
      cursorDay = endDay + 1;
    });
  }

  return result;
}
