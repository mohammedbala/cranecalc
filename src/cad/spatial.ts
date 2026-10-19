/**
 * A spatial index over a drawing's objects: a uniform grid over their extents, built once per entity list (lists are
 * immutable, so a commit makes a new one) and queried by box for picking, snapping, window selection and culling.
 * Objects whose extents cover a large part of the drawing (construction lines, borders) sit in a list of their own
 * that every query returns, so a cell never holds the whole drawing.
 */
import type {Box,Ent} from './model';
import type {Ctx} from './annotation';
import {cachedBox} from './render';

export interface SpatialIndex{
 /** The objects whose extents overlap the box (each once, in drawing order). */
 query(b:Box):Ent[];
 size:number;
}
interface Grid extends SpatialIndex{ctx:unknown[]}
const cache=new WeakMap<Ent[],Grid>();
const finite=(b:Box)=>b.every(Number.isFinite);

/** The index of a list of objects (cached by the list; rebuilt when the blocks or styles that size them change). */
export function spatialIndex(ents:Ent[],doc:Ctx):SpatialIndex{
 const ctx=[doc.blocks,doc.textStyles,doc.dimStyles];
 const hit=cache.get(ents);if(hit&&hit.ctx.every((v,i)=>v===ctx[i]))return hit;
 const g=build(ents,doc,ctx);cache.set(ents,g);return g;
}
function build(ents:Ent[],doc:Ctx,ctx:unknown[]):Grid{
 const boxes=ents.map(e=>cachedBox(e,doc));
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const b of boxes)if(finite(b)){x0=Math.min(x0,b[0]);y0=Math.min(y0,b[1]);x1=Math.max(x1,b[2]);y1=Math.max(y1,b[3]);}
 // Small drawings need no grid: a linear scan is as quick.
 const n=ents.length,w=x1-x0,h=y1-y0;
 if(n<256||!(w>0)||!(h>0)){
  return {ctx,size:n,query:q=>ents.filter((_,i)=>overlap(boxes[i],q))};
 }
 const side=Math.max(4,Math.min(512,Math.round(Math.sqrt(n/2)))),nx=Math.max(1,Math.round(side*Math.sqrt(w/h))),ny=Math.max(1,Math.round(side*Math.sqrt(h/w)));
 const cw=w/nx,ch=h/ny,cells:number[][]=Array.from({length:nx*ny},()=>[]),big:number[]=[];
 const cx=(x:number)=>Math.min(nx-1,Math.max(0,Math.floor((x-x0)/cw))),cy=(y:number)=>Math.min(ny-1,Math.max(0,Math.floor((y-y0)/ch)));
 const limit=Math.max(16,nx*ny/16);
 boxes.forEach((b,i)=>{
  if(!finite(b)){big.push(i);return;}
  const i0=cx(b[0]),i1=cx(b[2]),j0=cy(b[1]),j1=cy(b[3]);
  if((i1-i0+1)*(j1-j0+1)>limit){big.push(i);return;}
  for(let j=j0;j<=j1;j++)for(let k=i0;k<=i1;k++)cells[j*nx+k].push(i);
 });
 const seen=new Uint32Array(n);let stamp=0;
 return {ctx,size:n,query(q){
  if(++stamp===0xffffffff){seen.fill(0);stamp=1;}
  const out:number[]=[];
  for(const i of big)if(overlap(boxes[i],q)){seen[i]=stamp;out.push(i);}
  if(q[2]>=x0&&q[0]<=x1&&q[3]>=y0&&q[1]<=y1){
   const i0=cx(q[0]),i1=cx(q[2]),j0=cy(q[1]),j1=cy(q[3]);
   for(let j=j0;j<=j1;j++)for(let k=i0;k<=i1;k++)for(const i of cells[j*nx+k])if(seen[i]!==stamp){seen[i]=stamp;if(overlap(boxes[i],q))out.push(i);}
  }
  out.sort((a,b)=>a-b);return out.map(i=>ents[i]);
 }};
}
const overlap=(a:Box,b:Box)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
