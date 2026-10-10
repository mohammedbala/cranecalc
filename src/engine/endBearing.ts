import type {CheckResult,DesignAnalysis,ProjectInput} from './types';
import {available} from './aiscStrength';
import {boltCapacity,boltProperties,plateBearing} from './connectionStrength';
import {simpleSupportInput} from './simpleSupports';
import {bracketArrangement} from './connectionOptions';
import {wrenchClearance} from './endStop';
import {aiscShapeByName} from '../data/aiscSections';
import {format} from './units';
import {latexNumber,withinLimit} from './math';
import {slidingBolts,continuousBearings,type EndBearingInput} from './endBearingInputs';
export {endBearingSchema,defaultEndBearing,activeEndBearing,slidingBolts,continuousBearings,locatingSupport,type EndBearingInput} from './endBearingInputs';

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
 const sleeve=sleeved?{od:hole+2*sl.wall,length:p.section.tf+sl.clearance,area:Math.PI/4*((hole+2*sl.wall)**2-hole**2)}:undefined;
 const slotWidth=sleeve?sleeve.od+1.5875:hole;
 const rows=[e.bolts.edge,bs.length-e.bolts.edge],stiffener=bs.length/2,slot=slotWidth+2*travel;
 // A plate washer centered on the bolt covers the slot at either extreme of travel.
 const washer={length:slotWidth+4*travel+12.7,width:Math.max(2.5*db,slotWidth+25.4),thickness:e.washerThickness};
 // Simple spans: the girder end is at the grid on a runway end, half the gap from it at a shared grid. A
 // continuous girder ends at the runway-end grids and is centered on the interior ones.
 const b=d.bracket?.enabled?d.bracket:undefined,ribs=b&&bracketArrangement(b)==='twin-rib'?p.system==='continuous'?[b.ribSpacing/2,bs.length/2-b.ribSpacing/2,bs.length/2+b.ribSpacing/2]:[b.ribSpacing/2,b.ribSpacing/2-gap/2]:[];
 return {rows,stiffener,slot,slotWidth,sleeve,sleeved,hole,washer,travel,ribs,spacing:rows[1]-rows[0]};
}

const compared=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,referenceIds=['aisc-connections','tr13-girder']):CheckResult=>({id,group:'End bearings',title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,referenceIds});
const byOthers=(id:string,title:string,note:string):CheckResult=>({id,group:'End bearings',title,status:'excluded',equation:'',note,referenceIds:['aisc-connections']});

/**
 * Locating end: pretensioned slip-critical bolts in standard holes take the
 * longitudinal force with the bottom-flange tie force and uplift. Sliding end:
 * bolts pretensioned against steel sleeves (AISC J1.10(c)) leave the flange
 * free to slide; the sleeves carry the transverse force in bearing on the slot
 * sides and plate washers hold the flange down. Snug-tight bolts with jam nuts
 * are an alternative for cranes of 5 tons or less. A continuous girder locates
 * at one support and slides at the others, whose slots take the thermal travel
 * from the locating support.
 */
