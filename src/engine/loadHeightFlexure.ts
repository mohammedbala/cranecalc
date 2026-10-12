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
 /** Cb from a rational elastic critical moment: M_cr / M_ocr, never above 1 (no moment-gradient credit). */
 cb(mcr:number):number;
 /** Available strength with that Cb in F2 / F4 / F5 (AISC 360-16 F1: Cb multiplies the LTB equations), and never above
  * phi M_cr itself. */
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
// as Cb = Mcr / Mocr (capacity); the equivalent-length mapping (length, available) is kept for the solver checks.
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
  // AISC 360-16 F1 / Commentary F1: Cb = M_cr / M_ocr from an elastic buckling analysis that includes the moment gradient
  // and the load height; it multiplies the F2-2 / F4-2 / F5-3 LTB moment (F2-3 / F4-3 / F5-4: Cb F_cr), capped at 1 here.
  const phi=p.method==='LRFD'?.9:1/1.67,top=pick(base),ltb=(sign>0?base.ltb:base.ltbReverse??base.ltb),mocr=mcr(Lb);
  const cb=(M:number)=>Math.max(0,Math.min(1,M/mocr));
  const capacity=(M:number)=>Math.min(top,Number.isFinite(ltb)?phi*cb(M)*ltb:Infinity,phi*M);
  const criticalFor=(target:number)=>Math.max(target/phi,Number.isFinite(ltb)?target/phi/ltb*mocr:0);
  return {base:top,mocr,ltb,cb,capacity,criticalFor,mcr,length,available,lengthFor,lowerBound};
 };
 return {positive:curve(1),negative:curve(-1)};
}
