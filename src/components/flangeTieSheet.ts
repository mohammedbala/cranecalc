import {elementSummary,inElements,summaryNote,calculationRef} from './sheetRatios';
import {viewConflict,conflictView} from './detailHolds';
import {supportColumn} from '../engine/drawingData';
import {sleeveSpec} from '../engine/materialSpecs';
import type {CalculationSnapshot} from '../engine/types';
import {flangeTieGeometry,tieRelease} from '../engine/tieGeometry';
import {capClearance} from '../engine/flangeTieDesign';
import {plateAlignment} from '../engine/plateTie';
import {activeEndBearing} from '../engine/endBearingInputs';
import {activeEndStop} from '../engine/endStopInputs';
import {boltProperties} from '../engine/connectionStrength';
import {format} from '../engine/units';
import {plateInches,dimensionLength,limitLength} from './drawingFormat';
import {deliveredForces} from '../engine/forcesDelivered';
import {capChannelProfile} from '../engine/channelProfile';
import {dimText,sheetDrawingScale as drawingScale,line,rect,circle,text,dimH,filletLeader,multiLeader,detailRef,detailTitles,columnReference,breakLine,textWidth,labelCaps,n,sectionCut,capChannelSection,lettering,type XY} from './sheetGraphics';
import {heading,numbered,paragraph,type Style} from './noteBlocks';
import {topicSheetSvg,type DetailTopic,type ViewRender} from './detailSheet';
import {AnnotationSpace} from './annotationSpace';
/** The travel the slots give, floored (never overstated): the 1/64 in limit form in US units; in SI on the sheet's
 * half-millimetre grid, as the slot and sleeve sizes it comes from are printed. */
const slotTravel=(mm:number,u:'US'|'SI')=>u==='SI'?`${Math.floor(2*mm+1e-9)/2} mm`:limitLength(mm,u,'max');

type Units=CalculationSnapshot['input']['units'];
/** SI drawing values to the millimeter, or the half millimeter under 25 mm: no soft-converted decimals. */
const siLength=(mm:number)=>`${(mm>=25?Math.round(mm):Math.round(mm*2)/2).toLocaleString('en-US')} mm`;
/** Plate, bolt and weld sizes: inch fractions, or SI millimeters. */
export const tieSize=(mm:number,u:Units)=>u==='US'?plateInches(mm,'US'):siLength(mm);
/** Dimensions: feet and inches, or SI millimeters. */
export const tieDim=(mm:number,u:Units)=>u==='US'?dimensionLength(mm,'US'):siLength(mm);
/** Weld length beside the weld symbol: inches and fractions without the inch mark (AWS A2.4), or millimeters. */
export function weldLength(mm:number,u:Units){
 if(u==='SI')return siLength(mm);
 const ticks=Math.round(mm/25.4*16),whole=Math.floor(ticks/16);let a=ticks%16,d=16;
 while(a&&a%2===0){a/=2;d/=2;}
 return a?`${whole?`${whole} `:''}${a}/${d}`:`${whole}`;
}
/** A fillet weld: size and length, on the arrow side only or on both sides of the joint. */
export interface Weld {size:string;length:string;both:boolean;field?:boolean}
/**
 * AWS A2.4 fillet weld symbol for one joint: the size left of the fillet triangle and the length right of it,
 * on the arrow side, or the same on both sides of the reference line for a both-sides fillet.
 */
export function weldLeader(points:XY[],at:XY,w:Weld,labels:string[],via:XY[][]=[]){
 const svg=filletLeader(points,at,w.size,labels,w.both,via,!!w.field),x=at[0]+41,y=at[1]-3,length=labelCaps(w.length.replaceAll('"',''));
 return svg.slice(0,-4)+dimText(x+12,y+7,length,8)+(w.both?dimText(x+12,y-2,length,8):'')+'</g>';
}
type Callout={at:XY;labels:string[];weld?:Weld};
const calloutHeight=(v:Callout)=>(v.weld?17:0)+v.labels.length*11;
/**
 * Leaders to a column of callouts and weld symbols from `top`, ordered by target height so no two leaders
 * cross, at the minimum spacing.
 */
function calloutColumn(items:Callout[],x:number,top:number){
 const sorted=[...items].sort((a,b)=>a.at[1]-b.at[1]),gap=8;
 const slots=()=>{let y=top;return sorted.map(v=>{const at=y;y+=calloutHeight(v)+gap;return at;});};
 const route=(v:Callout,y:number):[XY,XY]=>{const w=v.weld?89:Math.max(0,...v.labels.map(l=>textWidth(labelCaps(l),8.5))),ly=(v.weld?y+3:y)-3;return [v.at,v.at[0]>x+w?[x+w+14,ly]:[x-14,ly]];};
 const crosses=([a,b]:[XY,XY],[c,d]:[XY,XY])=>{const o=(p:XY,q:XY,r:XY)=>Math.sign((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]));return o(a,b,c)*o(a,b,d)<0&&o(c,d,a)*o(c,d,b)<0;};
 for(let pass=0;pass<sorted.length;pass++){
  let swapped=false;const ys=slots();
  for(let i=0;i+1<sorted.length;i++)if(crosses(route(sorted[i],ys[i]),route(sorted[i+1],ys[i+1]))){[sorted[i],sorted[i+1]]=[sorted[i+1],sorted[i]];swapped=true;break;}
  if(!swapped)break;
 }
 const ys=slots();
 return sorted.map((v,i)=>v.weld?weldLeader([v.at],[x,ys[i]+3],v.weld,v.labels):multiLeader([v.at],[x,ys[i]],v.labels)).join('');
}
/** Height of a callout column at the minimum spacing. */
const columnHeight=(items:Callout[])=>items.reduce((a,v)=>a+calloutHeight(v),0)+8*Math.max(0,items.length-1);
/** Top of a callout column centered on the band of its targets, so leaders fan out above and below. */
const columnTop=(items:Callout[])=>{const ys=items.map(v=>v.at[1]);return (Math.min(...ys)+Math.max(...ys))/2-columnHeight(items)/2;};
/**
 * Chained horizontal dimensions on one dimension line. A value too long for its segment reads beyond the
 * outer extension line of an end segment, on the dimension line carried out to it, or under the line at an
 * inner segment.
 */
