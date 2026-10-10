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

/** Recommended design K for the ideal end conditions (AISC 360-16 Commentary Table C-A-7.1). */
const minimumK={braced:{pinned:1,fixed:.8},free:{pinned:Infinity,fixed:2.1}} as const;

/** The bracket's surveyed receiving column governs when a bracket is enabled, then a catalogue shape, then entered plates. */
export function existingColumnSection(p:ProjectInput){
 const c=p.existingColumn!,receiver=p.details?.bracket?.enabled?p.details.bracket.receiver:undefined;
 const base:Section={...p.section,kind:'welded',name:'Existing column',catalogueId:undefined,capCatalogueId:undefined,propertySource:'Existing column plates',d:c.d,bf:c.bf,tf:c.tf,tw:c.tw,Fy:c.Fy,Fu:c.Fu};
 // A new column's bracket is welded to the catalogue shape it is designed as.
 if(receiver&&!(c.isNew&&aiscShapeByName(c.shape??'')))return {source:'bracket receiving column (surveyed plates)',section:{...base,d:receiver.depth,bf:receiver.width,tf:receiver.flangeThickness,tw:receiver.webThickness,Fy:receiver.Fy,Fu:receiver.Fu,propertySource:receiver.source||'Bracket receiving column'}};
 if(c.shape&&aiscShapeByName(c.shape)){const s=loadAiscSection({...base,kind:'rolled'},c.shape);return {source:`AISC ${c.shape}`,section:{...s,Fy:c.Fy,Fu:c.Fu}};}
 return {source:'entered plates (no fillet credit)',section:base};
}
/** Horizontal distance from the column centerline to the girder bearing. A bracket defines it from its own geometry. */
export function existingColumnEccentricity(p:ProjectInput){
 const b=p.details?.bracket;
 return b?.enabled?b.receiver.depth/2+b.reach+p.details!.bearing.width/2:p.existingColumn!.eccentricity;
}
/** Column flange unbraced length: the bracket's receiving-column value when a bracket is enabled. */
export function existingColumnUnbracedLength(p:ProjectInput){const b=p.details?.bracket;return b?.enabled?b.receiver.unbracedLength:p.existingColumn!.Lb;}
/** Rail head elevation above the column base: seat, bearing plate, girder (and cap) and rail; matches runwayElevations. */
export function existingColumnRailElevation(p:ProjectInput){return p.existingColumn!.seatElevation+(p.details?.bearing.thickness??0)+p.section.d+(p.section.kind==='cap'?p.section.capTw:0)+p.railHeight;}

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
 for(const [axis,b] of [['strong',c.strong],['weak',c.weak]] as const)add(b.base==='pinned'&&b.top==='free',`${axis}: a pinned base with a free top is unstable; brace the top or fix the base.`);
 // A new column with runway details carries the girder on its bracket and the top-flange tie at its face: it
 // must reach the tie and stop below the top of rail, clear of the crane end trucks.
 if(c.isNew&&p.details&&p.details.bracket?.enabled){
  const d=p.details,b=d.bracket!,tie=c.seatElevation+d.bearing.thickness+p.section.d-p.section.tf,rail=existingColumnRailElevation(p);
  add(c.height+1e-6<tie,`height: the new column must reach the top-flange tie, ${format(tie,'length',p.units,3)} above its base.`);
  add(c.height>rail-p.railHeight+1e-6,`height: stop the new column at or below the top of the girder, ${format(rail-p.railHeight,'length',p.units,3)} above its base, clear of the crane end trucks; a column above the rail needs the crane supplier's clearance and is not drawn here.`);
  const shape=aiscShapeByName(c.shape??''),r=b.receiver;
  if(shape)add([[r.depth,shape.d],[r.width,shape.bf],[r.flangeThickness,shape.tf],[r.webThickness,shape.tw]].some(([v,x])=>Math.abs(v-x*25.4)>.5)||Math.abs(r.Fy-c.Fy)>.01||Math.abs(r.Fu-c.Fu)>.01,`shape: the bracket's receiving column must be the new ${c.shape} (plates and material); set it under Connections.`);
 }
 const k=minimumK[c.strong.top][c.strong.base];
 add(Number.isFinite(k)&&c.Lcx+1e-6<k*c.height,`Lcx: strong-axis effective length must be at least ${k}H for the selected end conditions (AISC Commentary Table C-A-7.1).`);
 add(existingColumnUnbracedLength(p)>c.height+1e-6||c.Lcy>c.height*(c.weak.top==='free'?2.1:1)+1e-6,'Lb: unbraced lengths cannot exceed the column effective height.');
 return errors;
}

