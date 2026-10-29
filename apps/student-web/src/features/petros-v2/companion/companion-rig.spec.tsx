import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import manifest from '../../../../public/petros/v2/rig/candidate-rejected.json';
import { LayeredCharacter, boundedAmplitude, validateLayeredAsset } from './layered-character';
import { decodedAmplitude } from './use-amplitude-mouth';
import { targetIsVisible } from './companion-rig';
import type { CompanionVisual } from './companion-controller';
const visual: CompanionVisual = {
  intent: 'explaining',
  expression: 'neutral',
  gesture: 'settled',
  targetId: null,
  caption: 'Public explanation',
  eventId: null,
};
afterEach(cleanup);
describe('Archived rejected candidate — isolated asset checks only', () => {
  it('ships a hash-pinned complete master with verifiable facial and arm anchors', () => {
    const svg = readFileSync('public/petros/v2/rig/layers.svg', 'utf8');
    expect(validateLayeredAsset(svg)).toBe(true);
    expect(createHash('sha256').update(svg).digest('hex')).toBe(
      manifest.assets['layers.svg'].sha256,
    );
    expect(validateLayeredAsset(svg.replace('id="pupil-left"', 'id="missing"'))).toBe(false);
    expect(validateLayeredAsset(svg, { 'eye-left': [0, 0] })).toBe(false);
    expect(validateLayeredAsset(svg.replace('</svg>', '<script>alert(1)</script></svg>'))).toBe(
      false,
    );
  });
  it.each(['neutral', 'attentive', 'thoughtful', 'pleased', 'uncertain'] as const)(
    'keeps the %s expression in one coordinate system without painted duplicate faces',
    (expression) => {
      const { container } = render(
        <LayeredCharacter visual={{ ...visual, expression }} assetAvailable />,
      );
      expect(screen.getByRole('img')).toHaveAttribute('viewBox', '0 0 384 512');
      expect(container.querySelectorAll('use[href$="#head-shell"]')).toHaveLength(1);
      expect(
        container.querySelectorAll('use[href$="#mouth-closed"],use[href$="#mouth-pleased"]'),
      ).toHaveLength(1);
      expect(container.querySelector('img')).toBeNull();
    },
  );
  it('bounds invalid gaze geometry and never creates arbitrary SVG from a cue', () => {
    const { container } = render(
      <LayeredCharacter visual={visual} gaze={{ x: Infinity, y: 999 }} assetAvailable />,
    );
    expect(container.querySelector('use[href$="#pupil-left"]')).toHaveAttribute(
      'transform',
      'translate(0 3)',
    );
  });
  it.each(['open-hand', 'point', 'nod', 'acknowledge'] as const)(
    'renders a supported %s and settles under reduced motion',
    (gesture) => {
      const { container, rerender } = render(
        <LayeredCharacter visual={{ ...visual, gesture, targetId: 'target' }} assetAvailable />,
      );
      expect(container.querySelector('svg')).toHaveAttribute('data-gesture', gesture);
      rerender(
        <LayeredCharacter
          visual={{ ...visual, gesture: 'settled' }}
          reducedMotion
          assetAvailable
        />,
      );
      expect(container.querySelector('svg')).toHaveAttribute('data-blink', 'false');
      expect(container.querySelector('svg')).toHaveAttribute('data-mouth', 'closed');
    },
  );
  it('uses neutral fallback then a text alternative when both authored asset and fallback are missing', () => {
    render(<LayeredCharacter visual={visual} assetAvailable={false} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', '/petros/v2/rig/neutral.png');
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img')).toHaveTextContent('Petros');
  });
  it('never points at disconnected, non-finite, hidden, empty or off-screen target geometry', () => {
    const el = document.createElement('div');
    document.body.append(el);
    for (const rect of [
      new DOMRect(0, 0, 0, 0),
      new DOMRect(NaN, 0, 20, 20),
      new DOMRect(0, 9999, 20, 20),
    ])
      expect(targetIsVisible(el, rect)).toBe(false);
    el.hidden = true;
    expect(targetIsVisible(el, new DOMRect(10, 10, 20, 20))).toBe(false);
    el.remove();
    expect(targetIsVisible(el, new DOMRect(10, 10, 20, 20))).toBe(false);
  });
  it('rejects a partly obscured target even when its center is unobstructed', () => {
    const el = document.createElement('div'),
      cover = document.createElement('div');
    document.body.append(el, cover);
    const original = Object.getOwnPropertyDescriptor(document, 'elementsFromPoint');
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: (x: number) => (x < 15 ? [cover] : [el]),
    });
    try {
      expect(targetIsVisible(el, new DOMRect(10, 10, 100, 100))).toBe(false);
    } finally {
      if (original) Object.defineProperty(document, 'elementsFromPoint', original);
      else delete (document as unknown as Record<string, unknown>).elementsFromPoint;
      el.remove();
      cover.remove();
    }
  });
  it('opens only from measured audio energy and closes for silence, stop, missing analysis and reduced motion', () => {
    expect(decodedAmplitude([new Float32Array(1600)], 16000, 0.01)).toBe(0);
    expect(decodedAmplitude([new Float32Array(1600).fill(0.2)], 16000, 0.01)).toBeCloseTo(0.2);
    expect(boundedAmplitude(0.2, true, false)).toBe('wide');
    for (const args of [
      [0, true, false],
      [undefined, true, false],
      [0.2, false, false],
      [0.2, true, true],
      [NaN, true, false],
    ] as const)
      expect(boundedAmplitude(args[0], args[1], args[2])).toBe('closed');
  });
});

