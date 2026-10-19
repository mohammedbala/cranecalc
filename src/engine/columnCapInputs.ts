import {z} from 'zod';
import type {ProjectInput} from './types';

const pos=z.number().finite().positive();
/**
 * Direct column-cap bearing for new freestanding runway columns: the AIST TR-13 §5.9.2 alternative to column
 * brackets where the total bracket reactions exceed 50 kip. The girder sits centered over the column on a cap
 * plate welded all around to the milled column top, and its bolted end bearings bolt through the cap plate.
 * Where a girder bearing stiffener line is not over the column web, a cap stiffener between the column
 * flanges carries that girder end reaction from the cap into the flanges. Canonical units mm.
 */
export const columnCapSchema=z.object({
 enabled:z.boolean(),
 /** Cap plate, centered on the column: length along the runway, width across it and thickness. */
 plate:z.object({length:pos,width:pos,thickness:pos}),
 /** Shop fillet all around the column profile (flanges both faces, web both sides), cap plate to column; with a CJP joint, the reinforcing fillet. */
 weld:pos,
 /**
  * Cap plate to column joint: all-around fillets (blank), or CJP groove welds of the column flanges and web to the cap
  * with reinforcing fillets of size `weld` (heavy cranes whose cap fillets cannot pass fatigue; columnCapSizing).
  */
 joint:z.enum(['fillet','cjp']).optional(),
 /** Cap stiffeners between the column flanges, under each girder bearing stiffener line off the column web. */
 stiffener:z.object({thickness:pos,height:pos,weld:pos})
});
export type ColumnCapInput=z.infer<typeof columnCapSchema>;
/** CJP groove welds of the column to the cap (with reinforcing fillets) rather than all-around fillets. */
export const capCjp=(c:ColumnCapInput|undefined)=>c?.joint==='cjp';
const inch=25.4;
export const defaultColumnCap:ColumnCapInput={enabled:false,plate:{length:26*inch,width:16*inch,thickness:1.5*inch},weld:5/16*inch,stiffener:{thickness:.75*inch,height:8*inch,weld:5/16*inch}};
/** The column cap when it carries the girders: enabled on new freestanding columns with runway details. */
export const activeColumnCap=(p:ProjectInput)=>{const c=p.columnCap,col=p.existingColumn;return c?.enabled&&col?.enabled&&col.isNew&&p.details?c:undefined;};
