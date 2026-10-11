/**
 * New built-up tapered I haunch welded to the flange of an existing W column ('tapered-haunch'): a vertical tapered
 * web plate in the plane of the grid, a level top flange that is the seat of both girder bearings, a sloping bottom
 * flange, a pair of full-depth bearing stiffeners under the girder web line and an optional tip end plate. The
 * flanges are CJP groove (or fillet) welded and the web fillet welded to the column flange in the field.
 *
 * The haunch is a tapered, built-up version of the rolled W stub (rolledBracket.ts): the same concurrent bracket
 * force sets, torsion carried by flange bending with warping fixed at the column, the stub weld-group idea and the
 * J10 receiver checks, evaluated on the vertical sections h(y) of the taper. AISC 360-16 B4.1, D2, E3, F4, F5, F6,
 * F13.2, G2.1, G6, H1, H3.3, J2, J4.2, J7, J10 and Appendix 3, after AISC Design Guide 25 (stress form on the
 * sections of a web-tapered member); AIST TR-13 §5.9.2. Canonical units N, mm, MPa.
 *
 * Axes: x along the runway from the grid (the web plane), y along the haunch from the column face, z up.
 */
import type {ProjectInput,CheckResult} from './types';
import type {BracketLoads,SeatHorizontal} from './bracketDesign';
import type {EndBearingInput} from './endBearingInputs';
import {available} from './aiscStrength';
import {minimumFillet,filletEffectiveSize,compressionResistance,transverseFilletFatigue,plateBearing,boltCapacity,boltProperties} from './connectionStrength';
import {format} from './units';
import {haunchGeometry,haunchSection,haunchWeight,isTaperedHaunch,flangeRunout,haunchSlopeLimit,type HaunchGeometry,type HaunchSection} from './taperedHaunchInputs';
import {stubBearing,stubBoltLayout,bearingExtent} from './rolledBracket';
import {activeEndBearing} from './endBearingInputs';

const inch=25.4,kip=4448.2216152605;
type Peak={value:number;caseId:string;x:number;
 /** Station along the haunch, and the demand and capacity there, where the check scans the taper. */
 y?:number;demand?:number;capacity?:number};
export const usesTaperedHaunch=(p:ProjectInput)=>!!p.details?.bracket?.enabled&&isTaperedHaunch(p.details.bracket);
/** Geometry of the project's haunch. */
export const projectHaunch=(p:ProjectInput)=>haunchGeometry(p.details!.bracket!,p.details!.bearing.width);
const clamp=(v:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,v));
const simpson=(f:(x:number)=>number,a:number,b:number,n=128)=>{if(b<=a)return 0;const h=(b-a)/n;let s=f(a)+f(b);for(let i=1;i<n;i++)s+=(i%2?4:2)*f(a+i*h);return s*h/3;};

/**
 * AISC F4 (compact or noncompact web) or F5 (slender web) strong-axis nominal moment of a welded I section, singly
 * or doubly symmetric, with the compression flange bfc x tfc: compression flange yielding (Rpc / Rpg), lateral-torsional
 * buckling with Lb and Cb, compression flange local buckling with kc, tension flange yielding. Moments in N mm.
 */
export function weldedIFlexure(s:{Sxc:number;Sxt:number;Zx:number;hc:number;hp:number;hw:number;tw:number;bfc:number;tfc:number;Iyc:number;Iy:number;J:number;h0:number},E:number,Fy:number,Lb:number,Cb=1){
 const root=Math.sqrt(E/Fy),Myc=Fy*s.Sxc,Myt=Fy*s.Sxt,My=Fy*Math.min(s.Sxc,s.Sxt),Mp=Math.min(Fy*s.Zx,1.6*My);
 const lw=s.hc/s.tw,lrw=5.70*root,lpw=Math.min(lrw,(s.hc/Math.max(s.hp,1e-9))*root/(.54*Mp/My-.09)**2);
 const kc=clamp(4/Math.sqrt(s.hw/s.tw),.35,.76),lf=s.bfc/(2*s.tfc),lpf=.38*root;
 const aw=Math.min(10,s.hc*s.tw/(s.bfc*s.tfc)),rt=s.bfc/Math.sqrt(12*(1+aw/6)),ratio=s.Sxt/s.Sxc;
 const web=lw<=lpw?'compact':lw<=lrw?'noncompact':'slender';
 if(web!=='slender'){
  // F4: web plastification factors for the compression and tension flanges (F4-9, F4-15), FL (F4-6a/b).
  const R=(My_:number)=>s.Iyc/s.Iy>.23?(lw<=lpw?Mp/My_:Math.min(Mp/My_,Mp/My_-(Mp/My_-1)*(lw-lpw)/(lrw-lpw))):1;
  const Rpc=R(Myc),Rpt=R(Myt),FL=ratio>=.7?.7*Fy:Math.max(.5*Fy,Fy*ratio),cfy=Rpc*Myc;
  const j=s.J/(s.Sxc*s.h0),Lp=1.1*rt*root,Lr=1.95*rt*E/FL*Math.sqrt(j+Math.sqrt(j*j+6.76*(FL/E)**2));
  const ltb=Lb<=Lp?cfy:Lb<=Lr?Math.min(cfy,Cb*(cfy-(cfy-FL*s.Sxc)*(Lb-Lp)/(Lr-Lp))):Math.min(cfy,Cb*Math.PI**2*E/(Lb/rt)**2*Math.sqrt(1+.078*j*(Lb/rt)**2)*s.Sxc);
  const lrf=.95*Math.sqrt(kc*E/FL),cflb=lf<=lpf?Infinity:lf<=lrf?cfy-(cfy-FL*s.Sxc)*(lf-lpf)/(lrf-lpf):.9*E*kc*s.Sxc/lf**2;
  const tfy=s.Sxt>=s.Sxc?Infinity:Rpt*Myt;
  return {clause:'F4',web,R:Rpc,Rpt,cfy,ltb,cflb,tfy,Mn:Math.min(cfy,ltb,cflb,tfy),Lp,Lr,rt,lw,lpw,lrw,lf,lpf,lrf,kc,FL,aw};
 }
 // F5 slender web: bending strength reduction Rpg (F5-6), LTB and CFLB critical stresses.
 const Rpg=Math.min(1,1-aw/(1200+300*aw)*(lw-5.7*root)),cfy=Rpg*Myc,Lp=1.1*rt*root,Lr=Math.PI*rt*Math.sqrt(E/(.7*Fy));
 const Fltb=Lb<=Lp?Fy:Lb<=Lr?Math.min(Fy,Cb*(Fy-.3*Fy*(Lb-Lp)/(Lr-Lp))):Math.min(Fy,Cb*Math.PI**2*E/(Lb/rt)**2);
 const lrf=.95*Math.sqrt(kc*E/(.7*Fy)),Fflb=lf<=lpf?Fy:lf<=lrf?Fy-.3*Fy*(lf-lpf)/(lrf-lpf):.9*E*kc/lf**2;
 const ltb=Rpg*Fltb*s.Sxc,cflb=Rpg*Fflb*s.Sxc,tfy=s.Sxt>=s.Sxc?Infinity:Fy*s.Sxt;
 return {clause:'F5',web,R:Rpg,Rpt:1,cfy,ltb,cflb,tfy,Mn:Math.min(cfy,ltb,cflb,tfy),Lp,Lr,rt,lw,lpw,lrw,lf,lpf,lrf,kc,FL:.7*Fy,aw};
}
/** The section as a welded I with the bottom flange (sagging: top compression false) or the top flange in compression. */
const asI=(g:HaunchGeometry,s:HaunchSection,bottom=true)=>bottom
 ?{Sxc:s.Sxc,Sxt:s.Sxt,Zx:s.Zx,hc:s.hc,hp:s.hp,hw:s.hw,tw:g.tw,bfc:g.bb,tfc:g.tb,Iyc:s.Iyc,Iy:s.Iy,J:s.J,h0:s.h0}
 :{Sxc:s.Sxt,Sxt:s.Sxc,Zx:s.Zx,hc:2*(s.h-g.tt-s.ybar),hp:2*(s.h-g.tt-s.yp),hw:s.hw,tw:g.tw,bfc:s.bt,tfc:g.tt,Iyc:s.Iyt,Iy:s.Iy,J:s.J,h0:s.h0};

/**
 * Stations along the haunch from the root to the far bearing edge e, with the section properties and the AISC F4/F5
 * nominal moments for gravity (bottom flange in compression) and reversed (top flange in compression) bending.
 * Lateral-torsional buckling is a member limit state: the least F4/F5 LTB stress over the stations, with Lb = 2L
 * and Cb = 1 for the cantilever free at its tip, applies at every station (stress form after AISC DG25).
 */
export function haunchStations(g:HaunchGeometry,E:number,Fy:number,e:number,W:number,n=48){
 const ys=[...new Set([...Array.from({length:n+1},(_,i)=>e*i/n),g.a-W/2,g.a].filter(y=>y>=0&&y<=e).map(y=>Math.round(y*1e6)/1e6))].sort((u,v)=>u-v);
 const Lb=2*g.L;
 const raw=ys.map(y=>{const s=haunchSection(g,y);return {y,s,pos:weldedIFlexure(asI(g,s),E,Fy,Lb),neg:weldedIFlexure(asI(g,s,false),E,Fy,Lb)};});
 const Fpos=Math.min(...raw.map(v=>v.pos.ltb/v.s.Sxc)),Fneg=Math.min(...raw.map(v=>v.neg.ltb/v.s.Sxt));
 return raw.map(v=>{
  const pos={...v.pos,ltb:Fpos*v.s.Sxc},neg={...v.neg,ltb:Fneg*v.s.Sxt};
  pos.Mn=Math.min(pos.cfy,pos.ltb,pos.cflb,pos.tfy);neg.Mn=Math.min(neg.cfy,neg.ltb,neg.cflb,neg.tfy);
  return {...v,pos,neg,Fltb:Fpos};
 });
}
export type HaunchStation=ReturnType<typeof haunchStations>[number];
/** Governing AISC F4/F5 limit state of a station's nominal moment. */
export const flexureBranch=(f:HaunchStation['pos'])=>f.Mn===f.cfy?`${f.clause}.1 compression flange yielding`:f.Mn===f.ltb?`${f.clause}.2 lateral-torsional buckling`:f.Mn===f.cflb?`${f.clause}.3 compression flange local buckling`:`${f.clause}.4 tension flange yielding`;

/** AISC G2.1 web shear of a welded I section at depth d with clear web h: kv = 5.34 (no intermediate stiffeners, no tension field), phi 0.9. */
export function haunchWebShear(g:HaunchGeometry,s:HaunchSection,E:number,Fy:number,method:ProjectInput['method']){
 const ratio=s.hw/g.tw,limit=1.10*Math.sqrt(5.34*E/Fy),Cv1=ratio<=limit?1:limit/ratio;
 return {Cv1,ratio,limit,capacity:available(.6*Fy*s.Aw*Cv1,method,.9,1.67)};
}
/** AISC F6 minor-axis nominal moment of the haunch: Fy Zy <= 1.6 Fy Sy with flange local buckling of the more slender flange. */
export function haunchMinor(g:HaunchGeometry,s:HaunchSection,E:number,Fy:number){
 const root=Math.sqrt(E/Fy),Mp=Math.min(Fy*s.Zy,1.6*Fy*s.Sy),lambda=Math.max(s.bt/(2*g.tt),g.bb/(2*g.tb)),lp=.38*root,lr=root;
 return lambda<=lp?Mp:lambda<=lr?Mp-(Mp-.7*Fy*s.Sy)*(lambda-lp)/(lr-lp):.69*E/lambda**2*s.Sy;
}

