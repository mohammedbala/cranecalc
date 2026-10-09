import {describe,it,expect} from 'vitest';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {flangeTieGeometry} from '../src/engine/tieGeometry';
import {flangeTieResponse,flangeTieChecks} from '../src/engine/flangeTieDesign';
import {validateRunwayDetails} from '../src/engine/detailValidation';
import type {CalculationSnapshot} from '../src/engine/types';
const inch=25.4;
describe('direct flange attachment',()=>{
 it('fits wholly on its own girder, clear of cap legs, stiffeners and the rolled root',()=>{
  const p=cappedDemonstrationProject(),g=flangeTieGeometry(p)!,b=p.section,t=p.details!.brace;
  expect(validateRunwayDetails(p)).toEqual([]);
  expect(g.stations).toHaveLength(6);
  for(const v of g.stations){
   expect(v.tieX-g.attachment.saddleLength/2).toBeGreaterThanOrEqual(v.start);
   expect(v.tieX+g.attachment.saddleLength/2).toBeLessThanOrEqual(v.finish);
   expect(Math.abs(v.tieX-v.center)).toBeCloseTo(3.5*inch);
  }
  const capBottom=b.d/2+b.capTw-b.capDepth;
  expect(capBottom-(g.topCenter+t.width/2)).toBeCloseTo(.25*inch);
  expect(g.freeLength).toBeCloseTo(10*inch);
  expect(t.connection.gauge).toBeGreaterThan(8*t.connection.diameter/3);
 });
 it('matches independent section-modulus and virtual-work strip bounds',()=>{
  const p=cappedDemonstrationProject(),g=flangeTieGeometry(p)!,t=p.details!.brace,F=10000,r=flangeTieResponse(p,F);
  const B=4.25*inch,ts=1.25*inch,L=g.rootLength,h=r.h,H=h-ts;
  const flangeZ=B*p.section.tf**2/6;
  expect(r.flange).toBeCloseTo(F*h/flangeZ+1.5*F/(B*p.section.tf),8);
  // q=6FH/L²; center-loaded simple strip: m=qB/4; f=6m/ts².
  expect(r.saddle).toBeCloseTo(6*(6*F*H/L**2*B/4)/ts**2+1.5*F/(L*ts),8);
  expect(r.compliance).toBeGreaterThan(h*h*(g.rootEnd-p.section.tw/2)/(p.section.E*(B*p.section.tf**3/12)));
  const twice=flangeTieResponse(p,2*F);
  for(const key of ['gusset','saddle','flange','column','rootWeld'] as const)expect(twice[key]).toBeCloseTo(2*r[key],8);
  expect(twice.compliance).toBe(r.compliance);
  expect(r.gussetWeld.demand).toBeGreaterThan(F/(2*L*g.attachment.weldSize/Math.sqrt(2)));
  expect(t.width).toBeCloseTo(3.75*inch);
 });
 it('fails insufficient spacing and local plate resistance rather than suppressing the checks',()=>{
  const p=cappedDemonstrationProject(),snapshot={input:p,detailResults:{demands:{braceFatigue:4000}}} as CalculationSnapshot;
  expect(flangeTieChecks(snapshot,10000).filter(c=>c.status==='fail')).toEqual([]);
  p.details!.brace.flangeAttachment!.longitudinalSetback=2*inch;
  expect(flangeTieChecks(snapshot,10000).find(c=>c.id==='flange-tie-stiffener-clearance')?.status).toBe('fail');
  p.details!.brace.flangeAttachment!.saddleThickness=.25*inch;
  expect(flangeTieChecks(snapshot,10000).find(c=>c.id==='flange-tie-saddle')?.status).toBe('fail');
 });
 it('rejects a shortened connection or displaced saddle that leaves its assigned end',()=>{
  const p=cappedDemonstrationProject();p.details!.brace.connectionLength=inch;
  expect(validateRunwayDetails(p).some(v=>v.includes('full flange-to-end extension'))).toBe(true);
  p.details!.brace.flangeAttachment!.longitudinalSetback=8*inch;
  expect(validateRunwayDetails(p).some(v=>v.includes('own girder end'))).toBe(true);
 });
});
