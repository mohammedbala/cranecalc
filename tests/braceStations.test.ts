import {describe,it,expect} from 'vitest';
import {flangeRestraintStations,flangeRestraintGaps,compressionFlangeGap,createDetailCollector} from '../src/engine/detailAnalysis';
import {validateProject} from '../src/engine/calculate';
import {demonstrationProject} from '../src/engine/demonstration';
import {sectionProperties} from '../src/engine/section';
import {designProject} from './fixtures/aistProject';
import type {ProjectInput} from '../src/engine/types';

const braced=(p:ProjectInput,top:number,bottom:number)=>{p.lateralBraceSpacing=top;p.aist!.bottomBraceSpacing=bottom;return p;};
describe('flange restraint stations are kept separate',()=>{
 it('restrains each flange only at its own braces, with both flanges tied at supports',()=>{
  const p=braced(designProject(),7620,3810);
  expect(flangeRestraintStations(p)).toEqual({top:[0,7620],bottom:[0,3810,7620]});
  expect(flangeRestraintGaps(p)).toEqual({top:7620,bottom:3810,twist:7620});
  expect(compressionFlangeGap(p)).toBe(7620);
 });
 it('uses either flange as the compression flange on continuous runways',()=>{
  const p=braced(designProject(),3810,0);p.system='continuous';p.spans=[7620,7620];
  expect(flangeRestraintGaps(p)).toMatchObject({top:3810,bottom:7620});
  expect(compressionFlangeGap(p)).toBe(7620);
 });
 it('rejects an unbraced length credited with the other flange’s bracing',()=>{
  const p=braced(designProject(),7620,3810);p.unbracedLength=3810;
  expect(validateProject(p).some(e=>e.startsWith('unbracedLength: cannot be shorter than the top'))).toBe(true);
  p.unbracedLength=7620;expect(validateProject(p).some(e=>e.startsWith('unbracedLength'))).toBe(false);
  const c=braced(designProject(),3810,0);c.system='continuous';c.spans=[7620,7620];c.unbracedLength=3810;
  expect(validateProject(c).some(e=>e.startsWith('unbracedLength: cannot be shorter than the larger'))).toBe(true);
 });
 it('gives a lower buckling multiplier when only the tension flange is braced between supports',()=>{
  const critical=(top:number,bottom:number)=>{
   const p=braced(demonstrationProject(),top,bottom),c=createDetailCollector(p,sectionProperties(p.section),20),P=900000,x=3810;
   c.observe({kind:'strength',id:'midspan',combination:'fixture',cranes:[{index:0,origin:x,loaded:true}],horizontalCrane:0,lateralSign:1,wheels:[{x,p:P,h:.05*P}],q:0,railTorquePerLength:0,axial:0,verticalReactions:[{x:0,r:P/2},{x:7620,r:P/2}]});
   return c.finish().criticalMultiplier;
  };
  const bottomOnly=critical(7620,3810),bothFlanges=critical(3810,3810);
  expect(bottomOnly).toBeLessThan(.9*bothFlanges);
 },120000);
});
