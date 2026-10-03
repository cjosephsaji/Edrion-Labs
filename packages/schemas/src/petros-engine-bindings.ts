import { z } from 'zod';
import { engineProgramSchema, engineUnitSchema, engineFail, enginePrimitiveSchema, type EngineSnapshot, type EngineUnit } from './petros-engine-contract';
import { evaluateEngineValues, engineDuration, validateEngineSnapshot, type EngineBudget, createEngineValueEvaluator } from './petros-engine-interpreter';
import { engineConvert } from './petros-engine-units';
import { type CompiledEngineProgram, validateEngineParameter } from './petros-engine-compiler';
export function resolveEngineViews(raw:EngineSnapshot){
  const {snapshot:s,compiled:c}=validateEngineSnapshot(raw);
  return resolveViews(s,c);
}
const plotNumber=z.number().finite().min(-1e9).max(1e9);
export const engineResolvedViewSchema=engineProgramSchema.shape.views.element.extend({plotData:z.array(z.object({
  primitiveId:z.string().min(1).max(80),xLabel:z.string().min(1).max(80),yLabel:z.string().min(1).max(80),
  xUnit:engineUnitSchema,yUnit:engineUnitSchema,
  samples:z.array(z.object({time:z.number().finite().min(0).max(200),x:plotNumber,y:plotNumber}).strict()).min(2).max(65),
}).strict()).max(8)}).strict();
export const engineResolvedViewsSchema=z.array(engineResolvedViewSchema).max(8);
export type EngineResolvedView=z.infer<typeof engineResolvedViewSchema>;
export type EnginePlotData=EngineResolvedView['plotData'][number];
function resolveViews(s:EngineSnapshot,c:CompiledEngineProgram,evaluate:ReturnType<typeof createEngineValueEvaluator>=(parameters,time,events,budget)=>evaluateEngineValues(c,parameters,time,events,budget)){
  const views:EngineResolvedView[]=s.program.views.map(v=>({...v,plotData:[],primitives:v.primitives.map(p=>({...p,points:p.points?.map(q=>({...q}))}))}));
  for(const b of s.program.bindings){const target=views.find(v=>v.id===b.viewId)!.primitives.find(p=>p.id===b.primitiveId)!;
    const source=c.types.get(b.source)!;const value=s.execution.values[b.source]!;
    const resolved=b.mapping.kind==='linear'?engineConvert(Number(value),source.unit,b.mapping.inputUnit)*b.mapping.scale+b.mapping.offset:
      typeof value==='number'?engineConvert(value,source.unit,b.property==='value'?target.unit!:'px'):value;
    Object.assign(target,{[b.property]:resolved});
  }
  const budget:EngineBudget={operations:0,solverSteps:0};
  for(const plot of s.program.plots){const target=views.find(v=>v.id===plot.viewId)!.primitives.find(p=>p.id===plot.primitiveId)!;
    const to=Math.min(plot.to,engineDuration(s));const from=Math.min(plot.from,to);
    const data:EnginePlotData={primitiveId:plot.primitiveId,xLabel:plot.x,yLabel:plot.y,xUnit:c.types.get(plot.x)!.unit,yUnit:c.types.get(plot.y)!.unit,samples:[]};
    target.points=Array.from({length:plot.samples},(_,i)=>{
      const time=from+(to-from)*i/(plot.samples-1);
      const sample=evaluate(s.execution.parameters,time,s.execution.inputEvents,budget).values;
      data.samples.push({time,x:Number(sample[plot.x]),y:Number(sample[plot.y])});
      return {x:Number(sample[plot.x])*plot.xScale+plot.xOffset,y:Number(sample[plot.y])*plot.yScale+plot.yOffset};});
    views.find(v=>v.id===plot.viewId)!.plotData.push(data);
  }
  for(const view of views)for(const p of view.primitives){p.visible=p.visible&&!s.presentation.hidden.includes(p.entityId);enginePrimitiveSchema.parse(p);}
  return engineResolvedViewsSchema.parse(views);
}
/** Keyboard numeric inputs and direct manipulation share this exact constrained inverse. */
export function inverseEngineInput(snapshot:EngineSnapshot,inputId:string,value:number,unit:EngineUnit){
  const {snapshot:s}=validateEngineSnapshot(snapshot);const inverse=s.program.inverseInputs.find(i=>i.id===inputId);
  if(!inverse||unit!==inverse.inputUnit||!Number.isFinite(value))engineFail('INVALID_INVERSE');
  const parameter=s.program.parameters.find(p=>p.id===inverse.parameterId)!;
  const mapped=(value-inverse.offset)/inverse.scale;validateEngineParameter(parameter,mapped);
  return {type:'set_parameter' as const,parameterId:parameter.id,value:mapped,unit:parameter.unit};
}

/** Validates the acknowledged snapshot once; every frame uses the same pinned, bounded evaluator.
 * This is a display optimization, never an assessment or owner authorization path. */
export function createEngineViewEvaluator(raw:EngineSnapshot){
  const {snapshot,compiled}=validateEngineSnapshot(raw);
  const evaluate=createEngineValueEvaluator(compiled);
  // Plot sampling has a separate bounded cache so frame evaluation stays incremental.
  const sample=createEngineValueEvaluator(compiled);
  let plots:EngineResolvedView[]|undefined;
  return (time=snapshot.execution.time)=>{
    const result=evaluate(snapshot.execution.parameters,time,snapshot.execution.inputEvents);
    const next={...snapshot,execution:{...snapshot.execution,time,values:result.values,events:result.events}};
    if(!plots)plots=resolveViews(next,compiled,sample);
    // Values and visibility change each frame, while sampled initial-condition curves do not.
    const noPlots={...next,program:{...next.program,plots:[]}};
    const views=resolveViews(noPlots,compiled);
    for(const view of views){const cached=plots.find(v=>v.id===view.id)!;view.plotData=cached.plotData;
      for(const plot of snapshot.program.plots.filter(p=>p.viewId===view.id))
        view.primitives.find(p=>p.id===plot.primitiveId)!.points=cached.primitives.find(p=>p.id===plot.primitiveId)!.points;
    }
    return structuredClone({snapshot:next,views});
  };
}
