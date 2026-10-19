import {checkDcText,elementSummary,failingNote,sheetDc} from './sheetRatios';
import type {CalculationSnapshot} from '../engine/types';
import {format,toDisplay,unit} from '../engine/units';
import {tiedToBuilding} from '../engine/craneColumnInputs';
import {craneColumnLayout,columnTieGeometry,columnTieEndClearance,defaultSlotTolerance} from '../engine/craneColumn';
import {existingColumnSection} from '../engine/existingColumn';
import {activeColumnCap} from '../engine/columnCapInputs';
import {columnCapGeometry} from '../engine/columnCap';
import {stiffenerTieGeometry,flangeTieGeometry} from '../engine/tieGeometry';
import {isCapAngleTie} from '../engine/capAngle';
import {boltProperties} from '../engine/connectionStrength';
import {runwayElevations} from '../engine/drawingData';
import {astmSpec} from '../engine/materialSpecs';
import {heavyHex} from './heavyHex';
import {columnCapTitles} from './columnCapSheet';
import {elevationMarks,concrete,wPlan} from './newColumnSheet';
import {drawingElevation,plateInches,dimensionLength,specGrade,limitLength} from './drawingFormat';
import {sheetDrawingScale as drawingScale,text,line,rect,circle,dimH,dimV,n,breakLine,multiLeader,filletLeader,labelColumn,detailRef,detailTitles,capAngleTitles,bubble,textWidth,lettering,type XY} from './sheetGraphics';
import {AnnotationSpace} from './annotationSpace';
import {heading,numbered,table,type Style,type Block} from './noteBlocks';
import type {DetailTopic,DetailView} from './detailSheet';

const inch=25.4;
/**
 * Detail titles of a crane column tied to the existing building column (support 'crane-column', craneColumn.ts),
 * referenced from the general arrangement, the column cap and the new column details.
 */
export const craneColumnTitles={elevation:'CRANE COLUMN AND BUILDING COLUMN / ELEVATION',plan:'TIES TO BUILDING COLUMN / PLAN',tie:'COLUMN TIE / SECTION'} as const;

/** A vertical long slot (stadium) centered at (cx, cy): its length up the sheet, its width across. */
function vSlot(cx:number,cy:number,length:number,width:number,cls='runway-line'){
 const r=width/2,a=cy-length/2+r,b=cy+length/2-r;
 return `<path class="${cls}" d="M${n(cx-r)},${n(b)}L${n(cx-r)},${n(a)}A${n(r)},${n(r)} 0 0 1 ${n(cx+r)},${n(a)}L${n(cx+r)},${n(b)}A${n(r)},${n(r)} 0 0 1 ${n(cx-r)},${n(b)}Z"/>`;
}
/** The detail of the girder tie that reaches the building column: the paired-bar stiffener tie, the flange tie or the cap tieback angle. */
function girderTieRef(p:CalculationSnapshot['input']){
 return isCapAngleTie(p)?capAngleTitles.section:flangeTieGeometry(p)?detailTitles.flangeTie:detailTitles.tie;
}
/**
 * The girder tie as drawn on the elevation and the plan: its centerline elevation, its depth and where its bars run across
 * the runway (from the girder web, to the building column face).
 */
function girderTieLine(s:CalculationSnapshot){
 const p=s.input,d=p.details!,b=p.section,g=craneColumnLayout(p)!;
 const st=stiffenerTieGeometry(p),ft=flangeTieGeometry(p);
 // One work line with the calculation (craneColumnLayout: the tie's line of action, tieLine).
 if(st)return {y:g.girderTie.elevation,depth:st.height,from:st.start,to:g.girderTie.face,kind:'PAIRED BARS'};
 if(ft)return {y:g.girderTie.elevation,depth:d.brace.width,from:Math.max(b.bf/2,ft.start),to:g.girderTie.face,kind:ft.plies===1?'FLEXIBLE PLATE':'FLANGE TIE'};
 return {y:g.girderTie.elevation,depth:Math.max(3*inch,b.tf),from:b.bf/2,to:g.girderTie.face,kind:'CAP TIEBACK ANGLE'};
}

/**
 * Crane column details (AISC Design Guide 7 separate crane column; AIST TR-13 §5.9.2): the elevation across the runway of
 * the new crane column on its cap and base beside the existing building column with both ties, the plan of the ties at
 * a grid, and the column tie with its vertical slots, sleeves and shop welds; the design data and notes.
 */
