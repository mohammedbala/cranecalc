import {categoryF,finiteLife} from './fatigueConstants';
import {tieColumnScope} from './loadPathScope';
import {seatSettingTolerance} from './fitTolerances';
/**
 * New rolled wide-flange column bracket: an AISC W-section cantilever stub welded to the column flange, its web
 * vertical and its length along the stub axis from the column face. The runway bearing plates and their bolts land on
 * its top flange, directly or on a welded spreader seat plate across it; a pair of full-depth bearing stiffeners sits
 * in the stub under the girder web line where required. AISC 360-16 (22 where it differs) F2/F3, F6, G2, G6, H1,
 * H3.3, J2, J4, J7, J10 and Appendix 3; AIST TR-13 §5.9.2; AISC DG7. Canonical units N, mm, MPa.
 *
 * Axes: x along the runway from the grid (the stub web plane), y from the column face, z up from the stub mid-depth.
 */
import type {ProjectInput,CheckResult} from './types';
import type {BracketLoads,SeatHorizontal} from './bracketDesign';
import type {EndBearingInput} from './endBearingInputs';
import {seatStrip} from './bracketDesign';
import {available} from './aiscStrength';
import {minimumFillet,filletEffectiveSize,compressionResistance,transverseFilletFatigue,plateBearing,boltCapacity} from './connectionStrength';
import {format} from './units';
import {rolledStub,isRolledBracket,type RolledStub} from './rolledBracketInputs';
import {simpleSupportInput,endGridCentered} from './simpleSupports';
import {runwayEnds} from './continuation';
import {activeEndBearing} from './endBearingInputs';
import {aiscShapeByName} from '../data/aiscSections';
import {activeColumnStiffeners} from './columnStiffenerInputs';
import {columnStiffenerChecks,stiffenedColumnChecks,panelStiffenerNote,flangeStiffenerForces} from './columnStiffeners';

const inch=25.4,kip=4448.2216152605;
type Peak={value:number;caseId:string;x:number};
export const usesRolledBracket=(p:ProjectInput)=>!!p.details?.bracket?.enabled&&isRolledBracket(p.details.bracket);
/** The stub of the project's rolled bracket. */
export const projectStub=(p:ProjectInput)=>rolledStub(p.details!.bracket!)!;

/** The girder web line (reach) and the far bearing edge from the column face, and the bearing length along the stub. */
export function stubBearing(p:ProjectInput){
 const b=p.details!.bracket!,W=p.details!.bearing.width;
 // The girder bottom flange and bearing plate deliver the reaction across the narrower of the two.
 const lb=Math.min(W,p.section.bf);
 return {a:b.reach,e:b.reach+W/2,W,lb};
}
/** Height above the stub mid-depth at which the bearing bolts deliver the horizontal forces: the top of the seat. */
export const stubTop=(st:RolledStub)=>st.d/2+(st.seat?.t??0);
/**
 * Bolts of the bolted end bearings: |x| from the web plane of every hole (simple spans: girder ends half the gap from
 * a shared grid and, at a runway end, on the grid or with the bearing centered on the web (endGridBearing
 * 'centered'); a continuous girder centered on interior grids and ending on the runway-end grids), the two rows from
 * the column face, and the bearing plate extent from the grid.
 */
export function stubBoltLayout(p:ProjectInput,e:EndBearingInput){
 const d=p.details!,b=d.bracket!,L=d.bearing.length,rows=[e.bolts.edge,L-e.bolts.edge];
 const gap=p.system==='simple'?simpleSupportInput(p).endGap:0,centered=rows.map(r=>Math.abs(r-L/2));
 const xs=p.system==='simple'?[...(endGridCentered(p)?centered:rows),...rows.map(r=>gap/2+r)]:[...rows,...centered];
 return {inner:Math.min(...xs),outer:Math.max(...xs),xs,rows:[b.reach-e.bolts.gauge/2,b.reach+e.bolts.gauge/2],extent:bearingExtent(p)};
}
/**
 * Extent of the bearing plates from the grid along the runway, the larger of a shared grid (both simple-span ends,
 * half the gap plus the bearing length) and a runway-end grid (the bearing length with the girder end on the grid;
 * half of it with the bearing centered on the web). A single simple span keeps the shared-grid value unless centered.
 */
export function bearingExtent(p:ProjectInput){
 const L=p.details!.bearing.length;
 if(p.system!=='simple')return L;
 const shared=simpleSupportInput(p).endGap/2+L;
 return endGridCentered(p)&&p.spans.length===1&&runwayEnds(p).length===2?L/2:shared;
}
/** Extent of the runway-end bearing from the grid: half the bearing length when centered on the web, else its length. */
export function endGridBearingExtent(p:ProjectInput){
 const L=p.details!.bearing.length;return endGridCentered(p)?L/2:L;
}

/**
 * Fit of a runway-end bearing centered on the support web (endGridBearing 'centered'): half the bearing length plus
 * the setting tolerance each side of the web, within half the seat length along the runway. None otherwise.
 */
export function endGridFitChecks(p:ProjectInput,half:number,seat:string,symbol:string,
 compared:(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,referenceIds?:string[])=>CheckResult,referenceIds?:string[]):CheckResult[]{
 if(!endGridCentered(p)||!runwayEnds(p).length)return [];
 const f=(v:number)=>format(v,'length',p.units,3),L=p.details!.bearing.length;
 return [compared('end-bearing-seat-fit-end',`Runway-end bearing centered on the web · fits on ${seat}`,endGridBearingExtent(p)+seatSettingTolerance,half,'length',`L_{bearing}/2+t_{set}\\le ${symbol}`,
  `End-bay bearings centered on the support web at the runway-end grids: the ${f(L)} bearing and its bolts extend ${f(L/2)} each side of the web, plus the ${f(seatSettingTolerance)} bearing setting tolerance (AIST TR-13 §5.18 seat plan position ±1/8 in). The girder runs ${f(L/2)} past the grid.`,referenceIds)];
}
/** Stub actions at the column face under one concurrent force set. */
export interface StubActions {
 V:number;Mseat:number;e:number;F:number;H:number;xH:number;top:number;
 /** Strong-axis moment (top flange in tension positive), axial force (tension positive), torque about the stub axis. */
 Mx:number;N:number;T:number;
 /** Lateral forces and in-plane root moments of each flange (warping by flange bending, no Saint-Venant relief). */
 Qtop:number;Qbot:number;Mtop:number;Mbot:number;
 /** Reactions on each flange outstand (x<0, x>0) with their centroid distance from the web plane and nearest patch edge. */
 sides:{P:number;x:number;near:number}[];
}
/**
 * Loads on the stub: the girder reactions on the top flange, or the reactions of a spreader seat strip spanning
 * between the flange tips with its overhangs (the twin-rib seat-strip model), with the seat strip results.
 */
export function stubLoads(st:RolledStub,loads:BracketLoads,bearingLength:number){
 if(!st.seat)return {loads,strip:undefined};
 const strip=seatStrip(loads,st.bf,bearingLength);
 return {loads:[{vertical:strip.reactions[0],offset:-st.bf/2,length:0},{vertical:strip.reactions[1],offset:st.bf/2,length:0}] as BracketLoads,strip};
}
export function stubActions(st:RolledStub,a:number,e:number,loads:BracketLoads,h:SeatHorizontal):StubActions{
 const V=loads.reduce((s,v)=>s+v.vertical,0),Mseat=loads.reduce((s,v)=>s+v.vertical*v.offset,0);
 const F=h.longitudinal,H=h.bottom,xH=h.offset,top=stubTop(st);
 // F and H reach the stub at the top of the seat through the bearing bolts, at the girder web line.
 const Mx=V*e+H*top,N=H,T=Mseat+F*top;
 const Qtop=F/2+T/st.h0,Qbot=F/2-T/st.h0,Mtop=Qtop*a+H*xH,Mbot=Qbot*a;
 const sides=[-1,1].map(s=>{let P=0,m=0,near=Infinity;
  for(const v of loads){const l=v.length??0,lo=v.offset-l/2,hi=v.offset+l/2;
   const frac=l>0?Math.max(0,Math.min(1,s>0?hi/l:-lo/l)):(s*v.offset>0?1:v.offset===0?.5:0);if(frac<=0)continue;
   const c=l>0?(s>0?(Math.max(lo,0)+hi)/2:(lo+Math.min(hi,0))/2):v.offset;
   P+=v.vertical*frac;m+=v.vertical*frac*Math.abs(c);near=Math.min(near,l>0?(s>0?Math.max(lo,0):-Math.min(hi,0)):Math.abs(v.offset));}
  return {P,x:P?Math.abs(m/P):0,near:Number.isFinite(near)?near:0};});
 return {V,Mseat,e,F,H,xH,top,Mx,N,T,Qtop,Qbot,Mtop,Mbot,sides};
}
/**
 * Bending of the stub top flange outstands without stiffeners, per unit width: each load on an outstand cantilevers
 * from the rolled fillet toe k1 over the bearing length along the stub widened at 45 degrees from its nearest edge;
 * the loads on one outstand add. The larger outstand.
 */
export function outstandMoment(st:RolledStub,loads:BracketLoads,lb:number){
 return Math.max(...[-1,1].map(s=>loads.reduce((sum,v)=>{
  const l=v.length??0,lo=v.offset-l/2,hi=v.offset+l/2,a=l>0?Math.max(st.k1,s>0?lo:-hi):s*v.offset,b=l>0?(s>0?hi:-lo):s*v.offset;
  if(b<=st.k1||(l===0&&a<=st.k1))return sum;
  // The part of the load beyond the fillet toe, at its centroid; patches straddling the web count only that part.
  const P=l>0?v.vertical*(b-Math.max(a,st.k1))/l:v.vertical,x=l>0?(Math.max(a,st.k1)+b)/2:a;
  return sum+Math.abs(P)*(x-st.k1)/(lb+2*(Math.max(a,st.k1)-st.k1));},0)));
}
/** Normal stress at the four flange tips at the column face: [top -x, top +x, bottom -x, bottom +x]. */
export function flangeTipStresses(st:RolledStub,f:StubActions){
 const Sf=st.tf*st.bf**2/6,n=f.N/st.A,b=f.Mx/st.Sx;
 return [n+b-f.Mtop/Sf,n+b+f.Mtop/Sf,n-b-f.Mbot/Sf,n-b+f.Mbot/Sf];
}

