import { compatibilityCanonicalJson } from './petros-compatibility';
import { ENGINE_COMPILER, ENGINE_LIMITS, boundEngineInput, engineFail, engineProgramSchema, engineReportSchema, type EngineAuthority, type EngineProgram, type EngineUnit } from './petros-engine-contract';
import { ENGINE_MODELS, evaluateEngineModel } from './petros-engine-models';
import { describeEngineCapabilities } from './petros-engine-registry';
import { ENGINE_UNITS, engineCombineUnits, engineSameDimension, engineUnitsCompatible } from './petros-engine-units';
export type EngineQuantityType={type:'number'|'boolean';unit:EngineUnit};
export type CompiledEngineProgram=ReturnType<typeof compileEngineProgram>;
const unique=(ids:string[])=>{if(new Set(ids).size!==ids.length)engineFail('DUPLICATE_ID');};
export function validateEngineParameter(spec:EngineProgram['parameters'][number],value:number|boolean){
  if(spec.type==='boolean'){if(typeof value!=='boolean'||spec.unit!=='1'||spec.min!==0||spec.max!==1)engineFail('TYPE_MISMATCH');}
  else if(typeof value!=='number'||!Number.isFinite(value)||value<spec.min||value>spec.max)engineFail('PARAMETER_DOMAIN');
  if(spec.min>spec.max)engineFail('PARAMETER_DOMAIN');
}
/** authority comes from owner service, never a program's self-reported validation. */
export function compileEngineProgram(raw:unknown,authority:EngineAuthority){
  boundEngineInput(raw);const p=engineProgramSchema.parse(raw);
  if(p.ownerScopeRef!==authority.ownerScopeRef||p.programId!==authority.programId||
    compatibilityCanonicalJson(p.source)!==compatibilityCanonicalJson(authority.source))engineFail('OWNER_SOURCE_AUTHORITY');
  if(p.provenance==='reviewed_source'&&!p.source)engineFail('SOURCE_AUTHORITY');
  if(p.provenance==='legacy_schematic'&&p.models.length)engineFail('MODEL_PROVENANCE');
  if(p.provenance==='reviewed_source'&&p.models.some(m=>m.capabilityId!=='physics.projectile.no-drag'))engineFail('MODEL_PROVENANCE');
  const registry=describeEngineCapabilities().capabilities;unique(p.capabilities.map(c=>c.id));
  for(const cap of p.capabilities){const known=registry.find(k=>k.id===cap.id&&k.version===cap.version);
    if(!known||!known.enabled||!authority.allowedCapabilities.includes(cap.id))engineFail('UNSUPPORTED_CAPABILITY');}
  const caps=new Set(p.capabilities.map(c=>c.id));
  if(!caps.has('render.svg')||(p.computations.length+p.behaviors.length>0&&!caps.has('language.typed')))engineFail('MISSING_CAPABILITY');
  unique(p.entities.map(e=>e.id));unique(p.views.map(v=>v.id));unique(p.models.map(m=>m.id));unique(p.teachingTrack.map(b=>b.id));unique(p.behaviors.map(b=>b.id));unique(p.inverseInputs.map(b=>b.id));
  if(p.entities.some(entity=>entity.conceptId!==null&&entity.conceptId!==p.source?.conceptId))engineFail('CONCEPT_AUTHORITY');
  const entities=new Set(p.entities.map(e=>e.id));
  const types=new Map<string,EngineQuantityType>([['time',{type:'number',unit:'s'}]]);
  const add=(id:string,type:EngineQuantityType)=>{if(types.has(id))engineFail('DUPLICATE_ID');types.set(id,type);};
  for(const q of p.parameters){validateEngineParameter(q,q.initial);add(q.id,q);}
  for(const q of p.state){if(typeof q.initial!==q.type||(q.type==='boolean'&&q.unit!=='1'))engineFail('TYPE_MISMATCH');add(q.id,q);}
  for(const model of p.models){
    const cap=ENGINE_MODELS.find(c=>c.id===model.capabilityId&&c.version===model.version&&c.solver===model.solver);
    if(!cap||!caps.has(cap.id))engineFail('UNSUPPORTED_SOLVER');
    if(p.executionLimits.duration>cap.maxTime)engineFail('TIME_DOMAIN');
    if(Object.keys(model.inputs).length!==Object.keys(cap.inputs).length||Object.keys(model.outputs).length===0)engineFail('MODEL_PORTS');
    const initial:Record<string,number|boolean>={};
    for(const [key,spec] of Object.entries(cap.inputs)){
      const param=p.parameters.find(q=>q.id===model.inputs[key]);
      if(!param||param.unit!==spec.unit||param.min<spec.min||param.max>spec.max||param.change==='presentation')engineFail('MODEL_INPUT');
      if(param.type==='boolean'&&key!=='closed')engineFail('MODEL_INPUT');
      if(param.change==='intervene'&&!(key==='closed'&&cap.id.startsWith('circuits.')))engineFail('UNSUPPORTED_INTERVENTION');
      initial[key]=param.initial;
    }
    for(const [key,variableId] of Object.entries(model.outputs)){
      const output=cap.outputs[key];if(!output||!(output.unit in ENGINE_UNITS))engineFail('MODEL_OUTPUT');
      add(variableId,{type:key==='closed'?'boolean':'number',unit:output.unit as EngineUnit});
    }
    evaluateEngineModel(cap.id,initial,0,model.topology===undefined?{}:{topology:model.topology});
  }
  for(const parameter of p.parameters)if(parameter.change==='intervene'&&!p.models.some(m=>m.inputs.closed===parameter.id&&m.capabilityId.startsWith('circuits.')))engineFail('UNSUPPORTED_INTERVENTION');
  for(const e of p.computations)add(e.id,e);
  const pending=new Map(p.computations.map(e=>[e.id,e]));const done=new Set([...types.keys()].filter(id=>!pending.has(id)));const order:string[]=[];
  while(pending.size){let progressed=false;
    for(const [id,e] of pending){if(e.args.some(a=>!types.has(a)))engineFail('INVALID_REFERENCE');if(e.args.some(a=>!done.has(a)))continue;
      const args=e.args.map(a=>types.get(a)!);const arity=e.op==='constant'?0:['negate','sin','cos','exp','sqrt','floor','abs','not'].includes(e.op)?1:e.op==='select'?3:2;
      if(args.length!==arity||(e.op!=='constant'&&e.value!==undefined))engineFail('EXPRESSION_ARITY');
      const same=(a:EngineQuantityType,b:EngineQuantityType)=>a.type===b.type&&engineUnitsCompatible(a.unit,b.unit);
      const out={type:e.type,unit:e.unit};const a=args[0]!,b=args[1]!;
      if(e.op==='constant'){if(typeof e.value!==e.type||(e.type==='boolean'&&e.unit!=='1'))engineFail('TYPE_MISMATCH');}
      else if(e.op==='and'||e.op==='not'){if(args.some(q=>q.type!=='boolean')||e.type!=='boolean'||e.unit!=='1')engineFail('TYPE_MISMATCH');}
      else if(e.op==='lt'||e.op==='eq'){if(!same(a,b)||e.type!=='boolean'||e.unit!=='1'||(e.op==='lt'&&a.type!=='number'))engineFail('UNIT_MISMATCH');}
      else if(e.op==='select'){if(a.type!=='boolean'||!same(b,args[2]!)||!same(out,b))engineFail('TYPE_MISMATCH');}
      else {
        if(e.type!=='number'||args.some(q=>q.type!=='number'))engineFail('TYPE_MISMATCH');
        if(['add','subtract','min','max'].includes(e.op)){if(!same(a,b)||!same(out,a))engineFail('UNIT_MISMATCH');}
        else if(e.op==='multiply'||e.op==='divide'){if(!engineSameDimension(engineCombineUnits(a.unit,b.unit,e.op==='multiply'?1:-1),ENGINE_UNITS[e.unit].d))engineFail('UNIT_MISMATCH');}
        else if(e.op==='sin'||e.op==='cos'){if(!engineUnitsCompatible(a.unit,'rad')||e.unit!=='1')engineFail('UNIT_MISMATCH');}
        else if(e.op==='exp'){if(a.unit!=='1'||e.unit!=='1')engineFail('UNIT_MISMATCH');}
        else if(e.op==='sqrt'){if(!engineSameDimension(ENGINE_UNITS[a.unit].d.map(v=>v/2),ENGINE_UNITS[e.unit].d))engineFail('UNIT_MISMATCH');}
        else if(!same(out,a))engineFail('UNIT_MISMATCH');
      }
      pending.delete(id);done.add(id);order.push(id);progressed=true;
    }if(!progressed)engineFail('DEPENDENCY_CYCLE'); // No constraint solver is registered.
  }
  const writes=new Set<string>();
  for(const event of p.behaviors){if(event.at>p.executionLimits.duration)engineFail('TIME_DOMAIN');
    for(const assignment of event.assignments){const target=p.state.find(q=>q.id===assignment.stateId);const source=types.get(assignment.expressionId);
      if(!target||!source||target.type!==source.type||!engineUnitsCompatible(target.unit,source.unit))engineFail('INVALID_BEHAVIOR');
      const key=`${event.at}:${target.id}`;if(writes.has(key))engineFail('DUPLICATE_EVENT_WRITE');writes.add(key);}}
  const primitiveTargets=new Map<string,EngineProgram['views'][number]['primitives'][number]>();let count=0;
  for(const view of p.views){unique(view.layers);unique(view.primitives.map(q=>q.id));count+=view.primitives.length;
    for(const q of view.primitives){if(!entities.has(q.entityId)||!view.layers.includes(q.layerId))engineFail('INVALID_REFERENCE');
      if(q.kind==='spatial_point'){
        if(!caps.has('render.spatial')||q.z===undefined)engineFail('MISSING_CAPABILITY');
        if([q.x,q.y,q.z].some(v=>Math.abs(v)>4096))engineFail('SPATIAL_DOMAIN');
      }
      if(['line','vector'].includes(q.kind)&&(q.x2===undefined||q.y2===undefined))engineFail('PRIMITIVE_SHAPE');
      if(q.kind==='rect'&&(q.width===undefined||q.height===undefined))engineFail('PRIMITIVE_SHAPE');
      if(['text','equation'].includes(q.kind)&&!q.text)engineFail('PRIMITIVE_SHAPE');
      if(q.kind==='readout'&&(q.value===undefined||q.unit===undefined))engineFail('PRIMITIVE_SHAPE');
      primitiveTargets.set(`${view.id}:${q.id}`,q);}}
  if(count>ENGINE_LIMITS.primitives)engineFail('RESOURCE_LIMIT');
  const bound=new Set<string>();
  for(const binding of p.bindings){const from=types.get(binding.source);const to=primitiveTargets.get(`${binding.viewId}:${binding.primitiveId}`);
    if(!from||!to||!(binding.property in to))engineFail('INVALID_BINDING');
    const key=`${binding.viewId}:${binding.primitiveId}:${binding.property}`;if(bound.has(key))engineFail('DUPLICATE_BINDING');bound.add(key);
    if(binding.property==='visible'){if(from.type!=='boolean'||binding.mapping.kind!=='identity')engineFail('TYPE_MISMATCH');continue;}
    if(from.type!=='number')engineFail('TYPE_MISMATCH');const expected=binding.property==='value'?to.unit!:'px';
    if(binding.mapping.kind==='identity'){if(!engineUnitsCompatible(from.unit,expected))engineFail('UNIT_MISMATCH');}
    else if(expected!=='px'||!engineUnitsCompatible(from.unit,binding.mapping.inputUnit)||binding.mapping.scale===0)engineFail('UNIT_MISMATCH');
  }
  const plots=new Set<string>();
  for(const plot of p.plots){const key=`${plot.viewId}:${plot.primitiveId}`;
    if(plots.has(key)||primitiveTargets.get(key)?.kind!=='plot'||types.get(plot.x)?.type!=='number'||types.get(plot.y)?.type!=='number'||plot.from>plot.to||plot.to>p.executionLimits.duration)engineFail('INVALID_PLOT');plots.add(key);}
  for(const inv of p.inverseInputs){const param=p.parameters.find(q=>q.id===inv.parameterId);if(!param||param.type!=='number'||inv.scale===0)engineFail('INVALID_INVERSE');
    // Explicit linear map accepts display input or matching physical dimensions only.
    if(inv.inputUnit!=='px'&&!engineUnitsCompatible(inv.inputUnit,param.unit))engineFail('UNIT_MISMATCH');}
  for(const beat of p.teachingTrack){if(beat.targets.some(t=>!entities.has(t)))engineFail('INVALID_REFERENCE');
    if(beat.sync.kind==='model_event'){const sync=beat.sync;const model=p.models.find(m=>m.id===sync.modelId);
      if(!model||!((model.capabilityId==='physics.projectile.no-drag'&&['launch','apex','ground_contact'].includes(sync.eventId))||
        (model.capabilityId==='physics.pendulum.ideal'&&(sync.eventId==='release'||/^equilibrium_[1-9][0-9]*$/.test(sync.eventId)))))engineFail('UNKNOWN_MODEL_EVENT');}}
  const report=engineReportSchema.parse({compiler:ENGINE_COMPILER,status:'structurally_valid',scientificStatus:p.models.length?'validated_capabilities_only':'schematic_unverified',
    generatedExecutable:'disabled',expressionStatus:'bounded_not_scientifically_approved',capabilities:p.capabilities.map(c=>({id:c.id,version:c.version,solver:registry.find(r=>r.id===c.id)!.solver})),
    limitations:[...new Set(['Structural validation is not educator approval. Generated expressions are unverified scientific claims.',...p.models.flatMap(m=>{const capability=ENGINE_MODELS.find(c=>c.id===m.capabilityId)!;return [...capability.assumptions.map(a=>`${m.id}: ${a}`),...capability.limitations];})])]});
  return {program:p,report,order,types};
}
