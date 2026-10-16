import {sheetEntities} from './svgEntities';
import {sheetFormat,textWidth,dimText,line,lettering} from './sheetGraphics';

/**
 * Annotation space: the text boxes and line segments of drawn content as the annotation check reads them
 * (annotationClashes), so that a value or label can be put where it reads clear of what is already drawn.
 */
type XY=[number,number];
/** Box of a text from its cap height to its descender, shrunk as on review; `short` for a one- or two-character bubble number. */
export interface TextBox {x0:number;y0:number;x1:number;y1:number;short:boolean}
/** A line segment; `note` for leaders, dimension and grid lines. */
export interface Segment {a:XY;b:XY;note:boolean}
/** Text boxes and line segments (hatching excluded) of drawn content, in its own layout units. */
export function annotationItems(svg:string){
 const pt=(q:readonly number[]):XY=>[q[0]*72,sheetFormat.height-q[1]*72];
 const boxes:TextBox[]=[],segments:Segment[]=[];
 for(const e of sheetEntities(`<g data-sheet-content="detail">${svg}</g>`,'US')){
  if(e.type==='text'){
   const size=e.height*72/.716,w=textWidth(e.value,size,e.bold),[x,y]=pt(e.at),a=e.align===1?-w/2:e.align===2?-w:0,up=size*.72,down=size*.21;
   const b=Math.abs(e.angle)<1?{x0:x+a,x1:x+a+w,y0:y-up,y1:y+down}:Math.abs(e.angle-90)<1?{x0:x-up,x1:x+down,y0:y-a-w,y1:y-a}:{x0:x-down,x1:x+up,y0:y+a,y1:y+a+w};
   // Descenders, underlines and lines touching the box edge are tolerated.
   boxes.push({x0:b.x0+size*.12,x1:b.x1-size*.12,y0:b.y0+size*.12,y1:b.y1-size*.25,short:e.value.length<=2});
  }
  else if((e.type==='line'||e.type==='poly')&&e.layer!=='S-PATT'){
   const p=(e.type==='line'?[e.a,e.b]:e.points).map(pt),note=e.layer==='S-ANNO'||e.layer==='S-GRID';
   for(let i=1;i<p.length;i++)segments.push({a:p[i-1],b:p[i],note});
   if(e.type==='poly'&&e.closed)segments.push({a:p[p.length-1],b:p[0],note});
  }
 }
 return {boxes,segments};
}
/** Liang-Barsky: does the segment pass through the box? */
export function through(a:XY,b:XY,r:{x0:number;y0:number;x1:number;y1:number}){
 let t0=0,t1=1;const dx=b[0]-a[0],dy=b[1]-a[1];
 for(const [p,q] of [[-dx,a[0]-r.x0],[dx,r.x1-a[0]],[-dy,a[1]-r.y0],[dy,r.y1-a[1]]] as const){
  if(p===0){if(q<0)return false;continue;}
  const t=q/p;if(p<0){if(t>t1)return false;if(t>t0)t0=t;}else{if(t<t0)return false;if(t<t1)t1=t;}
 }
 return t1-t0>1e-6;
}
const overlap=(a:TextBox,b:TextBox)=>a.x0<b.x1&&b.x0<a.x1&&a.y0<b.y1&&b.y0<a.y1;
// Bubble numbers sit on white fills, so only leaders and grids count against them.
const crosses=(box:TextBox,s:Segment)=>(s.note||!box.short)&&through(s.a,s.b,box);
/** Clashes among drawn content: each pair of overlapping texts, and each line through a text. */
export function countClashes({boxes,segments}:{boxes:TextBox[];segments:Segment[]}){
 let count=0;
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)if(overlap(boxes[i],boxes[j]))count++;
 for(const box of boxes)for(const s of segments)if(crosses(box,s))count++;
 return count;
}
/** Content already drawn, against which further annotation is placed. */
export class AnnotationSpace{
 boxes:TextBox[];segments:Segment[];
 constructor(svg=''){const v=annotationItems(svg);this.boxes=v.boxes;this.segments=v.segments;}
 /** Clashes a fragment would add: its text against the text and lines drawn, its lines through the text drawn, and its own. */
 cost(fragment:string){
  const v=annotationItems(fragment);let count=countClashes(v);
  for(const b of v.boxes)count+=this.boxes.filter(o=>overlap(b,o)).length+this.segments.filter(s=>crosses(b,s)).length;
  for(const s of v.segments)count+=this.boxes.filter(b=>crosses(b,s)).length;
  return count;
 }
 /** Record a fragment as drawn and return it. */
 add(fragment:string){const v=annotationItems(fragment);this.boxes.push(...v.boxes);this.segments.push(...v.segments);return fragment;}
 /** The first fragment that adds no clash, else the one adding the fewest, recorded as drawn. */
 pick(fragments:string[]){
  let best=fragments[0],least=Infinity;
  for(const f of fragments){const c=this.cost(f);if(c===0)return this.add(f);if(c<least){least=c;best=f;}}
  return this.add(best);
 }
}
/** Where a dimension's value reads: between its ends, carried beyond the far or the near end, or level beside the line. */
export type DimPlace='inside'|'far'|'near'|'before'|'after';
const tick=(x:number,y:number,vertical:boolean)=>vertical?line([x-3,y+2.5],[x+3,y-2.5]):line([x-2.5,y+3],[x+2.5,y-3]);
/**
 * Vertical dimension (as dimV) with its value placed: 'inside' along the line between the ends, 'far' / 'near' along
 * the line carried beyond the lower / upper end, 'before' / 'after' level beside the line on its left / right.
 */
