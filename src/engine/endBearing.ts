import {seatSettingTolerance,slidingClearance} from './fitTolerances';
import type {CheckResult,DesignAnalysis,ProjectInput} from './types';
import {available} from './aiscStrength';
import {boltCapacity,boltProperties,plateBearing} from './connectionStrength';
import {defaultEndBearing} from './endBearingInputs';
import {simpleSupportInput,endGridCentered} from './simpleSupports';
import {weldedRibBracket} from './bracketRib';
import {wrenchClearance} from './endStop';
import {aiscShapeByName} from '../data/aiscSections';
import {format} from './units';
import {snugTightNotPermitted} from './boltingBasis';
import {latexNumber,withinLimit} from './math';
import {usesRolledBracket,rolledSeatChecks,endGridFitChecks} from './rolledBracket';
import {usesTaperedHaunch,haunchSeatChecks} from './taperedHaunch';
import {slidingBolts,continuousBearings,continuousEndCentered,type EndBearingInput} from './endBearingInputs';
import {activeColumnCap} from './columnCapInputs';
import {sleeveLength} from './quarterInch';
import {usesExistingBracket} from './existingBracket';
import {supportReactions} from './supportReactions';
import {sectionProperties} from './section';
import {girderStrength,concentratedResistance} from './aiscStrength';
import {locatingSupport} from './endBearingInputs';
import {craneDesignMinimum} from './aistLoads';
import {capAngleGeometry,capBoltNutEnvelope} from './capAngle';
import {boxClearance,coordinationAllowance} from './connectionCoordination';
export {endBearingSchema,defaultEndBearing,activeEndBearing,slidingBolts,continuousBearings,continuousEndCentered,locatingSupport,type EndBearingInput} from './endBearingInputs';

const inch=25.4;
/**
 * Bolt and slot geometry measured from the bearing plate end along the runway
 * (x), which is the girder end on simple spans, and from the web centerline
 * across it. Rib positions are the bracket ribs under this bearing at a
 * runway-end grid and at an interior grid.
 */
export function endBearingGeometry(p:ProjectInput,e:EndBearingInput){
 const d=p.details!,bs=d.bearing,travel=simpleSupportInput(p).guideTravel,gap=p.system==='continuous'?0:simpleSupportInput(p).endGap,db=e.bolts.diameter,hole=boltProperties(e.bolts.grade,db).hole;
 const sl=slidingBolts(e),sleeved=sl.mode==='sleeved';
 // Sleeved bolts: the slot clears a steel sleeve one bore plus two walls in diameter, which the bolt is pretensioned against.
 // The sleeve is cut to a 1/16 in length at least the flange plus the clearance (the length the drawings print).
 const sleeve=sleeved?{od:hole+2*sl.wall,length:sleeveLength(p.section.tf+sl.clearance),area:Math.PI/4*((hole+2*sl.wall)**2-hole**2)}:undefined;
 const slotWidth=sleeve?sleeve.od+1.5875:hole;
 const rows=[e.bolts.edge,bs.length-e.bolts.edge],stiffener=bs.length/2,slot=slotWidth+2*travel;
 // A plate washer centered on the bolt covers the slot as installed (AISC J3.2), lapping 1/4 in past each slot end. The
 // washer moves with the bolt, fixed in the seat, so it keeps its clearance to the girder's stiffener at either extreme
 // of travel (end-bearing-washer-stiffener).
 const washer={length:slotWidth+2*travel+12.7,width:Math.max(2.5*db,slotWidth+25.4),thickness:e.washerThickness};
 // Simple spans: the girder end is at the grid on a runway end (or, with endGridBearing 'centered', half the bearing
 // length past it, the bearing centered on the web), half the gap from it at a shared grid. A continuous girder ends
 // at the runway-end grids and is centered on the interior ones.
 const b=d.bracket?.enabled?d.bracket:undefined,centered=b?[bs.length/2-b.ribSpacing/2,bs.length/2+b.ribSpacing/2]:[];
 const ribs=weldedRibBracket(b)&&b?p.system==='continuous'?continuousEndCentered(p)?centered:[b.ribSpacing/2,...centered]:endGridCentered(p)?[...centered,b.ribSpacing/2-gap/2]:[b.ribSpacing/2,b.ribSpacing/2-gap/2]:[];
 return {rows,stiffener,slot,slotWidth,sleeve,sleeved,hole,washer,travel,ribs,spacing:rows[1]-rows[0]};
}

const compared=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,referenceIds=['aisc-connections','tr13-girder']):CheckResult=>({id,group:'End bearings',title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,referenceIds});
const byOthers=(id:string,title:string,note:string):CheckResult=>({id,group:'End bearings',title,status:'excluded',equation:'',note,referenceIds:['aisc-connections']});

