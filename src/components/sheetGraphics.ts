import type { CalculationSnapshot } from '../engine/types';
import { drawingScale } from './drawingFormat';
import { issueStatus, supportColumn } from '../engine/drawingData';
/** Replaced with the sheet ordinal and count once the whole set is assembled. */
export const sheetOrdinalToken='{{SHEET_ORDINAL}}';
/**
 * ARCH D in PDF points. Sheet bodies are laid out in layout units inside a content group scaled by the
 * sheet's content scale; the default of 1 prints layout units at 1/72 in, so 9-unit labels are 1/8 in.
 */
export const sheetFormat = { widthIn:36, heightIn:24, width:2592, height:1728, contentScale:1 } as const;
/** Drawing area of a sheet in layout units at content scale 1: inside the border, above the title band. */
export const sheetArea={x:0,y:0,width:2520,height:1512,seal:{x:2340,y:1332}} as const;
let detailRoom=1;
/**
 * Draw a detail with its scale budgets enlarged by `factor`, for a cell taller than the module: the
 * detail takes the next standard scale where its enlarged budget allows one.
 */
export function withDetailRoom<T>(factor:number,draw:()=>T):T{const was=detailRoom;detailRoom=factor;try{return draw();}finally{detailRoom=was;}}
/** Select and label the actual printed scale for a sheet drawn at the given content scale. */
export function sheetDrawingScale(maxLayoutUnitsPerMm:number,units:CalculationSnapshot['input']['units'],contentScale:number=sheetFormat.contentScale){
 const scale=drawingScale(maxLayoutUnitsPerMm*contentScale*detailRoom,units);
 return {...scale,pointsPerMm:scale.pointsPerMm/contentScale};
}
export type XY = [number, number];
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const n = (v: number) => Number(v.toFixed(3));
export const short = (s: string, limit: number) => s.length > limit ? `${s.slice(0, limit - 3)}...` : s;
export const line = (a: XY, b: XY, cls = 'annotation') => `<line class="${cls}" x1="${n(a[0])}" y1="${n(a[1])}" x2="${n(b[0])}" y2="${n(b[1])}"/>`;
export const text = (x: number, y: number, value: string, size = 9, anchor = 'start', weight = 400, angle = 0) =>
  `<text x="${n(x)}" y="${n(y)}" font-size="${size}" text-anchor="${anchor}" font-weight="${weight}"${angle ? ` transform="rotate(${n(angle)} ${n(x)} ${n(y)})"` : ''}>${esc(value)}</text>`;
