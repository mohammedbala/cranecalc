import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {meshNodes,meshTolerance} from '../src/engine/meshNodes';
import {beamSystem} from '../src/engine/beam';
import {LateralTorsionBeam,type LateralTorsionInput} from '../src/engine/lateralTorsion';
import {createDetailCollector} from '../src/engine/detailAnalysis';
import {cranePositions} from '../src/engine/cranePositions';
import {columnResponse} from '../src/engine/columnAnalysis';
import {craneDesignMinimum} from '../src/engine/aistLoads';
import {girderDeadLoad} from '../src/engine/newSteel';
import {sectionProperties} from '../src/engine/section';
import type {ProjectInput} from '../src/engine/types';

/**
 * No sliver elements in any mesh the analyses build. Template t03 (7.5-ton pendant crane, four 20 ft simple spans,
 * flexible plate ties) put a wheel 0.238 mm short of the grid-5 support on the 1280-step travel grid: the
 * lateral-torsional model of bay 4 got a 0.238 mm element beside its tie and slotted bearing, and its factorization
 * reported a buckling multiplier of 0.69 instead of 2.05 (the LRFD A2c case below; 0.01 and 0.1 mm stopped the
 * calculation as "ill-conditioned"). Every test here compares a wheel 0.01 mm to 1 mm (and up to the merge tolerance)
 * from a support or restraint with the wheel exactly on it.
 */
const t03=():ProjectInput=>JSON.parse(readFileSync(new URL('./fixtures/t03Sliver.project.json',import.meta.url),'utf8'));
const inch=25.4,kip=4448.2216152605;
const offsets=[0,.01,.1,.238,.5,1];
const close=(a:number,b:number,tolerance:number)=>expect(Math.abs(a-b)/Math.max(Math.abs(b),1e-12)).toBeLessThan(tolerance);

describe('mesh nodes',()=>{
 it('merges anchors and loads closer than the tolerance and keeps every element at least that long',()=>{
  const m=meshNodes([0,1000,500,500.4],[999.7,250,250.5,600],[100,200,249.6,300,400,499.2,700,800,900,999.5],1);
  expect(m.nodes).toEqual([0,100,200,250,300,400,500,600,700,800,900,1000]);
  // The restraint at 500.4 shares the support node; the loads move onto the nearest node.
  expect(m.nodes[m.index(500.4)]).toBe(500);expect(m.nodes[m.index(999.7)]).toBe(1000);
  expect(m.nodes[m.index(250.5)]).toBe(250);expect(m.nodes[m.index(600)]).toBe(600);
  expect(Math.min(...m.nodes.slice(1).map((x,i)=>x-m.nodes[i]))).toBeGreaterThan(1);
 });
 it('places every anchor and load within the tolerance of its node for arbitrary positions',()=>{
  let seed=12345;const random=()=>(seed=(seed*16807)%2147483647)/2147483647;
  for(let trial=0;trial<200;trial++){
   const L=1000+9000*random(),tolerance=.5+5*random(),near=(x:number)=>Math.min(L,Math.max(0,x+(random()-.5)*3*tolerance));
   const anchors=[0,L,...Array.from({length:6},()=>L*random())],loads=Array.from({length:6},()=>random()<.5?near(anchors[Math.floor(random()*anchors.length)]):L*random());
   const grid=Array.from({length:39},(_,i)=>L*(i+1)/40),m=meshNodes(anchors,loads,grid,tolerance);
   expect(m.nodes[0]).toBe(0);expect(m.nodes.at(-1)).toBe(L);
   expect(Math.min(...m.nodes.slice(1).map((x,i)=>x-m.nodes[i]))).toBeGreaterThan(tolerance);
   for(const x of [...anchors,...loads])expect(Math.abs(m.nodes[m.index(x)]-x)).toBeLessThanOrEqual(tolerance);
  }
 });
 it('scales the tolerance with the member and the section depth',()=>{
  expect(meshTolerance(6096)).toBe(1);expect(meshTolerance(45720)).toBeCloseTo(4.572,9);
  expect(meshTolerance(6096,353)).toBeCloseTo(3.53,9);
 });
});

