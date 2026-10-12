import {categoryF,damageText,finiteLife,minerEquation,minerEquivalent} from './fatigueConstants';
/**
 * Column stiffeners (continuity plates) in the receiving column at a welded column bracket: a pair of plates, one each
 * side of the column web, at each concentrated force level of the bracket. The welded twin-rib and haunched brackets
 * pull on the column flange at the seat and push at the rib (haunch root) bottom; the W stub pulls and pushes at its
 * flanges. Under a reversed (uplift) set the senses swap, so each pair is designed for tension and compression.
 *
 * AISC 360-16: J10.8 for the stiffeners (required strength R_u - phiR_n of the unstiffened J10.1-J10.4 limit states, or
 * the full force where J10.4 sidesway buckling governs, after the J10.4 Commentary; width, thickness and length
 * limits), J4.1 tension yielding, J4.4 / Chapter E compression with K = 0.75 and the J10.8 web strip, B4.1a case 1,
 * J2.2b and J2.4 fillets; J10.6 panel shear is unchanged by the stiffeners (the J10.9 doubler plate is outside this
 * design); Appendix 3 Table A-3.1 items 5.6, 5.7 and 8.2. Canonical units N, mm, MPa.
 *
 * Elevations z are from the top of the bearing seat, up positive. In plan, y runs across the column depth from the
 * column centerline toward the bracket (the loaded flange inner face at d/2 - tf) and x along the runway from the web.
 */
import {snapQuarter} from './quarterInch';
import type {ProjectInput,CheckResult} from './types';
import type {BracketInput} from './bracketInputs';
import {available} from './aiscStrength';
import {compressionResistance,filletMinimum,transverseFilletFatigue} from './connectionStrength';
import {format} from './units';
import {activeColumnStiffeners,receiverK,clipMargin,type ColumnStiffenerInput} from './columnStiffenerInputs';
import {rolledStub,isRolledBracket} from './rolledBracketInputs';
import {weldedRibBracket,haunchedBracket} from './bracketRib';
import {isTaperedHaunch,haunchGeometry} from './taperedHaunchInputs';
import {designsBracing,bracingGeometry,gussetOutlines,bracingLayout} from './newColumnBracing';
import {existingColumnSection} from './existingColumn';

const inch=25.4;
type Peak={value:number;caseId:string;x:number};
export type StiffenerLevelKey='upper'|'lower';
export interface StiffenerLevel {
 key:StiffenerLevelKey;
 /** Center elevation of the pair, its default, and the band the center must stay within (the force-delivering element). */
 z:number;base:number;band:[number,number];
 /** The bracket element that delivers the force at this level, for the J10.8 width and thickness limits. */
 plate:{width:number;thickness:number;name:string};
 name:string;
}
/** The force levels of a bracket at the column face, and how the drawings name the bracket beside the column. */
export interface BracketForceLevels {levels:Omit<StiffenerLevel,'z'>[];bracket:string}
/**
 * The two force levels of any I-shaped bracket at the column face, its flanges: `top` is the top of its top flange
 * from the seat top (up positive), `depth` its depth at the column face. Each pair centers on its flange by default
 * and must stay within the flange thickness; the flange width and thickness set the J10.8 proportions.
 */
export function flangeForceLevels(o:{top:number;depth:number;tf:number;bf:number;label:string;section:string}):Omit<StiffenerLevel,'z'>[]{
 return [{key:'upper',base:o.top-o.tf/2,band:[o.top-o.tf,o.top],plate:{width:o.bf,thickness:o.tf,name:`${o.section} top flange`},name:`${o.label} top flange`},
  {key:'lower',base:o.top-o.depth+o.tf/2,band:[o.top-o.depth,o.top-o.depth+o.tf],plate:{width:o.bf,thickness:o.tf,name:`${o.section} bottom flange`},name:`${o.label} bottom flange`}];
}
/**
 * Force levels of the brackets designed here: a W stub at its flanges (flangeForceLevels); a welded twin-rib or
 * haunched bracket at the seat and the rib (haunch root) bottom. A bracket type without them gets no stiffeners;
 * another I-shaped bracket adds its case through flangeForceLevels, and its checks pass its flange forces
 * (flangeStiffenerForces) and unstiffened J10 strengths to columnStiffenerChecks.
 */
