import {describe,expect,it} from 'vitest';
import {calculate} from '../../src/engine/calculate';
import {reportHtml} from '../../src/report/reportHtml';
import {buildTaxonomy} from '../../src/engine/checkTaxonomy';
import {summaryElements} from '../../src/report/designSummary';
import {demoFocus005RevB,revBChanges} from '../fixtures/demoFocus005RevB';
import {drawingSheetSet,detailReferences} from '../../src/components/planSheet';

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
  // The crane-level strut on the girder line, at least 10 times the column's own stiffness there, leaves the column 1/11
  // of the longitudinal force: checked as torsion and weak-axis bending.
  expect(check('column-torsion').status).toBe('pass');expect(check('column-torsion').note).toContain('1/11');
  // No rail rotation limit: the rotation is reported for information, not checked.
  expect(check('rail-twist').status).toBe('not-applicable');
 });
 it('omits the checks without data and lists them as not checked',()=>{
  const omitted=s.checks.filter(c=>c.status==='excluded'&&/Omitted from this package/.test(c.note)).map(c=>c.id).sort();
  expect(omitted).toEqual(['building-seismic-alteration','building-seismic-runway','column-drift-wind','column-frame','column-rail-gauge']);
  const h=reportHtml(s,undefined,''),p1=h.slice(0,h.indexOf('</section>'));
  expect(p1).not.toMatch(/REVIEW DRAFT|OPEN ITEMS? —/);expect(p1).toMatch(/Items by others and the forces delivered to them: section \d\.\d/);
  expect(h.slice(h.indexOf('Items by others and forces delivered</h2>'))).toMatch(/frame type and second-order effects/);
 });
 it('reads as a calculation: own section numbers, explained values, prose models',()=>{
  const h=reportHtml(s,undefined,''),t=h.replace(/<span class="katex-mathml">[\s\S]*?<\/span>/g,'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/\s+/g,' ');
  const num=(title:string)=>h.match(new RegExp(`<h2>(\\d\\.\\d+) ${title}</h2>`))![1];
  // Items by others point to the sections of this report (the existing column was "section 4.8" after the bracing went).
  const others=t.slice(t.indexOf(' Items by others and forces delivered '));
  expect(others).toContain(`existing column member is checked in section ${num('Existing column')} `);
  expect(others).toContain(`Unfactored reactions by load type: section ${num('Support reactions by load type')}.`);
  expect(h).not.toMatch(/@@ref:/);
  // The crane line, the statics notes and the scope state what their numbers are.
  expect(t).toMatch(/2 wheels per runway; per wheel 7\.5 kip maximum, 1 kip side thrust/);
  expect(t).toMatch(/This runway's 2 maximum static wheel loads sum to 15 kip, against at most W − 7\.4 kip = 15\.1 kip/);
  expect(t).toMatch(/give 22\.4 kip, 0\.1 kip from the crane weight W = 22\.5 kip/);
  expect(t).toMatch(/for Demo crane CR-5 \(5 US tons\)\. This calculation designs/);
  // A ratio just inside its limit does not print as equal to it.
  expect(t).toMatch(/singly symmetric proportioning .{0,80}? 0\.896 0\.90 OK/);
  // Component models in sentences; the beam model is described under "Vertical"; no software artefacts.
  expect(t).toMatch(/Component models\. The cap tieback is a DG7 top-flange tie connected directly to the column/);
  expect(t).not.toMatch(/Direct stiffness; equilibrium|appended to supplied PDF|catalog W \+ inverted|Channel ASTM/);
 });
 it('drawings say each thing once, use what they list and agree with one another',()=>{
  const sheets=drawingSheetSet(s),t=(n:string)=>[...sheets.find(v=>v.number===n)!.svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(m=>m[1].replace(/<[^>]+>/g,'').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&')).join(' ');
  // The cover with the sheet continuing its notes (S-00A); the detail sheets by the details they draw (as many sheets as
  // the details fit at the 3/32 in lettering): the connections, cap channel, supports and brackets, then the cap tiebacks.
  const refs=detailReferences(sheets),on=(view:string)=>sheets.find(v=>v.svg.includes(`data-view="${view}"`))!.number;
  const s0=sheets.filter(v=>v.number.startsWith('S-00')).map(v=>t(v.number)).join(' '),s1=t('S-01'),s2=[...new Set([on('bracket-connection'),on('cap-section'),on('support-notes')])].map(t).join(' '),s3=t(on('cap-angle-section'));
  const all=sheets.map(v=>t(v.number)).join(' '),ref=(title:string)=>refs.get(title)!.replace('/','\\/'),tieback=ref('CAP TIEBACK ANGLE / SECTION AT SUPPORT');
  expect(all).not.toMatch(/NOT IN SET|\{\{/);
  // Abbreviations: only those the set uses.
  const abbr=s0.slice(s0.indexOf('ABBREVIATIONS'),s0.indexOf('ISSUE',s0.indexOf('ABBREVIATIONS')));
  expect(abbr).toMatch(/CJP COMPLETE JOINT PENETRATION/);expect(abbr).toMatch(/O\.C\. ON CENTER/);
  expect(abbr).not.toMatch(/\(E\) EXISTING|\(N\) NEW|SSL|LSL|FW FIELD WELD/);
  // S-00 states each requirement once: one crane rail row, no steel note repeating the materials table, rail joints
  // and survey once, no concrete key without concrete, no remark in the rail name, no wrong sleeved-bolt sentence.
  expect(s0.match(/CRANE RAIL ASTM/g)?.length).toBe(1);expect(s0).not.toMatch(/IDEALIZED PLATE GEOMETRY|STEEL: W GIRDER|CONCRETE AND SOILS|COLUMN-END TIE BOLTS/);
  expect(s0.match(/RAIL JOINTS: TIGHT JOINTS/g)?.length).toBe(1);expect(s0.match(/SURVEY BOTH RAILS/g)?.length).toBe(1);
  expect(s0).not.toMatch(new RegExp(`CAP TIEBACK ANGLES \\(${tieback}\\): FIELD-DRILL`));// the tieback installation is on its sheet
  expect(s1).not.toMatch(/0'-0 1\/8"|SET RAIL C\/L SPACING/);// rail setting is S-00's note
  // The lateral restraint is named as detailed, and the cap's holes are listed where the tieback drills them.
  expect(s2).toMatch(new RegExp(`CAP TIEBACK ANGLES \\(${tieback}\\) TRANSFER LATERAL FORCE`));expect(s2).not.toMatch(/FLANGE TIES/);
  expect(s2).toMatch(new RegExp(`UNPERFORATED EXCEPT THE END STOP BOLT HOLES \\(${ref('END STOP / PLAN')}\\) AND THE CAP TIEBACK BOLT HOLES`));
  expect(s3).not.toMatch(/NO OTHER HOLES, CUTS OR WELDS IN THE CAP/);expect(s3).toMatch(/ONE LEG LEVEL WITH TOP OF CAP/);
  expect(s2).not.toMatch(/PLATES AS THE BRACKET PLATES|FLANGE \+ 1\/16"\)|STD\. HOLES/);
  // The sleeve is cut to a 1/16 in length: the 0.645 in flange plus at least 1/16 in, the same on both details.
  expect(s2).toMatch(/STEEL SLEEVES 1 7\/16" OD X 3\/4"/);expect(s2).toMatch(/X 3\/4" \(FLANGE \+ 1\/16" MIN\.\)/);
  // Reference dimensions (section depth, rail over steel) read in parentheses; the S-00 legend explains them.
  expect(s2).toMatch(/\(1'-1 7\/8"\)/);// T.O.R. 119'-9 5/8" - T.O.S. 119'-2 7/8": the rail over steel is the difference of the printed elevations.
  expect(s2).toMatch(/\(6 3\/4"\)/);expect(s0).toMatch(/REFERENCE DIMENSION/);
 },120000);
});

