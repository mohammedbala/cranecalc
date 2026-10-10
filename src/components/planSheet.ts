import {newColumnTopic} from './newColumnSheet';
import {flangeTieTopic} from './flangeTieSheet';
import {connectionOptionChecks} from '../engine/connectionOptions';
import {connectionConceptSheetSvg} from './connectionConceptSheet';
import {bracketTopic} from './bracketSheet';
import {usesExistingBracket,existingBracket} from '../engine/existingBracket';
import {simpleSupportTopic} from './simpleSupportSheet';
import {capTopic} from './capSheet';
import {packDetailSheets,detailSheetSvg,detailSheetTitle,type DetailTopic} from './detailSheet';
import type { CalculationSnapshot } from '../engine/types';
import { defaultFraming, framingSchema, type FramingSettings } from './framingSettings';
import { planSheetGeometry, type Point, type Segment } from './planSheetGeometry';
import { drawingLength, drawingElevation } from './drawingFormat';
import { sheetDrawingScale as drawingScale, n, text, rect, line, bubble, dimH, dimV, short, titleBlock, sheetStart, viewTitle, multiLeader, detailRef, detailTitles, sheetRef, breakLine, textWidth, type XY } from './sheetGraphics';
import { heading, table, numbered, noteStack, type Style } from './noteBlocks';
import { sheetOrdinalToken, detailNumberToken, sheetNumberToken, bearingBoltsTitle } from './sheetGraphics';
import { activeEndBearing, continuousBearings } from '../engine/endBearingInputs';
import { runwayElevations, girderMarks } from '../engine/drawingData';
import { connectionTopic } from './connectionSheet';
import { coverSheetSvg } from './coverSheet';
import { endStopTopic } from './endStopSheet';
import { activeEndStop, stopEnds } from '../engine/endStopInputs';
import { adjacentBays } from '../engine/continuation';
import { endStopGeometry } from '../engine/endStop';
export { planSheetGeometry } from './planSheetGeometry';
export { connectionSheetSvg } from './connectionSheet';

/**
 * General arrangement at content scale 1: isometric (top left), runway plan (top right), girder
 * elevation over the typical runway section (bottom left) and the girder schedule with the sheet notes
 * (bottom right).
 */
const ga=1,gaLayout={iso:{x:70,y:60,w:980,h:600},plan:{x:1800,y:350},split:{x:1120,y:770,bottomX:1700},elevation:{x:830,top:800},section:{x:60,w:1420,bottom:1492},schedule:{x:1724,y:794,width:776,height:520}} as const;
export const typicalSectionTitle='TYPICAL RUNWAY SECTION';
/** Grid bubble on the general arrangement: 0.3 in circle, 5/32 in text. */
const gridBubble=(x:number,y:number,label:string)=>bubble(x,y,label,11);
function fit(segments: Segment[], project: (p: Point) => XY, box: {x:number;y:number;w:number;h:number}, units:CalculationSnapshot['input']['units']) {
  const bounds = segments.flat().map(project).reduce((b, [x, y]) => [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], y), Math.max(b[3], y)], [Infinity, -Infinity, Infinity, -Infinity]);
  const [xmin, xmax, ymin, ymax] = bounds, chosen=drawingScale(Math.min(box.w / Math.max(.01, xmax - xmin), box.h / Math.max(.01, ymax - ymin))/1000,units,ga),scale=chosen.pointsPerMm*1000;
  return {label:chosen.label,project:(p: Point): XY => { const [x, y] = project(p); return [box.x + box.w / 2 + (x - (xmin + xmax) / 2) * scale, box.y + box.h / 2 + (y - (ymin + ymax) / 2) * scale]; }};
}
function paths(segments: Segment[], project: (p: Point) => XY, cls: string) {
  const seen = new Set<string>();
  const path = segments.map(segment => segment.map(project).sort((a,b)=>a[0]-b[0]||a[1]-b[1])).filter(([a, b]) => {
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < .15) return false;
    const key = [a, b].map(p => p.map(v => v.toFixed(2)).join(',')).join('|');
    if (seen.has(key)) return false; seen.add(key); return true;
  }).map(([a, b]) => `M${n(a[0])},${n(a[1])}L${n(b[0])},${n(b[1])}`).join('');
  return `<path class="${cls}" d="${path}"/>`;
}

/**
 * Typical section across the building at mid-bay, looking back at the frame on a grid: both runways
 * with their girders and rails cut, the columns and brackets beyond. Only the runway band is drawn,
 * the columns broken above the rail and below the bracket, since the building heights are reference
 * geometry; the elevations given are those of the project. A wide crane span is shortened by a break.
 */
