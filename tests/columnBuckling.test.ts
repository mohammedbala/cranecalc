import {describe,it,expect} from 'vitest';
import {columnBuckling,columnResponse,steppedStiffness} from '../src/engine/columnAnalysis';

const H=9000,EI=200000*3e8;
const euler=(K:number,EIx=EI,L=H)=>Math.PI**2*EIx/(K*L)**2;
describe('columnBuckling: prismatic columns against the closed forms',()=>{
 // AISC 360-16 Commentary Table C-A-7.1 theoretical K: fixed-free 2.0, pinned-pinned 1.0, fixed-pinned 0.699, fixed-fixed 0.5.
 const cases:[string,Parameters<typeof columnBuckling>[2],number][]=[
  ['fixed base, free top (K = 2)',{base:'fixed',top:'free'},2],
  ['pinned base, braced top (K = 1)',{base:'pinned',top:'braced'},1],
  ['fixed base, braced top (K = 0.6992, β = 4.4934)',{base:'fixed',top:'braced'},Math.PI/4.493409457909064],
  ['fixed base, braced top held against rotation (K = 0.5)',{base:'fixed',top:'braced',topRotation:'fixed'},.5],
  ['fixed base, top guided against rotation but free to sway (K = 1)',{base:'fixed',top:'free',topRotation:'fixed'},1],
 ];
 for(const [name,boundary,K] of cases)it(name,()=>{
  const P=1e5,b=columnBuckling(H,EI,boundary,()=>P);
  expect(b.factor*P/euler(K)).toBeCloseTo(1,6);
  expect(b.effectiveLength(EI,P)/(K*H)).toBeCloseTo(1,6);
  expect(b.convergence).toBeLessThan(1e-6);
 });
 it('scales with the reference load and is infinite with nothing in compression',()=>{
  const a=columnBuckling(H,EI,{base:'pinned',top:'braced'},()=>1),b=columnBuckling(H,EI,{base:'pinned',top:'braced'},()=>250);
  expect(a.factor/b.factor).toBeCloseTo(250,6);
  const t=columnBuckling(H,EI,{base:'pinned',top:'braced'},()=>-1e5);expect(t.factor).toBe(Infinity);expect(t.effectiveLength(EI,1)).toBe(Infinity);
  expect(columnBuckling(H,EI,{base:'fixed',top:'free'},()=>0).factor).toBe(Infinity);
 });
 it('a cantilever under its own weight: (qL)cr = 7.837 EI/L² (Timoshenko & Gere §2.13)',()=>{
  const q=10,b=columnBuckling(H,EI,{base:'fixed',top:'free'},x=>q*(H-x),[],{elements:96});
  expect(b.factor*q*H/(7.837*EI/H**2)).toBeCloseTo(1,3);
 });
 it('an elastic spring at the top of a pinned column: rigid enough, it is a braced column (K = 1); none, unstable',()=>{
  expect(()=>columnBuckling(H,EI,{base:'pinned',top:'free'},()=>1)).toThrow('unstable');
  const P=1e5,stiff=columnBuckling(H,EI,{base:'pinned',top:'free',springs:[{x:H,k:1e9}]},()=>P);
  expect(stiff.factor*P/euler(1)).toBeCloseTo(1,3);
  // A spring of k < π²EI/L³ buckles the column as a rigid bar rotating about the base: P_cr = kL.
  const soft=columnBuckling(H,EI,{base:'pinned',top:'free',springs:[{x:H,k:.1*EI*Math.PI**2/H**3}]},()=>P);
  expect(soft.factor*P/(.1*EI*Math.PI**2/H**2)).toBeCloseTo(1,4);
 });
});

/**
 * A fixed-base, free-top stepped column: lower shaft EI2 over 0..a with N2 = P1 + P2 (the crane reaction P2 at the step),
 * upper shaft EI1 over a..L with P1 at the top. With δ − y = D sin k1(L − x) above the step and y = c(1 − cos k2 x) below
 * it, moment equilibrium of the lower shaft (N2 c = P1 δ + P2 y_a) and continuity of y and y′ at the step give
 *   tan(k1 l1) · tan(k2 a) = √(N2 EI2 / (P1 EI1)),  k1² = λP1/EI1, k2² = λN2/EI2, l1 = L − a,
 * which reduces to Timoshenko & Gere §2.9, tan k1l1 · tan k2l2 = k1/k2, for P2 = 0, and to K = 2 for a prismatic column.
 */
