import {braceImperfection} from './forcesDelivered';
import {categoryF,damageSum,damageText,minerEquation,minerEquivalent} from './fatigueConstants';
import {format} from './units';
import {flangeTieChecks,stiffenerTieChecks} from './flangeTieDesign';
import {tieMovementChecks} from './tieMovement';
import {isPlateTie,plateTieChecks} from './plateTie';
import {capTieLine,isCapAngleTie} from './capAngle';
import {clearanceEffects,secantStiffness} from './restraintClearance';
import {railTopAboveSteel} from './railSeat';
import {capAngleChecks} from './capAngleTie';
import {tieEccentricity} from './tieGeometry';
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
import {endBearingChecks,activeEndBearing} from './endBearing';
import {activeColumnCap} from './columnCapInputs';
import {columnCapChecks} from './columnCap';

const compared=(id:string,group:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,referenceIds=['aisc-connections']):CheckResult=>({id,group,title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,referenceIds});
const resolved=(id:string,title:string,note:string,referenceIds=['aisc-connections']):CheckResult=>({id,group:'Connections',title,status:'not-applicable',equation:'',note,referenceIds});
function lapChecks(p:ProjectInput,c:LapConnection,id:string,title:string,fx:number,fy:number,centralThickness:number,centralFy:number,centralFu:number){
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
 if(r.bracket)checks.push(...bracketChecks(p,r.bracket,a.serviceReaction));
 if(r.existingBracket)checks.push(...existingBracketChecks(p,r.existingBracket));
 if(r.rolledBracket)checks.push(...rolledBracketChecks(p,r.rolledBracket,a.serviceReaction));
 if(r.taperedHaunch)checks.push(...taperedHaunchChecks(p,r.taperedHaunch,a.serviceReaction));
 checks.push(...analysis);
 const add=(...args:Parameters<typeof compared>)=>checks.push(compared(...args));
 // m11: the combined normal stress at each flange's own extreme fibres (AISC DG7 / DG9), top (cap tips) and bottom.
 const capped=p.section.kind==='cap',capMech=cappedMechanics(p.section),fw=r.flangeWarping,fn=r.flangeNormal??{top:r.normalStress,bottom:r.normalStress};
 const normalNote=(k:'top'|'bottom')=>`${k==='top'?(capped?'Top flange: the cap channel tips':'Top flange tips'):'Bottom flange: the W bottom flange tips'}, S_x${k==='top'?'c':'t'} = ${format(capMech?(k==='top'?capMech.Stop:capMech.Sbottom):props.Sx,'modulus',p.units,4)}${fw?`, W_no = ${format(fw[k],'area',p.units,3)}`:''}. P/A, M_x/S_x of this flange's fibre, lateral bending (M_y + θM_x) over I_y at this flange's half width and warping E W_no θ″ at its tips, added by magnitude at every station and strength case. Coupled second-order response with the load above the shear center, finite restraint stiffness and 0.8 elastic stiffness for strength. ${k==='top'?'The bottom':'The top'} flange is checked separately.${r.governing[k==='top'?'normalStressTop':'normalStressBottom']?` Governing ${r.governing[k==='top'?'normalStressTop':'normalStressBottom'].combination} at x = ${format(r.governing[k==='top'?'normalStressTop':'normalStressBottom'].x,'length',p.units,3)}.`:''}`;
 add('torsion-normal','Strength',capped?'Combined normal stress with warping · top flange (cap tips)':'Combined normal stress with warping · flange tips',fn.top,available(designFy,p.method,.9,1.67),'stress','f_{un}=\\frac{P}{A}+\\frac{M_x}{S_{xc}}+\\frac{M_y+\\theta M_x}{S_y}+\\sigma_{ws};\\quad\\sigma_{ws}=EW_{no}\\theta^{\\prime\\prime}',normalNote('top'),['aisc-h3','dg7','vlasov']);
 if(capped)add('torsion-normal-bottom','Strength','Combined normal stress with warping · bottom flange',fn.bottom,available(designFy,p.method,.9,1.67),'stress','f_{un}=\\frac{P}{A}+\\frac{M_x}{S_{xt}}+\\frac{(M_y+\\theta M_x)b_f}{2I_y}+\\sigma_{ws};\\quad\\sigma_{ws}=EW_{no}\\theta^{\\prime\\prime}',normalNote('bottom'),['aisc-h3','dg7','vlasov']);
 add('torsion-shear','Strength','Combined shear including Saint-Venant / warping',r.shearStress,available(.6*designFy,p.method,.9,1.67),'stress','f_{uv}=\\tau_b+\\tau_t+\\tau_{ws};\\quad\\tau_t=Gt\\theta^{\\prime},\\ \\tau_{ws}=\\frac{ES_w\\theta^{\\prime\\prime\\prime}}{t}','Checks flange and web shear bounds, adding direct shear and torsional components by magnitude. No torsional plastic redistribution.',['aisc-h3','vlasov']);
 add('torsion-stability','Strength','Load-height / lateral-torsional stability',p.method==='LRFD'?1/.9:1.67,r.criticalMultiplier,'ratio',p.method==='LRFD'?'\\lambda=M_{cr}/M_u\\ge1/\\phi_b':'\\lambda=M_{cr}/M_a\\ge\\Omega_b',`Lowest sampled elastic critical load multiplier with 0.8 member and brace stiffness. Major-moment coupling, axial geometric stiffness, above-shear-center wheel forces and an elevated dead load are included. The load-height flexural strength and H1 also control.${r.unstableCases?` ${r.unstableCases} strength case${r.unstableCases>1?'s buckle':' buckles'} below the applied load, so their stresses and restraint forces are not recovered: increase the girder, cap or bracing.`:''}`,['aisc-f4','vlasov']);
 // M2: load-height LTB. The elastic buckling eigenvalue of the bay with the wheels at the rail head gives M_cr; it enters
 // F4 (F2 / F5) as Cb = M_cr / M_ocr (AISC 360-16 F1, Commentary F1), never above 1. The Commentary F1 load-height Cb of
 // the same case is printed beside it for comparison.
 let mcxNote=`M_cx = φM_n = ${format(strength.major,'moment',p.units,3)} (Cb = 1)`,mcx=strength.major;
 if(r.loadHeight){const lh=r.loadHeight,cm=lh.commentary,f=(v:number|undefined,q:'moment'|'length')=>format(v,q,p.units,3);
  const lambda=Number.isFinite(lh.critical)?.8*lh.critical/lh.demand:undefined,F=capped?'F4':'F2',Sx=capped?'S_{xc}':'S_x';
  add('flexure-load-height','Strength','Major flexure · lateral-torsional buckling with load height',lh.demand,lh.capacity,'moment',`M_u\\le\\phi_bM_n,\\ \\ M_n=\\min(${capped?'R_{pc}M_{yc}':'M_p'},\\ C_bM_{n,LTB});\\quad C_b=\\frac{M_{cr}}{F_{cr}${Sx}}\\le1`,
   `Governing case ${lh.combination} at x = ${f(lh.x,'length')}. Elastic buckling eigenvalue of the girder bay (thin-walled beam with warping, 0.8 stiffness) with the wheels at the rail head ${f(lh.height,'length')} above the shear center, the UDL at rail height, the axial force, the modeled tie and bearing restraints and the moment gradient of the case: ${lambda!==undefined?`λ = ${lambda.toFixed(2)}, M_cr = λM_u/0.8 = ${f(lh.critical,'moment')}`:'M_cr above the uniform-moment value'}. Uniform-moment elastic moment at L_b = ${f(p.unbracedLength,'length')} (${capped?'F4-5':'F2-4'}, C_b = 1): F_cr${capped?'S_xc':'S_x'} = ${f(lh.mocr,'moment')}, so C_b = ${lh.cb.toFixed(2)} (AISC 360-16 F1; at most 1, no moment-gradient credit) multiplies the ${capped?'F4-2 / F4-3':'F2-2 / F2-3'} moment.${cm?` AISC 360-16 Commentary F1 comparison: C_b (F1-1) = ${cm.gradient.toFixed(2)} for this moment diagram over L_b, times 1.4^(2y/h) = ${cm.factor.toFixed(2)} with y = ${f(cm.y,'length')} from mid-depth to the rail head and h = ${f(cm.h,'length')}: C_b = ${cm.cb.toFixed(2)}, φM_n = ${f(cm.capacity,'moment')} (D/C ${(lh.demand/cm.capacity).toFixed(2)}); the factor is extrapolated above the top flange and measured from mid-depth rather than the shear center.`:''} Major flexure with load height; H1 uses this strength as M_cx.`,['aisc-f4','dg7','vlasov']);
  if(lh.capacity<mcx-1e-9){mcx=lh.capacity;mcxNote=`M_cx = φM_n = ${f(mcx,'moment')}, the load-height LTB strength (C_b = ${lh.cb.toFixed(2)}), which governs major flexure`;}
 }
 // H1 at each flange with the governing major-axis strength: re-run the design envelope when load height lowers M_cx.
 const h1=reported&&mcx<strength.major-1e-9&&a.travelSteps?runwayDesignAnalysis(p,props,{...strength,major:mcx},a.travelSteps,a.mesh??40):a;
 r.interaction={mcx,top:h1.interactionTop??h1.interaction,bottom:h1.interactionBottom??h1.interaction,topCase:h1.governing.interactionTop,bottomCase:h1.governing.interactionBottom,combinations:h1.combinations.map(c=>({id:c.id,interaction:c.interaction}))};
 checks.push(...flangeInteractionChecks(p,h1,strength,mcxNote));
 // Restraint play (restraintClearances): rigid-body take-up added to the elastic rail-head movement.
 const play=clearanceEffects(p,props,capTieLine(p),(capped?p.section.d+p.section.capTw:p.section.d)+railTopAboveSteel(p)),len=(v:number)=>format(v,'length',p.units,3);
 add('rail-head','Serviceability','Rail-head lateral movement including twist',r.railDisplacement+(play.any?play.rail:0),Math.min(...p.spans)/Math.max(400,p.lateralLimit,d.criteria.railLateralLimit),'length',play.any?'\\Delta_r=\\Delta_o+(y_r-y_o)\\theta+g_t+\\frac{g_t+g_b}{h_r}(y_r-y_t)':'\\Delta_r=\\Delta_o+(y_r-y_o)\\theta',`Single static crane; finite girder-side tie/connection flexibility. Building interfaces are assumed fixed and their framing/foundations are excluded.${play.any?` Elastic movement ${len(r.railDisplacement)} plus the rigid-body take-up of the restraint play ${len(play.rail)}: top tie g_t = ${len(play.gt)}, sliding bearing g_b = ${len(play.gb)}, taken up in opposite directions over h_r = ${len(play.hr)} between the tie line and the bottom flange (θ = ${play.theta.toFixed(4)} rad), the rail head ${len((capped?p.section.d+p.section.capTw:p.section.d)+railTopAboveSteel(p)-play.yt)} above the tie line.`:''}`,['tr13-girder','criteria','vlasov']);
 // Rail twist: TR-13 sets no rotation limit, so it is checked only against a limit the owner or crane supplier enters.
 // The rotation itself comes from the lateral / warping torsion model; without a limit the row is informational.
 const twistLimit=d.criteria.twistLimit,twistAt=r.governing.twist?` Governing ${r.governing.twist.combination} at x = ${format(r.governing.twist.x,'length',p.units,3)}.`:'';
 if(twistLimit)add('rail-twist','Serviceability','Rail rotation · owner criterion',r.twist,twistLimit,'ratio','\\theta\\le\\theta_{max}\\ \\ \\text{(owner)}',`Rail rotation from the lateral / warping torsion analysis against the twist limit entered by the owner or crane supplier (${p.criteriaSource||'source not stated'}). AIST TR-13 gives no rail twist limit. Distinct from girder lateral bending deflection.${twistAt}`,['criteria']);
 else checks.push({id:'rail-twist',group:'Serviceability',title:'Rail rotation (no limit specified)',status:'not-applicable',demand:r.twist,quantity:'ratio',equation:'\\theta',referenceIds:['criteria'],note:`Rail rotation ${r.twist.toExponential(3)} rad from the lateral and warping torsion analysis.${twistAt} AIST TR-13 sets no rail rotation limit and the owner and crane supplier specify none.`});
 // Appendix 6 brace force and stiffness (forcesDelivered.braceImperfection: the same numbers the report derives).
 const brace=braceSystem(p),A6=braceImperfection(p,a,props),imperfection=A6.force,requiredK=A6.stiffness;
 const plate=isPlateTie(p),capAngle=isCapAngleTie(p);
 const cap=activeColumnCap(p),capR=r.columnCap;
 if(cap&&capR){
  // A column cap: the girder end is a fork on the cap; no flange tie. Its restraint stiffness, strength, bolts and welds.
  checks.push(...columnCapChecks(p,capR,{imperfection,required:requiredK}));
 }else if(capAngle){
  // Cap tieback angle (top flange only; the bolted end bearings restrain the bottom flange): its own member, stiffness and components.
  const c=(brace as {compliance?:Record<string,number>}).compliance??{},share=(k:string)=>`${k} ${(100*(c[k]??0)*brace.stiffness).toFixed(0)}%`;
  add('brace-member','Bracing','Top-flange tie strength',r.demands.brace+imperfection,brace.capacity,'force','P_{br}=H+0.02M_rC_d/h_o+0.01P_r',`Cap tieback angle at the top flange; the bottom flange is restrained by the end bearing bolts. The tie plate in tension (D2) and in compression over its clear span (E3, K = 1.0); full concurrent horizontal reaction plus flexural/axial imperfection demands. The angle, bolts, end plate and column flange are checked under Cap tieback.`,['aisc-brace','aisc-e','cap-angle-basis']);
  add('brace-stiffness','Bracing','Brace and connection stiffness in series',requiredK,secantStiffness(brace.stiffness,play.gt,imperfection),'stiffness',play.gt>0?'\\beta_{sec}=\\left(\\sum1/k_i+g_t/P_{br}\\right)^{-1}\\ge\\beta_{br}':'\\beta=\\left(\\sum1/k_i\\right)^{-1}\\ge\\beta_{br}',`${play.gt>0?`Secant stiffness with the angle's play g_t = ${len(play.gt)} taken up at the Appendix 6 brace force P_br = ${format(imperfection,'force',p.units,3)}: (1/${format(brace.stiffness,'stiffness',p.units,3)} + g_t/P_br)⁻¹ = ${format(secantStiffness(brace.stiffness,play.gt,imperfection),'stiffness',p.units,3)}. `:''}Cap tieback angle in pull, in series: tie plate axial strain over its clear span, lap bolt shear, the angle's short leg bending from the bolt line to the long leg, the channel flange bending from its web, cap and column bolt elongation, the end plate between its bolts, the shims and the column flange bending from its web. Shares of the compliance: ${['plate','lapBolts','angleLeg','channelFlange','capBolts','endPlate','columnBolts','shims','columnFlange'].map(share).join(', ')}. This stiffness is the top-flange restraint of the lateral/torsional model. Building deformation is excluded at the stated interface. Top-flange load amplification is included in Appendix 6 requirements.`,['aisc-brace','cap-angle-basis']);
  checks.push(...capAngleChecks(s,{force:(r.demands.brace+imperfection)/brace.cos}));
 }else{
 add('brace-member','Bracing',activeEndBearing(p)?'Top-flange tie strength':'Both-flange tie strength',r.demands.brace+imperfection,brace.capacity,'force','P_{br}=H+0.02M_rC_d/h_o+0.01P_r',`${plate?'One flexible plate (AISC DG7 §11.2) at':'Two symmetric flat bars at'} ${activeEndBearing(p)?'the top flange; the bottom flange is restrained by the end bearing bolts':'each flange'}. Out-of-plane buckling over 0.8 × the length between the innermost bolt rows, and net-section tension; full concurrent horizontal reaction plus flexural/axial imperfection demands.`,['aisc-brace','aisc-e']);
 add('brace-stiffness','Bracing','Brace and connection stiffness in series',requiredK,secantStiffness(brace.stiffness,play.gt,imperfection),'stiffness',play.gt>0?'\\beta_{sec}=\\left[\\left(\\cos^2\\theta\\left(\\sum1/k_i\\right)^{-1}\\right)^{-1}+g_t/P_{br}\\right]^{-1}\\ge\\beta_{br}':'\\beta=\\cos^2\\theta\\left(\\sum1/k_i\\right)^{-1}\\ge\\beta_{br}',(play.gt>0?`Secant stiffness with the gusset slot play g_t = ${len(play.gt)} taken up at the Appendix 6 brace force P_br = ${format(imperfection,'force',p.units,3)}. `:'')+(plate?'One flexible plate; single-plane bolt shear deformation, and the lap couple rotating both gussets (e²/k_gusset), are included. ':'')+'Gusset axial strain and bolt shear deformation are included at both ends. Direct flange saddles additionally include local flange, saddle, gusset and receiving-flange flexibility. Building deformation is excluded at the stated interface. Top-flange load amplification is included in Appendix 6 requirements.',['aisc-brace']);
 // The single flexible plate's single-shear laps are checked with the plate (plateTieChecks).
 if(!plate)checks.push(...lapChecks(p,d.brace.connection,'tie','Flange tie connection',(r.demands.brace+imperfection)/brace.cos,0,d.brace.gussetThickness,d.material.Fy,d.material.Fu));
 }
 const bearingBolts=activeEndBearing(p);
 // The fork brings both flange forces to the bearing bolts.
 const boltLateral=cap&&capR?Math.max(...capR.grids.map(v=>v.lateral.value))+imperfection:r.demands.brace+imperfection;
 if(bearingBolts)checks.push(...endBearingChecks(p,bearingBolts,{analysis:a,lateral:boltLateral}));
 else checks.push(...lapChecks(p,d.end,'end','Girder end / longitudinal connection',a.axial,Math.max(a.reaction,a.uplift),p.section.tw,p.section.Fy,p.section.Fu));
 const bs=d.bearing,m=d.material,stiffener=bearingStiffener({width:bs.stiffenerWidth,thickness:bs.stiffenerThickness,cope:bs.cope,webThickness:p.section.tw,webDepth:strength.h,flangeThickness:p.section.tf,loadedWidth:p.section.bf,E:p.section.E,Fy:Math.min(m.Fy,p.section.Fy),method:p.method});
 add('stiffener-column','Local forces','Paired full-depth bearing stiffeners',a.reaction,stiffener.compression.capacity,'force','L_c=0.75h;\\quad A=2b_st_s+12t_w^2;\\quad P_n=F_{cr}A','Uses the smaller end effective web strip at every support. Fitted stiffeners, full-depth web welds; no reliance on the bare web strength.',['aisc-connections','aisc-e']);
 add('stiffener-bearing','Local forces','Fitted stiffener-end bearing',a.reaction,stiffener.bearing,'force','R_n=1.8F_y A_{pb}','Actual cope deducted from both fitted bearing areas; requires milled/fitted contact to the loaded flange.',['aisc-connections']);
 add('stiffener-width','Detailing','Stiffener minimum width',stiffener.minimumWidth,bs.stiffenerWidth,'length','b_s+t_w/2\\ge b_f/3','J10.8 additional stiffener geometry.');
 add('stiffener-thickness','Detailing','Stiffener minimum thickness',stiffener.minimumThickness,bs.stiffenerThickness,'length','t_s\\ge\\max(t_f/2,b_s/16)','J10.8 additional stiffener geometry.');
 const stiffWeld=available(.6*m.Fexx*(bs.weldSize/Math.sqrt(2))*4*(strength.h-2*bs.cope),p.method,.75,2);
 add('stiffener-weld','Connections','Stiffener-to-web load transfer',a.reaction,stiffWeld,'force','R_n=0.6F_{EXX}(0.707w)(4h)','Four continuous full-depth fillet lines transfer the full support reaction, without reducing demand by web resistance.');
 const diaphragmForce=r.demands.brace+imperfection,diaphragmMoment=diaphragmForce*strength.h;
 add('stiffener-lateral-flexure','Local forces','Restraint diaphragm lateral flexure',diaphragmMoment/(2*bs.stiffenerThickness*bs.stiffenerWidth**2/6),available(m.Fy,p.method,.9,1.67),'stress','f_b=\\frac{Hh}{2t_sb_s^2/6}','Paired full-depth plates at every flange-restraint station. Full-height cantilever for the larger flange reaction plus imperfection, with no web participation.');
 add('stiffener-combined-weld','Connections','Bearing stiffener welds · reaction with the lateral flange forces',a.reaction+8*diaphragmForce,stiffWeld,'force','R_{eq}=R+2H+\\frac{6Hh}{h}=R+8H','Direct-plus-moment stress bound on the four web weld lines: the full vertical reaction R, both lateral flange forces H as direct shear (2H) and their moment H·h over the weld length h (6Hh/h = 6H), R_eq = R + 8H. Fitted ends also require continuous flange fillets.');
 const bearingPressure=a.reaction/(bs.width*bs.length),cantilever=Math.max((bs.width-(2*bs.stiffenerWidth+p.section.tw))/2,(bs.length-bs.stiffenerThickness)/2);
 add('bearing-plate','Connections','Bearing plate flexure',6*(bearingPressure*cantilever**2/2)/bs.thickness**2,available(m.Fy,p.method,.9,1.67),'stress','f_b=6m/t_p^2;\\quad m=f_pa^2/2','Uniform contact over the steel seat plate; longest cantilever from the stiffener load footprint. Enabled welded brackets have a separate Column bracket check group; full frame capacity is outside scope.');
 add('bearing-contact','Connections','Steel bearing contact',bearingPressure,available(1.8*Math.min(m.Fy,p.section.Fy),p.method,.75,2),'stress','f_p=R/A_{pb}\\le1.8F_y','Fitted steel-to-steel contact. No concrete/foundation resistance is evaluated.');
 if(bearingBolts)add('hold-down-model','Connections','End bearing uplift resistance',a.uplift,4*Math.min(...checks.filter(c=>['end-bearing-locating-tension'].includes(c.id)).map(c=>c.capacity??0)),'force','R_{up}\\le4\\phi R_n','Four bolts through the bottom flange, bearing plate and seat at each girder end resist uplift; see End bearings.');
 else add('hold-down-model','Connections','End connection uplift resistance',a.uplift,Math.min(...checks.filter(c=>['end-bolt','end-slip','end-bearing','end-net','end-block'].includes(c.id)).map(c=>c.capacity??0)),'force','R_{up}\\le\\phi R_n\\ \\ \\text{(end connection)}','Uplift uses the same in-plane double-cover end connection; that connection is also checked for the full maximum reaction plus longitudinal action.');
 add('rotation-clearance','Detailing','Simple-end rotation clearance',p.section.d*a.endRotation,d.criteria.rotationClearance,'length','\\theta d\\le g','Maximum exact nodal rotation from all factored vertical load combinations, including dead load and impact, bounds the end rotation allowance. Clear flange ends and flexible end plates are required; the connection must not impose a moment fixity (AISC DG7 §11.2: girder end rotation released at the supports).',['dg7','criteria']);
 // Miner's rule over the duty bins as an equivalent constant-amplitude range at n_SR = Σn_i, against F_SR at n_SR (the
 // all-cycle basis); the damage sum Σn_i/N_i = (f_sr,eq/F_SR)^3 is given for information.
 const ksiText=(v:number)=>format(v,'stress',p.units,3);
 for(const f of r.fatigue){
  const m=minerEquivalent(f.bins,n=>fatigueSpectrumBin(f.category as 'A',1,n).allowable);
  add(`detail-fatigue-${f.id}`,'Fatigue',f.name,m.range,m.capacity,'stress',minerEquation(),`${f.reference}. Miner's rule over the duty bins as the equivalent constant-amplitude range at n_SR = ${m.cycles.toLocaleString('en-US')} cycles (bin ranges ${f.bins.map(b=>ksiText(b.range)).join(' / ')} at ${f.bins.map(b=>b.cycles.toLocaleString('en-US')).join(' / ')} cycles), against F_SR at n_SR without threshold credit; ${damageSum(m.damage)}. Each duty bin is analyzed with its lift fraction; empty and absent states and reversed half side thrust are included. Stress includes major/minor bending and warping.${f.id.startsWith('RC')?' The girder stress range at the clip station; the clip forces act across the runway on the clip base welds and are checked there (rail clip base weld fatigue).':''}`,['aisc-fatigue','tr13-load','vlasov']);
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
 add('stiffener-fatigue','Fatigue','Bearing stiffeners · plate fatigue',r.demands.verticalFatigue/(2*(bs.stiffenerWidth-bs.cope)*bs.stiffenerThickness)+r.demands.braceFatigue*strength.h/(2*bs.stiffenerThickness*bs.stiffenerWidth**2/6),fatigueSpectrumBin('C',1,totalCycles).allowable,'stress','f_{sr}=\\Delta R/A_{st}\\le F_{SR}=6900(4.4/n_{SR})^{0.333}','Sum of full reaction axial range and full lateral-brace bending range through the stiffener pair, applied to every cycle.',['aisc-fatigue']);
 add('stiffener-weld-fatigue','Fatigue','Bearing stiffeners · weld throat fatigue',(r.demands.verticalFatigue+8*r.demands.braceFatigue)/(4*(strength.h-2*bs.cope)*bs.weldSize/Math.sqrt(2)),weldRange,'stress','f_{sr}=\\Delta R/A_{we}','Effective weld length excludes both end copes; full reaction range for all cycles.',['aisc-fatigue']);
 add('stiffener-weld-minimum','Detailing','Bearing stiffener minimum fillet',filletMinimum([bs.stiffenerThickness,p.section.tw]),bs.weldSize,'length','w\\ge w_{min}','Continuous welds both sides of both plates; AISC 360-16 Table J2.4, by the thinner part joined (the stiffener or the girder web).');
 add('stiffener-weld-maximum','Detailing','Bearing stiffener fillet edge limit',bs.weldSize,Math.min(bs.stiffenerThickness,p.section.tw)-1.5875,'length','w\\le t-1/16\\,in','Full-throat edge buildup not credited.');
 if(!cap&&!capAngle){
 const gusset=d.brace.gussetThickness,gwidth=d.brace.connection.gauge+2*d.brace.connection.edge;
 add('tie-gusset-compression','Bracing','Tie gusset compression buckling',(r.demands.brace+imperfection)/brace.cos,compressionResistance(gwidth*gusset,gusset/Math.sqrt(12),2*d.brace.connectionLength,p.section.E,m.Fy,p.method).capacity,'force','P_n=F_{cr}A;\\quad L_c=2L_g','Unsupported gusset treated as a cantilever; full central-plate force, no beneficial load spreading.',['aisc-e']);
 checks.push(...flangeTieChecks(s,(r.demands.brace+imperfection)/brace.cos),...stiffenerTieChecks(s,(r.demands.brace+imperfection)/brace.cos));
 checks.push(...tieMovementChecks(s,{force:(r.demands.brace+imperfection)/brace.cos,member:brace.member}));
 if(plate)checks.push(...plateTieChecks(s,{force:(r.demands.brace+imperfection)/brace.cos,cos:brace.cos,member:brace.member}));
 }
 checks.push(...railChecks(s),...capAttachmentChecks(s),...simpleSupportChecks(p,a.endRotation),...endStopChecks(p,{analysis:a,strength:{...strength,major:Math.min(strength.major,mcx)},props,holdDown:checks.find(c=>c.id==='hold-down-model')?.capacity??0}));

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
