import type { CalculationSnapshot,CheckResult } from './types';
import { available } from './aiscStrength';
import { boltCapacity,plateBearing,blockShear,minimumFillet,transverseFilletFatigue } from './connectionStrength';
import { fatigueSpectrumBin } from './detailAnalysis';
import { latexNumber,withinLimit } from './math';
import { railKeeperResponse,railAnchorForce,railAnchorResponse } from './railKeeper';
import { railSeat,keeperSeatThickness,anchorEndClearance } from './railSeat';
import { railMovements } from './railLayout';
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
 check('rail-flexure','Rail lateral flexure between keepers',H*spacing/4,available(r.Fy*Sy,method,.9,1.67),'moment','M_r=H s/4;\\quad M_n=F_y S_{rail,y}','Conservative simple-span rail between keeper pairs. Idealized head/web/base plate properties without fillet credit; no composite action with the girder. Multiple-wheel loads within one clip interval are grouped.');
 // The pad check applies only where the project specifies a pad; its width bears, not the rail base beyond it.
 if(seat.pad){
  const lb=2*(depth+receivingThickness),width=Math.min(seat.pad.width,r.baseWidth),pressure=P/(lb*width);
  check('rail-pad','Rail-pad compression',pressure,r.padAllowable,'stress','q_{pad}=P/[2(h_r+t_f)\\min(b_{pad},b_{base})]',`Uses the factored wheel/patch force against the entered allowable pad rating conservatively. Rating basis: ${r.padSource}. Pad ${len(seat.pad.thickness)} thick under the rail base; its thickness is in the top-of-rail elevation and every rail-head load height.`);
 }
 check('rail-web','Rail-web compression below wheel',P,available(r.Fy*r.webThickness*(2*r.headThickness),method,.9,1.67),'force','R_n=F_y t_{r,w}(2t_{head})','Conservative zero-contact-length load spread through the rail head. Wheel/rail contact hardness and rolling-contact wear remain crane-supplier selection items.');
 // Keepers: lip over the rail base, body fillet welded on its outer face and both ends after the rail is set.
 const keeper=railKeeperResponse(p,P,H),hold=keeper.roles[1];
 const roleNote='Each keeper is checked as the bearing keeper (H at the top of the rail base with the uplift P|e|/b) and as the hold-down keeper (uplift (Hd+P|e|)/b, no side force); a whole wheel group acts on one keeper, with no stabilizing wheel compression or load sharing.';
 check('rail-keeper-flexure','Rail keeper lip flexure',keeper.lipStress,available(m.Fy,method,.9,1.67),'stress','U=(Hh_r+P|e|)/b_r;\\quad f=6U(c+o/2)/(L_k t_{lip}^2)',`Lip cantilevers from the keeper body; the uplift bears at mid-overlap of the lip on the rail base. ${roleNote}`);
 check('rail-keeper-shear','Rail keeper combined shear',Math.hypot(H,hold.uplift),available(.6*m.Fy*k.length*Math.min(k.lip,k.bodyWidth),method,1,1.5),'force','V_r=\\sqrt{H^2+U^2};\\quad V_n=0.6F_yL_k\\min(t_{lip},b_k)','Full transverse keeper force plus the largest uplift on the smaller of the lip and body sections. Opposing keepers are required at every station, including both sides of each rail joint.');
 check('rail-keeper-weld','Rail keeper fillet welds · outer face and ends',keeper.weldStress,available(.6*m.Fexx,method,.75,2),'stress','f_w=\\max\\sqrt{\\tau_x^2+(N/A_w+M\\,x/I_y)^2}/(0.707w)',`Elastic weld group: outer-face fillet ${len(k.length)} and two end fillets ${len(k.endWeld)}, held one weld size back from the rail-side face, which is not welded. Overturning taken about the weld centroid; no bearing or directional-strength credit. ${roleNote}`);
 check('rail-flange-local',p.section.kind==='cap'?'Channel web below keeper':'Girder flange below keeper',keeper.flangeStress,available(receivingFy,method,.9,1.67),'stress','f_{flange}=6M_{weld}/(L_k t_f^2)','Conservative local cantilever strip at the keeper attachment under the keeper overturning moment about its weld centroid; no load spread beyond the keeper length. For a capped girder only the channel web thickness is credited. Supplementary global flange/warping fatigue is evaluated at each keeper station.');
 check('rail-keeper-weld-size','Keeper weld edge limit',r.clipWeld,Math.min(receivingThickness,k.lip)-1.5875,'length','w\\le t_{min}-1/16\\,in','Fillet edge restriction; no full-throat edge buildup credited.','Detailing');
 // The rail can move the keeper clearance each way from where it was set, and was set within the setting tolerance.
 check('rail-keeper-float','Rail float in keepers plus setting tolerance',k.clearance+d.criteria.alignmentTolerance,Math.abs(p.railEccentricity),'length','c_k+t_{set}\\le|e|','Keepers are set clear of the rail-base toes by the keeper clearance with the rail on its line, so the rail can float that far either way; with the rail setting tolerance this is the largest rail-to-web eccentricity in service, which must not exceed the design rail eccentricity used for girder torsion and local checks.','Detailing');
 const joint=boltCapacity({grade:'A325',diameter:r.jointBoltDiameter,planes:2,surface:'B',shear:P/2,tension:0,method}),dh=joint.hole+1.5875;
 // Two bolts on each side of the joint, on the rail neutral-axis line. The
 // rail is continuously supported vertically; each cut rail end has its own
 // keeper pair for transverse restraint. Joint bars bridge the small end gap.
 check('rail-joint-bolts','Rail joint bolts · vertical shear',P/2,joint.shear,'force','V_{bolt}=P/2','Two A325 bolts on each side of the rail joint, double shear. Longitudinal slots allow expansion; slot width is the standard hole diameter. Full wheel load assigned to one side conservatively.');
 const t=Math.min(r.webThickness,2*r.jointPlateThickness),jointBearing=plateBearing(r.jointBoltDiameter,joint.hole,t,Math.min(m.Fu,r.Fu),r.jointPlateHeight/2,r.jointPitch,method);
 check('rail-joint-bearing','Rail joint bolt-hole bearing',P/2,jointBearing.capacity/1.2,'force','R_n=\\min(l_ctF_u,2d_btF_u)','Longitudinal slots are perpendicular to the transferred vertical force: reduced J3.10(c) bearing/tearout coefficients. Both rail web and paired joint bars use the smaller effective thickness.');
 const An=(r.jointPlateHeight-dh)*2*r.jointPlateThickness;
 check('rail-joint-net','Rail joint bars · shear rupture',P,available(.6*m.Fu*An,method,.75,2),'force','R_n=0.6F_u A_{nv}','Two symmetric joint bars, standard slot width deducted from the vertical net section.');
 const jointMoment=P*(r.jointGap/2+r.jointEdge),S=2*r.jointPlateThickness*r.jointPlateHeight**2/6;
 check('rail-joint-plate','Rail joint bars · bending',jointMoment,available(m.Fy*S,method,.9,1.67),'moment','M_r=P(g/2+e_j);\\quad M_n=F_y S_j','Conservative full wheel force bridges from the joint gap to the first bolt line. Joint bars are backed by the rail web; lateral buckling is restrained.');
 const shearLength=r.jointEdge+r.jointPitch;
 const slotDeduction=1.5*r.jointBoltDiameter+1.5875;
 check('rail-joint-block','Rail joint bars · block shear',P,blockShear(2*shearLength*t,2*(shearLength-1.5*slotDeduction)*t,(r.jointPlateHeight-dh)*t,m.Fy,m.Fu,method),'force','R_n=\\min(0.6F_uA_{nv},0.6F_yA_{gv})+0.5F_uA_{nt}','Conservative enclosing block path; full longitudinal slot length plus the additional net-section deduction is used along shear paths.');
 // Each rail piece is anchored at mid-length, so a joint closes by the growth of both pieces from their anchors.
 const moves=railMovements(p),jointMoves=[...moves.joints,...moves.ends.filter(v=>v.existing)].map(v=>v.movement),movement=Math.max(0,...jointMoves);
 const alpha=p.units==='US'?'6.6667×10^-6 /°F':'12×10^-6 /°C';
 check('rail-expansion-gap','Rail-joint thermal movement',movement+d.criteria.alignmentTolerance,r.jointGap,'length','\\Delta L=\\alpha\\Delta T(L_{a,1}+L_{a,2});\\quad g\\ge\\Delta L+t_{set}',`Steel alpha=${alpha}. Each rail piece is anchored at mid-length and grows from its anchor; at each joint the two pieces close by their growth over the distances from their anchors, the largest of all joints governing. Gap set at the stated installation temperature range; alignment allowance reserved.`,'Detailing');
 check('rail-joint-slot','Rail-joint slot travel',movement,1.5*r.jointBoltDiameter-joint.hole,'length','l_{slot}-d_h\\ge\\Delta L_{joint}','Slots length 1.5 bolt diameters; rail-joint bolts do not establish the girder longitudinal restraint. The whole joint closure is taken in one slot conservatively; slot-end bearing under thermal movement is avoided.','Detailing');
 const stop=activeEndStop(p),stopped=moves.ends.filter(v=>!v.existing&&stopEnds(p).includes(v.end));
 if(stop&&stopped.length)check('rail-end-gap','Rail end clear of the end stop',Math.max(...stopped.map(v=>v.movement))+d.criteria.alignmentTolerance,stop.railGap,'length','\\Delta L_{end}+t_{set}\\le g_{stop}','The anchored end piece grows toward the stop by its length beyond its anchor; the rail end must stay clear of the stop face so the bumper force reaches the stop, not the rail.','Detailing');
 check('rail-joint-fit','Joint bar fit between head and base',r.jointPlateHeight,webDepth,'length','h_j\\le h_r-t_{head}-t_{base}','Both joint bars fit within the clear rail web depth.','Detailing');
 // Rail anchor: crane traction and braking, and rail creep, into the girder at one keeper pair per rail piece.
 const anchorForce=railAnchorForce(p),anchor=railAnchorResponse(p,P,H,anchorForce.force),ag=anchor.geometry;
 check('rail-anchor-weld','Rail anchor keeper fillet welds',anchor.weldStress,available(.6*m.Fexx,method,.75,2),'stress','f_w=\\max\\sqrt{(V_x/A-T y/J)^2+(F/A+T x/J)^2+(N/A+M_y x/I_y+F h\\,y/I_x)^2}/(0.707w)',`Factored crane longitudinal force F=${latexNumber(anchorForce.factor)}C_ls on one anchor keeper of each rail piece, concurrent with its keeper forces in either role. F bears on the ${len(ag.engagement)} engaged keeper end at mid-height of the rail base; end fillets ${len(ag.endWeld)} stop ${len(anchorEndClearance)} outside the un-notched rail-base toe. The other keepers let the rail slide.`);
 check('rail-anchor-bearing','Rail anchor · rail-base notch bearing',anchorForce.force,available(1.8*Math.min(m.Fy,r.Fy)*anchor.bearingArea,method,.75,2),'force','R_n=1.8F_yA_{pb};\\quad A_{pb}=(d_n-c_k)t_{base}',`Rail-base notch ${len(ag.notch)} deep and ${len(ag.notchLength)} long, ${len(anchorEndClearance)} clear of each keeper end; the keeper end bears on the notch end over the engaged depth and the rail-base thickness.`);
 const cycles=d.spectrum.reduce((n,b)=>n+b.cycles,0),F=Math.max(55,690*(1.5/cycles)**.167);
 // The rail pushes the keeper outward and lifts its lip but never pulls it inward or presses the lip down:
 // each passage loads a keeper weld from zero to its bin value.
 const keeperWeldRange=Math.max(...a.railFatigueBins.map(b=>b.weldStress));
 check('rail-keeper-fatigue','Rail keeper weld throat fatigue',keeperWeldRange,F,'stress','\\Delta f_w\\le\\max_i f_{w,i}(C_{ds}+\\eta_iC_{vs}+0.5C_{ss});\\quad F_{SR,F}=\\max[55,690(1.5/n)^{0.167}]','Reference: AIST Technical Report 13 §3.10.2.3. Unfactored fatigue-bin wheel groups, no impact. The keeper weld force is one-signed in both keeper roles (the rail cannot pull a keeper inward or press its lip down), so each cycle ranges from zero to the largest bin value; it is assigned to every cycle, with no endurance or load-sharing credit. Category F, AISC Appendix 3.','Fatigue');
 check('rail-keeper-weld-minimum','Keeper minimum fillet',minimumFillet(Math.min(k.bodyWidth,receivingThickness)),r.clipWeld,'length','w\\ge w_{min,J2.4}','AISC Table J2.4 by the thinner part joined (the girder surface or the keeper body), low-hydrogen electrodes.','Detailing');
 const cyclicP=a.demands.railFatigueVertical;
 const keeperRange=Math.max(...a.railFatigueBins.map(b=>b.plateStress));
 check('rail-keeper-root','Keeper body · end-weld root fatigue',keeperRange,transverseFilletFatigue(k.length,r.clipWeld,cycles).capacity,'stress','\\Delta f_p=2q_{end}/L_k','Unfactored cyclic normal force at the inner ends of the two end fillets, carried by the keeper body as a stem of thickness equal to the keeper length; one-signed range from zero. AISC A-3-5M/A-3-6M, Category C-double-prime.','Fatigue');
 check('rail-joint-fatigue','Rail joint bars · fatigue',cyclicP*(r.jointGap/2+r.jointEdge)/(2*r.jointPlateThickness*(r.jointPlateHeight-dh)**2/6),fatigueSpectrumBin('D',1,cycles).allowable,'stress','\\Delta f=M_{cyclic}/S_{net}','Category D at net section of a bearing-type mechanical joint; full positive wheel load range from absent to loaded for every cycle, no impact. Net depth used conservatively for bending.','Fatigue');
 check('rail-joint-shear-fatigue','Rail joint bolts · cyclic shear',cyclicP/(4*joint.area),F,'stress','\\Delta\\tau=P_{cyclic}/(4A_b)','Supplementary conservative Category F shear-range bound for double-shear bolts; no pretension/slip credit for longitudinally sliding rail joints.','Fatigue');
 return out;
}
