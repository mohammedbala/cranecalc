import type {CalculationSnapshot,CheckResult,ProjectInput} from './types';
import {format,noteLength,type Quantity} from './units';

/**
 * Check integrity: the one layer every check of a calculation passes through (calculate.ts, after every module has
 * produced its checks and before the taxonomy gates), so that each check tells the truth about its own status. The
 * modules keep their own compare helpers; new code uses compared() in math.ts, which applies the same rules.
 *
 * (i)  A dimensional check (quantity 'length', or a fit / clearance / edge / length / gap rule) whose demand or capacity
 *      is negative describes a part that cannot exist or parts that overlap: it fails as a geometry conflict
 *      (geometry: true), carries no D/C and its note starts "Invalid geometry: <what> = <value>" with the overlap or the
 *      shortfall. A dimension never reads NO CAPACITY: a zero provided dimension has no ratio either.
 * (ii) Any other check whose capacity is ≤ 0, or whose ratio is not finite or above 1000 (a 1e12 sentinel of a module,
 *      an amplifier past its limit), fails with utilization Infinity and noCapacity: true; it ranks above every finite
 *      D/C. JSON writes Infinity as null: the flag is the source of truth.
 * (iii) The bearing, tearout and prying checks of a ply whose own edge or fit check fails because the holes or parts lie
 *      outside it are not valid: they fail with "Not valid: <prerequisite> fails" and no D/C.
 * (iv) The geometry failures are listed in snapshot.geometryConflicts (the sheets mark those views).
 * The sense of a check whose demand is the requirement and whose capacity the provided value is set here by id
 * (sense 'min'). Nothing here changes a demand or a capacity.
 */

/** A ratio above this is not a number a reader can use: the part has no capacity. */
export const noCapacityRatio=1e3;
const geometricId=/(^|-)(fit|fits|clear|clearance|edge|length|gap)(-|$)/;
/** A dimensional rule: a length compared with a length, or a fit, clearance, edge, length or gap rule stated as a ratio. */
export const geometricCheck=(c:Pick<CheckResult,'id'|'quantity'>)=>c.quantity==='length'||((c.quantity===undefined||c.quantity==='ratio')&&geometricId.test(c.id)&&!/fatigue/.test(c.id));
const finite=(v:number|undefined):v is number=>typeof v==='number'&&Number.isFinite(v);
const evaluated=(c:CheckResult)=>c.status==='pass'||c.status==='fail';

/**
 * The status, ratio and flags of one check by rules (i) and (ii), from its own demand and capacity. Returns the fields
 * to change, or undefined when the check already tells the truth.
 */
export function integrityFields(c:CheckResult):Partial<Pick<CheckResult,'status'|'utilization'|'geometry'|'noCapacity'>>&{rule:'geometry'|'shortfall'|'no-capacity'|'no-demand'}|undefined{
 if(!evaluated(c))return undefined;
 const d=c.demand,k=c.capacity,u=c.utilization;
 if(geometricCheck(c)){
  if((finite(d)&&d<0)||(finite(k)&&k<0)||(d!==undefined&&Number.isNaN(d))||(k!==undefined&&Number.isNaN(k)))return {rule:'geometry',status:'fail',geometry:true,utilization:undefined,noCapacity:undefined};
  // A provided dimension of zero (a clearance used up): the rule is met or not, there is no ratio.
  if(u!==undefined&&(!Number.isFinite(u)||Math.abs(u)>noCapacityRatio))return {rule:'shortfall',utilization:undefined,noCapacity:undefined};
  return undefined;
 }
 if(c.noCapacity&&u===Infinity&&c.status==='fail')return undefined;
 const none=(k!==undefined&&!(k>0))||(u!==undefined&&(!Number.isFinite(u)||u>noCapacityRatio));
 if(!none)return undefined;
 // Nothing to carry and nothing to carry it with (a zero demand on a zero resistance): met, with a zero ratio.
 if(c.status==='pass'&&!(finite(d)&&d>0)&&!(u!==undefined&&u>noCapacityRatio))return u===undefined?undefined:{rule:'no-demand',utilization:0};
 return {rule:'no-capacity',status:'fail',utilization:Infinity,noCapacity:true};
}

