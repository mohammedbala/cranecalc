import type {CalculationSnapshot} from '../engine/types';
import {sheetStart,titleBlock,viewTitle,line,text,esc,n,textWidth,sheetFormat,sheetArea,withDetailRoom,detailRoomFactor,lettering} from './sheetGraphics';
import {nextScaleRatio} from './drawingFormat';
import {sheetEntities} from './svgEntities';
import {annotationItems,countClashes} from './annotationSpace';
import {heading,numbered,noteStyle,flowBlocks,type Block,type Style,type Lane,type Placement} from './noteBlocks';
import {holdTag,viewHolds} from './detailHolds';

/**
 * Detail sheets. The details stand in rows that fill the drawing area from top to bottom, the cells of a row sharing
 * its width, each detail centered in its cell above its title; lanes of notes at the right hold the sheet notes and the
 * notes and tables of every group of details on the sheet. The rows, and the scale of every detail, are chosen so the
 * details print at the largest standard scales the sheet holds (withDetailRoom). Text keeps the lettering size
 * (sheetGraphics lettering): notes that do not fit one lane continue in the next, a detail whose annotation would crowd
 * at its scale is drawn larger (clearView), and a sheet takes no more details than fit at their standard scales.
 * Content scale 1: layout units print at 1/72 in.
 */

/**
 * A drawn detail in its own layout coordinates with its printed scale; the composer measures and places it. A detail
 * drawn by clearView also reports the detail room it took and its annotation clashes.
 */
export interface ViewRender {svg:string;scale:string;room?:number;clashes?:number}
/**
 * A detail drawn in one cell; `subdetails` are the titles of further numbered details drawn inside it (subdetailTitle),
 * numbered after it. `rows` 2 marks a tall detail (the elevation of a column or a braced bay); the composer sizes every
 * cell from the drawn detail.
 */
export interface DetailView {title:string;rows?:1|2;subdetails?:readonly string[];render:()=>ViewRender}
/** A group of related details (one subject, such as the end stops) with its notes and tables. */
export interface DetailTopic {key:string;name:string;views:DetailView[];notes?:(t:Style)=>Block[];message?:string[];
 /** HOLD lines of the topic's views (detailHolds), listed at the top of the notes of its sheet. */
 holds?:string[]}

/**
 * Layout units. The notes lanes are 480 wide at the right edge of the drawing area, the rightmost stopping above the
 * seal and the issue status; lane text is 444 wide. A cell keeps 14 clear above its detail, 8 each side and 52 below it
 * for the title, whose bubble centers 30 above the foot of the cell. A row holds up to `perRow` details.
 */
export const detailLayout={width:sheetArea.width,height:sheetArea.height,lane:{width:480,pad:18,top:18,bottom:1494,last:1314},cell:{top:14,side:8,bottom:52},titleDrop:30,maxLanes:3,perRow:5} as const;

interface Placed {topic:DetailTopic;view:DetailView}
/** The topics of a detail sheet and their details in drawing order, its number of notes lanes, and whether all of it fits. */
export interface DetailSheetLayout {topics:DetailTopic[];placed:Placed[];lanes:number;fits:boolean}

/** General notes repeated on every detail sheet, ahead of the notes of its details. */
const sheetNotes=(t:Style):Block[]=>[heading(t,'SHEET NOTES'),...numbered(t,[
 'SEE S-00 FOR GENERAL NOTES, DESIGN CRITERIA, MATERIALS, SPECIAL INSPECTIONS AND SUPPORT REACTIONS, AND S-01 FOR GIRDER MARKS, LENGTHS AND ELEVATIONS.',
 'NEW CONSTRUCTION IS SHOWN SOLID; EXISTING AND REFERENCE CONSTRUCTION IS SHOWN DASHED. DIMENSIONS GOVERN; DO NOT SCALE THE DRAWINGS.',
 'DETAIL REFERENCES READ DETAIL / SHEET. DETAILS ARE TYPICAL FOR BOTH RUNWAYS, OPPOSITE HAND AT GRID B, U.N.O.'
])];
/** The notes lanes of a sheet with `count` of them, left to right. */
function noteLanes(count:number):Lane[]{
 const {width,lane}=detailLayout;
 return Array.from({length:count},(_,i)=>({x:width-(count-i)*lane.width+lane.pad,top:lane.top,bottom:i===count-1?lane.last:lane.bottom}));
}
/**
 * The sheet notes and the notes of each topic at the lettering size, flowed into the fewest lanes that hold them and
 * balanced between those lanes; undefined when even the most lanes do not.
 */
