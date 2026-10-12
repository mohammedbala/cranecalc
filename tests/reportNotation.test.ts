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
  const n=notationSection(['\\phi R_n\\ge R_u','F_y','F_{SR}=1000(C_f/n_{SR})^{0.333}','C_{ss}=\\max(s,0.5)\\,\\max[0.1(Q+T+B),\\,0.2(Q+T)]']);
  expect(n).toMatch(/Side thrust on one runway/);expect(n).not.toMatch(/Resistance factor|yield stress|Constant from Table A-3.1|Allowable stress range/);
  const all=notationSection(s.checks.map(c=>c.equation??'')),rows=(all.match(/<tr><td>/g)??[]).length;
  expect(rows).toBeGreaterThan(5);expect(rows).toBeLessThanOrEqual(30);
  expect(all).not.toMatch(/F_yA_g|n_i\/N_i/);
 });
 it('plots every evaluated fatigue detail against its design curve, numbered as in the table',()=>{
  const t=buildTaxonomy(s,summaryElements(s.input)),svg=fatigueSnPlot(t,'US');
  expect(svg).toMatch(/<figure class="calculation-figure fatigue-sn">/);
  // One curve per distinct design curve (details of one category and F_SR share it), each labelled with its details.
  const curves=(svg.match(/<polyline /g)??[]).length;expect(curves).toBeGreaterThan(0);expect(curves).toBeLessThanOrEqual(t.fatigue.evaluated.length);
  expect(svg).toMatch(/SR<\/tspan><tspan dy="-1\.5"> = 400,000/);expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  const colours=[...svg.matchAll(/#([0-9a-f]{3,6})\b/gi)].map(m=>m[1].toLowerCase()).filter(c=>!['000','fff','000000','ffffff'].includes(c));
  expect(colours).toEqual([]);
  expect(h.indexOf('<figure class="calculation-figure fatigue-sn"')).toBeGreaterThan(h.indexOf('<table class="checks fatigue-table"'));
 });
});
