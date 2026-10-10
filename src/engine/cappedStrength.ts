import type {ProjectInput,Properties} from './types';
import type {GirderStrength} from './aiscStrength';
import {cappedMechanics} from './cappedMechanics';
import {aiscChannelByName} from '../data/aiscChannels';

export function cappedStrength(p:ProjectInput,s:Properties,base:GirderStrength):GirderStrength{
 const cap=cappedMechanics(p.section);if(!cap)return base;
 const {E,bf,tf,tw,d,capWidth,capTw,capTf,capDepth}=p.section;
 const Fy=Math.min(p.section.Fy,p.capDesign?.Fy??p.section.Fy),root=Math.sqrt(E/Fy),c=aiscChannelByName(p.section.capCatalogueId!)!;
 const resistance=(n:number)=>p.method==='LRFD'?.9*n:n/1.67;
 const directions=[
  {I:cap.elastic.topI,A:bf*tf+c.A*25.4**2,hc:2*Math.max(0,d-cap.elastic.cy-base.k),Sc:cap.Stop,St:cap.Sbottom},
  {I:cap.elastic.bottomI,A:bf*tf,hc:2*Math.max(0,cap.elastic.cy-base.k),Sc:cap.Sbottom,St:cap.Stop}
 ].map(f=>{
  const rt=Math.sqrt(f.I/(f.A+f.hc*tw/6)),Lp=1.1*rt*root,Lr=Math.PI*rt*Math.sqrt(E/(.7*Fy));
  const aw=Math.min(10,f.hc*tw/f.A),Rpg=Math.min(1,1-aw/(1200+300*aw)*(f.hc/tw-5.7*root));
  const Lb=p.unbracedLength,Fcr=Lb<=Lp?Fy:Lb<=Lr?Fy*(1-.3*(Lb-Lp)/(Lr-Lp)):Math.PI**2*E/(Lb/rt)**2;
  return {rt,Lp,Lr,Rpg,Sc:f.Sc,Mn:Math.min(Rpg*Math.min(Fy,Fcr)*f.Sc,Fy*f.St)};
 });
 // Positive (sagging) moment puts the cap and W top flange in compression; negative moment the
 // W bottom flange. Simple spans see only positive moment; continuous runways envelope both signs,
 // and the interaction uses the capacity for the sign of the moment at each station.
 const [positive,negative]=directions,governing=p.system==='continuous'?directions.reduce((a,b)=>a.Mn<b.Mn?a:b):positive;
 const flangeRatio=Math.max(bf/(2*tf),(capDepth-capTw)/capTf,(capWidth-bf)/(2*capTw));
 const webRatio=Math.max(...directions.map((_,i)=>i===0?2*Math.max(0,d-cap.elastic.cy-base.k)/tw:2*Math.max(0,cap.elastic.cy-base.k)/tw));
 const compact=flangeRatio<=.38*root&&webRatio<=3.76*root;
 const Lu=p.aist?.axialLength||p.spans.reduce((a,b)=>a+b,0),Ly=Math.max(p.unbracedLength,p.aist?.bottomBraceSpacing||Lu),Lz=p.aist?.torsionalLength||Lu;
 const Fex=Math.PI**2*E*s.Ix/(s.A*Lu**2),Fey=Math.PI**2*E*cap.Iy/(s.A*Ly**2);
 const Fez=(Math.PI**2*E*cap.Cw/Lz**2+E/2.6*cap.J)/(s.A*cap.polarRadiusSquared);
 const H=1-cap.centroidOffset**2/cap.polarRadiusSquared,sum=Fey+Fez;
 const Feyz=2*Fey*Fez/(sum+Math.sqrt(Math.max(0,sum*sum-4*H*Fey*Fez))),Fe=Math.min(Fex,Feyz);
 const Fcr=Fy/Fe<=2.25?Fy*.658**(Fy/Fe):.877*Fe;
 // E7 effective-width reduction applied to the ENTIRE gross area using the
 // smallest plate reduction. This is conservative relative to summing Ae strips.
 const rho=(lambda:number,limit:number,c1:number,c2:number)=>{
  if(lambda<=limit*Math.sqrt(Fy/Fcr))return 1;
  const r=c2*limit/lambda*Math.sqrt(Fy/Fcr);return Math.max(0,Math.min(1,(1-c1*r)*r));
 };
 const areaFactor=Math.min(rho(bf/(2*tf),.56*root,.22,1.49),rho((capDepth-capTw)/capTf,.56*root,.22,1.49),rho(capWidth/capTw,1.49*root,.18,1.31),rho(base.h/tw,1.49*root,.18,1.31));
 const net=p.aist?.netFlangeArea??0,gross=bf*tf,Fu=Math.min(p.section.Fu,p.capDesign?.Fu??p.section.Fu),Yt=Fy/Fu<=.8?1:1.1;
 const netLimitApplies=net>0&&Fu*net<Yt*Fy*gross;
 const netMn=netLimitApplies?Fu*net/gross*Math.min(cap.Stop,cap.Sbottom):governing.Mn,netCap=netLimitApplies?netMn:Infinity;
 const topMinor=resistance(Fy*cap.topS),bottomMinor=resistance(Fy*(tf*bf**2/6));
 return {...base,compact,flangeRatio,flangeLimit:.38*root,webRatio,webLimit:3.76*root,
  major:resistance(Math.min(positive.Mn,netCap)),majorReverse:resistance(Math.min(negative.Mn,netCap)),netMoment:resistance(netMn),netLimitApplies,Yt,
  Lp:governing.Lp,Lr:governing.Lr,rts:governing.rt,flangeMinor:Math.min(topMinor,bottomMinor),topMinor,bottomMinor,
  minor:resistance(Fy*s.Sy),compression:resistance(Fcr*s.A*areaFactor),axialArea:s.A*areaFactor,elasticAxial:Fe*s.A,
  flexureBranch:`F5-1 through F5-10 (F4 User Note); ${p.system==='continuous'?'both moment signs, by the sign of the moment at each station':'positive moment, cap and W top flange in compression (simple spans)'}; Cb=1; elastic flange resistance; E4-3/E7 axial`,
  capDirections:directions};
}
