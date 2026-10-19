import {asceCombinations} from './asceCombinations';
import {twistShift} from './columnTwistLimit';
import {columnResponse} from './columnAnalysis';
import {existingColumnEccentricity,existingColumnRailElevation,existingColumnSection,railForce,seismicHeight} from './existingColumn';
import {anchorGrades,anchorHardware,barSizes,columnBaseElevation,footingKeyWidth,type ColumnBaseInput} from './columnBaseInputs';
import {minimumFillet} from './connectionStrength';
import {wrenchClearance} from './endStop';
import {filletRootReduction,finiteLife,fatigueThresholdKsi,KSI} from './fatigueConstants';
import {sectionProperties} from './section';
import {format} from './units';
import {latexNumber,withinLimit} from './math';
import {acrossRunwaySeismic,seismicBasis,seismicCombinations} from './runwaySeismic';
import {craneColumnReactions} from './craneColumnInputs';
import {alongSeismic,baseWarping,braceCases,braceShare,bracingGeometry,bracingLayout,designsBracing,girderOffset,offsetRodEnds,torsionBase} from './newColumnBracing';
import {activeColumnCap} from './columnCapInputs';
import {capAlongEccentricity} from './columnCap';
import {seatEnds,seatMoment} from './columnSupport';
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
 add(row-hw.washer/2<section.d/2+pl.weld,`plate.N: the plate washers clash with the column flange welds; the rod rows must be at least ${format(section.d/2+pl.weld+hw.washer/2,'length',p.units,3)} from the column centerline (provided ${format(row,'length',p.units,3)}).`);
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
export interface BaseAction {id:string;equation:string;P:number;Mx:number;My:number;Vx:number;Vy:number;Pd:number;Md:number;Vd:number;Mh:number;Vh:number;
 /** A crane column tied to the building column: the girder's side thrust at this support, factored (a combined footing's shear, footingAction). */
 css?:number;
 /** Overturning and sliding safety factor required with this combination (1.5 unless noted). */
 fs?:number;
 /** A seismic combination with overstrength: ACI 318 §17.10 applies to the anchors. */
 seismic?:boolean;
 /** Braced new columns: upward brace force at the base, concentric, and the torque from a girder's longitudinal force. */
 uplift?:number;torque?:number;
 /**
  * Braced new columns: the warping bimoment at the base, B = T a tanh(z/a) of each torque applied up the column (the
  * seat and the offset rod's top), from the same fixed-base column torsion model as the column check; the base resists
  * it as opposite lateral moments B/h0 in the two flanges.
  */
 bimoment?:number;}
/**
 * Flange lateral moment of the base bimoment, M_fl = B/h0, and what it does at the base (AISC Design Guide 9 §4.2): a
 * vertical force couple at each flange's tips, bearing at one tip and lifting the other (basePlate takes it on the plate
 * halves beside the web), and an in-plane moment on the flange's weld lines to the plate (section modulus S_w of the
 * lines about the flange center, weld length L_w both faces).
 */
export function baseBimoment(p:ProjectInput,b:ColumnBaseInput,B:number){
 const {section:c}=existingColumnSection(p),h0=c.d-c.tf,Mfl=Math.abs(B)/h0;
 // Fillet lines of one flange to the plate: the outer face over bf and the inner face over bf - tw, about the flange center.
 const outer=c.bf**3/12,inner=2*((c.bf/2)**3-(c.tw/2)**3)/3,Sw=(outer+inner)/(c.bf/2),Lw=2*c.bf-c.tw;
 return {Mfl,Sw,Lw};
}
/**
 * Column base reactions for each ASCE 7 combination without wind or seismic: compression positive, moments
 * and shears as magnitudes with the eccentric reaction and the side thrust adding. Each combination with
 * crane load is also taken with only an upward crane reaction ("least crane vertical"), for anchor tension and
 * overturning, without side thrust: side thrust comes with the wheel loads of the crane producing it.
 */
