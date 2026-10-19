/**
 * Twist of a prismatic column at the girder seat under the longitudinal crane force applied off its shear center (a
 * bracket seat on a column held along the runway at its centerline): designed limits instead of an engineer-of-record
 * acceptance item, on the same basis as the stepped column's lower shaft (steppedColumn.ts, column-lower-twist and
 * column-lower-twist-movement). Canonical units N, mm, rad.
 *
 * Mechanics. The column twists about its vertical axis: the seat, offset e from the shear center, moves θe ALONG the
 * runway and only e(1 − cos θ) ACROSS it.
 * - Factored twist θ_u ≤ 0.02 rad: the column analysis is first order (small rotations); the girder reaction R, shifted
 *   e·θ along the runway by the twist, adds a weak-axis moment R·e·θ it leaves out, which θ ≤ 0.02 keeps within 2% of
 *   the eccentric moment R·e the strong-axis H1 carries (twistRotationLimit = steppedTwistLimit).
 * - Service movement of the girder line along the runway, θ_s e plus the crane-level bracing displacement in series,
 *   within the runway-level displacement limit min(H/400, 2 in) (AIST TR-13 §5.5, the column's drift limit).
 * - The rail's shift across the runway e(1 − cos θ_s) is added to the column's lateral displacement (column-drift).
 * - The service movement θ_s e is a slip of the locating girder against its sliding supports and the adjacent girder at
 *   every crane start and stop: it is added to the slot travel and end gap demands (simpleSupportChecks, endBearingChecks).
 */
import type {CheckResult,ProjectInput} from './types';
import type {ExistingColumnResult} from './existingColumn';
import {format} from './units';

/** Largest factored twist at the seat (rad), the P-θ basis of steppedColumn.steppedTwistLimit. */
export const twistRotationLimit=.02;
type Torsion=NonNullable<ExistingColumnResult['torsion']>;

/**
 * Service bearing movement along the runway from the column twist (each crane start and stop), for the movement checks:
 * a column whose twist is limited here (a column designed here, checked without the existing-building review; the
 * reviewed existing and stepped columns keep their own torsion checks and paths).
 */
export const twistSlip=(r:ExistingColumnResult|undefined)=>r?.torsion&&!r.support?Math.abs(r.torsion.service.slip):0;
/** The rail's shift across the runway from the service twist, e(1 − cos θ_s), added to the column's lateral displacement. */
export const twistShift=(t:Torsion|undefined)=>t?Math.abs(t.service.lateral):0;

/**
 * The twist checks of a prismatic column: the factored twist within the small-rotation (P-θ) limit, and the service
 * movement along the runway (in series with the bracing's crane-level displacement `brace`) within `limit`, the column's
 * runway-level displacement limit.
 */
export function columnTwistChecks(p:ProjectInput,t:Torsion,label:string,limit:number,brace=0,accepted?:string):CheckResult[]{
 const u=p.units,L=(v:number)=>format(v,'length',u,3),s=t.service,move=Math.abs(s.slip)+brace;
 const status=(d:number,c:number):CheckResult['status']=>d<=c*(1+1e-9)?'pass':'fail';
 const remedy='Remedy when exceeded: remove the torque (column caps on the column axis, or a crane-level collector on the girder line), or a torsionally stiffer column.';
 return [
  {id:'column-twist-rotation',group:label,title:`${label} · twist at the seat under the factored torque (small-rotation limit)`,status:status(Math.abs(t.twist),twistRotationLimit),demand:Math.abs(t.twist),capacity:twistRotationLimit,utilization:Math.abs(t.twist)/twistRotationLimit,quantity:'ratio',
   equation:'\\theta_u\\le0.02\\ \\mathrm{rad}',referenceIds:['aisc-h3','tr13-column-path'],
   note:`Factored twist θ_u = ${t.twist.toFixed(4)} rad under the largest torque ${format(t.T,'moment',u,3)} at the offset e = ${L(t.offset)}: the girder bearing moves ${L(t.slip)} along the runway. Basis (mechanics): the column analysis is first order (small rotations); the girder reaction R, shifted e·θ along the runway by the twist, adds a weak-axis moment R·e·θ it leaves out, which θ ≤ 0.02 rad keeps within 2% of the eccentric moment R·e (the stepped column's limit). ${remedy}`},
  {id:'column-twist',group:label,title:`${label} twist · girder movement along the runway at the seat (service)`,status:status(move,limit),demand:move,capacity:limit,utilization:move/limit,quantity:'length',
   equation:'\\Delta=\\theta_se+\\Delta_{brace}\\le\\min(H/400,\;2\\,\\mathrm{in})',referenceIds:['tr13-service','tr13-column-path'],
   note:`Unfactored single-crane traction at the seat, torque ${format(s.T,'moment',u,3)} (every crane start and stop): θ_s = ${s.twist.toFixed(4)} rad, the locating girder bearing moving θ_s·e = ${L(Math.abs(s.slip))} along the runway${brace>0?`, in series with the bracing's crane-level displacement ${L(brace)}`:''}: ${L(move)} against the runway-level limit ${L(limit)} (AIST TR-13 §5.5). The rail shifts e(1 − cos θ_s) = ${L(s.lateral)} across the runway, added to the column drift; the movement θ_s·e is added to the sliding bearing travel and girder end gap demands.${accepted?` Engineer of record's note: ${accepted}.`:''} ${remedy}`}];
}
