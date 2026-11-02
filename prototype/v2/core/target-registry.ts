/** Primary grounding is exact application IDs. No guessed model-generated pixel coordinates. */
export function targetElement(
  id: string,
  root: ParentNode = document,
): Element | null {
  const candidates = Array.from(
    root.querySelectorAll('[data-petros-id]'),
  ).filter((e) => e.getAttribute('data-petros-id') === id);
  return (
    candidates.find(
      (e) =>
        e.hasAttribute('data-world-anchor') &&
        e.getBoundingClientRect().width > 0,
    ) ??
    candidates.find((e) => {
      const r = e.getBoundingClientRect();
      return (
        e.closest('[data-testid="regular-learning-model"]') &&
        r.width > 0 &&
        r.height > 0
      );
    }) ??
    candidates.find((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }) ??
    null
  );
}
export function targetBounds(id: string, root: ParentNode = document) {
  const e = targetElement(id, root);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return r.width > 0 &&
    r.height > 0 &&
    r.right > 0 &&
    r.bottom > 0 &&
    r.left < innerWidth &&
    r.top < innerHeight
    ? { x: r.x, y: r.y, width: r.width, height: r.height }
    : null;
}
