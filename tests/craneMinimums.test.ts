import {describe,it,expect} from 'vitest';
import {aistCraneMinimum,asceCraneMinimum,craneDesignMinimum} from '../src/engine/aistLoads';
import {calculate} from '../src/engine/calculate';
import {designProject} from './fixtures/aistProject';

// Fixture crane: Q=136 kN, T=18 kN, B=70 kN, two 110 kN static wheels on this runway.
const crane=()=>designProject().cranes[0];
describe('ASCE 7 §4.9 minimums enveloped with AIST TR-13',()=>{
 it('adopts 25% impact for a cab-operated maintenance crane where AIST gives 20%',()=>{
  const c=crane();c.design!.type='maintenance';
  expect(aistCraneMinimum(c).impact).toBe(.2);expect(asceCraneMinimum(c).impact).toBe(.25);expect(craneDesignMinimum(c).impact).toBe(.25);
  c.design!.control='pendant';expect(craneDesignMinimum(c).impact).toBe(.1);
 });
 it('adopts 0.2(Q+T) side thrust for pendant cranes where the AIST rule is lower',()=>{
  const c=crane();c.design!.control='pendant';
  const m=craneDesignMinimum(c);
  expect(m.aist.totalSide).toBeCloseTo(.1*(136000+18000+70000),6);expect(m.asce.totalSide).toBeCloseTo(.2*(136000+18000),6);
  expect(m.totalSide).toBeCloseTo(30800,6);expect(m.runwaySide).toBeCloseTo(15400,6);
  c.design!.control='cab';expect(craneDesignMinimum(c).totalSide).toBeCloseTo(.4*136000,6);
 });
 it('adopts 10% of the maximum static wheel loads as the longitudinal floor',()=>{
  const c=crane();c.design!.drivenWheelLoad=50000;
  expect(aistCraneMinimum(c).traction).toBe(10000);expect(craneDesignMinimum(c).traction).toBeCloseTo(22000,6);
  // Impact-inclusive schedules are normalized back to static wheel loads.
  c.includesImpact=true;c.wheels=c.wheels.map(w=>({...w,loaded:w.loaded*1.25}));
  expect(asceCraneMinimum(c).longitudinal).toBeCloseTo(22000,6);
 });
 it('never credits a runway with less than half the whole-crane side thrust',()=>{
  const c=crane();
  for(const share of [0,.25])expect(craneDesignMinimum({...c,design:{...c.design!,sideShare:share}}).runwaySide).toBeCloseTo(.5*54400,6);
  expect(craneDesignMinimum({...c,design:{...c.design!,sideShare:.8}}).runwaySide).toBeCloseTo(.8*54400,6);
 });
 it('carries the governing minimums into the factored design demand',()=>{
  const base=designProject();base.cranes[0].design!.type='maintenance';base.cranes[0].impact=.2;
  const low=calculate(base),explicit=structuredClone(base);explicit.cranes[0].impact=.25;const ref=calculate(explicit);
  expect(low.designAnalysis!.moment).toBeCloseTo(ref.designAnalysis!.moment,6);
  expect(low.checks.find(c=>c.id==='crane-1-impact')).toMatchObject({status:'pass',demand:.25,capacity:.25});
  const zero=designProject();zero.cranes[0].design!.sideShare=0;const half=designProject();
  expect(calculate(zero).designAnalysis!.topLateralMoment).toBeCloseTo(calculate(half).designAnalysis!.topLateralMoment,6);
 });
 it('reports the side-thrust row as failing when no wheel pattern carries the minimum',()=>{
  const p=designProject();p.cranes[0].wheels=p.cranes[0].wheels.map(w=>({...w,lateral:0}));
  const s=calculate(p);
  expect(s.checks.find(c=>c.id==='crane-1-side')?.status).toBe('fail');expect(s.checks.find(c=>c.id==='crane-1-side-pattern')?.status).toBe('incomplete');
 });
});
