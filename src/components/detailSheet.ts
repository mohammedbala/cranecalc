import type {CalculationSnapshot} from '../engine/types';
import {sheetStart,titleBlock,viewTitle,line,text,esc,n,textWidth,sheetFormat,sheetArea} from './sheetGraphics';
import {sheetEntities} from './svgEntities';
import {heading,numbered,noteFit,noteStack,detailNoteSizes,type Block,type Style} from './noteBlocks';

/**
 * Detail sheets: details laid out on a module grid of three columns by up to four rows of cells, each
 * detail centered in its cell above its title, with a notes column at the right holding the sheet
 * notes and the notes and tables of every group of details on the sheet. Content scale 1: layout
 * units print at 1/72 in.
 */

/** A drawn detail in its own layout coordinates with its printed scale; the composer measures and places it. */
export interface ViewRender {svg:string;scale:string}
export interface DetailView {title:string;rows?:1|2;render:()=>ViewRender}
/** A group of related details (one subject, such as the end stops) with its notes and tables. */
export interface DetailTopic {key:string;name:string;views:DetailView[];notes?:(t:Style)=>Block[];message?:string[]}

export const detailGrid={cols:3,rows:4,cell:{w:680,h:378},notes:{x:2040,w:480,pad:18,top:18,bottom:1314},titleDrop:30} as const;
const notesBox={x:detailGrid.notes.x+detailGrid.notes.pad,y:detailGrid.notes.top,width:detailGrid.notes.w-2*detailGrid.notes.pad,height:detailGrid.notes.bottom-detailGrid.notes.top};

interface Placed {topic:DetailTopic;view:DetailView;col:number;row:number;rows:number}
export interface DetailSheetLayout {topics:DetailTopic[];placed:Placed[];cursor:{row:number;col:number};fits:boolean}
const emptyLayout=():DetailSheetLayout=>({topics:[],placed:[],cursor:{row:0,col:0},fits:true});

/** General notes repeated on every detail sheet, ahead of the notes of its details. */
const sheetNotes=(t:Style):Block[]=>[heading(t,'SHEET NOTES'),...numbered(t,[
 'SEE S-00 FOR GENERAL NOTES, DESIGN CRITERIA, MATERIALS, SPECIAL INSPECTIONS AND SUPPORT REACTIONS, AND S-01 FOR GIRDER MARKS, LENGTHS AND ELEVATIONS.',
 'NEW CONSTRUCTION IS SHOWN SOLID; EXISTING AND REFERENCE CONSTRUCTION IS SHOWN DASHED. DIMENSIONS GOVERN; DO NOT SCALE THE DRAWINGS.',
 'DETAIL REFERENCES READ DETAIL / SHEET. DETAILS ARE TYPICAL FOR BOTH RUNWAYS, OPPOSITE HAND AT GRID B, U.N.O.'
])];
const noteBuilders=(topics:DetailTopic[])=>[sheetNotes,...topics.flatMap(t=>t.notes?[t.notes]:[])];

/**
 * Place a topic's details in reading order from the cursor; a topic that would wrap starts a new row.
 * Details that do not fit in the grid are left out and the layout is marked as not fitting.
 */
function placeTopic(layout:DetailSheetLayout,topic:DetailTopic):DetailSheetLayout{
 const {cols,rows}=detailGrid,used=new Set(layout.placed.flatMap(p=>Array.from({length:p.rows},(_,i)=>`${p.row+i},${p.col}`)));
 const need=topic.views.reduce((a,v)=>a+(v.rows??1),0);
 let {row,col}=layout.cursor,fits=layout.fits;
 if(col>0&&need>cols-col){row++;col=0;}
 const placed=[...layout.placed];
 for(const view of topic.views){
  const h=view.rows??1;let r=row,c=col;
  while(r+h<=rows&&Array.from({length:h},(_,i)=>used.has(`${r+i},${c}`)).some(Boolean)){c++;if(c>=cols){c=0;r++;}}
  if(r+h>rows){fits=false;continue;}
  for(let i=0;i<h;i++)used.add(`${r+i},${c}`);
  placed.push({topic,view,col:c,row:r,rows:h});
  row=r;col=c+1;if(col>=cols){col=0;row++;}
 }
 return {topics:[...layout.topics,topic],placed,cursor:{row,col},fits};
}

/**
 * Detail sheets in topic order, a topic never split between sheets: as few sheets as the details and
 * their notes fit, then the split between them that leaves the emptiest sheet fullest.
 */
export function packDetailSheets(topics:DetailTopic[],units:'US'|'SI'):DetailSheetLayout[]{
 const fitsNotes=(l:DetailSheetLayout)=>noteFit(noteBuilders(l.topics),units,notesBox)!==undefined;
 const layout=(group:DetailTopic[])=>{const l=group.reduce(placeTopic,emptyLayout());return {...l,fits:l.fits&&fitsNotes(l)};};
 // Greedy fill sets the number of sheets.
 const sheets:DetailSheetLayout[]=[];let current=emptyLayout();
 for(const topic of topics){
  let next=placeTopic(current,topic);
  if((!next.fits||!fitsNotes(next))&&current.topics.length){sheets.push(current);current=emptyLayout();next=placeTopic(current,topic);}
  // A topic larger than a whole sheet keeps the details that fit; the set checks report the overflow.
  current={...next,fits:next.fits&&fitsNotes(next)};
 }
 if(current.topics.length||!sheets.length)sheets.push(current);
 if(sheets.length<2||sheets.length>4||topics.length>10)return sheets;
 // Every split of the topics into that many consecutive groups that fits.
 let best=sheets,score=Math.min(...sheets.map(l=>l.placed.length));
 const fuller=(a:DetailSheetLayout[],b:DetailSheetLayout[])=>{const i=a.findIndex((l,j)=>l.placed.length!==b[j].placed.length);return i>=0&&a[i].placed.length>b[i].placed.length;};
 const split=(from:number,left:number,done:DetailSheetLayout[])=>{
  if(left===1){const last=layout(topics.slice(from));if(!last.fits)return;const all=[...done,last],min=Math.min(...all.map(l=>l.placed.length));
   // Ties go to the split with the fuller earlier sheets.
   if(min>score||min===score&&fuller(all,best)){best=all;score=min;}return;}
  for(let to=from+1;to<=topics.length-left+1;to++){const l=layout(topics.slice(from,to));if(l.fits)split(to,left-1,[...done,l]);}
 };
 split(0,sheets.length,[]);
 return best;
}

