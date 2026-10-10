import {asceCombinations} from './asceCombinations';
import {columnResponse} from './columnAnalysis';
import {existingColumnEccentricity,existingColumnRailElevation,existingColumnSection,railForce} from './existingColumn';
import {anchorGrades,anchorHardware,barSizes,columnBaseElevation,type ColumnBaseInput} from './columnBaseInputs';
import {sectionProperties} from './section';
import {format} from './units';
import {latexNumber,withinLimit} from './math';
import type {SupportReactionSet} from './supportReactions';
import type {CheckResult,ProjectInput} from './types';
import type {ExistingColumnResult} from './existingColumn';

const inch=25.4,psi=0.006894757293168,lbf=4.4482216152605,concreteWeight=23.6e-6;
const futa:Record<typeof anchorGrades[number],number>={'F1554-36':58000*psi,'F1554-55':75000*psi,'F1554-105':125000*psi};
const fya:Record<typeof anchorGrades[number],number>={'F1554-36':36000*psi,'F1554-55':55000*psi,'F1554-105':105000*psi};
/** UNC threads per inch for anchor rod diameters. */
const threads=(d:number)=>{const t:[number,number][]=[[.625,11],[.75,10],[.875,9],[1,8],[1.125,7],[1.25,7],[1.5,6],[1.75,5],[2,4.5],[2.25,4.5],[2.5,4]];const di=d/inch;return t.reduce((a,b)=>Math.abs(b[0]-di)<Math.abs(a[0]-di)?b:a)[1];};
/** Effective tensile stress area of a threaded rod, pi/4 (d - 0.9743/n)^2. */
export const anchorArea=(d:number)=>Math.PI/4*(d-.9743*inch/threads(d))**2;
/** Bearing area of a heavy hex nut with flats taken as 1.5d, net of the rod (AISC Design Guide 1 Table 3.2 basis). */
export const nutBearingArea=(d:number)=>Math.sqrt(3)/2*(1.5*d)**2-Math.PI*d*d/4;
export const barDiameter:Record<typeof barSizes[number],number>={'#4':.5*inch,'#5':.625*inch,'#6':.75*inch,'#7':.875*inch,'#8':inch,'#9':1.128*inch,'#10':1.27*inch,'#11':1.41*inch};
export const barArea:Record<typeof barSizes[number],number>={'#4':.2*inch**2,'#5':.31*inch**2,'#6':.44*inch**2,'#7':.6*inch**2,'#8':.79*inch**2,'#9':1*inch**2,'#10':1.27*inch**2,'#11':1.56*inch**2};
// ACI 318-19 expressions are inch-pound: sqrt(f'c) in psi; lengths in inches give pounds or psi.
const sqrtPsi=(fc:number)=>Math.sqrt(fc/psi),ins=(v:number)=>v/inch;

export function validateColumnBase(p:ProjectInput):string[]{
 const b=p.columnBase;if(!b?.enabled)return [];
 const errors:string[]=[],add=(test:boolean,m:string)=>{if(test)errors.push(`columnBase.${m}`);};
 const c=p.existingColumn;
 add(!c?.enabled||!c.isNew,'enabled: base plates, anchor rods and footings are designed here for a new column only.');
 if(!c?.enabled)return errors;
 const {section}=existingColumnSection(p),pl=b.plate,a=b.anchors,f=b.footing;
 add(pl.N<section.d+2*a.edge+2*a.diameter,'plate.N: the plate must extend past the column depth to hold the anchor rows.');
 add(pl.B<section.bf,'plate.B: the plate must be at least as wide as the column flange.');
 add(a.gauge>pl.B-2*a.edge+1e-6,'anchors.gauge: the outer rods must stay the edge distance inside the plate width.');
 add(a.edge<1.5*a.diameter,'anchors.edge: keep at least 1.5 rod diameters from the rod to the plate edge.');
 // Plate washers over the oversized holes must clear the plate edge and the column flange fillet welds.
 const hw=anchorHardware(a.diameter),row=pl.N/2-a.edge;
 add(a.edge<hw.washer/2,`anchors.edge: the ${format(hw.washer,'length',p.units,3)} plate washer must stay on the base plate; the rod is ${format(a.edge,'length',p.units,3)} from the edge.`);
 add(row-hw.washer/2<section.d/2+pl.weld,`plate.N: the plate washers clash with the column flange welds; the rod rows must be at least ${format(section.d/2+pl.weld+hw.washer/2,'length',p.units,3)} from the column centerline (now ${format(row,'length',p.units,3)}).`);
 add(a.perRow>2&&a.gauge/(a.perRow-1)<Math.max(4*a.diameter,hw.washer),'anchors.gauge: rods in a row need at least four diameters and a washer width between them.');
 add(f.L<pl.N||f.B<pl.B,'footing: the footing must be larger than the base plate.');
 add(a.embedment+f.cover+2*barDiameter[f.bar]>f.thickness+1e-6,'anchors.embedment: the anchor heads must stay above both layers of bottom bars and their cover.');
 add(c.strong.base!=='fixed'&&c.strong.top==='free','enabled: a freestanding column needs a fixed base.');
 add(f.slab>f.thickness+f.soil,'footing.slab: the saw cut slab must not be deeper than the footing below the floor.');
 // The drawings place the base on the footing, so the entered rail elevation must agree with the column geometry.
 const tor=p.drawing?.railElevation;
 if(tor){const base=columnBaseElevation(b),rail=base+existingColumnRailElevation(p);add(Math.abs(rail-tor)>1.6,`enabled: the column base on the footing (${format(base,'length',p.units,3)} above the floor) puts the rail ${format(rail,'length',p.units,3)} above the floor, not the entered top of rail ${format(tor,'length',p.units,3)}. Set the seat ${format(c.seatElevation+tor-rail,'length',p.units,3)} above the column base, or change the footing, grout or plate.`);}
 return errors;
}
export {columnBaseElevation};

