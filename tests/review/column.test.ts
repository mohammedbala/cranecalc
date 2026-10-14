import {describe,it,expect,beforeAll} from 'vitest';
import {demoFocus005,demoFocus005Before} from '../fixtures/demoFocus005';
import {calculate} from '../../src/engine/calculate';
import {existingColumnAnalysis,existingColumnChecks,existingColumnSection} from '../../src/engine/existingColumn';
import {longitudinalBracingAnalysis,longitudinalBracingChecks} from '../../src/engine/longitudinalBracing';
import {supportReactions,type SupportReactionSet} from '../../src/engine/supportReactions';
import {sectionProperties} from '../../src/engine/section';
import {pinnedTorsion,runwayMass,seatEnds,seatMoment,tr13SupportCombinations} from '../../src/engine/columnSupport';
import {runwayDesignAnalysis} from '../../src/engine/designAnalysis';
import {girderStrength} from '../../src/engine/aiscStrength';
import type {CalculationSnapshot,ProjectInput} from '../../src/engine/types';

/**
 * Structural review of DEMO-FOCUS-005, group G2 (supporting column and building): B7 weak-axis bending, B8 torsion,
 * B9 frame type, B10 TR-13 drift and rail gauge, B11 seismic, B13 rod fatigue, D33 TR-13 supporting combinations,
 * C21 F13.1 as an applicability test. Before values come from demoFocus005Before().
 */
const kip=4448.221615,kft=1355817.948,inch=25.4,ksi=6.894757293,psf=4.788025898e-5;
const before=(id:string)=>demoFocus005Before().checks.find(c=>c.id===id);
let reactions:SupportReactionSet;
const column=(p:ProjectInput)=>existingColumnAnalysis(p,reactions);
const checksOf=(p:ProjectInput)=>existingColumnChecks(p,column(p));
const find=(list:{id:string}[],id:string)=>list.find(c=>c.id===id) as ReturnType<typeof existingColumnChecks>[number];
beforeAll(()=>{const p=demoFocus005();reactions=supportReactions(p,sectionProperties(p.section));});

describe('B7 column weak-axis bending',()=>{
 it('puts the seat moment of the girder reactions on the column: 9.6 in off the haunch web at grids 1 and 6',()=>{
  const p=demoFocus005(),ends=seatEnds(p);
  expect(ends[0]).toHaveLength(1);expect(ends[0][0].offset/inch).toBeCloseTo(9.6,1);
  expect(ends[5][0].offset/inch).toBeCloseTo(-9.6,1);
  // Factored (1.2D + 1.6 crane, impact included): about 28 kip-ft at the runway ends (with the bearing hardware on the
  // seat), 27 kip-ft unbalanced at interior grids.
  expect(seatMoment(ends[0],{D:1.2,L:1.6,Cd:1.6,Cv:1.6})/kft).toBeCloseTo(27.98,1);
  expect(seatMoment(ends[2],{D:1.2,L:1.6,Cd:1.6,Cv:1.6})/kft).toBeCloseTo(26.93,1);
  // TR-13 2b-like factors (1.2 on the crane dead load): within the review's 24–26 kip-ft.
  const tr=seatMoment(ends[0],{D:1.2,L:1,Cd:1.2,Cv:1.6})/kft;expect(tr).toBeGreaterThan(24);expect(tr).toBeLessThan(26.5);
 });
 it('adds the longitudinal force at the locating seat and the seat moment to H1 (eave-strut path assumed)',()=>{
  const p=demoFocus005(),r=column(p),c=p.existingColumn!;
  // Bumper 10 kip at 216 in on a column pinned at the base and braced at 312 in: P·a·b/L = 55.4 kip-ft.
  const hs=c.seatElevation,H=c.height,closed=10*kip*hs*(H-hs)/H/kft;expect(closed).toBeCloseTo(55.38,1);
  const bumper=r.combinations.find(k=>k.id==='LRFD AIST bumper')!;
  expect(bumper.My/bumper.B1y/kft).toBeGreaterThan(closed);expect(bumper.My/kft).toBeCloseTo(68.11,1);
  // Before: no weak-axis moment, H1 0.2537. After: weak-axis flexure reported, H1 0.394 (crane stop at grid 5; the
  // support steel in the dead load).
  expect(before('column-interaction')!.utilization).toBeCloseTo(.2537,3);expect(before('column-flexure-y')).toBeUndefined();
  const checks=existingColumnChecks(p,r);
  expect(find(checks,'column-flexure-y').demand!/kft).toBeCloseTo(68.11,1);
  expect(find(checks,'column-interaction').utilization).toBeCloseTo(.3941,3);
  expect(find(checks,'column-longitudinal-path').status).toBe('unverified');
 });
 it('takes the longitudinal force out at a crane-level strut when one is entered',()=>{
  const p=demoFocus005();p.existingColumn!.longitudinalExit='girder-strut';
  const r=column(p),checks=existingColumnChecks(p,r);
  // The strut is specified at least 10 times the column's own stiffness at the seat (weak-axis translation in series
  // with the twist over the 27 in offset), so the column keeps at most 1/11 of the force: torsion F·e/11 and weak-axis bending.
  const z=r.support!.strut!;expect(z.share).toBeCloseTo(1/11,9);expect(z.required).toBeCloseTo(10*z.kc,6);expect(z.kc).toBeCloseTo(1/(1/z.kY+(27*inch)**2/z.Ktheta),6);
  expect(r.torsion!.T/kft).toBeCloseTo(.65,2);expect(r.governing.My.My/kft).toBeCloseTo(20.4,1);
  expect(find(checks,'column-longitudinal-path').status).toBe('pass');expect(find(checks,'column-interaction').utilization).toBeCloseTo(.313,3);
 });
});

