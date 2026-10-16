import {available,girderStrength} from './aiscStrength';
import {aiscShapeByName,loadAiscSection} from '../data/aiscSections';
import {emptyAistInputs} from './aistLoads';
import {sectionProperties} from './section';
import {columnResponse,combinedPeak,type ColumnNodalLoad,type ColumnResponse} from './columnAnalysis';
import {asceCombinations} from './asceCombinations';
import {existingLoadKeys,type ExistingColumnInput} from './existingColumnInputs';
import type {SupportReactionSet} from './supportReactions';
import type {CheckResult,ProjectInput,Properties,Section} from './types';
import {format} from './units';
import {latexNumber} from './math';
import {cantileverHeightLimit,cantileverSystems,sdcFromSD1,sdcFromSDS,seismicBasis,seismicCombinations,seismicImportance,type SeismicBasis} from './runwaySeismic';
import {alongSeismic,braceCases,braceShare,columnTorsion,designsBracing,girderOffset,torsionBase} from './newColumnBracing';
import {railTopAboveSteel} from './railSeat';
import {activeColumnCap} from './columnCapInputs';
import {capAlongEccentricity} from './columnCap';
import {existingWeldingChecks} from './existingWelding';
import {bumperAtGrids,locatingGrids,pinnedTorsion,runwayMass,runwaySiteSeismic,seatEnds,seatMoment,tr13SupportCombinations} from './columnSupport';
import {capAngleGeometry} from './capAngle';

/** Recommended design K for the ideal end conditions (AISC 360-16 Commentary Table C-A-7.1). */
const inch=25.4;
const minimumK={braced:{pinned:1,fixed:.8},free:{pinned:Infinity,fixed:2.1}} as const;

/** The bracket's surveyed receiving column governs when a bracket is enabled, then a catalog shape, then entered plates. */
export function existingColumnSection(p:ProjectInput){
 const c=p.existingColumn!,receiver=p.details?.bracket?.enabled?p.details.bracket.receiver:undefined;
 const base:Section={...p.section,kind:'welded',name:'Existing column',catalogueId:undefined,capCatalogueId:undefined,propertySource:'Existing column plates',d:c.d,bf:c.bf,tf:c.tf,tw:c.tw,Fy:c.Fy,Fu:c.Fu};
 // A new column's bracket is welded to the catalog shape it is designed as.
 if(receiver&&!(c.isNew&&aiscShapeByName(c.shape??'')))return {source:'the surveyed receiving-column plates (d, bf, tf, tw), without rolled-fillet credit',section:{...base,d:receiver.depth,bf:receiver.width,tf:receiver.flangeThickness,tw:receiver.webThickness,Fy:receiver.Fy,Fu:receiver.Fu,propertySource:receiver.source||'Bracket receiving column'}};
 if(c.shape&&aiscShapeByName(c.shape)){const s=loadAiscSection({...base,kind:'rolled'},c.shape);return {source:`AISC ${c.shape}`,section:{...s,Fy:c.Fy,Fu:c.Fu}};}
 return {source:'entered plates (no fillet credit)',section:base};
}
/** Horizontal distance from the column centerline to the girder bearing. A bracket defines it from its own geometry. */
export function existingColumnEccentricity(p:ProjectInput){
 const b=p.details?.bracket;
 // A column cap carries the girder centered over the column: only the rail eccentricity remains.
 if(activeColumnCap(p))return Math.abs(p.railEccentricity);
 return b?.enabled?b.receiver.depth/2+b.reach+p.details!.bearing.width/2:p.existingColumn!.eccentricity;
}
/** Column flange unbraced length: the bracket's receiving-column value when a bracket is enabled. */
export function existingColumnUnbracedLength(p:ProjectInput){const b=p.details?.bracket;return b?.enabled?b.receiver.unbracedLength:p.existingColumn!.Lb;}
/** Rail head elevation above the column base: seat, bearing plate, girder (and cap) and rail; matches runwayElevations. */
export function existingColumnRailElevation(p:ProjectInput){return p.existingColumn!.seatElevation+(p.details?.bearing.thickness??0)+p.section.d+(p.section.kind==='cap'?p.section.capTw:0)+railTopAboveSteel(p);}

/** Seismic mass of the runway at the girder's mid-depth, from the column base. */
export const seismicHeight=(p:ProjectInput)=>p.existingColumn!.seatElevation+(p.details?.bearing.thickness??0)+p.section.d/2;
/** A unit force at the rail head; above a freestanding column's top it acts at the top with its moment. */
export const railForce=(height:number,rail:number):ColumnNodalLoad=>rail<=height?{x:rail,force:1}:{x:height,force:1,moment:rail-height};
/** Displacement at the rail head, extended rigidly above the column top. */
export const atRail=(r:ColumnResponse,height:number,rail:number)=>rail<=height?r.displacement(rail):r.displacement(height)+r.rotation(height)*(rail-height);

export function validateExistingColumn(p:ProjectInput):string[]{
 const c=p.existingColumn;if(!c?.enabled)return [];
 const errors:string[]=[],add=(test:boolean,m:string)=>{if(test)errors.push(`existingColumn.${m}`);};
 add(p.scope!=='design','enabled: the existing column check applies to design reports.');
 add(!!c.isNew&&existingLoadKeys.some(k=>Object.values(c.existing[k]).some(v=>v!==0)),'existing: a new freestanding runway column carries no existing building loads; check a column that does as an existing column.');
 add(c.Fu<c.Fy,'Fu: ultimate strength cannot be less than yield strength.');
 add(!!c.shape&&!p.details?.bracket?.enabled&&!aiscShapeByName(c.shape),'shape: select an AISC W shape or clear it to use entered plates.');
 // A freestanding column (free top) may carry the girder on its cap, with the rail above the column top.
 const freestanding=c.strong.top==='free';
 add(c.seatElevation>c.height+1e-6||(!freestanding&&c.seatElevation>=c.height),'seatElevation: the bracket seat must be below the column top support.');
 add(!freestanding&&existingColumnRailElevation(p)>=c.height,'height: the rail head must be below the column top support.');
 // The drawings take an existing column's rail elevation from its surveyed seat, so an entered top of rail must agree.
 const tor=p.drawing?.railElevation;
 if(!c.isNew&&tor){const rail=existingColumnRailElevation(p);add(Math.abs(rail-tor)>1.6,`seatElevation: the surveyed bracket seat puts the top of rail ${format(rail,'length',p.units,3)} above the datum, not the entered top of rail ${format(tor,'length',p.units,3)}; correct the survey or the entered elevation, or clear the entered elevation to draw from the survey.`);}
 for(const [axis,b] of [['strong',c.strong],['weak',c.weak]] as const)add(b.base==='pinned'&&b.top==='free',`${axis}: a pinned base with a free top is unstable; brace the top or fix the base.`);
 // A new column with runway details carries the girder on its bracket and the top-flange tie at its face: it
 // must reach the tie and stop below the top of rail, clear of the crane end trucks.
 if(c.isNew&&p.details&&p.details.bracket?.enabled){
  const d=p.details,b=d.bracket!,tie=c.seatElevation+d.bearing.thickness+p.section.d-p.section.tf,rail=existingColumnRailElevation(p);
  add(c.height+1e-6<tie,`height: the new column must reach the top-flange tie, ${format(tie,'length',p.units,3)} above its base.`);
  add(c.height>rail-railTopAboveSteel(p)+1e-6,`height: stop the new column at or below the top of the girder, ${format(rail-railTopAboveSteel(p),'length',p.units,3)} above its base, clear of the crane end trucks; a column above the rail needs the crane supplier's clearance and is not drawn here.`);
 }
 // The bracket's receiving column is this column: the J10 checks, the welds and the drawings all use one section.
 const receiverOf=p.details?.bracket?.enabled?p.details.bracket.receiver:undefined,named=aiscShapeByName(c.shape??'');
 if(receiverOf&&named){const r=receiverOf;add([[r.depth,named.d],[r.width,named.bf],[r.flangeThickness,named.tf],[r.webThickness,named.tw]].some(([v,x])=>Math.abs(v-x*25.4)>.5)||Math.abs(r.Fy-c.Fy)>.01||Math.abs(r.Fu-c.Fu)>.01,
  c.isNew?`shape: the bracket's receiving column must be the new ${c.shape} (plates and material); set it under Connections.`:`shape: the bracket's receiving column must be the surveyed existing ${c.shape} (plates and material): select the shape here to set it, or clear the shape to use the surveyed plates entered under Connections.`);}
 const sz=c.seismic;
 if(sz?.enabled){
  add(!c.isNew,'seismic: seismic design here is for new freestanding columns; enter the building\'s seismic effects as E for an existing column.');
  if(c.isNew){
   const sys=cantileverSystems[sz.system];
   add(!(sys.allowed as readonly string[]).includes(sz.sdc),`seismic.system: the ${sys.label.toLowerCase()} is not permitted in Seismic Design Category ${sz.sdc} (ASCE 7 Table 12.2-1); use the special system.`);
   add(sz.sdc!=='A'&&c.height>cantileverHeightLimit+1e-6,`height: cantilever column systems are limited to ${format(cantileverHeightLimit,'length',p.units,3)} (ASCE 7 Table 12.2-1).`);
   const rc=sz.riskCategory??'II';
   add(sz.sdc<sdcFromSDS(sz.SDS,rc),`seismic.sdc: SDS = ${sz.SDS} gives at least Seismic Design Category ${sdcFromSDS(sz.SDS,rc)} (ASCE 7 Table 11.6-1).`);
   if(sz.SD1!==undefined)add(sz.sdc<sdcFromSD1(sz.SD1,rc,sz.S1),`seismic.sdc: ${sz.S1!==undefined&&sz.S1>=.75?`S1 = ${sz.S1}`:`SD1 = ${sz.SD1}`} gives at least Seismic Design Category ${sdcFromSD1(sz.SD1,rc,sz.S1)} (ASCE 7 ${sz.S1!==undefined&&sz.S1>=.75?'§11.6':'Table 11.6-2'}).`);
   if(sz.riskCategory)add(Math.abs(sz.Ie-seismicImportance(sz.riskCategory))>1e-9,`seismic.Ie: Risk Category ${sz.riskCategory} takes Ie = ${seismicImportance(sz.riskCategory)} (ASCE 7 Table 1.5-2).`);
   add(Math.abs(sz.rho-1)>1e-9&&Math.abs(sz.rho-1.3)>1e-9,'seismic.rho: the redundancy factor is 1.0 or 1.3 (ASCE 7 §12.3.4).');
   add(sz.sdc>='D'&&Math.abs(sz.rho-1.3)>1e-9,'seismic.rho: use 1.3 in Seismic Design Category D to F unless §12.3.4.2 permits 1.0; cantilever columns with no redundancy do not qualify.');
  }
 }
 // Review inputs for an existing column (B7–B11): the longitudinal exit, the frame and the site seismic data.
 add(!!c.isNew&&(!!c.siteSeismic?.enabled||!!c.frame||c.longitudinalExit!==undefined),'siteSeismic: the longitudinal exit, frame type and site seismic data apply to an existing building column; a new freestanding column uses its own seismic design.');
 add(c.frame?.type==='braced'&&c.frame.B2!==undefined,'frame.B2: B2 applies to a sway frame only.');
 add(!!c.siteSeismic?.enabled&&c.siteSeismic.R<1,'siteSeismic.R: the response modification coefficient is at least 1.');
 const k=minimumK[c.strong.top][c.strong.base];
 add(Number.isFinite(k)&&c.Lcx+1e-6<k*c.height,`Lcx: strong-axis effective length must be at least ${k}H for the selected end conditions (AISC Commentary Table C-A-7.1).`);
 add(existingColumnUnbracedLength(p)>c.height+1e-6||c.Lcy>c.height*(c.weak.top==='free'?2.1:1)+1e-6,'Lb: unbraced lengths cannot exceed the column effective height.');
 return errors;
}

