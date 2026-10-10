import type {CalculationSnapshot,CheckResult} from './types';
import {available} from './aiscStrength';
import {boltCapacity,blockShear,transverseFilletFatigue} from './connectionStrength';
import {fatigueSpectrumBin} from './detailAnalysis';
import {flangeTieGeometry,tieRelease,columnGussetHeight} from './tieGeometry';
import {simpleSupportInput} from './simpleSupports';
import {format} from './units';
import {latexNumber,withinLimit} from './math';

const inch=25.4,alpha=12e-6,install=1/16*inch;
const compared=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,referenceIds=['aisc-connections','tieback-practice']):CheckResult=>({id,group:'Tie movement',title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,referenceIds});

/** Movements imposed on the paired tie bars between the girder and the column, mm and rad. */
export function tieMovements(s:CalculationSnapshot){
 const p=s.input,d=p.details!,a=s.designAnalysis!,r=s.detailResults!,t=d.brace,g=flangeTieGeometry(p),release=tieRelease(p);
 const setback=g?.attachment.longitudinalSetback??0,depth=p.section.d,ss=p.system==='simple'?simpleSupportInput(p):undefined;
 const cyclicRotation=a.serviceRotation??0,rotation=a.endRotation;
 // Rotation about the bearing moves each bar along the runway by at most θ·d.
 const thermal=ss?alpha*Math.max(...p.spans)*Math.max(ss.temperatureRise,ss.temperatureFall):0;
 const support=r.bracket?.service.deflection?.value??r.existingBracket?.service.seatDeflection?.value;
 const supportSource=r.bracket?'designed bracket':r.existingBracket?'new seat on the existing bracket (existing support deformation excluded)':undefined;
 const cranes=p.cranes.length,impact=Math.max(...p.cranes.map(c=>c.impact));
 return {setback,cyclicLongitudinal:cyclicRotation*depth,longitudinal:rotation*depth+thermal,thermal,cyclicRotation,rotation,
  support,supportSource,cranes,impact,
  // Static vertical movement at the tie: every crane at once with impact, plus end rotation over the setback.
  vertical:(support??0)*cranes*(1+impact)+rotation*setback,cyclicVertical:(support??0)+cyclicRotation*setback,release,
  freeLength:t.length-2*((t.connection.rows-1)*t.connection.pitch+2*t.connection.edge)};
}

/**
 * Imposed-movement compatibility of the paired flat-bar ties. Each bar is
 * fixed at both bolt groups. End rotation and, at sliding ends, thermal
 * travel bend the bars out of plane; vertical support movement is released by
 * the sleeved slots at the column gusset, or else bends the bars in plane.
 */
