import {describe,expect,it} from 'vitest';
import {saddleDemonstration} from './fixtures/saddleDemonstration';
import {cappedDemonstrationProject,demonstrationProject} from '../src/engine/demonstration';
import {templateProject} from '../src/engine/templates';
import {buildProject} from '../src/engine/configurator';
import {defaultRunwayConfig} from '../src/engine/configInputs';
import {validateProject} from '../src/engine/calculate';
import {validateRunwayDetails} from '../src/engine/detailValidation';
import {flangeTieGeometry,stiffenerTieGeometry,tieRelease,columnGussetExtension} from '../src/engine/tieGeometry';
import {columnFlangeWidth,flangeEffectiveWidth,flangeTieChecks,flangeTieResponse} from '../src/engine/flangeTieDesign';
import {bracketServiceDeflection,girderEndEstimate,sizeFlangeTie,sizingLimit,tieBoltSpacing,tieSizingDemands,tieSizingRatios} from '../src/engine/flangeTieSizing';
import {bracketSizingRatios,bracketSizingSet} from '../src/engine/bracketSizing';
import {sectionProperties} from '../src/engine/section';
import {girderDeadLoad} from '../src/engine/newSteel';
import type {CalculationSnapshot} from '../src/engine/types';

/** The saddle of the hand calculations: 4 x 1 3/4 in with 3/8 in end fillets, 3 1/2 in from the 12 1/2 in bearing center. */
const saddleOf375=()=>{const p=saddleDemonstration();Object.assign(p.details!.brace.flangeAttachment!,{saddleThickness:1.75*25.4,weldSize:.375*25.4,longitudinalSetback:3.5*25.4});return p;};
const inch=25.4,foot=304.8;

describe('girder flange at the tie saddle · effective width',()=>{
 it('spreads the saddle couple over B + a + min(a, s_e) (hand calculation, W24X229 demonstration)',()=>{
  // W24X229: t_w 0.96, k_des 2.23, t_f 1.73 in: web fillet toe k1 = 0.48 + 2.23 - 1.73 = 0.98 in from the web centerline.
  // Saddle 4 in long from 1 1/4 to 6 1/2 in across the flange: a = 3.875 - 0.98 = 2.895 in. The tie sits 3 1/2 in from
  // the 12 1/2 in bearing center toward the girder end: the saddle end is 6.25 - 3.5 - 2 = 0.75 in from it and the
  // 3/8 in end fillet leaves s_e = 0.375 in. b_e = 4 + 2.895 + 0.375 = 7.27 in.
  const p=saddleOf375(),fw=flangeEffectiveWidth(p);
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
  const p=saddleOf375(),a=p.details!.brace.flangeAttachment!;
  // 1/4 in more setback: the end fillet toe reaches the girder end, no spread on that side.
  a.longitudinalSetback=3.875*inch;
  expect(flangeEffectiveWidth(p).end).toBeCloseTo(0,9);expect(flangeEffectiveWidth(p).width/inch).toBeCloseTo(6.895,9);
  expect(validateRunwayDetails(p)).toEqual([]);
  a.longitudinalSetback=4*inch;
  expect(validateRunwayDetails(p).join(' ')).toContain('saddle end fillets must lie on the girder flange');
 });
});

