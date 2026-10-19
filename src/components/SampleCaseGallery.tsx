import {useEffect,useMemo,useState} from 'react';
import {FlaskConical,FolderOpen,LoaderCircle,PencilRuler,RotateCcw,Search,TriangleAlert} from 'lucide-react';
import {validateProject} from '../engine/calculate';
import {defaultRunwayConfig,type RunwayConfig} from '../engine/configInputs';
import type {ProjectInput} from '../engine/types';
import {SupportSketch} from './StartPanel';
import {capacityRanges,caseNumber,emptyFilters,filterCases,formatDc,optionsOf,outcomeLabels,outcomeNotes,type CaseFilters,type CaseOutcome,type CaseSort,type SampleCaseEntry,type SampleCaseIndex} from './sampleCaseIndex';

export type CaseView='Calculation'|'Diagrams';
type Fetcher=(url:string)=>Promise<{ok:boolean;status:number;json:()=>Promise<unknown>}>;
const casesUrl=(file:string)=>`${import.meta.env.BASE_URL}cases/${file}`;
const outcomeOrder:CaseOutcome[]=['eligible','eligible-with-failures','review-draft','blocked','invalid','not-run'];
const seconds=(s:number)=>s<90?`${Math.round(s)} s`:`${(s/60).toFixed(1)} min`;

/** Fetch a case's prebuilt project and validate it as an imported project file is validated. */
export async function loadSampleCase(entry:SampleCaseEntry,fetcher:Fetcher=(url)=>fetch(url)):Promise<ProjectInput>{
 const response=await fetcher(casesUrl(entry.file));
 if(!response.ok)throw Error(`Case ${caseNumber(entry.id)} could not be loaded (HTTP ${response.status}).`);
 const data=await response.json(),errors=validateProject(data);
 if(errors.length)throw Error(`Case ${caseNumber(entry.id)} is not a valid project: ${errors[0]}`);
 return data as ProjectInput;
}

/** The Open and Drawings actions: load the case, then hand it to the app (which confirms replacing the project). */
export async function openSampleCase(entry:SampleCaseEntry,view:CaseView,{onOpen,fetcher}:{onOpen:(p:ProjectInput,entry:SampleCaseEntry,view:CaseView)=>void;fetcher?:Fetcher}){
 onOpen(await loadSampleCase(entry,fetcher),entry,view);
}

const sketchConfig=(c:SampleCaseEntry)=>({...defaultRunwayConfig,structure:c.structure,support:c.support,tie:c.tie==='none'?'paired-bars':c.tie,girder:c.girder,system:c.system,scope:'design'} as RunwayConfig);
const countsText=(counts:Record<string,number>)=>(['pass','fail','unverified','not-applicable','excluded'] as const).filter(k=>counts[k]).map(k=>`${counts[k]} ${k==='not-applicable'?'n/a':k}`).join(' · ');

/** One case: its support sketch, title, key facts, outcome and governing D/C, open items and the open actions. */
export function CaseCard({entry:c,busy,disabled,error,onOpen}:{entry:SampleCaseEntry;busy?:CaseView|null;disabled?:boolean;error?:string;onOpen:(view:CaseView)=>void}){
 const n=caseNumber(c.id),titleId=`sample-case-${n}`,dc=c.governing?.utilization??null;
 const fails=c.open.filter(o=>o.status==='fail').length,unverified=c.open.length-fails;
 return <article className="template-card case-card" aria-labelledby={titleId}>
  <div className="template-figure"><SupportSketch config={sketchConfig(c)}/><span className={`case-badge ${c.outcome}`} title={outcomeNotes[c.outcome]}>{outcomeLabels[c.outcome]}</span></div>
  <div className="template-body">
   <div className="case-head"><span className="eyebrow">CASE {n}</span>{c.governing&&<span className={`case-dc ${dc!==null&&dc>1?'over':''}`} title={`Governing: ${c.governing.title}`}>D/C {formatDc(dc)}</span>}</div>
   <h3 id={titleId}>{c.title}</h3>
   <p className="template-facts">{c.section} · crane span {c.craneSpan??'—'} ft · CMAA {c.cmaa} · Class {c.buildingClass} · {c.method} · {c.units}</p>
   <div className="template-tags"><span>{c.supportLabel}</span>{c.tie!=='none'&&<span>{c.tieLabel}</span>}<span>{c.girderSystemLabel}</span></div>
   {c.governing&&<p className="case-governing"><span>Governing</span> {c.governing.title}{c.governing.status==='fail'?' (fails)':''}</p>}
   {c.open.length>0&&<details className="case-open"><summary>{c.open.length} open item{c.open.length===1?'':'s'}{fails&&unverified?` · ${fails} failing, ${unverified} unverified`:unverified?' · unverified':' · failing'}</summary>
    <ul>{c.open.map(o=><li key={o.id}><span>{o.title}</span><span className={`case-item-status ${o.status}`}>{o.status}{o.utilization!==null?` ${formatDc(o.utilization)}`:''}</span></li>)}</ul></details>}
   <p className="case-meta">{c.outcome==='not-run'?'Not calculated in the simulation run':`${countsText(c.counts)}${c.calcSeconds!==null?` · calculated in ${seconds(c.calcSeconds)}`:''}`}</p>
   {error&&<div className="error-banner" role="alert"><TriangleAlert size={14}/><p>{error}</p></div>}
   <div className="template-actions">
    <button className="outline-button primary" disabled={disabled} aria-label={`Open case ${n}: ${c.title}`} onClick={()=>onOpen('Calculation')}>{busy==='Calculation'?<LoaderCircle size={13} className="spin"/>:<FolderOpen size={13}/>}Open</button>
    <button className="outline-button" disabled={disabled} aria-label={`Open case ${n} on the drawing sheets`} onClick={()=>onOpen('Diagrams')}>{busy==='Diagrams'?<LoaderCircle size={13} className="spin"/>:<PencilRuler size={13}/>}Drawings</button>
   </div>
  </div>
 </article>;
}

