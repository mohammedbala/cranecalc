import {available,girderStrength} from './aiscStrength';
import {aiscShapeByName,loadAiscSection} from '../data/aiscSections';
import {emptyAistInputs} from './aistLoads';
import {asceCombinations} from './asceCombinations';
import {boltCapacity,boltProperties,blockShear,plateBearing} from './connectionStrength';
import {columnResponse} from './columnAnalysis';
import {activeEndBearing} from './endBearingInputs';
import {seismicBasis,seismicCombinations} from './runwaySeismic';
import {sectionProperties} from './section';
import {supportStations,type SupportReactionSet} from './supportReactions';
import {defaultBracingDesign,type BracingDesignInput} from './longitudinalBracingInputs';
import {format} from './units';
import {latexNumber,withinLimit} from './math';
import type {CheckResult,ProjectInput,Section} from './types';
import type {ExistingColumnResult} from './existingColumn';
import type {ColumnBaseResult} from './columnBase';
import type {LongitudinalBracingResult} from './longitudinalBracing';

const inch=25.4,ksi=6.894757293168;
const up=(v:number,step=inch/4)=>Math.ceil(v/step-1e-9)*step;

/**
 * New freestanding columns with their bases designed here are braced along the runway by rod X-bracing
 * designed with its connections: a clevis and pin at each rod end on a gusset welded to the column web, a
 * crane-level strut on the column centerline that collects the longitudinal force from every column, and a
 * fillet of each bracket seat to its column flange that delivers it from the girder's locating bearing.
 */
export function designsBracing(p:ProjectInput){const c=p.existingColumn;return !!(c?.enabled&&c.isNew&&p.columnBase?.enabled&&p.longitudinalBracing?.enabled&&p.details);}
/** The entered design, or the middle span with the default connection materials. */
export function bracingDesign(p:ProjectInput):BracingDesignInput{return p.longitudinalBracing?.design??{...structuredClone(defaultBracingDesign),spans:[Math.ceil(p.spans.length/2)]};}

/**
 * Braced spans and work points. The upper work point is on the column centerline at the bearing seat, the
 * lower at the top of the base plate. Columns at the ends of a braced span take the brace overturning; the
 * left end of each simple bay locates its girder longitudinally (every support of a continuous girder is
 * taken as locating).
 */
export function bracingLayout(p:ProjectInput){
 const stations=supportStations(p),spans=[...new Set(bracingDesign(p).spans)].filter(i=>i>=1&&i<=p.spans.length).sort((a,b)=>a-b);
 const width=Math.min(...spans.map(i=>p.spans[i-1])),height=p.existingColumn!.seatElevation,diagonal=Math.hypot(width,height);
 return {stations,spans,width,height,diagonal,cos:width/diagonal,sin:height/diagonal,
  braced:stations.map((_,j)=>spans.filter(i=>i===j||i===j+1).length),locating:stations.map((_,j)=>p.system!=='simple'||j<stations.length-1)};
}
/** Distance across the runway from the column centerline to the girder web, where the longitudinal force enters. */
export const girderOffset=(p:ProjectInput)=>{const b=p.details?.bracket;return b?.enabled?b.receiver.depth/2+b.reach:p.existingColumn!.eccentricity;};

/** ASCE 7-16 Table 12.2-1 H: steel systems not specifically detailed for seismic resistance (AISC 360 only), SDC A to C. */
export const bracedSeismicSystem={label:'Steel system not specifically detailed for seismic resistance (Table 12.2-1 H)',R:3,Omega0:3,Cd:3,allowed:['A','B','C']} as const;
export interface AlongSeismic {
 basis:{SDS:number;sdc:string;R:number;Omega0:number;Cd:number;Ie:number;rho:number;Cs:number;integrityOnly:boolean};
 permitted:boolean;weight:number;QE:number;bayWeight:number;QEbay:number;parts:{runway:number;crane:number;columns:number;strut:number};
 /** Collectors and anchors take the overstrength in SDC C to F (ASCE 7 §12.10.2.1, ACI 318 §17.10.5.3). */
 overstrength:boolean;
}
/**
 * Seismic along the runway: the braced bays carry the whole line, the runway dead load, the empty cranes, the
 * columns and the strut, at the crane level. Cs = SDS Ie / R on the short-period plateau; ρ = 1.0 in SDC B and C
 * (§12.3.4.1). The directions are combined independently (§12.5.2).
 */
export function alongSeismic(p:ProjectInput,reactions:SupportReactionSet,column:Section):AlongSeismic|undefined{
 const cross=seismicBasis(p);if(!cross||!designsBracing(p))return undefined;
 const s=bracedSeismicSystem,c=p.existingColumn!,Cs=cross.integrityOnly?.01:Math.max(cross.SDS*cross.Ie/s.R,.044*cross.SDS*cross.Ie,.01);
 const runway=reactions.supports.reduce((a,v)=>a+v.D,0),crane=p.cranes.reduce((a,k)=>a+k.wheels.reduce((b,w)=>b+w.unloaded,0),0);
 const columns=reactions.supports.length*sectionProperties(column).weight*c.height,strut=strutProperties(p).weight*p.spans.reduce((a,b)=>a+b,0);
 // One girder with every crane on it reaches its locating column.
 const bayWeight=Math.max(...p.spans)*(p.deadLoad+p.railWeight+sectionProperties(p.section).weight)+crane,weight=runway+crane+columns+strut;
 return {basis:{SDS:cross.SDS,sdc:cross.sdc,R:s.R,Omega0:cross.integrityOnly?1:s.Omega0,Cd:s.Cd,Ie:cross.Ie,rho:1,Cs,integrityOnly:cross.integrityOnly},permitted:(s.allowed as readonly string[]).includes(cross.sdc),
  weight,QE:Cs*weight,bayWeight,QEbay:Cs*bayWeight,parts:{runway,crane,columns,strut},overstrength:!cross.integrityOnly&&cross.sdc>='C'};
}

