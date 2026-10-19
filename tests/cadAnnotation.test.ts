import {describe,expect,it} from 'vitest';
import {dimPrims,dimValue,formatDim,leaderPrims,mtextLayout,primEnts,standardDimStyle,tablePrims,type DimStyle} from '../src/cad/annotation';
import {bbox,explodeEnt,mirroring,rotation,textBox,transformEnt,type CadDoc,type Ent,type Pt} from '../src/cad/model';
import {docDxfEntities,docToSvg} from '../src/cad/convert';
import {parseCadDoc} from '../src/cad/validate';
import {blank,near,setup} from './cadHarness';

const ctx={display:'US' as const,realPerUnit:25.4,unit:'in' as const};
const kinds=(list:{k:string}[])=>list.map(p=>p.k).join(',');

describe('CAD annotation: formats and styles',()=>{
 it('formats dimensions by style: feet-inches to a precision, decimal inches, millimeters',()=>{
  const st=standardDimStyle('in');
  expect(formatDim(25.4*(12+1.6),{...st,precision:8},'US')).toBe(`1'-1 5/8"`);
  expect(formatDim(25.4*3.14159,{...st,units:'decimal',precision:2},'US')).toBe('3.14"');
  expect(formatDim(1234.567,{...st,precision:1},'SI')).toBe('1234.6');
  expect(formatDim(25.4*6,{...st,prefix:'(',suffix:') TYP'},'US')).toBe('(6") TYP');
 });
 it('text styles widen the text box and draw in their font',()=>{
  const t:Ent={id:1,type:'text',layer:'0',at:[0,0],height:.2,value:'WIDE',angle:0,align:0,bold:false,style:'W'};
  const doc:CadDoc={...blank(),textStyles:[{name:'W',font:'Times New Roman',widthFactor:2,oblique:15,height:0}],entities:[t],nextId:2};
  const narrow=textBox({...t,style:undefined}),wide=textBox(t,doc);
  expect(wide[1][0]-wide[0][0]).toBeCloseTo(2*(narrow[1][0]-narrow[0][0]),9);
  const svg=docToSvg(doc);expect(svg).toContain('Times New Roman');expect(svg).toContain('scale(2 1)');expect(svg).toContain('skewX(-15)');
 });
 it('plot styles: monochrome, grayscale and color ink',()=>{
  const doc:CadDoc={...blank(),entities:[{id:1,type:'line',layer:'0',a:[0,0],b:[1,1],color:1}],nextId:2};
  expect(docToSvg(doc)).toContain('stroke="#111"');
  expect(docToSvg({...doc,plotStyle:'color'})).toContain('stroke="#ff0000"');
  expect(docToSvg({...doc,plotStyle:'grayscale'})).toMatch(/stroke="rgb\(\d+,\d+,\d+\)"/);
 });
});

describe('CAD annotation: dimensions of every kind',()=>{
 const base={id:1,type:'dim' as const,layer:'0',height:.1};
 it('angular: the angle between the legs, or the reflex side by the arc location',()=>{
  const d:Ent={...base,kind:'angular',c:[0,0],a:[2,0],b:[0,2],at:[1,1]};
  expect(dimValue(d,ctx)).toBe('90°');
  expect(dimValue({...d,at:[-1,-1]},ctx)).toBe('270°');
  expect(kinds(dimPrims(d,ctx))).toContain('arc');
 });
 it('radius, diameter and ordinate',()=>{
  const r:Ent={...base,kind:'radius',c:[0,0],a:[1.5,0],b:[1.5,0],at:[3,3]},dd:Ent={...r,kind:'diameter'};
  expect(dimValue(r,ctx)).toBe(`R1 1/2"`);expect(dimValue(dd,ctx)).toBe('Ø3"');
  const o:Ent={...base,kind:'ordinate',c:[1,1],a:[4,2],b:[4,2],at:[4,5]};
  expect(dimValue(o,ctx)).toBe('3"');expect(dimValue({...o,at:[8,2]},ctx)).toBe('1"');expect(dimValue({...o,axis:'y'},ctx)).toBe('1"');
 });
 it('arrowheads by style: ticks are lines, dots explode to triangles',()=>{
  const st:DimStyle={...standardDimStyle('in'),name:'TICK',arrow:'tick'},doc:CadDoc={...blank(),dimStyles:[st]};
  const d:Ent={...base,kind:'horizontal',a:[0,0],b:[3,0],at:[1,1],style:'TICK'};
  expect(dimPrims(d,doc).filter(p=>p.k==='fill')).toHaveLength(0);
  const dot={...doc,dimStyles:[{...st,name:'DOT',arrow:'dot' as const}]},parts=explodeEnt({...d,style:'DOT'},dot)!;
  expect(parts.filter(p=>p.type==='solid').length).toBe(20);
 });
});