function steppedCantilever(L:number,a:number,EI1:number,EI2:number,P1:number,P2:number){
 const N2=P1+P2,rhs=Math.sqrt(N2*EI2/(P1*EI1)),k1=(l:number)=>Math.sqrt(l*P1/EI1),k2=(l:number)=>Math.sqrt(l*N2/EI2);
 let hi=Math.min((Math.PI/2/(L-a))**2*EI1/P1,(Math.PI/2/a)**2*EI2/N2)*(1-1e-12),lo=0;
 for(let i=0;i<200;i++){const m=(lo+hi)/2;if(Math.tan(k1(m)*(L-a))*Math.tan(k2(m)*a)>rhs)hi=m;else lo=m;}
 return (lo+hi)/2;
}
describe('columnBuckling: a stepped column against its characteristic equation',()=>{
 const a=6000,EI1=EI/4,EI2=EI,P1=1e5,P2=3e5;
 it('fixed base, free top, upper shaft one quarter as stiff, three times the top load at the step',()=>{
  const reference=steppedCantilever(H,a,EI1,EI2,P1,P2);
  const b=columnBuckling(H,steppedStiffness(a,EI2,EI1),{base:'fixed',top:'free'},x=>x<a?P1+P2:P1,[a]);
  expect(b.factor/reference).toBeCloseTo(1,6);
  // Effective lengths per shaft, Lc,i = π√(EI_i/(λ P_i)) (AISC 360-16 Appendix 7 §7.2 Commentary).
  expect(b.effectiveLength(EI2,P1+P2)).toBeCloseTo(Math.PI*Math.sqrt(EI2/(reference*(P1+P2))),3);
  // EI/P is the same in both shafts here, so the shafts share one effective length: K = 2.29 on the lower shaft's height, 4.59 on the upper's.
  expect(b.effectiveLength(EI1,P1)).toBeCloseTo(b.effectiveLength(EI2,P1+P2),6);
  expect(b.effectiveLength(EI2,P1+P2)/a).toBeGreaterThan(2);
 });
 it('reduces to Timoshenko & Gere §2.9 with the load at the top only, and to the lower cantilever with an unloaded upper shaft',()=>{
  const top=columnBuckling(H,steppedStiffness(a,EI2,EI1),{base:'fixed',top:'free'},()=>P1,[a]);
  expect(top.factor/steppedCantilever(H,a,EI1,EI2,P1,0)).toBeCloseTo(1,6);
  // P_u = 0: the lower shaft is a cantilever of height a under P2, K = 2 on a.
  const step=columnBuckling(H,steppedStiffness(a,EI2,EI1),{base:'fixed',top:'free'},x=>x<a?P2:0,[a]);
  expect(step.factor*P2/euler(2,EI2,a)).toBeCloseTo(1,5);
 });
 it('a crane column braced at the top: the upper shaft in tension raises the buckling factor',()=>{
  const none=columnBuckling(H,steppedStiffness(a,EI2,EI1),{base:'pinned',top:'braced'},x=>x<a?P2:0,[a]);
  const pulled=columnBuckling(H,steppedStiffness(a,EI2,EI1),{base:'pinned',top:'braced'},x=>x<a?P2:-P1,[a]);
  expect(pulled.factor).toBeGreaterThan(none.factor);
  // Bounded by the lower shaft fixed at the step (K = 0.6992 on a) and the full height in the upper shaft's stiffness under the lower shaft's load.
  expect(none.factor*P2).toBeLessThan(euler(Math.PI/4.493409457909064,EI2,a));expect(none.factor*P2).toBeGreaterThan(euler(1,EI1,H));
 });
});

describe('columnResponse with stiffness varying along the height',()=>{
 it('a stepped cantilever: tip deflection P[(L³ − l1³)/(3EI2) + l1³/(3EI1)] under a tip load, l1 = L − a',()=>{
  const a=6000,EI1=EI/4,EI2=EI,P=1000,l1=H-a,r=columnResponse(H,steppedStiffness(a,EI2,EI1),{base:'fixed',top:'free'},[{x:H,force:P}],[a]);
  expect(r.displacement(H)/(P*((H**3-l1**3)/(3*EI2)+l1**3/(3*EI1)))).toBeCloseTo(1,9);
  expect(Math.abs(r.reactions.baseMoment)).toBeCloseTo(P*H,6);
 });
 it('a constant stiffness given as a function gives the numeric result',()=>{
  const loads=[{x:4000,force:1000},{x:7000,moment:2e6}],a=columnResponse(H,EI,{base:'fixed',top:'braced'},loads),b=columnResponse(H,()=>EI,{base:'fixed',top:'braced'},loads);
  expect(b.reactions.top).toBeCloseTo(a.reactions.top,9);expect(b.displacement(4000)).toBeCloseTo(a.displacement(4000),12);
 });
});
