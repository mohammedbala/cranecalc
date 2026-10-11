import {describe,it,expect} from 'vitest';
import {validateProject} from '../src/engine/calculate';
import {cappedDemonstrationProject,newColumnDemonstrationProject} from '../src/engine/demonstration';
import {runwayElevations} from '../src/engine/drawingData';
import {existingColumnRailElevation} from '../src/engine/existingColumn';

describe('engineering fixes',()=>{
 it('reconciles an entered top of rail with a surveyed existing-column seat',()=>{
  const p=cappedDemonstrationProject();
  // The survey alone sets the drawn elevations.
  expect(validateProject(p)).toEqual([]);expect(runwayElevations(p)!.source).toBe('surveyed column seat');
  // An entered top of rail that disagrees with the survey is refused instead of silently ignored.
  p.drawing!.railElevation=existingColumnRailElevation(p)-6*25.4;
  expect(validateProject(p).some(e=>e.startsWith('existingColumn.seatElevation: the surveyed bracket seat puts the top of rail'))).toBe(true);
  // One that agrees within 1/16 in is accepted.
  p.drawing!.railElevation=existingColumnRailElevation(p)+1;
  expect(validateProject(p)).toEqual([]);
  // New columns reconcile through the base on the footing, as before.
  expect(validateProject(newColumnDemonstrationProject())).toEqual([]);
 });
});
