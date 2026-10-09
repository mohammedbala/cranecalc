import type { ProjectInput,CheckResult } from './types';
import type { RunwayCaseEvent } from './designAnalysis';
import type { z } from 'zod';
import type { simpleSupportSchema } from './runwayDetails';

// Internal units: mm, N, degrees C. Left end locates each independent bay
// longitudinally; right end slides. Neither end provides moment continuity.
export const defaultSimpleSupport:z.infer<typeof simpleSupportSchema>={endGap:25.4,guideTravel:25.4,temperatureRise:30,temperatureFall:30,settingTolerance:3.175};
export const simpleSupportInput=(p:ProjectInput)=>p.details?.simpleSupport??defaultSimpleSupport;
export function girderSegments(p:ProjectInput){
 const L=p.spans.reduce((a,b)=>a+b,0);
 if(p.system==='continuous')return [{bay:1,start:0,end:L,leftGrid:0,rightGrid:L}];
 const gap=simpleSupportInput(p).endGap;let station=0;
 return p.spans.map((span,i)=>{const leftGrid=station,rightGrid=station+span;station=rightGrid;return {bay:i+1,leftGrid,rightGrid,start:leftGrid+(i?gap/2:0),end:rightGrid-(i<p.spans.length-1?gap/2:0)};});
}
export function independentBearings(p:ProjectInput){
 if(p.system!=='simple')return [];
 const length=p.details?.bearing.length??254;
 return girderSegments(p).flatMap(m=>[
  {bay:m.bay,end:'left' as const,station:m.leftGrid,start:m.start,finish:m.start+length,center:m.start+length/2,role:'LOCATING' as const},
  {bay:m.bay,end:'right' as const,station:m.rightGrid,start:m.end-length,finish:m.end,center:m.end-length/2,role:'SLIDING' as const}
 ]);
}
/** Keepers terminate on each actual girder, so an attachment cannot weld
 * across a simple-span joint. End stations bound every clear spacing. */
export function railKeeperStations(p:ProjectInput){
 const L=p.spans.reduce((a,b)=>a+b,0),spacing=p.aist?.clipSpacing??600;
 if(p.system!=='simple'||!p.details){const stations=[];for(let x=0;x<L;x+=spacing)stations.push(x);return [...stations,L];}
 const half=p.details.rail.clipWidth/2;
 return girderSegments(p).flatMap(m=>{
  const a=m.start+half,z=m.end-half;if(z<a)return [];
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
 const check=(id:string,title:string,demand:number,capacity:number,equation:string,note:string):CheckResult=>({id,group:'Detailing',title,demand,capacity,utilization:demand/capacity,quantity:'length',equation,status:demand<=capacity*(1+1e-9)?'pass':'fail',referenceIds:['tr13-girder','mechanics','criteria'],note});
 const common=`Reference AIST Technical Report 13 §5.8.1. Independent simple bays; left end locates longitudinally, right end slides. Thermal coefficient ${p.units==='US'?'6.6667 × 10⁻⁶ /°F':'12 × 10⁻⁶ /°C'} is a stated steel modeling assumption; temperature changes are measured from erection. This is a clearance check, not verification of attachment flexibility or bracket capacity.`;
 const checks=[check('simple-guide-travel','Sliding end · movement allowance each direction',alpha*L*Math.max(c.temperatureRise,c.temperatureFall)+p.section.d*rotation+c.settingTolerance,c.guideTravel,'u_{req}=\\alpha L\\max(\\Delta T_+,\\Delta T_-)+d|\\theta|+t_{set}',common)];
 if(p.spans.length>1)checks.push(check('simple-joint-gap','Adjacent girder ends · minimum clear gap',alpha*L*c.temperatureRise+2*p.section.d*rotation+2*c.settingTolerance,c.endGap,'g_{req}=\\alpha L\\Delta T_++2d|\\theta|+2t_{set}',`${common} Both adjacent end rotations are bounded independently; cap channels terminate with their girders.`));
 return checks;
}
