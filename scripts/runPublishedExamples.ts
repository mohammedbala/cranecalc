import {mkdirSync,writeFileSync} from 'node:fs';
import {runPublishedExamples,publishedSource} from '../benchmarks/publishedExamples';
const cases=runPublishedExamples(),rows=cases.flatMap(c=>c.rows),root='output/published-examples';
mkdirSync(root,{recursive:true});
const summary={cases:cases.length,comparisons:rows.length,matches:rows.filter(r=>r.status==='MATCH').length,differences:rows.filter(r=>r.status==='DIFFERENCE').length};
writeFileSync(`${root}/results.json`,JSON.stringify({generated:new Date().toISOString(),source:publishedSource,summary,cases},null,2));
console.log(JSON.stringify(summary));
for(const c of cases)for(const r of c.rows)if(r.status==='DIFFERENCE')console.log(`${c.id} ${c.example} ${r.label}: source=${r.reference}, app=${r.app.toFixed(5)}, difference=${r.percentDifference.toFixed(3)}%`);
