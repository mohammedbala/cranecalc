/**
 * The sample-case gallery's index (public/cases/index.json, written by scripts/exportSampleCases.ts): one entry per
 * simulated configuration, with its prebuilt project in public/cases/NNN.json. Filtering and sorting live here so the
 * gallery and its tests share them.
 */
export type CaseOutcome='eligible'|'eligible-with-failures'|'review-draft'|'blocked'|'invalid'|'not-run';
export interface SampleCaseCheck{id:string;title:string;status:string;utilization:number|null}
export interface SampleCaseEntry{
 id:number;
 /** The project file, relative to the cases folder (e.g. 001.json). */
 file:string;
 /** Short human title, e.g. "10-ton cab crane · existing building · twin-rib seats · 3 × 25 ft". */
 title:string;
 descriptor:string;
 structure:string;support:string;supportLabel:string;tie:string;tieLabel:string;
 system:string;girder:string;girderSystem:string;girderSystemLabel:string;
 /** The girder section as built, e.g. W16X67 + C15X33.9. */
 section:string;
 bays:number;spans:string;craneSpan:number|null;railElevation:number|null;
 /** Rated capacity of each crane, US tons. */
 capacity:number;cranes:number;control:string;cmaa:string;buildingClass:string;units:string;method:string;
 outcome:CaseOutcome;
 counts:Record<string,number>;
 /** Highest design-check demand/capacity ratio of the run (failing checks included). */
 governing:SampleCaseCheck|null;
 /** Failing and unverified checks of the run. */
 open:SampleCaseCheck[];
 calcSeconds:number|null;
 bytes:number;
}
export interface SampleCaseIndex{version:1;generated:string;count:number;cases:SampleCaseEntry[]}

export const outcomeLabels:Record<CaseOutcome,string>={
 eligible:'Eligible','eligible-with-failures':'With failures','review-draft':'Review draft',blocked:'Blocked',invalid:'Invalid in run','not-run':'Not run'};
export const outcomeNotes:Record<CaseOutcome,string>={
 eligible:'Every check passes; the package is exportable.',
 'eligible-with-failures':'Exportable with verified failing checks shown.',
 'review-draft':'Unverified items: the package prints as a review draft.',
 blocked:'Export is blocked until the open items are resolved.',
 invalid:'The inputs were rejected when the case was run.',
 'not-run':'Not calculated in the simulation run.'};

export const capacityRanges=[
 {value:'small',label:'Up to 5 tons',min:0,max:5},
 {value:'medium',label:'Over 5 to 15 tons',min:5.0001,max:15},
 {value:'large',label:'Over 15 to 30 tons',min:15.0001,max:30},
 {value:'heavy',label:'Over 30 tons',min:30.0001,max:Infinity}] as const;

export type CaseSort='id'|'capacity'|'dc';
export interface CaseFilters{query:string;structure:string;support:string;tie:string;girderSystem:string;capacity:string;outcome:string;sort:CaseSort}
export const emptyFilters:CaseFilters={query:'',structure:'',support:'',tie:'',girderSystem:'',capacity:'',outcome:'',sort:'id'};

export const caseNumber=(id:number)=>String(id).padStart(3,'0');

/** The cases matching every filter, in the chosen order (D/C: highest first; capacity: smallest first). */
export function filterCases(cases:SampleCaseEntry[],f:CaseFilters):SampleCaseEntry[]{
 const words=f.query.toLowerCase().split(/\s+/).filter(Boolean),range=capacityRanges.find(r=>r.value===f.capacity);
 const list=cases.filter(c=>{
  if(f.structure&&c.structure!==f.structure)return false;
  if(f.support&&c.support!==f.support)return false;
  if(f.tie&&c.tie!==f.tie)return false;
  if(f.girderSystem&&c.girderSystem!==f.girderSystem)return false;
  if(f.outcome&&c.outcome!==f.outcome)return false;
  if(range&&(c.capacity<range.min||c.capacity>range.max))return false;
  if(words.length){const text=`${caseNumber(c.id)} ${c.title} ${c.descriptor} ${c.section} ${c.supportLabel} ${c.tieLabel} ${c.girderSystemLabel} ${outcomeLabels[c.outcome]}`.toLowerCase();if(!words.every(w=>text.includes(w)))return false;}
  return true;
 });
 const dc=(c:SampleCaseEntry)=>c.governing?.utilization??-1;
 return list.sort((a,b)=>f.sort==='capacity'?a.capacity*a.cranes-b.capacity*b.cranes||a.id-b.id:f.sort==='dc'?dc(b)-dc(a)||a.id-b.id:a.id-b.id);
}

/** Distinct values of a field with their labels, in first-seen order of the index (the export writes a stable order). */
export function optionsOf(cases:SampleCaseEntry[],value:(c:SampleCaseEntry)=>string,label:(c:SampleCaseEntry)=>string){
 const seen=new Map<string,{value:string;label:string;count:number}>();
 for(const c of cases){const v=value(c),o=seen.get(v);if(o)o.count++;else seen.set(v,{value:v,label:label(c),count:1});}
 return [...seen.values()];
}

export const formatDc=(u:number|null|undefined)=>u===null||u===undefined||!Number.isFinite(u)?'—':u>=100?'>99':u.toFixed(2);
