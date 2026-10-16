import type { ProjectInput,CheckResult } from './types';
import {railClipInput} from './railSeat';
import type { RunwayCaseEvent } from './designAnalysis';
import type { z } from 'zod';
import type { simpleSupportSchema } from './runwayDetails';
import { activeEndStop, stopRailEnd, stopEnds } from './endStopInputs';
import { runwayEnds } from './continuation';

// Internal units: mm, N, degrees C. Left end locates each independent bay
// longitudinally; right end slides. Neither end provides moment continuity.
export const defaultSimpleSupport:z.infer<typeof simpleSupportSchema>={endGap:25.4,guideTravel:25.4,temperatureRise:30,temperatureFall:30,settingTolerance:3.175};
export const simpleSupportInput=(p:ProjectInput)=>p.details?.simpleSupport??defaultSimpleSupport;
/**
 * Simple spans with the end-bay bearings centered on the support web at the runway-end grids (review item E35,
 * details.simpleSupport.endGridBearing = 'centered'). Absent or 'on-grid': the girder end is on the grid.
 */
export const endGridCentered=(p:ProjectInput)=>p.system==='simple'&&simpleSupportInput(p).endGridBearing==='centered';
/**
 * How far the girder runs past a runway-end grid: half the bearing length when the end bearing is centered on the
 * support web (the bearing plate ends flush with the girder end), else 0 (the girder end is on the grid). An end
 * continued by an existing bay is a shared grid, not a runway end.
 */
export function endGridOverhang(p:ProjectInput,end:'left'|'right'){
 return endGridCentered(p)&&runwayEnds(p).includes(end)?(p.details?.bearing.length??254)/2:0;
}
/**
 * Drawing note for the bearing at a runway-end grid of simple spans (hole ordinates from the girder end or from the
 * grid). `dim` formats a length for the drawing.
 */
export function endGridBearingNote(p:ProjectInput,rows:readonly number[],dim:(v:number)=>string){
 const L=p.details?.bearing.length??254;
 if(endGridCentered(p))return `AT A RUNWAY-END GRID: ONE BEARING CENTERED ON THE GRID (SUPPORT WEB), THE GIRDER RUNNING ${dim(L/2)} PAST IT; HOLES ${[...new Set(rows.map(r=>dim(Math.abs(r-L/2))))].join(' AND ')} EACH SIDE OF THE GRID.`;
 return `AT A RUNWAY-END GRID: ONE BEARING, ITS GIRDER END ON THE GRID; HOLES ${dim(rows[0])} AND ${dim(rows[1])} FROM IT.`;
}
/** Physical girder pieces: start/end are the girder ends (past the grid by endGridOverhang at a runway end). */
export function girderSegments(p:ProjectInput){
 const L=p.spans.reduce((a,b)=>a+b,0);
 if(p.system==='continuous')return [{bay:1,start:0,end:L,leftGrid:0,rightGrid:L}];
 const gap=simpleSupportInput(p).endGap,n=p.spans.length,left=endGridOverhang(p,'left'),right=endGridOverhang(p,'right');let station=0;
 return p.spans.map((span,i)=>{const leftGrid=station,rightGrid=station+span;station=rightGrid;return {bay:i+1,leftGrid,rightGrid,start:leftGrid+(i?gap/2:-left),end:rightGrid-(i<n-1?gap/2:-right)};});
}
export function independentBearings(p:ProjectInput){
 if(p.system!=='simple')return [];
 const length=p.details?.bearing.length??254;
 return girderSegments(p).flatMap(m=>[
  {bay:m.bay,end:'left' as const,station:m.leftGrid,start:m.start,finish:m.start+length,center:m.start+length/2,role:'LOCATING' as const},
  {bay:m.bay,end:'right' as const,station:m.rightGrid,start:m.end-length,finish:m.end,center:m.end-length/2,role:'SLIDING' as const}
 ]);
}
/**
 * Distance from each girder end within which no rail clip stands where a direct flange saddle is welded under the top
 * flange (paired bars or a flexible plate on simple spans): past the saddle, its end fillet and the clip's reach (half
 * its base, its end weld and a spread through the flange thickness), so the clip's local flange bending is not added to
 * the saddle's (plate-tie-keeper-flange). Zero without a saddle.
 */