function typicalSection(s:CalculationSnapshot,m:ReturnType<typeof planSheetGeometry>,top:number,o:{newColumns:boolean;columnName:string}){
  const p=s.input,d=p.details,dim=(meters:number)=>drawingLength(meters*1000,p.units),elevations=runwayElevations(p),box=gaLayout.section;
  const railTop=m.railBase+(p.aist?.railDepth??p.railHeight)/1000,seat=-m.d/2-(d?.bearing.thickness??0)/1000;
  const vTop=railTop+.3,vBottom=-m.d/2-m.bracketDepth-.3;
  const uA=-m.columnOffset,uB=m.width+m.columnOffset,uRA=-m.railZ,uRB=m.width+m.railZ;
  // The crane span is shortened by a break between the runways, so the runways draw at a larger scale;
  // its dimensions keep their true values.
  const keep=2.8,gap=.9,span=uRB-uRA-2*keep>1.5?{from:uRA+keep,to:uRB-keep}:undefined,shift=span?span.to-span.from-gap:0;
  // Looking toward -x, grid A is at the left: u = -z.
  const clip=(segments:Segment[])=>segments.flatMap(([a,b]):Segment[]=>{
    let [p0,p1]:XY[]=[[-a[2],a[1]],[-b[2],b[1]]];if(p0[1]>p1[1])[p0,p1]=[p1,p0];
    if(p1[1]<vBottom||p0[1]>vTop)return [];
    const at=(v:number):Point=>{const t=(v-p0[1])/(p1[1]-p0[1]);return [p0[0]+(p1[0]-p0[0])*t,v,0];};
    const band:Segment=[p0[1]<vBottom?at(vBottom):[p0[0],p0[1],0],p1[1]>vTop?at(vTop):[p1[0],p1[1],0]];
    if(!span)return [band];
    const [l,r]=band[0][0]<=band[1][0]?band:[band[1],band[0]],across=(u:number):Point=>{const t=(u-l[0])/(r[0]-l[0]);return [u,l[1]+(r[1]-l[1])*t,0];};
    return [...(l[0]<span.from?[[l,r[0]>span.from?across(span.from):r] as Segment]:[]),...(r[0]>span.to?[[l[0]<span.to?across(span.to):l,r] as Segment]:[])];});
  // The cut girders hide whatever lies behind them on the grid.
  const half=Math.max(m.bf,p.section.kind==='cap'?p.section.capWidth/1000:0)/2+.002;
  const hidden=([a,b]:Segment)=>[0,m.width].some(u0=>[a,b].every(([u,v])=>Math.abs(u-u0)<=half&&v>=-m.d/2-.002&&v<=m.railBase+.002));
  const sec=m.section,beyond={building:clip(sec.beyond.building).filter(v=>!hidden(v)),runway:clip(sec.beyond.runway).filter(v=>!hidden(v))};
  const cut={building:clip(sec.cut.building),runway:clip(sec.cut.runway),rail:clip(sec.cut.rail)};
  const all=[...beyond.building,...beyond.runway,...cut.building,...cut.runway,...cut.rail].flat();
  const uMin=Math.min(...all.map(v=>v[0])),uMax=Math.max(...all.map(v=>v[0]));
  const height=box.bottom-top-150,scale=drawingScale(Math.min(box.w/(uMax-uMin-shift),height/(vTop-vBottom))/1000,p.units,ga),k=scale.pointsPerMm*1000;
  const U=(u:number)=>span&&u>=span.to-1e-9?u-shift:u;
  const SX=(u:number)=>box.x+box.w/2+(U(u)-(uMin+uMax-shift)/2)*k,SY=(v:number)=>top+40+(vTop-v)*k,project=([u,v]:Point):XY=>[SX(u),SY(v)];
  // Across the break a dimension line carries a break symbol and its label sits over the break.
  const xb=span?(SX(span.from)+SX(span.to))/2:0;
  const spanDim=(x1:number,x2:number,fromY:number,y:number,label:string)=>!span?dimH(x1,x2,fromY,y,label):
    line([x1,fromY],[x1,y+5])+line([x2,fromY],[x2,y+5])+line([x1,y],[xb-5,y])+breakLine([xb-5,y],[xb+5,y])+line([xb+5,y],[x2,y])
    +[x1,x2].map(x=>line([x-2.5,y+3],[x+2.5,y-3])).join('')+text(xb,y-9,label,9,'middle');
  let svg=`<g data-view="typical-section">`+paths(beyond.building,project,'reference-line')+paths(beyond.runway,project,'runway-line')
    +paths(cut.building,project,'reference-line')+paths(cut.runway,project,'runway-line')+paths(cut.rail,project,'rail-line');
  // Paired break lines where the crane span is shortened, and where the columns leave the band.
  if(span)for(const dx of [-3,3])svg+=breakLine([xb+dx,SY(vTop)],[xb+dx,SY(vBottom)]);
  for(const v of [vTop,vBottom]){
    const us=all.filter(q=>Math.abs(q[1]-v)<1e-6).map(q=>q[0]).sort((a,b)=>a-b),groups:number[][]=[];
    for(const u of us){const g=groups.at(-1);if(g&&u-g[g.length-1]<.8)g.push(u);else groups.push([u]);}
    for(const g of groups)svg+=breakLine([SX(g[0])-6,SY(v)],[SX(g[g.length-1])+6,SY(v)]);
  }
  const below=SY(vBottom);
  for(const [u,label] of [[uA,'A'],[uB,'B']] as const)svg+=line([SX(u),SY(vTop)-34],[SX(u),below+38],'grid-line')+gridBubble(SX(u),below+50,label);
  // Rail centrelines to the crane span and the column grids above the band.
  const dimY=SY(vTop)-18,from=SY(railTop)-4;
  for(const u of [uRA,uRB])svg+=line([SX(u),SY(railTop)+3],[SX(u),from],'grid-line');
  svg+=dimH(SX(uA),SX(uRA),from,dimY,dim(uRA-uA),'left')+spanDim(SX(uRA),SX(uRB),from,dimY,`${dim(uRB-uRA)} CRANE SPAN (RAIL C/L TO C/L)`)+dimH(SX(uRB),SX(uB),from,dimY,dim(uB-uRB),'right');
  svg+=spanDim(SX(uA),SX(uB),below+4,below+24,`${dim(uB-uA)} GRIDS A-B${o.newColumns?'':' (REF.)'}`);
  // Elevations of the project, stacked so close levels never overlap.
  const ex=SX(uMax)+14;
  const target=(y:number,labelY:number,label:string,datum:string)=>`<g data-elevation-datum="${datum}">${line([ex+2,y],[ex+12,y])}<path class="leader-arrow" d="M${n(ex+12)},${n(y)}l-2.4,-2.4h4.8z"/>${line([ex+12,y],[ex+16,labelY])}${line([ex+16,labelY],[ex+20,labelY])}${text(ex+22,labelY+3,label,8.5)}</g>`;
  const yTor=SY(railTop),yTos=SY(m.d/2),ySeat=SY(seat),el=(v:number|undefined,name:string)=>v===undefined?`${name} EL. NOT ENTERED`:`${name} EL. ${drawingElevation(v,p.units)}`;
  svg+=target(yTor,Math.min(yTor,yTos-11),el(elevations?.tor,'T.O.R.'),'top-of-rail')+target(yTos,Math.max(yTos,yTor+11),el(elevations?.tos,'T.O.S.'),'top-of-steel');
  svg+=target(ySeat,ySeat,el(elevations?.seat,'BRG. SEAT'),'bearing-seat');
  // Callouts at runway A, between the runways; runway B is opposite hand.
  const lx=SX(uRA)+70,headW=(d?.rail.headWidth??65)/1000;
  svg+=multiLeader([[SX(uRA+headW/2),SY(railTop-.01)]],[lx,SY(railTop)-2],[`CRANE RAIL${d?`, SEE ${detailRef(detailTitles.railKeeper)}`:''}`]);
  svg+=multiLeader([[SX(m.bf/2),SY(m.d/4)]],[lx,SY(m.d/4)+3],[`${p.section.name} RUNWAY GIRDER`,'SEE RUNWAY GIRDER SCHEDULE']);
  svg+=multiLeader([[SX(0),SY(seat-Math.min(.05,m.bracketDepth/3))]],[lx,SY(seat)+16],d?[`BEARING AND BRACKET, SEE ${detailRef(detailTitles.bearing)}`]:['BRACKET BY BUILDING DESIGNER (REF.)']);
  svg+=multiLeader([[SX(uA+m.column.d/2),SY(vBottom+.2)]],[lx,SY(vBottom+.2)+3],o.newColumns?[`NEW ${o.columnName} COLUMN, SEE ${detailRef(detailTitles.newColumn)}`]:['EXISTING BUILDING COLUMN (REF.), FIELD VERIFY']);
  svg+=text(SX(uRB)-70,SY(vBottom+.2)+3,'RUNWAY AT GRID B OPPOSITE HAND',8.5,'end');
  svg+=viewTitle(box.x+box.w/2,below+92,typicalSectionTitle,scale.label,ga)+'</g>';
  return svg;
}

