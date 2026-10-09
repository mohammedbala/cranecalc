import { describe,expect,it } from 'vitest';
import { aiscWShapes,loadAiscSection,matchesAiscSection } from '../src/data/aiscSections';
import { referenceColumns,referenceCrossheads } from '../src/data/aiscReferenceShapes';
import { exampleProject,migrateExampleSection } from '../src/engine/defaults';
import { validateProject,calculate } from '../src/engine/calculate';
import { sectionProperties } from '../src/engine/section';
import { toDisplay } from '../src/engine/units';
import { reportHtml } from '../server/report';

describe('Pinned AISC v16 W-section catalogue',()=>{
 it('defaults to W24X84 and uses the independent US source cells, including J and Cw units',()=>{
  const s=exampleProject.section;expect(s.kind).toBe('rolled');expect(s.name).toBe('W24X84');
  // Database v16.0 row 123: G/L/Q/T/F/AM/AQ/AO/AS/AN/AR/AX/AY.
  const expected={d:24.1,bf:9.02,tw:.47,tf:.77,A:24.7,Ix:2370,Iy:94.4,Sx:196,Sy:20.9,Zx:224,Zy:32.6,J:3.7,Cw:12800};
  for(const [key,value] of Object.entries(expected)){
   const k=key as keyof typeof expected,q=['d','bf','tw','tf'].includes(key)?'length':key==='A'?'area':['Ix','Iy','J'].includes(key)?'inertia':key==='Cw'?'warping':'modulus';
   expect(toDisplay(s[k],q,'US')).toBeCloseTo(value,7);
  }
  const properties=sectionProperties(s);expect(properties.Ix).toBe(2370*25.4**4);expect(properties.Cw).toBe(12800*25.4**6);
  expect(s.propertySource).toContain('row 123');expect(validateProject(exampleProject)).toEqual([]);
 });
 it('makes all 289 catalogue entries available, including small shapes, with intact provenance',()=>{
  expect(aiscWShapes).toHaveLength(289);expect(new Set(aiscWShapes.map(s=>s.name)).size).toBe(289);
  for(const shape of aiscWShapes){
   const p=structuredClone(exampleProject);p.section=loadAiscSection(p.section,shape.name);
   expect(validateProject(p),shape.name).toEqual([]);expect(matchesAiscSection(p.section)).toBe(true);
  }
  for(const shape of [...referenceColumns,...referenceCrossheads]){
   const catalogue=aiscWShapes.find(s=>s.name===shape.name)!;expect(catalogue.row).toBe(shape.row);
   for(const k of ['d','bf','tf','tw'] as const)expect(catalogue[k]).toBeCloseTo(shape[k],9);
  }
 });
 it('updates all properties together without replacing the material or mutating the original',()=>{
  const before=JSON.stringify(exampleProject.section),s=loadAiscSection({...exampleProject.section,Fy:250},'W30X99');
  expect(s.Fy).toBe(250);expect(s.name).toBe('W30X99');expect(s.A).toBe(29*25.4**2);expect(s.Ix).toBe(3990*25.4**4);expect(s.Cw).toBe(26800*25.4**6);
  expect(JSON.stringify(exampleProject.section)).toBe(before);expect(()=>loadAiscSection(s,'W99X99')).toThrow('Unknown');
 });
 it('rejects stale or tampered catalogue claims after import and on report calculation',()=>{
  for(const key of ['d','Ix','Cw','name','propertySource','catalogueId'] as const){
   const p=structuredClone(exampleProject);
   if(typeof p.section[key]==='number')(p.section[key] as number)*=1.1;else (p.section[key] as string)='Altered';
   expect(validateProject(p).some(e=>e.includes('selected AISC'))).toBe(true);expect(calculate(p).eligible).toBe(false);
  }
 });
 it('retains the selected shape and tabulated source in a validated analysis report',()=>{
  const p=structuredClone(exampleProject);p.scope='analysis';p.section=loadAiscSection(p.section,'W30X99');
  const snapshot=calculate(p),html=reportHtml(snapshot);expect(html).toContain('W30X99');expect(html).toContain('row 88');expect(html).toContain('3,990 in⁴');expect(snapshot.eligible).toBe(true);
 });
 it('upgrades the untouched legacy example section and preserves customized geometry and project inputs',()=>{
  const p=structuredClone(exampleProject);p.title='Saved project';p.section={...p.section,kind:'welded',name:'Welded I · 24 × 10',d:609.6,bf:254,tf:19.05,tw:12.7,propertySource:'',catalogueId:undefined,A:.0001,Ix:.0001,Iy:.0001,Sx:.0001,Sy:.0001,Zx:.0001,Zy:.0001,J:.0001,Cw:.0001};
  const migrated=migrateExampleSection(p);expect(migrated.section.name).toBe('W24X84');expect(migrated.title).toBe(p.title);expect(migrated.cranes).toEqual(p.cranes);
  p.section.d=650;expect(migrateExampleSection(p)).toBe(p);
 });
});
