import {fabricationTolerance} from './fitTolerances';
import {railPadThickness} from './railSeat';
import {girderDeadLoad} from './newSteel';
import {snapQuarter} from './quarterInch';
import {runwayEnds} from './continuation';
import type {CheckResult,DesignAnalysis,ProjectInput,Properties} from './types';
import {interaction,type GirderStrength} from './aiscStrength';
import {cappedElasticProperties} from './capChannel';
import {available} from './aiscStrength';
import {boltCapacity,boltProperties,plateBearing,filletMinimum} from './connectionStrength';
import {craneCombinations} from './aistLoads';
import {independentBearings} from './simpleSupports';
import {aiscShapeByName} from '../data/aiscSections';
import {format} from './units';
import {latexNumber,withinLimit} from './math';
import {needsGirderStops,activeEndStop,stopLip,stopRailEnd,stopRailClear,stopBoltRows,stopStiffeners,stopStiffenerArrangement,stopStiffenerClear,stopBoltToStiffener,type EndStopInput} from './endStopInputs';
import {railAnchorForce} from './railClip';
import {railBearsOnStops} from './railLayout';
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
 const rows=stopBoltRows(e),backRow=rows[0],frontRow=rows.at(-1)!;
 const surfaceWidth=p.section.kind==='cap'?p.section.capWidth:p.section.bf;
 const railDepth=p.aist?.railDepth??p.railHeight;
 // Bumper centerline above the top of the base plate.
 // The bumper height is above the top of rail, which stands on the pad where there is one.
 const contact=railDepth+railPadThickness(p)+e.bumperHeight-tb;
 // Stiffeners stop an inch below the top of the face plate, and back at least the whole bumper contact.
 const stiffenerHeight=Math.min(e.face.height,snapQuarter(Math.max(e.face.height-inch,.5*e.face.height,contact+e.bumperDiameter/2),'up'));
 // Bolt C/L to the toes of the stop fillets: heads on the base plate sit beside the face plate and stiffener welds.
 const toe={face:e.bolts.frontClear-e.weldSize,stiffener:stopBoltToStiffener(e)-e.weldSize};
 return {lip,back,front,faceBack,faceFront,frontRow,backRow,rows,surfaceWidth,contact,stiffenerHeight,railEnd:stopRailEnd(e),railClear:stopRailClear(e),stiffenerEnd:faceBack-e.stiffener.length,toe};
}
/**
 * Socket tightening clearance C1 from the bolt center to an obstruction (AISC Manual Table 7-15): 1 1/4 in for
 * 3/4 in bolts, about 1.6d for larger ones. Measured to the toe of any fillet on the obstruction, so the heavy
 * hex head or nut corners and the socket wall clear the weld.
 */
/**
 * Socket (tightening) clearance C₁ from a bolt center to an obstruction: AISC Manual Table 7-15, max(1 1/4 in, 1.6d),
 * plus the 1/16 in fabrication tolerance on the location of holes and welded parts (fitTolerances.ts), so a clearance
 * at its limit still admits the socket with the shop variation.
 */
export const wrenchClearance=(db:number)=>Math.max(1.25*inch,1.6*db)+fabricationTolerance;

const u2=(p:ProjectInput)=>p.units;
const compared=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,referenceIds=['aisc-connections','tr13-load']):CheckResult=>({id,group:'End stops',title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,referenceIds});

/**
 * Overturning of the stop about the heel (back edge) of its base plate under a force F at height `arm` above the girder
 * top: the bolt rows ahead of the back row resist elastically, T_i = M d_i/(2 sum d_j^2) with d_i the row's lever from
 * the heel less the base plate thickness; the back row, next to the heel, is taken without tension. Each bolt row's
 * slip resistance is reduced by its own tension (AISC 360-16 J3.9: k_sc = 1 - T_u/(D_u T_b) for the bolts that carry
 * the tension, n_b = 1 per bolt); the rows without tension keep k_sc = 1.
 */
export function stopBoltForces(p:ProjectInput,e:EndStopInput,F:number,arm:number){
 const g=endStopGeometry(p,e),tb=e.base.thickness,method=p.method,db=e.bolts.diameter,n=2*g.rows.length,M=F*arm,V=F/n;
 const levers=g.rows.map((x,i)=>i===0?0:x-g.back-tb),sum2=levers.reduce((a,d)=>a+d*d,0);
 const tension=levers.map((d,i)=>i===0?0:d>0?M*d/(2*sum2):M>0?1e12:0);
 const rows=g.rows.map((x,i)=>{const c=boltCapacity({grade:e.bolts.grade,diameter:db,planes:1,surface:'B',shear:V,tension:tension[i],method});return {x,lever:levers[i],tension:tension[i],ksc:c.slipReduction,slip:2*c.slip,capacity:c};});
 const front=rows.at(-1)!;
 return {F,arm,M,V,n,rows,T:front.tension,lever:front.lever,front:front.capacity,slip:rows.reduce((a,r)=>a+r.slip,0),decompressed:rows.filter(r=>r.ksc<=0).length};
}
/**
 * What the nuts below the top flange must clear at the runway end: the end bearing stiffener (its center from the girder
 * end, half its thickness plus its fillet) and the runway-end top tie saddle with its fillets (plan box), as detailed.
 */
