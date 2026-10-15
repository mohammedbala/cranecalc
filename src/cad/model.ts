/**
 * The CAD editor's drawing model: entities on layers in drawing units (paper inches or millimeters for the issued
 * sheets, sketch units for the engineering sketches), y up, origin at the lower-left corner of the sheet.
 */
export type Pt=[number,number];
export type Align=0|1|2;
export type LineType='Continuous'|'DASHED'|'CENTER'|'HIDDEN';
export interface CadLayer{name:string;color:number;ltype:LineType;weight:number;visible:boolean;locked:boolean}

interface Base{id:number;layer:string}
export interface LineEnt extends Base{type:'line';a:Pt;b:Pt}
export interface PolyEnt extends Base{type:'poly';points:Pt[];closed:boolean}
/** A filled triangle or quadrilateral (arrowheads, dots). */
export interface SolidEnt extends Base{type:'solid';points:Pt[]}
export interface CircleEnt extends Base{type:'circle';center:Pt;radius:number}
/** Counterclockwise from start to end, degrees from +x. */
export interface ArcEnt extends Base{type:'arc';center:Pt;radius:number;start:number;end:number}
/** height is the cap height; at is the baseline anchor (left, center or right by align). */
export interface TextEnt extends Base{type:'text';at:Pt;height:number;value:string;angle:number;align:Align;bold:boolean}
/** A dimension measuring a to b; at is a point on the dimension line. */
export interface DimEnt extends Base{type:'dim';kind:'aligned'|'horizontal'|'vertical';a:Pt;b:Pt;at:Pt;height:number;text?:string}
export type Ent=LineEnt|PolyEnt|SolidEnt|CircleEnt|ArcEnt|TextEnt|DimEnt;
/** An entity before it has an id. */
export type NewEnt=Ent extends infer E?E extends Ent?Omit<E,'id'>:never:never;

export interface CadDoc{
 /** The drawing it was made from: a sheet number (S-02) or a sketch number (SK-01). */
 key:string;title:string;
 /** Coordinate unit: paper inches or millimeters for sheets, sketch units for sketches. */
 unit:'in'|'mm'|'unit';
 /** Lengths are shown in feet-inches (US) or millimeters (SI). */
 display:'US'|'SI';
 /** Real millimeters per drawing unit for dimensions and distances (the drawing scale). */
 realPerUnit:number;
 /** Sheet extents in drawing units; the SVG of the sheet has width/svgScale by height/svgScale user units. */
 width:number;height:number;svgScale:number;
 layers:CadLayer[];entities:Ent[];nextId:number;
}

export const DEG=Math.PI/180;
export const add=(a:Pt,b:Pt):Pt=>[a[0]+b[0],a[1]+b[1]];
export const sub=(a:Pt,b:Pt):Pt=>[a[0]-b[0],a[1]-b[1]];
export const mul=(a:Pt,k:number):Pt=>[a[0]*k,a[1]*k];
export const dot=(a:Pt,b:Pt)=>a[0]*b[0]+a[1]*b[1];
export const cross=(a:Pt,b:Pt)=>a[0]*b[1]-a[1]*b[0];
export const len=(a:Pt)=>Math.hypot(a[0],a[1]);
export const dist=(a:Pt,b:Pt)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export const lerp=(a:Pt,b:Pt,t:number):Pt=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
export const mid=(a:Pt,b:Pt):Pt=>lerp(a,b,.5);
export const polar=(c:Pt,r:number,deg:number):Pt=>[c[0]+r*Math.cos(deg*DEG),c[1]+r*Math.sin(deg*DEG)];
export const angleOf=(a:Pt,b:Pt)=>Math.atan2(b[1]-a[1],b[0]-a[0])/DEG;
export const norm360=(a:number)=>((a%360)+360)%360;
/** Counterclockwise sweep from start to end, in (0, 360]. */
export const sweep=(start:number,end:number)=>{const s=norm360(end-start);return s===0?360:s;};
export const onArc=(deg:number,start:number,end:number,tol=1e-9)=>norm360(deg-start)<=sweep(start,end)+tol;
export const arcPoint=(e:{center:Pt;radius:number},deg:number)=>polar(e.center,e.radius,deg);
export const close=(a:Pt,b:Pt,tol=1e-9)=>Math.abs(a[0]-b[0])<=tol&&Math.abs(a[1]-b[1])<=tol;

