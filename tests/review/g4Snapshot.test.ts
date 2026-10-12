import {beforeAll,describe,expect,it} from 'vitest';
import {calculate} from '../../src/engine/calculate';
import {reportHtml} from '../../src/report/reportHtml';
import {demoFocus005,demoFocus005Before} from '../fixtures/demoFocus005';
import {withColumnReviewData} from '../fixtures/columnReviewData';
import type {CalculationSnapshot} from '../../src/engine/types';

// One full calculation of DEMO-FOCUS-005 for the whole file (about 5–8 minutes).
let s:CalculationSnapshot,html:string;
const inch=25.4,before=new Map(demoFocus005Before().checks.map(c=>[c.id,c]));
const check=(id:string)=>{const c=s.checks.find(v=>v.id===id);if(!c)throw Error(`missing ${id}`);return c;};
// Column review records (G2) keep the package eligible so the issued report renders.
beforeAll(()=>{s=calculate(withColumnReviewData(demoFocus005()));html=reportHtml(s);},900000);

describe('G4 on the full DEMO-FOCUS-005 calculation',()=>{
 it('A1: coordination checks in their own group; no spurious redesign flag',()=>{
  expect(before.has('coord-cap-tie-stiffener')).toBe(false);
  const c=check('coord-cap-tie-stiffener');expect(c.group).toBe('Coordination');expect(c.status).toBe('pass');expect(c.capacity!/inch).toBeCloseTo(.933,2);
  expect(s.warnings.some(w=>/do not fabricate/i.test(w))).toBe(false);
  expect(html).not.toMatch(/CONNECTION LAYOUT REQUIRES REDESIGN/);expect(html).toMatch(/Cap bolts: 2 - /);
 });
 it('B14/B15/D28/D29/D32: open item for the contradicting entered notes; generated requirements in the report and on S-00',()=>{
  const n=check('construction-notes');expect(n.status).toBe('fail');expect(n.note).toMatch(/snug-tight in sliding slots/);expect(n.note).toMatch(/demonstration tolerances/);
  expect(check('rail-joint-tight').status).toBe('pass');expect(check('rail-expansion-gap').status).toBe('not-applicable');expect(check('rail-joint-slot').status).toBe('not-applicable');
  expect(before.get('rail-expansion-gap')!.status).toBe('pass');
  const end=check('rail-end-gap');expect(end.demand!/inch).toBeCloseTo(.388,2);expect(before.get('rail-end-gap')!.demand!/inch).toBeCloseTo(.209,2);
  expect(html).toMatch(/Runway clearance test before the load test \(AIST TR-13 §1\.5\.6\.2\)/);expect(html).toMatch(/AWS D1\.1\/D1\.1M:2020 Table 5\.8, Category B, minimum 50 °F/);
  expect(html).toMatch(/100% UT of all CJP groove welds/);expect(html).toMatch(/RUNWAY CLEARANCE TEST/);expect(html).not.toMatch(/D1\.1M 2015:/);
 });
 it('C22: carbon equivalent is information, not a D/C',()=>{
  const c=check('column-weld-ce');expect(before.get('column-weld-ce')!.utilization).toBeCloseTo(.9333,3);expect(c.utilization).toBeUndefined();expect(c.status).toBe('pass');
 });
 it('D31: fit checks include the setting and fit-up tolerances',()=>{
  const seat=check('end-bearing-seat-fit');expect(before.get('end-bearing-seat-fit')!.demand!/inch).toBeCloseTo(12.5,6);
  expect(seat.demand!/inch).toBeCloseTo(12.625,6);expect(seat.capacity!/inch).toBeCloseTo(12.5,6);expect(seat.status).toBe('fail');
  const edge=check('cap-angle-endplate-edge');expect(before.get('cap-angle-endplate-edge')!.demand!/inch).toBeCloseTo(.875,6);
  expect(edge.demand!/inch).toBeCloseTo(.9375,6);expect(edge.capacity!/inch).toBeCloseTo(.875,6);expect(edge.status).toBe('fail');
 });
 it('D34: the bracket and tie load path is checked; only the frame beyond the column remains by others',()=>{
  const c=check('bracket-load-path');expect(before.get('bracket-load-path')!.status).toBe('excluded');expect(c.status).toBe('pass');expect(c.note).toMatch(/checked under Cap tieback/);
 });
 it('beveled washer: cap bolt checks use the 1:6 beveled washer and the flange thickness at the bolt line',()=>{
  const seat=check('cap-angle-nut-seat');expect(before.get('cap-angle-nut-seat')!.demand!/inch).toBeCloseTo(1.44+1.375/2,3);expect(seat.demand!/inch).toBeCloseTo(1.44+(1.5*.625+.125)/Math.sqrt(3),4);
  expect(check('cap-angle-nut-fit').demand!/inch).toBeCloseTo(5/16+.609375+.25,4);
  expect(check('cap-angle-channel-flange').capacity!).toBeLessThan(before.get('cap-angle-channel-flange')!.capacity!);
  // 0.9807, then 0.9761 with the top restraint at the cap tie line (peer review M6).
  expect(check('rail-twist').utilization!).toBeCloseTo(.9761,3);
 });
 it('D30: no snug-tight allowance in the report',()=>{expect(html).not.toMatch(/permitted only for cranes of 5 tons/);expect(html).toMatch(/Snug-tight bolts are not permitted/);});
});