type Line={a:[number,number];b:[number,number];size:number;part:'flange'|'web'};
/**
 * Stub-to-column weld group on the column flange face, u along the runway and v up from the stub mid-depth: with
 * fillet flange joints, a fillet across the outer face of each flange and on its inner face from the rolled fillet
 * toe to the tip; with CJP flanges only the two web fillets (the groove welds develop the flanges). Web fillets on
 * both sides between the rolled fillets. Effective sizes per J2.2b.
 */
export function stubWeldGroup(st:RolledStub){
 const r=st.input,lines:Line[]=[],{d,bf,tf,tw,k,k1}=st;
 if(r.flangeJoint==='fillet')for(const s of [-1,1]){
  lines.push({a:[-bf/2,s*d/2],b:[bf/2,s*d/2],size:r.flangeWeld,part:'flange'});
  for(const side of [-1,1])lines.push({a:[side*k1,s*(d/2-tf)],b:[side*bf/2,s*(d/2-tf)],size:r.flangeWeld,part:'flange'});
 }
 for(const side of [-1,1])lines.push({a:[side*tw/2,-(d/2-k)],b:[side*tw/2,d/2-k],size:r.webWeld,part:'web'});
 const len=(l:Line)=>Math.hypot(l.b[0]-l.a[0],l.b[1]-l.a[1]),te=(l:Line)=>filletEffectiveSize(l.size,len(l))/Math.SQRT2;
 const A=lines.reduce((s,l)=>s+te(l)*len(l),0);
 const Ix=lines.reduce((s,l)=>s+te(l)*len(l)*(((l.a[1]+l.b[1])/2)**2+(l.b[1]-l.a[1])**2/12),0),Iy=lines.reduce((s,l)=>s+te(l)*len(l)*(((l.a[0]+l.b[0])/2)**2+(l.b[0]-l.a[0])**2/12),0);
 return {lines,A,Ix,Iy,J:Ix+Iy,te,len,webLength:d-2*k,innerLength:bf/2-k1,cjp:r.flangeJoint==='cjp'};
}
/**
 * Throat stresses of the weld group at a point: normal n (pulling away positive), shears tx along the runway and ty
 * up. Elastic method about the doubly symmetric group's centroid, no directional strength increase. With CJP flanges
 * the web fillets develop the web's normal stress and carry the vertical shear.
 */
export function stubWeldField(st:RolledStub,g:ReturnType<typeof stubWeldGroup>,a:number,f:StubActions){
 if(g.cjp){
  const te=st.input.webWeld/Math.SQRT2;
  return (_u:number,v:number)=>{const n=(f.N/st.A+f.Mx*v/st.Ix)*st.tw/(2*te),ty=-f.V/(2*te*g.webLength);return {n,tx:0,ty,f:Math.hypot(n,ty)};};
 }
 const My=f.F*a-f.H*f.xH,Mz=-f.Mseat-f.F*f.top;
 return (u:number,v:number)=>{const n=f.H/g.A+f.Mx*v/g.Ix-My*u/g.Iy,tx=f.F/g.A-Mz*v/g.J,ty=-f.V/g.A+Mz*u/g.J;return {n,tx,ty,f:Math.hypot(n,tx,ty)};};
}
/** Peak throat stress on the flange and web lines, and the components at every line end (for fatigue ranges). */
export function stubWeldStress(st:RolledStub,g:ReturnType<typeof stubWeldGroup>,a:number,f:StubActions){
 const at=stubWeldField(st,g,a,f);let flange=0,web=0;const points:{n:number;tx:number;ty:number;part:'flange'|'web'}[]=[];
 for(const l of g.lines)for(const q of [l.a,l.b]){const s=at(q[0],q[1]);points.push({n:s.n,tx:s.tx,ty:s.ty,part:l.part});if(l.part==='flange')flange=Math.max(flange,s.f);else web=Math.max(web,s.f);}
 return {flange,web,points};
}

/** AISC F2 (lateral-torsional buckling with Cb) and F3 (compression flange local buckling) strong-axis nominal moment; F6 minor axis. */
export function stubFlexure(st:RolledStub,E:number,Fy:number,Lb:number,Cb=1){
 const root=Math.sqrt(E/Fy),Mp=Fy*st.Zx,ry=Math.sqrt(st.Iy/st.A),rts=Math.sqrt(Math.sqrt(st.Iy*st.Cw)/st.Sx),Lp=1.76*ry*root;
 const j=st.J/(st.Sx*st.h0),Lr=1.95*rts*E/(.7*Fy)*Math.sqrt(j+Math.sqrt(j*j+6.76*(.7*Fy/E)**2));
 const ltb=Lb<=Lp?Mp:Lb<=Lr?Math.min(Mp,Cb*(Mp-(Mp-.7*Fy*st.Sx)*(Lb-Lp)/(Lr-Lp))):Math.min(Mp,Cb*Math.PI**2*E/(Lb/rts)**2*Math.sqrt(1+.078*j*(Lb/rts)**2)*st.Sx);
 const lambda=st.bf/(2*st.tf),lp=.38*root,lr=root,kc=Math.min(.76,Math.max(.35,4/Math.sqrt(st.h/st.tw)));
 const flb=lambda<=lp?Mp:lambda<=lr?Mp-(Mp-.7*Fy*st.Sx)*(lambda-lp)/(lr-lp):.9*E*kc*st.Sx/lambda**2;
 const Mpy=Math.min(Fy*st.Zy,1.6*Fy*st.Sy),minor=lambda<=lp?Mpy:lambda<=lr?Mpy-(Mpy-.7*Fy*st.Sy)*(lambda-lp)/(lr-lp):.69*E/lambda**2*st.Sy;
 return {Mn:Math.min(ltb,flb),Mp,ltb,flb,Lp,Lr,lambda,lp,lr,compactFlange:lambda<=lp,branch:lambda>lp?'F3 flange local buckling':Lb<=Lp?'F2-1 yielding':'F2 lateral-torsional buckling',minor};
}
/** G2.1 web shear of the rolled stub. */
export function stubShear(st:RolledStub,E:number,Fy:number,method:ProjectInput['method']){
 const ratio=st.h/st.tw,root=Math.sqrt(E/Fy),stocky=ratio<=2.24*root,Cv1=stocky||ratio<=1.10*Math.sqrt(5.34)*root?1:1.10*Math.sqrt(5.34)*root/ratio;
 return {Cv1,capacity:stocky?available(.6*Fy*st.d*st.tw*Cv1,method,1,1.5):available(.6*Fy*st.d*st.tw*Cv1,method,.9,1.67)};
}
/** J10.2 and J10.3 for the bearing over the stub web, with the end-of-member case near the stub tip. */
export function stubWebBearing(st:RolledStub,E:number,Fy:number,a:number,lb:number,method:ProjectInput['method']){
 const tip=st.L-(a+lb/2),yieldEnd=tip<=st.d,crippleEnd=tip<st.d/2;
 const yielding=Fy*st.tw*((yieldEnd?2.5:5)*st.k+lb);
 const r=lb/st.d,term=crippleEnd&&r>.2?4*r-.2:3*r;
 const crippling=(crippleEnd?.4:.8)*st.tw**2*(1+term*(st.tw/st.tf)**1.5)*Math.sqrt(E*Fy*st.tf/st.tw);
 return {tip,yieldEnd,crippleEnd,yielding:available(yielding,method,1,1.5),crippling:available(crippling,method,.75,2)};
}
/**
 * Paired full-depth bearing stiffeners under the girder web line, J10.8: two plates with a web strip of 25tw (12tw
 * within 12.5tw of the stub tip or column face) as a column of effective length 0.75h (J4.4 when KL/r <= 25, else
 * Chapter E). Each stiffener with half the strip takes the reactions on its own flange outstand.
 */
export function stubStiffener(st:RolledStub,E:number,Fy:number,a:number,method:ProjectInput['method']){
 const s=st.stiffener;if(!s)return undefined;
 const interior=a>=12.5*st.tw&&st.L-a>=12.5*st.tw,strip=(interior?25:12)*st.tw,A=2*s.width*s.t+strip*st.tw;
 const Ix=strip*st.tw**3/12+2*(s.t*s.width**3/12+s.width*s.t*((st.tw+s.width)/2)**2),Iy=st.tw*strip**3/12+2*s.width*s.t**3/12;
 const r=Math.sqrt(Math.min(Ix,Iy)/A),KL=.75*st.h,slender=KL/r;
 const column=slender<=25?available(Fy*A,method,.9,1.67):compressionResistance(A,r,KL,E,Fy,method).capacity;
 // One stiffener with half the web strip: centroid from the web plane, and the plate's in-plane plastic modulus.
 const A1=s.width*s.t+strip*st.tw/2,xc=(s.width*s.t*(st.tw/2+s.width/2)+strip*st.tw/2*st.tw/4)/A1;
 const bearingArea=(s.width-s.clip)*s.t;
 return {...s,interior,strip,A,r,KL,slender,column,half:column/2,xc,Z:s.t*s.width**2/4,bearing:available(1.8*Fy*bearingArea,method,.75,2),bearingArea,
  weldLength:s.height-2*s.clip,flangeWeldLength:s.width-s.clip};
}
/**
 * Stiffener-to-stub fillets of one stiffener (both faces): the vertical line on the web and the line on the bottom
 * flange, elastic, under the stiffener reaction P at x from the web plane. Peak throat stress.
 */
