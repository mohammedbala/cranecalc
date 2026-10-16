import {describe,it,expect} from 'vitest';
import {templateProject} from '../src/engine/templates';
import {buildProject} from '../src/engine/configurator';
import {defaultRunwayConfig} from '../src/engine/configInputs';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {calculate,validateProject} from '../src/engine/calculate';
import {sizeWeldedBracket,bracketSizingSet,bracketSizingRatios,supportBearings,ribSpacingFor,nutClearance,bracketWeight,tieReach,girderEndRotation} from '../src/engine/bracketSizing';
import {torqueArm} from '../src/engine/bracketDesign';
import {haunchedRibErrors,ribGeometry} from '../src/engine/bracketRib';
import {supportReactions} from '../src/engine/supportReactions';
import {sectionProperties} from '../src/engine/section';
import {railTopAboveSteel} from '../src/engine/railSeat';
import {flangeTieGeometry,stiffenerTieGeometry,columnGussetExtension} from '../src/engine/tieGeometry';
import {tieSizingRatios} from '../src/engine/flangeTieSizing';
import {initialColumnStiffeners,receiverK} from '../src/engine/columnStiffenerInputs';
import {columnStiffenerErrors} from '../src/engine/columnStiffeners';
import {simpleSupportInput} from '../src/engine/simpleSupports';
import type {ProjectInput} from '../src/engine/types';

const inch=25.4,lb=4.4482216152605;
/** Every ratio the sizing drives within the target; the code minimums and the tie's release travel met exactly (at most 1). */
const within=(p:ProjectInput,target=.9)=>Object.entries(bracketSizingRatios(p)).filter(([k,v])=>v>(['colstiff-proportions','nuts','release'].includes(k)?1:target)+1e-9).map(([k,v])=>`${k} ${v.toFixed(3)}`);

describe('welded rib bracket sizing set',()=>{
 it('puts each support\'s factored reaction on one girder end at its bearing offset, with the side thrust and its torque',()=>{
  const p=templateProject('t01'),d=p.details!,set=bracketSizingSet(p),r=supportReactions(p,sectionProperties(p.section)),Lbr=d.bearing.length,gap=simpleSupportInput(p).endGap;
  // Grid 2 (an interior grid of simple spans): the girder ends gap/2 off the grid, each reaction 0.8 of the bearing length from its girder end.
  const bearings=supportBearings(p)[1].map(v=>v.reaction).sort((a,b)=>a-b);
  expect(bearings[0]).toBeCloseTo(-(gap/2+.8*Lbr),9);expect(bearings[1]).toBeCloseTo(gap/2+.8*Lbr,9);
  const s=r.supports[1],R=1.2*(s.D-s.Ds)+1.6*(s.Cd+s.Cv+s.Ci),H=1.6*s.Css,x=r.supports[1].x;
  const at=set.strength.find(v=>v.x===x&&v.loads[0].offset>0&&v.horizontal.longitudinal===1.6*r.Cls)!;
  expect(at.loads[0].vertical).toBeCloseTo(R,6);expect(at.loads[0].length).toBeCloseTo(.4*Lbr,9);expect(at.horizontal.bottom).toBeCloseTo(H,6);
  // Its support torque about the seat is the side thrust times the rail top height above the seat (T h_t = H h_rail).
  const railTop=d.bearing.thickness+p.section.d+railTopAboveSteel(p);
  expect(at.horizontal.top!*torqueArm(p)).toBeCloseTo(H*railTop,3);
  // Fatigue: the crane reaction without impact, its own weight plus each bin's lifted fraction, on either girder end.
  const bins=set.fatigue.filter(v=>v.x===x&&v.loads[0].offset>0).sort((a,b)=>a.bin-b.bin),N=r.supports.map(v=>v.Cd+v.Cv),Nmax=Math.max(...N),Cd=Math.max(...r.supports.map(v=>v.Cd));
  bins.forEach(v=>{const f=d.spectrum[v.bin].liftFraction;expect(v.loads[0].vertical).toBeCloseTo((s.Cd+s.Cv)*(Cd+f*(Nmax-Cd))/Nmax,6);});
  expect(set.fatigue.some(v=>v.x===x&&v.loads[0].offset<0)).toBe(true);
  expect(set.serviceReaction).toBeCloseTo(Math.max(...r.supports.map(v=>v.D+v.Cd+v.Cv+v.Ci)),6);
 });
});

