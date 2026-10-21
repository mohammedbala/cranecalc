/**
 * Local checks at the step of an existing stepped column (configurator support 'stepped-column', WP-2): the girder
 * reaction bearing on the step cap over the lower shaft's crane-side flange, and the upper shaft's flanges landing on the
 * cap, the inner one over the lower shaft's web.
 *
 * AISC 360-16: J7 bearing (1.8F_yA_pb, φ = 0.75) of the girder bearing plate and of the upper-shaft flanges on the cap;
 * the reaction into the lower crane-side flange end as J10.2 / J10.3 with the flange as the loaded plate and the cap as
 * its "flange" (a 2.5:1 dispersion through the cap); the cap plate cantilevering across the runway past the flange under
 * the girder flange (plastic flexure, φ = 0.90); J10.2 / J10.3 on the lower web under the upper inner-flange force
 * P_u/2 + |M_u|/(d_u − t_fu); J10.6 panel shear of the lower web spanning between its flanges as the step's deep beam; a
 * step stiffener pair under the inner flange per J10.8 (columnStiffeners.ts stiffenerPairStrength: a column with a 12t_w
 * web strip, K = 0.75), with no unstiffened web strength credited where one is provided. The analogies (the cap as the
 * loaded flange, the deep-beam panel) are mechanics models of the AISC Design Guide 7 step detail; their clause mapping
 * is not verified against the printed Guide (reference 'dg7-columns', partial). Canonical units N, mm, MPa.
 */
import {available} from './aiscStrength';
import {filletMinimum} from './connectionStrength';
import {categoryF,fatigueThresholdKsi,finiteLife,KSI} from './fatigueConstants';
import {capAngleGeometry} from './capAngle';
import {stiffenerPairStrength,type ColumnStiffenerGeometry} from './columnStiffeners';
import {independentBearings} from './simpleSupports';
import {latexNumber} from './math';
import {format} from './units';
import type {CheckResult,ProjectInput} from './types';
import type {StepGeometry} from './steppedColumn';

const inch=25.4;
/** A factored step action and the combination (and support) it comes from. */
export interface StepPeak {value:number;caseId:string}
export interface StepActions {
 /** Largest factored girder reaction on the step (the grid total, all of it on one bearing). */
 reaction:StepPeak;
 /** Largest factored compression of the upper shaft's inner flange on the cap, P_u/2 + |M_u|/(d_u − t_fu), with its parts. */
 flange:StepPeak&{P:number;M:number;Pl:number};
 /** Range of the inner-flange force per crane passage (unfactored crane, no impact), for the stiffener weld fatigue. */
 range:number;
 /** Range of the girder reaction on the step per crane passage (unfactored crane, no impact), for the step fatigue checks. */
 reactionRange?:number;
 /** Largest factored girder reaction at each support (grid), for the cap flexure over the bearings at that grid. */
 bySupport?:{station:number;value:number;caseId:string}[];
}
/** Corner clip of a step stiffener at the cap, clear of the existing cap-to-web fillet (3/4 in, the fillet taken as at most 5/8 in). */
export const stepStiffenerClip=.75*inch;
/** Height of a step stiffener below the cap: half the lower shaft depth (J10.8(3): at least half the depth). */
export const stepStiffenerHeight=(g:StepGeometry)=>g.lower.d/2;
/** Lever arm of the upper shaft's flange forces: d_u − t_fu. */
export const upperFlangeArm=(g:StepGeometry)=>g.upper.d-g.upper.tf;
/** Inner-flange compression of the upper shaft on the cap from its axial force and moment at the step. */
export const innerFlangeForce=(g:StepGeometry,P:number,M:number)=>P/2+Math.abs(M)/upperFlangeArm(g);

/**
 * The step's deep beam: the lower web spanning between the lower flange centerlines (s = d_l − t_fl) carries the inner
 * flange force F at x = innerFlange to the two flanges; the larger end shear is F·max(a, b)/s.
 */
