import {describe,expect,it} from 'vitest';
import cases from './fixtures/simulationCasesV3.json';
import {buildProject} from '../src/engine/configurator';
import type {RunwayConfig} from '../src/engine/configInputs';
import {configuratorOpenItems,validateProject} from '../src/engine/calculate';
import {openKind} from '../src/engine/checkTaxonomy';
import {runwayTemplates} from '../src/engine/templates';

/**
 * Every configuration of the simulation set (the 100 seeded configurations of mkcases2, seed 20261019, as normalized on
 * a86cf5a: fixtures/simulationCasesV3.json) builds to a project validateProject accepts, so each opens on the website
 * with its numbers (build only, no calculation). Members beyond the configurator's catalog are open items of the
 * calculation, never validation stops.
 */
describe('simulation set validity',()=>{
 for(const [id,c] of Object.entries(cases as Record<string,RunwayConfig>))
  it(`case ${id} builds a valid project`,()=>{expect(validateProject(buildProject(c))).toEqual([]);},900000);
 it('a member beyond the catalog is an incomplete open item (redesign), not a validation error',()=>{
  const p=buildProject(runwayTemplates[0].config);
  p.configurator={...p.configurator!,beyondCatalog:[{member:'girder',shape:p.section.name,reason:'Plate girder required: test reason.'}]};
  expect(validateProject(p)).toEqual([]);
  const [c]=configuratorOpenItems(p);
  expect(c).toMatchObject({id:'configurator-girder',status:'incomplete',title:'Plate girder required (outside the rolled/capped catalog)'});
  expect(c.note).toMatch(/^Plate girder required: test reason\. The closest catalog member .* review draft/);
  expect(openKind({check:c,type:'detailing'})).toBe('redesign');
  // Another girder than the one the configurator could not size: no open item.
  p.configurator.beyondCatalog=[{member:'girder',shape:'W99X999',reason:'x'}];
  expect(configuratorOpenItems(p)).toEqual([]);
 },300000);
});