export function columnBaseActions(p:ProjectInput,runway:SupportReactionSet,method:ProjectInput['method']){
 // A crane column tied to the building carries no side thrust (craneColumnReactions) and no seismic force across the runway.
 const reactions=craneColumnReactions(p,runway),c=p.existingColumn!,{section}=existingColumnSection(p),props=sectionProperties(section),E=section.E;
 const e=existingColumnEccentricity(p),hs=c.seatElevation,ht=existingColumnRailElevation(p),column=props.weight*c.height;
 const eccentric=columnResponse(c.height,E*props.Ix,c.strong,[{x:hs,moment:1}],[Math.min(ht,c.height)]),side=columnResponse(c.height,E*props.Ix,c.strong,[railForce(c.height,ht)],[hs]);
 const longitudinal=c.longitudinal==='column'?reactions.Cls:0,along=longitudinal?columnResponse(c.height,E*props.Iy,c.weak,[railForce(c.height,ht)]):undefined;
 const basis=acrossRunwaySeismic(p),sideE=basis?columnResponse(c.height,E*props.Ix,c.strong,[railForce(c.height,seismicHeight(p))],[hs]):undefined;
 const designed=designsBracing(p)?{cases:braceCases(p,reactions,method,alongSeismic(p,reactions,section)),offset:girderOffset(p)}:undefined;
 // A column cap: the girder end reactions off the column centerline along the runway, a weak-axis moment at the top.
 const capTop=activeColumnCap(p)?columnResponse(c.height,E*props.Iy,c.weak,[{x:c.height,moment:1}]):undefined;
 // A bracket: the seat moment of the uneven girder-end reactions bends the column about its weak axis (as in the column
 // check), braced along the runway at the seat; its base moment and shear add to the cap's (none with a bracket).
 const ends=p.details?.bracket?.enabled&&!capTop?seatEnds(p):undefined,seatTop=ends?columnResponse(c.height,E*props.Iy,c.weak,[{x:hs,moment:1}],[hs]):undefined;
 return reactions.supports.map((sp,j)=>{
  const seat=(f:{D:number;L:number;Cd:number;Cv:number})=>ends&&seatTop&&ends[j]?.length?seatMoment(ends[j],f):0;
  const ex=capTop?capAlongEccentricity(p,j):0,capMy=(runway:number,ms=0)=>(capTop?Math.abs(runway*ex*capTop.reactions.baseMoment):0)+(ms&&seatTop?Math.abs(ms*seatTop.reactions.baseMoment):0),capVy=(runway:number,ms=0)=>(capTop?Math.abs(runway*ex*capTop.reactions.base):0)+(ms&&seatTop?Math.abs(ms*seatTop.reactions.base):0);
  const dead=sp.D+column,live=sp.Cd+sp.Cv+sp.Ci+sp.L+sp.Clv,lift=Math.min(0,sp.craneMinimum),cssR=reactions===runway?0:runway.supports[j]?.Css??0;
  const act=(k:{id:string;equation:string;factors:{D:number;L:number}},vertical:number,tag:string,thrust=1):BaseAction=>{
   const runway=k.factors.D*sp.D+k.factors.L*vertical,Mh=Math.abs(thrust*k.factors.L*sp.Css*side.reactions.baseMoment),Vh=Math.abs(thrust*k.factors.L*sp.Css*side.reactions.base),ms=seat({D:k.factors.D,L:k.factors.L,Cd:k.factors.L,Cv:k.factors.L});
   return {id:`${method} ${k.id}${tag}`,equation:k.equation,css:Math.abs(thrust*k.factors.L*cssR),P:k.factors.D*dead+k.factors.L*vertical,
    Mx:Math.abs(runway*e*eccentric.reactions.baseMoment)+Mh,Vx:Math.abs(runway*e*eccentric.reactions.base)+Vh,
    My:(along?Math.abs(k.factors.L*longitudinal*along.reactions.baseMoment):0)+capMy(runway,ms),Vy:(along?Math.abs(k.factors.L*longitudinal*along.reactions.base):0)+capVy(runway,ms),
    Pd:k.factors.D*dead,Md:Math.abs(k.factors.D*sp.D*e*eccentric.reactions.baseMoment),Vd:Math.abs(k.factors.D*sp.D*e*eccentric.reactions.base),Mh,Vh};
  };
  // The girder's concurrency rule (craneCombinations): side thrust without impact (TR-13 2b) and impact without side
  // thrust (2c), the fully concurrent set as well only where the project adopts it (C1).
  const full=p.aist?.concurrency==='full',crane=(k:{factors:{L:number}})=>!k.factors.L?[]:[...(full?[]:[[live-sp.Ci,' · side thrust, no impact',1],[live,' · impact, no side thrust',0]] as [number,string,number][])];
  const actions=asceCombinations(method).filter(k=>!k.factors.W&&!k.factors.E).flatMap(k=>[...(!k.factors.L||full?[act(k,live,'')]:[]),...crane(k).map(([v,t,h])=>act(k,v,t,h)),...(k.factors.L?[act(k,lift,' · least crane vertical',0)]:[])]);
  // Braced new columns: the rod whose top ends at this column compresses it; the rod whose bottom ends here lifts
  // the base and shears it along the runway; at a locating column the girder's longitudinal force is a torque.
  if(designed){
   // The offset rod B lands on the base of the lower-numbered column of each braced span off the column centerline.
   const share=braceShare(p,j),ends=offsetRodEnds(p),layout=bracingLayout(p),cross=bracingGeometry(p,section).cross.offset/layout.spans.length;
   // A base restrained against warping takes the bimoment of each torque applied up the column (torsionBase).
   const rodOffset=ends.base(j)?cross:0,rodTop=ends.top(j)?cross:0,restrained=torsionBase(p)==='warping-restrained',warping=(T:number,z:number)=>T&&restrained?baseWarping(section,T,z).B:0;
   for(const k of designed.cases)if(share.vertical||share.locating){
    const torque=share.locating?k.Hbay*designed.offset:0,V=k.H*share.vertical;
    // The offset rod whose top ends here twists the column at the work point, as its torque at the seat does: both reach
    // the base, each with its bimoment there (magnitudes added).
    const at=(crane:number,tag:string,brace:number,Vy:number,rod=0,top=0,thrust=k.side):BaseAction=>{
     const runway=k.D*sp.D+crane,Mh=Math.abs(thrust*sp.Css*side.reactions.baseMoment),Vh=Math.abs(thrust*sp.Css*side.reactions.base),ms=seat({D:k.D,L:k.live,Cd:k.Cd,Cv:k.Cv});
     return {id:`${k.id}${tag}`,equation:k.equation,css:Math.abs(thrust*cssR),P:k.D*dead+crane+brace,Mx:Math.abs(runway*e*eccentric.reactions.baseMoment)+Mh,Vx:Math.abs(runway*e*eccentric.reactions.base)+Vh,My:capMy(runway,ms),Vy:Vy+capVy(runway,ms),
      Pd:k.D*dead,Md:Math.abs(k.D*sp.D*e*eccentric.reactions.baseMoment),Vd:Math.abs(k.D*sp.D*e*eccentric.reactions.base),Mh,Vh,fs:k.fs,seismic:k.seismic||undefined,uplift:Math.max(0,-brace),torque:torque+rod+top,
      ...(restrained?{bimoment:warping(torque,hs)+warping(top,layout.height)}:{})};
    };
    actions.push(at(k.live*live+k.Cd*sp.Cd+k.Cv*sp.Cv,' · brace',V,0,0,V>0?k.H*rodTop:0));
    // The least crane vertical means no crane at this column, so no side thrust here either; side thrust comes with the
    // wheel loads of the crane that produces it (without impact, TR-13 2b).
    if(V>0)actions.push(at(Math.max(k.live,k.Cd,k.Cv)*lift,' · brace uplift',-V,k.H*share.shear,k.H*rodOffset,0,0));
    if(V>0&&k.side&&sp.Css)actions.push(at(k.live*(live-sp.Ci),' · brace uplift, side thrust',-V,k.H*share.shear,k.H*rodOffset));
   }
  }
  // Seismic across the runway at the girder, with overstrength for the base, anchors and footing (ASCE 7 §12.2.5.2).
  if(basis&&sideE){
   const QE=basis.Cs*(sp.D+sp.Cd+column),liveStatic=sp.Cd+sp.Cv;
   for(const k of seismicCombinations(method,basis).filter(v=>v.overstrength)){
    const runway=k.D*sp.D+k.L*liveStatic,Mh=Math.abs(k.E*QE*sideE.reactions.baseMoment),Vh=Math.abs(k.E*QE*sideE.reactions.base),ms=seat({D:k.D,L:0,Cd:k.L,Cv:k.L});
    actions.push({id:`${method} ${k.id}`,equation:k.equation,P:k.D*dead+k.L*liveStatic,Mx:Math.abs(runway*e*eccentric.reactions.baseMoment)+Mh,Vx:Math.abs(runway*e*eccentric.reactions.base)+Vh,My:capMy(runway,ms),Vy:capVy(runway,ms),
     Pd:k.D*dead,Md:Math.abs(k.D*sp.D*e*eccentric.reactions.baseMoment),Vd:Math.abs(k.D*sp.D*e*eccentric.reactions.base),Mh,Vh,fs:k.fs,seismic:true});
   }
  }
  return {x:sp.x,dead,actions};
 });
}

/**
 * AISC Design Guide 1 (2nd ed.) §3.3-3.4: base plate under axial load and strong-axis moment. With a base bimoment
 * (braced new columns, the column fixed against warping) each half of the plate beside the web carries half the axial
 * load and half the moment plus the couple of the flange lateral moments: each flange's M_fl = B/h0 puts its tip halves
 * at ±2M_fl/bf, compression under one flange and tension under the other on the same side of the web, a moment
 * 2M_fl h0/bf = 2B/bf on that half (AISC Design Guide 9 §4.2). The worse half is designed as a Design Guide 1 plate of
 * width B/2 with its half of each anchor row; the other half takes the moment less the couple.
 */
export function basePlate(p:ProjectInput,b:ColumnBaseInput,a:BaseAction,method=p.method){
 const pl=b.plate,{section:c}=existingColumnSection(p),N=pl.N,B=pl.B,fc=b.concrete.fc,lrfd=method==='LRFD',nr=b.anchors.perRow;
 // A2 is the largest footing area geometrically similar to and concentric with the plate, at most 4A1.
 const ratio=Math.min(2,b.footing.L/N,b.footing.B/B),fpMax=(lrfd?.65:1/2.31)*Math.min(.85*fc*ratio,1.7*fc);
 const f=N/2-b.anchors.edge,m=(N-.95*c.d)/2,n=(B-.8*c.bf)/2,l=Math.max(m,n,Math.sqrt(c.d*c.bf)/4),phiB=lrfd?.9:1/1.67,x=f-c.d/2+c.tf/2;
 /** One plate of width w under P and M: the bearing block, the anchor row tension, the bearing ratio and the thickness. */
 const plate=(w:number,P:number,M:number)=>{
  const qMax=fpMax*w,e=P>0?M/P:Infinity,eCrit=N/2-Math.max(0,P)/(2*qMax);
  let Y:number,T=0,bearing:number;
  // Small moment: uniform bearing over Y = N - 2e. Large moment: bearing at the limit over Y and anchor tension;
  // the plate is long enough while (f + N/2)^2 >= 2(M + Pf)/q_max (Design Guide 1 Eq. 3.4.4).
  if(P>0&&e<=eCrit){Y=N-2*e;bearing=P/(w*Y)/fpMax;}
  else{const need=2*(M+P*f)/qMax,r=(f+N/2)**2-need;
   // Net uplift that the moment does not overcome: no bearing, both rows in tension, the row toward the moment more.
   if(need<=0){Y=0;bearing=0;T=Math.max(0,-P/2+M/(2*f));}
   else{bearing=need/(f+N/2)**2;Y=r>=0?f+N/2-Math.sqrt(r):NaN;T=Number.isNaN(Y)?Infinity:qMax*Y-P;}}
  const fp=Y>0?(P+T)/(w*Y):Number.isNaN(Y)?Infinity:0;
  // Compression side: cantilever l under fp, or the shorter bearing length Y when Y < m.
  const tc=!Number.isFinite(fp)?Infinity:Y>=m?l*Math.sqrt(2*fp/(phiB*pl.Fy)):Math.sqrt(4*fp*Y*(m-Y/2)/(phiB*pl.Fy));
  // Tension side: the anchor row force on its lever to the flange centerline, over the plate width.
  const tt=T>0&&x>0?Math.sqrt(4*T*x/(w*phiB*pl.Fy)):0;
  return {Y,T,fp,bearing,tRequired:Math.max(tc,tt)};
 };
 const couple=a.bimoment?2*Math.abs(a.bimoment)/c.bf:0;
 if(!couple){const r=plate(B,a.P,a.Mx);return {fpMax,...r,l,rodT:Math.max(0,r.T)/nr,couple:0};}
 const worse=plate(B/2,a.P/2,a.Mx/2+couple),other=plate(B/2,a.P/2,Math.abs(a.Mx/2-couple));
 // The row tension is both halves'; its most loaded rod is in the worse half (half the row's rods, at least one).
 return {fpMax,Y:worse.Y,T:worse.T+other.T,fp:worse.fp,l,bearing:worse.bearing,tRequired:worse.tRequired,rodT:Math.max(0,worse.T)/Math.max(1,nr/2),couple};
}

