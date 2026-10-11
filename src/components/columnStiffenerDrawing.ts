/**
 * Column stiffeners (continuity plates) on the bracket details: edge-on in the bracket section, outlined in the
 * bracket plan at the column, hidden behind the flange in the column-face elevation, and their own plan section at
 * the bracket with sizes, clips and welds. Existing columns carry field welds (flagged); new columns shop welds.
 */
import type {CalculationSnapshot} from '../engine/types';
import {columnStiffenerGeometry,type ColumnStiffenerGeometry} from '../engine/columnStiffeners';
import {supportColumn} from '../engine/drawingData';
import {drawingLength,plateInches} from './drawingFormat';
import {sheetDrawingScale,line,rect,text,dimH,dimV,multiLeader,filletLeader,breakLine,detailRef,n,type XY} from './sheetGraphics';
import type {DetailView} from './detailSheet';

export const columnStiffenerTitle='COLUMN STIFFENERS / PLAN AT BRACKET';
type Input=CalculationSnapshot['input'];
const path=(points:XY[],cls:string)=>`<path class="${cls}" d="M${points.map(v=>`${n(v[0])},${n(v[1])}`).join('L')}Z"/>`;
/** The project's stiffeners with drawing labels. */
export function stiffenerDrawing(p:Input){
 const g=columnStiffenerGeometry(p);if(!g)return undefined;
 const dim=(v:number)=>drawingLength(v,p.units),size=(v:number)=>plateInches(v,p.units),sc=supportColumn(p);
 const where=sc.isNew?'SHOP':'FIELD',depth=g.full?'FULL DEPTH':'HALF DEPTH';
 const levelNames=g.levels.map(l=>l.name.toUpperCase());
 const plate=`PL ${size(g.t)} X ${size(g.width)} X ${size(g.length)}`;
 return {g,dim,size,sc,where,depth,plate,levelNames,
  /** Center of each pair below the top of the seat, as the drawings dimension it. */
  levelText:g.levels.map(l=>`${l.key==='upper'?'UPPER':'LOWER'} PAIR C/L ${dim(-l.z)} BELOW T.O. SEAT`),
  callout:[`2 PAIRS COL. STIFFENERS ${plate}`,`${depth}, ${size(g.clip)} CLIPS, ${where} WELDED`,`AT ${g.rolled?'STUB FLANGES':levelNames.join(' AND ')}; SEE ${detailRef(columnStiffenerTitle)}`]};
}
/** Fabrication, survey and design notes for the stiffeners, appended to the bracket notes. */
export function stiffenerNotes(p:Input):string[]{
 const v=stiffenerDrawing(p);if(!v)return [];
 const {g,size,sc,where}=v,flanges=g.full?'BOTH FLANGES':'THE LOADED FLANGE';
 return [
  `COLUMN STIFFENERS: A PAIR OF ${v.plate} PLATES (${v.depth}), ONE EACH SIDE OF THE COLUMN WEB, AT THE ${v.levelNames.join(' AND AT THE ')} (${v.levelText.join('; ')}), ${size(g.clip)} CORNER CLIPS CLEAR OF THE ROLLED FILLET. ${where} WELD EACH PLATE TO ${flanges} WITH ${size(g.s.flangeWeld)} FILLETS AND TO THE WEB WITH ${size(g.s.webWeld)} FILLETS, BOTH FACES, CONTINUOUS; NO WELD IN THE CLIPS. PLATES ${sc.isNew?'AND WELDS AS THE BRACKET':'AS THE BRACKET PLATES'}.`,
  sc.isNew?`SHOP WELD THE STIFFENERS TO THE ${sc.name} BEFORE THE BRACKET; INSPECT THE FLANGE FILLET TOES.`:'EXISTING COLUMN: BEFORE FABRICATION, SURVEY THE COLUMN AT BOTH STIFFENER LEVELS FOR d, bf, tf, tw AND THE FILLET k, AND CONFIRM THAT NO EXISTING CONNECTION, BRACE, GIRT OR ATTACHMENT ON THE WEB, INSIDE EITHER FLANGE OR ON THE FAR FLANGE INTERFERES WITH THE PLATES OR THEIR WELDS; REPORT ANY TO THE ENGINEER OF RECORD. FIELD WELD THE STIFFENERS BEFORE THE BRACKET CARRIES LOAD.',
  'THE STIFFENERS CARRY THE BRACKET\'S CONCENTRATED FLANGE FORCES ABOVE THE UNSTIFFENED COLUMN STRENGTH, IN TENSION AND COMPRESSION (AISC 360 J10.8). THEY ADD NO PANEL-ZONE SHEAR STRENGTH; NO WEB DOUBLER PLATE IS PROVIDED.'
 ];
}
/**
 * Bracket section looking along the runway: the column's far flange and the plates edge-on at both levels, from the
 * loaded flange (its outer face at x = face) into the column. Y(z) maps an elevation from the seat top.
 */
