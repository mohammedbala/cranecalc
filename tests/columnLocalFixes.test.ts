import {describe,expect,it} from 'vitest';
import {newColumnDemonstrationProject} from '../src/engine/demonstration';
import {existingColumnSection} from '../src/engine/existingColumn';
import {bracingDesign,connectionCapacities,webStiffeners,webYieldLine} from '../src/engine/newColumnBracing';
import {bracingChecks,sizeBracing} from '../src/engine/bracingSizing';
import {aiscShapeByName} from '../src/data/aiscSections';
import {baseAt,bracedSupport,footingAction,passiveResistance,slidingFs,type BaseAction} from '../src/engine/columnBase';
import {sizeColumnBase} from '../src/engine/columnBaseSizing';
import {filletMinimum} from '../src/engine/connectionStrength';
import type {ProjectInput} from '../src/engine/types';

const inch=25.4,foot=304.8,ksi=6.894757293168,pcf=1.570874638e-7,kip=4448.2216152605;
const stiffened=(p:ProjectInput,t=.75*inch,w=.3125*inch)=>{const q=structuredClone(p),d=q.longitudinalBracing!.design=structuredClone(bracingDesign(q));d.stiffeners={thickness:t,weld:w,Fy:50*ksi,Fu:65*ksi};return q;};

/**
 * The local fixes that replace column upsizing (round 5, R5-B): the web stiffener pair at the brace gussets and strut
 * tabs, demand-sized gusset fillets, the soil's lateral bearing in footing sliding, braced and unbraced footings, and the
 * combined footing of a crane column with its building column.
 */
