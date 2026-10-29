export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface AvatarProjection {
  head: { x: number; y: number };
  feet: { x: number; y: number };
  visible: boolean;
}
export const intersects = (a: Rect, b: Rect, gap = 0) =>
  a.x < b.x + b.w + gap &&
  a.x + a.w + gap > b.x &&
  a.y < b.y + b.h + gap &&
  a.y + a.h + gap > b.y;
/** Inputs are all viewport coordinates, including the renderer's actual DOM offset. */
export function placeCloud(
  avatar: AvatarProjection,
  cloud: { w: number; h: number },
  safe: Rect,
  obstacles: Rect[],
) {
  const { head } = avatar;
  const gap = 14;
  const candidates = [
    { x: head.x + gap + 28, y: head.y - cloud.h / 2 },
    { x: head.x - cloud.w - gap - 28, y: head.y - cloud.h / 2 },
    { x: head.x - cloud.w / 2, y: head.y - cloud.h - gap },
  ];
  const fits = (r: Rect) =>
    r.x >= safe.x &&
    r.y >= safe.y &&
    r.x + r.w <= safe.x + safe.w &&
    r.y + r.h <= safe.y + safe.h &&
    !obstacles.some((o) => intersects(r, o, 8));
  const found = avatar.visible
    ? candidates.find((p) => fits({ ...p, ...cloud }))
    : undefined;
  return found
    ? {
        ...found,
        docked: false,
        side:
          found.x > head.x
            ? 'left'
            : found.x + cloud.w < head.x
              ? 'right'
              : 'bottom',
        vertical: head.y - found.y,
        tail: Math.max(18, Math.min(cloud.w - 18, head.x - found.x)),
      }
    : {
        x: safe.x + 12,
        y: safe.y + safe.h - cloud.h - 12,
        docked: true,
        side: 'bottom',
        vertical:0,
        tail: 0,
      };
}
