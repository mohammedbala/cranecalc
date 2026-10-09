import {flangeTieGeometry} from './tieGeometry';
import {connectionOptionChecks} from './connectionOptions';
import type {ProjectInput} from './types';
/** Known geometric conflict in the displayed independent tie template. This is
 * coordination, not a connection resistance or a substitute for the solid scan. */
export function connectionCoordination(p:ProjectInput):string[]{
 if(connectionOptionChecks(p).length)return [];
 const d=p.details,b=d?.bracket;if(!d||p.system!=='simple'||!b?.enabled)return [];
 const layout=flangeTieGeometry(p);
 if(layout){
  const a=layout.attachment,need=a.saddleLength/2+a.weldSize+d.bearing.stiffenerThickness/2+d.bearing.weldSize+a.clearance;
  return a.longitudinalSetback+1e-6<need?['Flange saddle weld envelope is too close to the bearing stiffener. Increase the tie setback and recheck its end region.']:[];
 }
 const c=d.brace.connection,start=b.reach-d.brace.length,obstruction=p.section.tw/2+d.bearing.stiffenerWidth+d.bearing.weldSize;
 const conflicts=Array.from({length:c.rows},(_,i)=>start+c.edge+i*c.pitch).some(z=>z-c.diameter<obstruction&&z+c.diameter>-obstruction);
 return conflicts?['The entered tie length and column offset place girder-side bolt hardware inside the bearing-stiffener/web region in the 3D template. Redesign the tie layout and its load path; do not fabricate from this arrangement. Run the hardware clash scan for individual conflicts.']:[];
}
