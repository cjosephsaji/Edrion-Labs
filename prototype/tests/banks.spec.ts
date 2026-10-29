import { describe, it, expect } from 'vitest';
import { lessons } from '../lessons';
import inventory from '../assets/extracted-sources.json';
import { HAZARDS, POLLUTION, entail, tinyModel } from '../teaching/algorithms';
describe('Checkpoint B authored lessons', () => {
  it.each(lessons.filter((l) => !l.general))(
    '$id contains exactly twelve sourced varied checkpoints',
    (lesson) => {
      expect(lesson.questions.length).toBe(12);
      expect(new Set(lesson.questions.map((q) => q.type)).size).toBeGreaterThan(
        2,
      );
      const source = inventory.find((s) => s.filename === lesson.filename)!;
      for (const q of lesson.questions) {
        expect(q.pages.length).toBeGreaterThan(0);
        for (const page of q.pages)
          expect(source.pages[page - 1]?.text.length).toBeGreaterThan(0);
        expect(q.next).toBeTruthy();
        expect(q.hints).toHaveLength(2);
      }
    },
  );
  it.each(lessons.filter((l) => l.general))(
    '$id contains eight checkpoints and an explanation',
    (lesson) => {
      expect(lesson.questions).toHaveLength(8);
      expect(lesson.questions.at(-1)?.type).toBe('text');
      expect(lesson.questions.at(-1)?.next).toBe('recap');
    },
  );
  it('deduces wings for each known entity and never invents flight', () => {
    for (const entity of ['Tweety', 'Rio']) {
      expect(entail([`Bird(${entity})`], `HasWings(${entity})`).status).toBe(
        'entailed',
      );
      expect(entail([`Bird(${entity})`], `CanFly(${entity})`).status).toBe(
        'not entailed',
      );
    }
  });
  it('has five visible hazard regions and four independent pollution controls', () => {
    expect(HAZARDS).toHaveLength(5);
    expect(new Set(HAZARDS.map((h) => h.id)).size).toBe(5);
    expect(POLLUTION).toHaveLength(4);
    expect(POLLUTION.every((p) => p.page >= 44 && p.page <= 48)).toBe(true);
  });
  it('computes the adjustable toy prediction consistently', () => {
    expect(tinyModel(2, 0.5)).toBe(1);
    expect(tinyModel(2, 1.5)).toBe(3);
    expect(tinyModel(4, 1.5)).toBe(6);
  });
});
