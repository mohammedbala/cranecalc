import type { CalculationSnapshot } from '../engine/types';
import { drawingScale } from './drawingFormat';
export const sheetFormat = { widthIn:36, heightIn:24, width:2592, height:1728, contentScale:2 } as const;
/** Detail coordinates are enlarged on ARCH D; select and label the actual printed scale. */
export function sheetDrawingScale(maxLayoutUnitsPerMm:number,units:CalculationSnapshot['input']['units']){
 const scale=drawingScale(maxLayoutUnitsPerMm*sheetFormat.contentScale,units);
 return {...scale,pointsPerMm:scale.pointsPerMm/sheetFormat.contentScale};
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
export function bubble(x: number, y: number, label: string) { return circle(x, y, 8, 'bubble') + text(x, y + 3, label, 9, 'middle', 700); }
export function leader(at: XY, end: XY, label: string, size = 9) {
  return line(at, [end[0] - 8, end[1] - 3]) + line([end[0] - 8, end[1] - 3], [end[0] + 6, end[1] - 3])
    + circle(at[0], at[1], 1.4, 'dot') + text(end[0] + 9, end[1], label, size);
}
export function dimH(x1: number, x2: number, fromY: number, y: number, label: string) {
  return line([x1, fromY], [x1, y + 5]) + line([x2, fromY], [x2, y + 5]) + line([x1, y], [x2, y])
    + [x1, x2].map(x => line([x - 2.5, y + 3], [x + 2.5, y - 3])).join('') + text((x1 + x2) / 2, y - 5, label, 9, 'middle');
}
export function dimV(y1: number, y2: number, fromX: number, x: number, label: string) {
  return line([fromX, y1], [x + 5, y1]) + line([fromX, y2], [x + 5, y2]) + line([x, y1], [x, y2])
    + [y1, y2].map(y => line([x - 3, y + 2.5], [x + 3, y - 2.5])).join('')
    + text(x - 6, (y1 + y2) / 2, label, 9, 'middle', 400, -90);
}
export function wrappedText(x: number, y: number, value: string, maxChars: number, size = 9, leading = 12) {
  const rows: string[] = []; let row = '';
  for (const word of value.split(/\s+/)) { if (row && row.length + word.length + 1 > maxChars) { rows.push(row); row = ''; } row += `${row ? ' ' : ''}${word}`; }
  if (row) rows.push(row);
  return { svg: rows.map((r, i) => text(x, y + i * leading, r, size)).join(''), height: rows.length * leading };
}
export function sheetStart(s: CalculationSnapshot, number: string, title: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="runway-plan-sheet" width="${s.input.units==='SI'?'914.4mm':'36in'}" height="${s.input.units==='SI'?'609.6mm':'24in'}" viewBox="0 0 2592 1728" role="img" aria-label="${esc(`${number} / ${title} / ${s.input.units==='SI'?'ARCH D 914.4 by 609.6 mm drawing':'ARCH D 36 by 24 inch drawing'}`)}"><style>
  .runway-plan-sheet{background:white;color:#111}
  .runway-plan-sheet text{font-family:Arial,sans-serif;fill:#111;stroke:none;letter-spacing:0}
  .runway-plan-sheet path,.runway-plan-sheet line,.runway-plan-sheet polyline,.runway-plan-sheet rect,.runway-plan-sheet circle{fill:none;stroke-linecap:butt;stroke-linejoin:round}
  .runway-plan-sheet .reference-line{stroke:#7b8186;stroke-width:.48;stroke-dasharray:3.6 2.4}
  .runway-plan-sheet .runway-line{stroke:#111;stroke-width:.8;stroke-dasharray:none}
  .runway-plan-sheet .rail-line{stroke:#111;stroke-width:.65;stroke-dasharray:none}
  .runway-plan-sheet .annotation{stroke:#51565b;stroke-width:.45}
  .runway-plan-sheet .leader-arrow{stroke:#333;fill:#333;stroke-width:.25}
  .runway-plan-sheet .divider{stroke:#262b30;stroke-width:.65}
  .runway-plan-sheet .grid-line{stroke:#81888d;stroke-width:.4;stroke-dasharray:8 2 1 2}
  .runway-plan-sheet .bubble{stroke:#31383e;stroke-width:.6;fill:white}
  .runway-plan-sheet .dot{stroke:#111;fill:#111;stroke-width:.5}
  </style><rect x="0" y="0" width="2592" height="1728" style="fill:white;stroke:none"/>
  ${rect(36,36,2520,1656,'divider')}
  <g data-sheet-content="ARCH-D" transform="translate(72 36) scale(${sheetFormat.contentScale})">`;
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
  svg+=text(110,1591,'CURRENT OUTPUT / ENGINEERING REVIEW',11)+text(740,1591,date,11);
  svg+='</g><g data-title-panel="originator">';
  svg+=text(1056,1598,'CRANECALC',28,'middle',700)+text(1056,1620,'STRUCTURAL DESIGN WORKSHEET',10,'middle');
  svg+=line([876,1640],[1236,1640])+text(1056,1660,'DIMENSIONS GOVERN / DO NOT SCALE',10,'middle');
  svg+=text(1056,1678,p.reportPurpose==='demonstration'?'FICTITIOUS DEMONSTRATION':'ENGINEERING REVIEW',10,'middle');
  svg+='</g><g data-title-panel="approvals">';
  svg+=text(1398,1564,'DRAWING RESPONSIBILITY',10,'middle',700)+line([1236,1572],[1560,1572]);
  for(const [i,label,value] of [[0,'ORIGINATOR',originator],[1,'CHECKER',checker],[2,'APPROVED','']] as const){
    const y=1572+i*40;svg+=line([1236,y+40],[1560,y+40])+text(1247,y+14,label,9,'start',700)+text(1247,y+31,short(value,48),12);
  }
  svg+='</g><g data-title-panel="project">';
  svg+=text(1858,1566,title,16,'middle',700)+line([1560,1578],[2156,1578]);
  const project=wrappedText(1574,1602,p.title.toUpperCase(),58,15,19);svg+=project.svg;
  svg+=line([1560,1644],[2156,1644])+text(1574,1663,`PROJECT: ${short(p.number||'UNTITLED',60)}`,12,'start',700);
  svg+=text(1574,1681,p.units==='US'?'LENGTHS: FEET & INCHES':'LENGTHS: MILLIMETERS',10);
  svg+='</g><g data-title-panel="sheet">';
  svg+=text(2170,1566,'DRAWING / SHEET NUMBER',10,'start',700)+text(2170,1611,`SHEET ${number}`,29,'start',700);
  svg+=line([2156,1624],[2556,1624])+text(2170,1644,p.units==='SI'?'PAGE SIZE: ARCH D / 914.4 X 609.6 MM':'PAGE SIZE: ARCH D / 36 X 24 IN',12,'start',700);
  svg+=text(2170,1662,`CALC REVISION: ${s.revision}`,11)+text(2170,1681,`DATE: ${date}    SCALE: AS SHOWN`,10);
  svg+='</g></g>';
  svg+=`<g data-stamp="blank">${rect(2376,1368,180,180,'divider')}${text(2466,1385,'ENGINEER STAMP / SEAL',10,'middle',700)}${text(2466,1534,'RESERVED / UNSEALED',9,'middle')}</g>`;
  svg+=text(2360,1494,'NOT FOR FABRICATION',11,'end',700)+text(2360,1513,'REFERENCE FRAMING SHOWN DASHED',10,'end');
  // A detail on a sheet must never be read as acceptable while any calculation check fails.
  const failed=s.checks.filter(c=>c.status==='fail').length;
  if(failed)svg+=`<g data-flag="failed-checks">${text(2360,1532,`${failed} FAILED CHECK${failed>1?'S':''} - SEE CALCULATION`,11,'end',700)}</g>`;
  return svg;
}

export function viewTitle(cx:number,y:number,title:string,scale:string){
 return `<g data-view-title="below">${text(cx,y,title,11,'middle',700)}${text(cx,y+12,scale,8,'middle')}</g>`;
}
/** Explicit waypoints keep annotation corridors separate from adjacent callouts.
 * Identical components may use one arrow with a TYP / quantity note. */
export function multiLeader(points:XY[],at:XY,labels:string[],size=8.5,via:XY[][]=[]){
 const elbow:XY=[at[0]-14,at[1]-3];
 let svg=`<g data-multileader="component">`;
 for(const [i,p] of points.entries()){
  const route=[p,...(via[i]??[]),elbow,[at[0]-3,elbow[1]] as XY];
  svg+=`<polyline class="annotation" data-leader-path="true" points="${route.map(v=>v.map(n).join(',')).join(' ')}"/>`;
  const next=route[1],angle=Math.atan2(next[1]-p[1],next[0]-p[0]),c=Math.cos(angle),s=Math.sin(angle);
  svg+=`<path class="leader-arrow" d="M${n(p[0])},${n(p[1])}L${n(p[0]+5*c-1.5*s)},${n(p[1]+5*s+1.5*c)}L${n(p[0]+5*c+1.5*s)},${n(p[1]+5*s-1.5*c)}Z"/>`;
 }
 return svg+labels.map((v,i)=>text(at[0],at[1]+i*11,v.toUpperCase(),size)).join('')+'</g>';
}
export function fieldWeldFlag(at:XY){
 // AWS A2.4 supplementary flag at the arrow/reference-line junction.
 const x=at[0]-14,y=at[1]-3;
 return `<g data-field-weld="true">${line([x,y],[x,y-15])}<path class="annotation" style="fill:#111" d="M${x},${y-15}l10,3l-10,3Z"/></g>`;
}
export function filletLeader(points:XY[],at:XY,sizeLabel:string,labels:string[],bothSides=false,via:XY[][]=[],field=false){
 // AWS-style reference line with the fillet triangle on the arrow side (below).
 // A second triangle denotes both sides only when the template requires it.
 let svg=multiLeader(points,at,[],8,via);
 const y=at[1]-3,x=at[0]+41;
 svg+=line([at[0]-3,y],[at[0]+92,y]);
 for(const sign of bothSides?[-1,1]:[1])svg+=`<path class="annotation" d="M${x},${y}l0,${sign*7}l8,${-sign*7}Z"/>`;
 // Weld sizes sit immediately left of the symbol, on its vertical centerline.
 // Inch marks are omitted by drafting convention; SI values retain MM.
 svg+=text(x-6,y+7,sizeLabel.replaceAll('"','').toUpperCase(),8,'end');
 svg+=labels.map((v,i)=>text(at[0],at[1]+17+i*11,v.toUpperCase(),8)).join('');
 return `<g data-multileader="weld"${field?' data-weld-location="field"':''}>${svg}${field?fieldWeldFlag(at):''}</g>`;
}
export function fieldFilletLeader(points:XY[],at:XY,sizeLabel:string,labels:string[],bothSides=false,via:XY[][]=[]){return filletLeader(points,at,sizeLabel,labels,bothSides,via,true);}
