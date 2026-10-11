import type {ProjectInput} from './types';
import {independentBearings} from './simpleSupports';
import {tieArrangement} from './connectionOptions';
import {boltProperties} from './connectionStrength';
import {existingColumnSection} from './existingColumn';
import {activeEndBearing} from './endBearingInputs';

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
 */
export function tieRelease(p:ProjectInput){
 const t=p.details?.brace,r=t?.release;if(!t||!r?.enabled)return undefined;
 const c=t.connection,hole=boltProperties(c.grade,c.diameter).hole,od=hole+2*r.sleeveWall,width=od+1.5875,slot=width+2*r.travel;
 // Same clear material beyond the slot as a standard hole at the AISC J3.4 minimum edge distance.
 const edge=1.5*c.diameter-hole/2+width/2;
 // Same clear material between the two slots of a row as standard holes at the AISC J3.3 minimum spacing, plus the
 // slot location tolerance on their spacing. The bolt gauge sets the slot spacing.
 const ligament=8/3*c.diameter-hole+slotTolerance,minimumGauge=roundUp(slot+ligament,gussetIncrement);
 // The slot pattern with that edge plus a slot location tolerance beyond each end, rounded up to a cutting increment.
 const height=Math.max(t.width,roundUp(c.gauge+2*r.travel+2*(edge+slotTolerance),gussetIncrement));
 // Gusset end toward the girder, from the slot centers: the same edge plus the tolerance, rounded up to a cutting
 // increment; never shorter than the bar edge distance. The bars keep their own edge distance.
 const endEdge=Math.max(c.edge,roundUp(edge+slotTolerance,gussetIncrement));
 return {...r,hole,od,width,slot,edge,ligament,minimumGauge,endEdge,tolerance:slotTolerance,height,sleeveLength:t.gussetThickness+r.clearance,sleeveArea:Math.PI/4*(od**2-hole**2)};
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
 if(!d||tieArrangement(d)!=='paired-bars'||!a?.enabled||p.system!=='simple')return undefined;
 const face=d.bracket?.enabled?d.bracket.reach:a.columnFace;if(!face)return undefined;
 const b=p.section,t=d.brace,c=t.connection;
 const barGap=tieBarGap(c.weldSize),barEnd=face-barGap,start=barEnd-t.length,connection=(c.rows-1)*c.pitch+2*c.edge;
 const rootStart=b.tw/2+a.webGap,rootEnd=b.bf/2,rootLength=rootEnd-rootStart;
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
  gussetEnd,freeLength:t.length-2*connection-extension,
  stations:independentBearings(p).map(e=>({...e,tieX:e.center+(e.end==='left'?-1:1)*a.longitudinalSetback}))};
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
 // A designed bracket fixes the column face; otherwise the bars start clear of the stiffener.
 const face=d.bracket?.enabled?d.bracket.reach:root+clear+t.length,start=face-t.length,gussetEnd=start+connection;
 // The column gusset carries the column-end bolt group to the face, plus its longer slotted end edge.
 const columnGussetStart=face-connection-columnGussetExtension(p);
 return {root,start,face,connection,gussetEnd,gussetLength:gussetEnd-root,height:t.width,clear,sides:tieSides(p),columnGussetStart,columnGussetLength:face-columnGussetStart,
  // Bars and gusset sit the clearance inside each tied flange.
  topCenter:b.d/2-b.tf-clear-t.width/2,bottomCenter:-b.d/2+b.tf+clear+t.width/2};
}
