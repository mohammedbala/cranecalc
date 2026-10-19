import {checkDcText,elementSummary,failingNote,sheetDc} from './sheetRatios';
import type {CalculationSnapshot} from '../engine/types';
import {format} from '../engine/units';
import {activeStep} from '../engine/steppedColumnInputs';
import {stepGeometry,type StepGeometry} from '../engine/steppedColumn';
import {stepStiffenerClip,stepStiffenerHeight} from '../engine/stepSeat';
import {activeEndBearing} from '../engine/endBearingInputs';
import {isCapAngleTie} from '../engine/capAngle';
import {runwayElevations} from '../engine/drawingData';
import {drawingElevation,plateInches,dimensionLength} from './drawingFormat';
import {sheetDrawingScale as drawingScale,text,line,rect,dimH,dimV,detailRef,detailTitles,bearingBoltsTitle,capAngleTitles,labelColumn,breakLine,capChannelSection,textWidth,n,lettering,type XY} from './sheetGraphics';
import {heading,numbered,table,type Style} from './noteBlocks';
import {heavyHex,hexSide} from './heavyHex';
import {bearingStiffenerProfile} from './bearingStiffenerGeometry';
import {bracketForceBlocks,bracketForceTopic} from './bracketForceTable';
import type {DetailTopic,DetailView} from './detailSheet';
import {AnnotationSpace,dimHClear,dimVClear} from './annotationSpace';

const inch=25.4;
/** Detail titles of the stepped column (support 'stepped-column'), referenced from the general arrangement and the bearing details. */
export const steppedColumnTitles={elevation:'STEPPED COLUMN / ELEVATION',section:'STEP / SECTION',stiffener:'STEP STIFFENER / PLAN AND ELEVATION'} as const;
/** The detail of the top-flange tie the stepped column receives on its upper shaft. */
export const steppedTieTitle=(p:CalculationSnapshot['input'])=>isCapAngleTie(p)?capAngleTitles.section:p.details?.brace.flangeAttachment?.enabled?detailTitles.flangeTie:detailTitles.tie;
/** Shape name of a shaft: its catalog W shape, else its plates. */
const shaftName=(v:StepGeometry['lower'],size:(v:number)=>string)=>v.shape||`BUILT-UP ${size(v.d)} X ${size(v.bf)}`;

/**
 * Elevation datums at the left of a view: a leader from the steel at each level to a triangle on the datum line and the
 * label beyond it, spread to clear their neighbors.
 */
function datums(marks:{y:number;label:string;from:number}[],x:number){
 const sorted=[...marks].sort((a,b)=>a.y-b.y),placed:number[]=[];
 for(const [i,m] of sorted.entries())placed.push(Math.max(m.y,i?placed[i-1]+lettering.leading+1:-Infinity));
 return sorted.map((m,i)=>{
  const tip=x-10,ly=placed[i];
  return `<g data-elevation-mark="${m.label.split(' ')[0]}">${line([m.from,m.y],[x,m.y],'annotation')}<path class="leader-arrow" d="M${n(x)},${n(m.y)}l-2.4,-3.2h4.8z"/>${line([x,m.y],[tip,ly])}${line([tip,ly],[tip-4,ly])}${text(tip-6,ly+3,m.label,lettering.text,'end')}</g>`;
 }).join('');
}

/**
 * Stepped column details (girder on the step of an existing stepped building column; AISC Design Guide 7 stepped crane
 * columns): the column elevation across the runway with both shafts, the step and the girder bearing over the crane-side
 * flange; the step section with the bearing, the upper flange line and the step stiffener; the step stiffener in plan and
 * elevation where one is provided. Existing steel is screened (reference-line), new work bold.
 */