export function planSheetSvg(s: CalculationSnapshot, settings: FramingSettings = defaultFraming): string {
  const p=s.input,f=framingSchema.parse(settings),m=planSheetGeometry(p,f),dim=(meters:number)=>drawingLength(meters*1000,p.units);
  const rows=[m.columnOffset,-m.width-m.columnOffset],floor=m.floor,datum=p.drawing?.datumElevation??0;
  const elevations=runwayElevations(p),datumLabel=p.drawing?.datumLabel??'Reference floor',capDetailed=p.section.kind==='cap'&&!!p.capDesign&&!!p.details;
  // New freestanding columns designed here are new work, drawn solid and detailed on S-08.
  const newColumns=!!(p.existingColumn?.enabled&&p.existingColumn.isNew&&p.columnBase?.enabled),columnName=p.existingColumn?.shape||'BUILT-UP';
  // Rail and stop geometry in mm from each runway end when girder-mounted stops are designed.
  const stop=activeEndStop(p),stopGeom=stop?endStopGeometry(p,stop):undefined,railEnd=stopGeom?.railEnd??0;
  // Ends with stops stop the rail short; an end continued by an existing bay runs on with dashed existing steel.
  const ends=stopEnds(p),stopIdx=ends.map(e=>e==='left'?0:1),railInset=(end:'left'|'right')=>ends.includes(end)?railEnd/1000:0;
  const adjacent=adjacentBays(p),stub=24;
  const gridSegments:Segment[]=[...m.supports.map(x=>[[x,floor,rows[1]-.9],[x,floor,rows[0]+.9]] as Segment),...rows.map(z=>[[-m.length/2-2.4,floor,z],[m.length/2+.9,floor,z]] as Segment)];
  const isoFit=fit([...m.referenceLines,...m.runwayLines,...gridSegments],([x,y,z])=>[(x-z)*Math.sqrt(3)/2,(x+z)/2-y],gaLayout.iso,p.units),iso=isoFit.project;
  let svg=sheetStart(s,'S-01','CRANE RUNWAY / GENERAL ARRANGEMENT',ga);
  const g=gaLayout.split;
  svg+=line([g.x,20],[g.x,g.y],'divider')+line([20,g.y],[2500,g.y],'divider')+line([g.bottomX,g.y],[g.bottomX,1492],'divider');
  svg+=`<g data-view="isometric">`;
  svg+=paths(gridSegments,iso,'grid-line')+paths(m.referenceLines,iso,'reference-line')+paths(m.runwayLines,iso,'runway-line');
  // Bubbles sit beyond the ends of their grid lines, clear of the line and the framing.
  const beyond=(end:Point,from:Point,label:string)=>{const a=iso(end),b=iso(from),L=Math.hypot(a[0]-b[0],a[1]-b[1])||1;return gridBubble(a[0]+(a[0]-b[0])/L*16,a[1]+(a[1]-b[1])/L*16,label);};
  m.supports.forEach((x,i)=>{svg+=beyond([x,floor,rows[0]+.9],[x,floor,rows[0]],String(i+1));});
  rows.forEach((z,i)=>{svg+=beyond([-m.length/2-2.4,floor,z],[0,floor,z],i?'B':'A');});
  const marks=girderMarks(p),mid=(g:typeof marks[number])=>(g.start+g.end)/2000-m.length/2;
  svg+=viewTitle(gaLayout.iso.x+gaLayout.iso.w/2,gaLayout.iso.y+gaLayout.iso.h+44,'ISOMETRIC VIEW','NOT TO SCALE',ga)+'</g>';

  const planScale=drawingScale(Math.min(1060/(m.length+m.column.bf),500/(m.width+2*m.columnOffset+m.column.d))/1000,p.units,ga),k=planScale.pointsPerMm*1000;
  const X=(x:number)=>gaLayout.plan.x+x*k,Y=(z:number)=>gaLayout.plan.y+(z+m.width/2)*k;
  const left=X(-m.length/2),right=X(m.length/2);
  svg+=`<g data-view="plan">`;
  m.supports.forEach((x,i)=>{
    svg+=line([X(x),Y(rows[1])-20],[X(x),Y(rows[0])+17],'grid-line')+gridBubble(X(x),Y(rows[1])-32,String(i+1));
    for(const [side,z] of rows.entries()){
      svg+=rect(X(x-m.column.bf/2),Y(z-m.column.d/2),m.column.bf*k,m.column.d*k,newColumns?'runway-line':'reference-line');
      const rail=side?-m.width:0,wb=p.details?.bracket;
      if(wb?.enabled){const face=rail+(side?-1:1)*wb.reach/1000,tip=face+(side?1:-1)*wb.seatProjection/1000;svg+=rect(X(x-wb.seatLength/2000),Y(Math.min(face,tip)),wb.seatLength/1000*k,wb.seatProjection/1000*k,'runway-line');}else svg+=rect(X(x-.15),Y(Math.min(z,rail)),.3*k,Math.abs(z-rail)*k,'reference-line');
    }
  });
  rows.forEach((z,i)=>{svg+=line([left-18,Y(z)],[right+12,Y(z)],'grid-line')+gridBubble(left-30,Y(z),i?'B':'A');});
  for(const [side,z] of [0,-m.width].entries()){
    for(const member of m.members)svg+=rect(X(member.start/1000-m.length/2),Y(z-m.bf/2),(member.end-member.start)/1000*k,m.bf*k,'runway-line');
    const rz=z+(side?-m.railZ:m.railZ),head=(p.details?.rail.headWidth??65)/1000;
    svg+=rect(left+railInset('left')*k,Y(rz-head/2),(m.length-railInset('left')-railInset('right'))*k,head*k,'rail-line');
    for(const b of adjacent){
     const x0=b.end==='left'?left-stub:right,x1=b.end==='left'?left:right+stub,far=b.end==='left'?x0:x1;
     svg+=`<g data-existing-bay="${b.end}">${line([x0,Y(z-m.bf/2)],[x1,Y(z-m.bf/2)],'reference-line')}${line([x0,Y(z+m.bf/2)],[x1,Y(z+m.bf/2)],'reference-line')}${line([x0,Y(rz)],[x1,Y(rz)],'reference-line')}${breakLine([far,Y(z-m.bf/2)-5],[far,Y(z+m.bf/2)+5])}</g>`;
    }
    // Girder-mounted end stops at the true runway ends.
    if(stop)for(const end of stopIdx){const x0=end?right-stopGeom!.front/1000*k:left+stopGeom!.back/1000*k;svg+=`<g data-end-stop="plan">${rect(x0,Y(z-stop.base.width/2000),stop.base.length/1000*k,stop.base.width/1000*k,'runway-line')}</g>`;}
    // Labels sit inboard of each runway, clear of the grid line outboard.
    const [markY,nameY]=side?[Y(z)+15,Y(z)+24]:[Y(z)-19,Y(z)-10];
    for(const g of marks)svg+=`<g data-girder-mark="${g.mark}">${text(X(mid(g)),markY,g.mark,8.5,'middle',700)}${text(X(mid(g)),nameY,p.section.name,7.2,'middle')}</g>`;

  }
  // Labels sit on the inboard side of their target so a leader never crosses its own text.
  const inboard=(end:'left'|'right',labels:string[],dx:number)=>{const w=Math.max(...labels.map(v=>textWidth(v.toUpperCase(),7.5)));return end==='left'?left+dx:right-dx-w;};
  if(newColumns){const labels=[`NEW ${columnName} COLUMN ON`,`SPREAD FOOTING, TYP. ${2*m.supports.length}`,`SEE ${detailRef('NEW RUNWAY COLUMN / ELEVATION')}`],x0=X(m.supports[1]??m.supports[0]),w=Math.max(...labels.map(v=>textWidth(v,7.5)));svg+=`<g data-new-column="plan">${multiLeader([[x0+m.column.bf/2*k,Y(rows[0]-m.column.d/2)]],[x0+m.column.bf/2*k+16,Y(-m.width/2)-8],labels,7.5,[],w)}</g>`;}
  if(stop){const first=ends[0],labels=[`END STOP, TYP. ${2*ends.length}`,`SEE ${detailRef('END STOP / ELEVATION')}`];svg+=multiLeader([[first==='left'?left+stopGeom!.front/1000*k:right-stopGeom!.front/1000*k,Y(-m.bf/2)]],[inboard(first,['END STOP, TYP. 4','SEE 1/S-07'],70),Y(-m.width/2)+4],labels,7.5);}
  for(const b of adjacent){const labels=['EXISTING RUNWAY CONTINUES',`ADJ. BAY ${dim(b.length/1000)}, FIELD VERIFY`];svg+=`<g data-existing-bay-label="${b.end}">${multiLeader([[b.end==='left'?left-stub/2:right+stub/2,Y(-m.bf/2)]],[inboard(b.end,labels,16),Y(-m.width/2)+26],labels,7.5)}</g>`;}
  // Section cut at mid-bay, both ends outside the grids, arrows looking back at the frame on the grid.
  {const xc=X(m.section.at),label=detailRef(typicalSectionTitle);
   for(const [y0,y1] of [[Y(rows[1])-8,Y(rows[1])-24],[Y(rows[0])+8,Y(rows[0])+24]]){
    svg+=`<g data-section-cut="${typicalSectionTitle}">${line([xc,y0],[xc,y1],'divider')}${line([xc,y1],[xc-14,y1],'divider')}<path class="leader-arrow" d="M${n(xc-16)},${n(y1)}l5,-2.2v4.4z"/>${text(xc+4,y1+(y1<y0?-3:9),label,8,'start',700)}</g>`;
   }}
  const planDim=Y(rows[0])+52;
  svg+=dimH(left,right,Y(rows[0])+19,planDim,`${dim(m.length)} OVERALL`);
  svg+=dimV(Y(rows[1]),Y(rows[0]),right+13,right+48,`${dim(rows[0]-rows[1])} GRIDS A-B (REF.)`);
  svg+=text(X(0),planDim+20,`RAIL C/L SPACING (CRANE SPAN): ${dim(m.width+2*m.railZ)}${p.details?'':' (REF.)'}`,9,'middle');
  svg+=viewTitle(X(0),planDim+56,'RUNWAY PLAN',planScale.label,ga)+'</g>';

  const elevationScale=drawingScale(Math.min(1440/m.length,110/(m.d+(p.aist?.railDepth??p.railHeight)/1000))/1000,p.units,ga),ek=elevationScale.pointsPerMm*1000;
  // The elevation hangs from the top of its panel; its highest annotation is 81 above the girder.
  const elevationY=gaLayout.elevation.top+81+m.d/2*ek;
  const EX=(x:number)=>gaLayout.elevation.x+x*ek,EY=(y:number)=>elevationY-y*ek;
  const top=EY(m.d/2),bottom=EY(-m.d/2),el=EX(-m.length/2),er=EX(m.length/2);
  svg+=`<g data-view="elevation">`;
  const bubbleY=top-44;
  svg+=text(el,bubbleY-30,`${p.system==='continuous'?'CONTINUOUS MEMBER':'SIMPLY SUPPORTED BAYS'} / CONNECTIONS: ${sheetRef('connection')}${p.system==='simple'&&p.details?` / SHARED SUPPORT: ${detailRef(detailTitles.supportEnd(p.spans.length>1))}`:''}`,9);
  m.supports.forEach((x,i)=>{
    svg+=rect(EX(x-m.column.bf/2),top-10,m.column.bf*ek,bottom-top+39,newColumns?'runway-line':'reference-line');
    const wb=p.details?.bracket;
    if(wb?.enabled){const sy=bottom+(p.details!.bearing.thickness/1000)*ek;svg+=rect(EX(x-wb.seatLength/2000),sy,wb.seatLength/1000*ek,wb.seatThickness/1000*ek,'runway-line');if(usesExistingBracket(p)){const e=existingBracket(p),y=sy+wb.seatThickness/1000*ek;for(const off of [0,e.depth-e.flangeThickness])svg+=rect(EX(x-e.width/2000),y+off/1000*ek,e.width/1000*ek,e.flangeThickness/1000*ek,'reference-line');svg+=rect(EX(x-e.webThickness/2000),y+e.flangeThickness/1000*ek,e.webThickness/1000*ek,(e.depth-2*e.flangeThickness)/1000*ek,'reference-line');}else for(const side of [-1,1])svg+=rect(EX(x+(side*wb.ribSpacing-wb.ribThickness)/2000),sy+wb.seatThickness/1000*ek,wb.ribThickness/1000*ek,wb.ribDepth/1000*ek,'runway-line');}else svg+=rect(EX(x-.35),bottom,.7*ek,Math.max(4,m.bracketDepth*ek),'reference-line');
    svg+=line([EX(x),bubbleY+12],[EX(x),bottom+33],'grid-line')+gridBubble(EX(x),bubbleY,String(i+1));
    if(i)svg+=dimH(EX(m.supports[i-1]),EX(x),bottom+34,bottom+54,dim(p.spans[i-1]/1000));
  });
  for(const member of m.members){
    const ml=EX(member.start/1000-m.length/2),mr=EX(member.end/1000-m.length/2);
    svg+=rect(ml,top,mr-ml,m.d*ek,'runway-line');
    svg+=line([ml,top+m.tf*ek],[mr,top+m.tf*ek],'runway-line')+line([ml,bottom-m.tf*ek],[mr,bottom-m.tf*ek],'runway-line');
    if(p.section.kind==='cap')svg+=rect(ml,EY(m.railBase),mr-ml,p.section.capTw/1000*ek,'runway-line');
  }
  const railDepth=(p.aist?.railDepth??p.railHeight)/1000;
  svg+=rect(el+railInset('left')*ek,EY(m.railBase+railDepth),(m.length-railInset('left')-railInset('right'))*ek,railDepth*ek,'rail-line');
  for(const b of adjacent){
   const x0=b.end==='left'?el-stub:er,x1=b.end==='left'?el:er+stub,far=b.end==='left'?x0:x1;
   const lx=b.end==='left'?x0-3:x1+3,anchor=b.end==='left'?'end':'start';
   svg+=`<g data-existing-bay="${b.end}">${[top,bottom,EY(m.railBase+railDepth)].map(y=>line([x0,y],[x1,y],'reference-line')).join('')}${breakLine([far,EY(m.railBase+railDepth)-4],[far,bottom+4])}${text(lx,bottom+9,'EXIST.',6.5,anchor)}${text(lx,bottom+16,`${dim(b.length/1000)} BAY`,6.5,anchor)}</g>`;
  }
  if(stop){const sh=(stop.base.thickness+stop.face.height)/1000;for(const end of stopIdx){const face=end?er-(stopGeom!.faceFront/1000)*ek:el+(stopGeom!.faceBack/1000)*ek;svg+=`<g data-end-stop="elevation">${rect(face,EY(m.railBase+sh),stop.face.thickness/1000*ek,(sh-stop.base.thickness/1000)*ek,'runway-line')}${rect(end?er-stopGeom!.front/1000*ek:el+stopGeom!.back/1000*ek,EY(m.railBase+stop.base.thickness/1000),stop.base.length/1000*ek,stop.base.thickness/1000*ek,'runway-line')}</g>`;}
   // A short label inboard of the stop and above the bay marks.
   // The elbow stays clear of the grid bubble; the second line clears the bay mark below it.
   // Short lines keep the label inside the first bay, clear of the next grid bubble.
   const first=ends[0]==='left',labels=['END STOP',...(ends.length===2?['BOTH ENDS']:[]),`SEE ${detailRef('END STOP / ELEVATION')}`],w=Math.max(textWidth('END STOP',7.5),textWidth('BOTH ENDS',7.5),textWidth('SEE 1/S-07',7.5)),tx=first?el+stopGeom!.back/1000*ek:er-stopGeom!.back/1000*ek;
   svg+=multiLeader([[tx,EY(m.railBase+sh/2)]],[first?tx+30:tx-30-w,top-25-11*(labels.length-1)],labels,7.5);}
  for(const g of marks)svg+=text(EX(mid(g)),top-14,g.mark,9,'middle',700)+text(EX(mid(g)),bottom+17,p.section.name,9,'middle',700);
  const railTop=EY(m.railBase+railDepth);
  // Elevation targets: the T.O.R. label rises and the T.O.S. label drops so close elevations never overlap.
  const ex=er+(adjacent.some(b=>b.end==='right')?stub+4:0);
  const target=(y:number,labelY:number,label:string,datum:string)=>`<g data-elevation-datum="${datum}">${line([ex+2,y],[ex+12,y])}<path class="leader-arrow" d="M${n(ex+12)},${n(y)}l-2.4,-2.4h4.8z"/>${line([ex+12,y],[ex+16,labelY])}${line([ex+16,labelY],[ex+20,labelY])}${text(ex+22,labelY+3,label,8.5)}</g>`;
  const torY=Math.min(railTop,top-9),tosY=Math.max(top,railTop+9);
  svg+=target(top,tosY,elevations?`T.O.S. EL. ${drawingElevation(elevations.tos,p.units)}`:'T.O.S. EL. NOT ENTERED','top-of-steel');
  svg+=target(railTop,torY,elevations?`T.O.R. EL. ${drawingElevation(elevations.tor,p.units)}`:'T.O.R. EL. NOT ENTERED','top-of-rail');
  svg+=dimH(el,er,bottom+62,bottom+82,`${dim(m.length)} OVERALL`);
  svg+=text(el,bottom+108,`DATUM EL. ${drawingElevation(datum,p.units)} = ${short(datumLabel.toUpperCase(),60)}. T.O.S. = TOP OF W STEEL${p.section.kind==='cap'?`; CAP ABOVE T.O.S.${capDetailed?` / SEE ${detailRef(detailTitles.capSection)}`:''}`:''}. ELEVATIONS FROM ${elevations?{'new column base':'THE NEW COLUMN BASE','surveyed column seat':'THE SURVEYED COLUMN SEAT','entered top of rail':'THE SPECIFIED TOP OF RAIL'}[elevations.source]:'PROJECT DATA (NOT ENTERED)'}.`,8.5);
  svg+=viewTitle(gaLayout.elevation.x,bottom+150,'RUNWAY GIRDER ELEVATION - GRID A',elevationScale.label,ga)+'</g>';
  svg+=typicalSection(s,m,bottom+180,{newColumns,columnName});

  svg+=`<g data-view="girder-schedule">`+girderSchedule(s,gaLayout.schedule)+'</g>';
  return svg+titleBlock(s,'S-01','GENERAL ARRANGEMENT')+'</svg>';
}

