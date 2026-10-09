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
  const stress=(v:number)=>toDisplay(v,'stress',units).toFixed(4);
  if(c.equation.includes('6900')){
   c.equation=c.equation.replaceAll('6900',stress(6900));
   c.note+=' Fatigue stress coefficient converted to ksi from the implemented source equation; numerical capacities are unchanged.';
  }
  if(c.equation.includes('0.103+1.24w/t_p')){
   const k=25.4**.167;
   c.equation=c.equation.replace('0.103+1.24w/t_p',`${(.103/k).toFixed(6)}+${(1.24/k).toFixed(6)}w/t_p`);
   c.note+=' Use inches for weld leg and plate thickness in the reduction factor.';
  }
  if(c.id==='cap-weld-fatigue'){
   c.equation=c.equation.replace('55,690(',`${stress(55)},${stress(690)}(`);
   c.note=c.note.replace('Fatigue limit equation uses MPa; displayed stresses follow project units.','Fatigue limit equation and displayed stresses use ksi.');
  }
 }
 return c;
}
