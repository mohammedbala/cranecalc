import {isExistingBracketType,existingBracketProfile} from './bracketProfiles';
import {format} from './units';
import type {ProjectInput,CheckResult} from './types';
import type {BracketInput} from './bracketInputs';
import {available} from './aiscStrength';
import {bracketArrangement} from './connectionOptions';
import {minimumFillet,parallelWeldGroup,transverseFilletFatigue,boltCapacity} from './connectionStrength';
import {designsBracing,bracingDesign} from './newColumnBracing';
import {validateRolledBracket} from './rolledBracket';
import {ribGeometry,ribResponse,ribFlexure,rootCornerStress,weldedRibBracket,haunchedRibErrors} from './bracketRib';
import {haunchedRibData,haunchedRibChecks} from './haunchedSeat';
import {activeEndBearing} from './endBearingInputs';
import {activeColumnStiffeners} from './columnStiffenerInputs';
import {columnStiffenerErrors,columnStiffenerChecks,stiffenedColumnChecks,panelStiffenerNote} from './columnStiffeners';

const inch=25.4;

export type BracketLoads={vertical:number;offset:number;length?:number}[];
/** Simply supported seat strip with actual uniform bearing patches and free
 * overhangs. Evaluate moment at every load/support edge and every zero-shear
 * location. Macaulay integration preserves signed simultaneous loads. */
export function seatStrip(loads:BracketLoads,gauge:number,bearingLength:number){
 const V=loads.reduce((a,v)=>a+v.vertical,0),Mx=loads.reduce((a,v)=>a+v.vertical*v.offset,0);
 const supports=[{x:-gauge/2,r:V/2-Mx/gauge},{x:gauge/2,r:V/2+Mx/gauge}];
 const patches=loads.map(v=>({a:v.offset-(v.length??bearingLength)/2,b:v.offset+(v.length??bearingLength)/2,q:v.vertical/(v.length??bearingLength)}));
 const positive=(v:number)=>Math.max(0,v);
 const moment=(x:number)=>supports.reduce((a,s)=>a+s.r*positive(x-s.x),0)-patches.reduce((a,p)=>a+p.q/2*(positive(x-p.a)**2-positive(x-p.b)**2),0);
 const shear=(x:number)=>supports.reduce((a,s)=>a+(x>=s.x?s.r:0),0)-patches.reduce((a,p)=>a+p.q*(positive(x-p.a)-positive(x-p.b)),0);
 const nodes=[...new Set([...supports.map(s=>s.x),...patches.flatMap(p=>[p.a,p.b])])].sort((a,b)=>a-b),candidates=[...nodes];
 for(let i=0;i<nodes.length-1;i++){const a=nodes[i],b=nodes[i+1],qa=patches.filter(p=>(a+b)/2>p.a&&(a+b)/2<p.b).reduce((sum,p)=>sum+p.q,0),v=shear(a+1e-7);if(qa){const x=a+v/qa;if(x>a&&x<b)candidates.push(x);}}
 return {moment:Math.max(0,...candidates.map(x=>Math.abs(moment(x)))),shear:Math.max(0,...nodes.flatMap(x=>[Math.abs(shear(x-1e-6)),Math.abs(shear(x+1e-6))])),reactions:supports.map(v=>v.r)};
}
type Peak={value:number;caseId:string;x:number};
/** Horizontal forces of a concurrent set at the seat: the locating bearing's longitudinal force and the bottom-flange lateral force through the bearing bolts, with the lateral force's offset along the runway from the grid. */
export interface SeatHorizontal {longitudinal:number;bottom:number;offset:number}
export interface BracketResults {
 strength:Record<string,Peak>;service:Record<string,Peak>;
 fatigue:{name:string;cycles:number;rib:number;seat:number;rootWeld:number;seatWeld:number;column:number;columnWeld?:number[];
  /** Haunched ribs: stress range along the sloping free edge at the critical section. */
  ribEdge?:number;
  /** With column stiffeners: range of the force on one stiffener plate at the upper (seat) and lower (rib bottom) level. */
  stiffUpper?:number;stiffLower?:number}[];
 stations:{x:number;caseId:string;vertical:number;seatMoment:number;leftRib:number;rightRib:number;rootMoment:number}[];
 /** Seat-to-column fillet candidates and, for each, the strength peaks of the weld group: rib root lines, seat line, and the seat's pull on the column flange. */
 columnWeld?:{sizes:number[];peaks:{root:Peak;seat:Peak;pull:Peak}[]};
}
/** Standard fillet sizes, 3/16 in to 3/4 in. */
const filletSizes=[3,4,5,6,7,8,10,12].map(v=>v*inch/16);
/** Seat-to-column fillet length: across the column flange, stopped 1/4 in short of each flange tip. */
export const seatColumnWeldLength=(b:BracketInput)=>Math.min(b.seatLength,b.receiver.width)-inch/2;
/**
 * Candidate sizes of the top fillet of the seat plate to the column flange. With designed crane-level bracing it
 * is the entered collector fillet; otherwise every standard size from the AISC J2.4 minimum for the thicker part.
 */
export function seatColumnWeldSizes(p:ProjectInput){
 const b=p.details!.bracket!,min=minimumFillet(Math.max(b.seatThickness,b.receiver.flangeThickness));
 return designsBracing(p)?[bracingDesign(p).seatWeld]:filletSizes.filter(w=>w>=min-1e-9);
}
/**
 * The seat-to-column fillet: the entered collector fillet with designed bracing, else the smallest candidate whose
 * seat line carries every concurrent bracket force set (the J2.4 minimum before an analysis).
 */
export function seatColumnWeld(p:ProjectInput,r?:BracketResults){
 const b=p.details!.bracket!,sizes=seatColumnWeldSizes(p),capacity=available(.6*p.details!.material.Fexx,p.method,.75,2);
 const found=r?.columnWeld?.peaks.findIndex(v=>v.seat.value<=capacity*(1+1e-9))??0,index=found<0?sizes.length-1:found;
 return {size:sizes[index],index,length:seatColumnWeldLength(b),entered:designsBracing(p),capacity,peaks:r?.columnWeld?.peaks[index]};
}
type WeldLine={a:[number,number];b:[number,number];t:number;seat:boolean};
/**
 * Bracket-to-column weld group on the column flange face: the two root fillets of each rib over its depth and the
 * top fillet of the seat across the flange. x along the runway from the grid, y up from the bottom of the ribs;
 * lines carry their own throats. Elastic section properties about the group centroid.
 */
