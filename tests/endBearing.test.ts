import {describe,expect,it} from 'vitest';
import {calculate,validateProject} from '../src/engine/calculate';
import {demonstrationProject,cappedDemonstrationProject} from '../src/engine/demonstration';
import {endBearingChecks,endBearingGeometry,activeEndBearing} from '../src/engine/endBearing';
import {boltCapacity} from '../src/engine/connectionStrength';
import {drawingSheetSet} from '../src/components/planSheet';
import {detailedDrawings} from '../src/components/detailedDrawings';
import {compactReport} from '../src/report/compactReport';

const inch=25.4;
const texts=(svg:string)=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&'));
const capped=calculate(cappedDemonstrationProject());

describe('bolted girder end bearings',()=>{
 it('sizes the locating bolts for longitudinal force, tie force and uplift',()=>{
  const p=capped.input,e=p.details!.endBearing!,a=capped.designAnalysis!,checks=Object.fromEntries(capped.checks.filter(c=>c.group==='End bearings').map(c=>[c.id,c]));
  const H=capped.detailResults!.demands.brace,V=checks['end-bearing-locating-shear'].demand!;
  expect(V).toBeGreaterThanOrEqual(Math.hypot(a.axial,H)/4-1e-6);
  const bolt=boltCapacity({grade:'A325',diameter:.75*inch,planes:1,surface:'B',shear:V,tension:a.uplift/4,method:'LRFD'});
  expect(checks['end-bearing-locating-slip'].capacity).toBeCloseTo(bolt.slip,3);
  expect(Object.values(checks).every(c=>c.status==='pass')).toBe(true);
  expect(capped.checks.some(c=>c.id==='end-bolt')).toBe(false);
  const hold=capped.checks.find(c=>c.id==='hold-down-model')!;expect(hold.capacity).toBeCloseTo(4*checks['end-bearing-locating-tension'].capacity!,3);
  expect(capped.eligible).toBe(true);
  // Sleeved sliding bolts: the slot clears a 13/16 in bore plus two 5/16 in walls, plus 1/16 in, and twice the 1/2 in allowance.
  expect(endBearingGeometry(p,e).slot).toBeCloseTo((13/16+5/8+1/16+1)*inch,9);
  // Snug-tight bolts slot the standard hole itself.
  expect(endBearingGeometry(p,{...e,sliding:'snug-tight'}).slot).toBeCloseTo((13/16+1)*inch,9);
 },240000);
 it('rejects slots, ribs and stiffeners that cannot be built',()=>{
  const p=structuredClone(capped.input),e=p.details!.endBearing!,ctx={analysis:capped.designAnalysis!,lateral:capped.detailResults!.demands.brace};
  const status=(id:string)=>endBearingChecks(p,e,ctx).find(c=>c.id===id)!.status;
  // The J3.2 long-slot limit applies to snug-tight bolts in slotted bolt holes.
  e.sliding='snug-tight';p.details!.simpleSupport!.guideTravel=1*inch;expect(status('end-bearing-slot')).toBe('fail');p.details!.simpleSupport!.guideTravel=.5*inch;e.sliding='sleeved';
  p.details!.bracket!.ribSpacing=8*inch;expect(status('end-bearing-wrench-rib')).toBe('fail');p.details!.bracket!.ribSpacing=10.5*inch;
  e.bolts.edge=4.5*inch;expect(status('end-bearing-wrench-stiffener')).toBe('fail');e.bolts.edge=2*inch;
  e.bolts.gauge=2.5*inch;expect(status('end-bearing-wrench-web')).toBe('fail');
 });
 it('applies only to independent simple spans; continuous runways keep the girder-end connection',()=>{
  const p=demonstrationProject();p.system='continuous';
  expect(validateProject(p).join(' ')).not.toContain('end bearing');expect(activeEndBearing(p)).toBeUndefined();
 });
 it('draws locating and sliding bearings and references them from S-04 and the report',()=>{
  const set=drawingSheetSet(capped),s02=set.find(v=>v.number==='S-02')!,s04=set.find(v=>v.number==='S-04')!;
  expect(s02.svg).toContain('data-view="end-bearing"');expect(s02.svg).not.toContain('data-view="end-connection"');
  const t=texts(s02.svg).join(' ');expect(t).toContain('PRETENSIONED AGAINST STEEL SLEEVES 1 7/16" OD');expect(t).toContain('2 1/2" SLOT IN FLANGE FOR 1/2" EA. WAY');expect(t).toContain('LOCATING: 4 - 3/4" A325 SC,');
  expect(texts(s04.svg).join(' ')).toContain('UPLIFT (2/S-02)');
  for(const sheet of set)expect(sheet.svg).not.toMatch(/NOT IN SET|\{\{/);
  expect(texts(set[0].svg).join(' ')).not.toContain('COLUMN-SIDE LOCATING AND GUIDED HOLD-DOWN');
  const sk=detailedDrawings(capped).find(v=>v.name==='end-connection-detail')!;expect(sk.title).toContain('Bolted end bearing');
  expect(compactReport(capped,'')).toContain('04B / Bolted end bearings');
 },240000);
});
