import {describe,expect,it} from 'vitest';
import {templateProject} from '../src/engine/templates';
import {calculate} from '../src/engine/calculate';
import type {CheckResult} from '../src/engine/types';

/** The tie family: its member, connections, flange attachment, imposed movement and the saddle-toe fatigue points. */
const tieFamily=(c:CheckResult)=>['Flange attachment','Tie movement','Flange tie'].includes(c.group)||/^(tie-|flange-tie-|plate-tie-|detail-fatigue-SA|detail-full-cycle-SA)/.test(c.id);

describe('configured flange tie, full calculation',()=>{
 it('the 10-ton template t01 passes every tie, flange attachment, tie movement and saddle fatigue check',()=>{
  const s=calculate(templateProject('t01'));
  expect(s.errors).toEqual([]);
  const ties=s.checks.filter(tieFamily);
  expect(ties.length).toBeGreaterThan(40);
  expect(ties.some(c=>c.id.startsWith('detail-fatigue-SA'))).toBe(true);
  expect(ties.filter(c=>c.status==='fail').map(c=>`${c.id} ${c.utilization?.toFixed(3)}`)).toEqual([]);
  // The girder flange carries the saddle couple over its effective width; the saddle-length strip is printed as a screen.
  expect(s.checks.find(c=>c.id==='flange-tie-flange')!.note).toContain('Screening bound with the saddle-length strip alone');
 },900000);
});
