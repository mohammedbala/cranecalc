import {describe,expect,it} from 'vitest';
import {validateProject} from '../src/engine/calculate';
import {demoFocus005,demoFocus005Before} from './fixtures/demoFocus005';

describe('DEMO-FOCUS-005 review fixture',()=>{
 it('loads the reviewed project and its recorded baseline',()=>{
  const p=demoFocus005();
  expect(p.number).toBe('DEMO-FOCUS-005');expect(p.spans).toHaveLength(5);expect(p.details?.bracket?.arrangement).toBe('tapered-haunch');expect(p.details?.brace.arrangement).toBe('cap-angle');
  expect(Array.isArray(validateProject(p))).toBe(true);
  const b=demoFocus005Before();expect(b.revision).toBe('7a7a8557b7ced95f');expect(b.checks).toHaveLength(966);
 });
});