describe('CAD annotation: multiline text, leaders and tables',()=>{
 it('wraps multiline text to its width and places it by its attachment',()=>{
  const m={type:'mtext' as const,layer:'0',at:[0,0] as Pt,width:1,height:.1,value:'ONE TWO THREE FOUR FIVE SIX\nSEVEN',angle:0,attach:1};
  const l=mtextLayout(m);expect(l.lines.length).toBeGreaterThan(2);expect(l.lines.at(-1)!.value).toBe('SEVEN');
  near(l.lines[0].at,[0,-.1]);
  const c=mtextLayout({...m,attach:5,width:0});const b=c.box;expect((b[0][0]+b[1][0])/2).toBeCloseTo(0,9);expect((b[0][1]+b[2][1])/2).toBeCloseTo(0,1);
 });
 it('leaders put the text past a landing on the side they point to',()=>{
  const p=leaderPrims({type:'leader',layer:'0',points:[[0,0],[1,1]],value:'NOTE\nTWO',height:.1});
  const texts=p.filter((x):x is Extract<typeof x,{k:'text'}>=>x.k==='text');expect(texts.map(t=>t.align)).toEqual([0,0]);expect(texts[0].at[0]).toBeGreaterThan(1.1);
  const left=leaderPrims({type:'leader',layer:'0',points:[[0,0],[-1,1]],value:'L',height:.1}).find(x=>x.k==='text');expect(left&&left.k==='text'&&left.align).toBe(2);
 });
 it('tables: grid lines and bold header cells',()=>{
  const t={type:'table' as const,layer:'0',at:[0,10] as Pt,cols:[1,2],rows:[.3,.3,.3],cells:[['MARK','SIZE'],['B1','W24X84']],height:.1,header:1};
  const p=tablePrims(t);expect(p.filter(x=>x.k==='line')).toHaveLength(4+3);
  const texts=p.filter((x):x is Extract<typeof x,{k:'text'}>=>x.k==='text');expect(texts.map(x=>[x.value,x.bold])).toEqual([['MARK',true],['SIZE',true],['B1',false],['W24X84',false]]);
  expect(primEnts(p,{layer:'0'}).length).toBe(p.length);
 });
 it('mirrors multiline text readably and keeps tables square to the sheet',()=>{
  const m:Ent={id:1,type:'mtext',layer:'0',at:[1,0],width:2,height:.1,value:'A',angle:0,attach:1};
  const mm=transformEnt(m,mirroring([0,0],[0,1]));expect(mm).toMatchObject({angle:0,attach:3});if(mm.type==='mtext')near(mm.at,[-1,0]);
  const t:Ent={id:2,type:'table',layer:'0',at:[0,1],cols:[2],rows:[1],cells:[],height:.1};
  const r=transformEnt(t,rotation([0,0],90));expect(r.type==='table'&&r.cols).toEqual([2]);
  const b=bbox(t,ctx),rb=bbox(r,ctx);expect((rb[0]+rb[2])/2).toBeCloseTo(-.5,9);expect((b[0]+b[2])/2).toBeCloseTo(1,9);
 });
});

