import {describe,it,expect} from 'vitest';
import {validateProject} from '../src/engine/calculate';
import {demonstrationProject,cappedDemonstrationProject} from '../src/engine/demonstration';
import {designProject} from './fixtures/aistProject';

const has=(errors:string[],field:string)=>errors.some(e=>e.startsWith(field+':'));
describe('rail inputs used by the design',()=>{
 it('requires one rail depth for the force couple and the wheel bearing length',()=>{
  const p=designProject();p.railHeight=75;p.aist!.railDepth=150;
  expect(has(validateProject(p),'railHeight')).toBe(true);
  p.railHeight=150;expect(has(validateProject(p),'railHeight')).toBe(false);
  // Analysis reports do not use the AIST bearing length.
  const a=designProject();a.scope='analysis';a.railHeight=75;expect(has(validateProject(a),'railHeight')).toBe(false);
 });
 it('designs for at least the rail setting allowance permitted on the drawings',()=>{
  const p=demonstrationProject(),allowance=p.details!.criteria.alignmentTolerance;
  p.railEccentricity=0;expect(has(validateProject(p),'railEccentricity')).toBe(true);
  p.railEccentricity=-allowance;expect(has(validateProject(p),'railEccentricity')).toBe(false);
  expect(validateProject(cappedDemonstrationProject())).toEqual([]);
  expect(cappedDemonstrationProject().railEccentricity).toBeGreaterThanOrEqual(allowance);
 });
});
