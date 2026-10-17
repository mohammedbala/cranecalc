import type {CalculationSnapshot,CheckResult,ProjectInput} from './types';
import {available} from './aiscStrength';
import {boltCapacity,blockShear,compressionResistance,transverseFilletFatigue} from './connectionStrength';
import {fatigueSpectrumBin} from './detailAnalysis';
import {flangeTieGeometry,stiffenerTieGeometry,tieRelease,columnGussetHeight,columnGussetExtension,tiePlies,tieEccentricity,tieLine} from './tieGeometry';
import {supportReactions} from './supportReactions';
import {sectionProperties} from './section';
import {simpleSupportInput} from './simpleSupports';
import {activeEndBearing,continuousBearings} from './endBearingInputs';
import {format} from './units';
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
 const support=r.bracket?.service.deflection?.value??r.rolledBracket?.service.deflection?.value??r.taperedHaunch?.service.deflection?.value??r.existingBracket?.service.seatDeflection?.value;
 const supportSource=r.bracket||r.rolledBracket||r.taperedHaunch?'designed bracket':r.existingBracket?'new seat on the existing bracket (existing support deformation excluded)':undefined;
 const cranes=p.cranes.length,impact=Math.max(...p.cranes.map(c=>c.impact));
 return {setback,cyclicLongitudinal:cyclicRotation*depth,longitudinal:rotation*depth+thermal,thermal,cyclicRotation,rotation,
  support,supportSource,cranes,impact,
  // Column-end slide: the tie force left between crane passes, which holds the slide against thermal travel by friction.
  sustained:release?.slide?(r.demands as {braceSustained?:number}).braceSustained??sustainedTieForce(p):0,
  // Static vertical movement at the tie: every crane at once with impact, plus end rotation over the setback.
  vertical:(support??0)*cranes*(1+impact)+rotation*setback,cyclicVertical:(support??0)+cyclicRotation*setback,release,
  // Clear bar length between the gussets: both bolt groups and the column gusset's longer slotted end edge.
  freeLength:t.length-2*((t.connection.rows-1)*t.connection.pitch+2*t.connection.edge)-columnGussetExtension(p)};
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
 const bend=(depth:number,delta:number)=>3*E*depth*delta/L**2;
 const checks:CheckResult[]=[];
 // Cyclic range: tie force range plus the crane-induced rotation; vertical movement only when not released. The single
 // plate also carries its share of the lap couple range ΔF·e at the bolt groups.
 // Column-end slide: over a crane pass the bar end shear is at most the sleeve friction μ(F_s + ΔF)/n, so the bar moment
 // range is at most twice μ(F_s + ΔF)L/n (taken as the equivalent movement in double curvature).
 const slideFatigue=rel?.slide?2*slideFriction*(mv.sustained+r.demands.braceFatigue)/plies*L:Infinity;
 const cyclic=Math.min(mv.cyclicLongitudinal,slideFatigue*L**2/(6*E*Iy));
 const axialRange=r.demands.braceFatigue/(plies*A),lapRange=single?share*r.demands.braceFatigue*e/Sy:0,outRange=bend(t.thickness,cyclic),inRange=rel?0:bend(t.width,mv.cyclicVertical);
 const catB=fatigueSpectrumBin('B',1,totalCycles).allowable;
 checks.push(compared('tie-move-fatigue',single?'Flexible plate at bolt groups · fatigue with imposed movement':'Tie bars at bolt groups · fatigue with imposed movement',axialRange+lapRange+outRange+inRange,catB,'stress',(single?'f_{sr}=\\frac{\\Delta F}{A_g}+\\frac{\\eta\\Delta Fe}{S_y}':'f_{sr}=\\frac{\\Delta F}{2A_g}')+'+\\frac{3Et\\,\\theta_sd}{L^2}'+(rel?'':'+\\frac{3Ew\\,\\Delta_v}{L^2}')+'\\le F_{SR}\\ \\ \\text{(Cat. B)}',
  `AISC Table A-3.1 item 2.1 (gross section at pretensioned bolted joints), Category B, all ${totalCycles.toExponential(2)} duty cycles without threshold credit. Single-crane static support rotation ${mv.cyclicRotation.toExponential(3)} rad moves ${bars} ${fmt(mv.cyclicLongitudinal)} along the runway (θ·d about the bearing; this bounds the θ·d/2 of rotation about mid-depth); clear ${bar} length ${fmt(L)}, both ends fixed. Axial ${stress(axialRange)}${single?`, lap couple share η = ${share.toFixed(3)} of ΔF·e ${stress(lapRange)}`:''}, out-of-plane ${stress(outRange)}${rel?'; vertical movement released at the column gusset':`, in-plane ${stress(inRange)} from ${fmt(mv.cyclicVertical)} vertical movement`}. Thermal travel cycles are few; their range is bounded by the strength check.${rel?.slide?` Column-end slide: the bar end shear cannot exceed the sleeve friction μ(F_s + ΔF)/2 (μ = ${slideFriction}, sustained tie force F_s = ${format(mv.sustained,'force',u,3)}), so the moment range is at most 2μ(F_s + ΔF)L/2${cyclic<mv.cyclicLongitudinal-1e-9?`, the equivalent of ${fmt(cyclic)} of movement, which governs`:', more than the rotation movement gives'}.`:''}`,['aisc-fatigue','tieback-practice']));
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
 const thermalHeld=slide?Math.min(6*E*Iy*mv.thermal/L**2,mu*mv.sustained*L/plies):0,slideElastic=6*E*Iy*rotationMove/L**2+thermalHeld;
 const lockShear=slide?plies*12*E*Iy*rotationMove/L**3+Math.min(plies*12*E*Iy*mv.thermal/L**3,mu*mv.sustained):0,lockForce=lockShear/(muLow-.01);
 const PcSlip=slide?compressionResistance(t.width*t.thickness,ctx.member.r,1.2*ctx.member.bucklingLength/.8,E,m.Fy,method).capacity:Pc;
 const Mcy=phiB(m.Fy*t.width*t.thickness**2/4);
 const Mx=rel?0:6*E*Ix*mv.vertical/L**2,Mcx=phiB(m.Fy*t.thickness*t.width**2/6);
 const interaction=(force:number,capacity:number,moment:number)=>{const ratio=force/capacity,moments=moment/Mcy+Mx/Mcx;return ratio>=.2?ratio+8/9*moments:ratio/2+moments;};
 // Slide states: locked at the full force where it exceeds F*, slipping up to the force F* (or the full force).
 const locked=slide>0&&ctx.force>lockForce,slipP=Math.min(ctx.force,lockForce)/plies,slipMoment=Math.min(slideElastic,mu*slipP*L+slipP*mv.longitudinal);
 const lockedH1=locked?interaction(P,Pc,slideElastic):0,slipH1=slide?interaction(slipP,PcSlip,slipMoment):0;
 const My=(slide?locked?slideElastic:Math.min(slideElastic,mu*P*L+P*mv.longitudinal):6*E*Iy*(mv.longitudinal+fit)/L**2)+lapMoment;
 const h1=slide?Math.max(lockedH1,slipH1):interaction(P,Pc,My);
 checks.push(compared('tie-move-strength',single?'Flexible plate · axial force with imposed movement':'Tie bars · axial force with imposed movement',h1,1,'ratio','\\frac{P_r}{P_c}+\\frac89\\left(\\frac{M_{ry}}{M_{cy}}+\\frac{M_{rx}}{M_{cx}}\\right)\\le1;\\quad M_r=\\frac{6EI\\Delta}{L^2}'+(single?'+B_1\\eta P_re':''),
  `AISC H1-1 ${single?'for the single plate':'per bar'}: P_r = ${format(P,'force',u,3)} of compression or tension, P_c = ${format(Pc,'force',u,3)} (compression governs). ${slide?`Column-end slide ${fmt(slide)} each way along the runway; θd = ${fmt(rotationMove)} from the factored end rotation ${mv.rotation.toExponential(3)} rad; thermal travel Δ_T = ${fmt(mv.thermal)} slips out between crane passes down to the friction μ_uF_s = ${format(mu*mv.sustained,'force',u,3)} under the sustained tie force F_s = ${format(mv.sustained,'force',u,3)} (dead load and a parked crane at the rail eccentricity; μ_u = ${mu}, AISC J3.8 Class B, upper bound). Locked under a crane pass while μ_lF ≥ V_m + 0.01F (μ_l = ${muLow.toFixed(3)}: Class A μ = 0.30 with the J3.8 long-slot ${method==='LRFD'?'φ = 0.70':'Ω = 2.14'}; V_m = ${format(lockShear,'force',u,3)}, the bars' end shear from θd and the held thermal travel; Appendix 6.2 nodal brace force 0.01F), i.e. above F* = ${format(lockForce,'force',u,3)}: ${locked?`H1 = ${lockedH1.toFixed(3)} with M_ry = 6EI·θd/L² + min(6EI·Δ_T/L², μ_uF_sL/2) = ${format(slideElastic,'moment',u,3)} and the P_c above`:'the tie force does not reach it'}. Slipping up to ${locked?'F*':'the full force'}: P_r = ${format(slipP,'force',u,3)}, P_c = ${format(PcSlip,'force',u,3)} with the bar ends free to translate at the column, still held against rotation by the two sleeve rows (L_c = 1.2 × the length between the innermost bolt rows, fixed-guided), M_ry = min(the locked moment, μ_uP_rL + P_r(θd + Δ_T)) = ${format(slipMoment,'moment',u,3)}: H1 = ${slipH1.toFixed(3)}. The larger governs.`:`Out-of-plane movement ${fmt(mv.longitudinal+fit)} = factored end rotation ${mv.rotation.toExponential(3)} rad × d${mv.thermal?` + thermal travel ${fmt(mv.thermal)} at the sliding ends (12 × 10⁻⁶/°C over ${p.system==='simple'?'the longest bay':'the farthest support from the locating support'}, temperature change from erection)`:''}${single?` + fit-up offset ${fmt(fit)} (${rel?'half the sleeve clearance, the sleeve projection at the plate, and ':''}1/16 in column gusset position along the runway)`:''}.`} Weak-axis M_c = φF_yZ_y.${single?` Lap couple P_r·e with e = ${fmt(e)}: the plate takes the share η = ${share.toFixed(3)} by end stiffness 2EI_p/L against the gusset cantilever EI_g/L_g, ${unstable?`but the plate is elastically unstable under it: elastic instability, αP_r/P_e1 = ${(alphaP/Pe1).toFixed(2)} ≥ 1 (P_e1 = ${format(Pe1,'force',u,3)} over L_c = ${fmt(ctx.member.bucklingLength)}), no capacity`:`with B1 = ${B1.toFixed(3)} (C_m = 1, P_e1 = ${format(Pe1,'force',u,3)} over L_c = ${fmt(ctx.member.bucklingLength)}, the length of P_c), adding ${format(lapMoment,'moment',u,3)}`}; the gussets are checked for the whole couple.`:''}${rel?' Vertical movement is released at the column gusset.':` In-plane movement ${fmt(mv.vertical)}; strong-axis M_c = φF_yS_x.`}${slide?' The imposed-movement moment needs no amplification (displacement controlled); the slip bound carries its own P_rΔ.':' Both ends are fixed in their bolt groups (movement moment 6EIΔ/L², L_c = 0.8 × the length between the innermost bolt rows for P_c and P_e1). Reverse-curvature moments from end movement need no B1 amplification (C_m = 0.2).'}`,['aisc-h','asce','tieback-practice']));
 // Gussets: the plies deliver their end shear and moment about the vertical axis; the plates bend out of plane. A single
 // plate adds its lap couple F·e (e from the plate centroid to the gusset mid-plane) at both gussets.
 const V=(delta:number)=>plies*12*E*Iy*delta/L**3,M=(delta:number)=>plies*6*E*Iy*delta/L**2,lap=(force:number)=>force*e;
 // With the slide, the movement that gives the bars' moment M_ry in double curvature (its end shear 2M/L bounds μP_r).
 const longitudinal=slide?(My-lapMoment)*L**2/(6*E*Iy):mv.longitudinal+fit;
 const girderRoot=g?{b:g.rootLength,arm:g.topDrop-g.attachment.saddleThickness,weld:g.attachment.weldSize,name:'flange saddle gusset',column:false}:{b:c.weldLength,arm:c.projection,weld:c.weldSize,name:'girder gusset',column:false};
 // The column gusset spans the bolt group and the clear gap from the bar ends to the column flange.
 const roots=[girderRoot,{b:hg,arm:g?.columnGussetLength??stiffenerTieGeometry(p)?.columnGussetLength??(c.rows-1)*c.pitch+2*c.edge,weld:c.weldSize,name:'column gusset',column:true}];
 const tg=t.gussetThickness,F=ctx.force;
 // End shear and moment about the vertical axis delivered at a root, the shear over the arm included. With the slide the
 // force along the runway at the sleeves is at most the friction μF (`friction`): it bounds the bars' end shear, and the
 // column gusset takes the bars' end moment only as the friction couple of the two sleeve rows, μF·s/2.
 const act=(x:typeof roots[number],delta:number,friction=Infinity)=>{const v=Math.min(V(delta),friction),m=x.column?Math.min(M(delta),friction*c.pitch/2):M(delta);return {v,m:m+v*x.arm};};
 const slideRoots=slide?` Column-end slide: the bars' moment M_ry of the governing state; the end shear is bounded by the sleeve friction μ_uF = ${format(slideFriction*F,'force',u,3)} (μ_u = ${slideFriction}), and the column gusset takes the bars' end moment only as the friction couple of the two sleeve rows, μ_uF·s/2.`:'';
 const strengthFriction=slide?slideFriction*F:Infinity,fatigueFriction=slide?2*slideFriction*(mv.sustained+r.demands.braceFatigue):Infinity;
 const plate=(x:typeof roots[number],delta:number,force:number)=>6*(act(x,delta,strengthFriction).m+lap(force))/(x.b*tg**2)+force/(x.b*tg);
 const weld=(x:typeof roots[number],delta:number,force:number)=>{const a=act(x,delta,strengthFriction);return (force/(2*x.b)+(a.m+lap(force))/(tg*x.b)+a.v/(2*x.b))/(x.weld/Math.SQRT2);};
 const worst=(f:(x:typeof roots[number])=>number)=>roots.reduce((a,x)=>f(x)>f(a)?x:a,roots[0]);
 const gp=worst(x=>plate(x,longitudinal,F)),gw=worst(x=>weld(x,longitudinal,F));
 checks.push(compared('tie-move-gusset','Tie gussets · out-of-plane bending from movement',plate(gp,longitudinal,F),phiB(m.Fy),'stress',single?'f=\\frac{6(M+Va+Fe)}{bt_g^2}+\\frac{F}{bt_g};\\quad V=\\frac{12EI\\Delta}{L^3},\\;M=\\frac{6EI\\Delta}{L^2}':'f=\\frac{6(M+Va)}{bt_g^2}+\\frac{F}{bt_g};\\quad V=\\frac{24EI\\Delta}{L^3},\\;M=\\frac{12EI\\Delta}{L^2}',
  `Governing ${gp.name}: root length ${fmt(gp.b)}, arm ${fmt(gp.arm)}. ${single?`One plate on one gusset face, both ends fixed, imposed movement ${fmt(longitudinal)} including the fit-up offset; lap couple F·e with e = ${fmt(e)}`:`Two bars, both ends fixed, imposed movement ${fmt(longitudinal)}`}; full tie force added.${slideRoots}`));
 checks.push(compared('tie-move-weld','Tie gusset root welds · tie force with movement',weld(gw,longitudinal,F),available(.6*m.Fexx,method,.75,2),'stress',single?'f_w=\\left[\\frac{F}{2b}+\\frac{M+Va+Fe}{t_gb}+\\frac{V}{2b}\\right]/(0.707w)':'f_w=\\left[\\frac{F}{2b}+\\frac{M+Va}{t_gb}+\\frac{V}{2b}\\right]/(0.707w)',`Governing ${gw.name}. The moment about the vertical axis${single?', including the lap couple,':''} is taken as a couple on the two fillet lines at the gusset thickness; forces added by magnitude.${slideRoots}`));
 const fatigueRoot=roots.reduce((a,x)=>{const range=r.demands.braceFatigue/(x.b*tg)+6*(act(x,cyclic,fatigueFriction).m+lap(r.demands.braceFatigue))/(x.b*tg**2),cap=Math.min(fatigueSpectrumBin('C',1,totalCycles).allowable,transverseFilletFatigue(tg,x.weld,totalCycles).capacity);return range/cap>a.range/a.cap?{x,range,cap}:a;},{x:roots[0],range:0,cap:1});
 checks.push(compared('tie-move-root-fatigue','Tie gusset roots · fatigue with imposed movement',fatigueRoot.range,fatigueRoot.cap,'stress',single?'f_{sr}=\\frac{\\Delta F}{bt_g}+\\frac{6(M_s+V_sa+\\Delta Fe)}{bt_g^2}\\le F_{SR}':'f_{sr}=\\frac{\\Delta F}{bt_g}+\\frac{6(M_s+V_sa)}{bt_g^2}\\le F_{SR}',`Governing ${fatigueRoot.x.name}. Tie force range plus the single-crane rotation movement${single?' and the lap couple range ΔF·e':''}, every cycle; transverse fillet root (AISC A-3.1 item 8.2 with R_FIL) bounded by Category C.${slide?` Column-end slide: the root range is bounded by the sleeve friction range 2μ_u(F_s + ΔF) as the end shear, and at the column gusset by its couple over the sleeve rows.`:''}`,['aisc-fatigue']));
 // Vertical movement at the column gusset.
 const byOthers=!mv.supportSource;
 if(rel){
  const hole=rel.hole,db=c.diameter,bolt=boltCapacity({grade:c.grade,diameter:db,planes:2,surface:c.surface,shear:0,tension:0,method});
  const required=mv.vertical+install;
  checks.push(compared('tie-release-travel','Column gusset slots · vertical travel',required,rel.travel,'length','\\Delta_sn(1+I)+\\theta e+1/16\\,\\mathrm{in}\\le u',byOthers?`The bracket is by others: its deflection is not included here and is limited by the criterion below. End rotation ${mv.rotation.toExponential(3)} rad over the ${fmt(mv.setback)} tie setback, plus a 1/16 in positioning allowance for the field-welded gusset.`:`Support deflection ${fmt(mv.support!)} (${mv.supportSource}, single crane) × ${mv.cranes} crane(s) × (1 + ${mv.impact}) impact, end rotation over the ${fmt(mv.setback)} setback, and a 1/16 in positioning allowance.`));
  checks.push(compared('tie-release-sleeve','Spacer sleeves · bolt installation load',1.5*bolt.pretension,m.Fy*rel.sleeveArea,'force','1.5T_b\\le\\phi F_yA_g;\\ \\phi=1.0\\ \\text{(sleeve)}',`Sleeve ${fmt(rel.od)} OD × ${fmt(hole)} bore × ${fmt(rel.sleeveLength)} long, F_y as the plate material. 1.5 × the minimum pretension bounds turn-of-nut overshoot (RCSC commentary); ${single?'the plate and an F436 washer bear':'the bars bear'} on the sleeve ends, not on the gusset.`));
  checks.push(compared('tie-release-clearance','Sleeve length · gusset free to slide',inch/32,rel.sleeveLength-tg,'length','L-t_g\\ge1/32\\,\\mathrm{in}\\ \\ \\text{(sleeve)}',`The sleeve projects beyond the gusset so ${single?'the pretensioned plate and washer do':'the pretensioned bars do'} not clamp it; total clearance over both faces.`));
  // The sleeves bear toward the gusset end, at the gusset's own end edge.
  const perBolt=F/(2*c.rows),lcEnd=rel.endEdge-rel.width/2,lcIn=c.pitch-rel.width;
  const bearing=available(Math.min(1.0*Math.min(lcEnd,lcIn)*tg*m.Fu,2.0*rel.od*tg*m.Fu),method,.75,2);
  checks.push(compared('tie-release-bearing','Column gusset · bearing of sleeves on the slots',perBolt,bearing,'force','R_n=\\min(1.0l_ctF_u,\\,2.0d_stF_u)','AISC J3.10 for long slots perpendicular to the force, with the sleeve diameter as d. Tie force shared by the sleeves of one flange connection.'));
  const An=(rel.height-2*rel.slot)*tg;
  checks.push(compared('tie-release-net','Column gusset · net section through the slots',F,Math.min(available(m.Fu*An,method,.75,2),available(m.Fy*rel.height*tg,method,.9,1.67)),'force','R_n=\\min(F_uA_n,F_yA_g);\\quad A_n=(h_g-2l_{slot})t_g','Vertical net section through both slot lengths.'));
  const lines=(c.rows-1)*c.pitch+rel.endEdge,Agv=2*lines*tg,Anv=2*(lines-(c.rows-.5)*rel.width)*tg,Ant=(c.gauge-rel.slot)*tg;
  checks.push(compared('tie-release-block','Column gusset · block shear through the slots',F,blockShear(Agv,Anv,Ant,m.Fy,m.Fu,method),'force','R_n=\\min(0.6F_uA_{nv},0.6F_yA_{gv})+F_uA_{nt}','Block between the two slot lines toward the free end; slot width deducted on the shear planes and slot length on the tension plane.'));
  checks.push(compared('tie-release-ligament','Column gusset · material between slots',rel.ligament,c.gauge-rel.slot,'length','g-l_{slot}\\ge(8/3)d_b-d_h+\\tfrac1{16}\\,\\mathrm{in}',`Same clear material as standard holes at the AISC J3.3 minimum spacing, plus a 1/16 in slot location tolerance on the slot spacing. The bolt gauge sets the slot spacing; the slot length plus that material, rounded up to 1/4 in, gives a practical gauge of ${fmt(rel.minimumGauge)}.`));
  checks.push(compared('tie-release-pitch','Column gusset · material between slots of adjacent rows',rel.rowLigament,c.pitch-rel.width,'length','s-w_{slot}\\ge\\max(d_b,\\tfrac12\\,\\mathrm{in})+\\tfrac1{16}\\,\\mathrm{in}',`Along the tie, between the slots of adjacent bolt rows (pitch ${fmt(c.pitch)}, slots ${fmt(rel.width)} wide for the sleeves): a clear distance of at least the bolt diameter between slotted holes (AISC J3.3), not less than 1/2 in for cutting, plus a 1/16 in slot location tolerance; a pitch of at least ${fmt(rel.minimumPitch)}. The sleeves bear across this material toward the girder, checked by J3.10 tearout (tie-release-bearing).`));
  checks.push(compared('tie-release-edge','Column gusset · edge beyond slot ends',rel.edge+rel.tolerance,(rel.height-c.gauge)/2-rel.travel,'length','(h_g-g)/2-u\\ge1.5d_b-d_h/2+w_{slot}/2+\\tfrac1{16}\\,\\mathrm{in}','Same clear material as a standard hole at the AISC J3.4 minimum edge distance, plus a 1/16 in slot location tolerance at each slot end. The gusset height is that requirement rounded up to a 1/4 in cutting increment, and the root welds run the full height.'));
  checks.push(compared('tie-release-end-edge','Column gusset · end edge beyond slots',rel.edge+rel.tolerance,rel.endEdge,'length','e_g\\ge1.5d_b-d_h/2+w_{slot}/2+\\tfrac1{16}\\,\\mathrm{in}',`Toward the girder; the tie force pulls the sleeves toward this edge. Same clear material as a standard hole at the AISC J3.4 minimum edge distance, plus a 1/16 in slot location tolerance. The gusset end edge is that requirement rounded up to a 1/4 in cutting increment, and not less than the bar edge distance ${fmt(c.edge)}; the gusset runs ${fmt(rel.endEdge-c.edge)} past the bars' bolt group toward the girder.`));
  if(slide){
   // The gusset must never reach a bar: the whole factored movement each way, with the gusset's positioning allowance.
   checks.push(compared('tie-slide-travel','Column-end slide · travel along the runway',mv.longitudinal+install,slide,'length','\\theta d+\\Delta_T+1/16\\,\\mathrm{in}\\le u_s',`The column gusset floats ${fmt(slide)} each way along the runway between the bars on sleeves ${fmt(rel.sleeveLength)} long (gusset ${fmt(tg)}). Factored end rotation × d ${fmt(rotationMove)}${mv.thermal?` plus thermal travel ${fmt(mv.thermal)}`:''} and a 1/16 in positioning allowance for the field-welded gusset, so the gusset never bears on a bar.`));
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
