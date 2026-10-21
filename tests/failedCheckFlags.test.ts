import {describe,it,expect} from 'vitest';
import {titleBlock} from '../src/components/sheetGraphics';
import {Draft,drawingSvg} from '../src/components/drafting';
import {demonstrationProject} from '../src/engine/demonstration';
import type {CalculationSnapshot,CheckResult} from '../src/engine/types';
import {buildTaxonomy} from '../src/engine/checkTaxonomy';
import {summaryElements} from '../src/report/designSummary';
import {openItemGroups} from '../src/report/openItems';
import {banner} from '../src/report/taxonomyReport';
import {clipReason} from '../src/engine/configurator';

const failed:CheckResult={id:'end-edge',group:'Connections',title:'Edge distance',status:'fail',equation:'',note:'',referenceIds:[]};
const snapshot=(checks:CheckResult[]):CalculationSnapshot=>({input:demonstrationProject(),revision:'flag-test',createdAt:'2026-10-09',errors:[],warnings:[],properties:null,analysis:null,checks,eligible:true,referenceVersion:''});
describe('drawings flag failed calculation checks',()=>{
 it('marks ARCH D sheets when any check fails',()=>{
  // The stamp counts open items as the report groups them (openItemGroups), with the failing checks behind them.
  expect(titleBlock(snapshot([failed,{...failed,id:'end-gap'}]),'S-02','TEST')).toContain('2 OPEN ITEMS (2 CHECKS) - SEE CALCULATION');
  expect(titleBlock(snapshot([{...failed,status:'pass'}]),'S-02','TEST')).not.toContain('OPEN ITEM');
 });
 it('marks engineering sketches when any check fails',()=>{
  const sketch=(checks:CheckResult[])=>drawingSvg(new Draft(snapshot(checks),'flag','Flag test','SK-01',300,1,'Test sketch').drawing);
  expect(sketch([failed])).toContain('1 OPEN ITEM (1 CHECK) - SEE CALC');
  expect(sketch([])).not.toContain('OPEN ITEM');
 });
 it('counts the open checks on the stamp as the report does, incomplete and unverified ones included',()=>{
  const s=snapshot([failed,{...failed,id:'configurator-tie',group:'Detailing',title:'Top-flange tie not resolved by the configurator',status:'incomplete',
   note:'Top-flange tie not resolved: test. Recommended: column caps over the new columns (support column-cap): no seat twist. Otherwise design the tie connection by hand.'}]);
  const tax=buildTaxonomy(s,summaryElements(s.input)),groups=openItemGroups(tax,s).groups,n=groups.reduce((a,g)=>a+g.members.length,0);
  expect(titleBlock(s,'S-02','TEST')).toContain(`${groups.length} OPEN ITEMS (${n} CHECKS) - SEE CALCULATION`);expect(n).toBe(2);
  // The banner names what is open: no missing input without an unverified check.
  const b=banner(tax,true,true,s);expect(b).toContain('Open items: failing checks and members or details not designed (incomplete)');expect(b).not.toContain('missing input');
  // An incomplete configurator item: its own recommendation, never "at least 0%".
  const g=groups.find(v=>v.governing.id==='configurator-tie')!;
  expect(g.remedy).toMatch(/^Recommended: column caps over the new columns/);expect(g.remedy).not.toContain('0%');
 });
 it('clips a selection-log reason at a sentence end, never mid-word',()=>{
  const long=Array.from({length:40},(_,i)=>`Sentence ${i} states a reason of the choice.`).join(' ');
  const v=clipReason(long);
  expect(v.length).toBeLessThanOrEqual(800);expect(v).toMatch(/choice\. …$/);expect(clipReason('Short.')).toBe('Short.');
 });
});
