import {z} from 'zod';
import type {ProjectInput} from './types';
import {aiscShapeByName} from '../data/aiscSections';
import {boltProperties} from './connectionStrength';
import {clipGeometry,railClipInput,railPad} from './railSeat';
import {minimumEdge} from './capAngle';
import type {RunwayDetails} from './runwayDetails';
import {activeEndStop,stopEnds} from './endStopInputs';
import {runwayEnds} from './continuation';

const inch=25.4,foot=304.8;
const pos=z.number().finite().positive(),nn=z.number().finite().nonnegative();
/**
 * One flange of a bolted field splice. `plates`: an outer plate on the flange face with an inner plate each
 * side of the web (two shear planes), the outer plate only, or the inner plates only. Inner plates are flush
 * with the flange tips. Bolt lines run along the runway: `lines` each side of the web, the inner lines `gauge`
 * apart across the web, a second line `lineSpacing` outboard; `rows` rows each side of the joint at `pitch`,
 * the first row `endDistance` from the girder end.
 */
export const flangeSpliceSchema=z.object({
 plates:z.enum(['inner-outer','outer','inner']),
 outerWidth:pos,outerThickness:pos,innerWidth:pos,innerThickness:pos,
 lines:z.number().int().min(1).max(2),gauge:pos,lineSpacing:pos,
 rows:z.number().int().min(1).max(12),pitch:pos,endDistance:pos
});
/**
 * Web splice: a plate each side of the web, centered on its mid-depth; `rows` bolts in each column at `pitch`,
 * `columns` columns each side of the joint at `spacing`, the first `endDistance` from the girder end.
 */
export const webSpliceSchema=z.object({thickness:pos,height:pos,rows:z.number().int().min(2).max(16),pitch:pos,columns:z.number().int().min(1).max(4),spacing:pos,endDistance:pos});
/**
 * Bolted slip-critical field splices of the runway girder. Pieces longer than `maxPiece` (the mill or shipping
 * length) are spliced: automatically near the low-moment regions, or at the entered stations (from grid 1).
 * `basis`: the splice develops at least the larger of the design forces and 50% of the flange strength
 * ('minimum'), or the full flange strength ('full'). `gap` is the clear gap between the girder ends and `edge`
 * the distance from the last bolt to the plate end along the runway. Canonical units mm.
 */
export const spliceSchema=z.object({
 enabled:z.boolean(),
 maxPiece:pos,
 placement:z.enum(['auto','entered']),
 stations:z.array(nn).max(12),
 basis:z.enum(['minimum','full']),
 grade:z.enum(['A325','A490']),diameter:pos,surface:z.enum(['A','B']),
 gap:nn,edge:pos,
 top:flangeSpliceSchema,bottom:flangeSpliceSchema,web:webSpliceSchema
});
export type SpliceInput=z.infer<typeof spliceSchema>;
export type FlangeSpliceInput=z.infer<typeof flangeSpliceSchema>;

/**
 * Stated placement rules. The joint stays where its plates end at least the girder depth clear of every bearing
 * plate and its stiffeners (and any tie saddle there), `attachmentClear` clear of brace stiffeners and end stop
 * base plates, and every piece is at least `minPiece` long. Rail joints stay `railLayoutCriteria.clear` from the
 * joint (railLayout.ts). Rail clips and their welds stay `clipClear` clear of the girder ends and of the top
 * flange bolt heads. Automatic stations sit 0.20 to 0.25 of the span from an interior support of a continuous
 * girder (the inflection region), as near 0.22 as the rules allow, on 5 in (127 mm) steps from that support.
 */
export const spliceRules={minPiece:10*foot,attachmentClear:6*inch,clipClear:.25*inch,window:[.2,.25] as const,target:.22,step:127};

/** The splice input when the girder is spliced: enabled on a project with runway details. */
export const activeSplices=(p:ProjectInput)=>p.details?.splices?.enabled?p.details.splices:undefined;

