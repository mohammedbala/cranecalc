import {describe,expect,it} from 'vitest';
import {calculate,validateProject} from '../src/engine/calculate';
import {demonstrationProject,newColumnDemonstrationProject} from '../src/engine/demonstration';
import {defaultExistingColumn} from '../src/engine/existingColumnInputs';
import {anchorHardware,columnBaseElevation,defaultColumnBase,type ColumnBaseInput} from '../src/engine/columnBaseInputs';
import {anchorArea,anchorStrength,baseDrift,basePlate,footingStrength,nutBearingArea,soilPressure,type BaseAction} from '../src/engine/columnBase';
import {runwayElevations} from '../src/engine/drawingData';
import {drawingSheetSet,detailReferences} from '../src/components/planSheet';
import type {ProjectInput} from '../src/engine/types';

const inch=25.4,foot=304.8,kip=4448.2216152605,ksi=6.894757293168,ksf=.04788025898;
const texts=(svg:string)=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&')).join(' ');
// Hand-calculation base: 20 x 18 plate, four 1-in F1554-36 rods (2 per row, 2-in edge, 12-in gauge, 18-in hef),
// 8-ft square 30-in footing, #7 at 10 in, f'c 4 ksi. Column W14X90 (d 14.0, bf 14.5).
const base=():ColumnBaseInput=>({...structuredClone(defaultColumnBase),enabled:true,
 plate:{N:20*inch,B:18*inch,thickness:1.25*inch,Fy:50*ksi,weld:.3125*inch},
 anchors:{grade:'F1554-36',diameter:inch,perRow:2,edge:2*inch,gauge:12*inch,embedment:18*inch},
 footing:{L:8*foot,B:8*foot,thickness:30*inch,cover:3*inch,soil:0,slab:6*inch,bar:'#7',spacing:10*inch,fy:60*ksi}});
const column=():ProjectInput=>{const p=demonstrationProject();p.existingColumn={...structuredClone(defaultExistingColumn),enabled:true,isNew:true,shape:'W14X90'};p.columnBase=base();return p;};
const action=(P:number,Mx=0,extra:Partial<BaseAction>={}):BaseAction=>({id:'test',equation:'',P:P*kip,Mx:Mx*kip*inch,My:0,Vx:0,Vy:0,Pd:P*kip,Md:0,Vd:0,Mh:0,Vh:0,...extra});

describe('ACI 318-19 Chapter 17 headed anchor rods',()=>{
 it('matches the hand calculation for steel, pullout, breakout, shear and pryout',()=>{
  expect(anchorArea(inch)/inch**2).toBeCloseTo(.6057,3);
  expect(nutBearingArea(inch)/inch**2).toBeCloseTo(1.1632,3);
  const r=anchorStrength(base(),0,10*kip);
  // 0.75(2)(0.6057)(58) ksi; 0.7(2)(8)(1.1632)(4); 0.7(54x66/2916)(16 sqrt4000 x 18^(5/3)).
  expect(r.steelT/kip).toBeCloseTo(52.70,1);
  expect(r.pullout/kip).toBeCloseTo(52.11,1);
  expect(r.breakout/kip).toBeCloseTo(107.0,0);
  expect(r.blowout).toBeUndefined();
  expect(r.phiNn).toBe(r.pullout);
  // 0.65(4)(0.8)(0.6)(0.6057)(58); 0.7(2880/7200)(0.91)(sqrt2)(9 sqrt4000 x 40^1.5); 0.7(2)(4620/2916)Nb.
  expect(r.steelV/kip).toBeCloseTo(43.85,1);
  expect(r.breakoutV/kip).toBeCloseTo(51.89,1);
  expect(r.pryout/kip).toBeCloseTo(277.4,0);
  expect(r.hef).toBe(18*inch);
 });
 it('combines tension and shear by §17.8 and checks shear breakout in each direction',()=>{
  const small=anchorStrength(base(),40*kip,5*kip);
  expect(small.interaction).toBeCloseTo(40/52.11,2);
  const both=anchorStrength(base(),40*kip,20*kip);
  expect(both.phiVn/kip).toBeCloseTo(43.85,1);
  expect(both.interaction).toBeCloseTo((40/52.11+20/43.85)/1.2,2);
  const along=anchorStrength(base(),0,0,20*kip);
  expect(along.breakoutVy).toBeGreaterThan(0);
  expect(along.phiVn).toBeLessThanOrEqual(Math.min(along.steelV,along.pryout,along.breakoutVy)+1e-6);
 });
 it('sizes holes and plate washers from Design Guide 1 Table 2.3',()=>{
  const h=anchorHardware(inch);
  expect(h.hole/inch).toBeCloseTo(1.8125,4);expect(h.washer/inch).toBeCloseTo(3,9);expect(h.washerThickness/inch).toBeCloseTo(.375,9);
 });
});

