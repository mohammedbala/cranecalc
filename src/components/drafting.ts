import {girderSegments} from '../engine/simpleSupports';
import { detailedDrawings } from './detailedDrawings';
import type { CalculationSnapshot } from '../engine/types';
import { validateProject } from '../engine/calculate';
import { format, toDisplay } from '../engine/units';
import { drawingLength, plateInches } from './drawingFormat';

export const cadLayers = {
  OUTLINE: { color: 7, weight: 35, width: 1.5, dash: '', ink: '#17212b' },
  RAIL: { color: 4, weight: 25, width: 1, dash: '', ink: '#17212b' },
  HIDDEN: { color: 8, weight: 13, width: .65, dash: '5 3', ink: '#59636c' },
  CENTER: { color: 4, weight: 13, width: .65, dash: '14 3 2 3', ink: '#59636c' },
  DIMENSION: { color: 2, weight: 18, width: .75, dash: '', ink: '#303b45' },
  LOAD: { color: 1, weight: 25, width: 1, dash: '', ink: '#17212b' },
  HATCH: { color: 8, weight: 9, width: .4, dash: '', ink: '#78818a' },
  TEXT: { color: 7, weight: 18, width: .75, dash: '', ink: '#17212b' },
  BORDER: { color: 8, weight: 13, width: .65, dash: '', ink: '#59636c' },
} as const;
type Layer = keyof typeof cadLayers;
type Point = [number, number];
export type CadEntity =
  | { type: 'line'; layer: Layer; a: Point; b: Point }
  | { type: 'polyline'; layer: Layer; points: Point[]; closed: boolean }
  | { type: 'circle'; layer: Layer; center: Point; radius: number }
  | { type: 'text'; layer: Layer; at: Point; text: string; size: number; align: 'start'|'middle'|'end'; angle: number };
export interface CadDrawing { name: string; title: string; number: string; width: number; height: number; mmPerUnit: number; entities: CadEntity[] }
export const escapeXml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const short = (s: string, n: number) => s.length > n ? `${s.slice(0, n - 3)}...` : s;
const round = (v: number) => Number(v.toFixed(6));