/** Heavy hex bolt proportions (ASME B18.2.6, ASTM A563 heavy hex nut, F436 washer) and thread stick-out. */
export function hexBolt(db:number){
 const flats=1.5*db+inch/8;
 return {flats,corners:flats*2/Math.sqrt(3),head:.625*db,nut:db-inch/64,washer:{t:inch*5/32,od:2*db+inch/8},stickout:Math.max(inch/4,db/4)};
}
/** Socket clearance from a bolt to an obstruction (AISC Manual Table 7-15), as for the other bolted details. */
export const spliceWrench=(db:number)=>Math.max(1.25*inch,1.6*db);

export interface FlangeSpliceGeometry {
 input:FlangeSpliceInput;top:boolean;outer:boolean;inner:boolean;planes:1|2;
 /** Bolt line offsets from the web C/L, one side; rows along the runway from the joint C/L, one side. */
 lines:number[];rows:number[];
 /** Plate half-length from the joint C/L; outer and inner plate areas (both inner plates). */
 half:number;length:number;Ao:number;Ai:number;
 /** Inner plate extent across the runway, one side (from the web C/L). */
 innerFrom:number;innerTo:number;
 boltsPerSide:number;
}
export interface WebSpliceGeometry {input:SpliceInput['web'];rows:number[];columns:number[];half:number;length:number;verticalEdge:number;boltsPerSide:number}
/** Bolt, plate and hole geometry of the splice from the inputs; the same for every splice of the runway. */
export function spliceGeometry(p:ProjectInput,sp:SpliceInput){
 const b=p.section,bolt=boltProperties(sp.grade,sp.diameter),hex=hexBolt(sp.diameter);
 const shape=aiscShapeByName(b.catalogueId??''),kdes=shape?shape.kdes*inch:b.tf,k1=b.tw/2+Math.max(0,kdes-b.tf);
 const rowsFrom=(n:number,first:number,pitch:number)=>Array.from({length:n},(_,i)=>sp.gap/2+first+i*pitch);
 const flange=(f:FlangeSpliceInput,top:boolean):FlangeSpliceGeometry=>{
  const outer=f.plates!=='inner',inner=f.plates!=='outer',half=sp.gap/2+f.endDistance+(f.rows-1)*f.pitch+sp.edge;
  return {input:f,top,outer,inner,planes:outer&&inner?2:1,lines:Array.from({length:f.lines},(_,j)=>f.gauge/2+j*f.lineSpacing),rows:rowsFrom(f.rows,f.endDistance,f.pitch),
   half,length:2*half,Ao:outer?f.outerWidth*f.outerThickness:0,Ai:inner?2*f.innerWidth*f.innerThickness:0,innerFrom:b.bf/2-f.innerWidth,innerTo:b.bf/2,boltsPerSide:2*f.lines*f.rows};
 };
 const w=sp.web,webHalf=sp.gap/2+w.endDistance+(w.columns-1)*w.spacing+sp.edge;
 const web:WebSpliceGeometry={input:w,rows:Array.from({length:w.rows},(_,j)=>(j-(w.rows-1)/2)*w.pitch),columns:rowsFrom(w.columns,w.endDistance,w.spacing),half:webHalf,length:2*webHalf,verticalEdge:(w.height-(w.rows-1)*w.pitch)/2,boltsPerSide:w.rows*w.columns};
 const top=flange(sp.top,true),bottom=flange(sp.bottom,false);
 return {bolt,hole:bolt.hole,deduct:bolt.hole+inch/16,hex,kdes,k1,top,bottom,web,half:Math.max(top.half,bottom.half,web.half),wrench:spliceWrench(sp.diameter),minEdge:minimumEdge(sp.diameter)};
}
export type SpliceGeometry=ReturnType<typeof spliceGeometry>;

/** Girders as erected: the whole runway when continuous, each bay's girder when simple (end gaps at shared grids). */
export function girderSegmentsOf(p:ProjectInput){
 const L=p.spans.reduce((a,v)=>a+v,0);
 if(p.system==='continuous')return [{bay:1,start:0,end:L}];
 // At a runway-end grid with the bearing centered on the grid the girder runs half the bearing length past it (as
 // simpleSupports endGridOverhang): the piece, its schedule length and the 3D model end there.
 const gap=p.details?.simpleSupport?.endGap??25.4,ends=runwayEnds(p),past=(end:'left'|'right')=>p.details?.simpleSupport?.endGridBearing==='centered'&&ends.includes(end)?(p.details.bearing.length??254)/2:0;let x=0;
 return p.spans.map((s,i)=>{const a=x;x+=s;return {bay:i+1,start:a+(i?gap/2:-past('left')),end:x-(i<p.spans.length-1?gap/2:-past('right'))};});
}
const gridsOf=(p:ProjectInput)=>p.spans.reduce((a,v)=>[...a,a.at(-1)!+v],[0]);

