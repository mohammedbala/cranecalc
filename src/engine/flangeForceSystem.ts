/**
 * One force system per flange of an I-shaped column bracket at the column face (peer review C2), shared by the tapered
 * I haunch and the rolled W stub: each flange delivers its normal force P (tension positive; the top flange pulls, T,
 * the bottom flange pushes, C) and its lateral (in-plane) moment M_f, from the torque of the bracket carried by flange
 * bending with warping fixed at the column (AISC DG9) and from the horizontal forces.
 * - The unstiffened column takes each flange's system as one equivalent concentrated force, twice the more loaded half
 *   flange, R_u = P + 3|M_f|/b, in EVERY J10 limit state at that level: J10.1 and J10.2 at the top flange, J10.2, J10.3
 *   and J10.4 at the bottom flange (AISC 360-16 J10).
 * - A column stiffener pair `gauge` apart carries the whole system, M_f as a couple between the plates, F = P/2 ± M_f/g
 *   on one plate (coupleStiffenerForces), with no unstiffened column strength credited; J10.1-J10.4 are then reported
 *   for information, not governing.
 * - The J10.6 panel takes the net flange force; the couples add no panel shear.
 * Canonical units N, mm, MPa.
 */
import type {ProjectInput,CheckResult} from './types';
import {available} from './aiscStrength';
import {format} from './units';
import {flangeStiffenerForces,coupleStiffenerForces,type ColumnStiffenerContext,type StiffenerLevelKey} from './columnStiffeners';

/** A strength peak with the flange force system (normal force P, tension positive, and lateral moment M_f) of its governing set. */
export type FlangePeak={value:number;caseId:string;x:number;P?:number;M?:number};

/**
 * The concurrent forces of the two flanges of an I-shaped bracket on the column, from each flange's resultant P
 * (tension positive) and lateral moment M at the column face and the flange widths b = [top, bottom]: the unstiffened
 * equivalent concentrated forces `pull` (top flange, T + 3|M_f|/b) and `push` (bottom flange, C + 3|M_f|/b), the net
 * flange forces for the panel, and the stiffener forces: per plate with the couple where the stiffeners are `gauge`
 * apart, else the pair totals of flangeStiffenerForces.
 */
export function flangeColumnForces(P:[number,number],M:[number,number],b:[number,number],gauge?:number){
 const top=flangeStiffenerForces(P,M,b[0]),bottom=flangeStiffenerForces(P,M,b[1]);
 const stiffeners=gauge?coupleStiffenerForces(P,M,gauge):{upperT:top.upperT,upperC:top.upperC,lowerT:bottom.lowerT,lowerC:bottom.lowerC,plates:{upper:top.plates.upper,lower:bottom.plates.lower}};
 return {tension:Math.max(0,P[0]),compression:Math.max(0,-P[1]),pull:top.upperT,push:bottom.lowerC,stiffeners,
  /** The flange force system at each level: normal force (tension positive) and lateral moment. */
  flanges:{upper:{P:P[0],M:M[0]},lower:{P:P[1],M:M[1]}}};
}

/** Where the two flanges of a bracket meet the column, measured down from the top of the bearing seat, and their bearing lengths. */
export interface FlangeLevels {
 /** Depth of the top flange's top face below the seat top (0 where the flange is the seat). */
 top:number;
 /** Depth of the bottom flange's lowest point at the column face below the seat top. */
 bottom:number;
 /** l_b of the flange forces on the column: the flange thickness (its vertical cut at the face for a sloping flange). */
 lbTop:number;lbBottom:number;
}
/**
 * Unstiffened available strengths of the receiving column at the two flange levels (AISC 360-16 J10.1-J10.4): flange
 * local bending under the top flange, web local yielding at both, crippling and sidesway buckling under the bottom
 * flange, with the end-region expressions where the column top is close (or its height is not entered). k = tf (no
 * rolled-fillet credit).
 */