/**
 * Locating end: pretensioned slip-critical bolts in standard holes take the
 * longitudinal force with the bottom-flange tie force and uplift. Sliding end:
 * bolts pretensioned against steel sleeves (AIST TR-13 §5.14, RCSC §4.2) leave
 * the flange free to slide; the sleeves carry the transverse force in bearing on
 * the slot sides and plate washers hold the flange down. Snug-tight bolts are not
 * permitted on the runway under cyclic crane load. A continuous girder locates
 * at one support and slides at the others, whose slots take the thermal travel
 * from the locating support.
 */
export function endBearingChecks(p:ProjectInput,e:EndBearingInput,ctx:{analysis:DesignAnalysis;lateral:number}):CheckResult[]{
 const d=p.details!,b=p.section,bs=d.bearing,m=d.material,method=p.method,u=p.units,f=(v:number)=>format(v,'length',u,3);
 const supports=continuousBearings(p),locates=supports.find(v=>v.role==='LOCATING'),LE=locates?`Locating support (grid ${locates.grid})`:'Locating end',SE=locates?'Sliding supports':'Sliding end';
 const g=endBearingGeometry(p,e),db=e.bolts.diameter,C=wrenchClearance(db),gauge=e.bolts.gauge,n=4;
 const axial=ctx.analysis.axial,uplift=ctx.analysis.uplift,H=ctx.lateral;
 const V=Math.hypot(axial,H)/n,T=uplift/n,Vs=H/n;
 // The locating slip passes through the bearing-plate-to-seat interface: Class A where the seat is not shop-prepared with
 // the bearing (existing, by others or field welded, or shimmed), and the J3.8 filler factor for the shim plies.
 const seat=bearingSeat(p),shim=bearingShim(p),surface=bearingSurface(p),hf=shim.plies>=2?.85:1,fill=fillerShearFactor(shim.max);
 const locating=boltCapacity({grade:e.bolts.grade,diameter:db,planes:1,surface,shear:V,tension:T,method});
 const sliding=boltCapacity({grade:e.bolts.grade,diameter:db,planes:1,surface,shear:Vs,tension:T,method});
 const shimText=shim.max>0?` Steel shims under the bearing plate, up to ${f(shim.max)} in at most ${shim.plies} ${shim.plies>1?'plies':'ply'}, full bearing, drilled to the bolt pattern.`:'';
 const surfaceText=surface==='A'?`Class A faying surfaces (μ = 0.30) at the bearing-plate-to-seat interface: the seat is ${seat==='by-others'?'by others':seat==='existing'?'an existing bracket':seat==='field'?'field welded to the existing column':'shimmed'}, so its faying surface is not shop blast-cleaned with the bearing (clean mill scale or a qualified Class A coating; remove paint and loose scale at the bearing footprint).`:'Class B faying surfaces (μ = 0.50): the shop-welded seat and the bearing plate are blast-cleaned in the shop.';
 const shape=aiscShapeByName(b.catalogueId??''),k1=b.tw/2+(shape?shape.kdes*inch-b.tf:0);
 const tMin=(T:number,bPrime:number,pw:number,Fu:number)=>Math.sqrt(4*T*Math.max(bPrime,0)/available(pw*Fu,method,.9,1.67));
 const flangeB=gauge/2-b.tw/2,flangeP=Math.min(g.spacing,3.5*flangeB);
 const stiffClear=Math.min(...g.rows.map(x=>Math.abs(x-g.stiffener)))-bs.stiffenerThickness/2-bs.weldSize;
 const force=`Factored longitudinal force ${format(axial,'force',u,3)} (traction or crane stop, AIST combinations), bottom-flange tie force ${format(H,'force',u,3)} and uplift ${format(uplift,'force',u,3)}, shared by four bolts.`;
 const checks:CheckResult[]=[
  compared('end-bearing-locating-slip',`${LE} · slip-critical bolts`,V,hf*locating.slip,'force','R_n=\\mu D_uh_fT_bn_sk_{sc}',`${force} Pretensioned; ${surfaceText} One slip plane in series (flange to plate, plate to seat), k_sc = ${locating.slipReduction.toFixed(3)} for uplift tension, h_f = ${hf.toFixed(2)} (AISC J3.8: ${shim.plies>=2?'two or more undeveloped filler plies':shim.plies===1?'one filler':'no fillers'}). Standard holes in all plies.${shimText}`),
  compared('end-bearing-locating-shear',`${LE} · bolt shear`,V,fill*locating.shear,'force','V=\\sqrt{P^2+H^2}/4\\le\\phi F_{nv}A_b',`${force} One shear plane at each ply interface; threads included.${shim.max>6.35?` Fillers thicker than 1/4 in: the shear strength is multiplied by 1 − 0.4(t − 0.25) = ${fill.toFixed(3)} for the ${f(shim.max)} shim stack (AISC J5.2a).`:''}`),
  compared('end-bearing-locating-tension',`${LE} · bolt tension with shear`,T,locating.tension,'force','T=R_{up}/4\\le\\phi F^\\prime_{nt}A_b',force),
  compared('end-bearing-flange-bearing','Girder flange · bolt bearing / tearout',V,plateBearing(db,g.hole,b.tf,b.Fu,g.rows[0],g.spacing,method).capacity,'force','R_n=\\min(1.2l_ctF_u,2.4dtF_u)',locates?'Clear distance to the bearing plate end, taken as a girder end; the force reverses with traction.':'Clear distance to the girder end controls; the force reverses with traction.'),
  compared('end-bearing-plate-bearing','Bearing plate · bolt bearing / tearout',V,plateBearing(db,g.hole,bs.thickness,m.Fu,e.bolts.edge,g.spacing,method).capacity,'force','R_n=\\min(1.2l_ctF_u,2.4dtF_u)','Bearing plate ends control.'),
  compared('end-bearing-sliding',`${SE} · bolts in bearing`,Math.hypot(Vs/Math.max(fill*sliding.shear,1e-9),T/Math.max(sliding.tension,1e-9)),1,'ratio','\\sqrt{(V/\\phi R_{nv})^2+(T/\\phi R_{nt})^2}\\le1',`${g.sleeved?'Bolts pretensioned against steel sleeves; the sleeves bear on the slot sides for the transverse tie force and the plate washers take the uplift into the bolts':'Snug-tight bolts with double nuts in long slots carry the transverse tie force in bearing and the uplift in tension'}; no longitudinal force. ${force}`),
  compared('end-bearing-flange-prying','Girder bottom flange · thickness for no prying (ratio t_min/t)',tMin(T,flangeB-db/2,flangeP,b.Fu),b.tf,'length','t_{min}=\\sqrt{\\frac{4Tb^\\prime}{\\phi pF_u}}',`Flange cantilevers from the web: b = ${f(flangeB)}, p = ${f(flangeP)}.`),
  ...(g.sleeve?[
   compared('end-bearing-sleeve',`${SE} · sleeves under bolt pretension`,1.5*sliding.pretension,m.Fy*g.sleeve.area,'force','1.5T_b\\le\\phi F_yA_g;\\ \\phi=1.0\\ \\text{(sleeve)}',`Steel sleeve ${f(g.sleeve.od)} OD × ${f(g.hole)} bore × ${f(g.sleeve.length)} long, F_y as the plate material. 1.5 × minimum pretension bounds turn-of-nut overshoot (RCSC commentary). AIST TR-13 §5.14 and RCSC §4.2: runway connections under cyclic crane load are pretensioned; the sleeve takes the clamp so the flange still slides.`),
   compared('end-bearing-sleeve-length',`${SE} · sleeve projects above the flange`,inch/32,g.sleeve.length-b.tf,'length','L-t_f\\ge1/32\\,\\mathrm{in}\\ \\ \\text{(sleeve)}','Cut each sleeve to the measured flange thickness plus the clearance, so the plate washer clears the flange.'),
   compared('end-bearing-sleeve-bearing',`${SE} · flange bearing on sleeves`,Vs,available(Math.min(1.0*((b.bf-gauge)/2-g.slotWidth/2)*b.tf*b.Fu,2.0*g.sleeve.od*b.tf*b.Fu),method,.75,2),'force','R_n=\\min(1.0l_ctF_u,\\,2.0d_st_fF_u)','AISC J3.10 for long slots perpendicular to the force, with the sleeve diameter; clear distance to the flange tip.'),
   compared('end-bearing-slot-fit',`${SE} · slot length for travel`,g.slot,2.5*g.sleeve.od,'length','L_{slot}=w_{slot}+2u\\le2.5d_s',`Long slots in the girder flange for the sliding allowance ${f(g.travel)} each way, ${f(g.slotWidth)} wide for the ${f(g.sleeve.od)} sleeve. The sleeve is the fastener that bears on the slot sides, so the AISC Table J3.3 long-slot proportion (length at most 2.5 times the fastener diameter) is applied to the sleeve diameter d_s. More travel needs a larger bolt and sleeve.`),
   compared('end-bearing-washer-bending',`${SE} · plate washer under uplift`,6*(T/2)*Math.max(0,g.slotWidth/2-.8*db)/(g.washer.length*e.washerThickness**2),available(m.Fy,method,.9,1.67),'stress','f_b=\\frac{6(T/2)a}{bt^2};\\quad a=w_{slot}/2-0.8d_b','The flange bears up on the washer at both slot edges; the washer cantilevers from the bolt head.')
  ]:[
   compared('end-bearing-slot',`${SE} · slot length for travel`,g.slot,2.5*db,'length','L_{slot}=d_h+2u\\le2.5d_b',`Long-slotted holes in the girder flange per AISC Table J3.3 for the sliding allowance ${f(g.travel)} each way. The movement demand is checked against that allowance separately.`),
   snugTightNotPermitted('end-bearing-j110',`${SE} · snug-tight bolts not permitted`,'End bearings','sliding-end bearing bolts')
  ]),
  compared('end-bearing-washer',`${SE} · plate washer thickness`,5/16*inch,e.washerThickness,'length','t\\ge5/16\\,\\mathrm{in}\\ \\ \\text{(plate washer)}','AISC J3.2: plate washers cover the long slots in the outer ply.'),
  compared('end-bearing-flange-edge','Girder flange · bolt edge distance',1.5*db-g.hole/2+g.slotWidth/2,(b.bf-gauge)/2,'length','(b_f-g)/2\\ge1.5d_b-d_h/2+w_{slot}/2','Rolled flange edge; the sliding-end slot keeps the clear material of a standard hole at the J3.4 minimum.'),
  compared('end-bearing-plate-edge','Bearing plate · bolt edge distance',1.5*db,Math.min((bs.width-gauge)/2,e.bolts.edge),'length','e\\ge1.5d_b','Standard holes in the bearing plate.'),
  compared('end-bearing-end-edge','Girder end · bolt edge distance',1.5*db-g.hole/2+g.slot/2,e.bolts.edge,'length','e\\ge1.5d_b-d_h/2+L_{slot}/2','The slot extends toward the girder end at the sliding end.'),
  compared('end-bearing-spacing','Bolt spacing',8/3*db,Math.min(gauge,g.spacing),'length','s\\ge(8/3)d_b','Between rows and across the gauge.'),
  compared('end-bearing-wrench-web','Nut clearance above flange · web fillet',C,gauge/2-k1,'length','g/2-k_1\\ge C_1',shape?'k₁ from the catalog fillet.':'No fillet credited for a custom section.'),
  compared('end-bearing-wrench-stiffener','Nut clearance above flange · bearing stiffener',C,stiffClear,'length','|x_b-x_{st}|-t_{st}/2-w\\ge C_1','Bolt rows at the bearing plate ends clear the stiffeners at mid-bearing.'),
  compared('end-bearing-washer-fit','Plate washers fit on the flange',g.washer.width/2,gauge/2-k1,'length','w_w/2\\le g/2-k_1','Washers bear flat outside the web fillet.'),
  compared('end-bearing-washer-stiffener','Plate washers clear the bearing stiffener',g.washer.length/2+g.travel+slidingClearance,stiffClear,'length','b/2+u+c_f\\le|x_b-x_{st}|-t_{st}/2-w',`The washer covers the slot as installed (AISC J3.2), 1/4 in past each slot end. It moves with the bolt, which is fixed in the seat, while the girder and its stiffener slide by up to u = ${f(g.travel)}: the washer clears the stiffener weld toe at either extreme of travel, so it cannot jam the sliding end, with a margin c_f = ${f(slidingClearance)} for the fabrication tolerance of the stiffener and hole locations (AISC Code of Standard Practice §6.4) on this moving part.`)
 ];
 // Movement beyond about 1 in each way: sliding bearings with that much travel need large slots, sleeves and washers.
 {const c=simpleSupportInput(p),far=locates?Math.max(...supports.map(v=>v.distance)):Math.max(...p.spans),need=12e-6*far*Math.max(c.temperatureRise,c.temperatureFall)+b.d*ctx.analysis.endRotation+c.settingTolerance;
  if(need>inch+1e-6)checks.push({id:'end-bearing-slot-travel',group:'End bearings',title:`${SE} · movement beyond 1 in each way`,status:'unverified',demand:need,capacity:inch,quantity:'length',utilization:need/inch,equation:'\\alpha L\\Delta T+d\\theta+t_{set}\\le1\\,\\mathrm{in}',note:`The sliding bearings must move ${f(need)} each way (${locates?`the farthest sliding support ${f(far)} from the locating support`:`a ${f(far)} span`}). Beyond about 1 in of travel the slotted bearing, its sleeves and plate washers grow out of proportion: provide expansion units (a runway expansion joint with independent girders at it) or simple spans, or obtain the engineer of record's acceptance of the long-slot bearing.`,referenceIds:['tr13-girder','dg7']});}
 // A continuous girder slides at every support but the locating one, by the thermal strain over its distance from it.
 if(locates){
  const c=simpleSupportInput(p),far=Math.max(...supports.map(v=>v.distance));
  checks.push(compared('end-bearing-travel',`${SE} · movement allowance each direction`,12e-6*far*Math.max(c.temperatureRise,c.temperatureFall)+b.d*ctx.analysis.endRotation+c.settingTolerance,g.travel,'length','\\alpha L\\Delta T+d\\theta+t_{set}\\le u',`Farthest sliding support ${f(far)} from the locating support at grid ${locates.grid}; the flange slots give ${f(g.travel)} each way. Thermal coefficient ${u==='US'?'6.6667 × 10⁻⁶ /°F':'12 × 10⁻⁶ /°C'} is a stated steel modeling assumption; temperature changes are measured from erection. Reference AIST Technical Report 13 §5.8.1; AISC DG7 §11.2.`,['tr13-girder','dg7','criteria']));
 }
 const wb=d.bracket?.enabled&&weldedRibBracket(d.bracket)?d.bracket:undefined;
 if(wb){
  const ribClear=Math.min(...g.ribs.flatMap(r=>g.rows.map(x=>Math.abs(x-r))))-wb.ribThickness/2-wb.seatWeld;
  const seatB=Math.max(1e-9,ribClear+wb.seatWeld),seatP=Math.min(gauge,3.5*seatB);
  checks.push(
   compared('end-bearing-seat-bearing','Bracket seat · bolt bearing',V,plateBearing(db,g.hole,wb.seatThickness,m.Fu,Math.max(e.bolts.edge,wb.seatLength/2-g.rows[1]),g.spacing,method).capacity,'force','R_n=\\min(1.2l_ctF_u,2.4dtF_u)','Standard holes in the welded seat plate.'),
   compared('end-bearing-seat-prying','Bracket seat · thickness for no prying (ratio t_min/t)',tMin(T,seatB-db/2,seatP,m.Fu),wb.seatThickness,'length','t_{min}=\\sqrt{\\frac{4Tb^\\prime}{\\phi pF_u}}',`Seat cantilevers from the nearer rib: b = ${f(seatB)}.`),
   compared('end-bearing-wrench-rib','Nut clearance below seat · bracket ribs',C,ribClear,'length','|x_b-x_r|-t_r/2-w\\ge C_1','Both the runway-end grid and shared interior grids; ribs placed under the bearing stiffeners clear the bolt rows.'),
   compared('end-bearing-seat-fit','Bearings and bolts fit on the seat',(locates?0:simpleSupportInput(p).endGap/2)+bs.length+seatSettingTolerance,wb.seatLength/2,'length','g/2+N+t_{set}\\le L_s/2',(locates?'A runway-end bearing, and its bolts, lie on the half of the seat under the girder; interior bearings are centered on it.':'Each girder bearing, and its bolts, lie on its half of the shared seat.')+' Includes the 1/8 in bearing setting tolerance (AIST TR-13 §5.18 seat plan position ±1/8 in).'),
   ...endGridFitChecks(p,wb.seatLength/2,'the seat','L_s/2',compared)
  );
 }else if(usesRolledBracket(p))checks.push(...rolledSeatChecks(p,e,g,V,T,C,tMin,compared));
 else if(usesTaperedHaunch(p))checks.push(...haunchSeatChecks(p,e,g,V,T,C,tMin,compared));
 else if(!activeColumnCap(p))checks.push(byOthers('end-bearing-seat','Bracket seat holes and nut clearance',`The seat is by others: survey the seats, shim the bearing plates to the theoretical elevation (steel shims, full bearing, at most ${shim.plies||3} plies, ${f(shim.max||12.7)} max.), and field drill or ream the seat holes to the bearing pattern after the girder is lined and leveled; provide nut clearance below the seat and a seat that carries the bolt forces reported here.`));
 return checks;
}

