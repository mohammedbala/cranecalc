import type {ProjectInput} from './types';
import {craneCombinations,craneDesignMinimum} from './aistLoads';
import {filletEffectiveSize} from './connectionStrength';
import {clipGeometry,railPadThickness,type ClipGeometry} from './railSeat';

/**
 * Forces on one rail clip and the throat stress of its base welds. The clips stand in opposing pairs; the side thrust
 * H of the wheel group at a clip station (every wheel within one clip spacing, see detailAnalysis) is taken by ONE
 * clip on the side the rail is pushed toward: no sharing with the neighboring clips is credited. This is the
 * conservative bound (any distribution of the thrust over several clips gives a smaller force per clip), so it needs
 * no further justification. Each clip is checked in both roles, because
 * the side thrust reverses:
 *  - bearing clip: the rail base bears on the clip nose with V = H at mid-height of the rail base;
 *  - hold-down clip: the side thrust at the rail head overturns the rail about the far base toe and the nose of this
 *    clip holds the base down with T = H h_r / b_r (the stabilizing wheel load is not credited).
 * The base is welded by two fillets across the rail (one at each end of the base), weldLength l_w long and
 * baseLength apart. Per unit length of weld: shear from V along the welds, and normal force from T and the moment
 * about an axis along the rail (V times its height above the steel, or T times its arm from the weld centroid),
 * elastic, no directional strength increase. The same expressions serve factored and unfactored forces.
 */
export function railClipResponse(p:ProjectInput,lateral:number,c:ClipGeometry=clipGeometry(p.details!.rail,railPadThickness(p))){
 const r=p.details!.rail,depth=p.aist!.railDepth,H=Math.abs(lateral);
 const size=filletEffectiveSize(c.weld,c.weldLength),throat=size/Math.SQRT2,A=2*throat*c.weldLength,S=2*throat*c.weldLength**2/6;
 // The nose bears at mid-overlap on the rail base; the weld centroid is at mid-width of the base.
 const upliftArm=c.baseWidth/2+c.overlap/2;
 const roles=([['bearing',H,0,H*c.lateralHeight],['hold-down',0,H*depth/r.baseWidth,H*depth/r.baseWidth*upliftArm]] as const).map(([role,V,T,M])=>
  ({role,lateral:V,uplift:T,moment:M,weldStress:Math.hypot(V/A,T/A+M/S)}));
 return {roles,lateral:H,uplift:H*depth/r.baseWidth,weldStress:Math.max(...roles.map(v=>v.weldStress)),throat,size,A,S,upliftArm,
  /** Local bending of the plate under the clip from the larger clip moment, over the clip length (for the flange-tie interaction). */
  flangeStress:6*Math.max(...roles.map(v=>v.moment))/(c.baseLength*(p.section.kind==='cap'?p.section.capTw:p.section.tf)**2)};
}

/**
 * Factored crane longitudinal force (traction and braking) on one rail: the largest Cls of any crane, at the largest
 * Cls factor of the strength combinations. With tight joints the rail string floats in its clips and this force (and
 * rail creep) is anchored where the rail end bears on an end stop; with open joints each rail piece is held by its
 * anchor clip pair.
 */
export function railAnchorForce(p:ProjectInput){
 const factor=Math.max(0,...craneCombinations(p.method,p.aist?.concurrency==='full').map(c=>c.l));
 const traction=Math.max(0,...p.cranes.map(c=>Math.max(c.longitudinal,craneDesignMinimum(c).traction)));
 return {factor,traction,force:factor*traction};
}
