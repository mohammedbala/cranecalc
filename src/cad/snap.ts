/**
 * Object snaps, polar tracking and object snap tracking: where a click lands. Pure functions of the objects near the
 * cursor, the aperture (in drawing units) and the settings, so the editor and the tests share them.
 */
import {
 add,angleOf,cross,dist,dot,len,lerp,mul,nearestOnSegment,pieceIntersections,pieceNearest,pieces,polar,snapPoints,sub,
 type CadDoc,type Ent,type Piece,type Pt,type SnapKind,
} from './model';

export interface SnapSettings{
 osnap:boolean;modes:ReadonlySet<SnapKind>;
 ortho:boolean;polar:boolean;polarAngle:number;otrack:boolean;
 grid:number|null;
}
/** A point acquired for tracking (hovered a moment): its position and, for a line end, the line's direction. */
export interface Acquired{p:Pt;dir?:Pt}
export interface SnapResult{p:Pt;snap?:{kind:SnapKind;p:Pt};tracks?:[Pt,Pt][];tip?:string}
export const defaultSnapModes:SnapKind[]=['end','mid','cen','qua','int','per','ins','nod','ext','tan','app'];
export const allSnapModes:SnapKind[]=['end','mid','cen','nod','qua','int','ext','ins','per','tan','nea','app','par'];
const rank:Record<SnapKind,number>={end:0,int:0,mid:1,cen:2,qua:2,ins:2,nod:2,app:2,per:3,tan:3,ext:4,par:4,trk:4,nea:5,grid:6};
const REACH=1e5;
const unit=(v:Pt):Pt=>{const l=len(v)||1;return [v[0]/l,v[1]/l];};
const lineHit=(a:Pt,u:Pt,b:Pt,v:Pt):Pt|undefined=>{const den=cross(u,v);if(Math.abs(den)<1e-12)return undefined;return add(a,mul(u,cross(sub(b,a),v)/den));};
const project=(p:Pt,o:Pt,u:Pt):Pt=>add(o,mul(u,dot(sub(p,o),u)));
const fmt=(a:number)=>`${Number((((a%360)+360)%360).toFixed(1))}°`;

/** Tangent points on a circle from an outside point. */
export function tangentPoints(from:Pt,c:Pt,r:number):Pt[]{
 const d=dist(from,c);if(d<=r+1e-12)return [];
 const a=Math.acos(r/d)/Math.PI*180,base=angleOf(c,from);
 return [polar(c,r,base+a),polar(c,r,base-a)];
}

/** The object snap under the cursor, by priority then distance. */
export function objectSnap(raw:Pt,near:Ent[],doc:Pick<CadDoc,'display'|'realPerUnit'>,aperture:number,modes:ReadonlySet<SnapKind>,base?:Pt,acquired:Acquired[]=[]):{kind:SnapKind;p:Pt;from?:Pt}|undefined{
 let best:{kind:SnapKind;p:Pt;from?:Pt}|undefined,score=Infinity;
 const offer=(kind:SnapKind,q:Pt,from?:Pt)=>{if(!modes.has(kind))return;const d=dist(raw,q);if(d>aperture)return;const s=rank[kind]*1e6+d;if(s<score){score=s;best={kind,p:q,...(from?{from}:{})};}};
 for(const e of near)for(const s of snapPoints(e,doc))offer(s.kind,s.p);
 // Pieces passing under the cursor: intersections, perpendicular, tangent, nearest.
 const under:Piece[]=[],lines:Extract<Piece,{k:'seg'}>[]=[];
 for(const e of near){
  if(under.length>=120)break;
  if(e.type==='text')continue;
  for(const pc of pieces(e,doc)){
   const d=dist(raw,pieceNearest(pc,raw));
   if(d<=aperture)under.push(pc);
   if(pc.k==='seg'&&d<=aperture*20&&lines.length<60&&dist(raw,project(raw,pc.a,unit(sub(pc.b,pc.a))))<=aperture*1.5)lines.push(pc);
  }
 }
 for(let i=0;i<under.length;i++)for(let j=i+1;j<under.length;j++)for(const q of pieceIntersections(under[i],under[j]))offer('int',q);
 if(modes.has('app'))for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){
  const a=lines[i],b=lines[j],x=lineHit(a.a,unit(sub(a.b,a.a)),b.a,unit(sub(b.b,b.a)));
  if(x&&dist(x,raw)<=aperture&&!(dist(nearestOnSegment(x,a.a,a.b).point,x)<1e-9&&dist(nearestOnSegment(x,b.a,b.b).point,x)<1e-9))offer('app',x);
 }
 if(base)for(const pc of under){
  if(pc.k==='seg'){const v=sub(pc.b,pc.a),l2=dot(v,v);if(l2<1e-24)continue;const t=dot(sub(base,pc.a),v)/l2;if(t>=-1e-9&&t<=1+1e-9)offer('per',lerp(pc.a,pc.b,t));}
  else{
   const d=dist(base,pc.c);if(d>1e-12){const q=add(pc.c,mul(sub(base,pc.c),pc.r/d));if(dist(pieceNearest(pc,q),q)<1e-9)offer('per',q);}
   for(const q of tangentPoints(base,pc.c,pc.r))if(dist(pieceNearest(pc,q),q)<1e-9)offer('tan',q);
  }
 }
 for(const pc of under)offer('nea',pieceNearest(pc,raw));
 // Extension of an acquired line end along the line; parallel to an acquired line through the base point.
 for(const a of acquired){
  if(!a.dir)continue;
  if(modes.has('ext')){const q=project(raw,a.p,a.dir);if(dist(q,a.p)>aperture&&dist(q,raw)<=aperture)offer('ext',q,a.p);}
  if(modes.has('par')&&base){const q=project(raw,base,a.dir);if(dist(q,base)>aperture&&dist(q,raw)<=aperture)offer('par',q,base);}
 }
 return best;
}