/**
 * The seat the bearing plate bolts to: shop welded with a new column (a column cap, or a bracket on a new column), field
 * welded to an existing column, an existing bracket with a new seat, or a bracket by others.
 */
export function bearingSeat(p:ProjectInput):'shop'|'field'|'existing'|'by-others'{
 const b=p.details?.bracket,c=p.existingColumn;
 if(activeColumnCap(p))return 'shop';
 if(b?.enabled)return usesExistingBracket(p)?'existing':c?.enabled&&c.isNew?'shop':'field';
 return 'by-others';
}
/** Steel shims under the bearing plate (details.bearing.shim): none where absent. */
export function bearingShim(p:ProjectInput){const s=p.details?.bearing.shim,max=s?.max??0;return {max,plies:max>0?Math.max(1,s?.plies??1):0};}
/**
 * Default shims for the seat: up to 1/2 in in at most three plies on existing, by-others and field-welded seats, whose
 * elevation is only known from a survey; none on a seat shop welded to a new column.
 */
export const defaultBearingShim=(seat:ReturnType<typeof bearingSeat>)=>seat==='shop'?{max:0,plies:0}:{max:inch/2,plies:3};
/**
 * Faying surface class of the bearing plate to seat interface the locating slip passes through: Class B (blast-cleaned)
 * only where a shop-welded seat is prepared with the bearing and no shim is used; Class A (mu = 0.30, clean mill scale or
 * a qualified coating) at existing, by-others and field-welded seats and wherever shims are added.
 */
