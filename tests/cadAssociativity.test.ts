import {describe,expect,it} from 'vitest';
import {calculate} from '../src/engine/calculate';
import {demonstrationProject} from '../src/engine/demonstration';
import {drawingSheetSet} from '../src/components/planSheet';
import {docFromSheet} from '../src/cad/convert';
import {editSet,isModified,replay,signature,stamp} from '../src/cad/tracking';
import {refreshCells,scheduleCells,schedules} from '../src/cad/schedules';
import {parseCadDoc} from '../src/cad/validate';
import type {CadDoc,Ent} from '../src/cad/model';
import {blank,setup} from './cadHarness';

const gen=(entities:Ent[]):CadDoc=>({...blank(),entities,nextId:entities.length+1});
const L=(id:number,y:number):Ent=>({id,type:'line',layer:'0',a:[0,y],b:[10,y]});

describe('CAD associativity: edits as a change set over the generated drawing',()=>{
 it('tells generated, modified, added and deleted objects apart',()=>{
  const s=setup(stamp(gen([L(1,0),L(2,1),L(3,2)])));
  s.store.commit('move',{put:[{...s.store.get(1)!,a:[0,5]} as Ent]});s.store.commit('del',{del:[2]});s.store.commit('add',{add:[{type:'circle',layer:'0',center:[0,0],radius:1}]});
  s.store.select([3]);s.run('COPY',[0,0],[0,10],null);
  const es=editSet(s.store.doc)!;expect(es.modified.map(e=>e.id)).toEqual([1]);expect(es.deleted).toHaveLength(1);expect(es.added.map(e=>e.type)).toEqual(['circle','line']);
  expect(isModified(s.store.get(3)!)).toBe(false);expect(s.store.doc.entities.at(-1)!.src).toBeUndefined();
 });
 it('replays the edits on a regenerated drawing: generated objects follow the design, edits carry, lost originals are flagged',()=>{
  const s=setup(stamp(gen([L(1,0),L(2,1),L(3,2),L(4,3)])));
  s.store.commit('move',{put:[{...s.store.get(1)!,b:[20,0]} as Ent,{...s.store.get(4)!,b:[30,3]} as Ent]});s.store.commit('del',{del:[2]});
  s.store.commit('add',{add:[{type:'text',layer:'0',at:[1,1],height:.1,value:'NOTE',angle:0,align:0,bold:false}]});
  s.store.commit('group',{groups:[{name:'G',ids:[1,5]}]});
  // The design changed: line 3 moved, line 4 is gone, a line 5 appeared.
  const next=gen([L(1,0),L(2,1),{...L(3,2),a:[0,2.5]} as Ent,L(5,9)]);
  const r=replay(s.store.doc,next)!;
  expect(r.carried).toEqual({added:1,modified:1,deleted:1});expect(r.conflicts).toHaveLength(1);
  const lines=r.doc.entities.filter(e=>e.type==='line') as Extract<Ent,{type:'line'}>[];
  expect(lines.map(l=>[l.a[1],l.b[0]])).toEqual([[0,20],[2.5,10],[9,10],[3,30]]);
  expect(r.doc.entities.find(e=>e.type==='text')).toBeTruthy();
  expect(r.doc.groups?.[0].ids).toHaveLength(2);expect(editSet(r.doc)!.modified).toHaveLength(1);
  expect(parseCadDoc(JSON.parse(JSON.stringify(r.doc)))?.generatedSigs).toHaveLength(4);
 });
 it('carries edits on a real sheet across a design change',()=>{
  const p=demonstrationProject(),a=calculate(p),sa=drawingSheetSet(a)[0];
  const s=setup(stamp(docFromSheet(sa,'US')));
  s.store.commit('note',{add:[{type:'text',layer:'S-ANNO',at:[2,2],height:.125,value:'CARRIED NOTE',angle:0,align:0,bold:false}]});
  const victim=s.store.doc.entities.find(e=>e.type==='line')!;s.store.commit('del',{del:[victim.id]});
  const b=calculate({...p,number:`${p.number}-B`}),r=replay(s.store.doc,docFromSheet(drawingSheetSet(b)[0],'US'))!;
  expect(r.doc.entities.some(e=>e.type==='text'&&e.value==='CARRIED NOTE')).toBe(true);
  expect(r.doc.entities.some(e=>e.src===victim.src&&signature(e)===victim.src)).toBe(false);
 });
});

describe('CAD associativity: schedules from the design',()=>{
 const sc=schedules(calculate(demonstrationProject()));
 it('lists the members, bolt groups and welds of the design',()=>{
  expect(sc.members.rows[0][0]).toBe('RG1');expect(sc.members.rows.some(r=>r[1]==='CRANE RAIL')).toBe(true);
  expect(sc.bolts.rows.length).toBeGreaterThan(0);expect(sc.welds.rows.every(r=>r[1]==='FILLET'&&r[4].startsWith('E'))).toBe(true);
 });
 it('refreshes cells the user left alone and keeps (and counts) overrides',()=>{
  const old=[['A','1'],['B','2']],cells=[['A','1'],['B','EDITED']];
  const r=refreshCells(cells,old,[['A','9'],['B','3']]);expect(r.cells).toEqual([['A','9'],['B','EDITED']]);expect(r.overridden).toBe(1);expect(r.changed).toBe(1);
 });
 it('SCHEDULE places a live table from the design',()=>{
  const s=setup();s.env.schedules=()=>sc;s.run('SCHEDULE','B',[1,20]);
  const t=s.store.doc.entities[0];expect(t).toMatchObject({type:'table',source:'bolts',header:2});
  expect(t.type==='table'&&t.cells).toEqual(scheduleCells(sc.bolts));expect(t.type==='table'&&t.generated).toEqual(scheduleCells(sc.bolts));
 });
});