// A t03-like bay 4: W14X61 at 0.8 stiffness on the soft flange tie (18 kip/in secant) and slotted sliding-end bolts
// (42.7 kip/in secant) at its right end, two wheels 7 ft apart with the second at the end support less delta.
const W14X61={E:200000*.8,G:200000*.8/2.6,Iy:107*inch**4,J:2.19*inch**4,Cw:4710*inch**6,h0:353.06-16.383,polarRadiusSquared:(640+107)/17.9*inch**2};
function bay(delta:number,section=W14X61,L=6096,wheelbase=2133.6,P=80000,H=6700,z=284):LateralTorsionInput{
 const xs=[L-wheelbase-delta,L-delta],R=P*xs.reduce((s,x)=>s+(L-x),0)/L;
 return {length:L,...section,subdivisions:20,loads:xs.map(x=>({x,lateral:H,torque:P*19+H*z,vertical:P,height:z})),
  restraints:[{x:0,top:18*kip/inch,bottom:6265*kip/inch},{x:L,top:18*kip/inch,bottom:42.7*kip/inch}],
  moment:x=>R*x-xs.reduce((s,w)=>s+(x>w?P*(x-w):0),0),distributedVertical:1,distributedHeight:z};
}
describe('lateral-torsional model with a wheel next to a support',()=>{
 it('gives the buckling multiplier, displacements and restraint forces of the wheel on the support',()=>{
  const on=new LateralTorsionBeam(bay(0)),exact=on.criticalMultiplier().value,response=on.solve(1);
  expect(exact).toBeGreaterThan(2);
  for(const delta of offsets){
   const beam=new LateralTorsionBeam(bay(delta));
   close(beam.criticalMultiplier().value,exact,1e-3);
   const r=beam.solve(1);expect(r.residual).toBeLessThan(1e-9);
   close(r.at(3048).v,response.at(3048).v,1e-3);close(r.at(3048).twist,response.at(3048).twist,1e-3);
   close(r.restraints[1].lateral,response.restraints[1].lateral,1e-3);
  }
  // A wheel just past the merge tolerance keeps its own node and stays continuous in its position.
  close(new LateralTorsionBeam(bay(4)).criticalMultiplier().value,exact,1e-2);
 });
 it('keeps the same margin for a deep section: the tolerance grows with the depth',()=>{
  const W40={E:200000*.8,G:200000*.8/2.6,Iy:2520*inch**4,J:445*inch**4,Cw:1040000*inch**6,h0:1008,polarRadiusSquared:(50400+2520)/174*inch**2};
  const deep=(delta:number)=>new LateralTorsionBeam(bay(delta,W40,12192,4000,600000,60000)).criticalMultiplier().value,exact=deep(0);
  // 1.3 mm from the end support a 1 mm tolerance left a 1.3 mm element that lowered the multiplier by 1.6%.
  for(const delta of [...offsets,1.3])close(deep(delta),exact,1e-3);
  // Within the 10 mm tolerance the wheel moves onto the end node while the moment diagram keeps its position; the
  // multiplier stays continuous across the tolerance (it changes by about 0.03% per mm here).
  const tolerance=meshTolerance(12192,W40.h0);expect(tolerance).toBeCloseTo(10.08,9);
  close(deep(tolerance-.05),deep(tolerance+.05),1e-3);close(deep(12),deep(9),2e-3);
 });
 it('merges a wheel onto an interior restraint and a restraint onto a support',()=>{
  const base=bay(0);base.restraints.push({x:3048,top:18*kip/inch,bottom:0});
  const at=(load:number,restraint:number)=>new LateralTorsionBeam({...base,loads:[{x:load,lateral:6700,torque:3e6,vertical:80000,height:284}],restraints:[...base.restraints.slice(0,2),{x:restraint,top:18*kip/inch,bottom:0},{x:6096-.3,top:9*kip/inch,bottom:0}]});
  const exact=at(3048,3048).solve();
  for(const delta of offsets){const r=at(3048+delta,3048-delta/2).solve();close(r.at(3048).v,exact.at(3048).v,1e-3);close(r.at(3048).twist,exact.at(3048).twist,1e-3);expect(r.residual).toBeLessThan(1e-9);}
 });
});

describe('detailed collector, t03 bay 4 (LRFD A2c)',()=>{
 // The A2c case of the reviewed package (D-59538): the crane with its second wheel at grid 5, less delta.
 const p=t03(),props=sectionProperties(p.section),c=p.cranes[0],L=p.spans.reduce((a,b)=>a+b,0);
 const impact=Math.max(c.impact,craneDesignMinimum(c).impact),q=1.2*girderDeadLoad(p,props.weight)+1.6*(p.aist?.liveLoad??0);
 const vertical=beamSystem(p.spans,p.section.E*props.Ix,p.system);
 const result=(delta:number)=>{
  const origin=L-c.wheels.at(-1)!.offset-delta,collector=createDetailCollector(p,props,20,2.69*kip);
  const wheels=c.wheels.map(w=>{const s=c.includesImpact?w.loaded/(1+c.impact):w.loaded;return {x:origin+w.offset,p:1.6*w.unloaded+1.6*(s-w.unloaded)+1.6*s*impact,h:0};});
  collector.observe({kind:'strength',id:`D-${delta}`,combination:'LRFD A2c',cranes:[{index:0,origin,loaded:true}],horizontalCrane:0,lateralSign:1,wheels,q,
   railTorquePerLength:1.2*p.railWeight*p.railEccentricity,axial:1.6*Math.max(c.longitudinal,craneDesignMinimum(c).traction),verticalReactions:vertical.evaluate(wheels.map(w=>({x:w.x,p:w.p})),q).reactions});
  return collector.finish();
 };
 it('gives the multiplier, stresses and brace force of the wheel on the support',()=>{
  // 1.37 with the flexible plate's force at its line below the flange (tieLine), which on this W14X61 restrains the twist
  // much less than a restraint at the flange did (2.05); the sliver element gave 0.70.
  const exact=result(0);
  expect(exact.criticalMultiplier).toBeGreaterThan(1.2);expect(exact.unstableCases??0).toBe(0);
  for(const delta of offsets){
   const r=result(delta);
   expect(r.unstableCases??0).toBe(0);expect(r.residual).toBeLessThan(1e-6);
   close(r.criticalMultiplier,exact.criticalMultiplier,1e-3);
   close(r.normalStress,exact.normalStress,1e-3);close(r.shearStress,exact.shearStress,1e-3);
   close(r.demands.brace,exact.demands.brace,1e-3);
  }
 },120000);
});