/** Intervals the joint station may not fall in, with what each keeps clear. */
export function spliceZones(p:ProjectInput,g:SpliceGeometry){
 const d=p.details!,b=p.section,bs=d.bearing,grids=gridsOf(p),L=grids.at(-1)!,h=g.half,{attachmentClear}=spliceRules,zones:{from:number;to:number;what:string;clear:number}[]=[];
 const Lb=bs.length;
 if(p.system==='simple')for(const m of girderSegmentsOf(p)){
  zones.push({from:m.start-h,to:m.start+Lb+b.d+h,what:`the bearing at the girder end, grid ${m.bay}`,clear:b.d});
  zones.push({from:m.end-Lb-b.d-h,to:m.end+h,what:`the bearing at the girder end, grid ${m.bay+1}`,clear:b.d});
 }else grids.forEach((x,i)=>{const start=i===0?0:i===grids.length-1?L-Lb:x-Lb/2;zones.push({from:i===0?-Infinity:start-b.d-h,to:i===grids.length-1?Infinity:start+Lb+b.d+h,what:`the bearing and stiffeners at grid ${i+1}`,clear:b.d});});
 // Brace stations between the grids carry a stiffener and tie on the girder.
 const series=(spacing:number)=>{const s:number[]=[];if(spacing>0)for(let i=1;i*spacing<L-1e-6;i++)s.push(i*spacing);return s;};
 const braces=[...new Set([...series(p.lateralBraceSpacing),...series(p.aist?.bottomBraceSpacing||L)])].filter(x=>grids.every(gx=>Math.abs(gx-x)>1e-6));
 for(const x of braces){const r=bs.stiffenerThickness/2+bs.weldSize+attachmentClear+h;zones.push({from:x-r,to:x+r,what:'the brace stiffener and tie',clear:attachmentClear});}
 const stop=activeEndStop(p);
 if(stop){const front=stop.setback+stop.base.length+attachmentClear+h;for(const end of stopEnds(p))zones.push(end==='left'?{from:-Infinity,to:front,what:'the end stop at grid 1',clear:attachmentClear}:{from:L-front,to:Infinity,what:`the end stop at grid ${grids.length}`,clear:attachmentClear});}
 return zones;
}

/**
 * Where rail clips (and anchor clips) may not stand at a splice, as open intervals of the clip center
 * along the runway: never across or within `clipClear` of the girder ends at the joint, and, when the top
 * flange bolt heads fall within the clips' width across the runway (with the rail setting allowance), not
 * within `clipClear` of the heads. Clip footprints include their end fillets. A clip may then sit in the
 * pocket between a girder end and its first bolt row when the end distance leaves room for it.
 */
export function clipZones(p:ProjectInput,stations:number[],g:SpliceGeometry,sp:SpliceInput){
 const d=p.details!,k=clipGeometry(d.rail,railPad(p)?.thickness??0),tol=d.criteria.alignmentTolerance,c=g.hex.corners/2,clr=spliceRules.clipClear;
 const lo=k.inner-tol,hi=k.outer+tol,clash=g.top.lines.some(y=>y+c>lo&&y-c<hi),reach=k.baseLength/2+k.weld+clr;
 const joint=sp.gap/2+reach,first=g.top.rows[0]-c-reach,last=g.top.rows.at(-1)!+c+reach;
 return stations.flatMap(s=>!clash?[[s-joint,s+joint]]:first>joint?[[s-last,s-first],[s-joint,s+joint],[s+first,s+last]]:[[s-last,s+last]]) as [number,number][];
}

