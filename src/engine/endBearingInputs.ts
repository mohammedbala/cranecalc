import {z} from 'zod';
import type {ProjectInput} from './types';

const pos=z.number().finite().positive();
/**
 * Bolted girder bearing: four bolts through the girder bottom flange, the
 * bearing plate and the bracket seat, in two rows at the ends of the bearing
 * plate. On independent simple spans the left end of each bay locates with
 * standard holes and the right end slides in long slots in the girder flange,
 * covered by plate washers. A continuous girder locates at one support and
 * slides at all the others. Canonical units mm, N, MPa.
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
/** Active bolted bearing: simple or continuous girders with the input enabled. */
export const activeEndBearing=(p:ProjectInput)=>p.details?.endBearing?.enabled?p.details.endBearing:undefined;
const grids=(p:ProjectInput)=>{let x=0;return [0,...p.spans.map(v=>x+=v)];};
/** Locating support of a continuous girder, as a grid index from 0: the support nearest mid-length halves the thermal travel. */
export function locatingSupport(p:ProjectInput){
 const g=grids(p),mid=g.at(-1)!/2;
 return g.reduce((best,x,i)=>Math.abs(x-mid)<Math.abs(g[best]-mid)-1e-6?i:best,0);
}
/**
 * Bolted bearings of a continuous girder, one per support: the bearing plate centered on an interior grid and
 * starting at the girder end at a runway end. Travel is the distance from the locating support.
 */
export function continuousBearings(p:ProjectInput){
 if(p.system!=='continuous')return [];
 const g=grids(p),L=g.at(-1)!,length=p.details?.bearing.length??254,locating=locatingSupport(p);
 return g.map((station,i)=>{const start=i===0?0:i===g.length-1?L-length:station-length/2;
  return {grid:i+1,station,start,finish:start+length,center:start+length/2,role:i===locating?'LOCATING' as const:'SLIDING' as const,distance:Math.abs(station-g[locating])};});
}