/**
 * Pd is the factored dead load at the base; Md and Vd the base moment and shear from the runway dead reaction's
 * eccentricity, and Mh and Vh those from the side thrust, as magnitudes. Mx and Vx add every part.
 */
export interface BaseAction {id:string;equation:string;P:number;Mx:number;My:number;Vx:number;Vy:number;Pd:number;Md:number;Vd:number;Mh:number;Vh:number;}
/**
 * Column base reactions for each ASCE 7 combination without wind or seismic: compression positive, moments
 * and shears as magnitudes with the eccentric reaction and the side thrust adding. Each combination with
 * crane load is also taken with only an upward crane reaction ("least crane vertical") and the full side
 * thrust, for anchor tension and overturning.
 */
export function columnBaseActions(p:ProjectInput,reactions:SupportReactionSet,method:ProjectInput['method']){
 const c=p.existingColumn!,{section}=existingColumnSection(p),props=sectionProperties(section),E=section.E;
 const e=existingColumnEccentricity(p),hs=c.seatElevation,ht=existingColumnRailElevation(p),column=props.weight*c.height;
 const eccentric=columnResponse(c.height,E*props.Ix,c.strong,[{x:hs,moment:1}],[Math.min(ht,c.height)]),side=columnResponse(c.height,E*props.Ix,c.strong,[railForce(c.height,ht)],[hs]);
 const longitudinal=c.longitudinal==='column'?reactions.Cls:0,along=longitudinal?columnResponse(c.height,E*props.Iy,c.weak,[railForce(c.height,ht)]):undefined;
 return reactions.supports.map(sp=>{
  const dead=sp.D+column,live=sp.Cd+sp.Cv+sp.Ci+sp.L+sp.Clv,lift=Math.min(0,sp.craneMinimum);
  const act=(k:{id:string;equation:string;factors:{D:number;L:number}},vertical:number,tag:string):BaseAction=>{
   const runway=k.factors.D*sp.D+k.factors.L*vertical,Mh=Math.abs(k.factors.L*sp.Css*side.reactions.baseMoment),Vh=Math.abs(k.factors.L*sp.Css*side.reactions.base);
   return {id:`${method} ${k.id}${tag}`,equation:k.equation,P:k.factors.D*dead+k.factors.L*vertical,
    Mx:Math.abs(runway*e*eccentric.reactions.baseMoment)+Mh,Vx:Math.abs(runway*e*eccentric.reactions.base)+Vh,
    My:along?Math.abs(k.factors.L*longitudinal*along.reactions.baseMoment):0,Vy:along?Math.abs(k.factors.L*longitudinal*along.reactions.base):0,
    Pd:k.factors.D*dead,Md:Math.abs(k.factors.D*sp.D*e*eccentric.reactions.baseMoment),Vd:Math.abs(k.factors.D*sp.D*e*eccentric.reactions.base),Mh,Vh};
  };
  const actions=asceCombinations(method).filter(k=>!k.factors.W&&!k.factors.E).flatMap(k=>[act(k,live,''),...(k.factors.L?[act(k,lift,' · least crane vertical')]:[])]);
  return {x:sp.x,dead,actions};
 });
}