// ---- text extents ------------------------------------------------------------------------------------------------
let measureCtx:CanvasRenderingContext2D|null|undefined;
const widthCache=new Map<string,number>();
/** Width of the text in units of its cap height (Arial; cap height 0.716 em). */
export function textWidthPerHeight(value:string,bold:boolean){
 const key=(bold?'b':'r')+value;let w=widthCache.get(key);if(w!==undefined)return w;
 if(measureCtx===undefined){try{measureCtx=typeof document!=='undefined'?document.createElement('canvas').getContext('2d'):null;}catch{measureCtx=null;}}
 if(measureCtx){measureCtx.font=`${bold?700:400} 100px Arial, "Liberation Sans", Helvetica, sans-serif`;w=measureCtx.measureText(value).width/71.6;}
 else w=value.length*(bold?.62:.56)/.716;
 if(widthCache.size>20000)widthCache.clear();
 widthCache.set(key,w);return w;
}
/** The four corners of a text's box: baseline-left, baseline-right, top-right, top-left (descenders included). */
export function textBox(e:TextEnt):Pt[]{
 const w=textWidthPerHeight(e.value,e.bold)*e.height,x0=e.align===1?-w/2:e.align===2?-w:0,lo=-.28*e.height,hi=1.12*e.height;
 const c=Math.cos(e.angle*DEG),s=Math.sin(e.angle*DEG),at=(x:number,y:number):Pt=>[e.at[0]+x*c-y*s,e.at[1]+x*s+y*c];
 return [at(x0,lo),at(x0+w,lo),at(x0+w,hi),at(x0,hi)];
}

// ---- dimensions --------------------------------------------------------------------------------------------------
/** A length in real millimeters as a drawing reads it: feet-inches to 1/16 in (US) or whole millimeters (SI). */
export function formatLength(mm:number,display:'US'|'SI'){
 if(display==='SI')return `${Math.round(mm)}`;
 const sixteenths=Math.round(Math.abs(mm)/25.4*16),sign=mm<0?'-':'';
 const ft=Math.floor(sixteenths/192),rest=sixteenths-ft*192,inch=Math.floor(rest/16);let f=rest-inch*16,d=16;
 while(f&&f%2===0){f/=2;d/=2;}
 const frac=f?`${inch||ft?`${inch} `:''}${f}/${d}`:`${inch}`;
 return ft?`${sign}${ft}'-${frac}"`:`${sign}${frac}"`;
}
export interface DimGeometry{lines:[Pt,Pt][];arrows:Pt[][];text:{at:Pt;angle:number;value:string;height:number}}
/** Extension lines, dimension line, arrowheads and text of a dimension. */
export function dimGeometry(e:DimEnt,doc:Pick<CadDoc,'display'|'realPerUnit'>):DimGeometry{
 const dir:Pt=e.kind==='horizontal'?[1,0]:e.kind==='vertical'?[0,1]:(()=>{const v=sub(e.b,e.a),l=len(v)||1;return [v[0]/l,v[1]/l] as Pt;})();
 const n:Pt=[-dir[1],dir[0]],off=dot(sub(e.at,e.a),n);
 // Dimension line through `at`, along dir; the feet are the measured points projected onto it.
 const foot=(p:Pt):Pt=>add(e.at,mul(dir,dot(sub(p,e.at),dir)));
 const fa=foot(e.a),fb=foot(e.b),measured=Math.abs(dot(sub(e.b,e.a),dir));
 const h=e.height,gap=h*.5,ext=h*.6,arrow=h*1.1,side=(p:Pt,f:Pt)=>{const v=sub(f,p),l=len(v);return l>1e-12?mul(v,1/l):mul(n,Math.sign(off)||1);};
 const lines:[Pt,Pt][]=[];
 for(const [p,f] of [[e.a,fa],[e.b,fb]] as const){const u=side(p,f);if(dist(p,f)>gap)lines.push([add(p,mul(u,gap)),add(f,mul(u,ext))]);}
 lines.push([fa,fb]);
 const along=sub(fb,fa),l=len(along)||1,u=mul(along,1/l),w=arrow*.18;
 const head=(tip:Pt,back:Pt):Pt[]=>{const v=sub(back,tip),vl=len(v)||1,k=mul(v,arrow/vl),p:Pt=[-k[1]/arrow*w,k[0]/arrow*w];return [tip,add(add(tip,k),p),add(add(tip,k),mul(p,-1))];};
 const arrows=l>2.4*arrow?[head(fa,fb),head(fb,fa)]:[head(fa,sub(fa,u)),head(fb,add(fb,u))];
 let angle=Math.atan2(u[1],u[0])/DEG;if(angle>90.0001||angle<=-90)angle+=angle>0?-180:180;
 const up:Pt=[-Math.sin(angle*DEG),Math.cos(angle*DEG)];
 return {lines,arrows,text:{at:add(mid(fa,fb),mul(up,h*.45)),angle,value:e.text??formatLength(measured*doc.realPerUnit,doc.display),height:h}};
}

