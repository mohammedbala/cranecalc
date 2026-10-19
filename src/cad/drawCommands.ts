import {bulgeArc,bulgeTangent,ellipseParamAtAngle,splineThrough,type SplineGeom} from './curves';
import {
 DEG,add,angleOf,arcPoint,dist,len,mid,mul,norm360,polar,sub,sweep,type EllipseEnt,type Ent,type NewEnt,type Pt,
} from './model';
import {angleText,fmtAngle,isKey,key,lockedPick,num,type Command,type Env} from './cmdkit';

/** The circle through three points as an arc from p1 through p2 to p3. */
export function arcThrough(p1:Pt,p2:Pt,p3:Pt):{center:Pt;radius:number;start:number;end:number}|undefined{
 const d=2*(p1[0]*(p2[1]-p3[1])+p2[0]*(p3[1]-p1[1])+p3[0]*(p1[1]-p2[1]));if(Math.abs(d)<1e-12)return undefined;
 const s1=p1[0]**2+p1[1]**2,s2=p2[0]**2+p2[1]**2,s3=p3[0]**2+p3[1]**2;
 const center:Pt=[(s1*(p2[1]-p3[1])+s2*(p3[1]-p1[1])+s3*(p1[1]-p2[1]))/d,(s1*(p3[0]-p2[0])+s2*(p1[0]-p3[0])+s3*(p2[0]-p1[0]))/d];
 const a1=angleOf(center,p1),a2=angleOf(center,p2),a3=angleOf(center,p3);
 // Counterclockwise from p1 to p3 if p2 lies on that sweep, otherwise from p3 to p1.
 const ccw=sweep(a1,a2)<=sweep(a1,a3);
 return {center,radius:dist(center,p1),start:ccw?a1:a3,end:ccw?a3:a1};
}
type ArcGeom={center:Pt;radius:number;start:number;end:number};
/** The arc from s to e with the given bulge (positive counterclockwise). */
export function arcByBulge(s:Pt,e:Pt,bulge:number):ArcGeom|undefined{
 const k=bulgeArc(s,e,bulge);if(!k)return undefined;
 return k.sweep>0?{center:k.c,radius:k.r,start:norm360(k.a0),end:norm360(k.a0+k.sweep)}:{center:k.c,radius:k.r,start:norm360(k.a0+k.sweep),end:norm360(k.a0)};
}
/** An arc from its center and start, counterclockwise through the included angle (clockwise when negative). */
export function arcByAngle(c:Pt,s:Pt,included:number):ArcGeom|undefined{
 if(Math.abs(included)<1e-9||dist(c,s)<1e-12)return undefined;const a=angleOf(c,s),inc=Math.max(-359.999,Math.min(359.999,included));
 return inc>0?{center:c,radius:dist(c,s),start:norm360(a),end:norm360(a+inc)}:{center:c,radius:dist(c,s),start:norm360(a+inc),end:norm360(a)};
}
/** The end of the last line or arc drawn and the direction of travel there (ARC continue). */
function lastTangent(env:Env):{p:Pt;dir:number}|undefined{
 for(let i=env.store.doc.entities.length-1;i>=0;i--){
  const e=env.store.doc.entities[i];
  if(e.type==='line')return {p:e.b,dir:angleOf(e.a,e.b)};
  if(e.type==='arc')return {p:arcPoint(e,e.end),dir:e.end+90};
  if(e.type==='poly'&&!e.closed&&e.points.length>1){const n=e.points.length,b=e.bulges?.[n-2]??0,a=e.points[n-2],z=e.points[n-1];return {p:z,dir:angleOf(a,z)+(b?4*Math.atan(b)/DEG/2:0)};}
 }
 return undefined;
}

