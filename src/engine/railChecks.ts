import {categoryF} from './fatigueConstants';
import type { CalculationSnapshot,CheckResult } from './types';
import { available } from './aiscStrength';
import { boltCapacity,plateBearing,blockShear,minimumFillet } from './connectionStrength';
import { fatigueSpectrumBin } from './detailAnalysis';
import { latexNumber,withinLimit } from './math';
import { railClipResponse,railAnchorForce } from './railClip';
import { railSeat,clipSeatThickness } from './railSeat';
import { railMovements,railJointMovement,railJointType,railJointGap,tightJointGap,railJointBars } from './railLayout';
import { activeEndStop,stopEnds } from './endStopInputs';
import { stopBumperForce } from './endStop';
import { format } from './units';
export function railChecks(s:CalculationSnapshot):CheckResult[]{
 const p=s.input,d=p.details!,r=d.rail,m=d.material,a=s.detailResults!,depth=p.aist!.railDepth,spacing=p.aist!.clipSpacing;
 const receivingThickness=clipSeatThickness(p);
 const out:CheckResult[]=[],method=p.method,seat=railSeat(p),k=seat.clip,len=(v:number)=>format(v,'length',p.units,3),force=(v:number)=>format(v,'force',p.units,2);
 const check=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,group='Rail details')=>out.push({id,group,title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`${latexNumber(demand)}/${latexNumber(capacity)}=${(demand/capacity).toFixed(4)}`,note,referenceIds:['aisc-connections','tr13-detail']});
 const webDepth=depth-r.headThickness-r.baseThickness;
 const Iy=(r.headThickness*r.headWidth**3+r.baseThickness*r.baseWidth**3+webDepth*r.webThickness**3)/12;
 const Sy=Iy/(Math.max(r.headWidth,r.baseWidth)/2),H=a.demands.railLateral,P=a.demands.railVertical;
 check('rail-flexure','Rail lateral flexure between clip pairs',H*spacing/4,available(r.Fy*Sy,method,.9,1.67),'moment','M_r=Hs/4\\le\\phi_bM_n=\\phi_bF_yS_y\\ \\ \\text{(rail)}','Conservative simple-span rail between clip pairs. Idealized head/web/base plate properties without fillet credit; no composite action with the girder. Multiple-wheel loads within one clip interval are grouped.');
 // The pad check applies only where the project specifies a pad; its width bears, not the rail base beyond it.
 if(seat.pad){
  const lb=2*(depth+receivingThickness),width=Math.min(seat.pad.width,r.baseWidth),pressure=P/(lb*width);
  check('rail-pad','Rail-pad compression',pressure,r.padAllowable,'stress','f_p=P/[2(h_r+t_f)b]',`Uses the factored wheel/patch force against the entered allowable pad rating conservatively. Rating basis: ${r.padSource}. Pad ${len(seat.pad.thickness)} thick under the rail base; its thickness is in the top-of-rail elevation and every rail-head load height.`);
 }
 check('rail-web','Rail-web compression below wheel',P,available(r.Fy*r.webThickness*(2*r.headThickness),method,.9,1.67),'force','R_n=F_yt_w(2t_h)\\ \\ \\text{(rail web, head }t_h)','Conservative zero-contact-length load spread through the rail head. Wheel/rail contact hardness and rolling-contact wear remain crane-supplier selection items.');
 // Rail clips (AISC DG7; crane rail clip manufacturers): proprietary clips in opposing pairs, floating, specified from the
 // manufacturer's data. The clip's own capacity is the manufacturer's rating; the base weld and its fatigue are checked here.
 const where=p.section.kind==='cap'?'the cap channel web (the girder top plate)':'the W top flange',plate=p.section.kind==='cap'?'cap channel web':'top flange';
 const pending=seat.entered?'':' Rail clip manufacturer data are not entered: enter the clip type, manufacturer and series, the rated lateral and uplift capacity per clip and the base weld from the manufacturer.';
 const clipCheck=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,group='Rail details')=>{
  // The clip ratings are the manufacturer's (DG7, TR-13 §5.16); the base welds are checked to AISC 360-16.
  check(id,title,demand,capacity,quantity,equation,note+pending,group);out.at(-1)!.referenceIds=/weld/.test(id)?['dg7','aisc-connections','tr13-detail']:['dg7','tr13-detail'];
  if(!seat.entered)Object.assign(out.at(-1)!,{status:'unverified'});
 };
 const allowable=k.basis==='allowable',Hs=a.demands.railLateralService??H/1.6,Hc=allowable?Hs:p.method==='LRFD'?H:1.6*H,depth6=depth/r.baseWidth;
 const basisNote=allowable?`The manufacturer rates the clip on an allowable (working-load) basis: compared with the service side thrust ${force(Hs)} (unfactored, one crane), not the factored ${force(H)}.`
  :`The manufacturer rates the clip as an LRFD design strength: compared with the factored side thrust${p.method==='LRFD'?'':' (1.6 times the ASD force)'}.`;
 const share='The side thrust of the wheel group at a clip station (every wheel within one clip spacing) is taken by one clip on the side the rail is pushed toward; no sharing with the neighboring clips is credited.';
 const bolted=k.type==='bolted';
 clipCheck('rail-clip-lateral','Rail clip · rated lateral capacity',Hc,k.lateral,'force','H_c\\le R_c',`${share} ${basisNote} R_c is the manufacturer's rated lateral capacity of one ${k.type} clip (${k.product}); an "or equal" clip must have at least this rating.`);
 clipCheck('rail-clip-uplift','Rail clip · rated uplift capacity',Hc*depth6,k.uplift,'force','T_c=H_ch_r/b_r\\le R_t',`The side thrust at the rail head overturns the rail about the far base toe; the clip there holds the base down. The wheel load that stabilizes the rail is not credited. Same force basis as the lateral rating. R_t is the manufacturer's rated uplift capacity of one clip.`);
 if(bolted){
  for(const [id,title] of [['rail-clip-weld','Rail clip base welds'],['rail-clip-weld-fatigue','Rail clip base weld fatigue'],['rail-clip-weld-minimum','Rail clip base weld minimum size']])
   out.push({id,group:id.endsWith('fatigue')?'Fatigue':id.endsWith('minimum')?'Detailing':'Rail details',title,status:'not-applicable',equation:'',note:`Bolted clamp plates: bolts, holes and plates per the manufacturer; the holes through ${where} are a Category B detail in the fatigue register (A-3.1 item 2.2).`,referenceIds:['dg7']});
 }else{
  const clip=railClipResponse(p,H,k),phi=available(.6*m.Fexx,method,.75,2);
  clipCheck('rail-clip-weld','Rail clip base welds to the girder top plate',clip.weldStress,phi,'stress','f_w=\\frac{1}{2t_el_w}\\sqrt{V^2+\\left(T+\\frac{6M}{l_w}\\right)^2}\\le\\phi(0.6F_{EXX})',`AISC 360-16 J2.4, elastic method, no directional strength increase. Two fillets ${len(k.weld)} x ${len(k.weldLength)}, one across each end of the clip base, ${len(k.baseLength)} apart, on ${where}. Factored side thrust H = ${force(H)} on one clip in either role: bearing clip V = H at mid-height of the rail base (M = ${force(H)} x ${len(k.lateralHeight)}), or hold-down clip T = Hh_r/b_r at the nose (M = T x ${len(clip.upliftArm)} from the weld centroid). The weld size and length are the manufacturer's minimum.${k.weldLength<4*k.weld-1e-6?' The fillets are shorter than 4w and taken at the J2.2b effective size L/4.':''} Base metal of the ${plate} (0.6F_yt per unit length) does not govern.`);
  const cycles=d.spectrum.reduce((n,b)=>n+b.cycles,0),F=categoryF(cycles);
  clipCheck('rail-clip-weld-fatigue','Rail clip base weld throat fatigue',Math.max(...a.railFatigueBins.map(b=>b.weldStress)),F,'stress','f_{sr}=\\max_i f_w\\left(C_d+\\frac{Q_i}{Q}C_{vs}+0.5C_{ss}\\right)\\le F_{SR}=690(1.5/n_{SR})^{0.167}\\ge55\\,\\mathrm{MPa}','AISC 360-16 Table A-3.1 item 8.2 (shear on the throat of fillet welds), Category F; AIST TR-13 §3.10.2.3 unfactored duty-bin wheel groups, no impact. The clip force is one-signed (the rail pushes a clip outward or lifts its nose, never the reverse), so each passage ranges from zero to the largest bin value; it is assigned to every cycle, with no endurance or load-sharing credit. The girder top plate at each clip station is in the fatigue register (RC points, A-3.1 item 7.1).','Fatigue');
  clipCheck('rail-clip-weld-minimum','Rail clip base weld minimum size',minimumFillet(Math.min(k.baseThickness,receivingThickness)),k.weld,'length','w\\ge w_{min}',`AISC Table J2.4 by the thinner part joined (the ${plate} or the clip base), low-hydrogen electrodes.`,'Detailing');
 }
 // AIST TR-13 §5.16.1 tight joints (default): standard holes, bolts pretensioned and re-tightened after 30 and 90 days of
 // operation, gap 1/16 in or less. Open joints: bars slotted along the rail for the joint movement.
 const tight=railJointType(p)==='tight',gap=railJointGap(p);
 const joint=boltCapacity({grade:'A325',diameter:r.jointBoltDiameter,planes:2,surface:'B',shear:P/2,tension:0,method}),dh=joint.hole+(tight?0:1.5875);
 const jointRefs=['aisc-connections','tr13-rail-joints'];
 // Two bolts on each side of the joint, on the rail neutral-axis line. The
 // rail is continuously supported vertically; each cut rail end has its own
 // clip pair for transverse restraint. Joint bars bridge the small end gap.
 check('rail-joint-bolts','Rail joint bolts · vertical shear',P/2,joint.shear,'force','V=P/2',tight?'Two A325 bolts on each side of the tight rail joint, double shear, standard holes, pretensioned and re-tightened after 30 and 90 days of operation (AIST TR-13 §5.16.1). Full wheel load assigned to one side conservatively.':'Two A325 bolts on each side of the open rail joint, double shear. Longitudinal slots allow expansion; slot width is the standard hole diameter. Full wheel load assigned to one side conservatively.');
 out.at(-1)!.referenceIds=jointRefs;
 const t=Math.min(r.webThickness,2*r.jointPlateThickness),jointBearing=plateBearing(r.jointBoltDiameter,joint.hole,t,Math.min(m.Fu,r.Fu),r.jointPlateHeight/2,r.jointPitch,method);
 check('rail-joint-bearing','Rail joint bolt-hole bearing',P/2,tight?jointBearing.capacity:jointBearing.capacity/1.2,'force','R_n=\\min(l_ctF_u,2d_btF_u)',tight?'Standard holes in the bars and the rail web (tight joint), J3.10(a). Both rail web and paired joint bars use the smaller effective thickness.':'Longitudinal slots are perpendicular to the transferred vertical force: reduced J3.10(c) bearing/tearout coefficients. Both rail web and paired joint bars use the smaller effective thickness.');
 const An=(r.jointPlateHeight-dh-(tight?1.5875:0))*2*r.jointPlateThickness;
 check('rail-joint-net','Rail joint bars · shear rupture',P,available(.6*m.Fu*An,method,.75,2),'force','R_n=0.6F_uA_{nv}',tight?'Two symmetric joint bars, standard hole plus 1/16 in deducted from the vertical net section (B4.3b).':'Two symmetric joint bars, standard slot width deducted from the vertical net section.');
 const bars=railJointBars(p),jointMoment=P*bars.centerEdge,S=2*r.jointPlateThickness*r.jointPlateHeight**2/6;
 check('rail-joint-plate','Rail joint bars · bending',jointMoment,available(m.Fy*S,method,.9,1.67),'moment','M_r=Pa;\\quad M_n=F_yS',`Conservative full wheel force bridges from the joint centerline (gap ${len(gap)}${tight?', tight joint':''}) to the first bolt line, ${len(bars.centerEdge)} away. Joint bars are backed by the rail web; lateral buckling is restrained.`);
 const shearLength=r.jointEdge+r.jointPitch;
 const slotDeduction=tight?dh+1.5875:1.5*r.jointBoltDiameter+1.5875;
 check('rail-joint-block','Rail joint bars · block shear',P,blockShear(2*shearLength*t,2*(shearLength-1.5*slotDeduction)*t,(r.jointPlateHeight-dh)*t,m.Fy,m.Fu,method),'force','R_n=\\min(0.6F_uA_{nv},0.6F_yA_{gv})+0.5F_uA_{nt}',tight?'Conservative enclosing block path; standard holes with the net-section deduction along shear paths.':'Conservative enclosing block path; full longitudinal slot length plus the additional net-section deduction is used along shear paths.');
 // Each rail piece is anchored at mid-length, so a joint closes by the growth of both pieces from their anchors.
 const moves=railMovements(p),movement=railJointMovement(moves);
 const alpha=p.units==='US'?'6.6667×10^-6 /°F':'12×10^-6 /°C';
 if(tight){
  out.push({id:'rail-joint-tight',group:'Detailing',title:'Rail joints · tight joints (gap 1/16 in or less)',status:'pass',equation:'g\\le1/16\\,\\mathrm{in}',referenceIds:jointRefs,note:`AIST TR-13 §5.16.1: tight joints, rail ends butted with a gap of 1/16 in or less, joints staggered across the runway (Coordination: rail joints) and the joint bolts re-tightened after 30 and 90 days of operation. The joints do not open or close: each rail string floats in its clips between the end stops, which anchor it, and the clearance gaps at the stops take the thermal movement. Steel alpha=${alpha}.${r.jointGap>tightJointGap+1e-6?` The entered expansion gap ${len(r.jointGap)} applies only to open joints and is not used.`:''}`});
  out.push({id:'rail-expansion-gap',group:'Detailing',title:'Rail-joint thermal movement',status:'not-applicable',equation:'',note:'Tight rail joints (AIST TR-13 §5.16.1): no expansion gap at the joints; the thermal movement of each rail string is taken at the end stops.',referenceIds:jointRefs});
  out.push({id:'rail-joint-slot',group:'Detailing',title:'Rail-joint slot travel',status:'not-applicable',equation:'',note:'Tight rail joints use standard holes; the joint does not slide.',referenceIds:jointRefs});
 }else{
 check('rail-expansion-gap','Rail-joint thermal movement',movement+d.criteria.alignmentTolerance,r.jointGap,'length','\\Delta L=\\alpha\\Delta T(L_1+L_2);\\quad g\\ge\\Delta L+t_{set}',`Steel alpha=${alpha}. Each rail piece is anchored at mid-length by its anchor clip pair and grows from its anchor; at each joint the two pieces close by their growth over the distances from their anchors, the largest of all joints governing. Gap set at the stated installation temperature range; alignment allowance reserved.`,'Detailing');
 check('rail-joint-slot','Rail-joint slot travel',movement,1.5*r.jointBoltDiameter-joint.hole,'length','l_{slot}-d_h\\ge\\Delta L','Slots length 1.5 bolt diameters; rail-joint bolts do not establish the girder longitudinal restraint. The whole joint closure is taken in one slot conservatively; slot-end bearing under thermal movement is avoided.','Detailing');
 }
 const stop=activeEndStop(p),stopped=moves.ends.filter(v=>!v.existing&&stopEnds(p).includes(v.end));
 if(stop&&stopped.length)check('rail-end-gap','Rail end clear of the end stop',Math.max(...stopped.map(v=>v.movement))+d.criteria.alignmentTolerance,stop.railGap,'length','\\alpha\\Delta TL+t_{set}\\le g',tight?'Tight joints: the rail string floats in its clips between the end stops and may rest against either stop, so the growth of the whole string over the temperature swing must fit in the clearance gap at the other stop (AIST TR-13 §5.16.1); the rail end then stays clear of that stop face.':'The anchored end piece grows toward the stop by its length beyond its anchor; the rail end must stay clear of the stop face so the bumper force reaches the stop, not the rail.','Detailing');
 check('rail-joint-fit','Joint bar fit between head and base',r.jointPlateHeight,webDepth,'length','h_j\\le h_r-t_h-t_b','Both joint bars fit within the clear rail web depth.','Detailing');
 // Rail anchorage: crane traction and braking, and rail creep. Tight joints: the rail string floats in its clips and
 // bears on an end stop, which is designed for the larger bumper force. Open joints: one anchor clip pair per piece.
 const anchorForce=railAnchorForce(p),stopAt=stopEnds(p),existingEnd=(['left','right'] as const).find(e=>!stopAt.includes(e));
 if(tight){
  if(stop&&stopAt.length){check('rail-anchorage','Rail anchorage at the end stops',anchorForce.force,stopBumperForce(p),'force',`${Number(anchorForce.factor.toFixed(2))}C_{ls}\\le C_{bs}`,`Floating clips let the rail move along the runway; traction, braking and rail creep move the rail string until its end bears on an end stop. The stop is designed for the bumper force C_bs at the bumper height (end stop checks), which bounds the factored longitudinal force ${force(anchorForce.force)} applied lower, at the rail. No anchor clips or rail notches.${existingEnd?` At the ${existingEnd} end the rail continues onto the existing rail with a tight joint: the existing rail and its stop take the opposite sense (field verify).`:''}`);out.at(-1)!.referenceIds=['dg7','tr13-detail'];}
  else out.push({id:'rail-anchorage',group:'Rail details',title:'Rail anchorage at the end stops',status:'unverified',equation:'',note:'The new rail string floats in its clips but has no girder-mounted stop at either end. Confirm the anchorage of the existing rail it joins, or add anchor clips per the manufacturer.',referenceIds:['dg7']});
 }else if(k.anchorLongitudinal)check('rail-anchorage','Rail anchor clip pair · longitudinal',k.basis==='allowable'?anchorForce.traction:anchorForce.force,k.anchorLongitudinal,'force','F\\le R_a',`Open joints: one anchor clip pair (fixed clips) at mid-length of each rail piece takes the crane longitudinal force (traction and braking) and creep; ${k.basis==='allowable'?'service':'factored'} force against the manufacturer's rated longitudinal resistance R_a of the pair.`);
 else out.push({id:'rail-anchorage',group:'Rail details',title:'Rail anchor clip pair · longitudinal',status:'unverified',equation:'',note:"Open joints: each rail piece needs an anchor clip pair (fixed clips); enter the manufacturer's rated longitudinal resistance of the pair.",referenceIds:['dg7']});
 const cycles=d.spectrum.reduce((n,b)=>n+b.cycles,0),F=categoryF(cycles),cyclicP=a.demands.railFatigueVertical;
 check('rail-joint-fatigue','Rail joint bars · fatigue',cyclicP*railJointBars(p).centerEdge/(2*r.jointPlateThickness*(r.jointPlateHeight-dh)**2/6),fatigueSpectrumBin('D',1,cycles).allowable,'stress','f_{sr}=\\Delta M/S_n','Category D at net section of a bearing-type mechanical joint, no impact. The two rail ends bear on the same girder, so by compatibility the bars carry about P/2 from the loaded end while the wheel is on one side of the gap and −P/2 once it crosses: the range is the full wheel load P over the arm g/2 + e_j at every passage. Net depth used conservatively for bending.','Fatigue');
 check('rail-joint-shear-fatigue','Rail joint bolts · cyclic shear',cyclicP/(4*joint.area),F,'stress','f_{sr}=\\Delta P/(4A_b)',tight?'Supplementary conservative Category F shear-range bound for double-shear bolts; no slip credit is taken for the pretensioned tight joint.':'Supplementary conservative Category F shear-range bound for double-shear bolts; no pretension/slip credit for longitudinally sliding rail joints.','Fatigue');
 return out;
}