// ---- extents, segments and picking -------------------------------------------------------------------------------
export type Box=[number,number,number,number];
const boxOf=(pts:Pt[]):Box=>{let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;for(const [x,y] of pts){if(x<a)a=x;if(y<b)b=y;if(x>c)c=x;if(y>d)d=y;}return [a,b,c,d];};
export function arcExtremes(e:{center:Pt;radius:number},start:number,end:number):Pt[]{
 const pts=[arcPoint(e,start),arcPoint(e,end)];
 for(const q of [0,90,180,270])if(onArc(q,start,end))pts.push(arcPoint(e,q));
 return pts;
}
export function bbox(e:Ent,doc?:Pick<CadDoc,'display'|'realPerUnit'>):Box{
 switch(e.type){
  case 'line':return boxOf([e.a,e.b]);
  case 'poly':case 'solid':return boxOf(e.points);
  case 'circle':return [e.center[0]-e.radius,e.center[1]-e.radius,e.center[0]+e.radius,e.center[1]+e.radius];
  case 'arc':return boxOf(arcExtremes(e,e.start,e.end));
  case 'text':return boxOf(textBox(e));
  case 'dim':{const g=dimGeometry(e,doc??{display:'US',realPerUnit:1});return boxOf([...g.lines.flat(),...textBox({type:'text',id:0,layer:'',at:g.text.at,height:g.text.height,value:g.text.value,angle:g.text.angle,align:1,bold:false})]);}
 }
}
/** Straight segments of an entity (circles and arcs are curves and have none). */
export function segments(e:Ent,doc?:Pick<CadDoc,'display'|'realPerUnit'>):[Pt,Pt][]{
 switch(e.type){
  case 'line':return [[e.a,e.b]];
  case 'poly':{const s:[Pt,Pt][]=[];for(let i=1;i<e.points.length;i++)s.push([e.points[i-1],e.points[i]]);if(e.closed&&e.points.length>2)s.push([e.points[e.points.length-1],e.points[0]]);return s;}
  case 'solid':{const p=e.points;return p.map((v,i)=>[v,p[(i+1)%p.length]] as [Pt,Pt]);}
  case 'dim':return dimGeometry(e,doc??{display:'US',realPerUnit:1}).lines;
  default:return [];
 }
}
export function nearestOnSegment(p:Pt,a:Pt,b:Pt):{point:Pt;t:number}{
 const v=sub(b,a),l2=dot(v,v);if(l2<1e-24)return {point:a,t:0};
 const t=Math.max(0,Math.min(1,dot(sub(p,a),v)/l2));return {point:lerp(a,b,t),t};
}
function inPolygon(p:Pt,poly:Pt[]){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>p[1])!==(yj>p[1])&&p[0]<(xj-xi)*(p[1]-yi)/(yj-yi)+xi)inside=!inside;}return inside;}
/** The point of the entity nearest p, and its distance (0 inside text and solids). */
export function nearest(e:Ent,p:Pt,doc?:Pick<CadDoc,'display'|'realPerUnit'>):{point:Pt;d:number}{
 if(e.type==='circle'||e.type==='arc'){
  const a=angleOf(e.center,p);let q:Pt;
  if(e.type==='circle'||onArc(a,e.start,e.end))q=arcPoint(e,a);
  else{const s=arcPoint(e,e.start),t=arcPoint(e,e.end);q=dist(p,s)<dist(p,t)?s:t;}
  return {point:q,d:dist(p,q)};
 }
 if(e.type==='text'){const box=textBox(e);if(inPolygon(p,box))return {point:e.at,d:0};}
 if(e.type==='solid'&&inPolygon(p,e.points))return {point:p,d:0};
 let best={point:p,d:Infinity};
 for(const [a,b] of segments(e,doc)){const q=nearestOnSegment(p,a,b).point,d=dist(p,q);if(d<best.d)best={point:q,d};}
 if(e.type==='text'){const box=textBox(e);for(let i=0;i<4;i++){const q=nearestOnSegment(p,box[i],box[(i+1)%4]).point,d=dist(p,q);if(d<best.d)best={point:q,d};}}
 if(e.type==='dim'){const g=dimGeometry(e,doc??{display:'US',realPerUnit:1});const box=textBox({type:'text',id:0,layer:'',at:g.text.at,height:g.text.height,value:g.text.value,angle:g.text.angle,align:1,bold:false});if(inPolygon(p,box))return {point:p,d:0};}
 return best;
}
const segBox=(a:Pt,b:Pt,r:Box)=>{
 // Liang–Barsky clip: does segment ab touch rectangle r?
 let t0=0,t1=1;const dx=b[0]-a[0],dy=b[1]-a[1];
 for(const [p,q] of [[-dx,a[0]-r[0]],[dx,r[2]-a[0]],[-dy,a[1]-r[1]],[dy,r[3]-a[1]]]){
  if(p===0){if(q<0)return false;}else{const t=q/p;if(p<0){if(t>t1)return false;if(t>t0)t0=t;}else{if(t<t0)return false;if(t<t1)t1=t;}}
 }
 return true;
};
/** Window (entity wholly inside r) or crossing (entity touches r) selection test. */
export function inWindow(e:Ent,r:Box,crossing:boolean,doc?:Pick<CadDoc,'display'|'realPerUnit'>){
 const b=bbox(e,doc);
 if(b[0]>=r[0]&&b[1]>=r[1]&&b[2]<=r[2]&&b[3]<=r[3])return true;
 if(!crossing||b[2]<r[0]||b[0]>r[2]||b[3]<r[1]||b[1]>r[3])return false;
 if(e.type==='text'||e.type==='dim'||e.type==='solid')return true;
 if(e.type==='circle'||e.type==='arc'){
  const n=48,sw=e.type==='arc'?sweep(e.start,e.end):360,s0=e.type==='arc'?e.start:0;
  for(let i=0;i<n;i++)if(segBox(arcPoint(e,s0+sw*i/n),arcPoint(e,s0+sw*(i+1)/n),r))return true;
  return false;
 }
 return segments(e,doc).some(([a,c])=>segBox(a,c,r));
}