/** Haunch actions under one concurrent force set, at the root unless noted. */
export interface HaunchActions {
 V:number;Mseat:number;e:number;F:number;H:number;xH:number;
 /** Strong-axis root moment about the root centroid (top flange in tension positive), axial force (tension positive), torque about the shear center. */
 Mx:number;N:number;T:number;
 /** Flange lateral shears at the shallowest loaded section (y = a) and lateral root moments of each flange (warping fixed at the column). */
 Qtop:number;Qbot:number;Mtop:number;Mbot:number;
 /** Flange forces at the root by the flange-force method: top tension, bottom compression along the sloping flange. */
 Tt:number;C:number;
 /** Reactions on each flange outstand (x<0, x>0) with their centroid distance from the web plane. */
 sides:{P:number;x:number}[];
}
/** Strong-axis moment at station y: V at e, and H at the top surface above the station's centroid on the column side of the bolts (y <= a). */
export const stationMoment=(f:Pick<HaunchActions,'V'|'e'|'H'>,s:HaunchSection,a:number)=>f.V*Math.max(0,f.e-s.y)+(s.y<=a?f.H*(s.h-s.ybar):0);
/**
 * Root actions: V at the far bearing edge e (every girder reaction at the conservative transverse eccentricity),
 * the seat moment ΣV·x about the web plane, F along the runway and H along the haunch at the top surface through the
 * bearing bolts. The torque is carried by opposite flange shears Q = T/h0(y) over the varying depth (no Saint-Venant
 * relief), so each flange's root lateral moment is T∫dy/h0 from the root to the load; F at the shear center bends the
 * flanges in proportion to their lateral stiffness; H at its offset xH is put on the top flange.
 */
export function haunchActions(g:HaunchGeometry,root:HaunchSection,e:number,loads:BracketLoads,h:SeatHorizontal):HaunchActions{
 const V=loads.reduce((s,v)=>s+v.vertical,0),Mseat=loads.reduce((s,v)=>s+v.vertical*v.offset,0),a=g.a;
 const F=h.longitudinal,H=h.bottom,xH=h.offset;
 const Mx=V*e+H*(root.h-root.ybar),N=H,T=Mseat+F*(root.h-root.sc);
 const rt=root.Iyt/(root.Iyt+root.Iyc),h0a=root.h0-g.s*a,I0=g.s>1e-9?Math.log(root.h0/h0a)/g.s:a/root.h0;
 const Qtop=F*rt+T/h0a,Qbot=F*(1-rt)-T/h0a,Mtop=F*rt*a+T*I0+H*xH,Mbot=(F*(1-rt)*a-T*I0)/g.cos;
 const Tt=Mx/root.h0+N/2,C=(Mx/root.h0-N/2)/g.cos;
 const sides=[-1,1].map(s=>{let P=0,m=0;
  for(const v of loads){const l=v.length??0,lo=v.offset-l/2,hi=v.offset+l/2;
   const frac=l>0?Math.max(0,Math.min(1,s>0?hi/l:-lo/l)):(s*v.offset>0?1:v.offset===0?.5:0);if(frac<=0)continue;
   const c=l>0?(s>0?(Math.max(lo,0)+hi)/2:(lo+Math.min(hi,0))/2):v.offset;P+=v.vertical*frac;m+=v.vertical*frac*Math.abs(c);}
  return {P,x:P?Math.abs(m/P):0};});
 return {V,Mseat,e,F,H,xH,Mx,N,T,Qtop,Qbot,Mtop,Mbot,Tt,C,sides};
}
/** Normal stress at the four flange tips at the root: [top -x, top +x, bottom -x, bottom +x] (tension positive). */
export function haunchTipStresses(g:HaunchGeometry,s:HaunchSection,f:HaunchActions){
 const n=f.N/s.A,top=f.Mx*(s.h-s.ybar)/s.Ix,bot=-f.Mx*s.ybar/s.Ix,St=g.tt*g.btr**2/6,Sb=g.tb*g.bb**2/6;
 return [n+top-f.Mtop/St,n+top+f.Mtop/St,n+bot-f.Mbot/Sb,n+bot+f.Mbot/Sb];
}

type Line={a:[number,number];b:[number,number];size:number;part:'top'|'bottom'|'web'};
/**
 * Haunch-to-column weld group on the column flange face, u along the runway and v up from the bottom of the root.
 * Fillet flange joints: a fillet across the outer face of each flange and on its inner face from the flange-to-web
 * fillet to the tip; CJP flanges leave only the web fillets in the group (the groove welds develop the flanges).
 * Web fillets on both sides between the flange-to-web fillets. Effective sizes per J2.2b; elastic properties about
 * the group centroid.
 */
export function haunchWeldGroup(g:HaunchGeometry){
 const lines:Line[]=[],{hr,tt,tbv,bb,tw}=g,bt=g.btr,w=g.flangeWebWeld,x0=tw/2+w;
 if(g.joint==='fillet'){
  lines.push({a:[-bt/2,hr],b:[bt/2,hr],size:g.flangeWeld,part:'top'},{a:[-bb/2,0],b:[bb/2,0],size:g.flangeWeld,part:'bottom'});
  for(const s of [-1,1])lines.push({a:[s*x0,hr-tt],b:[s*bt/2,hr-tt],size:g.flangeWeld,part:'top'},{a:[s*x0,tbv],b:[s*bb/2,tbv],size:g.flangeWeld,part:'bottom'});
 }
 const v0=tbv+w,v1=hr-tt-w;
 for(const s of [-1,1])lines.push({a:[s*tw/2,v0],b:[s*tw/2,v1],size:g.webWeld,part:'web'});
 const len=(l:Line)=>Math.hypot(l.b[0]-l.a[0],l.b[1]-l.a[1]),te=(l:Line)=>filletEffectiveSize(l.size,len(l))/Math.SQRT2;
 const A=lines.reduce((s,l)=>s+te(l)*len(l),0),vc=lines.reduce((s,l)=>s+te(l)*len(l)*(l.a[1]+l.b[1])/2,0)/A;
 const Ix=lines.reduce((s,l)=>s+te(l)*len(l)*(((l.a[1]+l.b[1])/2-vc)**2+(l.b[1]-l.a[1])**2/12),0),Iy=lines.reduce((s,l)=>s+te(l)*len(l)*(((l.a[0]+l.b[0])/2)**2+(l.b[0]-l.a[0])**2/12),0);
 const Abot=lines.filter(l=>l.part==='bottom').reduce((s,l)=>s+te(l)*len(l),0);
 return {lines,A,vc,Ix,Iy,J:Ix+Iy,Abot,te,len,webLength:v1-v0,innerTop:bt/2-x0,innerBottom:bb/2-x0,cjp:g.joint==='cjp'};
}
export type HaunchWeldGroup=ReturnType<typeof haunchWeldGroup>;
/**
 * Throat stresses of the weld group at a point (u, v): normal n (pulling away positive), shears tx along the runway
 * and ty vertical. Elastic method about the group centroid, no directional strength increase. The bottom flange's
 * sloping force has a vertical component C sin(alpha) at the face: it is added on the bottom-flange lines over their
 * throat area (no Résal relief of the web shear, so this is conservative). With CJP flanges the web fillets develop
 * the web's normal stress at their ends and carry the whole vertical shear.
 */
export function haunchWeldField(g:HaunchGeometry,grp:HaunchWeldGroup,root:HaunchSection,f:HaunchActions){
 if(grp.cjp){
  const te=g.webWeld/Math.SQRT2;
  return (_u:number,v:number,_part:Line['part'])=>{const n=(f.N/root.A+f.Mx*(v-root.ybar)/root.Ix)*g.tw/(2*te),ty=-f.V/(2*te*grp.webLength);return {n,tx:0,ty,f:Math.hypot(n,ty)};};
 }
 const arm=g.hr-grp.vc,Mx=f.V*f.e+f.H*arm,My=f.F*g.a-f.H*f.xH,Mz=-f.Mseat-f.F*arm,down=Math.max(0,f.C)*Math.sin(g.alpha)/Math.max(grp.Abot,1e-9);
 return (u:number,vAbs:number,part:Line['part'])=>{const v=vAbs-grp.vc,n=f.H/grp.A+Mx*v/grp.Ix-My*u/grp.Iy,tx=f.F/grp.A-Mz*v/grp.J,ty=-f.V/grp.A+Mz*u/grp.J-(part==='bottom'?down:0);return {n,tx,ty,f:Math.hypot(n,tx,ty)};};
}
/** Peak throat stress on the flange and web lines, and the components at every line end (for fatigue ranges). */
export function haunchWeldStress(g:HaunchGeometry,grp:HaunchWeldGroup,root:HaunchSection,f:HaunchActions){
 const at=haunchWeldField(g,grp,root,f);let flange=0,web=0;const points:{n:number;tx:number;ty:number;part:Line['part']}[]=[];
 for(const l of grp.lines)for(const q of [l.a,l.b]){const s=at(q[0],q[1],l.part);points.push({n:s.n,tx:s.tx,ty:s.ty,part:l.part});if(l.part==='web')web=Math.max(web,s.f);else flange=Math.max(flange,s.f);}
 return {flange,web,points};
}
/**
 * CJP flange joints, base metal governing (Table J2.5): the top flange tip stress and its lateral shear; the bottom
 * flange stress along its slope with the joint shear on the vertical face, sigma sin(alpha) cos(alpha) plus its
 * lateral shear. Ratios to phi Fy and phi 0.6 Fy.
 */
export function haunchCjpRatios(g:HaunchGeometry,root:HaunchSection,f:HaunchActions,method:ProjectInput['method'],Fy:number){
 const Fyd=available(Fy,method,.9,1.67),Fvd=available(.6*Fy,method,.9,1.67),tips=haunchTipStresses(g,root,f);
 const top=Math.max(Math.abs(tips[0]),Math.abs(tips[1])),Qt=1.5*Math.abs(f.Qtop)/(g.btr*g.tt);
 const sigma=Math.abs(f.C)/(g.bb*g.tb)+Math.abs(f.Mbot)/(g.tb*g.bb**2/6),Qb=1.5*Math.abs(f.Qbot)/(g.bb*g.tb),joint=sigma*Math.sin(g.alpha)*Math.cos(g.alpha)+Qb;
 return {top:Math.max(top/Fyd,Qt/Fvd),bottom:Math.max(sigma/Fyd,joint/Fvd),topStress:top,sigma,joint};
}

/**
 * Paired full-depth bearing stiffeners at the girder web line, J10.8: two plates with a web strip of 25tw (12tw
 * within 12.5tw of the tip or the column face) as a column of effective length 0.75h (J4.4 when KL/r <= 25, else
 * E3). Each stiffener with half the strip takes the reactions on its own flange outstand.
 */
export function haunchStiffener(g:HaunchGeometry,E:number,Fy:number,method:ProjectInput['method']){
 const s=g.stiffener,tw=g.tw,a=g.a,h=s.height;
 const interior=a>=12.5*tw&&g.L-a>=12.5*tw,strip=(interior?25:12)*tw,A=2*s.width*s.t+strip*tw;
 const Ix=strip*tw**3/12+2*(s.t*s.width**3/12+s.width*s.t*((tw+s.width)/2)**2),Iy=tw*strip**3/12+2*s.width*s.t**3/12;
 const r=Math.sqrt(Math.min(Ix,Iy)/A),KL=.75*h,slender=KL/r;
 const column=slender<=25?available(Fy*A,method,.9,1.67):compressionResistance(A,r,KL,E,Fy,method).capacity;
 const A1=s.width*s.t+strip*tw/2,xc=(s.width*s.t*(tw/2+s.width/2)+strip*tw/2*tw/4)/A1,bearingArea=(s.width-s.clip)*s.t;
 return {...s,interior,strip,A,r,KL,slender,column,half:column/2,xc,Z:s.t*s.width**2/4,bearing:available(1.8*Fy*bearingArea,method,.75,2),bearingArea,
  weldLength:h-2*s.clip,flangeWeldLength:s.width-s.clip};
}
export type HaunchStiffener=ReturnType<typeof haunchStiffener>;
/**
 * Where a stiffener takes the reactions on its flange outstand: at their centroid x from the web plane, or at the
 * stiffener tip for reactions beyond it, which the top flange carries there (top flange strip check).
 */
