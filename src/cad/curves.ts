/**
 * Curve geometry beyond lines and circular arcs: polyline bulge segments, ellipses and B-splines. Angles in degrees,
 * counterclockwise from +x. Pure functions on plain points, used by the drawing model.
 */
type Pt=[number,number];
const DEG=Math.PI/180;
const sub=(a:Pt,b:Pt):Pt=>[a[0]-b[0],a[1]-b[1]],add=(a:Pt,b:Pt):Pt=>[a[0]+b[0],a[1]+b[1]],mul=(a:Pt,k:number):Pt=>[a[0]*k,a[1]*k];
const hyp=(a:Pt)=>Math.hypot(a[0],a[1]);

// ---- polyline bulges -----------------------------------------------------------------------------------------------
/** A bulge segment from a to b: bulge = tan(sweep/4), positive counterclockwise. */
export interface BulgeArc{c:Pt;r:number;a0:number;sweep:number}
export function bulgeArc(a:Pt,b:Pt,bulge:number):BulgeArc|undefined{
 if(Math.abs(bulge)<1e-12)return undefined;
 const ch=sub(b,a),L=hyp(ch);if(L<1e-12)return undefined;
 const th=4*Math.atan(bulge),d=L/2/Math.tan(th/2),n:Pt=[-ch[1]/L,ch[0]/L],c=add(add(a,mul(ch,.5)),mul(n,d));
 return {c,r:hyp(sub(a,c)),a0:Math.atan2(a[1]-c[1],a[0]-c[0])/DEG,sweep:th/DEG};
}
/** The bulge of the arc from a to b passing through m (0 if they are in line). */
export function bulgeThrough(a:Pt,m:Pt,b:Pt){
 const cr=(b[0]-a[0])*(m[1]-a[1])-(b[1]-a[1])*(m[0]-a[0]);
 const ch=hyp(sub(b,a));if(ch<1e-12)return 0;
 // The inscribed angle at m is half the arc's complement: bulge = tan(sweep/4), sweep = 2(pi - angle at m).
 const u=sub(a,m),v=sub(b,m),ang=Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/(hyp(u)*hyp(v)||1))));
 if(Math.abs(cr)<1e-14*ch*ch)return 0;
 const sweep=2*(Math.PI-ang);return Math.tan(sweep/4)*(cr>0?-1:1);
}
/** The bulge of a sub-arc covering fraction f of a bulge segment. */
export const subBulge=(bulge:number,f:number)=>Math.tan(Math.atan(bulge)*f);
/** The bulge of the arc leaving a tangent to direction dir (degrees) and ending at b. */
export function bulgeTangent(a:Pt,dirDeg:number,b:Pt){
 const ch=sub(b,a),chAng=Math.atan2(ch[1],ch[0])/DEG;let d=chAng-dirDeg;d=((d+540)%360)-180;
 return Math.tan(d*DEG/2);
}
export const bulgePoint=(a:Pt,b:Pt,bulge:number,f:number):Pt=>{
 const k=bulgeArc(a,b,bulge);if(!k)return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
 const t=(k.a0+k.sweep*f)*DEG;return [k.c[0]+k.r*Math.cos(t),k.c[1]+k.r*Math.sin(t)];
};