function chainH(xs:number[],fromY:number,y:number,labels:string[],drawn=new AnnotationSpace()){
 let svg=drawn.add(line([xs[0],y],[xs[xs.length-1],y]));
 for(const x of xs)svg+=drawn.add(line([x,fromY],[x,y+5])+line([x-2.5,y+3],[x+2.5,y-3]));
 const size=lettering.text;
 labels.forEach((v,i)=>{
  const a=xs[i],b=xs[i+1],w=textWidth(v,size),left=line([a-w-6,y],[a,y])+dimText(a-4,y-5,v,size,'end'),right=line([b,y],[b+w+6,y])+dimText(b+4,y-5,v,size,'start'),under=dimText((a+b)/2,y+size+3,v,size,'middle');
  // Between its extension lines where it fits; else the first place that reads clear of the drawn content.
  svg+=w+6<=b-a?drawn.add(dimText((a+b)/2,y-5,v,size,'middle')):drawn.pick(i===0?[left,under,right]:i===labels.length-1?[right,under,left]:[under,left,right]);
 });
 return svg;
}
/** Bolt group positions from a plate end: the first edge, then the rows at the pitch, closing with the edge. */
function groupChain(from:number,c:{rows:number;pitch:number;edge:number},size:(v:number)=>string,first=c.edge){
 const xs=[from,from+first],labels=[size(first)];
 if(c.rows>1){xs.push(from+c.edge+(c.rows-1)*c.pitch);labels.push(c.rows>2?`${c.rows-1} @ ${size(c.pitch)}`:size(c.pitch));}
 xs.push(xs[xs.length-1]+c.edge);labels.push(size(c.edge));
 return {xs,labels};
}
/** Rounded slot outline along y (vertical on the sheet). */
function verticalSlot(cx:number,cy:number,length:number,width:number,cls:string){const r=width/2,a=cy-length/2+r,b=cy+length/2-r;return `<path class="${cls}" d="M${n(cx-r)},${n(a)}A${n(r)},${n(r)} 0 0 1 ${n(cx+r)},${n(a)}L${n(cx+r)},${n(b)}A${n(r)},${n(r)} 0 0 1 ${n(cx-r)},${n(b)}Z"/>`;}
/** Fillet weld in section: a triangle in the corner at (x, y), its legs along +-x (dir) and +y (down the sheet). */
const filletSection=(x:number,y:number,dir:number,leg:number)=>`<path class="runway-line" d="M${n(x)},${n(y)}l${n(dir*leg)},0L${n(x)},${n(y+leg)}Z"/>`;
/** The column the tie is welded to, as drawn and named on the tie details. */
function tieColumn(s:CalculationSnapshot){
 const p=s.input,g=flangeTieGeometry(p)!,col=supportColumn(p);
 return {...col,flange:g.receiver?.flangeThickness??25.4,cls:col.isNew?'runway-line':'reference-line',
  label:col.isNew?col.name:g.receiver?'EXISTING COLUMN':'COLUMN BY OTHERS'};
}

