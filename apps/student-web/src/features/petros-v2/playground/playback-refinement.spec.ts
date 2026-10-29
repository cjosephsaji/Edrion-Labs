import { afterEach, describe, expect, it, vi } from 'vitest';
import { PresentationController, primaryPlaybackControl } from '../presentation-controller';
import { TEACHING_FIXTURES } from './teaching-fixtures';
afterEach(()=>vi.useRealTimers());
describe('primary playback control and fenced progression',()=>{
  it('plays automatically, pauses repeatedly, completes and replays',()=>{
    vi.useFakeTimers(); const c=new PresentationController(TEACHING_FIXTURES[0]!.timeline); expect(primaryPlaybackControl(c.getSnapshot()).label).toBe('Play'); c.play();
    for(let i=0;i<5;i++) { vi.advanceTimersByTime(200); c.pause(); const before=c.getSnapshot(); expect(primaryPlaybackControl(before).label).toBe('Continue'); vi.advanceTimersByTime(10000); expect(c.getSnapshot()).toEqual(before); c.play(); }
    vi.advanceTimersByTime(20000); expect(c.getSnapshot().status).toBe('complete'); expect(c.getSnapshot().canvas.completedActionIds).toHaveLength(4);
    expect(primaryPlaybackControl(c.getSnapshot()).label).toBe('Replay'); c.play(); expect(c.getSnapshot().index).toBe(0); expect(c.getSnapshot().canvas.completedActionIds).toHaveLength(1); c.dispose();
  });
  it('advances completed beats and resumes an interrupted partial beat exactly once',()=>{
    vi.useFakeTimers(); const c=new PresentationController(TEACHING_FIXTURES[0]!.timeline); c.step(); c.play(); expect(c.getSnapshot().index).toBe(1); vi.advanceTimersByTime(140); c.interrupt(); const before=c.getSnapshot(); expect(primaryPlaybackControl(before).label).toBe('Continue lesson');
    vi.advanceTimersByTime(10000); expect(c.getSnapshot()).toEqual(before); c.play(); expect(c.getSnapshot().index).toBe(before.index); expect(c.getSnapshot().canvas).toEqual(before.canvas); c.dispose();
  });
  it('manual stepping stays paused and reload recovers the partial prefix and selection',()=>{
    vi.useFakeTimers(); const c=new PresentationController(TEACHING_FIXTURES[2]!.timeline); c.play(); vi.advanceTimersByTime(350); c.pause(); c.select('cloud-learner');
    const r=new PresentationController(c.timeline); r.restore(c.serialize()); expect(r.getSnapshot().status).toBe('paused'); expect(r.getSnapshot().progress).toBe(c.getSnapshot().progress); expect(r.getSnapshot().canvas).toEqual(c.getSnapshot().canvas); expect(r.getSnapshot().selectedId).toBe('cloud-learner');
    r.step(); r.step(); const before=r.getSnapshot(); vi.advanceTimersByTime(10000); expect(r.getSnapshot()).toEqual(before); expect(before.index).toBe(1); c.dispose(); r.dispose();
  });
  it('waits for submission, preserves work and restores completion',()=>{
    vi.useFakeTimers(); const c=new PresentationController(TEACHING_FIXTURES[2]!.timeline); c.configure({reducedMotion:true}); c.play(); vi.advanceTimersByTime(15000);
    expect(primaryPlaybackControl(c.getSnapshot())).toEqual({label:'Your turn',blocked:true}); expect(()=>c.play()).toThrow('submit'); c.edit([{type:'replace_content',id:'cloud-app',expectedVersion:1,text:'My app'}]); c.submit(()=> 'Fixture only'); c.play(); vi.advanceTimersByTime(5000);
    expect(c.getSnapshot().status).toBe('complete'); expect(c.getSnapshot().canvas.elements.find(e=>e.id==='cloud-app')).toMatchObject({text:'My app'}); const r=new PresentationController(c.timeline); r.restore(c.serialize()); expect(r.getSnapshot().status).toBe('complete'); c.dispose(); r.dispose();
  });
  it('finishes a progressive checkpoint reveal before opening the student edit boundary',()=>{
    vi.useFakeTimers(); const timeline=structuredClone(TEACHING_FIXTURES[2]!.timeline); timeline.beats[4]!.reveal='progressive'; const c=new PresentationController(timeline);
    for(let i=0;i<4;i++)c.step(); c.play(); vi.advanceTimersByTime(100); c.interrupt();
    expect(primaryPlaybackControl(c.getSnapshot()).label).toBe('Continue lesson'); expect(()=>c.edit([{type:'replace_content',id:'cloud-app',expectedVersion:1,text:'Too early'}])).toThrow('Finish');
    const r=new PresentationController(timeline); r.restore(c.serialize()); expect(r.getSnapshot().status).toBe('interrupted'); r.play(); vi.advanceTimersByTime(10000); expect(r.getSnapshot().status).toBe('awaiting_response');
    r.edit([{type:'replace_content',id:'cloud-app',expectedVersion:1,text:'At my turn'}]); expect(r.getSnapshot().canvas.elements.find(e=>e.id==='cloud-app')).toMatchObject({text:'At my turn'}); c.dispose(); r.dispose();
  });
  it('restart and disposal invalidate stale reveal and between-beat timers',()=>{
    vi.useFakeTimers(); const c=new PresentationController(TEACHING_FIXTURES[0]!.timeline); c.configure({reducedMotion:true}); c.play(); c.restart(); const empty=c.getSnapshot(); vi.advanceTimersByTime(10000); expect(c.getSnapshot()).toEqual(empty); c.play(); c.dispose(); const stopped=c.getSnapshot(); vi.advanceTimersByTime(10000); expect(c.getSnapshot()).toEqual(stopped);
  });
});
