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
 washerThickness:pos
});
export type EndBearingInput=z.infer<typeof endBearingSchema>;
const inch=25.4;
export const defaultEndBearing:EndBearingInput={enabled:false,bolts:{diameter:.75*inch,grade:'A325',gauge:5.5*inch,edge:1.75*inch},washerThickness:5/16*inch};
/** Active bolted end bearing: independent simple spans with the input enabled. */
export const activeEndBearing=(p:ProjectInput)=>p.system==='simple'&&p.details?.endBearing?.enabled?p.details.endBearing:undefined;