/** ACI 318-19 Chapter 17: headed cast-in rods in two rows at the plate N edges, strength-level loads. */
export function anchorStrength(b:ColumnBaseInput,T:number,Vx:number,Vy=0,seismic=false,torque=0,rodT=T/b.anchors.perRow){
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
 // Steel and pullout are per rod, at the most loaded rod (a base bimoment loads the rods of one half of the row
 // more); the breakout of the row takes the row's tension T.
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
 // §17.10.5.4: in Seismic Design Category C to F, 0.75 on the concrete-governed tension strengths.
 // Shear: the direct shear shared by every rod and the torque's shear about the group centroid, T r/Σr² normal to the
 // radius, added as vectors at each rod; the most loaded rod times the rod count is the group demand, by component
 // for the breakout toward each edge.
 const rods=Array.from({length:n},(_,i)=>n>1?-a.gauge/2+i*a.gauge/(n-1):0).flatMap(y=>[[row,y],[-row,y]] as [number,number][]),J=rods.reduce((t,[u,v])=>t+u*u+v*v,0),m=rods.length;
 const per=rods.map(([u,v])=>[Vx/m-(J?torque*v/J:0),Vy/m+(J?torque*u/J:0)]),V=m*Math.max(...per.map(([x,y])=>Math.hypot(x,y))),Vxe=m*Math.max(...per.map(([x])=>Math.abs(x))),Vye=m*Math.max(...per.map(([,y])=>Math.abs(y)));
 const ks=seismic?.75:1,Tn=Math.max(T,n*rodT);
 const rt=Math.max(Tn/steelT,T/(ks*breakout),Tn/(ks*pullout),blowout===undefined?0:T/(ks*blowout)),phiNn=rt>0?Tn/rt:Math.min(steelT,ks*breakout,ks*pullout,blowout===undefined?Infinity:ks*blowout);
 const rv=Math.max(V/steelV,V/pryout,Vxe/breakoutV,Vye/breakoutVy),phiVn=rv>0?V/rv:Math.min(steelV,pryout,breakoutV,breakoutVy);
 const rn=rt,interaction=rv<=.2?rn:rn<=.2?rv:(rn+rv)/1.2;
 return {T:Tn,Trow:T,rodT,V,Vx:Vxe,Vy:Vye,torque,steelT,breakout,pullout,blowout,steelV,breakoutV,breakoutVy,pryout,phiNn,phiVn,interaction,hef,seismic};
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
 const f=b.footing,{section:col}=existingColumnSection(p),h=f.thickness,sq=sqrtPsi(b.concrete.fc);
 // A combined footing (combinedFooting): the two columns' group footprint is the column and base plate, centered (a
 // combined footing's action is footingAction's).
 const group=combinedFooting(p)?.footprint,c={d:group?.d??col.d,bf:group?.bf??col.bf},plateN=group?.N??b.plate.N,plateB=group?.B??b.plate.B;
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
 const arm=h+b.grout,along=way(f.L,f.B,a.Mx+a.Vx*arm,c.d,plateN),across=way(f.B,f.L,a.My+a.Vy*arm,c.bf,plateB);
 // Two-way shear at d/2 outside the critical section, with the unbalanced moments transferred by eccentric shear.
 const cx=(c.d+plateN)/4,cy=(c.bf+plateB)/4,b1=2*cx+d,b2=2*cy+d,b0=2*(b1+b2),Vu=Math.max(0,Pu*(1-b1*b2/(f.L*f.B)));
 const transfer=(c1:number,c2:number,M:number)=>{const gammaV=1-1/(1+2/3*Math.sqrt(c1/c2)),Jc=d*c1**3/6+c1*d**3/6+d*c2*c1*c1/2;return gammaV*M*(c1/2)/Jc;};
 const vu=Vu/(b0*d)+transfer(b1,b2,a.Mx+a.Vx*b.grout)+transfer(b2,b1,a.My+a.Vy*b.grout),beta=Math.max(c.d,c.bf)/Math.min(c.d,c.bf);
 const phivc=.75*Math.min(4,2+4/beta,2+40*d/b0)*lambdaS*sq*psi;
 return {d,along,across,vu,phivc};
}
const ways=(r:ReturnType<typeof footingStrength>)=>[{direction:'L' as const,...r.along},{direction:'B' as const,...r.across}];

export interface ColumnBaseResult {
 station:number;
 /** The base this support was designed with (its own footing: the braced one at braced columns), and whether it is that one. */
 input?:ColumnBaseInput;braced?:boolean;
 /** Lateral bearing (passive) resistance of the footing and its key (passiveResistance), service level. */
 passive?:number;
 /** Results at each support, for checks that govern elsewhere than the support reported here. */
 supports?:ColumnBaseResult[];
 plate:{action:BaseAction;bearingAction:BaseAction;Y:number;T:number;couple?:number;fp:number;fpMax:number;bearing:number;l:number;tRequired:number;weld:{demand:number;capacity:number;action?:BaseAction;Mfl?:number;Ff?:number}};
 /** Braced new columns: the brace uplift against the dead load of the runway, column and footing (service). */
 uplift?:{action:BaseAction;uplift:number;resist:number;required:number};
 /** The anchor rods at the action with the largest tension-shear interaction, and at the largest tension and shear, each its own worst case. */
 /** Fatigue of the rods, the column flange joint and the plate under the crane duty bins (columnBaseFatigue). */
 fatigue?:BaseFatigueResult;
 anchors:ReturnType<typeof anchorStrength>&{action:BaseAction};anchorTension?:ReturnType<typeof anchorStrength>&{action:BaseAction};anchorShear?:ReturnType<typeof anchorStrength>&{action:BaseAction};
 footing:{weight:number;qMax:number;soilAction:BaseAction;overturning:number;overturningRequired:number;sliding:number;slidingRequired:number;stabilityAction:BaseAction;slidingAction:BaseAction;
  strength:ReturnType<typeof footingStrength>;shearAction:BaseAction;punchingAction:BaseAction;flexureAction:BaseAction;oneWay:number;oneWayDirection:'L'|'B';twoWay:number;flexure:number;flexureDirection:'L'|'B';
  /** Governing flexure direction: factored moment and design strength at its critical section. */
  Mu:number;phiMn:number;minSteel:number;spacingMax:number;bottom:number;
  /** Bottom bar development length over the bar length from the flexure critical section, worse direction. */
  development:number};
}
/**
 * Combined footing of a crane column and its building column (columnBase.combined): plan positions u across the runway
 * from the crane column centerline, the building column at u = -s (s = craneColumn.offset, away from the crane span).
 * The footing is centered on the two base plates (the building column's taken as d + 9 1/2 in by b_f + 3 1/2 in, as the
 * configurator proportions the crane column's), at u_c; the group footprint is what the footing strength takes as the
 * "column" (both plates within it).
 */