// ---- snap points -------------------------------------------------------------------------------------------------
export type SnapKind='end'|'mid'|'cen'|'qua'|'int'|'per'|'nea'|'ins'|'grid';
export function snapPoints(e:Ent,doc?:Pick<CadDoc,'display'|'realPerUnit'>):{kind:SnapKind;p:Pt}[]{
 const out:{kind:SnapKind;p:Pt}[]=[];
 switch(e.type){
  case 'line':out.push({kind:'end',p:e.a},{kind:'end',p:e.b},{kind:'mid',p:mid(e.a,e.b)});break;
  case 'poly':for(const p of e.points)out.push({kind:'end',p});for(const [a,b] of segments(e))out.push({kind:'mid',p:mid(a,b)});break;
  case 'solid':for(const p of e.points)out.push({kind:'end',p});break;
  case 'circle':out.push({kind:'cen',p:e.center});for(const q of [0,90,180,270])out.push({kind:'qua',p:arcPoint(e,q)});break;
  case 'arc':out.push({kind:'cen',p:e.center},{kind:'end',p:arcPoint(e,e.start)},{kind:'end',p:arcPoint(e,e.end)},{kind:'mid',p:arcPoint(e,e.start+sweep(e.start,e.end)/2)});
   for(const q of [0,90,180,270])if(onArc(q,e.start,e.end))out.push({kind:'qua',p:arcPoint(e,q)});break;
  case 'text':out.push({kind:'ins',p:e.at});break;
  case 'dim':{out.push({kind:'end',p:e.a},{kind:'end',p:e.b});const g=dimGeometry(e,doc??{display:'US',realPerUnit:1});out.push({kind:'end',p:g.lines[g.lines.length-1][0]},{kind:'end',p:g.lines[g.lines.length-1][1]});break;}
 }
 return out;
}

// ---- intersections -----------------------------------------------------------------------------------------------
/** Parameters (t along ab, u along cd) where two segments cross, or undefined. */
export function segSeg(a:Pt,b:Pt,c:Pt,d:Pt,extendFirst=false):{t:number;u:number;p:Pt}|undefined{
 const r=sub(b,a),s=sub(d,c),den=cross(r,s);if(Math.abs(den)<1e-14)return undefined;
 const ca=sub(c,a),t=cross(ca,s)/den,u=cross(ca,r)/den,eps=1e-9;
 if(u<-eps||u>1+eps||(!extendFirst&&(t<-eps||t>1+eps)))return undefined;
 return {t,u,p:lerp(a,b,t)};
}
/** Parameters t along ab where the segment (or its line when extend) meets a circle. */
export function segCircle(a:Pt,b:Pt,c:Pt,r:number,extend=false):number[]{
 const d=sub(b,a),f=sub(a,c),A=dot(d,d),B=2*dot(f,d),C=dot(f,f)-r*r,disc=B*B-4*A*C;
 if(A<1e-24||disc<0)return [];
 const q=Math.sqrt(disc),ts=disc===0?[-B/(2*A)]:[(-B-q)/(2*A),(-B+q)/(2*A)];
 return extend?ts:ts.filter(t=>t>=-1e-9&&t<=1+1e-9);
}
export function circleCircle(c1:Pt,r1:number,c2:Pt,r2:number):Pt[]{
 const d=dist(c1,c2);if(d<1e-12||d>r1+r2+1e-12||d<Math.abs(r1-r2)-1e-12)return [];
 const a=(r1*r1-r2*r2+d*d)/(2*d),h=Math.sqrt(Math.max(0,r1*r1-a*a)),m=add(c1,mul(sub(c2,c1),a/d)),o:Pt=[-(c2[1]-c1[1])/d*h,(c2[0]-c1[0])/d*h];
 return h<1e-12?[m]:[add(m,o),sub(m,o)];
}
type Curve={c:Pt;r:number;start?:number;end?:number};
const curveOf=(e:Ent):Curve|undefined=>e.type==='circle'?{c:e.center,r:e.radius}:e.type==='arc'?{c:e.center,r:e.radius,start:e.start,end:e.end}:undefined;
const onCurve=(k:Curve,p:Pt)=>k.start===undefined||onArc(angleOf(k.c,p),k.start,k.end!);
/** All intersection points between two entities (text has none). */
export function intersections(e:Ent,f:Ent,doc?:Pick<CadDoc,'display'|'realPerUnit'>):Pt[]{
 if(e.type==='text'||f.type==='text')return [];
 const out:Pt[]=[],ce=curveOf(e),cf=curveOf(f),se=ce?[]:segments(e,doc),sf=cf?[]:segments(f,doc);
 for(const [a,b] of se)for(const [c,d] of sf){const x=segSeg(a,b,c,d);if(x)out.push(x.p);}
 if(ce&&cf){for(const p of circleCircle(ce.c,ce.r,cf.c,cf.r))if(onCurve(ce,p)&&onCurve(cf,p))out.push(p);}
 else if(ce||cf){const k=(ce??cf)!,segs=ce?sf:se;for(const [a,b] of segs)for(const t of segCircle(a,b,k.c,k.r)){const p=lerp(a,b,t);if(onCurve(k,p))out.push(p);}}
 return out;
}

