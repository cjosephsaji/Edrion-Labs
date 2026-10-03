import { z } from 'zod';
import { petrosProjectileBindingSchema, type PetrosProjectileBinding } from './petros-projectile-binding';

export const ENGINE_VERSION = 'petros.visual-program.v2' as const;
export const ENGINE_COMPILER = 'petros.engine-compiler.v1' as const;
export const ENGINE_LIMITS = Object.freeze({ bytes: 192_000, nodes: 16000, depth: 20, primitives: 200,
  expressions: 128, operations: 4096, solverSteps: 100_000, views: 8, samples: 65, events: 64 });
const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/);
const text = z.string().min(1).max(1500);
const number = z.number().finite().min(-1e9).max(1e9);
const version = z.number().int().min(0).max(999999);
export const engineUnitSchema = z.enum(['1','px','m','cm','s','ms','kg','rad','deg','m/s','m/s^2','rad/s','N','J','V','A','ohm','F','C','W','s^-1','K','K/s']);
export type EngineUnit = z.infer<typeof engineUnitSchema>;
export const engineParameterSchema = z.object({ id, label:text, type:z.enum(['number','boolean']), unit:engineUnitSchema,
  initial:z.union([number,z.boolean()]), min:number, max:number, change:z.enum(['restart','intervene','presentation']) }).strict();
const expression = z.object({ id, op:z.enum(['constant','add','subtract','multiply','divide','negate','sin','cos','exp','sqrt','floor','abs','min','max','lt','eq','and','not','select']),
  args:z.array(id).max(3), value:z.union([number,z.boolean()]).optional(), type:z.enum(['number','boolean']),unit:engineUnitSchema }).strict();
export const enginePrimitiveSchema = z.object({ id, entityId:id, layerId:id, kind:z.enum(['point','line','vector','rect','text','readout','plot','equation','spatial_point']),
  description:text,x:number,y:number,z:number.optional(),x2:number.optional(),y2:number.optional(),width:number.positive().optional(),height:number.positive().optional(),
  text:text.optional(),value:number.optional(),unit:engineUnitSchema.optional(),visible:z.boolean().default(true),
  points:z.array(z.object({x:number,y:number}).strict()).max(65).optional() }).strict();