export function stiffenerWeldStress(st:RolledStub,s:NonNullable<ReturnType<typeof stubStiffener>>,P:number,x:number){
 const te=s.weld/Math.SQRT2,Lw=s.weldLength,Lf=s.flangeWeldLength;
 // Plane of the stiffener: u from the web face, v up from mid-depth. Lines (both faces): web u=0, bottom flange v=-h/2.
 const lines:{a:[number,number];b:[number,number]}[]=[{a:[0,-Lw/2],b:[0,Lw/2]},{a:[s.clip,-s.height/2],b:[s.clip+Lf,-s.height/2]}];
 const len=(l:typeof lines[number])=>Math.hypot(l.b[0]-l.a[0],l.b[1]-l.a[1]),A=lines.reduce((t,l)=>t+2*te*len(l),0);
 const uc=lines.reduce((t,l)=>t+2*te*len(l)*(l.a[0]+l.b[0])/2,0)/A,vc=lines.reduce((t,l)=>t+2*te*len(l)*(l.a[1]+l.b[1])/2,0)/A;
 const J=lines.reduce((t,l)=>t+2*te*len(l)*(((l.a[0]+l.b[0])/2-uc)**2+((l.a[1]+l.b[1])/2-vc)**2+len(l)**2/12),0);
 const e=Math.max(0,x-st.tw/2)-uc,M=P*e;
 return Math.max(...lines.flatMap(l=>[l.a,l.b]).map(([u,v])=>Math.hypot(-M*(v-vc)/J,-P/A+M*(u-uc)/J)));
}
/**
 * Spreader seat plate to the stub flange tips: one fillet along each tip over the stub, under the seat strip's
 * uplift reaction on the bearing width and the bolts' longitudinal and lateral forces over both lines.
 */
export function seatWeldStress(st:RolledStub,W:number,uplift:number,F:number,H:number){
 const s=st.seat!,te=s.weld/Math.SQRT2,Lw=s.y1-s.y0;
 return Math.hypot(Math.max(0,uplift)/(te*Math.min(W,Lw)),F/(2*te*Lw),H/(2*te*Lw));
}

export interface RolledBracketResults {
 strength:Record<string,Peak>;service:Record<string,Peak>;
 /** Largest unfactored range per duty bin of each fatigue detail. */
 fatigue:{name:string;cycles:number;flange:number;web:number;webWeld:number;column:number;stiffenerWeld:number;stiffenerToe:number;seat:number;seatWeld:number;
  /** With column stiffeners: range of the force on one stiffener plate at the stub top and bottom flange levels. */
  stiffUpper?:number;stiffLower?:number}[];
 /** Governing concurrent actions at each grid. */
 stations:{x:number;caseId:string;vertical:number;seatMoment:number;rootMoment:number;torque:number;longitudinal:number;lateral:number}[];
}
/** Column section modulus about its strong axis from the receiver plate dimensions. */
const receiverModulus=(c:{depth:number;width:number;flangeThickness:number;webThickness:number})=>{
 const I=2*c.width*c.flangeThickness*((c.depth-c.flangeThickness)/2)**2+c.webThickness*(c.depth-2*c.flangeThickness)**3/12;return I/(c.depth/2);
};
/**
 * Forces of the stub flanges on the column: the resultant flange forces M/(d-tf) +- N/2 in tension and
 * compression, which the column web takes (J10.2, J10.3, J10.4, J10.6), and for the flange local bending (J10.1)
 * the tension flange force with its in-plane bending from torsion and the longitudinal force, as twice the more
 * loaded half-flange resultant, P + 3M_f/b_f. The flange in-plane moments are self-equilibrated across the column
 * flange (the stub torque reaches the column as weak-axis bending) and add nothing to the web.
 */
export function columnFlangeForces(st:RolledStub,f:StubActions){
 const P=[f.Mx/st.h0+f.N/2,-f.Mx/st.h0+f.N/2],M=[f.Mtop,f.Mbot];
 return {pull:Math.max(0,...P.map((v,i)=>v>0?v+3*Math.abs(M[i])/st.bf:0)),tension:Math.max(0,...P),compression:Math.max(0,...P.map(v=>-v))};
}
/**
 * Concentrated forces on the column at the column stiffener levels, as pair totals: each stub flange force
 * M/(d-tf) +- N/2 with its in-plane bending M_f as twice the more loaded half-flange resultant, P + 3|M_f|/b_f, in
 * tension and in compression; and the force on each plate (one half flange), signed, for fatigue ranges.
 */
export const stubStiffenerForces=(st:RolledStub,f:StubActions)=>flangeStiffenerForces([f.Mx/st.h0+f.N/2,-f.Mx/st.h0+f.N/2],[f.Mtop,f.Mbot],st.bf);
/** Self-weight of the stub, its stiffeners and the spreader seat, N. */
export function rolledSelfWeight(p:ProjectInput,st:RolledStub){
 const g=p.section.density*9.80665/1e9,s=st.stiffener,seat=st.seat;
 return st.weight*st.L+(s?2*s.width*s.height*s.t*g:0)+(seat?seat.length*(seat.y1-seat.y0)*seat.t*g:0);
}

/**
 * Collector of the rolled bracket under every concurrent bracket force set (strength), single-crane service set and
 * duty-bin fatigue set, as the twin-rib bracket. The lateral force is taken in both senses for strength.
 */
