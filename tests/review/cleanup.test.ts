import {beforeAll,describe,expect,it} from 'vitest';
import {calculate} from '../../src/engine/calculate';
import {reportHtml} from '../../src/report/reportHtml';
import {drawingSheetSet,drawingSetHtml} from '../../src/components/planSheet';
import {buildTaxonomy} from '../../src/engine/checkTaxonomy';
import {summaryElements} from '../../src/report/designSummary';
import {checksCsv} from '../../src/report/taxonomyReport';
import {filletMinimum} from '../../src/engine/connectionStrength';
import {caseName} from '../../src/engine/caseNames';
import {fixed2,num,sig3} from '../../src/report/reportParts';
import type {CalculationSnapshot} from '../../src/engine/types';
import {demoFocus005RevB,revBChanges} from '../fixtures/demoFocus005RevB';
import {reportText} from '../fixtures/reportText';

/**
 * Presentation clean-up of the DEMO-FOCUS-005 Rev B calculation after the peer review (C3, M11, P1–P5, m1–m9, m13):
 * the printed report and drawings read as an engineer's calculation of this design. One calculate of Rev B.
 */
const inch=25.4;
let s:CalculationSnapshot,html='',text='',body='',sheets:string[]=[],appendix='';
beforeAll(()=>{
 s=calculate(demoFocus005RevB());
 html=reportHtml(s,undefined,'');
 text=reportText(html);
 // The revision log may name the superseded design (Rev A); everything else describes Rev B.
 body=reportText(html.replace(/<ul class="changes">[\s\S]*?<\/ul>/g,''));
 sheets=drawingSheetSet(s).map(v=>v.svg);
 appendix=html.slice(html.indexOf('<table class="appendix-a">'),html.indexOf('</table>',html.indexOf('<table class="appendix-a">')));
},900000);

describe('narrative generated from the design (C3, M11)',()=>{
 it('states the scope from the actual girder, support and parts',()=>{
  const scope=body.slice(body.indexOf('Scope:'),body.indexOf('Basis:'));
  expect(scope).toContain('W14X61 + C15X50 capped runway girders');
  expect(scope).toMatch(/tapered I haunches welded to the existing columns/);
  expect(scope).toMatch(/cap tieback angles/);
  expect(body).not.toContain('W24X104');
  expect(text).toContain('W24X104');// only in the revision log (the Rev B girder change)
 });
 it('prints no text from other designs, software validation or templates',()=>{
  for(const banned of ['rail rotation D/C 0.98','rail rotation by','Lue/Ellifritt','twelve reference','twelve-case','spreader','double-cover','rectangular-rib','existing I-brackets','saddle','hardware scan','verification evidence'])
   expect(body,banned).not.toContain(banned);
 });
 it('prints no UI prompts, software instructions or note keys',()=>{
  for(const banned of ['Enter channel','set the project fatigue method','alternative scenarios must not be added','refinement gates','exporting does not make','railAlignment:','bolting:','Project notes','..'])
   expect(body,banned).not.toContain(banned);
  expect(body).not.toMatch(/Fictitious full-bearing fit-up:/);
  expect(body).toContain('Cap fit-up Straighten and fit cap before continuous welding');
 });
});