export function columnWeldGroup(b:BracketInput,seatWeld:number){
 const h=b.ribDepth,ys=h+b.seatThickness,L=seatColumnWeldLength(b),lines:WeldLine[]=[];
 for(const side of [-1,1])for(const face of [-1,1]){const x=side*b.ribSpacing/2+face*b.ribThickness/2;lines.push({a:[x,0],b:[x,h],t:b.rootWeld/Math.SQRT2,seat:false});}
 lines.push({a:[-L/2,ys],b:[L/2,ys],t:seatWeld/Math.SQRT2,seat:true});
 const len=(l:WeldLine)=>Math.hypot(l.b[0]-l.a[0],l.b[1]-l.a[1]),mid=(l:WeldLine,i:0|1)=>(l.a[i]+l.b[i])/2;
 const A=lines.reduce((s,l)=>s+l.t*len(l),0),xc=lines.reduce((s,l)=>s+l.t*len(l)*mid(l,0),0)/A,yc=lines.reduce((s,l)=>s+l.t*len(l)*mid(l,1),0)/A;
 const Ix=lines.reduce((s,l)=>s+l.t*len(l)*((mid(l,1)-yc)**2+(l.b[1]-l.a[1])**2/12),0),Iy=lines.reduce((s,l)=>s+l.t*len(l)*((mid(l,0)-xc)**2+(l.b[0]-l.a[0])**2/12),0);
 // A haunched rib's sloping free edge meets the root at its bottom (y = 0): see columnWeldStress.
 return {lines,A,xc,yc,Ix,Iy,J:Ix+Iy,ys,L,seatThroat:seatWeld/Math.SQRT2,slope:ribGeometry(b).slope};
}
/** A concurrent force set on the bracket at the column face; Mseat is ΣV·x along the runway about the grid. */
export type SeatForceSet={V:number;Mseat:number;F:number;H:number;xH:number};
/**
 * Throat stress field of the weld group at a point (x, y) on its lines: normal to the flange n (the bracket pulling
 * away positive), shears tx along the runway and ty vertical (up positive). The forces act on the bracket: V down
 * at e from the flange, F along the runway and H away from the flange at the seat top, at reach and xH.
 */
export function columnWeldField(b:BracketInput,g:ReturnType<typeof columnWeldGroup>,e:number,f:SeatForceSet){
 const dy=g.ys-g.yc,Mx=f.V*e+f.H*dy,My=f.F*b.reach-f.H*(f.xH-g.xc),Mz=-(f.Mseat-f.V*g.xc)-f.F*dy;
 return (x:number,y:number)=>{const u=x-g.xc,v=y-g.yc,n=f.H/g.A+Mx*v/g.Ix-My*u/g.Iy,tx=f.F/g.A-Mz*v/g.J,ty=-f.V/g.A+Mz*u/g.J;return {n,tx,ty,f:Math.hypot(n,tx,ty)};};
}
/**
 * Throat stresses of the weld group under one concurrent set: the vertical load V at the far bearing edge e with
 * its seat moment along the runway, the longitudinal force F at the girder web line (reach) and the lateral force
 * H normal to the flange, both at the seat top. Peak resultant on the root and seat lines, the normal stress at
 * each end of the seat line (tension positive) and the seat's tensile pull on the flange (peak over its length).
 */
export function columnWeldStress(b:BracketInput,g:ReturnType<typeof columnWeldGroup>,e:number,f:SeatForceSet){
 const at=columnWeldField(b,g,e,f);
 let root=0,seat=0;const ends:number[]=[];
 // At the bottom of a haunched rib's root the traction-free sloping edge adds the vertical shear n tan(alpha).
 for(const l of g.lines)for(const q of [l.a,l.b]){const s=at(q[0],q[1]);if(l.seat){seat=Math.max(seat,s.f);ends.push(s.n);}else root=Math.max(root,q[1]===0&&g.slope?Math.hypot(s.n,s.tx,s.ty+s.n*g.slope):s.f);}
 return {root,seat,ends,pull:Math.max(0,...ends)*g.seatThroat*g.L};
}
/** Integral of the positive and negative parts of a linear field from n0 to n1 over a length, times a throat. */
const signedParts=(n0:number,n1:number,length:number,t:number):[number,number]=>{
 if(n0>=0&&n1>=0)return [t*length*(n0+n1)/2,0];if(n0<=0&&n1<=0)return [0,-t*length*(n0+n1)/2];
 const a=Math.max(n0,n1),c=-Math.min(n0,n1);return [t*length*a*a/(2*(a+c)),t*length*c*c/(2*(a+c))];
};
/**
 * Normal force of the weld group on the column flange above and below the group centroid, where the column
 * stiffeners at the seat and at the rib bottom take it: tension (pulling the flange) and compression totals.
 */
export function columnWeldLevels(b:BracketInput,g:ReturnType<typeof columnWeldGroup>,e:number,f:SeatForceSet){
 const at=columnWeldField(b,g,e,f),out={upperT:0,upperC:0,lowerT:0,lowerC:0};
 for(const l of g.lines){
  const mid:[number,number]=[l.a[0],g.yc],parts:[[number,number],[number,number]][]=!l.seat&&l.a[1]<g.yc&&l.b[1]>g.yc?[[l.a,mid],[mid,l.b]]:[[l.a,l.b]];
  for(const [a,c] of parts){
   const [T,C]=signedParts(at(a[0],a[1]).n,at(c[0],c[1]).n,Math.hypot(c[0]-a[0],c[1]-a[1]),l.t);
   if((a[1]+c[1])/2>=g.yc){out.upperT+=T;out.upperC+=C;}else{out.lowerT+=T;out.lowerC+=C;}
  }
 }
 return out;
}
/**
 * Concentrated forces on the column at the stiffener levels under one concurrent set, as pair totals: the larger of
 * the weld-group forces above and below its centroid and the rib model, each rib's root couple 1.5Pe/h_r at its top
 * (with half the lateral force H) and bottom, the more loaded rib taken for both plates.
 */
export function stiffenerLevelForces(b:BracketInput,groups:ReturnType<typeof columnWeldGroup>[],ribs:number[],e:number,f:SeatForceSet){
 const upper=ribs.map(v=>1.5*v*e/b.ribDepth+f.H/2),lower=ribs.map(v=>-1.5*v*e/b.ribDepth),pos=(v:number[])=>2*Math.max(0,...v);
 const out={upperT:pos(upper),upperC:pos(upper.map(v=>-v)),lowerT:pos(lower),lowerC:pos(lower.map(v=>-v))};
 for(const g of groups){const w=columnWeldLevels(b,g,e,f);for(const k of Object.keys(out) as (keyof typeof out)[])out[k]=Math.max(out[k],w[k]);}
 return out;
}
/** Two independent cantilever ribs, rectangular or tapered (haunched), continuously welded to seat
 * and column flange. Seat stiffness/diaphragm action is NOT credited for LTB.
 * The ribs take the gravity bearing load. The longitudinal force of the
 * locating bearing and the bottom-flange lateral force reach the seat through
 * the bearing bolts and the column through the seat-to-column fillet with the
 * rib root fillets (columnWeldStress); the top-flange tie connects separately.
 * No frictional sharing is credited. A tapered rib is checked on every vertical
 * section between the root and the load (ribResponse): bending and its sloping
 * free-edge stress at the critical section, shear at the shallowest loaded section.
 */
