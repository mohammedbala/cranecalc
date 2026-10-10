import {describe,expect,it} from 'vitest';
import {demonstrationProject,cappedDemonstrationProject} from '../src/engine/demonstration';
import {sectionProperties} from '../src/engine/section';
import {LateralTorsionBeam,type LateralTorsionInput} from '../src/engine/lateralTorsion';
import {flexureCurves} from '../src/engine/loadHeightFlexure';
import {girderStrength} from '../src/engine/aiscStrength';

const p=demonstrationProject(),s=sectionProperties(p.section),E=p.section.E,G=E/2.6,L=p.unbracedLength;
const rolled=flexureCurves(p,s).positive;
// Fork-supported beam with the 0.8 stiffness used by the detailed strength model.
const fork:LateralTorsionInput={length:L,E:.8*E,G:.8*G,Iy:s.Iy,J:s.J,Cw:s.Cw,h0:s.h0,polarRadiusSquared:(s.Ix+s.Iy)/s.A,loads:[],restraints:[],fixed:[{x:0,dofs:['v','twist']},{x:L,dofs:['v','twist']}],subdivisions:40};
// Clark and Hill load-height solution (ENV 1993-1-1 Annex F.1.2): z > 0 above the shear center.
const clarkHill=(C1:number,C2:number,z:number)=>C1*Math.PI**2*E*s.Iy/L**2*(Math.sqrt(s.Cw/s.Iy+L*L*G*s.J/(Math.PI**2*E*s.Iy)+(C2*z)**2)-C2*z);

describe('load-height lateral-torsional buckling',()=>{
 it('maps an elastic critical moment to the F2-4 and F5 equivalent unbraced length',()=>{
  for(const x of [.5*L,L,2*L,4*L])expect(rolled.length(rolled.mcr(x))/x).toBeCloseTo(1,12);
  // Beyond Lr the available strength is phi times the elastic critical moment.
  const st=girderStrength(p,s);expect(rolled.available(1.5*st.Lr)).toBeCloseTo(.9*rolled.mcr(1.5*st.Lr),3);
  expect(rolled.base).toBe(st.major);
  const q=cappedDemonstrationProject(),qs=sectionProperties(q.section),capped=flexureCurves(q,qs).positive,cs=girderStrength(q,qs),top=cs.capDirections![0];
  expect(capped.length(capped.mcr(L))/L).toBeCloseTo(1,12);
  const far=2*top.Lr;expect(capped.available(far)).toBeCloseTo(.9*Math.min(top.Rpg*capped.mcr(far),girderStrength({...q,unbracedLength:far},qs).major/.9),3);
  // The table never reports a length whose strength falls below the target.
  for(const f of [1,.8,.5,.2]){const target=f*rolled.base;expect(rolled.available(rolled.lengthFor(target))).toBeGreaterThanOrEqual(target*(1-1e-12));}
  for(const x of [.5*L,L,1.7*L,5*L,60*L])expect(rolled.lowerBound(x)).toBeLessThanOrEqual(rolled.available(x)*(1+1e-12));
 });
 it('recovers Lb from the eigenvalue of a uniformly bent fork-supported beam',()=>{
  const M=1e8,lambda=new LateralTorsionBeam({...fork,moment:()=>M}).criticalMultiplier().value;
  expect(rolled.length(lambda*M/.8)/L).toBeCloseTo(1,3);
 });
 it('matches the Clark and Hill load-height coefficients for point and distributed loads',()=>{
  for(const z of [0,p.section.d/2,-p.section.d/2]){
   const P=1e5,point=new LateralTorsionBeam({...fork,loads:[{x:L/2,lateral:0,torque:0,vertical:P,height:z}],moment:x=>P*Math.min(x,L-x)/2}).criticalMultiplier().value;
   expect(Math.abs(point*P*L/4/.8/clarkHill(1.365,.553,z)-1)).toBeLessThan(.015);
   const q=20,udl=new LateralTorsionBeam({...fork,distributedVertical:q,distributedHeight:z,moment:x=>q*x*(L-x)/2}).criticalMultiplier().value;
   expect(Math.abs(udl*q*L*L/8/.8/clarkHill(1.132,.459,z)-1)).toBeLessThan(.015);
  }
  // Wheels at the top flange lengthen the equivalent length; the same load at the shear center would earn
  // a moment-gradient credit that the check does not take.
  const at=(z:number)=>{const P=1e5;return rolled.length(new LateralTorsionBeam({...fork,loads:[{x:L/2,lateral:0,torque:0,vertical:P,height:z}],moment:x=>P*Math.min(x,L-x)/2}).criticalMultiplier().value*P*L/4/.8);};
  expect(at(p.section.d/2)).toBeGreaterThan(L);expect(at(0)).toBeLessThan(L);
 });
});
