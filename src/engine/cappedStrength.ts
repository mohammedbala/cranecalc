import type {ProjectInput,Properties} from './types';
import type {GirderStrength} from './aiscStrength';
import {cappedMechanics} from './cappedMechanics';
import {aiscChannelByName} from '../data/aiscChannels';

export function cappedStrength(p:ProjectInput,s:Properties,base:GirderStrength):GirderStrength{
 const cap=cappedMechanics(p.section);if(!cap)return base;
 const {E,bf,tf,tw,d,capWidth,capTw,capTf,capDepth}=p.section;
 const Fy=Math.min(p.section.Fy,p.capDesign?.Fy??p.section.Fy),root=Math.sqrt(E/Fy),c=aiscChannelByName(p.section.capCatalogueId!)!;
 const resistance=(n:number)=>p.method==='LRFD'?.9*n:n/1.67;
 // Plastic neutral axis and Zx of the component plates (W flanges and web, channel web and legs; fillets omitted).
 const plates=[{b:bf,h:tf,y:tf/2},{b:tw,h:d-2*tf,y:d/2},{b:bf,h:tf,y:d-tf/2},{b:capWidth,h:capTw,y:d+capTw/2},
  ...[0,1].map(()=>({b:capTf,h:capDepth-capTw,y:d-(capDepth-capTw)/2}))];
 const area=plates.reduce((a,r)=>a+r.b*r.h,0),below=(y:number)=>plates.reduce((a,r)=>a+r.b*Math.max(0,Math.min(r.h,y-(r.y-r.h/2))),0);
 let lo=0,hi=d+capTw;for(let i=0;i<80;i++){const m=(lo+hi)/2;if(below(m)<area/2)lo=m;else hi=m;}
 const yp=(lo+hi)/2,Zx=plates.reduce((a,r)=>{const y0=r.y-r.h/2,y1=r.y+r.h/2;return a+r.b*(yp<=y0?r.h*(r.y-yp):yp>=y1?r.h*(yp-r.y):((yp-y0)**2+(y1-yp)**2)/2);},0);
 const Iy=cap.elastic.topI+cap.elastic.bottomI,lambdaR=5.70*root;
 // AISC F4 (compact or noncompact web of a singly symmetric I) or F5 (slender web), selected per bending direction by
 // the Table B4.1b case 16 web classification: lambda = hc/tw, lambda_p = (hc/hp)sqrt(E/Fy)/(0.54Mp/My - 0.09)^2 <= lambda_r,
 // lambda_r = 5.70 sqrt(E/Fy). rt is the compression-flange components (cap + W flange) plus one-third of the
 // compressed web (F4.2 definition); Cb = 1.
 const directions=[
  {I:cap.elastic.topI,A:bf*tf+c.A*25.4**2,hc:2*Math.max(0,d-cap.elastic.cy-base.k),hp:2*Math.max(0,d-yp-base.k),Sc:cap.Stop,St:cap.Sbottom},
  {I:cap.elastic.bottomI,A:bf*tf,hc:2*Math.max(0,cap.elastic.cy-base.k),hp:2*Math.max(0,yp-base.k),Sc:cap.Sbottom,St:cap.Stop}
 ].map(f=>{
  const rt=Math.sqrt(f.I/(f.A+f.hc*tw/6)),Lb=p.unbracedLength,My=Fy*Math.min(f.Sc,f.St),Mp=Fy*Zx;
  const lambda=f.hc/tw,lambdaP=Math.min(lambdaR,f.hp>0?(f.hc/f.hp)*root/(.54*Mp/My-.09)**2:lambdaR);
  const web:'compact'|'noncompact'|'slender'=lambda<=lambdaP?'compact':lambda<=lambdaR?'noncompact':'slender';
  if(web!=='slender'){
   const Myc=Fy*f.Sc,Myt=Fy*f.St,ratio=f.St/f.Sc,J=f.I/Iy<=.23?0:cap.J,h0=cap.elastic.h0;
   const R=(Myx:number)=>{const m=Math.min(Fy*Zx,1.6*Myx)/Myx;return f.I/Iy<=.23?1:web==='compact'?m:Math.min(m,m-(m-1)*(lambda-lambdaP)/(lambdaR-lambdaP));};
   const Rpc=R(Myc),Rpt=R(Myt),FL=ratio>=.7?.7*Fy:Math.max(.5*Fy,Fy*ratio),cfy=Rpc*Myc,j=J/(f.Sc*h0);
   const Lp=1.1*rt*root,Lr=1.95*rt*E/FL*Math.sqrt(j+Math.sqrt(j*j+6.76*(FL/E)**2));
   // F4-2 (inelastic) or F4-3 (elastic) with Cb = 1; F4-1 caps it at Rpc Myc.
   const ltbNominal=Lb<=Lp?undefined:Lb<=Lr?cfy-(cfy-FL*f.Sc)*(Lb-Lp)/(Lr-Lp):Math.PI**2*E/(Lb/rt)**2*Math.sqrt(1+.078*j*(Lb/rt)**2)*f.Sc;
   const ltb=Math.min(cfy,ltbNominal??Infinity);
   const tfy=f.St>=f.Sc?Infinity:Rpt*Myt;
   return {clause:'F4' as const,web,lambda,lambdaP,lambdaR,hc:f.hc,hp:f.hp,Mp,My,j,rt,Lp,Lr,Rpg:Rpc,Rpt,Sc:f.Sc,Mn:Math.min(cfy,ltb,tfy),ltb:ltbNominal};
  }
  const Lp=1.1*rt*root,Lr=Math.PI*rt*Math.sqrt(E/(.7*Fy));
  const aw=Math.min(10,f.hc*tw/f.A),Rpg=Math.min(1,1-aw/(1200+300*aw)*(f.hc/tw-5.7*root));
  const Fcr=Lb<=Lp?Fy:Lb<=Lr?Fy*(1-.3*(Lb-Lp)/(Lr-Lp)):Math.PI**2*E/(Lb/rt)**2;
  return {clause:'F5' as const,web,lambda,lambdaP,lambdaR,hc:f.hc,hp:f.hp,Mp,My,j:0,rt,Lp,Lr,Rpg,Rpt:1,Sc:f.Sc,Mn:Math.min(Rpg*Math.min(Fy,Fcr)*f.Sc,Fy*f.St),ltb:Lb<=Lp?undefined:Rpg*Fcr*f.Sc};
 });
 // Positive (sagging) moment puts the cap and W top flange in compression; negative moment the
 // W bottom flange. Simple spans see only positive moment; continuous runways envelope both signs,
 // and the interaction uses the capacity for the sign of the moment at each station.
 const [positive,negative]=directions,governing=p.system==='continuous'?directions.reduce((a,b)=>a.Mn<b.Mn?a:b):positive;
 const flangeRatio=Math.max(bf/(2*tf),(capDepth-capTw)/capTf,(capWidth-bf)/(2*capTw));
 // Web compactness for the bending direction(s) that occur: positive moment only on simple spans; on continuous
 // runways the less favorable of both directions (largest lambda / lambda_p), as for the flexural strength.
 const occurring=p.system==='continuous'?directions:[positive],webCase=occurring.reduce((a,b)=>b.lambda/b.lambdaP>a.lambda/a.lambdaP?b:a);
 // F4 covers compact and noncompact webs (Rpc / Rpt reduce toward My for a noncompact web), so the flexural
 // checks need compact flanges and a web that is not slender; the limit shown is lambda_p for a compact web,
 // lambda_r for a noncompact one.
 const webRatio=webCase.lambda,webLimit=webCase.web==='compact'?webCase.lambdaP:webCase.lambdaR;
 const compact=flangeRatio<=.38*root&&webCase.web!=='slender';
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
 return {...base,compact,flangeRatio,flangeLimit:.38*root,webRatio,webLimit,webCase,
  major:resistance(Math.min(positive.Mn,netCap)),majorReverse:resistance(Math.min(negative.Mn,netCap)),ltb:positive.ltb,ltbReverse:negative.ltb,netMoment:resistance(netMn),netLimitApplies,Yt,
  Lp:governing.Lp,Lr:governing.Lr,rts:governing.rt,flangeMinor:Math.min(topMinor,bottomMinor),topMinor,bottomMinor,
  minor:resistance(Fy*s.Sy),compression:resistance(Fcr*s.A*areaFactor),axialArea:s.A*areaFactor,elasticAxial:Fe*s.A,
  flexureBranch:`${p.system==='continuous'?`positive moment ${positive.clause} (web ${positive.web}), negative moment ${negative.clause} (web ${negative.web}), by the sign of the moment at each station`:`${positive.clause} (web ${positive.web}, Table B4.1b case 16): positive moment, cap and W top flange in compression (simple spans)`}; ${occurring.some(v=>v.clause==='F4')?'F4.1 compression flange yielding (Rpc), F4.2 LTB, F4.4 tension flange yielding (Rpt)':''}${occurring.some(v=>v.clause==='F5')?'F5 with Rpg (slender web)':''}; Cb=1; E4-3/E7 axial`,
  capDirections:directions};
}