export class Draft {
  drawing: CadDrawing;
  constructor(s: CalculationSnapshot, name: string, title: string, number: string, height: number, mmPerUnit: number, note: string) {
    this.drawing = { name, title, number, height, width: 1000, mmPerUnit, entities: [] };
    this.rect(12, 12, 976, height - 24, 'BORDER');
    this.text(28, 36, title.toUpperCase(), 13);
    this.text(970, 36, `${number} / ${s.input.units === 'US' ? 'FEET-INCHES' : 'MILLIMETERS'}`, 9, 'end', 'BORDER');
    this.text(28, height - 68, short(note, 145), 9, 'start', 'TEXT');
    this.line(12, height - 54, 988, height - 54, 'BORDER');
    this.line(590, height - 54, 590, height - 12, 'BORDER');
    this.line(810, height - 54, 810, height - 12, 'BORDER');
    this.text(28, height - 37, short(s.input.title, 70), 10);
    this.text(28, height - 22, `CRANECALC / ${short(s.input.number || 'UNTITLED', 40)} / ENGINEERING SKETCH`, 8, 'start', 'BORDER');
    this.text(604, height - 37, `REVISION ${s.revision}`, 9);
    this.text(604, height - 22, 'DIMENSIONS GOVERN / DO NOT SCALE PRINT', 8, 'start', 'BORDER');
    this.text(824, height - 37, s.input.reportPurpose==='demonstration'?'DEMONSTRATION':s.input.scope==='design'?'DESIGN MODEL':'ANALYSIS ONLY', 9);
    this.text(824, height - 22, 'NOT FOR FABRICATION', 8, 'start', 'BORDER');
  }
  line(x1: number, y1: number, x2: number, y2: number, layer: Layer = 'OUTLINE') { this.drawing.entities.push({ type: 'line', layer, a: [x1, y1], b: [x2, y2] }); }
  poly(points: Point[], closed = false, layer: Layer = 'OUTLINE') { this.drawing.entities.push({ type: 'polyline', layer, points, closed }); }
  rect(x: number, y: number, w: number, h: number, layer: Layer = 'OUTLINE') { this.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true, layer); }
  circle(x: number, y: number, radius: number, layer: Layer = 'OUTLINE') { this.drawing.entities.push({ type: 'circle', layer, center: [x, y], radius }); }
  text(x: number, y: number, text: string, size = 10, align: 'start'|'middle'|'end' = 'start', layer: Layer = 'TEXT', angle = 0) { this.drawing.entities.push({ type: 'text', layer, at: [x, y], text, size, align, angle }); }
  arrow(x: number, y: number, angle: number, layer: Layer = 'DIMENSION', size = 5) {
    const c = Math.cos(angle), s = Math.sin(angle);
    for (const sign of [-1, 1]) this.line(x, y, x + size * c - sign * 1.8 * s, y + size * s + sign * 1.8 * c, layer);
  }
  dimH(x1: number, x2: number, fromY: number, y: number, label: string) {
    for (const x of [x1, x2]) this.line(x, fromY + Math.sign(y - fromY) * 3, x, y + Math.sign(y - fromY) * 6, 'DIMENSION');
    this.line(x1, y, x2, y, 'DIMENSION'); this.arrow(x1, y, 0); this.arrow(x2, y, Math.PI);
    this.text((x1 + x2) / 2, y - 6, label, 10, 'middle', 'DIMENSION');
  }
  dimV(y1: number, y2: number, fromX: number, x: number, label: string) {
    for (const y of [y1, y2]) this.line(fromX + Math.sign(x - fromX) * 3, y, x + Math.sign(x - fromX) * 6, y, 'DIMENSION');
    this.line(x, y1, x, y2, 'DIMENSION'); this.arrow(x, y1, Math.PI / 2); this.arrow(x, y2, -Math.PI / 2);
    this.text(x - 6, (y1 + y2) / 2, label, 10, 'middle', 'DIMENSION', -90);
  }
  leader(x: number, y: number, tx: number, ty: number, label: string) {
    this.poly([[x, y], [tx - 15, ty - 4], [tx - 3, ty - 4]], false, 'DIMENSION');
    this.arrow(x, y, Math.atan2(ty - 4 - y, tx - 15 - x)); this.text(tx, ty, label, 10);
  }
  fieldFilletLeader(x:number,y:number,tx:number,ty:number,sizeLabel:string,labels:string[],bothSides=false){
    const jx=tx-15,jy=ty-4,sx=tx+41;
    this.poly([[x,y],[jx,jy],[tx+92,jy]],false,'DIMENSION');
    this.arrow(x,y,Math.atan2(jy-y,jx-x));
    this.line(jx,jy,jx,jy-15,'DIMENSION');this.poly([[jx,jy-15],[jx+10,jy-12],[jx,jy-9]],true,'DIMENSION');
    for(const sign of bothSides?[-1,1]:[1])this.poly([[sx,jy],[sx,jy+sign*7],[sx+8,jy]],true,'DIMENSION');
    this.text(sx-6,jy+7,sizeLabel.replaceAll('"',''),8,'end');
    labels.forEach((label,i)=>this.text(tx,ty+17+i*13,label.toUpperCase(),9));
  }
  hatch(x: number, y: number, w: number, h: number) {
    // Explicit clipped lines remain editable in DXF and require no SVG pattern resources.
    for (let u = 0; u < w + h; u += 9) {
      const ax = Math.max(0, u - h), ay = Math.min(h, u), bx = Math.min(w, u), by = Math.max(0, u - w);
      this.line(x + ax, y + ay, x + bx, y + by, 'HATCH');
    }
  }
}

