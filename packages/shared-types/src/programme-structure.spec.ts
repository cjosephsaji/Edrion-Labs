import { describe, expect, it } from 'vitest';
import { generateStructure, normalizeStructure, STRUCTURE_PRESETS } from './programme-structure';

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

describe('normalizeStructure', () => {
  it('supports an extra semester in one year without changing other years', () => {
    const initial = generateStructure({ termSystem: 'semester', durationMonths: 24 });
    const extra = {
      ...initial.slots[0]!,
      sequenceInYear: 3,
      name: 'Summer semester',
      durationMonths: 2,
    };
    const edited = normalizeStructure(initial.levels, [...initial.slots, extra]);
    expect(edited.slots.filter((slot) => slot.levelSequence === 1)).toHaveLength(3);
    expect(edited.slots.filter((slot) => slot.levelSequence === 2)).toHaveLength(2);
    expect(edited.slots[2]).toMatchObject({ name: 'Summer semester', kind: 'semester', durationMonths: 2 });
    expect(edited.slots.map((slot) => slot.absoluteSequence)).toEqual([1, 2, 3, 4, 5]);
    expect(edited.totals).toEqual({ years: 2, slots: 5 });
    expect(initial.slots).toHaveLength(4);
  });

  it('renumbers remaining terms after removing a term from the middle', () => {
    const initial = generateStructure({ termSystem: 'trimester', durationMonths: 24 });
    const edited = normalizeStructure(initial.levels, initial.slots.filter((slot) =>
      !(slot.levelSequence === 1 && slot.sequenceInYear === 2),
    ));
    expect(edited.slots.slice(0, 2).map((slot) => [slot.name, slot.sequenceInYear])).toEqual([
      ['Trimester 1', 1], ['Trimester 3', 2],
    ]);
    expect(edited.slots.map((slot) => slot.absoluteSequence)).toEqual([1, 2, 3, 4, 5]);
  });

  it('removes a deleted year and retains the following year with its edited terms', () => {
    const initial = generateStructure({ termSystem: 'semester', durationMonths: 36 });
    const edited = normalizeStructure(
      initial.levels.filter((level) => level.sequence !== 2),
      initial.slots.map((slot) => slot.levelSequence === 3 && slot.sequenceInYear === 2
        ? { ...slot, name: 'Placement', kind: 'module' as const, isTerminal: true } : slot),
    );
    expect(edited.levels.map((level) => [level.sequence, level.name])).toEqual([[1, 'Year 1'], [2, 'Year 3']]);
    expect(edited.slots.at(-1)).toMatchObject({
      levelSequence: 2, sequenceInYear: 2, absoluteSequence: 4,
      name: 'Placement', kind: 'module', isTerminal: true,
    });
    expect(edited.totals).toEqual({ years: 2, slots: 4 });
  });
});