export interface ExistingColumnCombination {id:string;equation:string;P:number;Mx:number;My:number;V:number;B1x:number;B1y:number;U:number;
 /** Braced new columns: warping normal stress at the base from the girder's longitudinal force, and H1 with it. */
 warping?:number;Ut?:number;torque?:number;}
export interface ExistingColumnResult {
 source:string;station:number;eccentricity:number;railElevation:number;
 crane:{dead:number;live:number;liveStatic:number;lateral:number;longitudinal:number};
 capacity:{Pc:number;Pt:number;Mcx:number;Mcy:number;Vc:number;flexure:string;webCompact:boolean};
 combinations:ExistingColumnCombination[];governing:Record<'P'|'Mx'|'My'|'V'|'U',ExistingColumnCombination>;
 /** Governing H1 ratio at every support; the result above is for the worst. */
 /** Governing H1 ratio at each support, the weak-axis moment there, and H1 with the torsion warping stress where the column twists. */
 bySupport:{x:number;U:number;My?:number;Ut?:number}[];
 drift:{value:number;limit:number};
 /** Braced new columns: the largest H1 ratio with the warping stress from the eccentric longitudinal force, and the flange shear. */
 torsion?:{U:number;shear:number;shearCapacity:number;T:number;stress:number;a:number;offset:number;station:number;case:ExistingColumnCombination;
  /** Base warping condition of the model, and the twist at the seat under the largest torque (factored) with the girder's displacement there, twist times the offset. */
  model:'warping-free'|'warping-restrained';twist:number;slip:number};
 /** New freestanding columns with seismic design: base shear, design drift, stability and the 15% axial limit. */
 seismic?:{basis:SeismicBasis;weight:number;QE:number;height:number;drift:number;driftLimit:number;theta:number;thetaMax:number;axial:number;axialLimit:number;axialCase:string};
 /**
  * Existing columns (structural review B7–B10, D33): the longitudinal path through the column, the seat moment and
  * longitudinal force at the governing support, the F13.1 hole test, TR-13 §5.3 service limits and the rail gauge.
  */
 support?:ColumnSupportResult;
}
export interface ColumnSupportResult {
 exit:'girder-strut'|'column-strut'|'eave-strut';exitEntered:boolean;offset:number;girderTop:number;
 /** Crane-level strut on the girder line: the column's own stiffness there (k_y, K_θ, k_c), the strut stiffness specified (ratio·k_c) and the share of the force the column keeps. */
 strut?:{kY:number;Ktheta:number;kc:number;ratio:number;required:number;share:number};
 seat:{grid:number;moment:number;case:string}[];traction:number;bumper:number;bumperGrids:number[];
 frame:{type:'braced'|'sway';entered:boolean;B2?:number};
 f13?:{holds:boolean;Afn:number;Afg:number;Yt:number;demand:number;capacity:number;Mn:number};
 driftLimit:number;wind10?:number;
 gauge:{crane:number;frame?:number;total:number;snowFactor?:number};
 combinations:{asce:number;tr13:number;bumper:number};
}
export function existingColumnAnalysis(p:ProjectInput,reactions:SupportReactionSet):ExistingColumnResult{
 const c=p.existingColumn!,{section,source}=existingColumnSection(p),props:Properties=sectionProperties(section),E=section.E;
 const longitudinal=c.longitudinal==='column'?reactions.Cls:0;
 const e=existingColumnEccentricity(p),hs=c.seatElevation,ht=existingColumnRailElevation(p);
 const rs=Math.min(ht,c.height),eccentric=columnResponse(c.height,E*props.Ix,c.strong,[{x:hs,moment:1}],[rs]),side=columnResponse(c.height,E*props.Ix,c.strong,[railForce(c.height,ht)],[hs]);
 const along=longitudinal?columnResponse(c.height,E*props.Iy,c.weak,[railForce(c.height,ht)]):undefined,alongMoment=along?Math.max(...along.samples.map(s=>Math.abs(s.moment))):0;
 // Column capacity: AISC E3/E4/E7, F2, F6 and G2 through the shared I-shape strength routine.
 // Weak-axis and torsional buckling over the longer of the entered braced lengths and the flange unbraced length Lb
 // (girts brace the outer flange only; the inner flange at the bracket is unbraced over Lb), as the LTB check.
 const Lb=existingColumnUnbracedLength(p),member:ProjectInput={...p,section,unbracedLength:Lb,spans:[c.height],aist:{...(p.aist??emptyAistInputs),netFlangeArea:0,axialLength:c.Lcx,bottomBraceSpacing:c.Lcy,torsionalLength:Math.max(c.Lcz,Lb)}};
 const s=girderStrength(member,props),root=Math.sqrt(E/section.Fy);
 const webCompact=s.webRatio<=s.webLimit,flangeLimitR=root,Mp=section.Fy*props.Zx;
 // F3 flange local buckling for noncompact or slender flanges with a compact web.
 const kc=Math.min(.76,Math.max(.35,4/Math.sqrt(s.webRatio)));
 const flb=s.flangeRatio<=s.flangeLimit?Mp:s.flangeRatio<=flangeLimitR?Mp-(Mp-.7*section.Fy*props.Sx)*(s.flangeRatio-s.flangeLimit)/(flangeLimitR-s.flangeLimit):.9*E*kc*props.Sx/s.flangeRatio**2;
 const Mcx=Math.min(s.major,available(flb,p.method,.9,1.67));
 // Existing column receiving the cap tieback: AISC F13.1 hole test on the column flange; where it is not met the
 // tension flange rupture limit Mn = Fu·Afn·Sx/Afg (F13-1) bounds the strong-axis flexure (review C21).
 const f13=(()=>{if(c.isNew)return undefined;let g;try{g=capAngleGeometry(p);}catch{return undefined;}const col=g?.column.receiver;if(!g||!col)return undefined;
  const Yt=col.Fy/col.Fu<=.8?1:1.1,Afg=col.width*col.tf,Afn=(col.width-(g.column.hole+inch/16))*col.tf,demand=Yt*col.Fy*Afg,capacity=col.Fu*Afn;
  return {holds:demand<=capacity*(1+1e-9),Afn,Afg,Yt,demand,capacity,Mn:col.Fu*Afn/Afg*props.Sx};})();
 const McxF13=f13&&!f13.holds?Math.min(Mcx,available(f13.Mn,p.method,.9,1.67)):Mcx;
 const capacity={Pc:s.compression,Pt:available(section.Fy*props.A,p.method,.9,1.67),Mcx:McxF13,Mcy:s.minor,Vc:s.shear,flexure:`${s.flexureBranch}${s.flangeRatio>s.flangeLimit?' with F3 flange local buckling':''}${McxF13<Mcx?'; F13-1 tension flange rupture at the tie bolt holes':''}; Cb = 1.0`,webCompact};
 const alpha=p.method==='LRFD'?1:1.6,Pex=Math.PI**2*E*props.Ix/c.Lcx**2,Pey=Math.PI**2*E*props.Iy/c.Lcy**2;
 // Seismic force across the runway at the girder's mid-depth (new freestanding columns only).
 const basis=seismicBasis(p),hg=seismicHeight(p),sideE=basis?columnResponse(c.height,E*props.Ix,c.strong,[railForce(c.height,hg)],[hs]):undefined,columnWeight=props.weight*c.height,ownWeight=c.isNew?columnWeight:0;
 // The eccentric reaction sampled at the same stations as the seismic force.
 const eccentricE=basis?columnResponse(c.height,E*props.Ix,c.strong,[{x:hs,moment:1}],[Math.min(hg,c.height)]):undefined;
 // Braced new columns: brace overturning compresses the columns of a braced span, and a girder's longitudinal force
 // reaches its locating column at the bracket, offset from the centerline where the strut and rods hold it: a torque.
 const designed=designsBracing(p)?{cases:braceCases(p,reactions,p.method,alongSeismic(p,reactions,section)),offset:girderOffset(p)}:undefined;
 const model=torsionBase(p),warp=(T:number)=>columnTorsion(section,T,hs,model),fy=available(section.Fy,p.method,.9,1.67);
 // Existing columns (review B7–B9, D33): the seat moment of the girder reactions about the haunch web and the
 // longitudinal force at each locating seat bend the column about its weak axis; the force, offset from the column
 // centerline by the girder line, twists it unless a crane-level strut takes it on the girder line.
 const review=!c.isNew&&!designed,bracingPath=c.longitudinal==='bracing',exit=c.longitudinalExit??'eave-strut';
 // The seat moment of the uneven girder-end reactions about the bracket acts on every bracketed column, existing or new
 // (a new column braced along the runway at the strut work point, at the seat).
 const ends=(review||!!designed)&&p.details?.bracket?.enabled&&!activeColumnCap(p)?seatEnds(p):undefined,weakPath=review||!!ends;
 const alongM=weakPath?columnResponse(c.height,E*props.Iy,c.weak,[{x:hs,moment:1}],[hs]):undefined,alongF=weakPath?columnResponse(c.height,E*props.Iy,c.weak,[{x:hs,force:1}],[hs]):undefined;
 const locating=new Set(review&&bracingPath?locatingGrids(p):[]),stops=bumperAtGrids(p),offset=girderOffset(p),Cls=reactions.Cls;
 // Torsion per unit torque: twist held at the base and at a braced top (warping free), or the cantilever with the
 // base warping condition of the torsion model (columnTorsion).
 const unitTorsion=review?(c.weak.top==='braced'?pinnedTorsion(section,1,hs,c.height):(()=>{const t=columnTorsion(section,1,hs,model);return {...t,shear:model==='warping-free'?t.shear:section.tf/props.J+1.5/(props.h0*section.bf*section.tf)};})()):undefined;
 // A crane-level strut on the girder line shares the longitudinal force with the column in proportion to their
 // stiffnesses there: the column's k_c is its weak-axis translation at the seat in series with its twist over the
 // girder offset (k_y and K_θ/e²). The strut is specified at least 10 k_c, so the column keeps at most 1/11 of the force,
 // as weak-axis bending and torsion, and is checked for that share.
 const strut=review&&exit==='girder-strut'&&alongF&&unitTorsion?(()=>{
  const kY=1/alongF.displacement(hs),Ktheta=c.weak.top==='braced'?1/(pinnedTorsion(section,1,hs,c.height).twist||Infinity):columnTorsion(section,1,hs,model).Ktheta,offset=girderOffset(p);
  const kc=1/(1/kY+offset**2/Ktheta);return {kY,Ktheta,kc,ratio:10,required:10*kc,share:1/11};
 })():undefined,keep=exit==='girder-strut'?strut?.share??0:1;
 const frame=c.frame,sway=review&&frame?.type==='sway'&&frame.B2!==undefined?frame.B2:undefined;
 const site=review?runwaySiteSeismic(p):undefined,tr13=review&&p.aist?tr13SupportCombinations(p.method):[];
 const nonSway=['D','L','Lr','S','R'] as const;
 const torsional=(k:ExistingColumnCombination,T:number)=>{const w=T?warp(T).stress:0,ratio=k.P>=0?k.P/capacity.Pc:-k.P/capacity.Pt;return {...k,warping:w,Ut:k.U+(ratio>=.2?8/9:1)*w/fy,torque:T};};
 // Every support uses the same column; the support giving the largest H1 ratio governs.
 const evaluate=(support:SupportReactionSet['supports'][number],j:number)=>{
 const share=designed?braceShare(p,j):undefined,brace=(id:string)=>designed?.cases.find(v=>v.id===id);
 // A column cap: the girder end reactions act along the runway off the column centerline (weak axis, top moment).
 const ex=capAlongEccentricity(p,j),amplifyY=(P:number)=>P<=0?1:alpha*P>=Pey?Infinity:1/(1-alpha*P/Pey);
 const dead=support.D,live=support.Cd+support.Cv+support.Ci+support.L+support.Clv,liveStatic=support.Cd+support.Cv,lateral=support.Css,liveAll=live,lateralAll=lateral,concurrent=p.aist?.concurrency==='full';
 const seat=ends?.[j]??[],seatCase=(fD:number,fL:number,fCd:number,fCv:number)=>seat.length?seatMoment(seat,{D:fD,L:fL,Cd:fCd,Cv:fCv}):0;
 // Weak-axis moment from the seat moment and the longitudinal force F at the seat (the eave-strut path only), and the torque F·offset.
 const reviewMy=(Mseat:number,F:number)=>alongM&&alongF?combinedPeak(alongM.samples,alongF.samples,'moment',Mseat,exit==='eave-strut'?F:exit==='girder-strut'?keep*F:0):0;
 const reviewRow=(row:ExistingColumnCombination,F:number):ExistingColumnCombination=>{
  if(!unitTorsion||!F||!keep)return row;const T=keep*F*offset,w=unitTorsion.stress*T,ratio=row.P>=0?row.P/capacity.Pc:-row.P/capacity.Pt;
  return {...row,warping:w,Ut:row.U+(ratio>=.2?8/9:1)*w/fy,torque:T};
 };
 // One concurrency rule with the girder (craneCombinations): impact and side thrust in separate combinations, TR-13
 // 2b (side thrust, no impact) and 2c (impact, no side thrust), unless the project adopts full concurrency (C1).
 const asceRow=(k:{id:string;equation:string;factors:Record<typeof existingLoadKeys[number],number>},cd?:number,split?:'Css'|'Ci')=>{
  const live=split==='Css'?liveAll-support.Ci:liveAll,lateral=split==='Ci'?0:lateralAll;
  const f=k.factors,existing=(key:'P'|'Mx'|'My'|'V',abs:boolean,keys:readonly typeof existingLoadKeys[number][]=existingLoadKeys)=>keys.reduce((sum,t)=>sum+(abs?Math.abs(f[t]*c.existing[t][key]):f[t]*c.existing[t][key]),0);
  // TR-13 supporting-structure forms take the crane dead load with the dead-load factor (cd), the rest of the crane with L.
  const runway=f.D*dead+(cd===undefined?f.L*live:cd*support.Cd+f.L*(live-support.Cd)),bc=brace(`${p.method} ${k.id}`);
  // Runway seismic force across the runway at the column with E (site seismic data): the runway and crane masses here.
  const Eside=site&&f.E?Math.abs(f.E)*site.across*(dead+support.Cd+(site.input.liftedLoadSecured?support.Cv:0)):0;
  // Existing moments are added to the crane peak at its governing section: conservative superposition of maxima.
  // A new column carries its own weight to the base (an existing column's is in its entered dead load).
  const P=existing('P',false)+runway+f.D*ownWeight+(bc&&share?bc.H*share.vertical:0);
  const Mx=combinedPeak(eccentric.samples,side.samples,'moment',runway*e,f.L*lateral+Eside)+existing('Mx',true);
  const V=combinedPeak(eccentric.samples,side.samples,'shear',runway*e,f.L*lateral+Eside)+existing('V',true);
  const F=locating.has(j)?Math.abs(f.L)*Cls:0;
  const My=f.L*longitudinal*alongMoment+existing('My',true)+Math.abs(runway)*ex+reviewMy(seatCase(f.D,f.L,cd??f.L,f.L),F);
  const amplify=(Pe:number)=>P<=0?1:alpha*P>=Pe?Infinity:1/(1-alpha*P/Pe),B1x=amplify(Pex),B1y=amplify(Pey);
  // Sway frame with the entered B2 (AISC Appendix 8): B1 on the gravity part, B2 on the lateral part (side thrust, W, E).
  const Mxr=sway===undefined?B1x*Mx:B1x*(combinedPeak(eccentric.samples,side.samples,'moment',runway*e,0)+existing('Mx',true,nonSway))+sway*(combinedPeak(eccentric.samples,side.samples,'moment',0,f.L*lateral+Eside)+existing('Mx',true,['W','E']));
  const ratio=P>=0?P/capacity.Pc:-P/capacity.Pt,flex=Mxr/capacity.Mcx+B1y*My/capacity.Mcy;
  const U=Number.isFinite(flex)?(ratio>=.2?ratio+8/9*flex:ratio/2+flex):1e12;
  const row={id:`${p.method} ${k.id}${split?` (${split==='Css'?'side thrust, no impact':'impact, no side thrust'})`:''}`,equation:k.equation,P,Mx:Mxr,My:B1y*My,V,B1x,B1y,U};
  return bc&&share?torsional(row,share.locating?bc.Hbay*designed!.offset:0):reviewRow(row,F);
 };
 const rule=(k:{factors:{L:number}})=>!k.factors.L?[undefined]:concurrent?[undefined,'Css' as const,'Ci' as const]:['Css' as const,'Ci' as const];
 const combinations:ExistingColumnCombination[]=[...asceCombinations(p.method).flatMap(k=>rule(k).map(v=>asceRow(k,undefined,v))),...tr13.flatMap(k=>rule(k).map(v=>asceRow(k,k.cd,v)))];
 // TR-13 crane stop (8 / ASD 9) at a column locating a girder that carries a stop: 1.2(D + Cds) + Cvs + 1.0Cbs.
 if(review&&bracingPath&&stops.grids.has(j)){
  const [fD,fB]=p.method==='LRFD'?[1.2,1]:[1,.67],runway=fD*dead+fD*support.Cd+support.Cv,P=fD*c.existing.D.P+runway;
  const Mx=combinedPeak(eccentric.samples,side.samples,'moment',runway*e,0)+Math.abs(fD*c.existing.D.Mx),V=combinedPeak(eccentric.samples,side.samples,'shear',runway*e,0)+Math.abs(fD*c.existing.D.V);
  const F=fB*stops.Cbs,My=Math.abs(fD*c.existing.D.My)+reviewMy(seatCase(fD,0,fD,1),F),B1x=P<=0?1:alpha*P>=Pex?Infinity:1/(1-alpha*P/Pex),B1y=amplifyY(P);
  const ratio=P>=0?P/capacity.Pc:-P/capacity.Pt,flex=B1x*Mx/capacity.Mcx+B1y*My/capacity.Mcy,U=Number.isFinite(flex)?(ratio>=.2?ratio+8/9*flex:ratio/2+flex):1e12;
  combinations.push(reviewRow({id:`${p.method} AIST bumper`,equation:p.method==='LRFD'?'1.2D + 1.2Cds + Cvs + 1.0Cbs':'D + Cds + Cvs + 0.67Cbs',P,Mx:B1x*Mx,My:B1y*My,V,B1x,B1y,U},F));
 }
 // AIST crane stop and seismic along the runway on a braced new column, with the static crane vertical.
 if(designed&&share)for(const k of designed.cases.filter(v=>v.kind!=='asce'&&!v.overstrength)){
  const runway=k.D*dead+k.live*live+k.Cd*support.Cd+k.Cv*support.Cv,P=runway+k.D*ownWeight+k.H*share.vertical;
  const Mx=combinedPeak(eccentric.samples,side.samples,'moment',runway*e,k.side*lateral),V=combinedPeak(eccentric.samples,side.samples,'shear',runway*e,k.side*lateral);
  const My=Math.abs(runway)*ex+reviewMy(seatCase(k.D,k.live,k.Cd,k.Cv),0),B1y=amplifyY(P),B1x=P<=0?1:alpha*P>=Pex?Infinity:1/(1-alpha*P/Pex),ratio=P>=0?P/capacity.Pc:-P/capacity.Pt,flex=B1x*Mx/capacity.Mcx+B1y*My/capacity.Mcy;
  const U=Number.isFinite(flex)?(ratio>=.2?ratio+8/9*flex:ratio/2+flex):1e12;
  combinations.push(torsional({id:k.id,equation:k.equation,P,Mx:B1x*Mx,My:B1y*My,V,B1x,B1y,U},share.locating?k.Hbay*designed.offset:0));
 }
 // ASCE 7 seismic combinations (§12.4.2.3) with the static crane vertical; the side thrust does not act with E.
 // In SDC B to F the cantilever columns are an AISC 341 system (ASCE 7 §14.1.2.2.1): §E5.4a / §E6.4a design them
 // for the overstrength combinations as well. SDC A (§1.4.2) has no overstrength cases.
 const QE=basis?basis.Cs*(dead+support.Cd+columnWeight):0;
 const seismicCases=basis&&sideE?seismicCombinations(p.method,basis).filter(k=>!k.overstrength||!basis.integrityOnly).map(k=>{
  const runway=k.D*dead+k.L*liveStatic,P=runway+k.D*ownWeight;
  const Mx=combinedPeak(eccentricE!.samples,sideE.samples,'moment',runway*e,k.E*QE),V=combinedPeak(eccentricE!.samples,sideE.samples,'shear',runway*e,k.E*QE);
  const My=Math.abs(runway)*ex+reviewMy(seatCase(k.D,0,k.L,k.L),0),B1y=amplifyY(P),B1x=P<=0?1:alpha*P>=Pex?Infinity:1/(1-alpha*P/Pex),ratio=P>=0?P/capacity.Pc:-P/capacity.Pt,flex=B1x*Mx/capacity.Mcx+B1y*My/capacity.Mcy;
  const U=Number.isFinite(flex)?(ratio>=.2?ratio+8/9*flex:ratio/2+flex):1e12;
  return {id:`${p.method} ${k.id}`,equation:k.equation,P,Mx:B1x*Mx,My:B1y*My,V,B1x,B1y,U,overstrength:k.overstrength};
 }):[];
 combinations.push(...seismicCases);
 const max=(key:'P'|'Mx'|'My'|'V'|'U')=>combinations.reduce((a,b)=>Math.abs(b[key])>Math.abs(a[key])?b:a);
 // Service drift at the rail head from one crane's side thrust and static eccentric reaction (column alone).
 const drift=Math.abs(lateral*atRail(side,c.height,ht))+Math.abs(liveStatic*e*atRail(eccentric,c.height,ht));
 // Rail gauge under gravity (TR-13 §5.3): runway dead load and the static crane at this support, both runways alike.
 // A positive eccentric moment turns the column toward the crane span (u > 0 inward), closing the gauge.
 const gaugeCrane=-2*(dead+liveStatic)*e*atRail(eccentric,c.height,ht);
 // §12.8.6 design drift and §12.8.7 stability at the girder; §12.2.5.2 axial limit for cantilever columns.
 let seismic:ExistingColumnResult['seismic'];
 if(basis&&sideE&&seismicCases.length){
  const elastic=QE*atRail(sideE,c.height,hg),design=basis.Cd*elastic/basis.Ie,Px=dead+liveStatic+columnWeight;
  // The axial limit applies in the overstrength combinations under AISC 341 (§E5.4a), else in the seismic ones.
  const limitCases=seismicCases.some(k=>k.overstrength)?seismicCases.filter(k=>k.overstrength):seismicCases,axialCase=limitCases.reduce((a,b)=>b.P>a.P?b:a);
  seismic={basis,weight:dead+support.Cd+columnWeight,QE,height:hg,drift:Math.abs(design),driftLimit:(basis.Ie>=1.5?.01:basis.Ie>=1.25?.015:.02)*hg,
   theta:QE>0?Px*Math.abs(design)*basis.Ie/(QE*hg*basis.Cd):0,thetaMax:Math.min(.25,.5/basis.Cd),axial:Math.max(0,axialCase.P),axialLimit:.15*capacity.Pc,axialCase:axialCase.id};
 }
 // TR-13 §5.3: H/400 or 2 in, whichever is less, H from the column base to the top of the crane girder.
 const girderTop=ht-railTopAboveSteel(p),driftLimit=review&&p.aist?Math.min(girderTop/400,2*inch,ht/c.driftLimit*(c.driftLimit>400?1:Infinity)):ht/c.driftLimit;
 const seatGov=seat.length?seatCase(p.method==='LRFD'?1.2:1,p.method==='LRFD'?1.6:1,p.method==='LRFD'?1.6:1,p.method==='LRFD'?1.6:1):0;
 return {station:support.x,crane:{dead,live,liveStatic,lateral,longitudinal},combinations,governing:{P:max('P'),Mx:max('Mx'),My:max('My'),V:max('V'),U:max('U')},drift:{value:drift,limit:driftLimit},seismic,gaugeCrane,seatGov,girderTop,
  counts:{tr13:tr13.length,bumper:combinations.filter(k=>k.id.endsWith('AIST bumper')).length}};
 };
 const all=reactions.supports.map(evaluate),worst=all.reduce((a,b)=>b.governing.U.U>a.governing.U.U||(b.governing.U.U===a.governing.U.U&&b.drift.value>a.drift.value)?b:a);
 // Torsion governs where H1 with the warping stress is largest; the flange shear takes the whole torque in
 // Saint-Venant shear near the seat and in warping shear near the base, each bounded by T.
 let torsion:ExistingColumnResult['torsion'];
 if(unitTorsion){
  const rows=all.flatMap(v=>v.combinations.filter(x=>x.Ut!==undefined).map(k=>({station:v.station,k})));
  if(rows.length){
   const g=rows.reduce((a,b)=>b.k.Ut!>a.k.Ut!?b:a),T=Math.max(...rows.map(v=>v.k.torque??0));
   const twist=unitTorsion.twist*T;
   torsion={U:g.k.Ut!,shear:unitTorsion.shear*T,shearCapacity:available(.6*section.Fy,p.method,.9,1.67),T:g.k.torque??0,stress:g.k.warping??0,a:unitTorsion.a,offset,station:g.station,case:g.k,model,twist,slip:twist*offset};
  }
 }
 if(designed){
  const rows=all.flatMap(v=>v.combinations.filter(x=>x.Ut!==undefined).map(k=>({station:v.station,k})));
  if(rows.length){
   // The governing row: H1 with the warping stress, or the flange shear of its torque, whichever is larger.
   const cap=available(.6*section.Fy,p.method,.9,1.67),score=(k:ExistingColumnCombination)=>Math.max(k.Ut!,warp(k.torque??0).shear/cap);
   const g=rows.reduce((a,b)=>score(b.k)>score(a.k)?b:a),T=Math.max(...rows.map(v=>v.k.torque??0)),a=warp(1).a,shear=warp(T).shear;
   const twist=warp(T).twist;
   torsion={U:g.k.Ut!,shear,shearCapacity:available(.6*section.Fy,p.method,.9,1.67),T:g.k.torque??0,stress:g.k.warping??0,a,offset:designed.offset,station:g.station,case:g.k,model,twist,slip:twist*designed.offset};
  }
 }
 let support:ColumnSupportResult|undefined;
 if(review){
  const sv=c.service,spread=sv?.spreadD!==undefined&&sv.spreadS!==undefined&&sv.roofSnow!==undefined?(()=>{
   // TR-13 §5.3: for the gauge check only, snow of 30 psf or less may be reduced 50%, more than 30 psf 25%.
   const factor=sv.roofSnow!<=30*4.788025898e-5?.5:.75;return {value:2*(sv.spreadD!+factor*sv.spreadS!),factor};})():undefined;
  const gc=Math.max(...all.map(v=>Math.abs(v.gaugeCrane)))*Math.sign(all.reduce((a,v)=>Math.abs(v.gaugeCrane)>Math.abs(a)?v.gaugeCrane:a,0)||1);
  support={exit,exitEntered:c.longitudinalExit!==undefined,offset,girderTop:worst.girderTop,...(strut?{strut}:{}),
   seat:all.map((v,i)=>({grid:i+1,moment:v.seatGov,case:p.method==='LRFD'?'1.2D + 1.6(Cd + Cv + Ci)':'D + Cd + Cv + Ci'})),traction:bracingPath?Cls:0,bumper:bracingPath?stops.Cbs:0,bumperGrids:bracingPath?[...stops.grids].map(j=>j+1):[],
   frame:{type:frame?.type??'braced',entered:!!frame,...(frame?.B2!==undefined?{B2:frame.B2}:{})},...(f13?{f13}:{}),driftLimit:worst.drift.limit,...(sv?.wind10!==undefined?{wind10:sv.wind10}:{}),
   gauge:{crane:gc,...(spread?{frame:spread.value,snowFactor:spread.factor}:{}),total:gc+(spread?.value??0)},combinations:{asce:asceCombinations(p.method).length,tr13:tr13.length,bumper:Math.max(...all.map(v=>v.counts.bumper))}};
 }
 const {gaugeCrane:_g,seatGov:_s,girderTop:_t,counts:_c,...governingSupport}=worst;
 return {source,eccentricity:e,railElevation:ht,capacity,...governingSupport,bySupport:all.map(v=>{const t=v.combinations.filter(k=>k.Ut!==undefined);return {x:v.station,U:v.governing.U.U,My:Math.abs(v.governing.My.My),...(t.length?{Ut:Math.max(...t.map(k=>k.Ut!))}:{})};}),torsion,support};
}

