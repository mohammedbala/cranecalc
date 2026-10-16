import {describe,expect,it} from 'vitest';
import {sim002Snapshot} from './fixtures/sim002';
import {calculate,integrityAndGates} from '../src/engine/calculate';
import {allCycleRange,buildTaxonomy,fatigueCycles,fatigueData,gateCheck,thresholdOf} from '../src/engine/checkTaxonomy';
import {cappedDemonstrationProject,demonstrationProject} from '../src/engine/demonstration';
import {openGroups} from '../src/report/openItems';
import {summaryElements} from '../src/report/designSummary';
import type {CalculationSnapshot,CheckResult} from '../src/engine/types';

/**
 * Fatigue gates: a weld-root crack (Category C″ with R_FIL < 1, AISC 360-16 Table A-3.1 items 5.4/5.6, Eq. A-3-6) has no
 * threshold and is never screened, whatever category its note names first; calculate() files a failing check as not
 * applicable only for a scope gate or the n < 20,000 screen; a failing check below its threshold is kept and named; the
 * fatigue ratio that is not the project's method is a comparison bound (advisory).
 */
const ksi=6.894757293168;
/** SIM-002 with 2,000,000 duty cycles (the duty bins scaled), as baseline:9. */
const atTwoMillion=():CalculationSnapshot=>{const s=sim002Snapshot();const sp=s.input.details!.spectrum!,n=sp.reduce((a,v)=>a+v.cycles,0);s.input.details!.spectrum=sp.map(v=>({...v,cycles:v.cycles*2e6/n}));return s;};
const fatigueCheck=(v:Partial<CheckResult>&{id:string}):CheckResult=>({group:'Fatigue',title:v.id,status:'fail',quantity:'stress',equation:'f_{sr}\\le F_{SR}',note:'',referenceIds:['aisc-fatigue'],...v});

describe('weld-root cracks are evaluated, never screened',()=>{
 it('evaluates and fails a toe-C/root-C″ plate at R_FIL = 0.285, largest range 3.8 ksi, D/C 1.02 (baseline:9)',()=>{
  const s=atTwoMillion(),n=fatigueCycles(s),FSR=.285*allCycleRange('C',n);
  expect(n).toBeCloseTo(2e6,6);expect(FSR/ksi).toBeCloseTo(3.71,2);
  const c=fatigueCheck({id:'bracket-colstiff-fatigue-plate',title:'Column stiffener plates at the flange fillets · fatigue (A-3.1 item 5.6)',demand:3.79*ksi,capacity:FSR,utilization:3.79*ksi/FSR,
   equation:'f_{sr,eq}=\\left(\\frac{\\sum_in_if_{sr,i}^{3}}{n_{SR}}\\right)^{1/3}\\le F_{SR}',
   note:'Table A-3.1 item 5.6: each plate is a tension-loaded plate element connected at its end by transverse fillets on opposite sides; toe crack Category C, root crack Category C″ with R_FIL = 0.285 (Eq. A-3-6).'});
  // The largest range is under the Category C toe threshold, which screened it before: the curve is the root's.
  expect(c.utilization!).toBeCloseTo(1.02,2);expect(c.demand!).toBeLessThan(thresholdOf('C'));
  const f=fatigueData(s,c)!;expect(f.category).toBe("C''");expect(f.threshold).toBeUndefined();
  expect(gateCheck(s,c).gate).toBe('evaluated');
  s.checks.push(c);integrityAndGates(s);
  expect(s.checks.find(v=>v.id===c.id)!.status).toBe('fail');
 });
 it('evaluates the tie gusset root bounded by Category C (tie-move-root-fatigue, D/C 1.10)',()=>{
  const s=atTwoMillion(),base=s.checks.find(v=>v.id==='tie-move-root-fatigue')!,FSR=.285*allCycleRange('C',fatigueCycles(s));
  const c={...base,status:'fail' as const,capacity:FSR,demand:1.1*FSR,utilization:1.1};
  expect(c.note).toMatch(/transverse fillet root \(AISC A-3\.1 item 8\.2 with R_FIL\) bounded by Category C/);
  expect(fatigueData(s,c)!.threshold).toBeUndefined();expect(gateCheck(s,c).gate).toBe('evaluated');
  s.checks=s.checks.map(v=>v.id===c.id?c:v);integrityAndGates(s);
  const out=s.checks.find(v=>v.id===c.id)!;expect(out.status).toBe('fail');
  // It stays an open item and in the governing D/C candidates.
  const tax=buildTaxonomy(s,summaryElements(s.input));
  expect(tax.openItems.some(o=>o.check.id===c.id&&o.kind==='redesign')).toBe(true);
  expect(tax.fatigue.evaluated.some(r=>r.members.some(m=>m.id===c.id))).toBe(true);
 });
 it('keeps the toe threshold of a Category F throat check that refers to a root check elsewhere',()=>{
  const s=atTwoMillion(),c=fatigueCheck({id:'bracket-fatigue-rootWeld',status:'pass',demand:30,capacity:82.45,utilization:.36,equation:'f_{sr}\\le F_{SR}=100(1.5/n_{SR})^{0.167}\\ge8\\,\\mathrm{ksi}',
   note:'AISC A-3-2M, Category F: Table A-3.1 item 8.2, shear on the throat of any fillet weld (the rib plate is also checked under item 5.6 as the rib root, R_FIL C″).'});
  expect(fatigueData(s,c)!.category).toBe('F');expect(gateCheck(s,c).gate).toBe('screened');
 });
});