/** Tracking paths: from acquired points (horizontal, vertical and the polar angles) and from the base point (polar). */
export function trackPoint(raw:Pt,aperture:number,s:SnapSettings,base?:Pt,acquired:Acquired[]=[]):SnapResult|undefined{
 const angles=(polarOn:boolean)=>{const out=[0,90];if(polarOn&&s.polarAngle>0)for(let a=s.polarAngle;a<360-1e-9;a+=s.polarAngle)out.push(a);return [...new Set(out.map(a=>Math.round(a*1e6)/1e6%180))];};
 type Path={o:Pt;u:Pt;angle:number;ray:boolean};
 const paths:Path[]=[];
 if(s.otrack)for(const a of acquired)for(const ang of angles(s.polar))paths.push({o:a.p,u:polar([0,0],1,ang),angle:ang,ray:false});
 if(s.polar&&base&&s.polarAngle>0)for(let ang=0;ang<360-1e-9;ang+=s.polarAngle)paths.push({o:base,u:polar([0,0],1,ang),angle:ang,ray:true});
 const hits=paths.map(pa=>{const q=project(raw,pa.o,pa.u),t=dot(sub(q,pa.o),pa.u);return {pa,q,d:dist(q,raw),t};}).filter(h=>h.d<=aperture&&(!h.pa.ray||h.t>0)&&dist(h.q,h.pa.o)>aperture*.5).sort((a,b)=>a.d-b.d);
 if(!hits.length)return undefined;
 const [h]=hits;
 // Two paths from different origins or directions: their intersection.
 const other=hits.find(o=>(o.pa.o!==h.pa.o||Math.abs(cross(o.pa.u,h.pa.u))>1e-9)&&Math.abs(cross(o.pa.u,h.pa.u))>1e-9);
 if(other){const x=lineHit(h.pa.o,h.pa.u,other.pa.o,other.pa.u);if(x&&dist(x,raw)<=aperture*1.5)return {p:x,snap:{kind:'trk',p:x},tracks:[[h.pa.o,x],[other.pa.o,x]],tip:'Intersection of tracking paths'};}
 const dir=dot(sub(h.q,h.pa.o),h.pa.u)>=0?h.pa.angle:h.pa.angle+180;
 return {p:h.q,tracks:[[h.pa.o,add(h.pa.o,mul(unit(sub(h.q,h.pa.o)),REACH))]],tip:`${h.pa.ray?'Polar':'Tracking'}: ${fmt(dir)}`};
}

/** Where a click lands: object snap, then tracking, then grid snap and ortho from the base point. */
export function resolveSnap(raw:Pt,near:Ent[],doc:Pick<CadDoc,'display'|'realPerUnit'>,aperture:number,s:SnapSettings,base?:Pt,acquired:Acquired[]=[]):SnapResult{
 if(s.osnap){const o=objectSnap(raw,near,doc,aperture,s.modes,base,acquired);if(o)return {p:o.p,snap:{kind:o.kind,p:o.p},...(o.from?{tracks:[[o.from,o.p] as [Pt,Pt]]}:{})};}
 if((s.polar&&base)||(s.otrack&&acquired.length)){const t=trackPoint(raw,aperture,s,base,acquired);if(t)return t;}
 let p=raw;
 if(s.grid){const g=s.grid;p=[Math.round(p[0]/g)*g,Math.round(p[1]/g)*g];}
 if(s.ortho&&base)p=Math.abs(p[0]-base[0])>=Math.abs(p[1]-base[1])?[p[0],base[1]]:[base[0],p[1]];
 return {p};
}
/** The snap point (and line direction) under the cursor worth acquiring for tracking. */
export function acquirable(raw:Pt,near:Ent[],doc:Pick<CadDoc,'display'|'realPerUnit'>,aperture:number):Acquired|undefined{
 let best:Acquired|undefined,bd=Infinity;
 for(const e of near)for(const s of snapPoints(e,doc)){
  if(s.kind==='nea'||s.kind==='grid')continue;const d=dist(raw,s.p);if(d>aperture||d>=bd)continue;bd=d;
  const dir=e.type==='line'&&(s.kind==='end'||s.kind==='mid')?unit(sub(e.b,e.a)):undefined;
  best={p:s.p,...(dir?{dir}:{})};
 }
 return best;
}
