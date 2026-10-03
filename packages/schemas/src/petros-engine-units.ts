import { engineFail, type EngineUnit } from './petros-engine-contract';
type Dimension=readonly number[]; // length, mass, time, current, angle, display, temperature
const u=(d:Dimension,scale=1)=>({d:d.length===6?[...d,0]:d,scale});
export const ENGINE_UNITS:Record<EngineUnit,{d:Dimension;scale:number}>={
  '1':u([0,0,0,0,0,0]),px:u([0,0,0,0,0,1]),m:u([1,0,0,0,0,0]),cm:u([1,0,0,0,0,0],0.01),
  s:u([0,0,1,0,0,0]),ms:u([0,0,1,0,0,0],0.001),kg:u([0,1,0,0,0,0]),rad:u([0,0,0,0,1,0]),deg:u([0,0,0,0,1,0],Math.PI/180),
  'm/s':u([1,0,-1,0,0,0]),'m/s^2':u([1,0,-2,0,0,0]),'rad/s':u([0,0,-1,0,1,0]),
  N:u([1,1,-2,0,0,0]),J:u([2,1,-2,0,0,0]),W:u([2,1,-3,0,0,0]),V:u([2,1,-3,-1,0,0]),A:u([0,0,0,1,0,0]),
  ohm:u([2,1,-3,-2,0,0]),F:u([-2,-1,4,2,0,0]),C:u([0,0,1,1,0,0]),'s^-1':u([0,0,-1,0,0,0]),
  K:u([0,0,0,0,0,0,1]),'K/s':u([0,0,-1,0,0,0,1]),
};
export function engineSameDimension(a:Dimension,b:Dimension){return a.length===b.length&&a.every((v,i)=>v===b[i]);}
export function engineUnitsCompatible(a:EngineUnit,b:EngineUnit){return engineSameDimension(ENGINE_UNITS[a].d,ENGINE_UNITS[b].d);}
export function engineConvert(value:number,from:EngineUnit,to:EngineUnit){if(!engineUnitsCompatible(from,to))engineFail('UNIT_MISMATCH');return value*ENGINE_UNITS[from].scale/ENGINE_UNITS[to].scale;}
export function engineCombineUnits(a:EngineUnit,b:EngineUnit,sign:1|-1){return ENGINE_UNITS[a].d.map((v,i)=>v+sign*ENGINE_UNITS[b].d[i]!);}
