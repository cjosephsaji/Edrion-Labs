import { describe, expect, it } from 'vitest';
import { companionPathIsSafe, planCompanionPlacement } from './companion-spatial';
const region = { x: 0, y: 0, width: 600, height: 220 };
const home = { x: 0, y: 0, width: 180, height: 180 };
const input = {
  region,
  home,
  viewportWidth: 1440,
  requested: 'EXPLAIN' as const,
  exclusions: [],
  studentInput: false,
  reducedMotion: false,
  supportsDockTransition: false,
  supportsWalking: false,
};
describe('measured companion anchors and honest travel fallback', () => {
  it('keeps the original raster at HOME when a distant EXPLAIN anchor requires missing walking art', () => {
    expect(planCompanionPlacement(input)).toMatchObject({
      anchor: 'HOME',
      reason: 'artwork-unavailable',
      destination: home,
      durationMs: 0,
    });
  });
  it('uses a fixed mobile dock and quiet student-edit placement without travel', () => {
    expect(planCompanionPlacement({ ...input, viewportWidth: 360 })).toMatchObject({
      anchor: 'DOCKED_MOBILE',
      durationMs: 0,
    });
    expect(planCompanionPlacement({ ...input, studentInput: true })).toMatchObject({
      anchor: 'QUIET',
      destination: home,
      durationMs: 0,
    });
  });
  it('rejects an answer-field crossing even when both endpoints are safe', () => {
    const to = { ...home, x: 420 };
    const answer = { x: 220, y: 0, width: 100, height: 180 };
    expect(companionPathIsSafe(home, to, region, [answer])).toBe(false);
    expect(
      planCompanionPlacement({
        ...input,
        requested: 'FOCUS_RIGHT',
        exclusions: [answer],
        supportsWalking: true,
      }),
    ).toMatchObject({ anchor: 'HOME', reason: 'unsafe-path' });
  });
  it('rejects covered destinations, malformed geometry and viewport overflow', () => {
    expect(planCompanionPlacement({ ...input, exclusions: [{ ...home, x: 200 }] }).reason).toBe(
      'unsafe-destination',
    );
    expect(companionPathIsSafe(home, { ...home, x: 900 }, region, [])).toBe(false);
    expect(companionPathIsSafe(home, { ...home, x: NaN }, region, [])).toBe(false);
    expect(companionPathIsSafe(home, home, region, [{ ...home, width: NaN }])).toBe(false);
  });
  it('derives short placement only when the required authored clip is accepted, and disables it under reduced motion', () => {
    const short = { ...input, region: { ...region, width: 240 }, supportsDockTransition: true };
    expect(planCompanionPlacement(short)).toMatchObject({
      anchor: 'EXPLAIN',
      destination: { ...home, x: 30 },
      durationMs: 350,
    });
    expect(planCompanionPlacement({ ...short, reducedMotion: true })).toMatchObject({
      anchor: 'HOME',
      durationMs: 0,
    });
  });
});
