/** Only declared portal anchors are targetable; model text is never a CSS selector. */
export function findPetrosTarget(key: string, root: ParentNode = document): HTMLElement | null {
  const matches = Array.from(root.querySelectorAll<HTMLElement>('[data-petros-target]')).filter((element) => element.dataset.petrosTarget === key);
  const visible = matches.find((element) => element.getClientRects().length > 0 && !element.closest('[aria-hidden="true"]'));
  if (!visible) return null;
  return visible.dataset.petrosEntity === 'true' ? visible.closest<HTMLElement>('[data-petros-card], article, li, tr, section') ?? visible : visible;
}

export type PetrosPointDirection = 'left' | 'right' | 'up' | 'down';
export type PetrosPlacement = {
  x: number;
  y: number;
  point: PetrosPointDirection;
  side: 'left' | 'right' | 'above' | 'below' | 'free';
};

type RectLike = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>;
type Size = { width: number; height: number };

function overlap(a: RectLike, b: RectLike) {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function rectAt(x: number, y: number, size: Size): RectLike {
  return { left: x, right: x + size.width, top: y, bottom: y + size.height, ...size };
}

/**
 * Places Petros beside the thing he means, then derives the pointing pose from that spatial
 * relationship. Coordinates are computed from live DOM geometry; pages never hardcode them.
 */
export function calculatePetrosPlacement(
  target: RectLike,
  viewport: Size,
  character: Size,
  options: {
    topInset?: number;
    bottomInset?: number;
    leftInset?: number;
    rightInset?: number;
    previous?: Pick<PetrosPlacement, 'x' | 'y'> | null;
  } = {},
): PetrosPlacement {
  const gap = viewport.width < 700 ? 10 : 18;
  const edge = viewport.width < 700 ? 8 : 14;
  const left = Math.max(edge, options.leftInset ?? edge);
  const right = viewport.width - Math.max(edge, options.rightInset ?? edge);
  const top = Math.max(edge, options.topInset ?? edge);
  const bottom = viewport.height - Math.max(edge, options.bottomInset ?? edge);
  const centeredX = viewport.width < 700 && target.width > character.width * 1.5
    ? right - character.width
    : target.left + target.width / 2 - character.width / 2;
  const centeredY = target.top + target.height / 2 - character.height / 2;
  const raw: PetrosPlacement[] = [
    { x: target.left - character.width - gap, y: centeredY, point: 'right', side: 'left' },
    { x: target.right + gap, y: centeredY, point: 'left', side: 'right' },
    { x: centeredX, y: target.top - character.height - gap, point: 'down', side: 'above' },
    { x: centeredX, y: target.bottom + gap, point: 'up', side: 'below' },
  ];
  const candidates = raw
    .map((candidate) => ({
      ...candidate,
      x: Math.max(left, Math.min(right - character.width, candidate.x)),
      y: Math.max(top, Math.min(bottom - character.height, candidate.y)),
    }))
    .filter((candidate) => {
      const box = rectAt(candidate.x, candidate.y, character);
      return (
        box.left >= left &&
        box.right <= right &&
        box.top >= top &&
        box.bottom <= bottom &&
        overlap(box, target) <= character.width * character.height * 0.04
      );
    });

  if (candidates.length) {
    const previous = options.previous;
    // On a desktop, prefer the actual side gutter whenever it fits. Travel distance used to
    // outweigh the small side bonus and could park Petros below a wide card, on top of the next
    // piece of lesson content.
    const horizontal = candidates.filter((candidate) => candidate.side === 'left' || candidate.side === 'right');
    const pool = viewport.width >= 921 && horizontal.length ? horizontal : candidates;
    const horizontalBonus = viewport.width >= 700 ? -36 : 0;
    return pool.sort((a, b) => {
      const score = (candidate: PetrosPlacement) => {
        const travel = previous
          ? Math.hypot(candidate.x - previous.x, candidate.y - previous.y)
          : 0;
        const horizontal = candidate.side === 'left' || candidate.side === 'right';
        return travel + (horizontal ? horizontalBonus : 0);
      };
      return score(a) - score(b);
    })[0]!;
  }

  // Very large targets (for example the whole learning page) have no outside edge inside the
  // viewport. Stay in a quiet lower corner and point into the content instead of covering its
  // centre or disappearing.
  return {
    x: Math.max(left, right - character.width),
    y: Math.max(top, bottom - character.height),
    point: 'up',
    side: 'free',
  };
}

/** The guide card lives opposite its target so it never hides the thing being indicated. */
export function petrosGuidePanelSide(target: RectLike, viewportWidth: number): 'left' | 'right' {
  return target.left + target.width / 2 > viewportWidth / 2 ? 'left' : 'right';
}

/** Keeps a compact speech bubble attached to Petros while avoiding the referenced target. */
export function calculatePetrosBubble(
  placement: PetrosPlacement,
  target: RectLike | null,
  viewport: Size,
  character: Size,
  bubble: Size,
  topInset = 8,
) {
  const edge = 10;
  const gap = 8;
  const characterRect = rectAt(placement.x, placement.y, character);
  const raw = [
    { x: placement.x + character.width / 2 - bubble.width / 2, y: placement.y - bubble.height - gap, tail: 'bottom' as const },
    { x: placement.x - bubble.width - gap, y: placement.y + Math.min(8, character.height - bubble.height), tail: 'right' as const },
    { x: placement.x + character.width + gap, y: placement.y + Math.min(8, character.height - bubble.height), tail: 'left' as const },
  ];
  const candidates = raw.map((candidate) => ({
    ...candidate,
    x: Math.max(edge, Math.min(viewport.width - bubble.width - edge, candidate.x)),
    y: Math.max(topInset + edge, Math.min(viewport.height - bubble.height - edge, candidate.y)),
  }));
  return candidates.sort((a, b) => {
    const score = (candidate: (typeof candidates)[number]) => {
      const box = rectAt(candidate.x, candidate.y, bubble);
      return overlap(box, characterRect) * 5 + (target ? overlap(box, target) * 12 : 0);
    };
    return score(a) - score(b);
  })[0]!;
}

export function petrosGutterPosition(target: DOMRect, content: DOMRect, viewport: { width: number; height: number }, topInset: number) {
  const size = 64;
  if (viewport.width < 921 || target.bottom < topInset || target.top > viewport.height - 70) return null;
  const y = Math.min(viewport.height - size - 20, Math.max(topInset + 8, target.top + target.height / 2 - size / 2));
  if (content.right + size + 12 <= viewport.width) return { x: content.right + 6, y, side: 'right' as const };
  if (content.left >= size + 12) return { x: content.left - size - 6, y, side: 'left' as const };
  // A narrow viewport keeps the character in its reserved dock, never over controls.
  return null;
}

export function petrosEntityTarget(entityType: string | null, entityId: string | null) {
  return entityType && entityId ? `entity:${entityType}:${entityId}` : null;
}
