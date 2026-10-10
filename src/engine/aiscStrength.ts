import {cappedStrength} from './cappedStrength';
import { aiscShapeByName } from '../data/aiscSections';
import type { ProjectInput, Properties } from './types';

export interface GirderStrength { /** Singly symmetric members: resistance to negative (hogging) moment, bottom flange in compression. */ majorReverse?:number; topMinor?:number; bottomMinor?:number; capDirections?:{rt:number;Lp:number;Lr:number;Rpg:number;Sc:number;Mn:number}[]; k:number; h:number; flangeRatio:number; webRatio:number; flangeLimit:number; webLimit:number; compact:boolean; Lp:number; Lr:number; rts:number; major:number; netMoment:number; netLimitApplies:boolean; Yt:number; minor:number; flangeMinor:number; shear:number; compression:number; elasticAxial:number; axialArea:number; flexureBranch:string; Cv:number; shearPhi:number; shearOmega:number; }
export const available=(nominal:number,method:ProjectInput['method'],phi:number,omega:number)=>method==='LRFD'?phi*nominal:nominal/omega;
// AISC 360-16 B4, E3/E4/E7, F2/F6 and G2. Canonical units N, mm, MPa.
// Cb=1.0; no tension field action, no rail composite action or stiffener credit.
export function girderStrength(p:ProjectInput,s:Properties):GirderStrength {
 const {E,Fy,d,bf,tf,tw}=p.section,root=Math.sqrt(E/Fy);
 const shape=aiscShapeByName(p.section.catalogueId??'');
 const k=shape?shape.kdes*25.4:tf; // zero fillet credit for supplied/custom sections
 const h=d-2*k,flangeRatio=bf/(2*tf),webRatio=h/tw,flangeLimit=.38*root,webLimit=3.76*root;
 const compact=p.section.kind!=='cap'&&flangeRatio<=flangeLimit&&webRatio<=webLimit;
 const ry=Math.sqrt(s.Iy/s.A),rts=Math.sqrt(Math.sqrt(s.Iy*(s.Cw||tf*bf**3*(d-tf)**2/24))/s.Sx),Lp=1.76*ry*root;
 // The computed welded thin-plate J is an approximation, not a verified
 // torsional property. Omit its favorable contribution in strength checks.
 const strengthJ=p.section.kind==='welded'?0:s.J;
 const j=strengthJ/(s.Sx*s.h0),Lr=1.95*rts*E/(.7*Fy)*Math.sqrt(j+Math.sqrt(j*j+6.76*(.7*Fy/E)**2));
 const Mp=Fy*s.Zx,Lb=p.unbracedLength;
 const branch=Lb<=Lp?'F2-1':Lb<=Lr?'F2-2':'F2-3 / F2-4';
 const Mn=Lb<=Lp?Mp:Lb<=Lr?Mp-(Mp-.7*Fy*s.Sx)*(Lb-Lp)/(Lr-Lp):Math.PI**2*E/(Lb/rts)**2*Math.sqrt(1+.078*j*(Lb/rts)**2)*s.Sx;
 const net=p.aist?.netFlangeArea??0,gross=bf*tf,Yt=Fy/p.section.Fu<=.8?1:1.1;
 const netLimitApplies=net>0&&p.section.Fu*net<Yt*Fy*gross;
 const grossMoment=Math.min(Mp,Mn),netMn=netLimitApplies?p.section.Fu*net/gross*s.Sx:grossMoment;
 const Mpy=Math.min(Fy*s.Zy,1.6*Fy*s.Sy),lr=root;
 const Mny=flangeRatio<=flangeLimit?Mpy:flangeRatio<=lr?Mpy-(Mpy-.7*Fy*s.Sy)*(flangeRatio-flangeLimit)/(lr-flangeLimit):.69*E/flangeRatio**2*s.Sy;
 // DG7 §14.1: lateral bending resistance is that of the flange itself.
 const flangePlastic=Fy*tf*bf**2/4,flangeElastic=tf*bf**2/6;
 const flangeMn=flangeRatio<=flangeLimit?flangePlastic:flangeRatio<=lr?flangePlastic-(flangePlastic-.7*Fy*flangeElastic)*(flangeRatio-flangeLimit)/(lr-flangeLimit):.69*E/flangeRatio**2*flangeElastic;
 // A capped girder's web is the rolled W web, so G2.1(a) applies to it too.
 const rolledStocky=(p.section.kind==='rolled'||p.section.kind==='cap')&&webRatio<=2.24*root,Cv=rolledStocky?1:Math.min(1,1.10*Math.sqrt(5.34*E/Fy)/webRatio);
 const shearPhi=rolledStocky?1:.9,shearOmega=rolledStocky?1.5:1.67;
 const di=p.aist,Lu=di?.axialLength||p.spans.reduce((a,b)=>a+b,0),Ly=Math.max(p.unbracedLength,di?.bottomBraceSpacing||Lu),Lz=di?.torsionalLength||Lu;
 const Fex=Math.PI**2*E*s.Ix/(s.A*Lu**2),Fey=Math.PI**2*E*s.Iy/(s.A*Ly**2),Fez=(Math.PI**2*E*s.Cw/Lz**2+E/(2*1.3)*strengthJ)/(s.Ix+s.Iy),Fe=Math.min(Fex,Fey,Fez);
 const Fcr=Fy/Fe<=2.25?Fy*.658**(Fy/Fe):.877*Fe;
 // E7: reduce only the slender plate widths; retain the rolled fillet area.
 const kc=Math.min(.76,Math.max(.35,4/Math.sqrt(webRatio))),flangeAxialLimit=p.section.kind==='rolled'?.56*root:.64*Math.sqrt(kc*E/Fy),webAxialLimit=1.49*root;
 const effective=(width:number,lambda:number,limit:number,c1:number,c2:number)=>lambda<=limit*Math.sqrt(Fy/Fcr)?width:width*(1-c1*Math.sqrt((c2*limit/lambda)**2*Fy/Fcr))*Math.sqrt((c2*limit/lambda)**2*Fy/Fcr);
 const be=Math.min(bf/2,Math.max(0,effective(bf/2,flangeRatio,flangeAxialLimit,.22,1.49))),he=Math.min(h,Math.max(0,effective(h,webRatio,webAxialLimit,.18,1.31)));
 const Ae=s.A-4*(bf/2-be)*tf-(h-he)*tw;
 const result:GirderStrength={k,h,flangeRatio,webRatio,flangeLimit,webLimit,compact,Lp,Lr,rts,major:available(Math.min(grossMoment,netMn),p.method,.9,1.67),netMoment:available(netMn,p.method,.9,1.67),netLimitApplies,Yt,minor:available(Mny,p.method,.9,1.67),flangeMinor:available(flangeMn,p.method,.9,1.67),shear:available(.6*Fy*d*tw*Cv,p.method,shearPhi,shearOmega),compression:available(Fcr*Ae,p.method,.9,1.67),elasticAxial:Math.min(Fex,Fey)*s.A,axialArea:Ae,flexureBranch:branch,Cv,shearPhi,shearOmega};
 return p.section.kind==='cap'?cappedStrength(p,s,result):result;
}

