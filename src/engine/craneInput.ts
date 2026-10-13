import type {CheckResult,Crane,ProjectInput} from './types';
import {format} from './units';
import {latexNumber,withinLimit} from './math';
import {activeEndStop} from './endStopInputs';

/**
 * Crane input consistency (statics of the supplier data, TR-13 §1.5.6.1 crane data) and bumper selection (TR-13
 * commentary to §3.6.3). Violations are open items: status 'fail' in the 'Crane input' / 'Bumper selection'
 * groups, never validation errors, so the calculation still runs and the report shows the problem.
 */
const group='Crane input',bumperGroup='Bumper selection';
const g=9.80665; // m/s²
/** 16 ft/s² in m/s². */
export const bumperDecelerationLimit=16*.3048;
/** Trolley share of the bumper design weight, TR-13 commentary to §3.6.3; confirm with the crane supplier. */
export const trolleyBumperShare=.9;

const staticLoad=(c:Crane,w:Crane['wheels'][number])=>c.includesImpact?w.loaded/(1+c.impact):w.loaded;
/** Supplier wheel data reduced to runway totals. Forces in N. */
export function craneStatics(c:Crane){
 const d=c.design;if(!d)return undefined;
 const n=c.wheels.length,maxRunway=c.wheels.reduce((a,w)=>a+staticLoad(c,w),0),emptyRunway=c.wheels.reduce((a,w)=>a+w.unloaded,0);
 const lift=d.ratedLoad+(d.belowHookWeight??0),total=lift+d.trolleyWeight+d.bridgeWeight+(d.type==='stacker'?d.rigidArmWeight:0);
 // Minimum on the other runway: the entered TR-13 minimum wheel loads (same wheel count on both runways), else
 // at least half the bridge, which is always carried by the other runway (symmetric bridge).
 const minGiven=(d.minWheelLoad??0)>0,minOther=minGiven?n*d.minWheelLoad!:d.bridgeWeight/2;
 return {n,maxRunway,emptyRunway,lifted:maxRunway-emptyRunway,lift,total,minGiven,minOther,sumAll:maxRunway+minOther};
}
/** Relative tolerance for supplier wheel loads rounded to the reported precision. */
export const staticsTolerance=.03;

const ratioCheck=(id:string,grp:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,referenceIds:string[]):CheckResult=>({id,group:grp,title,status:capacity>0&&withinLimit(demand,capacity)?'pass':'fail',demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,referenceIds});
const open=(id:string,grp:string,title:string,note:string,referenceIds:string[]):CheckResult=>({id,group:grp,title,status:'fail',equation:'',note,referenceIds});

