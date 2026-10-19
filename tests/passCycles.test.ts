import {describe,expect,it} from 'vitest';
import {cyclesPerPass,rainflow} from '../src/engine/passCycles';
import {demonstrationProject} from '../src/engine/demonstration';
import type {ProjectInput} from '../src/engine/types';

// Two equal 30 ft spans; one crane with two wheels (wheelbase given), travelling the whole runway.
const span=9144,twoSpan=(system:'continuous'|'simple',wheelbase:number):ProjectInput=>{const p=demonstrationProject();
 return {...p,system,spans:[span,span],details:undefined,cranes:[{...p.cranes[0],wheels:[{...p.cranes[0].wheels[0],offset:0},{...p.cranes[0].wheels[1],offset:wheelbase}],travelStart:-wheelbase,travelEnd:2*span}]};};

describe('stress cycles per crane pass on continuous girders',()=>{
 it('counts a rainflow history (ASTM E1049), the residual as half cycles',()=>{
  const c=rainflow([0,-1,-.05,-1,0]);
  expect(c.reduce((n,v)=>n+v.count,0)).toBeCloseTo(2,9);
  expect(c.find(v=>v.count===1)!.range).toBeCloseTo(.95,9);
 });
 it('gives about two cycles per pass at the interior support and one at midspan',()=>{
  // Wheels 1 in apart: a point load. The support moment returns to zero as it crosses the support.
  const [end,mid,support]=cyclesPerPass(twoSpan('continuous',25.4),[0,span/2,span]);
  expect(end).toBe(1);expect(mid).toBeLessThan(1.1);
  expect(support).toBeGreaterThan(1.9);expect(support).toBeLessThanOrEqual(2.01);
 });
 it('counts a wheel group straddling the support as less than two cycles, and leaves simple spans at one',()=>{
  const straddle=cyclesPerPass(twoSpan('continuous',3810),[span])[0];
  expect(straddle).toBeGreaterThanOrEqual(1);expect(straddle).toBeLessThan(cyclesPerPass(twoSpan('continuous',25.4),[span])[0]);
  expect(cyclesPerPass(twoSpan('simple',25.4),[span/2,span])).toEqual([1,1]);
 });
});
