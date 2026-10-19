import {categoryF} from './fatigueConstants';
import {girderSegments} from './simpleSupports';
import type {CalculationSnapshot,CheckResult,ProjectInput} from './types';
import {cappedMechanics} from './cappedMechanics';
import {aiscChannelByName} from '../data/aiscChannels';
import {available} from './aiscStrength';
import {filletMinimum} from './connectionStrength';
import {railTopAboveSteel} from './railSeat';
import {wheelLocalCycles,clipWindow} from './railClip';
import {format} from './units';
import {astmSpec} from './materialSpecs';

/** Least clear pocket each side for the continuous cap-to-flange fillet (configurator capWeldPocket). */
const capPocketMinimum=1.5*25.4;
export function capInputChecks(p:ProjectInput):CheckResult[]{
 if(p.section.kind!=='cap')return [];
 const d=p.capDesign,m=cappedMechanics(p.section);
 const gate=(id:string,title:string,ok:boolean,note:string,status:CheckResult['status']='incomplete'):CheckResult=>({id,group:'Cap channel',title,status:ok?'pass':status,equation:'',referenceIds:['dg7-cap','cap-sectorial'],note});
 return [
  gate('cap-catalogue','Capped section model',!!cappedMechanics(p.section),'Catalog W shape with a centered, inverted C or MC channel cap; full-length cap with two continuous longitudinal welds. Thin-wall integration of the warping function (C_w, W_n, S_w); catalog component bending properties.','unsupported'),
  gate('cap-compression-components','Cap lies wholly within top compression flange',!!m&&p.section.d+p.section.capTw-p.section.capDepth>m.elastic.cy&&p.section.d-p.section.tf>m.elastic.cy,'The complete channel and W top flange must lie above the elastic neutral axis for the F4/F5 compression-flange idealization. Deep caps on shallow W members require a separate section model.','unsupported'),
  gate('cap-material','Channel steel and weld material',!!d&&d.Fu>=d.Fy&&!!d.materialSource.trim(),d&&d.Fu>=d.Fy&&d.materialSource.trim()?`${astmSpec('channel',d.Fy,d.Fu,d.materialSource)}, F_y ${format(d.Fy,'stress',p.units,1)}, F_u ${format(d.Fu,'stress',p.units,1)}; weld electrode F_EXX ${format(d.Fexx,'stress',p.units,1)}. Source: ${d.materialSource.trim().replace(/\.$/,'')}. The lower beam/channel yield stress governs combined-section checks.`:'Not entered: channel Fy, Fu, weld electrode and material source are required. The lower beam/channel yield stress governs combined-section checks.'),
  gate('cap-duty','Crane service class for capped girder',!!d&&['A','B','C','D'].includes(d.cmaaClass)&&!!d.dutySource.trim(),d&&['A','B','C','D'].includes(d.cmaaClass)&&d.dutySource.trim()?`CMAA ${d.cmaaClass} crane; source: ${d.dutySource.trim().replace(/\.$/,'')}. DG7 §13.3 excludes cap channels for CMAA E/F service. The CMAA crane class is separate from the AIST building class.`:'DG7 §13.3: cap channels are excluded for CMAA E/F service. CMAA crane class is separate from the AIST building class. The supplier duty basis is required.',d&&['E','F'].includes(d.cmaaClass)?'unsupported':'incomplete'),
  gate('cap-fitup','Continuous cap attachment and bearing contact',!!d&&d.fullLength&&d.continuousWelds&&d.contactConfirmed&&!!d.fitupNote.trim(),'Full-length, centered cap; continuous bearing contact and dual longitudinal fillets. Gaps, intermittent welds and partial-length caps require a separate distortion/termination model.'),
  gate('cap-unperforated','Unperforated cap and top flange',!!d?.unperforated,`No holes in the channel or the beam top flange along the span; only the end stop bolt holes near the girder ends${p.details?.brace.arrangement==='cap-angle'?' and the cap tieback angle bolt holes in the column-side channel flange within one girder depth of each girder end':''}, outside the governing moment region${p.details?.brace.arrangement==='cap-angle'?'; those holes are fatigue details (Appendix A)':''}. The bottom-flange net area is checked by F13.1 and applied to both bending signs.`),
  // The continuous cap-to-flange fillets are laid in the pocket between the W flange tip and the channel flange.
  ((pocket:number):CheckResult=>({id:'cap-weld-pocket-clear',group:'Cap channel',title:'Cap weld · access pocket beside the W flange',status:pocket>=capPocketMinimum-1e-6?'pass':'fail',demand:capPocketMinimum,capacity:pocket,utilization:pocket>0?capPocketMinimum/pocket:1e12,quantity:'length',equation:'\\frac{d_c-2t_f-b_f}{2}\\ge1\\tfrac12\\,\\mathrm{in}',referenceIds:['dg7-cap'],note:`d_c channel depth, t_f its flange thickness, b_f the W flange width. Clear pocket each side between the W top flange tip and the inside face of the channel flange, ${format(pocket,'length',p.units,3)}, ${format(p.section.capDepth-p.section.capTw,'length',p.units,3)} deep: room for the electrode and the continuous cap-to-flange fillet (1 1/2 in for a manual or semi-automatic fillet; about 2 in for submerged arc welding). A narrower pocket needs a wider channel.`}))((p.section.capWidth-2*p.section.capTf-p.section.bf)/2),
  gate('cap-stiffener-cjp','Bearing stiffener top-flange connection',!!d?.topStiffenerCjp,'Full-depth fitted stiffeners with complete-joint-penetration weld to the beam top flange; bottom end fitted. Reference AIST Technical Report 13 §5.8; DG7 §13.3.'),
 ];
}
/** The capped-girder model applies: every input gate passes (the weld access pocket is a detailing check, not a gate). */
export function capReady(p:ProjectInput){return p.section.kind==='cap'&&capInputChecks(p).every(c=>c.status==='pass'||c.id==='cap-weld-pocket-clear');}