export function bracketForceLevels(b:BracketInput,t:number):BracketForceLevels|undefined{
 if(isRolledBracket(b)){const st=rolledStub(b);return st?{bracket:`${st.name} STUB`,levels:flangeForceLevels({top:-(st.seat?.t??0),depth:st.d,tf:st.tf,bf:st.bf,label:'stub',section:st.name})}:undefined;}
 // Tapered I haunch: its top flange (the seat) and its sloping bottom flange at the column face, whose vertical cut
 // tb/cos(alpha) is the band; the flange's own thickness sets the J10.8 proportions.
 if(isTaperedHaunch(b)){
  const g=haunchGeometry(b),o={top:0,depth:g.hr,label:'haunch',section:'haunch'},lower=flangeForceLevels({...o,tf:g.tbv,bf:g.bb})[1];
  return {bracket:'TAPERED HAUNCH',levels:[flangeForceLevels({...o,tf:g.tt,bf:g.btr})[0],{...lower,plate:{...lower.plate,thickness:g.tb}}]};
 }
 if(!weldedRibBracket(b))return undefined;
 // The rib (haunch root) bottom at the column face: the pair sits on it, within the bottom sixth of the root depth
 // where the compression resultant of the root's elastic stress block lies.
 const zb=-b.seatThickness-b.ribDepth,c=b.receiver;
 return {bracket:'SEAT PL AND RIBS',levels:[{key:'upper',base:-b.seatThickness/2,band:[-b.seatThickness,0],plate:{width:Math.min(b.seatLength,c.width),thickness:b.seatThickness,name:'seat plate'},name:'seat'},
  {key:'lower',base:zb+t/2,band:[zb,zb+b.ribDepth/6],plate:{width:Math.min(c.width,b.ribSpacing+b.ribThickness),thickness:b.ribThickness,name:'ribs'},name:haunchedBracket(b)?'haunch root bottom':'rib bottom'}]};
}
/**
 * Pair forces at the two flange levels of an I-shaped bracket from each flange's resultant P (tension positive) and
 * in-plane moment M_f: twice the more loaded half-flange resultant, P + 3|M_f|/b_f in tension and -P + 3|M_f|/b_f in
 * compression; and the signed force on each plate (one half flange) for fatigue ranges.
 */
export function flangeStiffenerForces(P:[number,number],M:[number,number],bf:number){
 const bend=M.map(v=>3*Math.abs(v)/bf);
 return {upperT:Math.max(0,P[0]+bend[0]),upperC:Math.max(0,-P[0]+bend[0]),lowerT:Math.max(0,P[1]+bend[1]),lowerC:Math.max(0,-P[1]+bend[1]),
  plates:{upper:[-1,1].map(s=>P[0]/2+s*1.5*M[0]/bf),lower:[-1,1].map(s=>P[1]/2+s*1.5*M[1]/bf)}};
}
/**
 * Plate forces of a full-depth stiffener pair that carries the whole force system of a bracket flange at each level:
 * the flange force P (tension positive) shared equally, and the flange's lateral (in-plane) moment M_f as a couple
 * between the two plates, `gauge` apart (their centroids across the column web): F = P/2 ± M_f/g on the two plates.
 * upperT/upperC (lowerT/lowerC) are the largest tension and compression on one plate at that level.
 */
export function coupleStiffenerForces(P:[number,number],M:[number,number],gauge:number){
 const plates={upper:[-1,1].map(s=>P[0]/2+s*M[0]/gauge),lower:[-1,1].map(s=>P[1]/2+s*M[1]/gauge)};
 const t=(v:number[])=>Math.max(0,...v),c=(v:number[])=>Math.max(0,...v.map(x=>-x));
 return {upperT:t(plates.upper),upperC:c(plates.upper),lowerT:t(plates.lower),lowerC:c(plates.lower),plates};
}
/** Distance between the centroids of the two plates of a pair across the column web: t_w + b_s (the plates' full width; the clipped contact centroids are farther apart). */
export const stiffenerGauge=(g:{tw:number;width:number})=>g.tw+g.width;
/** Geometry of the project's column stiffeners, or undefined when none are enabled. */
export const columnStiffenerGeometry=(p:ProjectInput)=>bracketStiffenerGeometry(p.details?.bracket,p.existingColumn);
/** Geometry of a bracket's column stiffeners on its receiving column (new when the column is a new column designed here). */
export function bracketStiffenerGeometry(b:BracketInput|undefined,column?:{enabled:boolean;isNew?:boolean;shape:string}){
 const s=activeColumnStiffeners(b);if(!b||!s)return undefined;
 const c=b.receiver,tf=c.flangeThickness,tw=c.webThickness,h=c.depth-2*tf,K=receiverK(b,column);
 const full=s.length==='full';
 // Plate length across the column depth from the loaded flange inner face: to the far flange, or to the column
 // centerline so that it reaches one-half the member depth from the loaded face (J10.8(3)). Cut lengths on the 1/4 in
 // grid: down between the flanges, up to reach the half depth.
 const length=full?snapQuarter(h,'down'):snapQuarter(c.depth/2-tf,'up'),t=s.thickness,width=s.width,clip=s.clip,forces=bracketForceLevels(b,t);
 if(!forces)return undefined;
 const offset={upper:s.upperOffset??0,lower:s.lowerOffset??0};
 const fillet=K?Math.max(0,K.k-tf):undefined;
 return {s,c,tf,tw,h,full,length,t,width,clip,K,fillet,requiredClip:fillet===undefined?undefined:fillet+clipMargin,
  /** Flange contact and fillet length beyond the clip, and the web fillet length. */
  contact:width-clip,webLength:length-(full?2:1)*clip,field:!(column?.enabled&&column.isNew),rolled:isRolledBracket(b),bracket:forces.bracket,
  // Each pair is set at its force level to the nearest 1/4 in, as it is dimensioned from the seat.
  levels:forces.levels.map(l=>({...l,z:snapQuarter(l.base+offset[l.key])})) as StiffenerLevel[]};
}
export type ColumnStiffenerGeometry=NonNullable<ReturnType<typeof columnStiffenerGeometry>>;

