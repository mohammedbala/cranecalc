import {describe,it,expect} from 'vitest';
import {demonstrationProject} from '../src/engine/demonstration';
import {railKeeperResponse} from '../src/engine/railKeeper';
import {createDetailCollector} from '../src/engine/detailAnalysis';
import {sectionProperties} from '../src/engine/section';
import {beamSystem} from '../src/engine/beam';
import {railChecks} from '../src/engine/railChecks';
import type {CalculationSnapshot} from '../src/engine/types';
const inch=25.4,kip=4448.221615,ksi=kip/inch**2;

describe('TR13 unfactored rail keeper fatigue',()=>{
 it('reproduces an independent US-unit keeper force path',()=>{
  // Hand-checked keeper, independent of the example's keeper: 4 in long, 1 in lip over a 2 in body, 1/16 in
  // clear of the toe, 1/2 in lip overlap, 1/4 in fillets on the outer face and both ends; no pad.
  const p=demonstrationProject();p.aist!.railPad=false;
  Object.assign(p.details!.rail,{clipWidth:4*inch,clipThickness:1*inch,clipBodyWidth:2*inch,clipClearance:inch/16,clipProjection:.5625*inch,clipWeld:.25*inch});
  const v=railKeeperResponse(p,20*kip,1*kip);
  // Hold-down keeper: U=(1*6+20*.25)/6=11/6 kip, no side force. Bearing keeper: P|e|/b=5/6 kip with H=1 kip.
  expect(v.roles[1].uplift/kip).toBeCloseTo(11/6,10);expect(v.roles[0].uplift/kip).toBeCloseTo(5/6,10);expect(v.roles[0].lateral/kip).toBe(1);
  // Weld lines: outer face 4 in, ends 2-1/4=1.75 in. A=7.5 in, centroid 1.75^2/7.5 in from the outer face.
  const A=7.5,xc=1.75**2/A,Iy=4*xc**2+2*(1.75*(.875-xc)**2+1.75**3/12),arm=2+1/16+.25-xc;
  expect(v.group.A/inch).toBeCloseTo(A,10);expect(v.group.x/inch).toBeCloseTo(xc,10);expect(v.group.Iy/inch**3).toBeCloseTo(Iy,8);
  // Uplift at mid-overlap of the lip; the side force at the top of the rail base (3/4 in).
  const Mh=11/6*arm,Mb=5/6*arm+.75;
  expect(v.rootMoment/(kip*inch)).toBeCloseTo(Math.max(Mh,Mb),8);
  expect(v.flangeStress/ksi).toBeCloseTo(6*Mh/(4*(p.section.tf/inch)**2),8);
  expect(v.lipStress/ksi).toBeCloseTo(6*(11/6)*(1/16+.25)/(4*1**2),8);
  // Largest weld force at the inner ends of the end fillets in the hold-down role, on a 1/4 in fillet throat.
  expect(v.weldStress/ksi).toBeCloseTo((11/6/A+Mh*(1.75-xc)/Iy)/(.25/Math.SQRT2),8);
  expect(railKeeperResponse(p,20*kip,-1*kip)).toEqual(v);
  p.railEccentricity=-p.railEccentricity;expect(railKeeperResponse(p,20*kip,1*kip).weldStress).toBeCloseTo(v.weldStress,10);
 });
 function collect(method:'LRFD'|'ASD',impact=.25,enteredImpact=false,strengthMultiplier=1){
  const p=demonstrationProject();p.method=method;
  p.cranes[0].impact=impact;p.cranes[0].includesImpact=enteredImpact;
  if(enteredImpact)for(const w of p.cranes[0].wheels)w.loaded*=1+impact;
  const props=sectionProperties(p.section),c=createDetailCollector(p,props,12),origin=1000;
  const wheels=p.cranes[0].wheels.map(w=>({x:origin+w.offset,p:w.loaded/(enteredImpact?1+impact:1),h:.5*w.lateral}));
  const v=beamSystem(p.spans,p.section.E*props.Ix,p.system).evaluate(wheels).reactions;
  const e={id:'fixture',combination:'Cds+Cvs+0.5Css',cranes:[{index:0,origin,loaded:true}],horizontalCrane:0,lateralSign:1,wheels,q:0,railTorquePerLength:0,axial:0,verticalReactions:v};
  c.observe({...e,kind:'fatigue'});c.observe({...e,kind:'fatigue',lateralSign:-1,wheels:wheels.map(w=>({...w,h:-w.h}))});
  // Unrelated strength envelope must not leak into the cyclic local stresses.
  c.observe({...e,kind:'strength',wheels:wheels.map(w=>({...w,p:w.p*strengthMultiplier,h:w.h*strengthMultiplier}))});
  return {p,r:c.finish()};
 }
 it('preserves the empty wheel load while scaling the lifted portion by duty bin',()=>{
  const {r}=collect('LRFD');
  r.railFatigueBins.forEach((b,i)=>expect(b.vertical/kip).toBeCloseTo([20,14,11][i],10));
  expect(r.railFatigueBins.map(b=>b.lateral/kip)).toEqual([1,1,1]);
  expect(r.railFatigueBins[0].flangeStress).toBeGreaterThan(r.railFatigueBins[1].flangeStress);
  expect(r.railFatigueBins[1].flangeStress).toBeGreaterThan(r.railFatigueBins[2].flangeStress);
 });
 it('gives identical fatigue ranges under LRFD, ASD, impact and strength-envelope changes',()=>{
  const original=collect('LRFD');
  for(const alternate of [collect('ASD'),collect('LRFD',.5),collect('LRFD',.5,true),collect('LRFD',.25,false,1.1)]){
   alternate.r.railFatigueBins.forEach((b,i)=>{
    for(const key of ['vertical','lateral','flangeStress','plateStress','weldStress'] as const)
     expect(b[key]/Math.max(1,original.r.railFatigueBins[i][key])).toBeCloseTo(original.r.railFatigueBins[i][key]/Math.max(1,original.r.railFatigueBins[i][key]),10);
   });
   alternate.r.fatigue.forEach((f,i)=>f.bins.forEach((b,j)=>{
    for(const key of ['minimum','maximum','range','damage'] as const)
     expect(b[key]).toBeCloseTo(original.r.fatigue[i].bins[j][key],8);
   }));
   const checks=railChecks({input:alternate.p,detailResults:alternate.r} as CalculationSnapshot);
   // One-signed keeper weld force: each cycle ranges from zero to the bin value.
   expect(checks.find(c=>c.id==='rail-keeper-fatigue')!.demand).toBeCloseTo(Math.max(...original.r.railFatigueBins.map(b=>b.weldStress)),10);
  }
 });
 it('retains absent-to-present fatigue cycles when the lifted load fraction is zero',()=>{
  const p=demonstrationProject();p.details!.spectrum=[{name:'Empty travel',liftFraction:0,cycles:1e6}];
  const props=sectionProperties(p.section),c=createDetailCollector(p,props,12),origin=1000;
  c.observe({kind:'fatigue',id:'empty',combination:'fatigue',cranes:[{index:0,origin,loaded:true}],horizontalCrane:0,lateralSign:1,wheels:p.cranes[0].wheels.map(w=>({x:origin+w.offset,p:w.loaded,h:0})),q:0,railTorquePerLength:0,axial:0,verticalReactions:[]});
  const r=c.finish();expect(r.railFatigueBins[0].vertical/kip).toBe(8);
  expect(r.fatigue.some(f=>f.damage>0)).toBe(true);
 });
});
