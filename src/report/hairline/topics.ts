import type {ProjectInput} from '../../engine/types';
import {Scene,type RenderOptions,type Role,type Vec3} from './scene';
import {beam,bracket,column,girders,keepers,railRun,steelTop,stiffeners,supportGeometry,ties,wheel,type SupportGeometry} from './parts';
import {cappedMechanics} from '../../engine/cappedMechanics';
import {activeColumnCap} from '../../engine/columnCapInputs';
import {defaultEndStop,stopBoltRows,stopLip,stopRailEnd} from '../../engine/endStopInputs';
import {defaultColumnBase} from '../../engine/columnBaseInputs';
import {defaultLongitudinalBracing} from '../../engine/longitudinalBracingInputs';
import {capAngleFigure} from './capAngleParts';

/**
 * The report's per-topic figures as Hairline isometric line drawings, to the project's sizes. Each returns the
 * linework for the 240 × 120 figure box and the number of load-path markers it placed, which the caller matches
 * against its caption; a topic without an isometric drawing (abstract topics, rare tie options) returns undefined.
 */
export interface IsoBody{body:string;markers:number}
type Mark=[Vec3,number,number];
const inch=25.4;
function finish(S:Scene,marks:Mark[],o:RenderOptions={}):IsoBody{
 marks.forEach(([at,dx,dy],i)=>S.marker(i+1,at,dx,dy));
 return {body:S.body({width:240,height:120,margin:[34,26],...o}),markers:marks.length};
}
const firstCrane=(p:ProjectInput)=>p.cranes[0];
/** Wheel positions of the first crane from its first wheel, at most two (one end truck on one rail). */
const wheelOffsets=(p:ProjectInput)=>{const w=firstCrane(p)?.wheels??[];const o=w.map(v=>v.offset-w[0].offset);return o.length>1?o.slice(0,2):[0,3000];};

/** Girder only: on y = 0 with its bottom at z = 0; the rail on it. */
const local=(g:SupportGeometry)=>({rz:g.rail.z-g.girder.z0,zh:g.rail.z-g.girder.z0+g.rail.height});

function section(p:ProjectInput,g:SupportGeometry){
 const S=new Scene(),G=g.girder,d=G.d,L=1.25*d,{rz}=local(g);
 beam(S,g,-L,0,0,'focus',0);const zh=railRun(S,g,-L,0,0,'context',rz);
 const x=-L*.55,zr=zh-g.rail.headThickness/2,zs=cappedMechanics(p.section)?.shearCenter??d/2;
 S.arrow([x,0,zh+.75*d],[x,0,zh+15],'P').arrow([x,1.3*Math.max(G.bf,G.cap?.width??0),zr],[x,g.rail.headWidth/2+15,zr],'H');
 S.path([[0,0,zh],[0,0,zs]]).centerline([-L,0,zs],[.12*d,0,zs]).label('SC',[0,0,zs],5,-4,'start',true);
 return finish(S,[[[x,0,zh],-26,-4],[[0,0,zs],30,10],[[0,G.bf/2,G.tf/2],28,-6]],{az:56});
}

