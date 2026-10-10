import {beforeAll,it,expect} from 'vitest';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {calculate,fingerprint} from '../src/engine/calculate';
import {capAttachmentChecks} from '../src/engine/capChecks';
import {drawingSheetSet} from '../src/components/planSheet';
import {reportHtml} from '../server/report';
import type {CalculationSnapshot} from '../src/engine/types';
let s:CalculationSnapshot;
beforeAll(()=>{s=calculate(cappedDemonstrationProject());},120000);
it('runs the complete three-bay capped example with no unresolved or failed checks',()=>{
 expect(s.errors).toEqual([]);expect(s.eligible).toBe(true);
 expect(s.checks.filter(c=>!['pass','not-applicable','excluded'].includes(c.status))).toEqual([]);
 expect(s.checks.filter(c=>c.status==='excluded').map(c=>c.id).sort()).toEqual(['brace-by-others','bracket-load-path','supporting-structure']);
 expect(s.checks.find(c=>c.id==='bracket-receiver')?.note).toContain('not checked here');
 expect(s.detailResults!.cap!.longitudinalFlow).toBeGreaterThan(0);
 expect(s.detailResults!.fatigue.some(f=>f.id.startsWith('CW'))).toBe(true);
 expect(s.detailResults!.fatigue.some(f=>f.id.startsWith('CE'))).toBe(true);
});
it('shows the cap-specific equations and a scaled third attachment sheet',()=>{
 const sheets=drawingSheetSet(s),html=reportHtml(s);
 expect(sheets).toHaveLength(8);expect(sheets[0].number).toBe('S-00');expect(sheets[6].svg).toContain('DIRECT FLANGE TIES');expect(sheets[3].svg).toContain('CAP END DEVELOPMENT');
 expect(sheets[3].svg).toContain('SCALE:');expect(sheets[3].svg).toContain('5&#39;-0&quot;');
 expect(html).toContain('Capped girder properties');expect(html).toContain('Cap attachment strength');
 expect(html).not.toContain('katex-error');expect(html).not.toContain('remains pending');
});
it('preserves cap-weld failures and invalidates the previous input fingerprint',()=>{
 const copy=structuredClone(s);copy.input.capDesign!.weldSize=.25;
 const checks=capAttachmentChecks(copy);
 expect(checks.find(c=>c.id==='cap-weld-min')!.status).toBe('fail');
 expect(checks.find(c=>c.id==='cap-weld-strength')!.status).toBe('fail');
 expect(fingerprint(copy.input)).not.toBe(s.revision);
});
it('completes the ASD continuous capped branch with signed support moments',()=>{
 const p=cappedDemonstrationProject();p.method='ASD';p.system='continuous';p.details!.brace.flangeAttachment!.enabled=false;
 const r=calculate(p);
 expect(r.errors).toEqual([]);expect(r.eligible).toBe(true);
 expect(r.analysis!.envelope.some(v=>v.momentMin<0)).toBe(true);
 expect(r.checks.some(c=>['incomplete','unsupported','unverified'].includes(c.status))).toBe(false);
 expect(r.checks.filter(c=>c.group==='Analysis').every(c=>c.status==='pass')).toBe(true);
},120000);
