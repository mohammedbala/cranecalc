import {describe,expect,it} from 'vitest';
import {calculate} from '../src/engine/calculate';
import {exampleProject} from '../src/engine/defaults';
import {movingAnalysis} from '../src/engine/analysis';
import {sectionProperties} from '../src/engine/section';
import {cranePositions,pairs} from '../src/engine/cranePositions';
import type {ProjectInput} from '../src/engine/types';

const L=7620;
const twoCranes=()=>{const p=structuredClone(exampleProject);const c=structuredClone(p.cranes[0]);c.id='c2';c.name='Crane 2';p.cranes.push(c);p.cranes.forEach(v=>{v.travelStart=-v.wheels.at(-1)!.offset;v.travelEnd=L;});return p;};
// Brute force: the two cranes at closest approach moved in 1 mm steps over a simple span with its UDL;
// the moment is taken at every wheel and at each zero-shear point between wheels.
function bruteMaximum(p:ProjectInput,q:number){
 const [a,b]=p.cranes,P=(c:typeof a)=>c.wheels.map(w=>w.loaded*(c.includesImpact?1:1+c.impact)),gap=a.wheels.at(-1)!.offset+Math.max(a.minSeparation,b.minSeparation);
 const train=[...a.wheels.map((w,i)=>({d:w.offset,P:P(a)[i]})),...b.wheels.map((w,i)=>({d:gap+w.offset,P:P(b)[i]}))];
 let best=0;
 for(let o=-train.at(-1)!.d;o<=L;o+=1){
  const loads=train.map(w=>({x:o+w.d,P:w.P})).filter(w=>w.x>=0&&w.x<=L).sort((u,v)=>u.x-v.x);
  const RA=q*L/2+loads.reduce((s,w)=>s+w.P*(L-w.x),0)/L;
  const M=(x:number)=>RA*x-q*x*x/2-loads.reduce((s,w)=>s+(w.x<x?w.P*(x-w.x):0),0);
  const xs=[...loads.map(w=>w.x)];let left=0;
  for(let i=0;i<=loads.length;i++){const lo=i?loads[i-1].x:0,hi=i<loads.length?loads[i].x:L,x=(RA-left)/q;if(x>lo&&x<hi)xs.push(x);if(i<loads.length)left+=loads[i].P;}
  for(const x of xs)best=Math.max(best,M(x));
 }
 return best;
}

describe('moving-load positions for several cranes',()=>{
 it('finds the two-crane absolute maximum moment at the coarsest travel sampling',()=>{
  const p=twoCranes(),props=sectionProperties(p.section),q=p.deadLoad+p.railWeight+props.weight;
  const exact=bruteMaximum(p,q),found=movingAnalysis(p,props).demand.moment;
  expect(found).toBeLessThanOrEqual(exact*(1+1e-9));expect(found/exact).toBeGreaterThan(.999);
 },60000);
 it('pairs a coupled position only with its partner crane',()=>{
  const p=twoCranes(),stations=[0,L],sets=cranePositions(p,12,stations),gap=p.cranes[0].wheels.at(-1)!.offset+1500;
  const behind=sets[1].filter(v=>v.after!==undefined),ahead=sets[0].filter(v=>v.before!==undefined);
  expect(behind.length).toBeGreaterThan(0);expect(ahead.length).toBeGreaterThan(0);
  for(const v of behind)expect(v.origin-v.after!).toBeCloseTo(gap,9);
  const partner=behind[0],lead=sets[0].find(v=>v.origin===partner.after)!;
  expect(pairs(p,1,partner,{index:0,position:lead})).toBe(true);
  expect(pairs(p,1,partner,{index:0,position:{origin:lead.origin-1}})).toBe(false);
  const front=ahead[0];expect(pairs(p,1,{origin:front.before!+1},{index:0,position:front})).toBe(false);
 });
 it('converges the two-crane AIST design search within the refinement limit',()=>{
  const s=calculate(twoCranes());
  expect(s.checks.find(c=>c.id==='design-travel')!.status).toBe('pass');
 },300000);
});
