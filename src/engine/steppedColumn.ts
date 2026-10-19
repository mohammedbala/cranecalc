import {aiscShapeByName,loadAiscSection} from '../data/aiscSections';
import {activeStep,type StepInput} from './steppedColumnInputs';
import {columnPlates} from './craneColumn';
import type {CalculationSnapshot,CheckResult,ProjectInput,Properties,Section} from './types';
import {atRail,buildingSeismicChecks,columnReactionOffset,columnSupportChecks,craneLevelStrut,existingColumnRailElevation,existingColumnSection,existingColumnUnbracedLength,railForce,twistNote,
 type ColumnSupportResult,type ExistingColumnCombination,type ExistingColumnResult} from './existingColumn';
import {available,girderStrength} from './aiscStrength';
import {emptyAistInputs} from './aistLoads';
import {sectionProperties} from './section';
import {columnBuckling,columnResponse,steppedStiffness,type ColumnResponse} from './columnAnalysis';
import {asceCombinations} from './asceCombinations';
import {existingLoadKeys,type ExistingLoadKey} from './existingColumnInputs';
import {bumperAtGrids,locatingGrids,pinnedTorsion,runwaySiteSeismic,seatEnds,seatMoment,tr13SupportCombinations} from './columnSupport';
import {columnTorsion} from './newColumnBracing';
import {railTopAboveSteel} from './railSeat';
import {existingWeldingChecks} from './existingWelding';
import {capAngleGeometry} from './capAngle';
import {innerFlangeForce,stepSeatChecks} from './stepSeat';
import type {SupportReactionSet} from './supportReactions';
import {latexNumber} from './math';
import {format} from './units';

/**
 * Girder on the step of an existing stepped building column (configurator support 'stepped-column'; plan §1B, WP-2).
 *
 * Model (AISC Design Guide 7 stepped crane columns; AISC 360-16 Appendix 7 §7.2 and its Commentary for the effective
 * length from a buckling analysis; clause numbers not verified, references 'dg7-columns' and 'aisc-app7' partial): one
 * column in the strong-axis plane across the runway with the lower shaft (existingColumn's plates) from the base to the
 * step and the upper shaft (step.upper) from the step to the top, EI(x) stepped (columnResponse, columnBuckling). The
 * girder reaction R acts at the step at e = girderOffset + b/2 from the lower centroid (the far edge of the bearing plate
 * on a surveyed seat, as for any existing seat) as the moment R·e, the side thrust at the rail head. Per combination:
 *  - lower shaft: axial existing P + R; crane moments by the column model; existing lower effects added as magnitudes at
 *    the governing section, as for any existing column;
 *  - upper shaft: axial existing P only; the existing upper moments (entered at the step, signed) superposed with SIGN
 *    on the crane eccentric moment for the gravity loads D, L, Lr, S, R (taken constant over the upper shaft: they come
 *    from the roof and the step, with no transverse load between the step and the top), as magnitudes for W and E
 *    (reversible) and with the side thrust (reversible);
 *  - effective lengths of both shafts from the elastic buckling factor λ of the two-segment column under that
 *    combination's axial forces (P_u above the step, P_l below): L_c,i = π√(EI_i/(λP_i)), with the Commentary Table
 *    C-A-7.1 design ratio for a fixed base (0.80/0.70 braced, 2.1/2.0 free); B1 = 1/(1 − αP_i/P_e,i) = 1/(1 − α/λ);
 *  - H1 for each shaft; weak axis with the entered Lcy (upper: upperLcy) and B1; the TR-13 §3.10 supporting-structure
 *    forms, the crane-stop case, the runway seismic (site data) and the longitudinal force path as for an existing column.
 * Canonical units N, mm, MPa.
 */
/**
 * Step geometry for the drawings (WP-3) and the engine (WP-2). Across the runway x is from the lower-shaft centroid,
 * positive toward the crane span; elevations from the column base.
 */
export interface StepGeometry {
 lower:{shape:string;d:number;bf:number;tf:number;tw:number;x:number;base:number;top:number};
 upper:{shape:string;d:number;bf:number;tf:number;tw:number;x:number;base:number;top:number};
 /** Step cap on top of the lower shaft: its top is the girder seat (existingColumn.seatElevation). */
 cap:StepInput['cap']&{top:number;bottom:number};
 /** Girder web centerline and the girder reaction's eccentricity to the lower-shaft centroid (= girderOffset). */
 girderWeb:number;
 /** Upper-shaft inner flange face (toward the crane), where the top-flange tie lands, and its distance from the girder web. */
 tieFace:number;tieDistance:number;
 /** Upper-shaft inner flange centerline: its force P_u/2 ± M_u/(d_u − t_fu) bears on the lower web there (J10.2/J10.3). */
 innerFlange:number;
 stiffener?:NonNullable<StepInput['stiffener']>;
}
export function stepGeometry(p:ProjectInput):StepGeometry|undefined{
 const s=activeStep(p),c=p.existingColumn;if(!s||!c)return undefined;
 const lo=columnPlates(c),up=columnPlates(s.upper),xu=-s.offset,step=c.seatElevation;
 return {lower:{...lo,x:0,base:0,top:step-s.cap.thickness},upper:{...up,x:xu,base:step,top:c.height},cap:{...s.cap,top:step,bottom:step-s.cap.thickness},
  girderWeb:s.girderOffset,tieFace:xu+up.d/2,tieDistance:s.girderOffset-(xu+up.d/2),innerFlange:xu+up.d/2-up.tf/2,...(s.stiffener?{stiffener:s.stiffener}:{})};
}