function placeNotes(topics:DetailTopic[],units:'US'|'SI'){
 const t=noteStyle(detailLayout.lane.width-2*detailLayout.lane.pad,units);
 // Open items at the details of the sheet come first: HOLD, not for fabrication (detailHolds).
 const holds=[...new Set(topics.flatMap(v=>v.holds??[]))];
 const groups=[...(holds.length?[{key:'holds',blocks:[heading(t,'HOLDS - NOT FOR FABRICATION'),...numbered(t,holds)]}]:[]),{key:'sheet',blocks:sheetNotes(t)},...topics.flatMap(v=>v.notes?[{key:v.key,blocks:v.notes(t)}]:[])];
 const blocks=groups.flatMap(g=>g.blocks),owner=groups.flatMap(g=>g.blocks.map(()=>g.key));
 for(let count=1;count<=detailLayout.maxLanes;count++){
  const lanes=noteLanes(count);let placed=flowBlocks(blocks,lanes);
  if(!placed)continue;
  // Two or more lanes end at about the same height: the lowest common bottom at which the notes still fit.
  if(count>1)for(let limit=Math.max(...blocks.map(b=>b.height))+detailLayout.lane.top;limit<detailLayout.lane.bottom;limit+=6){const v=flowBlocks(blocks,lanes,limit);if(v){placed=v;break;}}
  return {count,placed,owner};
 }
 return undefined;
}
/** Notes lanes a group of topics needs, or undefined when its notes do not fit a sheet. */
const notesLanes=(topics:DetailTopic[],units:'US'|'SI')=>placeNotes(topics,units)?.count;

type Bounds={x0:number;y0:number;x1:number;y1:number};
/** A detail drawn at one standard scale: its drawing, content bounds, and its scale gain over the standard scale (log2). */
interface Drawing {room:number;render:ViewRender;bounds:Bounds;gain:number;clashes?:number}
/** Annotation clashes of a drawing, counted when first asked for (packing the sheets needs only the bounds). */
const clashesOf=(d:Drawing)=>d.clashes??=d.render.clashes??annotationClashes(d.render.svg);
const cleared=new WeakSet<DetailView>();
/**
 * The detail drawn where its annotation reads clear: a detail whose text would overlap text or linework at the scale its
 * budget gives (annotationClashes) is drawn at the next larger standard scale instead, at most two scales larger, where
 * that has fewer clashes. It takes a larger cell; its text is never made smaller (sheetGraphics lettering).
 */
export function clearView(view:DetailView):DetailView{
 if(cleared.has(view))return view;
 const v:DetailView={...view,render:()=>{
  const room=detailRoomFactor();let best:ViewRender=view.render(),clashes=annotationClashes(best.svg),at=room,r=room;
  for(let step=0;step<2&&clashes>0;step++){
   const ratio=nextScaleRatio(best.scale);if(!ratio||fullSize.test(best.scale))break;
   r*=ratio;const next=withDetailRoom(r,()=>view.render());
   if(next.scale===best.scale||fullSize.test(next.scale))break;
   const c=annotationClashes(next.svg);if(c<clashes){best=next;clashes=c;at=r;}
  }
  return {...best,room:at,clashes};
 }};
 cleared.add(v);return v;
}
const drawings=new WeakMap<DetailView,{list:Drawing[];done:boolean}>();
/**
 * A detail is enlarged to at most four times its own scale budget, and not to full size: the largest printed scale a
 * detail is enlarged to is 6" = 1'-0" (1:2).
 */
const largestRoom=4,fullSize=/^SCALE: (12" = 1'-0"|1:1\b)/;
/**
 * A detail at its standard scale (level 0) or at the level-th larger standard scale it takes, each drawn once; undefined
 * past the largest. A larger scale that adds annotation clashes is not taken.
 */
