import {describe,expect,it} from 'vitest';
import {calculate,validateProject} from '../src/engine/calculate';
import {newColumnDemonstrationProject} from '../src/engine/demonstration';
import {seismicBasis,seismicCombinations} from '../src/engine/runwaySeismic';
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
  expect(z.driftLimit).toBeCloseTo(.025*h,6);
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
