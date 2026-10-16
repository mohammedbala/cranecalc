import {describe,expect,it} from 'vitest';
import {buildProject} from '../src/engine/configurator';
import {templateProject} from '../src/engine/templates';
import {defaultRunwayConfig,type RunwayConfig} from '../src/engine/configInputs';
import {validateProject} from '../src/engine/calculate';
import {flangeTieGeometry,stiffenerTieGeometry} from '../src/engine/tieGeometry';
import {tieSizingRatios} from '../src/engine/flangeTieSizing';
import {bearingLayout,bearingPlateChecks,bearingSeat,bearingShim,bearingSurface,endBearingChecks,endBearingGeometry,fillerShearFactor,continuousBearings} from '../src/engine/endBearing';
import {boltCapacity} from '../src/engine/connectionStrength';
import {railClipStations,independentBearings,girderSegments} from '../src/engine/simpleSupports';
import {railClipInput} from '../src/engine/railSeat';
import {validateRunwayDetails} from '../src/engine/detailValidation';
import {constructionRequirements} from '../src/engine/constructionNotes';
import {plateFitOffset} from '../src/engine/plateTie';
import type {DesignAnalysis,ProjectInput} from '../src/engine/types';

const inch=25.4;
const config=(c:Partial<RunwayConfig>):RunwayConfig=>({...defaultRunwayConfig,units:'US',method:'LRFD',scope:'design',cranes:1,girder:'rolled',structure:'existing',...c});
// Simulation cases 3 and 5: rolled girders on brackets by others.
const sim3=config({title:'SIM-003',capacity:5,craneSpan:48,control:'cab',cmaa:'A',buildingClass:'D',system:'simple',bays:3,span:20,railElevation:26,support:'by-others',tie:'flexible-plate'});
const sim5=config({title:'SIM-005',capacity:15,craneSpan:48,control:'pendant',cmaa:'D',buildingClass:'A',system:'simple',bays:2,span:18,railElevation:19,support:'by-others',tie:'paired-bars',reach:24});
const memo=<T,>(f:()=>T)=>{let v:T|undefined;return ()=>v??=f();};
const p3=memo(()=>buildProject(sim3)),p5=memo(()=>buildProject(sim5));
const analysis=(p:ProjectInput,rotation=.004)=>({axial:5000,uplift:0,endRotation:rotation,reaction:200000} as unknown as DesignAnalysis);

describe('girder end zone: the tie on the bearing stiffener for rolled simple spans',()=>{
 it('replaces a saddle that cannot pass, and the saddle of a high-cycle runway, with bars on the bearing stiffener that validate',()=>{
  for(const p of [p3(),p5()]){
   const d=p.details!;
   expect(d.brace.arrangement).toBe('paired-bars');
   expect(d.brace.flangeAttachment!.enabled).toBe(false);
   expect(flangeTieGeometry(p)).toBeUndefined();
   const st=stiffenerTieGeometry(p)!;expect(st).toBeDefined();
   // One tie at each girder end, at its bearing center (two girder ends at a shared grid).
   expect(st.stations).toHaveLength(2*p.spans.length);
   for(const v of st.stations)expect(v.tieX).toBeCloseTo((v.start+v.finish)/2,9);
   // The column face stays at the face of the bracket by others; the bars start 1/4 in clear of the stiffener.
   expect(st.face).toBeCloseTo(d.brace.flangeAttachment!.columnFace!,9);
   expect(st.start-st.root).toBeGreaterThanOrEqual(inch/4-1e-9);
   expect(validateProject(p)).toEqual([]);
   expect(p.notes).toMatch(/bearing stiffener/);
  }
  // Case 3: the flexible plate's saddle left the clip over the saddle above its limit; the tie is paired bars on the stiffener.
  expect(p3().notes).toMatch(/plate-tie-keeper-flange|flange-tie-/);
  // Case 5: a CMAA D crane in a Class A building (no Category D/E attachment on the top flange).
  expect(p5().notes).toMatch(/high-cycle runway/);
  // The stiffener tie's sizing ratios are within their limits.
  const r=tieSizingRatios(p5());expect(Math.max(...Object.entries(r).filter(([k])=>k.startsWith('tie-stiffener')).map(([,v])=>v))).toBeLessThanOrEqual(1+1e-9);
 });
 it('fits both girder ends\' column gussets on the receiving flange and keeps the stop bolts clear of the runway-end ties',()=>{
  const p=structuredClone(p5()),st=stiffenerTieGeometry(p)!;
  expect(st.receiver).toBeUndefined();
  // On a designed bracket the receiving flange is known: a 6 in flange is too narrow for the gussets at the shared grid.
  p.details!.bracket={...structuredClone(buildProject(config({...sim5,support:'twin-rib'})).details!.bracket!),enabled:true};
  p.details!.bracket.receiver.width=6*inch;
  expect(validateRunwayDetails(p).join(' ')).toMatch(/column tie gussets at the bearing stiffeners must fit on the receiving column flange/);
  // Stop bolts moved over the tie at the runway end clash with the gusset and bars.
  const q=structuredClone(p5()),stop=q.details!.endStop!;
  stop.setback=q.details!.bearing.length/2-stop.bolts.edge;stop.bolts.gauge=q.section.bf;
  expect(validateRunwayDetails(q).join(' ')).toMatch(/end stop bolts and nuts/);
 });
 it('keeps rail clips off a remaining top-flange saddle',()=>{
  // Template t01: a 10-ton cab crane in a Class C building, whose sized saddle keeps within its limits.
  const p=templateProject('t01');
  const g=flangeTieGeometry(p);expect(g).toBeDefined();
  const clip=railClipInput(p.details!.rail),reach=clip.baseLength/2+clip.weld+p.section.tf,half=g!.attachment.saddleLength/2+g!.attachment.weldSize;
  for(const v of g!.stations)for(const k of railClipStations(p))expect(Math.abs(k-v.tieX)).toBeGreaterThan(reach+half);
  expect(validateProject(p)).toEqual([]);
 });
});

