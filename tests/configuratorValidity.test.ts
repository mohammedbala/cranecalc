import {describe,expect,it} from 'vitest';
import {runwayTemplates} from '../src/engine/templates';
import {buildProject} from '../src/engine/configurator';
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
};

describe('configurator project validity',()=>{
 // t13 to t16: the crane columns tied to the building columns and the stepped columns (girder on the step).
 for(const t of runwayTemplates)it(`template ${t.id} builds a valid project`,()=>{expect(validateProject(buildProject(t.config))).toEqual([]);},300000);
 for(const [id,c] of Object.entries(simulated))it(`simulated configuration ${id} builds a valid project`,()=>{expect(validateProject(buildProject(c))).toEqual([]);},300000);
 it('a cap tieback angle that fits no column flange falls back to paired bars, with the reason in the selections log',()=>{
  const p=buildProject({...simulated['017'],columnShape:'W14X61'});
  expect(validateProject(p)).toEqual([]);
  expect(p.details!.brace.arrangement).toBe('paired-bars');
  const tie=p.configurator!.selections!.find(s=>s.item==='Top-flange tie')!;
  expect(tie.entered).toBe('Cap tieback angle');
  expect(tie.reason).toMatch(/No cap tieback angle of the sizing steps fits .*end plates must fit on the column flange/);
 });
});
