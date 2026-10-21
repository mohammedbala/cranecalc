import type {CalculationSnapshot,CheckResult} from '../engine/types';
import {buildTaxonomy,dcOf,reviewDraftExportable,type Taxonomy,type TaxonEntry} from '../engine/checkTaxonomy';
import {noCapacity} from '../engine/checkPresentation';
import {summaryElements} from '../report/designSummary';
import {openItemGroups,ruleItem,type OpenGroup} from '../report/openItems';

/**
 * What the drawing sheets say about the calculation, from the calculation's own records: the taxonomy and open-item
 * groups the report prints (buildTaxonomy with the report's elements, openItemGroups), the integrity flags of each check
 * (noCapacity, geometry) and the statuses as calculate() leaves them. Never a check note: the stored drawing snapshots
 * strip them. Every D/C a sheet prints goes through sheetDc: NO CAPACITY for a part without capacity, NG above 1.00,
 * UNVERIFIED for a package whose analysis did not verify.
 */
interface SheetTaxonomy{tax:Taxonomy;element:Map<CheckResult,string>}
const cache=new WeakMap<CheckResult[],SheetTaxonomy>();
/** The report's taxonomy of a snapshot, with the element key of each check; computed once per check list. */
export function sheetTaxonomy(s:CalculationSnapshot):SheetTaxonomy{
 let v=cache.get(s.checks);
 if(!v){
  const tax=buildTaxonomy(s,summaryElements(s.input)),element=new Map<CheckResult,string>();
  for(const c of s.checks)element.set(c,tax.entries.get(c.id)?.element??'gates');
  v={tax,element};cache.set(s.checks,v);
 }
 return v;
}
/** The open items of a snapshot as the report groups them. */
export const sheetOpenGroups=(s:CalculationSnapshot)=>openItemGroups(sheetTaxonomy(s).tax,s).groups;

/**
 * A package whose analysis did not verify (reviewDraftExportable fails on an ineligible snapshot): no calculation is
 * issued for it, so no sheet may quote a result of it.
 */
export const blockedPackage=(s:CalculationSnapshot)=>!s.eligible&&!reviewDraftExportable(s);
/** The checks that block the package: the numerical verification (group Analysis) and any model outside the scope. */
export function verificationFailures(s:CalculationSnapshot){
 const ids=s.checks.filter(c=>(c.group==='Analysis'&&c.status!=='pass'&&c.status!=='not-applicable')||c.status==='unsupported').map(c=>c.id);
 return s.errors.length?[...ids,'INPUT ERRORS']:ids;
}
/** Where a sheet sends the reader for the checks: the calculation report, or the diagnostic report of a blocked package. */
export const calculationRef=(s:CalculationSnapshot)=>blockedPackage(s)?'SEE DIAGNOSTIC REPORT':'SEE CALCULATION REPORT';

/** A check's D/C for the sheets: Infinity for no capacity (the flag, or a stored sentinel), undefined without a ratio. */
export function checkDc(c:CheckResult){const v=dcOf(c);return v<0?undefined:v;}
/**
 * A D/C as the sheets print it: UNVERIFIED for a blocked package, NO CAPACITY for a part without capacity (infinite or
 * above 1000), "> 99 NG" for a finite ratio past what a sheet reads usefully, "x.xx NG" above 1.00, else "x.xx".
 */
export function sheetDc(s:CalculationSnapshot,u:number|undefined,digits=2,empty='-'){
 if(blockedPackage(s))return 'UNVERIFIED';
 if(u===undefined||Number.isNaN(u))return empty;
 if(!Number.isFinite(u)||noCapacity(u))return 'NO CAPACITY';
 if(u>99)return '> 99 NG';
 // Just past the limit reads with one more digit, never as 1.00 NG.
 const t=u>1+1e-9&&Number(u.toFixed(digits))<=1?u.toFixed(digits+1):u.toFixed(digits);
 return u>1+1e-9?`${t} NG`:t;
}
/** A check's own D/C as printed (a geometry conflict, which has no ratio, reads GEOMETRY CONFLICT). */
export const checkDcText=(s:CalculationSnapshot,c:CheckResult|undefined,digits=2)=>!c?'-':blockedPackage(s)?'UNVERIFIED':c.geometry?'GEOMETRY CONFLICT':c.status==='fail'&&checkDc(c)===undefined?'NG':sheetDc(s,checkDc(c),digits);

