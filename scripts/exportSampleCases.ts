/**
 * Export a simulated case set to the sample-case gallery.
 *
 *   npx tsx scripts/exportSampleCases.ts <casesDir> [resultsDir] [--out public/cases]
 *
 * <casesDir> holds NNN.json = {id,title,descriptor,config,project,...} (the generated configurations); the optional
 * [resultsDir] holds the simulation run's NNN/summary.json (outcome, check counts, open items, calcSeconds) and
 * NNN/checks.csv (every check, used for the governing design D/C). Each project is validated with validateProject:
 * invalid ones are skipped and reported. The output folder's numbered files and index.json are replaced, so the
 * command can be re-run on a regenerated case set.
 */
import {existsSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateProject} from '../src/engine/calculate';
import {supportLabels,tieLabels} from '../src/engine/configInputs';
import type {CaseOutcome,SampleCaseCheck,SampleCaseEntry,SampleCaseIndex} from '../src/components/sampleCaseIndex';

const foot=304.8;
const outcomes:CaseOutcome[]=['eligible','eligible-with-failures','review-draft','blocked','invalid'];
/** Plural seat names for titles; a support kind not listed here is spelled from its id. */
const supportShort:Record<string,string>={'by-others':'brackets by others','twin-rib':'twin-rib seats','haunched-seat':'haunched seats','rolled-corbel':'W-stub brackets','tapered-haunch':'tapered I haunches','column-cap':'column caps'};
const words=(id:string)=>id.replace(/[-_]+/g,' ').trim();
const sentence=(s:string)=>s?s[0].toUpperCase()+s.slice(1):s;
const num=(v:number)=>String(Math.round(v*100)/100);
const round3=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?Math.round(v*1000)/1000:null;

export interface CaseFile{id:number;title?:string;descriptor?:string;config?:Record<string,any>;project:any}
export interface CaseResults{summary?:Record<string,any>;checks?:Record<string,string>[]}

/** RFC 4180 CSV (quoted fields with commas, doubled quotes and line breaks) to rows keyed by the header. */
export function parseCsv(text:string):Record<string,string>[]{
 const rows:string[][]=[];let row:string[]=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){if(ch==='"'){if(text[i+1]==='"'){field+='"';i++;}else quoted=false;}else field+=ch;continue;}
  if(ch==='"')quoted=true;
  else if(ch===','){row.push(field);field='';}
  else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(field);rows.push(row);row=[];field='';}
  else field+=ch;
 }
 if(field||row.length){row.push(field);rows.push(row);}
 const [head,...body]=rows.filter(r=>r.length>1||r[0]);
 return head?body.map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]??'']))):[];
}

/**
 * The governing check: the highest demand/capacity of the evaluated design checks, or of any failing check when that is
 * higher (load-basis, input and detailing rows carry ratios of 1 that are not demands).
 */
export function governingCheck(r:CaseResults):SampleCaseCheck|null{
 let best:SampleCaseCheck|null=null;
 if(r.checks?.length){
  for(const c of r.checks){
   const u=Number(c.utilization);
   if(!(c.status==='fail'||c.type==='design'&&c.status==='pass')||c.utilization===''||!Number.isFinite(u))continue;
   if(!best||u>best.utilization!)best={id:c.id,title:c.title,status:c.status,utilization:round3(u)};
  }
  return best;
 }
 // Without the check table only the failing checks of the summary carry a meaningful ratio.
 for(const c of r.summary?.open??[])if(c.status==='fail'&&typeof c.utilization==='number'&&Number.isFinite(c.utilization)&&(!best||c.utilization>best.utilization!))best={id:c.id,title:c.title,status:c.status,utilization:round3(c.utilization)};
 return best;
}