// ---- transforms --------------------------------------------------------------------------------------------------
const clean=(a:number)=>Math.abs(a)<1e-9?0:a;
/** x' = m0 x + m2 y + m4, y' = m1 x + m3 y + m5. */
export type Affine=[number,number,number,number,number,number];
export const apply=(m:Affine,[x,y]:Pt):Pt=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
export const translation=(d:Pt):Affine=>[1,0,0,1,d[0],d[1]];
export function rotation(c:Pt,deg:number):Affine{const a=deg*DEG,co=Math.cos(a),s=Math.sin(a);return [co,s,-s,co,c[0]-co*c[0]+s*c[1],c[1]-s*c[0]-co*c[1]];}
export const scaling=(c:Pt,k:number):Affine=>[k,0,0,k,c[0]*(1-k),c[1]*(1-k)];
export function mirroring(a:Pt,b:Pt):Affine{
 const t=Math.atan2(b[1]-a[1],b[0]-a[0]),c=Math.cos(2*t),s=Math.sin(2*t);
 return [c,s,s,-c,a[0]-c*a[0]-s*a[1],a[1]-s*a[0]+c*a[1]];
}
/** The entity under an affine map (uniform scale, rotation, reflection). Text and dimensions stay readable when mirrored. */
export function transformEnt<E extends Ent>(e:E,m:Affine):E{
 const det=m[0]*m[3]-m[1]*m[2],k=Math.sqrt(Math.abs(det)),mirror=det<0,rot=Math.atan2(m[1],m[0])/DEG,P=(p:Pt)=>apply(m,p);
 switch(e.type){
  case 'line':return {...e,a:P(e.a),b:P(e.b)};
  case 'poly':case 'solid':return {...e,points:e.points.map(P)};
  case 'circle':return {...e,center:P(e.center),radius:e.radius*k};
  case 'arc':{const s=P(arcPoint(e,e.start)),t=P(arcPoint(e,e.end)),c=P(e.center);const a0=angleOf(c,s),a1=angleOf(c,t);return {...e,center:c,radius:e.radius*k,start:mirror?a1:a0,end:mirror?a0:a1};}
  case 'text':{
   if(!mirror)return {...e,at:P(e.at),height:e.height*k,angle:clean(norm360(e.angle+rot+180)-180)};
   // Mirrored text keeps reading left to right: mirror the box, then place the text in it.
   const box=textBox(e).map(P),align=e.align===0?2:e.align===2?0:1;
   const base=align===0?box[1]:align===2?box[0]:mid(box[0],box[1]);
   const dir=sub(box[0],box[1]);let angle=Math.atan2(dir[1],dir[0])/DEG;if(angle>90.0001||angle<=-90)angle+=angle>0?-180:180;
   const lift=mul([-Math.sin(angle*DEG),Math.cos(angle*DEG)],.28*e.height*k),at=add(base,lift);
   return {...e,at,height:e.height*k,angle:clean(angle),align:align as Align};
  }
  case 'dim':{
   // A horizontal or vertical dimension stays one when the map keeps the axes (a quarter turn swaps them).
   const keep=Math.abs(m[1])<1e-9&&Math.abs(m[2])<1e-9,swap=Math.abs(m[0])<1e-9&&Math.abs(m[3])<1e-9;
   const kind=e.kind==='aligned'?'aligned':keep?e.kind:swap?(e.kind==='horizontal'?'vertical':'horizontal'):'aligned';
   return {...e,a:P(e.a),b:P(e.b),at:P(e.at),height:e.height*k,kind};
  }
 }
 return e;
}