export function craneColumnTopic(s:CalculationSnapshot):DetailTopic|undefined{
 const p=s.input;if(!tiedToBuilding(p)||!p.details||!activeColumnCap(p))return undefined;
 const g=craneColumnLayout(p);if(!g)return undefined;
 const u=p.units,d=p.details,b=p.section,k=p.craneColumn!,c=p.existingColumn!,base=p.columnBase,capG=columnCapGeometry(p),cap=capG.cap.plate,tg=columnTieGeometry(p),t=k.columnTie;
 const dim=(v:number)=>dimensionLength(v,u),size=(v:number)=>plateInches(v,u),weld=(v:number)=>plateInches(v,u).replaceAll('"','');
 // Travel provided rounds down and travel required rounds up: a drawn value never exceeds the calculated capacity.
 const travelMax=(v:number)=>u==='SI'?`${Math.floor(2*v+1e-9)/2} mm`:limitLength(v,u,'max'),travelMin=(v:number)=>u==='SI'?`${Math.ceil(2*v-1e-9)/2} mm`:limitLength(v,u,'min');
 const force=(v:number,q:Parameters<typeof format>[1]='force')=>{const x=format(v,q,u,u==='SI'?1:2);return u==='US'?x.toUpperCase():x;};
 const cc=g.craneColumn,bc=g.buildingColumn,face=bc.x-bc.d/2,ccFace=cc.d/2,clear=columnTieEndClearance,plateEnd=face-clear;
 // Bolts along the tie from its end at the building column: the first an edge distance in, the others at the pitch.
 const bolts=Array.from({length:t.bolts.count},(_,i)=>plateEnd-t.bolts.edge-i*t.bolts.pitch),tabEnd=plateEnd-tg.lap;
 const ccName=`NEW ${cc.shape} CRANE COLUMN`,bcName=`(E) ${bc.shape} BUILDING COLUMN`,plateLabel=`PL ${size(t.plate.thickness)} X ${size(t.plate.width)} X ${dim(plateEnd-ccFace)}`;
 // The tab on the building column (columnTieGeometry.tab): designed here, field welded to the existing flange.
 const tab=tg.tab,tabLabel=`TAB PL ${size(tab.thickness)} X ${size(tab.depth)} X ${dim(face-tabEnd)}`;
 const tieRef=girderTieRef(p),el=runwayElevations(p),zt=g.columnTie.elevation,gt=girderTieLine(s),db=t.bolts.diameter,hx=heavyHex(db);
 // Plate washers (AISC J3.2) covering each slot 1/4 in past its ends at either extreme of the sleeve travel (the washer
 // stays with the bolt), and 1/4 in past its sides; 1/8 in apart along the tie, else one continuous bar over the row.
 const wAlong=Math.max(t.slot.width+.5*inch,Math.min(2.5*db,t.bolts.pitch-inch/8)),bar=t.bolts.count>1&&wAlong>t.bolts.pitch-inch/8;
 const washer={t:5/16*inch,h:t.slot.length+2*tg.travel+.5*inch,w:bar?(t.bolts.count-1)*t.bolts.pitch+wAlong:wAlong,bar,each:wAlong},sleeve=t.plate.thickness+inch/16;
 const views:DetailView[]=[];

 // 1: Elevation across the runway at a typical grid, looking along the runway, crane span at the left: the crane column on
 // its base and cap with the girder, the existing building column dashed, the girder tie and the column tie at their
 // elevations. Both columns are broken between the base and the ties, so both ends draw at a legible scale.
 views.push({title:craneColumnTitles.elevation,rows:2,render:()=>{
  const bt=d.bearing.thickness,seat=c.seatElevation,H=c.height,Hc=H-cap.thickness,y0=seat+bt,tos=y0+b.d,capTop=b.kind==='cap'?b.capTw:0,rl=d.rail,railDepth=p.aist?.railDepth??p.railHeight,rb=tos+capTop,railTop=rb+railDepth;
  const tb=base?.plate.thickness??1.5*inch,gr=base?.grout??1.5*inch,N=base?.plate.N??cc.d+4*inch;
  const top=Math.max(railTop,gt.y+gt.depth/2)+10*inch,bottom=-(tb+gr)-12*inch,upperFrom=Math.min(zt-t.plate.width/2,seat-(capG.drop??0))-14*inch,lowerTo=16*inch;
  const broken=upperFrom-lowerTo>18*inch,gap=broken?22:0,shown=broken?(top-upperFrom)+(lowerTo-bottom):top-bottom;
  const xMin=Math.min(-N/2,-cap.width/2,-b.bf/2,-rl.baseWidth/2)-6*inch,xMax=bc.x+bc.d/2+3*inch;
  const sc=drawingScale(Math.min((600-gap)/shown,300/(xMax-xMin)),u),kk=sc.pointsPerMm,cx=200+(-xMin)*kk,X=(x:number)=>cx+x*kk;
  const foot=640-Math.max(0,(670-gap-shown*kk)/2);
  const Y=(y:number)=>!broken||y<=lowerTo?foot-(y-bottom)*kk:foot-(lowerTo-bottom)*kk-gap-(Math.max(y,upperFrom)-upperFrom)*kk;
  let svg='<g data-view="crane-column-elevation">';
  // A W column seen across its depth: both flanges edge-on; drawn between two elevations.
  const column=(x0:number,d0:number,tf:number,y1:number,y2:number,cls:string)=>line([X(x0-d0/2),Y(y1)],[X(x0-d0/2),Y(y2)],cls)+line([X(x0+d0/2),Y(y1)],[X(x0+d0/2),Y(y2)],cls)
   +line([X(x0-d0/2+tf),Y(y1)],[X(x0-d0/2+tf),Y(y2)],cls)+line([X(x0+d0/2-tf),Y(y1)],[X(x0+d0/2-tf),Y(y2)],cls);
  const brk=(x0:number,d0:number,y:number)=>breakLine([X(x0-d0/2)-6,Y(y)],[X(x0+d0/2)+6,Y(y)]);
  // Crane column (new, solid): from the base plate to under the cap, broken between the base and the tie.
  if(broken)svg+=column(0,cc.d,cc.tf,0,lowerTo,'runway-line')+column(0,cc.d,cc.tf,upperFrom,Hc,'runway-line')+brk(0,cc.d,lowerTo)+brk(0,cc.d,upperFrom);
  else svg+=column(0,cc.d,cc.tf,0,Hc,'runway-line');
  svg+=line([X(-cc.d/2),Y(Hc)],[X(cc.d/2),Y(Hc)],'runway-line');
  // Building column (existing, dashed): broken below the column tie and above the girder tie; it continues to its base and roof.
  const bTop=Math.min(bc.top,top-4*inch),bBottom=broken?upperFrom:lowerTo;
  svg+=`<g data-existing-column="building">${column(bc.x,bc.d,bc.tf,bBottom,bTop,'reference-line')}${brk(bc.x,bc.d,bBottom)}${bc.top>bTop+1?brk(bc.x,bc.d,bTop):line([X(bc.x-bc.d/2),Y(bTop)],[X(bc.x+bc.d/2),Y(bTop)],'reference-line')}</g>`;
  // Cap plate, bearing plate, girder section and rail, the girder centered on the crane column.
  svg+=rect(X(-cap.width/2),Y(H),cap.width*kk,cap.thickness*kk,'runway-line')+rect(X(-d.bearing.width/2),Y(y0),d.bearing.width*kk,bt*kk,'runway-line');
  svg+=`<path class="runway-line" d="M${n(X(-b.bf/2))},${n(Y(y0))}H${n(X(b.bf/2))}V${n(Y(y0+b.tf))}H${n(X(b.tw/2))}V${n(Y(tos-b.tf))}H${n(X(b.bf/2))}V${n(Y(tos))}H${n(X(-b.bf/2))}V${n(Y(tos-b.tf))}H${n(X(-b.tw/2))}V${n(Y(y0+b.tf))}H${n(X(-b.bf/2))}Z"/>`;
  const rz=-p.railEccentricity;
  svg+=`<path class="rail-line" d="M${n(X(rz-rl.baseWidth/2))},${n(Y(rb))}H${n(X(rz+rl.baseWidth/2))}V${n(Y(rb+rl.baseThickness))}H${n(X(rz+rl.webThickness/2))}V${n(Y(railTop-rl.headThickness))}H${n(X(rz+rl.headWidth/2))}V${n(Y(railTop))}H${n(X(rz-rl.headWidth/2))}V${n(Y(railTop-rl.headThickness))}H${n(X(rz-rl.webThickness/2))}V${n(Y(rb+rl.baseThickness))}H${n(X(rz-rl.baseWidth/2))}Z"/>`;
  // Girder tie at its elevation, to the building column face; the column tie plate at its elevation with the tab by others.
  svg+=rect(X(gt.from),Y(gt.y+gt.depth/2),(gt.to-gt.from)*kk,gt.depth*kk,'runway-line');
  svg+=rect(X(ccFace),Y(zt+t.plate.width/2),(plateEnd-ccFace)*kk,t.plate.width*kk,'runway-line')+rect(X(tabEnd),Y(zt+t.plate.width/2),(face-tabEnd)*kk,t.plate.width*kk,'runway-line');
  for(const x of bolts)svg+=vSlot(X(x),Y(zt),t.slot.length*kk,t.slot.width*kk)+circle(X(x),Y(zt),tg.od/2*kk,'runway-line');
  // Base plate, grout and the top of the footing, broken below.
  svg+=rect(X(-N/2),Y(0),N*kk,tb*kk,'runway-line')+rect(X(-N/2-inch),Y(-tb),(N+2*inch)*kk,gr*kk,'annotation');
  const ftTop=-(tb+gr),fx0=X(xMin+2*inch),fx1=X(cc.d/2+10*inch),fy=Y(ftTop),fb=Y(bottom+3*inch);
  svg+=line([fx0,fy],[fx1,fy],'runway-line')+concrete(fx0,fy,fx1-fx0,fb-fy,.7)+breakLine([fx0-3,fb],[fx1+3,fb]);
  for(const z of [-1,1]){const xa=z*(N/2-(base?.anchors.edge??2*inch));svg+=line([X(xa),Y(tb+(base?.anchors.diameter??inch)*1.6)],[X(xa),fb-4],'runway-line');}
  // Centerlines: the crane column (girder web) and the building column.
  svg+=line([X(0),Y(top)-6],[X(0),Y(bottom)+8],'grid-line')+line([X(bc.x),Y(top)-6],[X(bc.x),Y(bTop)+4],'grid-line');
  // Across the top: the girder web to the building column face, the column centerlines; the clear gap at the column tie.
  const dt=Y(top)-10;
  svg+=dimH(X(0),X(face),Y(gt.y+gt.depth/2)-4,dt,dim(face),'right')+dimH(X(0),X(bc.x),Y(top)-6,dt-18,dim(bc.x),'right');
  const gy=Y(zt-t.plate.width/2)+18;
  svg+=dimH(X(ccFace),X(face),Y(zt-t.plate.width/2)+3,gy,`${dim(g.gap)} CLR.`,'right');
  // Heights from the top of the base plate at the left: the column tie, the bearing seat (the cap top) and the girder tie.
  const dx=X(xMin)-6,from=X(-N/2)-2;
  svg+=dimV(Y(zt),Y(0),from,dx-16,dim(zt))+dimV(Y(seat),Y(0),from,dx-34,dim(seat))+dimV(Y(gt.y),Y(0),from,dx-52,dim(gt.y));
  for(const [y,label] of [[zt,'C/L COL. TIE'],[gt.y,'C/L GIRDER TIE']] as const)svg+=line([X(-b.bf/2)-4,Y(y)],[X(xMin),Y(y)],'annotation')+text(X(xMin)+2,Y(y)-3,label,lettering.text,'start');
  svg+=elevationMarks([{y:Y(railTop),label:`T.O.R. ${el?`EL. ${drawingElevation(el.tor,u)}`:''}`},{y:Y(seat),label:`BRG. SEAT ${el?`EL. ${drawingElevation(el.seat,u)}`:''}`}],dx-66,'left',yy=>yy===Y(railTop)?X(rz-rl.headWidth/2)-2:X(-cap.width/2)-2);
  // Callouts at the right of the building column, in the order of their targets.
  const lx=X(xMax)+24,items:{at:XY;labels:string[];weld?:string;field?:boolean}[]=[
   {at:[X(b.bf/2),Y(tos-b.tf/2)],labels:[`${b.name} GIRDER, CENTERED ON THE`,'CRANE COLUMN, SEE S-01']},
   {at:[X((gt.from+gt.to)/2),Y(gt.y+gt.depth/2)],labels:[`GIRDER TIE (${gt.kind}) TO THE`,`BUILDING COLUMN, SEE ${detailRef(tieRef)}`]},
   {at:[X(cap.width/2),Y(H+cap.thickness/2)],labels:[`COLUMN CAP, SEE ${detailRef(columnCapTitles.section)}`]},
   {at:[X((ccFace+tabEnd)/2),Y(zt+t.plate.width/2)],labels:[`COLUMN TIE ${plateLabel},`,`VERT. SLOTS; SEE ${detailRef(craneColumnTitles.tie)}`]},
   {at:[X(face-clear/2),Y(zt-t.plate.width/2)],labels:[`${tabLabel}, FIELD WELDED TO`,`THE BUILDING COLUMN; ${detailRef(craneColumnTitles.tie)}`]},
   {at:[X(bc.x+bc.d/2),Y((gt.y+zt)/2)],labels:[`${bcName}`,'(REF.), FIELD VERIFY']},
   {at:[X(cc.d/2),Y(broken?upperFrom+(zt-t.plate.width/2-upperFrom)*.3:H*.5)],labels:[`${ccName},`,`${k.base.toUpperCase()} BASE; SEE ${detailRef(detailTitles.newColumn)}`]},
   {at:[X(N/2),Y(tb/2)],labels:[`BASE PL, SEE ${detailRef(detailTitles.basePlate)}`]}
  ];
  svg+=labelColumn(items,lx,Y(top)+6,Y(bottom)-6);
  svg+=text(X(xMin),Y(bottom)+16,'CRANE SPAN',lettering.text,'start')+`<path class="leader-arrow" d="M${n(X(xMin)-10)},${n(Y(bottom)+13)}l6,-2.2v4.4z"/>`;
  return {svg:svg+'</g>',scale:sc.label};
 }});

 // 2: Plan at a typical interior grid: the crane column under the cap and girders, the building column dashed, the girder
 // ties at the girder bearings and the column tie at the column centerline. Across the runway down the sheet? No: across the
 // runway to the right (toward the building column), along the runway up the sheet.
 views.push({title:craneColumnTitles.plan,render:()=>{
  const grid=capG.grids.find(v=>v.bearings.length>1)??capG.grids[0],centers=[...new Set(grid.bearings.map(v=>Math.round(v.center)))].sort((a,c)=>a-c);
  const along=Math.max(cap.length/2,bc.bf/2,...centers.map(Math.abs))+5*inch,xMin=-Math.max(cap.width/2,b.bf/2)-4*inch,xMax=bc.x+bc.d/2+3*inch;
  const sc=drawingScale(Math.min(330/(xMax-xMin),260/(2*along)),u),kk=sc.pointsPerMm,cx=150+(-xMin)*kk,cy=70+along*kk,X=(x:number)=>cx+x*kk,Y=(y:number)=>cy-y*kk;
  let svg='<g data-view="crane-column-ties-plan">';
  // Crane column (below the cap, hidden), the cap edges, the girders' top flanges beyond the cap (girder ends at the grid).
  const wAlong=(x0:number,d0:number,bf:number,tf:number,tw:number,cls:string)=>wPlan(X(x0),cy,d0,bf,tf,tw,kk,cls);
  svg+=wAlong(0,cc.d,cc.bf,cc.tf,cc.tw,'runway-line')+rect(X(-cap.width/2),Y(cap.length/2),cap.width*kk,cap.length*kk,'hidden-line');
  const gapAt=grid.bearings.length>1?(Math.min(...grid.bearings.filter(v=>v.end==='right').map(v=>v.x1))+Math.max(...grid.bearings.filter(v=>v.end==='left').map(v=>v.x0)))/2:0;
  for(const v of grid.bearings){const y1=v.end==='right'?v.x1:v.x0,y2=v.end==='right'?-along+2*inch:along-2*inch;
   svg+=rect(X(-b.bf/2),Y(Math.max(y1,y2)),b.bf*kk,Math.abs(y2-y1)*kk,'hidden-line')+line([X(-b.tw/2),Y(y1)],[X(-b.tw/2),Y(y2)],'hidden-line')+line([X(b.tw/2),Y(y1)],[X(b.tw/2),Y(y2)],'hidden-line');
   // The girder's bearing stiffener pair at its bearing center, where the girder tie's gusset is.
   svg+=rect(X(-b.tw/2-d.bearing.stiffenerWidth),Y(v.center+d.bearing.stiffenerThickness/2),(2*d.bearing.stiffenerWidth+b.tw)*kk,d.bearing.stiffenerThickness*kk,'hidden-line');}
  void gapAt;
  // Building column (existing, dashed) at its line.
  svg+=wAlong(bc.x,bc.d,bc.bf,bc.tf,bc.tw,'reference-line');
  // Girder ties at the girder bearings, the column tie plate at the column centerline with the tab by others beside it.
  const tieW=Math.max(d.brace.gussetThickness+2*d.brace.thickness,b.tw);
  for(const y of centers)svg+=rect(X(gt.from),Y(y+tieW/2),(gt.to-gt.from)*kk,tieW*kk,'runway-line');
  const tp=t.plate.thickness;
  svg+=rect(X(ccFace),Y(tp/2),(plateEnd-ccFace)*kk,tp*kk,'runway-line')+rect(X(tabEnd),Y(-tp/2),(face-tabEnd)*kk,tp*kk,'runway-line');
  for(const x of bolts)svg+=line([X(x),Y(tp/2)-5],[X(x),Y(-3*tp/2)+5],'annotation');
  // Grid lines: the runway grid along the plan, the crane column line (girder web) and the building column line.
  svg+=line([X(xMin),cy],[X(xMax)+16,cy],'grid-line')+bubble(X(xMax)+27,cy,String(grid.grid+1),11);
  svg+=line([X(0),Y(along)],[X(0),Y(-along)+6],'grid-line')+line([X(bc.x),Y(along)],[X(bc.x),Y(-along)+6],'grid-line');
  // Dimensions below: the girder web to the building column face, the column centerlines; at the left the tie stations.
  const yb=Y(-along)+10;
  svg+=dimH(X(0),X(face),Y(-bc.bf/2)+3,yb,dim(face),'right')+dimH(X(0),X(bc.x),Y(-along)+6,yb+18,dim(bc.x),'right');
  const xl=X(xMin)-4;
  if(centers.length>1)for(let i=0;i<centers.length;i++){const a=i?centers[i-1]:0,cB=centers[i];if(Math.abs(cB-a)>1)svg+=dimV(Y(Math.max(a,cB)),Y(Math.min(a,cB)),X(-b.bf/2)-2,xl-(i%2)*18,size(Math.abs(cB-a)));}
  // Callouts at the right of the building column.
  const lx=X(xMax)+46,items:{at:XY;labels:string[]}[]=[
   {at:[X((gt.from+gt.to)/2),Y(centers.at(-1)!+tieW/2)],labels:[`GIRDER TIES AT THE BEARINGS,`,`SEE ${detailRef(tieRef)}`]},
   {at:[X(-b.bf/2),Y(along-3*inch)],labels:[`${b.name} GIRDERS ABOVE, ENDS`,`ON THE CAP (${detailRef(columnCapTitles.section)})`]},
   {at:[X((ccFace+tabEnd)/2),Y(tp/2)],labels:[`COLUMN TIE ${plateLabel}`,`AT THE COLUMN C/L; ${detailRef(craneColumnTitles.tie)}`]},
   {at:[X((tabEnd+face)/2),Y(-tp/2)],labels:['TAB, FIELD WELD TO (E) COL.']},
   {at:[X(bc.x+bc.d/2),Y(-bc.bf/4)],labels:[`${bcName}`,'(REF.), FIELD VERIFY']},
   {at:[X(-cc.d/2),Y(-cc.bf/2)],labels:[`${ccName}`,'(CAP AND GIRDERS ABOVE DASHED)']}
  ];
  svg+=labelColumn(items,lx,Y(along)+4,Y(-along)+20);
  svg+=text(X(xMin),yb+42,'PLAN AT A TYPICAL GRID, LOOKING DOWN; CRANE SPAN AT THE LEFT. GRID B OPPOSITE HAND.',lettering.text,'start');
  return {svg:svg+'</g>',scale:sc.label};
 }});

 // 3: The column tie: elevation looking along the runway (the plate face with its vertical slots, the tab by others behind
 // it), and below it the horizontal section through the bolts (sleeve, plate washer, bolt and nut, shop fillets).
 views.push({title:craneColumnTitles.tie,render:()=>{
  const w=t.plate.width,tp=t.plate.thickness,flange=2.5*inch,x0=ccFace-cc.tf-1.5*inch,x1=face+bc.tf+1.5*inch;
  const sc=drawingScale(Math.min(300/(x1-x0),150/(w+4*inch)),u),kk=sc.pointsPerMm,cx=240-x0*kk,X=(x:number)=>cx+x*kk,ey=110+(w/2+2*inch)*kk,Z=(z:number)=>ey-z*kk;
  let svg='<g data-view="column-tie-section">';
  const zTop=w/2+2*inch,zBot=-w/2-2*inch;
  // Flanges seen edge-on: the crane column flange (new) and the building column flange (existing), broken above and below.
  svg+=rect(X(ccFace-cc.tf),Z(zTop),cc.tf*kk,(zTop-zBot)*kk,'runway-line')+rect(X(face),Z(zTop),bc.tf*kk,(zTop-zBot)*kk,'reference-line');
  for(const z of [zTop,zBot])svg+=breakLine([X(ccFace-cc.tf)-5,Z(z)],[X(ccFace)+5,Z(z)])+breakLine([X(face)-5,Z(z)],[X(face+bc.tf)+5,Z(z)]);
  void flange;
  // Plate, tab, slots with the sleeves centered and the bolts.
  svg+=rect(X(ccFace),Z(w/2),(plateEnd-ccFace)*kk,w*kk,'runway-line')+rect(X(tabEnd),Z(w/2),(face-tabEnd)*kk,w*kk,'runway-line');
  for(const x of bolts)svg+=vSlot(X(x),Z(0),t.slot.length*kk,t.slot.width*kk)+circle(X(x),Z(0),tg.od/2*kk,'runway-line')+circle(X(x),Z(0),db/2*kk,'annotation')+line([X(x),Z(0)-t.slot.length/2*kk-4],[X(x),Z(0)+t.slot.length/2*kk+4],'grid-line');
  svg+=line([X(ccFace)-4,Z(0)],[X(plateEnd)+8,Z(0)],'grid-line');
  // Dimensions above: the plate length and its end clearance, the clear gap; below the slots: edge, pitch and the tab lap.
  const ya=Z(w/2)-14,dims=new AnnotationSpace(svg);
  svg+=dims.add(dimH(X(ccFace),X(plateEnd),Z(w/2)-3,ya,dim(plateEnd-ccFace),'left')+dimH(X(plateEnd),X(face),Z(w/2)-3,ya,size(clear),'right',X(face+bc.tf)+4));
  svg+=dims.add(dimH(X(ccFace),X(face),Z(zTop)-3,ya-18,`${dim(g.gap)} CLR.`,'right'));
  const stations=[tabEnd,...[...bolts].reverse(),plateEnd],yb=Z(-w/2)+16;
  for(let i=1;i<stations.length;i++){const a=X(stations[i-1]),c2=X(stations[i]);svg+=dims.add(dimH(a,c2,Z(-w/2)-3,yb,size(stations[i]-stations[i-1]),i===1?'left':'right'));}
  // At the right: the plate depth and the slot length.
  const xr=X(x1)+8;
  svg+=dimV(Z(w/2),Z(-w/2),X(plateEnd)+2,xr+30,size(w))+dimV(Z(t.slot.length/2),Z(-t.slot.length/2),X(bolts[0])+t.slot.width/2*kk+2,xr+10,size(t.slot.length));
  // Section A-A through the bolts, below the elevation: along the runway down the sheet, the plate on the near side, the
  // tab beyond it, the sleeves through the slots, the plate washers, bolts and nuts, and the shop fillets.
  const tt=tp,above=sleeve-tp+washer.t+hx.head+inch,belowT=tp+tt+hx.washer.t+hx.nut+inch,sy=Z(zBot)+44+above*kk,Y=(y:number)=>sy+y*kk;
  for(const [x,tf,cls] of [[ccFace-cc.tf,cc.tf,'runway-line'],[face,bc.tf,'reference-line']] as const){
   svg+=rect(X(x),Y(-above),tf*kk,(above+belowT)*kk,cls);
   for(const y of [-above,belowT])svg+=breakLine([X(x)-5,Y(y)],[X(x+tf)+5,Y(y)]);
  }
  svg+=rect(X(ccFace),Y(0),(plateEnd-ccFace)*kk,tp*kk,'runway-line')+rect(X(tabEnd),Y(tp),(face-tabEnd)*kk,tt*kk,'runway-line');
  // Field fillets both faces of the tab at the building column flange.
  for(const [y,sgn] of [[tp,-1],[tp+tt,1]] as const)svg+=`<path class="runway-line" d="M${n(X(face))},${n(Y(y))}l${n(-tab.weld*kk)},0L${n(X(face))},${n(Y(y)+sgn*tab.weld*kk)}Z"/>`;
  // Shop fillets both faces of the plate at the crane column flange.
  for(const [y,sgn] of [[0,-1],[tp,1]] as const)svg+=`<path class="runway-line" d="M${n(X(ccFace))},${n(Y(y))}l${n(tg.weld*kk)},0L${n(X(ccFace))},${n(Y(y)+sgn*tg.weld*kk)}Z"/>`;
  for(const x of bolts){
   // Sleeve through the slot, standing on the tab; plate washer on the sleeve; head on the washer, nut and F436 washer beyond the tab.
   const r0=tg.hole/2,r1=tg.od/2,ws=washer.each/2,top0=-(sleeve-tp);
   svg+=rect(X(x-r1),Y(top0),(r1-r0)*kk,sleeve*kk,'runway-line')+rect(X(x+r0),Y(top0),(r1-r0)*kk,sleeve*kk,'runway-line');
   if(!washer.bar||x===bolts[0])svg+=rect(X(washer.bar?bolts.at(-1)!-washer.each/2:x-ws),Y(top0-washer.t),(washer.bar?washer.w:2*ws)*kk,washer.t*kk,'runway-line');
   svg+=rect(X(x-hx.corners/2),Y(top0-washer.t-hx.head),hx.corners*kk,hx.head*kk,'runway-line');
   svg+=rect(X(x-hx.washer.od/2),Y(tp+tt),hx.washer.od*kk,hx.washer.t*kk,'runway-line')+rect(X(x-hx.corners/2),Y(tp+tt+hx.washer.t),hx.corners*kk,hx.nut*kk,'runway-line');
   svg+=line([X(x),Y(top0-washer.t-hx.head)-4],[X(x),Y(tp+tt+hx.washer.t+hx.nut)+4],'grid-line');
  }
  // Cut A-A on the elevation through the bolt row, looking down.
  for(const xa of [X(ccFace)-18,X(face+bc.tf)+18])svg+=line([xa-6,Z(0)],[xa+6,Z(0)],'divider')+`<path class="leader-arrow" d="M${n(xa)},${n(Z(0)+9)}l-2.2,-5h4.4z"/>`+text(xa,Z(0)-4,'A',lettering.text,'middle',700);
  const secBottom=Y(belowT)+6;
  svg+=text((X(ccFace)+X(face))/2,secBottom+16,'SECTION A-A AT THE BOLTS',lettering.text,'middle',700);
  // Callouts: the shop weld and the crane column at the left, the rest at the right.
  const lw=Math.max(...['PL TO CRANE COL. FLANGE,','BOTH FACES, FULL DEPTH (SHOP)',`${ccName} FLANGE`].map(v=>textWidth(v,lettering.text)));
  const left:{at:XY;labels:string[];weld?:string}[]=[
   {at:[X(ccFace-cc.tf),Z(w/2+inch)],labels:[`${ccName} FLANGE`]},
   {at:[X(ccFace)+tg.weld*kk*.4,Y(tp)+tg.weld*kk*.4],labels:['PL TO CRANE COL. FLANGE,','BOTH FACES, FULL DEPTH (SHOP)'],weld:size(tg.weld)}
  ];
  svg+=labelColumn(left,X(ccFace-cc.tf)-36-Math.max(lw,89),Z(zTop)+10,secBottom);
  const lx=X(x1)+60,items:{at:XY;labels:string[]}[]=[
   {at:[X((ccFace+tabEnd)/2),Z(w/2)],labels:[`${plateLabel},`,specGrade(astmSpec('plate',t.plate.Fy,t.plate.Fu).toUpperCase())]},
   {at:[X(bolts[0])+t.slot.width/2*kk,Z(t.slot.length/4)],labels:[`${size(t.slot.width)} X ${size(t.slot.length)} VERT. SLOTS;`,`TRAVEL ${travelMax(tg.travel)} EACH WAY`]},
   {at:[X((tabEnd+plateEnd)/2),Z(-w/2)],labels:[`${tabLabel}, STD.`,`${size(tg.hole)} HOLES TO MATCH THE SLOTS`]},
   {at:[X(face+bc.tf),Z(-w/2-inch)],labels:[`${bcName} FLANGE (REF.)`]}
  ];
  svg+=labelColumn(items,lx,Z(zTop)+2,Z(zBot));
  // The section's callouts beside the section, so their leaders stay clear of the elevation's dimensions.
  const parts:{at:XY;labels:string[];weld?:string;field?:boolean}[]=[
   {at:[X(face)-tab.weld*kk*.4,Y(tp+tt)+tab.weld*kk*.4],labels:['TAB TO (E) COL. FLANGE, BOTH','FACES, FULL DEPTH (FIELD)'],weld:size(tab.weld),field:true},
   {at:[X(bolts[0]+washer.each/2),Y(-(sleeve-tp)-washer.t/2)],labels:[`${washer.bar?'BAR':'PL'} WASHER ${size(washer.t)} X ${size(washer.w)}`,`X ${size(washer.h)}${washer.bar?', CONT. OVER THE BOLTS':', EACH BOLT'} (J3.2)`]},
   {at:[X(bolts[0]+tg.od/2),Y(tp/2)],labels:[`SLEEVE ${size(tg.od)} OD X ${size(tg.hole)} BORE`,`X ${size(sleeve)} (PLATE + 1/16")`]},
   {at:[X(bolts[0]+hx.corners/2),Y(tp+tt+hx.washer.t+hx.nut/2)],labels:[`${t.bolts.count} - ${size(db)} DIA. ${t.bolts.grade},`,'PRETENSIONED AGAINST THE SLEEVES']}
  ];
  svg+=labelColumn(parts,lx,Y(-above),secBottom);
  return {svg:svg+'</g>',scale:sc.label};
 }});

 // Design data and notes.
 const cr=s.craneColumn,check=(id:string)=>s.checks.find(v=>v.id===id),ratio=(id:string)=>checkDcText(s,check(id));
 const lrfd=p.method;
 const rows=[
  ['CRANE COLUMN',`${ccName}, ASTM A992, ${dim(c.height)} BASE TO CAP; ${k.base.toUpperCase()} BASE, BRACED ACROSS THE RUNWAY BY THE COLUMN TIE AT ${dim(zt)} AND ALONG IT BY THE CRANE-LEVEL BRACING`],
  ['BUILDING COLUMN',`${bcName} PER SURVEY, ${dim(bc.x)} C/L TO C/L FROM THE CRANE COLUMN, ${dim(g.gap)} CLEAR BETWEEN FLANGES`],
  [`TIE FORCES TO THE BUILDING COLUMN (${lrfd})`,cr?`GIRDER TIE ${force(cr.ties.girderTie)} AT ${dim(gt.y)}; COLUMN TIE ${force(cr.ties.columnTie)} AT ${dim(zt)} (H ONLY; S-00)`:'-'],
  ['COLUMN TIE',`${plateLabel}; ${t.bolts.count} - ${size(db)} DIA. ${t.bolts.grade} IN ${size(t.slot.width)} X ${size(t.slot.length)} VERT. SLOTS AT ${size(t.bolts.pitch)}, EDGE ${size(t.bolts.edge)}; ${weld(tg.weld)} SHOP FILLETS BOTH FACES`],
  ['COLUMN TIE TAB (ON THE BUILDING COLUMN)',`${tabLabel}, STD. HOLES; ${weld(tab.weld)} FIELD FILLETS BOTH FACES; RATIOS BEARING / WELD / WEB ${ratio('crane-column-tab-bearing')} / ${ratio('crane-column-tab-weld')} / ${ratio('crane-column-tab-web-yielding')}`],
  ...(cr?[['NODAL BRACE (AISC APP. 6): STRENGTH REQ. / PROVIDED',`${force(cr.brace.strength.required)} (0.01 PR, PR ${force(cr.brace.Pr)}) / ${force(cr.brace.strength.provided)}`],
   ['NODAL BRACE: STIFFNESS REQ. / PROVIDED',`${force(cr.brace.stiffness.required,'stiffness')} / ${force(cr.brace.stiffness.provided,'stiffness')} (BUILDING COLUMN IN SERIES WITH THE TIE, SLEEVE PLAY INCLUDED)`],
   ['SLOT TRAVEL: DEMAND / PROVIDED, EACH WAY',`${travelMin(cr.slot.demand)} / ${travelMax(cr.slot.capacity)} (LARGER COLUMN SHORTENING PL/EA ${force(Math.max(cr.slot.crane,cr.slot.building),'length')} + TOLERANCE ${size(cr.slot.tolerance)})`]]:[]),
  ['RATIOS: BRACE STIFFNESS / STRENGTH / BOLTS / WELD / SLOTS',`${ratio('crane-column-brace-stiffness')} / ${ratio('crane-column-brace-strength')} / ${ratio('crane-column-tie-bolts')} / ${ratio('crane-column-tie-weld')} / ${ratio('crane-column-tie-slot-travel')}`],
  ['RATIOS: BUILDING COLUMN H1 / DRIFT',`${ratio('building-column-interaction')} / ${ratio('building-column-drift')}`],
  ...(()=>{const e=elementSummary(s,c2=>c2.group==='Crane column'||c2.group==='Building column'),m=[e.strength,e.fatigue].filter(v=>!!v).sort((a,b2)=>b2!.dc-a!.dc)[0],f=failingNote(s,e);return m||f?[[`MAX. D/C, CRANE AND BUILDING COLUMN CHECKS`,`${m?`${sheetDc(s,m.dc)} (${m.check.id})`:'-'}${f?`; ${f}`:''}`]]:[];})()
 ];
 const notes=[
  `THE NEW CRANE COLUMNS CARRY THE RUNWAY GIRDER REACTIONS ON THEIR CAPS TO THEIR OWN FOOTINGS (AIST TR-13 §5.9.2; AISC DG7 SEPARATE CRANE COLUMN). THE EXISTING BUILDING COLUMNS TAKE ONLY THE HORIZONTAL FORCES OF THE GIRDER TIE AND THE COLUMN TIE LISTED ON S-00; NO RUNWAY VERTICAL LOAD.`,
  `FIELD VERIFY EACH BUILDING COLUMN (SIZE, PLUMBNESS, FACE LOCATION FROM THE CRANE COLUMN LINE AND ELEVATIONS) BEFORE FABRICATING THE TIES. THE GIRDER TIE AND THE COLUMN TIE PLATE ARE CUT TO THE SURVEYED FACE; REPORT A CLEAR GAP UNDER ${dim(tg.minimumGap)} OR OVER ${dim(g.gap+inch)} TO THE ENGINEER OF RECORD.`,
  `COLUMN TIE: SHOP WELD THE PLATE TO THE CRANE COLUMN FLANGE WITH ${weld(tg.weld)} FILLETS BOTH FACES, FULL DEPTH, E70XX. ${tabLabel} ON THE BUILDING COLUMN AT ITS WEB LINE, ${astmSpec('plate',t.plate.Fy,t.plate.Fu).toUpperCase()}, STANDARD ${size(tg.hole)} HOLES MATCHING THE SLOTS: FIELD WELD TO THE EXISTING COLUMN FLANGE WITH ${weld(tab.weld)} FILLETS BOTH FACES, FULL DEPTH, AT THE SURVEYED LOCATION. WELDING TO THE EXISTING COLUMN: BASE METAL CONFIRMATION, APPROVED WPS, PREHEAT AND LOAD CONDITION PER THE EXISTING BUILDING NOTES ON S-00.`,
  `PRETENSION THE COLUMN TIE BOLTS AGAINST THE STEEL SLEEVES; THE PLATE IS NOT CLAMPED. SET EACH SLEEVE CENTERED IN ITS SLOT WITH THE RUNWAY DEAD LOAD IN PLACE AND THE CRANE OFF THE RUNWAY. DO NOT WELD, SHIM OR TACK THE PLATE TO THE TAB: THE SLOTS LET THE COLUMNS SHORTEN INDEPENDENTLY ${travelMax(tg.travel)} EACH WAY (DIFFERENTIAL SHORTENING PLUS ${size(k.tolerance??defaultSlotTolerance)} ERECTION TOLERANCE).`,
  `ERECT EACH CRANE COLUMN PLUMB ON ITS BASE AND HOLD IT WITH TEMPORARY BRACING UNTIL THE COLUMN TIE AND THE CRANE-LEVEL BRACING ARE COMPLETE: THE COLUMN TIE IS THE CRANE COLUMN'S BRACE ACROSS THE RUNWAY (AISC 360 APPENDIX 6 NODAL BRACE). SET THE GIRDERS, THEN THE GIRDER TIES.`,
  `INSPECT THE COLUMN TIE SLEEVES, BOLTS AND SLOT TRAVEL WITH THE GIRDER TIES AT THE CRANE INSPECTION INTERVALS; RE-CENTER SLEEVES THAT BEAR ON A SLOT END.`
 ];
 return {key:'crane-column',name:'CRANE COLUMNS & TIES',views,notes:(st:Style)=>[heading(st,'CRANE COLUMN DESIGN DATA'),table(st,['ITEM','VALUE'],rows,[1.25,1.75]),heading(st,'CRANE COLUMN AND TIE NOTES'),...numbered(st,notes)]};
}
void boltProperties;void multiLeader;void filletLeader;void textWidth;void existingColumnSection;