// ---- ARC with the AutoCAD variants ------------------------------------------------------------------------------
function arcCmd(env:Env):Command{
 type Step='start'|'second'|'end3'|'center'|'cEnd'|'eEnd'|'eHow'|'cFirst'|'cStart'|'contEnd'|'angle'|'chord'|'radius'|'dir';
 let step:Step='start',s:Pt|undefined,m:Pt|undefined,c:Pt|undefined,e:Pt|undefined,tan:number|undefined,via:'center'|'end'='center';
 const layer=()=>env.layer();
 const make=(g:ArcGeom|undefined)=>{if(g&&g.radius>1e-12)env.store.commit('Arc',{add:[{type:'arc',layer:layer(),...g}]});else env.log('No arc fits those points.');cmd.done=true;};
 const arcEnt=(g:ArcGeom|undefined):NewEnt[]|undefined=>g?[{type:'arc',layer:layer(),...g} as NewEnt]:undefined;
 // The arc each step would draw with the cursor at q.
 const at=(q:Pt):ArcGeom|undefined=>{
  switch(step){
   case 'end3':return arcThrough(s!,m!,q);
   case 'cEnd':return c&&dist(c,s!)>1e-12?{center:c,radius:dist(c,s!),start:norm360(angleOf(c,s!)),end:norm360(angleOf(c,q))}:undefined;
   case 'eHow':return dist(q,s!)>1e-12?{center:q,radius:dist(q,s!),start:norm360(angleOf(q,s!)),end:norm360(angleOf(q,e!))}:undefined;
   case 'contEnd':return arcByBulge(s!,q,bulgeTangent(s!,tan!,q));
   case 'dir':return arcByBulge(s!,e!,bulgeTangent(s!,angleOf(s!,q),e!));
   case 'angle':return via==='center'?arcByAngle(c!,s!,norm360(angleOf(c!,q)-angleOf(c!,s!))):arcByBulge(s!,e!,Math.tan(norm360(angleOf(s!,q))*DEG/4));
  }
  return undefined;
 };
 const cmd:Command={name:'ARC',done:false,
  prompt:()=>({start:'ARC Specify start point of arc or [Center] <continue from the last line or arc>:',second:'ARC Specify second point of arc or [Center/End]:',end3:'ARC Specify end point of arc:',
   center:'ARC Specify center point of arc:',cEnd:'ARC Specify end point of arc or [Angle/chord Length]:',eEnd:'ARC Specify end point of arc:',eHow:'ARC Specify center point of arc or [Angle/Direction/Radius]:',
   cFirst:'ARC Specify center point of arc:',cStart:'ARC Specify start point of arc:',contEnd:'ARC Specify end point of arc (tangent to the last line or arc):',
   angle:'ARC Specify included angle (+ counterclockwise):',chord:'ARC Specify length of chord:',radius:'ARC Specify radius of arc (negative for the major arc):',dir:'ARC Specify tangent direction for the start point of arc:'} as Record<Step,string>)[step],
  base:()=>step==='cStart'||step==='cEnd'||step==='angle'&&via==='center'?c:step==='eHow'||step==='dir'||step==='radius'?e:s,
  point(p){
   switch(step){
    case 'start':s=p;step='second';break;
    case 'second':m=p;step='end3';break;
    case 'end3':make(arcThrough(s!,m!,p));break;
    case 'center':c=p;step='cEnd';break;
    case 'cFirst':c=p;step='cStart';break;
    case 'cStart':s=p;step='cEnd';break;
    case 'cEnd':make(at(p));break;
    case 'eEnd':e=p;step='eHow';break;
    case 'eHow':make(at(p));break;
    case 'contEnd':make(at(p));break;
    case 'dir':make(at(p));break;
    case 'angle':make(at(p));break;
    case 'chord':make(chord(dist(s!,p)));break;
    case 'radius':make(radius(dist(e!,p)));break;
   }
  },
  text(t){
   if(step==='start'&&isKey(t,'Center')){step='cFirst';return true;}
   if(step==='second'&&isKey(t,'Center')){step='center';return true;}
   if(step==='second'&&isKey(t,'End')){step='eEnd';return true;}
   if(step==='cEnd'&&isKey(t,'Angle')){via='center';step='angle';return true;}
   if(step==='cEnd'&&isKey(t,'chord Length')){step='chord';return true;}
   if(step==='eHow'&&isKey(t,'Angle')){via='end';step='angle';return true;}
   if(step==='eHow'&&isKey(t,'Direction')){step='dir';return true;}
   if(step==='eHow'&&isKey(t,'Radius')){step='radius';return true;}
   if(step==='angle'){const v=angleText(t);if(v===undefined)return false;make(via==='center'?arcByAngle(c!,s!,v):arcByBulge(s!,e!,Math.tan(v*DEG/4)));return true;}
   if(step==='dir'){const v=angleText(t);if(v===undefined)return false;make(arcByBulge(s!,e!,bulgeTangent(s!,v,e!)));return true;}
   if(step==='chord'){const v=num(t);if(v===undefined)return false;make(chord(v));return true;}
   if(step==='radius'){const v=num(t);if(v===undefined)return false;make(radius(v));return true;}
   return false;
  },
  enter(){if(step==='start'){const l=lastTangent(env);if(!l){env.log('No line or arc to continue from.');cmd.done=true;return;}s=l.p;tan=l.dir;step='contEnd';return;}cmd.done=true;},
  preview(q){
   const g=at(q);if(g)return {ents:arcEnt(g),tip:`R ${env.length(g.radius)}`};
   if(step==='second'||step==='center'||step==='eEnd'||step==='cStart')return {rubber:[step==='cStart'?c!:s!,q]};
   if(step==='chord'||step==='radius')return {rubber:[step==='chord'?s!:e!,q],tip:env.length(dist(step==='chord'?s!:e!,q))};
   return undefined;
  }};
 const chord=(l:number)=>{const r=dist(c!,s!);if(l<=0||l>2*r){env.log('The chord is longer than the diameter.');return undefined;}return arcByAngle(c!,s!,2*Math.asin(l/(2*r))/DEG);};
 const radius=(r:number)=>{const ch=dist(s!,e!);if(Math.abs(r)<ch/2-1e-12){env.log('The radius is less than half the chord.');return undefined;}const th=2*Math.asin(Math.min(1,ch/(2*Math.abs(r))))/DEG;return arcByBulge(s!,e!,Math.tan((r<0?360-th:th)*DEG/4));};
 return cmd;
}

