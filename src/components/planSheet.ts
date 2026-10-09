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
import { sheetDrawingScale as drawingScale, n, text, rect, line, bubble, dimH, dimV, leader, short, titleBlock, sheetStart, wrappedText, viewTitle, type XY } from './sheetGraphics';
import { structuralGeneralNotes } from './structuralNotes';
import { connectionSheetSvg } from './connectionSheet';
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
  const tos=datum+(m.d/2-floor)*1000,datumLabel=p.drawing?.datumLabel??'Reference floor';
  const gridSegments:Segment[]=[...m.supports.map(x=>[[x,floor,rows[1]-.9],[x,floor,rows[0]+.9]] as Segment),...rows.map(z=>[[-m.length/2-2.4,floor,z],[m.length/2+.9,floor,z]] as Segment)];
  const isoFit=fit([...m.referenceLines,...m.runwayLines,...gridSegments],([x,y,z])=>[(x-z)*Math.sqrt(3)/2,(x+z)/2-y],{x:52,y:110,w:628,h:263},p.units),iso=isoFit.project;
  let svg=sheetStart(s,'S-01','CRANE RUNWAY / GENERAL ARRANGEMENT');
  svg+=line([718,76],[718,680],'divider')+line([24,418],[1200,418],'divider');
  svg+=`<g data-view="isometric">`;
  svg+=paths(gridSegments,iso,'grid-line')+paths(m.referenceLines,iso,'reference-line')+paths(m.runwayLines,iso,'runway-line');
  m.supports.forEach((x,i)=>{const a=iso([x,floor,rows[0]+.9]);svg+=bubble(a[0],a[1],String(i+1));});
  rows.forEach((z,i)=>{const a=iso([-m.length/2-2.4,floor,z]);svg+=bubble(a[0],a[1],i?'B':'A');});
  const memberSpans=p.system==='continuous'?[m.length]:p.spans.map(v=>v/1000);
  svg+=viewTitle(371,391,'ISOMETRIC VIEW',isoFit.label)+'</g>';

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
    svg+=rect(left,Y(rz-head/2),m.length*k,head*k,'rail-line');
    let x=-m.length/2;
    memberSpans.forEach((l)=>{if(!side)svg+=text(X(x+l/2),Y(z)-10,p.section.name,7.6,'middle',700);x+=l;});
    if(side)svg+=text(X(0),Y(z)-12,'RUNWAY (REF.)',8,'middle',700);

  }
  svg+=dimH(left,right,Y(rows[0])+19,363,`${dim(m.length)} OVERALL`);
  svg+=dimV(Y(rows[1]),Y(rows[0]),right+13,1159,`${dim(rows[0]-rows[1])} GRIDS A-B (REF.)`);
  svg+=text(939,377,`RAIL C/L SPACING: ${dim(m.width+2*m.railZ)} (REF.)`,8,'middle');
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
  svg+=rect(el,EY(m.railBase+railDepth),m.length*ek,railDepth*ek,'rail-line');
  let x=-m.length/2;
  memberSpans.forEach((l,i)=>{svg+=text(EX(x+l/2),bottom+17,p.section.name,9,'middle',700);x+=l;});
  svg+=`<g data-elevation-datum="top-of-steel">${line([er,top],[er+13,top])}${text(er+17,top+3,`T.O.S. EL. ${drawingLength(tos,p.units)}`,8.5)}</g>`;
  svg+=dimH(el,er,612,629,`${dim(m.length)} OVERALL`);
  svg+=text(40,640,`DATUM EL. ${drawingLength(datum,p.units)} = ${short(datumLabel,70)}. T.O.S. = top of W steel${p.section.kind==='cap'?'; CAP ABOVE T.O.S. / SEE S-03':''}.`,8.5);
  svg+=viewTitle(371,654,'RUNWAY GIRDER ELEVATION - GRID A',elevationScale.label)+'</g>';

  svg+=`<g data-view="structural-general-notes">${text(959,442,'STRUCTURAL GENERAL NOTES',12,'middle',700)}`;
  let ny=460;
  structuralGeneralNotes(s).forEach((note,i)=>{
    const wrapped=wrappedText(735,ny,`${i+1}. ${note}`,102,7.5,9.4);
    svg+=wrapped.svg;ny+=wrapped.height+4;
  });
  svg+='</g>';
  return svg+titleBlock(s,'S-01','GENERAL ARRANGEMENT')+'</svg>';
}

export function drawingSheetSet(s:CalculationSnapshot,f:FramingSettings=defaultFraming){
  if(connectionOptionChecks(s.input).length)return [{number:'S-02',name:'reference-connection-arrangements-arch-d',svg:connectionConceptSheetSvg(s)}];
  return [{number:'S-01',name:'runway-plan-sheet-arch-d',svg:planSheetSvg(s,f)},{number:'S-02',name:'runway-connections-sheet-arch-d',svg:connectionSheetSvg(s,f)},...(s.input.section.kind==='cap'&&s.input.capDesign&&s.input.details?[{number:'S-03',name:'runway-cap-attachment-sheet-arch-d',svg:capSheetSvg(s)}]:[]),...(s.input.system==='simple'&&s.input.details?[{number:'S-04',name:'runway-independent-supports-sheet-arch-d',svg:simpleSupportSheetSvg(s,f)}]:[]),...(s.input.details?.bracket?.enabled?[{number:'S-05',name:usesExistingBracket(s.input)?'runway-existing-brackets-sheet-arch-d':'runway-welded-brackets-sheet-arch-d',svg:bracketSheetSvg(s)}]:[]),...(s.input.details?.brace.flangeAttachment?.enabled?[{number:'S-06',name:'runway-flange-ties-sheet-arch-d',svg:flangeTieSheetSvg(s)}]:[])];
}
export function appendPlanSheet(html:string,s:CalculationSnapshot,f:FramingSettings=defaultFraming){
  const css='<style>@page runwayArrangement{size:36in 24in;margin:0}.runway-plan-sheet-page{page:runwayArrangement;break-before:page;break-after:auto;width:36in;height:24in;margin:0;padding:0;line-height:0}.runway-plan-sheet-page svg{display:block;width:36in;height:24in}</style>';
  return html.replace('</head>',`${css}</head>`).replace('</body>',drawingSheetSet(s,f).map(sheet=>`<section class="runway-plan-sheet-page">${sheet.svg}</section>`).join('')+'</body>');
}
