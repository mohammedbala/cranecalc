/**
 * Setting and fit-up tolerances used in the fit checks, mm.
 * - Bearing setting: AIST TR-13 §5.18 lists the seat plan position within ±1/8 in, so a girder bearing may sit 1/8 in
 *   off its theoretical position on the seat (UNVERIFIED: TR-13 text not held; value as given in the review).
 * - Field-drilled holes: holes drilled in the field to match a shop-drilled part may need reaming to an oversized hole
 *   (AISC 360-16 Table J3.3) where they do not line up; the edge distance of the shop part then needs the Table J3.5
 *   increment C2 for oversized holes (1/16 in up to 7/8 in bolts, 1/8 in for 1 in, 1/8 in above).
 */
const inch=25.4;
export const seatSettingTolerance=inch/8;
/** AISC 360-16 Table J3.5 C2 for oversized holes. */
export function oversizedEdgeIncrement(db:number){
 return db<=7/8*inch+1e-6?inch/16:inch/8;
}
