import {describe,expect,it} from 'vitest';
import {children,flatten,makeBlock,nests,setXrefResolver} from '../src/cad/blocks';
import {blockLibrary} from '../src/cad/blockLibrary';
import {bbox,explodeEnt,mirroring,nearest,snapPoints,transformEnt,type CadDoc,type Ent,type Pt} from '../src/cad/model';
import {docDxfEntities,docToSvg} from '../src/cad/convert';
import {parseCadDoc} from '../src/cad/validate';
import {CadStore} from '../src/cad/store';
import {blank,near,setup} from './cadHarness';

const bolt=makeBlock('BOLT',[0,0],[
 {id:0,type:'circle',layer:'0',center:[0,0],radius:.5},{id:0,type:'line',layer:'S-ANNO',a:[-1,0],b:[1,0]},
 {id:0,type:'attdef',layer:'0',tag:'DIA',prompt:'Diameter',value:'3/4',at:[0,-1],height:.1,angle:0,align:1},
]);
const docWith=(entities:Ent[],blocks=[bolt]):CadDoc=>({...blank(),layers:[...blank().layers,{name:'S-ANNO',color:2,ltype:'Continuous',weight:18,visible:true,locked:false},{name:'B',color:3,ltype:'Continuous',weight:25,visible:true,locked:false}],blocks,entities,nextId:entities.length+1});
const ins=(over:Partial<Extract<Ent,{type:'insert'}>>={}):Ent=>({id:1,type:'insert',layer:'B',name:'BOLT',at:[10,10],scale:2,rotation:90,...over} as Ent);

describe('CAD blocks: references draw their block',()=>{
 it('places the block by insertion point, scale and rotation; attributes show the reference values',()=>{
  const doc=docWith([ins({attribs:{DIA:'7/8'}})]),cs=children(doc.entities[0] as Extract<Ent,{type:'insert'}>,doc);
  const c=cs.find(e=>e.type==='circle')!,l=cs.find(e=>e.type==='line')!,t=cs.find(e=>e.type==='text')!;
  expect(c).toMatchObject({type:'circle',radius:1,layer:'B'});near((c as Extract<Ent,{type:'circle'}>).center,[10,10]);
  // A child on layer 0 takes the reference's layer; others keep theirs.
  expect(l.layer).toBe('S-ANNO');if(l.type==='line'){near(l.a,[10,8]);near(l.b,[10,12]);}
  expect(t).toMatchObject({type:'text',value:'7/8'});
  const b=bbox(doc.entities[0],doc);expect(b[0]).toBeCloseTo(9,9);expect(b[1]).toBeCloseTo(8,9);expect(b[3]).toBeCloseTo(12,9);expect(b[2]).toBeGreaterThanOrEqual(12);
  expect(nearest(doc.entities[0],[11.02,10],doc).d).toBeCloseTo(.02,9);
  expect(snapPoints(doc.entities[0],doc).some(s=>s.kind==='cen'&&Math.abs(s.p[0]-10)<1e-9)).toBe(true);
 });
 it('nests blocks, refuses a block holding itself, and mirrors references',()=>{
  const pair=makeBlock('PAIR',[0,0],[{...ins({at:[0,0],scale:1,rotation:0}),id:0},{...ins({at:[3,0],scale:1,rotation:0}),id:0}]);
  const doc=docWith([{id:1,type:'insert',layer:'0',name:'PAIR',at:[0,0],scale:1,rotation:0}],[bolt,pair]);
  expect(flatten(doc.entities,doc).filter(e=>e.type==='circle')).toHaveLength(2);
  expect(nests([bolt,pair],'PAIR','BOLT')).toBe(true);expect(nests([bolt,pair],'BOLT','PAIR')).toBe(false);
  const one=docWith([ins({rotation:30,scale:1})]),m=mirroring([0,0],[0,1]),mirrored=transformEnt(one.entities[0],m);
  expect(mirrored).toMatchObject({mirror:true,rotation:150});
  const a=children(mirrored as Extract<Ent,{type:'insert'}>,one).find(e=>e.type==='line')!,b=transformEnt(children(one.entities[0] as Extract<Ent,{type:'insert'}>,one).find(e=>e.type==='line')!,m);
  if(a.type==='line'&&b.type==='line'){const s=[a.a,a.b].map(p=>p.map(v=>+v.toFixed(9)).join()).sort(),t=[b.a,b.b].map(p=>p.map(v=>+v.toFixed(9)).join()).sort();expect(s).toEqual(t);}
 });
 it('explodes a reference into its entities with the attribute values as text',()=>{
  const doc=docWith([ins({attribs:{DIA:'1'}})]),parts=explodeEnt(doc.entities[0],doc)!;
  expect(parts.map(p=>p.type).sort()).toEqual(['circle','line','text']);expect(parts.find(p=>p.type==='text')).toMatchObject({value:'1'});
 });
 it('validates blocks and references, and exports what they draw',()=>{
  const doc=docWith([ins({attribs:{DIA:'1 1/8'}})]);
  const back=parseCadDoc(JSON.parse(JSON.stringify(doc)))!;expect(back.blocks?.[0].entities).toHaveLength(3);expect(back.entities[0]).toMatchObject({type:'insert',attribs:{DIA:'1 1/8'}});
  const missing=JSON.parse(JSON.stringify(doc));missing.entities[0].name='NOPE';expect(parseCadDoc(missing)).toBeUndefined();
  expect(docToSvg(doc)).toContain('1 1/8');
  expect(docDxfEntities(doc).map(e=>e.type).sort()).toEqual(['circle','line','text']);
 });
 it('every library block validates and draws',()=>{
  const doc:CadDoc={...blank(),blocks:blockLibrary,entities:blockLibrary.map((b,i)=>({id:i+1,type:'insert',layer:'0',name:b.name,at:[i,i],scale:1,rotation:0} as Ent)),nextId:blockLibrary.length+1};
  expect(parseCadDoc(JSON.parse(JSON.stringify(doc)))?.blocks).toHaveLength(blockLibrary.length);
  for(const e of doc.entities)expect(children(e as Extract<Ent,{type:'insert'}>,doc).length).toBeGreaterThan(1);
  expect(blockLibrary.map(b=>b.name)).toEqual(expect.arrayContaining(['GRID-BUBBLE','SECTION-MARK','WELD-FILLET','WELD-FILLET-FIELD','WELD-CJP-V','BOLT-PLAN','ANCHOR-ROD','TITLE-ARCHD']));
 });
});

