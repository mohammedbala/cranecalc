import {flangeTieSheetSvg} from './flangeTieSheet';
import {connectionOptionChecks} from '../engine/connectionOptions';
import {connectionConceptSheetSvg} from './connectionConceptSheet';
import {bracketSheetSvg} from './bracketSheet';
import {usesExistingBracket,existingBracket} from '../engine/existingBracket';
import {simpleSupportSheetSvg} from './simpleSupportSheet';
import {capSheetSvg} from './capSheet';
import type { CalculationSnapshot } from '../engine/types';
import { defaultFraming, framingSchema, type FramingSettings } from './framingSettings';
import { planSheetGeometry, type Point, type Segment } from './planSheetGeometry';
import { drawingLength } from './drawingFormat';
import { sheetDrawingScale as drawingScale, n, text, rect, line, bubble, dimH, dimV, leader, short, titleBlock, sheetStart, wrappedText, viewTitle, multiLeader, detailRef, type XY } from './sheetGraphics';
import { heading, table, numbered, noteStack, type Style } from './noteBlocks';
import { sheetOrdinalToken, detailNumberToken, sheetNumberToken } from './sheetGraphics';
import { runwayElevations, girderMarks } from '../engine/drawingData';
import { connectionSheetSvg } from './connectionSheet';
import { coverSheetSvg } from './coverSheet';
import { endStopSheetSvg } from './endStopSheet';
import { activeEndStop } from '../engine/endStopInputs';
import { endStopGeometry } from '../engine/endStop';
export { planSheetGeometry } from './planSheetGeometry';
export { connectionSheetSvg } from './connectionSheet';

