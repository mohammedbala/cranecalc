import {describe,expect,it} from 'vitest';
import {calculate} from '../src/engine/calculate';
import {demonstrationProject,cappedDemonstrationProject} from '../src/engine/demonstration';
import {tieMovementChecks,tieMovements} from '../src/engine/tieMovement';
import {flangeTieGeometry,tieRelease,tieSides,columnGussetHeight} from '../src/engine/tieGeometry';
import {braceSystem} from '../src/engine/detailAnalysis';
import {endBearingChecks,endBearingGeometry} from '../src/engine/endBearing';
import {endStopChecks} from '../src/engine/endStop';
import {boltCapacity} from '../src/engine/connectionStrength';
import {drawingSheetSet} from '../src/components/planSheet';
import type {CalculationSnapshot} from '../src/engine/types';

const inch=25.4;
const texts=(svg:string)=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&')).join(' ');
const demo=calculate(demonstrationProject()),capped=calculate(cappedDemonstrationProject());
const force=(s:CalculationSnapshot)=>{const b=braceSystem(s.input),a=s.designAnalysis!,imperfection=.02*a.moment/s.properties!.h0+.01*a.axial;return {force:(s.detailResults!.demands.brace+imperfection)/b.cos,member:b.member};};
const movement=(s:CalculationSnapshot)=>tieMovementChecks(s,force(s));
const byId=(checks:{id:string}[],id:string)=>checks.find(c=>c.id===id) as ReturnType<typeof movement>[number];

describe('tie movement compatibility',()=>{
 it('ties the top flange only where bolted end bearings restrain the bottom flange',()=>{
  for(const s of [demo,capped]){
   expect(tieSides(s.input)).toEqual([1]);
   expect(flangeTieGeometry(s.input)!.sides).toEqual([1]);
   expect(s.checks.some(c=>c.id.startsWith('detail-fatigue-SA')&&c.id.endsWith('bottom-right'))).toBe(false);
  }
  expect(demo.checks.find(c=>c.id==='brace-member')!.title).toBe('Top-flange tie strength');
 });
 it('derives the imposed movements from end rotation and thermal travel at sliding ends',()=>{
  const mv=tieMovements(demo),a=demo.designAnalysis!,p=demo.input;
  expect(mv.cyclicLongitudinal).toBeCloseTo(a.serviceRotation!*p.section.d,9);
  expect(mv.thermal).toBeCloseTo(12e-6*25*304.8*30,9);
  expect(mv.longitudinal).toBeCloseTo(a.endRotation*p.section.d+mv.thermal,9);
  // Between the girder gusset and the column gusset, which runs 1/4 in past the bolt group for its slotted end edge.
  expect(mv.freeLength).toBeCloseTo((25.5-2*4.75-.25)*inch,9);
  // Cyclic out-of-plane bar stress 3EtΔ/L² is part of the Category B range.
  const fatigue=byId(movement(demo),'tie-move-fatigue'),t=p.details!.brace.thickness;
  expect(fatigue.demand!).toBeGreaterThan(3*p.section.E*t*mv.cyclicLongitudinal/mv.freeLength**2);
  for(const s of [demo,capped])expect(s.checks.filter(c=>c.group==='Tie movement').every(c=>c.status==='pass'||c.status==='excluded')).toBe(true);
 });
 it('rejects stiff bars that cannot follow the sliding-end thermal travel',()=>{
  const s=structuredClone(demo),b=s.input.details!.brace;
  Object.assign(b,{thickness:.625*inch,length:24*inch,reach:24*inch});
  const checks=movement(s);
  expect(byId(checks,'tie-move-gusset').status).toBe('fail');
  expect(byId(checks,'tie-move-weld').status).toBe('fail');
 });
 it('sizes the sleeved column-end slots and gusset from the bolt',()=>{
  const p=capped.input,r=tieRelease(p)!;
  // 5/8 in bolt: 11/16 in bore, 1/4 in wall, 1/16 in clearance; 1/8 in travel each way.
  expect(r.od).toBeCloseTo(1.1875*inch,9);expect(r.width).toBeCloseTo(1.25*inch,9);expect(r.slot).toBeCloseTo(1.5*inch,9);
  // Slots at the 2 3/4 in gauge plus 1/8 in travel each way, a 1 7/32 in edge and a 1/16 in slot location
  // tolerance beyond each slot end (5 9/16 in), rounded up to the 1/4 in cutting increment: 5 3/4 in.
  expect(r.edge).toBeCloseTo(1.21875*inch,9);expect(r.tolerance).toBeCloseTo(inch/16,9);
  expect(columnGussetHeight(p)).toBeCloseTo(5.75*inch,9);expect(p.details!.brace.connection.weldLength).toBeCloseTo(columnGussetHeight(p),9);
  const edge=byId(movement(capped),'tie-release-edge');
  expect(edge.demand).toBeCloseTo(r.edge+inch/16,9);expect(edge.capacity).toBeCloseTo((5.75-2.75)/2*inch-r.travel,9);expect(edge.utilization).toBeLessThan(.95);
  // The slot location tolerance also applies between the two slots of a row and toward the gusset end. Material
  // between slots: 2 2/3 d - d_h + 1/16 = 1 3/64 in against 2 3/4 - 1 1/2 = 1 1/4 in. A 2 1/2 in gauge would leave
  // 1 in, short of it: the gauge is the slot length plus that material rounded up to 1/4 in.
  const ligament=byId(movement(capped),'tie-release-ligament');
  expect(ligament.demand).toBeCloseTo((8/3*.625-.6875+1/16)*inch,9);expect(ligament.capacity).toBeCloseTo(1.25*inch,9);expect(ligament.utilization).toBeLessThan(.85);
  expect(r.minimumGauge).toBeCloseTo(2.75*inch,9);expect(r.slot+r.ligament).toBeGreaterThan(2.5*inch);
  // Gusset end edge: 1 7/32 + 1/16 = 1 9/32 in, rounded up to 1 1/2 in; the bars keep their 1 1/4 in edge.
  const end=byId(movement(capped),'tie-release-end-edge');
  expect(end.demand).toBeCloseTo(r.edge+inch/16,9);expect(end.capacity).toBeCloseTo(1.5*inch,9);expect(r.endEdge).toBeCloseTo(1.5*inch,9);expect(end.utilization).toBeLessThan(.9);
  // Bearing and block shear toward the gusset end use the gusset's own end edge.
  expect(byId(movement(capped),'tie-release-bearing').status).toBe('pass');
  for(const s of [demo,capped])for(const id of ['tie-release-ligament','tie-release-edge','tie-release-end-edge'])expect(byId(movement(s),id).utilization,id).toBeLessThan(.95);
  const bolt=boltCapacity({grade:'A325',diameter:.625*inch,planes:2,surface:'B',shear:0,tension:0,method:'LRFD'});
  expect(byId(movement(capped),'tie-release-sleeve').demand).toBeCloseTo(1.5*bolt.pretension,6);
  // A designed bracket's service deflection, times cranes and impact, plus rotation and the positioning allowance.
  const travel=byId(movement(capped),'tie-release-travel'),mv=tieMovements(capped);
  expect(travel.demand).toBeCloseTo(mv.support!*1*(1+.25)+mv.rotation*mv.setback+inch/16,6);
 });
 it('bends rigid bars with support deflection when the column end is not released',()=>{
  const released=byId(movement(capped),'tie-move-fatigue').demand!;
  const s=structuredClone(capped);s.input.details!.brace.release!.enabled=false;
  const rigid=byId(movement(s),'tie-move-fatigue').demand!,mv=tieMovements(s),t=s.input.details!.brace,E=s.input.section.E;
  // Standard holes need no longer gusset end edge, so the rigid bars are 1/4 in longer between the gussets.
  const L=tieMovements(capped).freeLength,out=(length:number)=>3*E*t.thickness*mv.cyclicLongitudinal/length**2;
  expect(mv.freeLength-L).toBeCloseTo(.25*inch,9);
  expect(rigid-released).toBeCloseTo(3*E*t.width*mv.cyclicVertical/mv.freeLength**2+out(mv.freeLength)-out(L),6);
  expect(movement(s).some(c=>c.id.startsWith('tie-release'))).toBe(false);
 });
 it('states the deflection limit for a bracket by others on the drawings',()=>{
  const support=demo.checks.find(c=>c.id==='tie-move-support')!;
  expect(support.status).toBe('excluded');expect(support.capacity).toBeGreaterThan(0);
  const set=drawingSheetSet(demo),cover=texts(set[0].svg),s06=texts(set.find(v=>v.svg.includes('data-view="flange-tie-plan"'))!.svg);
  expect(cover).toContain('WITH VERTICAL DEFLECTION AT THE BEARING UNDER CRANE LOADS');
  expect(s06).toContain('PRETENSION THE BOLTS AGAINST STEEL SLEEVES');expect(s06).toContain('VERT. SLOTS IN GUSSET');
  expect(demo.checks.find(c=>c.id==='flange-tie-column')!.status).toBe('excluded');
 });
});