describe('CAD block commands',()=>{
 it('BLOCK turns the selection into a block and a reference at the base point',()=>{
  const {store,run,add}=setup();
  const ids=add({type:'line',layer:'0',a:[5,5],b:[6,5]},{type:'circle',layer:'0',center:[5,5],radius:.2},{type:'attdef',layer:'0',tag:'MARK',prompt:'Mark',value:'B1',at:[5,4],height:.1,angle:0,align:0});
  store.select(ids);run('BLOCK','BEAM-MARK',[5,5]);
  expect(store.doc.blocks?.[0]).toMatchObject({name:'BEAM-MARK',base:[5,5]});expect(store.doc.blocks?.[0].entities).toHaveLength(3);
  expect(store.doc.entities).toEqual([expect.objectContaining({type:'insert',name:'BEAM-MARK',at:[5,5],attribs:{MARK:'B1'}})]);
  store.undo();expect(store.doc.entities).toHaveLength(3);expect(store.doc.blocks??[]).toHaveLength(0);
 });
 it('INSERT places library blocks at the drawing units and asks for attributes',()=>{
  const {store,run}=setup();
  run('INSERT','grid-bubble',[2,3],'C');
  expect(store.doc.blocks?.map(b=>b.name)).toEqual(['GRID-BUBBLE']);
  expect(store.doc.entities[0]).toMatchObject({type:'insert',name:'GRID-BUBBLE',at:[2,3],scale:1,attribs:{GRID:'C'}});
  const mm=setup({...blank(),unit:'mm',display:'SI',realPerUnit:1});mm.run('INSERT','REV-DELTA','S','2',[0,0],'');
  expect(mm.store.doc.entities[0]).toMatchObject({scale:2,attribs:{REV:'1'}});
  const mm2=setup({...blank(),unit:'mm',display:'SI',realPerUnit:1});mm2.run('INSERT','REV-DELTA',[0,0],'');expect(mm2.store.doc.entities[0]).toMatchObject({scale:25.4});
 });
 it('ATTDEF, ATTEDIT hook and BEDIT hooks',()=>{
  const {store,run,env}=setup();
  run('ATTDEF','I','SIZE','Weld size','5/16',[1,1]);expect(store.doc.entities[0]).toMatchObject({type:'attdef',tag:'SIZE',value:'5/16',invisible:true});
  let edited='';env.editBlock=n=>{edited=n;};env.blockEditing=()=>undefined;
  run('INSERT','WELD-FILLET',[0,0],'1/4','','');run('BEDIT','WELD-FILLET');expect(edited).toBe('WELD-FILLET');
  expect(store.doc.entities.at(-1)).toMatchObject({attribs:{TAIL:'1/4',SIZE:'5/16',LENGTH:''}});
 });
 it('XATTACH references another drawing; XBIND makes it a block with its layers',()=>{
  const other:CadDoc={...blank(),key:'S-02',layers:[{name:'0',color:7,ltype:'Continuous',weight:25,visible:true,locked:false},{name:'S-GRID',color:1,ltype:'CENTER',weight:18,visible:true,locked:false}],
   entities:[{id:1,type:'line',layer:'S-GRID',a:[0,0],b:[10,0]},{id:2,type:'circle',layer:'0',center:[5,5],radius:1}],nextId:3};
  setXrefResolver(n=>n==='S-02'?other:undefined);
  try{
   const {store,run}=setup();
   run('XATTACH','s-02',[1,1],'.5');
   const x=store.doc.entities[0];expect(x).toMatchObject({type:'xref',name:'S-02',at:[1,1],scale:.5});
   expect(children(x as Extract<Ent,{type:'xref'}>,store.doc).find(e=>e.type==='line')).toMatchObject({b:[6,1]});
   store.select([x.id]);run('XBIND');
   expect(store.doc.entities[0]).toMatchObject({type:'insert',name:'XREF-S-02'});expect(store.doc.layers.some(l=>l.name==='S-02$S-GRID')).toBe(true);
   expect(flatten(store.doc.entities,store.doc).find(e=>e.type==='line')?.layer).toBe('S-02$S-GRID');
  }finally{setXrefResolver(undefined);}
 });
 it('the store sets a drawing aside and restores it with its history (block editing)',()=>{
  const s=new CadStore(blank());s.commit('a',{add:[{type:'line',layer:'0',a:[0,0],b:[1,1]}]});
  const saved=s.swap({...blank(),entities:[],nextId:1});s.commit('b',{add:[{type:'circle',layer:'0',center:[0,0] as Pt,radius:1}]});
  s.restore(saved);expect(s.doc.entities.map(e=>e.type)).toEqual(['line']);expect(s.undo()).toBe('a');
 });
});