export function combinedFooting(p:ProjectInput){
 const b=p.columnBase,k=p.craneColumn;if(!b?.combined||!k?.enabled)return undefined;
 const bc=k.building,s=k.offset,Nb=bc.d+9.5*inch,Bb=bc.bf+3.5*inch,{section:c}=existingColumnSection(p);
 const lo=-s-Nb/2,hi=b.plate.N/2,uc=(lo+hi)/2;
 return {s,uc,Nb,Bb,building:bc,footprint:{d:s+bc.d/2+c.d/2,bf:Math.max(bc.bf,c.bf),N:hi-lo,B:Math.max(Bb,b.plate.B)},
  /** The removed existing footing's extent across the runway, relative to the footing center (the new one covers it). */
  existing:p.existingColumn?.adjacent?.A?.footing??p.existingColumn?.adjacent?.B?.footing};
}
/**
 * The action on a combined footing: the crane column's base action plus the building column's existing axial load at u = -s,
 * as moments about the footing center (magnitudes added to the crane column's base moment, a bound), and the girder's side
 * thrust as a base shear across the runway (the building column's share of it, bounded by the whole). The building
 * column's dead load takes the action's dead-load factor; its live, roof live, snow and rain loads at their full value
 * (1.6 at strength level) count only where they increase the demand: in P and the moment, never in the resisting dead load.
 * The building's own wind and seismic at its column base are the EOR's (excluded).
 */
export function footingAction(p:ProjectInput,a:BaseAction,dead:number,method:ProjectInput['method']):BaseAction{
 const g=combinedFooting(p);if(!g)return a;
 const e=g.building.existing,kD=dead>0?a.Pd/dead:1,live=(method==='LRFD'?1.6:1)*(e.L.P+Math.max(e.Lr.P,e.S.P,e.R.P));
 const Db=kD*e.D.P,Pb=Db+Math.max(0,live),armB=-g.s-g.uc,armC=-g.uc;
 return {...a,P:a.P+Pb,Pd:a.Pd+Db,Mx:a.Mx+Math.abs(Pb*armB+a.P*armC),Md:a.Md+Math.abs(Db*armB+a.Pd*armC),Vx:a.Vx+(a.css??0),Vh:a.Vh+(a.css??0)};
}
/** The base for the anchors and plate bearing of a crane column on a combined footing: its footing symmetric about the column. */
export function anchorBase(p:ProjectInput,b:ColumnBaseInput):ColumnBaseInput{const g=combinedFooting(p);return g?{...b,footing:{...b.footing,L:b.footing.L-2*Math.abs(g.uc)}}:b;}
/** Columns at the ends of a braced span (the rods' uplift and shear along the runway reach their bases). */
export function bracedSupport(p:ProjectInput,j:number){return designsBracing(p)&&(bracingLayout(p).braced[j]??0)>0;}
/** The base at support j: the braced columns' footing (columnBase.braced) there, else the typical one. */
export function baseAt(p:ProjectInput,j:number):ColumnBaseInput{const b=p.columnBase!;return b.braced&&bracedSupport(p,j)?{...b,footing:b.braced.footing}:b;}
/** The footings in use: the typical one, and the braced columns' where it differs. */
export function footingsOf(p:ProjectInput){const b=p.columnBase!;return b.braced&&designsBracing(p)?[b.footing,b.braced.footing]:[b.footing];}
/**
 * Allowable lateral bearing (passive) resistance of a footing (soil.passive per unit depth, IBC §1806.2) on its
 * leading face, the smaller plan width, from the bottom of the slab (the slab and the soil above it not credited) to the
 * bottom of the footing or of its shear key: P_p = p (z_2² - z_1²)/2 with depths below the slab bottom.
 */
export function passiveResistance(b:ColumnBaseInput){
 const f=b.footing,k=b.soil.passive??0,s=f.slab,z1=Math.max(f.soil,s)-s,z2=f.soil+f.thickness+(f.key??0)-s;
 return k>0&&z2>z1?k*Math.min(f.L,f.B)*(z2**2-z1**2)/2:0;
}
/** Sliding safety factor: (μN + P_p)/V (IBC §1806.3.1, friction and lateral bearing combined). */
export function slidingFs(b:ColumnBaseInput,N:number,V:number,passive=passiveResistance(b)){const R=b.soil.friction*Math.max(0,N)+passive;return V>0?R/V:Infinity;}
type Worst<T>={value:number;action:BaseAction;result:T};
const worst=<T,>(actions:BaseAction[],evaluate:(a:BaseAction)=>T,score:(r:T)=>number):Worst<T>=>actions.map(a=>{const result=evaluate(a);return {value:score(result),action:a,result};}).reduce((x,y)=>(Number.isNaN(y.value)?Infinity:y.value)>(Number.isNaN(x.value)?Infinity:x.value)?y:x);

/**
 * Column flange to base plate fillets for one action, as an equivalent flange force on the weld length L_w (both faces):
 * the flange force of the moment less the flange share of the axial load, F_f = M/(d - tf) - P A_f/A, and the
 * flange lateral moment of the base bimoment M_fl = B/h0 as an in-plane moment on the weld lines, F_eq = F_f + M_fl L_w/S_w.
 */
export function flangeWeldDemand(p:ProjectInput,b:ColumnBaseInput,a:BaseAction,A:number){
 const {section:c}=existingColumnSection(p),Ff=a.Mx/(c.d-c.tf)-a.P*c.bf*c.tf/A,w=baseBimoment(p,b,a.bimoment??0);
 // A CJP flange joint: the flange section bf·tf with the lateral moment on its section modulus tf bf²/6.
 return {Ff,Mfl:w.Mfl,demand:Math.max(0,Ff)+w.Mfl*(b.plate.flangeJoint==='cjp'?6/c.bf:w.Lw/w.Sw)};
}
/**
 * Strength of one flange's joint to the base plate as a flange force: fillets both faces over L_w = 2bf - tw (E70XX,
 * no directional increase), or a CJP groove weld, whose tension normal to its axis the base metal governs (AISC
 * 360-16 Table J2.5): φF_y b_f t_f with the lesser of the column and plate yield.
 */
