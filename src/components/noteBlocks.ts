import {line,text,wrapToWidth} from './sheetGraphics';

/** Stacked note blocks (headings, paragraphs, numbered notes, tables) measured for flowing on a sheet. */
export interface Block {height:number;keep?:boolean;render:(x:number,y:number)=>string;}
export interface Style {width:number;body:number;leading:number;heading:number;caps:(v:string)=>string;}
const siUnit=/^\(?(k?N|MPa|GPa|mm|m|kN·m|kN-m|N\/mm|kN\/m)[),.;:]*$/;
/** Drawing notes are upper case; SI unit symbols keep their case. */
export const capsFor=(units:'US'|'SI')=>(v:string)=>v.split(/(\s+)/).map(w=>units==='SI'&&siUnit.test(w)?w:w.toUpperCase()).join('');
export const heading=(t:Style,title:string):Block=>({height:t.heading*1.9,keep:true,render:(x,y)=>text(x,y+t.heading,title,t.heading,'start',700)+line([x,y+t.heading*1.36],[x+t.width,y+t.heading*1.36],'divider')});
export function paragraph(t:Style,value:string):Block{const rows=wrapToWidth(t.caps(value),t.width,t.body);return {height:rows.length*t.leading+t.body*.45,render:(x,y)=>rows.map((r,i)=>text(x,y+t.body+i*t.leading,r,t.body)).join('')};}
export function numbered(t:Style,items:string[]):Block[]{const indent=t.body*2.2;return items.map((item,i)=>{const rows=wrapToWidth(t.caps(item),t.width-indent,t.body);return {height:rows.length*t.leading+t.body*.45,render:(x,y)=>text(x,y+t.body,`${i+1}.`,t.body,'start',700)+rows.map((r,j)=>text(x+indent,y+t.body+j*t.leading,r,t.body)).join('')};});}
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
/** Size factors of the 6-unit body text for sheets drawn at content scale 2. */
export const legacyNoteSizes=[1.15,1.05,1,.92,.85,.8,.74,.68];
/** Detail-sheet notes at content scale 1: body text 8.4 down to 6.6 points (0.12 to 0.09 in). */
export const detailNoteSizes=[1.4,1.3,1.2,1.15,1.1];
const styleAt=(k:number,width:number,units:'US'|'SI'):Style=>({width,body:6*k,leading:7.8*k,heading:8*k,caps:capsFor(units)});
const stackHeight=(blocks:Block[])=>blocks.reduce((a,b)=>a+b.height+2.4,0)-2.4;
/** Largest size factor at which the blocks fit the box, or undefined when even the smallest does not. */
export function noteFit(builders:((t:Style)=>Block[])[],units:'US'|'SI',box:{width:number;height:number},sizes=detailNoteSizes){
 return sizes.find(k=>stackHeight(builders.flatMap(b=>b(styleAt(k,box.width,units))))<=box.height);
}
/**
 * Stack blocks top-down in a box at the largest text size that fits
 * (the given factors of the 6-unit body text, largest first).
 */
export function noteStack(builders:((t:Style)=>Block[])[],units:'US'|'SI',box:Box,sizes=legacyNoteSizes){
 const k=noteFit(builders,units,box,sizes),t=styleAt(k??sizes[sizes.length-1],box.width,units),blocks=builders.flatMap(b=>b(t));
 // Content that still does not fit is marked so set checks report it instead of the sheet failing to draw.
 let svg=k!==undefined?'':'<g data-overflow="notes"/>',y=box.y;for(const b of blocks){svg+=b.render(box.x,y);y+=b.height+2.4;}
 return svg;
}