/** The rib response depends only on the bracket geometry: computed once per bracket, not once per load case. */
const ribCache=new WeakMap<BracketInput,{key:string;g:ReturnType<typeof ribGeometry>;rib:ReturnType<typeof ribResponse>}>();
function ribResponseOf(b:BracketInput,e:number,E:number,G:number){
 const key=JSON.stringify([b.ribDepth,b.ribThickness,b.seatProjection,b.tipDepth,b.arrangement,e,E,G]),hit=ribCache.get(b);
 if(hit&&hit.key===key)return hit;
 const g=ribGeometry(b),v={key,g,rib:ribResponse(g,e,E,G)};ribCache.set(b,v);return v;
}
export function bracketResponse(p:ProjectInput,loads:BracketLoads){
 const b=p.details!.bracket!,m=p.details!.material,E=p.section.E,G=E/2.6;
 const V=loads.reduce((a,v)=>a+v.vertical,0),Mx=loads.reduce((a,v)=>a+v.vertical*v.offset,0);
 const ribs=[V/2-Mx/b.ribSpacing,V/2+Mx/b.ribSpacing];
 // Entire patch at its far transverse edge; no uniform-patch relief.
 const e=b.reach+p.details!.bearing.width/2,{g,rib}=ribResponseOf(b,e,E,G);
 const R=Math.max(...ribs.map(Math.abs)),M=R*rib.critical.moment,normal=R*rib.critical.bending,shear=R*rib.load.shear;
 const root=parallelWeldGroup({length:b.ribDepth,gauge:b.ribThickness,size:b.rootWeld,Fexx:m.Fexx,method:p.method,vx:0,vy:R,normal:0,mx:R*e,my:0,mz:0});
 // Haunched rib: the sloping free edge meets the root fillets at their bottom ends.
 const rootDemand=g.tapered?Math.max(root.demand,rootCornerStress(R*e*(b.ribDepth/2)/root.Ix,R/root.A,g.slope)):root.demand;
 const seat=seatStrip(loads,b.ribSpacing,p.details!.bearing.length);
 const seatNormal=6*seat.moment/(p.details!.bearing.width*b.seatThickness**2);
 const seatShear=1.5*seat.shear/(p.details!.bearing.width*b.seatThickness);
 const weldLength=p.details!.bearing.width,seatWeld=R/(2*(b.seatWeld/Math.sqrt(2))*weldLength);
 const receiverForce=ribs.reduce((sum,v)=>sum+1.5*Math.abs(v)*e/b.ribDepth,0);
 // Each rib pulls on the column flange over its tension zone (half the rib depth), at m from the web face.
 const ribTension=ribs.map(v=>1.5*v*e/b.ribDepth);
 // Column flange stress along the column at the rib weld toes: the whole bracket moment V·e_c on the receiving
 // section (no split above and below the bracket). Local flange bending peaks at the web root, not at the rib toe.
 const c=b.receiver,colI=2*c.width*c.flangeThickness*((c.depth-c.flangeThickness)/2)**2+c.webThickness*(c.depth-2*c.flangeThickness)**3/12,colS=colI/(c.depth/2);
 const columnStress=ribs.map(()=>V*(e+c.depth/2)/colS);
 const uplift=loads.reduce((sum,v)=>sum+Math.max(0,-v.vertical),0);
 const perForce=R>0?rootDemand/R:0,seatPerForce=1/(2*(b.seatWeld/Math.sqrt(2))*weldLength);
 const Fb=available(m.Fy,p.method,.9,1.67),Fv=available(.6*m.Fy,p.method,.9,1.67);
 // A rectangular rib's root is its critical section and its bottom edge is level: the stresses coincide.
 const haunched=g.tapered?{ribRootMoment:R*e,ribRootNormal:R*rib.root.bending,ribRootShear:R*rib.root.shear,ribEdge:R*rib.critical.edge}:undefined;
 return {V,Mx,ribs,e,R,M,normal,shear,seatNormal,seatShear,ribTension:Math.max(...ribTension.map(Math.abs)),haunched,
  // Fatigue at the rib root: the stress along the edge at the bottom of the root (the level bottom edge of a rectangular rib).
  signed:{rib:ribs.map(v=>v*rib.root.edge),rootWeld:ribs.map(v=>v*perForce),seatWeld:ribs.map(v=>v*seatPerForce),column:columnStress,seat:[seatNormal],...(g.tapered?{ribEdge:ribs.map(v=>v*rib.critical.edge)}:{})},
  rootWeld:rootDemand,rootBase:rootDemand*root.A/(2*b.ribDepth*Math.min(b.ribThickness,b.receiver.flangeThickness)),seatWeld,receiverForce,uplift,
  // Interpolation-error bound |v(x)| <= max|M/EI| |(x-r1)(x-r2)|/2
  // for a seat with zero displacement at each rib, including both overhangs.
  deflection:R*rib.delta+seat.moment/(2*E*(p.details!.bearing.width*b.seatThickness**3/12))*Math.max(b.ribSpacing**2/4,(b.seatLength**2-b.ribSpacing**2)/4),rotation:R*rib.theta,
  interaction:R*rib.interaction(Fb,Fv)};
}
/** Column flange strip at each rib: 45° spread from the rib tension zone (half its depth) to the web root. */
export function receiverStrip(p:ProjectInput){
 const b=p.details!.bracket!,c=b.receiver,m=b.ribSpacing/2-c.webThickness/2,N=b.ribDepth/2;
 return {m,N,length:N+2*Math.max(0,m)};
}
/** F11 flexure of a rib at its root (ribFlexure gives any section of a tapered rib). */
export function rectangularRibFlexure(b:BracketInput,E:number,Fy:number,method:ProjectInput['method']){
 const {slenderness,nominal,capacity}=ribFlexure(b,E,Fy,method,0);return {slenderness,nominal,capacity};
}
export function createBracketCollector(p:ProjectInput){
 if(!p.details?.bracket?.enabled||!weldedRibBracket(p.details.bracket))return undefined;
 const sizes=seatColumnWeldSizes(p),groups=sizes.map(w=>columnWeldGroup(p.details!.bracket!,w)),none={value:0,caseId:'',x:0};
 const tapered=ribGeometry(p.details.bracket).tapered,stiff=!!activeColumnStiffeners(p.details.bracket),eb=activeEndBearing(p);
 const result:BracketResults={strength:{},service:{},fatigue:p.details.spectrum.map(v=>({name:v.name,cycles:v.cycles,rib:0,seat:0,rootWeld:0,seatWeld:0,column:0,columnWeld:sizes.map(()=>0),...(tapered?{ribEdge:0}:{}),...(stiff?{stiffUpper:0,stiffLower:0}:{})})),stations:[],
  columnWeld:{sizes,peaks:sizes.map(()=>({root:{...none},seat:{...none},pull:{...none}}))}};
 // Signed extremes per bin, key and rib: a gravity bracket does not reverse, so the range is max - min.
 const extremes=p.details.spectrum.map(()=>new Map<string,{min:number;max:number}>());
 const range=(bin:number,id:string,value:number)=>{const x=extremes[bin].get(id)??{min:0,max:0};x.min=Math.min(x.min,value);x.max=Math.max(x.max,value);extremes[bin].set(id,x);return x.max-x.min;};
 const observe=(kind:'strength'|'service'|'fatigue',caseId:string,x:number,loads:BracketLoads,bin:number,horizontal?:SeatHorizontal)=>{
  const b=p.details!.bracket!,h=horizontal??{longitudinal:0,bottom:0,offset:0};
  const selfWeight=(b.seatLength*b.seatProjection*b.seatThickness+2*ribGeometry(b).area*b.ribThickness)*p.section.density*9.80665/1e9;
  const r=bracketResponse(p,kind==='strength'?[...loads,{vertical:selfWeight*(p.method==='LRFD'?1.4:1),offset:0,length:b.seatLength}]:loads);
  // The seat-to-column fillet and the rib root fillets as one group under the whole concurrent set. The lateral
  // force is taken in both senses: without side thrust its sense follows the rail eccentricity, either way.
  const sets=(kind==='fatigue'?[h.bottom]:[h.bottom,-h.bottom]).map(H=>({V:r.V,Mseat:r.Mx,F:h.longitudinal,H,xH:h.offset}));
  if(kind==='fatigue'){
   const f=result.fatigue[bin];
   for(const [key,values] of Object.entries(r.signed))values.forEach((value,i)=>{f[key as 'rib']=Math.max(f[key as 'rib'],range(bin,`${key}:${i}`,value));});
   groups.forEach((g,i)=>columnWeldStress(b,g,r.e,sets[0]).ends.forEach((value,j)=>{f.columnWeld![i]=Math.max(f.columnWeld![i],range(bin,`columnWeld:${i}:${j}`,value));}));
   // Force on each column stiffener plate: its rib's root couple at the seat with half the lateral force, and at the rib bottom.
   if(stiff)r.ribs.forEach((v,i)=>{const c=1.5*v*r.e/b.ribDepth;f.stiffUpper=Math.max(f.stiffUpper!,range(bin,`stiffUpper:${i}`,c+sets[0].H/2));f.stiffLower=Math.max(f.stiffLower!,range(bin,`stiffLower:${i}`,-c));});
   return;
  }
  if(kind==='strength')groups.forEach((g,i)=>{const peak=result.columnWeld!.peaks[i];for(const set of sets){const w=columnWeldStress(b,g,r.e,set);
   for(const [key,value] of [['root',w.root],['seat',w.seat],['pull',w.pull]] as const)if(value>peak[key].value)peak[key]={value,caseId,x};}});
  const put=(key:string,value:number)=>{if(!result.strength[key]||value>result.strength[key].value)result.strength[key]={value,caseId,x};};
  // Concentrated forces at the column stiffener levels, both senses (a reversed set pushes at the seat and pulls at the rib bottom).
  if(kind==='strength'&&stiff)for(const set of sets){const v=stiffenerLevelForces(b,groups,r.ribs,r.e,set);put('stiffUpperT',v.upperT);put('stiffUpperC',v.upperC);put('stiffLowerT',v.lowerT);put('stiffLowerC',v.lowerC);}
  // Uplift held down by the bolted end bearings: each lifting girder end pulls the seat up through its two bolt rows
  // (half at each, over a washer two bolt diameters long) instead of bearing on it; the bracket self-weight is not credited.
  if(kind==='strength'&&eb&&loads.some(v=>v.vertical<0)){
   const L=p.details!.bearing.length,row=L/2-eb.bolts.edge,washer=2*eb.bolts.diameter;
   const up=loads.flatMap(v=>{if(v.vertical>=0)return [v];const c=v.offset-Math.sign(v.offset)*.3*L;return [-1,1].map(s=>({vertical:v.vertical/2,offset:c+s*row,length:washer}));});
   const q=bracketResponse(p,up);
   for(const [key,value] of Object.entries({upUplift:q.uplift,upRibMoment:q.M,upRibShear:q.shear,upInteraction:q.interaction,upSeatNormal:q.seatNormal,upSeatShear:q.seatShear,upRootWeld:q.rootWeld,upSeatWeld:q.seatWeld,upRibTension:q.ribTension}))put(key,value);
  }
  const target=kind==='strength'?result.strength:result.service;
  const values=kind==='strength'?{vertical:Math.abs(r.V),ribReaction:r.R,ribMoment:r.M,ribNormal:r.normal,ribShear:r.shear,interaction:r.interaction,seatNormal:r.seatNormal,seatShear:r.seatShear,rootWeld:r.rootWeld,rootBase:r.rootBase,seatWeld:r.seatWeld,receiverForce:r.receiverForce,ribTension:r.ribTension,uplift:r.uplift,...r.haunched}:{vertical:Math.abs(r.V),deflection:r.deflection,rotation:r.rotation};
  for(const [key,value] of Object.entries(values))if(!target[key]||value>target[key].value)target[key]={value,caseId,x};
  if(kind==='strength'){
   const old=result.stations.find(v=>v.x===x);
   if(!old||Math.max(Math.abs(old.leftRib),Math.abs(old.rightRib))<r.R){const row={x,caseId,vertical:r.V,seatMoment:r.Mx,leftRib:r.ribs[0],rightRib:r.ribs[1],rootMoment:r.V*r.e};if(old)Object.assign(old,row);else result.stations.push(row);}
  }
 };
 return {result,observe};
}
export function validateBracket(p:ProjectInput){
 const b=p.details?.bracket;if(!b?.enabled)return [];
 const stiffeners=columnStiffenerErrors(p);
 if(isExistingBracketType(bracketArrangement(b)))return stiffeners;
 if(bracketArrangement(b)==='rolled-corbel'){const rolled=validateRolledBracket(p);return rolled.some(v=>v.includes('corbelShape'))?rolled:[...rolled,...stiffeners];}
 const errors:string[]=[...stiffeners],d=p.details!,r=b.receiver;
 const add=(bad:boolean,message:string)=>{if(bad)errors.push('details.bracket: '+message);};
 add(b.reach<=d.bearing.width/2,'bearing patch must lie clear of the column face.');
 add(b.seatProjection<b.reach+d.bearing.width/2,'seat and ribs must extend beyond the complete bearing patch.');
 // Simple spans: both girder ends' bearings either side of the joint. Continuous: the runway-end bearing, which runs
 // inboard from the girder end on the grid, so the typical seat reaches one bearing length each way.
 const endOffset=p.system==='simple'?(d.simpleSupport?.endGap??25.4)/2+d.bearing.length/2:d.bearing.length/2;
 add(b.seatLength<2*endOffset+d.bearing.length,p.system==='simple'?'seat must cover both independent bearing plates.':'seat must cover the runway-end bearing plate, which runs inboard from the grid.');
 if(bracketArrangement(b)!=='rolled-corbel'){
  add(b.ribSpacing+b.ribThickness+2*b.seatWeld>b.seatLength,'rib welds must fit below the seat.');
  add(b.ribSpacing+b.ribThickness+2*b.rootWeld+12.7>r.width,'both root welds must fit within the receiving column flange.');
  add(b.ribSpacing<=b.ribThickness+2*b.rootWeld,'rib root welds overlap.');
 }
 add(r.depth<=2*r.flangeThickness||r.webThickness>=r.width,'invalid receiving column I-section.');
 errors.push(...haunchedRibErrors(b));
 add(r.Fu<r.Fy,'receiver Fu must be at least Fy.');
 add(b.ribDepth<4*b.rootWeld||d.bearing.width<4*b.seatWeld,'effective weld lengths must be at least four weld sizes.');
 add(p.scope!=='design'||!p.aist?.runwayOnly,'bracket design requires the detailed runway design model.');
 return errors;
}
/** serviceReaction: largest unfactored support reaction with all cranes, impact and dead load (the AIST §5.9.2 basis). */
export function bracketChecks(p:ProjectInput,r:BracketResults,serviceReaction?:number):CheckResult[]{
 const b=p.details!.bracket!,m=p.details!.material,c=b.receiver,E=p.section.E,checks:CheckResult[]=[];
 // A haunched (tapered) rib: its geometry and critical section for the rib checks and notes.
 const hr=ribGeometry(b).tapered?haunchedRibData(p):undefined,hf=(v:number)=>format(v,'length',p.units,3);
 // byOthers: confirmation that an adequacy outside this calculation is addressed elsewhere; never reported as a pass.
 const gate=(id:string,title:string,ok:boolean,note:string,byOthers=false)=>checks.push({id:'bracket-'+id,group:'Column bracket',title,status:ok?(byOthers?'excluded':'pass'):'unverified',equation:'',note,referenceIds:['bracket-basis']});
 gate('receiver','Receiving column · surveyed geometry and material',c.confirmed&&!!c.source.trim(),c.source?`${c.source} Survey data only; the receiving column member, frame and foundation are not checked here (see Supporting structure).`:'Enter and confirm surveyed receiving-column geometry and material; the reference frame is not a capacity input.');
 gate('load-path','Bracket load paths / top-flange tie connected separately',b.loadPathConfirmed,(hr?'Two tapered (haunched) rib plates':'Two rectangular ribs')+' and a seat plate welded directly to the column flange, the seat also by a top fillet across the flange. The ribs carry the vertical bearings. The bearing bolts deliver the locating end\'s longitudinal force and the bottom-flange lateral force to the seat, checked below with the seat and rib root fillets as one weld group and the column flange and web under the seat. The top-flange tie connects to the column independently; '+(p.existingColumn?.enabled&&p.existingColumn.isNew?'its column-side connection is checked with the flange attachment, and uplift is restrained at the bolted bearings.':'its column-side adequacy, and any uplift restraint, are by others.'),!(p.existingColumn?.enabled&&p.existingColumn.isNew));
 const add=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,caseId?:string,refs=['bracket-basis','tr13-bracket'])=>checks.push({id:'bracket-'+id,group:'Column bracket',title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&demand<=capacity*(1+1e-9)?'pass':'fail',equation,note,caseId,referenceIds:refs});
 const from=(key:string,id:string,title:string,capacity:number,q:CheckResult['quantity'],eq:string,note:string)=>{const peak=r.strength[key];add(id,title,peak?.value??0,capacity,q,eq,note,peak?.caseId);};
 const common='Every concurrent case of the bracket design force envelope: all strength combinations and crane positions, each bay carrying the longitudinal force in either direction with its end couple, and a wheel over a shared grid on either girder end; impact included. Full bracket self-weight added with 1.4 LRFD / 1.0 ASD factor at the conservative bearing eccentricity. Ribs at ±g/2 take P±=V/2±Σ(Vi xi)/g; full patch at its far transverse edge. No seat-flange composite section credit.';
 if(hr){
  const x=hr.rib.critical,taper=`Ribs taper from ${hf(hr.g.root)} at the root to ${hf(hr.g.tip)} at the seat edge over ${hf(hr.g.length)}; e = ${hf(hr.e)} to the far bearing edge.`;
  from('ribMoment','rib-flexure','Haunched ribs · flexure / lateral buckling at the critical section',ribFlexure(b,E,m.Fy,p.method,x.x).capacity,'moment','P_\\pm=V/2\\pm M_s/g;\\;h(x)=h_r-(h_r-h_t)\\tfrac{x}{L};\\;x_c=\\max[0,\\min(e,\\,2e-h_r/s)];\\;M_r=|P_\\pm|(e-x_c);\\;M_n=\\min(F_yZ,F_{cr}S)\\big|_{x_c}',`${common} ${taper} The bending stress (e − x)/S(x) is greatest at x_c = ${hf(x.x)} from the column face, depth ${hf(x.depth)} (s = (h_r − h_t)/L); the root is checked separately below. AISC F11 rectangular bar at that section with Lb = 2L and the slenderness of the root depth; doubled cantilever length is a conservative model assumption.`);
  from('ribShear','rib-shear','Haunched ribs · shear at the shallowest loaded section',available(.6*m.Fy,p.method,.9,1.67),'stress','\\tau=1.5|P|/[h(e)\\,t]',`${common} ${taper} The whole rib reaction crosses every section up to the load: the shallowest, at the far bearing edge, is ${hf(hr.rib.load.depth)} deep. Elastic peak shear; no relief from the inclined free-edge force (Résal effect) and no plastic shear distribution.`);
  from('interaction','rib-interaction','Haunched ribs · combined elastic stress',1,'ratio','\\max_{0\\le x\\le e}\\left[\\frac{|P|(e-x)}{S(x)F_b}+\\frac{1.5|P|}{h(x)tF_v}\\right]\\le1','Conservative linear interaction bounds first yield under concurrent bending and shear on every vertical section between the root and the load; F11 stability and the free edge checked separately.');
 }else{
 from('ribMoment','rib-flexure','Bracket ribs · flexure / lateral buckling',rectangularRibFlexure(b,E,m.Fy,p.method).capacity,'moment','P_\\pm=V/2\\pm M_s/g;\\quad M_r=|P_\\pm|e;\\quad M_n=F_{11}(L_b=2L,C_b=1)',common+' AISC F11 rectangular bars; doubled cantilever length is a conservative model assumption.');
 from('ribShear','rib-shear','Bracket ribs · shear',available(.6*m.Fy,p.method,.9,1.67),'stress','\\tau=1.5|P|/(ht)',common+' Elastic peak shear; no plastic shear distribution.');
 from('interaction','rib-interaction','Bracket ribs · combined elastic stress',1,'ratio','|f_b|/F_b+|\\tau|/F_v\\le1','Conservative linear interaction bounds first yield under concurrent bending and shear; F11 stability checked separately.');
 }
 if(hr)haunchedRibChecks(p,r,add,common);
 from('seatNormal','seat-flexure','Spreader seat · plate bending',available(m.Fy,p.method,.9,1.67),'stress','M(x)=\\sum R_j\\langle x-r_j\\rangle-\\sum(q_i/2)[\\langle x-a_i\\rangle^2-\\langle x-b_i\\rangle^2];\\quad f=6M_{max}/(b_pt_p^2)','Uniform contact under each actual bearing patch; simultaneous rib reactions. Evaluates load/support edges and all interior zero-shear locations, including both overhangs. Effective strip width is the transverse bearing width.');
 from('seatShear','seat-shear','Spreader seat · peak shear',available(.6*m.Fy,p.method,.9,1.67),'stress','\\tau=1.5|V_{strip,max}|/(b_pt_p)','Maximum absolute strip shear on either side of each load and rib-support edge; effective strip width is the transverse bearing width.');
 const wr=parallelWeldGroup({length:b.ribDepth,gauge:b.ribThickness,size:b.rootWeld,Fexx:m.Fexx,method:p.method,vx:0,vy:0,normal:0,mx:0,my:0,mz:0});
 from('rootWeld','root-weld','Rib-to-column · eccentric fillet welds',wr.capacity,'stress',hr?'f_b=\\frac{Pe\\,h_r}{2I_w};\\quad f_w=\\max\\left[\\sqrt{(P/A_w)^2+f_b^2},\\;\\sqrt{(P/A_w+f_b\\tan\\alpha)^2+f_b^2}\\right]':'f_w=\\sqrt{(P/A_w)^2+(Pe\\,h/(2I_w))^2}','Two continuous vertical root fillets per rib. Elastic endpoint resultant includes eccentric moment.'+(hr?` At the bottom of the root the traction-free sloping edge (α = ${hr.degrees.toFixed(1)}°) also puts the shear f_b tan α on the weld; it is added to the uniform shear.`:'')+' J2.2 long-weld reduction; no directional strength increase.');
 from('rootBase','root-base','Column flange / rib · connected metal',Math.min(available(.6*Math.min(m.Fy,c.Fy),p.method,1,1.5),available(.6*Math.min(m.Fu,c.Fu),p.method,.75,2)),'stress','f_{base}=f_w A_w/[2h\\min(t_r,t_{cf})]','Conservative resultant on the smaller joined base-metal area; shear yielding and rupture strengths also bound normal traction. Column local effects checked below.');
 const length=p.details!.bearing.width,ratio=length/b.seatWeld,beta=ratio<=100?1:ratio<=300?1.2-.002*ratio:180/ratio;
 from('seatWeld','seat-weld','Seat-to-rib · continuous fillet welds',available(.6*m.Fexx*beta,p.method,.75,2),'stress','f_w=|P|/[2(0.707w)b_p]','Two continuous fillets along each rib; only bearing-patch length credited. Includes tension in a rib caused by longitudinal seat eccentricity.');
 // Seat and rib root fillets to the column as one group under every concurrent set with its horizontal forces.
 const cw=seatColumnWeld(p,r),cwPeaks=cw.peaks,cwf=(v:number)=>format(v,'length',p.units,3),columnEnd=p.existingColumn?.enabled?p.existingColumn.height-p.existingColumn.seatElevation:0;
 if(cwPeaks){
  const governs=cwPeaks.seat.value>=cwPeaks.root.value?cwPeaks.seat:cwPeaks.root;
  add('column-weld','Seat and rib welds to column · with longitudinal and lateral force',governs.value,cw.capacity,'stress','f=\\sqrt{\\left(\\frac{H}{A}+\\frac{M_xv}{I_x}-\\frac{M_yu}{I_y}\\right)^2+\\left(\\frac{F}{A}-\\frac{M_zv}{J}\\right)^2+\\left(\\frac{V}{A}-\\frac{M_zu}{J}\\right)^2}',`Every concurrent case of the bracket design force envelope with its longitudinal force F from the locating bearing bolts (at the girder web line, ${cwf(b.reach)} from the flange) and its bottom-flange lateral force H through the bearing bolts (both senses), at the seat top; V at the far bearing edge with its seat moment and the bracket self-weight. One elastic group on the column flange: the two ${cwf(b.rootWeld)} root fillets of each rib over ${cwf(b.ribDepth)} and the ${cwf(cw.size)} top fillet of the seat, ${cwf(cw.length)} long across the flange (${cw.entered?'entered with the bracing collector':'the smallest standard fillet from the J2.4 minimum that carries these forces'}); throat stresses at the line ends, no directional increase. Peak on the ${governs===cwPeaks.seat?'seat':'rib root'} line.${hr?' At the bottom of each haunched root the shear n tan α of the sloping free edge is added.':''} The seat-line share of the bracket moment is included; the ribs alone are checked for gravity above.`,governs.caseId);
  add('column-weld-minimum','Seat-to-column fillet · minimum leg',minimumFillet(Math.max(b.seatThickness,c.flangeThickness)),cw.size,'length','w\\ge w_{min,J2.4}','Thicker of the seat plate and the column flange controls.');
  // J10.1/J10.2 for the seat's pull on the flange; within 10tf (or d) of the column top the end-region values apply.
  const flangeEnd=columnEnd<10*c.flangeThickness,webEnd=!(columnEnd>c.depth);
  add('seat-flange','Column flange · local bending under the seat pull',cwPeaks.pull.value,available((flangeEnd?.5:1)*6.25*c.Fy*c.flangeThickness**2,p.method,.9,1.67),'force','R_n=6.25F_{yf}t_f^2\\;(J10.1)',`The peak tensile throat stress of the seat line over its whole length, ${cwf(cw.length)}: the seat plate pulls on the column flange like a plate across it.${flangeEnd?' Within 10tf of the column top, or the column height not entered: half strength.':''} Checked apart from the rib tension zones below.`,cwPeaks.pull.caseId);
  add('seat-web','Column web · local yielding under the seat pull',cwPeaks.pull.value,available(c.Fy*c.webThickness*((webEnd?2.5:5)*c.flangeThickness+b.seatThickness),p.method,1,1.5),'force',`R_n=F_yt_w(${webEnd?'2.5':'5'}k+l_b)\\;(J10.2)`,`k = tf (no rolled fillet credit), lb = seat thickness ${cwf(b.seatThickness)}.${webEnd?' End-region expression: the column top is within the column depth of the seat, or not entered.':''}`,cwPeaks.pull.caseId);
 }
 for(const [id,w,t1,t2] of [['root',b.rootWeld,b.ribThickness,c.flangeThickness],['seat',b.seatWeld,b.ribThickness,b.seatThickness]] as const){
  add(id+'-minimum',`${id==='root'?'Root':'Seat'} weld · minimum leg`,minimumFillet(Math.max(t1,t2)),w,'length','w\\ge w_{min,J2.4}','Thicker connected part governs minimum fillet.');
  add(id+'-maximum',`${id==='root'?'Root':'Seat'} weld · plate-edge limit`,w,Math.min(t1,t2)-1.5875,'length','w\\le t_{min}-1/16\\,in','No full-throat edge buildup credited.');
 }
 // Conservative end-region factors used at every bracket. No fillet/k credit.
 const N=b.ribDepth/2,term=N/c.depth>.2?4*N/c.depth-.2:3*N/c.depth;
 const strip=receiverStrip(p);
 if(strip.m>0)from('ribTension','column-flange','Column flange · local bending at each rib',available(c.Fy*c.flangeThickness**2*strip.length/(4*strip.m),p.method,.9,1.67),'force','T=1.5|P|e/h_r\\le\\phi F_yt_f^2\\frac{N+2m}{4m}',`Each narrow rib pulls the column flange over its tension zone N = ${format(strip.N,'length',p.units,3)} at m = ${format(strip.m,'length',p.units,3)} from the web face. Flange strip spread at 45° to the web root, plastic hinge at the root, no free-edge or continuity-plate credit. AISC J10.1 assumes a plate across the full flange and does not apply to narrow ribs off the web.`);
 else checks.push({id:'bracket-column-flange',group:'Column bracket',title:'Column flange · local bending at each rib',status:'not-applicable',equation:'m\\le0',note:'The ribs lie over the column web.',referenceIds:['bracket-basis']});
 from('receiverForce','column-yield','Column web · local yielding',available(c.Fy*c.webThickness*(2.5*c.flangeThickness+N),p.method,1,1.5),'force','R_n=F_y t_w(2.5k+l_b)','J10.2 end-region expression; k=tf and lb=half rib depth, no rolled fillet or added stiffener credit.');
 from('receiverForce','column-crippling','Column web · crippling',available(.4*c.webThickness**2*(1+term*(c.webThickness/c.flangeThickness)**1.5)*Math.sqrt(E*c.Fy*c.flangeThickness/c.webThickness),p.method,.75,2),'force','R_n=0.4t_w^2[1+\\eta(t_w/t_f)^{1.5}]\\sqrt{EF_y t_f/t_w}','J10.3 end-region expression. Assumes column web is continuously joined to the loaded flange; confirmed receiver geometry required.');
 const h=c.depth-2*c.flangeThickness,swayRatio=(h/c.webThickness)/(c.unbracedLength/c.width);
 if(swayRatio<=1.7)from('receiverForce','column-sidesway','Column web · sidesway buckling',available(3.3e6*c.webThickness**3*c.flangeThickness/h**2*.4*swayRatio**3,p.method,.85,1.76),'force','R_n=(C_r t_w^3t_f/h^2)[0.4((h/t_w)/(L_b/b_f))^3]',`J10.4 unrestrained compression-flange rotation; conservative Cr=${format(3.3e6,'stress',p.units)} regardless of existing column moment. Actual largest flange unbraced length entered.`);
 else checks.push({id:'bracket-column-sidesway',group:'Column bracket',title:'Column web · sidesway buckling',status:'not-applicable',equation:'(h/t_w)/(L_b/b_f)>1.7',note:'AISC J10.4(b)(2), unrestrained flange-rotation branch.',referenceIds:['bracket-basis']});
 const area=2*c.width*c.flangeThickness+h*c.webThickness,axialRatio=(p.method==='LRFD'?1:1.6)*(c.axialDemand+(r.strength.vertical?.value??0))/(c.Fy*area);
 from('receiverForce','column-panel','Column web · panel shear / axial reduction',available(.6*c.Fy*c.depth*c.webThickness*Math.max(0,Math.min(1,1.4-axialRatio)),p.method,.9,1.67),'force','R_n=0.6F_y d_c t_w\\min(1,1.4-\\alpha P_r/P_y)','J10.6(a): no inelastic panel-zone credit. Conservative full root tension/compression couple force as panel shear; concurrent entered column axial force plus bracket vertical load. Global column strength and stability remain separate.');
 // A single loaded flange does not create opposing double compression forces.
 const vertical=r.service.vertical?.value??0;
 add('tr13-load','AIST column bracket · reaction recommendation',Math.max(vertical,serviceReaction??0),50*4448.221615,'force',p.units==='SI'?'R_{bracket}<222.411\\,kN':'R_{bracket}<50\\,kip','Reference AIST Technical Report 13 §5.9.2. Unfactored support reaction with all cranes, impact and dead load, the same basis as the Detailing column-bracket applicability check.');
 for(const [key,limit,q,eq] of [['deflection',b.deflectionLimit,'length',hr?'\\delta=\\int_0^e\\frac{P(e-x)^2}{EI(x)}dx+\\int_0^e\\frac{P\\,dx}{\\kappa GA(x)}+\\delta_{seat}':'\\delta\\le Pe^3/(3EI)+Pe/(\\kappa GA)+\\delta_{seat}'],['rotation',b.rotationLimit,'ratio',hr?'\\theta=\\int_0^e\\frac{P(e-x)}{EI(x)}dx':'\\theta=Pe^2/(2EI)']] as const){
  const peak=r.service[key];add(key,`Bracket · vertical ${key}`,peak?.value??0,limit,q,eq,'Unfactored single-crane service-load bound; column fixed at interface.'+(hr?` Integrated over the tapered rib, I(x) and A(x) of the depth h(x) from ${hf(hr.g.root)} to ${hf(hr.g.tip)}.`:'')+' User-entered incremental limits. Building deformation and dead-load setting are separate.',peak?.caseId);
 }
 const eb=activeEndBearing(p),uplift=r.strength.uplift;
 if(eb)add('uplift','Bearing uplift · held down by the bearing bolts',uplift?.value??0,4*boltCapacity({grade:eb.bolts.grade,diameter:eb.bolts.diameter,planes:1,surface:'B',shear:0,tension:(uplift?.value??0)/4,method:p.method}).tension,'force','V_{uplift}\\le4\\phi R_{nt}',`Any uplift at a girder end is held down by its four bolted end-bearing bolts in tension, as at the W-stub bracket: bolt shear with tension, the plate washers and the seat thickness for prying are checked under End bearings.${r.strength.upRibMoment?' The bracket is checked below for the reversed (upward) sets, each lifting girder end pulling the seat up at its bolt rows.':' No concurrent set lifts a girder end.'}`,uplift?.caseId,['bracket-basis','aisc-connections']);
 else from('uplift','uplift','Bearing contact · uplift requiring separate restraint',1,'force','V_{uplift}\\le0','Gravity-only bracket. Uplift above 1 N numerical tolerance fails this arrangement until a separate compatible hold-down load path is designed.');
 if(eb&&r.strength.upRibMoment)upliftChecks(p,r,add,hr?ribFlexure(b,E,m.Fy,p.method,hr.rib.critical.x).capacity:rectangularRibFlexure(b,E,m.Fy,p.method).capacity);
 const fatigue=(key:'rib'|'seat',title:string)=>{
  const damage=r.fatigue.reduce((sum,v)=>{const limit=Math.min(6900*(.39/v.cycles)**(1/3),transverseFilletFatigue(key==='rib'?b.ribThickness:b.seatThickness,key==='rib'?b.rootWeld:b.seatWeld,v.cycles).capacity);return sum+(v[key]/limit)**3;},0);
  add('fatigue-'+key,title,damage,1,'ratio','D=\\sum_i(\\Delta f_i/F_{SR,i})^3\\le1',"Unfactored duty-bin loads without impact. Range of the signed response of each rib over the bin (a gravity bracket does not reverse; zero with no crane present)."+(hr&&key==='rib'?' At the bottom of the haunched root, the stress along the sloping edge, f_b/cos²α.':'')+" Conservative Category E-prime base-metal bound plus transverse fillet-root reduction; no endurance-limit credit.",undefined,['bracket-basis','aisc-fatigue']);
 };
 fatigue('rib','Rib root · fatigue');
 // The seat is continuous over the ribs: its bending stress runs along the runway past each rib, a short transverse
 // attachment, and does not pass through the rib-to-seat fillets (their throat is checked separately below).
 const seatCat=seatFatigueCategory(b),seatDamage=r.fatigue.reduce((sum,v)=>sum+(v.seat/(6900*(seatCat.Cf/v.cycles)**(1/3)))**3,0);
 add('fatigue-seat','Seat plate at the rib fillet toes · fatigue',seatDamage,1,'ratio',`D=\\sum_i(\\Delta f_i/F_{SR,${seatCat.tex}})^3\\le1`,`AISC Table A-3.1 item 7.1, Category ${seatCat.name}: seat base metal at the toes of the rib-to-seat fillets. The seat is continuous over the ribs, so its bending stress along the runway passes each rib, an attachment ${format(b.ribThickness,'length',p.units,3)} long in the direction of stress (a ${seatCat.range}); the stress does not cross the fillets, so the root-crack (R_FIL) detail of a plate loaded through its fillets does not apply. Range over each duty bin of the seat strip bending stress 6M/(b_pt_p²), the peak along the strip; unfactored, without impact; Miner sum with no endurance-limit credit. The rib-to-seat fillets carry the rib reaction and are checked for throat fatigue below.`,undefined,['bracket-basis','aisc-fatigue']);
 // Column flange base metal at the rib root weld toes: the rib is an attachment longer than 4 in along the column.
 add('fatigue-column','Column flange at rib weld toes · fatigue',r.fatigue.reduce((sum,v)=>sum+(v.column/(6900*(.39/v.cycles)**(1/3)))**3,0),1,'ratio','D=\\sum_i(\\Delta f_i/F_{SR,E^\\prime})^3\\le1;\\quad\\Delta f=\\Delta V e_c/S_c',"AISC Table A-3.1 item 7.2, Category E-prime: the ribs are attachments longer than 4 in along the column. Range per bin of the column flange stress from the whole bracket moment V·e_c on the receiving section, without splitting it above and below the bracket. Other building stress ranges in the column are excluded.",undefined,['bracket-basis','aisc-fatigue']);
 if(cwPeaks)add('fatigue-columnWeld','Seat-to-column fillet · fatigue',Math.max(0,...r.fatigue.map(v=>v.columnWeld?.[cw.index]??0)),Math.max(55,690*(1.5/p.fatigue.cycles)**.167),'stress','\\Delta f_w\\le\\max[55,690(1.5/n)^{0.167}]','AISC A-3-2M, Category F on the throat. Largest unfactored range, over the duty bins, of the normal throat stress at either end of the seat line from the crane vertical load and side thrust, assigned to ALL project cycles.',undefined,['bracket-basis','aisc-fatigue']);
 for(const key of ['rootWeld','seatWeld'] as const){
  add('fatigue-'+key,key==='rootWeld'?'Column root weld · fatigue':'Seat fillet weld · fatigue',Math.max(...r.fatigue.map(v=>v[key])),Math.max(55,690*(1.5/p.fatigue.cycles)**.167),'stress','\\Delta f_w\\le\\max[55,690(1.5/n)^{0.167}]','AISC A-3-2M, Category F. Largest unfactored range of the signed weld stress assigned to ALL project cycles; no mixed-spectrum endurance exemption.',undefined,['bracket-basis','aisc-fatigue']);
 }
 from(hr?'ribEdge':'ribNormal','fatigue-peak','Bracket rib · maximum cyclic normal stress',.66*m.Fy,'stress','f_{peak}\\le0.66F_y','Strength-envelope peak including dead load and impact used as a conservative bound for the unfactored fatigue peak.'+(hr?' Haunched ribs: the stress along the sloping free edge at the critical section.':''));
 return activeColumnStiffeners(b)?weldedRibStiffeners(p,r,checks):checks;
}
/**
 * AISC Table A-3.1 item 7.1 for the seat base metal at the toes of the rib-to-seat fillets: the rib is an attachment
 * of length a = its thickness along the seat stress and of thickness b = its projection across it.
 */
