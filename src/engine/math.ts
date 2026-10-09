/** A numerical substitution that remains unambiguous in KaTeX. */
export function latexNumber(value:number,digits=5){
 const [coefficient,exponent]=value.toPrecision(digits).split('e');
 return exponent===undefined?coefficient:`${coefficient}\\times10^{${Number(exponent)}}`;
}
/** Roundoff at an exact design boundary must not manufacture a failure. */
export function withinLimit(demand:number,capacity:number){return demand<=capacity+Math.max(Math.abs(capacity),1)*1e-12;}
