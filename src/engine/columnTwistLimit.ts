/**
 * Twist of a column at the girder seat under the longitudinal crane force applied off its shear center (a bracket seat
 * on a column held along the runway at its centerline): a designed serviceability limit instead of an engineer-of-record
 * acceptance item. Canonical units N, mm, rad.
 *
 * Mechanics basis. A locating girder rides on its seat, so the seat's movement along the runway from the column twist
 * θ, Δ = θe (e the seat offset from the column shear center), is a slip of the girder relative to its sliding supports
 * and the adjacent girder at every crane start and stop: it is taken by the bearing slots, the girder end gap and the tie
 * hardware, which reserve the rail setting tolerance t_set (details.criteria.alignmentTolerance, 1/8 in by default) for
 * such fit-up and support movement. The service twist movement is therefore limited to that allowance, Δ_s ≤ t_set, and
 * it is added to the slot travel and end gap demands (simpleSupportChecks, endBearingChecks). The rail moves across the
 * runway by e(1 − cos θ), stated with the check. The linear (small-rotation) torsion model the twist comes from holds to
 * about 0.1 rad (tan θ within 0.4% of θ): past that the factored twist is outside the model and the check fails.
 * Partial basis: AISC DG7 and AIST TR-13 give no numerical twist limit (clause to be verified); the limit follows from
 * the movement allowances the details are checked for.
 */
import type {CheckResult,ProjectInput} from './types';
import type {ExistingColumnResult} from './existingColumn';
import {format} from './units';

const inch=25.4;
/** Largest factored twist of the linear torsion model, rad. */
export const smallRotationLimit=.1;
/** The service movement along the runway the details reserve for support movement: the rail setting tolerance. */
export const twistMovementLimit=(p:ProjectInput)=>p.details?.criteria.alignmentTolerance??inch/8;
type Torsion=NonNullable<ExistingColumnResult['torsion']>;

/** Service bearing movement along the runway from the column twist (each crane start and stop), for the movement checks. */
export const twistSlip=(t:Torsion|undefined)=>t?Math.abs(t.service.slip):0;

/** The twist checks: the service movement within the allowance, the factored twist within the small-rotation model. */
export function columnTwistChecks(p:ProjectInput,t:Torsion,label:string,accepted?:string):CheckResult[]{
 const u=p.units,L=(v:number)=>format(v,'length',u,3),limit=twistMovementLimit(p),s=t.service;
 const out:CheckResult[]=[];
 const status=(d:number,c:number):CheckResult['status']=>d<=c*(1+1e-9)?'pass':'fail';
 const slip=Math.abs(s.slip);
 out.push({id:'column-twist',group:label,title:`${label} · twist at the seat: bearing movement along the runway`,status:status(slip,limit),demand:slip,capacity:limit,utilization:slip/limit,quantity:'length',
  equation:'\\Delta_s=\\theta_se\\le t_{set}',referenceIds:['aisc-h3','tr13-column-path','criteria'],
  note:`Service twist θ_s = ${s.twist.toFixed(4)} rad under the unfactored single-crane traction (torque ${format(s.T,'moment',u,3)} at the offset e = ${L(t.offset)}, every crane start and stop) moves the locating girder bearing Δ_s = θ_s e = ${L(slip)} along the runway, against the ${L(limit)} support-movement allowance the bearing slots, end gaps and ties reserve (the rail setting tolerance; the slip is added to their demands). The rail moves ${L(s.lateral)} across the runway, e(1 − cos θ_s). Basis: the movement allowances of the details (AISC DG7 and AIST TR-13 give no numerical twist limit; clause to be verified).${accepted?` Engineer of record's note: ${accepted}.`:''} Remedy when exceeded: remove the torque (a column cap or a crane-level collector on the girder line), or a torsionally stiffer column.`});
 out.push({id:'column-twist-rotation',group:label,title:`${label} · twist at the seat within the small-rotation model`,status:status(Math.abs(t.twist),smallRotationLimit),demand:Math.abs(t.twist),capacity:smallRotationLimit,utilization:Math.abs(t.twist)/smallRotationLimit,quantity:'ratio',
  equation:'\\theta_u\\le0.1\\,\\mathrm{rad}',referenceIds:['aisc-h3'],
  note:`Factored twist θ_u = ${t.twist.toFixed(4)} rad under the largest torque (${format(t.T,'moment',u,3)}): ${L(t.slip)} along and ${L(t.lateral)} across the runway at the seat. The linear torsion model (AISC Design Guide 9) holds while tan θ ≈ θ (within 0.4% at 0.1 rad); a larger twist is outside the model.`});
 return out;
}
