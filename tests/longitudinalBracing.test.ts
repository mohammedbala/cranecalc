import {describe,it,expect} from 'vitest';
import {angleGeometry} from '../src/engine/longitudinalBracing';
import {defaultLongitudinalBracing,type LongitudinalBracingInput} from '../src/engine/longitudinalBracingInputs';
import {defaultExistingColumn} from '../src/engine/existingColumnInputs';
import {calculate,validateProject} from '../src/engine/calculate';
import {aiscAngleByName} from '../src/data/aiscAngles';
import {designProject} from './fixtures/aistProject';

const kip=4448.221615,inch=25.4,foot=304.8;
function project(changes:Partial<LongitudinalBracingInput>={}){
 const p=designProject();
 p.longitudinalBracing={...structuredClone(defaultLongitudinalBracing),enabled:true,confirmed:true,source:'Unit test: sidewall bracing survey and wind report',existing:{W:10*kip,E:0},...changes};
 return p;
}
describe('crane-level longitudinal bracing',()=>{
 it('reproduces the AISC Manual radius of gyration of L4X4X3/8 from its legs',()=>{
  const a=aiscAngleByName('L4X4X3/8')!,g=angleGeometry(a.d*inch,a.b*inch,a.t*inch);
  expect(g.ra/inch).toBeCloseTo(1.23,2); // AISC Manual Table 1-7: rx = ry = 1.23 in
 });
 it('checks tension-only rods for the governing ASCE 7 combination by hand',()=>{
  const s=calculate(project()),r=s.longitudinalBracing!,b=s.input.longitudinalBracing!;
  // Fixture crane: Cls = max(supplied 22 kN, 0.2 x 110 kN driving, 0.1 x 220 kN wheels) = 22 kN.
  expect(r.Cls).toBeCloseTo(22000,6);
  const Ld=Math.hypot(b.bayWidth,b.height),cos=b.bayWidth/Ld,H=1.0*b.existing.W+1.0*22000; // LRFD 4: 1.2D + 1.0W + L
  expect(r.governing.equation).toBe('1.2D + 1.0W + L + 0.5Lr');expect(r.governing.H).toBeCloseTo(H,6);
  const T=H/cos,Ab=Math.PI*b.rod.diameter**2/4,capacity=Math.min(.75*.75*b.rod.Fu*Ab,.9*b.rod.Fy*Ab);
  const check=s.checks.find(c=>c.id==='brace-tension')!;
  expect(check.demand).toBeCloseTo(T,6);expect(check.capacity).toBeCloseTo(capacity,6);expect(check.status).toBe('fail');
  expect(r.deflection.value).toBeCloseTo(22000/cos*Ld/(Ab*s.input.section.E)/cos,9);
  expect(s.checks.find(c=>c.id==='brace-by-others')?.status).toBe('excluded');
 },60000);
 it('checks single-angle X bracing with E5 slenderness, E3 buckling and net-section rupture',()=>{
  const p=project({system:'angle-x',tiers:2,angle:{shape:'L4X4X3/8',Fy:250,Fu:400,bolts:3,boltDiameter:.75*inch}});
  const s=calculate(p),r=s.longitudinalBracing!,b=p.longitudinalBracing!,a=aiscAngleByName('L4X4X3/8')!;
  const Ag=a.A*inch**2,t=a.t*inch,ra=angleGeometry(a.d*inch,a.b*inch,t).ra,Ld=Math.hypot(b.bayWidth,b.height/2),L=Ld/2,E=p.section.E;
  const Lr=L/ra,slender=Lr<=80?72+.75*Lr:32+1.25*Lr,Fe=Math.PI**2*E/slender**2,Fcr=250/Fe<=2.25?250*.658**(250/Fe):.877*Fe;
  expect(4/.375).toBeLessThan(.45*Math.sqrt(E/250)); // nonslender legs: Ae = Ag
  expect(r.member.compression).toBeCloseTo(.9*Fcr*Ag,6);expect(r.member.slenderness).toBeCloseTo(slender,9);
  const An=Ag-(.75*inch+inch/8)*t;
  expect(r.member.tension).toBeCloseTo(Math.min(.9*250*Ag,.75*400*.6*An),6);
  // Two crossing diagonals share each bay's shear.
  expect(r.governing.force).toBeCloseTo(r.governing.H/2/(b.bayWidth/Ld),6);
  expect(s.checks.find(c=>c.id==='brace-compression')).toMatchObject({demand:r.governing.force});
 },60000);
 it('includes the AIST crane stop case when building-mounted stops load the bracing',()=>{
  const p=project();p.cranes[0].design!.bumperForce=60*kip;
  const r=calculate(p).longitudinalBracing!;
  expect(r.combinations.find(c=>c.id==='LRFD AIST bumper')?.H).toBeCloseTo(60*kip,6);
  expect(r.governing.id).toBe('LRFD AIST bumper');
  const off=project({bumperToBracing:false});off.cranes[0].design!.bumperForce=60*kip;
  expect(calculate(off).longitudinalBracing!.combinations.some(c=>c.id.includes('bumper'))).toBe(false);
 },60000);
 it('allows one longitudinal path and replaces the column BY OTHERS item',()=>{
  const p=project();p.existingColumn={...structuredClone(defaultExistingColumn),enabled:true,confirmed:true,source:'test',longitudinal:'column'};
  expect(validateProject(p).some(e=>e.includes('choose one longitudinal path'))).toBe(true);
  p.existingColumn.longitudinal='bracing';
  const s=calculate(p);expect(s.errors).toEqual([]);
  expect(s.checks.some(c=>c.id==='column-longitudinal')).toBe(false);
  expect(validateProject(project({system:'angle-single',angle:{...defaultLongitudinalBracing.angle,shape:'L99X99'}})).some(e=>e.startsWith('longitudinalBracing.angle.shape'))).toBe(true);
 },60000);
});
