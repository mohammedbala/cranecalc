import {describe,expect,it} from 'vitest';
import {writeFileSync} from 'node:fs';
import {demoFocus005,demoFocus005Before} from '../fixtures/demoFocus005';
import {calculate} from '../../src/engine/calculate';
import {reportHtml} from '../../src/report/reportHtml';
import {interfaceCsv} from '../../src/engine/detailExports';

// One full calculation of DEMO-FOCUS-005 for this file.
const s=calculate(demoFocus005());
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
  const changed=new Set(['vertical','building-class']);
  for(const b of demoFocus005Before().checks){if(changed.has(b.id))continue;const a=byId(b.id);expect(a,b.id).toBeDefined();expect(a!.status,b.id).toBe(b.status);if(b.utilization!==undefined)expect(a!.utilization,b.id).toBeCloseTo(b.utilization,9);}
 });
});