describe('receiving column flange at the tie gusset · effective width',()=>{
 it('spreads the root force over h_g + min(x, s_top) (hand calculation, W14X90 column of the capped demonstration)',()=>{
  // W14X90: t_w 0.44, k_des 1.31, t_f 0.71 in: web fillet toe k1 = 0.22 + 1.31 - 0.71 = 0.82 in from the web centerline.
  // The ties stand at most 3 in from the column web: x = 3 - 0.82 = 2.18 in; 73.6 in of column above the 5 3/4 in tall
  // gusset: b_c = 5.75 + 2.18 = 7.93 in.
  const p=cappedDemonstrationProject(),g=flangeTieGeometry(p)!,w=columnFlangeWidth(p,g);
  expect(w.k1/inch).toBeCloseTo(.82,9);expect(w.x/inch).toBeCloseTo(2.18,9);expect(w.top/inch).toBeCloseTo(73.575,6);expect(w.width/inch).toBeCloseTo(7.93,9);
  // F = 10 kN at e = 3 + 0.875/2 = 3.4375 in from the column web: f_c = 6Fe/(b_c t_c^2) + 1.5F/(b_c t_c) = 79.97 + 4.13
  // = 84.10 MPa; the gusset-height strip (b = h_g) is the screening bound, 115.99 MPa.
  const F=10000,r=flangeTieResponse(p,F),e=3.4375*inch,tc=.71*inch,bc=7.93*inch,hg=5.75*inch;
  expect(r.column).toBeCloseTo(6*F*e/(bc*tc**2)+1.5*F/(bc*tc),9);expect(r.column).toBeCloseTo(84.10,2);
  expect(r.columnScreen).toBeCloseTo(6*F*e/(hg*tc**2)+1.5*F/(hg*tc),9);expect(r.columnScreen).toBeCloseTo(115.99,2);
  const c=flangeTieChecks({input:p,detailResults:{demands:{braceFatigue:4000}}} as CalculationSnapshot,F).find(v=>v.id==='flange-tie-column')!;
  expect(c.demand).toBeCloseTo(r.column,9);expect(c.equation).toContain('b_c=h_g+\\min(x,s_{top})');expect(c.note).toContain('Screening bound with the gusset-height strip alone');
  // Fatigue, a 10 kN range at 10^6 cycles. At the toes of the gusset root fillets, t_g/2 + w = 0.4375 + 0.3125 = 0.75 in
  // over h_g alone: 6F(t_g/2 + w)/(h_g t_c^2) + 1.5F/(h_g t_c) = 24.06 + 5.70 = 29.76 MPa against Category E' 50.37 MPa;
  // at the web fillet toe the 84.10 MPa root stress against Category A 434.3 MPa.
  const fat=flangeTieChecks({input:p,detailResults:{demands:{braceFatigue:F}}} as CalculationSnapshot,F).find(v=>v.id==='flange-tie-column-fatigue')!;
  expect(r.columnToe).toBeCloseTo(6*F*.75*inch/(hg*tc**2)+1.5*F/(hg*tc),9);expect(r.columnToe).toBeCloseTo(29.76,2);
  expect(fat.demand).toBeCloseTo(r.columnToe,9);expect(fat.utilization).toBeCloseTo(29.7586/50.3741,3);
  expect(fat.note).toContain('Category A');expect(fat.note).toContain('Screening bound');
  // A column ending 1 in above the gusset spreads the force no farther than that: b_c = 5.75 + 1 = 6.75 in.
  const col=p.existingColumn!;col.height=col.seatElevation+p.details!.bearing.thickness+p.section.d/2+g.topCenter+g.columnGusset/2+inch;
  expect(columnFlangeWidth(p,g).width/inch).toBeCloseTo(6.75,9);
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
  // t01 analysis (a mill-type cab crane, side thrust 0.4Q; the tie on the bearing stiffener, the restraint at its bar
  // line; the W18X130 the calibrated girder screening sizes): brace force 15.84 kip with the imperfection force
  // (11.59 + 4.25), fatigue range 6.15 kip (tests/fixtures/sheets/t01). The estimate is calibrated to the analysis
  // (tieForceCalibration).
  const d=tieSizingDemands(templateProject('t01')),kip=4448.2216152605;
  expect(d.force/kip).toBeGreaterThan(15.84);expect(d.force/kip).toBeLessThan(15.84*1.15);
  expect(d.range/kip).toBeGreaterThan(6.15);expect(d.range/kip).toBeLessThan(6.15*1.25);
  expect(d.rotation).toBeCloseTo(5.031e-3,5);expect(d.serviceRotation).toBeCloseTo(2.389e-3,5);
 });
});

