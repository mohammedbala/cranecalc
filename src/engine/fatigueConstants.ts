/**
 * AISC 360-16 Appendix 3 fatigue constants in their US customary form, returned in MPa (the engine's stress unit)
 * through the exact conversion 1 ksi = 6.894757 MPa, so a US report prints the AISC values themselves:
 *  - Eq. A-3-1, Categories A to E': F_SR = 1000 (Cf/n_SR)^0.333 ksi >= F_TH (Table A-3.1), 0.333 = 1/3;
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
// The printed exponent 0.333 is AISC's rounding of the cube root (S-N slope m = 3); the exact 1/3 is evaluated, which
// reproduces published US calculations (e.g. 36.84 ksi for Category A at 500,000 cycles) and Miner damage with m = 3.
export const finiteLife=(Cf:number,cycles:number,R=1)=>fatigueCoefficient*R*(Cf/cycles)**(1/3);
/** A-3-2, Category F weld throat in shear: max(8 ksi, 100 (1.5/n)^0.167 ksi), MPa. */
export const categoryF=(cycles:number)=>Math.max(fatigueThresholdKsi.F*KSI,100*KSI*(1.5/cycles)**.167);
/** A-3-6 R_FIL with the plate thickness and the fillet leg in mm (the US equation evaluated in inches). */
export const filletRootReduction=(thickness:number,weld:number)=>Math.min(1,(.06+.72*weld/thickness)/(thickness/25.4)**.167);
/**
 * Miner's rule over the duty bins, reported as an equivalent constant-amplitude stress range at the design cycle count
 * (AISC 360-16 Commentary Appendix 3; AISC DG7): f_sr,eq = (Σ n_i f_sr,i^m / n_SR)^(1/m), n_SR = Σ n_i, with the S-N
 * slope m = 3 (Eq. A-3-1) or 6 (Category F, Eq. A-3-2). It is compared with F_SR at n_SR on the same finite-life curve,
 * without the threshold F_TH (no endurance-limit credit in a variable spectrum), so f_sr,eq/F_SR is on the same basis
 * as the all-cycle ratio f_sr,max/F_SR and equals D^(1/m), D = Σ n_i/N_i the damage sum (returned for information).
 * `allowable(n)` is the finite-life allowable range at n cycles (finiteLife, with any R_PJP / R_FIL factor).
 */
export function minerEquivalent(bins:readonly {cycles:number;range:number}[],allowable:(cycles:number)=>number,m=3){
 const cycles=bins.reduce((a,b)=>a+b.cycles,0),capacity=allowable(cycles);
 const range=cycles>0?(bins.reduce((a,b)=>a+b.cycles*Math.max(0,b.range)**m,0)/cycles)**(1/m):0;
 return {range,capacity,cycles,m,damage:capacity>0?(range/capacity)**m:Infinity};
}
/** A damage sum as printed for information: two decimals, "< 0.01" below that. */
export const damageText=(d:number)=>!Number.isFinite(d)?'—':d<.005?'< 0.01':d.toFixed(2);
/** The damage sum as a phrase for a note: "Σn_i/N_i = 0.06", "Σn_i/N_i < 0.01". */
export const damageSum=(d:number)=>{const t=damageText(d);return t.startsWith('<')?`Σn_i/N_i ${t}`:`Σn_i/N_i = ${t}`;};
/** The LaTeX of the equivalent-range check, slope m (3, or 6 for Category F), with an optional suffix. */
export const minerEquation=(suffix='',m=3,R=false)=>`f_{sr,eq}=\\left(\\frac{\\sum_in_if_{sr,i}^{${m}}}{n_{SR}}\\right)^{1/${m}}\\le ${R?'R_{FIL}':''}F_{SR}${suffix}`;
/**
 * A duty-spectrum fatigue check by the project's governing fatigue method (ProjectInput.fatigue.method, the method the
 * fatigue table and the summary govern by): Miner's rule as the equivalent range f_sr,eq at n_SR (the default), or the
 * all-cycle bound, the largest duty-bin range f_sr,max at every one of the n_SR cycles. Both are compared with F_SR at
 * n_SR without the threshold. `basis(miner)` is the method sentence of the note: the check's own Miner sentence for
 * Miner's method; for the all-cycle bound a sentence stating it, with the Miner ratio for comparison.
 */
export function spectrumFatigue(method:'miner'|'all-cycle'|undefined,bins:readonly {cycles:number;range:number}[],allowable:(cycles:number)=>number,m=3){
 const eq=minerEquivalent(bins,allowable,m),all=method==='all-cycle',largest=Math.max(0,...bins.map(b=>b.range));
 return {...eq,range:all?largest:eq.range,equivalent:eq.range,allCycle:all,
  equation:(suffix='',R=false)=>all?`f_{sr,max}=\\max_if_{sr,i}\\le ${R?'R_{FIL}':''}F_{SR}${suffix}`:minerEquation(suffix,m,R),
  basis:(miner:string)=>all?`All-cycle bound, the project's fatigue method: the largest duty-bin range at every one of the n_SR = ${eq.cycles.toLocaleString('en-US')} cycles against F_SR at n_SR, no endurance-limit credit; Miner's rule over the bins gives f_sr,eq/F_SR = ${eq.capacity>0?(eq.range/eq.capacity).toFixed(2):'—'} for comparison (${damageSum(eq.damage)}).`:miner};
}