export function endBearingChecks(p:ProjectInput,e:EndBearingInput,ctx:{analysis:DesignAnalysis;lateral:number}):CheckResult[]{
 const d=p.details!,b=p.section,bs=d.bearing,m=d.material,method=p.method,u=p.units,f=(v:number)=>format(v,'length',u,3);
 const supports=continuousBearings(p),locates=supports.find(v=>v.role==='LOCATING'),LE=locates?`Locating support (grid ${locates.grid})`:'Locating end',SE=locates?'Sliding supports':'Sliding end';
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
  compared('end-bearing-locating-slip',`${LE} · slip-critical bolts`,V,locating.slip,'force','R_n=\\mu D_uT_bk_{sc}',`${force} Pretensioned, Class B faying surfaces; k_sc = ${locating.slipReduction.toFixed(3)} for uplift tension. Standard holes in all plies.`),
  compared('end-bearing-locating-shear',`${LE} · bolt shear`,V,locating.shear,'force','V=\\sqrt{P_{long}^2+H^2}/4\\le\\phi F_{nv}A_b',`${force} One shear plane at each ply interface; threads included.`),
  compared('end-bearing-locating-tension',`${LE} · bolt tension with shear`,T,locating.tension,'force','T=R_{up}/4\\le\\phi F^\\prime_{nt}A_b',force),
  compared('end-bearing-flange-bearing','Girder flange · bolt bearing / tearout',V,plateBearing(db,g.hole,b.tf,b.Fu,g.rows[0],g.spacing,method).capacity,'force','R_n=\\min(1.2l_ctF_u,2.4dtF_u)',locates?'Clear distance to the bearing plate end, taken as a girder end; the force reverses with traction.':'Clear distance to the girder end controls; the force reverses with traction.'),
  compared('end-bearing-plate-bearing','Bearing plate · bolt bearing / tearout',V,plateBearing(db,g.hole,bs.thickness,m.Fu,e.bolts.edge,g.spacing,method).capacity,'force','R_n=\\min(1.2l_ctF_u,2.4dtF_u)','Bearing plate ends control.'),
  compared('end-bearing-sliding',`${SE} · bolts in bearing`,Math.hypot(Vs/Math.max(sliding.shear,1e-9),T/Math.max(sliding.tension,1e-9)),1,'ratio','\\sqrt{(V/\\phi R_{nv})^2+(T/\\phi R_{nt})^2}\\le1',`${g.sleeved?'Bolts pretensioned against steel sleeves; the sleeves bear on the slot sides for the transverse tie force and the plate washers take the uplift into the bolts':'Snug-tight bolts with double nuts in long slots carry the transverse tie force in bearing and the uplift in tension'}; no longitudinal force. ${force}`),
  compared('end-bearing-flange-prying','Girder bottom flange · thickness for no prying',tMin(T,flangeB-db/2,flangeP,b.Fu),b.tf,'length','t_{min}=\\sqrt{\\frac{4Tb^\\prime}{\\phi pF_u}}',`Flange cantilevers from the web: b = ${f(flangeB)}, p = ${f(flangeP)}.`),
  ...(g.sleeve?[
   compared('end-bearing-sleeve',`${SE} · sleeves under bolt pretension`,1.5*sliding.pretension,m.Fy*g.sleeve.area,'force','1.5T_b\\le F_yA_{sleeve}',`Steel sleeve ${f(g.sleeve.od)} OD × ${f(g.hole)} bore × ${f(g.sleeve.length)} long, F_y as the plate material. 1.5 × minimum pretension bounds turn-of-nut overshoot (RCSC commentary). AISC J1.10(c): crane supports in buildings with cranes over 5 tons need pretensioned bolts; the sleeve takes the clamp so the flange still slides.`),
   compared('end-bearing-sleeve-length',`${SE} · sleeve projects above the flange`,inch/32,g.sleeve.length-b.tf,'length','l_{sleeve}-t_f\\ge1/32\\,in','Cut each sleeve to the measured flange thickness plus the clearance, so the plate washer clears the flange.'),
   compared('end-bearing-sleeve-bearing',`${SE} · flange bearing on sleeves`,Vs,available(Math.min(1.0*((b.bf-gauge)/2-g.slotWidth/2)*b.tf*b.Fu,2.0*g.sleeve.od*b.tf*b.Fu),method,.75,2),'force','R_n=\\min(1.0l_ctF_u,\\,2.0d_st_fF_u)','AISC J3.10 for long slots perpendicular to the force, with the sleeve diameter; clear distance to the flange tip.'),
   compared('end-bearing-washer-bending',`${SE} · plate washer under uplift`,6*(T/2)*Math.max(0,g.slotWidth/2-.8*db)/(g.washer.length*e.washerThickness**2),available(m.Fy,method,.9,1.67),'stress','f=\\frac{6(T/2)a}{l_wt_w^2};\\quad a=w_{slot}/2-0.8d_b','The flange bears up on the washer at both slot edges; the washer cantilevers from the bolt head.')
  ]:[
   compared('end-bearing-slot',`${SE} · slot length for travel`,g.slot,2.5*db,'length','L_{slot}=d_h+2u\\le2.5d_b',`Long-slotted holes in the girder flange per AISC Table J3.3 for the sliding allowance ${f(g.travel)} each way. The movement demand is checked against that allowance separately.`),
   compared('end-bearing-j110',`${SE} · snug-tight bolts permitted`,Math.max(0,...p.cranes.map(c=>c.design?.ratedLoad??Infinity)),5*8896.443,'force','W_{rated}\\le5\\,tons','AISC J1.10(c): in buildings with cranes over 5 tons, crane supports need pretensioned bolts or welds. Use sleeved sliding bolts for heavier cranes.')
  ]),
  compared('end-bearing-washer',`${SE} · plate washer thickness`,5/16*inch,e.washerThickness,'length','t_w\\ge5/16\\,in','AISC J3.2: plate washers cover the long slots in the outer ply.'),
  compared('end-bearing-flange-edge','Girder flange · bolt edge distance',1.5*db-g.hole/2+g.slotWidth/2,(b.bf-gauge)/2,'length','(b_f-g)/2\\ge1.5d_b-d_h/2+w_{slot}/2','Rolled flange edge; the sliding-end slot keeps the clear material of a standard hole at the J3.4 minimum.'),
  compared('end-bearing-plate-edge','Bearing plate · bolt edge distance',1.5*db,Math.min((bs.width-gauge)/2,e.bolts.edge),'length','e\\ge1.5d_b','Standard holes in the bearing plate.'),
  compared('end-bearing-end-edge','Girder end · bolt edge distance',1.5*db-g.hole/2+g.slot/2,e.bolts.edge,'length','e\\ge1.5d_b-d_h/2+L_{slot}/2','The slot extends toward the girder end at the sliding end.'),
  compared('end-bearing-spacing','Bolt spacing',8/3*db,Math.min(gauge,g.spacing),'length','s\\ge(8/3)d_b','Between rows and across the gauge.'),
  compared('end-bearing-wrench-web','Nut clearance above flange · web fillet',C,gauge/2-k1,'length','g/2-k_1\\ge c_{wrench}',shape?'k₁ from the catalogue fillet.':'No fillet credited for a custom section.'),
  compared('end-bearing-wrench-stiffener','Nut clearance above flange · bearing stiffener',C,stiffClear,'length','|x_{bolt}-x_{st}|-t_{st}/2-w\\ge c_{wrench}','Bolt rows at the bearing plate ends clear the stiffeners at mid-bearing.'),
  compared('end-bearing-washer-fit','Plate washers fit on the flange',g.washer.width/2,gauge/2-k1,'length','w_w/2\\le g/2-k_1','Washers bear flat outside the web fillet.'),
  compared('end-bearing-washer-stiffener','Plate washers clear the bearing stiffener',g.washer.length/2,stiffClear,'length','l_w/2\\le|x_{bolt}-x_{st}|-t_{st}/2-w','Washer length covers the slot at either extreme of travel.')
 ];
 // A continuous girder slides at every support but the locating one, by the thermal strain over its distance from it.
 if(locates){
  const c=simpleSupportInput(p),far=Math.max(...supports.map(v=>v.distance));
  checks.push(compared('end-bearing-travel',`${SE} · movement allowance each direction`,12e-6*far*Math.max(c.temperatureRise,c.temperatureFall)+b.d*ctx.analysis.endRotation+c.settingTolerance,g.travel,'length','u_{req}=\\alpha x_{max}\\max(\\Delta T_+,\\Delta T_-)+d|\\theta|+t_{set}',`Farthest sliding support ${f(far)} from the locating support at grid ${locates.grid}; the flange slots give ${f(g.travel)} each way. Thermal coefficient ${u==='US'?'6.6667 × 10⁻⁶ /°F':'12 × 10⁻⁶ /°C'} is a stated steel modeling assumption; temperature changes are measured from erection. Reference AIST Technical Report 13 §5.8.1.`,['tr13-girder','mechanics','criteria']));
 }
 const wb=d.bracket?.enabled&&bracketArrangement(d.bracket)==='twin-rib'?d.bracket:undefined;
 if(wb){
  const ribClear=Math.min(...g.ribs.flatMap(r=>g.rows.map(x=>Math.abs(x-r))))-wb.ribThickness/2-wb.seatWeld;
  const seatB=Math.max(1e-9,ribClear+wb.seatWeld),seatP=Math.min(gauge,3.5*seatB);
  checks.push(
   compared('end-bearing-seat-bearing','Bracket seat · bolt bearing',V,plateBearing(db,g.hole,wb.seatThickness,m.Fu,Math.max(e.bolts.edge,wb.seatLength/2-g.rows[1]),g.spacing,method).capacity,'force','R_n=\\min(1.2l_ctF_u,2.4dtF_u)','Standard holes in the welded seat plate.'),
   compared('end-bearing-seat-prying','Bracket seat · thickness for no prying',tMin(T,seatB-db/2,seatP,m.Fu),wb.seatThickness,'length','t_{min}=\\sqrt{\\frac{4Tb^\\prime}{\\phi pF_u}}',`Seat cantilevers from the nearer rib: b = ${f(seatB)}.`),
   compared('end-bearing-wrench-rib','Nut clearance below seat · bracket ribs',C,ribClear,'length','|x_{bolt}-x_{rib}|-t_{rib}/2-w\\ge c_{wrench}','Both the runway-end grid and shared interior grids; ribs placed under the bearing stiffeners clear the bolt rows.'),
   compared('end-bearing-seat-fit','Bearings and bolts fit on the seat',(locates?0:simpleSupportInput(p).endGap/2)+bs.length,wb.seatLength/2,'length','g/2+L_{bearing}\\le L_{seat}/2',locates?'A runway-end bearing, and its bolts, lie on the half of the seat under the girder; interior bearings are centered on it.':'Each girder bearing, and its bolts, lie on its half of the shared seat.')
  );
 }else checks.push(byOthers('end-bearing-seat','Bracket seat holes and nut clearance','The seat is by others: provide matching standard holes, nut clearance below the seat, and a seat that carries the bolt forces reported here.'));
 return checks;
}