describe('configured tie proportions',()=>{
 it('sizes the t01 tie from the girder: minimum bolt spacing, slots for the movement, a longer flexible length',()=>{
  // t01's saddle, under the tie force at the tie line, exceeds its flange limits: the tie is on the bearing stiffener.
  const p=templateProject('t01'),t=p.details!.brace,c=t.connection,g=stiffenerTieGeometry(p)!,r=tieRelease(p)!;
  expect(validateProject(p)).toEqual([]);expect(flangeTieGeometry(p)).toBeUndefined();
  // 1/2 in bolts: pitch 2 2/3 d = 1.33 in -> 1 3/8 in, edge 1.5 d = 0.75 in; the sleeved column-end slots (1 1/8 in
  // wide) keep d_b + 1/16 in between rows: pitch 1 3/4 in (tie-release-pitch).
  expect(tieBoltSpacing(.5*inch)).toEqual({pitch:1.375*inch,edge:.75*inch});
  expect(c.pitch).toBeCloseTo(r.minimumPitch,9);expect(c.pitch).toBeCloseTo(1.75*inch,9);expect(c.edge).toBeCloseTo(.75*inch,9);
  // Slot travel: 1/16 in bracket deflection limit x 1.25 + no setback (the tie at the bearing center) + 1/16 + 1/32 in
  // = 0.172 in -> 3/16 in.
  expect(t.release!.travel).toBeCloseTo(3/16*inch,9);
  expect(c.gauge).toBeCloseTo(r.minimumGauge,9);expect(t.width).toBeGreaterThanOrEqual(c.gauge+2*c.edge-1e-9);
  // The reach grows to 22 in for the bars' flexible length past the longer bolt groups (the 1 3/4 in row pitch), the
  // bars widened for the axial share of H1 (a wider bar adds compression strength, not imposed-movement ratio).
  expect(p.details!.bracket!.reach).toBeCloseTo(22*inch,9);expect(g.face).toBeCloseTo(22*inch,9);
  const free=t.length-2*((c.rows-1)*c.pitch+2*c.edge)-columnGussetExtension(p);
  expect(free/inch).toBeGreaterThan(8);
  // Under the sizing estimates (the fatigue range 1.25 H against the analysis's 1.05 H) every ratio is near or below one;
  // the imposed-movement checks the old proportions failed by up to 2.5 are well below.
  const ratios=tieSizingRatios(p);
  expect(Math.max(...Object.values(ratios))).toBeLessThan(1.1);
  for(const id of ['tie-move-strength','tie-move-gusset','tie-move-weld','tie-move-root-fatigue'])expect(ratios[id],id).toBeLessThan(1);
 });
 it('holds strength and fatigue to 0.9, the imposed movement to 0.93 and fit limits to one',()=>{
  const r=tieSizingRatios(templateProject('t01'));
  expect(sizingLimit(r,'flange-tie-flange')).toBe(.9);expect(sizingLimit(r,'tie-move-strength')).toBeCloseTo(.93,12);
  expect(sizingLimit(r,'tie-pitch')).toBe(1);expect(sizingLimit(r,'tie-move-strength',.97)).toBe(1);
 });
 it('sizes the tie before the bracket: the bracket at the reach the tie needs, the release travel the tie\'s own',()=>{
  // The 1/4 in bars on the bearing stiffener pass at a 22 in reach, so the welded seats are sized there.
  const p=templateProject('t01'),b=p.details!.bracket!,t=p.details!.brace;
  expect(b.reach).toBeCloseTo(22*inch,9);expect(stiffenerTieGeometry(p)!.face).toBeCloseTo(b.reach,9);expect(t.length).toBeCloseTo(t.reach,9);
  // The slots take the bracket at its deflection limit with the cranes and impact, the end rotation over the setback
  // and the positioning allowance: the bracket sizing's release coordination holds wherever its deflection check does.
  const set=bracketSizingSet(p),rel=set.release!,r=bracketSizingRatios(p,set);
  expect(rel.travel).toBeCloseTo(t.release!.travel,9);
  expect(b.deflectionLimit*rel.factor+rel.other).toBeLessThanOrEqual(rel.travel+1e-9);
  expect(r.deflection).toBeLessThanOrEqual(.9+1e-9);expect(r.release).toBeLessThan(1);
  // A configured reach is kept, the tie sized there.
  const q=buildProject({...p.configurator!,reach:24});
  expect(q.details!.bracket!.reach).toBeCloseTo(24*inch,9);expect(stiffenerTieGeometry(q)!.face).toBeCloseTo(24*inch,9);
  expect(validateProject(q)).toEqual([]);expect(Math.max(...Object.values(tieSizingRatios(q)))).toBeLessThanOrEqual(1);
 });
 it('gives the release slots the travel of a bracket that deflects more than its limit (an unsized W stub on t03)',()=>{
  // t03 with an unsized W12X58 stub, which deflects past its 1/16 in limit (the W12X65 the configurator
  // used before the stub was sized no longer does under the shorter, centered bearings):
  // the slots take its own service deflection.
  const p=structuredClone(templateProject('t03')),b=p.details!.bracket!;
  b.corbelShape='W12X58';b.seatThickness=1.5*inch;b.rolled={...b.rolled!,flangeJoint:'cjp',stiffeners:true,stiffenerThickness:.5*inch};delete b.columnStiffeners;
  const q=sizeFlangeTie(p),t=q.details!.brace,v=bracketServiceDeflection(q)!,d=tieSizingDemands(q);
  expect(v).toBeGreaterThan(b.deflectionLimit);expect(d.support).toBeCloseTo(v,9);
  const impact=Math.max(...q.cranes.map(c=>c.impact));
  // The end rotation moves the tie vertically over its setback from the bearing center: none for a tie on the bearing
  // stiffener (t03's saddle gives way to it).
  const setback=flangeTieGeometry(q)?.attachment.longitudinalSetback??0;
  expect(t.release!.travel).toBeGreaterThanOrEqual(v*q.cranes.length*(1+impact)+d.rotation*setback+inch/16-1e-9);
  // Sized brackets, the welded seat of t01 and the W stub of t03, stay within their limits, which the travel then covers.
  for(const id of ['t01','t03']){const r=templateProject(id);expect(bracketServiceDeflection(r)!,id).toBeLessThan(r.details!.bracket!.deflectionLimit);
   expect(tieSizingDemands(r).support,id).toBeCloseTo(r.details!.bracket!.deflectionLimit,9);}
 });
 it('turns a saddle tie that cannot pass on a capped girder into the cap tieback angle, with the reason',()=>{
  // 5-ton pendant crane on a W14X61 + C15X33.9: the W flange under the saddle takes 1.26 of its local strength.
  const p=buildProject({...defaultRunwayConfig,capacity:5,craneSpan:50,control:'pendant',span:20,girder:'capped',support:'twin-rib',tie:'paired-bars'});
  expect(p.details!.brace.arrangement).toBe('cap-angle');expect(p.details!.brace.capAngle).toBeDefined();
  expect(p.notes).toContain('do not suit this capped girder');expect(p.details!.bracket!.reach).toBeCloseTo(20*inch,9);
  expect(validateProject(p)).toEqual([]);
  // The capped templates t04 and t11 too, with the tie force at the tie line.
  expect(templateProject('t04').details!.brace.arrangement).toBe('cap-angle');
  expect(templateProject('t11').details!.brace.arrangement).toBe('cap-angle');
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
