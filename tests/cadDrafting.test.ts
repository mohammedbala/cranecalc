import {describe,expect,it} from 'vitest';
import {bulgeArc,bulgePoint,bulgeThrough,ellipseParam,ellipsePoint,splinePoint,splineRange,splineThrough,splitSpline} from '../src/cad/curves';
import {
 bbox,breakEnt,curveLength,explodeEnt,intersections,mirroring,offsetEnt,pointAt,transformEnt,trimEnt,
 type Ent,type Pt,
} from '../src/cad/model';
import {docDxfEntities,docToSvg} from '../src/cad/convert';
import {parseCadDoc} from '../src/cad/validate';
import {blank,near,setup} from './cadHarness';

const line=(id:number,a:Pt,b:Pt):Ent=>({id,type:'line',layer:'0',a,b});
const typed=<T extends Ent['type']>(list:Ent[],t:T)=>list.filter((e):e is Ent&{type:T}=>e.type===t) as (Extract<Ent,{type:T}>&Ent&{type:T})[];

describe('CAD curves: bulges, ellipses and splines',()=>{
 it('reads polyline bulges as arcs',()=>{
  const k=bulgeArc([0,0],[2,0],1)!;near(k.c,[1,0]);expect(k.r).toBeCloseTo(1,12);expect(k.sweep).toBeCloseTo(180,9);
  near(bulgePoint([0,0],[2,0],1,.5),[1,-1]);
  expect(bulgeThrough([0,0],[1,-1],[2,0])).toBeCloseTo(1,12);expect(bulgeThrough([0,0],[1,1],[2,0])).toBeCloseTo(-1,12);
 });
 it('fits a spline through its points and splits it without moving it',()=>{
  const fit:Pt[]=[[0,0],[1,2],[3,1],[4,3]],s=splineThrough(fit,false)!;
  fit.forEach((p,i)=>near(splinePoint(s,i),p,1e-9));
  const [a,b]=splitSpline(s,1.5);near(splinePoint(a!,splineRange(a!)[1]),splinePoint(b!,splineRange(b!)[0]),1e-9);
  near(splinePoint(a!,.7),splinePoint(s,.7),1e-9);near(splinePoint(b!,2.2),splinePoint(s,2.2),1e-9);
  const closed=splineThrough(fit,true)!;near(splinePoint(closed,splineRange(closed)[1]),fit[0],1e-9);
 });
 it('finds ellipse parameters',()=>{
  const e={center:[1,1] as Pt,major:[3,0] as Pt,ratio:.5,start:0,end:360};
  for(const t of [10,95,200,333])expect(ellipseParam(e,ellipsePoint(e,t))).toBeCloseTo(t,6);
 });
});

