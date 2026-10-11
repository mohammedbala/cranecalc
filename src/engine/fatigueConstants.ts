/**
 * AISC 360-16 Appendix 3 fatigue constants in their US customary form, returned in MPa (the engine's stress unit)
 * through the exact conversion 1 ksi = 6.894757 MPa, so a US report prints the AISC values themselves:
 *  - Eq. A-3-1, Categories A to E': F_SR = 1000 (Cf/n_SR)^0.333 ksi >= F_TH (Table A-3.1);
 *  - Eq. A-3-2, Category F (weld throat in shear): F_SR = 100 (Cf/n_SR)^0.167 ksi >= 8 ksi, Cf = 1.5;
 *  - Eq. A-3-5/A-3-6, transverse partial-penetration or fillet root: R_FIL = (0.06 + 0.72 w/t_p)/t_p^0.167 <= 1 (in).
 * The SI forms (6900, 690, 55 MPa; 0.103 + 1.24 w/t_p in mm) are AISC's rounded conversions of the same equations.
 */
export const KSI=6.894757293168361;
/** A-3-1 coefficient, 1000 ksi, in MPa. */
export const fatigueCoefficient=1000*KSI;
/** Table A-3.1 threshold stress ranges F_TH, ksi. */
export const fatigueThresholdKsi={A:24,B:16,B1:12,C:10,D:7,E:4.5,E1:2.6,F:8} as const;
/** Table A-3.1 threshold F_TH (MPa) of a stress category ('E1' and "E'" both mean E-prime), for screening a detail. */
export const fatigueThreshold=(category:string)=>{const k=(category==="E'"?'E1':category) as keyof typeof fatigueThresholdKsi;if(!(k in fatigueThresholdKsi))throw Error(`Unknown fatigue category ${category}`);return fatigueThresholdKsi[k]*KSI;};
/** A-3-1 finite-life allowable stress range (MPa) for constant Cf and n cycles, optionally scaled by R_PJP / R_FIL. */
export const finiteLife=(Cf:number,cycles:number,R=1)=>fatigueCoefficient*R*(Cf/cycles)**.333;
/** A-3-2, Category F weld throat in shear: max(8 ksi, 100 (1.5/n)^0.167 ksi), MPa. */
export const categoryF=(cycles:number)=>Math.max(fatigueThresholdKsi.F*KSI,100*KSI*(1.5/cycles)**.167);
/** A-3-6 R_FIL with the plate thickness and the fillet leg in mm (the US equation evaluated in inches). */
export const filletRootReduction=(thickness:number,weld:number)=>Math.min(1,(.06+.72*weld/thickness)/(thickness/25.4)**.167);