function fit(segments: Segment[], project: (p: Point) => XY, box: {x:number;y:number;w:number;h:number}, units:CalculationSnapshot['input']['units']) {
  const bounds = segments.flat().map(project).reduce((b, [x, y]) => [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], y), Math.max(b[3], y)], [Infinity, -Infinity, Infinity, -Infinity]);
  const [xmin, xmax, ymin, ymax] = bounds, chosen=drawingScale(Math.min(box.w / Math.max(.01, xmax - xmin), box.h / Math.max(.01, ymax - ymin))/1000,units),scale=chosen.pointsPerMm*1000;
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
  const elevations=runwayElevations(p),datumLabel=p.drawing?.datumLabel??'Reference floor';
  // Rail and stop geometry in mm from each runway end when girder-mounted stops are designed.
  const stop=activeEndStop(p),stopGeom=stop?endStopGeometry(p,stop):undefined,railEnd=stopGeom?.railEnd??0;
  const gridSegments:Segment[]=[...m.supports.map(x=>[[x,floor,rows[1]-.9],[x,floor,rows[0]+.9]] as Segment),...rows.map(z=>[[-m.length/2-2.4,floor,z],[m.length/2+.9,floor,z]] as Segment)];
  const isoFit=fit([...m.referenceLines,...m.runwayLines,...gridSegments],([x,y,z])=>[(x-z)*Math.sqrt(3)/2,(x+z)/2-y],{x:52,y:110,w:628,h:263},p.units),iso=isoFit.project;
  let svg=sheetStart(s,'S-01','CRANE RUNWAY / GENERAL ARRANGEMENT');
  svg+=line([718,76],[718,680],'divider')+line([24,418],[1200,418],'divider');
  svg+=`<g data-view="isometric">`;
  svg+=paths(gridSegments,iso,'grid-line')+paths(m.referenceLines,iso,'reference-line')+paths(m.runwayLines,iso,'runway-line');
  m.supports.forEach((x,i)=>{const a=iso([x,floor,rows[0]+.9]);svg+=bubble(a[0],a[1],String(i+1));});
  rows.forEach((z,i)=>{const a=iso([-m.length/2-2.4,floor,z]);svg+=bubble(a[0],a[1],i?'B':'A');});
  const marks=girderMarks(p),mid=(g:typeof marks[number])=>(g.start+g.end)/2000-m.length/2;
  svg+=viewTitle(371,391,'ISOMETRIC VIEW','NOT TO SCALE')+'</g>';

  const planScale=drawingScale(Math.min(343/(m.length+m.column.bf),230/(m.width+2*m.columnOffset+m.column.d))/1000,p.units),k=planScale.pointsPerMm*1000;
  const X=(x:number)=>939+x*k,Y=(z:number)=>230+(z+m.width/2)*k;
  const left=X(-m.length/2),right=X(m.length/2);
  svg+=`<g data-view="plan">`;
  m.supports.forEach((x,i)=>{
    svg+=line([X(x),Y(rows[1])-20],[X(x),Y(rows[0])+17],'grid-line')+bubble(X(x),Y(rows[1])-29,String(i+1));
    for(const [side,z] of rows.entries()){
      svg+=rect(X(x-m.column.bf/2),Y(z-m.column.d/2),m.column.bf*k,m.column.d*k,'reference-line');
      const rail=side?-m.width:0,wb=p.details?.bracket;
      if(wb?.enabled){const face=rail+(side?-1:1)*wb.reach/1000,tip=face+(side?1:-1)*wb.seatProjection/1000;svg+=rect(X(x-wb.seatLength/2000),Y(Math.min(face,tip)),wb.seatLength/1000*k,wb.seatProjection/1000*k,'runway-line');}else svg+=rect(X(x-.15),Y(Math.min(z,rail)),.3*k,Math.abs(z-rail)*k,'reference-line');
    }
  });
  rows.forEach((z,i)=>{svg+=line([left-18,Y(z)],[right+12,Y(z)],'grid-line')+bubble(left-29,Y(z),i?'B':'A');});
  for(const [side,z] of [0,-m.width].entries()){
    for(const member of m.members)svg+=rect(X(member.start/1000-m.length/2),Y(z-m.bf/2),(member.end-member.start)/1000*k,m.bf*k,'runway-line');
    const rz=z+(side?-m.railZ:m.railZ),head=(p.details?.rail.headWidth??65)/1000;
    svg+=rect(left+railEnd/1000*k,Y(rz-head/2),(m.length-2*railEnd/1000)*k,head*k,'rail-line');
    // Girder-mounted end stops at both runway ends.
    if(stop)for(const end of [0,1]){const x0=end?right-stopGeom!.front/1000*k:left+stopGeom!.back/1000*k;svg+=`<g data-end-stop="plan">${rect(x0,Y(z-stop.base.width/2000),stop.base.length/1000*k,stop.base.width/1000*k,'runway-line')}</g>`;}
    // Labels sit inboard of each runway, clear of the grid line outboard.
    const [markY,nameY]=side?[Y(z)+15,Y(z)+24]:[Y(z)-19,Y(z)-10];
    for(const g of marks)svg+=`<g data-girder-mark="${g.mark}">${text(X(mid(g)),markY,g.mark,8.5,'middle',700)}${text(X(mid(g)),nameY,p.section.name,7.2,'middle')}</g>`;

  }
  if(stop)svg+=multiLeader([[left+stopGeom!.front/1000*k,Y(-m.bf/2)]],[left+16,Y(-m.width/2)+4],['END STOP, TYP. 4',`SEE ${detailRef('END STOP / ELEVATION')}`],7.5);
  svg+=dimH(left,right,Y(rows[0])+19,363,`${dim(m.length)} OVERALL`);
  svg+=dimV(Y(rows[1]),Y(rows[0]),right+13,1159,`${dim(rows[0]-rows[1])} GRIDS A-B (REF.)`);
  svg+=text(939,377,`RAIL C/L SPACING (CRANE SPAN): ${dim(m.width+2*m.railZ)}${p.details?'':' (REF.)'}`,8,'middle');
  svg+=viewTitle(959,393,'RUNWAY PLAN',planScale.label)+'</g>';

  const elevationScale=drawingScale(Math.min(440/m.length,55/(m.d+(p.aist?.railDepth??p.railHeight)/1000))/1000,p.units),ek=elevationScale.pointsPerMm*1000;
  const EX=(x:number)=>290+x*ek,EY=(y:number)=>531-y*ek;
  const top=EY(m.d/2),bottom=EY(-m.d/2),el=EX(-m.length/2),er=EX(m.length/2);
  svg+=`<g data-view="elevation">`;
  svg+=text(40,441,`${p.system==='continuous'?'CONTINUOUS MEMBER':'SIMPLY SUPPORTED BAYS'} / CONNECTIONS: S-02${p.system==='simple'&&p.details?' / SHARED SUPPORT: S-04':''}`,9);
  m.supports.forEach((x,i)=>{
    svg+=rect(EX(x-m.column.bf/2),top-10,m.column.bf*ek,bottom-top+39,'reference-line');
    const wb=p.details?.bracket;
    if(wb?.enabled){const sy=bottom+(p.details!.bearing.thickness/1000)*ek;svg+=rect(EX(x-wb.seatLength/2000),sy,wb.seatLength/1000*ek,wb.seatThickness/1000*ek,'runway-line');if(usesExistingBracket(p)){const e=existingBracket(p),y=sy+wb.seatThickness/1000*ek;for(const off of [0,e.depth-e.flangeThickness])svg+=rect(EX(x-e.width/2000),y+off/1000*ek,e.width/1000*ek,e.flangeThickness/1000*ek,'reference-line');svg+=rect(EX(x-e.webThickness/2000),y+e.flangeThickness/1000*ek,e.webThickness/1000*ek,(e.depth-2*e.flangeThickness)/1000*ek,'reference-line');}else for(const side of [-1,1])svg+=rect(EX(x+(side*wb.ribSpacing-wb.ribThickness)/2000),sy+wb.seatThickness/1000*ek,wb.ribThickness/1000*ek,wb.ribDepth/1000*ek,'runway-line');}else svg+=rect(EX(x-.35),bottom,.7*ek,Math.max(4,m.bracketDepth*ek),'reference-line');
    svg+=line([EX(x),478],[EX(x),bottom+33],'grid-line')+bubble(EX(x),476,String(i+1));
    if(i)svg+=dimH(EX(m.supports[i-1]),EX(x),bottom+34,604,dim(p.spans[i-1]/1000));
  });
  for(const member of m.members){
    const ml=EX(member.start/1000-m.length/2),mr=EX(member.end/1000-m.length/2);
    svg+=rect(ml,top,mr-ml,m.d*ek,'runway-line');
    svg+=line([ml,top+m.tf*ek],[mr,top+m.tf*ek],'runway-line')+line([ml,bottom-m.tf*ek],[mr,bottom-m.tf*ek],'runway-line');
    if(p.section.kind==='cap')svg+=rect(ml,EY(m.railBase),mr-ml,p.section.capTw/1000*ek,'runway-line');
  }
  const railDepth=(p.aist?.railDepth??p.railHeight)/1000;
  svg+=rect(el+railEnd/1000*ek,EY(m.railBase+railDepth),(m.length-2*railEnd/1000)*ek,railDepth*ek,'rail-line');
  if(stop){const sh=(stop.base.thickness+stop.face.height)/1000;for(const end of [0,1]){const face=end?er-(stopGeom!.faceFront/1000)*ek:el+(stopGeom!.faceBack/1000)*ek;svg+=`<g data-end-stop="elevation">${rect(face,EY(m.railBase+sh),stop.face.thickness/1000*ek,(sh-stop.base.thickness/1000)*ek,'runway-line')}${rect(end?er-stopGeom!.front/1000*ek:el+stopGeom!.back/1000*ek,EY(m.railBase+stop.base.thickness/1000),stop.base.length/1000*ek,stop.base.thickness/1000*ek,'runway-line')}</g>`;}
   svg+=multiLeader([[el+stopGeom!.back/1000*ek,EY(m.railBase+sh/2)]],[34,EY(m.railBase)-14],['END STOP, BOTH ENDS',`SEE ${detailRef('END STOP / ELEVATION')}`],7.5);}
  for(const g of marks)svg+=text(EX(mid(g)),top-14,g.mark,9,'middle',700)+text(EX(mid(g)),bottom+17,p.section.name,9,'middle',700);
  const railTop=EY(m.railBase+railDepth);
  // Elevation targets: the T.O.R. label rises and the T.O.S. label drops so close elevations never overlap.
  const target=(y:number,labelY:number,label:string,datum:string)=>`<g data-elevation-datum="${datum}">${line([er+2,y],[er+12,y])}<path class="leader-arrow" d="M${n(er+12)},${n(y)}l-2.4,-2.4h4.8z"/>${line([er+12,y],[er+16,labelY])}${line([er+16,labelY],[er+20,labelY])}${text(er+22,labelY+3,label,8.5)}</g>`;
  const torY=Math.min(railTop,top-9),tosY=Math.max(top,railTop+9);
  svg+=target(top,tosY,elevations?`T.O.S. EL. ${drawingLength(elevations.tos,p.units)}`:'T.O.S. EL. NOT ENTERED','top-of-steel');
  svg+=target(railTop,torY,elevations?`T.O.R. EL. ${drawingLength(elevations.tor,p.units)}`:'T.O.R. EL. NOT ENTERED','top-of-rail');
  svg+=dimH(el,er,612,629,`${dim(m.length)} OVERALL`);
  svg+=text(40,640,`DATUM EL. ${drawingLength(datum,p.units)} = ${short(datumLabel.toUpperCase(),60)}. T.O.S. = TOP OF W STEEL${p.section.kind==='cap'?'; CAP ABOVE T.O.S. / SEE S-03':''}. ELEVATIONS FROM ${elevations?elevations.source.toUpperCase():'PROJECT DATA (NOT ENTERED)'}.`,8.5);
  svg+=viewTitle(371,658,'RUNWAY GIRDER ELEVATION - GRID A',elevationScale.label)+'</g>';

  svg+=`<g data-view="girder-schedule">`+girderSchedule(s,735,432,455,232)+'</g>';
  return svg+titleBlock(s,'S-01','GENERAL ARRANGEMENT')+'</svg>';
}

