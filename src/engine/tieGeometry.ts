import type {ProjectInput} from './types';
import {snapQuarter} from './quarterInch';
import type {RunwayDetails} from './runwayDetails';
import {independentBearings} from './simpleSupports';
import {tieArrangement} from './connectionOptions';
import {boltProperties} from './connectionStrength';
import {existingColumnSection} from './existingColumn';
import {activeEndBearing,continuousBearings} from './endBearingInputs';
import {capTieLine} from './capAngle';
import {activeColumnCap} from './columnCapInputs';

/**
 * Ties of the direct flange-tie family: two flat bars, one each side of the girder and column gussets, or one
 * flexible plate on one face of the same gussets (AISC DG7 §11.2 flexible tieback). Both share the saddle,
 * gussets, bolt groups and column-end release; only the plies differ.
 */
export const flangeTieFamily=(d?:RunwayDetails)=>{const k=tieArrangement(d);return k==='paired-bars'||k==='flexible-plate';};
/** Plies at each tie: two flat bars in double shear, or one flexible plate in single shear. */
export const tiePlies=(p:ProjectInput):1|2=>tieArrangement(p.details)==='flexible-plate'?1:2;
/** Lap eccentricity of a single flexible plate, plate centroid to gusset mid-plane, mm; zero for the symmetric bars. */
export const tieEccentricity=(p:ProjectInput)=>tiePlies(p)===1?(p.details!.brace.thickness+p.details!.brace.gussetThickness)/2:0;
/** Flanges with paired-bar ties: the top flange only where bolted end bearings restrain the bottom flange at the seat. */
export const tieSides=(p:ProjectInput):(1|-1)[]=>activeEndBearing(p)?[1]:[-1,1];

/** Receiving column flange at the tie roots: the designed bracket's receiver, else the surveyed existing column. */
export function tieReceiver(p:ProjectInput){
 const b=p.details?.bracket;
 if(b?.enabled)return {width:b.receiver.width,flangeThickness:b.receiver.flangeThickness,Fy:b.receiver.Fy,source:'bracket receiving column'};
 if(p.existingColumn?.enabled){const s=existingColumnSection(p).section;return {width:s.bf,flangeThickness:s.tf,Fy:s.Fy,source:'existing column'};}
 return undefined;
}

const inch=25.4;
/**
 * Practical cutting increment of the column gusset (1/4 in), and the slot location tolerance (1/16 in) kept in
 * every clear distance of the slots: beyond the slot ends, toward the gusset end and between adjacent slots.
 */
export const gussetIncrement=inch/4,slotTolerance=inch/16;
const roundUp=(v:number,step:number)=>Math.ceil(v/step-1e-9)*step;
/** Clear gap from the bar ends to the column flange: the column root fillet plus 1/8 in, at least 1/2 in, in 1/4 in steps. */
export const tieBarGap=(rootWeld:number)=>Math.max(inch/2,roundUp(rootWeld+inch/8,inch/4));
/**
 * Column-end release of the paired bars: each bolt is pretensioned against a
 * steel sleeve passing through a vertical slot in the column gusset, so the
 * bars and sleeves translate vertically with the girder while the gusset is
 * not clamped. The sleeve bears on the slot sides to carry the tie force.
 * Slide (paired bars only, `slide` > 0): the sleeves are longer than the gusset by the slide each way, so the column
 * gusset also floats along the runway on them; the bars stay parallel, each off the gusset faces by `barOffset`, with a
 * filler of that thickness on each face of the girder gusset (tieMovementChecks, tie-slide-*).
 */