export function flangeWeldCapacity(p:ProjectInput,b:ColumnBaseInput){
 const {section:c}=existingColumnSection(p),lrfd=p.method==='LRFD';
 return b.plate.flangeJoint==='cjp'?(lrfd?.9:1/1.67)*Math.min(c.Fy,b.plate.Fy)*c.bf*c.tf:(lrfd?.75:.5)*.6*70000*psi*(b.plate.weld/Math.SQRT2)*(2*c.bf-c.tw);
}
/** The anchor rods for one strength-level action: the row tension from the bearing block, the base shears and torque, and the bimoment's rod force. */
export function anchorsFor(p:ProjectInput,b:ColumnBaseInput,a:BaseAction,seismicAnchors:boolean){
 const plate=basePlate(p,b,a,'LRFD');
 return anchorStrength(b,Math.max(0,plate.T),a.Vx,a.Vy,!!a.seismic&&seismicAnchors,a.torque??0,plate.rodT);
}
export function columnBaseAnalysis(p:ProjectInput,reactions:SupportReactionSet):ColumnBaseResult{
 const b=p.columnBase!,{section:c}=existingColumnSection(p),A=sectionProperties(c).A,f=b.footing,arm=f.thickness+b.grout;
 const design=columnBaseActions(p,reactions,p.method),strength=columnBaseActions(p,reactions,'LRFD'),service=columnBaseActions(p,reactions,'ASD'),cyclic=columnBaseFatigueActions(p,reactions);
 const results=design.map((sp,j):ColumnBaseResult=>{
  // Each support on its own footing: the braced columns' (columnBase.braced), else the typical one.
  const b=baseAt(p,j),f=b.footing,arm=f.thickness+b.grout,passive=passiveResistance(b),bA=anchorBase(p,b);
  // A combined footing carries the building column too (footingAction); the plate and rods see the crane column alone.
  const fa=(a:BaseAction,method:ProjectInput['method'])=>footingAction(p,a,design[j].dead,method),sa=(a:BaseAction)=>fa(a,'ASD'),ua=(a:BaseAction)=>fa(a,'LRFD');
  const thick=worst(sp.actions,a=>basePlate(p,bA,a),r=>r.tRequired),bearing=worst(sp.actions,a=>basePlate(p,bA,a),r=>r.bearing);
  const weld=flangeWeldCapacity(p,b),flange=worst(sp.actions,a=>flangeWeldDemand(p,b,a,A),v=>v.demand);
  const seismicAnchors=(seismicBasis(p)?.sdc??'A')>='C',rods=(a:BaseAction)=>anchorsFor(p,bA,a,seismicAnchors);
  const anchors=worst(strength[j].actions,rods,r=>r.interaction),anchorTension=worst(strength[j].actions,rods,r=>r.phiNn>0?r.T/r.phiNn:Infinity),anchorShear=worst(strength[j].actions,rods,r=>r.phiVn>0?r.V/r.phiVn:Infinity);
  const W=footingWeight(b);
  const soil=worst(service[j].actions.map(sa),a=>soilPressure(b,a.P+W,a.Mx+a.Vx*arm,a.My+a.Vy*arm),q=>q);
  // Overturning about the footing edge, with only dead load resisting: across the runway about the edge on the
  // bracket side, where the dead reaction's eccentricity reduces the restoring moment; along the runway about
  // either edge. Crane vertical load acts inside the footing, so it adds more restoring moment than its
  // eccentricity removes; it is neither credited nor counted.
  const fs=(resist:number,ot:number)=>resist<=0?0:ot>0?resist/ot:Infinity;
  // A brace's upward force acts at the column centerline and reduces the restoring weight.
  const overturning=(a:BaseAction)=>{const Wr=a.Pd+W-(a.uplift??0);return Math.min(fs(Wr*f.L/2-a.Md-a.Vd*arm,a.Mh+a.Vh*arm),fs(Wr*f.B/2,a.My+a.Vy*arm));};
  // Each combination's required safety factor: 1.5, or 1.0 with the reduced dead load of the seismic combinations.
  const tipping=worst(service[j].actions.map(sa),a=>({fs:overturning(a),required:a.fs??1.5}),v=>v.fs>0?v.required/v.fs:Infinity);
  // Base friction on the dead load combined with the lateral bearing (passive) resistance (IBC §1806.3.1).
  const sliding=worst(service[j].actions.map(sa),a=>({fs:slidingFs(b,a.Pd+W-(a.uplift??0),Math.hypot(a.Vx,a.Vy),passive),required:a.fs??1.5}),v=>v.fs>0?v.required/v.fs:Infinity);
  const lifted=service[j].actions.map(sa).filter(a=>(a.uplift??0)>0),lift=lifted.length?worst(lifted,a=>({uplift:a.uplift!,resist:a.Pd+W,required:a.fs??1.5}),v=>v.required*v.uplift/v.resist):undefined;
  const factored=strength[j].actions.map(ua);
  const shear=worst(factored,a=>footingStrength(p,b,a),r=>Math.max(...ways(r).map(w=>w.Vu/w.phiVc)));
  const punching=worst(factored,a=>footingStrength(p,b,a),r=>r.vu/r.phivc),bending=worst(factored,a=>footingStrength(p,b,a),r=>Math.max(...ways(r).map(w=>w.Mu/w.phiMn)));
  const oneWay=ways(shear.result).reduce((x,y)=>y.Vu/y.phiVc>x.Vu/x.phiVc?y:x),flexure=ways(bending.result).reduce((x,y)=>y.Mu/y.phiMn>x.Mu/x.phiMn?y:x);
  return {station:sp.x,input:b,braced:b!==p.columnBase,passive,fatigue:columnBaseFatigue(p,b,cyclic[j]),
   ...(lift?{uplift:{action:lift.action,...lift.result}}:{}),
   plate:{action:thick.action,bearingAction:bearing.action,Y:thick.result.Y,T:thick.result.T,couple:thick.result.couple,fp:bearing.result.fp,fpMax:bearing.result.fpMax,bearing:bearing.value,l:thick.result.l,tRequired:thick.result.tRequired,
    weld:{demand:Math.max(0,flange.value),capacity:weld,action:flange.action,Mfl:flange.result.Mfl,Ff:flange.result.Ff}},
   anchors:{...anchors.result,action:anchors.action},anchorTension:{...anchorTension.result,action:anchorTension.action},anchorShear:{...anchorShear.result,action:anchorShear.action},
   footing:{weight:W,qMax:soil.value,soilAction:soil.action,overturning:tipping.result.fs,overturningRequired:tipping.result.required,sliding:sliding.result.fs,slidingRequired:sliding.result.required,stabilityAction:tipping.action,slidingAction:sliding.action,
    strength:bending.result,shearAction:shear.action,punchingAction:punching.action,flexureAction:bending.action,oneWay:shear.value,oneWayDirection:oneWay.direction,twoWay:punching.value,flexure:bending.value,flexureDirection:flexure.direction,
    development:Math.max(...ways(bending.result).map(w=>w.ld/w.available)),
    Mu:flexure.Mu,phiMn:flexure.phiMn,minSteel:Math.max(...ways(bending.result).map(w=>w.AsMin/w.As)),spacingMax:Math.min(3*f.thickness,18*inch),bottom:f.soil+f.thickness}};
 });
 const score=(r:ColumnBaseResult)=>Math.max(r.uplift?r.uplift.required*r.uplift.uplift/r.uplift.resist:0,r.plate.tRequired/b.plate.thickness,r.plate.bearing,r.anchors.interaction,r.footing.qMax/b.soil.allowable,r.footing.oneWay,r.footing.twoWay,r.footing.flexure,r.footing.overturningRequired/r.footing.overturning);
 return {...results.reduce((x,y)=>score(y)>score(x)?y:x),supports:results};
}

