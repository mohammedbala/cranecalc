import {describe,expect,it} from 'vitest';
import {calculate,validateProject} from '../src/engine/calculate';
import {exampleProject} from '../src/engine/defaults';
import {demonstrationProject} from '../src/engine/demonstration';
import {startDetailedDesign,packageContentChecks,toBeEntered} from '../src/engine/detailTemplate';
import {issueStatus} from '../src/engine/drawingData';
import {drawingSheetSet} from '../src/components/planSheet';
import {loadAiscSection} from '../src/data/aiscSections';

const foot=304.8;
/** A project started blank, then completed with the engineer's own data. */
function completedProject(){
 const demo=demonstrationProject(),base=structuredClone(demo);
 delete base.details;delete base.existingColumn;delete base.longitudinalBracing;
 Object.assign(base,{reportPurpose:'project',title:'Plant 3 · Bay C crane runway',number:'P3-C-01',notes:'Replacement runway girders on existing columns.',criteriaSource:'Owner criteria: AIST Class C, L/600 vertical, L/400 lateral.'});
 base.cranes[0]={...base.cranes[0],name:'CR-1 · 10 US tons',loadSource:'Supplier wheel load schedule WL-2026-114',operatingClass:'CMAA C; AIST Class C building',design:{...base.cranes[0].design!,distributionSource:'Supplier: half of crane side thrust to each runway'}};
 base.fatigue={...base.fatigue,detail:'Plain rolled bottom flange; welded attachments in the detail register.'};
 // With every cycle at rated lift, the template's conservative spectrum, the engineer selects a W24X250: the
 // W24X229 of the demonstration sits at the twist and saddle fatigue limits without its duty bins.
 base.section=loadAiscSection(base.section,'W24X250');
 base.drawing={originator:'J. Doe',checker:'',datumElevation:100*foot,datumLabel:'Finished floor',railElevation:20*foot};
 const p=startDetailedDesign(base);
 Object.assign(p.details!.rail,{...demo.details!.rail,name:'ASCE 60 lb rail per supplier',padSource:'Pad supplier rating sheet PR-10'});
 p.details!.endStop!.source='Supplier bumper data WL-2026-114';p.details!.criteria.railGauge=demo.details!.criteria.railGauge;
 p.aist={...demo.aist!,netFlangeArea:p.section.bf*p.section.tf,fatigueReference:'AISC Table A-3.1; detail register in package',cycleSource:'Owner duty: 1,000,000 wheel-induced stress fluctuations'};
 return p;
}

describe('starting a detailed design from a project',()=>{
 it('adds valid neutral inputs that still need the engineer',()=>{
  const p=startDetailedDesign(structuredClone(exampleProject));
  expect(validateProject(p)).toEqual([]);
  expect(p.details!.reviewed).toBe(false);expect(p.details!.rail.name.startsWith(toBeEntered)).toBe(true);
  expect(p.details!.fatigueDetails.map(f=>f.id)).toEqual(['FB1','FS1','FS2','FT1']);
  expect(p.details!.spectrum).toEqual([{name:'All cycles at rated lift',liftFraction:1,cycles:p.fatigue.cycles}]);
  expect(Math.abs(p.railEccentricity)).toBeGreaterThanOrEqual(p.details!.criteria.alignmentTolerance);
  const gates=packageContentChecks(p).map(c=>[c.id,c.status]);
  expect(gates).toEqual([['detail-placeholders','incomplete'],['detail-review','unverified']]);
  expect(JSON.stringify(p.details)).not.toMatch(/fictitious|fictional|demonstration/i);
 });
 it('reaches an issuable package once the engineer completes and reviews it',()=>{
  const p=completedProject();expect(calculate(p).eligible).toBe(false);
  p.details!.reviewed=true;
  const s=calculate(p);
  expect(s.errors).toEqual([]);expect(s.eligible).toBe(true);expect(s.checks.filter(c=>c.status==='fail').map(c=>c.id)).toEqual([]);
  expect(issueStatus(s).label).toBe('PRELIMINARY - NOT FOR CONSTRUCTION');
  s.input.drawing!.eor={name:'A. Engineer',firm:'Firm',license:'12345',jurisdiction:'CA'};s.input.drawing!.issue='permit';
  expect(issueStatus(s).reasons).toEqual(['Enter the building code adopted by the jurisdiction','Reference the engineer of record\'s evaluation of the structure not checked by this calculation']);
  s.input.drawing!.code={building:'2022 California Building Code',editions:'2016',reviewed:false};
  // Existing structure this calculation leaves unchecked must have the engineer's evaluation referenced.
  expect(issueStatus(s).reasons).toEqual(['Reference the engineer of record\'s evaluation of the structure not checked by this calculation']);
  s.input.drawing!.existingEvaluation='Existing structure evaluation, report 24-117';
  expect(issueStatus(s).label).toBe('ISSUED FOR PERMIT');
  for(const sheet of drawingSheetSet(s))expect(sheet.svg).not.toMatch(/FICTITIOUS|DEMONSTRATION|\{\{|NOT IN SET/);
 },480000);
 it('keeps demonstration wording out of a project package',()=>{
  const p=demonstrationProject();p.reportPurpose='project';
  const gate=packageContentChecks(p).find(c=>c.id==='project-content')!;
  expect(gate.status).toBe('incomplete');expect(gate.note).toContain('Notes');expect(gate.note).toContain('Crane 1 load source');
  expect(packageContentChecks(demonstrationProject()).some(c=>c.id==='project-content')).toBe(false);
 });
});