export function tieRelease(p:ProjectInput){
 const t=p.details?.brace,r=t?.release;if(!t||!r?.enabled)return undefined;
 const c=t.connection,hole=boltProperties(c.grade,c.diameter).hole,od=hole+2*r.sleeveWall,width=od+1.5875,slot=width+2*r.travel;
 // Same clear material beyond the slot as a standard hole at the AISC J3.4 minimum edge distance.
 const edge=1.5*c.diameter-hole/2+width/2;
 // Same clear material between the two slots of a row as standard holes at the AISC J3.3 minimum spacing, plus the
 // slot location tolerance on their spacing. The bolt gauge sets the slot spacing.
 const ligament=8/3*c.diameter-hole+slotTolerance,minimumGauge=roundUp(slot+ligament,gussetIncrement);
 // Between the slots of adjacent rows along the tie, across which the sleeves bear (J3.10 checks that ligament): a clear
 // distance of at least d_b (as between slotted holes), not less than 1/2 in for cutting, plus the slot location
 // tolerance; the row pitch is the slot width plus that, on the 1/8 in pitch grid.
 const rowLigament=Math.max(c.diameter,inch/2)+slotTolerance,minimumPitch=roundUp(width+rowLigament,inch/8);
 // The slot pattern with that edge plus a slot location tolerance beyond each end, rounded up to a cutting increment.
 const height=Math.max(t.width,roundUp(c.gauge+2*r.travel+2*(edge+slotTolerance),gussetIncrement));
 // Gusset end toward the girder, from the slot centers: the same edge plus the tolerance, rounded up to a cutting
 // increment; never shorter than the bar edge distance. The bars keep their own edge distance.
 const endEdge=Math.max(c.edge,roundUp(edge+slotTolerance,gussetIncrement));
 const slide=tiePlies(p)===2?r.slide??0:0;
 return {...r,slide,barOffset:slide>0?slide+r.clearance/2:0,hole,od,width,slot,edge,ligament,rowLigament,minimumGauge,minimumPitch,endEdge,tolerance:slotTolerance,height,sleeveLength:t.gussetThickness+r.clearance+2*slide,sleeveArea:Math.PI/4*(od**2-hole**2)};
}

/** Column gusset height: the bar width, or taller to contain the release slots. */
export const columnGussetHeight=(p:ProjectInput)=>tieRelease(p)?.height??p.details!.brace.width;
/** Length by which the column gusset runs past the bars' column-end bolt group toward the girder, mm: the slotted gusset's longer end edge. */
export const columnGussetExtension=(p:ProjectInput)=>{const r=tieRelease(p);return r?r.endEdge-p.details!.brace.connection.edge:0;};

/**
 * Shared fabrication coordinates, mm, across the runway from the web centerline. The flange saddle bypasses
 * the web: it sits under the flange from the web gap to the flange tip and is welded to the flange only by two
 * transverse end fillets across the flange, one at each end of the saddle, each the full saddle width. The bars
 * stop clear of the column flange; the column gusset spans that gap.
 */