export function flangeLevelStrengths(p:ProjectInput,l:FlangeLevels){
 const c=p.details!.bracket!.receiver,E=p.section.E,method=p.method;
 const columnEnd=p.existingColumn?.enabled?p.existingColumn.height-p.existingColumn.seatElevation:0,known=!!p.existingColumn?.enabled;
 const topFlangeEnd=!known||columnEnd+l.top<10*c.flangeThickness,topWebEnd=!known||!(columnEnd+l.top>c.depth),botWebEnd=!known||!(columnEnd+l.bottom>c.depth),botCrippleEnd=!known||!(columnEnd+l.bottom>=c.depth/2);
 const N=l.lbBottom,term=botCrippleEnd&&N/c.depth>.2?4*N/c.depth-.2:3*N/c.depth,hcol=c.depth-2*c.flangeThickness,sway=(hcol/c.webThickness)/(c.unbracedLength/c.width);
 return {columnEnd,topFlangeEnd,topWebEnd,botWebEnd,botCrippleEnd,N,hcol,sway,levels:l,
  flange:available((topFlangeEnd?.5:1)*6.25*c.Fy*c.flangeThickness**2,method,.9,1.67),
  yieldTop:available(c.Fy*c.webThickness*((topWebEnd?2.5:5)*c.flangeThickness+l.lbTop),method,1,1.5),
  yieldBottom:available(c.Fy*c.webThickness*((botWebEnd?2.5:5)*c.flangeThickness+l.lbBottom),method,1,1.5),
  crippling:available((botCrippleEnd?.4:.8)*c.webThickness**2*(1+term*(c.webThickness/c.flangeThickness)**1.5)*Math.sqrt(E*c.Fy*c.flangeThickness/c.webThickness),method,.75,2),
  sidesway:sway<=1.7?available(3.3e6*c.webThickness**3*c.flangeThickness/hcol**2*.4*sway**3,method,.85,1.76):undefined};
}
export type FlangeLevelStrengths=ReturnType<typeof flangeLevelStrengths>;

/** How a bracket names its parts in the J10 checks of its flange levels. */
export interface FlangeJ10Text {
 /** Name of the receiving column in the titles ('Existing column', 'Column') and the bracket ('haunch', 'stub'). */
 column:string;bracket:string;
 /** Titles of the two levels ('top flange' / 'stub top flange'), and how the force systems are introduced in the notes. */
 level:{top:string;bottom:string};where:{top:string;bottom:string};
 /** The l_b of each level in the J10.2 notes. */
 lb:{top:string;bottom:string};
 /** The force system sentence in every note; the stiffened pair's depth ('full-depth' or 'half-depth'). */
 system:string;pair:string;
 /** Flange widths b at the top and bottom. */
 b:[number,number];
}
/**
 * The unstiffened J10.1-J10.4 checks of the receiving column at the two flange levels, with the same equivalent
 * concentrated force R_u in every limit state at a level (`pull` at the top, `push` at the bottom). With column
 * stiffeners they are reported for information, not governing (not applicable); without, they are design checks and a
 * failure calls for a column stiffener pair at each flange level.
 */