/**
 * The two ties of a crane column on the typical runway section (planSheet typicalSection): the girder tie at its elevation
 * from the girder to the building column face and the column tie plate at the crane-column top, at a runway grid `grid`
 * (meters across the section, `sign` toward the building column), the section's seat at `seatV` (meters) and its
 * projection SX, SY (meters to layout units).
 */
export function craneColumnSectionTies(s:CalculationSnapshot,grid:number,sign:number,seatV:number,SX:(u:number)=>number,SY:(v:number)=>number){
 const p=s.input,g=craneColumnLayout(p);if(!g||!p.details)return '';
 const v=(z:number)=>seatV+(z-p.existingColumn!.seatElevation)/1000,u=(x:number)=>grid+sign*x/1000,gt=girderTieLine(s),t=p.craneColumn!.columnTie;
 const face=g.buildingColumn.x-g.buildingColumn.d/2,box=(x0:number,x1:number,z:number,h:number)=>{const a=SX(u(x0)),b=SX(u(x1));return rect(Math.min(a,b),SY(v(z+h/2)),Math.abs(b-a),SY(v(z-h/2))-SY(v(z+h/2)),'runway-line');};
 return `<g data-crane-column-ties="section">${box(gt.from,gt.to,gt.y,gt.depth)}${box(g.craneColumn.d/2,face-columnTieEndClearance,g.columnTie.elevation,t.plate.width)}</g>`;
}
/** The S-01 sheet note on the crane columns tied to the building columns beside them. */
export function craneColumnPlanNote(s:CalculationSnapshot){
 const p=s.input,g=craneColumnLayout(p)!,u=p.units,source=p.existingColumn?.adjacent?.source||p.craneColumn!.building.source||'SOURCE NOT ENTERED';
 return `NEW ${g.craneColumn.shape} CRANE COLUMNS ON SPREAD FOOTINGS AT EVERY GRID OF BOTH RUNWAYS (${detailRef(detailTitles.newColumn)}), EACH TIED TO THE EXISTING ${g.buildingColumn.shape} BUILDING COLUMN ${dimensionLength(g.buildingColumn.x,u)} OUTBOARD BY THE GIRDER TIE AND THE COLUMN TIE (${detailRef(craneColumnTitles.elevation)}). THE BUILDING COLUMNS AND FOOTINGS ARE SHOWN DASHED FROM THE SURVEY (${source.toUpperCase().slice(0,110)}) AND TAKE ONLY THE TIE FORCES LISTED ON S-00, NO RUNWAY VERTICAL LOAD. FIELD VERIFY THE SURVEY, THE GRID DIMENSIONS, THE BUILDING COLUMN FACES AND FOOTINGS BEFORE LAYOUT; FOOTING COORDINATION ON ${detailRef('FOOTING / PLAN')}.`;
}

