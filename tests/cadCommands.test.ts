import {describe,expect,it} from 'vitest';
import {calculate} from '../src/engine/calculate';
import {demonstrationProject} from '../src/engine/demonstration';
import {appendPlanSheet,drawingSheetSet} from '../src/components/planSheet';
import {arcThrough,makeCommand,type Command,type Env} from '../src/cad/commands';
import {docFromSheet,docToSvg} from '../src/cad/convert';
import {parseCadDoc} from '../src/cad/validate';
import {CadStore} from '../src/cad/store';
import {bbox,formatLength,type CadDoc,type Ent,type Pt} from '../src/cad/model';

const blank=():CadDoc=>({key:'S-09',title:'Test sheet',unit:'in',display:'US',realPerUnit:25.4,width:36,height:24,svgScale:1/72,
 layers:[{name:'0',color:7,ltype:'Continuous',weight:25,visible:true,locked:false},{name:'LOCKED',color:1,ltype:'Continuous',weight:25,visible:true,locked:true}],entities:[],nextId:1});
function setup(doc=blank()){
 const store=new CadStore(doc),log:string[]=[];let offset:number|undefined;
 const env:Env={store,layer:()=>'0',textHeight:()=>.125,setTextHeight:()=>{},dimHeight:()=>.1,offsetDistance:()=>offset,setOffsetDistance:d=>{offset=d;},
  log:m=>{log.push(m);},neighbors:e=>store.doc.entities.filter(o=>o.id!==e.id),zoomExtents:()=>{},zoomWindow:()=>{},openPanel:()=>{},
  length:d=>formatLength(d*store.doc.realPerUnit,store.doc.display)};
 /** Run a command with clicks (points), picks ({pick}), typed values (strings) and Enter (null). */
 const run=(name:string,...steps:(Pt|string|null|{pick:Pt})[]):Command=>{
  const c=makeCommand(name,env)!;if(c.selectFirst)c.begin?.();
  for(const s of steps){if(c.done)break;
   if(s===null)c.enter?.();
   else if(typeof s==='string'){if(!c.text?.(s))throw Error(`${name} rejected "${s}"`);}
   else if('pick' in s){const hit=store.doc.entities.find(e=>e.type!=='text'&&bbox(e)[0]-1e-9<=s.pick[0]&&s.pick[0]<=bbox(e)[2]+1e-9&&bbox(e)[1]-1e-9<=s.pick[1]&&s.pick[1]<=bbox(e)[3]+1e-9);c.pick?.(hit,s.pick);}
   else c.point?.(s);
  }
  return c;
 };
 return {store,env,run,log};
}
const lines=(s:CadStore)=>s.doc.entities.filter((e):e is Extract<Ent,{type:'line'}>=>e.type==='line');

