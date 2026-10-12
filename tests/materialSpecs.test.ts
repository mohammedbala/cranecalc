import {describe,expect,it} from 'vitest';
import {astmSpec} from '../src/engine/materialSpecs';
import {compactReport} from '../src/report/compactReport';
import {coverSheetSvg} from '../src/components/coverSheet';
import {demoFocus005Snapshot} from './fixtures/demoFocus005';

const ksi=6.894757293168,text=(h:string)=>h.replace(/<[^>]+>/g,' ').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/\s+/g,' ');
describe('ASTM designations on every material listing',()=>{
 it('infers the designation from the product form and strengths, or takes the entered grade',()=>{
  expect(astmSpec('w-shape',50*ksi,65*ksi)).toBe('ASTM A992');
  expect(astmSpec('plate',50*ksi,65*ksi)).toBe('ASTM A572 Gr. 50');
  expect(astmSpec('plate',36*ksi,58*ksi)).toBe('ASTM A36');
  expect(astmSpec('rod',36*ksi,58*ksi)).toBe('ASTM A36');
  expect(astmSpec('rail',60*ksi,90*ksi)).toBe('ASTM A759');
  expect(astmSpec('w-shape',50*ksi,65*ksi,'ASTM A572 Grade 50 per mill certificates')).toBe('ASTM A572 Grade 50 per mill certificates');
 });
 it('lists a specification for every row of the report materials table and the S-00 materials table',()=>{
  const s=demoFocus005Snapshot(),h=compactReport(s,'');
  const t=h.slice(h.indexOf('<h3>Materials</h3>'),h.indexOf('<h3>Geometry and girder data</h3>'));
  const rows=[...t.matchAll(/<tr>(.*?)<\/tr>/g)].map(m=>text(m[1])).filter(r=>!/Element Specification/.test(r));
  expect(rows.length).toBeGreaterThanOrEqual(9);
  for(const r of rows)expect(r,r).toMatch(/ASTM|AWS A5/);
  expect(text(t)).toMatch(/W24X104 \+ C15X50 ASTM A992/);expect(text(t)).toMatch(/Crane rail .* ASTM A759/);expect(text(t)).toMatch(/Bracing rods \(existing\) ASTM A36/);
  const svg=coverSheetSvg(s,[]),i=svg.indexOf('>MATERIALS<'),j=svg.indexOf('MATERIAL NOTES');
  const cells=text(svg.slice(i,j));
  for(const item of ['RUNWAY GIRDER','CAP CHANNEL','PLATES, BARS, ANGLES, TIES','CRANE RAIL','BOLTS','COLUMN BRACKETS','COLUMN STIFFENERS'])expect(cells).toContain(item);
  expect(cells).toMatch(/RUNWAY GIRDER ASTM A992/);expect(cells).toMatch(/CRANE RAIL ASTM A759/);expect(cells).toMatch(/TAPERED I HAUNCH PLATES, ASTM A572 GR\. 50/);
 });
});