export interface RatedMax{dc:number;check:CheckResult}
/** An open item of an element as the sheets name it: the item's governing check, its D/C and how many more checks it holds. */
export interface FailingItem{group?:OpenGroup;check:CheckResult;dc?:number;rule:boolean;more:number}
export interface ElementSummary{
 checks:CheckResult[];
 /** Largest evaluated DESIGN D/C: strength (every effect but fatigue and, when asked for, movement), fatigue, movement. */
 strength?:RatedMax;fatigue?:RatedMax;movement?:RatedMax;
 /** Open items with a failing check: design failures, then detailing and fit rules (listed apart: a rule has no stress). */
 failing:FailingItem[];
 status:'pass'|'fail'|'open';
 /** The governing check: the worst failure, else the largest design D/C. */
 governing?:CheckResult;
}
export type ElementMatch=(c:CheckResult,element:string)=>boolean;
/** Checks of the report's elements (summaryElements keys), optionally with further ids. */
export const inElements=(keys:string[],also?:RegExp):ElementMatch=>(c,e)=>keys.includes(e)||!!also?.test(c.id);
const evaluated=(c:CheckResult)=>c.status==='pass'||c.status==='fail';
const larger=(a:RatedMax|undefined,c:CheckResult,dc:number)=>!a||dc>a.dc||(dc===a.dc&&c.status==='fail'&&a.check.status!=='fail')?{dc,check:c}:a;

/**
 * The checks of one element of the drawings (a tie, an end stop, a column base) as the calculation reports them: the
 * maxima over its evaluated DESIGN checks (taxonomy type design, gate evaluated: no detailing rule, no screened or
 * advisory fatigue ratio), and its open items with a failing check, each named by its governing check (openItemGroups).
 */
export function elementSummary(s:CalculationSnapshot,match:ElementMatch,o:{movement?:boolean}={}):ElementSummary{
 const {tax,element}=sheetTaxonomy(s),mine=(c:CheckResult)=>match(c,element.get(c)??'gates');
 const checks=s.checks.filter(mine),out:ElementSummary={checks,failing:[],status:'pass'};
 for(const c of checks){
  const t:TaxonEntry|undefined=tax.entries.get(c.id);
  if(!t||t.type!=='design'||t.gate!=='evaluated'||!evaluated(c))continue;
  const dc=checkDc(c);if(dc===undefined)continue;
  if(t.effect==='fatigue'||/fatigue|full-cycle/.test(c.id))out.fatigue=larger(out.fatigue,c,dc);
  else if(o.movement&&t.effect==='movement')out.movement=larger(out.movement,c,dc);
  else out.strength=larger(out.strength,c,dc);
 }
 const seen=new Set<CheckResult>();
 for(const g of sheetOpenGroups(s)){
  const members=g.members.filter(c=>c.status==='fail'&&mine(c));if(!members.length)continue;
  const gov=members.includes(g.governing)?g.governing:members[0];
  for(const m of members)seen.add(m);
  out.failing.push({group:g,check:gov,dc:ruleItem(g)?checkDc(gov):g.dc,rule:ruleItem(g),more:members.length-1});
 }
 // A failing check outside every open item (an advisory bound past its limit is not one): named on its own.
 for(const c of checks)if(c.status==='fail'&&!seen.has(c)&&tax.openItems.some(o=>o.check===c))out.failing.push({check:c,dc:checkDc(c),rule:tax.entries.get(c.id)?.type!=='design',more:0});
 out.failing.sort((a,b)=>Number(a.rule)-Number(b.rule)||(b.dc??-1)-(a.dc??-1));
 out.status=out.failing.length?'fail':checks.some(c=>['unverified','incomplete','unsupported'].includes(c.status))?'open':'pass';
 const design=[out.strength,out.fatigue,out.movement].filter((v):v is RatedMax=>!!v).sort((a,b)=>b.dc-a.dc);
 out.governing=out.failing[0]?.check??design[0]?.check;
 return out;
}
/**
 * A check as the drawings name it: its open item's title (a register detail by its type, "Flange saddle, end fillet
 * termination, across the flange"), else the check's title, with the separators as commas; never the internal id.
 */
