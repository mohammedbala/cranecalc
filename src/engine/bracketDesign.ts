import {isExistingBracketType,existingBracketProfile} from './bracketProfiles';
import {format} from './units';
import type {ProjectInput,CheckResult} from './types';
import type {BracketInput} from './bracketInputs';
import {available} from './aiscStrength';
import {bracketArrangement} from './connectionOptions';
import {minimumFillet,parallelWeldGroup,transverseFilletFatigue} from './connectionStrength';
import {designsBracing,bracingDesign} from './newColumnBracing';

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
 fatigue:{name:string;cycles:number;rib:number;seat:number;rootWeld:number;seatWeld:number;column:number;columnWeld?:number[]}[];
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
 return {lines,A,xc,yc,Ix,Iy,J:Ix+Iy,ys,L,seatThroat:seatWeld/Math.SQRT2};
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
 for(const l of g.lines)for(const q of [l.a,l.b]){const s=at(q[0],q[1]);if(l.seat){seat=Math.max(seat,s.f);ends.push(s.n);}else root=Math.max(root,s.f);}
 return {root,seat,ends,pull:Math.max(0,...ends)*g.seatThroat*g.L};
}
/** Two independent rectangular cantilever ribs, continuously welded to seat
 * and column flange. Seat stiffness/diaphragm action is NOT credited for LTB.
 * The ribs take the gravity bearing load. The longitudinal force of the
 * locating bearing and the bottom-flange lateral force reach the seat through
 * the bearing bolts and the column through the seat-to-column fillet with the
 * rib root fillets (columnWeldStress); the top-flange tie connects separately.
 * No frictional sharing is credited.
 */
