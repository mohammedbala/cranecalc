import {z} from 'zod';
import {existingColumnSchema} from './existingColumnInputs';
import type {ProjectInput} from './types';
import type {SupportReactionSet} from './supportReactions';

const pos=z.number().finite().positive(),nonnegative=z.number().finite().nonnegative();
/**
 * A separate crane column tied to an existing building column (AISC Design Guide 7, the separate crane column of the
 * crane-building column arrangements; AIST TR-13 §5.9.2 direct column bearing over the bracket limit; clauses to be
 * verified, references 'dg7-columns', 'aisc-app6'). Canonical units mm, N, MPa.
 *
 * Model (plan §1A):
 * - The crane column is `p.existingColumn` with `isNew: true` and the girder on its column cap (`p.columnCap`). It
 *   carries the girder vertical reactions and their small eccentricity (rail eccentricity, bearing kern) only: the side
 *   thrust Css leaves through the girder top-flange tie and the column tie to the building column (`tiedToBuilding`).
 * - The column tie at cap level braces the crane column top across the runway (AISC 360-16 Appendix 6 §6.2.2 nodal
 *   brace: the building column in series with the tie) and carries the girder bottom-flange reaction; its bolts sit in
 *   vertical long slots at the building column so the two columns shorten independently.
 * - `building` is the surveyed building column the ties brace to, entered as an existing column (shape, plates,
 *   height, existing load effects, frame, service and site seismic data, field welding). It takes lateral loads only from
 *   the runway: the tie forces at their elevations plus its existing effects.
 */
export const columnTieSchema=z.object({
 /** Tie plate (one plate, or the total of a pair) across the runway between the columns: thickness, depth (vertical) and material. */
 plate:z.object({thickness:pos,width:pos,Fy:pos,Fu:pos}),
 /** Bolts at the building-column end, in vertical long slots; pitch and edge distance along the slot line. */
 bolts:z.object({count:z.number().int().min(2).max(8),diameter:pos,grade:z.enum(['A325','A490']),pitch:pos,edge:pos}),
 /** Vertical long slot in the tie at the building column: length along the column and width. Travel = length − bolt diameter. */
 slot:z.object({length:pos,width:pos}),
 /** Tie elevation above the crane-column base; blank: at the column cap (crane column top). */
 elevation:pos.optional()
});
export type ColumnTieInput=z.infer<typeof columnTieSchema>;
export const craneColumnSchema=z.object({
 enabled:z.boolean(),
 /** Across the runway: crane column centerline to building column centerline, positive away from the crane span. */
 offset:pos,
 /** The surveyed building column (an existing column: `isNew` blank or false). Its `seatElevation` is the girder tie elevation. */
 building:existingColumnSchema,
 columnTie:columnTieSchema,
 /** Crane column base: pinned (four-rod base, default) or fixed. It sets `existingColumn.strong.base` / `weak.base` (the validator requires they agree). */
 base:z.enum(['pinned','fixed']),
 /** Erection and fit-up allowance added to the computed differential shortening in the slot travel check, mm; blank: 1/4 in. */
 tolerance:nonnegative.optional(),
 source:z.string().max(300)
});
export type CraneColumnInput=z.infer<typeof craneColumnSchema>;

/**
 * The runway is on separate crane columns tied to the building: the crane column (`p.existingColumn`) takes no side
 * thrust across the runway (the ties deliver it to the building column), and its across-runway seismic force goes
 * to the building's lateral system with the building column (acrossRunwaySeismic). A projection of the building
 * column into `p.existingColumn` (WP-1 buildingColumnProject) must drop `craneColumn` so that column keeps the side thrust.
 */
export const tiedToBuilding=(p:ProjectInput)=>!!(p.craneColumn?.enabled&&p.existingColumn?.enabled);
/** The reactions the crane column itself carries: the side thrust removed where the runway is tied to the building. */
export const craneColumnReactions=(p:ProjectInput,r:SupportReactionSet):SupportReactionSet=>tiedToBuilding(p)?{...r,supports:r.supports.map(s=>({...s,Css:0}))}:r;
/**
 * The column the girder top-flange tie lands on (its receiving flange, web and height for the tie's column-end checks):
 * the building column where the runway is tied to the building, its girder seat taken at the crane column's (one datum,
 * the crane-column base), else the supporting column itself.
 */
export const tieColumn=(p:ProjectInput)=>tiedToBuilding(p)?{...p.craneColumn!.building,enabled:true,isNew:false,seatElevation:p.existingColumn!.seatElevation}:p.existingColumn;
