/**
 * Twist of a column at the girder seat (a bracket seat on a new column, or the step of a stepped column) under the
 * longitudinal crane force applied off its shear center, while the crane-level strut and bracing hold the column at its
 * centerline: designed limits instead of an engineer-of-record acceptance item. One basis and one wording for every
 * column that twists (existingColumn.ts: column-twist-rotation and column-twist; steppedColumn.ts: column-lower-twist and
 * column-lower-twist-movement). Canonical units N, mm, rad.
 *
 * Mechanics. The column twists about its vertical axis: the seat, offset e from the shear center, moves θe ALONG the
 * runway and only e(1 − cos θ) ACROSS it.
 * - Factored twist θ_u ≤ 0.02 rad: the column analysis is first order (small rotations); the girder reaction R, shifted
 *   e·θ along the runway by the twist, adds a weak-axis moment R·e·θ it leaves out, which θ ≤ 0.02 keeps within 2% of
 *   the eccentric moment R·e the strong-axis H1 carries (twistRotationLimit).
 * - Service movement of the girder line along the runway, θ_s e plus the crane-level bracing displacement in series,
 *   within the runway-level displacement limit min(H/400, 2 in) (AIST TR-13 §5.5, the column's drift limit).
 * - The rail's shift across the runway e(1 − cos θ_s) is added to the column's lateral displacement (column-drift).
 * - On a column designed here, the service movement θ_s e is a slip of the locating girder against its sliding supports,
 *   the adjacent girder and the top-flange tie at every crane start and stop: it is added to the slot travel, end gap,
 *   rail end gap and tie movement demands (twistSlip; simpleSupportChecks, endBearingChecks, railChecks, tieMovements),
 *   and the factored traction's movement (1.6 or 1.0 θ_s e) to the tie's static movement (twistMovement).
 */
import type {CheckResult,ProjectInput} from './types';
import type {ExistingColumnResult} from './existingColumn';
import {format} from './units';
import {latexNumber} from './math';

/** Largest factored twist at the seat or step (rad): the P-θ (small-rotation) basis of every column twist check. */
export const twistRotationLimit=.02;
type Torsion=NonNullable<ExistingColumnResult['torsion']>;

/**
 * Service bearing movement along the runway from the column twist (each crane start and stop), for the movement checks:
 * a column whose twist is limited here (a column designed here, checked without the existing-building review; the
 * reviewed existing and stepped columns keep their own torsion checks and paths).
 */
export const twistSlip=(r:ExistingColumnResult|undefined)=>r?.torsion&&!r.support?Math.abs(r.torsion.service.slip):0;
/**
 * The girder's movement along the runway at the seat from the column twist, as twistSlip: service (the single-crane
 * traction, each crane start and stop) and factored with the tie force it acts with. The tie's governing combinations
 * carry the crane traction with the side thrust as live load (ASCE 7 with L: 1.6 LRFD, 1.0 ASD, on the linear twist);
 * the TR-13 crane stop, which gives the largest torque, acts without side thrust, so it is not added to them.
 */
export const twistMovement=(r:ExistingColumnResult|undefined,method:ProjectInput['method']='LRFD')=>r?.torsion&&!r.support?{service:Math.abs(r.torsion.service.slip),factored:(method==='LRFD'?1.6:1)*Math.abs(r.torsion.service.slip)}:{service:0,factored:0};
/** The rail's shift across the runway from the service twist, e(1 − cos θ_s), added to the column's lateral displacement. */
export const twistShift=(t:Torsion|undefined)=>t?Math.abs(t.service.lateral):0;

/** The twist results the checks read: factored and service twist at the girder line, the torques and the offset. */
export type TwistResult=Pick<Torsion,'twist'|'slip'|'T'|'offset'|'service'>&{case?:{id:string}};
export interface TwistCheckOptions {
 /** Group and title prefix ('New column', 'Lower shaft'). */
 label:string;
 /** Check ids: the factored (small-rotation) and the service (movement) check. */
 ids?:{rotation:string;movement:string};
 /** Where the girder bears: a bracket seat or a column step. */
 at?:'seat'|'step';
 /** The runway-level displacement limit min(H/400, 2 in) and the bracing's crane-level displacement in series. */
 limit:number;braceMove?:number;
 /** How the twist is computed (one sentence), and what holds the girder line (the share the column keeps), if anything. */
 model:string;path?:string;
 /** Whether the service movement is added to the slot travel, end gap and tie movement demands (a column designed here). */
 movementUsed?:boolean;
 /** Engineer-of-record note entered with the project. */
 accepted?:string;
 /** The fix when a limit is exceeded. */
 remedy?:string;
 refs?:string[];
}
const defaultRemedy='Remedy when exceeded: remove the torque (column caps on the column axis, a crane-level strut on the girder line), or hold the column against the twist (a torsion brace, a stiffer strut moment-connected in plan), or a torsionally stiffer column.';