export function validateSteppedColumn(p:ProjectInput):string[]{
 const c=p.existingColumn,s=c?.step;if(!c?.enabled||!s)return [];
 const errors:string[]=[],add=(test:boolean,m:string)=>{if(test)errors.push(`existingColumn.step.${m}`);},L=(v:number)=>format(v,'length',p.units,3);
 add(!!c.isNew,'upper: a stepped column is an existing building column; clear isNew.');
 add(!!p.craneColumn?.enabled,'upper: a crane column and a stepped column are alternative supports; remove one.');
 add(!!p.details?.bracket?.enabled,'upper: the girder bears on the step cap, not on a bracket: disable the bracket.');
 add(!!p.columnCap?.enabled,'upper: the girder bears on the step cap, not on a column cap: disable the column cap.');
 add(s.upper.Fu<s.upper.Fy,'upper.Fu: ultimate strength cannot be less than yield strength.');
 add(!!s.upper.shape&&!aiscShapeByName(s.upper.shape),'upper.shape: select an AISC W shape or clear it to use entered plates.');
 add(c.seatElevation>=c.height-1e-6,'upper: the step (existingColumn.seatElevation) must be below the column top: the upper shaft runs from the step to the top.');
 const g=stepGeometry(p);if(!g)return errors;
 add(g.lower.d<=g.upper.d,`upper.d: the lower shaft (${L(g.lower.d)}) must be deeper than the upper shaft (${L(g.upper.d)}).`);
 add(s.girderOffset<g.lower.d/2-g.lower.tf-1e-6||s.girderOffset>g.lower.d/2+1e-6,`girderOffset: the girder web must bear over the lower shaft's crane-side flange, ${L(g.lower.d/2-g.lower.tf)} to ${L(g.lower.d/2)} from the lower-shaft centroid.`);
 add(g.upper.x-g.upper.d/2<-g.lower.d/2-1e-6||g.upper.x+g.upper.d/2>g.lower.d/2+1e-6||g.upper.bf>g.lower.bf+1e-6,'offset: the upper shaft must stand within the lower shaft\'s footprint.');
 add(s.cap.thickness>=c.seatElevation,'cap.thickness: the step cap must sit on the lower shaft.');
 const flange=(p.section.kind==='cap'?p.section.capWidth:p.section.bf)/2;
 add(g.tieDistance-flange<=0,`offset: the girder top flange${p.section.kind==='cap'?' and cap':''} must clear the upper shaft's inner face (girder web to face ${L(g.tieDistance)}).`);
 return errors;
}

/**
 * Results of the stepped column (WP-2 fills them). `snapshot.existingColumn` holds the ExistingColumnResult-compatible
 * summary (governing, drift, support, bySupport) that the report, drawings and columnSupportChecks read; these are the
 * stepped-column specifics.
 */
export interface SteppedShaftResult {
 source:string;
 /** Effective lengths of the shaft: strong axis from the buckling analysis, weak axis as entered. */
 Lcx:number;Lcy:number;
 capacity:ExistingColumnResult['capacity'];
 governing:ExistingColumnResult['governing'];
 /** Axial compression: the combination with the largest P_r/P_c (each with its own L_cx), its strength and length. */
 axial?:{Pc:number;Lcx:number;case:string};
}
export interface SteppedColumnResult {
 geometry:StepGeometry;
 /** Elastic buckling of the two-segment column (columnBuckling) under the governing combination's axial forces. */
 buckling:{factor:number;convergence:number;case:string;axial:{upper:number;lower:number};Lcx:{upper:number;lower:number}};
 upper:SteppedShaftResult;lower:SteppedShaftResult;
 /** Step local actions (stepSeat.ts): the girder reaction on the cap, the upper inner-flange force on the lower web, the panel shear. */
 step:{reaction:number;flangeForce:number;panelShear:number;case:string;stiffenerRequired:boolean};
}

const inch=25.4;
/** The upper shaft's section: its catalog W shape (with the entered material), else its entered plates (no fillet credit). */
export function upperShaftSection(p:ProjectInput):{source:string;section:Section}{
 const s=activeStep(p)!,lower=existingColumnSection(p).section;
 const plates:Section={...lower,kind:'welded',name:'Upper shaft',catalogueId:undefined,capCatalogueId:undefined,propertySource:'Upper shaft plates',d:s.upper.d,bf:s.upper.bf,tf:s.upper.tf,tw:s.upper.tw,Fy:s.upper.Fy,Fu:s.upper.Fu};
 if(s.upper.shape&&aiscShapeByName(s.upper.shape)){const r=loadAiscSection({...plates,kind:'rolled'},s.upper.shape);return {source:`AISC ${s.upper.shape}`,section:{...r,Fy:s.upper.Fy,Fu:s.upper.Fu}};}
 return {source:'entered plates (no fillet credit)',section:plates};
}
/**
 * Commentary Table C-A-7.1: recommended design K over the theoretical value where a base is taken as fixed (0.80 for
 * 0.70 with a braced top, 2.1 for 2.0 with a free top): the buckling analysis assumes ideal fixity, so its effective
 * lengths are increased in that ratio. A pinned base takes the analysis as it is.
 */
export const fixedBaseRatio=(b:{base:'pinned'|'fixed';top:'braced'|'free'})=>b.base==='fixed'?(b.top==='braced'?.8/.7:2.1/2):1;
type ShaftKey='upper'|'lower';
type Capacity=ExistingColumnResult['capacity'];
/** One combination of the stepped column: both shafts' rows, the buckling under its axial forces and the step actions. */
export interface SteppedCombination {
 id:string;equation:string;upper:ExistingColumnCombination;lower:ExistingColumnCombination;
 /** Design buckling factor (with the fixed-base ratio) and convergence; effective lengths of the shafts (Infinity where not in compression). */
 lambda:number;convergence:number;Lcx:Record<ShaftKey,number>;capacity:Record<ShaftKey,Capacity>;
 /** Factored girder reaction on the step, the upper-shaft moment at the step (amplified, signed superposition) and the inner-flange force. */
 R:number;Mstep:number;Fin:number;
}
export interface SteppedColumnAnalysis {summary:ExistingColumnResult;result:SteppedColumnResult;combinations:{station:number;rows:SteppedCombination[]}[];
 /** The step's local checks (stepSeat.ts) for the governing actions. */
 stepChecks:CheckResult[];}