export const stiffenerLoadPoint=(g:HaunchGeometry,x:number)=>Math.min(x,g.tw/2+g.stiffener.width);
/**
 * Fillets of one stiffener (both faces): the vertical line on the web and the line on the sloping bottom flange,
 * elastic, under the stiffener reaction P at x from the web plane. Peak throat stress.
 */
export function haunchStiffenerWeldStress(g:HaunchGeometry,s:HaunchStiffener,P:number,x:number){
 const te=s.weld/Math.SQRT2,Lw=s.weldLength,Lf=s.flangeWeldLength;
 const lines:{a:[number,number];b:[number,number]}[]=[{a:[0,-Lw/2],b:[0,Lw/2]},{a:[s.clip,-s.height/2],b:[s.clip+Lf,-s.height/2]}];
 const len=(l:typeof lines[number])=>Math.hypot(l.b[0]-l.a[0],l.b[1]-l.a[1]),A=lines.reduce((t,l)=>t+2*te*len(l),0);
 const uc=lines.reduce((t,l)=>t+2*te*len(l)*(l.a[0]+l.b[0])/2,0)/A,vc=lines.reduce((t,l)=>t+2*te*len(l)*(l.a[1]+l.b[1])/2,0)/A;
 const J=lines.reduce((t,l)=>t+2*te*len(l)*(((l.a[0]+l.b[0])/2-uc)**2+((l.a[1]+l.b[1])/2-vc)**2+len(l)**2/12),0);
 const M=P*(Math.max(0,x-g.tw/2)-uc);
 return Math.max(...lines.flatMap(l=>[l.a,l.b]).map(([u,v])=>Math.hypot(-M*(v-vc)/J,-P/A+M*(u-uc)/J)));
}
/**
 * J10.2 and J10.3 for the girder reactions over the haunch web at the girder web line, with the end-of-member case
 * near the tip. k is the top flange plus the flange-to-web fillet (welded section).
 */
export function haunchWebBearing(g:HaunchGeometry,E:number,Fy:number,lb:number,method:ProjectInput['method']){
 const d=g.depth(g.a),k=g.tt+g.flangeWebWeld,tip=g.L-(g.a+lb/2),yieldEnd=tip<=d,crippleEnd=tip<d/2;
 const yielding=Fy*g.tw*((yieldEnd?2.5:5)*k+lb),r=lb/d,term=crippleEnd&&r>.2?4*r-.2:3*r;
 const crippling=(crippleEnd?.4:.8)*g.tw**2*(1+term*(g.tw/g.tt)**1.5)*Math.sqrt(E*Fy*g.tt/g.tw);
 return {d,k,tip,yieldEnd,crippleEnd,yielding:available(yielding,method,1,1.5),crippling:available(crippling,method,.75,2)};
}
/**
 * Top flange as the seat of each girder bearing, by the strip method (moment per unit width):
 * - across the haunch: each bearing patch, its length along the runway spread at 45° through the bearing plate,
 *   presses uniformly over the bearing plate width W and the flange strips cantilever both ways from the stiffener
 *   faces under the girder web line: m = P c^2 / (2 l W), c = W/2 - t_s/2; the flange alone, no credit for the
 *   bearing plate or the girder flange bending with it;
 * - along the runway: the part of a patch beyond the stiffener tip cantilevers from it over the bearing width
 *   widened at 45° from the nearest load.
 */
export function topFlangeStrip(g:HaunchGeometry,loads:BracketLoads,W:number,bearingThickness:number,bearingLength:number){
 const s=g.stiffener,c=Math.max(0,W/2-s.t/2),xs=g.tw/2+s.width;
 let across=0,along=0;
 for(const v of loads){
  const l=v.length??0;if(l<=0)continue;
  const spread=Math.min(l+2*bearingThickness,bearingLength);
  across=Math.max(across,Math.abs(v.vertical)*c**2/(2*spread*W));
  for(const sx of [-1,1]){const lo=sx*(v.offset-l/2),hi=sx*(v.offset+l/2),a=Math.max(Math.min(lo,hi),xs),b=Math.max(lo,hi);if(b<=xs)continue;
   const P=Math.abs(v.vertical)*(b-a)/l,x=(a+b)/2;along=Math.max(along,P*(x-xs)/(W+2*(a-xs)));}
 }
 return {across,along,moment:Math.max(across,along),c,xs};
}
/** Plate thickness at the column face and at the bracket: the nearer end of a flange is the column (y = 0). */
const receiverModulus=(c:{depth:number;width:number;flangeThickness:number;webThickness:number})=>{
 const I=2*c.width*c.flangeThickness*((c.depth-c.flangeThickness)/2)**2+c.webThickness*(c.depth-2*c.flangeThickness)**3/12;return I/(c.depth/2);
};
/**
 * Concurrent forces of the haunch flanges on the existing column at its two flange levels: the top flange tension
 * Tt = M/h0 + N/2 (with its in-plane bending from torsion, as twice the more loaded half-flange resultant
 * Tt + 3M_f/b_t, for J10.1) and the horizontal bottom flange compression C cos(alpha) = M/h0 - N/2, which the column
 * web takes (J10.2, J10.3, J10.4, J10.6), with the vertical component C sin(alpha) into the column flange. These are
 * the forces a continuity-plate (column stiffener) design at the bracket flange levels takes.
 */
export function haunchColumnForces(g:HaunchGeometry,f:HaunchActions){
 const tension=Math.max(0,f.Tt),compression=Math.max(0,f.C*g.cos);
 return {tension,compression,pull:tension>0?tension+3*Math.abs(f.Mtop)/g.btr:0,vertical:Math.max(0,f.C)*Math.sin(g.alpha),
  /** Elevations of the flange force lines below the top of the haunch. */
  topLevel:g.tt/2,bottomLevel:g.hr-g.tbv/2};
}

export interface TaperedHaunchResults {
 strength:Record<string,Peak>;service:Record<string,Peak>;
 /** Largest unfactored range per duty bin of each fatigue detail. */
 fatigue:{name:string;cycles:number;topFlange:number;bottomFlange:number;flangeWeb:number;stiffenerToe:number;column:number;webWeld:number;flangeWeld:number;flangeWebWeld:number;stiffenerWeld:number;flare:number}[];
 /** Governing concurrent actions at each grid. */
 stations:{x:number;caseId:string;vertical:number;seatMoment:number;rootMoment:number;torque:number;longitudinal:number;lateral:number;flangeTension:number;flangeCompression:number}[];
}
const fatigueKeys=['topFlange','bottomFlange','flangeWeb','stiffenerToe','column','webWeld','flangeWeld','flangeWebWeld','stiffenerWeld','flare'] as const;

/**
 * Collector of the haunch under every concurrent bracket force set (strength, both senses of the lateral force),
 * single-crane service set and duty-bin fatigue set, as the W stub.
 */
