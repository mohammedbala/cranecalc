import {describe,expect,it} from 'vitest';
import {calculate,validateProject} from '../../src/engine/calculate';
import {demoFocus005,demoFocus005Snapshot} from '../fixtures/demoFocus005';
import {withColumnReviewData} from '../fixtures/columnReviewData';
import {buildTaxonomy,classifyCheck,gateCheck} from '../../src/engine/checkTaxonomy';
import {summaryElements} from '../../src/report/designSummary';

/**
 * Gates re-run on every calculation (TAXONOMY.md item 9): DEMO-FOCUS-005 with the crane wheel loads raised 25% until a
 * screened fatigue detail (haunch stiffener fillet throats, 7.29 ksi < F_TH 8 ksi) passes its threshold; it must
 * re-enter the fatigue table. One full calculate() for this file. Also: every check of a fresh calculation is
 * classified by the explicit table (new checks from other branches included), none by the default rule.
 */
// The column review records (frame, drift, seismic) keep the snapshot eligible; they do not affect the haunch.
const scale=1.25,p=withColumnReviewData(demoFocus005());
for(const c of p.cranes)c.wheels=c.wheels.map(w=>({...w,loaded:w.loaded*scale,unloaded:w.unloaded*scale,lateral:w.lateral*scale}));
const s=calculate(p);

describe('fatigue gates from current results',()=>{
 it('validates and calculates the heavier crane',()=>{expect(validateProject(p)).toEqual([]);expect(s.eligible).toBe(true);});
 it('brings a screened detail back into the fatigue table when its range exceeds F_TH',()=>{
  const base=demoFocus005Snapshot(),id='haunch-fatigue-stiffener-weld';
  expect(gateCheck(base,base.checks.find(c=>c.id===id)!).gate).toBe('screened');
  const c=s.checks.find(v=>v.id===id)!;
  expect(c.demand!/6.894757293168).toBeGreaterThan(8);
  expect(gateCheck(s,c).gate).toBe('evaluated');
  const t=buildTaxonomy(s,summaryElements(s.input));
  expect(t.fatigue.evaluated.some(r=>r.members.some(m=>m.id===id))).toBe(true);
  // Screened in the stored calculation, evaluated now. (The row counts are not compared: with the restraint model at the
  // tie line the heavier crane's register ranges move, and the rail keeper rows of the stored calculation are screened.)
  expect(buildTaxonomy(base,summaryElements(base.input)).fatigue.evaluated.some(r=>r.members.some(m=>m.id===id))).toBe(false);
 });
 it('classifies every check of a fresh calculation by the explicit table',()=>{
  expect(s.checks.filter(c=>classifyCheck(c).rule==='default').map(c=>c.id)).toEqual([]);
 });
});
