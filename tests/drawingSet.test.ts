import {describe,expect,it} from 'vitest';
import {calculate} from '../src/engine/calculate';
import {demonstrationProject,cappedDemonstrationProject,newColumnDemonstrationProject} from '../src/engine/demonstration';
import {drawingSheetSet,resolveSheetSet,sheetIndex,detailReferences,detailTopics} from '../src/components/planSheet';
import {sheetsDxf,sheetEntities,drawingSetDxf,sheetLayers} from '../src/components/sheetDxf';
import {runwayElevations,issueStatus,girderMarks} from '../src/engine/drawingData';
import {drawingLength} from '../src/components/drawingFormat';
import {multiLeader,textWidth,wrapToWidth,viewTitle,detailRef,sheetDrawingScale,withDetailRoom,text,line} from '../src/components/sheetGraphics';
import {annotationClashes} from '../src/components/detailSheet';
import {coverSheetSvg} from '../src/components/coverSheet';
import {format} from '../src/engine/units';
import type {CalculationSnapshot} from '../src/engine/types';

const texts=(svg:string)=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&'));
const capped=calculate(cappedDemonstrationProject()),demo=calculate(demonstrationProject()),newColumn=calculate(newColumnDemonstrationProject());
const cappedSet=drawingSheetSet(capped),demoSet=drawingSheetSet(demo),newColumnSet=drawingSheetSet(newColumn);
const si=(s:CalculationSnapshot)=>{const v=structuredClone(s);v.input.units='SI';return v;};
// The three demonstrations as issued, and the same sets drawn in SI units.
let drawn:Record<string,ReturnType<typeof drawingSheetSet>>|undefined;
const sets=()=>drawn??=({demo:demoSet,capped:cappedSet,newColumn:newColumnSet,demoSI:drawingSheetSet(si(demo)),cappedSI:drawingSheetSet(si(capped)),newColumnSI:drawingSheetSet(si(newColumn))});

