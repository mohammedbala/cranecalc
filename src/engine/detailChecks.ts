import {braceImperfection} from './forcesDelivered';
import {categoryF,damageSum,damageText,minerEquation,minerEquivalent} from './fatigueConstants';
import {format} from './units';
import {flangeTieChecks,stiffenerTieChecks} from './flangeTieDesign';
import {tieMovementChecks} from './tieMovement';
import {isPlateTie,plateTieChecks} from './plateTie';
import {isCapAngleTie} from './capAngle';
import {clearanceEffects,restraintClearances,secantStiffness} from './restraintClearance';
import {railTopAboveSteel} from './railSeat';
import {capAngleChecks} from './capAngleTie';
import {flangeTieGeometry,stiffenerTieGeometry,stiffenerTieJoint,tieEccentricity,tieLine,tieSides} from './tieGeometry';
import {connectionOptionChecks} from './connectionOptions';
import {capReady,capAttachmentChecks} from './capChecks';
import type { CalculationSnapshot,CheckResult,ProjectInput } from './types';
import type { LapConnection,RunwayDetailResults } from './runwayDetails';
import type {SupportForceEnvelope,SupportForceSet} from './bracketForces';
import { available,girderStrength } from './aiscStrength';
import { bearingStiffener,blockShear,boltCapacity,boltProperties,elasticBoltGroup,parallelWeldGroup,plateBearing,compressionResistance,filletMinimum,transverseFilletFatigue } from './connectionStrength';
import { braceSystem,createDetailCollector,restraintStations,fatigueSpectrumBin } from './detailAnalysis';
import { runwayDesignAnalysis } from './designAnalysis';
import { flangeInteractionChecks } from './aistChecks';
import { cappedMechanics } from './cappedMechanics';
import { latexNumber,withinLimit } from './math';
import { railChecks } from './railChecks';
import {simpleSupportChecks} from './simpleSupports';
import {bracketChecks} from './bracketDesign';
import {rolledBracketChecks} from './rolledBracket';
import {taperedHaunchChecks} from './taperedHaunch';
import {existingBracketChecks} from './existingBracket';
import {endStopChecks} from './endStop';
import {endBearingChecks,bearingPlateChecks,activeEndBearing} from './endBearing';
import {activeColumnCap} from './columnCapInputs';
import {columnCapChecks,capBoltSets} from './columnCap';
import {tiedToBuilding} from './craneColumnInputs';
import {spliceChecks} from './girderSplice';

const compared=(id:string,group:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,referenceIds=['aisc-connections']):CheckResult=>({id,group,title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,referenceIds});
const resolved=(id:string,title:string,note:string,referenceIds=['aisc-connections']):CheckResult=>({id,group:'Connections',title,status:'not-applicable',equation:'',note,referenceIds});
/** Symmetric double-cover lap connection checks (the paired tie bars on their gusset, the girder-end cover plates). */
export function lapChecks(p:ProjectInput,c:LapConnection,id:string,title:string,fx:number,fy:number,centralThickness:number,centralFy:number,centralFu:number){
 const m=p.details!.material,method=p.method,n=2*c.rows,points=Array.from({length:c.rows},(_,i)=>[-1,1].map(sign=>({x:sign*c.gauge/2,y:(i-(c.rows-1)/2)*c.pitch}))).flat();
 const M=fy*c.projection,forces=elasticBoltGroup(points,{x:fx,y:fy,moment:M}),demand=Math.max(...forces.map(f=>f.resultant));
 const bolt=boltCapacity({grade:c.grade,diameter:c.diameter,planes:2,surface:c.surface,shear:demand,tension:0,method,patternLength:(c.rows-1)*c.pitch});
 const t=Math.min(centralThickness,2*c.thickness),Fy=Math.min(m.Fy,centralFy),Fu=Math.min(m.Fu,centralFu),width=c.gauge+2*c.edge,height=(c.rows-1)*c.pitch+2*c.edge,dh=bolt.hole+1.5875;
 const A=t*Math.min(width,height),An=t*Math.min(width-2*dh,height-c.rows*dh),S=2*c.thickness*height**2/6;
 const equivalent=Math.hypot(fx,fy)+2*Math.abs(M)/Math.min(c.gauge,(c.rows-1)*c.pitch);
 const shearPath=(c.edge+(c.rows-1)*c.pitch),Agv=2*shearPath*t,Anv=2*(shearPath-(c.rows-.5)*dh)*t,Ant=(c.gauge-dh)*t;
 const transverseAgv=2*(c.edge+c.gauge)*t,transverseAnv=2*(c.edge+c.gauge-1.5*dh)*t,transverseAnt=((c.rows-1)*c.pitch-(c.rows-1)*dh)*t;
 const bearing=plateBearing(c.diameter,bolt.hole,t,Fu,c.edge,Math.min(c.gauge,c.pitch),method);
 const weld=parallelWeldGroup({length:c.weldLength,gauge:centralThickness+c.thickness,size:c.weldSize,Fexx:m.Fexx,method,vx:0,vy:fy,normal:fx,mx:M,my:0,mz:0});
 const note=`Symmetric double-cover connection; ${n} ${c.grade} bolts, two shear/slip planes, threads included, Class ${c.surface} surfaces. Entered geometry governs both plies. Elastic bolt-group eccentricity and full resultant are included; no tension/prying load path is assumed.`;
 return [
  compared(`${id}-pitch`,'Connections',`${title} · pitch`,8/3*c.diameter,Math.min(c.pitch,c.gauge),'length','s\\ge(8/3)d_b',note),
  // 1.5db exceeds Table J3.4 rolled/machine-cut standard-hole minima for the
  // supported 1/2–1-1/2 inch bolts; bearing/tearout is also explicitly checked.
  compared(`${id}-edge`,'Connections',`${title} · edge distance`,1.5*c.diameter,c.edge,'length','e\\ge1.5d_b','Standard-hole edge distance; machine-cut plate edges.'),
  compared(`${id}-bolt`,'Connections',`${title} · bolt-group shear`,demand,bolt.shear,'force','V_i=\\left|\\frac{\\mathbf V}{n}+\\frac{M_z}{\\sum r_j^2}(-y_i,x_i)\\right|',note),
  compared(`${id}-slip`,'Connections',`${title} · cyclic slip resistance`,demand,bolt.slip,'force','R_n=\\mu D_uT_bn_s,\\ D_u=1.13',`${note} Pretension ${format(bolt.pretension,'force',p.units,3)} per bolt; applied bolt tension is zero in the defined in-plane double-lap template.`),
  compared(`${id}-bearing`,'Connections',`${title} · hole bearing / tearout`,demand,bearing.capacity,'force','R_n=\\min(1.2l_ctF_u,2.4d_btF_u)',`Deformation at bolt holes is a design consideration. Smallest connected effective ply thickness ${format(t,'length',p.units,3)}; clear distance ${format(bearing.clear,'length',p.units,3)}.`),
  compared(`${id}-net`,'Connections',`${title} · plate net section`,equivalent,available(Fu*An,method,.75,2),'force','R_n=F_uA_n;\\quad A_n=t(b-\\sum d_h)',`Resultant plus eccentric force pair on the least orthogonal net path. Hole deductions include ${format(1.5875,'length',p.units,4)} beyond the nominal hole.`),
  compared(`${id}-gross`,'Connections',`${title} · gross plate shear`,equivalent,available(.6*Fy*A,method,1,1.5),'force','R_n=0.6F_yA_g','Least gross section; includes the eccentric force pair.'),
  compared(`${id}-shear-rupture`,'Connections',`${title} · net plate shear rupture`,equivalent,available(.6*Fu*An,method,.75,2),'force','R_n=0.6F_uA_{nv}','AISC J4.2(b) on the least orthogonal net section through the bolt holes; includes the eccentric force pair.'),
  compared(`${id}-block`,'Connections',`${title} · block shear`,equivalent,Math.min(blockShear(Agv,Anv,Ant,Fy,Fu,method),blockShear(transverseAgv,transverseAnv,transverseAnt,Fy,Fu,method)),'force','R_n=\\min(0.6F_uA_{nv},0.6F_yA_{gv})+0.5F_uA_{nt}','Checks orthogonal enclosing block paths with Ubs=0.5. Actual double-cover/central-ply geometry; no viewer dimensions are used.'),
  compared(`${id}-plate`,'Connections',`${title} · elastic plate bending`,Math.abs(fx)/(2*c.thickness*height)+Math.abs(M)/S,available(m.Fy,method,.9,1.67),'stress','f=|N|/A+|M|/S','Symmetric cover plates; elastic first yield. Projection is the distance from the bolt group/load transfer line to the supporting weld line.'),
  compared(`${id}-weld`,'Connections',`${title} · eccentric weld group`,weld.demand,weld.capacity,'stress','f_w=\\sqrt{(V_x/A_w-M_zy/J_w)^2+(V_y/A_w+M_zx/J_w)^2+(N/A_w+M_xy/I_x-M_yx/I_y)^2}','Two continuous parallel fillets; all four endpoint stresses evaluated. No directional increase; long-weld reduction is included.'),
  compared(`${id}-weld-base`,'Connections',`${title} · connected metal at weld`,weld.demand*weld.A/(2*c.weldLength*t),available(.6*Fy,method,1,1.5),'stress','f_{BM}=f_wA_{we}/A_{BM}','Local connected-metal shear yielding using the same resultant stress distribution.'),
  // Tie bars are bolted only; the root fillets run along the central gusset edge.
  compared(`${id}-weld-size`,'Connections',`${title} · fillet edge limit`,c.weldSize,(id==='tie'?centralThickness:Math.min(c.thickness,centralThickness))-1.5875,'length','w\\le t-1/16\\,in',id==='tie'?'Root fillets along the central gusset edge; full-throat edge buildup is not credited.':'Weld along a plate edge; full-throat edge buildup is not credited.'),
  compared(`${id}-weld-minimum`,'Connections',`${title} · minimum fillet`,filletMinimum([c.thickness,centralThickness]),c.weldSize,'length','w\\ge w_{min}','AISC 360-16 Table J2.4, by the thinner part joined.'),
  compared(`${id}-plate-compression`,'Connections',`${title} · plate compression`,Math.abs(fx),compressionResistance(2*c.thickness*height,c.thickness/Math.sqrt(12),Math.max(2*c.projection,c.thickness),p.section.E,Fy,method).capacity,'force','P_n=F_{cr}A;\\quad L_c=2e','Cover plate projection treated as an unbraced cantilever; no postbuckling strength is credited.'),
  resolved(`${id}-prying`,`${title} · bolt tension / prying`,'Defined symmetric double-lap forces lie in the connected plate plane. Bolt tension and prying do not arise in this template. Out-of-plane connection actions require a different model.')
 ];
}
/**
 * The bearing stiffener pair as the restraint diaphragm at a support: a vertical plate spanning the web depth in the
 * cross-section plane. Welded continuously to both web faces, the pair acts as one plate of width 2b_s + t_w (AISC 360-16
 * Appendix 6.3.2a takes a stiffener pair as one plate of width 2b_s): at the copes the web strip and the cope widths are
 * lost, S = 2t_s[(t_w/2 + b_s)³ − (t_w/2 + c)³]/[3(t_w/2 + b_s)], and the stiffener-to-web welds carry its shear flow
 * VQ/I (Q of one plate about the web centerline, I of the full width). One-sided or intermittent stiffeners stay
 * separate plates bending on their own, S = 2t_sb_s²/6.
 */
