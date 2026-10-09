import {beforeAll,describe,it,expect} from 'vitest';
import {calculate} from '../src/engine/calculate';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {interfaceCsv,supportReactionsCsv} from '../src/engine/detailExports';
import {reportHtml} from '../server/report';
import type {CalculationSnapshot} from '../src/engine/types';

let s:CalculationSnapshot;
beforeAll(()=>{s=calculate(cappedDemonstrationProject());},120000);
// RFC 4180 quoted fields with doubled quotes.
const rows=(csv:string)=>csv.split('\r\n').map(line=>{const out:string[]=[];let i=0;while(i<line.length){let v='';i++;while(i<line.length){if(line[i]==='"'){if(line[i+1]==='"'){v+='"';i+=2;continue;}i++;break;}v+=line[i++];}out.push(v);i++;}return out;});
describe('existing building outputs',()=>{
 it('checks the existing column at every support and reports the governing one',()=>{
  expect(s.eligible).toBe(true);
  const r=s.existingColumn!;
  expect(r.bySupport.map(v=>v.x)).toEqual(s.supportReactions!.supports.map(v=>v.x));
  expect(r.governing.U.U).toBe(Math.max(...r.bySupport.map(v=>v.U)));
  // Interior supports carry two girder ends of dead load.
  expect(r.station).toBeGreaterThan(0);expect(r.station).toBeLessThan(s.supportReactions!.supports.at(-1)!.x);
  expect(s.checks.filter(c=>c.status==='excluded').map(c=>c.id).sort()).toEqual(['bracket-load-path','column-longitudinal','supporting-structure']);
 });
 it('prints unfactored reactions and the column check, and labels the factored interface forces',()=>{
  const html=reportHtml(s);
  expect(html).toContain('06A / Existing building: support reactions by load type');
  expect(html).toContain('06B / Existing column check');
  expect(html).toContain('Factored AIST runway combinations');
  expect(html).toContain('Fictitious demonstration: original building calculation sheets');
 });
 it('exports support reactions by load type in project units',()=>{
  const table=rows(supportReactionsCsv(s));
  expect(table[0]).toContain('D_kip');expect(table[0]).toContain('station_in');
  expect(table).toHaveLength(s.supportReactions!.supports.length+1);
  const interior=table[2],kip=4448.221615;
  expect(Number(interior[2])).toBeCloseTo(s.supportReactions!.supports[1].D/kip,9);
 });
 it('converts girder-end stations in the interface CSV to inches',()=>{
  const total=s.input.spans.reduce((a,b)=>a+b,0)/25.4;
  const ends=rows(interfaceCsv(s)).slice(1).flatMap(r=>r[12]?JSON.parse(r[12]) as {x:number}[]:[]);
  expect(ends.length).toBeGreaterThan(0);
  expect(Math.max(...ends.map(v=>v.x))).toBeLessThanOrEqual(total+1e-6);
 });
});
