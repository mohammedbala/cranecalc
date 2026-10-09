import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import RunwayViewer from '../src/components/RunwayViewer';
import {defaultFraming} from '../src/components/framingSettings';
import {exampleProject} from '../src/engine/defaults';
import {sectionProperties} from '../src/engine/section';
import type {CalculationSnapshot,LoadCase} from '../src/engine/types';
import {viewerLoads,buildLoadArrows} from '../src/components/viewerLoads';

function snapshot():CalculationSnapshot{
 const input=structuredClone(exampleProject);input.spans=[6000];input.system='simple';input.deadLoad=1;input.railWeight=.5;input.units='SI';
 input.cranes=[{...input.cranes[0],name:'Crane A',longitudinal:3000,wheels:[{offset:0,loaded:8000,unloaded:1000,lateral:1000},{offset:3000,loaded:8000,unloaded:1000,lateral:500}]}];
 const moment:LoadCase={id:'M',positions:[1000],lateralSign:-1,points:[{x:1000,vertical:10000,lateral:1000,crane:'Crane A'},{x:4000,vertical:10000,lateral:-500,crane:'Crane A'}]};
 return {input,revision:'test',createdAt:'2026-10-08',errors:[],warnings:[],checks:[],eligible:false,referenceVersion:'',properties:sectionProperties(input.section),analysis:{cases:2,convergence:0,meshConvergence:0,equilibriumError:0,deadMoment:0,selfWeight:2,envelope:[],demand:{moment:0,lateralMoment:0,shear:0,reaction:0,uplift:0,deflection:0,lateralDeflection:0,stressRange:0,longitudinal:3000,reactions:[999999,999999],governing:{moment,reaction:{...moment,id:'R',positions:[0],points:moment.points.map(pt=>({...pt,x:pt.x-1000}))}}}}};
}
describe('3D load arrows from the selected analysis case',()=>{
 it('preserves impact-inclusive forces and individual signed side thrust without applying either twice',()=>{
  const s=snapshot(),before=JSON.stringify(s),loads=viewerLoads(s,'moment'),vertical=loads.filter(l=>l.kind==='vertical'),horizontal=loads.filter(l=>l.kind==='lateral');
  expect(vertical.map(l=>l.amount)).toEqual([10000,10000]);expect(vertical.every(l=>l.arrows[0].tip[1]<l.arrows[0].tail[1])).toBe(true);
  expect(horizontal.map(l=>l.amount)).toEqual([1000,-500]);expect(horizontal[0].arrows[0].tip[2]).toBeGreaterThan(horizontal[0].arrows[0].tail[2]);expect(horizontal[1].arrows[0].tip[2]).toBeLessThan(horizontal[1].arrows[0].tail[2]);
  expect(vertical[0].attachment[0]).toBe(-2);expect(vertical[0].label).toBe('V1 · 10 kN');expect(JSON.stringify(s)).toBe(before);
 });
 it('matches closed-form reactions and includes all dead load instead of reusing the peak-reaction envelope',()=>{
  const loads=viewerLoads(snapshot(),'moment'),reactions=loads.filter(l=>l.kind==='reaction'),dead=loads.find(l=>l.kind==='dead')!;
  expect(dead.amount).toBe(3.5);expect(dead.label).toBe('D1 · 3.5 kN/m');expect(dead.arrows).toHaveLength(5);
  const right=(10000*1000+10000*4000)/6000+3.5*6000/2;
  expect(reactions[1].amount).toBeCloseTo(right,5);expect(reactions[0].amount).toBeCloseTo(41000-right,5);
  expect(reactions.reduce((s,r)=>s+r.amount,0)).toBeCloseTo(41000,5);
  expect(reactions.every(r=>r.arrows[0].tip[1]>r.arrows[0].tail[1])).toBe(true);
 });
 it('moves forces and recomputes reactions when the selected governing position changes',()=>{
  const s=snapshot(),a=viewerLoads(s,'moment'),b=viewerLoads(s,'reaction');
  expect(b.find(l=>l.id==='V1')!.x).toBe(0);expect(a.find(l=>l.id==='V1')!.x).toBe(1000);
  expect(b.find(l=>l.id==='R1')!.amount-a.find(l=>l.id==='R1')!.amount).toBeCloseTo(20000/6,5);
 });
 it('shows downward hold-down arrows for a continuous span with uplift',()=>{
  const s=snapshot();s.input.spans=[6000,6000];s.input.system='continuous';s.input.deadLoad=0;s.input.railWeight=0;s.analysis!.selfWeight=0;
  s.analysis!.demand.governing.moment.points=[{x:3000,vertical:10000,lateral:0,crane:'Crane A'}];
  const reactions=viewerLoads(s,'moment').filter(l=>l.kind==='reaction'),far=reactions.at(-1)!;
  expect(reactions[0].amount).toBeCloseTo(4062.5,4);expect(reactions[1].amount).toBeCloseTo(6875,4);expect(far.amount).toBeCloseTo(-937.5,4);
  expect(far.arrows[0].tip[1]).toBeLessThan(far.arrows[0].tail[1]);expect(far.description).toContain('uplift');
 });
 it('shows traction as a separate reversible resultant and omits cranes off the runway',()=>{
  const s=snapshot(),traction=viewerLoads(s,'moment').filter(l=>l.kind==='traction');
  expect(traction).toHaveLength(1);expect(traction[0].mode).toBe('traction');expect(traction[0].label).toBe('T1 · ±3 kN');expect(traction[0].x).toBe(2500);
  const [a,b]=traction[0].arrows;expect(a.tip[0]-a.tail[0]).toBeCloseTo(-(b.tip[0]-b.tail[0]),8);
  s.analysis!.demand.governing.moment.positions=[9000];expect(viewerLoads(s,'moment').filter(l=>l.kind==='traction')).toHaveLength(0);
 });
 it('handles US units, zero side thrust and unavailable current results',()=>{
  const s=snapshot();s.input.units='US';s.analysis!.demand.governing.moment.points.forEach(pt=>pt.lateral=0);
  const loads=viewerLoads(s,'moment');expect(loads.some(l=>l.kind==='lateral')).toBe(false);expect(loads[0].label).toBe('V1 · 2.25 kip');expect(loads.find(l=>l.kind==='dead')!.label).toContain('kip/ft');
  expect(viewerLoads(null,'moment')).toEqual([]);expect(viewerLoads({...s,analysis:null},'moment')).toEqual([]);expect(viewerLoads(s,'unknown')).toEqual([]);
 });
 it('keeps arrows as a separate overlay with selectable visibility and finite solid geometry',()=>{
  const overlay=buildLoadArrows(viewerLoads(snapshot(),'moment'));
  for(const mode of ['applied','reactions','traction','off'] as const){overlay.setView(mode);expect(overlay.group.children.filter(c=>c.visible).map(c=>c.name)).toEqual(mode==='off'?[]:[`load-view-${mode}`]);}
  overlay.group.traverse(o=>{expect(o.userData.part).toBeUndefined();if(o instanceof THREE.Mesh){expect([...o.geometry.getAttribute('position').array].every(Number.isFinite)).toBe(true);expect((o.material as THREE.MeshBasicMaterial).depthTest).toBe(false);}});
  expect(new THREE.Box3().setFromObject(overlay.group).isEmpty()).toBe(false);
 });
 it('renders enabled load controls and removes obsolete values while awaiting a current result',()=>{
  const s=snapshot(),render=(value:CalculationSnapshot|null)=>renderToStaticMarkup(createElement(RunwayViewer,{input:s.input,snapshot:value,framing:defaultFraming,setFraming:()=>{}}));
  const html=render(s);expect(html).toContain('data-load-view="applied"');expect(html).toContain('V1 · 10 kN');expect(html).toContain('aria-label="3D load arrows"');expect(html).toContain('Bearing reactions');
  const pending=render(null);expect(pending).toContain('Load arrows appear when the current calculation is available.');expect(pending).not.toContain('V1 · 10 kN');
 });
});
