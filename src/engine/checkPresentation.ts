import type {CheckResult,ProjectInput} from './types';
import {toDisplay,unit} from './units';
import {latexNumber} from './math';

/** Convert only explanatory equations/substitutions. Resistance calculations
 * and stored demand/capacity values retain the established canonical units. */
export function presentCheck(check:CheckResult,units:ProjectInput['units']):CheckResult {
 const c={...check},q=c.quantity??'ratio';
 if(c.substitution&&c.demand!==undefined&&c.capacity!==undefined&&c.capacity>0){
  const suffix=unit(q,units)?`\\,\\mathrm{${unit(q,units)}}`:'';
  c.substitution=`\\frac{${latexNumber(toDisplay(c.demand,q,units))}${suffix}}{${latexNumber(toDisplay(c.capacity,q,units))}${suffix}}=${(c.demand/c.capacity).toFixed(4)}`;
 }
 if(units==='US'){
  // AISC 360-16 Appendix 3 in its US form (Eqs. A-3-1, A-3-2, A-3-6): the engine evaluates the US constants, so a US
  // report prints 1000, 100 and 8 ksi and the inch R_FIL coefficients, never the SI 6900 / 690 / 55 MPa forms.
  if(/6900|55,\\?,?690|max\\left\[55|0\.103\+1\.24|690\(1\.5\/n_\{SR\}\)/.test(c.equation)){
   c.equation=c.equation.replaceAll('6900','1000').replaceAll('55,690(','8,100(').replaceAll('\\max\\left[55,\\,690','\\max\\left[8,\\,100')
    .replaceAll('690(1.5/n_{SR})^{0.167}\\ge55\\,\\mathrm{MPa}','100(1.5/n_{SR})^{0.167}\\ge8\\,\\mathrm{ksi}')
    .replaceAll('0.103+1.24w/t_p','0.06+0.72w/t_p').replaceAll('\\;\\text{MPa}','\\;\\text{ksi}').replaceAll(']\\,MPa',']\\,ksi');
   c.note=c.note.replace(' Fatigue limit equation uses MPa; displayed stresses follow project units.','');
   if(c.equation.includes('0.06+0.72w/t_p'))c.note+=' Use inches for weld leg and plate thickness in R_FIL.';
  }
 }
 return c;
}
/**
 * A ratio that is not a number a reader can use: infinite, or above 1000. A check whose capacity is zero (a clearance
 * that is used up, a part that cannot carry the action at all) reports a sentinel ratio of 1e12, and an amplifier with
 * its denominator clamped (B1 with αP_r ≥ P_e1) a ratio of millions: both mean the part has no capacity.
 */
export const noCapacity=(u:number|undefined)=>u!==undefined&&!Number.isNaN(u)&&(!Number.isFinite(u)||u>1e3);
/**
 * Demand/capacity ratio as printed: NO CAPACITY for a ratio that is infinite or above 1000 (noCapacity), never the
 * sentinel or clamped number itself. A ratio past 1 never prints as 1 (1.004 is 1.01 at two decimals): rounding must
 * not hide a failure.
 */
export function dcText(u:number|undefined,digits:number,empty='-'){
 if(u===undefined||Number.isNaN(u))return empty;
 if(noCapacity(u))return 'NO CAPACITY';
 const t=u.toFixed(digits);
 return u>1&&Number(t)<=1?(1+10**-digits).toFixed(digits):t;
}