// ---- ELLIPSE -------------------------------------------------------------------------------------------------------
/** An ellipse from its center, the end of one axis and the half-length of the other (the longer becomes the major axis). */
export function ellipseFrom(c:Pt,axisEnd:Pt,other:number):Omit<EllipseEnt,'id'|'layer'>|undefined{
 const a=sub(axisEnd,c),la=len(a);if(la<1e-12||other<1e-12)return undefined;
 if(other<=la)return {type:'ellipse',center:c,major:a,ratio:other/la,start:0,end:360};
 return {type:'ellipse',center:c,major:[-a[1]/la*other,a[0]/la*other],ratio:la/other,start:0,end:360};
}
function ellipseCmd(env:Env):Command{
 type Step='first'|'second'|'other'|'center'|'axis'|'start'|'end'|'rotation';
 let step:Step='first',arc=false,centered=false,p1:Pt|undefined,p2:Pt|undefined,c:Pt|undefined,g:Omit<EllipseEnt,'id'|'layer'>|undefined,a0=0;
 const axisDir=()=>angleOf(c!,p1!);
 const finish=(e:Omit<EllipseEnt,'id'|'layer'>|undefined)=>{if(!e){env.log('An ellipse needs two axes.');cmd.done=true;return;}if(!arc){env.store.commit('Ellipse',{add:[{...e,layer:env.layer()}]});cmd.done=true;return;}g=e;step='start';};
 const shape=(q:Pt)=>{const axisEnd=centered?p1!:p2!,ax=sub(axisEnd,c!),la=len(ax)||1,n:Pt=[-ax[1]/la,ax[0]/la];return ellipseFrom(c!,axisEnd,Math.abs((q[0]-c![0])*n[0]+(q[1]-c![1])*n[1])||dist(c!,q));};
 const param=(deg:number)=>ellipseParamAtAngle(g as EllipseEnt,axisDir()+deg);
 const cmd:Command={name:'ELLIPSE',done:false,
  prompt:()=>({first:`ELLIPSE Specify axis endpoint of ${arc?'elliptical arc':'ellipse'} or [${arc?'':'Arc/'}Center]:`,second:'ELLIPSE Specify other endpoint of axis:',center:'ELLIPSE Specify center of ellipse:',axis:'ELLIPSE Specify endpoint of axis:',
   other:'ELLIPSE Specify distance to other axis or [Rotation]:',rotation:'ELLIPSE Specify rotation around major axis:',start:'ELLIPSE Specify start angle:',end:'ELLIPSE Specify end angle or [Included angle]:'} as Record<Step,string>)[step],
  base:()=>step==='second'?p1:step==='axis'||step==='other'||step==='start'||step==='end'?c:undefined,
  point(p){
   switch(step){
    case 'first':p1=p;step='second';break;
    case 'second':p2=p;c=mid(p1!,p2);step='other';break;
    case 'center':c=p;step='axis';break;
    case 'axis':p1=p;step='other';break;
    case 'other':finish(shape(p));break;
    case 'start':a0=norm360(angleOf(c!,p)-axisDir());step='end';break;
    case 'end':end(norm360(angleOf(c!,p)-axisDir()));break;
   }
  },
  text(t){
   if(step==='first'&&!arc&&isKey(t,'Arc')){arc=true;return true;}
   if(step==='first'&&isKey(t,'Center')){centered=true;step='center';return true;}
   if(step==='other'&&isKey(t,'Rotation')){step='rotation';return true;}
   if(step==='other'){const v=num(t);if(v===undefined)return false;const axisEnd=centered?p1!:p2!;finish(ellipseFrom(c!,axisEnd,v));return true;}
   if(step==='rotation'){const v=angleText(t);if(v===undefined||Math.abs(v)>=89.4)return false;const axisEnd=centered?p1!:p2!;finish(ellipseFrom(c!,axisEnd,dist(c!,axisEnd)*Math.cos(v*DEG)));return true;}
   if(step==='start'){const v=angleText(t);if(v===undefined)return false;a0=v;step='end';return true;}
   if(step==='end'&&isKey(t,'Included angle')){incl=true;return true;}
   if(step==='end'){const v=angleText(t);if(v===undefined)return false;end(incl?a0+v:v);return true;}
   return false;
  },
  preview(q){
   if(step==='second'||step==='axis')return {rubber:[step==='second'?p1!:c!,q],tip:env.length(dist(step==='second'?p1!:c!,q))};
   if(step==='other'){const e=shape(q);return e?{ents:[{...e,layer:env.layer()}],rubber:[c!,q]}:undefined;}
   if(step==='start')return {ents:[{...g!,layer:env.layer()}],rubber:[c!,q],tip:fmtAngle(angleOf(c!,q)-axisDir())};
   if(step==='end')return {ents:[{...g!,layer:env.layer(),start:param(a0),end:param(norm360(angleOf(c!,q)-axisDir()))}],rubber:[c!,q],tip:fmtAngle(angleOf(c!,q)-axisDir()-a0)};
   return undefined;
  }};
 let incl=false;
 const end=(deg:number)=>{env.store.commit('Elliptical arc',{add:[{...g!,layer:env.layer(),start:param(a0),end:param(deg)}]});cmd.done=true;};
 return cmd;
}