describe('AISC Design Guide 1 base plate',()=>{
 it('bears uniformly under axial load',()=>{
  const r=basePlate(column(),base(),action(100),'LRFD');
  // A2/A1 limited to 4: fp,max = 0.65 x 1.7 x 4 ksi.
  expect(r.fpMax/ksi).toBeCloseTo(4.42,2);
  expect(r.Y/inch).toBeCloseTo(20,6);expect(r.T).toBe(0);
  expect(r.bearing).toBeCloseTo(100/(18*20)/4.42,3);
  // l = lambda n' = sqrt(14.0 x 14.5)/4 governs m and n; t = l sqrt(2fp/(0.9Fy)).
  expect(r.tRequired/inch).toBeCloseTo(Math.sqrt(14.0*14.5)/4*Math.sqrt(2*(100/360)/(.9*50)),2);
 });
 it('solves the large-moment bearing block and anchor tension',()=>{
  const r=basePlate(column(),base(),action(50,1000),'LRFD');
  const q=4.42*18,need=2*(1000+50*8)/q;
  expect(r.Y/inch).toBeCloseTo(18-Math.sqrt(324-need),2);
  expect(r.T/kip).toBeCloseTo(q*(18-Math.sqrt(324-need))-50,1);
  expect(r.bearing).toBeCloseTo(need/324,3);
 });
 it('puts both rows in tension under net uplift',()=>{
  const r=basePlate(column(),base(),action(-20,40),'LRFD');
  expect(r.Y).toBe(0);expect(r.T/kip).toBeCloseTo(10+40/16,6);
 });
});

describe('Spread footing',()=>{
 it('gives the linear soil pressure, the triangle and the biaxial effective area',()=>{
  const b=base(),P=100*kip,L=8*foot;
  expect(soilPressure(b,P,0)/ksf).toBeCloseTo(100/64,4);
  expect(soilPressure(b,P,P*L/6)/ksf).toBeCloseTo(200/64,4);
  expect(soilPressure(b,P,P*2*foot)/ksf).toBeCloseTo(200/(3*8*2),4);
  expect(soilPressure(b,P,P*1.5*foot,P*1.5*foot)/ksf).toBeCloseTo(100/(5*5),4);
  expect(soilPressure(b,-P,0)).toBe(Infinity);
 });
 it('checks flexure, one-way and two-way shear and bar development by hand',()=>{
  const r=footingStrength(column(),base(),action(100));
  const d=30-3-1.5*.875,a=6*60/(.85*4*96),arm=48-(14+20)/4;
  expect(r.d/inch).toBeCloseTo(d,6);
  expect(r.along.bars).toBe(10);expect(r.along.As/inch**2).toBeCloseTo(6,6);
  expect(r.along.phiMn/(kip*inch)).toBeCloseTo(.9*6*60*(d-a/2),0);
  expect(r.along.Mu/(kip*inch)).toBeCloseTo(100/96*arm**2/2,1);
  // #7: psi_s 1, (cb + Ktr)/db capped at 2.5.
  expect(r.along.ld/inch).toBeCloseTo(3/40*60000/Math.sqrt(4000)/2.5*.875,2);
  expect(r.along.available/inch).toBeCloseTo(arm-3,6);
  const b1=2*8.5+d,b2=2*(14.5+18)/4+d,b0=2*(b1+b2),Vu=100*(1-b1*b2/96**2);
  expect(r.vu/ksi*1000).toBeCloseTo(Vu/(b0*d)*1000,1);
  const lambdaS=Math.sqrt(2/(1+d/10));
  expect(r.phivc/ksi*1000).toBeCloseTo(.75*4*lambdaS*Math.sqrt(4000),0);
 });
});

