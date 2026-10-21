/**
 * Horizontal slotted tie plate at a column step (top-flange tie arrangement 'step-plate'; R7, the step tie).
 *
 * Why. At the step of a stepped column the upper shaft's inner flange stands 10 to 18 in from the girder web, so a tie of
 * vertical bars or a vertical plate has only 1 to 10 in of clear length. The girder end moves along the runway (θ·d about
 * the bearing, thermal travel at sliding ends) by several times what so short a ply can bend through, and a slide that
 * releases it carries its sleeve friction μF, which bends vertical gussets and plies about their weak axes. Turned flat,
 * the tie takes the along-runway friction in its own plane (strong axis) and the small vertical movement of the girder end
 * relative to the upper shaft (the step's rotation over the tie distance and the cap flexure, a fraction of a millimetre)
 * about its weak axis over the whole clear span between the flange tip and the column face.
 *
 * Arrangement (drawn on the stepped-column sheet), per girder end at its bearing (simple spans: each girder end; a
 * continuous girder: each support):
 *  - girder plate t_p × w_p (along the runway) shop welded under the top flange outstand on the column side, centered on
 *    the bearing, from clear of the web fillet to past the flange tip, by two fillets along its edges across the runway;
 *    the tie-side bearing stiffener is fitted to its underside (the plate between the stiffener and the flange);
 *  - column shelf t_s × w_s × p_s: a horizontal plate under the girder plate's outer end, field welded top and bottom to
 *    the upper shaft's inner flange, centered on the column web (one shelf takes both girder ends at a shared grid);
 *  - vertical bolts beyond the flange tip, pretensioned against steel sleeves through a standard hole in the girder plate
 *    and long slots along the runway in the shelf: the girder end slides along the runway, the tie force across it bears
 *    on the slot sides.
 * Canonical units N, mm, MPa.
 *
 * Checks (AISC 360-16 and Appendix 3; AISC DG7 top-flange tie principles; clause numbers beyond the chapters partial):
 * the girder plate in axial force with the in-plane friction moment and the vertical-movement moment (H1-1, E3 with
 * K = 1.2 over the clear span), its fillets to the flange (elastic weld group), the bolts (shear, bearing on the plate and
 * on the slot sides, J3.10), the shelf (net section through the slots, D2/J4.1) and its fillets to the column, the upper
 * shaft under the shelf (J10.1, J10.2, J10.3), the slot travel, the fit, and fatigue: the plate at the end of its
 * longitudinal flange welds (Table A-3.1 Section 4, E or E′), the plate fillet throats (Category F), the shelf root
 * (A-3.1 item 5.4 with R_FIL) and the girder flange at the plate ends (item 7.1, in the detail register).
 */
import {aiscShapeByName} from '../data/aiscSections';
import {available} from './aiscStrength';
import {boltCapacity,boltProperties,compressionResistance,parallelWeldGroup,plateMember,transverseFilletFatigue} from './connectionStrength';
import {wrenchClearance} from './endStop';
import {continuousBearings} from './endBearingInputs';
import {categoryF,finiteLife} from './fatigueConstants';
import {independentBearings} from './simpleSupports';
import {activeStep} from './steppedColumnInputs';
import {latexNumber,withinLimit} from './math';
import {format} from './units';
import type {CalculationSnapshot,CheckResult,ProjectInput} from './types';
import type {RunwayDetails} from './runwayDetails';

