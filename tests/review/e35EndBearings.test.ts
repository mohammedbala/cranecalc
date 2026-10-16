import {beforeAll,describe,expect,it} from 'vitest';
import {demoFocus005,demoFocus005Before} from '../fixtures/demoFocus005';
import {withColumnReviewData} from '../fixtures/columnReviewData';
import {calculate} from '../../src/engine/calculate';
import {createDetailCollector} from '../../src/engine/detailAnalysis';
import {runwayDesignAnalysis} from '../../src/engine/designAnalysis';
import {girderStrength} from '../../src/engine/aiscStrength';
import {sectionProperties} from '../../src/engine/section';
import {seatEnds,seatMoment} from '../../src/engine/columnSupport';
import {existingColumnAnalysis,existingColumnChecks} from '../../src/engine/existingColumn';
import {supportReactions} from '../../src/engine/supportReactions';
import {girderSegments,independentBearings,endGridOverhang} from '../../src/engine/simpleSupports';
import {stubBoltLayout,bearingExtent,endGridBearingExtent} from '../../src/engine/rolledBracket';
import {taperedHaunchParts} from '../../src/engine/taperedHaunchParts';
import {endBearingChecks} from '../../src/engine/endBearing';
import {endStopChecks} from '../../src/engine/endStop';
import {railLayout} from '../../src/engine/railLayout';
import {drawingSheetSet} from '../../src/components/planSheet';
import {reportHtml} from '../../src/report/reportHtml';
import type {CalculationSnapshot,ProjectInput} from '../../src/engine/types';
import type {RunwayDetailResults} from '../../src/engine/runwayDetails';
import type {DesignAnalysis} from '../../src/engine/types';

/**
 * Review item E35: centering the end-bay bearings on the support web at the runway-end grids (grids 1 and 6 of
 * DEMO-FOCUS-005) with details.simpleSupport.endGridBearing = 'centered'. The girder runs half the 12 in bearing
 * (6 in) past the grid; the bearing, its stiffeners and the reaction (0.8 L_bearing from the girder end, 3.6 in from
 * the web instead of 9.6 in) follow. Absent or 'on-grid' keeps the girder end on the grid.
 */
const kft=1355817.948,ksi=6.894757293,inch=25.4;
const before=(id:string)=>demoFocus005Before().checks.find(c=>c.id===id)!;
const centered=<T extends ProjectInput>(p:T):T=>{p.details!.simpleSupport={...p.details!.simpleSupport!,endGridBearing:'centered'};return p;};
const factors={D:1.2,L:1.6,Cd:1.6,Cv:1.6};
const L=5*25*12*inch;

describe('E35 geometry: the end-bay girder runs past the grid, its bearing centered on the web',()=>{
 it('keeps the current geometry when the option is absent or on-grid',()=>{
  const a=demoFocus005(),b=demoFocus005();b.details!.simpleSupport={...b.details!.simpleSupport!,endGridBearing:'on-grid'};
  expect(girderSegments(b)).toEqual(girderSegments(a));expect(independentBearings(b)).toEqual(independentBearings(a));expect(seatEnds(b)).toEqual(seatEnds(a));
  expect(endGridOverhang(a,'left')).toBe(0);expect(girderSegments(a)[0].start).toBe(0);
 });
 it('extends the end girders by half the bearing length and centers their bearings on grids 1 and 6',()=>{
  const p=centered(demoFocus005()),s=girderSegments(p),b=independentBearings(p);
  expect(s[0].start/inch).toBeCloseTo(-6,9);expect((s[4].end-L)/inch).toBeCloseTo(6,9);
  // Interior girder ends stay half the 1 in gap from the shared grids.
  expect((s[1].start-s[1].leftGrid)/inch).toBeCloseTo(.5,9);
  expect(b[0].center).toBeCloseTo(0,9);expect(b.at(-1)!.center).toBeCloseTo(L,6);
  // The girder bearing stiffeners sit over the bearing center, L_bearing/2 from each girder end, at every end.
  for(const v of b)expect((v.center-v.start)/inch).toBeCloseTo(6,9);
  // The rail runs to the girder end: it starts 6 in further out at each stop.
  const r0=railLayout(demoFocus005()).rails[0],r1=railLayout(p).rails[0];
  expect((r0.start-r1.start)/inch).toBeCloseTo(6,9);expect((r1.end-r0.end)/inch).toBeCloseTo(6,9);
 });
 it('drops the seat moment at grids 1 and 6 from 28.0 to 10.5 kip-ft, below the 26.9 kip-ft of the interior grids',()=>{
  const e0=seatEnds(demoFocus005()),e1=seatEnds(centered(demoFocus005()));
  expect(e0[0][0].offset/inch).toBeCloseTo(9.6,6);expect(e1[0][0].offset/inch).toBeCloseTo(3.6,6);expect(e1[5][0].offset/inch).toBeCloseTo(-3.6,6);
  expect(seatMoment(e0[0],factors)/kft).toBeCloseTo(27.98,2);
  for(const j of [0,5]){const m=seatMoment(e1[j],factors)/kft;expect(m).toBeCloseTo(10.49,2);expect(m).toBeLessThan(seatMoment(e1[2],factors)/kft);}
  expect(seatMoment(e1[2],factors)/kft).toBeCloseTo(26.93,2);expect(e1.slice(1,5)).toEqual(e0.slice(1,5));
 });
 it('centers the runway-end bolts on the web: holes 4 in each side of the grid, clear of the web by more than before',()=>{
  const p=centered(demoFocus005()),e=p.details!.endBearing!,lay=stubBoltLayout(p,e),lay0=stubBoltLayout(demoFocus005(),e);
  const r=(v:number[])=>v.map(x=>Math.round(x/inch*1e6)/1e6);expect(r(lay.xs.slice(0,2))).toEqual([4,4]);expect(r(lay0.xs.slice(0,2))).toEqual([2,10]);
  // The innermost hole was the runway-end one, 2 in from the web; centered, the shared-grid one at 2.5 in governs.
  expect(lay0.inner/inch).toBeCloseTo(2,9);expect(lay.inner/inch).toBeCloseTo(2.5,9);expect(bearingExtent(p)/inch).toBeCloseTo(12.5,9);expect(endGridBearingExtent(p)/inch).toBeCloseTo(6,9);
  const parts=taperedHaunchParts(p),end=parts.bearings.find(v=>v.grid==='runway-end')!;
  expect(end.x0/inch).toBeCloseTo(-6,9);expect(end.x1/inch).toBeCloseTo(6,9);
  expect([...new Set(parts.bolts.filter(v=>v.grid==='runway-end').map(v=>Math.round(v.x/inch*1e6)/1e6))]).toEqual([-4,4]);
 });
 it('keeps the end stop on the girder end: its bolts clear the bearing stiffener as before',()=>{
  const id='end-stop-wrench-bearing',a=endStopChecks(demoFocus005()).find(v=>v.id===id)!,b=endStopChecks(centered(demoFocus005())).find(v=>v.id===id)!;
  expect(b.capacity).toBeCloseTo(a.capacity!,9);expect(b.status).toBe('pass');
 });
});

