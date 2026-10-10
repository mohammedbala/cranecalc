import {describe,it,expect} from 'vitest';
import {validateProject} from '../src/engine/calculate';
import {demonstrationProject,cappedDemonstrationProject} from '../src/engine/demonstration';

const inch=25.4,keeperError='rail keeper inner fillet',endError='girder-end cover plates';
const errors=(p:ReturnType<typeof demonstrationProject>)=>validateProject(p).join(' | ');
describe('detail clash validation',()=>{
 it('rejects a keeper whose inner fillet would be welded into the rail foot',()=>{
  // Former 10-ton keeper: 1/2 in projection leaves 1/4 in for a 3/4 in fillet.
  const p=demonstrationProject();Object.assign(p.details!.rail,{clipProjection:.5*inch,clipWeld:.75*inch});
  expect(errors(p)).toContain(keeperError);
  const c=cappedDemonstrationProject();c.details!.rail.clipProjection=.125*inch;expect(errors(c)).toContain(keeperError);
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
   expect(r.clipWeld+1.5875).toBeLessThanOrEqual(r.clipProjection/2+1e-6);
   expect(e.gauge+2*e.edge).toBeLessThanOrEqual(b.length/2-b.stiffenerThickness/2-b.weldSize+1e-6);
   expect(validateProject(p)).toEqual([]);
  }
 });
});