export function bracketResponse(p:ProjectInput,loads:BracketLoads){
 const b=p.details!.bracket!,m=p.details!.material,E=p.section.E,G=E/2.6;
 const V=loads.reduce((a,v)=>a+v.vertical,0),Mx=loads.reduce((a,v)=>a+v.vertical*v.offset,0);
 const ribs=[V/2-Mx/b.ribSpacing,V/2+Mx/b.ribSpacing];
 // Entire patch at its far transverse edge; no uniform-patch relief.
 const e=b.reach+p.details!.bearing.width/2,A=b.ribDepth*b.ribThickness,S=b.ribThickness*b.ribDepth**2/6,I=S*b.ribDepth/2;
 const R=Math.max(...ribs.map(Math.abs)),M=R*e,normal=M/S,shear=1.5*R/A;
 const root=parallelWeldGroup({length:b.ribDepth,gauge:b.ribThickness,size:b.rootWeld,Fexx:m.Fexx,method:p.method,vx:0,vy:R,normal:0,mx:M,my:0,mz:0});
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
 const perForce=R>0?root.demand/R:0,seatPerForce=1/(2*(b.seatWeld/Math.sqrt(2))*weldLength);
 return {V,Mx,ribs,e,R,M,normal,shear,seatNormal,seatShear,ribTension:Math.max(...ribTension.map(Math.abs)),
  signed:{rib:ribs.map(v=>v*e/S),rootWeld:ribs.map(v=>v*perForce),seatWeld:ribs.map(v=>v*seatPerForce),column:columnStress,seat:[seatNormal]},
  rootWeld:root.demand,rootBase:root.demand*root.A/(2*b.ribDepth*Math.min(b.ribThickness,b.receiver.flangeThickness)),seatWeld,receiverForce,uplift,
  // Interpolation-error bound |v(x)| <= max|M/EI| |(x-r1)(x-r2)|/2
  // for a seat with zero displacement at each rib, including both overhangs.
  deflection:R*e**3/(3*E*I)+R*e/(5/6*G*A)+seat.moment/(2*E*(p.details!.bearing.width*b.seatThickness**3/12))*Math.max(b.ribSpacing**2/4,(b.seatLength**2-b.ribSpacing**2)/4),rotation:R*e**2/(2*E*I),
  interaction:normal/available(m.Fy,p.method,.9,1.67)+shear/available(.6*m.Fy,p.method,.9,1.67)};
}
/** Column flange strip at each rib: 45° spread from the rib tension zone (half its depth) to the web root. */
export function receiverStrip(p:ProjectInput){
 const b=p.details!.bracket!,c=b.receiver,m=b.ribSpacing/2-c.webThickness/2,N=b.ribDepth/2;
 return {m,N,length:N+2*Math.max(0,m)};
}
export function rectangularRibFlexure(b:BracketInput,E:number,Fy:number,method:ProjectInput['method']){
 const S=b.ribThickness*b.ribDepth**2/6,Mp=Fy*b.ribThickness*b.ribDepth**2/4;
 const slenderness=2*b.seatProjection*b.ribDepth/b.ribThickness**2,ratio=slenderness*Fy/E;
 const nominal=ratio<=.08?Mp:ratio<=1.9?Math.min(Mp,(1.52-.274*ratio)*Fy*S):Math.min(Mp,1.9*E/slenderness*S);
 return {slenderness,nominal,capacity:available(nominal,method,.9,1.67)};
}
export function createBracketCollector(p:ProjectInput){
 if(!p.details?.bracket?.enabled||bracketArrangement(p.details.bracket)!=='twin-rib')return undefined;
 const sizes=seatColumnWeldSizes(p),groups=sizes.map(w=>columnWeldGroup(p.details!.bracket!,w)),none={value:0,caseId:'',x:0};
 const result:BracketResults={strength:{},service:{},fatigue:p.details.spectrum.map(v=>({name:v.name,cycles:v.cycles,rib:0,seat:0,rootWeld:0,seatWeld:0,column:0,columnWeld:sizes.map(()=>0)})),stations:[],
  columnWeld:{sizes,peaks:sizes.map(()=>({root:{...none},seat:{...none},pull:{...none}}))}};
 // Signed extremes per bin, key and rib: a gravity bracket does not reverse, so the range is max - min.
 const extremes=p.details.spectrum.map(()=>new Map<string,{min:number;max:number}>());
 const range=(bin:number,id:string,value:number)=>{const x=extremes[bin].get(id)??{min:0,max:0};x.min=Math.min(x.min,value);x.max=Math.max(x.max,value);extremes[bin].set(id,x);return x.max-x.min;};
 const observe=(kind:'strength'|'service'|'fatigue',caseId:string,x:number,loads:BracketLoads,bin:number,horizontal?:SeatHorizontal)=>{
  const b=p.details!.bracket!,h=horizontal??{longitudinal:0,bottom:0,offset:0};
  const selfWeight=(b.seatLength*b.seatProjection*b.seatThickness+2*b.ribDepth*b.ribThickness*b.seatProjection)*p.section.density*9.80665/1e9;
  const r=bracketResponse(p,kind==='strength'?[...loads,{vertical:selfWeight*(p.method==='LRFD'?1.4:1),offset:0,length:b.seatLength}]:loads);
  // The seat-to-column fillet and the rib root fillets as one group under the whole concurrent set. The lateral
  // force is taken in both senses: without side thrust its sense follows the rail eccentricity, either way.
  const sets=(kind==='fatigue'?[h.bottom]:[h.bottom,-h.bottom]).map(H=>({V:r.V,Mseat:r.Mx,F:h.longitudinal,H,xH:h.offset}));
  if(kind==='fatigue'){
   const f=result.fatigue[bin];
   for(const [key,values] of Object.entries(r.signed))values.forEach((value,i)=>{f[key as 'rib']=Math.max(f[key as 'rib'],range(bin,`${key}:${i}`,value));});
   groups.forEach((g,i)=>columnWeldStress(b,g,r.e,sets[0]).ends.forEach((value,j)=>{f.columnWeld![i]=Math.max(f.columnWeld![i],range(bin,`columnWeld:${i}:${j}`,value));}));
   return;
  }
  if(kind==='strength')groups.forEach((g,i)=>{const peak=result.columnWeld!.peaks[i];for(const set of sets){const w=columnWeldStress(b,g,r.e,set);
   for(const [key,value] of [['root',w.root],['seat',w.seat],['pull',w.pull]] as const)if(value>peak[key].value)peak[key]={value,caseId,x};}});
  const target=kind==='strength'?result.strength:result.service;
  const values=kind==='strength'?{vertical:Math.abs(r.V),ribReaction:r.R,ribMoment:r.M,ribNormal:r.normal,ribShear:r.shear,interaction:r.interaction,seatNormal:r.seatNormal,seatShear:r.seatShear,rootWeld:r.rootWeld,rootBase:r.rootBase,seatWeld:r.seatWeld,receiverForce:r.receiverForce,ribTension:r.ribTension,uplift:r.uplift}:{vertical:Math.abs(r.V),deflection:r.deflection,rotation:r.rotation};
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
 if(isExistingBracketType(bracketArrangement(b)))return [];
 const errors:string[]=[],d=p.details!,r=b.receiver;
 const add=(bad:boolean,message:string)=>{if(bad)errors.push('details.bracket: '+message);};
 add(b.reach<=d.bearing.width/2,'bearing patch must lie clear of the column face.');
 add(b.seatProjection<b.reach+d.bearing.width/2,'seat and ribs must extend beyond the complete bearing patch.');
 const endOffset=p.system==='simple'?(d.simpleSupport?.endGap??25.4)/2+d.bearing.length/2:0;
 add(b.seatLength<2*endOffset+d.bearing.length,'seat must cover both independent bearing plates.');
 if(bracketArrangement(b)!=='rolled-corbel'){
  add(b.ribSpacing+b.ribThickness+2*b.seatWeld>b.seatLength,'rib welds must fit below the seat.');
  add(b.ribSpacing+b.ribThickness+2*b.rootWeld+12.7>r.width,'both root welds must fit within the receiving column flange.');
  add(b.ribSpacing<=b.ribThickness+2*b.rootWeld,'rib root welds overlap.');
 }
 add(r.depth<=2*r.flangeThickness||r.webThickness>=r.width,'invalid receiving column I-section.');
 add(r.Fu<r.Fy,'receiver Fu must be at least Fy.');
 add(b.ribDepth<4*b.rootWeld||d.bearing.width<4*b.seatWeld,'effective weld lengths must be at least four weld sizes.');
 add(p.scope!=='design'||!p.aist?.runwayOnly,'bracket design requires the detailed runway design model.');
 return errors;
}
/** serviceReaction: largest unfactored support reaction with all cranes, impact and dead load (the AIST §5.9.2 basis). */
export function bracketChecks(p:ProjectInput,r:BracketResults,serviceReaction?:number):CheckResult[]{
 const b=p.details!.bracket!,m=p.details!.material,c=b.receiver,E=p.section.E,checks:CheckResult[]=[];
 // byOthers: confirmation that an adequacy outside this calculation is addressed elsewhere; never reported as a pass.
 const gate=(id:string,title:string,ok:boolean,note:string,byOthers=false)=>checks.push({id:'bracket-'+id,group:'Column bracket',title,status:ok?(byOthers?'excluded':'pass'):'unverified',equation:'',note,referenceIds:['bracket-basis']});
 gate('receiver','Receiving column · surveyed geometry and material',c.confirmed&&!!c.source.trim(),c.source?`${c.source} Survey data only; the receiving column member, frame and foundation are not checked here (see Supporting structure).`:'Enter and confirm surveyed receiving-column geometry and material; the reference frame is not a capacity input.');
 gate('load-path','Bracket load paths / top-flange tie connected separately',b.loadPathConfirmed,'Two rectangular ribs and a seat plate welded directly to the column flange, the seat also by a top fillet across the flange. The ribs carry the vertical bearings. The bearing bolts deliver the locating end\'s longitudinal force and the bottom-flange lateral force to the seat, checked below with the seat and rib root fillets as one weld group and the column flange and web under the seat. The top-flange tie connects to the column independently; its column-side adequacy, and any uplift restraint, are by others.',true);
 const add=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,caseId?:string,refs=['bracket-basis','tr13-bracket'])=>checks.push({id:'bracket-'+id,group:'Column bracket',title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&demand<=capacity*(1+1e-9)?'pass':'fail',equation,note,caseId,referenceIds:refs});
 const from=(key:string,id:string,title:string,capacity:number,q:CheckResult['quantity'],eq:string,note:string)=>{const peak=r.strength[key];add(id,title,peak?.value??0,capacity,q,eq,note,peak?.caseId);};
 const common='Every concurrent case of the bracket design force envelope: all strength combinations and crane positions, each bay carrying the longitudinal force in either direction with its end couple, and a wheel over a shared grid on either girder end; impact included. Full bracket self-weight added with 1.4 LRFD / 1.0 ASD factor at the conservative bearing eccentricity. Ribs at ±g/2 take P±=V/2±Σ(Vi xi)/g; full patch at its far transverse edge. No seat-flange composite section credit.';
 from('ribMoment','rib-flexure','Bracket ribs · flexure / lateral buckling',rectangularRibFlexure(b,E,m.Fy,p.method).capacity,'moment','P_\\pm=V/2\\pm M_s/g;\\quad M_r=|P_\\pm|e;\\quad M_n=F_{11}(L_b=2L,C_b=1)',common+' AISC F11 rectangular bars; doubled cantilever length is a conservative model assumption.');
 from('ribShear','rib-shear','Bracket ribs · shear',available(.6*m.Fy,p.method,.9,1.67),'stress','\\tau=1.5|P|/(ht)',common+' Elastic peak shear; no plastic shear distribution.');
 from('interaction','rib-interaction','Bracket ribs · combined elastic stress',1,'ratio','|f_b|/F_b+|\\tau|/F_v\\le1','Conservative linear interaction bounds first yield under concurrent bending and shear; F11 stability checked separately.');
 from('seatNormal','seat-flexure','Spreader seat · plate bending',available(m.Fy,p.method,.9,1.67),'stress','M(x)=\\sum R_j\\langle x-r_j\\rangle-\\sum(q_i/2)[\\langle x-a_i\\rangle^2-\\langle x-b_i\\rangle^2];\\quad f=6M_{max}/(b_pt_p^2)','Uniform contact under each actual bearing patch; simultaneous rib reactions. Evaluates load/support edges and all interior zero-shear locations, including both overhangs. Effective strip width is the transverse bearing width.');
 from('seatShear','seat-shear','Spreader seat · peak shear',available(.6*m.Fy,p.method,.9,1.67),'stress','\\tau=1.5|V_{strip,max}|/(b_pt_p)','Maximum absolute strip shear on either side of each load and rib-support edge; effective strip width is the transverse bearing width.');
 const wr=parallelWeldGroup({length:b.ribDepth,gauge:b.ribThickness,size:b.rootWeld,Fexx:m.Fexx,method:p.method,vx:0,vy:0,normal:0,mx:0,my:0,mz:0});
 from('rootWeld','root-weld','Rib-to-column · eccentric fillet welds',wr.capacity,'stress','f_w=\\sqrt{(P/A_w)^2+(Pe\\,h/(2I_w))^2}','Two continuous vertical root fillets per rib. Elastic endpoint resultant includes eccentric moment. J2.2 long-weld reduction; no directional strength increase.');
 from('rootBase','root-base','Column flange / rib · connected metal',Math.min(available(.6*Math.min(m.Fy,c.Fy),p.method,1,1.5),available(.6*Math.min(m.Fu,c.Fu),p.method,.75,2)),'stress','f_{base}=f_w A_w/[2h\\min(t_r,t_{cf})]','Conservative resultant on the smaller joined base-metal area; shear yielding and rupture strengths also bound normal traction. Column local effects checked below.');
 const length=p.details!.bearing.width,ratio=length/b.seatWeld,beta=ratio<=100?1:ratio<=300?1.2-.002*ratio:180/ratio;
 from('seatWeld','seat-weld','Seat-to-rib · continuous fillet welds',available(.6*m.Fexx*beta,p.method,.75,2),'stress','f_w=|P|/[2(0.707w)b_p]','Two continuous fillets along each rib; only bearing-patch length credited. Includes tension in a rib caused by longitudinal seat eccentricity.');
 // Seat and rib root fillets to the column as one group under every concurrent set with its horizontal forces.
 const cw=seatColumnWeld(p,r),cwPeaks=cw.peaks,cwf=(v:number)=>format(v,'length',p.units,3),columnEnd=p.existingColumn?.enabled?p.existingColumn.height-p.existingColumn.seatElevation:0;
 if(cwPeaks){
  const governs=cwPeaks.seat.value>=cwPeaks.root.value?cwPeaks.seat:cwPeaks.root;
  add('column-weld','Seat and rib welds to column · with longitudinal and lateral force',governs.value,cw.capacity,'stress','f=\\sqrt{\\left(\\frac{H}{A}+\\frac{M_xv}{I_x}-\\frac{M_yu}{I_y}\\right)^2+\\left(\\frac{F}{A}-\\frac{M_zv}{J}\\right)^2+\\left(\\frac{V}{A}-\\frac{M_zu}{J}\\right)^2}',`Every concurrent case of the bracket design force envelope with its longitudinal force F from the locating bearing bolts (at the girder web line, ${cwf(b.reach)} from the flange) and its bottom-flange lateral force H through the bearing bolts (both senses), at the seat top; V at the far bearing edge with its seat moment and the bracket self-weight. One elastic group on the column flange: the two ${cwf(b.rootWeld)} root fillets of each rib over ${cwf(b.ribDepth)} and the ${cwf(cw.size)} top fillet of the seat, ${cwf(cw.length)} long across the flange (${cw.entered?'entered with the bracing collector':'the smallest standard fillet from the J2.4 minimum that carries these forces'}); throat stresses at the line ends, no directional increase. Peak on the ${governs===cwPeaks.seat?'seat':'rib root'} line. The seat-line share of the bracket moment is included; the ribs alone are checked for gravity above.`,governs.caseId);
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
 for(const [key,limit,q,eq] of [['deflection',b.deflectionLimit,'length','\\delta\\le Pe^3/(3EI)+Pe/(\\kappa GA)+\\delta_{seat}'],['rotation',b.rotationLimit,'ratio','\\theta=Pe^2/(2EI)']] as const){
  const peak=r.service[key];add(key,`Bracket · vertical ${key}`,peak?.value??0,limit,q,eq,'Unfactored single-crane service-load bound; column fixed at interface. User-entered incremental limits. Building deformation and dead-load setting are separate.',peak?.caseId);
 }
 from('uplift','uplift','Bearing contact · uplift requiring separate restraint',1,'force','V_{uplift}\\le0','Gravity-only bracket. Uplift above 1 N numerical tolerance fails this arrangement until a separate compatible hold-down load path is designed.');
 const fatigue=(key:'rib'|'seat',title:string)=>{
  const damage=r.fatigue.reduce((sum,v)=>{const limit=Math.min(6900*(.39/v.cycles)**(1/3),transverseFilletFatigue(key==='rib'?b.ribThickness:b.seatThickness,key==='rib'?b.rootWeld:b.seatWeld,v.cycles).capacity);return sum+(v[key]/limit)**3;},0);
  add('fatigue-'+key,title,damage,1,'ratio','D=\\sum_i(\\Delta f_i/F_{SR,i})^3\\le1',"Unfactored duty-bin loads without impact. Range of the signed response of each rib over the bin (a gravity bracket does not reverse; zero with no crane present). Conservative Category E-prime base-metal bound plus transverse fillet-root reduction; no endurance-limit credit.",undefined,['bracket-basis','aisc-fatigue']);
 };
 fatigue('rib','Rib root · fatigue');fatigue('seat','Seat plate · fatigue');
 // Column flange base metal at the rib root weld toes: the rib is an attachment longer than 4 in along the column.
 add('fatigue-column','Column flange at rib weld toes · fatigue',r.fatigue.reduce((sum,v)=>sum+(v.column/(6900*(.39/v.cycles)**(1/3)))**3,0),1,'ratio','D=\\sum_i(\\Delta f_i/F_{SR,E^\\prime})^3\\le1;\\quad\\Delta f=\\Delta V e_c/S_c',"AISC Table A-3.1 item 7.2, Category E-prime: the ribs are attachments longer than 4 in along the column. Range per bin of the column flange stress from the whole bracket moment V·e_c on the receiving section, without splitting it above and below the bracket. Other building stress ranges in the column are excluded.",undefined,['bracket-basis','aisc-fatigue']);
 if(cwPeaks)add('fatigue-columnWeld','Seat-to-column fillet · fatigue',Math.max(0,...r.fatigue.map(v=>v.columnWeld?.[cw.index]??0)),Math.max(55,690*(1.5/p.fatigue.cycles)**.167),'stress','\\Delta f_w\\le\\max[55,690(1.5/n)^{0.167}]','AISC A-3-2M, Category F on the throat. Largest unfactored range, over the duty bins, of the normal throat stress at either end of the seat line from the crane vertical load and side thrust, assigned to ALL project cycles.',undefined,['bracket-basis','aisc-fatigue']);
 for(const key of ['rootWeld','seatWeld'] as const){
  add('fatigue-'+key,key==='rootWeld'?'Column root weld · fatigue':'Seat fillet weld · fatigue',Math.max(...r.fatigue.map(v=>v[key])),Math.max(55,690*(1.5/p.fatigue.cycles)**.167),'stress','\\Delta f_w\\le\\max[55,690(1.5/n)^{0.167}]','AISC A-3-2M, Category F. Largest unfactored range of the signed weld stress assigned to ALL project cycles; no mixed-spectrum endurance exemption.',undefined,['bracket-basis','aisc-fatigue']);
 }
 from('ribNormal','fatigue-peak','Bracket rib · maximum cyclic normal stress',.66*m.Fy,'stress','f_{peak}\\le0.66F_y','Strength-envelope peak including dead load and impact used as a conservative bound for the unfactored fatigue peak.');
 return checks;
}
