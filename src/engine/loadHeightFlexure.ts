import {girderStrength} from './aiscStrength';
import type {ProjectInput,Properties} from './types';

/** Elastic critical moment with Cb = 1 as a function of unbraced length, its inverse,
 * and the available major flexural strength at an equivalent unbraced length. */
export interface FlexureCurve {
 /** Available strength at the entered unbraced length. */
 base:number;
 mcr(length:number):number;
 length(mcr:number):number;
 available(length:number):number;
 /** A length no longer than the longest one whose available strength is at least the target. */
 lengthFor(target:number):number;
}

// AISC F2-4 (rolled I, c = 1, J omitted for welded plate girders) or F5-4 with the compression-flange
// rt (capped, R_pg excluded from the elastic moment). A rational elastic Mcr that includes load height,
// moment gradient and the modeled restraints maps to the code curve through the equivalent length L_e.
export function flexureCurves(p:ProjectInput,s:Properties):{positive:FlexureCurve;negative:FlexureCurve}{
 const E=p.section.E,base=girderStrength(p,s),Lb=p.unbracedLength;
 const curve=(sign:1|-1):FlexureCurve=>{
  const pick=(st:ReturnType<typeof girderStrength>)=>sign>0?st.major:st.majorReverse??st.major;
  const available=(L:number)=>pick(girderStrength({...p,unbracedLength:L},s));
  let mcr:(L:number)=>number,length:(M:number)=>number;
  const cap=base.capDirections?.[sign>0?0:1];
  if(cap){
   mcr=L=>Math.PI**2*E*cap.Sc*(cap.rt/L)**2;
   length=M=>Math.PI*cap.rt*Math.sqrt(E*cap.Sc/M);
  }else{
   const rts=base.rts,j=(p.section.kind==='welded'?0:s.J)/(s.Sx*s.h0),a=Math.PI**4*E*E*.078*j,b=Math.PI**4*E*E;
   mcr=L=>Math.PI**2*E/(L/rts)**2*Math.sqrt(1+.078*j*(L/rts)**2)*s.Sx;
   // F^2u^2 - a u - b = 0 with u = (L/rts)^2 and F = Mcr/Sx.
   length=M=>{const F=M/s.Sx;return rts*Math.sqrt((a+Math.sqrt(a*a+4*F*F*b))/(2*F*F));};
  }
  let table:{L:number;A:number}[]|undefined;
  const lengthFor=(target:number)=>{
   table??=Array.from({length:121},(_,k)=>{const L=Lb*1.03**k;return {L,A:available(L)};});
   let found=table[0].L;for(const t of table){if(t.A>=target)found=t.L;else break;}
   return found;
  };
  return {base:pick(base),mcr,length,available,lengthFor};
 };
 return {positive:curve(1),negative:curve(-1)};
}