/**
 * A combination acting on the braced line: H the line force, Hbay the force one girder brings to its locating
 * column, and the factors on the support's own loads (runway dead D, crane and live Cd+Cv+Ci+L+Clv, crane dead Cd,
 * lifted load Cv, side thrust Css). fs is the overturning and sliding safety factor with it.
 */
export interface BraceCase {id:string;equation:string;kind:'asce'|'stop'|'seismic';H:number;Hbay:number;D:number;live:number;Cd:number;Cv:number;side:number;seismic:boolean;overstrength:boolean;fs:number;}
export function braceCases(p:ProjectInput,reactions:SupportReactionSet,method:ProjectInput['method'],along?:AlongSeismic):BraceCase[]{
 const b=p.longitudinalBracing!,Cls=reactions.Cls,Cbs=b.bumperToBracing?Math.max(0,...p.cranes.map(c=>c.design?.bumperForce??0)):0;
 // Every crane component is live load L (ASCE 7 §4.9); W and E are the building's own forces on an existing line.
 const asce=asceCombinations(method).filter(k=>k.factors.L||k.factors.W||k.factors.E).map((k):BraceCase=>{const f=k.factors;
  return {id:`${method} ${k.id}`,equation:k.equation,kind:'asce',H:Math.abs(f.L)*Cls+Math.abs(f.W)*b.existing.W+Math.abs(f.E)*b.existing.E,Hbay:Math.abs(f.L)*Cls,D:f.D,live:f.L,Cd:0,Cv:0,side:f.L,seismic:false,overstrength:false,fs:1.5};});
 // AIST TR-13 crane stop, not with wind or seismic: LRFD 1.2(D+Cds)+Cvs+Cbs and 0.9(D+Cds)+Cbs; ASD D+Cds+Cvs+0.67Cbs and 0.6(D+Cds)+0.67Cbs.
 const lrfd=method==='LRFD',H=(lrfd?1:.67)*Cbs;
 const stops:BraceCase[]=Cbs?[{id:`${method} AIST bumper`,equation:lrfd?'1.2(D+Cds) + Cvs + Cbs':'D + Cds + Cvs + 0.67Cbs',kind:'stop',H,Hbay:H,D:lrfd?1.2:1,live:0,Cd:lrfd?1.2:1,Cv:1,side:0,seismic:false,overstrength:false,fs:1.5},
  {id:`${method} AIST bumper · least vertical`,equation:lrfd?'0.9(D+Cds) + Cbs':'0.6(D+Cds) + 0.67Cbs',kind:'stop',H,Hbay:H,D:lrfd?.9:.6,live:0,Cd:lrfd?.9:.6,Cv:0,side:0,seismic:false,overstrength:false,fs:1.5}]:[];
 // Seismic along the runway with the static crane vertical; traction may act with it as live load.
 const quake=along?seismicCombinations(method,along.basis).filter(k=>along.overstrength||!k.overstrength).map((k):BraceCase=>({id:`${method} ${k.id} along`,equation:k.equation,kind:'seismic',
  H:k.E*along.QE+k.L*Cls,Hbay:k.E*along.QEbay+k.L*Cls,D:k.D,live:0,Cd:k.L,Cv:k.L,side:0,seismic:true,overstrength:k.overstrength,fs:k.fs})):[];
 return [...asce,...stops,...quake];
}

/** Brace force into one column per unit line force: number of braced spans at the column over all of them. */
export function braceShare(p:ProjectInput,j:number){const l=bracingLayout(p);return {vertical:l.braced[j]/l.spans.length*l.height/l.width,shear:l.braced[j]/l.spans.length,locating:l.locating[j]};}

/**
 * Warping normal stress at the fixed base of a cantilever W column from a torque T applied at height z, the
 * base fully restrained against warping and the top free: bimoment B = T a tanh(z/a) at the base (an upper bound,
 * the column above z adding warping restraint) and fw = B Wno / Cw at the flange tips (AISC Design Guide 9).
 */
export function baseWarping(column:Section,T:number,z:number){
 const s=sectionProperties(column),G=column.E/2.6,a=Math.sqrt(column.E*s.Cw/(G*s.J)),B=Math.abs(T)*a*Math.tanh(z/a);
 return {a,B,stress:B*(s.h0*column.bf/4)/s.Cw};
}

export const strutSection=(p:ProjectInput):Section=>{const d=bracingDesign(p).strut;return {...loadAiscSection({...p.section,kind:'rolled'},d.shape),Fy:d.Fy,Fu:d.Fu};};
export const strutProperties=(p:ProjectInput)=>sectionProperties(strutSection(p));

/**
 * Connection geometry in mm. Upper gusset: x along the runway from the column centerline toward the braced span,
 * z up from the upper work point; lower gusset: z up from the top of the base plate. Each rod end is a clevis pin
 * through a gusset proportioned by AISC D5.2: width 2beff + dh, extension 1.33beff beyond the hole. The pin clears
 * the column flange tips and the strut (and the base plate) by a clevis envelope of 1.5 pin diameters. The strut
 * stops 1/2 in outside the flange tips, its flanges coped back so its web laps the gusset with two bolts in line.
 *
 * Rod crossing: in each braced span rod A (upper end at the lower-numbered column) is on the column centerline and
 * rod B (upper end at the higher-numbered column) in a parallel plane offset toward the girder, so the rods pass
 * at mid-bay at least 1/4 in clear. The strut web lies between the two upper gussets: on the girder face of rod A's
 * and the other face of rod B's, with a filler where the web alone does not give the offset.
 */
