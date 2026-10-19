import {describe,expect,it} from 'vitest';
import {majorBySign} from '../src/engine/aistChecks';
import {flangeStrengths} from '../src/engine/designAnalysis';
import {girderStrength,interaction} from '../src/engine/aiscStrength';
import {sectionProperties} from '../src/engine/section';
import {cappedDemonstrationProject,demonstrationProject} from '../src/engine/demonstration';
import type {DesignAnalysis} from '../src/engine/types';

const kipft=1355817.9483314;
describe('girder flexure by the sign of the moment (v2:21)',()=>{
 const capped={...cappedDemonstrationProject(),system:'continuous' as const},str=girderStrength(capped,sectionProperties(capped.section));
 it('gives a capped section a positive (cap in compression) and a negative (W bottom flange) strength, and tension-flange strengths',()=>{
  expect(str.majorReverse).toBeDefined();
  // F4.4: the tension flange's yielding strength is never below the member strength of that sign.
  expect(str.tensionMajor!).toBeGreaterThanOrEqual(str.major*(1-1e-12));
  expect(str.tensionMajorReverse!).toBeGreaterThanOrEqual(str.majorReverse!*(1-1e-12));
 });
 it('checks M+ against M_c+ and M- against M_c-, the larger ratio governing (M+ > M_c- > M-)',()=>{
  const Mc=str.major,McR=str.majorReverse!;
  const a={moment:1.4*McR,momentPositive:1.4*McR,momentNegative:.9*McR,governing:{}} as unknown as DesignAnalysis;
  expect(1.4*McR).toBeLessThan(Mc);
  const r=majorBySign(capped,a,str);
  expect(r.sign).toBe(1.4*McR/Mc>.9?'positive':'negative');
  expect(r.demand/r.capacity).toBeCloseTo(Math.max(1.4*McR/Mc,.9),9);
  expect(r.demand/r.capacity).toBeLessThan(1);
  // Simple spans and W girders: the largest moment against the one strength.
  const simple=majorBySign({...capped,system:'simple'},a,str);expect(simple.demand).toBe(a.moment);expect(simple.capacity).toBe(Mc);
 });
 it('takes the compression-flange strength at the compressed flange and the yielding strength at the tension flange (H1)',()=>{
  const {top,bottom}=flangeStrengths(str);
  // Positive moment: top flange in compression (major), bottom flange in tension (tensionMajor).
  expect(top.major).toBe(str.major);expect(bottom.major).toBe(str.tensionMajor);
  // Negative moment: bottom flange in compression (majorReverse), top flange in tension.
  expect(bottom.majorReverse).toBe(str.majorReverse);expect(top.majorReverse).toBe(str.tensionMajorReverse);
  const M=200*kipft,u=(s:typeof top,m:number)=>interaction(0,m,0,s,capped.method).utilization;
  expect(u(top,M)).toBeCloseTo(M/str.major,9);expect(u(bottom,M)).toBeCloseTo(M/str.tensionMajor!,9);
  expect(u(bottom,-M)).toBeCloseTo(M/str.majorReverse!,9);expect(u(top,-M)).toBeCloseTo(M/str.tensionMajorReverse!,9);
 });
 it('gives a rolled W its plastic moment (with the F13 net-section cap) as the tension-flange strength',()=>{
  const p=demonstrationProject(),props=sectionProperties(p.section),w=girderStrength(p,props),Mp=p.method==='LRFD'?.9*p.section.Fy*props.Zx:p.section.Fy*props.Zx/1.67;
  expect(w.tensionMajor).toBeCloseTo(w.netLimitApplies?Math.min(Mp,w.netMoment):Mp,3);
  const gross={...p,aist:{...p.aist!,netFlangeArea:undefined}},g=girderStrength(gross,props);
  expect(g.netLimitApplies).toBe(false);expect(g.tensionMajor).toBeCloseTo(Mp,3);
  expect(w.tensionMajor!).toBeGreaterThanOrEqual(w.major*(1-1e-12));
 });
});