export function sheetCheckName(c:Pick<CheckResult,'id'|'title'>,group?:Pick<OpenGroup,'title'>){
 return (group?.title||c.title||c.id).replace(/\s*·\s*all-cycle bound$/,'').replace(/\s*·\s*/g,', ');
}
/** "Edge distance 1.22", "Flange tie, flange local bending 2.69 (+3)", "End stop fit GEOMETRY CONFLICT": one open item as a sheet names it. */
export function failingText(s:CalculationSnapshot,f:FailingItem){
 const v=f.check.geometry?'GEOMETRY CONFLICT':blockedPackage(s)?'':f.dc===undefined?'':sheetDc(s,f.dc).replace(/ NG$/,'');
 return `${sheetCheckName(f.check,f.group)}${v?` ${v}`:''}${f.more?` (+${f.more})`:''}`;
}
/** Most open items a note names; the rest are counted. */
const listed=6;
const names=(s:CalculationSnapshot,v:FailingItem[])=>`${v.slice(0,listed).map(f=>failingText(s,f)).join(', ')}${v.length>listed?`, +${v.length-listed} MORE`:''}`;
/**
 * The failing items of an element in a note: "NG: flange-tie-flange 2.69, detail-fatigue-SA3 1.11 (+7); DETAILING NG:
 * tie-edge 0.92", or '' when nothing fails.
 */
export function failingNote(s:CalculationSnapshot,e:ElementSummary){
 const design=e.failing.filter(f=>!f.rule),rules=e.failing.filter(f=>f.rule);
 return [design.length?`NG: ${names(s,design)}`:'',rules.length?`DETAILING NG: ${names(s,rules)}`:''].filter(Boolean).join('; ');
}
/**
 * The summary of an element in a note: "MAX. D/C 2.69 NG STRENGTH, 1.11 NG FATIGUE; NG: ...", with the movement maximum
 * when it is rated apart. A blocked package reads "D/C UNVERIFIED".
 */
export function summaryNote(s:CalculationSnapshot,e:ElementSummary,o:{movement?:string;fatigueBelow?:string}={}){
 if(blockedPackage(s))return 'D/C UNVERIFIED';
 const parts=[e.strength?`${sheetDc(s,e.strength.dc)} STRENGTH`:'',e.movement?`${sheetDc(s,e.movement.dc)} ${o.movement??'MOVEMENT'}`:'',e.fatigue?`${sheetDc(s,e.fatigue.dc)} FATIGUE`:o.fatigueBelow??''].filter(Boolean);
 const fails=failingNote(s,e);
 return [parts.length?`MAX. D/C ${parts.join(', ')}`:'',fails].filter(Boolean).join('; ');
}

/**
 * The stamp in the title block of every sheet: "<g> OPEN ITEMS (<n> CHECKS) - SEE CALCULATION" with g the open items as
 * the report groups them and n their open checks, as the report counts them ("n open checks in g items"); for a blocked package "ANALYSIS NOT VERIFIED - NO CALCULATION ISSUED
 * - SEE DIAGNOSTIC REPORT" with the failed verification. Undefined when nothing is open.
 */
export function sheetStamp(s:CalculationSnapshot,short=false):{text:string;detail?:string;blocked:boolean}|undefined{
 if(blockedPackage(s)){
  const ids=verificationFailures(s);
  return {blocked:true,text:short?'ANALYSIS NOT VERIFIED - SEE DIAGNOSTIC':'ANALYSIS NOT VERIFIED - NO CALCULATION ISSUED - SEE DIAGNOSTIC REPORT',detail:ids.length?`FAILED VERIFICATION: ${ids.slice(0,4).join(', ').toUpperCase()}${ids.length>4?` (+${ids.length-4})`:''}`:undefined};
 }
 // An advisory recommendation not met (e.g. the TR-13 bracket guideline) is listed apart, not counted as a failed check.
 const {tax}=sheetTaxonomy(s),groups=sheetOpenGroups(s),failed=s.checks.filter(c=>c.status==='fail'&&tax.entries.get(c.id)?.gate!=='advisory').length;
 if(!groups.length&&!failed)return undefined;
 // The open checks counted as the report counts them ("n open checks in g items": every member of every item, failing,
 // incomplete or unverified), so the stamp and the report agree; the failing checks only where no item lists them.
 const g=groups.length,n=g?groups.reduce((a,v)=>a+v.members.length,0):failed;
 return {blocked:false,text:`${g} OPEN ITEM${g===1?'':'S'}${n?` (${n} CHECK${n===1?'':'S'})`:''} - SEE CALC${short?'':'ULATION'}`};
}
