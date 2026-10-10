import {describe,expect,it} from 'vitest';
import {calculate} from '../src/engine/calculate';
import {demonstrationProject,cappedDemonstrationProject} from '../src/engine/demonstration';
import {drawingSheetSet,resolveSheetSet,sheetIndex} from '../src/components/planSheet';
import {sheetsDxf,sheetEntities,drawingSetDxf,sheetLayers} from '../src/components/sheetDxf';
import {runwayElevations,issueStatus,girderMarks} from '../src/engine/drawingData';
import {drawingLength} from '../src/components/drawingFormat';
import {multiLeader,textWidth,wrapToWidth,viewTitle,detailRef} from '../src/components/sheetGraphics';
import {format} from '../src/engine/units';
import type {CalculationSnapshot} from '../src/engine/types';

const texts=(svg:string)=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&'));
const capped=calculate(cappedDemonstrationProject()),demo=calculate(demonstrationProject());
const cappedSet=drawingSheetSet(capped),demoSet=drawingSheetSet(demo);

describe('issued drawing set',()=>{
 it('leads with the cover sheet and numbers every sheet in the set',()=>{
  for(const set of [cappedSet,demoSet]){
   expect(set[0].number).toBe('S-00');
   set.forEach((sheet,i)=>{expect(sheet.svg).toContain(`${i+1} OF ${set.length}`);expect(sheet.svg).toContain(`SHEET ${sheet.number}`);});
  }
  expect(cappedSet.map(v=>v.number)).toEqual(['S-00','S-01','S-02','S-03','S-04','S-05','S-06']);
  expect(sheetIndex(capped).map(v=>v.title)).toEqual(cappedSet.map(v=>v.title));
  const index=texts(cappedSet[0].svg).join(' | ');
  for(const sheet of cappedSet.slice(1))expect(index).toContain(`${sheet.number} | ${sheet.title}`);
 },120000);
 it('resolves every token, detail number and sheet reference',()=>{
  for(const set of [cappedSet,demoSet]){
   const numbers=new Set(set.map(v=>v.number));
   for(const sheet of set){
    expect(sheet.svg).not.toMatch(/\{\{|NOT IN SET|NaN|undefined|Infinity|data-overflow/);
    for(const ref of texts(sheet.svg).join(' ').match(/\b(?:S|SK)-\d\d\b/g)??[])expect(numbers.has(ref),`${sheet.number} refers to ${ref}`).toBe(true);
    const details=[...sheet.svg.matchAll(/data-detail-title="[^"]*">(?:(?!<\/g>)[\s\S])*?font-weight="700">(\d+)<\/text>/g)].map(m=>Number(m[1]));
    expect(details).toEqual(details.map((_,i)=>i+1));
   }
  }
 },120000);
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
  for(const v of r.supports)for(const value of [v.D,v.Cd,v.Cv,v.Ci,v.Css])expect(cover).toContain(format(value,'force',p.units,3).toUpperCase());
  expect(cover).toContain(drawingLength(p.details!.criteria.railGauge,p.units));
  for(const c of p.cranes)expect(cover).toContain(`CRANE DATA · ${c.name.toUpperCase()}`);
  expect(cover).toContain('DEMONSTRATION - NOT FOR CONSTRUCTION');
 },120000);
 it('lists bracket reactions for every grid',()=>{
  const s05=texts(cappedSet.find(v=>v.number==='S-05')!.svg),stations=capped.detailResults!.bracket!.stations;
  stations.forEach((r,i)=>{const at=s05.indexOf(String(i+1),s05.indexOf('RIGHT RIB'));expect(at).toBeGreaterThan(-1);expect(s05[at+1]).toBe(format(r.vertical,'force',capped.input.units,3).toUpperCase());});
 },120000);
});

describe('issue status',()=>{
 const issued=(patch:(s:CalculationSnapshot)=>void)=>{const s=structuredClone(capped);s.input.reportPurpose='project';patch(s);return issueStatus(s);};
 it('only issues validated, sealed-ready packages',()=>{
  expect(issueStatus(capped).label).toBe('DEMONSTRATION - NOT FOR CONSTRUCTION');
  const preliminary=issued(()=>{});expect(preliminary.issued).toBe(false);expect(preliminary.reasons).toContain('Enter the engineer of record, firm and license');expect(preliminary.reasons).toContain('Select an issue purpose');
  const ready=issued(s=>{s.input.drawing!.eor={name:'A. Engineer',firm:'Firm',license:'12345',jurisdiction:'CA'};s.input.drawing!.issue='permit';});
  expect(ready).toEqual({issued:true,label:'ISSUED FOR PERMIT',reasons:[]});
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
