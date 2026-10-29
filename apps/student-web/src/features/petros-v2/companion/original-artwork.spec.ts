import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import manifest from '../../../../public/petros/v2/rig/manifest.json';
import type { CompanionVisual } from './companion-controller';
import { resolveOriginalEventPose, supportsRigCapability } from './companion-policy';
const visual: CompanionVisual = {
  intent: 'responding',
  expression: 'pleased',
  gesture: 'nod',
  targetId: null,
  caption: 'All checked parts passed.',
  eventId: 'current-committed-result',
};
const options = { assessmentSafe: false, reducedMotion: false, speaking: false };
describe('user-selected original Petros artwork', () => {
  it('preserves every original pose byte and declares only active capabilities', () => {
    for (const [pose, src] of Object.entries(manifest.poses)) {
      expect(
        createHash('sha256')
          .update(readFileSync(`public${src}`))
          .digest('hex'),
      ).toBe(manifest.assetInventory[pose as keyof typeof manifest.poses].sha256);
    }
    expect(manifest.renderer).toBe('original-authored-poses');
    for (const capability of [
      'layered-svg',
      'independent-eye-gaze',
      'facial-controls',
      'nod',
      'open-hand',
      'amplitude-mouth',
    ])
      expect(supportsRigCapability(capability)).toBe(false);
  });
  it.each(['nod', 'acknowledge', 'open-hand', 'lean'] as const)(
    'keeps unsupported %s proposals in the original neutral pose',
    (gesture) => {
      expect(resolveOriginalEventPose({ ...visual, gesture }, null, options)).toBe('neutral');
    },
  );
  it.each(['left', 'right', 'up', 'down'] as const)(
    'uses the original %s pointing pose only with an admitted target',
    (direction) => {
      const point = { ...visual, gesture: 'point' as const, targetId: 'accepted-visible-target' };
      expect(resolveOriginalEventPose(point, direction, options)).toBe(`point-${direction}`);
      expect(resolveOriginalEventPose({ ...point, targetId: null }, direction, options)).toBe(
        'neutral',
      );
      expect(resolveOriginalEventPose(point, direction, { ...options, reducedMotion: true })).toBe(
        'neutral',
      );
      expect(
        resolveOriginalEventPose(point, direction, {
          ...options,
          disabledCapabilities: ['directional-pointing'],
        }),
      ).toBe('neutral');
    },
  );
  it('keeps assessment, pause and revocation neutral even during audio playback', () => {
    expect(
      resolveOriginalEventPose(visual, null, { ...options, assessmentSafe: true, speaking: true }),
    ).toBe('neutral');
    for (const intent of ['paused', 'blocked'] as const)
      expect(
        resolveOriginalEventPose({ ...visual, intent }, null, { ...options, speaking: true }),
      ).toBe('neutral');
  });
  it('uses original processing, listening and static speech poses only for actual corresponding state', () => {
    expect(
      resolveOriginalEventPose(
        { ...visual, intent: 'processing', expression: 'thoughtful' },
        null,
        options,
      ),
    ).toBe('thinking');
    expect(resolveOriginalEventPose({ ...visual, intent: 'listening' }, null, options)).toBe(
      'listening',
    );
    expect(resolveOriginalEventPose(visual, null, { ...options, speaking: true })).toBe('speaking');
    expect(resolveOriginalEventPose(visual, null, options)).toBe('neutral');
  });
});