export interface ExistingColumnCombination {id:string;equation:string;P:number;Mx:number;My:number;V:number;B1x:number;B1y:number;U:number;}
export interface ExistingColumnResult {
 source:string;station:number;eccentricity:number;railElevation:number;
 crane:{dead:number;live:number;liveStatic:number;lateral:number;longitudinal:number};
 capacity:{Pc:number;Pt:number;Mcx:number;Mcy:number;Vc:number;flexure:string;webCompact:boolean};
 combinations:ExistingColumnCombination[];governing:Record<'P'|'Mx'|'My'|'V'|'U',ExistingColumnCombination>;
 /** Governing H1 ratio at every support; the result above is for the worst. */
 bySupport:{x:number;U:number}[];
 drift:{value:number;limit:number};
}
export function existingColumnAnalysis(p:ProjectInput,reactions:SupportReactionSet):ExistingColumnResult{
 const c=p.existingColumn!,{section,source}=existingColumnSection(p),props:Properties=sectionProperties(section),E=section.E;
 const longitudinal=c.longitudinal==='column'?reactions.Cls:0;
 const e=existingColumnEccentricity(p),hs=c.seatElevation,ht=existingColumnRailElevation(p);
 const rs=Math.min(ht,c.height),eccentric=columnResponse(c.height,E*props.Ix,c.strong,[{x:hs,moment:1}],[rs]),side=columnResponse(c.height,E*props.Ix,c.strong,[railForce(c.height,ht)],[hs]);
 const along=longitudinal?columnResponse(c.height,E*props.Iy,c.weak,[railForce(c.height,ht)]):undefined,alongMoment=along?Math.max(...along.samples.map(s=>Math.abs(s.moment))):0;
 // Column capacity: AISC E3/E4/E7, F2, F6 and G2 through the shared I-shape strength routine.
 const Lb=existingColumnUnbracedLength(p),member:ProjectInput={...p,section,unbracedLength:Lb,spans:[c.height],aist:{...(p.aist??emptyAistInputs),netFlangeArea:0,axialLength:c.Lcx,bottomBraceSpacing:c.Lcy,torsionalLength:c.Lcz}};
 const s=girderStrength(member,props),root=Math.sqrt(E/section.Fy);
 const webCompact=s.webRatio<=s.webLimit,flangeLimitR=root,Mp=section.Fy*props.Zx;
 // F3 flange local buckling for noncompact or slender flanges with a compact web.
 const kc=Math.min(.76,Math.max(.35,4/Math.sqrt(s.webRatio)));
 const flb=s.flangeRatio<=s.flangeLimit?Mp:s.flangeRatio<=flangeLimitR?Mp-(Mp-.7*section.Fy*props.Sx)*(s.flangeRatio-s.flangeLimit)/(flangeLimitR-s.flangeLimit):.9*E*kc*props.Sx/s.flangeRatio**2;
 const Mcx=Math.min(s.major,available(flb,p.method,.9,1.67));
 const capacity={Pc:s.compression,Pt:available(section.Fy*props.A,p.method,.9,1.67),Mcx,Mcy:s.minor,Vc:s.shear,flexure:`${s.flexureBranch}${s.flangeRatio>s.flangeLimit?' with F3 flange local buckling':''}; Cb = 1.0`,webCompact};
 const alpha=p.method==='LRFD'?1:1.6,Pex=Math.PI**2*E*props.Ix/c.Lcx**2,Pey=Math.PI**2*E*props.Iy/c.Lcy**2;
 // Every support uses the same column; the support giving the largest H1 ratio governs.
 const evaluate=(support:SupportReactionSet['supports'][number])=>{
 const dead=support.D,live=support.Cd+support.Cv+support.Ci+support.L+support.Clv,liveStatic=support.Cd+support.Cv,lateral=support.Css;
 const combinations=asceCombinations(p.method).map(k=>{
  const f=k.factors,existing=(key:'P'|'Mx'|'My'|'V',abs:boolean)=>existingLoadKeys.reduce((sum,t)=>sum+(abs?Math.abs(f[t]*c.existing[t][key]):f[t]*c.existing[t][key]),0);
  const runway=f.D*dead+f.L*live;
  // Existing moments are added to the crane peak at its governing section: conservative superposition of maxima.
  const P=existing('P',false)+runway;
  const Mx=combinedPeak(eccentric.samples,side.samples,'moment',runway*e,f.L*lateral)+existing('Mx',true);
  const V=combinedPeak(eccentric.samples,side.samples,'shear',runway*e,f.L*lateral)+existing('V',true);
  const My=f.L*longitudinal*alongMoment+existing('My',true);
  const amplify=(Pe:number)=>P<=0?1:alpha*P>=Pe?Infinity:1/(1-alpha*P/Pe),B1x=amplify(Pex),B1y=amplify(Pey);
  const ratio=P>=0?P/capacity.Pc:-P/capacity.Pt,flex=B1x*Mx/capacity.Mcx+B1y*My/capacity.Mcy;
  const U=Number.isFinite(flex)?(ratio>=.2?ratio+8/9*flex:ratio/2+flex):1e12;
  return {id:`${p.method} ${k.id}`,equation:k.equation,P,Mx:B1x*Mx,My:B1y*My,V,B1x,B1y,U};
 });
 const max=(key:'P'|'Mx'|'My'|'V'|'U')=>combinations.reduce((a,b)=>Math.abs(b[key])>Math.abs(a[key])?b:a);
 // Service drift at the rail head from one crane's side thrust and static eccentric reaction (column alone).
 const drift=Math.abs(lateral*atRail(side,c.height,ht))+Math.abs(liveStatic*e*atRail(eccentric,c.height,ht));
 return {station:support.x,crane:{dead,live,liveStatic,lateral,longitudinal},combinations,governing:{P:max('P'),Mx:max('Mx'),My:max('My'),V:max('V'),U:max('U')},drift:{value:drift,limit:ht/c.driftLimit}};
 };
 const all=reactions.supports.map(evaluate),worst=all.reduce((a,b)=>b.governing.U.U>a.governing.U.U||(b.governing.U.U===a.governing.U.U&&b.drift.value>a.drift.value)?b:a);
 return {source,eccentricity:e,railElevation:ht,capacity,...worst,bySupport:all.map(v=>({x:v.station,U:v.governing.U.U}))};
}