describe('CAD model: the new entities',()=>{
 const arcPoly:Ent={id:1,type:'poly',layer:'0',points:[[0,0],[2,0],[2,2]],closed:false,bulges:[1,0,0]};
 it('bulged polylines: extents, intersections, trim, offset and explode',()=>{
  expect(bbox(arcPoly)[1]).toBeCloseTo(-1,9);
  expect(intersections(arcPoly,line(2,[-1,-.5],[3,-.5]))).toHaveLength(2);
  const cut=line(3,[1,-2],[1,2]),[left]=trimEnt(arcPoly,[1.9,-.4],[arcPoly,cut])!;
  // The left quarter of the arc is left, still an arc.
  expect(left.type==='poly'&&left.points.length).toBe(2);
  if(left.type==='poly'){near(left.points[1],[1,-1],1e-9);expect(left.bulges?.[0]).toBeCloseTo(Math.tan(Math.PI/8),9);}
  const off=offsetEnt(arcPoly,.25,[1,-2])!;expect(off.type==='poly'&&off.bulges?.[0]).toBeGreaterThan(0);
  if(off.type==='poly')near(off.points[0],[-.25,0],1e-9);
  const parts=explodeEnt(arcPoly,blank())!;expect(parts.map(p=>p.type)).toEqual(['arc','line']);
  expect(curveLength(arcPoly)).toBeCloseTo(Math.PI+2,9);
 });
 it('ellipses: intersections, trim to an elliptical arc, mirror',()=>{
  const el:Ent={id:1,type:'ellipse',layer:'0',center:[0,0],major:[2,0],ratio:.5,start:0,end:360};
  const xs=intersections(el,line(2,[-5,0],[5,0])).sort((a,b)=>a[0]-b[0]);near(xs[0],[-2,0],1e-6);near(xs[1],[2,0],1e-6);
  const [arc]=trimEnt(el,[0,1],[el,line(2,[-5,0],[5,0])])!;
  expect(arc.type).toBe('ellipse');if(arc.type==='ellipse'){expect(arc.start).toBeCloseTo(180,4);expect(arc.end).toBeCloseTo(0,4);}
  const half:Ent={...el,start:0,end:90},m=transformEnt(half,mirroring([0,-1],[0,1]));
  if(m.type==='ellipse'){near(pointAt(m,0),[0,1],1e-9);near(pointAt(m,90),[2,0].map(v=>-v) as Pt,1e-9);}
 });
 it('splines and construction lines trim and break',()=>{
  const g=splineThrough([[0,0],[2,2],[4,0]],false)!,sp:Ent={id:1,type:'spline',layer:'0',...g,fit:[[0,0],[2,2],[4,0]],closed:false};
  const parts=trimEnt(sp,[2,2],[sp,line(2,[0,1],[4,1])])!;expect(parts).toHaveLength(2);
  expect(parts.every(p=>p.type==='spline')).toBe(true);
  const xl:Ent={id:3,type:'xline',layer:'0',base:[0,0],dir:[1,0]};
  const rays=trimEnt(xl,[0,0],[xl,line(4,[-1,-1],[-1,1]),line(5,[1,-1],[1,1])])!;expect(rays.map(r=>r.type)).toEqual(['ray','ray']);
  const c:Ent={id:6,type:'circle',layer:'0',center:[0,0],radius:1},[a]=breakEnt(c,0,90)!;
  expect(a).toMatchObject({type:'arc',start:90,end:0});
 });
 it('validates, draws and exports every new entity',()=>{
  const doc=blank(),g=splineThrough([[1,1],[2,3],[4,2]],false)!;
  doc.entities=[
   {id:1,type:'poly',layer:'0',points:[[1,1],[3,1],[3,3]],closed:false,bulges:[.5,0,0],color:1,ltype:'DASHDOT',weight:50},
   {id:2,type:'ellipse',layer:'0',center:[10,10],major:[3,1],ratio:.4,start:0,end:360},
   {id:3,type:'ellipse',layer:'0',center:[10,5],major:[2,0],ratio:.5,start:30,end:200},
   {id:4,type:'spline',layer:'0',...g,fit:[[1,1],[2,3],[4,2]],closed:false},
   {id:5,type:'xline',layer:'0',base:[18,12],dir:[Math.SQRT1_2,Math.SQRT1_2]},{id:6,type:'ray',layer:'0',base:[5,5],dir:[1,0]},
  ];doc.nextId=7;doc.groups=[{name:'G1',ids:[1,2]}];
  const back=parseCadDoc(JSON.parse(JSON.stringify(doc)))!;expect(back.entities).toHaveLength(6);expect(back.groups?.[0].ids).toEqual([1,2]);
  expect(back.entities[0]).toMatchObject({color:1,ltype:'DASHDOT',weight:50,bulges:[.5,0,0]});
  const bad=JSON.parse(JSON.stringify(doc));bad.entities[3].knots.pop();expect(parseCadDoc(bad)).toBeUndefined();
  const svg=docToSvg(doc);expect(svg).toContain('<ellipse');expect(svg).toMatch(/A[\d.]+,[\d.]+ 0 0 0/);expect(svg).toContain('stroke-dasharray');
  const dxf=docDxfEntities(doc);expect(dxf.map(e=>e.type)).toEqual(['poly','poly','poly','poly','line','line']);
 });
});