/** AISC Design Guide 1 (2nd ed.) §3.3-3.4: base plate under axial load and strong-axis moment. */
export function basePlate(p:ProjectInput,b:ColumnBaseInput,a:BaseAction,method=p.method){
 const pl=b.plate,{section:c}=existingColumnSection(p),N=pl.N,B=pl.B,fc=b.concrete.fc,lrfd=method==='LRFD';
 // A2 is the largest footing area geometrically similar to and concentric with the plate, at most 4A1.
 const ratio=Math.min(2,b.footing.L/N,b.footing.B/B),fpMax=(lrfd?.65:1/2.31)*Math.min(.85*fc*ratio,1.7*fc),qMax=fpMax*B;
 const f=N/2-b.anchors.edge,P=a.P,e=P>0?a.Mx/P:Infinity,eCrit=N/2-Math.max(0,P)/(2*qMax);
 let Y:number,T=0,bearing:number;
 // Small moment: uniform bearing over Y = N - 2e. Large moment: bearing at the limit over Y and anchor tension;
 // the plate is long enough while (f + N/2)^2 >= 2(M + Pf)/q_max (Design Guide 1 Eq. 3.4.4).
 if(P>0&&e<=eCrit){Y=N-2*e;bearing=P/(B*Y)/fpMax;}
 else{const need=2*(a.Mx+P*f)/qMax,r=(f+N/2)**2-need;
  // Net uplift that the moment does not overcome: no bearing, both rows in tension, the row toward the moment more.
  if(need<=0){Y=0;bearing=0;T=Math.max(0,-P/2+a.Mx/(2*f));}
  else{bearing=need/(f+N/2)**2;Y=r>=0?f+N/2-Math.sqrt(r):NaN;T=Number.isNaN(Y)?Infinity:qMax*Y-P;}}
 const fp=Y>0?(P+T)/(B*Y):Number.isNaN(Y)?Infinity:0;
 const m=(N-.95*c.d)/2,n=(B-.8*c.bf)/2,l=Math.max(m,n,Math.sqrt(c.d*c.bf)/4),phiB=lrfd?.9:1/1.67;
 // Compression side: cantilever l under fp, or the shorter bearing length Y when Y < m.
 const tc=!Number.isFinite(fp)?Infinity:Y>=m?l*Math.sqrt(2*fp/(phiB*pl.Fy)):Math.sqrt(4*fp*Y*(m-Y/2)/(phiB*pl.Fy));
 // Tension side: the anchor row force on its lever to the flange centerline, over the plate width.
 const x=f-c.d/2+c.tf/2,tt=T>0&&x>0?Math.sqrt(4*T*x/(B*phiB*pl.Fy)):0;
 return {fpMax,Y,T,fp,l,bearing,tRequired:Math.max(tc,tt)};
}

/** ACI 318-19 Chapter 17: headed cast-in rods in two rows at the plate N edges, strength-level loads. */
export function anchorStrength(b:ColumnBaseInput,T:number,Vx:number,Vy=0){
 const a=b.anchors,f=b.footing,sq=sqrtPsi(b.concrete.fc),da=a.diameter,n=a.perRow,s=n>1?a.gauge/(n-1):0;
 const Ase=anchorArea(da),Abrg=nutBearingArea(da),fu=Math.min(futa[a.grade],1.9*fya[a.grade],125000*psi);
 const row=b.plate.N/2-a.edge,ca1=f.L/2-row,ca2=f.B/2-a.gauge/2,ha=f.thickness;
 // §17.6.2.1.2: with three or more edges closer than 1.5hef, hef is reduced.
 const hef=ca1<1.5*a.embedment&&ca2<1.5*a.embedment?Math.min(a.embedment,Math.max(Math.max(ca1,ca2)/1.5,s/3)):a.embedment;
 const Nb=(hef<=11*inch?24*sq*ins(hef)**1.5:16*sq*ins(hef)**(5/3))*lbf,ANco=9*hef*hef;
 const cmin=Math.min(ca1,ca2),psiEd=cmin>=1.5*hef?1:.7+.3*cmin/(1.5*hef);
 // Tension row: projected area to the near edge, 1.5hef inward and across the row.
 const ANc=Math.min(n*ANco,(Math.min(ca1,1.5*hef)+1.5*hef)*(2*Math.min(ca2,1.5*hef)+a.gauge));
 const steelT=.75*n*Ase*fu,breakout=.7*ANc/ANco*psiEd*Nb,pullout=.7*n*8*Abrg*b.concrete.fc;
 // §17.6.4: side-face blowout when the rods are deep relative to the edge distance.
 const blowout=hef>2.5*ca1?.7*(1+Math.min(s,6*ca1)/(6*ca1))*160*ins(ca1)*Math.sqrt(Abrg/inch**2)*sq*lbf:undefined;
 // Shear: every rod with a grout pad (§17.7.1.2.1, 0.8); breakout of the front line of rods toward the
 // footing edge in each direction, checked separately (§17.7.2.1).
 const steelV=.65*2*n*.8*.6*Ase*fu,le=Math.min(hef,8*da);
 const shearBreakout=(c1:number,c2:number,width:number,count:number)=>{
  const Vb=Math.min(7*(le/da)**.2*Math.sqrt(ins(da))*sq*ins(c1)**1.5,9*sq*ins(c1)**1.5)*lbf;
  const AVc=(2*Math.min(1.5*c1,c2)+width)*Math.min(1.5*c1,ha),AVco=4.5*c1*c1;
  const psiEdV=c2>=1.5*c1?1:.7+.3*c2/(1.5*c1),psiH=ha<1.5*c1?Math.sqrt(1.5*c1/ha):1;
  return .7*Math.min(AVc/AVco,count)*psiEdV*psiH*Vb;
 };
 const depth=b.plate.N-2*a.edge,breakoutV=shearBreakout(ca1,ca2,a.gauge,n),breakoutVy=shearBreakout(ca2,ca1,depth,2);
 // §17.7.3 pryout: kcp times the breakout of the whole group.
 const ANcAll=Math.min(2*n*ANco,(2*Math.min(ca1,1.5*hef)+depth)*(2*Math.min(ca2,1.5*hef)+a.gauge));
 const pryout=.7*(hef>=2.5*inch?2:1)*ANcAll/ANco*psiEd*Nb;
 const V=Math.hypot(Vx,Vy),phiNn=Math.min(steelT,breakout,pullout,blowout??Infinity);
 const rv=Math.max(V/steelV,V/pryout,Vx/breakoutV,Vy/breakoutVy),phiVn=rv>0?V/rv:Math.min(steelV,pryout,breakoutV,breakoutVy);
 const rn=T/phiNn,interaction=rv<=.2?rn:rn<=.2?rv:(rn+rv)/1.2;
 return {T,V,Vx,Vy,steelT,breakout,pullout,blowout,steelV,breakoutV,breakoutVy,pryout,phiNn,phiVn,interaction,hef};
}