/** Girder schedule and sheet notes; the general notes are on S-00. */
function girderSchedule(s:CalculationSnapshot,x:number,y:number,width:number,height:number){
  const p=s.input,u=p.units,len=(mm:number)=>drawingLength(mm,u),marks=girderMarks(p),d=p.details,camber=p.aist?.camber??0;
  const grid=(station:number)=>String(p.spans.reduce((acc,_,i)=>{const at=p.spans.slice(0,i+1).reduce((a,b)=>a+b,0);return Math.abs(at-station)<1?i+2:acc;},station<1?1:0)||'-');
  const ends=!d?'SEE S-02':p.system==='continuous'?'BEARS ON EACH SUPPORT; SEE S-02':'LEFT END LOCATES, RIGHT END SLIDES; SEE S-04';
  const rows=[...new Set(marks.map(g=>g.mark))].map(mark=>{const all=marks.filter(g=>g.mark===mark),g=all[0];
    return [mark,String(all.length*2),`${p.section.name}${p.section.kind==='cap'?' (CAP: SEE S-03)':''}`,len(g.length),all.map(v=>`${grid(v.leftGrid)}-${grid(v.rightGrid)}`).join(', '),camber>0?len(camber):'NONE',ends];});
  const notes=[
    'SEE S-00 FOR GENERAL NOTES, DESIGN CRITERIA, MATERIALS, SPECIAL INSPECTIONS AND SUPPORT REACTIONS.',
    'GRIDS, COLUMNS AND BUILDING FRAMING ARE EXISTING OR BY OTHERS AND ARE SHOWN DASHED FOR REFERENCE. FIELD VERIFY GRID DIMENSIONS AND COLUMN LOCATIONS BEFORE FABRICATION.',
    'GRID B RUNWAY IS IDENTICAL AND OPPOSITE HAND TO GRID A U.N.O. QUANTITIES IN THE SCHEDULE ARE FOR BOTH RUNWAYS.',
    `SET RAIL C/L SPACING (CRANE SPAN) TO ${d?len(d.criteria.railGauge):'THE CRANE MANUFACTURER\'S GAUGE'}; RAIL C/L IS ${len(Math.abs(p.railEccentricity))} FROM THE GIRDER WEB C/L${p.railEccentricity?p.railEccentricity>0?', OUTBOARD TOWARD THE SUPPORTING COLUMNS':', INBOARD TOWARD THE CRANE':''}.`,
    p.system==='simple'?'GIRDER LENGTHS ARE OUT-TO-OUT OF STEEL WITH THE END GAP AT EACH SHARED SUPPORT; SEE S-04.':'GIRDER LENGTH IS OUT-TO-OUT OF STEEL; FIELD SPLICES ARE NOT PERMITTED WITHOUT ENGINEER APPROVAL.'
  ];
  return noteStack([(t:Style)=>[heading(t,'RUNWAY GIRDER SCHEDULE'),table(t,['MARK','QTY','SECTION','LENGTH','GRIDS','CAMBER','ENDS'],rows,[.55,.45,1.6,.8,.75,.65,1.9]),heading(t,'SHEET NOTES'),...numbered(t,notes)]],u,{x,y,width,height});
}