const inch=25.4,sixteenth=inch/16;
const up=(v:number,step=inch/16)=>Math.ceil(v/step-1e-9)*step;
const down=(v:number,step=inch/4)=>Math.floor(v/step+1e-9)*step;
/** Upper-bound friction of the sleeves on the slot sides (unpainted steel on steel; the AISC J3.8 Class B coefficient), as the column-end slide. */
export const stepPlateFriction=.5;
export type StepPlateInput=NonNullable<RunwayDetails['brace']['stepPlate']>;
export const isStepPlateTie=(p:{details?:RunwayDetails})=>p.details?.brace.arrangement==='step-plate';
/** The step tie plate applies: the arrangement on a stepped column, a rolled girder. */
export const activeStepPlate=(p:ProjectInput)=>isStepPlateTie(p)&&!!activeStep(p)&&p.section.kind!=='cap'?p.details!.brace.stepPlate:undefined;
/** Default proportions where the configurator first sets the arrangement (sized by sizeStepPlate). */
export const defaultStepPlate:StepPlateInput={plate:{thickness:inch,width:10*inch},shelf:{thickness:inch,projection:5*inch},weld:5/16*inch,
 bolts:{diameter:.875*inch,grade:'A325',rows:2,columns:1},travel:.25*inch,sleeveWall:.25*inch};

/**
 * Geometry, mm: y across the runway from the girder web toward the column, x along the runway from each tie station,
 * z up from the girder bottom.
 */
export function stepPlateGeometry(p:ProjectInput){
 const t=activeStepPlate(p),s=activeStep(p),c=p.existingColumn;if(!t||!s||!c)return undefined;
 const b=p.section,shape=aiscShapeByName(b.catalogueId??''),kdes=shape?shape.kdes*inch:b.tf;
 // The face of the upper shaft's inner flange (stepGeometry tieDistance: the girder web to that face).
 const up0=s.upper,offset=s.offset,face=s.girderOffset-(-offset+up0.d/2);
 const y0=b.tw/2+Math.max(0,kdes-b.tf)+inch/4,tip=b.bf/2,plateEnd=face-inch/2;
 const bolt=boltProperties(t.bolts.grade,t.bolts.diameter),db=t.bolts.diameter,sleeve=db+2*t.sleeveWall+sixteenth,plateHole=sleeve+sixteenth;
 const slotWidth=sleeve+sixteenth,slotLength=slotWidth+2*t.travel,edge=up(Math.max(1.5*db,1.25*plateHole/2+plateHole/2),inch/8),pitch=up(Math.max(3*db,plateHole+inch/2),inch/4);
 // Bolt rows across the runway from the plate's outer end inward; columns along the runway.
 const rows=Array.from({length:t.bolts.rows},(_,i)=>plateEnd-edge-i*pitch),columns=Array.from({length:t.bolts.columns},(_,i)=>i*pitch);
 const shelfStart=face-t.shelf.projection,shelfWidth=down(up0.bf-inch),head=1.0*db+inch/8;
 // Stations: each girder end (simple spans), the plate from 1/4 in inside the girder end toward the span, so the bolts at
 // its center stay near the column web; each support of a continuous girder, the plate centered on it. The shelf,
 // centered on the column web, takes both girder ends at a shared grid.
 const bearings=p.system==='simple'?independentBearings(p).map(v=>({station:v.station,end:v.end as 'left'|'right'|undefined,start:v.start,finish:v.finish})):continuousBearings(p).map(v=>({station:v.station,end:undefined,start:v.start,finish:v.finish}));
 const stations=bearings.map(v=>{
  const w=t.plate.width,from=v.end==='left'?v.start+inch/4:v.end==='right'?v.finish-inch/4-w:v.station-w/2,to=from+w,center=(from+to)/2;
  // The bolt group at the plate's center, moved toward the grid where the shelf needs it (within the plate's edge distance).
  const lim=Math.max(0,shelfWidth/2-slotLength/2-edge-(t.bolts.columns-1)*pitch/2),inPlate=Math.max(0,w/2-edge-(t.bolts.columns-1)*pitch/2);
  const xc=Math.min(center+inPlate,Math.max(center-inPlate,Math.min(v.station+lim,Math.max(v.station-lim,center))));
  return {station:v.station,center,from,to,girderEnd:v.end==='left'?v.start:v.end==='right'?v.finish:undefined,bolts:columns.map(cx=>xc-(t.bolts.columns-1)*pitch/2+cx),
   /** Bolt group off the plate's center (its in-plane moment P·e on the plate and its flange welds) and off the column web (on the shelf). */
   eccentricity:Math.abs(xc-center),shelfOffset:Math.abs(xc-v.station)};
 });
 return {t,b,face,y0,tip,plateEnd,edge,pitch,rows,stations,shelfStart,shelfWidth,sleeve,plateHole,slotWidth,slotLength,head,bolt,db,
  /** Clear span of the tie between the flange tip and the column face (the vertical movement bends it over this length). */
  span:face-tip,
  /** Lever of the friction force along the runway about the flange tip (bolt centroid) and about the column face. */
  armGirder:rows.reduce((a,v)=>a+v,0)/rows.length-tip,armColumn:face-rows.reduce((a,v)=>a+v,0)/rows.length,
  /** Weld length of each plate edge fillet along the flange (across the runway), and the plate's net width at a bolt column. */
  weldLength:tip-y0,netWidth:t.plate.width-t.bolts.columns*(plateHole+sixteenth),
  elevation:{plateTop:b.d-b.tf,plateBottom:b.d-b.tf-t.plate.thickness,shelfBottom:b.d-b.tf-t.plate.thickness-t.shelf.thickness},
  wrench:wrenchClearance(db),upper:{bf:up0.bf,tf:up0.tf,tw:up0.tw,d:up0.d,kdes:(aiscShapeByName(up0.shape)?.kdes??up0.tf/inch)*inch,Fy:up0.Fy}};
}
export type StepPlateGeometry=NonNullable<ReturnType<typeof stepPlateGeometry>>;

