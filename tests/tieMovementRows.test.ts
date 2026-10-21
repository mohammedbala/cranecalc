import {describe,expect,it} from 'vitest';
import cases from './fixtures/simulationCasesV3.json';
import {buildProject} from '../src/engine/configurator';
import {lapChecks} from '../src/engine/detailChecks';
import {tieSizingRatios,sizingLimit,tieSizingDemands} from '../src/engine/flangeTieSizing';
import {tieMovementChecks} from '../src/engine/tieMovement';
import {braceSystem} from '../src/engine/detailAnalysis';
import {stiffenerTieGeometry} from '../src/engine/tieGeometry';
import {available} from '../src/engine/aiscStrength';
import {boltProperties} from '../src/engine/connectionStrength';
import type {CalculationSnapshot,ProjectInput} from '../src/engine/types';
import type {RunwayConfig} from '../src/engine/configInputs';

const inch=25.4;
const sim=(id:string)=>buildProject((cases as unknown as Record<string,RunwayConfig>)[id]);
/** The tie checks' snapshot under the sizing demands (as flangeTieSizing builds it). */
const sized=(p:ProjectInput)=>{
 const d=tieSizingDemands(p);
 return {s:{input:p,designAnalysis:{endRotation:d.rotation,serviceRotation:d.serviceRotation},detailResults:{demands:{brace:d.force,braceFatigue:d.range,railLateral:d.railLateral,braceSustained:d.sustained},
  ...(d.support!==undefined?{bracket:{service:{deflection:{value:d.support}}}}:{})}} as unknown as CalculationSnapshot,force:d.force};
};

describe('tie connection with the force along the bolt rows',()=>{
 it('checks J4.2 on the shear planes along both bolt lines and J4.1 across the force',()=>{
  const p=sim('028'),c=p.details!.brace.connection,F=100e3,t=Math.min(p.details!.brace.gussetThickness,2*c.thickness);
  const k=lapChecks(p,c,'tie','Tie',F,0,p.details!.brace.gussetThickness,p.details!.material.Fy,p.details!.material.Fu,true),get=(id:string)=>k.find(v=>v.id===id)!;
  const dh=boltProperties(c.grade,c.diameter).hole+1.5875,path=c.edge+(c.rows-1)*c.pitch,Fu=p.details!.material.Fu;
  expect(get('tie-shear-rupture').capacity).toBeCloseTo(available(.6*Fu*4*(path-(c.rows-.5)*dh)*t,p.method,.75,2),6);
  expect(get('tie-net').capacity).toBeCloseTo(available(Fu*t*(c.gauge+2*c.edge-2*dh),p.method,.75,2),6);
  // The direction-free lap (girder end) keeps the least orthogonal sections.
  const free=lapChecks(p,c,'tie','Tie',F,0,p.details!.brace.gussetThickness,p.details!.material.Fy,Fu);
  expect(free.find(v=>v.id==='tie-shear-rupture')!.capacity!).toBeLessThan(get('tie-shear-rupture').capacity!);
 });
});

describe('one-row bolt groups for the imposed girder end movement',()=>{
 it('case 028 (10 t, reach held at 18 in): one row of two bolts each end, the flexible length a pitch longer, within the sizing limits',()=>{
  const p=sim('028'),t=p.details!.brace,c=t.connection;
  expect(stiffenerTieGeometry(p)).toBeDefined();
  expect(c.rows).toBe(1);expect(t.release?.slide).toBeUndefined();
  expect(p.details!.bracket!.reach).toBeCloseTo(18*inch,6);
  const r=tieSizingRatios(p);
  for(const id of ['tie-move-strength','tie-move-fatigue','tie-move-root-fatigue','tie-move-gusset','tie-move-weld','tie-shear-rupture'])if(r[id]!==undefined)expect(r[id]/sizingLimit(r,id),id).toBeLessThanOrEqual(1.05);
 });
 it('a one-sleeve-row slide: the column-end moment bounded by the sleeves\' bearing shift, the sleeve tilt checked',()=>{
  const p=sim('028');p.details!.brace.release!.slide=6.35;
  const {s,force}=sized(p),brace=braceSystem(p),k=tieMovementChecks(s,{force:force/brace.cos,member:brace.member});
  const tilt=k.find(v=>v.id==='tie-slide-tilt')!;
  expect(tilt).toBeDefined();expect(tilt.capacity).toBeCloseTo(1.5875/p.details!.brace.gussetThickness,9);
  expect(k.find(v=>v.id==='tie-move-strength')!.note).toContain('m_c ≤ F·t_g/(2n)');
  // Two rows: no tilt check.
  p.details!.brace.connection.rows=2;
  expect(tieMovementChecks(s,{force:force/brace.cos,member:brace.member}).some(v=>v.id==='tie-slide-tilt')).toBe(false);
 });
 it('a stiffener tie\'s girder gusset root has no fillet: Category C, the gusset length as arm, the column root for the welds',()=>{
  const p=sim('028'),g=stiffenerTieGeometry(p)!,{s,force}=sized(p),brace=braceSystem(p);
  const k=tieMovementChecks(s,{force:force/brace.cos,member:brace.member});
  expect(g.gussetLength).toBeGreaterThan(0);
  expect(k.find(v=>v.id==='tie-move-root-fatigue')!.note).toMatch(/Governing (column gusset|girder gusset \((the bearing|CJP))/);
  const weld=k.find(v=>v.id==='tie-move-weld')!;
  if(p.details!.brace.columnRoot==='cjp')expect(weld.status).toBe('not-applicable');else expect(weld.note).toContain('Governing column gusset');
 });
 it('a column gusset CJP welded to the column flange: Category C at its toe, no fillet weld check',()=>{
  const p=sim('028');p.details!.brace.columnRoot='cjp';
  const {s,force}=sized(p),brace=braceSystem(p),k=tieMovementChecks(s,{force:force/brace.cos,member:brace.member});
  expect(k.find(v=>v.id==='tie-move-weld')!.status).toBe('not-applicable');
  p.details!.brace.columnRoot=undefined;
  const fillet=tieMovementChecks(s,{force:force/brace.cos,member:brace.member});
  const cap=(c:typeof k)=>c.find(v=>v.id==='tie-move-root-fatigue')!;
  if(cap(fillet).note.startsWith('Governing column gusset'))expect(cap(k).capacity!).toBeGreaterThan(cap(fillet).capacity!);
 });
});
