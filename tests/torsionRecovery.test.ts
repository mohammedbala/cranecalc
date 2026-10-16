import {describe,expect,it} from 'vitest';
import {LateralTorsionBeam,type LateralTorsionInput} from '../src/engine/lateralTorsion';
import {flangeStressTerms} from '../src/engine/detailAnalysis';

/**
 * Stress recovery of the detailed girder model (torsion-normal): the internal forces of the analysis at the stiffness it
 * was solved with (AISC 360-16 C2.3: 0.8E, 0.8G for strength), and no separate θM_x where the coupled second-order solve
 * already carries it (Vlasov: E·I_y·v″ = M_y,first-order + θM_x). W27X146, 25 ft, fork supports.
 */
const inch=25.4,E=199947.98,G=E/2.6,k=.8;
const w={d:27.4*inch,bf:14*inch,tf:1.34*inch,Iy:443*inch**4,Ix:5660*inch**4,J:11.3*inch**4,Cw:75700*inch**6,A:42.8*inch**2};
const h0=w.d-w.tf,L=25*12*inch,W={top:h0*w.bf/4,bottom:h0*w.bf/4};
const fork=(o:Partial<LateralTorsionInput>):LateralTorsionInput=>({length:L,E:k*E,G:k*G,Iy:w.Iy,J:w.J,Cw:w.Cw,h0,polarRadiusSquared:(w.Ix+w.Iy)/w.A,loads:[],restraints:[],
 fixed:[{x:0,dofs:['v','twist']},{x:L,dofs:['v','twist']}],subdivisions:40,...o});
const near=(a:number,b:number,tol=.01)=>expect(Math.abs(a-b)/Math.abs(b)).toBeLessThan(tol);

describe('flange stress recovery at the analysis stiffness',()=>{
 it('uniform M plus a midspan lateral load: recovered M_y = statics + Mθ, θM_x not added again',()=>{
  // Critical uniform moment of the 0.8-stiffness beam, as a multiple of 1000 kN·m.
  const P=20000,M0=1e9,critical=new LateralTorsionBeam(fork({moment:()=>M0})).criticalMultiplier().value*M0;
  for(const f of [.3,.6]){
   const M=f*critical,r=new LateralTorsionBeam(fork({moment:()=>M,loads:[{x:L/2,lateral:P,torque:0}]})).solve(1),s=r.at(L/2);
   const t=flangeStressTerms(s,{E,factor:k,multiplier:1,Iy:w.Iy,M,W});
   // Second-order lateral moment of the solution: the first-order statics PL/4 amplified by the rotated major moment.
   near(t.My,P*L/4+Math.abs(M*s.twist));
   expect(t.thetaM).toBe(0);
   // The old recovery (full E, plus θM_x) overstated it.
   expect(E*Math.abs(s.curvature)*w.Iy+Math.abs(M*s.twist)).toBeGreaterThan(1.25*t.My);
  }
 });
 it('the first-order case reproduces the DG9 hand values (internal forces independent of the 0.8 stiffness)',()=>{
  // Concentrated torque T and lateral load P at midspan, fork supports, warping free: DG9 Case 3 closed form.
  const T=20e6,P=20000,M=3e8,a=Math.sqrt(E*w.Cw/(G*w.J));
  const r=new LateralTorsionBeam(fork({loads:[{x:L/2,lateral:P,torque:T}]})).solve(0),s=r.at(L/2);
  const theta=T/(2*G*w.J)*(L/2-a*Math.tanh(L/(2*a))),thetaDD=T/(2*G*w.J*a)*Math.tanh(L/(2*a));
  // The 0.8-stiffness solve twists 1/0.8 times as much; its internal forces are those of the full-stiffness hand solution.
  near(Math.abs(s.twist),theta/k);
  const t=flangeStressTerms(s,{E,factor:k,multiplier:0,Iy:w.Iy,M,W});
  near(t.warping.top,E*W.top*thetaDD);
  near(t.My,P*L/4);
  // A first-order solve adds the rotated major moment separately.
  expect(t.thetaM).toBeCloseTo(Math.abs(M*s.twist),6);
 });
});
