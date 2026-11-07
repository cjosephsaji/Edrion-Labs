import { CatmullRomCurve3, type Vector3 } from 'three';
/** Shared by World travel and Stage focus; callers own and cancel their tween. */
export function cameraSpline(from: Vector3, end: Vector3, liftLimit = 5) {
  const middle = from.clone().lerp(end, 0.5);
  middle.y =
    Math.max(from.y, end.y) + Math.min(liftLimit, from.distanceTo(end) * 0.12);
  return new CatmullRomCurve3([
    from,
    from.clone().lerp(middle, 0.65),
    middle,
    end.clone().lerp(middle, 0.22),
    end,
  ]);
}
