/**
 * One calculation in its own process, for the memory and time budgets of tests/perfTwoCrane.test.ts:
 * node --max-old-space-size=1536 --import tsx tests/fixtures/perfCalculate.ts '<json>' where json is
 * {"template":"t09"} or {"config":{...RunwayConfig overrides}}. Prints one JSON line.
 */
import {calculate} from '../../src/engine/calculate';
import {templateProject} from '../../src/engine/templates';
import {buildProject} from '../../src/engine/configurator';
import {defaultRunwayConfig} from '../../src/engine/configInputs';

const spec=JSON.parse(process.argv[2]??'{}') as {template?:string;config?:Record<string,unknown>};
const project=spec.template?templateProject(spec.template):buildProject({...defaultRunwayConfig,...spec.config} as typeof defaultRunwayConfig);
const start=performance.now(),cpu0=process.cpuUsage(),progress={design:0,detailed:0,bad:0};let last=-1;
const s=calculate(project,{onProgress:v=>{progress[v.search]++;if(!(v.fraction>0&&v.fraction<=1)||(v.fraction<=last&&v.fraction!==1&&last!==1))progress.bad++;last=v.fraction;}});
const seconds=(performance.now()-start)/1000,cpuUsage=process.cpuUsage(cpu0),cpuSeconds=(cpuUsage.user+cpuUsage.system)/1e6;
const check=(id:string)=>s.checks.find(c=>c.id===id);
console.log(JSON.stringify({seconds,cpuSeconds,peakMB:process.resourceUsage().maxRSS/1024,errors:s.errors,cranes:project.cranes.length,checks:s.checks.length,progress,
 designCases:s.designAnalysis?.cases,travelSteps:s.designAnalysis?.travelSteps,detailCases:s.detailResults?.cases,caseIndex:Object.keys(s.detailResults?.caseIndex??{}).length,
 analysis:['detail-travel','detail-mesh','design-travel','design-mesh'].map(id=>({id,status:check(id)?.status,value:check(id)?.demand}))}));
