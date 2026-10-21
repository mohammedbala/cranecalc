import {finiteLife} from './fatigueConstants';
import type {CalculationSnapshot,CheckResult,ProjectInput} from './types';
import {available} from './aiscStrength';
import {boltCapacity,boltProperties,compressionResistance,parallelWeldGroup,minimumFillet,filletMinimum,transverseFilletFatigue,blockShear} from './connectionStrength';
import {capAngleGeometry,capAngleInput,isCapAngleTie,minimumEdge,slotEdgeIncrement,boltHardware,tensileArea,capAngleStiffenerGeometry,type CapAngleGeometry,type CapAngleInput,defaultCapAngle} from './capAngle';
import {activeEndBearing} from './endBearingInputs';
import {simpleSupportInput} from './simpleSupports';
import {wrenchClearance} from './endStop';
import {snugTightNotPermitted} from './boltingBasis';
import {oversizedEdgeIncrement} from './fitTolerances';
import {columnStiffenerGeometry} from './columnStiffeners';
import {railTopAboveSteel} from './railSeat';
import {aiscAngleByName} from '../data/aiscAngles';
import {aiscChannelByName as channelData} from '../data/aiscChannels';
import {format} from './units';
import {craneColumnLayout,tieShortening} from './craneColumn';
import {latexNumber,withinLimit} from './math';
import type {RunwayDetails} from './runwayDetails';

/**
 * Cap tieback angle (AISC DG7, "top flange connected directly to column"): local component design. The tie force F
 * (pull or push, factored) is the flange restraint force of the girder lateral/torsional model plus the Appendix 6
 * brace imperfection, as for the other ties. Pull is critical: the cap bolts, the angle's short leg and the channel
 * flange act as a T-stub hanger with prying (AISC Manual Part 9), the tie plate is in tension and the end plate and
 * column flange are a second T-stub. Push bears: the angle bears on the channel flange and the end plate on the
 * shims, and the tie plate buckles over its clear span (E3). Vertical support movement bends the tie plate about its
 * weak axis (both ends taken as fixed for the moment); the girder slides along the runway in the angle's slots.
 */
const inch=25.4,kip=4448.2216152605,ksi=6.894757293168,alpha=12e-6;
export const capAngleGroup='Cap tieback',capAngleMovementGroup='Cap tieback movement';

/** Movements imposed at the tie, mm and rad. */
export interface CapAngleLoads {
 /** Factored tie force (pull or push) and its service fatigue range, N. */
 F:number;range:number;
 /** Factored end rotation and single-crane service rotation, rad. */
 rotation:number;cyclicRotation:number;
 /** Thermal travel at a sliding end, mm. */
 thermal:number;
 /** Factored (all cranes with impact) and single-crane vertical movement of the girder at the tie relative to the column, mm. */
 vertical:number;cyclicVertical:number;
}

/**
 * AISC Manual (15th ed.) Part 9 prying for one bolt of a T-stub flange of thickness t, tributary length p and
 * tensile strength Fu: b and a from the bolt to the stem face and to the prying edge, d' the hole (or slot) length
 * along p. Demand form: t_min (9-20a) for no prying; otherwise the flange is at its plastic moment at the stem face
 * and the bolt line takes δα of it, α = [(t_min/t)² − 1]/δ; the prying force is q = Tρδα/(1 + δα). The flange
 * (fitting) strength is reached at α = 1: T_fit = φpF_u t²(1 + δ)/(4b′).
 */
export function tStubPrying(input:{T:number;t:number;b:number;a:number;p:number;db:number;dPrime:number;Fu:number;method:ProjectInput['method']}){
 const {T,t,b,a,p,db,dPrime,Fu,method}=input;
 const bPrime=b-db/2,aPrime=Math.min(a+db/2,1.25*b+db/2),rho=bPrime/aPrime,delta=1-dPrime/p,resist=available(p*Fu,method,.9,1.67);
 const tMin=Math.sqrt(4*Math.max(T,0)*Math.max(bPrime,0)/resist);
 const alpha=t>=tMin||delta<=0?0:((tMin/t)**2-1)/delta,used=Math.min(alpha,1);
 const q=T*rho*delta*used/(1+delta*used);
 const fitting=resist*t**2*(1+Math.max(delta,0))/(4*Math.max(bPrime,1e-9));
 return {b,a,bPrime,aPrime,rho,delta,p,tMin,alpha,q,fitting,dPrime};
}

/** J5.2 filler factor on bolt shear strength for a filler (shim) of thickness t, mm. */
export const fillerFactor=(t:number)=>t<=inch/4+1e-9?1:Math.max(0,1-.4*(t/inch-.25));

/** Local component design of the cap tieback angle for the given tie force and movements. */
export function capAngleDesign(p:ProjectInput,g:CapAngleGeometry,f:CapAngleLoads){
 const d=p.details!,s=p.section,m=d.material,method=p.method,E=s.E,c=g.input,cf=p.capDesign;
 const capFu=cf?.Fu??m.Fu,capFy=cf?.Fy??m.Fy,F=f.F;
 const A=(n:number,phi:number,omega:number)=>available(n,method,phi,omega);
 // Tie plate weak-axis bending from the vertical movement, both ends fixed: M = 6EIΔ/L², V = 12EIΔ/L³.
 // A released end plate (vertical slots, columnRelease) slides with the girder: the tie plate takes no vertical movement.
 const tp=g.plate.thickness,wp=g.plate.width,L=g.plate.span,I=wp*tp**3/12,dv=g.column.slot?0:f.vertical,dvc=g.column.slot?0:f.cyclicVertical;
 const Mv=6*E*I*dv/L**2,Vv=12*E*I*dv/L**3,Mvc=6*E*I*dvc/L**2,Vvc=12*E*I*dvc/L**3;
 // ---- Cap bolts: two bolts through the angle's short leg and the channel flange, pulled by T = F/2 each.
 const cb=g.cap,nCap=2,T=F/nCap,contact=Math.min(g.dv,s.capDepth)-cb.gauge;
 const pa=c.length/nCap,pc=Math.min(3.5*(cb.gauge-s.capTw),cb.pitch/2+1.75*(cb.gauge-s.capTw));
 const leg=(T0:number)=>tStubPrying({T:T0,t:g.ta,b:cb.gauge-g.ta,a:contact,p:pa,db:cb.diameter,dPrime:cb.slotLength,Fu:m.Fu,method});
 const channel=(T0:number)=>tStubPrying({T:T0,t:cb.seat.thickness,b:cb.gauge-s.capTw,a:contact,p:pc,db:cb.diameter,dPrime:cb.hole,Fu:capFu,method});
 const angleP=leg(T),channelP=channel(T),Q=Math.max(angleP.q,channelP.q);
 const capShear=Vv/nCap,capBolt=boltCapacity({grade:cb.grade,diameter:cb.diameter,planes:1,surface:'B',shear:capShear,tension:T+Q,method});
 // ---- Lap: the tie plate on the long leg, two slip-critical bolts in short slots parallel to the force (J3.8, φ = 0.85).
 const lb=g.lap,nLap=2,toeEdge=g.bh-lb.gauge,lapCouple=F*(tp+g.ta)/2;
 // The lap couple and the plate's end moment rotate the tie plate about the leg toe: bolt tension over the toe edge.
 const lapTension=((lapCouple+Mv)/toeEdge+Vv)/nLap,lapShear=F/nLap;
 const lapBolt=boltCapacity({grade:lb.grade,diameter:lb.diameter,planes:1,surface:lb.surface,shear:lapShear,tension:lapTension,method});
 const lapProps=boltProperties(lb.grade,lb.diameter),mu=lb.surface==='B'?.5:.3;
 const ksc=Math.max(0,1-(method==='LRFD'?1:1.5)*lapTension/(1.13*lapProps.pretension));
 const slip=A(mu*1.13*1*lapProps.pretension*1*ksc,.85,1.76);
 // Bearing / tearout, J3.10(a): tie plate toward its lap end past the short slot; angle long leg toward its toe.
 const plateClear=lb.edge-lb.slot.length/2,legClear=toeEdge-lb.hole/2;
 const bearingPlate=A(Math.min(1.2*plateClear*tp*m.Fu,2.4*lb.diameter*tp*m.Fu),.75,2),bearingLeg=A(Math.min(1.2*legClear*g.ta*m.Fu,2.4*lb.diameter*g.ta*m.Fu),.75,2);
 // ---- Tie plate as a member: D2 with A_e = min(A_n, 0.85A_g) (J4.1(b), bolted lap plate), E3 over the clear span.
 const slotNet=lb.slot.width+inch/16,Ag=wp*tp,An=(wp-nLap*slotNet)*tp,Ae=Math.min(An,.85*Ag);
 const yieldCap=A(m.Fy*Ag,.9,1.67),ruptureCap=A(m.Fu*Ae,.75,2);
 const K=1,r=tp/Math.sqrt(12),compression=compressionResistance(Ag,r,K*L,E,m.Fy,method);
 // H1-1 with the lap moment F·t_p/2 at the faying surface (C_m = 1, amplified by B1 in compression) and the movement moment.
 // P_c and P_e1 over the same K·L. When αP_r reaches P_e1 the plate is elastically unstable: no capacity (B1 infinite),
 // never a clamped amplifier.
 const Pe1=Math.PI**2*E*I/(K*L)**2,alphaF=(method==='LRFD'?1:1.6)*F,B1=alphaF>=Pe1?Infinity:1/(1-alphaF/Pe1),lapMoment=F>0?B1*F*tp/2:0;
 const Mcy=A(m.Fy*wp*tp**2/4,.9,1.67),Pc=Math.min(compression.capacity,yieldCap);
 const momentRatio=(lapMoment+Mv)/Mcy,axial=F/Pc,h1=axial>=.2?axial+8/9*momentRatio:axial/2+momentRatio;
 // Angle long leg: tension yielding and rupture at the lap bolts; at the heel, axial F with the lap couple F(t_p+t_a)/2.
 const wa=c.length,legAg=wa*g.ta,legAn=(wa-nLap*(lb.hole+inch/16))*g.ta;
 const legTension=Math.min(A(m.Fy*legAg,.9,1.67),A(m.Fu*Math.min(legAn,.85*legAg),.75,2));
 const heelP=F/A(m.Fy*legAg,.9,1.67),heelM=lapCouple/A(m.Fy*wa*g.ta**2/4,.9,1.67),heel=heelP>=.2?heelP+8/9*heelM:heelP/2+heelM;
 // Block shear, J4.3 (U_bs = 1): the tie plate toward its lap end past the short slots, the angle long leg toward its toe.
 const block=(t0:number,edge:number,along:number,across:number,width:number,pitch:number)=>{
  const Agv=2*edge*t0,Anv=2*(edge-along/2)*t0;
  return Math.min(blockShear(Agv,Anv,Math.max(1e-6,pitch-across)*t0,m.Fy,m.Fu,method),blockShear(Agv,Anv,Math.max(1e-6,width-pitch-across)*t0,m.Fy,m.Fu,method));};
 const blockPlate=block(tp,lb.edge,lb.slot.length+inch/16,slotNet,wp,lb.pitch),blockLeg=block(g.ta,toeEdge,lb.hole+inch/16,lb.hole+inch/16,wa,lb.pitch);
 // ---- End plate and column flange: two bolts, one above and one below the tie plate. The movement moment adds a couple.
 const cl=g.column,nCol=2,ep=g.endPlate,Tc=F/nCol+Mv/(2*cl.gauge);
 const endP=tStubPrying({T:Tc,t:ep.thickness,b:cl.gauge-tp/2,a:ep.height/2-cl.gauge,p:ep.width,db:cl.diameter,dPrime:cl.slot?.width??cl.hole,Fu:m.Fu,method});
 const col=cl.receiver;
 const offsets=g.stations.map(v=>Math.abs(v.offset)),ez=offsets.length?Math.max(...offsets):0,ezMin=offsets.length?Math.min(...offsets):0;
 const colSpacing=2*cl.gauge;
 const columnP=col?(()=>{const b=ez-col.tw/2;return tStubPrying({T:Tc,t:col.tf,b,a:col.width/2-ez,p:Math.min(3.5*b,colSpacing/2+1.75*b),db:cl.diameter,dPrime:cl.hole,Fu:col.Fu,method});})():undefined;
 // With a stiffener at the tie level the flange also spans to it: the better of the web and stiffener T-stubs (a lower bound).
 // The stiffener is the entered one, or the proposed column stiffener proportions when the flange needs one.
 const sg=col?capAngleStiffenerGeometry(g):undefined;
 const stiffP=col&&sg?(()=>{const b=cl.gauge-sg.thickness/2;return tStubPrying({T:Tc,t:col.tf,b,a:1.25*b,p:Math.min(col.width/2-col.tw/2,3.5*b),db:cl.diameter,dPrime:cl.hole,Fu:col.Fu,method});})():undefined;
 const stiffenerRequired=!!columnP&&!withinLimit(Tc,columnP.fitting),stiffened=!!sg?.provided&&!!stiffP;
 const Qc=endP.q+(columnP?stiffened?Math.min(columnP.q,stiffP!.q):columnP.q:0);
 const filler=fillerFactor(c.shimMax),colShear=Vv/nCol;
 const colBolt=boltCapacity({grade:cl.grade,diameter:cl.diameter,planes:1,surface:'B',shear:colShear/Math.max(filler,1e-9),tension:Tc+Qc,method});
 // End plate fillets: two lines along the runway, one on each face of the tie plate (gauge t_p).
 const weld=parallelWeldGroup({length:wp,gauge:tp,size:g.weld,Fexx:m.Fexx,method,vx:Vv,vy:0,normal:F,mx:0,my:Mv,mz:0});
 // Shims in push: finger shims slotted around the column bolts.
 const shimArea=(ep.width-(cl.hole+inch/8))*ep.height,shimBearing=A(1.8*m.Fy*shimArea,.75,2);
 // Stiffener (J10.8) when required: the full bolt pull through the plate on the tie's side of the web.

 // ---- Movement along the runway in the angle slots: θ about the bearing over the bolt height, thermal travel, setting tolerance.
 const set=simpleSupportInput(p).settingTolerance,travelRequired=f.rotation*g.boltHeight+f.thermal+set,cyclicTravel=f.cyclicRotation*g.boltHeight+f.thermal+set;
 // ---- Stiffness for the girder lateral/torsional model, pull, in series (per tie).
 const capBoltArea=boltProperties(cb.grade,cb.diameter).area,colBoltArea=boltProperties(cl.grade,cl.diameter).area,G=E/2.6;
 const hw=boltHardware(cb.diameter);
 const compliance={
  plate:L/(E*Ag),
  lapBolts:(tp+g.ta)/(nLap*G*lapProps.area),
  // Short leg as a cantilever from the clamped bolt line to the long leg's mid-thickness.
  angleLeg:(cb.gauge-g.ta/2)**3/(3*E*(c.length*g.ta**3/12)),
  // Channel flange as a cantilever from the web over the bolt depth, both bolts' tributary length.
  channelFlange:(cb.gauge-s.capTw)**3/(3*E*(nCap*pc*cb.seat.thickness**3/12)),
  capBolts:(g.ta+cb.seat.thickness+cb.seat.washer.t+c.washerThickness)/(nCap*E*capBoltArea),
  // End plate between the two bolts, simply supported under the tie plate line load.
  endPlate:(2*cl.gauge)**3/(48*E*(ep.width*ep.thickness**3/12)),
  columnBolts:(ep.thickness+g.shim.nominal+(col?.tf??0))/(nCol*E*colBoltArea),
  shims:g.shim.nominal/(E*shimArea),
  // Column flange as a cantilever from the web to the bolt line, both bolts' effective length.
  columnFlange:col&&columnP?(ez-col.tw/2)**3/(3*E*(nCol*columnP.p*col.tf**3/12)):0
 };
 const stiffness=1/Object.values(compliance).reduce((a,v)=>a+v,0);
 return {F,T,Q,angleP,channelP,capBolt,capShear,contact,pa,pc,
  lapTension,lapShear,lapBolt,slip,ksc,mu,plateClear,legClear,bearingPlate,bearingLeg,toeEdge,lapCouple,
  Ag,An,Ae,yieldCap,ruptureCap,compression,K,r,L,Pe1,B1,lapMoment,Mv,Vv,Mvc,Vvc,Mcy,Pc,h1,momentRatio,axial,
  legAg,legAn,legTension,heel,heelP,heelM,blockPlate,blockLeg,
  Tc,endP,columnP,stiffP,stiffenerRequired,stiffened,Qc,colBolt,colShear,filler,ez,ezMin,weld,shimArea,shimBearing,sg,
  travelRequired,cyclicTravel,set,compliance,stiffness};
}
export type CapAngleDesign=ReturnType<typeof capAngleDesign>;