export function stopObstacles(p:ProjectInput){
 const d=p.details!,bearings=p.system==='simple'?independentBearings(p).filter(v=>v.bay===1&&v.end==='left'):[];
 const stiffenerAt=bearings[0]?bearings[0].center-bearings[0].start:d.bearing.length/2,stiffenerHalf=d.bearing.stiffenerThickness/2+d.bearing.weldSize;
 const tie=flangeTieGeometry(p),endTie=tie?.sides.includes(1)?tie.stations.find(v=>v.bay===1&&v.end==='left'):undefined,a=tie?.attachment;
 const saddle=tie&&endTie&&a?{x0:endTie.tieX-a.saddleLength/2-a.weldSize,x1:endTie.tieX+a.saddleLength/2+a.weldSize,z0:tie.rootStart-a.weldSize,z1:tie.rootEnd}:undefined;
 return {stiffenerAt,stiffenerHalf,saddle};
}
/** Nut clearances below the top flange from every bolt row: to the end bearing stiffener and to the top tie saddle. */
export function stopNutClearances(p:ProjectInput,e:EndStopInput,o=stopObstacles(p)){
 const rows=stopBoltRows(e),z=e.bolts.gauge/2,s=o.saddle;
 return {bearing:Math.min(...rows.map(x=>Math.abs(x-o.stiffenerAt)))-o.stiffenerHalf,saddle:s?Math.min(...rows.map(x=>Math.hypot(Math.max(s.x0-x,0,x-s.x1),Math.max(s.z0-z,0,z-s.z1)))):undefined,stiffenerAt:o.stiffenerAt};
}
/**
 * The two load cases of a girder-mounted stop. Bumper: P = 1.0 C_bs (LRFD; 0.67 C_bs ASD) at the bumper contact height.
 * Rail string (tight or welded rail joints: the rail floats in its clips and bears on a stop): the factored crane
 * traction and braking, 1.6 C_ls (LRFD; 1.0 C_ls ASD), applied by the rail end on the front edge of the base plate, at
 * the top of the base plate (above the pad, the rail end bears on the face plate at mid rail depth instead).
 */
export function endStopLoadCases(p:ProjectInput,e:EndStopInput){
 const g=endStopGeometry(p,e),tb=e.base.thickness,pad=railPadThickness(p),railDepth=p.aist?.railDepth??p.railHeight;
 const P=Math.max(...craneCombinations(p.method).map(c=>c.bumper))*stopBumperForce(p);
 const anchor=railAnchorForce(p),onBase=pad<tb,railArm=onBase?tb:pad+railDepth/2;
 return {bumper:{F:P,arm:g.contact+tb,contact:g.contact},rail:railBearsOnStops(p)?{F:anchor.force,factor:anchor.factor,arm:railArm,contact:onBase?0:railArm-tb,onBase}:undefined};
}
/** Stop resistance to each load case: the case force over the largest D/C of that case's strength checks. */
export function endStopResistance(p:ProjectInput){
 const e=activeEndStop(p);if(!e)return undefined;
 const cases=stopStrength(p,e),res=(c:{F:number;u:number})=>({force:c.F,utilization:c.u,resistance:c.u>0?c.F/c.u:Infinity});
 return {bumper:res(cases.bumper),rail:cases.rail&&res(cases.rail)};
}
/** Strength D/C of each case over the bolt, slip, bearing, weld and stop-body checks it loads. */
function stopStrength(p:ProjectInput,e:EndStopInput){
 const checks=endStopCaseChecks(p),u=(ids:string[],tag:string)=>Math.max(0,...checks.filter(c=>ids.includes(c.id)).map(c=>c.caseUtilization?.[tag]??0));
 const lc=endStopLoadCases(p,e),ids=['end-stop-bolt-tension','end-stop-bolt-shear','end-stop-slip','end-stop-bearing-base','end-stop-bearing-flange','end-stop-weld','end-stop-web','end-stop-flexure','end-stop-shear','end-stop-face','end-stop-face-outstand','end-stop-stiffener-weld'];
 return {bumper:{F:lc.bumper.F,u:u(ids,'bumper')},rail:lc.rail&&{F:lc.rail.F,u:u(ids,'rail')}};
}

