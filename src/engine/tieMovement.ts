import type {CalculationSnapshot,CheckResult,ProjectInput} from './types';
import {available} from './aiscStrength';
import {boltCapacity,blockShear,compressionResistance,transverseFilletFatigue} from './connectionStrength';
import {fatigueSpectrumBin} from './detailAnalysis';
import {flangeTieGeometry,stiffenerTieGeometry,stiffenerTieJoint,tieRelease,columnGussetHeight,columnGussetExtension,tiePlies,tieEccentricity,tieLine} from './tieGeometry';
import {supportReactions} from './supportReactions';
import {sectionProperties} from './section';
import {simpleSupportInput} from './simpleSupports';
import {activeEndBearing,continuousBearings} from './endBearingInputs';
import {format} from './units';
import {tieShortening,craneColumnLayout} from './craneColumn';
import {activeStep} from './steppedColumnInputs';
import {twistMovement} from './columnTwistLimit';
import {upperShaftSection} from './steppedColumn';
import {fatigueThresholdKsi,finiteLife,KSI} from './fatigueConstants';
import {latexNumber,withinLimit} from './math';

const inch=25.4,alpha=12e-6,install=1/16*inch;
/**
 * Friction that holds the slide locked under a crane pass, as a resistance: the AISC J3.8 Class A slip coefficient 0.30
 * with the long-slot φ = 0.70 (Ω = 2.14).
 */
export const slideFrictionLow=(method:ProjectInput['method'])=>available(.3,method,.7,2.14);
/**
 * Upper bound of the static friction coefficient of the steel sleeves on the column gusset slot edges (unpainted steel on
 * steel), for the force a slide can deliver before it slips: the AISC J3.8 Class B slip coefficient, the higher class.
 */
export const slideFriction=.5;
/**
 * Tie force that stays on the tie between crane passes, N, unfactored: the largest dead load and parked crane (no impact)
 * support reaction at the rail eccentricity, as a torque over the restraint couple between the tie lines (or the bottom
 * flange). The column-end slide releases thermal travel only down to the friction under this force.
 */
export function sustainedTieForce(p:ProjectInput){
 const e=Math.abs(p.railEccentricity??0);if(!(e>0))return 0;
 const R=supportReactions(p,sectionProperties(p.section)).supports.reduce((m,v)=>Math.max(m,Math.max(0,v.D-v.Ds)+Math.max(0,v.Cd+v.Cv)),0);
 return R*e/Math.max(tieLine(p,'top')-tieLine(p,'bottom'),p.section.tf);
}
const compared=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,referenceIds=['aisc-connections','tieback-practice']):CheckResult=>({id,group:'Tie movement',title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,referenceIds});

/** Movements imposed on the paired tie bars between the girder and the column, mm and rad. */
export function tieMovements(s:CalculationSnapshot){
 const p=s.input,d=p.details!,a=s.designAnalysis!,r=s.detailResults!,t=d.brace,g=flangeTieGeometry(p),release=tieRelease(p);
 const setback=g?.attachment.longitudinalSetback??0,depth=p.section.d,ss=p.system==='simple'||activeEndBearing(p)?simpleSupportInput(p):undefined;
 const cyclicRotation=a.serviceRotation??0,rotation=a.endRotation;
 // Rotation about the bearing moves each bar along the runway by at most θ·d. Sliding ends move by the thermal
 // strain over the span, or on a bolted continuous girder over the distance from its locating support.
 const reach=p.system==='simple'?Math.max(...p.spans):Math.max(0,...continuousBearings(p).map(v=>v.distance));
 const thermal=ss?alpha*reach*Math.max(ss.temperatureRise,ss.temperatureFall):0;
 // On a column step the app models the support: the step's rotation over the tie distance and the cap flexure (steppedColumn.ts).
 const step=s.steppedColumn?.stepVertical;
 const support=r.bracket?.service.deflection?.value??r.rolledBracket?.service.deflection?.value??r.taperedHaunch?.service.deflection?.value??r.existingBracket?.service.seatDeflection?.value??step?.value;
 const supportSource=r.bracket||r.rolledBracket||r.taperedHaunch?'designed bracket':r.existingBracket?'new seat on the existing bracket (existing support deformation excluded)':step?'existing step: the column\'s rotation at the step over the tie distance plus the cap flexure':undefined;
 const cranes=p.cranes.length,impact=Math.max(...p.cranes.map(c=>c.impact));
 // A crane column tied to the building: the girder (on the crane column) and the building column the tie lands on shorten
 // differently; the tie's column-end slots take the larger shortening plus the erection tolerance (tieShortening, the
 // column tie's own slot rule), the crane column's crane-only part cycling with each pass.
 const layout=craneColumnLayout(p),differential=layout?tieShortening(p,layout.girderTie.elevation):undefined;
 // A new column's twist at its bracket seat (columnTwistLimit.ts) moves the located girder θe along the runway at every
 // crane start and stop: θ_s e cyclic, the factored traction's static (twistMovement). The tie sees it between its bolt
 // groups (twistTieShare): the column gusset turns θ with the column, so each ply takes θ·max(a + 2L/3, e − a − L/3), at
 // most θe, in place of θe.
 const free=t.length-2*((t.connection.rows-1)*t.connection.pitch+2*t.connection.edge)-columnGussetExtension(p);
 const offset=(s.existingColumn?.torsion as {offset?:number}|undefined)?.offset;
 const moved=twistMovement(s.existingColumn,p.method),share=moved.factored?twistTieShare(p,free,offset):1,twist={service:share*moved.service,factored:share*moved.factored,share};
 return {setback,differential,cyclicLongitudinal:cyclicRotation*depth+twist.service,longitudinal:rotation*depth+thermal+twist.factored,
  // The column-end slide's travel takes the whole twist translation θe (the share above is for the plies' bending).
  travel:rotation*depth+thermal+moved.factored,thermal,twist,cyclicRotation,rotation,
  support,supportSource,cranes,impact,
  // Column-end slide: the tie force left between crane passes, which holds the slide against thermal travel by friction.
  sustained:release?.slide?(r.demands as {braceSustained?:number}).braceSustained??sustainedTieForce(p):0,
  // Static vertical movement at the tie: every crane at once with impact, plus end rotation over the setback.
  vertical:(support??0)*cranes*(1+impact)+rotation*setback+(differential?.demand??0),cyclicVertical:(support??0)+cyclicRotation*setback+(differential?.cyclic??0),release,
  // Clear bar length between the gussets: both bolt groups and the column gusset's longer slotted end edge.
  freeLength:free};
}
/**
 * The share of the column twist movement θe (girder web line at e from the column axis) that the tie takes between its
 * bolt groups. The tie's column gusset is welded to the twisting column: its bolt group moves θ·y_c along the runway and
 * turns θ in plan with it; the girder end does not turn in plan. Each ply, fixed in both bolt groups over its clear
 * length L (slope-deflection, double curvature, end moments M = (2EI/L)(2θ_n + θ_f − 3ψ)): at a located girder end
 * (the girder moves θe with the seat) the larger end moment is that of a relative movement θ(a + 2L/3), at a sliding
 * end (the girder held, the seat moving under it) θ(y_c + 2L/3) = θ(e − a − L/3), with a the distance from the girder
 * web to the girder-end bolt group and y_c = e − a − L the column-end bolt group's distance from the column axis. Both
 * are less than θe; the end shears 12EI/L³ times θ(a + L/2) or θ(y_c + L/2) are less again, so the larger movement is
 * taken for the moments and the shears. Returns that over θe, at most one (one where the geometry is not known).
 */
