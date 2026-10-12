import {describe,it,expect} from 'vitest';
import {filletEffectiveSize} from '../src/engine/connectionStrength';
import {calculate} from '../src/engine/calculate';
import {exampleProject} from '../src/engine/defaults';
import {available} from '../src/engine/aiscStrength';
import {demonstrationProject,cappedDemonstrationProject} from '../src/engine/demonstration';
import {railChecks} from '../src/engine/railChecks';
import {railClipResponse} from '../src/engine/railClip';
import type {CalculationSnapshot,ProjectInput} from '../src/engine/types';

const inch=25.4,kip=4448.221615;
/** Rail checks on the 10-ton example's wheel-group demands. */
function checks(p:ProjectInput){
 const P=1.2*8*kip+1.6*(12*kip+.25*20*kip),H=1.6*2*kip,bins=[{name:'Rated',cycles:1e6,vertical:20*kip,lateral:kip,weldStress:0}];
 for(const b of bins)b.weldStress=railClipResponse(p,b.lateral).weldStress;
 return railChecks({input:p,detailResults:{demands:{railLateral:H,railLateralService:2*kip,railVertical:P,railFatigueVertical:20*kip,railFatigueLateral:kip},railFatigueBins:bins}} as unknown as CalculationSnapshot);
}

describe('AISC 360-16 J2.2b: fillets shorter than four weld sizes',()=>{
 it('takes the effective size as no more than a quarter of the length',()=>{
  expect(filletEffectiveSize(.5*inch,2*inch)).toBe(.5*inch);
  expect(filletEffectiveSize(.5*inch,1.5*inch)/inch).toBeCloseTo(.375,12);
  expect(filletEffectiveSize(.3125*inch,.6875*inch)/inch).toBeCloseTo(.171875,12);
  expect(filletEffectiveSize(.25*inch,0)).toBe(0);
 });
 it('screens a short entered weld line at its effective size',()=>{
  const p=structuredClone(exampleProject);p.connections.weldSize=8;p.connections.weldLength=24;
  const c=calculate(p).checks.find(v=>v.id==='weld-screen')!;
  expect(c.capacity).toBeCloseTo(available(.6*p.connections.Fexx*.70710678*(24/4)*24,p.method,.75,2),6);
  expect(c.equation).toContain('\\min(w,L/4)');
 });
 it('takes a rail clip base weld shorter than four weld sizes at its effective size',()=>{
  // The demonstrations' clip base welds are at least four weld sizes long, so they are at full size.
  for(const p of [demonstrationProject(),cappedDemonstrationProject()]){
   const c=p.details!.rail.clip!;expect(c.weldLength).toBeGreaterThanOrEqual(4*c.weld-1e-9);
   expect(checks(p).find(v=>v.id==='rail-clip-weld')!.note).not.toContain('shorter than 4w');
  }
  // 3/8 in fillets 1 1/4 in long: taken at 5/16 in, and the check says so.
  const short=demonstrationProject();short.details!.rail.clip!.weldLength=1.25*inch;
  const before=checks(short).find(v=>v.id==='rail-clip-weld')!,now=checks(demonstrationProject()).find(v=>v.id==='rail-clip-weld')!;
  expect(before.note).toContain('shorter than 4w and taken at the J2.2b effective size L/4');expect(before.utilization!).toBeGreaterThan(now.utilization!);
 });
});