// ---- ellipses ------------------------------------------------------------------------------------------------------
/** center, major axis vector (center to the end of the major axis), ratio minor/major, parameters start..end (degrees). */
export interface EllipseGeom{center:Pt;major:Pt;ratio:number;start:number;end:number}
export const minorOf=(e:EllipseGeom):Pt=>[-e.major[1]*e.ratio,e.major[0]*e.ratio];
export function ellipsePoint(e:EllipseGeom,tDeg:number):Pt{
 const t=tDeg*DEG,m=minorOf(e),c=Math.cos(t),s=Math.sin(t);
 return [e.center[0]+e.major[0]*c+m[0]*s,e.center[1]+e.major[1]*c+m[1]*s];
}
export function ellipseTangent(e:EllipseGeom,tDeg:number):Pt{const t=tDeg*DEG,m=minorOf(e);return [-e.major[0]*Math.sin(t)+m[0]*Math.cos(t),-e.major[1]*Math.sin(t)+m[1]*Math.cos(t)];}
/** The parameter of the ellipse point nearest p (sampled, then refined by Newton steps). */
export function ellipseParam(e:EllipseGeom,p:Pt){
 let best=0,bd=Infinity;
 for(let i=0;i<72;i++){const t=i*5,q=ellipsePoint(e,t),d=hyp(sub(q,p));if(d<bd){bd=d;best=t;}}
 let t=best*DEG;const M=e.major,m=minorOf(e);
 for(let k=0;k<12;k++){
  const c=Math.cos(t),s=Math.sin(t),q:Pt=[e.center[0]+M[0]*c+m[0]*s-p[0],e.center[1]+M[1]*c+m[1]*s-p[1]];
  const d1:Pt=[-M[0]*s+m[0]*c,-M[1]*s+m[1]*c],d2:Pt=[-M[0]*c-m[0]*s,-M[1]*c-m[1]*s];
  const f=q[0]*d1[0]+q[1]*d1[1],fp=d1[0]*d1[0]+d1[1]*d1[1]+q[0]*d2[0]+q[1]*d2[1];
  if(Math.abs(fp)<1e-18)break;const dt=f/fp;t-=dt;if(Math.abs(dt)<1e-13)break;
 }
 return ((t/DEG)%360+360)%360;
}
/** The parameter of an ellipse point at a polar angle from the center (for start and end angles typed by the user). */
export function ellipseParamAtAngle(e:EllipseGeom,deg:number){
 const rot=Math.atan2(e.major[1],e.major[0]),a=deg*DEG-rot;
 return ((Math.atan2(Math.sin(a),e.ratio*Math.cos(a))/DEG)%360+360)%360;
}

// ---- B-splines -----------------------------------------------------------------------------------------------------
export interface SplineGeom{degree:number;ctrl:Pt[];knots:number[]}
function span(s:SplineGeom,u:number){
 const {degree:p,knots:U}=s,n=s.ctrl.length-1;
 if(u>=U[n+1])return n;if(u<=U[p])return p;
 let lo=p,hi=n+1;while(hi-lo>1){const m=(lo+hi)>>1;if(u<U[m])hi=m;else lo=m;}
 return lo;
}
/** de Boor evaluation at knot parameter u. */
export function splinePoint(s:SplineGeom,u:number):Pt{
 const p=s.degree,U=s.knots,k=span(s,u),d:Pt[]=[];
 for(let j=0;j<=p;j++)d.push([...s.ctrl[j+k-p]]);
 for(let r=1;r<=p;r++)for(let j=p;j>=r;j--){
  const i=j+k-p,den=U[i+p-r+1]-U[i],a=den<1e-14?0:(u-U[i])/den;
  d[j]=[(1-a)*d[j-1][0]+a*d[j][0],(1-a)*d[j-1][1]+a*d[j][1]];
 }
 return d[p];
}
export const splineRange=(s:SplineGeom):[number,number]=>[s.knots[s.degree],s.knots[s.ctrl.length]];
/** Sample parameters: n per non-empty knot span. */
export function splineParams(s:SplineGeom,n=24){
 const [u0,u1]=splineRange(s),out:number[]=[u0];
 const ks=[...new Set(s.knots.filter(k=>k>=u0&&k<=u1))].sort((a,b)=>a-b);
 for(let i=1;i<ks.length;i++)for(let j=1;j<=n;j++)out.push(ks[i-1]+(ks[i]-ks[i-1])*j/n);
 return out;
}
/** Insert knot u once (Boehm). */
function insertKnot(s:SplineGeom,u:number):SplineGeom{
 const p=s.degree,U=s.knots,k=span(s,u),P=s.ctrl,Q:Pt[]=[];
 for(let i=0;i<=k-p;i++)Q.push(P[i]);
 for(let i=k-p+1;i<=k;i++){const den=U[i+p]-U[i],a=den<1e-14?0:(u-U[i])/den;Q.push([(1-a)*P[i-1][0]+a*P[i][0],(1-a)*P[i-1][1]+a*P[i][1]]);}
 for(let i=k;i<P.length;i++)Q.push(P[i]);
 return {degree:p,ctrl:Q,knots:[...U.slice(0,k+1),u,...U.slice(k+1)]};
}
/** The spline split at parameter u into the parts before and after (either may be undefined at the ends). */
export function splitSpline(s:SplineGeom,u:number):[SplineGeom|undefined,SplineGeom|undefined]{
 const [u0,u1]=splineRange(s);if(u<=u0+1e-12)return [undefined,s];if(u>=u1-1e-12)return [s,undefined];
 const p=s.degree;let t=s;const mult=()=>t.knots.filter(k=>Math.abs(k-u)<1e-12).length;
 while(mult()<p+1)t=insertKnot(t,u);
 const first=t.knots.findIndex(k=>Math.abs(k-u)<1e-12),U=t.knots;
 // Knots u repeated p+1 times at indices first..first+p; control point first-1 ends the left part.
 const left:SplineGeom={degree:p,ctrl:t.ctrl.slice(0,first),knots:[...U.slice(0,first+p+1)]};
 const right:SplineGeom={degree:p,ctrl:t.ctrl.slice(first),knots:[...U.slice(first)]};
 return [left.ctrl.length>p?left:undefined,right.ctrl.length>p?right:undefined];
}
export const subSpline=(s:SplineGeom,u0:number,u1:number)=>{const r=splitSpline(s,u0)[1];return r?splitSpline(r,u1)[0]:undefined;};
/**
 * A cubic spline through the fit points: Bessel tangents (chord-weighted), the Bezier spans written as a B-spline with
 * triple interior knots. Closed splines wrap around.
 */