export function seatFatigueCategory(b:BracketInput){
 const a=b.ribThickness;
 return a<2*inch?{name:'C',tex:'C',Cf:4.4,range:'< 2 in'}:a<=Math.min(12*b.seatProjection,4*inch)?{name:'D',tex:'D',Cf:2.2,range:'from 2 in to 4 in'}:b.seatProjection<=inch?{name:'E',tex:'E',Cf:1.1,range:'> 4 in'}:{name:"E'",tex:'E^\\prime',Cf:.39,range:'> 4 in'};
}
type Add=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,caseId?:string,refs?:string[])=>void;
/**
 * The reversed (upward) sets of a bracket on bolted end bearings: each lifting girder end pulls the seat up at its two
 * bolt rows. The ribs bend the other way (the seat-restrained top edge in compression), the seat spans between the
 * ribs under the bolt pulls, the rib-to-seat fillets carry the rib reactions in tension, the root fillets the reversed
 * moment, and the rib bottoms pull on the column flange.
 */
function upliftChecks(p:ProjectInput,r:BracketResults,add:Add,ribCapacity:number){
 const b=p.details!.bracket!,m=p.details!.material,c=b.receiver,S=r.strength,eb=activeEndBearing(p)!,f=(v:number)=>format(v,'length',p.units,3);
 const at=`Every concurrent set that lifts a girder end (peak uplift ${format(S.upUplift?.value??0,'force',p.units,3)}), the lifting end held down by its bearing bolts ${f(p.details!.bearing.length/2-eb.bolts.edge)} each side of its bearing center (half at each row, over a washer ${f(2*eb.bolts.diameter)} long) and any girder end still bearing on its patch; no bracket self-weight credited. Rib reactions P± = V/2 ± M_s/g at the far bearing edge, the eccentricity of the gravity checks.`;
 const put=(key:string,id:string,title:string,capacity:number,q:CheckResult['quantity'],eq:string,note:string)=>add(id,title,S[key]?.value??0,capacity,q,eq,`${at} ${note}`,S[key]?.caseId,['bracket-basis','aisc-connections']);
 put('upRibMoment','uplift-rib-flexure','Uplift · ribs in reversed bending',ribCapacity,'moment','M_r=|P_\\pm|e\\le\\phi M_{n,F11}',"The rib's top edge, welded to the seat, is in compression; the F11 strength with the free bottom edge in compression bounds it.");
 put('upRibShear','uplift-rib-shear','Uplift · rib shear',available(.6*m.Fy,p.method,.9,1.67),'stress','\\tau=1.5|P|/(ht)','Elastic peak shear on the shallowest loaded section.');
 put('upSeatNormal','uplift-seat-flexure','Uplift · seat plate bending under the bolt pulls',available(m.Fy,p.method,.9,1.67),'stress','f=6M_{max}/(b_pt_p^2)','The seat strip spans between the ribs under the bolt-row pulls with its overhangs; strip width = bearing width. Local bending at each bolt is the seat prying check under End bearings.');
 put('upSeatWeld','uplift-seat-weld','Uplift · seat-to-rib fillets in tension',available(.6*m.Fexx,p.method,.75,2),'stress','f_w=|P|/[2(0.707w)b_p]','The rib reaction pulls the seat off the rib: two fillets per rib over the bearing width, no directional increase.');
 put('upRootWeld','uplift-root-weld','Uplift · rib root fillets under the reversed moment',parallelWeldGroup({length:b.ribDepth,gauge:b.ribThickness,size:b.rootWeld,Fexx:m.Fexx,method:p.method,vx:0,vy:0,normal:0,mx:0,my:0,mz:0}).capacity,'stress','f_w=\\sqrt{(P/A_w)^2+(Pe\\,h/(2I_w))^2}','The two root fillets per rib with the reversed eccentric moment.');
 const strip=receiverStrip(p);
 if(strip.m>0)put('upRibTension','uplift-column-flange','Uplift · column flange local bending at the rib bottoms',available(c.Fy*c.flangeThickness**2*strip.length/(4*strip.m),p.method,.9,1.67),'force','T=1.5|P|e/h_r\\le\\phi F_yt_f^2\\frac{N+2m}{4m}',`The reversed couple pulls the column flange at the bottom of each rib over its tension zone N = ${f(strip.N)} at m = ${f(strip.m)} from the web face; the seat pushes on the flange. Flange strip spread at 45° to the web root, as the gravity check.`);
}
/** The welded-rib bracket's column-side checks with column stiffeners: the stiffened model replaces failing J10.1-J10.4 checks. */
function weldedRibStiffeners(p:ProjectInput,r:BracketResults,checks:CheckResult[]):CheckResult[]{
 const cap=(id:string)=>checks.find(c=>c.id==='bracket-'+id&&c.capacity!==undefined)?.capacity,S=r.strength;
 const item=(id:string,label:string,factor=1)=>{const v=cap(id);return v===undefined?[]:[{id,label,value:factor*v}];};
 const tension=[...item('seat-flange','J10.1 flange local bending under the seat'),...item('column-flange','J10.1 flange local bending at the two ribs',2),...item('seat-web','J10.2 web local yielding under the seat'),...item('column-yield','J10.2 web local yielding at the ribs')];
 const compression=[...item('column-yield','J10.2 web local yielding'),...item('column-crippling','J10.3 web crippling')],sway=item('column-sidesway','J10.4 web sidesway buckling')[0];
 const ids=['seat-flange','seat-web','column-flange','column-yield','column-crippling','column-sidesway','uplift-column-flange'].map(v=>'bracket-'+v);
 const out=stiffenedColumnChecks(p,checks,ids).map(c=>c.id==='bracket-column-panel'?{...c,note:c.note+panelStiffenerNote}:c);
 out.push(...columnStiffenerChecks(p,{prefix:'bracket',refs:['bracket-basis','tr13-bracket'],demand:{upperT:S.stiffUpperT,upperC:S.stiffUpperC,lowerT:S.stiffLowerT,lowerC:S.stiffLowerC},tension,compression,sidesway:sway,
  fatigue:r.fatigue.map(v=>({cycles:v.cycles,upper:v.stiffUpper??0,lower:v.stiffLower??0,column:v.column})),
  columnStressNote:'Range per duty bin of the column flange stress from the whole bracket moment V·e_c on the receiving section, as the rib-toe check; other building stress ranges are excluded. Miner sum, no endurance-limit credit.'}));
 return out;
}