/**
 * Crane-level bracing gussets on the web of a new column, at the braced columns: the rod A gusset on the column
 * centerline and the rod B gusset offset toward the girder, from the upper work point (the seat top) to the top of
 * the strut tab, and down at least the 6 in minimum web weld or the pin plate where it meets the web.
 */
export function bracingGussetBand(p:ProjectInput){
 if(!designsBracing(p)||!p.existingColumn?.isNew)return undefined;
 const column=existingColumnSection(p).section,g=bracingGeometry(p,column),o=gussetOutlines(g,6*inch,6*inch);
 const layout=bracingLayout(p);
 return {top:o.welds.upper.to,bottom:o.welds.upper.from,planes:[[-g.t/2,g.t/2],[g.t/2+g.strut.tw+g.cross.filler,3*g.t/2+g.strut.tw+g.cross.filler]] as [number,number][],
  grids:layout.stations.map((_,j)=>j).filter(j=>layout.braced[j]>0).map(j=>j+1)};
}
/** Input errors: arrangement, receiving column k, plate fit between the flanges, levels and clashes. */
export function columnStiffenerErrors(p:ProjectInput):string[]{
 const b=p.details?.bracket;if(!activeColumnStiffeners(b))return [];
 const errors:string[]=[],add=(bad:boolean,m:string)=>{if(bad)errors.push('details.bracket.columnStiffeners: '+m);};
 if(isRolledBracket(b)&&!rolledStub(b!))return errors;
 if(!bracketForceLevels(b!,b!.columnStiffeners!.thickness)){add(true,'column stiffeners are designed for the welded twin-rib, haunched and W-stub brackets and the tapered I haunch, which define the levels where they deliver force to the column.');return errors;}
 const g=columnStiffenerGeometry(p)!,f=(v:number)=>format(v,'length',p.units,3);
 add(!g.K,'enter the receiving column k (k_des) from the survey: no AISC shape identifies the column (set the existing column shape to the surveyed W-section, or enter k).');
 add(g.width+g.tw/2>g.c.width/2+1e-6,`plates ${f(g.width)} wide do not fit within the column flange: at most (bf - tw)/2 = ${f((g.c.width-g.tw)/2)}.`);
 add(g.clip>=g.width-1e-6||g.webLength<=1e-6,'corner clips leave no plate to weld.');
 add(g.requiredClip!==undefined&&g.clip<g.requiredClip-1e-6,`corner clip ${f(g.clip)} does not clear the column's rolled fillet: at least k - tf + 1/8 in (k1 - tw/2 + 1/8 in) = ${f(g.requiredClip??0)}.`);
 add(g.s.flangeWeld>=g.t-1e-6||g.s.webWeld>=g.t-1e-6,'stiffener fillets must be smaller than the plate thickness.');
 for(const l of g.levels)add(l.z<l.band[0]-1e-6||l.z>l.band[1]+1e-6,`the ${l.key} pair must be centered within the ${l.name} that delivers its force (${f(l.band[0])} to ${f(l.band[1])} from the seat top); it is at ${f(l.z)}.`);
 const [up,low]=g.levels;
 add(up.z-g.t/2<low.z+g.t/2+inch,'the upper and lower pairs must be at least 1 in apart.');
 // New columns: the crane-level bracing gussets on the web at the braced columns.
 const band=bracingGussetBand(p);
 if(band){
  const y0=g.c.depth/2-g.tf-g.length,y1=g.c.depth/2-g.tf,clear=inch/4;
  const plan=band.planes.some(([a,c])=>a<y1+clear&&c>y0-clear);
  for(const l of g.levels){
   const lo=l.z-g.t/2-g.s.flangeWeld,hi=l.z+g.t/2+g.s.flangeWeld;
   add(plan&&band.grids.length>0&&lo<band.top+clear&&hi>band.bottom-clear,`the ${l.key} pair clashes with the crane-level bracing gusset on the column web at grid${band.grids.length>1?'s':''} ${band.grids.join(', ')} (gusset ${f(band.bottom)} to ${f(band.top)} from the seat top, on the column centerline): a stiffener cannot pass the gusset, and combining them is not designed here. Use a heavier column, or bracing whose gussets clear the stiffeners.`);
  }
 }
 return errors;
}

