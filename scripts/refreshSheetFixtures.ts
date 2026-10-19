/**
 * Rebuild the drawing readability fixtures (tests/fixtures/sheets, tests/sheetReadability.test.ts): calculate() each
 * fixture's project again (a template tNN from its current definition, templateProject; a configured project named in
 * configFixtures from its configurator choices, buildProject; a generated project sNNN from the input stored in it) and store the snapshot gzipped without the results the drawings do not read, after checking
 * that leaving them out changes neither the drawing set nor any detail view.
 * usage: npx tsx scripts/refreshSheetFixtures.ts [name ...]   (every stored fixture when no name is given)
 */
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {calculate,validateProject} from '../src/engine/calculate';
import {templateProject} from '../src/engine/templates';
import {buildProject} from '../src/engine/configurator';
import {defaultRunwayConfig,type RunwayConfig} from '../src/engine/configInputs';
import {drawingSheetSet,detailTopics} from '../src/components/planSheet';
import type {CalculationSnapshot,ProjectInput} from '../src/engine/types';

/**
 * Configurator choices of fixtures that are not templates: cNNN the simulated sample cases NNN whose sheets had
 * overlapping annotation in the final run, each built from its configuration as the simulation builds it (buildProject).
 */
const configFixtures:Record<string,RunwayConfig>={
 // Sample case 047 (general arrangement plan: bracing callout and section cut tag on the grid bubbles).
 c047:{"title":"40 t cab · existing building · crane-column · flexible-plate · 5×45 ft simple","number":"SIM-047","units":"US","method":"LRFD","scope":"design","capacity":40,"craneSpan":71,"control":"cab","cmaa":"D","cranes":1,"buildingClass":"B","system":"simple","bays":5,"span":45,"railElevation":27,"girder":"capped","structure":"existing","support":"crane-column","tie":"flexible-plate","reach":30,"craneColumnBase":"fixed"} as RunwayConfig,
 // Sample case 087 (general arrangement plan: section cut tag on a grid bubble).
 c087:{"title":"12.5 t pendant · new columns · tapered-haunch · flexible-plate · 5×18 ft simple · ASD","number":"SIM-087","units":"US","method":"ASD","scope":"design","capacity":12.5,"craneSpan":85,"control":"pendant","cmaa":"C","cranes":1,"buildingClass":"D","system":"simple","bays":5,"span":18,"railElevation":30,"girder":"rolled","structure":"new","support":"tapered-haunch","tie":"flexible-plate"} as RunwayConfig,
 // Sample case 057 (crane-column tie section: station value over the building column flange, plate leader across the dimensions).
 c057:{"title":"35 t cab · existing building · crane-column · flexible-plate · 3×20 ft simple","number":"SIM-057","units":"US","method":"LRFD","scope":"design","capacity":35,"craneSpan":81,"control":"cab","cmaa":"C","cranes":1,"buildingClass":"D","system":"simple","bays":3,"span":20,"railElevation":15,"girder":"rolled","structure":"existing","support":"crane-column","tie":"flexible-plate","craneColumnBase":"pinned"} as RunwayConfig,
 // Sample case 059 (end stop elevation: top tie saddle drawn from grid 1, not from the girder end past it).
 c059:{"title":"40 t cab · existing building · crane-column · paired-bars · 2×50 ft simple","number":"SIM-059","units":"US","method":"LRFD","scope":"design","capacity":40,"craneSpan":69,"control":"cab","cmaa":"C","cranes":1,"buildingClass":"C","system":"simple","bays":2,"span":50,"railElevation":34,"girder":"rolled","structure":"existing","support":"crane-column","tie":"paired-bars","craneColumnBase":"pinned","buildingColumnShape":"W14X82"} as RunwayConfig,
 // Sample case 062 (stepped column: step cap wider than the lower shaft; independent tie plan of a wide flange).
 c062:{"title":"25 t cab · existing building · stepped-column · flexible-plate · 5×20 ft simple · ASD · SI","number":"SIM-062","units":"SI","method":"ASD","scope":"design","capacity":25,"craneSpan":97,"control":"cab","cmaa":"C","cranes":1,"buildingClass":"D","system":"simple","bays":5,"span":20,"railElevation":29,"girder":"rolled","structure":"existing","support":"stepped-column","tie":"flexible-plate"} as RunwayConfig,
 // Sample case 066 (stepped column: step cap wider than the lower shaft (SI)).
 c066:{"title":"35 t cab · existing building · stepped-column · paired-bars · 3×20 ft simple · SI","number":"SIM-066","units":"SI","method":"LRFD","scope":"design","capacity":35,"craneSpan":68,"control":"cab","cmaa":"D","cranes":1,"buildingClass":"C","system":"simple","bays":3,"span":20,"railElevation":27,"girder":"rolled","structure":"existing","support":"stepped-column","tie":"paired-bars"} as RunwayConfig,
 // Sample case 078 (longitudinal bracing plan B: gusset tip past the plan edge under the callouts).
 c078:{"title":"10 t cab · new columns · twin-rib · paired-bars · 2×35 ft simple","number":"SIM-078","units":"US","method":"LRFD","scope":"design","capacity":10,"craneSpan":69,"control":"cab","cmaa":"C","cranes":1,"buildingClass":"C","system":"simple","bays":2,"span":35,"railElevation":16,"girder":"rolled","structure":"new","support":"twin-rib","tie":"paired-bars","reach":18} as RunwayConfig,
 // Sample case 083 (new column elevation: column height value on the seat level of a short broken column).
 c083:{"title":"30 t cab · new columns · rolled-corbel · paired-bars · 1×30 ft simple","number":"SIM-083","units":"US","method":"LRFD","scope":"design","capacity":30,"craneSpan":75,"control":"cab","cmaa":"D","cranes":1,"buildingClass":"C","system":"simple","bays":1,"span":30,"railElevation":18,"girder":"rolled","structure":"new","support":"rolled-corbel","tie":"paired-bars"} as RunwayConfig,
 // Sample case 084 (general arrangement: bracing callout and section names in narrow braced bays).
 c084:{"title":"2 × 10 t pendant · new columns · rolled-corbel · paired-bars · 5×15 ft simple","number":"SIM-084","units":"US","method":"LRFD","scope":"design","capacity":10,"craneSpan":69,"control":"pendant","cmaa":"C","cranes":2,"buildingClass":"C","system":"simple","bays":5,"span":15,"railElevation":22,"girder":"rolled","structure":"new","support":"rolled-corbel","tie":"paired-bars"} as RunwayConfig,
 // Sample case 086 (end bearing plan below the nuts of a rolled bracket seat).
 c086:{"title":"15 t cab · new columns · rolled-corbel · paired-bars · 3×35 ft simple · ASD","number":"SIM-086","units":"US","method":"ASD","scope":"design","capacity":15,"craneSpan":56,"control":"cab","cmaa":"B","cranes":1,"buildingClass":"B","system":"simple","bays":3,"span":35,"railElevation":18,"girder":"rolled","structure":"new","support":"rolled-corbel","tie":"paired-bars"} as RunwayConfig,
 // Sample case 088 (general arrangement: section name on the crane-level strut under the girder).
 c088:{"title":"10 t cab · new columns · tapered-haunch · flexible-plate · 1×35 ft simple","number":"SIM-088","units":"US","method":"LRFD","scope":"design","capacity":10,"craneSpan":49,"control":"cab","cmaa":"D","cranes":1,"buildingClass":"C","system":"simple","bays":1,"span":35,"railElevation":23,"girder":"rolled","structure":"new","support":"tapered-haunch","tie":"flexible-plate"} as RunwayConfig,
};
const dir=new URL('../tests/fixtures/sheets/',import.meta.url);
const file=(name:string)=>new URL(`${name}.json.gz`,dir);
const names=process.argv.slice(2).length?process.argv.slice(2):[...new Set([...readdirSync(dir).filter(f=>f.endsWith('.json.gz')).map(f=>f.replace('.json.gz','')),...Object.keys(configFixtures)])];
// Everything drawn from a snapshot: the sheets and the detail views.
const drawn=(s:CalculationSnapshot)=>[...drawingSheetSet(s).map(v=>v.svg),...detailTopics(s).flatMap(t=>t.views.map(v=>v.render().svg))].join('\n');
// Results the drawings do not read, each left out only where the drawings stay the same.
const removals:[string,(s:any)=>void][]=[
 ['girder interface results',s=>{if(s.detailResults)s.detailResults.interfaces=[];}],
 ['fatigue detail results',s=>{if(s.detailResults)s.detailResults.fatigue=[];}],
 ['case index',s=>{if(s.detailResults)delete s.detailResults.caseIndex;}],
 ['analysis envelope',s=>{if(s.analysis)s.analysis.envelope=undefined;}],
 ['check notes',s=>{for(const c of s.checks)if(c.note)c.note='';}],
 ['check references',s=>{for(const c of s.checks)if(c.refs)c.refs=[];}],
 ['check quantities',s=>{for(const c of s.checks)delete c.quantity;}],
 ['existing column combinations',s=>{if(s.existingColumn?.combinations)s.existingColumn.combinations=[];}],
 ['column base support details',s=>{for(const v of s.columnBase?.supports??[])for(const k of Object.keys(v))if(Array.isArray(v[k])&&v[k].length>3)v[k]=[];}],
 ['bracing combinations',s=>{if(s.longitudinalBracing?.combinations)s.longitudinalBracing.combinations=[];}],
 ['design combinations',s=>{if(s.designAnalysis?.combinations)s.designAnalysis.combinations=[];}],
 ['warnings',s=>{s.warnings=[];}]
];
for(const name of names){
 const stored=existsSync(file(name))?JSON.parse(gunzipSync(readFileSync(file(name))).toString('utf8')) as CalculationSnapshot:undefined;
 const project:ProjectInput|undefined=/^t\d\d$/.test(name)?templateProject(name):configFixtures[name]?buildProject(configFixtures[name]):stored?.input;
 if(!project){console.log(name,'is neither a template nor a stored fixture');continue;}
 const errors=validateProject(project);if(errors.length){console.log(name,'invalid:',errors.join(' | '));continue;}
 const t0=Date.now(),s=calculate(project),reference=drawn(s);
 let kept=structuredClone(s);const left:string[]=[];
 for(const [label,remove] of removals){
  const trial=structuredClone(kept);remove(trial);
  if(drawn(trial)===reference){kept=trial;left.push(label);}
 }
 writeFileSync(file(name),gzipSync(JSON.stringify(kept),{level:9}));
 console.log(`${name}: ${Math.round((Date.now()-t0)/1000)} s; left out ${left.join(', ')}`);
}
