import {z} from 'zod';
import type {ProjectInput} from './types';

const pos=z.number().finite().positive();
/**
 * Bolted girder end bearing for independent simple spans: four bolts through
 * the girder bottom flange, the bearing plate and the bracket seat, in two rows
 * at the ends of the bearing plate. The left end of each bay locates with
 * standard holes; the right end slides in long slots in the girder flange,
 * covered by plate washers. Canonical units mm, N, MPa.
 */
export const endBearingSchema=z.object({
 enabled:z.boolean(),
 /** Gauge across the runway, centered on the web; edge is from each bearing plate end along the runway. */
 bolts:z.object({diameter:pos,grade:z.enum(['A325','A490']),gauge:pos,edge:pos}),
 washerThickness:pos,
 /** Sliding-end bolts: pretensioned against steel sleeves that leave the flange unclamped (default), or snug-tight with jam nuts (AISC J1.10(c): cranes of 5 tons or less). */
 sliding:z.enum(['sleeved','snug-tight']).optional(),
 /** Sleeve wall around the standard-hole bore, and its length beyond the flange thickness. */
 sleeveWall:pos.optional(),sleeveClearance:pos.optional()
});
export type EndBearingInput=z.infer<typeof endBearingSchema>;
const inch=25.4;
export const defaultEndBearing:EndBearingInput={enabled:false,bolts:{diameter:.75*inch,grade:'A325',gauge:5.5*inch,edge:2*inch},washerThickness:5/16*inch};
/** Sliding-end bolt detail with defaults. */
export const slidingBolts=(e:EndBearingInput)=>({mode:e.sliding??'sleeved',wall:e.sleeveWall??5/16*inch,clearance:e.sleeveClearance??inch/16});
/** Drawing phrase for the sliding-end bolts. */
export const slidingPhrase=(e:EndBearingInput)=>slidingBolts(e).mode==='sleeved'?'BOLTS PRETENSIONED AGAINST STEEL SLEEVES':'SNUG-TIGHT BOLTS WITH JAM NUTS';
/** Active bolted end bearing: independent simple spans with the input enabled. */
export const activeEndBearing=(p:ProjectInput)=>p.system==='simple'&&p.details?.endBearing?.enabled?p.details.endBearing:undefined;