export const engineProgramSchema = z.object({ schemaVersion:z.literal(ENGINE_VERSION),programId:z.string().uuid(),ownerScopeRef:z.string().min(1).max(160),revision:version.min(1),
  title:text, source:petrosProjectileBindingSchema.nullable(), provenance:z.enum(['reviewed_source','engineering_comparison','legacy_schematic']),
  description:z.object({summary:text,details:z.array(text).max(24),dataDescription:text}).strict(),
  capabilities:z.array(z.object({id,version:z.literal(1)}).strict()).min(1).max(12),
  entities:z.array(z.object({id,label:text,conceptId:z.string().max(180).nullable(),description:text}).strict()).min(1).max(64),
  parameters:z.array(engineParameterSchema).max(32),
  state:z.array(z.object({id,type:z.enum(['number','boolean']),unit:engineUnitSchema,initial:z.union([number,z.boolean()])}).strict()).max(32),
  models:z.array(z.object({id,capabilityId:id,version:z.literal(1),solver:z.string().min(1).max(100),
    inputs:z.record(id,id),outputs:z.record(id,id),topology:z.unknown().optional()}).strict()).max(4),
  computations:z.array(expression).max(128),
  behaviors:z.array(z.object({id,at:z.number().finite().min(0).max(200),assignments:z.array(z.object({stateId:id,expressionId:id}).strict()).min(1).max(16)}).strict()).max(64),
  views:z.array(z.object({id,title:text,width:number.positive().max(2048),height:number.positive().max(2048),layers:z.array(id).min(1).max(8),primitives:z.array(enginePrimitiveSchema).min(1).max(200)}).strict()).min(1).max(8),
  bindings:z.array(z.object({source:id,viewId:id,primitiveId:id,property:z.enum(['x','y','z','x2','y2','width','height','value','visible']),
    mapping:z.discriminatedUnion('kind',[
      z.object({kind:z.literal('identity')}).strict(),
      z.object({kind:z.literal('linear'),inputUnit:engineUnitSchema,outputUnit:z.literal('px'),scale:number,offset:number}).strict(),
    ])}).strict()).max(300),
  plots:z.array(z.object({viewId:id,primitiveId:id,x:id,y:id,from:z.number().finite().min(0).max(200),to:z.number().finite().min(0).max(200),samples:z.number().int().min(2).max(65),
    xScale:number,yScale:number,xOffset:number,yOffset:number}).strict()).max(8),
  inverseInputs:z.array(z.object({id,parameterId:id,inputUnit:engineUnitSchema,scale:number,offset:number}).strict()).max(32),
  teachingTrack:z.array(z.object({id,text,targets:z.array(id).max(64),sync:z.discriminatedUnion('kind',[
    z.object({kind:z.literal('explanation')}).strict(),z.object({kind:z.literal('model_event'),modelId:id,eventId:id}).strict(),
  ])}).strict()).max(64),
  assumptions:z.array(text).min(1).max(24),
  executionLimits:z.object({operations:z.number().int().min(1).max(4096),solverSteps:z.number().int().min(0).max(100000),duration:z.number().finite().min(0).max(200)}).strict(),
}).strict();
export type EngineProgram = z.infer<typeof engineProgramSchema>;
export type EnginePrimitive = z.infer<typeof enginePrimitiveSchema>;
export type EngineExpression = z.infer<typeof expression>;
export type EngineParameter = z.infer<typeof engineParameterSchema>;
export type EngineAuthority = {ownerScopeRef:string;programId:string;source:PetrosProjectileBinding|null;allowedCapabilities:string[]};
export const engineReportSchema=z.object({compiler:z.literal(ENGINE_COMPILER),status:z.literal('structurally_valid'),
  scientificStatus:z.enum(['validated_capabilities_only','schematic_unverified']),generatedExecutable:z.literal('disabled'),
  expressionStatus:z.literal('bounded_not_scientifically_approved'),capabilities:z.array(z.object({id,version:z.literal(1),solver:z.string()}).strict()),
  limitations:z.array(z.string()).max(64)}).strict();
