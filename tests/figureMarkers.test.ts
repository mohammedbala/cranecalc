import {describe,expect,it} from 'vitest';
import {cappedDemonstrationProject,demonstrationProject} from '../src/engine/demonstration';
import {selectTieArrangement} from '../src/engine/connectionOptions';
import {activeEndBearing} from '../src/engine/endBearingInputs';
import {isoTopicFigure} from '../src/report/hairline/topics';
import {supportAssemblyLayout} from '../src/report/hairline/figures';
import {checkFigure,checkGroupPurpose} from '../src/components/checkFigures';
import {cappedTaperedHaunch,existingBuildingHaunch} from './fixtures/taperedHaunchProjects';
import {markerProblems} from './fixtures/figureLayout';
import type {ProjectInput} from '../src/engine/types';

const inch=25.4;
/** The focus arrangement: tapered I haunches in an existing building, with cap tieback angles on a capped girder. */
function hauncheCapAngle(){const p=cappedTaperedHaunch();p.details=selectTieArrangement(p.details!,'cap-angle');p.details.brace.capAngle!.weldSize=5/16*inch;return p;}
const projects:[string,()=>ProjectInput][]=[['capped demonstration',cappedDemonstrationProject],['rolled demonstration',demonstrationProject],['existing building with tapered haunches',()=>existingBuildingHaunch()],['tapered haunch with cap tieback angles',hauncheCapAngle]];

describe('figure markers point at their parts',()=>{
 for(const [name,make] of projects)it(`${name}: every leader ends on its part, clear of other markers, leaders and labels`,()=>{
  const p=make(),problems:string[]=[...markerProblems(supportAssemblyLayout(p),'summary')];
  let figures=0;
  for(const topic of Object.keys(checkGroupPurpose)){
   const f=isoTopicFigure(topic,p,{topOnly:!!activeEndBearing(p)});if(!f)continue;figures++;
   const L=f.layout();problems.push(...markerProblems(L,topic));
   // Every marker is tied to a part and numbered as the caption.
   expect(L.markers.map(m=>m.n),topic).toEqual(L.markers.map((_,i)=>i+1));
  }
  expect(figures).toBeGreaterThan(15);
  expect(problems).toEqual([]);
 });
 it('schematic figures keep their numbered circles apart',()=>{
  for(const topic of Object.keys(checkGroupPurpose)){
   const f=checkFigure(topic);if(f.view!=='schematic')continue;
   const c=[...f.svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="6.2"/g)].map(m=>[Number(m[1]),Number(m[2])]);
   for(let i=0;i<c.length;i++)for(let j=i+1;j<c.length;j++)expect(Math.hypot(c[i][0]-c[j][0],c[i][1]-c[j][1]),`${topic} ${i+1}/${j+1}`).toBeGreaterThanOrEqual(12.4);
  }
 });
});
