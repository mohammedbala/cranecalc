import {girderStrength} from './aiscStrength';
import type {ProjectInput,Properties} from './types';

/** Elastic critical moment with Cb = 1 as a function of unbraced length, its inverse,
 * and the available major flexural strength at an equivalent unbraced length or for a rational M_cr. */
export interface FlexureCurve {
 /** Available strength at the entered unbraced length. */
 base:number;
 /** Elastic critical moment at the entered Lb under uniform moment (Cb = 1): F2-4 F_cr S_x, F4-5 / F5-4 F_cr S_xc. */
 mocr:number;
 /** Nominal LTB moment at Lb with Cb = 1 (F2-2/F2-3, F4-2/F4-3, F5); Infinity when Lb <= Lp. */
 ltb:number;
 /** Ratio of a rational elastic critical moment to the uniform-moment one at Lb: M_cr / M_ocr, never above 1 (printed only). */
 cb(mcr:number):number;
 /** Equivalent unbraced length of a rational M_cr: the length at which the uniform-moment (Cb = 1) elastic moment equals
  * M_cr, never shorter than Lb (no moment-gradient credit). */
 equivalentLength(mcr:number):number;
 /** Available strength of the F2 / F4 / F5 curve (Cb = 1) entered at the equivalent length, and never above phi M_cr itself. */
 capacity(mcr:number):number;
 /** The elastic critical moment below which capacity(mcr) < target (0 when no M_cr reduces it that far). */
 criticalFor(target:number):number;
 mcr(length:number):number;
 length(mcr:number):number;
 available(length:number):number;
 /** A length no longer than the longest one whose available strength is at least the target. */
 lengthFor(target:number):number;
 /** An available strength no greater than the strength at this length. */
 lowerBound(length:number):number;
}

// AISC F2-4 (rolled I, c = 1, J omitted for welded plate girders), or for capped sections F4-5 (compact or
// noncompact web, with J) or F5-4 (slender web) with the compression-flange rt (R_pc / R_pg excluded from the elastic moment).
// A rational elastic Mcr that includes load height, moment gradient and the modeled restraints enters the code curve
// through its equivalent unbraced length L_e (F2-4 / F4-5 / F5-4 with Cb = 1 solved for Mcr), at max(Lb, L_e).
export function flexureCurves(p:ProjectInput,s:Properties):{positive:FlexureCurve;negative:FlexureCurve}{
 const E=p.section.E,base=girderStrength(p,s),Lb=p.unbracedLength;
 const curve=(sign:1|-1):FlexureCurve=>{
  const pick=(st:ReturnType<typeof girderStrength>)=>sign>0?st.major:st.majorReverse??st.major;
  const available=(L:number)=>pick(girderStrength({...p,unbracedLength:L},s));
  let mcr:(L:number)=>number,length:(M:number)=>number;
  const cap=base.capDirections?.[sign>0?0:1];
  if(cap&&cap.clause==='F4'&&cap.j>0){
   // F4-5 elastic LTB stress with the compression-flange rt and J/(Sxc h0) (compact / noncompact web, Iyc/Iy > 0.23).
   const j=cap.j,a=Math.PI**4*E*E*.078*j,b=Math.PI**4*E*E;
   mcr=L=>Math.PI**2*E/(L/cap.rt)**2*Math.sqrt(1+.078*j*(L/cap.rt)**2)*cap.Sc;
   length=M=>{const F=M/cap.Sc;return cap.rt*Math.sqrt((a+Math.sqrt(a*a+4*F*F*b))/(2*F*F));};
  }else if(cap){
   mcr=L=>Math.PI**2*E*cap.Sc*(cap.rt/L)**2;
   length=M=>Math.PI*cap.rt*Math.sqrt(E*cap.Sc/M);
  }else{
   const rts=base.rts,j=(p.section.kind==='welded'?0:s.J)/(s.Sx*s.h0),a=Math.PI**4*E*E*.078*j,b=Math.PI**4*E*E;
   mcr=L=>Math.PI**2*E/(L/rts)**2*Math.sqrt(1+.078*j*(L/rts)**2)*s.Sx;
   // F^2u^2 - a u - b = 0 with u = (L/rts)^2 and F = Mcr/Sx.
   length=M=>{const F=M/s.Sx;return rts*Math.sqrt((a+Math.sqrt(a*a+4*F*F*b))/(2*F*F));};
  }
  let table:{L:number;A:number}[]|undefined;
  const nodes=()=>table??=Array.from({length:121},(_,k)=>{const L=Lb*1.03**k;return {L,A:available(L)};});
  const lengthFor=(target:number)=>{
   let found=nodes()[0].L;for(const t of nodes()){if(t.A>=target)found=t.L;else break;}
   return found;
  };
  const lowerBound=(L:number)=>{const t=nodes(),k=Math.ceil(Math.log(Math.max(L,Lb)/Lb)/Math.log(1.03)-1e-9);return k<t.length?t[Math.max(0,k)].A:available(L);};
  // The elastic buckling analysis (moment gradient, load height, restraints) gives M_cr. It enters the F2 / F4 / F5 curve
  // at the slenderness that has that elastic moment under uniform moment (AISC 360-16 F2-4 / F4-5 / F5-4 with Cb = 1 solved
  // for L_e), so the inelastic F2-2 / F4-2 / F5-3 interpolation is entered at max(Lb, L_e) and the elastic branch returns
  // M_cr itself. A Cb < 1 multiplier on the inelastic or plateau strength (below M_cr and discontinuous at Lp) is not used.
  const phi=p.method==='LRFD'?.9:1/1.67,top=pick(base),ltb=(sign>0?base.ltb:'ltbReverse' in base?base.ltbReverse:base.ltb)??Infinity,mocr=mcr(Lb);
  const cb=(M:number)=>Math.max(0,Math.min(1,M/mocr));
  const equivalentLength=(M:number)=>M>=mocr?Lb:Math.max(Lb,length(M));
  const capacity=(M:number)=>M>=mocr?top:Math.min(top,available(equivalentLength(M)),phi*M);
  // The least M_cr whose capacity reaches the target, from above (the strength table runs in 3 % length steps).
  const criticalFor=(target:number)=>Math.max(target/phi,mcr(lengthFor(target)));
  return {base:top,mocr,ltb,cb,equivalentLength,capacity,criticalFor,mcr,length,available,lengthFor,lowerBound};
 };
 return {positive:curve(1),negative:curve(-1)};
}
