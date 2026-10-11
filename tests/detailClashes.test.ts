import {describe,it,expect} from 'vitest';
import {validateProject} from '../src/engine/calculate';
import {demonstrationProject,cappedDemonstrationProject} from '../src/engine/demonstration';

const inch=25.4,endError='girder-end cover plates';
const errors=(p:ReturnType<typeof demonstrationProject>)=>validateProject(p).join(' | ');
describe('detail clash validation',()=>{
 it('rejects keepers whose welds or lip do not fit, and keepers off the girder surface',()=>{
  // Keepers are welded on the outer face and both ends; every fillet is a strength weld at least four sizes
  // long (AISC 360-16 J2.2b). The former 2 in body with 1/2 in fillets left 1 1/2 in end fillets, under 4w = 2 in.
  const p=demonstrationProject();Object.assign(p.details!.rail,{clipBodyWidth:2*inch,clipWeld:.5*inch});
  expect(errors(p)).toContain('rail keeper end fillets');expect(errors(p)).toContain('four times the weld size');
  expect(errors(p)).toContain('anchor keeper end fillets');
  // A 2 1/2 in body gives 2 in end fillets, exactly 4w, and the anchor keeper 2 in beyond its 1/2 in notch.
  p.details!.rail.clipBodyWidth=2.5*inch;expect(errors(p)).not.toContain('end fillets');
  const short=demonstrationProject();Object.assign(short.details!.rail,{clipWidth:1.25*inch});expect(errors(short)).toContain('outer-face fillet must be at least four times');
  const lip=demonstrationProject();lip.details!.rail.clipProjection=.25*inch;expect(errors(lip)).toContain('rail keeper lip must overlap');
  const off=demonstrationProject();off.details!.rail.clipBodyWidth=3.5*inch;expect(errors(off)).toContain('rail keepers and their outer fillets must fit');
  // The anchor keeper bears on the flat notch end beyond the 1/4 in radius corner holes: a 5/16 in notch leaves 1/16 in.
  const notch=demonstrationProject();notch.details!.rail.anchorNotch=.3125*inch;expect(errors(notch)).toContain('at least 1/8 in of flat notch end');
  notch.details!.rail.anchorNotch=.375*inch;expect(errors(notch)).not.toContain('flat notch end');
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
   // End fillets at least four weld sizes long (J2.2b), the anchor's too; 1/16 in keeper clearance, so the rail float
   // stays within the eccentricity.
   expect((r.clipBodyWidth??r.clipThickness)-r.clipWeld).toBeGreaterThanOrEqual(4*r.clipWeld-1e-6);expect(r.clipClearance).toBeCloseTo(inch/16,10);
   expect((r.clipBodyWidth??r.clipThickness)-Math.max(r.clipWeld,r.anchorNotch!)).toBeGreaterThanOrEqual(4*r.clipWeld-1e-6);
   expect(e.gauge+2*e.edge).toBeLessThanOrEqual(b.length/2-b.stiffenerThickness/2-b.weldSize+1e-6);
   expect(validateProject(p)).toEqual([]);
  }
 });
});