describe('E35 supporting column (existing W14X90): weak-axis moment, H1 and torsion at grids 1 and 6',()=>{
 it('drops My, H1 and H1 with torsion at the runway-end grids; grid 5 (crane stop at its locating seat) still governs',()=>{
  const p0=demoFocus005(),p1=centered(demoFocus005()),re=supportReactions(p0,sectionProperties(p0.section));
  const r0=existingColumnAnalysis(p0,re),r1=existingColumnAnalysis(p1,re),at=(r:typeof r0,j:number)=>r.bySupport[j];
  // Grid 1: My 69.1 → 60.7 kip-ft, H1 0.386 → 0.355, H1 with the warping stress 1.171 → 1.140.
  expect(at(r0,0).My!/kft).toBeCloseTo(69.13,1);expect(at(r1,0).My!/kft).toBeCloseTo(60.70,1);
  expect(at(r0,0).U).toBeCloseTo(.3859,3);expect(at(r1,0).U).toBeCloseTo(.3548,3);
  expect(at(r0,0).Ut!).toBeCloseTo(1.171,3);expect(at(r1,0).Ut!).toBeCloseTo(1.140,3);
  // Grid 6 (sliding end, no torsion): My 19.5 → 7.3 kip-ft, H1 0.290 → 0.259.
  expect(at(r0,5).My!/kft).toBeCloseTo(19.50,1);expect(at(r1,5).My!/kft).toBeCloseTo(7.31,1);
  // H1 at grid 6 with the crane at its stop: the end wheel stands at the stop face (no rail beyond it), 1 ft 6 in inside
  // the travel limit, so the reaction there is less (0.3005 and 0.2694 with the wheel at the travel limit).
  expect(at(r0,5).U).toBeCloseTo(.2897,3);expect(at(r1,5).U).toBeCloseTo(.2586,3);expect(at(r1,5).Ut).toBeUndefined();
  for(const j of [1,2,3,4])expect(at(r1,j)).toEqual(at(r0,j));
  expect(r1.support!.seat.map(v=>Math.round(v.moment/kft*100)/100)).toEqual([10.49,26.93,26.93,26.93,26.93,10.49]);
  // The governing values are at grid 5 (bumper force at the locating seat of bay 5, 27 in girder offset): unchanged.
  const c0=existingColumnChecks(p0,r0),c1=existingColumnChecks(p1,r1),u=(c:typeof c0,id:string)=>c.find(v=>v.id===id)!.utilization!;
  for(const id of ['column-flexure-y','column-interaction','column-torsion'])expect(u(c1,id)).toBeCloseTo(u(c0,id),9);
  expect(u(c1,'column-torsion')).toBeCloseTo(1.179,3);expect(r1.torsion!.station/inch/12).toBeCloseTo(100,6);
 });
});