export interface DrawingSheet {number:string;name:string;title:string;svg:string;}
export function drawingSheetSet(s:CalculationSnapshot,f:FramingSettings=defaultFraming):DrawingSheet[]{
  return resolveSheetSet(sheetPlan(s,f).map(sheet=>({number:sheet.number,name:sheet.name,title:sheet.title,svg:sheet.render()})));
}
/** Sheet numbers and titles of the set without drawing it. */
export function sheetIndex(s:CalculationSnapshot,f:FramingSettings=defaultFraming){return sheetPlan(s,f).map(({number,name,title})=>({number,name,title}));}
/**
 * Fill each title block's "N OF M", number the details on each sheet in
 * drawing order, then resolve detail references by title to "n/S-xx".
 */
export function resolveSheetSet(sheets:DrawingSheet[]):DrawingSheet[]{
  const details=new Map<string,string>();
  const numbered=sheets.map((sheet,i)=>{
    let k=0,svg=sheet.svg.replace(sheetOrdinalToken,`${i+1} OF ${sheets.length}`);
    svg=svg.replace(/<g data-view-title="below" data-detail-title="([^"]*)">([\s\S]*?)<\/g>/g,(all,title:string)=>{k++;const key=unescape(title);if(!details.has(key))details.set(key,`${k}/${sheet.number}`);return all.replace(detailNumberToken,String(k)).replace(sheetNumberToken,sheet.number);});
    return {...sheet,svg};
  });
  return numbered.map(sheet=>({...sheet,svg:sheet.svg.replace(/\{\{REF:([^}]*)\}\}/g,(_,title:string)=>details.get(unescape(title))??`${title} (NOT IN SET)`)}));
}
const unescape=(v:string)=>v.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
/** The issued set: cover S-00 with general notes, criteria and sheet index, then the details that apply. */
function sheetPlan(s:CalculationSnapshot,f:FramingSettings){
  const p=s.input,d=p.details;
  // A reference-only arrangement is not an issued package, so it has no cover sheet.
  if(connectionOptionChecks(p).length)return [{number:'S-02',name:'reference-connection-arrangements-arch-d',title:'CONNECTION ARRANGEMENTS / REFERENCE ONLY',render:()=>connectionConceptSheetSvg(s)}];
  const sheets=[
    {number:'S-01',name:'runway-plan-sheet-arch-d',title:'GENERAL ARRANGEMENT',render:()=>planSheetSvg(s,f)},
    {number:'S-02',name:'runway-connections-sheet-arch-d',title:'BRACKETS & CONNECTIONS',render:()=>connectionSheetSvg(s,f)},
    ...(p.section.kind==='cap'&&p.capDesign&&d?[{number:'S-03',name:'runway-cap-attachment-sheet-arch-d',title:'CAP CHANNEL & WELD DEVELOPMENT',render:()=>capSheetSvg(s)}]:[]),
    ...(p.system==='simple'&&d?[{number:'S-04',name:'runway-independent-supports-sheet-arch-d',title:'INDEPENDENT GIRDER SUPPORTS',render:()=>simpleSupportSheetSvg(s,f)}]:[]),
    ...(d?.bracket?.enabled?[{number:'S-05',name:usesExistingBracket(p)?'runway-existing-brackets-sheet-arch-d':'runway-welded-brackets-sheet-arch-d',title:usesExistingBracket(p)?'EXISTING BRACKETS / NEW BOLTED SEATS':'WELDED COLUMN BRACKETS',render:()=>bracketSheetSvg(s)}]:[]),
    ...(d?.brace.flangeAttachment?.enabled?[{number:'S-06',name:'runway-flange-ties-sheet-arch-d',title:'DIRECT FLANGE TIES',render:()=>flangeTieSheetSvg(s)}]:[]),
    ...(d&&activeEndStop(p)?[{number:'S-07',name:'runway-end-stops-sheet-arch-d',title:'RUNWAY END STOPS',render:()=>endStopSheetSvg(s)}]:[])];
  return [{number:'S-00',name:'cover-general-notes-sheet-arch-d',title:'COVER, GENERAL NOTES & DESIGN CRITERIA',render:()=>coverSheetSvg(s,sheets)},...sheets];
}
export function appendPlanSheet(html:string,s:CalculationSnapshot,f:FramingSettings=defaultFraming){
  const css='<style>@page runwayArrangement{size:36in 24in;margin:0}.runway-plan-sheet-page{page:runwayArrangement;break-before:page;break-after:auto;width:36in;height:24in;margin:0;padding:0;line-height:0}.runway-plan-sheet-page svg{display:block;width:36in;height:24in}</style>';
  return html.replace('</head>',`${css}</head>`).replace('</body>',drawingSheetSet(s,f).map(sheet=>`<section class="runway-plan-sheet-page">${sheet.svg}</section>`).join('')+'</body>');
}
