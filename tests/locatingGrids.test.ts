import {describe,expect,it} from 'vitest';
import {templateProject} from '../src/engine/templates';
import {locatingGrids,bumperAtGrids} from '../src/engine/columnSupport';
import {continuousBearings} from '../src/engine/endBearingInputs';

/**
 * The longitudinal force enters the columns where the girder is held: the existing-column check, the crane-level strut
 * specified for it and the bearing and bracket force tables name the same grids.
 */
describe('grids taking the longitudinal force',()=>{
 it('continuous girder on bolted bearings: traction and the stop force at its locating support only',()=>{
  const p=templateProject('t08'),at=continuousBearings(p).filter(v=>v.role==='LOCATING').map(v=>v.grid-1);
  expect(at).toHaveLength(1);
  expect(locatingGrids(p)).toEqual(at);
  expect([...bumperAtGrids(p).grids]).toEqual(at);
 });
 it('simple spans: each span at its lower grid, the stops at the end spans',()=>{
  const p=templateProject('t01');
  expect(locatingGrids(p)).toEqual(p.spans.map((_,i)=>i));
  expect([...bumperAtGrids(p).grids]).toEqual([0,p.spans.length-1]);
 });
});