/** The member strengths of one shaft at strong-axis effective length Lcx (AISC E3/E4/E7, F2 with F3, F6, G2), as existingColumnAnalysis. */
function shaftCapacity(p:ProjectInput,section:Section,props:Properties,L:{x:number;y:number;z:number;b:number},Mn13?:number):Capacity{
 const c=p.existingColumn!,E=section.E;
 const member:ProjectInput={...p,section,unbracedLength:L.b,spans:[c.height],aist:{...(p.aist??emptyAistInputs),netFlangeArea:0,axialLength:Number.isFinite(L.x)?L.x:c.height,bottomBraceSpacing:L.y,torsionalLength:Math.max(L.z,L.b)}};
 const s=girderStrength(member,props),root=Math.sqrt(E/section.Fy),Mp=section.Fy*props.Zx,kc=Math.min(.76,Math.max(.35,4/Math.sqrt(s.webRatio)));
 const flb=s.flangeRatio<=s.flangeLimit?Mp:s.flangeRatio<=root?Mp-(Mp-.7*section.Fy*props.Sx)*(s.flangeRatio-s.flangeLimit)/(root-s.flangeLimit):.9*E*kc*props.Sx/s.flangeRatio**2;
 const Mcx0=Math.min(s.major,available(flb,p.method,.9,1.67)),Mcx=Mn13!==undefined?Math.min(Mcx0,available(Mn13,p.method,.9,1.67)):Mcx0;
 return {Pc:s.compression,Pt:available(section.Fy*props.A,p.method,.9,1.67),Mcx,Mcy:s.minor,Vc:s.shear,webCompact:s.webRatio<=s.webLimit,
  flexure:`${s.flexureBranch}${s.flangeRatio>s.flangeLimit?' with F3 flange local buckling':''}${Mcx<Mcx0?'; F13-1 tension flange rupture at the tie bolt holes':''}; Cb = 1.0`};
}
/** Samples of a column response on one shaft, bottom to top: an element belongs to the shaft its midpoint lies in. */
function onShaft(r:ColumnResponse,step:number,shaft:ShaftKey){
 const out:ColumnResponse['samples']=[];
 for(let i=0;i+1<r.samples.length;i+=2){const mid=(r.samples[i].x+r.samples[i+1].x)/2;if((mid>step)===(shaft==='upper'))out.push(r.samples[i],r.samples[i+1]);}
 return out;
}
const peak=(a:ColumnResponse['samples'],key:'moment'|'shear',f=1)=>Math.max(0,...a.map(s=>Math.abs(f*s[key])));
const h1=(P:number,cap:Capacity,Mx:number,My:number)=>{const ratio=P>=0?P/cap.Pc:-P/cap.Pt,flex=Mx/cap.Mcx+My/cap.Mcy;return Number.isFinite(flex)&&Number.isFinite(ratio)?(ratio>=.2?ratio+8/9*flex:ratio/2+flex):1e12;};

