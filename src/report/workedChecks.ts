import type {CalculationSnapshot,CheckResult} from '../engine/types';
import type {Quantity} from '../engine/units';
import {girderStrength,concentratedResistance} from '../engine/aiscStrength';
import {rectangularRibFlexure} from '../engine/bracketDesign';
import {projectHaunch,haunchStations,haunchWebShear} from '../engine/taperedHaunch';
import {flangeBracket} from './haunchColumn';
import {braceImperfection} from '../engine/forcesDelivered';
import {capAngleResult} from '../engine/capAngleTie';
import {columnStiffenerGeometry,stiffenerGauge} from '../engine/columnStiffeners';
import {dcText} from '../engine/checkPresentation';
import {caseLabel} from './reportParts';
import {caseName} from '../engine/caseNames';
import {deflectionCriteria} from '../engine/aistChecks';
import {effectiveBuildingClass,severeClass} from '../engine/buildingClass';
import {haunchStiffener} from '../engine/taperedHaunch';
import {endBearingGeometry} from '../engine/endBearing';
import {activeEndBearing} from '../engine/endBearingInputs';
import {activeEndStop} from '../engine/endStopInputs';
import {endStopGeometry,stopBumperForce} from '../engine/endStop';
import {craneCombinations} from '../engine/aistLoads';
import {simpleSupportInput} from '../engine/simpleSupports';
import {railClipResponse} from '../engine/railClip';
import {clipGeometry,railPadThickness} from '../engine/railSeat';


/**
 * Worked equations with the numbers substituted, for the checks a reviewer follows by hand. Each is rebuilt from
 * the inputs and shown only when it reproduces the check's capacity (and, where given, its demand) to 0.5%.
 */
export type Tx=(v:number,q:Quantity)=>string;
const close=(a:number,b:number|undefined)=>b!==undefined&&Number.isFinite(b)&&Math.abs(a-b)<=5e-3*Math.max(Math.abs(b),1e-9);
const n=(v:number,_d=2)=>v.toFixed(Math.min(2,_d));

