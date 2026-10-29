import { afterEach, describe, expect, it, vi } from 'vitest';
import { PresentationController, type LocalNarrationSegment } from '../presentation-controller';
import { TEACHING_FIXTURES } from './teaching-fixtures';
class Player extends EventTarget {
  currentTime = 0; duration = 10;
  play = vi.fn(() => Promise.resolve()); pause = vi.fn(); load = vi.fn(); removeAttribute = vi.fn();
  canPlayType = vi.fn(() => 'probably');
  emit(event: string) { this.dispatchEvent(new Event(event)); }
}
function setup() {
  const controller = new PresentationController(TEACHING_FIXTURES[1]!.timeline), players: Player[] = [];
  const segment: LocalNarrationSegment = { beatId: controller.timeline.beats[0]!.id, src: '/petros/audio/approved-example.wav', mimeType: 'audio/wav', provenance: 'approved-local-fixture' };
  controller.configureNarration([segment], () => { const p = new Player(); players.push(p); return p as unknown as HTMLAudioElement; });
  return { controller, players, segment };
}
afterEach(() => vi.useRealTimers());
describe('actual playback on the one presentation owner', () => {
  it('pauses and resumes the same audition without another player or teaching progress, then fences stop', () => {
    vi.useFakeTimers(); const { controller, players } = setup();
    const epoch = controller.prepareVoicePreview('Public sample.');
    controller.playVoicePreview({ dataBase64: 'AAAA', mimeType: 'audio/wav', caption: 'Public sample.' }, epoch);
    const p = players[0]!; p.emit('playing'); p.currentTime = 2; p.emit('timeupdate');
    const before = controller.getSnapshot(); controller.pauseVoicePreview();
    expect(p.pause).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    expect(controller.getSnapshot().speech).toMatchObject({ phase: 'text', currentTime: 2, preview: { paused: true } });
    p.emit('playing'); p.emit('waiting'); p.emit('timeupdate');
    expect(controller.getSnapshot().speech.phase).toBe('text');
    controller.resumeVoicePreview(); controller.resumeVoicePreview();
    expect(players).toHaveLength(1); expect(p.play).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().speech.phase).toBe('loading');
    p.emit('playing'); expect(controller.getSnapshot().speech.phase).toBe('speaking');
    expect(controller.getSnapshot()).toMatchObject({ epoch, progress: before.progress, canvas: before.canvas });
    controller.stopVoicePreview(); const stopped = controller.getSnapshot();
    p.emit('playing'); p.emit('ended'); p.emit('error'); expect(controller.getSnapshot()).toEqual(stopped);
    controller.dispose(); expect(vi.getTimerCount()).toBe(0);
  });
  it('shares audition audio ownership, reports actual media state and never advances a teaching checkpoint', () => {
    vi.useFakeTimers(); const { controller, players } = setup(); controller.play();
    const narration = players[0]!; narration.emit('playing'); narration.currentTime=3; narration.emit('timeupdate');
    const before = controller.getSnapshot(), epoch = controller.prepareVoicePreview('Your place is saved.');
    expect(narration.pause).toHaveBeenCalled();
    const sample = { dataBase64: 'AAAA', mimeType: 'audio/wav' as const, caption: 'Your place is saved.' };
    expect(controller.playVoicePreview(sample, epoch)).toBe(true);
    expect(controller.playVoicePreview(sample, epoch)).toBe(false);
    const audition = players[1]!; audition.emit('loadedmetadata'); expect(controller.getSnapshot().speech.phase).toBe('loading');
    audition.emit('playing'); audition.currentTime=6; audition.emit('timeupdate');
    expect(controller.getSnapshot()).toMatchObject({ progress: before.progress, status: 'interrupted', speech: { phase: 'speaking', currentTime: 6, preview: { caption: sample.caption } } });
    expect(controller.getSnapshot().canvas).toEqual(before.canvas);
    audition.emit('waiting'); expect(controller.getSnapshot().speech.phase).toBe('stalled');
    audition.emit('playing'); audition.emit('ended'); expect(controller.getSnapshot().speech).toMatchObject({ phase: 'text' });
    expect(controller.getSnapshot().speech.preview).toBeUndefined();
    controller.resume(); const resumed = players[2]!; resumed.emit('loadedmetadata'); expect(resumed.currentTime).toBe(3);
    controller.dispose(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['pause', 'interrupt', 'step', 'restart', 'dispose'] as const)('fences audition callbacks on %s', action => {
    vi.useFakeTimers(); const { controller, players } = setup(); const epoch = controller.prepareVoicePreview('A public sample.');
    controller.playVoicePreview({ dataBase64:'AAAA', mimeType:'audio/wav', caption:'A public sample.' }, epoch);
    const p=players[0]!; p.emit('playing'); controller[action](); const before=controller.getSnapshot();
    p.emit('playing'); p.emit('ended'); p.emit('error'); expect(controller.getSnapshot()).toEqual(before);
    expect(p.pause).toHaveBeenCalled(); expect(controller.getSnapshot().speech.phase).toBe('text'); controller.dispose();
  });
  it('rejects stale audition responses and recovers failed audio while preserving a completed lesson', () => {
    vi.useFakeTimers(); const { controller, players }=setup(); const epoch=controller.prepareVoicePreview('Public text.'); controller.interrupt();
    expect(controller.playVoicePreview({ dataBase64:'AAAA', mimeType:'audio/wav', caption:'Public text.' },epoch)).toBe(false);
    const next=controller.prepareVoicePreview('Public text.'); controller.playVoicePreview({dataBase64:'AAAA',mimeType:'audio/wav',caption:'Public text.'},next);
    vi.advanceTimersByTime(12000); expect(controller.getSnapshot().speech).toMatchObject({phase:'text',reason:expect.stringContaining('unavailable')}); expect(players[0]!.pause).toHaveBeenCalled();
    for(let i=0;i<controller.timeline.beats.length;i++) { if(controller.getSnapshot().status==='awaiting_response') controller.submit(()=> 'Public fixture.'); controller.step(); }
    if(controller.getSnapshot().status==='awaiting_response') controller.submit(()=> 'Public fixture.'); controller.step();
    expect(controller.getSnapshot().status).toBe('complete'); const completed=controller.getSnapshot().canvas;
    const final=controller.prepareVoicePreview('Done.'); controller.playVoicePreview({dataBase64:'AAAA',mimeType:'audio/wav',caption:'Done.'},final); controller.interrupt();
    expect(controller.getSnapshot().status).toBe('complete'); expect(controller.getSnapshot().canvas).toEqual(completed); expect(controller.getSnapshot().speech.preview).toBeUndefined(); controller.dispose();
  });
  it('uses playing and timeupdate, holds one semantic caption, and freezes the canvas during a stall', () => {
    vi.useFakeTimers(); const { controller, players } = setup(); controller.play(); const p = players[0]!;
    expect(controller.getSnapshot().speech.phase).toBe('loading'); p.emit('loadedmetadata'); p.emit('canplay');
    vi.advanceTimersByTime(3000); expect(controller.getSnapshot().progress).toBe(0);
    p.emit('playing'); p.currentTime = 3; p.emit('timeupdate'); expect(controller.getSnapshot().progress).toBe(.3);
    const cue = controller.timeline.beats[controller.getSnapshot().index]!.action.cue.caption;
    p.emit('waiting'); p.currentTime = 6; p.emit('timeupdate'); vi.advanceTimersByTime(1000);
    expect(controller.getSnapshot()).toMatchObject({ progress: .3, speech: { phase: 'stalled' } });
    expect(controller.timeline.beats[controller.getSnapshot().index]!.action.cue.caption).toBe(cue);
    p.emit('playing'); p.emit('timeupdate'); expect(controller.getSnapshot().progress).toBe(.6);
    p.emit('ended'); expect(controller.getSnapshot().progress).toBe(1); expect(p.pause).toHaveBeenCalled(); controller.dispose();
  });
  it('interrupts immediately, ignores stale media callbacks and resumes the same audio position without duplicate operations', () => {
    vi.useFakeTimers(); const { controller, players } = setup(); controller.play(); const p = players[0]!;
    p.emit('playing'); p.currentTime = 4; p.emit('timeupdate'); const prior = controller.getSnapshot(); controller.interrupt();
    expect(p.pause).toHaveBeenCalled(); p.emit('ended'); p.emit('playing'); p.emit('timeupdate');
    expect(controller.getSnapshot()).toMatchObject({ progress: .4, status: 'interrupted', speech: { phase: 'text' } });
    controller.resume(); const next = players[1]!; next.emit('loadedmetadata'); expect(next.currentTime).toBe(4);
    expect(controller.getSnapshot().canvas.completedActionIds).toEqual(prior.canvas.completedActionIds);
    next.emit('playing'); next.currentTime=5; next.emit('timeupdate'); expect(controller.getSnapshot().progress).toBe(.5); controller.dispose();
  });
  it.each(['error', 'timeout', 'autoplay'])('recovers %s with explicit text mode and retains the acknowledged prefix', async kind => {
    vi.useFakeTimers(); const { controller, players } = setup();
    if (kind === 'autoplay') { controller.configureNarration([{ beatId:controller.timeline.beats[0]!.id,src:'/petros/audio/approved-example.wav',mimeType:'audio/wav',provenance:'approved-local-fixture' }], () => {
      const p = new Player(); p.play.mockRejectedValue(new Error('NotAllowedError')); players.push(p); return p as unknown as HTMLAudioElement;
    }); }
    controller.play(); const before = controller.getSnapshot().canvas.completedActionIds;
    if (kind === 'error') players[0]!.emit('error'); else if (kind === 'timeout') vi.advanceTimersByTime(12000); else await Promise.resolve();
    expect(controller.getSnapshot()).toMatchObject({ status: 'paused', speech: { phase: 'text', reason: 'Audio is unavailable. Continue in text mode.' } });
    controller.play(); vi.advanceTimersByTime(140); expect(controller.getSnapshot().progress).toBeGreaterThan(0);
    expect(controller.getSnapshot().canvas.completedActionIds).toEqual(before); expect(players).toHaveLength(1); controller.dispose();
  });
  it('does not invent progress from unknown duration, and completes only on ended', () => {
    vi.useFakeTimers(); const { controller, players } = setup(); controller.play(); const p=players[0]!;
    p.duration=NaN; p.emit('playing'); p.currentTime=8; p.emit('timeupdate'); expect(controller.getSnapshot().progress).toBe(0);
    p.emit('ended'); expect(controller.getSnapshot().progress).toBe(1); controller.dispose();
  });
  it('restores real time when duration becomes available after loadedmetadata', () => {
    vi.useFakeTimers(); const { controller, players } = setup(); controller.play();
    players[0]!.emit('playing'); players[0]!.currentTime=3; players[0]!.emit('timeupdate'); controller.interrupt(); controller.resume();
    const p=players[1]!; p.duration=Infinity; p.emit('loadedmetadata'); expect(p.currentTime).toBe(0);
    p.duration=10; p.emit('durationchange'); expect(p.currentTime).toBe(3);
    p.currentTime=4; p.emit('playing'); expect(p.currentTime).toBe(4); controller.dispose();
  });
  it('uses text recovery if a resumed source has no seekable range instead of claiming it resumed at zero', () => {
    vi.useFakeTimers(); const { controller, players } = setup(); controller.play();
    players[0]!.emit('playing'); players[0]!.currentTime=3; players[0]!.emit('timeupdate'); controller.interrupt(); controller.resume();
    const p=players[1]!;
    Object.assign(p, { readyState: 4, seekable: { length: 0 } });
    p.emit('loadedmetadata'); p.emit('playing');
    expect(controller.getSnapshot()).toMatchObject({ status: 'paused', progress: .3, speech: { phase: 'text' } });
    expect(p.pause).toHaveBeenCalled(); controller.dispose();
  });
  it('lets natural pause-before-ended release the barrier while an external pause freezes it', () => {
    vi.useFakeTimers(); const { controller, players } = setup(); controller.play(); const p=players[0]!;
    p.emit('playing'); Object.assign(p,{ended:true}); p.emit('pause'); expect(controller.getSnapshot().status).toBe('playing');
    p.emit('ended'); expect(controller.getSnapshot().progress).toBe(1);
    controller.restart(); controller.play(); const next=players[1]!; next.emit('playing'); next.emit('pause');
    expect(controller.getSnapshot().status).toBe('paused'); controller.dispose();
  });
  it('handles unsupported media, manual stepping, restart and disposal without leaked callbacks', () => {
    vi.useFakeTimers(); const { controller, players, segment } = setup();
    controller.configureNarration([segment], () => {const p=new Player();p.canPlayType.mockReturnValue('');return p as unknown as HTMLAudioElement;});
    controller.play(); expect(controller.getSnapshot().speech.phase).toBe('text'); controller.pause();
    controller.configureNarration([segment], () => {const p=new Player();players.push(p);return p as unknown as HTMLAudioElement;});
    controller.play(); const p=players[0]!; controller.step(); const before=controller.getSnapshot(); p.emit('ended'); expect(controller.getSnapshot()).toEqual(before);
    controller.restart(); p.emit('timeupdate'); expect(controller.getSnapshot().status).toBe('idle'); controller.play(); const next=players[1]!;
    controller.dispose(); expect(next.pause).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects unbound or arbitrary audio sources and performs text-only playback with no segment', () => {
    const { controller, segment } = setup();
    expect(() => controller.configureNarration([{...segment,src:'https://example.com/audio.mp3'}])).toThrow('binding');
    expect(() => controller.configureNarration([{...segment,beatId:'missing'}])).toThrow('binding');
    expect(() => controller.configureNarration([segment,segment])).toThrow('binding');
    controller.configureNarration([]); controller.play(); expect(controller.getSnapshot().speech.phase).toBe('text'); controller.dispose();
  });
});

describe('public teaching narration integration', () => {
  it('makes text-only mode truly silent and enables narration without any provider dispatch', () => {
    vi.useFakeTimers(); const { controller, players } = setup();
    controller.setNarrationEnabled(false); controller.play(); vi.advanceTimersByTime(140);
    expect(players).toHaveLength(0); expect(controller.getSnapshot().progress).toBeGreaterThan(0);
    const ids = controller.getSnapshot().canvas.completedActionIds;
    controller.setNarrationEnabled(true); expect(controller.getSnapshot().status).toBe('paused');
    controller.play(); expect(players).toHaveLength(1);
    expect(controller.getSnapshot().canvas.completedActionIds).toEqual(ids);
    controller.dispose();
  });
  it('plays and replays a local fixture reply on the shared owner, then resumes the saved teaching audio', () => {
    vi.useFakeTimers(); const { controller, players } = setup(); controller.play();
    players[0]!.emit('playing'); players[0]!.currentTime = 3; players[0]!.emit('timeupdate');
    const before = controller.getSnapshot(); controller.interrupt();
    const reply = { src: '/petros/audio/slope-writing-reply-1.mp3', mimeType: 'audio/mpeg' as const, caption: 'Slope compares the changes.', provenance: 'approved-local-fixture' as const };
    controller.playLocalResponse(reply); players[1]!.emit('playing');
    expect(controller.getSnapshot().speech.phase).toBe('speaking');
    controller.pauseVoicePreview(); expect(controller.getSnapshot().speech.phase).toBe('text');
    controller.resumeVoicePreview(); players[1]!.emit('playing'); players[1]!.emit('ended');
    controller.playLocalResponse(reply); players[2]!.emit('playing'); controller.interrupt();
    players[2]!.emit('ended'); expect(controller.getSnapshot().progress).toBe(before.progress);
    controller.play(); players[3]!.emit('loadedmetadata');
    expect(players[3]!.currentTime).toBe(3);
    expect(controller.getSnapshot().canvas.completedActionIds).toEqual(before.canvas.completedActionIds);
    controller.dispose();
  });
});