export function createRolledBracketCollector(p:ProjectInput){
 if(!usesRolledBracket(p))return undefined;
 const st=rolledStub(p.details!.bracket!);if(!st)return undefined;
 const d=p.details!,b=d.bracket!,r=st.input,E=p.section.E,G=E/2.6,{a,e,W,lb}=stubBearing(p),g=stubWeldGroup(st),sf=stubStiffener(st,E,r.Fy,a,p.method),Lbr=d.bearing.length;
 const fl=stubFlexure(st,E,r.Fy,2*st.L),Mc=available(fl.Mn,p.method,.9,1.67),Mcy=available(fl.minor,p.method,.9,1.67);
 const ry=Math.sqrt(st.Iy/st.A),Pcc=compressionResistance(st.A,ry,2*st.L,E,r.Fy,p.method).capacity,Pct=available(r.Fy*st.A,p.method,.9,1.67);
 const c=b.receiver,Sc=receiverModulus(c),seat=st.seat,stiff=!!activeColumnStiffeners(b);
 const result:RolledBracketResults={strength:{},service:{},stations:[],
  fatigue:d.spectrum.map(v=>({name:v.name,cycles:v.cycles,flange:0,web:0,webWeld:0,column:0,stiffenerWeld:0,stiffenerToe:0,seat:0,seatWeld:0,...(stiff?{stiffUpper:0,stiffLower:0}:{})}))};
 const extremes=d.spectrum.map(()=>new Map<string,{min:number;max:number}>());
 const range=(bin:number,id:string,value:number)=>{const x=extremes[bin].get(id)??{min:0,max:0};x.min=Math.min(x.min,value);x.max=Math.max(x.max,value);extremes[bin].set(id,x);return x.max-x.min;};
 const weight=rolledSelfWeight(p,st),factor=p.method==='LRFD'?1.4:1;
 const observe=(kind:'strength'|'service'|'fatigue',caseId:string,x:number,loads:BracketLoads,bin:number,horizontal?:SeatHorizontal)=>{
  const h=horizontal??{longitudinal:0,bottom:0,offset:0},on=stubLoads(st,loads,Lbr);
  const all=kind==='strength'?[...on.loads,{vertical:weight*factor,offset:0,length:st.bf}]:on.loads;
  if(kind==='service'){
   const f=stubActions(st,a,e,all,{longitudinal:0,bottom:0,offset:0});
   // Bending and shear deflection at the far bearing edge, the drop of the outer bearing edge from the stub twist
   // (Saint-Venant with warping fixed at the column face), and the seat strip deflection with its overhangs.
   const at=Math.sqrt(E*st.Cw/(G*st.J)),twist=Math.abs(f.Mseat)/(G*st.J)*(a-at*Math.tanh(a/at)),reach=Math.max(0,...loads.map(v=>Math.abs(v.offset)+(v.length??0)/2));
   const seatDrop=on.strip&&seat?on.strip.moment/(2*E*(W*seat.t**3/12))*Math.max(st.bf**2/4,(seat.length**2-st.bf**2)/4):0;
   const deflection=Math.abs(f.V)*e**3/(3*E*st.Ix)+Math.abs(f.V)*e/(G*st.d*st.tw)+twist*reach+seatDrop,rotation=Math.abs(f.V)*e**2/(2*E*st.Ix);
   for(const [key,value] of Object.entries({vertical:Math.abs(f.V),deflection,rotation,twist}))if(!result.service[key]||value>result.service[key].value)result.service[key]={value,caseId,x};
   return;
  }
  const sets=(kind==='fatigue'?[h.bottom]:[h.bottom,-h.bottom]).map(H=>stubActions(st,a,e,all,{...h,bottom:H}));
  if(kind==='fatigue'){
   const out=result.fatigue[bin],f=sets[0],put=(key:'flange'|'web'|'column'|'stiffenerWeld'|'stiffenerToe'|'seat'|'seatWeld',id:string,value:number)=>{out[key]=Math.max(out[key],range(bin,id,value));};
   flangeTipStresses(st,f).forEach((v,i)=>put('flange','flange:'+i,v));
   for(const s of [-1,1])put('web','web:'+s,f.N/st.A+f.Mx*s*(st.d/2-st.k)/st.Ix);
   // Throat stress range at each web fillet end, from the ranges of its three components.
   const w=stubWeldStress(st,g,a,f);let worst=0;
   w.points.forEach((q,i)=>{if(q.part!=='web')return;worst=Math.max(worst,Math.hypot(range(bin,`wn:${i}`,q.n),range(bin,`wx:${i}`,q.tx),range(bin,`wy:${i}`,q.ty)));});
   out.webWeld=Math.max(out.webWeld,worst);
   put('column','column',f.V*(e+c.depth/2)/Sc);
   if(sf){f.sides.forEach((s,i)=>put('stiffenerWeld','sw:'+i,Math.sign(s.P)*stiffenerWeldStress(st,sf,Math.abs(s.P),s.x)));put('stiffenerToe','toe',f.V*(e-a)/st.Sx);}
   if(on.strip&&seat){put('seat','seat',6*on.strip.moment/(W*seat.t**2));on.strip.reactions.forEach((v,i)=>put('seatWeld','tw:'+i,Math.max(0,-v)/(seat.weld/Math.SQRT2*W)));}
   if(stiff){const q=stubStiffenerForces(st,f).plates;for(const level of ['upper','lower'] as const)q[level].forEach((v,i)=>{const key=level==='upper'?'stiffUpper':'stiffLower';out[key]=Math.max(out[key]!,range(bin,`${key}:${i}`,v));});}
   return;
  }
  // Strength: every concurrent set in both lateral senses.
  const peak=(key:string,value:number)=>{if(!result.strength[key]||value>result.strength[key].value)result.strength[key]={value,caseId,x};};
  for(const f of sets){
   const tips=flangeTipStresses(st,f),normal=Math.max(...tips.map(Math.abs));
   peak('vertical',Math.abs(f.V));peak('moment',Math.abs(f.Mx));peak('shear',Math.abs(f.V));peak('normal',normal);
   peak('flangeShear',Math.max(Math.abs(f.Qtop),Math.abs(f.Qbot)));peak('torque',Math.abs(f.T));
   // H1: axial with strong- and weak-axis bending of the whole section; torsion is in the H3.3 stress sum.
   const Pr=Math.abs(f.N),Pc=f.N>=0?Pct:Pcc,ratio=Pr/Pc,flex=Math.abs(f.Mx)/Mc+(Math.abs(f.F)*a+Math.abs(f.H*f.xH))/Mcy;
   peak('interaction',ratio>=.2?ratio+8/9*flex:ratio/2+flex);
   peak('webBearing',Math.max(0,f.V));
   peak('outstand',outstandMoment(st,all,lb));
   for(const s of f.sides){
    if(sf){const P=Math.abs(s.P),Pr1=P/sf.half,Mr=P*Math.abs(s.x-sf.xc)/available(r.Fy*sf.Z,p.method,.9,1.67);
     peak('stiffener',Pr1>=.2?Pr1+8/9*Mr:Pr1/2+Mr);peak('stiffenerForce',Math.max(0,s.P));peak('stiffenerWeld',stiffenerWeldStress(st,sf,P,s.x));}
   }
   const w=stubWeldStress(st,g,a,f);peak('flangeWeld',w.flange);peak('webWeld',w.web);
   // Connected base metal along each fillet: both fillets of a flange, or of the web, on the thinner joined part.
   peak('flangeBase',2*w.flange*r.flangeWeld/Math.SQRT2/Math.min(st.tf,c.flangeThickness));
   peak('webBase',2*w.web*r.webWeld/Math.SQRT2/Math.min(st.tw,c.flangeThickness));
   if(g.cjp){const Fyd=available(r.Fy,p.method,.9,1.67),Fvd=available(.6*r.Fy,p.method,.9,1.67);peak('cjp',Math.max(normal/Fyd,1.5*Math.max(Math.abs(f.Qtop),Math.abs(f.Qbot))/(st.bf*st.tf)/Fvd));}
   const col=columnFlangeForces(st,f);peak('pull',col.pull);peak('push',col.compression);peak('couple',Math.max(col.tension,col.compression));
   if(stiff){const q=stubStiffenerForces(st,f);peak('stiffUpperT',q.upperT);peak('stiffUpperC',q.upperC);peak('stiffLowerT',q.lowerT);peak('stiffLowerC',q.lowerC);}
   if(on.strip&&seat)peak('seatWeld',seatWeldStress(st,W,Math.max(0,...on.strip.reactions.map(v=>-v)),f.F,f.H));
  }
  if(on.strip&&seat){peak('seatNormal',6*on.strip.moment/(W*seat.t**2));peak('seatShear',1.5*on.strip.shear/(W*seat.t));}
  peak('uplift',Math.max(0,...loads.map(v=>-v.vertical)));
  const f=sets.reduce((m,v)=>Math.abs(v.Mx)>Math.abs(m.Mx)?v:m,sets[0]);
  const old=result.stations.find(v=>v.x===x);
  if(!old||Math.abs(old.rootMoment)<Math.abs(f.Mx)){const row={x,caseId,vertical:f.V,seatMoment:f.Mseat,rootMoment:f.Mx,torque:f.T,longitudinal:f.F,lateral:f.H};if(old)Object.assign(old,row);else result.stations.push(row);}
 };
 return {result,observe};
}

export function validateRolledBracket(p:ProjectInput):string[]{
 const b=p.details?.bracket;if(!b?.enabled||!isRolledBracket(b))return [];
 const errors:string[]=[],add=(bad:boolean,m:string)=>{if(bad)errors.push('details.bracket: '+m);};
 const st=rolledStub(b);
 if(!aiscShapeByName(b.corbelShape??'')||!st){errors.push('details.bracket.corbelShape: select a valid AISC W-section for the wide-flange bracket.');return errors;}
 const d=p.details!,r=st.input,c=b.receiver,W=d.bearing.width,seat=st.seat;
 add(p.scope!=='design'||!p.aist?.runwayOnly,'bracket design requires the detailed runway design model.');
 add(c.depth<=2*c.flangeThickness||c.webThickness>=c.width,'invalid receiving column I-section.');
 add(c.Fu<c.Fy||r.Fu<r.Fy,'Fu must be at least Fy for the column and the stub.');
 add(st.bf+(r.flangeJoint==='fillet'?2*r.flangeWeld:0)>c.width+1e-6,`the ${st.name} flanges${r.flangeJoint==='fillet'?' and their fillets':''} must fit on the receiving column flange.`);
 add(b.reach-W/2<=(seat?seat.y0:0),seat?'the bearing plate must lie on the seat, clear of the column face and the flange fillet.':'the bearing plate must lie clear of the column face.');
 add(st.L<b.reach+W/2,'the stub must extend beyond the complete bearing plate.');
 const extent=bearingExtent(p);
 if(seat){
  add(extent>seat.length/2+1e-6,'the spreader seat must cover the bearing plates: half its length is shorter than the bearing extent from the grid.');
  add(seat.length<st.bf+2*(seat.weld+inch/4),'the spreader seat must extend at least the seat fillet and 1/4 in beyond each flange tip.');
  add(seat.weld>=st.tf-1e-6,'the seat fillet along the flange tip must be smaller than the flange thickness.');
 }else add(extent>st.bf/2+1e-6,`the bearing plates must sit on the stub flange: ${p.system==='simple'?'half the girder gap plus the bearing length':'the bearing length at a runway-end grid'} exceeds half the flange width. Use a spreader seat plate, a wider W-section or a shorter bearing.`);
 const eb=activeEndBearing(p);
 if(eb){const lay=stubBoltLayout(p,eb);
  add(lay.outer>(seat?seat.length:st.bf)/2,`bearing bolts must lie on the ${seat?'spreader seat':'stub flange'}.`);
  add(lay.rows[0]<=(seat?seat.y0:0)||lay.rows[1]>=st.L,'bearing bolt rows must lie on the stub between the column face and its tip.');
 }
 add(st.h<4*r.webWeld,'web fillets must be at least four weld sizes long (J2.2b).');
 if(st.stiffener){const s=st.stiffener;
  add(s.width<=s.clip+4*s.weld,'bearing stiffeners are too narrow for their corner clip and fillet.');
  add(s.weld>=s.t,'stiffener fillet must be smaller than the stiffener thickness.');
  add(b.reach-s.t/2<inch||b.reach+s.t/2>st.L-inch,'bearing stiffeners must lie on the stub at the girder web line.');
 }
 return errors;
}

/**
 * Bolted end bearing seat checks on the rolled bracket: bolt bearing and prying in the plate the bearings land on,
 * edge distances, and nut clearance below it to the stub web, flange tips, stiffeners and column face; fit.
 */
