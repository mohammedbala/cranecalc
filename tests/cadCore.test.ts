import {describe,expect,it} from 'vitest';
import {calculate} from '../src/engine/calculate';
import {demonstrationProject} from '../src/engine/demonstration';
import {drawingSheetSet} from '../src/components/planSheet';
import {engineeringSketches} from '../src/components/drafting';
import {sheetEntities,sheetsDxf} from '../src/components/sheetDxf';
import {
 arcPoint,dimGeometry,dist,explodeEnt,extendEnt,formatLength,intersections,mirroring,offsetEnt,parseLength,parsePoint,
 rotation,stretchGrip,textBox,transformEnt,translation,trimEnt,type CadDoc,type Ent,type Pt,
} from '../src/cad/model';
import {docFromSheet,docFromSketch,docToDxf,docToSvg} from '../src/cad/convert';
import {CadStore} from '../src/cad/store';

const near=(a:Pt,b:Pt,tol=1e-9)=>expect(dist(a,b)).toBeLessThan(tol);
const doc=(entities:Ent[]):CadDoc=>({key:'T',title:'Test',unit:'in',display:'US',realPerUnit:25.4,width:36,height:24,svgScale:1/72,layers:[{name:'0',color:7,ltype:'Continuous',weight:25,visible:true,locked:false}],entities,nextId:entities.length+1});
const line=(id:number,a:Pt,b:Pt):Ent=>({id,type:'line',layer:'0',a,b});

describe('CAD editor: typed lengths and points',()=>{
 it('reads decimals, fractions and feet-inches',()=>{
  expect(parseLength('12')).toBe(12);expect(parseLength('-3.5')).toBe(-3.5);expect(parseLength('3/4')).toBe(.75);
  expect(parseLength('1-1/2')).toBe(1.5);expect(parseLength('1 1/2')).toBe(1.5);expect(parseLength(`2'6"`)).toBe(30);
  expect(parseLength(`2'-6 1/2"`)).toBe(30.5);expect(parseLength('abc')).toBeUndefined();
 });
 it('reads absolute, relative, polar and direct-distance points',()=>{
  near(parsePoint('3,4')!,[3,4]);near(parsePoint('@1,2',[3,4])!,[4,6]);
  near(parsePoint('@2<90',[1,1])!,[1,3]);near(parsePoint('5',[0,0],[10,0])!,[5,0]);
  expect(parsePoint('x,1')).toBeUndefined();
 });
 it('writes dimensions in feet-inches to 1/16 in and millimeters',()=>{
  expect(formatLength(16*25.4,'US')).toBe(`1'-4"`);expect(formatLength(1.5*25.4,'US')).toBe(`1 1/2"`);
  expect(formatLength(25.4*(24+5/16),'US')).toBe(`2'-0 5/16"`);expect(formatLength(1234.4,'SI')).toBe('1234');
 });
});