export function twistTieShare(p:ProjectInput,free:number,offset?:number){
 const t=p.details!.brace,face=flangeTieGeometry(p)?.face??stiffenerTieGeometry(p)?.face;
 if(!offset||offset<=0||face===undefined||free<=0)return 1;
 const a=face-t.length+(t.connection.rows-1)*t.connection.pitch+2*t.connection.edge;
 return Math.min(1,Math.max(a+2*free/3,offset-a-free/3)/offset);
}

/**
 * Imposed-movement compatibility of the paired flat-bar ties, or of the single flexible plate (AISC DG7 §11.2).
 * Each ply is fixed at both bolt groups. End rotation and, at sliding ends, thermal travel bend the plies out of
 * plane (weak-axis double curvature); vertical support movement is released by the sleeved slots at the column
 * gusset, or else bends the plies in plane. A single plate laps one gusset face: its lap couple F·e adds to the
 * plate and gusset moments, and its fit-up offset at the sleeves adds to the strength movement.
 */
export function tieMovementChecks(s:CalculationSnapshot,ctx:{force:number;member:{tension:number;r:number;bucklingLength:number;compression:{capacity:number}}}):CheckResult[]{
 const p=s.input,d=p.details!,t=d.brace,c=t.connection,m=d.material,E=p.section.E,method=p.method,u=p.units,r=s.detailResults!;
 const mv=tieMovements(s),L=mv.freeLength,g=flangeTieGeometry(p),rel=mv.release,hg=columnGussetHeight(p);
 if(L<=0)return [];
 const plies=tiePlies(p),single=plies===1,e=tieEccentricity(p),bar=single?'plate':'bar',bars=single?'the plate':'the bars';
 // Single plate: it bears on the sleeve ends (or on the gusset) at the column end while lying on the girder gusset face,
 // and the field-welded column gusset is positioned within 1/16 in along the runway. The plate flexes to take up both.
 const fit=single?install+(rel?rel.clearance/2:0):0,share=g?.lapShare??0;
 const fmt=(v:number)=>format(v,'length',u,3),stress=(v:number)=>format(v,'stress',u,3);
 const totalCycles=d.spectrum.reduce((n,b)=>n+b.cycles,0),A=t.width*t.thickness,Sy=t.width*t.thickness**2/6;
 const Iy=t.width*t.thickness**3/12,Ix=t.thickness*t.width**3/12;
 const tg=t.gussetThickness,F=ctx.force;
 // A column-end slide on one sleeve row (two sleeves on a vertical line, `pinned`): the bar ends turn in plan there on the
 // sleeves, which tilt in their slots, held only as the sleeves' bearing on the slot sides shifts across the gusset
 // thickness, at most F_b·t_g/2 for the tie (F_b the force on the sleeves). Each ply is fixed at the girder bolt group and
 // propped at the sleeves while the slide is locked: column-end moment m_c = min(6EIΔ/L², F_b·t_g/(2n)), girder-end
 // moment 3EIΔ/L² + m_c/2 and shear (M_g + m_c)/L (slope-deflection); both ends fixed (two sleeve rows, or no slide):
 // 6EIΔ/L² at both ends and 12EIΔ/L³.
 const pinned=!!rel?.slide&&c.rows===1;
 const ends=(delta:number,bearing:number)=>{const fixed=6*E*Iy*delta/L**2;if(!pinned)return {mg:fixed,mc:fixed,v:2*fixed/L};const mc=Math.min(fixed,bearing*tg/(2*plies)),mg=fixed/2+mc/2;return {mg,mc,v:(mg+mc)/L};};
 const bend=(depth:number,delta:number)=>3*E*depth*delta/L**2;
 const checks:CheckResult[]=[];
 // Cyclic range: tie force range plus the crane-induced rotation; vertical movement only when not released. The single
 // plate also carries its share of the lap couple range ΔF·e at the bolt groups.
 // Column-end slide: over a crane pass the bar end shear is at most the sleeve friction μ(F_s + ΔF)/n, so the bar moment
 // range is at most twice μ(F_s + ΔF)L/n (taken as the equivalent movement in double curvature).
 const slideFatigue=rel?.slide?2*slideFriction*(mv.sustained+r.demands.braceFatigue)/plies*L:Infinity;
 // The sleeves bear with at most F_s + ΔF either way: the bearing-shift bound doubled, as the friction range.
 const fatigueBearing=2*(mv.sustained+r.demands.braceFatigue),cyclicEnds=ends(mv.cyclicLongitudinal,fatigueBearing),frictionBound=slideFatigue<cyclicEnds.mg-1e-9;
 const cyclicMg=Math.min(cyclicEnds.mg,slideFatigue),cyclicMc=Math.min(cyclicEnds.mc,cyclicMg),cyclicBars={mg:cyclicMg,mc:cyclicMc,v:(cyclicMg+cyclicMc)/L};
 const axialRange=r.demands.braceFatigue/(plies*A),lapRange=single?share*r.demands.braceFatigue*e/Sy:0,outRange=cyclicMg/Sy,inRange=rel?0:bend(t.width,mv.cyclicVertical);
 const catB=fatigueSpectrumBin('B',1,totalCycles).allowable;
 checks.push(compared('tie-move-fatigue',single?'Flexible plate at bolt groups · fatigue with imposed movement':'Tie bars at bolt groups · fatigue with imposed movement',axialRange+lapRange+outRange+inRange,catB,'stress',(single?'f_{sr}=\\frac{\\Delta F}{A_g}+\\frac{\\eta\\Delta Fe}{S_y}':'f_{sr}=\\frac{\\Delta F}{2A_g}')+(pinned?'+\\frac{M_g}{S_y};\\ M_g=\\frac{3EI\\Delta}{L^2}+\\frac{m_c}{2}':'+\\frac{3Et\\,\\theta_sd}{L^2}')+(rel?'':'+\\frac{3Ew\\,\\Delta_v}{L^2}')+'\\le F_{SR}\\ \\ \\text{(Cat. B)}',
  `AISC Table A-3.1 item 2.1 (gross section at pretensioned bolted joints), Category B, all ${totalCycles.toExponential(2)} duty cycles without threshold credit. Single-crane static support rotation ${mv.cyclicRotation.toExponential(3)} rad moves ${bars} ${fmt(mv.cyclicLongitudinal-mv.twist.service)} along the runway (θ·d about the bearing; this bounds the θ·d/2 of rotation about mid-depth)${mv.twist.service?`, and the column twist at the seat θ_s·e (column-twist) more, ${fmt(mv.twist.service)} between the bolt groups (${mv.twist.share<1?`${mv.twist.share.toFixed(2)} of θ_s·e: the column gusset turns with the column`:'θ_s·e'}), ${fmt(mv.cyclicLongitudinal)} in all`:''}; clear ${bar} length ${fmt(L)}, ${pinned?`fixed at the girder bolt group and propped on the one sleeve row of the slide, its end moment there m_c ${format(cyclicEnds.mc,'moment',u,3)}, at most the sleeves' bearing shift 2(F_s + ΔF)t_g/(2n)`:'both ends fixed'}. Axial ${stress(axialRange)}${single?`, lap couple share η = ${share.toFixed(3)} of ΔF·e ${stress(lapRange)}`:''}, out-of-plane ${stress(outRange)}${rel?'; vertical movement released at the column gusset':`, in-plane ${stress(inRange)} from ${fmt(mv.cyclicVertical)} vertical movement`}. Thermal travel cycles are few; their range is bounded by the strength check.${rel?.slide?` Column-end slide: the bar end shear cannot exceed the sleeve friction μ(F_s + ΔF)/2 (μ = ${slideFriction}, sustained tie force F_s = ${format(mv.sustained,'force',u,3)}), so the moment range is at most 2μ(F_s + ΔF)L/2 (the cantilever bound)${frictionBound?`, ${format(slideFatigue,'moment',u,3)} per bar, which governs`:', more than the rotation movement gives'}.`:''}`,['aisc-fatigue','tieback-practice']));
 checks.push(compared('tie-slenderness',single?'Flexible plate · slenderness':'Tie bars · slenderness',ctx.member.bucklingLength/ctx.member.r,200,'ratio','L_c/r\\le200;\\quad L_c=0.8L','AISC E2 user note. Out-of-plane buckling between the innermost bolt rows; both ends fixed in their bolt groups, K = 0.8 (AISC Commentary Table C-A-7.1: 0.65 recommended for fixed ends, 0.8 allows for the flexible column gusset), the same length as for P_c and P_e1.',['aisc-e']));
 // Strength: AISC H1-1 with the moments from the imposed movements. Thermal is a self-straining load T with factor 1.0 (ASCE 7 §2.3.4/§2.4.4).
 const P=ctx.force/plies,Pc=ctx.member.compression.capacity,phiB=(v:number)=>available(v,method,.9,1.67);
 // One end-condition model for P_c, P_e1 and the movement moment: each ply is fixed against rotation in both pretensioned
 // bolt groups, so the imposed movement bends it in double curvature, M = 6EIΔ/L². Both P_c (braceSystem) and P_e1 use
 // L_c = 0.8 × the length between the innermost bolt rows: Commentary Table C-A-7.1 recommends K = 0.65 for fixed ends,
 // and 0.8 allows for the rotational flexibility of the cantilevered column gusset (AISC 360-16 Appendix 8.2.1 permits
 // L_c1 below the member length where the analysis justifies it). Single plate: its share η of the lap couple P·e is a
 // uniform single-curvature moment (C_m = 1) amplified by B1. When αP_r reaches P_e1 the plate is elastically unstable:
 // no capacity, never a clamped amplifier.
 const alphaP=(method==='LRFD'?1:1.6)*P,Pe1=Math.PI**2*E*Iy/Math.max(ctx.member.bucklingLength,t.thickness)**2,unstable=single&&alphaP>=Pe1;
 const B1=single?unstable?Infinity:1/(1-alphaP/Pe1):1,lapMoment=single&&share>0?unstable?Infinity:B1*share*P*e:0;
 // Column-end slide (paired bars): the gusset floats along the runway on the sleeves, which bear on the slot sides with
 // the tie force. Thermal travel builds up slowly and slips out whenever the tie force drops between crane passes, down
 // to the friction under the sustained tie force F_s: the bars hold at most the end shear μ_uF_s (moment μ_uF_sL/n with
 // the column end free to rotate). Under a crane pass the sleeves lock while the friction μ_lF (lower bound) carries the
 // bars' end shear from the rotation movement θ·d and the held thermal travel, V_m, plus the AISC Appendix 6.2 nodal
 // brace force 0.01F: the bars are then braced at the column end (L_c as without the slide) and follow θ·d in double
 // curvature. Below the tie force F* = V_m/(μ_l − 0.01) the slide may slip: the bar ends are then free to translate at
 // the column but still held against rotation there, since turning the bar ends drives one sleeve row against the
 // slip, where it meets up to twice the friction (fixed-guided, L_c = 1.2 × the length between the innermost bolt rows,
 // Table C-A-7.1 case (c)), with at most the moment of the friction μ_u it delivers, μ_uP_rL + P_rΔ. H1 is the larger of
 // the two states.
 const slide=rel?.slide??0,rotationMove=mv.longitudinal-mv.thermal,mu=slideFriction,muLow=slideFrictionLow(method);
 const lockEnds=ends(rotationMove,F),heldEnds=ends(mv.thermal,mv.sustained);
 const thermalHeld=slide?Math.min(heldEnds.mg,mu*mv.sustained*L/plies):0,slideElastic=lockEnds.mg+thermalHeld;
 const lockShear=slide?plies*lockEnds.v+Math.min(plies*heldEnds.v,mu*mv.sustained):0,lockForce=lockShear/(muLow-.01);
 // Slipping, the bar ends translate at the column: fixed-guided on two sleeve rows (Table C-A-7.1 case (c), K = 1.2),
 // fixed-free on one (case (e), K = 2.1), over the length between the innermost bolt rows.
 const slipK=pinned?2.1:1.2,PcSlip=slide?compressionResistance(t.width*t.thickness,ctx.member.r,slipK*ctx.member.bucklingLength/.8,E,m.Fy,method).capacity:Pc;
 const Mcy=phiB(m.Fy*t.width*t.thickness**2/4);
 const Mx=rel?0:6*E*Ix*mv.vertical/L**2,Mcx=phiB(m.Fy*t.thickness*t.width**2/6);
 const interaction=(force:number,capacity:number,moment:number)=>{const ratio=force/capacity,moments=moment/Mcy+Mx/Mcx;return ratio>=.2?ratio+8/9*moments:ratio/2+moments;};
 // Slide states: locked at the full force where it exceeds F*, slipping up to the force F* (or the full force).
 const locked=slide>0&&ctx.force>lockForce,slipP=Math.min(ctx.force,lockForce)/plies,slipMoment=Math.min(slideElastic,mu*slipP*L+slipP*mv.longitudinal);
 const lockedH1=locked?interaction(P,Pc,slideElastic):0,slipH1=slide?interaction(slipP,PcSlip,slipMoment):0;
 const My=(slide?locked?slideElastic:Math.min(slideElastic,mu*P*L+P*mv.longitudinal):6*E*Iy*(mv.longitudinal+fit)/L**2)+lapMoment;
 const h1=slide?Math.max(lockedH1,slipH1):interaction(P,Pc,My);
 // The governing state's axial term P_r/P_c, stated for the remedy (openItems): the bending reduction H1 needs keeps it.
 // A longer clear length L' = √k·L: in the state whose movement moment falls at least as 1/L² (both ends fixed, or the
 // locked slide on two sleeve rows, which persists at longer lengths; no lap couple) the moment term falls at most as
 // 1/k while P_c falls with its own column curve (E3, as 1/k once elastic): the least of P_r/P_c(k) + 8/9 ΣM/M_c / k over
 // k ≥ 1 bounds the tie at any longer length (the slipping state is not bounded this way; H1 is the larger of the two).
 const slipGoverns=slide>0&&slipH1>lockedH1,axialTerm=slipGoverns?slipP/PcSlip:P/Pc;
 const bounded=lapMoment===0&&(!slide||(locked&&!pinned)),boundA=P/Pc,boundH1=slide?lockedH1:h1;
 const cr=(k:number)=>compressionResistance(t.width*t.thickness,ctx.member.r,ctx.member.bucklingLength*Math.sqrt(k),E,m.Fy,method).capacity;
 const sumM=boundA>=.2?9/8*(boundH1-boundA):boundH1-boundA/2,atK=(k:number)=>{const a=boundA*cr(1)/cr(k);return a>=.2?a+8/9*sumM/k:a/2+sumM/k;};
 const longer=bounded&&Number.isFinite(boundH1)?Math.min(...Array.from({length:301},(_,i)=>atK(10**(i/100)))):undefined;
 const axialNote=` H1 governing state: P_r/P_c = ${axialTerm.toFixed(4)}.${longer!==undefined?` At a longer clear length the least H1 is about ${longer.toFixed(2)} (${slide?'the locked state: ':''}P_r/P_c = ${boundA.toFixed(3)} now, growing as P_c falls with the length; the movement moment falls as 1/L²).`:''}`;
 checks.push(compared('tie-move-strength',single?'Flexible plate · axial force with imposed movement':'Tie bars · axial force with imposed movement',h1,1,'ratio','\\frac{P_r}{P_c}+\\frac89\\left(\\frac{M_{ry}}{M_{cy}}+\\frac{M_{rx}}{M_{cx}}\\right)\\le1;\\quad M_r=\\frac{6EI\\Delta}{L^2}'+(single?'+B_1\\eta P_re':''),
  `AISC H1-1 ${single?'for the single plate':'per bar'}: P_r = ${format(P,'force',u,3)} of compression or tension, P_c = ${format(Pc,'force',u,3)} (compression governs). ${slide?`Column-end slide ${fmt(slide)} each way along the runway; θd = ${fmt(rotationMove-mv.twist.factored)} from the factored end rotation ${mv.rotation.toExponential(3)} rad${mv.twist.factored?` plus the column twist at the seat under the factored traction, ${fmt(mv.twist.factored)} between the bolt groups (column-twist${mv.twist.share<1?`, ${mv.twist.share.toFixed(2)} of θe: the column gusset turns with the column`:''})`:''}; thermal travel Δ_T = ${fmt(mv.thermal)} slips out between crane passes down to the friction μ_uF_s = ${format(mu*mv.sustained,'force',u,3)} under the sustained tie force F_s = ${format(mv.sustained,'force',u,3)} (dead load and a parked crane at the rail eccentricity; μ_u = ${mu}, AISC J3.8 Class B, upper bound). Locked under a crane pass while μ_lF ≥ V_m + 0.01F (μ_l = ${muLow.toFixed(3)}: Class A μ = 0.30 with the J3.8 long-slot ${method==='LRFD'?'φ = 0.70':'Ω = 2.14'}; V_m = ${format(lockShear,'force',u,3)}, the bars' end shear from θd and the held thermal travel${pinned?', each bar propped at the one sleeve row (3EIΔ/L³)':''}; Appendix 6.2 nodal brace force 0.01F), i.e. above F* = ${format(lockForce,'force',u,3)}: ${locked?`H1 = ${lockedH1.toFixed(3)} with M_ry = ${pinned?'M_g(θd) + min(M_g(Δ_T), μ_uF_sL/2), M_g = 3EIΔ/L² + m_c/2 with m_c ≤ F·t_g/(2n),':'6EI·θd/L² + min(6EI·Δ_T/L², μ_uF_sL/2)'} = ${format(slideElastic,'moment',u,3)} and the P_c above`:'the tie force does not reach it'}. Slipping up to ${locked?'F*':'the full force'}: P_r = ${format(slipP,'force',u,3)}, P_c = ${format(PcSlip,'force',u,3)} with the bar ends free to translate at the column, ${pinned?'and to turn on the one sleeve row (L_c = 2.1 × the length between the innermost bolt rows, fixed-free, Table C-A-7.1 case (e))':'still held against rotation by the two sleeve rows (L_c = 1.2 × the length between the innermost bolt rows, fixed-guided)'}, M_ry = min(the locked moment, μ_uP_rL + P_r(θd + Δ_T)) = ${format(slipMoment,'moment',u,3)}: H1 = ${slipH1.toFixed(3)}. The larger governs.`:`Out-of-plane movement ${fmt(mv.longitudinal+fit)} = factored end rotation ${mv.rotation.toExponential(3)} rad × d${mv.thermal?` + thermal travel ${fmt(mv.thermal)} at the sliding ends (12 × 10⁻⁶/°C over ${p.system==='simple'?'the longest bay':'the farthest support from the locating support'}, temperature change from erection)`:''}${mv.twist.factored?` + the column twist at the seat under the factored traction, ${fmt(mv.twist.factored)} between the bolt groups (column-twist${mv.twist.share<1?`, ${mv.twist.share.toFixed(2)} of θe: the column gusset turns with the column`:''})`:''}${single?` + fit-up offset ${fmt(fit)} (${rel?'half the sleeve clearance, the sleeve projection at the plate, and ':''}1/16 in column gusset position along the runway)`:''}.`} Weak-axis M_c = φF_yZ_y.${single?` Lap couple P_r·e with e = ${fmt(e)}: the plate takes the share η = ${share.toFixed(3)} by end stiffness 2EI_p/L against the gusset cantilever EI_g/L_g, ${unstable?`but the plate is elastically unstable under it: elastic instability, αP_r/P_e1 = ${(alphaP/Pe1).toFixed(2)} ≥ 1 (P_e1 = ${format(Pe1,'force',u,3)} over L_c = ${fmt(ctx.member.bucklingLength)}), no capacity`:`with B1 = ${B1.toFixed(3)} (C_m = 1, P_e1 = ${format(Pe1,'force',u,3)} over L_c = ${fmt(ctx.member.bucklingLength)}, the length of P_c), adding ${format(lapMoment,'moment',u,3)}`}; the gussets are checked for the whole couple.`:''}${rel?' Vertical movement is released at the column gusset.':` In-plane movement ${fmt(mv.vertical)}; strong-axis M_c = φF_yS_x.`}${slide?' The imposed-movement moment needs no amplification (displacement controlled); the slip bound carries its own P_rΔ.':' Both ends are fixed in their bolt groups (movement moment 6EIΔ/L², L_c = 0.8 × the length between the innermost bolt rows for P_c and P_e1). Reverse-curvature moments from end movement need no B1 amplification (C_m = 0.2).'}${axialNote}`,['aisc-h','asce','tieback-practice']));
 // Gussets: the plies deliver their end shear and moment about the vertical axis; the plates bend out of plane. A single
 // plate adds its lap couple F·e (e from the plate centroid to the gusset mid-plane) at both gussets.
 const lap=(force:number)=>force*e;
 // The bars' end actions per ply: without the slide both ends fixed under the movement; with it the girder-end moment
 // M_ry of the governing state, the column-end moment at most as large (one sleeve row: at most the bearing shift
 // F·t_g/(2n)), and their shear.
 const strengthBars=slide?(()=>{const mg=My-lapMoment,mc=pinned?Math.min(mg,F*tg/(2*plies)):mg;return {mg,mc,v:(mg+mc)/L};})():ends(mv.longitudinal+fit,F);
 // A stiffener tie's girder gusset is the bearing stiffener's extension past its outer edge (one plate) or a plate CJP
 // welded to that edge: its root is the gusset section at the stiffener edge, the gusset height h_g, with no fillet; the
 // bars' end moment acts at the gusset end, the gusset length from the stiffener edge away.
 const st=g?undefined:stiffenerTieGeometry(p),joint=st?stiffenerTieJoint(p):undefined,connection=(c.rows-1)*c.pitch+2*c.edge;
 // CJP to a thinner bearing stiffener: the out-of-plane moment passes through the joint into the stiffener edge, so the
 // root section is the thinner plate's (as the in-plane check tie-stiffener-cjp takes the thinner part).
 const stiffenerT=d.bearing.stiffenerThickness,girderT=st&&joint==='cjp'?Math.min(tg,stiffenerT):tg;
 const girderRoot=g?{b:g.rootLength,arm:g.topDrop-g.attachment.saddleThickness,weld:g.attachment.weldSize,t:tg,name:'flange saddle gusset',column:false,sleeves:0}
  :st?{b:st.height,arm:st.gussetLength,weld:0,t:girderT,name:joint==='integral'?'girder gusset (the bearing stiffener\'s extension, no weld)':`girder gusset (CJP to the bearing stiffener edge${stiffenerT<tg-1e-9?`, through the ${fmt(stiffenerT)} stiffener`:''})`,column:false,sleeves:0}
  :{b:c.weldLength,arm:c.projection,weld:c.weldSize,t:tg,name:'girder gusset',column:false,sleeves:0};
 // The column gusset spans the bolt group and the clear gap from the bar ends to the column flange. With the slide the
 // bars stand off its faces: it takes their forces only at the sleeve rows, whose centroid is a_s from the column face.
 const columnLength=g?.columnGussetLength??st?.columnGussetLength??connection;
 // A column gusset CJP welded to the column flange (brace.columnRoot 'cjp', with reinforcing fillets; UT) has no fillet
 // root: Category C at the weld toe in place of the fillet-root R_FIL reduction, the base metal governing its strength.
 const columnCjp=t.columnRoot==='cjp';
 const roots=[girderRoot,{b:hg,arm:columnLength,weld:columnCjp?0:c.weldSize,t:tg,name:columnCjp?'column gusset (CJP to the column flange)':'column gusset',column:true,sleeves:Math.max(0,columnLength-columnGussetExtension(p)-connection/2)}];
 // End shear and moment about the vertical axis delivered at a root, the shear over the arm included. With the slide the
 // force along the runway at the sleeves is at most the friction μF (`friction`): it bounds the bars' end shear, and the
 // column gusset takes the bars' end moment only as the friction couple of the two sleeve rows, μF·s/2.
 // At the slide the bars' end moment reaches the sleeve rows as m_c + V(a − a_s) (the bar between the gusset start and
 // the sleeves), delivered up to the friction couple of the sleeve rows and the shift of their bearing across the gusset,
 // μF·s/2 + F_b·t_g/2; the root takes that and V over a_s.
 type Bars={mg:number;mc:number;v:number};
 const couple=(c.rows-1)*c.pitch;
 const act=(x:typeof roots[number],a:Bars,friction:number,bearing:number)=>{const v=Math.min(plies*a.v,friction),slid=x.column&&Number.isFinite(friction);
  if(!x.column)return {v,m:plies*a.mg+v*x.arm};
  return {v,m:slid?Math.min(plies*a.mc+v*(x.arm-x.sleeves),friction*couple/2+bearing*tg/2)+v*x.sleeves:plies*a.mc+v*x.arm};};
 const slideRoots=slide?` Column-end slide: the bars' moment M_ry of the governing state; the end shear is bounded by the sleeve friction μ_uF = ${format(slideFriction*F,'force',u,3)} (μ_u = ${slideFriction}), and the column gusset takes the bars' end moment only through the sleeves, at most ${c.rows>1?'the friction couple of the two sleeve rows μ_uF·s/2 plus ':''}the shift of their bearing across the gusset F·t_g/2, with the friction at the sleeve rows ${fmt(roots[1].sleeves)} from the column face.`:'';
 const strengthFriction=slide?slideFriction*F:Infinity,fatigueFriction=slide?2*slideFriction*(mv.sustained+r.demands.braceFatigue):Infinity;
 const plate=(x:typeof roots[number],force:number)=>6*(act(x,strengthBars,strengthFriction,force).m+lap(force))/(x.b*x.t**2)+force/(x.b*x.t);
 const weld=(x:typeof roots[number],force:number)=>{const a=act(x,strengthBars,strengthFriction,force);return (force/(2*x.b)+(a.m+lap(force))/(tg*x.b)+a.v/(2*x.b))/(x.weld/Math.SQRT2);};
 const worst=(f:(x:typeof roots[number])=>number,set=roots)=>set.reduce((a,x)=>f(x)>f(a)?x:a,set[0]);
 // Only fillet-welded roots for the weld check: the stiffener tie's girder gusset has none (tie-move-gusset).
 const welded=roots.filter(x=>x.weld>0),gp=worst(x=>plate(x,F)),gw=worst(x=>weld(x,F),welded);
 checks.push(compared('tie-move-gusset','Tie gussets · out-of-plane bending from movement',plate(gp,F),phiB(m.Fy),'stress',single?'f=\\frac{6(M+Va+Fe)}{bt_g^2}+\\frac{F}{bt_g};\\quad V=\\frac{12EI\\Delta}{L^3},\\;M=\\frac{6EI\\Delta}{L^2}':'f=\\frac{6(M+Va)}{bt_g^2}+\\frac{F}{bt_g};\\quad V=\\frac{24EI\\Delta}{L^3},\\;M=\\frac{12EI\\Delta}{L^2}',
  `Governing ${gp.name}: root length ${fmt(gp.b)}, arm ${fmt(gp.arm)}. ${single?`One plate on one gusset face, both ends fixed, imposed movement ${fmt(mv.longitudinal+fit)} including the fit-up offset; lap couple F·e with e = ${fmt(e)}`:`Two bars, ${pinned?'fixed at the girder bolt group, free to turn on the one sleeve row of the slide':'both ends fixed'}, ${slide?`bars' end moment ${format(strengthBars.mg,'moment',u,3)} each at the girder end, ${format(strengthBars.mc,'moment',u,3)} at the column end`:`imposed movement ${fmt(mv.longitudinal+fit)}`}`}; full tie force added.${slideRoots}`));
 if(!gw)checks.push({id:'tie-move-weld',group:'Tie movement',title:'Tie gusset root welds · tie force with movement',status:'not-applicable',equation:'',note:'Both gusset roots are CJP welded or one plate with the stiffener: no fillet at either root; the base metal governs (tie-move-gusset).',referenceIds:['aisc-connections']});
 else checks.push(compared('tie-move-weld','Tie gusset root welds · tie force with movement',weld(gw,F),available(.6*m.Fexx,method,.75,2),'stress',single?'f_w=\\left[\\frac{F}{2b}+\\frac{M+Va+Fe}{t_gb}+\\frac{V}{2b}\\right]/(0.707w)':'f_w=\\left[\\frac{F}{2b}+\\frac{M+Va}{t_gb}+\\frac{V}{2b}\\right]/(0.707w)',`Governing ${gw.name}. The moment about the vertical axis${single?', including the lap couple,':''} is taken as a couple on the two fillet lines at the gusset thickness; forces added by magnitude.${st?` The girder gusset of the stiffener tie has no fillet at its root (${joint==='integral'?'one plate with the bearing stiffener':'CJP to the stiffener edge, the base metal governing'}): it is checked as a plate (tie-move-gusset).`:''}${slideRoots}`));
 const fatigueRoot=roots.reduce((a,x)=>{const range=r.demands.braceFatigue/(x.b*x.t)+6*(act(x,cyclicBars,fatigueFriction,fatigueBearing).m+lap(r.demands.braceFatigue))/(x.b*x.t**2),cap=x.weld>0?Math.min(fatigueSpectrumBin('C',1,totalCycles).allowable,transverseFilletFatigue(tg,x.weld,totalCycles).capacity):fatigueSpectrumBin('C',1,totalCycles).allowable;return range/cap>a.range/a.cap?{x,range,cap}:a;},{x:roots[0],range:0,cap:1});
 checks.push(compared('tie-move-root-fatigue','Tie gusset roots · fatigue with imposed movement',fatigueRoot.range,fatigueRoot.cap,'stress',single?'f_{sr}=\\frac{\\Delta F}{bt_g}+\\frac{6(M_s+V_sa+\\Delta Fe)}{bt_g^2}\\le F_{SR}':'f_{sr}=\\frac{\\Delta F}{bt_g}+\\frac{6(M_s+V_sa)}{bt_g^2}\\le F_{SR}',`Governing ${fatigueRoot.x.name}. Tie force range plus the single-crane rotation movement${single?' and the lap couple range ΔF·e':''}, every cycle; ${fatigueRoot.x.weld>0?'transverse fillet root (AISC A-3.1 item 8.2 with R_FIL) bounded by Category C':fatigueRoot.x.column?'CJP to the column flange, no fillet root: Category C at the weld toe (transverse CJP T-joint with its reinforcing fillets, UT; item as tie-stiffener-cjp-fatigue)':`no fillet at this root: Category C base metal at the stiffener edge (${joint==='integral'?'the re-entrant corner of the stiffener\'s extension, cut to a 1 in radius and ground, as tie-stiffener-cjp-fatigue':'the transverse CJP to the stiffener edge with its reinforcement, as tie-stiffener-cjp-fatigue'}), the bars' moment at the gusset end plus their shear over the ${fmt(fatigueRoot.x.arm)} gusset length`}.${slide?` Column-end slide: the root range is bounded by the sleeve friction range 2μ_u(F_s + ΔF) as the end shear, and at the column gusset by the sleeves' couple (${c.rows>1?'friction over the sleeve rows and ':''}bearing shift across the gusset), the friction acting at the rows ${fmt(roots[1].sleeves)} from the column face.`:''}`,['aisc-fatigue']));
 // A stepped column's existing upper shaft under the column gussets of a stiffener tie (off the web, at the bearing stiffeners).
 checks.push(...upperShaftUnderGusset(s,F,r.demands.braceFatigue,hg,totalCycles));
 // Vertical movement at the column gusset.
 const byOthers=!mv.supportSource&&!mv.differential,diff=mv.differential;
 if(rel){
  const hole=rel.hole,db=c.diameter,bolt=boltCapacity({grade:c.grade,diameter:db,planes:2,surface:c.surface,shear:0,tension:0,method});
  const required=mv.vertical+install;
  checks.push(compared('tie-release-travel','Column gusset slots · vertical travel',required,rel.travel,'length',diff?'\\max(\\delta_c,\\delta_b)+\\delta_t+\\theta e+1/16\\,\\mathrm{in}\\le u':'\\Delta_sn(1+I)+\\theta e+1/16\\,\\mathrm{in}\\le u',diff?`The girder tie lands on the building column beside the crane column: the column-tie slot rule (crane-column-tie-slot-travel) at the girder tie, ${fmt(diff.z)} above the crane-column base: crane column shortening δc = PL/EA = ${fmt(diff.crane)} (runway dead load, crane with impact at the most loaded support, own weight; to its top), building column shortening δb = ${fmt(diff.building)} (its existing L and the largest of Lr, S and R, unfactored), the larger plus the erection tolerance ${fmt(diff.tolerance)}; plus the end rotation ${mv.rotation.toExponential(3)} rad over the ${fmt(mv.setback)} tie setback and a 1/16 in positioning allowance for the field-welded gusset. Once a sleeve bears on a slot end the tie would carry runway vertical load into the building column.`:byOthers?`The bracket is by others: its deflection is not included here and is limited by the criterion below. End rotation ${mv.rotation.toExponential(3)} rad over the ${fmt(mv.setback)} tie setback, plus a 1/16 in positioning allowance for the field-welded gusset.`:`Support deflection ${fmt(mv.support!)} (${mv.supportSource}, single crane) × ${mv.cranes} crane(s) × (1 + ${mv.impact}) impact, end rotation over the ${fmt(mv.setback)} setback, and a 1/16 in positioning allowance.`));
  checks.push(compared('tie-release-sleeve','Spacer sleeves · bolt installation load',1.5*bolt.pretension,m.Fy*rel.sleeveArea,'force','1.5T_b\\le\\phi F_yA_g;\\ \\phi=1.0\\ \\text{(sleeve)}',`Sleeve ${fmt(rel.od)} OD × ${fmt(hole)} bore × ${fmt(rel.sleeveLength)} long, F_y as the plate material. 1.5 × the minimum pretension bounds turn-of-nut overshoot (RCSC commentary); ${single?'the plate and an F436 washer bear':'the bars bear'} on the sleeve ends, not on the gusset.`));
  checks.push(compared('tie-release-clearance','Sleeve length · gusset free to slide',inch/32,rel.sleeveLength-tg,'length','L-t_g\\ge1/32\\,\\mathrm{in}\\ \\ \\text{(sleeve)}',`The sleeve projects beyond the gusset so ${single?'the pretensioned plate and washer do':'the pretensioned bars do'} not clamp it; total clearance over both faces.`));
  // The sleeves bear toward the gusset end, at the gusset's own end edge.
  const perBolt=F/(2*c.rows),lcEnd=rel.endEdge-rel.width/2,lcIn=c.rows>1?c.pitch-rel.width:Infinity;
  const bearing=available(Math.min(1.0*Math.min(lcEnd,lcIn)*tg*m.Fu,2.0*rel.od*tg*m.Fu),method,.75,2);
  checks.push(compared('tie-release-bearing','Column gusset · bearing of sleeves on the slots',perBolt,bearing,'force','R_n=\\min(1.0l_ctF_u,\\,2.0d_stF_u)','AISC J3.10 for long slots perpendicular to the force, with the sleeve diameter as d. Tie force shared by the sleeves of one flange connection.'));
  const An=(rel.height-2*rel.slot)*tg;
  checks.push(compared('tie-release-net','Column gusset · net section through the slots',F,Math.min(available(m.Fu*An,method,.75,2),available(m.Fy*rel.height*tg,method,.9,1.67)),'force','R_n=\\min(F_uA_n,F_yA_g);\\quad A_n=(h_g-2l_{slot})t_g','Vertical net section through both slot lengths.'));
  const lines=(c.rows-1)*c.pitch+rel.endEdge,Agv=2*lines*tg,Anv=2*(lines-(c.rows-.5)*rel.width)*tg,Ant=(c.gauge-rel.slot)*tg;
  checks.push(compared('tie-release-block','Column gusset · block shear through the slots',F,blockShear(Agv,Anv,Ant,m.Fy,m.Fu,method),'force','R_n=\\min(0.6F_uA_{nv},0.6F_yA_{gv})+F_uA_{nt}','Block between the two slot lines toward the free end; slot width deducted on the shear planes and slot length on the tension plane.'));
  checks.push(compared('tie-release-ligament','Column gusset · material between slots',rel.ligament,c.gauge-rel.slot,'length','g-l_{slot}\\ge(8/3)d_b-d_h+\\tfrac1{16}\\,\\mathrm{in}',`Same clear material as standard holes at the AISC J3.3 minimum spacing, plus a 1/16 in slot location tolerance on the slot spacing. The bolt gauge sets the slot spacing; the slot length plus that material, rounded up to 1/4 in, gives a practical gauge of ${fmt(rel.minimumGauge)}.`));
  if(c.rows>1)checks.push(compared('tie-release-pitch','Column gusset · material between slots of adjacent rows',rel.rowLigament,c.pitch-rel.width,'length','s-w_{slot}\\ge\\max(d_b,\\tfrac12\\,\\mathrm{in})+\\tfrac1{16}\\,\\mathrm{in}',`Along the tie, between the slots of adjacent bolt rows (pitch ${fmt(c.pitch)}, slots ${fmt(rel.width)} wide for the sleeves): a clear distance of at least the bolt diameter between slotted holes (AISC J3.3), not less than 1/2 in for cutting, plus a 1/16 in slot location tolerance; a pitch of at least ${fmt(rel.minimumPitch)}. The sleeves bear across this material toward the girder, checked by J3.10 tearout (tie-release-bearing).`));
  checks.push(compared('tie-release-edge','Column gusset · edge beyond slot ends',rel.edge+rel.tolerance,(rel.height-c.gauge)/2-rel.travel,'length','(h_g-g)/2-u\\ge1.5d_b-d_h/2+w_{slot}/2+\\tfrac1{16}\\,\\mathrm{in}','Same clear material as a standard hole at the AISC J3.4 minimum edge distance, plus a 1/16 in slot location tolerance at each slot end. The gusset height is that requirement rounded up to a 1/4 in cutting increment, and the root welds run the full height.'));
  checks.push(compared('tie-release-end-edge','Column gusset · end edge beyond slots',rel.edge+rel.tolerance,rel.endEdge,'length','e_g\\ge1.5d_b-d_h/2+w_{slot}/2+\\tfrac1{16}\\,\\mathrm{in}',`Toward the girder; the tie force pulls the sleeves toward this edge. Same clear material as a standard hole at the AISC J3.4 minimum edge distance, plus a 1/16 in slot location tolerance. The gusset end edge is that requirement rounded up to a 1/4 in cutting increment, and not less than the bar edge distance ${fmt(c.edge)}; the gusset runs ${fmt(rel.endEdge-c.edge)} past the bars' bolt group toward the girder.`));
  if(slide){
   // The gusset must never reach a bar: the whole factored movement each way, with the gusset's positioning allowance.
   checks.push(compared('tie-slide-travel','Column-end slide · travel along the runway',mv.travel+install,slide,'length','\\theta d+\\Delta_T+1/16\\,\\mathrm{in}\\le u_s',`The column gusset floats ${fmt(slide)} each way along the runway between the bars on sleeves ${fmt(rel.sleeveLength)} long (gusset ${fmt(tg)}). Factored end rotation × d ${fmt(rotationMove-mv.twist.factored)}${mv.twist.factored?` plus the column twist at the seat under the factored traction θe = ${fmt(mv.travel-(rotationMove-mv.twist.factored)-mv.thermal)}`:''}${mv.thermal?` plus thermal travel ${fmt(mv.thermal)}`:''} and a 1/16 in positioning allowance for the field-welded gusset, so the gusset never bears on a bar.`));
   // One sleeve row: the bar ends turn in plan on the two sleeves, which tilt in their slots by at most the slot clearance
   // over the gusset thickness. The bars' end rotation there, fixed at the girder end: 3Δ/(2L) propped by the locked
   // slide, or V·L²/(2EI) pushed by at most the friction V = μ_uF/n when it slips.
   if(pinned){
    const turn=Math.min(1.5*mv.travel/L,slideFriction*F/plies*L**2/(2*E*Iy)),tilt=(rel.width-rel.od)/tg;
    checks.push(compared('tie-slide-tilt','Column-end slide · sleeve tilt in the slots (one sleeve row)',turn,tilt,'ratio','\\varphi=\\min\\left(\\frac{3\\Delta}{2L},\\frac{\\mu_uFL^2}{2nEI}\\right)\\le\\frac{w_{slot}-d_s}{t_g}',`The bars bolt to the column gusset through one row of two sleeves on a vertical line, so their ends turn in plan there: each sleeve tilts in its slot, ${fmt(rel.width-rel.od)} wider than the sleeve, across the ${fmt(tg)} gusset (${tilt.toExponential(3)} rad) before it binds. Bar end rotation from the movement ${fmt(mv.travel)} (θ·d, thermal travel and twist, the slide travel) with the bars fixed at the girder bolt group and propped at the sleeves, 3Δ/(2L) = ${(1.5*mv.travel/L).toExponential(3)} rad, at most that of the slipping friction μ_uF/${plies} = ${format(slideFriction*F/plies,'force',u,3)} at the bar end, V L²/(2EI) = ${(slideFriction*F/plies*L**2/(2*E*Iy)).toExponential(3)} rad. The bars stand ${fmt(rel.barOffset)} off the gusset faces.`));
   }
   // Each sleeve spans between the bars, clamped by the pretensioned bolt, and takes its share of the tie force from the
   // gusset anywhere along the float.
   const Vs=F/(2*c.rows),span=rel.sleeveLength,Ms=4*Vs*span/27,Ss=Math.PI*(rel.od**4-hole**4)/(32*rel.od);
   checks.push(compared('tie-slide-sleeve','Slide sleeves · bending across the float with bolt pretension',bolt.pretension/rel.sleeveArea+Ms/Ss,phiB(m.Fy),'stress','f=\\frac{T_b}{A_s}+\\frac{4V_sL_s}{27S_s}\\le\\phi F_y',`Each sleeve spans ${fmt(span)} between the bars, both ends clamped by the pretensioned bolt, and takes V_s = F/${2*c.rows} = ${format(Vs,'force',u,3)} from the gusset anywhere along the float: largest fixed-end moment 4V_sL_s/27 (load at a third point). Sleeve ${fmt(rel.od)} OD × ${fmt(hole)} bore alone (the bolt inside is not counted), with the pretension T_b = ${format(bolt.pretension,'force',u,3)} on its area.`));
   // The bars stand off both gusset faces by the slide: fillers of that thickness at the girder gusset, one per shear plane.
   const filler=rel.barOffset,tf=filler/inch,factor=tf>.75+1e-9?0:tf<=.25?1:1-.4*(tf-.25);
   checks.push(compared('tie-slide-filler','Girder-end fillers · bolt shear through the fillers',F/(2*c.rows),factor*bolt.shear,'force','r_v\\le[1-0.4(t_f-0.25)]\\,\\phi r_n\\ \\ (t_f\\ \\text{in in.})',`Fillers ${fmt(filler)} between each bar and the girder gusset keep the bars parallel at the slide. AISC J5.2(b)(1): fillers over 1/4 in reduce the bolt shear strength by 1 − 0.4(t − 0.25) (t in in, fillers to 3/4 in): factor ${factor.toFixed(3)}. One filler in each slip plane: h_f = 1.0 for the slip check (J3.8); the fillers have the Class ${c.surface} faying surfaces of the bars.`));
  }
  if(byOthers)checks.push({id:'tie-move-support',group:'Tie movement',title:'Bracket by others · vertical deflection limit for the tie slots',status:'excluded',equation:'\\Delta_s\\le u-\\theta e-1/16\\,\\mathrm{in}',demand:undefined,capacity:Math.max(0,rel.travel-mv.vertical-install),quantity:'length',note:`Criterion for the bracket designer: vertical deflection at the bearing under all crane loads with impact at most ${fmt(Math.max(0,rel.travel-mv.vertical-install))}, within the column gusset slot travel.`,referenceIds:['tieback-practice']});
 }else if(byOthers){
  const left=catB-axialRange-lapRange-outRange,allowance=Math.max(0,left)*L**2/(3*E*t.width);
  checks.push({id:'tie-move-support',group:'Tie movement',title:'Bracket by others · vertical deflection limit for rigid ties',status:'excluded',equation:'\\Delta_s\\le(F_{SR}-f_{sr})L^2/(3Ew)',capacity:allowance,quantity:'length',note:`Criterion for the bracket designer: single-crane vertical deflection at the bearing at most ${fmt(allowance)} for the bars' remaining fatigue range. Release the column gusset with sleeved slots to remove this limit.`,referenceIds:['tieback-practice']});
 }
 return checks;
}

/**
 * The existing upper shaft of a stepped column under the column gussets of a paired-bar stiffener tie: each gusset is
 * welded to the inner flange in line with its girder's tie-side bearing stiffener, a distance a along the runway from the
 * upper shaft's web (the grid), so the tie force F bends the flange out of plane and, with one girder loaded at a shared
 * grid, twists the shaft by F·a. Mechanics models (references 'existing-column', 'aisc-fatigue' partial):
 *  - flange local bending: a plastic strip of length h_g + 2a′ (the force spread at 45° from the gusset to the web face,
 *    a′ = a − t_w/2) cantilevering a′ from the web face: F a′ ≤ φF_y(h_g + 2a′)t_f²/4 (a yield-line mechanism is stronger);
 *    the gusset and its weld within the flange;
 *  - torsion: T = F·a carried in Saint-Venant torsion of the upper shaft alone: τ = T t_f/J ≤ φ0.6F_y;
 *  - fatigue of the flange at the gusset weld toe: the elastic strip stress range 6ΔF a′/((h_g + 2a′)t_f²) at the
 *    all-cycle count, Category E (the bound for a fillet-welded attachment; Table A-3.1 item to be verified).
 */
function upperShaftUnderGusset(s:CalculationSnapshot,F:number,dF:number,hg:number,cycles:number):CheckResult[]{
 const p=s.input,st=activeStep(p),g=stiffenerTieGeometry(p);if(!st||!g)return [];
 const up=upperShaftSection(p).section,J=sectionProperties(up).J,u=p.units,fmt=(v:number)=>format(v,'length',u,3),tw=up.tw,tf=up.tf,bf=up.bf,Fy=up.Fy;
 const a=Math.max(0,...g.stations.map(v=>Math.abs(v.offset))),arm=Math.max(0,a-tw/2),strip=hg+2*arm,tg=p.details!.brace.gussetThickness,w=p.details!.brace.connection.weldSize;
 if(arm<=1e-6)return [];
 const bend=F*arm/available(Fy*strip*tf**2/4,p.method,.9,1.67),fit=(a+tg/2+w)/(bf/2),T=F*a,tor=T*tf/J/available(.6*Fy,p.method,.9,1.67);
 const ratio=Math.max(bend,fit,tor),range=6*dF*arm/(strip*tf**2),FSR=Math.max(fatigueThresholdKsi.E*KSI,finiteLife(1.1,cycles));
 const where=`The column gussets are welded to the existing upper shaft's inner flange (${fmt(bf)} × ${fmt(tf)}, ${upperShaftSection(p).source}) in line with the tie-side bearing stiffeners, ${fmt(a)} along the runway from its web (a′ = ${fmt(arm)} from the web face), gusset ${fmt(hg)} high.`;
 return [compared('column-upper-tie-flange','Upper shaft (existing) · flange bending and torsion under the off-web tie gussets',ratio,1,'ratio','\\frac{Fa^\\prime}{\\phi F_y(h_g+2a^\\prime)t_f^2/4};\\;\\frac{Fa\\,t_f/J}{\\phi0.6F_y};\\;\\frac{a+t_g/2+w}{b_f/2}\\le1',
   `${where} Tie force F = ${format(F,'force',u,3)} on one gusset: flange bending ${bend.toFixed(2)} (plastic strip ${fmt(strip)} long cantilevering a′; a yield-line mechanism is stronger), torsion of the upper shaft from one girder loaded at a shared grid, T = F·a = ${format(T,'moment',u,3)} in Saint-Venant torsion alone (J = ${format(J,'inertia',u,3)}): ${tor.toFixed(2)}; gusset and weld within the flange half width ${fit.toFixed(2)}.${ratio>1?' Not adequate: move the gusset over the web, add a stiffener behind the flange, or have the engineer of record evaluate the existing shaft.':''}`,['existing-column','aisc-connections']),
  compared('column-upper-tie-fatigue','Upper shaft (existing) · flange fatigue at the tie gusset weld toe (Category E)',range,FSR,'stress','f_{sr}=\\frac{6\\Delta F a^\\prime}{(h_g+2a^\\prime)t_f^2}\\le F_{SR}',
   `${where} Tie force range ΔF = ${format(dF,'force',u,3)}: the strip's elastic bending stress range at the weld toe, ${format(range,'stress',u,3)}, against Category E (a fillet-welded attachment, the bound category; Table A-3.1 item to be verified) at the all-cycle count ${cycles.toLocaleString('en-US')}: F_SR = ${format(FSR,'stress',u,3)}.`,['aisc-fatigue','existing-column'])];
}