/** Imposed movements at the cap tieback angle from the analysis (as for the other ties: tieMovement.ts). */
export function capAngleLoads(s:CalculationSnapshot,F:number):CapAngleLoads{
 const p=s.input,a=s.designAnalysis!,r=s.detailResults!,g=capAngleGeometry(p)!;
 const support=r.bracket?.service.deflection?.value??r.rolledBracket?.service.deflection?.value??r.existingBracket?.service.seatDeflection?.value??0;
 return {F,range:r.demands.braceFatigue,...capAngleMovement(p,g,{support,rotation:a.endRotation,serviceRotation:a.serviceRotation??0})};
}
/**
 * Movements imposed at the tie from the support's single-crane deflection at the bearing and the girder end rotations
 * (factored and single-crane service): vertical = support × cranes × (1 + impact) + θ × arm, cyclic = support + θ_s × arm,
 * the arm being the tie's distance from the bearing center; the thermal travel of the longest bay.
 */
export function capAngleMovement(p:ProjectInput,g:CapAngleGeometry,m:{support:number;rotation:number;serviceRotation:number}){
 const ss=simpleSupportInput(p),cranes=p.cranes.length,impact=Math.max(...p.cranes.map(c=>c.impact));
 // To the building column beside a crane column: the larger column shortening plus the erection tolerance (tieShortening),
 // its crane-only part cycling with each pass.
 const layout=craneColumnLayout(p),diff=layout?tieShortening(p,layout.girderTie.elevation):undefined;
 // Rotation about the bearing also moves the tie vertically by θ times its distance from the bearing center.
 const arm=Math.max(0,...g.stations.map(v=>Math.abs(v.x-v.bearingCenter)));
 return {rotation:m.rotation,cyclicRotation:m.serviceRotation,thermal:alpha*Math.max(...p.spans)*Math.max(ss.temperatureRise,ss.temperatureFall),
  vertical:m.support*cranes*(1+impact)+m.rotation*arm+(diff?.demand??0),cyclicVertical:m.support+m.serviceRotation*arm+(diff?.cyclic??0)};
}
/**
 * Fatigue stress ranges of the tie plate (AISC Appendix 3, all cycles at the largest range, no threshold credit), each
 * split into the axial part from the tie force range ΔF and the part from the imposed single-crane vertical movement
 * (6EIΔ/L² at the end plate): the net section at the slip-critical lap (Category B, with the lap moment range), and the
 * end plate fillets, toe (Category C) and root (Eq. A-3-5 with R_FIL). The movement part is displacement controlled: it
 * varies as t_p·Δ/L², so a thinner or longer plate lowers it and a heavier one raises it.
 */
export function capAngleFatigue(g:CapAngleGeometry,x:CapAngleDesign,range:number,cycles:number){
 const lb=g.lap,tp=g.plate.thickness,wp=g.plate.width,Mvr=x.Mvc;
 const Sn=(wp-2*(lb.slot.width+inch/16))*tp**2/6,S=wp*tp**2/6,root=transverseFilletFatigue(tp,g.weld,cycles);
 const plate={axial:range/x.Ae+range*tp/2/Sn,movement:Mvr/Sn,allowable:finiteLife(12,cycles)};
 const toe={axial:range/(wp*tp),movement:Mvr/S,allowable:finiteLife(4.4,cycles)};
 return {Mvr,plate:{...plate,f:plate.axial+plate.movement},toe:{...toe,f:toe.axial+toe.movement},
  root:{...toe,f:toe.axial+toe.movement,allowable:root.capacity,reduction:root.reduction}};
}

/** Restraint for the girder lateral/torsional model and the Appendix 6 brace checks: the tie plate member and the series stiffness. */
export function capAngleBraceSystem(p:ProjectInput){
 const g=capAngleGeometry(p);if(!g)return undefined;
 const m=p.details!.material,E=p.section.E,tp=g.plate.thickness,wp=g.plate.width,Ag=wp*tp,r=tp/Math.sqrt(12),L=Math.max(g.plate.span,tp);
 const design=capAngleDesign(p,g,{F:0,range:0,rotation:0,cyclicRotation:0,thermal:0,vertical:0,cyclicVertical:0});
 const compression=compressionResistance(Ag,r,L,E,m.Fy,p.method),tension=Math.min(design.yieldCap,design.ruptureCap);
 const member={A:Ag,r,stiffness:E*Ag/L,tension,compression,bucklingLength:L};
 return {member,cos:1,connectionK:design.stiffness,stiffness:design.stiffness,plies:1 as const,capacity:Math.min(tension,compression.capacity),compliance:design.compliance};
}

/**
 * The cap tieback angle as designed in a calculated snapshot: geometry, the loads and the component design at the
 * factored tie force (the 'brace-member' demand), and whether the column flange needs or has a stiffener at the tie
 * level. Undefined before the detailed analysis or for another tie.
 */
export function capAngleResult(s:CalculationSnapshot){
 const p=s.input,g=capAngleGeometry(p),F=s.checks.find(c=>c.id==='brace-member')?.demand;
 if(!g||!s.detailResults||!s.designAnalysis||F===undefined)return undefined;
 const loads=capAngleLoads(s,F),design=capAngleDesign(p,g,loads);
 return {g,loads,design,stiffener:{required:design.stiffenerRequired,provided:design.stiffened,geometry:design.sg}};
}
const compared=(id:string,group:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,referenceIds=['cap-angle-basis','aisc-connections']):CheckResult=>({id,group,title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,referenceIds:basisLast(referenceIds)});
/** The program's own method is cited after the code clauses it applies, which the printed citation names. */
const basisLast=(ids:string[])=>[...ids.filter(v=>v!=='cap-angle-basis'),...(ids.includes('cap-angle-basis')?['cap-angle-basis']:[])];


/**
 * Every check of the cap tieback angle. `force` is the factored tie force (flange restraint plus Appendix 6
 * imperfection); the fatigue range is the analysis brace force range.
 */