/**
 * The crane-level strut by others that the existing-column check relies on (review B8): on the girder line (the
 * girder web, `offset` from the column centerline) with at least `ratio` times the column's own stiffness there, or at
 * the column centerline; at every locating grid it takes the girder's longitudinal force, factored as in the column
 * check (traction with L, the crane stop TR-13 1.0Cbs / 0.67Cbs at the stop grids), and carries the line force to the
 * braced bay: F = max(traction, stop). Undefined where no strut is assumed (eave-strut exit, or no bracing path).
 */
export function craneLevelStrut(p:ProjectInput,r:Pick<ExistingColumnResult,'support'>){
 const z=r.support,c=p.existingColumn;if(!z||!c||c.isNew||c.longitudinal!=='bracing'||z.exit==='eave-strut')return undefined;
 const lrfd=p.method==='LRFD',traction=(lrfd?1.6:1)*z.traction,stop=(lrfd?1:.67)*z.bumper,grids=locatingGrids(p).map(j=>j+1);
 return {location:z.exit==='girder-strut'?'girder-line' as const:'column-centerline' as const,offset:z.exit==='girder-strut'?z.offset:0,grids,traction,stop,stopGrids:z.bumperGrids,
  force:Math.max(traction,stop),stiffness:z.exit==='girder-strut'?z.strut?.required:undefined,ratio:z.strut?.ratio,assumed:!z.exitEntered};
}
export type CraneLevelStrut=NonNullable<ReturnType<typeof craneLevelStrut>>;

