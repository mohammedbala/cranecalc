import {z} from 'zod';
import type {ProjectInput} from './types';
import {runwayEnds} from './continuation';

const pos=z.number().finite().positive(),nn=z.number().finite().nonnegative();
/**
 * Bolted runway end stop on the girder top surface at each end of each
 * runway: a base plate near the girder end, a face plate struck by the crane
 * bumper and two back stiffeners. Four bolts in two rows straddle the
 * stiffeners. Canonical units mm, N, MPa.
 */
export const endStopSchema=z.object({
 enabled:z.boolean(),
 /** Crane bumper centerline above top of rail, and its contact diameter (crane supplier). */
 bumperHeight:nn,bumperDiameter:pos,
 /** Girder end to back edge of the base plate; clear gap from rail end to the stop face. */
 setback:nn,railGap:pos,
 base:z.object({length:pos,width:pos,thickness:pos}),
 /** Face plate height above the base plate. */
 face:z.object({thickness:pos,height:pos}),
 /** Two stiffeners behind the face plate; spacing is center to center across the runway. */
 stiffener:z.object({thickness:pos,length:pos,spacing:pos}),
 /**
  * Front bolts sit frontClear (bolt C/L to the back face of the face plate) behind the face plate; back bolts sit
  * edge from the back of the base plate. The gauge straddles the stiffeners: heads clear the face plate and
  * stiffener weld toes by the socket clearance.
  */
 bolts:z.object({diameter:pos,grade:z.enum(['A325','A490']),gauge:pos,frontClear:pos,edge:pos}),
 weldSize:pos,
 source:z.string().max(300)
});
export type EndStopInput=z.infer<typeof endStopSchema>;
const inch=25.4;
// Illustrative 3/4 in A325 stop for a light crane; size it for the supplier bumper force. The 7 in gauge and the
// front bolts 1 3/4 in behind the face plate keep the heads 1 1/4 in (socket clearance) clear of the 5/16 fillet
// toes at the 3 in stiffeners and the face plate; the 10 in plates keep 1 1/2 in edge distance.
export const defaultEndStop:EndStopInput={enabled:false,bumperHeight:6*inch,bumperDiameter:6*inch,setback:.5*inch,railGap:1*inch,
 base:{length:9*inch,width:10*inch,thickness:1*inch},face:{thickness:1*inch,height:14*inch},stiffener:{thickness:.75*inch,length:7*inch,spacing:3*inch},
 bolts:{diameter:.75*inch,grade:'A325',gauge:7*inch,frontClear:1.75*inch,edge:1.5*inch},weldSize:5/16*inch,source:''};


/** A crane whose stop force is not taken by a building-mounted stop needs girder-mounted stops. */
export const needsGirderStops=(p:ProjectInput)=>p.cranes.some(c=>!c.design?.bumperBypassesGirder);
/** Active girder-mounted stop input, if the project designs one. */
export const activeEndStop=(p:ProjectInput)=>p.details?.endStop?.enabled&&needsGirderStops(p)&&runwayEnds(p).length?p.details.endStop:undefined;
/** Modeled ends that carry a girder-mounted stop: true runway ends, not ends continued by an existing bay. */
export const stopEnds=(p:ProjectInput)=>activeEndStop(p)?runwayEnds(p):[];
/** Where the stops go, for notes: both ends, or the one true end with its grid. */
export function stopLocation(p:ProjectInput){
 const ends=runwayEnds(p);
 return ends.length===2?'both ends of both runways':`the ${ends[0]} end (grid ${ends[0]==='left'?1:p.spans.length+1}) of both runways; the runway continues beyond the other end`;
}
/** Front fillet room in front of the face plate. */
export const stopLip=(e:EndStopInput)=>e.weldSize+6.35;
/** Back and front bolt rows from the girder end: back bolts edge from the base plate back, front bolts frontClear behind the face. */
export const stopBoltRows=(e:EndStopInput)=>[e.setback+e.bolts.edge,e.setback+e.base.length-stopLip(e)-e.face.thickness-e.bolts.frontClear] as const;
/** Rail end distance from the runway end: the rail stops railGap short of the stop face. */
export const stopRailEnd=(e:EndStopInput)=>e.setback+e.base.length-stopLip(e)+e.railGap;
