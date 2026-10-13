import {describe,expect,it} from 'vitest';
import {calculate,validateProject} from '../src/engine/calculate';
import {cappedDemonstrationProject,newColumnDemonstrationProject} from '../src/engine/demonstration';
import {categoryBPreheat,existingWeldingChecks,existingWeldingDemand,weldedAttachments} from '../src/engine/existingWelding';
import {existingColumnSection} from '../src/engine/existingColumn';
import {drawingSheetSet} from '../src/components/planSheet';
import {withSiUnits} from '../src/engine/units';

const inch=25.4;
describe('field welding to the existing column',()=>{
 it('takes the AWS D1.1 Category B preheat from the thickest part, in the table of the unit system',()=>{
  expect([.5,.75,1,1.5,2,2.5,3].map(t=>categoryBPreheat(t*inch))).toEqual([0,0,10,10,65,65,110]);
  expect([.75,1,2,3].map(t=>Math.round(categoryBPreheat(t*inch,'US')*9/5+32))).toEqual([32,50,150,225]);
  const p=cappedDemonstrationProject(),d=existingWeldingDemand(p,existingColumnSection(p).section.tf);
  // W14X90 receiver flange 0.71 in; twin-rib ribs 1 1/2 in, seat 2 in, column stiffeners 1 in, tie gusset 7/8 in: the seat governs.
  expect(weldedAttachments(p).map(v=>v.name).sort()).toEqual(['bracket rib','bracket seat plate','column stiffener','tie gusset']);
  expect(d.t).toBeCloseTo(2*inch,6);expect(d.thickest.name).toBe('bracket seat plate');
  expect(Math.round(d.need*9/5+32)).toBe(150);
 });
 it('passes the demonstration with its recorded steel, carbon equivalent, preheat and welding load',()=>{
  const s=calculate(cappedDemonstrationProject()),w=s.checks.filter(c=>c.id.startsWith('column-weld'));
  expect(w.map(c=>[c.id,c.status])).toEqual([['column-weld-base-metal','pass'],['column-weld-ce','pass'],['column-weld-preheat','pass'],['column-weld-load','pass']]);
  expect(w.every(c=>c.group==='Existing column'&&c.referenceIds.includes('existing-steel-welding'))).toBe(true);
  expect(w.find(c=>c.id==='column-weld-preheat')!.note).toContain('150 °F minimum');
  const cover=drawingSheetSet(s).find(v=>v.number==='S-00')!.svg.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  expect(cover).toContain('PREHEAT AND INTERPASS TEMPERATURE AT LEAST 150 °F');expect(cover).toContain('ASTM A572 GR. 50 (MILL CERTIFICATES)');expect(cover).toContain('AWS D1.1/D1.1M:2020 TABLE 5.8, CATEGORY B, MINIMUM 150 °F');
 },240000);
 it('reports missing data as unverified and a high carbon equivalent or low preheat as failing',()=>{
  const p=cappedDemonstrationProject(),tf=existingColumnSection(p).section.tf;
  delete p.existingColumn!.welding;
  // The carbon equivalent is information (no code limit for prequalified A572 Gr 50): never unverified or failing.
  expect(existingWeldingChecks(p,tf).map(c=>c.status)).toEqual(['unverified','pass','unverified','unverified']);
  p.existingColumn!.welding={basis:'chemical-analysis',grade:'Unknown 1960s structural steel',carbonEquivalent:.52,preheat:10,deadLoadOnly:true,source:'Lab report 22-118'};
  const c=existingWeldingChecks(p,tf);
  expect(c.find(v=>v.id==='column-weld-ce')!.status).toBe('pass');expect(c.find(v=>v.id==='column-weld-ce')!.note).toMatch(/above 0\.45/);expect(c.find(v=>v.id==='column-weld-preheat')!.status).toBe('fail');
  // SI: the °C table, 65 °C for the 2 in (51 mm) seat.
  const si=withSiUnits(p);si.existingColumn!.welding!.preheat=65;
  expect(existingWeldingChecks(si,tf).find(v=>v.id==='column-weld-preheat')!.status).toBe('pass');
  expect(validateProject(p)).toEqual([]);
 });
 it('adds nothing for new columns designed here',()=>{
  const p=newColumnDemonstrationProject();
  expect(existingWeldingChecks(p,25)).toEqual([]);
 });
});