/** Girder schedule and sheet notes; the general notes are on S-00. */
function girderSchedule(s:CalculationSnapshot,box:{x:number;y:number;width:number;height:number}){
  const p=s.input,u=p.units,len=(mm:number)=>drawingLength(mm,u),marks=girderMarks(p),d=p.details,camber=p.aist?.camber??0;
  const newColumns=!!(p.existingColumn?.enabled&&p.existingColumn.isNew&&p.columnBase?.enabled),columnName=p.existingColumn?.shape||'BUILT-UP';
  const grid=(station:number)=>String(p.spans.reduce((acc,_,i)=>{const at=p.spans.slice(0,i+1).reduce((a,b)=>a+b,0);return Math.abs(at-station)<1?i+2:acc;},station<1?1:0)||'-');
  const ends=!d?`SEE ${sheetRef('connection')}`:p.system==='continuous'?activeEndBearing(p)?`BOLTED AT EACH SUPPORT; GRID ${continuousBearings(p).find(v=>v.role==='LOCATING')?.grid} LOCATES, OTHERS SLIDE; SEE ${detailRef(bearingBoltsTitle(p))}`:`BEARS ON EACH SUPPORT; SEE ${detailRef(detailTitles.bearing)}`:`LEFT END LOCATES, RIGHT END SLIDES; SEE ${detailRef(detailTitles.movement)}`;
  const rows=[...new Set(marks.map(g=>g.mark))].map(mark=>{const all=marks.filter(g=>g.mark===mark),g=all[0];
    return [mark,String(all.length*2),`${p.section.name}${p.section.kind==='cap'&&p.capDesign&&d?` (CAP: SEE ${detailRef(detailTitles.capSection)})`:''}`,len(g.length),all.map(v=>`${grid(v.leftGrid)}-${grid(v.rightGrid)}`).join(', '),camber>0?len(camber):'NONE; NATURAL UP',ends];});
  const notes=[
    'SEE S-00 FOR GENERAL NOTES, DESIGN CRITERIA, MATERIALS, SPECIAL INSPECTIONS AND SUPPORT REACTIONS.',
    newColumns?`NEW ${columnName} RUNWAY COLUMNS ON SPREAD FOOTINGS AT EVERY GRID OF BOTH RUNWAYS, SEE ${detailRef(detailTitles.newColumn)}. THE EXISTING BUILDING FRAMING IS NOT SHOWN AND CARRIES NO CRANE LOAD; FIELD VERIFY GRID DIMENSIONS AND CLEARANCE TO EXISTING FRAMING, SLABS AND UTILITIES BEFORE LAYOUT.`:'GRIDS, COLUMNS AND BUILDING FRAMING ARE EXISTING OR BY OTHERS AND ARE SHOWN DASHED FOR REFERENCE. FIELD VERIFY GRID DIMENSIONS AND COLUMN LOCATIONS BEFORE FABRICATION.',
    'GRID B RUNWAY IS IDENTICAL AND OPPOSITE HAND TO GRID A U.N.O. QUANTITIES IN THE SCHEDULE ARE FOR BOTH RUNWAYS.',
    `ERECT GIRDERS WITH ANY NATURAL MILL CAMBER UP${camber>0?`; INDUCED CAMBER AS SCHEDULED`:''}.`,
    `SET RAIL C/L SPACING (CRANE SPAN) TO ${d?len(d.criteria.railGauge):'THE CRANE MANUFACTURER\'S GAUGE'}, EACH RAIL ON ITS GIRDER WEB C/L${d?` WITHIN ${len(d.criteria.alignmentTolerance)}`:''}. THE DESIGN ALLOWS A RAIL-TO-WEB ECCENTRICITY OF ${len(Math.abs(p.railEccentricity))}; IT IS NOT A SETTING DIMENSION.`,
    p.system==='simple'&&d?`GIRDER LENGTHS ARE OUT-TO-OUT OF STEEL WITH THE END GAP AT EACH SHARED SUPPORT; SEE ${detailRef(detailTitles.supportEnd(p.spans.length>1))}.`:p.system==='simple'?'GIRDER LENGTHS ARE OUT-TO-OUT OF STEEL WITH THE END GAP AT EACH SHARED SUPPORT.':'GIRDER LENGTH IS OUT-TO-OUT OF STEEL; FIELD SPLICES ARE NOT PERMITTED WITHOUT ENGINEER APPROVAL.',
    ...adjacentBays(p).map(b=>`AT GRID ${b.end==='left'?1:p.spans.length+1} THE EXISTING RUNWAY CONTINUES (${short((p.continuation?.source??'').toUpperCase(),70)}). THE EXISTING ${len(b.length)} GIRDER BEARS ON THE SAME SUPPORT AND STAYS IN PLACE; ITS REACTION IS INCLUDED IN THE SUPPORT DESIGN. FIELD VERIFY ITS SPAN, BEARING, TIE AND RAIL JOINT BEFORE FABRICATION.`)
  ];
  return noteStack([(t:Style)=>[heading(t,'RUNWAY GIRDER SCHEDULE'),table(t,['MARK','QTY','SECTION','LENGTH','GRIDS','CAMBER','ENDS'],rows,[.55,.45,1.6,.8,.75,.65,1.9]),heading(t,'SHEET NOTES'),...numbered(t,notes)]],u,box,[1.5,1.4,1.3,1.2,1.1]);
}

