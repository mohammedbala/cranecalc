import type {ProjectInput} from './types';
import {adjacentBays,continues} from './continuation';
import {activeEndStop,stopEnds,stopRailEnd} from './endStopInputs';

const foot=304.8;
/**
 * Project rail layout criteria: rail pieces in standard 39-ft mill lengths, joints kept 2 ft clear of
 * girder joints and of the joints on the opposite rail at every wheel spacing of a crane, and no piece
 * shorter than 10 ft.
 */
export const railLayoutCriteria={stock:39*foot,clear:2*foot,minPiece:10*foot} as const;

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
 * runway A rail starts with a full piece; the runway B rail starts with a half piece so that its joints
 * fall between those of runway A.
 */
export function railLayout(p:ProjectInput):RailLayout{
 const {stock,clear,minPiece}=railLayoutCriteria,L=p.spans.reduce((a,b)=>a+b,0),step=p.units==='US'?25.4:10;
 const stop=activeEndStop(p),stops=stopEnds(p),railEnd=stop?stopRailEnd(stop):0;
 const existing={left:continues(p,'left'),right:continues(p,'right')};
 const start=existing.left?-clear:stops.includes('left')?railEnd:0,end=existing.right?L+clear:stops.includes('right')?L-railEnd:L;
 let x=0;const grids=[0,...p.spans.map(s=>x+=s)];
 const girderJoints=p.system==='simple'?grids.filter((g,i)=>(i>0&&i<grids.length-1)||adjacentBays(p).some(b=>b.station===g)):[];
 const steps=new Set<number>([0]);
 for(const c of p.cranes)for(const a of c.wheels)for(const b of c.wheels)if(b.offset>a.offset)steps.add(Math.round(b.offset-a.offset));
 const wheelSteps=[...steps].sort((a,b)=>a-b),conflicts:number[]=[];
 const place=(side:'A'|'B',first:number,avoid:number[]):RailRun=>{
  const joints:number[]=[];let at=start,length=first;
  for(let guard=0;guard<200&&end-at>length+1e-6;guard++){
   // Split a remainder that would leave a short last piece into two equal pieces.
   // Cut pieces to whole inches (10 mm); full pieces stay uncut.
   const cut=(v:number)=>at+Math.floor((v-at+1e-6)/step)*step;
   let target=end-at-length<minPiece?cut(at+(end-at)/2):at+length;
   for(let i=0;i<40;i++){
    const hit=avoid.find(c=>Math.abs(target-c)<clear-1e-6);if(hit===undefined)break;
    const back=cut(hit-clear),ahead=cut(hit+clear+step-1e-6);
    if(back-at>=minPiece)target=back;else if(ahead-at<=stock&&end-ahead>=minPiece)target=ahead;else{conflicts.push(target);break;}
   }
   joints.push(target);at=target;length=stock;
  }
  const stations=[start,...joints,end];
  return {side,start,end,joints,pieces:stations.slice(1).map((v,i)=>v-stations[i])};
 };
 const a=place('A',stock,girderJoints);
 const opposite=a.joints.flatMap(j=>wheelSteps.flatMap(s=>s?[j-s,j+s]:[j]));
 const b=place('B',stock/2,[...girderJoints,...opposite]);
 return {girderJoints,wheelSteps,rails:[a,b],existing,conflicts};
}

/** Steel coefficient of thermal expansion, per degree C. */
export const railExpansion=12e-6;
/**
 * Rail anchors: the anchor keeper pair at mid-length of each new rail piece holds the rail along the
 * runway (keepers set in rail-base notches); every other keeper lets it slide. Each piece then moves
 * thermally from its own anchor, so creep cannot accumulate at one joint or at a stop. An anchor that
 * would fall within a keeper length and 3 in of a girder end moves clear of it onto the girder.
 */
export function railAnchors(p:ProjectInput,layout:RailLayout=railLayout(p)){
 const L=p.spans.reduce((s,v)=>s+v,0),half=(p.details?.rail.clipWidth??0)/2+76.2;
 let x=0;const ends=p.system==='simple'?[0,...p.spans.map(v=>x+=v)]:[0,L];
 const girders=ends.slice(1).map((e,i)=>[ends[i]+half,e-half] as const).filter(([a,b])=>b>a);
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
 * Thermal movement of the anchored rail over the rail temperature swing: at each joint the two pieces
 * close by the expansion of their lengths from their anchors; at a rail end the end piece moves toward
 * the stop. A new piece joined to an existing rail is assumed to meet a rail free over half a mill length.
 */
export function railMovements(p:ProjectInput,layout:RailLayout=railLayout(p)){
 const dT=p.details?.rail.temperatureRange??0,grow=(length:number)=>railExpansion*dT*Math.abs(length),anchors=railAnchors(p,layout);
 const joints:{side:'A'|'B';station:number;movement:number}[]=[],ends:{side:'A'|'B';end:'left'|'right';station:number;movement:number;existing:boolean}[]=[];
 layout.rails.forEach((rail,r)=>{
  const at=anchors[r].anchors.map(a=>a.station),last=at.length-1;
  rail.joints.forEach((j,i)=>joints.push({side:rail.side,station:j,movement:grow(j-at[i])+grow(at[i+1]-j)}));
  ends.push({side:rail.side,end:'left',station:rail.start,movement:grow(at[0]-rail.start)+(layout.existing.left?grow(railLayoutCriteria.stock/2):0),existing:layout.existing.left});
  ends.push({side:rail.side,end:'right',station:rail.end,movement:grow(rail.end-at[last])+(layout.existing.right?grow(railLayoutCriteria.stock/2):0),existing:layout.existing.right});
 });
 return {joints,ends,anchors};
}