/** The tie's member for the bracing checks (braceSystem): the girder plate over its clear span, K = 1.2 (fixed at the flange, guided at the shelf). */
export function stepPlateBraceSystem(p:ProjectInput){
 const g=stepPlateGeometry(p);if(!g)return undefined;
 const m=p.details!.material,E=p.section.E,t=g.t.plate,L=Math.max(g.span,t.thickness);
 const plate=plateMember(t.width,t.thickness,L,E,m.Fy,m.Fu,Math.max(g.netWidth,1),p.method),bucklingLength=1.2*L;
 const member={...plate,bucklingLength,compression:compressionResistance(plate.A,plate.r,bucklingLength,E,m.Fy,p.method)};
 // In series: the plate over its span and the shelf over its projection, in axial strain; the bolts in bearing taken rigid.
 const stiffness=1/(L/(E*plate.A)+g.t.shelf.projection/(E*g.shelfWidth*g.t.shelf.thickness));
 return {member,cos:1,connectionK:Infinity,stiffness,plies:1,capacity:Math.min(member.tension,member.compression.capacity),
  /** Hole play across the runway: the sleeve in the plate's standard hole and in the slot's width. */
  play:2*sixteenth};
}

const compared=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,refs:string[]):CheckResult=>({id,group:'Step tie plate',title,demand,capacity,quantity,
 utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,referenceIds:refs});

export interface StepPlateMovements {
 /** Factored along-runway movement the slots take (θ·d, thermal, twist), the vertical movement (static and per crane pass). */
 longitudinal:number;vertical:number;cyclicVertical:number;
 /** Sustained tie force between crane passes, for the friction range. */
 sustained:number;
}
/**
 * The step tie plate's checks for the factored tie force F (the concurrent grid force with the Appendix 6 brace force,
 * as the bar ties take it), its range ΔF and the movements (tieMovements).
 */
