import type {ProjectInput} from './types';
import {snapQuarter,sleeveLength} from './quarterInch';
import type {RunwayDetails} from './runwayDetails';
import {aiscAngleByName} from '../data/aiscAngles';
import {aiscChannelByName} from '../data/aiscChannels';
import {aiscShapeByName} from '../data/aiscSections';
import {boltProperties,type BoltGrade} from './connectionStrength';
import {independentBearings} from './simpleSupports';
import {defaultCapAngle,type CapAngleInput} from './capAngleInputs';
import {initialColumnStiffeners,clipMargin} from './columnStiffenerInputs';
import {capChannelProfile} from './channelProfile';
import {tieColumn} from './craneColumnInputs';
export {capAngleSchema,defaultCapAngle,type CapAngleInput} from './capAngleInputs';

const inch=25.4;
/** The cap tieback angle arrangement is selected. */
export const isCapAngle=(d?:RunwayDetails)=>d?.brace.arrangement==='cap-angle';
export const isCapAngleTie=(p:{details?:RunwayDetails})=>isCapAngle(p.details);
/** The entered cap angle inputs, or the default set. */
export const capAngleInput=(d:RunwayDetails):CapAngleInput=>d.brace.capAngle??defaultCapAngle;

/** AISC 360-16 Table J3.4 minimum edge distance (in), by nominal bolt diameter (in). */
export function minimumEdge(db:number){
 const d=Math.round(db/inch*1000)/1000,table:Record<string,number>={'0.5':.75,'0.625':.875,'0.75':1,'0.875':1.125,'1':1.25,'1.125':1.5,'1.25':1.625};
 return (table[String(d)]??1.25*d)*inch;
}
/** AISC 360-16 Table J3.3 short-slot width and length for a bolt diameter. */
export function shortSlot(db:number){
 const d=db/inch;
 if(d<1-1e-6)return {width:db+inch/16,length:db+(d<.6?3/16:1/4)*inch};
 if(d<1+1e-6)return {width:db+inch/16,length:db+5/16*inch};
 return {width:db+inch/8,length:db+3/8*inch};
}
/** AISC 360-16 Table J3.5 edge-distance increment C2 for a slot perpendicular to the edge. */
export function slotEdgeIncrement(db:number,kind:'short'|'long'){
 if(kind==='long')return .75*db;
 return db<=7/8*inch+1e-6?inch/8:db<=inch+1e-6?inch/8:3/16*inch;
}
/** Heavy hex structural bolt hardware (ASME B18.2.6, A563 heavy hex nut, F436 washer), mm. */
export function boltHardware(db:number){
 const flats=1.5*db+inch/8;
 return {flats,corners:flats*2/Math.sqrt(3),head:.625*db,nut:db-inch/64,washer:{t:inch*5/32,od:2*db+inch/8},stick:.4*db};
}
/**
 * ASTM F436 beveled washer for the sloped flange of an American Standard channel or beam: square, 1-3/4 in on a side,
 * 5/16 in mean thickness, slope 1:6 (F436 dimensions for 1/2 to 1 in bolts; larger bolts are taken with the same
 * thickness and a side of 2 d_b). The RCSC Specification requires one where an outer face slopes more than 1:20.
 */
export function beveledWasher(db:number){
 const side=db<=inch+1e-6?1.75*inch:2*db,t=inch*5/16,slope=1/6;
 return {side,t,slope,thick:t+side/2*slope,thin:Math.max(0,t-side/2*slope)};
}
/**
 * Where the cap bolt nut seats on the column-side channel flange, mm: the flange thickness at the bolt line from the
 * true AISC channel profile (the inner face slopes 2:12 on C shapes, src/engine/channelProfile.ts), the washer under the
 * nut (an F436 1:6 beveled washer where the inner face slopes more than 1:20, else a flat F436 washer), and the bearing
 * face of the nut along the bolt axis, measured from the outer face of the channel flange.
 */
export function capBoltSeat(s:ProjectInput['section'],db:number,gauge:number){
 const prof=capChannelProfile(s,1),y=s.capTw-gauge;
 // Thickness across the flange at the bolt line (y measured up from the underside of the channel web).
 const thickness=Math.max(prof.toeThickness,Math.min(prof.rootThickness,s.capWidth/2-prof.innerFace(y)));
 const beveled=prof.slope>1/20+1e-9,hw=boltHardware(db),b=beveledWasher(db);
 const washer=beveled?{kind:'beveled' as const,t:b.t,thick:b.thick,width:b.side,slope:b.slope}:{kind:'flat' as const,t:hw.washer.t,thick:hw.washer.t,width:hw.washer.od,slope:0};
 return {thickness,slope:prof.slope,washer,nutFace:thickness+washer.t};
}
/** Tensile stress area of a UNC bolt, A_t = π/4 (d − 0.9743/n)², mm². */
export function tensileArea(db:number){
 const d=db/inch,tpi:Record<string,number>={'0.5':13,'0.625':11,'0.75':10,'0.875':9,'1':8,'1.125':7,'1.25':7,'1.375':6,'1.5':6};
 const n=tpi[String(Math.round(d*1000)/1000)]??8;
 return Math.PI/4*(d-.9743/n)**2*inch**2;
}

