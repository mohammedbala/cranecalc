import {categoryF} from './fatigueConstants';
import type { CalculationSnapshot,CheckResult,ProjectInput } from './types';
import { available } from './aiscStrength';
import { boltCapacity,boltProperties,plateBearing,blockShear,minimumFillet } from './connectionStrength';
import { minimumEdge } from './capAngle';
import { fatigueSpectrumBin } from './detailAnalysis';
import { latexNumber,withinLimit } from './math';
import { railClipResponse,railAnchorForce,wheelGroups } from './railClip';
import { railSeat,clipSeatThickness } from './railSeat';
import { railMovements,railJointMovement,railJointType,railJointGap,tightJointGap,railJointBars,railJointKind,railHasJoints } from './railLayout';
import { activeEndStop,stopEnds,stopRailClear } from './endStopInputs';
import { stopBumperForce,endStopResistance } from './endStop';
import { format } from './units';
/**
 * Rail joint bolt bearing ply by ply (AISC 360-16 J3.10): the two joint bars together (2t_j and the plate F_u; the holes
 * on the bars' mid-height, so the clear distance to the bar edge in the direction of the vertical wheel force is h_j/2
 * less half the hole: 1.2l_c ≤ 2.4d), and the rail web (t_w and the rail F_u, 2.4d, no tearout: the web continues into the
 * head and base, with no free edge vertically). Open joints (long slots perpendicular to the force): the J3.10(c)
 * coefficients 1.0 and 2.0 for each ply.
 */