/** Girder context for the bumper couple: design analysis, strength, properties and the end connection uplift resistance. */
export interface EndStopContext {analysis:DesignAnalysis;strength:GirderStrength;props:Properties;holdDown:number;}
type CaseCheck=CheckResult&{caseUtilization?:Record<string,number>};
/** Girder-mounted end stop checks: both load cases, each check reporting the governing one. */
export function endStopChecks(p:ProjectInput,ctx?:EndStopContext):CheckResult[]{
 return endStopCaseChecks(p,ctx).map(({caseUtilization:_,...c})=>c);
}
function endStopCaseChecks(p:ProjectInput,ctx?:EndStopContext):CaseCheck[]{
 const d=p.details;if(!d)return [];
 const e=d.endStop;
 if(!needsGirderStops(p))return e?.enabled?[{id:'end-stop',group:'End stops',title:'Girder-mounted runway end stops',status:'not-applicable',equation:'',referenceIds:['tr13-girder'],note:'Every crane stop force is taken by building-mounted stops; girder-mounted stops are not required.'}]:[];
 // Validation requires the stop design whenever a crane stop force reaches the girder.
 if(!e?.enabled)return [];
 const sourced:CheckResult[]=e.source.trim()?[]:[{id:'end-stop-source',group:'End stops',title:'Bumper data source',status:'incomplete',equation:'',referenceIds:['tr13-load'],note:'Enter the crane supplier source of the bumper force, bumper height and contact diameter.'}];
 const lc=endStopLoadCases(p,e),P=lc.bumper.F;
 const g=endStopGeometry(p,e),m=d.material,b=p.section,method=p.method,u=p.units,f=(v:number)=>format(v,'length',u,3),kf=(v:number)=>format(v,'force',u,3);
 const db=e.bolts.diameter,bolt=boltProperties(e.bolts.grade,db),C=wrenchClearance(db);
 const tb=e.base.thickness,tp=e.face.thickness,ts=e.stiffener.thickness,Ls=e.stiffener.length,Wb=e.base.width,gauge=e.bolts.gauge;
 const arrangement=stopStiffenerArrangement(e),zs=stopStiffeners(e),ns=zs.length,s=ns>1?zs[1]-zs[0]:0;
 // Both load cases on the bolts: overturning about the heel, front-row tension, shear shared by all bolts, group slip.
 const bump=stopBoltForces(p,e,P,lc.bumper.arm),rail=lc.rail&&stopBoltForces(p,e,lc.rail.F,lc.rail.arm);
 const T=bump.T,lever=bump.lever,front=bump.front,nb=bump.n,M=bump.M,pitch=Math.min(...g.rows.slice(1).map((x,i)=>x-g.rows[i]));
 const grip=tb+(b.kind==='cap'?b.capTw:0)+b.tf,flangeT=b.tf;
 // T-stub thickness for no prying (AISC Manual Part 9): t_min = sqrt(4Tb'/(phi p Fu)).
 const tMin=(T:number,bPrime:number,p:number,Fu:number)=>Math.sqrt(4*T*Math.max(bPrime,0)/available(p*Fu,method,.9,1.67));
 const baseB=Math.min(e.bolts.frontClear,stopBoltToStiffener(e)),baseP=Math.min(Wb/2,3.5*baseB);
 const flangeB=gauge/2-b.tw/2,flangeP=Math.min(pitch,3.5*flangeB);
 // Stop body at the top of the base plate: face plate plus the stiffeners, bending about the across-runway axis.
 const parts=[{A:Wb*tp,c:tp/2,I:Wb*tp**3/12},{A:ns*ts*Ls,c:tp+Ls/2,I:ns*ts*Ls**3/12}];
 const A=parts.reduce((a,v)=>a+v.A,0),uc=parts.reduce((a,v)=>a+v.A*v.c,0)/A,I=parts.reduce((a,v)=>a+v.I+v.A*(v.c-uc)**2,0),S=I/Math.max(uc,tp+Ls-uc);
 // Weld lines (both faces of the face plate and of each stiffener) treated as lines.
 const lines=[{L:Wb,u:0,along:false},{L:Wb,u:tp,along:false},...Array.from({length:2*ns},()=>({L:Ls,u:tp+Ls/2,along:true}))];
 const Lw=lines.reduce((a,l)=>a+l.L,0),wc=lines.reduce((a,l)=>a+l.L*l.u,0)/Lw,Iw=lines.reduce((a,l)=>a+(l.along?l.L**3/12:0)+l.L*(l.u-wc)**2,0),cw=Math.max(wc,tp+Ls-wc);
 const weldOf=(F:number,contact:number)=>Math.hypot(F*contact*cw/Iw,F/Lw),weldCapacity=available(.6*m.Fexx*e.weldSize/Math.sqrt(2),method,.75,2); // per unit length
 const weldStress=weldOf(P,g.contact),railWeld=rail&&lc.rail&&!lc.rail.onBase?weldOf(lc.rail.F,lc.rail.contact):0;
 // Stiffener to face plate, both sides of each stiffener over its height at the face: the shear flow that makes
 // the face plate and stiffeners act together, with the bumper reaction each stiffener takes from the face plate
 // over the contact diameter. The bumper is on the rail C/L, offset from the stop center.
 const Hs=g.stiffenerHeight,ecc=Math.abs(p.railEccentricity),Rs=ns<2?P:Math.min(P,P*(.5+ecc/s)),flow=P*Wb*tp*(uc-tp/2)/I/(2*ns),push=Rs/(2*Math.min(e.bumperDiameter,Hs));
 const faceWeld=Math.hypot(flow,push);
 // Face plate outstand beyond the stiffeners under the bumper contact pressure, as a cantilever strip.
 const outstand=Math.max(0,e.bumperDiameter/2+ecc-Math.max(...zs.map(Math.abs))-ts/2),pressure=P/e.bumperDiameter**2;
 const shape=aiscShapeByName(b.catalogueId??''),k1=b.tw/2+(shape?shape.kdes*inch-b.tf:0);
 const nut=stopNutClearances(p,e),stiffenerClear=nut.bearing,saddleClear=nut.saddle;
 // Heel compression of the overturning couple on the top flange, carried by the web without stiffener credit.
 const heel=lever>0?M/lever:1e12,lb=tb,kd=shape?shape.kdes*inch:b.tf,ratio=Math.min(lb/b.d,.2);
 const webCapacity=Math.min(available(b.Fy*b.tw*((g.back+tb/2>b.d?5:2.5)*kd+lb),method,1,1.5),available((g.back+tb/2>=b.d/2?.8:.4)*b.tw**2*(1+3*ratio*(b.tw/b.tf)**1.5)*Math.sqrt(b.E*b.Fy*b.tf/b.tw),method,.75,2));
 const railHeel=rail&&rail.lever>0?rail.M/rail.lever:0;
 const Fy=Math.min(m.Fy,b.Fy),force=`Factored bumper force ${format(P,'force',u,3)} (AIST stop combinations; ${p.method==='LRFD'?'1.0':'0.67'} C_bs) at ${f(g.contact)} above the base plate.`;
 const railText=lc.rail&&rail?` Rail string: ${kf(lc.rail.F)} (${Number(lc.rail.factor.toFixed(2))}C_ls, crane traction and braking through the floating rail) at ${f(lc.rail.arm)} above the girder top, where the rail end bears on the ${lc.rail.onBase?'front edge of the base plate':'face plate'}.`:'';
 const ends=runwayEnds(p),n=`${force}${railText} Same stop at ${ends.length===2?'both ends':`the ${ends[0]} end`} of both runways${ends.length<2?'; the runway continues beyond the other modeled end':''}. Impact is not cyclic service loading; the holes near the girder end are Category B fatigue details (Appendix A). Girder axial force and its locating end connection include the bumper force in the AIST stop combinations.`;
 // The bumper acts above the girder centroid: an end couple P*y bends the end span and changes its reactions by P*y/L.
 const cap=cappedElasticProperties(b),yTop=cap?b.d+b.capTw-cap.cy:b.d/2,y=yTop+tb+g.contact,M0=P*y;
 const span=p.system==='simple'?Math.min(...ends.map(end=>end==='left'?p.spans[0]:p.spans.at(-1)!)):p.spans.reduce((a,v)=>a+v,0);
 const girder:CheckResult[]=[];
 if(ctx){
  const stopCombos=new Set(craneCombinations(p.method).filter(c=>c.bumper>0).map(c=>`${p.method} ${c.id}`)),records=ctx.analysis.combinations.filter(c=>stopCombos.has(c.id));
  // The end couple adds to the peak moment of its own sign (taken together regardless of location), and alone reverses
  // the moment near the girder end, where the crane moment vanishes: each sign against the flexural strength of the
  // flange it compresses (AISC Chapter F by direction; interaction() takes the reverse strength for a negative moment).
  const sign=(v:number)=>v<0?-1:1;
  // The couple alone at the girder end, where the crane moment vanishes, against the strength of the flange it compresses.
  const reverse=Math.max(0,...records.map(r=>interaction(r.axial,-M0,r.lateralMoment,ctx.strength,p.method).utilization));
  // Station by station (designAnalysis stopInteraction): the couple's moment along the girder with the concurrent crane moment.
  const stations=ctx.analysis.stopInteraction,sg=ctx.analysis.governing.stopInteraction;
  const u=stations!==undefined?Math.max(stations,reverse):Math.max(reverse,...records.map(r=>interaction(r.axial,sign(r.moment)*(Math.abs(r.moment)+M0),r.lateralMoment,ctx.strength,p.method).utilization));
  const q=girderDeadLoad(p,ctx.props.weight),dead=(p.method==='LRFD'?.9:.6)*q*span/2,uplift=Math.max(0,M0/span-dead);
  girder.push(compared('end-stop-girder','Girder · stop combinations with bumper couple',u,1,'ratio','\\frac{P_r}{P_c}+\\frac{8}{9}\\left(\\frac{|M_{rx}|+Py}{M_{cx}^{\\pm}}+\\frac{M_{ry}}{M_{cy}}\\right)\\le1;\\ \\ \\frac{Py}{M_{cx}^{\\mp}}',stations!==undefined?`The bumper couple P·y = ${format(M0,'moment',u2(p),3)} (y = ${f(y)} above the girder centroid) and the locating-bearing couple P·e_b (e_b the centroid height above the bearing) applied as point couples in the girder model (${p.system==='continuous'?'continuous girder, locating support at the middle grid: the moment decays along the girder':'simple bay, locating bearing at the stop end or at the far end, the worse'}), added at every station to the concurrent crane moment of the stop combination (crane at the stop), H1 at each flange against the strength for that station's moment sign (the flange in compression: Chapter F with lateral-torsional buckling; in tension: yielding). Governing: ${stations>=reverse&&sg?`${sg.id} at x = ${f(sg.location)}, M_rx = ${sg.moment<0?'−':'+'}${format(Math.abs(sg.moment),'moment',u2(p),3)}, D/C ${stations.toFixed(2)}`:`the couple alone reversing the moment at the girder end, D/C ${reverse.toFixed(2)}`}. Also checked: the couple alone at the girder end, where the crane moment vanishes, against the strength of the flange it compresses (D/C ${reverse.toFixed(2)}), with the largest flange lateral moment of the stop combinations. Axial force includes the bumper force.`:`Peak moments of the stop combinations plus the full couple P·y = ${format(M0,'moment',u2(p),3)} (y = ${f(y)} above the girder centroid), added without regard to location, against the flexural strength of that moment's sign; and the couple alone reversing the moment at the girder end, where the crane moment vanishes, against the reverse-moment strength (the flange it compresses). Axial force includes the bumper force.`,['aisc-h','tr13-load']));
  girder.push(compared('end-stop-uplift','Far support · uplift from bumper couple',uplift,ctx.holdDown,'force','R_{up}=\\frac{Py}{L}-\\gamma_D\\frac{wL}{2}',`Shortest end span ${f(span)}; ${p.method==='LRFD'?'0.9':'0.6'} × girder, rail and added dead load only, no crane dead load. Resisted by the girder end connection (hold-down).`));
 }
 // A check of both load cases reports the governing one; each case's D/C is kept for the stop resistance (rail anchorage).
 const both=(id:string,title:string,cases:{tag:'bumper'|'rail';demand:number;capacity:number}[],quantity:CheckResult['quantity'],equation:string,note:string,refs?:string[]):CaseCheck=>{
  const ratio=(c:{demand:number;capacity:number})=>c.capacity>0?c.demand/c.capacity:c.demand>0?1e12:0,live=cases.filter(c=>c.demand>0||c.tag==='bumper'),gov=[...live].sort((a,b2)=>ratio(b2)-ratio(a))[0];
  const governs=live.length>1?` Governing case: ${gov.tag==='bumper'?'bumper':'rail string'} (bumper D/C ${ratio(live[0]).toFixed(3)}, rail string D/C ${ratio(live[1]).toFixed(3)}).`:'';
  return {...compared(id,title,gov.demand,gov.capacity,quantity,equation,note+governs,refs),caseUtilization:Object.fromEntries(cases.map(c=>[c.tag,ratio(c)]))};
 };
 const railCase=<T,>(fn:(r:NonNullable<typeof rail>)=>T)=>rail?[fn(rail)]:[];
 const baseBearing=plateBearing(db,bolt.hole,tb,m.Fu,e.bolts.edge,pitch,method).capacity,flangeBearing=plateBearing(db,bolt.hole,flangeT,b.Fu,g.backRow,pitch,method).capacity;
 const kscText=(v:typeof bump)=>v.rows.map((r,i)=>`${i===0?'back':i===v.rows.length-1?'front':'middle'} row T = ${kf(r.tension)}, k_sc = ${Math.max(0,r.ksc).toFixed(3)}${r.ksc<=0?' (front bolts decompressed: no slip resistance)':''}`).join('; ');
 const rowsText=`${g.rows.length} rows of 2 bolts (${nb} bolts)`;
 const faceNote=ns<2?'One central stiffener: the face plate cantilevers from it to each side (Face plate · outstand beyond the stiffener); it does not span between stiffeners.':`The face plate spans ${f(s)} between the two stiffeners it is welded to${arrangement==='outer'?' at the base plate edges':''}; bumper force at midspan on a strip equal to the bumper contact diameter D.`;
 const stiffText=ns<2?'the central stiffener':arrangement==='outer'?'both edge stiffeners':'both stiffeners';
 return [...sourced,...girder,
  both('end-stop-bolt-tension','Front bolts · tension with shear',[{tag:'bumper',demand:T,capacity:front.tension},...railCase(r=>({tag:'rail' as const,demand:r.T,capacity:r.front.tension}))],'force','T_u=\\frac{M\\,d}{2\\sum d^2};\\quad M=P(e+t_b);\\quad F^\\prime_{nt}=1.3F_{nt}-\\frac{F_{nt}}{\\phi F_{nv}}f_{rv}',`${n} Overturning about the heel of the base plate; ${rowsText}; the rows ahead of the back row resist elastically by their lever from the heel (front lever ${f(lever)}), the back row next to the heel is taken without tension. Bolt grip ${f(grip)}.`),
  both('end-stop-bolt-shear','Bolts · shear',[{tag:'bumper',demand:bump.V,capacity:front.shear},...railCase(r=>({tag:'rail' as const,demand:r.V,capacity:r.front.shear}))],'force',`V=P/${nb}\\le\\phi F_{nv}A_b`,`${n} ${nb} bolts share the force; threads included.`),
  both('end-stop-slip','Bolt group · slip with tension (J3.9 by bolt row)',[{tag:'bumper',demand:P,capacity:bump.slip},...railCase(r=>({tag:'rail' as const,demand:r.F,capacity:r.slip}))],'force','\\phi R_n=\\sum\\phi\\mu D_uT_bk_{sc};\\quad k_{sc}=1-\\frac{T_u}{D_uT_b}\\ge0',`${n} Pretensioned, Class B faying surfaces (μ = 0.5, D_u = 1.13), standard holes. AISC 360-16 J3.9 reduces the slip resistance only of the bolts that carry the applied tension, each by its own tension; the back row next to the heel keeps k_sc = 1. Bumper: ${kscText(bump)}.${rail?` Rail string: ${kscText(rail)}.`:''} The bolt tension check (Front bolts · tension with shear) remains the limit on the front bolts.`),
  both('end-stop-bearing-base','Base plate · bolt bearing / tearout',[{tag:'bumper',demand:bump.V,capacity:baseBearing},...railCase(r=>({tag:'rail' as const,demand:r.V,capacity:baseBearing}))],'force','R_n=\\min(1.2l_ctF_u,2.4dtF_u)','Both forces bear toward the back edge of the base plate.'),
  both('end-stop-bearing-flange','Girder flange · bolt bearing / tearout',[{tag:'bumper',demand:bump.V,capacity:flangeBearing},...railCase(r=>({tag:'rail' as const,demand:r.V,capacity:flangeBearing}))],'force','R_n=\\min(1.2l_ctF_u,2.4dtF_u)','W top flange only; the girder end is the edge in the direction of the force.'),
  compared('end-stop-base-prying','Base plate · thickness for no prying (ratio t_min/t)',tMin(T,baseB-db/2,baseP,m.Fu),tb,'length','t_{min}=\\sqrt{\\frac{4Tb^\\prime}{\\phi pF_u}}',`AISC Manual Part 9 T-stub. b = ${f(baseB)} to the nearer of the face plate and stiffener; p = ${f(baseP)}. Bolt tension is used without prying when this passes.`),
  compared('end-stop-flange-prying','Girder top flange · thickness for no prying (ratio t_min/t)',tMin(T,flangeB-db/2,flangeP,b.Fu),flangeT,'length','t_{min}=\\sqrt{\\frac{4Tb^\\prime}{\\phi pF_u}}',`Flange cantilevers from the web: b = ${f(flangeB)}, p = ${f(flangeP)}. ${b.kind==='cap'?'The cap web is not credited.':''}`),
  both('end-stop-flexure','Stop body · flexure at base',[{tag:'bumper',demand:P*g.contact/S,capacity:available(Fy,method,.9,1.67)}],'stress','f_b=Pe/S',`Face plate and ${stiffText} at the top of the base plate, elastic. ${force}`),
  both('end-stop-shear','Stop body · shear',[{tag:'bumper',demand:P,capacity:available(.6*Fy*ns*ts*Ls,method,1,1.5)}],'force',`V_n=0.6F_y(${ns>1?ns:''}t_sL_s)`,`${ns>1?'Both stiffeners':'The stiffener'} parallel to the bumper force.`),
  ns>1?both('end-stop-face','Face plate · bending between stiffeners',[{tag:'bumper',demand:P*s/4/(e.bumperDiameter*tp**2/6),capacity:available(m.Fy,method,.9,1.67)}],'stress','f_b=(Ps/4)/(Dt_p^2/6)',faceNote)
   :{id:'end-stop-face',group:'End stops',title:'Face plate · bending between stiffeners',status:'not-applicable',equation:'',note:faceNote,referenceIds:['aisc-connections']},
  both('end-stop-face-outstand',`Face plate · outstand beyond the stiffener${ns>1?'s':''}`,[{tag:'bumper',demand:6*pressure*outstand**2/2/tp**2,capacity:available(m.Fy,method,.9,1.67)}],'stress',ns>1?'f_b=\\frac{6}{t_p^2}\\frac{qa^2}{2};\\quad q=\\frac{P}{D^2},\;a=\\frac{D}{2}+e_r-\\frac{s+t_s}{2}':'f_b=\\frac{6}{t_p^2}\\frac{qa^2}{2};\\quad q=\\frac{P}{D^2},\;a=\\frac{D}{2}+e_r-\\frac{t_s}{2}',`Contact pressure q = P/D² over the bumper diameter D, with the bumper on the rail C/L ${f(ecc)} off the stop center; the face plate cantilevers ${f(outstand)} beyond the outer face of ${ns>1?'a stiffener':'the stiffener'}.`),
  both('end-stop-weld','Stop welds · combined throat stress',[{tag:'bumper',demand:weldStress/(e.weldSize/Math.sqrt(2)),capacity:weldCapacity/(e.weldSize/Math.sqrt(2))},...railCase(()=>({tag:'rail' as const,demand:railWeld/(e.weldSize/Math.sqrt(2)),capacity:weldCapacity/(e.weldSize/Math.sqrt(2))}))],'stress','f_r=\\frac{1}{0.707w}\\sqrt{\\left(\\frac{Pec}{I_w}\\right)^2+\\left(\\frac{P}{L_w}\\right)^2}',`Fillets both faces of the face plate and of each stiffener to the base plate, treated as lines; stress on the effective throat of w = ${f(e.weldSize)}.${lc.rail?.onBase?' The rail string force enters the base plate at its front edge and does not load these welds.':''}`),
  both('end-stop-stiffener-weld','Stiffener-to-face-plate welds · shear flow with bumper reaction',[{tag:'bumper',demand:faceWeld/(e.weldSize/Math.sqrt(2)),capacity:weldCapacity/(e.weldSize/Math.sqrt(2))}],'stress',ns>1?'f_r=\\frac{1}{0.707w}\\sqrt{\\left(\\frac{PQ}{4I}\\right)^2+\\left(\\frac{R_s}{2D}\\right)^2};\\quad R_s=P\\left(\\frac12+\\frac{e_r}{s}\\right)':'f_r=\\frac{1}{0.707w}\\sqrt{\\left(\\frac{PQ}{2I}\\right)^2+\\left(\\frac{P}{2D}\\right)^2}',`Continuous fillets both sides of each stiffener, full height ${f(Hs)} at the face. ${2*ns} lines share the shear flow P·Q/I of the face plate and stiffeners acting together (Q of the face plate, ${format(Wb*tp*(uc-tp/2),'modulus',u,3)}); ${ns>1?'each stiffener takes':'the stiffener takes'} R_s = ${format(Rs,'force',u,3)} from the face plate over the ${f(Math.min(e.bumperDiameter,Hs))} contact. No bearing of the stiffener edge on the face plate is credited.`),
  compared('end-stop-weld-minimum','Stop welds · minimum fillet',filletMinimum([tb,tp],[ts,tb],[ts,tp]),e.weldSize,'length','w\\ge w_{min}','AISC 360-16 Table J2.4, by the thinner part joined, for each joint (face plate to base, stiffeners to base and face).'),
  compared('end-stop-stiffener','Stiffener · width-thickness',Math.max(e.face.height,Ls)/ts,1.49*Math.sqrt(b.E/m.Fy),'ratio','b/t\\le1.49\\sqrt{E/F_y}','Stiffener welded on two edges, to the face plate and the base plate.',['aisc-b']),
  compared('end-stop-contact','Face · bumper contact height',g.contact+e.bumperDiameter/2,e.face.height,'length','e+D/2\\le H','The whole bumper (contact diameter D, center e above the base plate) bears on the face plate of height H.'),
  compared('end-stop-width','Face · bumper contact width',e.bumperDiameter,Wb,'length','D\\le W','Face plate is as wide as the base plate, W.'),
  compared('end-stop-fit','Base plate fits the girder top',Wb+2*fabricationTolerance,g.surfaceWidth,'length','W+2t_{fab}\\le b_f',`${b.kind==='cap'?'On the cap channel web.':'On the W top flange.'} t_fab = 1/16 in each side: the fabrication tolerance on the plate width and its location (AISC Code of Standard Practice §6.4, clause to be verified), so the plate stays on the flange.`),
  compared('end-stop-stiffener-fit','Stiffeners fit on the base plate',Ls,e.base.length-g.lip-tp,'length','L_s\\le N-a-t_p','Lip a in front of the face plate leaves room for its front fillet; N is the base plate length.'),
  // Across the runway the stiffeners (and their fillets) must not meet: two stiffeners need their inside fillets
  // plus 1/4 in between them; within the base plate, an edge stiffener sits on the plate.
  ...(ns>1?[compared('end-stop-stiffener-clear','Stiffeners · clear spacing across the runway',2*e.weldSize+.25*inch,stopStiffenerClear(e),'length','s-t_s\\ge2w+\\tfrac14\\,\\mathrm{in}',`Clear distance ${f(stopStiffenerClear(e))} between the ${arrangement==='outer'?'edge stiffeners':'stiffeners'}: the inside fillets of both stiffeners and 1/4 in between them. A stop sized here keeps at least max(3 in, 0.3 × stiffener height) for access to the inside fillets.`)]:[]),
  both('end-stop-web','Girder web · local yielding and crippling at the heel',[{tag:'bumper',demand:heel,capacity:webCapacity},...railCase(()=>({tag:'rail' as const,demand:railHeel,capacity:webCapacity}))],'force','R_n=\\min[F_{yw}t_w(5k+l_b),\;0.80t_w^2(1+3\\tfrac{l_b}{d}(\\tfrac{t_w}{t_f})^{1.5})\\sqrt{EF_{yw}t_f/t_w}]','AISC J10.2 and J10.3 under the heel compression of the overturning couple, bearing length taken as the base plate thickness; no stiffener credit.',['aisc-j']),
  compared('end-stop-flange-edge','Girder flange · bolt edge distance',1.5*db,(b.bf-gauge)/2,'length','(b_f-g)/2\\ge1.5d_b','W flange edge controls; holes pass through the flange.'),
  compared('end-stop-base-edge','Base plate · bolt edge distance',1.5*db,Math.min((Wb-gauge)/2,e.bolts.edge),'length','e\\ge1.5d_b','Standard-hole edge distance.'),
  compared('end-stop-spacing','Bolt spacing',8/3*db,Math.min(gauge,pitch),'length','s\\ge(8/3)d_b','Between rows and across the gauge.'),
  // Heads on the base plate are held (or turned) by a socket beside the stop welds: clearance to the weld toes.
  compared('end-stop-wrench-stiffener','Head clearance · stiffener weld toes',C,g.toe.stiffener,'length',arrangement==='inner'?'\\frac{g-s-t_s}{2}-w\\ge C_1':arrangement==='outer'?'\\frac{W-g}{2}-t_s-w\\ge C_1':'\\frac{g-t_s}{2}-w\\ge C_1',`Every bolt row: bolt C/L to the toe of the ${f(e.weldSize)} stiffener-to-base fillet, ${f(stopBoltToStiffener(e))} to the stiffener face less the weld leg. AISC Manual Table 7-15 tightening clearance C₁ = ${f(C)} for the socket on the heavy hex head or nut.`),
  compared('end-stop-wrench-face','Head clearance · face plate weld toe',C,g.toe.face,'length','c_f-w\\ge C_1',`Front bolts: C/L ${f(e.bolts.frontClear)} behind the face plate, less the ${f(e.weldSize)} face-plate-to-base fillet behind it.`),
  compared('end-stop-wrench-web','Nut clearance under flange · web fillet',C,gauge/2-k1,'length','g/2-k_1\\ge C_1',shape?'k₁ from the catalog fillet.':'No fillet credited for a custom section.'),
  compared('end-stop-wrench-bearing','Nut clearance under flange · bearing stiffener',C,stiffenerClear,'length','|x_b-x_{st}|-t_{st}/2-w\\ge C_1','Nuts under the top flange clear the end bearing stiffeners and their fillets.'),
  ...(saddleClear===undefined?[]:[compared('end-stop-wrench-saddle','Nut clearance under flange · top tie saddle',C,saddleClear,'length','\\text{bolt to saddle}\\ge C_1','Plan distance from each bolt to the top tie saddle and its fillets at the runway-end support.')])
 ];
}