/**
 * The receiving column flange at the tie: the designed bracket's receiving column, else the surveyed existing column.
 * The web fillet k1 comes from the catalog shape with these plates, else no fillet is credited.
 */
export function capAngleColumn(p:ProjectInput){
 const b=p.details?.bracket,t=tieColumn(p),c=t?.enabled?t:undefined;
 let plates:{depth:number;width:number;tf:number;tw:number;Fy:number;Fu:number;source:string}|undefined;
 if(b?.enabled){const r=b.receiver;plates={depth:r.depth,width:r.width,tf:r.flangeThickness,tw:r.webThickness,Fy:r.Fy,Fu:r.Fu,source:'bracket receiving column'};}
 else if(c){const w=aiscShapeByName(c.shape??'');plates=w?{depth:w.d*inch,width:w.bf*inch,tf:w.tf*inch,tw:w.tw*inch,Fy:c.Fy,Fu:c.Fu,source:`existing ${c.shape}`}:{depth:c.d,width:c.bf,tf:c.tf,tw:c.tw,Fy:c.Fy,Fu:c.Fu,source:'existing column'};}
 if(!plates)return undefined;
 // The catalog shape with these plates (the surveyed existing shape first) gives the web fillet.
 const same=(name?:string)=>{const w=name?aiscShapeByName(name):undefined;return w&&[w.d*inch-plates!.depth,w.bf*inch-plates!.width,w.tf*inch-plates!.tf,w.tw*inch-plates!.tw].every(v=>Math.abs(v)<.5)?w:undefined;};
 const shape=same(c?.shape);
 const fillet=shape?shape.kdes*inch-shape.tf*inch:0;
 return {...plates,shape:shape?.name,k1:plates.tw/2+fillet,fillet,isNew:!!c?.isNew,name:shape?.name??(c?.shape||'BUILT-UP')};
}

/**
 * Geometry of the cap tieback angle, mm. Across the runway (y) from the girder web centerline toward the column;
 * vertically (z) from the top of the cap; along the runway from the tie centerline. One tie at each girder end of
 * independent simple spans, at `setback` from its girder end, on the column-side channel flange.
 */
