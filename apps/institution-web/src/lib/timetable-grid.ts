'use client';

import { useCallback, useMemo } from 'react';
import type { SelectOption } from '@edrion/ui';
import type { TimetableSlotKind } from '@edrion/schemas';
import {
  addMinutesToTime,
  adjustEndForStart,
  minutesBetween,
  parseClockTime,
  sortPeriods,
} from '@edrion/schemas';
import { useTimetableMutations } from './timetable';
import type { TimetableSlotRow } from './timetable-types';

export type { TimetableSlotKind };

export interface TimetablePeriod {
  id: string;
  startTime: string;
  endTime: string;
  kind: TimetableSlotKind;
  /** Optional row label override for break/lunch bands. */
  label?: string;
}

export interface TimetableGridConfig {
  days: number[];
  periods: TimetablePeriod[];
}

export const KIND_OPTIONS: SelectOption[] = [
  { value: 'teaching', label: 'Teaching period' },
  { value: 'break', label: 'Break (spans all days)' },
  { value: 'lunch', label: 'Lunch (spans all days)' },
];

export const DAY_OPTIONS: SelectOption[] = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '7', label: 'Sunday' },
];

export const DAY_LABEL: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

export const DEFAULT_GRID_CONFIG: TimetableGridConfig = {
  days: [1, 2, 3, 4, 5],
  periods: [
    { id: 'p1', startTime: '08:00', endTime: '08:45', kind: 'teaching' },
    { id: 'p2', startTime: '08:50', endTime: '09:35', kind: 'teaching' },
    { id: 'p3', startTime: '09:45', endTime: '10:30', kind: 'teaching' },
    { id: 'break1', startTime: '10:30', endTime: '11:00', kind: 'break', label: 'Break' },
    { id: 'p4', startTime: '11:00', endTime: '11:45', kind: 'teaching' },
    { id: 'p5', startTime: '11:50', endTime: '12:35', kind: 'teaching' },
    { id: 'lunch1', startTime: '12:35', endTime: '13:15', kind: 'lunch', label: 'Lunch' },
    { id: 'p6', startTime: '13:15', endTime: '14:00', kind: 'teaching' },
    { id: 'p7', startTime: '14:00', endTime: '14:45', kind: 'teaching' },
    { id: 'p8', startTime: '14:50', endTime: '15:35', kind: 'teaching' },
  ],
};

export type { ClockTimeParts } from '@edrion/schemas';
export { parseClockTime, minutesBetween, addMinutesToTime, adjustEndForStart, sortPeriods };

/** Plain-text 12-hour label with aligned AM/PM (for dropdowns and dialogs). */
export function formatTime12(time: string): string {
  const { clock, period } = parseClockTime(time);
  return `${clock.padStart(5, '\u2007')}\u00a0${period}`;
}

export function formatTimeRange12(start: string, end: string): string {
  return `${formatTime12(start)} – ${formatTime12(end)}`;
}

/** Every 5 minutes from 06:00 to 20:00 — values stay 24-hour; labels show AM/PM. */
export function buildTimeOptions(stepMinutes = 5): SelectOption[] {
  const options: SelectOption[] = [];
  for (let h = 6; h <= 20; h++) {
    for (let m = 0; m < 60; m += stepMinutes) {
      if (h === 20 && m > 0) break;
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      const value = `${hh}:${mm}`;
      options.push({ value, label: formatTime12(value) });
    }
  }
  return options;
}

export const TIME_OPTIONS = buildTimeOptions();

export function endTimeOptionsAfter(startTime: string): SelectOption[] {
  return TIME_OPTIONS.filter((o) => o.value > startTime);
}

export function nextPeriodId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Coerce stored configs into the current shape. */
export function normalizeGridConfig(raw: Partial<TimetableGridConfig>): TimetableGridConfig {
  const days = Array.isArray(raw.days) && raw.days.length > 0 ? raw.days : DEFAULT_GRID_CONFIG.days;
  const periods = (raw.periods ?? DEFAULT_GRID_CONFIG.periods).map((period) => ({
    ...period,
    kind: period.kind ?? 'teaching',
  }));
  return { days, periods };
}

export function isSchedulablePeriod(period: TimetablePeriod): boolean {
  return period.kind === 'teaching';
}

export function isBandPeriod(period: TimetablePeriod): boolean {
  return period.kind === 'break' || period.kind === 'lunch';
}

/** Extract distinct period rows from a class's slots. */
export function slotsToPeriodSkeleton(slots: TimetableSlotRow[]): TimetablePeriod[] {
  const seen = new Map<string, TimetablePeriod>();
  for (const slot of slots) {
    const key = `${slot.startTime}:${slot.endTime}:${slot.kind ?? 'teaching'}`;
    if (!seen.has(key)) {
      seen.set(key, {
        id: nextPeriodId(),
        startTime: slot.startTime,
        endTime: slot.endTime,
        kind: (slot.kind as TimetableSlotKind) ?? 'teaching',
        ...(slot.label ? { label: slot.label } : {}),
      });
    }
  }
  return sortPeriods([...seen.values()]);
}