export function stiffenerPairSection(b:{stiffenerWidth:number;stiffenerThickness:number;cope:number},tw:number,composite=true){
 const bs=b.stiffenerWidth,ts=b.stiffenerThickness,outer=tw/2+bs,inner=tw/2+Math.min(b.cope,bs);
 return composite?{composite,S:2*ts*(outer**3-inner**3)/(3*outer),I:ts*(2*bs+tw)**3/12,Q:ts*bs*(tw+bs)/2}:{composite,S:2*ts*bs**2/6,I:2*ts*bs**3/12,Q:0};
}
/**
 * How the bearing stiffener pair carries the restraint forces at the supports, from the restraint geometry (never from
 * the girder system):
 *  both-flanges: each flange is restrained directly at the station (a direct flange saddle or the cap tieback at the top;
 *   the end bearing bolts or a bottom saddle at the bottom). Each flange's lateral shear goes straight to its own
 *   restraint; only the St Venant torque delivered to the support crosses the depth: M = |T_sv|, X = T_sv/h_o.
 *  gusset: a tie gusset CJP welded to the stiffener (stiffenerTieGeometry): the tie force H enters the stiffener y_g from
 *   the tied flange's inner face, M = H·y_g plus the St Venant torque, which this plate also takes across the depth.
 *  one-flange: one flange only is restrained at the station (a column cap fork; a tie without a laid-out attachment):
 *   the stiffener cantilevers the other flange's force over the web depth, M = H·h.
 */
export function diaphragmArrangement(p:ProjectInput):{kind:'both-flanges'|'gusset'|'one-flange';yg:number;text:string}{
 const s=p.section,saddle=flangeTieGeometry(p),gusset=saddle?undefined:stiffenerTieGeometry(p),bolts=!!activeEndBearing(p);
 if(activeColumnCap(p)&&!tiedToBuilding(p))return {kind:'one-flange',yg:0,text:'On the column cap the stiffener pair and the bolted bottom flange form the fork: the pair cantilevers the top flange force over the web depth'};
 const top=isCapAngleTie(p)||saddle?.sides.includes(1)?'direct':gusset?.sides.includes(1)?'gusset':undefined;
 const bottom=bolts||saddle?.sides.includes(-1)?'direct':gusset?.sides.includes(-1)?'gusset':undefined;
 const yg=Math.max(top==='gusset'?s.d/2-s.tf-gusset!.topCenter:0,bottom==='gusset'?gusset!.bottomCenter+s.d/2-s.tf:0);
 const at=(v:string|undefined,f:string)=>v==='direct'?(f==='top'?(isCapAngleTie(p)?'the cap tieback':`the direct flange saddle`):bolts?'the end bearing bolts':'the bottom flange saddle'):`the ${f} tie gusset on the stiffener`;
 if(top&&bottom)return top==='direct'&&bottom==='direct'
  ?{kind:'both-flanges',yg:0,text:`Both flanges are restrained directly at the support (top: ${at(top,'top')}; bottom: ${at(bottom,'bottom')}): each flange's lateral shear goes straight to its own restraint, and only the St Venant torque delivered to the support crosses the depth in the stiffener pair`}
  :{kind:'gusset',yg,text:`The tie gusset ${stiffenerTieJoint(p)==='integral'?'is the stiffener\'s own extension':'is CJP welded to the stiffener'} (top: ${at(top,'top')}; bottom: ${at(bottom,'bottom')}): the tie force enters the stiffener y_g = ${format(yg,'length',p.units,3)} from the tied flange, and the pair also takes the St Venant torque across the depth`};
 return {kind:'one-flange',yg:0,text:'One flange only is restrained at the support with a laid-out attachment: the stiffener pair cantilevers the restraint force over the web depth'};
}
/**
 * In-plane moment M and shear V of the restraint diaphragm (diaphragmArrangement): H the restraint force (with the
 * Appendix 6 brace force for strength), torque the St Venant torque the support takes from a girder end, couple the
 * Appendix 6.3.2 torsional restraint moment 0.02M_rC_d at the fork (P_br,flexure·h_o; conservatively all St Venant),
 * h the web depth.
 */
export function diaphragmDemand(a:Pick<ReturnType<typeof diaphragmArrangement>,'kind'|'yg'>,o:{H:number;torque:number;couple:number;h:number;h0:number}){
 if(a.kind==='both-flanges'){const M=Math.abs(o.torque)+o.couple;return {M,V:M/o.h0};}
 if(a.kind==='gusset'){const M=o.H*a.yg+Math.abs(o.torque)+o.couple;return {M,V:Math.max(o.H,M/o.h0)};}
 return {M:o.H*o.h,V:o.H};
}
/**
 * Equivalent reaction on the four stiffener-to-web fillet lines (the reaction capacity form): a composite pair takes per
 * line R/(4L_w) + VQ/(2I), R_eq = R + 2VQL_w/I; separate plates the direct-plus-moment bound R + 2V + 6M/L_w (R + 8H for the
 * full-height cantilever).
 */
export const diaphragmWeldEquivalent=(R:number,d:{M:number;V:number},sec:ReturnType<typeof stiffenerPairSection>,Lw:number)=>sec.composite?R+2*d.V*sec.Q*Lw/sec.I:R+2*d.V+6*d.M/Lw;
/**
 * The stiffener-to-web weld group of the bearing stiffener pair, four continuous fillet lines over L_w = h − 2c: the least
 * of the weld metal φ0.6F_EXX(0.707w)·4L_w, the web base metal in shear rupture on its two planes φ0.6F_u·t_w·2L_w (each
 * plane takes the fillets on both web faces: t_w ≥ 6.19D/F_u to develop them) and the stiffener base metal φ0.6F_u·t_s·2L_w
 * (each stiffener's plane takes its two fillets), AISC 360-16 J2.4 and J4.2(b), φ = 0.75 (Ω = 2.00).
 */
export function stiffenerWeldGroup(p:ProjectInput,h:number){
 const d=p.details!,b=d.bearing,m=d.material,Lw=h-2*b.cope,av=(v:number)=>available(v,p.method,.75,2);
 const weld=av(.6*m.Fexx*b.weldSize/Math.SQRT2*4*Lw),web=av(.6*p.section.Fu*p.section.tw*2*Lw),stiffener=av(.6*m.Fu*b.stiffenerThickness*2*Lw),capacity=Math.min(weld,web,stiffener);
 return {Lw,weld,web,stiffener,capacity,governs:capacity===weld?'weld metal':capacity===web?'web base metal':'stiffener base metal'};
}
/** The D/C of a check, when it has a finite one. */
const checkRatio=(c:CheckResult)=>typeof c.utilization==='number'&&Number.isFinite(c.utilization)?c.utilization:undefined;
/** Change of the governing results between two refinement levels (refinementChange), with the result that moved most. */
export interface RefinementChange{value:number;governing?:string;changes:Map<string,number>}
/**
 * Change of the governing results between two refinement levels of the detailed model, for its convergence gates.
 * - Every check the level sets, by its D/C: |ΔD/C| / max(D/C, 0.5). A result that governs (D/C ≥ 0.5) is held to its
 *   relative change; a smaller one to an absolute change of its D/C (1% of 0.5 = 0.005), which cannot move a verdict.
 * - Every support force the girder delivers (the force envelope at each grid, which the building takes and no check
 *   here may compare): its change relative to the larger of itself and half the largest of that force over the grids.
 * A stress, displacement, range or multiplier enters through the checks it decides, not on its own: a stress range of
 * 0.01 MPa at an unloaded girder end no longer gates the package, while any change that could move a verdict does.
 */
