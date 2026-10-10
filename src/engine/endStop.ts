import {railPadThickness} from './railSeat';
import {runwayEnds} from './continuation';
import type {CheckResult,DesignAnalysis,ProjectInput,Properties} from './types';
import {interaction,type GirderStrength} from './aiscStrength';
import {cappedElasticProperties} from './capChannel';
import {available} from './aiscStrength';
import {boltCapacity,boltProperties,plateBearing,minimumFillet} from './connectionStrength';
import {craneCombinations} from './aistLoads';
import {independentBearings} from './simpleSupports';
import {aiscShapeByName} from '../data/aiscSections';
import {format} from './units';
import {latexNumber,withinLimit} from './math';
import {needsGirderStops,stopLip,stopRailEnd,stopBoltRows,type EndStopInput} from './endStopInputs';
import {flangeTieGeometry} from './tieGeometry';
export {endStopSchema,defaultEndStop,needsGirderStops,activeEndStop,stopRailEnd,type EndStopInput} from './endStopInputs';
const inch=25.4;

/** Bumper force on a girder-mounted stop: largest crane whose stop force is not taken by a building-mounted stop. */
export function stopBumperForce(p:ProjectInput){
 const forces=p.cranes.filter(c=>c.design&&!c.design.bumperBypassesGirder).map(c=>c.design!.bumperForce);
 return forces.length?Math.max(...forces):0;
}

/** Stop geometry along the girder from the runway end (x) and across from the web centerline (z). */
export function endStopGeometry(p:ProjectInput,e:EndStopInput){
 const lip=stopLip(e),tb=e.base.thickness,tp=e.face.thickness;
 const back=e.setback,front=back+e.base.length,faceBack=front-lip-tp,faceFront=front-lip;
 const [backRow,frontRow]=stopBoltRows(e);
 const surfaceWidth=p.section.kind==='cap'?p.section.capWidth:p.section.bf;
 const railDepth=p.aist?.railDepth??p.railHeight;
 // Bumper centerline above the top of the base plate.
 // The bumper height is above the top of rail, which stands on the pad where there is one.
 const contact=railDepth+railPadThickness(p)+e.bumperHeight-tb;
 // Stiffeners stop an inch below the top of the face plate, and back at least the whole bumper contact.
 const stiffenerHeight=Math.min(e.face.height,Math.max(e.face.height-inch,.5*e.face.height,contact+e.bumperDiameter/2));
 // Bolt C/L to the toes of the stop fillets: heads on the base plate sit beside the face plate and stiffener welds.
 const toe={face:e.bolts.frontClear-e.weldSize,stiffener:(e.bolts.gauge-e.stiffener.spacing)/2-e.stiffener.thickness/2-e.weldSize};
 return {lip,back,front,faceBack,faceFront,frontRow,backRow,surfaceWidth,contact,stiffenerHeight,railEnd:stopRailEnd(e),stiffenerEnd:faceBack-e.stiffener.length,toe};
}
/**
 * Socket tightening clearance C1 from the bolt center to an obstruction (AISC Manual Table 7-15): 1 1/4 in for
 * 3/4 in bolts, about 1.6d for larger ones. Measured to the toe of any fillet on the obstruction, so the heavy
 * hex head or nut corners and the socket wall clear the weld.
 */
export const wrenchClearance=(db:number)=>Math.max(1.25*inch,1.6*db);

const u2=(p:ProjectInput)=>p.units;
const compared=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,referenceIds=['aisc-connections','tr13-load']):CheckResult=>({id,group:'End stops',title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,referenceIds});

