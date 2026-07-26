import { describe, expect, it } from 'vitest';
import { generateStructure, STRUCTURE_PRESETS } from './programme-structure';

describe('generateStructure', () => {
  it('generates school K–12 with 12 grades × 3 terms', () => {
    const r = generateStructure({ termSystem: 'term', durationMonths: null, gradeCount: 12 });
    expect(r.totals.years).toBe(12);
    expect(r.totals.slots).toBe(36);
    expect(r.levels[0]?.name).toBe('Grade 1');
    expect(r.slots.filter((s) => s.levelSequence === 1)).toHaveLength(3);
  });

  it('generates MBBS with irregular phases + internship', () => {
    const r = generateStructure({ termSystem: 'annual', durationMonths: 66, preset: 'mbbs' });
    expect(r.totals.slots).toBe(5);
    expect(r.slots.at(-1)?.isTerminal).toBe(true);
    expect(r.slots.at(-1)?.name).toBe('Internship');
    expect(r.slots[3]?.durationMonths).toBe(18);
  });

  it('generates B.Tech with 8 semesters over 4 years', () => {
    const r = generateStructure({ termSystem: 'semester', durationMonths: 48 });
    expect(r.totals.years).toBe(4);
    expect(r.totals.slots).toBe(8);
  });

  it('generates BSc with 6 semesters', () => {
    const r = generateStructure({ termSystem: 'semester', durationMonths: 36 });
    expect(r.totals.slots).toBe(6);
  });

  it('generates integrated 5-year with 10 semesters', () => {
    const r = generateStructure({ termSystem: 'semester', durationMonths: 60 });
    expect(r.totals.slots).toBe(10);
  });

  it('generates diploma with 6 semesters', () => {
    const r = generateStructure({ termSystem: 'semester', durationMonths: 36 });
    expect(r.totals.slots).toBe(6);
  });

  it('generates annual-system degree with 3 year slots', () => {
    const r = generateStructure({ termSystem: 'annual', durationMonths: 36 });
    expect(r.totals.slots).toBe(3);
    expect(r.slots.every((s) => s.sequenceInYear === 1)).toBe(true);
  });

  it('generates trimester MBA with 6 slots', () => {
    const r = generateStructure({ termSystem: 'trimester', durationMonths: 24 });
    expect(r.totals.years).toBe(2);
    expect(r.totals.slots).toBe(6);
  });

  it('generates modular skill course with 1 slot', () => {
    const r = generateStructure({ termSystem: 'modular', durationMonths: 6 });
    expect(r.totals.slots).toBe(1);
    expect(r.totals.years).toBe(1);
  });

  it('generates PhD with no levels or slots', () => {
    const r = generateStructure({ termSystem: 'modular', durationMonths: null });
    expect(r.totals.slots).toBe(0);
    expect(r.totals.years).toBe(0);
  });

  it('applies overrides to rename and remove slots', () => {
    const r = generateStructure({
      termSystem: 'semester',
      durationMonths: 24,
      overrides: [
        { levelSequence: 1, sequenceInYear: 1, name: 'Odd Semester' },
        { levelSequence: 2, sequenceInYear: 2, remove: true },
      ],
    });
    expect(r.slots.find((s) => s.levelSequence === 1 && s.sequenceInYear === 1)?.name).toBe(
      'Odd Semester',
    );
    expect(r.slots.some((s) => s.levelSequence === 2 && s.sequenceInYear === 2)).toBe(false);
    expect(r.totals.slots).toBe(3);
  });

  it('covers every STRUCTURE_PRESET without throwing', () => {
    for (const p of STRUCTURE_PRESETS) {
      const r = generateStructure(p);
      expect(r.totals.slots).toBeGreaterThanOrEqual(0);
    }
  });
});