export function flangeJ10Checks(p:ProjectInput,x:{S:Record<string,FlangePeak|undefined>;J:FlangeLevelStrengths;stiffened:boolean;text:FlangeJ10Text;
 add:(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,caseId?:string,referenceIds?:string[])=>void;
 na:(id:string,title:string,equation:string,note:string,referenceIds?:string[])=>void;referenceIds:string[]}){
 const {S,J,text:t}=x,c=p.details!.bracket!.receiver,u=p.units,fmt=(v:number,q:'length'|'force'|'moment'='length')=>format(v,q,u,3);
 const {topFlangeEnd,topWebEnd,botWebEnd,botCrippleEnd,N,columnEnd}=J;
 const hook=x.stiffened?'':`No column stiffeners are provided: where a J10.1 to J10.4 check fails, a full-depth column stiffener pair at each ${t.bracket} flange level (J10.8) is required to carry the flange force system.`;
 const level=(key:'pull'|'push',sym:string,bw:number,where:string)=>{const pk=S[key];return pk?`${where}: R_u = ${sym} + 3M_f/b = ${fmt(Math.abs(pk.P??0),'force')} + 3 × ${fmt(Math.abs(pk.M??0),'moment')}${u==='US'?' × 12 in/ft':''}/${fmt(bw)} = ${fmt(pk.value,'force')} (${sym} = ${fmt(Math.abs(pk.P??0),'force')}, M_f = ${fmt(Math.abs(pk.M??0),'moment')}, b = ${fmt(bw)}, case ${pk.caseId})`:'';};
 const topSys=level('pull','T',t.b[0],t.where.top),botSys=level('push','C',t.b[1],t.where.bottom);
 const j10:{key:'pull'|'push';id:string;title:string;cap:number;eq:string;note:string}[]=[
  {key:'pull',id:'column-flange',title:`${t.column} flange · local bending at the ${t.level.top} (J10.1)`,cap:J.flange,eq:'R_u=T+3M_f/b\\le\\phi R_n=\\phi6.25F_{yf}t_f^2',
   note:`J10.1 flange local bending, t_f and F_yf of the column flange.${topFlangeEnd?' Within 10tf of the column top, or the column height not entered: half strength.':''} ${topSys}.`},
  {key:'pull',id:'column-yield-top',title:`${t.column} web · local yielding at the ${t.level.top} (J10.2)`,cap:J.yieldTop,eq:`R_u=T+3M_f/b\\le\\phi R_n=\\phi F_{yw}t_w(${topWebEnd?'2.5':'5'}k+l_b)`,
   note:`J10.2 web local yielding; k = tf of the column (no rolled fillet credit), lb = ${t.lb.top}.${topWebEnd?' End-region expression: the column top is within the column depth, or not entered.':''} ${topSys}.`},
  {key:'push',id:'column-yield-bottom',title:`${t.column} web · local yielding at the ${t.level.bottom} (J10.2)`,cap:J.yieldBottom,eq:`R_u=C+3M_f/b\\le\\phi R_n=\\phi F_{yw}t_w(${botWebEnd?'2.5':'5'}k+l_b)`,
   note:`J10.2 web local yielding; lb = ${t.lb.bottom}.${botWebEnd?' End-region expression.':''} ${botSys}.`},
  {key:'push',id:'column-crippling',title:`${t.column} web · crippling at the ${t.level.bottom} (J10.3)`,cap:J.crippling,eq:`R_u=C+3M_f/b\\le\\phi R_n=\\phi${botCrippleEnd?'0.40':'0.80'}t_w^2[1+${botCrippleEnd&&N/c.depth>.2?'(4l_b/d-0.2)':'3(l_b/d)'}(t_w/t_f)^{1.5}]\\sqrt{EF_{yw}t_f/t_w}`,
   note:`J10.3 web crippling, ${botCrippleEnd?'end-region':'interior'} expression at the bottom flange level, ${fmt(columnEnd+J.levels.bottom)} below the column top; lb = ${fmt(N)}. ${botSys}.`},
  ...(J.sidesway!==undefined?[{key:'push' as const,id:'column-sidesway',title:`${t.column} web · sidesway buckling (J10.4)`,cap:J.sidesway,eq:'R_u=C+3M_f/b\\le\\phi R_n=\\phi(C_rt_w^3t_f/h^2)[0.4((h/t_w)/(L_b/b_f))^3]',
   note:`J10.4 unrestrained compression-flange rotation; conservative Cr regardless of column moment; entered largest flange unbraced length. ${botSys}.`}]:[])];
 for(const v of j10){
  const pk=S[v.key],Ru=pk?.value??0,dc=v.cap>0?Ru/v.cap:Infinity;
  const clause=v.title.match(/\((J10\.\d)\)/)?.[1]??'J10';
  if(x.stiffened)x.na(v.id,v.title,v.eq,`Unstiffened ${clause} for information, not governing (the column is stiffened at this level): R_u = ${fmt(Ru,'force')} against φR_n = ${fmt(v.cap,'force')}, D/C ${dc.toFixed(2)}${dc>1?' (exceeded)':''}. The ${t.pair} column stiffener pair carries the flange force and its lateral moment M_f (J10.8, column stiffener checks). ${t.system} ${v.note}`,x.referenceIds);
  else x.add(v.id,v.title,Ru,v.cap,'force',v.eq,`${t.system} ${v.note}${hook?' '+hook:''}`,pk?.caseId,x.referenceIds);
 }
 if(J.sidesway===undefined)x.na('column-sidesway',`${t.column} web · sidesway buckling (J10.4)`,'(h/t_w)/(L_b/b_f)>1.7','AISC J10.4(b)(2): not applicable beyond 1.7.',x.referenceIds);
}

/**
 * The column stiffener demands of a bracket designed on its flange force systems: the largest force on one plate at
 * each level and sense, F = P/2 ± M_f/g (the strength peaks stiffUpperT, stiffUpperC, stiffLowerT, stiffLowerC with
 * their flange systems), with no unstiffened column strength credited.
 */
export function coupleStiffenerDemand(S:Record<string,FlangePeak|undefined>,gauge:number,bracket:string):Pick<ColumnStiffenerContext,'demand'|'couple'>{
 const keys=['upperT','upperC','lowerT','lowerC'] as const,peak=(k:typeof keys[number])=>S['stiff'+k[0].toUpperCase()+k.slice(1)];
 const flange:Partial<Record<`${StiffenerLevelKey}${'T'|'C'}`,{P:number;M:number}>>={};
 for(const k of keys){const v=peak(k);if(v)flange[k]={P:v.P??0,M:v.M??0};}
 return {demand:{upperT:peak('upperT'),upperC:peak('upperC'),lowerT:peak('lowerT'),lowerC:peak('lowerC')},
  couple:{gauge,flange,symbol:{upper:'T',lower:'C'},bracket}};
}