describe('CAD editor: geometry',()=>{
 it('finds line, circle and arc intersections',()=>{
  expect(intersections(line(1,[0,0],[2,2]),line(2,[0,2],[2,0])).map(p=>p.map(v=>+v.toFixed(9)))).toEqual([[1,1]]);
  const c:Ent={id:3,type:'circle',layer:'0',center:[0,0],radius:1};
  expect(intersections(line(1,[-2,0],[2,0]),c)).toHaveLength(2);
  const arc:Ent={id:4,type:'arc',layer:'0',center:[0,0],radius:1,start:0,end:90};
  expect(intersections(line(1,[-2,0.5],[2,0.5]),arc)).toHaveLength(1);
 });
 it('trims the picked part of a line between its cutting edges',()=>{
  const target=line(1,[0,0],[10,0]),cuts=[line(2,[3,-1],[3,1]),line(3,[7,-1],[7,1])];
  const pieces=trimEnt(target,[5,0.1],[target,...cuts])!;
  expect(pieces).toHaveLength(2);
  expect(pieces.map(p=>p.type==='line'?[p.a[0],p.b[0]]:[])).toEqual([[0,3],[7,10]]);
  // An end piece: only one side is left.
  expect(trimEnt(target,[9,0],[target,...cuts])!.map(p=>p.type==='line'?[p.a[0],p.b[0]]:[])).toEqual([[0,7]]);
 });
 it('trims a circle to an arc and a closed polyline to an open one',()=>{
  const c:Ent={id:1,type:'circle',layer:'0',center:[0,0],radius:1},cut=line(2,[-2,0],[2,0]);
  const [arc]=trimEnt(c,[0,1],[c,cut])!;expect(arc.type).toBe('arc');
  if(arc.type==='arc'){near(arcPoint(arc,arc.start),[-1,0],1e-6);near(arcPoint(arc,arc.end),[1,0],1e-6);}
  const box:Ent={id:3,type:'poly',layer:'0',closed:true,points:[[0,0],[4,0],[4,4],[0,4]]},knife=line(4,[2,-1],[2,5]);
  const [open]=trimEnt(box,[3,0],[box,knife])!;
  // The left half is left, open at the knife: (2,4) to (0,4) to (0,0) to (2,0).
  expect(open).toMatchObject({type:'poly',closed:false,points:[[2,4],[0,4],[0,0],[2,0]]});
 });
 it('extends a line to the nearest boundary ahead',()=>{
  const e=extendEnt(line(1,[0,0],[1,0]),[0.9,0],[line(2,[5,-1],[5,1]),line(3,[3,-1],[3,1])])!;
  expect(e.type==='line'&&e.b).toEqual([3,0]);
 });
 it('offsets lines, circles and closed polylines to the picked side',()=>{
  const o=offsetEnt(line(1,[0,0],[10,0]),2,[5,-3])!;expect(o.type==='line'&&[o.a,o.b]).toEqual([[0,-2],[10,-2]]);
  const big=offsetEnt({id:2,type:'poly',layer:'0',closed:true,points:[[0,0],[4,0],[4,4],[0,4]]},1,[5,2])!;
  expect(big.type==='poly'&&big.points.map(p=>p.map(v=>+v.toFixed(9)))).toEqual([[-1,-1],[5,-1],[5,5],[-1,5]]);
  expect(offsetEnt({id:3,type:'circle',layer:'0',center:[0,0],radius:2},1,[0,0.5])).toMatchObject({radius:1});
 });
 it('rotates and mirrors entities; mirrored text still reads left to right',()=>{
  const r=transformEnt(line(1,[0,0],[1,0]),rotation([0,0],90));expect(r.type==='line'&&r.b.map(v=>+v.toFixed(9))).toEqual([0,1]);
  const t:Ent={id:2,type:'text',layer:'0',at:[1,0],height:.125,value:'NOTE',angle:0,align:0,bold:false};
  const m=transformEnt(t,mirroring([0,-1],[0,1]));
  expect(m.type==='text'&&m.angle).toBe(0);
  // The mirrored box covers the reflected box of the original.
  const before=textBox(t).map(p=>-p[0]).sort((a,b)=>a-b),after=textBox(m as Extract<Ent,{type:'text'}>).map(p=>p[0]).sort((a,b)=>a-b);
  expect(after[0]).toBeCloseTo(before[0],6);expect(after[3]).toBeCloseTo(before[3],6);
  const arc:Ent={id:3,type:'arc',layer:'0',center:[0,0],radius:1,start:0,end:90};
  const ma=transformEnt(arc,mirroring([0,-1],[0,1]));expect(ma.type==='arc'&&[Math.round(ma.start),Math.round(ma.end)]).toEqual([90,180]);
  expect(transformEnt(line(1,[0,0],[1,1]),translation([2,3]))).toMatchObject({a:[2,3],b:[3,4]});
 });
 it('measures dimensions at the drawing scale and explodes them',()=>{
  const d=doc([]);d.realPerUnit=25.4*16;
  const dim:Ent={id:1,type:'dim',layer:'0',kind:'horizontal',a:[0,0],b:[3,2],at:[1,4],height:.1};
  const g=dimGeometry(dim,d);expect(g.text.value).toBe(`4'-0"`);expect(g.text.angle).toBe(0);
  const parts=explodeEnt(dim,d)!;expect(parts.filter(p=>p.type==='line')).toHaveLength(3);expect(parts.filter(p=>p.type==='solid')).toHaveLength(2);
 });
 it('stretches grips',()=>{
  expect(stretchGrip(line(1,[0,0],[1,0]),'b',[1,0],[2,2])).toMatchObject({a:[0,0],b:[2,2]});
  expect(stretchGrip({id:2,type:'circle',layer:'0',center:[0,0],radius:1},'radius',[1,0],[0,3])).toMatchObject({radius:3});
 });
});