export function dimVAt(y1:number,y2:number,fromX:number,x:number,label:string,place:DimPlace,size:number=lettering.text){
 const w=textWidth(label,size),lo=Math.min(y1,y2),hi=Math.max(y1,y2),mid=(y1+y2)/2,ext=x+(x<fromX?-4:5);
 const [a,b]=place==='far'?[lo,hi+w+6]:place==='near'?[lo-w-6,hi]:[lo,hi];
 const value=place==='inside'?dimText(x-6,mid,label,size,'middle',400,-90):place==='far'?dimText(x-6,hi+4+w/2,label,size,'middle',400,-90)
  :place==='near'?dimText(x-6,lo-4-w/2,label,size,'middle',400,-90):place==='before'?dimText(x-5,mid+size*.36,label,size,'end'):dimText(x+5,mid+size*.36,label,size,'start');
 return line([fromX,y1],[ext,y1])+line([fromX,y2],[ext,y2])+line([x,a],[x,b])+tick(x,y1,true)+tick(x,y2,true)+value;
}
/**
 * Horizontal dimension (as dimH) with its value placed: 'inside' over the line between the ends, 'far' / 'near' over the
 * line carried beyond the right / left end, 'before' / 'after' under / over the line clear of it.
 */
export function dimHAt(x1:number,x2:number,fromY:number,y:number,label:string,place:DimPlace,size:number=lettering.text){
 const w=textWidth(label,size),lo=Math.min(x1,x2),hi=Math.max(x1,x2),mid=(x1+x2)/2,ext=y+(y<fromY?-4:5);
 const [a,b]=place==='far'?[lo,hi+w+6]:place==='near'?[lo-w-6,hi]:[lo,hi];
 const value=place==='inside'?dimText(mid,y-5,label,size,'middle'):place==='far'?dimText(hi+4,y-5,label,size,'start')
  :place==='near'?dimText(lo-4,y-5,label,size,'end'):place==='before'?dimText(mid,y+size+3,label,size,'middle'):dimText(mid,y-5,label,size,'middle');
 return line([x1,fromY],[x1,ext])+line([x2,fromY],[x2,ext])+line([a,y],[b,y])+tick(x1,y,false)+tick(x2,y,false)+value;
}
/**
 * A vertical dimension whose value reads where it is clear of the drawn content: between the ends where it fits, else
 * the first of beyond the far end, beyond the near end and level beside the line that reads clear.
 */
export function dimVClear(space:AnnotationSpace,y1:number,y2:number,fromX:number,x:number,label:string,size:number=lettering.text){
 const fits=textWidth(label,size)+6<=Math.abs(y2-y1),away:DimPlace=x<fromX?'before':'after';
 const places:DimPlace[]=fits?['inside','far','near',away]:['far','near',away,away==='before'?'after':'before'];
 return space.pick(places.map(v=>dimVAt(y1,y2,fromX,x,label,v,size)));
}
/** A horizontal dimension whose value reads where it is clear of the drawn content (as dimVClear). */
export function dimHClear(space:AnnotationSpace,x1:number,x2:number,fromY:number,y:number,label:string,size:number=lettering.text){
 const fits=textWidth(label,size)+6<=Math.abs(x2-x1),away:DimPlace=y<fromY?'after':'before';
 const places:DimPlace[]=fits?['inside','far','near',away]:['far','near',away];
 return space.pick(places.map(v=>dimHAt(x1,x2,fromY,y,label,v,size)));
}
