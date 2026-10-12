import type {CalculationSnapshot,CheckResult,ProjectInput} from './types';
import type {FatigueDetailResult} from './runwayDetails';
import {columnStiffenerGeometry} from './columnStiffeners';
import {connectionCoordination} from './connectionCoordination';
import {caseName} from './caseNames';

/**
 * Check taxonomy: what each computed result is, whether it applies, which results repeat or say the same thing, and
 * which ones the calculation body shows. Nothing here changes an engine value: every result is kept, classified and
 * listed in Appendix A and the CSV; the body shows the governing DESIGN checks.
 *
 * Types (exactly one per check):
 * - design: strength, serviceability, movement capacity and fatigue. Only these count toward the check total and the
 *   governing D/C.
 * - detailing: edge/end distances, spacing, slot and hole geometry, minimum/maximum welds, washers, wrench and nut
 *   clearances, plate and bearing fit, minimum thickness, KL/r, J10.8 stiffener proportions, model clashes. Pass/fail.
 * - classification: compact/noncompact/slender and applicability tests that feed a strength check (incl. F13.1).
 * - verification: solver equilibrium and refinement.
 * - input: recorded inputs and survey/supplier data, criteria and input-consistency tests.
 * - load-basis: supplied load against the code minimum.
 * - by-others: required but outside this package.
 *
 * New checks from the engine flow through by id/group pattern; one that matches no rule falls to a default chosen
 * from its group and quantity and is marked rule 'default' (a test fails if any fixture check lands there).
 */
/**
 * A review draft may be exported while open items are only missing data ('unverified' / 'incomplete' checks, which make
 * a snapshot ineligible): the analysis ran and verified, nothing is unsupported and there are no input errors. The
 * report then says REVIEW DRAFT and lists the open items on page 1. Issued reports still require eligibility.
 */
export function reviewDraftExportable(s:CalculationSnapshot){
 if(s.eligible)return true;
 return !s.errors.length&&!!s.analysis&&!!s.properties&&!!s.detailResults&&s.input.scope==='design'
  &&s.checks.filter(c=>c.group==='Analysis').every(c=>c.status==='pass')&&!s.checks.some(c=>c.status==='unsupported');
}
export type CheckType='design'|'detailing'|'classification'|'verification'|'input'|'load-basis'|'by-others';
export type Effect='axial'|'flexure'|'shear'|'local'|'movement'|'connection'|'fatigue'|'stability'|'other';
export const checkTypeLabel:Record<CheckType,string>={design:'Design',detailing:'Detailing',classification:'Classification',verification:'Verification',input:'Input',
 'load-basis':'Load basis','by-others':'By others'};
export const effectLabel:Record<Effect,string>={axial:'Axial',flexure:'Flexure / combined',shear:'Shear',local:'Local web / flange',movement:'Deflection / movement',
 connection:'Connection',fatigue:'Fatigue',stability:'Stability / bracing',other:'Other'};

interface Rule{re:RegExp;type:CheckType;effect?:Effect;owner?:boolean}
const D=(re:RegExp,effect:Effect,owner?:boolean):Rule=>({re,type:'design',effect,owner});
const T=(re:RegExp,type:Exclude<CheckType,'design'>):Rule=>({re,type});
/**
 * The explicit classification table, by check id. First match wins; group rules follow in groupRules.
 * Keep ids anchored; prefixes (haunch-, wbracket-, bracket-, cap-angle-, end-bearing-, end-stop-) are matched
 * through the shared suffix rules where the limit state is the same.
 */
