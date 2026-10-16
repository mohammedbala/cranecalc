import {describe,expect,it} from 'vitest';
import {demonstrationProject} from '../src/engine/demonstration';
import {templateProject} from '../src/engine/templates';
import {validateProject} from '../src/engine/calculate';
import {validateRunwayDetails} from '../src/engine/detailValidation';
import {flangeTieGeometry,stiffenerTieGeometry,tieRelease,columnGussetExtension} from '../src/engine/tieGeometry';
import {flangeEffectiveWidth,flangeTieChecks,flangeTieResponse} from '../src/engine/flangeTieDesign';
import {girderEndEstimate,sizeFlangeTie,tieBoltSpacing,tieSizingDemands,tieSizingRatios} from '../src/engine/flangeTieSizing';
import {sectionProperties} from '../src/engine/section';
import {girderDeadLoad} from '../src/engine/newSteel';
import type {CalculationSnapshot} from '../src/engine/types';

const inch=25.4,foot=304.8;

describe('girder flange at the tie saddle · effective width',()=>{
 it('spreads the saddle couple over B + a + min(a, s_e) (hand calculation, W24X229 demonstration)',()=>{
  // W24X229: t_w 0.96, k_des 2.23, t_f 1.73 in: web fillet toe k1 = 0.48 + 2.23 - 1.73 = 0.98 in from the web centerline.
  // Saddle 4 in long from 1 1/4 to 6 1/2 in across the flange: a = 3.875 - 0.98 = 2.895 in. The tie sits 3 1/2 in from
  // the 12 1/2 in bearing center toward the girder end: the saddle end is 6.25 - 3.5 - 2 = 0.75 in from it and the
  // 3/8 in end fillet leaves s_e = 0.375 in. b_e = 4 + 2.895 + 0.375 = 7.27 in.
  const p=demonstrationProject(),fw=flangeEffectiveWidth(p);
  expect(fw.k1/inch).toBeCloseTo(.98,9);expect(fw.a/inch).toBeCloseTo(2.895,9);expect(fw.end/inch).toBeCloseTo(.375,9);expect(fw.width/inch).toBeCloseTo(7.27,9);
  // F = 10 kN at h = 4 7/8 in below the flange: f = 6Fh/(b_e t_f^2) + 1.5F/(b_e t_f) = 20.837 + 1.849 = 22.685 MPa.
  const F=10000,r=flangeTieResponse(p,F),h=4.875*inch,tf=1.73*inch,be=7.27*inch,B=4*inch;
  expect(r.h).toBeCloseTo(h,9);
  expect(r.flange).toBeCloseTo(6*F*h/(be*tf**2)+1.5*F/(be*tf),9);expect(r.flange).toBeCloseTo(22.685,2);
  // The saddle-length strip is the screening bound: 41.23 MPa.
  expect(r.flangeScreen).toBeCloseTo(6*F*h/(B*tf**2)+1.5*F/(B*tf),9);expect(r.flangeScreen).toBeCloseTo(41.23,1);
  const check=flangeTieChecks({input:p,detailResults:{demands:{braceFatigue:4000}}} as CalculationSnapshot,F).find(c=>c.id==='flange-tie-flange')!;
  expect(check.demand).toBeCloseTo(r.flange,9);expect(check.equation).toContain('b_e=B+a+\\min(a,s_e)');
  expect(check.note).toContain('Screening bound with the saddle-length strip alone');expect(check.referenceIds).toContain('flange-saddle-mechanics');
 });
 it('stops the spread at the girder end and refuses a saddle fillet off the flange',()=>{
  const p=demonstrationProject(),a=p.details!.brace.flangeAttachment!;
  // 1/4 in more setback: the end fillet toe reaches the girder end, no spread on that side.
  a.longitudinalSetback=3.875*inch;
  expect(flangeEffectiveWidth(p).end).toBeCloseTo(0,9);expect(flangeEffectiveWidth(p).width/inch).toBeCloseTo(6.895,9);
  expect(validateRunwayDetails(p)).toEqual([]);
  a.longitudinalSetback=4*inch;
  expect(validateRunwayDetails(p).join(' ')).toContain('saddle end fillets must lie on the girder flange');
 });
});