export function flangeTieGeometry(p:ProjectInput){
 const d=p.details,a=d?.brace.flangeAttachment;
 if(!d||!flangeTieFamily(d)||!a?.enabled||p.system!=='simple')return undefined;
 const face=d.bracket?.enabled?d.bracket.reach:a.columnFace;if(!face)return undefined;
 const b=p.section,t=d.brace,c=t.connection;
 const barGap=tieBarGap(c.weldSize),barEnd=face-barGap,start=barEnd-t.length,connection=(c.rows-1)*c.pitch+2*c.edge;
 // The saddle starts webGap clear of the web, on the 1/4 in grid from the web centerline, and is cut to the 1/4 in
 // grid toward the flange tip, ending at the tip or just inside it.
 const rootStart=snapQuarter(b.tw/2+a.webGap,'up'),rootLength=snapQuarter(b.bf/2-rootStart,'down'),rootEnd=rootStart+rootLength;
 // The bars clear the saddle and, against the gusset, the toe of the gusset-to-saddle fillets.
 const saddleClear=Math.max(a.clearance,roundUp(a.weldSize+inch/16,inch/8));
 const capDrop=b.kind==='cap'?b.capDepth-b.capTw-b.tf:0;
 const topClear=Math.max(a.saddleThickness+saddleClear,capDrop+a.clearance);
 const bottomClear=a.saddleThickness+saddleClear;
 const gussetEnd=start+connection;
 // Cap channel: clear distance from the girder gusset's outer top corner to the turned-down channel flange
 // (inner face and bottom). Where the gusset rises above the bottom of that flange it is the horizontal gap.
 const capFlange=b.kind==='cap'?b.capWidth/2-b.capTf:undefined,dx=(capFlange??0)-gussetEnd,dy=a.saddleThickness-capDrop;
 const capClear=capFlange===undefined?undefined:dy<0?dx:dx>0?Math.hypot(dx,dy):dy;
 // The column gusset spans the gap at the bar ends and the column-end bolt group, plus its longer slotted end edge.
 const extension=columnGussetExtension(p),columnGussetStart=barEnd-connection-extension;
 return {attachment:a,face,barGap,barEnd,start,connection,rootStart,rootEnd,rootLength,saddleClear,receiver:tieReceiver(p),columnGusset:columnGussetHeight(p),columnGussetStart,columnGussetLength:face-columnGussetStart,sides:tieSides(p),
  // Saddle-to-flange welds: transverse end fillets, each the full saddle width, at the two saddle ends.
  endWeldLength:rootLength,capFlange,capClear,
  topDrop:topClear+t.width/2,bottomDrop:bottomClear+t.width/2,
  topCenter:b.d/2-b.tf-topClear-t.width/2,bottomCenter:-b.d/2+b.tf+bottomClear+t.width/2,
  // Clear bar length between the girder gusset and the column gusset ends.
  gussetEnd,freeLength:t.length-2*connection-extension,plies:tiePlies(p),eccentricity:tieEccentricity(p),lapShare:lapShare(p,t.length-2*connection-extension,face-columnGussetStart,rootLength,topClear+t.width/2-a.saddleThickness),
  // A single flexible plate lies on the gusset face toward its own girder end, away from the bearing stiffener.
  stations:independentBearings(p).map(e=>({...e,tieX:e.center+(e.end==='left'?-1:1)*a.longitudinalSetback,plateSide:(e.end==='left'?-1:1) as -1|1}))};
}

/**
 * Rotational stiffnesses about the vertical axis, per unit E, of the two gussets a single flexible plate laps: the
 * column gusset as a cantilever of its projection L_g bending about its weak axis, E·h_g·t³/(12L_g); the girder
 * gusset hanging from the saddle weld as a plate twisting over its depth a to the tie line, G·b·t³/(3a) with
 * G = E/2.6 and b the saddle width.
 */
export function gussetRotation(p:ProjectInput,columnProjection:number,rootLength:number,girderArm:number){
 const tg=p.details!.brace.gussetThickness;
 return {column:columnGussetHeight(p)*tg**3/(12*columnProjection),girder:rootLength*tg**3/(2.6*3*girderArm)};
}
/**
 * Share of a single plate's lap couple F·e taken by the plate itself. The couple acts at both laps in the same sense
 * (single curvature); the plate ends rotate with the gussets they are clamped to: plate end stiffness 2EI_p/L for
 * equal end rotations against the more flexible gusset. The gussets are checked for the whole couple.
 */
function lapShare(p:ProjectInput,free:number,columnProjection:number,rootLength:number,girderArm:number){
 const t=p.details!.brace;if(tiePlies(p)!==1||free<=0)return 0;
 const plate=2*t.width*t.thickness**3/12/free,k=gussetRotation(p,columnProjection,rootLength,girderArm);
 return plate/(plate+Math.min(k.column,k.girder));
}
/** Clear gap from the bearing stiffener to the bars, and from the tied flange to the gusset, mm. */
const stiffenerTieClearance=6.35;
/**
 * Girder end of a paired-bar tie without a flange saddle: a gusset in the plane of the tie-side bearing
 * stiffener, CJP welded to its outer edge just inside the tied flange, carries the bars' girder-end bolt
 * group beyond the stiffener. The full-depth stiffener pair takes the tie force into the girder as the
 * restraint diaphragm. Coordinates across the runway from the web centerline, mm.
 */