describe('welded rib bracket sizing',()=>{
 it('sizes the t01 twin-rib seat within every ratio, valid, ribs toward the bearing stiffeners and clear of the nuts',()=>{
  const p=templateProject('t01'),b=p.details!.bracket!;
  expect(validateProject(p)).toEqual([]);expect(within(p)).toEqual([]);
  // The ribs as near the bearing stiffener lines (gap + N apart) as the 14.67 in W14X120 flange takes both root fillets
  // 1/4 in inside its tips, and clear of the bearing bolt nuts below the seat.
  const n=nutClearance(p,b)!;expect(n.clear).toBeGreaterThanOrEqual(n.required);
  expect(b.ribSpacing+b.ribThickness+2*b.rootWeld+inch/2).toBeLessThanOrEqual(b.receiver.width);
  expect(b.ribSpacing).toBeCloseTo(ribSpacingFor(p,b)!,9);
  expect(b.ribSpacing+b.ribThickness+2*b.rootWeld+inch/2+inch/8).toBeGreaterThan(Math.min(b.receiver.width,b.ribThickness+2*b.rootWeld+inch/2+simpleSupportInput(p).endGap+p.details!.bearing.length));
  // The existing W14X120 takes continuity plates at the seat and the rib bottom; fillets within their plate-edge limits.
  const s=b.columnStiffeners!;expect(s.enabled).toBe(true);expect(s.flangeWeld).toBeLessThan(s.thickness);expect(s.webWeld).toBeLessThan(s.thickness);
  expect(b.rootWeld).toBeLessThanOrEqual(Math.min(b.ribThickness,b.receiver.flangeThickness)-inch/16+1e-9);
  // Lighter than the configured demonstration bracket it replaces (26 x 2 in seat, 24 x 1 1/2 in ribs).
  const demo=cappedDemonstrationProject().details!.bracket!;expect(bracketWeight(p,b)).toBeLessThan(bracketWeight(p,{...demo,reach:b.reach,seatProjection:b.seatProjection,receiver:b.receiver}));
 });
 it('starts light: a 2-ton crane gets a light bracket, a 25-ton crane a heavier one',()=>{
  const light=templateProject('t11'),mid=templateProject('t01'),heavy=buildProject({...defaultRunwayConfig,capacity:25,craneSpan:70,span:30,support:'twin-rib'});
  const w=(p:ProjectInput)=>bracketWeight(p,p.details!.bracket!)/lb;
  for(const p of [light,heavy]){expect(validateProject(p)).toEqual([]);expect(within(p)).toEqual([]);}
  expect(w(light)).toBeLessThan(500);expect(w(light)).toBeLessThan(w(mid));expect(w(mid)).toBeLessThan(w(heavy));
  // The configured demonstration bracket (2-ton crane) shrinks.
  const demo=cappedDemonstrationProject(),sized=sizeWeldedBracket(demo);
  expect(bracketWeight(sized,sized.details!.bracket!)).toBeLessThan(.6*bracketWeight(demo,demo.details!.bracket!));expect(within(sized)).toEqual([]);
 });
 it('grows the haunched seat within the free-edge slope and proportion limits, and stiff enough for the tie release',()=>{
  const p=templateProject('t04'),b=p.details!.bracket!,g=ribGeometry(b);
  // The tie's column-end slots take the bracket's service deflection with the cranes and impact, the end rotation over
  // the tie setback and the 1/16 in positioning allowance (tie-release-travel).
  const r=bracketSizingRatios(p);expect(r.release).toBeDefined();expect(r.release).toBeLessThanOrEqual(1);
  expect(b.arrangement).toBe('haunched-seat');expect(haunchedRibErrors(b)).toEqual([]);expect(validateProject(p)).toEqual([]);expect(within(p)).toEqual([]);
  expect(g.tip).toBeLessThan(g.root);expect(g.tip).toBeGreaterThanOrEqual(6*inch-1e-9);expect(g.length/g.root).toBeLessThanOrEqual(2);
 });
 it('keeps a new column free of continuity plates where they would clash with its bracing gussets',()=>{
  const p=templateProject('t06'),b=p.details!.bracket!;
  expect(p.existingColumn?.isNew).toBe(true);expect(b.columnStiffeners).toBeUndefined();
  // Plates at the seat would meet the rod bracing gusset on the web at the braced columns: the ribs grow deeper instead.
  const plates={...b,columnStiffeners:initialColumnStiffeners(b.receiver,receiverK(b,p.existingColumn)?.k,Math.max(b.seatThickness,b.ribThickness))};
  expect(columnStiffenerErrors({...p,details:{...p.details!,bracket:plates}}).join(' ')).toContain('clashes with the crane-level bracing gusset');
  expect(validateProject(p)).toEqual([]);expect(within(p)).toEqual([]);
 });
});

