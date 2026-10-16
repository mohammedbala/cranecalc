import {line,text,wrapToWidth,textWidth,lettering} from './sheetGraphics';

/** Stacked note blocks (headings, paragraphs, numbered notes, tables) measured for flowing on a sheet. */
/** A note block; a heading carries the heading that restates it where its section continues in another column. */
export interface Block {height:number;keep?:boolean;continued?:()=>Block;render:(x:number,y:number)=>string;}
export interface Style {width:number;body:number;leading:number;heading:number;caps:(v:string)=>string;}
const siUnit=/^\(?(k?N|MPa|GPa|mm|m|kN·m|kN-m|N\/mm|kN\/m)[),.;:]*$/;
/** Drawing notes are upper case; SI unit symbols keep their case. */
export const capsFor=(units:'US'|'SI')=>(v:string)=>v.split(/(\s+)/).map(w=>units==='SI'&&siUnit.test(w)?w:w.toUpperCase()).join('');
/** A bold heading over a rule; one too wide for the column wraps, the rule under its last line. */
export const heading=(t:Style,title:string):Block=>{
 const rows=wrapToWidth(title,t.width,t.heading,true),extra=(rows.length-1)*t.heading*1.2;
 return {height:t.heading*1.9+extra,keep:true,continued:()=>heading(t,`${title} (CONT.)`),render:(x,y)=>rows.map((r,i)=>text(x,y+t.heading+i*t.heading*1.2,r,t.heading,'start',700)).join('')+line([x,y+t.heading*1.36+extra],[x+t.width,y+t.heading*1.36+extra],'divider')};
};
export function paragraph(t:Style,value:string):Block{const rows=wrapToWidth(t.caps(value),t.width,t.body);return {height:rows.length*t.leading+t.body*.45,render:(x,y)=>rows.map((r,i)=>text(x,y+t.body+i*t.leading,r,t.body)).join('')};}
export function numbered(t:Style,items:string[]):Block[]{const indent=t.body*2.2;return items.map((item,i)=>{const rows=wrapToWidth(t.caps(item),t.width-indent,t.body);return {height:rows.length*t.leading+t.body*.45,render:(x,y)=>text(x,y+t.body,`${i+1}.`,t.body,'start',700)+rows.map((r,j)=>text(x+indent,y+t.body+j*t.leading,r,t.body)).join('')};});}
/**
 * Column proportions for a table from the widest heading and cell of each column, so no value wraps where the table fits
 * its column (and the columns share any width left over in proportion). A table wider than its column narrows the
 * columns listed in `wrap` (text that may wrap, such as case names) first, down to their longest word, so the values
 * in the other columns still read on one line.
 */
export function fitColumns(t:Style,headers:string[],rows:string[][],wrap:number[]=[]){
 const pad=t.body*.3,widths=headers.map((h,i)=>Math.max(textWidth(t.caps(h),t.body,true),...rows.map(r=>textWidth(t.caps(r[i]??''),t.body)))+2*pad+2);
 const words=(v:string,bold:boolean)=>t.caps(v).split(/\s+/).filter(Boolean).map(w=>textWidth(w,t.body,bold));
 let excess=widths.reduce((a,b)=>a+b,0)-t.width;
 for(const i of wrap){
  if(excess<=0)break;
  const least=Math.max(0,...words(headers[i],true),...rows.flatMap(r=>words(r[i]??'',false)))+2*pad+2,give=Math.max(0,Math.min(excess,widths[i]-least));
  widths[i]-=give;excess-=give;
 }
 return widths;
}
/** Table with proportional column widths; long cells wrap within their column. */
export function table(t:Style,headers:string[],rows:string[][],widths:number[]):Block{
 const total=widths.reduce((a,b)=>a+b,0),w=widths.map(v=>v/total*t.width),pad=t.body*.3;
 const cells=rows.map(r=>r.map((v,i)=>wrapToWidth(t.caps(v),w[i]-2*pad,t.body)));
 const heights=[t.leading+pad*2,...cells.map(r=>Math.max(...r.map(c=>c.length))*t.leading+pad*2)];
 return {height:heights.reduce((a,b)=>a+b,0)+t.body*.45,render:(x,y)=>{
  let svg='',yy=y;
  const row=(values:string[][],h:number,bold:boolean)=>{let cx=x;values.forEach((v,i)=>{v.forEach((r,j)=>{svg+=text(cx+pad,yy+pad+t.body*.95+j*t.leading,r,t.body,'start',bold?700:400);});cx+=w[i];});yy+=h;svg+=line([x,yy],[x+t.width,yy],bold?'divider':'annotation');};
  row(headers.map(h=>[t.caps(h)]),heights[0],true);cells.forEach((r,i)=>row(r,heights[i+1],false));
  return svg;}};
}
type Box={x:number;y:number;width:number;height:number};
/**
 * Note text sizes as factors of a 6-unit body, largest first. Notes print at the lettering size or larger (sheetGraphics
 * lettering: 9.5 points, 3/32 in capitals) and are never set smaller to fit: a caller whose notes do not fit at the
 * smallest size continues them elsewhere (flowBlocks).
 */
