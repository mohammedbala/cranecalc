import {describe,expect,it} from 'vitest';
import {calculate} from '../src/engine/calculate';
import {exampleProject} from '../src/engine/defaults';

const foot=304.8;
describe('deflection limits per bay',()=>{
 it('checks each bay against its own span instead of the shortest one',()=>{
  const p=structuredClone(exampleProject);p.spans=[30*foot,15*foot];
  const s=calculate(p),v=s.checks.find(c=>c.id==='vertical')!;
  // The long bay governs against L/n of the long bay, not of the 15 ft bay.
  expect(v.note).toContain('Governing bay 1');
  expect(v.capacity).toBeCloseTo(30*foot/p.verticalLimit,6);
  const shortLimit=15*foot/p.verticalLimit;
  expect(v.demand!/shortLimit).toBeGreaterThan(v.utilization!);
 },120000);
});
