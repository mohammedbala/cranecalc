import {describe,expect,it} from 'vitest';
import {calculate,validateProject} from '../src/engine/calculate';
import {demonstrationProject,cappedDemonstrationProject} from '../src/engine/demonstration';
import {endStopChecks,endStopGeometry,stopBumperForce,wrenchClearance} from '../src/engine/endStop';
import {railKeeperStations} from '../src/engine/simpleSupports';
import {boltCapacity} from '../src/engine/connectionStrength';
import {drawingSheetSet,detailReferences} from '../src/components/planSheet';
import {sheetsDxf} from '../src/components/sheetDxf';

const inch=25.4,kip=4448.2216152605;
const texts=(svg:string)=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&'));
const demo=calculate(demonstrationProject());

describe('girder-mounted runway end stops',()=>{
 it('resolves the bumper overturning into front-bolt tension by hand',()=>{
  const p=demo.input,e=p.details!.endStop!,g=endStopGeometry(p,e),checks=Object.fromEntries(demo.checks.filter(c=>c.group==='End stops').map(c=>[c.id,c]));
  expect(stopBumperForce(p)).toBeCloseTo(20*kip,3);
  // LRFD stop combination factor 1.0; contact 6 in rail + 6 in bumper - 1 in base plate.
  expect(g.contact).toBeCloseTo(11*inch,9);
  const lever=g.frontRow-g.back-e.base.thickness,T=20*kip*(g.contact+e.base.thickness)/(2*lever);
  expect(lever).toBeCloseTo((12.5-.5625-1-1.25-.5-1)*inch,9);
  expect(checks['end-stop-bolt-tension'].demand).toBeCloseTo(T,3);
  expect(checks['end-stop-bolt-shear'].demand).toBeCloseTo(5*kip,3);
  const bolt=boltCapacity({grade:'A325',diameter:.75*inch,planes:1,surface:'B',shear:5*kip,tension:T,method:'LRFD'});
  expect(checks['end-stop-bolt-tension'].capacity).toBeCloseTo(bolt.tension,3);
  expect(checks['end-stop-slip'].capacity).toBeCloseTo(bolt.slip,3);
  // Face plate between stiffeners: P s / 4 on a 6 in strip, 1 in thick.
  expect(checks['end-stop-face'].demand).toBeCloseTo(20*kip*3*inch/4/(6*inch*inch**2/6),4);
  expect(Object.values(checks).every(c=>c.status==='pass')).toBe(true);
  expect(demo.eligible).toBe(true);
 },240000);
 it('adds the bumper couple to the girder stop combinations',()=>{
  const g=demo.checks.find(c=>c.id==='end-stop-girder')!,lrfd8=demo.designAnalysis!.combinations.find(c=>c.id==='LRFD 8')!;
  expect(g.status).toBe('pass');expect(g.utilization).toBeGreaterThan(lrfd8.interaction);
  expect(lrfd8.axial).toBeCloseTo(20*kip,3);
 });
 it('flags bolts that clash with the bearing stiffeners or the face plate',()=>{
  const p=structuredClone(demo.input),e=p.details!.endStop!;
  // Back bolts moved over the bearing stiffener.
  e.setback=5*inch;
  const checks=endStopChecks(p),bearing=checks.find(c=>c.id==='end-stop-wrench-bearing')!;
  expect(bearing.status).toBe('fail');e.setback=7*inch;
  e.bolts.frontClear=.75*inch;expect(endStopChecks(p).find(c=>c.id==='end-stop-wrench-face')!.status).toBe('fail');
  expect(wrenchClearance(.75*inch)).toBeCloseTo(1.25*inch,9);expect(wrenchClearance(1*inch)).toBeCloseTo(1.6*inch,9);
  // A stop over the runway-end tie saddle puts its back nuts on the saddle.
  e.bolts.frontClear=1.25*inch;e.setback=.5*inch;expect(endStopChecks(p).find(c=>c.id==='end-stop-wrench-saddle')!.status).toBe('fail');
  expect(endStopChecks(p).some(c=>c.id==='end-stop-zone')).toBe(false);
 });
 it('requires a stop design whenever a stop force reaches the girder',()=>{
  const p=demonstrationProject();p.details!.endStop!.enabled=false;
  expect(validateProject(p).join(' ')).toContain('design the girder-mounted runway end stops');
  p.details!.endStop!.enabled=true;p.details!.endStop!.source='';
  expect(validateProject(p)).toEqual([]);expect(endStopChecks(p).find(c=>c.id==='end-stop-source')?.status).toBe('incomplete');
  const bypass=demonstrationProject();bypass.cranes[0].design!.bumperBypassesGirder=true;
  expect(validateProject(bypass)).toEqual([]);
  expect(endStopChecks(bypass).map(c=>c.status)).toEqual(['not-applicable']);
 });
 it('starts the rail keepers beyond the stops at both runway ends',()=>{
  const p=demo.input,g=endStopGeometry(p,p.details!.endStop!),stations=railKeeperStations(p),L=p.spans.reduce((a,b)=>a+b,0),half=p.details!.rail.clipWidth/2;
  expect(Math.min(...stations)).toBeCloseTo(g.railEnd+half,6);expect(Math.max(...stations)).toBeCloseTo(L-g.railEnd-half,6);
  const off=structuredClone(p);off.cranes[0].design!.bumperBypassesGirder=true;expect(Math.min(...railKeeperStations(off))).toBeCloseTo(half,6);
 });
 it('draws the end stop details and references them from S-01, the cover and the cap details',()=>{
  const set=drawingSheetSet(demo),s07=set.find(v=>v.svg.includes('data-view="end-stop-elevation"'))!;
  // Cover, general arrangement and one sheet of twelve details.
  expect(set.map(v=>v.number)).toEqual(['S-00','S-01','S-02']);
  expect(s07.svg.match(/data-view-title="below"/g)).toHaveLength(12);
  expect(s07.svg).not.toMatch(/\{\{|NOT IN SET|NaN|undefined|data-overflow/);
  for(const view of ['end-stop-elevation','end-stop-plan','end-stop-section','end-stop-notes'])expect(s07.svg).toContain(`data-view="${view}"`);
  const t=texts(s07.svg).join(' | ');
  expect(t).toContain('4 - 3/4" A325 PRETENSIONED (SC)');expect(t).toContain('PL 1" X 9" X 1\'-3" FACE');expect(t).toContain('20 KIP');
  const s01=texts(set[1].svg).join(' ');expect(s01).toContain(`SEE ${detailReferences(set).get('END STOP / ELEVATION')}`);expect(set[1].svg).toContain('data-end-stop="plan"');
  const cover=texts(set[0].svg).join(' ');expect(cover).toContain('RUNWAY END STOPS');expect(cover).not.toContain('RUNWAY END STOPS AT EACH END OF EACH RUNWAY FOR THE BUMPER FORCE');
  expect(s07.svg).toContain('class="hidden-line"');expect(sheetsDxf([s07],'US')).toContain('S-STEEL-HIDDEN');
 },240000);
 it('permits only the end stop holes in a capped girder, as fatigue points',()=>{
  const s=calculate(cappedDemonstrationProject());
  expect(s.checks.filter(c=>c.group==='End stops').every(c=>c.status==='pass')).toBe(true);
  const plan=detailReferences(drawingSheetSet(s)).get('END STOP / PLAN')!;
  expect(texts(drawingSheetSet(s).find(v=>v.svg.includes('data-view="cap-section"'))!.svg).join(' ')).toContain(`EXCEPT THE END STOP BOLT HOLES (${plan})`);
  expect(s.checks.filter(c=>c.id.startsWith('detail-full-cycle-SH')).every(c=>c.status==='pass')).toBe(true);
 },240000);
});