/**
 * S-00 block: the crane column's reactions to its own footing, the governing base actions the column base and footing are
 * designed for (columnBase.ts), at the top of the base plate; the building column takes none of them.
 */
export function craneColumnCoverBlocks(s:CalculationSnapshot,_t:Style,H:(v:string)=>Block,P:(v:string)=>Block,T:(h:string[],r:string[][],w:number[])=>Block):Block[]{
 const r=s.columnBase,p=s.input,u=p.units;if(!r||!tiedToBuilding(p))return [];
 // Small values to two decimals (no exponent), as the delivered forces table.
 const f=(v:number,q:'force'|'moment'='force')=>{const d=toDisplay(v,q,u),x=Math.abs(d)<.1?`${(Math.abs(d)<.005?0:d).toFixed(2)} ${unit(q,u)}`:format(v,q,u,u==='SI'?1:2);return u==='US'?x.toUpperCase():x;};
 const seen=new Set<string>(),rows:string[][]=[];
 for(const [label,a] of [['Base plate (governing)',r.plate.action],['Soil bearing',r.footing.soilAction],['Anchor rods',r.anchors.action],['Sliding',r.footing.slidingAction],['Uplift',r.uplift?.action]] as const){
  if(!a||seen.has(a.id))continue;seen.add(a.id);
  rows.push([label.toUpperCase(),a.id.toUpperCase(),f(a.P),f(a.Mx,'moment'),f(a.Vx),f(a.Vy)]);
 }
 const k=p.craneColumn!;
 return [H('CRANE COLUMN REACTIONS TO ITS FOOTING · GOVERNING BASE ACTIONS'),{...T(['ACTION','COMBINATION','P','MX','V ACROSS','V ALONG'],rows,[1.15,1.35,.75,.75,.75,.75]),keep:true},
  P(`PER CRANE COLUMN AT THE TOP OF THE BASE PLATE, THE GOVERNING GRID: P AXIAL, + DOWN (GIRDER REACTIONS ON THE CAP, THE COLUMN AND THE CAP); MX ACROSS THE RUNWAY (${k.base==='pinned'?'PINNED BASE: NONE':'FIXED BASE'}); V ACROSS FROM THE RAIL ECCENTRICITY AND THE TIES' RELEASE, V ALONG FROM THE CRANE-LEVEL BRACING. LRFD ROWS ARE FACTORED; ASD ROWS (SOIL, STABILITY) ARE SERVICE LEVEL. THE FOOTING WEIGHT IS ADDED IN THE FOOTING CHECKS.`)];
}
