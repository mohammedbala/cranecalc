import {describe,it,expect} from 'vitest';
import {validateProject} from '../src/engine/calculate';
import {demonstrationProject,cappedDemonstrationProject} from '../src/engine/demonstration';

const inch=25.4,endError='girder-end cover plates';
const errors=(p:ReturnType<typeof demonstrationProject>)=>validateProject(p).join(' | ');
describe('detail clash validation',()=>{
 it('rejects rail clips that do not fit on the girder surface and base welds shorter than 4w',()=>{
  // Weld-on clips stand on the top plate against the rail-base toes; each base weld is a strength weld at least four
  // sizes long (AISC 360-16 J2.2b) and no longer than the clip base is wide.
  const p=demonstrationProject();Object.assign(p.details!.rail.clip!,{weld:.5*inch,weldLength:1.75*inch});
  expect(errors(p)).toContain('rail clip base welds must be at least four times the weld size');
  p.details!.rail.clip!.weldLength=2*inch;expect(errors(p)).not.toContain('four times the weld size');
  const long=demonstrationProject();long.details!.rail.clip!.weldLength=3.5*inch;expect(errors(long)).toContain('cannot be longer than the clip base');
  const off=demonstrationProject();off.details!.rail.clip!.baseWidth=3.5*inch;expect(errors(off)).toContain('rail clips must fit on the girder top flange');
  // Bolted clamp plates: no base weld rules.
  const bolted=demonstrationProject();Object.assign(bolted.details!.rail.clip!,{type:'bolted',weldLength:.5*inch});expect(errors(bolted)).not.toContain('rail clip base welds');
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
   // Rail clip base welds at least four weld sizes long (J2.2b).
   expect(r.clip!.weldLength).toBeGreaterThanOrEqual(4*r.clip!.weld-1e-6);
   expect(e.gauge+2*e.edge).toBeLessThanOrEqual(b.length/2-b.stiffenerThickness/2-b.weldSize+1e-6);
   expect(validateProject(p)).toEqual([]);
  }
 });
});
