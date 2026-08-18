import { describe, expect, it } from 'vitest';
import { scheduleProgrammeSlots } from './programme-schedule';

describe('scheduleProgrammeSlots', () => {
  it('runs each programme year concurrently inside the academic year', () => {
    const schedule = scheduleProgrammeSlots('2026-08-16', '2027-05-11', [
      { id: 'sem-1', programmeLevelId: 'year-1', sequenceInYear: 1, durationMonths: 6 },
      { id: 'sem-2', programmeLevelId: 'year-1', sequenceInYear: 2, durationMonths: 6 },
      { id: 'sem-7', programmeLevelId: 'year-4', sequenceInYear: 1, durationMonths: 6 },
      { id: 'sem-8', programmeLevelId: 'year-4', sequenceInYear: 2, durationMonths: 6 },
    ]);

    expect(schedule.get('sem-1')).toEqual(schedule.get('sem-7'));
    expect(schedule.get('sem-2')).toEqual(schedule.get('sem-8'));
    expect(schedule.get('sem-1')?.startDate).toBe('2026-08-16');
    expect(schedule.get('sem-2')?.endDate).toBe('2027-05-11');
  });

  it('uses slot duration weights within one programme year', () => {
    const schedule = scheduleProgrammeSlots('2026-01-01', '2026-12-31', [
      { id: 'long', programmeLevelId: 'year-1', sequenceInYear: 1, durationMonths: 9 },
      { id: 'short', programmeLevelId: 'year-1', sequenceInYear: 2, durationMonths: 3 },
    ]);

    expect(schedule.get('long')).toEqual({ startDate: '2026-01-01', endDate: '2026-10-01' });
    expect(schedule.get('short')).toEqual({ startDate: '2026-10-02', endDate: '2026-12-31' });
  });
});
