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
/**
 * Stack blocks top-down in a box at the largest text size that fits
 * (factors 1.15 down to 0.8 of the 6-unit body text).
 */
export function noteStack(builders:((t:Style)=>Block[])[],units:'US'|'SI',box:{x:number;y:number;width:number;height:number}){
 const sizes=[1.15,1.05,1,.92,.85,.8,.74,.68];
 for(const [i,k] of sizes.entries()){
  const t:Style={width:box.width,body:6*k,leading:7.8*k,heading:8*k,caps:capsFor(units)},blocks=builders.flatMap(b=>b(t));
  const fits=blocks.reduce((a,b)=>a+b.height+2.4,0)-2.4<=box.height;
  if(!fits&&i<sizes.length-1)continue;
  // Content that still does not fit is marked so set checks report it instead of the sheet failing to draw.
  let svg=fits?'':'<g data-overflow="notes"/>',y=box.y;for(const b of blocks){svg+=b.render(box.x,y);y+=b.height+2.4;}
  return svg;
 }
 return '';
}
