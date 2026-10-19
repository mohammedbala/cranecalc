import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import {writeDxf,dxfText} from '../src/cad/dxf';
import {decodeMtext,decodeText,readDxf} from '../src/cad/dxfImport';
import {splineThrough} from '../src/cad/curves';
import {blockLibrary} from '../src/cad/blockLibrary';
import {standardDimStyle} from '../src/cad/annotation';
import type {CadDoc,Ent} from '../src/cad/model';
import {blank,near} from './cadHarness';

const g=splineThrough([[1,1],[2,3],[4,2]],false)!;
const ents:Ent[]=[
 {id:1,type:'poly',layer:'S',points:[[1,1],[3,1],[3,3]],closed:false,bulges:[.5,0,0],color:1,ltype:'DASHDOT',weight:50},
 {id:2,type:'ellipse',layer:'0',center:[10,10],major:[3,1],ratio:.4,start:0,end:360},{id:3,type:'ellipse',layer:'0',center:[10,5],major:[2,0],ratio:.5,start:30,end:200},
 {id:4,type:'spline',layer:'0',...g,fit:[[1,1],[2,3],[4,2]],closed:false},{id:5,type:'xline',layer:'0',base:[18,12],dir:[Math.SQRT1_2,Math.SQRT1_2]},{id:6,type:'ray',layer:'0',base:[5,5],dir:[1,0]},
 {id:7,type:'hatch',layer:'0',loops:[[[20,2],[24,2],[24,5],[20,5]],[[21,3],[22,3],[22,4]]],pattern:'ANSI37',scale:2,angle:15},{id:8,type:'hatch',layer:'0',loops:[[[25,2],[27,2],[27,4]]],pattern:'SOLID',scale:1,angle:0},
 {id:9,type:'mtext',layer:'0',at:[1,20],width:3,height:.1,value:'LINE ONE\nLINE {TWO} 45° \\ BACK',angle:0,attach:4,style:'NOTES'},
 {id:10,type:'leader',layer:'0',points:[[5,15],[6,16]],value:'FIELD WELD',height:.1},
 {id:11,type:'dim',layer:'0',kind:'horizontal',a:[1,8],b:[4,8],at:[2,9],height:.1,style:'Standard'},{id:12,type:'dim',layer:'0',kind:'aligned',a:[1,6],b:[4,7],at:[2,8],height:.1,text:'TYP'},
 {id:13,type:'dim',layer:'0',kind:'angular',c:[10,15],a:[12,15],b:[10,17],at:[11,16],height:.1},{id:14,type:'dim',layer:'0',kind:'radius',c:[15,15],a:[16,15],b:[16,15],at:[17,17],height:.1},
 {id:15,type:'dim',layer:'0',kind:'diameter',c:[15,10],a:[16,10],b:[16,10],at:[17,12],height:.1},{id:16,type:'dim',layer:'0',kind:'ordinate',c:[0,0],a:[20,10],b:[20,10],at:[20,12],height:.1,axis:'x'},
 {id:17,type:'insert',layer:'0',name:'GRID-BUBBLE',at:[30,20],scale:1,rotation:0,attribs:{GRID:'A'}},{id:18,type:'insert',layer:'0',name:'WELD-FILLET',at:[30,15],scale:2,rotation:30,mirror:true,attribs:{SIZE:'1/4',LENGTH:'',TAIL:'SMAW'}},
 {id:19,type:'table',layer:'0',at:[1,23],cols:[1,1],rows:[.3,.3],cells:[['A','B'],['1','2']],height:.1,header:1},{id:20,type:'text',layer:'0',at:[1,22],height:.1,value:'T %% 50% Ø1"',angle:10,align:1,bold:true},
 {id:21,type:'line',layer:'0',a:[0,0],b:[30,0],ltscale:2},{id:22,type:'solid',layer:'0',points:[[0,0],[1,0],[1,1],[0,1]]},{id:23,type:'circle',layer:'LOCKED',center:[3,3],radius:1},{id:24,type:'arc',layer:'0',center:[3,3],radius:2,start:10,end:100},
];
const full:CadDoc={...blank(),layers:[...blank().layers,{name:'S',color:3,ltype:'HIDDEN',weight:35,visible:false,locked:false}],entities:ents,nextId:30,
 blocks:blockLibrary.filter(b=>['GRID-BUBBLE','WELD-FILLET'].includes(b.name)),dimStyles:[{...standardDimStyle('in'),name:'ARCH',arrow:'tick',precision:8}],groups:[{name:'PAIR',ids:[1,2]}],
 textStyles:[{name:'NOTES',font:'Times New Roman',widthFactor:.9,oblique:10,height:0}],ltscale:.5};