function drawing(view:DetailView,level:number):Drawing|undefined{
 let cache=drawings.get(view);
 if(!cache){cache={list:[],done:false};drawings.set(view,cache);}
 const {list}=cache;
 while(list.length<=level&&!cache.done){
  // The next level from the room the last was drawn with (clearView may have drawn it larger than asked).
  const last=list.at(-1),ratio=last?nextScaleRatio(last.render.scale):1,room=last&&ratio?(last.render.room??last.room)*ratio:1;
  if(!ratio||room>largestRoom+1e-9){cache.done=true;break;}
  const render=last?withDetailRoom(room,()=>view.render()):view.render();
  if(last&&(render.scale===last.render.scale||fullSize.test(render.scale))){cache.done=true;break;}
  const next:Drawing={room,render,bounds:contentBounds(render.svg),gain:last?last.gain+Math.log2(ratio!):0};
  if(last&&clashesOf(next)>clashesOf(list[0])){cache.done=true;break;}
  list.push(next);
 }
 return list[level];
}
/** Width a detail title takes: the bubble left of the centered title and the cell's side clearances. */
const titleWidth=(title:string)=>textWidth(title,lettering.title,true)+74+2*detailLayout.cell.side;
/** Cell a detail drawing needs. */
function need(view:DetailView,d:Drawing){
 const {cell}=detailLayout,b=d.bounds;
 return {w:Math.max(b.x1-b.x0+2*cell.side,titleWidth(view.title)),h:b.y1-b.y0+cell.top+cell.bottom};
}
/** Least total height of the details in rows of the field width at their standard scales (Infinity when one is too wide). */
function leastHeight(items:Placed[],fieldW:number){
 const needs=items.map(p=>need(p.view,drawing(p.view,0)!)),best=new Array<number>(items.length+1).fill(Infinity);best[items.length]=0;
 for(let i=items.length-1;i>=0;i--){
  let w=0,h=0;
  for(let k=i;k<items.length&&k<i+detailLayout.perRow;k++){w+=needs[k].w;h=Math.max(h,needs[k].h);if(w>fieldW)break;best[i]=Math.min(best[i],h+best[k+1]);}
 }
 return best[0];
}
interface Cell {placed:Placed;drawing:Drawing;x:number;y:number;w:number;h:number;row:number;col:number}
/**
 * Details in rows filling a field: every split of the details into rows (in drawing order) whose standard scales fit,
 * each detail then enlarged to its next standard scale while its row and the field hold it, the cheapest gain first.
 * The arrangement with the largest total scale gain is taken; among equal ones the one whose emptiest row is fullest.
 */