/** Footing weight with the soil or slab over it. */
export const footingWeight=(b:ColumnBaseInput)=>b.footing.L*b.footing.B*b.footing.thickness*concreteWeight+(b.footing.L*b.footing.B-b.plate.N*b.plate.B)*b.footing.soil*b.soil.unitWeight;

/** Service soil pressure, linear over the footing (trapezoid, triangle, or the effective area when biaxial). */
export function soilPressure(b:ColumnBaseInput,P:number,M:number,My=0){
 if(P<=0)return Infinity;
 const L=b.footing.L,B=b.footing.B,eL=M/P,eB=My/P;
 if(eL/L+eB/B<=1/6)return P/(L*B)*(1+6*eL/L+6*eB/B);
 if(eB===0)return eL<L/2?2*P/(3*B*(L/2-eL)):Infinity;
 if(eL===0)return eB<B/2?2*P/(3*L*(B/2-eB)):Infinity;
 return eL<L/2&&eB<B/2?P/((L-2*eL)*(B-2*eB)):Infinity;
}

/** ACI 318-19 footing shear and flexure for one strength-level action, in each plan direction. */
export function footingStrength(p:ProjectInput,b:ColumnBaseInput,a:BaseAction){
 const f=b.footing,{section:c}=existingColumnSection(p),h=f.thickness,sq=sqrtPsi(b.concrete.fc);
 // Both layers are taken at the upper layer's depth.
 const db=barDiameter[f.bar],d=h-f.cover-1.5*db,Pu=a.P,lambdaS=Math.min(1,Math.sqrt(2/(1+ins(d)/10)));
 // Span `L` with the moment, width `B`; column dimension `col` and plate dimension `plate` along the span.
 const way=(L:number,B:number,M:number,col:number,plate:number)=>{
  const e=Pu>0?M/Pu:Infinity;
  // Net pressure from the column alone, at x from the footing center toward the high side.
  const q=(x:number)=>{if(e<=L/6)return Pu/(L*B)*(1+12*e*x/(L*L));const reach=3*(L/2-e),from=L/2-x;return reach>0&&from<=reach?2*Pu/(3*B*(L/2-e))*(1-from/reach):0;};
  // Critical section for a steel column on a base plate: halfway between the column face and the plate edge.
  const cx=(col+plate)/4,arm=L/2-cx,steps=60,dx=arm/steps;
  let V=0,Mu=0;
  for(let i=0;i<steps;i++){const x=cx+(i+.5)*dx,w=q(x)*B*dx;Mu+=w*(x-cx);if(x>=cx+d)V+=w;}
  const bars=Math.floor((B-2*f.cover)/f.spacing)+1,As=barArea[f.bar]*bars,rho=As/(B*d);
  const phiVc=.75*8*lambdaS*Math.cbrt(rho)*sq*ins(B)*ins(d)*lbf;
  const block=As*f.fy/(.85*b.concrete.fc*B),phiMn=.9*As*f.fy*(d-block/2);
  // ACI 318-19 §25.4.2.4: straight bottom bars, uncoated, normalweight, Grade 60 (psi_g 1), no transverse reinforcement.
  const cb=Math.min(f.cover+db/2,f.spacing/2),ld=Math.max(12*inch,3/40*f.fy/(sq*psi)*(db<=.75*inch+1e-6?.8:1)/Math.min(2.5,cb/db)*db);
  return {Mu,phiMn,Vu:V,phiVc,As,bars,AsMin:.0018*B*h,ld,available:arm-f.cover};
 };
 const arm=h+b.grout,along=way(f.L,f.B,a.Mx+a.Vx*arm,c.d,b.plate.N),across=way(f.B,f.L,a.My+a.Vy*arm,c.bf,b.plate.B);
 // Two-way shear at d/2 outside the critical section, with the unbalanced moments transferred by eccentric shear.
 const cx=(c.d+b.plate.N)/4,cy=(c.bf+b.plate.B)/4,b1=2*cx+d,b2=2*cy+d,b0=2*(b1+b2),Vu=Math.max(0,Pu*(1-b1*b2/(f.L*f.B)));
 const transfer=(c1:number,c2:number,M:number)=>{const gammaV=1-1/(1+2/3*Math.sqrt(c1/c2)),Jc=d*c1**3/6+c1*d**3/6+d*c2*c1*c1/2;return gammaV*M*(c1/2)/Jc;};
 const vu=Vu/(b0*d)+transfer(b1,b2,a.Mx+a.Vx*b.grout)+transfer(b2,b1,a.My+a.Vy*b.grout),beta=Math.max(c.d,c.bf)/Math.min(c.d,c.bf);
 const phivc=.75*Math.min(4,2+4/beta,2+40*d/b0)*lambdaS*sq*psi;
 return {d,along,across,vu,phivc};
}
const ways=(r:ReturnType<typeof footingStrength>)=>[{direction:'L' as const,...r.along},{direction:'B' as const,...r.across}];