describe('B8 column torsion from the 27 in runway offset (TR-13 §5.9.2)',()=>{
 it('twists the column with the bumper force times the girder offset and fails without a strut on the girder line',()=>{
  const p=demoFocus005(),r=column(p);
  expect(r.torsion!.offset/inch).toBeCloseTo(27,6);expect(r.torsion!.T/kft).toBeCloseTo(22.5,3);
  expect(r.torsion!.stress/ksi).toBeCloseTo(35.32,1);
  const t=find(existingColumnChecks(p,r),'column-torsion');expect(t.status).toBe('fail');expect(t.utilization).toBeCloseTo(1.175,2);
  expect(t.note).toContain('crane-level strut on the girder line');
 });
 it('solves the torsionally pinned column exactly: matches the closed form for a torque at mid-height',()=>{
  const p=demoFocus005(),s=existingColumnSection(p).section,props=sectionProperties(s),G=s.E/2.6;
  // Twist under T at mid-height of a column 50a long, both ends held: T(L/2)(L/2)/(GJ L) as warping fades.
  const a=Math.sqrt(s.E*props.Cw/(G*props.J)),L=20*a,r=pinnedTorsion(s,1e6,L/2,L);
  // Closed form for the symmetric case: φ(L/2) = (T/2GJ)(l − a·tanh(l/a)), l = L/2.
  const l=L/2;expect(r.twist/(1e6/(2*G*props.J)*(l-a*Math.tanh(l/a)))).toBeCloseTo(1,6);
 });
});

describe('B9 frame type',()=>{
 it('flags the column check until the frame type is entered, and applies B2 to the lateral moments of a sway frame',()=>{
  const p=demoFocus005();expect(find(checksOf(p),'column-frame').status).toBe('unverified');
  p.existingColumn!.frame={type:'sway',source:'test'};expect(find(checksOf(p),'column-frame').status).toBe('unverified');
  const base=column(demoFocus005()).combinations.find(k=>k.id==='LRFD 4-S+')!;
  p.existingColumn!.frame={type:'sway',B2:1.2,source:'test'};
  const r=column(p),k=r.combinations.find(v=>v.id==='LRFD 4-S+')!;
  expect(find(existingColumnChecks(p,r),'column-frame').status).toBe('pass');expect(k.Mx).toBeGreaterThan(base.Mx);
  p.existingColumn!.frame={type:'braced',source:'test'};expect(find(checksOf(p),'column-frame').status).toBe('pass');
 });
});

