import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  addWeeks,
  fromISODate,
  monthMatrix,
  startOfWeek,
  toISODate,
} from './date-math';

describe('date-math', () => {
  it('parses ISO dates as local calendar days (not UTC midnight)', () => {
    const d = fromISODate('2026-08-15');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(15);
  });

  it('formats with local Y-M-D not toISOString', () => {
    const d = new Date(2026, 7, 15, 22, 0, 0);
    expect(toISODate(d)).toBe('2026-08-15');
  });

  it('adds days without DST ms arithmetic', () => {
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
  });

  it('clamps month overflow (Jan 31 + 1 month)', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('builds a 6×7 month matrix starting Monday', () => {
    const matrix = monthMatrix(2026, 7, 1);
    expect(matrix).toHaveLength(6);
    expect(matrix[0]).toHaveLength(7);
    // July 2026 starts on Wednesday → Mon Jun 29 is first cell
    expect(matrix[0]![0]).toBe('2026-06-29');
  });

  it('startOfWeek / addWeeks', () => {
    expect(startOfWeek('2026-07-16', 1)).toBe('2026-07-13');
    expect(addWeeks('2026-07-13', 1)).toBe('2026-07-20');
  });
});
