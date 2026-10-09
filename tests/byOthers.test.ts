import {describe,it,expect} from 'vitest';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {createBracketCollector,bracketChecks} from '../src/engine/bracketDesign';
import {calculate} from '../src/engine/calculate';
import {designProject} from './fixtures/aistProject';

describe('confirmations of adequacy outside the calculation',()=>{
 it('reports a confirmed bracket horizontal load path as BY OTHERS, never as a pass',()=>{
  const p=cappedDemonstrationProject(),c=createBracketCollector(p)!;c.observe('strength','t',0,[{vertical:50000,offset:0}],-1);
  const status=()=>bracketChecks(p,c.result).find(v=>v.id==='bracket-load-path')!.status;
  expect(status()).toBe('excluded');
  p.details!.bracket!.loadPathConfirmed=false;expect(status()).toBe('unverified');
 });
 it('states in every design that the supporting structure is not checked, without blocking export',()=>{
  const s=calculate(designProject()),row=s.checks.find(c=>c.id==='supporting-structure')!;
  expect(row).toMatchObject({status:'excluded',group:'Supporting structure'});
  expect(row.note).toContain('ASCE 7');
  const a=designProject();a.scope='analysis';expect(calculate(a).checks.some(c=>c.id==='supporting-structure')).toBe(false);
 },60000);
});
