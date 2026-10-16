import {describe,expect,it} from 'vitest';
import {sheetFixture,sheetFixtureNames} from './fixtures/sheets/sheetFixtures';
import {drawingSheetSet,detailTopics} from '../src/components/planSheet';
import {newColumnDemonstrationProject} from '../src/engine/demonstration';
import {supportReactions} from '../src/engine/supportReactions';
import {sectionProperties} from '../src/engine/section';
import {existingColumnAnalysis,existingColumnSection} from '../src/engine/existingColumn';
import {longitudinalBracingAnalysis} from '../src/engine/longitudinalBracing';
import {bracingSystemAnalysis,bracingSystemChecks,strutBolting} from '../src/engine/newColumnBracing';

const inch=25.4,kip=4448.2216152605;
const texts=(svg:string)=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&')).join(' ');

/**
 * The crane-level strut carries the reversing traction and the crane stop at every column: its joints are pretensioned
 * slip-critical (AIST TR-13 §5.14, RCSC 2014 §4.3), and no drawing specifies snug-tight bolts at a strut or bracing
 * joint. Snug-tight appears only where a sheet prohibits it or flags it as not permitted.
 */
describe('crane-level strut bolting',()=>{
 const templates=sheetFixtureNames().filter(n=>/^t\d\d$/.test(n));
 it.each(templates)('%s: no sheet specifies snug-tight bolts outside a prohibition',name=>{
  const s=sheetFixture(name);
  const all=[...drawingSheetSet(s).map(v=>texts(v.svg)),...detailTopics(s).flatMap(t=>t.views.map(v=>texts(v.render().svg)))].join(' ');
  for(const m of all.matchAll(/SNUG[- ]TIGHT/g)){
   const around=all.slice(Math.max(0,m.index!-260),m.index!+260);
   expect(around,`${name}: ${around}`).toMatch(/NOT PERMITTED/);
  }
  if(s.bracingSystem){
   const bracing=detailTopics(s).filter(t=>t.key==='bracing').flatMap(t=>t.views.map(v=>texts(v.render().svg))).join(' ');
   expect(bracing).toMatch(/PRETENSIONED, SLIP-CRITICAL/);
  }
 });
 it('checks the strut joint for slip (J3.8) with shear and bearing as further limit states',()=>{
  const p=newColumnDemonstrationProject(),column=existingColumnSection(p).section,R=supportReactions(p,sectionProperties(p.section));
  const L=longitudinalBracingAnalysis(p,R,column),C=existingColumnAnalysis(p,R),r=bracingSystemAnalysis(p,R,L,column,C);
  const checks=bracingSystemChecks(p,r,column),slip=checks.find(c=>c.id==='brace-strut-slip')!,b=strutBolting(p);
  expect(b.slipCritical&&b.pretensioned).toBe(true);expect(b.surface).toBe('B');
  // 3/4 in A325: Tb = 28 kip; phi mu Du hf Tb ns = 1.0(0.50)(1.13)(1.0)(28) = 15.8 kip per bolt.
  expect(b.pretension).toBeCloseTo(28*kip,0);
  const n=r.geometry.strut.bolts.length,hf=1;
  expect(slip.capacity).toBeCloseTo(n*(p.method==='LRFD'?1:1/1.5)*.5*1.13*hf*28*kip,0);
  expect(slip.demand).toBeCloseTo(r.strutForce.H,6);
  expect(slip.note).toMatch(/slip-critical/);expect(slip.note).not.toMatch(/snug/i);
  for(const id of ['brace-strut-bolts','brace-strut-bearing'])expect(checks.find(c=>c.id===id)).toBeDefined();
  expect(b.diameter).toBeCloseTo(.75*inch,9);
 });
});
