import {describe,expect,it} from 'vitest';
import {reviewOpenItem} from './review/openItems';
import {calculate} from '../src/engine/calculate';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {compactReport} from '../src/report/compactReport';

const s=calculate(cappedDemonstrationProject());s.checks=s.checks.filter(c=>!reviewOpenItem(c));

describe('printed calculation pages',()=>{
 it('prints project, revision, issue status, responsibility and page numbers in the page margins',()=>{
  const html=compactReport(s,'');
  expect(html).toContain('@top-left{content:"DEMO-CAP-002 · ');
  // Without entered revisions the header carries the calculation fingerprint and date.
  expect(html).toContain(`@top-right{content:"Calc ${s.revision} · ${s.createdAt.slice(0,10)} · Demonstration, not for construction"`);
  expect(html).toContain('@bottom-right{content:"Page " counter(page) " of " counter(pages)');expect(html).toContain(`@bottom-center{content:"Calc ID ${s.revision}"`);
  expect(html).toContain('@bottom-left{content:"Prepared: CraneCalc demonstration\u2003Checked: —\u2003EOR: —"');
  expect(html).toContain('class="responsibility"');expect(html).toContain('NOT SEALED');
 },240000);
 it('fills the seal block once the package is issued for permit',()=>{
  const issued=structuredClone(s);
  issued.input.drawing={...issued.input.drawing!,originator:'J. Doe',checker:'R. Roe',eor:{name:'A. Engineer',firm:'Example Structural',license:'PE 12345',jurisdiction:'CA'},issue:'permit',existingEvaluation:'Existing structure evaluation, report 24-117',code:{building:'2022 California Building Code',editions:'2016',reviewed:false},revisions:[{rev:'0',date:'2026-10-10',description:'Issued for permit',by:'JD'}]};
  issued.input.reportPurpose='project';
  const html=compactReport(issued,'');
  expect(html).toContain('EOR: A. Engineer');expect(html).toContain('PE 12345');expect(html).toContain('Issued for permit');
  expect(html).toContain('SEAL AND SIGNATURE REQUIRED');expect(html).toContain('2022 California Building Code · AISC 360-16 / ASCE 7-16');
 });
 it('escapes margin-box text so a title cannot break out of the style element',()=>{
  const odd=structuredClone(s);odd.input.title='Bay "C" </style><script>x</script>';
  const html=compactReport(odd,''),style=html.slice(html.indexOf('<style>'),html.indexOf('</style>'));
  expect(style).toContain('Bay \\"C\\" \\3c /style\\3e ');expect(style).not.toContain('<script>');
 });
});
