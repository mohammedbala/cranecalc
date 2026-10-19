import type {CheckResult,ProjectInput} from './types';
import {emptyAistInputs} from './aistLoads';

type BuildingClass=NonNullable<ProjectInput['aist']>['buildingClass'];
/** TR-13 Table 1.1 load-cycle ranges of the building classes. */
export const classCycles:Record<BuildingClass,readonly [number,number]>={D:[0,20000],C:[20000,100000],B:[100000,500000],A:[500000,Infinity]};
const severity:Record<BuildingClass,number>={D:0,C:1,B:2,A:3};
/** The class whose Table 1.1 range holds n cycles; a count on a boundary takes the lighter class. */
export const classFromCycles=(n:number):BuildingClass=>n>500000?'A':n>100000?'B':n>20000?'C':'D';
/** Fatigue cycles of the project: the duty bins when a detailed spectrum is entered, else the single fatigue count. */
export const fatigueCycles=(p:ProjectInput)=>p.details?.spectrum.length?p.details.spectrum.reduce((n,b)=>n+b.cycles,0):p.fatigue.cycles;

/**
 * TR-13 Table 1.1 classification basis. UNVERIFIED against the published TR-13 (paywalled): Table 1.1 gives the
 * class by number of load cycles; whether only repetitions at or near the rated load count is not confirmed here.
 * Least-surprising rule: unless the project states that only full-load repetitions count ('full-load'), every
 * crane load cycle counts ('all-cycles'), i.e. the larger of the owner's repetitions and the fatigue cycles. The
 * class used for the class-dependent provisions (vertical deflection L/1000 for A and B, the §5.16 rail
 * provisions, the Appendix C inspection interval) is the more severe of the entered class and the counted one.
 */
export function buildingClassBasis(p:ProjectInput){
 const di=p.aist??emptyAistInputs,stated=!!di.classBasis,basis=di.classBasis??'all-cycles',fatigue=fatigueCycles(p);
 const counted=basis==='full-load'?di.buildingCycles:Math.max(di.buildingCycles,fatigue),implied=classFromCycles(counted);
 // Without a confirmed class and repetitions there is no classification to count (the check is incomplete).
 const classified=!!p.aist&&di.classConfirmed&&di.buildingCycles>0,entered=di.buildingClass,effective=classified&&severity[implied]>severity[entered]?implied:entered;
 return {basis,stated,counted,fatigue,repetitions:di.buildingCycles,implied,entered,effective,understated:classified&&severity[implied]>severity[entered]};
}
/**
 * One sentence, printed wherever the class is stated: the class and the TR-13 Table 1.1 counting basis behind it, with
 * the class the other count would give. UNVERIFIED wording of Table 1.1 (see buildingClassBasis).
 */
export function classBasisSentence(p:ProjectInput){
 const b=buildingClassBasis(p),n=(v:number)=>v.toLocaleString('en-US'),[lo,hi]=classCycles[b.implied],range=`${n(lo)} to ${Number.isFinite(hi)?n(hi):'more'} cycles`;
 const head=`Class ${b.effective}${b.effective!==b.implied?` (the entered class, more severe than the counted Class ${b.implied})`:''}`;
 if(b.basis==='full-load'){const all=classFromCycles(Math.max(b.repetitions,b.fatigue));
  return `${head}: TR-13 Table 1.1 classifies the building by its number of load cycles, and the project states that only repetitions of the rated load count, so the owner's ${n(b.repetitions)} full-load repetitions are counted (Class ${b.implied}, ${range})${all!==b.implied?`, where all ${n(Math.max(b.repetitions,b.fatigue))} crane load cycles would give Class ${all}`:''}.`;}
 const fullOnly=classFromCycles(b.repetitions);
 return `${head}: TR-13 Table 1.1 classifies the building by its number of load cycles, and no basis limiting the count to full-load repetitions is stated, so all ${n(b.counted)} crane load cycles are counted (Class ${b.implied}, ${range})${fullOnly!==b.implied?`, where the owner's ${n(b.repetitions)} full-load repetitions alone would give Class ${fullOnly}`:''}.`;
}
/** The class with its count for an input table: "B: all 400,000 load cycles counted (TR-13 Table 1.1); 30,000 full-load repetitions alone: Class C". */
export function classShort(p:ProjectInput){
 const b=buildingClassBasis(p),n=(v:number)=>v.toLocaleString('en-US'),other=classFromCycles(b.basis==='full-load'?Math.max(b.repetitions,b.fatigue):b.repetitions);
 return b.basis==='full-load'?`${b.effective}: ${n(b.repetitions)} full-load repetitions counted (TR-13 Table 1.1)${other!==b.implied?`; all ${n(Math.max(b.repetitions,b.fatigue))} load cycles: Class ${other}`:''}`
  :`${b.effective}: all ${n(b.counted)} load cycles counted (TR-13 Table 1.1)${other!==b.implied?`; ${n(b.repetitions)} full-load repetitions alone: Class ${other}`:''}`;
}
/** The class that governs the class-dependent provisions. */
export const effectiveBuildingClass=(p:ProjectInput)=>buildingClassBasis(p).effective;
export const severeClass=(k:BuildingClass)=>k==='A'||k==='B';