export interface GirderPiece {segment:number;bay:number;start:number;end:number;length:number;left:'end'|'splice';right:'end'|'splice';leftSplice?:number;rightSplice?:number}
export interface SpliceLayout {stations:number[];pieces:GirderPiece[];errors:string[];geometry?:SpliceGeometry}

/** Pieces of each girder between its ends and the joints at `stations`. */
function piecesOf(p:ProjectInput,stations:number[],gap:number):GirderPiece[]{
 const out:GirderPiece[]=[];
 girderSegmentsOf(p).forEach((m,si)=>{
  const inside=stations.map((x,i)=>({x,i})).filter(v=>v.x>m.start&&v.x<m.end);
  let start=m.start,left:'end'|'splice'='end',leftSplice:number|undefined;
  for(const v of inside){out.push({segment:si,bay:m.bay,start,end:v.x-gap/2,length:v.x-gap/2-start,left,right:'splice',...(leftSplice!==undefined?{leftSplice}:{}),rightSplice:v.i});start=v.x+gap/2;left='splice';leftSplice=v.i;}
  out.push({segment:si,bay:m.bay,start,end:m.end,length:m.end-start,left,right:'end',...(leftSplice!==undefined?{leftSplice}:{})});
 });
 return out;
}

/** Automatic stations: the fewest joints that keep every piece within the maximum, nearest the low-moment regions. */
function automaticStations(p:ProjectInput,sp:SpliceInput,allowed:(x:number)=>boolean):number[]|undefined{
 const {minPiece,window,target,step}=spliceRules,max=sp.maxPiece,grids=gridsOf(p),out:number[]=[];
 const piece=(a:number,b:number,ends:number)=>b-a-ends*sp.gap/2,ok=(len:number)=>len<=max+1e-6&&len>=minPiece-1e-6;
 const fits=(xs:number[],a:number,z:number)=>{const s=[a,...xs,z];return s.slice(1).every((v,i)=>ok(piece(s[i],v,(i>0?1:0)+(i<s.length-2?1:0))));};
 for(const m of girderSegmentsOf(p)){
  const len=m.end-m.start;if(len<=max+1e-6)continue;
  let chosen:number[]|undefined;
  if(p.system==='continuous'){
   // Candidates in the inflection window each side of every interior support, nearest 0.22 L first.
   type Node={x:number;dev:number};const nodes:Node[]=[];
   for(let j=1;j<grids.length-1;j++)for(const [side,span] of [[-1,p.spans[j-1]],[1,p.spans[j]]] as const){
    for(let t=Math.ceil(window[0]*span/step-1e-9)*step;t<=window[1]*span+1e-6;t+=step){const x=grids[j]+side*t;if(x>m.start&&x<m.end&&allowed(x))nodes.push({x,dev:Math.abs(t/span-target)});}
   }
   nodes.sort((a,b)=>a.x-b.x);
   // Shortest chain from the girder start to its end: fewest joints, then nearest 0.22 L, then the shortest longest piece.
   type Cost={k:number;longest:number;dev:number;prev:number};
   const better=(a:Cost,b?:Cost)=>!b||a.k<b.k||a.k===b.k&&(a.dev<b.dev-1e-9||Math.abs(a.dev-b.dev)<=1e-9&&a.longest<b.longest-1);
   const best:(Cost|undefined)[]=nodes.map(()=>undefined);
   nodes.forEach((n,i)=>{
    const first=piece(m.start,n.x,1);if(ok(first))best[i]={k:1,longest:first,dev:n.dev,prev:-1};
    for(let j=0;j<i;j++){const c=best[j],len=piece(nodes[j].x,n.x,2);if(!c||!ok(len))continue;const v={k:c.k+1,longest:Math.max(c.longest,len),dev:c.dev+n.dev,prev:j};if(better(v,best[i]))best[i]=v;}
   });
   let end:Cost|undefined,at=-1;
   nodes.forEach((n,i)=>{const c=best[i],len=piece(n.x,m.end,1);if(!c||!ok(len))return;const v={...c,longest:Math.max(c.longest,len)};if(better(v,end)){end=v;at=i;}});
   if(end){chosen=[];for(let i=at;i>=0;i=best[i]!.prev)chosen.unshift(nodes[i].x);}
  }
  if(!chosen){
   // A simple bay (or a continuous girder without a usable inflection window): one joint as near a girder end as
   // the maximum length allows; two or more with full-length interior pieces and equal end pieces.
   for(let k=Math.ceil(len/max)-1;k<=Math.ceil(len/max)+1&&!chosen;k++){
    const endPiece=k===1?Math.max(len-max-sp.gap,minPiece):(len-(k-1)*max-k*sp.gap)/2;
    const ideal=Array.from({length:k},(_,i)=>m.start+endPiece+sp.gap/2+i*(max+sp.gap));
    const snapped=ideal.map(x=>m.start+Math.ceil((x-m.start)/step-1e-9)*step);
    // Shift the joints toward mid-girder until they clear every zone and every piece still fits.
    for(let shift=0;shift<=len/2&&!chosen;shift+=step)for(const set of k===1?[snapped,snapped.map(x=>m.end-(x-m.start))]:[snapped]){
     const trial=set.map(x=>x+(x<(m.start+m.end)/2?1:-1)*shift);
     if(!chosen&&trial.every(allowed)&&fits(trial,m.start,m.end))chosen=trial;
    }
   }
  }
  if(!chosen)return undefined;
  out.push(...chosen);
 }
 return out;
}