export const engineSnapshotSchema=z.object({schemaVersion:z.literal('petros.engine-snapshot.v1'),program:engineProgramSchema,
  execution:z.object({version,branchId:z.string().uuid(),time:z.number().finite().min(0).max(200),parameters:z.record(id,z.union([number,z.boolean()])),values:z.record(id,z.union([number,z.boolean()])),
    events:z.array(z.object({modelId:id,id,time:z.number().finite().min(0).max(200)}).strict()).max(256),
    inputEvents:z.array(z.object({parameterId:id,time:z.number().finite().min(0).max(200),value:z.union([number,z.boolean()])}).strict()).max(64),playing:z.boolean()}).strict(),
  presentation:z.object({viewIds:z.array(id).max(8),selectedEntityId:id.nullable(),hidden:z.array(id).max(64),highlighted:z.array(id).max(64),speed:z.number().min(0.1).max(4),expanded:z.boolean(),
    returnView:z.object({viewIds:z.array(id).max(8),selectedEntityId:id.nullable(),hidden:z.array(id).max(64)}).strict().nullable()}).strict(),
  draft:z.object({version,text:z.string().max(8000),annotations:z.array(z.object({entityId:id,text:z.string().max(1000)}).strict()).max(64)}).strict(),
  teaching:z.object({character:z.number().int().min(0).max(1500).default(0),beat:z.number().int().min(0).max(63),offset:z.number().finite().min(0).max(3600),interrupted:z.boolean(),mode:z.enum(['freeze','continue']),
    returnPoint:z.object({character:z.number().int().min(0).max(1500).default(0),branchId:z.string().uuid(),time:z.number().finite().min(0).max(200),beat:z.number().int().min(0).max(63),offset:z.number().finite().min(0).max(3600)}).strict().nullable()}).strict(),report:engineReportSchema,
}).strict();
export type EngineSnapshot=z.infer<typeof engineSnapshotSchema>;
const action=z.discriminatedUnion('type',[
  z.object({type:z.literal('create'),program:engineProgramSchema}).strict(),
  ...(['compose','replace_subprogram'] as const).map(type=>z.object({type:z.literal(type),program:engineProgramSchema}).strict()),
  ...(['reveal','hide','focus','point_to','highlight','isolate','select'] as const).map(type=>z.object({type:z.literal(type),entityId:id}).strict()),
  z.object({type:z.literal('annotate'),text:z.string().max(8000)}).strict(),
  z.object({type:z.literal('compare'),checkpointId:z.string().uuid()}).strict(),
  z.object({type:z.literal('set_parameter'),parameterId:id,value:z.union([number,z.boolean()]),unit:engineUnitSchema}).strict(),
  ...(['play','pause','expand','restore_view','resume'] as const).map(type=>z.object({type:z.literal(type)}).strict()),
  ...(['step','seek'] as const).map(type=>z.object({type:z.literal(type),time:z.number().finite().min(0).max(200)}).strict()),
  z.object({type:z.literal('set_speed'),speed:z.number().finite().min(0.1).max(4)}).strict(),
  z.object({type:z.literal('switch_representation'),viewIds:z.array(id).min(1).max(8)}).strict(),
  z.object({type:z.literal('interrupt'),character:z.number().int().min(0).max(1500).optional(),mode:z.enum(['freeze','continue']),beat:z.number().int().min(0).max(63),offset:z.number().finite().min(0).max(3600)}).strict(),
  z.object({type:z.literal('set_beat'),beat:z.number().int().min(0).max(63),offset:z.number().finite().min(0).max(3600)}).strict(),
]);
// Zod discriminatedUnion needs a tuple; union preserves identical strict validation and bounded parsing.
export const engineActionSchema=action;
export const engineCommandSchema=z.object({schemaVersion:z.literal('petros.engine-command.v1'),programId:z.string().uuid(),operationId:z.string().uuid(),
  expectedRevision:version,expectedExperimentVersion:version,expectedDraftVersion:version,target:z.string().min(1).max(100),purpose:text,action}).strict();
export type EngineCommand=z.infer<typeof engineCommandSchema>;
export type EngineAction=EngineCommand['action'];
export class EngineError extends Error { constructor(public readonly code:string){super(`PETROS_ENGINE_${code}`);} }
export function engineFail(code:string):never{throw new EngineError(code);}
/** Iterative JSON-only preflight, before any recursive parser or serialization. */
export function boundEngineInput(raw:unknown){
  const pending=[{value:raw,depth:0}];const seen=new Set<object>();let count=0,bytes=0;
  while(pending.length){const {value,depth}=pending.pop()!;if(++count>ENGINE_LIMITS.nodes||depth>ENGINE_LIMITS.depth)engineFail('RESOURCE_LIMIT');
    if(value===null||typeof value==='boolean')bytes+=5;
    else if(typeof value==='number'){if(!Number.isFinite(value))engineFail('NONFINITE');bytes+=24;}
    else if(typeof value==='string'){if(value.length>ENGINE_LIMITS.bytes)engineFail('RESOURCE_LIMIT');bytes+=new TextEncoder().encode(value).length+2;}
    else if(typeof value==='object'){
      if(seen.has(value)||(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))engineFail('INVALID_STRUCTURE');seen.add(value);
      for(const [key,descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))){if(Array.isArray(value)&&key==='length')continue;
        if(!('value' in descriptor)||['__proto__','constructor','prototype'].includes(key))engineFail('INVALID_STRUCTURE');
        bytes+=key.length*4+3;pending.push({value:descriptor.value,depth:depth+1});}
    }else engineFail('INVALID_STRUCTURE');
    if(bytes>ENGINE_LIMITS.bytes||pending.length>ENGINE_LIMITS.nodes)engineFail('RESOURCE_LIMIT');
  }
}