function elevationDrawing(s: CalculationSnapshot): CadDrawing {
  const p = s.input, b = p.section, L = p.spans.reduce((a, v) => a + v, 0);
  const k = Math.min(860 / L, 115 / (b.d + p.railHeight + (b.kind === 'cap' ? b.capTw : 0)));
  const start = (1000 - L * k) / 2, X = (x: number) => start + x * k;
  const top = 136 + (p.railHeight + (b.kind === 'cap' ? b.capTw : 0)) * k, bottom = top + b.d * k;
  const railY = top - (p.railHeight + (b.kind === 'cap' ? b.capTw : 0)) * k;
  const dimY = bottom + 46, height = Math.max(390, dimY + 118);
  const lc = s.analysis?.demand.governing.moment;
  const d = new Draft(s, 'runway-elevation', 'Runway elevation - governing supplied-load moment case', 'SK-01', height, 1 / k,
    `${p.system === 'simple' ? 'Independent simply supported spans' : 'Continuous flexural member'} / rail, wheels and support symbols schematic / ${lc?.id ?? 'No load case'}`);
  let x = 0;
  for(const member of girderSegments(p)){
    const a=member.start,z=member.end;
    d.rect(X(a),top,(z-a)*k,b.d*k);
    d.line(X(a),top+b.tf*k,X(z),top+b.tf*k);
    d.line(X(a),bottom-b.tf*k,X(z),bottom-b.tf*k);
    if(b.kind==='cap')d.rect(X(a),top-b.capTw*k,(z-a)*k,b.capTw*k,'RAIL');
  }
  p.spans.forEach((span,i)=>{d.dimH(X(x),X(x+span),bottom+18,dimY,`L${i+1} = ${drawingLength(span,p.units)}`);x+=span;});
  d.line(X(0), railY, X(L), railY, 'RAIL');
  const supports = [0, ...p.spans.map((_, i) => p.spans.slice(0, i + 1).reduce((a, v) => a + v, 0))];
  supports.forEach((at, i) => {
    d.line(X(at), top - 8, X(at), bottom + 24, 'CENTER');
    d.poly([[X(at), bottom + 1], [X(at) - 9, bottom + 16], [X(at) + 9, bottom + 16]], true);
    d.line(X(at) - 13, bottom + 20, X(at) + 13, bottom + 20);
    d.text(X(at) + 12, bottom + 13, `S${i + 1}`, 9);
  });
  d.dimH(X(0), X(L), dimY + 8, dimY + 29, `OVERALL = ${drawingLength(L, p.units)}`);
  const points = lc?.points ?? [];
  points.forEach((w, i) => {
    const px = X(w.x), labelX = 80 + (i + .5) / points.length * 840;
    d.circle(px, railY - 5, 5, 'LOAD');
    d.poly([[labelX, 84], [px, 108], [px, railY - 12]], false, 'LOAD');
    d.arrow(px, railY - 12, -Math.PI / 2, 'LOAD', 6);
    d.text(labelX, 64, points.length > 8 ? `W${i + 1}` : `W${i + 1} / ${format(w.vertical, 'force', p.units)}`, 10, 'middle', 'LOAD');
  });
  return d.drawing;
}

