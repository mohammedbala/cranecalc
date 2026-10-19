import {describe,expect,it} from 'vitest';
import {runwayTemplates} from '../src/engine/templates';
import {buildProject,normalizeConfig} from '../src/engine/configurator';
import {defaultRunwayConfig,type RunwayConfig} from '../src/engine/configInputs';
import {validateProject} from '../src/engine/calculate';

/**
 * The configurator never produces an invalid project: every template and the cap tieback angle configurations of the
 * simulation set (cases-final 013 to 070) build to a project that validateProject accepts (build only, no calculation).
 */
const cfg=(number:string,c:Partial<RunwayConfig>):RunwayConfig=>({...defaultRunwayConfig,title:`SIM-${number}`,number:`SIM-${number}`,units:'US',method:'LRFD',scope:'design',cranes:1,system:'simple',girder:'capped',structure:'existing',...c});
const simulated:Record<string,RunwayConfig>={
 '013':cfg('013',{capacity:15,craneSpan:66,control:'pendant',cmaa:'C',buildingClass:'D',bays:6,span:35,railElevation:29,support:'by-others',tie:'cap-angle',reach:30}),
 '016':cfg('016',{method:'ASD',capacity:12.5,craneSpan:46,control:'cab',cmaa:'B',buildingClass:'C',bays:5,span:20,railElevation:27,support:'twin-rib',tie:'cap-angle'}),
 '017':cfg('017',{capacity:3,craneSpan:69,control:'pendant',cmaa:'C',buildingClass:'C',bays:2,span:18,railElevation:15,support:'twin-rib',tie:'cap-angle'}),
 '018':cfg('018',{capacity:12.5,craneSpan:53,control:'cab',cmaa:'C',cranes:2,buildingClass:'C',bays:4,span:35,railElevation:23,support:'twin-rib',tie:'paired-bars'}),
 '021':cfg('021',{capacity:3,craneSpan:57,control:'cab',cmaa:'C',buildingClass:'C',bays:3,span:40,railElevation:19,support:'twin-rib',tie:'paired-bars'}),
 '022':cfg('022',{method:'ASD',capacity:1,craneSpan:60,control:'pendant',cmaa:'D',buildingClass:'B',bays:1,span:40,railElevation:35,support:'twin-rib',tie:'paired-bars',reach:16}),
 '024':cfg('024',{capacity:2,craneSpan:56,control:'pendant',cmaa:'B',buildingClass:'B',bays:2,span:18,railElevation:31,support:'twin-rib',tie:'cap-angle'}),
 '030':cfg('030',{units:'SI',capacity:5,craneSpan:38,control:'pendant',cmaa:'C',buildingClass:'B',bays:5,span:22.5,railElevation:17,support:'twin-rib',tie:'cap-angle'}),
 // Cap angles on W14X211 columns: the largest sizing step's end plates overhang the column flange at a shared column.
 '034':cfg('034',{capacity:35,craneSpan:85,control:'cab',cmaa:'D',buildingClass:'C',bays:3,span:35,railElevation:24,support:'haunched-seat',tie:'cap-angle'}),
 '061':cfg('061',{capacity:35,craneSpan:91,control:'cab',cmaa:'D',buildingClass:'B',bays:5,span:35,railElevation:29,support:'tapered-haunch',tie:'paired-bars'}),
 '070':cfg('070',{capacity:1,craneSpan:59,control:'pendant',cmaa:'C',buildingClass:'C',bays:3,span:40,railElevation:29,structure:'new',support:'twin-rib',tie:'paired-bars'}),
 // Crane columns and stepped columns beyond the templates: continuous girders, a capped girder with cap angles, a fixed
 // crane-column base with a configured reach, and configured shafts.
 'CC1':cfg('CC1',{capacity:15,craneSpan:60,control:'cab',cmaa:'C',buildingClass:'C',bays:4,span:25,railElevation:24,girder:'rolled',system:'continuous',support:'crane-column',tie:'paired-bars'}),
 'CC2':cfg('CC2',{capacity:10,craneSpan:60,control:'cab',cmaa:'C',buildingClass:'C',bays:3,span:25,railElevation:22,support:'crane-column',tie:'cap-angle'}),
 'CC3':cfg('CC3',{capacity:20,craneSpan:70,control:'cab',cmaa:'C',buildingClass:'C',bays:3,span:30,railElevation:28,girder:'rolled',support:'crane-column',tie:'paired-bars',craneColumnBase:'fixed',reach:28}),
 'ST1':cfg('ST1',{capacity:15,craneSpan:60,control:'cab',cmaa:'C',buildingClass:'C',bays:4,span:25,railElevation:26,girder:'rolled',system:'continuous',support:'stepped-column',tie:'paired-bars'}),
 'ST2':cfg('ST2',{capacity:20,craneSpan:70,control:'cab',cmaa:'D',buildingClass:'B',bays:3,span:30,railElevation:30,girder:'rolled',support:'stepped-column',tie:'paired-bars',columnShape:'W40X199',buildingColumnShape:'W14X145'}),
 // Simulation set cases-v2. V059: a 40 t crane on 50 ft bays sizes a W14X873 girder whose 5.5 in flange keeps the rail
 // clips off the tie saddle past half the 24 in pad spacing at the joints, and whose 15 in bearings put the cap stiffeners
 // past a W14X145 crane column's flange tips (fitClipJoints, withoutRailPad, the wider crane column). V061: the clip
 // joint again, with bolted clamp plates (the tie moves onto the bearing stiffener). V067: paired bars at the step of a
 // continuous girder with no room between 5/8 in bolt groups (sizeFlangeTie from the 1/2 in bolt, the closest deeper
 // lower shaft). V082: new freestanding columns with the top of rail over 35 ft (normalizeConfig lowers it).
 'V059':cfg('V059',{capacity:40,craneSpan:69,control:'cab',cmaa:'C',buildingClass:'C',bays:2,span:50,railElevation:34,girder:'rolled',support:'crane-column',tie:'paired-bars',craneColumnBase:'pinned',buildingColumnShape:'W14X82'}),
 'V061':cfg('V061',{capacity:40,craneSpan:68,control:'cab',cmaa:'D',cranes:2,buildingClass:'B',bays:4,span:45,railElevation:28,girder:'rolled',support:'stepped-column',tie:'flexible-plate'}),
 'V067':cfg('V067',{capacity:15,craneSpan:45,control:'cab',cmaa:'D',buildingClass:'C',system:'continuous',bays:4,span:22.5,railElevation:27,girder:'rolled',support:'stepped-column',tie:'paired-bars'}),
 'V082':cfg('V082',{capacity:2,craneSpan:33,control:'cab',cmaa:'B',buildingClass:'C',bays:4,span:15,railElevation:36,structure:'new',support:'haunched-seat',tie:'cap-angle',reach:18}),
};

