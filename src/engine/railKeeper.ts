import type { RunwayDetails } from './runwayDetails';
import { parallelWeldGroup } from './connectionStrength';

/** Conservative local force path, independent of load factors. Supply either
 * strength loads or unfactored fatigue-bin loads, never interchange them.
 * A whole wheel group can act on either keeper; no sharing or stabilizing
 * wheel compression is credited. All returned stresses are magnitudes.
 */
export function railKeeperResponse(rail:RunwayDetails['rail'],depth:number,eccentricity:number,flangeThickness:number,vertical:number,lateral:number){
 const P=Math.abs(vertical),H=Math.abs(lateral);
 const uplift=(H*depth+P*Math.abs(eccentricity))/rail.baseWidth;
 const rootMoment=uplift*rail.clipProjection+H*(rail.baseThickness+rail.clipThickness/2);
 const weld=parallelWeldGroup({length:rail.clipWidth,gauge:rail.clipThickness,size:rail.clipWeld,Fexx:1,method:'LRFD',vx:H,vy:uplift,normal:0,mx:0,my:rootMoment,mz:0});
 return {uplift,rootMoment,flangeStress:6*rootMoment/(rail.clipWidth*flangeThickness**2),
  plateStress:6*rootMoment/(rail.clipWidth*rail.clipThickness**2),weldStress:weld.demand};
}
