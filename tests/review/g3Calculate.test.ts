import {describe,expect,it} from 'vitest';
import {calculate} from '../../src/engine/calculate';
import {presentCheck} from '../../src/engine/checkPresentation';
import {demoFocus005,demoFocus005Before} from '../fixtures/demoFocus005';

// One full calculation of DEMO-FOCUS-005 shared by every assertion (review group G3: capped girder).
const snapshot=calculate(demoFocus005());
const check=(id:string)=>{const c=snapshot.checks.find(v=>v.id===id);if(!c)throw Error(`missing ${id}`);return c;};
const before=(id:string)=>demoFocus005Before().checks.find(c=>c.id===id)!;

describe('DEMO-FOCUS-005 girder after the G3 review fixes',()=>{
 it('C17: the cap end check is the cumulative weld development (0.97 -> 0.06); the full-force rule is gated',{timeout:900000},()=>{
  expect(snapshot.errors).toEqual([]);
  const c=check('cap-development');
  expect(before('cap-development').utilization).toBeCloseTo(.9705,4);
  expect(c.title).toBe('Cap end · cumulative weld force development');expect(c.utilization!).toBeCloseTo(.0697,3);expect(c.status).toBe('pass');
  const full=check('cap-development-full-force');expect(full.status).toBe('not-applicable');expect(full.note).toMatch(/full length/);
 });
 it('C18: rail rotation is checked against the owner criterion entered in the fixture, citing the criteria only',()=>{
  const c=check('rail-twist');
  expect(c.title).toBe('Rail rotation · owner criterion');expect(c.capacity).toBe(.005);// 0.9805 before; 0.9807 after G4's beveled-washer grip lowers the cap-angle restraint stiffness;
  // 0.9761 with the top restraint at the cap tie line, 1.66 in above the shear center instead of 0.44 in (peer review M6).
  expect(c.utilization!).toBeCloseTo(.9761,4);
  expect(c.referenceIds).toEqual(['criteria']);expect(before('rail-twist').refs).toContain('vlasov');
 });
 it('C23: case 16 web compactness for positive moment and F4 flexure',()=>{
  const w=check('compact-web');expect(w.demand!).toBeCloseTo(27.70,2);expect(w.capacity!).toBeCloseTo(137.27,2);
  expect(check('major').utilization!).toBeCloseTo(.1436,3);expect(check('major').note).toContain('F4');
 });
 it('D25: Iyc/Iy prints as 0.807 against 0.9',()=>{
  const c=check('cap-proportion');expect(c.demand!).toBeCloseTo(.8070,4);expect(c.capacity).toBe(.9);
 });
 it('B24: TR-13 effective web length with the cap, 2(rail depth + tf + tw,cap); one web yielding check (peer review m10)',()=>{
  const c=check('wheel-yield'),p=demoFocus005(),le=2*(p.aist!.railDepth+p.section.tf+p.section.capTw);
  expect(c.capacity!).toBeCloseTo(p.section.Fy*p.section.tw*le,3);expect(c.status).toBe('pass');
  expect(snapshot.checks.some(v=>v.id==='wheel-web-tr13')).toBe(false);
 });
 it('D26: fatigue equations print the US constants, without converted artifacts',()=>{
  for(const c of snapshot.checks.filter(v=>v.group==='Fatigue'||/fatigue/.test(v.id))){
   const us=presentCheck(c,'US');expect(us.equation).not.toMatch(/1000\.76|100\.07|7\.977|MPa|6900/);
  }
  // The cap weld is a wheel-local detail: one cycle per wheel group per crane passage (two end trucks), round 5.
  expect(check('cap-weld-fatigue').capacity!/6.894757293168361).toBeCloseTo(Math.max(8,100*(1.5/(2*demoFocus005().fatigue.cycles))**.167),8);
 });
 it('E36 basis: girder D/Cs after C17 / C18 (flexure, H1, shear, deflection)',()=>{
  // Round 2 group A (M6): the top restraint at the cap tie line lowered H1 to 0.2524 / 0.2512. Round 3: the ASCE 7
  // crane-as-live combinations and the restraint play (secant restraint stiffness in the load-height M_cx) raise it to 0.332 / 0.345.
  // Peer review M2 / m11: H1 at each flange with the load-height M_cx (0.1754 at the more stressed flange with the Cb = 1 M_cx).
  // The detailed search stops at 80 travel steps once the governing D/Cs change by less than 1% (the per-quantity gate
  // went on to 1280 steps for fatigue ranges at D/C 0.005): 0.3321 / 0.3452 there, 0.3316 / 0.3447 at 1280 steps.
  // Round 3 engine: the load-height M_cr enters F4 at its equivalent length (no Cb < 1 on the inelastic strength), so
  // M_cx rises and H1 falls to 0.1991 at both flanges. Round 5: H1 takes each flange's sign; the bottom flange is in tension
  // under the positive moment, so it takes F4.4 tension-flange yielding (R_pt M_yt) instead of the LTB strength: 0.1751.
  expect(check('major').utilization!).toBeLessThan(.16);expect(check('combined').utilization!).toBeCloseTo(.1991,3);expect(check('combined-bottom').utilization!).toBeCloseTo(.1751,3);
  expect(check('shear').utilization!).toBeCloseTo(.0966,3);// Vertical deflection against L/1000: G1 (A3) puts the fixture in AIST Class B (L/600 gave 0.1355).
  expect(check('vertical').utilization!).toBeCloseTo(.1355*1000/600,3);
 });
});
