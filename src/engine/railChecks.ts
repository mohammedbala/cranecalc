import {categoryF} from './fatigueConstants';
import type { CalculationSnapshot,CheckResult } from './types';
import { available } from './aiscStrength';
import { boltCapacity,plateBearing,blockShear,minimumFillet,transverseFilletFatigue,filletEffectiveSize } from './connectionStrength';
import { fatigueSpectrumBin } from './detailAnalysis';
import { latexNumber,withinLimit } from './math';
import { railKeeperResponse,railAnchorForce,railAnchorResponse } from './railKeeper';
import { railSeat,keeperSeatThickness,anchorEndClearance } from './railSeat';
import { railMovements,railJointMovement,railJointType,railJointGap,tightJointGap } from './railLayout';
import { activeEndStop,stopEnds } from './endStopInputs';
import { format } from './units';
export function railChecks(s:CalculationSnapshot):CheckResult[]{
 const p=s.input,d=p.details!,r=d.rail,m=d.material,a=s.detailResults!,depth=p.aist!.railDepth,spacing=p.aist!.clipSpacing;
 const receivingThickness=keeperSeatThickness(p),receivingFy=p.section.kind==='cap'?p.capDesign!.Fy:p.section.Fy;
 const out:CheckResult[]=[],method=p.method,seat=railSeat(p),k=seat.keeper,len=(v:number)=>format(v,'length',p.units,3);
 const check=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,group='Rail details')=>out.push({id,group,title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`${latexNumber(demand)}/${latexNumber(capacity)}=${(demand/capacity).toFixed(4)}`,note,referenceIds:['aisc-connections','tr13-detail']});
 const webDepth=depth-r.headThickness-r.baseThickness;
 const Iy=(r.headThickness*r.headWidth**3+r.baseThickness*r.baseWidth**3+webDepth*r.webThickness**3)/12;
 const Sy=Iy/(Math.max(r.headWidth,r.baseWidth)/2),H=a.demands.railLateral,P=a.demands.railVertical;
 check('rail-flexure','Rail lateral flexure between keepers',H*spacing/4,available(r.Fy*Sy,method,.9,1.67),'moment','M_r=Hs/4;\\quad M_n=F_yS_y\\ \\ \\text{(rail)}','Conservative simple-span rail between keeper pairs. Idealized head/web/base plate properties without fillet credit; no composite action with the girder. Multiple-wheel loads within one clip interval are grouped.');
 // The pad check applies only where the project specifies a pad; its width bears, not the rail base beyond it.
 if(seat.pad){
  const lb=2*(depth+receivingThickness),width=Math.min(seat.pad.width,r.baseWidth),pressure=P/(lb*width);
  check('rail-pad','Rail-pad compression',pressure,r.padAllowable,'stress','f_p=P/[2(h_r+t_f)b]',`Uses the factored wheel/patch force against the entered allowable pad rating conservatively. Rating basis: ${r.padSource}. Pad ${len(seat.pad.thickness)} thick under the rail base; its thickness is in the top-of-rail elevation and every rail-head load height.`);
 }
 check('rail-web','Rail-web compression below wheel',P,available(r.Fy*r.webThickness*(2*r.headThickness),method,.9,1.67),'force','R_n=F_yt_w(2t_h)\\ \\ \\text{(rail web, head }t_h)','Conservative zero-contact-length load spread through the rail head. Wheel/rail contact hardness and rolling-contact wear remain crane-supplier selection items.');
 // Keepers: lip over the rail base, body fillet welded on its outer face and both ends after the rail is set.
 const keeper=railKeeperResponse(p,P,H),hold=keeper.roles[1];
 // AISC 360-16 J2.2b: each fillet of the group at its effective size, which is reduced on a fillet shorter than 4w.
 const effective=(g:{weld:number;length:number;endWeld:number})=>{
  const short=([['The outer-face fillet is',g.length],['The end fillets are',g.endWeld]] as const).filter(([,l])=>l<4*g.weld-1e-6);
  return short.length?short.map(([name,l])=>`${name} shorter than 4w and taken at the J2.2b effective size L/4 = ${len(filletEffectiveSize(g.weld,l))}.`).join(' '):`Every fillet is at least 4w = ${len(4*g.weld)} long, so its full size is effective (J2.2b).`;
 };
 const roleNote='Each keeper is checked as the bearing keeper (H at the top of the rail base with the uplift P|e|/b) and as the hold-down keeper (uplift (Hd+P|e|)/b, no side force); a whole wheel group acts on one keeper, with no stabilizing wheel compression or load sharing.';
 check('rail-keeper-flexure','Rail keeper lip flexure',keeper.lipStress,available(m.Fy,method,.9,1.67),'stress','T=(Hh_r+Pe)/b_r;\\quad f_b=\\frac{6T(c+o/2)}{L_kt^2}',`Lip cantilevers from the keeper body; the uplift bears at mid-overlap of the lip on the rail base. ${roleNote}`);
 check('rail-keeper-shear','Rail keeper combined shear',Math.hypot(H,hold.uplift),available(.6*m.Fy*k.length*Math.min(k.lip,k.bodyWidth),method,1,1.5),'force','V=\\sqrt{H^2+T^2};\\quad V_n=0.6F_yL_kt','Full transverse keeper force plus the largest uplift on the smaller of the lip and body sections. Opposing keepers are required at every station, including both sides of each rail joint.');
 check('rail-keeper-weld','Rail keeper fillet welds · outer face and ends',keeper.weldStress,available(.6*m.Fexx,method,.75,2),'stress','f_w=\\sqrt{f_v^2+(N/A_{we}+Mx/I)^2};\\quad\\text{throat }0.707\\min(w,L/4)',`Elastic weld group: outer-face fillet ${len(k.length)} and two end fillets ${len(k.endWeld)}, held one weld size back from the rail-side face, which is not welded. ${effective(k)} Overturning taken about the weld centroid; no bearing or directional-strength credit. ${roleNote}`);
 check('rail-flange-local',p.section.kind==='cap'?'Channel web below keeper':'Girder flange below keeper',keeper.flangeStress,available(receivingFy,method,.9,1.67),'stress','f_b=6M/(L_kt^2)','Conservative local cantilever strip at the keeper attachment under the keeper overturning moment about its weld centroid; no load spread beyond the keeper length. For a capped girder only the channel web thickness is credited. Supplementary global flange/warping fatigue is evaluated at each keeper station.');
 check('rail-keeper-weld-size','Keeper weld edge limit',r.clipWeld,Math.min(receivingThickness,k.lip)-1.5875,'length','w\\le t-1/16\\,in','Fillet edge restriction; no full-throat edge buildup credited.','Detailing');
 // The rail can move the keeper clearance each way from where it was set, and was set within the setting tolerance.
 check('rail-keeper-float','Rail float in keepers plus setting tolerance',k.clearance+d.criteria.alignmentTolerance,Math.abs(p.railEccentricity),'length','c_k+t_{set}\\le|e|','Keepers are set clear of the rail-base toes by the keeper clearance with the rail on its line, so the rail can float that far either way; with the rail setting tolerance this is the largest rail-to-web eccentricity in service, which must not exceed the design rail eccentricity used for girder torsion and local checks.','Detailing');
 // AIST TR-13 §5.16.1 tight joints (default): standard holes, bolts pretensioned and re-tightened after 30 and 90 days of
 // operation, gap 1/16 in or less. Open joints: bars slotted along the rail for the joint movement.
 const tight=railJointType(p)==='tight',gap=railJointGap(p);
 const joint=boltCapacity({grade:'A325',diameter:r.jointBoltDiameter,planes:2,surface:'B',shear:P/2,tension:0,method}),dh=joint.hole+(tight?0:1.5875);
 const jointRefs=['aisc-connections','tr13-rail-joints'];
 // Two bolts on each side of the joint, on the rail neutral-axis line. The
 // rail is continuously supported vertically; each cut rail end has its own
 // keeper pair for transverse restraint. Joint bars bridge the small end gap.
 check('rail-joint-bolts','Rail joint bolts · vertical shear',P/2,joint.shear,'force','V=P/2',tight?'Two A325 bolts on each side of the tight rail joint, double shear, standard holes, pretensioned and re-tightened after 30 and 90 days of operation (AIST TR-13 §5.16.1). Full wheel load assigned to one side conservatively.':'Two A325 bolts on each side of the open rail joint, double shear. Longitudinal slots allow expansion; slot width is the standard hole diameter. Full wheel load assigned to one side conservatively.');
 out.at(-1)!.referenceIds=jointRefs;
 const t=Math.min(r.webThickness,2*r.jointPlateThickness),jointBearing=plateBearing(r.jointBoltDiameter,joint.hole,t,Math.min(m.Fu,r.Fu),r.jointPlateHeight/2,r.jointPitch,method);
 check('rail-joint-bearing','Rail joint bolt-hole bearing',P/2,tight?jointBearing.capacity:jointBearing.capacity/1.2,'force','R_n=\\min(l_ctF_u,2d_btF_u)',tight?'Standard holes in the bars and the rail web (tight joint), J3.10(a). Both rail web and paired joint bars use the smaller effective thickness.':'Longitudinal slots are perpendicular to the transferred vertical force: reduced J3.10(c) bearing/tearout coefficients. Both rail web and paired joint bars use the smaller effective thickness.');
 const An=(r.jointPlateHeight-dh-(tight?1.5875:0))*2*r.jointPlateThickness;
 check('rail-joint-net','Rail joint bars · shear rupture',P,available(.6*m.Fu*An,method,.75,2),'force','R_n=0.6F_uA_{nv}',tight?'Two symmetric joint bars, standard hole plus 1/16 in deducted from the vertical net section (B4.3b).':'Two symmetric joint bars, standard slot width deducted from the vertical net section.');
 const jointMoment=P*(gap/2+r.jointEdge),S=2*r.jointPlateThickness*r.jointPlateHeight**2/6;
 check('rail-joint-plate','Rail joint bars · bending',jointMoment,available(m.Fy*S,method,.9,1.67),'moment','M_r=P(g/2+e_j);\\quad M_n=F_yS',`Conservative full wheel force bridges from the joint gap (${len(gap)}${tight?', tight joint':''}) to the first bolt line. Joint bars are backed by the rail web; lateral buckling is restrained.`);
 const shearLength=r.jointEdge+r.jointPitch;
 const slotDeduction=tight?dh+1.5875:1.5*r.jointBoltDiameter+1.5875;
 check('rail-joint-block','Rail joint bars · block shear',P,blockShear(2*shearLength*t,2*(shearLength-1.5*slotDeduction)*t,(r.jointPlateHeight-dh)*t,m.Fy,m.Fu,method),'force','R_n=\\min(0.6F_uA_{nv},0.6F_yA_{gv})+0.5F_uA_{nt}',tight?'Conservative enclosing block path; standard holes with the net-section deduction along shear paths.':'Conservative enclosing block path; full longitudinal slot length plus the additional net-section deduction is used along shear paths.');
 // Each rail piece is anchored at mid-length, so a joint closes by the growth of both pieces from their anchors.
 const moves=railMovements(p),movement=railJointMovement(moves);
 const alpha=p.units==='US'?'6.6667×10^-6 /°F':'12×10^-6 /°C';
 if(tight){
  out.push({id:'rail-joint-tight',group:'Detailing',title:'Rail joints · tight joints (gap 1/16 in or less)',status:'pass',equation:'g\\le1/16\\,\\mathrm{in}',referenceIds:jointRefs,note:`AIST TR-13 §5.16.1: tight joints, rail ends butted with a gap of 1/16 in or less, joints staggered across the runway (Coordination: rail joints) and the joint bolts re-tightened after 30 and 90 days of operation. The joints do not open or close: each rail string slides in its keepers from one anchor near mid-runway, and the clearance gap at the end stops takes the thermal movement (rail end clear of the end stop). Steel alpha=${alpha}.${r.jointGap>tightJointGap+1e-6?` The entered expansion gap ${len(r.jointGap)} applies only to open joints and is not used.`:''}`});
  out.push({id:'rail-expansion-gap',group:'Detailing',title:'Rail-joint thermal movement',status:'not-applicable',equation:'',note:'Tight rail joints (AIST TR-13 §5.16.1): no expansion gap at the joints; the thermal movement of each rail string is taken at the end stops.',referenceIds:jointRefs});
  out.push({id:'rail-joint-slot',group:'Detailing',title:'Rail-joint slot travel',status:'not-applicable',equation:'',note:'Tight rail joints use standard holes; the joint does not slide.',referenceIds:jointRefs});
 }else{
 check('rail-expansion-gap','Rail-joint thermal movement',movement+d.criteria.alignmentTolerance,r.jointGap,'length','\\Delta L=\\alpha\\Delta T(L_1+L_2);\\quad g\\ge\\Delta L+t_{set}',`Steel alpha=${alpha}. Each rail piece is anchored at mid-length and grows from its anchor; at each joint the two pieces close by their growth over the distances from their anchors, the largest of all joints governing. Gap set at the stated installation temperature range; alignment allowance reserved.`,'Detailing');
 check('rail-joint-slot','Rail-joint slot travel',movement,1.5*r.jointBoltDiameter-joint.hole,'length','l_{slot}-d_h\\ge\\Delta L','Slots length 1.5 bolt diameters; rail-joint bolts do not establish the girder longitudinal restraint. The whole joint closure is taken in one slot conservatively; slot-end bearing under thermal movement is avoided.','Detailing');
 }
 const stop=activeEndStop(p),stopped=moves.ends.filter(v=>!v.existing&&stopEnds(p).includes(v.end));
 if(stop&&stopped.length)check('rail-end-gap','Rail end clear of the end stop',Math.max(...stopped.map(v=>v.movement))+d.criteria.alignmentTolerance,stop.railGap,'length','\\alpha\\Delta TL+t_{set}\\le g',tight?'Tight joints: the rail string slides in its keepers and grows from its single anchor near mid-runway toward each stop; this clearance gap at the stop takes that thermal movement (AIST TR-13 §5.16.1), so the rail end stays clear of the stop face and the bumper force reaches the stop, not the rail.':'The anchored end piece grows toward the stop by its length beyond its anchor; the rail end must stay clear of the stop face so the bumper force reaches the stop, not the rail.','Detailing');
 check('rail-joint-fit','Joint bar fit between head and base',r.jointPlateHeight,webDepth,'length','h_j\\le h_r-t_h-t_b','Both joint bars fit within the clear rail web depth.','Detailing');
 // Rail anchor: crane traction and braking, and rail creep, into the girder at one keeper pair per rail piece.
 const anchorForce=railAnchorForce(p),anchor=railAnchorResponse(p,P,H,anchorForce.force),ag=anchor.geometry;
 check('rail-anchor-weld','Rail anchor keeper fillet welds',anchor.weldStress,available(.6*m.Fexx,method,.75,2),'stress','f_w=\\sqrt{f_x^2+f_y^2+f_z^2};\\quad\\text{throat }0.707\\min(w,L/4)',`Factored crane longitudinal force F=${latexNumber(anchorForce.factor)}C_ls on one anchor keeper of each rail piece, concurrent with its keeper forces in either role. F bears where the keeper end meets the flat notch end, over ${len(ag.bearing)} beyond the corner hole, at mid-height of the rail base; end fillets ${len(ag.endWeld)} stop ${len(anchorEndClearance)} outside the un-notched rail-base toe. ${effective(ag)} The other keepers let the rail slide.`);
 check('rail-anchor-bearing','Rail anchor · rail-base notch bearing',anchorForce.force,available(1.8*Math.min(m.Fy,r.Fy)*anchor.bearingArea,method,.75,2),'force','R_n=1.8F_yA_{pb};\\quad A_{pb}=(d_n-r_n)t_b',`Rail-base notch ${len(ag.notch)} deep and ${len(ag.notchLength)} long, ${len(anchorEndClearance)} clear of each keeper end, with drilled holes of ${len(ag.cornerRadius)} radius centered on its re-entrant corners. The keeper end bears on the flat notch end between the toe and the corner hole, ${len(ag.bearing)} deep, over the rail-base thickness.`);
 const cycles=d.spectrum.reduce((n,b)=>n+b.cycles,0),F=categoryF(cycles);
 // The rail pushes the keeper outward and lifts its lip but never pulls it inward or presses the lip down:
 // each passage loads a keeper weld from zero to its bin value.
 const keeperWeldRange=Math.max(...a.railFatigueBins.map(b=>b.weldStress));
 check('rail-keeper-fatigue','Rail keeper weld throat fatigue',keeperWeldRange,F,'stress','f_{sr}=\\max_i f_w\\left(C_d+\\frac{Q_i}{Q}C_{vs}+0.5C_{ss}\\right)\\le F_{SR}=690(1.5/n_{SR})^{0.167}\\ge55\\,\\mathrm{MPa}','Reference: AIST Technical Report 13 §3.10.2.3. Unfactored fatigue-bin wheel groups, no impact. The keeper weld force is one-signed in both keeper roles (the rail cannot pull a keeper inward or press its lip down), so each cycle ranges from zero to the largest bin value; it is assigned to every cycle, with no endurance or load-sharing credit. Category F, AISC Appendix 3.','Fatigue');
 check('rail-keeper-weld-minimum','Keeper minimum fillet',minimumFillet(Math.min(k.bodyWidth,receivingThickness)),r.clipWeld,'length','w\\ge w_{min}','AISC Table J2.4 by the thinner part joined (the girder surface or the keeper body), low-hydrogen electrodes.','Detailing');
 const cyclicP=a.demands.railFatigueVertical;
 const keeperRange=Math.max(...a.railFatigueBins.map(b=>b.plateStress));
 check('rail-keeper-root','Keeper body · end-weld root fatigue',keeperRange,transverseFilletFatigue(k.length,r.clipWeld,cycles).capacity,'stress','f_{sr}=2\\Delta q/L_k','Unfactored cyclic normal force at the inner ends of the two end fillets, carried by the keeper body as a stem of thickness equal to the keeper length; one-signed range from zero. AISC A-3-5M/A-3-6M, Category C-double-prime.','Fatigue');
 check('rail-joint-fatigue','Rail joint bars · fatigue',cyclicP*(gap/2+r.jointEdge)/(2*r.jointPlateThickness*(r.jointPlateHeight-dh)**2/6),fatigueSpectrumBin('D',1,cycles).allowable,'stress','f_{sr}=\\Delta M/S_n','Category D at net section of a bearing-type mechanical joint, no impact. The two rail ends bear on the same girder, so by compatibility the bars carry about P/2 from the loaded end while the wheel is on one side of the gap and −P/2 once it crosses: the range is the full wheel load P over the arm g/2 + e_j at every passage. Net depth used conservatively for bending.','Fatigue');
 check('rail-joint-shear-fatigue','Rail joint bolts · cyclic shear',cyclicP/(4*joint.area),F,'stress','f_{sr}=\\Delta P/(4A_b)',tight?'Supplementary conservative Category F shear-range bound for double-shear bolts; no slip credit is taken for the pretensioned tight joint.':'Supplementary conservative Category F shear-range bound for double-shear bolts; no pretension/slip credit for longitudinally sliding rail joints.','Fatigue');
 return out;
}