describe('reach for the top-flange tie',()=>{
 it('lengthens the reach only as the tie bars need, and the tie still ends at the column face',()=>{
  // t01 ties at its bearing stiffener (its saddle exceeds the flange limits with the tie force at the tie line).
  const p=templateProject('t01'),b=p.details!.bracket!,t=p.details!.brace,g=stiffenerTieGeometry(p)!,c=t.connection,free=t.length-2*((c.rows-1)*c.pitch+2*c.edge)-columnGussetExtension(p);
  // The tie ends at the bracket reach (the column face), and its length is its reach.
  expect(t.length).toBeCloseTo(t.reach,9);expect(g.face).toBeCloseTo(b.reach,9);
  // Clear length between the bolt groups: the stiffener tie is sized for the end movement by its own checks (tie-move-*,
  // sizeFlangeTie), within the imposed-movement limit; tieReach serves the saddle ties.
  expect(free).toBeGreaterThan(0);expect(tieSizingRatios(p)['tie-move-strength']).toBeLessThanOrEqual(1);
  // A configured reach is kept.
  const fixed=buildProject({...templateProject('t01').configurator!,reach:20});expect(fixed.details!.bracket!.reach).toBeCloseTo(20*inch,9);
  expect(fixed.details!.brace.length).toBeCloseTo(fixed.details!.brace.reach,9);expect(stiffenerTieGeometry(fixed)!.face).toBeCloseTo(20*inch,9);
  // Thinner bars need no longer reach.
  const q=structuredClone(fixed);q.details!.brace.thickness=inch/8;q.details!.brace.flangeAttachment!.columnFace=q.details!.bracket!.reach;q.details!.brace.length=q.details!.brace.reach;
  expect(tieReach(q,20*inch)).toBeCloseTo(20*inch,9);
 });
});

describe('sized brackets in the full calculation',()=>{
 it('t01: no bracket or column stiffener check fails',()=>{
  const s=calculate(templateProject('t01'));expect(s.errors).toEqual([]);
  const failing=s.checks.filter(c=>(c.id.startsWith('bracket-')||c.id.startsWith('haunched-')||c.id.includes('colstiff'))&&!['pass','not-applicable','excluded'].includes(c.status)).map(c=>`${c.id} ${c.utilization?.toFixed(3)}`);
  expect(failing).toEqual([]);
  expect(s.checks.find(c=>c.id==='end-bearing-wrench-rib')?.status).toBe('pass');
 },900000);
});