export interface DrawingSheet {number:string;name:string;title:string;svg:string;}
export function drawingSheetSet(s:CalculationSnapshot,f:FramingSettings=defaultFraming):DrawingSheet[]{
  return resolveSheetSet(sheetPlan(s,f).map(sheet=>({number:sheet.number,name:sheet.name,title:sheet.title,svg:sheet.render()})));
}
/** Sheet numbers and titles of the set without drawing it. */
export function sheetIndex(s:CalculationSnapshot,f:FramingSettings=defaultFraming){return sheetPlan(s,f).map(({number,name,title})=>({number,name,title}));}
/** Details of the general arrangement, in drawing order. */
const arrangementDetails=['ISOMETRIC VIEW','RUNWAY PLAN','RUNWAY GIRDER ELEVATION - GRID A',typicalSectionTitle] as const;
/**
 * Fill each title block's "N OF M", number the details on each sheet in
 * drawing order, then resolve detail references by title to "n/S-xx".
 */
export function resolveSheetSet(sheets:DrawingSheet[]):DrawingSheet[]{
  const details=new Map<string,string>(),topics=new Map<string,string>();
  for(const sheet of sheets)for(const [,key] of sheet.svg.matchAll(/<g data-topic="([^"]*)"\/>/g))if(!topics.has(unescape(key)))topics.set(unescape(key),sheet.number);
  const numbered=sheets.map((sheet,i)=>{
    let k=0,svg=sheet.svg.replace(sheetOrdinalToken,`${i+1} OF ${sheets.length}`);
    svg=svg.replace(/<g data-view-title="below" data-detail-title="([^"]*)">([\s\S]*?)<\/g>/g,(all,title:string)=>{k++;const key=unescape(title);if(!details.has(key))details.set(key,`${k}/${sheet.number}`);return all.replace(detailNumberToken,String(k)).replace(sheetNumberToken,sheet.number);});
    return {...sheet,svg};
  });
  return numbered.map(sheet=>({...sheet,svg:sheet.svg.replace(/\{\{REF:([^}]*)\}\}/g,(_,token:string)=>{const title=decodeURIComponent(token);return details.get(title)??`${title} (NOT IN SET)`;})
    .replace(/\{\{SHEET:([^}]*)\}\}/g,(_,token:string)=>{const key=decodeURIComponent(token);return topics.get(key)??`${key.toUpperCase()} (NOT IN SET)`;})}));
}
/** Detail references of an assembled set by detail title, e.g. "GIRDER BEARING / COLUMN BRACKET" to "1/S-02". */
export function detailReferences(sheets:DrawingSheet[]){
  const refs=new Map<string,string>();
  for(const sheet of sheets)for(const [,title,number] of sheet.svg.matchAll(/<g data-view-title="below" data-detail-title="([^"]*)">(?:(?!<\/g>)[\s\S])*?font-weight="700">(\d+)<\/text>/g))if(!refs.has(unescape(title)))refs.set(unescape(title),`${number}/${sheet.number}`);
  return refs;
}
const unescape=(v:string)=>v.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
/**
 * The groups of details that apply, in set order: connections, cap channel, independent supports,
 * column brackets, direct flange ties, end stops and new columns. Details are drawn on demand.
 */