export function stepPanel(g:StepGeometry,F:number){
 const s=g.lower.d-g.lower.tf,left=-s/2,a=Math.min(s,Math.max(0,g.innerFlange-left)),b=s-a;
 return {span:s,a,b,shear:F*Math.max(a,b)/s,height:s};
}
/** Unstiffened J10.2 / J10.3 strength of the lower web under the inner flange (end-region expressions, cap as the loaded flange). */
export function stepWebStrength(p:ProjectInput,g:StepGeometry){
 const c=p.existingColumn!,s=g.cap,E=p.section.E,tw=g.lower.tw,lb=g.upper.tf,k=s.thickness;
 const yielding=available(c.Fy*tw*(2.5*k+lb),p.method,1,1.5);
 // J10.3 end expression with the (l_b/d) term neglected: the web has no finite depth along the load (conservative).
 const crippling=available(.4*tw**2*Math.sqrt(E*c.Fy*k/tw),p.method,.75,2);
 return {yielding,crippling,lb,k};
}
/** The step stiffener pair as columnStiffeners.ts models a pair: t, width, contact beyond the clip, length, the web. */
function stiffenerGeometry(g:StepGeometry):ColumnStiffenerGeometry{
 const s=g.stiffener!,h=stepStiffenerHeight(g);
 return {t:s.thickness,width:s.width,tw:g.lower.tw,contact:s.width-stepStiffenerClip,length:h} as unknown as ColumnStiffenerGeometry;
}

