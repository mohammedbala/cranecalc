import {describe,expect,it} from 'vitest';
import {calculate,validateProject} from '../src/engine/calculate';
import {newColumnDemonstrationProject} from '../src/engine/demonstration';
import {sdcFromSD1,sdcFromSDS,seismicBasis,seismicCombinations} from '../src/engine/runwaySeismic';
import {coverSheetSvg} from '../src/components/coverSheet';
import {anchorStrength,columnBaseActions} from '../src/engine/columnBase';
import {existingColumnSection,seismicHeight} from '../src/engine/existingColumn';
import {supportReactions} from '../src/engine/supportReactions';
import {sectionProperties} from '../src/engine/section';
import type {ProjectInput} from '../src/engine/types';

const foot=304.8,kip=4448.2216152605;
const seismic=(patch:Partial<NonNullable<NonNullable<ProjectInput['existingColumn']>['seismic']>>={})=>{
 const p=newColumnDemonstrationProject();p.existingColumn!.seismic={...p.existingColumn!.seismic!,...patch};return p;
};

describe('Seismic design of new freestanding runway columns',()=>{
 it('takes Cs on the short-period plateau and the ASCE 7 seismic combinations with overstrength',()=>{
  const b=seismicBasis(seismic({sdc:'C',SDS:.4}))!;
  expect(b.Cs).toBeCloseTo(.4/1.25,9);
  expect(seismicBasis(seismic({sdc:'D',SDS:.6,system:'special',rho:1.3}))!.Cs).toBeCloseTo(.6/2.5,9);
  expect(seismicBasis(seismic({sdc:'A',SDS:.1}))!.Cs).toBe(.01);
  const lrfd=seismicCombinations('LRFD',b),asd=seismicCombinations('ASD',b);
  expect(lrfd.find(k=>k.id==='6-E')).toMatchObject({D:1.28,L:1,E:1,overstrength:false});
  expect(lrfd.find(k=>k.id==='7-E')).toMatchObject({D:.82,L:0,E:1});
  expect(lrfd.find(k=>k.id==='7-E Ωo')).toMatchObject({D:.82,E:1.25,overstrength:true});
  expect(asd.find(k=>k.id==='10-E Ωo')).toMatchObject({D:.544,E:.875,fs:1});
  // SDC A: the §1.4.2 force without overstrength or vertical seismic effect.
  const a=seismicCombinations('LRFD',seismicBasis(seismic({sdc:'A',SDS:.1}))!);
  expect(a.find(k=>k.overstrength&&k.id.startsWith('7-E'))).toMatchObject({D:.9,E:1});
 });
 it('rejects systems, heights and categories that ASCE 7 does not permit',()=>{
  const errs=(p:ProjectInput)=>validateProject(p);
  expect(errs(seismic({sdc:'D',SDS:.6,rho:1.3})).some(e=>e.startsWith('existingColumn.seismic.system:'))).toBe(true);
  expect(errs(seismic({sdc:'B',SDS:.45})).some(e=>e.startsWith('existingColumn.seismic.sdc:'))).toBe(true);
  expect(errs(seismic({sdc:'D',SDS:.6,system:'special',rho:1})).some(e=>e.startsWith('existingColumn.seismic.rho:'))).toBe(true);
  expect(errs(seismic({sdc:'D',SDS:.6,system:'special',rho:1.3}))).toEqual([]);
  const tall=seismic();tall.existingColumn!.height=36*foot;
  expect(errs(tall).some(e=>e.startsWith('existingColumn.height: cantilever column systems are limited'))).toBe(true);
 });
 it('checks the entered SDC and Ie against the site data (ASCE 7 Tables 11.6-1, 11.6-2, 1.5-2; §11.6)',()=>{
  expect([sdcFromSDS(.2),sdcFromSDS(.2,'IV'),sdcFromSDS(.4,'IV'),sdcFromSDS(.1,'IV')]).toEqual(['B','C','D','A']);
  expect([sdcFromSD1(.05),sdcFromSD1(.08),sdcFromSD1(.08,'IV'),sdcFromSD1(.15),sdcFromSD1(.25),sdcFromSD1(.3,'II',.8),sdcFromSD1(.3,'IV',.8)]).toEqual(['A','B','C','C','D','E','F']);
  const errs=(p:ProjectInput)=>validateProject(p);
  // The demonstration site data agree with SDC B and Ie 1.
  expect(errs(seismic())).toEqual([]);
  expect(errs(seismic({SD1:.15})).some(e=>e.startsWith('existingColumn.seismic.sdc:')&&e.includes('Table 11.6-2'))).toBe(true);
  expect(errs(seismic({riskCategory:'IV',Ie:1.5})).some(e=>e.startsWith('existingColumn.seismic.sdc:')&&e.includes('Table 11.6-1'))).toBe(true);
  expect(errs(seismic({riskCategory:'III'})).some(e=>e.startsWith('existingColumn.seismic.Ie:'))).toBe(true);
  expect(errs(seismic({sdc:'D',SDS:.6,system:'special',rho:1.3,S1:.8,SD1:.6})).some(e=>e.startsWith('existingColumn.seismic.sdc:')&&e.includes('§11.6'))).toBe(true);
  // Site data are optional: an older project without them still validates.
  const old=seismic();for(const k of ['riskCategory','Ss','S1','siteClass','SD1'] as const)delete old.existingColumn!.seismic![k];
  expect(errs(old)).toEqual([]);
 });
 it('designs the cantilever columns to AISC 341 §E5 in SDC B: overstrength cases, code basis, welds and inspection',()=>{
  const s=calculate(newColumnDemonstrationProject()),c=s.existingColumn!;
  // ASCE 7 §14.1.2.2.1: the columns take the overstrength combinations too (§E5.4a), with the 15% axial limit in them.
  expect(c.combinations.map(k=>k.id)).toEqual(expect.arrayContaining(['LRFD 6-E Ωo','LRFD 7-E Ωo']));
  const axial=s.checks.find(k=>k.id==='column-seismic-axial')!;
  expect(axial.caseId).toContain('Ωo');expect(axial.note).toContain('AISC 341 §E5.4a');expect(axial.referenceIds).toContain('aisc-341');
  const t=[...coverSheetSvg(s,[]).matchAll(/>([^<]+)</g)].map(m=>m[1]).join(' ');
  for(const v of ['AISC 341','§E5 ORDINARY CANTILEVER COLUMN SYSTEM','AWS D1.8/D1.8M','AWS D1.8 CLAUSE 6.3','SEISMIC (IBC 1705.12.1.1, 1705.13.1.1)','CRANE-LEVEL ROD BRACING EXEMPT','STATEMENT OF RESPONSIBILITY (IBC 1704.4)','PLATE WASHER WELDS'])expect(t).toContain(v);
  expect(t).toMatch(/COLUMNS \(AISC 341 §E5\.4A\), BASE PLATES, ANCHORS AND\s+FOOTINGS FOR OVERSTRENGTH/);
  // The new column's bracket load path is checked here, not delegated.
  expect(s.checks.find(k=>k.id==='bracket-load-path')?.status).toBe('pass');
  // SDC A takes only the §1.4.2 integrity force: no AISC 341 and no overstrength column cases.
  const a=calculate(seismic({sdc:'A',SDS:.1,SD1:.05}));
  expect(a.existingColumn!.combinations.some(k=>k.id.includes('Ωo')||k.id.includes('§1.4.2'))).toBe(false);
  expect([...coverSheetSvg(a,[]).matchAll(/>([^<]+)</g)].map(m=>m[1]).join(' ')).not.toContain('AISC 341');
 },240000);
 it('states the IBC 1603.1.5 seismic data, the base shear each way and the wind basis on S-00',()=>{
  const s=calculate(newColumnDemonstrationProject()),svg=coverSheetSvg(s,[]),t=[...svg.matchAll(/>([^<]+)</g)].map(m=>m[1]).join(' ');
  expect(t).toContain('RISK CATEGORY II, IE 1; SS 0.19, S1 0.05; SITE CLASS D; SDS 0.2, SD1 0.08;');
  expect(t).toContain('SEISMIC DESIGN CATEGORY B');
  expect(t).toContain('EQUIVALENT LATERAL FORCE PROCEDURE');
  expect(t).toMatch(/V = 1\.45 KIP PER\s+COLUMN/);expect(t).toMatch(/V = 1\.78 KIP PER\s+RUNWAY LINE/);
  expect(t).toContain('WIND (NEW COLUMNS)');expect(t).toContain('REDUNDANCY 1;');
  // The Greek rho is not upper-cased into a P-like capital.
  expect(t).not.toContain('Ρ');
 },120000);
 it('designs the demonstration columns for SDC B with hand-checked base shear and drift',()=>{
  const p=newColumnDemonstrationProject(),s=calculate(p);
  expect(s.errors).toEqual([]);
  const ids=['column-seismic-basis','column-seismic-axial','column-seismic-drift','column-seismic-stability'];
  for(const id of ids)expect(s.checks.find(c=>c.id===id)?.status).toBe('pass');
  expect(s.checks.filter(c=>c.status==='fail').map(c=>c.id)).toEqual([]);
  const z=s.existingColumn!.seismic!,{section}=existingColumnSection(p),props=sectionProperties(section),c=p.existingColumn!;
  const support=supportReactions(p,sectionProperties(p.section)).supports.find(v=>Math.abs(v.x-s.existingColumn!.station)<1e-6)!;
  expect(z.QE).toBeCloseTo(.2/1.25*(support.D+support.Cd+props.weight*c.height),6);
  // Fixed-base cantilever with the force at the girder: delta = P h^3 / 3EI, amplified by Cd/Ie.
  const h=seismicHeight(p);expect(z.drift).toBeCloseTo(1.25*z.QE*h**3/(3*section.E*props.Ix),3);
  // Table 12.12-1, all other structures, Risk Category II: 0.020h.
  expect(z.driftLimit).toBeCloseTo(.02*h,6);
  // The base takes the overstrength combinations.
  const actions=columnBaseActions(p,s.supportReactions!,'LRFD')[0].actions;
  expect(actions.filter(a=>a.seismic&&!a.id.includes(' along')).map(a=>a.id)).toEqual(['LRFD 6-E Ωo','LRFD 7-E Ωo']);
 },120000);
 it('reduces concrete-governed anchor tension by 0.75 in SDC C to F (ACI 318-19 §17.10.5.4)',()=>{
  const b=newColumnDemonstrationProject().columnBase!;
  const plain=anchorStrength(b,20*kip,0),quake=anchorStrength(b,20*kip,0,0,true);
  expect(quake.phiNn).toBeCloseTo(Math.min(plain.steelT,.75*plain.breakout,.75*plain.pullout),6);
  const s=calculate(seismic({sdc:'C',SDS:.4}));
  expect(s.checks.find(c=>c.id==='base-anchor-tension')!.note).toContain('§17.10.5.4');
 },120000);
});