function spanScene(p:ProjectInput,g:SupportGeometry,L:number,girderRole:Role){
 // One span on its two seats, girder on y = 0, bottoms of the bearings at z = 0.
 const S=new Scene(),G=g.girder,bl=g.bearing.length;
 beam(S,g,0,L,0,girderRole);railRun(S,g,0,L,0,'context');
 for(const x of [0,L]){
  const a=x===0?0:L-bl;S.box(a,-g.bearing.width/2,0,a+bl,g.bearing.width/2,G.z0,'context');
  S.box(x===0?-bl*.6:L-bl*1.4,-g.bearing.width*.7,-g.seat.thickness,x===0?bl*1.4:L+bl*.6,g.bearing.width*.7,0,'context');
 }
 return S;
}
function strength(p:ProjectInput,g:SupportGeometry){
 const L=Math.max(...p.spans),S=spanScene(p,g,L,'focus'),G=g.girder,zh=g.rail.z+g.rail.height,[,s]=wheelOffsets(p);
 const xs=[L/2-Math.min(s,L*.6)/2,L/2+Math.min(s,L*.6)/2];
 for(const x of xs){wheel(S,g,x,Math.min(160,G.d*.28),0);S.arrow([x,0,zh+G.d*1.3],[x,0,zh+Math.min(160,G.d*.28)*2+12]);}
 S.label('P',[xs[0],0,zh+G.d*1.3],-4,2,'end',true);
 // Bending moment of the two loads, drawn in the plane of the web below the girder.
 const z0=-g.seat.thickness-G.d*.25,h=G.d*.9,M=(x:number)=>xs.reduce((m,a)=>m+(x<=a?x*(L-a):a*(L-x))/L,0),mx=Math.max(...xs.map(M));
 const pts:Vec3[]=Array.from({length:41},(_,i)=>{const x=L*i/40;return [x,0,z0-h*M(x)/mx];});
 S.line([[0,0,z0],...pts,[L,0,z0]]).line([[0,0,z0],[L,0,z0]]).label('M',[L/2,0,z0-h],0,10,'middle',true);
 return finish(S,[[[xs[0],0,zh+40],-30,-6],[[L/2,0,z0-h],22,12],[[0,0,-g.seat.thickness/2],-18,14]],{az:14});
}
function serviceability(p:ProjectInput,g:SupportGeometry){
 const L=Math.max(...p.spans),S=spanScene(p,g,L,'context'),G=g.girder,zh=g.rail.z+g.rail.height,[,s]=wheelOffsets(p);
 const xs=[L/2-Math.min(s,L*.6)/2,L/2+Math.min(s,L*.6)/2],R=Math.min(160,G.d*.28);
 for(const x of xs){wheel(S,g,x,R,0);S.arrow([x,0,zh+G.d*1.3],[x,0,zh+2*R+12]);}
 S.label('P',[xs[0],0,zh+G.d*1.3],-4,2,'end',true);
 // Exaggerated deflected bottom flange and rail head.
 const sag=(x:number,a:number)=>a*Math.sin(Math.PI*x/L),n=40;
 S.line(Array.from({length:n+1},(_,i)=>{const x=L*i/n;return [x,0,G.z0-sag(x,G.d*.55)] as Vec3;}));
 S.line(Array.from({length:n+1},(_,i)=>{const x=L*i/n;return [x,sag(x,G.bf*1.4),zh] as Vec3;}));
 S.label('δv',[L/2,0,G.z0-G.d*.55],0,11,'middle',true).label('δh',[L/2,G.bf*1.4,zh],4,10,'start',true);
 return finish(S,[[[xs[0],0,zh+30],-30,-6],[[L*.62,0,G.z0-sag(L*.62,G.d*.55)],18,14]],{az:14});
}
function geometry(p:ProjectInput,g:SupportGeometry){
 const S=new Scene(),n=Math.min(p.spans.length,3),G=g.girder,gap=g.simple?Math.max(g.gap,30):0,zh=g.rail.z+g.rail.height;
 const xs=[0];for(const L of p.spans.slice(0,n))xs.push(xs.at(-1)!+L);
 const Lmax=Math.max(...p.spans),zBottom=g.column.bottom-Lmax*.2,zTop=zh+Lmax*.04;
 for(const x of xs){S.at(x);column(S,g,'context',zBottom,zTop);bracket(S,p,g,'context');S.at();}
 if(g.simple)for(let i=0;i<n;i++)beam(S,g,xs[i]+gap/2,xs[i+1]-gap/2,g.reach,'focus');else beam(S,g,0,xs[n],g.reach,'focus');
 for(let i=0;i<n;i++)railRun(S,g,xs[i]+(g.simple?gap/2:0),xs[i+1]-(g.simple?gap/2:0),g.reach,'context');
 const [,s]=wheelOffsets(p),w=[xs[1]*.3,xs[1]*.3+Math.min(s,xs[1]*.5)],R=Math.min(220,G.d*.3);
 for(const x of w){wheel(S,g,x,R);S.arrow([x,g.reach,zh+2*R+G.d*1.6],[x,g.reach,zh+2*R+10]);}
 S.label('P',[w[0],g.reach,zh+2*R+G.d*1.6],-4,4,'end',true);
 for(let i=0;i<n;i++){const a=xs[i]+Lmax*.04,b=xs[i+1]-Lmax*.04;S.dim([a,g.reach,zBottom*.55],[b,g.reach,zBottom*.55],`L${i+1}`,0,-3);}
 S.label(p.system==='continuous'?'CONTINUOUS GIRDER':'INDEPENDENT SPANS',[xs[n],g.reach,zTop],0,-10,'end');
 if(p.spans.length>n)S.label(`+ ${p.spans.length-n} MORE`,[xs[n],g.reach,0],10,0,'start');
 return finish(S,[[[w[0],g.reach,zh+R],-22,-8],[[xs[1]*.72,g.reach+G.bf/2,G.z0+G.d/2],6,22],[[xs[1],g.seat.projection,-g.seat.thickness],18,20]],{az:7});
}
function loading(p:ProjectInput,g:SupportGeometry){
 const S=new Scene(),G=g.girder,[,s0]=wheelOffsets(p),s=Math.min(s0,4*G.d),L=s+2.4*G.d,{rz}=local(g);
 beam(S,g,0,L,0,'context',0);const zh=railRun(S,g,0,L,0,'context',rz),R=Math.min(200,G.d*.32),xs=[1.2*G.d,1.2*G.d+s];
 for(const x of xs){wheel(S,g,x,R,0,zh,'focus');S.arrow([x,0,zh+2*R+G.d],[x,0,zh+2*R+10]);}
 // The end truck over the wheels, as a ghost.
 S.box(xs[0]-R*1.6,-G.bf*.6,zh+R*1.2,xs[1]+R*1.6,G.bf*.6,zh+R*2.6,'ghost');
 const zr=zh-g.rail.headThickness/2,yH=1.5*G.bf;
 S.arrow([xs[0],yH,zr],[xs[0],g.rail.headWidth/2+12,zr],'H').arrow([xs[0],-yH,zr],[xs[0],-g.rail.headWidth/2-12,zr],undefined,true);
 S.arrow([xs[1]+G.d*1.3,0,zh+R],[xs[1]+R+15,0,zh+R],'F');
 S.label('P',[xs[0],0,zh+2*R+G.d],-4,2,'end',true).dim([xs[0],0,-G.d*.35],[xs[1],0,-G.d*.35],'wheel spacing',0,11);
 return finish(S,[[[xs[0],0,zh+2*R+G.d*.5],-26,-4],[[xs[0],yH*.7,zr],-14,16],[[xs[1]+G.d,0,zh+R],8,-16]],{az:22});
}
function capChannel(p:ProjectInput,g:SupportGeometry){
 const S=new Scene(),G=g.girder,d=G.d,L=1.4*d,{rz}=local(g),capped=!!G.cap;
 beam(S,g,-L,0,0,'context',0,'focus');const zh=railRun(S,g,-L,0,0,'context',rz);
 if(G.cap){
  // Fillets in the corner of each W flange tip and the cap web.
  const w=Math.max(8,G.tf*.45),zf=d;
  for(const side of [-1,1])S.prism(0,[[side*G.bf/2,zf],[side*(G.bf/2+w),zf],[side*G.bf/2,zf-w]],-L,0,'focus');
 }else S.label('NO CAP CHANNEL',[-L/2,0,steelTop(g,0)],0,-14,'middle');
 const x=-L*.5;S.arrow([x,0,zh+.7*d],[x,0,zh+15],'P');
 S.path([[x,0,zh],[x,0,d],[x,G.bf/2,d]]);
 return finish(S,[[[x,0,zh],-26,-2],[[-L*.8,G.bf/2,d],-22,18],[[0,(capped?G.cap!.width:G.bf)/2,d-(capped?G.cap!.depth*.5:G.tf)],26,-4]],{az:56});
}
function localForces(p:ProjectInput,g:SupportGeometry){
 const S=new Scene(),G=g.girder,L=2*G.d,h={...g,reach:0,gap:0,simple:true};
 girders(S,h,'context','focus','focus',L);railRun(S,h,-L,0,0,'context');
 S.box(-g.seat.length/2,-g.bearing.width*.75,-g.seat.thickness,g.bearing.length*.4,g.bearing.width*.75,0,'context');
 const xw=-1.3*G.d,zh=g.rail.z+g.rail.height,R=Math.min(170,G.d*.3),zt=G.z0+G.d;wheel(S,h,xw,R,0);
 S.arrow([xw,0,zh+2*R+G.d*.7],[xw,0,zh+2*R+10],'P');
 // The bearing length over which the wheel spreads into the web (2.5:1 through the flange to the k-line).
 const k=G.tf+(zh-zt)+G.d*.12;S.line([[xw-2.5*k,0,zt-G.d*.12],[xw,0,zh],[xw+2.5*k,0,zt-G.d*.12]]);
 const xb=-g.bearing.length/2;S.arrow([xb,0,-g.seat.thickness-G.d*.7],[xb,0,-g.seat.thickness-8],'R');
 return finish(S,[[[xw,0,zh],-22,-8],[[xw,G.tw/2,zt-G.d*.3],-10,26],[[xb,G.bf/2-10,G.z0+G.d*.55],30,4],[[xb,g.bearing.width/2,G.z0/2],30,14]],{az:50});
}
function bracing(p:ProjectInput,g:SupportGeometry){
 const S=new Scene(),L=Math.max(...p.spans),G=g.girder,y=g.reach,zt=G.z0+G.d,colZ0=-g.seat.thickness-G.d*.4;
 beam(S,g,0,L,y,'context');
 for(const x of [0,L]){S.at(x);column(S,g,'context',colZ0,zt+G.d*.25);S.at();const xt=x+(x?-1:1)*G.d*.3;S.box(xt-G.d*.12,0,zt-G.tf-G.d*.12,xt+G.d*.12,y-G.bf/2,zt-G.tf-10,'focus');}
 // The compression flange buckles laterally between the ties.
 const n=40;S.line(Array.from({length:n+1},(_,i)=>{const x=L*i/n;return [x,y+G.bf*1.6*Math.sin(Math.PI*x/L),zt] as Vec3;}));
 S.arrow([L*.55,y+G.bf*6,zt],[L*.55,y+G.bf*1.6+20,zt],'H').dim([G.d*.3,y,zt+G.d*.7],[L-G.d*.3,y,zt+G.d*.7],'Lb',0,-4).label('TIES',[0,y/2,zt],-10,4,'end');
 return finish(S,[[[L*.55,y+G.bf*4,zt],22,6],[[G.d*.3,y*.5,zt-G.tf-G.d*.06],-8,22],[[L*.3,y+G.bf*1.6*Math.sin(.3*Math.PI),zt],-6,24]],{az:20});
}
function bracketFigure(p:ProjectInput,g:SupportGeometry){
 const S=new Scene(),b=p.details?.bracket,G=g.girder,enabled=!!b?.enabled&&g.support!=='column-cap',ts=g.seat.thickness;
 const ribBottom=-(b?.enabled?(g.support==='rolled-corbel'?ts+(G.d*.5):g.support==='tapered-haunch'?-(g.column.bottom+8*inch):ts+(b.ribDepth??0)):ts);
 column(S,g,'context',Math.min(ribBottom,-ts)-G.d*.35,steelTop(g)+G.d*.15);stiffeners(S,p,g,'focus');
 bracket(S,p,g,enabled?'focus':'context');
 const h={...g,simple:true,gap:Math.max(g.gap,0)};girders(S,h,'context','context','focus',G.d*.9);
 const xb=-h.gap/2-g.bearing.length/2,y=g.reach,top=steelTop(g);
 S.arrow([xb,y,top+G.d*.9],[xb,y,top+12],'R');
 const L=g.seat.projection,xe=g.seat.length/2+60;
 if(!enabled){S.label('SEAT BY OTHERS',[g.seat.length/2,L,-ts],8,12,'start');return finish(S,[[[xb,y,top],-24,-6],[[xb,y+g.bearing.width/2,G.z0/2],-30,14],[[-g.seat.length/2,L*.6,-ts],-26,-2]],{az:50});}
 S.dim([xe,0,0],[xe,y,0],'e',6,0);
 // Tapered I haunch: 1 reaction, 2 top flange and stiffeners, 3 web and flanges, 4 welds at the column face, 5 column.
 if(g.support==='tapered-haunch'){
  const zw=(ribBottom-ts)/2;
  return finish(S,[[[xb,y,top],-24,-6],[[g.seat.length*.3,y,-ts/2],30,-6],[[0,L*.5,zw*.8],32,12],[[0,0,ribBottom*.7],-34,10],[[g.column.bf/2,-g.column.tf,steelTop(g)],26,-8]],{az:50});
 }
 const existing=g.support==='existing',corbel=g.support==='rolled-corbel',rib=b!.ribSpacing/2;
 if(existing)S.label('EXISTING',[0,L*.5,ribBottom],0,14,'middle',true);
 const zMid=(ribBottom-ts)/2,xr=corbel||existing?0:rib;
 return finish(S,[[[xb,y,top],-24,-6],[[g.seat.length*.3,L*.75,-ts/2],30,-6],[[xr+(b!.ribThickness??0)/2,L*.45,zMid],32,12],[[xr,0,zMid-(-ribBottom)*.25],-34,10],[[g.column.bf/2,-g.column.tf,steelTop(g)],26,-8]],{az:50});
}
function tieFigure(p:ProjectInput,g:SupportGeometry,attachment:boolean,topOnly:boolean){
 const S=new Scene(),G=g.girder,y=g.reach,t=p.details!.brace,kind=t.arrangement??'paired-bars';
 column(S,g,'context',-g.seat.thickness-G.d*.2,steelTop(g)+G.d*.2);
 const h={...g,simple:true};girders(S,h,'context','context','context',G.d*1.2);
 S.box(-g.seat.length/2,0,-g.seat.thickness,g.seat.length/2,g.seat.projection,0,'context');
 ties(S,p,h,'focus');
 if(!topOnly)S.at(0,0,-(G.d-G.tf-t.width-24));ties(S,p,h,'focus');S.at();
 const zh=g.rail.z+g.rail.height,xr=-g.gap/2-G.d*.9;railRun(S,g,xr,-g.gap/2,y,'context');
 S.arrow([xr+G.d*.3,y+G.bf*2.2,zh-g.rail.headThickness/2],[xr+G.d*.3,y+g.rail.headWidth/2+12,zh-g.rail.headThickness/2],'H');
 const set=t.flangeAttachment?.longitudinalSetback??3*inch,xt=-g.gap/2-set-t.gussetThickness/2,zt=G.z0+G.d-G.tf-t.width/2-6;
 S.label(attachment?'FLANGE / SADDLE':kind==='flexible-plate'?'FLEXIBLE PLATE':topOnly?'TOP TIE BARS':'TOP + BOTTOM TIES',[g.seat.length/2,g.seat.projection,-g.seat.thickness],6,14,'start',true);
 if(attachment)return finish(S,[[[xt,y-G.bf/2+2*inch,zt],28,-16],[[xt,y-G.tw/2,zt-t.width/2],30,10],[[xt,y-G.bf/2,G.z0+G.d-G.tf],-30,8]],{az:56});
 return finish(S,[[[xr+G.d*.3,y+G.bf*1.4,zh-g.rail.headThickness/2],-6,-18],[[xt,y*.5,zt],18,-20],[[xt,0,zt-t.width/2],-26,18]],{az:56});
}
function railDetails(p:ProjectInput,g:SupportGeometry){
 const S=new Scene(),G=g.girder,L=1.3*G.d,{rz}=local(g),top=steelTop(g,0),r=g.rail;
 // The top of the girder only: flange, cap and a web stub.
 const zf=G.d-G.tf;S.box(0,-G.bf/2,zf,L,G.bf/2,G.d,'context').box(0,-G.tw/2,zf-G.d*.3,L,G.tw/2,zf,'context');
 if(G.cap){const c=G.cap,zt=G.d+c.tw;S.box(0,-c.width/2,G.d,L,c.width/2,zt,'context').box(0,-c.width/2,zt-c.depth,L,-c.width/2+c.tf,G.d,'context').box(0,c.width/2-c.tf,zt-c.depth,L,c.width/2,G.d,'context');}
 if(rz>top+.5)S.box(0,-(p.details?.rail.padWidth??r.baseWidth)/2,top,L,(p.details?.rail.padWidth??r.baseWidth)/2,rz,'focus');
 const zh=railRun(S,g,0,L,0,'context',rz),xk=[L*.25,L*.8];for(const x of xk)keepers(S,g,x,0,'focus',rz);
 const R=Math.min(170,G.d*.3),xw=L*.5;wheel(S,g,xw,R,0,zh,'ghost');S.arrow([xw,0,zh+2*R+G.d*.6],[xw,0,zh+2*R+10],'P');
 const zr=zh-r.headThickness/2;S.arrow([xw+R*1.8,r.baseWidth*2.2,zr],[xw+R*1.8,r.headWidth/2+12,zr],'H').label('KEEPER',[xk[1],r.baseWidth/2+30,rz],14,12,'start');
 return finish(S,[[[xw,0,zh+R],-28,-6],[[L*.3,r.baseWidth/2,rz],-26,20],[[xw+R*1.8,r.baseWidth*1.6,zr],22,-12],[[xk[0],-r.baseWidth/2-16,rz+r.baseThickness],-24,-8]],{az:36});
}
function endBearings(p:ProjectInput,g:SupportGeometry){
 const S=new Scene(),G=g.girder,e=p.details?.endBearing,y=0,gap=g.simple?Math.max(g.gap,25):0,L=G.d*.75,bl=g.bearing.length,bw=g.bearing.width;
 const h={...g,reach:0,gap,simple:g.simple};girders(S,h,'context','context','focus',L,g.simple?L:0,'context');
 S.box(-g.seat.length/2,-bw*.75,-g.seat.thickness,g.seat.length/2,bw*.75,0,'context');
 const gauge=e?.bolts.gauge??5.5*inch,db=e?.bolts.diameter??.75*inch,edge=e?.bolts.edge??2*inch;
 const xs=g.simple?[-gap/2-bl+edge,gap/2+bl-edge]:[-bl/2+edge];
 for(const x of xs)for(const s of [-1,1])S.cylinder(2,[x,y+s*gauge/2],db/2,-g.seat.thickness-db*1.2,G.z0+G.tf+db*.9,'focus');
 if(g.simple){S.label('LOCATING',[-gap/2-bl/2,bw*.75,-g.seat.thickness],-6,14,'end');S.label('SLIDING (SLOT)',[gap/2+bl,bw*.75,-g.seat.thickness],10,8,'start');}
 else S.label('LOCATING',[0,bw/2,0],-4,18,'end');
 const top=steelTop(g),xa=g.simple?-gap/2-bl/2:0;
 S.arrow([xa,0,top+G.d*.6],[xa,0,top+10],'R').arrow([xa-L*1.25,0,G.z0+G.d*.3],[-gap/2-L-12,0,G.z0+G.d*.3],'F');
 return finish(S,[[[xa,0,top],-22,-6],[[xs[0],gauge/2,G.z0+G.tf],-30,4],[[xs[xs.length-1],-gauge/2,G.z0+G.tf],30,-10]],{az:40});
}
function endStops(p:ProjectInput,g:SupportGeometry){
 const S=new Scene(),G=g.girder,e=p.details?.endStop??defaultEndStop,{rz,zh}=local(g),top=steelTop(g,0),L=Math.max(1.6*G.d,e.setback+e.base.length+3*G.d*.5);
 beam(S,g,-L,0,0,'context',0);
 const xb0=-(e.setback+e.base.length),xb1=-e.setback,tb=e.base.thickness,zb=top+tb,lip=stopLip(e);
 S.box(xb0,-e.base.width/2,top,xb1,e.base.width/2,zb,'focus');
 const xf0=xb0+lip,xf1=xf0+e.face.thickness;S.box(xf0,-e.base.width/2+lip,zb,xf1,e.base.width/2-lip,zb+e.face.height,'focus');
 for(const s of [-1,1])S.prism(1,[[xf1,zb],[xf1+e.stiffener.length,zb],[xf1,zb+e.face.height*.9]],s*e.stiffener.spacing/2-e.stiffener.thickness/2,s*e.stiffener.spacing/2+e.stiffener.thickness/2,'focus');
 for(const r of stopBoltRows(e))for(const s of [-1,1])S.cylinder(2,[-r,s*e.bolts.gauge/2],e.bolts.diameter/2,top-G.tf-e.bolts.diameter,zb+e.bolts.diameter*.8,'context');
 const xr=-stopRailEnd(e);railRun(S,g,-L,xr,0,'context',rz);
 const zB=zh+e.bumperHeight,xB=xf0-12;S.cylinder(0,[0,zB],e.bumperDiameter/2,xB-e.bumperDiameter*1.3,xB,'context');
 S.arrow([xB-e.bumperDiameter*1.3-G.d*.9,0,zB],[xB-e.bumperDiameter*1.3-10,0,zB],'F');
 const xh=xB-e.bumperDiameter*1.3-40;S.dim([xh,0,zh],[xh,0,zB],'h',-8,4);
 return finish(S,[[[xB-e.bumperDiameter*.6,0,zB+e.bumperDiameter/2],-14,-16],[[xf1+e.stiffener.length*.3,e.stiffener.spacing/2,zb+e.face.height*.3],28,-12],[[-stopBoltRows(e)[0],e.bolts.gauge/2,zb],28,14],[[-L*.6,G.bf/2,G.d*.5],-8,24]],{az:46});
}
function tieMovement(p:ProjectInput,g:SupportGeometry){
 const S=new Scene(),G=g.girder,y=g.reach,t=p.details!.brace;
 column(S,g,'context',-g.seat.thickness-G.d*.2,steelTop(g)+G.d*.2);
 const h={...g,simple:true};girders(S,h,'context','context','context',G.d*1.2);
 S.box(-g.seat.length/2,0,-g.seat.thickness,g.seat.length/2,g.seat.projection,0,'context');ties(S,p,h,'focus');
 const set=t.flangeAttachment?.longitudinalSetback??3*inch,xt=-g.gap/2-set-t.gussetThickness/2,zt=G.z0+G.d-G.tf-t.width/2-6,xe=-g.gap/2,top=steelTop(g);
 // End rotation θ moves the top flange along the runway by θ·d; the bottom flange is held at the bearing.
 S.line([[xe,y+G.bf/2,G.z0],[xe+G.d*.22,y+G.bf/2,top]]).arrow([xe-G.d*.15,y+G.bf/2,top+G.d*.3],[xe+G.d*.3,y+G.bf/2,top+G.d*.3]).label('θ·d',[xe+G.d*.3,y+G.bf/2,top+G.d*.3],4,-2,'start',true);
 S.label('SLOTS',[xt,0,zt-t.width/2],-34,36,'end');
 return finish(S,[[[xe-G.d*.15,y+G.bf/2,top+G.d*.3],-22,4],[[xt,y*.5,zt],26,-16],[[xt,0,zt-t.width/2],-26,18]],{az:56});
}
function columnCap(p:ProjectInput,g:SupportGeometry){
 const S=new Scene(),c=activeColumnCap(p)!,G=g.girder,col=g.column,top=steelTop(g),pl=c.plate;
 S.at(0,col.d/2);column(S,g,'focus',-pl.thickness-G.d*1.3,-pl.thickness);S.at();
 S.box(-pl.length/2,-pl.width/2,-pl.thickness,pl.length/2,pl.width/2,0,'focus');
 for(const s of [-1,1])S.box(-c.stiffener.thickness/2+s*(col.bf/2-c.stiffener.thickness/2)*0,s>0?col.tw/2:-col.d/2+col.tf,-pl.thickness-c.stiffener.height,c.stiffener.thickness/2,s>0?col.d/2-col.tf:-col.tw/2,-pl.thickness,'focus');
 const h={...g,reach:0};girders(S,h,'context','context','context',G.d*.9,g.simple?G.d*.9:G.d*.9,'context');
 S.arrow([-g.gap/2-g.bearing.length/2,0,top+G.d*.7],[-g.gap/2-g.bearing.length/2,0,top+10],'R').arrow([-g.gap/2-G.d*.5,G.bf*2.4,top-G.tf],[-g.gap/2-G.d*.5,G.bf/2+12,top-G.tf],'H');
 S.label('CAP PL',[pl.length/2,-pl.width/2,-pl.thickness],8,-2,'start');
 return finish(S,[[[-g.gap/2-g.bearing.length/2,0,top],-24,-6],[[-g.gap/2-g.bearing.length/2,G.bf/2,G.z0+G.d*.5],-34,18],[[pl.length/2,pl.width/2,-pl.thickness/2],26,8],[[col.bf/2,col.d/2-col.tf,-pl.thickness-c.stiffener.height*.7],-34,14]],{az:40});
}
function newColumn(p:ProjectInput,g:SupportGeometry){
 const S=new Scene(),G=g.girder,top=steelTop(g),zc=-g.seat.thickness-G.d*1.2,base=p.columnBase?.enabled?p.columnBase:defaultColumnBase,brk=G.d*.5,zb=zc-brk-G.d*.9;
 column(S,g,'focus',zc,top+G.d*.2);bracket(S,p,g,'context');
 const h={...g,simple:true};girders(S,h,'context','context','context',G.d*.7);
 // Column broken between the bracket and the base.
 column(S,g,'focus',zb,zc-brk);
 const pl=base.plate,ym=-g.column.d/2;S.box(-pl.B/2,ym-pl.N/2,zb-pl.thickness,pl.B/2,ym+pl.N/2,zb,'context');
 S.box(-pl.B*.9,ym-pl.N*.9,zb-pl.thickness-G.d*.35,pl.B*.9,ym+pl.N*.9,zb-pl.thickness-base.grout,'context');
 S.label('FIXED BASE',[pl.B*.9,ym+pl.N*.9,zb-pl.thickness],8,10,'start');
 const xb=-g.gap/2-g.bearing.length/2;
 S.arrow([xb,g.reach,top+G.d*.8],[xb,g.reach,top+10],'V').arrow([xb,g.reach+G.bf*2.5,top-G.tf],[xb,g.reach+G.bf/2+10,top-G.tf],'H');
 return finish(S,[[[xb,g.reach,top],-22,-6],[[g.column.bf/2,0,-g.seat.thickness-G.d*.3],24,-6],[[g.column.bf/2,-g.column.tf,zc-brk*.5-G.d*.2],26,8],[[-pl.B/2,ym+pl.N/2,zb-pl.thickness],-26,10]],{az:50});
}
function columnBase(p:ProjectInput,g:SupportGeometry){
 const S=new Scene(),b=p.columnBase?.enabled?p.columnBase:defaultColumnBase,col=g.column,pl=b.plate,a=b.anchors,f=b.footing;
 const ym=-col.d/2,tp=pl.thickness;
 S.at(0,col.d/2-0);column(S,g,'context',tp,tp+col.d*1.6);S.at();
 S.box(-pl.B/2,-pl.N/2,0,pl.B/2,pl.N/2,tp,'focus').box(-pl.B/2,-pl.N/2,-b.grout,pl.B/2,pl.N/2,0,'context');
 // The footing, cut to a block around the plate (its full plan size is in the checks).
 const fb=Math.min(f.B,pl.B*2.2),fl=Math.min(f.L,pl.N*2.2),ft=Math.min(f.thickness,pl.N*.9);
 S.box(-fb/2,-fl/2,-b.grout-ft,fb/2,fl/2,-b.grout,'context');
 const ys=[-pl.N/2+a.edge,pl.N/2-a.edge],xs=a.perRow===2?[-a.gauge/2,a.gauge/2]:Array.from({length:a.perRow},(_,i)=>-a.gauge/2+i*a.gauge/(a.perRow-1));
 for(const y of ys)for(const x of xs)S.cylinder(2,[x,y],a.diameter/2,-b.grout-Math.min(a.embedment,ft*.8),tp+a.diameter*1.4,'focus');
 S.arrow([0,0,tp+col.d*2.3],[0,0,tp+col.d*1.6+10],'P, M, V');void ym;
 S.label('FOOTING',[fb/2,fl/2,-b.grout-ft],6,10,'start');
 return finish(S,[[[0,0,tp+col.d*1.6],22,-8],[[pl.B/2,-pl.N/4,tp],26,-6],[[xs[0],ys[1],tp],-28,10],[[fb/2,-fl/4,-b.grout-ft*.5],24,6]],{az:38});
}
function supportingStructure(p:ProjectInput,g:SupportGeometry){
 const S=new Scene(),G=g.girder,top=steelTop(g);
 column(S,g,'focus',-g.seat.thickness-G.d*1.6,top+G.d*.3);bracket(S,p,g,'context');
 const h={...g,simple:true};girders(S,h,'context','context','context',G.d*.9);
 const xb=-g.gap/2-g.bearing.length/2;
 S.arrow([xb,g.reach,top+G.d*.8],[xb,g.reach,top+10],'V').arrow([xb,g.reach+G.bf*2.5,top-G.tf],[xb,g.reach+G.bf/2+10,top-G.tf],'H').arrow([-g.gap/2-G.d*1.6,g.reach,G.z0+G.d*.3],[-g.gap/2-G.d*.95,g.reach,G.z0+G.d*.3],'N');
 S.label('CONCURRENT ACTIONS',[0,-g.column.d,-g.seat.thickness-G.d*1.6],0,12,'middle');
 return finish(S,[[[xb,g.reach,top],22,-14],[[xb,g.reach+G.bf*1.6,top-G.tf],16,16],[[g.column.bf/2,-g.column.tf,-g.seat.thickness-G.d*.9],26,6]],{az:50});
}
function longitudinalBracing(p:ProjectInput,g:SupportGeometry){
 const S=new Scene(),b=p.longitudinalBracing?.enabled?p.longitudinalBracing:defaultLongitudinalBracing,W=b.bayWidth,Hc=b.height,c=g.column,n=b.tiers;
 for(const x of [0,W]){S.at(x,c.d/2);column(S,g,'context',0,Hc*1.08);S.at();}
 S.box(0,-c.bf*.15,Hc-c.d*.3,W,c.bf*.15,Hc,'context');
 for(let i=0;i<n;i++){const z0=Hc*i/n,z1=Hc*(i+1)/n;S.rod([c.bf/2,0,z0],[W-c.bf/2,0,z1]).rod([c.bf/2,0,z1],[W-c.bf/2,0,z0]);if(i)S.box(0,-c.bf*.1,z0-c.d*.1,W,c.bf*.1,z0+c.d*.1,'context');}
 S.line([[-W*.12,0,0],[W*1.12,0,0]]);
 S.arrow([-W*.35,0,Hc-c.d*.15],[-c.bf/2-20,0,Hc-c.d*.15],'F').label('BRACED BAY',[W/2,0,0],0,14,'middle');
 return finish(S,[[[-W*.2,0,Hc-c.d*.15],-4,-16],[[W*.62,0,Hc*(n>1?.62/n:.62)],18,-12],[[W,0,0],22,-8]],{az:20});
}
function braceConnections(p:ProjectInput,g:SupportGeometry){
 const S=new Scene(),c=g.column,ym=-c.d/2,Hs=c.d*2.2,t=Math.max(12,c.tw*1.4);
 S.at(0,c.d/2);column(S,g,'context',0,Hs);S.at();
 const x0=c.tw/2,gl=c.d*1.25,z0=Hs*.25,z1=Hs*.75,xp=x0+gl*.92,zp=z0+(z1-z0)*.3;
 S.prism(1,[[x0,z0],[x0+gl*.7,z0],[x0+gl,zp+(z1-z0)*.1],[x0+gl*.6,z1],[x0,z1]],-t/2,t/2,'focus');
 S.box(xp-c.d*.18,-t/2-12,zp-c.d*.1,xp+c.d*.08,-t/2-2,zp+c.d*.1,'context').box(xp-c.d*.18,t/2+2,zp-c.d*.1,xp+c.d*.08,t/2+12,zp+c.d*.1,'context');
 S.cylinder(1,[xp,zp],c.d*.045,-t/2-16,t/2+16,'focus');
 const dir:Vec3=[1,0,-.75],Lr=c.d*1.4,end:Vec3=[xp+dir[0]*Lr,0,zp+dir[2]*Lr];S.rod([xp+c.d*.08,0,zp+dir[2]*c.d*.08],end);
 S.arrow([end[0]-dir[0]*c.d*.1,0,end[2]-dir[2]*c.d*.1+c.d*.25],[end[0]-dir[0]*c.d*.6,0,end[2]-dir[2]*c.d*.6+c.d*.25],'T');
 S.label('GUSSET',[x0+gl*.35,0,z1],0,-6,'middle');void ym;
 return finish(S,[[end,20,-4],[[xp,t/2+16,zp],12,-22],[[x0+gl*.45,t/2,(z0+z1)/2],-8,30],[[x0,t/2,z1*.9],-28,-8]],{az:30});
}
function strut(p:ProjectInput,g:SupportGeometry){
 const S=new Scene(),c=g.column,b=p.longitudinalBracing?.enabled?p.longitudinalBracing:defaultLongitudinalBracing,W=b.bayWidth,Hc=b.height*.8;
 for(const x of [0,W,2*W]){S.at(x,c.d/2);column(S,g,'context',0,Hc*1.1);S.at();}
 S.box(0,-c.bf*.12,Hc-c.d*.2,2*W,c.bf*.12,Hc,'focus');
 S.rod([W+c.bf/2,0,0],[2*W-c.bf/2,0,Hc-c.d*.2]).rod([W+c.bf/2,0,Hc-c.d*.2],[2*W-c.bf/2,0,0]);
 S.arrow([-W*.3,0,Hc-c.d*.1],[-c.bf/2-15,0,Hc-c.d*.1],'F').label('STRUT',[W/2,0,Hc],0,-8,'middle').label('BRACED SPAN',[1.5*W,0,0],0,14,'middle');
 return finish(S,[[[-W*.15,0,Hc-c.d*.1],-2,-16],[[W*.7,0,Hc-c.d*.2],10,18],[[1.5*W,0,Hc*.5],22,-14]],{az:20});
}

