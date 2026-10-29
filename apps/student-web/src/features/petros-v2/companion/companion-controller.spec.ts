import { describe, expect, it } from 'vitest';
import { PresentationController } from '../presentation-controller';
import { TEACHING_FIXTURES } from '../playground/teaching-fixtures';
import { resolveCompanionCue } from './companion-controller';
import { resolveSupportedPose, supportsRigCapability } from './companion-policy';

describe('one cue owner and current-art fallback', () => {
  it('binds instruction and gesture to the same accepted action and yields during student input', () => {
    const controller = new PresentationController(TEACHING_FIXTURES[1]!.timeline);
    controller.play();
    const state = controller.getSnapshot(),
      beat = controller.timeline.beats[state.index]!;
    const cue = resolveCompanionCue(state, beat.action.cue);
    expect(cue.targetId).toBe(state.canvas.highlightedIds[0]);
    expect(resolveSupportedPose(cue, state.canvas, 'right')).toBe('point-right');
    expect(resolveCompanionCue(state, cue, true).mode).toBe('listening');
    controller.interrupt();
    expect(resolveCompanionCue(controller.getSnapshot(), cue).gesture).toBe('neutral');
    controller.dispose();
  });
  it('does not invent unsupported eyes, handwriting, precise pointing or missing-target poses', () => {
    const controller = new PresentationController(TEACHING_FIXTURES[0]!.timeline),
      canvas = controller.getSnapshot().canvas;
    expect(supportsRigCapability('writing-pose')).toBe(false);
    expect(supportsRigCapability('independent-eye-gaze')).toBe(false);
    expect(
      resolveSupportedPose(
        { mode: 'teaching', gesture: 'point-right', targetId: 'missing', caption: 'Example' },
        canvas,
        'right',
      ),
    ).toBe('neutral');
    expect(
      resolveSupportedPose(
        { mode: 'waiting', gesture: 'point-right', targetId: null, caption: 'Take your time' },
        canvas,
        null,
      ),
    ).toBe('neutral');
  });
});