// ---- SPLINE --------------------------------------------------------------------------------------------------------
/** A clamped uniform B-spline with the points as its control vertices. */
export function splineByControl(ctrl:Pt[],degree=3):SplineGeom|undefined{
 const n=ctrl.length;if(n<2)return undefined;const p=Math.min(degree,n-1),knots:number[]=[];
 for(let i=0;i<=n+p;i++)knots.push(i<=p?0:i>=n?n-p:i-p);
 return {degree:p,ctrl:[...ctrl],knots};
}
function splineCmd(env:Env):Command{
 const pts:Pt[]=[];let cv=false;
 const geom=(list:Pt[],closed:boolean)=>cv?splineByControl(closed?[...list,list[0]]:list):splineThrough(list,closed);
 const make=(closed:boolean)=>{
  const g=pts.length>=(closed?3:2)?geom(pts,closed):undefined;
  if(g)env.store.commit('Spline',{add:[{type:'spline',layer:env.layer(),...g,...(cv?{}:{fit:[...pts]}),closed}]});
  cmd.done=true;
 };
 const cmd:Command={name:'SPLINE',done:false,
  prompt:()=>!pts.length?`SPLINE Specify first point or [Method] (${cv?'control vertices':'fit points'}):`:`SPLINE Enter next point or [Undo${pts.length>=3?'/Close':''}]:`,
  base:()=>pts[pts.length-1],point(p){pts.push(p);},
  text(t){
   if(!pts.length&&isKey(t,'Method')){cv=!cv;env.log(cv?'Splines by control vertices.':'Splines through fit points.');return true;}
   if(isKey(t,'Undo')&&pts.length){pts.pop();return true;}
   if(isKey(t,'Close')&&pts.length>=3){make(true);return true;}
   return false;
  },
  enter(){make(false);},
  preview(q){if(!pts.length)return undefined;const g=geom([...pts,q],false);return g?{ents:[{type:'spline',layer:env.layer(),...g,closed:false}],tip:env.length(dist(pts[pts.length-1],q))}:undefined;}};
 return cmd;
}