export function refinementChange(coarse:{checks:CheckResult[];results:RunwayDetailResults},fine:{checks:CheckResult[];results:RunwayDetailResults}):RefinementChange{
 const keyed=(checks:CheckResult[])=>{const seen=new Map<string,number>(),out=new Map<string,number>();for(const c of checks){const u=checkRatio(c);if(u===undefined)continue;const n=seen.get(c.id)??0;seen.set(c.id,n+1);out.set(n?`${c.id}#${n}`:c.id,u);}return out;};
 const changes=new Map<string,number>(),before=keyed(coarse.checks);
 for(const [id,u] of keyed(fine.checks)){const old=before.get(id);if(old!==undefined)changes.set(id,Math.abs(u-old)/Math.max(Math.abs(u),.5));}
 const least=(f:SupportForceSet)=>f.ends.length?Math.min(...f.ends.map(e=>e.vertical)):f.vertical;
 const components:[string,(v:SupportForceEnvelope)=>number][]=[['vertical',v=>v.maxVertical.vertical],['least bearing',v=>least(v.minBearing)],['seat moment',v=>Math.abs(v.maxMoment.moment)],
  ...(['longitudinal','top','bottom'] as const).map(k=>[k,(v:SupportForceEnvelope)=>Math.abs(v[k][k])] as [string,(v:SupportForceEnvelope)=>number])];
 const grids=fine.results.bracketForces??[];
 for(const [name,value] of components){
  // The least bearing reaction (uplift when negative) is measured against the largest reaction.
  const scale=Math.max(...grids.map(v=>Math.abs(name==='least bearing'?v.maxVertical.vertical:value(v))),1);
  for(const v of grids){const o=coarse.results.bracketForces?.find(w=>w.grid===v.grid);if(o)changes.set(`support force: grid ${v.grid} ${name}`,Math.abs(value(v)-value(o))/Math.max(Math.abs(value(v)),.5*scale));}
 }
 let value=0,governing:string|undefined;
 for(const [id,c] of changes)if(c>value){value=c;governing=id;}
 return {value,governing,changes};
}
/** The value a refinement check reports: the last change, or the estimated error of an accepted marginal miss. */
export interface RefinementVerdict{converged:boolean;value:number;last:number;governing?:string;ratio?:number;estimate?:number}
/**
 * Verdict of a refinement sequence (each step the change from one level to the next, refinementChange). Converged when
 * the last step changes the governing results by at most the target. A marginal miss, at most twice the target, is
 * accepted when every result still above the target changed geometrically less over the last two steps (ratio ρ < 1):
 * the finest level, which is reported, is then within ρ/(1−ρ) of its last change of the converged value (the rest of the
 * geometric series), and that estimate must meet the target. A larger miss, a single step or a change that does not
 * shrink is not converged, whatever its size: the package stays blocked.
 */
export function refinementVerdict(steps:RefinementChange[],target=.01):RefinementVerdict{
 const last=steps.at(-1)!,previous=steps.at(-2);
 if(last.value<=target)return {converged:true,value:last.value,last:last.value,governing:last.governing};
 if(!previous||last.value>2*target)return {converged:false,value:last.value,last:last.value,governing:last.governing};
 let estimate=0,worst=0;
 for(const [id,c] of last.changes){
  if(c<=target)continue;
  const before=previous.changes.get(id),rho=before?c/before:Infinity;
  if(!(rho<1))return {converged:false,value:last.value,last:last.value,governing:id,ratio:rho};
  estimate=Math.max(estimate,c*rho/(1-rho));worst=Math.max(worst,rho);
 }
 return estimate<=target?{converged:true,value:estimate,last:last.value,governing:last.governing,ratio:worst,estimate}:{converged:false,value:last.value,last:last.value,governing:last.governing,ratio:worst,estimate};
}
/** The gate of a refinement check: the last change, or for an accepted marginal miss the estimated error of the finest level. */
export const refinementEquation=(v:RefinementVerdict,what:string)=>v.converged&&v.estimate!==undefined
 ?`\\varepsilon\\approx\\frac{\\rho}{1-\\rho}\\left|\\frac{D_{2n}}{D_n}-1\\right|\\le0.01\\ \\ \\text{(${what})}`:`|D_{2n}/D_n-1|\\le0.01\\ \\ \\text{(${what})}`;