export function capAngleGeometry(p:ProjectInput){
 const d=p.details,s=p.section;
 if(!d||!isCapAngle(d)||s.kind!=='cap'||p.system!=='simple')return undefined;
 const c=capAngleInput(d),L=aiscAngleByName(c.shape);if(!L)return undefined;
 const face=d.bracket?.enabled?d.bracket.reach:c.columnFace??d.brace.flangeAttachment?.columnFace;if(!face)return undefined;
 const ta=L.t*inch,dv=L.d*inch,bh=L.b*inch,ka=L.kdes*inch;
 const channel=aiscChannelByName(s.capCatalogueId??''),kc=channel?channel.kdes*inch:s.capTw+inch/2;
 const y0=s.capWidth/2,cb=c.capBolts,lb=c.lapBolts,colb=c.columnBolts,ep=c.endPlate;
 const grade=(g:BoltGrade,db:number)=>{try{return boltProperties(g,db);}catch{return undefined;}};
 const capBolt=grade(cb.grade,cb.diameter),lapBolt=grade(lb.grade,lb.diameter),colBolt=grade(colb.grade,colb.diameter);
 if(!capBolt||!lapBolt||!colBolt)return undefined;
 // Long slots in the angle's short leg along the runway: sized for a steel sleeve (bore = standard hole) when the
 // bolts are pretensioned against sleeves, else for the bolt.
 const sleeved=c.mode==='sleeved',sleeveOd=capBolt.hole+2*c.sleeveWall;
 const slotWidth=sleeved?sleeveOd+inch/16:capBolt.hole,slotLength=slotWidth+2*c.travel;
 const sleeve=sleeved?{od:sleeveOd,bore:capBolt.hole,length:sleeveLength(ta+c.sleeveClearance),area:Math.PI/4*(sleeveOd**2-capBolt.hole**2)}:undefined;
 // A plate washer centered on the bolt covers the slot at either extreme of travel.
 const washer={length:slotLength+2*c.travel+inch/2,height:Math.max(2.5*cb.diameter,slotWidth+inch),thickness:c.washerThickness};
 const lapSlot=shortSlot(lb.diameter),shim=c.shimMax/2;
 // The tie plate is cut to the 1/4 in grid, its lap edge distance at least the entered edge.
 const yLap=y0+lb.gauge,endPlateFace=face-shim,endPlateBack=endPlateFace-ep.thickness,plateStart=endPlateBack-snapQuarter(endPlateBack-(yLap-lb.edge),'up');
 const tp=c.plateThickness,zTie=tp/2;
 const stations=independentBearings(p).map(e=>{
  const girderEnd=e.end==='left'?e.start:e.finish,x=girderEnd+(e.end==='left'?1:-1)*c.setback;
  return {bay:e.bay,end:e.end,station:e.station,girderEnd,x,offset:x-e.station,bearingCenter:e.center,start:e.start,finish:e.finish};
 });
 return {input:c,shape:L,ta,dv,bh,ka,kc,face,y0,toe:y0+bh,
  cap:{...cb,hole:capBolt.hole,z:-cb.gauge,slotWidth,slotLength,sleeve,washer,sleeved,travel:c.travel,
   // The nut side on the sloped channel flange: true flange thickness at the bolt line and the washer under the nut.
   seat:capBoltSeat(s,cb.diameter,cb.gauge)},
  lap:{...lb,hole:lapBolt.hole,y:yLap,slot:lapSlot},
  plate:{thickness:tp,width:c.plateWidth,start:plateStart,end:endPlateBack,length:endPlateBack-plateStart,z0:0,z1:tp,zc:zTie,
   // Clear span from the lap bolt line to the end plate; and from the angle toe to the end plate.
   span:endPlateBack-yLap,gap:endPlateBack-(y0+bh)},
  endPlate:{...ep,y0:endPlateBack,y1:endPlateFace,z0:zTie-ep.height/2,z1:zTie+ep.height/2},
  column:{...colb,hole:colBolt.hole,zs:[zTie+colb.gauge,zTie-colb.gauge] as [number,number],receiver:capAngleColumn(p),slot:columnReleaseSlot(c,colBolt.hole,ep.thickness)},
  shim:{max:c.shimMax,nominal:shim,y0:endPlateFace,y1:face},
  weld:c.weldSize,stations,
  // Height of the cap bolt line above the girder bearing (bottom of the W), for end rotation.
  boltHeight:s.d+s.capTw-cb.gauge,capTop:s.d/2+s.capTw};
}
export type CapAngleGeometry=NonNullable<ReturnType<typeof capAngleGeometry>>;
/**
 * The vertical slots of a released end plate (columnRelease): a steel sleeve one bore (the standard hole) plus two walls
 * in diameter, cut to the end plate plus the clearance; the slot 1/16 in wider than the sleeve and the travel longer each
 * way; a plate washer under each bolt head covering the slot at either extreme of travel (1/4 in past it).
 */
export function columnReleaseSlot(c:CapAngleInput,hole:number,endPlate:number){
 const r=c.columnRelease;if(!r)return undefined;
 const od=hole+2*c.sleeveWall,width=od+inch/16,length=width+2*r.travel;
 return {travel:r.travel,width,length,sleeve:{od,bore:hole,length:sleeveLength(endPlate+c.sleeveClearance),area:Math.PI/4*(od**2-hole**2)},
  washer:{length:length+2*r.travel+inch/2,width:Math.max(2.5*c.columnBolts.diameter,width+inch),thickness:c.washerThickness}};
}
/**
 * Height of the cap tieback's force line above the bottom of the W (mm): the tie plate centerline, lapped on the
 * angle's long leg at the top of the cap. By statics the tie's pull or push acts on the girder along this line, above
 * the cap bolts that fasten the angle to the channel flange; it is the top restraint of the lateral/torsional model.
 */
export function capTieLine(p:ProjectInput){const g=capAngleGeometry(p);return g?p.section.d+p.section.capTw+g.plate.zc:undefined;}

/** An axis-aligned plate or block, mm: x along the runway from the tie centerline, y across from the girder web
 * centerline toward the column, z up from the top of the cap. */