export const bearingSurface=(p:ProjectInput):'A'|'B'=>bearingSeat(p)==='shop'&&bearingShim(p).max===0?'B':'A';
/** AISC J5.2a: bolt shear through fillers thicker than 1/4 in, 1 − 0.4(t − 0.25) with t in inches (to 3/4 in). */
export const fillerShearFactor=(t:number)=>t<=inch/4+1e-9?1:Math.max(.8,1-.4*(Math.min(t,.75*inch)/inch-.25));

/**
 * The bearing plate between the girder bottom flange and the seat: J7 steel bearing on the flange footprint, and plate
 * flexure only where a strip of the plate spans. The plate is clamped between the flange and a seat that is continuous
 * under it (the welded seat plate, the W-stub or haunch flange, the column cap; a seat by others must give the same full
 * bearing), and the web and its bearing stiffeners bear along the whole plate, so no strip cantilevers along the girder.
 * Across the runway the plate cantilevers beyond the girder flange tips by a = (B - b_f)/2 where it is wider than the
 * flange, under the seat pressure f_p = R/(BN): f_b = 6(f_p a²/2)/t_p². The web local yielding and crippling at the
 * bearing are checked with the girder (support-yield, support-cripple).
 */
export function bearingPlateChecks(p:ProjectInput,reaction:number):CheckResult[]{
 const d=p.details!,bs=d.bearing,m=d.material,b=p.section,f=(v:number)=>format(v,'length',p.units,3);
 const pressure=reaction/(bs.width*bs.length),a=Math.max(0,(bs.width-b.bf)/2),contact=Math.min(bs.width,b.bf)*bs.length,fb=6*(pressure*a**2/2)/bs.thickness**2;
 const rec=(id:string,title:string,demand:number,capacity:number,equation:string,note:string):CheckResult=>({id,group:'Connections',title,demand,capacity,quantity:'stress',utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,referenceIds:['aisc-connections']});
 return [
  rec('bearing-plate','Bearing plate flexure beyond the flange tips',fb,available(m.Fy,p.method,.9,1.67),'f_b=\\frac{6m}{t_p^2};\\quad m=\\frac{f_pa^2}{2};\\quad a=\\frac{B-b_f}{2}',`PL ${f(bs.thickness)} × ${f(bs.width)} × ${f(bs.length)}: the plate is clamped between the girder flange and a seat continuous under it, and the web with its fitted bearing stiffeners bears along the whole plate, so only the strip beyond the flange tips spans: a = ${f(a)} under the seat pressure f_p = R/(BN) = ${format(pressure,'stress',p.units,3)}. The seat plate, stub or cap flange under the bearing is checked with its bracket or cap; a seat by others must give full bearing under the plate.`),
  rec('bearing-contact','Steel bearing contact',reaction/contact,available(1.8*Math.min(m.Fy,p.section.Fy),p.method,.75,2),'f_p=R/A_{pb}\\le1.8F_y;\\quad A_{pb}=\\min(B,b_f)N','AISC J7: fitted steel-to-steel contact on the girder flange footprint over the plate. No concrete/foundation resistance is evaluated.')
 ];
}

