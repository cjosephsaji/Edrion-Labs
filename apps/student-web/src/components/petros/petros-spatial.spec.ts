import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculatePetrosBubble, calculatePetrosPlacement, findPetrosTarget, petrosGuidePanelSide, petrosGutterPosition } from './petros-spatial';

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, left: x, right: x + width, top: y, bottom: y + height, width, height, toJSON: () => ({}) }) as DOMRect;

describe('Petros spatial guidance', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('uses the visible responsive anchor, not the first matching hidden navigation', () => {
    document.body.innerHTML = '<button data-petros-target="nav:explore">Desktop</button><button data-petros-target="nav:explore">Mobile</button>';
    const [desktop, mobile] = Array.from(document.querySelectorAll('button'));
    vi.spyOn(desktop!, 'getClientRects').mockReturnValue([] as unknown as DOMRectList);
    vi.spyOn(mobile!, 'getClientRects').mockReturnValue([rect(0, 0, 50, 50)] as unknown as DOMRectList);
    expect(findPetrosTarget('nav:explore')).toBe(mobile);
  });

  it('targets declared IDs literally, never arbitrary model selectors', () => {
    document.body.innerHTML = '<section><button data-petros-target="entity:assignment:123" data-petros-entity="true">Ask</button></section>';
    vi.spyOn(document.querySelector('button')!, 'getClientRects').mockReturnValue([rect(0, 0, 50, 50)] as unknown as DOMRectList);
    expect(findPetrosTarget('entity:assignment:123')).toBe(document.querySelector('section'));
    expect(findPetrosTarget('button, input, [type=password]')).toBeNull();
  });

  it('places the character outside the content and below the sticky header', () => {
    const position = petrosGutterPosition(rect(180, 180, 720, 80), rect(180, 100, 1000, 800), { width: 1440, height: 900 }, 150);
    expect(position?.x).toBeGreaterThan(1180);
    expect(position!.x + 64).toBeLessThan(1440);
    expect(position!.y).toBeGreaterThan(150);
  });

  it('keeps the character in reserved space on mobile or when no gutter fits', () => {
    expect(petrosGutterPosition(rect(10, 300, 360, 80), rect(10, 90, 360, 800), { width: 390, height: 844 }, 54)).toBeNull();
    expect(petrosGutterPosition(rect(20, 300, 960, 80), rect(20, 90, 960, 800), { width: 1000, height: 844 }, 100)).toBeNull();
  });

  it('chooses the pointing pose from Petros position relative to the target', () => {
    const viewport = { width: 900, height: 760 };
    const character = { width: 120, height: 160 };
    expect(calculatePetrosPlacement(rect(420, 260, 160, 90), viewport, character).point).toBe('right');
    expect(calculatePetrosPlacement(rect(8, 260, 160, 90), viewport, character).point).toBe('left');
    expect(calculatePetrosPlacement(rect(0, 300, 900, 100), viewport, character).point).toBe('down');
    expect(calculatePetrosPlacement(rect(0, 20, 900, 100), viewport, character).point).toBe('up');
  });

  it('uses an available desktop gutter instead of covering the content below a wide target', () => {
    const placement = calculatePetrosPlacement(
      rect(560, 340, 1020, 300),
      { width: 2048, height: 960 },
      { width: 124, height: 165 },
      { previous: { x: 1000, y: 680 } },
    );
    expect(['left', 'right']).toContain(placement.side);
  });

  it('moves the guide card opposite the target and keeps Petros out of its reserved space', () => {
    const viewport = { width: 1280, height: 800 };
    const character = { width: 124, height: 165 };
    const rightTarget = rect(1010, 250, 180, 80);
    const leftTarget = rect(70, 250, 180, 80);

    expect(petrosGuidePanelSide(rightTarget, viewport.width)).toBe('left');
    const besideRightTarget = calculatePetrosPlacement(rightTarget, viewport, character, { leftInset: 390 });
    expect(besideRightTarget.x).toBeGreaterThanOrEqual(390);

    expect(petrosGuidePanelSide(leftTarget, viewport.width)).toBe('right');
    const besideLeftTarget = calculatePetrosPlacement(leftTarget, viewport, character, { rightInset: 390 });
    expect(besideLeftTarget.x + character.width).toBeLessThanOrEqual(890);
  });

  it('keeps the mobile speech bubble beside the character when pointing at a wide card', () => {
    const viewport = { width: 390, height: 844 };
    const character = { width: 92, height: 123 };
    const target = rect(10, 270, 370, 360);
    const placement = calculatePetrosPlacement(target, viewport, character, { topInset: 54, bottomInset: 76 });
    const bubble = calculatePetrosBubble(placement, target, viewport, character, { width: 260, height: 165 }, 54);
    expect(placement.point).toBe('down');
    expect(bubble.x + 260).toBeLessThanOrEqual(placement.x);
  });
});