export function splineThrough(fit:Pt[],closed:boolean):SplineGeom|undefined{
 const P=closed&&fit.length>2?[...fit,fit[0]]:fit,n=P.length-1;if(n<1)return undefined;
 if(n===1)return {degree:1,ctrl:[P[0],P[1]],knots:[0,0,1,1]};
 const d=P.slice(1).map((q,i)=>Math.max(1e-12,hyp(sub(q,P[i])))),unit=(i:number)=>mul(sub(P[i+1],P[i]),1/d[i]);
 const tan=(i:number):Pt=>{
  if(closed){const ip=i===0?n-1:i-1,ii=i===n?0:i,dp=d[ip],dn=d[ii],up=unit(ip),un=unit(ii);return mul(add(mul(up,dn),mul(un,dp)),1/(dp+dn));}
  if(i===0){const u=unit(0),v=unit(1>n-1?0:1);return n>1?norm(sub(mul(u,2),v)):u;}
  if(i===n){const u=unit(n-1),v=unit(n-2<0?0:n-2);return n>1?norm(sub(mul(u,2),v)):u;}
  const dp=d[i-1],dn=d[i];return mul(add(mul(unit(i-1),dn),mul(unit(i),dp)),1/(dp+dn));
 };
 const ctrl:Pt[]=[P[0]],knots=[0,0,0,0];
 for(let i=0;i<n;i++){const t0=tan(i),t1=tan(i+1);ctrl.push(add(P[i],mul(t0,d[i]/3)),sub(P[i+1],mul(t1,d[i]/3)),P[i+1]);knots.push(...(i<n-1?[i+1,i+1,i+1]:[n,n,n,n]));}
 return {degree:3,ctrl,knots};
}
const norm=(v:Pt):Pt=>{const l=hyp(v)||1;return [v[0]/l,v[1]/l];};
/** The parameter of the spline point nearest p (sampled, then refined by bisection on the neighbors). */
export function splineParam(s:SplineGeom,p:Pt){
 const us=splineParams(s,32);let bi=0,bd=Infinity;
 us.forEach((u,i)=>{const d=hyp(sub(splinePoint(s,u),p));if(d<bd){bd=d;bi=i;}});
 let lo=us[Math.max(0,bi-1)],hi=us[Math.min(us.length-1,bi+1)];
 for(let k=0;k<40;k++){const a=lo+(hi-lo)/3,b=hi-(hi-lo)/3;if(hyp(sub(splinePoint(s,a),p))<hyp(sub(splinePoint(s,b),p)))hi=b;else lo=a;}
 return (lo+hi)/2;
}
