import {describe,it,expect} from 'vitest';
import {supportReactions} from '../src/engine/supportReactions';
import {sectionProperties} from '../src/engine/section';
import {movingAnalysis} from '../src/engine/analysis';
import {demonstrationProject} from '../src/engine/demonstration';
import {designProject} from './fixtures/aistProject';

const kip=4448.221615;
describe('unfactored support reactions by load type',()=>{
 it('matches closed-form reactions at shared simple-span supports',()=>{
  // Two 20 kip static wheels (8 kip empty) at 10 ft on 25 ft bays: one wheel over the
  // support and the other 10 ft into the adjacent bay gives R = P(1 + 15/25) = 1.6P.
  const p=demonstrationProject(),props=sectionProperties(p.section),r=supportReactions(p,props);
  const interior=r.supports[1],q=p.deadLoad+p.railWeight+props.weight;
  expect(interior.Cd/kip).toBeCloseTo(1.6*8,6);expect(interior.Cv/kip).toBeCloseTo(1.6*12,6);expect(interior.Ci/kip).toBeCloseTo(1.6*.25*20,6);
  expect(interior.Css/kip).toBeCloseTo(1.6*2,6); // 2 kip per wheel already meets the 4 kip runway minimum
  expect(interior.D).toBeCloseTo(q*p.spans[0],6);expect(r.supports[0].D).toBeCloseTo(q*p.spans[0]/2,6);
  expect(r.Cls/kip).toBeCloseTo(4,6);
 });
 it('reproduces the moving-load reaction envelope with dead load and impact',()=>{
  const p=designProject(),props=sectionProperties(p.section),r=supportReactions(p,props);
  const total=Math.max(...r.supports.map(s=>s.D+s.Cd+s.Cv+s.Ci));
  expect(total/movingAnalysis(p,props,40).demand.reaction).toBeCloseTo(1,4);
 });
 it('superposes several cranes only where order and separation allow',()=>{
  const p=demonstrationProject(),props=sectionProperties(p.section);
  const one=supportReactions(p,props).supports[1];
  p.cranes.push({...structuredClone(p.cranes[0]),id:'crane-2',name:'Second crane'});
  p.cranes.forEach(c=>c.minSeparation=1000);
  const two=supportReactions(p,props,20).supports[1];
  expect(two.Cd+two.Cv+two.Ci).toBeGreaterThan(one.Cd+one.Cv+one.Ci);
  expect(two.cranes).toHaveLength(2);
  const [a,b]=two.cranes,last=p.cranes[0].wheels.at(-1)!.offset;
  expect(b.origin-(a.origin+last)).toBeGreaterThanOrEqual(1000-1e-6);
 },60000);
});