const legibleSizes=(sizes:number[])=>{const v=sizes.filter(k=>6*k>=lettering.min-1e-9);return v.length?v:[lettering.min/6];};
/** Detail-sheet and schedule notes at content scale 1: body text at the lettering size. */
export const detailNoteSizes=[lettering.text/6];
const styleAt=(k:number,width:number,units:'US'|'SI'):Style=>({width,body:6*k,leading:7.8*k,heading:8*k,caps:capsFor(units)});
/** Note style at the lettering size for a column of the given width. */
export const noteStyle=(width:number,units:'US'|'SI')=>styleAt(lettering.text/6,width,units);
const stackHeight=(blocks:Block[])=>blocks.reduce((a,b)=>a+b.height+2.4,0)-2.4;
/** Largest size factor at which the blocks fit the box, or undefined when even the smallest does not. */
export function noteFit(builders:((t:Style)=>Block[])[],units:'US'|'SI',box:{width:number;height:number},sizes=detailNoteSizes){
 return legibleSizes(sizes).find(k=>stackHeight(builders.flatMap(b=>b(styleAt(k,box.width,units))))<=box.height);
}
/**
 * Stack blocks top-down in a box at the largest text size that fits (the given factors of the 6-unit body text,
 * largest first, none under the lettering minimum).
 */
export function noteStack(builders:((t:Style)=>Block[])[],units:'US'|'SI',box:Box,sizes=detailNoteSizes){
 const legible=legibleSizes(sizes),k=noteFit(builders,units,box,legible),t=styleAt(k??legible[legible.length-1],box.width,units),blocks=builders.flatMap(b=>b(t));
 // Content that still does not fit is marked so set checks report it instead of the sheet failing to draw.
 let svg=k!==undefined?'':'<g data-overflow="notes"/>',y=box.y;for(const b of blocks){svg+=b.render(box.x,y);y+=b.height+2.4;}
 return svg;
}
/** A column that note blocks flow down: its left edge, top and bottom. */
export interface Lane {x:number;top:number;bottom:number}
/**
 * A block placed by flowBlocks: `index` is the block's position in the list, or -1 for the heading of a section
 * restated (CONT.) at the top of the next lane, whose own heading is `section`.
 */
export interface Placement {x:number;y:number;b:Block;lane:number;index:number;section:number}
/**
 * Greedy flow of blocks down lanes in order. A kept block (a heading) stays with the block after it, and a section
 * carried into the next lane restarts there under its heading marked continued. `limit` caps the bottom of every lane
 * (to balance the lanes); with `overflow` whatever does not fit is forced into the last lane. Returns undefined when the
 * blocks do not fit.
 */
export function flowBlocks(blocks:Block[],lanes:Lane[],limit=Infinity,overflow=false):Placement[]|undefined{
 const placed:Placement[]=[];let lane=0,y=lanes[0]?.top??0,section=-1;
 if(!lanes.length)return blocks.length?undefined:[];
 for(let i=0;i<blocks.length;i++){
  // A kept block needs room for the block after it, and a heading over a kept table also for the table's key, so the
  // heading never stays behind alone; a chain taller than a lane falls back to the next block only.
  const b=blocks[i],next=b.keep?blocks[i+1]:undefined,after=b.continued&&next?.keep?blocks[i+2]:undefined,top=lanes[lane].top,bottom=Math.min(limit,lanes[lane].bottom);
  const pair=b.height+(next?2.4+next.height:0),chain=pair+(after?2.4+after.height:0),need=chain<=bottom-top?chain:pair;
  if(b.continued)section=i;
  if(y>top&&y+need>bottom&&lane<lanes.length-1){
   lane++;y=lanes[lane].top;
   if(!b.continued&&section>=0){const c=blocks[section].continued!();placed.push({x:lanes[lane].x,y,b:c,lane,index:-1,section});y+=c.height+2.4;}
  }
  else if(y>top&&y+need>bottom&&!overflow)return undefined;
  if(y+b.height>Math.min(limit,lanes[lane].bottom)&&!overflow)return undefined;
  placed.push({x:lanes[lane].x,y,b,lane,index:i,section});y+=b.height+2.4;
 }
 return placed;
}