const idRules:Rule[]=[
 // Verification
 T(/^(design-|detail-)?(equilibrium|convergence|mesh|travel)$/,'verification'),
 // Load basis: supplied load against the code minimum
 T(/^crane-\d+-(split|impact|side|traction|bumper)$/,'load-basis'),T(/^(load-basis|design-scope)$/,'load-basis'),
 // Inputs and input consistency (crane statics, cycle count, class), survey and material records
 T(/^crane-\d+-(statics|data|bumper-selection)/,'input'),T(/^(building-class|fatigue-cycles)$/,'input'),
 T(/^cap-(catalogue|compression-components|material|duty|fitup|unperforated|stiffener-cjp)$/,'input'),
 T(/^column-(basis|weld-base-metal|weld-ce|weld-preheat|weld-load|frame|longitudinal-path)$/,'input'),
 // The bracket and tie load-path statement is a scope record; it is by others only when excluded (status rule above).
 T(/^(brace-basis|bracket-receiver|bracket-load-path|haunch-stiffener-required|building-seismic-runway)$/,'input'),
 T(/-(basis|receiver|survey)$/,'input'),
 // By others
 T(/^(supporting-structure|brace-by-others)$/,'by-others'),T(/-by-others$/,'by-others'),
 // Classification: section/element slenderness, applicability tests feeding a strength check, F13.1 capacity modifier
 T(/^(compact-flange|compact-web|cap-proportion|flange-net|column-brackets|hook-bolts)$/,'classification'),
 T(/^cap-angle-plate-slenderness$/,'detailing'),T(/(-slenderness|-slope)$/,'classification'),T(/^cap-angle-column-holes$/,'classification'),T(/^end-stop-stiffener$/,'classification'),
 T(/-tr13-load$/,'classification'),T(/^cap-angle-stiffener$/,'detailing'),
 // Fatigue (design)
 D(/^detail-(fatigue|full-cycle)-/,'fatigue'),D(/fatigue|^rail-keeper-root$/,'fatigue'),
 // Movement capacity (design)
 D(/^(rotation-clearance|simple-guide-travel|rail-expansion-gap|rail-joint-slot|end-bearing-travel)$/,'movement'),
 D(/(slot-travel|-deflection|-rotation|-drift(-wind)?|rail-gauge)$/,'movement'),
 D(/^rail-twist$/,'movement',true),D(/^(vertical|lateral|rail-head)$/,'movement'),
 D(/-plate-movement$/,'axial'),
 // Detailing: dimensions, sizes, fit and clearances
 T(/^(minimum-thickness|rail-clips|camber|stiffener-width|stiffener-thickness|simple-joint-gap|rail-end-gap|rail-keeper-float|rail-joint-fit)$/,'detailing'),
 T(/(-edge|-spacing|-pitch|-ligament|-slot-end|-slot-toe|-weld-min|-weld-minimum|-weld-max|-weld-maximum|-weld-size|-weld-length)$/,'detailing'),
 T(/(-wrench|-wrench-[a-z-]+|-nut-[a-z]+|-washer|-washer-(fit|bottom|stiffener)|-fit|-clear|-shim-max|-sleeve-length|-contact|-width|-proportions|-colstiff-length|-lap-nut-clear)$/,'detailing'),
 T(/^(cap-development-length|cap-rail-footprint|haunch-colstiff-weld-minimum)$/,'detailing'),
 T(/^cap-angle-plate-slenderness$/,'detailing'),
 // Design: strength and serviceability, by effect
 D(/^(cap-weld-(strength|metal|rupture)|rail-joint-plate|end-stop-bearing-(base|flange)|cap-development(-full-force)?)$/,'connection'),
 D(/^(axial|column-axial|brace-tension|brace-rod)$|-(plate-yield|plate-rupture|plate-compression|leg-tension|tension)$/,'axial'),
 D(/^(shear|torsion-shear|column-shear|haunch-shear|haunch-flange-shear)$|-(shear|shear-rupture|web-shear)$/,'shear'),
 D(/^(wheel-yield|wheel-cripple|wheel-web-tr13|sidesway|rail-web|rail-flange-local|haunch-seat-strip|stiffener-lateral-flexure)$/,'local'),
 D(/-(web-yielding|web-crippling|column-yield-top|column-yield-bottom|column-crippling|column-sidesway|column-flange|column-panel|channel-flange|leg-prying|endplate-prying|web|base-prying|flange-prying|seat-prying)$/,'local'),
 D(/^(stiffener-column|stiffener-bearing)$|-stiffener-(column|bearing)$|-colstiff-(upper|lower)$/,'local'),
 D(/^(brace-member|brace-stiffness|torsion-stability|flexure-load-height|end-stop-girder|end-stop-uplift)$/,'stability'),
 D(/^(major|minor|combined|combined-bottom|torsion-normal|torsion-normal-bottom|column-flexure|column-flexure-y|column-interaction|column-torsion|rail-flexure|bearing-plate|cap-angle-heel|building-seismic-alteration)$/,'flexure'),
 D(/-(flexure|interaction|combined|bottom-flange|top-flange|top-flange-net|face|face-outstand|bending|heel)$/,'flexure'),
 D(/(weld|cjp|-web-base|slip|bolts?|bolt-shear|bolt-tension|bearing|block|-net|sleeve|anchor-bearing|hold-down-model|-uplift|locating-[a-z]+|sliding|cap-development|col-bolt|cap-bolt|shim-bearing)$/,'connection'),
];
/** Group fallbacks for checks no id rule names. */
const groupRules:[RegExp,CheckType,Effect?][]=[
 [/^Analysis$/,'verification'],[/^Loading$/,'load-basis'],[/^(Criteria|Crane input|Bumper selection)$/,'input'],
 [/^(Coordination|Detailing)$/,'detailing'],[/^Supporting structure$/,'by-others'],[/^Fatigue$/,'design','fatigue'],[/^Serviceability$/,'design','movement'],
];
export interface Classification{type:CheckType;effect?:Effect;owner:boolean;rule:'id'|'group'|'status'|'default'}
/** The type of one check (and, for DESIGN, the force effect it governs). */
export function classifyCheck(c:CheckResult):Classification{
 if(c.group==='Coordination')return {type:'detailing',owner:false,rule:'group'};
 if(c.status==='excluded')return {type:'by-others',owner:false,rule:'status'};
 const r=idRules.find(v=>v.re.test(c.id));
 if(r)return {type:r.type,effect:r.type==='design'?r.effect??'other':undefined,owner:!!r.owner,rule:'id'};
 const g=groupRules.find(([re])=>re.test(c.group));
 if(g)return {type:g[1],effect:g[2],owner:false,rule:'group'};
 // Default: a dimensional rule is detailing; anything with a demand and capacity is a design check; else a record.
 if(c.quantity==='length')return {type:'detailing',owner:false,rule:'default'};
 if(c.demand!==undefined&&c.capacity!==undefined)return {type:'design',effect:'other',owner:false,rule:'default'};
 return {type:'input',owner:false,rule:'default'};
}

// ---------------------------------------------------------------- gates
export type Gate='evaluated'|'screened'|'not-applicable'|'advisory'|'modifier';
export const gateLabel:Record<Gate,string>={evaluated:'Evaluated',screened:'Screened',  'not-applicable':'Not applicable',advisory:'Advisory',modifier:'Capacity modifier'};
const ksi=6.894757293168,inch=25.4;
/** AISC 360-16 Table A-3.1 thresholds F_TH (ksi) and constants C_f (×10⁸ ksi³) by category; F uses its own curve. */
const categories:Record<string,{th:number;cf:number}>={A:{th:24,cf:250},B:{th:16,cf:120},'B′':{th:12,cf:61},C:{th:10,cf:44},'C′':{th:12,cf:44},D:{th:7,cf:22},E:{th:4.5,cf:11},'E′':{th:2.6,cf:3.9},
 F:{th:8,cf:0},bolt:{th:7,cf:3.9}};