export function createTaperedHaunchCollector(p:ProjectInput){
 if(!usesTaperedHaunch(p))return undefined;
 const d=p.details!,b=d.bracket!,g=haunchGeometry(b,d.bearing.width),m=d.material,E=p.section.E,G=E/2.6,Fy=m.Fy,{e,W,lb}=stubBearing(p),Lbr=d.bearing.length,method=p.method;
 const stations=haunchStations(g,E,Fy,e,W),root=stations[0].s,grp=haunchWeldGroup(g),sf=haunchStiffener(g,E,Fy,method);
 const shear=stations.map(v=>haunchWebShear(g,v.s,E,Fy,method)),minor=stations.map(v=>available(haunchMinor(g,v.s,E,Fy),method,.9,1.67));
 const axialT=stations.map(v=>available(Fy*v.s.A,method,.9,1.67)),axialC=stations.map(v=>compressionResistance(v.s.A,Math.sqrt(v.s.Iy/v.s.A),2*g.L,E,Fy,method).capacity);
 const c=b.receiver,Sc=receiverModulus(c),sa=haunchSection(g,g.a),eb=activeEndBearing(p),lay=eb?stubBoltLayout(p,eb):undefined;
 // Flange-to-web shear flow on the credited section and, past the flare, on the full seat width (the larger).
 const flow=stations.map(v=>{const full=haunchSection(g,v.y,true);return Math.max(v.s.Qt/v.s.Ix,v.s.Qb/v.s.Ix,full.Qt/full.Ix,full.Qb/full.Ix);});
 const sf0=g.flare?haunchSection(g,g.flare.y0):undefined;
 // Top flange net section at the inner bolt row: every hole of the row across the flange (both girder ends at a shared
 // grid of simple spans), 1/16 in added (B4.3b).
 const holes=eb?(p.system==='simple'?4:2):0,dh=eb?boltProperties(eb.bolts.grade,eb.bolts.diameter).hole+inch/16:0;
 const net=eb&&lay?{y:lay.rows[0],s:haunchSection(g,lay.rows[0]),An:(g.topWidthAt(lay.rows[0])-holes*dh)*g.tt}:undefined;
 const result:TaperedHaunchResults={strength:{},service:{},stations:[],
  fatigue:d.spectrum.map(v=>({name:v.name,cycles:v.cycles,topFlange:0,bottomFlange:0,flangeWeb:0,stiffenerToe:0,column:0,webWeld:0,flangeWeld:0,flangeWebWeld:0,stiffenerWeld:0,flare:0}))};
 const extremes=d.spectrum.map(()=>new Map<string,{min:number;max:number}>());
 const range=(bin:number,id:string,value:number)=>{const x=extremes[bin].get(id)??{min:0,max:0};x.min=Math.min(x.min,value);x.max=Math.max(x.max,value);extremes[bin].set(id,x);return x.max-x.min;};
 const weight=haunchWeight(g,p.section.density),factor=method==='LRFD'?1.4:1,service=haunchService(g,E,e);
 const observe=(kind:'strength'|'service'|'fatigue',caseId:string,x:number,loads:BracketLoads,bin:number,horizontal?:SeatHorizontal)=>{
  const h=horizontal??{longitudinal:0,bottom:0,offset:0};
  const all=kind==='strength'?[...loads,{vertical:weight*factor,offset:0,length:g.btr}]:loads;
  if(kind==='service'){
   const f=haunchActions(g,root,e,all,{longitudinal:0,bottom:0,offset:0}),V=Math.abs(f.V),{deflection,rotation,twist}=service(f,loads);
   for(const [key,value] of Object.entries({vertical:V,deflection,rotation,twist}))if(!result.service[key]||value>result.service[key].value)result.service[key]={value,caseId,x};
   return;
  }
  const sets=(kind==='fatigue'?[h.bottom]:[h.bottom,-h.bottom]).map(H=>haunchActions(g,root,e,all,{...h,bottom:H}));
  if(kind==='fatigue'){
   const out=result.fatigue[bin],f=sets[0],put=(key:typeof fatigueKeys[number],id:string,value:number)=>{out[key]=Math.max(out[key],range(bin,id,value));};
   const tips=haunchTipStresses(g,root,f);tips.slice(0,2).forEach((v,i)=>put('topFlange','t:'+i,v));
   // Base metal at the flange-to-web fillets (Category B) at the root: the bending stress at both junctions.
   for(const [id,z] of [['ft',root.h-g.tt],['fb',g.tbv]] as const)put('flangeWeb',id,f.N/root.A+f.Mx*(z-root.ybar)/root.Ix);
   put('stiffenerToe','toe',stationMoment(f,sa,g.a)/sa.Sxt);
   put('column','column',f.V*(e+c.depth/2)/Sc);
   // Throat ranges at every weld line end, from the ranges of the three components.
   const w=haunchWeldStress(g,grp,root,f);
   for(const part of ['web','flange'] as const){let worst=0;w.points.forEach((q,i)=>{if((part==='web')!==(q.part==='web'))return;worst=Math.max(worst,Math.hypot(range(bin,`wn:${i}`,q.n),range(bin,`wx:${i}`,q.tx),range(bin,`wy:${i}`,q.ty)));});out[part==='web'?'webWeld':'flangeWeld']=Math.max(out[part==='web'?'webWeld':'flangeWeld'],worst);}
   const te=g.flangeWebWeld/Math.SQRT2;
   for(const i of stations.keys())put('flangeWebWeld','fw:'+i,f.V*flow[i]/(2*te));
   if(sf0)put('flare','flare',stationMoment(f,sf0,g.a)*(sf0.h-sf0.ybar)/sf0.Ix);
   f.sides.forEach((s,i)=>put('stiffenerWeld','sw:'+i,Math.sign(s.P)*haunchStiffenerWeldStress(g,sf,Math.abs(s.P),stiffenerLoadPoint(g,s.x))));
   return;
  }
  // Strength: every concurrent set in both lateral senses.
  const peak=(key:string,value:number,extra?:Partial<Peak>)=>{if(!result.strength[key]||value>result.strength[key].value)result.strength[key]={value,caseId,x,...extra};};
  for(const f of sets){
   peak('vertical',Math.abs(f.V));peak('moment',Math.abs(f.Mx));peak('torque',Math.abs(f.T));
   // Stations along the taper: F4/F5 flexure (stress form), G2.1 web shear, H1 with the axial force and weak-axis
   // bending, and the flange-to-web shear flow with any direct bearing over the web.
   const direct=directOverWeb(g,sf.clip,all),te=g.flangeWebWeld/Math.SQRT2;
   stations.forEach((st,i)=>{
    const M=stationMoment(f,st.s,g.a),fl=M>=0?st.pos:st.neg,S=M>=0?st.s.Sxc:st.s.Sxt,phiMn=available(fl.Mn,method,.9,1.67);
    peak('flexure',Math.abs(M)/phiMn,{y:st.y,demand:Math.abs(M)/S,capacity:phiMn/S});
    const V=st.y<=e?Math.abs(f.V):0;peak('shear',V/shear[i].capacity,{y:st.y,demand:V,capacity:shear[i].capacity});
    const Pr=st.y<=g.a?Math.abs(f.N):0,Pc=f.N>=0?axialT[i]:axialC[i],My=Math.abs(f.F)*Math.max(0,g.a-st.y)+Math.abs(f.H*f.xH),flex=Math.abs(M)/phiMn+My/minor[i];
    peak('interaction',Pr/Pc>=.2?Pr/Pc+8/9*flex:Pr/(2*Pc)+flex,{y:st.y});
    const q=Math.abs(f.V)*flow[i],qd=Math.abs(st.y-g.a)<=lb/2?direct/lb:0;
    peak('flangeWebWeld',Math.hypot(q,qd)/(2*te),{y:st.y});
   });
   const tips=haunchTipStresses(g,root,f);peak('normal',Math.max(...tips.map(Math.abs)));
   peak('flangeShear',Math.max(1.5*Math.abs(f.Qtop)/(g.btr*g.tt),1.5*Math.abs(f.Qbot)/(g.bb*g.tb)));
   peak('topFlange',Math.max(0,f.Tt)/(g.btr*g.tt)+Math.abs(f.Mtop)/(g.tt*g.btr**2/6));
   peak('bottomFlange',Math.max(0,f.C)/(g.bb*g.tb)+Math.abs(f.Mbot)/(g.tb*g.bb**2/6));
   if(net)peak('topNet',Math.max(0,stationMoment(f,net.s,g.a)/net.s.h0+f.N/2)/net.An);
   peak('webBearing',Math.max(0,f.V));
   peak('strip',topFlangeStrip(g,all,W,d.bearing.thickness,Lbr).moment);
   for(const s of f.sides){const P=Math.abs(s.P),x=stiffenerLoadPoint(g,s.x),Pr1=P/sf.half,Mr=P*Math.abs(x-sf.xc)/available(Fy*sf.Z,method,.9,1.67);
    peak('stiffener',Pr1>=.2?Pr1+8/9*Mr:Pr1/2+Mr);peak('stiffenerForce',Math.max(0,s.P));peak('stiffenerWeld',haunchStiffenerWeldStress(g,sf,P,x));}
   const w=haunchWeldStress(g,grp,root,f);peak('webWeld',w.web);
   if(grp.cjp){const r=haunchCjpRatios(g,root,f,method,Fy);peak('cjpTop',r.top);peak('cjpBottom',r.bottom);}
   else{peak('flangeWeld',w.flange);peak('flangeBase',2*w.flange*g.flangeWeld/Math.SQRT2/Math.min(g.tt,g.tb,c.flangeThickness));}
   peak('webBase',2*w.web*g.webWeld/Math.SQRT2/Math.min(g.tw,c.flangeThickness));
   const col=haunchColumnForces(g,f);peak('pull',col.pull);peak('tension',col.tension);peak('compression',col.compression);peak('panel',Math.max(col.tension,col.compression));
  }
  peak('uplift',Math.max(0,...loads.map(v=>-v.vertical)));
  const f=sets.reduce((u,v)=>Math.abs(v.Mx)>Math.abs(u.Mx)?v:u,sets[0]);
  const old=result.stations.find(v=>v.x===x);
  if(!old||Math.abs(old.rootMoment)<Math.abs(f.Mx)){const col=haunchColumnForces(g,f),row={x,caseId,vertical:f.V,seatMoment:f.Mseat,rootMoment:f.Mx,torque:f.T,longitudinal:f.F,lateral:f.H,flangeTension:col.tension,flangeCompression:col.compression};if(old)Object.assign(old,row);else result.stations.push(row);}
 };
 return {result,observe};
}
/**
 * Vertical deflection and rotation at the far bearing edge e under the actions f, integrated over the taper (bending
 * with I(y), shear with the clear web area), and the drop of the outer bearing edge from the twist under the seat
 * moment (Saint-Venant with warping fixed at the column, J and Cw at the girder web line).
 */
export function haunchService(g:HaunchGeometry,E:number,e:number){
 const G=E/2.6,I=(y:number)=>haunchSection(g,y).Ix,Aw=(y:number)=>g.clear(y)*g.tw,sa=haunchSection(g,g.a);
 const bend=simpson(y=>(e-y)**2/(E*I(y)),0,e,64),shear=simpson(y=>1/(G*Aw(y)),0,e,64),rot=simpson(y=>(e-y)/(E*I(y)),0,e,64);
 const at=Math.sqrt(E*sa.Cw/(G*sa.J)),perTorque=(g.a-at*Math.tanh(g.a/at))/(G*sa.J);
 return (f:Pick<HaunchActions,'V'|'Mseat'>,loads:BracketLoads)=>{const V=Math.abs(f.V),twist=Math.abs(f.Mseat)*perTorque,reach=Math.max(0,...loads.map(v=>Math.abs(v.offset)+(v.length??0)/2));
  return {deflection:V*(bend+shear)+twist*reach,rotation:V*rot,twist};};
}
/** The part of the girder reactions bearing over the web between the stiffener clips (|x| <= tw/2 + clip), which the fitted stiffeners do not carry. */
function directOverWeb(g:HaunchGeometry,clip:number,loads:BracketLoads){
 const z=g.tw/2+clip;
 return loads.reduce((s,v)=>{const l=v.length??0;if(l<=0)return s+(Math.abs(v.offset)<=z?Math.max(0,v.vertical):0);
  const lo=Math.max(v.offset-l/2,-z),hi=Math.min(v.offset+l/2,z);return s+(hi>lo?Math.max(0,v.vertical)*(hi-lo)/l:0);},0);
}

/** Minimum overall tip depth: both flanges, the flange-to-web fillets and 2 in of clear web for the end plate and its welds. */
export const minimumTipDepth=(g:HaunchGeometry)=>g.tt+g.tbv+2*g.flangeWebWeld+2*inch;

export function validateTaperedHaunch(p:ProjectInput):string[]{
 const b=p.details?.bracket;if(!b?.enabled||!isTaperedHaunch(b))return [];
 const errors:string[]=[],add=(bad:boolean,m:string)=>{if(bad)errors.push('details.bracket: '+m);};
 const d=p.details!,W=d.bearing.width,g=haunchGeometry(b,W),c=b.receiver,E=p.section.E,Fy=d.material.Fy,f=(v:number)=>format(v,'length',p.units,3),run=flangeRunout(g.input);
 add(p.scope!=='design'||!p.aist?.runwayOnly,'bracket design requires the detailed runway design model.');
 add(c.depth<=2*c.flangeThickness||c.webThickness>=c.width,'invalid receiving column I-section.');
 add(c.Fu<c.Fy||d.material.Fu<d.material.Fy,'Fu must be at least Fy for the column and the haunch plates.');
 add(g.ht>g.hr+1e-6,'haunch tip depth cannot exceed the root depth.');
 add(g.degrees>haunchSlopeLimit+1e-9,`the bottom flange slope ${g.degrees.toFixed(1)}° exceeds ${haunchSlopeLimit}°: deepen the tip or lengthen the haunch.`);
 add(g.ht<minimumTipDepth(g)-1e-6,`the tip depth must be at least ${f(minimumTipDepth(g))}: both flanges, the flange-to-web fillets and 2 in of clear web.`);
 for(const [name,w] of [['top',g.btr],['bottom',g.bb]] as const)add(w+2*run>c.width+1e-6,`the haunch ${name} flange welded at the column (${f(w)}) and its weld run-out (${f(run)} each side) must fit on the ${f(c.width)} column flange.`);
 // The top flange is the seat: both girder bearings (or the runway-end bearing) and the end gap along the runway, the
 // bearing plate across it clear of the column-face welds and short of the tip (or the end plate).
 const extent=bearingExtent(p),face=(g.joint==='cjp'?5/16*inch:g.flangeWeld)+inch/4,tip=g.L-(g.endPlate?g.stiffener.t:0);
 add(extent>g.bt/2+1e-6,`the top flange must hold the girder bearings: ${p.system==='simple'?'half the end gap plus the bearing length':'the bearing length at a runway-end grid'} (${f(extent)}) exceeds half the flange width (${f(g.bt/2)}).`);
 add(b.reach-W/2<face,`the bearing plate must lie on the top flange clear of the column-face welds (${f(face)}).`);
 add(b.reach+W/2>tip+1e-6,'the haunch must extend beyond the complete bearing plate.');
 add(g.bt<g.btr-1e-6,'the top flange seat width cannot be less than its width at the column.');
 if(g.flare)add(g.flare.y0<face+g.flare.radius,`the top flange flare (45° from ${f(g.btr)} at the column to the ${f(g.bt)} seat, complete at the bearing plate edge ${f(g.flare.y1)} from the face) starts within ${f(face+g.flare.radius)} of the column: increase the reach or reduce the seat width.`);
 const eb=activeEndBearing(p);
 if(eb){const lay=stubBoltLayout(p,eb);
  add(lay.outer>g.bt/2,'bearing bolts must lie on the top flange.');
  add(lay.rows[0]<=face||lay.rows[1]>=tip,'bearing bolt rows must lie on the top flange between the column-face welds and the tip.');
 }
 // AISC limits of the model: F13.2 web slenderness without stiffeners (and G2.1 h/tw <= 260), singly symmetric
 // proportions 0.1 <= Iyc/Iy <= 0.9, flanges not slender in flexure (Table B4.1b, case 11).
 const r=haunchSection(g,0),webLimit=Math.min(260,.40*E/Fy);
 add(r.hw/g.tw>webLimit,`web clear depth / thickness ${(r.hw/g.tw).toFixed(1)} exceeds ${webLimit.toFixed(0)} (AISC F13.2 / G2.1 without intermediate stiffeners): thicken the web.`);
 const ratio=r.Iyc/(r.Iyc+r.Iyt);
 add(ratio<.1||ratio>.9,`Iyc/Iy = ${ratio.toFixed(2)} is outside 0.1–0.9 (AISC F13.2): make the flanges more alike.`);
 const kc=clamp(4/Math.sqrt(r.hw/g.tw),.35,.76),lrf=.95*Math.sqrt(kc*E/(.7*Fy));
 for(const [name,w,t] of [['top',g.btr,g.tt],['bottom',g.bb,g.tb]] as const)add(w/(2*t)>lrf,`the ${name} flange b/2t = ${(w/(2*t)).toFixed(1)} is slender (λr = ${lrf.toFixed(1)}, AISC Table B4.1b): thicken it.`);
 const s=g.stiffener;
 add(s.width>(Math.min(g.btr,g.bb)-g.tw)/2+1e-6,'bearing stiffeners must lie within the welded flange widths.');
 add(s.width<=s.clip+4*s.weld,'bearing stiffeners are too narrow for their corner clip and fillet.');
 add(s.weld>=s.t,'stiffener fillet must be smaller than the stiffener thickness.');
 add(s.height<2*s.clip+4*s.weld,`the haunch is too shallow at the stiffeners for their clips and fillets (${f(s.height)} between the flanges).`);
 add(b.reach-s.t/2<inch||b.reach+s.t/2>tip-inch,'bearing stiffeners must lie on the haunch at the girder web line.');
 add(g.clear(0)-2*g.flangeWebWeld<4*g.webWeld,'web fillets must be at least four weld sizes long (J2.2b).');
 add(g.flangeWebWeld>=Math.min(g.tw,g.tt,g.tb),'flange-to-web fillets must be smaller than the web and flange thicknesses.');
 // The haunch root must stay on the surveyed column below the seat.
 const col=p.existingColumn;
 if(col?.enabled)add(col.seatElevation-g.hr<0,`the haunch root (${f(g.hr)} deep below the surveyed seat at ${f(col.seatElevation)}) runs below the column base.`);
 return errors;
}

