import {describe,expect,it} from 'vitest';
import {calculate,validateProject} from '../src/engine/calculate';
import {exampleProject} from '../src/engine/defaults';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {supportReactions} from '../src/engine/supportReactions';
import {sectionProperties} from '../src/engine/section';
import {girderStrength} from '../src/engine/aiscStrength';
import {runwayDesignAnalysis} from '../src/engine/designAnalysis';
import {movingAnalysis} from '../src/engine/analysis';
import {stopEnds} from '../src/engine/endStopInputs';
import {drawingSheetSet} from '../src/components/planSheet';
import type {ProjectInput} from '../src/engine/types';

const L=7620,foot=304.8;
const texts=(svg:string)=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&')).join(' ');
// Two identical cranes; the audit case where an end-of-model support lost a quarter of its reaction.
const twoCranes=()=>{const p=structuredClone(exampleProject);const c=structuredClone(p.cranes[0]);c.id='c2';c.name='Crane 2';p.cranes.push(c);return p;};
const travel=(p:ProjectInput,start:number,end:number)=>{p.cranes.forEach(c=>{c.travelStart=start-c.wheels.at(-1)!.offset;c.travelEnd=end;});return p;};
const twoBays=()=>{const p=travel(twoCranes(),0,2*L);p.spans=[L,L];return p;};
const continued=()=>{const p=travel(twoCranes(),-L,L);p.continuation={left:L,right:0,source:'Existing W24 girders, spans field measured'};return p;};

describe('runway continuing beyond a modeled end',()=>{
 it('loads a continued end support like the interior support of the longer runway',()=>{
  const two=twoBays(),one=continued(),plain=travel(twoCranes(),0,L);
  for(const p of [two,one,plain])expect(validateProject(p)).toEqual([]);
  const r=(p:ProjectInput)=>supportReactions(p,sectionProperties(p.section)).supports;
  const interior=r(two)[1],end=r(one)[0];
  for(const k of ['D','L','Cd','Cv','Ci','Css'] as const)expect(end[k]).toBeCloseTo(interior[k],6);
  expect(end.Cd+end.Cv+end.Ci).toBeGreaterThan(1.2*(r(plain)[0].Cd+r(plain)[0].Cv+r(plain)[0].Ci));
  const design=(p:ProjectInput)=>{const props=sectionProperties(p.section);return runwayDesignAnalysis(p,props,girderStrength(p,props),24,20);};
  const a2=design(two),a1=design(one);
  expect(a1.reaction).toBeCloseTo(a2.reaction,4);expect(a1.serviceReaction).toBeCloseTo(a2.serviceReaction,4);
  const m=(p:ProjectInput)=>movingAnalysis(p,sectionProperties(p.section)).demand.reaction;
  expect(m(one)).toBeCloseTo(m(two),4);
 },120000);
 it('accepts travel onto an adjacent bay only where one is entered',()=>{
  const p=continued();expect(validateProject(p)).toEqual([]);
  const none=structuredClone(p);delete none.continuation;expect(validateProject(none).some(e=>e.startsWith('cranes.0.travel'))).toBe(true);
  const source=structuredClone(p);source.continuation!.source=' ';expect(validateProject(source).some(e=>e.startsWith('continuation.source'))).toBe(true);
  const continuous=structuredClone(p);continuous.system='continuous';expect(validateProject(continuous).some(e=>e.startsWith('continuation:'))).toBe(true);
 });
 it('designs the shared bracket and stops for a capped runway that continues to the right',()=>{
  const p=cappedDemonstrationProject();p.continuation={left:0,right:25*foot,source:'Existing W24 girders, spans field measured'};p.cranes.forEach(c=>c.travelEnd=100*foot);
  const s=calculate(p);expect(s.errors).toEqual([]);
  expect(s.checks.filter(c=>!['pass','not-applicable','excluded'].includes(c.status))).toEqual([]);
  expect(stopEnds(p)).toEqual(['left']);expect(s.checks.filter(c=>c.id.startsWith('detail-fatigue-SH')).length).toBe(4);
  // The end bracket at grid 4 carries the existing girder too, as the interior brackets carry two girders.
  const at=(x:number)=>s.detailResults!.interfaces.filter(r=>Math.abs(r.x-x)<1),Lm=75*foot;
  expect(at(Lm).some(r=>r.ends?.some(e=>e.existing&&e.vertical>0))).toBe(true);
  expect(Math.max(...at(Lm).map(r=>r.vertical))).toBeCloseTo(Math.max(...at(50*foot).map(r=>r.vertical)),3);
  expect(at(0).some(r=>r.ends?.some(e=>e.existing))).toBe(false);
  const set=drawingSheetSet(s),sheet=(n:string)=>set.find(v=>v.number===n)!.svg;
  expect(sheet('S-01')).toContain('data-existing-bay="right"');expect(sheet('S-01')).not.toContain('data-existing-bay="left"');
  expect(texts(sheet('S-01'))).toContain('EXISTING RUNWAY CONTINUES');expect(texts(sheet('S-01'))).toContain('END STOP, TYP. 2');
  expect(texts(sheet('S-07'))).toContain('2: THE LEFT END (GRID 1) OF BOTH RUNWAYS');
  expect(texts(sheet('S-00'))).toContain('THE REACTIONS INCLUDE THE EXISTING ADJACENT');
 },300000);
});
