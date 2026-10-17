import {describe,it,expect} from 'vitest';
import {templateProject} from '../src/engine/templates';
import {buildProject} from '../src/engine/configurator';
import {defaultRunwayConfig,type RunwayConfig} from '../src/engine/configInputs';
import {validateProject} from '../src/engine/calculate';
import {capSizingSet,columnCapSizingRatios,sizeColumnCap} from '../src/engine/columnCapSizing';
import {columnCapGeometry} from '../src/engine/columnCap';
import {supportReactions} from '../src/engine/supportReactions';
import {sectionProperties} from '../src/engine/section';
import {railTopAboveSteel} from '../src/engine/railSeat';
import {boltCapacity} from '../src/engine/connectionStrength';

const inch=25.4;
/** A 25-ton CMAA D crane in a Class B building on new columns with column caps (W36X247 girders, W14X211 columns). */
const heavy:RunwayConfig={...defaultRunwayConfig,capacity:25,craneSpan:70,control:'cab',cmaa:'D',buildingClass:'B',bays:4,span:30,structure:'new',support:'column-cap',railElevation:28};

describe('column cap sizing',()=>{
 it('puts each support reaction on each bearing alone with the side thrust as fork forces in equilibrium',()=>{
  const p=templateProject('t07'),set=capSizingSet(p),g=columnCapGeometry(p),r=supportReactions(p,sectionProperties(p.section)),s=r.supports[1],H=1.6*s.Css;
  const at=set.strength.filter(v=>v.x===s.x&&v.f.combination==='sizing strength');
  expect(at).toHaveLength(2*g.grids[1].bearings.length);
  for(const v of at){
   expect(v.f.vertical).toBeCloseTo(1.2*s.D+1.6*(s.Cd+s.Cv+s.Ci),6);expect(v.f.ends).toHaveLength(1);
   // The fork forces add up to the side thrust; their moment about the cap top is that of the side thrust through the
   // shear center plus the torque about it amplified for second-order twist, B = 1/(1 - 1/lambda) >= 1 (LRFD).
   expect(Math.abs(v.f.top+v.f.bottom)).toBeCloseTo(H,6);
   const h=p.details!.bearing.thickness+p.section.d+railTopAboveSteel(p),{amplification:B,shearCenter:sc,lambda}=set.fork!;
   expect(B).toBeCloseTo(1/(1-1/lambda),9);expect(B).toBeGreaterThan(1);
   expect(Math.abs(v.f.top*g.arms.top+v.f.bottom*g.arms.bottom)).toBeCloseTo(H*(sc+B*(h-sc)),3);
  }
  expect(set.ctx.imperfection).toBeGreaterThan(0);expect(set.ctx.required).toBeGreaterThan(0);
 });
 it('leaves the t07 cap (5-ton pendant crane) as it is: every ratio within the target',()=>{
  const p=templateProject('t07'),r=columnCapSizingRatios(p);
  expect(Object.entries(r).filter(([,v])=>v>.9)).toEqual([]);
  expect(sizeColumnCap(p).columnCap).toEqual(p.columnCap);expect(validateProject(p)).toEqual([]);
 },120000);
 it('sizes a 25-ton cap: bolts whose fork tension leaves slip resistance, fillets and nut clearance within the target',()=>{
  const p=buildProject(heavy),e=p.details!.endBearing!,r=columnCapSizingRatios(p);
  expect(validateProject(p)).toEqual([]);
  // With the configured 3/4 in A325 bolts the fork couple's tension exceeded 1.13 T_b: k_sc = 0, no slip capacity.
  const before=boltCapacity({grade:'A325',diameter:.75*inch,planes:1,surface:'B',shear:1,tension:1.2*1.13*28*4448.2216152605,method:'LRFD'});expect(before.slip).toBe(0);
  expect(e.bolts.diameter).toBeGreaterThan(.75*inch);
  for(const k of ['bolt-slip','bolt-tension','weld','wrench-web','plate','prying'])expect(r[k],k).toBeLessThanOrEqual(.9);
  // Left to the checks: the all-around cap fillets in fatigue (Category F under the alternating girder-end reactions
  // along the runway, beyond what 5/8 in fillets carry).
  expect(r['weld-fatigue']).toBeGreaterThan(1);expect(p.columnCap!.weld).toBeCloseTo(5/8*inch,9);
 },120000);
});
