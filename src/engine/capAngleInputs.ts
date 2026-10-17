import {z} from 'zod';
import {columnStiffenerSchema} from './columnStiffenerInputs';

const pos=z.number().finite().positive();
const grade=z.enum(['A325','A490']);
/**
 * Cap tieback angle (AISC DG7 top-flange tie "top flange connected directly to column"): a catalog angle bolted
 * through the column-side flange of the cap channel, its long leg level with the top of the cap and pointing to the
 * column; a tie plate lapped on that leg and shop welded to a vertical end plate, which is bolted through shims to
 * the column flange, one bolt above and one below the tie plate. Canonical units mm, N, MPa.
 *
 * Positions: across the runway from the girder web centerline toward the column (the cap angle back lies on the
 * outer face of the channel flange); vertical from the top of the cap; along the runway from the tie centerline.
 */
export const capAngleSchema=z.object({
 /** AISC L shape: the long leg is horizontal toward the column, the short leg against the channel flange. */
 shape:z.string().min(1).max(35),
 /** Angle length along the runway. */
 length:pos,
 /** Girder end to the tie centerline, along the runway. */
 setback:pos,
 /** Bolts through the channel flange and the angle's short leg: gauge down from the top of the cap, pitch along the runway. */
 capBolts:z.object({diameter:pos,grade,gauge:pos,pitch:pos}),
 /** Travel each way along the runway in the horizontal long slots of the angle. */
 travel:pos,
 /** Cap bolts pretensioned against steel sleeves through the slots (the angle is not clamped), or snug-tight, which is kept for old projects only and reported as not permitted (AIST TR-13 §5.14). */
 mode:z.enum(['sleeved','snug-tight']),
 sleeveWall:pos,sleeveClearance:pos,
 /** Plate washers over the angle slots, under the bolt heads. */
 washerThickness:pos,
 /** Tie plate: thickness and width along the runway. */
 plateThickness:pos,plateWidth:pos,
 /** Lap bolts (vertical) through the tie plate and the angle's long leg: gauge from the back of the short leg, pitch along
  * the runway, edge from the bolt to the lap end of the tie plate. Short slots across the runway in the tie plate. */
 lapBolts:z.object({diameter:pos,grade,gauge:pos,pitch:pos,edge:pos,surface:z.enum(['A','B'])}),
 /** Vertical end plate, centered on the tie plate: thickness, height and width along the runway. */
 endPlate:z.object({thickness:pos,height:pos,width:pos}),
 /** Column bolts, one above and one below the tie plate at this gauge from its centerline. */
 columnBolts:z.object({diameter:pos,grade,gauge:pos}),
 /** Shim pack between the end plate and the column flange: fit-up range 0 to this thickness, half of it nominal. */
 shimMax:pos,
 /** Shop fillets, end plate to tie plate, both faces of the tie plate. */
 weldSize:pos,
 /** Column stiffener (continuity plate) at the tie level, inside the column on the tie's side of the web: the column
  * stiffener input of the bracket stiffeners (thickness, width, clip, length, fillets). Provide it (enabled) when the
  * column flange cannot take the bolt pull; the levels and offsets of the bracket pairs do not apply. */
 stiffener:columnStiffenerSchema.optional(),
 /** Girder web centerline to the column face where no bracket is designed here. */
 columnFace:pos.optional(),
 /** Vertical release at the column: the column bolts pass through vertical long slots in the end plate, pretensioned
  * against steel sleeves (sleeveWall, sleeveClearance) under plate washers, so the end plate slides with the girder's
  * vertical movement at the tie and the tie plate is not bent by it; `travel` each way. */
 columnRelease:z.object({travel:pos}).optional()
});
export type CapAngleInput=z.infer<typeof capAngleSchema>;
const inch=25.4;
/**
 * A light-crane starting point: L4X4X1/2 with 5/8 in A325 bolts in sleeved slots on a 15 in channel, a 1/2 in tie plate
 * and a 5/8 in end plate. Two ties fit side by side on a W14 column flange with a 1 in girder end gap.
 */
export const defaultCapAngle:CapAngleInput={shape:'L4X4X1/2',length:6.5*inch,setback:3.5*inch,
 capBolts:{diameter:.625*inch,grade:'A325',gauge:2.25*inch,pitch:3.25*inch},travel:.375*inch,mode:'sleeved',sleeveWall:.25*inch,sleeveClearance:inch/16,washerThickness:.3125*inch,
 plateThickness:.5*inch,plateWidth:5*inch,
 lapBolts:{diameter:.625*inch,grade:'A325',gauge:2.5*inch,pitch:3*inch,edge:1.25*inch,surface:'B'},
 endPlate:{thickness:.625*inch,height:6*inch,width:5*inch},
 columnBolts:{diameter:.625*inch,grade:'A325',gauge:2*inch},
 shimMax:.25*inch,weldSize:.25*inch};
