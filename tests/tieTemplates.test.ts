import {describe,expect,it} from 'vitest';
import {templateProject} from '../src/engine/templates';
import {calculate} from '../src/engine/calculate';
import type {CheckResult} from '../src/engine/types';

/** The tie family: its member, connections, stiffener gusset, flange attachment, imposed movement and any saddle fatigue points. */
const tieFamily=(c:CheckResult)=>['Flange attachment','Tie movement','Flange tie'].includes(c.group)||/^(tie-|flange-tie-|plate-tie-|detail-fatigue-S[AL]|detail-full-cycle-S[AL])/.test(c.id);

describe('configured flange tie, full calculation',()=>{
 it('the 10-ton template t01 passes every tie, stiffener gusset and tie movement check',()=>{
  const s=calculate(templateProject('t01'));
  expect(s.errors).toEqual([]);
  const ties=s.checks.filter(tieFamily);
  // t01's saddle exceeds its flange limits with the tie force at the tie line: the bars bolt to a gusset CJP welded to
  // the bearing stiffener, so no saddle check or saddle fatigue point remains.
  expect(ties.length).toBeGreaterThan(30);
  expect(ties.some(c=>c.id==='tie-stiffener-cjp')).toBe(true);expect(ties.some(c=>/^(flange-tie-|detail-fatigue-S[AL])/.test(c.id))).toBe(false);
  expect(ties.filter(c=>c.status==='fail').map(c=>`${c.id} ${c.utilization?.toFixed(3)}`)).toEqual([]);
 },900000);
});