/**
 * Proportions of the bolted girder bearing for the girder, its reactions and its movement (template sizing, canonical
 * units; the full analysis checks them):
 * - slot travel u = max(1/2 in, αL_far ΔT + dθ + t_set) on the 1/16 in grid, L_far the span (simple spans) or the
 *   farthest support from the locating one (continuous), θ the factored end rotation;
 * - the bolt: the smallest from 3/4 in whose sliding slot keeps the AISC Table J3.3 long-slot proportion (L ≤ 2.5d with
 *   the sleeve as the fastener in a sleeved slot), whose locating bolts hold the longitudinal and bottom-flange forces by
 *   slip (Class and filler factor of the seat), and whose gauge fits the flange with the J3.4 edge distance;
 * - the end edge e = max(1.5d, 1.5d − d_h/2 + L_slot/2) on the 1/4 in grid;
 * - the length N, the largest of: the bolt layout (two end edges each side of the stiffener, the tightening clearance C1,
 *   or the plate washer with the travel and a 1/8 in fabrication margin, to the stiffener and its fillet, a pitch of at least 8/3 d), the J10.2/J10.3
 *   bearing length of the unstiffened end for the factored reaction (at most 12 in; at 0.9), and the flange saddle where
 *   one is used (its setback, half its length and its end fillet from the stiffener to the girder end) or the cap
 *   tieback angle's cap bolt hardware clear of the stiffener and its fillets by 1/8 in (coord-cap-tie-stiffener);
 * - the width max(b_f + 1/2 in, g + 3d) on the 1/4 in grid;
 * - the thickness from the plate flexure beyond the flange tips (bearingPlateChecks) at 0.9, at least 3/4 in, in 1/8 in steps.
 */