export function rolledSeatChecks(p:ProjectInput,e:EndBearingInput,g:{hole:number;spacing:number},V:number,T:number,clearance:number,tMin:(T:number,b:number,pitch:number,Fu:number)=>number,
 compared:(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,referenceIds?:string[])=>CheckResult):CheckResult[]{
 const st=projectStub(p),r=st.input,db=e.bolts.diameter,lay=stubBoltLayout(p,e),u=p.units,f=(v:number)=>format(v,'length',u,3),method=p.method,seat=st.seat,s=st.stiffener;
 const plate=seat?{t:seat.t,Fu:p.details!.material.Fu,half:seat.length/2,name:'Spreader seat'}:{t:st.tf,Fu:r.Fu,half:st.bf/2,name:`${st.name} top flange`};
 const tipEdge=st.L-lay.rows[1],plateEdge=plate.half-lay.outer,onFlange=lay.xs.filter(x=>x<st.bf/2),offFlange=lay.xs.filter(x=>x>=st.bf/2);
 // The plate cantilevers from the rolled fillet toe or a stiffener (holes through the flange) or from the flange tip (holes beyond it).
 const bWeb=onFlange.length?Math.min(...onFlange)-st.tw/2:Infinity,bStiff=s&&onFlange.length?e.bolts.gauge/2-s.t/2:Infinity,bTip=offFlange.length?Math.min(...offFlange)-st.bf/2:Infinity;
 const bp=Math.min(bWeb,bStiff,bTip),pitch=Math.min(g.spacing,3.5*bp),columnWeld=r.flangeJoint==='fillet'?r.flangeWeld:0;
 const checks=[
  compared('end-bearing-seat-bearing',`${plate.name} · bolt bearing / tearout`,V,plateBearing(db,g.hole,plate.t,plate.Fu,Math.min(plateEdge,tipEdge),g.spacing,method).capacity,'force','R_n=\\min(1.2l_ctF_u,2.4dtF_u)',`Standard holes in the ${plate.name.toLowerCase()}; clear distance to the nearer of its end along the runway and the stub tip.`),
  compared('end-bearing-seat-prying',`${plate.name} · thickness for no prying`,tMin(T,bp-db/2,pitch,plate.Fu),plate.t,'length','t_{min}=\\sqrt{\\frac{4Tb^\\prime}{\\phi pF_u}}',`The plate cantilevers b = ${f(bp)} from ${bp===bTip?'the flange tip':bp===bStiff?'the bearing stiffener':'the stub web'}.`),
  compared('end-bearing-stub-edge',`${plate.name} · bolt edge distance`,1.5*db,Math.min(plateEdge,tipEdge,...(seat?[lay.rows[0]-seat.y0]:[]),...(seat&&onFlange.length?[st.bf/2-Math.max(...onFlange)]:[])),'length','e\\ge1.5d_b',`${seat?'Seat':'Flange'} end ${f(plateEdge)} beyond the outermost hole, stub tip ${f(tipEdge)} beyond the outer row${seat?`, seat end ${f(lay.rows[0]-seat.y0)} at the column${onFlange.length?`, flange tip ${f(st.bf/2-Math.max(...onFlange))} beyond the holes through the flange`:''}`:''}.`),
  compared('end-bearing-wrench-stub-column','Nut clearance below the bracket · column face weld',clearance,lay.rows[0]-columnWeld,'length','y_{row}-w\\ge c_{wrench}',`Inner bolt row ${f(lay.rows[0])} from the column face${columnWeld?`, less the ${f(columnWeld)} flange fillet`:''}.`),
  compared('end-bearing-seat-fit',`Bearings and bolts fit on the ${seat?'spreader seat':'stub flange'}`,bearingExtent(p)+seatSettingTolerance,plate.half,'length',p.system==='simple'?'g/2+L_{bearing}+t_{set}\\le L/2':'L_{bearing}+t_{set}\\le L/2',(p.system==='simple'?`Each girder bearing, and its bolts, on its own half at a shared grid; at a runway-end grid ${endGridCentered(p)?'the bearing is centered on the web':'the girder end is on the grid'}.`:'Interior bearings centered on the stub web; at a runway end the girder end is on the grid, the whole bearing on one side.')+' Includes the 1/8 in bearing setting tolerance (AIST TR-13 §5.18 seat plan position ±1/8 in).'),
  ...endGridFitChecks(p,plate.half,seat?'the spreader seat':'the stub flange','L/2',compared)
 ];
 if(onFlange.length)checks.push(compared('end-bearing-wrench-stub-web','Nut clearance below the stub flange · web and rolled fillet',clearance,Math.min(...onFlange)-st.k1,'length','|x_{bolt}|-k_1\\ge c_{wrench}',`Innermost hole through the flange ${f(Math.min(...onFlange))} from the web plane (a runway-end grid puts the girder end on the grid); k1 = ${f(st.k1)} to the toe of the design fillet.`));
 if(offFlange.length&&seat)checks.push(compared('end-bearing-wrench-stub-tip','Nut clearance below the seat · flange tip and seat fillet',clearance,Math.min(...offFlange)-st.bf/2-seat.weld,'length','|x_{bolt}|-b_f/2-w\\ge c_{wrench}',`Holes beyond the flange pass through the seat only; the nearest is ${f(Math.min(...offFlange))} from the web plane.`));
 if(s&&onFlange.length)checks.push(compared('end-bearing-wrench-stub-stiffener','Nut clearance below the stub flange · bearing stiffeners',clearance,e.bolts.gauge/2-s.t/2-s.weld,'length','g/2-t_s/2-w\\ge c_{wrench}',`Stiffeners at the girder web line; bolt rows ${f(e.bolts.gauge/2)} each side.`));
 return checks;
}