describe('CAD draw commands',()=>{
 it('ARC: start-center-end, start-center-angle, start-end-center, start-end-radius, direction, center first, continue',()=>{
  const {store,run}=setup();
  run('ARC',[1,0],'C',[0,0],[0,1]);run('ARC',[1,0],'C',[0,0],'A','90');run('ARC',[1,0],'E',[-1,0],[0,0]);run('ARC',[1,0],'E',[-1,0],'R','1');
  run('ARC',[0,0],'E',[2,0],'D','90');run('ARC','C',[0,0],[0,2],[-2,0]);
  const arcs=typed(store.doc.entities,'arc');
  expect(arcs.map(a=>[Math.round(a.start),Math.round(a.end),+a.radius.toFixed(9)])).toEqual([[0,90,1],[0,90,1],[0,180,1],[0,180,1],[0,180,1],[90,180,2]]);
  near(arcs[4].center,[1,0]);
  run('LINE',[5,0],[6,0],null);run('ARC',null,[7,1]);
  const last=store.doc.entities.at(-1)!;expect(last.type).toBe('arc');if(last.type==='arc'){near(last.center,[6,1]);expect(last.radius).toBeCloseTo(1,9);}
 });
 it('ELLIPSE by axis, by center and as an arc; SPLINE; POLYGON; XLINE; RAY',()=>{
  const {store,run}=setup();
  run('ELLIPSE',[-2,0],[2,0],'1');run('ELLIPSE','C',[0,0],[0,1],'3');run('ELLIPSE','A',[-2,0],[2,0],'1','0','90');
  const [a,b,c]=typed(store.doc.entities,'ellipse');
  expect(a).toMatchObject({center:[0,0],major:[2,0],ratio:.5});
  expect(Math.hypot(...b.major)).toBeCloseTo(3,9);expect(b.ratio).toBeCloseTo(1/3,9);
  expect(c.start).toBeCloseTo(180,6);expect(c.end).toBeCloseTo(270,6);
  run('SPLINE',[0,0],[1,1],[2,0],[3,1],null);
  const sp=typed(store.doc.entities,'spline')[0];expect(sp.fit).toHaveLength(4);near(splinePoint(sp,2),[2,0],1e-9);
  run('POLYGON','6',[0,0],'I','1');run('POLYGON','4','E',[0,0],[1,0]);
  const [hex,sq]=typed(store.doc.entities,'poly');expect(hex.points).toHaveLength(6);near(hex.points[0],[1,0]);
  sq.points.forEach((p,i)=>near(p,([[0,0],[1,0],[1,1],[0,1]] as Pt[])[i],1e-9));
  run('XLINE','H',[0,5],[0,6],null);run('RAY',[1,1],[2,2],null);
  expect(store.doc.entities.flatMap(x=>x.type==='xline'?[x.dir]:[])).toEqual([[1,0],[1,0]]);
  const r=store.doc.entities.find(x=>x.type==='ray');near(r?.type==='ray'?r.dir:[0,0],[Math.SQRT1_2,Math.SQRT1_2]);
 });
});

