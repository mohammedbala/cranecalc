import {describe,expect,it} from 'vitest';
import {exampleProject} from '../src/engine/defaults';
import {sectionProperties} from '../src/engine/section';
import {girderStrength} from '../src/engine/aiscStrength';
import {runwayDesignAnalysis} from '../src/engine/designAnalysis';
import {supportReactions} from '../src/engine/supportReactions';
import {craneDesignMinimum,emptyAistInputs} from '../src/engine/aistLoads';
import type {ProjectInput} from '../src/engine/types';

const design=(p:ProjectInput)=>{const props=sectionProperties(p.section);return runwayDesignAnalysis(p,props,girderStrength(p,props),24,20);};
const twoCranes=()=>{const p=structuredClone(exampleProject);const c=structuredClone(p.cranes[0]);c.id='c2';c.name='Crane 2';p.cranes.push(c);p.cranes.forEach(v=>{v.travelStart=-v.wheels.at(-1)!.offset;});return p;};

describe('crane load options',()=>{
 it('adds the rail-head longitudinal couple to the bearing reactions',()=>{
  const p=structuredClone(exampleProject),L=p.spans[0],railTop=p.section.d+(p.aist?.railDepth||p.railHeight);
  const Cls=Math.max(p.cranes[0].longitudinal,craneDesignMinimum(p.cranes[0]).traction);
  expect(supportReactions(p,sectionProperties(p.section)).supports[0].Clv).toBeCloseTo(Cls*railTop/L,9);
  // Raising the rail raises the couple: the factored reaction grows by the traction times the extra lever over the span.
  const higher=structuredClone(p);higher.railHeight+=100;if(higher.aist)higher.aist.railDepth=(higher.aist.railDepth||p.railHeight)+100;
  const a=design(p),b=design(higher),c=a.governing.reaction!;
  expect(b.reaction-a.reaction).toBeGreaterThan(0);expect(b.reaction-a.reaction).toBeLessThanOrEqual(1.6*Cls*100/L*(1+1e-9));
  expect(c.id).toMatch(/LRFD/);
 },120000);
 it('bases fatigue on one crane at a time when selected',()=>{
  const all=twoCranes(),single=twoCranes();single.aist={...emptyAistInputs,...single.aist,fatigueCranes:'single'};
  const one=structuredClone(exampleProject);one.cranes[0].travelStart=-one.cranes[0].wheels.at(-1)!.offset;
  const range=(p:ProjectInput)=>{const a=design(p);return a.fatigueMax-a.fatigueMin;};
  expect(range(single)).toBeLessThan(range(all));
  expect(range(single)).toBeCloseTo(range(one),6);
 },120000);
 it('adds the fully concurrent ASCE 7 combination when selected',()=>{
  const tr13=twoCranes(),full=twoCranes();full.aist={...emptyAistInputs,...full.aist,concurrency:'full'};
  const a=design(tr13),b=design(full);
  expect(a.combinations.some(c=>c.id==='LRFD C1')).toBe(false);expect(b.combinations.some(c=>c.id==='LRFD C1')).toBe(true);
  expect(b.interaction).toBeGreaterThan(a.interaction);
 },120000);
});
