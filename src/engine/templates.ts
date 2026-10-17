/**
 * Configuration templates: a dozen common crane runway arrangements, each a set of configurator choices
 * (RunwayConfig). Loading a template builds the complete example project with buildProject; every choice stays
 * editable in the configurator, which rebuilds the project from the edited choices.
 */
import {defaultRunwayConfig,type RunwayConfig} from './configInputs';
import {buildProject} from './configurator';
import type {ProjectInput} from './types';

export interface RunwayTemplate {
 id:string;
 name:string;
 /** One line for the gallery card. */
 summary:string;
 /** What the package contains and when to use it. */
 description:string;
 tags:string[];
 config:RunwayConfig;
}
const t=(id:string,name:string,summary:string,description:string,tags:string[],config:Partial<RunwayConfig>):RunwayTemplate=>
 ({id,name,summary,description,tags,config:{...defaultRunwayConfig,template:id,title:name,number:`TPL-${id.toUpperCase()}`,...config}});

export const runwayTemplates:RunwayTemplate[]=[
 t('t01','Existing building · welded twin-rib seats','10-ton cab crane, rolled girders on new seats welded to existing W14 columns',
  'A new runway added to an existing building: three 25-ft rolled girders on welded twin-rib bracket seats with continuity plates in the existing columns, paired flat-bar top-flange ties, bolted end bearings and girder end stops. The existing columns are checked with their existing load effects; the existing sidewall bracing takes the crane longitudinal forces.',
  ['Existing building','Rolled girder','Twin-rib seat','Paired bars'],{capacity:10,craneSpan:60,control:'cab',bays:3,span:25,support:'twin-rib',tie:'paired-bars'}),
 t('t02','Existing building · tapered I haunch, capped girder','5-ton pendant crane, W + channel girders on built-up haunches, cap tieback angles',
  'Retrofit runway in an existing 5-bay building: capped girders on built-up tapered I haunches field welded to the existing columns (column stiffeners where the flange needs them), cap tieback angles bolted to the channel cap, end bearings and stops. The haunch is sized for the reactions.',
  ['Existing building','Capped girder','Tapered haunch','Cap angle'],{capacity:5,craneSpan:50,control:'pendant',bays:5,span:25,girder:'capped',support:'tapered-haunch',tie:'cap-angle',railElevation:18}),
 t('t03','Existing building · rolled W-stub brackets','7.5-ton pendant crane, W-stub brackets with CJP flanges, flexible plate ties',
  'Four 20-ft rolled girders on new rolled W-stub brackets (CJP flanges, bearing stiffeners and seat plate) welded to the existing columns, with flexible plate top-flange ties that follow the girder end rotation and thermal travel.',
  ['Existing building','Rolled girder','W-stub bracket','Flexible plate'],{capacity:7.5,craneSpan:50,control:'pendant',bays:4,span:20,support:'rolled-corbel',tie:'flexible-plate'}),
 t('t04','Existing building · haunched seats, capped girder','3-ton pendant crane, capped girders on tapered-rib seats, paired bars',
  'A light capped runway on welded haunched rib seats (ribs tapered to the tip) on the existing columns, paired flat-bar ties to the column face, end bearings and end stops.',
  ['Existing building','Capped girder','Haunched seat','Paired bars'],{capacity:3,craneSpan:40,control:'pendant',bays:3,span:20,girder:'capped',support:'haunched-seat',tie:'paired-bars',railElevation:16}),
 t('t05','Existing brackets by others · girders only','12.5-ton cab crane, rolled girders on existing brackets, ties to the column face',
  'A girder package for an existing runway line whose column brackets, frames and foundations are evaluated by others: four 25-ft rolled girders, rail and clips, top-flange ties to the column face, end bearings and end stops.',
  ['Existing building','Rolled girder','Bracket by others','Paired bars'],{capacity:12.5,craneSpan:70,control:'cab',bays:4,span:25,support:'by-others',tie:'paired-bars',railElevation:24}),
 t('t06','New freestanding columns · welded brackets','10-ton cab crane on new cantilever columns, base plates, footings and rod bracing',
  'A self-supporting runway: new W14 cantilever columns on spread footings with welded twin-rib brackets, top-flange ties, base plates and anchor rods, and crane-level rod X-bracing designed between two columns. The existing building carries no crane load.',
  ['New columns','Rolled girder','Twin-rib seat','Foundations'],{capacity:10,craneSpan:60,control:'cab',bays:3,span:25,structure:'new',support:'twin-rib',tie:'paired-bars'}),
 t('t07','New freestanding columns · column caps','5-ton pendant crane, girders on column caps, base plates and footings',
  'New cantilever columns that stop at the girder: each girder end bears on a column cap plate with stiffeners under the girder bearings (a fork support, no flange tie), end bearings, base plates, footings and crane-level rod bracing.',
  ['New columns','Rolled girder','Column cap','Foundations'],{capacity:5,craneSpan:50,control:'pendant',bays:3,span:20,structure:'new',support:'column-cap',tie:'paired-bars',railElevation:18}),
 t('t08','Continuous girder · existing building','10-ton cab crane on a continuous four-span girder',
  'One continuous rolled girder over four 25-ft spans on welded twin-rib seats, tied at the bearing stiffeners, with the end bearing locating near mid-length and the girder sliding at the other supports.',
  ['Existing building','Continuous girder','Twin-rib seat','Paired bars'],{capacity:10,craneSpan:70,control:'cab',bays:4,span:25,system:'continuous',support:'twin-rib',tie:'paired-bars',railElevation:26}),
 t('t09','Two cranes on one runway','Two 5-ton cab cranes, five 25-ft bays, existing building',
  'Two identical cranes sharing the runway, placed at their closest approach and at the maximum-moment positions in the moving-load search; rolled girders on welded twin-rib seats on the existing columns.',
  ['Existing building','Two cranes','Twin-rib seat','Paired bars'],{capacity:5,craneSpan:60,control:'cab',cranes:2,bays:5,span:25,support:'twin-rib',tie:'paired-bars'}),
 t('t10','Heavy duty · CMAA D, Class B','10-ton cab crane, frequent service, built-up haunches on existing W14 columns',
  'A heavy-service runway (CMAA Class D crane, AIST Class B building, L/1000 vertical deflection): rolled girders on built-up tapered I haunches with column stiffeners, paired-bar ties, end bearings and stops; fatigue governs many details.',
  ['Existing building','Heavy duty','Tapered haunch','Fatigue'],{capacity:10,craneSpan:70,control:'cab',cmaa:'D',buildingClass:'B',bays:4,span:30,support:'tapered-haunch',tie:'paired-bars',railElevation:28}),
 t('t11','Light 2-ton pendant · capped, flexible plates','2-ton pendant crane, short capped runway with flexible plate ties',
  'A short light runway for a maintenance crane: two 20-ft capped girders on welded twin-rib seats on the existing columns, flexible plate ties, end bearings and end stops.',
  ['Existing building','Light duty','Capped girder','Flexible plate'],{capacity:2,craneSpan:40,control:'pendant',bays:2,span:20,girder:'capped',support:'twin-rib',tie:'flexible-plate',buildingClass:'D',railElevation:16}),
 t('t12','Girder analysis only · supplied loads','Quick check: 10-ton crane on three 25-ft bays, girder only',
  'The girder alone under the supplied crane loads: moving-load envelopes, strength, deflection and fatigue of the girder without connections, supports or drawings. Use it to size a girder before starting the detailed design.',
  ['Analysis only','Rolled girder','Quick check'],{capacity:10,craneSpan:60,control:'cab',bays:3,span:25,scope:'analysis'}),
];

export const templateById=(id:string)=>runwayTemplates.find(v=>v.id===id);
/** The template's complete example project. */
export function templateProject(id:string):ProjectInput{
 const tpl=templateById(id);if(!tpl)throw Error(`Unknown template ${id}`);
 return buildProject(tpl.config);
}
