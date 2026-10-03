import { ENGINE_MODELS, createEngineCircuitTopology } from './petros-engine-models';
import { ENGINE_VERSION, engineFail, type EngineAuthority, type EngineExpression, type EnginePrimitive, type EngineProgram, type EngineUnit } from './petros-engine-contract';
import { adaptPetrosDiagram } from './petros-visual-adapter';
import type { PetrosTeachingBlockContent } from './petros-learning';

/** Convenience constructors produce ordinary data. They are not compiler dispatch types. */
export function createEngineReferenceProgram(authority:EngineAuthority,capabilityId='physics.projectile.no-drag',revision=1):EngineProgram{
  const cap=ENGINE_MODELS.find(c=>c.id===capabilityId);if(!cap)engineFail('UNKNOWN_CAPABILITY');
  const projectile=capabilityId==='physics.projectile.no-drag',pendulum=capabilityId==='physics.pendulum.ideal';
  const cooling=capabilityId==='thermal.newton-cooling.lumped';
  const rc=capabilityId==='circuits.rc.series',circuit=capabilityId.startsWith('circuits.');
  const title=projectile?'Projectile motion':pendulum?'Ideal nonlinear pendulum':cooling?'Newton cooling (lumped body)':rc?'Series RC circuit':'Series DC circuit';
  const entities=[{id:'body',label:projectile?'Projectile':pendulum?'Pendulum bob':cooling?'Lumped body':'Circuit',conceptId:projectile?authority.source?.conceptId??null:null,
    description:projectile?'Point mass launched above level ground.':pendulum?'Point mass attached to a fixed pivot by a massless inextensible string.':cooling?'One spatially uniform body approaches a constant ambient temperature.':'Ideal series loop. Topology is independent of schematic placement.'},
    {id:'vectors',label:circuit?'Current and voltage probes':cooling?'Temperature and rate':'Velocity and acceleration',conceptId:null,description:'Linked quantities from the same execution state.'},
    {id:'plot',label:'Linked plot',conceptId:null,description:'Samples use the same initial conditions and input history.'},
    {id:'equations',label:'Equations and data',conceptId:null,description:'Numerical values and assumptions are available without graphics.'}];
  if(circuit)entities.push(...['source','resistor','switch',...(rc?['capacitor']:[])].map(id=>({id,label:id,conceptId:null,description:`Ideal ${id} in the directed series topology; positive conventional current opposes electron drift.`})));
  const p:EngineProgram={schemaVersion:ENGINE_VERSION,programId:authority.programId,ownerScopeRef:authority.ownerScopeRef,revision,title,
    source:authority.source,provenance:projectile?'reviewed_source':'engineering_comparison',
    description:{summary:title,details:[...cap.assumptions],dataDescription:'Each numeric readout includes its unit. Plots are sampled, not extra model predictions. All model limitations remain visible.'},
    capabilities:[{id:'render.svg',version:1},{id:'language.typed',version:1},{id:cap.id,version:1}],entities,
    parameters:Object.entries(cap.inputs).map(([id,q])=>({id,label:id,type:id==='closed'?'boolean':'number',unit:q.unit as EngineUnit,
      initial:id==='closed'?Boolean(q.initial):q.initial,min:q.min,max:q.max,change:id==='closed'?'intervene':'restart'})),state:[],
    models:[{id:'model',capabilityId:cap.id,version:1,solver:cap.solver,inputs:Object.fromEntries(Object.keys(cap.inputs).map(id=>[id,id])),
      outputs:Object.fromEntries(Object.keys(cap.outputs).map(id=>[id,`model.${id}`])),...(circuit?{topology:createEngineCircuitTopology(rc)}:{})}],
    computations:[],behaviors:[],views:[],bindings:[],plots:[],inverseInputs:[],teachingTrack:[],
    assumptions:[...cap.assumptions],executionLimits:{operations:4096,solverSteps:100000,duration:projectile?200:pendulum?8:cooling?200:20}};
  const primitive=(id:string,kind:EnginePrimitive['kind'],entityId:string,description:string,x:number,y:number,extra:Partial<EnginePrimitive>={}):EnginePrimitive=>
    ({id,kind,entityId,layerId:'main',description,x,y,visible:true,...extra});
  const bind=(source:string,viewId:string,primitiveId:string,property:EngineProgram['bindings'][number]['property'],scale?:number,offset=0)=>{
    const unit=p.computations.find(c=>c.id===source)?.unit??(source==='time'?'s':cap.outputs[source.replace('model.','')]?.unit??cap.inputs[source]?.unit) as EngineUnit;
    p.bindings.push({source,viewId,primitiveId,property,mapping:scale===undefined?{kind:'identity'}:{kind:'linear',inputUnit:unit,outputUnit:'px',scale,offset}});
  };
  const constant=(id:string,value:number,unit:EngineUnit)=>p.computations.push({id,op:'constant',args:[],value,unit,type:'number'});
  const expr=(id:string,op:EngineExpression['op'],args:string[],unit:EngineUnit)=>p.computations.push({id,op,args,unit,type:'number'});
  if(cooling){
    constant('oneKelvin',1,'K');
    expr('initialTemperatureDifference','subtract',['initialTemperature','ambientTemperature'],'K');
    expr('absoluteInitialTemperatureDifference','abs',['initialTemperatureDifference'],'K');
    expr('temperatureDifferenceScale','max',['absoluteInitialTemperatureDifference','oneKelvin'],'K');
    expr('normalizedTemperatureDifference','divide',['model.temperatureDifference','temperatureDifferenceScale'],'1');
  }
  const motion:EnginePrimitive[]=[primitive('caption','text','body',title,24,24,{text:title})];
  if(projectile||pendulum){
    motion.push(primitive('bodyMark','point','body','Current model position',100,100));
    motion.push(primitive('reference','line','body',projectile?'Level ground y=0 m':'String between pivot and bob',40,280,{x2:620,y2:280}));
    if(projectile){constant('oneMetre',1,'m');constant('zeroMetres',0,'m');expr('absoluteRange','abs',['model.range'],'m');expr('spanX','max',['absoluteRange','oneMetre'],'m');expr('minX','min',['model.range','zeroMetres'],'m');expr('shiftX','subtract',['model.x','minX'],'m');expr('normalX','divide',['shiftX','spanX'],'1');expr('spanY','max',['model.apexHeight','oneMetre'],'m');expr('normalY','divide',['model.y','spanY'],'1');
      bind('normalX','motion','bodyMark','x',520,60);bind('normalY','motion','bodyMark','y',-220,280);
      motion.push(primitive('trajectory','plot','body','Trajectory in the same state; normalized axes keep the whole flight visible',40,280,{points:[]}));
      p.plots.push({viewId:'motion',primitiveId:'trajectory',x:'normalX',y:'normalY',from:0,to:200,samples:33,xScale:520,yScale:-220,xOffset:60,yOffset:280});
    }else{expr('normalX','divide',['model.x','length'],'1');expr('normalY','divide',['model.y','length'],'1');
      motion[2]={...motion[2]!,x:320,y:70,x2:320,y2:240};bind('normalX','motion','bodyMark','x',160,320);bind('normalY','motion','bodyMark','y',-160,70);
      bind('normalX','motion','reference','x2',160,320);bind('normalY','motion','reference','y2',-160,70);}
  }else if(cooling){
    motion.push(primitive('ambientLine','line','body','Constant ambient reference',70,210,{x2:650,y2:210}),
      primitive('bodyShape','rect','body','Lumped body; temperature is shown numerically',245,90,{width:210,height:90}),
      primitive('ambientLabel','text','body','Constant ambient temperature',70,235,{text:'Ambient temperature (K)'}),
      primitive('temperatureLabel','readout','body','Body temperature',245,200,{value:0,unit:'K'}),
      primitive('differenceLabel','readout','body','Temperature difference from ambient',420,200,{value:0,unit:'K'}));
    bind('model.temperature','motion','temperatureLabel','value');
    bind('model.temperatureDifference','motion','differenceLabel','value');
  }else{
    const components=['source','resistor','switch',...(rc?['capacitor']:[])];
    for(const [i,id] of components.entries()){
      motion.push(primitive(`${id}Box`,'rect',id,`Ideal ${id}; connected by topology ports`,50+i*150,100,{width:110,height:70}));
      motion.push(primitive(`${id}Label`,'text',id,id,55+i*150,130,{text:id}));
      if(i<components.length-1)motion.push(primitive(`${id}Wire`,'line',id,'Ideal connection',160+i*150,135,{x2:200+i*150,y2:135}));}
    motion.push(primitive('returnRight','line','body','Return conductor from final component',160+(components.length-1)*150,135,{x2:160+(components.length-1)*150,y2:195}),
      primitive('returnBottom','line','body','Return conductor to voltage source',160+(components.length-1)*150,195,{x2:50,y2:195}),
      primitive('returnLeft','line','body','Voltage source return port',50,195,{x2:50,y2:135}));
    motion.push(primitive('flowLabel','text','body','Charge-flow limitation',24,225,{text:'Conventional current →; electron motion in metal is opposite. No field model.'}));
    motion.push(primitive('closedMark','text','switch','Switch closed indicator',24,270,{text:'Switch closed',visible:true}));bind('model.closed','motion','closedMark','visible');
  }
  p.views.push({id:'motion',title:circuit?'Schematic and topology':'Motion',width:720,height:320,layers:['main'],primitives:motion});
  const vector:EnginePrimitive[]=[primitive('vectorLabel','text','vectors',circuit?'Probes':cooling?'Temperature':'Vectors',24,24,
    {text:circuit?'Current and voltage probes':cooling?'Body temperature, difference and rate':'Velocity (m/s) and acceleration (m/s²); separate scales'})];
  if(!circuit&&!cooling){
    for(const [id,x,y,scale,unit] of [['velocity','vx','vy',3,'m/s'],['acceleration','ax','ay',4,'m/s^2']] as const){
      vector.push(primitive(id,'vector','vectors',`${id}: ${scale} pixels per ${unit}`,280,160,{x2:280,y2:160}));
      bind(`model.${x}`,'vectors',id,'x2',scale,280);bind(`model.${y}`,'vectors',id,'y2',-scale,160);}
    vector.push(primitive('vx','readout','vectors','Horizontal velocity',24,270,{value:0,unit:'m/s'}),primitive('vy','readout','vectors','Vertical velocity',360,270,{value:0,unit:'m/s'}));
    bind('model.vx','vectors','vx','value');bind('model.vy','vectors','vy','value');
    if(pendulum){constant('forceScale',1,'N');expr('weightBound','max',['model.weight','forceScale'],'N');
      expr('tensionNX','divide',['model.tensionX','weightBound'],'1');expr('tensionNY','divide',['model.tensionY','weightBound'],'1');expr('weightNY','divide',['model.weightY','weightBound'],'1');
      vector.push(primitive('tension','vector','body','Tension, normalized by weight for display',550,160,{x2:550,y2:160}),primitive('weight','vector','body','Weight, same force scale',550,160,{x2:550,y2:160}));
      bind('tensionNX','vectors','tension','x2',35,550);bind('tensionNY','vectors','tension','y2',-35,160);bind('weightNY','vectors','weight','y2',-35,160);}
  }else if(cooling){
    for(const [i,id] of ['temperature','temperatureDifference','temperatureRate','halfLife'].entries()){
      const unit=cap.outputs[id]!.unit as EngineUnit;
      vector.push(primitive(id,'readout','vectors',id,24,70+i*58,{value:0,unit}));
      bind(`model.${id}`,'vectors',id,'value');
    }
  }else{
    for(const [i,id] of ['current','sourceVoltage','resistorVoltage','capacitorVoltage','charge'].entries()){
      vector.push(primitive(id,'readout','vectors',id,24,70+i*42,{value:0,unit:cap.outputs[id]!.unit as EngineUnit}));bind(`model.${id}`,'vectors',id,'value');}}
  p.views.push({id:'vectors',title:circuit?'Voltage/current probes':cooling?'Temperature and rate':'Vectors and forces',width:720,height:340,layers:['main'],primitives:vector});
  const plotValue=projectile?'model.y':pendulum?'model.angle':cooling?'normalizedTemperatureDifference':rc?'model.capacitorVoltage':'model.current';
  const plotUnit=projectile?'m':pendulum?'rad':cooling?'K':rc?'V':'A';
  p.views.push({id:'plot',title:cooling?'Normalized temperature difference over time':`${plotUnit} over time`,width:720,height:320,layers:['main'],primitives:[
    primitive('plotAxes','text','plot',`Time in s, vertical quantity in ${cooling?'normalized temperature difference':plotUnit}`,24,24,
      {text:cooling?'Time (s) →; normalized temperature difference (ΔT/|ΔT₀|) ↑. Temperature readouts below use kelvin.':`Time (s) →; ${plotUnit} ↑. Sample values below are the nonvisual equivalent.`}),
    primitive('samples','plot','plot',`Linked ${plotUnit} samples`,40,280,{points:[]}),
    primitive('time','readout','plot','Current time',24,305,{value:0,unit:'s'})]});
  bind('time','plot','time','value');
  const plotTo=projectile?4:pendulum?4:cooling?200:10;
  // Eight pendulum samples cost <=32k RK4 steps; rendering stays inside the aggregate budget.
  p.plots.push({viewId:'plot',primitiveId:'samples',x:'time',y:plotValue,from:0,to:plotTo,samples:pendulum?8:cooling?33:25,xScale:600/plotTo,yScale:projectile?-10:pendulum?-100:cooling?-130:rc?-20:-20000,xOffset:40,yOffset:cooling?160:pendulum?160:280});
  const equation=projectile?'x = vx₀ t; y = vy₀ t − g t²/2; vy = vy₀ − g t':pendulum?'θ″ = −(g/L) sin θ; T = m(g cos θ + Lω²); E = mL²ω²/2 + mgL(1−cos θ)':cooling?'dT/dt = −k(T − Ta); T(t) = Ta + (T₀ − Ta)e^(−kt); t½ = ln(2)/k':rc?'Vc = Vs + (Vc₀−Vs) exp(−t/RC); I = (Vs−Vc)/R; Q = CVc':'I = Vs/R while closed; Vs = VR + Vswitch';
  const data=[primitive('equation','equation','equations','Model equation',24,30,{text:equation}),...Object.entries(cap.outputs).map(([key,q],i)=>primitive(`data_${key}`,'readout','equations',key,24+(i%2)*350,80+Math.floor(i/2)*36,{value:0,unit:q.unit as EngineUnit})).filter(q=>q.unit!=='1'||q.id!=='data_closed')];
  p.views.push({id:'data',title:'Equations and model data',width:720,height:Math.max(220,100+Math.ceil(Object.keys(cap.outputs).length/2)*36),layers:['main'],primitives:data});
  for(const item of data)if(item.kind==='readout')bind(`model.${item.id.slice(5)}`,'data',item.id,'value');
  p.teachingTrack=[{id:'intro',text:`Explore ${title.toLowerCase()} under its declared ideal assumptions.`,targets:['body'],sync:{kind:'explanation'}},
    {id:'distinction',text:projectile?'At the apex, vertical velocity is zero; horizontal velocity remains unchanged.':pendulum?'Mass changes forces and energy, but not the ideal motion for the same length, gravity and initial angle.':cooling?'The body approaches a constant ambient temperature at a rate set by the effective coefficient; no spatial temperature field is modeled.':'Voltage and current are different quantities. The circuit solver reports no spatial electromagnetic field.',targets:['vectors'],sync:projectile?{kind:'model_event',modelId:'model',eventId:'apex'}:{kind:'explanation'}},
    {id:'compare',text:'Make a prediction before revealing an assessed outcome. Exploration by itself is not evidence of understanding.',targets:['plot','equations'],sync:{kind:'explanation'}}];
  return p;
}
export function createEngineLessonProgram(authority:EngineAuthority){return createEngineReferenceProgram(authority);}