export function railJointBearing(p:ProjectInput){
 const r=p.details!.rail,m=p.details!.material,method=p.method,hole=boltProperties('A325',r.jointBoltDiameter).hole,slotted=railJointType(p)==='tight'?1:1/1.2;
 const bars=plateBearing(r.jointBoltDiameter,hole,2*r.jointPlateThickness,m.Fu,r.jointPlateHeight/2,r.jointPitch,method).capacity*slotted;
 const web=available(2.4*r.jointBoltDiameter*r.webThickness*r.Fu,method,.75,2)*slotted;
 return {bars,web,capacity:Math.min(bars,web),governs:bars<=web?'bars' as const:'web' as const};
}
export function railChecks(s:CalculationSnapshot):CheckResult[]{
 const p=s.input,d=p.details!,r=d.rail,m=d.material,a=s.detailResults!,depth=p.aist!.railDepth,spacing=p.aist!.clipSpacing;
 const receivingThickness=clipSeatThickness(p);
 const count=(v:number)=>Math.round(v).toLocaleString('en-US');
 const out:CheckResult[]=[],method=p.method,seat=railSeat(p),k=seat.clip,len=(v:number)=>format(v,'length',p.units,3),force=(v:number)=>format(v,'force',p.units,2);
 const check=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,group='Rail details')=>out.push({id,group,title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`${latexNumber(demand)}/${latexNumber(capacity)}=${(demand/capacity).toFixed(4)}`,note,referenceIds:['aisc-connections','tr13-detail']});
 const webDepth=depth-r.headThickness-r.baseThickness;
 const Iy=(r.headThickness*r.headWidth**3+r.baseThickness*r.baseWidth**3+webDepth*r.webThickness**3)/12;
 const Sy=Iy/(Math.max(r.headWidth,r.baseWidth)/2),H=a.demands.railLateral,P=a.demands.railVertical;
 check('rail-flexure','Rail lateral flexure between clip pairs',H*spacing/4,available(r.Fy*Sy,method,.9,1.67),'moment','M_r=Hs/4\\le\\phi_bM_n=\\phi_bF_yS_y\\ \\ \\text{(rail)}','Simple-span rail between clip pairs. Idealized head/web/base plate properties without fillet credit; no composite action with the girder. Multiple-wheel loads within one clip interval are grouped.');
 // The pad check applies only where the project specifies a pad; its width bears, not the rail base beyond it.
 if(seat.pad){
  const lb=2*(depth+receivingThickness),width=Math.min(seat.pad.width,r.baseWidth),pressure=P/(lb*width);
  check('rail-pad','Rail-pad compression',pressure,r.padAllowable,'stress','f_p=P/[2(h_r+t_f)b]',`Uses the factored wheel/patch force against the allowable pad rating. Rating basis: ${r.padSource}. Pad ${len(seat.pad.thickness)} thick under the rail base; its thickness is in the top-of-rail elevation and every rail-head load height.`);
 }
 check('rail-web','Rail-web compression below wheel',P,available(r.Fy*r.webThickness*(2*r.headThickness),method,.9,1.67),'force','R_n=F_yt_w(2t_h)\\ \\ \\text{(rail web, head }t_h)','Zero-contact-length load spread through the rail head. Wheel/rail contact hardness and rolling-contact wear remain crane-supplier selection items.');
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
   out.push({id,group:id.endsWith('fatigue')?'Fatigue':id.endsWith('minimum')?'Detailing':'Rail details',title,status:'not-applicable',equation:'',note:`Bolted clamp plates: bolts, holes and plates per the manufacturer; the holes through ${where} are a Category B fatigue detail (A-3.1 item 2.2, Appendix A).`,referenceIds:['dg7']});
 }else{
  const clip=railClipResponse(p,H,k),phi=available(.6*m.Fexx,method,.75,2);
  clipCheck('rail-clip-weld',`Rail clip base welds to the ${p.section.kind==='cap'?'cap channel web':'girder top flange'}`,clip.weldStress,phi,'stress','f_w=\\frac{1}{2t_el_w}\\sqrt{V^2+\\left(T+\\frac{6M}{l_w}\\right)^2}\\le\\phi(0.6F_{EXX})',`AISC 360-16 J2.4, elastic method, no directional strength increase. Two fillets ${len(k.weld)} × ${len(k.weldLength)}, one across each end of the clip base, ${len(k.baseLength)} apart, on ${where}. Factored side thrust H = ${force(H)} on one clip in either role: bearing clip V = H at mid-height of the rail base (M = ${force(H)} × ${len(k.lateralHeight)}), or hold-down clip T = Hh_r/b_r at the nose (M = T × ${len(clip.upliftArm)} from the weld centroid). The weld size and length are the manufacturer's minimum.${k.weldLength<4*k.weld-1e-6?' The fillets are shorter than 4w and taken at the J2.2b effective size L/4.':''} Base metal of the ${plate} (0.6F_yt per unit length) does not govern.`);
  const passes=d.spectrum.reduce((n,b)=>n+b.cycles,0),clipGroups=wheelGroups(p,spacing),cycles=passes*clipGroups,F=categoryF(cycles);
  clipCheck('rail-clip-weld-fatigue','Rail clip base weld throat fatigue',Math.max(...a.railFatigueBins.map(b=>b.weldStress)),F,'stress','f_{sr}=\\max_i f_w\\left(C_d+\\frac{Q_i}{Q}C_{vs}+0.5C_{ss}\\right)\\le F_{SR}=690(1.5/n_{SR})^{0.167}\\ge55\\,\\mathrm{MPa}',`AISC 360-16 Table A-3.1 item 8.2 (shear on the throat of fillet welds), Category F; AIST TR-13 §3.10.2.3 unfactored duty-bin wheel groups, no impact. The clip force is one-signed (the rail pushes a clip outward or lifts its nose), so each passage ranges from zero to the largest bin value; it is assigned to every cycle, with no endurance or load-sharing credit. Cycles n = ${count(passes)} crane passages × ${clipGroups} wheel group${clipGroups>1?'s':''} per rail (wheels farther apart than the ${len(spacing)} clip spacing each load a clip separately) = ${count(cycles)} (AISC DG7 and AIST TR-13 cycle counting: each wheel or wheel group passing a local detail is one cycle). The cap at each clip is a short-attachment fatigue detail (A-3.1 item 7.1, Appendix A).`,'Fatigue');
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
 check('rail-joint-bolts','Rail joint bolts · vertical shear',P/2,joint.shear,'force','V=P/2',tight?'Two A325 bolts on each side of the tight rail joint, double shear, standard holes, pretensioned and re-tightened after 30 and 90 days of operation (AIST TR-13 §5.16.1). Full wheel load assigned to one side.':'Two A325 bolts on each side of the open rail joint, double shear. Longitudinal slots allow expansion; slot width is the standard hole diameter. Full wheel load assigned to one side.');
 out.at(-1)!.referenceIds=jointRefs;
 // Bolt bearing ply by ply (AISC 360-16 J3.10): the two bars together (2t_j, the bar F_u, holes on their mid-height so the
 // clear distance to the bar edge in the direction of the vertical force is h_j/2 less half the hole), and the rail web
 // (t_w, the rail F_u) with no tearout: the web continues into the head and base, there is no free edge vertically.
 // Open joints: long slots perpendicular to the force, J3.10(c) coefficients (1.0 and 2.0) for each ply.
 const t=Math.min(r.webThickness,2*r.jointPlateThickness),{bars:barsBearing,web:webBearing,capacity:jointBearing}=railJointBearing(p);
 check('rail-joint-bearing','Rail joint bolt-hole bearing · bars and rail web',P/2,jointBearing,'force',tight?'R_n=\\min\\left[\\min(1.2l_c,2.4d)(2t_j)F_u,\\;2.4dt_wF_{u,r}\\right]\\ \\text{(J3-6a, J3-6d)}':'R_n=\\min\\left[\\min(1.0l_c,2.0d)(2t_j)F_u,\\;2.0dt_wF_{u,r}\\right]\\ \\text{(J3-6c, J3-6f)}',`${tight?'Standard holes in the bars and the rail web (tight joint), J3.10(a).':'Longitudinal slots perpendicular to the transferred vertical force: J3.10(c) bearing and tearout coefficients.'} Ply by ply: the two ${len(r.jointPlateThickness)} bars (F_u ${format(m.Fu,'stress',p.units,1)}, clear distance l_c = ${len(r.jointPlateHeight/2-joint.hole/2)} to the bar edge) ${force(barsBearing)}; the ${len(r.webThickness)} rail web (F_u ${format(r.Fu,'stress',p.units,1)}, no tearout: the web continues into the head and base) ${force(webBearing)}; ${barsBearing<=webBearing?'the bars govern':'the rail web governs'}. Full wheel load P/2 on each of the two bolts on one side.`);
 const An=(r.jointPlateHeight-dh-(tight?1.5875:0))*2*r.jointPlateThickness;
 check('rail-joint-net','Rail joint bars · shear rupture',P,available(.6*m.Fu*An,method,.75,2),'force','R_n=0.6F_uA_{nv}',tight?'Two symmetric joint bars, standard hole plus 1/16 in deducted from the vertical net section (B4.3b).':'Two symmetric joint bars, standard slot width deducted from the vertical net section.');
 // Net section of the two bars at the first bolt line, the holes on the bars' mid-height (their neutral axis):
 // S_net = t(h^3 - d_h^3)/(6h) and Z_net = t(h^2 - d_h^2)/4 per bar.
 const bars=railJointBars(p),jointMoment=P*bars.centerEdge,tj=r.jointPlateThickness,hj=r.jointPlateHeight,Snet=2*tj*(hj**3-dh**3)/(6*hj),Znet=2*tj*(hj**2-dh**2)/4;
 check('rail-joint-plate','Rail joint bars · bending',jointMoment,available(m.Fy*Math.min(Znet,1.6*Snet),method,.9,1.67),'moment','M_r=Pa;\\quad M_n=F_yZ_{net}\\le1.6F_yS_{net}',`Full wheel force bridges from the joint centerline (gap ${len(gap)}${tight?', tight joint':''}) to the first bolt line, ${len(bars.centerEdge)} away. Net section of the two bars through the bolt holes on their mid-height (AISC F11.1, F13). Joint bars are backed by the rail web; lateral buckling is restrained.`);
 const shearLength=r.jointEdge+r.jointPitch;
 const slotDeduction=tight?dh+1.5875:1.5*r.jointBoltDiameter+1.5875;
 check('rail-joint-block','Rail joint bars · block shear',P,blockShear(2*shearLength*t,2*(shearLength-1.5*slotDeduction)*t,(r.jointPlateHeight-dh)*t,m.Fy,m.Fu,method),'force','R_n=\\min(0.6F_uA_{nv},0.6F_yA_{gv})+0.5F_uA_{nt}',tight?'Enclosing block path; standard holes with the net-section deduction along shear paths.':'Enclosing block path; full longitudinal slot length plus the additional net-section deduction is used along shear paths.');
 // Each rail piece is anchored at mid-length, so a joint closes by the growth of both pieces from their anchors.
 const moves=railMovements(p),movement=railJointMovement(moves);
 const alpha=p.units==='US'?'6.6667×10^-6 /°F':'12×10^-6 /°C';
 if(tight){
  out.push({id:'rail-joint-tight',group:'Detailing',title:'Rail joints · tight joints (gap 1/16 in or less)',status:'pass',equation:'g\\le1/16\\,\\mathrm{in}',referenceIds:jointRefs,note:`AIST TR-13 §5.16.1: tight joints, rail ends butted with a gap of 1/16 in or less, joints staggered across the runway (Coordination: rail joints) and the joint bolts re-tightened after 30 and 90 days of operation. The joints do not open or close: each rail string floats in its clips between the end stops, which anchor it, and the clearance gaps at the stops take the thermal movement. Steel alpha=${alpha}.${r.jointGap>tightJointGap+1e-6?` The entered expansion gap ${len(r.jointGap)} applies only to open joints and is not used.`:''}`});
  out.push({id:'rail-expansion-gap',group:'Detailing',title:'Rail-joint thermal movement',status:'not-applicable',equation:'',note:'Tight rail joints (AIST TR-13 §5.16.1): no expansion gap at the joints; the thermal movement of each rail string is taken at the end stops.',referenceIds:jointRefs});
  out.push({id:'rail-joint-slot',group:'Detailing',title:'Rail-joint slot travel',status:'not-applicable',equation:'',note:'Tight rail joints use standard holes; the joint does not slide.',referenceIds:jointRefs});
 }else{
 check('rail-expansion-gap','Rail-joint thermal movement',movement+d.criteria.alignmentTolerance,r.jointGap,'length','\\Delta L=\\alpha\\Delta T(L_1+L_2);\\quad g\\ge\\Delta L+t_{set}',`Steel alpha=${alpha}. Each rail piece is anchored at mid-length by its anchor clip pair and grows from its anchor; at each joint the two pieces close by their growth over the distances from their anchors, the largest of all joints governing. Gap set at the stated installation temperature range; alignment allowance reserved.`,'Detailing');
 check('rail-joint-slot','Rail-joint slot travel',movement,1.5*r.jointBoltDiameter-joint.hole,'length','l_{slot}-d_h\\ge\\Delta L','Slots length 1.5 bolt diameters; rail-joint bolts do not establish the girder longitudinal restraint. The whole joint closure is taken in one slot; slot-end bearing under thermal movement is avoided.','Detailing');
 }
 const stop=activeEndStop(p),stopped=moves.ends.filter(v=>!v.existing&&stopEnds(p).includes(v.end));
 // The gap g is clear to the nearest steel of the stop: the front edge of its base plate, which projects in front of the face plate.
 // Tight (or welded) joints: a string floating between two designed stops can use both clearance gaps, each less the
 // setting tolerance; a string continuing onto an existing rail at its other end has the one gap at its stop.
 const both=tight&&(['A','B'] as const).some(side=>stopped.filter(v=>v.side===side).length===2),gaps=both?2:1,tol=d.criteria.alignmentTolerance;
 if(stop&&stopped.length)check('rail-end-gap','Rail end clear of the end stop',Math.max(...stopped.map(v=>v.movement))+gaps*tol,gaps*stopRailClear(stop),'length',both?'\\alpha\\Delta TL+2t_{set}\\le2g':'\\alpha\\Delta TL+t_{set}\\le g',`${tight?(both?'Tight joints: the rail string floats in its clips between the two end stops; its growth over the temperature swing closes the two clearance gaps together, each less the setting tolerance (AIST TR-13 §5.16.1).':'Tight joints: the rail string floats in its clips and continues onto the existing rail at its other end, so its growth over the temperature swing must fit in the one clearance gap at its stop (AIST TR-13 §5.16.1).'):'The anchored end piece grows toward the stop by its length beyond its anchor.'} The gap g is measured from the rail end to the nearest steel of the stop, the front edge of its base plate (in front of the face plate), so the rail end stays clear of all stop steel and the bumper force reaches the stop, not the rail.`,'Detailing');
 check('rail-joint-fit','Joint bar fit between head and base',r.jointPlateHeight,webDepth,'length','h_j\\le h_r-t_h-t_b','Both joint bars fit within the clear rail web depth.','Detailing');
 // Holes on the bars' mid-height: the J3.4 edge distance to the top and bottom bar edges, and to the bar ends.
 check('rail-joint-edge','Rail joint bars · bolt edge distance',minimumEdge(r.jointBoltDiameter),Math.min(r.jointPlateHeight/2,r.jointEdge),'length','l_e\\ge l_{e,min}\\ \\ \\text{(Table J3.4)}','Bolt holes on the mid-height of the joint bars: the edge distance is half the bar height (and the end distance at the bar ends); the AISC 360-16 Table J3.4 minimum for the joint bolt diameter.','Detailing');
 // Rail anchorage: crane traction and braking, and rail creep. Tight joints: the rail string floats in its clips and
 // bears on an end stop, which is designed for the larger bumper force. Open joints: one anchor clip pair per piece.
 const anchorForce=railAnchorForce(p),stopAt=stopEnds(p),existingEnd=(['left','right'] as const).find(e=>!stopAt.includes(e));
 if(tight){
  if(stop&&stopAt.length){
   // The stop is designed for the rail string as its own load case (endStopChecks): the traction at the rail end, on the
   // base plate front edge, against the bolts (tension, shear, J3.9 slip), the base plate and flange bearing and the welds.
   const R=endStopResistance(p)?.rail,resistance=R?.resistance??0;
   check('rail-anchorage','Rail anchorage at the end stops',anchorForce.force,Number.isFinite(resistance)?resistance:1e12*anchorForce.force,'force',`${Number(anchorForce.factor.toFixed(2))}C_{ls}\\le R_{stop}`,`Floating clips let the rail move along the runway; traction, braking and rail creep move the rail string until its end bears on an end stop. No rail-seat friction is relied on: the girder, its locating bearings and supports are checked with the traction either under the driven wheels or through the rail string and a stop into its end bay. The factored longitudinal force ${force(anchorForce.force)} is applied by the rail end at the base plate of the stop (rail string load case of the end stop checks); R_stop = ${force(resistance)} is the stop's resistance to that case, the force over the largest D/C of its bolt, slip, bearing and weld checks (bumper force ${force(stopBumperForce(p))} at the bumper height is the other case). No anchor clips or rail notches.${existingEnd?` At the ${existingEnd} end the rail continues onto the existing rail with a tight joint: the existing rail and its stop take the opposite sense (field verify).`:''}`);out.at(-1)!.referenceIds=['dg7','tr13-detail','aisc-connections'];}
  else out.push({id:'rail-anchorage',group:'Rail details',title:'Rail anchorage at the end stops',status:'unverified',equation:'',note:'The new rail string floats in its clips but has no girder-mounted stop at either end. Confirm the anchorage of the existing rail it joins, or add anchor clips per the manufacturer.',referenceIds:['dg7']});
 }else if(k.anchorLongitudinal)check('rail-anchorage','Rail anchor clip pair · longitudinal',k.basis==='allowable'?anchorForce.traction:anchorForce.force,k.anchorLongitudinal,'force','F\\le R_a',`Open joints: one anchor clip pair (fixed clips) at mid-length of each rail piece takes the crane longitudinal force (traction and braking) and creep; ${k.basis==='allowable'?'service':'factored'} force against the manufacturer's rated longitudinal resistance R_a of the pair.`);
 else out.push({id:'rail-anchorage',group:'Rail details',title:'Rail anchor clip pair · longitudinal',status:'unverified',equation:'',note:"Open joints: each rail piece needs an anchor clip pair (fixed clips); enter the manufacturer's rated longitudinal resistance of the pair.",referenceIds:['dg7']});
 // Each wheel crossing the joint reverses the bar moment and the bolt shear: one cycle per wheel group passing (wheels
 // within the joint bar length act together), times the crane passages of the duty spectrum.
 const jointPasses=d.spectrum.reduce((n,b)=>n+b.cycles,0),jointGroups=wheelGroups(p,railJointBars(p).length),jointCycles=jointPasses*jointGroups,F=categoryF(jointCycles),cyclicP=a.demands.railFatigueVertical;
 const slipCritical=railJointKind(p)==='slip-critical-bars',jointCategory=slipCritical?'B':'D';
 const cycleText=`Cycles n = ${count(jointPasses)} crane passages × ${jointGroups} wheel group${jointGroups>1?'s':''} per rail (wheels farther apart than the ${len(railJointBars(p).length)} joint bars cross the joint separately) = ${count(jointCycles)} (AISC DG7 and AIST TR-13 cycle counting).`;
 check('rail-joint-fatigue','Rail joint bars · fatigue',cyclicP*railJointBars(p).centerEdge/(2*r.jointPlateThickness*(r.jointPlateHeight**3-dh**3)/(6*r.jointPlateHeight)),fatigueSpectrumBin(jointCategory,1,jointCycles).allowable,'stress','f_{sr}=\\Delta M/S_n',`${slipCritical?'Category B (AISC 360-16 Table A-3.1 items 2.1 and 2.2): net section of a slip-critical joint, Class A faying surfaces, bolts pretensioned':'Category D (AISC 360-16 Table A-3.1 item 2.3): net section of a bearing-type joint with pretensioned bolts and unspecified faying surfaces; Category B needs a slip-critical joint with a specified faying class'}, no impact. ${cycleText} The two rail ends bear on the same girder, so by compatibility the bars carry about P/2 from the loaded end while the wheel is on one side of the gap and −P/2 once it crosses: the range is the full wheel load P over the arm g/2 + e_j at every passage. Net section modulus of the two bars through the bolt holes on their mid-height, t(h³ − d_h³)/(6h) each.`,'Fatigue');
 check('rail-joint-shear-fatigue','Rail joint bolts · cyclic shear',cyclicP/(4*joint.area),F,'stress','f_{sr}=\\Delta P/(4A_b)',`${tight?'Supplementary Category F shear-range bound for double-shear bolts; no slip credit is taken for the pretensioned tight joint.':'Supplementary Category F shear-range bound for double-shear bolts; no pretension/slip credit for longitudinally sliding rail joints.'} ${cycleText}`,'Fatigue');
 // A slip-critical joint carries the cyclic shear by friction: its slip resistance (Class A, double shear) under the
 // factored wheel load replaces the bolt shear-range bound.
 if(slipCritical){
  const sc=boltCapacity({grade:'A325',diameter:r.jointBoltDiameter,planes:2,surface:'A',shear:P/2,tension:0,method});
  out.pop();out.push({id:'rail-joint-shear-fatigue',group:'Fatigue',title:'Rail joint bolts · cyclic shear',status:'not-applicable',equation:'',referenceIds:jointRefs,note:'Slip-critical joint: the cyclic shear is carried by friction on the faying surfaces, the bolts do not see a shear range (Rail joint bolts · slip).'});
  check('rail-joint-slip','Rail joint bolts · slip under the wheel load (slip-critical, Class A)',P/2,sc.slip,'force','V=P/2\\le\\phi\\mu D_uT_bn_s',`Two bolts each side of the joint, double shear, Class A faying surfaces (μ = 0.30), standard holes; the full wheel load on the bolts of one side. Slip under every passage would let the joint work: slip is a strength limit here (J3.8).`);out.at(-1)!.referenceIds=jointRefs;
 }
 // Joint checks follow the layout and the joint kind: none where each rail is one piece, none for welded joints, and
 // excluded (by others, a deferred submittal for the demands printed) for the rail supplier's joint bars.
 const jointIds=new Set(['rail-joint-bolts','rail-joint-bearing','rail-joint-net','rail-joint-plate','rail-joint-block','rail-joint-tight','rail-expansion-gap','rail-joint-slot','rail-joint-fit','rail-joint-edge','rail-joint-fatigue','rail-joint-shear-fatigue','rail-joint-slip']);
 const kind=railJointKind(p),jointed=railHasJoints(p);
 for(let i=0;i<out.length;i++){
  const c=out[i];if(!jointIds.has(c.id))continue;
  if(!jointed)out[i]={id:c.id,group:c.group,title:c.title,status:'not-applicable',equation:'',referenceIds:jointRefs,note:'Each rail is one piece: the runway is within one mill length and neither end continues onto an existing rail, so there is no rail joint.'};
  else if(kind==='welded')out[i]={id:c.id,group:c.group,title:c.title,status:'not-applicable',equation:'',referenceIds:jointRefs,note:'Welded rail joints (thermite or flash-butt) by the rail supplier\'s qualified welding procedure, with its preheat, finishing and inspection: the rail is continuous through the joint, with no bars or bolt holes. The welded string floats in its clips between the end stops like a tight-jointed one.'};
  else if(kind==='supplier-bars'&&c.status!=='not-applicable'&&!['rail-joint-tight','rail-expansion-gap','rail-joint-slot'].includes(c.id))out[i]={...c,status:'excluded',note:`Rail supplier's joint bars fitted to the rail fishing surfaces, by others (deferred submittal): the supplier's bars, bolts and holes shall be designed for the demand shown${c.demand!==undefined?` (${c.quantity==='stress'?format(c.demand,'stress',p.units,3):c.quantity==='moment'?format(c.demand,'moment',p.units,3):c.quantity==='length'?len(c.demand):force(c.demand)})`:''}. The value checked here is for idealized bars of the entered size, for reference only. ${c.note??''}`};
 }
 return out;
}
