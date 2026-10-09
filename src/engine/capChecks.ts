import {girderSegments} from './simpleSupports';
import type {CalculationSnapshot,CheckResult,ProjectInput} from './types';
import {cappedMechanics} from './cappedMechanics';
import {aiscChannelByName} from '../data/aiscChannels';
import {available} from './aiscStrength';
import {minimumFillet} from './connectionStrength';

export function capInputChecks(p:ProjectInput):CheckResult[]{
 if(p.section.kind!=='cap')return [];
 const d=p.capDesign,m=cappedMechanics(p.section);
 const gate=(id:string,title:string,ok:boolean,note:string,status:CheckResult['status']='incomplete'):CheckResult=>({id,group:'Cap channel',title,status:ok?'pass':status,equation:'',referenceIds:['dg7-cap','cap-sectorial'],note});
 return [
  gate('cap-catalogue','Capped section model',!!cappedMechanics(p.section),'Centered catalogue W + inverted C/MC; full-length cap with two continuous longitudinal welds. Thin-wall sectorial integration; catalogue component bending properties.','unsupported'),
  gate('cap-compression-components','Cap lies wholly within top compression flange',!!m&&p.section.d+p.section.capTw-p.section.capDepth>m.elastic.cy&&p.section.d-p.section.tf>m.elastic.cy,'The complete channel and W top flange must lie above the elastic neutral axis for the F4/F5 compression-flange idealization. Deep caps on shallow W members require a separate section model.','unsupported'),
  gate('cap-material','Channel steel and weld material',!!d&&d.Fu>=d.Fy&&!!d.materialSource.trim(),'Enter channel Fy, Fu, weld electrode and material source. The lower beam/channel yield stress governs combined-section checks.'),
  gate('cap-duty','Crane service class for capped girder',!!d&&['A','B','C','D'].includes(d.cmaaClass)&&!!d.dutySource.trim(),'DG7 §13.3: cap channels are excluded for CMAA E/F service. CMAA crane class is separate from the AIST building class. Enter the supplier duty basis.',d&&['E','F'].includes(d.cmaaClass)?'unsupported':'incomplete'),
  gate('cap-fitup','Continuous cap attachment and bearing contact',!!d&&d.fullLength&&d.continuousWelds&&d.contactConfirmed&&!!d.fitupNote.trim(),'Full-length, centered cap; continuous bearing contact and dual longitudinal fillets. Gaps, intermittent welds and partial-length caps require a separate distortion/termination model.'),
  gate('cap-unperforated','Unperforated cap and top flange',!!d?.unperforated,'No holes in channel or beam top flange. The entered bottom-flange net area is checked by F13.1; it is conservatively applied to both bending signs.'),
  gate('cap-stiffener-cjp','Bearing stiffener top-flange connection',!!d?.topStiffenerCjp,'Full-depth fitted stiffeners with complete-joint-penetration weld to the beam top flange; bottom end fitted. Reference AIST Technical Report 13 §5.8; DG7 §13.3.'),
 ];
}
export function capReady(p:ProjectInput){return p.section.kind==='cap'&&capInputChecks(p).every(c=>c.status==='pass');}

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
  const patch=2*p.aist!.railDepth;
  // Both local transverse shear and overturning are assigned to ONE weld.
  return (Math.abs(H)+(Math.abs(P*p.railEccentricity)+Math.abs(H*p.railHeight))/p.section.bf)/patch;
 };
 const tractionFlow=(s.detailResults!.demands.endLongitudinal??0)*Ac/cap.elastic.A/(2*beta*d.developmentLength);
 const demand=r.longitudinalFlow+local(s.detailResults!.demands.railVertical,s.detailResults!.demands.railLateral)+tractionFlow;
 const weldCapacity=available(.6*d.Fexx*a,p.method,.75,2);
 add('cap-weld-strength','Cap weld · combined shear flow',demand,weldCapacity,'\\begin{aligned}q_w&=|VQ_c|/(2I_x)+E|v^{\\prime\\prime\\prime}|Q_{x,c/2}+E|\\theta^{\\prime\\prime\\prime}|\\,|S_{\\omega,c/2}|+q_{rail}+q_N\\\\q_N&=|N_u|A_c/(2A\\beta L_{dev})\\end{aligned}',`Force per unit length of each weld; displayed in project units. Local full wheel-group forces use a 2 × rail-depth patch; no sharing or stabilizing wheel compression. Warping first moment is bounded by Ac × max|omega| / 2. The full factored axial envelope's channel share is added over reduced effective end-development length. Distributed shear flow has no end-loaded reduction.`);
 add('cap-weld-metal','Cap weld · connected metal shear yielding',demand,available(.6*Fy*t,p.method,1,1.5),'q_w\\le0.6F_y t_{min}','Per weld; lower steel yield strength and thinner connected plate.');
 add('cap-weld-rupture','Cap weld · connected metal shear rupture',demand,available(.6*Fu*t,p.method,.75,2),'q_w\\le0.6F_u t_{min}','Per weld; unperforated gross strip used as the net shear path.');
 add('cap-weld-min','Cap weld · minimum fillet',minimumFillet(Math.max(p.section.tf,p.section.capTw)),d.weldSize,'w\\ge w_{min,J2.4}','Minimum based on thicker joined part.','length');
 // The fillet is at the W flange edge against the face of the cap web, not at
 // the free edge of the channel web; only the W flange edge limits the leg.
 add('cap-weld-max','Cap weld · beam-flange edge limit',d.weldSize,p.section.tf-1.5875,'w\\le t_{W,f}-1/16\\,in','Weld along W flange edge against the channel-web face. No full-throat edge buildup.','length');
 const force=available(d.Fy*Ac,p.method,.9,1.67);
 const development=Math.min(2*beta*d.developmentLength*weldCapacity,2*d.developmentLength*available(.6*Fy*t,p.method,1,1.5),2*d.developmentLength*available(.6*Fu*t,p.method,.75,2));
 add('cap-development','Cap end · full channel force development',force,development,'F_{cap,req}=c_bF_{y,c}A_c;\\quad R=2\\beta L_{dev}R_{w,unit}',`Develops the full available channel yield force: cb=0.9 for LRFD or 1/1.67 for ASD; unit weld resistance uses the selected method. End-loaded weld reduction beta=${beta.toFixed(3)}; weld metal and connected-metal shear control. No minimum practical length is silently assumed.`,'force');
 add('cap-development-length','Cap end · available development length',2*d.developmentLength,Math.min(...girderSegments(p).map(m=>m.end-m.start)),'2L_{dev}\\le L_{min}','Both terminal development regions fit within the shortest physical girder segment, after joint-gap deductions.','length');
 add('cap-rail-footprint','Rail footprint on supported cap web',p.details!.rail.baseWidth+2*Math.abs(p.railEccentricity),p.section.bf,'b_{rail}+2|e|\\le b_{W,f}','Rail base must remain over the W top flange; outstand wheel bearing is outside the supported template.','length');
 const n=p.fatigue.cycles,F=Math.max(55,690*(1.5/n)**.167);
 const tractionRange=2*Math.max(...p.cranes.map(c=>c.longitudinal))*Ac/cap.elastic.A/(2*beta*d.developmentLength*a);
 const fatigueRange=tractionRange+2*Math.max(...r.fatigueFlows.map((q,i)=>q+local(s.detailResults!.railFatigueBins[i].vertical,s.detailResults!.railFatigueBins[i].lateral)))/a;
 add('cap-weld-fatigue','Cap weld throat · Category F fatigue',fatigueRange,F,'\\begin{aligned}\\Delta f_w&=\\frac{2\\max_i(q_{global,i}+q_{rail,i})}{a}+\\frac{2N_{s,max}A_c}{2A\\beta L_{dev}a}\\\\&\\le\\max[55,690(1.5/n)^{0.167}],\\quad a=w/\\sqrt2\\end{aligned}','Full reversal of every absolute stress component, largest bin assigned to all cycles; full traction reversal transferred into the channel share over each reduced effective end-development length is added. Unfactored Cds + lift fraction × Cvs + 0.5Css, without impact. Fatigue limit equation uses MPa; displayed stresses follow project units. AISC Table A-3.1 item 8.2; DG7 §13.3.','stress','Fatigue');
 return out;
}
