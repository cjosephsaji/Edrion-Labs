import { describe, expect, it } from 'vitest';
import { validatePresentationTimeline } from './timeline';
import { sampleAction } from './test-fixture';

const timeline = { schemaVersion: 'petros.v2.timeline.v1', mode: 'public_fixture', id: 'fixture-timeline', activityId: 'fixture-activity', branchId: 'fixture-practice',
  beats: [{ id: 'beat-1', action: sampleAction, reveal: 'progressive', accessibleAlternative: 'Read the public passage.', completion: 'text-step' }] };
describe('one bounded presentation timeline', () => {
  it('validates actual semantic targets before cue delivery', () => expect(validatePresentationTimeline(timeline).beats).toHaveLength(1));
  it('rejects missing targets and wrong action/branch bindings', () => {
    expect(() => validatePresentationTimeline({ ...timeline, beats: [{ ...timeline.beats[0], action: { ...sampleAction, cue: { ...sampleAction.cue, targetId: 'unknown' } } }] })).toThrow('Unavailable');
    expect(() => validatePresentationTimeline({ ...timeline, branchId: 'foreign' })).toThrow('binding');
  });
  it('rejects duplicate IDs, unsupported barriers, and aggregate payload overflow', () => {
    expect(() => validatePresentationTimeline({ ...timeline, beats: [...timeline.beats, ...timeline.beats] })).toThrow();
    expect(() => validatePresentationTimeline({ ...timeline, beats: [{ ...timeline.beats[0], completion: 'student-response' }] })).toThrow('barrier');
    expect(() => validatePresentationTimeline({ ...timeline, extra: 'x'.repeat(64000) })).toThrow('budget');
  });
});