export function tieMovementChecks(s:CalculationSnapshot,ctx:{force:number;member:{tension:number;r:number;bucklingLength:number;compression:{capacity:number}}}):CheckResult[]{
 const p=s.input,d=p.details!,t=d.brace,c=t.connection,m=d.material,E=p.section.E,method=p.method,u=p.units,r=s.detailResults!;
 const mv=tieMovements(s),L=mv.freeLength,g=flangeTieGeometry(p),rel=mv.release,hg=columnGussetHeight(p);
 if(L<=0)return [];
 const fmt=(v:number)=>format(v,'length',u,3),stress=(v:number)=>format(v,'stress',u,3);
 const totalCycles=d.spectrum.reduce((n,b)=>n+b.cycles,0),A=t.width*t.thickness;
 const Iy=t.width*t.thickness**3/12,Ix=t.thickness*t.width**3/12;
 const bend=(depth:number,delta:number)=>3*E*depth*delta/L**2;
 const checks:CheckResult[]=[];
 // Cyclic range: tie force range plus the crane-induced rotation; vertical movement only when not released.
 const axialRange=r.demands.braceFatigue/(2*A),outRange=bend(t.thickness,mv.cyclicLongitudinal),inRange=rel?0:bend(t.width,mv.cyclicVertical);
 const catB=fatigueSpectrumBin('B',1,totalCycles).allowable;
 checks.push(compared('tie-move-fatigue','Tie bars at bolt groups · fatigue with imposed movement',axialRange+outRange+inRange,catB,'stress','\\Delta f=\\frac{\\Delta F}{2A_g}+\\frac{3Et\\,\\theta_sd}{L^2}'+(rel?'':'+\\frac{3Ew\\,\\Delta_v}{L^2}')+'\\le F_{SR,B}',
  `AISC Table A-3.1 item 2.1 (gross section at pretensioned bolted joints), Category B, all ${totalCycles.toExponential(2)} duty cycles without threshold credit. Single-crane static support rotation ${mv.cyclicRotation.toExponential(3)} rad moves the bars ${fmt(mv.cyclicLongitudinal)} along the runway (θ·d bound); clear bar length ${fmt(L)}, both ends fixed. Axial ${stress(axialRange)}, out-of-plane ${stress(outRange)}${rel?'; vertical movement released at the column gusset':`, in-plane ${stress(inRange)} from ${fmt(mv.cyclicVertical)} vertical movement`}. Thermal travel cycles are few; their range is bounded by the strength check.`,['aisc-fatigue','tieback-practice']));
 checks.push(compared('tie-slenderness','Tie bars · slenderness',ctx.member.bucklingLength/ctx.member.r,200,'ratio','KL/r\\le200;\\quad KL=0.8L_{rows}','AISC E2 user note. Out-of-plane buckling between the innermost bolt rows, fixed in the girder bolt group and pinned at the column end (K = 0.8, AISC Commentary Table C-A-7.1).',['aisc-e']));
 // Strength: AISC H1-1 with the moments from the imposed movements. Thermal is a self-straining load T with factor 1.0 (ASCE 7 §2.3.4/§2.4.4).
 const P=ctx.force/2,Pc=ctx.member.compression.capacity,phiB=(v:number)=>available(v,method,.9,1.67);
 const My=6*E*Iy*mv.longitudinal/L**2,Mcy=phiB(m.Fy*t.width*t.thickness**2/4);
 const Mx=rel?0:6*E*Ix*mv.vertical/L**2,Mcx=phiB(m.Fy*t.thickness*t.width**2/6);
 const ratio=P/Pc,moments=My/Mcy+Mx/Mcx,h1=ratio>=.2?ratio+8/9*moments:ratio/2+moments;
 checks.push(compared('tie-move-strength','Tie bars · axial force with imposed movement',h1,1,'ratio','\\frac{P_r}{P_c}+\\frac89\\left(\\frac{M_{ry}}{M_{cy}}+\\frac{M_{rx}}{M_{cx}}\\right)\\le1;\\quad M_r=\\frac{6EI\\Delta}{L^2}',
  `AISC H1-1 per bar: P_r = ${format(P,'force',u,3)} of compression or tension, P_c = ${format(Pc,'force',u,3)} (compression governs). Out-of-plane movement ${fmt(mv.longitudinal)} = factored end rotation ${mv.rotation.toExponential(3)} rad × d${mv.thermal?` + thermal travel ${fmt(mv.thermal)} at the sliding ends (12 × 10⁻⁶/°C over the longest bay, temperature change from erection)`:''}. Weak-axis M_c = φF_yZ_y.${rel?' Vertical movement is released at the column gusset.':` In-plane movement ${fmt(mv.vertical)}; strong-axis M_c = φF_yS_x.`} Reverse-curvature moments from end movement need no B1 amplification (C_m = 0.2).`,['aisc-h','asce','tieback-practice']));
 // Gussets: two bars deliver their end shear and moment about the vertical axis; the plates bend out of plane.
 const V=(delta:number)=>2*12*E*Iy*delta/L**3,M=(delta:number)=>2*6*E*Iy*delta/L**2;
 const girderRoot=g?{b:g.rootLength,arm:g.topDrop-g.attachment.saddleThickness,weld:g.attachment.weldSize,name:'flange saddle gusset'}:{b:c.weldLength,arm:c.projection,weld:c.weldSize,name:'girder gusset'};
 const roots=[girderRoot,{b:hg,arm:g?.connection??(c.rows-1)*c.pitch+2*c.edge,weld:c.weldSize,name:'column gusset'}];
 const tg=t.gussetThickness,F=ctx.force;
 const plate=(x:typeof roots[number],delta:number,force:number)=>6*(M(delta)+V(delta)*x.arm)/(x.b*tg**2)+force/(x.b*tg);
 const weld=(x:typeof roots[number],delta:number,force:number)=>(force/(2*x.b)+(M(delta)+V(delta)*x.arm)/(tg*x.b)+V(delta)/(2*x.b))/(x.weld/Math.SQRT2);
 const worst=(f:(x:typeof roots[number])=>number)=>roots.reduce((a,x)=>f(x)>f(a)?x:a,roots[0]);
 const gp=worst(x=>plate(x,mv.longitudinal,F)),gw=worst(x=>weld(x,mv.longitudinal,F));
 checks.push(compared('tie-move-gusset','Tie gussets · out-of-plane bending from movement',plate(gp,mv.longitudinal,F),phiB(m.Fy),'stress','f=\\frac{6(M+Va)}{bt_g^2}+\\frac{F}{bt_g};\\quad V=\\frac{24EI\\Delta}{L^3},\\;M=\\frac{12EI\\Delta}{L^2}',
  `Governing ${gp.name}: root length ${fmt(gp.b)}, arm ${fmt(gp.arm)}. Two bars, both ends fixed, imposed movement ${fmt(mv.longitudinal)}; full tie force added conservatively.`));
 checks.push(compared('tie-move-weld','Tie gusset root welds · tie force with movement',weld(gw,mv.longitudinal,F),available(.6*m.Fexx,method,.75,2),'stress','f_w=\\left[\\frac{F}{2b}+\\frac{M+Va}{t_gb}+\\frac{V}{2b}\\right]/(0.707w)',`Governing ${gw.name}. The moment about the vertical axis is taken as a couple on the two fillet lines at the gusset thickness; forces added by magnitude.`));
 const fatigueRoot=roots.reduce((a,x)=>{const range=r.demands.braceFatigue/(x.b*tg)+6*(M(mv.cyclicLongitudinal)+V(mv.cyclicLongitudinal)*x.arm)/(x.b*tg**2),cap=Math.min(fatigueSpectrumBin('C',1,totalCycles).allowable,transverseFilletFatigue(tg,x.weld,totalCycles).capacity);return range/cap>a.range/a.cap?{x,range,cap}:a;},{x:roots[0],range:0,cap:1});
 checks.push(compared('tie-move-root-fatigue','Tie gusset roots · fatigue with imposed movement',fatigueRoot.range,fatigueRoot.cap,'stress','\\Delta f=\\frac{\\Delta F}{bt_g}+\\frac{6(M_s+V_sa)}{bt_g^2}\\le F_{SR}',`Governing ${fatigueRoot.x.name}. Tie force range plus the single-crane rotation movement, every cycle; transverse fillet root (AISC A-3.1 item 8.2 with R_FIL) bounded by Category C.`,['aisc-fatigue']));
 // Vertical movement at the column gusset.
 const byOthers=!mv.supportSource;
 if(rel){
  const hole=rel.hole,db=c.diameter,bolt=boltCapacity({grade:c.grade,diameter:db,planes:2,surface:c.surface,shear:0,tension:0,method});
  const required=mv.vertical+install;
  checks.push(compared('tie-release-travel','Column gusset slots · vertical travel',required,rel.travel,'length','u_{req}=\\Delta_{support}n(1+I)+\\theta d_{setback}+1/16\\,in\\le u',byOthers?`The bracket is by others: its deflection is not included here and is limited by the criterion below. End rotation ${mv.rotation.toExponential(3)} rad over the ${fmt(mv.setback)} tie setback, plus a 1/16 in positioning allowance for the field-welded gusset.`:`Support deflection ${fmt(mv.support!)} (${mv.supportSource}, single crane) × ${mv.cranes} crane(s) × (1 + ${mv.impact}) impact, end rotation over the ${fmt(mv.setback)} setback, and a 1/16 in positioning allowance.`));
  checks.push(compared('tie-release-sleeve','Spacer sleeves · bolt installation load',1.5*bolt.pretension,m.Fy*rel.sleeveArea,'force','1.5T_b\\le F_yA_{sleeve}',`Sleeve ${fmt(rel.od)} OD × ${fmt(hole)} bore × ${fmt(rel.sleeveLength)} long, F_y as the plate material. 1.5 × the minimum pretension bounds turn-of-nut overshoot (RCSC commentary); the bars bear on the sleeve ends, not on the gusset.`));
  checks.push(compared('tie-release-clearance','Sleeve length · gusset free to slide',inch/32,rel.clearance,'length','l_{sleeve}-t_g\\ge1/32\\,in','The sleeve projects beyond the gusset so the pretensioned bars do not clamp it; total clearance over both faces.'));
  const perBolt=F/(2*c.rows),lcEnd=c.edge-rel.width/2,lcIn=c.pitch-rel.width;
  const bearing=available(Math.min(1.0*Math.min(lcEnd,lcIn)*tg*m.Fu,2.0*rel.od*tg*m.Fu),method,.75,2);
  checks.push(compared('tie-release-bearing','Column gusset · bearing of sleeves on the slots',perBolt,bearing,'force','R_n=\\min(1.0l_ctF_u,\\,2.0d_stF_u)','AISC J3.10 for long slots perpendicular to the force, with the sleeve diameter as d. Tie force shared by the sleeves of one flange connection.'));
  const An=(rel.height-2*rel.slot)*tg;
  checks.push(compared('tie-release-net','Column gusset · net section through the slots',F,Math.min(available(m.Fu*An,method,.75,2),available(m.Fy*rel.height*tg,method,.9,1.67)),'force','R_n=\\min(F_uA_n,F_yA_g);\\quad A_n=(h_g-2l_{slot})t_g','Vertical net section through both slot lengths.'));
  const lines=(c.rows-1)*c.pitch+c.edge,Agv=2*lines*tg,Anv=2*(lines-(c.rows-.5)*rel.width)*tg,Ant=(c.gauge-rel.slot)*tg;
  checks.push(compared('tie-release-block','Column gusset · block shear through the slots',F,blockShear(Agv,Anv,Ant,m.Fy,m.Fu,method),'force','R_n=\\min(0.6F_uA_{nv},0.6F_yA_{gv})+F_uA_{nt}','Block between the two slot lines toward the free end; slot width deducted on the shear planes and slot length on the tension plane.'));
  checks.push(compared('tie-release-ligament','Column gusset · material between slots',8/3*db-hole,c.gauge-rel.slot,'length','g-l_{slot}\\ge(8/3)d_b-d_h','Same clear material as standard holes at the minimum spacing.'));
  checks.push(compared('tie-release-edge','Column gusset · edge beyond slot ends',rel.edge,(rel.height-c.gauge)/2-rel.travel,'length','(h_g-g)/2-u\\ge1.5d_b-d_h/2+w_{slot}/2','Same clear material as a standard hole at the AISC J3.4 minimum edge distance.'));
  checks.push(compared('tie-release-end-edge','Column gusset · end edge beyond slots',rel.edge,c.edge,'length','e\\ge1.5d_b-d_h/2+w_{slot}/2','Toward the girder; the tie force pulls the sleeves toward this edge.'));
  if(byOthers)checks.push({id:'tie-move-support',group:'Tie movement',title:'Bracket by others · vertical deflection limit for the tie slots',status:'excluded',equation:'\\Delta_{support}\\le u-\\theta d_{setback}-1/16\\,in',demand:undefined,capacity:Math.max(0,rel.travel-mv.vertical-install),quantity:'length',note:`Criterion for the bracket designer: vertical deflection at the bearing under all crane loads with impact at most ${fmt(Math.max(0,rel.travel-mv.vertical-install))}, within the column gusset slot travel.`,referenceIds:['tieback-practice']});
 }else if(byOthers){
  const left=catB-axialRange-outRange,allowance=Math.max(0,left)*L**2/(3*E*t.width);
  checks.push({id:'tie-move-support',group:'Tie movement',title:'Bracket by others · vertical deflection limit for rigid ties',status:'excluded',equation:'\\Delta_{support}\\le(F_{SR,B}-\\Delta f)L^2/(3Ew)',capacity:allowance,quantity:'length',note:`Criterion for the bracket designer: single-crane vertical deflection at the bearing at most ${fmt(allowance)} for the bars' remaining fatigue range. Release the column gusset with sleeved slots to remove this limit.`,referenceIds:['tieback-practice']});
 }
 return checks;
}
