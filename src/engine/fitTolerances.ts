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
/**
 * Shop fabrication tolerance on the location of drilled holes and welded parts (stiffeners, plates) measured from a
 * common reference, mm: 1/16 in, after the AISC Code of Standard Practice §6.4 fabrication tolerances (clause to be
 * verified). Added to every tool clearance (wrenchClearance) and to the width of a plate fitted within a flange
 * (the end stop base plate), so a clearance or fit at its limit on paper still holds with the shop variation.
 */
export const fabricationTolerance=inch/16;
/** The stated basis of the fabrication tolerance, as the check notes print it. */
export const fabricationToleranceNote='Includes a 1/16 in fabrication tolerance on the location of holes and welded parts (AISC Code of Standard Practice §6.4, clause to be verified).';
/**
 * Clearance margin kept between a part that moves with the sliding bearing (the plate washer over a sleeved slot) and
 * the fixed part it travels toward (the bearing stiffener and its fillet), at full travel, mm: 1/16 in, the shop
 * location tolerance of the drilled holes and fitted stiffeners measured from the same girder end, so shop variation
 * cannot turn the clearance into binding. (1/8 in lengthened every bearing plate by 1/4 in on the 1/4 in grid and moved
 * stiffener ties off narrow column flanges.)
 */
export const slidingClearance=inch/16;
/** AISC 360-16 Table J3.5 C2 for oversized holes. */
export function oversizedEdgeIncrement(db:number){
 return db<=7/8*inch+1e-6?inch/16:inch/8;
}