const ft=(v:number)=>{const total=Math.round(v/inch*8)/8,f=Math.floor(total/12+1e-9),i=total-12*f;return `${f}'-${Number(i.toFixed(3))}"`;};
/**
 * Splice stations, girder pieces and placement errors. Automatic placement splices only the girders longer than
 * the maximum piece; entered stations are used as given and checked against the same rules.
 */
export function spliceLayout(p:ProjectInput):SpliceLayout{
 const sp=activeSplices(p);
 if(!sp||!p.details||p.section.kind==='cap')return {stations:[],pieces:piecesOf(p,[],0),errors:[]};
 // Nothing to splice: every girder within the maximum piece, or no entered station.
 if(sp.placement==='auto'?girderSegmentsOf(p).every(m=>m.end-m.start<=sp.maxPiece+1e-6):!sp.stations.length)return {stations:[],pieces:piecesOf(p,[],0),errors:[]};
 let g:SpliceGeometry;
 try{g=spliceGeometry(p,sp);}catch(e){return {stations:[],pieces:piecesOf(p,[],0),errors:[e instanceof Error?e.message:String(e)]};}
 const zones=spliceZones(p,g),errors:string[]=[],L=p.spans.reduce((a,v)=>a+v,0);
 const hit=(x:number)=>zones.find(z=>x>z.from-1e-6&&x<z.to+1e-6);
 let stations:number[];
 if(sp.placement==='entered'){
  stations=[...sp.stations].sort((a,b)=>a-b);
  const segs=girderSegmentsOf(p);
  stations.forEach((x,i)=>{
   if(x<=0||x>=L||!segs.some(m=>x-g.half>m.start&&x+g.half<m.end))errors.push(`splice ${i+1} at ${ft(x)} from grid 1 must lie within one girder, its plates clear of the girder ends.`);
   else{const z=hit(x);if(z)errors.push(`splice ${i+1} at ${ft(x)} from grid 1: its plates must end ${z.clear===p.section.d?'the girder depth':ft(z.clear)} clear of ${z.what}.`);}
  });
  if(stations.some((x,i)=>i>0&&x-stations[i-1]-sp.gap<spliceRules.minPiece-1e-6))errors.push(`splices must be at least ${ft(spliceRules.minPiece)} apart: every girder piece is at least that long.`);
 }else{
  const auto=automaticStations(p,sp,x=>!hit(x));
  if(!auto){errors.push(`automatic splice placement cannot keep every girder piece within ${ft(sp.maxPiece)} with its splices clear of the bearings, braces and end stops: enter the splice stations or increase the maximum piece length.`);stations=[];}
  else stations=auto;
 }
 return {stations,pieces:piecesOf(p,stations,sp.gap),errors,geometry:g};
}
/** Joint stations of the girder splices (empty when the girder is not spliced or the placement is invalid). */
export function spliceStations(p:ProjectInput){const l=spliceLayout(p);return l.errors.length?[]:l.stations;}
/** Girder pieces between girder ends and splices; the girders themselves when not spliced. */
export const girderPieces=(p:ProjectInput)=>{const l=spliceLayout(p);return l.errors.length?piecesOf(p,[],0):l.pieces;};
/** Stations the moving-load search places wheels over: each joint and the outermost flange bolt rows each side. */
export function spliceCriticalStations(p:ProjectInput){
 const sp=activeSplices(p),stations=spliceStations(p);
 if(!sp||!stations.length)return [];
 const g=spliceGeometry(p,sp),L=p.spans.reduce((a,v)=>a+v,0);
 return stations.flatMap(s=>[s,s-g.top.rows.at(-1)!,s+g.top.rows.at(-1)!,s-g.bottom.rows.at(-1)!,s+g.bottom.rows.at(-1)!]).filter(x=>x>0&&x<L);
}
/** Clip-center exclusion intervals of the active splices, for the clip and rail anchor layouts. */
export function spliceClipZones(p:ProjectInput){
 const sp=activeSplices(p),stations=spliceStations(p);
 if(!sp||!stations.length)return [];
 return clipZones(p,stations,spliceGeometry(p,sp),sp);
}

