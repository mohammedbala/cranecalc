import {describe,expect,it} from 'vitest';
import {buildProject} from '../src/engine/configurator';
import {defaultRunwayConfig,type RunwayConfig} from '../src/engine/configInputs';
import {existingColumnAnalysis,twistMovementLimit} from '../src/engine/existingColumn';
import {twistRotationLimit} from '../src/engine/columnTwistLimit';
import {supportReactions} from '../src/engine/supportReactions';
import {sectionProperties} from '../src/engine/section';
import {bracingRatios,stiffestTorsionStrut} from '../src/engine/bracingSizing';
import {configuratorOpenItems} from '../src/engine/calculate';
import {aiscShapeByName} from '../src/data/aiscSections';
import type {CheckResult} from '../src/engine/types';

/**
 * Heavy cranes on new freestanding columns (simulation set cases-v3, round 7): the configurator sizes the column, its
 * torsion brace and the bracket seat for the drift and the seat twist, holds the column face where a longer reach does
 * not let the tie pass, and names a column beyond the rolled W14 catalog as an open item with the arrangement to use.
 */
const inch=25.4;
const sim=(number:string,c:Partial<RunwayConfig>):RunwayConfig=>({...defaultRunwayConfig,title:`SIM-${number}`,number:`SIM-${number}`,units:'US',method:'LRFD',scope:'design',cranes:1,system:'simple',structure:'new',...c});
const twistOf=(p:ReturnType<typeof buildProject>)=>{const a=existingColumnAnalysis(p,supportReactions(p,sectionProperties(p.section))),t=a.torsion!;return {rotation:Math.abs(t.twist)/twistRotationLimit,movement:Math.abs(t.service.slip)/twistMovementLimit(p,a)};};

