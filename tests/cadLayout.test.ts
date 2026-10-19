import {describe,expect,it} from 'vitest';
import {annoAdjust,clippedContents,modelDoc,snapScale,viewportContents,withModel} from '../src/cad/layout';
import {parseScale} from '../src/cad/layoutCommands';
import {docToPdf} from '../src/cad/pdf';
import {docDxfEntities,docToSvg} from '../src/cad/convert';
import {parseCadDoc} from '../src/cad/validate';
import type {CadDoc,Ent,ViewportEnt} from '../src/cad/model';
import {blank,near,setup} from './cadHarness';

const vp=(over:Partial<ViewportEnt>={}):ViewportEnt=>({id:9,type:'viewport',layer:'0',at:[18,12],width:20,height:10,view:[240,120],scale:1/48,...over});
const sheet=(model:Ent[],ents:Ent[]=[vp()]):CadDoc=>({...blank(),layers:[...blank().layers,{name:'S-GRID',color:1,ltype:'CENTER',weight:18,visible:true,locked:false}],model:{entities:model,nextId:model.length+1,annoScale:1/48},entities:ents,nextId:20});

describe('CAD layouts: viewports show model space at a scale',()=>{
 it('maps model space to the paper through the viewport',()=>{
  const d=sheet([{id:1,type:'line',layer:'0',a:[0,120],b:[480,120]}]),[l]=viewportContents(d.entities[0] as ViewportEnt,d);
  expect(l.type).toBe('line');if(l.type==='line'){near(l.a,[13,12]);near(l.b,[23,12]);}
  // Clipped to the viewport for exports: the 10 in line fits; a longer one is cut at the edges.
  const long=sheet([{id:1,type:'line',layer:'0',a:[-2000,120],b:[2000,120]}]),[c]=clippedContents(long.entities[0] as ViewportEnt,long);
  if(c.type==='line'){near(c.a,[8,12]);near(c.b,[28,12]);}
 });
 it('keeps annotative text at its paper size in a viewport at another scale',()=>{
  const t:Ent={id:1,type:'text',layer:'0',at:[240,120],height:4.5,value:'NOTE',angle:0,align:0,bold:false,annotative:true};
  const at96=viewportContents(vp({scale:1/96}),sheet([t]))[0],at48=viewportContents(vp(),sheet([t]))[0];
  expect(at96.type==='text'&&at96.height).toBeCloseTo(.09375,9);expect(at48.type==='text'&&at48.height).toBeCloseTo(.09375,9);
  const plain=viewportContents(vp({scale:1/96}),sheet([{...t,annotative:undefined}]))[0];expect(plain.type==='text'&&plain.height).toBeCloseTo(4.5/96,9);
  expect(annoAdjust({...t,type:'mtext',width:10,attach:1} as Ent,2)).toMatchObject({height:9,width:20});
 });
 it('leaves out layers frozen in the viewport',()=>{
  const d=sheet([{id:1,type:'line',layer:'S-GRID',a:[0,0],b:[480,240]},{id:2,type:'circle',layer:'0',center:[240,120],radius:24}],[vp({frozen:['S-GRID']})]);
  expect(viewportContents(d.entities[0] as ViewportEnt,d).map(e=>e.type)).toEqual(['circle']);
 });
 it('model space opens as a drawing of its own and writes back',()=>{
  const d=sheet([{id:1,type:'circle',layer:'0',center:[0,0],radius:12}]),m=modelDoc(d);
  expect(m).toMatchObject({space:'model',unit:'in',realPerUnit:25.4,annoScale:1/48});expect(m.ltscale).toBe(48);
  const back=withModel(d,{...m,entities:[...m.entities,{id:2,type:'line',layer:'0',a:[0,0],b:[1,1]}],nextId:3});
  expect(back.model?.entities).toHaveLength(2);expect(back.space).toBeUndefined();expect(back.entities).toBe(d.entities);
 });
 it('exports viewports clipped: SVG clip paths, DXF cut lines, and validates layouts',()=>{
  const d=sheet([{id:1,type:'line',layer:'0',a:[-2000,120],b:[2000,120]}]);
  expect(docToSvg(d)).toContain('<clipPath');expect(docToSvg(d,{trueSize:true})).toContain('width="36in" height="24in"');
  const lines=docDxfEntities(d).filter(e=>e.type==='line');expect(lines).toHaveLength(1);
  const back=parseCadDoc(JSON.parse(JSON.stringify(d)))!;expect(back.model?.entities).toHaveLength(1);expect(back.entities[0]).toMatchObject({type:'viewport',scale:1/48});
  const bad=JSON.parse(JSON.stringify(d));bad.model.entities.push({...bad.entities[0],id:5});expect(parseCadDoc(bad)).toBeUndefined();
 });
});

describe('CAD layout commands and plotting',()=>{
 it('MVIEW fits the model at the largest standard scale; ANNOSCALE resizes annotative objects',()=>{
  const {store,run}=setup(sheet([{id:1,type:'line',layer:'0',a:[0,0],b:[480,240]}],[]));
  run('MVIEW',[2,2],[12,7]);
  const v=store.doc.entities.at(-1) as ViewportEnt;expect(v.type).toBe('viewport');expect(v.scale).toBeCloseTo(1/64,12);near(v.view,[240,120]);
  expect(store.doc.layers.some(l=>l.name==='VIEWPORTS')).toBe(true);
  const m=setup(modelDoc(sheet([])));
  m.run('TEXT',[0,0],'0.125','0','A','');const t=m.store.doc.entities[0];expect(t).toMatchObject({annotative:true});expect(t.type==='text'&&t.height).toBeCloseTo(6,9);
  m.run('ANNOSCALE','1/96');expect(m.store.doc.annoScale).toBeCloseTo(1/96,12);const t2=m.store.doc.entities[0];expect(t2.type==='text'&&t2.height).toBeCloseTo(12,9);
  expect(snapScale({display:'SI'},.03)).toBe(1/50);
 });
 it('reads scales as drafters write them',()=>{
  expect(parseScale('1:50','SI')).toBe(1/50);expect(parseScale('1/48','US')).toBe(1/48);expect(parseScale('96','US')).toBe(1/96);
  expect(parseScale(`1/4"=1'-0"`,'US')).toBeCloseTo(1/48,12);expect(parseScale(`1-1/2"=1'-0"`,'US')).toBeCloseTo(1/8,12);
 });
 it('plots the layout to a one-page PDF at true size',()=>{
  const d=sheet([{id:1,type:'circle',layer:'0',center:[240,120],radius:24}],[vp(),{id:2,type:'text',layer:'0',at:[1,1],height:.125,value:'S-01 (PLAN) 45°',angle:0,align:0,bold:false}]);
  const pdf=docToPdf(d,{lineweights:true});
  expect(pdf.startsWith('%PDF-1.4')).toBe(true);expect(pdf).toContain('/MediaBox [0 0 2592 1728]');expect(pdf).toContain('(S-01 \\(PLAN\\) 45°) Tj');
  expect(pdf).toContain(' re W n');expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
  // The cross-reference table points at each object.
  const xref=+pdf.slice(pdf.lastIndexOf('startxref')+9).trim().split('\n')[0],rows=pdf.slice(xref).split('\n').slice(3,10);
  rows.forEach((row,i)=>expect(pdf.slice(+row.slice(0,10)).startsWith(`${i+1} 0 obj\n`)).toBe(true));
 });
});
