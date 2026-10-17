import {describe,expect,it} from 'vitest';
import {templateProject} from '../src/engine/templates';
import {buildProject,exampleClip,railClipFatigue} from '../src/engine/configurator';
import {defaultRunwayConfig,type RunwayConfig} from '../src/engine/configInputs';
import {validateProject} from '../src/engine/calculate';
import {bracketSizingSet,bracketColumnFatigueRatio} from '../src/engine/bracketSizing';
import {createBracketCollector} from '../src/engine/bracketDesign';
import {seatEccentricity} from '../src/engine/bracketRib';
import {automaticFatigueDetails} from '../src/engine/detailAnalysis';
import {longitudinalBracingAnalysis,longitudinalBracingChecks} from '../src/engine/longitudinalBracing';
import {supportReactions} from '../src/engine/supportReactions';
import {sectionProperties} from '../src/engine/section';
import {aiscShapeByName} from '../src/data/aiscSections';

/** The configurator's sizing evaluates fatigue as the checks do (the all-cycle bound at the project's cycles). */
const cfg=(c:Partial<RunwayConfig>):RunwayConfig=>({...defaultRunwayConfig,title:'Fatigue sizing',number:'T-1',units:'US',method:'LRFD',scope:'design',cranes:1,system:'simple',girder:'rolled',structure:'existing',...c});
// Simulation cases 005 (15 t CMAA D, AIST Class A, SI) and 042 (30 t CMAA D, Class A, haunched seats).
const c005=cfg({units:'SI',capacity:15,craneSpan:48,control:'pendant',cmaa:'D',buildingClass:'A',bays:2,span:18,railElevation:19,support:'by-others',tie:'paired-bars',reach:24});
const c042=cfg({method:'ASD',capacity:30,craneSpan:96,control:'cab',cmaa:'D',buildingClass:'A',system:'continuous',bays:2,span:20,railElevation:31,support:'haunched-seat',tie:'paired-bars'});

describe('configurator fatigue sizing',()=>{
 it('bolts the rail clips where the weld-on base (Category D) fails the all-cycle bound, and FT1 takes the clip category',()=>{
  const p=buildProject(c005),clip=p.details!.rail.clip!;
  expect(validateProject(p)).toEqual([]);
  expect(clip.type).toBe('bolted');
  // The weld-on clip the estimate rejected: its ratio over 1 by the project's method and cycles.
  const welded=structuredClone(p);welded.details!.rail.clip=exampleClip(clip.baseWidth,p.aist!.railDepth,clip.weld);
  expect(railClipFatigue(welded).ratio).toBeGreaterThan(1);
  expect(automaticFatigueDetails(p).filter(f=>f.id.startsWith('RC')).every(f=>f.category==='B')).toBe(true);
  expect(p.details!.fatigueDetails.find(f=>f.id==='FT1')!.category).toBe('B');
  const log=p.configurator!.selections!.find(s=>s.item==='Rail clips')!;
  expect(log.designed).toBe('Bolted clamp plates');expect(log.reason).toMatch(/item 7\.1.*Category D.*item 2\.2, Category B/);
  // A light duty keeps the weld-on clips and the Category D comparison point.
  const t=templateProject('t01');expect(t.details!.rail.clip!.type).toBe('weld-on');expect(t.details!.fatigueDetails.find(f=>f.id==='FT1')!.category).toBe('D');
 });
 it('sizes the bracket for the flange-tip eccentricity the analysis envelope reaches (the haunched rib critical section)',()=>{
  const p=templateProject('t01'),b=p.details!.bracket!,set=bracketSizingSet(p),c=createBracketCollector(p)!;
  for(const v of set.strength)c.observe('strength','sizing',v.x,v.loads,-1,v.horizontal);
  expect(c.result.strength.eccentricity!.value).toBeCloseTo(b.reach+seatEccentricity(p,1).half,6);
 });
 it('chooses a heavier column for the bracket column-flange fatigue and sizes the existing rod for its thread fatigue',()=>{
  const p=buildProject(c042),col=p.existingColumn!;
  expect(validateProject(p)).toEqual([]);
  expect(aiscShapeByName(col.shape)!.weight).toBeGreaterThan(aiscShapeByName('W14X159')!.weight);
  expect(bracketColumnFatigueRatio(p)).toBeLessThanOrEqual(.9);
  expect(p.configurator!.selections!.find(s=>s.item==='Existing column')!.reason).toMatch(/rib weld toes has a fatigue ratio/);
  const checks=longitudinalBracingChecks(p,longitudinalBracingAnalysis(p,supportReactions(p,sectionProperties(p.section))));
  for(const id of ['brace-tension','brace-rod-fatigue'])expect(checks.find(k=>k.id===id)!.utilization!).toBeLessThanOrEqual(1);
 });
});
