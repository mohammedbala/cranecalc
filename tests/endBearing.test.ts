import {describe,expect,it} from 'vitest';
import {calculate,validateProject} from '../src/engine/calculate';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {endBearingChecks,endBearingGeometry,activeEndBearing,continuousBearings,locatingSupport} from '../src/engine/endBearing';
import {boltCapacity} from '../src/engine/connectionStrength';
import {drawingSheetSet,detailReferences} from '../src/components/planSheet';
import {detailedDrawings} from '../src/components/detailedDrawings';
import {compactReport} from '../src/report/compactReport';
import {endBearingView} from '../src/components/endBearingDetail';
import {slidingBoltView} from '../src/components/slidingBoltSection';
import {detailTitles} from '../src/components/sheetGraphics';

const inch=25.4,foot=304.8;
const texts=(svg:string)=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&'));
const capped=calculate(cappedDemonstrationProject());

const lines=(svg:string)=>[...svg.matchAll(/<line[^>]*x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)].map(m=>m.slice(1,5).map(Number));

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
 it('locates a continuous girder at the support nearest mid-length and slots the others for its thermal travel',()=>{
  const p=structuredClone(capped.input);p.system='continuous';p.details!.brace.flangeAttachment!.enabled=false;
  expect(validateProject(p)).toEqual([]);expect(activeEndBearing(p)).toBeDefined();
  const supports=continuousBearings(p),bs=p.details!.bearing;
  expect(supports.map(v=>v.role)).toEqual(['SLIDING','LOCATING','SLIDING','SLIDING']);expect(locatingSupport(p)).toBe(1);
  // Bearing plates start at the girder ends at the runway ends and are centered on the interior grids.
  expect(supports.map(v=>v.start)).toEqual([0,25*foot-bs.length/2,50*foot-bs.length/2,75*foot-bs.length]);
  expect(supports.map(v=>v.distance)).toEqual([25*foot,0,25*foot,50*foot]);
  // Twin bracket ribs under the plate: runway-end grid, then both ribs about an interior grid.
  const wb=p.details!.bracket!;expect(endBearingGeometry(p,p.details!.endBearing!).ribs).toEqual([wb.ribSpacing/2,bs.length/2-wb.ribSpacing/2,bs.length/2+wb.ribSpacing/2]);
  const checks=Object.fromEntries(endBearingChecks(p,p.details!.endBearing!,{analysis:capped.designAnalysis!,lateral:capped.detailResults!.demands.brace}).map(c=>[c.id,c]));
  expect(checks['end-bearing-locating-slip'].title).toBe('Locating support (grid 2) · slip-critical bolts');
  const ss=p.details!.simpleSupport!,travel=checks['end-bearing-travel'];
  expect(travel.demand).toBeCloseTo(12e-6*50*foot*Math.max(ss.temperatureRise,ss.temperatureFall)+p.section.d*capped.designAnalysis!.endRotation+ss.settingTolerance,6);
  expect(travel.capacity).toBeCloseTo(ss.guideTravel,9);expect(travel.status).toBe('pass');
  expect(checks['end-bearing-seat-fit'].demand).toBeCloseTo(bs.length,9);
 });
 it('sections a headed sliding bolt with its grip, keyed on the bearing plan',()=>{
  const bolt=slidingBoltView(capped)!.render().svg,t=texts(bolt).join(' | ');
  // An F3125 bolt is headed: head on the plate washer, nut and F436 washer below the seat as the turned element.
  expect(t).toContain('3/4" HEAVY HEX BOLT, ASTM F3125 GR A325,');expect(t).toContain('HEAD ON PL WASHER');
  expect(t).toContain('HEAVY HEX NUT, A563 DH, AND F436');expect(t).not.toContain('EACH END OF BOLT');
  // Grip: 5/16 plate washer + 15/16 sleeve + 1 in bearing plate + 2 in seat; the length adds 1 in and one F436 washer, to the next 1/4 in.
  expect(t).toContain('LENGTH 5 1/2", GRIP 4 1/4"');
  // The 1/16 in clearance under the plate washer is a leader note, not a stretched dimension.
  const notes=[...bolt.matchAll(/<g data-multileader="component"[^>]*>(.*?)<\/g>/gs)].map(m=>texts(m[1]).join(' '));
  expect(notes).toContain('1/16" CLR.');
  // On a seat by others the grip is stated without the seat.
  const others=structuredClone(capped.input);others.details!.bracket!.enabled=false;
  expect(texts(slidingBoltView({...capped,input:others})!.render().svg).join(' ')).toContain('LENGTH TO SUIT SEAT, GRIP = 2 1/4" + SEAT');
  // SI sheets carry no imperial units.
  const si=texts(slidingBoltView({...capped,input:{...capped.input,units:'SI'}})!.render().svg).join(' ');
  expect(si).toContain('FY 345 MPa');expect(si).not.toMatch(/KSI|"/);
  // Keyed on the plan of 2/S-02: a cut along the far-side bolt line, beyond the sliding girder's break, looking outboard (up on the plan).
  const cut=endBearingView(capped).svg.match(/<g data-section-cut="SLIDING BEARING BOLT \/ SECTION">(.*?)<\/g>/s)?.[1];
  expect(cut).toBeDefined();const [stub,arrow]=lines(cut!);
  expect(stub[1]).toBeCloseTo(stub[3],6);expect(stub[2]).toBeLessThan(stub[0]);expect(arrow[0]).toBeCloseTo(arrow[2],6);expect(arrow[3]).toBeLessThan(arrow[1]);
 });
 it('draws the continuous sliding support at its runway end, in grid order, and states the other sliding grids',()=>{
  const p=structuredClone(capped.input);p.system='continuous';p.details!.brace.flangeAttachment!.enabled=false;
  const svg=endBearingView({...capped,input:p}).svg,t=texts(svg).join(' ');
  // Sliding at grids 1, 3 and 4: grid 1 is drawn as the runway end it is, beside the locating grid 2.
  expect(t).toContain('SLIDING END, GRID 1');expect(t).toContain('LOCATING, GRID 2');
  const bubbles=[...svg.matchAll(/<circle class="bubble" cx="([^"]+)"[^>]*\/><text[^>]*>(\d+)<\/text>/g)].map(m=>({x:+m[1],grid:m[2]}));
  expect(bubbles.map(v=>v.grid)).toEqual(['1','2']);expect(bubbles[0].x).toBeLessThan(bubbles[1].x);
  // The girder ends at grid 1 (an object line on the grid) and runs through grid 2 (no object line across it there).
  const ends=lines(svg.replace(/<line class="(?!runway-line)[^"]*"[^>]*>/g,'')).filter(l=>Math.abs(l[0]-l[2])<1e-6&&Math.abs(l[1]-l[3])>5);
  expect(ends.some(l=>Math.abs(l[0]-bubbles[0].x)<1e-6)).toBe(true);expect(ends.some(l=>Math.abs(l[0]-bubbles[1].x)<1e-6)).toBe(false);
  expect(t).toContain('SLIDING AT GRIDS 1, 3 AND 4; LOCATING AT GRID 2.');
  expect(t).toContain('THE GIRDER ENDS AT THE GRID AND THE BEARING PL STARTS AT THE GIRDER END, AS SHOWN AT GRID 1, OPPOSITE HAND AT GRID 4.');
  expect(t).toContain('AT GRID 3 THE BEARING PL IS CENTERED ON THE GRID AS AT GRID 2, WITH THE SLIDING BOLTS AS AT GRID 1.');
  expect(svg).toContain(`data-section-cut="${detailTitles.slidingBolt}"`);
  // Two spans: both sliding supports are runway ends.
  p.spans=[25*foot,25*foot];const two=texts(endBearingView({...capped,input:p}).svg).join(' ');
  expect(two).toContain('SLIDING END, GRID 1');expect(two).toContain('SLIDING AT GRIDS 1 AND 3; LOCATING AT GRID 2.');expect(two).not.toContain('CENTERED ON THE GRID');
 });
 it('draws locating and sliding bearings and references them from the support details and the report',()=>{
  const set=drawingSheetSet(capped),s02=set.find(v=>v.svg.includes('data-view="end-bearing"'))!,s04=set.find(v=>v.svg.includes('data-topic="support"'))!;
  expect(s02.svg).toContain('data-view="end-bearing"');expect(s02.svg).not.toContain('data-view="end-connection"');
  const t=texts(s02.svg).join(' ');expect(t).toContain('PRETENSIONED AGAINST STEEL SLEEVES 1 7/16" OD');expect(t).toContain('2 1/2" SLOT IN FLANGE FOR 1/2" EA. WAY');expect(t).toContain('LOCATING: 4 - 3/4" A325 SC,');
  expect(texts(s04.svg).join(' ')).toContain(`UPLIFT (${detailReferences(set).get('GIRDER END BEARINGS / LOCATING AND SLIDING')})`);
  for(const sheet of set)expect(sheet.svg).not.toMatch(/NOT IN SET|\{\{/);
  // The sliding bolt section is keyed on the bearing plan by its own detail number.
  const cut=s02.svg.match(/<g data-section-cut="SLIDING BEARING BOLT \/ SECTION">(.*?)<\/g>/s)?.[1];
  expect(cut).toBeDefined();expect(cut).toContain(detailReferences(set).get(detailTitles.slidingBolt));
  expect(texts(set[0].svg).join(' ')).not.toContain('COLUMN-SIDE LOCATING AND GUIDED HOLD-DOWN');
  const sk=detailedDrawings(capped).find(v=>v.name==='end-connection-detail')!;expect(sk.title).toContain('Bolted end bearing');
  expect(compactReport(capped,'')).toContain('04B / Bolted end bearings');
 },240000);
});