export function concentratedResistance(p:ProjectInput,s:GirderStrength,bearing:number,end:boolean){
 const {Fy,E,tw,tf,d}=p.section;
 const yielding=Fy*tw*((end?2.5:5)*s.k+bearing);
 const term=end&&bearing/d>.2?4*bearing/d-.2:3*bearing/d;
 const crippling=(end?.4:.8)*tw**2*(1+term*(tw/tf)**1.5)*Math.sqrt(E*Fy*tf/tw);
 return {yielding:available(yielding,p.method,1,1.5),crippling:available(crippling,p.method,.75,2),compressionBuckling:available((end?.5:1)*24*tw**3*Math.sqrt(E*Fy)/s.h,p.method,.9,1.67)};
}
export function interaction(axial:number,mx:number,my:number,s:GirderStrength,method:ProjectInput['method']){
 const ratio=axial/s.compression;
 // C2 permits first-order girder analysis only after stability effects are included.
 // Conservative Cm=1, B1>=1, using Euler load and ASD alpha=1.6.
 const alpha=method==='LRFD'?1:1.6,den=1-alpha*axial/s.elasticAxial;
 if(den<=0)return {utilization:1e12,B1:1e12};
 const B1=Math.max(1,1/den),flex=B1*(Math.abs(mx)/(mx<0&&s.majorReverse?s.majorReverse:s.major)+Math.abs(my)/s.flangeMinor);
 return {utilization:ratio>=.2?ratio+8/9*flex:ratio/2+flex,B1};
}