// ---- XLINE and RAY ---------------------------------------------------------------------------------------------------
const unit=(v:Pt):Pt=>{const l=len(v)||1;return [v[0]/l,v[1]/l];};
function xlineCmd(env:Env):Command{
 type Step='first'|'through'|'angle'|'bisVertex'|'bisStart'|'bisEnd'|'offDist'|'offPick'|'offSide';
 let step:Step='first',root:Pt|undefined,fixed:Pt|undefined,vertex:Pt|undefined,start:Pt|undefined,d=env.offsetDistance(),target:Ent|undefined;
 const add1=(base:Pt,dir:Pt)=>{if(len(dir)<1e-12)return;env.store.commit('Construction line',{add:[{type:'xline',layer:env.layer(),base,dir:unit(dir)}]});};
 const cmd:Command={name:'XLINE',done:false,
  prompt:()=>({first:'XLINE Specify a point or [Hor/Ver/Ang/Bisect/Offset]:',through:'XLINE Specify through point:',angle:'XLINE Enter angle of xline (0) or [Reference]:',
   bisVertex:'XLINE Specify angle vertex point:',bisStart:'XLINE Specify angle start point:',bisEnd:'XLINE Specify angle end point:',
   offDist:`XLINE Specify offset distance${d!==undefined?` <${env.length(d)}>`:''}:`,offPick:'XLINE Select a line object:',offSide:'XLINE Specify side to offset:'} as Record<Step,string>)[step],
  base:()=>step==='through'&&!fixed?root:step==='bisStart'||step==='bisEnd'?vertex:undefined,
  wantsPick:()=>step==='offPick',
  pick(e){if(!e||lockedPick(env,e))return;if(e.type!=='line'&&e.type!=='xline'&&e.type!=='ray'){env.log('Select a line or construction line.');return;}target=e;step='offSide';},
  point(p){
   switch(step){
    case 'first':root=p;step='through';break;
    case 'through':if(fixed)add1(p,fixed);else add1(root!,sub(p,root!));break;
    case 'bisVertex':vertex=p;step='bisStart';break;
    case 'bisStart':start=p;step='bisEnd';break;
    case 'bisEnd':{const a=unit(sub(start!,vertex!)),b=unit(sub(p,vertex!));let dir=add(a,b);if(len(dir)<1e-9)dir=[-a[1],a[0]];add1(vertex!,dir);break;}
    case 'offSide':{
     const t=target!,base=t.type==='line'?t.a:t.type==='xline'||t.type==='ray'?t.base:[0,0] as Pt,dir=t.type==='line'?unit(sub(t.b,t.a)):t.type==='xline'||t.type==='ray'?t.dir:[1,0] as Pt;
     const n:Pt=[-dir[1],dir[0]],sgn=Math.sign((p[0]-base[0])*n[0]+(p[1]-base[1])*n[1])||1;add1(add(base,mul(n,d!*sgn)),dir);step='offPick';break;
    }
   }
  },
  text(t){
   if(step==='first'){
    if(isKey(t,'Hor')){fixed=[1,0];step='through';return true;}
    if(isKey(t,'Ver')){fixed=[0,1];step='through';return true;}
    if(isKey(t,'Ang')){step='angle';return true;}
    if(isKey(t,'Bisect')){step='bisVertex';return true;}
    if(isKey(t,'Offset')){step='offDist';return true;}
   }
   if(step==='angle'){const v=angleText(t);if(v===undefined)return false;fixed=polar([0,0],1,v);step='through';return true;}
   if(step==='offDist'){const v=num(t);if(v===undefined||v<=0)return false;d=v;env.setOffsetDistance(v);step='offPick';return true;}
   return false;
  },
  enter(){if(step==='offDist'&&d!==undefined){step='offPick';return;}cmd.done=true;},
  preview(q){
   if(step==='through'){const dir=fixed??sub(q,root!);return len(dir)>1e-12?{ents:[{type:'xline',layer:env.layer(),base:fixed?q:root!,dir:unit(dir)}]}:undefined;}
   if(step==='bisEnd'){const a=unit(sub(start!,vertex!)),b=unit(sub(q,vertex!)),dir=add(a,b);return len(dir)>1e-9?{ents:[{type:'xline',layer:env.layer(),base:vertex!,dir:unit(dir)}]}:undefined;}
   return undefined;
  }};
 return cmd;
}
function rayCmd(env:Env):Command{
 let s:Pt|undefined;
 const cmd:Command={name:'RAY',done:false,prompt:()=>s?'RAY Specify through point:':'RAY Specify start point:',base:()=>s,
  point(p){if(!s){s=p;return;}if(dist(s,p)>1e-12)env.store.commit('Ray',{add:[{type:'ray',layer:env.layer(),base:s,dir:unit(sub(p,s))}]});},
  enter(){cmd.done=true;},
  preview:q=>s&&dist(s,q)>1e-12?{ents:[{type:'ray',layer:env.layer(),base:s,dir:unit(sub(q,s))}]}:undefined};
 return cmd;
}