/** serviceReaction: the largest unfactored support reaction with all cranes, impact and dead load (AIST §5.9.2). */
export function rolledBracketChecks(p:ProjectInput,res:RolledBracketResults,serviceReaction?:number):CheckResult[]{
 const b=p.details!.bracket!,m=p.details!.material,c=b.receiver,E=p.section.E,st=rolledStub(b)!,r=st.input,checks:CheckResult[]=[],u=p.units,seat=st.seat;
 const fmt=(v:number,q:'length'|'force'|'moment'|'stress'='length')=>format(v,q,u,3),{a,e,lb,W}=stubBearing(p),Fy=r.Fy;
 const refs=['w-bracket-basis','tr13-bracket'];
 // The receiver and load-path gates keep the plate bracket's ids, so their delegated-check handling applies unchanged.
 const gate=(id:string,title:string,ok:boolean,note:string,byOthers=false)=>checks.push({id:'bracket-'+id,group:'Column bracket',title,status:ok?(byOthers?'excluded':'pass'):'unverified',equation:'',note,referenceIds:['w-bracket-basis']});
 const add=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,caseId?:string,referenceIds=refs)=>checks.push({id:'wbracket-'+id,group:'Column bracket',title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&demand<=capacity*(1+1e-9)?'pass':'fail',equation,note,caseId,referenceIds});
 const na=(id:string,title:string,equation:string,note:string)=>checks.push({id:'wbracket-'+id,group:'Column bracket',title,status:'not-applicable',equation,note,referenceIds:refs});
 const S=res.strength,from=(key:string,id:string,title:string,capacity:number,q:CheckResult['quantity'],eq:string,note:string,referenceIds=refs)=>add(id,title,S[key]?.value??0,capacity,q,eq,note,S[key]?.caseId,referenceIds);
 const isNew=!!(p.existingColumn?.enabled&&p.existingColumn.isNew);
 gate('receiver','Receiving column · surveyed geometry and material',c.confirmed&&!!c.source.trim(),c.source?`${c.source} ${isNew?'The new column member, base and foundation are checked under Supporting structure.':'Survey data only; the receiving column member, frame and foundation are not checked here (see Supporting structure).'}`:'Enter and confirm the receiving-column geometry and material; the reference frame is not a capacity input.');
 gate('load-path',tieColumnScope(p).title,b.loadPathConfirmed,`A rolled ${st.name} stub ${fmt(st.L)} long, ${isNew?'shop':'field'} welded to the column flange, carries the bearings on ${seat?'a welded spreader seat across its top flange':'its top flange'}. The bearing bolts deliver the locating end's longitudinal force and the bottom-flange lateral force ${seat?'to the seat, whose fillets pass them to the stub':'into the stub flange'}; the stub carries them to the column in weak-axis bending and torsion with its welds. ${tieColumnScope(p).sentence}`,tieColumnScope(p).byOthers);
 const common=`Every concurrent case of the bracket design force envelope, both senses of the bottom-flange lateral force, with the self-weight of the stub, stiffeners${seat?' and seat':''} (1.4 LRFD / 1.0 ASD). V at the far bearing edge e = ${fmt(e)} from the column face; the seat moment ΣV·x twists the stub${seat?'; the seat strip spans between the flange tips and delivers its reactions there':''}.`;
 // Stub flexure, shear and combined stresses at the column face.
 const fl=stubFlexure(st,E,Fy,2*st.L);
 from('moment','stub-flexure',`${st.name} stub · flexure at the column face`,available(fl.Mn,p.method,.9,1.67),'moment','M_u=Ve+Hz_t\\le\\phi M_n=\\phi\\min[M_{n,F2}(L_b=2L,C_b=1),M_{n,F3}]',`${common} ${fl.compactFlange?'Compact flanges (F2)':`Noncompact flanges, λ = ${fl.lambda.toFixed(2)} > λp = ${fl.lp.toFixed(2)} (F3)`}; lateral-torsional buckling with Lb = 2L = ${fmt(2*st.L)} for the cantilever free at its tip and Cb = 1.0 (Lp = ${fmt(fl.Lp)}): ${fl.branch}. No restraint is credited to the girder bolted to the tip.`,['w-bracket-basis','aisc-f2']);
 const sh=stubShear(st,E,Fy,p.method);
 from('shear','stub-shear',`${st.name} stub · web shear`,sh.capacity,'force','V_u\\le\\phi_v0.6F_yA_wC_{v1},\\;A_w=dt_w',`G2.1 rolled I-shape, Cv1 = ${sh.Cv1.toFixed(3)}.`,['w-bracket-basis','aisc-g']);
 from('flangeShear','stub-flange-shear',`${st.name} stub · flange lateral shear (torsion and longitudinal force)`,available(.6*Fy*st.bf*st.tf,p.method,.9,1.67),'force','Q=F/2\\pm T/h_0,\\;T=\\Sigma V_ix_i+Fz_t\\le\\phi0.6F_yb_ft_f',`G6 weak-axis shear of one flange (Cv2 = 1). The longitudinal force F from the locating bearing bolts acts at the top of the ${seat?'seat':'flange'}; the torque from the seat moment and F above the shear center is carried by opposite flange shears at h0 = ${fmt(st.h0)} (warping fixed at the column face; Saint-Venant relief not credited).`,['w-bracket-basis','aisc-g']);
 from('interaction','stub-interaction',`${st.name} stub · axial and biaxial flexure (H1)`,1,'ratio','\\frac{P_r}{P_c}+\\frac89\\left(\\frac{M_{rx}}{M_{cx}}+\\frac{M_{ry}}{M_{cy}}\\right)\\le1','Pr = H (tension through the bearing bolts, or compression against the column) with Pc by D2 or E3 (KL = 2L about y); Mrx = Ve + H·zt; Mry = F·a + H·xH about the vertical axis with Mcy per F6. Torsion is in the H3.3 stress check.',['w-bracket-basis','aisc-h']);
 from('normal','stub-combined',`${st.name} stub · combined normal stress at the column face (H3.3)`,available(Fy,p.method,.9,1.67),'stress','f=\\frac{|N|}{A}+\\frac{|M_x|}{S_x}+\\frac{|Q|a+|Hx_H|}{t_fb_f^2/6}\\le\\phi F_y',`Elastic sum at the flange tips, including the flange lateral bending from torsion and the longitudinal force (Q·a, the conservative flange-bending bound on the warping stress at the fixed end, a = ${fmt(a)}).`,['w-bracket-basis','aisc-h3']);
 // Concentrated load under the bearing.
 const wb=stubWebBearing(st,E,Fy,a,lb,p.method),stiff=stubStiffener(st,E,Fy,a,p.method),Rweb=S.webBearing?.value??0,required=Rweb>Math.min(wb.yielding,wb.crippling)*(1+1e-9);
 const webNote=`ΣV over lb = ${fmt(lb)} (the narrower of the bearing plate width and the girder flange) at the girder web line, ${fmt(wb.tip)} from the stub tip${wb.yieldEnd?' (within d: end-of-member case)':''}; k = kdes = ${fmt(st.k)}.`;
 for(const [id,title,cap,eq,end] of [['web-yielding','web local yielding (J10.2)',wb.yielding,`R_n=F_yt_w(${wb.yieldEnd?'2.5':'5'}k+l_b)`,wb.yieldEnd],['web-crippling','web crippling (J10.3)',wb.crippling,wb.crippleEnd?`R_n=0.40t_w^2[1+${lb/st.d>.2?'(4l_b/d-0.2)':'3(l_b/d)'}(t_w/t_f)^{1.5}]\\sqrt{EF_yt_f/t_w}`:'R_n=0.80t_w^2[1+3(l_b/d)(t_w/t_f)^{1.5}]\\sqrt{EF_yt_f/t_w}',wb.crippleEnd]] as const){
  if(stiff&&Rweb>cap*(1+1e-9))na(id,`${st.name} stub · ${title}`,eq,`Unstiffened web strength ${fmt(cap,'force')} is below the ${fmt(Rweb,'force')} bearing force: the J10.8 bearing stiffeners take the full force (stiffener checks). ${webNote}`);
  else from('webBearing',id,`${st.name} stub · ${title}`,cap,'force',eq,`${webNote}${end&&id==='web-crippling'?' Within d/2 of the stub tip: end case.':''}${stiff?' Bearing stiffeners are also provided.':''}`,['w-bracket-basis','aisc-j']);
 }
 if(stiff){
  checks.push({id:'wbracket-stiffener-required',group:'Column bracket',title:'Bearing stiffeners · J10.8',status:'pass',equation:'R_u>\\phi R_{n,J10.2/J10.3}\\Rightarrow\\text{stiffeners}',caseId:S.webBearing?.caseId,referenceIds:['w-bracket-basis','aisc-j'],
   note:`${required?`Required: the ${fmt(Rweb,'force')} bearing force exceeds the unstiffened web strength.`:`Provided; the unstiffened web alone carries the ${fmt(Rweb,'force')} bearing force.`} ${seat?'The seat strip reactions at the flange tips':'The girder reactions on the flange outstands'} also bear on them. A pair of ${fmt(stiff.t)} plates, ${fmt(stiff.width)} outstand, full depth between the flanges with ${fmt(stiff.clip)} corner clips, fitted to bear on the top flange and welded to the web and both flanges.`});
  const minT=Math.max(st.tf/2,stiff.width/16,stiff.width/(.56*Math.sqrt(E/Fy)));
  add('stiffener-proportions','Bearing stiffeners · width and thickness (J10.8)',Math.max(minT/stiff.t,(st.bf/3-st.tw/2)/stiff.width),1,'ratio','\\max\\left(\\frac{\\max(t_f/2,\\,b_s/16,\\,b_s/0.56\\sqrt{E/F_y})}{t_s},\\frac{b_f/3-t_w/2}{b_s}\\right)\\le1',`t = ${fmt(stiff.t)} against ${fmt(minT)}; b_s = ${fmt(stiff.width)} against ${fmt(st.bf/3-st.tw/2)}.`,undefined,['w-bracket-basis','aisc-j']);
  from('stiffener','stiffener-column','Bearing stiffeners · column with load eccentricity (J10.8, J4.4/E, H1)',1,'ratio','\\frac{P}{\\phi P_n/2}+\\frac89\\frac{P|x-x_c|}{\\phi F_yZ_s}\\le1',`Each stiffener with half of a ${stiff.interior?'25':'12'}tw web strip (${fmt(stiff.strip)}) takes the reactions on its flange outstand, P at x from the web plane; pair KL = 0.75h = ${fmt(stiff.KL)}, KL/r = ${stiff.slender.toFixed(1)} (${stiff.slender<=25?'J4.4: Pn = FyAg':'Chapter E'}), φPn of the pair ${fmt(stiff.column,'force')}. The eccentricity from the centroid x_c = ${fmt(stiff.xc)} bends the plate in its plane, Zs = t b²/4.`,['w-bracket-basis','aisc-j','aisc-e','aisc-h']);
  from('stiffenerForce','stiffener-bearing','Bearing stiffeners · fitted bearing (J7)',stiff.bearing,'force','R_n=1.8F_yA_{pb},\\;A_{pb}=(b_s-c)t_s',`One stiffener: contact beyond the ${fmt(stiff.clip)} corner clip.`,['w-bracket-basis','aisc-connections']);
  from('stiffenerWeld','stiffener-weld','Bearing stiffeners · welds to the web and bottom flange',available(.6*m.Fexx,p.method,.75,2),'stress','f=\\sqrt{(M_zv/J)^2+(P/A-M_zu/J)^2},\\;M_z=P(x-t_w/2-u_c)',`${fmt(stiff.weld)} fillets both faces of each stiffener, ${fmt(stiff.weldLength)} on the web and ${fmt(stiff.flangeWeldLength)} on the bottom flange, elastic group under the stiffener reaction at its eccentricity; no directional increase. The top is fitted to bear and also welded.`,['w-bracket-basis','aisc-connections']);
  add('stiffener-weld-minimum','Stiffener fillets · minimum leg (J2.4)',minimumFillet(Math.max(stiff.t,st.tw,st.tf)),stiff.weld,'length','w\\ge w_{min,J2.4}','Thicker of the stiffener and the stub web or flange.',undefined,['w-bracket-basis','aisc-connections']);
  na('flange-outstand',`${st.name} top flange · bending of the outstands under the bearings`,'M=P(x-k_1)',`The bearing stiffeners under the girder web line support the flange outstands where the ${seat?'seat strip reactions':'girder bearings'} act.`);
 }else{
  if(required)add('stiffener-required','Bearing stiffeners · J10.8',Rweb,Math.min(wb.yielding,wb.crippling),'force','R_u\\le\\phi R_{n,J10.2/J10.3}','The bearing force exceeds the unstiffened web strength: provide full-depth bearing stiffeners under the girder web line (J10.8).',S.webBearing?.caseId,['w-bracket-basis','aisc-j']);
  from('outstand','flange-outstand',`${st.name} top flange · bending of the outstands under the bearings`,available(Fy*st.tf**2/4,p.method,.9,1.67),'force','\\frac{P(x-k_1)}{l_b+2(x_{near}-k_1)}\\le\\phi F_yt_f^2/4',`Each flange outstand cantilevers from the rolled fillet toe k1 = ${fmt(st.k1)} under the ${seat?'seat strip reaction at its tip':'girder reactions on it'}, over the bearing length along the stub widened at 45° from the nearest load. Moment per unit width; without stiffeners.`);
 }
 // Spreader seat.
 if(seat){
  from('seatNormal','seat-flexure','Spreader seat · plate bending',available(m.Fy,p.method,.9,1.67),'stress','M(x)=\\sum R_j\\langle x-r_j\\rangle-\\sum(q_i/2)[\\langle x-a_i\\rangle^2-\\langle x-b_i\\rangle^2];\\quad f=6M_{max}/(b_pt_p^2)',`Seat strip on the two flange tips (±${fmt(st.bf/2)}) with its overhangs, uniform contact under each bearing patch, simultaneous reactions; strip width = bearing width ${fmt(W)}.`);
  from('seatShear','seat-shear','Spreader seat · peak shear',available(.6*m.Fy,p.method,.9,1.67),'stress','\\tau=1.5|V_{strip,max}|/(b_pt_p)','Maximum strip shear on either side of each load and flange-tip support.');
  from('seatWeld','seat-weld','Seat to stub flange tips · fillet welds',available(.6*m.Fexx,p.method,.75,2),'stress','f=\\sqrt{\\left(\\frac{R_{up}}{t_eb_p}\\right)^2+\\left(\\frac{F}{2t_eL}\\right)^2+\\left(\\frac{H}{2t_eL}\\right)^2}',`A ${fmt(seat.weld)} fillet along each flange tip, ${fmt(seat.y1-seat.y0)} long: the strip's uplift reaction at a tip over the bearing width, and the longitudinal and lateral forces of the bearing bolts over both lines (no bolt-shear credit).`,['w-bracket-basis','aisc-connections']);
  add('seat-weld-minimum','Seat fillet · minimum leg (J2.4)',minimumFillet(Math.max(seat.t,st.tf)),seat.weld,'length','w\\ge w_{min,J2.4}','Thicker of the seat plate and the stub flange.',undefined,['w-bracket-basis','aisc-connections']);
  add('seat-weld-maximum','Seat fillet · flange-edge limit (J2.2b)',seat.weld,st.tf<6.35?st.tf:st.tf-1.5875,'length','w\\le t_f-1/16\\,in','Along the flange tip edge; no full-throat edge buildup credited.',undefined,['w-bracket-basis','aisc-connections']);
 }
 // Stub-to-column welds.
 const g=stubWeldGroup(st),phiW=available(.6*m.Fexx,p.method,.75,2),where=isNew?'Shop':'Field';
 const groupNote=`${common} The bearing bolts bring F (along the runway, at the girder web line ${fmt(a)} from the face) and H (both senses) at the top of the ${seat?'seat':'stub'}. Elastic weld group on the column face, throat stresses at the line ends, no directional strength increase. ${where} welds.`;
 if(g.cjp){
  from('cjp','flange-cjp',`${st.name} flanges to column · CJP groove welds`,1,'ratio','\\max\\left(\\frac{f_n}{\\phi F_y},\\frac{1.5Q/(b_ft_f)}{\\phi0.6F_y}\\right)\\le1',`Table J2.5: the CJP groove weld develops the flange with matching filler, base metal governing. Peak flange normal stress with the flange lateral bending, and the flange lateral shear. ${where} welds.`,['w-bracket-basis','aisc-connections']);
  from('webWeld','web-weld',`${st.name} web to column · fillet welds`,phiW,'stress','f=\\sqrt{\\left(\\frac{\\sigma_wt_w}{2t_e}\\right)^2+\\left(\\frac{V}{2t_eh}\\right)^2}',`Two ${fmt(r.webWeld)} fillets over h = ${fmt(g.webLength)} between the rolled fillets develop the web's normal stress at their ends and carry the vertical shear.`,['w-bracket-basis','aisc-connections']);
 }else{
  from('flangeWeld','flange-weld',`${st.name} flanges to column · fillet weld group`,phiW,'stress','f=\\sqrt{\\left(\\frac{H}{A}+\\frac{M_xv}{I_x}-\\frac{M_yu}{I_y}\\right)^2+\\left(\\frac{F}{A}-\\frac{M_zv}{J}\\right)^2+\\left(\\frac{V}{A}-\\frac{M_zu}{J}\\right)^2}',`${groupNote} ${fmt(r.flangeWeld)} fillets across the outer face of each flange (${fmt(st.bf)}) and on the inner face from the fillet toe to the tip (${fmt(g.innerLength)} each side). Peak on the flange lines.`,['w-bracket-basis','aisc-connections']);
  from('webWeld','web-weld',`${st.name} web to column · fillet welds in the group`,phiW,'stress','f=\\sqrt{n^2+t_x^2+t_y^2}',`${fmt(r.webWeld)} fillets both sides of the web over h = ${fmt(g.webLength)}, in the same elastic group. Peak on the web lines.`,['w-bracket-basis','aisc-connections']);
  from('flangeBase','flange-base',`${st.name} flanges / column flange · connected metal at the fillets`,Math.min(available(.6*Math.min(Fy,c.Fy),p.method,1,1.5),available(.6*Math.min(r.Fu,c.Fu),p.method,.75,2)),'stress','f_{base}=2f_wt_e/\\min(t_f,t_{cf})','Both fillets of a flange on the thinner of the stub flange and the column flange (J4.2 shear yielding and rupture bound the traction); column local effects below.',['w-bracket-basis','aisc-connections']);
  add('flange-weld-minimum','Flange fillets · minimum leg (J2.4)',minimumFillet(Math.max(st.tf,c.flangeThickness)),r.flangeWeld,'length','w\\ge w_{min,J2.4}','Thicker of the stub flange and the column flange.',undefined,['w-bracket-basis','aisc-connections']);
  add('flange-weld-length','Flange fillets · inner segments at least four sizes (J2.2b)',4*r.flangeWeld,g.innerLength,'length','l\\ge4w','Inner-face fillets from the rolled fillet toe to the flange tip; shorter segments would count at a reduced effective size.',undefined,['w-bracket-basis','aisc-connections']);
 }
 from('webBase','web-base',`${st.name} web / column flange · connected metal at the fillets`,Math.min(available(.6*Math.min(Fy,c.Fy),p.method,1,1.5),available(.6*Math.min(r.Fu,c.Fu),p.method,.75,2)),'stress','f_{base}=2f_wt_e/\\min(t_w,t_{cf})','Both web fillets on the thinner of the stub web and the column flange.',['w-bracket-basis','aisc-connections']);
 add('web-weld-minimum','Web fillets · minimum leg (J2.4)',minimumFillet(Math.max(st.tw,c.flangeThickness)),r.webWeld,'length','w\\ge w_{min,J2.4}','Thicker of the stub web and the column flange.',undefined,['w-bracket-basis','aisc-connections']);
 // Column side: the stub flange forces on the receiving column.
 const columnEnd=p.existingColumn?.enabled?p.existingColumn.height-p.existingColumn.seatElevation:0,flangeEnd=columnEnd<10*c.flangeThickness,webEnd=!(columnEnd>c.depth);
 const forceNote='Resultant stub flange force M/(d−tf) ± N/2; the flange in-plane moments from torsion are self-equilibrated across the column flange.';
 from('pull','column-flange','Column flange · local bending at the stub tension flange',available((flangeEnd?.5:1)*6.25*c.Fy*c.flangeThickness**2,p.method,.9,1.67),'force','P+3M_f/b_f\\le\\phi R_n=\\phi6.25F_{yf}t_f^2\\;(J10.1)',`Stub tension flange force M/(d−tf) + N/2 with its in-plane bending M_f from torsion and the longitudinal force, as twice the more loaded half-flange resultant over the ${fmt(st.bf)} flange.${flangeEnd?' Within 10tf of the column top, or the column height not entered: half strength.':''} No continuity plates.`,['w-bracket-basis','aisc-j']);
 from('couple','column-yield','Column web · local yielding at the stub flanges',available(c.Fy*c.webThickness*((webEnd?2.5:5)*c.flangeThickness+st.tf),p.method,1,1.5),'force',`R_n=F_yt_w(${webEnd?'2.5':'5'}k+l_b)\\;(J10.2)`,`${forceNote} k = tf of the column (no rolled fillet credit), lb = stub flange thickness ${fmt(st.tf)}.${webEnd?' End-region expression: the column top is within the column depth, or not entered.':''}`,['w-bracket-basis','aisc-j']);
 const N=st.tf,term=webEnd&&N/c.depth>.2?4*N/c.depth-.2:3*N/c.depth;
 from('push','column-crippling','Column web · crippling at the stub compression flange',available((webEnd?.4:.8)*c.webThickness**2*(1+term*(c.webThickness/c.flangeThickness)**1.5)*Math.sqrt(E*c.Fy*c.flangeThickness/c.webThickness),p.method,.75,2),'force',`R_n=${webEnd?'0.40':'0.80'}t_w^2[1+\\eta(t_w/t_f)^{1.5}]\\sqrt{EF_yt_f/t_w}\\;(J10.3)`,`${webEnd?'End-region':'Interior'} expression, lb = ${fmt(N)}. Confirmed receiver geometry required.`,['w-bracket-basis','aisc-j']);
 const h=c.depth-2*c.flangeThickness,sway=(h/c.webThickness)/(c.unbracedLength/c.width);
 if(sway<=1.7)from('push','column-sidesway','Column web · sidesway buckling',available(3.3e6*c.webThickness**3*c.flangeThickness/h**2*.4*sway**3,p.method,.85,1.76),'force','R_n=(C_rt_w^3t_f/h^2)[0.4((h/t_w)/(L_b/b_f))^3]','J10.4 unrestrained compression-flange rotation; conservative Cr regardless of column moment; entered largest flange unbraced length.',['w-bracket-basis','aisc-j']);
 else na('column-sidesway','Column web · sidesway buckling','(h/t_w)/(L_b/b_f)>1.7','AISC J10.4(b)(2): not applicable beyond 1.7.');
 const area=2*c.width*c.flangeThickness+h*c.webThickness,axialRatio=(p.method==='LRFD'?1:1.6)*(c.axialDemand+(S.vertical?.value??0))/(c.Fy*area);
 from('couple','column-panel','Column web · panel shear / axial reduction',available(.6*c.Fy*c.depth*c.webThickness*Math.max(0,Math.min(1,1.4-axialRatio)),p.method,.9,1.67),'force','R_n=0.6F_yd_ct_w\\min(1,1.4-\\alpha P_r/P_y)','J10.6(a), one-sided stub: the flange force is the panel shear; no inelastic panel-zone credit. Concurrent entered column axial force plus the bracket reaction. Global column strength remains separate.',['w-bracket-basis','aisc-j']);
 // Applicability, service and uplift.
 const service=res.service.vertical?.value??0;
 add('tr13-load','AIST column bracket · reaction recommendation',Math.max(service,serviceReaction??0),50*kip,'force',p.units==='SI'?'R_{bracket}<222.411\\,kN':'R_{bracket}<50\\,kip','Reference AIST Technical Report 13 §5.9.2: unfactored support reaction with all cranes, impact and dead load, as the Detailing column-bracket applicability check.',undefined,['w-bracket-basis','tr13-bracket']);
 for(const [key,limit,q,eq] of [['deflection',b.deflectionLimit,'length','\\delta=\\frac{Ve^3}{3EI_x}+\\frac{Ve}{GA_w}+\\theta_tx_{max}+\\delta_{seat}'],['rotation',b.rotationLimit,'ratio','\\theta=Ve^2/(2EI_x)']] as const){
  const peak=res.service[key];add(key,`Bracket · vertical ${key}`,peak?.value??0,limit,q,eq,`Unfactored single-crane service set; column fixed at the face. ${key==='deflection'?`Bending and shear of the stub to the far bearing edge, the drop of the outer bearing edge from the stub twist under the seat moment (Saint-Venant with warping fixed at the face; largest twist ${(res.service.twist?.value??0).toExponential(3)} rad)${seat?' and the seat strip bound with its overhangs':''}. `:''}User-entered incremental limits; building deformation is separate.`,peak?.caseId);
 }
 const eb=activeEndBearing(p),uplift=S.uplift?.value??0;
 if(eb)add('uplift','Bearing uplift · held down by the bearing bolts',uplift,4*boltCapacity({grade:eb.bolts.grade,diameter:eb.bolts.diameter,planes:1,surface:'B',shear:0,tension:uplift/4,method:p.method}).tension,'force','V_{uplift}\\le4\\phi R_{nt}',`Any uplift at a girder end is held down by its four bearing bolts in tension; bolt shear with tension and ${seat?'seat':'flange'} prying are checked under End bearings, and the stub checks above take the signed reactions.`,S.uplift?.caseId,['w-bracket-basis','aisc-connections']);
 else add('uplift','Bearing contact · uplift requiring separate restraint',uplift,1,'force','V_{uplift}\\le0','Gravity bearing without bolted end bearings: uplift above 1 N requires a separately designed hold-down.',S.uplift?.caseId);
 // Fatigue, AISC Appendix 3, under the duty spectrum (unfactored bin loads without impact).
 const F=res.fatigue,Cn=(cf:number,n:number,R=1)=>finiteLife(cf,n,R),total=p.fatigue.cycles,weldF=categoryF(total);
 const miner=(key:'flange'|'web'|'column'|'stiffenerToe'|'seat',limit:(n:number)=>number)=>F.reduce((s,v)=>s+(v[key]>0?(v[key]/limit(v.cycles))**3:0),0);
 const fatRefs=['w-bracket-basis','aisc-fatigue'],rFlange=transverseFilletFatigue(st.tf,r.flangeWeld,total).reduction,rWeb=transverseFilletFatigue(st.tw,r.webWeld,total).reduction;
 if(g.cjp)add('fatigue-flange','Stub flanges at the CJP welds · fatigue',miner('flange',n=>Cn(4.4,n)),1,'ratio','D=\\sum_i(\\Delta f_i/F_{SR,C})^3\\le1','Table A-3.1 item 5.4, Category C: base and weld metal at the toe of the CJP T-joint with the reinforcement left in place. Range per bin of the flange-tip stress (bending, axial, flange lateral bending); Miner sum, no endurance-limit credit.',undefined,fatRefs);
 else add('fatigue-flange','Stub flanges at the column fillets · fatigue',miner('flange',n=>Cn(4.4,n,rFlange)),1,'ratio','D=\\sum_i\\left(\\frac{\\Delta f_i}{R_{FIL}F_{SR,C}}\\right)^3\\le1',`Table A-3.1 item 5.6: the flanges are tension-loaded plate elements with a pair of transverse fillets; toe crack Category C, root crack C'' with R_FIL = ${rFlange.toFixed(3)} (A-3-6M) for tf = ${fmt(st.tf)}, w = ${fmt(r.flangeWeld)}. Range of the flange-tip stress per bin; Miner sum without endurance-limit credit.`,undefined,fatRefs);
 add('fatigue-web','Stub web at the column fillets · fatigue',miner('web',n=>Cn(4.4,n,rWeb)),1,'ratio','D=\\sum_i\\left(\\frac{\\Delta f_i}{R_{FIL}F_{SR,C}}\\right)^3\\le1',`Table A-3.1 item 5.6 for the web with its pair of fillets: web normal stress range at the ends of the web fillets, R_FIL = ${rWeb.toFixed(3)} for tw = ${fmt(st.tw)}, w = ${fmt(r.webWeld)}.`,undefined,fatRefs);
 add('fatigue-web-weld','Stub web fillets · throat fatigue',Math.max(0,...F.map(v=>v.webWeld)),weldF,'stress','\\Delta f_w\\le\\max[55,690(1.5/n)^{0.167}]','Table A-3.1 item 8.2, Category F on the throat; the largest unfactored range over the bins, from the ranges of the three throat components, assigned to all project cycles.',undefined,fatRefs);
 add('fatigue-column','Column flange at the stub weld toes · fatigue',miner('column',n=>Cn(.39,n)),1,'ratio','D=\\sum_i(\\Delta f_i/F_{SR,E^\\prime})^3\\le1;\\quad\\Delta f=\\Delta V e_c/S_c','Table A-3.1 item 7.2, Category E-prime: the web fillets are attachments longer than 4 in along the column. Range of the column flange stress from V·e_c on the receiving section; other building stress ranges excluded.',undefined,fatRefs);
 if(stiff){
  add('fatigue-stiffener-weld','Stiffener fillets · throat fatigue',Math.max(0,...F.map(v=>v.stiffenerWeld)),weldF,'stress','\\Delta f_w\\le\\max[55,690(1.5/n)^{0.167}]','Table A-3.1 item 8.2, Category F on the throat of the stiffener-to-web and bottom-flange fillets; the largest range for all project cycles.',undefined,fatRefs);
  add('fatigue-stiffener-toe','Stub at the stiffener weld toes · fatigue',miner('stiffenerToe',n=>Cn(4.4,n)),1,'ratio','D=\\sum_i(\\Delta f_i/F_{SR,C})^3\\le1','Table A-3.1 item 5.7, Category C: stub flange and web at the toes of the transverse stiffener fillets, range of the stub bending stress at the stiffener. The stiffener itself is in compression.',undefined,fatRefs);
 }
 if(seat){
  const cat=st.tf<2*inch?4.4:2.2;
  add('fatigue-seat','Spreader seat at the flange-tip fillets · fatigue',miner('seat',n=>Cn(cat,n)),1,'ratio',`D=\\sum_i(\\Delta f_i/F_{SR,${cat===4.4?'C':'D'}})^3\\le1`,`Table A-3.1 item 7.1: the flange tip is a transverse attachment to the seat, a = tf = ${fmt(st.tf)} along the seat stress (${cat===4.4?'under 2 in, Category C':'Category D'}). Range of the seat strip bending stress; Miner sum without endurance-limit credit.`,undefined,fatRefs);
  add('fatigue-seat-weld','Seat fillets · throat fatigue',Math.max(0,...F.map(v=>v.seatWeld)),weldF,'stress','\\Delta f_w\\le\\max[55,690(1.5/n)^{0.167}]','Table A-3.1 item 8.2, Category F: range of the uplift throat stress at a flange tip, all project cycles.',undefined,fatRefs);
 }
 if(!activeColumnStiffeners(b))return checks;
 // Column stiffeners at the stub flanges: the stiffened model replaces failing unstiffened J10.1-J10.4 checks.
 const cap=(id:string)=>checks.find(v=>v.id==='wbracket-'+id&&v.capacity!==undefined)?.capacity;
 const item=(id:string,label:string)=>{const v=cap(id);return v===undefined?[]:[{id,label,value:v}];};
 const out=stiffenedColumnChecks(p,checks,['column-flange','column-yield','column-crippling','column-sidesway'].map(v=>'wbracket-'+v)).map(v=>v.id==='wbracket-column-panel'?{...v,note:v.note+panelStiffenerNote}:v);
 out.push(...columnStiffenerChecks(p,{prefix:'wbracket',refs,demand:{upperT:S.stiffUpperT,upperC:S.stiffUpperC,lowerT:S.stiffLowerT,lowerC:S.stiffLowerC},
  tension:[...item('column-flange','J10.1 flange local bending'),...item('column-yield','J10.2 web local yielding')],compression:[...item('column-yield','J10.2 web local yielding'),...item('column-crippling','J10.3 web crippling')],sidesway:item('column-sidesway','J10.4 web sidesway buckling')[0],
  fatigue:F.map(v=>({cycles:v.cycles,upper:v.stiffUpper??0,lower:v.stiffLower??0,column:v.column})),
  columnStressNote:'Range per duty bin of the column flange stress from V·e_c on the receiving section, as the stub-toe check; other building stress ranges are excluded. Miner sum, no endurance-limit credit.'}));
 return out;
}
/**
 * Crane-level bracing collector at a new column: the girder's locating bearing bolts deliver the bay's longitudinal
 * force F to the bracket, and the stub-to-column weld group carries it to the column (weak-axis bending and torsion of
 * the group, F at the girder web line and the top of the seat).
 */
export function rolledCollectorWeld(p:ProjectInput,F:number){
 const st=projectStub(p),g=stubWeldGroup(st),{a,e}=stubBearing(p),r=st.input;
 const f=stubActions(st,a,e,[],{longitudinal:F,bottom:0,offset:0}),w=stubWeldStress(st,g,a,f);
 // With CJP flanges the flanges carry F as flange lateral shear (G6 base metal through the groove weld).
 const stress=g.cjp?1.5*Math.max(Math.abs(f.Qtop),Math.abs(f.Qbot))/(st.bf*st.tf):Math.max(w.flange,w.web);
 const capacity=g.cjp?available(.6*r.Fy,p.method,.9,1.67):available(.6*p.details!.material.Fexx,p.method,.75,2);
 return {stress,capacity,st,cjp:g.cjp,a};
}