/** The step checks, and whether the unstiffened lower web needs a stiffener (J10.2 or J10.3 exceeded). */
export function stepSeatChecks(p:ProjectInput,g:StepGeometry,x:StepActions):{checks:CheckResult[];stiffenerRequired:boolean;panelShear:number}{
 const c=p.existingColumn!,d=p.details,u=p.units,E=p.section.E,checks:CheckResult[]=[],refs=['dg7-columns','aisc-j','existing-column'];
 const L=(v:number)=>format(v,'length',u,3),F=(v:number)=>format(v,'force',u,3),S=(v:number)=>format(v,'stress',u,3),Mf=(v:number)=>format(v,'moment',u,3);
 const add=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,caseId?:string,status?:CheckResult['status'])=>{
  const ok=Number.isFinite(demand)&&capacity>0&&demand<=capacity*(1+1e-9);
  checks.push({id,group:'Stepped column',title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:status??(ok?'pass':'fail'),equation,
   substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,caseId,referenceIds:refs});
 };
 const cap=g.cap,R=x.reaction,Fin=x.flange,Fyc=c.Fy;
 // J7 bearing: the girder bearing plate on the cap (its overlap with the cap), and the upper flanges on the cap.
 const N=d?.bearing.length??254,w=d?.bearing.width??g.lower.bf,Fyb=Math.min(Fyc,d?.material.Fy??Fyc);
 const overX=Math.max(0,Math.min(g.girderWeb+w/2,cap.width/2)-Math.max(g.girderWeb-w/2,-cap.width/2)),overY=Math.min(N,cap.length/2);
 const Apb=overX*overY,bearing=available(1.8*Fyb*Apb,p.method,.75,2);
 const Af=g.upper.tf*Math.min(g.upper.bf,cap.length),flangeBearing=available(1.8*Math.min(Fyc,p.existingColumn!.step!.upper.Fy)*Af,p.method,.75,2);
 const jb=Math.max(R.value/bearing,Fin.value/flangeBearing);
 add('step-bearing','Step cap · bearing of the girder and the upper-shaft flanges (J7)',jb,1,'ratio','R_u\\le\\phi1.8F_yA_{pb};\\quad F_f\\le\\phi1.8F_yt_{fu}b_{fu}',
  `Girder bearing plate ${L(w)} × ${L(N)} on the existing step cap PL ${L(cap.thickness)} × ${L(cap.width)} × ${L(cap.length)} (survey; field drilled, shimmed): bearing on the overlap ${L(overX)} × ${L(overY)} (half the cap length per girder end), F_y = ${S(Fyb)} (the lesser of the plate and the cap, the cap taken as the lower shaft's steel), φR_n = ${F(bearing)} against the whole factored grid reaction ${F(R.value)} on one bearing (${R.caseId}; conservative at a shared grid). Upper-shaft flange ${L(g.upper.tf)} × ${L(Math.min(g.upper.bf,cap.length))} on the cap: φR_n = ${F(flangeBearing)} against the inner-flange force ${F(Fin.value)} (${Fin.caseId}); the outer flange stands over the lower outer flange (flush) and bears flange to flange. Contact surfaces milled or shimmed to full bearing (survey).`,R.caseId);
 // The reaction into the lower crane-side flange end through the cap (2.5:1 dispersion), J10.2 / J10.3 by analogy.
 const along=Math.max(0,...independentBearings(p).map(b=>Math.abs(b.center-b.station)),0),k=cap.thickness;
 const y0=along-N/2-2.5*k,y1=along+N/2+2.5*k,lbe=Math.max(0,Math.min(y1,g.lower.bf/2)-Math.max(y0,-g.lower.bf/2));
 const fy=available(Fyc*g.lower.tf*lbe,p.method,1,1.5),fc=available(.8*g.lower.tf**2*Math.sqrt(E*Fyc*k/g.lower.tf),p.method,.75,2),fcap=Math.min(fy,fc);
 add('step-flange-yielding','Lower crane-side flange · local yielding and crippling under the girder reaction',R.value,fcap,'force','R_n=F_yt_{fl}(l_b+5t_c)\\ \\text{(J10.2)};\\quad R_n=0.80t_{fl}^2\\sqrt{EF_yt_c/t_{fl}}\\ \\text{(J10.3)}',
  `The girder web stands over the lower shaft's crane-side flange (girder web ${L(g.girderWeb)} from the lower centroid): the reaction enters the flange end through the cap, the flange as the loaded plate and the cap as its flange (k = t_c = ${L(k)}). Effective length along the flange ${L(lbe)} (the bearing ${L(N)}, centered ${L(along)} from the column centerline, plus 2.5t_c each side, within the flange width ${L(g.lower.bf)}): yielding φR_n = ${F(fy)}, crippling (interior form, l_b/d term neglected) φR_n = ${F(fc)}. The whole grid reaction on one bearing (${R.caseId}). Mechanics analogy of J10.2/J10.3 (DG7 step detail, clause mapping not verified).`,R.caseId);
 // Cap plate flexure: the reaction spread over the girder flange width, cantilevering from the lower flange faces.
 // Each grid's reaction over the length of cap its bearings cover: both plates and the joint gap at a shared simple-span
 // grid (the grid total), one plate at a runway end or under a continuous girder.
 const bg=p.section.bf,a=Math.max(0,(Math.min(bg,w)-g.lower.tf)/2),bearings=independentBearings(p);
 const grids=(x.bySupport?.length?x.bySupport:[{station:NaN,value:R.value,caseId:R.caseId}]).map(v=>{
  const at=bearings.filter(b=>Math.abs(b.station-v.station)<1),extent=at.length?Math.max(...at.map(b=>b.finish))-Math.min(...at.map(b=>b.start)):N;
  const l=Math.min(extent,cap.length),Mreq=v.value/Math.min(bg,w)*a*a/2,Mcap=available(Fyc*l*k**2/4,p.method,.9,1.67);
  return {...v,l,plates:Math.max(1,at.length),Mreq,Mcap};}).reduce((x0,v)=>v.Mreq/v.Mcap>x0.Mreq/x0.Mcap?v:x0);
 const {Mreq,Mcap}=grids;
 add('step-cap-flexure','Step cap · flexure across the runway past the lower flange',Mreq,Mcap,'moment','M_u=\\frac{R_u}{b}\\frac{a^2}{2}\\le\\phi F_y\\frac{l\\,t_c^2}{4};\\quad a=\\frac{b-t_{fl}}{2}',
  `The girder reaction spread uniformly over the bearing width b = min(girder flange, bearing plate) = ${L(Math.min(bg,w))} across the runway, the cap cantilevering a = ${L(a)} each side of the lower flange (${L(g.lower.tf)}) over the length l of cap its bearings cover at the governing grid, ${grids.plates>1?`both bearing plates and the joint gap with the grid's total reaction`:'one bearing plate with that girder end\'s reaction'}: R_u = ${F(grids.value)} (${grids.caseId}), l = ${L(grids.l)}, M_u = ${Mf(Mreq)} against the cap's plastic strength φF_y l t_c²/4 = ${Mf(Mcap)} (cap alone; the bearing plate above it is not credited, conservative).`,grids.caseId);
 // J10.2 / J10.3 on the lower web under the inner flange.
 const web=stepWebStrength(p,g),stiff=g.stiffener,required=Fin.value>Math.min(web.yielding,web.crippling)*(1+1e-9);
 const flangeText=`Inner flange of the upper shaft at ${L(g.innerFlange)} from the lower centroid, over the lower web (t_w = ${L(g.lower.tw)}): F = P_u/2 + |M_u|/(d_u − t_fu) = ${F(Fin.P)}/2 + ${Mf(Math.abs(Fin.M))}/${L(upperFlangeArm(g))} = ${F(Fin.value)} (${Fin.caseId}; M_u the amplified upper-shaft moment at the step with the existing upper effects signed).`;
 const info=stiff?{status:'not-applicable' as const,prefix:'Unstiffened, for information (the step stiffener pair carries the whole force, J10.8): '}:{status:undefined,prefix:''};
 add('step-web-yielding','Lower web · local yielding under the upper inner flange (J10.2)',Fin.value,web.yielding,'force','R_n=F_yt_w(2.5k+l_b)\\ \\text{(J10-3)}',
  `${info.prefix}${flangeText} End-region expression at the shaft top with k = t_c = ${L(web.k)} (the cap as the loaded flange) and l_b = t_fu = ${L(web.lb)}: φR_n = ${F(web.yielding)}.`,Fin.caseId,info.status);
 add('step-web-crippling','Lower web · crippling under the upper inner flange (J10.3)',Fin.value,web.crippling,'force','R_n=0.40t_w^2\\sqrt{\\frac{EF_{yw}t_c}{t_w}}\\ \\text{(J10-5a, }l_b/d\\to0)',
  `${info.prefix}${flangeText} End-region expression with the cap as the flange and the (l_b/d) term neglected (conservative): φR_n = ${F(web.crippling)}.`,Fin.caseId,info.status);
 checks.push({id:'step-web-sidesway',group:'Stepped column',title:'Lower web · sidesway web buckling (J10.4)',status:'not-applicable',equation:'',referenceIds:refs,
  note:'J10.4 applies to a flange-loaded member whose loaded and opposite flanges can move laterally relative to each other at the load. The lower web at the step is held along both edges by the lower shaft flanges and loaded at its top edge by the cap: there is no opposite flange free to sway, so J10.4 does not apply.'});
 // J10.6 panel shear of the step's deep beam, reduced for the lower shaft's axial load (J10-10).
 const panel=stepPanel(g,Fin.value),Py=c.Fy*(2*g.lower.bf*g.lower.tf+(g.lower.d-2*g.lower.tf)*g.lower.tw),alpha=p.method==='LRFD'?1:1.6,ratioP=alpha*Math.max(0,Fin.Pl)/Py;
 const Vn=.6*c.Fy*panel.height*g.lower.tw*(ratioP<=.4?1:Math.max(0,1.4-ratioP)),Vc=available(Vn,p.method,.9,1.67);
 add('step-panel-shear','Lower web panel at the step · shear (J10.6)',panel.shear,Vc,'force','V=F\\frac{\\max(a,b)}{s};\\quad R_v=0.60F_yd_ct_w\\left(1.4-\\frac{\\alpha P_r}{P_y}\\right)\\le0.60F_yd_ct_w',
  `The lower web spans between the lower flange centerlines (s = ${L(panel.span)}) as the step's deep beam and carries the inner-flange force ${F(Fin.value)} at a = ${L(panel.a)}, b = ${L(panel.b)} to the flanges: V = ${F(panel.shear)}. Panel ${L(panel.height)} deep (a square panel, the force spreading at 45°), αP_r/P_y = ${ratioP.toFixed(3)} with the lower shaft's axial force ${F(Fin.Pl)} (J10-9 / J10-10). Deep-beam model of the DG7 step detail (clause mapping not verified).${stiff?' The stiffener pair bounds the panel but adds no shear strength.':''}`,Fin.caseId);
 checks.push(...stepFatigueChecks(p,g,x,lbe,web));
 if(!stiff){
  checks.push({id:'step-stiffener-required',group:'Stepped column',title:'Step stiffener · J10.8',status:required?'fail':'pass',equation:'R_u>\\phi R_n\\ \\text{(J10.2, J10.3)}\\Rightarrow\\text{stiffeners}',caseId:Fin.caseId,referenceIds:refs,
   note:required?`The inner-flange force ${F(Fin.value)} exceeds the unstiffened lower web (J10.2 ${F(web.yielding)}, J10.3 ${F(web.crippling)}): add a step stiffener pair under the inner flange (J10.8), or a heavier step.`:`Not required: the unstiffened lower web carries the inner-flange force ${F(Fin.value)} (J10.2 ${F(web.yielding)}, J10.3 ${F(web.crippling)}).`});
  return {checks,stiffenerRequired:required,panelShear:panel.shear};
 }
 // The stiffener pair: the whole inner-flange force, no unstiffened web credited.
 const sg=stiffenerGeometry(g),m=d?.material??{Fy:345,Fu:448,Fexx:482.6},pair=stiffenerPairStrength(sg,m.Fy,E,p.method,true),h=stepStiffenerHeight(g),Lw=h-stepStiffenerClip;
 checks.push({id:'step-stiffener-required',group:'Stepped column',title:'Step stiffener · J10.8',status:'pass',equation:'R_u>\\phi R_n\\ \\text{(J10.2, J10.3)}\\Rightarrow\\text{stiffeners}',caseId:Fin.caseId,referenceIds:refs,
  note:`${required?'Required':'Provided (not required by J10.2/J10.3)'}: a pair of ${L(stiff.thickness)} × ${L(stiff.width)} plates, ${L(h)} deep (half the lower shaft depth), one each side of the lower web under the inner flange, fitted to bear on the cap and fillet welded ${L(stiff.weld)} both faces to the web (field welds to existing steel); the pair carries the whole inner-flange force.`});
 const contact=2*sg.contact*stiff.thickness,bearingCap=available(1.8*m.Fy*contact,p.method,.75,2);
 add('step-stiffener-bearing','Step stiffeners · fitted bearing on the cap (J7)',Fin.value,bearingCap,'force','R_n=1.8F_yA_{pb}',`Fitted bearing of both plates under the cap beyond the ${L(stepStiffenerClip)} clips: A_pb = 2(b_s − c)t_s = ${format(contact,'area',u,3)}, φR_n = ${F(bearingCap)} against ${F(Fin.value)} (${Fin.caseId}).`,Fin.caseId);
 add('step-stiffener-column','Step stiffeners · compression as a column (J10.8, J4.4 / E3)',Fin.value,pair.column,'force','P_n=F_{cr}A;\\ \\ A=2b_st_s+12t_w^2,\\ L_c=0.75h',
  `The pair with a 12t_w web strip (${L(pair.strip)}; the cap is the shaft top), L_c = 0.75 × ${L(h)} = ${L(pair.KL)}, L_c/r = ${pair.slender.toFixed(1)} (${pair.slender<=25?'J4.4':'Chapter E'}): φP_n = ${F(pair.column)} against ${F(Fin.value)}.`,Fin.caseId);
 const phiW=available(.6*m.Fexx,p.method,.75,2),fw=Fin.value/2/(2*stiff.weld/Math.SQRT2*Lw),webBase=Math.min(available(.6*c.Fy,p.method,1,1.5),available(.6*c.Fu,p.method,.75,2)),fv=Fin.value/2/(Lw*g.lower.tw),wMin=filletMinimum([stiff.thickness,g.lower.tw]);
 add('step-stiffener-weld','Step stiffener fillets to the lower web (J10.8, J2.4, J4.2)',Math.max(fw/phiW,fv/webBase,wMin/stiff.weld,4*stiff.weld/Lw),1,'ratio','f_w=\\frac{F/2}{2(0.707w)L_w}\\le\\phi0.6F_{EXX};\\ f_v=\\frac{F/2}{L_wt_w}\\le\\phi0.6F_y;\\ w\\ge w_{min};\\ L_w\\ge4w',
  `${L(stiff.weld)} fillets both faces of each plate along ${L(Lw)} of web below the clip deliver one plate's force ${F(Fin.value/2)} to the web: weld ${S(fw)} against ${S(phiW)}; web base metal ${S(fv)} against ${S(webBase)} (J4.2); minimum leg ${L(wMin)} (Table J2.4); length at least 4w. Field welds to existing steel: see the existing-steel welding checks.`,Fin.caseId);
 const bReq=g.upper.bf/3-g.lower.tw/2,fit=(g.lower.tw/2+stiff.width)/(g.lower.bf/2);
 add('step-stiffener-width','Step stiffeners · width (J10.8(1)) and fit within the flange',Math.max(bReq/stiff.width,fit),1,'ratio','b_s+\\frac{t_w}{2}\\ge\\frac{b_{fu}}{3};\\quad\\frac{t_w}{2}+b_s\\le\\frac{b_{fl}}{2}',
  `b_s = ${L(stiff.width)} against b_fu/3 − t_w/2 = ${L(bReq)} (the upper flange delivers the force); the plates reach ${L(g.lower.tw/2+stiff.width)} from the web centerline within the lower flange half width ${L(g.lower.bf/2)}.`);
 const tReq=Math.max(g.upper.tf/2,stiff.width/16,stiff.width/(.56*Math.sqrt(E/m.Fy)));
 add('step-stiffener-thickness','Step stiffeners · thickness (J10.8(2); B4.1a)',tReq,stiff.thickness,'length','t_s\\ge\\max\\left(\\frac{t_{fu}}{2},\\frac{b_s}{16},\\frac{b_s}{0.56\\sqrt{E/F_y}}\\right)',
  `t_s = ${L(stiff.thickness)} against t_fu/2 = ${L(g.upper.tf/2)}, b_s/16 = ${L(stiff.width/16)} and the compression outstand limit b_s/(0.56√(E/F_y)) = ${L(stiff.width/(.56*Math.sqrt(E/m.Fy)))}.`);
 const cycles=p.fatigue.cycles,fsr=x.range/2/(2*stiff.weld/Math.SQRT2*Lw),FSR=categoryF(cycles);
 add('step-stiffener-fatigue','Step stiffener fillets · throat fatigue (A-3.1 item 8.2)',fsr,FSR,'stress','f_{sr}=\\frac{\\Delta F/2}{2(0.707w)L_w}\\le F_{SR}\\ \\text{(Cat. F)}',
  `Range of the inner-flange force per crane passage (unfactored crane at the step, no impact): ΔF = ${F(x.range)}, half on each plate, on the throats of its two web fillets; Category F at all ${cycles.toLocaleString('en-US')} project cycles (all-cycle bound).`);
 checks.at(-1)!.referenceIds=[...refs,'aisc-fatigue'];
 // The unstiffened web checks for information only: no demand or capacity of their own (as stiffenedColumnChecks).
 const info2=checks.map(v=>{if(v.status!=='not-applicable'||v.capacity===undefined)return v;const {demand,capacity,utilization:_u,caseId:_k,substitution:_s,...rest}=v;
  return {...rest,note:`${rest.note} D/C ${((demand??0)/capacity).toFixed(2)}${(demand??0)>capacity?' (exceeded: the stiffener pair carries it)':''}.`};});
 return {checks:info2,stiffenerRequired:required,panelShear:panel.shear};
}