export function bearingLayout(p:ProjectInput,x:{rotation:number;stiffenerThickness:number;stiffenerWeld:number;saddle?:{setback:number;length:number;weld:number};endBearing?:EndBearingInput;simple?:{temperatureRise:number;temperatureFall:number;settingTolerance:number};Fy?:number;minEdge?:number;lateral?:number;surface?:'A'|'B';plies?:number;minLength?:number}){
 const b=p.section,lrfd=p.method==='LRFD',up=(v:number,step:number)=>Math.ceil(v/step-1e-9)*step,down=(v:number,step:number)=>Math.floor(v/step+1e-9)*step,q=inch/4;
 const e0=x.endBearing??defaultEndBearing,sl=slidingBolts(e0),sleeved=sl.mode==='sleeved',ss=x.simple??{temperatureRise:30,temperatureFall:30,settingTolerance:inch/8};
 // Travel each way from the farthest support's thermal strain, the end rotation over the depth and the setting tolerance.
 let g=0;const grids=[0,...p.spans.map(v=>g+=v)],far=p.system==='continuous'?Math.max(...grids.map(v=>Math.abs(v-grids[locatingSupport(p)]))):Math.max(...p.spans);
 const need=12e-6*far*Math.max(ss.temperatureRise,ss.temperatureFall)+b.d*x.rotation+ss.settingTolerance,travel=Math.max(inch/2,up(need,inch/16));
 const shape=aiscShapeByName(b.catalogueId??''),k1=b.tw/2+(shape?shape.kdes*inch-b.tf:0);
 // Factored longitudinal force at a locating end: the traction (at least the design minimum) or the bumper force on the
 // girder, with the tie force estimate as the bottom-flange force, over four bolts. Without a stated seat, Class A with
 // shims (the conservative seat).
 const P=Math.max(0,...p.cranes.map(c=>Math.max((lrfd?1.6:1)*Math.max(c.longitudinal,craneDesignMinimum(c).traction),c.design&&!c.design.bumperBypassesGirder?c.design.bumperForce:0)));
 const V=Math.hypot(P,x.lateral??0)/4,surface=x.surface??'A',hf=(x.plies??3)>=2?.85:1;
 const trial=(db:number)=>{
  // The sleeve wall carries 1.5 times the bolt pretension at F_y (end-bearing-sleeve): from the input wall in 1/16 in steps.
  const bolt=boltProperties(e0.bolts.grade,db),hole=bolt.hole,Fs=x.Fy??50*6.894757293168;let wall=sl.wall;
  while(sleeved&&wall<inch/2&&Fs*Math.PI/4*((hole+2*wall)**2-hole**2)<1.5*bolt.pretension)wall+=inch/16;
  const od=hole+2*wall,slotWidth=sleeved?od+1.5875:hole,slot=slotWidth+2*travel,C=wrenchClearance(db);
  const washer={length:slotWidth+2*travel+12.7,width:Math.max(2.5*db,slotWidth+25.4)};
  // The gauge: the default 5 1/2 in where it fits, wider where the nuts and plate washers need it beside the web fillets,
  // narrower on a narrow flange for the J3.4 edge distance of the slots.
  const flangeEdge=1.5*db-hole/2+slotWidth/2,most=down(b.bf-2*flangeEdge,q),least=up(Math.max(8/3*db,2*(k1+Math.max(C,washer.width/2))),q);
  const gauge=Math.min(most,Math.max(defaultEndBearing.bolts.gauge,least));
  // The locating bolts hold the factored longitudinal force with the bottom-flange tie force by slip at 0.9 (J3.8 with
  // the faying class and filler factor of the seat).
  const slip=boltCapacity({grade:e0.bolts.grade,diameter:db,planes:1,surface,shear:0,tension:0,method:p.method}).slip*hf;
  const fits=slot<=2.5*(sleeved?od:db)+1e-6&&gauge>=8/3*db-1e-6&&gauge/2-k1>=Math.max(C,washer.width/2)-1e-6&&.9*slip>=V;
  return {db,hole,od,wall,slotWidth,slot,C,washer,gauge,fits,edge:Math.max(x.minEdge??0,up(Math.max(1.5*db,1.5*db-hole/2+slot/2),q))};
 };
 const sizes=[.75,.875,1,1.125,1.25].map(v=>v*inch),t=sizes.map(trial).find(v=>v.fits)??trial(e0.bolts.diameter);
 // Bolt layout: rows at e from each plate end, the stiffener at mid-length.
 // The plate washer moves with the sliding bearing: its full travel plus the fabrication margin (slidingClearance).
 const toStiffener=Math.max(t.C,t.washer.length/2+travel+slidingClearance)+x.stiffenerThickness/2+x.stiffenerWeld;
 const layout=Math.max(2*(t.edge+toStiffener),2*t.edge+8/3*t.db);
 // J10.2 / J10.3 at the unstiffened end for the factored reaction (the support checks take no stiffener credit).
 const props=sectionProperties(b),str=girderStrength(p,props),R=supportReactions(p,props).supports.reduce((m,v)=>Math.max(m,(lrfd?1.2:1)*Math.max(0,v.D-v.Ds)+(lrfd?1.6:1)*(v.Cd+v.Cv+v.Ci+Math.max(0,v.Clv))),0);
 let j10=0;for(let lb=0;lb<=12*inch+1e-6;lb+=q){const c=concentratedResistance(p,str,lb,true);j10=lb;if(.9*Math.min(c.yielding,c.crippling)>=R)break;}
 // The saddle, or the least length another end-zone part needs (minLength, a cap tieback angle's hardware).
 const saddle=Math.max(x.saddle?2*(x.saddle.setback+x.saddle.length/2+x.saddle.weld):0,x.minLength??0);
 const length=up(Math.max(layout,j10,saddle),q),width=up(Math.max(b.bf+inch/2,t.gauge+3*t.db),q);
 // Plate flexure beyond the flange tips at 0.9.
 const a=Math.max(0,(width-b.bf)/2),fp=R/(width*length),Fy=x.Fy??50*6.894757293168,tReq=a*Math.sqrt(3*fp/(.9*available(Fy,p.method,.9,1.67)));
 return {length,width,thickness:Math.max(.75*inch,up(tReq,inch/8)),travel,need,reaction:R,bolts:{diameter:t.db,gauge:t.gauge,edge:t.edge},sleeveWall:t.wall,layout,j10,saddle};
}
/**
 * The bearing sized for the project's current details (bearingLayout): the saddle requirement where a direct flange
 * saddle remains, the slot travel, bolts, plate and the AIST effective bearing length. `rotation`: the factored girder
 * end rotation, rad; `lateral`: the factored bottom-flange (tie) force estimate, N.
 */
