import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {exampleProject} from '../src/engine/defaults';
import {loadCappedSection} from '../src/data/aiscChannels';
import {cappedElasticProperties,cappedTorsionResearch} from '../src/engine/capChannel';

const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const properties=(w:string,c='C15X33.9')=>{
 const section=loadCappedSection(exampleProject.section,w,c),p=cappedElasticProperties(section)!;
 return {section:section.name,A:p.A/25.4**2,Ix:p.Ix/25.4**4,Iy:p.Iy/25.4**4,It:p.topI/25.4**4,cy:p.cy/25.4,Sbottom:p.Sbottom/25.4**3,Stop:p.Stop/25.4**3,weight:p.nominalWeight,research:cappedTorsionResearch(section)};
};
const dg7=[
 {w:'W30X99',c:'C15X33.9',Ix:5550,It:380,cy:18.5,Sbottom:300,Stop:481},
 {w:'W24X84',c:'C15X33.9',Ix:3340,It:362,cy:15.4,Sbottom:217,Stop:367},
 {w:'W24X84',c:'C12X20.7',Ix:3030,It:176,cy:14.3,Sbottom:211,Stop:302},
].map(source=>({source,app:properties(source.w,source.c)}));
const redDot=[
 {w:'W18X76',page:53,A:32.017,Ix:1841.4,Iy:464.356,Sbottom:156.311,Stop:266.869},
 {w:'W30X99',page:54,A:38.717,Ix:5537.7,Iy:443.002,Sbottom:297.920,Stop:469.598},
].map(source=>({source,app:properties(source.w)}));
const results=[...read('output/keeper-fatigue-revision/sizing-results.json'),...read('output/keeper-fatigue-alternatives/sizing-results.json')];
const old=read('output/permit-sizing/sizing-results.json');
const fatigueComparison=['W24X131','W24X229','W24X250'].map(shape=>{
 const id=`${shape}-brace25-ecc0.25`,before=read(`output/permit-sizing/${id}.json`),after=read(`output/keeper-fatigue-revision/${id}.json`);
 return {shape,failedBefore:old.find((v:any)=>v.id===id).failures.length,failedAfter:results.find(v=>v.id===id).failures.length,
  fatigueBefore:old.find((v:any)=>v.id===id).fatigue[0],fatigueAfter:results.find(v=>v.id===id).fatigue[0],
  bins:after.detailResults.railFatigueBins,beforeRevision:before.revision,afterRevision:after.revision};
});
const result={date:'2026-10-08',scope:'18 fictitious sizing scenarios; 3 published elastic-property benchmarks; 2 actual crane permit packages. Not 18 permits or full cap design validation.',selected:'W24X229',results,dg7,redDot,everett:properties('W24X76'),fatigueComparison};
mkdirSync('output/cap-keeper-validation',{recursive:true});
writeFileSync('output/cap-keeper-validation/evidence.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({scenarios:results.length,passing:results.filter(v=>!v.failures.length).map(v=>v.id),dg7Properties:dg7.length*5,permitAssemblies:redDot.length}));
