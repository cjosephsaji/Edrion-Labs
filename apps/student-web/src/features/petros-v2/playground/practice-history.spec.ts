import { describe, expect, it } from 'vitest';
import { PresentationController } from '../presentation-controller';
import { TEACHING_FIXTURES } from './teaching-fixtures';
import { applyStudentCanvasCommand, restoreStudentPracticeState, type CanvasOperation } from '@edrion/schemas';
function practice() {
  const controller = new PresentationController(TEACHING_FIXTURES[2]!.timeline);
  controller.configure({ reducedMotion: true });
  for (let i = 0; i < 5; i++) controller.step();
  return controller;
}
const relationship: CanvasOperation = { type: 'connect_elements', element: { id:'student-link',kind:'edge',version:1,label:'Student link',sourceId:'public-cloud',editable:true,from:'cloud-resources',to:'cloud-app',text:'provides',relation:'provides' } };
describe('bounded practice history and protected teaching regions', () => {
  it('replays new revisioned undo and redo receipts after reload; new edits invalidate redo', () => {
    const c=practice(); c.edit([{type:'replace_content',id:'cloud-app',expectedVersion:1,text:'Study app'}]);
    const edited=c.getSnapshot().canvas; c.undo();
    expect(c.getSnapshot().canvas.elements.find(e=>e.id==='cloud-app')).toMatchObject({text:'App',version:3});
    expect(c.getSnapshot().canvas.revision).toBe(edited.revision+1);
    c.redo(); const restored=practice(); restored.restore(c.serialize());
    expect(restored.getSnapshot().canvas).toEqual(c.getSnapshot().canvas);
    restored.undo(); restored.edit([{type:'move_element',id:'cloud-resources',expectedVersion:restored.getSnapshot().canvas.elements.find(e=>e.id==='cloud-resources')!.version,x:500,y:210}]);
    expect(restored.canRedo()).toBe(false);
  });
  it('registers and edits a student relationship; deletion rejects dangling and protected edges atomically', () => {
    const c=practice(); c.edit([relationship]);
    expect(c.getSnapshot().canvas.invitation?.editableIds).toContain('student-link');
    c.edit([{type:'replace_content',id:'student-link',expectedVersion:1,text:'supports'}]);
    expect(c.getSnapshot().canvas.elements.find(e=>e.id==='student-link')).toMatchObject({relation:'supports',text:'supports'});
    const before=c.getSnapshot().canvas;
    expect(()=>c.edit([{type:'erase',id:'cloud-resources',expectedVersion:1}])).toThrow('Dangling');
    expect(()=>c.edit([{type:'erase',id:'cloud-use',expectedVersion:1}])).toThrow('outside');
    expect(()=>c.edit([{type:'replace_content',id:'student-link',expectedVersion:2,text:'Injected arbitrary relation'}])).toThrow('supported');
    expect(c.getSnapshot().canvas).toEqual(before);
    c.edit([{type:'erase',id:'student-link',expectedVersion:2},{type:'erase',id:'cloud-resources',expectedVersion:1}]);
    expect(c.getSnapshot().canvas.elements.some(e=>e.id==='cloud-resources')).toBe(false);
    c.undo(); expect(c.getSnapshot().canvas.elements.find(e=>e.id==='student-link')).toMatchObject({text:'supports'});
  });
  it('freezes history after submission and rejects replay tampering, stale edits and protected restoration', () => {
    const c=practice();const before=c.getSnapshot().canvas;
    c.edit([relationship]);const current=c.getSnapshot().canvas;
    const target=structuredClone(current);const protectedEdge=target.elements.find(e=>e.id==='cloud-use');if(protectedEdge?.kind==='edge')protectedEdge.text='supports';
    expect(()=>restoreStudentPracticeState(current,target)).toThrow('Protected');
    expect(()=>applyStudentCanvasCommand(current,{mode:'public_fixture',activityId:current.activityId,branchId:current.branchId,checkpointId:'cloud-checkpoint',expectedRevision:before.revision,expectedDraftRevision:before.draftRevision,operations:[relationship]})).toThrow('Stale');
    c.undo();const saved=JSON.parse(c.serialize());saved.events.at(-1).expectedRevision=0;
    expect(()=>practice().restore(JSON.stringify(saved))).toThrow('Stale practice history');
    c.redo();c.submit(()=> 'Demonstration only');const submitted=c.getSnapshot();c.undo();
    expect(c.getSnapshot()).toEqual(submitted);expect(c.canUndo()).toBe(false);expect(c.canRedo()).toBe(false);
    expect(()=>restoreStudentPracticeState(c.getSnapshot().canvas,before)).toThrow('undo range');
  });
  it('does not commit a submission if demonstration feedback fails',()=>{
    const c=practice();const before=c.serialize();expect(()=>c.submit(()=>{throw new Error('Unavailable');})).toThrow('Unavailable');expect(c.serialize()).toBe(before);
  });
  it('identifies duplicates atomically while permitting three relationships and reverse directions', () => {
    const c = practice();
    const operation = (id: string, relation: 'provides' | 'supports' | 'connects', reverse = false): CanvasOperation => ({ type: 'connect_elements', element: { id, kind: 'edge', version: 1, label: 'Practice relationship', sourceId: 'public-cloud', editable: true, from: reverse ? 'cloud-app' : 'cloud-resources', to: reverse ? 'cloud-resources' : 'cloud-app', relation, text: relation } });
    c.edit([operation('one', 'provides'), operation('two', 'supports'), operation('three', 'connects'), operation('reverse-one', 'provides', true), operation('reverse-two', 'supports', true), operation('reverse-three', 'connects', true)]);
    expect(c.getSnapshot().canvas.invitation?.editableIds).toHaveLength(9);
    const before = c.serialize();
    expect(() => c.edit([operation('duplicate', 'provides')])).toThrow('already exists');
    expect(() => c.edit([{ type: 'replace_content', id: 'two', expectedVersion: 1, text: 'provides' }])).toThrow('already exists');
    expect(c.serialize()).toBe(before);
    const restored = practice(); restored.restore(before); expect(restored.getSnapshot().canvas).toEqual(c.getSnapshot().canvas);
    c.undo(); expect(c.getSnapshot().canvas.elements.filter(e => e.kind === 'edge')).toHaveLength(1);
  });
});
