import type {CheckResult} from './types';
import {geometricCheck,integrityFields} from './checkIntegrity';
/** A numerical substitution that remains unambiguous in KaTeX. */
export function latexNumber(value:number,digits=5){
 const [coefficient,exponent]=value.toPrecision(digits).split('e');
 return exponent===undefined?coefficient:`${coefficient}\\times10^{${Number(exponent)}}`;
}
/** Roundoff at an exact design boundary must not manufacture a failure. */
export function withinLimit(demand:number,capacity:number){return demand<=capacity+Math.max(Math.abs(capacity),1)*1e-12;}
/**
 * A demand/capacity check for new code, by the rules of checkIntegrity.ts: met when the demand is within the capacity; a
 * dimensional rule with a negative demand or capacity fails as a geometry conflict without a ratio; any other check
 * with no capacity (capacity ≤ 0, a ratio not finite or above 1000) fails with utilization Infinity and noCapacity.
 * calculate() passes every check through the same rules again and words their notes in the project units.
 */
export function compared(id:string,group:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,referenceIds:string[],caseId?:string):CheckResult{
 // A dimension may be met at zero (no clearance required, none provided); a resistance of zero carries nothing.
 const ratio=capacity>0?demand/capacity:Infinity,met=withinLimit(demand,capacity)&&(capacity>0||geometricCheck({id,quantity}));
 const c:CheckResult={id,group,title,status:met?'pass':'fail',demand,capacity,quantity,utilization:ratio,equation,
  substitution:Number.isFinite(ratio)?`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${ratio.toFixed(4)}`:undefined,note,referenceIds,caseId};
 const f=integrityFields(c);if(!f)return c;
 const {rule,...fields}=f,out:CheckResult={...c,...fields};
 for(const key of ['utilization','geometry','noCapacity','substitution'] as const)if(out[key]===undefined)delete out[key];
 if(rule!=='no-demand')delete out.substitution;
 return out;
}