export function steppedColumnAnalysis(p:ProjectInput,reactions:SupportReactionSet):SteppedColumnAnalysis{
 const c=p.existingColumn!,s=activeStep(p)!,g=stepGeometry(p)!,lo=existingColumnSection(p),up=upperShaftSection(p);
 const props={lower:sectionProperties(lo.section),upper:sectionProperties(up.section)},E=lo.section.E,H=c.height,hs=c.seatElevation,ht=existingColumnRailElevation(p),rs=Math.min(ht,H);
 const e=s.girderOffset+columnReactionOffset(p),alpha=p.method==='LRFD'?1:1.6;
 const EIx={lower:E*props.lower.Ix,upper:E*props.upper.Ix},EIy={lower:E*props.lower.Iy,upper:E*props.upper.Iy};
 const EIxFn=steppedStiffness(hs,EIx.lower,EIx.upper),EIyFn=steppedStiffness(hs,EIy.lower,EIy.upper);
 // Unit responses sharing their nodes (base, step, rail, top): the eccentric reaction moment at the step and a unit force at the rail.
 const ecc=columnResponse(H,EIxFn,c.strong,[{x:hs,moment:1}],[rs]),side=columnResponse(H,EIxFn,c.strong,[railForce(H,ht)],[hs]);
 const sh=(r:ColumnResponse)=>({upper:onShaft(r,hs,'upper'),lower:onShaft(r,hs,'lower')}),E1=sh(ecc),S1=sh(side);
 // Sense of the crane eccentric moment in the upper shaft just above the step: positive existing upper Mx bends it so.
 const sense=Math.sign(E1.upper[0]?.moment??1)||1;
 const longitudinal=c.longitudinal==='column'?reactions.Cls:0,along=longitudinal?sh(columnResponse(H,EIyFn,c.weak,[railForce(H,ht)],[hs])):undefined;
 const alongPeak={upper:along?peak(along.upper,'moment'):0,lower:along?peak(along.lower,'moment'):0};
 // Existing-column review (B7–B10): the seat moment of the girder end reactions along the runway and the longitudinal
 // force at each locating step act at the step on the weak axis; the force, off the column centerline by the girder line, twists the lower shaft.
 const bracingPath=c.longitudinal==='bracing',exit=c.longitudinalExit??'eave-strut',ends=seatEnds(p);
 const alongM=columnResponse(H,EIyFn,c.weak,[{x:hs,moment:1}],[hs]),alongF=columnResponse(H,EIyFn,c.weak,[{x:hs,force:1}],[hs]),AM=sh(alongM),AF=sh(alongF);
 const locating=new Set(bracingPath?locatingGrids(p):[]),stops=bumperAtGrids(p),offset=s.girderOffset,Cls=reactions.Cls;
 // Torsion: the torque at the step carried down the lower shaft in Saint-Venant torsion alone (a lower-bound equilibrium
 // solution, no warping stress relied on; the upper shaft is not credited).
 const unit=columnTorsion(lo.section,1,hs,'warping-free');
 const strut=exit==='girder-strut'?(()=>{
  // The column's stiffness on the girder line, an upper bound for the strut it needs: weak-axis translation of the stepped
  // model in series with the lower shaft's twist over the full height (warping restrained where the top is free).
  const kY=1/alongF.displacement(hs),Ktheta=c.weak.top==='braced'?1/(pinnedTorsion(lo.section,1,hs,H).twist||Infinity):columnTorsion(lo.section,1,hs,'warping-restrained').Ktheta;
  const kc=1/(1/kY+offset**2/Ktheta);return {kY,Ktheta,kc,ratio:10,required:10*kc,share:1/11};
 })():undefined,keep=exit==='girder-strut'?strut!.share:1;
 const frame=c.frame,sway=frame?.type==='sway'&&frame.B2!==undefined?frame.B2:undefined;
 const site=runwaySiteSeismic(p),tr13=p.aist?tr13SupportCombinations(p.method):[],concurrent=p.aist?.concurrency==='full';
 const gravity=['D','L','Lr','S','R'] as const,lateralKeys=['W','E'] as const;
 // Capacities: one per shaft and effective length; F13 at the tie bolt holes of the upper flange (cap tieback angle).
 const f13=(()=>{let q;try{q=capAngleGeometry(p);}catch{return undefined;}const col=q?.column.receiver;if(!q||!col)return undefined;
  const Yt=col.Fy/col.Fu<=.8?1:1.1,Afg=col.width*col.tf,Afn=(col.width-(q.column.hole+inch/16))*col.tf;
  return {holds:Yt*col.Fy*Afg<=col.Fu*Afn*(1+1e-9),Afn,Afg,Yt,demand:Yt*col.Fy*Afg,capacity:col.Fu*Afn,Mn:col.Fu*Afn/Afg*props.upper.Sx};})();
 const Lb=existingColumnUnbracedLength(p),Lcy={lower:c.Lcy,upper:s.upperLcy??c.Lcy},memo=new Map<string,Capacity>();
 const capacity=(k:ShaftKey,Lx:number)=>{const key=`${k}${Math.round(Number.isFinite(Lx)?Lx:-1)}`;let v=memo.get(key);
  if(!v){v=shaftCapacity(p,k==='upper'?up.section:lo.section,props[k],{x:Lx,y:Lcy[k],z:c.Lcz,b:Lb},k==='upper'&&f13&&!f13.holds?f13.Mn:undefined);memo.set(key,v);}return v;};
 // Buckling factor of the two-segment column under (P_u, P_l), with the fixed-base design ratio; cached on the axial ratio.
 const ratio=fixedBaseRatio(c.strong),bcache=new Map<string,{factor:number;convergence:number}>();
 const buckling=(Pu:number,Pl:number)=>{
  const scale=Math.max(Math.abs(Pu),Math.abs(Pl));if(!(scale>0)||(Pu<=0&&Pl<=0))return {lambda:Infinity,convergence:0};
  const u=Pu/scale,l=Pl/scale,key=`${u.toPrecision(10)}|${l.toPrecision(10)}`;let b=bcache.get(key);
  if(!b){const r=columnBuckling(H,EIxFn,{...c.strong},x=>x<hs?l:u,[hs],{elements:16});b={factor:r.factor,convergence:r.convergence};bcache.set(key,b);}
  return {lambda:b.factor/scale/ratio**2,convergence:b.convergence};
 };
 const Lc=(EI:number,P:number,lambda:number)=>P>0&&Number.isFinite(lambda)?Math.PI*Math.sqrt(EI/(lambda*P)):Infinity;
 const Pey={lower:Math.PI**2*EIy.lower/Lcy.lower**2,upper:Math.PI**2*EIy.upper/Lcy.upper**2};
 interface Case {id:string;equation:string;f:Record<ExistingLoadKey,number>;runway:number;lat:number;F:number;seat:number;longit:number}
 const evaluate=(support:SupportReactionSet['supports'][number],j:number)=>{
  const dead=support.D,live=support.Cd+support.Cv+support.Ci+support.L+support.Clv,liveStatic=support.Cd+support.Cv,lateral=support.Css;
  const seat=ends[j]??[],seatCase=(fD:number,fL:number,fCd:number,fCv:number)=>seat.length?seatMoment(seat,{D:fD,L:fL,Cd:fCd,Cv:fCv}):0;
  const sum=(src:typeof c.existing,f:Case['f'],key:'P'|'Mx'|'My'|'V',keys:readonly ExistingLoadKey[],abs:boolean)=>keys.reduce((n,t)=>n+(abs?Math.abs(f[t]*src[t][key]):f[t]*src[t][key]),0);
  const row=(k:Case):SteppedCombination=>{
   const eu=s.existingUpper,el=c.existing,f=k.f;
   const Pu=sum(eu,f,'P',existingLoadKeys,false),Pl=sum(el,f,'P',existingLoadKeys,false)+k.runway;
   const b=buckling(Pu,Pl),B1=Number.isFinite(b.lambda)?(alpha>=b.lambda?Infinity:1/(1-alpha/b.lambda)):1;
   const B1x={upper:Pu>0?B1:1,lower:Pl>0?B1:1},B2x={upper:sway??B1x.upper,lower:sway??B1x.lower};
   const Lx={upper:Lc(EIx.upper,Pu,b.lambda),lower:Lc(EIx.lower,Pl,b.lambda)};
   // Upper shaft: the existing gravity moments with their sign, constant over the shaft; W and E as magnitudes.
   const MgU=sense*sum(eu,f,'Mx',gravity,false),MlU=sum(eu,f,'Mx',lateralKeys,true);
   const upperM=(a:ColumnResponse['samples'][number],bs:ColumnResponse['samples'][number])=>B1x.upper*Math.abs(k.runway*e*a.moment+MgU)+B2x.upper*(Math.abs(k.lat*bs.moment)+MlU);
   const Mu=Math.max(0,...E1.upper.map((a,i)=>upperM(a,S1.upper[i]))),Mstep=upperM(E1.upper[0],S1.upper[0]);
   const MgL=sum(el,f,'Mx',gravity,true),MlL=sum(el,f,'Mx',lateralKeys,true);
   const Ml=Math.max(0,...E1.lower.map((a,i)=>B1x.lower*Math.abs(k.runway*e*a.moment)+B2x.lower*Math.abs(k.lat*S1.lower[i].moment)))+B1x.lower*MgL+B2x.lower*MlL;
   const V=(sk:ShaftKey,src:typeof c.existing)=>Math.max(0,...E1[sk].map((a,i)=>Math.abs(k.runway*e*a.shear)+Math.abs(k.lat*S1[sk][i].shear)))+sum(src,f,'V',existingLoadKeys,true);
   // Weak axis: the longitudinal force at the rail (column path), the seat moment and the longitudinal force at the step.
   const Fw=exit==='eave-strut'?k.F:exit==='girder-strut'?keep*k.F:0;
   const weak=(sk:ShaftKey,src:typeof c.existing)=>Math.abs(k.longit)*alongPeak[sk]+sum(src,f,'My',existingLoadKeys,true)+Math.max(0,...AM[sk].map((a,i)=>Math.abs(k.seat*a.moment)+Math.abs(Fw*AF[sk][i].moment)));
   const B1y=(sk:ShaftKey,P:number)=>P<=0?1:alpha*P>=Pey[sk]?Infinity:1/(1-alpha*P/Pey[sk]);
   const cap={upper:capacity('upper',Lx.upper),lower:capacity('lower',Lx.lower)};
   const shaft=(sk:ShaftKey,P:number,Mx:number,src:typeof c.existing):ExistingColumnCombination=>{
    const by=B1y(sk,P),My=by*weak(sk,src),U=h1(P,cap[sk],Mx,My);
    return {id:k.id,equation:k.equation,P,Mx,My,V:V(sk,src),B1x:B1x[sk],B1y:by,U};
   };
   const upper=shaft('upper',Pu,Mu,eu),lower=shaft('lower',Pl,Ml,el);
   // Torque at a locating step: the share of the longitudinal force the column keeps, at the girder offset (lower shaft).
   const T=k.F?keep*k.F*offset:0;
   if(T){lower.torque=T;lower.warping=0;lower.Ut=lower.U;}
   return {id:k.id,equation:k.equation,upper,lower,lambda:b.lambda,convergence:b.convergence,Lcx:Lx,capacity:cap,R:k.runway,Mstep,Fin:innerFlangeForce(g,Pu,Mstep)};
  };
  const asce=(k:{id:string;equation:string;factors:Record<ExistingLoadKey,number>},cd?:number,split?:'Css'|'Ci'):Case=>{
   const f=k.factors,lv=split==='Css'?live-support.Ci:live,lat=split==='Ci'?0:lateral;
   const runway=f.D*dead+(cd===undefined?f.L*lv:cd*support.Cd+f.L*(lv-support.Cd));
   const Eside=site&&f.E?Math.abs(f.E)*site.across*(dead+support.Cd+(site.input.liftedLoadSecured?support.Cv:0)):0;
   return {id:`${p.method} ${k.id}${split?` (${split==='Css'?'side thrust, no impact':'impact, no side thrust'})`:''}`,equation:k.equation,f,runway,lat:f.L*lat+Eside,
    F:locating.has(j)?Math.abs(f.L)*Cls:0,seat:seatCase(f.D,f.L,cd??f.L,f.L),longit:f.L*longitudinal};
  };
  const rule=(k:{factors:{L:number}})=>!k.factors.L?[undefined]:concurrent?[undefined,'Css' as const,'Ci' as const]:['Css' as const,'Ci' as const];
  const rows=[...asceCombinations(p.method).flatMap(k=>rule(k).map(v=>row(asce(k,undefined,v)))),...tr13.flatMap(k=>rule(k).map(v=>row(asce(k,k.cd,v))))];
  // TR-13 crane stop at a locating step that carries a stop: 1.2(D + Cds) + Cvs + 1.0Cbs (ASD D + Cds + Cvs + 0.67Cbs).
  if(bracingPath&&stops.grids.has(j)){
   const [fD,fB]=p.method==='LRFD'?[1.2,1]:[1,.67],f={D:fD,L:0,Lr:0,S:0,R:0,W:0,E:0};
   rows.push(row({id:`${p.method} AIST bumper`,equation:p.method==='LRFD'?'1.2D + 1.2Cds + Cvs + 1.0Cbs':'D + Cds + Cvs + 0.67Cbs',f,runway:fD*dead+fD*support.Cd+support.Cv,lat:0,F:fB*stops.Cbs,seat:seatCase(fD,0,fD,1),longit:0}));
  }
  const drift=Math.abs(lateral*atRail(side,H,ht))+Math.abs(liveStatic*e*atRail(ecc,H,ht));
  const gaugeCrane=-2*(dead+liveStatic)*e*atRail(ecc,H,ht);
  const girderTop=ht-railTopAboveSteel(p),driftLimit=p.aist?Math.min(girderTop/400,2*inch,ht/c.driftLimit*(c.driftLimit>400?1:Infinity)):ht/c.driftLimit;
  const seatGov=seat.length?seatCase(p.method==='LRFD'?1.2:1,p.method==='LRFD'?1.6:1,p.method==='LRFD'?1.6:1,p.method==='LRFD'?1.6:1):0;
  // Range of the inner-flange force per crane passage: the static crane at the step and its side thrust, unfactored.
  const range=(liveStatic*e*Math.abs(E1.upper[0].moment)+lateral*Math.abs(S1.upper[0].moment))/(g.upper.d-g.upper.tf);
  return {station:support.x,crane:{dead,live,liveStatic,lateral,longitudinal},rows,drift:{value:drift,limit:driftLimit},gaugeCrane,seatGov,girderTop,range};
 };
 const all=reactions.supports.map(evaluate);
 const Uof=(r:SteppedCombination)=>Math.max(r.upper.U,r.lower.U),worstRow=(rows:SteppedCombination[])=>rows.reduce((a,b)=>Uof(b)>Uof(a)?b:a);
 const worst=all.reduce((a,b)=>Uof(worstRow(b.rows))>Uof(worstRow(a.rows))||(Uof(worstRow(b.rows))===Uof(worstRow(a.rows))&&b.drift.value>a.drift.value)?b:a);
 const rowsAll=all.flatMap(v=>v.rows.map(r=>({station:v.station,r})));
 const governing=(sk:ShaftKey,rows:SteppedCombination[])=>{const max=(key:'P'|'Mx'|'My'|'V'|'U')=>rows.reduce((a,b)=>Math.abs(b[sk][key])>Math.abs(a[sk][key])?b:a)[sk];return {P:max('P'),Mx:max('Mx'),My:max('My'),V:max('V'),U:max('U')};};
 const shaftResult=(sk:ShaftKey):SteppedShaftResult=>{
  const g0=rowsAll.reduce((a,b)=>b.r[sk].U>a.r[sk].U?b:a).r,ax=(r:SteppedCombination)=>Math.max(0,r[sk].P)/r.capacity[sk].Pc,ga=rowsAll.reduce((a,b)=>ax(b.r)>ax(a.r)?b:a).r;
  return {source:sk==='upper'?up.source:lo.source,Lcx:g0.Lcx[sk],Lcy:Lcy[sk],capacity:g0.capacity[sk],governing:{...governing(sk,all.flatMap(v=>v.rows)),P:ga[sk]},axial:{Pc:ga.capacity[sk].Pc,Lcx:ga.Lcx[sk],case:ga.id}};
 };
 const gov=rowsAll.reduce((a,b)=>Uof(b.r)>Uof(a.r)?b:a).r,stepRow=rowsAll.reduce((a,b)=>b.r.Fin>a.r.Fin?b:a),Rrow=rowsAll.reduce((a,b)=>b.r.R>a.r.R?b:a);
 const tagged=(v:{station:number;r:SteppedCombination})=>`${v.r.id}, support x=${format(v.station,'length',p.units,3)}`;
 const seat=stepSeatChecks(p,g,{reaction:{value:Rrow.r.R,caseId:tagged(Rrow)},flange:{value:stepRow.r.Fin,caseId:tagged(stepRow),P:stepRow.r.upper.P,M:stepRow.r.Mstep,Pl:stepRow.r.lower.P},range:Math.max(...all.map(v=>v.range))});
 // Torsion: the governing row with the torque (H1 of the lower shaft, or the Saint-Venant flange shear), as existingColumnAnalysis.
 let torsion:ExistingColumnResult['torsion'];
 const trows=rowsAll.filter(v=>v.r.lower.torque);
 if(trows.length){
  const cap=available(.6*lo.section.Fy,p.method,.9,1.67),score=(k:ExistingColumnCombination)=>Math.max(k.Ut!,unit.shear*(k.torque??0)/cap);
  const t=trows.reduce((a,b)=>score(b.r.lower)>score(a.r.lower)?b:a),T=Math.max(...trows.map(v=>v.r.lower.torque!)),Ts=keep*Cls*offset;
  torsion={U:t.r.lower.Ut!,shear:unit.shear*T,shearCapacity:cap,T:t.r.lower.torque!,stress:0,a:unit.a,offset,station:t.station,case:t.r.lower,model:'warping-free',twist:unit.twist*T,slip:unit.twist*T*offset,
   service:{T:Ts,twist:unit.twist*Ts,slip:unit.twist*Ts*offset,lateral:offset*(1-Math.cos(unit.twist*Ts))},lateral:offset*(1-Math.cos(unit.twist*T))};
 }
 const sv=c.service,spread=sv?.spreadD!==undefined&&sv.spreadS!==undefined&&sv.roofSnow!==undefined?(()=>{const factor=sv.roofSnow!<=30*4.788025898e-5?.5:.75;return {value:2*(sv.spreadD!+factor*sv.spreadS!),factor};})():undefined;
 const gc=all.reduce((a,v)=>Math.abs(v.gaugeCrane)>Math.abs(a)?v.gaugeCrane:a,0);
 const support:ColumnSupportResult={exit,exitEntered:c.longitudinalExit!==undefined,offset,girderTop:worst.girderTop,...(strut?{strut}:{}),
  seat:all.map((v,i)=>({grid:i+1,moment:v.seatGov,case:p.method==='LRFD'?'1.2D + 1.6(Cd + Cv + Ci)':'D + Cd + Cv + Ci'})),traction:bracingPath?Cls:0,bumper:bracingPath?stops.Cbs:0,bumperGrids:bracingPath?[...stops.grids].map(j=>j+1):[],
  frame:{type:frame?.type??'braced',entered:!!frame,...(frame?.B2!==undefined?{B2:frame.B2}:{})},...(f13?{f13}:{}),driftLimit:worst.drift.limit,...(sv?.wind10!==undefined?{wind10:sv.wind10}:{}),
  gauge:{crane:gc,...(spread?{frame:spread.value,snowFactor:spread.factor}:{}),total:gc+(spread?.value??0)},combinations:{asce:asceCombinations(p.method).length,tr13:tr13.length,bumper:Math.max(0,...all.map(v=>v.rows.filter(r=>r.id.endsWith('AIST bumper')).length))}};
 const lowerRows=worst.rows.map(r=>r.lower),wl=worstRow(worst.rows);
 const summary:ExistingColumnResult={source:`lower shaft ${lo.source}, upper shaft ${up.source}`,station:worst.station,eccentricity:e,railElevation:ht,crane:worst.crane,capacity:wl.capacity.lower,
  combinations:lowerRows,governing:{...governing('lower',worst.rows),U:Uof(wl)===wl.upper.U?wl.upper:wl.lower},
  bySupport:all.map(v=>{const w=worstRow(v.rows),t=v.rows.filter(r=>r.lower.Ut!==undefined);return {x:v.station,U:Uof(w),My:Math.max(w.upper.My,w.lower.My),...(t.length?{Ut:Math.max(...t.map(r=>r.lower.Ut!))}:{})};}),
  drift:worst.drift,torsion,support};
 const result:SteppedColumnResult={geometry:g,buckling:{factor:gov.lambda,convergence:gov.convergence,case:gov.id,axial:{upper:gov.upper.P,lower:gov.lower.P},Lcx:gov.Lcx},
  upper:shaftResult('upper'),lower:shaftResult('lower'),step:{reaction:Rrow.r.R,flangeForce:stepRow.r.Fin,panelShear:seat.panelShear,case:stepRow.r.id,stiffenerRequired:seat.stiffenerRequired}};
 return {summary,result,combinations:all.map(v=>({station:v.station,rows:v.rows})),stepChecks:seat.checks};
}

