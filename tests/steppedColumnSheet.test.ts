import {describe,it,expect} from 'vitest';
import {sheetFixture} from './fixtures/sheets/sheetFixtures';
import {drawingSheetSet,detailTopics} from '../src/components/planSheet';
import {steppedColumnTitles} from '../src/components/steppedColumnSheet';
import {detailTitles} from '../src/components/sheetGraphics';
import {calculate} from '../src/engine/calculate';
import {buildProject} from '../src/engine/configurator';
import {defaultRunwayConfig,type RunwayConfig} from '../src/engine/configInputs';
import {compactReport} from '../src/report/compactReport';

/**
 * Drawings and report of the girder on the step of an existing stepped column (support 'stepped-column'): the stepped
 * column details, the stepped profile on S-01, the cover's schedule and survey items, no bracket drawn or named where
 * there is none. Readability (clashes, lettering, border) is tests/sheetReadability.test.ts on the same fixtures.
 */
const texts=(svg:string)=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&')).join(' ');

describe('stepped column drawings',()=>{
 for(const [name,stiffened] of [['t15',true],['t16',false]] as const)it(`${name}: the stepped column details, S-01 and S-00 show the step, and no bracket that does not exist`,()=>{
  const s=sheetFixture(name);
  // t15's W40X199 lower web carries the inner flange unstiffened; the stiffener drawings are shown with a pair added.
  if(stiffened&&!s.input.existingColumn!.step!.stiffener)s.input.existingColumn!.step!.stiffener={thickness:.625*25.4,width:7.25*25.4,weld:.3125*25.4};
  const topics=detailTopics(s),topic=topics.find(t=>t.key==='stepped-column');
  // Both templates take the force out on a girder-line strut designed here: its detail at a column (craneLevelStrut.ts).
  expect(topic?.views.map(v=>v.title)).toEqual([steppedColumnTitles.elevation,steppedColumnTitles.section,...(stiffened?[steppedColumnTitles.stiffener]:[]),steppedColumnTitles.strut]);
  expect(topics.flatMap(t=>t.views.map(v=>v.title))).not.toContain(detailTitles.bearing);
  const sheets=drawingSheetSet(s),all=sheets.map(v=>v.svg).join(''),words=texts(all);
  expect(all).not.toContain('NOT IN SET');
  for(const view of ['stepped-column-elevation','step-section',...(stiffened?['step-stiffener']:[]),'crane-level-strut'])expect(all,view).toContain(`data-view="${view}"`);
  expect(all).not.toContain('data-view="bracket-connection"');
  expect(words).not.toMatch(/COLUMN BRACKET|BRACKET SEAT|BRACKET DESIGN|BRACKET'S|BY THE BRACKET DESIGNER|SPREADER BELOW/);
  // S-01: the stepped profile on the section, the lower shaft and step cap on the plan and below the girder elevation.
  const s01=sheets.find(v=>v.number==='S-01')!.svg;
  expect(texts(s01)).toContain('(E) STEPPED COLUMN (REF.): UPPER');expect(texts(s01)).toContain('GIRDER ON THE (E) STEP CAP');
  expect(s01).toContain('data-stepped-column="plan"');expect(s01).toContain('data-stepped-column="elevation"');
  expect(texts(s01)).toContain(`${s.input.existingColumn!.step!.strut!.shape} CRANE-LEVEL STRUT (NEW) ON`);expect(texts(s01)).not.toContain('CRANE-LEVEL STRUT BY OTHERS');
  // S-00: the schedule, the survey items of the step and the shafts, the forces delivered to the stepped columns.
  const s00=texts(sheets.filter(v=>v.number.startsWith('S-00')).map(v=>v.svg).join(''));
  for(const t of ['STEPPED COLUMN SCHEDULE','EXISTING STEP:','SURVEY AT EVERY STEPPED COLUMN','FORCES DELIVERED TO THE STEPPED BUILDING COLUMNS'])expect(s00,t).toContain(t);
  expect(s00).toContain(stiffened?'STEP STIFFENERS (NEW)':'NONE REQUIRED');
  if(stiffened)expect(s00).toContain('INCLUDING THE STEP STIFFENER WELDS');
  // The stepped column sheet: the girder forces on the step and its design data.
  for(const t of ['GIRDER FORCES ON THE STEP','STEPPED COLUMN DESIGN DATA','EFFECTIVE LENGTHS L_C (BUCKLING)','(E) STEP CAP PL'])expect(words,t).toContain(t);
 });
});

describe('stepped column report',()=>{
 it('reports the model and buckling, H1 of each shaft with its governing case, and the step local checks worked',()=>{
  const cfg:RunwayConfig={...defaultRunwayConfig,title:'Stepped B',capacity:10,control:'cab',cmaa:'C',bays:3,span:25,girder:'capped',structure:'existing',support:'stepped-column',tie:'cap-angle',railElevation:26,craneSpan:60};
  const s=calculate(buildProject(cfg)),html=compactReport(s,'');
  const at=(t:string)=>html.indexOf(t),model=at('Stepped column, model and effective lengths</h2>'),shafts=at('Stepped column, upper and lower shafts (H1)</h2>'),step=at('Stepped column, step local checks</h2>');
  expect(model).toBeGreaterThan(0);expect(shafts).toBeGreaterThan(model);expect(step).toBeGreaterThan(shafts);
  expect(at('Existing column</h2>')).toBe(-1);expect(html).not.toContain('@@ref');
  const m=html.slice(model,shafts),h=html.slice(shafts,step),st=html.slice(step,html.indexOf('</section>',step));
  expect(m).toContain('Stepped column: girder on the step');expect(m).toContain('λ<sub>cr</sub>');expect(m).toContain('L_{c,u}');expect(m).toContain('L_{c,l}');
  expect(h).toContain('Upper shaft');expect(h).toContain('Lower shaft');expect(h).toContain('Conditional result');
  // H1 of both shafts worked with the governing row's numbers.
  expect(h.match(/Worked: (Upper|Lower) shaft, combined axial and flexure/g)?.length??0).toBeGreaterThanOrEqual(1);
  expect(h).toContain('\\frac{P_r}{');
  // The step: the inner-flange force and a J10 or cap check worked.
  expect(st).toContain('F_{in}');expect(st).toMatch(/F_yt_w\(2\.5k\+l_b\)|l\\,t_\{cap\}\^2/);
 },600000);
});
