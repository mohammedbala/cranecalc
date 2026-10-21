import type {ProjectInput} from './types';
import {adjacentBays,continues} from './continuation';
import {activeEndStop,stopEnds,stopRailEnd} from './endStopInputs';
import {snapQuarter} from './quarterInch';
import {endGridOverhang} from './simpleSupports';
import {spliceStations,spliceClipZones} from './spliceInputs';

const foot=304.8;
/**
 * Project rail layout criteria: rail pieces in standard 39-ft mill lengths, joints kept 2 ft clear of
 * girder joints and of the joints on the opposite rail at every wheel spacing of a crane, and no piece
 * shorter than 10 ft.
 */
export const railLayoutCriteria={stock:39*foot,clear:2*foot,minPiece:10*foot} as const;
/** Cut rail pieces to multiples of 5 in (127 mm), a length round in both unit systems, so the layout does not change with the display units. */
const railCutStep=127;

export interface RailRun {side:'A'|'B';start:number;end:number;joints:number[];pieces:number[]}
export interface RailLayout {
 /** Girder joints along the runway: interior grids of simple spans and continued ends. */
 girderJoints:number[];
 /** Distinct spacings between wheels of one crane, zero included: opposite joints this far apart are struck together. */
 wheelSteps:number[];
 rails:[RailRun,RailRun];
 /** Ends where the new rail joins the existing rail of a continued runway. */
 existing:{left:boolean;right:boolean};
 /** Joints that could not be kept clear of every girder joint and opposite joint. */
 conflicts:number[];
}

/**
 * Rail pieces and joint stations along both runways, from grid 1. Each rail runs between end stops or, at
 * an end continued by an existing bay, to a joint with the existing rail cut back 2 ft into that bay. The
 * runway A rail starts with a full piece; where it has joints the runway B rail starts with a part piece (half of
 * A's first piece, at most half a mill length) so that its joints fall between those of runway A. A run within one
 * mill length has no joints.
 */