/**
 * Fatigue at the step of the existing column (AISC 360-16 Appendix 3, Table A-3.1; AIST TR-13 fatigue of the supporting
 * structure), at the project's all-cycle count n_SR (p.fatigue.cycles, the count the other all-cycle checks use), with the
 * unfactored crane (no impact) once per passage:
 *  - the existing fillet welds that carry the step actions, taken to carry them in full (no credit for bearing of an
 *    unfinished cap): the cap to the lower crane-side flange (the girder reaction range over the dispersion length, both
 *    faces), the upper shaft's inner flange to the cap (the inner-flange force range, both faces along b_fu) and, with no
 *    step stiffener, the cap to the lower web under it (both faces over the J10.2 end length); weld throat in shear,
 *    Category F (Eq. A-3-2). The existing leg is the surveyed existingColumn.step.capWeld; without it the required leg is
 *    reported as an open existing-structure item;
 *  - the base metal at the toes of those welds, the lower crane-side flange and (no stiffener) the lower web, the stress
 *    normal to the weld axis: Category C (transverse fillet weld toe in a loaded plate; the root is covered by the throat
 *    check above at Category F);
 *  - tie bolt holes field drilled in the upper shaft's inner flange (cap tieback angle): the upper-shaft flange stress range
 *    at the step on the net section, Category D, the lowest of the bolted-joint items of Table A-3.1 Section 2.
 * Item numbers beyond these categories are not verified against the printed table (reference 'aisc-fatigue').
 */
