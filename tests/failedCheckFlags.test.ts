import {describe,it,expect} from 'vitest';
import {titleBlock} from '../src/components/sheetGraphics';
import {Draft,drawingSvg} from '../src/components/drafting';
import {demonstrationProject} from '../src/engine/demonstration';
import type {CalculationSnapshot,CheckResult} from '../src/engine/types';

const failed:CheckResult={id:'end-edge',group:'Connections',title:'Edge distance',status:'fail',equation:'',note:'',referenceIds:[]};
const snapshot=(checks:CheckResult[]):CalculationSnapshot=>({input:demonstrationProject(),revision:'flag-test',createdAt:'2026-10-09',errors:[],warnings:[],properties:null,analysis:null,checks,eligible:true,referenceVersion:''});
describe('drawings flag failed calculation checks',()=>{
 it('marks ARCH D sheets when any check fails',()=>{
  expect(titleBlock(snapshot([failed,{...failed,id:'end-gap'}]),'S-02','TEST')).toContain('2 FAILED CHECKS - SEE CALCULATION');
  expect(titleBlock(snapshot([{...failed,status:'pass'}]),'S-02','TEST')).not.toContain('FAILED CHECK');
 });
 it('marks engineering sketches when any check fails',()=>{
  const sketch=(checks:CheckResult[])=>drawingSvg(new Draft(snapshot(checks),'flag','Flag test','SK-01',300,1,'Test sketch').drawing);
  expect(sketch([failed])).toContain('1 FAILED CHECK - SEE CALC');
  expect(sketch([])).not.toContain('FAILED CHECK');
 });
});