export function capAngleChecks(s:CalculationSnapshot,ctx:{force:number}):CheckResult[]{
 const p=s.input,d=p.details,g=capAngleGeometry(p);if(!d||!g||!s.detailResults||!isCapAngleTie(p))return [];
 const u=p.units,method=p.method,m=d.material,sec=p.section,c=g.input,loads=capAngleLoads(s,ctx.force),x=capAngleDesign(p,g,loads);
 const len=(v:number)=>format(v,'length',u,3),force=(v:number)=>format(v,'force',u,3),stress=(v:number)=>format(v,'stress',u,3),moment=(v:number)=>format(v,'moment',u,3);
 const G=capAngleGroup,MG=capAngleMovementGroup,checks:CheckResult[]=[];
 const add=(...a:Parameters<typeof compared>)=>checks.push(compared(...a));
 const angle=`${c.shape}${'×'}${len(c.length)}`,pull=`Governing case: pull, F = ${force(x.F)} (flange restraint force plus the Appendix 6 imperfection force, factored).`;
 const cb=g.cap,lb=g.lap,cl=g.column,col=cl.receiver,ep=g.endPlate,hw=boltHardware(cb.diameter),C1=wrenchClearance(cb.diameter);
 const pryNote=(v:ReturnType<typeof tStubPrying>,name:string,t:number)=>`${name}: b = ${len(v.b)}, a = ${len(v.a)} (a′ = ${len(v.aPrime)}), p = ${len(v.p)}, δ = 1 − d′/p = ${v.delta.toFixed(3)} (d′ = ${len(v.dPrime)}), ρ = ${v.rho.toFixed(3)}; t_min = ${len(v.tMin)} against t = ${len(t)}${v.tMin<=t?' (no prying)':`; α = ${v.alpha.toFixed(3)}, q = ${force(v.q)}`}.`;
 const cyc=d.spectrum.reduce((a,v)=>a+v.cycles,0);
 // ---------------- At the cap
 add('cap-angle-cap-bolt',G,'Cap bolts · tension with prying',x.T+x.Q,x.capBolt.tension,'force','T_u+q\\le\\phi F^{\\prime}_{nt}A_b;\\quad T_u=F/2;\\;q=T\\rho\\delta\\alpha/(1+\\delta\\alpha)',
  `${pull} Two ${len(cb.diameter)} ${cb.grade} bolts through the angle's vertical leg and the channel flange share the pull: T = ${force(x.T)} each. One prying contact below the bolts, between the angle toe and the channel flange tip, takes the larger of the two prying forces q = ${force(x.Q)} (AISC Manual Part 9). ${pryNote(x.angleP,'Angle leg',g.ta)} ${pryNote(x.channelP,'Channel flange',cb.seat.thickness)} AISC J3.6 and J3.7: F′nt reduced for the concurrent vertical shear ${force(x.capShear)} per bolt from the tie plate's support-movement shear.`,['cap-angle-basis','aisc-manual-prying','aisc-connections']);
 add('cap-angle-leg-prying',G,'Angle vertical leg · bending with prying (fitting strength)',x.T,x.angleP.fitting,'force','T\\le\\frac{\\phi pF_ut^2(1+\\delta)}{4b^{\\prime}};\\quad t_{min}=\\sqrt{\\frac{4Tb^{\\prime}}{\\phi pF_u}}',
  `${pull} AISC Manual Part 9 (Eq. 9-20a, 9-23 to 9-28 with α′ = 1): the vertical leg of ${angle} bends between the horizontal leg (load) and the bolt line, with prying at the toe. The horizontal long slots reduce δ: d′ is the slot length ${len(cb.slotLength)} along p. ${pryNote(x.angleP,'Leg',g.ta)}`,['cap-angle-basis','aisc-manual-prying']);
 add('cap-angle-channel-flange',G,'Cap channel flange · bending under the bolt pull',x.T,x.channelP.fitting,'force','T\\le\\frac{\\phi pF_ut_f^2(1+\\delta)}{4b^{\\prime}};\\quad b=g_v-t_{wc}',
  `${pull} Local to the column-side flange of the ${sec.capCatalogueId??'cap'} channel: a cantilever from the channel web (b from the bolt to the underside of the web), treated as a T-stub flange with prying at the angle toe (AISC Manual Part 9). Yield-line tributary length p = min(3.5b, s/2 + 1.75b) per bolt along the continuous flange. Channel F_u ${stress(p.capDesign?.Fu??m.Fu)}. ${pryNote(x.channelP,'Flange',sec.capTf)}`,['cap-angle-basis','aisc-manual-prying']);
 const eCap=minimumEdge(cb.diameter);
 add('cap-angle-cap-edge',G,'Cap bolts · edge distance to the channel flange tip',eCap,sec.capDepth-cb.gauge,'length','b_{f,c}-g_v\\ge e_{min}',`AISC J3.4 / Table J3.4: the bolt line ${len(cb.gauge)} below the top of the cap; the channel flange is ${len(sec.capDepth)} deep (rolled edge). Standard holes in the channel flange.`);
 const slotEdge=Math.max(eCap+slotEdgeIncrement(cb.diameter,'long'),cb.slotLength/2+eCap-cb.hole/2);
 add('cap-angle-slot-end',G,'Angle slots · end distance to the angle ends',slotEdge,(c.length-cb.pitch)/2,'length','(L_a-s)/2\\ge\\max(e_{min}+C_2,\\;l_{slot}/2+e_{min}-d_h/2)',`AISC J3.4 with Table J3.5 C₂ = 0.75d for long slots perpendicular to the edge, and not less than the clear material of a standard hole at the minimum edge distance beyond the slot end (slot ${len(cb.slotWidth)} × ${len(cb.slotLength)}${cb.sleeved?', sized for the steel sleeve':''}).`);
 const ligament=8/3*cb.diameter-cb.hole+inch/16;
 add('cap-angle-slot-ligament',G,'Angle slots · material between the slots',ligament,cb.pitch-cb.slotLength,'length','s-l_{slot}\\ge\\tfrac83d_b-d_h+\\tfrac1{16}\\,\\mathrm{in}','Same clear material as standard holes at the AISC J3.3 minimum spacing, plus a 1/16 in slot location tolerance.');
 add('cap-angle-slot-toe',G,'Angle slots · edge to the angle toe',eCap-cb.hole/2+cb.slotWidth/2,g.dv-cb.gauge,'length','d_a-g_v\\ge e_{min}-d_h/2+w_{slot}/2',`AISC J3.4: clear material below the slot equal to that of a standard hole at the minimum edge distance. Short leg ${len(g.dv)}.`);
 add('cap-angle-washer-fit',G,'Plate washers · flat on the vertical leg below the angle fillet',g.ka+cb.washer.height/2,cb.gauge,'length','g_v\\ge k_a+h_w/2',`Plate washer ${len(cb.washer.thickness)} × ${len(cb.washer.height)} × ${len(cb.washer.length)} (covers the slot at either end of travel, AISC J3.2) bears flat on the leg below the angle's k_des = ${len(g.ka)} (AISC Manual Table 1-7).`,['cap-angle-basis','aisc-connections']);
 add('cap-angle-washer-bottom',G,'Plate washers · within the vertical leg',cb.gauge+cb.washer.height/2,g.dv,'length','g_v+h_w/2\\le d_a','AISC J3.2: the plate washer covers the long slot and stays on the vertical leg (leg d from AISC Manual Table 1-7).',['cap-angle-basis','aisc-connections']);
 // The washer under the nut sits on the sloped inner face: an F436 1:6 beveled washer (1-3/4 in square), clipped on the
 // web side where it would reach the channel fillet, never closer than 7/8 d_b to the bolt center (ASTM F436).
 const sw=cb.seat.washer,fullHalf=sw.width/2,clip=7/8*cb.diameter,clipped=g.kc+fullHalf>cb.gauge+1e-9,seatHalf=Math.max(clipped?clip:fullHalf,hw.corners/2);
 add('cap-angle-nut-seat',G,'Cap bolt nuts · seat inside the channel below its fillet',g.kc+seatHalf,cb.gauge,'length','g_v\\ge k_c+\\tfrac12\\max(\\text{washer, nut across corners})',`The ${sw.kind==='beveled'?`F436 1:6 beveled washer (${len(sw.width)} square, ${len(sw.t)} mean thickness)`:'F436 washer'} and nut on the inner face of the channel flange sit below the channel's k_des = ${len(g.kc)} (AISC Manual Table 1-5), on the ${sw.kind==='beveled'?'2:12 sloped inner face':'flat of the flange'} (RCSC Specification §6: hardened washer under the turned element; beveled washer where the face slopes more than 1:20).${clipped?` The washer is clipped on the web side to ${len(Math.max(clip,cb.gauge-g.kc))} from the bolt center (ASTM F436 clipped washer, not closer than 7/8 d_b = ${len(clip)}); the nut, ${len(hw.corners)} across corners, governs.`:''} Flange ${len(cb.seat.thickness)} thick at the bolt line (true channel profile).`,['cap-angle-basis','aisc-connections']);
 add('cap-angle-wrench-nut',G,'Cap bolt nuts · wrench clearance inside the channel',C1,cb.gauge-sec.capTw,'length','g_v-t_{wc}\\ge C_1',`AISC Manual Table 7-15 clearance C1 = ${len(C1)}, from the bolt axis to the underside of the channel web (the top of the W flange), as for the bolted end bearings. The nut is held while the head is turned, or turned with a box wrench.`);
 const stack=cb.seat.washer.t+hw.nut+hw.stick,nutTop=cb.gauge-hw.corners/2,besideFlange=nutTop<sec.capTw+sec.tf;
 const room=besideFlange?sec.capWidth/2-cb.seat.thickness-sec.bf/2:sec.capWidth/2-cb.seat.thickness-sec.tw/2;
 add('cap-angle-nut-fit',G,'Cap bolt nuts · fit beside the W flange tip',stack,room,'length','\\text{washer}+\\text{nut}+0.4d_b\\le\\text{clear space}',(besideFlange?`The nut is level with the W top flange: the washer, nut and bolt end (${len(stack)}) fit between the channel flange and the W flange tip (${len(room)}).`:`The nut is below the W top flange: the washer, nut and bolt end (${len(stack)}) fit between the channel flange and the W web (${len(room)}).`)+' Heavy hex nut height and bolt stick-through as AISC Manual Part 7 (Table 7-15 entering clearances; ASTM A563 nut).',['cap-angle-basis','aisc-connections']);
 add('cap-angle-wrench-head',G,'Cap bolt heads · socket clearance below the horizontal leg',C1,cb.gauge-g.ta,'length','g_v-t_a\\ge C_1',`AISC Manual Table 7-15 C1 = ${len(C1)} from the bolt axis to the underside of the horizontal leg. Install and tension the cap bolts before the tie plate and lap bolts.`);
 // ---------------- Angle and tie plate
 const plateName=`PL ${len(g.plate.thickness)} × ${len(g.plate.width)} × ${len(g.plate.length)}`;
 add('cap-angle-plate-yield',G,'Tie plate · tension yielding',x.F,x.yieldCap,'force','P_n=F_yA_g',`AISC D2(a) on ${plateName}. ${pull}`,['cap-angle-basis','aisc-d']);
 add('cap-angle-plate-rupture',G,'Tie plate · tension rupture at the lap',x.F,x.ruptureCap,'force','P_n=F_uA_e;\\quad A_e=\\min(A_n,0.85A_g)',`AISC D2(b) and J4.1(b): two short slots ${len(lb.slot.width)} wide (+1/16 in) deducted, A_n = ${format(x.An,'area',u,3)}; a bolted lap plate takes A_e ≤ 0.85A_g; U = 1 (Table D3.1 case 1).`,['cap-angle-basis','aisc-d']);
 add('cap-angle-leg-tension',G,'Angle horizontal leg · tension at the lap bolts',x.F,x.legTension,'force','R_n=\\min(F_yA_g,\\,F_uA_e)',`AISC D2 / J4.1 on the horizontal leg of ${angle}: standard holes ${len(lb.hole)} deducted (+1/16 in), A_e ≤ 0.85A_g.`,['cap-angle-basis','aisc-d']);
 add('cap-angle-heel',G,'Angle heel · eccentric hanger path (H1-1)',x.heel,1,'ratio','\\frac{F}{\\phi F_yA_g}+\\frac89\\frac{F(t_p+t_a)/2}{\\phi F_yZ}\\le1',`The horizontal leg carries F from the lap to the heel with the whole single-lap couple F(t_p + t_a)/2 = ${moment(x.lapCouple)}; plastic section of the leg Z = L t_a²/4, AISC H1-1 with D2(a) yielding and the F11.1 plastic moment. The vertical leg's own bending at the heel is the Part 9 fitting check.`,['cap-angle-basis','aisc-h']);
 add('cap-angle-block',G,'Lap · block shear',x.F,Math.min(x.blockPlate,x.blockLeg),'force','R_n=\\min(0.6F_uA_{nv},0.6F_yA_{gv})+U_{bs}F_uA_{nt}',`AISC J4.3: the tie plate toward its lap end past the short slots (${force(x.blockPlate)}) and the angle horizontal leg toward its toe (${force(x.blockLeg)}); the block between the bolts and the two outer blocks; U_bs = 0.5. Governing ${x.blockPlate<=x.blockLeg?'tie plate':'angle leg'}.`);
 add('cap-angle-plate-compression',G,'Tie plate · compression buckling over the clear span',x.F,x.compression.capacity,'force','P_n=F_{cr}A_g;\\quad L_c=1.0L;\\ r=t_p/\\sqrt{12}',`AISC E3 about the weak axis over the clear span ${len(x.L)} from the lap bolt line to the end plate. The single row of lap bolts is taken as pinned and the shop-welded end plate as fixed; K = 1.0 (not 0.8) covers the end plate and column flange flexibility. Governing case: push; it bears on the angle and the shims.`,['cap-angle-basis','aisc-e']);
 add('cap-angle-plate-slenderness',G,'Tie plate · slenderness',x.K*x.L/x.r,200,'ratio','L_c/r\\le200','AISC E2 user note.',['aisc-e']);
 add('cap-angle-lap-slip',G,'Lap bolts · slip resistance in short slots',x.lapShear,x.slip,'force','R_n=\\mu D_uh_fT_bn_sk_{sc};\\;\\phi=0.85\\,(\\Omega=1.76)',`AISC J3.8(b): short slots parallel to the force, φ = 0.85; Class ${lb.surface} (μ = ${x.mu}), D_u = 1.13, h_f = 1, one slip plane; k_sc = ${x.ksc.toFixed(3)} for the bolt tension ${force(x.lapTension)} from the lap couple and the plate's movement moment over the toe edge ${len(x.toeEdge)} (J3.9). ${pull} Slip-critical because the slots are parallel to the force (J3.2).`);
 add('cap-angle-lap-shear',G,'Lap bolts · shear, one plane',x.lapShear,x.lapBolt.shear,'force','V=F/2\\le\\phi F_{nv}A_b',`AISC J3.6: two ${len(lb.diameter)} ${lb.grade} bolts, threads included.`);
 add('cap-angle-lap-tension',G,'Lap bolts · tension with shear',x.lapTension,x.lapBolt.tension,'force','T=\\frac12\\left(\\frac{F(t_p+t_a)/2+M_v}{e}+V_v\\right)\\le\\phi F^{\\prime}_{nt}A_b',`AISC J3.7: the lap couple ${moment(x.lapCouple)} and the plate end moment ${moment(x.Mv)} turn the tie plate about the toe of the horizontal leg (${len(x.toeEdge)} from the bolts); with the end shear ${force(x.Vv)}.`);
 add('cap-angle-lap-bearing',G,'Lap bolts · bearing and tearout',x.lapShear,Math.min(x.bearingPlate,x.bearingLeg),'force','R_n=\\min(1.2l_ctF_u,\\;2.4dtF_u)',`AISC J3.10(a), deformation a design consideration. Tie plate toward its lap end: l_c = ${len(x.plateClear)} past the short slot (${force(x.bearingPlate)}); angle horizontal leg toward its toe: l_c = ${len(x.legClear)} (${force(x.bearingLeg)}).`);
 add('cap-angle-lap-spacing',G,'Lap bolts · spacing',8/3*lb.diameter,lb.pitch,'length','s\\ge2\\tfrac23d_b','AISC J3.3.');
 const eLap=minimumEdge(lb.diameter);
 // The edge that governs, as required and provided lengths (the rule is met where every edge is at least its minimum).
 const lapEdges=[[eLap,(g.plate.width-lb.pitch)/2],[eLap,g.bh-lb.gauge],[eLap+slotEdgeIncrement(lb.diameter,'short'),lb.edge],[eLap,(c.length-lb.pitch)/2]],lapEdge=lapEdges.reduce((a,b)=>b[0]/b[1]>a[0]/a[1]?b:a);
 add('cap-angle-lap-edge',G,'Lap bolts · edge distances',lapEdge[0],lapEdge[1],'length','e\\ge e_{min}(+C_2)',`AISC J3.4 and Table J3.5: tie plate sides ${len((g.plate.width-lb.pitch)/2)}, lap end ${len(lb.edge)} (short slot perpendicular to the edge, C₂ = ${len(slotEdgeIncrement(lb.diameter,'short'))}), angle toe ${len(g.bh-lb.gauge)} and angle ends ${len((c.length-lb.pitch)/2)}, against e_min = ${len(eLap)}.`);
 const lapHw=boltHardware(lb.diameter),capStack=g.y0+g.ta+(cb.sleeve?c.sleeveClearance:0)+cb.washer.thickness+hw.head;
 add('cap-angle-lap-nut-clear',G,'Lap bolt nuts · clear of the cap bolt heads',capStack-g.y0,lb.y-lapHw.corners/2-g.y0,'length','g_h-\\tfrac12\\text{nut across corners}\\ge t_a+\\text{sleeve, washer, bolt head}',`The lap bolt nuts hang below the horizontal leg ${len(lb.gauge)} from the back of the vertical leg; the cap bolt heads, plate washers and sleeve ends project ${len(capStack-g.y0)} from it. Heavy hex head and nut sizes as AISC Manual Part 7 (Table 7-15 clearances).`,['cap-angle-basis','aisc-connections']);
 // ---------------- End plate and column
 const colName=col?`${col.shape?`${col.shape} `:''}column flange (${col.source}, t_f = ${len(col.tf)})`:'column flange';
 add('cap-angle-col-bolt',G,'Column bolts · tension with prying',x.Tc+x.Qc,x.colBolt.tension,'force','T_u+q_{ep}+q_c\\le\\phi F^{\\prime}_{nt}A_b;\\quad T_u=\\frac F2+\\frac{M_v}{2g}',`${pull} One ${len(cl.diameter)} ${cl.grade} bolt above and one below the tie plate, through the end plate, shims and the ${colName}. T = ${force(x.Tc)} includes the movement moment ${moment(x.Mv)} as a couple over the bolts. Prying of the end plate (${force(x.endP.q)}) and of the column flange are added (AISC Manual Part 9). J3.7 with the vertical shear ${force(x.colShear)} per bolt${x.filler<1?`, the bolt shear strength reduced by the J5.2 filler factor ${x.filler.toFixed(3)}`:''}.`,['cap-angle-basis','aisc-manual-prying','aisc-connections']);
 add('cap-angle-endplate-prying',G,'End plate · bending with prying (fitting strength)',x.Tc,x.endP.fitting,'force','T\\le\\frac{\\phi pF_ut^2(1+\\delta)}{4b^{\\prime}};\\quad b=g-t_p/2',`${pull} AISC Manual Part 9: the end plate PL ${len(ep.thickness)} × ${len(ep.width)} × ${len(ep.height)} is a T-stub flange with the tie plate as its stem. ${pryNote(x.endP,'End plate',ep.thickness)}`,['cap-angle-basis','aisc-manual-prying']);
 if(cl.slot)add('cap-angle-endplate-edge',G,'Column bolts · end plate edge beyond the vertical slots',Math.max(minimumEdge(cl.diameter)+slotEdgeIncrement(cl.diameter,'long'),cl.slot.length/2+minimumEdge(cl.diameter)-cl.hole/2),ep.height/2-cl.gauge,'length','h/2-g\\ge\\max(e_{min}+C_2,\\;l_{slot}/2+e_{min}-d_h/2)',`AISC J3.4 with Table J3.5 C₂ for long slots perpendicular to the edge, and not less than the clear material of a standard hole at the minimum edge distance beyond the slot end (slot ${len(cl.slot.width)} × ${len(cl.slot.length)} for the sleeve). The slots take the field fit-up of the column holes.`);
 else add('cap-angle-endplate-edge',G,'Column bolts · end plate edge distance',minimumEdge(cl.diameter)+oversizedEdgeIncrement(cl.diameter),ep.height/2-cl.gauge,'length','h/2-g\\ge e_{min}+C_2',`AISC J3.4 minimum ${len(minimumEdge(cl.diameter))} for a standard hole, plus C₂ = ${len(oversizedEdgeIncrement(cl.diameter))} (Table J3.5, oversized hole): the column holes are field-drilled to match, and an end-plate hole that does not line up is reamed to an oversized hole (Table J3.3) at fit-up.`);
 const C1c=wrenchClearance(cl.diameter);
 add('cap-angle-endplate-wrench',G,'Column bolt heads · socket clearance to the tie plate',C1c,cl.gauge-(cl.slot?.travel??0)-g.plate.thickness/2-g.weld,'length',cl.slot?'g-u-t_p/2-w\\ge C_1':'g-t_p/2-w\\ge C_1',`AISC Manual Table 7-15 C1 = ${len(C1c)} from the bolt axis to the tie plate and its fillets${cl.slot?`, with the end plate slid by its travel u = ${len(cl.slot.travel)} toward the bolt`:''}.`);
 if(cl.slot){
  // The released end plate: the bolts, fixed in the column, keep their sleeves and plate washers while the end plate slides.
  const sl=cl.slot,colBolt=boltProperties(cl.grade,cl.diameter),install=inch/16;
  add('cap-angle-endplate-travel',MG,'End plate vertical slots · travel each way',loads.vertical+install,sl.travel,'length','\\Delta_sn(1+I)+\\theta a+1/16\\,\\mathrm{in}\\le u',`The end plate slides with the girder: the vertical movement at the tie ${len(loads.vertical)} (support deflection times the cranes and 1 + impact, plus the end rotation over the tie's distance from the bearing${craneColumnLayout(p)?`, plus the differential shortening of the crane column and the building column with the erection tolerance, ${len(tieShortening(p,craneColumnLayout(p)!.girderTie.elevation)!.demand)} (the column tie's slot rule)`:''}) plus a 1/16 in positioning allowance, against the travel each way in the ${len(sl.width)} × ${len(sl.length)} vertical slots. The tie plate then takes no bending from it.`);
  add('cap-angle-endplate-sleeve',MG,'End plate slots · steel sleeves under the bolt installation load',1.5*colBolt.pretension,m.Fy*sl.sleeve.area,'force','1.5T_b\\le\\phi F_yA_g;\\ \\phi=1.0\\ \\text{(sleeve)}',`Sleeve ${len(sl.sleeve.od)} OD × ${len(sl.sleeve.bore)} bore × ${len(sl.sleeve.length)} long, F_y as the plate material; 1.5 × the minimum pretension bounds turn-of-nut overshoot (RCSC commentary). The sleeve projects past the end plate so the plate is not clamped.`);
  add('cap-angle-endplate-washer',MG,'End plate slots · plate washers clear the tie plate fillets',g.plate.thickness/2+g.weld+sl.washer.length/2+sl.travel,cl.gauge,'length','t_p/2+w+L_w/2+u\\le g',`Plate washer ${len(sl.washer.thickness)} × ${len(sl.washer.width)} × ${len(sl.washer.length)} under each bolt head covers the slot at either extreme of travel (AISC J3.2); it stays with the bolt while the end plate slides by u, clear of the tie plate fillets.`);
 }
 const filletMin=filletMinimum([ep.thickness,g.plate.thickness]);
 add('cap-angle-endplate-weld',G,'End plate to tie plate · shop fillets',x.weld.demand,x.weld.capacity,'stress','f_w=\\sqrt{(V/A_{we})^2+(F/A_{we}+M_vy/I_w)^2}\\le\\phi0.6F_{EXX}',`AISC J2.4: two ${len(g.weld)} fillets × ${len(g.plate.width)}, one on each face of the tie plate. The tie force ${force(x.F)} normal to the welds, the movement moment ${moment(x.Mv)} as a couple across the plate thickness and the shear ${force(x.Vv)}; all weld ends, no directional strength increase.`);
 add('cap-angle-endplate-weld-min',G,'End plate to tie plate · minimum fillet',filletMin,g.weld,'length','w\\ge w_{min}','AISC 360-16 Table J2.4, by the thinner part joined (the tie plate or the end plate).');
 add('cap-angle-shim-max',G,'Shims · maximum thickness',c.shimMax,.75*inch,'length','t\\le3/4\\,\\mathrm{in}\\ \\ \\text{(fillers)}',`AISC J5.2: fillers up to 3/4 in in bolted connections; above 1/4 in the bolt shear strength is reduced by 1 − 0.4(t − 0.25) (here ${x.filler.toFixed(3)}). Finger shims, 0 to ${len(c.shimMax)}, take up the fit-up between the end plate and the column flange; nominal ${len(g.shim.nominal)}.`);
 add('cap-angle-shim-bearing',G,'Shims · bearing in push',x.F,x.shimBearing,'force','R_n=1.8F_yA_{pb}',`AISC J7: the end plate bears on finger shims ${len(ep.width)} × ${len(ep.height)} less the bolt slots (${format(x.shimArea,'area',u,3)}). Governing case: push.`);
 if(col&&x.columnP){
  const cp=x.columnP,sp=x.stiffP!,sg=x.sg!;
  const cap=x.stiffened?Math.max(cp.fitting,sp.fitting):cp.fitting,plate=`PL ${len(sg.thickness)} × ${len(sg.width)} × ${len(sg.length)}`;
  add('cap-angle-column-flange',G,'Column flange · bending under the two-bolt pull',x.Tc,cap,'force','T\\le\\frac{\\phi pF_ut_f^2(1+\\delta)}{4b^{\\prime}};\\quad p=\\min(3.5b,\\;s/2+1.75b)',
   `${pull} The ${colName} as a T-stub flange from the column web (AISC Manual Part 9; yield-line tributary length p per bolt for two bolts ${len(2*cl.gauge)} apart on a continuous flange). Bolts ${len(x.ez)} from the column centerline at the farthest tie (b = ${len(cp.b)}, a = ${len(cp.a)}). ${pryNote(cp,'Flange',col.tf)} ${x.stiffened?`With the column stiffener ${plate} at the tie level the flange also spans to it (b = ${len(sp.b)}, p = ${len(sp.p)}, fitting strength ${force(sp.fitting)}); the better of the two T-stubs, ${force(cap)}, is a lower bound on the two-way plate.`:x.stiffenerRequired?`The unstiffened flange is not enough: provide a column stiffener at the tie level (for example ${plate}, the column stiffener starting proportions), on the tie's side of the web.`:'No stiffener is needed at the tie level.'}`,['cap-angle-basis','aisc-manual-prying']);
  const Yt=col.Fy/col.Fu<=.8?1:1.1,Afg=col.width*col.tf,Afn=(col.width-(cl.hole+inch/16))*col.tf;
  // AISC F13.1 is an applicability test, not a demand/capacity ratio (review C21): where Fu·Afn ≥ Yt·Fy·Afg the holes
  // do not reduce the column's flexural strength; otherwise the existing column check bounds its strong-axis flexure
  // by F13-1, Mn = Fu·Afn·Sx/Afg. The test result is reported without a D/C.
  const f13Holds=withinLimit(Yt*col.Fy*Afg,col.Fu*Afn);
  checks.push({id:'cap-angle-column-holes',group:G,title:'Column flange · tie bolt holes, F13.1 applicability (column flexural strength modifier)',status:'not-applicable',equation:'F_uA_{fn}\\ge Y_tF_yA_{fg}',referenceIds:basisLast(['cap-angle-basis','aisc-f13']),
   note:`AISC F13.1 ${f13Holds?'satisfied':'not satisfied'}: F_u A_fn = ${force(col.Fu*Afn)} ${f13Holds?'≥':'<'} Y_t F_y A_fg = ${force(Yt*col.Fy*Afg)} (Y_t = ${Yt}). One ${len(cl.hole)} hole in the column flange at any level (the two bolts are one above the other); A_fn = ${format(Afn,'area',u,3)} of A_fg = ${format(Afg,'area',u,3)} (${(100*Afn/Afg).toFixed(1)}%). ${f13Holds?'Tension flange rupture does not apply: the holes do not reduce the column\'s flexural strength.':'Tension flange rupture applies: the existing column\'s strong-axis flexure is limited to F13-1, M_n = F_uA_fnS_x/A_fg (see the column flexure check).'} F13.1 modifies the column's flexural strength and is applied in the existing column flexure check. The holes are field-drilled; the tie is not welded to the column.`});
  add('cap-angle-column-edge',G,'Column bolts · edge distance to the column flange tip',minimumEdge(cl.diameter),col.width/2-x.ez,'length','b_f/2-e_x\\ge e_{min}',`AISC J3.4: the farthest tie's bolts ${len(x.ez)} from the column centerline.`);
  add('cap-angle-column-wrench',G,'Column bolt nuts · clear of the column web fillet',C1c,x.ezMin-col.k1,'length','e_x-k_1\\ge C_1',`AISC Manual Table 7-15 C1 = ${len(C1c)}: the nuts inside the column flange, at the nearest tie ${len(x.ezMin)} from the column centerline, clear the web and its fillet (k₁ = ${len(col.k1)}${col.fillet?'':', no fillet credited'}).`);
  // Column stiffener at the tie level (AISC J10.8) with the column stiffener proportions (columnStiffenerInputs.ts):
  // one plate on the tie's side of the web, designed for the whole pull of both bolts (conservative).
  if(!sg.provided)checks.push({id:'cap-angle-stiffener',group:G,title:'Column stiffener at the tie level',status:x.stiffenerRequired?'fail':'not-applicable',equation:'2T\\le\\phi R_n\\ \\ \\text{(unstiffened flange)}',...(x.stiffenerRequired?{demand:x.Tc,capacity:cp.fitting,quantity:'force' as const,utilization:x.Tc/cp.fitting}:{}),
   note:x.stiffenerRequired?`Required (AISC J10.8 with the Manual Part 9 flange fitting strength): the unstiffened column flange fitting strength ${force(cp.fitting)} is below the bolt pull ${force(x.Tc)}. Provide the column stiffener at the tie level (enable it under the cap angle inputs).`:`Not needed (AISC J10.8 with the Manual Part 9 flange fitting strength): the unstiffened column flange fitting strength ${force(cp.fitting)} exceeds the bolt pull ${force(x.Tc)} (ratio ${(x.Tc/cp.fitting).toFixed(3)}).`,referenceIds:['aisc-j','cap-angle-basis']});
  else{
   const ts=sg.thickness,Fst=2*x.Tc,need=x.stiffenerRequired?`required: the unstiffened flange fitting strength ${force(cp.fitting)} < T = ${force(x.Tc)}`:'provided (not required by the flange bending check)';
   add('cap-angle-stiffener',G,'Column stiffener at the tie level · tension (J10.8, J4.1)',Fst,available(m.Fy*sg.contact*ts,method,.9,1.67),'force','R_{st}=2T\\le\\phi F_y(b_s-c)t_s',`AISC J10.8 and J4.1: ${plate} at the tie level on the tie's side of the column web, ${need}. It takes the whole pull of both bolts (not R_u − φR_n), on its clipped flange contact (clip ${len(sg.clip)}).`,['cap-angle-basis','aisc-j']);
   const lambda=.56*Math.sqrt(p.section.E/m.Fy),prop=Math.max(Math.max(ep.thickness/2,sg.width/16,sg.width/lambda)/ts,(ep.width/3-col.tw/2)/sg.width);
   add('cap-angle-stiffener-proportions',G,'Column stiffener · width and thickness (J10.8(1), (2); B4.1a)',prop,1,'ratio','b_s\\ge\\frac{b_p}{3}-\\frac{t_w}{2};\\ \\ t_s\\ge\\max\\left(\\frac{t_p}{2},\\,\\frac{b_s}{16},\\,\\frac{b_s}{0.56\\sqrt{E/F_y}}\\right)','AISC J10.8(1) and (2), B4.1a: the end plate is the plate delivering the force.',['aisc-j']);
   add('cap-angle-stiffener-length',G,'Column stiffener · length (J10.8(3))',col.depth/2,sg.length+col.tf,'length','L_s+t_f\\ge d/2',sg.length>col.depth/2?'AISC J10.8(3): full depth between the flanges.':'AISC J10.8(3): from the loaded flange to the column mid-depth.',['aisc-j']);
   const phiW=available(.6*m.Fexx,method,.75,2);
   add('cap-angle-stiffener-flange-weld',G,'Column stiffener · fillets to the loaded flange (J10.8, J2.4)',Fst/(2*sg.flangeWeld/Math.SQRT2*sg.contact),phiW,'stress','f_w=\\frac{R_{st}}{2(0.707w)(b_s-c)}',`Two ${len(sg.flangeWeld)} fillets × ${len(sg.contact)}, one each face. ${col.isNew?'Shop':'Field'} welds to the ${col.isNew?'new':'existing'} column${col.isNew?'':': identify the steel and set the preheat (Existing column welding)'}.`,['aisc-j']);
   add('cap-angle-stiffener-web-weld',G,'Column stiffener · fillets to the web (J10.8, J2.4)',Fst/(2*sg.webWeld/Math.SQRT2*sg.webLength),phiW,'stress','f_w=\\frac{R_{st}}{2(0.707w)L_w}',`Two ${len(sg.webWeld)} fillets × ${len(sg.webLength)} deliver the stiffener force to the web.`,['aisc-j']);
   add('cap-angle-stiffener-weld-min',G,'Column stiffener · minimum fillets (J2.4)',Math.max(filletMinimum([ts,col.tf])/sg.flangeWeld,filletMinimum([ts,col.tw])/sg.webWeld),1,'ratio','w\\ge w_{min}','AISC 360-16 Table J2.4, by the thinner part joined.',['aisc-j']);
   if(sg.requiredClip!==undefined)add('cap-angle-stiffener-fit',G,'Column stiffener · clear of the rolled fillet',sg.requiredClip,sg.clip,'length','c\\ge k-t_f+1/8\\,in',`The corner clip clears the column's web-to-flange fillet; the plate ${len(sg.width)} wide fits inside the flange tip.`,['aisc-j']);
  }
 }else{
  const by=(id:string,title:string)=>checks.push({id,group:G,title,status:'excluded',equation:'',note:`The receiving column is by others: its flange takes the two-bolt pull ${force(x.Tc)} per bolt (strength) at ${len(2*cl.gauge)} spacing, ${len(x.ez)} from the column centerline; provide a stiffener at the tie level where needed.`,referenceIds:['cap-angle-basis']});
  by('cap-angle-column-flange','Column flange · bending under the two-bolt pull');
 }
 // The bracket's column stiffener pairs (J10.8, at the seat and the rib bottom) are below the tie: the lower column bolt,
 // its nut inside the column flange, keeps the tightening clearance above the upper pair, and the end plate clears it.
 const bs=col?columnStiffenerGeometry(p):undefined;
 if(bs){
  const seatToCap=d.bearing.thickness+sec.d+sec.capTw,upper=bs.levels.reduce((a,v)=>v.z>a.z?v:a,bs.levels[0]),stTop=upper.z+bs.t/2;
  const bolt=seatToCap+Math.min(...cl.zs),plateBottom=seatToCap+ep.z0;
  add('cap-angle-bracket-stiffener-clear',G,'Column bolts · clear of the bracket column stiffeners',C1c,bolt-stTop,'length','z_b-z_{st}\\ge C_1',
   `AISC Manual Table 7-15 C1 = ${len(C1c)}: the lower column bolt, ${len(bolt)} above the top of the bracket seat, and its nut inside the column flange stay clear of the bracket's column stiffener pair at the ${upper.name} (top ${len(stTop)} above the seat, AISC J10.8); the end plate bottom is ${len(plateBottom-stTop)} above it.`,['cap-angle-basis','aisc-connections']);
 }
 // ---------------- Clearances
 const top=Math.max(g.endPlate.z1,g.plate.z1+lapHw.head+lapHw.washer.t);
 add('cap-angle-rail-clear',G,'Tie hardware · below the top of the rail',top,railTopAboveSteel(p),'length','z_{max}\\le h_r',`The end plate top (${len(g.endPlate.z1)}) and lap bolt heads stay below the top of the rail, ${len(railTopAboveSteel(p))} above the cap; the crane clearance envelope is above the rail (AISC DG7: the top flange tie is below the rail, clear of the crane).`,['cap-angle-basis','dg7']);
 // ---------------- Movement
 add('cap-angle-slot-travel',MG,'Angle slots · travel each way along the runway',x.travelRequired,cb.travel,'length','\\theta h_b+\\alpha L\\Delta T+t_{set}\\le u',`Factored end rotation ${loads.rotation.toExponential(3)} rad about the bearing over the ${len(g.boltHeight)} height of the cap bolts, thermal travel ${len(loads.thermal)} at a sliding end (12 × 10⁻⁶/°C over the longest bay) and the ${len(x.set)} setting tolerance. The single-crane service rotation needs ${len(x.cyclicTravel)}. Horizontal long slots ${len(cb.slotWidth)} × ${len(cb.slotLength)} in the vertical leg (AISC Table J3.3; DG7 §11.2: the tie releases the girder end rotation and longitudinal movement).`,['cap-angle-basis','tieback-practice','dg7']);
 add('cap-angle-plate-movement',MG,'Tie plate · axial force with lap moment and support movement (H1-1)',x.h1,1,'ratio','\\frac{P_r}{P_c}+\\frac89\\frac{B_1Fe+6EI\\Delta_v/L^2}{\\phi F_yZ_y}\\le1',
  `AISC H1-1 for ${plateName}: P_r = ${force(x.F)} against P_c = ${force(x.Pc)} (compression governs). ${Number.isFinite(x.B1)?`Lap moment F·t_p/2 at the faying surface amplified by B1 = ${x.B1.toFixed(3)} (C_m = 1, P_e1 over the K·L of P_c) gives ${moment(x.lapMoment)}.`:`Lap moment F·t_p/2 at the faying surface: elastic instability, αP_r/P_e1 = ${((p.method==='LRFD'?1:1.6)*x.F/x.Pe1).toFixed(2)} ≥ 1 (P_e1 = ${force(x.Pe1)} over the K·L of P_c), no capacity.`} Vertical movement of the girder at the tie ${len(loads.vertical)} (support deflection times the cranes and 1 + impact, plus rotation over the tie's distance from the bearing) ${g.column.slot?'is released: the end plate slides in its vertical slots (columnRelease), so it does not bend the plate (0).':`bends the plate about its weak axis, both ends fixed: ${moment(x.Mv)}.`} The slots release movement along the runway only.`,['cap-angle-basis','aisc-h']);
 if(cb.sleeve){
  const bolt=boltCapacity({grade:cb.grade,diameter:cb.diameter,planes:1,surface:'B',shear:0,tension:0,method});
  add('cap-angle-sleeve',MG,'Steel sleeves · bolt installation load',1.5*bolt.pretension,m.Fy*cb.sleeve.area,'force','1.5T_b\\le\\phi F_yA_g;\\ \\phi=1.0\\ \\text{(sleeve)}',`Sleeve ${len(cb.sleeve.od)} OD × ${len(cb.sleeve.bore)} bore × ${len(cb.sleeve.length)} long, F_y as the plate material. 1.5 × the minimum pretension bounds turn-of-nut overshoot (RCSC commentary). The bolt clamps the sleeve to the channel flange; the angle is not clamped (pretensioned per AIST TR-13 §5.14).`,['cap-angle-basis','aisc-connections']);
  add('cap-angle-sleeve-length',MG,'Steel sleeves · angle free to slide',inch/32,cb.sleeve.length-g.ta,'length','L-t_a\\ge1/32\\,\\mathrm{in}\\ \\ \\text{(sleeve)}','DG7 §11.2 sleeved slotted connection (pretensioned per AIST TR-13 §5.14): the sleeve projects beyond the angle leg so the pretensioned bolt clamps the sleeve, not the angle, which slides.',['cap-angle-basis','dg7']);
  const lc=Math.min(g.dv-cb.gauge,cb.gauge-g.ta)-cb.slotWidth/2;
  add('cap-angle-sleeve-bearing',MG,'Angle slots · bearing of the sleeves (vertical)',x.capShear,available(Math.min(1.0*lc*g.ta*m.Fu,2.0*cb.sleeve.od*g.ta*m.Fu),method,.75,2),'force','R_n=\\min(1.0l_ctF_u,\\;2.0d_st F_u)',`AISC J3.10(a) for long slots perpendicular to the force, with the sleeve diameter: the tie plate's vertical shear ${force(x.Vv)} shared by the two sleeves; l_c = ${len(lc)}.`);
 }else{
  checks.push(snugTightNotPermitted('cap-angle-j110','Snug-tight cap bolts · not permitted',MG,'cap bolts in the angle slots'));
  add('cap-angle-slot-length',MG,'Angle slots · long-slot length',cb.slotLength,2.5*cb.diameter,'length','l_{slot}\\le2.5d_b','AISC Table J3.3 long-slot maximum.',['aisc-connections']);
 }
 add('cap-angle-washer',MG,'Plate washers · thickness',5/16*inch,cb.washer.thickness,'length','t\\ge5/16\\,\\mathrm{in}\\ \\ \\text{(plate washer)}','AISC J3.2: plate washers cover long slots in an outer ply.');
 add('cap-angle-washer-bending',MG,'Plate washers · bending under the bolt pull',6*((x.T+x.Q)/2)*Math.max(0,cb.slotWidth/2-.8*cb.diameter)/(cb.washer.length*cb.washer.thickness**2),available(m.Fy,method,.9,1.67),'stress','f_b=\\frac{6(T/2)a}{bt^2};\\quad a=w_{slot}/2-0.8d_b','AISC F11.1 (rectangular bar, elastic section): in pull the angle leg bears on the washer at both slot edges; the washer cantilevers from the bolt head.',['cap-angle-basis','aisc-connections']);
 // ---------------- Fatigue (service range ΔF, all cycles, AISC Appendix 3)
 const range=loads.range,Tr=range/2,At=tensileArea(cb.diameter);
 const angleF=tStubPrying({T:Tr,t:g.ta,b:cb.gauge-g.ta,a:x.contact,p:x.pa,db:cb.diameter,dPrime:cb.slotLength,Fu:m.Fu,method}),chanF=tStubPrying({T:Tr,t:cb.seat.thickness,b:cb.gauge-sec.capTw,a:x.contact,p:x.pc,db:cb.diameter,dPrime:cb.hole,Fu:p.capDesign?.Fu??m.Fu,method});
 const boltAllow=(n:number)=>Math.max(7*ksi,finiteLife(.39,n));
 const capRange=(Tr+Math.max(angleF.q,chanF.q))/At;
 add('cap-angle-cap-bolt-fatigue',G,'Cap bolts · axial tension fatigue',capRange,boltAllow(cyc),'stress','f_{sr}=(\\Delta T+\\Delta q)/A_t\\le F_{SR}=(C_f/n_{SR})^{0.333}\\ge F_{TH}',`AISC Appendix 3.4 / Table A-3.1 item 8.5: C_f = 3.9 × 10⁸, F_TH = 7 ksi, on the tensile stress area A_t = ${format(At,'area',u,3)} with prying. The angle is not clamped by the sleeved bolts, so the whole applied range ΔT = ΔF/2 = ${force(Tr)} reaches them (no 20% credit). ${cyc.toExponential(2)} cycles.`,['cap-angle-basis','aisc-fatigue']);
 const Mvr=x.Mvc,colAt=tensileArea(cl.diameter),Tcr=range/2+Mvr/(2*cl.gauge);
 const endF=tStubPrying({T:Tcr,t:ep.thickness,b:cl.gauge-g.plate.thickness/2,a:ep.height/2-cl.gauge,p:ep.width,db:cl.diameter,dPrime:cl.hole,Fu:m.Fu,method});
 const colF=col?tStubPrying({T:Tcr,t:col.tf,b:x.ez-col.tw/2,a:col.width/2-x.ez,p:x.columnP!.p,db:cl.diameter,dPrime:cl.hole,Fu:col.Fu,method}):undefined;
 const colRange=.2*(Tcr+endF.q+(colF?.q??0))/colAt;
 add('cap-angle-col-bolt-fatigue',G,'Column bolts · axial tension fatigue',colRange,boltAllow(cyc),'stress','f_{sr}=0.2(\\Delta T+\\Delta q)/A_t\\le F_{SR}=(C_f/n_{SR})^{0.333}\\ge F_{TH}',`AISC Appendix 3.4: pretensioned bolts with only steel in the grip (end plate, shims, column flange) take 20% of the applied tension range including prying. ΔT = ${force(Tcr)} with the cyclic movement couple. C_f = 3.9 × 10⁸, F_TH = 7 ksi.`,['cap-angle-basis','aisc-fatigue']);
 const fat=capAngleFatigue(g,x,range,cyc);
 // The split of each range: the axial part from ΔF and the displacement-controlled part from the imposed vertical movement.
 const split=(v:{axial:number;movement:number})=>g.column.slot?`Axial part ${stress(v.axial)} from ΔF = ${force(range)}; the vertical movement is released at the column (vertical slots in the end plate), so it adds no range.`:`Axial part ${stress(v.axial)} from ΔF = ${force(range)}; imposed-movement part ${stress(v.movement)} from the single-crane vertical movement ${len(loads.cyclicVertical)} (M = 6EIΔ/L² = ${moment(Mvr)} over the clear span ${len(g.plate.span)}), which is displacement controlled (∝ t_p·Δ/L²: a thinner or longer plate lowers it, a heavier one raises it).`;
 add('cap-angle-plate-fatigue',G,'Tie plate · net section at the slip-critical lap',fat.plate.f,fat.plate.allowable,'stress','f_{sr}=\\frac{\\Delta F}{A_e}+\\frac{\\Delta M}{S_n}\\le F_{SR}\\ \\ \\text{(Cat. B)}',`AISC Table A-3.1 item 2.2, Category B (net section of a joint installed as slip-critical); all ${cyc.toExponential(2)} cycles at the largest range, no threshold credit. Includes the lap moment range. ${split(fat.plate)}`,['cap-angle-basis','aisc-fatigue']);
 add('cap-angle-weld-toe-fatigue',G,'Tie plate at the end plate fillets · toe',fat.toe.f,fat.toe.allowable,'stress','f_{sr}=\\frac{\\Delta F}{bt_p}+\\frac{6\\Delta M}{bt_p^2}\\le F_{SR}\\ \\ \\text{(Cat. C)}',`AISC Table A-3.1 item 5.5: tension plate with a pair of transverse fillets, crack from the toe, Category C; all cycles, no threshold credit. ${split(fat.toe)}`,['cap-angle-basis','aisc-fatigue']);
 add('cap-angle-weld-root-fatigue',G,'Tie plate at the end plate fillets · root',fat.root.f,fat.root.allowable,'stress','F_{SR}=6900R_{FIL}(4.4/n_{SR})^{0.333};\\;R_{FIL}=\\frac{0.103+1.24w/t_p}{t_p^{0.167}}\\le1',`AISC Table A-3.1 item 5.5, crack from the root (Eq. A-3-5), R_FIL = ${fat.root.reduction.toFixed(3)} for ${len(g.weld)} fillets on the ${len(g.plate.thickness)} plate. ${split(fat.root)}`,['cap-angle-basis','aisc-fatigue']);
 // Local plate bending at the rolled roots: the angle heel, the channel flange at its web and the column flange at its web.
 const localA=finiteLife(25,cyc);
 const locals=[{name:'angle heel',f:6*Tr*Math.max(angleF.bPrime,0)/(1+angleF.delta*Math.min(angleF.alpha,1))/(x.pa*g.ta**2)},{name:'channel flange root',f:6*Tr*Math.max(chanF.bPrime,0)/(1+chanF.delta*Math.min(chanF.alpha,1))/(x.pc*cb.seat.thickness**2)},
  ...(col&&colF?[{name:'column flange root',f:6*Tcr*Math.max(colF.bPrime,0)/(1+colF.delta*Math.min(colF.alpha,1))/(colF.p*col.tf**2)}]:[])];
 const lw=locals.reduce((a,v)=>v.f>a.f?v:a,locals[0]);
 add('cap-angle-local-fatigue',G,'Angle heel, channel and column flange roots · local bending fatigue',lw.f,localA,'stress','f_{sr}=\\frac{6\\Delta Tb^{\\prime}}{(1+\\delta\\alpha)pt^2}\\le F_{SR}\\ \\ \\text{(Cat. A)}',`AISC Table A-3.1 item 1.1, Category A (rolled base metal at the root fillets); the transverse plate bending range at the root of each T-stub. Governing ${lw.name}. The holes are on the bolt lines, where the transverse bending is the small prying moment; the channel flange holes are fatigue details under the girder's longitudinal stress range (Appendix A).`,['cap-angle-basis','aisc-fatigue']);
 return checks;
}

/** Holes in the column-side cap channel flange at each tie, for the girder fatigue register (either hand: both top corners). */
export function capAngleFatigueDetails(p:ProjectInput){
 const g=capAngleGeometry(p);if(!g)return [];
 const sleeved=g.cap.sleeved,category=sleeved?'B' as const:'D' as const;
 const reference=sleeved?'AISC Table A-3.1 item 2.2, Category B: holes clamped by pretensioned bolts (the cap bolts are pretensioned against sleeves that bear on the channel flange); stress at the top of the channel bounds the hole line':'AISC Table A-3.1 item 2.3, Category D: holes with snug-tight bolts; stress at the top of the channel bounds the hole line';
 return g.stations.flatMap((v,i)=>(['top-left','top-right'] as const).map(point=>({id:`CA${i+1}-${point==='top-left'?'L':'R'}`,name:`Cap angle holes, bay ${v.bay} ${v.end} end · channel flange ${point==='top-left'?'left':'right'}`,x:v.x,point,category,reference})));
}

/**
 * Geometry and fit of the cap tieback angle. The bottom flange is restrained by the bolted end bearings, so the
 * angle is a top-flange tie on a capped girder of independent simple spans.
 */
export function validateCapAngle(p:ProjectInput):string[]{
 const d=p.details;if(!d||d.brace.arrangement!=='cap-angle')return [];
 const errors:string[]=[],add=(bad:boolean,note:string)=>{if(bad)errors.push('details.brace.capAngle: '+note);};
 add(p.section.kind!=='cap','the cap tieback angle bolts to the cap channel: select a capped section (W + channel), or another tie.');
 add(!activeEndBearing(p),'the cap tieback angle restrains the top flange only: enable the bolted end bearings so the bottom flange is restrained at the seat.');
 add(p.system!=='simple','the cap tieback angle is detailed for independent simple spans: each girder end has its own tie.');
 if(errors.length)return errors;
 const c=capAngleInput(d),L=aiscAngleByName(c.shape);
 add(!L,'select a valid AISC L-section.');
 for(const [name,b] of [['cap',c.capBolts],['lap',c.lapBolts],['column',c.columnBolts]] as const)try{boltProperties(b.grade,b.diameter);}catch{add(true,`${name} bolts: use an ASTM F3125 A325/A490 bolt from 1/2 to 1-1/2 in.`);}
 if(errors.length)return errors;
 const face=d.bracket?.enabled?d.bracket.reach:c.columnFace??d.brace.flangeAttachment?.columnFace;
 add(!face,'the tie needs the column face: enable the designed column bracket, or enter the column face distance for a bracket by others.');
 const g=capAngleGeometry(p);if(!g)return errors;
 const s=p.section;
 add(g.dv>s.capDepth+2*25.4,'the vertical leg may extend at most 2 in below the channel flange.');
 add(c.capBolts.gauge-g.cap.slotWidth/2<=g.ta,'the cap bolt slots must lie below the horizontal leg.');
 add(c.capBolts.gauge>=s.capDepth,'the cap bolts must pass through the channel flange.');
 add(c.capBolts.gauge+g.cap.slotWidth/2>=g.dv,'the cap bolt slots must lie within the vertical leg.');
 add(g.cap.slotLength>=c.length/2,'the slot length must be less than the tributary angle length per bolt (c.length/2).');
 add(c.capBolts.pitch+g.cap.slotLength>c.length,'the slots must fit within the angle length.');
 add(c.lapBolts.gauge<=g.ta+boltHardware(c.lapBolts.diameter).corners/2||c.lapBolts.gauge>=g.bh,'the lap bolts must lie on the horizontal leg, clear of the vertical leg.');
 add(g.plate.start<g.y0,'the tie plate must not lap over the cap: increase the lap bolt gauge or reduce the lap edge distance.');
 add(g.plate.span<=4*g.plate.thickness||g.plate.gap<=0,'the end plate must stand clear of the angle toe: the column face is too close to the cap.');
 add(c.lapBolts.pitch+2*minimumEdge(c.lapBolts.diameter)>c.plateWidth+1e-6,'the tie plate must contain the lap bolts and their edge distances.');
 add(c.plateWidth>c.endPlate.width+1e-6,'the end plate must be at least as wide as the tie plate.');
 add(c.endPlate.height/2-c.columnBolts.gauge<=g.column.hole/2,'the column bolts must lie within the end plate.');
 add(c.columnBolts.gauge-c.plateThickness/2-c.weldSize<=boltHardware(c.columnBolts.diameter).washer.od/2,'the column bolt washers must clear the tie plate and its fillets.');
 add(c.plateWidth<4*c.weldSize,'the end plate fillets must be at least four weld sizes long (AISC J2.2b).');
 add(c.setback<c.length/2+6.35,'the angle must stay on its own girder: the setback must exceed half the angle length plus 1/4 in.');
 add(c.setback+c.length/2>s.d,'the channel flange holes must stay near the girder end, within one girder depth of it, outside the governing moment region.');
 const col=g.column.receiver;
 if(col){
  add(g.stations.some(v=>Math.abs(v.offset)+c.endPlate.width/2>col.width/2+1e-6),'the end plates must fit on the column flange: reduce the end plate width or the tie setback.');
  add(g.stations.some(v=>Math.abs(v.offset)-boltHardware(c.columnBolts.diameter).corners/2<col.tw/2+col.fillet),'the column bolt nuts must clear the column web and its fillet: increase the tie setback.');
  // Two girder ends at a shared column: the end plates side by side with clearance.
  const byStation=new Map<number,number[]>();for(const v of g.stations){const list=byStation.get(v.station)??[];list.push(v.offset);byStation.set(v.station,list);}
  add([...byStation.values()].some(v=>v.length>1&&Math.min(...v.filter(o=>o>0))-c.endPlate.width/2+Math.min(...v.filter(o=>o<0).map(o=>-o))-c.endPlate.width/2<6.35),'adjacent end plates at a shared column need at least 1/4 in between them.');
 }
 // The tie must not reach past its own girder end, nor into the bearing plate's end bolts' nut region on the cap side: the angle is outside the channel.
 add(g.stations.some(v=>{const lo=v.x-c.length/2,hi=v.x+c.length/2;return v.end==='left'?lo<v.girderEnd:hi>v.girderEnd;}),'the angle must stay within its own girder end.');
 return errors;
}

const roundUp=(v:number,step:number)=>Math.ceil(v/step-1e-9)*step;
/**
 * Proportions of the cap tieback angle for a bolt diameter, angle, tie plate and end plate thickness: pitches, slots,
 * edge distances, gauges and widths that satisfy the detailing checks on the given capped section, in 1/8 in steps.
 */
export function capAngleProportions(p:ProjectInput,size:{shape:string;diameter:number;plate:number;endPlate:number;release?:number},base0:CapAngleInput=defaultCapAngle):CapAngleInput{
 const s=p.section,L=aiscAngleByName(size.shape)!,db=size.diameter,hole=boltProperties('A325',db).hole,eMin=minimumEdge(db),step=inch/8;
 const ta=L.t*inch,ka=L.kdes*inch,dv=L.d*inch,bh=L.b*inch,hw=boltHardware(db);
 // Sleeve walls that take 1.5 times the bolt pretension at the plate F_y (cap-angle-sleeve), from the base wall in 1/16 in steps.
 const Tb=boltProperties('A325',db).pretension,Fs=p.details?.material.Fy??345;let wall=base0.sleeveWall;
 while(wall<inch/2&&Fs*Math.PI/4*((hole+2*wall)**2-hole**2)<1.5*Tb)wall+=inch/16;
 const base:CapAngleInput={...base0,sleeveWall:wall};
 const sleeveOd=hole+2*base.sleeveWall,slotWidth=base.mode==='sleeved'?sleeveOd+inch/16:hole,slotLength=slotWidth+2*base.travel;
 const washerHeight=Math.max(2.5*db,slotWidth+inch);
 const channel=s.kind==='cap'?s:undefined,kc=channel?(()=>{const c=(p.section.capCatalogueId&&aiscChannelKdes(p.section.capCatalogueId))||s.capTw+inch/2;return c;})():inch;
 const gauge=roundUp(Math.max(ka+washerHeight/2,kc+hw.washer.od/2,ta+slotWidth/2+inch/8,s.capTw+wrenchOf(db)),step);
 const pitch=roundUp(slotLength+8/3*db-hole+inch/16,inch/4);
 const edge=Math.max(eMin+.75*db,slotLength/2+eMin-hole/2),length=roundUp(pitch+2*edge,inch/4);
 const lapPitch=roundUp(Math.max(8/3*db,3*db,2.5*inch),inch/4),plateWidth=roundUp(lapPitch+2*eMin,inch/4);
 const lapGauge=roundUp(Math.max(ta+hw.corners/2+(base.mode==='sleeved'?base.sleeveClearance:0)+base.washerThickness+hw.head+hw.corners/2,bh-eMin-inch/4),step);
 // Fillets about 0.6 t_p: the root of the pair (A-3.1 item 5.5) governs their fatigue. The column bolt gauge clears the
 // fillets as sized (socket C1 and washer), not the base fillet.
 const weldSize=Math.max(base.weldSize,minimumFillet(Math.max(size.plate,size.endPlate)),roundUp(.6*size.plate,inch/16));
 // A released end plate (vertical slots, `release` the travel each way): the bolt keeps its clearances with the plate
 // slid by the travel toward it, and its plate washer clears the tie plate fillets at either extreme.
 const u=size.release??0,relSlot=u?(()=>{const w=hole+2*base.sleeveWall+inch/16,l=w+2*u;return {length:l,washer:l+2*u+inch/2};})():undefined;
 const colGauge=roundUp(Math.max(size.plate/2+weldSize+wrenchOf(db)+u,size.plate/2+weldSize+hw.washer.od/2+inch/16+u,relSlot?size.plate/2+weldSize+relSlot.washer/2+u+inch/16:0),step);
 // End plate edge: the J3.4 minimum plus C2 for a hole reamed oversized at fit-up to the field-drilled column holes; beyond
 // a vertical slot, the clear material of a standard hole at the minimum edge distance.
 const epHeight=roundUp(2*(colGauge+(relSlot?Math.max(eMin+slotEdgeIncrement(db,'long'),relSlot.length/2+eMin-hole/2):eMin+oversizedEdgeIncrement(db))),inch/4);
 return {...base,...(u?{columnRelease:{travel:u}}:{}),shape:size.shape,length,setback:Math.max(base.setback,roundUp(length/2+inch/4,inch/4)),
  capBolts:{...base.capBolts,diameter:db,gauge,pitch},plateThickness:size.plate,plateWidth,
  lapBolts:{...base.lapBolts,diameter:db,gauge:Math.min(lapGauge,bh-eMin),pitch:lapPitch,edge:roundUp(eMin+slotEdgeIncrement(db,'short'),step)},
  endPlate:{thickness:size.endPlate,height:epHeight,width:plateWidth},columnBolts:{...base.columnBolts,diameter:db,gauge:colGauge},
  weldSize};
}
const wrenchOf=(db:number)=>wrenchClearance(db);
function aiscChannelKdes(name:string){const c=channelData(name);return c?c.kdes*inch:undefined;}


/**
 * The least setback on the 1/4 in grid, not shorter than the entered one, at which every tie's column bolt nuts clear
 * the column web fillet by the socket clearance (cap-angle-column-wrench: |offset| − k₁ ≥ C₁). A tie's offset from the
 * column centerline is ±(setback − a), a the distance from its girder end to the column centerline into the girder
 * (negative where the girder end stops short of it); where a girder end reaches past the centerline (a centered
 * bearing at a runway-end grid, a > 0) a longer setback first brings that tie toward the web, so the setback steps past
 * a + C₁ + k₁ rather than by the shortfall. The entered setback without a receiving column or ties.
 */
export function capAngleWrenchSetback(g:CapAngleGeometry){
 const rc=g.column.receiver,s0=g.input.setback;if(!rc||!g.stations.length)return s0;
 const need=rc.k1+wrenchClearance(g.column.diameter),a=g.stations.map(v=>s0-(v.end==='left'?1:-1)*v.offset),clear=(s:number)=>a.every(ai=>Math.abs(s-ai)>=need-1e-6);
 let s=s0;
 for(let i=0;i<4*a.length+2&&!clear(s);i++)s=roundUp(Math.max(s,...a.filter(ai=>Math.abs(s-ai)<need-1e-6).map(ai=>ai+need)),inch/4);
 return s;
}
/** Fit ratios of the sizing, held at one. */
export const capAngleFits=new Set(['cap-angle-cap-edge','cap-angle-rail-clear','cap-angle-column-wrench']);
/** Sizing ratios of the plate's displacement-controlled checks (held nearer one where the movement part governs). */
const capAngleMovementRatio=new Set(['cap-angle-plate-fatigue','cap-angle-weld-toe-fatigue','cap-angle-weld-root-fatigue']);
/**
 * The cap tieback's strength and fatigue ratios for sizing, by check id, under the tie force F and the estimated
 * movement (none: a 0.002 rad rotation and no vertical movement); `movementControlled` (not enumerable) lists the
 * fatigue checks whose range is mostly the imposed movement.
 */
export function capAngleSizingRatios(q:ProjectInput,g:CapAngleGeometry,F:number,movement:CapAngleSizingMovement|undefined,cycles:number){
 const ss=simpleSupportInput(q),thermal=alpha*Math.max(...q.spans)*Math.max(ss.temperatureRise,ss.temperatureFall);
 const loads:CapAngleLoads=movement?{F,range:movement.range,...capAngleMovement(q,g,movement)}:{F,range:F/2,rotation:.002,cyclicRotation:.001,thermal,vertical:0,cyclicVertical:0};
 const x=capAngleDesign(q,g,loads);
 const r:Record<string,number>={'cap-angle-cap-bolt':(x.T+x.Q)/x.capBolt.tension,'cap-angle-leg-prying':x.T/x.angleP.fitting,'cap-angle-channel-flange':x.T/x.channelP.fitting,'cap-angle-plate-rupture':x.F/x.ruptureCap,
  'cap-angle-plate-compression':x.F/x.compression.capacity,'cap-angle-plate-movement':x.h1,'cap-angle-lap-slip':x.lapShear/x.slip,'cap-angle-col-bolt':(x.Tc+x.Qc)/x.colBolt.tension,'cap-angle-endplate-prying':x.Tc/x.endP.fitting,
  'cap-angle-endplate-weld':x.weld.demand/x.weld.capacity,'cap-angle-heel':x.heel,
  // Fits held at one (capAngleFits): the cap bolts within the channel flange depth, the hardware below the top of the rail.
  'cap-angle-cap-edge':minimumEdge(g.cap.diameter)/Math.max(q.section.capDepth-g.cap.gauge,1e-6),
  'cap-angle-rail-clear':Math.max(g.endPlate.z1,g.plate.z1+boltHardware(g.lap.diameter).head+boltHardware(g.lap.diameter).washer.t)/Math.max(railTopAboveSteel(q),1e-6),
  // The column bolt nuts inside the column flange clear of the web fillet (check cap-angle-column-wrench).
  ...(g.column.receiver?{'cap-angle-column-wrench':wrenchClearance(g.column.diameter)/Math.max(x.ezMin-g.column.receiver.k1,1e-6)}:{})};
 const controlled=new Set<string>();Object.defineProperty(r,'movementControlled',{value:controlled,enumerable:false});
 if(movement){
  r['cap-angle-lap-tension']=x.lapTension/x.lapBolt.tension;
  const f=capAngleFatigue(g,x,movement.range,cycles);
  for(const [k,v] of [['cap-angle-plate-fatigue',f.plate],['cap-angle-weld-toe-fatigue',f.toe],['cap-angle-weld-root-fatigue',f.root]] as const){r[k]=v.f/v.allowable;if(v.movement>v.axial)controlled.add(k);}
 }
 return r as Record<string,number>&{movementControlled?:Set<string>};
}
/** Estimated movements for sizing the cap tieback before the analysis (the configurator: flangeTieSizing.tieSizingDemands). */
export interface CapAngleSizingMovement {
 /** Single-crane deflection of the support at the bearing, mm; factored and single-crane girder end rotations, rad. */
 support:number;rotation:number;serviceRotation:number;
 /** Unfactored tie force range, N. */
 range:number;
}
/**
 * Template sizing: the lightest arrangement, in standard increments, whose local strength ratios are at most `target`
 * under the estimated tie force F (N); the slots take the setting tolerance, thermal travel and a 0.002 rad rotation.
 * With the estimated `movement` the imposed vertical movement is sized too: the plate's H1 sum with the movement moment,
 * the bolts with its couple, and the tie plate fatigue at the lap and at the end plate fillets (toe and root) with the
 * movement part, which is displacement controlled (∝ t_p·Δ/L²) and held to the target plus 0.07 as the flange ties'
 * imposed movement (flangeTieSizing.sizingLimit). At each angle and bolt size the step's plate is tried first, then
 * thinner plates down to 1/4 in (more flexible out of plane, the stress falls with t_p), then end plate fillets larger
 * in 1/16 in steps up to the plate thickness (R_FIL of the root rises with w/t_p); never a heavier plate for the
 * movement. Every set is also held to the detailing rules of validateCapAngle on the project as it stands (the end
 * plates on the column flange, the nuts clear of the column web, the angle on its own girder end) and to the fit
 * ratios (capAngleFits: the cap bolt edge, the hardware below the top of the rail, the column nuts clear of the web
 * fillet, the setback lengthened for the last): returns the first
 * set that fits and is within its limits, else the fitting one with the least largest ratio; where no set fits, the
 * one with the least largest ratio (the caller checks the fit with validateCapAngle and chooses another tie).
 */
export function sizeCapAngle(p:ProjectInput,F:number,target=.9,movement?:CapAngleSizingMovement):CapAngleInput{
 const steps=[
  {shape:'L4X4X1/2',diameter:.625*inch,plate:.5*inch,endPlate:.625*inch},
  {shape:'L4X4X5/8',diameter:.625*inch,plate:.625*inch,endPlate:.75*inch},
  {shape:'L4X4X5/8',diameter:.75*inch,plate:.75*inch,endPlate:.875*inch},
  {shape:'L4X4X3/4',diameter:.75*inch,plate:.875*inch,endPlate:inch},
  {shape:'L5X5X3/4',diameter:.875*inch,plate:inch,endPlate:1.25*inch},
  {shape:'L5X5X7/8',diameter:inch,plate:1.25*inch,endPlate:1.5*inch}
 ];
 const ss=simpleSupportInput(p),thermal=alpha*Math.max(...p.spans)*Math.max(ss.temperatureRise,ss.temperatureFall);
 const cycles=p.details!.spectrum.reduce((a,v)=>a+v.cycles,0),movementLimit=Math.min(1,target+.07);
 let chosen=capAngleProportions(p,steps[0]),least=Infinity,chosenFits=false;
 const trial=(size:typeof steps[number]&{released?:boolean},weld?:number)=>{
  // The slot travel along the runway: the factored end rotation (estimated, else 0.002 rad) over the cap bolt height.
  // The slot proportions (pitch, edges, washers) are laid out for that travel.
  const travel=Math.max(defaultCapAngle.travel,roundUp((movement?.rotation??.002)*(p.section.d+p.section.capTw)+thermal+ss.settingTolerance,inch/16)),base={...defaultCapAngle,travel};
  let c=capAngleProportions(p,size,base);
  // Released: the vertical slot travel for the estimated movement plus 1/16 in positioning and 1/32 in tolerance, at least 1/8 in.
  if(size.released&&movement){
   const q0:ProjectInput={...p,details:{...p.details!,brace:{...p.details!.brace,arrangement:'cap-angle',capAngle:c}}},g0=capAngleGeometry(q0);
   if(g0)c=capAngleProportions(p,{...size,release:Math.max(inch/8,roundUp(capAngleMovement(q0,g0,movement).vertical+inch/16+inch/32,inch/16))},base);
  }
  let input={...c,...(weld!==undefined?{weldSize:weld}:{})};
  let q:ProjectInput={...p,details:{...p.details!,brace:{...p.details!.brace,arrangement:'cap-angle',capAngle:input}}};
  let g=capAngleGeometry(q);if(!g)return {input,worst:Infinity,fits:false};
  // The column bolt nuts inside the column flange clear the web fillet by the socket clearance (cap-angle-column-wrench):
  // the ties move along their girders (capAngleWrenchSetback; validateCapAngle then holds the end plate on the column
  // flange and the angle on its girder).
  const s=capAngleWrenchSetback(g);
  if(s!==input.setback){input={...input,setback:s};q={...p,details:{...p.details!,brace:{...p.details!.brace,arrangement:'cap-angle',capAngle:input}}};g=capAngleGeometry(q);if(!g)return {input,worst:Infinity,fits:false};}
  const r=capAngleSizingRatios(q,g,F,movement,cycles),fits=validateCapAngle(q).length===0&&[...capAngleFits].every(k=>!((r as Record<string,number>)[k]>1+1e-9));
  return {input,fits,worst:Math.max(...Object.entries(r as Record<string,number>).map(([k,v])=>v/(capAngleFits.has(k)?1:capAngleMovementRatio.has(k)&&r.movementControlled?.has(k)?movementLimit:target)))};
 };
 // Unreleased first; then, with the movement estimated, the end plate released in vertical slots (no movement bending).
 for(const release of movement?[false,true]:[false])for(const size0 of steps){
  const size={...size0,released:release};
  // The step's plate, then thinner ones (more flexible for the imposed movement), each with its default fillets; then
  // larger fillets on each.
  const plates=movement?[size.plate,...[.4375,.375,.3125,.25].map(v=>v*inch).filter(v=>v<size.plate-1e-6)]:[size.plate];
  const sets=plates.map(plate=>({size:{...size,plate},weld:undefined as number|undefined}));
  if(movement)for(const plate of plates){const w0=capAngleProportions(p,{...size0,plate}).weldSize;for(let w=w0+inch/16;w<=plate+1e-6;w+=inch/16)sets.push({size:{...size,plate},weld:w});}
  for(const v of sets){
   const r=trial(v.size,v.weld);
   if(r.worst<=1&&r.fits)return r.input;
   // Without the movement the heaviest fitting set is kept where none passes (the template sizing as before); a set
   // that fits always replaces one that does not.
   if(r.fits&&!chosenFits||r.fits===chosenFits&&(!movement||r.worst<least)){least=r.worst;chosen=r.input;chosenFits=r.fits;}
  }
 }
 return chosen;
}
/** Shared lookup for other modules (drawings, report): the cap angle inputs of a project, defaults applied. */
export const capAngleOf=(d:RunwayDetails)=>capAngleInput(d);
/**
 * Tie force estimate for template sizing before any analysis: factored (1.6) side thrust of the heaviest crane, all its
 * wheels on one girder end, doubled for the torsional share of the top flange and the bracing imperfection force.
 */
export function capAngleForceEstimate(p:ProjectInput){
 const H=Math.max(0,...p.cranes.map(c=>c.wheels.reduce((a,w)=>a+w.lateral,0)));
 return 2*1.6*H;
}