function arrange(items:Placed[],fieldW:number,fieldH:number):Cell[]|undefined{
 const count=items.length;if(!count)return [];
 const base=items.map(p=>drawing(p.view,0)!),needs0=base.map((d,i)=>need(items[i].view,d));
 let best:{score:number[];rows:number[][];levels:number[];heights:number[]}|undefined;
 const better=(a:number[],b:number[])=>{for(let i=0;i<a.length;i++){if(Math.abs(a[i]-b[i])>1e-6)return a[i]>b[i];}return false;};
 const evaluate=(rows:number[][])=>{
  const rowOf=new Array<number>(count),levels=new Array<number>(count).fill(0),needs=[...needs0];
  rows.forEach((r,i)=>r.forEach(j=>rowOf[j]=i));
  const rowW=rows.map(r=>r.reduce((a,j)=>a+needs[j].w,0)),rowH=rows.map(r=>Math.max(...r.map(j=>needs[j].h)));
  let total=rowH.reduce((a,b)=>a+b,0),gain=0;
  for(;;){
   let pick=-1,value=0,next:Drawing|undefined,nextNeed={w:0,h:0};
   for(let j=0;j<count;j++){
    const d=drawing(items[j].view,levels[j]+1);if(!d)continue;
    const q=need(items[j].view,d),r=rowOf[j];
    if(rowW[r]-needs[j].w+q.w>fieldW+1e-6)continue;
    const dh=Math.max(0,q.h-rowH[r]);if(total+dh>fieldH+1e-6)continue;
    const v=(d.gain-drawing(items[j].view,levels[j])!.gain)/(1+dh/60);
    if(v>value+1e-9){pick=j;value=v;next=d;nextNeed=q;}
   }
   if(pick<0||!next)break;
   const r=rowOf[pick],dh=Math.max(0,nextNeed.h-rowH[r]);
   gain+=next.gain-drawing(items[pick].view,levels[pick])!.gain;
   rowW[r]+=nextNeed.w-needs[pick].w;rowH[r]+=dh;total+=dh;needs[pick]=nextNeed;levels[pick]++;
  }
  const score=[Math.round(gain*1000)/1000,Math.min(...rowW.map(w=>w/fieldW)),-rows.length];
  if(!best||better(score,best.score))best={score,rows,levels,heights:rowH};
 };
 const split=(start:number,rows:number[][],height:number)=>{
  if(start===count){evaluate(rows);return;}
  let w=0,h=0;
  for(let k=start;k<count&&k<start+detailLayout.perRow;k++){
   w+=needs0[k].w;h=Math.max(h,needs0[k].h);
   if(w>fieldW+1e-6||height+h>fieldH+1e-6)break;
   split(k+1,[...rows,Array.from({length:k-start+1},(_,i)=>start+i)],height+h);
  }
 };
 split(0,[],0);
 if(!best)return undefined;
 // The height left over goes to the rows in proportion to their heights; the width left in a row to its cells in
 // proportion to theirs.
 const {rows,levels,heights}=best,used=heights.reduce((a,b)=>a+b,0),cells:Cell[]=[];
 let y=0;
 rows.forEach((r,i)=>{
  const h=heights[i]*fieldH/used,ds=r.map(j=>drawing(items[j].view,levels[j])!),ws=r.map((j,k)=>need(items[j].view,ds[k]).w),sum=ws.reduce((a,b)=>a+b,0);
  let x=0;
  r.forEach((j,k)=>{const w=ws[k]*fieldW/sum;cells.push({placed:items[j],drawing:ds[k],x,y,w,h,row:i,col:k});x+=w;});
  y+=h;
 });
 return cells;
}
/** Each detail at its standard scale in rows of the field, for a sheet whose details do not all fit (marked as overflowing). */
function fallback(items:Placed[],fieldW:number,fieldH:number):Cell[]{
 const cells:Cell[]=[],rows:Placed[][]=[];let row:Placed[]=[],w=0;
 for(const p of items){const q=need(p.view,drawing(p.view,0)!).w;if(row.length&&(w+q>fieldW||row.length>=detailLayout.perRow)){rows.push(row);row=[];w=0;}row.push(p);w+=q;}
 if(row.length)rows.push(row);
 const h=fieldH/Math.max(1,rows.length);
 rows.forEach((r,i)=>r.forEach((p,k)=>cells.push({placed:p,drawing:drawing(p.view,0)!,x:k*fieldW/r.length,y:i*h,w:fieldW/r.length,h,row:i,col:k})));
 return cells;
}

/** Whether a group of topics fits one sheet: its notes in the lanes and its details at their standard scales beside them. */
function sheetFor(topics:DetailTopic[],units:'US'|'SI'):DetailSheetLayout{
 const placed=topics.flatMap(topic=>topic.views.map(view=>({topic,view}))),lanes=notesLanes(topics,units);
 const fits=lanes!==undefined&&leastHeight(placed,detailLayout.width-lanes*detailLayout.lane.width)<=detailLayout.height+1e-6;
 return {topics,placed,lanes:lanes??detailLayout.maxLanes,fits};
}
/**
 * A topic too large for a sheet of its own continues on the next: its details in as many consecutive parts as needed,
 * the notes with the first. Each part keeps the topic's key, so references find its first sheet.
 */
function parts(topic:DetailTopic,units:'US'|'SI'):DetailTopic[]{
 if(sheetFor([topic],units).fits||topic.views.length<2)return [topic];
 const out:DetailTopic[]=[];let views:DetailView[]=[];
 const part=(v:DetailView[]):DetailTopic=>({...topic,views:v,notes:out.length?undefined:topic.notes,message:out.length?undefined:topic.message});
 for(const view of topic.views){
  if(views.length&&!sheetFor([part([...views,view])],units).fits){out.push(part(views));views=[];}
  views.push(view);
 }
 if(views.length)out.push(part(views));
 return out;
}
/**
 * Detail sheets in topic order, a topic never split between sheets unless it does not fit one: as few sheets as the
 * details and their notes fit, then the split between them that leaves the emptiest sheet fullest.
 */
