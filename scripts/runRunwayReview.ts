import { mkdir, writeFile } from 'node:fs/promises';
import { runRunwayReview, reviewSources } from '../benchmarks/runwayReview';
import { runAllPermitBenchmarks } from '../benchmarks/runPermitSuite';
import { permitSources } from '../benchmarks/permitCases';
import { referenceVersion } from '../src/engine/references';

const root=new URL('../output/runway-review/',import.meta.url);
await mkdir(root,{recursive:true});
await mkdir(new URL('../tmp/runway-review/',import.meta.url),{recursive:true});
const cases=runRunwayReview();
const exports:{id:string;status:number;revision:string;bytes?:number;gate?:unknown}[]=[];
// Exercise the production report endpoint with unmodified valid project records.
// Complete design requests must remain rejected; no eligible flag is forged.
for(const id of ['04','05','01']){
 const c=cases.find(c=>c.id===id)!;
 const response=await fetch('http://127.0.0.1:5173/api/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input:c.project,revision:c.snapshot!.revision})});
 if(id==='01'){
  const gate=await response.json();if(response.status!==422)throw Error('Incomplete design export was not blocked');
  exports.push({id,status:response.status,revision:c.snapshot!.revision,gate});
 }else{
  if(!response.ok)throw Error(`Export ${id}: ${response.status} ${await response.text()}`);
  if(response.headers.get('x-calculation-revision')!==c.snapshot!.revision)throw Error(`Wrong PDF revision: ${id}`);
  const pdf=Buffer.from(await response.arrayBuffer());if(pdf.subarray(0,5).toString()!=='%PDF-')throw Error(`Invalid PDF: ${id}`);
  await writeFile(new URL(`../tmp/runway-review/app-case-${id}.pdf`,import.meta.url),pdf);
  exports.push({id,status:response.status,revision:c.snapshot!.revision,bytes:pdf.length});
 }
}
const prior=runAllPermitBenchmarks();
const rows=cases.flatMap(c=>c.rows);
const result={reviewDate:'2026-10-07',referenceVersion,sources:reviewSources,summary:{cases:cases.length,comparisons:rows.length,matches:rows.filter(r=>r.status==='MATCH').length,differences:rows.filter(r=>r.status==='DIFFERENCE').length},cases,exports,prior:{sources:permitSources,results:prior,summary:{reports:permitSources.length,comparisons:prior.length,matches:prior.filter(r=>r.status==='match').length,differences:prior.filter(r=>r.status==='difference').length}}};
await writeFile(new URL('review-results.json',root),JSON.stringify(result,null,2)+'\n');
for(const c of cases)if(c.project)await writeFile(new URL(`case-${c.id}.cranecalc.json`,root),JSON.stringify(c.project,null,2)+'\n');
console.log(result.summary);console.table(exports.map(e=>({case:e.id,status:e.status,revision:e.revision,bytes:e.bytes??0})));