describe('CAD modify commands',()=>{
 it('FILLET two lines with a radius, to a corner, and every corner of a polyline',()=>{
  const {store,run,add}=setup();
  const [l1,l2]=add({type:'line',layer:'0',a:[0,0],b:[10,0]},{type:'line',layer:'0',a:[0,0],b:[0,10]});
  run('FILLET','R','2',{pick:[5,0]},{pick:[0,5]});
  expect(store.get(l1)).toMatchObject({a:[2,0],b:[10,0]});expect(store.get(l2)).toMatchObject({a:[0,2],b:[0,10]});
  const arc=typed(store.doc.entities,'arc')[0];near(arc.center,[2,2]);expect([arc.start,arc.end].map(Math.round)).toEqual([180,270]);
  const s2=setup(),[m1,m2]=s2.add({type:'line',layer:'0',a:[1,0],b:[10,0]},{type:'line',layer:'0',a:[0,1],b:[0,10]});
  s2.run('FILLET','R','0',{pick:[5,0]},{pick:[0,5]});
  expect(s2.store.get(m1)).toMatchObject({a:[0,0]});expect(s2.store.get(m2)).toMatchObject({a:[0,0]});
  const s3=setup(),[box]=s3.add({type:'poly',layer:'0',points:[[0,0],[4,0],[4,4],[0,4]],closed:true});
  s3.run('FILLET','R','1','P',{pick:[2,0]});
  const p=s3.store.get(box)!;expect(p.type==='poly'&&p.points.length).toBe(8);expect(p.type==='poly'&&p.bulges?.filter(b=>b).length).toBe(4);
  expect(curveLength(p)).toBeCloseTo(4*2+2*Math.PI,9);
 });
 it('CHAMFER two lines by distances',()=>{
  const {store,run,add}=setup();
  const [l1,l2]=add({type:'line',layer:'0',a:[0,0],b:[10,0]},{type:'line',layer:'0',a:[0,0],b:[0,10]});
  run('CHAMFER','D','1','2',{pick:[5,0]},{pick:[0,5]});
  expect(store.get(l1)).toMatchObject({a:[1,0]});expect(store.get(l2)).toMatchObject({a:[0,2]});
  expect(store.doc.entities.at(-1)).toMatchObject({type:'line',a:[1,0],b:[0,2]});
 });
 it('STRETCH moves what the crossing window holds',()=>{
  const {store,run,add,setWindow}=setup();
  const [r,c]=add({type:'poly',layer:'0',points:[[0,0],[4,0],[4,2],[0,2]],closed:true},{type:'circle',layer:'0',center:[4,1],radius:.2});
  store.select([r,c]);setWindow([3,-1,5,3]);run('STRETCH',[0,0],[2,0]);
  expect(store.get(r)).toMatchObject({points:[[0,0],[6,0],[6,2],[0,2]]});expect(store.get(c)).toMatchObject({center:[6,1]});
 });
 it('ARRAYRECT, ARRAYPOLAR and ARRAYPATH copy the selection',()=>{
  const {store,run,add}=setup();
  const [c]=add({type:'circle',layer:'0',center:[0,0],radius:.5});
  store.select([c]);run('ARRAYRECT','3','2','2','3');
  expect(typed(store.doc.entities,'circle').map(e=>e.center)).toEqual([[0,0],[2,0],[4,0],[0,3],[2,3],[4,3]]);
  const s2=setup(),[d]=s2.add({type:'circle',layer:'0',center:[1,0],radius:.1});
  s2.store.select([d]);s2.run('ARRAYPOLAR',[0,0],'4','360','Y');
  const cs=typed(s2.store.doc.entities,'circle').map(e=>e.center);expect(cs).toHaveLength(4);near(cs[1],[0,1]);near(cs[2],[-1,0]);
  const s3=setup(),[e,]=s3.add({type:'circle',layer:'0',center:[0,0],radius:.1},{type:'line',layer:'0',a:[0,0],b:[10,0]});
  s3.store.select([e]);s3.run('ARRAYPATH',{pick:[5,0]},'3','N');
  expect(typed(s3.store.doc.entities,'circle').map(x=>x.center.map(v=>+v.toFixed(9)))).toEqual([[0,0],[5,0],[10,0]]);
 });
 it('BREAK between two points and at a point',()=>{
  const {store,run,add}=setup();
  add({type:'line',layer:'0',a:[0,0],b:[10,0]});
  run('BREAK',{pick:[2,0]},[5,0]);
  expect(typed(store.doc.entities,'line').map(l=>[l.a[0],l.b[0]])).toEqual([[0,2],[5,10]]);
  run('BREAK',{pick:[7,0]},'@');
  expect(typed(store.doc.entities,'line').map(l=>[l.a[0],l.b[0]])).toEqual([[0,2],[5,7],[7,10]]);
 });
 it('JOIN collinear lines, arcs on one circle, and a chain into a polyline',()=>{
  const {store,run,add}=setup();
  store.select(add({type:'line',layer:'0',a:[0,0],b:[1,0]},{type:'line',layer:'0',a:[1,0],b:[2.5,0]}));run('JOIN');
  expect(typed(store.doc.entities,'line')).toEqual([expect.objectContaining({a:[0,0],b:[2.5,0]})]);
  const s2=setup();s2.store.select(s2.add({type:'arc',layer:'0',center:[0,0],radius:1,start:0,end:90},{type:'arc',layer:'0',center:[0,0],radius:1,start:90,end:180}));s2.run('JOIN');
  expect(s2.store.doc.entities).toEqual([expect.objectContaining({type:'arc',start:0,end:180})]);
  const s3=setup();s3.store.select(s3.add({type:'line',layer:'0',a:[0,0],b:[2,0]},{type:'arc',layer:'0',center:[2,1],radius:1,start:270,end:90},{type:'line',layer:'0',a:[0,2],b:[2,2]}));s3.run('JOIN');
  const [p]=s3.store.doc.entities;expect(p.type).toBe('poly');if(p.type==='poly'){expect(p.points).toHaveLength(4);expect(p.bulges?.filter(b=>b)).toHaveLength(1);expect(curveLength(p)).toBeCloseTo(4+Math.PI,9);}
 });
 it('LENGTHEN by delta, percent and total',()=>{
  const {store,run,add}=setup();
  const [l]=add({type:'line',layer:'0',a:[0,0],b:[10,0]});
  run('LENGTHEN','DE','2',{pick:[9,0]},null);expect(store.get(l)).toMatchObject({b:[12,0]});
  run('LENGTHEN','P','50',{pick:[11,0]},null);expect(store.get(l)).toMatchObject({b:[6,0]});
  run('LENGTHEN','T','4',{pick:[.5,0]},null);const e=store.get(l)!;expect(e.type==='line'&&e.a[0]).toBeCloseTo(2,9);
  const [a]=add({type:'arc',layer:'0',center:[20,0],radius:1,start:0,end:90});
  run('LENGTHEN','DE',String(Math.PI/2),{pick:[20,1]},null);expect((store.get(a) as Extract<Ent,{type:'arc'}>).end).toBeCloseTo(180,9);
 });
 it('ALIGN by two point pairs with scaling',()=>{
  const {store,run,add}=setup();
  const [l]=add({type:'line',layer:'0',a:[0,0],b:[1,0]});
  store.select([l]);run('ALIGN',[0,0],[5,5],[1,0],[5,7],'Y');
  const e=store.get(l)!;if(e.type==='line'){near(e.a,[5,5]);near(e.b,[5,7]);}
 });
 it('PEDIT turns a line into a polyline, joins, closes, fits and reverses',()=>{
  const {store,run,add}=setup();
  add({type:'line',layer:'0',a:[0,0],b:[2,0]},{type:'line',layer:'0',a:[2,0],b:[2,2]});
  run('PEDIT',{pick:[1,0]},'Y','J',{pick:[2,1]},null,'C','X');
  const [p]=store.doc.entities;expect(p).toMatchObject({type:'poly',closed:true,points:[[0,0],[2,0],[2,2]]});
  run('PEDIT',{pick:[0,0]},'F','X');
  const f=store.doc.entities[0];expect(f.type==='poly'&&f.points.length).toBe(6);expect(f.type==='poly'&&f.bulges?.every(b=>Number.isFinite(b))).toBe(true);
  run('PEDIT',{pick:[0,0]},'D','R','X');const r=store.doc.entities[0];expect(r.type==='poly'&&r.bulges).toBeUndefined();
 });
 it('MATCHPROP copies layer, color, linetype and lineweight',()=>{
  const {store,run,add}=setup();
  const [,b]=add({type:'line',layer:'0',a:[0,0],b:[1,0],color:1,ltype:'DASHED',weight:50},{type:'line',layer:'0',a:[0,2],b:[1,2],color:3});
  run('MATCHPROP',{pick:[.5,0]},{pick:[.5,2]},null);
  expect(store.get(b)).toMatchObject({color:1,ltype:'DASHED',weight:50});
 });
 it('TRIM and EXTEND work on arcs and ellipses',()=>{
  const {store,run,add}=setup();
  const [a]=add({type:'arc',layer:'0',center:[0,0],radius:1,start:0,end:45},{type:'line',layer:'0',a:[-2,-2],b:[2,2]},{type:'line',layer:'0',a:[0,-2],b:[0,2]});
  run('EXTEND',{pick:[Math.cos(.7),Math.sin(.7)]},null);expect((store.get(a) as Extract<Ent,{type:'arc'}>).end).toBeCloseTo(90,6);
  const [el]=add({type:'ellipse',layer:'0',center:[10,0],major:[2,0],ratio:.5,start:0,end:360},{type:'line',layer:'0',a:[10,-3],b:[10,3]});
  run('TRIM',{pick:[8,0]},null);
  const left=store.doc.entities.filter(e=>e.type==='ellipse');expect(left).toHaveLength(1);expect(left[0].id).not.toBe(el);
 });
});
