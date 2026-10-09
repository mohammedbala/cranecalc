import { describe,expect,it } from 'vitest';
import { LateralTorsionBeam,type LateralTorsionInput } from '../src/engine/lateralTorsion';
const basic=():LateralTorsionInput=>({length:7620,E:200000,G:200000/2.6,Iy:2.4e7,J:8.2e5,Cw:2.1e12,h0:590,polarRadiusSquared:64000,loads:[],restraints:[],fixed:[{x:0,dofs:['v','twist']},{x:7620,dofs:['v','twist']}],subdivisions:32});
const near=(actual:number,expected:number,tolerance=.001)=>expect(Math.abs(actual-expected)/Math.max(Math.abs(expected),1e-15)).toBeLessThan(tolerance);

describe('Vlasov lateral/torsion mechanics',()=>{
 it('matches the independent pinned-end concentrated-torque hyperbolic solution',()=>{
  const p=basic(),T=8e6,L=p.length,a=Math.sqrt(p.E*p.Cw/(p.G*p.J));
  p.loads=[{x:L/2,lateral:0,torque:T}];
  const r=new LateralTorsionBeam(p).solve(),center=r.at(L/2);
  // Moore/Mueller 2002, case 3, simplified by symmetry for alpha=1/2.
  near(center.twist,T/(2*p.G*p.J)*(L/2-a*Math.tanh(L/(2*a))));
  near(center.warpingCurvature,-T/(2*p.G*p.J*a)*Math.tanh(L/(2*a)),.003);
  near(r.at(0).twistRate,T/(2*p.G*p.J)*(1-1/Math.cosh(L/(2*a))),.001);
  near(r.fixedReactions.filter(v=>v.dof==='twist').reduce((s,v)=>s+v.value,0),T,1e-8);
  expect(r.residual).toBeLessThan(1e-7);
 });
 it('recovers independent minor-axis simply-supported bending without spurious torsion',()=>{
  const p=basic(),P=18000,L=p.length;p.loads=[{x:L/2,lateral:P,torque:0}];
  const r=new LateralTorsionBeam(p).solve();
  near(r.at(L/2).v,P*L**3/(48*p.E*p.Iy),1e-7);
  near(-p.E*p.Iy*r.at(L/2).curvature,P*L/4,1e-7);
  expect(Math.max(...r.stations.map(v=>Math.abs(v.twist)))).toBe(0);
 });
 it('reproduces closed-form constant-moment elastic lateral torsional buckling',()=>{
  const p=basic(),M=4e8;p.moment=()=>M;
  const exact=Math.PI/p.length*Math.sqrt(p.E*p.Iy*(p.G*p.J+Math.PI**2*p.E*p.Cw/p.length**2));
  const beam=new LateralTorsionBeam(p),critical=beam.criticalMultiplier();
  near(critical.value*M,exact,.0001);
  expect(critical.bounded).toBe(false);
  expect(beam.isStable(critical.value*.99)).toBe(true);
  expect(beam.isStable(critical.value*1.01)).toBe(false);
 });
 it('matches a rank-one top-load instability against the independent torsional Green function',()=>{
  const p=basic(),P=100000,z=450,L=p.length,a=Math.sqrt(p.E*p.Cw/(p.G*p.J));
  p.loads=[{x:L/2,lateral:0,torque:0,vertical:P,height:z}];
  const compliance=(L/2-a*Math.tanh(L/(2*a)))/(2*p.G*p.J);
  near(new LateralTorsionBeam(p).criticalMultiplier().value,1/(P*z*compliance),.0001);
  p.loads[0].height=-z;
  expect(new LateralTorsionBeam(p).criticalMultiplier().bounded).toBe(true);
 });
 it('includes connection/brace flexibility and balances spring torque and transverse force',()=>{
  const p=basic(),k=18000,T=8e6,H=12000,y=p.h0/2,L=p.length,a=Math.sqrt(p.E*p.Cw/(p.G*p.J));
  p.fixed=[];p.restraints=[{x:0,top:k,bottom:k},{x:L,top:k,bottom:k}];p.loads=[{x:L/2,lateral:H,torque:T}];
  const r=new LateralTorsionBeam(p).solve();
  const pinnedTwist=T/(2*p.G*p.J)*(L/2-a*Math.tanh(L/(2*a)));
  near(r.at(L/2).twist,pinnedTwist+T/(4*k*y*y));
  near(r.at(L/2).v,H*L**3/(48*p.E*p.Iy)+H/(4*k),1e-7);
  near(r.restraints.reduce((s,v)=>s+v.torque,0),T,1e-8);
  near(r.restraints.reduce((s,v)=>s+v.lateral,0),H,1e-8);
 });
 it('converges for arbitrary load positions and warping-fixed ends',()=>{
  const p=basic();p.loads=[{x:1733,lateral:12000,torque:4e6},{x:5287,lateral:-9000,torque:3e6}];
  p.fixed!.forEach(f=>f.dofs.push('warping'));
  const coarse=new LateralTorsionBeam({...p,subdivisions:16}).solve(),fine=new LateralTorsionBeam({...p,subdivisions:32}).solve();
  const max=(r:typeof fine,key:'twist'|'warpingCurvature')=>Math.max(...r.stations.map(v=>Math.abs(v[key])));
  near(max(coarse,'twist'),max(fine,'twist'),.005);
  near(max(coarse,'warpingCurvature'),max(fine,'warpingCurvature'),.02);
  expect(Math.abs(fine.at(0).twistRate)).toBeLessThan(1e-12);
 });
 it('rejects unrestrained, invalid and unstable models',()=>{
  const p=basic();p.fixed=[];
  expect(()=>new LateralTorsionBeam(p).solve()).toThrow(/instability/);
  expect(()=>new LateralTorsionBeam({...basic(),loads:[{x:-1,lateral:0,torque:1}]})).toThrow(/outside/);
  const loaded=basic();loaded.moment=()=>1e12;
  expect(()=>new LateralTorsionBeam(loaded).solve(1)).toThrow(/instability/);
 });
 it('includes axial flexural and torsional geometric stiffness',()=>{
  const p=basic();p.axial=100000;
  const flexural=Math.PI**2*p.E*p.Iy/p.length**2;
  const torsional=(p.G*p.J+Math.PI**2*p.E*p.Cw/p.length**2)/p.polarRadiusSquared;
  near(new LateralTorsionBeam(p).criticalMultiplier().value,Math.min(flexural,torsional)/p.axial,.0001);
 });
});