export function bracingGeometry(p:ProjectInput,column:Section){
 const b=p.longitudinalBracing!,d=bracingDesign(p),L=bracingLayout(p),{cos,sin}=L,base=p.columnBase!;
 const shape=aiscShapeByName(d.strut.shape),sd=(shape?.d??6)*inch,sk=(shape?.kdes??.75)*inch,stf=(shape?.tf??.4)*inch,stw=(shape?.tw??.3)*inch,sbf=(shape?.bf??6)*inch;
 const t=d.gusset.thickness,dp=d.pin.diameter,dh=dp+inch/32,beff=2*t+.63*inch,width=up(2*beff+dh),end=up(1.33*beff+dh/2),clevis=1.5*dp;
 const db=d.strut.boltDiameter,bolt=boltProperties(d.strut.grade,db),edge=up(2*db),pitch=up(3*db,inch/2),strutEnd=up(column.bf/2+inch/2);
 const bolts=[strutEnd+edge,strutEnd+edge+pitch],tabEnd=bolts[1]+edge,cope=tabEnd-strutEnd+inch/2,half=Math.max(edge,Math.floor((sd/2-sk)/(inch/4))*inch/4);
 const top=up(Math.max((column.bf/2+clevis)/cos,(sd/2+inch/4+clevis)/sin)),bottom=up(Math.max((column.bf/2+clevis)/cos,(clevis+inch/2)/sin));
 const x0=column.tw/2,plateEdge=base.plate.B/2-inch/2;
 const need=b.rod.diameter+inch/4-(t+stw),filler=need>1e-9?up(need,inch/16):0,offset=t+stw+filler;
 return {t,dp,dh,beff,width,end,a:end-dh/2,clevis,rod:b.rod.diameter,cos,sin,
  cross:{offset,filler,clear:offset-b.rod.diameter},
  strut:{shape:d.strut.shape,d:sd,bf:sbf,tf:stf,tw:stw,kdes:sk,end:strutEnd,cope,bolts,tabEnd,half,edge,pitch,bolt,lap:(t+stw)/2},
  top:{s:top,pin:[top*cos,-top*sin] as [number,number]},bottom:{s:bottom,pin:[bottom*cos,bottom*sin] as [number,number]},x0,plateEdge};
}
type Pt=[number,number];
function hull(points:Pt[]):Pt[]{
 const s=[...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(o:Pt,a:Pt,b:Pt)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
 const lower:Pt[]=[],upper:Pt[]=[];
 for(const q of s){while(lower.length>1&&cross(lower[lower.length-2],lower[lower.length-1],q)<=0)lower.pop();lower.push(q);}
 for(const q of [...s].reverse()){while(upper.length>1&&cross(upper[upper.length-2],upper[upper.length-1],q)<=0)upper.pop();upper.push(q);}
 return [...lower.slice(0,-1),...upper.slice(0,-1)];
}
/** The pin plate around a pin at distance s along unit vector u from the work point, back to the web face x0. */
function tongue(g:ReturnType<typeof bracingGeometry>,u:Pt,s:number):Pt[]{
 const v:Pt=[-u[1],u[0]],at=(k:number,side:number):Pt=>[u[0]*k+v[0]*side,u[1]*k+v[1]*side];
 // Back corners where the long edges reach the web face.
 const back=(side:number):Pt=>{const k=(g.x0-v[0]*side)/u[0];return at(k,side);};
 return [at(s+g.end,g.width/2),at(s+g.end,-g.width/2),back(g.width/2),back(-g.width/2)];
}
/**
 * Plate outlines and fillet lines. Upper: the strut tab, the pin plate and the web weld extended down to `weld`
 * length. Lower: the pin plate on the base plate, welded to the web to `weld` above the plate and to the plate.
 */
export function gussetOutlines(g:ReturnType<typeof bracingGeometry>,topWeld:number,baseWeld:number){
 const s=g.strut,tTop=tongue(g,[g.cos,-g.sin],g.top.s),tBase=tongue(g,[g.cos,g.sin],g.bottom.s),onWeb=(q:Pt)=>Math.abs(q[0]-g.x0)<1e-6;
 const webTop=Math.max(s.half,...tTop.filter(onWeb).map(q=>q[1])),webLow=Math.min(...tTop.filter(onWeb).map(q=>q[1]),webTop-topWeld);
 const upper=hull([[g.x0,webTop],[s.tabEnd,webTop],[s.tabEnd,-s.half],[g.x0,webLow],...tTop]);
 // Below the plate top the outline stays on the plate.
 const lower=hull(([[g.x0,0],[g.plateEdge,0],[g.x0,baseWeld],...tBase] as Pt[]).map((q):Pt=>q[1]<0?[Math.min(q[0],g.plateEdge),0]:q));
 const tab:Pt[]=[[g.x0,s.half],[s.tabEnd,s.half],[s.tabEnd,-s.half],[g.x0,-s.half]];
 return {upper,lower,tab,welds:{upper:{from:webLow,to:webTop},lower:{web:Math.max(...lower.filter(onWeb).map(q=>q[1])),plate:Math.max(...lower.filter(q=>Math.abs(q[1])<1e-6).map(q=>q[0]))}}};
}

/**
 * Columns where the offset rod B ends, as station indexes from 0: its top at the higher-numbered column of each
 * braced span, its base at the lower-numbered one. Its force there acts `offset` from the column centerline.
 */
export function offsetRodEnds(p:ProjectInput){const spans=bracingLayout(p).spans;return {top:(j:number)=>spans.includes(j),base:(j:number)=>spans.includes(j+1)};}
/** Elastic in-plane weld group of straight lines (both faces of the gusset): peak resultant per unit length of all lines at their ends. */
function weldGroup(lines:[Pt,Pt][],force:Pt,at:Pt){
 const length=(l:[Pt,Pt])=>Math.hypot(l[1][0]-l[0][0],l[1][1]-l[0][1]),total=lines.reduce((a,l)=>a+length(l),0);
 const cx=lines.reduce((a,l)=>a+length(l)*(l[0][0]+l[1][0])/2,0)/total,cz=lines.reduce((a,l)=>a+length(l)*(l[0][1]+l[1][1])/2,0)/total;
 const Ip=lines.reduce((a,l)=>{const L=length(l),mx=(l[0][0]+l[1][0])/2-cx,mz=(l[0][1]+l[1][1])/2-cz;return a+L**3/12+L*(mx*mx+mz*mz);},0);
 const M=(at[0]-cx)*force[1]-(at[1]-cz)*force[0];
 const peak=Math.max(...lines.flatMap(l=>l).map(([x,z])=>Math.hypot(force[0]/total-M*(z-cz)/Ip,force[1]/total+M*(x-cx)/Ip)));
 return {total,M,peak,centroid:[cx,cz] as Pt};
}

export interface BracingSystemResult {
 geometry:ReturnType<typeof bracingGeometry>;outlines:ReturnType<typeof gussetOutlines>;layout:ReturnType<typeof bracingLayout>;
 /** Connection design force: the rod's available tensile strength. */
 develop:number;strutForce:{H:number;id:string};seatForce:{F:number;id:string};
 /** Largest seismic force one girder brings to its locating bearing. */
 collector:number;
 welds:{top:number;base:number};
 seismic?:AlongSeismic&{drift:number;driftLimit:number;elastic:number};
 separation?:{across:number;along:number;building:number;buildingEntered:boolean;required:number};
 /** Torque from the offset rod at the top of the column where it ends, and the column torsion ratio with it added to the governing case. */
 rodTorsion?:{T:number;U:number;base:number};
}
/** Connections, strut, seat weld, seismic drift and separation of the designed bracing. */
export function bracingSystemAnalysis(p:ProjectInput,reactions:SupportReactionSet,brace:LongitudinalBracingResult,column:Section,columnResult?:ExistingColumnResult,base?:ColumnBaseResult):BracingSystemResult{
 const g=bracingGeometry(p,column),layout=bracingLayout(p),develop=brace.member.tension,along=alongSeismic(p,reactions,column);
 const cases=braceCases(p,reactions,p.method,along),strutCase=cases.reduce((a,c)=>c.H>a.H?c:a),seatCase=cases.reduce((a,c)=>c.Hbay>a.Hbay?c:a);
 // Weld lengths: the shortest in 1/2 in steps from 6 in that keeps the weld and the column web within their strength.
 const capacity=connectionCapacities(p,g,column),Rtop:Pt=[develop*g.cos+strutCase.H,-develop*g.sin];
 let top=6*inch;
 for(;top<36*inch;top+=inch/2){const o=gussetOutlines(g,top,6*inch),w=o.welds.upper,group=weldGroup([[[g.x0,w.from],[g.x0,w.to]]],Rtop,[0,0]);
  if(group.peak/2<=capacity.weld&&Math.abs(Rtop[0])<=webYieldLine(column,w.to-w.from,p.method))break;}
 let bottom=6*inch;
 for(;bottom<36*inch;bottom+=inch/2){const o=gussetOutlines(g,top,bottom),w=o.welds.lower,group=weldGroup([[[g.x0,0],[g.x0,w.web]],[[g.x0,0],[w.plate,0]]],[develop*g.cos,develop*g.sin],[0,0]);if(group.peak/2<=capacity.weld)break;}
 const outlines=gussetOutlines(g,top,bottom);
 let seismic:BracingSystemResult['seismic'],separation:BracingSystemResult['separation'];
 if(along){
  // Elastic crane-level displacement: the active rod's elongation and the strut's shortening across the braced span.
  const rod=Math.PI*p.longitudinalBracing!.rod.diameter**2/4,s=strutProperties(p),E=p.section.E,T=along.QE/layout.spans.length/layout.cos;
  const elastic=T*layout.diagonal/(rod*E)/layout.cos+along.QE*layout.width/(s.A*E),drift=along.basis.Cd*elastic/along.basis.Ie;
  seismic={...along,elastic,drift,driftLimit:(along.basis.Ie>=1.5?.015:along.basis.Ie>=1.25?.02:.025)*layout.height};
  if(columnResult?.seismic&&base)separation=seismicSeparation(p,column,columnResult,drift);
 }
 // The offset rod's horizontal component, the line force over the braced spans, twists the column at its top.
 let rodTorsion:BracingSystemResult['rodTorsion'];
 const t=columnResult?.torsion;
 if(t){
  const T=strutCase.H/layout.spans.length*g.cross.offset,w=baseWarping(column,T,layout.height).stress,k=t.case,ratio=k.P>=0?k.P/columnResult!.capacity.Pc:-k.P/columnResult!.capacity.Pt;
  rodTorsion={T,U:t.U+(ratio>=.2?8/9:1)*w/available(column.Fy,p.method,.9,1.67),base:t.U};
 }
 return {geometry:g,outlines,layout,develop,strutForce:{H:strutCase.H,id:strutCase.id},seatForce:{F:seatCase.Hbay,id:seatCase.id},collector:Math.max(0,...cases.filter(c=>c.seismic).map(c=>c.Hbay)),welds:{top,base:bottom},seismic,separation,rodTorsion};
}
/** Weld (both faces of the gusset) per unit length of the line, limited by the gusset and column web base metal (J2.4, J4.2). */
function connectionCapacities(p:ProjectInput,g:ReturnType<typeof bracingGeometry>,column:Section){
 const d=bracingDesign(p),m=p.details!.material,w=d.weld;
 const weld=available(.6*m.Fexx*w/Math.SQRT2,p.method,.75,2),gusset=available(.6*d.gusset.Fu*g.t,p.method,.75,2)/2,web=available(.6*column.Fu*column.tw,p.method,.75,2)/2;
 return {weld:Math.min(weld,gusset,web),metal:weld};
}
/**
 * Column web loaded out of its plane by the gusset over the weld length c: the strip of web between the flanges
 * spans b = d - 2tf with fixed edges and a central line load, Rn = 8 mp c / b, mp = Fy tw^2 / 4. The end fans are
 * not credited.
 */
export function webYieldLine(column:Section,c:number,method:ProjectInput['method']){return available(8*column.Fy*column.tw**2/4*c/(column.d-2*column.tf),method,.9,1.67);}

/**
 * ASCE 7-16 §12.12.3: separation from the existing building by δMT = √(δM1² + δM2²). δM1 is the larger maximum
 * inelastic displacement of the runway at the rail across it (column with the footing rotating on the soil) or
 * at the crane level along it (bracing); δM2 is the building's at the runway, entered from its records, else the
 * Table 12.12-1 allowable drift 0.025h at the rail as a bound.
 */
export function seismicSeparation(p:ProjectInput,column:Section,r:ExistingColumnResult,along:number){
 const c=p.existingColumn!,z=r.seismic!,b=p.columnBase!,props=sectionProperties(column),E=column.E,rail=r.railElevation;
 const unit=columnResponse(c.height,E*props.Ix,c.strong,[z.height<=c.height?{x:z.height,force:1}:{x:c.height,force:1,moment:z.height-c.height}]);
 const atRail=rail<=c.height?unit.displacement(rail):unit.displacement(c.height)+unit.rotation(c.height)*(rail-c.height);
 const arm=b.footing.thickness+b.grout+b.plate.thickness,theta=z.QE*(unit.reactions.baseMoment+unit.reactions.base*arm)/(b.soil.subgrade*b.footing.B*b.footing.L**3/12);
 const across=z.basis.Cd*(z.QE*atRail+theta*(rail+arm))/z.basis.Ie,entered=c.seismic?.building?.drift??0,building=entered>0?entered:.025*(rail+arm-b.footing.soil);
 return {across:Math.abs(across),along,building,buildingEntered:entered>0,required:Math.hypot(Math.max(Math.abs(across),along),building)};
}

export function bracingSystemChecks(p:ProjectInput,r:BracingSystemResult,column:Section):CheckResult[]{
 const d=bracingDesign(p),u=p.units,g=r.geometry,m=p.details!.material,method=p.method,checks:CheckResult[]=[],f=(v:number,q:Parameters<typeof format>[1]='force')=>format(v,q,u,3);
 const add=(id:string,group:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,refs:string[],caseId?:string)=>checks.push({id,group,title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:Number.isFinite(demand)&&capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,referenceIds:refs,caseId});
 const C='Brace connections',T=r.develop,pinArea=Math.PI*g.dp**2/4,Fy=d.gusset.Fy,Fu=d.gusset.Fu,t=g.t;
 const basis=`Connection design force: the available tensile strength of the ${f(p.longitudinalBracing!.rod.diameter,'length')} rod, ${f(T)} (J3.6/D2), so every rod end develops the rod. Gusset PL ${f(t,'length')}, Fy ${f(Fy,'stress')}, Fu ${f(Fu,'stress')}; pin ${f(g.dp,'length')} in a ${f(g.dh,'length')} hole.`;
 add('brace-pin','Brace connections','Clevis pin · double shear',T,available(.6*d.pin.Fu*2*pinArea,method,.75,2),'force','R_n=0.6F_u(2A_p)',`${basis} Pin Fu ${f(d.pin.Fu,'stress')} in two shear planes through the clevis jaws; the clevis and turnbuckle are forged parts rated to develop the rod.`,['aisc-brace-member']);
 add('brace-pin-bearing',C,'Gusset · pin bearing',T,available(1.8*Fy*t*g.dp,method,.75,2),'force','R_n=1.8F_yA_{pb}\\;(J7)',`${basis} Apb = t·d.`,['aisc-brace-member']);
 add('brace-gusset-rupture',C,'Gusset · tension rupture at the pin',T,available(Fu*2*t*g.beff,method,.75,2),'force','R_n=F_u(2tb_e),\\;b_e=2t+0.63\\,in\\;(D5.1a)',`${basis} Plate width at the hole ${f(g.width,'length')} ≥ 2be + dh (D5.2).`,['aisc-brace-member']);
 add('brace-gusset-tearout',C,'Gusset · block shear beyond the pin',T,available(.6*Fu*2*t*(g.a+g.dp/2),method,.75,2),'force','R_n=0.6F_uA_{sf},\\;A_{sf}=2t(a+d/2)\\;(D5.1b)',`${basis} Tear-out on two planes from the hole to the end: a = ${f(g.a,'length')} ≥ 1.33be (D5.2).`,['aisc-brace-member']);
 const L=g.top.s-g.x0/g.cos,whitmore=Math.min(g.dp+2*L*Math.tan(Math.PI/6),(r.outlines.welds.upper.to-r.outlines.welds.upper.from)*g.cos);
 add('brace-gusset-yield',C,'Gusset · tension yield (gross and Whitmore section)',T,Math.min(available(Fy*g.width*t,method,.9,1.67),available(Fy*whitmore*t,method,.9,1.67)),'force','R_n=F_yA_g;\\;R_n=F_yL_wt,\\;L_w=d+2L\\tan30^\\circ',`${basis} Gross width at the pin ${f(g.width,'length')}; Whitmore width ${f(whitmore,'length')} at the web weld, spread at 30° over ${f(L,'length')} from the pin and limited to the weld's width across the rod.`,['aisc-brace-member']);
 const cap=connectionCapacities(p,g,column),o=r.outlines,top=o.welds.upper,low=o.welds.lower;
 const Rtop:Pt=[T*g.cos+r.strutForce.H,-T*g.sin],Rbase:Pt=[T*g.cos,T*g.sin];
 const wt=weldGroup([[[g.x0,top.from],[g.x0,top.to]]],Rtop,[0,0]),wb=weldGroup([[[g.x0,0],[g.x0,low.web]],[[g.x0,0],[low.plate,0]]],Rbase,[0,0]);
 const governs=wt.peak/2>=wb.peak/2,weldDemand=Math.max(wt.peak,wb.peak)/2;
 add('brace-gusset-weld',C,'Gusset to column · fillet welds',weldDemand,cap.weld,'stress','f=\\sqrt{\\left(\\frac{R_x}{L}-\\frac{M z}{I_p}\\right)^2+\\left(\\frac{R_z}{L}+\\frac{M x}{I_p}\\right)^2}',`${f(d.weld,'length')} fillets both faces, E70XX, per inch of line (elastic method, no directional increase), limited by the gusset and column web base metal. Upper gusset: ${f(top.to-top.from,'length')} to the web for the developed rod and the strut force ${f(r.strutForce.H)} (${r.strutForce.id}). Lower gusset: ${f(low.web,'length')} to the web and ${f(low.plate-g.x0,'length')} to the base plate. Governs at the ${governs?'upper':'lower'} gusset. Peak ${f(weldDemand,'lineLoad')} against ${f(cap.weld,'lineLoad')}.`,['aisc-connections']);
 add('brace-column-web',C,'Column web · out-of-plane yield line at the gusset',Math.abs(Rtop[0]),webYieldLine(column,top.to-top.from,method),'force','R_n=\\frac{8m_pc}{b},\\;m_p=\\frac{F_yt_w^2}{4}',`The gusset pulls the web out of its plane with the developed rod's horizontal component and the strut force. Strip of web between the flanges, b = d - 2tf = ${f(column.d-2*column.tf,'length')}, fixed edges, line load over c = ${f(top.to-top.from,'length')}; end fans not credited. Column Fy ${f(column.Fy,'stress')}, tw ${f(column.tw,'length')}.`,['aisc-connections']);
 // Strut: E3/E4 compression with H1 for its own weight over the full span, tension, bolts, bearing and block shear.
 const S=strutSection(p),sp=sectionProperties(S),span=Math.max(...p.spans),sg=g.strut,H=r.strutForce.H;
 const member:ProjectInput={...p,section:S,unbracedLength:span,spans:[span],aist:{...(p.aist??emptyAistInputs),netFlangeArea:0,axialLength:span,bottomBraceSpacing:span,torsionalLength:span}},str=girderStrength(member,sp);
 const kD=method==='LRFD'?1.2:1,Mw=kD*sp.weight*span**2/8,ratio=H/str.compression,U=ratio>=.2?ratio+8/9*Mw/str.major:ratio/2+Mw/str.major;
 const strut=`${sg.shape} strut on the column centerline at the crane level, ${f(span,'length')} between columns, collecting the longitudinal force from every column to the braced span: H = ${f(H)} (${r.strutForce.id}), the full line force in every segment.`;
 add('brace-strut','Crane-level strut','Strut · compression with its own weight (H1)',U,1,'ratio','\\frac{P_r}{P_c}+\\frac89\\frac{M_r}{M_c}\\le1',`${strut} Pc = ${f(str.compression)} (E3/E4, L = ${f(span,'length')} both axes); Mr = ${kD}wL²/8 = ${f(Mw,'moment')}, Mc = ${f(str.major,'moment')} (F2, Lb = L).`,['aisc-e','aisc-h'],r.strutForce.id);
 const ry=Math.sqrt(sp.Iy/sp.A);
 add('brace-strut-slenderness','Crane-level strut','Strut · slenderness',span/ry,200,'ratio','L/r_y\\le200','AISC E2 user note.',['aisc-e']);
 const hole=sg.bolt.hole,web=2*sg.half,An=(web-hole)*sg.tw;
 add('brace-strut-tension','Crane-level strut','Strut · tension at the coped end',H,Math.min(available(S.Fy*sp.A,method,.9,1.67),available(S.Fu*An,method,.75,2)),'force','\\min(F_yA_g,\\;F_uA_e),\\;A_e=(h_w-d_h)t_w',`${strut} The flanges are coped back ${f(sg.cope,'length')} so the web alone (${f(web,'length')} deep) laps the gusset: net area with one hole, U = 1.`,['aisc-e']);
 const bc=boltCapacity({grade:d.strut.grade,diameter:d.strut.boltDiameter,planes:1,surface:'B',shear:H/2,tension:0,method});
 // AISC J5.2(b): a filler over 1/4 in under the strut web at the offset gusset reduces the bolt shear strength.
 const fill=g.cross.filler,fillFactor=fill>inch/4+1e-9?1-.4*(fill-inch/4)/inch:1;
 add('brace-strut-bolts','Crane-level strut','Strut bolts · shear',H,2*bc.shear*fillFactor,'force',fillFactor<1?'2\\phi F_{nv}A_b[1-0.4(t_f-0.25)]':'2\\phi F_{nv}A_b',`Two ${f(d.strut.boltDiameter,'length')} ${d.strut.grade} bolts in line, single shear, threads included, snug-tight in standard holes; pitch ${f(sg.pitch,'length')}, edge ${f(sg.edge,'length')}.${fill?` At rod B's offset gusset a ${f(fill,'length')} filler lies under the strut web${fillFactor<1?` (J5.2(b) factor ${fillFactor.toFixed(3)})`:' (1/4 in or less: no reduction, J5.2(b))'}.`:''}`,['aisc-connections']);
 const bear=Math.min(plateBearing(d.strut.boltDiameter,hole,sg.tw,S.Fu,sg.edge,sg.pitch,method).capacity,plateBearing(d.strut.boltDiameter,hole,t,Fu,sg.edge,sg.pitch,method).capacity);
 add('brace-strut-bearing','Crane-level strut','Strut bolts · bearing and tearout',H,2*bear,'force','R_n=\\min(1.2l_ctF_u,\\;2.4dtF_u)',`Strut web ${f(sg.tw,'length')} and gusset ${f(t,'length')}, the thinner governing at each bolt; the force reverses.`,['aisc-connections']);
 const blk=(th:number,Fyp:number,Fup:number)=>blockShear((sg.edge+sg.pitch)*th,(sg.edge+sg.pitch-1.5*hole)*th,(sg.half-hole/2)*th,Fyp,Fup,method);
 add('brace-strut-block','Crane-level strut','Strut web and gusset · block shear',H,Math.min(blk(sg.tw,S.Fy,S.Fu),blk(t,Fy,Fu)),'force','R_n=0.6F_uA_{nv}+U_{bs}F_uA_{nt}\\le0.6F_yA_{gv}+U_{bs}F_uA_{nt}',`Shear along the bolt line from the end and tension to the cope edge or gusset edge ${f(sg.half,'length')} from the bolt line; Ubs = 0.5.`,['aisc-connections']);
 const tab=weldGroup([[[g.x0,-sg.half],[g.x0,sg.half]]],[H,0],[0,0]);
 add('brace-strut-tab','Crane-level strut','Strut tab at other columns · welds and column web',Math.max(tab.peak/2/cap.weld,H/webYieldLine(column,2*sg.half,method)),1,'ratio','\\max\\left(\\frac{f}{\\phi R_w},\\;\\frac{H}{\\phi R_{web}}\\right)\\le1',`At columns without a rod, the strut tab ${f(2*sg.half,'length')} tall carries H with ${f(d.weld,'length')} fillets both faces to the web; the web takes it out of its plane (yield line as at the gusset).`,['aisc-connections']);
 // Rod crossing: rod B's plane offset from rod A's by the strut web and filler; the strut at rod B's upper gusset
 // laps it that far off its plane, which bends the gusset about its weak axis and its web fillets as a couple.
 const cr=g.cross,crossing=`Rod B (upper end at the higher-numbered column of the braced span) in a plane ${f(cr.offset,'length')} from rod A's on the column centerline, toward the girder: the strut web (${f(sg.tw,'length')})${cr.filler?` and a ${f(cr.filler,'length')} filler`:''} between the ${f(t,'length')} upper gussets.`;
 add('brace-rod-crossing','Brace connections','Rods · clear gap where they cross',p.longitudinalBracing!.rod.diameter+inch/4,cr.offset,'length','s\\ge d_{rod}+1/4\\,in',`${crossing} The rods pass at mid-bay ${f(cr.clear,'length')} clear, not connected.`,['aisc-brace-member']);
 const eLap=cr.offset-sg.lap,Lw=top.to-top.from,Mlap=H*eLap,plateRatio=Mlap/available(Fy*Lw*t**2/4,method,.9,1.67),weldRatio=(wt.peak/2+Mlap/(t*Lw))/cap.weld;
 add('brace-offset-gusset','Brace connections','Offset gusset · strut lap eccentricity',Math.max(plateRatio,weldRatio),1,'ratio','\\max\\left(\\frac{He}{\\phi F_yL_wt^2/4},\\;\\frac{f_w+He/(tL_w)}{\\phi R_w}\\right)\\le1',`${crossing} At that gusset the strut force H = ${f(H)} acts e = ${f(eLap,'length')} off the gusset plane: the gusset bends about its weak axis over the ${f(Lw,'length')} weld to the web, and its two fillets take He as a couple added to their in-plane peak.`,['aisc-connections'],r.strutForce.id);
 if(r.rodTorsion)add('brace-rod-torsion','Brace connections','Column · torsion with the offset rod',r.rodTorsion.U,1,'ratio','U_t+\\frac89\\frac{f_w(H s/n)}{\\phi F_y}\\le1',`The column torsion check (${r.rodTorsion.base.toFixed(3)}) with the warping stress of the offset rod's torque added at its top: the line force ${f(H)} over ${r.layout.spans.length} braced span${r.layout.spans.length>1?'s':''} at ${f(cr.offset,'length')} from the centerline, T = ${f(r.rodTorsion.T,'moment')}. At the base the same torque is in the anchor shear.`,['aisc-h'],r.strutForce.id);
 // Collector entry: the girder's longitudinal force passes from its locating bearing to the bracket seat and the column flange.
 const br=p.details!.bracket,F=r.seatForce.F;
 if(br?.enabled){
  const Lw=Math.min(br.seatLength,column.bf)-inch/2,reach=girderOffset(p)-column.d/2,M=F*reach,fw=Math.hypot(F/Lw,6*M/Lw**2);
  add('brace-seat-weld','Crane-level strut','Bracket seat to column flange · collector fillet',fw,available(.6*m.Fexx*d.seatWeld/Math.SQRT2,method,.75,2),'stress','f=\\sqrt{\\left(\\frac{F}{L}\\right)^2+\\left(\\frac{6Fe}{L^2}\\right)^2}',`At every column the girder's locating bearing bolts deliver its longitudinal force F = ${f(F)} (${r.seatForce.id}) to the bracket seat, which a ${f(d.seatWeld,'length')} top fillet ${f(Lw,'length')} long welds to the column flange. The seat carries the couple F·e, e = ${f(reach,'length')} from the flange to the girder web, in its plane. Ribs not credited.`,['aisc-connections'],r.seatForce.id);
 }
 const eb=activeEndBearing(p);
 if(r.seismic&&eb){
  const q=r.collector,bolt=boltCapacity({grade:eb.bolts.grade,diameter:eb.bolts.diameter,planes:1,surface:'B',shear:q/4,tension:0,method});
  add('brace-collector-bearing','Crane-level strut','Locating bearing · seismic longitudinal force',q,4*Math.min(bolt.slip,bolt.shear),'force','F_E\\le4\\min(\\phi R_{slip},\\;\\phi R_{nv})',`The seismic force of one girder bay with the empty crane, ${f(r.seismic.QEbay)} unfactored${r.seismic.overstrength?', with Ωo for the collector (§12.10.2.1)':''}, through the four locating bearing bolts. Traction and the crane stop are checked under End bearings.`,['aisc-connections','asce-12']);
 }
 if(r.seismic){
  const z=r.seismic,b=z.basis,src=p.existingColumn?.seismic?.source.trim();
  checks.push({id:'brace-seismic-basis',group:'Longitudinal bracing',title:'Longitudinal bracing · seismic basis along the runway',status:z.permitted?src?'pass':'unverified':'unsupported',equation:'C_s=\\frac{S_{DS}I_e}{R}\\ge0.044S_{DS}I_e\\ge0.01',referenceIds:['asce-12'],
   note:z.permitted?`${bracedSeismicSystem.label}: R = ${b.R}, Ωo = ${b.Omega0}, Cd = ${b.Cd}, designed to AISC 360 only; SDC ${b.sdc}, SDS = ${b.SDS}, Ie = ${b.Ie}, ρ = 1.0 (§12.3.4.1); Cs = ${b.Cs.toFixed(4)} on the short-period plateau. Seismic weight of the line ${f(z.weight)} (runway ${f(z.parts.runway)}, empty cranes ${f(z.parts.crane)}, columns ${f(z.parts.columns)}, strut ${f(z.parts.strut)}) at the crane level: QE = ${f(z.QE)} into the braced span${r.layout.spans.length>1?'s':''}. Directions combined independently (§12.5.2).${z.overstrength?' Collectors and anchors take Ωo.':''}`:`Seismic Design Category ${b.sdc}: the rod bracing along the runway would need an AISC 341 braced frame, which is not designed here.`});
  add('brace-seismic-drift','Longitudinal bracing','Longitudinal bracing · seismic design drift',z.drift,z.driftLimit,'length','\\delta=\\frac{C_d\\,\\delta_{xe}}{I_e}\\le\\Delta_a',`Elastic crane-level displacement ${f(z.elastic,'length')} under QE (active rod elongation and strut shortening), amplified by Cd/Ie. ASCE 7 Table 12.12-1, ${b.Ie>=1.5?'0.015':b.Ie>=1.25?'0.020':'0.025'}h at the work point, h = ${f(r.layout.height,'length')}.`,['asce-12']);
 }
 if(r.separation){
  const s=r.separation,src=p.existingColumn?.seismic?.building?.source.trim();
  checks.push({id:'brace-separation',group:'Longitudinal bracing',title:'Seismic separation from the existing building',status:'pass',equation:'\\delta_{MT}=\\sqrt{\\delta_{M1}^2+\\delta_{M2}^2}',referenceIds:['asce-12'],
   note:`ASCE 7 §12.12.3: keep the new columns, girders and rails at least δMT = ${f(s.required,'length')} clear of the existing building, as noted on S-01. Runway δM1: ${f(s.across,'length')} across the runway at the rail (cantilever columns with footing rotation, Cd/Ie) and ${f(s.along,'length')} along it at the crane level (bracing). Building δM2 = ${f(s.building,'length')}${s.buildingEntered?` from ${src||'the entered building records'}`:', taken as the Table 12.12-1 allowable drift 0.025h at the rail; replace it with the value from the building\'s records'}.`});
 }
 return checks;
}