export function stiffenerSideEdges(g:ColumnStiffenerGeometry,o:{face:number;k:number;Y:(z:number)=>number;top:number;bottom:number;cls:string}){
 const {face,k,Y}=o,c=g.c;
 let svg=rect(face+(c.depth-g.tf)*k,o.top,g.tf*k,o.bottom-o.top,o.cls);
 for(const l of g.levels)svg+=rect(face+g.tf*k,Y(l.z)-g.t*k/2,g.length*k,g.t*k,'runway-line');
 return svg;
}
/** Leader target on the lower pair in the bracket section: its far end. */
export const lowerEdgeTarget=(g:ColumnStiffenerGeometry,o:{face:number;k:number;Y:(z:number)=>number}):XY=>[o.face+(g.tf+g.length*.75)*o.k,o.Y(g.levels[1].z)+g.t*o.k/2];
/**
 * Plate outline in plan (one plate each side of the web), x along the runway from the web plane, the loaded flange
 * inner face at y = yIn and the plate running toward decreasing y (dir = -1) or increasing y (dir = 1).
 */
export function plateOutlines(g:ColumnStiffenerGeometry,o:{cx:number;yIn:number;k:number;dir:-1|1},cls='runway-line'){
 const {cx,yIn,k,dir}=o,c=g.clip*k,yEnd=yIn+dir*g.length*k;let svg='';
 for(const s of [-1,1]){
  const x0=cx+s*g.tw/2*k,x1=cx+s*(g.tw/2+g.width)*k;
  const pts:XY[]=[[x0+s*c,yIn],[x1,yIn],[x1,yEnd],...(g.full?[[x0+s*c,yEnd],[x0,yEnd-dir*c]] as XY[]:[[x0,yEnd]] as XY[]),[x0,yIn+dir*c]];
  svg+=path(pts,cls);
 }
 return svg;
}
/**
 * The column in the bracket plan beyond the loaded flange, broken a short way past it: the web and the plates at the
 * upper level, cut, with their corner clips at the flange; the full plates are on the column stiffener plan.
 */
export function stiffenerPlan(g:ColumnStiffenerGeometry,o:{cx:number;face:number;k:number;cls:string;stub:number}){
 const {cx,face,k}=o,yIn=face-g.tf*k,top=yIn-Math.min(o.stub,g.length*k),c=g.clip*k;
 let svg='';
 for(const s of [-1,1]){
  const x0=cx+s*g.tw/2*k,x1=cx+s*(g.tw/2+g.width)*k;
  svg+=line([x0,yIn],[x0,top],o.cls);
  svg+=`<polyline class="runway-line" points="${[[x0,top],[x0,yIn-c],[x0+s*c,yIn],[x1,yIn],[x1,top]].map(v=>`${n(v[0])},${n(v[1])}`).join(' ')}"/>`;
 }
 svg+=breakLine([cx-(g.tw/2+g.width)*k-4,top],[cx+(g.tw/2+g.width)*k+4,top]);
 return {svg,top};
}
/** Column-face elevation: the plates behind the flange, hidden, at both levels. */
export function stiffenerFaceHidden(g:ColumnStiffenerGeometry,o:{cx:number;k:number;Y:(z:number)=>number}){
 let svg='';
 for(const l of g.levels)for(const s of [-1,1]){const x0=o.cx+s*g.tw/2*o.k,x1=o.cx+s*(g.tw/2+g.width)*o.k;svg+=rect(Math.min(x0,x1),o.Y(l.z)-g.t*o.k/2,Math.abs(x1-x0),g.t*o.k,'hidden-line');}
 return svg;
}
/**
 * Plan section through the column at the upper pair, looking down: both flanges and the web cut, the plates cut with
 * their corner clips, the bracket's seat (or stub flange) beyond the loaded flange, and the plate sizes and welds.
 */