function planDrawing(s: CalculationSnapshot): CadDrawing {
  const p = s.input, b = p.section, L = p.spans.reduce((a, v) => a + v, 0), width = b.kind === 'cap' ? Math.max(b.bf, b.capWidth) : b.bf;
  const k = Math.min(860 / L, 70 / (width / 2 + Math.abs(p.railEccentricity)));
  const start = (1000 - L * k) / 2, X = (x: number) => start + x * k, cy = 156, railY = cy - p.railEccentricity * k;
  const d = new Draft(s, 'runway-plan', 'Runway plan - girder and rail alignment', 'SK-02', 370, 1 / k,
    `Rail C/L offset e = ${drawingLength(p.railEccentricity, p.units)} / positive offset above girder C/L in this view / rail profile not supplied`);
  for(const m of girderSegments(p)){
    d.rect(X(m.start),cy-b.bf*k/2,(m.end-m.start)*k,b.bf*k);
    for(const y of [cy-b.tw*k/2,cy+b.tw*k/2])d.line(X(m.start),y,X(m.end),y,'HIDDEN');
    if(b.kind==='cap')d.rect(X(m.start),cy-b.capWidth*k/2,(m.end-m.start)*k,b.capWidth*k,'RAIL');
  }
  d.line(X(0) - 15, cy, X(L) + 15, cy, 'CENTER');
  d.line(X(0), railY, X(L), railY, 'RAIL');
  d.text(80, 63, 'GIRDER C/L - DASH DOT / RAIL C/L - CONTINUOUS', 9);
  let x = 0;
  [0, ...p.spans].forEach((v, i) => { x += v; d.line(X(x), cy - width * k / 2 - 12, X(x), cy + width * k / 2 + 12, 'CENTER'); d.text(X(x), 96, `S${i + 1}`, 9, 'middle'); });
  x = 0; p.spans.forEach((span, i) => { d.dimH(X(x), X(x + span), cy + width * k / 2 + 12, 234, `L${i + 1} = ${drawingLength(span, p.units)}`); x += span; });
  if (Math.abs(p.railEccentricity) > 0) d.leader(X(L / 2), railY, 580, 117, `e = ${drawingLength(p.railEccentricity, p.units)}`);
  d.text(80, 283, `${b.kind === 'cap' ? 'Top width' : 'Flange width'} = ${drawingLength(width, p.units)} / rail shown as centerline only`, 10);
  return d.drawing;
}

function sectionDrawing(s: CalculationSnapshot): CadDrawing {
  const p = s.input, b = p.section;
  const cw = b.kind === 'cap' ? b.capWidth : 0, ct = b.kind === 'cap' ? b.capTw : 0;
  const k = Math.min(205 / (b.d + ct), 270 / Math.max(b.bf, cw)), x = 350, y = 92 + ct * k;
  const bf = b.bf * k, tf = b.tf * k, tw = b.tw * k, h = b.d * k;
  const d = new Draft(s, 'girder-section', 'Girder cross-section - idealized plate geometry', 'SK-03', 430, 1 / k,
    `${short(b.name, 45)} / ${b.kind === 'rolled' ? 'Fillets omitted; catalogue properties supplied separately' : 'Rectangular plates; fillets excluded'} / rail alignment shown in SK-02`);
  d.hatch(x - bf / 2, y, bf, tf); d.hatch(x - tw / 2, y + tf, tw, h - 2 * tf); d.hatch(x - bf / 2, y + h - tf, bf, tf);
  d.poly([[x - bf / 2, y], [x + bf / 2, y], [x + bf / 2, y + tf], [x + tw / 2, y + tf], [x + tw / 2, y + h - tf], [x + bf / 2, y + h - tf], [x + bf / 2, y + h], [x - bf / 2, y + h], [x - bf / 2, y + h - tf], [x - tw / 2, y + h - tf], [x - tw / 2, y + tf], [x - bf / 2, y + tf]], true);
  if (b.kind === 'cap') {
    const w = b.capWidth * k, t = b.capTw * k, f = b.capTf * k, depth = b.capDepth * k, top = y - t;
    d.hatch(x - w / 2, top, w, t); d.hatch(x - w / 2, y, f, depth - t); d.hatch(x + w / 2 - f, y, f, depth - t);
    d.poly([[x - w / 2, top], [x + w / 2, top], [x + w / 2, top + depth], [x + w / 2 - f, top + depth], [x + w / 2 - f, y], [x - w / 2 + f, y], [x - w / 2 + f, top + depth], [x - w / 2, top + depth]], true, 'RAIL');
    d.text(640, 252, `CAP WIDTH = ${drawingLength(b.capWidth, p.units)}`, 10);
    d.text(640, 272, `DEPTH = ${drawingLength(b.capDepth, p.units)}`, 10);
    d.text(640, 292, `tf / tw = ${plateInches(b.capTf, p.units)} / ${plateInches(b.capTw, p.units)}`, 10);
  }
  d.line(x, 55, x, 331, 'CENTER'); d.line(x - Math.max(bf, cw * k) / 2 - 20, y + h / 2, x + Math.max(bf, cw * k) / 2 + 20, y + h / 2, 'CENTER');
  d.dimH(x - bf / 2, x + bf / 2, y + h + 3, 327, `bf = ${drawingLength(b.bf, p.units)}`);
  d.dimV(y, y + h, x - Math.max(bf, cw * k) / 2, x - Math.max(bf, cw * k) / 2 - 40, `d = ${drawingLength(b.d, p.units)}`);
  d.leader(x + bf * .35, y + tf / 2, 640, 106, `tf = ${plateInches(b.tf, p.units)}`);
  d.leader(x + tw / 2, y + h * .6, 640, 151, `tw = ${plateInches(b.tw, p.units)}`);
  d.text(640, 198, `Fy = ${format(b.Fy, 'stress', p.units)}`, 10);
  d.text(640, 219, b.kind === 'cap' ? 'I-GIRDER + ROTATED CAP CHANNEL' : b.kind === 'rolled' ? 'ROLLED I-SECTION' : 'WELDED I-GIRDER', 10);
  return d.drawing;
}