/** Merge slot times into the grid so existing data always has a matching row. */
export function mergeSlotsIntoConfig(
  config: TimetableGridConfig,
  slots: TimetableSlotRow[],
): TimetableGridConfig {
  const periods = [...config.periods];
  const daySet = new Set(config.days);

  for (const slot of slots) {
    daySet.add(slot.dayOfWeek);
    if (!periods.some((p) => p.startTime === slot.startTime && p.endTime === slot.endTime)) {
      periods.push({
        id: nextPeriodId(),
        startTime: slot.startTime,
        endTime: slot.endTime,
        kind: (slot.kind as TimetableSlotKind) ?? 'teaching',
        ...(slot.label ? { label: slot.label } : {}),
      });
    }
  }

  const days = [...daySet].sort((a, b) => a - b);
  return normalizeGridConfig({ ...config, days, periods: sortPeriods(periods) });
}

export function slotKey(dayOfWeek: number, startTime: string): string {
  return `${dayOfWeek}:${startTime}`;
}

export function buildSlotMap(slots: TimetableSlotRow[]): Map<string, TimetableSlotRow> {
  const map = new Map<string, TimetableSlotRow>();
  for (const slot of slots) {
    if (slot.kind === 'break' || slot.kind === 'lunch') continue;
    map.set(slotKey(slot.dayOfWeek, slot.startTime), slot);
  }
  return map;
}

export function formatSlotLabel(slot: TimetableSlotRow): string {
  const parts = [slot.subjectName, slot.room, slot.teacherName].filter(Boolean);
  return parts.join(' · ') || 'Scheduled';
}

export function periodRowLabel(period: TimetablePeriod): string {
  if (isBandPeriod(period)) return period.label?.trim() || (period.kind === 'lunch' ? 'Lunch' : 'Break');
  return period.label?.trim() || parseClockTime(period.startTime).clock;
}

/**
 * Client-side grid layout for a class, derived from its timetable slots.
 * saveConfig syncs band rows and row structure to timetable slots.
 */
export function useTimetableGridConfig(classId: string, slots: TimetableSlotRow[]) {
  const { create, update, remove } = useTimetableMutations('timetable');

  const config = useMemo(() => {
    if (!classId) return DEFAULT_GRID_CONFIG;
    const fromSlots = slotsToPeriodSkeleton(slots);
    const base =
      fromSlots.length > 0
        ? normalizeGridConfig({ days: DEFAULT_GRID_CONFIG.days, periods: fromSlots })
        : DEFAULT_GRID_CONFIG;
    return mergeSlotsIntoConfig(base, slots);
  }, [classId, slots]);

  const saveConfig = useCallback(
    async (next: TimetableGridConfig, prevSlots: TimetableSlotRow[]) => {
      if (!classId) return;
      const normalized = normalizeGridConfig(next);
      const prevPeriods = slotsToPeriodSkeleton(prevSlots);
      const prevByStart = new Map(prevPeriods.map((p) => [p.startTime, p]));
      const nextByStart = new Map(normalized.periods.map((p) => [p.startTime, p]));

      // Remove slots for deleted rows.
      for (const prev of prevPeriods) {
        if (!nextByStart.has(prev.startTime)) {
          const toDelete = prevSlots.filter((s) => s.startTime === prev.startTime);
          for (const slot of toDelete) {
            await remove.mutateAsync({ id: slot.id, version: slot.version });
          }
        }
      }

      // Sync each period row.
      for (const period of normalized.periods) {
        const prev = prevByStart.get(period.startTime);
        const matchingSlots = prevSlots.filter((s) => s.startTime === (prev?.startTime ?? period.startTime));

        if (isBandPeriod(period)) {
          // Ensure a band slot exists for each active day.
          for (const day of normalized.days) {
            const existing = matchingSlots.find((s) => s.dayOfWeek === day);
            if (existing) {
              if (
                existing.endTime !== period.endTime ||
                existing.kind !== period.kind ||
                (existing.label ?? null) !== (period.label ?? null)
              ) {
                await update.mutateAsync({
                  id: existing.id,
                  body: {
                    endTime: period.endTime,
                    kind: period.kind,
                    label: period.label ?? null,
                    version: existing.version,
                  },
                });
              }
            } else {
              await create.mutateAsync({
                classId,
                dayOfWeek: day,
                startTime: period.startTime,
                endTime: period.endTime,
                kind: period.kind,
                label: period.label ?? null,
              });
            }
          }
          // Remove band slots on days no longer in the grid.
          for (const slot of matchingSlots) {
            if (!normalized.days.includes(slot.dayOfWeek)) {
              await remove.mutateAsync({ id: slot.id, version: slot.version });
            }
          }
        } else if (prev && prev.startTime !== period.startTime) {
          // Time changed — update all teaching slots on this row.
          for (const slot of matchingSlots) {
            await update.mutateAsync({
              id: slot.id,
              body: {
                startTime: period.startTime,
                endTime: period.endTime,
                kind: period.kind,
                label: period.label ?? null,
                version: slot.version,
              },
            });
          }
        }
      }
    },
    [classId, create, update, remove],
  );

  return {
    config,
    saveConfig,
    hydrated: !!classId,
  };
}