/** Class-dependent consequences, for notes. */
export function classConsequences(k:BuildingClass){
 return severeClass(k)?`Class ${k} provisions apply: vertical crane deflection L/1000 (TR-13 §5.8.7), the TR-13 §5.16 rail provisions for Class A and B (no hook bolts) and the TR-13 Appendix C runway inspection interval for Class ${k}.`
  :`Class ${k} provisions apply: vertical crane deflection L/600 (TR-13 §5.8.7) and the TR-13 Appendix C runway inspection interval for Class ${k}.`;
}

export function buildingClassCheck(p:ProjectInput):CheckResult{
 const di=p.aist??emptyAistInputs,b=buildingClassBasis(p),n=(v:number)=>v.toLocaleString('en-US'),[lo,hi]=classCycles[b.implied];
 if(!di.classConfirmed||!di.buildingCycles)return {id:'building-class',group:'Criteria',title:'AIST building classification',status:'incomplete',equation:'',referenceIds:['tr13-class'],note:'Enter owner building load repetitions and confirm the selected A–D building class. These classes differ from CMAA crane service classes and from fatigue stress fluctuations.'};
 const basisText=b.basis==='full-load'?`only repetitions of the rated (full) load count: N = ${n(b.repetitions)} owner full-load repetitions`
  :`every crane load cycle counts${b.stated?'':' (no classification basis stated)'}: N = max(${n(b.repetitions)} owner full-load repetitions, ${n(b.fatigue)} fatigue cycles) = ${n(b.counted)}`;
 const verdict=b.understated?`The entered Class ${b.entered} is lighter than the counted Class ${b.implied}: classify the building as Class ${b.implied}, or state that Table 1.1 counts only full-load repetitions for this building. The design uses Class ${b.effective}.`
  :`Specified Class ${b.entered}${b.entered!==b.implied?` (more severe than the counted Class ${b.implied})`:''}.`;
 const hiEntered=classCycles[b.entered][1],cap=Number.isFinite(hiEntered)?hiEntered:Math.max(b.counted,1);
 return {id:'building-class',group:'Criteria',title:'AIST building classification',status:b.understated?'fail':'pass',demand:b.counted,capacity:cap,quantity:'ratio',utilization:b.counted/cap,
  equation:'n_{SR}\\le N_{max}\\ \\ \\text{(TR-13 Table 1.1)}',referenceIds:['tr13-class','tr13-inspection'],
  note:`${classBasisSentence(p)} Basis: ${basisText}, Class ${b.implied} (${n(lo)}–${Number.isFinite(hi)?n(hi):'more'} cycles). ${verdict} ${classConsequences(b.effective)} A count on a class boundary permits the lighter class.`};
}

/** Stated cycle counts in the free-text duty sources, e.g. "1,000,000 wheel stress fluctuations". */
export function statedCycleCounts(text:string){
 const out:number[]=[];
 for(const m of text.matchAll(/(\d{1,3}(?:,\d{3})+|\d{4,})\s+(?:[A-Za-z-]+\s+){0,3}(?:cycles|fluctuations)\b/gi))out.push(Number(m[1].replaceAll(',','')));
 return out;
}
/** One fatigue cycle count throughout: the fatigue input, the duty bins and every stated count in the duty sources. */
export function fatigueCycleCheck(p:ProjectInput,families:{label:string;cycles:number;groups:number}[]=[]):CheckResult{
 const N=fatigueCycles(p),n=(v:number)=>v.toLocaleString('en-US');
 const sources:[string,string|undefined][]=[['fatigue cycle basis (aist.cycleSource)',p.aist?.cycleSource],['cap duty source (capDesign.dutySource)',p.section.kind==='cap'?p.capDesign?.dutySource:undefined],['fatigue detail (fatigue.detail)',p.fatigue.detail]];
 const stated=sources.flatMap(([label,text])=>text?statedCycleCounts(text).map(v=>({label,v})):[]);
 const conflicts=[...stated.filter(s=>s.v!==N),...(p.fatigue.cycles!==N?[{label:'fatigue.cycles',v:p.fatigue.cycles}]:[])];
 return {id:'fatigue-cycles',group:'Criteria',title:'One fatigue cycle count throughout',status:conflicts.length?'fail':'pass',equation:'n_{SR}=\\sum n_i',referenceIds:['tr13-class','criteria'],
  note:conflicts.length?`The fatigue checks use N = ${n(N)} cycles${p.details?.spectrum.length?` (sum of the ${p.details.spectrum.length} duty bins)`:''}, but ${conflicts.map(c=>`the ${c.label} states ${n(c.v)}`).join('; ')}. Correct the source text or the duty spectrum so one count is used throughout.`
   :`Fatigue checks, duty bins${stated.length?' and the stated duty sources':''} all use N = ${n(N)} crane passages${families.length?`: one stress cycle per passage at the girder, its connections and supports; at the wheel-local details each wheel group passing is a cycle (AISC DG7 and AIST TR-13 cycle counting), n = N × wheel groups: ${families.map(f=>`${f.label} ${n(f.cycles)} (${f.groups} group${f.groups>1?'s':''})`).join(', ')}`:''}.`};
}