// ---- POLYGON -------------------------------------------------------------------------------------------------------
/** Vertices of a regular polygon: inscribed (a vertex at p) or circumscribed (a side's midpoint at p). */
export function polygonPoints(n:number,c:Pt,p:Pt,inscribed:boolean):Pt[]{
 const r=dist(c,p),a=angleOf(c,p),R=inscribed?r:r/Math.cos(Math.PI/n),a0=inscribed?a:a+180/n;
 return Array.from({length:n},(_,i)=>polar(c,R,a0+360*i/n));
}
export function polygonOnEdge(n:number,a:Pt,b:Pt):Pt[]{
 const pts:Pt[]=[a,b],ext=360/n;let dir=angleOf(a,b);const side=dist(a,b);
 for(let i=2;i<n;i++){dir+=ext;pts.push(polar(pts[i-1],side,dir));}
 return pts;
}
function polygonCmd(env:Env):Command{
 type Step='sides'|'center'|'mode'|'radius'|'edge1'|'edge2';
 let step:Step='sides',n=Math.round(+(env.vars.POLYSIDES??4))||4,c:Pt|undefined,a:Pt|undefined,inscribed=env.vars.POLYMODE!=='C';
 const make=(pts:Pt[])=>{env.store.commit('Polygon',{add:[{type:'poly',layer:env.layer(),points:pts,closed:true}]});cmd.done=true;};
 const cmd:Command={name:'POLYGON',done:false,
  prompt:()=>({sides:`POLYGON Enter number of sides <${n}>:`,center:'POLYGON Specify center of polygon or [Edge]:',mode:`POLYGON Enter an option [Inscribed in circle/Circumscribed about circle] <${inscribed?'I':'C'}>:`,
   radius:'POLYGON Specify radius of circle:',edge1:'POLYGON Specify first endpoint of edge:',edge2:'POLYGON Specify second endpoint of edge:'} as Record<Step,string>)[step],
  base:()=>step==='radius'?c:step==='edge2'?a:undefined,
  point(p){
   if(step==='sides')return;
   if(step==='center'){c=p;step='mode';return;}
   if(step==='radius'){if(dist(c!,p)>1e-12)make(polygonPoints(n,c!,p,inscribed));return;}
   if(step==='edge1'){a=p;step='edge2';return;}
   if(step==='edge2'&&dist(a!,p)>1e-12)make(polygonOnEdge(n,a!,p));
  },
  text(t){
   if(step==='sides'){const v=Number(t);if(!Number.isInteger(v)||v<3||v>1024)return false;n=v;env.vars.POLYSIDES=v;step='center';return true;}
   if(step==='center'&&isKey(t,'Edge')){step='edge1';return true;}
   if(step==='mode'&&(isKey(t,'Inscribed in circle')||isKey(t,'Circumscribed about circle'))){inscribed=key(t)[0]==='I';env.vars.POLYMODE=inscribed?'I':'C';step='radius';return true;}
   if(step==='radius'){const v=num(t);if(v===undefined||v<=0)return false;make(polygonPoints(n,c!,add(c!,[v,0]),inscribed));return true;}
   return false;
  },
  enter(){if(step==='sides'){step='center';return;}if(step==='mode'){step='radius';return;}cmd.done=true;},
  preview(q){
   if(step==='radius'&&dist(c!,q)>1e-12)return {ents:[{type:'poly',layer:env.layer(),points:polygonPoints(n,c!,q,inscribed),closed:true}],rubber:[c!,q],tip:env.length(dist(c!,q))};
   if(step==='edge2'&&dist(a!,q)>1e-12)return {ents:[{type:'poly',layer:env.layer(),points:polygonOnEdge(n,a!,q),closed:true}]};
   return undefined;
  }};
 return cmd;
}