describe('B10 TR-13 §5.3 drift and rail gauge',()=>{
 it('limits drift to H/400 or 2 in with H from the base to the top of the crane girder (0.60 in), was h/240 (1.03 in)',()=>{
  const p=demoFocus005(),d=find(checksOf(p),'column-drift');
  expect(before('column-drift')!.capacity!/inch).toBeCloseTo(1.03,2);
  expect(d.capacity!/inch).toBeCloseTo(.6045,3);expect(d.status).toBe('pass');
  const b=longitudinalBracingChecks(p,longitudinalBracingAnalysis(p,reactions));
  expect(before('brace-drift')!.capacity!/inch).toBeCloseTo(.9,2);expect(find(b,'brace-drift').capacity!/inch).toBeCloseTo(.6045,3);
  expect(find(b,'brace-drift-wind').status).toBe('unverified');
 });
 it('checks the 10-year wind drift and the rail gauge (+1 in / −1/2 in, snow reduced) when the frame data is entered',()=>{
  const p=demoFocus005(),c0=checksOf(p);
  expect(find(c0,'column-drift-wind').status).toBe('unverified');expect(find(c0,'column-rail-gauge').status).toBe('unverified');
  p.existingColumn!.service={wind10:.5*inch,spreadD:.1*inch,spreadS:.3*inch,roofSnow:25*psf,source:'test frame analysis'};
  const c1=checksOf(p),g=find(c1,'column-rail-gauge'),crane=column(p).support!.gauge.crane;
  expect(find(c1,'column-drift-wind').status).toBe('pass');
  // 25 psf ≤ 30 psf: snow reduced 50%; both columns: 2(0.1 + 0.5·0.3) = 0.5 in plus the crane part.
  expect(g.demand!).toBeCloseTo(crane+.5*inch,6);expect(g.status).toBe('pass');expect(g.capacity!/inch).toBeCloseTo(1,9);
  p.existingColumn!.service={...p.existingColumn!.service,wind10:.7*inch};expect(find(checksOf(p),'column-drift-wind').status).toBe('fail');
  p.longitudinalBracing!.wind10=2*kip;const b=longitudinalBracingChecks(p,longitudinalBracingAnalysis(p,reactions));expect(find(b,'brace-drift-wind').status).toBe('pass');
 });
});

describe('B13 tension-only rod bracing fatigue',()=>{
 it('reproduces 2 kip × 369.67/300 = 2.46 kip on 0.334 in² = 7.4 ksi, above the 7 ksi threshold',()=>{
  const p=demoFocus005(),r=longitudinalBracingAnalysis(p,reactions),f=r.rodFatigue!;
  expect(f.force/kip).toBeCloseTo(2.464,2);expect(f.area/inch**2).toBeCloseTo(.3345,3);
  expect(f.range/ksi).toBeCloseTo(7.37,1);expect(f.threshold/ksi).toBeCloseTo(7,9);
  // (Cf/n)^(1/3) with Cf = 3.9 × 10^8 and n = 400,000: 9.92 ksi.
  expect(f.allowable/ksi).toBeCloseTo(9.92,1);
  const c=find(longitudinalBracingChecks(p,r),'brace-rod-fatigue');expect(c.status).toBe('pass');expect(c.utilization).toBeCloseTo(.7425,3);
 });
});

describe('D33 TR-13 supporting-structure combinations on the column',()=>{
 it('runs 1.2Cdm with 1.6S (TR-13 3a) next to ASCE 7 combination 3 with the crane dead load at 1.0',()=>{
  const k=tr13SupportCombinations('LRFD').find(v=>v.id==='TR-13 3-S-L')!;
  expect(k.cd).toBe(1.2);expect(k.equation).toBe('1.2D + 1.2Cdm + 1.6S + (Cvm + Ci + Css + Cls + L)');
  const r=column(demoFocus005()),P=(f:(id:string)=>boolean)=>Math.max(...r.combinations.filter(v=>f(v.id)).map(v=>v.P));
  expect(P(id=>id.includes('TR-13'))/kip).toBeCloseTo(90.26,1);expect(P(id=>!id.includes('TR-13'))/kip).toBeCloseTo(88.98,1);
 });
});

