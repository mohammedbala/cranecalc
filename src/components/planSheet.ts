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
import { drawingLength } from './drawingFormat';
import { sheetDrawingScale as drawingScale, n, text, rect, line, bubble, dimH, dimV, short, titleBlock, sheetStart, viewTitle, multiLeader, detailRef, detailTitles, sheetRef, breakLine, textWidth, type XY } from './sheetGraphics';
import { heading, table, numbered, noteStack, type Style } from './noteBlocks';
import { sheetOrdinalToken, detailNumberToken, sheetNumberToken } from './sheetGraphics';
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
 * elevation (bottom left) and the girder schedule with the sheet notes (bottom right).
 */
const ga=1,gaLayout={iso:{x:70,y:60,w:980,h:600},plan:{x:1800,y:350},split:{x:1120,y:770,bottomX:1700},elevation:{x:830,y:1110},schedule:{x:1724,y:794,width:776,height:520}} as const;
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
  if(stop){const first=ends[0],labels=[`END STOP, TYP. ${2*ends.length}`,`SEE ${detailRef('END STOP / ELEVATION')}`];svg+=multiLeader([[first==='left'?left+stopGeom!.front/1000*k:right-stopGeom!.front/1000*k,Y(-m.bf/2)]],[inboard(first,['END STOP, TYP. 4','SEE 1/S-07'],16),Y(-m.width/2)+4],labels,7.5);}
  for(const b of adjacent){const labels=['EXISTING RUNWAY CONTINUES',`ADJ. BAY ${dim(b.length/1000)}, FIELD VERIFY`];svg+=`<g data-existing-bay-label="${b.end}">${multiLeader([[b.end==='left'?left-stub/2:right+stub/2,Y(-m.bf/2)]],[inboard(b.end,labels,16),Y(-m.width/2)+26],labels,7.5)}</g>`;}
  const planDim=Y(rows[0])+52;
  svg+=dimH(left,right,Y(rows[0])+19,planDim,`${dim(m.length)} OVERALL`);
  svg+=dimV(Y(rows[1]),Y(rows[0]),right+13,right+48,`${dim(rows[0]-rows[1])} GRIDS A-B (REF.)`);
  svg+=text(X(0),planDim+20,`RAIL C/L SPACING (CRANE SPAN): ${dim(m.width+2*m.railZ)}${p.details?'':' (REF.)'}`,9,'middle');
  svg+=viewTitle(X(0),planDim+56,'RUNWAY PLAN',planScale.label,ga)+'</g>';

  const elevationScale=drawingScale(Math.min(1440/m.length,110/(m.d+(p.aist?.railDepth??p.railHeight)/1000))/1000,p.units,ga),ek=elevationScale.pointsPerMm*1000;
  const EX=(x:number)=>gaLayout.elevation.x+x*ek,EY=(y:number)=>gaLayout.elevation.y-y*ek;
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
  svg+=target(top,tosY,elevations?`T.O.S. EL. ${drawingLength(elevations.tos,p.units)}`:'T.O.S. EL. NOT ENTERED','top-of-steel');
  svg+=target(railTop,torY,elevations?`T.O.R. EL. ${drawingLength(elevations.tor,p.units)}`:'T.O.R. EL. NOT ENTERED','top-of-rail');
  svg+=dimH(el,er,bottom+62,bottom+82,`${dim(m.length)} OVERALL`);
  svg+=text(el,bottom+108,`DATUM EL. ${drawingLength(datum,p.units)} = ${short(datumLabel.toUpperCase(),60)}. T.O.S. = TOP OF W STEEL${p.section.kind==='cap'?`; CAP ABOVE T.O.S.${capDetailed?` / SEE ${detailRef(detailTitles.capSection)}`:''}`:''}. ELEVATIONS FROM ${elevations?elevations.source.toUpperCase():'PROJECT DATA (NOT ENTERED)'}.`,8.5);
  svg+=viewTitle(gaLayout.elevation.x,bottom+150,'RUNWAY GIRDER ELEVATION - GRID A',elevationScale.label,ga)+'</g>';

  svg+=`<g data-view="girder-schedule">`+girderSchedule(s,gaLayout.schedule)+'</g>';
  return svg+titleBlock(s,'S-01','GENERAL ARRANGEMENT')+'</svg>';
}