/** Dual cap welds: conservative absolute sum of longitudinal shear flow and
 * full local rail action. The two weld lines lie at the W flange edges.
 */
export function capAttachmentChecks(s:CalculationSnapshot):CheckResult[]{
 const p=s.input,d=p.capDesign,cap=cappedMechanics(p.section),r=s.detailResults?.cap;
 if(!d||!cap||!r)return [];
 const out:CheckResult[]=[],Fy=Math.min(p.section.Fy,d.Fy),Fu=Math.min(p.section.Fu,d.Fu),t=Math.min(p.section.tf,p.section.capTw),a=d.weldSize/Math.sqrt(2);
 const beta=d.developmentLength/d.weldSize<=100?1:Math.max(.6,Math.min(1,1.2-.002*d.developmentLength/d.weldSize));
 const Ac=aiscChannelByName(p.section.capCatalogueId!)!.A*25.4**2;
 const add=(id:string,title:string,demand:number,capacity:number,equation:string,note:string,quantity:CheckResult['quantity']='stiffness',group='Cap channel')=>out.push({id,group,title,demand,capacity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&demand<=capacity*(1+1e-9)?'pass':'fail',equation,note,quantity,referenceIds:['dg7-cap','aisc-f5','aisc-connections','aisc-fatigue']});
 const local=(P:number,H:number)=>{
  // TR-13 §5.8.6 spread from the rail head to the weld plane (top of the W flange): 2 × (rail depth + cap web).
  const patch=2*(p.aist!.railDepth+p.section.capTw);
  // Both local transverse shear and overturning are assigned to ONE weld.
  return (Math.abs(H)+(Math.abs(P*p.railEccentricity)+Math.abs(H*railTopAboveSteel(p)))/p.section.bf)/patch;
 };
 const tractionFlow=(s.detailResults!.demands.endLongitudinal??0)*Ac/cap.elastic.A/(2*beta*d.developmentLength);
 const demand=r.longitudinalFlow+local(s.detailResults!.demands.railVertical,s.detailResults!.demands.railLateral)+tractionFlow;
 const weldCapacity=available(.6*d.Fexx*a,p.method,.75,2);
 add('cap-weld-strength','Cap weld · combined shear flow',demand,weldCapacity,'q_w=\\frac{V_xQ_c}{2I_x}+\\frac{V_yQ_y}{I_y}+ES_w\\theta^{\\prime\\prime\\prime}+q_r+\\frac{P_uA_c}{2A\\beta a^{\\prime}}',`Force per unit length of each weld; displayed in project units. Local full wheel-group forces use the TR-13 §5.8.6 spread to the weld plane, 2 × (rail depth + cap web thickness); no sharing or stabilizing wheel compression. The warping statical moment S_w at the weld is bounded by A_c × max|W_n| / 2 (W_n the normalized warping function); q_r is the wheel-load shear flow and the last term the channel share of the factored axial force P_u. The full factored axial envelope's channel share is added over reduced effective end-development length. Distributed shear flow has no end-loaded reduction.`);
 add('cap-weld-metal','Cap weld · connected metal shear yielding',demand,available(.6*Fy*t,p.method,1,1.5),'q_w\\le0.6F_yt','Per weld; lower steel yield strength and thinner connected plate.');
 add('cap-weld-rupture','Cap weld · connected metal shear rupture',demand,available(.6*Fu*t,p.method,.75,2),'q_w\\le0.6F_ut','Per weld; unperforated gross strip used as the net shear path.');
 add('cap-weld-min','Cap weld · minimum fillet',filletMinimum([p.section.tf,p.section.capTw]),d.weldSize,'w\\ge w_{min}','AISC 360-16 Table J2.4, by the thinner part joined (the W flange or the channel web).','length');
 // The fillet is at the W flange edge against the face of the cap web, not at
 // the free edge of the channel web; only the W flange edge limits the leg.
 add('cap-weld-max','Cap weld · beam-flange edge limit',d.weldSize,p.section.tf-1.5875,'w\\le t_f-1/16\\,in','Weld along W flange edge against the channel-web face. No full-throat edge buildup.','length');
 // Cap end force development (review item C17). The cap runs the full length of every simple-span girder, so AISC
 // F13.3 (partial-length cover plates developing their share of the strength at the theoretical cutoff) does not
 // govern; the welds from the cap end to each section must deliver the channel force at that section under the
 // factored moment there: F(x) = M_u(x) Q_c / I_x elastically, the full channel yield force F_y A_c only where
 // M_u(x) needs more than first yield (phi M_y), plus the channel's share of the factored girder axial force
 // developed over L_dev. The factored moment envelope near a cap end is bounded by M_u(x) <= min(V_u x, M_u,max),
 // since the end reaction is no larger than the factored shear envelope. The welds are not end-loaded (AISC J2.2b:
 // built-up-section welds receive the shear incrementally), so beta = 1. UNVERIFIED against AISC Design Guide 7,
 // 3rd ed., §13.3 (not accessible during this revision): no full-force development rule for full-length caps was
 // found in the sources available; the former c F_y A_c rule is reported for information only.
 const da=s.designAnalysis,Vu=da?.shear??0,Mmax=da?.moment??0,Nshare=(s.detailResults!.demands.endLongitudinal??0)*Ac/cap.elastic.A;
 const Qc=cap.channelQ,Ix=cap.elastic.Ix,phiMy=available(Fy*Math.min(cap.Stop,cap.Sbottom),p.method,.9,1.67),plastic=d.Fy*Ac;
 const unit=Math.min(weldCapacity,available(.6*Fy*t,p.method,1,1.5),available(.6*Fu*t,p.method,.75,2));
 const channelForce=(x:number)=>{const M=Math.min(Vu*x,Mmax);return (M>phiMy?plastic:M*Qc/Ix)+Nshare*Math.min(1,x/Math.max(d.developmentLength,1e-9));};
 const half=Math.min(...girderSegments(p).map(m=>m.end-m.start))/2;
 const at=(x:number)=>{const F=channelForce(x),R=2*x*unit;return {x,F,R,ratio:F/R};};
 let worst=at(half/400);
 for(let i=2;i<=400;i++){const v=at(half*i/400);if(v.ratio>worst.ratio)worst=v;}
 const full=available(d.Fy*Ac,p.method,.9,1.67),fullR=2*beta*d.developmentLength*Math.min(weldCapacity,available(.6*Fy*t,p.method,1,1.5),available(.6*Fu*t,p.method,.75,2));
 const len=(v:number)=>format(v,'length',p.units,3),frc=(v:number)=>format(v,'force',p.units,3);
 add('cap-development','Cap end · cumulative weld force development',worst.F,worst.R,'F_c=\\frac{M_uQ_c}{I_x}+\\frac{P_uA_c}{A}\\min\\left(1,\\frac{x}{a^{\\prime}}\\right)\\le2xr_w',`Welds from the cap end to each section against the channel force at that section (sampled to mid-length of the shortest girder; governing x = ${len(worst.x)} from the cap end). V_u = ${frc(Vu)}, M_u ≤ min(V_u x, M_u,max), M_u,max = ${format(Mmax,'moment',p.units,3)}, φM_y = ${format(phiMy,'moment',p.units,3)}${Mmax>phiMy?' (exceeded: the channel yield force is used where M_u > φM_y)':' (not reached: elastic channel force throughout)'}; Q_c = ${format(Qc,'modulus',p.units,3)}, I_x = ${format(Ix,'inertia',p.units,3)}; channel share of the factored axial force ${frc(Nshare)} over the terminal development length a′ = ${len(d.developmentLength)}. r_w = ${format(unit,'stiffness',p.units,3)} per weld (weld metal and connected-metal shear, β = 1: AISC J2.2b, built-up-section welds are not end-loaded). The cap runs the full girder length, so the AISC F13.3 partial-length cover-plate rule does not apply; the full-force rule is listed separately (Cap end · full channel force development). DG7 3rd ed. §13.3 wording not verified (UNVERIFIED).`,'force');
 // Full channel-force development (AISC F13.3 type rule) is gated: it applies only to a partial-length cap or where
 // the moment at the cap termination is not negligible. A full-length cap ends at the girder supports (simple-span
 // ends, or the runway ends of a continuous girder), where the moment is zero, so the row is recorded as not applicable.
 const partial=!d.fullLength,terminationMoment=0;
 if(partial||terminationMoment>0)add('cap-development-full-force','Cap end · full channel force development (partial-length cap)',full,fullR,'cF_yA_c\\le2\\beta a^{\\prime}r_w',`Partial-length cap: the welds within a′ of the termination develop the full available channel yield force; β = ${beta.toFixed(3)} (end-loaded).`,'force');
 else out.push({id:'cap-development-full-force',group:'Cap channel',title:'Cap end · full channel force development',status:'not-applicable',equation:'cF_yA_c\\le2\\beta a^{\\prime}r_w',referenceIds:['dg7-cap','aisc-f5','aisc-connections'],note:`Not applicable: the cap runs the full length of each girder and terminates at the supports, where the moment is zero; the full-force rule applies only to partial-length caps or a non-negligible moment at the termination. Values: c·F_y·A_c = ${frc(full)}; 2βa′r_w = ${frc(fullR)}. The cumulative weld force development check is the design check.`});
 add('cap-development-length','Cap end · available development length',2*d.developmentLength,Math.min(...girderSegments(p).map(m=>m.end-m.start)),'2a^{\\prime}\\le L','Both terminal development regions fit within the shortest physical girder segment, after joint-gap deductions.','length');
 add('cap-rail-footprint','Rail footprint on supported cap web',p.details!.rail.baseWidth+2*Math.abs(p.railEccentricity),p.section.bf,'b_r+2e\\le b_f','Rail base must remain over the W top flange; outstand wheel bearing is outside the supported template.','length');
 // The local wheel stress on the cap welds cycles once per wheel group passing (wheelLocalCycles), with the girder's shear flow.
 const {passes,groups,cycles:n}=wheelLocalCycles(p,clipWindow(p)),F=categoryF(n);
 const tractionRange=2*Math.max(...p.cranes.map(c=>c.longitudinal))*Ac/cap.elastic.A/(2*beta*d.developmentLength*a);
 const fatigueRange=tractionRange+2*Math.max(...r.fatigueFlows.map((q,i)=>q+local(s.detailResults!.railFatigueBins[i].vertical,s.detailResults!.railFatigueBins[i].lateral)))/a;
 add('cap-weld-fatigue','Cap weld throat · Category F fatigue',fatigueRange,F,'f_{sr}=\\frac{2\\Delta q}{0.707w}\\le F_{SR}=690(1.5/n_{SR})^{0.167}\\ge55\\,\\mathrm{MPa}',`Full reversal of every absolute stress component, largest bin assigned to all cycles; full traction reversal transferred into the channel share over each reduced effective end-development length a′ is added. Δq is the range of the shear flow per weld. Unfactored Cds + lift fraction × Cvs + 0.5Css, without impact. Fatigue limit equation uses MPa; displayed stresses follow project units. AISC Table A-3.1 item 8.2; DG7 §13.3. Cycles n_SR = ${passes.toLocaleString('en-US')} crane passages × ${groups} wheel group${groups>1?'s':''} per rail = ${n.toLocaleString('en-US')}: the local wheel stress on the welds cycles once per wheel group passing (AISC DG7 and AIST TR-13 cycle counting), and the whole range is assigned to every one.`,'stress','Fatigue');
 return out;
}