/**
 * Bolted end bearing checks on the haunch top flange: bolt bearing and prying in the flange, edge distances, nut
 * clearance below it to the column-face welds, the web and its fillets, the stiffeners and the bottom flange, fit.
 */
export function haunchSeatChecks(p:ProjectInput,e:EndBearingInput,geo:{hole:number;spacing:number},V:number,T:number,clearance:number,tMin:(T:number,b:number,pitch:number,Fu:number)=>number,
 compared:(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,referenceIds?:string[])=>CheckResult):CheckResult[]{
 const g=projectHaunch(p),db=e.bolts.diameter,lay=stubBoltLayout(p,e),u=p.units,f=(v:number)=>format(v,'length',u,3),method=p.method,s=g.stiffener,Fu=p.details!.material.Fu;
 const tipEdge=g.L-(g.endPlate?s.t:0)-lay.rows[1],plateEdge=Math.min(...lay.rows.map(y=>g.topWidthAt(y)/2))-lay.outer,face=(g.joint==='cjp'?5/16*inch:g.flangeWeld);
 // The flange around a hole cantilevers from the nearer of the web (with its fillet) and the stiffener under the girder web line.
 const bWeb=lay.inner-g.tw/2-g.flangeWebWeld,bStiff=e.bolts.gauge/2-s.t/2,bp=Math.min(bWeb,bStiff),pitch=Math.min(geo.spacing,3.5*bp);
 const drop=g.clear(lay.rows[1]),nut=db+inch;
 return [
  compared('end-bearing-seat-bearing','Haunch top flange · bolt bearing / tearout',V,plateBearing(db,geo.hole,g.tt,Fu,Math.min(plateEdge,tipEdge),geo.spacing,method).capacity,'force','R_n=\\min(1.2l_ctF_u,2.4dtF_u)','Standard holes in the haunch top flange; clear distance to the nearer of its end along the runway and the haunch tip.',['haunch-basis','aisc-connections']),
  compared('end-bearing-seat-prying','Haunch top flange · thickness for no prying',tMin(T,bp-db/2,pitch,Fu),g.tt,'length','t_{min}=\\sqrt{\\frac{4Tb^\\prime}{\\phi pF_u}}',`Uplift path: the bolts hold the girder down through the top flange, which cantilevers b = ${f(bp)} from ${bp===bStiff?'the bearing stiffener':'the web fillet'}; p = ${f(pitch)}.`,['haunch-basis','aisc-connections']),
  compared('end-bearing-haunch-edge','Haunch top flange · bolt edge distance',1.5*db,Math.min(plateEdge,tipEdge,lay.rows[0]-face),'length','e\\ge1.5d_b',`Flange end ${f(plateEdge)} beyond the outermost hole along the runway, tip ${f(tipEdge)} beyond the outer row, column-face weld ${f(lay.rows[0]-face)} before the inner row.`,['haunch-basis','aisc-connections']),
  compared('end-bearing-wrench-haunch-column','Nut clearance below the haunch · column face weld',clearance,lay.rows[0]-face,'length','y_{row}-w\\ge c_{wrench}',`Inner bolt row ${f(lay.rows[0])} from the column face, less the ${f(face)} ${g.joint==='cjp'?'CJP reinforcement':'flange fillet'}.`,['haunch-basis','aisc-connections']),
  compared('end-bearing-wrench-haunch-web','Nut clearance below the top flange · web and flange-to-web fillet',clearance,lay.inner-g.tw/2-g.flangeWebWeld,'length','|x_{bolt}|-t_w/2-w_{fw}\\ge c_{wrench}',`Innermost hole ${f(lay.inner)} from the web plane (a runway-end grid puts the girder end on the grid).`,['haunch-basis','aisc-connections']),
  compared('end-bearing-wrench-haunch-stiffener','Nut clearance below the top flange · bearing stiffeners',clearance,e.bolts.gauge/2-s.t/2-s.weld,'length','g/2-t_s/2-w_s\\ge c_{wrench}',`Stiffeners at the girder web line; bolt rows ${f(e.bolts.gauge/2)} each side.`,['haunch-basis','aisc-connections']),
  compared('end-bearing-wrench-haunch-depth','Nut drop below the top flange · clear web depth at the outer row',nut,drop,'length','h_{clear}(y_{row})\\ge d_b+1\\,in',`Nut, washer and stick-out under the top flange at the outer row, ${f(lay.rows[1])} from the column face, above the sloping bottom flange.`,['haunch-basis','aisc-connections']),
  compared('end-bearing-seat-fit','Bearings and bolts fit on the haunch top flange',bearingExtent(p),g.bt/2,'length',p.system==='simple'?'g/2+L_{bearing}\\le b_t/2':'L_{bearing}\\le b_t/2',p.system==='simple'?'Each girder bearing, and its bolts, on its own half of the top flange at a shared grid; at a runway-end grid the girder end is on the grid.':'Interior bearings centered on the web; at a runway end the girder end is on the grid, the whole bearing on one side.',['haunch-basis','aisc-connections'])
 ];
}

