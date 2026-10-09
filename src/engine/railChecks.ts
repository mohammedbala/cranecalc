import type { CalculationSnapshot,CheckResult } from './types';
import { available } from './aiscStrength';
import { boltCapacity,plateBearing,parallelWeldGroup,blockShear,minimumFillet,transverseFilletFatigue } from './connectionStrength';
import { fatigueSpectrumBin } from './detailAnalysis';
import { latexNumber,withinLimit } from './math';
export function railChecks(s:CalculationSnapshot):CheckResult[]{
 const p=s.input,d=p.details!,r=d.rail,m=d.material,a=s.detailResults!,depth=p.aist!.railDepth,spacing=p.aist!.clipSpacing;
 const receivingThickness=p.section.kind==='cap'?p.section.capTw:p.section.tf,receivingFy=p.section.kind==='cap'?p.capDesign!.Fy:p.section.Fy;
 const out:CheckResult[]=[],method=p.method;
 const check=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,group='Rail details')=>out.push({id,group,title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`${latexNumber(demand)}/${latexNumber(capacity)}=${(demand/capacity).toFixed(4)}`,note,referenceIds:['aisc-connections','tr13-detail']});
 const webDepth=depth-r.headThickness-r.baseThickness;
 const Iy=(r.headThickness*r.headWidth**3+r.baseThickness*r.baseWidth**3+webDepth*r.webThickness**3)/12;
 const Sy=Iy/(Math.max(r.headWidth,r.baseWidth)/2),H=a.demands.railLateral,P=a.demands.railVertical;
 check('rail-flexure','Rail lateral flexure between keepers',H*spacing/4,available(r.Fy*Sy,method,.9,1.67),'moment','M_r=H s/4;\\quad M_n=F_y S_{rail,y}','Conservative simple-span rail between keeper pairs. Idealized head/web/base plate properties without fillet credit; no composite action with the girder. Multiple-wheel loads within one clip interval are grouped.');
 const lb=2*(depth+receivingThickness),pressure=P/(lb*r.baseWidth);
 check('rail-pad','Rail-pad compression',pressure,r.padAllowable,'stress','q_{pad}=P/[2(h_r+t_f)b_{base}]',`Uses the factored wheel/patch force against the entered allowable pad rating conservatively. Rating basis: ${r.padSource}.`);
 check('rail-web','Rail-web compression below wheel',P,available(r.Fy*r.webThickness*(2*r.headThickness),method,.9,1.67),'force','R_n=F_y t_{r,w}(2t_{head})','Conservative zero-contact-length load spread through the rail head. Wheel/rail contact hardness and rolling-contact wear remain crane-supplier selection items.');
 const uplift=H*depth/r.baseWidth+P*Math.abs(p.railEccentricity)/r.baseWidth;
 const rootMoment=uplift*r.clipProjection+H*(r.baseThickness+r.clipThickness/2);
 const clipStress=6*rootMoment/(r.clipWidth*r.clipThickness**2);
 check('rail-keeper-flexure','Rail keeper plate flexure',clipStress,available(m.Fy,method,.9,1.67),'stress','U=(Hh_r+P|e|)/b_r;\\quad f=6[Ua+H(t_b+t_k/2)]/(bt^2)','Each keeper can receive the full conservative overturning uplift; no stabilizing wheel compression is credited. Machined integral stepped keeper permits longitudinal rail sliding. Both uplift and horizontal-force height are included at its welded root.');
 check('rail-keeper-shear','Rail keeper combined shear',Math.hypot(H,uplift),available(.6*m.Fy*r.clipWidth*r.clipThickness,method,1,1.5),'force','V_r=\\sqrt{H^2+U^2};\\quad V_n=0.6F_ybt','Full transverse keeper force plus uplift. Opposing keepers are required at every station, including both sides of each rail joint.');
 const weld=parallelWeldGroup({length:r.clipWidth,gauge:r.clipThickness,size:r.clipWeld,Fexx:m.Fexx,method,vx:H,vy:uplift,normal:0,mx:0,my:rootMoment,mz:0});
 check('rail-keeper-weld','Rail keeper eccentric weld group',weld.demand,weld.capacity,'stress','f_w=\\sqrt{\\tau_x^2+\\tau_y^2+\\sigma_w^2}','Two continuous weld lines along the fixed keeper root; elastic overturning moment included. No directional-strength enhancement.');
 check('rail-flange-local',p.section.kind==='cap'?'Channel web below keeper':'Girder flange below keeper',6*rootMoment/(r.clipWidth*receivingThickness**2),available(receivingFy,method,.9,1.67),'stress','f_{flange}=6M_{root}/(b_{clip}t_f^2)','Conservative local cantilever strip at the keeper attachment; no load spread beyond the keeper width. For a capped girder only the channel web thickness is credited. Supplementary global flange/warping fatigue is evaluated at each keeper station.');
 check('rail-keeper-weld-size','Keeper weld edge limit',r.clipWeld,Math.min(receivingThickness,r.clipThickness)-1.5875,'length','w\\le t_{min}-1/16\\,in','Fillet edge restriction; no full-throat edge buildup credited.','Detailing');
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
 const movement=12e-6*d.rail.temperatureRange*Math.max(...p.spans);
 check('rail-expansion-gap','Rail-joint thermal movement',movement+d.criteria.alignmentTolerance,r.jointGap,'length','\\Delta L=\\alpha\\Delta T L;\\quad g\\ge\\Delta L+t_{set}',`Steel alpha=${p.units==='US'?'6.6667×10^-6 /°F':'12×10^-6 /°C'}. Gap is set at the stated installation temperature range; alignment allowance reserved. Each independently supported rail segment can slide longitudinally beneath its keepers.`,'Detailing');
 check('rail-joint-slot','Rail-joint slot travel',movement,1.5*r.jointBoltDiameter-joint.hole,'length','l_{slot}-d_h\\ge\\alpha\\Delta T L','Slots length 1.5 bolt diameters; rail-joint bolts do not establish the girder longitudinal restraint. Slot-end bearing under thermal movement is avoided.','Detailing');
 check('rail-joint-fit','Joint bar fit between head and base',r.jointPlateHeight,webDepth,'length','h_j\\le h_r-t_{head}-t_{base}','Both joint bars fit within the clear rail web depth.','Detailing');
 const cycles=d.spectrum.reduce((n,b)=>n+b.cycles,0),F=Math.max(55,690*(1.5/cycles)**.167);
 const keeperWeldRange=2*Math.max(...a.railFatigueBins.map(b=>b.weldStress));
 check('rail-keeper-fatigue','Rail keeper weld throat fatigue',keeperWeldRange,F,'stress','\\Delta f_w\\le2\\max_i f_{w,i}(C_{ds}+\\eta_iC_{vs}+0.5C_{ss});\\quad F_{SR,F}=\\max[55,690(1.5/n)^{0.167}]','Reference: AIST Technical Report 13 §3.10.2.3. Unfactored fatigue-bin wheel groups, no impact. Full reversal of the largest weld stress is assigned to every cycle; no endurance or load-sharing credit. Category F, AISC Appendix 3.','Fatigue');
 check('rail-keeper-weld-minimum','Keeper minimum fillet',minimumFillet(Math.max(r.clipThickness,receivingThickness)),r.clipWeld,'length','w\\ge w_{min,J2.4}','Thicker joined part controls the minimum fillet.','Detailing');
 const cyclicP=a.demands.railFatigueVertical;
 const keeperRange=2*Math.max(...a.railFatigueBins.map(b=>b.plateStress));
 check('rail-keeper-root','Keeper plate · weld-root fatigue',keeperRange,transverseFilletFatigue(r.clipThickness,r.clipWeld,cycles).capacity,'stress','\\Delta f_p=2(6U_{cyclic}a/bt_p^2)','Conservative full reversal of the unfactored cyclic keeper plate bending stress. AISC A-3-5M/A-3-6M, Category C-double-prime; stress on plate section at root.','Fatigue');
 check('rail-joint-fatigue','Rail joint bars · fatigue',cyclicP*(r.jointGap/2+r.jointEdge)/(2*r.jointPlateThickness*(r.jointPlateHeight-dh)**2/6),fatigueSpectrumBin('D',1,cycles).allowable,'stress','\\Delta f=M_{cyclic}/S_{net}','Category D at net section of a bearing-type mechanical joint; full positive wheel load range from absent to loaded for every cycle, no impact. Net depth used conservatively for bending.','Fatigue');
 check('rail-joint-shear-fatigue','Rail joint bolts · cyclic shear',cyclicP/(4*joint.area),F,'stress','\\Delta\\tau=P_{cyclic}/(4A_b)','Supplementary conservative Category F shear-range bound for double-shear bolts; no pretension/slip credit for longitudinally sliding rail joints.','Fatigue');
 return out;
}
