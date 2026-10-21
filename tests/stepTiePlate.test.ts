import {beforeAll,describe,expect,it} from 'vitest';
import {buildProject} from '../src/engine/configurator';
import {defaultRunwayConfig,type RunwayConfig} from '../src/engine/configInputs';
import {calculate,validateProject} from '../src/engine/calculate';
import {stepPlateGeometry} from '../src/engine/stepTiePlate';
import {stepGeometry} from '../src/engine/steppedColumn';
import {tieLine} from '../src/engine/tieGeometry';
import {classifyCheck} from '../src/engine/checkTaxonomy';
import {detailTopics} from '../src/components/planSheet';
import {steppedColumnTitles} from '../src/components/steppedColumnSheet';
import type {CalculationSnapshot} from '../src/engine/types';

/**
 * Round 7: the step tie. At a column step the upper shaft fixes the column face 10 to 18 in from the girder web; bars or a
 * vertical plate that short cannot follow the girder end's movement along the runway, so the configurator lays a
 * horizontal slotted tie plate there (stepTiePlate.ts): the friction stays in the plates' plane and the small vertical
 * movement bends the plate over the whole span to the column face.
 */
// Sample case 066: 35-ton cab crane, 3 × 20 ft simple spans, W14X211 upper shafts 17.6 in from the girder web.
const cfg:RunwayConfig={...defaultRunwayConfig,title:'Step tie',number:'SIM-066',units:'SI',method:'LRFD',scope:'design',capacity:35,craneSpan:68,control:'cab',cmaa:'D',cranes:1,buildingClass:'C',
 system:'simple',bays:3,span:20,railElevation:27,girder:'rolled',structure:'existing',support:'stepped-column',tie:'paired-bars'};

describe('step tie plate (sample case 066)',()=>{
 let s:CalculationSnapshot;
 const p=buildProject(cfg);
 beforeAll(()=>{s=calculate(p);},600000);
 it('is the configurator\'s tie at the step, with the reason logged, and lays out within the step',()=>{
  expect(validateProject(p)).toEqual([]);
  expect(p.details!.brace.arrangement).toBe('step-plate');
  expect(p.configurator!.selections!.some(v=>/horizontal slotted tie plate takes the tie instead/.test(v.reason))).toBe(true);
  const g=stepPlateGeometry(p)!,st=stepGeometry(p)!;
  expect(g.face).toBeCloseTo(st.tieDistance,6);
  // Bolts beyond the flange tip, on the shelf, short of the column face; the tie line at the plate's mid-thickness.
  for(const y of g.rows){expect(y).toBeGreaterThan(g.tip);expect(y).toBeLessThan(g.face);expect(y).toBeGreaterThan(g.shelfStart);}
  for(const v of g.stations)for(const x of v.bolts)expect(Math.abs(x-v.station)+g.slotLength/2).toBeLessThan(g.shelfWidth/2);
  expect(tieLine(p,'top')).toBeCloseTo(p.section.d-p.section.tf-g.t.plate.thickness/2,6);
 },300000);
 it('passes its checks, and the bar-tie movement checks no longer apply',()=>{
  const own=s.checks.filter(v=>v.group==='Step tie plate');
  expect(own.map(v=>v.id).sort()).toEqual(['step-plate-bolts','step-plate-column','step-plate-fatigue','step-plate-fit','step-plate-shelf','step-plate-strength','step-plate-travel','step-plate-weld','step-plate-weld-fatigue']);
  for(const v of own){expect(v.status,v.id).toBe('pass');expect(classifyCheck(v).rule,v.id).not.toBe('default');}
  expect(s.checks.some(v=>/^tie-move-/.test(v.id))).toBe(false);
  expect(s.checks.find(v=>v.id==='brace-member')?.status).toBe('pass');
  // The flange at the plate ends is in the fatigue register.
  expect(s.checks.some(v=>/^detail-full-cycle-TP\d/.test(v.id))).toBe(true);
 });
 it('draws the plate on the stepped-column sheet, not as bars on the connection sheet',()=>{
  const topics=detailTopics(s),titles=topics.flatMap(t=>t.views.map(v=>v.title));
  expect(titles).toContain(steppedColumnTitles.tiePlate);
  expect(topics.find(t=>t.key==='stepped-column')!.views.find(v=>v.title===steppedColumnTitles.tiePlate)!.render().svg).toContain('data-view="step-tie-plate"');
 });
});