/** Girder schedule and sheet notes; the general notes are on S-00. */
function girderSchedule(s:CalculationSnapshot,box:{x:number;y:number;width:number;height:number}){
  const p=s.input,u=p.units,len=(mm:number)=>drawingLength(mm,u),marks=girderMarks(p),d=p.details,camber=p.aist?.camber??0;
  const newColumns=!!(p.existingColumn?.enabled&&p.existingColumn.isNew&&p.columnBase?.enabled),columnName=p.existingColumn?.shape||'BUILT-UP';
  const grid=(station:number)=>String(p.spans.reduce((acc,_,i)=>{const at=p.spans.slice(0,i+1).reduce((a,b)=>a+b,0);return Math.abs(at-station)<1?i+2:acc;},station<1?1:0)||'-');
  const ends=!d?`SEE ${sheetRef('connection')}`:p.system==='continuous'?`BEARS ON EACH SUPPORT; SEE ${detailRef(detailTitles.bearing)}`:`LEFT END LOCATES, RIGHT END SLIDES; SEE ${detailRef(detailTitles.movement)}`;
  const rows=[...new Set(marks.map(g=>g.mark))].map(mark=>{const all=marks.filter(g=>g.mark===mark),g=all[0];
    return [mark,String(all.length*2),`${p.section.name}${p.section.kind==='cap'&&p.capDesign&&d?` (CAP: SEE ${detailRef(detailTitles.capSection)})`:''}`,len(g.length),all.map(v=>`${grid(v.leftGrid)}-${grid(v.rightGrid)}`).join(', '),camber>0?len(camber):'NONE',ends];});
  const notes=[
    'SEE S-00 FOR GENERAL NOTES, DESIGN CRITERIA, MATERIALS, SPECIAL INSPECTIONS AND SUPPORT REACTIONS.',
    newColumns?`NEW ${columnName} RUNWAY COLUMNS ON SPREAD FOOTINGS AT EVERY GRID OF BOTH RUNWAYS, SEE ${detailRef(detailTitles.newColumn)}. THE EXISTING BUILDING FRAMING IS NOT SHOWN AND CARRIES NO CRANE LOAD; FIELD VERIFY GRID DIMENSIONS AND CLEARANCE TO EXISTING FRAMING, SLABS AND UTILITIES BEFORE LAYOUT.`:'GRIDS, COLUMNS AND BUILDING FRAMING ARE EXISTING OR BY OTHERS AND ARE SHOWN DASHED FOR REFERENCE. FIELD VERIFY GRID DIMENSIONS AND COLUMN LOCATIONS BEFORE FABRICATION.',
    'GRID B RUNWAY IS IDENTICAL AND OPPOSITE HAND TO GRID A U.N.O. QUANTITIES IN THE SCHEDULE ARE FOR BOTH RUNWAYS.',
    `SET RAIL C/L SPACING (CRANE SPAN) TO ${d?len(d.criteria.railGauge):'THE CRANE MANUFACTURER\'S GAUGE'}; RAIL C/L IS ${len(Math.abs(p.railEccentricity))} FROM THE GIRDER WEB C/L${p.railEccentricity?p.railEccentricity>0?', OUTBOARD TOWARD THE SUPPORTING COLUMNS':', INBOARD TOWARD THE CRANE':''}.`,
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
const arrangementDetails=['ISOMETRIC VIEW','RUNWAY PLAN','RUNWAY GIRDER ELEVATION - GRID A'] as const;
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