describe('configurator project validity',()=>{
 // t13 to t16: the crane columns tied to the building columns and the stepped columns (girder on the step).
 for(const t of runwayTemplates)it(`template ${t.id} builds a valid project`,()=>{expect(validateProject(buildProject(t.config))).toEqual([]);},300000);
 // Beyond the catalog the build stops with the configurator's reasons only (beyondCatalog): V059 and V061 need a plate
 // girder (they took the W14X873 column shape before).
 // 034, 061 and CC2 ask for a cap tieback angle that no set of its sizing steps carries (lap slip several times over,
 // or the imposed movement in the plate): the build stops (capAngleUnresolved; the calculation of CC2 gave plate
 // movement 1.96 and end plate weld 1.44 against estimates of 2.56 and 1.87).
 const stops=new Map<string,RegExp>([['V059',/^configurator: Plate girder required/],['V061',/^configurator: Plate girder required/],
  ['034',/^configurator: Top-flange tie not resolved: the cap tieback angle/],['061',/^configurator: Top-flange tie not resolved: the cap tieback angle/],['CC2',/^configurator: Top-flange tie not resolved: the cap tieback angle/]]);
 for(const [id,c] of Object.entries(simulated))it(`simulated configuration ${id} ${stops.has(id)?'stops with the configurator reason':'builds a valid project'}`,()=>{
  const e=validateProject(buildProject(c));
  if(stops.has(id)){expect(e.some(v=>stops.get(id)!.test(v))).toBe(true);expect(e.every(v=>v.startsWith('configurator: '))).toBe(true);}
  else expect(e).toEqual([]);
 },300000);
 it('new freestanding columns take the top of rail to at most 35 ft (ASCE 7 cantilever column height limit), with the reason',()=>{
  const n=normalizeConfig(simulated['V082']);
  expect(n.config.railElevation).toBe(35);
  expect(n.changes.join(' ')).toMatch(/cantilever column system \(ASCE 7 Table 12\.2-1.*lowered from 36 ft to 35 ft/);
  expect(normalizeConfig({...simulated['V082'],structure:'existing'}).config.railElevation).toBe(36);
 });
 it('rail clips that cannot cross the girder joints within the pad spacing: the rail without its pad, clips at most 30 in, logged',()=>{
  // The W14X873 the sizing chose before column shapes left the girder catalog, now named (V059 itself stops: a plate
  // girder is required).
  const p=buildProject({...simulated['V059'],girderShape:'W14X873'});
  expect(p.aist!.railPad).toBe(false);
  expect(p.aist!.clipSpacing).toBeCloseTo(30*25.4,6);
  expect(p.configurator!.selections!.find(s=>s.item==='Rail pad')?.reason).toMatch(/AIST TR-13/);
 },300000);
 it('a cap tieback angle that fits no column flange falls back to paired bars, with the reason in the selections log',()=>{
  const p=buildProject({...simulated['017'],columnShape:'W14X61'});
  // The paired bars it falls back to do not pass their own sizing on this column either: the build stops with the reason.
  expect(validateProject(p)).toEqual([expect.stringMatching(/^configurator: Top-flange tie not resolved: the Paired flat bars on a flange saddle/)]);
  expect(p.details!.brace.arrangement).toBe('paired-bars');
  const tie=p.configurator!.selections!.find(s=>s.item==='Top-flange tie')!;
  expect(tie.entered).toBe('Cap tieback angle');
  expect(tie.reason).toMatch(/No cap tieback angle of the sizing steps fits .*end plates must fit on the column flange/);
 });
});