import { TeachingTargetRegistry } from '@/features/learning-studio/target-registry';
import { PresentationController } from '../presentation-controller';
import { TEACHING_FIXTURES } from '../playground/teaching-fixtures';
import { CompanionRig } from './companion-rig';
import type { CompanionEvent } from '@edrion/schemas';
it('reloads a previously displayed earned acknowledgment settled before the first visible frame', () => {
  const id = '10000000-0000-4000-8000-000000000001',
    now = Date.now();
  const c: CompanionEvent = {
    schemaVersion: 'petros.v2.companion-event.v1',
    eventId: 'already-shown',
    sessionId: id,
    revision: 1,
    epoch: 1,
    activityId: 'activity',
    activityRevision: 0,
    sourceRevisionId: id,
    sourceHash: 'a'.repeat(64),
    actionId: null,
    beatId: null,
    intent: 'responding',
    expression: 'pleased',
    gesture: 'acknowledge',
    targetId: null,
    utteranceId: 'public',
    caption: 'All checked parts passed.',
    assistancePolicy: 'committed_feedback',
    result: 'correct',
    priority: 60,
    issuedAt: now,
    expiresAt: now + 120000,
    acknowledgment: 'presentation-only',
  };
  sessionStorage.setItem(`petros-m6-displayed:${id}`, c.eventId);
  const p = new PresentationController(TEACHING_FIXTURES[0]!.timeline),
    state = p.getSnapshot();
  const { container } = render(
    <TeachingTargetRegistry>
      <CompanionRig
        cue={{ mode: 'waiting', gesture: 'neutral', targetId: null, caption: c.caption }}
        event={c}
        authority={{
          acceptedCue: c,
          sessionId: id,
          revision: 1,
          epoch: 1,
          activityRevision: 0,
          sourceRevisionId: id,
          sourceHash: c.sourceHash,
          assessment: false,
          committed: true,
        }}
        local={{
          interaction: 'idle',
          visibility: 'visible',
          paused: false,
          revoked: false,
          reducedMotion: false,
        }}
        canvas={state.canvas}
        state={state}
        reducedMotion={false}
      />
    </TeachingTargetRegistry>,
  );
  expect(container.querySelector('[aria-label="Petros companion"]')).toHaveAttribute(
    'data-gesture',
    'settled',
  );
  expect(container.querySelector('[data-rig]')).toHaveAttribute(
    'data-rig',
    'original-authored-poses',
  );
  expect(screen.getByRole('img')).toHaveAttribute('src', '/petros/states/petros-idle.png');
  expect(container.querySelector('[data-layered-character]')).toBeNull();
  sessionStorage.clear();
  p.dispose();
});

it('settles an incompatible thoughtful-plus-nod combination instead of exceeding head limits', () => {
  const { container } = render(
    <LayeredCharacter
      visual={{ ...visual, expression: 'thoughtful', gesture: 'nod' }}
      assetAvailable
    />,
  );
  expect(container.querySelector('[data-layered-character]')).toHaveAttribute(
    'data-gesture',
    'settled',
  );
});

it('uses a separately authored raised-hand clip for an admitted upward point', () => {
  const { container } = render(
    <LayeredCharacter
      visual={{ ...visual, gesture: 'point', targetId: 'target' }}
      gaze={{ x: 0, y: -3 }}
      assetAvailable
    />,
  );
  expect(container.querySelector('use[href$="#point-up"]')).toBeInTheDocument();
  expect(container.querySelector('[data-layered-character]')).toHaveAttribute(
    'data-gesture',
    'point',
  );
});
