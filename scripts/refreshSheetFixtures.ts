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
 * Configurator choices of fixtures that are not (yet) templates: the stepped-column arrangements of the plan's t15/t16
 * (20 t cab, 4 × 30 ft rolled, paired bars, rail 32 ft; 10 t cab, 3 × 25 ft capped, cap tieback angles, rail 26 ft).
 */
const configFixtures:Record<string,RunwayConfig>={
 'c-stepped-20t':{...defaultRunwayConfig,title:'Stepped columns, girder on the step',capacity:20,control:'cab',cmaa:'C',bays:4,span:30,girder:'rolled',structure:'existing',support:'stepped-column',tie:'paired-bars',railElevation:32,craneSpan:70},
 'c-stepped-10t':{...defaultRunwayConfig,title:'Stepped columns, capped girder, cap tieback angles',capacity:10,control:'cab',cmaa:'C',bays:3,span:25,girder:'capped',structure:'existing',support:'stepped-column',tie:'cap-angle',railElevation:26,craneSpan:60}
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
