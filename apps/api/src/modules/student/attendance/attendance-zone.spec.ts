import { describe, expect, it } from 'vitest';
import {
  attendanceRibbonId,
  attendanceZoneEventKey,
  isDownwardZoneCrossing,
  rollupSnapshotKey,
} from './attendance-zone';

describe('attendance zone crossing (AC 17 / A11 / AC 22)', () => {
  it('detects downward zone transitions only', () => {
    expect(isDownwardZoneCrossing('safe', 'warning')).toBe(true);
    expect(isDownwardZoneCrossing('warning', 'below')).toBe(true);
    expect(isDownwardZoneCrossing('below', 'unrecoverable')).toBe(true);
    expect(isDownwardZoneCrossing('warning', 'safe')).toBe(false);
    expect(isDownwardZoneCrossing(null, 'warning')).toBe(false);
    expect(isDownwardZoneCrossing('warning', 'warning')).toBe(false);
  });

  it('dedupes notifications per day via event key', () => {
    const key = attendanceZoneEventKey('stu', 'sub', 'term', 'warning', '2026-07-21');
    expect(key).toBe('attn:stu:sub:term:warning:2026-07-21');
    expect(attendanceZoneEventKey('stu', 'sub', 'term', 'warning', '2026-07-21')).toBe(key);
    expect(attendanceZoneEventKey('stu', 'sub', 'term', 'warning', '2026-07-22')).not.toBe(key);
  });

  it('uses the A11 ribbon id format', () => {
    expect(attendanceRibbonId('sub-1', 'below')).toBe('institution:attendance:sub-1:below');
  });

  it('produces stable rollup snapshots for rebuild comparison (AC 22)', () => {
    const row = {
      studentId: 's1',
      subjectId: 'sub',
      termId: 't1',
      attended: 40,
      conducted: 46,
      remaining: 31,
      pct: '0.8696',
      zone: 'warning',
      forecast: { branch: 'can_miss', n: 3 },
    };
    expect(rollupSnapshotKey(row)).toBe(rollupSnapshotKey({ ...row }));
    expect(rollupSnapshotKey({ ...row, attended: 39 })).not.toBe(rollupSnapshotKey(row));
  });
});