export function workedSteps(s:CalculationSnapshot,c:CheckResult,tx:Tx):string[]|undefined{
 if(c.capacity===undefined||!Number.isFinite(c.capacity)||c.status==='not-applicable'||c.status==='excluded')return undefined;
 const p=s.input,d=p.details,lrfd=p.method==='LRFD',cap=c.capacity,dem=c.demand??0,q=c.quantity??'ratio';
 const factor=(phi:number,omega:number)=>lrfd?phi:1/omega,fl=(phi:number,omega:number)=>lrfd?`${n(phi)}`:`1/${n(omega)}`;
 const lhs=lrfd?'\\phi ':'1/\\Omega\\,';
 const check=(_:number,sym:string)=>`\\ \\ge\\ ${sym}=${tx(dem,q)}\\quad D/C=${dcText(c.utilization,2)}`;
 // Girder wheel patch (m10): web local yielding over the TR-13 §5.8.6 length, which already reaches the web (no k term);
 // crippling (J10.3) with the bearing length on the W flange, 2(h_r + t_wc).
 if((c.id==='wheel-yield'||c.id==='wheel-cripple')&&p.aist&&s.designAnalysis&&s.properties){
  const a=s.designAnalysis,str=girderStrength(p,s.properties),{Fy,E,tw,tf,d:depth}=p.section,capTw=p.section.kind==='cap'?p.section.capTw:0,hr=p.aist.railDepth;
  if(c.id==='wheel-yield'){
   const lb=2*(hr+tf+capTw);
   for(const [half,P] of [[1,a.wheelLoad],[.5,a.wheelNearEndLoad]] as const){const R=factor(1,1.5)*Fy*tw*lb*half;
    if(close(R,cap)&&close(P,dem))return [capTw?`l_b=2(h_r+t_f+t_{wc})=2(${tx(hr,'length')}+${tx(tf,'length')}+${tx(capTw,'length')})=${tx(lb,'length')}\\quad(\\text{TR-13 \\S5.8.6: the wheel spread through the rail, cap and flange to the web})`:`l_b=2(h_r+t_f)=2(${tx(hr,'length')}+${tx(tf,'length')})=${tx(lb,'length')}\\quad(\\text{TR-13 \\S5.8.6})`,
     `${lhs}R_n=${fl(1,1.5)}\\times F_{yw}t_w${half<1?'(l_b/2)':'l_b'}=${fl(1,1.5)}\\times${tx(Fy,'stress')}\\times${tx(tw,'length')}\\times${half<1?`${tx(lb,'length')}/2`:tx(lb,'length')}=${tx(R,'force')}${check(R,'P_u')}\\quad(\\text{J10.2 stress; no }k\\text{ term})`];}
  }
  if(c.id==='wheel-cripple'){
   const lb=2*(hr+capTw);
   for(const end of [false,true]){
    const R=concentratedResistance(p,str,lb,end).crippling,P=end?a.wheelNearEndLoad:a.wheelLoad;
    if(!close(R,cap)||!close(P,dem))continue;
    const long=end&&lb/depth>.2,t=long?`\\left(\\frac{4l_b}{d}-0.2\\right)`:`3\\frac{l_b}{d}`,tv=long?`(4\\times${(lb/depth).toFixed(3)}-0.2)`:`3\\times${(lb/depth).toFixed(3)}`;
    return [`l_b=2(h_r${capTw?'+t_{wc}':''})=2(${tx(hr,'length')}${capTw?`+${tx(capTw,'length')}`:''})=${tx(lb,'length')}\\ \\text{on the W flange};\\quad l_b/d=${tx(lb,'length')}/${tx(depth,'length')}=${(lb/depth).toFixed(3)}`,
     `${lhs}R_n=${fl(.75,2)}\\times${end?'0.40':'0.80'}t_w^2\\left[1+${t}\\left(\\frac{t_w}{t_f}\\right)^{1.5}\\right]\\sqrt{\\frac{EF_{yw}t_f}{t_w}}\\quad(\\text{${end?(long?'J10-5b':'J10-5a'):'J10-4'}})`,
     `\\quad=${fl(.75,2)}\\times${end?'0.40':'0.80'}\\times(${tx(tw,'length')})^2\\left[1+${tv}\\times${(tw/tf)**1.5>0?((tw/tf)**1.5).toFixed(3):'0'}\\right]\\sqrt{${tx(E,'stress')}\\times${tx(Fy,'stress')}\\times${(tf/tw).toFixed(3)}}=${tx(R,'force')}${check(R,'P_u')}`];
   }
  }
 }
 // Girder web sidesway buckling (m10): J10-7 with C_r from the moment at the force (J10.4).
 if(c.id==='sidesway'&&p.aist&&s.designAnalysis&&s.properties){
  const a=s.designAnalysis,str=girderStrength(p,s.properties),{tw,tf,bf}=p.section,lb=Math.max(p.unbracedLength,p.aist.bottomBraceSpacing),ratio=(str.h/tw)/(lb/bf);
  const My=Math.min(p.section.Fy,p.capDesign?.Fy??p.section.Fy)*s.properties.Sx,Mr=(lrfd?1:1.5)*a.moment,Cr=(Mr<My?960:480)*1e3*6.894757293168,R=factor(.85,1.76)*Cr*tw**3*tf/str.h**2*.4*ratio**3;
  if(close(R,cap))return [`\\frac{h/t_w}{L_b/b_f}=\\frac{${tx(str.h,'length')}/${tx(tw,'length')}}{${tx(lb,'length')}/${tx(bf,'length')}}=${ratio.toFixed(3)}\\le1.7;\\quad ${lrfd?'M_u':'1.5M_a'}=${tx(Mr,'moment')}${Mr<My?'<':'\\ge'}M_y=F_yS_x=${tx(My,'moment')}:\\ C_r=${tx(Cr,'stress')}`,
   `${lhs}R_n=${fl(.85,1.76)}\\times\\frac{C_rt_w^3t_f}{h^2}\\,0.4\\left(\\frac{h/t_w}{L_b/b_f}\\right)^3=${fl(.85,1.76)}\\times\\frac{${tx(Cr,'stress')}\\times(${tx(tw,'length')})^3\\times${tx(tf,'length')}}{(${tx(str.h,'length')})^2}\\times0.4\\times${ratio.toFixed(3)}^3=${tx(R,'force')}${check(R,'P_u')}`];
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
   return [`P_r/P_c=${tx(k.P,'force')}/${tx(C.Pc,'force')}=${n(r,3)}${r>=.2?'\\ge':'<'}0.2\\quad\\text{(${caseLabel(k.id).replace(/[\\{}#%&_$^~]/g,'').replace(/−/g,'-')})}`,
    r>=.2?`U=\\frac{P_r}{P_c}+\\frac89\\left(\\frac{M_{rx}}{M_{cx}}+\\frac{M_{ry}}{M_{cy}}\\right)=${n(r,3)}+\\frac89\\left(${terms}\\right)=${n(U,3)}\\le1`
     :`U=\\frac{P_r}{2P_c}+\\frac{M_{rx}}{M_{cx}}+\\frac{M_{ry}}{M_{cy}}=${n(r/2,3)}+${terms}=${n(U,3)}\\le1`];
  }
 }
 // Welded rib bracket: F11 plastic moment of the rectangular rib.
 if(c.id==='bracket-rib-flexure'&&d?.bracket&&!/Haunched/.test(c.title)){
  const b=d.bracket,Fy=d.material.Fy,E=p.section.E,f=rectangularRibFlexure(b,E,Fy,p.method),t=b.ribThickness,h=b.ribDepth,Mp=Fy*t*h**2/4,S=t*h**2/6,r=f.slenderness*Fy/E,Mltb=(1.52-.274*r)*Fy*S;
  if(close(f.capacity,cap)&&r>.08&&r<=1.9&&close(f.nominal,Mltb))return [`\\frac{L_bd}{t^2}\\frac{F_y}{E}=${n(f.slenderness,1)}\\times\\frac{${tx(Fy,'stress')}}{${tx(E,'stress')}}=${n(r,3)}\\quad(0.08<\\cdot\\le1.9,\\ L_b=2L,\\ C_b=1)`,`M_n=[1.52-0.274(${n(r,3)})]F_yS_x=${n(1.52-.274*r,3)}\\times${tx(Fy,'stress')}\\times\\frac{${tx(t,'length')}\\times(${tx(h,'length')})^2}{6}=${tx(Mltb,'moment')}\\quad(F11\\text{-}2)`,`${lhs}M_n=${fl(.9,1.67)}\\times${tx(Mltb,'moment')}=${tx(cap,'moment')}${check(cap,'M_r')}`];
  if(close(f.capacity,cap)&&close(f.nominal,Mp))return [`M_n=M_p=F_y\\frac{th^2}{4}=${tx(d.material.Fy,'stress')}\\times\\frac{${tx(b.ribThickness,'length')}\\times(${tx(b.ribDepth,'length')})^2}{4}=${tx(Mp,'moment')}\\quad(F11\\text{-}1)`,`${lhs}M_n=${fl(.9,1.67)}\\times${tx(Mp,'moment')}=${tx(cap,'moment')}${check(cap,'M_r')}`];
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
   // Table J3.2 F_nt in the project's units (90 / 113 ksi, 620 / 780 MPa): the table value is printed, not a converted one.
   const table=bolt.grade==='A490'?[113*6.894757293,780]:[90*6.894757293,620];
   for(const Fnt of p.units==='US'?table:[...table].reverse()){const R=factor(.75,2)*Fnt*Ab;if(close(R,cap))return [`${lhs}R_n=${fl(.75,2)}F_{nt}A_b=${fl(.75,2)}\\times${tx(Fnt,'stress')}\\times${tx(Ab,'area')}=${tx(R,'force')}\\quad(\\text{${bolt.grade}},\\ d_b=${tx(bolt.diameter,'length')})`,
    T!==undefined?`T_u+q=F/2+q=${tx(F,'force')}/2+${tx(dem-T,'force')}=${tx(dem,'force')}\\le${tx(R,'force')}\\quad D/C=${dcText(c.utilization,2)}`:`T_u+q_{ep}+q_c=${tx(dem,'force')}\\le${tx(R,'force')}\\quad(F=${tx(F,'force')})\\quad D/C=${dcText(c.utilization,2)}`];}}
 }
 // Column stiffener plate at a tapered haunch or W stub flange: the flange force shared, its lateral moment as a couple (C2).
 const fb=/^(haunch|wbracket)-(colstiff-(upper|lower)|column-panel)$/.test(c.id)?flangeBracket(s):undefined;
 if(fb&&c.id===`${fb.prefix}-colstiff-${c.id.endsWith('upper')?'upper':'lower'}`&&d){
  const up=c.id.endsWith('upper'),S=fb.S,T=S[up?'stiffUpperT':'stiffLowerT'],C=S[up?'stiffUpperC':'stiffLowerC'],pk=[T,C].find(v=>v&&close(v.value,c.demand)),g=columnStiffenerGeometry(p);
  if(pk&&g&&pk.P!==undefined&&pk.M!==undefined){
   const gauge=stiffenerGauge(g),sym=up?'T':'C',P=Math.abs(pk.P),M=Math.abs(pk.M),adds=(pk===T)===(pk.P>0),us=p.units==='US',Fy=d.material.Fy,R=factor(.9,1.67)*Fy*g.contact*g.t;
   const Mg=us?`\\frac{${tx(M,'moment')}\\times12\\,\\mathrm{in/ft}}{${tx(gauge,'length')}}`:`\\frac{${tx(M,'moment')}}{${tx(gauge,'length')}}`;
   return [`g=t_w+b_s=${tx(g.tw,'length')}+${tx(g.width,'length')}=${tx(gauge,'length')};\\quad R_{st}=${adds?`\\frac{${sym}}{2}+\\frac{M_f}{g}=\\frac{${tx(P,'force')}}{2}+${Mg}`:`\\frac{M_f}{g}-\\frac{${sym}}{2}=${Mg}-\\frac{${tx(P,'force')}}{2}`}=${tx(pk.value,'force')}`,
    close(R,cap)?`${lhs}R_n=${fl(.9,1.67)}F_y(b_s-c)t_s=${fl(.9,1.67)}\\times${tx(Fy,'stress')}\\times(${tx(g.width,'length')}-${tx(g.clip,'length')})\\times${tx(g.t,'length')}=${tx(R,'force')}${check(R,'R_{st}')}`:`${lhs}P_n/2=${tx(cap,'force')}${check(cap,'R_{st}')}`];
  }
 }
 // Column panel at the haunch or the stub (J10.6): the larger net flange force against the panel shear strength with axial force.
 if(fb&&c.id===`${fb.prefix}-column-panel`&&d?.bracket){
  const S=fb.S,r=d.bracket.receiver,hcol=r.depth-2*r.flangeThickness,A=2*r.width*r.flangeThickness+hcol*r.webThickness,Pr=r.axialDemand+(S.vertical?.value??0),a=lrfd?1:1.6,ratio=a*Pr/(r.Fy*A),k=Math.max(0,Math.min(1,1.4-ratio)),R=factor(.9,1.67)*.6*r.Fy*r.depth*r.webThickness*k;
  const T=S.tension?.value??0,C=S.compression?.value??0;
  if(close(R,cap)&&close(Math.max(T,C),dem))return [`R_u=\\max(T,\\ ${fb.bottom})=\\max(${tx(T,'force')},\\ ${tx(C,'force')})=${tx(dem,'force')}\\quad(\\text{net flange force; the }M_f\\text{ couples add no panel shear})`,
   `\\frac{\\alpha P_r}{P_y}=\\frac{${a===1?'':'1.6\\times'}${tx(Pr,'force')}}{${tx(r.Fy,'stress')}\\times${tx(A,'area')}}=${ratio.toFixed(3)}\\ \\Rightarrow\\ \\min(1,\\,1.4-${ratio.toFixed(3)})=${k.toFixed(3)}\\quad(P_r\\ \\text{column axial force with the bracket reaction})`,
   `${lhs}R_n=${fl(.9,1.67)}\\times0.6F_yd_ct_w\\times${k.toFixed(3)}=${fl(.9,1.67)}\\times0.6\\times${tx(r.Fy,'stress')}\\times${tx(r.depth,'length')}\\times${tx(r.webThickness,'length')}\\times${k.toFixed(3)}=${tx(R,'force')}${check(R,'R_u')}`];
 }
 // Top-flange tie design force (M6): the restraint force of the analysis plus the Appendix 6 brace force.
 if(c.id==='brace-member'&&s.detailResults&&s.designAnalysis&&s.properties){
  const a=s.designAnalysis,b=braceImperfection(p,a,s.properties),H=s.detailResults.demands.brace,h0=s.properties.h0,us=p.units==='US';
  if(close(H+b.force,dem))return [`P_{br}=\\frac{0.02M_rC_d}{h_o}+0.01P_r=\\frac{0.02\\times${tx(a.moment,'moment')}${us?'\\times12\\,\\mathrm{in/ft}':''}\\times${b.Cd}}{${tx(h0,'length')}}+0.01\\times${tx(a.axial,'force')}=${tx(b.flexure,'force')}+${tx(b.axial,'force')}=${tx(b.force,'force')}\\quad(\\text{App. 6.3.2a, 6.2.2})`,
   `F=H+P_{br}=${tx(H,'force')}+${tx(b.force,'force')}=${tx(dem,'force')}\\quad(H\\ \\text{largest top-flange restraint force at a grid, at the tie line})`,
   `${lhs}R_n=${tx(cap,'force')}${check(cap,'F')}`];
 }
 // J10.1 flange local bending under a tension flange force.
 if(/(column-flange|seat-flange)$/.test(c.id)&&d?.bracket&&q==='force'){
  const r=d.bracket.receiver;
  for(const half of [1,.5]){const R=factor(.9,1.67)*half*6.25*r.Fy*r.flangeThickness**2;if(close(R,cap))return [`${lhs}R_n=${fl(.9,1.67)}\\times${half<1?'0.5\\times':''}6.25F_{yf}t_f^2=${fl(.9,1.67)}\\times${half<1?'0.5\\times':''}6.25\\times${tx(r.Fy,'stress')}\\times(${tx(r.flangeThickness,'length')})^2=${tx(R,'force')}${check(R,'R_u')}`];}
 }
 // M9: one worked example of each limit state at D/C >= 0.5 or governing its element.
 // Haunch top flange as the seat of the bearings (strip method).
 if(c.id==='haunch-seat-strip'&&d?.bracket){
  const w=s.detailResults?.taperedHaunch?.strength.strip?.work,g=projectHaunch(p),Fy=d.material.Fy,tf=g.tt,R=factor(.9,1.67)*Fy*tf**2/4;
  if(w&&close(R,cap)){const across=w.across>=w.along;
   const m=across?w.P*w.c**2/(2*w.l*w.W):w.Pa*(w.xa-w.xs)/w.be;
   if(close(m,dem))return [across?`m_u=\\frac{Pc^2}{2lW}=\\frac{${tx(w.P,'force')}\\times(${tx(w.c,'length')})^2}{2\\times${tx(w.l,'length')}\\times${tx(w.W,'length')}}=${tx(m,'force')}\\ \\text{per unit width}\\quad(c=W/2-t_s/2;\\ l\\ \\text{the patch spread at 45° through the bearing plate})`
     :`m_u=\\frac{P(x-x_s)}{b_e}=\\frac{${tx(w.Pa,'force')}\\times(${tx(w.xa,'length')}-${tx(w.xs,'length')})}{${tx(w.be,'length')}}=${tx(m,'force')}\\ \\text{per unit width}\\quad(\\text{beyond the stiffener tip }x_s)`,
    `${lhs}M_n=${fl(.9,1.67)}\\times\\frac{F_yt_f^2}{4}=${fl(.9,1.67)}\\times\\frac{${tx(Fy,'stress')}\\times(${tx(tf,'length')})^2}{4}=${tx(R,'force')}${check(R,'m_u')}`];}
 }
 // Haunch bearing stiffener as a column with the reaction eccentric (J10.8, J4.4 / E3, H1).
 if(c.id==='haunch-stiffener-column'&&d?.bracket){
  const w=s.detailResults?.taperedHaunch?.strength.stiffener?.work,g=projectHaunch(p),Fy=d.material.Fy,st=haunchStiffener(g,p.section.E,Fy,p.method);
  if(w){const Pr=w.P/w.Pc,e=Math.abs(w.x-w.xc),Mr=w.P*e/(factor(.9,1.67)*Fy*w.Z),U=Pr>=.2?Pr+8/9*Mr:Pr/2+Mr;
   if(close(U,dem))return [`A=2b_st_s+${st.interior?25:12}t_w\\,t_w=2\\times${tx(st.width,'length')}\\times${tx(st.t,'length')}+${tx(st.strip,'length')}\\times${tx(g.tw,'length')}=${tx(st.A,'area')};\\quad L_c/r=${tx(st.KL,'length')}/${tx(st.r,'length')}=${st.slender.toFixed(1)}\\ ${st.slender<=25?'\\le25\\ (\\text{J4.4}):\\ \\phi P_n=0.90F_yA':'(\\text{E3})'}=${tx(st.column,'force')}`,
    `P_c=\\phi P_n/2=${tx(w.Pc,'force')}\\ \\text{(one stiffener)};\\quad e=|x-x_c|=|${tx(w.x,'length')}-${tx(w.xc,'length')}|=${tx(e,'length')};\\quad Z=t_sb_s^2/4=${tx(w.Z,'modulus')}`,
    `${Pr>=.2?'\\frac{P_r}{P_c}+\\frac89\\frac{P_re}{\\phi_bF_yZ}':'\\frac{P_r}{2P_c}+\\frac{P_re}{\\phi_bF_yZ}'}=${Pr>=.2?`\\frac{${tx(w.P,'force')}}{${tx(w.Pc,'force')}}+\\frac89`:`\\frac{${tx(w.P,'force')}}{2\\times${tx(w.Pc,'force')}}+`}\\frac{${tx(w.P,'force')}\\times${tx(e,'length')}}{${fl(.9,1.67)}\\times${tx(Fy,'stress')}\\times${tx(w.Z,'modulus')}}=${U.toFixed(3)}\\le1\\quad D/C=${dcText(c.utilization,2)}`];}
 }
 // Sleeves under the bolt installation load: 1.5T_b against the sleeve yield strength, phi = 1.0.
 if((c.id==='cap-angle-sleeve'||c.id==='end-bearing-sleeve')&&d){
  const sl=c.id==='cap-angle-sleeve'?capAngleResult(s)?.g.cap.sleeve:(()=>{const e=activeEndBearing(p);if(!e)return undefined;const g=endBearingGeometry(p,e);return g.sleeve?{od:g.sleeve.od,bore:g.hole,area:g.sleeve.area}:undefined;})();
  if(sl&&close(d.material.Fy*sl.area,cap)){const Tb=dem/1.5;
   return [`A_g=\\frac{\\pi}{4}(d_o^2-d_h^2)=\\frac{\\pi}{4}\\left[(${tx(sl.od,'length')})^2-(${tx(sl.bore,'length')})^2\\right]=${tx(sl.area,'area')}\\quad(\\text{sleeve})`,
    `1.5T_b=1.5\\times${tx(Tb,'force')}=${tx(dem,'force')}\\ \\le\\ \\phi F_yA_g=1.00\\times${tx(d.material.Fy,'stress')}\\times${tx(sl.area,'area')}=${tx(cap,'force')}\\quad D/C=${dcText(c.utilization,2)}\\quad(T_b\\ \\text{Table J3.1})`];}
 }
 // Slot and guide travel each way: rotation, thermal movement and the setting tolerance.
 if(c.id==='cap-angle-slot-travel'){
  const res=capAngleResult(s);
  if(res){const {loads:l,design:x,g}=res,rot=l.rotation*g.boltHeight;
   if(close(x.travelRequired,dem)&&close(g.cap.travel,cap))return [`\\theta h_b+\\alpha L\\Delta T+t_{set}=${l.rotation.toFixed(5)}\\times${tx(g.boltHeight,'length')}+${tx(l.thermal,'length')}+${tx(x.set,'length')}=${tx(rot,'length')}+${tx(l.thermal,'length')}+${tx(x.set,'length')}=${tx(dem,'length')}\\ \\le\\ u=${tx(cap,'length')}\\quad D/C=${dcText(c.utilization,2)}`];}
 }
 if(c.id==='simple-guide-travel'&&s.designAnalysis){
  const sp=simpleSupportInput(p),L=Math.max(...p.spans),dT=Math.max(sp.temperatureRise,sp.temperatureFall),th=s.designAnalysis.endRotation,thermal=12e-6*L*dT,rot=p.section.d*th;
  if(close(thermal+rot+sp.settingTolerance,dem))return [`\\alpha L\\Delta T+d\\theta+t_{set}=${p.units==='US'?'6.67\\times10^{-6}/{}^\\circ\\mathrm{F}':'12\\times10^{-6}/{}^\\circ\\mathrm{C}'}\\times${tx(L,'length')}\\times${tx(dT,'temperatureChange')}+${tx(p.section.d,'length')}\\times${th.toFixed(5)}+${tx(sp.settingTolerance,'length')}`,
   `\\quad=${tx(thermal,'length')}+${tx(rot,'length')}+${tx(sp.settingTolerance,'length')}=${tx(dem,'length')}\\ \\le\\ u=${tx(cap,'length')}\\quad D/C=${dcText(c.utilization,2)}`];
 }
 // End stop plies: AISC Manual Part 9 thickness for no prying under the front bolt tension.
 if((c.id==='end-stop-flange-prying'||c.id==='end-stop-base-prying')&&d){
  const e=activeEndStop(p);
  if(e){const g=endStopGeometry(p,e),P=Math.max(...craneCombinations(p.method).map(v=>v.bumper))*stopBumperForce(p),tb=e.base.thickness,lever=g.frontRow-g.back-tb,M=P*(g.contact+tb),T=M/(2*lever),db=e.bolts.diameter;
   const flange=c.id==='end-stop-flange-prying',b=flange?e.bolts.gauge/2-p.section.tw/2:Math.min(e.bolts.frontClear,(e.bolts.gauge-e.stiffener.spacing)/2-e.stiffener.thickness/2),pp=flange?Math.min(g.frontRow-g.backRow,3.5*b):Math.min(e.base.width/2,3.5*b),Fu=flange?p.section.Fu:d.material.Fu;
   const t=Math.sqrt(4*T*(b-db/2)/(factor(.9,1.67)*pp*Fu));
   if(close(t,dem))return [`T=\\frac{P(e+t_b)}{2d}=\\frac{${tx(P,'force')}\\times(${tx(g.contact,'length')}+${tx(tb,'length')})}{2\\times${tx(lever,'length')}}=${tx(T,'force')}\\ \\text{per front bolt}`,
    `t_{min}=\\sqrt{\\frac{4Tb^\\prime}{\\phi pF_u}}=\\sqrt{\\frac{4\\times${tx(T,'force')}\\times(${tx(b,'length')}-${tx(db,'length')}/2)}{${fl(.9,1.67)}\\times${tx(pp,'length')}\\times${tx(Fu,'stress')}}}=${tx(t,'length')}\\ \\le\\ t=${tx(cap,'length')}\\quad D/C=${dcText(c.utilization,2)}`];}
 }
 // Rail lateral flexure between clip pairs, with phi.
 if(c.id==='rail-flexure'&&d&&s.detailResults&&p.aist){
  const r=d.rail,depth=p.aist.railDepth,webDepth=depth-r.headThickness-r.baseThickness,Iy=(r.headThickness*r.headWidth**3+r.baseThickness*r.baseWidth**3+webDepth*r.webThickness**3)/12,Sy=Iy/(Math.max(r.headWidth,r.baseWidth)/2),H=s.detailResults.demands.railLateral,sp=p.aist.clipSpacing,R=factor(.9,1.67)*r.Fy*Sy;
  if(close(R,cap)&&close(H*sp/4,dem))return [`M_r=\\frac{Hs}{4}=\\frac{${tx(H,'force')}\\times${tx(sp,'length')}}{4}=${tx(dem,'moment')};\\quad S_y=${tx(Sy,'modulus')}\\ \\text{(rail head, web and base)}`,
   `${lhs}M_n=${fl(.9,1.67)}F_yS_y=${fl(.9,1.67)}\\times${tx(r.Fy,'stress')}\\times${tx(Sy,'modulus')}=${tx(R,'moment')}${check(R,'M_r')}`];
 }
 // Rail clips: the manufacturer's ratings against the clip forces, and the base welds (J2.4, elastic).
 if(c.id==='rail-clip-uplift'&&d&&p.aist){
  const r=d.rail,depth=p.aist.railDepth,Hc=dem*r.baseWidth/depth;
  return [`T_c=\\frac{H_ch_r}{b_r}=\\frac{${tx(Hc,'force')}\\times${tx(depth,'length')}}{${tx(r.baseWidth,'length')}}=${tx(dem,'force')}\\ \\le\\ R_t=${tx(cap,'force')}\\quad D/C=${dcText(c.utilization,2)}`];
 }
 if(c.id==='rail-clip-weld'&&d&&s.detailResults&&p.aist){
  const H=s.detailResults.demands.railLateral,k=clipGeometry(d.rail,railPadThickness(p)),w=railClipResponse(p,H,k),R=factor(.75,2)*.6*d.material.Fexx;
  const best=w.roles.reduce((x,v)=>v.weldStress>x.weldStress?v:x);
  if(close(R,cap)&&close(best.weldStress,dem))return [`A_w=2t_el_w=2\\times${tx(w.throat,'length')}\\times${tx(k.weldLength,'length')}=${tx(w.A,'area')}\\quad(t_e=0.707w)`,
   best.role==='bearing'?`\\text{bearing clip: }V=H=${tx(H,'force')},\\ M=Vh_c=${tx(H,'force')}\\times${tx(k.lateralHeight,'length')}=${tx(best.moment,'moment')}`
    :`\\text{hold-down clip: }T=\\frac{Hh_r}{b_r}=${tx(best.uplift,'force')},\\ M=Te_c=${tx(best.uplift,'force')}\\times${tx(w.upliftArm,'length')}=${tx(best.moment,'moment')}`,
   `f_w=\\frac{1}{2t_el_w}\\sqrt{V^2+\\left(T+\\frac{6M}{l_w}\\right)^2}=${tx(best.weldStress,'stress')}\\ \\le\\ ${lhs}F_n=${fl(.75,2)}\\times0.6\\times${tx(d.material.Fexx,'stress')}=${tx(R,'stress')}\\quad D/C=${dcText(c.utilization,2)}`];
 }
 // Vertical deflection (m3): every criterion stated, the governing one used; two equal wheels about midspan.
 if(c.id==='vertical'&&p.system==='simple'&&s.properties&&p.cranes.length===1&&p.cranes[0].wheels.length===2){
  const cr=p.cranes[0],w=cr.wheels,Pw=w[0].loaded/(cr.includesImpact?1+cr.impact:1),sp=Math.abs(w[1].offset-w[0].offset),L=Math.max(...p.spans),a=(L-sp)/2,EI=p.section.E*s.properties.Ix,D=Pw*a*(3*L*L-4*a*a)/(24*EI),n=Math.round(L/cap);
  const k=effectiveBuildingClass(p),dc=deflectionCriteria(p),crit=`\\text{owner }L/${p.verticalLimit},\\ \\text{AIST Class ${k} }L/${severeClass(k)?1000:600},\\ \\text{${dc.classes?`CMAA ${dc.heaviest}`:'CMAA A to C'} }L/${dc.heaviestN||600}`;
  if(Math.abs(w[1].loaded-w[0].loaded)<1e-6&&a>0&&close(D,dem))return [`\\Delta_v\\le L/n_v,\\ n_v=\\max(${p.verticalLimit},\\,${severeClass(k)?1000:600},\\,${dc.heaviestN||600})=${n}:\\ L/${n}=${tx(L,'length')}/${n}=${tx(cap,'length')}\\quad(${crit})`,
   `\\Delta_v=\\frac{Pa(3L^2-4a^2)}{24EI_x}=\\frac{${tx(Pw,'force')}\\times${tx(a,'length')}\\times[3(${tx(L,'length')})^2-4(${tx(a,'length')})^2]}{24\\times${tx(p.section.E,'stress')}\\times${tx(s.properties.Ix,'inertia')}}=${tx(D,'length')}\\ \\le\\ ${tx(cap,'length')}\\quad D/C=${dcText(c.utilization,2)}`,
   `\\quad(\\text{two static wheels }${tx(sp,'length')}\\text{ apart, symmetric about midspan, }a=(L-s)/2;\\ \\text{no impact})`];
 }
 // Lateral deflection: every criterion stated, the governing one used (the deflection is from the analysis).
 if(c.id==='lateral'){const L=Math.max(...p.spans),n=Math.round(L/cap);
  return [`\\Delta_h\\le L/n_h,\\ n_h=\\max(${p.lateralLimit},\\,400)=${n}:\\ L/${n}=${tx(L,'length')}/${n}=${tx(cap,'length')}\\quad(\\text{owner }L/${p.lateralLimit},\\ \\text{AIST TR-13 }L/400)`,
   `\\Delta_h=${tx(dem,'length')}\\ \\le\\ ${tx(cap,'length')}\\quad D/C=${dcText(c.utilization,2)}\\quad(\\text{top flange, rail-head force couple, one crane})`];}
 // Stress limits: weld metal, shear yielding or rupture, yielding of plates and flanges.
 if(q==='stress'){
  const fy:[string,number][]=[[p.section.name,p.section.Fy],...(d?[['plates',d.material.Fy] as [string,number]]:[]),...(d?.bracket?[['column',d.bracket.receiver.Fy] as [string,number]]:[])];
  const fu:[string,number][]=[[p.section.name,p.section.Fu],...(d?[['plates',d.material.Fu] as [string,number]]:[]),...(d?.bracket?[['column',d.bracket.receiver.Fu] as [string,number]]:[])];
  const fexx=[...(d?[d.material.Fexx]:[]),p.connections.Fexx,...(p.capDesign?[p.capDesign.Fexx]:[])];
  const forms:{tex:string;sym:string;phi:number;omega:number;k:number;values:number[]}[]=[
   {tex:'0.6F_{EXX}',sym:'F_{EXX}',phi:.75,omega:2,k:.6,values:fexx},{tex:'0.6F_y',sym:'F_y',phi:1,omega:1.5,k:.6,values:fy.map(v=>v[1])},{tex:'0.6F_y',sym:'F_y',phi:.9,omega:1.67,k:.6,values:fy.map(v=>v[1])},
   {tex:'0.6F_u',sym:'F_u',phi:.75,omega:2,k:.6,values:fu.map(v=>v[1])},{tex:'F_y',sym:'F_y',phi:.9,omega:1.67,k:1,values:fy.map(v=>v[1])},{tex:'F_u',sym:'F_u',phi:.75,omega:2,k:1,values:fu.map(v=>v[1])}];
  // The demand takes the symbol on the left of the check's equation (f_un, f_uv, f_w …), else f.
  const fsym=c.equation.match(/^(f_\{[A-Za-z]+\}|f_[A-Za-z]|q_w)(?=\s*(=|\\le))/)?.[1]??'f';
  if(!/fatigue|peak/.test(c.id))for(const f of forms)for(const v of f.values){const R=factor(f.phi,f.omega)*f.k*v;if(close(R,cap))return [`${lhs}F_n=${fl(f.phi,f.omega)}\\times ${f.tex}=${fl(f.phi,f.omega)}\\times${f.k===1?'':'0.6\\times'}${tx(v,'stress')}=${tx(R,'stress')}${check(R,fsym)}`];}
 }
 return undefined;
}