export interface CapAngleBox {name:string;kind:'angle-leg'|'tie-plate'|'end-plate'|'shim'|'plate-washer'|'sleeve'|'stiffener'|'channel-flange'|'column-flange';min:[number,number,number];max:[number,number,number]}
/** A bolt: its axis direction, head and nut ends, diameter, the hole or slot it passes in each ply. */
export interface CapAngleBolt {name:string;group:'cap'|'lap'|'column';axis:'x'|'y'|'z';head:[number,number,number];nut:[number,number,number];diameter:number;grade:string;holes:{ply:string;kind:'standard'|'short-slot'|'long-slot'|'field-drilled';width:number;length:number;along:'x'|'y'|'z'}[]}
/**
 * Pure geometry of one cap tieback angle for drawing it in any projection, mm. x along the runway from the tie
 * centerline, y across from the girder web centerline toward the column, z up from the top of the cap. The angle is
 * given as its two legs; slots are listed with each bolt. `station` picks the tie (index into the stations, default
 * the first one at a shared column); the column centerline is then at x = -offsetFromColumn. The column stiffener is
 * included when it is provided (capAngle.stiffener enabled), or when `stiffener` is true (then with its proposed size).
 */
export function capAngleTieParts(p:ProjectInput,opts:{station?:number;stiffener?:boolean}={}){
 const g=capAngleGeometry(p);if(!g)return undefined;
 const w=g.input.length/2,pw=g.plate.width/2,ew=g.endPlate.width/2,hw=boltHardware(g.cap.diameter),s=p.section;
 const shared=g.stations.findIndex(v=>g.stations.some(o=>o!==v&&Math.abs(o.station-v.station)<1e-6));
 const at=g.stations[opts.station??Math.max(0,shared)]??g.stations[0],offset=at?.offset??0;
 const boxes:CapAngleBox[]=[
  {name:'angle short leg (on channel flange)',kind:'angle-leg',min:[-w,g.y0,-g.dv],max:[w,g.y0+g.ta,0]},
  {name:'angle long leg (toward column)',kind:'angle-leg',min:[-w,g.y0,-g.ta],max:[w,g.toe,0]},
  {name:'tie plate',kind:'tie-plate',min:[-pw,g.plate.start,g.plate.z0],max:[pw,g.plate.end,g.plate.z1]},
  {name:'end plate',kind:'end-plate',min:[-ew,g.endPlate.y0,g.endPlate.z0],max:[ew,g.endPlate.y1,g.endPlate.z1]},
  {name:'shim pack (nominal)',kind:'shim',min:[-ew,g.shim.y0,g.endPlate.z0],max:[ew,g.shim.y1,g.endPlate.z1]},
  {name:'cap channel flange (context)',kind:'channel-flange',min:[-w-50,g.y0-g.cap.seat.thickness,-s.capDepth],max:[w+50,g.y0,0]}
 ];
 const col=g.column.receiver;
 if(col)boxes.push({name:'column flange (context)',kind:'column-flange',min:[-offset-col.width/2,g.face,g.endPlate.z0-50],max:[-offset+col.width/2,g.face+col.tf,g.endPlate.z1+50]});
 const bolts:CapAngleBolt[]=[];
 for(const x of [-g.cap.pitch/2,g.cap.pitch/2]){
  const outer=g.y0+g.ta+(g.cap.sleeve?g.input.sleeveClearance:0)+g.cap.washer.thickness;
  boxes.push({name:'plate washer',kind:'plate-washer',min:[x-g.cap.washer.length/2,outer-g.cap.washer.thickness,g.cap.z-g.cap.washer.height/2],max:[x+g.cap.washer.length/2,outer,g.cap.z+g.cap.washer.height/2]});
  if(g.cap.sleeve)boxes.push({name:'steel sleeve',kind:'sleeve',min:[x-g.cap.sleeve.od/2,g.y0,g.cap.z-g.cap.sleeve.od/2],max:[x+g.cap.sleeve.od/2,g.y0+g.cap.sleeve.length,g.cap.z+g.cap.sleeve.od/2]});
  bolts.push({name:'cap bolt',group:'cap',axis:'y',head:[x,outer,g.cap.z],nut:[x,g.y0-g.cap.seat.nutFace,g.cap.z],diameter:g.cap.diameter,grade:g.cap.grade,
   holes:[{ply:'angle short leg',kind:'long-slot',width:g.cap.slotWidth,length:g.cap.slotLength,along:'x'},{ply:'cap channel flange',kind:'standard',width:g.cap.hole,length:g.cap.hole,along:'x'}]});
 }
 for(const x of [-g.lap.pitch/2,g.lap.pitch/2])bolts.push({name:'lap bolt',group:'lap',axis:'z',head:[x,g.lap.y,g.plate.z1],nut:[x,g.lap.y,-g.ta],diameter:g.lap.diameter,grade:g.lap.grade,
  holes:[{ply:'tie plate',kind:'short-slot',width:g.lap.slot.width,length:g.lap.slot.length,along:'y'},{ply:'angle long leg',kind:'standard',width:g.lap.hole,length:g.lap.hole,along:'y'}]});
 for(const z of g.column.zs)bolts.push({name:'column bolt',group:'column',axis:'y',head:[0,g.endPlate.y0,z],nut:[0,g.face+(col?.tf??0),z],diameter:g.column.diameter,grade:g.column.grade,
  holes:[{ply:'end plate',kind:'standard',width:g.column.hole,length:g.column.hole,along:'z'},{ply:'shims (finger shims)',kind:'short-slot',width:g.column.hole,length:g.column.hole,along:'z'},{ply:'column flange',kind:'field-drilled',width:g.column.hole,length:g.column.hole,along:'z'}]});
 const st=col&&(opts.stiffener||g.input.stiffener?.enabled)?capAngleStiffenerGeometry(g):undefined;
 if(st&&col){
  // On the tie's side of the column web, from the web face over the plate width; its corner clip at the web and flange.
  const side=Math.sign(offset)||1,web=-offset+side*col.tw/2,tip=web+side*st.width;
  boxes.push({name:'column stiffener at the tie level',kind:'stiffener',min:[Math.min(web,tip),g.face+col.tf,g.plate.zc-st.thickness/2],max:[Math.max(web,tip),g.face+col.tf+st.length,g.plate.zc+st.thickness/2]});
 }
 return {boxes,bolts,welds:[{name:'end plate to tie plate, both faces of the tie plate',size:g.weld,length:g.plate.width,bothSides:true,at:[0,g.endPlate.y0,g.plate.zc] as [number,number,number]}],
  station:at?{bay:at.bay,end:at.end,x:at.x,offsetFromColumn:offset}:undefined,
  stations:g.stations.map(v=>({bay:v.bay,end:v.end,x:v.x,offsetFromColumn:v.offset})),columnFace:g.face,
  stiffener:st?{thickness:st.thickness,width:st.width,length:st.length,clip:st.clip,flangeWeld:st.flangeWeld,webWeld:st.webWeld,provided:st.provided}:undefined};
}
/**
 * The nut side of each cap bolt inside the channel, mm, in the tie coordinates of capAngleTieParts: the washer under
 * the nut (a beveled washer at its thick edge), the heavy hex nut across corners and the bolt stick-through. These are
 * the hardware solids that share the inside of the girder with the bearing stiffeners and the W top flange.
 */