export function packDetailSheets(topics:DetailTopic[],units:'US'|'SI'):DetailSheetLayout[]{
 topics=topics.flatMap(t=>parts({...t,views:t.views.map(clearView)},units));
 const memo=new Map<string,DetailSheetLayout>(),layout=(from:number,to:number)=>{const key=`${from},${to}`;let v=memo.get(key);if(!v){v=sheetFor(topics.slice(from,to),units);memo.set(key,v);}return v;};
 // Greedy fill sets the number of sheets.
 const sheets:DetailSheetLayout[]=[];let from=0;
 for(let i=1;i<=topics.length;i++){
  if(i-from>1&&!layout(from,i).fits){sheets.push(layout(from,i-1));from=i-1;}
 }
 if(from<topics.length||!sheets.length)sheets.push(layout(from,topics.length));
 if(sheets.length<2||sheets.length>4||topics.length>10)return sheets;
 // Every split of the topics into that many consecutive groups that fits.
 let best=sheets,score=Math.min(...sheets.map(l=>l.placed.length));
 const fuller=(a:DetailSheetLayout[],b:DetailSheetLayout[])=>{const i=a.findIndex((l,j)=>l.placed.length!==b[j].placed.length);return i>=0&&a[i].placed.length>b[i].placed.length;};
 const split=(start:number,left:number,done:DetailSheetLayout[])=>{
  if(left===1){const last=layout(start,topics.length);if(!last.fits)return;const all=[...done,last],min=Math.min(...all.map(l=>l.placed.length));
   // Ties go to the split with the fuller earlier sheets.
   if(min>score||min===score&&fuller(all,best)){best=all;score=min;}return;}
  for(let to=start+1;to<=topics.length-left+1;to++){const l=layout(start,to);if(l.fits)split(to,left-1,[...done,l]);}
 };
 split(0,sheets.length,[]);
 return best;
}

/**
 * Sheet title from the subjects of its details, e.g. "CONNECTIONS, CAP CHANNEL & SUPPORTS"; a title too
 * long for the title block reads "STRUCTURAL DETAILS".
 */
export function detailSheetTitle(layout:DetailSheetLayout){
 const names=[...new Set(layout.topics.flatMap(t=>t.name.split(' & ')))];
 const title=names.length<2?names[0]??'DETAILS':`${names.slice(0,-1).join(', ')} & ${names[names.length-1]}`;
 return textWidth(title,16,true)<=560?title:'STRUCTURAL DETAILS';
}

/** Extents of drawn content in its own layout units, text included (Arial advance widths). */
export function contentBounds(svg:string){
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 const add=(x:number,y:number)=>{x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);};
 const pt=(q:readonly number[])=>[q[0]*72,sheetFormat.height-q[1]*72] as const;
 for(const e of sheetEntities(`<g data-sheet-content="detail">${svg}</g>`,'US')){
  if(e.type==='text'){
   // Box from the cap height to the descender along the baseline, rotated with the text.
   const size=e.height*72/.716,w=textWidth(e.value,size,e.bold),[x,y]=pt(e.at),a=e.align===1?-w/2:e.align===2?-w:0;
   const t=-e.angle*Math.PI/180,c=Math.cos(t),s=Math.sin(t);
   for(const [u,v] of [[a,-size*.72],[a+w,-size*.72],[a,size*.21],[a+w,size*.21]])add(x+u*c-v*s,y+u*s+v*c);
  }
  else if(e.type==='circle'){const [x,y]=pt(e.center),r=e.radius*72;add(x-r,y-r);add(x+r,y+r);}
  else for(const q of e.type==='line'?[e.a,e.b]:e.points){const [x,y]=pt(q);add(x,y);}
 }
 return Number.isFinite(x0)?{x0,y0,x1,y1}:{x0:0,y0:0,x1:0,y1:0};
}

/**
 * Text that overlaps other text or has linework through it in a drawn detail or sheet (annotationSpace.ts). Text boxes
 * are shrunk as on review: descenders, underlines and lines touching the box edge are tolerated.
 */
export function annotationClashes(svg:string){return countClashes(annotationItems(svg));}

