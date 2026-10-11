import type {ProjectInput} from '../../engine/types';
import {Scene,type Role,type Vec2} from './scene';
import {ribGeometry} from '../../engine/bracketRib';
import {rolledStub} from '../../engine/rolledBracketInputs';
import {existingBracketProfile} from '../../engine/bracketProfiles';
import {existingColumnSection} from '../../engine/existingColumn';
import {activeColumnCap} from '../../engine/columnCapInputs';
import {activeEndBearing} from '../../engine/endBearingInputs';
import {simpleSupportInput} from '../../engine/simpleSupports';
import {railTopAboveSteel} from '../../engine/railSeat';
import {columnStiffenerGeometry} from '../../engine/columnStiffeners';
import {capAngleTies} from './capAngleParts';
import {haunchGeometry,isTaperedHaunch} from '../../engine/taperedHaunchInputs';

/**
 * The runway parts at one support, to the project's sizes, for the report's isometric figures. World: x along the
 * runway (the grid at x = 0), y across it from the column face (y = 0) toward the runway, z up from the top of the
 * support seat (the underside of the girder bearing plates). Millimetres.
 */
const inch=25.4;
export interface SupportGeometry{
 reach:number;gap:number;bearing:{length:number;width:number;thickness:number};girder:{z0:number;d:number;bf:number;tf:number;tw:number;top:number;cap?:{width:number;depth:number;tf:number;tw:number}};
 rail:{z:number;baseWidth:number;baseThickness:number;webThickness:number;headWidth:number;headThickness:number;height:number};
 column:{d:number;bf:number;tf:number;tw:number;name:string;existing:boolean;isNew:boolean;bottom:number;top:number};
 support:'twin-rib'|'haunched-seat'|'rolled-corbel'|'tapered-haunch'|'existing'|'column-cap'|'by-others';
 seat:{length:number;projection:number;thickness:number};show:number;simple:boolean;
}
export function supportGeometry(p:ProjectInput):SupportGeometry{
 const d=p.details,b=d?.bracket,s=p.section,cap=s.kind==='cap'?{width:s.capWidth,depth:s.capDepth,tf:s.capTf,tw:s.capTw}:undefined;
 const bearing=d?{length:d.bearing.length,width:d.bearing.width,thickness:d.bearing.thickness}:{length:10*inch,width:12*inch,thickness:inch};
 const colCap=activeColumnCap(p),col=p.existingColumn?.enabled?existingColumnSection(p).section:{d:14*inch,bf:14.5*inch,tf:.71*inch,tw:.44*inch};
 const support=colCap?'column-cap':!b?.enabled?'by-others':(b.arrangement??'twin-rib').startsWith('existing')?'existing':b.arrangement==='haunched-seat'?'haunched-seat':b.arrangement==='rolled-corbel'?'rolled-corbel':isTaperedHaunch(b)?'tapered-haunch':'twin-rib';
 const reach=colCap?0:b?.enabled?b.reach:(d?.brace.flangeAttachment?.columnFace??18*inch);
 const z0=bearing.thickness,top=z0+s.d+(cap?cap.tw:0),rd=d?.rail,railH=railTopAboveSteel(p);
 // The rail base sits on the pad when there is one; the head top is the rail height above the girder steel.
 const pad=rd?.padThickness&&p.aist?.railPad?rd.padThickness:0;
 const rail={z:top+pad,height:railH-pad,...(rd?{baseWidth:rd.baseWidth,baseThickness:rd.baseThickness,webThickness:rd.webThickness,headWidth:rd.headWidth,headThickness:rd.headThickness}:{baseWidth:5*inch,baseThickness:.75*inch,webThickness:.6*inch,headWidth:2.5*inch,headThickness:1.2*inch})};
 // A tapered I haunch: its top flange is the seat, along the runway its seat width.
 const hg=support==='tapered-haunch'?haunchGeometry(b!,bearing.width):undefined;
 const seat=hg?{length:hg.bt,projection:hg.L,thickness:hg.tt}:b?.enabled?{length:b.seatLength,projection:b.seatProjection,thickness:b.seatThickness}:{length:bearing.length*2+inch,projection:reach+bearing.width/2,thickness:inch};
 const ribBottom=hg?hg.hr:b?.enabled?(support==='rolled-corbel'?(rolledStub(b)?.d??12*inch)+(rolledStub(b)?.seat?.t??0):b.seatThickness+b.ribDepth):2*inch;
 return {reach,gap:p.system==='simple'?simpleSupportInput(p).endGap:0,bearing,girder:{z0,d:s.d,bf:s.bf,tf:s.tf,tw:s.tw,top,cap},rail,
  column:{d:col.d,bf:col.bf,tf:col.tf,tw:col.tw,name:p.existingColumn?.shape||'COLUMN',existing:!!p.existingColumn?.enabled&&!p.existingColumn.isNew,isNew:!!p.existingColumn?.isNew,bottom:-ribBottom-8*inch,top:top+6*inch},
  support,seat,show:Math.max(36*inch,3*bearing.length),simple:p.system==='simple'};
}
/** A W shape with its web in the plane x = cx (a column), from z0 to z1; its near flange face at y = 0. */
export function column(S:Scene,g:SupportGeometry,role:Role,z0=g.column.bottom,z1=g.column.top){
 const c=g.column,r=c.existing?'existing' as Role:role;
 S.box(-c.bf/2,-c.tf,z0,c.bf/2,0,z1,r).box(-c.tw/2,-c.d+c.tf,z0,c.tw/2,-c.tf,z1,r).box(-c.bf/2,-c.d,z0,c.bf/2,-c.d+c.tf,z1,r);
 return S;
}
/** The bracket under the seat, by type; `role` marks it as the reviewed part. */
export function bracket(S:Scene,p:ProjectInput,g:SupportGeometry,role:Role){
 const b=p.details?.bracket;
 if(g.support==='by-others'||!b?.enabled){S.box(-g.seat.length/2,0,-g.seat.thickness,g.seat.length/2,g.seat.projection,0,'ghost');return S;}
 const ts=b.seatThickness,L=b.seatProjection;
 if(g.support==='rolled-corbel'){
  const st=rolledStub(b)!,t=st.seat?.t??0;
  if(st.seat)S.box(-st.seat.length/2,0,-t,st.seat.length/2,L,0,role);
  S.box(-st.bf/2,0,-t-st.tf,st.bf/2,L,-t,role).box(-st.tw/2,0,-t-st.d+st.tf,st.tw/2,L,-t-st.tf,role).box(-st.bf/2,0,-t-st.d,st.bf/2,L,-t-st.d+st.tf,role);
  if(st.stiffener)for(const side of [-1,1])S.box(side>0?st.tw/2:-st.bf/2+inch/4,g.reach-st.stiffener.t/2,-t-st.d+st.tf,side>0?st.bf/2-inch/4:-st.tw/2,g.reach+st.stiffener.t/2,-t-st.tf,role);
  return S;
 }
 if(g.support==='tapered-haunch'){
  // Web plate in the grid plane (x = 0) with the tapered profile, the top flange (the seat, flared to the bearing
  // width), the sloping bottom flange, the stiffener pair at the girder web line and the tip end plate.
  const h=haunchGeometry(b,p.details!.bearing.width),st=h.stiffener,tep=h.endPlate?st.t:0,Lw=h.L-tep,inner=(y:number)=>-h.depth(y)+h.tbv;
  S.prism(0,[[0,-h.tt],[Lw,-h.tt],[Lw,inner(Lw)],[0,inner(0)]],-h.tw/2,h.tw/2,role);
  const f=h.flare,top:Vec2[]=f?[[-h.btr/2,0],[h.btr/2,0],[h.btr/2,f.y0],[h.bt/2,f.y1],[h.bt/2,h.L],[-h.bt/2,h.L],[-h.bt/2,f.y1],[-h.btr/2,f.y0]]:[[-h.bt/2,0],[h.bt/2,0],[h.bt/2,h.L],[-h.bt/2,h.L]];
  S.prism(2,top,-h.tt,0,role);
  S.prism(0,[[0,-h.hr],[h.L,-h.ht],[h.L,-h.ht+h.tbv],[0,-h.hr+h.tbv]],-h.bb/2,h.bb/2,role);
  for(const side of [-1,1])S.box(side*h.tw/2,h.a-st.t/2,inner(h.a),side*(h.tw/2+st.width),h.a+st.t/2,-h.tt,role);
  if(tep)S.box(-h.bb/2,Lw,inner(h.L),h.bb/2,h.L,-h.tt,role);
  return S;
 }
 if(g.support==='existing'){
  const e=existingBracketProfile(b);
  S.box(-e.width/2,0,-ts-e.flangeThickness,e.width/2,e.projection,-ts,'existing').box(-e.webThickness/2,0,-ts-e.depth+e.flangeThickness,e.webThickness/2,e.projection,-ts-e.flangeThickness,'existing').box(-e.width/2,0,-ts-e.depth,e.width/2,e.projection,-ts-e.depth+e.flangeThickness,'existing');
  S.box(-b.seatLength/2,0,-ts,b.seatLength/2,L,0,role);return S;
 }
 const rg=ribGeometry(b),profile:Vec2[]=g.support==='haunched-seat'?[[0,-ts-rg.root],[L,-ts-rg.tip],[L,-ts],[0,-ts]]:[[0,-ts-b.ribDepth],[L,-ts-b.ribDepth],[L,-ts],[0,-ts]];
 for(const side of [-1,1])S.prism(0,profile,side*b.ribSpacing/2-b.ribThickness/2,side*b.ribSpacing/2+b.ribThickness/2,role);
 S.box(-b.seatLength/2,0,-ts,b.seatLength/2,L,0,role);
 return S;
}
/** A girder length from x0 to x1 on the line y: W flanges and web, with its cap channel; bottom at z0. */
export function beam(S:Scene,g:SupportGeometry,x0:number,x1:number,y:number,role:Role,z0=g.girder.z0,capRole:Role=role){
 const G=g.girder,a=Math.min(x0,x1),b=Math.max(x0,x1);
 S.box(a,y-G.bf/2,z0,b,y+G.bf/2,z0+G.tf,role).box(a,y-G.tw/2,z0+G.tf,b,y+G.tw/2,z0+G.d-G.tf,role).box(a,y-G.bf/2,z0+G.d-G.tf,b,y+G.bf/2,z0+G.d,role);
 if(G.cap){const c=G.cap,zt=z0+G.d+c.tw;S.box(a,y-c.width/2,z0+G.d,b,y+c.width/2,zt,capRole).box(a,y-c.width/2,zt-c.depth,b,y-c.width/2+c.tf,z0+G.d,capRole).box(a,y+c.width/2-c.tf,zt-c.depth,b,y+c.width/2,z0+G.d,capRole);}
 return S;
}
/** Top of the girder steel (the cap web when capped) above z0. */
export const steelTop=(g:SupportGeometry,z0=g.girder.z0)=>z0+g.girder.d+(g.girder.cap?.tw??0);
/** The rail from x0 to x1 on the line y, its base on the steel (or pad) at zb. */
export function railRun(S:Scene,g:SupportGeometry,x0:number,x1:number,y:number,role:Role,zb=g.rail.z){
 const r=g.rail,zh=zb+r.height,a=Math.min(x0,x1),b=Math.max(x0,x1);
 S.box(a,y-r.baseWidth/2,zb,b,y+r.baseWidth/2,zb+r.baseThickness,role).box(a,y-r.webThickness/2,zb+r.baseThickness,b,y+r.webThickness/2,zh-r.headThickness,role).box(a,y-r.headWidth/2,zh-r.headThickness,b,y+r.headWidth/2,zh,role);
 return zh;
}
/** A keeper pair (clip plates either side of the rail base) at x. */
export function keepers(S:Scene,g:SupportGeometry,x:number,y:number,role:Role,zb=g.rail.z){
 const r=g.rail;for(const side of [-1,1])S.box(x-60,side>0?y+r.baseWidth/2+2:y-r.baseWidth/2-45,zb,x+60,side>0?y+r.baseWidth/2+45:y-r.baseWidth/2-2,zb+r.baseThickness+8,role);
 return S;
}
/** The girder ends at the support: W (with its cap channel), bearing stiffeners and bearing plates. */
export function girders(S:Scene,g:SupportGeometry,role:Role,stiffenerRole:Role=role,bearingRole:Role=role,far=g.show,near=0,nearRole:Role='ghost'){
 const G=g.girder,y=g.reach,ends:[number,number][]=(g.simple?[[-g.gap/2-far,-g.gap/2],[g.gap/2,g.gap/2+near]]:[[-far,0],[0,near]]).filter(([a,b])=>b>a) as [number,number][];
 for(const [a,b] of ends){
  // The near bay, when shown, is a ghost outline so the far girder's end section, bearing and seat stay in view.
  if(a>=0&&nearRole==='ghost'){role=stiffenerRole=bearingRole='ghost';}
  beam(S,g,a,b,y,role);
  // The bearing under the girder end and its stiffener pair over the bearing center.
  const end=g.simple?(a<0?b:a):0,dir=a<0?-1:1,xc=g.simple?end+dir*g.bearing.length/2:0,ts=Math.max(G.tw,12);
  if(!g.simple&&a>=0)continue;
  S.box(g.simple?Math.min(end,end+dir*g.bearing.length):-g.bearing.length/2,y-g.bearing.width/2,0,g.simple?Math.max(end,end+dir*g.bearing.length):g.bearing.length/2,y+g.bearing.width/2,G.z0,bearingRole);
  for(const side of [-1,1])S.box(xc-ts/2,side>0?y+G.tw/2:y-G.bf/2+3,G.z0+G.tf,xc+ts/2,side>0?y+G.bf/2-3:y-G.tw/2,G.z0+G.d-G.tf,stiffenerRole);
 }
 return S;
}
/** The rail and two keepers each side near the support, along the shown length. */
export function rail(S:Scene,g:SupportGeometry,role:Role,keeperRole:Role=role,far=g.show,near=0){
 const r=g.rail,y=g.reach,a=-far-g.gap/2,b=-g.gap/2,zb=r.z,zh=r.z+r.height;
 // The rail over the near bay, when shown, is a ghost like that girder.
 if(near>0)S.box(b+g.gap,y-r.baseWidth/2,zb,near+g.gap/2,y+r.baseWidth/2,zh,'ghost');
 S.box(a,y-r.baseWidth/2,zb,b,y+r.baseWidth/2,zb+r.baseThickness,role).box(a,y-r.webThickness/2,zb+r.baseThickness,b,y+r.webThickness/2,zh-r.headThickness,role).box(a,y-r.headWidth/2,zh-r.headThickness,b,y+r.headWidth/2,zh,role);
 for(const x of [-far*.55])for(const side of [-1,1])S.box(x-40,side>0?y+r.baseWidth/2+2:y-r.baseWidth/2-30,zb,x+40,side>0?y+r.baseWidth/2+30:y-r.baseWidth/2-2,zb+r.baseThickness+6,keeperRole);
 return S;
}
/** A crane wheel on the rail head at x, as a disc across the runway. */
export function wheel(S:Scene,g:SupportGeometry,x:number,R=110,y=g.reach,zh=g.rail.z+g.rail.height,role:Role='context'){
 S.cylinder(1,[x,zh+R],R,y-g.rail.headWidth/2-8,y+g.rail.headWidth/2+8,role);return zh;
}
/** The top-flange ties at each girder end: girder gusset, the tie (paired bars or one flexible plate) and the column gusset. */
export function ties(S:Scene,p:ProjectInput,g:SupportGeometry,role:Role,both=false){
 const d=p.details;if(!d||g.support==='column-cap')return S;
 const t=d.brace,G=g.girder,z=G.z0+G.d-G.tf-t.width/2-6,tg=t.gussetThickness,kind=t.arrangement??'paired-bars';
 if(kind==='cap-angle')return capAngleTies(S,p,g,role,{both});
 const set=t.flangeAttachment?.longitudinalSetback??3*inch,xs=g.simple?[-g.gap/2-set-tg/2,...(both?[g.gap/2+set+tg/2]:[])]:[0];
 const girderSide=g.reach-G.bf/2+2*inch,colGusset=Math.max(4*inch,t.connection.edge*2+t.connection.pitch);
 for(const x of xs){
  S.box(x-tg/2,girderSide-colGusset*.2,z-t.width/2-10,x+tg/2,g.reach-G.tw/2,z+t.width/2+10,role);
  S.box(x-tg/2,0,z-t.width/2-10,x+tg/2,colGusset,z+t.width/2+10,role);
  if(kind==='flexible-plate')S.box(x+tg/2,colGusset*.4,z-t.width/2,x+tg/2+t.thickness,girderSide+colGusset*.4,z+t.width/2,role);
  else for(const side of [-1,1])S.box(side>0?x+tg/2:x-tg/2-t.thickness,colGusset*.3,z-t.width/2,side>0?x+tg/2+t.thickness:x-tg/2,girderSide+colGusset*.3,z+t.width/2,role);
 }
 return S;
}
/** Column stiffeners (continuity plates) at the bracket's force levels, when designed: a plate each side of the web. */
export function stiffeners(S:Scene,p:ProjectInput,g:SupportGeometry,role:Role){
 const x=columnStiffenerGeometry(p);if(!x||g.support==='column-cap')return S;
 for(const l of x.levels)for(const side of [-1,1])S.box(side*x.tw/2,-x.tf-x.length,l.z-x.t/2,side*(x.tw/2+x.width),-x.tf,l.z+x.t/2,role);
 return S;
}
export const hasEndBearing=(p:ProjectInput)=>!!activeEndBearing(p);