export interface ColumnBaseResult {
 station:number;
 /** Results at each support, for checks that govern elsewhere than the support reported here. */
 supports?:ColumnBaseResult[];
 plate:{action:BaseAction;bearingAction:BaseAction;Y:number;T:number;fp:number;fpMax:number;bearing:number;l:number;tRequired:number;weld:{demand:number;capacity:number}};
 anchors:ReturnType<typeof anchorStrength>&{action:BaseAction};
 footing:{weight:number;qMax:number;soilAction:BaseAction;overturning:number;sliding:number;stabilityAction:BaseAction;slidingAction:BaseAction;
  strength:ReturnType<typeof footingStrength>;shearAction:BaseAction;punchingAction:BaseAction;flexureAction:BaseAction;oneWay:number;oneWayDirection:'L'|'B';twoWay:number;flexure:number;flexureDirection:'L'|'B';
  /** Governing flexure direction: factored moment and design strength at its critical section. */
  Mu:number;phiMn:number;minSteel:number;spacingMax:number;bottom:number;
  /** Bottom bar development length over the bar length from the flexure critical section, worse direction. */
  development:number};
}
type Worst<T>={value:number;action:BaseAction;result:T};
const worst=<T,>(actions:BaseAction[],evaluate:(a:BaseAction)=>T,score:(r:T)=>number):Worst<T>=>actions.map(a=>{const result=evaluate(a);return {value:score(result),action:a,result};}).reduce((x,y)=>(Number.isNaN(y.value)?Infinity:y.value)>(Number.isNaN(x.value)?Infinity:x.value)?y:x);

export function columnBaseAnalysis(p:ProjectInput,reactions:SupportReactionSet):ColumnBaseResult{
 const b=p.columnBase!,{section:c}=existingColumnSection(p),A=sectionProperties(c).A,f=b.footing,arm=f.thickness+b.grout;
 const design=columnBaseActions(p,reactions,p.method),strength=columnBaseActions(p,reactions,'LRFD'),service=columnBaseActions(p,reactions,'ASD');
 const results=design.map((sp,j):ColumnBaseResult=>{
  const thick=worst(sp.actions,a=>basePlate(p,b,a),r=>r.tRequired),bearing=worst(sp.actions,a=>basePlate(p,b,a),r=>r.bearing);
  // Flange welds: the flange force of the moment, less the flange share of the axial load.
  const flange=Math.max(0,...sp.actions.map(a=>a.Mx/(c.d-c.tf)-a.P*c.bf*c.tf/A));
  const weld=(p.method==='LRFD'?.75:.5)*.6*70000*psi*(b.plate.weld/Math.SQRT2)*(2*c.bf-c.tw);
  const anchors=worst(strength[j].actions,a=>anchorStrength(b,Math.max(0,basePlate(p,b,a,'LRFD').T),a.Vx,a.Vy),r=>r.interaction);
  const W=footingWeight(b);
  const soil=worst(service[j].actions,a=>soilPressure(b,a.P+W,a.Mx+a.Vx*arm,a.My+a.Vy*arm),q=>q);
  // Overturning about the footing edge, with only dead load resisting: across the runway about the edge on the
  // bracket side, where the dead reaction's eccentricity reduces the restoring moment; along the runway about
  // either edge. Crane vertical load acts inside the footing, so it adds more restoring moment than its
  // eccentricity removes; it is neither credited nor counted.
  const fs=(resist:number,ot:number)=>resist<=0?0:ot>0?resist/ot:Infinity;
  const overturning=(a:BaseAction)=>Math.min(fs((a.Pd+W)*f.L/2-a.Md-a.Vd*arm,a.Mh+a.Vh*arm),fs((a.Pd+W)*f.B/2,a.My+a.Vy*arm));
  const tipping=worst(service[j].actions,overturning,v=>v>0?1/v:Infinity),sliding=worst(service[j].actions,a=>Math.hypot(a.Vx,a.Vy)/(a.Pd+W),v=>v);
  const shear=worst(strength[j].actions,a=>footingStrength(p,b,a),r=>Math.max(...ways(r).map(w=>w.Vu/w.phiVc)));
  const punching=worst(strength[j].actions,a=>footingStrength(p,b,a),r=>r.vu/r.phivc),bending=worst(strength[j].actions,a=>footingStrength(p,b,a),r=>Math.max(...ways(r).map(w=>w.Mu/w.phiMn)));
  const oneWay=ways(shear.result).reduce((x,y)=>y.Vu/y.phiVc>x.Vu/x.phiVc?y:x),flexure=ways(bending.result).reduce((x,y)=>y.Mu/y.phiMn>x.Mu/x.phiMn?y:x);
  return {station:sp.x,
   plate:{action:thick.action,bearingAction:bearing.action,Y:thick.result.Y,T:thick.result.T,fp:bearing.result.fp,fpMax:bearing.result.fpMax,bearing:bearing.value,l:thick.result.l,tRequired:thick.result.tRequired,weld:{demand:flange,capacity:weld}},
   anchors:{...anchors.result,action:anchors.action},
   footing:{weight:W,qMax:soil.value,soilAction:soil.action,overturning:tipping.result,sliding:sliding.value>0?b.soil.friction/sliding.value:Infinity,stabilityAction:tipping.action,slidingAction:sliding.action,
    strength:bending.result,shearAction:shear.action,punchingAction:punching.action,flexureAction:bending.action,oneWay:shear.value,oneWayDirection:oneWay.direction,twoWay:punching.value,flexure:bending.value,flexureDirection:flexure.direction,
    development:Math.max(...ways(bending.result).map(w=>w.ld/w.available)),
    Mu:flexure.Mu,phiMn:flexure.phiMn,minSteel:Math.max(...ways(bending.result).map(w=>w.AsMin/w.As)),spacingMax:Math.min(3*f.thickness,18*inch),bottom:f.soil+f.thickness}};
 });
 const score=(r:ColumnBaseResult)=>Math.max(r.plate.tRequired/b.plate.thickness,r.plate.bearing,r.anchors.interaction,r.footing.qMax/b.soil.allowable,r.footing.oneWay,r.footing.twoWay,r.footing.flexure,1.5/r.footing.overturning);
 return {...results.reduce((x,y)=>score(y)>score(x)?y:x),supports:results};
}