describe('CAD DXF: our writer and reader round-trip',()=>{
 const out=writeDxf(full),back=readDxf(out),d=back.doc;
 const of=<T extends Ent['type']>(t:T)=>d.entities.filter(e=>e.type===t) as Extract<Ent,{type:T}>[];
 it('writes a well-formed AC1015 file with unique handles',()=>{
  expect(out.startsWith('0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015')).toBe(true);expect(out.trimEnd().endsWith('EOF')).toBe(true);
  const lines=out.split('\n'),hs:string[]=[];for(let i=0;i+1<lines.length;i+=2)if(lines[i]==='5'||lines[i]==='105')hs.push(lines[i+1]);
  expect(new Set(hs).size).toBe(hs.length);
 });
 it('keeps layers, styles, groups, blocks and the linetype scale',()=>{
  expect(d.unit).toBe('in');expect(d.layers.find(l=>l.name==='S')).toMatchObject({color:3,ltype:'HIDDEN',weight:35,visible:false});expect(d.layers.find(l=>l.name==='LOCKED')?.locked).toBe(true);
  expect(d.textStyles?.find(t=>t.name==='NOTES')).toMatchObject({font:'Times New Roman',widthFactor:.9,oblique:10});
  expect(d.dimStyles?.find(s=>s.name==='ARCH')).toMatchObject({arrow:'tick',precision:8,units:'arch'});
  expect(d.groups).toEqual([{name:'PAIR',ids:[of('poly')[0].id,of('ellipse')[0].id]}]);
  expect(d.blocks?.find(b=>b.name==='WELD-FILLET')?.entities.filter(e=>e.type==='attdef').map(e=>e.type==='attdef'&&e.tag).sort()).toEqual(['LENGTH','SIZE','TAIL']);
  expect(d.ltscale).toBe(.5);
 });
 it('keeps every entity: geometry, properties, text and references',()=>{
  const [p]=of('poly').filter(x=>x.bulges);expect(p).toMatchObject({color:1,ltype:'DASHDOT',weight:50,bulges:[.5,0,0],layer:'S'});
  const [e1,e2]=of('ellipse');expect(e1).toMatchObject({major:[3,1],ratio:.4,start:0,end:360});expect(e2.start).toBeCloseTo(30,9);expect(e2.end).toBeCloseTo(200,9);
  expect(of('spline')[0]).toMatchObject({degree:3,knots:g.knots,fit:[[1,1],[2,3],[4,2]]});
  const xl=d.entities.find(e=>e.type==='xline');near(xl?.type==='xline'?xl.dir:[0,0],[Math.SQRT1_2,Math.SQRT1_2]);expect(d.entities.find(e=>e.type==='ray')).toMatchObject({base:[5,5],dir:[1,0]});
  const [h1,h2]=of('hatch');expect(h1).toMatchObject({pattern:'ANSI37',scale:2,angle:15});expect(h1.loops).toHaveLength(2);expect(h2.pattern).toBe('SOLID');
  const m=of('mtext');expect(m.find(x=>x.attach===4)).toMatchObject({value:'LINE ONE\nLINE {TWO} 45° \\ BACK',style:'NOTES',width:3});
  expect(m.some(x=>x.value==='FIELD WELD')).toBe(true);expect(of('leader')[0].points).toEqual([[5,15],[6,16]]);
  expect(of('dim').map(x=>x.kind)).toEqual(['horizontal','aligned','angular','radius','diameter','ordinate']);
  const dims=of('dim');expect(dims[1].text).toBe('TYP');near(dims[2].c!,[10,15]);near(dims[3].c!,[15,15]);near(dims[4].c!,[15,10]);expect(dims[5]).toMatchObject({axis:'x',a:[20,10],at:[20,12]});
  expect(of('insert').map(x=>[x.name,x.scale,x.rotation,!!x.mirror])).toEqual([['GRID-BUBBLE',1,0,false],['WELD-FILLET',2,30,true]]);
  expect(of('insert')[1].attribs).toEqual({SIZE:'1/4',LENGTH:'',TAIL:'SMAW'});
  expect(of('text').some(t=>t.value==='T %% 50% Ø1"'&&t.align===1&&t.bold&&Math.abs(t.angle-10)<1e-9)).toBe(true);
  expect(of('line').some(l=>l.ltscale===2)).toBe(true);expect(of('solid')[0].points).toEqual([[0,0],[1,0],[1,1],[0,1]]);
  // The table comes back exploded into lines and text.
  expect(of('text').some(t=>t.value==='B')).toBe(true);
 });
 it('writes a layout to paper space with its viewport and model space',()=>{
  const lay:CadDoc={...blank(),entities:[{id:1,type:'viewport',layer:'0',at:[18,12],width:10,height:6,view:[240,120],scale:1/48,locked:true},{id:2,type:'text',layer:'0',at:[1,1],height:.1,value:'TITLE',angle:0,align:0,bold:false}],nextId:3,
   model:{entities:[{id:1,type:'line',layer:'0',a:[0,0],b:[480,240]}],nextId:2,annoScale:1/48}};
  const r=readDxf(writeDxf(lay)).doc;
  expect(r.entities.map(e=>e.type)).toEqual(['viewport','text']);expect(r.entities[0]).toMatchObject({at:[18,12],width:10,height:6,view:[240,120],locked:true});
  expect((r.entities[0] as Extract<Ent,{type:'viewport'}>).scale).toBeCloseTo(1/48,12);expect(r.model?.entities.map(e=>e.type)).toEqual(['line']);
 });
});