const normalCategory=(c:string)=>({B1:'B′',E1:'E′',"B'":'B′',"C'":'C′',"E'":'E′','E-prime':'E′','B-prime':'B′','C-prime':'C′'} as Record<string,string>)[c]??c;
/** All-cycle allowable range (MPa) without threshold credit, for a category at n cycles. */
export function allCycleRange(category:string,n:number){
 const k=normalCategory(category);if(k==='F')return 690*(1.5/n)**.167;
 const v=categories[k];return v?((v.cf*1e8)/n)**(1/3)*ksi:NaN;
}
/**
 * A fatigue category as AISC 360-16 Table A-3.1 prints it: C″ (root crack, with R_FIL), E′; high-strength bolts and
 * threaded rods in tension by their item, 8.5. Display only: the category keys stay as stored.
 */
export function categoryLabel(category:string,title=''){
 const c=category.replace(/-double-prime|''|′′/,'″').replace(/-prime|'/,'′');
 if(c==='C″')return 'C″ (root, R_FIL)';
 if(c==='bolt'||c==='—'){const item=title.match(/item\s+(\d+\.\d+)/i)?.[1];return item?`item ${item}`:c==='bolt'?'item 8.5':'—';}
 return c;
}
export const thresholdOf=(category:string)=>{const v=categories[normalCategory(category)];return v?v.th*ksi:NaN;};
export interface FatigueData{range:number;threshold:number;category:string;miner?:number;allCycle?:number;location?:string;source:string}
const haunchKeys:Record<string,string>={'top-flange':'topFlange','bottom-flange':'bottomFlange','flange-web':'flangeWeb','stiffener-toe':'stiffenerToe',flare:'flare',column:'column'};
const parseCategory=(note:string)=>{
 const m=note.match(/Category\s+([A-F](?:-double-prime|-prime|′′|′|''|')?)/i)??note.match(/\bcategory\s+([A-F]\d?)\b/i);
 if(!m)return undefined;const c=m[1].toUpperCase();
 if(/-DOUBLE-PRIME$|''$|′′$/.test(c))return `${c[0]}''`;
 return /-PRIME$|'$|′$/.test(c)?`${c[0]}′`:c;
};
/** Total fatigue cycles: the duty spectrum where one is entered, else the project count. */
export function fatigueCycles(s:CalculationSnapshot){const sp=s.input.details?.spectrum??[];return sp.length?sp.reduce((a,v)=>a+v.cycles,0):s.input.fatigue.cycles;}
/**
 * The largest live-load stress range, threshold and category of a fatigue check, from the register point, the
 * detail results or the check itself. Undefined when it cannot be established; the check is then evaluated.
 */
export function fatigueData(s:CalculationSnapshot,c:CheckResult):FatigueData|undefined{
 const n=fatigueCycles(s),r=s.detailResults;
 const reg=c.id.match(/^detail-(?:fatigue|full-cycle)-(.+)$/);
 if(reg&&r){const f=r.fatigue.find(v=>v.id===reg[1]) as (FatigueDetailResult&{threshold?:number})|undefined;if(!f)return undefined;
  const cat=normalCategory(f.category);return {range:f.range,threshold:f.threshold??thresholdOf(cat),category:cat,miner:f.damage,allCycle:f.range/allCycleRange(cat,n),location:`${f.name} at x = ${(f.x/304.8).toFixed(1)} ft`,source:'register'};}
 const note=c.note??'';
 // An explicit threshold in the note (bolts: F_TH = 7 ksi).
 const th=note.match(/F_?TH\s*=\s*(\d+(?:\.\d+)?)\s*(ksi|MPa)/);
 let cat=parseCategory(note);
 const haunch=c.id.match(/^(haunch|wbracket|bracket)-fatigue-(top-flange|bottom-flange|flange-web|stiffener-toe|flare|column)$/);
 if(haunch&&haunch[1]==='haunch'&&r?.taperedHaunch){
  const key=haunchKeys[haunch[2]],range=Math.max(0,...r.taperedHaunch.fatigue.map(v=>(v as unknown as Record<string,number>)[key]??0));
  const k=cat??'C';return {range,threshold:thresholdOf(k),category:k,miner:c.utilization,allCycle:range/allCycleRange(k,n),source:'haunch results'};
 }
 const cs=c.id.match(/^haunch-colstiff-fatigue-(plate|toe)$/);
 if(cs&&r?.taperedHaunch){
  const F=r.taperedHaunch.fatigue;
  if(cs[1]==='toe'){const range=Math.max(0,...F.map(v=>v.column));return {range,threshold:thresholdOf('C'),category:'C',miner:c.utilization,allCycle:range/allCycleRange('C',n),source:'haunch results'};}
  const g=columnStiffenerGeometry(s.input);
  if(g){const range=Math.max(0,...F.map(v=>Math.max(v.stiffUpper??0,v.stiffLower??0)))/(g.contact*g.t),rf=note.match(/R_FIL\s*=\s*(\d+(?:\.\d+)?)/),R=rf?Number(rf[1]):1;
   return {range,threshold:R*thresholdOf('C'),category:rf?"C''":'C',miner:c.utilization,allCycle:range/(R*allCycleRange('C',n)),source:'haunch results'};}
 }
 if(c.quantity!=='stress'||c.demand===undefined||c.capacity===undefined)return undefined;
 // All-cycle checks: the demand is the largest range. Root cracks (C'', R_FIL): threshold R·F_TH,C with R from the note
 // or from the allowable against the plain Category C curve.
 const rfil=note.match(/R_FIL\s*=\s*(\d+(?:\.\d+)?)/);
 if(cat==="C''"||(!cat&&rfil)){const R=rfil?Number(rfil[1]):c.capacity/allCycleRange('C',n);return {range:c.demand,threshold:R*thresholdOf('C'),category:"C''",allCycle:c.utilization,source:'check'};}
 if(th){const v=Number(th[1])*(th[2]==='ksi'?ksi:1);return {range:c.demand,threshold:v,category:cat??(/bolt/i.test(c.title)?'bolt':'—'),allCycle:c.utilization,source:'check'};}
 // No category stated: the one whose all-cycle curve gives the check's allowable.
 if(!cat)cat=Object.keys(categories).filter(k=>k!=='bolt').find(k=>Math.abs(allCycleRange(k,n)/c.capacity!-1)<1.5e-2);
 if(!cat||!categories[normalCategory(cat)])return undefined;
 cat=normalCategory(cat);return {range:c.demand,threshold:thresholdOf(cat),category:cat,allCycle:c.utilization,source:'check'};
}
/** Peak-stress limits (Appendix 3.1, 0.66Fy) accompany the fatigue checks; they are not stress-range checks. */
const isPeak=(id:string)=>/^fatigue-peak/.test(id);

export interface GateResult{gate:Gate;reason?:string}
/** The project's governing fatigue method: Miner's sum over the duty bins (default) or the all-cycle bound. */
export const fatigueMethod=(p:ProjectInput)=>p.fatigue.method??'miner';
const j10Required=(s:CalculationSnapshot,prefix:string,column:boolean)=>{
 if(column){
  // Column stiffeners: J10.1–J10.4 require them where the unstiffened column carries less than R_u (R_st > 0).
  const notes=s.checks.filter(v=>new RegExp(`^${prefix}-colstiff-(upper|lower)$`).test(v.id)).map(v=>v.note);
  const rst=notes.flatMap(t=>[...t.matchAll(/R_st\s*=\s*(\d+(?:\.\d+)?)/g)].map(m=>Number(m[1])));
  return rst.length?rst.some(v=>v>0):true;
 }
 const web=s.checks.filter(v=>new RegExp(`^${prefix}-web-(yielding|crippling)$`).test(v.id));
 return web.length?web.some(v=>v.status==='fail'||(v.utilization??0)>1):true;
};
/** Gate of one check from the current inputs and results; never hard-coded to a project. */
export function gateCheck(s:CalculationSnapshot,c:CheckResult,k:Classification=classifyCheck(c)):GateResult{
 const p=s.input;
 if(c.status==='not-applicable')return {gate:'not-applicable',reason:firstSentence(c.note)||'Not applicable to this arrangement.'};
 if(c.id==='cap-angle-column-holes'||/F13\.1/.test(c.title)&&k.type==='classification')
  return {gate:'modifier',reason:`AISC F13.1 test ${c.status==='fail'||(c.utilization??0)>1?'NOT MET: the member flexural strength uses F13-1':'met: holes do not reduce the member flexural strength'}. A capacity modifier, not a check.`};
 if(k.owner&&!(c.capacity!==undefined&&Number.isFinite(c.capacity)&&c.capacity>0))return {gate:'not-applicable',reason:'Owner criterion not provided; not checked.'};
 // J10.8 stiffener proportions only where J10.1–J10.4 require the stiffeners.
 const j108=c.id.match(/^(.+?)-(stiffener-proportions|colstiff-proportions|colstiff-length)$/);
 if(j108&&!j10Required(s,j108[1],j108[2]!=='stiffener-proportions'))
  return {gate:'advisory',reason:'AISC J10.8 proportions apply to stiffeners required by J10.1–J10.4; these are not required (the unstiffened web carries the force), so the proportions are advisory.'};
 // J2.2b maximum fillet: fillets along edges of material only, not T-joints.
 if(/-weld-max(imum)?$/.test(c.id)&&(/T-joint/i.test(c.note)||/^((haunch|wbracket|bracket)-)?(stiffener|flange-web|web)-weld-max(imum)?$/.test(c.id)))
  return {gate:'not-applicable',reason:'AISC J2.2b maximum fillet size applies to fillets along edges of material; this fillet is in a T-joint.'};
 // Full channel-force development at cap ends: partial-length caps only.
 if((/full channel force/i.test(c.title)||/^cap-development-(full-force|length)$/.test(c.id))&&p.capDesign?.fullLength)
  return {gate:'not-applicable',reason:'Full channel-force development applies at the ends of partial-length caps; this cap runs the full girder length and ends at the supports, where the moment is negligible.'};
 if(k.effect==='fatigue'&&!isPeak(c.id)){
  const n=fatigueCycles(s);
  if(n<2e4)return {gate:'screened',reason:`Live-load cycles ${n.toLocaleString('en-US')} < 20,000 (AISC 360-16 Appendix 3.1): fatigue need not be evaluated.`};
  const f=fatigueData(s,c);
  if(f&&f.range<f.threshold)return {gate:'screened',reason:`Below threshold: largest range ${(f.range/ksi).toFixed(2)} ksi < F_TH ${(f.threshold/ksi).toFixed(2)} ksi (Category ${categoryLabel(f.category)}, AISC 360-16 Appendix 3.1).`};
 }
 return {gate:'evaluated'};
}
function firstSentence(v:string){const m=v.match(/^.{10,200}?[.;](\s|$)/);return (m?m[0]:v.slice(0,160)).trim();}

// ---------------------------------------------------------------- repeats and merges
/** Register points of one detail family (keepers, cap weld base metal, cap ends, holes) share geometry and category. */
/** Register points of one family: same prefix (RC keepers, CW cap weld, CE cap ends, CA/SH holes), category and detail. */
export function registerFamily(s:CalculationSnapshot,id:string){
 const m=id.match(/^detail-(?:fatigue|full-cycle)-(.+)$/),f=m&&s.detailResults?.fatigue.find(v=>v.id===m[1]);if(!f)return undefined;
 return `register:${f.id.match(/^[A-Z]+/)?.[0]??f.id}|${f.category}|${familyTitle(f.name)}`;
}
/** Named fatigue checks of one detail: the haunch (bracket) flanges at their welds to the column, top and bottom. */
const fatigueDetailKey=(id:string)=>id.replace(/^(haunch|wbracket|bracket)-fatigue-(top|bottom)-flange$/,'$1-fatigue-flanges');
const fatigueDetailTitle:Record<string,string>={'haunch-fatigue-flanges':'Haunch flanges at the column welds (top and bottom)'};
const familyTitle=(name:string)=>name.replace(/\s+\d+\b/,'').replace(/,\s*bay \d+.*?(?=·|$)/,'').replace(/\s*·\s*(left|right|channel flange (left|right))\b/,'').replace(/\s*·\s*all-cycle bound$/,'').replace(/\s+(front|back) row/,'').trim();
interface MergeDef{key:string;title:string;re:RegExp;prefer?:RegExp;effect?:Effect;/** Always shown in the body, governing or not (the member's flexural strength). */always?:boolean}
/**
 * Redundant checks reported as one line, the controlling limit state named: one combined-action check and one LTB
 * check per member, one line per bolt group, stiffener set and weld group, one line for the rail joint.
 */
export const mergeDefs:MergeDef[]=[
 {key:'girder-combined',title:'Combined actions at each flange: AISC H1 with the DG7 flange lateral moment, and normal stress with warping (top and bottom flange)',re:/^(combined|combined-bottom|minor|torsion-normal|torsion-normal-bottom)$/},
 {key:'girder-ltb',effect:'flexure',title:'Major flexure and lateral-torsional buckling with load height (AISC F2 / F4, Cb from the elastic buckling analysis)',re:/^(major|flexure-load-height|torsion-stability)$/,prefer:/^flexure-load-height$/,always:true},
 {key:'girder-shear',title:'Web shear including Saint-Venant and warping shear',re:/^(shear|torsion-shear)$/,prefer:/^shear$/},
 {key:'wheel-local',title:'Web local yielding and crippling under the wheel (TR-13 §5.8.6 bearing length, J10.2, J10.3)',re:/^(wheel-yield|wheel-cripple|wheel-web-tr13)$/},
 {key:'girder-stiffeners',effect:'local',title:'Girder bearing stiffeners (column buckling, fitted bearing, welds)',re:/^(stiffener-column|stiffener-bearing|stiffener-weld|stiffener-combined-weld|stiffener-lateral-flexure)$/},
 {key:'bearing-plate',title:'Bearing plate and contact',re:/^(bearing-plate|bearing-contact|hold-down-model)$/},
 {key:'end-bearing-bolts',effect:'connection',title:'End bearing bolt group (slip, shear, tension, bearing/tearout)',re:/^end-bearing-(locating-slip|locating-shear|locating-tension|flange-bearing|plate-bearing|seat-bearing|sliding)$/},
 {key:'end-bearing-sleeves',effect:'connection',title:'End bearing sleeves and plate washers',re:/^end-bearing-(sleeve|sleeve-bearing|washer-bending)$/},
 {key:'end-bearing-prying',title:'End bearing plies · thickness for no prying (ratio t_min/t)',re:/^end-bearing-(flange-prying|seat-prying)$/},
 {key:'haunch-stiffeners',effect:'local',title:'Haunch bearing stiffeners (column buckling, fitted bearing, welds)',re:/^haunch-stiffener-(column|bearing|weld)$/},
 {key:'haunch-column-welds',effect:'connection',title:'Haunch-to-column welds (flange CJPs, web fillets, connected metal)',re:/^haunch-(top-flange-cjp|bottom-flange-cjp|web-weld|web-base)$/},
 {key:'haunch-web-local',title:'Haunch web local yielding and crippling (J10.2, J10.3)',re:/^haunch-web-(yielding|crippling)$/},
 {key:'haunch-column-local',title:'Column web and flange local effects at the haunch (J10.1–J10.4, J10.6)',re:/^haunch-column-(flange|yield-top|yield-bottom|crippling|sidesway|panel)$/},
 {key:'column-stiffeners',effect:'local',title:'Column stiffeners at the haunch (strength, welds, web shear)',re:/^haunch-colstiff-(upper|lower|flange-weld|web-weld|web-shear)$/},
 {key:'cap-welds',effect:'connection',title:'Cap channel welds (shear flow, connected metal)',re:/^cap-weld-(strength|metal|rupture)$/},
 {key:'cap-angle-lap-bolts',effect:'connection',title:'Cap tie lap bolt group (slip, shear, tension, bearing/tearout)',re:/^cap-angle-lap-(slip|shear|tension|bearing)$/},
 {key:'cap-angle-cap-bolts',effect:'connection',title:'Cap tie cap bolts · tension with prying (bolts, angle leg, channel flange)',re:/^cap-angle-(cap-bolt|leg-prying|channel-flange)$/,prefer:/^cap-angle-cap-bolt$/},
 {key:'cap-angle-col-bolts',effect:'connection',title:'Cap tie column bolts · tension with prying (bolts, end plate, column flange)',re:/^cap-angle-(col-bolt|endplate-prying|column-flange)$/,prefer:/^cap-angle-col-bolt$/},
 {key:'cap-angle-plate',effect:'axial',title:'Cap tie plate · tension, compression and block shear',re:/^cap-angle-(plate-yield|plate-rupture|plate-compression|block|leg-tension)$/},
 {key:'cap-angle-sleeves',effect:'connection',title:'Cap tie sleeves and plate washers',re:/^cap-angle-(sleeve|sleeve-bearing|washer-bending)$/},
 {key:'end-stop-bolts',effect:'connection',title:'End stop bolt group (tension, shear, slip, bearing/tearout)',re:/^end-stop-(bolt-tension|bolt-shear|slip|bearing-base|bearing-flange)$/},
 {key:'end-stop-welds',effect:'connection',title:'End stop welds',re:/^end-stop-(weld|stiffener-weld)$/},
 {key:'end-stop-prying',title:'End stop plies · thickness for no prying (ratio t_min/t)',re:/^end-stop-(base-prying|flange-prying)$/},
 {key:'end-stop-body',title:'End stop body and face plate',re:/^end-stop-(flexure|shear|face|face-outstand)$/},
 {key:'rail-joint',effect:'connection',title:'Rail joint (bars and bolts)',re:/^rail-joint-(bolts|bearing|net|plate|block)$/},
 {key:'rail-keepers',effect:'connection',title:'Rail keepers (lip, shear, welds)',re:/^rail-keeper-(flexure|shear|weld)$/},
 {key:'rail-anchor',effect:'connection',title:'Rail anchor (welds, notch bearing)',re:/^rail-anchor-(weld|bearing)$/},
 {key:'fatigue-peak',title:'Peak elastic stress (AISC Appendix 3.1, 0.66Fy)',re:/^fatigue-peak(-detailed)?$/},
];

export interface TaxonEntry{check:CheckResult;type:CheckType;effect?:Effect;owner:boolean;rule:Classification['rule'];gate:Gate;reason?:string;
 element:string;elementLabel:string;repeat?:string;typicalOf:number;governsRepeat:boolean;line?:string;location?:string}
export interface BodyLine{key:string;title:string;element:string;elementLabel:string;effect:Effect;members:CheckResult[];controlling:CheckResult;also:CheckResult[];merged:boolean;owner:boolean}
export interface FatigueRow{key:string;title:string;element:string;category:string;location:string;range?:number;threshold?:number;miner?:number;allCycle?:number;dc?:number;
 gate:Gate;reason?:string;typicalOf:number;members:CheckResult[];governing:CheckResult}
export interface ElementDef{key:string;label:string;step?:number;match:(c:CheckResult)=>boolean}
export interface OpenItem{kind:'clash'|'redesign'|'input'|'detailing';check:CheckResult}
export interface Taxonomy{
 entries:Map<string,TaxonEntry>;lines:BodyLine[];shown:BodyLine[];
 elements:{key:string;label:string;step?:number;shown:BodyLine[];others:{count:number;max?:number}}[];
 fatigue:{method:'miner'|'all-cycle';cycles:number;rows:FatigueRow[];evaluated:FatigueRow[];screened:FatigueRow[];peak?:BodyLine};
 detailing:{evaluated:TaxonEntry[];flagged:{entry:TaxonEntry;reason:string}[];satisfied:number;gated:TaxonEntry[]};
 counts:{total:number;byType:Record<CheckType,number>;designEvaluated:number;designShown:number;designScreened:number;designNotApplicable:number;detailing:number;detailingFlagged:number};
 openItems:OpenItem[];byOthers:TaxonEntry[];governing?:{title:string;dc:number;check:CheckResult;element:string};
 /** The engineering name of a case id (combination and crane position), for printed tables; ids stay in the CSV. */
 caseName:(id:string|undefined)=>string;
}
const defaultElements:ElementDef[]=[{key:'all',label:'Checks',match:()=>true}];
const dcOf=(c:CheckResult)=>c.utilization!==undefined&&Number.isFinite(c.utilization)?c.utilization:-1;
const pick=(v:CheckResult[])=>v.reduce((a,b)=>(b.status==='fail'?1e9:0)+dcOf(b)>(a.status==='fail'?1e9:0)+dcOf(a)?b:a,v[0]);
export const openStatuses:CheckResult['status'][]=['fail','unverified','incomplete','unsupported'];
const fitRule=(c:CheckResult)=>c.group==='Coordination'||/(-fit|-clear|-float|-contact|-endplate-edge)$/.test(c.id);

/** Classify, gate, group and merge every check of a snapshot, and select the calculation body. */
export function buildTaxonomy(s:CalculationSnapshot,elementDefs:ElementDef[]=defaultElements):Taxonomy{
 const entries=new Map<string,TaxonEntry>(),method=fatigueMethod(s.input),cycles=fatigueCycles(s);
 const elementOf=(c:CheckResult)=>elementDefs.find(e=>e.match(c))??elementDefs[elementDefs.length-1];
 for(const c of s.checks){
  const k=classifyCheck(c),g=gateCheck(s,c,k),el=elementOf(c);
  entries.set(c.id,{check:c,type:k.type,effect:k.effect,owner:k.owner,rule:k.rule,gate:g.gate,reason:g.reason,element:el.key,elementLabel:el.label,typicalOf:1,governsRepeat:true});
 }
 // Repeats: register points by detail family; other checks repeating one equation over stations (3 or more).
 const repeats=new Map<string,TaxonEntry[]>();
 for(const t of entries.values()){
  const fam=registerFamily(s,t.check.id),key=fam?fam:t.check.equation?`${t.check.group}|${t.check.equation}|${t.check.referenceIds.join(',')}`:undefined;
  if(key)repeats.set(key,[...(repeats.get(key)??[]),t]);
 }
 for(const [key,v] of repeats){
  if(v.length<3&&!key.startsWith('register:'))continue;
  const gov=pick(v.map(t=>t.check));
  for(const t of v){t.repeat=key;t.typicalOf=v.length;t.governsRepeat=t.check===gov;}
 }
 const regs=s.detailResults?.fatigue??[];
 for(const t of entries.values()){const id=t.check.id.match(/^detail-(?:fatigue|full-cycle)-(.+)$/)?.[1],f=id&&regs.find(v=>v.id===id);if(f)t.location=`${f.name.replace(/\s*·\s*(left|right)$/,'')}, x = ${(f.x/304.8).toFixed(1)} ft`;}

 // Body lines: evaluated DESIGN checks, merged where redundant; fatigue goes to its own table.
 const design=[...entries.values()].filter(t=>t.type==='design'&&t.gate==='evaluated'&&!['not-applicable','excluded'].includes(t.check.status));
 const lines:BodyLine[]=[],used=new Set<string>();
 for(const m of mergeDefs){
  const byEl=new Map<string,TaxonEntry[]>();
  for(const t of design)if(m.re.test(t.check.id))byEl.set(t.element,[...(byEl.get(t.element)??[]),t]);
  for(const [el,v] of byEl){
   const members=v.map(t=>t.check),preferred=m.prefer?members.find(c=>m.prefer!.test(c.id)):undefined,top=pick(members);
   const controlling=preferred&&dcOf(preferred)>=dcOf(top)-1e-9&&top.status!=='fail'?preferred:top;
   const line:BodyLine={key:`${m.key}@${el}`,title:members.length>1?m.title:v[0].check.title,element:el,elementLabel:v[0].elementLabel,effect:m.effect??v[0].effect??'other',members,controlling,
    also:members.filter(c=>c!==controlling&&dcOf(c)>=.5),merged:members.length>1,owner:v.some(t=>t.owner)};
   lines.push(line);for(const t of v){used.add(t.check.id);t.line=line.key;}
  }
 }
 for(const t of design){
  if(used.has(t.check.id))continue;
  if(t.repeat&&!t.governsRepeat&&!t.repeat.startsWith('register:'))continue;
  const key=t.repeat&&!t.repeat.startsWith('register:')?`repeat:${t.repeat}`:t.check.id;
  const members=t.repeat&&!t.repeat.startsWith('register:')?[...entries.values()].filter(v=>v.repeat===t.repeat).map(v=>v.check):[t.check];
  const line:BodyLine={key,title:t.check.title,element:t.element,elementLabel:t.elementLabel,effect:t.effect??'other',members,controlling:t.check,also:[],merged:false,owner:t.owner};
  lines.push(line);for(const m of members){const e=entries.get(m.id)!;if(e.type==='design')e.line=key;}
 }
 // Fatigue table: one row per detail (register family, or named check), evaluated or screened.
 const fatigueRows:FatigueRow[]=[];
 const fatigueEntries=[...entries.values()].filter(t=>t.type==='design'&&t.effect==='fatigue'&&!/^fatigue-peak/.test(t.check.id)&&t.check.status!=='not-applicable');
 const families=new Map<string,TaxonEntry[]>();
 for(const t of fatigueEntries){const k=registerFamily(s,t.check.id)??fatigueDetailKey(t.check.id);families.set(k,[...(families.get(k)??[]),t]);}
 for(const [key,v] of families){
  const members=v.map(t=>t.check),data=members.map(c=>({c,f:fatigueData(s,c)})),worst=data.reduce((a,b)=>(b.f?.range??-1)>(a.f?.range??-1)?b:a,data[0]);
  const miner=Math.max(...data.map(d=>d.c.id.startsWith('detail-full-cycle-')?-1:d.f?.miner??-1)),allCycle=Math.max(...data.map(d=>d.f?.allCycle??-1));
  const m=miner>=0?miner:undefined,ac=allCycle>=0?allCycle:undefined,dc=method==='miner'?m??ac:ac??m;
  const evaluated=v.some(t=>t.gate==='evaluated'),inGate=members.filter(c=>entries.get(c.id)!.gate===(evaluated?'evaluated':'screened'));
  // The governing member follows the project's method: register Miner points (detail-fatigue-) or all-cycle bounds.
  const byMethod=inGate.filter(c=>method==='miner'?!c.id.startsWith('detail-full-cycle-'):!c.id.startsWith('detail-fatigue-')),gov=pick(byMethod.length?byMethod:inGate.length?inGate:members);
  const t0=entries.get(gov.id)!;
  fatigueRows.push({key,title:key.startsWith('register:')?familyTitle(gov.title):fatigueDetailTitle[key]??gov.title.replace(/\s*·\s*fatigue\b.*$/i,'').replace(/ fatigue$/i,''),element:t0.element,category:worst.f?.category??'—',
   location:t0.location??(t0.elementLabel),range:worst.f?.range,threshold:worst.f?.threshold,miner:m,allCycle:ac,dc,gate:evaluated?'evaluated':v[0].gate,reason:evaluated?undefined:entries.get(worst.c.id)!.reason??v.find(t=>t.reason)?.reason,typicalOf:key.startsWith('register:')?members.length:1,members,governing:gov});
 }
 fatigueRows.sort((a,b)=>(a.gate==='evaluated'?0:1)-(b.gate==='evaluated'?0:1)||(b.dc??0)-(a.dc??0));
 const evaluatedFatigue=fatigueRows.filter(r=>r.gate==='evaluated'),screenedFatigue=fatigueRows.filter(r=>r.gate==='screened');
 // Per element: the governing line of each force effect, any other line at D/C ≥ 0.5, then a count of the rest.
 const bodyLines=lines.filter(l=>l.effect!=='fatigue'&&!l.key.startsWith('fatigue-peak'));
 const shown:BodyLine[]=[],elements:Taxonomy['elements']=[];
 for(const e of elementDefs){
  const v=bodyLines.filter(l=>l.element===e.key);if(!v.length&&!evaluatedFatigue.some(r=>r.element===e.key))continue;
  const sel=new Set<BodyLine>();
  for(const eff of new Set(v.map(l=>bodyEffect(l.effect)))){const w=v.filter(l=>bodyEffect(l.effect)===eff);sel.add(w.reduce((a,b)=>rank(b)>rank(a)?b:a,w[0]));}
  for(const l of v)if(dcOf(l.controlling)>=.5||l.also.length||l.controlling.status==='fail'||mergeDefs.some(m=>m.always&&l.key===`${m.key}@${l.element}`))sel.add(l);
  const list=v.filter(l=>sel.has(l)),rest=v.filter(l=>!sel.has(l)),restChecks=rest.flatMap(l=>l.members);
  shown.push(...list);
  elements.push({key:e.key,label:e.label,step:e.step,shown:list,others:{count:restChecks.length,max:restChecks.length?Math.max(...restChecks.map(dcOf)):undefined}});
 }
 // Detailing checklist: pass/fail; flagged when failed or met with less margin than min(1/8 in, 10%); fit rules
 // carry the 1/8 in setting / fit-up tolerance.
 const det=[...entries.values()].filter(t=>t.type==='detailing');
 const detEval=det.filter(t=>t.gate==='evaluated'&&!['not-applicable','excluded'].includes(t.check.status)),gated=det.filter(t=>!detEval.includes(t));
 const flagged:{entry:TaxonEntry;reason:string}[]=[];
 for(const t of detEval){
  const c=t.check;if(openStatuses.includes(c.status)){flagged.push({entry:t,reason:c.status==='fail'?'Not satisfied':'Not established'});continue;}
  if(c.demand===undefined||c.capacity===undefined||!Number.isFinite(c.capacity))continue;
  const margin=Math.abs(c.capacity-c.demand),limit=Math.abs(c.capacity),u=dcOf(c);
  if(c.quantity==='length'){
   if(fitRule(c)&&margin<inch/8-1e-6){flagged.push({entry:t,reason:margin<1e-6?'Met exactly: no margin for the 1/8 in setting / fit-up tolerance':'Margin less than the 1/8 in setting / fit-up tolerance'});continue;}
   if(margin<Math.min(inch/8,.1*limit)-1e-6)flagged.push({entry:t,reason:margin<1e-6?'Met exactly at the limit':'Margin less than 1/8 in or 10%'});
  }else if(u>.9)flagged.push({entry:t,reason:u>=1-1e-6?'Met exactly at the limit':`Margin ${((1-u)*100).toFixed(0)}%`});
 }
 // Open items: clashes, redesign flags, missing or inconsistent input, failed detailing; then by others.
 const order={clash:0,redesign:1,input:2,detailing:3};
 const openItems:OpenItem[]=[...entries.values()].filter(t=>openStatuses.includes(t.check.status)).map(t=>({check:t.check,
  kind:(t.check.group==='Coordination'||(t.type==='detailing'&&fitRule(t.check))?'clash':t.type==='design'&&t.check.status==='fail'?'redesign':t.type==='detailing'?'detailing':'input') as OpenItem['kind']})).sort((a,b)=>order[a.kind]-order[b.kind]);
 // Layout conflicts the engine reports as notices rather than checks (connection coordination): open items too,
 // unless the snapshot already carries them as Coordination checks.
 if(!s.checks.some(c=>c.group==='Coordination'))connectionCoordination(s.input).forEach((note,i)=>openItems.unshift({kind:'clash',check:{id:`coordination-notice-${i+1}`,group:'Coordination',title:'Connection layout requires redesign',status:'fail',equation:'',note,referenceIds:[]}}));
 const byType=Object.fromEntries((['design','detailing','classification','verification','input','load-basis','by-others'] as CheckType[]).map(k=>[k,[...entries.values()].filter(t=>t.type===k).length])) as Record<CheckType,number>;
 const designAll=[...entries.values()].filter(t=>t.type==='design');
 // Governing D/C: DESIGN only — body lines and the fatigue rows (by the project's fatigue method).
 const cands=[...bodyLines.map(l=>({title:l.controlling.title,dc:dcOf(l.controlling),check:l.controlling,element:l.elementLabel,fail:l.controlling.status==='fail'})),
  ...evaluatedFatigue.map(r=>({title:`${r.title} · fatigue`,dc:r.dc??-1,check:r.governing,element:entries.get(r.governing.id)!.elementLabel,fail:r.governing.status==='fail'}))];
 const top=cands.reduce<typeof cands[number]|undefined>((a,b)=>!a||(b.fail?1e9:0)+b.dc>(a.fail?1e9:0)+a.dc?b:a,undefined);
 return {caseName:(id:string|undefined)=>caseName(s,id),entries,lines,shown,elements,
  fatigue:{method,cycles,rows:fatigueRows,evaluated:evaluatedFatigue,screened:screenedFatigue,peak:lines.find(l=>l.key.startsWith('fatigue-peak'))},
  detailing:{evaluated:detEval,flagged,satisfied:detEval.length-flagged.length,gated},
  counts:{total:entries.size,byType,designEvaluated:designAll.filter(t=>t.gate==='evaluated'&&!['not-applicable','excluded'].includes(t.check.status)).length,designShown:shown.length+evaluatedFatigue.length,
   designScreened:designAll.filter(t=>t.gate==='screened').length,designNotApplicable:designAll.filter(t=>t.gate==='not-applicable'||t.check.status==='not-applicable').length,detailing:detEval.length,detailingFlagged:flagged.length},
  openItems,byOthers:[...entries.values()].filter(t=>t.type==='by-others'),governing:top&&top.dc>=0?{title:top.title,dc:top.dc,check:top.check,element:top.element}:undefined};
}
/** The force effects the body reports one governing line for (stability with flexure). */
export const bodyEffect=(e:Effect):Effect=>e==='stability'||e==='other'?'flexure':e;
const rank=(l:BodyLine)=>(l.controlling.status==='fail'?1e9:0)+dcOf(l.controlling);
