import type {CheckResult,DesignAnalysis,ProjectInput} from './types';
import {available} from './aiscStrength';
import {boltCapacity,boltProperties,plateBearing} from './connectionStrength';
import {simpleSupportInput} from './simpleSupports';
import {bracketArrangement} from './connectionOptions';
import {wrenchClearance} from './endStop';
import {aiscShapeByName} from '../data/aiscSections';
import {format} from './units';
import {latexNumber,withinLimit} from './math';
import type {EndBearingInput} from './endBearingInputs';
export {endBearingSchema,defaultEndBearing,activeEndBearing,type EndBearingInput} from './endBearingInputs';

const inch=25.4;
/**
 * Bolt and slot geometry measured from the girder end along the runway (x)
 * and from the web centerline across it. Rib positions are the bracket rib
 * under this girder at a runway-end grid and at a shared interior grid.
 */
export function endBearingGeometry(p:ProjectInput,e:EndBearingInput){
 const d=p.details!,bs=d.bearing,travel=simpleSupportInput(p).guideTravel,gap=simpleSupportInput(p).endGap,db=e.bolts.diameter,hole=boltProperties(e.bolts.grade,db).hole;
 const rows=[e.bolts.edge,bs.length-e.bolts.edge],stiffener=bs.length/2,slot=hole+2*travel;
 // A plate washer centered on the bolt covers the slot at either extreme of travel.
 const washer={length:hole+4*travel+12.7,width:Math.max(2.5*db,hole+25.4),thickness:e.washerThickness};
 const b=d.bracket?.enabled?d.bracket:undefined,ribs=b&&bracketArrangement(b)==='twin-rib'?[b.ribSpacing/2,b.ribSpacing/2-gap/2]:[];
 return {rows,stiffener,slot,hole,washer,travel,ribs,spacing:rows[1]-rows[0]};
}

const compared=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,referenceIds=['aisc-connections','tr13-girder']):CheckResult=>({id,group:'End bearings',title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,referenceIds});
const byOthers=(id:string,title:string,note:string):CheckResult=>({id,group:'End bearings',title,status:'excluded',equation:'',note,referenceIds:['aisc-connections']});

/**
 * Locating end: pretensioned slip-critical bolts in standard holes take the
 * longitudinal force with the bottom-flange tie force and uplift. Sliding end:
 * snug-tight bolts in long slots take uplift and transverse force in bearing.
 */