export function railLayout(p:ProjectInput):RailLayout{
 const {stock,clear,minPiece}=railLayoutCriteria,L=p.spans.reduce((a,b)=>a+b,0),step=railCutStep;
 const stop=activeEndStop(p),stops=stopEnds(p),railEnd=stop?stopRailEnd(stop):0;
 const existing={left:continues(p,'left'),right:continues(p,'right')};
 // The rail runs to the girder end (railEnd short of it at a stop), past the grid when the end bearing is centered on the support web.
 const overL=endGridOverhang(p,'left'),overR=endGridOverhang(p,'right');
 const start=existing.left?-clear:-overL+(stops.includes('left')?railEnd:0),end=existing.right?L+clear:L+overR-(stops.includes('right')?railEnd:0);
 let x=0;const grids=[0,...p.spans.map(s=>x+=s)];
 // Girder field splices are girder joints too: rail joints stay clear of them.
 const girderJoints=[...(p.system==='simple'?grids.filter((g,i)=>(i>0&&i<grids.length-1)||adjacentBays(p).some(b=>b.station===g)):[]),...(p.details?spliceStations(p):[])].sort((a,b)=>a-b);
 const steps=new Set<number>([0]);
 for(const c of p.cranes)for(const a of c.wheels)for(const b of c.wheels)if(b.offset>a.offset)steps.add(Math.round(b.offset-a.offset));
 const wheelSteps=[...steps].sort((a,b)=>a-b);
 const place=(side:'A'|'B',first:number,avoid:number[]):RailRun&{conflicts:number[]}=>{
  const free=(x:number)=>!avoid.some(c=>Math.abs(x-c)<clear-1e-6);
  // The joint stations after a joint at `at`: the preferred one (a full mill length; a remainder that would leave a short
  // last piece split into two equal pieces), then, where it is within the clear distance of an avoided station, every
  // clear cut station: back to the shortest piece first (the longest piece), then ahead (at most a mill length, leaving
  // at least the shortest piece). Pieces are cut to multiples of railCutStep; full pieces stay uncut.
  const options=(at:number,length:number)=>{
   const cut=(v:number)=>at+Math.floor((v-at+1e-6)/step)*step,target=end-at-length<minPiece?cut(at+(end-at)/2):at+length;
   const list=free(target)?[target]:[];
   for(let x=cut(target);x-at>=minPiece-1e-6;x-=step)if(x<target-1e-6&&free(x))list.push(x);
   for(let x=cut(target)+step;x-at<=stock+1e-6&&end-x>=minPiece-1e-6;x+=step)if(free(x))list.push(x);
   return {target,list};
  };
  // Depth-first over those choices, the first choice at every joint first, so a clear layout found joint by joint is
  // kept; a choice that leads to a joint with no clear station is revisited (stations known to dead-end are remembered).
  const dead=new Set<number>();let nodes=0;
  const search=(at:number,length:number):number[]|undefined=>{
   if(end-at<=length+1e-6)return [];
   const key=Math.round(at);if(dead.has(key)||++nodes>4000)return undefined;
   for(const x of options(at,length).list){const rest=search(x,stock);if(rest)return [x,...rest];}
   dead.add(key);return undefined;
  };
  let joints=search(start,first);const conflicts:number[]=[];
  if(!joints){
   // No clear layout: joint by joint, the preferred station where no clear one exists (a conflict, an open item).
   joints=[];let at=start,length=first;
   for(let guard=0;guard<200&&end-at>length+1e-6;guard++){const o=options(at,length),x=o.list[0]??o.target;if(!o.list.length)conflicts.push(x);joints.push(x);at=x;length=stock;}
  }
  const stations=[start,...joints,end];
  return {side,start,end,joints,pieces:stations.slice(1).map((v,i)=>v-stations[i]),conflicts};
 };
 const both=(firstA:number)=>{
  const a=place('A',firstA,girderJoints);
  const opposite=a.joints.flatMap(j=>wheelSteps.flatMap(s=>s?[j-s,j+s]:[j]));
  // A run within one mill length has no joints on either rail. Otherwise rail B starts with a part piece, half of rail
  // A's first piece (at least the shortest piece, at most half a mill length), so its joints fall between those of A.
  const half=a.joints.length?(a.joints[0]-start)/2:0,first=!a.joints.length?stock:half>=stock/2-1e-6?stock/2:Math.max(minPiece,Math.floor((half+1e-6)/step)*step);
  return {a,b:place('B',first,[...girderJoints,...opposite])};
 };
 // Rail A starts with a full mill length. Where rail B then has no clear layout (wheel spacings of the cranes close
 // together leave no clear station within a mill length), rail A's first piece is shortened cut by cut, to the shortest
 // piece, for the first layout with every joint clear.
 let best=both(stock);
 for(let firstA=Math.floor((stock-1e-6)/step)*step;(best.a.conflicts.length||best.b.conflicts.length)&&firstA>=minPiece-1e-6;firstA-=step){
  const t=both(firstA);if(!t.a.conflicts.length&&!t.b.conflicts.length)best=t;
 }
 const strip=({conflicts:_,...r}:RailRun&{conflicts:number[]}):RailRun=>r;
 return {girderJoints,wheelSteps,rails:[strip(best.a),strip(best.b)],existing,conflicts:[...best.a.conflicts,...best.b.conflicts]};
}

/**
 * Bolted rail joints. AIST TR-13 §5.16.1 (the default): tight joints, the rail ends butted with a gap of 1/16 in or
 * less, joints staggered across the runway, joint bolts pretensioned and re-tightened after 30 and 90 days of
 * operation; the rail string floats in its clips between the end stops, which anchor it, and the clearance gaps at the
 * stops take its thermal movement. 'open' joints keep an expansion gap (jointGap) at every joint with each piece
 * anchored at mid-length by an anchor clip pair (a project choice that must be stated).
 */
export const tightJointGap=25.4/16;
export const railJointType=(p:ProjectInput):'tight'|'open'=>railJointKind(p)==='welded'?'tight':p.details?.rail.jointType??'tight';
/** How the rail pieces are joined (runwayDetails rail.jointKind): welded, supplier joint bars, or joint bars detailed here. */
export const railJointKind=(p:ProjectInput)=>p.details?.rail.jointKind??'bolted-bars';
/**
 * The AISC 360-16 Table A-3.1 category of the joint bars' net section: B for a slip-critical joint (item 2.1) or a
 * bearing-type joint installed to all the slip-critical requirements (item 2.2: pretensioned bolts and Class A faying
 * surfaces, rail.jointSlipCriticalInstall), else D (item 2.3, other mechanically fastened joints).
 */
