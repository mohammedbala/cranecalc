import {describe,it,expect} from 'vitest';
import {demonstrationProject} from '../src/engine/demonstration';
import {railClipResponse} from '../src/engine/railClip';
import {createDetailCollector,automaticFatigueDetails} from '../src/engine/detailAnalysis';
import {sectionProperties} from '../src/engine/section';
import {beamSystem} from '../src/engine/beam';
import {railChecks} from '../src/engine/railChecks';
import type {CalculationSnapshot} from '../src/engine/types';
const inch=25.4,kip=4448.221615,ksi=kip/inch**2;

describe('TR13 unfactored rail clip base weld fatigue',()=>{
 it('reproduces an independent US-unit clip force path',()=>{
  // Hand-checked clip: base 3 in across the rail, 1/4 in fillets 3 in long at each end of the base; 6 in rail on a
  // 6 in base, no pad. Nose over the rail base 1/2 in (the lesser of 1/2 in and a quarter of the base outstand).
  const p=demonstrationProject();p.aist!.railPad=false;Object.assign(p.details!.rail.clip!,{baseWidth:3*inch,weld:.25*inch,weldLength:3*inch});
  const v=railClipResponse(p,1*kip),t=.25/Math.SQRT2,A=2*t*3,S=2*t*9/6;
  expect(v.A/inch**2).toBeCloseTo(A,10);expect(v.S/inch**3).toBeCloseTo(S,10);expect(v.upliftArm/inch).toBeCloseTo(1.5+.25,10);
  // Bearing clip: V = 1 kip at mid-height of the 3/4 in rail base. Hold-down clip: T = 1 x 6 / 6 = 1 kip at the nose.
  expect(v.roles[0].lateral/kip).toBe(1);expect(v.roles[0].moment/(kip*inch)).toBeCloseTo(.375,10);
  expect(v.roles[1].uplift/kip).toBeCloseTo(1,10);expect(v.roles[1].moment/(kip*inch)).toBeCloseTo(1.75,10);
  expect(v.roles[0].weldStress/ksi).toBeCloseTo(Math.hypot(1/A,.375/S),8);expect(v.weldStress/ksi).toBeCloseTo(1/A+1.75/S,8);
  expect(railClipResponse(p,-1*kip)).toEqual(v);
 });
 it('takes base welds shorter than four weld sizes at the AISC 360-16 J2.2b effective size L/4',()=>{
  const p=demonstrationProject();Object.assign(p.details!.rail.clip!,{weld:.375*inch,weldLength:1.25*inch});
  const v=railClipResponse(p,1*kip);expect(v.size/inch).toBeCloseTo(1.25/4,12);expect(v.throat/inch).toBeCloseTo(1.25/4/Math.SQRT2,12);
 });
 it('takes the RC register category from the clip base (AISC Table A-3.1 item 7.1; bolted clamp holes, item 2.2)',()=>{
  const cat=(c:Partial<NonNullable<ReturnType<typeof demonstrationProject>['details']>['rail']['clip']>)=>{const p=demonstrationProject();Object.assign(p.details!.rail.clip!,c);return automaticFatigueDetails(p).find(f=>f.id.startsWith('RC'))!;};
  const typical=cat({});expect(typical.category).toBe('D');expect(typical.name).toBe('Rail clip base weld 1 · left');expect(typical.reference).toContain('item 7.1');
  expect(cat({baseLength:1.75*inch}).category).toBe('C');expect(cat({baseLength:6*inch,baseThickness:.75*inch}).category).toBe('E');
  expect(cat({baseLength:6*inch,baseThickness:1*inch}).category).toBe('E1');expect(cat({type:'bolted'}).category).toBe('B');
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
  // The clip force is the side thrust alone: the same weld range in every bin.
  expect(r.railFatigueBins.every(b=>b.weldStress===r.railFatigueBins[0].weldStress&&b.weldStress>0)).toBe(true);
 });
 it('gives identical fatigue ranges under LRFD, ASD, impact and strength-envelope changes',()=>{
  const original=collect('LRFD');
  for(const alternate of [collect('ASD'),collect('LRFD',.5),collect('LRFD',.5,true),collect('LRFD',.25,false,1.1)]){
   alternate.r.railFatigueBins.forEach((b,i)=>{
    for(const key of ['vertical','lateral','weldStress'] as const)
     expect(b[key]/Math.max(1,original.r.railFatigueBins[i][key])).toBeCloseTo(original.r.railFatigueBins[i][key]/Math.max(1,original.r.railFatigueBins[i][key]),10);
   });
   alternate.r.fatigue.forEach((f,i)=>f.bins.forEach((b,j)=>{
    for(const key of ['minimum','maximum','range','damage'] as const)
     expect(b[key]).toBeCloseTo(original.r.fatigue[i].bins[j][key],8);
   }));
   const checks=railChecks({input:alternate.p,detailResults:alternate.r} as CalculationSnapshot);
   // One-signed clip weld force: each cycle ranges from zero to the bin value.
   expect(checks.find(c=>c.id==='rail-clip-weld-fatigue')!.demand).toBeCloseTo(Math.max(...original.r.railFatigueBins.map(b=>b.weldStress)),10);
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