/** serviceReaction: the largest unfactored support reaction with all cranes, impact and dead load (AIST §5.9.2). */
export function taperedHaunchChecks(p:ProjectInput,res:TaperedHaunchResults,serviceReaction?:number):CheckResult[]{
 const d=p.details!,b=d.bracket!,m=d.material,c=b.receiver,E=p.section.E,g=haunchGeometry(b,d.bearing.width),checks:CheckResult[]=[],u=p.units,Fy=m.Fy,method=p.method;
 const fmt=(v:number,q:'length'|'force'|'moment'|'stress'='length')=>format(v,q,u,3),{e,lb,W}=stubBearing(p),deg=g.degrees.toFixed(1);
 const refs=['haunch-basis','tr13-bracket'];
 const gate=(id:string,title:string,ok:boolean,note:string,byOthers=false)=>checks.push({id:'bracket-'+id,group:'Column bracket',title,status:ok?(byOthers?'excluded':'pass'):'unverified',equation:'',note,referenceIds:['haunch-basis']});
 const add=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,caseId?:string,referenceIds=refs)=>checks.push({id:'haunch-'+id,group:'Column bracket',title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&demand<=capacity*(1+1e-9)?'pass':'fail',equation,note,caseId,referenceIds});
 const na=(id:string,title:string,equation:string,note:string,referenceIds=refs)=>checks.push({id:'haunch-'+id,group:'Column bracket',title,status:'not-applicable',equation,note,referenceIds});
 const S=res.strength,from=(key:string,id:string,title:string,capacity:number,q:CheckResult['quantity'],eq:string,note:string,referenceIds=refs)=>add(id,title,S[key]?.value??0,capacity,q,eq,note,S[key]?.caseId,referenceIds);
 const isNew=!!(p.existingColumn?.enabled&&p.existingColumn.isNew),where=isNew?'Shop':'Field';
 const name='Tapered haunch',stations=haunchStations(g,E,Fy,e,W),root=stations[0].s,at=(y?:number)=>stations.find(v=>Math.abs(v.y-(y??0))<1e-6)??stations[0];
 gate('receiver','Receiving column · surveyed geometry and material',c.confirmed&&!!c.source.trim(),c.source?`${c.source} ${isNew?'The new column member, base and foundation are checked under Supporting structure.':'EXISTING: survey-verified section. The receiving column member, frame and foundation are checked under Supporting structure or by others.'}`:'Enter and confirm the receiving-column geometry and material; the reference frame is not a capacity input.');
 gate('load-path','Bracket load paths / top-flange tie connected separately',b.loadPathConfirmed,`A built-up tapered I haunch ${fmt(g.L)} long, ${fmt(g.hr)} deep at the column tapering to ${fmt(g.ht)} at the tip (bottom flange at ${deg}°), ${isNew?'shop':'field'} welded to the column flange, carries both girder bearings on its top flange. The bearing bolts deliver the locating end's longitudinal force and the bottom-flange lateral force into the top flange; the haunch carries them to the column in weak-axis bending, torsion and axial force with its welds. The top-flange tie connects to the column independently; ${isNew?'its column-side connection is checked with the flange attachment.':'its column-side adequacy, and the existing frame, are by others.'}`,!isNew);
 const common=`Every concurrent case of the bracket design force envelope, both senses of the lateral force H, with the haunch self-weight (1.4 LRFD / 1.0 ASD). The girder reactions act at the far bearing edge e = ${fmt(e)} from the column face, their seat moment ΣV·x twists the haunch.`;
 const taper=`h(y) = ${fmt(g.hr)} − ${(g.s).toFixed(4)}·y (root ${fmt(g.hr)}, tip ${fmt(g.ht)}, L = ${fmt(g.L)}, α = ${deg}°)`;
 // Strong-axis flexure on the stations of the taper.
 const fx=S.flexure,sf=at(fx?.y),fl=sf.pos;
 add('flexure',`${name} · flexure along the taper (F4/F5, stress form)`,fx?.demand??0,fx?.capacity??1,'stress',`f_{bc}(y)=\\frac{M(y)}{S_{xc}(y)}\\le\\frac{\\phi M_n(y)}{S_{xc}(y)};\\;M(y)=V(e-y)+Hz_t(y);\\;M_n=\\min(R_{pc}M_{yc},F_{LTB}S_{xc},M_{n,CFLB},R_{pt}M_{yt})`,
  `${common} Built-up I on every vertical section ${taper}, ${stations.length} stations from the root to e. Governing station y = ${fmt(sf.y)} (h = ${fmt(sf.s.h)}): ${flexureBranch(fl)}; web ${fl.web} (hc/tw = ${fl.lw.toFixed(1)}, λpw = ${fl.lpw.toFixed(1)}, λrw = ${fl.lrw.toFixed(1)}), ${fl.clause==='F4'?`Rpc = ${fl.R.toFixed(3)}`:`Rpg = ${fl.R.toFixed(3)}`}; bottom flange b/2t = ${fl.lf.toFixed(2)} (λpf = ${fl.lpf.toFixed(2)}, kc = ${fl.kc.toFixed(3)}). Lateral-torsional buckling of the sloping compression (bottom) flange as a member: Lb = 2L = ${fmt(2*g.L)}, Cb = 1.0 (cantilever free at its tip, no restraint credited to the girder), the least station LTB stress ${fmt(sf.Fltb,'stress')} applied at every station (AISC DG25 stress form). Uplift (top flange in compression) is checked the same way.`,fx?.caseId,['haunch-basis','dg25','aisc-f5']);
 const sv=S.shear,ss=at(sv?.y),sh=haunchWebShear(g,ss.s,E,Fy,method);
 add('shear',`${name} · web shear along the taper (G2.1)`,sv?.demand??0,sv?.capacity??1,'force','V_u\\le\\phi_v0.6F_yA_wC_{v1},\\;A_w=h(y)t_w,\\;k_v=5.34',`${common} Web shear on every section from the root to the far bearing edge with the whole reaction (shallowest loaded section governs): y = ${fmt(ss.y)}, h = ${fmt(ss.s.h)}, clear web ${fmt(ss.s.hw)}, h/tw = ${sh.ratio.toFixed(1)} (limit ${sh.limit.toFixed(1)}), Cv1 = ${sh.Cv1.toFixed(3)}, φv = 0.90 (built-up). Unstiffened kv = 5.34 to the bearing stiffeners, no tension field. No Résal credit: the vertical component of the sloping bottom flange force is not deducted from the web shear.`,sv?.caseId,['haunch-basis','aisc-g']);
 const sa=haunchSection(g,g.a);
 from('flangeShear','flange-shear',`${name} · flange lateral shear from torsion (G6, H3.3)`,available(.6*Fy,method,.9,1.67),'stress','\\tau=\\frac{1.5Q}{bt},\\;Q_{t,b}=F\\frac{I_{yt,b}}{I_y}\\pm\\frac{T}{h_0(a)},\\;T=\\Sigma V_ix_i+F(z_t-z_{sc})',`The torque (seat moment and F above the shear center) is carried by opposite flange shears T/h0(y) over the taper (warping fixed at the column, Saint-Venant relief not credited), largest at the girder web line where h0 = ${fmt(sa.h0)}; F at the shear center splits by the flanges' lateral stiffness. Elastic peak shear on each flange.`,['haunch-basis','aisc-g','aisc-h3']);
 const minorRoot=available(haunchMinor(g,root,E,Fy),method,.9,1.67);
 add('interaction',`${name} · axial force and biaxial flexure (H1)`,S.interaction?.value??0,1,'ratio','\\frac{P_r}{P_c}+\\frac89\\left(\\frac{M_{rx}(y)}{M_{cx}(y)}+\\frac{M_{ry}(y)}{M_{cy}(y)}\\right)\\le1',`The lateral force H acts along the haunch axis: Pr = |H|, tension (D2 yielding) or compression (E3, KL = 2L about the vertical axis). Mrx and Mcx at each station as the flexure check; Mry = F(a − y) + |H·xH| about the vertical axis with Mcy per F6 (${fmt(minorRoot,'moment')} at the root). Governing station y = ${fmt(S.interaction?.y??0)}. Torsion is in the H3.3 stress checks.`,S.interaction?.caseId,['haunch-basis','aisc-h','aisc-f6']);
 from('normal','combined',`${name} · combined normal stress at the root (H3.3)`,available(Fy,method,.9,1.67),'stress','f_n=\\frac{N}{A}+\\frac{M_xc}{I_x}+\\frac{M_f}{tb^2/6}\\le\\phi F_y',`Elastic sum at the four flange tips at the column face: axial force, strong-axis bending and the flange lateral bending from torsion (M_f = T∫dy/h0 over the taper, warping fixed at the column), F and H·xH (on the top flange). H3-7, normal-stress yielding.`,['haunch-basis','aisc-h3']);
 // Flanges at the root.
 const lambdaB=g.bb/(2*g.tb),kc=clamp(4/Math.sqrt(root.hw/g.tw),.35,.76),lrB=.64*Math.sqrt(kc*E/Fy);
 from('bottomFlange','bottom-flange',`${name} · sloping bottom flange in compression at the root`,available(Fy,method,.9,1.67),'stress','C=\\frac{M_x/h_0-N/2}{\\cos\\alpha};\\;f=\\frac{C}{b_bt_b}+\\frac{M_{f,b}}{t_bb_b^2/6}\\le\\phi F_y',`Flange-force method at the column face, h0 = ${fmt(root.h0)}, α = ${deg}°: the web's share of the moment is not credited. Lateral bending from torsion over the sloping length. C sin α = vertical component into the column-face welds (weld checks). H3.3 yielding.`,['haunch-basis','aisc-h3']);
 add('bottom-flange-slenderness',`${name} · bottom flange local buckling (B4.1)`,lambdaB,lrB,'ratio','\\lambda=\\frac{b_b}{2t_b}\\le\\lambda_r=0.64\\sqrt{k_cE/F_y}',`Table B4.1a case 2, flange of a built-up I in uniform compression along the slope: nonslender, kc = ${kc.toFixed(3)}. Flexural local buckling is in the F4/F5 flexure check.`,undefined,['haunch-basis','aisc-b']);
 from('topFlange','top-flange',`${name} · top flange in tension at the root`,available(Fy,method,.9,1.67),'stress','T_t=\\frac{M_x}{h_0}+\\frac N2;\\;f=\\frac{T_t}{b_tt_t}+\\frac{M_{f,t}}{t_tb_t^2/6}\\le\\phi F_y',`Flange-force method at the column face with the top flange's lateral bending from torsion, F and H·xH. D2 / H3.3 yielding on the gross flange.`,['haunch-basis','aisc-d','aisc-h3']);
 const eb=activeEndBearing(p);
 if(eb&&S.topNet){const lay=stubBoltLayout(p,eb);from('topNet','top-flange-net',`${name} · top flange net section at the inner bolt row`,available(m.Fu,method,.75,2),'stress','f=\\frac{M(y_r)/h_0(y_r)+N/2}{A_n}\\le\\phi F_u',`Tension rupture (D2-2, U = 1) at the inner bearing bolt row y = ${fmt(lay.rows[0])}: every hole of the row across the flange, hole + 1/16 in (B4.3b).`,['haunch-basis','aisc-d']);}
 // Top flange as the seat.
 from('strip','seat-strip',`${name} · top flange local bending under the bearings`,available(Fy*g.tt**2/4,method,.9,1.67),'force','m=\\max\\left[\\frac{Pc^2}{2lW},\\frac{P(x-x_s)}{W+2(x_{near}-x_s)}\\right]\\le\\phi F_yt_t^2/4',`Strip method on the top flange as the seat of each girder bearing: across the haunch, each bearing patch (the inner 0.4 of the bearing length, spread at 45° through the ${fmt(d.bearing.thickness)} bearing plate) presses uniformly over the ${fmt(W)} bearing width and the flange cantilevers c = W/2 − ts/2 = ${fmt(Math.max(0,W/2-g.stiffener.t/2))} from the stiffener faces; along the runway, any part beyond the stiffener tip (${fmt(g.tw/2+g.stiffener.width)} from the web plane) cantilevers from it. The flange alone; no bearing plate or girder flange credit. Moment per unit width (force units).`);
 // Concentrated load over the web and the bearing stiffeners.
 const wb=haunchWebBearing(g,E,Fy,lb,method),stiff=haunchStiffener(g,E,Fy,method),Rweb=S.webBearing?.value??0,required=Rweb>Math.min(wb.yielding,wb.crippling)*(1+1e-9);
 const webNote=`ΣV over lb = ${fmt(lb)} (the narrower of the bearing plate width and the girder flange) at the girder web line, h = ${fmt(wb.d)}, ${fmt(wb.tip)} from the tip${wb.yieldEnd?' (within d: end-of-member case)':''}; k = tt + w_fw = ${fmt(wb.k)}.`;
 for(const [id,title,cap,eq,end] of [['web-yielding','web local yielding (J10.2)',wb.yielding,`R_n=F_yt_w(${wb.yieldEnd?'2.5':'5'}k+l_b)`,wb.yieldEnd],['web-crippling','web crippling (J10.3)',wb.crippling,wb.crippleEnd?`R_n=0.40t_w^2[1+${lb/wb.d>.2?'(4l_b/d-0.2)':'3(l_b/d)'}(t_w/t_t)^{1.5}]\\sqrt{EF_yt_t/t_w}`:'R_n=0.80t_w^2[1+3(l_b/d)(t_w/t_t)^{1.5}]\\sqrt{EF_yt_t/t_w}',wb.crippleEnd]] as const){
  if(Rweb>cap*(1+1e-9))na(id,`${name} web · ${title}`,eq,`Unstiffened web strength ${fmt(cap,'force')} is below the ${fmt(Rweb,'force')} bearing force: the J10.8 bearing stiffeners take the full force (stiffener checks). ${webNote}`,['haunch-basis','aisc-j']);
  else from('webBearing',id,`${name} web · ${title}`,cap,'force',eq,`${webNote}${end&&id==='web-crippling'?' Within d/2 of the tip: end case.':''} Bearing stiffeners are also provided.`,['haunch-basis','aisc-j']);
 }
 checks.push({id:'haunch-stiffener-required',group:'Column bracket',title:'Bearing stiffeners · J10.8',status:'pass',equation:'R_u>\\phi R_{n,J10.2/J10.3}\\Rightarrow\\text{stiffeners}',caseId:S.webBearing?.caseId,referenceIds:['haunch-basis','aisc-j'],
  note:`${required?`Required: the ${fmt(Rweb,'force')} bearing force exceeds the unstiffened web strength.`:`Provided; the unstiffened web alone carries the ${fmt(Rweb,'force')} bearing force.`} The girder reactions on the top flange outstands bear on them. A pair of ${fmt(stiff.t)} plates, ${fmt(stiff.width)} outstand, ${fmt(stiff.height)} between the flanges at the girder web line, ${fmt(stiff.clip)} corner clips, fitted to bear on the top flange and welded to the web and both flanges (the bottom edge cut to the ${deg}° slope).`});
 const minT=Math.max(g.tt/2,stiff.width/16,stiff.width/(.56*Math.sqrt(E/Fy)));
 add('stiffener-proportions','Bearing stiffeners · width and thickness (J10.8)',Math.max(minT/stiff.t,(g.btr/3-g.tw/2)/stiff.width),1,'ratio','\\max\\left(\\frac{\\max(t_t/2,\\,b_s/16,\\,b_s/0.56\\sqrt{E/F_y})}{t_s},\\frac{b_{tr}/3-t_w/2}{b_s}\\right)\\le1',`t = ${fmt(stiff.t)} against ${fmt(minT)}; b_s = ${fmt(stiff.width)} against ${fmt(g.btr/3-g.tw/2)} for the ${fmt(g.btr)} welded top flange width${g.flare?' (the flared seat beyond is carried by flange bending: top flange strip check)':''}.`,undefined,['haunch-basis','aisc-j']);
 from('stiffener','stiffener-column','Bearing stiffeners · column with load eccentricity (J10.8, J4.4/E3, H1)',1,'ratio','\\frac{P}{\\phi P_n/2}+\\frac89\\frac{P|x-x_c|}{\\phi F_yZ_s}\\le1',`Each stiffener with half of a ${stiff.interior?'25':'12'}tw web strip (${fmt(stiff.strip)}) takes the reactions on its flange outstand, P at x from the web plane (at the stiffener tip, ${fmt(g.tw/2+stiff.width)}, for reactions beyond it, which the top flange carries there); pair KL = 0.75h = ${fmt(stiff.KL)}, KL/r = ${stiff.slender.toFixed(1)} (${stiff.slender<=25?'J4.4: Pn = FyAg':'E3'}), φPn of the pair ${fmt(stiff.column,'force')}. The eccentricity from the centroid x_c = ${fmt(stiff.xc)} bends the plate in its plane, Zs = t b²/4.`,['haunch-basis','aisc-j','aisc-e','aisc-h']);
 from('stiffenerForce','stiffener-bearing','Bearing stiffeners · fitted bearing (J7)',stiff.bearing,'force','R_n=1.8F_yA_{pb},\\;A_{pb}=(b_s-c)t_s',`One stiffener: contact beyond the ${fmt(stiff.clip)} corner clip.`,['haunch-basis','aisc-connections']);
 from('stiffenerWeld','stiffener-weld','Bearing stiffeners · welds to the web and bottom flange',available(.6*m.Fexx,method,.75,2),'stress','f=\\sqrt{(M_zv/J)^2+(P/A-M_zu/J)^2},\\;M_z=P(x-t_w/2-u_c)',`${fmt(stiff.weld)} fillets both faces of each stiffener, ${fmt(stiff.weldLength)} on the web and ${fmt(stiff.flangeWeldLength)} on the bottom flange, elastic group under the stiffener reaction at its eccentricity; no directional increase. The top is fitted to bear and also welded.`,['haunch-basis','aisc-connections']);
 add('stiffener-weld-minimum','Stiffener fillets · minimum leg (J2.4)',minimumFillet(Math.max(stiff.t,g.tw,g.tb)),stiff.weld,'length','w\\ge w_{min,J2.4}','Thicker of the stiffener and the web or bottom flange (conservative: Table J2.4 uses the thinner part).',undefined,['haunch-basis','aisc-connections']);
 // Flange-to-web fillets.
 const te=g.flangeWebWeld/Math.SQRT2,fw=S.flangeWebWeld;
 from('flangeWebWeld','flange-web-weld','Flange-to-web fillets · shear flow and direct bearing',available(.6*m.Fexx,method,.75,2),'stress','f=\\frac{\\sqrt{(VQ/I)^2+(R_d/l_b)^2}}{2(0.707w)}',`Two ${fmt(g.flangeWebWeld)} shop fillets on each flange, continuous. Shear flow VQ/I on every station (the larger of the top and bottom flange Q; no taper relief), governing at y = ${fmt(fw?.y??0)}; over the bearing width at the girder web line, plus the part of the reactions bearing over the web between the stiffener clips (R_d over lb = ${fmt(lb)}), which the fitted stiffeners do not carry.`,['haunch-basis','aisc-connections']);
 add('flange-web-weld-minimum','Flange-to-web fillets · minimum leg (J2.4)',minimumFillet(Math.max(g.tw,g.tt,g.tb)),g.flangeWebWeld,'length','w\\ge w_{min,J2.4}','Thicker of the web and flanges (conservative: Table J2.4 uses the thinner part).',undefined,['haunch-basis','aisc-connections']);
 add('flange-web-weld-maximum','Flange-to-web fillets · maximum leg',g.flangeWebWeld,Math.min(g.tw,g.tt,g.tb)-(Math.min(g.tw,g.tt,g.tb)<6.35?0:1.5875),'length','w\\le t_{min}-1/16\\,in','Thinner joined part less 1/16 in (J2.2b applied to the T-joint conservatively).',undefined,['haunch-basis','aisc-connections']);
 // Welds to the column flange.
 const grp=haunchWeldGroup(g),phiW=available(.6*m.Fexx,method,.75,2),baseCap=Math.min(available(.6*Math.min(Fy,c.Fy),method,1,1.5),available(.6*Math.min(m.Fu,c.Fu),method,.75,2));
 const groupNote=`${common} The bearing bolts bring F (along the runway, at the girder web line ${fmt(g.a)} from the face) and H (both senses) at the top of the haunch; the sloping bottom flange adds its vertical component C sin α on the bottom-flange welds (no Résal relief of the web: conservative). Elastic weld group on the column face about its centroid, ${fmt(grp.vc)} above the root bottom; throat stresses at the line ends, no directional strength increase (J2.4). ${where} welds.`;
 if(grp.cjp){
  from('cjpTop','top-flange-cjp','Top flange to column · CJP groove weld',1,'ratio','\\max\\left(\\frac{f_n}{\\phi F_y},\\frac{1.5Q_t/(b_tt_t)}{\\phi0.6F_y}\\right)\\le1',`Table J2.5: the CJP groove weld develops the top flange with matching filler, base metal governing: peak flange-tip normal stress with the lateral bending, and the flange lateral shear. ${where} weld.`,['haunch-basis','aisc-connections']);
  from('cjpBottom','bottom-flange-cjp','Sloping bottom flange to column · CJP groove weld',1,'ratio','\\max\\left(\\frac{\\sigma}{\\phi F_y},\\frac{\\sigma\\sin\\alpha\\cos\\alpha+1.5Q_b/(b_bt_b)}{\\phi0.6F_y}\\right)\\le1',`Table J2.5, base metal: the flange stress σ along the ${deg}° slope (flange-force method with its lateral bending) and, on the vertical joint face, its shear component σ sin α cos α (the joint face is tb/cos α deep) with the flange lateral shear. ${where} weld.`,['haunch-basis','aisc-connections']);
  from('webWeld','web-weld','Web to column · fillet welds',phiW,'stress','f=\\sqrt{\\left(\\frac{\\sigma_wt_w}{2t_e}\\right)^2+\\left(\\frac{V}{2t_eh}\\right)^2}',`Two ${fmt(g.webWeld)} fillets over h = ${fmt(grp.webLength)} between the flange-to-web fillets develop the web's normal stress at their ends and carry the vertical shear. ${where} welds.`,['haunch-basis','aisc-connections']);
 }else{
  from('flangeWeld','flange-weld','Flanges to column · fillet weld group',phiW,'stress','f=\\sqrt{\\left(\\frac{H}{A}+\\frac{M_xv}{I_x}-\\frac{M_yu}{I_y}\\right)^2+\\left(\\frac{F}{A}-\\frac{M_zv}{J}\\right)^2+\\left(\\frac{V}{A}-\\frac{M_zu}{J}+\\frac{C\\sin\\alpha}{A_b}\\right)^2}',`${groupNote} ${fmt(g.flangeWeld)} fillets across the outer face of each flange and on its inner face from the flange-to-web fillet to the tip. Peak on the flange lines.`,['haunch-basis','aisc-connections']);
  from('webWeld','web-weld','Web to column · fillet welds in the group',phiW,'stress','f=\\sqrt{n^2+t_x^2+t_y^2}',`${fmt(g.webWeld)} fillets both sides of the web over h = ${fmt(grp.webLength)}, in the same elastic group. Peak on the web lines.`,['haunch-basis','aisc-connections']);
  from('flangeBase','flange-base','Flanges / column flange · connected metal at the fillets',baseCap,'stress','f_{base}=2f_wt_e/\\min(t_f,t_{cf})','Both fillets of a flange on the thinner of the haunch flange and the column flange (J4.2 shear yielding and rupture bound the traction).',['haunch-basis','aisc-connections']);
  add('flange-weld-minimum','Flange-to-column fillets · minimum leg (J2.4)',minimumFillet(Math.max(g.tt,g.tb,c.flangeThickness)),g.flangeWeld,'length','w\\ge w_{min,J2.4}','Thicker of the haunch flanges and the existing column flange (bounds the cooling rate of the thick existing flange; Table J2.4 uses the thinner part).',undefined,['haunch-basis','aisc-connections']);
  add('flange-weld-maximum','Flange-to-column fillets · maximum leg',g.flangeWeld,Math.min(g.tt,g.tb,c.flangeThickness)-1.5875,'length','w\\le t_{min}-1/16\\,in','Thinner of the haunch flanges and the existing column flange, less 1/16 in (J2.2b, conservative for the T-joint).',undefined,['haunch-basis','aisc-connections']);
  add('flange-weld-length','Flange fillets · inner segments at least four sizes (J2.2b)',4*g.flangeWeld,Math.min(grp.innerTop,grp.innerBottom),'length','l\\ge4w','Inner-face fillets from the flange-to-web fillet to the flange tip.',undefined,['haunch-basis','aisc-connections']);
 }
 from('webBase','web-base','Web / column flange · connected metal at the fillets',baseCap,'stress','f_{base}=2f_wt_e/\\min(t_w,t_{cf})','Both web fillets on the thinner of the haunch web and the column flange (J4.2).',['haunch-basis','aisc-connections']);
 add('web-weld-minimum','Web-to-column fillets · minimum leg (J2.4)',minimumFillet(Math.max(g.tw,c.flangeThickness)),g.webWeld,'length','w\\ge w_{min,J2.4}','Thicker of the haunch web and the existing column flange (bounds the cooling rate of the thick existing flange).',undefined,['haunch-basis','aisc-connections']);
 add('web-weld-maximum','Web-to-column fillets · maximum leg',g.webWeld,Math.min(g.tw,c.flangeThickness)-(Math.min(g.tw,c.flangeThickness)<6.35?0:1.5875),'length','w\\le t_{min}-1/16\\,in','Thinner of the haunch web and the existing column flange, less 1/16 in (J2.2b, conservative for the T-joint).',undefined,['haunch-basis','aisc-connections']);
 // Existing column, local, at the two flange levels. No continuity plates (column stiffeners) are credited.
 const columnEnd=p.existingColumn?.enabled?p.existingColumn.height-p.existingColumn.seatElevation:0,known=!!p.existingColumn?.enabled;
 const topFlangeEnd=!known||columnEnd<10*c.flangeThickness,topWebEnd=!known||!(columnEnd>c.depth),botWebEnd=!known||!(columnEnd+g.hr>c.depth),botCrippleEnd=!known||!(columnEnd+g.hr>=c.depth/2);
 const hook='No continuity plates are credited; where a column check fails, provide continuity plates (column stiffeners) at the bracket flange levels for the reported flange forces.';
 from('pull','column-flange','Existing column flange · local bending at the top flange (J10.1)',available((topFlangeEnd?.5:1)*6.25*c.Fy*c.flangeThickness**2,method,.9,1.67),'force','T_t+3M_{f,t}/b_t\\le\\phi R_n=\\phi6.25F_{yf}t_{cf}^2',`Top flange force M/h0 + N/2 with its in-plane bending from torsion and the longitudinal force, as twice the more loaded half-flange resultant over the ${fmt(g.btr)} welded flange width.${topFlangeEnd?' Within 10tf of the column top, or the column height not entered: half strength.':''} ${hook}`,['haunch-basis','aisc-j']);
 from('tension','column-yield-top','Existing column web · local yielding at the top flange (J10.2)',available(c.Fy*c.webThickness*((topWebEnd?2.5:5)*c.flangeThickness+g.tt),method,1,1.5),'force',`R_n=F_yt_{cw}(${topWebEnd?'2.5':'5'}k+l_b)`,`Tensile flange force; k = tf of the column (no rolled fillet credit), lb = top flange thickness ${fmt(g.tt)}.${topWebEnd?' End-region expression: the column top is within the column depth, or not entered.':''}`,['haunch-basis','aisc-j']);
 from('compression','column-yield-bottom','Existing column web · local yielding at the bottom flange (J10.2)',available(c.Fy*c.webThickness*((botWebEnd?2.5:5)*c.flangeThickness+g.tbv),method,1,1.5),'force',`R_n=F_yt_{cw}(${botWebEnd?'2.5':'5'}k+l_b)`,`Horizontal component of the sloping flange force, C cos α = M/h0 − N/2; lb = tb/cos α = ${fmt(g.tbv)} (the flange's vertical cut at the face).${botWebEnd?' End-region expression.':''}`,['haunch-basis','aisc-j']);
 const N=g.tbv,term=botCrippleEnd&&N/c.depth>.2?4*N/c.depth-.2:3*N/c.depth;
 from('compression','column-crippling','Existing column web · crippling at the bottom flange (J10.3)',available((botCrippleEnd?.4:.8)*c.webThickness**2*(1+term*(c.webThickness/c.flangeThickness)**1.5)*Math.sqrt(E*c.Fy*c.flangeThickness/c.webThickness),method,.75,2),'force',`R_n=${botCrippleEnd?'0.40':'0.80'}t_w^2[1+\\eta(t_w/t_f)^{1.5}]\\sqrt{EF_yt_f/t_w}`,`${botCrippleEnd?'End-region':'Interior'} expression at the bottom flange level, ${fmt(columnEnd+g.hr)} below the column top; lb = ${fmt(N)}. Confirmed receiver geometry required. ${hook}`,['haunch-basis','aisc-j']);
 const hcol=c.depth-2*c.flangeThickness,sway=(hcol/c.webThickness)/(c.unbracedLength/c.width);
 if(sway<=1.7)from('compression','column-sidesway','Existing column web · sidesway buckling (J10.4)',available(3.3e6*c.webThickness**3*c.flangeThickness/hcol**2*.4*sway**3,method,.85,1.76),'force','R_n=(C_rt_w^3t_f/h^2)[0.4((h/t_w)/(L_b/b_f))^3]','J10.4 unrestrained compression-flange rotation; conservative Cr regardless of column moment; entered largest flange unbraced length.',['haunch-basis','aisc-j']);
 else na('column-sidesway','Existing column web · sidesway buckling (J10.4)','(h/t_w)/(L_b/b_f)>1.7','AISC J10.4(b)(2): not applicable beyond 1.7.',['haunch-basis','aisc-j']);
 const area=2*c.width*c.flangeThickness+hcol*c.webThickness,axialRatio=(method==='LRFD'?1:1.6)*(c.axialDemand+(S.vertical?.value??0))/(c.Fy*area);
 from('panel','column-panel','Existing column web · panel shear with axial force (J10.6)',available(.6*c.Fy*c.depth*c.webThickness*Math.max(0,Math.min(1,1.4-axialRatio)),method,.9,1.67),'force','R_n=0.6F_yd_ct_w\\min(1,1.4-\\alpha P_r/P_y)',`J10.6(a), one-sided bracket: the larger flange force is the panel shear; no inelastic panel-zone credit. Concurrent entered column axial force plus the bracket reaction. Global column strength remains separate. ${hook}`,['haunch-basis','aisc-j']);
 // Applicability and geometry limits of the model (validated; reported for the record).
 add('slope','Bottom flange slope',g.degrees,haunchSlopeLimit,'ratio','\\alpha=\\arctan\\frac{h_r-h_t}{L}\\le45^\\circ',`Vertical sections with the flange-force resolution represent the haunch up to 45°; ${deg}° here.`,undefined,['haunch-basis','dg25']);
 add('web-slenderness','Web slenderness without intermediate stiffeners (F13.2, G2.1)',root.hw/g.tw,Math.min(260,.40*E/Fy),'ratio','h/t_w\\le\\min(260,0.40E/F_y)',`Root clear web ${fmt(root.hw)} on ${fmt(g.tw)}.`,undefined,['haunch-basis','aisc-f13']);
 // Service, applicability and uplift.
 const service=res.service.vertical?.value??0;
 add('tr13-load','AIST column bracket · reaction recommendation',Math.max(service,serviceReaction??0),50*kip,'force',u==='SI'?'R_{bracket}<222.411\\,kN':'R_{bracket}<50\\,kip','Reference AIST Technical Report 13 §5.9.2: unfactored support reaction with all cranes, impact and dead load, as the Detailing column-bracket applicability check.',undefined,['haunch-basis','tr13-bracket']);
 for(const [key,limit,q,eq] of [['deflection',b.deflectionLimit,'length','\\delta=\\int_0^e\\frac{V(e-y)^2}{EI(y)}dy+\\int_0^e\\frac{V\\,dy}{GA_w(y)}+\\theta_tx_{max}'],['rotation',b.rotationLimit,'ratio','\\theta=\\int_0^e\\frac{V(e-y)}{EI(y)}dy']] as const){
  const pk=res.service[key];add(key,`Bracket · vertical ${key}`,pk?.value??0,limit,q,eq,`Unfactored single-crane service set; column fixed at the face. Integrated over the taper with I(y) and the clear web area A_w(y) of h(y) from ${fmt(g.hr)} to ${fmt(g.ht)}${key==='deflection'?`, plus the drop of the outer bearing edge from the twist under the seat moment (Saint-Venant with warping fixed at the column, J and Cw at the girder web line; largest twist ${(res.service.twist?.value??0).toExponential(3)} rad)`:''}. User-entered incremental limits; building deformation is separate.`,pk?.caseId);
 }
 const uplift=S.uplift?.value??0;
 if(eb)add('uplift','Bearing uplift · held down through the top flange',uplift,4*boltCapacity({grade:eb.bolts.grade,diameter:eb.bolts.diameter,planes:1,surface:'B',shear:0,tension:uplift/4,method}).tension,'force','V_{uplift}\\le4\\phi R_{nt}','Any uplift at a girder end is held down by its four bearing bolts in tension through the haunch top flange; bolt shear with tension and top-flange prying (thickness for no prying, with the top flange thickness) are checked under End bearings; the haunch checks above take the signed reactions.',S.uplift?.caseId,['haunch-basis','aisc-connections']);
 else add('uplift','Bearing contact · uplift requiring separate restraint',uplift,1,'force','V_{uplift}\\le0','Gravity bearing without bolted end bearings: uplift above 1 N requires a separately designed hold-down.',S.uplift?.caseId);
 // Fatigue, AISC Appendix 3, under the duty spectrum (unfactored bin loads without impact).
 const F=res.fatigue,Cn=(cf:number,n:number,R=1)=>6900*R*(cf/n)**(1/3),total=p.fatigue.cycles,weldF=Math.max(55,690*(1.5/total)**.167);
 const miner=(key:'topFlange'|'bottomFlange'|'flangeWeb'|'stiffenerToe'|'column'|'flare',limit:(n:number)=>number)=>F.reduce((s,v)=>s+(v[key]>0?(v[key]/limit(v.cycles))**3:0),0);
 const fatRefs=['haunch-basis','aisc-fatigue'],rTop=transverseFilletFatigue(g.tt,g.flangeWeld,total).reduction;
 if(grp.cjp)add('fatigue-top-flange','Top flange at the column CJP weld · fatigue',miner('topFlange',n=>Cn(4.4,n)),1,'ratio','D=\\sum_i(\\Delta f_i/F_{SR,C})^3\\le1','Table A-3.1 item 5.4, Category C: base and weld metal at the toe of the CJP T-joint with the reinforcement left in place. Range per bin of the top flange tip stress (bending, axial, lateral bending from torsion); Miner sum, no endurance-limit credit.',undefined,fatRefs);
 else add('fatigue-top-flange','Top flange at the column fillets · fatigue',miner('topFlange',n=>Cn(4.4,n,rTop)),1,'ratio','D=\\sum_i\\left(\\frac{\\Delta f_i}{R_{FIL}F_{SR,C}}\\right)^3\\le1',`Table A-3.1 item 5.6 (the 360-16 item for a pair of transverse fillets; item 5.5 is the PJP case): toe crack Category C, root crack C'' with R_FIL = ${rTop.toFixed(3)} (A-3-6) for tt = ${fmt(g.tt)}, w = ${fmt(g.flangeWeld)}. Range of the top flange tip stress per bin; Miner sum.`,undefined,fatRefs);
 add('fatigue-bottom-flange','Bottom flange at the column weld · fatigue (compression)',miner('bottomFlange',n=>Cn(4.4,n)),1,'ratio','D=\\sum_i(\\Delta f_i/F_{SR,C})^3\\le1',`The bottom flange is in compression under every crane load. Its full applied stress range is nevertheless checked at the weld toe, Category C (item ${grp.cjp?'5.4':'5.6, toe crack'}): tensile residual stresses at the toe make a compressive applied range effective there. The root-crack (C'', R_FIL) case applies to tension-loaded plates only and is not used.`,undefined,fatRefs);
 add('fatigue-flange-web','Flange-to-web fillets · base metal fatigue (B)',miner('flangeWeb',n=>Cn(12,n)),1,'ratio','D=\\sum_i(\\Delta f_i/F_{SR,B})^3\\le1','Table A-3.1 item 3.1, Category B: base metal of a built-up member at continuous longitudinal fillet welds, no attachments. Range of the bending stress at the top and bottom flange-to-web junctions at the root.',undefined,fatRefs);
 add('fatigue-stiffener-toe','Top flange and web at the stiffener weld toes · fatigue',miner('stiffenerToe',n=>Cn(4.4,n)),1,'ratio','D=\\sum_i(\\Delta f_i/F_{SR,C})^3\\le1','Table A-3.1 item 5.7, Category C: tension-loaded flange and web at the toes of the transverse stiffener fillets, range of the top-fiber bending stress at the girder web line. The stiffeners themselves are in compression.',undefined,fatRefs);
 if(g.flare)add('fatigue-flare','Top flange at the flare corner · fatigue',miner('flare',n=>Cn(4.4,n)),1,'ratio','D=\\sum_i(\\Delta f_i/F_{SR,C})^3\\le1',`Table A-3.1 item 1.3, Category C: base metal at the re-entrant corner where the top flange starts to flare, ${fmt(g.flare.y0)} from the column face, cut to a ${fmt(g.flare.radius)} radius and ground (R >= 1 in). Range of the top-fiber bending stress there per bin; Miner sum.`,undefined,fatRefs);
 add('fatigue-column','Existing column flange at the haunch weld toes · fatigue',miner('column',n=>Cn(.39,n)),1,'ratio','D=\\sum_i(\\Delta f_i/F_{SR,E^\\prime})^3\\le1;\\quad\\Delta f=\\Delta V e_c/S_c','Table A-3.1 item 7.2, Category E-prime: the web fillets are attachments longer than 4 in along the column. Range of the column flange stress from V·e_c on the receiving section; other building stress ranges excluded.',undefined,fatRefs);
 const throat=(key:'webWeld'|'flangeWeld'|'flangeWebWeld'|'stiffenerWeld',id:string,title:string,what:string)=>add(id,title,Math.max(0,...F.map(v=>v[key])),weldF,'stress','\\Delta f_w\\le\\max[55,690(1.5/n)^{0.167}]\\,MPa',`Table A-3.1 item 8.2, Category F on the throat of ${what}; the largest unfactored range over the bins, from the ranges of the throat components, assigned to all project cycles.`,undefined,fatRefs);
 throat('webWeld','fatigue-web-weld','Web-to-column fillets · throat fatigue','the web-to-column fillets');
 if(!grp.cjp)throat('flangeWeld','fatigue-flange-weld','Flange-to-column fillets · throat fatigue','the flange-to-column fillets');
 throat('flangeWebWeld','fatigue-flange-web-weld','Flange-to-web fillets · throat fatigue','the flange-to-web fillets (shear flow VQ/I)');
 throat('stiffenerWeld','fatigue-stiffener-weld','Stiffener fillets · throat fatigue','the stiffener-to-web and bottom-flange fillets');
 return checks;
}

/**
 * Crane-level bracing collector at a new column: the girder's locating bearing bolts deliver the bay's longitudinal
 * force F to the haunch top flange, and the haunch-to-column welds carry it to the column.
 */
export function haunchCollectorWeld(p:ProjectInput,F:number){
 const g=projectHaunch(p),grp=haunchWeldGroup(g),{e}=stubBearing(p),root=haunchSection(g,0);
 const f=haunchActions(g,root,e,[],{longitudinal:F,bottom:0,offset:0}),w=haunchWeldStress(g,grp,root,f);
 const stress=grp.cjp?1.5*Math.max(Math.abs(f.Qtop)/(g.btr*g.tt),Math.abs(f.Qbot)/(g.bb*g.tb)):Math.max(w.flange,w.web);
 const capacity=grp.cjp?available(.6*p.details!.material.Fy,p.method,.9,1.67):available(.6*p.details!.material.Fexx,p.method,.75,2);
 return {stress,capacity,g,cjp:grp.cjp,a:g.a};
}