/** Splice marks SP1, SP2, ... in station order. */
export const spliceMark=(i:number)=>`SP${i+1}`;

/**
 * Validation of the splice inputs: geometry that cannot be built (bolts off the plates or flanges, plates in the
 * web fillets, an outer plate under the rail), placement, and the capped girder, whose cap channel splice is
 * outside this calculation.
 */
export function validateSplices(p:ProjectInput):string[]{
 const sp=activeSplices(p);if(!sp)return [];
 const errors:string[]=[],add=(test:boolean,message:string)=>{if(test)errors.push(`details.splices: ${message}`);};
 const longest=Math.max(...girderSegmentsOf(p).map(m=>m.end-m.start));
 if(p.section.kind==='cap'){
  add(sp.placement==='entered'?sp.stations.length>0:longest>sp.maxPiece+1e-6,'a capped girder piece longer than the maximum piece length needs a splice of the cap channel as well as the W section; that splice is outside this calculation. Use a rolled girder, or capped girders within the maximum piece length.');
  return errors;
 }
 if(sp.placement==='auto'?longest<=sp.maxPiece+1e-6:!sp.stations.length)return errors;
 if(!p.section.catalogueId){add(true,'girder splices require a catalogue rolled W section (its fillet dimensions locate the plates).');return errors;}
 let g:SpliceGeometry;
 try{g=spliceGeometry(p,sp);}catch(e){add(true,e instanceof Error?e.message:String(e));return errors;}
 const b=p.section,d=p.details!,r=d.rail,tol=d.criteria.alignmentTolerance,e=g.minEdge,c=g.hex.corners/2,inches=(v:number)=>`${Number((v/inch).toFixed(3))} in`;
 for(const f of [g.top,g.bottom]){
  const name=f.top?'top flange':'bottom flange',outerLine=f.lines.at(-1)!;
  add(outerLine+e>b.bf/2+1e-6,`${name} outer bolt line must be at least the J3.4 edge distance (${inches(e)}) inside the flange tip.`);
  if(f.outer){add(f.input.outerWidth>b.bf+1e-6,`${name} outer plate cannot be wider than the flange.`);add(outerLine+e>f.input.outerWidth/2+1e-6,`${name} bolts must be at least the J3.4 edge distance inside the outer plate edges.`);}
  if(f.inner){
   add(f.innerFrom<g.k1+inch/8-1e-6,`${name} inner plates must clear the web fillet by 1/8 in (inner edge at least k1 + 1/8 in = ${inches(g.k1+inch/8)} from the web C/L): narrow them.`);
   add(f.lines[0]-e<f.innerFrom-1e-6,`${name} inner bolt line must be at least the J3.4 edge distance inside the inner plate edge.`);
  }
  // Nuts inside the section are turned by a socket beside the web fillet.
  add(f.lines[0]-g.k1<g.wrench-1e-6,`${name} inner bolt line must leave the ${inches(g.wrench)} socket clearance to the web fillet (k1): widen the gauge.`);
  add(f.input.endDistance<e-1e-6,`${name} first bolt row must be at least the J3.4 edge distance (${inches(e)}) from the girder end.`);
 }
 // The rail, its pad and clips bear on the top flange across the splice: an outer plate must clear them.
 {const pad=railPad(p),railHalf=Math.max(r.baseWidth,pad?.width??0)/2+tol;
  if(g.top.outer)add(g.top.input.outerWidth/2>-railHalf,'the rail, its pad and its clips bear on the top flange over the splice, and an outer splice plate on the top flange lies under them: use inner plates only on the top flange.');
  add(g.top.lines[0]-c<railHalf+inch/16-1e-6,'top flange bolt heads must clear the rail base (and pad) by 1/16 in with the rail setting allowance: widen the top flange gauge.');}
 // Web plates between the flange bolt nuts (and the inner plates) and clear of the fillets.
 const nutZone=(f:FlangeSpliceGeometry)=>b.tf+(f.inner?f.input.innerThickness:0)+g.hex.washer.t+g.hex.nut+g.hex.stickout;
 const webTop=b.d/2-Math.max(g.kdes,nutZone(g.top))-inch/4,webBottom=b.d/2-Math.max(g.kdes,nutZone(g.bottom))-inch/4;
 add(sp.web.height/2>Math.min(webTop,webBottom)+1e-6,`web splice plates must stay 1/4 in clear of the web fillets and of the flange bolt nuts and inner plates: height at most ${inches(2*Math.min(webTop,webBottom))}.`);
 add(g.web.verticalEdge<e-1e-6,'web splice bolts must be at least the J3.4 edge distance from the plate top and bottom edges.');
 add(sp.web.endDistance<e-1e-6,`web bolts must be at least the J3.4 edge distance (${inches(e)}) from the girder end.`);
 add(sp.edge<e-1e-6,`splice plate end distance must be at least ${inches(e)} (AISC 360-16 Table J3.4).`);
 // Clips stop each side of the splice; no clip gap may exceed the clip spacing.
 const layout=spliceLayout(p);
 for(const m of layout.errors)add(true,m);
 if(!layout.errors.length&&layout.stations.length&&p.aist){
  const gaps=clipGaps(p,layout.stations,clipZones(p,layout.stations,g,sp));
  add(gaps>p.aist.clipSpacing+1e-6,`the rail clips each side of a splice stand ${inches(gaps)} apart, more than the ${inches(p.aist.clipSpacing)} clip spacing: shorten the top flange bolt group or lengthen its end distance so a clip fits between the girder end and the first bolt row.`);
 }
 return errors;
}