import {
  CompanionController,
  type CompanionAuthority,
  type CompanionLocalState,
} from './companion-controller';
import type { CompanionEvent } from '@edrion/schemas';
const sessionId = '10000000-0000-4000-8000-000000000001';
function m6() {
  const cue: CompanionEvent = {
    schemaVersion: 'petros.v2.companion-event.v1',
    eventId: 'event-1',
    sessionId,
    revision: 2,
    epoch: 3,
    activityId: 'activity',
    activityRevision: 4,
    sourceRevisionId: sessionId,
    sourceHash: 'a'.repeat(64),
    actionId: sessionId,
    beatId: 'beat-1',
    intent: 'demonstrating',
    expression: 'attentive',
    gesture: 'point',
    targetId: 'node',
    utteranceId: 'public-1',
    caption: 'Public source explanation',
    assistancePolicy: 'public_teaching',
    result: 'none',
    priority: 40,
    issuedAt: 1000,
    expiresAt: 121000,
    acknowledgment: 'presentation-only',
  };
  const authority: CompanionAuthority = {
    sessionId,
    revision: 2,
    epoch: 3,
    activityRevision: 4,
    sourceRevisionId: sessionId,
    sourceHash: 'a'.repeat(64),
    assessment: false,
    committed: false,
  };
  const local: CompanionLocalState = {
    interaction: 'idle',
    visibility: 'visible',
    paused: false,
    revoked: false,
    reducedMotion: false,
  };
  return { cue, authority, local, owner: new CompanionController() };
}
describe('M6 public event admission and interruption', () => {
  it('keeps a live save neutral without describing a pause or consuming the newly acknowledged cue', () => {
    const f = m6();
    expect(
      f.owner.resolve(f.cue, f.authority, { ...f.local, pendingOperation: true }, 2000, 'node'),
    ).toMatchObject({ expression: 'neutral', caption: 'Saving your change…', gesture: 'settled' });
    expect(f.owner.resolve(f.cue, f.authority, f.local, 2050, 'node').attentionPhase).toBe('look');
  });
  it('rejects a same-revision cue belonging to another activity', () => {
    const f = m6();
    expect(
      f.owner.resolve(f.cue, { ...f.authority, activityId: 'different' }, f.local, 2000, 'node')
        .caption,
    ).toBe('');
  });
  it('cancels an active target gesture when the element is deleted and never replays it on re-registration', () => {
    const f = m6();
    f.owner.resolve(f.cue, f.authority, f.local, 2000, 'node');
    expect(f.owner.resolve(f.cue, f.authority, f.local, 2200, 'node').gesture).toBe('point');
    expect(f.owner.resolve(f.cue, f.authority, f.local, 2250, null).targetId).toBe(null);
    expect(f.owner.resolve(f.cue, f.authority, f.local, 2300, 'node').gesture).toBe('settled');
  });
  it.each([
    'sessionId',
    'revision',
    'epoch',
    'activityRevision',
    'sourceRevisionId',
    'sourceHash',
  ] as const)('fails closed on foreign or stale %s', (field) => {
    const f = m6();
    const bad = { ...f.cue, [field]: typeof f.cue[field] === 'number' ? 99 : 'foreign' };
    expect(f.owner.resolve(bad, f.authority, f.local, 2000, 'node')).toMatchObject({
      gesture: 'settled',
      targetId: null,
      expression: 'neutral',
      caption: '',
    });
  });
  it.each([
    { expiresAt: 1500 },
    { issuedAt: 50000, expiresAt: 60000 },
    { gesture: 'write' },
    { expression: 'angry' },
    { x: 23 },
    { privateRubric: 'hidden' },
  ])('rejects expired, future, unsupported and forged cue %j', (extra) => {
    const f = m6();
    expect(
      f.owner.resolve({ ...f.cue, ...extra }, f.authority, f.local, 2000, 'node').caption,
    ).toBe('');
  });
  it.each(['typing', 'dragging', 'listening'] as const)(
    'immediately yields and consumes a cue during %s',
    (interaction) => {
      const f = m6();
      expect(
        f.owner.resolve(f.cue, f.authority, { ...f.local, interaction }, 2000, 'node').gesture,
      ).toBe('settled');
      expect(f.owner.resolve(f.cue, f.authority, f.local, 3000, 'node').gesture).toBe('settled');
    },
  );
  it.each([{ paused: true }, { revoked: true }, { visibility: 'hidden' as const }])(
    'revokes the pose for %j',
    (extra) => {
      const f = m6();
      f.owner.resolve(f.cue, f.authority, f.local, 2000, 'node');
      expect(
        f.owner.resolve(f.cue, f.authority, { ...f.local, ...extra }, 2001, 'node'),
      ).toMatchObject({ gesture: 'settled', targetId: null });
    },
  );
  it('retains readable text after settling without replaying duplicate gestures', () => {
    const f = m6();
    expect(f.owner.resolve(f.cue, f.authority, f.local, 2000, 'node').attentionPhase).toBe('look');
    expect(f.owner.resolve(f.cue, f.authority, f.local, 2200, 'node').gesture).toBe('point');
    expect(f.owner.resolve(f.cue, f.authority, f.local, 3200, 'node')).toMatchObject({
      gesture: 'settled',
      caption: f.cue.caption,
    });
    expect(f.owner.resolve(f.cue, f.authority, f.local, 40000, 'node').gesture).toBe('settled');
  });
  it('does not point or gaze at hidden/deleted/off-screen targets', () => {
    const f = m6();
    expect(f.owner.resolve(f.cue, f.authority, f.local, 2000, null)).toMatchObject({
      targetId: null,
      gesture: 'settled',
    });
  });
  it('preserves assessment neutrality even for a forged current success event', () => {
    const f = m6();
    expect(
      f.owner.resolve(
        {
          ...f.cue,
          expression: 'pleased',
          gesture: 'nod',
          result: 'correct',
          assistancePolicy: 'committed_feedback',
        },
        { ...f.authority, assessment: true },
        f.local,
        2000,
        'node',
      ),
    ).toMatchObject({ expression: 'neutral', targetId: null, gesture: 'settled' });
  });
  it('requires committed success and rate-limits distinct repeated points', () => {
    const f = m6();
    expect(
      f.owner.resolve(
        {
          ...f.cue,
          expression: 'pleased',
          gesture: 'nod',
          result: 'correct',
          assistancePolicy: 'committed_feedback',
        },
        f.authority,
        f.local,
        2000,
        'node',
      ).expression,
    ).toBe('neutral');
    f.owner.resolve(f.cue, f.authority, f.local, 3000, 'node');
    expect(
      f.owner.resolve({ ...f.cue, eventId: 'new' }, f.authority, f.local, 4000, 'node').gesture,
    ).toBe('settled');
  });
  it('reload recovery and reduced motion settle without duplicate academic operations', () => {
    const f = m6();
    const original = structuredClone(f.cue);
    f.owner.settle(f.cue.eventId);
    expect(f.owner.resolve(f.cue, f.authority, f.local, 2000, 'node').gesture).toBe('settled');
    expect(
      new CompanionController().resolve(
        f.cue,
        f.authority,
        { ...f.local, reducedMotion: true },
        2000,
        'node',
      ).gesture,
    ).toBe('settled');
    expect(f.cue).toEqual(original);
  });
});

it('rejects an injected current-looking event that differs from the authoritative snapshot cue', () => {
  const f = m6();
  expect(
    f.owner.resolve(
      { ...f.cue, eventId: 'forged', caption: 'Invented public teaching' },
      { ...f.authority, acceptedCue: f.cue },
      f.local,
      2000,
      'node',
    ),
  ).toMatchObject({ caption: '', targetId: null, gesture: 'settled' });
});

it('keeps the verification face neutral while an answer is being typed', () => {
  const f = m6();
  expect(
    f.owner.resolve(
      f.cue,
      { ...f.authority, assessment: true },
      { ...f.local, interaction: 'typing' },
      2000,
      'node',
    ),
  ).toMatchObject({ expression: 'neutral', gesture: 'settled', targetId: null });
});

it('waits for newly registered geometry, then enacts look → gesture → highlight → settle from admission time', () => {
  const f = m6();
  expect(f.owner.resolve(f.cue, f.authority, f.local, 2000, null).gesture).toBe('settled');
  expect(f.owner.resolve(f.cue, f.authority, f.local, 2050, 'node')).toMatchObject({
    gesture: 'settled',
    targetId: 'node',
    attentionPhase: 'look',
    nextAt: 2210,
  });
  expect(f.owner.resolve(f.cue, f.authority, f.local, 2220, 'node')).toMatchObject({
    gesture: 'point',
    attentionPhase: 'gesture',
  });
  expect(f.owner.resolve(f.cue, f.authority, f.local, 2480, 'node')).toMatchObject({
    gesture: 'point',
    attentionPhase: 'highlight',
  });
  expect(f.owner.resolve(f.cue, f.authority, f.local, 3200, 'node')).toMatchObject({
    gesture: 'settled',
    targetId: null,
  });
});
