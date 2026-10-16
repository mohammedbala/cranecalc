import {describe,expect,it} from 'vitest';
import {templateProject} from '../src/engine/templates';
import {supportReactions} from '../src/engine/supportReactions';
import {sectionProperties} from '../src/engine/section';
import {craneLevelStrut,existingColumnAnalysis,existingColumnChecks,existingColumnSection} from '../src/engine/existingColumn';
import {longitudinalBracingAnalysis,longitudinalBracingChecks} from '../src/engine/longitudinalBracing';
import {sheetFixture} from './fixtures/sheets/sheetFixtures';
import {drawingSheetSet} from '../src/components/planSheet';

const inch=25.4,kip=4448.2216152605;
const texts=(svg:string)=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1].replace(/&gt;/g,'>').replace(/&amp;/g,'&')).join(' ');

/**
 * The crane-level strut the existing-column check relies on is specified, not assumed silently: an excluded (by
 * others) check with its location, the factored forces at the locating grids and, on the girder line, the stiffness
 * 10 k_c, listed on S-00 and drawn on S-01 with the existing braced bay.
 */
describe('crane-level strut by others',()=>{
 const p=templateProject('t01'),R=supportReactions(p,sectionProperties(p.section)),r=existingColumnAnalysis(p,R),checks=existingColumnChecks(p,r);
 it('t01 takes the force out on the girder line, where the centerline strut leaves the column failing torsion',()=>{
  expect(p.existingColumn!.longitudinalExit).toBe('girder-strut');
  expect(checks.find(c=>c.id==='column-torsion')!.status).toBe('pass');
  const s=craneLevelStrut(p,r)!,z=r.support!;
  expect(s.location).toBe('girder-line');expect(s.offset).toBeCloseTo(z.offset,9);
  expect(s.stiffness).toBeCloseTo(10*z.strut!.kc,6);
  expect(s.traction).toBeCloseTo(1.6*z.traction,6);expect(s.stop).toBeCloseTo(z.bumper,6);expect(s.force).toBeCloseTo(Math.max(s.traction,s.stop),9);
  const c=checks.find(v=>v.id==='crane-level-strut')!;
  expect(c.status).toBe('excluded');expect(c.title).toMatch(/girder line/);expect(c.title).toMatch(/k ≥/);expect(c.title).toMatch(/F = /);
 });
 it('specifies no strut where the eave strut takes the force',()=>{
  const q=structuredClone(p);q.existingColumn!.longitudinalExit='eave-strut';
  const e=existingColumnAnalysis(q,R);expect(craneLevelStrut(q,e)).toBeUndefined();
  expect(existingColumnChecks(q,e).some(c=>c.id==='crane-level-strut')).toBe(false);
 });
 it('gives a failing existing brace the rod it needs, to reinforce or replace',()=>{
  const q=structuredClone(p);q.longitudinalBracing!.rod.diameter=.5*inch;q.cranes[0].design!.bumperForce=40*kip;
  const lb=longitudinalBracingChecks(q,longitudinalBracingAnalysis(q,supportReactions(q,sectionProperties(q.section)),existingColumnSection(q).section));
  const t=lb.find(c=>c.id==='brace-tension')!;
  expect(t.status).toBe('fail');expect(t.note).toMatch(/REINFORCE OR REPLACE \(engineer of record\): a rod of at least \d/);
 });
 it('draws the strut and the existing braced bay on S-01',()=>{
  const s=sheetFixture('t01'),plan=drawingSheetSet(s).find(v=>v.number==='S-01')!;
  expect(plan.svg).toContain('data-strut-by-others="plan"');
  expect(texts(plan.svg)).toMatch(/CRANE-LEVEL STRUT BY OTHERS/);expect(texts(plan.svg)).toMatch(/\(EOR\)/);
 });
});