describe('sliding end bearings under AISC J1.10(c)',()=>{
 it('pretensions sliding-end bolts against sleeves that clear the flange',()=>{
  const p=demo.input,e=p.details!.endBearing!,g=endBearingGeometry(p,e);
  expect(g.sleeved).toBe(true);
  expect(g.sleeve!.od).toBeCloseTo((13/16+2*5/16)*inch,9);expect(g.sleeve!.length).toBeCloseTo(p.section.tf+inch/16,9);
  expect(g.slotWidth).toBeCloseTo(g.sleeve!.od+inch/16,9);expect(g.slot).toBeCloseTo(g.slotWidth+inch,9);
  const checks=demo.checks.filter(c=>c.group==='End bearings');
  expect(checks.some(c=>c.id==='end-bearing-j110')).toBe(false);
  expect(checks.filter(c=>c.id.startsWith('end-bearing-sleeve')).every(c=>c.status==='pass')).toBe(true);
 });
 it('permits snug-tight sliding bolts only for cranes of 5 tons or less',()=>{
  for(const [s,expected] of [[demo,'fail'],[capped,'pass']] as const){
   const p=structuredClone(s.input),e=p.details!.endBearing!;e.sliding='snug-tight';
   const check=endBearingChecks(p,e,{analysis:s.designAnalysis!,lateral:s.detailResults!.demands.brace}).find(c=>c.id==='end-bearing-j110')!;
   expect(check.status).toBe(expected);
  }
 });
});

describe('end stops clear the runway-end tie saddle',()=>{
 it('checks the nut clearance to the saddle and fails a stop over it',()=>{
  const ok=capped.checks.find(c=>c.id==='end-stop-wrench-saddle')!;expect(ok.status).toBe('pass');
  const p=structuredClone(capped.input);p.details!.endStop!.setback=.5*inch;
  expect(endStopChecks(p).find(c=>c.id==='end-stop-wrench-saddle')!.status).toBe('fail');
  // The stop holes are Category B fatigue points.
  expect(capped.checks.filter(c=>c.id.startsWith('detail-fatigue-SH')).length).toBe(8);
 });
});