// ---- grips -------------------------------------------------------------------------------------------------------
export interface Grip{p:Pt;role:string}
export function grips(e:Ent):Grip[]{
 switch(e.type){
  case 'line':return [{p:e.a,role:'a'},{p:e.b,role:'b'},{p:mid(e.a,e.b),role:'mid'}];
  case 'poly':return [...e.points.map((p,i)=>({p,role:`v${i}`})),...segments(e).map(([a,b],i)=>({p:mid(a,b),role:`s${i}`}))];
  case 'solid':return e.points.map((p,i)=>({p,role:`v${i}`}));
  case 'circle':return [{p:e.center,role:'center'},...[0,90,180,270].map(q=>({p:arcPoint(e,q),role:'radius'}))];
  case 'arc':return [{p:e.center,role:'center'},{p:arcPoint(e,e.start),role:'start'},{p:arcPoint(e,e.end),role:'end'},{p:arcPoint(e,e.start+sweep(e.start,e.end)/2),role:'radius'}];
  case 'text':return [{p:e.at,role:'at'}];
  case 'dim':return [{p:e.a,role:'a'},{p:e.b,role:'b'},{p:e.at,role:'at'}];
 }
}
/** The entity with one grip moved to p (from its original position from). */
export function stretchGrip(e:Ent,role:string,from:Pt,p:Pt):Ent{
 const d=sub(p,from);
 switch(e.type){
  case 'line':return role==='a'?{...e,a:p}:role==='b'?{...e,b:p}:transformEnt(e,translation(d));
  case 'poly':case 'solid':{
   const pts=e.points.map(q=>[...q] as Pt);
   if(role[0]==='v')pts[+role.slice(1)]=p;
   else{const i=+role.slice(1),j=(i+1)%pts.length;pts[i]=add(pts[i],d);pts[j]=add(pts[j],d);}
   return {...e,points:pts};
  }
  case 'circle':return role==='center'?{...e,center:p}:{...e,radius:Math.max(1e-9,dist(e.center,p))};
  case 'arc':return role==='center'?{...e,center:p}:role==='start'?{...e,start:angleOf(e.center,p)}:role==='end'?{...e,end:angleOf(e.center,p)}:{...e,radius:Math.max(1e-9,dist(e.center,p))};
  case 'text':return {...e,at:p};
  case 'dim':return role==='a'?{...e,a:p}:role==='b'?{...e,b:p}:{...e,at:p};
 }
}