describe('CAD DXF: reading files from other programs',()=>{
 it('reads an ezdxf drawing: old and light polylines, hatch edge paths, formatted MTEXT, dimensions, attributes',()=>{
  const r=readDxf(fs.readFileSync('tests/fixtures/cad/ezdxf-sample.dxf','utf8')),d=r.doc;
  expect(d.entities.map(e=>e.type)).toEqual(['line','poly','poly','circle','arc','ellipse','spline','text','mtext','hatch','hatch','dim','dim','insert','xline']);
  expect(r.skipped).toEqual({POINT:1});
  expect(d.layers.find(l=>l.name==='S-STEEL')).toMatchObject({color:3,ltype:'DASHED',weight:50});expect(d.layers.find(l=>l.name==='OFF')?.visible).toBe(false);
  expect(d.entities.find(e=>e.type==='mtext')).toMatchObject({value:'BOLD\nSECOND 1/2 LINE'});
  expect(d.entities.find(e=>e.type==='text')).toMatchObject({value:'HELLO Ø1"',align:1,style:'NOTES'});
  const h=d.entities.find(e=>e.type==='hatch');expect(h?.type==='hatch'&&h.loops.length).toBe(2);expect(h?.type==='hatch'&&h.loops[1].length).toBeGreaterThan(20);
  expect(d.entities.find(e=>e.type==='insert')).toMatchObject({name:'MARK',scale:2,rotation:30,attribs:{TAG1:'B7'}});
  expect(d.entities.filter(e=>e.type==='dim').map(e=>e.type==='dim'&&e.kind)).toEqual(['horizontal','radius']);
 });
 it('decodes DXF text and MTEXT formatting',()=>{
  expect(decodeText('%%c1" %%d %%p \\U+00B0 %%%')).toBe('Ø1" ° ± ° %');
  expect(decodeMtext('{\\fArial|b1;A}\\PB \\S3^4; \\\\ \\{x\\}')).toBe('A\nB 3/4 \\ {x}');
  expect(dxfText('Ø 45° α')).toBe('%%c 45%%d \\U+03B1');
 });
});

describe('CAD DXF: IMPORT and WBLOCK',()=>{
 it('imports a DXF as a block or as objects, adding its layers and blocks',async()=>{
  const {setup}=await import('./cadHarness');const {importCmd}=await import('../src/cad/interchangeCommands');
  const src=readDxf(fs.readFileSync('tests/fixtures/cad/ezdxf-sample.dxf','utf8'));
  const a=setup(),c=importCmd(a.env,src,'sample.dxf');c.text?.('B');c.point?.([1,1]);
  expect(a.store.doc.entities).toEqual([expect.objectContaining({type:'insert',name:'SAMPLE',at:[1,1],scale:1})]);
  expect(a.store.doc.blocks?.map(b=>b.name)).toEqual(expect.arrayContaining(['MARK','SAMPLE']));expect(a.store.doc.layers.some(l=>l.name==='S-STEEL')).toBe(true);
  expect(a.log.some(l=>l.includes('1 POINT'))).toBe(true);
  const mm=setup({...blank(),unit:'mm',display:'SI',realPerUnit:1}),c2=importCmd(mm.env,src,'sample.dxf');c2.text?.('O');c2.point?.([0,0]);
  const line=mm.store.doc.entities.find(e=>e.type==='line');expect(line?.type==='line'&&line.b[0]).toBeCloseTo(254,9);
 });
 it('WBLOCK writes the selection and the blocks it uses',()=>{
  return import('./cadHarness').then(({setup})=>{
   const s=setup({...full});let file='';s.env.download=(_n,content)=>{file=content;};
   s.store.select([18]);s.run('WBLOCK');
   const r=readDxf(file);expect(r.doc.entities.map(e=>e.type)).toEqual(['insert']);expect(r.doc.blocks?.map(b=>b.name)).toEqual(['WELD-FILLET']);
  });
 });
});