describe('engineering names, not software ids (P1)',()=>{
 it('names cases by combination and crane position',()=>{
  expect(body).not.toMatch(/\b[DS]-\d{3,}/);
  expect(body).toMatch(/LRFD 2c, crane at (grid \d|\d+'-\d+" past grid \d)/);
  const id=s.checks.find(c=>c.caseId?.startsWith('D-'))!.caseId!;
  expect(caseName(s,id)).toMatch(/^LRFD [\w-]+, crane/);
 });
 it('prints no check ids, internal section ids or software provenance',()=>{
  expect(body).not.toMatch(/detail-fatigue-|end-bearing-locating-slip|CW\d+-(left|right)\b|RC\d+-(left|right)\b/);
  for(const banned of ['section 05A','CALCULATION 05A','page 04B','C33','CraneCalc method','JSON','Source register','Created 20'])
   expect(body,banned).not.toContain(banned);
  expect(body).not.toMatch(/\b3D\b/);
  expect(sheets.join('')).not.toContain('CALCULATION 05A');
 });
});

describe('Appendix A, repetition and page flow (P2)',()=>{
 it('groups repeated register points, keeping every result in the CSV',()=>{
  const rows=(appendix.match(/<tr class=/g)??[]).length;
  expect(rows).toBeLessThan(s.checks.length/2);
  // Round 2 fatigue (M7): the register Miner rows report f_sr,eq/F_SR; the rail clip base weld points up to 0.23 (the
  // girder range at Category D, without the former keeper local range: was 0.49).
  expect(appendix).toMatch(/136 locations; D\/C 0\.\d\d to 0\.23<small>governs at Rail clip base weld/);
  const ids=[...appendix.matchAll(/data-check="([^"]*)"(?: data-members="([^"]*)")?/g)].flatMap(m=>m[2]?m[2].split(' '):[m[1]]);
  expect(new Set(ids)).toEqual(new Set(s.checks.map(c=>c.id)));
  expect(reportText(appendix)).not.toMatch(/× 10⁻|e-\d/);
 });
 it('prints the bolting basis and the re-tightening once',()=>{
  // The not-checked list on page 1 and in its section belongs to the responsibility-matrix work, not this clean-up.
  expect(body).not.toMatch(/J1\.10 list was removed/);
  const calc=body.slice(0,body.indexOf('Appendix B References'));// the register quotes the TR-13 clause
  expect(calc.match(/30 and 90 days/g)).toHaveLength(1);
 });
 it('starts parts without forced page breaks and keeps headings with what follows',()=>{
  expect(html).not.toMatch(/\.page\.part-start[^{]*\{break-before:page/);
  expect(html).toMatch(/h2,h3,\.part\{break-after:avoid\}/);
 });
});

describe('units, rounding and sizes (P3)',()=>{
 it('prints ordinary values in decimal notation with at most two decimals above 0.1',()=>{
  expect(num(0.0383)).toBe('0.038');expect(num(2.02e-17)).toBe('0');expect(num(10397.74)).toBe('10,398');expect(num(688.73)).toBe('689');
  expect(num(272.26)).toBe('272');expect(num(9.525/inch)).toBe('0.38');expect(num(15.875/inch)).toBe('0.63');
  expect(sig3(25.4*0.0329961,'length','US')).toBe('0.033 in');
  expect(body).not.toContain('× 10⁻');
  for(const v of ['272.26','10,397.74','688.73','237.62','1,031.62','109.78','111.37','26.97'])expect(body,v).not.toContain(v);
 });
 it('prints plate, bolt and weld sizes as fractions',()=>{
  expect(fixed2(9.525,'length','US')).toBe('3/8 in');expect(fixed2(15.875,'length','US')).toBe('5/8 in');expect(fixed2(7.9375,'length','US')).toBe('5/16 in');
  for(const v of ['0.37 in','0.63 in','0.31 in'])expect(body,v).not.toContain(v);
  expect(body).toContain('A 3/8 in × 4 1/4 in tie plate');
  expect(body).toMatch(/Lap bolts[,·] edge distances[^O]*\d\/\d+ in/);
 });
 it('writes engineering subscripts and temperatures in the project units',()=>{
  expect(body).not.toMatch(/\b[A-Z]_[A-Za-z]/);
  expect(body).toContain('54 °F swing');
  expect(body).not.toMatch(/\d C swing/);
 });
});

describe('figures (P4)',()=>{
 it('numbers the load path without gaps, the same in the figure, the caption and the table',()=>{
  const at=html.indexOf('<div class="summary-head">'),fig=html.slice(html.indexOf('<svg',at),html.indexOf('</svg>',at));
  const marks=[...fig.matchAll(/font-weight="700" fill="#000">(\d+)<\/text>/g)].map(m=>Number(m[1])).sort((a,b)=>a-b);
  expect(marks).toEqual([1,2,3,4,5,6,7]);
  const caption=reportText(html.slice(html.indexOf('<p class="figure-note">'),html.indexOf('</p>',html.indexOf('<p class="figure-note">'))));
  expect(caption).toMatch(/1 rail; 2 girder; 3 bearing; 4 tapered haunch with column stiffeners; 5 existing column; 6 cap tieback; 7 longitudinal force F to the crane-level strut/);
  expect(caption).toMatch(/8 end stops \(runway ends, not shown\)/);
  const table=html.slice(html.indexOf('<table class="summary-checks">'),html.indexOf('</table>',html.indexOf('<table class="summary-checks">')));
  const badges=[...table.matchAll(/class="step"[^>]*>(\d+)</g)].map(m=>Number(m[1]));
  expect(badges).toEqual([1,2,3,4,5,6,7,8]);
 });
 it('follows the rail input (no pad) and labels sketches by their content',()=>{
  expect(body).toContain('Rail base bears on the cap channel');
  expect(body).not.toContain('pad and flange');
  expect(body).not.toContain('Pad rating');
  expect(body).toContain('Sliding end: bolt layout and movement allowance');
  expect(body).toMatch(/RUNWAY ELEVATION - WHEEL POSITIONS FOR THE LARGEST MOMENT|Runway elevation - wheel positions for the largest moment/i);
  // The overlapping arrangement thumbnail is gone (editorial review): SK-01 shows the spans.
  expect(body).not.toMatch(/\+2 MORE SPANS/);
 });
 it('binds the drawing sheets as reduced 11 × 17 copies; the full-size set is separate',()=>{
  expect(html).toContain('@page runwayArrangement{size:17in 11in;margin:0}');
  expect(html).toContain('REDUCED COPY OF ARCH D SHEET');
  expect(drawingSetHtml(s)).toContain('@page{size:36in 24in;margin:0}');
 });
});

describe('references (P5)',()=>{
 it('lists each document once with its real title and cites each check by its own clause',()=>{
  const register=reportText(html.slice(html.indexOf('Appendix B References'),html.indexOf('<section class="runway-plan-sheet-page"')));
  expect(register.match(/AISC Design Guide 7/g)).toHaveLength(1);
  expect(register).toContain('AISC Design Guide 7 · Industrial Building Design (Fisher) (Third edition, 2019');
  expect(register).toContain('New Fatigue Provisions for the Design of Crane Runway Girders (Fisher & Van de Pas, AISC Engineering Journal 39(2), 2002)');
  for(const banned of ['Capped runway girders','Euler–Bernoulli','Crane runway fatigue','DG7 §11.2 and §14.5'])expect(register,banned).not.toContain(banned);
  expect(body).not.toMatch(/Fisher & Van de Pas \(EJ 2002\) §11\.2/);
  expect(body).not.toMatch(/Beam mechanics/);
  expect(body).not.toMatch(/Combined normal stress including warping · AISC 360-16 H3 · Moore & Mueller \(EJ 2002\) · Nayak/);
  expect(body).toMatch(/Existing column flange[,·] local bending at the top flange \(J10\.1\)[^]*?AISC 360-16 J10\.1/);
  expect(body).not.toMatch(/AISC 360-16 B4, D2, E3, F4|AISC 360-16 J2, J3, J4, J7/);
 });
 it('cites AIST TR-13 once as the 2021 edition, with no edition qualifier, in the calculation and on S-00 (C1)',()=>{
  const register=reportText(html.slice(html.indexOf('Appendix B References'),html.indexOf('<section class="runway-plan-sheet-page"')));
  expect(register.match(/AIST Technical Report 13/g)).toHaveLength(1);expect(register).toContain('AIST Technical Report 13 (2021): §1.4');
  expect(body).toContain('Basis: AIST Technical Report 13 (2021);');
  for(const banned of ['UNVERIFIED','text not read','not re-read','transcribed','committee draft','ballot draft','February 24, 2020','2021 printing','Published edition'])expect(text,banned).not.toContain(banned);
  const cover=sheets[0].replace(/<[^>]+>/g,' ');
  expect(cover).toContain('AIST TECHNICAL REPORT 13 (2021)');expect(cover).not.toMatch(/FEBRUARY 24|COPY DATED/);
 });
});

describe('revision identity and consistency (m1–m9)',()=>{
 it('carries one revision letter on the calculation and the drawings, with the revision log',()=>{
  expect(html).toContain('<title>DEMO-FOCUS-005 Rev B · crane runway calculation</title>');
  expect(body).toMatch(/Crane runway girder calculation · Rev B, 2026-10-12/);
  expect(html.match(new RegExp(`Calc ID ${s.revision}`,'g'))).toHaveLength(1);expect(body).not.toMatch(/calc fingerprint/);
  expect(text).toContain('Revision log');
  for(const c of revBChanges)expect(text).toContain(reportText(c.replace(/&/g,'&amp;')).trim().slice(0,40));
  for(const svg of sheets){expect(svg).toContain('REVISION: B');expect(svg).not.toContain('CURRENT OUTPUT');expect(svg).not.toMatch(/>P1</);}
 });
 it('names each reaction once (m2) and states the deflection limit that governs (m3)',()=>{
  expect(body).toMatch(/ΣR u = 26\.5 kip per grid/);
  expect(body).toMatch(/the full grid reaction, used for one girder end/);
  expect(body).not.toContain('1.4 LRFD / 1.0 ASD');
  expect(body).toContain('vertical L/1000 = 0.30 in (AIST Class B governs); lateral L/400');
 });
 it('specifies the rail eccentricity the design uses (m4) and one preheat (m5)',()=>{
  expect(body).toContain('rail eccentricity in service not more than 1/4 in (the design eccentricity');
  expect(body).not.toContain('not more than 3/4 of the web thickness.');
  expect(body).toMatch(/Existing column, preheat for field welds Preheat and interpass temperature 150 °F minimum \(project requirement on the drawings\), above the AWS D1\.1(\/D1\.1M)?:2020 Table 5\.8 prequalified minimum of 50 °F[^]*?150 °F/);
 });
 it('uses AISC 360-16 bolt groups and the Table J3.2 F_nt (m7)',()=>{
  const cover=sheets[0];
  expect(cover).toContain('ASTM F3125 GR. A325 (GROUP A)');expect(cover).not.toContain('GROUP 120');
  expect(cover).not.toContain('A513');expect(cover).toContain('ASTM A500 GR. C STEEL TUBE');
  expect(body).toContain('ASTM F3125 Gr. A325 (Group A)');
  expect(html).toMatch(/0\.75\\times90(\.0+)?\\,\\mathrm\{ksi\}/);expect(html).not.toContain('89.9\\,\\mathrm{ksi}');
 });
 it('reports the end stop as the calculation does, with units on the bumper rows (m8)',()=>{
  const s03=sheets.find(v=>v.includes('GOVERNING STOP CHECK'))!.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  expect(s03).toMatch(/GOVERNING STOP CHECK GIRDER TOP FLANGE · THICKNESS FOR NO PRYING: D\/C 0\.68 \(THICKNESS RATIO\)/);
  // The 0.78 of the cap tieback is its slot travel (a movement check), not strength; the sleeves govern strength.
  expect(s03).toContain('MAX. D/C 0.77 STRENGTH, 0.78 SLOT TRAVEL, 0.23 FATIGUE');
  expect(sheets.join('')).not.toContain('CAP-CS-02');
  expect(body).toMatch(/Bumper, deceleration at 50% speed Peak deceleration at 50% of the rated speed 2\.08 ft\/s² against 16 ft\/s²[^]*?2\.08 ft\/s²/);
  expect(body).toMatch(/Energy at 100% speed 0\.31 kip-ft/);
 });
 it('takes the minimum fillet by the thinner part joined (m6)',()=>{
  expect(filletMinimum([3/8*inch,0.71*inch])).toBeCloseTo(3/16*inch,9);
  expect(filletMinimum([1*inch,0.71*inch])).toBeCloseTo(1/4*inch,9);
  const web=s.checks.find(c=>/^(haunch-)?web-weld-minimum$/.test(c.id)&&c.group==='Column bracket')!;
  expect(web.demand).toBeCloseTo(3/16*inch,6);expect(web.note).toMatch(/thinner part joined/);
 });
});

describe('check results CSV (m13)',()=>{
 it('is in the report units, rounded as printed, with an SI-internal option',()=>{
  const tax=buildTaxonomy(s,summaryElements(s.input)),csv=checksCsv(s,tax).trim().split('\n'),head=csv[0].split(',');
  expect(head).toContain('case_name');expect(csv.join('\n')).not.toContain('SI internal');
  const row=(id:string)=>{const r=csv.find(v=>v.startsWith(id+','))!;return r;};
  expect(row('cap-angle-slot-travel')).toMatch(/,0\.29,0\.375,0\.78,length,in,/);
  expect(row('crane-1-side')).toMatch(/,1\.25,2,0\.63,force,kip,/);
  const internal=checksCsv(s,tax,{internal:true});expect(internal).toContain('SI internal (N, mm, MPa)');
  expect(csv).toHaveLength(s.checks.length+1);
 });
});