describe('issued drawing set',()=>{
 it('leads with the cover sheet and numbers every sheet in the set',()=>{
  for(const set of [cappedSet,demoSet]){
   expect(set[0].number).toBe('S-00');
   set.forEach((sheet,i)=>{expect(sheet.svg).toContain(`${i+1} OF ${set.length}`);expect(sheet.svg).toContain(`SHEET ${sheet.number}`);});
  }
  // Cover, general arrangement and the details on as few sheets as fit: one for the rolled
  // demonstration, two for the capped and new-column demonstrations.
  expect(demoSet.map(v=>v.number)).toEqual(['S-00','S-01','S-02']);
  expect(cappedSet.map(v=>v.number)).toEqual(['S-00','S-01','S-02','S-03']);
  // The new-column set adds the new-column and bracing details on a third detail sheet.
  expect(newColumnSet.map(v=>v.number)).toEqual(['S-00','S-01','S-02','S-03','S-04']);
  for(const set of [demoSet,cappedSet,newColumnSet])for(const sheet of set.slice(2)){const n=sheet.svg.match(/data-view-title="below"/g)!.length;expect(n,sheet.number).toBeGreaterThanOrEqual(8);expect(n,sheet.number).toBeLessThanOrEqual(12);}
  expect(sheetIndex(capped).map(v=>v.title)).toEqual(cappedSet.map(v=>v.title));
  const index=texts(cappedSet[0].svg).join(' | ');
  for(const sheet of cappedSet.slice(1))expect(index).toContain(`${sheet.number} | ${sheet.title}`);
 },120000);
 it('resolves every token, detail number and sheet reference',()=>{
  for(const [name,set] of Object.entries(sets())){
   const numbers=new Set(set.map(v=>v.number)),refs=new Set(detailReferences(set).values());
   for(const sheet of set){
    expect(sheet.svg,`${name} ${sheet.number}`).not.toMatch(/\{\{|NOT IN SET|NaN|undefined|Infinity|data-overflow/);
    const words=texts(sheet.svg).join(' ');
    // Every sheet reference names a sheet of this set, and every detail reference a detail drawn on it.
    for(const ref of words.match(/\b(?:S|SK)-\d\d\b/g)??[])expect(numbers.has(ref),`${name} ${sheet.number} refers to ${ref}`).toBe(true);
    for(const ref of words.match(/\b\d+\/S-\d\d\b/g)??[])expect(refs.has(ref),`${name} ${sheet.number} refers to detail ${ref}`).toBe(true);
    const details=[...sheet.svg.matchAll(/data-detail-title="[^"]*">(?:(?!<\/g>)[\s\S])*?font-weight="700">(\d+)<\/text>/g)].map(m=>Number(m[1]));
    expect(details).toEqual(details.map((_,i)=>i+1));
   }
  }
 },300000);
 it('prints standard text heights inside the drawing area, clear of the title band and seal',()=>{
  for(const [name,set] of Object.entries(sets()))for(const sheet of set){
   // Content group only: the title band keeps its own sizes.
   const content=sheet.svg.slice(sheet.svg.indexOf('<g data-sheet-content'),sheet.svg.indexOf('<g data-title-block'));
   for(const e of sheetEntities(content,'US')){
    const at=e.type==='text'?[e.at]:e.type==='line'?[e.a,e.b]:e.type==='circle'?[e.center]:e.points;
    for(const [x,y] of at){
     // Paper inches, origin at the lower left: inside the border and above the 2-in title band.
     expect(x,`${name} ${sheet.number}`).toBeGreaterThanOrEqual(.5);expect(x,`${name} ${sheet.number}`).toBeLessThanOrEqual(35.5);
     expect(y,`${name} ${sheet.number}`).toBeGreaterThanOrEqual(2.5-1e-6);expect(y,`${name} ${sheet.number}`).toBeLessThanOrEqual(23.5);
     // The 2.5-in seal box at the lower right stays clear.
     expect(x>33&&y<5,`${name} ${sheet.number} enters the seal box`).toBe(false);
    }
    // No text under about 0.09 in (6.5 points); cap height is 0.716 of the font size.
    if(e.type==='text')expect(e.height/.716*72,`${name} ${sheet.number} "${e.value}"`).toBeGreaterThanOrEqual(6.5-1e-6);
   }
  }
 },300000);
 it('resolves detail references by title across sheets',()=>{
  const sheets=resolveSheetSet([
   {number:'S-01',name:'a',title:'A',svg:`<svg>${viewTitle(0,0,'PLAN','NTS')}${viewTitle(0,0,'ELEVATION','NTS')}</svg>`},
   {number:'S-02',name:'b',title:'B',svg:`<svg><text>SEE ${detailRef('ELEVATION')} AND ${detailRef('MISSING')}</text></svg>`}
  ]);
  expect(sheets[1].svg).toContain('SEE 2/S-01 AND MISSING (NOT IN SET)');
  expect(sheets[0].svg).toContain('>S-01<');
 });
});

describe('drawings agree with the calculation',()=>{
 it('labels runway elevations from the surveyed seat or entered rail elevation',()=>{
  const p=capped.input,e=runwayElevations(p)!,s01=texts(cappedSet[1].svg);
  expect(e.source).toBe(p.existingColumn?.enabled?'surveyed column seat':'entered top of rail');
  expect(s01).toContain(`T.O.R. EL. ${drawingLength(e.tor,p.units)}`);
  expect(s01).toContain(`T.O.S. EL. ${drawingLength(e.tos,p.units)}`);
  expect(e.tor-e.tos).toBeCloseTo(p.railHeight+(p.section.kind==='cap'?p.section.capTw:0),6);
  const entered=structuredClone(demonstrationProject());delete entered.existingColumn;entered.drawing!.railElevation=6096;
  const t=runwayElevations(entered)!;expect(t.source).toBe('entered top of rail');expect(t.tor).toBeCloseTo(entered.drawing!.datumElevation+6096,6);
  delete entered.drawing!.railElevation;expect(runwayElevations(entered)).toBeUndefined();
  expect(calculate(entered).checks.find(c=>c.id==='drawing-elevation')?.status).toBe('incomplete');
 },240000);
 it('schedules every girder piece with its calculated length',()=>{
  const p=capped.input,marks=girderMarks(p),schedule=texts(cappedSet[1].svg);
  expect(marks.reduce((a,g)=>a+g.length,0)).toBeLessThanOrEqual(p.spans.reduce((a,b)=>a+b,0));
  for(const mark of new Set(marks.map(g=>g.mark))){
   const all=marks.filter(g=>g.mark===mark),i=schedule.indexOf(mark,schedule.indexOf('RUNWAY GIRDER SCHEDULE'));
   expect(i).toBeGreaterThan(-1);
   expect(schedule.slice(i,i+12)).toContain(String(all.length*2));
   expect(schedule.slice(i,i+12)).toContain(drawingLength(all[0].length,p.units));
  }
  expect(schedule.join(' ')).toContain(`(CRANE SPAN) TO ${drawingLength(p.details!.criteria.railGauge,p.units)}`);
 },120000);
 it('tabulates the calculated support reactions and crane data on the cover',()=>{
  const p=capped.input,cover=texts(cappedSet[0].svg).join(' | '),r=capped.supportReactions!;
  for(const v of r.supports)for(const value of [v.D,v.Cd,v.Cv,v.Ci,v.Css])expect(cover).toContain(format(value,'force',p.units,2).toUpperCase());
  expect(cover).toContain(drawingLength(p.details!.criteria.railGauge,p.units));
  for(const c of p.cranes)expect(cover).toContain(`CRANE DATA · ${c.name.toUpperCase()}`);
  expect(cover).toContain('DEMONSTRATION - NOT FOR CONSTRUCTION');
  // Wheel load diagram per crane, and the runway combinations the calculation applies.
  for(const c of p.cranes){expect(cappedSet[0].svg).toContain(`data-wheel-diagram="${c.id}"`);expect(cover).toContain(`WHEEL LOADS · ${c.name.toUpperCase()}`);}
  expect(cover).toContain(`LOAD COMBINATIONS · RUNWAY GIRDER (${p.method})`);expect(cover).toContain('1.2(D+CDM)+1.6(CVM+CSS+CLS)+L');
 },120000);
 it('labels each wheel load in the diagram only when the wheels are far enough apart (one label for bogies)',()=>{
  const close=structuredClone(capped);close.input.cranes[0].wheels=[0,150,3000,3150].map(offset=>({...capped.input.cranes[0].wheels[0],offset}));
  const cover=texts(coverSheetSvg(close,[])).join(' | ');
  expect(cover).toContain('WHEEL LOADS, MAX.');
  expect(texts(cappedSet[0].svg).join(' | ')).not.toContain('WHEEL LOADS, MAX.');
 });
 it('keeps text clear of other text and of leader and dimension lines',()=>{
  // Text boxes from Arial advance widths, cap height to descender, in sheet points; slightly shrunk so
  // touching descenders and title underlines are tolerated.
  type Box={x0:number;y0:number;x1:number;y1:number};
  const overlap=(a:Box,b:Box)=>a.x0<b.x1&&b.x0<a.x1&&a.y0<b.y1&&b.y0<a.y1;
  const crosses=(p:number[],q:number[],r:Box)=>{let t0=0,t1=1;const dx=q[0]-p[0],dy=q[1]-p[1];
   for(const [a,b] of [[-dx,p[0]-r.x0],[dx,r.x1-p[0]],[-dy,p[1]-r.y0],[dy,r.y1-p[1]]]){if(a===0){if(b<0)return false;continue;}const t=b/a;if(a<0){if(t>t1)return false;t0=Math.max(t0,t);}else{if(t<t0)return false;t1=Math.min(t1,t);}}
   return t1-t0>1e-6;};
  for(const [name,set] of Object.entries(sets()))for(const sheet of set){
   const content=sheet.svg.slice(sheet.svg.indexOf('<g data-sheet-content'),sheet.svg.indexOf('<g data-title-block'));
   const entities=sheetEntities(content,'US'),pt=(q:number[])=>[q[0]*72,1728-q[1]*72];
   const boxes=entities.flatMap(e=>{
    if(e.type!=='text')return [];
    const size=e.height*72/.716,w=textWidth(e.value,size,e.bold),[x,y]=pt(e.at),a=e.align===1?-w/2:e.align===2?-w:0,m=size*.12;
    const box=Math.abs(e.angle)<1?{x0:x+a,x1:x+a+w,y0:y-size*.72,y1:y+size*.21}:e.angle>0?{x0:x-size*.72,x1:x+size*.21,y0:y-a-w,y1:y-a}:{x0:x-size*.21,x1:x+size*.72,y0:y+a,y1:y+a+w};
    return [{value:e.value,box:{x0:box.x0+m,x1:box.x1-m,y0:box.y0+m,y1:box.y1-m*2}}];
   });
   for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)expect(overlap(boxes[i].box,boxes[j].box),`${name} ${sheet.number}: "${boxes[i].value}" overlaps "${boxes[j].value}"`).toBe(false);
   for(const e of entities){
    if((e.type!=='line'&&e.type!=='poly')||e.layer!=='S-ANNO')continue;
    const points=(e.type==='line'?[e.a,e.b]:e.points).map(pt);
    for(let k=1;k<points.length;k++)for(const b of boxes)expect(crosses(points[k-1],points[k],b.box),`${name} ${sheet.number}: line through "${b.value}"`).toBe(false);
   }
  }
 },300000);
 it('tabulates one factored bracket force envelope per set, mirror-symmetric for the symmetric runways',()=>{
  const title='BRACKET DESIGN FORCES / FACTORED LRFD ENVELOPE';
  for(const [s,set,at] of [[demo,demoSet,'S-02'],[capped,cappedSet,'S-03'],[newColumn,newColumnSet,'S-02']] as const){
   const holding=set.filter(v=>texts(v.svg).includes(title));
   expect(holding.map(v=>v.number)).toEqual([at]);
   const cells=texts(holding[0].svg),f=s.detailResults!.bracketForces!,kip=(v:number)=>format(v,'force','US',2).toUpperCase();
   expect(cells.filter(v=>v===title)).toHaveLength(1);expect(f).toHaveLength(4);
   // Mirror images: equal reactions, opposite end moments, and both signs at the interior grids.
   const V=f.map(v=>v.maxVertical.vertical),M=f.map(v=>v.maxMoment.moment);
   expect(V[3]).toBeCloseTo(V[0],6);expect(V[2]).toBeCloseTo(V[1],6);expect(M[3]).toBeCloseTo(-M[0],3);expect(M[0]).toBeGreaterThan(0);
   expect(f[1].reversible.vertical&&f[2].reversible.vertical&&f[1].reversible.moment).toBe(true);expect(Math.abs(M[2])).toBeCloseTo(Math.abs(M[1]),3);
   for(const v of f)expect(cells).toContain(kip(v.maxVertical.vertical));
   expect(cells).toContain(`±${format(Math.abs(f[1].maxVertical.moment),'moment','US',2).toUpperCase()}`);
   // Longitudinal force at the three locating bearings, none at the sliding end; the bumper governs.
   expect(f.map(v=>Math.abs(v.longitudinal.longitudinal)>0)).toEqual([true,true,true,false]);
   expect(cells).toContain(`±${kip(Math.abs(f[0].longitudinal.longitudinal))} (8)`);expect(cells).toContain(`±${kip(Math.abs(f[0].top.top))} (${f[0].top.combination.split(' ')[1].toUpperCase()})`);
  }
  // The bracket is checked for the same concurrent sets, so its governing rows mirror too.
  const st=capped.detailResults!.bracket!.stations;expect(st[3].vertical).toBeCloseTo(st[0].vertical,6);expect(st[3].leftRib).toBeCloseTo(st[0].rightRib,6);
  // The supports and the cover refer to the table instead of repeating it.
  expect(texts(cappedSet[2].svg).join(' ')).toContain('FACTORED FORCES: BRACKET DESIGN FORCES ON S-03.');
  expect(texts(demoSet[0].svg).join(' ')).toContain('BRACKET DESIGN FORCES ON S-02');
 },120000);
});

describe('issue status',()=>{
 const issued=(patch:(s:CalculationSnapshot)=>void)=>{const s=structuredClone(capped);s.input.reportPurpose='project';patch(s);return issueStatus(s);};
 it('only issues validated, sealed-ready packages',()=>{
  expect(issueStatus(capped).label).toBe('DEMONSTRATION - NOT FOR CONSTRUCTION');
  const preliminary=issued(()=>{});expect(preliminary.issued).toBe(false);expect(preliminary.reasons).toContain('Enter the engineer of record, firm and license');expect(preliminary.reasons).toContain('Select an issue purpose');
  // Structure the calculation leaves unchecked needs the engineer's evaluation referenced before issue.
  const unreferenced=issued(s=>{s.input.drawing!.eor={name:'A. Engineer',firm:'Firm',license:'12345',jurisdiction:'CA'};s.input.drawing!.issue='permit';s.input.drawing!.code={building:'2021 IBC',editions:'2016',reviewed:false};});
  expect(unreferenced.reasons).toEqual(['Reference the engineer of record\'s evaluation of the structure not checked by this calculation']);
  const ready=issued(s=>{s.input.drawing!.eor={name:'A. Engineer',firm:'Firm',license:'12345',jurisdiction:'CA'};s.input.drawing!.issue='permit';s.input.drawing!.code={building:'2021 IBC',editions:'2016',reviewed:false};s.input.drawing!.existingEvaluation='Existing structure evaluation, report 24-117';});
  expect(ready).toEqual({issued:true,label:'ISSUED FOR PERMIT',reasons:[]});
  // A jurisdiction on the 2022 editions needs the engineer's review of this 360-16 / 7-16 calculation.
  const newer=issued(s=>{s.input.drawing!.eor={name:'A. Engineer',firm:'Firm',license:'12345',jurisdiction:'CA'};s.input.drawing!.issue='permit';s.input.drawing!.code={building:'2024 IBC',editions:'2022',reviewed:false};s.input.drawing!.existingEvaluation='Report 24-117';});
  expect(newer.reasons).toEqual(['Confirm the engineer of record has reviewed this design against AISC 360-22 and ASCE 7-22']);
  const reviewed=issued(s=>{s.input.drawing!.eor={name:'A. Engineer',firm:'Firm',license:'12345',jurisdiction:'CA'};s.input.drawing!.issue='permit';s.input.drawing!.code={building:'2024 IBC',editions:'2022',reviewed:true};s.input.drawing!.existingEvaluation='Report 24-117';});
  expect(reviewed.issued).toBe(true);
  const failed=issued(s=>{s.input.drawing!.eor={name:'A. Engineer',firm:'Firm',license:'12345',jurisdiction:'CA'};s.input.drawing!.issue='construction';s.checks=[...s.checks,{...s.checks[0],id:'x',status:'fail'}];});
  expect(failed.issued).toBe(false);expect(failed.reasons).toContain('Resolve 1 failed check');
 });
});

describe('sheet text layout',()=>{
 it('measures and wraps text to a width',()=>{
  expect(textWidth('W',10)).toBeCloseTo(9.44,2);expect(textWidth('ii',10)).toBeCloseTo(4.44,2);expect(textWidth('A',10,true)).toBeGreaterThan(textWidth('A',10));
  const rows=wrapToWidth('VERIFY ALL DIMENSIONS AND EXISTING CONDITIONS BEFORE FABRICATION',100,6);
  expect(rows.length).toBeGreaterThan(1);for(const r of rows)expect(textWidth(r,6)).toBeLessThanOrEqual(100);
 });
 it('gives a detail in a taller cell a larger standard scale only while drawing it',()=>{
  expect(sheetDrawingScale(.24,'US').label).toBe(`SCALE: 1" = 1'-0"`);
  expect(withDetailRoom(1.5,()=>sheetDrawingScale(.24,'US').label)).toBe(`SCALE: 1 1/2" = 1'-0"`);
  expect(sheetDrawingScale(.24,'US').label).toBe(`SCALE: 1" = 1'-0"`);
  expect(sheetDrawingScale(.22,'SI').label).toBe('SCALE: 1:20');expect(withDetailRoom(4/3,()=>sheetDrawingScale(.22,'SI').label)).toBe('SCALE: 1:10');
 });
 it('draws every demonstration detail as clear at the larger scale of a taller cell',()=>{
  for(const snapshot of [capped,demo,newColumn])for(const units of ['US','SI'] as const){
   const s=structuredClone(snapshot);s.input.units=units;
   for(const t of detailTopics(s))for(const view of t.views){
    const standard=view.render(),roomy=withDetailRoom(4/3,()=>view.render());
    expect(annotationClashes(roomy.svg),`${s.input.number} ${units} ${view.title} at ${roomy.scale}`).toBeLessThanOrEqual(annotationClashes(standard.svg));
   }
  }
 },120000);
 it('counts linework through text and overlapping text as annotation clashes',()=>{
  expect(annotationClashes(text(0,0,'LABEL')+line([-5,8],[40,8]))).toBe(0);
  expect(annotationClashes(text(0,0,'LABEL')+line([-5,-3],[40,-3]))).toBe(1);
  expect(annotationClashes(text(0,0,'LABEL')+text(10,2,'OTHER'))).toBe(1);
 });
 it('lands a leader on the label end facing its target',()=>{
  expect(multiLeader([[300,50]],[100,80],['LABEL'])).toContain('data-landing="right"');
  expect(multiLeader([[50,50]],[100,80],['LABEL'])).not.toContain('data-landing');
 });
});

describe('drawing set DXF',()=>{
 const dxf=sheetsDxf(cappedSet,'US'),pairs=dxf.trimEnd().split('\n');
 const records=()=>{const out:Map<number,string>[]=[];let cur:Map<number,string>|undefined;for(let i=0;i+1<pairs.length;i+=2){const code=Number(pairs[i]),value=pairs[i+1];if(code===0){cur=new Map();out.push(cur);}cur?.set(code,cur.has(code)?`${cur.get(code)}|${value}`:value);}return out;};
 it('writes a complete AutoCAD 2000 file with unique handles',()=>{
  expect(pairs.length%2).toBe(0);
  expect(dxf.startsWith('0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n')).toBe(true);
  expect(dxf.endsWith('0\nEOF\n')).toBe(true);
  for(const section of ['HEADER','CLASSES','TABLES','BLOCKS','ENTITIES','OBJECTS'])expect(dxf).toContain(`0\nSECTION\n2\n${section}\n`);
  for(const table of ['VPORT','LTYPE','LAYER','STYLE','VIEW','UCS','APPID','DIMSTYLE','BLOCK_RECORD'])expect(dxf).toContain(`0\nTABLE\n2\n${table}\n`);
  const handles:string[]=[],body=pairs.indexOf('ENDSEC')+1;for(let i=body+body%2;i+1<pairs.length;i+=2)if(pairs[i]==='5'||pairs[i]==='105')handles.push(pairs[i+1]);
  expect(new Set(handles).size).toBe(handles.length);
  const seed=parseInt(dxf.match(/\$HANDSEED\n5\n([0-9A-F]+)/)![1],16);expect(Math.max(...handles.map(h=>parseInt(h,16)))).toBeLessThan(seed);
  for(const r of records().filter(r=>['LINE','LWPOLYLINE','CIRCLE','TEXT','SOLID'].includes(r.get(0)!)))expect(Object.keys(sheetLayers)).toContain(r.get(8));
 },120000);
 it('carries every sheet line, shape and note to paper-scale CAD entities',()=>{
  const all=records(),count=(type:string)=>all.filter(r=>r.get(0)===type).length,svg=cappedSet.map(v=>v.svg).join('');
  expect(count('LINE')).toBe((svg.match(/<line /g)??[]).length);
  expect(count('CIRCLE')).toBe((svg.match(/<circle /g)??[]).length);
  expect(count('TEXT')).toBe(texts(svg).filter(t=>t.trim()).length);
  const s01=sheetEntities(cappedSet[1].svg,'US'),border=s01.find(e=>e.type==='poly'&&e.layer==='G-TTLB');
  // ARCH D border 0.5 in inside the trim: 35 x 23 in.
  expect(border&&border.type==='poly'&&border.points.map(p=>p.map(v=>+v.toFixed(3)))).toEqual([[.5,23.5],[35.5,23.5],[35.5,.5],[.5,.5]]);
  const rotated=s01.find(e=>e.type==='text'&&e.angle!==0);expect(rotated&&rotated.type==='text'&&rotated.angle).toBe(90);
  const text=all.find(r=>r.get(0)==='TEXT'&&r.get(1)==='SHEET S-01');expect(text?.get(7)).toBe('ARIAL-BOLD');
  expect(Number(text?.get(10))).toBeGreaterThan(36);
 },120000);
 it('exports SI sheets in millimetres and only from a validated calculation',()=>{
  const si=sheetsDxf([cappedSet[1]],'SI');expect(si).toContain('$INSUNITS\n70\n4');
  const border=sheetEntities(cappedSet[1].svg,'SI').find(e=>e.type==='poly'&&e.layer==='G-TTLB');
  expect(border&&border.type==='poly'&&+border.points[1][0].toFixed(2)).toBe(901.7);
  expect(()=>drawingSetDxf({...capped,eligible:false})).toThrow('validated');
 });
});