// ---- trim, extend, offset, explode -------------------------------------------------------------------------------
/** Pieces left when the part of e under p between its nearest cutting points is removed; [] erases e. */
export function trimEnt(e:Ent,p:Pt,others:Ent[],doc?:Pick<CadDoc,'display'|'realPerUnit'>):NewEnt[]|undefined{
 const cuts=others.filter(o=>o.id!==e.id).flatMap(o=>intersections(e,o,doc));
 const strip=({id:_,...rest}:Ent)=>rest as NewEnt;
 if(e.type==='line'){
  const v=sub(e.b,e.a),l2=dot(v,v);if(l2<1e-24)return undefined;
  const t=dot(sub(p,e.a),v)/l2,ts=cuts.map(q=>dot(sub(q,e.a),v)/l2).filter(u=>u>1e-9&&u<1-1e-9);
  const lo=Math.max(0,...ts.filter(u=>u<t)),hi=Math.min(1,...ts.filter(u=>u>t)),out:NewEnt[]=[];
  if(lo>1e-9)out.push({...strip(e),a:e.a,b:lerp(e.a,e.b,lo)} as NewEnt);
  if(hi<1-1e-9)out.push({...strip(e),a:lerp(e.a,e.b,hi),b:e.b} as NewEnt);
  return out;
 }
 if(e.type==='circle'||e.type==='arc'){
  const s0=e.type==='arc'?e.start:0,sw=e.type==='arc'?sweep(e.start,e.end):360,at=(q:Pt)=>norm360(angleOf(e.center,q)-s0);
  const t=at(p),ts=e.type==='circle'?cuts.map(at):cuts.map(at).filter(u=>u>1e-7&&u<sw-1e-7);
  if(e.type==='circle'){
   if(ts.length<2)return [];
   const sorted=[...new Set(ts.map(u=>+u.toFixed(9)))].sort((a,b)=>a-b),lo=[...sorted].reverse().find(u=>u<t)??sorted[sorted.length-1],hi=sorted.find(u=>u>t)??sorted[0];
   return [{type:'arc',layer:e.layer,center:e.center,radius:e.radius,start:hi,end:lo}];
  }
  const lo=Math.max(0,...ts.filter(u=>u<t)),hi=Math.min(sw,...ts.filter(u=>u>t)),out:NewEnt[]=[];
  if(lo>1e-7)out.push({...strip(e),start:e.start,end:e.start+lo} as NewEnt);
  if(hi<sw-1e-7)out.push({...strip(e),start:e.start+hi,end:e.end} as NewEnt);
  return out;
 }
 if(e.type==='poly'){
  // Chain parameter s: segment index plus fraction.
  const segs=segments(e),param=(q:Pt)=>{let best=0,bd=Infinity;segs.forEach(([a,b],i)=>{const n=nearestOnSegment(q,a,b),d=dist(q,n.point);if(d<bd){bd=d;best=i+n.t;}});return best;};
  const n=segs.length,s=param(p),ss=cuts.map(param).filter(u=>u>1e-9&&u<n-1e-9),pointAt=(u:number)=>{const i=Math.min(n-1,Math.floor(u));return lerp(segs[i][0],segs[i][1],u-i);};
  const chain=(from:number,to:number):Pt[]=>{const pts:Pt[]=[pointAt(from)];for(let i=Math.floor(from)+1;i<=Math.ceil(to)-1;i++)pts.push(segs[i%n][0]);pts.push(pointAt(to));return pts.filter((q,i,a)=>!i||!close(q,a[i-1],1e-12));};
  if(e.closed){
   const sorted=[...new Set(ss.map(u=>+u.toFixed(9)))].sort((a,b)=>a-b);if(sorted.length<2)return [];
   const lo=[...sorted].reverse().find(u=>u<s)??sorted[sorted.length-1],hi=sorted.find(u=>u>s)??sorted[0];
   const pts=hi<=lo?chain(hi,lo):[...chain(hi,n),...chain(0,lo).slice(1)];
   return [{type:'poly',layer:e.layer,closed:false,points:pts}];
  }
  const lo=Math.max(0,...ss.filter(u=>u<s)),hi=Math.min(n,...ss.filter(u=>u>s)),out:NewEnt[]=[];
  if(lo>1e-9)out.push({type:'poly',layer:e.layer,closed:false,points:chain(0,lo)});
  if(hi<n-1e-9)out.push({type:'poly',layer:e.layer,closed:false,points:chain(hi,n)});
  return out;
 }
 return undefined;
}
/** A line or open polyline with the end nearer p extended to the nearest boundary ahead of it. */
export function extendEnt(e:Ent,p:Pt,others:Ent[],doc?:Pick<CadDoc,'display'|'realPerUnit'>):Ent|undefined{
 let a:Pt,b:Pt,set:(q:Pt)=>Ent;
 if(e.type==='line'){const atB=dist(p,e.b)<dist(p,e.a);a=atB?e.a:e.b;b=atB?e.b:e.a;set=q=>atB?{...e,b:q}:{...e,a:q};}
 else if(e.type==='poly'&&!e.closed&&e.points.length>1){const pts=e.points,atEnd=dist(p,pts[pts.length-1])<dist(p,pts[0]);a=atEnd?pts[pts.length-2]:pts[1];b=atEnd?pts[pts.length-1]:pts[0];set=q=>{const n=[...pts];if(atEnd)n[n.length-1]=q;else n[0]=q;return {...e,points:n};};}
 else return undefined;
 const v=sub(b,a),l=len(v);if(l<1e-12)return undefined;
 let best=Infinity;
 for(const o of others){if(o.id===e.id||o.type==='text')continue;
  const k=curveOf(o);
  if(k){for(const t of segCircle(a,b,k.c,k.r,true))if(t>1+1e-9&&onCurve(k,lerp(a,b,t)))best=Math.min(best,t);}
  else for(const [c,d] of segments(o,doc)){const x=segSeg(a,b,c,d,true);if(x&&x.t>1+1e-9)best=Math.min(best,x.t);}
 }
 return best<Infinity?set(lerp(a,b,best)):undefined;
}
/** A copy offset by d toward the side of p. */
export function offsetEnt(e:Ent,d:number,p:Pt):NewEnt|undefined{
 const strip=({id:_,...rest}:Ent)=>rest as NewEnt;
 if(e.type==='line'){const v=sub(e.b,e.a),l=len(v);if(l<1e-12)return undefined;const n:Pt=[-v[1]/l,v[0]/l],s=Math.sign(dot(sub(p,e.a),n))||1;return {...strip(e),a:add(e.a,mul(n,d*s)),b:add(e.b,mul(n,d*s))} as NewEnt;}
 if(e.type==='circle'||e.type==='arc'){const r=e.radius+(dist(p,e.center)>e.radius?d:-d);return r>1e-9?{...strip(e),radius:r} as NewEnt:undefined;}
 if(e.type==='poly'){
  const segs=segments(e);if(!segs.length)return undefined;
  let bi=0,bd=Infinity;segs.forEach(([a,b],i)=>{const q=nearestOnSegment(p,a,b).point,dd=dist(p,q);if(dd<bd){bd=dd;bi=i;}});
  const [a0,b0]=segs[bi],v0=sub(b0,a0),side=Math.sign(cross(v0,sub(p,a0)))||1;
  const off=segs.map(([a,b])=>{const v=sub(b,a),l=len(v)||1,n:Pt=[-v[1]/l*d*side,v[0]/l*d*side];return [add(a,n),add(b,n)] as [Pt,Pt];});
  // Adjacent offset segments meet where their lines cross (a miter); parallel ones at the shared offset point.
  const join=(i:number,j:number):Pt=>{const r=sub(off[i][1],off[i][0]),q=sub(off[j][1],off[j][0]),den=cross(r,q);if(Math.abs(den)<1e-14)return off[i][1];return add(off[i][0],mul(r,cross(sub(off[j][0],off[i][0]),q)/den));};
  const pts:Pt[]=[];const n=off.length;
  if(e.closed&&e.points.length>2){for(let i=0;i<n;i++)pts.push(join((i-1+n)%n,i));}
  else{pts.push(off[0][0]);for(let i=1;i<n;i++)pts.push(join(i-1,i));pts.push(off[n-1][1]);}
  return {...strip(e),points:pts} as NewEnt;
 }
 return undefined;
}
/** Lines from a polyline; lines, arrowheads and text from a dimension. */
export function explodeEnt(e:Ent,doc:Pick<CadDoc,'display'|'realPerUnit'>):NewEnt[]|undefined{
 if(e.type==='poly')return segments(e).map(([a,b])=>({type:'line',layer:e.layer,a,b}));
 if(e.type==='dim'){const g=dimGeometry(e,doc);return [...g.lines.map(([a,b])=>({type:'line',layer:e.layer,a,b}) as NewEnt),...g.arrows.map(points=>({type:'solid',layer:e.layer,points}) as NewEnt),{type:'text',layer:e.layer,at:g.text.at,height:g.text.height,value:g.text.value,angle:g.text.angle,align:1,bold:false}];}
 return undefined;
}