describe('girder end zone: bearing plates, slots and centered runway-end bearings',()=>{
 it('proportions the bearing from the bolt layout, the J10 end bearing and any saddle',()=>{
  const p=p5(),d=p.details!,bs=d.bearing,e=d.endBearing!;
  // 3/4 in bolts, 1/2 in travel: edge 2 in (1.5d - d_h/2 + L_slot/2 = 1.97 in), the plate washer 1/4 in past the slot
  // (1.5 + 1 + 0.5 = 3 in) plus the travel and the stiffener: N = 2(2 + 1.5 + 0.5 + t_s/2 + w) on the 1/4 in grid.
  expect(e.bolts.diameter).toBe(.75*inch);expect(d.simpleSupport!.guideTravel).toBe(.5*inch);expect(e.bolts.edge).toBe(2*inch);
  const N=Math.ceil(2*(2+1.5+.5+bs.stiffenerThickness/inch/2+bs.weldSize/inch)*4-1e-9)/4;
  expect(bs.length/inch).toBeCloseTo(N,9);expect(bs.length).toBeLessThan(10*inch);
  expect(bs.width).toBeCloseTo(Math.ceil((p.section.bf+inch/2)/(inch/4)-1e-9)*inch/4,9);expect(bs.thickness).toBe(.75*inch);
  expect(p.aist!.bearingLength).toBe(bs.length);
  // A remaining saddle needs its setback, half its length and its end fillet on each side of the stiffener.
  const saddle=bearingLayout(p,{rotation:.004,stiffenerThickness:bs.stiffenerThickness,stiffenerWeld:bs.weldSize,saddle:{setback:3*inch,length:3.5*inch,weld:.375*inch}});
  expect(saddle.length).toBe(Math.ceil(2*(3+1.75+.375)*4-1e-9)/4*inch);
 });
 it('sizes the slot travel for the span and end rotation and steps the bolt for the J3.3 long-slot proportion',()=>{
  const p=structuredClone(p5()),bs=p.details!.bearing,base={stiffenerThickness:bs.stiffenerThickness,stiffenerWeld:bs.weldSize};
  // A continuous 5 x 30 ft girder locating at grid 3: 90 ft to the farthest support, 30 C, 18 in x 0.004 and 1/8 in.
  p.system='continuous';p.spans=[1,2,3,4,5].map(()=>30*12*inch);
  const r=bearingLayout(p,{...base,rotation:.004}),need=12e-6*90*12*inch*30+p.section.d*.004+inch/8;
  expect(r.need).toBeCloseTo(need,6);expect(r.travel).toBe(Math.ceil(need/(inch/16)-1e-9)*inch/16);expect(r.travel).toBeGreaterThan(.5*inch);
  // Sleeved: the 3/4 in sleeve (1 7/16 in OD) admits a 1.5 in + 2u slot up to 2.5 d_s.
  expect(r.bolts.diameter).toBe(.75*inch);
  // Snug-tight slots in the bolt hole: a 7/8 in bolt for the longer slot.
  const snug=bearingLayout(p,{...base,rotation:.004,endBearing:{...p.details!.endBearing!,sliding:'snug-tight'}});
  expect(snug.bolts.diameter).toBe(.875*inch);expect(15/16*inch+2*snug.travel).toBeLessThanOrEqual(2.5*.875*inch+1e-9);
  // The edge follows the slot: 1.5d - d_h/2 + L_slot/2.
  expect(r.bolts.edge).toBeGreaterThanOrEqual(1.5*.75*inch-13/32*inch+(1.5*inch+2*r.travel)/2-1e-9);
 });
 it('checks the sleeved slot against 2.5 sleeve diameters and raises an open item beyond 1 in of travel',()=>{
  const p=structuredClone(p5()),e=p.details!.endBearing!;
  const at=(u:number)=>{p.details!.simpleSupport!.guideTravel=u;return endBearingChecks(p,e,{analysis:analysis(p),lateral:1000});};
  const slot=at(.5*inch).find(c=>c.id==='end-bearing-slot-fit')!,g=endBearingGeometry(p,e);
  expect(slot.capacity).toBeCloseTo(2.5*g.sleeve!.od,9);expect(slot.status).toBe('pass');
  expect(at(1.25*inch).find(c=>c.id==='end-bearing-slot-fit')!.status).toBe('fail');
  // A long span: more than 1 in of movement each way.
  p.spans=[300*12*inch];
  expect(at(.5*inch).find(c=>c.id==='end-bearing-slot-travel')?.status).toBe('unverified');
 });
 it('bends the bearing plate only beyond the flange tips',()=>{
  const p=structuredClone(p5()),bs=p.details!.bearing,R=100000;
  const [plate,contact]=bearingPlateChecks(p,R);
  const a=(bs.width-p.section.bf)/2,fp=R/(bs.width*bs.length);
  expect(plate.demand).toBeCloseTo(6*fp*a*a/2/bs.thickness**2,9);
  expect(contact.demand).toBeCloseTo(R/(Math.min(bs.width,p.section.bf)*bs.length),9);
  // A plate no wider than the flange has no spanning strip.
  bs.width=p.section.bf-inch;expect(bearingPlateChecks(p,R)[0].demand).toBe(0);
 });
 it('centers simple-span bearings on the runway-end grids, and optionally a continuous girder\'s',()=>{
  const p=p5();expect(p.details!.simpleSupport!.endGridBearing).toBe('centered');
  const N=p.details!.bearing.length,ends=independentBearings(p).filter(v=>v.station===0||v.station===p.spans.reduce((a,b)=>a+b,0));
  for(const v of ends)expect(v.center).toBeCloseTo(v.station,9);
  expect(girderSegments(p)[0].start).toBeCloseTo(-N/2,9);
  const q=structuredClone(p);q.system='continuous';delete q.details!.simpleSupport!.endGridBearing;
  expect(continuousBearings(q)[0].start).toBe(0);
  q.details!.simpleSupport!.endGridBearing='centered';
  const c=continuousBearings(q);expect(c[0].start).toBeCloseTo(-N/2,9);expect(c.at(-1)!.center).toBeCloseTo(c.at(-1)!.station,9);
 });
});