/** Unstiffened available strength of one J10 limit state, from the column-side checks of the bracket. */
export interface UnstiffenedStrength {id:string;label:string;value:number}
export interface ColumnStiffenerContext {
 /** Check id prefix ('bracket' or 'wbracket') and reference ids of the bracket. */
 prefix:string;refs:string[];
 /** Concentrated force peaks at each level: tension (pulling the flange) and compression, pair totals. */
 demand:Record<`${StiffenerLevelKey}${'T'|'C'}`,Peak|undefined>;
 tension:UnstiffenedStrength[];compression:UnstiffenedStrength[];sidesway?:UnstiffenedStrength;
 /** Per duty bin: range of the force on one plate at each level, and of the column flange stress at the bracket. */
 fatigue:{cycles:number;upper:number;lower:number;column:number}[];
 /** Stress range in the column flange at the stiffener toes is the bracket moment on the column section. */
 columnStressNote:string;
 /**
  * Stiffened design of the whole flange force system (tapered haunch): `demand` then holds the largest force on ONE
  * plate (tension, compression) at each level, F = P/2 ± M_f/g (coupleStiffenerForces), and no unstiffened column
  * strength is credited. `flange` gives the flange force P and lateral moment M_f of the governing set at each level.
  */
 couple?:{gauge:number;flange:Partial<Record<`${StiffenerLevelKey}${'T'|'C'}`,{P:number;M:number}>>;
  /** Symbol of the flange force at each level (T in tension at the top, C in compression at the bottom). */
  symbol:Record<StiffenerLevelKey,string>};
}
/**
 * Pair strength of one level: tension yielding of the plates at their clipped contact (J4.1) and compression as a
 * column (J4.4 for KL/r <= 25, else Chapter E): both plates with a web strip of 25tw (12tw near the column top),
 * K = 0.75 on the plate length, bounded by yielding at the clipped contact.
 */
export function stiffenerPairStrength(g:ColumnStiffenerGeometry,Fy:number,E:number,method:ProjectInput['method'],nearTop:boolean){
 const {t,width,tw}=g,strip=(nearTop?12:25)*tw,A=2*width*t+strip*tw,contact=2*g.contact*t;
 const Ix=strip*tw**3/12+2*(t*width**3/12+width*t*((tw+width)/2)**2),Iy=tw*strip**3/12+2*width*t**3/12,r=Math.sqrt(Math.min(Ix,Iy)/A),KL=.75*g.length,slender=KL/r;
 const column=slender<=25?available(Fy*A,method,.9,1.67):compressionResistance(A,r,KL,E,Fy,method).capacity;
 const yieldContact=available(Fy*contact,method,.9,1.67);
 return {strip,A,r,KL,slender,column,tension:yieldContact,compression:Math.min(column,yieldContact),contact};
}
/** Required stiffener force at one level: R_u less the least unstiffened strength in each sense; the full force where J10.4 governs. */
export function requiredStiffenerForce(T:number,C:number,tension:UnstiffenedStrength[],compression:UnstiffenedStrength[],sidesway?:UnstiffenedStrength){
 // No unstiffened strength credited where none is reported: the stiffeners take the whole force.
 const none={id:'',label:'no unstiffened strength credited',value:0},least=(v:UnstiffenedStrength[])=>v.reduce((a,w)=>w.value<a.value?w:a,v[0]??none);
 const tMin=least(tension),cMin=least(compression);
 const swayGoverns=!!sidesway&&C>sidesway.value*(1+1e-9);
 return {T,C,tMin,cMin,swayGoverns,Rt:Math.max(0,T-tMin.value),Rc:swayGoverns?C:Math.max(0,C-cMin.value)};
}

/**
 * The stiffener checks of a bracket, given the concentrated forces at each level and the unstiffened strengths of the
 * column-side checks. The unstiffened J10.1-J10.4 checks are converted by `stiffenedColumnChecks`.
 */