/** Statics of the crane data and the required TR-13 §1.5.6.1 items, per crane with design data. */
export function craneInputChecks(p:ProjectInput):CheckResult[]{
 const checks:CheckResult[]=[],u=p.units,f=(v:number)=>format(v,'force',u,3),refs=['tr13-crane-data','tr13-load'];
 p.cranes.forEach((c,i)=>{
  const d=c.design,s=craneStatics(c),prefix=`crane-${i+1}`,label=`${c.name} · `;
  if(!d||!s)return;
  // Without rated load, trolley and bridge weights the side-thrust check already reports the missing data.
  if(d.ratedLoad>0&&d.trolleyWeight>0&&d.bridgeWeight>0){
   const parts=`Q = ${f(d.ratedLoad)}${d.belowHookWeight?` + below-hook ${f(d.belowHookWeight)}`:''}, trolley T = ${f(d.trolleyWeight)}, bridge B = ${f(d.bridgeWeight)}${d.type==='stacker'&&d.rigidArmWeight?`, rigid arm ${f(d.rigidArmWeight)}`:''}: whole crane W = ${f(s.total)}`;
   checks.push(ratioCheck(`${prefix}-statics-runway`,group,label+'Maximum load on one runway',s.maxRunway,s.total-s.minOther,'force','\\sum P_{max}\\le W-\\sum P_{min}',
    `This runway's ${s.n} maximum static wheel loads sum to ${f(s.maxRunway)}${c.includesImpact?' (impact removed)':''}, against at most W − ${f(s.minOther)} = ${f(s.total-s.minOther)} with the other runway carrying at least ${f(s.minOther)} (${s.minGiven?`${s.n} × the minimum wheel load ${f(d.minWheelLoad!)}`:'half the bridge weight; minimum wheel loads not entered'}). ${parts}.${withinLimit(s.maxRunway,s.total-s.minOther)?'':' The wheel loads are not consistent with the crane weights: obtain a corrected schedule from the crane supplier.'}`,refs));
   checks.push(ratioCheck(`${prefix}-statics-lifted`,group,label+'Lifted-load share on one runway',s.lifted,s.lift,'force',`\\sum(P_{max}-C_d)\\le Q${d.belowHookWeight?'+W_h':''}`,
    `Loaded minus empty wheel loads on this runway: ${f(s.maxRunway)} − ${f(s.emptyRunway)} = ${f(s.lifted)}, the share of the lifted load that reaches this runway; it cannot exceed the rated load${d.belowHookWeight?' plus below-hook items':''} ${f(s.lift)}.`,refs));
   if(s.minGiven)checks.push(ratioCheck(`${prefix}-statics-total`,group,label+'Wheel loads sum to the crane weight',Math.abs(s.sumAll-s.total),staticsTolerance*s.total,'force',`\\left|\\sum P_{max}+\\sum P_{min}-(B+T+Q${d.belowHookWeight?'+W_h':''})\\right|\\le0.03W`,
    `Maximum wheel loads ${f(s.maxRunway)} on this runway plus ${s.n} × ${f(d.minWheelLoad!)} = ${f(s.minOther)} on the other runway give ${f(s.sumAll)}, ${f(Math.abs(s.sumAll-s.total))} from the crane weight W = ${f(s.total)} (tolerance ${staticsTolerance*100}% for rounding of the supplier schedule). ${parts}.`,refs));
  }
  const missing=[...(d.bridgeSpeed&&d.bridgeSpeed>0?[]:['rated bridge speed']),...(d.minWheelLoad&&d.minWheelLoad>0?[]:['minimum wheel loads'])];
  if(missing.length)checks.push(open(`${prefix}-data`,group,label+'Required crane data (TR-13 §1.5.6.1)',`Not entered: ${missing.join(' and ')}. TR-13 §1.5.6.1 requires the crane supplier to state them. ${missing.includes('minimum wheel loads')?'Without minimum wheel loads the wheel-load sum cannot be checked against the crane weight; half the bridge weight is used as the least load on the other runway. ':''}${missing.includes('rated bridge speed')?'Without the bridge speed the bumper cannot be checked (TR-13 commentary to §3.6.3).':''}`,refs));
 });
 return checks;
}
/** Warnings for the snapshot: one line per open crane-input item. */
export const craneInputWarnings=(checks:CheckResult[])=>checks.filter(c=>c.group===group&&c.status==='fail').map(c=>`CRANE INPUT: ${c.title}. ${c.note}`);

/** Force-proportional end-stop strength checks: their largest D/C scales the stop design strength. */
const stopStrengthIds=['end-stop-bolt-tension','end-stop-bolt-shear','end-stop-slip','end-stop-bearing-base','end-stop-bearing-flange','end-stop-flexure','end-stop-shear','end-stop-face','end-stop-face-outstand','end-stop-weld','end-stop-stiffener-weld','end-stop-web'];
const pryingIds=['end-stop-base-prying','end-stop-flange-prying'];
/**
 * Unfactored bumper force the girder-mounted stop can take: the design bumper force over the largest D/C of the
 * stop strength checks (no-prying thickness scales with the square root of the force, so its D/C is squared).
 */
export function stopDesignStrength(p:ProjectInput,checks:CheckResult[],bumperForce:number){
 if(!activeEndStop(p))return undefined;
 const u=Math.max(0,...checks.filter(c=>stopStrengthIds.includes(c.id)).map(c=>c.utilization??0),...checks.filter(c=>pryingIds.includes(c.id)).map(c=>(c.utilization??0)**2));
 return u>0?bumperForce/u:undefined;
}

/**
 * Bumper selection, TR-13 commentary to §3.6.3: W_E = 0.5 W_bridge + 0.9 W_trolley (lifted load free to swing,
 * not included); energy E = W_E v²/(2g). With bumper stroke s and efficiency η the peak force is F = E/(ηs) and
 * the peak deceleration a = v²/(2ηs). (1) a at 50% of the rated speed ≤ 16 ft/s²; (2) the full energy at 100%
 * speed is absorbed at no more than the supplier bumper force used for the runway design; (3) that peak force is
 * within the stop design strength.
 */
