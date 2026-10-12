import {describe,expect,it} from 'vitest';
import {calculate} from '../../src/engine/calculate';
import {reportHtml} from '../../src/report/reportHtml';
import {buildTaxonomy} from '../../src/engine/checkTaxonomy';
import {summaryElements} from '../../src/report/designSummary';
import {demoFocus005RevB,revBChanges} from '../fixtures/demoFocus005RevB';

/**
 * DEMO-FOCUS-005 revision B: every open item of the reviewed project is resolved by the revised inputs and the
 * section E changes, and the checks without data are omitted (listed as not checked, by others). One calculate.
 * E36: without the (removed) rail rotation limit the girder is W14X61 + C15X50, governed by vertical deflection L/1000.
 */
const p=demoFocus005RevB(),s=calculate(p),check=(id:string)=>s.checks.find(c=>c.id===id)!;
describe('DEMO-FOCUS-005 rev B',()=>{
 it('records every input change',()=>{expect(revBChanges.length).toBeGreaterThanOrEqual(7);});
 it('has no open items and is eligible for issue',()=>{
  expect(s.errors).toEqual([]);expect(s.eligible).toBe(true);
  expect(s.checks.filter(c=>['fail','unverified','incomplete','unsupported'].includes(c.status)).map(c=>c.id)).toEqual([]);
  expect(buildTaxonomy(s,summaryElements(s.input)).openItems).toEqual([]);
 });
 it('resolves the review failures by the revised inputs',()=>{
  for(const id of ['building-class','fatigue-cycles','crane-1-statics-runway','crane-1-statics-lifted','crane-1-statics-total','crane-1-bumper-decel','crane-1-bumper-energy','crane-1-bumper-stop','construction-notes','end-bearing-seat-fit','cap-angle-endplate-edge'])expect(check(id)?.status,id).toBe('pass');
  expect(s.checks.some(c=>c.id==='crane-1-data'||c.id==='crane-1-bumper-selection'),'supplier data complete').toBe(false);
  expect(s.checks.some(c=>c.id==='column-torsion'&&c.status!=='not-applicable'&&(c.utilization??0)>0)).toBe(false);
  // No rail rotation limit: the rotation is reported for information, not checked.
  expect(check('rail-twist').status).toBe('not-applicable');
 });
 it('omits the checks without data and lists them as not checked',()=>{
  const omitted=s.checks.filter(c=>c.status==='excluded'&&/Omitted from this package/.test(c.note)).map(c=>c.id).sort();
  expect(omitted).toEqual(['building-seismic-alteration','building-seismic-runway','column-drift-wind','column-frame','column-rail-gauge']);
  const h=reportHtml(s,undefined,''),p1=h.slice(0,h.indexOf('</section>'));
  expect(p1).not.toMatch(/REVIEW DRAFT|OPEN ITEMS? —/);expect(p1).toMatch(/Not checked in this package/);
  expect(p1).toMatch(/frame type and second-order effects/);
 });
});