/**
 * Sheet title from the subjects of its details, e.g. "CONNECTIONS, CAP CHANNEL & SUPPORTS"; a title too
 * long for the title block reads "STRUCTURAL DETAILS".
 */
export function detailSheetTitle(layout:DetailSheetLayout){
 const names=layout.topics.flatMap(t=>t.name.split(' & '));
 const title=names.length<2?names[0]??'DETAILS':`${names.slice(0,-1).join(', ')} & ${names[names.length-1]}`;
 return textWidth(title,16,true)<=560?title:'STRUCTURAL DETAILS';
}

/** Cell edges between occupied cells and their neighbours, and the notes column edge. */
function gridLines(placed:Placed[],h:number,rows:number){
 const {cols,cell:{w},notes}=detailGrid,owner=new Map<string,number>();
 placed.forEach((p,i)=>{for(let r=0;r<p.rows;r++)owner.set(`${p.row+r},${p.col}`,i);});
 let svg=line([notes.x,0],[notes.x,1512],'annotation');
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
  const a=owner.get(`${r},${c}`),right=owner.get(`${r},${c+1}`),below=owner.get(`${r+1},${c}`);
  if(c+1<cols&&(a!==undefined||right!==undefined)&&a!==right)svg+=line([(c+1)*w,r*h],[(c+1)*w,(r+1)*h],'annotation');
  if(r+1<rows&&(a!==undefined||below!==undefined)&&a!==below)svg+=line([c*w,(r+1)*h],[(c+1)*w,(r+1)*h],'annotation');
 }
 return svg;
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
 * Draw one detail sheet: grid, details with their titles, and the notes column. A sheet of three rows
 * spreads them over the full height; each detail is centered in its cell above its title.
 */
export function detailSheetSvg(s:CalculationSnapshot,number:string,title:string,layout:DetailSheetLayout){
 const {cell:{w},titleDrop}=detailGrid,u=s.input.units,rows=Math.max(1,...layout.placed.map(p=>p.row+p.rows));
 const h=Math.min(sheetArea.height/rows,sheetArea.height/3);
 let svg=sheetStart(s,number,`CRANE RUNWAY / ${title}`)+layout.topics.map(t=>`<g data-topic="${esc(t.key)}"/>`).join('');
 svg+=`<g data-detail-grid="3x${rows}">${gridLines(layout.placed,h,rows)}</g>`;
 let fits=layout.fits;
 for(const p of layout.placed){
  const r=p.view.render(),b=contentBounds(r.svg),ax=p.col*w+w/2,ay=(p.row+p.rows)*h-titleDrop;
  // Clear of the cell edges and of the title: centered, but no farther than 70 above the title.
  const top=p.row*h+14,bottom=ay-22,height=b.y1-b.y0;
  const dy=height>bottom-top?bottom-b.y1:Math.max((top+bottom)/2-(b.y0+b.y1)/2,bottom-70-b.y1),dx=ax-(b.x0+b.x1)/2;
  if(height>bottom-top+10||b.x1-b.x0>w-16)fits=false;
  svg+=`<g data-detail-cell="${p.col+1},${p.row+1},${p.rows}" data-cell-height="${n(h)}" transform="translate(${n(dx)} ${n(dy)})">${r.svg}</g>${viewTitle(ax,ay,p.view.title,r.scale)}`;
 }
 // Subjects without drawable details state why.
 const messages=layout.topics.flatMap(t=>t.views.length?[]:t.message??[]);
 messages.forEach((m,i)=>{svg+=text(1020,700+i*22,m,i?11:13.5,'middle',i?400:700);});
 const blocks=(t:Style)=>noteBuilders(layout.topics).map((b,i)=>{
  const inner=b(t),key=i?layout.topics.filter(v=>v.notes)[i-1].key:'sheet';
  const height=inner.reduce((a,v)=>a+v.height+2.4,0)-2.4;
  return {height,render:(x:number,y:number)=>{let out=`<g data-view="${esc(key)}-notes">`,yy=y;for(const v of inner){out+=v.render(x,yy);yy+=v.height+2.4;}return out+'</g>';}} as Block;
 });
 svg+=noteStack([blocks],u,notesBox,detailNoteSizes);
 if(!fits)svg+='<g data-overflow="details"/>';
 return svg+titleBlock(s,number,title)+'</svg>';
}

/** A single group of details on its own sheet, for previews and tests of one subject. */
export function topicSheetSvg(s:CalculationSnapshot,topic:DetailTopic,number:string,title=topic.name){
 return detailSheetSvg(s,number,title,packDetailSheets([topic],s.input.units)[0]);
}