export function steppedColumnTopic(s:CalculationSnapshot):DetailTopic|undefined{
 const p=s.input,st=activeStep(p),g=stepGeometry(p),d=p.details;if(!st||!g||!d)return undefined;
 const u=p.units,c=p.existingColumn!,b=p.section,bs=d.bearing,rl=d.rail,eb=activeEndBearing(p),views:DetailView[]=[];
 const dim=(v:number)=>dimensionLength(v,u),size=(v:number)=>plateInches(v,u),weld=(v:number)=>plateInches(v,u).replaceAll('"','');
 const el=runwayElevations(p),datum=p.drawing?.datumElevation??0,elev=(y:number)=>`EL. ${drawingElevation(datum+y,u)}`;
 const lowName=shaftName(g.lower,size),upName=shaftName(g.upper,size),capLabel=`PL ${size(g.cap.thickness)} X ${dim(g.cap.width)} X ${dim(g.cap.length)}`;
 const cap=b.kind==='cap'?b.capTw:0,bt=bs.thickness,hs=g.cap.top,tos=hs+bt+b.d,railDepth=p.aist?.railDepth??p.railHeight,rb=tos+cap,tor=rb+railDepth;
 const sf=g.stiffener,sh=stepStiffenerHeight(g),tieRef=detailRef(steppedTieTitle(p)),gw=g.girderWeb,lowerOut=-g.lower.d/2,lowerIn=g.lower.d/2;
 const girderHalf=Math.max(b.bf,b.kind==='cap'?b.capWidth:0)/2;
 // Girder I-section with its cap channel and the rail on the web centerline, bottom flange at `y0` (mm), in view coordinates.
 const girder=(X:(x:number)=>number,Y:(y:number)=>number,y0:number,withRail:boolean)=>{
  const t=y0+b.d;
  let svg=`<path class="runway-line" d="M${n(X(gw-b.bf/2))},${n(Y(y0))}H${n(X(gw+b.bf/2))}V${n(Y(y0+b.tf))}H${n(X(gw+b.tw/2))}V${n(Y(t-b.tf))}H${n(X(gw+b.bf/2))}V${n(Y(t))}H${n(X(gw-b.bf/2))}V${n(Y(t-b.tf))}H${n(X(gw-b.tw/2))}V${n(Y(y0+b.tf))}H${n(X(gw-b.bf/2))}Z"/>`;
  if(b.kind==='cap')svg+=capChannelSection(b,(x,z)=>[X(gw+x),Y(t+z)]);
  if(withRail){const r=t+cap;svg+=`<path class="rail-line" d="M${n(X(gw-rl.baseWidth/2))},${n(Y(r))}H${n(X(gw+rl.baseWidth/2))}V${n(Y(r+rl.baseThickness))}H${n(X(gw+rl.webThickness/2))}V${n(Y(r+railDepth-rl.headThickness))}H${n(X(gw+rl.headWidth/2))}V${n(Y(r+railDepth))}H${n(X(gw-rl.headWidth/2))}V${n(Y(r+railDepth-rl.headThickness))}H${n(X(gw-rl.webThickness/2))}V${n(Y(r+rl.baseThickness))}H${n(X(gw-rl.baseWidth/2))}Z"/>`;}
  return svg;
 };
 // A shaft seen across the runway: its flanges edge-on between two elevations (mm), existing steel screened.
 const shaft=(X:(x:number)=>number,Y:(y:number)=>number,v:StepGeometry['lower'],y1:number,y2:number)=>[v.x-v.d/2,v.x+v.d/2-v.tf].map(z=>rect(X(z),Y(y2),v.tf*(X(1)-X(0)),Y(y1)-Y(y2),'reference-line')).join('');
 // The girder's tie-side bearing stiffener and the girder top flange face the tie lands from.
 const tieY=tos-b.tf-Math.min(150,b.d/4)/2;

 // 1: Elevation across the runway at a support, looking along it: the lower shaft from the base to the step cap, the upper
 // shaft from the step to the top, broken where the column is long; the girder on the step and its tie to the upper shaft.
 views.push({title:steppedColumnTitles.elevation,rows:2,render:()=>{
  const H=c.height,gap=22,lowTop=Math.min(18*inch,hs/4),midBottom=hs-g.cap.thickness-Math.max(.6*g.lower.d,24*inch),midTop=tor+18*inch,topBottom=H-12*inch;
  const bands:[number,number][]=[];
  if(midBottom>lowTop+30*inch)bands.push([0,lowTop],[midBottom,0]);else bands.push([0,0]);
  if(topBottom>midTop+30*inch){bands[bands.length-1][1]=midTop;bands.push([topBottom,H]);}else bands[bands.length-1][1]=Math.max(H,midTop);
  const shown=bands.reduce((a,[y1,y2])=>a+y2-y1,0),gaps=(bands.length-1)*gap,xMin=lowerOut,xMax=Math.max(gw+girderHalf,g.cap.width/2,lowerIn);
  const k=drawingScale(Math.min((600-gaps)/shown,300/(xMax-xMin)),u),kk=k.pointsPerMm,cx=200-xMin*kk,X=(x:number)=>cx+x*kk,base=650-Math.max(0,(640-gaps-shown*kk)/2);
  const Y=(y:number)=>{let at=base;for(const [i,[y1,y2]] of bands.entries()){if(y<=y2||i===bands.length-1)return at-(Math.max(y1,Math.min(y,y2))-y1)*kk;at-=(y2-y1)*kk+gap;}return at;};
  let svg='<g data-view="stepped-column-elevation">';
  // Existing shafts, screened, in each band; a break line where a band ends inside a shaft.
  for(const [i,[y1,y2]] of bands.entries()){
   const lo:[number,number]=[y1,Math.min(y2,g.cap.bottom)],up:[number,number]=[Math.max(y1,hs),y2];
   if(lo[1]>lo[0])svg+=shaft(X,Y,g.lower,lo[0],lo[1]);
   if(up[1]>up[0])svg+=shaft(X,Y,g.upper,up[0],up[1]);
   const span=(y:number)=>y<=g.cap.bottom?[X(lowerOut)-6,X(lowerIn)+6]:[X(g.upper.x-g.upper.d/2)-6,X(g.upper.x+g.upper.d/2)+6];
   if(i<bands.length-1){const [a,z]=span(y2);svg+=breakLine([a,Y(y2)],[z,Y(y2)]);}
   if(i>0){const [a,z]=span(y1);svg+=breakLine([a,Y(y1)],[z,Y(y1)]);}
  }
  // Column top, existing base plate (reference) and the step cap.
  svg+=line([X(g.upper.x-g.upper.d/2),Y(H)],[X(g.upper.x+g.upper.d/2),Y(H)],'reference-line');
  svg+=rect(X(lowerOut)-8,Y(0),g.lower.d*kk+16,Math.max(2,1.5*inch*kk),'reference-line');
  svg+=rect(X(-g.cap.width/2),Y(hs),g.cap.width*kk,g.cap.thickness*kk,'reference-line');
  // New work: the step stiffener edge-on under the inner flange, the bearing plate, the girder with its rail, the tie.
  if(sf)svg+=rect(X(g.innerFlange-sf.thickness/2),Y(g.cap.bottom),sf.thickness*kk,sh*kk,'runway-line');
  svg+=rect(X(gw-bs.width/2),Y(hs+bt),bs.width*kk,bt*kk,'runway-line')+girder(X,Y,hs+bt,true);
  const tieH=Math.min(150,b.d/4);
  svg+=rect(X(g.tieFace),Y(tos-b.tf),(gw-girderHalf-g.tieFace)*kk,tieH*kk,'runway-line');
  // Centerlines: the lower shaft and the girder web.
  svg+=line([X(0),Y(g.cap.bottom)+6],[X(0),Y(Math.max(bands[0][0],g.cap.bottom-sh-3*inch))],'grid-line')+line([X(gw),Y(tor)-10],[X(gw),Y(hs)+4],'grid-line');
  // Across the runway, over the rail: the upper shaft, the tie distance to the girder web, the web to the lower crane-side
  // face, the lower shaft overall, and the girder reaction's eccentricity from the lower shaft centroid.
  // Elevations at the left: the column top and base (existing, survey), the step, top of steel and top of rail.
  const xm=X(Math.min(lowerOut,-g.cap.width/2))-18;
  svg+=datums([{y:Y(tor),label:el?.tor!==undefined?`T.O.R. ${elev(tor)}`:'T.O.R.',from:X(gw-rl.headWidth/2)},{y:Y(tos),label:`T.O.S. ${elev(tos)}`,from:X(gw-b.bf/2)},
   {y:Y(hs),label:`STEP (TOP OF CAP) ${elev(hs)}`,from:X(-g.cap.width/2)},{y:Y(H),label:`(E) COLUMN TOP ${elev(H)}`,from:X(g.upper.x-g.upper.d/2)},{y:Y(0),label:`(E) COLUMN BASE ${elev(0)}`,from:X(lowerOut)-8}].map(m=>({...m,from:Math.min(m.from,X(lowerOut))})),xm);
  // Callouts at the right.
  const lx=X(xMax)+40;
  svg+=labelColumn([
   {at:[X(gw+rl.headWidth/2),Y(tor-railDepth*.2)],labels:['CRANE RAIL ON THE GIRDER WEB C/L',`SEE ${detailRef(detailTitles.railKeeper)}`]},
   {at:[X(g.tieFace+(gw-girderHalf-g.tieFace)*.6),Y(tos-b.tf-tieH*.5)],labels:['TOP FLANGE TIE (NEW) TO THE UPPER','SHAFT INNER FLANGE, SCHEMATIC;',`SEE ${tieRef}`]},
   {at:[X(gw+b.tw/2),Y(tos-b.d*.4)],labels:[`${b.name} RUNWAY GIRDER (NEW) ON THE`,'STEP OVER THE CRANE-SIDE FLANGE;',`SEE ${detailRef(steppedColumnTitles.section)}`]},
   {at:[X(g.upper.x+g.upper.d/2),Y(Math.min(tos+12*inch,bands.at(-1)![1]-6*inch))],labels:[`(E) UPPER SHAFT ${upName}`,'SURVEY SIZE AND PLUMB']},
   {at:[X(g.cap.width/2),Y(hs-g.cap.thickness/2)],labels:[`(E) STEP CAP ${capLabel}`,'SURVEY THICKNESS AND LEVEL']},
   ...(sf?[{at:[X(g.innerFlange+sf.thickness/2),Y(g.cap.bottom-sh*.5)] as XY,labels:['STEP STIFFENERS (NEW), EACH SIDE',`OF THE WEB; SEE ${detailRef(steppedColumnTitles.stiffener)}`]}]:[]),
   {at:[X(lowerIn),Y(Math.max(bands[0][1]<g.cap.bottom?bands[0][1]-6*inch:hs/2,6*inch))],labels:[`(E) LOWER SHAFT ${lowName}`,'SURVEY SIZE AND CONDITION']},
   {at:[X(lowerIn)+8,Y(0)+.75*inch*kk],labels:['(E) BASE AND FOUNDATION (REF.)']}
  ],lx,Y(Math.max(H,tor))+6,Y(0)-4);
  // Across the runway, over the rail, each value where it reads clear of the shafts and leaders: the upper shaft, the tie
  // distance to the girder web, the girder reaction's eccentricity from the lower centroid and the lower shaft overall.
  const yd=Y(tor)-22,from=Y(tor)-4,space=new AnnotationSpace(svg);
  svg+=dimHClear(space,X(lowerOut),X(g.tieFace),from,yd,dim(g.tieFace-lowerOut))+dimHClear(space,X(g.tieFace),X(gw),from,yd,dim(g.tieDistance));
  svg+=dimHClear(space,X(0),X(gw),from,yd-18,`${dim(gw)} WEB`)+dimHClear(space,X(lowerOut),X(lowerIn),from,yd-36,dim(g.lower.d));
  return {svg:svg+'</g>',scale:k.label};
 }});

 // 2: Section at the step, enlarged: the girder on its bearing plate over the lower crane-side flange, the step cap, the
 // upper shaft's flanges on the cap and the step stiffener under its inner flange.
 views.push({title:steppedColumnTitles.section,render:()=>{
  // The girder is broken above its lower part: the bearing, not the girder, is the subject.
  const shown=Math.min(b.d-b.tf,Math.max(10*inch,b.d*.3)),yCut=hs+bt+shown;
  const below=(sf?sh:Math.max(sh*.6,8*inch))+4*inch,yLow=g.cap.bottom-below,yHigh=yCut+3*inch,xMin=lowerOut,xMax=Math.max(gw+girderHalf,g.cap.width/2,gw+bs.width/2);
  const k=drawingScale(Math.min(330/(yHigh-yLow),300/(xMax-xMin)),u),kk=k.pointsPerMm,cx=40+(-xMin+3*inch)*kk,X=(x:number)=>cx+x*kk,y0=50+(yHigh-hs)*kk,Y=(y:number)=>y0-(y-hs)*kk;
  let svg='<g data-view="step-section">';
  svg+=shaft(X,Y,g.lower,yLow,g.cap.bottom)+shaft(X,Y,g.upper,hs,yHigh);
  svg+=breakLine([X(lowerOut)-6,Y(yLow)],[X(lowerIn)+6,Y(yLow)])+breakLine([X(g.upper.x-g.upper.d/2)-6,Y(yHigh)],[X(g.upper.x+g.upper.d/2)+6,Y(yHigh)]);
  svg+=rect(X(-g.cap.width/2),Y(hs),g.cap.width*kk,g.cap.thickness*kk,'reference-line');
  // Girder, its fitted bearing stiffeners, the bearing plate.
  const yb0=hs+bt;
  svg+=rect(X(gw-b.bf/2),Y(yb0+b.tf),b.bf*kk,b.tf*kk,'runway-line')+line([X(gw-b.tw/2),Y(yb0+b.tf)],[X(gw-b.tw/2),Y(yCut)],'runway-line')+line([X(gw+b.tw/2),Y(yb0+b.tf)],[X(gw+b.tw/2),Y(yCut)],'runway-line');
  svg+=breakLine([X(gw-bs.stiffenerWidth-b.tw/2)-8,Y(yCut)],[X(gw+bs.stiffenerWidth+b.tw/2)+8,Y(yCut)])+rect(X(gw-bs.width/2),Y(hs+bt),bs.width*kk,bt*kk,'runway-line');
  const web=b.d-2*b.tf,stiffAt:XY[]=[];
  for(const side of [-1,1]){
   const profile=bearingStiffenerProfile(bs.stiffenerWidth,web,bs.cope).map(([z,v]):XY=>[X(gw+side*(b.tw/2+z)),Y(hs+bt+b.tf+Math.min(v,shown-b.tf))]);
   svg+=`<path data-stiffener="full-depth" class="runway-line" d="${profile.map(([x,y],i)=>`${i?'L':'M'}${n(x)},${n(y)}`).join('')}Z"/>`;
   stiffAt.push([X(gw+side*(b.tw/2+bs.stiffenerWidth*.55)),Y(hs+bt+b.tf+(shown-b.tf)*.55)]);
  }
  // Bearing bolts through the girder flange, the bearing plate and the cap, nuts under the cap.
  if(eb){const hx=heavyHex(eb.bolts.diameter);for(const z of [gw-eb.bolts.gauge/2,gw+eb.bolts.gauge/2])svg+=line([X(z),Y(hs+bt+b.tf+hx.head)-3],[X(z),Y(g.cap.bottom-hx.washer.t-hx.nut)+3],'grid-line')+hexSide(X(z),Y(hs+bt+b.tf),hx.corners*kk,hx.head*kk,-1)+rect(X(z-hx.washer.od/2),Y(g.cap.bottom),hx.washer.od*kk,hx.washer.t*kk,'runway-line')+hexSide(X(z),Y(g.cap.bottom)+hx.washer.t*kk,hx.corners*kk,hx.nut*kk,1);}
  // Step stiffener edge-on under the inner flange, fitted to the cap.
  if(sf)svg+=rect(X(g.innerFlange-sf.thickness/2),Y(g.cap.bottom),sf.thickness*kk,sh*kk,'runway-line');
  // Inner flange line of the upper shaft carried down to the cap, the lower shaft and girder web centerlines.
  svg+=line([X(g.innerFlange),Y(hs)-2],[X(g.innerFlange),Y(g.cap.bottom-(sf?sh:0))+10],'grid-line')+line([X(0),Y(g.cap.bottom)+4],[X(0),Y(yLow)-6],'grid-line')+line([X(gw),Y(yHigh)-4],[X(gw),Y(yLow)-6],'grid-line');
  // Dimensions: from the lower centroid to the inner flange line and to the girder web, the bearing plate; cap and stiffener depths.
  const left=[
   {at:[X(g.upper.x-g.upper.d/2),Y(hs+(yHigh-hs)*.6)] as XY,labels:[`(E) UPPER SHAFT ${upName}`,'FLANGES BEAR ON THE CAP']},
   {at:[X(-g.cap.width/2),Y(hs-g.cap.thickness/2)] as XY,labels:[`(E) STEP CAP ${capLabel}`,'SURVEY; FIELD DRILL FOR BEARING','BOLTS, CLEAR OF CAP WELDS']},
   {at:[X(lowerOut),Y(yLow+below*.35)] as XY,labels:[`(E) LOWER SHAFT ${lowName}`]}
  ];
  const lw=Math.max(...left.flatMap(v=>v.labels.map(l=>textWidth(l,lettering.text))));
  const right=[
   {at:stiffAt[1],labels:[`2 PL ${size(bs.stiffenerThickness)} X ${size(bs.stiffenerWidth)} FULL-DEPTH FITTED`,`BEARING STIFFENERS, ${size(bs.cope)} COPES`]},
   {at:[X(gw-b.bf/2),Y(yCut-6*inch)] as XY,labels:[`${b.name} RUNWAY GIRDER (BROKEN)`]},
   {at:[X(gw+b.tw/2),Y(hs+bt+b.tf+(shown-b.tf)*.8)] as XY,labels:['TYP. BOTH STIFFENERS','CONT. WEB & FLANGE FILLETS',b.kind==='cap'?'FIT BOTTOM END':'FIT / MILL STIFFENER ENDS'],weld:size(bs.weldSize)},
   {at:[X(gw+bs.width/2),Y(hs+bt/2)] as XY,labels:[`BEARING PL ${size(bt)} X ${size(bs.width)} X ${size(bs.length)}`,`OVER THE CRANE-SIDE FLANGE; SHIM`,eb?`BOLTS: SEE ${detailRef(bearingBoltsTitle(p))}`:'TO FULL BEARING']},
   ...(sf?[{at:[X(g.innerFlange+sf.thickness/2),Y(g.cap.bottom-sh*.55)] as XY,labels:['STEP STIFFENER TO (E) WEB,','BOTH FACES, EACH PLATE',`SEE ${detailRef(steppedColumnTitles.stiffener)}`],weld:size(sf.weld),field:true}]:[])
  ];
  svg+=labelColumn(left,X(lowerOut)-50-lw,Y(yHigh),Y(yLow)+4)+labelColumn(right,X(xMax)+34,Y(yHigh),Y(yLow)+4);
  const yb=Y(yLow)+18,space=new AnnotationSpace(svg);
  svg+=dimHClear(space,X(g.innerFlange),X(0),Y(yLow)-6,yb,dim(Math.abs(g.innerFlange)))+dimHClear(space,X(0),X(gw),Y(yLow)-6,yb,dim(gw))+dimHClear(space,X(lowerOut),X(lowerIn),Y(yLow),yb+18,dim(g.lower.d));
  svg+=dimHClear(space,X(gw-bs.width/2),X(gw+bs.width/2),Y(hs+bt),Y(yHigh)-10,dim(bs.width));
  svg+=dimVClear(space,Y(hs),Y(g.cap.bottom),X(lowerOut),X(lowerOut)-14,size(g.cap.thickness));
  if(sf)svg+=dimVClear(space,Y(g.cap.bottom),Y(g.cap.bottom-sh),X(lowerOut),X(lowerOut)-32,dim(sh));
  return {svg:svg+'</g>',scale:k.label};
 }});

 // 3: The step stiffener pair: plan on a cut below the cap, and one plate in elevation from the web.
 if(sf)views.push({title:steppedColumnTitles.stiffener,render:()=>{
  const clip=stepStiffenerClip,half=g.lower.bf/2,span=g.lower.d,w=sf.width;
  const k=drawingScale(Math.min(250/(2*half+4*inch),200/(span*.55),220/(sh+3*inch)),u),kk=k.pointsPerMm;
  // Plan: x across the runway (the shaft depth) left to right around the inner flange line, y along the runway down the page.
  const x0=g.innerFlange,reach=Math.max(w,10*inch),px=60+(reach+2*inch)*kk,py=80+(half+2*inch)*kk,PX=(x:number)=>px+(x-x0)*kk,PY=(y:number)=>py+y*kk;
  let svg='<g data-view="step-stiffener">';
  // The lower shaft in plan between the cut ends: its web and, where reached, the outer flange line.
  const xl=x0-reach,xr=Math.min(lowerIn,x0+reach);
  svg+=rect(PX(xl),PY(-g.lower.tw/2),(xr-xl)*kk,g.lower.tw*kk,'reference-line');
  if(xr>=lowerIn-1e-6)svg+=rect(PX(lowerIn-g.lower.tf),PY(-half),g.lower.tf*kk,2*half*kk,'reference-line');
  else svg+=breakLine([PX(xr),PY(-g.lower.tw/2)-8],[PX(xr),PY(g.lower.tw/2)+8]);
  svg+=breakLine([PX(xl),PY(-g.lower.tw/2)-8],[PX(xl),PY(g.lower.tw/2)+8]);
  // Each plate from the web out, its web-side corner clipped.
  for(const side of [-1,1]){
   const a=side*g.lower.tw/2,z=side*(g.lower.tw/2+w),c0=side*(g.lower.tw/2+clip);
   svg+=`<path class="runway-line" d="M${n(PX(x0-sf.thickness/2))},${n(PY(c0))}L${n(PX(x0-sf.thickness/2))},${n(PY(z))}L${n(PX(x0+sf.thickness/2))},${n(PY(z))}L${n(PX(x0+sf.thickness/2))},${n(PY(c0))}Z"/>`;
   svg+=line([PX(x0-sf.thickness/2),PY(a)],[PX(x0-sf.thickness/2),PY(c0)],'hidden-line');
  }
  svg+=line([PX(x0),PY(-half)-14],[PX(x0),PY(half)+10],'grid-line');
  svg+=dimV(PY(g.lower.tw/2),PY(g.lower.tw/2+w),PX(x0+sf.thickness/2),PX(x0)+30+sf.thickness*kk,size(w))+dimH(PX(x0-sf.thickness/2),PX(x0+sf.thickness/2),PY(-g.lower.tw/2-w),PY(-half)-24,size(sf.thickness),'right');
  svg+=text(PX(xl),PY(half)+30,'PLAN BELOW THE CAP',lettering.text,'start',700);
  // Elevation of one plate looking across the runway at the web: the cap above, the plate fitted to it with its clip.
  const ex=PX(xr)+90+(g.lower.tw)*kk,ey=80,EX=(y:number)=>ex+y*kk,EY=(z:number)=>ey+z*kk;
  svg+=rect(EX(-g.lower.tw/2-1*inch),EY(-g.cap.thickness),(w+g.lower.tw+2*inch)*kk,g.cap.thickness*kk,'reference-line');
  svg+=rect(EX(-g.lower.tw/2),EY(0),g.lower.tw*kk,(sh+2*inch)*kk,'reference-line')+breakLine([EX(-g.lower.tw/2)-6,EY(sh+2*inch)],[EX(g.lower.tw/2)+6,EY(sh+2*inch)]);
  svg+=`<path class="runway-line" d="M${n(EX(g.lower.tw/2+clip))},${n(EY(0))}L${n(EX(g.lower.tw/2+w))},${n(EY(0))}L${n(EX(g.lower.tw/2+w))},${n(EY(sh))}L${n(EX(g.lower.tw/2))},${n(EY(sh))}L${n(EX(g.lower.tw/2))},${n(EY(clip))}Z"/>`;
  svg+=dimV(EY(0),EY(sh),EX(g.lower.tw/2+w),EX(g.lower.tw/2+w)+20,dim(sh))+dimH(EX(g.lower.tw/2),EX(g.lower.tw/2+w),EY(sh),EY(sh)+18,size(w),'right');
  svg+=text(EX(-g.lower.tw/2-1*inch),EY(sh+2*inch)+30,'ELEVATION OF ONE PLATE',lettering.text,'start',700);
  svg+=labelColumn([
   {at:[EX(g.lower.tw/2+clip*.5),EY(clip*.5)],labels:[`${size(clip)} CLIP AT THE CAP-TO-WEB`,'FILLET; FIT TO BEAR ON THE CAP']},
   {at:[EX(g.lower.tw/2),EY(sh*.6)],labels:['STEP STIFFENER TO (E) WEB','BOTH FACES, FULL HEIGHT','BELOW THE CLIP'],weld:size(sf.weld),field:true},
   {at:[EX(g.lower.tw/2+w),EY(sh*.85)],labels:[`2 PL ${size(sf.thickness)} X ${size(w)} X ${dim(sh)}`,'ASTM A572 GR. 50, ONE EACH','SIDE OF THE WEB UNDER THE','UPPER SHAFT INNER FLANGE']}
  ],EX(g.lower.tw/2+w)+56,EY(-g.cap.thickness)-4,EY(sh+2*inch));
  return {svg:svg+'</g>',scale:k.label};
 }});

 // Design data and notes.
 const check=(id:string)=>s.checks.find(v=>v.id===id),ratio=(id:string)=>checkDcText(s,check(id));
 const force=(v:number)=>{const t=format(v,'force',u,u==='SI'?1:2);return u==='US'?t.toUpperCase():t;};
 const r=s.steppedColumn,len=(v:number)=>Number.isFinite(v)?dim(v):'-',Fy=(v:number)=>{const t=format(v,'stress',u,u==='SI'?0:1);return u==='US'?t.toUpperCase():t;};
 const summary=elementSummary(s,c=>c.group==='Stepped column'),worst=[summary.strength,summary.fatigue].filter(v=>!!v).sort((a,b)=>b!.dc-a!.dc)[0],fails=failingNote(s,summary);
 const rows=[
  ['LOWER SHAFT (E)',`${lowName}, Fy = ${Fy(c.Fy)}; BASE TO STEP ${dim(c.seatElevation)}`],
  ['UPPER SHAFT (E)',`${upName}, Fy = ${Fy(st.upper.Fy)}; STEP TO TOP ${dim(c.height-c.seatElevation)}; OUTER FLANGES FLUSH`],
  ['STEP CAP (E)',`${capLabel}, TOP AT ${elev(hs)}`],
  ['GIRDER WEB FROM LOWER C/L',`${dim(gw)}; TO UPPER INNER FACE ${dim(g.tieDistance)}`],
  ...(s.existingColumn?[['REACTION ECCENTRICITY e (DESIGN)',`${dim(s.existingColumn.eccentricity)} FROM LOWER C/L (FAR BEARING EDGE); Mx = V·e`]]:[]),
  ...(r?[['EFFECTIVE LENGTHS L_c (BUCKLING)',`UPPER ${len(r.buckling.Lcx.upper)}, LOWER ${len(r.buckling.Lcx.lower)} (λ = ${r.buckling.factor.toFixed(1)}, GOVERNING COMBINATION, AISC 360 APP. 7)`],
   [`STEP REACTION / INNER FLANGE FORCE (${p.method})`,`${force(r.step.reaction)} / ${force(r.step.flangeForce)}`]]:[]),
  ['H1 RATIOS: UPPER / LOWER SHAFT',`${ratio('column-upper-interaction')} / ${ratio('column-lower-interaction')}`],
  ['RATIOS: BEARING / FLANGE / CAP / PANEL',`${ratio('step-bearing')} / ${ratio('step-flange-yielding')} / ${ratio('step-cap-flexure')} / ${ratio('step-panel-shear')}`],
  ['STEP STIFFENERS',sf?`2 PL ${size(sf.thickness)} X ${size(sf.width)} X ${dim(sh)}, ${weld(sf.weld)} FIELD FILLETS; RATIOS ${ratio('step-stiffener-column')} / ${ratio('step-stiffener-weld')}`:`NOT REQUIRED: WEB ${ratio('step-web-yielding')} (J10.2) / ${ratio('step-web-crippling')} (J10.3)`],
  ...(worst||fails?[['MAX. D/C, ALL STEPPED COLUMN CHECKS',`${worst?`${sheetDc(s,worst.dc)} (${worst.check.id})`:'-'}${fails?`; ${fails}`:''}`]]:[])
 ];
 const notes=[
  'THE RUNWAY GIRDERS BEAR ON THE STEP OF THE EXISTING STEPPED BUILDING COLUMNS, OVER THE LOWER SHAFT\'S CRANE-SIDE FLANGE: NO BRACKET. EXISTING STEEL IS SHOWN SCREENED AND DASHED; NEW WORK SOLID.',
  `SURVEY EVERY STEP BEFORE FABRICATION AND REPORT TO THE ENGINEER OF RECORD: BOTH SHAFT SIZES, THE STEP ELEVATION, THE CAP THICKNESS, LEVEL AND FLATNESS UNDER THE BEARING, THE CAP-TO-SHAFT WELDS, THE UPPER SHAFT POSITION AND PLUMB, AND THE LOWER WEB CONDITION${sf?' AT THE STIFFENERS':''}. DEVIATIONS OVER 1/8" FROM THE DIMENSIONS SHOWN NEED THE ENGINEER'S REVIEW.`,
  `BEARING PLATES SHIMMED TO THE THEORETICAL ELEVATION WITH STEEL SHIMS TO FULL BEARING; FIELD DRILL THE CAP FOR THE BEARING BOLTS AFTER THE GIRDER IS LINED AND LEVELED, CLEAR OF THE CAP-TO-SHAFT WELDS; CONFIRM NUT CLEARANCE UNDER THE CAP. NO FLAME CUTTING OF EXISTING STEEL.`,
  ...(sf?[`STEP STIFFENERS: FIT TO BEAR AGAINST THE UNDERSIDE OF THE CAP, CLIP ${size(stepStiffenerClip)} AT THE CAP-TO-WEB FILLET, FIELD WELD BOTH FACES TO THE EXISTING WEB WITH ${weld(sf.weld)} FILLETS PER THE EXISTING-STEEL WELDING NOTES ON S-00 (CRANE OUT OF SERVICE, COLUMN UNDER DEAD LOAD ONLY).`]:[]),
  `THE TOP FLANGE TIE LANDS ON THE UPPER SHAFT INNER FLANGE (${tieRef}); DO NOT WELD THE GIRDER TO THE CAP.`,
  'THE STEPPED COLUMN IS CHECKED IN THE CALCULATION REPORT (STEPPED COLUMN): EFFECTIVE LENGTHS FROM AN ELASTIC BUCKLING ANALYSIS OF THE TWO-SHAFT COLUMN (AISC 360-16 APPENDIX 7), H1 FOR EACH SHAFT, AND THE STEP: BEARING, CAP, FLANGE AND WEB LOCAL CHECKS AND PANEL SHEAR (AISC 360 J7, J10).'
 ];
 return {key:'stepped-column',name:'STEPPED COLUMNS',views,notes:(t:Style)=>[...(bracketForceTopic(s)==='stepped-column'?bracketForceBlocks(s,t):[]),heading(t,'STEPPED COLUMN DESIGN DATA'),table(t,['ITEM','VALUE'],rows,[1.25,1.75]),heading(t,'STEPPED COLUMN NOTES'),...numbered(t,notes)]};
}
