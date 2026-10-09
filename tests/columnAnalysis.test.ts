import {describe,it,expect} from 'vitest';
import {columnResponse,combinedPeak} from '../src/engine/columnAnalysis';

const H=6000,EI=200000*1e8,peak=(r:ReturnType<typeof columnResponse>)=>Math.max(...r.samples.map(s=>Math.abs(s.moment)));
describe('column frame solver against closed forms',()=>{
 it('cantilever: base moment P·a and tip deflection P·a³/(3EI)',()=>{
  const P=1000,a=4000,r=columnResponse(H,EI,{base:'fixed',top:'free'},[{x:a,force:P}]);
  expect(Math.abs(r.reactions.baseMoment)).toBeCloseTo(P*a,6);expect(peak(r)).toBeCloseTo(P*a,6);
  expect(Math.abs(r.displacement(a))).toBeCloseTo(P*a**3/(3*EI),9);
  expect(Math.max(...r.samples.map(s=>Math.abs(s.shear)))).toBeCloseTo(P,6);
 });
 it('pinned base, braced top, applied moment M0: jump from M0·a/H to M0·(H−a)/H',()=>{
  const M0=1e6,a=2000,r=columnResponse(H,EI,{base:'pinned',top:'braced'},[{x:a,moment:M0}]);
  const below=r.samples.find(s=>s.x===a&&r.samples.indexOf(s)%2===1)!,above=r.samples.find(s=>s.x===a&&r.samples.indexOf(s)%2===0)!;
  expect(Math.abs(below.moment)).toBeCloseTo(M0*a/H,4);expect(Math.abs(above.moment)).toBeCloseTo(M0*(H-a)/H,4);
  expect(Math.abs(r.reactions.base)).toBeCloseTo(M0/H,8);expect(r.reactions.base+r.reactions.top).toBeCloseTo(0,8);
 });
 it('propped cantilever: prop reaction P·a²(3H−a)/(2H³)',()=>{
  const P=1000,a=2000,r=columnResponse(H,EI,{base:'fixed',top:'braced'},[{x:a,force:P}]);
  const prop=P*a**2*(3*H-a)/(2*H**3);
  expect(Math.abs(r.reactions.top)).toBeCloseTo(prop,6);expect(Math.abs(r.reactions.baseMoment)).toBeCloseTo(P*a-prop*H,4);
  expect(r.reactions.base+r.reactions.top+P).toBeCloseTo(0,6);
 });
 it('rejects an unstable support and mismatched sample stations',()=>{
  expect(()=>columnResponse(H,EI,{base:'pinned',top:'free'},[{x:H,force:1}])).toThrow('unstable');
  const a=columnResponse(H,EI,{base:'fixed',top:'free'},[{x:2000,moment:1}]),b=columnResponse(H,EI,{base:'fixed',top:'free'},[{x:3000,force:1}]);
  expect(()=>combinedPeak(a.samples,b.samples,'moment',1,1)).toThrow('share sample stations');
  // Shared stations: unit moment at 2000 mm plus unit force at 3000 mm peak together at the base.
  const a2=columnResponse(H,EI,{base:'fixed',top:'free'},[{x:2000,moment:1}],[3000]),c=columnResponse(H,EI,{base:'fixed',top:'free'},[{x:3000,force:1}],[2000]);
  expect(combinedPeak(a2.samples,c.samples,'moment',1,1)).toBeCloseTo(1+3000,6);
 });
});