export function existingColumnChecks(p:ProjectInput,r:ExistingColumnResult):CheckResult[]{
 const c=p.existingColumn!,refs=['asce','aisc-e','aisc-f2','aisc-h','existing-column'],u=p.units,checks:CheckResult[]=[],label=c.isNew?'New column':'Existing column';
 const add=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,caseId?:string)=>checks.push({id:'column-'+id,group:label,title,demand,capacity,quantity,utilization:demand/capacity,status:Number.isFinite(demand)&&demand<=capacity*(1+1e-9)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(demand/capacity).toFixed(4)}`,note,caseId,referenceIds:refs});
 const mk=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,caseId?:string):CheckResult=>({id:'column-'+id,group:label,title,demand,capacity,quantity,utilization:demand/capacity,status:Number.isFinite(demand)&&demand<=capacity*(1+1e-9)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(demand/capacity).toFixed(4)}`,note,caseId,referenceIds:refs});
 const g=r.governing,crane=`Support x=${format(r.station,'length',u,3)}: runway dead ${format(r.crane.dead,'force',u,3)}, crane and runway live ${format(r.crane.live,'force',u,3)} (Cd+Cv+Ci+L), side thrust ${format(r.crane.lateral,'force',u,3)}${r.crane.longitudinal?`, longitudinal ${format(r.crane.longitudinal,'force',u,3)}`:''}; eccentricity ${format(r.eccentricity,'length',u,3)}; rail head ${format(r.railElevation,'length',u,3)} above base. Crane loads are live load L (ASCE 7 §4.9).`;
 if(c.isNew)checks.push({id:'column-basis',group:label,title:'New column · section and loads',status:'pass',equation:'',note:`New ${r.source} column designed here for the crane and runway reactions only; it carries no existing building loads. Base plate, anchor rods and footing: see New column base.`,referenceIds:['existing-column']});
 else checks.push({id:'column-basis',group:label,title:`${label} · survey and existing load effects`,status:c.confirmed&&c.source.trim()?'pass':'unverified',equation:'',note:c.confirmed&&c.source.trim()?`Section: ${r.source}. Existing load effects: ${c.source}. Existing effects act at the column's governing section and are added to the crane peaks regardless of sign or location.`:'Enter the surveyed column and the existing load effects (D, L, Lr, S, R, W, E) with their source, then confirm.',referenceIds:refs});
 if(!r.capacity.webCompact)checks.push({id:'column-web',group:label,title:`${label} · web slenderness for flexure`,status:'unsupported',equation:'h/t_w\\le\\lambda_{pw}=3.76\\sqrt{E/F_y}',note:'A noncompact or slender column web needs AISC F4/F5, which this check does not implement.',referenceIds:refs});
 add('axial',`${label} · axial compression`,Math.max(0,g.P.P),r.capacity.Pc,'force','P_n=F_{cr}A_e\\\ \\text{(E3, E4, E7)}',`${crane} Lcx=${format(c.Lcx,'length',u,3)} (strong axis, base to the braced top). Weak-axis and torsional buckling use max(Lcy, Lb) = ${format(Math.max(c.Lcy,existingColumnUnbracedLength(p)),'length',u,3)} and max(Lcz, Lb) = ${format(Math.max(c.Lcz,existingColumnUnbracedLength(p)),'length',u,3)}: the specified Lcy = ${format(c.Lcy,'length',u,3)}, Lcz = ${format(c.Lcz,'length',u,3)} are not credited below the flange unbraced length Lb = ${format(existingColumnUnbracedLength(p),'length',u,3)} of the lateral-torsional buckling check (girts brace the outer flange only).`,g.P.id);
 add('flexure',`${label} · strong-axis flexure`,Math.abs(g.Mx.Mx),r.capacity.Mcx,'moment','M_{rx}=B_1\\sum|M_x|',`${r.capacity.flexure}, Lb=${format(existingColumnUnbracedLength(p),'length',u,3)}. B1 = ${g.Mx.B1x.toFixed(3)} with Cm = 1. Strong axis: ${c.strong.base} base, ${c.strong.top} top.${r.support?.f13?` Tie bolt holes in the column flange, AISC F13.1: ${r.support.f13.holds?'Fu·Afn ≥ Yt·Fy·Afg, tension flange rupture does not apply':`Fu·Afn < Yt·Fy·Afg, Mn ≤ Fu·Afn·Sx/Afg = ${format(r.support.f13.Mn,'moment',u,3)} (F13-1) applied`}.`:''} ${crane}`,g.Mx.id);
 if(r.crane.longitudinal||existingLoadKeys.some(k=>c.existing[k].My)||g.My.My>0)add('flexure-y',`${label} · weak-axis flexure`,Math.abs(g.My.My),r.capacity.Mcy,'moment','M_{ry}=B_1\\sum|M_y|',`AISC F6. Weak axis: ${c.weak.base} base, ${c.weak.top} top. ${r.support?`Seat moment of the girder reactions about the haunch web and the longitudinal force at each locating seat (${r.support.exit==='eave-strut'?'carried to the eave strut at the column top':'taken out by the crane-level strut at the seat'}${r.support.exitEntered?'':', path assumed'}): see the longitudinal force path check.`:`Crane longitudinal force ${r.crane.longitudinal?'is resisted by this column':'is not applied to this column'}.`}${activeColumnCap(p)?` Column cap: each girder end reaction acts along the runway at 0.8 of its bearing length from the girder end (a continuous girder centered on an interior column has none), all of it at the farthest bearing, as a moment at the column top (${g.My.id}).`:''}`,g.My.id);
 add('shear',`${label} · strong-axis shear`,Math.abs(g.V.V),r.capacity.Vc,'force','V_n=0.6F_yA_wC_{v1}\\\ \\text{(G2)}','Crane side thrust and eccentric reaction couple plus the existing shears.',g.V.id);
 // M5: an existing column without the frame data is checked as part of a braced (non-sway) frame: a conditional result.
 const braced=!c.isNew&&!!r.support&&!r.support.frame.entered,condition=braced?`Conditional on a braced (non-sway) frame across the runway (${c.strong.base} base, ${c.strong.top} top, B1 only): the frame type is not available and is by others (responsibility matrix). If the column line is a sway (portal) frame, repeat this check with B2 from the frame analysis (AISC Appendix 8). `:'';
 add('interaction',`${label} · combined axial and flexure (H1)${braced?', braced frame assumed':''}`,g.U.U,1,'ratio','\\frac{P_r}{P_c}+\\frac89\\left(\\frac{M_{rx}}{M_{cx}}+\\frac{M_{ry}}{M_{cy}}\\right)\\le1\\ \\ \\text{(H1-1a)};\\quad\\frac{P_r}{2P_c}+\\frac{M_{rx}}{M_{cx}}+\\frac{M_{ry}}{M_{cy}}\\le1\\ \\ \\text{(H1-1b)}',`${condition}Governing ASCE 7 combination ${g.U.equation}: Pr=${format(g.U.P,'force',u,3)}, Mrx=${format(g.U.Mx,'moment',u,3)}, Mry=${format(g.U.My,'moment',u,3)}. ${r.combinations.length} combinations with W and E in both directions${r.support?` (${r.support.combinations.asce} ASCE 7 with crane loads as L, ${r.support.combinations.tr13} AIST TR-13 §3.10 supporting-structure forms with the crane dead load at the dead-load factor${r.support.combinations.bumper?', and the TR-13 crane stop case':''}; the weak-axis moment includes the seat moment and the longitudinal force at the locating seat)`:''}. Column-alone model: frame action, base flexibility and a direct-analysis stability check are not included; second-order effects use B1 with the specified effective lengths.`,g.U.id);
 add('drift',`${label} · runway-level lateral displacement`,r.drift.value,r.drift.limit,'length',r.support?'\\Delta\\le\\min(H/400,\\;2\\,\\mathrm{in})':'\\Delta\\le h/n',r.support?`Service side thrust and static eccentric reaction of the crane, column alone (${c.strong.top} top). AIST TR-13 §5.3 limit: H/400 or 2 in, whichever is less, with H = ${format(r.support.girderTop,'length',u,3)} from the column base to the top of the crane girder (seat ${format(c.seatElevation,'length',u,3)} + bearing plate, girder and cap): ${format(r.support.driftLimit,'length',u,3)}. The displacement is taken at the rail head, ${format(r.railElevation,'length',u,3)} above the base (slightly above the top of the girder). Frame and roof diaphragm flexibility are excluded: the frame drift under the 10-year wind is by others (responsibility matrix).`:`Service side thrust and static eccentric reaction of the crane, column alone (${c.strong.top} top). Limit h/${c.driftLimit}; DG7 suggests about h/240 and 2 in for cab-operated cranes and h/100 for pendant cranes. Frame and roof diaphragm flexibility are excluded.`);
 if(r.support)checks.push(...columnSupportChecks(p,r,label,refs));
 // The crane-level strut the check relies on: by the building engineer of record, specified here (S-00, S-01, delivered forces).
 const strut=craneLevelStrut(p,r);
 if(strut){const fl=(v:number)=>format(v,'length',u,3),ff=(v:number)=>format(v,'force',u,3),at=strut.location==='girder-line'?`on the girder line (girder web, ${fl(strut.offset)} from the column centerline)`:'at the column centerline';
  const grids=`grid${strut.grids.length>1?'s':''} ${strut.grids.join(', ')}`,k=strut.stiffness!==undefined?`, k ≥ ${format(strut.stiffness,'stiffness',u,3)}`:'';
  checks.push({id:'crane-level-strut',group:label,title:`Crane-level strut by others ${at} at ${grids}${k}, F = ${ff(strut.force)} (${p.method})`,status:'excluded',equation:strut.stiffness!==undefined?`k_s\\ge${strut.ratio}\\,k_c`:'',referenceIds:['tr13-column-path',...refs],
   note:`Not checked here: the existing-column check relies on a crane-level strut ${at}, connected at the seat level of every locating column (${grids}) and carried to the braced bay. Factored ${p.method} forces at each locating seat: traction ${ff(strut.traction)}${strut.stop?`; crane stop ${ff(strut.stop)} at grid${strut.stopGrids.length>1?'s':''} ${strut.stopGrids.join(', ')}`:''}; strut design force (the line force to the braced bay) F = ${ff(strut.force)}.${strut.stiffness!==undefined?` Axial stiffness at each seat at least ${strut.ratio} times the column's own stiffness there: k_s ≥ ${format(strut.stiffness,'stiffness',u,3)}, so the column keeps at most 1/${strut.ratio!+1} of the force.`:''}${strut.assumed?' The exit is assumed (not entered): confirm it with the building engineer of record.':''} Strut, its connections and the braced bay by the building engineer of record (S-00, S-01).`});}
 if(r.support)checks.push(...buildingSeismicChecks(p));
 if(r.seismic){
  const z=r.seismic,b=z.basis,f=(v:number,q:Parameters<typeof format>[1]='force')=>format(v,q,u,3),src=c.seismic?.source.trim();
  checks.push({id:'column-seismic-basis',group:label,title:`${label} · seismic basis (cantilever column system)`,status:src?'pass':'unverified',equation:'C_s=\\frac{S_{DS}I_e}{R}\\ge0.044S_{DS}I_e\\ge0.01',referenceIds:['asce-12'],
   note:`${cantileverSystems[b.system].label}: R = ${b.R}, Ωo = ${b.Omega0}, Cd = ${b.Cd}; SDC ${b.sdc}, SDS = ${b.SDS}, Ie = ${b.Ie}, ρ = ${b.rho}; Cs = ${b.Cs.toFixed(4)} on the short-period plateau (no period reduction). Seismic weight ${f(z.weight)} (runway dead, empty crane and column) at the girder mid-depth, ${f(z.height,'length')} above the base: QE = ${f(z.QE)} across the runway. ${b.integrityOnly?'The base, anchors and footing take the §1.4.2 force (SDC A);':`The columns (AISC 341 §${b.system==='special'?'E6':'E5'}.4a) and the base, anchors and footing (§12.2.5.2) also take the overstrength Ωo;`} along the runway the crane-level bracing carries the seismic force. ${src?`Source: ${src}.`:'Enter the source of SDS and the seismic design category.'}`});
  add('seismic-axial',`${label} · cantilever column axial limit`,z.axial,z.axialLimit,'force','P_r\\le0.15\\,P_c',`${b.integrityOnly?'ASCE 7 §12.2.5.2: axial load in the seismic combinations':`ASCE 7 §12.2.5.2 and AISC 341 §${b.system==='special'?'E6':'E5'}.4a: axial load in the overstrength seismic combinations`} (${z.axialCase}) at most 15% of the available axial strength, including slenderness.`,z.axialCase);
  add('seismic-drift',`${label} · seismic design drift`,z.drift,z.driftLimit,'length','\\delta_x=\\frac{C_d\\,\\delta_{xe}}{I_e}\\le\\Delta_a',`ASCE 7 §12.8.6 and Table 12.12-1 (all other structures): ${b.Ie>=1.5?'0.010':b.Ie>=1.25?'0.015':'0.020'}h at the girder mid-depth; column alone, fixed base.`);
  // AISC 341 §E6 adds member ductility, protected zones and demand-critical welds for special cantilever columns.
  if(!b.integrityOnly&&b.system==='special')checks.push({id:'column-seismic-e6',group:label,title:`${label} · AISC 341 §E6 special cantilever column detailing`,status:'unsupported',equation:'',note:'AISC 341 §E6.5 highly ductile members (Table D1.1), protected zones at the column base and demand-critical column-to-base welds are not checked here; verify them, or use the ordinary system (§E5) where ASCE 7 Table 12.2-1 permits it.',referenceIds:refs});
  add('seismic-stability',`${label} · seismic stability coefficient`,z.theta,z.thetaMax,'ratio','\\theta=\\frac{P_x\\Delta I_e}{V_xh_{sx}C_d}\\le\\frac{0.5}{\\beta C_d}\\le0.25',`ASCE 7 §12.8.7 with β = 1.0. ${z.theta<=.1?'θ ≤ 0.10: P-delta effects need not be added.':'θ > 0.10: the column check includes P-delta through B1.'}`);
 }
 if(r.torsion&&r.support){
  const t=r.torsion,fm=(v:number)=>format(v,'moment',u,3),fs=(v:number)=>format(v,'stress',u,3),z=r.support;
  checks.push({...mk('torsion',`${label} · torsion from the longitudinal force offset (TR-13 §5.9.2)`,Math.max(t.U,t.shear/t.shearCapacity),1,'ratio','\\frac{P_r}{P_c}+\\frac89\\left(\\frac{M_{rx}}{M_{cx}}+\\frac{M_{ry}}{M_{cy}}+\\frac{\\sigma_{ws}}{\\phi F_y}\\right)\\le1;\\;\\tau_t+\\tau_{ws}\\le\\phi0.6F_y',
   `Each girder's longitudinal force reaches its locating column at the seat on the girder line, ${format(t.offset,'length',u,3)} from the column centerline, while ${z.exit==='girder-strut'&&z.strut?`the crane-level strut on the girder line takes it in proportion to its stiffness: with the strut at least ${z.strut.ratio} k_c = ${format(z.strut.required,'stiffness',u,3)} (the column's own stiffness there k_c = (1/k_y + e²/K_θ)⁻¹ = ${format(z.strut.kc,'stiffness',u,3)}: weak-axis k_y = ${format(z.strut.kY,'stiffness',u,3)} in series with the twist K_θ/e² = ${format(z.strut.Ktheta/z.offset**2,'stiffness',u,3)}) the column keeps at most 1/${Math.round(1/z.strut.share)} of it, as weak-axis bending (in H1) and torsion`:z.exit==='column-strut'?'the crane-level strut holds the column at its centerline':'the eave strut holds the column at its top'}: torque T = ${fm(t.T)} at the seat (${t.case.id}, support x=${format(t.station,'length',u,3)}). Twist held at the base and ${c.weak.top==='braced'?'at the braced top, warping free (AISC Design Guide 9, exact two-segment solution)':t.model==='warping-free'?'nowhere above, warping free at the base: the torque below the seat is carried in Saint-Venant torsion (AISC Design Guide 9; the base\'s warping restraint is not relied on)':'nowhere above, the base restrained against warping: fixed-base cantilever bound (the base by the building engineer of record must provide that restraint)'}, a = ${format(t.a,'length',u,3)}: warping stress ${fs(t.stress)} at the flange tips added to H1 as flange lateral bending; flange shear (Saint-Venant plus warping) ${fs(t.shear)} against ${fs(t.shearCapacity)}. Twist at the seat under the largest torque ${t.twist.toFixed(4)} rad: the girder line moves ${format(t.slip,'length',u,3)} along the runway there (for information). ${Math.max(t.U,t.shear/t.shearCapacity)>1?'Not adequate: provide a crane-level strut on the girder line (or a torsion-resisting detail) so the longitudinal force does not twist the column.':z.exit==='girder-strut'?'The strut stiffness and strength (the full force) are by the building engineer of record.':'A crane-level strut on the girder line would remove this torsion.'}`,t.case.id),referenceIds:['tr13-column-path','aisc-h3','existing-column']});
 }
 else if(r.torsion){
  const t=r.torsion,fm=(v:number)=>format(v,'moment',u,3),fs=(v:number)=>format(v,'stress',u,3);
  add('torsion',`${label} · H1 with torsion from the longitudinal force`,Math.max(t.U,t.shear/t.shearCapacity),1,'ratio','\\frac{P_r}{P_c}+\\frac89\\left(\\frac{M_{rx}}{M_{cx}}+\\frac{\\sigma_{ws}}{\\phi F_y}\\right)\\le1;\\quad\\sigma_{ws}=\\frac{BW_{no}}{C_w},\\;B=Ta\\tanh\\frac{z}{a}',
   `Each girder's longitudinal force reaches its locating column at the bracket seat, ${format(t.offset,'length',u,3)} from the column centerline at the girder web, while the strut and rods hold the column at its centerline: torque T = ${fm(t.T)} at the seat (${t.case.id}, support x=${format(t.station,'length',u,3)}). ${t.model==='warping-free'?`Twist held at the base, free top, no warping restraint relied on at the base (AISC Design Guide 9): the torque below the seat is pure Saint-Venant torsion, which satisfies equilibrium with no bimoment (a lower-bound solution, so the base needs no warping design); no warping stress enters H1. Flange shear from the largest torque, T t_f/J: ${fs(t.shear)} against ${fs(t.shearCapacity)} (H3.3).`:`Fixed base restrained against warping, free top (AISC Design Guide 9), a = ${format(t.a,'length',u,3)}: warping stress ${fs(t.stress)} at the base flange tips, added to H1 at first yield as flange lateral bending; the base plate, its flange welds and the anchor rods are designed for the matching bimoment (New column base). Flange shear from the largest torque, Saint-Venant and warping parts bounded separately: ${fs(t.shear)} against ${fs(t.shearCapacity)} (H3.3).`} Twist at the seat under the largest (factored) torque ${t.twist.toFixed(4)} rad, moving the girder bearing ${format(t.slip,'length',u,3)} along the runway (for information; a column cap or a girder-line collector removes it).`,t.case.id);
 }
 if(r.support)for(const v of checks){if(['column-axial','column-flexure-y','column-interaction'].includes(v.id))v.referenceIds=[...v.referenceIds,'tr13-supporting','tr13-column-path'];if(v.id==='column-drift')v.referenceIds=[...v.referenceIds,'tr13-service'];}
 for(const v of checks)if(v.id.startsWith('column-seismic-'))v.referenceIds=v.id==='column-seismic-basis'||!r.seismic||r.seismic.basis.integrityOnly?['asce-12','aisc-e']:['asce-12','aisc-341','aisc-e'];
 if(!c.isNew)checks.push(...existingWeldingChecks(p,existingColumnSection(p).section.tf));
 if(c.longitudinal==='bracing'&&!p.longitudinalBracing?.enabled)checks.push({id:'column-longitudinal',group:label,title:'Crane longitudinal force · bracing path',status:'excluded',equation:'',note:'The runway longitudinal force is assigned to building bracing, not to this column. Design the crane-level strut, bracing bay and its foundation for the reported longitudinal force.',referenceIds:refs});
 return checks;
}

/**
 * Existing-column checks from the structural review (B7–B11, D33, C21): the longitudinal force path through the
 * column, the frame type, TR-13 §5.3 drift under the 10-year wind and the rail gauge under gravity, the seismic
 * mass the runway adds to the building and the evaluation of its existing lateral system.
 */
function columnSupportChecks(p:ProjectInput,r:ExistingColumnResult,label:string,refs:string[]):CheckResult[]{
 const c=p.existingColumn!,z=r.support!,u=p.units,out:CheckResult[]=[],len=(v:number)=>format(v,'length',u,3),force=(v:number)=>format(v,'force',u,3),moment=(v:number)=>format(v,'moment',u,3);
 const lrfd=p.method==='LRFD',seat=z.seat.filter(v=>v.moment>0),seatMax=seat.reduce((a,v)=>v.moment>a.moment?v:a,{grid:0,moment:0,case:''});
 const exitText={'girder-strut':`a crane-level strut on the girder line, at least ${z.strut?.ratio??10} times the column's own stiffness there${z.strut?` (k_s ≥ ${format(z.strut.required,'stiffness',u,3)})`:''}: the column keeps at most 1/${z.strut?Math.round(1/z.strut.share):11} of the force, checked as weak-axis bending and torsion`,'column-strut':'a crane-level strut at the column centerline: no weak-axis bending from it, torsion from the girder offset','eave-strut':'the eave strut at the column top: weak-axis bending from the seat to the top, and torsion from the girder offset'}[z.exit];
 if(c.longitudinal==='bracing')out.push({id:'column-longitudinal-path',group:label,title:`${label} · longitudinal force path and seat moment (weak axis)`,status:z.exitEntered?'pass':'unverified',equation:'M_{ry}=\\max_z|M_s\\,m_M(z)+F\\,m_F(z)|',referenceIds:['tr13-column-path',...refs],
  note:`${z.exitEntered?'The':'Not given; assumed: the'} crane longitudinal force leaves the column through ${exitText}. ${z.exitEntered?'':'Enter where it leaves (crane-level strut on the girder line or at the column, or the eave strut). '}Longitudinal force at each locating seat (grids ${z.traction?locatingLabel(p):'none'}): traction ${force(z.traction)} unfactored (${lrfd?'1.6':'1.0'} in the combinations with L)${z.bumper?`; crane stop ${force(z.bumper)} at grid${z.bumperGrids.length>1?'s':''} ${z.bumperGrids.join(', ')} (TR-13 ${lrfd?'1.2(D + Cds) + Cvs + 1.0Cbs':'D + Cds + Cvs + 0.67Cbs'})`:''}. Seat moment of the girder reactions about the haunch web (one girder end loaded by the crane at a time, so unbalanced at shared grids): ${seatMax.grid?`largest ${moment(seatMax.moment)} at grid ${seatMax.grid} under ${seatMax.case}; ${seat.map(v=>`grid ${v.grid} ${moment(v.moment)}`).join(', ')}`:'none (no bracket seat)'}. Both act as weak-axis loads at the seat, ${len(c.seatElevation)} above the base (${c.weak.base} base, ${c.weak.top} top), with B1 on the weak axis, and enter AISC H1.`});
 // B9: frame type and sway amplification.
 const f=z.frame;
 out.push({id:'column-frame',group:label,title:`${label} · frame type and second-order effects`,status:!f.entered?'unverified':f.type==='sway'&&f.B2===undefined?'unverified':'pass',equation:f.type==='sway'?'M_r=B_1M_{nt}+B_2M_{lt}':'M_r=B_1M_{nt}',referenceIds:refs,
  note:!f.entered?`Frame type not given: the column is checked as part of a braced (non-sway) frame with B1 only, ${c.strong.base} base and ${c.strong.top} top across the runway. If the column line is a sway (portal) frame the check is provisional: enter the frame type and the frame's B2 (AISC Appendix 8) from its analysis.`
   :f.type==='braced'?`Braced (non-sway) frame: B1 amplification only. ${c.frame?.source??''}`
   :f.B2===undefined?'Sway (portal) frame without the frame\'s B2: the column check is PROVISIONAL. Enter B2 from the frame analysis (AISC Appendix 8), or check the column with a second-order frame analysis.'
   :`Sway (portal) frame: B2 = ${f.B2.toFixed(3)} from the frame analysis on the lateral moments (crane side thrust, W, E), B1 on the gravity moments (AISC Appendix 8). ${c.frame?.source??''}`});
 // B10: TR-13 §5.3 drift under the 10-year wind and rail gauge under gravity.
 const sv=c.service;
 if(z.wind10!==undefined)out.push({id:'column-drift-wind',group:label,title:`${label} · drift under the 10-year wind (TR-13 §5.3)`,demand:z.wind10,capacity:z.driftLimit,quantity:'length',utilization:z.wind10/z.driftLimit,status:z.wind10<=z.driftLimit*(1+1e-9)?'pass':'fail',equation:'\\Delta\\le\\min(H/400,\\;2\\,\\mathrm{in})\\ \\ \\text{(10-yr wind)}',substitution:`\\frac{${latexNumber(z.wind10)}}{${latexNumber(z.driftLimit)}}=${(z.wind10/z.driftLimit).toFixed(4)}`,referenceIds:['tr13-service',...refs],note:`Frame displacement at the top of the crane girder under the 10-year wind, from the frame analysis (${sv?.source||'source not stated'}); H = ${len(z.girderTop)}.`});
 else out.push({id:'column-drift-wind',group:label,title:`${label} · drift under the 10-year wind (TR-13 §5.3)`,status:'unverified',equation:'\\Delta\\le\\min(H/400,\\;2\\,\\mathrm{in})\\ \\ \\text{(10-yr wind)}',referenceIds:['tr13-service',...refs],note:`Not established: enter the frame displacement at the top of the crane girder under the 10-year wind from the frame analysis. Limit ${len(z.driftLimit)} (H/400 or 2 in, H = ${len(z.girderTop)}).`});
 const g=z.gauge,plus=25.4,minus=12.7,limit=g.total>=0?plus:minus,haveFrame=g.frame!==undefined;
 out.push({id:'column-rail-gauge',group:label,title:`${label} · rail gauge change under gravity (TR-13 §5.3)`,demand:Math.abs(g.total),capacity:limit,quantity:'length',utilization:Math.abs(g.total)/limit,status:!haveFrame?'unverified':Math.abs(g.total)<=limit*(1+1e-9)?'pass':'fail',equation:'-\\tfrac12\\,\\mathrm{in}\\le\\Delta_g\\le+1\\,\\mathrm{in}',substitution:`\\frac{${latexNumber(Math.abs(g.total))}}{${latexNumber(limit)}}=${(Math.abs(g.total)/limit).toFixed(4)}`,referenceIds:['tr13-service',...refs],
  note:`Gauge change ${g.total>=0?'+':'−'}${len(Math.abs(g.total))} (positive opens): runway dead load and the static crane on the bracket, column alone, both runways alike: ${g.crane>=0?'+':'−'}${len(Math.abs(g.crane))}${haveFrame?`; building frame under its dead load and ${g.snowFactor===.5?'50%':'75%'} of the roof snow (TR-13: snow of 30 psf or less reduced 50%, more 25%, for this check only), both columns: ${g.frame!>=0?'+':'−'}${len(Math.abs(g.frame!))} (${sv?.source||'frame analysis'})`:'. The building frame\'s spread under its dead load and roof snow is not given: provide the outward rail displacement under D and under full roof snow, and the roof snow pressure, from the frame analysis'}. Limits +1 in / −1/2 in.`});
 return out;
}
const locatingLabel=(p:ProjectInput)=>(p.system==='continuous'?p.spans.map((_,i)=>i+1).concat([p.spans.length+1]):p.spans.map((_,i)=>i+1)).join(', ');

/**
 * Seismic of a runway added to an existing building (review B11): the TR-13 seismic combinations on the runway when
 * site seismic data is given, and the mass added to the building with the evaluation of its existing lateral system
 * under the building code's alteration provisions (IEBC 10% demand-capacity ratio test).
 */
function buildingSeismicChecks(p:ProjectInput):CheckResult[]{
 const c=p.existingColumn!,u=p.units,G='Building seismic',site=runwaySiteSeismic(p),force=(v:number)=>format(v,'force',u,3),out:CheckResult[]=[];
 const m=site?.mass??runwayMass(p,!!c.siteSeismic?.liftedLoadSecured);
 out.push(site?{id:'building-seismic-runway',group:G,title:'Runway seismic · TR-13 combinations 5a and 7a',status:site.input.source.trim()?'pass':'unverified',equation:'C_s=\\frac{S_{DS}I_e}{R}\\ge0.044S_{DS}I_e\\ge0.01',referenceIds:['tr13-supporting','asce-12'],
   note:`SDC ${site.input.sdc}, SDS = ${site.input.SDS}, Ie = ${site.input.Ie}, existing lateral system R = ${site.input.R}: Cs = ${site.Cs.toFixed(4)}. TR-13 ${p.method==='LRFD'?'5a 1.2D + 1.2Cdm + 1.0E + Cvs + L (+0.2S on the building) and 7a 0.9D + Cdm + 1.0E':'5a and 7a with 0.7E'} are added to the girder, bearing, tie and bracket checks and to the column (with the runway's own seismic force across the runway at the column). One crane per aisle; its seismic force on this runway is Cs times its wheel loads here${site.input.liftedLoadSecured?' including the rigidly secured lifted load':' (the lifted load is not a seismic mass: it is not rigidly secured)'}, along the runway capped by wheel friction μ = ${site.input.friction} (${site.along<site.Cs?'cap governs':'Cs governs'}); the girder line's own mass along the runway goes to its locating bearing. ${site.input.source.trim()?`Source: ${site.input.source}.`:'Enter the source of the site seismic data.'}`}
  :c.siteSeismic&&!c.siteSeismic.enabled&&c.siteSeismic.source.trim()?{id:'building-seismic-runway',group:G,title:'Runway seismic · TR-13 combinations 5a and 7a',status:'pass',equation:'',referenceIds:['tr13-supporting','asce-12'],
   note:`Recorded that seismic design of the runway is not required at this site: ${c.siteSeismic.source}. TR-13 seismic combinations 5a and 7a are not applied; the existing column takes the given building E effects.`}
  :{id:'building-seismic-runway',group:G,title:'Runway seismic · TR-13 combinations 5a and 7a',status:'unverified',equation:'',referenceIds:['tr13-supporting','asce-12'],
   note:`Site seismic data not given: TR-13 seismic combinations 5a (1.2D + 1.2Cdm + 1.0E + Cvs + L + 0.2S) and 7a (0.9D + Cdm + 1.0E) are not applied to the girder, bearing, tie and bracket checks. The existing column takes the given building E effects only. Provide SDS, the seismic design category, Ie and the existing lateral system's R with their source, or record that seismic design is not required at this site.`});
 const a=c.siteSeismic?.alteration;
 out.push({id:'building-seismic-alteration',group:G,title:'Existing lateral system · alteration evaluation (IEBC)',status:!a?'unverified':a.dcrIncrease<=.1+1e-9?'pass':'fail',...(a?{demand:a.dcrIncrease,capacity:.1,quantity:'ratio' as const,utilization:a.dcrIncrease/.1}:{}),equation:'\\frac{(\\text{D/C})_{\\text{altered}}}{(\\text{D/C})_{\\text{existing}}}-1\\le0.10',referenceIds:['iebc-alteration'],
  note:`The runway adds ${force(m.total)} of seismic weight to the building: ${force(m.runways)} of girders, rails and runway dead load for the two runways (taken identical to this one), the crane ${force(m.crane)} (one per aisle, bridge and trolley)${m.lifted?` and the secured lifted load ${force(m.lifted)}`:''}. The existing lateral force-resisting system must be evaluated under the building code's alteration provisions (IEBC §503.4 / §805.3: an existing lateral element may remain unaltered where its demand-capacity ratio with the alteration is not more than 10% greater than without it; VERIFY against the adopted edition). ${a?`Recorded evaluation: largest increase ${(100*a.dcrIncrease).toFixed(1)}%${a.dcrIncrease>.1?' — exceeds 10%: those elements must comply with the current wind and seismic provisions':''}. ${a.source}`:'No evaluation given: provide the largest demand-capacity ratio increase of the existing lateral elements with its source.'}`});
 return out;
}