/**
 * Clip stations between `a` and `z` avoiding the exclusion intervals: clips at both ends of every allowed
 * stretch and evenly between at no more than `spacing`; a stretch shorter than the spacing between two
 * exclusions (the pocket at a joint) takes one clip, at its end beside the longer exclusion.
 */
export function clipStationsAvoiding(a:number,z:number,spacing:number,zones:[number,number][]){
 const cut=[...zones].filter(v=>v[1]>a&&v[0]<z).sort((u,v)=>u[0]-v[0]),stretches:{lo:number;hi:number;before?:[number,number];after?:[number,number]}[]=[];
 let lo=a,prev:[number,number]|undefined;
 for(const v of cut){if(v[0]>lo+1e-6)stretches.push({lo,hi:v[0],...(prev?{before:prev}:{}),after:v});lo=Math.max(lo,v[1]);prev=v;}
 if(z>lo+1e-6)stretches.push({lo,hi:z,...(prev?{before:prev}:{})});
 const out:number[]=[];
 for(const s of stretches){
  const len=s.hi-s.lo;
  if(s.before&&s.after&&len<=spacing){out.push(s.before[1]-s.before[0]>=s.after[1]-s.after[0]?s.lo:s.hi);continue;}
  const count=Math.max(1,Math.ceil(len/spacing-1e-9));
  for(let i=0;i<=count;i++)out.push(s.lo+len*i/count);
 }
 return out;
}
/** Largest gap between neighbouring clips within three clip spacings of a splice. */
export function clipGaps(p:ProjectInput,stations:number[],zones:[number,number][],clips?:number[]){
 const L=p.spans.reduce((a,v)=>a+v,0),spacing=p.aist?.clipSpacing??600,ks=[...(clips??clipStationsAvoiding(0,L,spacing,zones))].sort((a,b)=>a-b);
 let worst=0;
 for(let i=1;i<ks.length;i++)if(stations.some(s=>Math.abs((ks[i]+ks[i-1])/2-s)<3*spacing))worst=Math.max(worst,ks[i]-ks[i-1]);
 return worst;
}