describe('calculate() files a failing check as not applicable only for a scope gate or the cycle screen',()=>{
 it('keeps a failing check that its threshold would screen, and names it in a warning',()=>{
  const s=atTwoMillion(),c=fatigueCheck({id:'test-plate-fatigue',title:'Test plate · fatigue',demand:9*ksi,capacity:8*ksi,utilization:1.125,note:'Category C, all cycles without threshold credit.'});
  expect(gateCheck(s,c)).toMatchObject({gate:'screened',screen:'threshold'});
  s.checks.push(c);integrityAndGates(s);
  expect(s.checks.find(v=>v.id===c.id)!.status).toBe('fail');
  expect(s.warnings.at(-1)).toMatch(/^FATIGUE: 1 failing check would be screened below the threshold, which contradicts the check's own allowable; kept as failures: Test plate · fatigue \(test-plate-fatigue\): Below threshold/);
 });
 it('files a failing fatigue check as not applicable at fewer than 20,000 cycles',()=>{
  const s=sim002Snapshot();s.input.details!.spectrum=s.input.details!.spectrum!.map(v=>({...v,cycles:5000}));
  const c=fatigueCheck({id:'test-plate-fatigue',demand:30*ksi,capacity:20*ksi,utilization:1.5,note:'Category C.'});
  expect(gateCheck(s,c)).toMatchObject({gate:'screened',screen:'cycles'});
  s.checks.push(c);integrityAndGates(s);
  const out=s.checks.find(v=>v.id===c.id)!;expect(out.status).toBe('not-applicable');expect(out.note).toMatch(/^Live-load cycles 15,000 < 20,000 \(AISC 360-16 Appendix 3\.1\)/);
 });
});

describe('the fatigue ratio that is not the project method is a comparison bound',()=>{
 const point=(s:CalculationSnapshot)=>{const id=s.checks.find(c=>/^detail-full-cycle-SA/.test(c.id)&&c.status==='fail')!.id.replace('detail-full-cycle-','');return {miner:`detail-fatigue-${id}`,bound:`detail-full-cycle-${id}`};};
 it('with the Miner method (default) the failing all-cycle bound is advisory, kept with its values, not a failure',()=>{
  const s=sim002Snapshot(),{miner,bound}=point(s),before=structuredClone(s.checks.find(c=>c.id===bound)!);
  expect(s.input.fatigue.method).toBeUndefined();
  const g=gateCheck(s,before);expect(g.gate).toBe('advisory');expect(g.reason).toMatch(/^Comparison bound; Miner governs/);
  integrityAndGates(s);
  const b=s.checks.find(c=>c.id===bound)!,m=s.checks.find(c=>c.id===miner)!;
  expect(b.status).toBe('not-applicable');expect([b.demand,b.capacity,b.utilization]).toEqual([before.demand,before.capacity,before.utilization]);
  expect(m.status).toBe('fail');
  const tax=buildTaxonomy(s,summaryElements(s.input));
  expect(tax.entries.get(bound)!.gate).toBe('advisory');
  expect(tax.openItems.some(o=>o.check.id===bound)).toBe(false);
  // Still beside its Miner item, for comparison.
  expect(openGroups(tax,s).groups.find(gr=>gr.members.some(c=>c.id===miner))!.folded.some(c=>c.id===bound)).toBe(true);
 });
 it('with the all-cycle method the Miner check of the point is the comparison bound',()=>{
  const s=sim002Snapshot(),{miner,bound}=point(s);s.input.fatigue.method='all-cycle';
  expect(gateCheck(s,s.checks.find(c=>c.id===miner)!).gate).toBe('advisory');
  expect(gateCheck(s,s.checks.find(c=>c.id===bound)!).gate).toBe('evaluated');
 });
});

describe('AISC 360-16 Appendix 3.1 and AIST TR-13 §5.13 in the girder checks',()=>{
 it('evaluates the girder detail at 20,000 cycles and takes the thinner rolled flange of a capped girder',()=>{
  const p=cappedDemonstrationProject();delete p.details;p.fatigue.cycles=20000;
  const s=calculate(p),c=(id:string)=>s.checks.find(v=>v.id===id)!;
  expect(c('fatigue').status).not.toBe('not-applicable');expect(c('fatigue').demand).toBeGreaterThan(0);
  expect(c('minimum-thickness').capacity).toBeCloseTo(Math.min(p.section.tf,p.section.capTf),9);
  expect(c('minimum-thickness').note).toMatch(/the W and the cap channel, the thinner flange/);
 });
 it('needs no evaluation for fewer than 20,000 cycles',()=>{
  const p=demonstrationProject();delete p.details;p.fatigue.cycles=19999;
  const c=calculate(p).checks.find(v=>v.id==='fatigue')!;
  expect(c.status).toBe('not-applicable');expect(c.note).toMatch(/^App\. 3\.1: no evaluation when fewer than 20,000 cycles\./);
 });
});