export function existingColumnChecks(p:ProjectInput,r:ExistingColumnResult):CheckResult[]{
 const c=p.existingColumn!,refs=['asce','aisc-e','aisc-f2','aisc-h','existing-column'],u=p.units,checks:CheckResult[]=[],label=c.isNew?'New column':'Existing column';
 const add=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,caseId?:string)=>checks.push({id:'column-'+id,group:label,title,demand,capacity,quantity,utilization:demand/capacity,status:Number.isFinite(demand)&&demand<=capacity*(1+1e-9)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(demand/capacity).toFixed(4)}`,note,caseId,referenceIds:refs});
 const g=r.governing,crane=`Support x=${format(r.station,'length',u,3)}: runway dead ${format(r.crane.dead,'force',u,3)}, crane and runway live ${format(r.crane.live,'force',u,3)} (Cd+Cv+Ci+L), side thrust ${format(r.crane.lateral,'force',u,3)}${r.crane.longitudinal?`, longitudinal ${format(r.crane.longitudinal,'force',u,3)}`:''}; eccentricity ${format(r.eccentricity,'length',u,3)}; rail head ${format(r.railElevation,'length',u,3)} above base. Crane loads are live load L (ASCE 7 §4.9).`;
 if(c.isNew)checks.push({id:'column-basis',group:label,title:'New column · section and loads',status:'pass',equation:'',note:`New ${r.source} column designed here for the crane and runway reactions only; it carries no existing building loads. Base plate, anchor rods and footing: see New column base.`,referenceIds:['existing-column']});
 else checks.push({id:'column-basis',group:label,title:`${label} · survey and existing load effects`,status:c.confirmed&&c.source.trim()?'pass':'unverified',equation:'',note:c.confirmed&&c.source.trim()?`Section: ${r.source}. Existing load effects: ${c.source}. Existing effects are entered at the column's governing section and added to the crane peaks without sign or location credit.`:'Enter the surveyed column and the existing load effects (D, L, Lr, S, R, W, E) with their source, then confirm.',referenceIds:refs});
 if(!r.capacity.webCompact)checks.push({id:'column-web',group:label,title:`${label} · web slenderness for flexure`,status:'unsupported',equation:'h/t_w\\le3.76\\sqrt{E/F_y}',note:'A noncompact or slender column web needs AISC F4/F5, which this check does not implement.',referenceIds:refs});
 add('axial',`${label} · axial compression`,Math.max(0,g.P.P),r.capacity.Pc,'force','P_n=F_{cr}A_e\\;(E3/E4/E7)',`${crane} Lcx=${format(c.Lcx,'length',u,3)}, Lcy=${format(c.Lcy,'length',u,3)}, Lcz=${format(c.Lcz,'length',u,3)}; weak-axis buckling uses the larger of Lcy and Lb.`,g.P.id);
 add('flexure',`${label} · strong-axis flexure`,Math.abs(g.Mx.Mx),r.capacity.Mcx,'moment','M_{rx}=B_1\\left(|M_{crane}|+\\sum|\\gamma_iM_{x,i}|\\right)',`${r.capacity.flexure}, Lb=${format(existingColumnUnbracedLength(p),'length',u,3)}. B1 = ${g.Mx.B1x.toFixed(3)} with Cm = 1. Strong axis: ${c.strong.base} base, ${c.strong.top} top. ${crane}`,g.Mx.id);
 if(r.crane.longitudinal||existingLoadKeys.some(k=>c.existing[k].My))add('flexure-y',`${label} · weak-axis flexure`,Math.abs(g.My.My),r.capacity.Mcy,'moment','M_{ry}=B_1\\left(|M_{long}|+\\sum|\\gamma_iM_{y,i}|\\right)',`AISC F6. Weak axis: ${c.weak.base} base, ${c.weak.top} top. Crane longitudinal force ${r.crane.longitudinal?'is resisted by this column':'is not applied to this column'}.`,g.My.id);
 add('shear',`${label} · strong-axis shear`,Math.abs(g.V.V),r.capacity.Vc,'force','V_n=0.6F_yA_wC_{v1}\\;(G2)','Crane side thrust and eccentric reaction couple plus entered existing shears.',g.V.id);
 add('interaction',`${label} · combined axial and flexure (H1)`,g.U.U,1,'ratio','\\frac{P_r}{P_c}+\\frac89\\left(\\frac{M_{rx}}{M_{cx}}+\\frac{M_{ry}}{M_{cy}}\\right)\\le1\\;\\text{or}\\;\\frac{P_r}{2P_c}+\\dots',`Governing ASCE 7 combination ${g.U.equation}: Pr=${format(g.U.P,'force',u,3)}, Mrx=${format(g.U.Mx,'moment',u,3)}, Mry=${format(g.U.My,'moment',u,3)}. ${r.combinations.length} combinations with W and E in both directions. Column-alone model: frame action, base flexibility and a direct-analysis stability check are not included; second-order effects use B1 with the entered effective lengths.`,g.U.id);
 add('drift',`${label} · runway-level lateral displacement`,r.drift.value,r.drift.limit,'length','\\Delta_{rail}\\le h_{rail}/n',`Service side thrust and static eccentric reaction of the crane, column alone (${c.strong.top} top). Limit h/${c.driftLimit}; DG7 suggests about h/240 and 2 in for cab-operated cranes and h/100 for pendant cranes. Frame and roof diaphragm flexibility are excluded.`);
 if(c.longitudinal==='bracing'&&!p.longitudinalBracing?.enabled)checks.push({id:'column-longitudinal',group:label,title:'Crane longitudinal force · bracing path',status:'excluded',equation:'',note:'The runway longitudinal force is assigned to building bracing, not to this column. Design the crane-level strut, bracing bay and its foundation for the reported longitudinal force.',referenceIds:refs});
 return checks;
}
