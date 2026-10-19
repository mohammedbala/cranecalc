import {z} from 'zod';
import type {ProjectInput} from './types';

const pos=z.number().finite().positive(),num=z.number().finite();
/** Signed existing load effect in the upper shaft at the step: axial (compression positive), strong- and weak-axis moments, strong-axis shear. */
const effect=z.object({P:num,Mx:num,My:num,V:num});
/**
 * The step of an existing stepped building column that carries the runway girder (mill-building runways; AISC Design
 * Guide 7 stepped crane columns, AISC 360-16 Appendix 7 §7.2 effective length from a buckling analysis; clauses to be
 * verified, references 'dg7-columns', 'aisc-app7'). Canonical units mm, N, MPa. Attached as `existingColumn.step`.
 *
 * Geometry (plan §1B; stepGeometry in steppedColumn.ts): `existingColumn` (shape, d, bf, tf, tw, Fy, Fu) is the LOWER
 * shaft, its `height` the column top and its `seatElevation` the step: the top of the step cap, on which the girder bears.
 * Across the runway x is measured from the lower-shaft centroid, positive toward the crane span. The girder web sits at
 * x = girderOffset (by default d_l/2 − t_fl/2, over the lower shaft's crane-side flange); the upper shaft's centroid at
 * x = −offset (offset = (d_l − d_u)/2 with the outer flanges flush), so the top-flange tie runs from the girder to
 * the upper shaft's inner flange, a face distance d_l − d_u − t_fl/2 from the girder web when flush.
 *
 * Sign convention of `existingUpper` (signed superposition at the step): Mx is positive when it bends the upper shaft just
 * above the step in the same sense as the crane reaction moment R·girderOffset does there (steppedColumn.ts takes that
 * sense from the column model), so a roof moment that relieves the crane moment in the upper shaft is entered negative.
 * The gravity effects (D, L, Lr, S, R) are superposed with their sign and taken constant over the upper shaft (no
 * transverse load between the step and the top); W and E reverse and are added as magnitudes. `existingColumn.existing` stays the LOWER shaft's effects at its
 * governing section, added as magnitudes as for any existing column.
 */
export const stepSchema=z.object({
 /** Upper shaft: catalog W shape (blank: the plates), plates and material. */
 upper:z.object({shape:z.string().max(30),d:pos,bf:pos,tf:pos,tw:pos,Fy:pos,Fu:pos}),
 /** Upper-shaft centroid outboard of the lower-shaft centroid (away from the crane span); (d_l − d_u)/2 with flush outer flanges. */
 offset:num,
 /** Girder web centerline from the lower-shaft centroid toward the crane span; d_l/2 − t_fl/2 over the crane-side flange. */
 girderOffset:num,
 /** Existing load effects in the upper shaft just above the step, by load type, signed (see the convention above). */
 existingUpper:z.object({D:effect,L:effect,Lr:effect,S:effect,R:effect,W:effect,E:effect}),
 /** Existing step cap plate (survey): thickness, width across the runway, length along it. Its top is at existingColumn.seatElevation. */
 cap:z.object({thickness:pos,width:pos,length:pos}),
 /** Step stiffener (diaphragm) in the lower shaft under the upper shaft's inner flange, where provided or added. */
 stiffener:z.object({thickness:pos,width:pos,weld:pos}).optional(),
 /** Weak-axis effective length of the upper shaft (girts or the step strut); blank: existingColumn.Lcy, which is the lower shaft's. */
 upperLcy:pos.optional(),
 /** Surveyed leg of the existing step welds (the cap to the lower shaft, the upper shaft to the cap); blank: not surveyed, the step fatigue check reports the required leg as an open item. */
 capWeld:pos.optional(),
 /** Built-up or laced shafts are not modeled (an unsupported check). */
 construction:z.enum(['rolled','built-up','laced']).optional(),
 source:z.string().max(300),confirmed:z.boolean()
});
export type StepInput=z.infer<typeof stepSchema>;
/** The step when the girder bears on it: an enabled existing (not new) column with `step` entered. */
export const activeStep=(p:ProjectInput)=>{const c=p.existingColumn;return c?.enabled&&!c.isNew&&c.step?c.step:undefined;};
/**
 * The column the top-flange tie lands on: the upper shaft's inner flange on a stepped column (its plates and material),
 * else undefined (the existing column itself).
 */
export const stepTieColumn=(p:ProjectInput)=>{const s=activeStep(p);return s?{...s.upper,isNew:false,source:'upper shaft of the stepped column'}:undefined;};