// ---- coordinate entry --------------------------------------------------------------------------------------------
/** A number as drafters type it: 12, -3.5, 3/4, 1-1/2, 1 1/2, 2'6", 2'-6 1/2". */
export function parseLength(raw:string):number|undefined{
 const s=raw.trim().replace(/\s+/g,' ');if(!s)return undefined;
 const ft=/^(-)?(\d+(?:\.\d+)?)'(?:\s*-?\s*(.*?))?"?$/.exec(s);
 if(ft&&s.includes("'")){const inches=ft[3]?parseLength(ft[3].replace(/"$/,'')):0;if(inches===undefined)return undefined;const v=+ft[2]*12+inches;return ft[1]?-v:v;}
 const t=s.replace(/"$/,'');
 const mixed=/^(-)?(\d+)(?:[ -])(\d+)\/(\d+)$/.exec(t);if(mixed){const v=+mixed[2]+ +mixed[3]/ +mixed[4];return mixed[1]?-v:v;}
 const frac=/^(-)?(\d+)\/(\d+)$/.exec(t);if(frac&&+frac[3]){const v=+frac[2]/ +frac[3];return frac[1]?-v:v;}
 return /^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(t)?Number(t):undefined;
}
/**
 * A typed point: x,y (absolute), @dx,dy (relative to last), @d<a or d<a (polar, relative or from the origin), or a
 * bare distance along the direction from last to the cursor (direct distance entry).
 */
export function parsePoint(raw:string,last?:Pt,cursor?:Pt):Pt|undefined{
 const s=raw.trim();if(!s)return undefined;
 const rel=s.startsWith('@'),body=rel?s.slice(1):s,origin:Pt=rel?(last??[0,0]):[0,0];
 if(body.includes('<')){const [d,a]=body.split('<'),r=parseLength(d),deg=Number(a);if(r===undefined||!Number.isFinite(deg))return undefined;return polar(origin,r,deg);}
 if(body.includes(',')){const [x,y]=body.split(',').map(parseLength);if(x===undefined||y===undefined)return undefined;return [origin[0]+x,origin[1]+y];}
 if(!rel&&last&&cursor){const d=parseLength(body);if(d===undefined)return undefined;const v=sub(cursor,last),l=len(v);if(l<1e-12)return undefined;return add(last,mul(v,d/l));}
 return undefined;
}