/** The sense of a dimensional rule: a maximum (demand provided, capacity the limit), a fit (space needed and available), else a minimum. */
const ruleForm=(c:CheckResult)=>/-max(imum)?$/.test(c.id)||/\bmaximum\b/i.test(c.title)?'max':/-fits?$/.test(c.id)||/\bfits?\b/i.test(c.title)?'fit':'min';
const dimension=(c:CheckResult)=>{
 const t=`${c.id} ${c.title}`.toLowerCase();
 return /edge/.test(t)?'edge distance':/clear/.test(t)?'clear distance':/gap/.test(t)?'gap':/fit/.test(t)?'space':/length/.test(t)?'length':/spacing|pitch/.test(t)?'spacing':/thick/.test(t)?'thickness':'dimension';
};
const valueText=(v:number|undefined,q:Quantity,units:ProjectInput['units'])=>{
 if(v===undefined||Number.isNaN(v))return 'not computed';
 if(q==='length')return `${v<0?'−':''}${noteLength(Math.abs(v),units)}`;
 return format(v,q,units,3);
};
/** The first sentence of a geometry failure: what is negative, by how much the parts overlap or fall short. */
export function geometryNote(c:CheckResult,units:ProjectInput['units']){
 const q=(c.quantity??'ratio') as Quantity,v=(x:number|undefined)=>valueText(x,q,units),d=c.demand,k=c.capacity,form=ruleForm(c),w=dimension(c);
 const gap=(a:number|undefined,b:number|undefined)=>finite(a)&&finite(b)?v(Math.abs(a-b)):'—';
 if(d!==undefined&&Number.isNaN(d)||k!==undefined&&Number.isNaN(k))return `Invalid geometry: ${w} = not computed (the parts do not form a valid arrangement).`;
 if(finite(k)&&k<0){
  if(form==='max')return `Invalid geometry: limit ${w} = ${v(k)}: no ${w} can meet it (${v(d)} provided, over by ${gap(d,k)}).`;
  if(form==='fit')return `Invalid geometry: available ${w} = ${v(k)}: the parts overlap by ${v(-k)} before any are placed (${v(d)} needed, short by ${gap(d,k)}).`;
  return `Invalid geometry: provided ${w} = ${v(k)}: ${w==='edge distance'?`the hole centre lies ${v(-k)} outside the part`:`the parts overlap by ${v(-k)}`} (${v(d)} required, short by ${gap(d,k)}).`;
 }
 const role=form==='max'?'provided':form==='fit'?'needed':'required';
 return `Invalid geometry: ${role} ${w} = ${v(d)}: a negative ${w}; the parts it spans overlap by ${v(Math.abs(d??0))} (${form==='max'?'limit':'provided'} ${v(k)}).`;
}
const shortfallNote=(c:CheckResult,units:ProjectInput['units'])=>{
 const q=(c.quantity??'ratio') as Quantity,v=(x:number|undefined)=>valueText(x,q,units),form=ruleForm(c);
 return form==='max'?`No ratio: the limit is ${v(c.capacity)} against ${v(c.demand)} provided.`:`No ratio: ${v(c.capacity)} ${form==='fit'?'available':'provided'} against ${v(c.demand)} ${form==='fit'?'needed':'required'}${c.status==='fail'?`, short by ${v((c.demand??0)-(c.capacity??0))}`:''}.`;
};
const noCapacityNote=(c:CheckResult,units:ProjectInput['units'])=>{
 if(/no capacity|elastic instability/i.test(c.note))return '';
 const q=(c.quantity??'ratio') as Quantity,k=c.capacity;
 if(k!==undefined&&!(k>0))return `No capacity: the resistance is ${Number.isNaN(k)?'not computed':format(k,q,units,3)} against a demand of ${format(c.demand,q,units,3)}.`;
 return `No capacity: the computed ratio ${c.utilization!==undefined&&Number.isFinite(c.utilization)?`(${c.utilization.toExponential(2)}) is above ${noCapacityRatio}`:'is not finite'}; the part cannot carry the action in this arrangement.`;
};

/**
 * Dependent checks: the bearing, tearout, block and prying checks of a ply are computed for holes and parts placed by its
 * edge or fit rule. When that rule fails because the holes or parts lie outside the ply, the dependents are not valid.
 */
