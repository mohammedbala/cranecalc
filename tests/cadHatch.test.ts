import {describe,expect,it} from 'vitest';
import {fillTrapezoids,findBoundary,hatchArea,hatchSegments,insideLoops,loopArea} from '../src/cad/hatch';
import {boundaryAt} from '../src/cad/drawCommands';
import {explodeEnt,rotation,mirroring,transformEnt,type Ent,type Pt} from '../src/cad/model';
import {docDxfEntities,docToSvg} from '../src/cad/convert';
import {parseCadDoc} from '../src/cad/validate';
import {blank,setup} from './cadHarness';

const sq=(x:number,y:number,s:number):Pt[]=>[[x,y],[x+s,y],[x+s,y+s],[x,y+s]];
const total=(segs:[Pt,Pt][])=>segs.reduce((t,[a,b])=>t+Math.hypot(b[0]-a[0],b[1]-a[1]),0);

describe('CAD hatch patterns',()=>{
 it('ANSI31 fills a square with 1/8" spaced lines, all inside',()=>{
  const segs=hatchSegments({loops:[sq(0,0,1)],pattern:'ANSI31',scale:1,angle:0},1);
  // Total line length is the area over the spacing.
  expect(Math.abs(total(segs)-1/.125)).toBeLessThan(.15);
  for(const [a,b] of segs)for(const p of [a,b])expect(p[0]>=-1e-9&&p[0]<=1+1e-9&&p[1]>=-1e-9&&p[1]<=1+1e-9).toBe(true);
 });
 it('leaves islands open and scales with the drawing units',()=>{
  const loops=[sq(0,0,4),sq(1,1,2)];
  expect(total(hatchSegments({loops,pattern:'ANSI31',scale:1,angle:0},1))).toBeCloseTo(12/.125,0);
  expect(total(hatchSegments({loops:[sq(0,0,25.4)],pattern:'ANSI31',scale:1,angle:30},25.4))).toBeCloseTo(25.4*25.4/(.125*25.4),0);
  expect(hatchArea(loops)).toBeCloseTo(12,9);
 });
 it('dashed families are shorter than continuous ones; solid fills tile the area',()=>{
  const cont=total(hatchSegments({loops:[sq(0,0,2)],pattern:'ANSI37',scale:1,angle:0},1)),dashed=total(hatchSegments({loops:[sq(0,0,2)],pattern:'ANSI38',scale:1,angle:0},1));
  expect(dashed).toBeLessThan(cont);expect(dashed).toBeGreaterThan(cont*.6);
  const tr=fillTrapezoids([sq(0,0,4),sq(1,1,2)]);expect(tr.reduce((s,t)=>s+Math.abs(loopArea(t)),0)).toBeCloseTo(12,9);
 });
});

describe('CAD hatch boundaries',()=>{
 it('finds the smallest region around a point from crossing lines',()=>{
  const segs:[Pt,Pt][]=[[[0,1],[10,1]],[[0,4],[10,4]],[[2,0],[2,6]],[[7,0],[7,6]],[[5,2],[5,3]]];
  const loop=findBoundary([3,2],segs)!;expect(Math.abs(loopArea(loop))).toBeCloseTo(15,9);
  expect(findBoundary([1,2],segs)).toBeUndefined();
 });
 it('takes closed objects inside as islands',()=>{
  const ents:Ent[]=[{id:1,type:'poly',layer:'0',points:sq(0,0,10),closed:true},{id:2,type:'circle',layer:'0',center:[5,5],radius:1},{id:3,type:'line',layer:'0',a:[10,5],b:[12,5]}];
  const loops=boundaryAt([2,2],ents)!;expect(loops).toHaveLength(2);
  expect(insideLoops([5,5],loops)).toBe(false);expect(insideLoops([2,2],loops)).toBe(true);
  expect(boundaryAt([5,5],ents)).toHaveLength(1);
 });
});

describe('HATCH command and the hatch entity',()=>{
 it('hatches by internal point, by selected objects, and solid',()=>{
  const {store,run,add}=setup();
  add({type:'poly',layer:'0',points:sq(0,0,4),closed:true},{type:'circle',layer:'0',center:[2,2],radius:.5});
  run('HATCH',[.5,.5],null);
  const h=store.doc.entities.at(-1)!;expect(h).toMatchObject({type:'hatch',pattern:'ANSI31',scale:1});expect(h.type==='hatch'&&h.loops).toHaveLength(2);
  run('HATCH','P','SOLID','S',{pick:[2,2.5]},null,null);
  const s=store.doc.entities.at(-1)!;expect(s).toMatchObject({type:'hatch',pattern:'SOLID'});
  run('HATCH','ANSI37','SC','2','A','15',[3.9,.1],null);
  expect(store.doc.entities.at(-1)).toMatchObject({pattern:'ANSI37',scale:2,angle:15});
 });
 it('rotates with its pattern, explodes to lines, and round-trips through validation, SVG and DXF',()=>{
  const h:Ent={id:1,type:'hatch',layer:'0',loops:[sq(0,0,2)],pattern:'ANSI31',scale:1,angle:0};
  expect(transformEnt(h,rotation([0,0],30))).toMatchObject({angle:30});expect(transformEnt(h,mirroring([0,0],[0,1]))).toMatchObject({angle:0});
  expect(explodeEnt(h,blank())!.every(p=>p.type==='line')).toBe(true);
  const doc=blank();doc.entities=[h,{id:2,type:'hatch',layer:'0',loops:[sq(5,5,2),sq(5.5,5.5,1)],pattern:'SOLID',scale:1,angle:0}];doc.nextId=3;
  expect(parseCadDoc(JSON.parse(JSON.stringify(doc)))?.entities).toHaveLength(2);
  const bad=JSON.parse(JSON.stringify(doc));bad.entities[0].pattern='NOPE';expect(parseCadDoc(bad)).toBeUndefined();
  const svg=docToSvg(doc);expect(svg).toContain('fill-rule="evenodd"');
  const dxf=docDxfEntities(doc);expect(dxf.filter(e=>e.type==='solid').length).toBeGreaterThan(1);expect(dxf.filter(e=>e.type==='line').length).toBeGreaterThan(10);
 });
});