describe('girder end zone: shims, survey and faying surfaces',()=>{
 it('shims the bearings on seats by others, with Class A and the filler factors in the bolt checks',()=>{
  const p=p5(),e=p.details!.endBearing!;
  expect(bearingSeat(p)).toBe('by-others');expect(bearingShim(p)).toEqual({max:inch/2,plies:3});expect(bearingSurface(p)).toBe('A');
  const checks=endBearingChecks(p,e,{analysis:analysis(p),lateral:2000}),slip=checks.find(c=>c.id==='end-bearing-locating-slip')!,shear=checks.find(c=>c.id==='end-bearing-locating-shear')!;
  const V=slip.demand!,A=boltCapacity({grade:e.bolts.grade,diameter:e.bolts.diameter,planes:1,surface:'A',shear:V,tension:0,method:'LRFD'});
  // AISC J3.8: h_f = 0.85 for two or more fillers; J5.2a: 1 - 0.4(0.5 - 0.25) = 0.9 on the bolt shear.
  expect(slip.capacity).toBeCloseTo(.85*A.slip,6);expect(shear.capacity).toBeCloseTo(.9*A.shear,6);expect(fillerShearFactor(inch/2)).toBeCloseTo(.9,12);
  expect(slip.note).toMatch(/Class A/);
  const seat=checks.find(c=>c.id==='end-bearing-seat')!;expect(seat.note).toMatch(/survey the seats.*shim.*field drill or ream/i);
  const notes=constructionRequirements(p).flatMap(v=>v.items).join(' ');
  expect(notes).toMatch(/survey the seats; shim to the theoretical elevation/);expect(notes).toMatch(/field drill or ream the seat holes after the girder is lined and leveled/);expect(notes).toMatch(/seats surveyed and shimmed/);
  expect(notes).not.toMatch(/seat \(bearing\) plan position and elevation ±1\/8 in/);expect(notes).toMatch(/Class A faying surfaces/);
  expect(notes).toMatch(/Top-flange ties: bearing bolts first; set, line and level the girder/);
 });
 it('keeps Class B and no shims on a seat shop welded to a new column',()=>{
  const p=buildProject(config({title:'new',capacity:5,craneSpan:50,control:'pendant',cmaa:'B',buildingClass:'C',system:'simple',bays:2,span:20,structure:'new',support:'twin-rib',tie:'paired-bars'}));
  expect(bearingSeat(p)).toBe('shop');expect(bearingShim(p).max).toBe(0);expect(bearingSurface(p)).toBe('B');
  const notes=constructionRequirements(p).flatMap(v=>v.items).join(' ');expect(notes).toMatch(/seat \(bearing\) plan position and elevation ±1\/8 in/);
 });
 it('runs the flexible plate flexure at the 1/8 in alignment the drawings state',()=>{
  const p=structuredClone(p3());p.details!.brace.arrangement='flexible-plate';
  expect(plateFitOffset(p)).toBeCloseTo(inch/8+(p.details!.brace.release?.enabled?p.details!.brace.release.clearance/2:0),9);
 });
});