/** Legacy adaptation is read-only, with original semantic text preserved and no physics grant. */
export function adaptLegacyEngineDiagram(content:Extract<PetrosTeachingBlockContent,{type:'diagram'}>,authority:EngineAuthority):EngineProgram{
  const legacy=adaptPetrosDiagram(content,authority.programId).program;
  const p:EngineProgram={schemaVersion:ENGINE_VERSION,programId:authority.programId,ownerScopeRef:authority.ownerScopeRef,revision:1,title:legacy.title,source:authority.source,provenance:'legacy_schematic',
    description:{summary:legacy.description,details:[...legacy.assumptions],dataDescription:legacy.description},capabilities:[{id:'render.svg',version:1},{id:'language.typed',version:1}],
    entities:legacy.views.flatMap(v=>v.primitives.map(q=>({id:q.id,label:q.description,description:q.description,conceptId:null}))),
    parameters:legacy.parameters.map(q=>({id:q.id,label:q.label,type:q.quantity.type,unit:q.quantity.type==='number'?q.quantity.unit:'1',initial:q.quantity.initial,
      min:q.quantity.type==='number'?q.quantity.min:0,max:q.quantity.type==='number'?q.quantity.max:1,change:'presentation'})),state:[],models:[],computations:[],behaviors:[],
    views:legacy.views.map(v=>({...v,layers:['main'],primitives:v.primitives.map(q=>({...q,entityId:q.id,layerId:'main'}))})),bindings:[],plots:[],inverseInputs:[],
    teachingTrack:legacy.teachingTrack.map(b=>({id:b.id,text:b.text,targets:b.targets.map(t=>t.primitiveId),sync:{kind:'explanation'}})),assumptions:[...legacy.assumptions],
    executionLimits:{operations:4096,solverSteps:0,duration:0}};
  for(const b of legacy.bindings){const v=legacy[b.source].variables.find(q=>q.id===b.variableId)!;
    const source=v.sourceParameter??`${b.source}.${v.id}`;
    if(!v.sourceParameter&&!p.computations.some(e=>e.id===source))p.computations.push({id:source,op:'constant',args:[],value:v.quantity.initial,type:v.quantity.type,unit:v.quantity.type==='number'?v.quantity.unit:'1'});
    p.bindings.push({source,viewId:b.viewId,primitiveId:b.primitiveId,property:b.property,mapping:{kind:'identity'}});}
  return p;
}