export function engineeringSketches(s: CalculationSnapshot): CadDrawing[] {
  if (validateProject(s.input).length) return [];
  return [elevationDrawing(s), sectionDrawing(s), planDrawing(s),...detailedDrawings(s)];
}

export function drawingSvg(d: CadDrawing): string {
  const attrs = (layer: Layer) => { const l = cadLayers[layer]; return `data-layer="${layer}" style="stroke:var(--cad-${layer.toLowerCase()},${l.ink});stroke-width:${l.width};fill:none${l.dash ? `;stroke-dasharray:${l.dash}` : ''}"`; };
  const entities = d.entities.map(e => {
    if (e.type === 'text') return `<text data-layer="${e.layer}" x="${round(e.at[0])}" y="${round(e.at[1])}" text-anchor="${e.align}" font-size="${e.size}"${e.angle ? ` transform="rotate(${e.angle} ${round(e.at[0])} ${round(e.at[1])})"` : ''} style="fill:var(--cad-${e.layer.toLowerCase()},${cadLayers[e.layer].ink})">${escapeXml(e.text)}</text>`;
    if (e.type === 'line') return `<line ${attrs(e.layer)} x1="${round(e.a[0])}" y1="${round(e.a[1])}" x2="${round(e.b[0])}" y2="${round(e.b[1])}"/>`;
    if (e.type === 'circle') return `<circle ${attrs(e.layer)} cx="${round(e.center[0])}" cy="${round(e.center[1])}" r="${round(e.radius)}"/>`;
    return `<${e.closed ? 'polygon' : 'polyline'} ${attrs(e.layer)} points="${e.points.map(p => p.map(round).join(',')).join(' ')}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="cad-sheet" viewBox="0 0 ${d.width} ${d.height}" role="img" aria-label="${escapeXml(d.title)}"><title>${escapeXml(d.title)}</title><rect class="cad-paper" width="${d.width}" height="${d.height}" style="fill:var(--cad-paper,#fff)"/><g font-family="Arial,sans-serif" stroke-linecap="round" stroke-linejoin="round">${entities}</g></svg>`;
}

// ASCII AutoCAD 2000 DXF. Dimensions are editable LINE/TEXT primitives, not associative DIMENSION entities.
// The orthographic reference geometry is 1:1 in selected units; symbols and annotation stay schematic.
export function lineworkDxf(s: CalculationSnapshot): string {
  if (!s.eligible) throw Error('Generate output from a validated calculation before downloading CAD linework.');
  const drawings = engineeringSketches(s);
  if (!drawings.length) throw Error('Invalid geometry cannot be exported.');
  const tags: (string|number)[] = [], put = (...pairs: (string|number)[]) => tags.push(...pairs);
  let handle = 256; const next = () => (handle++).toString(16).toUpperCase();
  const clean = (t: string) => t.replace(/[\r\n\u0000-\u001f]/g, ' ').replace(/[^\x20-\x7e]/g, c => `\\U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
  put(0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1015',9,'$INSUNITS',70,s.input.units === 'US' ? 1 : 4,9,'$MEASUREMENT',70,s.input.units === 'US' ? 0 : 1,9,'$LWDISPLAY',290,1,0,'ENDSEC');
  put(0,'SECTION',2,'TABLES',0,'TABLE',2,'LTYPE',5,next(),100,'AcDbSymbolTable',70,3);
  for (const [name, segments] of [['CONTINUOUS', []], ['CENTER', [14,-3,2,-3]], ['HIDDEN', [5,-3]]] as [string, number[]][]) {
    put(0,'LTYPE',5,next(),100,'AcDbSymbolTableRecord',100,'AcDbLinetypeTableRecord',2,name,70,0,3,name,72,65,73,segments.length,40,segments.reduce((a,v) => a + Math.abs(v),0));
    for (const seg of segments) put(49,seg,74,0);
  }
  put(0,'ENDTAB',0,'TABLE',2,'LAYER',5,next(),100,'AcDbSymbolTable',70,Object.keys(cadLayers).length + 1);
  for (const [name,l] of [['0',cadLayers.OUTLINE],...Object.entries(cadLayers)] as [string,typeof cadLayers[Layer]][]) put(0,'LAYER',5,next(),100,'AcDbSymbolTableRecord',100,'AcDbLayerTableRecord',2,name,70,0,62,l.color,6,name === 'CENTER' || name === 'HIDDEN' ? name : 'CONTINUOUS',370,l.weight);
  put(0,'ENDTAB',0,'TABLE',2,'STYLE',5,next(),100,'AcDbSymbolTable',70,1,0,'STYLE',5,next(),100,'AcDbSymbolTableRecord',100,'AcDbTextStyleTableRecord',2,'STANDARD',70,0,40,0,41,1,50,0,71,0,42,10,3,'txt',4,'',0,'ENDTAB',0,'ENDSEC',0,'SECTION',2,'BLOCKS',0,'ENDSEC',0,'SECTION',2,'ENTITIES');
  let offsetY = 0;
  for (const d of drawings) {
    const k = toDisplay(d.mmPerUnit, 'length', s.input.units);
    const xy = (p: Point): Point => [round(p[0] * k), round(offsetY + (d.height - p[1]) * k)];
    const base = (type: string, layer: Layer, subclass: string) => put(0,type,5,next(),100,'AcDbEntity',8,layer,48,k,100,subclass);
    const drawLine = (a: Point,b: Point,layer: Layer) => { const [x1,y1] = xy(a),[x2,y2] = xy(b); base('LINE',layer,'AcDbLine'); put(10,x1,20,y1,30,0,11,x2,21,y2,31,0); };
    for (const e of d.entities) {
      if (e.type === 'line') drawLine(e.a,e.b,e.layer);
      else if (e.type === 'polyline') {
        const points = e.closed ? [...e.points,e.points[0]] : e.points;
        for (let i = 1; i < points.length; i++) drawLine(points[i-1],points[i],e.layer);
      } else if (e.type === 'circle') {
        const [x,y] = xy(e.center); base('CIRCLE',e.layer,'AcDbCircle'); put(10,x,20,y,30,0,40,round(e.radius * k));
      } else {
        const [x,y] = xy(e.at); base('TEXT',e.layer,'AcDbText');
        put(10,x,20,y,30,0,40,round(e.size * k),1,clean(e.text),50,-e.angle,7,'STANDARD',72,e.align === 'middle' ? 1 : e.align === 'end' ? 2 : 0,11,x,21,y,31,0,100,'AcDbText',73,0);
      }
    }
    offsetY += (d.height + 70) * k;
  }
  put(0,'ENDSEC',0,'EOF');
  return tags.join('\n') + '\n';
}