/**
 * The unstiffened J10 column checks at the flanges of a tapered haunch or a W stub, worked for information (C2): the
 * equivalent concentrated force R_u = P + 3M_f/b of each flange's force system and the J10.1 (top) and J10.3 (bottom)
 * strengths. Where the column is stiffened these are not governing; the stiffener plate check carries the system.
 */
export function flangeJ10Worked(s:CalculationSnapshot,tx:Tx):string[]{
 const p=s.input,d=p.details,fb=flangeBracket(s);if(!d?.bracket?.enabled||!fb)return [];
 const S=fb.S,pull=S.pull,push=S.push;if(!pull||!push||pull.P===undefined||push.P===undefined)return [];
 const J=fb.J,r=d.bracket.receiver,us=p.units==='US',lrfd=p.method==='LRFD',fl=(phi:number,omega:number)=>lrfd?n(phi):`1/${n(omega)}`,lhs=lrfd?'\\phi ':'1/\\Omega\\,';
 // The equation on its own line and the substitution below it, broken at "=", so neither runs past the page margin.
 const Ru=(pk:typeof pull,sym:string,b:number)=>[`R_u=${sym}+\\frac{3M_f}{b}`,`\\quad=${tx(Math.abs(pk.P!),'force')}+\\frac{3\\times${tx(Math.abs(pk.M??0),'moment')}${us?'\\times12\\,\\mathrm{in/ft}':''}}{${tx(b,'length')}}=${tx(pk.value,'force')}`];
 const half=J.topFlangeEnd?.5:1,flange=(lrfd?.9:1/1.67)*half*6.25*r.Fy*r.flangeThickness**2;
 // The case name heads each flange on a line of its own.
 const head=(name:string,caseId:string|undefined)=>`\\text{${name} (${caseName(s,caseId).replace(/[\\{}#%&_$^~]/g,'')}):}`;
 const lines=[head('Top flange',pull.caseId),...Ru(pull,'T',fb.b[0])];
 if(close(flange,J.flange))lines.push(`\\quad${lhs}R_n=${fl(.9,1.67)}\\times${half<1?'0.5\\times':''}6.25F_{yf}t_f^2=${fl(.9,1.67)}\\times${half<1?'0.5\\times':''}6.25\\times${tx(r.Fy,'stress')}\\times(${tx(r.flangeThickness,'length')})^2=${tx(J.flange,'force')}\\quad D/C=${dcText(pull.value/J.flange,2)}\\quad(\\text{J10.1})`);
 lines.push(head('Bottom flange',push.caseId),...Ru(push,fb.bottom,fb.b[1]));
 const tw=r.webThickness,tf=r.flangeThickness,end=J.botCrippleEnd,long=end&&J.N/r.depth>.2,term=long?4*J.N/r.depth-.2:3*J.N/r.depth;
 const crip=(lrfd?.75:1/2)*(end?.4:.8)*tw**2*(1+term*(tw/tf)**1.5)*Math.sqrt(p.section.E*r.Fy*tf/tw);
 if(close(crip,J.crippling))lines.push(`\\quad${lhs}R_n=${fl(.75,2)}\\times${end?'0.40':'0.80'}t_w^2\\left[1+${long?'\\left(\\frac{4l_b}{d}-0.2\\right)':'3\\frac{l_b}{d}'}\\left(\\frac{t_w}{t_f}\\right)^{1.5}\\right]\\sqrt{\\frac{EF_{yw}t_f}{t_w}}=${tx(J.crippling,'force')}\\quad D/C=${dcText(push.value/J.crippling,2)}\\quad(\\text{J10.3},\\ l_b=${tx(J.N,'length')},\\ d=${tx(r.depth,'length')})`);
 return lines;
}
/** The tapered haunch's J10 worked example; flangeJ10Worked serves the W stub too. */
export const haunchJ10Worked=flangeJ10Worked;
