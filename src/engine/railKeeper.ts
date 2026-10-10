import type {ProjectInput} from './types';
import {craneCombinations,craneDesignMinimum} from './aistLoads';
import {keeperGeometry,anchorGeometry,railPadThickness,keeperSeatThickness,type KeeperGeometry} from './railSeat';

/** Straight fillet weld line [x1,y1,x2,y2]: x across the runway, y along it. */
export type WeldLine=[number,number,number,number];
export interface WeldGroupLoads {vx?:number;vy?:number;normal?:number;mx?:number;my?:number;mz?:number}

/** Elastic properties of a fillet weld group in the plane of the girder surface, per unit throat. */
export function weldGroup(lines:WeldLine[]){
 const length=(l:WeldLine)=>Math.hypot(l[2]-l[0],l[3]-l[1]);
 const A=lines.reduce((s,l)=>s+length(l),0);
 if(!(A>0))throw Error('Weld group needs at least one weld line of positive length.');
 const x=lines.reduce((s,l)=>s+length(l)*(l[0]+l[2])/2,0)/A,y=lines.reduce((s,l)=>s+length(l)*(l[1]+l[3])/2,0)/A;
 const Iy=lines.reduce((s,l)=>s+length(l)*(((l[0]+l[2])/2-x)**2+(l[2]-l[0])**2/12),0);
 const Ix=lines.reduce((s,l)=>s+length(l)*(((l[1]+l[3])/2-y)**2+(l[3]-l[1])**2/12),0);
 return {lines,A,x,y,Ix,Iy,J:Ix+Iy};
}
/**
 * Largest resultant force per unit weld length, elastic method, no directional strength increase:
 * in-plane shear from vx, vy and the torque mz about the group centroid; force normal to the girder
 * surface from `normal` and the moments my (stress varying across the runway, tension at larger x) and
 * mx (varying along it). The resultant is the norm of an affine field, so its maximum is at a line end.
 */
export function weldGroupForce(g:ReturnType<typeof weldGroup>,f:WeldGroupLoads){
 const {vx=0,vy=0,normal=0,mx=0,my=0,mz=0}=f;
 const at=(px:number,py:number)=>Math.hypot(vx/g.A-mz*(py-g.y)/g.J,vy/g.A+mz*(px-g.x)/g.J,normal/g.A+(g.Iy>0?my*(px-g.x)/g.Iy:0)+(g.Ix>0?mx*(py-g.y)/g.Ix:0));
 return Math.max(...g.lines.flatMap(l=>[at(l[0],l[1]),at(l[2],l[3])]));
}
/** Keeper weld lines in keeper axes: x from the outer face toward the rail, y along the rail from the keeper centre. */
export function keeperWeldLines(k:Pick<KeeperGeometry,'length'|'endWeld'>):WeldLine[]{
 const h=k.length/2;
 return [[0,-h,0,h],[0,-h,k.endWeld,-h],[0,h,k.endWeld,h]];
}

/**
 * Conservative local keeper force path, independent of load factors: supply strength wheel-group loads or
 * unfactored fatigue-bin loads, never interchange them. A whole wheel group can act on either keeper and no
 * stabilizing wheel compression or load sharing is credited. By statics the keepers of a pair take two
 * roles, each checked at every keeper because the side force reverses:
 *  - bearing: the rail pushes the keeper outward with H at the top of the rail base, while the vertical load
 *    eccentricity lifts its lip with P|e|/b;
 *  - hold-down: the rail overturns about the other toe and lifts this lip with (H d + P|e|)/b, with no
 *    lateral force on this keeper.
 * The uplift acts at mid-overlap of the lip. The outer-face and end fillets resist the uplift, shear and
 * overturning about the weld centroid elastically. All returned forces and stresses are magnitudes.
 */
export function railKeeperResponse(p:ProjectInput,vertical:number,lateral:number,k:KeeperGeometry=keeperGeometry(p.details!.rail,railPadThickness(p))){
 const r=p.details!.rail,depth=p.aist!.railDepth,e=Math.abs(p.railEccentricity),t=keeperSeatThickness(p);
 const P=Math.abs(vertical),H=Math.abs(lateral),g=weldGroup(keeperWeldLines(k)),throat=k.weld/Math.SQRT2;
 const upliftArm=k.bodyWidth+k.clearance+k.overlap/2,lateralHeight=k.pad+r.baseThickness;
 const roles=([['bearing',H,P*e/r.baseWidth],['hold-down',0,(H*depth+P*e)/r.baseWidth]] as const).map(([role,h,U])=>{
  const moment=U*(upliftArm-g.x)+h*lateralHeight,loads={vx:h,normal:U,my:moment};
  // Normal force per unit length at the inner ends of the end fillets, which carry the overturning tension.
  const endForce=U/g.A+moment*(k.endWeld-g.x)/g.Iy;
  return {role,lateral:h,uplift:U,moment,weldStress:weldGroupForce(g,loads)/throat,
   lipStress:6*U*(k.clearance+k.overlap/2)/(k.length*k.lip**2),
   flangeStress:6*moment/(k.length*t**2),
   // End fillets on the two end faces: the body acts as a stem of thickness equal to the keeper length.
   plateStress:2*Math.max(0,endForce)/k.length};
 });
 const most=(key:'uplift'|'moment'|'weldStress'|'lipStress'|'flangeStress'|'plateStress')=>Math.max(...roles.map(v=>v[key]));
 return {roles,group:g,upliftArm,lateralHeight,uplift:most('uplift'),rootMoment:most('moment'),weldStress:most('weldStress'),lipStress:most('lipStress'),flangeStress:most('flangeStress'),plateStress:most('plateStress')};
}

/**
 * Factored crane longitudinal force (traction and braking) that the rail anchor of one rail piece takes:
 * the largest Cls of any crane, at the largest Cls factor of the strength combinations. The whole force is
 * taken by one anchor keeper; the girder-mounted end stops take the bumper force without the rail.
 */
export function railAnchorForce(p:ProjectInput){
 const factor=Math.max(0,...craneCombinations(p.method,p.aist?.concurrency==='full').map(c=>c.l));
 const traction=Math.max(0,...p.cranes.map(c=>Math.max(c.longitudinal,craneDesignMinimum(c).traction)));
 return {factor,traction,force:factor*traction};
}
/**
 * Anchor keeper: the keeper response in both roles plus the anchor force F along the rail, borne on the
 * engaged part of the keeper end at mid-height of the rail base. F adds shear along the rail, a torque
 * about the weld centroid and a moment about a transverse axis; both senses of F are checked.
 */
export function railAnchorResponse(p:ProjectInput,vertical:number,lateral:number,F:number){
 const a=anchorGeometry(p.details!.rail,railPadThickness(p)),base=railKeeperResponse(p,vertical,lateral,a),g=base.group,throat=a.weld/Math.SQRT2;
 const xF=a.bodyWidth-a.engagement/2,height=a.pad+p.details!.rail.baseThickness/2;
 const weldStress=Math.max(...base.roles.flatMap(r=>[-1,1].map(s=>weldGroupForce(g,{vx:r.lateral,normal:r.uplift,my:r.moment,vy:s*F,mz:s*F*(xF-g.x),mx:s*F*height})/throat)));
 return {geometry:a,force:F,weldStress,bearingArea:a.engagement*p.details!.rail.baseThickness,group:g};
}