function analysis(p:ProjectInput,g:SupportGeometry){
 const L=Math.max(...p.spans),S=spanScene(p,g,L,'focus'),G=g.girder,zh=g.rail.z+g.rail.height,[,s]=wheelOffsets(p),R=Math.min(160,G.d*.28);
 const xs=[L*.35,L*.35+Math.min(s,L*.5)];
 for(const x of xs){wheel(S,g,x,R,0);S.arrow([x,0,zh+G.d*1.3],[x,0,zh+2*R+12]);}
 S.label('ΣP',[xs[0],0,zh+G.d*1.3],-4,2,'end',true);
 for(const x of [g.bearing.length/2,L-g.bearing.length/2])S.arrow([x,0,-g.seat.thickness-G.d*1.1],[x,0,-g.seat.thickness-10]);
 S.label('ΣR = ΣP',[L/2,0,-g.seat.thickness-G.d*1.1],0,4,'middle',true);
 // Analysis stations: the mesh refined with the crane positions until the results converge.
 const n=16;for(let i=1;i<n;i++){const x=L*i/n;S.line([[x,-G.bf*.9,G.z0-G.d*.15],[x,G.bf*.9,G.z0-G.d*.15]]);}
 S.line([[0,0,G.z0-G.d*.15],[L,0,G.z0-G.d*.15]]);
 return finish(S,[[[xs[0],0,zh+R],-28,-6],[[g.bearing.length/2,0,-g.seat.thickness-G.d*.7],-20,4],[[L*.75,G.bf*.9,G.z0-G.d*.15],16,16]],{az:14});
}

