import type {CalculationSnapshot,CheckResult} from '../engine/types';
import type {Quantity} from '../engine/units';
import {girderStrength,concentratedResistance} from '../engine/aiscStrength';
import {rectangularRibFlexure} from '../engine/bracketDesign';
import {projectHaunch,haunchStations,haunchWebShear} from '../engine/taperedHaunch';
import {capAngleResult} from '../engine/capAngleTie';
import {dcText} from '../engine/checkPresentation';

/**
 * Worked equations with the numbers substituted, for the checks a reviewer follows by hand. Each is rebuilt from
 * the inputs and shown only when it reproduces the check's capacity (and, where given, its demand) to 0.5%.
 */
export type Tx=(v:number,q:Quantity)=>string;
const close=(a:number,b:number|undefined)=>b!==undefined&&Number.isFinite(b)&&Math.abs(a-b)<=5e-3*Math.max(Math.abs(b),1e-9);
const n=(v:number,d=2)=>v.toFixed(d);

export function workedSteps(s:CalculationSnapshot,c:CheckResult,tx:Tx):string[]|undefined{
 if(c.capacity===undefined||!Number.isFinite(c.capacity)||c.status==='not-applicable'||c.status==='excluded')return undefined;
 const p=s.input,d=p.details,lrfd=p.method==='LRFD',cap=c.capacity,dem=c.demand??0,q=c.quantity??'ratio';
 const factor=(phi:number,omega:number)=>lrfd?phi:1/omega,fl=(phi:number,omega:number)=>lrfd?`${n(phi)}`:`1/${n(omega)}`;
 const lhs=lrfd?'\\phi ':'1/\\Omega\\,';
 const check=(_:number,sym:string)=>`\\ \\ge\\ ${sym}=${tx(dem,q)}\\quad D/C=${dcText(c.utilization,3)}`;
 // Girder wheel patch: J10.2 and J10.3 with the AIST bearing length.
 if((c.id==='wheel-yield'||c.id==='wheel-cripple')&&p.aist&&s.designAnalysis&&s.properties){
  const a=s.designAnalysis,str=girderStrength(p,s.properties),{Fy,E,tw,tf,d:depth}=p.section,lb=2*(p.aist.railDepth+tf);
  for(const end of [false,true]){
   const R=concentratedResistance(p,str,lb,end),P=end?a.wheelNearEndLoad:a.wheelLoad;
   if(c.id==='wheel-yield'&&close(P/R.yielding,c.utilization))return [
    `l_b=2(d_{rail}+t_f)=2(${tx(p.aist.railDepth,'length')}+${tx(tf,'length')})=${tx(lb,'length')}`,
    `${lrfd?'\\phi R_n=1.00':'R_n/\\Omega=1/1.50\\times'}F_yt_w(${end?'2.5':'5'}k+l_b)=${lrfd?'1.00':'1/1.50'}\\times${tx(Fy,'stress')}\\times${tx(tw,'length')}\\times(${end?'2.5':'5'}\\times${tx(str.k,'length')}+${tx(lb,'length')})=${tx(R.yielding,'force')}\\ \\ge\\ P_u=${tx(P,'force')}\\quad D/C=${dcText(c.utilization,3)}`];
   if(c.id==='wheel-cripple'&&close(P/R.crippling,c.utilization)){
    const t=end&&lb/depth>.2?`(4l_b/d-0.2)`:`3(l_b/d)`,tv=end&&lb/depth>.2?`(4\\times${n(lb/depth,3)}-0.2)`:`3\\times${n(lb/depth,3)}`;
    return [`${lrfd?'\\phi R_n=0.75':'R_n/\\Omega=1/2.00\\times'}\\,${end?'0.40':'0.80'}t_w^2\\left[1+${t}(t_w/t_f)^{1.5}\\right]\\sqrt{EF_yt_f/t_w}=${lrfd?'0.75':'1/2.00'}\\times${end?'0.40':'0.80'}\\times${tx(tw,'length')}^2\\left[1+${tv}\\times${n((tw/tf)**1.5,3)}\\right]\\sqrt{${tx(E,'stress')}\\times${tx(Fy,'stress')}\\times${n(tf/tw,3)}}=${tx(R.crippling,'force')}`,
     `P_u=${tx(P,'force')}\\quad D/C=${dcText(c.utilization,3)}`];
   }
  }
 }
 // Girder fitted bearing stiffeners and their welds.
 if(c.id==='stiffener-bearing'&&d&&s.properties){
  const b=d.bearing,Fy=Math.min(d.material.Fy,p.section.Fy),A=2*(b.stiffenerWidth-b.cope)*b.stiffenerThickness,R=factor(.75,2)*1.8*Fy*A;
  if(close(R,cap))return [`A_{pb}=2(b_s-c)t_s=2(${tx(b.stiffenerWidth,'length')}-${tx(b.cope,'length')})\\times${tx(b.stiffenerThickness,'length')}=${tx(A,'area')}`,`${lhs}R_n=${fl(.75,2)}\\times1.8F_yA_{pb}=${fl(.75,2)}\\times1.8\\times${tx(Fy,'stress')}\\times${tx(A,'area')}=${tx(R,'force')}${check(R,'R_u')}`];
 }
 if(c.id==='stiffener-weld'&&d&&s.properties){
  const b=d.bearing,h=girderStrength(p,s.properties).h,L=4*(h-2*b.cope),R=factor(.75,2)*.6*d.material.Fexx*(b.weldSize/Math.SQRT2)*L;
  if(close(R,cap))return [`${lhs}R_n=${fl(.75,2)}\\times0.6F_{EXX}(0.707w)\\,4(h-2c)=${fl(.75,2)}\\times0.6\\times${tx(d.material.Fexx,'stress')}\\times0.707\\times${tx(b.weldSize,'length')}\\times4(${tx(h,'length')}-2\\times${tx(b.cope,'length')})=${tx(R,'force')}${check(R,'R_u')}`];
 }
 // Existing or new column: AISC H1-1 with the amplified moments of the governing combination.
 if(c.id==='column-interaction'&&s.existingColumn){
  const x=s.existingColumn,k=x.governing.U,C=x.capacity,r=k.P/C.Pc,U=r>=.2?r+8/9*(Math.abs(k.Mx)/C.Mcx+Math.abs(k.My)/C.Mcy):r/2+Math.abs(k.Mx)/C.Mcx+Math.abs(k.My)/C.Mcy;
  if(close(U,c.demand)){
   const terms=`\\frac{${tx(Math.abs(k.Mx),'moment')}}{${tx(C.Mcx,'moment')}}+\\frac{${tx(Math.abs(k.My),'moment')}}{${tx(C.Mcy,'moment')}}`;
   return [`P_r/P_c=${tx(k.P,'force')}/${tx(C.Pc,'force')}=${n(r,3)}${r>=.2?'\\ge':'<'}0.2\\quad\\text{(${k.id.replace(/[\\{}#%&_$^~]/g,'').replace(/−/g,'-')})}`,
    r>=.2?`U=\\frac{P_r}{P_c}+\\frac89\\left(\\frac{M_{rx}}{M_{cx}}+\\frac{M_{ry}}{M_{cy}}\\right)=${n(r,3)}+\\frac89\\left(${terms}\\right)=${n(U,3)}\\le1`
     :`U=\\frac{P_r}{2P_c}+\\frac{M_{rx}}{M_{cx}}+\\frac{M_{ry}}{M_{cy}}=${n(r/2,3)}+${terms}=${n(U,3)}\\le1`];
  }
 }
 // Welded rib bracket: F11 plastic moment of the rectangular rib.
 if(c.id==='bracket-rib-flexure'&&d?.bracket&&!/Haunched/.test(c.title)){
  const b=d.bracket,Fy=d.material.Fy,E=p.section.E,f=rectangularRibFlexure(b,E,Fy,p.method),t=b.ribThickness,h=b.ribDepth,Mp=Fy*t*h**2/4,S=t*h**2/6,r=f.slenderness*Fy/E,Mltb=(1.52-.274*r)*Fy*S;
  if(close(f.capacity,cap)&&r>.08&&r<=1.9&&close(f.nominal,Mltb))return [`\\frac{L_bd}{t^2}\\frac{F_y}{E}=${n(f.slenderness,1)}\\times\\frac{${tx(Fy,'stress')}}{${tx(E,'stress')}}=${n(r,3)}\\quad(0.08<\\cdot\\le1.9,\\ L_b=2L,\\ C_b=1)`,`M_n=[1.52-0.274(${n(r,3)})]F_yS_x=${n(1.52-.274*r,3)}\\times${tx(Fy,'stress')}\\times\\frac{${tx(t,'length')}\\times${tx(h,'length')}^2}{6}=${tx(Mltb,'moment')}\\quad(F11\\text{-}2)`,`${lhs}M_n=${fl(.9,1.67)}\\times${tx(Mltb,'moment')}=${tx(cap,'moment')}${check(cap,'M_r')}`];
  if(close(f.capacity,cap)&&close(f.nominal,Mp))return [`M_n=M_p=F_y\\frac{th^2}{4}=${tx(d.material.Fy,'stress')}\\times\\frac{${tx(b.ribThickness,'length')}\\times${tx(b.ribDepth,'length')}^2}{4}=${tx(Mp,'moment')}\\quad(F11\\text{-}1)`,`${lhs}M_n=${fl(.9,1.67)}\\times${tx(Mp,'moment')}=${tx(cap,'moment')}${check(cap,'M_r')}`];
 }
 // Tapered I haunch web shear on its governing vertical section.
 if(c.id==='haunch-shear'&&d?.bracket){
  const g=projectHaunch(p),st=haunchStations(g,p.section.E,d.material.Fy,d.bracket.reach+d.bearing.width/2,d.bearing.width);
  for(const v of st){const w=haunchWebShear(g,v.s,p.section.E,d.material.Fy,p.method);if(close(w.capacity,cap))return [`A_w=h(y)t_w=${tx(v.s.Aw/g.tw,'length')}\\times${tx(g.tw,'length')}=${tx(v.s.Aw,'area')}\\ \\ (y=${tx(v.y,'length')});\\quad C_{v1}=${n(w.Cv1,3)}\\ (h/t_w=${n(w.ratio,1)})`,`${lhs}V_n=${fl(.9,1.67)}\\times0.6F_yA_wC_{v1}=${fl(.9,1.67)}\\times0.6\\times${tx(d.material.Fy,'stress')}\\times${tx(v.s.Aw,'area')}\\times${n(w.Cv1,3)}=${tx(cap,'force')}${check(cap,'V_u')}`];}
 }
 // Cap tieback angle: bolts in tension with prying.
 if(/^cap-angle-(cap|col)-bolt$/.test(c.id)){
  const res=capAngleResult(s),bolt=c.id==='cap-angle-cap-bolt'?res?.g.input.capBolts:res?.g.input.columnBolts;
  if(res&&bolt){const Ab=Math.PI*bolt.diameter**2/4,F=res.design.F,T=c.id==='cap-angle-cap-bolt'?F/2:undefined;
   for(const Fnt of bolt.grade==='A490'?[780,113*6.894757293]:[620,90*6.894757293]){const R=factor(.75,2)*Fnt*Ab;if(close(R,cap))return [`${lhs}R_n=${fl(.75,2)}F_{nt}A_b=${fl(.75,2)}\\times${tx(Fnt,'stress')}\\times${tx(Ab,'area')}=${tx(R,'force')}\\quad(${bolt.grade},\\ d_b=${tx(bolt.diameter,'length')})`,
    T!==undefined?`T_u+q=F/2+q=${tx(F,'force')}/2+${tx(dem-T,'force')}=${tx(dem,'force')}\\le${tx(R,'force')}\\quad D/C=${dcText(c.utilization,3)}`:`T_u+q_{ep}+q_c=${tx(dem,'force')}\\le${tx(R,'force')}\\quad(F=${tx(F,'force')})\\quad D/C=${dcText(c.utilization,3)}`];}}
 }
 // J10.1 flange local bending under a tension flange force.
 if(/(column-flange|seat-flange)$/.test(c.id)&&d?.bracket&&q==='force'){
  const r=d.bracket.receiver;
  for(const half of [1,.5]){const R=factor(.9,1.67)*half*6.25*r.Fy*r.flangeThickness**2;if(close(R,cap))return [`${lhs}R_n=${fl(.9,1.67)}\\times${half<1?'0.5\\times':''}6.25F_{yf}t_f^2=${fl(.9,1.67)}\\times${half<1?'0.5\\times':''}6.25\\times${tx(r.Fy,'stress')}\\times${tx(r.flangeThickness,'length')}^2=${tx(R,'force')}${check(R,'R_u')}`];}
 }
 // Stress limits: weld metal, shear yielding or rupture, yielding of plates and flanges.
 if(q==='stress'){
  const fy:[string,number][]=[[p.section.name,p.section.Fy],...(d?[['plates',d.material.Fy] as [string,number]]:[]),...(d?.bracket?[['column',d.bracket.receiver.Fy] as [string,number]]:[])];
  const fu:[string,number][]=[[p.section.name,p.section.Fu],...(d?[['plates',d.material.Fu] as [string,number]]:[]),...(d?.bracket?[['column',d.bracket.receiver.Fu] as [string,number]]:[])];
  const fexx=[...(d?[d.material.Fexx]:[]),p.connections.Fexx,...(p.capDesign?[p.capDesign.Fexx]:[])];
  const forms:{tex:string;sym:string;phi:number;omega:number;k:number;values:number[]}[]=[
   {tex:'0.6F_{EXX}',sym:'F_{EXX}',phi:.75,omega:2,k:.6,values:fexx},{tex:'0.6F_y',sym:'F_y',phi:1,omega:1.5,k:.6,values:fy.map(v=>v[1])},{tex:'0.6F_y',sym:'F_y',phi:.9,omega:1.67,k:.6,values:fy.map(v=>v[1])},
   {tex:'0.6F_u',sym:'F_u',phi:.75,omega:2,k:.6,values:fu.map(v=>v[1])},{tex:'F_y',sym:'F_y',phi:.9,omega:1.67,k:1,values:fy.map(v=>v[1])},{tex:'F_u',sym:'F_u',phi:.75,omega:2,k:1,values:fu.map(v=>v[1])}];
  if(!/fatigue|peak/.test(c.id))for(const f of forms)for(const v of f.values){const R=factor(f.phi,f.omega)*f.k*v;if(close(R,cap))return [`${lhs}F_n=${fl(f.phi,f.omega)}\\times ${f.tex}=${fl(f.phi,f.omega)}\\times${f.k===1?'':'0.6\\times'}${tx(v,'stress')}=${tx(R,'stress')}${check(R,'f')}`];}
 }
 return undefined;
}
