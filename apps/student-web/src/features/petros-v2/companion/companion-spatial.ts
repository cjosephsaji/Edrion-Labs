/** Spatial policy for the existing reserved companion harbor. It never chooses
 * a teaching action, changes the canvas, scrolls, or invents locomotion. */
export type CompanionAnchor =
  | 'HOME'
  | 'EXPLAIN'
  | 'FOCUS_LEFT'
  | 'FOCUS_RIGHT'
  | 'QUIET'
  | 'DOCKED_MOBILE';
export type SafeRect = { x: number; y: number; width: number; height: number };
export type SpatialPlan = {
  anchor: CompanionAnchor;
  requested: CompanionAnchor;
  destination: SafeRect;
  durationMs: number;
  reason:
    | 'settled'
    | 'mobile-dock'
    | 'student-input'
    | 'unsafe-destination'
    | 'unsafe-path'
    | 'artwork-unavailable';
};
const finite = (r: SafeRect) =>
  [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0;
const inside = (a: SafeRect, b: SafeRect) =>
  finite(a) &&
  finite(b) &&
  a.x >= b.x &&
  a.y >= b.y &&
  a.x + a.width <= b.x + b.width &&
  a.y + a.height <= b.y + b.height;
const overlaps = (a: SafeRect, b: SafeRect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** Exact swept axis-aligned bounds, conservatively including the entire cloud
 * footprint. A diagonal shortcut may reject a safe route; it cannot cross an
 * answer field merely because both endpoints fit. */
export function companionPathIsSafe(
  from: SafeRect,
  to: SafeRect,
  region: SafeRect,
  exclusions: readonly SafeRect[],
) {
  if (!inside(from, region) || !inside(to, region) || exclusions.some((r) => !finite(r)))
    return false;
  const swept = {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.max(from.x + from.width, to.x + to.width) - Math.min(from.x, to.x),
    height: Math.max(from.y + from.height, to.y + to.height) - Math.min(from.y, to.y),
  };
  return !exclusions.some((r) => overlaps(swept, r));
}

export function planCompanionPlacement(input: {
  region: SafeRect;
  home: SafeRect;
  viewportWidth: number;
  requested: CompanionAnchor;
  exclusions: readonly SafeRect[];
  studentInput: boolean;
  reducedMotion: boolean;
  // These must come from the active, visually accepted artwork manifest.
  supportsDockTransition: boolean;
  supportsWalking: boolean;
}): SpatialPlan {
  const { region, home } = input;
  const rest = (anchor: CompanionAnchor, reason: SpatialPlan['reason']): SpatialPlan => ({
    anchor,
    requested: input.requested,
    destination: home,
    durationMs: 0,
    reason,
  });
  if (input.viewportWidth <= 760) return rest('DOCKED_MOBILE', 'mobile-dock');
  if (input.studentInput) return rest('QUIET', 'student-input');
  if (input.requested === 'HOME' || input.requested === 'QUIET')
    return rest(input.requested, 'settled');
  if (!finite(region) || !inside(home, region)) return rest('HOME', 'unsafe-destination');
  const right = region.x + region.width - home.width;
  const anchors = {
    EXPLAIN: { ...home, x: region.x + (region.width - home.width) / 2 },
    FOCUS_LEFT: { ...home, x: region.x },
    FOCUS_RIGHT: { ...home, x: right },
    DOCKED_MOBILE: home,
  };
  const destination = anchors[input.requested];
  if (
    !inside(destination, region) ||
    input.exclusions.some((r) => !finite(r) || overlaps(destination, r))
  )
    return rest('HOME', 'unsafe-destination');
  if (!companionPathIsSafe(home, destination, region, input.exclusions))
    return rest('HOME', 'unsafe-path');
  const distance = Math.hypot(destination.x - home.x, destination.y - home.y);
  if (
    input.reducedMotion ||
    (distance > home.width / 2 ? !input.supportsWalking : !input.supportsDockTransition)
  )
    return rest('HOME', 'artwork-unavailable');
  return {
    anchor: input.requested,
    requested: input.requested,
    destination,
    durationMs: distance === 0 ? 0 : 350,
    reason: 'settled',
  };
}