function saddleClipSetback(p:ProjectInput,clip:ReturnType<typeof railClipInput>){
 const d=p.details,a=d?.brace.flangeAttachment,kind=d?.brace.arrangement??'paired-bars';
 if(!d||p.system!=='simple'||!a?.enabled||(kind!=='paired-bars'&&kind!=='flexible-plate')||p.section.kind==='cap')return 0;
 const L=d.bearing.length,reach=clip.baseLength/2+clip.weld+p.section.tf;
 // The saddle center is the setback from the bearing center toward the girder end; its far end fillet toe, plus the reach.
 return Math.max(0,L/2-a.longitudinalSetback+a.saddleLength/2+a.weldSize+reach+1);
}
/** Rail clip pairs terminate on each actual girder, so a clip is never welded
 * across a simple-span joint. End stations bound every clear spacing. Where a top-flange saddle remains, the end clips
 * stand clear of it (saddleClipSetback). */
export function railClipStations(p:ProjectInput){
 const L=p.spans.reduce((a,b)=>a+b,0),spacing=p.aist?.clipSpacing??600,stop=activeEndStop(p),railEnd=stop?stopRailEnd(stop):0;
 // With girder-mounted stops the rail, and so its clips, stops short of each runway end.
 if(p.system!=='simple'||!p.details){const a=railEnd+(stop?railClipInput(p.details!.rail).baseLength/2:0),z=L-(a),stations=[];for(let x=a;x<z;x+=spacing)stations.push(x);return [...stations,z];}
 const ends=stopEnds(p);
 const clip=railClipInput(p.details.rail),half=clip.baseLength/2,last=p.spans.length,keep=saddleClipSetback(p,clip);
 return girderSegments(p).flatMap(m=>{
  const a=Math.max(m.start+half+(m.bay===1&&ends.includes('left')?railEnd:0),m.start+keep),z=Math.min(m.end-half-(m.bay===last&&ends.includes('right')?railEnd:0),m.end-keep);if(z<a)return [];
  const count=Math.max(1,Math.ceil((z-a)/spacing));
  return Array.from({length:count+1},(_,i)=>a+(z-a)*i/count);
 });
}
/** No assumed wheel-drive split: put the full selected crane traction into
 * each occupied bay in turn. These are alternative concurrent cases, never
 * additive maxima. The existing member-strength axial bound stays unchanged. */
export function tractionBays(p:ProjectInput,e:RunwayCaseEvent){
 if(!e.axial)return [-1];
 const crane=e.cranes.find(c=>c.index===e.horizontalCrane);
 if(!crane)return [-1];
 const points=p.cranes[crane.index].wheels.map(w=>crane.origin+w.offset);
 return girderSegments(p).filter(m=>points.some(x=>x>=m.leftGrid-1e-6&&x<=m.rightGrid+1e-6)).map(m=>m.bay);
}
export function simpleSupportChecks(p:ProjectInput,rotation:number):CheckResult[]{
 if(p.system!=='simple'||!p.details)return [];
 const c=simpleSupportInput(p),L=Math.max(...p.spans),alpha=12e-6;
 const check=(id:string,title:string,demand:number,capacity:number,equation:string,note:string):CheckResult=>({id,group:'Detailing',title,demand,capacity,utilization:demand/capacity,quantity:'length',equation,status:demand<=capacity*(1+1e-9)?'pass':'fail',referenceIds:['tr13-girder','dg7','criteria'],note});
 const common=`Reference AIST Technical Report 13 §5.8.1; AISC DG7 §11.2 (end rotation and thermal movement released at the supports). Independent simple bays; left end locates longitudinally, right end slides. Thermal coefficient ${p.units==='US'?'6.6667 × 10⁻⁶ /°F':'12 × 10⁻⁶ /°C'} is a stated steel modeling assumption; temperature changes are measured from erection. This is a clearance check, not verification of attachment flexibility or bracket capacity.`;
 const checks=[check('simple-guide-travel','Sliding end · movement allowance each direction',alpha*L*Math.max(c.temperatureRise,c.temperatureFall)+p.section.d*rotation+c.settingTolerance,c.guideTravel,'\\alpha L\\Delta T+d\\theta+t_{set}\\le u',common)];
 if(p.spans.length>1)checks.push(check('simple-joint-gap','Adjacent girder ends · minimum clear gap',alpha*L*c.temperatureRise+2*p.section.d*rotation+2*c.settingTolerance,c.endGap,'\\alpha L\\Delta T+2d\\theta+2t_{set}\\le g',`${common} Both adjacent end rotations are bounded independently; cap channels terminate with their girders.`));
 return checks;
}