export function endBearingChecks(p:ProjectInput,e:EndBearingInput,ctx:{analysis:DesignAnalysis;lateral:number}):CheckResult[]{
 const d=p.details!,b=p.section,bs=d.bearing,m=d.material,method=p.method,u=p.units,f=(v:number)=>format(v,'length',u,3);
 const g=endBearingGeometry(p,e),db=e.bolts.diameter,C=wrenchClearance(db),gauge=e.bolts.gauge,n=4;
 const axial=ctx.analysis.axial,uplift=ctx.analysis.uplift,H=ctx.lateral;
 const V=Math.hypot(axial,H)/n,T=uplift/n,Vs=H/n;
 const locating=boltCapacity({grade:e.bolts.grade,diameter:db,planes:1,surface:'B',shear:V,tension:T,method});
 const sliding=boltCapacity({grade:e.bolts.grade,diameter:db,planes:1,surface:'B',shear:Vs,tension:T,method});
 const shape=aiscShapeByName(b.catalogueId??''),k1=b.tw/2+(shape?shape.kdes*inch-b.tf:0);
 const tMin=(T:number,bPrime:number,pw:number,Fu:number)=>Math.sqrt(4*T*Math.max(bPrime,0)/available(pw*Fu,method,.9,1.67));
 const flangeB=gauge/2-b.tw/2,flangeP=Math.min(g.spacing,3.5*flangeB);
 const stiffClear=Math.min(...g.rows.map(x=>Math.abs(x-g.stiffener)))-bs.stiffenerThickness/2-bs.weldSize;
 const force=`Factored longitudinal force ${format(axial,'force',u,3)} (traction or crane stop, AIST combinations), bottom-flange tie force ${format(H,'force',u,3)} and uplift ${format(uplift,'force',u,3)}, shared by four bolts.`;
 const checks:CheckResult[]=[
  compared('end-bearing-locating-slip','Locating end · slip-critical bolts',V,locating.slip,'force','R_n=\\mu D_uT_bk_{sc}',`${force} Pretensioned, Class B faying surfaces; k_sc = ${locating.slipReduction.toFixed(3)} for uplift tension. Standard holes in all plies.`),
  compared('end-bearing-locating-shear','Locating end · bolt shear',V,locating.shear,'force','V=\\sqrt{P_{long}^2+H^2}/4\\le\\phi F_{nv}A_b',`${force} One shear plane at each ply interface; threads included.`),
  compared('end-bearing-locating-tension','Locating end · bolt tension with shear',T,locating.tension,'force','T=R_{up}/4\\le\\phi F^\\prime_{nt}A_b',force),
  compared('end-bearing-flange-bearing','Girder flange · bolt bearing / tearout',V,plateBearing(db,g.hole,b.tf,b.Fu,g.rows[0],g.spacing,method).capacity,'force','R_n=\\min(1.2l_ctF_u,2.4dtF_u)',`Clear distance to the girder end controls; the force reverses with traction.`),
  compared('end-bearing-plate-bearing','Bearing plate · bolt bearing / tearout',V,plateBearing(db,g.hole,bs.thickness,m.Fu,e.bolts.edge,g.spacing,method).capacity,'force','R_n=\\min(1.2l_ctF_u,2.4dtF_u)','Bearing plate ends control.'),
  compared('end-bearing-sliding','Sliding end · bolts in bearing',Math.hypot(Vs/Math.max(sliding.shear,1e-9),T/Math.max(sliding.tension,1e-9)),1,'ratio','\\sqrt{(V/\\phi R_{nv})^2+(T/\\phi R_{nt})^2}\\le1',`Snug-tight bolts with double nuts in long slots carry the transverse tie force in bearing and the uplift in tension; no longitudinal force. ${force}`),
  compared('end-bearing-flange-prying','Girder bottom flange · thickness for no prying',tMin(T,flangeB-db/2,flangeP,b.Fu),b.tf,'length','t_{min}=\\sqrt{\\frac{4Tb^\\prime}{\\phi pF_u}}',`Flange cantilevers from the web: b = ${f(flangeB)}, p = ${f(flangeP)}.`),
  compared('end-bearing-slot','Sliding end · slot length for travel',g.slot,2.5*db,'length','L_{slot}=d_h+2u\\le2.5d_b',`Long-slotted holes in the girder flange per AISC Table J3.3 for the sliding allowance ${f(g.travel)} each way. The movement demand is checked against that allowance separately.`),
  compared('end-bearing-washer','Sliding end · plate washer thickness',5/16*inch,e.washerThickness,'length','t_w\\ge5/16\\,in','AISC J3.2: plate washers cover the long slots in the outer ply.'),
  compared('end-bearing-flange-edge','Girder flange · bolt edge distance',1.5*db,(b.bf-gauge)/2,'length','(b_f-g)/2\\ge1.5d_b','Rolled flange edge.'),
  compared('end-bearing-plate-edge','Bearing plate · bolt edge distance',1.5*db,Math.min((bs.width-gauge)/2,e.bolts.edge),'length','e\\ge1.5d_b','Standard holes in the bearing plate.'),
  compared('end-bearing-end-edge','Girder end · bolt edge distance',1.5*db+(g.slot-g.hole)/2,e.bolts.edge,'length','e\\ge1.5d_b+(L_{slot}-d_h)/2','The slot extends toward the girder end at the sliding end.'),
  compared('end-bearing-spacing','Bolt spacing',8/3*db,Math.min(gauge,g.spacing),'length','s\\ge(8/3)d_b','Between rows and across the gauge.'),
  compared('end-bearing-wrench-web','Nut clearance above flange · web fillet',C,gauge/2-k1,'length','g/2-k_1\\ge c_{wrench}',shape?'k₁ from the catalogue fillet.':'No fillet credited for a custom section.'),
  compared('end-bearing-wrench-stiffener','Nut clearance above flange · bearing stiffener',C,stiffClear,'length','|x_{bolt}-x_{st}|-t_{st}/2-w\\ge c_{wrench}','Bolt rows at the bearing plate ends clear the stiffeners at mid-bearing.'),
  compared('end-bearing-washer-fit','Plate washers fit on the flange',g.washer.width/2,gauge/2-k1,'length','w_w/2\\le g/2-k_1','Washers bear flat outside the web fillet.'),
  compared('end-bearing-washer-stiffener','Plate washers clear the bearing stiffener',g.washer.length/2,stiffClear,'length','l_w/2\\le|x_{bolt}-x_{st}|-t_{st}/2-w','Washer length covers the slot at either extreme of travel.')
 ];
 const wb=d.bracket?.enabled&&bracketArrangement(d.bracket)==='twin-rib'?d.bracket:undefined;
 if(wb){
  const ribClear=Math.min(...g.ribs.flatMap(r=>g.rows.map(x=>Math.abs(x-r))))-wb.ribThickness/2-wb.seatWeld;
  const seatB=Math.max(1e-9,ribClear+wb.seatWeld),seatP=Math.min(gauge,3.5*seatB);
  checks.push(
   compared('end-bearing-seat-bearing','Bracket seat · bolt bearing',V,plateBearing(db,g.hole,wb.seatThickness,m.Fu,Math.max(e.bolts.edge,wb.seatLength/2-g.rows[1]),g.spacing,method).capacity,'force','R_n=\\min(1.2l_ctF_u,2.4dtF_u)','Standard holes in the welded seat plate.'),
   compared('end-bearing-seat-prying','Bracket seat · thickness for no prying',tMin(T,seatB-db/2,seatP,m.Fu),wb.seatThickness,'length','t_{min}=\\sqrt{\\frac{4Tb^\\prime}{\\phi pF_u}}',`Seat cantilevers from the nearer rib: b = ${f(seatB)}.`),
   compared('end-bearing-wrench-rib','Nut clearance below seat · bracket ribs',C,ribClear,'length','|x_{bolt}-x_{rib}|-t_{rib}/2-w\\ge c_{wrench}','Both the runway-end grid and shared interior grids; ribs placed under the bearing stiffeners clear the bolt rows.'),
   compared('end-bearing-seat-fit','Bearings and bolts fit on the seat',simpleSupportInput(p).endGap/2+bs.length,wb.seatLength/2,'length','g/2+L_{bearing}\\le L_{seat}/2','Each girder bearing, and its bolts, lie on its half of the shared seat.')
  );
 }else checks.push(byOthers('end-bearing-seat','Bracket seat holes and nut clearance','The seat is by others: provide matching standard holes, nut clearance below the seat, and a seat that carries the bolt forces reported here.'));
 return checks;
}
