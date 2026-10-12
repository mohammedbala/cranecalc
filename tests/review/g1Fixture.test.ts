import {describe,expect,it} from 'vitest';
import {writeFileSync} from 'node:fs';
import {demoFocus005,demoFocus005Before} from '../fixtures/demoFocus005';
import {withColumnReviewData} from '../fixtures/columnReviewData';
import {calculate} from '../../src/engine/calculate';
import {reportHtml} from '../../src/report/reportHtml';
import {interfaceCsv} from '../../src/engine/detailExports';

// One full calculation of DEMO-FOCUS-005 for this file.
// G2's supporting-column records (frame, wind drift, seismic) supplied so the G1 items are tested on an exportable package.
const s=calculate(withColumnReviewData(demoFocus005()));
const byId=(id:string)=>s.checks.find(c=>c.id===id);
if(process.env.G1_DUMP)writeFileSync(process.env.G1_DUMP,JSON.stringify(s.checks.map(c=>({id:c.id,group:c.group,title:c.title,status:c.status,demand:c.demand,capacity:c.capacity,utilization:c.utilization})),null,1));

describe('DEMO-FOCUS-005 · G1 crane input, loads, end stops, fatigue duty',()=>{
 it('calculates and stays exportable with the open items shown as failed checks',()=>{
  expect(s.errors).toEqual([]);expect(s.eligible).toBe(true);
  for(const id of ['crane-1-statics-runway','crane-1-statics-lifted','crane-1-data','crane-1-bumper-selection','building-class','fatigue-cycles'])expect(byId(id)?.status,id).toBe('fail');
  expect(s.warnings.some(w=>w.startsWith('CRANE INPUT'))).toBe(true);
  const html=reportHtml(s);
  expect(html).toContain('Maximum load on one runway');expect(html).toContain('Bumper selection');
  expect(html).not.toContain('Direct to building-mounted stop; girder bypass');expect(html).toContain('Girder-mounted end stops at');
 },900000);
 it('applies the Class B consequences: vertical deflection L/1000',()=>{
  const before=demoFocus005Before().checks.find(c=>c.id==='vertical')!,after=byId('vertical')!;
  expect(before.capacity).toBeCloseTo(12.7,6);expect(after.capacity).toBeCloseTo(7.62,6);expect(after.demand).toBeCloseTo(before.demand!,6);
  expect(after.note).toContain('AIST class B');
 });
 it('exports the bumper force on the girder-mounted stop',()=>{
  const csv=interfaceCsv(s);expect(csv).toContain('girder-mounted stop');expect(csv).not.toContain('girder bypass');
 });
 it('leaves the other checks unchanged',()=>{
  // G1: vertical (L/1000), building-class. G2 (column review): column-*, brace-drift, cap-angle-column-holes (F13.1 as a
  // modifier). G3 (girder review): web class and F4 flexure, TR-13 wheel bearing length, cap development and cap welds,
  // US fatigue constants (relative changes under 0.1 % are within the tolerance below; R_FIL in inches moves two more).
  // G4 (connections): CE as information, the by-others load path, beveled-washer cap bolts, fit tolerances, tight rail
  // joints. detail-equilibrium (a solver residual) moves with G2's appended TR-13 rows.
  const changed=new Set(['vertical','building-class','column-axial','column-flexure','column-interaction','column-drift','brace-drift','cap-angle-column-holes',
   'compact-web','major','combined','flexure-load-height','wheel-yield','wheel-cripple','cap-development','cap-weld-strength','cap-weld-metal','cap-weld-rupture','cap-weld-fatigue','haunch-colstiff-fatigue-plate','rail-keeper-root',
   'column-weld-ce','bracket-load-path','cap-angle-channel-flange','cap-angle-nut-seat','cap-angle-nut-fit','cap-angle-endplate-edge','end-bearing-seat-fit',
   'rail-joint-bearing','rail-joint-plate','rail-joint-block','rail-expansion-gap','rail-joint-slot','rail-end-gap','rail-joint-fatigue','detail-equilibrium',
   // Layout on the 1/4 in drawing grid: column stiffeners cut to it (12.58 → 12 1/2 in) at their levels to the nearest 1/4 in, the end stop base plate
   // lip in front of the face (9/16 → 3/4 in) and the keeper end fillets stopped 1/2 in (the 5/16 in weld size, up to the grid)
   // short of the rail-side face, so the keeper welds and the flange under them carry a little more.
   'haunch-colstiff-length','haunch-colstiff-web-shear','end-stop-bolt-tension','end-stop-slip','end-stop-base-prying','end-stop-flange-prying','end-stop-stiffener-fit','end-stop-web',
   'rail-keeper-weld','rail-keeper-fatigue','rail-flange-local']),keeperDetail=/^detail-(fatigue|full-cycle)-RC\d+-(left|right)$/,
   // Peer review round 2, group A: one force system at the haunch flanges, carried by the column stiffeners (C2, the
   // unstiffened J10 checks for information); the top restraint at the cap tie line and the tie force derived (M6).
   roundA=/^(haunch-column-(flange|yield-top|yield-bottom|crippling|sidesway|panel)|haunch-colstiff-.+|brace-member|cap-angle-.+|end-bearing-.+|stiffener-(combined-weld|fatigue|lateral-flexure|weld-fatigue)|rail-head|rail-twist|torsion-(normal|shear|stability)|detail-equilibrium)$/;
  for(const b of demoFocus005Before().checks){if(changed.has(b.id)||keeperDetail.test(b.id)||roundA.test(b.id))continue;const a=byId(b.id);expect(a,b.id).toBeDefined();expect(a!.status,b.id).toBe(b.status);if(b.utilization!==undefined)expect(Math.abs(a!.utilization!-b.utilization),b.id).toBeLessThanOrEqual(1e-3*Math.max(1,b.utilization));}
 });
});
