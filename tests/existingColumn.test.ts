import {describe,it,expect} from 'vitest';
import {asceCombinations} from '../src/engine/asceCombinations';
import {defaultExistingColumn} from '../src/engine/existingColumnInputs';
import {existingColumnRailElevation} from '../src/engine/existingColumn';
import {calculate,validateProject} from '../src/engine/calculate';
import {aiscShapeByName} from '../src/data/aiscSections';
import {designProject} from './fixtures/aistProject';

const kip=4448.221615,inch=25.4,foot=304.8,ksi=6.894757293;
function project(changes:Partial<typeof defaultExistingColumn>={}){
 const p=designProject();
 p.existingColumn={...structuredClone(defaultExistingColumn),enabled:true,confirmed:true,source:'Unit test: original building calculations, column C-3',...changes};
 p.existingColumn.existing.D={P:50*kip,Mx:0,My:0,V:0};
 return p;
}
describe('ASCE 7 combinations for the supporting column',()=>{
 it('lists ASCE 7 §2.3.1 LRFD and §2.4.1 ASD factors with W and E in both directions',()=>{
  const lrfd=asceCombinations('LRFD'),asd=asceCombinations('ASD');
  expect(lrfd).toHaveLength(25);expect(asd).toHaveLength(24);
  expect(lrfd.find(c=>c.id==='2-S')!.factors).toMatchObject({D:1.2,L:1.6,S:.5,W:0});
  expect(lrfd.find(c=>c.id==='6−')!.factors).toMatchObject({D:.9,W:-1});
  expect(asd.find(c=>c.id==='6a-S+')!.factors).toMatchObject({D:1,L:.75,W:.45,S:.75});
  expect(asd.find(c=>c.id==='8+')!.factors).toMatchObject({D:.6,E:.7});
 });
});
describe('existing column member check',()=>{
 it('reproduces the AISC Manual W14X90 strong-axis strength with flange local buckling',()=>{
  const s=calculate(project());
  // AISC Manual Table 3-2: W14X90, Fy = 50 ksi, phi*Mpx = 574 kip-ft (noncompact flange).
  expect(s.existingColumn!.capacity.Mcx/(kip*foot)).toBeCloseTo(574,-0.5);
 },60000);
 it('matches closed-form pinned-braced moments and E3 compression for the governing LRFD case',()=>{
  const p=project(),s=calculate(p),r=s.existingColumn!,c=p.existingColumn!,w=aiscShapeByName('W14X90')!;
  expect(s.errors).toEqual([]);
  // Compression: E3 with Lcx = 24 ft governing (rx/ry = 1.66), no slender elements.
  const A=w.A*inch**2,Ix=w.Ix*inch**4,E=p.section.E,Fy=c.Fy,Fe=Math.PI**2*E*Ix/(A*c.Lcx**2),Fcr=Fy/Fe<=2.25?Fy*.658**(Fy/Fe):.877*Fe;
  expect(r.capacity.Pc/(.9*Fcr*A)).toBeCloseTo(1,3);
  // Simply supported column: eccentric reaction moment at the seat plus side thrust at the rail head.
  const H=c.height,hs=c.seatElevation,ht=existingColumnRailElevation(p);
  const combo=r.combinations.find(k=>k.id==='LRFD 2-Lr')!,runway=1.2*r.crane.dead+1.6*r.crane.live,M0=runway*r.eccentricity,F=1.6*r.crane.lateral;
  const sections=[[M0*hs/H,F*hs*(H-ht)/H],[M0*(H-hs)/H,F*hs*(H-ht)/H],[M0*(H-ht)/H,F*ht*(H-ht)/H]];
  const Mx=Math.max(...sections.map(([a,b])=>a+b));
  expect(combo.Mx/combo.B1x).toBeCloseTo(Mx,3);
  expect(combo.P).toBeCloseTo(1.2*50*kip+runway,3);
  expect(combo.B1x).toBeCloseTo(1/(1-combo.P/(Math.PI**2*E*Ix/c.Lcx**2)),9);
  const ratio=combo.P/r.capacity.Pc,flex=combo.Mx/r.capacity.Mcx;
  expect(combo.U).toBeCloseTo(ratio>=.2?ratio+8/9*flex:ratio/2+flex,9);
  expect(s.checks.find(k=>k.id==='column-interaction')).toMatchObject({demand:r.governing.U.U});
  expect(s.checks.find(k=>k.id==='column-longitudinal')?.status).toBe('excluded');
  expect(s.checks.find(k=>k.id==='supporting-structure')?.note).toContain('existing column member is checked');
 },60000);
 it('bends the weak axis when the column resists the crane longitudinal force',()=>{
  const p=project({longitudinal:'column'}),s=calculate(p),r=s.existingColumn!,c=p.existingColumn!,ht=existingColumnRailElevation(p);
  const combo=r.combinations.find(k=>k.id==='LRFD 2-Lr')!;
  expect(combo.My/combo.B1y).toBeCloseTo(1.6*r.crane.longitudinal*ht*(c.height-ht)/c.height,3);
  expect(s.checks.some(k=>k.id==='column-flexure-y')).toBe(true);
 },60000);
 it('blocks export until the survey and existing loads are confirmed',()=>{
  const s=calculate(project({confirmed:false}));
  expect(s.checks.find(k=>k.id==='column-basis')?.status).toBe('unverified');expect(s.eligible).toBe(false);
 },60000);
 it('rejects unstable supports, short effective lengths and a rail above the column top',()=>{
  const has=(p:ReturnType<typeof project>,field:string)=>validateProject(p).some(e=>e.startsWith(`existingColumn.${field}`));
  expect(has(project({strong:{base:'pinned',top:'free'}}),'strong')).toBe(true);
  expect(has(project({strong:{base:'fixed',top:'free'},Lcx:24*foot}),'Lcx')).toBe(true);
  expect(has(project({strong:{base:'fixed',top:'free'},Lcx:2.1*24*foot}),'Lcx')).toBe(false);
  expect(has(project({height:17*foot,Lcx:17*foot,Lcy:8*foot}),'height')).toBe(true);
 });
});