export function applyBearingLayout(p:ProjectInput,rotation:number,lateral=0){
 const d=p.details;if(!d)return p;
 const a=d.brace.flangeAttachment,saddle=p.system==='simple'&&a?.enabled&&d.brace.arrangement!=='cap-angle'?{setback:a.longitudinalSetback,length:a.saddleLength,weld:a.weldSize}:undefined;
 // An edge distance set for the support (a W-stub seat) is kept; a plate already thick enough keeps its thickness, so the
 // seat elevations set from it hold.
 const layout=(minLength?:number)=>bearingLayout(p,{minLength,rotation,stiffenerThickness:d.bearing.stiffenerThickness,stiffenerWeld:d.bearing.weldSize,saddle,endBearing:d.endBearing,simple:d.simpleSupport,Fy:d.material.Fy,minEdge:d.endBearing?.bolts.edge,lateral,surface:bearingSurface(p),plies:bearingShim(p).plies});
 // A cap tieback angle: the least length from the layout's at which its cap bolt hardware clears the stiffener.
 let v=layout();const cap=capTieBearingLength(p,v.length);if(cap!==undefined&&cap>v.length+1e-6)v=layout(cap);
 Object.assign(d.bearing,{length:v.length,width:v.width,thickness:Math.max(d.bearing.thickness,v.thickness)});
 if(d.simpleSupport)d.simpleSupport.guideTravel=v.travel;
 if(d.endBearing){d.endBearing.bolts={...d.endBearing.bolts,diameter:v.bolts.diameter,gauge:v.bolts.gauge,edge:v.bolts.edge};if(v.sleeveWall>slidingBolts(d.endBearing).wall+1e-9)d.endBearing.sleeveWall=v.sleeveWall;}
 if(p.aist)p.aist.bearingLength=v.length;
 return p;
}