describe('tie sizing estimates',()=>{
 it('finds the girder end rotation of a simple span under the crane (closed form)',()=>{
  // Demonstration: 25 ft simple bays, two 20 kip wheels 10 ft apart, 25% impact.
  const p=demonstrationProject(),props=sectionProperties(p.section),EI=p.section.E*props.Ix,L=25*foot,est=girderEndEstimate(p,200);
  const wheels=p.cranes[0].wheels,theta=(origin:number)=>Math.max(...[0,1].map(end=>wheels.reduce((n,w)=>{const x=origin+w.offset;if(x<0||x>L)return n;const b=end?x:L-x;return n+w.loaded*b*(L*L-b*b)/(6*EI*L);},0)));
  let service=0;for(let i=0;i<=4000;i++)service=Math.max(service,theta(-10*foot+i*(L+10*foot)/4000));
  expect(est.service/service).toBeGreaterThan(.995);expect(est.service/service).toBeLessThan(1.0001);
  // Factored: 1.2 D + 1.6 (1 + I) C at the support, the dead load qL^3/(24EI) adding to the crane's rotation.
  const q=girderDeadLoad(p,props.weight);
  expect(est.factored).toBeCloseTo(1.2*q*L**3/(24*EI)+1.6*1.25*est.service,4);
 });
 it('estimates the tie force and range within the analysis of the 10-ton template t01',()=>{
  // t01 analysis: brace force 9.14 kip with the imperfection force, fatigue range 3.14 kip.
  const d=tieSizingDemands(templateProject('t01')),kip=4448.2216152605;
  expect(d.force/kip).toBeGreaterThan(9.14);expect(d.force/kip).toBeLessThan(9.14*1.1);
  expect(d.range/kip).toBeGreaterThan(3.14);expect(d.range/kip).toBeLessThan(3.14*1.25);
  expect(d.rotation).toBeCloseTo(3.080e-3,5);expect(d.serviceRotation).toBeCloseTo(1.462e-3,5);
 });
});

describe('configured tie proportions',()=>{
 it('sizes the t01 tie from the girder: minimum bolt spacing, slots for the movement, a longer flexible length',()=>{
  const p=templateProject('t01'),t=p.details!.brace,c=t.connection,g=flangeTieGeometry(p)!,r=tieRelease(p)!;
  expect(validateProject(p)).toEqual([]);
  // 5/8 in bolts: pitch 2 2/3 d = 1.67 in -> 1 3/4 in, edge 1.5 d = 0.94 in -> 1 in.
  expect(tieBoltSpacing(.625*inch)).toEqual({pitch:1.75*inch,edge:inch});
  expect(c.pitch).toBeCloseTo(1.75*inch,9);expect(c.edge).toBeCloseTo(inch,9);
  // Slot travel: 1/16 in bracket deflection limit x 1.25 + 3.08e-3 x 3 in + 1/16 + 1/32 in = 0.181 in -> 3/16 in.
  expect(t.release!.travel).toBeCloseTo(3/16*inch,9);
  expect(c.gauge).toBeCloseTo(r.minimumGauge,9);expect(t.width).toBeGreaterThanOrEqual(c.gauge+2*c.edge-1e-9);
  // The 20 in reach stays; the shorter column-end bolt group gives 8 3/4 in between the gussets (7 3/4 in before).
  expect(p.details!.bracket!.reach).toBeCloseTo(20*inch,9);
  expect(g.freeLength).toBeCloseTo(t.length-2*((c.rows-1)*c.pitch+2*c.edge)-columnGussetExtension(p),9);
  expect(g.freeLength/inch).toBeGreaterThan(8.5);
  // Under the sizing estimates (the fatigue range 1.25 H against the analysis's 1.05 H) every ratio is near or below one;
  // the imposed-movement checks the old proportions failed by up to 2.5 are well below.
  const ratios=tieSizingRatios(p);
  expect(Math.max(...Object.values(ratios))).toBeLessThan(1.1);
  for(const id of ['tie-move-strength','tie-move-gusset','tie-move-weld','tie-move-root-fatigue','saddle-toe-fatigue'])expect(ratios[id],id).toBeLessThan(1);
 });
 it('moves the column face out where the flexible length needs it, and sizes nothing it does not use',()=>{
  // Continuous t08: stiffener ties from 1/4 in clear of the bearing stiffener to a bracket reach chosen for the
  // thermal travel from the locating support.
  const p=templateProject('t08'),st=stiffenerTieGeometry(p)!,t=p.details!.brace;
  expect(validateProject(p)).toEqual([]);
  expect(st.start-st.root).toBeGreaterThanOrEqual(.25*inch-1e-9);
  expect(p.details!.bracket!.reach).toBeGreaterThan(20*inch);expect(p.details!.bracket!.reach).toBeLessThanOrEqual(30*inch);
  expect(t.length-2*st.connection-columnGussetExtension(p)).toBeGreaterThan(10*inch);
  // A cap tieback angle is not a flange tie: unchanged.
  const q=templateProject('t02');expect(sizeFlangeTie(q)).toBe(q);
 });
 it('refuses stiffener-tie bars that start inside the stiffener with no girder gusset left',()=>{
  const p=templateProject('t08');Object.assign(p.details!.brace,{length:26*inch,reach:26*inch});p.details!.bracket!.reach=20*inch;
  const errors=validateProject(p).join(' ');
  expect(errors).toContain('the girder tie gusset must reach from the bearing stiffener');
 });
});
