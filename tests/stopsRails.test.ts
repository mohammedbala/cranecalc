import {describe,expect,it} from 'vitest';
import {buildProject,configCraneType} from '../src/engine/configurator';
import {defaultRunwayConfig,type RunwayConfig} from '../src/engine/configInputs';
import {endStopChecks,endStopResistance,stopBoltForces,endStopLoadCases} from '../src/engine/endStop';
import {stopStiffeners,stopStiffenerClear,stopStiffenerArrangement} from '../src/engine/endStopInputs';
import {sizeEndStop,stopWeldAccess} from '../src/engine/endStopSizing';
import {endStopGeometry} from '../src/engine/endStop';
import {boltCapacity} from '../src/engine/connectionStrength';
import {craneDesignMinimum} from '../src/engine/aistLoads';
import {railLayout,railHasJoints,railJointKind,railJointCategory} from '../src/engine/railLayout';
import {railJointBearing,railChecks} from '../src/engine/railChecks';
import {sheetFixture} from './fixtures/sheets/sheetFixtures';
import {wheelGroups} from '../src/engine/railClip';
import {stopContacts,stopFace} from '../src/engine/craneTravel';
import {validateRunwayDetails} from '../src/engine/detailValidation';
import {demonstrationProject} from '../src/engine/demonstration';

const inch=25.4,foot=304.8,kip=4448.2216152605;
const config=(c:Partial<RunwayConfig>)=>buildProject({...defaultRunwayConfig,...c});
const strengthFails=(p:ReturnType<typeof config>)=>endStopChecks(p).filter(c=>c.status==='fail').map(c=>`${c.id} ${c.utilization?.toFixed(2)}`);

describe('end stops sized for the bumper force',()=>{
 it('sizes a heavy-crane stop with every stop check passing and the front bolts at most 0.9 of J3.7',()=>{
  const p=config({capacity:35,cmaa:'D',buildingClass:'B',bays:3,span:30}),e=p.details!.endStop!;
  expect(p.cranes[0].design!.bumperForce/kip).toBeGreaterThan(25);
  expect(strengthFails(p)).toEqual([]);
  const t=endStopChecks(p).find(c=>c.id==='end-stop-bolt-tension')!;expect(t.utilization!).toBeLessThanOrEqual(.9+1e-9);
  expect(endStopChecks(p).every(c=>c.utilization===undefined||c.utilization<1e3)).toBe(true);
  expect(validateRunwayDetails(p).filter(v=>/end stop/.test(v))).toEqual([]);
  // Every check passes on the stop as sized: no NO CAPACITY, slip by the J3.9 rows.
  expect(endStopChecks(p).find(c=>c.id==='end-stop-slip')!.capacity!).toBeGreaterThan(e.bolts.diameter>0?p.cranes[0].design!.bumperForce:0);
 },120000);
 it('keeps light-crane stops light: plates at most 3/4 in',()=>{
  const p=config({capacity:3,control:'pendant',cmaa:'B',bays:2,span:20}),e=p.details!.endStop!;
  expect(strengthFails(p)).toEqual([]);
  for(const t of [e.base.thickness,e.face.thickness,e.stiffener.thickness])expect(t).toBeLessThanOrEqual(.75*inch+1e-9);
 },120000);
 it('leaves room for the inside fillets or uses one central stiffener on a narrow flange',()=>{
  const p=config({capacity:2,control:'pendant',cmaa:'B',bays:2,span:16,girderShape:'W12X26'}),e=p.details!.endStop!;
  // The rail clips on this flange are another matter (their own validation); the stop fits.
  expect(validateRunwayDetails(p).filter(v=>/end stop/.test(v))).toEqual([]);expect(strengthFails(p)).toEqual([]);
  const g=endStopGeometry(p,e);
  if(stopStiffeners(e).length>1)expect(stopStiffenerClear(e)).toBeGreaterThanOrEqual(stopWeldAccess(g.stiffenerHeight)-1e-6);
  else expect(stopStiffenerArrangement(e)).toBe('center');
  // The old fixed stop on this flange: stiffeners overlapping, now a validation.
  const q=structuredClone(p);Object.assign(q.details!.endStop!.stiffener,{thickness:.5*inch,spacing:.25*inch});delete q.details!.endStop!.stiffener.arrangement;
  expect(validateRunwayDetails(q).join(' ')).toMatch(/stiffeners and their inside fillets overlap/);
 },120000);
});

describe('end stop bolts by AISC J3.9 row by row, and the rail-string case',()=>{
 const p=demonstrationProject(),e=p.details!.endStop!;
 it('reduces only the tension rows for slip; the back row keeps k_sc = 1',()=>{
  const lc=endStopLoadCases(p,e),f=stopBoltForces(p,e,lc.bumper.F,lc.bumper.arm);
  expect(f.rows[0].ksc).toBe(1);expect(f.rows.at(-1)!.ksc).toBeLessThan(1);
  const back=boltCapacity({grade:'A325',diameter:e.bolts.diameter,planes:1,surface:'B',shear:f.V,tension:0,method:'LRFD'});
  expect(f.slip).toBeCloseTo(2*back.slip+2*f.front.slip,6);
  const slip=endStopChecks(p).find(c=>c.id==='end-stop-slip')!;expect(slip.demand).toBeCloseTo(lc.bumper.F,6);expect(slip.capacity).toBeCloseTo(f.slip,6);
  // Front bolts decompressed: still the back bolts' slip resistance, never NO CAPACITY.
  const heavy=stopBoltForces(p,e,4*lc.bumper.F,lc.bumper.arm);expect(heavy.rows.at(-1)!.ksc).toBeLessThanOrEqual(0);expect(heavy.slip).toBeCloseTo(2*back.slip,0);
 });
 it('designs the stop for the rail string at the base plate and compares the rail anchorage with that resistance',()=>{
  const lc=endStopLoadCases(p,e),r=endStopResistance(p)!;
  expect(lc.rail).toBeDefined();expect(lc.rail!.F).toBeCloseTo(1.6*4*kip,3);expect(lc.rail!.arm).toBeCloseTo(e.base.thickness,9);
  expect(r.rail!.force).toBeCloseTo(lc.rail!.F,6);expect(r.rail!.resistance).toBeGreaterThan(r.rail!.force);
  expect(r.bumper.resistance).toBeGreaterThan(r.bumper.force);
 });
});

