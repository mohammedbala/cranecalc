import {describe,expect,it} from 'vitest';
import {validateProject} from '../src/engine/calculate';
import {newColumnDemonstrationProject} from '../src/engine/demonstration';
import {existingLayout,existingLayoutChecks,planClear} from '../src/engine/existingLayout';
import {aiscShapeByName} from '../src/data/aiscSections';
import {projectSchema} from '../src/engine/types';
import {references} from '../src/engine/references';
import katex from 'katex';

const inch=25.4,foot=304.8;
const separation={across:10,along:12,building:1.5*inch,buildingEntered:true,required:40};
const checks=(p=newColumnDemonstrationProject(),sep:typeof separation|undefined=separation)=>Object.fromEntries(existingLayoutChecks(p,sep).map(c=>[c.id,c]));

describe('surveyed existing building beside new freestanding columns',()=>{
 it('measures the least clear distances in plan from the new steel and footings to the existing columns and footings',()=>{
  const p=newColumnDemonstrationProject(),r=existingLayout(p)!,w=aiscShapeByName('W14X120')!;
  expect(r.lines.map(l=>[l.line,l.columns.length])).toEqual([['A',4],['B',4]]);
  // W12X40 columns 6 ft outboard of the W14X120 columns at every grid; 4 ft footings beside the 6'-6" footings.
  expect(r.steel!.clear).toBeCloseTo(6*foot-w.d*inch/2-11.9*inch/2,6);
  expect(r.steel!.part).toBe('column');
  expect(r.footing!.clear).toBeCloseTo(9*inch,6);
  // Equal clearances at every grid: the one reported is an interior grid, where the drawing dimensions it.
  expect([1,2]).toContain(r.steel!.grid);expect(r.footing!.line).toBe('A');
  expect(planClear({x0:0,x1:1,u0:0,u1:1},{x0:4,x1:5,u0:5,u1:6})).toBeCloseTo(5,9);
  expect(planClear({x0:0,x1:10,u0:0,u1:10},{x0:4,x1:5,u0:8,u1:16})).toBe(-2);
 });
 it('checks the steel against the seismic separation and the footings against their minimum',()=>{
  const c=checks(),r=existingLayout(newColumnDemonstrationProject())!;
  expect(c['existing-steel-clear']).toMatchObject({status:'pass',demand:40,group:'New column base'});
  expect(c['existing-steel-clear'].capacity).toBeCloseTo(r.steel!.clear,6);
  expect(c['existing-footing-clear']).toMatchObject({status:'pass',demand:6*inch});
  expect(c['existing-footing-clear'].utilization).toBeCloseTo(6/9,6);
  expect(c['existing-steel-clear'].note).toContain('§12.12.3');
  for(const v of Object.values(c)){
   for(const tex of [v.equation,v.substitution!])expect(()=>katex.renderToString(tex,{throwOnError:true})).not.toThrow();
   for(const id of v.referenceIds)expect(references.some(r=>r.id===id)).toBe(true);
  }
  // Without seismic design the new steel only has to stay clear of the existing columns.
  expect(existingLayoutChecks(newColumnDemonstrationProject()).find(v=>v.id==='existing-steel-clear')).toMatchObject({status:'pass',demand:0});
 });
 it('fails overlapping footings and steel inside the separation, and holds unknown or unsourced data',()=>{
  const near=newColumnDemonstrationProject();near.existingColumn!.adjacent!.A!.offset=5*foot;
  expect(checks(near)['existing-footing-clear'].status).toBe('fail');
  expect(existingLayout(near)!.footing!.clear).toBeCloseTo(-3*inch,6);
  const tight=newColumnDemonstrationProject();tight.existingColumn!.adjacent!.B!.offset=7.24*inch+5.95*inch+inch;
  expect(checks(tight)['existing-steel-clear'].status).toBe('fail');
  const unknown=newColumnDemonstrationProject();unknown.existingColumn!.adjacent!.B!.footing={L:0,B:0};
  expect(checks(unknown)['existing-footing-clear'].status).toBe('incomplete');
  const unsourced=newColumnDemonstrationProject();unsourced.existingColumn!.adjacent!.source='';
  expect(Object.values(checks(unsourced)).map(v=>v.status)).toEqual(['unverified','unverified']);
 });
 it('places existing columns on their own spacing, within reach of the runway',()=>{
  const p=newColumnDemonstrationProject(),a=p.existingColumn!.adjacent!;
  a.A={...a.A!,spacing:30*foot,start:-2*foot};delete a.B;
  const r=existingLayout(p)!;
  expect(r.lines.map(l=>l.line)).toEqual(['A']);
  expect(r.lines[0].columns.map(c=>Math.round(c.x/foot*1e6)/1e6)).toEqual([-2,28,58]);
  expect(validateProject(p)).toEqual([]);
  a.A.spacing=100;expect(validateProject(p).some(e=>e.startsWith('existingColumn.adjacent.A.spacing'))).toBe(true);
 });
 it('keeps the inputs optional so earlier project files load and draw as before',()=>{
  const p=newColumnDemonstrationProject();delete p.existingColumn!.adjacent;
  expect(projectSchema.safeParse(p).success).toBe(true);expect(validateProject(p)).toEqual([]);
  expect(existingLayout(p)).toBeUndefined();expect(existingLayoutChecks(p,separation)).toEqual([]);
  const off=newColumnDemonstrationProject();off.existingColumn!.adjacent!.enabled=false;
  expect(existingLayout(off)).toBeUndefined();
 });
});
