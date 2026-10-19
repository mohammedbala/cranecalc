import {describe,expect,it} from 'vitest';
import {spatialIndex} from '../src/cad/spatial';
import {History,copyBaseCmd,pasteBlockCmd,suggestCommands} from '../src/cad/commandLine';
import {drawScene,isDot,type View} from '../src/cad/render';
import {bbox,type Box,type CadDoc,type Ent} from '../src/cad/model';
import {blank,setup} from './cadHarness';

/** A deterministic scatter of short lines, circles and texts over a 1000 x 1000 area, with a few construction lines. */
function scatter(n:number):CadDoc{
 let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
 const entities:Ent[]=[];
 for(let i=0;i<n;i++){
  const x=rnd()*1000,y=rnd()*1000,id=i+1,k=i%10;
  entities.push(k<7?{id,type:'line',layer:'0',a:[x,y],b:[x+rnd()*5,y+rnd()*5]}:k<9?{id,type:'circle',layer:'0',center:[x,y],radius:rnd()*3}:{id,type:'text',layer:'0',at:[x,y],height:1,value:'T'+i,angle:0,align:0,bold:false});
 }
 entities.push({id:n+1,type:'xline',layer:'0',base:[0,500],dir:[1,0]},{id:n+2,type:'line',layer:'0',a:[0,0],b:[1000,1000]});
 return {...blank(),width:1000,height:1000,entities,nextId:n+3};
}
const overlaps=(a:Box,b:Box)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];

describe('CAD performance: the spatial index',()=>{
 it('returns exactly the objects a linear scan finds, in drawing order',()=>{
  const doc=scatter(5000),idx=spatialIndex(doc.entities,doc);
  for(const q of [[0,0,10,10],[495,495,505,505],[-50,-50,-10,-10],[200,700,260,760],[0,0,1000,1000],[999,999,2000,2000]] as Box[]){
   const want=doc.entities.filter(e=>overlaps(bbox(e,doc),q)).map(e=>e.id);
   expect(idx.query(q).map(e=>e.id)).toEqual(want);
  }
 });
 it('is built once per entity list and rebuilt after a change',()=>{
  const s=setup(scatter(1000)),a=spatialIndex(s.store.doc.entities,s.store.doc);
  expect(spatialIndex(s.store.doc.entities,s.store.doc)).toBe(a);
  s.add({type:'circle',layer:'0',center:[5,5],radius:1});
  const b=spatialIndex(s.store.doc.entities,s.store.doc);expect(b).not.toBe(a);
  expect(b.query([4,4,6,6]).some(e=>e.type==='circle'&&e.center[0]===5)).toBe(true);
 });
 it('picks among 50,000 objects in well under a millisecond a query',()=>{
  const doc=scatter(50000),t0=performance.now(),idx=spatialIndex(doc.entities,doc),built=performance.now()-t0;
  const t1=performance.now();let found=0;for(let i=0;i<2000;i++){const x=(i*37)%1000,y=(i*91)%1000;found+=idx.query([x-1,y-1,x+1,y+1]).length;}
  const per=(performance.now()-t1)/2000;
  expect(found).toBeGreaterThan(0);expect(built).toBeLessThan(3000);expect(per).toBeLessThan(.5);
 });
});

describe('CAD performance: drawing only what is on screen',()=>{
 /** A canvas stand-in that counts path calls. */
 const counter=()=>{const n={paths:0,dots:0,text:0};const ctx=new Proxy({} as Record<string,unknown>,{get:(t,k:string)=>k in t?t[k]:k==='moveTo'||k==='lineTo'||k==='arc'||k==='ellipse'?()=>{n.paths++;}:k==='rect'?()=>{n.dots++;}:k==='fillText'?()=>{n.text++;}:k==='measureText'?()=>({width:1}):()=>{},set:(t,k:string,v)=>{t[k]=v;return true;}});return {ctx:ctx as unknown as CanvasRenderingContext2D,n};};
 it('culls to the view and draws sub-pixel objects as dots',()=>{
  const doc=scatter(20000);
  const zoomed:View={cx:100,cy:100,scale:20,w:800,h:600},all:View={cx:500,cy:500,scale:.1,w:800,h:600};
  const a=counter();drawScene(a.ctx,{doc,view:zoomed,theme:'dark',lwt:false,grid:null});
  const b=counter();drawScene(b.ctx,{doc,view:all,theme:'dark',lwt:false,grid:null});
  expect(a.n.paths).toBeLessThan(2000);
  // Zoomed out, most of the scatter is under a pixel: dots, not geometry or text.
  expect(b.n.dots).toBeGreaterThan(10000);expect(b.n.text).toBeLessThan(500);
  expect(isDot([0,0,1,1],.5)).toBe(true);expect(isDot([0,0,1,1],2)).toBe(false);
 });
});

describe('CAD command line: AutoComplete, history and clipboard commands',()=>{
 it('suggests the alias first, then names that start with and contain the input',()=>{
  expect(suggestCommands('L')[0]).toEqual({name:'LINE',alias:'L'});
  expect(suggestCommands('DIM').map(v=>v.name)).toEqual(expect.arrayContaining(['DIMLINEAR','DIMALIGNED','DIMANGULAR']));
  expect(suggestCommands('TRIM')[0].name).toBe('TRIM');
  expect(suggestCommands('LEN').map(v=>v.name)).toContain('LENGTHEN');
  expect(suggestCommands('100,50')).toEqual([]);expect(suggestCommands('')).toEqual([]);
  expect(suggestCommands('E').length).toBeLessThanOrEqual(8);
 });
 it('recalls earlier input with the arrows, newest first, without repeats in a row',()=>{
  const h=new History();for(const v of ['L','L','C','100,50',''])h.push(v);
  expect(h.recall(-1)).toBe('100,50');expect(h.recall(-1)).toBe('C');expect(h.recall(-1)).toBe('L');expect(h.recall(-1)).toBe('L');
  expect(h.recall(1)).toBe('C');h.reset();expect(h.recall(-1)).toBe('100,50');expect(h.list).toEqual(['L','C','100,50']);
 });
 it('copies with a base point and pastes as a block',()=>{
  const s=setup();s.add({type:'line',layer:'0',a:[1,1],b:[3,1]},{type:'circle',layer:'0',center:[2,2],radius:.5});
  let clip:{ents:import('../src/cad/model').NewEnt[];base:[number,number]}|undefined;
  const c=copyBaseCmd(s.env,s.store.doc.entities,(ents,base)=>{clip={ents,base};});c.point!([1,1]);
  expect(c.done).toBe(true);expect(clip!.base).toEqual([1,1]);
  const p=pasteBlockCmd(s.env,clip!.ents,clip!.base);p.point!([10,10]);
  const d=s.store.doc,ins=d.entities.at(-1)!;
  expect(ins.type).toBe('insert');expect(ins.type==='insert'&&ins.name).toBe('A$C1');expect(ins.type==='insert'&&ins.at).toEqual([10,10]);
  const def=d.blocks!.find(b=>b.name==='A$C1')!;expect(def.entities[0].type==='line'&&def.entities[0].a).toEqual([0,0]);
  // A second paste takes the next name.
  const q=pasteBlockCmd(s.env,clip!.ents,clip!.base);q.point!([20,10]);expect(s.store.doc.blocks!.map(b=>b.name)).toContain('A$C2');
 });
});
