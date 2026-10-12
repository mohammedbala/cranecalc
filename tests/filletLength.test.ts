import {describe,it,expect} from 'vitest';
import {filletEffectiveSize} from '../src/engine/connectionStrength';
import {calculate} from '../src/engine/calculate';
import {exampleProject} from '../src/engine/defaults';
import {available} from '../src/engine/aiscStrength';
import {demonstrationProject,cappedDemonstrationProject} from '../src/engine/demonstration';
import {railChecks} from '../src/engine/railChecks';
import {railKeeperResponse} from '../src/engine/railKeeper';
import {keeperGeometry,anchorGeometry,railPadThickness} from '../src/engine/railSeat';
import type {CalculationSnapshot,ProjectInput} from '../src/engine/types';

const inch=25.4,kip=4448.221615;
/** Rail checks on the 10-ton example's wheel-group demands. */
function checks(p:ProjectInput){
 const P=1.2*8*kip+1.6*(12*kip+.25*20*kip),H=1.6*2*kip,bins=[{name:'Rated',cycles:1e6,vertical:20*kip,lateral:kip,flangeStress:0,plateStress:0,weldStress:0}];
 for(const b of bins)Object.assign(b,railKeeperResponse(p,b.vertical,b.lateral));
 return railChecks({input:p,detailResults:{demands:{railLateral:H,railVertical:P,railFatigueVertical:20*kip,railFatigueLateral:kip},railFatigueBins:bins}} as unknown as CalculationSnapshot);
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
 it('states the effective size of the keeper and anchor fillets in their checks',()=>{
  // The demonstrations' end fillets are all at least four weld sizes long, so every fillet is at full size.
  for(const p of [demonstrationProject(),cappedDemonstrationProject()]){
   const k=keeperGeometry(p.details!.rail,railPadThickness(p)),a=anchorGeometry(p.details!.rail,railPadThickness(p));
   expect(Math.min(k.length,k.endWeld,a.endWeld)).toBeGreaterThanOrEqual(4*k.weld-1e-9);
   const c=checks(p);
   for(const id of ['rail-keeper-weld','rail-anchor-weld'])expect(c.find(v=>v.id===id)!.note).toContain('so its full size is effective (J2.2b)');
  }
  // The former keeper, a 2 in body with 1/2 in fillets: 1 1/2 in end fillets, taken at 3/8 in.
  const old=demonstrationProject();Object.assign(old.details!.rail,{clipBodyWidth:2*inch,clipWeld:.5*inch});
  const before=checks(old),weld=before.find(v=>v.id==='rail-keeper-weld')!,anchor=before.find(v=>v.id==='rail-anchor-weld')!;
  expect(weld.note).toContain('The end fillets are shorter than 4w and taken at the J2.2b effective size L/4');
  // Taken at the reduced size these welds approach their strength; the 2 1/4 in body with 3/8 in fillets (1 3/4 in end
  // fillets, stopped 1/2 in short of the rail-side face) leaves margin.
  expect(weld.utilization!).toBeGreaterThan(.9);expect(anchor.utilization!).toBeGreaterThan(.95);
  const now=checks(demonstrationProject());
  expect(now.find(v=>v.id==='rail-keeper-weld')!.utilization!).toBeLessThan(.8);
  expect(now.find(v=>v.id==='rail-anchor-weld')!.utilization!).toBeLessThan(.9);
  expect(now.find(v=>v.id==='rail-keeper-fatigue')!.utilization!).toBeLessThan(.9);
 });
 it('bears the anchor keeper on the flat notch end beyond the corner hole',()=>{
  const p=demonstrationProject(),c=checks(p).find(v=>v.id==='rail-anchor-bearing')!;
  // 1/2 in notch less the 1/4 in hole radius, over the 3/4 in rail base; plate Fy 50 ksi governs the 60 ksi rail.
  expect(c.capacity!/kip).toBeCloseTo(.75*1.8*50*(.25*.75),4);
  expect(c.note).toContain('drilled holes');
 });
});