describe('CAD editor: undo and redo',()=>{
 it('restores entities, their order and the layer table',()=>{
  const s=new CadStore(doc([line(1,[0,0],[1,0]),line(2,[0,1],[1,1]),line(3,[0,2],[1,2])]));
  s.commit('erase',{del:[2]});expect(s.doc.entities.map(e=>e.id)).toEqual([1,3]);
  const [id]=s.commit('line',{add:[{type:'line',layer:'0',a:[5,5],b:[6,6]}]});expect(id).toBe(4);
  s.commit('move',{put:[{...s.get(1)!,a:[9,9]} as Ent]});expect(s.get(1)).toMatchObject({a:[9,9]});
  s.commit('layer',{layers:[...s.doc.layers,{name:'NEW',color:1,ltype:'Continuous',weight:25,visible:true,locked:false}]});
  expect(s.undo()).toBe('layer');expect(s.doc.layers).toHaveLength(1);
  s.undo();s.undo();s.undo();
  expect(s.doc.entities.map(e=>e.id)).toEqual([1,2,3]);expect(s.get(1)).toMatchObject({a:[0,0]});
  s.redo();expect(s.doc.entities.map(e=>e.id)).toEqual([1,3]);
  expect(s.canRedo).toBe(true);s.commit('new',{add:[{type:'line',layer:'0',a:[0,0],b:[1,1]}]});expect(s.canRedo).toBe(false);
 });
});

describe('CAD editor: sheets and sketches in and out',()=>{
 const snapshot=calculate(demonstrationProject()),sheets=drawingSheetSet(snapshot);
 it('opens an issued sheet in paper inches and writes it back as SVG and DXF',()=>{
  const sheet=sheets[sheets.length-1],d=docFromSheet(sheet,'US');
  expect(d.width).toBeCloseTo(36,9);expect(d.height).toBeCloseTo(24,9);
  const raw=sheetEntities(sheet.svg,'US');expect(d.entities).toHaveLength(raw.length);
  // The edited sheet's SVG reads back to the same entities.
  const again=sheetEntities(docToSvg(d),'US');
  expect(again.length).toBe(raw.length);
  expect(again.filter(e=>e.type==='text').map(e=>e.type==='text'&&e.value)).toEqual(raw.filter(e=>e.type==='text').map(e=>e.type==='text'&&e.value));
  const dxf=docToDxf(d);expect(dxf).toContain('AC1015');expect(dxf.match(/\nTEXT\n/g)?.length).toBe(raw.filter(e=>e.type==='text').length);
 });
 it('exports arcs and edited sheets inside the drawing-set DXF',()=>{
  const d=docFromSheet(sheets[0],'US');
  const s=new CadStore(d);s.commit('arc',{add:[{type:'arc',layer:'S-ANNO',center:[5,5],radius:1,start:0,end:90}]});
  expect(docToDxf(s.doc)).toContain('\nARC\n');
  const dxf=sheetsDxf([{svg:sheets[0].svg,entities:[{type:'arc',layer:'S-ANNO',center:[5,5],radius:1,start:0,end:90}]},{svg:sheets[1].svg}],'US');
  expect(dxf).toContain('\nARC\n');
  // The unedited sheets write exactly as before.
  expect(sheetsDxf(sheets,'US')).toBe(sheetsDxf(sheets.map(v=>({svg:v.svg})),'US'));
 });
 it('opens a sketch with y up and keeps its text',()=>{
  const sketch=engineeringSketches(snapshot)[0],d=docFromSketch(sketch,'US');
  expect(d.entities).toHaveLength(sketch.entities.length);
  const t=sketch.entities.find(e=>e.type==='text')!,u=d.entities.find(e=>e.type==='text')!;
  expect(t.type==='text'&&u.type==='text'&&u.at[1]).toBeCloseTo(sketch.height-(t.type==='text'?t.at[1]:0),9);
  expect(docToSvg(d)).toContain('var(--cad-outline');
 });
});