describe('New freestanding column package',()=>{
 it('designs the demonstration columns, bases and footings with every check passing',()=>{
  const p=newColumnDemonstrationProject();
  expect(validateProject(p)).toEqual([]);
  const s=calculate(p);
  expect(s.errors).toEqual([]);
  const base=s.checks.filter(c=>c.group==='New column base');
  expect(base.map(c=>c.id)).toEqual(expect.arrayContaining(['base-bearing','base-plate','base-weld','base-anchor-tension','base-anchor-shear','base-anchor-interaction','base-soil','base-overturning','base-sliding','base-frost','base-one-way','base-two-way','base-flexure','base-min-steel','base-development','base-bar-spacing']));
  expect(s.checks.filter(c=>c.status==='fail').map(c=>c.id)).toEqual([]);
  expect(s.eligible).toBe(true);
  // The footing rotating on the soil adds to the fixed-base column drift at the rail.
  const drift=s.checks.find(c=>c.id==='base-drift')!,column=s.checks.find(c=>c.id==='column-drift')!;
  const d=baseDrift(p,s.existingColumn!);
  expect(drift.demand).toBeCloseTo(column.demand!+d.theta*d.lever,6);
  expect(drift.demand!).toBeGreaterThan(column.demand!);expect(drift.capacity).toBe(column.capacity);
  // Elevations come from the base on the footing and agree with the entered top of rail.
  const el=runwayElevations(p)!;
  expect(el.source).toBe('new column base');
  expect(el.tor).toBeCloseTo(p.drawing!.datumElevation+p.drawing!.railElevation!,3);
  // The issued set adds the new column details and every reference to them resolves.
  const set=drawingSheetSet(s),columns=set.find(v=>v.svg.includes('data-view="new-column-elevation"'))!;
  expect(columns.title).toContain('NEW COLUMNS & FOOTINGS');
  for(const view of ['base-plate-plan','footing-plan','footing-section','new-column-notes'])expect(columns.svg).toContain(`data-view="${view}"`);
  const all=set.map(v=>texts(v.svg)).join(' ');
  expect(all).not.toContain('NOT IN SET');
  expect(texts(columns.svg)).toContain('4 - 1" DIA. ASTM F1554 GR. 36');
  expect(texts(columns.svg)).toContain(`T.O.R. EL. 120'-0"`);
  const elevation=detailReferences(set).get('NEW RUNWAY COLUMN / ELEVATION')!;
  expect(elevation).toMatch(new RegExp(`^\\d+/${columns.number}$`));
  expect(texts(set[0].svg)).toContain(columns.number);expect(texts(set[0].svg)).toContain(elevation);
  // A new column is shop welded: no field-weld flags or existing-column labels on the column-side details.
  for(const sheet of set.slice(2))expect(texts(sheet.svg)).not.toMatch(/EXISTING COLUMN|FIELD WELD TO/);
 });
 it('reports geometry clashes and drawing mismatches as input errors',()=>{
  const p=newColumnDemonstrationProject();
  // Washers on the rods clash with the column flange welds on a short plate.
  p.columnBase!.plate.N=21*inch;
  expect(validateProject(p).some(e=>e.startsWith('columnBase.plate.N: the plate washers clash'))).toBe(true);
  const q=newColumnDemonstrationProject();q.columnBase!.grout=3*inch;
  expect(validateProject(q).some(e=>e.startsWith('columnBase.enabled: the column base on the footing'))).toBe(true);
  const r=newColumnDemonstrationProject();r.existingColumn!.height+=12*inch;
  expect(validateProject(r).some(e=>e.startsWith('existingColumn.height: stop the new column'))).toBe(true);
  const t=newColumnDemonstrationProject();t.details!.bracket!.receiver.flangeThickness+=.25*inch;
  expect(validateProject(t).some(e=>e.startsWith("existingColumn.shape: the bracket's receiving column must be"))).toBe(true);
  expect(columnBaseElevation(p.columnBase!)/inch).toBeCloseTo(1.25+1.5,6);
 });
});