describe('CAD annotation commands',()=>{
 it('MTEXT, DIMANGULAR, DIMRADIUS, DIMDIAMETER and DIMORDINATE from a UCS origin',()=>{
  const {store,run,add}=setup();
  run('MTEXT',[0,10],[3,9],'FIRST LINE','SECOND','');
  expect(store.doc.entities.at(-1)).toMatchObject({type:'mtext',at:[0,10],width:3,value:'FIRST LINE\nSECOND',attach:1});
  add({type:'line',layer:'0',a:[0,0],b:[4,0]},{type:'line',layer:'0',a:[0,0],b:[0,4]},{type:'circle',layer:'0',center:[10,10],radius:2});
  run('DIMANGULAR',{pick:[3,0]},{pick:[0,3]},[1.5,1.5]);
  const ang=store.doc.entities.at(-1)!;expect(ang).toMatchObject({type:'dim',kind:'angular',c:[0,0]});expect(dimValue(ang as Extract<Ent,{type:'dim'}>,store.doc)).toBe('90°');
  run('DIMRADIUS',{pick:[12,10]},[14,12]);expect(store.doc.entities.at(-1)).toMatchObject({kind:'radius',c:[10,10]});
  run('DIMDIAMETER',{pick:[10,12]},[10,11]);expect(store.doc.entities.at(-1)).toMatchObject({kind:'diameter'});
  run('UCS',[1,1]);run('DIMORDINATE',[5,3],'X',[5,6]);
  const o=store.doc.entities.at(-1) as Extract<Ent,{type:'dim'}>;expect(o).toMatchObject({kind:'ordinate',c:[1,1],axis:'x'});expect(dimValue(o,store.doc)).toBe('4"');
 });
 it('DIMCONTINUE and DIMBASELINE chain from the last linear dimension',()=>{
  const {store,run}=setup();
  run('DIMLINEAR',[0,0],[2,0],[1,-1]);run('DIMCONTINUE',[5,0],[6,0],null);
  const dims=store.doc.entities.filter((e):e is Extract<Ent,{type:'dim'}>=>e.type==='dim');
  expect(dims.map(d=>[d.a[0],d.b[0]])).toEqual([[0,2],[2,5],[5,6]]);expect(dims.every(d=>d.at[1]===-1)).toBe(true);
  run('DIMBASELINE',[8,0],null);
  const b=store.doc.entities.at(-1) as Extract<Ent,{type:'dim'}>;expect(b.a).toEqual([5,0]);expect(b.at[1]).toBeCloseTo(-1.375,9);
 });
 it('MLEADER, LEADER, TABLE and REVCLOUD',()=>{
  const {store,run}=setup();
  run('MLEADER',[0,0],[1,1],'FIELD WELD','');expect(store.doc.entities.at(-1)).toMatchObject({type:'leader',points:[[0,0],[1,1]],value:'FIELD WELD'});
  run('LEADER',[0,0],[1,0],[2,1],null,'TYP','');expect(store.doc.entities.at(-1)).toMatchObject({type:'leader',value:'TYP'});
  run('TABLE','3','2',null,null,[0,20]);const t=store.doc.entities.at(-1)!;expect(t).toMatchObject({type:'table',at:[0,20],header:1});expect(t.type==='table'&&[t.cols.length,t.rows.length]).toEqual([3,3]);
  run('REVCLOUD',[0,0],[3,2]);const c=store.doc.entities.at(-1)!;expect(c.type==='poly'&&c.closed&&c.bulges?.every(x=>x>0)).toBe(true);
  expect(c.type==='poly'&&c.points.length).toBeGreaterThan(20);
 });
 it('LTSCALE and PLOTSTYLE change the drawing undoably',()=>{
  const {store,run}=setup();
  run('LTSCALE','2');expect(store.doc.ltscale).toBe(2);run('PLOTSTYLE','C');expect(store.doc.plotStyle).toBe('color');
  store.undo();store.undo();expect(store.doc.ltscale).toBeUndefined();expect(store.doc.plotStyle).toBeUndefined();
 });
 it('validates styles and the annotation entities, and exports them',()=>{
  const doc:CadDoc={...blank(),textStyles:[{name:'NOTES',font:'Arial Narrow',widthFactor:.9,oblique:0,height:0}],dimStyles:[{...standardDimStyle('in'),name:'ARCH',arrow:'tick'}],ltscale:.5,plotStyle:'grayscale',
   entities:[{id:1,type:'mtext',layer:'0',at:[1,10],width:3,height:.1,value:'A\nB',angle:0,attach:1,style:'NOTES'},{id:2,type:'leader',layer:'0',points:[[0,0],[1,1]],value:'X',height:.1},
    {id:3,type:'table',layer:'0',at:[5,10],cols:[1,1],rows:[.3,.3],cells:[['A','B']],height:.1,header:1},{id:4,type:'dim',layer:'0',kind:'angular',c:[0,0],a:[1,0],b:[0,1],at:[.5,.5],height:.1,style:'ARCH'}],nextId:5};
  const back=parseCadDoc(JSON.parse(JSON.stringify(doc)))!;expect(back.entities).toHaveLength(4);expect(back.dimStyles?.[0].arrow).toBe('tick');expect(back.ltscale).toBe(.5);
  const bad=JSON.parse(JSON.stringify(doc));bad.entities[3].c=undefined;expect(parseCadDoc(bad)).toBeUndefined();
  const svg=docToSvg(doc);expect(svg).toContain('>B</text>');
  const dxf=docDxfEntities(doc);expect(dxf.filter(e=>e.type==='text').map(e=>e.type==='text'&&e.value)).toEqual(expect.arrayContaining(['A','B','X','90°']));expect(dxf.some(e=>e.type==='arc')).toBe(true);
 });
});
