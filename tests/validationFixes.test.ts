import {describe,it,expect} from 'vitest';
import {Beam} from '../src/engine/beam';
import {dcText} from '../src/engine/checkPresentation';

describe('validation fixes',()=>{
 it('merges floating-point sliver nodes so unequal continuous spans keep a sound mesh',()=>{
  // 19'-6", 20'-6", 20'-6", 19'-6" with 40 elements per span: grid 3, summed in floating point, lands 9e-13 mm
  // from a subdivision point and used to leave a sliver element there.
  const spans=[19.5,20.5,20.5,19.5].map(v=>v*12*25.4),supports=[0];for(const v of spans)supports.push(supports.at(-1)!+v);
  const L=spans.reduce((a,v)=>a+v,0),b=new Beam(0,L,200000*5e8,supports,160);
  const lengths=b.nodes.slice(1).map((v,i)=>v-b.nodes[i]);
  expect(Math.min(...lengths)).toBeGreaterThan(100);
  for(const s of supports)expect(b.nodes).toContain(s);
  const r=b.evaluate([{x:L/3,p:100000}]);
  expect(r.reactions.reduce((a,v)=>a+v.r,0)).toBeCloseTo(100000,6);expect(r.equilibriumError).toBeLessThan(1e-9);
 });
 it('prints NO CAPACITY instead of a sentinel ratio',()=>{
  expect(dcText(1e12,3)).toBe('NO CAPACITY');expect(dcText(Infinity,5,'—')).toBe('NO CAPACITY');
  expect(dcText(.81234,3)).toBe('0.812');expect(dcText(undefined,3)).toBe('-');expect(dcText(Number.NaN,5,'—')).toBe('—');
 });
});