describe('CAD editor commands',()=>{
 it('LINE draws connected segments, U takes one back and C closes',()=>{
  const {store,run}=setup();
  const c=run('LINE',[0,0],[2,0],[2,2],[5,5],'U','C');
  expect(c.done).toBe(true);
  expect(lines(store).map(l=>[l.a,l.b])).toEqual([[[0,0],[2,0]],[[2,0],[2,2]],[[2,2],[0,0]]]);
 });
 it('PLINE, RECTANG, CIRCLE (radius or diameter) and a three-point ARC',()=>{
  const {store,run}=setup();
  run('PLINE',[0,0],[1,0],[1,1],'C');run('RECTANG',[2,2],[4,3]);run('CIRCLE',[0,0],'2');run('CIRCLE',[5,5],'D','3');run('ARC',[1,0],[0,1],[-1,0]);
  const [pl,rec,c1,c2,arc]=store.doc.entities;
  expect(pl).toMatchObject({type:'poly',closed:true});expect(rec).toMatchObject({type:'poly',closed:true,points:[[2,2],[4,2],[4,3],[2,3]]});
  expect(c1).toMatchObject({radius:2});expect(c2).toMatchObject({radius:1.5});
  expect(arc.type).toBe('arc');if(arc.type==='arc'){expect(arc.radius).toBeCloseTo(1,9);expect(Math.round(arc.start)).toBe(0);expect(Math.round(arc.end)).toBe(180);}
  expect(arcThrough([0,0],[1,0],[2,0])).toBeUndefined();
 });
 it('TEXT places lines one under another; DIMLINEAR measures at the drawing scale',()=>{
  const {store,run}=setup();
  run('TEXT',[1,10],'0.2','0','FIRST','SECOND','');
  const t=store.doc.entities.filter(e=>e.type==='text');expect(t.map(e=>e.type==='text'&&e.value)).toEqual(['FIRST','SECOND']);
  expect(t[1].type==='text'&&t[1].at[1]).toBeLessThan(10);
  store.setMeta({realPerUnit:16*25.4});
  run('DIMLINEAR',[0,0],[3,1],[1.5,-1]);
  const d=store.doc.entities.at(-1)!;expect(d).toMatchObject({type:'dim',kind:'horizontal'});
 });
 it('MOVE, COPY, ROTATE, SCALE and MIRROR act on the selection, skipping locked layers',()=>{
  const {store,run}=setup();
  const [a]=store.commit('x',{add:[{type:'line',layer:'0',a:[0,0],b:[1,0]}]}),[b]=store.commit('x',{add:[{type:'line',layer:'LOCKED',a:[0,5],b:[1,5]}]});
  store.select([a,b]);run('MOVE',[0,0],[2,3]);
  expect(store.get(a)).toMatchObject({a:[2,3],b:[3,3]});expect(store.get(b)).toMatchObject({a:[0,5]});
  store.select([a]);run('COPY',[2,3],[2,4],[2,5],null);expect(lines(store)).toHaveLength(4);
  store.select([a]);run('ROTATE',[2,3],'90');const r=store.get(a)!;expect(r.type==='line'&&r.b.map(v=>+v.toFixed(9))).toEqual([2,4]);
  store.select([a]);run('SCALE',[2,3],'2');const s=store.get(a)!;expect(s.type==='line'&&s.b.map(v=>+v.toFixed(9))).toEqual([2,5]);
  store.select([a]);const before=lines(store).length;run('MIRROR',[0,0],[0,1],'N');expect(lines(store)).toHaveLength(before+1);
  expect(lines(store).at(-1)!.a.map(v=>+v.toFixed(9))).toEqual([-2,3]);
 });
 it('ERASE and EXPLODE; undo brings everything back',()=>{
  const {store,run}=setup();
  const [p]=store.commit('x',{add:[{type:'poly',layer:'0',points:[[0,0],[1,0],[1,1]],closed:false}]});
  store.select([p]);run('EXPLODE');expect(lines(store)).toHaveLength(2);
  store.select(lines(store).map(l=>l.id));run('ERASE');expect(store.doc.entities).toHaveLength(0);
  store.undo();store.undo();expect(store.doc.entities.map(e=>e.type)).toEqual(['poly']);
 });
 it('OFFSET, TRIM and EXTEND by picking objects',()=>{
  const {store,run}=setup();
  store.commit('x',{add:[{type:'line',layer:'0',a:[0,0],b:[10,0]},{type:'line',layer:'0',a:[5,-2],b:[5,2]},{type:'line',layer:'0',a:[8,1],b:[8,3]}]});
  run('OFFSET','1',{pick:[2,0]},[2,1],null);
  expect(lines(store).at(-1)).toMatchObject({a:[0,1],b:[10,1]});
  run('TRIM',{pick:[7,0]},null);
  expect(lines(store).some(l=>l.a[0]===0&&l.b[0]===5&&l.a[1]===0)).toBe(true);
  expect(lines(store).some(l=>l.a[0]===5&&l.b[0]===10&&l.a[1]===0)).toBe(false);
  // Extend the vertical at x = 8 down to the offset line (y = 1): it starts there already; extend its top to nothing ahead.
  const {store:s2,run:run2}=setup();
  s2.commit('x',{add:[{type:'line',layer:'0',a:[0,0],b:[1,0]},{type:'line',layer:'0',a:[3,-1],b:[3,1]}]});
  run2('EXTEND',{pick:[0.9,0]},null);expect(lines(s2)[0]).toMatchObject({a:[0,0],b:[3,0]});
 });
});

describe('CAD editor: edited sheets in the report',()=>{
 const snapshot=calculate(demonstrationProject()),sheets=drawingSheetSet(snapshot);
 it('binds an edited sheet in place of the generated one',()=>{
  const doc=docFromSheet(sheets[1],'US'),svg=docToSvg(doc);
  const html=appendPlanSheet('<html><head></head><body></body></html>',snapshot,undefined,{[sheets[1].number]:svg});
  expect(html).toContain(`data-cad-edited="${sheets[1].number}"`);
  expect(html.match(/runway-plan-sheet-page/g)!.length).toBeGreaterThan(sheets.length);
  expect(html).toContain(sheets[0].svg.slice(0,200));
 });
 it('escapes text and accepts only well-formed drawings from outside',()=>{
  const doc=blank();doc.entities=[{id:1,type:'text',layer:'0',at:[1,1],height:.1,value:'<script>alert(1)</script>',angle:0,align:0,bold:false}];doc.nextId=2;
  expect(docToSvg(doc)).not.toContain('<script>');
  const ok=parseCadDoc(JSON.parse(JSON.stringify(doc)));expect(ok?.entities).toHaveLength(1);
  const bad=(patch:(d:Record<string,unknown>)=>void)=>{const d=JSON.parse(JSON.stringify(doc));patch(d);return parseCadDoc(d);};
  expect(bad(d=>{(d.entities as {at:unknown}[])[0].at=[1,'x'];})).toBeUndefined();
  expect(bad(d=>{(d.entities as {layer:string}[])[0].layer='NOPE';})).toBeUndefined();
  expect(bad(d=>{(d.entities as {type:string}[])[0].type='image';})).toBeUndefined();
  expect(bad(d=>{d.width=-1;})).toBeUndefined();
  expect(parseCadDoc(JSON.parse(JSON.stringify(docFromSheet(sheets[0],'US'))))).toBeDefined();
 });
});