/** Transverse elevation of the top-flange tie, projected along the installed bolt axes. */
export function flangeTieSection(s:CalculationSnapshot,x:number,y:number,saddleCut=false):ViewRender{
 const p=s.input,u=p.units,g=flangeTieGeometry(p)!;const b=p.section,t=p.details!.brace,a=g.attachment,c=t.connection,rel=tieRelease(p),col=tieColumn(s),single=g.plies===1;
 const conflict=flangeTieConflict(s);if(conflict)return conflictView(conflict);
 // x is the left edge of the view: the girder half-width, the tie and the column flange ahead of a callout column.
 const dim=(v:number)=>tieDim(v,u),sz=(v:number)=>tieSize(v,u),hole=boltProperties(c.grade,c.diameter).hole,hg=g.columnGusset;
 // Large enough that the bolt gauge reads in the free length of the bars between the gussets (up to 3" = 1'-0").
 const free=Math.max(1,g.columnGussetStart-g.gussetEnd),legible=(textWidth(sz(c.gauge),lettering.text)+24)/free;
 const scale=drawingScale(Math.max(Math.min(.38,380/(g.face+col.flange+b.bf/2)),Math.min(.75,2*legible)),u),k=scale.pointsPerMm,xc=x+b.bf/2*k,X=(z:number)=>xc+z*k,Y=(v:number)=>y+v*k;
 const drop=g.topDrop;
 const barTop=drop-t.width/2,barBottom=drop+t.width/2,cap=b.kind==='cap',capDrop=cap?b.capDepth-b.capTw-b.tf:0,gap=3;
 // A single flexible plate is seen on its near face, over the gussets; paired bars show the near bar.
 let svg=`<g data-view="flange-saddle-section">`;
 // Girder flange and web, broken below the tie.
 const webEnd=Y(barBottom+25.4);
 svg+=rect(X(-b.bf/2),Y(-b.tf),b.bf*k,b.tf*k,'runway-line');
 svg+=line([X(-b.tw/2),Y(0)],[X(-b.tw/2),webEnd],'runway-line')+line([X(b.tw/2),Y(0)],[X(b.tw/2),webEnd],'runway-line')+breakLine([X(-b.tw/2)-4,webEnd],[X(b.tw/2)+4,webEnd]);
 if(cap){
  svg+=capChannelSection(b,(x,z)=>[X(x),Y(-b.tf-z)]);
 }
 svg+=rect(X(g.rootStart),Y(0),g.rootLength*k,a.saddleThickness*k,'runway-line');
 // Girder gusset under the saddle; its end behind the near bar is hidden.
 const gx0=X(g.rootStart),gx1=X(g.gussetEnd),gy0=Y(a.saddleThickness),gy1=Y(barBottom);
 svg+=line([gx0,gy0],[gx1,gy0],'runway-line')+line([gx0,gy0],[gx0,gy1],'runway-line')+line([gx0,gy1],[X(g.start),gy1],'runway-line');
 svg+=line([gx1,gy0],[gx1,Y(barTop)],'runway-line')+line([gx1,Y(barTop)],[gx1,gy1],'hidden-line');
 svg+=rect(X(g.start),Y(barTop),t.length*k,t.width*k,'runway-line');
 // Column gusset: from the column flange across the gap at the bar ends, as tall as the bars or taller to
 // contain the release slots, and past the bolt group by its longer slotted end edge. Its girder-side edge is
 // hidden behind the near bar.
 const cx0=X(g.columnGussetStart),cx1=X(g.face),cy0=Y(drop-hg/2),cy1=Y(drop+hg/2);
 svg+=line([cx0,cy0],[cx1,cy0],'runway-line')+line([cx0,cy1],[cx1,cy1],'runway-line')+line([cx1,cy0],[cx1,cy1],'runway-line');
 if(hg>t.width)svg+=line([cx0,cy0],[cx0,Y(barTop)],'runway-line')+line([cx0,Y(barBottom)],[cx0,cy1],'runway-line');
 svg+=line([cx0,Y(barTop)],[cx0,Y(barBottom)],'hidden-line');
 // The column flange the gusset is welded to, dashed when existing, broken above and below the tie.
 const colTop=Y(-b.tf-(cap?b.capTw:0))-16,colBottom=cy1+6,fx0=X(g.face),fx1=X(g.face+col.flange);
 svg+=line([fx0,colTop],[fx0,colBottom],col.cls)+line([fx1,colTop],[fx1,colBottom],col.cls)+breakLine([fx0-4,colTop],[fx1+4,colTop])+breakLine([fx0-4,colBottom],[fx1+4,colBottom]);
 for(const [end,from] of [[0,g.start],[1,g.barEnd-g.connection]] as const)for(let row=0;row<c.rows;row++)for(const sign of [-1,1]){
  const cx=X(from+c.edge+row*c.pitch),cy=Y(drop+sign*c.gauge/2);
  svg+=circle(cx,cy,hole*k/2,'runway-line');
  if(end&&rel)svg+=verticalSlot(cx,cy,rel.slot*k,rel.width*k,'hidden-line')+circle(cx,cy,rel.od*k/2,'hidden-line');
 }
 // Release filler between a bar and the girder gusset, behind the near bar, so the bars stay parallel. A single plate
 // has none: it flexes to take up the sleeve projection.
 if(rel&&!single)svg+=rect(X(g.start)+1.5,Y(barTop)+1.5,g.connection*k-3,t.width*k-3,'hidden-line');
 // Hole layout of each bar end, chained from the bar end with the closing edge, under the bars and clear of
 // the web break; the bar length on the tier below. Extension lines start a gap clear of the parts.
 // The column-end chain starts at the gusset end, whose edge to the first slots may exceed the bar edge.
 const chain=Math.max(cy1+30,webEnd+16),girderEnd=groupChain(g.start,c,sz),columnEnd=groupChain(g.columnGussetStart,c,sz,rel?.endEdge??c.edge);
 // The column-end chain drops a tier where its outer value would crowd the girder-end closing value.
 const crowded=X(g.columnGussetStart)-X(g.gussetEnd)<textWidth(girderEnd.labels[girderEnd.labels.length-1],9)+textWidth(columnEnd.labels[0],9)+28,columnChain=crowded?chain+22:chain;
 const overall=columnChain+26;
 svg+=line([X(g.start),gy1+gap],[X(g.start),overall+5])+line([X(g.barEnd),cy1+gap],[X(g.barEnd),overall+5])+dimH(X(g.start),X(g.barEnd),overall+5,overall,dim(t.length));
 const drawn=new AnnotationSpace(svg);
 svg+=chainH(girderEnd.xs.map(X),gy1+gap,chain,girderEnd.labels,drawn)+chainH(columnEnd.xs.map(X),cy1+gap,columnChain,columnEnd.labels,drawn);
 // Vertical bolt gauge in the free length of the bars; the value reads across the bar beside its dimension line.
 {const rowEnd=g.start+c.edge+(c.rows-1)*c.pitch,w=textWidth(sz(c.gauge),9),gx=Math.max(X(g.gussetEnd)+12,(X(g.gussetEnd)+X(g.columnGussetStart)-w)/2-2),ya=Y(drop-c.gauge/2),yb=Y(drop+c.gauge/2),fx=X(rowEnd)+hole*k/2+2;
  // The value reads right of its line, else where it reads clear: left of it, or along the line beyond either bar.
  svg+=drawn.add(line([fx,ya],[gx+5,ya])+line([fx,yb],[gx+5,yb])+line([gx,ya],[gx,yb])+[ya,yb].map(v=>line([gx-3,v+2.5],[gx+3,v-2.5])).join(''));
  const label=sz(c.gauge),mid=(ya+yb)/2,size=lettering.text;
  svg+=drawn.pick([dimText(gx+4,mid+3,label,size),dimText(gx-4,mid+3,label,size,'end'),line([gx,ya-w-6],[gx,ya])+dimText(gx-6,ya-4-w/2,label,size,'middle',400,-90),line([gx,yb],[gx,yb+w+6])+dimText(gx-6,yb+4+w/2,label,size,'middle',400,-90)]);}
 // Capped girder: the gusset end clears the turned-down channel flange (dimensioned where the gusset rises above it).
 const capItem:Callout[]=[];
 if(cap&&g.capClear!==undefined&&a.saddleThickness<capDrop){
  const yd=Y((a.saddleThickness+capDrop)/2),xa=X(g.gussetEnd),xb=X(g.capFlange!);
  svg+=line([xa,yd],[xb,yd])+[xa,xb].map(v=>line([v-2,yd+2.5],[v+2,yd-2.5])).join('');
  capItem.push({at:[(xa+xb)/2,yd],labels:[`${sz(g.capClear)} CLR. TO CAP FLANGE (${sz(capClearance)} MIN.)`]});
 }
 // One weld symbol per joint, with its size and length.
 const saddleWeld:Weld={size:sz(a.weldSize),length:weldLength(g.endWeldLength,u),both:false};
 const gussetWeld:Weld={size:sz(a.weldSize),length:weldLength(g.rootLength,u),both:true};
 const rootWeld:Weld={size:sz(c.weldSize),length:weldLength(hg,u),both:true,field:!col.isNew};
 const items:Callout[]=[
  {at:[X(g.rootStart+g.rootLength*.3),Y(a.saddleThickness/2)],labels:[`SADDLE PL ${sz(a.saddleThickness)} X ${sz(a.saddleLength)} X ${sz(g.rootLength)}`]},
  {at:[X(g.rootStart+g.rootLength*.62),Y(0)],weld:saddleWeld,labels:[`SADDLE TO FLANGE, EACH END; ${detailRef(detailTitles.saddle)}`]},
  {at:[X(g.rootStart+g.rootLength*.46),Y(a.saddleThickness)],weld:gussetWeld,labels:[`GIRDER GUSSET PL ${sz(t.gussetThickness)} X ${sz(barBottom-a.saddleThickness)} X ${sz(g.gussetEnd-g.rootStart)}`,'TO SADDLE, BOTH FACES']},
  {at:[X(g.columnGussetStart)-14,Y(barTop)],labels:single?[`FLEXIBLE PL ${sz(t.thickness)} X ${sz(t.width)} X ${dim(t.length)}, ${sz(g.barGap)} CLR. TO COLUMN;`,`GIRDER END: ${2*c.rows} - ${sz(c.diameter)} ${c.grade} SC, SINGLE SHEAR,`,`${sz(hole)} STD HOLES; HEADS ON PLATE`]:[`2 FB ${sz(t.thickness)} X ${sz(t.width)} X ${dim(t.length)}, ${sz(g.barGap)} CLR. TO COLUMN;`,`GIRDER END: ${2*c.rows} - ${sz(c.diameter)} ${c.grade} SC, ${sz(hole)} STD HOLES${rel?`;`:''}`,...(rel?[`${sz(rel.clearance)} FILLER (HIDDEN)`]:[])]},
  {at:[X(g.barEnd-g.connection*.5),cy0],labels:[...(rel?[`COLUMN END: ${2*c.rows} - ${sz(c.diameter)} ${c.grade} PRETENSIONED`,`AGAINST STEEL SLEEVES ${sz(rel.od)} OD X ${sz(rel.hole)} BORE X ${sz(rel.sleeveLength)};`,`${sz(rel.width)} X ${sz(rel.slot)} VERT. SLOTS IN GUSSET`]:[`COLUMN END: ${2*c.rows} - ${sz(c.diameter)} ${c.grade} SC,`,`${sz(hole)} STD HOLES`]),`COLUMN GUSSET PL ${sz(t.gussetThickness)} X ${sz(hg)} X ${sz(g.columnGussetLength)}`]},
  {at:[X(g.face),cy0+3],weld:rootWeld,labels:col.isNew?['SHOP WELD COLUMN GUSSET TO',`${col.label} FLANGE; ${detailRef(detailTitles.tiePlan)}`]:[`COLUMN GUSSET TO ${g.receiver?'EXISTING':'COLUMN'}`,`${g.receiver?'COLUMN ':''}FLANGE${g.receiver?'':' BY OTHERS'} (DASHED); ${detailRef(detailTitles.tiePlan)}`]},
  ...capItem];
 const nx=Math.max(fx1+60,605-215),top=Math.min(columnTop(items),colTop),bottom=Math.max(top+columnHeight(items),overall+12);
 svg+=calloutColumn(items,nx,top);
 // Longitudinal section through the saddle, looking from the column.
 if(saddleCut){const xs=X(g.rootStart+g.rootLength/2);svg+=sectionCut([xs,Y(-b.tf-(cap?b.capTw:0))-4],[xs,Y(barBottom)+4],[-1,0],detailTitles.saddle,['a']);}
 const notesY=Math.max(bottom,overall)+17;
 svg+=text(x,notesY,rel?`SLOTS GIVE ${slotTravel(rel.travel,u)} VERTICAL TRAVEL EACH WAY; DO NOT CLAMP THE COLUMN GUSSET`:'COLUMN END BOLTS PRETENSIONED IN STANDARD HOLES',8);
 const topPart=single?'TOP OF PLATE':'TOP BAR';
 svg+=text(x,notesY+16,cap?`${topPart} CLEAR OF CAP BY ${sz(a.clearance)} MIN. / NO CAP HOLES OR CUTS AT THE TIE`:`${topPart} ${sz(g.saddleClear)} CLEAR OF SADDLE / NO FLANGE HOLES OR CUTS AT THE TIE`,8);
 return {svg:svg+'</g>',scale:scale.label};
}
/** Direct flange tie details on their own sheet. */
export function flangeTieSheetSvg(s:CalculationSnapshot,number='S-06'){
 const topic=flangeTieTopic(s);return topic?topicSheetSvg(s,topic,number,'DIRECT FLANGE TIES'):'';
}
/**
 * The direct flange tie cannot be built as dimensioned: a part size or clear length ≤ 0, the gusset end not clear of the
 * cap channel flange (cap-clearance), or a geometry conflict among the tie's checks. Its views are then not detailed.
 */
