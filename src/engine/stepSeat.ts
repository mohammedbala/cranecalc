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
import {categoryF} from './fatigueConstants';
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
 const bg=p.section.bf,a=Math.max(0,(Math.min(bg,w)-g.lower.tf)/2),Mreq=R.value/Math.min(bg,w)*a*a/2,Zc=overY*k**2/4,Mcap=available(Fyc*Zc,p.method,.9,1.67);
 add('step-cap-flexure','Step cap · flexure across the runway past the lower flange',Mreq,Mcap,'moment','M_u=\\frac{R_u}{b}\\frac{a^2}{2}\\le\\phi F_y\\frac{l\\,t_c^2}{4};\\quad a=\\frac{b-t_{fl}}{2}',
  `The girder reaction spread uniformly over the bearing width b = min(girder flange, bearing plate) = ${L(Math.min(bg,w))} across the runway, the cap cantilevering a = ${L(a)} each side of the lower flange (${L(g.lower.tf)}) over the bearing length l = ${L(overY)}: M_u = ${Mf(Mreq)} against the cap's plastic strength φF_y l t_c²/4 = ${Mf(Mcap)} (cap alone; the bearing plate above it is not credited). Whole grid reaction on one bearing (${R.caseId}).`,R.caseId);
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
