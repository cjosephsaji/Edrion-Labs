import { compatibilityCanonicalJson } from './petros-compatibility';
import { compileEngineProgram, validateEngineParameter, type CompiledEngineProgram } from './petros-engine-compiler';
import { boundEngineInput, engineFail, engineSnapshotSchema, type EngineProgram, type EngineSnapshot } from './petros-engine-contract';
import { ENGINE_MODELS, evaluateEngineModel } from './petros-engine-models';
import { ENGINE_UNITS, engineConvert } from './petros-engine-units';
export type EngineBudget={operations:number;solverSteps:number};
type Values=Record<string,number|boolean>;
export const localEngineAuthority=(p:EngineProgram)=>({ownerScopeRef:p.ownerScopeRef,programId:p.programId,source:p.source,allowedCapabilities:p.capabilities.map(c=>c.id)});
function finite(v:number|boolean){if(typeof v==='number'&&(!Number.isFinite(v)||Math.abs(v)>1e9))engineFail('NUMERIC_DOMAIN');return v;}
function spend(compiled:CompiledEngineProgram,budget:EngineBudget,operations=0,solverSteps=0){
  budget.operations+=operations;budget.solverSteps+=solverSteps;
  if(budget.operations>compiled.program.executionLimits.operations||budget.solverSteps>compiled.program.executionLimits.solverSteps)engineFail('EXECUTION_BUDGET');
}
export function engineDuration(snapshot:Pick<EngineSnapshot,'program'|'execution'>){
  let duration=snapshot.program.executionLimits.duration;
  for(const model of snapshot.program.models){const cap=ENGINE_MODELS.find(c=>c.id===model.capabilityId&&c.solver===model.solver);if(!cap)engineFail('UNSUPPORTED_SOLVER');
    duration=Math.min(duration,cap.maxTime);
    if(cap.id==='physics.projectile.no-drag')duration=Math.min(duration,2*Number(snapshot.execution.parameters[model.inputs.vy!])/Number(snapshot.execution.parameters[model.inputs.gravity!]));}
  return duration;
}
export function effectiveEngineParameters(snapshot:Pick<EngineSnapshot,'execution'>,time=snapshot.execution.time){
  const parameters={...snapshot.execution.parameters};for(const event of snapshot.execution.inputEvents)if(event.time<=time)parameters[event.parameterId]=event.value;return parameters;
}
/** Incremental DAG: unaffected expressions retain prior values within the same evaluation. */
function expressions(c:CompiledEngineProgram,values:Values,budget:EngineBudget,previous?:Values){
  const expressionsById=new Map(c.program.computations.map(e=>[e.id,e]));
  for(const id of c.order){const e=expressionsById.get(id)!;
    if(previous&&Object.hasOwn(previous,id)&&e.args.every(arg=>values[arg]===previous[arg])){values[id]=previous[id]!;continue;}
    spend(c,budget,1);const raw=e.args.map(arg=>values[arg]!);
    const n=e.args.map((arg,i)=>Number(raw[i])*ENGINE_UNITS[c.types.get(arg)!.unit].scale);
    let value:number|boolean;
    switch(e.op){
      case 'constant':value=e.value!;break;
      case 'add':value=n[0]!+n[1]!;break;case 'subtract':value=n[0]!-n[1]!;break;
      case 'multiply':value=n[0]!*n[1]!;break;case 'divide':if(n[1]===0)engineFail('DIVIDE_BY_ZERO');value=n[0]!/n[1]!;break;
      case 'negate':value=-n[0]!;break;case 'sin':value=Math.sin(n[0]!);break;case 'cos':value=Math.cos(n[0]!);break;
      case 'exp':value=Math.exp(n[0]!);break;case 'sqrt':if(n[0]!<0)engineFail('NUMERIC_DOMAIN');value=Math.sqrt(n[0]!);break;
      case 'floor':value=Math.floor(n[0]!);break;case 'abs':value=Math.abs(n[0]!);break;
      case 'min':value=Math.min(n[0]!,n[1]!);break;case 'max':value=Math.max(n[0]!,n[1]!);break;
      case 'lt':value=n[0]!<n[1]!;break;case 'eq':value=typeof raw[0]==='boolean'?raw[0]===raw[1]:n[0]===n[1];break;
      case 'and':value=Boolean(raw[0]&&raw[1]);break;case 'not':value=!raw[0];break;
      case 'select':value=e.type==='boolean'?Boolean(raw[raw[0]?1:2]):n[raw[0]?1:2]!;break;
    }
    if(typeof value==='number'&&e.op!=='constant')value/=ENGINE_UNITS[e.unit].scale;
    values[id]=finite(value);
  }
}
type EvaluationCache = {
  values?: Values;
  models: Map<string, { key: string; result: ReturnType<typeof evaluateEngineModel> }>;
};
/** A cache belongs to one compiled program and contains only internally evaluated values. */
export function createEngineValueEvaluator(c:CompiledEngineProgram) {
  const cache:EvaluationCache={models:new Map()};
  return (parameters:Values,time:number,inputEvents:EngineSnapshot['execution']['inputEvents']=[],budget:EngineBudget={operations:0,solverSteps:0}) =>
    evaluateValues(c,parameters,time,inputEvents,budget,cache);
}
export function evaluateEngineValues(c:CompiledEngineProgram,parameters:Values,time:number,inputEvents:EngineSnapshot['execution']['inputEvents']=[],budget:EngineBudget={operations:0,solverSteps:0}){
  return evaluateValues(c,parameters,time,inputEvents,budget);
}
function evaluateValues(c:CompiledEngineProgram,parameters:Values,time:number,inputEvents:EngineSnapshot['execution']['inputEvents'],budget:EngineBudget,cache?:EvaluationCache){
  if(!Number.isFinite(time)||time<0||time>engineDuration({program:c.program,execution:{parameters} as EngineSnapshot['execution']}))engineFail('TIME_DOMAIN');
  if(Object.keys(parameters).length!==c.program.parameters.length)engineFail('PARAMETER_DOMAIN');
  for(const p of c.program.parameters)validateEngineParameter(p,parameters[p.id]!);
  if(inputEvents.length>64)engineFail('EVENT_BUDGET');let previousTime=-1;
  for(const event of inputEvents){const param=c.program.parameters.find(p=>p.id===event.parameterId);
    if(!param||param.change!=='intervene'||event.time<previousTime||event.time>c.program.executionLimits.duration||!Number.isFinite(event.time))engineFail('INVALID_EVENT');
    validateEngineParameter(param,event.value);previousTime=event.time;
  }
  const state=Object.fromEntries(c.program.state.map(q=>[q.id,q.initial]));
  const modelEvents:EngineSnapshot['execution']['events']=[];
  const base=(at:number)=>{
    if(at===time)modelEvents.length=0; // Final evaluation owns event output, including exact event times.
    const values:Values={...parameters,...state,time:at};
    for(const event of inputEvents)if(event.time<=at)values[event.parameterId]=event.value;
    for(const model of c.program.models){
      const modelInputs=Object.fromEntries(Object.entries(model.inputs).map(([key,id])=>[key,parameters[id]!]));
      const cap=ENGINE_MODELS.find(m=>m.id===model.capabilityId)!;
      const switches=inputEvents.filter(e=>e.parameterId===model.inputs.closed).map(e=>({time:e.time,closed:Boolean(e.value)}));
      const cost=cap.id==='physics.pendulum.ideal'?Math.ceil(at/0.001):cap.id.startsWith('circuits.')?1+switches.filter(e=>e.time<=at).length:1;
      const options={...(model.topology!==undefined?{topology:model.topology}:{}),...(cap.id.startsWith('circuits.')?{events:switches}:{})};
      const key=compatibilityCanonicalJson({modelInputs,at,options});
      const cached=cache?.models.get(model.id);
      spend(c,budget,1,cached?.key===key?0:cost); // Check before expensive kernel executes.
      const result=cached?.key===key?cached.result:evaluateEngineModel(cap.id,modelInputs,at,options);
      cache?.models.set(model.id,{key,result});
      for(const [port,id] of Object.entries(model.outputs)){if(!Object.hasOwn(result.values,port))engineFail('MODEL_OUTPUT');values[id]=finite(result.values[port]!);}
      if(at===time)for(const e of result.events)modelEvents.push({...e,modelId:model.id});
    }
    return values;
  };
  let previous=c.program.behaviors.length?undefined:cache?.values;
  for(const event of [...c.program.behaviors].sort((a,b)=>a.at-b.at))if(event.at<=time){
    const before=base(event.at);expressions(c,before,budget,previous);previous=before;
    const updates:Values={};for(const write of event.assignments){const source=c.types.get(write.expressionId)!;const target=c.types.get(write.stateId)!;const v=before[write.expressionId]!;
      updates[write.stateId]=typeof v==='number'?engineConvert(v,source.unit,target.unit):v;spend(c,budget,1);}
    Object.assign(state,updates);
  }
  const values=base(time);expressions(c,values,budget,previous);
  if(cache)cache.values={...values};
  if(modelEvents.length>256)engineFail('EVENT_BUDGET');return {values,events:modelEvents,budget};
}
export function validateEngineSnapshot(raw:unknown){
  boundEngineInput(raw);const s=engineSnapshotSchema.parse(raw);const c=compileEngineProgram(s.program,localEngineAuthority(s.program));
  if(compatibilityCanonicalJson(c.report)!==compatibilityCanonicalJson(s.report))engineFail('VALIDATION_REPORT');
  const result=evaluateEngineValues(c,s.execution.parameters,s.execution.time,s.execution.inputEvents);
  if(compatibilityCanonicalJson(result.values)!==compatibilityCanonicalJson(s.execution.values)||compatibilityCanonicalJson(result.events)!==compatibilityCanonicalJson(s.execution.events))engineFail('STATE_MISMATCH');
  const entityIds=new Set(s.program.entities.map(e=>e.id));const viewIds=new Set(s.program.views.map(v=>v.id));
  if(s.presentation.viewIds.some(id=>!viewIds.has(id))||new Set(s.presentation.viewIds).size!==s.presentation.viewIds.length||
    [...s.presentation.hidden,...s.presentation.highlighted,...s.draft.annotations.map(a=>a.entityId)].some(id=>!entityIds.has(id))||
    (s.presentation.selectedEntityId!==null&&!entityIds.has(s.presentation.selectedEntityId))||s.teaching.beat>=Math.max(1,s.program.teachingTrack.length))engineFail('STATE_REFERENCE');
  if(s.presentation.returnView&&(s.presentation.returnView.viewIds.some(id=>!viewIds.has(id))||s.presentation.returnView.hidden.some(id=>!entityIds.has(id))||
    (s.presentation.returnView.selectedEntityId!==null&&!entityIds.has(s.presentation.returnView.selectedEntityId))))engineFail('STATE_REFERENCE');
  if(s.teaching.character>(s.program.teachingTrack[s.teaching.beat]?.text.length??0))engineFail('NARRATION_POSITION');
  if(s.teaching.returnPoint&&(s.teaching.returnPoint.character>(s.program.teachingTrack[s.teaching.returnPoint.beat]?.text.length??0)||s.teaching.returnPoint.branchId!==s.execution.branchId||s.teaching.returnPoint.time>engineDuration(s)||s.teaching.returnPoint.beat>=Math.max(1,s.program.teachingTrack.length)))engineFail('RETURN_POINT');
  return {snapshot:s,compiled:c};
}
/** Local display evaluation is never authoritative evidence or a persisted command. */
export function evaluateEngineSnapshot(raw:EngineSnapshot,time=raw.execution.time):EngineSnapshot{
  const {snapshot:s,compiled:c}=validateEngineSnapshot(raw);
  const result=evaluateEngineValues(c,s.execution.parameters,time,s.execution.inputEvents);
  return {...s,execution:{...s.execution,time,values:result.values,events:result.events}};
}