export function completeRunwayChecks(s:CalculationSnapshot):CheckResult[]{
 const p=s.input,d=p.details,props=s.properties!,a=s.designAnalysis!;
 if(!d||!a)return [];
 // A different connection cannot inherit the stiffness, fatigue or resistance
 // of the existing pair-of-flat-bars / rectangular-rib model.
 if(connectionOptionChecks(p).length)return [];
 const checks:CheckResult[]=[];
 if((p.section.kind!=='rolled'&&!capReady(p))||!p.section.catalogueId){checks.push({id:'detail-applicability',group:'Strength',title:'Detailed runway model applicability',status:'unsupported',equation:'',referenceIds:['vlasov'],note:'Requires a catalog rolled W or a capped W with complete channel material, service-class and continuous-attachment inputs.'});return checks;}
 if(!p.aist||!p.aist.runwayOnly||!p.connections.enabled)return [];
 const designFy=p.section.kind==='cap'?Math.min(p.section.Fy,p.capDesign!.Fy):p.section.Fy;
 const strength=girderStrength(p,props),steps=p.cranes.length===1?40:p.cranes.length===2?12:6;
 const braceForce=braceImperfection(p,a,props).force,run=(travel:number,mesh:number)=>{const c=createDetailCollector(p,props,mesh,braceForce);runwayDesignAnalysis(p,props,strength,travel,20,c.observe,{envelope:false});return c.finish();};
 // The checks of one level in report order: bracket checks, the analysis checks (the reported level only), then the
 // girder, bracing and connection checks. A level built only to compare its governing results (refinementChange) keeps
 // the design envelope for H1; the reported level re-runs it when load height lowers M_cx.
 const levelChecks=(r:RunwayDetailResults,analysis:CheckResult[],reported:boolean):CheckResult[]=>{
 const checks:CheckResult[]=[];s.detailResults=r;
 // The checks whose demand includes the restraint forces of the strength cases (the tie, bracket and bearing families):
 // with unstable cases they cannot be met (failUnstable, at the end).
 const restraintChecks=new Set<CheckResult>(),restraint=(list:CheckResult[])=>{for(const c of list)restraintChecks.add(c);return list;};
 if(r.bracket)checks.push(...restraint(bracketChecks(p,r.bracket,a.serviceReaction)));
 if(r.existingBracket)checks.push(...restraint(existingBracketChecks(p,r.existingBracket)));
 if(r.rolledBracket)checks.push(...restraint(rolledBracketChecks(p,r.rolledBracket,a.serviceReaction)));
 if(r.taperedHaunch)checks.push(...restraint(taperedHaunchChecks(p,r.taperedHaunch,a.serviceReaction)));
 checks.push(...analysis);
 const add=(...args:Parameters<typeof compared>)=>checks.push(compared(...args));
 // m11: the combined normal stress at each flange's own extreme fibres (AISC DG7 / DG9), top (cap tips) and bottom.
 const capped=p.section.kind==='cap',capMech=cappedMechanics(p.section),fw=r.flangeWarping,fn=r.flangeNormal??{top:r.normalStress,bottom:r.normalStress};
 const normalNote=(k:'top'|'bottom')=>{const v=r.flangeParts?.[k],sx=(x:number)=>format(x,'stress',p.units,3),half=k==='top'&&capped?p.section.capWidth/2:p.section.bf/2,torsion=(My:number,w:number)=>My*half/props.Iy+w;
  const trace=v?.theta!==undefined?` At that station θ = ${v.theta.toPrecision(3)} rad${v.lambda!==undefined?` and the case's elastic critical multiplier is λ = ${v.lambda.toFixed(2)} (0.8 stiffness)`:''}; the lateral bending plus warping stress ${sx(torsion(v.My,v.warping))}${v.first?` is ${(v.amplification??1).toFixed(2)} times the ${sx(torsion(v.first.My,v.first.warping))} of the same beam solved first-order${v.lambda!==undefined&&v.multiplier&&v.lambda>v.multiplier?` (1/(1 − α/λ) = ${(1/(1-v.multiplier/v.lambda)).toFixed(2)})`:''}`:''}.`:'';
  return `${k==='top'?(capped?'Top flange: the cap channel tips':'Top flange tips'):'Bottom flange: the W bottom flange tips'}, S_x${k==='top'?'c':'t'} = ${format(capMech?(k==='top'?capMech.Stop:capMech.Sbottom):props.Sx,'modulus',p.units,4)}${fw?`, W_no = ${format(fw[k],'area',p.units,3)}`:''}. P/A, M_x/S_x of this flange's fibre, lateral bending M_y = 0.8E·I_y|v″| over I_y at this flange's half width and warping 0.8E·W_no|θ″| at its tips, added by magnitude at every station and strength case: the internal forces of the coupled second-order analysis (load above the shear center, finite restraint stiffness, 0.8 of the elastic and restraint stiffness for strength: AISC 360-16 C2.3 and Appendix 1 take the required strengths from that analysis). Its lateral moment already contains the rotated major moment (Vlasov equilibrium E·I_y·v″ = M_y,first-order + θM_x), so θM_x is not added again. ${k==='top'?'The bottom':'The top'} flange is checked separately.${r.governing[k==='top'?'normalStressTop':'normalStressBottom']?` Governing ${r.governing[k==='top'?'normalStressTop':'normalStressBottom'].combination} at x = ${format(r.governing[k==='top'?'normalStressTop':'normalStressBottom'].x,'length',p.units,3)}.`:''}${trace}`;};
 add('torsion-normal','Strength',capped?'Combined normal stress with warping · top flange (cap tips)':'Combined normal stress with warping · flange tips',fn.top,available(designFy,p.method,.9,1.67),'stress','f_{un}=\\frac{P}{A}+\\frac{M_x}{S_{xc}}+\\frac{M_y}{S_y}+\\sigma_{ws};\\quad\\sigma_{ws}=0.8EW_{no}\\theta^{\\prime\\prime}',normalNote('top'),['aisc-h3','dg7','vlasov']);
 if(capped)add('torsion-normal-bottom','Strength','Combined normal stress with warping · bottom flange',fn.bottom,available(designFy,p.method,.9,1.67),'stress','f_{un}=\\frac{P}{A}+\\frac{M_x}{S_{xt}}+\\frac{M_yb_f}{2I_y}+\\sigma_{ws};\\quad\\sigma_{ws}=0.8EW_{no}\\theta^{\\prime\\prime}',normalNote('bottom'),['aisc-h3','dg7','vlasov']);
 add('torsion-shear','Strength','Combined shear including Saint-Venant / warping',r.shearStress,available(.6*designFy,p.method,.9,1.67),'stress','f_{uv}=\\tau_b+\\tau_t+\\tau_{ws};\\quad\\tau_t=0.8Gt\\theta^{\\prime},\\ \\tau_{ws}=\\frac{0.8ES_w\\theta^{\\prime\\prime\\prime}}{t}','Checks flange and web shear bounds, adding direct shear and torsional components by magnitude, the St Venant and warping shear at the analysis stiffness (0.8G, 0.8E). No torsional plastic redistribution.',['aisc-h3','vlasov']);
 // The second-order analysis behind torsion-normal has an equilibrium state only while the lowest elastic critical load
 // multiplier at 0.8 stiffness exceeds the load factor of that analysis (alpha = 1 LRFD, 1.6 for ASD loads). Member
 // lateral-torsional buckling strength is Chapter F (flexure-load-height, Mcr = lambda M_u / 0.8 from the same eigenvalue).
 const alpha=p.method==='LRFD'?1:1.6,lambda=r.criticalMultiplier,gaps=restraintClearances(p),played=gaps.top.gap>0||gaps.bottom.gap>0;
 add('torsion-stability','Strength','Load-height / lateral-torsional stability',alpha,lambda,'ratio',p.method==='LRFD'?'\\lambda=M_{cr}/M_u>\\alpha':'\\lambda=M_{cr}/M_a>\\alpha',`Lowest sampled elastic critical load multiplier λ = ${lambda.toFixed(2)}${r.governing.criticalMultiplier?` (${r.governing.criticalMultiplier.combination})`:''} with 0.8 member and brace stiffness. Major-moment coupling, axial geometric stiffness, above-shear-center wheel forces and an elevated dead load are included. The coupled second-order analysis of the stresses and restraint forces (AISC 360-16 C2.3 / Appendix 1, at α = ${alpha}${p.method==='LRFD'?'':' times the ASD loads'}) has an equilibrium state only for λ > α: ${lambda>alpha?`it amplifies the twist and lateral bending about 1/(1 − α/λ) = ${(1/(1-alpha/lambda)).toFixed(2)}`:'none exists'}. Member lateral-torsional buckling strength is Chapter F: flexure-load-height (M_cr = λM_u/0.8 from the same eigenvalue) and H1 control it.${lambda/alpha<1.5&&played?` Restraint-sensitive: λ/α < 1.5 with restraint play (top ${format(gaps.top.gap,'length',p.units,3)}, bottom ${format(gaps.bottom.gap,'length',p.units,3)}) taken up at the Appendix 6 brace force; the amplification depends on the secant restraint stiffness.`:''}${r.unstableCases?` ${r.unstableCases} strength case${r.unstableCases>1?'s buckle':' buckles'} below the applied load, so their stresses and restraint forces are not recovered and the checks that depend on them fail: increase the girder, cap or bracing.`:''}`,['aisc-f4','vlasov']);
 // M2: load-height LTB. The elastic buckling eigenvalue of the bay with the wheels at the rail head gives M_cr; it enters
 // F4 (F2 / F5) at its equivalent unbraced length L_e >= L_b (the Cb = 1 elastic moment equal to M_cr). The Commentary F1 load-height Cb of
 // the same case is printed beside it for comparison.
 let mcx=strength.major,mcxNegative=strength.majorReverse??strength.major,lowered={positive:false,negative:false};
 if(r.loadHeight){const lh=r.loadHeight,cm=lh.commentary,f=(v:number|undefined,q:'moment'|'length')=>format(v,q,p.units,3);
  // The other sign of moment, against the strength of the flange it compresses (continuous girders).
  const os=r.loadHeightBySign?.[lh.sign===-1?'positive':'negative'],otherSign=os?.utilization?` ${lh.sign===-1?'Positive':'Negative'} moment: M = ${f(os.demand,'moment')} (${os.combination}, x = ${f(os.x,'length')}) against φM_n = ${f(os.capacity,'moment')}, D/C ${os.utilization.toFixed(2)}.`:'';
  const lambda=Number.isFinite(lh.critical)?.8*lh.critical/lh.demand:undefined,F=capped?'F4':'F2',Sx=capped?'S_{xc}':'S_x';
  add('flexure-load-height','Strength','Major flexure · lateral-torsional buckling with load height',lh.demand,lh.capacity,'moment',`M_u\\le\\phi_bM_n,\\ \\ M_n=M_n\\big(\\max[L_b,L_e]\\big)\\ (C_b=1),\\quad F_{cr}(L_e)${Sx}=M_{cr}`,
   `Governing case ${lh.combination} at x = ${f(lh.x,'length')}, ${lh.sign===-1?`negative moment (${capped?'W bottom flange':'bottom flange'} in compression)`:`positive moment (${capped?'cap and W top flange':'top flange'} in compression)`}.${otherSign} Elastic buckling eigenvalue of the girder bay (thin-walled beam with warping, 0.8 stiffness) with the wheels at the rail head ${f(lh.height,'length')} above the shear center, the UDL at rail height, the axial force, the modeled tie and bearing restraints and the moment gradient of the case: ${lambda!==undefined?`λ = ${lambda.toFixed(2)}, M_cr = λM_u/0.8 = ${f(lh.critical,'moment')}`:`M_cr not solved for this case: it is stable at the load multiplier that would lower φM_n below the C_b = 1 strength${lh.criticalAtLeast?` (M_cr ≥ ${f(lh.criticalAtLeast,'moment')})`:''}, so the strength is the C_b = 1 value at L_b; no moment-gradient credit (C_b > 1) is taken from a higher M_cr`}. Uniform-moment elastic moment at L_b = ${f(p.unbracedLength,'length')} (${capped?'F4-5':'F2-4'}, C_b = 1): F_cr${capped?'S_xc':'S_x'} = ${f(lh.mocr,'moment')}${lambda!==undefined?`, M_cr/F_cr${capped?'S_xc':'S_x'} = ${(lh.critical/lh.mocr).toFixed(2)}${lh.critical>lh.mocr?' (above 1: no moment-gradient credit is taken, the strength stays at C_b = 1)':''}`:''}. Equivalent unbraced length: ${capped?'F4-5':'F2-4'} with C_b = 1 solved for F_cr${capped?'S_xc':'S_x'} = M_cr gives L_e = ${f(lh.length,'length')} (never less than L_b; no moment-gradient credit), and φM_n is the ${capped?'F4':'F2'} strength at that length (the ${capped?'F4-2':'F2-2'} interpolation or the ${capped?'F4-3':'F2-3'} elastic branch entered at the slenderness of M_cr; no C_b < 1 factor is applied to the inelastic strength).${cm?` AISC 360-16 Commentary F1 comparison: C_b (F1-1) = ${cm.gradient.toFixed(2)} for this moment diagram over L_b, times 1.4^(2y/h) = ${cm.factor.toFixed(2)} with y = ${f(cm.y,'length')} from mid-depth to the rail head and h = ${f(cm.h,'length')}: C_b = ${cm.cb.toFixed(2)}, φM_n = ${f(cm.capacity,'moment')} (D/C ${(lh.demand/cm.capacity).toFixed(2)}); the factor is extrapolated above the top flange and measured from mid-depth rather than the shear center.`:''} Major flexure with load height; H1 uses this strength as M_cx.`,['aisc-f4','dg7','vlasov']);
  // Each sign's M_cx from its own load-height record (positive: top flange / cap in compression; negative: W bottom flange).
  const bySign=r.loadHeightBySign??{positive:lh.sign!==-1?lh:undefined,negative:lh.sign===-1?lh:undefined};
  if(bySign.positive?.utilization&&bySign.positive.capacity<mcx-1e-9){mcx=bySign.positive.capacity;lowered.positive=true;}
  if(bySign.negative?.utilization&&bySign.negative.capacity<mcxNegative-1e-9){mcxNegative=bySign.negative.capacity;lowered.negative=true;}
 }
 // H1 at each flange with the major-axis strength of the sign of the station's moment: re-run the design envelope when
 // load height lowers M_cx of either sign.
 const h1Strength={...strength,major:mcx,majorReverse:mcxNegative};
 const h1=reported&&(lowered.positive||lowered.negative)&&a.travelSteps?runwayDesignAnalysis(p,props,h1Strength,a.travelSteps,a.mesh??40):a;
 r.interaction={mcx,mcxNegative,top:h1.interactionTop??h1.interaction,bottom:h1.interactionBottom??h1.interaction,topCase:h1.governing.interactionTop,bottomCase:h1.governing.interactionBottom,combinations:h1.combinations.map(c=>({id:c.id,interaction:c.interaction}))};
 const lhText=(on:boolean)=>on?', the load-height LTB strength (flexure-load-height)':' (Cb = 1)';
 checks.push(...flangeInteractionChecks(p,h1,h1Strength,{positive:lhText(lowered.positive),negative:lhText(lowered.negative)}));
 // Restraint play (restraintClearances): rigid-body take-up added to the elastic rail-head movement.
 const play=clearanceEffects(p,props,tieLine(p),(capped?p.section.d+p.section.capTw:p.section.d)+railTopAboveSteel(p)),len=(v:number)=>format(v,'length',p.units,3);
 add('rail-head','Serviceability','Rail-head lateral movement including twist',r.railDisplacement+(play.any?play.rail:0),Math.min(...p.spans)/Math.max(400,p.lateralLimit,d.criteria.railLateralLimit),'length',play.any?'\\Delta_r=\\Delta_o+(y_r-y_o)\\theta+g_t+\\frac{g_t+g_b}{h_r}(y_r-y_t)':'\\Delta_r=\\Delta_o+(y_r-y_o)\\theta',`Single static crane; finite girder-side tie/connection flexibility. Building interfaces are assumed fixed and their framing/foundations are excluded.${play.any?` Elastic movement ${len(r.railDisplacement)} plus the rigid-body take-up of the restraint play ${len(play.rail)}: top tie g_t = ${len(play.gt)}, sliding bearing g_b = ${len(play.gb)}, taken up in opposite directions over h_r = ${len(play.hr)} between the tie line and the bottom restraint line (θ = ${play.theta.toFixed(4)} rad), the rail head ${len((capped?p.section.d+p.section.capTw:p.section.d)+railTopAboveSteel(p)-play.yt)} above the tie line.`:''}`,['tr13-girder','criteria','vlasov']);
 // Rail twist: TR-13 sets no rotation limit, so it is checked only against a limit the owner or crane supplier enters.
 // The rotation itself comes from the lateral / warping torsion model; without a limit the row is informational.
 const twistLimit=d.criteria.twistLimit,twistAt=r.governing.twist?` Governing ${r.governing.twist.combination} at x = ${format(r.governing.twist.x,'length',p.units,3)}.`:'';
 if(twistLimit)add('rail-twist','Serviceability','Rail rotation · owner criterion',r.twist,twistLimit,'ratio','\\theta\\le\\theta_{max}\\ \\ \\text{(owner)}',`Rail rotation from the lateral / warping torsion analysis against the twist limit entered by the owner or crane supplier (${p.criteriaSource||'source not stated'}). AIST TR-13 gives no rail twist limit. Distinct from girder lateral bending deflection.${twistAt}`,['criteria']);
 else checks.push({id:'rail-twist',group:'Serviceability',title:'Rail rotation (no limit specified)',status:'not-applicable',demand:r.twist,quantity:'ratio',equation:'\\theta',referenceIds:['criteria'],note:`Rail rotation ${r.twist.toExponential(3)} rad from the lateral and warping torsion analysis.${twistAt} AIST TR-13 sets no rail rotation limit and the owner and crane supplier specify none.`});
 // Appendix 6 brace force and stiffness (forcesDelivered.braceImperfection: the same numbers the report derives).
 const brace=braceSystem(p),A6=braceImperfection(p,a,props),imperfection=A6.force,requiredK=A6.stiffness;
 const plate=isPlateTie(p),capAngle=isCapAngleTie(p);
 const cap=activeColumnCap(p),capR=r.columnCap,tied=!!cap&&tiedToBuilding(p);
 // A crane column tied to the building (craneColumn.ts): the top-flange tie's restraint stiffness is in series with the
 // building column at the tie (r.braceStiffness, craneColumnRestraint), and the cap checks run with the tie checks.
 const tieK=tied?r.braceStiffness:brace.stiffness,building=tied?' The building column at the tie is in series (its strong-axis stiffness under a unit force there, column alone); the building\'s own frame and diaphragm sway is excluded.':' Building deformation is excluded at the stated interface.';
 if(cap&&capR){
  // A column cap: the girder end is a fork on the cap (a crane column: the cap takes the bottom flange); its restraint stiffness, strength, bolts and welds.
  checks.push(...restraint(columnCapChecks(p,capR,{imperfection,required:requiredK})));
 }
 if(cap&&!tied){/* A column cap fork: no flange tie to check. */}
 else if(capAngle){
  // Cap tieback angle (top flange only; the bolted end bearings restrain the bottom flange): its own member, stiffness and components.
  const c=(brace as {compliance?:Record<string,number>}).compliance??{},share=(k:string)=>`${k} ${(100*(c[k]??0)*brace.stiffness).toFixed(0)}%`;
  add('brace-member','Bracing','Top-flange tie strength',r.demands.brace+imperfection,brace.capacity,'force','P_{br}=H+0.02M_rC_d/h_o+0.01P_r',`Cap tieback angle at the top flange; the bottom flange is restrained by the end bearing bolts. The tie plate in tension (D2) and in compression over its clear span (E3, K = 1.0); full concurrent horizontal reaction plus flexural/axial imperfection demands. The angle, bolts, end plate and column flange are checked under Cap tieback.`,['aisc-brace','aisc-e','cap-angle-basis']);
  add('brace-stiffness','Bracing','Brace and connection stiffness in series',requiredK,secantStiffness(tieK,play.gt,imperfection),'stiffness',play.gt>0?'\\beta_{sec}=\\left(\\sum1/k_i+g_t/P_{br}\\right)^{-1}\\ge\\beta_{br}':'\\beta=\\left(\\sum1/k_i\\right)^{-1}\\ge\\beta_{br}',`${play.gt>0?`Secant stiffness with the angle's play g_t = ${len(play.gt)} taken up at the Appendix 6 brace force P_br = ${format(imperfection,'force',p.units,3)}: (1/${format(tieK,'stiffness',p.units,3)} + g_t/P_br)⁻¹ = ${format(secantStiffness(tieK,play.gt,imperfection),'stiffness',p.units,3)}. `:''}Cap tieback angle in pull, in series: tie plate axial strain over its clear span, lap bolt shear, the angle's short leg bending from the bolt line to the long leg, the channel flange bending from its web, cap and column bolt elongation, the end plate between its bolts, the shims and the column flange bending from its web. Shares of the compliance: ${['plate','lapBolts','angleLeg','channelFlange','capBolts','endPlate','columnBolts','shims','columnFlange'].map(share).join(', ')}. This stiffness is the top-flange restraint of the lateral/torsional model.${building} Top-flange load amplification is included in Appendix 6 requirements.`,['aisc-brace','cap-angle-basis']);
  checks.push(...restraint(capAngleChecks(s,{force:(r.demands.brace+imperfection)/brace.cos})));
 }else{
 add('brace-member','Bracing',tieSides(p).length>1?'Both-flange tie strength':'Top-flange tie strength',r.demands.brace+imperfection,brace.capacity,'force','P_{br}=H+0.02M_rC_d/h_o+0.01P_r',`${plate?'One flexible plate (AISC DG7 §11.2) at':'Two symmetric flat bars at'} ${tieSides(p).length>1?'each flange':'the top flange; the bottom flange is restrained by the end bearing bolts'}. Out-of-plane buckling over 0.8 × the length between the innermost bolt rows, and net-section tension; full concurrent horizontal reaction plus flexural/axial imperfection demands.`,['aisc-brace','aisc-e']);
 add('brace-stiffness','Bracing','Brace and connection stiffness in series',requiredK,secantStiffness(tieK,play.gt,imperfection),'stiffness',play.gt>0?'\\beta_{sec}=\\left[\\left(\\cos^2\\theta\\left(\\sum1/k_i\\right)^{-1}\\right)^{-1}+g_t/P_{br}\\right]^{-1}\\ge\\beta_{br}':'\\beta=\\cos^2\\theta\\left(\\sum1/k_i\\right)^{-1}\\ge\\beta_{br}',(play.gt>0?`Secant stiffness with the gusset slot play g_t = ${len(play.gt)} taken up at the Appendix 6 brace force P_br = ${format(imperfection,'force',p.units,3)}. `:'')+(plate?'One flexible plate; single-plane bolt shear deformation, and the lap couple rotating both gussets (e²/k_gusset), are included. ':'')+'Gusset axial strain and bolt shear deformation are included at both ends. Direct flange saddles additionally include local flange, saddle, gusset and receiving-flange flexibility.'+building+' Top-flange load amplification is included in Appendix 6 requirements.',['aisc-brace']);
 // The single flexible plate's single-shear laps are checked with the plate (plateTieChecks).
 if(!plate)checks.push(...restraint(lapChecks(p,d.brace.connection,'tie','Flange tie connection',(r.demands.brace+imperfection)/brace.cos,0,d.brace.gussetThickness,d.material.Fy,d.material.Fu)));
 }
 const bearingBolts=activeEndBearing(p);
 // The fork brings both flange forces to the bearing bolts.
 const boltLateral=cap&&capR?Math.max(...capR.grids.map(v=>v.lateral.value))+imperfection:r.demands.brace+imperfection;
 // On a column cap the bearing bolts are the cap's bolts: their end-bearing rows take its concurrent per-bolt actions.
 const capBolts=cap&&capR?capBoltSets(p,capR,imperfection):undefined;
 if(bearingBolts)checks.push(...restraint(endBearingChecks(p,bearingBolts,{analysis:a,lateral:boltLateral,...(capBolts?{cap:{tension:Math.max(...capBolts.map(v=>v.T)),shear:Math.max(...capBolts.map(v=>v.V))}}:{})})));
 else checks.push(...lapChecks(p,d.end,'end','Girder end / longitudinal connection',a.axial,Math.max(a.reaction,a.uplift),p.section.tw,p.section.Fy,p.section.Fu));
 const bs=d.bearing,m=d.material,stiffener=bearingStiffener({width:bs.stiffenerWidth,thickness:bs.stiffenerThickness,cope:bs.cope,webThickness:p.section.tw,webDepth:strength.h,flangeThickness:p.section.tf,loadedWidth:p.section.bf,E:p.section.E,Fy:Math.min(m.Fy,p.section.Fy),method:p.method});
 add('stiffener-column','Local forces','Paired full-depth bearing stiffeners',a.reaction,stiffener.compression.capacity,'force','L_c=0.75h;\\quad A=2b_st_s+12t_w^2;\\quad P_n=F_{cr}A','Uses the smaller end effective web strip at every support. Fitted stiffeners, full-depth web welds; no reliance on the bare web strength.',['aisc-connections','aisc-e']);
 add('stiffener-bearing','Local forces','Fitted stiffener-end bearing',a.reaction,stiffener.bearing,'force','R_n=1.8F_y A_{pb}','Actual cope deducted from both fitted bearing areas; requires milled/fitted contact to the loaded flange.',['aisc-connections']);
 add('stiffener-width','Detailing','Stiffener minimum width',stiffener.minimumWidth,bs.stiffenerWidth,'length','b_s+t_w/2\\ge b_f/3','J10.8 additional stiffener geometry.');
 add('stiffener-thickness','Detailing','Stiffener minimum thickness',stiffener.minimumThickness,bs.stiffenerThickness,'length','t_s\\ge\\max(t_f/2,b_s/16)','J10.8 additional stiffener geometry.');
 // Stiffener-to-web welds: the least of the weld metal and the web and stiffener base metal (stiffenerWeldGroup).
 const welds=stiffenerWeldGroup(p,strength.h),stiffWeld=welds.capacity,frc=(v:number)=>format(v,'force',p.units,3);
 const weldNote=`Weld metal ${frc(welds.weld)}, web base metal ${frc(welds.web)} (two shear planes of t_w = ${len(p.section.tw)}, each taking the fillets on both web faces), stiffener base metal ${frc(welds.stiffener)} (one plane of t_s per stiffener): the ${welds.governs} governs (AISC 360-16 J2.4, J4.2(b)); L_w = h − 2c = ${len(welds.Lw)}.`;
 add('stiffener-weld','Connections','Stiffener-to-web load transfer',a.reaction,stiffWeld,'force','R_n=\\min[0.6F_{EXX}(0.707w)\\,4L_w,\\ 0.6F_ut_w\\,2L_w,\\ 0.6F_ut_s\\,2L_w];\\quad L_w=h-2c',`Four continuous full-depth fillet lines transfer the full support reaction, without reducing demand by web resistance. ${weldNote}`);
 // The restraint diaphragm by arrangement (diaphragmArrangement), on the section of the pair (stiffenerPairSection): the
 // support torque from the analysis (St Venant torque at 0.8G of the strength cases), the restraint force H with the
 // Appendix 6 brace force, and the Appendix 6.3.2 torsional restraint moment 0.02M_rC_d at the fork.
 const arrangement=diaphragmArrangement(p),pair=stiffenerPairSection(bs,p.section.tw),diaphragmForce=r.demands.brace+imperfection,couple=A6.flexure*props.h0;
 const supportTorque=r.diaphragm?.torque??diaphragmForce*strength.h,dia=diaphragmDemand(arrangement,{H:diaphragmForce,torque:supportTorque,couple,h:strength.h,h0:props.h0});
 const mom=(v:number)=>format(v,'moment',p.units,3),Md=arrangement.kind==='both-flanges'?'|T_u|+0.02M_rC_d':arrangement.kind==='gusset'?'He+|T_u|+0.02M_rC_d':'Hh';
 const sectionText=`${pair.composite?`The pair is welded continuously to both web faces and acts as one plate of width 2b_s + t_w (AISC 360-16 Appendix 6.3.2a takes a pair as one plate of width 2b_s); at the copes S = 2t_s[(t_w/2 + b_s)³ − (t_w/2 + c)³]/[3(t_w/2 + b_s)] = ${format(pair.S,'modulus',p.units,4)}, and the web welds carry its shear flow VQ/I`:`Separate plates, S = 2t_sb_s²/6 = ${format(pair.S,'modulus',p.units,4)}`}.`;
 const demandText=arrangement.kind==='one-flange'?`H = ${frc(diaphragmForce)} (restraint force plus the Appendix 6 brace force) over h = ${len(strength.h)}: M = ${mom(dia.M)}`
  :`T_u = ${mom(supportTorque)}, the largest St Venant torque G_k·J·θ′ (0.8G) a girder end delivers to its support in the strength cases${r.diaphragm?.governing?` (${r.diaphragm.governing.combination}, x = ${len(r.diaphragm.governing.x)})`:r.diaphragm?'':', bounded by H·h (no solved case)'}; 0.02M_rC_d = ${mom(couple)}${arrangement.kind==='gusset'?`; H·e = ${frc(diaphragmForce)} × ${len(arrangement.yg)} (e: the gusset centroid to the tied flange)`:''}: M = ${mom(dia.M)}, V = ${frc(dia.V)}`;
 add('stiffener-lateral-flexure','Local forces','Restraint diaphragm lateral flexure',dia.M/pair.S,available(m.Fy,p.method,.9,1.67),'stress',`f_b=\\frac{M}{S};\\quad M=${Md}`,`${arrangement.text}. ${demandText}. ${sectionText}`);
 add('stiffener-combined-weld','Connections','Bearing stiffener welds · reaction with the lateral flange forces',diaphragmWeldEquivalent(a.reaction,dia,pair,welds.Lw),stiffWeld,'force',pair.composite?'R_{eq}=R+\\frac{2VL_wt_sb_s(t_w+b_s)}{2I}':'R_{eq}=R+2V+\\frac{6M}{L_w}',`The full vertical reaction R on the four web weld lines${pair.composite?` and the diaphragm's shear flow (V = ${frc(dia.V)}; first moment of one plate about the web centerline t_sb_s(t_w + b_s)/2 = ${format(pair.Q,'modulus',p.units,3)}, I = ${format(pair.I,'inertia',p.units,3)} of the pair), per line R/(4L_w) plus the flow over 2I`:`, the restraint force as direct shear (2V) and the diaphragm moment over the weld length (6M_d/L_w)`}, as an equivalent reaction on the group. ${weldNote} Fitted ends also require continuous flange fillets.`);
 checks.push(...bearingPlateChecks(p,a.reaction));
 if(bearingBolts)add('hold-down-model','Connections','End bearing uplift resistance',a.uplift,4*Math.min(...checks.filter(c=>['end-bearing-locating-tension','column-cap-bolt-tension'].includes(c.id)&&c.capacity!==undefined).map(c=>c.capacity!)),'force','R_{up}\\le4\\phi R_n','Four bolts through the bottom flange, bearing plate and seat at each girder end resist uplift; see End bearings.');
 else add('hold-down-model','Connections','End connection uplift resistance',a.uplift,Math.min(...checks.filter(c=>['end-bolt','end-slip','end-bearing','end-net','end-block'].includes(c.id)).map(c=>c.capacity??0)),'force','R_{up}\\le\\phi R_n\\ \\ \\text{(end connection)}','Uplift uses the same in-plane double-cover end connection; that connection is also checked for the full maximum reaction plus longitudinal action.');
 add('rotation-clearance','Detailing','Simple-end rotation clearance',p.section.d*a.endRotation,d.criteria.rotationClearance,'length','\\theta d\\le g','Maximum exact nodal rotation from all factored vertical load combinations, including dead load and impact, bounds the end rotation allowance. Clear flange ends and flexible end plates are required; the connection must not impose a moment fixity (AISC DG7 §11.2: girder end rotation released at the supports).',['dg7','criteria']);
 // Miner's rule over the duty bins as an equivalent constant-amplitude range at n_SR = Σn_i, against F_SR at n_SR (the
 // all-cycle basis); the damage sum Σn_i/N_i = (f_sr,eq/F_SR)^3 is given for information.
 const ksiText=(v:number)=>format(v,'stress',p.units,3);
 for(const f of r.fatigue){
  const m=minerEquivalent(f.bins,n=>fatigueSpectrumBin(f.category as 'A',1,n).allowable);
  add(`detail-fatigue-${f.id}`,'Fatigue',f.name,m.range,m.capacity,'stress',minerEquation(),`${f.reference}. Miner's rule over the duty bins as the equivalent constant-amplitude range at n_SR = ${m.cycles.toLocaleString('en-US')} cycles (bin ranges ${f.bins.map(b=>ksiText(b.range)).join(' / ')} at ${f.bins.map(b=>b.cycles.toLocaleString('en-US')).join(' / ')} cycles), against F_SR at n_SR without threshold credit; ${damageSum(m.damage)}. Each duty bin is analyzed with its lift fraction; empty and absent states and reversed half side thrust are included.${f.id.startsWith('SL')?' Stress: the local flange bending across the flange from the tie force range over the effective width (flange-tie-flange), in every bin.':' Stress includes major/minor bending and warping.'}${f.id.startsWith('RC')?' The girder stress range at the clip station; the clip forces act across the runway on the clip base welds and are checked there (rail clip base weld fatigue).':''}`,['aisc-fatigue','tr13-load','vlasov']);
 }
 // AISC 360-16 Appendix 3.1: the stress under the peak cyclic (unfactored) loads is limited to 0.66Fy. It is the dead-load
 // stress plus the largest signed stress of the unfactored fatigue loading at each register point; never a factored stress.
 const peakPoint=r.fatigue.reduce<typeof r.fatigue[number]|undefined>((a,f)=>!a||f.peak>a.peak?f:a,undefined),girderPeak=r.fatiguePeak;
 const peakAt=girderPeak&&girderPeak.value>=(peakPoint?.peak??0)?`the girder corner envelope at x = ${format(girderPeak.x,'length',p.units,3)} (${girderPeak.combination})`:peakPoint?`${peakPoint.name}, x = ${format(peakPoint.x,'length',p.units,3)}`:'';
 if(peakPoint||girderPeak)add('fatigue-peak-detailed','Fatigue','Elastic peak stress under the unfactored cyclic loads, including warping and dead load',Math.max(girderPeak?.value??0,peakPoint?.peak??0),.66*designFy,'stress','f_{max}\\le0.66F_y',`AISC 360-16 Appendix 3.1, unfactored loads: dead load (girder, cap, rail and the uniform live load) plus the unfactored fatigue loading Cds + lift fraction × Cvs + 0.5 Css, no impact, in every duty bin and crane position: the corner stress envelope of the girder (major and lateral bending, warping) at every station, and the largest signed stress at every fatigue detail. Governing: ${peakAt}. The factored strength stresses are not used.`,['aisc-fatigue']);
 // In addition to the spectrum, bound all cycles by the largest detail range.
 // This check avoids reliance on a cumulative-damage/endurance extrapolation.
 for(const f of r.fatigue)add(`detail-full-cycle-${f.id}`,'Fatigue',`${f.name} · all-cycle bound`,f.range,fatigueSpectrumBin(f.category as 'A',f.range,p.fatigue.cycles).allowable,'stress','\\max_i f_{sr,i}\\le6900(C_f/n_{SR})^{0.333}','Largest duty-bin range assigned to all cycles, without endurance-threshold credit.',['aisc-fatigue']);
 const totalCycles=d.spectrum.reduce((n,b)=>n+b.cycles,0),weldRange=categoryF(totalCycles);
 const tieArea=2*d.brace.connection.weldLength*d.brace.connection.weldSize/Math.sqrt(2),endArea=2*d.end.weldLength*d.end.weldSize/Math.sqrt(2);
 // A single flexible plate's lap couple adds a force pair across the column gusset thickness on the root fillets.
 const lapFactor=plate?1+2*tieEccentricity(p)/d.brace.gussetThickness:1;
 if(!cap&&!capAngle)add('tie-weld-fatigue','Fatigue','Flange-tie weld throat fatigue',r.demands.braceFatigue*lapFactor/(brace.cos*tieArea),weldRange,'stress',plate?'f_{sr}=\\frac{\\Delta F}{A_{we}}\\left(1+\\frac{2e}{t_g}\\right)\\le F_{SR}\\ \\ \\text{(Cat. F)}':'F_{SR}=690(1.5/n_{SR})^{0.167}\\ge55\\,\\mathrm{MPa}','Category F, AISC Table A-3.1 item 8.2. Full envelope range applied to every duty cycle; no fractional-duty reduction.'+(plate?' Includes the flexible plate lap couple ΔF·e as a force pair across the column gusset.':''),['aisc-fatigue']);
 const root=(id:string,title:string,range:number,t:number,w:number)=>{const cap=transverseFilletFatigue(t,w,totalCycles);add(id,'Fatigue',title,range,cap.capacity,'stress','R_{FIL}=\\min[1,(0.103+1.24w/t_p)/t_p^{0.167}];\\quad F_{SR}=6900R_{FIL}(4.4/n)^{0.333}',`Plate stress at the paired transverse fillet root; RFIL=${cap.reduction.toFixed(4)}. No threshold for RFIL<1. Category C toe also bounds the root model.`,['aisc-fatigue']);};
 if(!bearingBolts){
 add('end-weld-fatigue','Fatigue','End weld-group fatigue',r.demands.verticalFatigue/endArea*(1+6*d.end.projection/d.end.weldLength),weldRange,'stress','f_{sr}\\le F_{SR}\\ \\ \\text{(Cat. F)}','Direct-plus-eccentric full reaction range applied to every duty cycle. Longitudinal force is separately checked for full reversal below.',['aisc-fatigue']);
 add('longitudinal-fatigue','Fatigue','Combined end-reaction / traction weld fatigue',(r.demands.verticalFatigue*(1+6*d.end.projection/d.end.weldLength)+2*Math.max(...p.cranes.map(c=>c.longitudinal)))/endArea,weldRange,'stress','f_{sr}=[\\Delta R(1+6e/L_w)+2C_{ls}]/A_{we}','Sum of full reaction range including eccentricity and full traction reversal for every duty cycle. Category F; no concurrency or spectrum reduction credit.',['aisc-fatigue']);
 const endPlateRange=(2*Math.max(...p.cranes.map(c=>c.longitudinal)))/(2*d.end.thickness*d.end.weldLength)+6*r.demands.verticalFatigue*d.end.projection/(2*d.end.thickness*d.end.weldLength**2);
 root('end-root-fatigue','End plates · weld-root normal fatigue',endPlateRange,d.end.thickness,d.end.weldSize);
 }
 if(!cap&&!capAngle)root('tie-root-fatigue','Tie gusset · weld-root normal fatigue',r.demands.braceFatigue/(brace.cos*d.brace.gussetThickness*d.brace.connection.weldLength)*(plate?1+6*tieEccentricity(p)/d.brace.gussetThickness:1),d.brace.gussetThickness,d.brace.connection.weldSize);
 // The same diaphragm demand in fatigue: the largest St Venant torque range of a girder end in one duty bin (no brace force).
 const diaRange=diaphragmDemand(arrangement,{H:r.demands.braceFatigue,torque:r.diaphragm?.range??r.demands.braceFatigue*strength.h,couple:0,h:strength.h,h0:props.h0});
 const rangeText=arrangement.kind==='one-flange'?`ΔH = ${frc(r.demands.braceFatigue)} over h: ΔM = ${mom(diaRange.M)}`:`ΔT_sv = ${mom(r.diaphragm?.range??r.demands.braceFatigue*strength.h)}, the largest St Venant torque range of a girder end in one duty bin${arrangement.kind==='gusset'?`, plus ΔH·y_g`:''}: ΔM = ${mom(diaRange.M)}, ΔV = ${frc(diaRange.V)}`;
 add('stiffener-fatigue','Fatigue','Bearing stiffeners · plate fatigue',r.demands.verticalFatigue/(2*(bs.stiffenerWidth-bs.cope)*bs.stiffenerThickness)+diaRange.M/pair.S,fatigueSpectrumBin('C',1,totalCycles).allowable,'stress','f_{sr}=\\frac{\\Delta R}{A_{st}}+\\frac{\\Delta M}{S}\\le F_{SR}=6900(4.4/n_{SR})^{0.333}',`Sum of the full reaction axial range and the restraint diaphragm bending range of the stiffener pair (as stiffener-lateral-flexure: ${rangeText}), applied to every cycle.`,['aisc-fatigue']);
 add('stiffener-weld-fatigue','Fatigue','Bearing stiffeners · weld throat fatigue',diaphragmWeldEquivalent(r.demands.verticalFatigue,diaRange,pair,welds.Lw)/(4*welds.Lw*bs.weldSize/Math.sqrt(2)),weldRange,'stress',pair.composite?'f_{sr}=\\frac{\\Delta R+\\Delta VL_wt_sb_s(t_w+b_s)/I}{4L_w(0.707w)}':'f_{sr}=\\frac{\\Delta R+2\\Delta V+6\\Delta M/L_w}{4L_w(0.707w)}',`Effective weld length excludes both end copes; full reaction range and the restraint diaphragm's ${pair.composite?'shear flow':'force and moment'} range (${rangeText}) for all cycles.`,['aisc-fatigue']);
 add('stiffener-weld-minimum','Detailing','Bearing stiffener minimum fillet',filletMinimum([bs.stiffenerThickness,p.section.tw]),bs.weldSize,'length','w\\ge w_{min}','Continuous welds both sides of both plates; AISC 360-16 Table J2.4, by the thinner part joined (the stiffener or the girder web).');
 add('stiffener-weld-maximum','Detailing','Bearing stiffener fillet edge limit',bs.weldSize,Math.min(bs.stiffenerThickness,p.section.tw)-1.5875,'length','w\\le t-1/16\\,in','Full-throat edge buildup not credited.');
 if(!cap&&!capAngle){
 const gusset=d.brace.gussetThickness,gwidth=d.brace.connection.gauge+2*d.brace.connection.edge;
 add('tie-gusset-compression','Bracing','Tie gusset compression buckling',(r.demands.brace+imperfection)/brace.cos,compressionResistance(gwidth*gusset,gusset/Math.sqrt(12),2*d.brace.connectionLength,p.section.E,m.Fy,p.method).capacity,'force','P_n=F_{cr}A;\\quad L_c=2L_g','Unsupported gusset treated as a cantilever; full central-plate force, no beneficial load spreading.',['aisc-e']);
 checks.push(...restraint([...flangeTieChecks(s,(r.demands.brace+imperfection)/brace.cos),...stiffenerTieChecks(s,(r.demands.brace+imperfection)/brace.cos)]));
 checks.push(...restraint(tieMovementChecks(s,{force:(r.demands.brace+imperfection)/brace.cos,member:brace.member})));
 if(plate)checks.push(...restraint(plateTieChecks(s,{force:(r.demands.brace+imperfection)/brace.cos,cos:brace.cos,member:brace.member})));
 }
 checks.push(...spliceChecks(s));
 checks.push(...railChecks(s),...capAttachmentChecks(s),...simpleSupportChecks(p,a.endRotation),...endStopChecks(p,{analysis:h1,strength:h1Strength,props,holdDown:checks.find(c=>c.id==='hold-down-model')?.capacity??0}));

 // A restraint component past its strength (flange-tie-*, D/C > 1) yields before the analysis' elastic restraint
 // stiffness is reached: the stresses, twist, multiplier and rail movement rely on that stiffness.
 const yielded=checks.filter(c=>/^flange-tie-/.test(c.id)&&!/fatigue/.test(c.id)&&c.status==='fail'&&(c.utilization??0)>1);
 if(yielded.length){const worst=yielded.reduce((x,y)=>(y.utilization??0)>(x.utilization??0)?y:x),text=` Relies on the elastic stiffness of the direct flange tie attachment, whose strength is exceeded (${worst.id} D/C ${(worst.utilization??0).toFixed(2)}${yielded.length>1?` and ${yielded.length-1} more`:''}): the restraint yields first, so this result holds only once the attachment is strengthened (or rerun with the restraint at its yield force over its elastic displacement).`;
  for(const c of checks)if(/^(torsion-normal|torsion-normal-bottom|torsion-stability|flexure-load-height|rail-head)$/.test(c.id))c.note+=text;}
 // Unstable strength cases (no second-order state at the factored load): every check whose demand comes from their
 // stresses or restraint forces fails with no capacity (utilization Infinity), so no unstable case lowers a D/C. Fatigue
 // and service cases are first-order and stay; geometric limits stay.
 if(r.unstableCases){
  const n=r.unstableCases,why=`Girder unstable at the factored load in ${n} case${n>1?'s':''} (λ = ${r.criticalMultiplier.toFixed(2)} at 0.8 stiffness, not above α = ${alpha}): those cases have no second-order equilibrium, so their stresses and restraint forces are not recovered and this check has no capacity. `;
  const own=/^(torsion-normal|torsion-normal-bottom|torsion-shear|rail-head|brace-member|brace-stiffness|stiffener-lateral-flexure|stiffener-combined-weld|tie-gusset-compression|cap-weld-(strength|metal|rupture))$/;
  const strengthResult=(c:CheckResult)=>c.demand!==undefined&&!/fatigue/.test(c.id)&&c.group!=='Fatigue'&&(c.quantity!=='length'||c.id==='rail-head')&&!['not-applicable','excluded','unsupported','unverified','incomplete'].includes(c.status);
  for(const c of checks)if((own.test(c.id)||restraintChecks.has(c))&&strengthResult(c))Object.assign(c,{status:'fail',utilization:Infinity,noCapacity:true,substitution:`\\lambda=${r.criticalMultiplier.toFixed(3)}\\le\\alpha=${alpha}`,note:why+c.note});
 }
 return checks;
 };
 // A level is kept only as what refinementChange compares, the D/C of every check by id and the support force
 // envelope, once its checks are built: its results, checks and case registry are released (only the finest mesh
 // level, which may be reported, keeps its results until the next one replaces it).
 type Level={checks:CheckResult[];results:RunwayDetailResults};
 const level=(r:RunwayDetailResults):Level=>({checks:levelChecks(r,[],false).map(c=>({id:c.id,utilization:c.utilization}) as CheckResult),results:{bracketForces:r.bracketForces} as RunwayDetailResults});
 // Crane positions first, at the base mesh: one crane refines to 32 times the base steps (the search converges
 // first-order where a fatigue range peaks between stations), several cranes to 4 times.
 let coarse=level(run(steps,20)),fine=level(run(steps*2,20)),travel=steps*2;
 const travelSteps=[refinementChange(coarse,fine)];
 while(travelSteps.at(-1)!.value>.01&&travel<steps*(p.cranes.length===1?32:4)){coarse=fine;travel*=2;fine=level(run(travel,20));travelSteps.push(refinementChange(coarse,fine));}
 // Then the lateral/warping mesh, doubled from 20 elements per span until it converges, up to 160 per span (a
 // continuous girder is one member over all its spans: createDetailCollector gives it that many per span on average).
 let spatial=run(travel,40),mesh=40,spatialLevel=level(spatial);
 const meshSteps=[refinementChange(fine,spatialLevel)];
 for(const next of [80,160]){if(meshSteps.at(-1)!.value<=.01)break;fine=spatialLevel;spatial=run(travel,next);spatialLevel=level(spatial);mesh=next;meshSteps.push(refinementChange(fine,spatialLevel));}
 const travelVerdict=refinementVerdict(travelSteps),meshVerdict=refinementVerdict(meshSteps);
 const r=spatial;r.travelChange=travelVerdict.value;r.meshChange=meshVerdict.value;
 const pct=(v:number)=>`${(100*v).toFixed(2)}%`;
 const verdictNote=(v:ReturnType<typeof refinementVerdict>,what:string)=>v.estimate!==undefined&&v.converged?` The last refinement of the ${what} changed the governing results by ${pct(v.last)} (${v.governing}); every result above 1% changed by a ratio of at most ${v.ratio!.toFixed(2)} over the last two refinements, so the reported results of the finest ${what} are within an estimated ${pct(v.estimate)} of the converged values (ρ/(1−ρ) times the last change).`:v.governing&&v.value>0?` Largest change: ${v.governing}.`:'';
 const governingNote='Governing results: the D/C of every detailed check, |ΔD/C|/max(D/C, 0.5) (a result with D/C ≥ 0.5 to within 1%, a smaller one to within 0.005 of its D/C), and the support forces delivered to the building at each grid.';
 for(const [v,what] of [[travelVerdict,'crane positions'],[meshVerdict,'mesh']] as const)if(v.converged&&v.estimate!==undefined)s.warnings.push(`Verification note: ${verdictNote(v,what).trim()}`);
 const analysis=[
  compared('detail-equilibrium','Analysis','Lateral / torsional equation residual',r.residual,1e-6,'ratio','|\\text{residual}|/|\\text{load}|\\le10^{-6}','Banded finite-element solution; all sampled strength, single-crane service and fatigue-bin states. Double-precision round-off in Ku grows with the conditioning of a softly supported girder near its critical load (1e-8 to 3e-7 for stable models); an unbalanced or mis-assembled model gives residuals of order one, so 1e-6 still exposes it.',['vlasov']),
  compared('detail-travel','Analysis','Detailed load-position refinement',travelVerdict.value,.01,'ratio',refinementEquation(travelVerdict,'crane positions'),`${governingNote} Crane positions refined to ${travel} travel steps.${verdictNote(travelVerdict,'crane positions')}`,['mechanics','vlasov']),
  compared('detail-mesh','Analysis','Lateral / warping mesh refinement',meshVerdict.value,.01,'ratio',refinementEquation(meshVerdict,'elements'),`Each wheel, support and brace is a mesh node; points closer than 1 mm, 1/10,000 of the member or 1/100 of the section depth (the largest) share a node, so no element is a sliver. Checks both sides of element boundaries and interior stations. ${governingNote} Refined to ${mesh} elements per span.${verdictNote(meshVerdict,'mesh')}`,['vlasov'])
 ];
 return levelChecks(r,analysis,true);
}