/** Every check at the support where it governs; the same base and footing are used at every support. */
export function columnBaseChecks(p:ProjectInput,r:ColumnBaseResult,column?:ExistingColumnResult):CheckResult[]{
 const all=(r.supports??[r]).map(v=>supportChecks(p,v)),rank=(c:CheckResult)=>(c.status==='fail'?1e13:0)+(c.utilization??0);
 const checks=all[0].map((c,i)=>all.map(list=>list[i]).reduce((x,y)=>rank(y)>rank(x)?y:x));
 if(column){
  const d=baseDrift(p,column),u=p.units,f=(v:number)=>format(v,'length',u,3);
  checks.push({id:'base-drift',group:'New column base',title:'Runway drift with footing rotation',demand:d.total,capacity:d.limit,quantity:'length',utilization:d.total/d.limit,status:withinLimit(d.total,d.limit)?'pass':'fail',
   equation:'\\Delta=\\Delta_{col}+\\theta\\,h,\\quad\\theta=\\frac{M}{k_s\\,BL^3/12}\\le h_{rail}/n',substitution:`\\frac{${latexNumber(d.total)}}{${latexNumber(d.limit)}}=${(d.total/d.limit).toFixed(4)}`,
   note:`Column alone ${f(d.column)} plus the footing's rotation ${d.theta.toExponential(3)} rad on the soil (modulus of subgrade reaction ${format(p.columnBase!.soil.subgrade,'subgrade',u,3)}, full contact) times ${f(d.lever)} from the footing base to the rail, under the service side thrust and static eccentric reaction of the drift check.`,referenceIds:['dg7','aci-318']});
 }
 return checks;
}
/** Rail drift with the footing rotating on the soil: base moment over k_s B L^3/12, the footing in full contact. */
export function baseDrift(p:ProjectInput,column:ExistingColumnResult){
 const b=p.columnBase!,c=p.existingColumn!,{section}=existingColumnSection(p),props=sectionProperties(section),E=section.E;
 const e=existingColumnEccentricity(p),ht=existingColumnRailElevation(p);
 const eccentric=columnResponse(c.height,E*props.Ix,c.strong,[{x:c.seatElevation,moment:1}],[Math.min(ht,c.height)]),side=columnResponse(c.height,E*props.Ix,c.strong,[railForce(c.height,ht)],[c.seatElevation]);
 const arm=b.footing.thickness+b.grout+b.plate.thickness;
 const M=Math.abs(column.crane.lateral*(side.reactions.baseMoment+side.reactions.base*arm))+Math.abs(column.crane.liveStatic*e*(eccentric.reactions.baseMoment+eccentric.reactions.base*arm));
 const theta=M/(b.soil.subgrade*b.footing.B*b.footing.L**3/12),lever=ht+arm;
 return {theta,lever,column:column.drift.value,total:column.drift.value+theta*lever,limit:column.drift.limit};
}
function supportChecks(p:ProjectInput,r:ColumnBaseResult):CheckResult[]{
 const b=p.columnBase!,u=p.units,f=(v:number,q:Parameters<typeof format>[1]='force')=>format(v,q,u,3),checks:CheckResult[]=[];
 const add=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,refs:string[],caseId?:string)=>checks.push({id:'base-'+id,group:'New column base',title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:Number.isFinite(demand)&&Number.isFinite(capacity)&&capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,referenceIds:refs,caseId});
 const at=`Support x=${f(r.station,'length')}`,pl=r.plate,a=r.anchors,ft=r.footing,s=ft.strength,way=(d:'L'|'B')=>d==='L'?'along L (strong axis)':'across B (weak axis)';
 checks.push({id:'base-basis',group:'New column base',title:'Soil, concrete and anchor data',status:b.confirmed&&b.source.trim()?'pass':'unverified',equation:'',referenceIds:['aci-318','dg1'],
  note:b.confirmed&&b.source.trim()?`Allowable bearing ${f(b.soil.allowable,'pressure')}, base friction ${b.soil.friction}, soil ${f(b.soil.unitWeight,'unitWeight')}, frost depth ${f(b.soil.frost,'length')}; f'c = ${f(b.concrete.fc,'stress')}; bars fy = ${f(b.footing.fy,'stress')}. Source: ${b.source}.`:'Enter and confirm the geotechnical report values and the concrete, reinforcement and anchor rod specifications.'});
 add('bearing','Base plate · concrete bearing',pl.bearing,1,'ratio','f_p\\le f_{p,max}=\\phi_c\\,0.85f^\\prime_c\\sqrt{A_2/A_1}\\le\\phi_c\\,1.7f^\\prime_c;\\quad\\left(f+\\tfrac N2\\right)^2\\ge\\frac{2(M+Pf)}{q_{max}}',`${at}, ${pl.bearingAction.id}. f_p,max = ${f(pl.fpMax,'stress')}. Small moment: f_p/f_p,max; large moment: the bearing block at f_p,max needs 2(M + Pf)/q_max of the available (f + N/2)². A2 is the largest footing area similar to and concentric with the plate, at most 4A1.`,['dg1'],pl.bearingAction.id);
 add('plate','Base plate · thickness',pl.tRequired,b.plate.thickness,'length','t\\ge l\\sqrt{\\frac{2f_p}{\\phi F_y}};\\quad t\\ge\\sqrt{\\frac{4Tx}{\\phi BF_y}}',`${at}, ${pl.action.id}: P = ${f(pl.action.P)}, M = ${f(pl.action.Mx,'moment')}; bearing length Y = ${f(pl.Y,'length')}${pl.T>0?`, anchor row tension ${f(pl.T)}`:''}. Cantilever l = max(m, n, λn′) = ${f(pl.l,'length')}; Fy = ${f(b.plate.Fy,'stress')}.`,['dg1'],pl.action.id);
 add('weld','Base plate · column flange welds',pl.weld.demand,pl.weld.capacity,'force','F_f=\\frac{M}{d-t_f}-P\\frac{A_f}{A}',`${at}: ${f(b.plate.weld,'length')} fillet both sides of each flange, E70XX, no directional increase.`,['aisc-connections']);
 const rods=`${at}: ${2*b.anchors.perRow} - ${f(b.anchors.diameter,'length')} ${b.anchors.grade} headed rods, hef ${f(a.hef,'length')}; strength-level ASCE 7 loads, ${a.action.id}. Cracked concrete, Condition B, no anchor reinforcement credited.`;
 add('anchor-tension','Anchor rods · tension',a.T,a.phiNn,'force','\\phi N_n=\\min(\\phi N_{sa},\\phi N_{cbg},\\phi N_{pn},\\phi N_{sbg})',`${rods} Steel ${f(a.steelT)}, concrete breakout ${f(a.breakout)}, pullout ${f(a.pullout)}${a.blowout?`, side-face blowout ${f(a.blowout)}`:''}.`,['aci-318'],a.action.id);
 add('anchor-shear','Anchor rods · shear',a.V,a.phiVn,'force','\\phi V_n=\\min(\\phi V_{sa},\\phi V_{cbg},\\phi V_{cpg})',`${rods} All rods share the base shear with a grout pad (0.8) and no friction credit. Steel ${f(a.steelV)}, pryout ${f(a.pryout)}; breakout toward the footing edge ${f(a.breakoutV)} across the runway (Vx = ${f(a.Vx)})${a.Vy>0?` and ${f(a.breakoutVy)} along it (Vy = ${f(a.Vy)})`:''}, each direction checked separately.`,['aci-318'],a.action.id);
 add('anchor-interaction','Anchor rods · tension and shear',a.interaction,1,'ratio','\\frac{N_{ua}}{\\phi N_n}+\\frac{V_{ua}}{\\phi V_n}\\le1.2',`${at}, ${a.action.id}: ACI 318-19 §17.8; a ratio of 0.2 or less is checked alone. Reported as a fraction of 1.2.`,['aci-318'],a.action.id);
 add('soil','Footing · soil bearing',ft.qMax,b.soil.allowable,'pressure','q_{max}=\\frac{P}{BL}\\left(1+\\frac{6e}{L}\\right)\;\\text{or}\;\\frac{2P}{3B(L/2-e)}',`${at}, ${ft.soilAction.id} (service): column load plus footing and soil ${f(ft.weight)}; base moment plus base shear times the footing and grout depth.`,['aci-318'],ft.soilAction.id);
 add('overturning','Footing · overturning',1.5,ft.overturning,'ratio','FS=\\frac{W_D\\,L/2-M_{D,e}}{M_{ot}}\\ge1.5',`${at}, ${ft.stabilityAction.id}: dead load of the runway, column, footing and soil about the footing edge against the side thrust (or longitudinal force) moment at the footing base. Across the runway the edge on the bracket side governs, with the runway dead reaction's eccentric moment deducted from the restoring moment; the crane vertical load is not credited.`,['aci-318'],ft.stabilityAction.id);
 add('sliding','Footing · sliding',1.5,ft.sliding,'ratio','FS=\\frac{\\mu\\,W_D}{V}\\ge1.5',`${at}, ${ft.slidingAction.id}: base friction μ = ${b.soil.friction} on the dead load; crane vertical load and passive pressure not credited.`,['aci-318'],ft.slidingAction.id);
 add('frost','Footing · depth below frost',b.soil.frost,ft.bottom,'length','\\text{bottom of footing}\\ge\\text{frost depth}',`Bottom of footing ${f(ft.bottom,'length')} below the finished floor (top of footing ${f(b.footing.soil,'length')} below the floor plus ${f(b.footing.thickness,'length')} thick). IBC 1809.4/1809.5; enter zero only for a footing protected from frost inside a heated building.`,['aci-318']);
 add('one-way','Footing · one-way shear',ft.oneWay,1,'ratio','\\phi V_c=0.75\\cdot8\\lambda_s\\rho_w^{1/3}\\sqrt{f^\\prime_c}\\,b\\,d',`${at}, ${ft.shearAction.id}: ACI 318-19 Table 22.5.5.1(c) with λs; d = ${f(s.d,'length')}; governing ${way(ft.oneWayDirection)}; critical section d beyond halfway between the column face and the plate edge.`,['aci-318'],ft.shearAction.id);
 add('two-way','Footing · two-way shear with moment transfer',ft.twoWay,1,'ratio','v_u=\\frac{V_u}{b_od}+\\frac{\\gamma_{vx}M_{ux}c}{J_{cx}}+\\frac{\\gamma_{vy}M_{uy}c}{J_{cy}}\\le\\phi v_c',`${at}, ${ft.punchingAction.id}: ACI 318-19 §8.4.4.2 and Table 22.6.5.2 with λs; perimeter d/2 outside halfway between the column face and the plate edge.`,['aci-318'],ft.punchingAction.id);
 const flexureWay=ft.flexureDirection==='L'?s.along:s.across;
 add('flexure','Footing · flexure',ft.Mu,ft.phiMn,'moment','\\phi M_n=0.9A_sf_y\\left(d-\\frac a2\\right)',`${at}, ${ft.flexureAction.id}, governing ${way(ft.flexureDirection)}: ${flexureWay.bars} ${b.footing.bar} at ${f(b.footing.spacing,'length')}, bottom, each way; critical section halfway between the column face and the plate edge.`,['aci-318'],ft.flexureAction.id);
 checks.push({id:'base-min-steel',group:'New column base',title:'Footing · minimum reinforcement',demand:ft.minSteel,capacity:1,quantity:'ratio',utilization:ft.minSteel,status:ft.minSteel<=1+1e-9?'pass':'fail',equation:'A_s\\ge0.0018\\,bh',note:`ACI 318-19 §13.3.4.1 and §7.6.1.1, Grade 60, in each direction: ${f(s.along.AsMin,'area')} required and ${f(s.along.As,'area')} provided across B; ${f(s.across.AsMin,'area')} required and ${f(s.across.As,'area')} provided across L.`,referenceIds:['aci-318']});
 const dev=[s.along,s.across].reduce((x,y)=>y.ld/y.available>x.ld/x.available?y:x);
 add('development','Footing · bottom bar development',dev.ld,dev.available,'length','\\ell_d=\\frac{3}{40}\\frac{f_y}{\\lambda\\sqrt{f^\\prime_c}}\\frac{\\psi_t\\psi_e\\psi_s\\psi_g}{(c_b+K_{tr})/d_b}d_b\\ge12\\text{ in}',`ACI 318-19 §25.4.2.4 and §13.2.8.2: straight ${b.footing.bar} bars from the flexure critical section to ${f(b.footing.cover,'length')} from the footing edge; ψt = ψe = ψg = 1${barDiameter[b.footing.bar]<=.75*inch+1e-6?', ψs = 0.8':''}, Ktr = 0, (cb + Ktr)/db ≤ 2.5.`,['aci-318']);
 add('bar-spacing','Footing · bar spacing',b.footing.spacing,ft.spacingMax,'length','s\\le\\min(3h,\\,18\\text{ in})','ACI 318-19 §7.7.2.3.',['aci-318']);
 // §13.3.3.3: a rectangular footing needs the short-direction bars banded; uniform spacing is drawn here.
 if(Math.abs(b.footing.L-b.footing.B)>.01*Math.min(b.footing.L,b.footing.B))checks.push({id:'base-band',group:'New column base',title:'Footing · short-direction band reinforcement',status:'unsupported',equation:'A_{s,band}=\\frac{2}{\\beta+1}A_{s,short}',note:'ACI 318-19 §13.3.3.3 requires part of the short-direction bars of a rectangular footing in a central band; the drawings show uniform bars each way. Use a square footing or detail the band.',referenceIds:['aci-318']});
 return checks;
}