export function stepPlateChecks(s:CalculationSnapshot,x:{force:number;range:number;move:StepPlateMovements}):CheckResult[]{
 const p=s.input,g=stepPlateGeometry(p);if(!g)return [];
 const d=p.details!,m=d.material,E=p.section.E,u=p.units,method=p.method,t=g.t,refs=['aisc-connections','aisc-d','aisc-h','dg7-columns','tieback-practice'];
 const L=(v:number)=>format(v,'length',u,3),F=(v:number)=>format(v,'force',u,3),S=(v:number)=>format(v,'stress',u,3),M=(v:number)=>format(v,'moment',u,3);
 const checks:CheckResult[]=[],P=x.force,mu=stepPlateFriction,tp=t.plate.thickness,wp=t.plate.width,ts=t.shelf.thickness,ws=g.shelfWidth;
 const cycles=d.spectrum.reduce((n,v)=>n+v.cycles,0),n=t.bolts.rows*t.bolts.columns;
 // Vertical movement over the clear span, both ends fixed (the flange and the shelf at the bolts): M = 6EIΔ/L².
 const Ip=wp*tp**3/12,Mv=(delta:number)=>6*E*Ip*delta/g.span**2,Mvert=Mv(x.move.vertical),MvertC=Mv(x.move.cyclicVertical);
 // Friction along the runway at the slots while the girder end slides: at most μF (upper bound), about the flange tip.
 const fr=mu*P,ecc=Math.max(0,...g.stations.map(v=>v.eccentricity)),offs=Math.max(0,...g.stations.map(v=>v.shelfOffset)),Min=fr*g.armGirder+P*ecc;
 // 1. Girder plate: axial force with the in-plane and vertical moments (H1-1); the moments are displacement or
 // friction bounded (no amplification).
 const bs=stepPlateBraceSystem(p)!,Pc=bs.member.compression.capacity,Pt=bs.member.tension;
 const Mcx=available(m.Fy*tp*wp**2/4,method,.9,1.67),Mcy=available(m.Fy*wp*tp**2/4,method,.9,1.67);
 const h1=(Pr:number,cap:number)=>{const r=Pr/cap,mm=Min/Mcx+Mvert/Mcy;return r>=.2?r+8/9*mm:r/2+mm;};
 const H1=Math.max(h1(P,Pc),h1(P,Pt));
 checks.push(compared('step-plate-strength','Step tie plate · axial force with friction and vertical movement (H1-1)',H1,1,'ratio','\\frac{P_r}{P_c}+\\frac89\\left(\\frac{\\mu P_ra_g}{M_{cx}}+\\frac{6EI\\Delta_v/L^2}{M_{cy}}\\right)\\le1',
  `Girder plate PL ${L(tp)} × ${L(wp)} (F_y = ${S(m.Fy)}), clear span L = ${L(g.span)} from the flange tip to the column face: P_r = ${F(P)} either way; P_c = ${F(Pc)} (E3, weak axis, K = 1.2: fixed at the flange, guided at the shelf), tension ${F(Pt)} (D2, net width ${L(g.netWidth)} at the bolts). Sliding along the runway the sleeves carry at most μP_r = ${F(fr)} (μ = ${mu}, upper bound) at ${L(g.armGirder)} beyond the flange tip${ecc>1?`, with the tie force ${L(ecc)} off the plate's center (the bolts moved toward the column web to stay on the shelf)`:''}: ${M(Min)} in the plate's plane against φM_n = ${M(Mcx)}. The girder end's vertical movement relative to the upper shaft, ${L(x.move.vertical)} (every crane with impact, the step's rotation over the tie distance and the cap flexure), over L with both ends fixed: ${M(Mvert)} about the weak axis against ${M(Mcy)}. Displacement- and friction-bounded moments, not amplified.`,refs));
 // 2. Plate fillets to the flange: two lines across the runway, the force along them, the friction across them and its moment.
 let weldU=Infinity,weld:ReturnType<typeof parallelWeldGroup>|undefined;
 try{weld=parallelWeldGroup({length:g.weldLength,gauge:wp,size:t.weld,Fexx:m.Fexx,method,vx:fr,vy:P,normal:0,mx:0,my:0,mz:fr*(g.armGirder+g.weldLength/2)+P*ecc});weldU=weld.utilization;}catch{weldU=Infinity;}
 checks.push(compared('step-plate-weld','Step tie plate · fillets to the girder flange',weldU,1,'ratio','f_w=\\left|\\frac{V}{A_w}+\\frac{Tr}{J}\\right|\\le\\phi0.6F_{EXX}',
  `${L(t.weld)} fillets along both plate edges across the runway, ${L(g.weldLength)} each from clear of the web fillet to the flange tip, ${L(wp)} apart: the tie force ${F(P)} along them, the friction ${F(fr)} across them with its moment about the weld group (elastic weld group, no directional strength increase).${weld?` Peak ${S(weld.demand)} against ${S(weld.capacity)}.`:' The fillets are shorter than four legs.'}`,refs));
 // 3. Bolts: shear (the bolt alone, threads included), bearing of the sleeves on the plate's standard hole and on the slot sides.
 const V=Math.hypot(P,fr)/n,bc=boltCapacity({grade:t.bolts.grade,diameter:g.db,planes:1,surface:'A',shear:V,tension:0,method});
 const clearPlate=Math.min(g.edge-g.plateHole/2,g.pitch-g.plateHole),plateB=available(Math.min(1.2*Math.max(clearPlate,0)*tp*m.Fu,2.4*g.sleeve*tp*m.Fu),method,.75,2);
 const clearShelf=Math.min(g.rows[g.rows.length-1]-g.shelfStart-g.slotWidth/2,g.pitch-g.slotWidth);
 const slotB=available(Math.min(1.0*Math.max(clearShelf,0)*ts*m.Fu,2.0*g.sleeve*ts*m.Fu),method,.75,2);
 checks.push(compared('step-plate-bolts','Step tie plate · sleeved bolts in shear and bearing (J3.6, J3.10)',Math.max(V/bc.shear,V/plateB,V/slotB),1,'ratio','\\frac{\\sqrt{P^2+(\\mu P)^2}}{n}\\le\\min(\\phi r_{nv},\\ \\phi r_{n,plate},\\ \\phi r_{n,slot})',
  `${n} - ${L(g.db)} ${t.bolts.grade} (${t.bolts.rows} row${t.bolts.rows>1?'s':''} across × ${t.bolts.columns} along the runway, ${L(g.pitch)} pitch) pretensioned against steel sleeves (${L(g.sleeve)} OD) through a standard hole in the girder plate and long slots ${L(g.slotWidth)} × ${L(g.slotLength)} along the runway in the shelf: ${F(V)} per bolt (the tie force with the friction) against shear ${F(bc.shear)} (bolt alone, threads included), sleeve bearing on the plate ${F(plateB)} (1.2l_ctF_u ≤ 2.4d_stF_u) and on the slot sides ${F(slotB)} (long slot perpendicular to the force, 1.0l_ctF_u ≤ 2.0d_stF_u).`,refs));
 // 4. Shelf: net section along the column face through the slots; its fillets to the column (two lines, top and bottom).
 const holesInRow=2*t.bolts.columns,shelfNet=(ws-holesInRow*g.slotLength)*ts,shelfT=Math.min(available(m.Fy*ws*ts,method,.9,1.67),available(m.Fu*Math.max(shelfNet,0),method,.75,2));
 const throat=t.weld/Math.SQRT2,q=(Fn:number,Mz:number,Fx:number,Mvv:number)=>Math.hypot(Fn/(2*ws)+Mvv/(ts*ws)+Mz*(ws/2)/(2*ws**3/12),Fx/(2*ws)),phiW=available(.6*m.Fexx*throat,method,.75,2);
 const qs=q(P,fr*g.armColumn+P*offs,fr,Mvert);
 checks.push(compared('step-plate-shelf','Column shelf · net section through the slots and fillets to the column',Math.max(P/shelfT,qs/phiW),1,'ratio','P\\le\\min(\\phi F_yA_g,\\ \\phi F_uA_n);\\quad q=\\frac{P}{2w_s}+\\frac{M_v}{t_sw_s}+\\frac{M_ra}{I}\\le\\phi0.6F_{EXX}t_e',
  `Shelf PL ${L(ts)} × ${L(ws)} along the runway × ${L(t.shelf.projection)}, centered on the upper shaft's web: the line through the slots of both girder ends keeps A_n = ${format(Math.max(shelfNet,0),'area',u,3)} (tension ${F(shelfT)}). ${L(t.weld)} field fillets top and bottom along ${L(ws)}: the tie force normal to the face, the vertical-movement moment ${M(Mvert)} as a couple over the shelf thickness and the friction ${F(fr)} with its moment at ${L(g.armColumn)}: ${format(qs,'lineForce',u,3)} against ${format(phiW,'lineForce',u,3)} (no directional strength increase).`,refs));
 // 5. The upper shaft under the shelf (J10.1 tension, J10.2, J10.3 compression), the shelf centered on its web.
 const up0=g.upper,lb=ts,Fy=up0.Fy,j101=available(6.25*Fy*up0.tf**2,method,.9,1.67),j102=available(Fy*up0.tw*(5*up0.kdes+lb),method,1,1.5);
 const j103=available(.8*up0.tw**2*(1+3*(lb/up0.d)*(up0.tw/up0.tf)**1.5)*Math.sqrt(E*Fy*up0.tf/up0.tw),method,.75,2);
 checks.push(compared('step-plate-column','Upper shaft under the shelf · flange bending, web yielding and crippling (J10.1–J10.3)',Math.max(P/j101,P/j102,P/j103),1,'ratio','P\\le\\min(\\phi6.25F_{yf}t_f^2,\\ \\phi F_{yw}t_w(5k+l_b),\\ \\phi R_{n,J10.3})',
  `The shelf spans ${L(ws)} across the inner flange, centered on the web (J10.1 applies over at least 0.15b_f): flange local bending ${F(j101)} (tension), web local yielding ${F(j102)} (k = ${L(up0.kdes)}, l_b = t_s = ${L(lb)}), web crippling ${F(j103)} (compression; the shelf more than d from the shaft ends) against P = ${F(P)}, the grid's concurrent tie force (both girder ends at a shared grid on the one shelf).`,['aisc-j',...refs]));
 // 6. Slot travel along the runway, and the fit.
 const need=x.move.longitudinal+sixteenth;
 checks.push(compared('step-plate-travel','Step tie plate · slot travel along the runway',need,t.travel,'length','u\\ge\\theta d+\\alpha L\\Delta T+\\Delta_s+1/16\\,\\mathrm{in}',
  `The girder end moves ${L(x.move.longitudinal)} along the runway (factored end rotation about the bearing over the girder depth, thermal travel at a sliding end, the column twist movement), plus the 1/16 in positioning allowance, each way: the slots give ${L(t.travel)} each way.`,refs));
 const st=g.stations,innerBolt=g.rows[g.rows.length-1],shelfFit=Math.max(0,...st.flatMap(v=>v.bolts.map(xb=>(Math.abs(xb-v.station)+g.slotLength/2+g.edge)/(ws/2))));
 const fit=Math.max(shelfFit,(g.tip+g.head+inch/4)/innerBolt,(g.wrench+t.weld)/Math.max(g.face-g.rows[0],1e-6),(g.face-innerBolt+g.slotWidth/2+g.edge)/t.shelf.projection,(g.y0+4*t.weld)/g.tip);
 checks.push(compared('step-plate-fit','Step tie plate · bolts beyond the flange tip, within the shelf and clear of the column face',fit,1,'ratio','y_b-r_h\\ge b_f/2;\\ |x_b|+\\tfrac{L_{slot}}{2}+e\\le\\tfrac{w_s}{2};\\ C_1\\le y_f-y_b',
  `Bolt heads on the girder plate beyond the flange tip (innermost bolt ${L(innerBolt)} from the web, head and washer radius ${L(g.head)}, the tip at ${L(g.tip)}); every slot with its edge distance within the shelf (${L(ws)} wide, the upper flange ${L(up0.bf)} less 1 in); the nuts under the shelf clear of the column face and the shelf fillet (C₁ = ${L(g.wrench)}); the bolt rows with the slot edge distance within the shelf projection; the flange welds at least four legs long. The plate starts 1/4 in inside the girder end (simple spans) or is centered on the support (continuous); the tie-side bearing stiffener under it is fitted to its underside.`,refs));
 // 7. Fatigue at the all-cycle count: the plate at the end of its flange welds; the fillet throats; the shelf root.
 const dF=x.range,frR=2*mu*(x.move.sustained+dF),cat=tp<=inch?'E':'E1',Cf=cat==='E'?11:3.9;
 const plateR=dF/(tp*wp)+(frR*g.armGirder+dF*ecc)/(tp*wp**2/6)+6*MvertC/(wp*tp**2),FSRp=finiteLife(Cf,cycles);
 checks.push(compared('step-plate-fatigue','Step tie plate · fatigue at the end of its flange welds',plateR,FSRp,'stress','f_{sr}=\\frac{\\Delta F}{A}+\\frac{\\Delta(\\mu F)a_g}{S_x}+\\frac{6\\Delta M_v}{w_pt_p^2}\\le F_{SR}',
  `Base metal of the girder plate where its longitudinal fillets to the flange end at the flange tip (AISC Table A-3.1 Section 4, longitudinally welded end connection: Category ${cat==='E'?'E':'E′'} for t ${cat==='E'?'≤':'>'} 1 in; item number to be verified), all ${cycles.toLocaleString('en-US')} cycles without threshold credit: tie force range ${F(dF)}, the friction range 2μ(F_s + ΔF) = ${F(frR)} in plane at ${L(g.armGirder)}, and the vertical movement per crane pass ${L(x.move.cyclicVertical)} (${M(MvertC)}): f_sr = ${S(plateR)} against F_SR = ${S(FSRp)}.`,['aisc-fatigue',...refs]));
 let weldR=Infinity;try{weldR=parallelWeldGroup({length:g.weldLength,gauge:wp,size:t.weld,Fexx:m.Fexx,method,vx:frR,vy:dF,normal:0,mx:0,my:0,mz:frR*(g.armGirder+g.weldLength/2)+dF*ecc}).demand;}catch{weldR=Infinity;}
 const FSRf=categoryF(cycles),qR=q(dF,frR*g.armColumn+dF*offs,frR,MvertC)/throat,rootR=(dF/(ws*ts)+6*MvertC/(ws*ts**2)),rootCap=transverseFilletFatigue(ts,t.weld,cycles).capacity;
 checks.push(compared('step-plate-weld-fatigue','Step tie plate and shelf fillets · throat and root fatigue',Math.max(weldR/FSRf,qR/FSRf,rootR/rootCap),1,'ratio','f_{sr}\\le F_{SR}\\ \\text{(Cat. F throat; shelf root with }R_{FIL})',
  `Throat stress ranges (Category F, F_SR = ${S(FSRf)}): the plate's flange fillets ${S(weldR)}, the shelf's column fillets ${S(qR)}, from the tie force range ${F(dF)}, the friction range ${F(frR)} and the vertical movement per crane pass. The shelf at its load-carrying fillets to the column (AISC A-3.1 item 5.4, R_FIL for the unfused root): ${S(rootR)} against ${S(rootCap)}. The girder flange at the plate ends is in the detail register (Category by the plate width along the runway, item 7.1).`,['aisc-fatigue',...refs]));
 return checks;
}

/** Fatigue register points of the girder flange at the step tie plates (item 7.1 by the plate width w_p along the runway and its thickness). */
export function stepPlateFatigueDetails(p:ProjectInput){
 const g=stepPlateGeometry(p);if(!g)return [];
 const a=g.t.plate.width,tb=g.t.plate.thickness,category=a<2*inch?'C' as const:a<=Math.min(12*tb,4*inch)?'D' as const:tb<=.8*inch?'E' as const:'E1' as const;
 return g.stations.flatMap((v,i)=>[v.from,v.to].filter(xx=>xx>1&&xx<p.spans.reduce((s,l)=>s+l,0)-1).map((xx,k)=>({id:`TP${i}-${k}`,name:`Step tie plate ${i+1} · end ${k+1} of the plate under the top flange`,x:xx,point:'top-right' as const,category,
  reference:`AISC Table A-3.1 item 7.1, Category ${category==='E1'?'E′':category} for a ${(a/inch).toFixed(2)} in plate along the runway, ${(tb/inch).toFixed(3)} in thick, welded under the top flange at the column step (item number to be verified)`})));
}