/**
 * Draw one detail sheet: the details in their rows, each centered in its cell above its title, the cell edges, and the
 * notes in their lanes at the right.
 */
export function detailSheetSvg(s:CalculationSnapshot,number:string,title:string,layout:DetailSheetLayout){
 const {cell,titleDrop,height}=detailLayout,u=s.input.units,notes=placeNotes(layout.topics,u),lanes=notes?.count??layout.lanes;
 const fieldW=detailLayout.width-lanes*detailLayout.lane.width;
 const arranged=arrange(layout.placed,fieldW,height),cells=arranged??fallback(layout.placed,fieldW,height);
 let fits=layout.fits&&!!arranged&&!!notes;
 let svg=sheetStart(s,number,`CRANE RUNWAY / ${title}`)+layout.topics.map(t=>`<g data-topic="${esc(t.key)}"/>`).join('');
 // Cell edges: between the rows, between the cells of a row, and the notes lanes.
 const rows=Math.max(0,...cells.map(c=>c.row+1));
 let grid=line([fieldW,0],[fieldW,height],'annotation');
 for(let i=1;i<lanes;i++)grid+=line([fieldW+i*detailLayout.lane.width,0],[fieldW+i*detailLayout.lane.width,height],'annotation');
 for(const c of cells){if(c.col)grid+=line([c.x,c.y],[c.x,c.y+c.h],'annotation');if(c.row&&!c.col)grid+=line([0,c.y],[fieldW,c.y],'annotation');}
 svg+=`<g data-detail-grid="${Array.from({length:rows},(_,i)=>cells.filter(c=>c.row===i).length).join('-')}">${grid}</g>`;
 for(const c of cells){
  const r=c.drawing.render,b=c.drawing.bounds,ax=c.x+c.w/2,ay=c.y+c.h-titleDrop,top=c.y+cell.top,bottom=ay-22,h=b.y1-b.y0;
  // Clear of the cell edges and of the title: centered, but no farther than 70 above the title.
  const dy=h>bottom-top?bottom-b.y1:Math.max((top+bottom)/2-(b.y0+b.y1)/2,bottom-70-b.y1),dx=ax-(b.x0+b.x1)/2;
  if(h>bottom-top+10||b.x1-b.x0>c.w-2*cell.side){fits=false;svg+=`<g data-overflow-cell="${esc(c.placed.view.title)}" data-overflow-size="${n(b.x1-b.x0)}x${n(h)} in ${n(c.w-2*cell.side)}x${n(bottom-top+10)}"/>`;}
  // The cell's box (layout units) marked ahead of its detail.
  svg+=`<g data-cell-box="${n(c.x)},${n(c.y)},${n(c.w)},${n(c.h)}"/><g data-detail-cell="${c.col+1},${c.row+1},1" data-cell-height="${n(c.h)}" transform="translate(${n(dx)} ${n(dy)})">${r.svg}</g>${viewTitle(ax,ay,c.placed.view.title,r.scale)}${holdTag(ax,ay+25,viewHolds(s,c.placed.view.title))}`;
 }
 // Subjects without drawable details state why.
 const messages=layout.topics.flatMap(t=>t.views.length?[]:t.message??[]);
 messages.forEach((m,i)=>{svg+=text(fieldW/2,700+i*22,m,i?11:13.5,'middle',i?400:700);});
 // Notes, each group in its own group element wherever its blocks fall.
 if(notes){
  const by=new Map<string,Placement[]>();
  for(const v of notes.placed){const key=notes.owner[v.index>=0?v.index:v.section];by.set(key,[...(by.get(key)??[]),v]);}
  for(const [key,list] of by)svg+=`<g data-view="${esc(key)}-notes">${list.map(v=>v.b.render(v.x,v.y)).join('')}</g>`;
 }
 else svg+='<g data-overflow="notes"/>';
 if(!fits)svg+='<g data-overflow="details"/>';
 return svg+titleBlock(s,number,title)+'</svg>';
}

/** A single group of details on its own sheet, for previews and tests of one subject. */
export function topicSheetSvg(s:CalculationSnapshot,topic:DetailTopic,number:string,title=topic.name){
 return detailSheetSvg(s,number,title,packDetailSheets([topic],s.input.units)[0]);
}
