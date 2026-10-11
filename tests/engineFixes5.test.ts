import {describe,expect,it} from 'vitest';
import {beamSystem} from '../src/engine/beam';
import {LateralTorsionBeam,type LateralTorsionInput} from '../src/engine/lateralTorsion';

describe('engine fixes ported from the girder splice work',()=>{
 it('restrains the flange at every lateral brace station, not only the first',()=>{
  // Two 10 m simple spans braced at 2.5 m: a lateral load in the third interval of the second span
  // is carried by the stations either side of it (12.5 m and 15 m apart from the grids).
  const s=beamSystem([10000,10000],2e5*1e8,'simple',2500).evaluate([{x:13750,p:1000}]);
  const at=(x:number)=>s.reactions.find(r=>Math.abs(r.x-x)<1e-6)?.r??0;
  for(const x of [2500,5000,7500,12500,15000,17500])expect(s.reactions.some(r=>Math.abs(r.x-x)<1e-6)).toBe(true);
  // Fixed-fixed-like interior interval of a continuous beam on stations: the two adjacent stations take most of it.
  expect(at(12500)+at(15000)).toBeGreaterThan(900);
  expect(Math.abs(s.reactions.reduce((a,r)=>a+r.r,0)-1000)).toBeLessThan(1e-6);
  // Brace spacing equal to the span adds nothing beyond the grids.
  const grids=beamSystem([7620,7620,7620],2e5*1e8,'simple',7620).evaluate([{x:3810,p:1000}]);
  expect(new Set(grids.reactions.map(r=>Math.round(r.x))).size).toBe(4);
 });
 it('leaves no sliver element where a load sits a fraction of a millimetre from a mesh point',()=>{
  const base:LateralTorsionInput={length:9000,E:200000,G:200000/2.6,Iy:1.8e8,J:1.8e6,Cw:1.9e13,h0:720,polarRadiusSquared:90000,loads:[],restraints:[],fixed:[{x:0,dofs:['v','twist']},{x:9000,dofs:['v','twist']}],subdivisions:24};
  const mesh=9000/24*7,load=(x:number)=>new LateralTorsionBeam({...base,loads:[{x,lateral:10000,torque:2e6}]}).solve();
  const near=load(mesh+0.015),clear=load(mesh+5);
  expect(near.residual).toBeLessThan(1e-6);
  // The response is continuous in the load position.
  const v=(r:ReturnType<typeof load>)=>r.at(4500).v;
  expect(Math.abs(v(near)-v(clear))/Math.abs(v(clear))).toBeLessThan(0.01);
 });
});
