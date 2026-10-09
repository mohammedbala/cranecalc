import {writeFileSync} from 'node:fs';
import {demonstrationProject} from '../src/engine/demonstration';
import {fingerprint} from '../src/engine/calculate';
import {loadCappedSection} from '../src/data/aiscChannels';
const p=demonstrationProject(),bad=structuredClone(p),cap=structuredClone(p);
bad.spans[0]=-1;cap.section=loadCappedSection(cap.section,'W24X229','C15X33.9');
const cases=[
 {name:'staleRevision',input:p,revision:'stale',expected:409},
 {name:'invalidGeometry',input:bad,revision:fingerprint(bad),expected:422},
 {name:'incompleteCapModel',input:cap,revision:fingerprint(cap),expected:422},
];
const results:Record<string,unknown>={date:new Date().toISOString(),revision:fingerprint(p)};
for(const test of cases){
 const r=await fetch('http://127.0.0.1:5173/api/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input:test.input,revision:test.revision})});
 if(r.status!==test.expected)throw Error(`${test.name}: ${r.status} instead of ${test.expected}`);
 const body=await r.json();results[test.name]={status:r.status,...body};
}
writeFileSync('output/demonstration/api-verification.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
