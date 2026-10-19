import {beforeAll,describe,expect,it} from 'vitest';
import {buildProject,steppedLowerFor} from '../src/engine/configurator';
import {templateById} from '../src/engine/templates';
import {defaultRunwayConfig,type RunwayConfig} from '../src/engine/configInputs';
import {calculate,validateProject} from '../src/engine/calculate';
import {classifyCheck} from '../src/engine/checkTaxonomy';
import {steppedTwistLimit} from '../src/engine/steppedColumn';
import type {CalculationSnapshot} from '../src/engine/types';

/**
 * Round-5 review of the stepped-column package: the existing shafts are never resized, the lower shaft's twist at the
 * step is limited, the braced-top and girder-line strut assumptions are EOR items with their forces, the step has its
 * fatigue checks and the seat on the existing cap is checked with the modeled geometry.
 */
const cfg=(c:Partial<RunwayConfig>):RunwayConfig=>({...defaultRunwayConfig,title:'Stepped',units:'US',method:'LRFD',scope:'design',cranes:1,system:'simple',girder:'rolled',structure:'existing',support:'stepped-column',tie:'paired-bars',control:'cab',cmaa:'C',buildingClass:'C',...c});

describe('stepped column: existing shafts are never resized by the configurator',()=>{
 it('takes one assumed lower shaft per crane class (no W36 to W44 for a short tie), and reports the tie and the shaft ratios',()=>{
  for(const [capacity,expected] of [[10,'W30X173'],[20,'W33X201']] as const){
   const p=buildProject(cfg({capacity,craneSpan:70,bays:4,span:30,railElevation:32}));
   expect(validateProject(p)).toEqual([]);
   expect(p.existingColumn!.shape).toBe(expected);expect(steppedLowerFor(capacity)).toBe(expected);
   const row=p.configurator!.selections!.find(s=>s.item==='Lower shaft (stepped column)')!;
   expect(row.reason).toMatch(/does not resize it/);expect(row.reason).toMatch(/Existing shafts as assumed: H1 ratio upper \d\.\d\d, lower \d\.\d\d/);
   expect(row.reason).not.toMatch(/deeper lower shaft/);
  }
 },300000);
 it('keeps an entered lower shaft, logging its ratio',()=>{
  const p=buildProject(cfg({capacity:15,craneSpan:45,bays:4,span:22.5,railElevation:27,cmaa:'D',system:'continuous',columnShape:'W30X191'}));
  expect(p.existingColumn!.shape).toBe('W30X191');
  expect(p.configurator!.selections!.find(s=>s.item==='Lower shaft (stepped column)')?.reason).toMatch(/Existing shafts as assumed/);
 },300000);
});

describe('t16: twist limit, assumed restraints, step fatigue and the seat on the existing cap',()=>{
 let s:CalculationSnapshot;
 beforeAll(()=>{s=calculate(buildProject(templateById('t16')!.config));},600000);
 const check=(id:string)=>s.checks.find(v=>v.id===id)!;
 it('limits the lower shaft twist (factored small-rotation limit, service movement) and sizes the girder-line strut for it',()=>{
  const t=check('column-lower-twist'),m=check('column-lower-twist-movement'),z=s.existingColumn!;
  expect(t.capacity).toBe(steppedTwistLimit);expect(t.status).toBe('pass');expect(t.demand!).toBeLessThanOrEqual(.02*(1+1e-9));
  expect(t.note).toMatch(/small rotations/);expect(t.note).toMatch(/R·e·θ/);
  expect(m.status).toBe('pass');expect(m.capacity).toBeCloseTo(z.drift.limit,9);
  // The twist is linear in the torque: the same θ/T for the service and factored torques.
  const tor=z.torsion!;expect(tor.twist/s.steppedColumn!.twist!.T).toBeCloseTo(tor.service.twist/tor.service.T,9);
  // The configurator moved the force to a girder-line strut stiff enough for the limits (more than the 10 k_c minimum).
  expect(z.support!.exit).toBe('girder-strut');expect(z.support!.strut!.ratio).toBeGreaterThan(10);
  expect(z.support!.strut!.share).toBeCloseTo(1/(1+z.support!.strut!.ratio),12);
  expect(check('column-lower-torsion').note).not.toMatch(/No twist limit is applied/);
  for(const id of ['column-lower-twist','column-lower-twist-movement'])expect(classifyCheck(check(id)).rule).toBe('id');
 });
 it('makes the girder-line strut an open EOR item where the column alone fails, with the column-alone ratios visible',()=>{
  const c=check('crane-level-strut'),alone=s.steppedColumn!.twist!.alone;
  expect(alone.twist).toBeGreaterThan(steppedTwistLimit);
  expect(c.status).toBe('unverified');expect(c.utilization!).toBeGreaterThan(1);
  expect(c.note).toMatch(/Without it \(the column alone/);expect(c.note).toMatch(/conditional on the strut/);
  expect(classifyCheck(c).type).toBe('by-others');
 });
 it('reports the braced-top restraint reaction for the building engineer of record',()=>{
  const c=check('column-top-restraint'),t=s.steppedColumn!.topRestraint!;
  expect(c.status).toBe('excluded');expect(t.factored).toBeGreaterThan(t.service);expect(t.service).toBeGreaterThan(0);
  expect(c.note).toMatch(/^Not checked here: the stepped-column check takes the column top as braced/);
  expect(c.note).toMatch(/sway bent/);
 });
 it('checks fatigue at the step: the existing welds (Category F), the base metal at their toes and the tie holes in the upper flange',()=>{
  const w=check('step-weld-fatigue'),b=check('step-base-fatigue'),h=check('step-tie-holes-fatigue');
  for(const v of [w,b,h]){expect(v.status).toBe('pass');expect(v.note).toMatch(/100,000/);expect(classifyCheck(v).effect).toBe('fatigue');}
  expect(w.note).toMatch(/Category F/);expect(b.title).toMatch(/Category C/);expect(h.title).toMatch(/Category D/);
  // Without a surveyed weld leg the check is an open existing-structure item with the required leg.
  const p=structuredClone(s.input);delete p.existingColumn!.step!.capWeld;
  const open=calculate(p).checks.find(v=>v.id==='step-weld-fatigue')!;
  expect(open.status).toBe('unverified');expect(open.note).toMatch(/survey the step welds/);
 },600000);
 it('checks the seat on the existing step cap with the modeled geometry instead of leaving it to a bracket designer',()=>{
  expect(s.checks.some(v=>v.id==='end-bearing-seat')).toBe(false);
  for(const id of ['end-bearing-seat-fit','end-bearing-seat-across-fit','end-bearing-wrench-step','end-bearing-seat-bearing'])expect(check(id)?.status,id).toBe('pass');
  expect(check('end-bearing-wrench-step').note).toMatch(/crane-side flange/);
  // The tie slots take the step's computed vertical movement (no 'bracket by others' limit).
  expect(s.checks.some(v=>v.id==='tie-move-support')).toBe(false);
  expect(s.steppedColumn!.stepVertical!.value).toBeGreaterThan(0);
 });
 it('pairs each grid reaction with the cap length its bearings cover (cap flexure)',()=>{
  const c=check('step-cap-flexure');
  expect(c.note).toMatch(/l = /);expect(c.note).not.toMatch(/Whole grid reaction on one bearing/);
 });
});
