import {describe,expect,it} from 'vitest';
import {compactReport} from '../src/report/compactReport';
import {notationSection} from '../src/report/notation';
import {fatigueSnPlot} from '../src/report/taxonomyReport';
import {buildTaxonomy} from '../src/engine/checkTaxonomy';
import {summaryElements} from '../src/report/designSummary';
import {demoFocus005Snapshot} from './fixtures/demoFocus005';

const s=demoFocus005Snapshot(),h=compactReport(s,'');
describe('notation and fatigue summary plot',()=>{
 it('lists the principal symbols used in the equations, and only those',()=>{
  expect(h).toMatch(/\/ Notation<\/h2>/);
  // Brief: crane-girder symbols only; standard AISC symbols (phi, F_y, E) are not listed.
  const n=notationSection(['\\phi R_n\\ge R_u','F_y','F_{SR}=1000(C_f/n)^{1/3}']);
  expect(n).toMatch(/Constant from Table A-3.1/);expect(n).not.toMatch(/Resistance factor|yield stress/);
  const all=notationSection(s.checks.map(c=>c.equation??'')),rows=(all.match(/<tr><td>/g)??[]).length;
  expect(rows).toBeGreaterThan(10);expect(rows).toBeLessThanOrEqual(30);
  expect(all).not.toMatch(/F_yA_g|n_i\/N_i/);
 });
 it('plots every evaluated fatigue detail against its design curve, numbered as in the table',()=>{
  const t=buildTaxonomy(s,summaryElements(s.input)),svg=fatigueSnPlot(t,'US');
  expect(svg).toMatch(/<figure class="calculation-figure fatigue-sn">/);
  expect((svg.match(/<polyline /g)??[]).length).toBe(t.fatigue.evaluated.length);
  expect(svg).toMatch(/N = 400,000/);expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  const colours=[...svg.matchAll(/#([0-9a-f]{3,6})\b/gi)].map(m=>m[1].toLowerCase()).filter(c=>!['000','fff','000000','ffffff'].includes(c));
  expect(colours).toEqual([]);
  expect(h.indexOf('<figure class="calculation-figure fatigue-sn"')).toBeGreaterThan(h.indexOf('<table class="checks fatigue-table"'));
 });
});