export function capBoltNutEnvelope(g:CapAngleGeometry){
 const hw=boltHardware(g.cap.diameter),seat=g.cap.seat,inner=g.y0-seat.thickness,face=g.y0-seat.nutFace,z=g.cap.z;
 return [-g.cap.pitch/2,g.cap.pitch/2].map(x=>{
  const box=(name:string,half:number,y0:number,y1:number):CapAngleBox=>({name,kind:'plate-washer',min:[x-half,y0,z-half],max:[x+half,y1,z+half]});
  return {x,parts:[box(seat.washer.kind==='beveled'?'F436 1:6 beveled washer':'F436 washer',seat.washer.width/2,inner-seat.washer.thick,inner),
   box('heavy hex nut',hw.corners/2,face-hw.nut,face),box('bolt stick-through',g.cap.diameter/2,face-hw.nut-hw.stick,face-hw.nut)]};
 });
}
/**
 * The column stiffener at the tie level, on the tie's side of the column web: a horizontal plate from the web face,
 * its corners clipped clear of the web fillet, from the loaded flange to the column's mid-depth (or full depth),
 * AISC J10.8. Its proportions are the column stiffener input (columnStiffenerInputs.ts); when none is entered, the
 * starting values for the receiving column and the end plate delivering the force (initialColumnStiffeners).
 */
export function capAngleStiffenerGeometry(g:CapAngleGeometry){
 const col=g.column.receiver;if(!col)return undefined;
 const receiver={depth:col.depth,width:col.width,flangeThickness:col.tf,webThickness:col.tw};
 const k=col.shape?col.tf+col.fillet:undefined,s=g.input.stiffener??initialColumnStiffeners(receiver,k,g.endPlate.thickness);
 const length=s.length==='full'?col.depth-2*col.tf:col.depth/2-col.tf;
 return {...s,provided:!!g.input.stiffener?.enabled,length,requiredClip:k!==undefined?k-col.tf+clipMargin:undefined,contact:s.width-s.clip,webLength:length-s.clip-(s.length==='full'?s.clip:0)};
}