// ---- DONUT: a filled ring or dot ---------------------------------------------------------------------------------
function donutCmd(env:Env):Command{
 let step:'inner'|'outer'|'center'='inner',inner=+(env.vars.DONUTID??0),outer=+(env.vars.DONUTOD??(env.store.doc.unit==='in'?.0625:env.store.doc.unit==='mm'?1.5:4));
 const ring=(c:Pt):NewEnt[]=>{
  const r0=inner/2,r1=outer/2,list:NewEnt[]=[];
  // Filled as wedges between the two circles (a dot when the inside diameter is 0).
  const n=36;for(let i=0;i<n;i++){const a=360*i/n,b=360*(i+1)/n;list.push({type:'solid',layer:env.layer(),points:r0>0?[polar(c,r0,a),polar(c,r1,a),polar(c,r1,b),polar(c,r0,b)]:[c,polar(c,r1,a),polar(c,r1,b)]});}
  return list;
 };
 const cmd:Command={name:'DONUT',done:false,
  prompt:()=>step==='inner'?`DONUT Specify inside diameter of donut <${env.length(inner)}>:`:step==='outer'?`DONUT Specify outside diameter of donut <${env.length(outer)}>:`:'DONUT Specify center of donut or <exit>:',
  point(p){if(step==='center')env.store.commit('Donut',{add:ring(p)});},
  text(t){const v=num(t);if(v===undefined||v<0)return false;if(step==='inner'){inner=v;env.vars.DONUTID=v;step='outer';return true;}if(step==='outer'&&v>inner){outer=v;env.vars.DONUTOD=v;step='center';return true;}return false;},
  enter(){if(step==='inner'){step='outer';return;}if(step==='outer'){step='center';return;}cmd.done=true;},
  preview:q=>step==='center'?{ents:ring(q)}:undefined};
 return cmd;
}

export const drawNames:Record<string,string>={
 EL:'ELLIPSE',ELLIPSE:'ELLIPSE',SPL:'SPLINE',SPLINE:'SPLINE',XL:'XLINE',XLINE:'XLINE',RAY:'RAY',POL:'POLYGON',POLYGON:'POLYGON',DO:'DONUT',DONUT:'DONUT',
};
export const drawCommands:Record<string,(env:Env)=>Command>={ARC:arcCmd,ELLIPSE:ellipseCmd,SPLINE:splineCmd,XLINE:xlineCmd,RAY:rayCmd,POLYGON:polygonCmd,DONUT:donutCmd};