describe('E35 haunch and bearing fit (one detailed load pass per option)',()=>{
 let d0:RunwayDetailResults,d1:RunwayDetailResults,a1:DesignAnalysis,p1:ProjectInput;
 const pass=(p:ProjectInput)=>{const props=sectionProperties(p.section),c=createDetailCollector(p,props,20),a=runwayDesignAnalysis(p,props,girderStrength(p,props),40,20,c.observe);return {a,r:c.finish()};};
 beforeAll(()=>{d0=pass(demoFocus005()).r;p1=centered(demoFocus005());const x=pass(p1);d1=x.r;a1=x.a;},600000);
 it('drops the haunch root stress and torque at grids 1 and 6 (22.4 → 12.4 ksi, 21.2 → 10.7 ksi); shared grids govern at 22.0 ksi',()=>{
  const g0=d0.taperedHaunch!.grids!,g1=d1.taperedHaunch!.grids!,at=(g:typeof g0,ft:number)=>g.find(v=>Math.abs(v.x/inch/12-ft)<1e-6)!;
  expect(at(g0,0).normal/ksi).toBeCloseTo(22.35,1);expect(at(g1,0).normal/ksi).toBeCloseTo(12.37,1);
  expect(at(g0,125).normal/ksi).toBeCloseTo(21.20,1);expect(at(g1,125).normal/ksi).toBeCloseTo(10.69,1);
  expect(at(g0,0).torque/kft).toBeCloseTo(30.17,1);expect(at(g1,0).torque/kft).toBeCloseTo(12.73,1);
  expect(at(g0,125).torque/kft).toBeCloseTo(28.43,1);expect(at(g1,125).torque/kft).toBeCloseTo(10.66,1);
  // The review's 20.7 ksi at the root (TR-13 combinations; 22.4 ksi with the ASCE 7 crane-as-live envelope) was the
  // runway-end grid; centered, the unbalanced shared grids (one bay loaded) govern.
  expect(before('haunch-combined').demand!/ksi).toBeCloseTo(20.7,1);expect(d0.taperedHaunch!.strength.normal.value/ksi).toBeCloseTo(22.35,1);
  expect(d1.taperedHaunch!.strength.normal.value/ksi).toBeCloseTo(22.0,1);
  for(const ft of [25,50,75,100])expect(at(g1,ft).normal).toBeCloseTo(at(g0,ft).normal,6);
 });
 it('fits the centered runway-end bearing on the 25 in haunch top flange with the 1/8 in setting tolerance',()=>{
  const c=endBearingChecks(p1,p1.details!.endBearing!,{analysis:a1,lateral:0}),end=c.find(v=>v.id==='end-bearing-seat-fit-end')!,shared=c.find(v=>v.id==='end-bearing-seat-fit')!;
  expect(end.status).toBe('pass');expect(end.demand!/inch).toBeCloseTo(6.125,9);expect(end.capacity!/inch).toBeCloseTo(12.5,9);
  // The shared grids are unchanged: 1/2 in gap + 12 in bearing + 1/8 in on a 12.5 in half flange needs a 25.25 in flange (item 31).
  expect(shared.demand!/inch).toBeCloseTo(12.625,9);expect(shared.status).toBe('fail');
  // Nut clearance to the haunch web and its fillets: 1.5 in → 2.0 in (innermost hole 2 in → 2.5 in from the web).
  const web=c.find(v=>v.id==='end-bearing-wrench-haunch-web')!;expect(web.status).toBe('pass');expect(web.capacity!/inch).toBeCloseTo(2,9);
 });
});

describe('E35 full calculation with the end-bay bearings centered (one run)',()=>{
 let s:CalculationSnapshot;
 beforeAll(()=>{s=calculate(centered(withColumnReviewData(demoFocus005())));},900000);
 it('runs, reports the option, checks the end fit and draws the centered bearings',()=>{
  const c=(id:string)=>s.checks.find(v=>v.id===id)!;
  expect(s.errors).toEqual([]);
  expect(c('end-bearing-seat-fit-end').status).toBe('pass');
  const g=s.detailResults!.taperedHaunch!.grids!,end=g.find(v=>v.x===0)!;
  expect(end.normal/ksi).toBeLessThan(12.5);expect(end.torque/kft).toBeLessThan(13);
  // The shared grids govern at 22.0 ksi, below the 22.4 ksi of the on-grid runway-end bearings (same envelope).
  expect(c('haunch-combined').demand!/ksi).toBeCloseTo(22.0,1);
  expect(c('column-interaction').status).toBe('pass');
  expect(reportHtml(s)).toMatch(/At the runway-end grids each end-bay girder runs [^.]* past the grid so that its bearing plate, stiffeners and reaction sit over the haunch web/);
  const svg=drawingSheetSet(s).map(v=>v.svg).join('');
  expect(svg).toContain('ONE BEARING CENTERED ON THE GRID (SUPPORT WEB)');
 },900000);
});
