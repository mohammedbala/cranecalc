import {writeFileSync,mkdirSync} from 'node:fs';
mkdirSync('output/capped-demonstration',{recursive:true});
import {cappedMechanics} from '../src/engine/cappedMechanics';
import {loadCappedSection} from '../src/data/aiscChannels';
import {exampleProject} from '../src/engine/defaults';
const fixtures:[string,string,number][]=[['W36X150','C15X33.9',146275],['W33X141','C15X33.9',117627],['W24X84','C12X20.7',24215],['W33X118','C15X33.9',91050],['W30X116','C15X33.9',68520],['W24X68','C12X20.7',18386],['W21X68','C12X20.7',13753],['W21X62','C12X20.7',12272],['W30X99','C15X33.9',53937],['W27X94','C15X33.9',43840],['W27X84','C15X33.9',37518],['W24X84','C15X33.9',28050]];
const result=fixtures.map(([w,c,published])=>{const m=cappedMechanics(loadCappedSection(exampleProject.section,w,c))!;return {section:`${w} + ${c}`,published,integrated:m.Cw/25.4**6,differencePercent:100*(m.Cw/25.4**6/published-1)};});
writeFileSync('output/capped-demonstration/cw-source-comparison.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