export function railJointCategory(p:ProjectInput):{category:'B'|'D';basis:'slip-critical'|'installed'|'bearing'}{
 const k=railJointKind(p);
 if(k==='slip-critical-bars')return {category:'B',basis:'slip-critical'};
 return k!=='welded'&&p.details?.rail.jointSlipCriticalInstall?{category:'B',basis:'installed'}:{category:'D',basis:'bearing'};
}
/** The installation requirement of joint bars installed as slip-critical (Table A-3.1 item 2.2), as the notes print it. */
export const slipCriticalInstallText='installed as a slip-critical joint (bolts pretensioned per RCSC, Class A faying surfaces of clean mill scale free of paint, oil and lubricant), AISC 360-16 Table A-3.1 item 2.2';
/**
 * Joint kind for the crane duty: welded rail joints (thermite or flash-butt) for CMAA Class D to F cranes or an AIST
 * Class A or B building, where bolted joints loosen and their bars and holes fatigue under the wheel passages (AIST
 * TR-13 §5.16); otherwise the rail supplier's joint bars fitted to the rail fishing surfaces.
 */
export function railJointKindForDuty(p:ProjectInput):'welded'|'supplier-bars'{
 const heavy=p.cranes.some(c=>['D','E','F'].includes(c.design?.cmaaClass??''))||['A','B'].includes(p.aist?.buildingClass??'');
 return heavy?'welded':'supplier-bars';
}
/** Tight joints: the rail string floats in its clips between the girder-mounted end stops and may bear on either. */
export const railBearsOnStops=(p:ProjectInput)=>railJointType(p)==='tight'&&stopEnds(p).length>0;
/** Design gap at a rail joint: the entered gap for open joints, at most 1/16 in for tight joints. */
export const railJointGap=(p:ProjectInput)=>{const g=p.details?.rail.jointGap??0;return railJointType(p)==='tight'?Math.min(g,tightJointGap):g;};
/**
 * Rail joint bars, symmetric about the joint centerline: from each bar end the edge distance (jointEdge), the pitch
 * and the bolt line to the joint centerline. That last distance is the edge distance to the rail end plus half the
 * gap, rounded up to the 1/4 in grid so every dimension of the joint is a whole 1/4 in; the rail-end
 * edge distance is then at least jointEdge.
 */
export function railJointBars(p:ProjectInput){
 const r=p.details!.rail,gap=railJointGap(p),centerEdge=snapQuarter(r.jointEdge+gap/2,'up');
 const length=2*(r.jointEdge+r.jointPitch+centerEdge);
 return {gap,centerEdge,railEndEdge:centerEdge-gap/2,outerEdge:r.jointEdge,pitch:r.jointPitch,length,bolts:[r.jointEdge,r.jointEdge+r.jointPitch,length-r.jointEdge-r.jointPitch,length-r.jointEdge]};
}
/** Steel coefficient of thermal expansion, per degree C. */
export const railExpansion=12e-6;
/**
 * Rail anchors. Tight joints: none along the runway; the rail string floats in its clips and is anchored where its end
 * bears on an end stop (traction, braking and creep go into the stop). Open joints: the anchor clip pair (fixed clips
 * per manufacturer) at mid-length of each new rail piece holds it along the runway; every other clip lets it float, so
 * each piece moves thermally from its own anchor and creep cannot accumulate at one joint or at a stop. An anchor that
 * would fall within a clip length and 3 in of a girder end moves clear of it onto the girder.
 */
export function railAnchors(p:ProjectInput,layout:RailLayout=railLayout(p)){
 if(railJointType(p)==='tight')return layout.rails.map(rail=>({side:rail.side,anchors:[] as {station:number;shifted:boolean}[]}));
 const L=p.spans.reduce((s,v)=>s+v,0),half=(p.details?.rail.clip?.baseLength??95.25)/2+76.2;
 let x=0;const ends=p.system==='simple'?[0,...p.spans.map(v=>x+=v)]:[0,L];
 // Anchor clips, like the others, stand clear of the girder field splices.
 const zones=p.details?spliceClipZones(p):[];
 const girders=ends.slice(1).map((e,i)=>[ends[i]+half,e-half] as const).filter(([a,b])=>b>a).flatMap(([a,b])=>{
  let parts:(readonly [number,number])[]=[[a,b]];
  for(const [z0,z1] of zones)parts=parts.flatMap(([u,v])=>z1<=u||z0>=v?[[u,v] as const]:[...(z0>u?[[u,z0] as const]:[]),...(z1<v?[[z1,v] as const]:[])]);
  return parts;
 });
 return layout.rails.map(rail=>{
  const stations=[rail.start,...rail.joints,rail.end];
  return {side:rail.side,anchors:rail.pieces.map((_,i)=>{
   const lo=Math.max(stations[i],0),hi=Math.min(stations[i+1],L),mid=(lo+hi)/2;
   const on=girders.map(([a,b])=>Math.min(Math.max(mid,a),b)).filter(v=>v>=lo&&v<=hi);
   const at=on.length?on.reduce((best,v)=>Math.abs(v-mid)<Math.abs(best-mid)?v:best):mid;
   return {station:at,shifted:Math.abs(at-(stations[i]+stations[i+1])/2)>1};
  })};
 });
}
/**
 * Thermal movement of the rail over the rail temperature swing. Tight joints: the joints do not open or close; the
 * string floats between the end stops and may rest against either one, so the whole string's growth can reach each
 * rail end. Open joints: at each joint the two pieces close by the expansion of their lengths from their anchors; at a
 * rail end the end piece moves toward the stop. A new piece joined to an existing rail is assumed to meet a rail free
 * over half a mill length.
 */
