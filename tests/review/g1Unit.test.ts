import {describe,expect,it} from 'vitest';
import {demoFocus005} from '../fixtures/demoFocus005';
import {craneInputChecks,craneStatics,bumperSelectionChecks,stopDesignStrength} from '../../src/engine/craneInput';
import {buildingClassBasis,buildingClassCheck,fatigueCycleCheck,statedCycleCounts} from '../../src/engine/buildingClass';
import {deflectionCriteria} from '../../src/engine/aistChecks';
import {bumperPath} from '../../src/engine/endStopInputs';
import {validateProject} from '../../src/engine/calculate';
import type {CheckResult} from '../../src/engine/types';
const kip=4448.221615,inch=25.4,fpm=5.08;
const byId=(c:CheckResult[],id:string)=>c.find(v=>v.id===id)!;

describe('G1 · crane input statics (review A4)',()=>{
 it('DEMO-FOCUS-005 crane data violate statics: open items, not validation errors',()=>{
  const p=demoFocus005();expect(validateProject(p)).toEqual([]);
  const s=craneStatics(p.cranes[0])!;
  expect(s.total/kip).toBeCloseTo(22.5,6);expect(s.maxRunway/kip).toBeCloseTo(20,6);expect(s.minOther/kip).toBeCloseTo(5,6);expect(s.lifted/kip).toBeCloseTo(12,6);
  const c=craneInputChecks(p);
  const runway=byId(c,'crane-1-statics-runway'),lifted=byId(c,'crane-1-statics-lifted'),data=byId(c,'crane-1-data');
  expect(runway.status).toBe('fail');expect(runway.capacity!/kip).toBeCloseTo(17.5,6);expect(runway.utilization).toBeCloseTo(20/17.5,6);
  expect(lifted.status).toBe('fail');expect(lifted.utilization).toBeCloseTo(1.2,6);
  expect(data.status).toBe('fail');expect(data.note).toContain('rated bridge speed');expect(data.note).toContain('minimum wheel loads');
  expect(c.every(v=>v.group==='Crane input')).toBe(true);
  expect(c.some(v=>v.id==='crane-1-statics-total')).toBe(false);
 });
 it('a consistent schedule with minimum wheel loads and bridge speed passes',()=>{
  const p=demoFocus005(),c=p.cranes[0],d=c.design!;
  // Bridge 10, trolley 2.5, rated 10: trolley and load at this runway 2 × 7.5 = 15; other runway 2 × 3.75 = 7.5; empty 2 × 5 = 10 here.
  c.wheels=c.wheels.map(w=>({...w,loaded:7.5*kip,unloaded:5*kip}));d.minWheelLoad=3.75*kip;d.bridgeSpeed=150*fpm;
  const r=craneInputChecks(p);expect(r.map(v=>v.status)).toEqual(['pass','pass','pass']);
  expect(byId(r,'crane-1-statics-total').demand).toBeCloseTo(0,3);
  d.belowHookWeight=1*kip;expect(byId(craneInputChecks(p),'crane-1-statics-total').status).toBe('fail');
 });
});

describe('G1 · bumper selection (review B12)',()=>{
 it('missing bridge speed, stroke and efficiency give one open item',()=>{
  const p=demoFocus005(),c=bumperSelectionChecks(p,[]);
  expect(c).toHaveLength(1);expect(c[0].id).toBe('crane-1-bumper-selection');expect(c[0].status).toBe('fail');
  expect(c[0].note).toContain('bumper stroke');expect(c[0].note).toContain('bumper efficiency');
 });
 it('checks deceleration at 50% speed, energy at 100% speed and the stop strength',()=>{
  const p=demoFocus005(),d=p.cranes[0].design!;d.bridgeSpeed=150*fpm;d.bumperStroke=4*inch;d.bumperEfficiency=.5;
  const stops:CheckResult[]=[{id:'end-stop-face',group:'End stops',title:'',status:'pass',utilization:.2716,equation:'',note:'',referenceIds:[]},{id:'end-stop-flange-prying',group:'End stops',title:'',status:'pass',utilization:.5607,equation:'',note:'',referenceIds:[]}];
  const R=stopDesignStrength(p,stops,d.bumperForce)!;expect(R/kip).toBeCloseTo(10/.5607**2,3);
  const c=bumperSelectionChecks(p,stops);
  // W_E = 0.5·10 + 0.9·2.5 = 7.25 kip; v = 2.5 ft/s; E = W v²/2g; F = E/(η s); a50 = (v/2)²/(2ηs).
  const WE=7.25,v=2.5,g=32.174,s=4/12,E=WE*v*v/(2*g),F=E/(.5*s),a50=(v/2)**2/(2*.5*s);
  expect(byId(c,'crane-1-bumper-decel').utilization).toBeCloseTo(a50/16,6);
  expect(byId(c,'crane-1-bumper-energy').demand!/kip).toBeCloseTo(F,3);
  expect(byId(c,'crane-1-bumper-stop').capacity!/kip).toBeCloseTo(10/.5607**2,3);
  expect(c.every(v=>v.status==='pass')).toBe(true);
  d.bumperStroke=.25*inch;const short=bumperSelectionChecks(p,stops);
  expect(byId(short,'crane-1-bumper-decel').status).toBe('fail');expect(byId(short,'crane-1-bumper-energy').status).toBe('fail');
 });
});

describe('G1 · building class and fatigue cycles (review A3)',()=>{
 it('DEMO-FOCUS-005 counts all 400,000 cycles: Class B, entered C is an open item, L/1000 governs',()=>{
  const p=demoFocus005(),b=buildingClassBasis(p);
  expect(b.basis).toBe('all-cycles');expect(b.counted).toBe(400000);expect(b.implied).toBe('B');expect(b.effective).toBe('B');
  const c=buildingClassCheck(p);expect(c.status).toBe('fail');expect(c.note).toContain('L/1000');expect(c.note).toContain('Appendix C');
  expect(deflectionCriteria(p).nv).toBe(1000);
  // Stated full-load basis: 30,000 repetitions, Class C, L/600 (owner limit).
  p.aist!.classBasis='full-load';expect(buildingClassBasis(p).effective).toBe('C');expect(buildingClassCheck(p).status).toBe('pass');expect(deflectionCriteria(p).nv).toBe(600);
 });
 it('one fatigue cycle count throughout',()=>{
  expect(statedCycleCounts('Fictitious supplier confirms CMAA C, 5-US-ton crane; 1,000,000 wheel stress fluctuations')).toEqual([1000000]);
  const p=demoFocus005(),c=fatigueCycleCheck(p);expect(c.status).toBe('fail');expect(c.note).toContain('1,000,000');expect(c.note).toContain('400,000');
  p.capDesign!.dutySource='Fictitious supplier confirms CMAA C, 5-US-ton crane; 400,000 wheel stress fluctuations';expect(fatigueCycleCheck(p).status).toBe('pass');
 });
});

describe('G1 · end-stop location (review A2)',()=>{
 it('every section takes the stop location from the crane input',()=>{
  const p=demoFocus005();expect(bumperPath(p,p.cranes[0]).location).toBe('girder');expect(bumperPath(p,p.cranes[0]).text).not.toMatch(/bypass/i);
  p.cranes[0].design!.bumperBypassesGirder=true;expect(bumperPath(p,p.cranes[0]).location).toBe('building');expect(bumperPath(p,p.cranes[0]).text).toMatch(/bypassed/);
 });
});