export function stiffenerTieGeometry(p:ProjectInput){
 const d=p.details;if(!d||tieArrangement(d)!=='paired-bars'||flangeTieGeometry(p))return undefined;
 const b=p.section,t=d.brace,c=t.connection,connection=(c.rows-1)*c.pitch+2*c.edge,clear=stiffenerTieClearance;
 const root=b.tw/2+d.bearing.stiffenerWidth;
 // A designed bracket fixes the column face, as does the column face of a bracket by others on simple spans; otherwise
 // the bars start clear of the stiffener.
 const face=d.bracket?.enabled?d.bracket.reach:(p.system==='simple'?t.flangeAttachment?.columnFace:undefined)??root+clear+t.length,start=face-t.length,gussetEnd=start+connection;
 // The column gusset carries the column-end bolt group to the face, plus its longer slotted end edge.
 const columnGussetStart=face-connection-columnGussetExtension(p);
 // One tie at each girder end, at its bearing stiffener (the bearing center): on simple spans both girder ends at a shared
 // grid, each at its own bearing; on a continuous girder one at each support.
 const bearings=p.system==='simple'?independentBearings(p):continuousBearings(p);
 const stations=bearings.map(v=>({station:v.station,center:v.center,start:v.start,finish:v.finish,tieX:v.center,offset:v.center-v.station}));
 return {root,start,face,connection,gussetEnd,gussetLength:gussetEnd-root,height:t.width,clear,sides:tieSides(p),columnGussetStart,columnGussetLength:face-columnGussetStart,stations,receiver:tieReceiver(p),
  // Bars and gusset sit the clearance inside each tied flange; on a capped girder the top ones drop below the cap
  // channel's turned-down flanges, which reach capDepth − capTw below the W top past the W flange tips.
  topCenter:b.d/2-Math.max(b.tf,b.kind==='cap'?b.capDepth-b.capTw:0)-clear-t.width/2,bottomCenter:-b.d/2+b.tf+clear+t.width/2};
}

/**
 * How the girder gusset of a stiffener tie joins the tie-side bearing stiffener: 'integral' where it is as thick as the
 * stiffener, the stiffener plate cut with the gusset as its extension past the flange tip (one plate, no weld, a 1 in
 * ground radius at the re-entrant corner); else 'cjp', a separate gusset CJP welded to the stiffener's outer edge (an
 * entered gusset of another thickness). Undefined without a stiffener tie.
 */
export function stiffenerTieJoint(p:ProjectInput):'integral'|'cjp'|undefined{
 if(!stiffenerTieGeometry(p))return undefined;
 const d=p.details!;return Math.abs(d.brace.gussetThickness-d.bearing.stiffenerThickness)<1e-6?'integral':'cjp';
}

/**
 * Height above the girder bottom, mm, of the line where a tie force acts on the girder (`top`, the default) and of the
 * bottom restraint line (`bottom`). A bar force F at a drop e below the flange is F at the flange plus the torque F·e, so
 * the restraint line is the bar line: the cap tieback's tie plate line (capTieLine); the bar (or flexible plate) centroid
 * of a direct flange saddle tie (flangeTieGeometry) or of the bars on the bearing-stiffener gusset (stiffenerTieGeometry),
 * below the tied flange by the saddle or gusset and its clearance. A column cap fork and a tie without a laid-out
 * attachment act at the flange at mid-thickness; the bottom flange at mid-thickness where the end bearing bolts
 * restrain it. The girder analysis, the rail-head take-up, the interface torque and the S-00 tie elevation use it.
 */
export function tieLine(p:ProjectInput,side:'top'|'bottom'='top'){
 const s=p.section,flange=side==='top'?s.d-s.tf/2:s.tf/2;
 if(activeColumnCap(p))return flange;
 if(side==='top'){const cap=capTieLine(p);if(cap!==undefined)return cap;}
 const tie=flangeTieGeometry(p)??stiffenerTieGeometry(p);
 return tie&&tie.sides.includes(side==='top'?1:-1)?s.d/2+(side==='top'?tie.topCenter:tie.bottomCenter):flange;
}