export function railMovements(p:ProjectInput,layout:RailLayout=railLayout(p)){
 const dT=p.details?.rail.temperatureRange??0,grow=(length:number)=>railExpansion*dT*Math.abs(length),anchors=railAnchors(p,layout);
 const joints:{side:'A'|'B';station:number;movement:number}[]=[],ends:{side:'A'|'B';end:'left'|'right';station:number;movement:number;existing:boolean}[]=[];
 if(railJointType(p)==='tight'){
  // Tight joints do not open or close; the whole string grows toward the stop it is not resting on.
  layout.rails.forEach(rail=>{
   const whole=grow(rail.end-rail.start);
   rail.joints.forEach(j=>joints.push({side:rail.side,station:j,movement:0}));
   ends.push({side:rail.side,end:'left',station:rail.start,movement:whole+(layout.existing.left?grow(railLayoutCriteria.stock/2):0),existing:layout.existing.left});
   ends.push({side:rail.side,end:'right',station:rail.end,movement:whole+(layout.existing.right?grow(railLayoutCriteria.stock/2):0),existing:layout.existing.right});
  });
  return {joints,ends,anchors};
 }
 layout.rails.forEach((rail,r)=>{
  const at=anchors[r].anchors.map(a=>a.station),last=at.length-1;
  rail.joints.forEach((j,i)=>joints.push({side:rail.side,station:j,movement:grow(j-at[i])+grow(at[i+1]-j)}));
  ends.push({side:rail.side,end:'left',station:rail.start,movement:grow(at[0]-rail.start)+(layout.existing.left?grow(railLayoutCriteria.stock/2):0),existing:layout.existing.left});
  ends.push({side:rail.side,end:'right',station:rail.end,movement:grow(rail.end-at[last])+(layout.existing.right?grow(railLayoutCriteria.stock/2):0),existing:layout.existing.right});
 });
 return {joints,ends,anchors};
}
/**
 * Whether the runway has rail joints: a joint between new pieces on either rail, or the joint where a new rail continues
 * onto an existing rail. Without one each rail is one piece and no rail joint is detailed or checked.
 */
export function railHasJoints(p:ProjectInput,layout:RailLayout=railLayout(p)){return layout.existing.left||layout.existing.right||layout.rails.some(r=>r.joints.length>0);}
/**
 * The rail joint as the drawings and notes show it, from the layout and rail.jointKind: 'none' where each rail is one
 * piece (no joint detail, no joint hardware), 'welded' for thermite or flash-butt welded joints by the rail supplier (a
 * weld note, no joint bars, bolts or drilled rail), else 'bars' (the joint bars detailed, the supplier's or these).
 */
export function railJointDetail(p:ProjectInput,layout?:RailLayout):'none'|'welded'|'bars'{
 if(!p.details)return 'bars';
 if(!railHasJoints(p,layout??railLayout(p)))return 'none';
 return railJointKind(p)==='welded'?'welded':'bars';
}
/** The rail supplier's joint bars and bolts (a deferred submittal): drawn schematically, with the demands, never dimensioned here. */
export const supplierRailJoint=(p:ProjectInput)=>!!p.details&&railJointKind(p)==='supplier-bars'&&railJointDetail(p)==='bars';
/** The welded rail joint, stated once for the notes and the rail details. */
export const weldedRailJointNote='Rail joints: thermite or flash-butt welded by the rail supplier\'s qualified procedure (preheat, finish grinding of the head and inspection per the supplier), rail ends set to the supplier\'s weld gap and staggered across the runway; no joint bars, bolts or drilled holes in the rail.';
/** Largest closure of a rail joint, between new pieces or onto an existing rail: what each joint gap and slot takes. */
export function railJointMovement(m:Pick<ReturnType<typeof railMovements>,'joints'|'ends'>){
 return Math.max(0,...m.joints.map(v=>v.movement),...m.ends.filter(v=>v.existing).map(v=>v.movement));
}
