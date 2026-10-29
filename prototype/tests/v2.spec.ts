import { describe, it, expect } from 'vitest';
import { alphaBeta, minimax } from '../teaching/algorithms';
import { WORLD_TREE, lessonForState } from '../teaching/tree-variant';
import { initialState, practice } from '../teaching/controller';
import { lessons } from '../lessons';
import { placeCloud, intersects } from '../world/cloud-layout';
import { fitLines, BOARD } from '../world/board-content';
import { retrieveExplanation } from '../teaching/contextual-explanations';
describe('World V2 instructional and layout contract', () => {
  it('confirms the exact requested 4 then 1 ordering with five evaluations and one skip', () => {
    const p = alphaBeta(WORLD_TREE);
    expect(p.visited).toBe(5);
    expect(p.skipped).toBe(1);
    expect(p.value).toBe(3);
    expect(p.events.filter((e) => e.skipped).map((e) => e.value)).toEqual([9]);
    expect(minimax(WORLD_TREE).best).toBe(0);
  });
  it('preserves fresh Classic and adapts the shared in-progress V2 questions', () => {
    const lesson = lessons[0]!;
    const s = {
      ...initialState,
      lessonId: 'ai3' as const,
      questionId: 'AI3-Q11',
      visualState: {
        ...initialState.visualState,
        kind: 'tree' as const,
        treeOrder: 'v2' as const,
        reveal: 10,
        pruneStep: 6,
        allLeaves: false,
        selected: '',
        transfer: false,
      },
      studentResponse: '5',
    };
    expect(lesson.questions[10]!.correct).toEqual(['4']);
    expect(lessonForState(lesson, s)!.questions[10]!.correct).toEqual(['5']);
    expect(
      practice(s, lesson.questions[10]!).completion['AI3-Q11']?.outcome,
    ).toBe('explored');
  });
  it('keeps a cloud inside the scene and away from header/board obstacles', () => {
    const safe = { x: 0, y: 76, w: 1440, h: 550 };
    const obstacle = { x: 500, y: 120, w: 800, h: 450 };
    const r = placeCloud(
      { head: { x: 420, y: 330 }, feet: { x: 420, y: 560 }, visible: true },
      { w: 260, h: 130 },
      safe,
      [obstacle],
    );
    expect(r.docked).toBe(false);
    expect(intersects({ ...r, w: 260, h: 130 }, obstacle)).toBe(false);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(76);
  });
  it('uses the caption dock instead of clipping a cloud when no placement can fit', () => {
    expect(
      placeCloud(
        { head: { x: 20, y: 80 }, feet: { x: 20, y: 300 }, visible: true },
        { w: 260, h: 150 },
        { x: 0, y: 76, w: 390, h: 200 },
        [{ x: 0, y: 76, w: 390, h: 200 }],
      ).docked,
    ).toBe(true);
  });
  it('wraps measured text and explicitly reports overflow rather than shrinking fonts', () => {
    expect(fitLines('one two three four', 80, (s) => s.length * 10, 2)).toEqual(
      { lines: ['one two', 'three'], overflow: true },
    );
    expect(BOARD.header.y + BOARD.header.h).toBeLessThan(BOARD.explanation.y);
    expect(BOARD.demo.y + BOARD.demo.h).toBeLessThan(BOARD.foot.y);
  });
  it('explains the skipped 9 with the actual V2 bound and count', () => {
    const s = {
      ...initialState,
      lessonId: 'ai3' as const,
      questionId: 'AI3-Q09',
      highlightTargetId: 'leaf-1-1',
      visualState: {
        kind: 'tree' as const,
        treeOrder: 'v2' as const,
        reveal: 10,
        pruneStep: 4,
        allLeaves: false,
        selected: 'leaf-1-1',
        transfer: false,
      },
    };
    const r = retrieveExplanation(
      s,
      lessons[0]!,
      'Why didn’t you check the 9?',
    )!;
    expect(r.text).toContain('alpha = 3');
    expect(r.text).toContain('evaluates 5 leaves and skips 1');
    expect(r.target).toBe('leaf-1-1');
  });
});
