import { describe, expect, it } from 'vitest';
import type { M4Snapshot } from '@edrion/schemas';
import { ClassicCloudController, classicScope } from './classic-cloud-controller';
import { classicFixture, id, now, local } from './classic-cloud.fixture';
describe('Classic clouds under existing M6 authority', () => {
  it('uses the admitted public caption for a non-allocation activity without inferring correctness', () => {
    const { snapshot: s } = classicFixture();
    s.canvas!.elements = [];
    s.companion!.caption = 'Inspect the quoted evidence.';
    expect(new ClassicCloudController().update(s, local, now).cloud?.text).toBe(
      'Inspect the quoted evidence.',
    );
    s.task = { helpPolicy: 'no_hints' } as M4Snapshot['task'];
    expect(new ClassicCloudController().update(s, local, now).cloud).toBeNull();
  });
  it('keeps explicitly requested content available through typing and still invalidates its authority', () => {
    const { snapshot: s } = classicFixture(),
      c = new ClassicCloudController();
    const help = {
      id: 'requested',
      scope: classicScope(s),
      epoch: s.epoch,
      text: s.lesson!.explanation,
      expiresAt: now + 30000,
    };
    expect(c.update(s, local, now, help).cloud?.kind).toBe('thought');
    expect(c.update(s, { ...local, interaction: 'typing' }, now + 100, help).cloud?.kind).toBe(
      'thought',
    );
    expect(c.update(s, local, now + 200, help).cloud?.text).toBe(help.text);
    expect(c.update(s, { ...local, revoked: true }, now + 300, help).cloud).toBeNull();
  });
  it('restores only presentation identity and does not replay a displayed cue on reload', () => {
    const { snapshot: s } = classicFixture(0, 'predicted'),
      first = new ClassicCloudController();
    const shown = first.update(s, local, now).cloud!;
    const recovered = new ClassicCloudController();
    recovered.settle(classicScope(s), shown.id);
    expect(recovered.update(s, local, now + 100).cloud).toBeNull();
  });
  it('does not expose requested source help during an independent no-hints task', () => {
    const { snapshot: s } = classicFixture();
    s.task = { helpPolicy: 'no_hints' } as M4Snapshot['task'];
    const help = {
      id: 'forged-help',
      scope: classicScope(s),
      epoch: s.epoch,
      text: s.lesson!.explanation,
      expiresAt: now + 10000,
    };
    expect(new ClassicCloudController().update(s, local, now, help).cloud).toBeNull();
  });
  it('invalidates requested help when a new task instance replaces the teaching checkpoint', () => {
    const { snapshot: s } = classicFixture(),
      c = new ClassicCloudController();
    const help = {
      id: 'requested',
      scope: classicScope(s),
      epoch: s.epoch,
      text: s.lesson!.explanation,
      expiresAt: now + 30000,
    };
    expect(c.update(s, local, now, help).cloud?.kind).toBe('thought');
    s.task = { taskId: id(12), helpPolicy: 'assisted_practice' } as M4Snapshot['task'];
    s.assistance = 'assisted';
    expect(c.update(s, local, now + 100, help).cloud).toBeNull();
  });
  it('delays an authorized introduction once and expires without replay on rerender', () => {
    const { snapshot: s } = classicFixture(),
      c = new ClassicCloudController();
    expect(c.update(s, local, now).cloud).toBeNull();
    expect(c.update(s, local, now + 700).cloud?.kind).toBe('speech');
    expect(c.update(s, local, now + 4700).cloud).toBeNull();
    expect(c.update(s, local, now + 4800).cloud).toBeNull();
  });
  it('acknowledges committed predictions, with no correctness disclosure, and supports manual dismissal', () => {
    const { snapshot: s } = classicFixture(0, 'predicted'),
      c = new ClassicCloudController();
    expect(c.update(s, local, now).cloud?.text).toBe("Let's test your prediction.");
    c.dismiss();
    expect(c.update(s, local, now + 200).cloud).toBeNull();
  });
  it.each([0, 1, 2, 3, 4, 5])('leaves accepted allocation %s quiet', (count) => {
    const { snapshot: s } = classicFixture(count, 'observed');
    expect(new ClassicCloudController().update(s, local, now).cloud).toBeNull();
  });
  it('reports a real refusal with actual requested and remaining values', () => {
    const { snapshot: s, resource } = classicFixture(6, 'observed');
    const value = new ClassicCloudController().update(s, local, now).cloud;
    expect(value?.kind).toBe('notice');
    expect(value?.text).toBe('No room left. This VM needs 8 GB, but only 0 GB is available.');
    expect(resource.allocatedCount).toBe(6);
  });
  it('uses authorized requested help, persists it, and rejects altered or expired content', () => {
    const { snapshot: s } = classicFixture(),
      c = new ClassicCloudController();
    const help = {
      id: 'requested-help',
      scope: classicScope(s),
      epoch: s.epoch,
      text: s.lesson!.explanation,
      expiresAt: now + 90000,
    };
    expect(c.update(s, local, now, help).cloud?.kind).toBe('thought');
    expect(c.update(s, local, now + 30000, help).cloud?.text).toBe(help.text);
    expect(c.update(s, local, now + 90001, help).cloud?.kind).not.toBe('thought');
    expect(
      new ClassicCloudController().update(s, local, now, { ...help, text: 'fabricated answer' })
        .cloud?.kind,
    ).not.toBe('thought');
  });
  it.each([
    'typing',
    'revoked',
    'paused',
    'hidden',
    'foreign',
    'source',
    'epoch',
    'revision',
    'expired',
  ])('rejects %s presentation', (reason) => {
    const { snapshot: s } = classicFixture(6, 'observed'),
      c = new ClassicCloudController();
    const state = { ...local };
    if (reason === 'typing') state.interaction = 'typing' as 'idle';
    if (reason === 'revoked') state.revoked = true;
    if (reason === 'paused') state.paused = true;
    if (reason === 'hidden') state.visibility = 'hidden' as 'visible';
    if (reason === 'foreign') s.id = id(8);
    if (reason === 'source') s.companion!.sourceHash = 'b'.repeat(64);
    if (reason === 'epoch') s.epoch++;
    if (reason === 'revision') s.revision++;
    expect(c.update(s, state, reason === 'expired' ? now + 120001 : now).cloud).toBeNull();
  });
  it('does not consume a confirmed cue while mutation reconciliation is pending', () => {
    const { snapshot: s } = classicFixture(0, 'predicted'),
      c = new ClassicCloudController();
    expect(c.update(s, { ...local, pendingOperation: true }, now).cloud).toBeNull();
    expect(c.update(s, local, now + 100).cloud).not.toBeNull();
  });
  it('replaces an obsolete refusal with the current explanation prompt and ignores the former deadline', () => {
    const { snapshot: s, resource } = classicFixture(6, 'observed'),
      c = new ClassicCloudController();
    c.update(s, local, now);
    const a = resource as import('@edrion/schemas').ResourceAllocation;
    const prompt = c.update(s, local, now + 4000, null, a.activeAttemptId);
    expect(prompt.cloud?.kind).toBe('speech');
    expect(prompt.nextAt).toBe(now + 7800);
    expect(c.update(s, local, now + 6001, null, a.activeAttemptId).cloud?.kind).toBe('speech');
  });
});
