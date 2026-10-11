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
  if(/6900|55,\\?,?690|max\\left\[55|0\.103\+1\.24/.test(c.equation)){
   c.equation=c.equation.replaceAll('6900','1000').replaceAll('55,690(','8,100(').replaceAll('\\max\\left[55,\\,690','\\max\\left[8,\\,100')
    .replaceAll('0.103+1.24w/t_p','0.06+0.72w/t_p').replaceAll('\\;\\text{MPa}','\\;\\text{ksi}').replaceAll(']\\,MPa',']\\,ksi');
   c.note=c.note.replace(' Fatigue limit equation uses MPa; displayed stresses follow project units.','');
   if(c.equation.includes('0.06+0.72w/t_p'))c.note+=' Use inches for weld leg and plate thickness in R_FIL.';
  }
 }
 return c;
}
/**
 * Demand/capacity ratio as printed. A check whose capacity is zero (a clearance that is used up, a part that
 * cannot carry the action at all) reports a sentinel ratio of 1e12 or more: it reads NO CAPACITY, not a number.
 */
export function dcText(u:number|undefined,digits:number,empty='-'){
 if(u===undefined||Number.isNaN(u))return empty;
 return !Number.isFinite(u)||u>=1e6?'NO CAPACITY':u.toFixed(digits);
}