/** Girder context for the bumper couple: design analysis, strength, properties and the end connection uplift resistance. */
export interface EndStopContext {analysis:DesignAnalysis;strength:GirderStrength;props:Properties;holdDown:number;}
export function endStopChecks(p:ProjectInput,ctx?:EndStopContext):CheckResult[]{
 const d=p.details;if(!d)return [];
 const e=d.endStop;
 if(!needsGirderStops(p))return e?.enabled?[{id:'end-stop',group:'End stops',title:'Girder-mounted runway end stops',status:'not-applicable',equation:'',referenceIds:['tr13-girder'],note:'Every crane stop force is taken by building-mounted stops; girder-mounted stops are not required.'}]:[];
 // Validation requires the stop design whenever a crane stop force reaches the girder.
 if(!e?.enabled)return [];
 const sourced:CheckResult[]=e.source.trim()?[]:[{id:'end-stop-source',group:'End stops',title:'Bumper data source',status:'incomplete',equation:'',referenceIds:['tr13-load'],note:'Enter the crane supplier source of the bumper force, bumper height and contact diameter.'}];
 const P=Math.max(...craneCombinations(p.method).map(c=>c.bumper))*stopBumperForce(p);
 const g=endStopGeometry(p,e),m=d.material,b=p.section,method=p.method,u=p.units,f=(v:number)=>format(v,'length',u,3);
 const db=e.bolts.diameter,bolt=boltProperties(e.bolts.grade,db),C=wrenchClearance(db);
 const tb=e.base.thickness,tp=e.face.thickness,ts=e.stiffener.thickness,Ls=e.stiffener.length,s=e.stiffener.spacing,Wb=e.base.width,gauge=e.bolts.gauge;
 // Overturning about the back (heel) edge of the base plate; the two front bolts take the tension.
 const lever=g.frontRow-g.back-tb,M=P*(g.contact+tb),T=lever>0?M/(2*lever):1e12,V=P/4;
 const front=boltCapacity({grade:e.bolts.grade,diameter:db,planes:1,surface:'B',shear:V,tension:T,method});
 const grip=tb+(b.kind==='cap'?b.capTw:0)+b.tf,flangeT=b.tf;
 // T-stub thickness for no prying (AISC Manual Part 9): t_min = sqrt(4Tb'/(phi p Fu)).
 const tMin=(T:number,bPrime:number,p:number,Fu:number)=>Math.sqrt(4*T*Math.max(bPrime,0)/available(p*Fu,method,.9,1.67));
 const baseB=Math.min(e.bolts.frontClear,(gauge-s)/2-ts/2),baseP=Math.min(Wb/2,3.5*baseB);
 const flangeB=gauge/2-b.tw/2,flangeP=Math.min(g.frontRow-g.backRow,3.5*flangeB);
 // Stop body at the top of the base plate: face plate plus both stiffeners, bending about the across-runway axis.
 const parts=[{A:Wb*tp,c:tp/2,I:Wb*tp**3/12},{A:2*ts*Ls,c:tp+Ls/2,I:2*ts*Ls**3/12}];
 const A=parts.reduce((a,v)=>a+v.A,0),uc=parts.reduce((a,v)=>a+v.A*v.c,0)/A,I=parts.reduce((a,v)=>a+v.I+v.A*(v.c-uc)**2,0),S=I/Math.max(uc,tp+Ls-uc);
 // Weld lines (both faces of the face plate and of each stiffener) treated as lines.
 const lines=[{L:Wb,u:0,along:false},{L:Wb,u:tp,along:false},...Array.from({length:4},()=>({L:Ls,u:tp+Ls/2,along:true}))];
 const Lw=lines.reduce((a,l)=>a+l.L,0),wc=lines.reduce((a,l)=>a+l.L*l.u,0)/Lw,Iw=lines.reduce((a,l)=>a+(l.along?l.L**3/12:0)+l.L*(l.u-wc)**2,0),cw=Math.max(wc,tp+Ls-wc);
 const weldStress=Math.hypot(P*g.contact*cw/Iw,P/Lw),weldCapacity=available(.6*m.Fexx*e.weldSize/Math.sqrt(2),method,.75,2); // per unit length
 // Stiffener to face plate, both sides of each stiffener over its height at the face: the shear flow that makes
 // the face plate and stiffeners act together, with the bumper reaction each stiffener takes from the face plate
 // over the contact diameter. The bumper is on the rail C/L, offset from the stop center.
 const Hs=g.stiffenerHeight,ecc=Math.abs(p.railEccentricity),Rs=Math.min(P,P*(.5+ecc/s)),flow=P*Wb*tp*(uc-tp/2)/I/4,push=Rs/(2*Math.min(e.bumperDiameter,Hs));
 const faceWeld=Math.hypot(flow,push);
 // Face plate outstand beyond the stiffeners under the bumper contact pressure, as a cantilever strip.
 const outstand=Math.max(0,e.bumperDiameter/2+ecc-s/2-ts/2),pressure=P/e.bumperDiameter**2;
 const shape=aiscShapeByName(b.catalogueId??''),k1=b.tw/2+(shape?shape.kdes*inch-b.tf:0);
 const bearings=p.system==='simple'?independentBearings(p).filter(v=>v.bay===1&&v.end==='left'):[];
 const stiffenerAt=bearings[0]?.center??d.bearing.length/2,stiffenerClear=Math.min(...[g.frontRow,g.backRow].map(x=>Math.abs(x-stiffenerAt)))-d.bearing.stiffenerThickness/2-d.bearing.weldSize;
 // Nuts under the top flange also clear the top tie saddle at the runway-end support.
 const tie=flangeTieGeometry(p),endTie=tie?.sides.includes(1)?tie.stations.find(v=>v.bay===1&&v.end==='left'):undefined;
 const saddleClear=tie&&endTie?Math.min(...[g.backRow,g.frontRow].map(x=>{const a=tie.attachment,x0=endTie.tieX-a.saddleLength/2-a.weldSize,x1=endTie.tieX+a.saddleLength/2+a.weldSize,z=gauge/2;return Math.hypot(Math.max(x0-x,0,x-x1),Math.max(tie.rootStart-a.weldSize-z,0,z-tie.rootEnd));})):undefined;
 // Heel compression of the overturning couple on the top flange, carried by the web without stiffener credit.
 const heel=lever>0?M/lever:1e12,lb=tb,kd=shape?shape.kdes*inch:b.tf,ratio=Math.min(lb/b.d,.2);
 const webCapacity=Math.min(available(b.Fy*b.tw*((g.back+tb/2>b.d?5:2.5)*kd+lb),method,1,1.5),available((g.back+tb/2>=b.d/2?.8:.4)*b.tw**2*(1+3*ratio*(b.tw/b.tf)**1.5)*Math.sqrt(b.E*b.Fy*b.tf/b.tw),method,.75,2));
 const Fy=Math.min(m.Fy,b.Fy),force=`Factored bumper force ${format(P,'force',u,3)} (AIST stop combinations; ${p.method==='LRFD'?'1.0':'0.67'} C_bs) at ${f(g.contact)} above the base plate.`;
 const ends=runwayEnds(p),n=`${force} Same stop at ${ends.length===2?'both ends':`the ${ends[0]} end`} of both runways${ends.length<2?'; the runway continues beyond the other modeled end':''}. Impact is not cyclic service loading; the holes near the girder end are fatigue points (Category B) in the detail register. Girder axial force and its locating end connection include the bumper force in the AIST stop combinations.`;
 // The bumper acts above the girder centroid: an end couple P*y bends the end span and changes its reactions by P*y/L.
 const cap=cappedElasticProperties(b),yTop=cap?b.d+b.capTw-cap.cy:b.d/2,y=yTop+tb+g.contact,M0=P*y;
 const span=p.system==='simple'?Math.min(...ends.map(end=>end==='left'?p.spans[0]:p.spans.at(-1)!)):p.spans.reduce((a,v)=>a+v,0);
 const girder:CheckResult[]=[];
 if(ctx){
  const stopCombos=new Set(craneCombinations(p.method).filter(c=>c.bumper>0).map(c=>`${p.method} ${c.id}`)),records=ctx.analysis.combinations.filter(c=>stopCombos.has(c.id));
  // The end couple can reverse the moment near the girder end: use the weaker flexural direction.
  const weaker={...ctx.strength,major:Math.min(ctx.strength.major,ctx.strength.majorReverse??ctx.strength.major)};
  const u=Math.max(0,...records.map(r=>interaction(r.axial,r.moment+M0,r.lateralMoment,weaker,p.method).utilization));
  const q=p.deadLoad+p.railWeight+ctx.props.weight,dead=(p.method==='LRFD'?.9:.6)*q*span/2,uplift=Math.max(0,M0/span-dead);
  girder.push(compared('end-stop-girder','Girder · stop combinations with bumper couple',u,1,'ratio','\frac{P_r}{P_c}+\frac{8}{9}\left(\frac{M_{rx}+Py}{M_{cx}}+\frac{M_{ry}}{M_{cy}}\right)\le1',`Peak moments of the stop combinations plus the full couple P·y = ${format(M0,'moment',u2(p),3)} (y = ${f(y)} above the girder centroid), added without regard to location. Axial force includes the bumper force.`,['aisc-h','tr13-load']));
  girder.push(compared('end-stop-uplift','Far support · uplift from bumper couple',uplift,ctx.holdDown,'force','R_{up}=\frac{Py}{L}-\gamma_D\frac{qL}{2}',`Shortest end span ${f(span)}; ${p.method==='LRFD'?'0.9':'0.6'} × girder, rail and added dead load only, no crane dead load. Resisted by the girder end connection (hold-down).`));
 }
 return [...sourced,...girder,
  compared('end-stop-bolt-tension','Front bolts · tension with shear',T,front.tension,'force','T=\\frac{P(e+t_b)}{2d};\\quad F^\\prime_{nt}=1.3F_{nt}-\\frac{F_{nt}}{\\phi F_{nv}}f_{rv}',`${n} Overturning about the heel of the base plate; lever ${f(lever)} from the front bolts. Bolt grip ${f(grip)}.`),
  compared('end-stop-bolt-shear','Bolts · shear',V,front.shear,'force','V=P/4\\le\\phi F_{nv}A_b',`${n} Four bolts share the bumper force; threads included.`),
  compared('end-stop-slip','Bolts · slip with tension',V,front.slip,'force','R_{n}=\\mu D_uT_bk_{sc};\\quad k_{sc}=1-\\frac{T_u}{D_uT_bn_b}',`${n} Pretensioned, Class B faying surfaces; front-bolt tension reduces slip resistance (k_sc = ${front.slipReduction.toFixed(3)}).`),
  compared('end-stop-bearing-base','Base plate · bolt bearing / tearout',V,plateBearing(db,bolt.hole,tb,m.Fu,e.bolts.edge,g.frontRow-g.backRow,method).capacity,'force','R_n=\\min(1.2l_ctF_u,2.4dtF_u)','Bumper force bears toward the back edge of the base plate.'),
  compared('end-stop-bearing-flange','Girder flange · bolt bearing / tearout',V,plateBearing(db,bolt.hole,flangeT,b.Fu,g.backRow,g.frontRow-g.backRow,method).capacity,'force','R_n=\\min(1.2l_ctF_u,2.4dtF_u)','W top flange only; the girder end is the edge in the direction of the force.'),
  compared('end-stop-base-prying','Base plate · thickness for no prying',tMin(T,baseB-db/2,baseP,m.Fu),tb,'length','t_{min}=\\sqrt{\\frac{4Tb^\\prime}{\\phi pF_u}}',`AISC Manual Part 9 T-stub. b = ${f(baseB)} to the nearer of the face plate and stiffener; p = ${f(baseP)}. Bolt tension is used without prying when this passes.`),
  compared('end-stop-flange-prying','Girder top flange · thickness for no prying',tMin(T,flangeB-db/2,flangeP,b.Fu),flangeT,'length','t_{min}=\\sqrt{\\frac{4Tb^\\prime}{\\phi pF_u}}',`Flange cantilevers from the web: b = ${f(flangeB)}, p = ${f(flangeP)}. ${b.kind==='cap'?'The cap web is not credited.':''}`),
  compared('end-stop-flexure','Stop body · flexure at base',P*g.contact/S,available(Fy,method,.9,1.67),'stress','f=\\frac{Pe}{S};\\quad S=I/c_{max}',`Face plate and both stiffeners at the top of the base plate, elastic. ${force}`),
  compared('end-stop-shear','Stop body · shear',P,available(.6*Fy*2*ts*Ls,method,1,1.5),'force','V_n=0.6F_y(2t_sL_s)','Both stiffeners parallel to the bumper force.'),
  compared('end-stop-face','Face plate · bending between stiffeners',P*s/4/(e.bumperDiameter*tp**2/6),available(m.Fy,method,.9,1.67),'stress','f=\\frac{Ps/4}{d_bt_p^2/6}','The face plate spans between the two stiffeners it is welded to; bumper force at midspan on a strip equal to the bumper contact diameter.'),
  compared('end-stop-face-outstand','Face plate · outstand beyond the stiffeners',6*pressure*outstand**2/2/tp**2,available(m.Fy,method,.9,1.67),'stress','f=\\frac{6}{t_p^2}\\frac{qa^2}{2};\\quad q=\\frac{P}{d_b^2},\\;a=\\frac{d_b}{2}+e_r-\\frac{s+t_s}{2}',`Contact pressure over the bumper diameter, with the bumper on the rail C/L ${f(ecc)} off the stop center; the face plate cantilevers ${f(outstand)} beyond the outer face of a stiffener.`),
  compared('end-stop-weld','Stop welds · combined throat stress',weldStress/(e.weldSize/Math.sqrt(2)),weldCapacity/(e.weldSize/Math.sqrt(2)),'stress','f_r=\\frac{1}{0.707w}\\sqrt{\\left(\\frac{Pec}{I_w}\\right)^2+\\left(\\frac{P}{L_w}\\right)^2}',`Fillets both faces of the face plate and of each stiffener to the base plate, treated as lines; stress on the effective throat of w = ${f(e.weldSize)}.`),
  compared('end-stop-stiffener-weld','Stiffener-to-face-plate welds · shear flow with bumper reaction',faceWeld/(e.weldSize/Math.sqrt(2)),weldCapacity/(e.weldSize/Math.sqrt(2)),'stress','f_r=\\frac{1}{0.707w}\\sqrt{\\left(\\frac{PQ}{4I}\\right)^2+\\left(\\frac{R_s}{2d_b}\\right)^2};\\quad R_s=P\\left(\\frac12+\\frac{e_r}{s}\\right)',`Continuous fillets both sides of each stiffener, full height ${f(Hs)} at the face. Four lines share the shear flow P·Q/I of the face plate and stiffeners acting together (Q of the face plate, ${format(Wb*tp*(uc-tp/2),'modulus',u,3)}); each stiffener takes R_s = ${format(Rs,'force',u,3)} from the face plate over the ${f(Math.min(e.bumperDiameter,Hs))} contact. No bearing of the stiffener edge on the face plate is credited.`),
  compared('end-stop-weld-minimum','Stop welds · minimum fillet',minimumFillet(Math.max(tb,tp,ts)),e.weldSize,'length','w\\ge w_{min,J2.4}','Thicker joined part controls.'),
  compared('end-stop-stiffener','Stiffener · width-thickness',Math.max(e.face.height,Ls)/ts,1.49*Math.sqrt(b.E/m.Fy),'ratio','b/t\\le1.49\\sqrt{E/F_y}','Stiffener welded on two edges, to the face plate and the base plate.',['aisc-b']),
  compared('end-stop-contact','Face · bumper contact height',g.contact+e.bumperDiameter/2,e.face.height,'length','e+d_b/2\\le H','The whole bumper bears on the face plate.'),
  compared('end-stop-width','Face · bumper contact width',e.bumperDiameter,Wb,'length','d_b\\le W','Face plate is as wide as the base plate.'),
  compared('end-stop-fit','Base plate fits the girder top',Wb,g.surfaceWidth,'length','W\\le b_{top}',b.kind==='cap'?'On the cap channel web.':'On the W top flange.'),
  compared('end-stop-stiffener-fit','Stiffeners fit on the base plate',Ls,e.base.length-g.lip-tp,'length','L_s\\le L_b-lip-t_p','Lip in front of the face plate leaves room for its front fillet.'),
  compared('end-stop-web','Girder web · local yielding and crippling at the heel',heel,webCapacity,'force','R_n=\\min[F_yt_w(c\\,k+l_b),\\;c_c t_w^2(1+3\\tfrac{l_b}{d}(\\tfrac{t_w}{t_f})^{1.5})\\sqrt{EF_yt_f/t_w}]','AISC J10.2 and J10.3 under the heel compression of the overturning couple, bearing length taken as the base plate thickness; no stiffener credit.',['aisc-j']),
  compared('end-stop-flange-edge','Girder flange · bolt edge distance',1.5*db,(b.bf-gauge)/2,'length','(b_f-g)/2\\ge1.5d_b','W flange edge controls; holes pass through the flange.'),
  compared('end-stop-base-edge','Base plate · bolt edge distance',1.5*db,Math.min((Wb-gauge)/2,e.bolts.edge),'length','e\\ge1.5d_b','Conservative standard-hole edge distance.'),
  compared('end-stop-spacing','Bolt spacing',8/3*db,Math.min(gauge,g.frontRow-g.backRow),'length','s\\ge(8/3)d_b','Between rows and across the gauge.'),
  // Heads on the base plate are held (or turned) by a socket beside the stop welds: clearance to the weld toes.
  compared('end-stop-wrench-stiffener','Head clearance · stiffener weld toes',C,g.toe.stiffener,'length','\\frac{g-s-t_s}{2}-w\\ge C_1',`Both bolt rows: bolt C/L to the toe of the ${f(e.weldSize)} stiffener-to-base fillet, ${f((gauge-s)/2-ts/2)} to the stiffener face less the weld leg. AISC Manual Table 7-15 tightening clearance C₁ = ${f(C)} for the socket on the heavy hex head or nut.`),
  compared('end-stop-wrench-face','Head clearance · face plate weld toe',C,g.toe.face,'length','c_f-w\\ge C_1',`Front bolts: C/L ${f(e.bolts.frontClear)} behind the face plate, less the ${f(e.weldSize)} face-plate-to-base fillet behind it.`),
  compared('end-stop-wrench-web','Nut clearance under flange · web fillet',C,gauge/2-k1,'length','g/2-k_1\\ge c_{wrench}',shape?'k₁ from the catalogue fillet.':'No fillet credited for a custom section.'),
  compared('end-stop-wrench-bearing','Nut clearance under flange · bearing stiffener',C,stiffenerClear,'length','|x_{bolt}-x_{st}|-t_{st}/2-w\\ge c_{wrench}','Nuts under the top flange clear the end bearing stiffeners and their fillets.'),
  ...(saddleClear===undefined?[]:[compared('end-stop-wrench-saddle','Nut clearance under flange · top tie saddle',C,saddleClear,'length','\\min|\\mathbf{x}_{bolt}-\\text{saddle}|\\ge c_{wrench}','Plan distance from each bolt to the top tie saddle and its fillets at the runway-end support.')])
 ];
}