describe('vertical and flange beams',()=>{
 it('leaves no subdivision point a fraction of a millimetre from a support of a continuous girder',()=>{
  const at=(extra:number)=>beamSystem([6096,6096+extra,6096],2e5*2.66e8,'continuous').evaluate([{x:3000,p:1e5},{x:6095.8,p:1e5},{x:9000,p:1e5}],10);
  const exact=at(0);
  for(const extra of [.3,.03,.003,.0003]){
   const r=at(extra);
   // Before: equilibrium error 2e-8, 2e-6, 3e-5 and 2.5e-2 from a 0.15 mm to 0.00015 mm element.
   expect(r.equilibriumError).toBeLessThan(1e-10);
   r.reactions.forEach((v,i)=>close(v.r,exact.reactions[i].r,1e-4));
   expect(Math.min(...r.x.slice(1).map((x,i)=>x-r.x[i]))).toBeGreaterThan(1);
  }
 });
 it('takes a brace station within the tolerance of a grid as that grid',()=>{
  const flange=(spacing:number)=>beamSystem([6096,6096],2e5*2e7,'continuous',spacing).evaluate([{x:4000,p:1e4}]);
  const exact=flange(3048);
  // Before: +4.2e9 N and -4.2e9 N at the grid and a station 0.0008 mm from it (spacing summed in floating point),
  // +5.6e6 N and -5.6e6 N with a station 0.6 mm from the grid; the load is 1e4 N.
  const near=flange(3048.0004);
  expect(near.reactions.map(v=>Math.round(v.x))).toEqual([0,3048,6096,9144,12192]);
  near.reactions.forEach((v,i)=>close(v.r,exact.reactions[i].r,1e-6));
  const off=flange(3047.7);
  expect(off.reactions.some(v=>Math.abs(v.x-6095.4)<.1)).toBe(false);expect(off.reactions.some(v=>v.x===6096)).toBe(true);
  expect(Math.max(...off.reactions.map(v=>Math.abs(v.r)))).toBeLessThan(1e4);expect(off.equilibriumError).toBeLessThan(1e-10);
 });
});

describe('column model',()=>{
 it('gives the response of a load at the free top for a load a fraction of a millimetre below it',()=>{
  const at=(x:number)=>columnResponse(6000,2e5*2e8,{base:'fixed',top:'free'},[{x,force:1e4}],[3000]);
  const exact=at(6000);
  for(const delta of [...offsets,.001]){
   // Before: base moment +2.0e7 instead of -6.0e7 N·mm at 0.001 and 0.01 mm, 3% low at 0.1 mm.
   const r=at(6000-delta);
   close(r.reactions.baseMoment,exact.reactions.baseMoment,1e-9);close(r.displacement(6000-delta),exact.displacement(6000),1e-9);
   expect(r.samples.map(v=>v.x)).toEqual(exact.samples.map(v=>v.x));
  }
 });
});

describe('crane positions',()=>{
 it('puts a wheel sampled within the tolerance of a support exactly on it',()=>{
  // t03 at the 1280-step travel grid: origin 22250.161875 put wheel 2 0.238 mm short of grid 5.
  const p=t03(),grids=[0,6096,12192,18288,24384],tolerance=meshTolerance(6096,p.section.d);
  const origins=cranePositions(p,1280,grids)[0].map(v=>v.origin);
  expect(origins).not.toContain(22250.161875);expect(origins).toContain(24384-2133.6);
  for(const o of origins)for(const w of p.cranes[0].wheels)for(const x of grids){const d=Math.abs(o+w.offset-x);expect(d<1e-9||d>tolerance).toBe(true);}
 });
});