describe('crane and new column local fixes',()=>{
 const p=newColumnDemonstrationProject(),column=existingColumnSection(p).section;
 it('carries the force normal to the web through the stiffener pair by hand (lower bound, web not relied on)',()=>{
  const q=stiffened(p),tg=bracingDesign(q).gusset.thickness,F=40*kip,s=webStiffeners(q,column,tg,F)!,sh=aiscShapeByName(column.catalogueId!)!;
  const clip=sh.kdes*inch-column.tf+inch/2,w=(column.bf-column.tw)/2,L=w-clip,a=(column.d-2*column.tf-tg)/2,Q=F/4,lrfd=q.method==='LRFD';
  const rw=(lrfd?.75:.5)*.6*70*ksi*(.3125*inch)/Math.SQRT2;
  expect(s.L).toBeCloseTo(L,6);expect(s.a).toBeCloseTo(a,6);
  expect(s.parts.flangeWeld).toBeCloseTo(Math.hypot(Q/(2*L),3*Q*a/L**2)/rw,6);
  expect(s.parts.flexure).toBeCloseTo(Q*a/((lrfd?.9:1/1.67)*50*ksi*.75*inch*L**2/4),6);
  expect(s.parts.slenderness).toBeCloseTo(w/(.75*inch)/(.56*Math.sqrt(column.E/(50*ksi))),6);
  // The capacity is the force at a load ratio of 1, and the check uses it in place of the web's yield line.
  expect(F/s.capacity).toBeCloseTo(Math.max(s.parts.gussetWeld,s.parts.gussetMetal,s.parts.flangeWeld,s.parts.flangeMetal,s.parts.flexure,s.parts.shear),9);
  const c=bracingChecks(q).find(v=>v.id==='brace-column-web')!;
  expect(c.title).toMatch(/stiffeners/);expect(c.capacity).toBeGreaterThan(webYieldLine(column,6*inch,q.method));
  expect(c.note).toMatch(/H = T cos θ \+ H_strut = /);
 });
 it('sizes the bracing with stiffeners on a thin web, the fillets from demand, never at the edge maximum',()=>{
  // A light column web: the yield line fails, the sizing adds the stiffener pair rather than leaving it to the column.
  const q=structuredClone(p),w=aiscShapeByName('W14X61')!;
  Object.assign(q.existingColumn!,{shape:'W14X61',d:w.d*inch,bf:w.bf*inch,tf:w.tf*inch,tw:w.tw*inch});
  const r=sizeBracing(q,.9),d=r.longitudinalBracing!.design!,checks=bracingChecks(r),c=existingColumnSection(r).section;
  expect(d.stiffeners).toBeDefined();
  for(const id of ['brace-column-web','brace-strut-tab','brace-gusset-weld'])expect(checks.find(v=>v.id===id)!.utilization!,id).toBeLessThanOrEqual(.9+1e-9);
  // Fillets: at least the J2.4 minimum, at most 5/8 in, and only above the minimum where the weld metal governs.
  expect(d.weld).toBeGreaterThanOrEqual(filletMinimum([d.gusset.thickness,c.tw])-1e-9);expect(d.weld).toBeLessThanOrEqual(5/8*inch+1e-9);
  const cap=connectionCapacities(r,{t:d.gusset.thickness},c);if(cap.governs!=='weld')expect(d.weld).toBeLessThanOrEqual(Math.max(filletMinimum([d.gusset.thickness,c.tw]),.3125*inch)+1e-9);
  expect(d.stiffeners!.weld).toBeLessThanOrEqual(Math.min(5/8*inch,d.stiffeners!.thickness-inch/16)+1e-9);
 },120000);
 it('adds the soil lateral bearing to the base friction in sliding (IBC §1806.3.1) by hand',()=>{
  const b=structuredClone(p.columnBase!);Object.assign(b.footing,{L:8*foot,B:8*foot,thickness:24*inch,soil:0,slab:6*inch,key:24*inch});b.soil.passive=150*pcf;
  // From the slab bottom (6 in) to the key bottom (48 in): 150 pcf × 8 ft × (3.5² - 0²)/2 ft² = 7.35 kip.
  expect(passiveResistance(b)/kip).toBeCloseTo(.15*8*3.5**2/2,6);
  expect(slidingFs(b,40*kip,10*kip)).toBeCloseTo((.35*40+.15*8*3.5**2/2)/10,6);
  delete b.soil.passive;expect(passiveResistance(b)).toBe(0);
 });
 it('sizes the braced columns\' footing apart from the others and keeps the unbraced ones smaller',()=>{
  const q=sizeColumnBase(p,.9),b=q.columnBase!,n=q.spans.length+1,braced=Array.from({length:n},(_,j)=>bracedSupport(q,j));
  expect(braced.some(v=>v)&&braced.some(v=>!v)).toBe(true);
  expect(b.braced).toBeDefined();expect(b.braced!.footing.L).toBeGreaterThanOrEqual(b.footing.L);
  for(let j=0;j<n;j++)expect(baseAt(q,j).footing).toEqual(braced[j]?b.braced!.footing:b.footing);
 },120000);
 it('loads a combined footing with the building column\'s existing axial load about the footing center',()=>{
  // A synthetic crane column 30 in from its building column (only the footing action is exercised here).
  const q=structuredClone(p),bc=structuredClone(q.existingColumn!);
  bc.existing={...bc.existing,D:{P:50*kip,Mx:0,My:0,V:0},L:{P:10*kip,Mx:0,My:0,V:0},S:{P:20*kip,Mx:0,My:0,V:0}};
  q.craneColumn={enabled:true,offset:30*inch,building:bc,columnTie:{} as never,base:'pinned',source:''} as never;q.columnBase!.combined=true;
  const a:BaseAction={id:'ASD x',equation:'',P:80*kip,Mx:5*kip*foot,My:0,Vx:1*kip,Vy:0,Pd:40*kip,Md:0,Vd:0,Mh:0,Vh:0,css:2*kip};
  const f=footingAction(q,a,40*kip,'ASD'),N=q.columnBase!.plate.N,Nb=bc.d+9.5*inch,uc=(N/2-30*inch-Nb/2)/2;
  expect(f.P).toBeCloseTo(80*kip+50*kip+30*kip,3);expect(f.Pd).toBeCloseTo(40*kip+50*kip,3);
  // Moments about the footing center u_c, the building column at -s, the crane column at 0: magnitudes added to the base moment.
  expect(f.Mx).toBeCloseTo(5*kip*foot+Math.abs(80*kip*(-30*inch-uc)+80*kip*(-uc)),3);
  expect(f.Md).toBeCloseTo(Math.abs(50*kip*(-30*inch-uc)+40*kip*(-uc)),3);
  expect(f.Vx).toBeCloseTo(3*kip,6);expect(f.Vh).toBeCloseTo(2*kip,6);
 });
});
