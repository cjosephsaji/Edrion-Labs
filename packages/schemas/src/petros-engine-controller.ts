import { compatibilityCanonicalJson } from './petros-compatibility';
import { compileEngineProgram, validateEngineParameter, type CompiledEngineProgram } from './petros-engine-compiler';
import { boundEngineInput, engineActionSchema, engineCommandSchema, engineFail, engineSnapshotSchema, type EngineAction, type EngineAuthority, type EngineCommand, type EngineSnapshot } from './petros-engine-contract';
import { evaluateEngineValues, localEngineAuthority, validateEngineSnapshot } from './petros-engine-interpreter';
import { resolveEngineViews } from './petros-engine-bindings';
export function initialEngineSnapshot(c:CompiledEngineProgram,branchId:string):EngineSnapshot{
  const parameters=Object.fromEntries(c.program.parameters.map(p=>[p.id,p.initial]));const result=evaluateEngineValues(c,parameters,0);
  const snapshot:EngineSnapshot={schemaVersion:'petros.engine-snapshot.v1',program:c.program,
    execution:{version:1,branchId,time:0,parameters,values:result.values,events:result.events,inputEvents:[],playing:false},
    presentation:{viewIds:c.program.views.map(v=>v.id),selectedEntityId:null,hidden:[],highlighted:[],speed:1,expanded:false,returnView:null},
    draft:{version:0,text:'',annotations:[]},teaching:{character:0,beat:0,offset:0,interrupted:false,mode:'freeze',returnPoint:null},report:c.report};
  engineSnapshotSchema.parse(snapshot);resolveEngineViews(snapshot);return snapshot;
}
export function applyEngineCommand(raw:EngineSnapshot,input:EngineCommand,authority:EngineAuthority):EngineSnapshot{
  boundEngineInput(input);const command=engineCommandSchema.parse(input);const {snapshot:prior}=validateEngineSnapshot(raw);
  compileEngineProgram(prior.program,authority);
  if(command.programId!==prior.program.programId||command.expectedRevision!==prior.program.revision||
    command.expectedExperimentVersion!==prior.execution.version||command.expectedDraftVersion!==prior.draft.version)engineFail('STALE');
  if(prior.execution.version>=999999)engineFail('VERSION_EXHAUSTED');
  const action=command.action;let next=structuredClone(prior);
  if(action.type==='create'||action.type==='compare')engineFail('OWNER_OPERATION_REQUIRED');
  if(action.type==='compose'||action.type==='replace_subprogram'){
    if(prior.execution.playing)engineFail('PAUSE_BEFORE_REPLACEMENT');
    if(action.program.revision!==prior.program.revision+1)engineFail('STALE');
    const compiled=compileEngineProgram(action.program,authority);
    next=initialEngineSnapshot(compiled,prior.execution.branchId);
    if(prior.draft.annotations.some(a=>!next.program.entities.some(e=>e.id===a.entityId)))engineFail('DRAFT_ANCHOR_CONFLICT');
    next.draft=structuredClone(prior.draft);next.presentation.expanded=prior.presentation.expanded;
    next.report.limitations=[...compiled.report.limitations]; // UI discloses new revision/time reset.
  }else if(action.type==='set_parameter'){
    const param=next.program.parameters.find(p=>p.id===action.parameterId);if(!param||param.unit!==action.unit)engineFail('PARAMETER_UNIT');
    validateEngineParameter(param,action.value);
    if(param.change==='intervene'){
      if(next.execution.inputEvents.some(e=>e.time>=next.execution.time))engineFail('BRANCH_BEFORE_INTERVENTION');
      next.execution.inputEvents.push({parameterId:param.id,value:action.value,time:next.execution.time});
    }else{
      next.execution.parameters[param.id]=action.value;
      if(param.change==='restart'){next.execution.time=0;next.execution.inputEvents=[];next.execution.playing=false;next.teaching.returnPoint=null;}
    }
  }else if(action.type==='seek'||action.type==='step'){
    next.execution.time=action.time;next.execution.playing=false;
  }else if(action.type==='play'){
    if(next.teaching.interrupted&&next.teaching.mode==='freeze')engineFail('RESUME_REQUIRED');next.execution.playing=true;
  }else if(action.type==='pause')next.execution.playing=false;
  else if(action.type==='set_speed')next.presentation.speed=action.speed;
  else if(action.type==='switch_representation'){
    if(new Set(action.viewIds).size!==action.viewIds.length||action.viewIds.some(id=>!next.program.views.some(v=>v.id===id)))engineFail('INVALID_REFERENCE');
    next.presentation.viewIds=[...action.viewIds];
  }else if(action.type==='annotate'){
    next.draft.text=action.text;next.draft.version++;
  }else if(action.type==='expand')next.presentation.expanded=!next.presentation.expanded;
  else if(action.type==='restore_view'){
    if(next.presentation.returnView){const ret=next.presentation.returnView;Object.assign(next.presentation,ret,{returnView:null});}
  }else if(action.type==='interrupt'){
    if(action.beat>=Math.max(1,next.program.teachingTrack.length))engineFail('INVALID_BEAT');
    next.teaching={...next.teaching,character:action.character??0,beat:action.beat,offset:action.offset,interrupted:true,mode:action.mode,
      returnPoint:{character:action.character??0,branchId:next.execution.branchId,time:next.execution.time,beat:action.beat,offset:action.offset}};
    if(action.mode==='freeze')next.execution.playing=false;
  }else if(action.type==='resume'){
    const ret=next.teaching.returnPoint;if(ret){if(ret.branchId!==next.execution.branchId)engineFail('BRANCH_RETURN_CONFLICT');
      next.teaching.beat=ret.beat;next.teaching.offset=ret.offset;next.teaching.character=ret.character;}
    next.teaching.interrupted=false;next.teaching.returnPoint=null;
  }else if(action.type==='set_beat'){
    if(next.teaching.interrupted)engineFail('RESUME_REQUIRED');
    const beat=next.program.teachingTrack[action.beat];if(!beat)engineFail('INVALID_BEAT');
    if(beat.sync.kind==='model_event'){
      const sync=beat.sync;const event=next.execution.events.find(e=>e.modelId===sync.modelId&&e.id===sync.eventId);
      if(!event)engineFail('MODEL_EVENT_UNAVAILABLE');next.execution.time=event.time;next.execution.playing=false;
    }
    next.teaching.beat=action.beat;next.teaching.offset=action.offset;next.teaching.character=0;
  }else if('entityId' in action){
    if(!next.program.entities.some(e=>e.id===action.entityId))engineFail('INVALID_REFERENCE');
    if(['focus','point_to','select','isolate'].includes(action.type))next.presentation.selectedEntityId=action.entityId;
    if(action.type==='hide')next.presentation.hidden=[...new Set([...next.presentation.hidden,action.entityId])];
    if(action.type==='reveal')next.presentation.hidden=next.presentation.hidden.filter(id=>id!==action.entityId);
    if(action.type==='highlight')next.presentation.highlighted=[...new Set([...next.presentation.highlighted,action.entityId])];
    if(action.type==='isolate'){
      next.presentation.returnView??={viewIds:[...next.presentation.viewIds],selectedEntityId:prior.presentation.selectedEntityId,hidden:[...next.presentation.hidden]};
      next.presentation.hidden=next.program.entities.filter(e=>e.id!==action.entityId).map(e=>e.id);
    }
  }else engineFail('UNKNOWN_OPERATION');
  const c=compileEngineProgram(next.program,authority);const result=evaluateEngineValues(c,next.execution.parameters,next.execution.time,next.execution.inputEvents);
  next.execution={...next.execution,version:prior.execution.version+1,values:result.values,events:result.events};
  next.report=c.report;engineSnapshotSchema.parse(next);resolveEngineViews(next);return next;
}
/** Preview is untrusted local calculation. The owner recomputes it on every write. */
export function previewEngineCommand(snapshot:EngineSnapshot,action:EngineAction){
  boundEngineInput(action);engineActionSchema.parse(action);
  return applyEngineCommand(snapshot,{schemaVersion:'petros.engine-command.v1',programId:snapshot.program.programId,operationId:snapshot.execution.branchId,
    expectedRevision:snapshot.program.revision,expectedExperimentVersion:snapshot.execution.version,expectedDraftVersion:snapshot.draft.version,
    target:'program',purpose:'Local exploration preview',action},localEngineAuthority(snapshot.program));
}
/** Owner must load the checkpoint using current scope; client snapshots never enter here. */
export function branchEngineSnapshot(raw:EngineSnapshot,checkpointRaw:EngineSnapshot,branchId:string){
  const {snapshot:current}=validateEngineSnapshot(raw),{snapshot:checkpoint}=validateEngineSnapshot(checkpointRaw);
  if(current.execution.playing)engineFail('PAUSE_BEFORE_BRANCH');
  if(compatibilityCanonicalJson(current.program)!==compatibilityCanonicalJson(checkpoint.program)||
    compatibilityCanonicalJson(current.report)!==compatibilityCanonicalJson(checkpoint.report))engineFail('INCOMPATIBLE_CHECKPOINT');
  if(current.execution.version>=999999)engineFail('VERSION_EXHAUSTED');
  const next=structuredClone(current);next.execution={...structuredClone(checkpoint.execution),branchId,version:current.execution.version+1,playing:false,
    inputEvents:checkpoint.execution.inputEvents.filter(e=>e.time<=checkpoint.execution.time)};
  // New branch is explicit; preserve narration/draft while rebinding the return branch visibly.
  if(next.teaching.returnPoint)next.teaching.returnPoint={...next.teaching.returnPoint,branchId,time:next.execution.time};
  engineSnapshotSchema.parse(next);resolveEngineViews(next);return next;
}