/**
 * The least bearing length from `from` (1/4 in grid) at which a cap tieback angle's cap bolt hardware (nuts, washers, bolt ends inside
 * the girder) clears the bearing stiffener pair at mid-bearing, with its fillets, by the 1/8 in coordination allowance
 * (coord-cap-tie-stiffener, the same box envelopes): the tie sits its setback from the girder end, the stiffener half the
 * bearing length from it. Undefined without a cap tieback angle.
 */
export function capTieBearingLength(p:ProjectInput,from=6*inch){
 const g=capAngleGeometry(p),d=p.details;if(!g||!d)return undefined;
 const s=p.section,bs=d.bearing,zTop=-(s.capTw+s.tf),zBot=-(s.capTw+s.d-s.tf),half=bs.stiffenerThickness/2+bs.weldSize,nuts=capBoltNutEnvelope(g),setback=g.input.setback;
 const clear=(N:number)=>Math.min(...nuts.flatMap(n=>n.parts.map(part=>boxClearance(part,{min:[N/2-setback-half,s.tw/2,zBot],max:[N/2-setback+half,s.tw/2+bs.stiffenerWidth,zTop]}))));
 for(let N=from;N<=inch*24+1e-6;N+=inch/4)if(clear(N)>=coordinationAllowance-1e-9)return N;
 return 24*inch;
}