export const rect = (x: number, y: number, w: number, h: number, cls = 'annotation') => `<rect class="${cls}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"/>`;
export const circle = (x: number, y: number, r: number, cls = 'annotation') => `<circle class="${cls}" cx="${n(x)}" cy="${n(y)}" r="${n(r)}"/>`;
/** Zig-zag break line between two points. */
export function breakLine(a:XY,b:XY){
 const mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2,dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy),ux=dx/L,uy=dy/L,px=-uy*4,py=ux*4;
 return `<polyline class="annotation" points="${[a,[mx-ux*3,my-uy*3],[mx-ux*1+px,my-uy*1+py],[mx+ux*1-px,my+uy*1-py],[mx+ux*3,my+uy*3],b].map(p=>`${n(p[0])},${n(p[1])}`).join(' ')}"/>`;
}
export function bubble(x: number, y: number, label: string, r = 8) { const size = r > 8 ? r : 9; return circle(x, y, r, 'bubble') + text(x, y + size * .36, label, size, 'middle', 700); }
export function leader(at: XY, end: XY, label: string, size = 9) {
  return line(at, [end[0] - 8, end[1] - 3]) + line([end[0] - 8, end[1] - 3], [end[0] + 6, end[1] - 3])
    + circle(at[0], at[1], 1.4, 'dot') + text(end[0] + 9, end[1], label, size);
}
// A dimension too short for its text carries the text beyond the far extension line on an extended
// dimension line, as drafted by hand, instead of writing it across the extension lines. `clear` is a
// neighbouring extension line the carried text is also kept beyond.
export function dimH(x1: number, x2: number, fromY: number, y: number, label: string, outside: 'left' | 'right' = 'right', clear?: number) {
  const w = textWidth(label, 9), fits = w + 6 <= Math.abs(x2 - x1), lo = Math.min(x1, x2), hi = Math.max(x1, x2);
  const l = Math.min(lo, clear ?? lo), r = Math.max(hi, clear ?? hi);
  const [a, b] = fits ? [lo, hi] : outside === 'right' ? [lo, r + w + 6] : [l - w - 6, hi];
  return line([x1, fromY], [x1, y + 5]) + line([x2, fromY], [x2, y + 5]) + line([a, y], [b, y])
    + [x1, x2].map(x => line([x - 2.5, y + 3], [x + 2.5, y - 3])).join('')
    + (fits ? text((x1 + x2) / 2, y - 5, label, 9, 'middle') : outside === 'right' ? text(r + 4, y - 5, label, 9, 'start') : text(l - 4, y - 5, label, 9, 'end'));
}
export function dimV(y1: number, y2: number, fromX: number, x: number, label: string) {
  const w = textWidth(label, 9), fits = w + 6 <= Math.abs(y2 - y1), far = Math.max(y1, y2);
  return line([fromX, y1], [x + 5, y1]) + line([fromX, y2], [x + 5, y2]) + line([x, Math.min(y1, y2)], [x, fits ? far : far + w + 6])
    + [y1, y2].map(y => line([x - 3, y + 2.5], [x + 3, y - 2.5])).join('')
    + text(x - 6, fits ? (y1 + y2) / 2 : far + 4 + w / 2, label, 9, 'middle', 400, -90);
}
// Arial advance widths per em, for laying out text without a browser.
const glyphWidths:Record<string,number>={' ':.278,'!':.278,'"':.355,'#':.556,'$':.556,'%':.889,'&':.667,"'":.191,'(':.333,')':.333,'*':.389,'+':.584,',':.278,'-':.333,'.':.278,'/':.278,':':.278,';':.278,'<':.584,'=':.584,'>':.584,'?':.556,'@':1.015,'[':.278,']':.278,'_':.556,'·':.278,'§':.556,'×':.584,'°':.4,
 A:.667,B:.667,C:.722,D:.722,E:.667,F:.611,G:.778,H:.722,I:.278,J:.5,K:.667,L:.556,M:.833,N:.722,O:.778,P:.667,Q:.778,R:.722,S:.667,T:.611,U:.722,V:.667,W:.944,X:.667,Y:.667,Z:.611,
 a:.556,b:.556,c:.5,d:.556,e:.556,f:.278,g:.556,h:.556,i:.222,j:.222,k:.5,l:.222,m:.833,n:.556,o:.556,p:.556,q:.556,r:.333,s:.5,t:.278,u:.556,v:.5,w:.722,x:.5,y:.5,z:.5};
/** Estimated rendered width of Arial text; bold is about 6% wider. */
export function textWidth(value:string,size:number,bold=false){let w=0;for(const c of resolvedLength(value))w+=glyphWidths[c]??(/[0-9]/.test(c)?.556:.6);return w*size*(bold?1.06:1);}
/** Break text into rows that fit the given width. */
export function wrapToWidth(value:string,width:number,size:number,bold=false){
  const rows:string[]=[];let row='';
  for(const word of value.split(/\s+/).filter(Boolean)){const next=row?`${row} ${word}`:word;if(row&&textWidth(next,size,bold)>width){rows.push(row);row=word;}else row=next;}
  if(row)rows.push(row);return rows.length?rows:[''];
}
export function wrappedText(x: number, y: number, value: string, maxChars: number, size = 9, leading = 12) {
  const rows: string[] = []; let row = '';
  for (const word of value.split(/\s+/)) { if (row && resolvedLength(row).length + resolvedLength(word).length + 1 > maxChars) { rows.push(row); row = ''; } row += `${row ? ' ' : ''}${word}`; }
  if (row) rows.push(row);
  return { svg: rows.map((r, i) => text(x, y + i * leading, r, size)).join(''), height: rows.length * leading };
}
/**
 * Printed line weights for content drawn at content scale 1 (layout units = points): object lines
 * 0.46 mm, rail 0.35 mm, hidden 0.25 mm in short black dashes, existing 0.2 mm screened in long dashes,
 * panel rules 0.25 mm, leaders and dimensions 0.18 mm, grids 0.16 mm. The title band keeps the base
 * weights.
 */