describe('B11 seismic for a runway added to an existing building',()=>{
 it('reports the added mass (57.8 kip of new steel, 12.5 kip crane) and flags the existing lateral system',()=>{
  const p=demoFocus005(),m=runwayMass(p);
  // Both runway lines: girders and rails (48.2 kip) with the clips, joint bars, bearings, end stops, cap tiebacks and haunches.
  expect(m.runways/kip).toBeCloseTo(57.75,1);expect(m.crane/kip).toBeCloseTo(12.5,6);
  const c=checksOf(p);
  expect(find(c,'building-seismic-runway').status).toBe('unverified');expect(find(c,'building-seismic-alteration').status).toBe('unverified');
  p.existingColumn!.siteSeismic={enabled:true,SDS:1,sdc:'D',Ie:1,R:3.5,liftedLoadSecured:false,friction:.6,source:'test',alteration:{dcrIncrease:.08,source:'test'}};
  expect(find(checksOf(p),'building-seismic-alteration').status).toBe('pass');
  p.existingColumn!.siteSeismic.alteration={dcrIncrease:.15,source:'test'};expect(find(checksOf(p),'building-seismic-alteration').status).toBe('fail');
 });
 it('adds TR-13 5a and 7a to the runway analysis with the crane inertia capped by wheel friction',()=>{
  const p=demoFocus005();p.existingColumn!.siteSeismic={enabled:true,SDS:1,sdc:'D',Ie:1,R:3.5,liftedLoadSecured:false,friction:.6,source:'test'};
  const props=sectionProperties(p.section),a=runwayDesignAnalysis(p,props,girderStrength(p,props),10,20),k=a.combinations.find(v=>v.id==='LRFD 5a-E')!;
  expect(a.combinations.some(v=>v.id==='LRFD 7a-E')).toBe(true);
  // Cs = 1.0/3.5; along: Cs × 8 kip empty wheel loads + Cs × 192.8 lb/ft × 25 ft of girder line = 3.66 kip.
  expect(k.axial/kip).toBeCloseTo(3.66,1);expect(k.lateralMoment).toBeGreaterThan(0);
  // A capped friction coefficient below Cs governs the crane part along the runway.
  p.existingColumn!.siteSeismic!.friction=.1;
  const b=runwayDesignAnalysis(p,props,girderStrength(p,props),10,20).combinations.find(v=>v.id==='LRFD 5a-E')!;
  expect(b.axial/kip).toBeCloseTo(.8+1.377,1);
 },120000);
});

describe('C21 F13.1 on the column flange (column part)',()=>{
 it('meets the test on DEMO-FOCUS-005; where it is not met the column flexure uses Mn = Fu·Afn·Sx/Afg',()=>{
  const p=demoFocus005(),r=column(p);
  expect(r.support!.f13!.holds).toBe(true);expect(r.support!.f13!.demand/r.support!.f13!.capacity).toBeCloseTo(.8112,3);
  const q=demoFocus005();q.existingColumn!.Fu=55*ksi;q.details!.bracket!.receiver.Fu=55*ksi;
  const s=column(q);expect(s.support!.f13!.holds).toBe(false);
  expect(s.capacity.Mcx).toBeCloseTo(.9*s.support!.f13!.Mn,0);expect(s.capacity.flexure).toContain('F13-1');
 });
});

describe('DEMO-FOCUS-005 full calculation (one run)',()=>{
 let snap:CalculationSnapshot;
 beforeAll(()=>{snap=calculate(demoFocus005());},900000);
 it('shows the new column, bracing and building seismic results and keeps F13.1 as a test without a D/C',()=>{
  const c=(id:string)=>snap.checks.find(v=>v.id===id)!;
  expect(snap.errors).toEqual([]);
  expect(c('column-interaction').utilization).toBeCloseTo(.3941,3);
  expect(c('column-torsion').status).toBe('fail');
  expect(c('brace-rod-fatigue').status).toBe('pass');
  for(const id of ['column-longitudinal-path','column-frame','column-drift-wind','column-rail-gauge','brace-drift-wind','building-seismic-runway','building-seismic-alteration'])expect(c(id).status).toBe('unverified');
  const f13=c('cap-angle-column-holes');expect(f13.status).toBe('not-applicable');expect(f13.note).toContain('F13.1 satisfied');expect(c('column-flexure').note).toContain('tension flange rupture does not apply');expect(f13.utilization).toBeUndefined();
  expect(before('cap-angle-column-holes')!.utilization).toBeCloseTo(.8112,3);
  expect(snap.eligible).toBe(false);
 },900000);
});
