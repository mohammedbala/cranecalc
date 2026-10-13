import type {ProjectInput} from './types';
import {capAngleGeometry} from './capAngle';
import {tieRelease} from './tieGeometry';
import {activeEndBearing} from './endBearingInputs';
import {endBearingGeometry} from './endBearing';

/**
 * Play a girder restraint takes up across the runway before it bears, as the total travel from one bearing face to the
 * other (a force reversal crosses all of it).
 *  top: a cap tieback angle on sleeved bolts is not clamped, so it slides between the channel flange and its plate
 *   washers by the sleeve's projection beyond the angle leg; paired bars released at the column gusset bear across
 *   the slot, its width less the sleeve diameter. Clamped plies (snug or pretensioned through the ply) have none.
 *  bottom: the sliding bearing of a simple bay bears across its slot, the slot width less the sleeve (or bolt)
 *   diameter. Its locating bearing is clamped by pretensioned bolts in standard holes.
 */
export function restraintClearances(p:ProjectInput){
 const cap=capAngleGeometry(p),release=tieRelease(p),eb=activeEndBearing(p);
 const top=cap?.cap.sleeve?{gap:cap.cap.sleeve.length-cap.ta,source:'cap-angle' as const}:release?{gap:release.width-release.od,source:'gusset-slot' as const}:{gap:0,source:'clamped' as const};
 let bottom={gap:0,source:'none' as 'none'|'sleeve'|'bolt'};
 if(eb&&p.system==='simple'){const g=endBearingGeometry(p,eb);bottom=g.sleeve?{gap:g.slotWidth-g.sleeve.od,source:'sleeve'}:{gap:g.slotWidth-eb.bolts.diameter,source:'bolt'};}
 return {top,bottom};
}
/** Secant stiffness of a restraint with clearance `gap` reached at force P: P over its elastic displacement plus the gap. */
export const secantStiffness=(k:number,gap:number,P:number)=>gap>0&&k>0&&P>0?1/(1/k+gap/P):k;
/**
 * What the restraint play does, beside the secant restraint stiffness of the strength cases:
 *  rail: rigid-body take-up at the rail head, the top restraint g_t plus the twist (g_t + g_b)/h_r over the rail head
 *   height above the tie line (top and bottom taken up in opposite directions);
 *  torque: uniform twist of a simple bay whose two ends take up their play differently, at most (g_t + g_b)/h_r between
 *   its ends: St Venant torque GJ·Δθ/L, no warping stress (φ'' = 0); lateral take-up only translates the bay.
 */
export function clearanceEffects(p:ProjectInput,props:{J:number},tieLine:number|undefined,railTop:number){
 const c=restraintClearances(p),s=p.section,gt=c.top.gap,gb=c.bottom.gap;
 const yt=tieLine??s.d-s.tf/2,yb=s.tf/2,hr=yt-yb,theta=(gt+gb)/hr,G=s.E/2.6;
 const torque=G*props.J*theta/Math.min(...p.spans),t=Math.max(s.tf,s.tw,s.kind==='cap'?s.capTw:0);
 return {...c,gt,gb,yt,yb,hr,theta,railTop,rail:gt+theta*(railTop-yt),torque,tau:torque*t/props.J,any:gt>0||gb>0};
}