/**
 * The twist checks of a column at the girder line: the factored twist within the small-rotation (P-θ) limit, and the
 * service movement along the runway (in series with the bracing's crane-level displacement) within the column's
 * runway-level displacement limit.
 */
export function columnTwistChecks(p:ProjectInput,t:TwistResult,o:TwistCheckOptions):CheckResult[]{
 const u=p.units,L=(v:number)=>format(v,'length',u,3),M=(v:number)=>format(v,'moment',u,3),s=t.service,brace=o.braceMove??0,move=Math.abs(s.slip)+brace;
 const ids=o.ids??{rotation:'column-twist-rotation',movement:'column-twist'},at=o.at??'seat',refs=o.refs??[],remedy=o.remedy??defaultRemedy,path=o.path?` ${o.path}`:'';
 const status=(d:number,c:number):CheckResult['status']=>Number.isFinite(d)&&d<=c*(1+1e-9)?'pass':'fail';
 const sub=(d:number,c:number)=>`\\frac{${latexNumber(d)}}{${latexNumber(c)}}=${(d/c).toFixed(4)}`;
 const rotation=Math.abs(t.twist);
 return [
  {id:ids.rotation,group:o.label,title:`${o.label} · twist at the ${at} under the factored torque (small-rotation limit)`,status:status(rotation,twistRotationLimit),demand:rotation,capacity:twistRotationLimit,utilization:rotation/twistRotationLimit,quantity:'ratio',
   equation:'\\theta_u=\\frac{T_u}{K_\\theta}\\le0.02\\ \\mathrm{rad}',substitution:sub(rotation,twistRotationLimit),referenceIds:['tr13-column-path',...refs],...(t.case?{caseId:t.case.id}:{}),
   note:`${o.model}${path} Factored twist θ_u = ${rotation.toFixed(4)} rad under the largest torque ${M(t.T)}${t.case?` (${t.case.id})`:''} at the offset e = ${L(t.offset)}: the girder bearing moves ${L(Math.abs(t.slip))} along the runway. Basis (mechanics): the column analysis is first order (small rotations); the girder reaction R, shifted e·θ along the runway by the twist, adds a weak-axis moment R·e·θ it leaves out, which θ ≤ ${twistRotationLimit} rad keeps within ${Math.round(twistRotationLimit*100)}% of the eccentric moment R·e the strong-axis H1 carries. A larger twist is not admissible. ${remedy}`},
  {id:ids.movement,group:o.label,title:`${o.label} twist · girder movement along the runway at the ${at} (service)`,status:status(move,o.limit),demand:move,capacity:o.limit,utilization:move/o.limit,quantity:'length',
   equation:'\\Delta=\\theta_se+\\Delta_{brace}\\le\\min(H/400,\\;2\\,\\mathrm{in})',substitution:sub(move,o.limit),referenceIds:['tr13-service','tr13-column-path',...refs],
   note:`${o.model}${path} Unfactored single-crane traction at the girder line, torque ${M(s.T)} (every crane start and stop): θ_s = ${Math.abs(s.twist).toFixed(4)} rad, the locating girder bearing moving θ_s·e = ${L(Math.abs(s.slip))} along the runway${brace>0?`, in series with the bracing's crane-level displacement ${L(brace)} (brace-drift)`:''}: ${L(move)} against the runway-level limit ${L(o.limit)} (AIST TR-13 §5.5, H/400 or 2 in). The rail shifts e(1 − cos θ_s) = ${L(Math.abs(s.lateral))} across the runway, added to the column drift (column-drift).${o.movementUsed===false?'':' The movement θ_s·e is added to the sliding bearing travel, the girder end gaps, the rail end gap at the stops and the tie movement (the factored traction\'s to the tie\'s static movement).'}${o.accepted?` Engineer of record's note: ${o.accepted}.`:''} ${remedy}`}];
}
