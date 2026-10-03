import { engineFail } from './petros-engine-contract';
import type { EngineAuthority, EngineProgram } from './petros-engine-contract';
import { ENGINE_VERSION } from './petros-engine-contract';
/** Fixed oblique parallel projection onto a display plane: parallel projection rays,
 * screen basis (1,0,1/2), (0,1,-1/2). All coordinates are display px, not physics. */
export function projectEngineSpatialPoint(point:{x:number;y:number;z:number}){
  if([point.x,point.y,point.z].some(q=>!Number.isFinite(q)||Math.abs(q)>4096))engineFail('SPATIAL_DOMAIN');
  return {x:point.x+point.z/2,y:point.y-point.z/2};
}
/** Original CC0 semantic point/axis fixture, reviewed as projection geometry only. */
export function createEngineSpatialFixture(authority:EngineAuthority):EngineProgram{
  const coords=[{id:'origin',x:80,y:160,z:0},{id:'depth',x:80,y:160,z:80}];
  return {schemaVersion:ENGINE_VERSION,programId:authority.programId,ownerScopeRef:authority.ownerScopeRef,revision:1,title:'Spatial point projection',source:authority.source,provenance:'engineering_comparison',
    description:{summary:'Two semantic points share x and y, with different depth.',details:['Parallel fixed projection: screen x = x + z/2; screen y = y − z/2.'],dataDescription:'The coordinate table and keyboard selection give the same comparison: increasing depth displaces the projected point right and up.'},
    capabilities:[{id:'render.svg',version:1},{id:'render.spatial',version:1}],entities:coords.map(q=>({id:q.id,label:q.id==='origin'?'Zero depth':'Positive depth',description:`Display coordinates x ${q.x}, y ${q.y}, z ${q.z} px.`,conceptId:null})),
    parameters:[],state:[],models:[],computations:[],behaviors:[],views:[{id:'projection',title:'Fixed parallel projection',width:240,height:240,layers:['main'],primitives:coords.map(q=>({...q,kind:'spatial_point' as const,entityId:q.id,layerId:'main',description:`${q.id}: x ${q.x}, y ${q.y}, depth ${q.z} display px`,visible:true}))}],
    bindings:[],plots:[],inverseInputs:[],teachingTrack:[{id:'depth',text:'Compare two points with equal x and y and different depth. Use the coordinate table as an equivalent route.',targets:['origin','depth'],sync:{kind:'explanation'}}],
    assumptions:['Display geometry only; no physical solver or field claim.','Original semantic point geometry released as CC0.'],executionLimits:{operations:100,solverSteps:0,duration:0}};
}