export function detailTopics(s:CalculationSnapshot,f:FramingSettings=defaultFraming):DetailTopic[]{
  const p=s.input,d=p.details,ties=d?.brace.flangeAttachment?.enabled?flangeTieTopic(s):undefined,bracket=d?.bracket?.enabled?bracketTopic(s):undefined,supports=simpleSupportTopic(s,f);
  return [connectionTopic(s,f,!ties),
    ...(p.section.kind==='cap'&&p.capDesign&&d?[capTopic(s)]:[]),
    ...(supports?[supports]:[]),...(bracket?[bracket]:[]),...(ties?[ties]:[]),
    ...(d&&activeEndStop(p)?[endStopTopic(s)]:[]),
    ...(d&&p.existingColumn?.enabled&&p.existingColumn.isNew&&p.columnBase?.enabled?[newColumnTopic(s)]:[])];
}
/** The issued set: cover S-00 with general notes, criteria and sheet index, S-01, then detail sheets from S-02. */
function sheetPlan(s:CalculationSnapshot,f:FramingSettings){
  const p=s.input;
  // A reference-only arrangement is not an issued package, so it has no cover sheet.
  if(connectionOptionChecks(p).length)return [{number:'S-02',name:'reference-connection-arrangements-arch-d',title:'CONNECTION ARRANGEMENTS / REFERENCE ONLY',render:()=>connectionConceptSheetSvg(s)}];
  const details=packDetailSheets(detailTopics(s,f),p.units).map((layout,i)=>{
    const number=`S-${String(i+2).padStart(2,'0')}`,title=detailSheetTitle(layout);
    return {number,name:`runway-${layout.topics.map(t=>t.key).join('-')}-sheet-arch-d`,title,details:layout.placed.map(v=>v.view.title),render:()=>detailSheetSvg(s,number,title,layout)};
  });
  const sheets=[{number:'S-01',name:'runway-plan-sheet-arch-d',title:'GENERAL ARRANGEMENT',details:arrangementDetails,render:()=>planSheetSvg(s,f)},...details];
  return [{number:'S-00',name:'cover-general-notes-sheet-arch-d',title:'COVER, GENERAL NOTES & DESIGN CRITERIA',render:()=>coverSheetSvg(s,sheets)},...sheets];
}
/**
 * Sheet numbers ("S-xx") of the groups of details in the set by key (see detailTopics), for references
 * outside the set such as the calculation report; a group not in the set reads "the drawings".
 */
export function detailSheetNumbers(s:CalculationSnapshot,f:FramingSettings=defaultFraming){
  const sheets=new Map<string,string>();
  if(!connectionOptionChecks(s.input).length)packDetailSheets(detailTopics(s,f),s.input.units).forEach((l,i)=>{for(const t of l.topics)sheets.set(t.key,`S-${String(i+2).padStart(2,'0')}`);});
  return (topic:string)=>sheets.get(topic)??'the drawings';
}
export function appendPlanSheet(html:string,s:CalculationSnapshot,f:FramingSettings=defaultFraming){
  const css='<style>@page runwayArrangement{size:36in 24in;margin:0}.runway-plan-sheet-page{page:runwayArrangement;break-before:page;break-after:auto;width:36in;height:24in;margin:0;padding:0;line-height:0}.runway-plan-sheet-page svg{display:block;width:36in;height:24in}</style>';
  return html.replace('</head>',`${css}</head>`).replace('</body>',drawingSheetSet(s,f).map(sheet=>`<section class="runway-plan-sheet-page">${sheet.svg}</section>`).join('')+'</body>');
}