function stepFatigueChecks(p:ProjectInput,g:StepGeometry,x:StepActions,lbe:number,web:{lb:number;k:number}):CheckResult[]{
 const s=p.existingColumn!.step!,u=p.units,cycles=p.fatigue.cycles,out:CheckResult[]=[],refs=['aisc-fatigue','dg7-columns','existing-column'];
 const L=(v:number)=>format(v,'length',u,3),F=(v:number)=>format(v,'force',u,3),S=(v:number)=>format(v,'stress',u,3),n=cycles.toLocaleString('en-US');
 const dR=x.reactionRange??0,dF=x.range,FSRf=categoryF(cycles),FSRc=Math.max(fatigueThresholdKsi.C*KSI,finiteLife(4.4,cycles)),FSRd=Math.max(fatigueThresholdKsi.D*KSI,finiteLife(2.2,cycles));
 const stiff=!!g.stiffener,webLength=2.5*web.k+web.lb;
 // Welds: force range, total weld length (both faces), and the leg each needs at the Category F range.
 const welds=[{name:'step cap to the lower crane-side flange',force:dR,length:2*lbe},{name:'upper inner flange to the step cap',force:dF,length:2*g.upper.bf},
  ...(stiff?[]:[{name:'step cap to the lower web under the inner flange',force:dF,length:2*webLength}])].map(w=>({...w,need:w.force/(.7071*w.length*FSRf)}));
 const worst=welds.reduce((a,b)=>b.need>a.need?b:a),added=s.capWeldAdded!==undefined&&s.capWeldAdded>(s.capWeld??0),leg=added?s.capWeldAdded:s.capWeld,list=welds.map(w=>`${w.name}: ΔF = ${F(w.force)} on ${L(w.length)} of fillet, required leg ${L(w.need)}${leg?`, f_sr = ${S(w.force/(.7071*leg*w.length))}`:''}`).join('; ');
 const head=`Range per crane passage (unfactored crane at the step, no impact) at the all-cycle count n_SR = ${n}: girder reaction ΔR = ${F(dR)}, upper inner-flange force ΔF = ${F(dF)}. Existing fillet welds taken to carry the step actions in full (no bearing credit for an unfinished cap): ${list}. Category F (weld throat in shear, Eq. A-3-2): F_SR = ${S(FSRf)}.`;
 const weldCheck:CheckResult=leg?{id:'step-weld-fatigue',group:'Stepped column',title:'Step welds (existing) · throat fatigue (Category F)',status:worst.need<=leg*(1+1e-9)?'pass':'fail',demand:worst.need,capacity:leg,quantity:'length',utilization:worst.need/leg,
  equation:'f_{sr}=\\frac{\\Delta F}{0.707wL_w}\\le F_{SR}\\ \\text{(Cat. F)}\\iff w\\ge w_{req}',substitution:`\\frac{${latexNumber(worst.need)}}{${latexNumber(leg)}}=${(worst.need/leg).toFixed(4)}`,
  note:`${head} ${added?`The existing ${s.capWeld?L(s.capWeld):'(not surveyed)'} fillets built up in the field to a ${L(leg)} leg (new work, AWS D1.1 Clause 11: clean to sound metal, the new fillet fused over the full existing weld; preheat per column-weld-preheat; crane out of service, the column under dead load only)`:`Surveyed leg ${L(leg)} (${s.source})`} against the largest required leg ${L(worst.need)} (${worst.name}).${worst.need>leg?' Not adequate: build up the existing welds (field welding to existing steel) or have the engineer of record evaluate the existing step.':''}`,referenceIds:refs}
  :{id:'step-weld-fatigue',group:'Stepped column',title:'Step welds (existing) · throat fatigue (Category F): survey the weld legs',status:'unverified',demand:worst.need,quantity:'length',equation:'w\\ge w_{req}=\\frac{\\Delta F}{0.707L_wF_{SR}}',
  note:`${head} Existing-structure evaluation item: survey the step welds (existingColumn.step.capWeld) and confirm a leg of at least ${L(worst.need)}, or reinforce them.`,referenceIds:refs};
 out.push(weldCheck);
 // Base metal at the weld toes, Category C.
 const base=[{name:'lower crane-side flange at the cap weld toe',range:dR/(g.lower.tf*Math.max(lbe,1e-9))},...(stiff?[]:[{name:'lower web at the cap weld toe under the inner flange',range:dF/(g.lower.tw*webLength)}])];
 const b0=base.reduce((a,b)=>b.range>a.range?b:a);
 out.push({id:'step-base-fatigue',group:'Stepped column',title:'Lower shaft at the step · base metal fatigue at the cap weld toes (Category C)',status:b0.range<=FSRc*(1+1e-9)?'pass':'fail',demand:b0.range,capacity:FSRc,quantity:'stress',utilization:b0.range/FSRc,
  equation:'f_{sr}=\\frac{\\Delta R}{t_{fl}l_b}\\le F_{SR}\\ \\text{(Cat. C)}',substitution:`\\frac{${latexNumber(b0.range)}}{${latexNumber(FSRc)}}=${(b0.range/FSRc).toFixed(4)}`,
  note:`${base.map(v=>`${v.name}: f_sr = ${S(v.range)}`).join('; ')} (the reaction range over the flange's dispersion length ${L(lbe)}${stiff?'':`, the inner-flange force range over the web's J10.2 end length ${L(webLength)}`}). Base metal at the toe of a transverse fillet weld, the stress normal to the weld axis: Category C (Table A-3.1 Section 5; item number to be verified against the printed table), F_SR = ${S(FSRc)} at n_SR = ${n} (Eq. A-3-1, C_f = 4.4, F_TH = ${S(fatigueThresholdKsi.C*KSI)}); the weld root is covered by step-weld-fatigue at Category F, which bounds the root category.${stiff?' The step stiffener fillets: step-stiffener-fatigue.':''}`,referenceIds:refs});
 // Tie bolt holes field drilled in the upper shaft's inner flange (cap tieback angle).
 let q;try{q=capAngleGeometry(p);}catch{q=undefined;}
 const col=q?.column.receiver;
 if(q&&col){
  const hole=q.column.hole+inch/16,Afg=col.width*col.tf,Afn=(col.width-hole)*col.tf,M=dF*upperFlangeArm(g),fsr=M/upperFlangeArm(g)/Afn;
  out.push({id:'step-tie-holes-fatigue',group:'Stepped column',title:'Upper shaft flange · fatigue at the field-drilled tie bolt holes (Category D)',status:fsr<=FSRd*(1+1e-9)?'pass':'fail',demand:fsr,capacity:FSRd,quantity:'stress',utilization:fsr/FSRd,
   equation:'f_{sr}=\\frac{\\Delta M}{(d_u-t_{fu})A_{fn}}\\le F_{SR}\\ \\text{(Cat. D)}',substitution:`\\frac{${latexNumber(fsr)}}{${latexNumber(FSRd)}}=${(fsr/FSRd).toFixed(4)}`,
   note:`The upper shaft's moment range just above the step per crane passage, ΔM = ΔF(d_u − t_fu) = ${format(M,'moment',u,3)}, as the flange force range on the net flange (${L(col.width)} × ${L(col.tf)} less one ${L(hole)} hole: A_fn = ${format(Afn,'area',u,3)} of A_fg = ${format(Afg,'area',u,3)}): f_sr = ${S(fsr)}. Category D, the lowest of the bolted-joint items (Table A-3.1 Section 2, bolts not relied on for pretension): F_SR = ${S(FSRd)} at n_SR = ${n} (C_f = 2.2, F_TH = 7 ksi). Drill or ream the holes; no flame-cut holes in the existing flange.`,referenceIds:refs});
 }
 return out;
}
