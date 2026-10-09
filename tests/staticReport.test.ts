import {describe,it,expect,beforeAll} from 'vitest';
import {calculate,fingerprint} from '../src/engine/calculate';
import {exampleProject} from '../src/engine/defaults';
import type {CalculationSnapshot} from '../src/engine/types';
import {defaultFraming} from '../src/components/framingSettings';
import {printableReport} from '../src/report/printReport';
import {reportHtml} from '../server/report';

describe('static hosting report export',()=>{
 let snapshot:CalculationSnapshot;
 beforeAll(()=>{const p=structuredClone(exampleProject);p.scope='analysis';snapshot=calculate(p);});
 it('retains the calculation, figures and ARCH D sheets in a self-contained printable report',()=>{
  const html=printableReport(snapshot,defaultFraming,snapshot.revision,'.test-font{color:black}');
  expect(html).toContain(snapshot.revision);
  expect(html).toContain('SUPPLIED-LOAD ANALYSIS REPORT ONLY');
  expect(html).toContain('data-check-figure="Serviceability"');
  expect(html).toContain('size:36in 24in');
  expect(html).toContain('Print / Save PDF');
  expect(html).toContain('.test-font{color:black}');
  expect(html).toContain('@media print{.print-tools{display:none!important}}');
  expect(html).not.toContain('/api/report');
  // The local server uses the very same report content without print controls.
  expect(reportHtml(snapshot)).not.toContain('class="print-tools"');
 });
 it('rejects stale revisions, invalid framing and blocked checks even with a forged eligibility flag',()=>{
  expect(()=>printableReport(snapshot,defaultFraming,'stale','')).toThrow('revision');
  const stale=structuredClone(snapshot);stale.input.title='Edited after calculation';
  expect(()=>printableReport(stale,defaultFraming,stale.revision,'')).toThrow('revision');
  const blocked=structuredClone(snapshot);blocked.checks[0].status='unsupported';
  expect(()=>printableReport(blocked,defaultFraming,blocked.revision,'')).toThrow('cannot be exported');
  expect(()=>printableReport(snapshot,{...defaultFraming,width:-1},snapshot.revision,'')).toThrow();
 });
 it('preserves failed criteria in exportable reports and escapes project metadata',()=>{
  const s=structuredClone(snapshot);s.input.title='<script>alert(1)</script>';s.revision=fingerprint(s.input);
  s.checks[0].status='fail';
  const html=printableReport(s,defaultFraming,s.revision,'');
  expect(html).toContain('FAILED ENGINEERING CRITERIA');
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(html).not.toContain('<script>alert(1)</script>');
 });
});
