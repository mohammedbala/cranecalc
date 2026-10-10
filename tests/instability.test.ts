import {describe,expect,it} from 'vitest';
import {calculate} from '../src/engine/calculate';
import {demonstrationProject} from '../src/engine/demonstration';

describe('girder that buckles below the applied load',()=>{
 it('reports a failed stability check instead of stopping the analysis',()=>{
  // Eight times the demonstration crane on the same W24X229 bays.
  const p=demonstrationProject();
  for(const c of p.cranes){for(const w of c.wheels){w.loaded*=8;w.unloaded*=8;w.lateral*=8;}if(c.design){c.design.ratedLoad*=8;c.design.trolleyWeight*=8;c.design.bridgeWeight*=8;c.design.drivenWheelLoad*=8;}}
  const s=calculate(p);
  expect(s.errors).toEqual([]);expect(s.eligible).toBe(false);
  const stability=s.checks.find(c=>c.id==='torsion-stability')!;
  expect(stability.status).toBe('fail');expect(stability.capacity!).toBeLessThan(1);
  expect(s.detailResults!.unstableCases).toBeGreaterThan(0);expect(stability.note).toContain('buckle below the applied load');
 },300000);
});