const detailLineWeights=`
  .runway-plan-sheet [data-sheet-content] .reference-line{stroke-width:.55;stroke-dasharray:10 3.6}
  .runway-plan-sheet [data-sheet-content] .runway-line{stroke-width:1.3;stroke-dasharray:none}
  .runway-plan-sheet [data-sheet-content] .rail-line{stroke-width:1;stroke-dasharray:none}
  .runway-plan-sheet [data-sheet-content] .hidden-line{stroke-width:.7;stroke-dasharray:3 2}
  .runway-plan-sheet [data-sheet-content] .annotation{stroke-width:.5}
  .runway-plan-sheet [data-sheet-content] .divider{stroke-width:.7}
  .runway-plan-sheet [data-sheet-content] .grid-line{stroke-width:.45;stroke-dasharray:14 3 2 3}
  .runway-plan-sheet [data-sheet-content] .bubble{stroke-width:.7}
  .runway-plan-sheet [data-sheet-content] .dot{stroke-width:.4}
  .runway-plan-sheet [data-sheet-content] .hatch,.runway-plan-sheet [data-sheet-content] .hatch-dot{stroke-width:.3}`;
/** Content transform: layout origin at the inner corner of the border, scaled by the content scale. */
const contentTransform=(k:number)=>k===2?'translate(72 36) scale(2)':`translate(36 36) scale(${k})`;
export function sheetStart(s: CalculationSnapshot, number: string, title: string, contentScale:number=sheetFormat.contentScale) {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="runway-plan-sheet" width="${s.input.units==='SI'?'914.4mm':'36in'}" height="${s.input.units==='SI'?'609.6mm':'24in'}" viewBox="0 0 2592 1728" role="img" aria-label="${esc(`${number} / ${title} / ${s.input.units==='SI'?'ARCH D 914.4 by 609.6 mm drawing':'ARCH D 36 by 24 inch drawing'}`)}"><style>
  .runway-plan-sheet{background:white;color:#111}
  .runway-plan-sheet text{font-family:Arial,sans-serif;fill:#111;stroke:none;letter-spacing:0}
  .runway-plan-sheet path,.runway-plan-sheet line,.runway-plan-sheet polyline,.runway-plan-sheet rect,.runway-plan-sheet circle{fill:none;stroke-linecap:butt;stroke-linejoin:round}
  .runway-plan-sheet .reference-line{stroke:#7b8186;stroke-width:.48;stroke-dasharray:3.6 2.4}
  .runway-plan-sheet .runway-line{stroke:#111;stroke-width:.8;stroke-dasharray:none}
  .runway-plan-sheet .rail-line{stroke:#111;stroke-width:.65;stroke-dasharray:none}
  .runway-plan-sheet .hidden-line{stroke:#111;stroke-width:.45;stroke-dasharray:2.4 1.6}
  .runway-plan-sheet .annotation{stroke:#51565b;stroke-width:.45}
  .runway-plan-sheet .leader-arrow{stroke:#333;fill:#333;stroke-width:.25}
  .runway-plan-sheet .divider{stroke:#262b30;stroke-width:.65}
  .runway-plan-sheet .grid-line{stroke:#81888d;stroke-width:.4;stroke-dasharray:8 2 1 2}
  .runway-plan-sheet .bubble{stroke:#31383e;stroke-width:.6;fill:white}
  .runway-plan-sheet .dot{stroke:#111;fill:#111;stroke-width:.5}
  .runway-plan-sheet .hatch{stroke:#6b7075;stroke-width:.3}
  .runway-plan-sheet .hatch-dot{stroke:#6b7075;fill:#6b7075;stroke-width:.3}${contentScale===2?'':detailLineWeights}
  </style><rect x="0" y="0" width="2592" height="1728" style="fill:white;stroke:none"/>
  ${rect(36,36,2520,1656,'divider')}
  <g data-sheet-content="ARCH-D" data-content-scale="${contentScale}" transform="${contentTransform(contentScale)}">`;
}
export function titleBlock(s: CalculationSnapshot, number: string, title: string) {
  const p=s.input,d=p.drawing,top=1548,bottom=1692,date=/^\d{4}-\d{2}-\d{2}/.exec(s.createdAt)?.[0]??'';
  const originator=d?.originator||p.engineer||'',checker=d?.checker||'';
  // Close the scaled drawing region: the title band is laid out in PDF points.
  let svg=`</g><g data-title-block="bottom-band">${line([36,top],[2556,top],'divider')}`;
  for(const x of [876,1236,1560,2156])svg+=line([x,top],[x,bottom],'divider');
  svg+=`<g data-title-panel="revisions">`;
  for(const x of [96,626,726])svg+=line([x,top],[x,bottom]);
  for(const y of [1572,1602,1632,1662])svg+=line([36,y],[876,y]);
  for(const [x,label] of [[66,'REV'],[361,'REVISION DESCRIPTION'],[676,'BY'],[801,'DATE']] as const)svg+=text(x,1564,label,10,'middle',700);
  const revisions=(d?.revisions??[]).filter(r=>r.description.trim()).slice(-4);
  if(revisions.length)revisions.forEach((r,i)=>{const y=1591+i*30;svg+=text(66,y,short(r.rev||'-',4),11,'middle',700)+text(110,y,short(r.description.toUpperCase(),62),11)+text(676,y,short(r.by.toUpperCase(),8),11,'middle')+text(740,y,short(r.date,12),11);});
  // Output not yet issued under an entered revision is the first preliminary.
  else svg+=text(66,1591,'P1',11,'middle',700)+text(110,1591,'CURRENT OUTPUT / ENGINEERING REVIEW',11)+text(740,1591,date,11);
  svg+='</g><g data-title-panel="originator">';
  svg+=text(1056,1598,'CRANECALC',28,'middle',700)+text(1056,1620,'STRUCTURAL DESIGN WORKSHEET',10,'middle');
  svg+=line([876,1640],[1236,1640])+text(1056,1660,'DIMENSIONS GOVERN / DO NOT SCALE',10,'middle');
  svg+=text(1056,1678,p.reportPurpose==='demonstration'?'FICTITIOUS DEMONSTRATION':'ENGINEERING REVIEW',10,'middle');
  svg+='</g><g data-title-panel="approvals">';
  svg+=text(1398,1564,'DRAWING RESPONSIBILITY',10,'middle',700)+line([1236,1572],[1560,1572]);
  const eor=d?.eor,engineer=eor?.name.trim()?`${eor.name}${eor.license.trim()?` · ${eor.jurisdiction.trim()?`${eor.jurisdiction} `:''}LIC. ${eor.license}`:''}`:'';
  for(const [i,label,value] of [[0,'ORIGINATOR',originator],[1,'CHECKER',checker],[2,'ENGINEER OF RECORD',engineer]] as const){
    const y=1572+i*40;svg+=line([1236,y+40],[1560,y+40])+text(1247,y+14,label,9,'start',700)+text(1247,y+31,short(value,48),12);
  }
  svg+='</g><g data-title-panel="project">';
  svg+=text(1858,1566,title,16,'middle',700)+line([1560,1578],[2156,1578]);
  const project=wrappedText(1574,1602,p.title.toUpperCase(),58,15,19);svg+=project.svg;
  svg+=line([1560,1644],[2156,1644])+text(1574,1663,`PROJECT: ${short(p.number||'UNTITLED',60)}`,12,'start',700);
  svg+=text(1574,1681,`${d?.address?.trim()?`SITE: ${short(d.address.trim().toUpperCase(),70)} · `:''}${p.units==='US'?'LENGTHS: FEET & INCHES':'LENGTHS: MILLIMETERS'}`,10);
  svg+='</g><g data-title-panel="sheet">';
  svg+=text(2170,1566,'DRAWING / SHEET NUMBER',10,'start',700)+text(2170,1611,`SHEET ${number}`,29,'start',700)+text(2546,1611,sheetOrdinalToken,12,'end',700);
  svg+=line([2156,1624],[2556,1624])+text(2170,1644,p.units==='SI'?'PAGE SIZE: ARCH D / 914.4 X 609.6 MM':'PAGE SIZE: ARCH D / 36 X 24 IN',12,'start',700);
  svg+=text(2170,1662,`CALC REVISION: ${s.revision}`,11)+text(2170,1681,`DATE: ${date}    SCALE: AS SHOWN`,10);
  svg+='</g></g>';
  const status=issueStatus(s);
  svg+=`<g data-stamp="${status.issued?'seal':'blank'}">${rect(2376,1368,180,180,'divider')}${text(2466,1385,'ENGINEER STAMP / SEAL',10,'middle',700)}${eor?.firm.trim()?text(2466,1520,short(eor.firm.toUpperCase(),30),8,'middle'):''}${text(2466,1534,status.issued?'SEAL AND SIGNATURE REQUIRED':'NOT SEALED',9,'middle')}</g>`;
  svg+=`<g data-issue-status="${status.issued?'issued':'preliminary'}">${text(2360,1494,status.label,11,'end',700)}</g>`+text(2360,1513,'REFERENCE FRAMING SHOWN DASHED',10,'end');
  // A detail on a sheet must never be read as acceptable while any calculation check fails.
  const failed=s.checks.filter(c=>c.status==='fail').length;
  if(failed)svg+=`<g data-flag="failed-checks">${text(2360,1532,`${failed} FAILED CHECK${failed>1?'S':''} - SEE CALCULATION`,11,'end',700)}</g>`;
  return svg;
}

export const detailNumberToken='{{DETAIL_NO}}',sheetNumberToken='{{SHEET_NO}}';
/** Reference to a detail elsewhere in the set by its title; resolved to "n/S-xx" once the set is assembled. */
// URI-encoded so wrapping never splits a reference; measured as its resolved length.
export const detailRef=(title:string)=>`{{REF:${encodeURIComponent(title)}}}`;
/** Reference to the sheet that carries a group of details (see detailSheet.ts); resolved to "S-xx". */
export const sheetRef=(topic:string)=>`{{SHEET:${encodeURIComponent(topic)}}}`;
/** Detail titles referenced from other details; each is drawn by exactly one detail in the set. */
export const detailTitles={
 bearing:'GIRDER BEARING / COLUMN BRACKET',endBearing:'GIRDER END BEARINGS / LOCATING AND SLIDING',endTemplate:'GIRDER WEB / END CONNECTION',
 tie:'FLANGE TIE / COLUMN CONNECTION',flangeTie:'DIRECT FLANGE TIE / TOP TRANSVERSE SECTION',tiePlan:'TIE AND STIFFENER LOCATIONS / PLAN',
 railKeeper:'RAIL KEEPER / GIRDER ATTACHMENT',capSection:'CAPPED GIRDER SECTION',capDevelopment:'CAP END DEVELOPMENT',
 supportEnd:(joint:boolean)=>joint?'ADJACENT GIRDER ENDS AT COLUMN':'GIRDER END AT COLUMN',supportTies:'INDEPENDENT FLANGE TIES / PLAN',movement:'BEARING MOVEMENT REQUIREMENTS',
 weldedBracket:'COLUMN BRACKET / TRANSVERSE SECTION',existingBracket:'BRACKET / TRANSVERSE SECTION',
 endStop:'END STOP / ELEVATION',endStopPlan:'END STOP / PLAN',newColumn:'NEW RUNWAY COLUMN / ELEVATION',basePlate:'BASE PLATE / PLAN',footing:'FOOTING / SECTION',
 bracedBay:'BRACED BAY / ELEVATION',braceTop:'BRACE AND STRUT AT WORK POINT',braceBase:'BRACE AT COLUMN BASE',strutPlan:'STRUT AND GUSSETS AT WORK POINT / PLAN'
} as const;
/** The supporting column as labelled on the details, referring to its own details when it is designed here. */
export function columnReference(p:CalculationSnapshot['input']){
 const c=supportColumn(p);return c.detailed?`${c.name} / ${detailRef(detailTitles.newColumn)}`:c.reference;
}
const resolvedLength=(v:string)=>v.replace(/\{\{REF:[^}]*\}\}/g,'00/S-00').replace(/\{\{SHEET:[^}]*\}\}/g,'S-00');
/**
 * Detail title: numbered bubble (detail over sheet), underlined title and
 * scale. Numbers are assigned in drawing order when the set is assembled.
 * Printed sizes: 3/16 in title, 1/8 in scale, 0.42 in bubble at any content scale.
 */
export function viewTitle(cx:number,y:number,title:string,scale:string,contentScale:number=sheetFormat.contentScale){
 const k=1/contentScale,size=13.5*k,w=textWidth(title,size,true),r=15*k,bx=cx-w/2-r-7*k;
 return `<g data-view-title="below" data-detail-title="${esc(title)}">${circle(bx,y,r,'divider')}${line([bx-r,y],[bx+r,y],'annotation')}${text(bx,y-3.6*k,detailNumberToken,11.5*k,'middle',700)}${text(bx,y+9.4*k,sheetNumberToken,7*k,'middle')}${text(cx,y-4*k,title,size,'middle',700)}${line([bx+r,y],[cx+w/2+5*k,y],'divider')}${text(cx,y+12*k,scale,9*k,'middle')}</g>`;
}
// Drawing labels are upper case; SI unit symbols (mm, kN, MPa) keep their case.
const siSymbol=/^\(?(k?N|MPa|GPa|mm|m|kN·m|kN-m|N\/mm|kN\/m)[),.;:]*$/;
export const labelCaps=(v:string)=>v.split(/(\s+)/).map(w=>siSymbol.test(w)?w:w.toUpperCase()).join('');
/** Explicit waypoints keep annotation corridors separate from adjacent callouts.
 * Identical components may use one arrow with a TYP / quantity note. */
export function multiLeader(points:XY[],at:XY,labels:string[],size=8.5,via:XY[][]=[],span?:number){
 // Land on the label end nearest the targets so a leader never crosses its own text.
 const w=span??Math.max(0,...labels.map(v=>textWidth(labelCaps(v),size))),right=points.length>0&&points.every((p,i)=>(via[i]?.[via[i].length-1]??p)[0]>at[0]+w);
 const elbow:XY=right?[at[0]+w+14,at[1]-3]:[at[0]-14,at[1]-3],landing:XY=right?[at[0]+w+3,at[1]-3]:[at[0]-3,at[1]-3];
 let svg=`<g data-multileader="component"${right?' data-landing="right"':''}>`;
 for(const [i,p] of points.entries()){
  const route=[p,...(via[i]??[]),elbow,landing];
  svg+=`<polyline class="annotation" data-leader-path="true" points="${route.map(v=>v.map(n).join(',')).join(' ')}"/>`;
  const next=route[1],angle=Math.atan2(next[1]-p[1],next[0]-p[0]),c=Math.cos(angle),s=Math.sin(angle);
  svg+=`<path class="leader-arrow" d="M${n(p[0])},${n(p[1])}L${n(p[0]+5*c-1.5*s)},${n(p[1]+5*s+1.5*c)}L${n(p[0]+5*c+1.5*s)},${n(p[1]+5*s-1.5*c)}Z"/>`;
 }
 return svg+labels.map((v,i)=>text(at[0],at[1]+i*11,labelCaps(v),size)).join('')+'</g>';
}
export function fieldWeldFlag(at:XY){
 // AWS A2.4 supplementary flag at the arrow/reference-line junction.
 const x=at[0]-14,y=at[1]-3;
 return `<g data-field-weld="true">${line([x,y],[x,y-15])}<path class="annotation" style="fill:#111" d="M${x},${y-15}l10,3l-10,3Z"/></g>`;
}
export function filletLeader(points:XY[],at:XY,sizeLabel:string,labels:string[],bothSides=false,via:XY[][]=[],field=false){
 // AWS-style reference line with the fillet triangle on the arrow side (below).
 // A second triangle denotes both sides only when the template requires it.
 let svg=multiLeader(points,at,[],8,via,89);
 const y=at[1]-3,x=at[0]+41;
 svg+=line([at[0]-3,y],[at[0]+92,y]);
 for(const sign of bothSides?[-1,1]:[1])svg+=`<path class="annotation" d="M${x},${y}l0,${sign*7}l8,${-sign*7}Z"/>`;
 // Weld sizes sit immediately left of the symbol, on its vertical centerline.
 // Inch marks are omitted by drafting convention; SI values retain MM.
 // Both-sides fillets carry the size on each side of the reference line (AWS A2.4).
 svg+=text(x-6,y+7,labelCaps(sizeLabel.replaceAll('"','')),8,'end')+(bothSides?text(x-6,y-2,labelCaps(sizeLabel.replaceAll('"','')),8,'end'):'');
 svg+=labels.map((v,i)=>text(at[0],at[1]+17+i*11,labelCaps(v),8)).join('');
 const right=points.length>0&&points.every((p,i)=>(via[i]?.[via[i].length-1]??p)[0]>at[0]+89);
 return `<g data-multileader="weld"${field?' data-weld-location="field"':''}>${svg}${field?fieldWeldFlag(right?[at[0]+117,at[1]]:at):''}</g>`;
}
export function fieldFilletLeader(points:XY[],at:XY,sizeLabel:string,labels:string[],bothSides=false,via:XY[][]=[]){return filletLeader(points,at,sizeLabel,labels,bothSides,via,true);}

/**
 * Leaders to a column of labels, ordered by target height so no two leaders
 * cross; labels are spaced by their line count within [top, bottom].
 */
export function labelColumn(items:{at:XY;labels:string[];weld?:string;field?:boolean}[],x:number,top:number,bottom:number){
 const sorted=[...items].sort((a,b)=>a.at[1]-b.at[1]),height=(v:typeof items[number])=>(v.weld?17:0)+v.labels.length*11;
 const total=sorted.reduce((a,v)=>a+height(v),0),gap=Math.max(8,(bottom-top-total)/Math.max(1,sorted.length-1));
 const slots=()=>{let y=top;return sorted.map(v=>{const at=y;y+=height(v)+gap;return at;});};
 // Leader from a target to its label's elbow; labels left of their targets land on the right.
 const route=(v:typeof items[number],y:number):[XY,XY]=>{const w=v.weld?89:Math.max(0,...v.labels.map(l=>textWidth(labelCaps(l),8.5))),ly=(v.weld?y+3:y)-3;return [v.at,v.at[0]>x+w?[x+w+14,ly]:[x-14,ly]];};
 const crosses=([a,b]:[XY,XY],[c,d]:[XY,XY])=>{const o=(p:XY,q:XY,r:XY)=>Math.sign((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]));return o(a,b,c)*o(a,b,d)<0&&o(c,d,a)*o(c,d,b)<0;};
 // Ordering by target height alone can cross leaders whose targets differ in depth; swap such neighbours.
 for(let pass=0;pass<sorted.length;pass++){
  let swapped=false;const ys=slots();
  for(let i=0;i+1<sorted.length;i++)if(crosses(route(sorted[i],ys[i]),route(sorted[i+1],ys[i+1]))){[sorted[i],sorted[i+1]]=[sorted[i+1],sorted[i]];swapped=true;break;}
  if(!swapped)break;
 }
 let svg='';const ys=slots();
 sorted.forEach((v,i)=>{const y=ys[i];svg+=v.weld?filletLeader([v.at],[x,y+3],v.weld,v.labels,true,[],!!v.field):multiLeader([v.at],[x,y],v.labels);});
 return svg;
}