describe('crane type, rail layout, joints and wheel passages',()=>{
 it('takes a cab-operated CMAA D crane as a mill crane: total side thrust 0.4Q',()=>{
  const cfg={...defaultRunwayConfig,cmaa:'D' as const,capacity:20};expect(configCraneType(cfg)).toBe('mill');
  const p=config(cfg),c=p.cranes[0],m=craneDesignMinimum(c);
  expect(m.aist.totalSide).toBeCloseTo(Math.max(.4*c.design!.ratedLoad,.2*(c.design!.ratedLoad+c.design!.trolleyWeight),.1*(c.design!.ratedLoad+c.design!.trolleyWeight+c.design!.bridgeWeight)),6);
  expect(m.totalSide).toBeGreaterThanOrEqual(.4*c.design!.ratedLoad-1e-6);
  expect(configCraneType({...cfg,cmaa:'A'})).toBe('maintenance');expect(configCraneType({...cfg,aistType:'magnet'})).toBe('magnet');
 },120000);
 it('has no rail joints on runs within one mill length and staggered joints on a 72 ft runway',()=>{
  for(const c of [{bays:1,span:30},{bays:2,span:18}]){const p=config({...c,capacity:5,control:'pendant',cmaa:'B'}),l=railLayout(p);expect(l.rails.map(r=>r.joints.length)).toEqual([0,0]);expect(railHasJoints(p,l)).toBe(false);}
  const p=config({bays:3,span:24,capacity:5,control:'pendant',cmaa:'B'}),l=railLayout(p),[a,b]=l.rails;
  expect(a.joints.length).toBeGreaterThan(0);expect(b.joints.length).toBeGreaterThan(0);
  for(const j of b.joints)for(const i of a.joints)expect(Math.abs(j-i)).toBeGreaterThan(2*foot);
 },120000);
 it('bears the joint bolts ply by ply: 1 x 1 1/2 in bars with a 7/8 in bolt give about 33 kip, the bars governing',()=>{
  const p=demonstrationProject(),r=p.details!.rail;Object.assign(r,{jointPlateThickness:1*inch,jointPlateHeight:1.5*inch,jointBoltDiameter:.875*inch,jointType:'tight'});
  const b=railJointBearing(p);expect(b.bars/kip).toBeCloseTo(32.9,0);expect(b.governs).toBe('bars');
  expect(b.web).toBeCloseTo(.75*2.4*.875*inch*r.webThickness*r.Fu,3);
 });
 it('counts each wheel group passing a local detail: a two-wheel end truck doubles the clip cycles',()=>{
  const p=demonstrationProject();p.cranes=[p.cranes[0]];p.cranes[0].wheels=[{offset:0,loaded:1,unloaded:1,lateral:0},{offset:10*foot,loaded:1,unloaded:1,lateral:0}];
  expect(wheelGroups(p,24*inch)).toBe(2);p.cranes[0].wheels[1].offset=12*inch;expect(wheelGroups(p,24*inch)).toBe(1);
 });
 it('welds the rail joints for heavy duty and uses supplier joint bars otherwise',()=>{
  expect(railJointKind(config({capacity:20,cmaa:'D'}))).toBe('welded');
  const light=config({capacity:5,cmaa:'C',buildingClass:'C'});
  expect(railJointKind(light)).toBe('supplier-bars');
  // The supplier's bars installed to the slip-critical requirements: AISC 360-16 Table A-3.1 item 2.2, Category B.
  expect(light.details!.rail.jointSlipCriticalInstall).toBe(true);expect(railJointCategory(light)).toEqual({category:'B',basis:'installed'});
 },120000);
 it('estimates the supplier joint bars at Category B when installed slip-critical, at Category D as a bearing-type joint',()=>{
  const s=sheetFixture('t01'),est=(install:boolean)=>{const t=structuredClone(s);t.input.details!.rail.jointSlipCriticalInstall=install;return railChecks(t).find(c=>c.id==='rail-joint-fatigue')!;};
  const d=est(false),b=est(true);
  expect(b.demand).toBeCloseTo(d.demand!,6);
  // F_SR = (C_f/n)^(1/3): Category B C_f = 120e8, D 22e8 (ksi³), so the allowables stand as (120/22)^(1/3).
  expect(b.capacity!/d.capacity!).toBeCloseTo(Math.cbrt(120/22),3);
  expect(b.note).toMatch(/Category B \(AISC 360-16 Table A-3\.1 item 2\.2\)/);expect(b.utilization!).toBeLessThan(1);
 });
 it('puts the crane wheel at the stop face from the assumed bumper overhang',()=>{
  const p=config({capacity:10}),c=stopContacts(p,0);
  expect(p.cranes[0].design!.bumperOverhang).toBeGreaterThan(0);expect(c.every(v=>v.basis==='geometry')).toBe(true);
  const left=c.find(v=>v.end==='left')!;expect(left.wheel).toBeGreaterThan(stopFace(p,'left')!);
  expect(p.notes).toMatch(/Bumper overhang assumed/);
 },120000);
});
