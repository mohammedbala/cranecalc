import {describe,expect,it} from 'vitest';
import {calculate} from '../src/engine/calculate';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {compactReport} from '../src/report/compactReport';

const s=calculate(cappedDemonstrationProject());

describe('printed calculation pages',()=>{
 it('prints project, revision, issue status, responsibility and page numbers in the page margins',()=>{
  const html=compactReport(s,'');
  expect(html).toContain('@top-left{content:"CRANECALC · DEMO-CAP-002 · ');
  expect(html).toContain(`@top-right{content:"CALC REV ${s.revision} · DEMONSTRATION - NOT FOR CONSTRUCTION"`);
  expect(html).toContain('@bottom-right{content:"PAGE " counter(page) " OF " counter(pages)');
  expect(html).toContain('@bottom-left{content:"PREPARED CraneCalc demonstration · CHECKED — · EOR —"');
  expect(html).toContain('class="responsibility"');expect(html).toContain('NOT SEALED');
 },240000);
 it('fills the seal block once the package is issued for permit',()=>{
  const issued=structuredClone(s);
  issued.input.drawing={...issued.input.drawing!,originator:'J. Doe',checker:'R. Roe',eor:{name:'A. Engineer',firm:'Example Structural',license:'PE 12345',jurisdiction:'CA'},issue:'permit',revisions:[{rev:'0',date:'2026-10-10',description:'Issued for permit',by:'JD'}]};
  issued.input.reportPurpose='project';
  const html=compactReport(issued,'');
  expect(html).toContain('EOR A. Engineer');expect(html).toContain('PE 12345');expect(html).toContain('Issued for permit');
  expect(html).toContain('SEAL AND SIGNATURE REQUIRED');
 });
 it('escapes margin-box text so a title cannot break out of the style element',()=>{
  const odd=structuredClone(s);odd.input.title='Bay "C" </style><script>x</script>';
  const html=compactReport(odd,''),style=html.slice(html.indexOf('<style>'),html.indexOf('</style>'));
  expect(style).toContain('Bay \\"C\\" \\3c /style\\3e ');expect(style).not.toContain('<script>');
 });
});