/** The isometric figure for a topic, or undefined to keep its schematic. */
export function isoTopicFigure(topic:string,p:ProjectInput,o:{topOnly:boolean}={topOnly:false}):IsoBody|undefined{
 const g=supportGeometry(p),kind=p.details?.brace.arrangement??'paired-bars',barTie=p.details&&(kind==='paired-bars'||kind==='flexible-plate');
 switch(topic){
  case 'Section':return section(p,g);
  case 'Strength':return strength(p,g);
  case 'Serviceability':return serviceability(p,g);
  case 'Geometry':return geometry(p,g);
  case 'Loading':return loading(p,g);
  case 'Cap channel':return capChannel(p,g);
  case 'Local forces':return localForces(p,g);
  case 'Bracing':return bracing(p,g);
  case 'Column bracket':return activeColumnCap(p)?undefined:bracketFigure(p,g);
  case 'Connections':case 'Flange attachment':if(kind==='cap-angle')return g.support!=='column-cap'?capAngleFigure(p,g):undefined;return barTie&&g.support!=='column-cap'?tieFigure(p,g,topic==='Flange attachment',o.topOnly):undefined;
  case 'Cap tieback':case 'Cap tieback movement':return g.support==='column-cap'?undefined:kind==='cap-angle'?capAngleFigure(p,g):barTie?tieFigure(p,g,false,o.topOnly):undefined;
  case 'Rail details':return railDetails(p,g);
  case 'End bearings':return endBearings(p,g);
  case 'End stops':return endStops(p,g);
  case 'Tie movement':return barTie&&g.support!=='column-cap'?tieMovement(p,g):undefined;
  case 'Column cap':return activeColumnCap(p)?columnCap(p,g):undefined;
  case 'New column':return newColumn(p,g);
  case 'New column base':return columnBase(p,g);
  case 'Existing column':case 'Supporting structure':case 'Interfaces':return supportingStructure(p,g);
  case 'Longitudinal bracing':return longitudinalBracing(p,g);
  case 'Brace connections':return braceConnections(p,g);
  case 'Crane-level strut':return strut(p,g);
  case 'Analysis':return analysis(p,g);
 }
 return undefined;
}