const ksi=6.894757293;
/**
 * Splice inputs for a new detailed design, sized to the girder, rail and clips; the engineer reviews them. The top
 * flange takes inner plates under the rail, its bolts outboard of the rail base with a clip between each girder
 * end and the first bolt row; the bottom flange outer and inner plates. Rows are sized for half the flange yield
 * strength in bolt shear, to be confirmed by the checks.
 */
export function defaultSplices(p:ProjectInput,rail?:RunwayDetails['rail'],db=inch):SpliceInput{
 const b=p.section,shape=aiscShapeByName(b.catalogueId??''),kdes=shape?shape.kdes*inch:b.tf,k1=b.tw/2+Math.max(0,kdes-b.tf),hex=hexBolt(db),e=minimumEdge(db);
 const up=(v:number,s:number)=>Math.ceil(v/s-1e-9)*s,down=(v:number,s:number)=>Math.floor(v/s+1e-9)*s;
 const railHalf=Math.max(rail?.baseWidth??0,rail?.padWidth??0)/2+.125*inch;
 const topGauge=up(2*Math.max(railHalf+inch/16+hex.corners/2,k1+spliceWrench(db)),.25*inch),bottomGauge=up(2*(k1+spliceWrench(db)),.25*inch);
 const innerWidth=Math.max(2*inch,down(b.bf/2-k1-inch/8,.25*inch)),inner=up(Math.max(b.tf/2+inch/16,.5*inch),.125*inch),outer=up(Math.max(b.tf/2,.5*inch),.125*inch);
 const shear=.75*68*ksi*Math.PI*db**2/4,Pf=.5*.9*50*ksi*b.bf*b.tf;
 const rowsFor=(planes:number)=>Math.min(12,Math.max(2,Math.ceil(Pf/(shear*planes*2))));
 // A clip between the girder end and the first top bolt row: its length and end fillets, 1/4 in each side, and the head.
 const clipBase=railClipInput(rail),clip=clipBase.baseLength+2*clipBase.weld+2*spliceRules.clipClear+hex.corners/2;
 // Bolts at 3 in, at least the J3.3 minimum 2 2/3 d on the 1/4 in grid (3 1/2 in for 1 1/4 in bolts).
 const webPitch=Math.max(3*inch,up(8/3*db,.25*inch));
 const webHeight=down(b.d-2*b.tf-2*Math.max(kdes-b.tf,inner+hex.washer.t+hex.nut+hex.stickout)-inch,.5*inch);
 return {enabled:true,maxPiece:60*foot,placement:'auto',stations:[],basis:'minimum',grade:'A490',diameter:db,surface:'B',gap:.375*inch,edge:up(e,.125*inch),
  top:{plates:'inner',outerWidth:down(b.bf,.25*inch),outerThickness:outer,innerWidth,innerThickness:inner,lines:1,gauge:topGauge,lineSpacing:webPitch,rows:Math.min(5,rowsFor(1)),pitch:webPitch,endDistance:up(clip,.25*inch)},
  bottom:{plates:'inner-outer',outerWidth:down(b.bf,.25*inch),outerThickness:outer,innerWidth,innerThickness:inner,lines:1,gauge:bottomGauge,lineSpacing:webPitch,rows:rowsFor(2),pitch:webPitch,endDistance:up(e,.125*inch)},
  web:{thickness:up(Math.max(b.tw/2+inch/16,.375*inch),.125*inch),height:Math.max(6*inch,webHeight),rows:Math.max(2,Math.floor((Math.max(6*inch,webHeight)-2*e)/webPitch)+1),pitch:webPitch,columns:2,spacing:webPitch,endDistance:up(e,.125*inch)}};
}