export function columnStiffenerChecks(p:ProjectInput,x:ColumnStiffenerContext):CheckResult[]{
 const g=columnStiffenerGeometry(p);if(!g)return [];
 const m=p.details!.material,E=p.section.E,u=p.units,f=(v:number)=>format(v,'length',u,3),F=(v:number)=>format(v,'force',u,3),checks:CheckResult[]=[];
 const refs=[...x.refs.filter(r=>r!=='tr13-bracket'),'column-stiffener','aisc-j'],fatRefs=[...refs,'aisc-fatigue'];
 const add=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,caseId?:string,referenceIds=refs)=>checks.push({id:`${x.prefix}-colstiff-${id}`,group:'Column bracket',title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&demand<=capacity*(1+1e-9)?'pass':'fail',equation,note,caseId,referenceIds});
 const where=g.field?'field':'shop',columnEnd=p.existingColumn?.enabled?p.existingColumn.height-p.existingColumn.seatElevation:0;
 const plates=`${f(g.t)} × ${f(g.width)} plates, ${g.full?'full depth':'half depth'} (${f(g.length)} from the loaded flange), ${f(g.clip)} corner clips, one each side of the web`;
 const couple=x.couple,gauge=couple?.gauge??0;
 const levels=g.levels.map(l=>{
  const T=x.demand[`${l.key}T`],C=x.demand[`${l.key}C`];
  // Stiffened design of the whole flange force system: one plate's force, no unstiffened strength credited.
  const req=couple?{T:T?.value??0,C:C?.value??0,tMin:{id:'',label:'none credited',value:0},cMin:{id:'',label:'none credited',value:0},swayGoverns:false,Rt:T?.value??0,Rc:C?.value??0}:requiredStiffenerForce(T?.value??0,C?.value??0,x.tension,x.compression,x.sidesway);
  // A web strip of 12tw where the column top is closer than 12.5tw above the pair (or not entered).
  const nearTop=!(columnEnd+l.z-12.5*g.tw>0),both=stiffenerPairStrength(g,m.Fy,E,p.method,nearTop);
  // One plate with half the web strip: half the pair.
  const pair=couple?{...both,tension:both.tension/2,compression:both.compression/2,column:both.column/2}:both;
  const rt=pair.tension>0?req.Rt/pair.tension:0,rc=pair.compression>0?req.Rc/pair.compression:0;
  return {l,T,C,req,pair,nearTop,governs:rc>rt?'compression' as const:'tension' as const,R:Math.max(req.Rt,req.Rc),ratio:Math.max(rt,rc)};
 });
 const sense=(v:typeof levels[number])=>`${v.l.name}: tension R_u = ${F(v.req.T)} against φR_n = ${F(v.req.tMin.value)} (${v.req.tMin.label}), R_st = ${F(v.req.Rt)}; compression R_u = ${F(v.req.C)} against ${v.req.swayGoverns?`the J10.4 sidesway strength ${F(x.sidesway!.value)}: the stiffeners take the full force`:`φR_n = ${F(v.req.cMin.value)} (${v.req.cMin.label}), R_st = ${F(v.req.Rc)}`}`;
 const mf=(v:number)=>format(v,'moment',u,3);
 // The flange force system on one plate: R_st = P/2 ± M_f/g, with the numbers of the governing set in each sense.
 const coupleText=(v:typeof levels[number])=>{
  const sym=couple!.symbol[v.l.key],normal=v.l.key==='upper'?1:-1;
  const one=(k:'T'|'C')=>{const fl=couple!.flange[`${v.l.key}${k}`],d=x.demand[`${v.l.key}${k}`];if(!fl||!d||d.value<=0)return '';
   const P=Math.abs(fl.P),M=Math.abs(fl.M),adds=(k==='T')===(fl.P>0),reversed=normal*fl.P<0;
   return `${k==='T'?'tension':'compression'} on one plate R_st = ${adds?`${sym}/2 + M_f/g = ${F(P)}/2 + ${F(M/gauge)}`:`M_f/g − ${sym}/2 = ${F(M/gauge)} − ${F(P)}/2`} = ${F(d.value)} (${sym} = ${F(P)}${reversed?' reversed, uplift set':''}, M_f = ${mf(M)}, M_f/g = ${mf(M)}${u==='US'?' × 12 in/ft':''}/${f(gauge)}; case ${d.caseId})`;};
  return [one('T'),one('C')].filter(Boolean).join('; ');
 };
 for(const v of levels){
  const cap=v.governs==='compression'?v.pair.compression:v.pair.tension,R=v.governs==='compression'?v.req.Rc:v.req.Rt;
  if(couple){
   const sym=couple.symbol[v.l.key];
   add(`${v.l.key}`,`Column stiffeners at the ${v.l.name} · plate force (J10.8, J4.1, J4.4)`,R,cap,'force',`R_{st}=\\frac{${sym}}{2}\\pm\\frac{M_f}{g}\\le\\phi R_n;\\ \\ R_n=F_y(b_s-c)t_s\\ \\text{or}\\ P_n/2`,
    `Stiffened design (J10.8): the pair of ${plates}, centered ${f(v.l.z)} from the seat top at the ${v.l.name}, carries that flange's whole force system, with no unstiffened column strength credited: the flange force ${sym} shared by the two plates and the flange's lateral moment M_f (torque of the unbalanced girder reactions carried by flange bending, warping fixed at the column) as a couple between them, g = t_w + b_s = ${f(g.tw)} + ${f(g.width)} = ${f(gauge)} apart. ${coupleText(v)}. R_st = ${F(R)} governs (${v.governs}). Tension: J4.1 yielding of one plate at its clipped contact, φR_n = φF_y(b_s − c)t_s = ${F(v.pair.tension)}. Compression: J10.8 column of one plate with half the ${v.nearTop?'12':'25'}tw web strip (${f(v.pair.strip/2)}), L_c = 0.75h = 0.75 × ${f(g.length)} = ${f(v.pair.KL)}, L_c/r = ${v.pair.slender.toFixed(1)} (${v.pair.slender<=25?'J4.4: Pn = FyAg':'Chapter E'}), bounded by yielding at the contact: φP_n/2 = ${F(v.pair.compression)}. The net force ${sym} enters the column web (J10.6 panel check); the couple ±M_f/g passes through the full-depth plates into both column flanges, which carry it over the haunch depth as opposite lateral shears M_f/(d − t_f) = ${F(Math.max(...(['T','C'] as const).map(k=>Math.abs(couple.flange[`${v.l.key}${k}`]?.M??0)))/(g.c.depth-g.tf))} (column torsion between the two flange levels, well within φ0.6F_yb_ft_f = ${F(available(.6*g.c.Fy*g.c.width*g.tf,p.method,.9,1.67))}). Forces: every concurrent case of the bracket design force envelope.`,
    (v.governs==='compression'?v.C:v.T)?.caseId);
   continue;
  }
  add(`${v.l.key}`,`Column stiffeners at the ${v.l.name} · required strength (J10.8, J4.1, J4.4)`,R,cap,'force','R_{st}=R_u-\\min\\phi R_n\\ \\text{(J10.1 to J10.4)}\\le\\phi P_n;\\ \\ P_n=2F_y(b_s-c)t_s\\ \\text{or}\\ F_{cr}A,\\ L_c=0.75h',
   `${sense(v)}. R_st is the force above the least unstiffened strength φR_n of J10.1 to J10.4 (the whole R_u where J10.4 governs). Pair of ${plates}, centered ${f(v.l.z)} from the seat top at the ${v.l.name}. Tension: J4.1 yielding of both plates at their clipped flange contact, φPt = ${F(v.pair.tension)}. Compression: J10.8 column of both plates and a ${v.nearTop?'12':'25'}tw web strip (${f(v.pair.strip)}), L_c = 0.75h = 0.75 × ${f(g.length)} = ${f(v.pair.KL)}, L_c/r = ${v.pair.slender.toFixed(1)} (${v.pair.slender<=25?'J4.4: Pn = FyAg':'Chapter E'}), bounded by yielding at the contact: φPc = ${F(v.pair.compression)}. ${v.l.key==='upper'?'Tension at the seat under gravity; compression under a reversed (uplift) set.':'Compression under gravity; tension under a reversed (uplift) set.'} Forces: every concurrent case of the bracket design force envelope.`,
   (v.governs==='compression'?v.C:v.T)?.caseId);
 }
 // J10.8 proportions: width with half the web at least a third of the delivering plate width, thickness at least half
 // its thickness and b/16, and the B4.1a case 1 outstand limit where the pair carries compression.
 const props=levels.map(v=>{const bReq=v.l.plate.width/3-g.tw/2,compression=v.req.C>0,tReq=Math.max(v.l.plate.thickness/2,g.width/16,compression?g.width/(.56*Math.sqrt(E/m.Fy)):0);return {v,bReq,tReq,ratio:Math.max(tReq/g.t,bReq/g.width)};}),worst=props.reduce((a,v)=>v.ratio>a.ratio?v:a,props[0]);
 add('proportions','Column stiffeners · width and thickness (J10.8(1), (2); B4.1a)',worst.ratio,1,'ratio','b_s\\ge\\frac{b_p}{3}-\\frac{t_w}{2};\\ \\ t_s\\ge\\max\\left(\\frac{t_p}{2},\\,\\frac{b_s}{16},\\,\\frac{b_s}{0.56\\sqrt{E/F_y}}\\right)',
  props.map(v=>`${v.v.l.name} (${v.v.l.plate.name} ${f(v.v.l.plate.width)} × ${f(v.v.l.plate.thickness)}): b_s = ${f(g.width)} against ${f(v.bReq)}, t_s = ${f(g.t)} against ${f(v.tReq)}`).join('; ')+`. The outstand limit 0.56√(E/Fy) applies where the pair carries compression.`);
 add('length','Column stiffeners · length (J10.8(3))',g.c.depth/2,g.length+g.tf,'length','L_s+t_f\\ge d/2',
  `${g.full?'Full depth, welded to both flanges':'Half depth, from the loaded flange to the column centerline'}: ${f(g.length+g.tf)} from the loaded flange face against d/2 = ${f(g.c.depth/2)}. Full depth is required only by J10.5 (compressive forces on both flanges, which a one-sided bracket does not apply) and J10.7 (unframed ends of beams and girders, not a continuous column); J10.4 stiffeners extend at least half the depth.`);
 // Welds: to the flange for the stiffener force, to the web for the force the stiffener delivers to it (J10.8).
 const Rmax=levels.reduce((a,v)=>v.R>a.R?v:a,levels[0]),phiW=available(.6*m.Fexx,p.method,.75,2),te=(w:number)=>w/Math.SQRT2;
 // A pair force R_st on four throats (two plates, both faces), or one plate's force on its two (stiffened couple design).
 const throats=couple?2:4,one=couple?' on one plate':'';
 const flangeStress=Rmax.R/(throats*te(g.s.flangeWeld)*g.contact),webStress=Rmax.R/(throats*te(g.s.webWeld)*g.webLength);
 add('flange-weld','Column stiffeners · fillet welds to the flange (J10.8, J2.4)',flangeStress,phiW,'stress',`f_w=\\frac{R_{st}}{${throats}(0.707w)(b_s-c)}`,
  `${f(g.s.flangeWeld)} fillets both faces of each plate along ${f(g.contact)} beyond the clip, ${where} welds; the larger stiffener force${one}, ${F(Rmax.R)} at the ${Rmax.l.name}. No directional strength increase.${g.full?' The far-flange fillets are the same size.':''}`);
 const webBase=Math.min(available(.6*g.c.Fy,p.method,1,1.5),available(.6*g.c.Fu,p.method,.75,2));
 add('web-weld','Column stiffeners · fillet welds to the web (J10.8, J2.4)',webStress,phiW,'stress',`f_w=\\frac{R_{st}}{${throats}(0.707w)L_w}`,
  `${f(g.s.webWeld)} fillets both faces of each plate along the web, ${f(g.webLength)} beyond the clip${g.full?'s':''}, ${where} welds: they deliver the whole stiffener force${one} ${F(Rmax.R)} to the web (no share credited to the far flange).`);
 add('web-shear','Column web · shear along the stiffener welds (J4.2)',Rmax.R/(g.webLength*g.tw),webBase,'stress','f_v=\\frac{R_{st}}{L_wt_w}\\le\\min(\\phi0.6F_y,\\,\\phi0.6F_u)',
  `Column web base metal along the stiffener line, one shear plane of the web thickness ${f(g.tw)} over ${f(g.webLength)}${couple?', with the larger plate force on one face (conservative: the net force of the pair is the flange force)':''}; J4.2 shear yielding (φ = 1.00) and rupture (φ = 0.75).`);
 const fMin=filletMinimum([g.t,g.tf]),wMin=filletMinimum([g.t,g.tw]);
 add('weld-minimum','Column stiffener fillets · minimum leg (J2.4)',Math.max(fMin/g.s.flangeWeld,wMin/g.s.webWeld),1,'ratio','w\\ge w_{min}',
  `Flange fillets ${f(g.s.flangeWeld)} against ${f(fMin)} (thinner of the plate and the column flange); web fillets ${f(g.s.webWeld)} against ${f(wMin)} (thinner of the plate and the web), AISC 360-16 Table J2.4.`,undefined,refs);
 add('weld-length','Column stiffener fillets · length at least four sizes (J2.2b)',Math.max(4*g.s.flangeWeld/g.contact,4*g.s.webWeld/g.webLength),1,'ratio','l\\ge4w',
  `Flange fillets ${f(g.contact)} long beyond the clip, web fillets ${f(g.webLength)}.`);
 const survey=g.field?'Existing column: the survey verifies the plates clear any existing connection, bracing, girt or attachment on the web and inside either flange at both levels, including anything welded to the far flange; the receiving column is confirmed by survey.':'New column: no other attachment between its flanges at these levels (the crane-level bracing gussets, where designed, are checked for clashes).';
 add('fit','Column stiffeners · fit between the flanges and clear of the fillet',g.requiredClip??g.clip,g.clip,'length','c\\ge k-t_f+1/8\\,in=k_1-t_w/2+1/8\\,in;\\quad t_w/2+b_s\\le b_f/2',
  `Corner clip ${f(g.clip)} against the rolled fillet k - tf = ${f(g.fillet??0)} plus 1/8 in (k = ${f(g.K?.k??0)}, ${g.K?.source??'not identified'}); plates ${f(g.tw/2+g.width)} from the web centerline within the ${f(g.c.width/2)} half flange; ${f(g.length)} long between the flanges (clear depth ${f(g.h)}). ${survey}`);
 // Fatigue, Appendix 3: the duty-bin ranges of the force on one plate (unfactored, without impact), conservatively
 // taken as the whole concentrated force on the stiffeners at every level.
 const total=p.fatigue.cycles,weldF=categoryF(total),te2=(w:number)=>2*te(w);
 const plateRange=x.fatigue.map(v=>Math.max(v.upper,v.lower));
 // Miner's rule as the equivalent constant-amplitude range at n_SR = Σn_i against (R_FIL) F_SR at n_SR.
 const R=transverseFilletFatigue(g.t,g.s.flangeWeld,total).reduction;
 const plate=minerEquivalent(x.fatigue.map((v,i)=>({cycles:v.cycles,range:plateRange[i]/(g.contact*g.t)})),n=>finiteLife(4.4,n,R));
 add('fatigue-plate','Column stiffener plates at the flange fillets · fatigue (A-3.1 item 5.6)',plate.range,plate.capacity,'stress',minerEquation(`\\ \\ \\text{(Cat. C}${R<1?'^{\\prime\\prime}':''}\\text{)};\\ \\ f_{sr,i}=\\frac{\\Delta P_i}{(b_s-c)t_s}`,3,R<1),
  `Table A-3.1 item 5.6: each plate is a tension-loaded plate element connected at its end by transverse fillets on opposite sides; toe crack Category C, root crack Category C″ with R_FIL = ${R.toFixed(3)} (Eq. A-3-6) for t = ${f(g.t)}, w = ${f(g.s.flangeWeld)}. Range per duty bin of the force on one plate at the more loaded level, over its ${f(g.contact)} contact; both levels treated as tension loaded. Miner's rule over the duty bins as the equivalent constant-amplitude range at n_SR = ${plate.cycles.toLocaleString('en-US')} cycles, no endurance-limit credit; Σn_i/N_i = ${damageText(plate.damage)} (information).`,undefined,fatRefs);
 const throat=Math.max(0,...plateRange.map(v=>Math.max(v/(te2(g.s.flangeWeld)*g.contact),v/(te2(g.s.webWeld)*g.webLength))));
 add('fatigue-weld','Column stiffener fillets · throat fatigue (A-3.1 item 8.2)',throat,weldF,'stress','f_{sr}=\\frac{\\Delta P}{2(0.707w)l}\\le F_{SR}=690(1.5/n_{SR})^{0.167}\\ge55\\,\\mathrm{MPa}',
  `Table A-3.1 item 8.2, Category F, shear on the throat of the flange and web fillets of one plate; the largest unfactored range over the duty bins assigned to all ${total.toLocaleString('en-US')} project cycles.`,undefined,fatRefs);
 const toe=minerEquivalent(x.fatigue.map(v=>({cycles:v.cycles,range:v.column})),n=>finiteLife(4.4,n));
 add('fatigue-toe','Column flange at the stiffener weld toes · fatigue (A-3.1 item 5.7)',toe.range,toe.capacity,'stress',minerEquation('\\ \\ \\text{(Cat. C)}'),
  `Table A-3.1 item 5.7, Category C: column flange (and web) base metal at the toe of the transverse fillets of the stiffeners, which are ${f(g.t)} thick along the column (item 7.1 would also give C, a < 2 in). ${x.columnStressNote} Equivalent constant-amplitude range at n_SR = ${toe.cycles.toLocaleString('en-US')} cycles; Σn_i/N_i = ${damageText(toe.damage)} (information).`,undefined,fatRefs);
 return checks;
}
/** Ids of the unstiffened column checks a level of stiffeners takes over, and the note for each kind. */
export function stiffenedColumnChecks(p:ProjectInput,checks:CheckResult[],ids:string[]):CheckResult[]{
 const g=columnStiffenerGeometry(p);if(!g)return checks;
 const F=(v:number)=>format(v,'force',p.units,3);
 return checks.map(c=>{
  if(!ids.includes(c.id))return c;
  if(c.status==='pass')return {...c,note:`${c.note} Column stiffeners are also provided at the ${g.levels.map(l=>l.name).join(' and ')} (J10.8).`};
  if(c.status!=='fail')return c;
  const {demand:_d,capacity:_c,utilization:_u,...rest}=c;
  return {...rest,status:'not-applicable',note:`Unstiffened strength ${F(c.capacity??0)} is below the ${F(c.demand??0)} concentrated force: the J10.8 column stiffeners at the ${g.levels.map(l=>l.name).join(' and ')} take R_u - φR_n (column stiffener checks). ${c.note}`};
 });
}
/** Note for the J10.6 panel check where stiffeners are provided. */
export const panelStiffenerNote=' Column stiffeners bound the panel zone but add no panel shear strength; a web doubler plate (J10.9) is outside this design, so a failure here needs a heavier column.';
export type {ColumnStiffenerInput};