describe('new freestanding columns for heavy cranes',()=>{
 it('072: the torsion-brace strut stiff enough for the seat twist (W10 to 112 lb/ft), the seat collector fillet to 3/4 in',()=>{
  const p=buildProject(sim('072',{capacity:40,craneSpan:64,control:'cab',cmaa:'D',buildingClass:'B',bays:1,span:35,railElevation:17,girder:'capped',support:'twin-rib',tie:'flexible-plate'}));
  const d=p.longitudinalBracing!.design!,strut=aiscShapeByName(d.strut.shape)!;
  expect(d.torsionBrace).toBeDefined();
  // The 65 lb/ft struts left the twist at 1.15 of its small-rotation limit.
  expect(strut.weight).toBeGreaterThan(65);expect(strut.Iy).toBeLessThanOrEqual(aiscShapeByName(stiffestTorsionStrut(p)!)!.Iy);
  const t=twistOf(p);expect(t.rotation).toBeLessThanOrEqual(1);expect(t.movement).toBeLessThanOrEqual(1);
  // The seat couple F·e on the collector welds: the seat top fillet and the rib root fillets as one group (1.08 on the
  // 5/8 in top fillet alone before, which grew to 3/4 in).
  expect(d.seatWeld).toBeLessThanOrEqual(.75*inch+1e-6);
  expect(bracingRatios(p)['brace-seat-weld']).toBeLessThanOrEqual(1);
 },300000);
 it('073: no W14 to the W14X730 keeps a 35 ft cantilever column within its drift: the W14X730 built, an open item beyond the W14 range with its column-cap estimate; the face held at 20 in',()=>{
  const p=buildProject(sim('073',{capacity:40,craneSpan:71,control:'cab',cmaa:'C',buildingClass:'C',bays:3,span:20,railElevation:35,girder:'rolled',support:'twin-rib',tie:'flexible-plate'}));
  // The search runs past the W14X398 through the jumbo W14s (heavy shapes, as the W14X283 to W14X398 are) and builds
  // the heaviest searched, the one closest to the drift limit.
  expect(p.existingColumn!.shape).toBe('W14X730');
  const v=p.configurator!.beyondCatalog!.find(x=>x.member==='crane-column')!;
  expect(v).toMatchObject({shape:'W14X730'});expect(v.reason).toMatch(/^New column beyond the W14 range: the heaviest W14 searched, W14X730, still gives base drift ratio/);
  // The recommendation from the drift without the eccentric reaction moment (an estimate): caps leave the W14X730 alone
  // within the limit, the footing sized for the rest.
  expect(v.reason).toMatch(/Column caps on the W14X730 would leave about 0\.\d\d of the drift limit for the column alone, 1\.\d\d with this footing's rotation/);
  expect(v.reason).toMatch(/Recommended: column caps over the new columns .*the footing sized for the rest of the drift/);
  expect(configuratorOpenItems(p).find(c=>c.id==='configurator-crane-column')?.title).toBe('New column beyond the W14 range (drift, torsion or twist)');
  // The torsion strut sized past the 65 lb/ft struts for the movement target, the log stating the movement achieved.
  expect(p.longitudinalBracing!.design!.strut.shape).toBe(stiffestTorsionStrut(p));
  expect(p.configurator!.selections!.find(s=>s.item==='Longitudinal path')!.reason).toMatch(/twist movement under the factored traction is 0\.\d+ in, above the 0\.063 in .*the W10X112 is the stiffest strut that fits/);
  expect(p.configurator!.selections!.some(s=>s.item==='Open item'&&s.entered==='Crane column')).toBe(true);
  expect(configuratorOpenItems(p).find(c=>c.id==='configurator-crane-column')?.status).toBe('incomplete');
  // The tie passes at no face to 30 in: the reach stays at 20 in, the seat twist within its limits.
  expect(p.details!.bracket!.reach).toBeCloseTo(20*inch,6);
  // (Sized for the twist the sized torsion strut leaves, the tie sizing keeps the 20 in face itself, or moves it out and
  // attachTieAtFace takes it back: either way the face stays and the tie is the open item.)
  expect(p.configurator!.beyondCatalog!.some(x=>x.member==='tie')).toBe(true);
  const t=twistOf(p);expect(t.rotation).toBeLessThanOrEqual(1);
 },600000);
 it('099: the W36X529 (no plate girder), the fork stiffener pair thicker than 1 1/2 in for its fatigue, the cap bolts at their limit stated in the log',()=>{
  const p=buildProject(sim('099',{capacity:40,craneSpan:97,control:'cab',cmaa:'D',buildingClass:'B',bays:3,span:45,railElevation:15,girder:'rolled',support:'column-cap',tie:'paired-bars',reach:26}));
  // The lateral deflection on the DG7 model (the top flange alone under one crane's side thrust) is within the catalog
  // (round 7: 1.14 calculated on the old flange-couple model; the twist-inclusive rail-head movement 0.72): the
  // W36X529, the closest to the sizing targets, and no plate-girder open item.
  expect(p.section.name).toBe('W36X529');
  expect(p.configurator!.beyondCatalog?.some(v=>v.member==='girder')).toBeFalsy();
  expect(p.configurator!.selections!.find(s=>s.item==='Girder')?.reason).toMatch(/screening estimates/);
  const b=p.details!.bearing,col=aiscShapeByName(p.existingColumn!.shape)!;
  expect(b.stiffenerThickness).toBeGreaterThan(1.5*inch);expect(b.stiffenerThickness).toBeLessThanOrEqual(2*inch+1e-6);
  // The pair stays between the column flanges.
  expect(2*b.stiffenerWidth+p.section.tw).toBeLessThanOrEqual((col.d-2*col.tf)*inch+1e-6);
  const row=p.configurator!.selections!.find(s=>s.item==='Column cap, at its limits')!;
  expect(row.reason).toMatch(/bolt-fatigue/);expect(row.reason).toMatch(/review draft/);
 },300000);
 it('judges a column open item by the column checks, not the AIST bracket applicability screen',()=>{
  const p=buildProject(sim('T01',{capacity:5,craneSpan:50,control:'pendant',cmaa:'C',buildingClass:'C',bays:2,span:20,railElevation:16,girder:'rolled',support:'twin-rib',tie:'paired-bars'}));
  p.configurator={...p.configurator!,beyondCatalog:[{member:'crane-column',shape:p.existingColumn!.shape,reason:'Built-up crane column required: test.'}]};
  const row=(id:string,status:'pass'|'fail')=>({id,group:'',title:'',status,equation:'',note:'',referenceIds:[]}) as CheckResult;
  expect(configuratorOpenItems(p,[row('column-brackets','fail'),row('column-drift','pass')])[0].status).toBe('pass');
  expect(configuratorOpenItems(p,[row('column-brackets','pass'),row('column-drift','fail')])[0].status).toBe('incomplete');
 },300000);
});