export const dependentChecks:Record<string,string[]>={
 'end-stop-flange-edge':['end-stop-bearing-flange','end-stop-flange-prying'],
 'end-stop-base-edge':['end-stop-bearing-base','end-stop-base-prying'],
 'end-bearing-flange-edge':['end-bearing-flange-bearing','end-bearing-flange-prying'],
 'end-bearing-plate-edge':['end-bearing-plate-bearing'],
 'end-bearing-seat-fit':['end-bearing-seat-bearing','end-bearing-seat-prying'],
 // Flange-tie bars and the flexible plate tie at their gussets; the slotted column gusset; the stiffener tie gusset.
 'tie-edge':['tie-bearing','tie-block','tie-prying'],
 'tie-release-end-edge':['tie-release-bearing','tie-release-block'],
 'tie-release-edge':['tie-release-net'],
 'tie-stiffener-bar-clearance':['tie-bearing','tie-block'],
 'tie-stiffener-gusset-length':['tie-gusset-compression'],
 'tie-stiffener-fit':['tie-stiffener-cjp','tie-stiffener-cjp-fatigue'],
 // Cap tieback angle.
 'cap-angle-lap-edge':['cap-angle-lap-bearing','cap-angle-block'],
 'cap-angle-endplate-edge':['cap-angle-endplate-prying'],
 'cap-angle-cap-edge':['cap-angle-channel-flange'],
 'cap-angle-column-edge':['cap-angle-column-flange'],
};
/**
 * Does a failing edge or fit rule leave the holes or parts outside the ply? A fit rule: yes. An edge rule: when the
 * provided edge distance is negative (the hole centre outside the part) or less than the hole radius. The rule's
 * requirement is about 1.5d_b; the hole radius (d_b + 1/16 in)/2 is 0.36 of that for 5/8 to 1 in bolts.
 */
export function outside(c:CheckResult){
 if(c.status!=='fail')return false;
 if(c.geometry||/-fits?$/.test(c.id))return true;
 if(/-edge$/.test(c.id))return finite(c.capacity)&&finite(c.demand)&&c.capacity<.36*c.demand;
 return false;
}

/** Inverse-sense checks: the demand is the requirement and the capacity the provided value (a factor of safety, λ, a stiffness). */
const minSense=/^(base-(sliding|overturning|uplift)|torsion-stability|brace-stiffness|column-cap-fork-stiffness)$/;
export const senseOf=(c:Pick<CheckResult,'id'>):CheckResult['sense']=>minSense.test(c.id)?'min':undefined;

/** One check through rules (i) and (ii) and the sense table; `units` for the notes. */
export function normalizeCheck(c:CheckResult,s:Pick<CalculationSnapshot,'input'>):CheckResult{
 const units=s.input.units,f=integrityFields(c),sense=senseOf(c);
 if(!f&&!sense)return c;
 const out:CheckResult={...c};
 if(sense)out.sense=sense;
 if(!f)return out;
 const {rule,...fields}=f;Object.assign(out,fields);
 for(const key of ['utilization','geometry','noCapacity'] as const)if(key in fields&&fields[key]===undefined)delete out[key];
 if(rule==='geometry'){
  if(!out.note.startsWith('Invalid geometry:'))out.note=`${geometryNote(c,units)} ${c.note}`.trim();
  delete out.substitution;
 }else if(rule==='shortfall'){
  if(!out.note.startsWith('No ratio:'))out.note=`${shortfallNote(c,units)} ${c.note}`.trim();
  delete out.substitution;
 }else if(rule==='no-capacity'){
  const lead=noCapacityNote(c,units);if(lead&&!out.note.startsWith('No capacity:'))out.note=`${lead} ${c.note}`.trim();
  delete out.substitution;
 }
 return out;
}

/**
 * Every check of a snapshot through the integrity rules, then the dependents of failed edge and fit rules; sets
 * snapshot.geometryConflicts. Returns the checks it changed (id and the rule), for warnings and tests.
 */
export function normalizeChecks(s:CalculationSnapshot){
 const changed:{id:string;rule:string}[]=[];
 s.checks=s.checks.map(c=>{const n=normalizeCheck(c,s);if(n!==c&&(n.status!==c.status||n.utilization!==c.utilization||n.geometry||n.noCapacity))changed.push({id:c.id,rule:n.geometry?'geometry':n.noCapacity?'no-capacity':'ratio'});return n;});
 const byId=new Map(s.checks.map(c=>[c.id,c]));
 for(const [pre,deps] of Object.entries(dependentChecks)){
  const p=byId.get(pre);if(!p||!outside(p))continue;
  for(const id of deps){
   const c=byId.get(id);if(!c||!evaluated(c)||c.note.startsWith('Not valid:'))continue;
   const n:CheckResult={...c,status:'fail',note:`Not valid: ${p.title} fails (${p.geometry?'invalid geometry':'the holes or parts lie outside the ply'}); this result is computed for holes or parts that are not in the part as detailed. Recheck after the layout is corrected. ${c.note}`.trim()};
   delete n.utilization;delete n.noCapacity;delete n.substitution;
   s.checks[s.checks.indexOf(c)]=n;byId.set(id,n);changed.push({id,rule:'dependent'});
  }
 }
 s.geometryConflicts=s.checks.filter(c=>c.geometry).map(c=>({id:c.id,title:c.title}));
 return changed;
}