export function columnStiffenerView(s:CalculationSnapshot):DetailView|undefined{
 const p=s.input,v=stiffenerDrawing(p);if(!v)return undefined;
 const {g,dim,size,sc}=v,c=g.c;
 return {title:columnStiffenerTitle,render:()=>{
  const scale=sheetDrawingScale(Math.min(.6,200/(c.depth+80),260/c.width),p.units),k=scale.pointsPerMm;
  // x along the runway from the web plane; the loaded flange (bracket side) at the bottom, its outer face at y = face.
  const cx=210,face=88+Math.max(150,c.depth*k+40),X=(x:number)=>cx+x*k,yIn=face-g.tf*k,top=face-c.depth*k,cls=sc.isNew?'runway-line':'reference-line';
  let svg='<g data-view="column-stiffener-plan">';
  svg+=rect(X(-c.width/2),top,c.width*k,g.tf*k,cls)+rect(X(-c.width/2),yIn,c.width*k,g.tf*k,cls);
  for(const s2 of [-1,1])svg+=line([X(s2*g.tw/2),top+g.tf*k],[X(s2*g.tw/2),yIn],cls);
  svg+=plateOutlines(g,{cx,yIn,k,dir:-1});
  const yEnd=yIn-g.length*k,xEdge=X(g.tw/2+g.width),bracket=g.bracket;
  // Plate width below the column, clear of the plates; plate length beside the flange tip.
  svg+=dimH(X(g.tw/2),xEdge,face+2,face+28,dim(g.width),'right');
  svg+=dimV(yIn,yEnd,xEdge+2,X(c.width/2)+20,dim(g.length));
  svg+=text(cx,face+50,`LOADED FLANGE: ${bracket} ON THIS FACE`,7.5,'middle');
  // Callouts: the column and the plates at the right, the flange fillet below them, the web fillet at the left.
  const lx=X(c.width/2)+56;
  svg+=multiLeader([[X(c.width/2)-3,top+g.tf*k/2]],[lx,top-26],sc.isNew?[sc.name]:[sc.reference,'FIELD VERIFY']);
  svg+=multiLeader([[X(g.tw/2+g.width*.6),yIn-g.length*k*.4]],[lx,top+8],[`2 ${v.plate} EACH LEVEL,`,`${v.depth}; ${size(g.clip)} X ${size(g.clip)} CORNER CLIPS`,`CLEAR OF THE COLUMN FILLET, k = ${size(g.K?.k??0)}`]);
  svg+=filletLeader([[X(g.tw/2+g.clip+g.contact*.7),yIn]],[lx,yIn+12],size(g.s.flangeWeld),[`STIFFENER TO ${g.full?'EACH FLANGE':'LOADED FLANGE'},`,`BOTH FACES, ${v.where}`],true,[],sc.field);
  const webAt:XY=[X(-g.tw/2),yIn-(g.clip+g.webLength*.5)*k],wx=X(-c.width/2)-150;
  svg+=filletLeader([webAt],[wx,webAt[1]+3],size(g.s.webWeld),['STIFFENER TO WEB,',`BOTH FACES, ${v.where}`],true,[],sc.field);
  svg+=text(wx,face+68,`${v.levelText[0]}; ${v.levelText[1]}.`,7.5);
  return {svg:svg+'</g>',scale:scale.label};
 }};
}