export function flangeTieConflict(s:CalculationSnapshot){
 const g=flangeTieGeometry(s.input);if(!g)return undefined;const t=s.input.details!.brace,a=g.attachment;
 return viewConflict(s,{sizes:[g.rootLength,a.saddleLength,a.saddleThickness,g.columnGussetLength,g.columnGusset,t.length,t.thickness,t.width,g.face,g.barGap,g.capClear,g.columnGussetStart-g.gussetEnd],
  fits:/^(cap-clearance|flange-tie-.*(fit|clear(ance)?))$/,checks:/^(flange-tie-|plate-tie-|tie-|cap-clearance$)/});
}
/** Direct flange tie section, tie plan at a support, saddle section, and the tie notes. */
export function flangeTieTopic(s:CalculationSnapshot):DetailTopic|undefined{
 const p=s.input,u=p.units,g=flangeTieGeometry(p);if(!g)return undefined;const d=p.details!,b=p.section,a=g.attachment,t=d.brace,c=t.connection,sz=(v:number)=>tieSize(v,u),dim=(v:number)=>tieDim(v,u);
 const rel=tieRelease(p),col=tieColumn(s),cap=b.kind==='cap',single=g.plies===1;
 const plan=():ViewRender=>{
 const scale=drawingScale(.30,u),k=scale.pointsPerMm,cx=890,cy=150;
 const pair=g.stations.filter(v=>v.station===p.spans[0]),grid=p.spans[0];
 // The top element's edges: the cap channel on a capped girder, which hides the W flange below it.
 const edge=cap?b.capWidth/2:b.bf/2;
 let svg='<g data-view="flange-tie-plan">';
 // Parts under the top flange (or cap) are hidden; a plate running out past its edge is solid beyond it.
 const Z=(z:number)=>cy+z*k,plate=(x:number,w:number,z0:number,z1:number)=>(z0<edge?rect(x,Z(z0),w,Z(Math.min(z1,edge))-Z(z0),'hidden-line'):'')+(z1>edge?rect(x,Z(Math.max(z0,edge)),w,Z(z1)-Z(Math.max(z0,edge)),'runway-line'):'');
 // Extension lines start a gap clear of the part they locate.
 const located=(x1:number,from1:number,x2:number,from2:number,y:number,label:string,outside:'left'|'right')=>line([x1,from1-2],[x1,y+5])+line([x2,from2-2],[x2,y+5])+dimH(x1,x2,y+5,y,label,outside);
 const flange=Z(-edge),tier=flange-14,stiffTop=Z(-b.tw/2-d.bearing.stiffenerWidth);
 for(const e of pair){const tx=cx+(e.tieX-grid)*k,sx=cx+(e.center-grid)*k,end=cx+((e.end==='left'?e.start:e.finish)-grid)*k,far=cx+((e.end==='left'?e.finish:e.start)-grid)*k,out=e.end==='left'?'right':'left';
  // Girder end at the gap, broken away from it.
  svg+=line([end,flange],[far,flange],'runway-line')+line([end,Z(edge)],[far,Z(edge)],'runway-line')+line([end,flange],[end,Z(edge)],'runway-line')+breakLine([far,flange-4],[far,Z(edge)+4]);
  // Under the cap web: the W flange tips and the inner toe edges of the turned-down (sloped) channel flanges.
  if(cap)for(const z of [b.bf/2,capChannelProfile(b).toeInner])for(const side of [-1,1])svg+=line([end,Z(side*z)],[far,Z(side*z)],'hidden-line');
  for(const side of [-1,1])svg+=rect(sx-d.bearing.stiffenerThickness*k/2,side<0?stiffTop:Z(b.tw/2),d.bearing.stiffenerThickness*k,d.bearing.stiffenerWidth*k,'hidden-line');
  svg+=rect(tx-a.saddleLength*k/2,Z(g.rootStart),a.saddleLength*k,g.rootLength*k,'hidden-line');
  // Paired bars each side of the gussets, or the single plate on the gusset face toward its own girder end.
  for(const sign of single?[e.plateSide]:[-1,1])svg+=plate(tx+(sign*(t.gussetThickness+t.thickness)/2-t.thickness/2)*k,t.thickness*k,g.start,g.barEnd);
  svg+=plate(tx-t.gussetThickness*k/2,t.gussetThickness*k,g.rootStart,g.gussetEnd);
  svg+=rect(tx-t.gussetThickness*k/2,Z(g.columnGussetStart),t.gussetThickness*k,g.columnGussetLength*k,'runway-line');
  // Tie from the stiffener, and the stiffener from the girder end, each from the parts themselves.
  svg+=located(sx,stiffTop,tx,Z(g.rootStart),tier,dim(a.longitudinalSetback),out);
  svg+=located(sx,stiffTop,end,flange,tier-16,dim(Math.abs(e.center-(e.end==='left'?e.start:e.finish))),out);
 }
 const rw=g.receiver?.width??14*25.4,rt=col.flange;
 svg+=rect(cx-rw*k/2,cy+g.face*k,rw*k,rt*k,col.cls);
 const rootX=cx+((pair.at(-1)?.tieX??grid)-grid)*k;
 svg+=weldLeader([[rootX,cy+g.face*k]],[1027,285],{size:sz(c.weldSize),length:weldLength(g.columnGusset,u),both:true,field:!col.isNew},[`${col.isNew?'SHOP WELD':'FIELD WELD'} COLUMN GUSSET TO`,`${col.label}, EACH GUSSET`]);
 // The grid line stops above the column note, which sits below the column flange.
 const noteY=cy+(g.face+rt)*k+14;
 // Transverse section along the tie of the right girder, looking along the runway, cut below the column
 // beside the column note.
 const tx=cx+((pair.at(-1)?.tieX??grid)-grid)*k;svg+=sectionCut([tx,tier],[tx,noteY-10],[1,0],detailTitles.flangeTie,['b'],'tip');
 svg+=line([cx,116],[cx,noteY-10],'grid-line');
 svg+=text(tx-8,noteY,col.isNew?`${columnReference(p)} / SEPARATE TIES EACH GIRDER`:g.receiver?'EXISTING COLUMN / SEPARATE TIES EACH GIRDER':'COLUMN BY OTHERS (REF.) / SEPARATE TIES EACH GIRDER',8,'end');
 return {svg:svg+'</g>',scale:scale.label};};
 const saddle=():ViewRender=>{
 // Longitudinal section through the middle of the saddle, looking from the column toward the web: the flange
 // (and cap web), saddle, gusset, bars and filler are cut; the girder-end bolts nearer the web are beyond.
 const bs=drawingScale(1.25,u),k=bs.pointsPerMm,bx=200,by=462,X=(v:number)=>bx+v*k,Y=(v:number)=>by+v*k;
 const B=a.saddleLength,ts=a.saddleThickness,w=a.weldSize,tg=t.gussetThickness,tb=t.thickness,filler=single?0:rel?.clearance??0,db=c.diameter;
 // The cut is through the right girder at the first interior grid; a single plate lies on its gusset face toward that girder's end.
 const side=single?(g.stations.filter(v=>v.station===p.spans[0]).at(-1)?.plateSide??1):1;
 const drop=g.topDrop,barTop=drop-t.width/2,barBottom=drop+t.width/2,half=B/2+38.1,topFace=-b.tf-(cap?b.capTw:0);
 let svg='<g data-view="saddle-longitudinal-section">';
 // Flange and cap web, cut and broken beyond the saddle.
 svg+=line([X(-half),Y(topFace)],[X(half),Y(topFace)],'runway-line')+line([X(-half),Y(0)],[X(half),Y(0)],'runway-line');
 if(cap)svg+=line([X(-half),Y(-b.tf)],[X(half),Y(-b.tf)],'runway-line');
 for(const side of [-1,1])svg+=breakLine([X(side*half),Y(topFace)-4],[X(side*half),Y(0)+4]);
 svg+=rect(X(-B/2),Y(0),B*k,ts*k,'runway-line');
 // Transverse end fillets of the saddle to the flange, one at each end.
 for(const side of [-1,1])svg+=filletSection(X(side*B/2),Y(0),side,w*k);
 // Gusset with its fillets to the saddle, both faces.
 svg+=rect(X(-tg/2),Y(ts),tg*k,(barBottom-ts)*k,'runway-line');
 for(const side of [-1,1])svg+=filletSection(X(side*tg/2),Y(ts),side,w*k);
 // Bars clamp the gusset, with the release filler between the gusset and one bar; a single plate lies on one face.
 const left=single&&side>0?-tg/2:-tg/2-tb,right=single&&side>0?tg/2:tg/2+filler;
 for(const x0 of single?[side>0?tg/2:-tg/2-tb]:[left,right])svg+=rect(X(x0),Y(barTop),tb*k,t.width*k,'runway-line');
 if(filler)svg+=rect(X(tg/2),Y(barTop),filler*k,t.width*k,'runway-line');
 // Girder-end bolts beyond the cut: heavy hex head, F436 washer and nut; the shank is hidden in the plies.
 const rows=Array.from({length:c.rows},(_,i)=>g.start+c.edge+i*c.pitch),cutAt=g.rootStart+g.rootLength/2,beyond=rows.some(v=>v<cutAt);
 const head=.65*db,flats=1.5*db+3.175,washer={t:3.97,od:2*db+3.175},nut=db,stick=.4*db;
 // Heads on the outer ply (the plate, for a single plate), F436 washer and nut on the other face. A mirrored stack
 // (single plate on the -x face) is drawn by reflecting about the gusset mid-plane.
 const near=single?(side>0?tg/2+tb:-tg/2-tb):left,far=single?(side>0?-tg/2:tg/2):right+tb,dir=Math.sign(far-near)||1,headFace=near,nutFace=far;
 const outer=Math.max(near,far),lowest=Math.min(near,far);
 if(beyond)for(const sign of [-1,1]){
  const yb=drop+sign*c.gauge/2,hx=(v:number)=>X(headFace-dir*v),nx=(v:number)=>X(nutFace+dir*v);
  svg+=rect(Math.min(hx(0),hx(head)),Y(yb-flats/2),head*k,flats*k,'runway-line');
  svg+=rect(Math.min(nx(0),nx(washer.t)),Y(yb-washer.od/2),washer.t*k,washer.od*k,'runway-line')+rect(Math.min(nx(washer.t),nx(washer.t+nut)),Y(yb-flats/2),nut*k,flats*k,'runway-line');
  for(const e of [-1,1])svg+=line([X(lowest),Y(yb+e*db/2)],[X(outer),Y(yb+e*db/2)],'hidden-line')+line([nx(washer.t+nut),Y(yb+e*db/2)],[nx(washer.t+nut+stick),Y(yb+e*db/2)],'runway-line');
  svg+=line([nx(washer.t+nut+stick),Y(yb-db/2)],[nx(washer.t+nut+stick),Y(yb+db/2)],'runway-line');
 }
 const nutEnd=nutFace+dir*(washer.t+nut+stick);
 // Saddle length from its visible underside, the extension lines a gap clear of it and of the bolts.
 const dimY=Y(barBottom)+18;
 svg+=line([X(-B/2),Y(ts)+3],[X(-B/2),dimY+5])+line([X(B/2),Y(ts)+3],[X(B/2),dimY+5])+dimH(X(-B/2),X(B/2),dimY+5,dimY,dim(B));
 const endWeld:Weld={size:sz(w),length:weldLength(g.endWeldLength,u),both:false},legAt=(side:number):XY=>[X(side*(B/2+w/3)),Y(w/3)];
 const lx=X(Math.min(-half,nutEnd,headFace-dir*head))-150,rx=X(Math.max(half,nutEnd,headFace-dir*head))+40;
 // One symbol for each end fillet: the left end, and the right end in the callout column. The left callout stands where
 // its leader clears its own labels and the section: lower and farther out where the section draws large.
 const end1=['SADDLE TO FLANGE, END 1','TRANSVERSE END FILLET'],drawn=new AnnotationSpace(svg);
 svg+=drawn.pick([0,-30,-60].flatMap(dx=>[6,-8,20].map(dy=>weldLeader([legAt(-1)],[lx+dx,Y(topFace)+dy],endWeld,end1))));
 const items:Callout[]=[
  {at:legAt(1),weld:endWeld,labels:['SADDLE TO FLANGE, END 2','TRANSVERSE END FILLET']},
  {at:[X(B/2)-6,Y(ts*.5)],labels:[`SADDLE PL ${sz(ts)} X ${sz(B)} X ${sz(g.rootLength)}`]},
  {at:[X(tg/2+w/3),Y(ts+w/3)],weld:{size:sz(w),length:weldLength(g.rootLength,u),both:true},labels:['GUSSET TO SADDLE']},
  {at:[X(single?(side>0?tg/2+tb:-tg/2-tb):right+tb),Y(barTop+t.width*.08)],labels:[single?`FLEXIBLE PL ${sz(tb)} X ${sz(t.width)}; ${detailRef(detailTitles.flangeTie)}`:`2 FB ${sz(tb)} X ${sz(t.width)} TIE BARS; ${detailRef(detailTitles.flangeTie)}`]},
  ...(filler?[{at:[X(tg/2+filler/2),Y(drop)] as XY,labels:[`${sz(filler)} FILLER, CLASS B SURFACES`]}]:[]),
  ...(beyond?[{at:[X(nutFace+dir*(washer.t+nut)),Y(drop+c.gauge/2)] as XY,labels:[single?`${sz(db)} ${c.grade} SC BOLTS (BEYOND),`:`${sz(db)} ${c.grade} SC BOLTS (BEYOND)`,...(single?['SINGLE SHEAR']:[])]}]:[]),
  {at:[X(half)-8,Y(topFace*.5)],labels:[cap?`${b.capCatalogueId??'CAP'} CAP WEB AND`:`${b.catalogueId??b.name} TOP FLANGE`,...(cap?[`${b.catalogueId??'W'} TOP FLANGE`]:[])]}];
 svg+=calloutColumn(items,rx,Math.min(columnTop(items),Y(topFace)-14));
 svg+=text(bx,dimY+28,'SADDLE EDGES ALONG THE RUNWAY ARE NOT WELDED.',8,'middle')+text(bx,dimY+42,'SADDLE STOPS CLEAR OF THE ROLLED ROOT AND BEARING STIFFENER WELDS.',8,'middle');
 return {svg:svg+'</g>',scale:bs.label};};
 const support=s.checks.find(v=>v.id==='tie-move-support'),bottom=g.sides.includes(-1),stress=(v:number)=>format(v,'stress',u,0);
 // Flange holes the set does detail: bearing bolts through the bottom flange, stop bolts through the top flange.
 const drilled=[...(activeEndBearing(p)?['END BEARINGS']:[]),...(activeEndStop(p)?['END STOPS']:[])];
 const notes=[single?`FLEXIBLE PLATE TIES (AISC DG7 §11.2): ONE PL ${sz(t.thickness)} X ${sz(t.width)} X ${dim(t.length)} ${bottom?'AT EACH FLANGE':'AT THE TOP FLANGE'}, ON THE GUSSET FACE TOWARD THE GIRDER END, SET BACK ${dim(a.longitudinalSetback)} FROM BEARING CENTERS TOWARD GIRDER ENDS; PLATE ENDS ${sz(g.barGap)} CLEAR OF THE COLUMN FLANGE.${bottom?'':` THE BOTTOM FLANGE IS BOLTED TO THE SEAT (${detailRef(detailTitles.endBearing)}).`}`:`TIES: ${dim(t.length)} LONG, ${bottom?'AT BOTH FLANGES':`AT THE TOP FLANGE. THE BOTTOM FLANGE IS BOLTED TO THE SEAT (${detailRef(detailTitles.endBearing)})`}. SET BACK ${dim(a.longitudinalSetback)} FROM BEARING CENTERS TOWARD GIRDER ENDS. BAR ENDS ${sz(g.barGap)} CLEAR OF THE COLUMN FLANGE.`,
  `GIRDER FORCE TRANSFERS THROUGH THE GUSSET AND SADDLE DIRECTLY TO THE FLANGE. DO NOT WELD THE GUSSET TO THE WEB. WELD THE SADDLE TO THE FLANGE ONLY WITH THE TWO ${sz(a.weldSize).replaceAll('"','')} TRANSVERSE END FILLETS, ONE ACROSS EACH END, ${dim(g.endWeldLength)} LONG, WITHOUT END RETURNS; DO NOT WELD THE SADDLE EDGES ALONG THE RUNWAY.`,
  col.isNew?`SHOP WELD COLUMN GUSSET TO THE ${col.name}: TWO ${sz(c.weldSize).replaceAll('"','')} CONTINUOUS FILLETS X ${dim(g.columnGusset)}.`:`FIELD WELD COLUMN GUSSET TO ${g.receiver?'EXISTING COLUMN':'THE COLUMN'}: TWO ${sz(c.weldSize).replaceAll('"','')} CONTINUOUS FILLETS X ${dim(g.columnGusset)}. VERIFY STEEL GRADE, WELDABILITY AND SURFACE CONDITION.`,
  rel?single?`COLUMN END: PRETENSION THE BOLTS AGAINST STEEL SLEEVES ${sz(rel.od)} OD X ${sz(rel.hole)} BORE X ${sz(rel.sleeveLength)} LONG (${sleeveSpec.replace(/ to the OD.*$/,'').toUpperCase()}, FY ${stress(Math.max(d.material.Fy,345))} MIN.) PASSING THROUGH ${sz(rel.width)} X ${sz(rel.slot)} VERTICAL SLOTS IN THE COLUMN GUSSET, THE PLATE ON ONE SLEEVE END AND AN F436 WASHER ON THE OTHER. CENTER THE SLEEVES IN THE SLOTS AT ERECTION. THE GUSSET IS NOT CLAMPED. NO FILLER: THE PLATE FLEXES TO TAKE UP THE SLEEVE PROJECTION.`:`COLUMN END: PRETENSION THE BOLTS AGAINST STEEL SLEEVES ${sz(rel.od)} OD X ${sz(rel.hole)} BORE X ${sz(rel.sleeveLength)} LONG (ASTM A513 TYPE 5 DOM TUBE OR MACHINED ASTM A108 BAR, FY ${stress(Math.max(d.material.Fy,345))} MIN.) PASSING THROUGH ${sz(rel.width)} X ${sz(rel.slot)} VERTICAL SLOTS IN THE COLUMN GUSSET. CENTER THE SLEEVES IN THE SLOTS AT ERECTION. THE GUSSET IS NOT CLAMPED. PROVIDE A ${sz(rel.clearance)} FILLER (CLASS B SURFACES) AT THE GIRDER GUSSET SO THE BARS STAY PARALLEL.`:single?'COLUMN END: STANDARD HOLES; THE PLATE ALSO FLEXES WITH SUPPORT DEFLECTION.':'COLUMN END: STANDARD HOLES; THE BARS ALSO FLEX WITH SUPPORT DEFLECTION.',
  `${single?'THE PLATE FLEXES ABOUT ITS WEAK AXIS':'TIE BARS FLEX OUT OF PLANE'} WITH GIRDER END ROTATION AND, AT SLIDING ENDS, THERMAL TRAVEL; SEE THE TIE MOVEMENT CHECKS.${single?` KEEP ITS CLEAR LENGTH FREE OF ATTACHMENTS AND WELDS. SET THE COLUMN GUSSET IN LINE WITH THE GIRDER GUSSET WITHIN ${sz(plateAlignment)} ALONG THE RUNWAY; THE PLATE FLEXURE CHECK INCLUDES THAT OFFSET${rel?' AND HALF THE SLEEVE CLEARANCE':''}.`:''}${support?.capacity!==undefined?` BRACKET BY OTHERS: VERTICAL DEFLECTION AT THE BEARING UNDER CRANE LOADS ${limitLength(support.capacity,u,'max')} MAX.`:''}`,
  `GIRDER END: STANDARD HOLES, PRETENSIONED ${c.grade} BOLTS${single?' IN SINGLE SHEAR, HEADS ON THE PLATE':''}, CLASS B FAYING SURFACES. NO HOLES OR CUTS THROUGH THE ${cap?'CAP OR ':''}W FLANGES${drilled.length?` EXCEPT THOSE DETAILED FOR THE ${drilled.join(' AND ')}`:''}.`,
  // Field sequence: the column gusset is fitted to the girder as erected, not to the theoretical column face.
  `ERECTION: SET, LINE AND LEVEL THE GIRDER; BOLT THE ${single?'PLATE':'BARS'} TO THE GIRDER GUSSET; FIELD VERIFY THE COLUMN FACE (${dim(g.face)} FROM THE GIRDER WEB C/L) AND CUT THE COLUMN GUSSET TO SUIT; SET IT ${single?'ON THE PLATE':'BETWEEN THE BARS'}${rel?' WITH THE SLEEVES CENTERED IN THE SLOTS':''}; TACK IT TO THE COLUMN; REMOVE THE ${single?'PLATE':'BARS'} WHERE ACCESS NEEDS IT; WELD OUT; REINSTALL AND PRETENSION.`,
  ...tieForceNote(s)];
 // The summary D/C is the largest evaluated DESIGN ratio of the tie (sheetRatios.elementSummary): the tie element of the
 // report with the saddle register points (end-fillet toes SA, terminations SL) and the keeper flange. Minimum weld sizes, clearances, edge distances and
 // slenderness are detailing limits: one scores 1.00 whenever the provided size equals the limit, which would read as a
 // fully stressed connection; a failing rule is named apart. A saddle fillet at the minimum size is stated instead.
 const tie=elementSummary(s,inElements(['tie'],/^(detail-(fatigue|full-cycle)-(SA|SL)|plate-tie-keeper-flange$)/));
 const minimumWeld=tie.checks.some(v=>v.id==='flange-tie-weld-minimum'&&v.status==='pass'&&(v.utilization??0)>=1-1e-9);
 const rated=summaryNote(s,tie),summary=rated?` (${rated}${minimumWeld?`; MINIMUM FILLET SIZE GOVERNS THE ${sz(a.weldSize).replaceAll('"','')} SADDLE WELDS`:''})`:'';
 return {key:'flange-tie',name:single?'FLEXIBLE PLATE TIES':'FLANGE TIES',views:[
  {title:detailTitles.flangeTie,render:()=>flangeTieSection(s,48,128,true)},
  {title:detailTitles.tiePlan,render:()=>{const c=flangeTieConflict(s);return c?conflictView(c):plan();}},
  {title:detailTitles.saddle,render:()=>{const c=flangeTieConflict(s);return c?conflictView(c):saddle();}}
 ],notes:(st:Style)=>[heading(st,single?'FLEXIBLE PLATE TIE NOTES / LOCAL CHECKS':'FLANGE TIE CONNECTION NOTES / LOCAL CHECKS'),...numbered(st,notes),paragraph(st,`${single?'PLATE, LAP, LOCAL':'TIE LOCAL'} AND MOVEMENT CHECKS: ${calculationRef(s)}${summary}.`)]};
}
/**
 * The tie design force as the calculation designs the tie: F = H + P_br, the largest concurrent top-flange restraint
 * force at a grid (H TOP on the bracket force table) plus the AISC Appendix 6 brace force (the S-00 H TIE).
 */
export function tieForceNote(s:CalculationSnapshot):string[]{
 const d=deliveredForces(s);if(!d)return [];
 const u=s.input.units,f=(v:number)=>{const t=format(v,'force',u,u==='SI'?1:2);return u==='US'?t.toUpperCase():t;};
 return [`TIE DESIGN FORCE F = H + P BR = ${f(d.tie.design-d.brace.force)} + ${f(d.brace.force)} = ${f(d.tie.design)}, EITHER WAY: H THE LARGEST CONCURRENT TOP-FLANGE RESTRAINT FORCE AT A GRID (H TOP IN THE SUPPORT FORCE TABLE), P BR THE AISC 360 APPENDIX 6 BRACE FORCE; THE S-00 H TIE INCLUDES P BR.`];
}
