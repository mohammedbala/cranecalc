import {mkdirSync,writeFileSync} from 'node:fs';
import {demonstrationProject} from '../src/engine/demonstration';
import {calculate,validateProject} from '../src/engine/calculate';
import {loadAiscSection} from '../src/data/aiscSections';

// Sizing sensitivity only. Keep the loaded demonstration, capacities, criteria,
// duty, connections and report gates unchanged in the application.
const dir=process.argv[2]??'output/permit-sizing';mkdirSync(dir,{recursive:true});
const trials=process.argv[3]==='alternatives'?[
 ...['W14X176','W14X193','W14X211','W18X175','W18X192','W21X182','W21X201'].map(shape=>({shape,braceFeet:25,eccIn:.25})),
 {shape:'W24X162',braceFeet:12.5,eccIn:.25},
]:[
 ...['W24X104','W24X131','W24X162','W24X192','W24X207','W24X229','W24X250'].map(shape=>({shape,braceFeet:25,eccIn:.25})),
 {shape:'W24X131',braceFeet:12.5,eccIn:.25},
 {shape:'W24X131',braceFeet:25,eccIn:0},
 {shape:'W24X131',braceFeet:12.5,eccIn:0},
];
const results:unknown[]=[];
for(const trial of trials){
 const p=demonstrationProject();p.section=loadAiscSection(p.section,trial.shape);
 p.aist!.netFlangeArea=p.section.bf*p.section.tf;
 p.unbracedLength=p.lateralBraceSpacing=p.aist!.bottomBraceSpacing=trial.braceFeet*304.8;
 p.railEccentricity=trial.eccIn*25.4;
 const id=`${trial.shape}-brace${trial.braceFeet}-ecc${trial.eccIn}`;
 const errors=validateProject(p);
 if(errors.length){const item={id,...trial,errors};results.push(item);console.log(JSON.stringify(item));continue;}
 const start=Date.now(),s=calculate(p);
 writeFileSync(`${dir}/${id}.json`,JSON.stringify(s,null,2));
 const controls=['major','minor','combined','vertical','lateral','torsion-normal','torsion-stability','rail-head','rail-twist'];
 const checks=s.checks.filter(c=>controls.includes(c.id)).map(c=>({id:c.id,title:c.title,demand:c.demand,capacity:c.capacity,utilization:c.utilization,status:c.status}));
 const failures=s.checks.filter(c=>!['pass','not-applicable'].includes(c.status)).map(c=>({id:c.id,title:c.title,status:c.status,utilization:c.utilization,demand:c.demand,capacity:c.capacity}));
 const fatigue=s.checks.filter(c=>c.group==='Fatigue'&&Number.isFinite(c.utilization)).sort((a,b)=>(b.utilization??0)-(a.utilization??0)).slice(0,3).map(c=>({id:c.id,title:c.title,utilization:c.utilization}));
 const item={id,...trial,seconds:(Date.now()-start)/1000,revision:s.revision,errors:s.errors,eligible:s.eligible,checks,failures,fatigue};
 results.push(item);writeFileSync(`${dir}/sizing-results.json`,JSON.stringify(results,null,2));
 console.log(JSON.stringify({id,seconds:item.seconds,errors:item.errors,failedCheckCount:failures.length,governingFatigue:fatigue[0],controls:checks.map(c=>[c.id,Number(c.utilization?.toFixed(3))])}));
}
writeFileSync(`${dir}/sizing-results.json`,JSON.stringify(results,null,2));
