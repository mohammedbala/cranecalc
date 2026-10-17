import {beforeAll,describe,expect,it} from 'vitest';
import {runwayTemplates,templateProject} from '../src/engine/templates';
import {calculate} from '../src/engine/calculate';
import {drawingSheetSet} from '../src/components/planSheet';
import {reportHtml} from '../server/report';
import type {CalculationSnapshot} from '../src/engine/types';

/**
 * A supplied-load analysis (template t12) designs nothing: its drawings say so, carry no construction notes or empty
 * placeholder sheets, and give the support reactions, lateral restraint and rail the analysis assumed; its report lists
 * only the references its checks cite.
 */
let s:CalculationSnapshot;
const words=(svg:string)=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1]).join(' ');
beforeAll(()=>{s=calculate(templateProject(runwayTemplates.find(t=>t.config.scope==='analysis')!.id));});
describe('analysis-only package',()=>{
 it('issues the cover and the general arrangement only, stamped analysis only',()=>{
  const sheets=drawingSheetSet(s);
  expect(sheets.map(v=>v.number)).toEqual(['S-00','S-01']);
  for(const v of sheets){const t=words(v.svg);expect(t).toContain('ANALYSIS ONLY - NOT FOR CONSTRUCTION');expect(t).not.toMatch(/SEE S-02|: S-02|NOT IN SET/);}
 });
 it('states the analysis basis and the interface requirements instead of construction notes',()=>{
  const t=words(drawingSheetSet(s)[0].svg);
  for(const absent of ['FURNISH AND INSTALL','SPECIAL INSPECTIONS','LOAD COMBINATIONS','SUBMITTALS','DESIGN METHOD','FIELD WELD'])expect(t).not.toContain(absent);
  for(const present of ['SUPPORT REACTIONS · UNFACTORED, SUPPLIED LOADS, PER SUPPORT','RESTRAIN THE TOP FLANGE LATERALLY AT EACH SUPPORT','CRANE RAIL · BY OTHERS, AS ANALYZED','LB/FT','TOP FLANGE ALONE'])expect(t).toContain(present);
 });
 it('prints only the references its checks cite, without internal provenance',()=>{
  const html=reportHtml(s);
  expect(html).toContain('ANALYSIS ONLY · NOT A DESIGN');
  expect(html).not.toMatch(/not evaluated in this report|SOURCE_REGISTER|DEMO-FOCUS|Great Falls|metadata/);
  expect(html).toContain('Support reactions by load type');
 });
});
