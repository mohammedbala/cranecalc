import {describe,it,expect} from 'vitest';
import {validateProject} from '../src/engine/calculate';
import {demonstrationProject,cappedDemonstrationProject} from '../src/engine/demonstration';

const inch=25.4,endError='girder-end cover plates';
const errors=(p:ReturnType<typeof demonstrationProject>)=>validateProject(p).join(' | ');
describe('detail clash validation',()=>{
 it('rejects keepers whose welds or lip do not fit, and keepers off the girder surface',()=>{
  // Keepers are welded on the outer face and both ends; the end fillets need twice the weld size.
  const p=demonstrationProject();Object.assign(p.details!.rail,{clipBodyWidth:.75*inch,clipWeld:.375*inch});
  expect(errors(p)).toContain('rail keeper end fillets');
  const lip=demonstrationProject();lip.details!.rail.clipProjection=.25*inch;expect(errors(lip)).toContain('rail keeper lip must overlap');
  const off=demonstrationProject();off.details!.rail.clipBodyWidth=3.5*inch;expect(errors(off)).toContain('rail keepers and their outer fillets must fit');
  const notch=demonstrationProject();notch.details!.rail.anchorNotch=.125*inch;expect(errors(notch)).toContain('rail anchor notch must engage');
 });
 it('rejects end cover plates that overlap the bearing stiffeners',()=>{
  // Former 10-ton bearing: stiffener and weld leave 4.19 in for a 6 in cover plate.
  const p=demonstrationProject();p.details!.endBearing!.enabled=false;p.details!.bearing.length=10*inch;Object.assign(p.details!.end,{gauge:3*inch,edge:1.5*inch,weldLength:12*inch});
  expect(errors(p)).toContain(endError);
  // With bolted end bearings the cover plates are not used, so their footprint is not a constraint.
  p.details!.endBearing!.enabled=true;expect(errors(p)).not.toContain(endError);
 });
 it('keeps both examples buildable under these rules',()=>{
  for(const p of [demonstrationProject(),cappedDemonstrationProject()]){
   const r=p.details!.rail,b=p.details!.bearing,e=p.details!.end;
   // End fillets at least twice the weld size; 1/16 in keeper clearance, so the rail float stays within the eccentricity.
   expect((r.clipBodyWidth??r.clipThickness)-r.clipWeld).toBeGreaterThanOrEqual(2*r.clipWeld-1e-6);expect(r.clipClearance).toBeCloseTo(inch/16,10);
   expect(e.gauge+2*e.edge).toBeLessThanOrEqual(b.length/2-b.stiffenerThickness/2-b.weldSize+1e-6);
   expect(validateProject(p)).toEqual([]);
  }
 });
});
