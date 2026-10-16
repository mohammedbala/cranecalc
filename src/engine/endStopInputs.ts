import {z} from 'zod';
import type {ProjectInput} from './types';
import {runwayEnds} from './continuation';
import {snapQuarter} from './quarterInch';

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
 /** Girder end to back edge of the base plate; clear gap from the rail end to the nearest stop steel (the base plate edge). */
 setback:nn,railGap:pos,
 base:z.object({length:pos,width:pos,thickness:pos}),
 /** Face plate height above the base plate. */
 face:z.object({thickness:pos,height:pos}),
 /**
  * Stiffeners behind the face plate; spacing is center to center across the runway. arrangement: 'inner' (default, two
  * stiffeners between the bolt lines), 'outer' (two stiffeners at the base plate edges, the bolts between them) or
  * 'center' (one stiffener on the stop centerline, a bolt line each side).
  */
 stiffener:z.object({thickness:pos,length:pos,spacing:pos,arrangement:z.enum(['inner','outer','center']).optional()}),
 /**
  * Front bolts sit frontClear (bolt C/L to the back face of the face plate) behind the face plate; back bolts sit
  * edge from the back of the base plate. The gauge straddles the stiffeners: heads clear the face plate and
  * stiffener weld toes by the socket clearance.
  */
 bolts:z.object({diameter:pos,grade:z.enum(['A325','A490']),gauge:pos,frontClear:pos,edge:pos,
  /** Bolt rows along the girder, two bolts each: 2 (default, back and front) or 3 (a middle row halfway between). */
  rows:z.number().int().min(2).max(3).optional()}),
 weldSize:pos,
 source:z.string().max(300)
});
export type EndStopInput=z.infer<typeof endStopSchema>;
const inch=25.4;
// Illustrative 3/4 in A325 stop for a light crane; size it for the supplier bumper force. The 7 in gauge and the
// front bolts 1 3/4 in behind the face plate keep the heads 1 1/4 in (socket clearance) clear of the 5/16 fillet
// toes at the 3 in stiffeners and the face plate; the 10 in plates keep 1 1/2 in edge distance.
export const defaultEndStop:EndStopInput={enabled:false,bumperHeight:6*inch,bumperDiameter:6*inch,setback:.5*inch,railGap:1*inch,
 base:{length:9*inch,width:10*inch,thickness:1*inch},face:{thickness:1*inch,height:15*inch},stiffener:{thickness:.75*inch,length:7*inch,spacing:3*inch},
 bolts:{diameter:.75*inch,grade:'A325',gauge:7*inch,frontClear:1.75*inch,edge:1.5*inch},weldSize:5/16*inch,source:''};


/** A crane whose stop force is not taken by a building-mounted stop needs girder-mounted stops. */
export const needsGirderStops=(p:ProjectInput)=>p.cranes.some(c=>!c.design?.bumperBypassesGirder);
/**
 * Where each crane's stop force goes, from the one stop-location input (crane design `bumperBypassesGirder`):
 * girder-mounted stops (the force enters the girder and leaves through its locating supports) or building-mounted
 * stops (the girder is bypassed). Every report section and export uses this text.
 */
export function bumperPath(p:ProjectInput,c:ProjectInput['cranes'][number]){
 if(c.design?.bumperBypassesGirder)return {location:'building' as const,label:'Building-mounted stop; girder bypassed',text:'Direct to a building-mounted stop; the girder is bypassed. Stop, building and foundation resistance are outside this calculation.'};
 const designed=!!activeEndStop(p);
 return {location:'girder' as const,label:'Girder-mounted stop',text:`Girder-mounted end stops${designed?` at ${stopLocation(p)} (designed in this calculation)`:' (not designed in this calculation)'}: the bumper force enters the girder and is carried by the girder axial force to its locating supports and on to the longitudinal load path of the building. It is included in the AIST stop combinations of the girder and support checks; building and foundation resistance beyond the checked members are outside this calculation.`};
}
/** Active girder-mounted stop input, if the project designs one. */
export const activeEndStop=(p:ProjectInput)=>p.details?.endStop?.enabled&&needsGirderStops(p)&&runwayEnds(p).length?p.details.endStop:undefined;
/** Modeled ends that carry a girder-mounted stop: true runway ends, not ends continued by an existing bay. */
export const stopEnds=(p:ProjectInput)=>activeEndStop(p)?runwayEnds(p):[];
/** Where the stops go, for notes: both ends, or the one true end with its grid. */
export function stopLocation(p:ProjectInput){
 const ends=runwayEnds(p);
 return ends.length===2?'both ends of both runways':`the ${ends[0]} end (grid ${ends[0]==='left'?1:p.spans.length+1}) of both runways; the runway continues beyond the other end`;
}
/** Front fillet room in front of the face plate: the weld plus 1/4 in, rounded up to the 1/4 in grid. */
export const stopLip=(e:EndStopInput)=>snapQuarter(e.weldSize+6.35,'up');
/**
 * Bolt rows from the girder end, back to front: back bolts edge from the base plate back, front bolts frontClear behind
 * the face, and with three rows a middle row halfway between them on the 1/4 in grid.
 */
export const stopBoltRows=(e:EndStopInput):number[]=>{
 const back=e.setback+e.bolts.edge,front=e.setback+e.base.length-stopLip(e)-e.face.thickness-e.bolts.frontClear;
 return (e.bolts.rows??2)===3?[back,snapQuarter((back+front)/2),front]:[back,front];
};
/** Stiffener arrangement: two between the bolt lines (inner), two at the base plate edges (outer), or one central. */
export const stopStiffenerArrangement=(e:EndStopInput)=>e.stiffener.arrangement??'inner';
/** Stiffener centers across the runway from the stop centerline. */
export function stopStiffeners(e:EndStopInput):number[]{
 const a=stopStiffenerArrangement(e),ts=e.stiffener.thickness;
 return a==='center'?[0]:a==='outer'?[-(e.base.width-ts)/2,(e.base.width-ts)/2]:[-e.stiffener.spacing/2,e.stiffener.spacing/2];
}
/** Clear distance between the two stiffeners (the slot their inside fillets are laid in); none for one central stiffener. */
export function stopStiffenerClear(e:EndStopInput){const z=stopStiffeners(e);return z.length<2?Infinity:z[1]-z[0]-e.stiffener.thickness;}
/** Bolt C/L to the nearer stiffener face, across the runway (bolts at plus and minus half the gauge). */
export function stopBoltToStiffener(e:EndStopInput){return Math.min(...stopStiffeners(e).map(z=>Math.abs(e.bolts.gauge/2-Math.abs(z))))-e.stiffener.thickness/2;}
/**
 * Nearest stop steel to the rail end, from the runway end: the front edge of the base plate, which projects the lip
 * in front of the face plate (the face plate where there is no lip).
 */
export const stopNose=(e:EndStopInput)=>Math.max(e.setback+e.base.length-stopLip(e),e.setback+e.base.length);
/** Rail end distance from the runway end: the rail stops railGap short of the nearest stop steel (stopNose). */
export const stopRailEnd=(e:EndStopInput)=>stopNose(e)+e.railGap;
/** Clear gap from the rail end to the nearest stop steel (base plate edge or face plate). */
export const stopRailClear=(e:EndStopInput)=>stopRailEnd(e)-stopNose(e);
