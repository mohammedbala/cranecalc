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
 const height=Math.max(t.width,c.gauge+2*r.travel+2*edge);
 return {...r,hole,od,width,slot,edge,height,sleeveLength:t.gussetThickness+r.clearance,sleeveArea:Math.PI/4*(od**2-hole**2)};
}

/** Column gusset height: the bar width, or taller to contain the release slots. */
export const columnGussetHeight=(p:ProjectInput)=>tieRelease(p)?.height??p.details!.brace.width;

/** Shared fabrication coordinates, mm. The flange saddle bypasses the web. */
export function flangeTieGeometry(p:ProjectInput){
 const d=p.details,a=d?.brace.flangeAttachment;
 if(!d||tieArrangement(d)!=='paired-bars'||!a?.enabled||p.system!=='simple')return undefined;
 const face=d.bracket?.enabled?d.bracket.reach:a.columnFace;if(!face)return undefined;
 const b=p.section,t=d.brace,c=t.connection;
 const start=face-t.length,connection=(c.rows-1)*c.pitch+2*c.edge;
 const rootStart=b.tw/2+a.webGap,rootEnd=b.bf/2,rootLength=rootEnd-rootStart;
 const topClear=Math.max(a.saddleThickness,b.kind==='cap'?b.capDepth-b.capTw-b.tf:0)+a.clearance;
 const bottomClear=a.saddleThickness+a.clearance;
 return {attachment:a,face,start,connection,rootStart,rootEnd,rootLength,receiver:tieReceiver(p),columnGusset:columnGussetHeight(p),sides:tieSides(p),
  topDrop:topClear+t.width/2,bottomDrop:bottomClear+t.width/2,
  topCenter:b.d/2-b.tf-topClear-t.width/2,bottomCenter:-b.d/2+b.tf+bottomClear+t.width/2,
  gussetEnd:start+connection,freeLength:t.length-2*connection,
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
 return {root,start,face,connection,gussetEnd,gussetLength:gussetEnd-root,height:t.width,clear,sides:tieSides(p),
  // Bars and gusset sit the clearance inside each tied flange.
  topCenter:b.d/2-b.tf-clear-t.width/2,bottomCenter:-b.d/2+b.tf+clear+t.width/2};
}