/** Every check at the support where it governs; the same base and footing are used at every support. */
export function columnBaseChecks(p:ProjectInput,r:ColumnBaseResult,column?:ExistingColumnResult):CheckResult[]{
 const all=(r.supports??[r]).map(v=>supportChecks(p,v)),rank=(c:CheckResult)=>(c.status==='fail'?1e13:0)+(c.utilization??0);
 // Some checks apply at some supports only (the brace uplift at braced columns): merge by id in first-seen order.
 const ids=[...new Set(all.flat().map(c=>c.id))];
 const checks=ids.map(id=>all.flatMap(list=>list.filter(c=>c.id===id)).reduce((x,y)=>rank(y)>rank(x)?y:x));
 if(column){
  const d=baseDrift(p,column),u=p.units,f=(v:number)=>format(v,'length',u,3);
  checks.push({id:'base-drift',group:'New column base',title:'Runway drift with footing rotation',demand:d.total,capacity:d.limit,quantity:'length',utilization:d.total/d.limit,status:withinLimit(d.total,d.limit)?'pass':'fail',
   equation:'\\Delta=\\Delta_{col}+\\theta\\,h,\\quad\\theta=\\frac{M}{k_s\\,BL^3/12}\\le h/n',substitution:`\\frac{${latexNumber(d.total)}}{${latexNumber(d.limit)}}=${(d.total/d.limit).toFixed(4)}`,
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
 // The column's drift as checked (column-drift): with the rail's shift across the runway from the column twist.
 const own=column.drift.value+twistShift(column.torsion);
 return {theta,lever,column:own,total:own+theta*lever,limit:column.drift.limit};
}
/**
 * Fillet all around each plate washer to the base plate, so every rod takes its share of the base shear through
 * the oversized hole (AISC Design Guide 1 §2.10). The size is the Table J2.4 minimum, no more than the J2.2b
 * maximum along the washer edge; E70XX, no directional increase.
 */
export function plateWasherWeld(b:ColumnBaseInput){
 const hw=anchorHardware(b.anchors.diameter),t=hw.washerThickness,edgeMax=t<6.35?t:t-25.4/16;
 const size=Math.min(minimumFillet(Math.max(t,b.plate.thickness)),edgeMax),length=4*hw.washer;
 return {size,length,phiRn:.75*.6*482.6*Math.SQRT1_2*size*length};
}
/**
 * Fatigue actions at each new-column base, per duty bin, unfactored (AISC 360-16 Appendix 3; the AIST TR-13 §3.10.2.3
 * fatigue load C_d + f_i C_v + 0.5 C_ss, without impact): with the crane at the column, its reaction scaled to the
 * bin's lifted fraction f_i at the column eccentricity e and half the side thrust at the rail, the moments adding; with
 * the crane away, the least crane reaction at the same scale (an uplift from a crane in the next span, else none). At
 * a braced column the service traction C_ls of each passage adds the rods' upward force at the base, and at a locating
 * column with a warping-restrained base the bimoment of its torque at the seat. Returned per bin as the two states,
 * crane at the column (P1, M1, bimoment B1) and away (P2, M2), each with the runway and column dead load: axial
 * compression positive, the strong-axis moment as a magnitude. The weak-axis seat moment of uneven girder-end
 * reactions is not included (the rod rows and flange welds take the strong axis).
 */
export function columnBaseFatigueActions(p:ProjectInput,runway:SupportReactionSet){
 const reactions=craneColumnReactions(p,runway),c=p.existingColumn!,{section}=existingColumnSection(p),props=sectionProperties(section),E=section.E;
 const spectrum=p.details?.spectrum?.length?p.details.spectrum:[{name:'All cycles',liftFraction:1,cycles:p.fatigue.cycles}];
 const e=existingColumnEccentricity(p),hs=c.seatElevation,ht=existingColumnRailElevation(p);
 const kE=Math.abs(columnResponse(c.height,E*props.Ix,c.strong,[{x:hs,moment:1}],[Math.min(ht,c.height)]).reactions.baseMoment);
 const kS=Math.abs(columnResponse(c.height,E*props.Ix,c.strong,[railForce(c.height,ht)],[hs]).reactions.baseMoment);
 const braced=designsBracing(p),restrained=torsionBase(p)==='warping-restrained',offset=braced?girderOffset(p):0,column=props.weight*c.height;
 return reactions.supports.map((sp,j)=>{
  const share=braced?braceShare(p,j):undefined,U=share?reactions.Cls*share.vertical:0;
  const B=share?.locating&&restrained?Math.abs(baseWarping(section,reactions.Cls*offset,hs).B):0;
  const crane=sp.Cd+sp.Cv,least=Math.min(0,sp.craneMinimum);
  return {x:sp.x,e,bins:spectrum.map(v=>{
   const k=crane>0?(sp.Cd+v.liftFraction*sp.Cv)/crane:0,R=k*crane,Rmin=k*least,P0=sp.D+column;
   return {name:v.name,cycles:v.cycles,P1:P0+R-U,M1:Math.abs((sp.D+R)*e*kE)+.5*sp.Css*kS,B1:B,P2:P0+Rmin,M2:Math.abs((sp.D+Rmin)*e*kE)};
  })};
 });
}
export type BaseFatigueActions=ReturnType<typeof columnBaseFatigueActions>[number];
/**
 * Stress ranges of the base under one support's fatigue actions (columnBaseFatigueActions), for the base as entered:
 * - anchor rods (Table A-3.1 item 8.5, snug-tightened, on the tensile stress area): the row tension of each state by
 *   the elastic base plate method (elasticRowTension: triangular bearing on the concrete, the rods elastic, n = E_s/E_c),
 *   the range shared by the rods of the row; with a base bimoment the worse half of the plate takes P/2 and
 *   M/2 + 2B/b_f on half the rods (as basePlate);
 * - column flange at its joint to the plate: ΔM/S_x − ΔP/A on the tension flange plus the warping stress of the
 *   flange lateral moment ΔB/h_0 (Table A-3.1 item 5.6 for the pair of fillets: toe C, root C″ with R_FIL; item 5.4
 *   for a CJP flange joint: C);
 * - base plate at the toe of the flange fillets: the row tension ΔT on its lever x to the flange (the plate thickness
 *   check's tension side), 6ΔT x/(B t²) (item 5.7 analog, Category C).
 */
export function columnBaseFatigue(p:ProjectInput,b:ColumnBaseInput,a:BaseFatigueActions){
 const {section:c}=existingColumnSection(p),props=sectionProperties(c),pl=b.plate,an=b.anchors;
 const N=pl.N,f=N/2-an.edge,x=f-c.d/2+c.tf/2,Ase=anchorArea(an.diameter),h0=c.d-c.tf;
 const bins=a.bins.map(v=>{
  const half=v.B1>0,rods=half?Math.max(1,an.perRow/2):an.perRow,width=half?pl.B/2:pl.B;
  const T=(P:number,M:number)=>elasticRowTension(b,width,rods,half?P/2:P,half?M/2:M);
  const row=Math.max(0,T(v.P1,v.M1+(half?4*v.B1/c.bf:0))-T(v.P2,v.M2)),dP=v.P1-v.P2,dM=v.M1-v.M2;
  return {name:v.name,cycles:v.cycles,rod:row/rods/Ase,flange:Math.max(0,dM/props.Sx-dP/props.A)+(v.B1/h0)*6/(c.tf*c.bf**2),plate:6*row*Math.max(0,x)/(width*pl.thickness**2),row};
 });
 const cycles=a.bins.reduce((s,v)=>s+v.cycles,0),most=(k:'rod'|'flange'|'plate')=>Math.max(0,...bins.map(v=>v[k]));
 const C=finiteLife(4.4,cycles),ksi=KSI,cjp=pl.flangeJoint==='cjp',R=cjp?1:filletRootReduction(c.tf,pl.weld);
 return {x:a.x,cycles,bins,area:Ase,
  // Item 8.5: Cf = 3.9 × 10^8 (the E′ constant), F_TH = 7 ksi.
  rod:{range:most('rod'),capacity:Math.max(finiteLife(.39,cycles),7*ksi),threshold:7*ksi},
  toe:{range:most('flange'),capacity:Math.max(C,fatigueThresholdKsi.C*ksi),threshold:fatigueThresholdKsi.C*ksi},
  root:cjp?undefined:{range:most('flange'),capacity:R*C,R},
  plate:{range:most('plate'),capacity:Math.max(C,fatigueThresholdKsi.C*ksi),threshold:fatigueThresholdKsi.C*ksi}};
}
export type BaseFatigueResult=ReturnType<typeof columnBaseFatigue>;
/**
 * Anchor row tension of a base plate of width w under service P (compression positive) and M by the elastic method
 * (AISC Design Guide 1, 1st ed., §3.4; Blodgett): within the kern (e = M/P ≤ N/6) the plate bears throughout and the
 * rods take nothing; beyond it the triangular bearing length Y solves Y³ + 3(e − N/2)Y² + K(f + e)Y − K(f + e)(N/2 + f)
 * = 0, K = 6nA_s/w, A_s the tension row's stress area, n = E_s/E_c (E_c = 57,000√f′c psi), f the row from the column
 * centerline, and T = P(e − N/2 + Y/3)/(N/2 − Y/3 + f). Net uplift: both rows in tension, T = −P/2 + M/(2f).
 */
export function elasticRowTension(b:ColumnBaseInput,w:number,rods:number,P:number,M:number){
 const N=b.plate.N,f=N/2-b.anchors.edge,M0=Math.abs(M);
 if(P<=0)return Math.max(0,-P/2+M0/(2*f));
 const e=M0/P;if(e<=N/6)return 0;
 const n=200000/(57000*sqrtPsi(b.concrete.fc)*psi),K=6*n*rods*anchorArea(b.anchors.diameter)/w;
 const g=(Y:number)=>Y**3+3*(e-N/2)*Y**2+K*(f+e)*Y-K*(f+e)*(N/2+f);
 let lo=0,hi=N;for(let i=0;i<80;i++){const m=(lo+hi)/2;if(g(m)>0)hi=m;else lo=m;}
 const Y=(lo+hi)/2;return Math.max(0,P*(e-N/2+Y/3)/(N/2-Y/3+f));
}
/**
 * Clearance from each anchor rod row to the column flange face, N/2 − edge − d/2, against what must fit there: the
 * plate washer's half width, its fillet to the base plate and the column flange fillet to the plate, toe to toe; and
 * the socket tightening clearance of the nut (wrenchClearance, AISC Manual Table 7-15, about 1.6 rod diameters)
 * measured to the toe of the flange fillet.
 */
export function rodClearance(p:ProjectInput,b:ColumnBaseInput){
 const {section:c}=existingColumnSection(p),hw=anchorHardware(b.anchors.diameter),flange=b.plate.weld,washerWeld=plateWasherWeld(b).size;
 const washer=hw.washer/2+washerWeld+flange,wrench=wrenchClearance(b.anchors.diameter)+flange;
 return {available:b.plate.N/2-b.anchors.edge-c.d/2,required:Math.max(washer,wrench),washer,wrench,washerWeld,flange,washerWidth:hw.washer,socket:wrenchClearance(b.anchors.diameter)};
}
export function supportChecks(p:ProjectInput,r:ColumnBaseResult):CheckResult[]{
 const b=r.input??p.columnBase!,u=p.units,f=(v:number,q:Parameters<typeof format>[1]='force')=>format(v,q,u,3),checks:CheckResult[]=[];
 const add=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,refs:string[],caseId?:string)=>checks.push({id:'base-'+id,group:'New column base',title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:Number.isFinite(demand)&&Number.isFinite(capacity)&&capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,referenceIds:refs,caseId});
 const at=`Support x=${f(r.station,'length')}${p.columnBase!.braced&&designsBracing(p)?`, ${r.braced?'braced-column footing':'typical footing'} ${f(b.footing.L,'length')} × ${f(b.footing.B,'length')}`:''}`,pl=r.plate,a=r.anchors,ft=r.footing,s=ft.strength,way=(d:'L'|'B')=>d==='L'?'along L (strong axis)':'across B (weak axis)';
 checks.push({id:'base-basis',group:'New column base',title:'Soil, concrete and anchor data',status:b.confirmed&&b.source.trim()?'pass':'unverified',equation:'',referenceIds:['aci-318','dg1'],
  note:b.confirmed&&b.source.trim()?`Allowable bearing ${f(b.soil.allowable,'pressure')}, base friction ${b.soil.friction}, soil ${f(b.soil.unitWeight,'unitWeight')}, frost depth ${f(b.soil.frost,'length')}; f'c = ${f(b.concrete.fc,'stress')}; bars fy = ${f(b.footing.fy,'stress')}. Source: ${b.source}.`:'Enter and confirm the geotechnical report values and the concrete, reinforcement and anchor rod specifications.'});
 add('bearing','Base plate · concrete bearing',pl.bearing,1,'ratio','f_p\\le f_{p,max}=\\phi_c\\,0.85f^\\prime_c\\sqrt{A_2/A_1}\\le\\phi_c\\,1.7f^\\prime_c;\\quad\\left(f+\\tfrac N2\\right)^2\\ge\\frac{2(M+Pf)}{q_{max}}',`${at}, ${pl.bearingAction.id}. f_p,max = ${f(pl.fpMax,'stress')}. Small moment: f_p/f_p,max; large moment: the bearing block at f_p,max needs 2(M + Pf)/q_max of the available (f + N/2)². A2 is the largest footing area similar to and concentric with the plate, at most 4A1.`,['dg1'],pl.bearingAction.id);
 add('plate','Base plate · thickness',pl.tRequired,b.plate.thickness,'length','t\\ge l\\sqrt{\\frac{2f_p}{\\phi F_y}};\\quad t\\ge\\sqrt{\\frac{4Tx}{\\phi BF_y}}',`${at}, ${pl.action.id}: P = ${f(pl.action.P)}, M = ${f(pl.action.Mx,'moment')}; bearing length Y = ${f(pl.Y,'length')}${pl.T>0?`, anchor row tension ${f(pl.T)}`:''}${pl.couple?`; base bimoment ${f(pl.action.bimoment!,'bimoment')}: each half of the plate beside the web designed for P/2 and M/2 + 2B/bf = M/2 + ${f(pl.couple,'moment')} on width B/2 (the flange lateral moments B/h0 as tip forces ±2M_fl/bf)`:''}. Cantilever l = max(m, n, λn′) = ${f(pl.l,'length')}; Fy = ${f(b.plate.Fy,'stress')}.`,['dg1'],pl.action.id);
 add('weld','Base plate · column flange welds',pl.weld.demand,pl.weld.capacity,'force',pl.weld.Mfl?'F_{eq}=\\frac{M}{d-t_f}-P\\frac{A_f}{A}+M_{fl}\\frac{L_w}{S_w},\\;M_{fl}=\\frac{B}{h_o}':'F_f=\\frac{M}{d-t_f}-P\\frac{A_f}{A}',`${at}${pl.weld.action?`, ${pl.weld.action.id}`:''}: ${b.plate.flangeJoint==='cjp'?`CJP groove weld of each flange (tension normal to the weld: base metal, φFy·bf·tf, Table J2.5), ${f(b.plate.weld,'length')} fillets both sides of the web`:`${f(b.plate.weld,'length')} fillet both sides of each flange, E70XX, no directional increase`}.${pl.weld.Mfl?` The column is fixed against warping at the base (the column torsion check credits it): the base bimoment B = ${f(pl.weld.action!.bimoment!,'bimoment')} acts as opposite flange lateral moments M_fl = B/h0 = ${f(pl.weld.Mfl,'moment')}, an in-plane moment on each flange's weld lines (S_w about the flange center) added to the flange force ${f(Math.max(0,pl.weld.Ff??0))} (AISC Design Guide 9 §4.2).`:''}`,['aisc-connections'],pl.weld.action?.id);
 const rods=(a:ColumnBaseResult['anchors'])=>`${at}: ${2*b.anchors.perRow} - ${f(b.anchors.diameter,'length')} ${b.anchors.grade} headed rods, hef ${f(a.hef,'length')}; strength-level ASCE 7 loads, ${a.action.id}${a.action.seismic?' with overstrength Ωo (ASCE 7 §12.2.5.2)':''}${a.seismic?'; ACI 318-19 §17.10.5.4: 0.75 on concrete breakout, pullout and side-face blowout':''}. Cracked concrete, Condition B, no anchor reinforcement credited.`;
 const at_=r.anchorTension??a,as=r.anchorShear??a;
 add('anchor-tension','Anchor rods · tension',at_.T,at_.phiNn,'force','\\phi N_n=\\min(\\phi N_{sa},\\phi N_{cbg},\\phi N_{pn},\\phi N_{sbg})',`${rods(at_)} Largest tension of all the actions. Steel ${f(at_.steelT)}, concrete breakout ${f(at_.breakout)}, pullout ${f(at_.pullout)}${at_.blowout?`, side-face blowout ${f(at_.blowout)}`:''}.${at_.action.bimoment?` With the base bimoment ${f(at_.action.bimoment,'bimoment')} the rods of one half of the row take more (base plate check): steel and pullout at the most loaded rod, ${f(at_.rodT)} (n times it, ${f(at_.T)}, against the row strengths); breakout of the row ${f(at_.Trow)}.`:''}`,['aci-318'],at_.action.id);
 add('anchor-shear','Anchor rods · shear',as.V,as.phiVn,'force','\\phi V_n=\\min(\\phi V_{sa},\\phi V_{cbg},\\phi V_{cpg})',`${rods(as)} Largest shear of all the actions. All rods share the base shear with a grout pad (0.8) and no friction credit${as.torque?`; the base torque ${f(as.torque,'moment')} shears each rod T r/Σr² normal to its radius, added as a vector to its share of the direct shear, the most loaded rod times the rod count giving the group demand`:''}. Steel ${f(as.steelV)}, pryout ${f(as.pryout)}; breakout toward the footing edge ${f(as.breakoutV)} across the runway (Vx = ${f(as.Vx)})${as.Vy>0?` and ${f(as.breakoutVy)} along it (Vy = ${f(as.Vy)})`:''}, each direction checked separately.`,['aci-318'],as.action.id);
 {const w=plateWasherWeld(b),n=2*b.anchors.perRow;
  add('washer-weld','Plate washer · weld to base plate',as.V/n,w.phiRn,'force','\\phi R_n=0.75\\cdot0.60F_{EXX}\\cdot0.707w\\cdot4b_w',`${at}, ${as.action.id}: the most loaded rod's shear, V/${n}. ${f(w.size,'length')} fillet all around each ${f(anchorHardware(b.anchors.diameter).washer,'length')} plate washer, E70XX, L = ${f(w.length,'length')}; Table J2.4 minimum for the thicker part, within the J2.2b edge maximum.`,['aisc-connections','dg1'],as.action.id);}
 {const g=rodClearance(p,b),L=(v:number)=>f(v,'length');
  add('rod-clear','Anchor rods · clearance to the column flange',g.required,g.available,'length','c=\\tfrac N2-e_{edge}-\\tfrac d2\\ge\\max\\left(\\tfrac{b_w}2+w_w+w_f,\\;C_1+w_f\\right)',`Each rod row ${L(g.available)} from the column flange face. The ${L(g.washerWidth)} plate washer's half width, its ${L(g.washerWeld)} fillet to the plate and the ${L(g.flange)} column flange fillet, toe to toe: ${L(g.washer)}; the nut's socket tightening clearance C1 = ${L(g.socket)} (AISC Manual Table 7-15, about 1.6 rod diameters) to the toe of the flange fillet: ${L(g.wrench)}. The sizing moves the rod rows out (a longer plate) until both fit.`,['dg1','aisc-connections']);}
 if(r.fatigue){
  const z=r.fatigue,s=(v:number)=>f(v,'stress'),n=z.cycles.toLocaleString('en-US'),rated=z.bins.reduce((x,y)=>y.rod+y.flange>x.rod+x.flange?y:x);
  const basis=`${at}: crane duty bins unfactored (AIST TR-13 §3.10.2.3: C_d + f_i C_v + 0.5 C_ss, no impact), crane at the column against crane away, the largest bin range (${rated.name}) taken for all n_SR = ${n} cycles (AISC 360-16 Appendix 3, Eq. A-3-1)`;
  add('anchor-fatigue','Anchor rods · fatigue (A-3.1 item 8.5)',z.rod.range,z.rod.capacity,'stress','f_{sr}=\\frac{T_1-T_2}{n_rA_t},\\;T=P\\frac{e-N/2+Y/3}{N/2-Y/3+f}\\le F_{SR}=\\left(\\frac{C_f}{n_{SR}}\\right)^{0.333}\\ge F_{TH}',`${basis}. Snug-tightened rods, AISC 360-16 Table A-3.1 item 8.5 (Cf = 3.9 × 10^8, F_TH = ${s(z.rod.threshold)}) on the tensile stress area ${f(z.area,'area')}. Row tension of each state by the elastic base plate method (triangular bearing, elastic rods, n = E_s/E_c; Design Guide 1, 1st ed. §3.4), the runway and column dead load in both: range ΔT = ${f(rated.row)} per row of ${b.anchors.perRow}.`,['dg1','aisc-fatigue']);
  add('weld-fatigue-toe','Column flange at the base plate joint · fatigue (toe)',z.toe.range,z.toe.capacity,'stress','f_{sr}=\\frac{\\Delta M}{S_x}-\\frac{\\Delta P}{A}+\\frac{6\\Delta B/h_0}{t_fb_f^2}\\le F_{SR}\\ge F_{TH}',`${basis}. Category C, the column flange at the toe of its ${b.plate.flangeJoint==='cjp'?'CJP groove weld (Table A-3.1 item 5.4)':'pair of fillets (Table A-3.1 item 5.6)'}, F_TH = ${s(z.toe.threshold)}; tension-flange stress range of the base moment less the axial range, with the warping stress of any base bimoment (a warping-restrained base).`,['aisc-fatigue']);
  if(z.root)add('weld-fatigue-root','Column flange fillets to the base plate · fatigue (root)',z.root.range,z.root.capacity,'stress','f_{sr}\\le R_{FIL}F_{SR},\\;R_{FIL}=\\frac{0.06+0.72\\,w/t_p}{t_p^{0.167}}\\le1',`${basis}. Category C″, Table A-3.1 item 5.6, crack from the root of the ${f(b.plate.weld,'length')} fillet pair through the throat, with R_FIL = ${z.root.R.toFixed(3)} (Eq. A-3-6, t_p the flange thickness); no threshold. The flange stress range as for the toe. A CJP flange joint removes this root detail.`,['aisc-fatigue']);
  add('plate-fatigue','Base plate at the flange fillet toe · fatigue',z.plate.range,z.plate.capacity,'stress','f_{sr}=\\frac{6\\,\\Delta T\\,x}{B\\,t^2}\\le F_{SR}\\ge F_{TH}',`${basis}. Category C (base metal at the toe of a transverse fillet), F_TH = ${s(z.plate.threshold)}: the anchor row's tension range on its lever x to the flange, the plate thickness check's tension side, over the plate width.`,['aisc-fatigue']);
 }
 add('anchor-interaction','Anchor rods · tension and shear',a.interaction,1,'ratio','\\frac{N_{ua}}{\\phi N_n}+\\frac{V_{ua}}{\\phi V_n}\\le1.2',`${at}, ${a.action.id}: ACI 318-19 §17.8; a ratio of 0.2 or less is checked alone. Reported as a fraction of 1.2.`,['aci-318'],a.action.id);
 add('soil','Footing · soil bearing',ft.qMax,b.soil.allowable,'pressure','q_{max}=\\frac{P}{BL}\\left(1+\\frac{6e}{L}\\right)\;\\text{or}\;\\frac{2P}{3B(L/2-e)}',`${at}, ${ft.soilAction.id} (service): column load plus footing and soil ${f(ft.weight)}; base moment plus base shear times the footing and grout depth.`,['aci-318'],ft.soilAction.id);
 add('overturning','Footing · overturning',ft.overturningRequired,ft.overturning,'ratio',`FS=\\frac{W_D\\,L/2-M_{D,e}}{M_{ot}}\\ge${ft.overturningRequired}`,`${at}, ${ft.stabilityAction.id}${ft.overturningRequired<1.5?' (seismic, reduced dead load, FS 1.0)':''}: dead load of the runway, column, footing and soil about the footing edge against the side thrust (or longitudinal force) moment at the footing base. Across the runway the edge on the bracket side governs, with the runway dead reaction's eccentric moment deducted from the restoring moment; the crane vertical load is not credited.`,['aci-318'],ft.stabilityAction.id);
 if(r.uplift)add('uplift','Footing · uplift from the bracing',r.uplift.required*r.uplift.uplift,r.uplift.resist,'force','FS\\cdot U\\le W_D',`${at}, ${r.uplift.action.id} (service): the rod whose lower end is at this base lifts it by ${f(r.uplift.uplift)}; dead load of the runway, column, footing and soil ${f(r.uplift.resist)} resists it with FS ${r.uplift.required}. The rods' shear along the runway is in the anchor, sliding and overturning checks.`,['aci-318'],r.uplift.action.id);
 add('sliding','Footing · sliding',ft.slidingRequired,ft.sliding,'ratio',`FS=\\frac{\\mu\\,W_D+P_p}{V}\\ge${ft.slidingRequired}`,`${at}, ${ft.slidingAction.id}${ft.slidingRequired<1.5?' (seismic, reduced dead load, FS 1.0)':''}: base friction μ = ${b.soil.friction} on the dead load${r.passive?` plus the lateral bearing (passive) resistance P_p = ${f(r.passive)} of the leading face${b.footing.key?` and a ${f(b.footing.key,'length')} deep shear key below the footing (${f(footingKeyWidth,'length')} wide, its full width)`:''}: lateral bearing ${f(b.soil.passive!,'unitWeight')} (pressure per unit depth) below the slab bottom (the slab and the soil above it not credited), IBC 2018 §1806.2 and §1806.3.1 (friction and lateral bearing combined), the owner safety factor on top of the allowable values; crane vertical load not credited.`:'; crane vertical load and passive pressure not credited.'}`,['aci-318',...(r.passive?['ibc-1806']:[])],ft.slidingAction.id);
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