/** One gallery entry from a case file and its run results (when the case was run). */
export function caseEntry(c:CaseFile,r:CaseResults={},bytes=0):SampleCaseEntry{
 const p=c.project,cfg:Record<string,any>={...(p.configurator??{}),...(c.config??{})};
 const spansFt=(p.spans as number[]).map(v=>Math.round(v/foot*10)/10),equal=spansFt.every(v=>v===spansFt[0]);
 const system=String(cfg.system??p.system??'simple'),girder=String(cfg.girder??(p.capDesign||/\+/.test(p.section?.name??'')?'capped':'rolled'));
 const structure=String(cfg.structure??'existing'),support=String(cfg.support??'by-others');
 // A column cap holds the girder without a flange tie.
 const tie=support==='column-cap'?'none':String(cfg.tie??'paired-bars');
 const capacity=Number(cfg.capacity??0),cranes=Number(cfg.cranes??p.cranes?.length??1),control=String(cfg.control??'cab');
 const spans=equal?`${spansFt.length} × ${num(spansFt[0])} ft`:`${spansFt.map(num).join(' + ')} ft`;
 const crane=cranes>1?`${cranes} × ${num(capacity)}-ton ${control} cranes`:`${num(capacity)}-ton ${control} crane`;
 const title=[crane,structure==='new'?'new columns':structure==='existing'?'existing building':words(structure),supportShort[support]??words(support),
  `${spans}${system==='continuous'?' continuous':''}${girder==='capped'?' capped':''}`].join(' · ');
 const s=r.summary,ran=!!s&&outcomes.includes(s.outcome);
 return {
  id:Number(c.id),file:`${String(c.id).padStart(3,'0')}.json`,title,descriptor:String(c.descriptor??c.title??''),
  structure,support,supportLabel:(supportLabels as Record<string,string>)[support]??sentence(words(support)),
  tie,tieLabel:tie==='none'?'No flange tie (column cap)':(tieLabels as Record<string,string>)[tie]??sentence(words(tie)),
  system,girder,girderSystem:`${system}-${girder}`,girderSystemLabel:`${system==='continuous'?'Continuous':'Simple spans'} · ${girder==='capped'?'capped W':'rolled W'}`,
  section:String(p.section?.name??''),bays:spansFt.length,spans,
  craneSpan:typeof cfg.craneSpan==='number'?cfg.craneSpan:null,railElevation:typeof cfg.railElevation==='number'?cfg.railElevation:null,
  capacity,cranes,control,cmaa:String(cfg.cmaa??p.cranes?.[0]?.operatingClass??''),buildingClass:String(cfg.buildingClass??p.aist?.buildingClass??''),
  units:String(cfg.units??p.units??'US'),method:String(cfg.method??p.method??'LRFD'),
  outcome:ran?s!.outcome:'not-run',counts:ran?{...(s!.counts??{})}:{},
  governing:ran?governingCheck(r):null,
  open:ran?(s!.open??[]).map((o:any)=>({id:String(o.id),title:String(o.title),status:String(o.status),utilization:round3(o.utilization)})):[],
  calcSeconds:ran&&typeof s!.calcSeconds==='number'?Math.round(s!.calcSeconds*10)/10:null,
  bytes,
 };
}

export interface ExportReport{written:number[];skipped:{id:number|string;reason:string}[];withoutResults:number[]}

/** Write outDir/NNN.json (the validated project) and outDir/index.json; returns what was written and skipped. */
export function exportSampleCases({casesDir,resultsDir,outDir,generated=new Date().toISOString().slice(0,10)}:{casesDir:string;resultsDir?:string;outDir:string;generated?:string}):ExportReport{
 const report:ExportReport={written:[],skipped:[],withoutResults:[]},entries:SampleCaseEntry[]=[];
 mkdirSync(outDir,{recursive:true});
 for(const f of readdirSync(outDir))if(/^\d+\.json$/.test(f)||f==='index.json')rmSync(path.join(outDir,f));
 for(const f of readdirSync(casesDir).filter(f=>/^\d+\.json$/.test(f)).sort()){
  let c:CaseFile;
  try{c=JSON.parse(readFileSync(path.join(casesDir,f),'utf8'));}catch(e){report.skipped.push({id:f,reason:`unreadable: ${e instanceof Error?e.message:e}`});continue;}
  const id=Number(c.id??f.replace(/\.json$/,''));c.id=id;
  if(!c.project||typeof c.project!=='object'){report.skipped.push({id,reason:'no project'});continue;}
  const errors=validateProject(c.project);
  if(errors.length){report.skipped.push({id,reason:errors[0]});continue;}
  const r:CaseResults={},dir=resultsDir&&path.join(resultsDir,f.replace(/\.json$/,''));
  if(dir&&existsSync(path.join(dir,'summary.json')))r.summary=JSON.parse(readFileSync(path.join(dir,'summary.json'),'utf8'));
  if(dir&&existsSync(path.join(dir,'checks.csv')))r.checks=parseCsv(readFileSync(path.join(dir,'checks.csv'),'utf8'));
  const json=JSON.stringify(c.project),entry=caseEntry(c,r,Buffer.byteLength(json));
  if(entry.outcome==='not-run')report.withoutResults.push(id);
  writeFileSync(path.join(outDir,entry.file),json);
  entries.push(entry);report.written.push(id);
 }
 const index:SampleCaseIndex={version:1,generated,count:entries.length,cases:entries.sort((a,b)=>a.id-b.id)};
 writeFileSync(path.join(outDir,'index.json'),JSON.stringify(index));
 return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2),outAt=args.indexOf('--out'),outDir=outAt>=0?args[outAt+1]:'public/cases';
 const [casesDir,resultsDir]=args.filter((_,i)=>outAt<0||(i!==outAt&&i!==outAt+1));
 if(!casesDir){console.error('usage: npx tsx scripts/exportSampleCases.ts <casesDir> [resultsDir] [--out public/cases]');process.exit(2);}
 const r=exportSampleCases({casesDir,resultsDir,outDir});
 console.log(`Wrote ${r.written.length} cases and index.json to ${outDir}.`);
 if(r.withoutResults.length)console.log(`Without run results (${r.withoutResults.length}): ${r.withoutResults.join(', ')}`);
 for(const s of r.skipped)console.log(`Skipped case ${s.id}: ${s.reason}`);
}