export function bumperSelectionChecks(p:ProjectInput,checks:CheckResult[]):CheckResult[]{
 const out:CheckResult[]=[],u=p.units,f=(v:number)=>format(v,'force',u,3),refs=['tr13-bumper','tr13-crane'];
 p.cranes.forEach((c,i)=>{
  const d=c.design,prefix=`crane-${i+1}`,label=`${c.name} · `;
  if(!d||!(d.bumperForce>0))return;
  const missing=[...(d.bridgeSpeed&&d.bridgeSpeed>0?[]:['rated bridge speed']),...(d.bumperStroke&&d.bumperStroke>0?[]:['bumper stroke']),...(d.bumperEfficiency&&d.bumperEfficiency>0?[]:['bumper efficiency']),...(d.bridgeWeight>0&&d.trolleyWeight>0?[]:['bridge and trolley weights'])];
  if(missing.length){out.push(open(`${prefix}-bumper-selection`,bumperGroup,label+'Bumper selection (TR-13 commentary to §3.6.3)',`Not entered: ${missing.join(', ')}. The bumper must decelerate the bridge at no more than 16 ft/s² at 50% of the rated speed, absorb the full energy at 100% speed and stay within the stop design strength at peak force. Bumper selection is unverified until the crane supplier gives these data.`,refs));return;}
  const WE=.5*d.bridgeWeight+trolleyBumperShare*d.trolleyWeight,m=WE/g,v=d.bridgeSpeed!/1000,s=d.bumperStroke!/1000,eta=d.bumperEfficiency!;
  const E=.5*m*v*v,F=E/(eta*s),a50=(.5*v)**2/(2*eta*s);
  const basis=`W_E = 0.5 × ${f(d.bridgeWeight)} + ${trolleyBumperShare} × ${f(d.trolleyWeight)} = ${f(WE)} (lifted load free to swing, excluded; confirm the ${trolleyBumperShare} trolley factor with the crane supplier). Rated bridge speed ${format(d.bridgeSpeed!,'speed',u,3)}, stroke ${format(d.bumperStroke!,'length',u,3)}, efficiency ${eta}.`;
  const accel=(x:number)=>u==='US'?`${+(x/.3048).toFixed(2)} ft/s²`:`${+x.toFixed(3)} m/s²`,energy=(x:number)=>u==='US'?`${(x/1355.817948).toFixed(3)} kip-ft`:`${(x/1000).toFixed(3)} kJ`;
  out.push(ratioCheck(`${prefix}-bumper-decel`,bumperGroup,label+'Bumper · deceleration at 50% speed',a50*1000,bumperDecelerationLimit*1000,'acceleration','a=\\frac{(0.5v)^2}{2\\eta s}\\le16\\,\\mathrm{ft/s^2}',`Peak deceleration at 50% of the rated speed ${accel(a50)} against ${accel(bumperDecelerationLimit)} (TR-13 commentary to §3.6.3). ${basis}`,refs));
  out.push(ratioCheck(`${prefix}-bumper-energy`,bumperGroup,label+'Bumper · peak force absorbing the full energy at 100% speed',F,d.bumperForce,'force','F=\\frac{W_Ev^2}{2g\\eta s}\\le C_{bs}',`Energy at 100% speed W_Ev²/2g = ${energy(E)} (W_E = ${f(WE)}), absorbed over the ${format(d.bumperStroke!,'length',u,3)} stroke at efficiency ${eta}: peak force ${f(F)} against the supplier bumper force ${f(d.bumperForce)}, for which the runway, end stops and their load path are designed. ${basis}`,refs));
  const girder=!d.bumperBypassesGirder,strength=girder?stopDesignStrength(p,checks,d.bumperForce):undefined;
  out.push(ratioCheck(`${prefix}-bumper-stop`,bumperGroup,label+'Bumper · peak force within the stop design strength',F,strength??d.bumperForce,'force','F\\le\\phi R_n\\ \\ \\text{(end stop)}',strength?`Peak bumper force ${f(F)} against the girder-mounted stop design strength ${f(strength)}: the ${f(d.bumperForce)} design bumper force over the largest strength D/C of the stop checks (a no-prying thickness ratio is squared to a strength ratio).`:`${girder?'No girder-mounted stop is designed in this calculation':'Building-mounted stop'}: its design strength is taken as the bumper force it is designed for, ${f(d.bumperForce)}; confirm with the stop design.`,refs));
 });
 return out;
}