function Choice({label,value,options,onChange}:{label:string;value:string;options:{value:string;label:string;count?:number}[];onChange:(v:string)=>void}){
 return <label className="field"><span>{label}</span><select aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>
  <option value="">All</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}{o.count!==undefined?` (${o.count})`:''}</option>)}</select></label>;
}

/** Sample cases: simulated configurations with their inputs prebuilt, to browse, filter and open in the app. */
export default function SampleCaseGallery({onOpen,index:given,initialFilters,fetcher}:{onOpen:(p:ProjectInput,entry:SampleCaseEntry,view:CaseView)=>void;index?:SampleCaseIndex;initialFilters?:Partial<CaseFilters>;fetcher?:Fetcher}){
 const [index,setIndex]=useState<SampleCaseIndex|null>(given??null),[loadError,setLoadError]=useState('');
 const [filters,setFilters]=useState<CaseFilters>({...emptyFilters,...initialFilters});
 const [opening,setOpening]=useState<{id:number;view:CaseView}|null>(null),[errors,setErrors]=useState<Record<number,string>>({});
 useEffect(()=>{
  if(given){setIndex(given);return;}
  let live=true;
  (fetcher??((url:string)=>fetch(url)))(casesUrl('index.json')).then(async r=>{if(!r.ok)throw Error(`The case index could not be loaded (HTTP ${r.status}).`);const data=await r.json() as SampleCaseIndex;if(!Array.isArray(data?.cases))throw Error('The case index is not readable.');if(live)setIndex(data);})
   .catch(e=>{if(live)setLoadError(e instanceof Error?e.message:String(e));});
  return ()=>{live=false;};
 },[given,fetcher]);
 const cases=index?.cases??[];
 const shown=useMemo(()=>filterCases(cases,filters),[cases,filters]);
 const byLabel=(a:{label:string},b:{label:string})=>a.label.localeCompare(b.label);
 const options=useMemo(()=>({
  structure:optionsOf(cases,c=>c.structure,c=>c.structure==='new'?'New columns':c.structure==='existing'?'Existing building':c.structure).sort((a,b)=>a.value==='existing'?-1:b.value==='existing'?1:byLabel(a,b)),
  support:optionsOf(cases,c=>c.support,c=>c.supportLabel).sort(byLabel),
  tie:optionsOf(cases,c=>c.tie,c=>c.tieLabel).sort(byLabel),
  girderSystem:optionsOf(cases,c=>c.girderSystem,c=>c.girderSystemLabel).sort(byLabel),
  outcome:outcomeOrder.map(o=>({value:o,label:outcomeLabels[o],count:cases.filter(c=>c.outcome===o).length})).filter(o=>o.count),
  capacity:capacityRanges.map(r=>({value:r.value,label:r.label,count:cases.filter(c=>c.capacity>=r.min&&c.capacity<=r.max).length})).filter(o=>o.count),
 }),[cases]);
 const set=(patch:Partial<CaseFilters>)=>setFilters(f=>({...f,...patch}));
 const filtered=JSON.stringify({...filters,sort:'id'})!==JSON.stringify(emptyFilters);
 const open=(entry:SampleCaseEntry,view:CaseView)=>{
  setOpening({id:entry.id,view});setErrors(e=>({...e,[entry.id]:''}));
  openSampleCase(entry,view,{onOpen,fetcher}).catch(e=>setErrors(x=>({...x,[entry.id]:e instanceof Error?e.message:String(e)}))).finally(()=>setOpening(null));
 };
 return <>
  <div className="result-head"><div><div className="eyebrow">SAMPLE CASES</div><h2>Simulated configurations</h2></div><span className="model-tag">{index?`${index.count} cases`:'Loading'}</span></div>
  <div className="source-intro"><FlaskConical size={21}/><p>Runway configurations generated to test CraneCalc across structures, supports, ties, girders and cranes. Open one to load its inputs as the configurator built them and recalculate it here; the outcome, governing D/C and open items shown are those of the simulation run{index?.generated?` exported ${index.generated}`:''}. The cases are fictitious demonstration configurations with fictitious crane, supplier, survey and site data: they are not designs for construction.</p></div>
  {loadError&&<div className="error-banner" role="alert"><TriangleAlert size={14}/><p>{loadError}</p></div>}
  {!index&&!loadError&&<p className="subtle"><LoaderCircle size={12} className="spin"/> Loading the case index…</p>}
  {index&&<>
   <div className="case-outcomes" role="group" aria-label="Filter by outcome">{options.outcome.map(o=><button key={o.value} className={`case-outcome ${o.value} ${filters.outcome===o.value?'selected':''}`} aria-pressed={filters.outcome===o.value} title={outcomeNotes[o.value as CaseOutcome]} onClick={()=>set({outcome:filters.outcome===o.value?'':o.value})}><strong>{o.count}</strong> {o.label.toLowerCase()}</button>)}</div>
   <form className="case-filters" role="search" aria-label="Filter sample cases" onSubmit={e=>e.preventDefault()}>
    <label className="field case-search"><span>Search</span><div className="case-search-wrap"><Search size={13} aria-hidden="true"/><input type="search" aria-label="Search sample cases" value={filters.query} placeholder="Case number, section, crane, support…" onChange={e=>set({query:e.target.value})}/></div></label>
    <Choice label="Structure" value={filters.structure} options={options.structure} onChange={v=>set({structure:v})}/>
    <Choice label="Girder support" value={filters.support} options={options.support} onChange={v=>set({support:v})}/>
    <Choice label="Top-flange tie" value={filters.tie} options={options.tie} onChange={v=>set({tie:v})}/>
    <Choice label="Girder system" value={filters.girderSystem} options={options.girderSystem} onChange={v=>set({girderSystem:v})}/>
    <Choice label="Crane capacity" value={filters.capacity} options={options.capacity} onChange={v=>set({capacity:v})}/>
    <Choice label="Outcome" value={filters.outcome} options={options.outcome} onChange={v=>set({outcome:v})}/>
    <label className="field"><span>Sort by</span><select aria-label="Sort by" value={filters.sort} onChange={e=>set({sort:e.target.value as CaseSort})}><option value="id">Case number</option><option value="capacity">Crane capacity</option><option value="dc">Governing D/C (highest first)</option></select></label>
   </form>
   <div className="case-count"><p aria-live="polite">{shown.length===cases.length?`${cases.length} cases`:`${shown.length} of ${cases.length} cases`}</p>{filtered&&<button className="text-button" onClick={()=>setFilters(f=>({...emptyFilters,sort:f.sort}))}><RotateCcw size={12}/>Clear filters</button>}</div>
   {shown.length===0?<p className="subtle case-empty">No cases match these filters.</p>
    :<ul className="template-grid case-grid" aria-label="Sample cases">{shown.map(c=><li key={c.id}><CaseCard entry={c} busy={opening?.id===c.id?opening.view:null} disabled={!!opening} error={errors[c.id]} onOpen={view=>open(c,view)}/></li>)}</ul>}
   <p className="form-note">Opening a case replaces the current project (save it first if you need it). Crane capacities are rated loads of each crane in US tons{cases.some(c=>c.cranes>1)?'; two-crane cases carry two identical cranes':''}.</p>
  </>}
 </>;
}