/** The stepped column's checks: the survey, the buckling basis, H1 and its parts for each shaft, the review items and the step. */
export function steppedColumnChecks(p:ProjectInput,a:SteppedColumnAnalysis):CheckResult[]{
 const c=p.existingColumn!,s=activeStep(p)!,r=a.result,z=a.summary,u=p.units,label='Stepped column',checks:CheckResult[]=[];
 const L=(v:number)=>format(v,'length',u,3),F=(v:number)=>format(v,'force',u,3),M=(v:number)=>format(v,'moment',u,3);
 const refs=['asce','aisc-e','aisc-f2','aisc-h','existing-column','dg7-columns','aisc-app7'],review=['tr13-supporting','tr13-column-path'];
 const add=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,caseId?:string,more:string[]=[])=>checks.push({id,group:label,title,demand,capacity,quantity,utilization:demand/capacity,
  status:Number.isFinite(demand)&&demand<=capacity*(1+1e-9)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(demand/capacity).toFixed(4)}`,note,caseId,referenceIds:[...refs,...more]});
 const surveyed=c.confirmed&&!!c.source.trim()&&s.confirmed&&!!s.source.trim();
 checks.push({id:'column-basis',group:label,title:`${label} · survey and existing load effects`,status:surveyed?'pass':'unverified',equation:'',referenceIds:refs,
  note:surveyed?`Lower shaft ${r.lower.source} (${L(r.geometry.lower.d)} deep, base to the step ${L(c.seatElevation)}), upper shaft ${r.upper.source} (${L(r.geometry.upper.d)}, the step to the top ${L(c.height)}), its centroid ${L(s.offset)} outboard of the lower one; girder web ${L(s.girderOffset)} from the lower centroid; step cap PL ${L(s.cap.thickness)} × ${L(s.cap.width)} × ${L(s.cap.length)}. Lower-shaft existing effects: ${c.source}; added to the crane peaks as magnitudes at the governing section. Upper-shaft existing effects at the step: ${s.source}; superposed with their sign on the crane moment for D, L, Lr, S and R (positive bends the upper shaft as the crane reaction moment does just above the step; a relieving roof moment is negative), as magnitudes for W and E.`
   :'Enter the surveyed lower and upper shafts, the step cap and the existing load effects of both shafts (the upper shaft\'s at the step, signed) with their source, then confirm both (existingColumn and existingColumn.step).'});
 const b=r.buckling,ratio=fixedBaseRatio(c.strong),K=(sk:'upper'|'lower')=>{const Lseg=sk==='upper'?c.height-c.seatElevation:c.seatElevation;return Number.isFinite(b.Lcx[sk])?(b.Lcx[sk]/Lseg).toFixed(2):'∞ (no compression)';};
 checks.push({id:'column-buckling-basis',group:label,title:`${label} · effective lengths from the buckling analysis (Appendix 7)`,status:b.convergence<=.01?'pass':'fail',demand:b.convergence,capacity:.01,quantity:'ratio',utilization:b.convergence/.01,
  equation:'\\det(K-\\lambda K_g)=0;\\quad L_{c,i}=\\pi\\sqrt{\\frac{EI_i}{\\lambda P_i}}',referenceIds:['aisc-app7','dg7-columns'],
  note:`Elastic flexural buckling of the two-segment column across the runway (${c.strong.base} base, ${c.strong.top} top; the lower shaft's EI below the step, the upper shaft's above), under each combination's axial forces, P_u in the upper shaft and P_u + R in the lower: K from a buckling analysis (AISC 360-16 Appendix 7 §7.2 Commentary). Governing combination ${b.case}: P_u = ${F(b.axial.upper)}, P_l = ${F(b.axial.lower)}, λ_cr = ${b.factor.toFixed(3)}${ratio>1?` after the Commentary Table C-A-7.1 design ratio ${ratio.toFixed(3)} on the length for a fixed base (ideal fixity in the analysis)`:''}: L_c = ${Number.isFinite(b.Lcx.upper)?L(b.Lcx.upper):'∞'} upper (K = ${K('upper')} on its own length), ${Number.isFinite(b.Lcx.lower)?L(b.Lcx.lower):'∞'} lower (K = ${K('lower')}). B1 = 1/(1 − αP_i/P_e,i) = 1/(1 − α/λ_cr) with P_e,i = λ_cr P_i, Cm = 1. Mesh refinement change ${(b.convergence*100).toFixed(4)}% (limit 1%). Weak axis: L_cy = ${L(r.lower.Lcy)} lower, ${L(r.upper.Lcy)} upper, as entered. The column's Lcx input is not used.`});
 for(const sk of ['upper','lower'] as const){
  const x=r[sk],g=x.governing,name=sk==='upper'?'Upper shaft':'Lower shaft',id=(v:string)=>`column-${sk}-${v}`;
  if(!x.capacity.webCompact)checks.push({id:'column-web',group:label,title:`${name} · web slenderness for flexure`,status:'unsupported',equation:'h/t_w\\le\\lambda_{pw}=3.76\\sqrt{E/F_y}',note:'A noncompact or slender shaft web needs AISC F4/F5, which this check does not implement.',referenceIds:refs});
  const ax=x.axial??{Pc:x.capacity.Pc,Lcx:x.Lcx};
  add(id('axial'),`${name} · axial compression`,Math.max(0,g.P.P),ax.Pc,'force','P_n=F_{cr}A_e\\ \\text{(E3, E4, E7)}',`${x.source}. The combination with the largest P_r/P_c, each combination with its own L_cx from the buckling analysis: L_cx = ${Number.isFinite(ax.Lcx)?L(ax.Lcx):'∞'}; weak-axis and torsional buckling over max(L_cy, L_b) = ${L(Math.max(x.Lcy,c.Lb))} and max(L_cz, L_b) = ${L(Math.max(c.Lcz,c.Lb))}.${sk==='upper'?' The upper shaft carries its existing axial force only.':' Existing axial force plus the girder reaction.'}`,g.P.id,review);
  add(id('flexure'),`${name} · strong-axis flexure`,Math.abs(g.Mx.Mx),x.capacity.Mcx,'moment','M_{rx}=B_1M_{nt}+B_2M_{lt}',`${x.capacity.flexure}, L_b = ${L(c.Lb)}. B1 = ${g.Mx.B1x.toFixed(3)}${c.frame?.type==='sway'&&c.frame.B2!==undefined?`, B2 = ${c.frame.B2.toFixed(3)} on the lateral part`:''}. Eccentricity of the girder reaction ${L(z.eccentricity)} from the lower centroid (girder web ${L(s.girderOffset)} plus the far half of the bearing plate on the surveyed step); ${sk==='upper'?'existing gravity moments with their sign, constant over the shaft':'existing moments added as magnitudes'}.`,g.Mx.id);
  if(g.My.My>0)add(id('flexure-y'),`${name} · weak-axis flexure`,Math.abs(g.My.My),x.capacity.Mcy,'moment','M_{ry}=B_1\\sum|M_y|',`AISC F6. Existing weak-axis moments, the seat moment of the girder end reactions along the runway at the step and the longitudinal force at a locating step (${z.support!.exit}); ${c.weak.base} base, ${c.weak.top} top.`,g.My.id,review);
  add(id('shear'),`${name} · strong-axis shear`,Math.abs(g.V.V),x.capacity.Vc,'force','V_n=0.6F_yA_wC_{v1}\\ \\text{(G2)}','Crane side thrust and eccentric reaction plus the existing shears (magnitudes).',g.V.id);
  const braced=!c.frame?', braced frame assumed':'';
  add(id('interaction'),`${name} · combined axial and flexure (H1)${braced}`,g.U.U,1,'ratio','\\frac{P_r}{P_c}+\\frac89\\left(\\frac{M_{rx}}{M_{cx}}+\\frac{M_{ry}}{M_{cy}}\\right)\\le1\\ \\text{(H1-1a)};\\ \\frac{P_r}{2P_c}+\\frac{M_{rx}}{M_{cx}}+\\frac{M_{ry}}{M_{cy}}\\le1\\ \\text{(H1-1b)}',
   `Governing ${g.U.id} (${g.U.equation}): P_r = ${F(g.U.P)}, M_rx = ${M(g.U.Mx)}, M_ry = ${M(g.U.My)}. ${a.combinations[0]?.rows.length??0} combinations per support (ASCE 7 with crane loads as L, W and E both ways; AIST TR-13 §3.10 supporting-structure forms${z.support!.combinations.bumper?'; the TR-13 crane stop':''}), each with its own buckling analysis. Column-alone model (frame action and base flexibility excluded).${braced?' Conditional on a braced (non-sway) frame across the runway: the frame type is not given.':''}`,g.U.id,review);
 }
 if(z.torsion){const t=z.torsion;
  add('column-lower-torsion','Lower shaft · torsion from the longitudinal force offset (TR-13 §5.9.2)',Math.max(t.U,t.shear/t.shearCapacity),1,'ratio','\\frac{P_r}{P_c}+\\frac89\\left(\\frac{M_{rx}}{M_{cx}}+\\frac{M_{ry}}{M_{cy}}\\right)\\le1;\\quad\\tau_t=\\frac{Tt_f}{J}\\le\\phi0.6F_y',
   `Each girder's longitudinal force reaches its locating step on the girder line, ${L(t.offset)} from the lower centroid: torque ${M(t.T)} (${t.case.id}, support x=${L(t.station)})${z.support?.exit==='girder-strut'?`, the column keeping 1/${Math.round(1/z.support.strut!.share)} of the force (girder-line strut at least ${z.support.strut!.ratio} k_c = ${format(z.support.strut!.required,'stiffness',u,3)})`:''}. Carried down the lower shaft in Saint-Venant torsion alone (a lower-bound equilibrium solution; no warping stress relied on, the upper shaft not credited): flange shear ${format(t.shear,'stress',u,3)} against ${format(t.shearCapacity,'stress',u,3)}; H1 of the lower shaft with that row ${t.U.toFixed(3)}. ${twistNote(t,u)}`,t.case.id,review);}
 add('column-drift','Stepped column · runway-level lateral displacement',z.drift.value,z.drift.limit,'length','\\Delta\\le\\min(H/400,\;2\\,\\mathrm{in})',`Service side thrust and static eccentric reaction of the crane, stepped column alone (${c.strong.base} base, ${c.strong.top} top), at the rail head ${L(z.railElevation)}; AIST TR-13 §5.3 limit ${L(z.drift.limit)} (H = ${L(z.support!.girderTop)} to the top of the girder). Frame and roof diaphragm flexibility excluded.`,undefined,['tr13-service']);
 checks.push(...columnSupportChecks(p,z,label,refs));
 const strut=craneLevelStrut(p,z);
 if(strut)checks.push({id:'crane-level-strut',group:label,title:`Crane-level strut by others ${strut.location==='girder-line'?'on the girder line':'at the column centerline'}, F = ${F(strut.force)} (${p.method})`,status:'excluded',equation:strut.stiffness!==undefined?`k_s\\ge${strut.ratio}\\,k_c`:'',referenceIds:['tr13-column-path',...refs],
  note:`Not checked here: the stepped-column check relies on a crane-level strut ${strut.location==='girder-line'?`on the girder line (${L(strut.offset)} from the lower centroid)`:'at the column centerline'} at the locating grids ${strut.grids.join(', ')}, factored traction ${F(strut.traction)}${strut.stop?`, crane stop ${F(strut.stop)}`:''}${strut.stiffness!==undefined?`, axial stiffness at least ${format(strut.stiffness,'stiffness',u,3)}`:''}. Strut, its connections and the braced bay by the building engineer of record.`});
 checks.push(...buildingSeismicChecks(p));
 checks.push(...a.stepChecks);
 checks.push(...existingWeldingChecks(p,Math.max(r.geometry.upper.tf,r.geometry.stiffener?r.geometry.lower.tw:0)));
 if(c.longitudinal==='bracing'&&!p.longitudinalBracing?.enabled)checks.push({id:'column-longitudinal',group:label,title:'Crane longitudinal force · bracing path',status:'excluded',equation:'',note:'The runway longitudinal force is assigned to building bracing, not to this column. Design the crane-level strut, bracing bay and its foundation for the reported longitudinal force.',referenceIds:refs});
 return checks;
}

/**
 * Pipeline hook (calculate.ts, in place of the prismatic existing-column analysis when a step is entered): the stepped
 * column's analysis and checks; built-up or laced shafts are one unsupported open item.
 */
export function steppedColumnCalculation(snapshot:CalculationSnapshot):void{
 const p=snapshot.input,s=activeStep(p);if(!s)return;
 snapshot.checks=snapshot.checks.filter(c=>c.id!=='step-basis');
 if(s.construction&&s.construction!=='rolled'){
  snapshot.checks.push({id:'step-basis',group:'Stepped column',title:'Stepped column · girder on the step',status:'unsupported',equation:'',referenceIds:['dg7-columns','aisc-app7'],
   note:`A ${s.construction} stepped column (battened or laced shafts, or plate-built sections) is not modeled here: its chords, lacing, shear deformation and the step's built-up detail need their own analysis (AISC 360-16 E6, Appendix 7; DG7). Only rolled W shafts are checked.`});
  return;
 }
 if(!snapshot.supportReactions)return;
 const a=steppedColumnAnalysis(p,snapshot.supportReactions);
 snapshot.existingColumn=a.summary;snapshot.steppedColumn=a.result;
 snapshot.checks.push(...steppedColumnChecks(p,a));
}
